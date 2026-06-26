#!/usr/bin/env python3
"""
convert_math_entities.py

Converts raw-data/{definitions,theorems,proofs,remarks}/*.html files to
data-preprocessing/phase-1/{type}s/*.yaml structured YAML files.

Run from the repo root:
    python3 data-preprocessing/phase-1/convert_math_entities.py
"""

import glob
import os
import re
import textwrap
import urllib.request
from collections import defaultdict

SQL_DUMP = 'youproof_dbdump_20260304.sql'

FOLDERS = {
    'definition': ('raw-data/definitions',  'data-preprocessing/phase-1/definitions'),
    'theorem':    ('raw-data/theorems',      'data-preprocessing/phase-1/theorems'),
    'proof':      ('raw-data/proofs',        'data-preprocessing/phase-1/proofs'),
    'remark':     ('raw-data/remarks',       'data-preprocessing/phase-1/remarks'),
}


# ---------------------------------------------------------------------------
# Phase 1: Parse SQL dump (adapted from enrich_from_db.py)
# ---------------------------------------------------------------------------

def parse_sql(path):
    print('Parsing SQL dump...', flush=True)
    with open(path, encoding='utf-8') as f:
        content = f.read()

    # ---- wp_posts: post_id -> {slug, type} ----
    id_to_slug = {}   # post_id -> slug
    id_to_type = {}   # post_id -> type
    slug_to_id = {}   # slug -> post_id

    tail_re = re.compile(
        r"'([a-z0-9\-]+)','','','(\d{4}-[^']+)','(\d{4}-[^']+)','',\d+,'[^']+',\d+,"
        r"'(theorem|definition|proof|remark|post)','[^']*',-?\d+\)"
    )
    for m in tail_re.finditer(content):
        slug  = m.group(1)
        ptype = m.group(4)
        if not slug:
            continue
        row_start = content.rfind('\n(', 0, m.start())
        if row_start < 0:
            continue
        prefix = content[row_start + 1: m.start()]
        id_m = re.match(r'\((\d+),', prefix)
        if not id_m:
            continue
        post_id = int(id_m.group(1))
        id_to_slug[post_id] = slug
        id_to_type[post_id] = ptype
        slug_to_id[slug]    = post_id

    print(f'  wp_posts: {len(slug_to_id)} records', flush=True)

    # ---- wp_terms: term_id -> source_post_id ("associations-of-{id}") ----
    terms_idx   = content.find("INSERT INTO `wp_terms`")
    terms_end   = content.find("INSERT INTO `", terms_idx + 50)
    terms_block = content[terms_idx:terms_end]
    assoc_terms = {}   # term_id -> source_post_id
    for m in re.finditer(r"\((\d+),'[^']*','associations-of-(\d+)'", terms_block):
        assoc_terms[int(m.group(1))] = int(m.group(2))

    # ---- wp_term_taxonomy ----
    tt_idx   = content.find("INSERT INTO `wp_term_taxonomy`")
    tt_end   = content.find("INSERT INTO `", tt_idx + 50)
    tt_block = content[tt_idx:tt_end]
    term_taxonomy = {}   # ttid -> (term_id, taxonomy)
    for m in re.finditer(
        r"\((\d+),(\d+),'(yp_proven_by|yp_remarked_by)'",
        tt_block
    ):
        term_taxonomy[int(m.group(1))] = (int(m.group(2)), m.group(3))

    # ---- wp_term_relationships ----
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

    proven_by_ttids   = {ttid: tid for ttid, (tid, tax) in term_taxonomy.items()
                         if tax == 'yp_proven_by'}
    remarked_by_ttids = {ttid: tid for ttid, (tid, tax) in term_taxonomy.items()
                         if tax == 'yp_remarked_by'}

    # ---- Build proof->theorem and remark->entity maps ----
    theorem_to_proofs = defaultdict(list)  # theorem_post_id -> [proof_post_id]
    entity_to_remarks = defaultdict(list)  # entity_post_id  -> [remark_post_id]

    for obj_id, rels in relationships.items():
        for ttid, order in rels:
            if ttid in proven_by_ttids:
                term_id    = proven_by_ttids[ttid]
                theorem_id = assoc_terms.get(term_id)
                if theorem_id and obj_id != theorem_id:
                    theorem_to_proofs[theorem_id].append(obj_id)
            elif ttid in remarked_by_ttids:
                term_id   = remarked_by_ttids[ttid]
                entity_id = assoc_terms.get(term_id)
                if entity_id and obj_id != entity_id:
                    entity_to_remarks[entity_id].append(obj_id)

    # Convert to slug-keyed maps
    theorem_slug_to_proof_slugs = {}
    for thm_id, proof_ids in theorem_to_proofs.items():
        thm_slug = id_to_slug.get(thm_id)
        if thm_slug:
            theorem_slug_to_proof_slugs[thm_slug] = [
                id_to_slug[pid] for pid in proof_ids if pid in id_to_slug
            ]

    entity_slug_to_remark_slugs = {}
    for ent_id, rem_ids in entity_to_remarks.items():
        ent_slug = id_to_slug.get(ent_id)
        if ent_slug:
            entity_slug_to_remark_slugs[ent_slug] = [
                id_to_slug[rid] for rid in rem_ids if rid in id_to_slug
            ]

    print(f'  theorem->proofs:  {len(theorem_slug_to_proof_slugs)} theorems with proofs', flush=True)
    print(f'  entity->remarks:  {len(entity_slug_to_remark_slugs)} entities with remarks', flush=True)

    return {
        'theorem_slug_to_proof_slugs': theorem_slug_to_proof_slugs,
        'entity_slug_to_remark_slugs': entity_slug_to_remark_slugs,
    }


# ---------------------------------------------------------------------------
# Phase 2: HTML content parsing
# ---------------------------------------------------------------------------

WP_BLOCK_RE = re.compile(
    r'<!--\s*wp:(\S+?)((?:\s[^>]*)?)\s*-->(.*?)<!--\s*/wp:\1\s*-->',
    re.DOTALL
)


def parse_wp_blocks(html_content):
    """Extract (block_type, attrs_json, inner_html) triples from WordPress block markup."""
    results = []
    for m in WP_BLOCK_RE.finditer(html_content):
        block_type = m.group(1)    # e.g. 'paragraph', 'shortcode', 'list'
        attrs      = m.group(2)    # e.g. ' {"ordered":true}' or ''
        inner      = m.group(3).strip()
        results.append((block_type, attrs, inner))
    return results


# ---------------------------------------------------------------------------
# Inline text conversion
# ---------------------------------------------------------------------------

def convert_inline(text):
    """Convert HTML inline markup to YAML/markdown notation."""
    # Combined bold+italic (both tag orderings)
    text = re.sub(r'<strong><em>(.*?)</em></strong>', r'***\1***', text, flags=re.DOTALL)
    text = re.sub(r'<em><strong>(.*?)</strong></em>', r'***\1***', text, flags=re.DOTALL)
    # Bold
    text = re.sub(r'<strong>(.*?)</strong>', r'**\1**', text, flags=re.DOTALL)
    # Italic -> plain text (strip markers)
    text = re.sub(r'<em>(.*?)</em>', r'\1', text, flags=re.DOTALL)
    # Links -> text only
    text = re.sub(r'<a\b[^>]*>(.*?)</a>', r'\1', text, flags=re.DOTALL)
    # Superscript
    text = re.sub(r'<sup>(.*?)</sup>', r'^\1^', text, flags=re.DOTALL)
    # <br> -> newline
    text = re.sub(r'<br\s*/?>', '\n', text, flags=re.IGNORECASE)
    # Inline latex: [latex]...[/latex] -> $...$
    # Content may span a line break due to WordPress wrapping; join lines within.
    def inline_latex(m):
        body = m.group(1)
        # Collapse whitespace-only line breaks within inline formula
        body = re.sub(r'\s*\n\s*', '', body)
        return f'${body}$'
    text = re.sub(r'\[latex\](.*?)\[/latex\]', inline_latex, text, flags=re.DOTALL)
    # [yp_element ...] shortcodes: keep verbatim (no transformation)
    # Hungarian typographic quotes
    text = text.replace('„', '"').replace('\u201d', '"')
    # En-dash (U+2013) -> HTML entity
    text = text.replace('\u2013', '&ndash;')
    # HTML entities
    text = text.replace('&amp;', '&')
    text = text.replace('&lt;', '<')
    text = text.replace('&gt;', '>')
    text = text.replace('&nbsp;', ' ')
    # Strip remaining HTML tags (but NOT shortcode brackets)
    text = re.sub(r'<[^>]+>', '', text)
    return text


def convert_narrative_html(html):
    """Strip <p> wrapper and convert inline markup of a paragraph block."""
    html = re.sub(r'^<p[^>]*>', '', html.strip())
    html = re.sub(r'</p>\s*$', '', html)
    return convert_inline(html).strip()


def convert_formula_body(html):
    """Extract LaTeX body from a display [latex display="true"]...[/latex] shortcode."""
    m = re.search(r'\[latex\s+display="true"\](.*?)\[/latex\]', html, re.DOTALL)
    if m:
        body = m.group(1)
        body = body.replace('&amp;', '&')
        body = body.replace('&lt;', '<')
        body = body.replace('&gt;', '>')
        return body.strip()
    # Fallback: return raw content
    return html.strip()


def convert_list_items(html):
    """Extract and convert <li> items from an HTML list block."""
    items = []
    for m in re.finditer(r'<li[^>]*>(.*?)</li>', html, re.DOTALL):
        item_html = m.group(1).strip()
        # Strip nested <p> if present
        item_html = re.sub(r'^<p[^>]*>', '', item_html)
        item_html = re.sub(r'</p>\s*$', '', item_html)
        item_text = convert_inline(item_html).strip()
        if item_text:
            items.append(item_text)
    return items


# ---------------------------------------------------------------------------
# Image block helpers
# ---------------------------------------------------------------------------

_IMG_PREFIX = re.compile(r'^kriptografia_\d+_')


def clean_img_filename(url):
    """Return the basename of an image URL with the kriptografia_{n}_ prefix stripped."""
    basename = url.split('/')[-1]
    return _IMG_PREFIX.sub('', basename)


def download_image(url, dest_path):
    """Download url to dest_path, creating parent dirs as needed. No-op if already exists."""
    if os.path.exists(dest_path):
        return
    os.makedirs(os.path.dirname(dest_path), exist_ok=True)
    urllib.request.urlretrieve(url, dest_path)
    print(f'    downloaded: {os.path.basename(dest_path)}', flush=True)


def convert_image_block(html, figures_dir):
    """Parse a wp:image inner HTML and return a figure block dict (downloading the image)."""
    img_m = re.search(r'<img\b[^>]*\bsrc="([^"]+)"[^>]*\balt="([^"]*)"', html)
    if not img_m:
        img_m = re.search(r'<img\b[^>]*\balt="([^"]*)"[^>]*\bsrc="([^"]+)"', html)
        if img_m:
            alt, src_url = img_m.group(1), img_m.group(2)
        else:
            return None
    else:
        src_url, alt = img_m.group(1), img_m.group(2)

    cleaned = clean_img_filename(src_url)
    download_image(src_url, os.path.join(figures_dir, cleaned))

    cap_m = re.search(r'<figcaption[^>]*>(.*?)</figcaption>', html, re.DOTALL)
    caption = convert_inline(cap_m.group(1).strip()) if cap_m else ''

    block = {'type': 'figure', 'src': cleaned, 'alt': alt}
    if caption:
        block['caption'] = caption
    return block


# ---------------------------------------------------------------------------
# Block-level conversion
# ---------------------------------------------------------------------------

def convert_blocks(wp_blocks, figures_dir):
    """Convert (block_type, attrs, inner_html) triples to YAML block dicts."""
    blocks = []
    for block_type, attrs, inner in wp_blocks:
        if block_type == 'paragraph':
            text = convert_narrative_html(inner)
            if text:
                blocks.append({'type': 'narrative', 'content': text})
        elif block_type == 'shortcode':
            if '[latex display="true"]' in inner:
                body = convert_formula_body(inner)
                blocks.append({'type': 'formula', 'content': body})
            else:
                # Unknown shortcode: preserve raw content
                blocks.append({'type': 'unknown', 'content': inner})
        elif block_type == 'list':
            items = convert_list_items(inner)
            if items:
                is_ordered = '"ordered":true' in attrs.replace(' ', '')
                list_type  = 'ordered-list' if is_ordered else 'unordered-list'
                blocks.append({'type': list_type, 'items': items})
        elif block_type == 'image':
            block = convert_image_block(inner, figures_dir)
            if block:
                blocks.append(block)
            else:
                blocks.append({'type': 'unknown', 'content': inner})
        else:
            # Unknown block type: preserve raw HTML
            blocks.append({'type': 'unknown', 'content': inner})
    return blocks


# ---------------------------------------------------------------------------
# Lead-in extraction (same rule as article sections)
# ---------------------------------------------------------------------------

UPPER_CHARS = 'A-ZÁÉÍÓÖŐÚÜŰ'
SENTENCE_BOUNDARY = re.compile(rf'[.!?]\s+(?=[{UPPER_CHARS}"*\[$\[])')


def split_last_sentence(content_str):
    """
    If content ends with ':', split the last sentence off as a lead-in.
    Returns (remaining_content, lead_in_sentence) or (content, None).
    """
    stripped = content_str.rstrip('\n').rstrip()
    if not stripped.endswith(':'):
        return content_str, None
    flat = ' '.join(line.strip() for line in stripped.split('\n') if line.strip())
    matches = list(SENTENCE_BOUNDARY.finditer(flat))
    if matches:
        last      = matches[-1]
        remaining = flat[:last.end()].rstrip()
        lead_in   = flat[last.end():].strip()
    else:
        remaining = ''
        lead_in   = flat.strip()
    return remaining, lead_in


def apply_lead_in_rule(blocks):
    """
    Apply lead-in extraction:
    If a narrative block immediately precedes a formula or unordered-list block,
    and the narrative ends with ':', move the final sentence to lead-in.
    """
    result = []
    i = 0
    while i < len(blocks):
        block = blocks[i]
        if (block['type'] == 'narrative'
                and i + 1 < len(blocks)
                and blocks[i + 1]['type'] in ('formula', 'unordered-list', 'ordered-list', 'figure')):
            remaining, lead_in = split_last_sentence(block['content'])
            if lead_in:
                next_block = dict(blocks[i + 1])
                next_block['lead-in'] = lead_in
                if remaining:
                    result.append({'type': 'narrative', 'content': remaining})
                result.append(next_block)
                i += 2
                continue
        result.append(block)
        i += 1
    return result


# ---------------------------------------------------------------------------
# YAML serialization
# ---------------------------------------------------------------------------

def emit_block_scalar(lines, text, key, indent):
    """Append a YAML block scalar (key: |) to lines."""
    lines.append(f'{indent}{key}: |')
    for raw_line in text.split('\n'):
        lines.append(f'{indent}  {raw_line}')


def emit_content_block(lines, block, indent='  '):
    """Serialize a single content block dict to YAML lines."""
    btype = block['type']
    lines.append(f'{indent}- type: {btype}')

    if 'lead-in' in block:
        emit_block_scalar(lines, block['lead-in'], 'lead-in', indent + '  ')

    if btype in ('narrative', 'formula', 'unknown'):
        emit_block_scalar(lines, block.get('content', ''), 'content', indent + '  ')
    elif btype == 'figure':
        lines.append(f'{indent}  src: {block["src"]}')
        lines.append(f'{indent}  alt: {block["alt"]}')
        if block.get('caption'):
            lines.append(f'{indent}  caption: {block["caption"]}')
    elif btype in ('unordered-list', 'ordered-list'):
        lines.append(f'{indent}  items:')
        # item_prefix: e.g. "      - "  (indent + 4 spaces + "- ")
        item_prefix = f'{indent}    - '
        # cont_indent: continuation lines align with text after opening quote
        cont_indent = f'{indent}      '
        # avail: usable text width per line = 115 minus prefix minus both quotes
        avail = 115 - len(item_prefix) - 2
        for item in block.get('items', []):
            # Use single-quoted YAML strings (backslashes are literal in single-quoted strings,
            # unlike double-quoted where \l etc. are unknown YAML escapes).
            # Escape embedded single quotes as ''.
            safe = item.replace("'", "''")
            if len(item_prefix) + len(safe) + 2 <= 115:
                lines.append(f"{item_prefix}'{safe}'")
            else:
                parts = textwrap.wrap(safe, width=avail, break_long_words=False,
                                      break_on_hyphens=False)
                if not parts or len(parts) == 1:
                    lines.append(f"{item_prefix}'{safe}'")
                else:
                    lines.append(f"{item_prefix}'{parts[0]}")
                    for part in parts[1:-1]:
                        lines.append(f"{cont_indent}{part}")
                    lines.append(f"{cont_indent}{parts[-1]}'")


def serialize_entity(entity_type, name, proofs, remarks, blocks):
    """Build the full YAML string for one entity."""
    lines = []
    lines.append(f'type: {entity_type}')
    lines.append(f'name: {name}')

    # proofs: only on theorems
    if entity_type == 'theorem':
        if proofs:
            lines.append('proofs:')
            for p in proofs:
                lines.append(f'  - {p}')
        else:
            lines.append('proofs: []')

    # remarks: on definitions, theorems, proofs (not remarks)
    if entity_type in ('definition', 'theorem', 'proof'):
        if remarks:
            lines.append('remarks:')
            for r in remarks:
                lines.append(f'  - {r}')
        else:
            lines.append('remarks: []')

    lines.append('content:')
    for block in blocks:
        emit_content_block(lines, block)

    return '\n'.join(lines) + '\n'


# ---------------------------------------------------------------------------
# Main conversion
# ---------------------------------------------------------------------------

def convert_all(db):
    thm_to_proofs  = db['theorem_slug_to_proof_slugs']
    ent_to_remarks = db['entity_slug_to_remark_slugs']
    counts = {}
    skipped = []

    for entity_type, (src_folder, dst_folder) in FOLDERS.items():
        os.makedirs(dst_folder, exist_ok=True)
        html_files = sorted(glob.glob(f'{src_folder}/*.html'))
        count = 0

        for html_path in html_files:
            slug = os.path.basename(html_path)[:-5]  # strip .html

            with open(html_path, encoding='utf-8') as f:
                html_content = f.read()

            # Parse and convert content
            wp_blocks = parse_wp_blocks(html_content)
            if not wp_blocks:
                skipped.append((entity_type, slug, 'no blocks found'))
                continue
            figures_dir = f'{dst_folder}/{slug}/figures'
            blocks = convert_blocks(wp_blocks, figures_dir)
            blocks = apply_lead_in_rule(blocks)

            # Look up associations
            proofs  = thm_to_proofs.get(slug, [])  if entity_type == 'theorem' else []
            remarks = ent_to_remarks.get(slug, []) if entity_type != 'remark'  else []

            yaml_str  = serialize_entity(entity_type, slug, proofs, remarks, blocks)
            dst_path  = f'{dst_folder}/{slug}.yaml'
            with open(dst_path, 'w', encoding='utf-8') as f:
                f.write(yaml_str)
            count += 1

        counts[entity_type] = count
        print(f'  {entity_type:12}: {count} files written', flush=True)

    if skipped:
        print(f'\n  WARNING — {len(skipped)} files skipped:')
        for etype, s, reason in skipped:
            print(f'    [{etype}] {s}: {reason}')

    return counts


def main():
    print('=== Phase 1: Parse SQL dump ===', flush=True)
    db = parse_sql(SQL_DUMP)

    print('\n=== Phase 2: Convert HTML files ===', flush=True)
    counts = convert_all(db)

    total = sum(counts.values())
    print(f'\n=== DONE — {total} YAML files written ===', flush=True)


if __name__ == '__main__':
    main()
