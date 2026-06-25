#!/usr/bin/env python3
"""
Enrich YAML content database from WordPress SQL dump.

Replaces all content/math/**/*.yaml files with enriched versions:
- Canonical IDs from WP post slugs (no type prefix)
- Correct labels from wp_postmeta (lemma/következmény/állítás)
- Titles from wp_posts.post_title
- Content from HTML extraction (already Markdown+LaTeX)
- proofs: [...] on theorems (reversed from proof.proves)
- remarks: [...] on definitions/theorems/proofs (reversed from remark.attached_to)

Usage:
    python3 enrich_from_db.py [--dry-run]
"""

import re
import os
import sys
import time
from collections import defaultdict

# Reuse from extract.py
from extract import (
    ARTICLES,
    fetch_article,
    extract_elements,
    article_topic,
    type_folder,
)

SQL_DUMP = 'youproof_db_dump_20260304.sql'


# ---------------------------------------------------------------------------
# Phase 1: Parse SQL dump
# ---------------------------------------------------------------------------

def parse_sql(path):
    """Parse the SQL dump and return all data structures needed."""
    print('Parsing SQL dump...', flush=True)
    with open(path, encoding='utf-8') as f:
        content = f.read()

    # ---- wp_posts: id -> {slug, type, title} ----
    # Strategy: match only the fixed columns near the END of each row
    # (post_name through post_type), then scan backwards for the row-opening
    # (ID, ...) to get post_id and post_title.
    # This avoids parsing the variable-length post_content field which may
    # contain escaped single quotes.
    #
    # Row tail pattern (columns 12..21):
    #   slug, to_ping='', pinged='', modified, modified_gmt,
    #   filtered='', parent=0, guid, menu_order=0, post_type
    posts = {}
    tail_re = re.compile(
        r"'([a-z0-9\-]+)','','','(\d{4}-[^']+)','(\d{4}-[^']+)','',\d+,'[^']+',\d+,"
        r"'(theorem|definition|proof|remark|post)','[^']*',-?\d+\)"
    )
    for m in tail_re.finditer(content):
        slug  = m.group(1)
        ptype = m.group(4)
        if not slug:
            continue
        # Scan backwards from match start to find the row's opening (ID,
        row_start = content.rfind('\n(', 0, m.start())
        if row_start < 0:
            continue
        prefix = content[row_start + 1: m.start()]  # everything from '(' to slug
        # Extract post_id: first number after '('
        id_m = re.match(r'\((\d+),', prefix)
        if not id_m:
            continue
        post_id = int(id_m.group(1))
        # Extract title: it's the 6th column (post_title), right after post_excerpt
        # The row structure (simplified): (id,author,date,date_gmt,content,title,excerpt,status,...)
        # The status='publish' is a reliable anchor; title comes just before it
        # Find: ,'title','excerpt','publish'
        title_m = re.search(r",'([^']*?)','[^']*?','publish'", prefix)
        title = title_m.group(1) if title_m else ''
        posts[post_id] = {'slug': slug, 'type': ptype, 'title': title}

    print(f'  wp_posts: {len(posts)} records', flush=True)

    # ---- wp_postmeta: yp_article_index and yp_custom_type_name_lowercase ----
    pm_idx  = content.find("INSERT INTO `wp_postmeta`")
    pm_end  = content.find("INSERT INTO `", pm_idx + 50)
    pm_block = content[pm_idx:pm_end]

    article_index  = {}   # post_id -> article_num (int)
    custom_labels  = {}   # post_id -> label string
    for m in re.finditer(r"\(\d+,(\d+),'yp_article_index','(\d+)'\)", pm_block):
        article_index[int(m.group(1))] = int(m.group(2))
    for m in re.finditer(r"\(\d+,(\d+),'yp_custom_type_name_lowercase','([^']+)'\)", pm_block):
        custom_labels[int(m.group(1))] = m.group(2)

    print(f'  yp_article_index: {len(article_index)} articles', flush=True)
    print(f'  custom_labels: {len(custom_labels)} theorem variants', flush=True)

    # ---- wp_terms: term_id -> source_post_id (from "associations-of-{id}" slugs) ----
    terms_idx   = content.find("INSERT INTO `wp_terms`")
    terms_end   = content.find("INSERT INTO `", terms_idx + 50)
    terms_block = content[terms_idx:terms_end]
    assoc_terms = {}   # term_id -> source_post_id
    for m in re.finditer(r"\((\d+),'[^']*','associations-of-(\d+)'", terms_block):
        assoc_terms[int(m.group(1))] = int(m.group(2))

    # ---- wp_term_taxonomy: ttid -> (term_id, taxonomy) ----
    tt_idx   = content.find("INSERT INTO `wp_term_taxonomy`")
    tt_end   = content.find("INSERT INTO `", tt_idx + 50)
    tt_block = content[tt_idx:tt_end]
    term_taxonomy = {}  # ttid -> (term_id, taxonomy)
    for m in re.finditer(
        r"\((\d+),(\d+),'(yp_proven_by|yp_remarked_by|yp_embeds)'",
        tt_block
    ):
        term_taxonomy[int(m.group(1))] = (int(m.group(2)), m.group(3))

    # ---- wp_term_relationships: object_id -> [(ttid, order)] ----
    tr_idx   = content.find("INSERT INTO `wp_term_relationships`")
    tr_end   = content.find("INSERT INTO `", tr_idx + 50)
    tr_block = content[tr_idx:tr_end]
    relationships = defaultdict(list)
    for m in re.finditer(r"\((\d+),(\d+),(\d+)\)", tr_block):
        obj_id = int(m.group(1))
        ttid   = int(m.group(2))
        order  = int(m.group(3))
        if ttid in term_taxonomy:
            relationships[obj_id].append((ttid, order))

    # ---- Derive association maps ----
    proven_by_ttids   = {ttid: tid for ttid, (tid, tax) in term_taxonomy.items() if tax == 'yp_proven_by'}
    remarked_by_ttids = {ttid: tid for ttid, (tid, tax) in term_taxonomy.items() if tax == 'yp_remarked_by'}
    embeds_ttids      = {ttid: tid for ttid, (tid, tax) in term_taxonomy.items() if tax == 'yp_embeds'}

    proof_to_theorem  = {}   # proof_post_id -> theorem_post_id
    remark_to_entity  = {}   # remark_post_id -> entity_post_id
    article_embeds    = defaultdict(list)  # article_post_id -> [(order, entity_post_id)]

    for obj_id, rels in relationships.items():
        for ttid, order in rels:
            if ttid in proven_by_ttids:
                term_id    = proven_by_ttids[ttid]
                theorem_id = assoc_terms.get(term_id)
                if theorem_id and obj_id != theorem_id:
                    proof_to_theorem[obj_id] = theorem_id
            elif ttid in remarked_by_ttids:
                term_id   = remarked_by_ttids[ttid]
                entity_id = assoc_terms.get(term_id)
                if entity_id and obj_id != entity_id:
                    remark_to_entity[obj_id] = entity_id
            elif ttid in embeds_ttids:
                term_id    = embeds_ttids[ttid]
                article_id = assoc_terms.get(term_id)
                if article_id and obj_id != article_id:
                    article_embeds[article_id].append((order, obj_id))

    # Sort embed lists by order
    for art_id in article_embeds:
        article_embeds[art_id].sort()

    # Invert article_index: article_post_id -> article_num
    post_id_to_article = {pid: idx for pid, idx in article_index.items()}

    # Invert: article_num -> article_post_id (prefer the one with embeds if duplicates)
    article_num_to_post = {}
    for pid, idx in article_index.items():
        if idx not in article_num_to_post or pid in article_embeds:
            article_num_to_post[idx] = pid

    print(f'  proof_to_theorem: {len(proof_to_theorem)} mappings', flush=True)
    print(f'  remark_to_entity: {len(remark_to_entity)} mappings', flush=True)
    print(f'  article_embeds: {len(article_embeds)} articles with entities', flush=True)

    # Invert to parent-owns-children:
    # theorem_to_proofs: theorem_post_id -> [proof_post_ids] (in embed order)
    # entity_to_remarks: entity_post_id -> [remark_post_ids]
    theorem_to_proofs = defaultdict(list)
    for proof_id, thm_id in proof_to_theorem.items():
        theorem_to_proofs[thm_id].append(proof_id)

    entity_to_remarks = defaultdict(list)
    for rem_id, ent_id in remark_to_entity.items():
        entity_to_remarks[ent_id].append(rem_id)

    return {
        'posts':              posts,
        'article_index':      article_index,
        'article_num_to_post': article_num_to_post,
        'custom_labels':      custom_labels,
        'proof_to_theorem':   proof_to_theorem,
        'remark_to_entity':   remark_to_entity,
        'article_embeds':     dict(article_embeds),
        'theorem_to_proofs':  dict(theorem_to_proofs),
        'entity_to_remarks':  dict(entity_to_remarks),
    }


# ---------------------------------------------------------------------------
# Phase 2: Build positional mapping (DB post_id -> HTML element)
# ---------------------------------------------------------------------------

def build_mapping(db, dry_run=False):
    """
    For each article 11-26, fetch HTML and map HTML elements to DB post IDs
    using the yp-element-{post_id} HTML id attribute — direct, order-independent.
    Returns: {db_post_id: html_element_dict}
    """
    posts               = db['posts']
    article_num_to_post = db['article_num_to_post']

    mapping    = {}   # db_post_id -> html_element
    mismatches = []

    for art_num, art_slug in ARTICLES:
        art_post_id = article_num_to_post.get(art_num)
        if art_post_id is None:
            continue
        db_entity_ids = set(eid for (_, eid) in db['article_embeds'].get(art_post_id, []))
        if not db_entity_ids:
            continue

        print(f'\n  Article {art_num} (post {art_post_id}): {len(db_entity_ids)} entities in DB', flush=True)

        if dry_run:
            print(f'    [dry-run] skipping fetch', flush=True)
            continue

        try:
            html = fetch_article(art_slug)
        except Exception as e:
            print(f'    ERROR fetching: {e}', flush=True)
            continue
        time.sleep(0.5)

        html_elements = extract_elements(html)
        print(f'    HTML elements: {len(html_elements)}', flush=True)

        # Map by yp-element-{post_id} HTML id
        matched = 0
        for html_el in html_elements:
            elem_id = html_el.get('element_id', '')
            # element_id is "yp-element-12345"
            m = re.match(r'yp-element-(\d+)', elem_id)
            if not m:
                continue
            db_pid = int(m.group(1))
            if db_pid not in posts:
                print(f'    WARNING: HTML id={elem_id} not in wp_posts', flush=True)
                mismatches.append((art_num, elem_id))
                continue
            # Sanity check: type should match
            db_type   = posts[db_pid].get('type', '?')
            html_type = html_el.get('type', '?')
            if db_type != html_type:
                print(f'    NOTE: type differs for {elem_id}: DB={db_type} HTML={html_type}', flush=True)
            mapping[db_pid] = html_el
            matched += 1

        unmapped_db = db_entity_ids - set(mapping.keys()) & db_entity_ids
        if unmapped_db:
            print(f'    WARNING: {len(unmapped_db)} DB entities not found in HTML: {unmapped_db}', flush=True)
            mismatches.extend(unmapped_db)
        print(f'    Matched: {matched}', flush=True)

    if mismatches:
        print(f'\n  Issues: {mismatches}', flush=True)
    else:
        print(f'\n  All articles mapped cleanly.', flush=True)

    return mapping


# ---------------------------------------------------------------------------
# Phase 3: Generate enriched YAML
# ---------------------------------------------------------------------------

def entity_to_yaml(db_post, article_num, html_el, db):
    """Generate YAML string for a single entity."""
    slug    = db_post['slug']
    ptype   = db_post['type']
    title   = db_post['title']
    post_id = db_post['id']

    custom_labels     = db['custom_labels']
    theorem_to_proofs = db['theorem_to_proofs']
    entity_to_remarks = db['entity_to_remarks']
    posts             = db['posts']

    lines = []
    lines.append(f'id: {slug}')
    lines.append(f'type: {ptype}')

    # label: for theorems
    if ptype == 'theorem':
        label = custom_labels.get(post_id, 'tétel')
        lines.append(f'label: "{label}"')

    # title: for definitions and theorems (not proofs, not remarks)
    if ptype in ('definition', 'theorem') and title:
        safe_title = title.replace('"', '\\"')
        lines.append(f'title: "{safe_title}"')

    lines.append('tags: []')
    lines.append('references: []')

    # proofs: for theorems
    if ptype == 'theorem':
        proof_ids = theorem_to_proofs.get(post_id, [])
        if proof_ids:
            # Order proofs by their embed position
            proof_slugs = [posts[pid]['slug'] for pid in proof_ids if pid in posts]
            lines.append('proofs:')
            for ps in proof_slugs:
                lines.append(f'  - {ps}')

    # remarks: for definitions, theorems, proofs
    if ptype in ('definition', 'theorem', 'proof'):
        remark_ids = entity_to_remarks.get(post_id, [])
        if remark_ids:
            remark_slugs = [posts[rid]['slug'] for rid in remark_ids if rid in posts]
            lines.append('remarks:')
            for rs in remark_slugs:
                lines.append(f'  - {rs}')

    # items
    content = html_el.get('content', '') if html_el else ''

    lines.append('items:')
    lines.append('  - type: content')
    lines.append(f'    id: {slug}-body')

    if ptype != 'proof':
        lines.append('    terms: []')

    lines.append('    content: |')
    for line in content.splitlines():
        lines.append('      ' + line)

    return '\n'.join(lines) + '\n'


def generate_files(db, mapping, dry_run=False):
    """Delete old files and write 502 new enriched YAML files."""
    posts             = db['posts']
    article_embeds    = db['article_embeds']
    article_num_to_post = db['article_num_to_post']

    # Build: db_post_id -> article_num
    post_id_to_art_num = {}
    for art_num, art_post_id in article_num_to_post.items():
        for (_, eid) in db['article_embeds'].get(art_post_id, []):
            post_id_to_art_num[eid] = art_num

    # Delete existing YAML files (except .gitkeep)
    if not dry_run:
        deleted = 0
        for root, dirs, files in os.walk('content/math'):
            for fname in files:
                if fname.endswith('.yaml') and fname != '.gitkeep':
                    os.remove(os.path.join(root, fname))
                    deleted += 1
        print(f'\nDeleted {deleted} old YAML files.', flush=True)

    counts = {'definition': 0, 'theorem': 0, 'proof': 0, 'remark': 0}
    unmapped = []

    for post_id, post in sorted(posts.items(), key=lambda x: x[0]):
        ptype = post['type']
        if ptype not in ('definition', 'theorem', 'proof', 'remark'):
            continue

        art_num = post_id_to_art_num.get(post_id)
        if art_num is None:
            unmapped.append((post_id, post['slug'], ptype))
            continue

        html_el = mapping.get(post_id)

        post['id'] = post_id
        yaml_str = entity_to_yaml(post, art_num, html_el, db)
        slug      = post['slug']
        topic     = article_topic(art_num)
        folder    = type_folder(ptype)
        path      = f'content/math/{topic}/{folder}/{slug}.yaml'

        counts[ptype] = counts.get(ptype, 0) + 1

        if not dry_run:
            os.makedirs(os.path.dirname(path), exist_ok=True)
            with open(path, 'w', encoding='utf-8') as f:
                f.write(yaml_str)
        else:
            print(f'  [{ptype:12}] {slug[:50]}')

    return counts, unmapped


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    dry_run = '--dry-run' in sys.argv

    print('=== Phase 1: Parse SQL dump ===', flush=True)
    db = parse_sql(SQL_DUMP)

    print('\n=== Phase 2: Build positional mapping ===', flush=True)
    mapping = build_mapping(db, dry_run=dry_run)

    print('\n=== Phase 3: Generate enriched YAML files ===', flush=True)
    counts, unmapped = generate_files(db, mapping, dry_run=dry_run)

    print('\n=== REPORT ===', flush=True)
    for t, c in sorted(counts.items()):
        print(f'  {t:12}: {c}')
    print(f'  {"TOTAL":12}: {sum(counts.values())}')

    if unmapped:
        print(f'\n  UNMAPPED entities ({len(unmapped)}):')
        for pid, slug, ptype in unmapped[:20]:
            print(f'    {ptype:12} id={pid} slug={slug}')

    # Label stats
    from collections import Counter
    label_counts = Counter()
    for pid, label in db['custom_labels'].items():
        if db['posts'].get(pid, {}).get('type') == 'theorem':
            label_counts[label] += 1
    print(f'\n  Theorem label distribution:')
    print(f'    tétel        : {189 - sum(label_counts.values())}')
    for label, cnt in sorted(label_counts.items()):
        print(f'    {label:12} : {cnt}')

    # Relationship stats
    thm_with_proofs = sum(1 for v in db['theorem_to_proofs'].values() if v)
    ent_with_remarks = sum(1 for v in db['entity_to_remarks'].values() if v)
    print(f'\n  Theorems with proofs: {thm_with_proofs}')
    print(f'  Entities with remarks: {ent_with_remarks}')


if __name__ == '__main__':
    main()
