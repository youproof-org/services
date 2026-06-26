"""
convert_articles.py

Converts raw HTML articles 11-27 from raw-data/articles/ into structured YAML
files under data-preprocessing/phase-1/articles/, following conversion-guide.md.

Usage:
    python3 data-preprocessing/phase-1/convert_articles.py [--no-download]
"""

import os
import re
import sys
import glob
import json
import urllib.request
import urllib.error

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.dirname(os.path.dirname(SCRIPT_DIR))

# Import wrap_yaml from repo root
sys.path.insert(0, REPO_ROOT)
import wrap_yaml

# Paths
ARTICLES_OUT = os.path.join(SCRIPT_DIR, "articles")
RAW_ARTICLES = os.path.join(REPO_ROOT, "raw-data", "articles")
SQL_FILE = os.path.join(REPO_ROOT, "youproof_dbdump_20260304.sql")
ENTITY_DIRS = ["definitions", "theorems", "proofs", "remarks"]

DOWNLOAD_IMAGES = True

# Import extract_articles for SQL parsing and slugify
from extract_articles import parse as _parse_sql, unescape_sql  # noqa: F401


# ---------------------------------------------------------------------------
# Hungarian transliteration / slugify (from extract_articles.py)
# ---------------------------------------------------------------------------

HU_MAP = str.maketrans(
    "áéíóöőúüűÁÉÍÓÖŐÚÜŰ",
    "aeiooouuuAEIOOOUUU",
)


def slugify(text):
    s = text.translate(HU_MAP).lower()
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return s


# ---------------------------------------------------------------------------
# Step 1: Build slug → entity type map
# ---------------------------------------------------------------------------

def build_slug_type_map():
    slug_type = {}
    for entity_type in ENTITY_DIRS:
        folder = os.path.join(SCRIPT_DIR, entity_type)
        for fp in glob.glob(os.path.join(folder, "*.yaml")):
            slug = os.path.splitext(os.path.basename(fp))[0]
            # entity_type folder name is pluralised; type is singular
            slug_type[slug] = entity_type.rstrip("s")  # definitions→definition, etc.
    return slug_type


# ---------------------------------------------------------------------------
# Step 2: Parse post titles from SQL dump
# ---------------------------------------------------------------------------

def parse_article_titles():
    """Return {index: post_title} for all 27 Alice articles."""
    print(f"  Reading {SQL_FILE} ...")
    with open(SQL_FILE, "r", encoding="utf-8") as f:
        sql = f.read()
    posts = _parse_sql(sql)
    return {p["index"]: p["title"] for p in posts}


# ---------------------------------------------------------------------------
# Step 3: WP block parser
# ---------------------------------------------------------------------------

BLOCK_RE = re.compile(
    r"<!-- wp:(\w+)(?:\s+(\{.*?\}))?\s*-->(.*?)<!-- /wp:\1 -->",
    re.DOTALL,
)


def parse_wp_blocks(html):
    """Return list of (block_type, attrs_dict, inner_html) tuples."""
    blocks = []
    for m in BLOCK_RE.finditer(html):
        btype = m.group(1)
        attrs_str = m.group(2) or "{}"
        inner = m.group(3).strip()
        try:
            attrs = json.loads(attrs_str)
        except Exception:
            attrs = {}
        blocks.append((btype, attrs, inner))
    return blocks


# ---------------------------------------------------------------------------
# Step 4: Inline content converter
# ---------------------------------------------------------------------------

def convert_inline(html, slug_type_map=None):
    """Convert inner HTML to YAML markdown text."""
    # Remove paragraph wrapper
    html = re.sub(r"^<p[^>]*>", "", html.strip())
    html = re.sub(r"</p>\s*$", "", html)

    # <a href="...">text</a> → text (strip links first so adjacent bold spans can merge)
    html = re.sub(r"<a\b[^>]*>(.*?)</a>", r"\1", html, flags=re.DOTALL)

    # Merge adjacent bold+italic spans that were split only by a link wrapper.
    # Remove the closing+opening tag boundary; existing whitespace in text provides spacing.
    html = re.sub(r"</em>\s*</strong>\s*<strong>\s*<em>", "", html)
    html = re.sub(r"</em>\s*</strong>\s*<em>\s*<strong>", "", html)
    # Merge adjacent <strong> spans and adjacent <em> spans
    html = re.sub(r"</strong>\s*<strong>", "", html)
    html = re.sub(r"</em>\s*<em>", "", html)

    # yp_element type="link" shortcodes → [slug] (handles with or without self-closing /)
    html = re.sub(
        r'\[yp_element\b[^\]]*\bslug="([^"]+)"[^\]]*\btype="link"[^\]]*?/?\]',
        r'[\1]',
        html,
    )

    # Inline latex shortcodes → $...$
    def inline_latex(m):
        body = m.group(1)
        body = body.replace("&amp;", "&")
        return f"${body}$"

    html = re.sub(r"\[latex\](.*?)\[/latex\]", inline_latex, html, flags=re.DOTALL)

    # <br> → newline
    html = re.sub(r"<br\s*/?>", "\n", html)

    # <strong><em> / <em><strong> combinations → ***...***
    html = re.sub(
        r"<strong>\s*<em>(.*?)</em>\s*</strong>",
        r"***\1***",
        html,
        flags=re.DOTALL,
    )
    html = re.sub(
        r"<em>\s*<strong>(.*?)</strong>\s*</em>",
        r"***\1***",
        html,
        flags=re.DOTALL,
    )

    # <strong> → **...**
    html = re.sub(r"<strong>(.*?)</strong>", r"**\1**", html, flags=re.DOTALL)

    # <em> → plain text (strip tags, keep content)
    html = re.sub(r"<em>(.*?)</em>", r"\1", html, flags=re.DOTALL)

    # <sup>text</sup> → ^text^
    html = re.sub(r"<sup>(.*?)</sup>", r"^\1^", html, flags=re.DOTALL)

    # HTML entities (preserve &ndash; as-is)
    html = html.replace("\u2013", "&ndash;")   # U+2013 en-dash → &ndash;
    html = html.replace("&nbsp;", " ")
    html = html.replace("&amp;", "&")
    html = html.replace("&lt;", "<")
    html = html.replace("&gt;", ">")
    # Keep &ndash; as literal &ndash;

    # Hungarian typographic quotes → straight double quotes
    html = html.replace("\u201e", '"')   # „
    html = html.replace("\u201c", '"')   # "
    html = html.replace("\u201d", '"')   # "

    # Strip remaining HTML tags
    html = re.sub(r"<[^>]+>", "", html)

    return html.strip()


# ---------------------------------------------------------------------------
# Shortcode parsers
# ---------------------------------------------------------------------------

EMBED_RECALL_RE = re.compile(
    r'\[yp_element\s+slug="([^"]+)"((?:\s+[a-z_]+="[^"]*")*)\s*/\]'
)


def classify_shortcode(inner, slug_type_map):
    """Parse a wp:shortcode inner and return a block dict or None."""
    inner = inner.strip()

    # Display latex formula
    m = re.match(
        r'\[latex\s+display="true"\](.*?)\[/latex\]', inner, re.DOTALL
    )
    if m:
        body = m.group(1)
        body = body.replace("&amp;", "&")
        return {"type": "formula", "content": body.strip()}

    # yp_element shortcode
    m = EMBED_RECALL_RE.match(inner)
    if m:
        slug = m.group(1)
        attrs_str = m.group(2)
        entity_type = slug_type_map.get(slug, "unknown")
        target = {"type": entity_type, "name": slug}

        if 'type="recall-collapsed"' in attrs_str:
            return {"type": "recall", "target": target}
        elif 'type="link"' in attrs_str:
            # Link shortcodes in article body (outside narrative) — treat as narrative
            return None
        else:
            # embed: show_title="true" or bare or show_link_to_article etc.
            return {"type": "embed", "target": target}

    return {"type": "unknown", "content": inner}


# ---------------------------------------------------------------------------
# Figure handler
# ---------------------------------------------------------------------------

def convert_latex_shortcodes(text):
    """Convert [latex]...[/latex] shortcodes to $...$ in plain text (non-HTML)."""
    def repl(m):
        body = m.group(1).replace("&amp;", "&")
        return f"${body}$"
    return re.sub(r"\[latex\](.*?)\[/latex\]", repl, text)


def parse_figure(inner):
    """Extract src URL, alt, caption from a wp:image inner HTML."""
    src_m = re.search(r'<img\s[^>]*src="([^"]+)"', inner)
    alt_m = re.search(r'<img\s[^>]*alt="([^"]*)"', inner)
    cap_m = re.search(r"<figcaption>(.*?)</figcaption>", inner, re.DOTALL)

    src_url = src_m.group(1) if src_m else ""
    alt = alt_m.group(1) if alt_m else ""
    caption_raw = cap_m.group(1) if cap_m else ""
    # Convert latex shortcodes then strip remaining HTML tags
    caption_raw = convert_latex_shortcodes(caption_raw)
    caption = re.sub(r"<[^>]+>", "", caption_raw).strip()
    # Also convert alt
    alt = convert_latex_shortcodes(alt)

    if not alt:
        alt = caption

    return src_url, alt, caption


def figure_filename(alt_text, fig_counter, src_url):
    """Generate sequential figure filename."""
    words = alt_text.split()[:5]
    desc = slugify(" ".join(words))
    ext = os.path.splitext(src_url)[1].lower() or ".jpg"
    if ext not in (".jpg", ".jpeg", ".png", ".gif", ".webp"):
        ext = ".jpg"
    return f"{fig_counter:02d}-{desc}{ext}"


def download_figure(src_url, dst_path):
    """Download src_url to dst_path. Skip if already exists."""
    if os.path.exists(dst_path):
        return True
    try:
        req = urllib.request.Request(src_url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = resp.read()
        os.makedirs(os.path.dirname(dst_path), exist_ok=True)
        with open(dst_path, "wb") as f:
            f.write(data)
        return True
    except Exception as e:
        print(f"    WARNING: failed to download {src_url}: {e}")
        return False


# ---------------------------------------------------------------------------
# Epilogue detection
# ---------------------------------------------------------------------------

def is_epilogue_para(inner_html):
    """Return True if the paragraph is entirely wrapped in <strong><em>.</em></strong>."""
    s = inner_html.strip()
    s = re.sub(r"^<p[^>]*>", "", s)
    s = re.sub(r"</p>\s*$", "", s).strip()
    return s.startswith("<strong><em>") and s.endswith("</em></strong>")


# ---------------------------------------------------------------------------
# Lead-in rule
# ---------------------------------------------------------------------------

LEAD_IN_TARGETS = {"figure", "formula", "unordered-list", "ordered-list"}


def split_last_sentence(text):
    """Split text into (body, last_sentence) at the last sentence boundary.

    Returns (None, text) if no split point found (entire text is the lead-in).
    """
    text = text.rstrip()
    # Find all '. ' or '.\n' positions (sentence boundaries)
    positions = []
    for m in re.finditer(r"\.\s", text):
        positions.append(m.end())

    if not positions:
        return None, text

    last_pos = positions[-1]
    rest = text[:last_pos].rstrip()
    lead_in = text[last_pos:].strip()
    return rest, lead_in


def apply_lead_in_rule(blocks):
    """Apply the lead-in rule to a list of converted blocks.

    If a narrative block ends with ':' and is immediately followed by a
    figure/formula/list block, split the last sentence of the narrative
    into a 'lead-in' field on the following block.
    """
    result = []
    i = 0
    while i < len(blocks):
        block = blocks[i]
        if (
            i + 1 < len(blocks)
            and block.get("type") == "narrative"
            and blocks[i + 1].get("type") in LEAD_IN_TARGETS
        ):
            text = block["content"].rstrip()
            if text.endswith(":"):
                rest, lead_in = split_last_sentence(text)
                if rest:
                    result.append({"type": "narrative", "content": rest})
                # Attach lead-in to next block
                next_block = dict(blocks[i + 1])
                next_block["lead-in"] = lead_in
                result.append(next_block)
                i += 2
                continue
        result.append(block)
        i += 1
    return result


# ---------------------------------------------------------------------------
# List block converter
# ---------------------------------------------------------------------------

def convert_list(inner, slug_type_map):
    """Convert <ul>/<ol> HTML to list of inline-converted item strings."""
    items = []
    for m in re.finditer(r"<li>(.*?)</li>", inner, re.DOTALL):
        item_html = m.group(1).strip()
        item_text = convert_inline("<p>" + item_html + "</p>", slug_type_map)
        items.append(item_text)
    return items


# ---------------------------------------------------------------------------
# Typewriter block converter
# ---------------------------------------------------------------------------

def convert_typewriter(inner):
    """Convert typewriter paragraph inner HTML to rows."""
    # Strip paragraph wrapper
    inner = re.sub(r"^<p[^>]*>", "", inner.strip())
    inner = re.sub(r"</p>\s*$", "", inner).strip()
    # Split on <br>
    parts = re.split(r"<br\s*/?>", inner)
    rows = []
    for part in parts:
        part = part.replace("&nbsp;", " ")
        part = re.sub(r"<u>(.*?)</u>", r"_\1_", part)
        part = re.sub(r"<[^>]+>", "", part)
        rows.append(part)
    return rows


# ---------------------------------------------------------------------------
# Block classifier / state machine
# ---------------------------------------------------------------------------

def classify_blocks(blocks, slug_type_map, article_dir, fig_counter_ref):
    """Convert a list of raw WP blocks into a structured article dict.

    Returns: {
        'abstract': [...],
        'prerequisite-warning': [...] or None,
        'prologue': [...],
        'sections': [{'title': ..., 'slug': ..., 'body': [...]}, ...],
        'epilogue': [...],
    }
    """
    abstract = []
    prereq = []
    prologue = []
    sections = []
    current_section = None

    STATE_ABSTRACT = "abstract"
    STATE_PREREQ = "prereq"
    STATE_PROLOGUE = "prologue"
    STATE_SECTION = "section"

    state = STATE_ABSTRACT
    has_prereq = False

    def convert_block(btype, attrs, inner):
        nonlocal fig_counter_ref

        if btype == "paragraph":
            class_name = attrs.get("className", "")
            if "typewriter" in class_name:
                rows = convert_typewriter(inner)
                return {"type": "typewriter", "rows": rows}
            text = convert_inline(inner, slug_type_map)
            return {"type": "narrative", "content": text}

        elif btype == "shortcode":
            result = classify_shortcode(inner.strip(), slug_type_map)
            return result  # may be None for link shortcodes

        elif btype == "image":
            src_url, alt, caption = parse_figure(inner)
            fig_counter_ref[0] += 1
            fname = figure_filename(alt or caption, fig_counter_ref[0], src_url)
            if DOWNLOAD_IMAGES and src_url:
                figures_dir = os.path.join(article_dir, "figures")
                os.makedirs(figures_dir, exist_ok=True)
                dst_path = os.path.join(figures_dir, fname)
                download_figure(src_url, dst_path)
            return {
                "type": "figure",
                "src": fname,
                "alt": alt,
                "caption": caption,
            }

        elif btype == "list":
            items = convert_list(inner, slug_type_map)
            ordered = attrs.get("ordered", False)
            ltype = "ordered-list" if ordered else "unordered-list"
            return {"type": ltype, "items": items}

        elif btype == "html":
            return None  # skip navigation anchors

        else:
            return {"type": "unknown", "content": inner}

    for btype, attrs, inner in blocks:
        # Determine if this block triggers a state transition
        is_prereq_para = (
            btype == "paragraph" and attrs.get("className", "") == "prerequisite-warning"
        )
        is_recall_shortcode = (
            btype == "shortcode"
            and 'type="recall-collapsed"' in inner
        )
        is_dropcap = btype == "paragraph" and attrs.get("dropCap", False)
        is_heading4 = btype == "heading" and attrs.get("level") == 4

        if state == STATE_ABSTRACT:
            if is_prereq_para or is_recall_shortcode:
                state = STATE_PREREQ
                has_prereq = True
            elif is_dropcap:
                state = STATE_PROLOGUE
                converted = convert_block(btype, attrs, inner)
                if converted:
                    prologue.append(converted)
                continue

        if state == STATE_PREREQ:
            if is_dropcap:
                state = STATE_PROLOGUE
                converted = convert_block(btype, attrs, inner)
                if converted:
                    prologue.append(converted)
                continue

        if state == STATE_PROLOGUE:
            if is_heading4:
                state = STATE_SECTION
                heading_text = re.sub(r"<[^>]+>", "", inner).strip()
                current_section = {
                    "title": heading_text,
                    "slug": slugify(heading_text),
                    "body": [],
                }
                sections.append(current_section)
                continue

        if state == STATE_SECTION:
            if is_heading4:
                heading_text = re.sub(r"<[^>]+>", "", inner).strip()
                current_section = {
                    "title": heading_text,
                    "slug": slugify(heading_text),
                    "body": [],
                }
                sections.append(current_section)
                continue

        # Convert the block
        converted = convert_block(btype, attrs, inner)
        if converted is None:
            continue

        if state == STATE_ABSTRACT:
            abstract.append(converted)
        elif state == STATE_PREREQ:
            prereq.append(converted)
        elif state == STATE_PROLOGUE:
            prologue.append(converted)
        elif state == STATE_SECTION:
            if current_section is not None:
                current_section["body"].append(converted)

    # Detect and extract epilogue from end of last section
    epilogue = []
    if sections:
        last_body = sections[-1]["body"]
        # Walk backwards and collect trailing epilogue paragraphs
        epi_start = len(last_body)
        for i in range(len(last_body) - 1, -1, -1):
            block = last_body[i]
            if block.get("type") == "narrative":
                # Check original: narrative that was entirely bold-italic
                # We check if the content starts with no bold marker (since we stripped em)
                # Better: check against the raw block. We can't do that here.
                # Heuristic: narrative content ending with '...' after a link-text
                # Actually we already converted, so check if it looks like an epilogue
                if _looks_like_epilogue(block["content"]):
                    epi_start = i
                else:
                    break
            else:
                break

        epilogue = last_body[epi_start:]
        sections[-1]["body"] = last_body[:epi_start]

    return {
        "abstract": abstract,
        "prerequisite-warning": prereq if has_prereq else None,
        "prologue": prologue,
        "sections": sections,
        "epilogue": epilogue,
    }


def strip_emphasis_markers(text):
    """Strip all ***...*** and **...** markers from text (plain text for rendering layer)."""
    text = text.replace("***", "").replace("**", "")
    return text.strip()


def strip_bold_italic_from_narratives(blocks):
    """Strip bold/italic markers from narrative content in a list of blocks."""
    result = []
    for block in blocks:
        if block.get("type") == "narrative":
            block = dict(block)
            block["content"] = strip_emphasis_markers(block["content"])
        result.append(block)
    return result


def _looks_like_epilogue(text):
    """Heuristic: epilogue narratives typically start with 'Ebben' or 'A következő'."""
    stripped = text.strip()
    return (
        stripped.startswith("Ebben a részben")
        or stripped.startswith("A következő részben")
        or stripped.startswith("A következő részt")
        or stripped.startswith("A sorozat")
    )


# ---------------------------------------------------------------------------
# Re-classify epilogue properly (using raw blocks)
# ---------------------------------------------------------------------------

def classify_blocks_v2(blocks, slug_type_map, article_dir, fig_counter_ref):
    """Two-pass approach: first identify epilogue in raw blocks, then convert."""

    # Find epilogue start index (raw blocks at end of last section that are
    # wp:paragraph with entire <strong><em> content)
    last_para_run = []
    for i in range(len(blocks) - 1, -1, -1):
        btype, attrs, inner = blocks[i]
        if btype == "paragraph" and not attrs.get("dropCap") and not attrs.get("className"):
            if is_epilogue_para(inner):
                last_para_run.insert(0, i)
            else:
                break
        else:
            break

    epilogue_start_raw = last_para_run[0] if last_para_run else len(blocks)

    # Now process blocks with epilogue awareness
    abstract = []
    prereq = []
    prologue = []
    sections = []
    epilogue_blocks = []
    current_section = None

    STATE_ABSTRACT = "abstract"
    STATE_PREREQ = "prereq"
    STATE_PROLOGUE = "prologue"
    STATE_SECTION = "section"

    state = STATE_ABSTRACT
    has_prereq = False

    def convert_block(btype, attrs, inner, idx):
        if idx >= epilogue_start_raw and state == STATE_SECTION:
            # This is an epilogue block
            text = convert_inline(inner, slug_type_map)
            return ("epilogue", {"type": "narrative", "content": text})

        if btype == "paragraph":
            class_name = attrs.get("className", "")
            if "typewriter" in class_name:
                rows = convert_typewriter(inner)
                return ("block", {"type": "typewriter", "rows": rows})
            text = convert_inline(inner, slug_type_map)
            return ("block", {"type": "narrative", "content": text})

        elif btype == "shortcode":
            result = classify_shortcode(inner.strip(), slug_type_map)
            if result is None:
                return ("skip", None)
            return ("block", result)

        elif btype == "image":
            src_url, alt, caption = parse_figure(inner)
            fig_counter_ref[0] += 1
            fname = figure_filename(alt or caption, fig_counter_ref[0], src_url)
            if DOWNLOAD_IMAGES and src_url:
                figures_dir = os.path.join(article_dir, "figures")
                os.makedirs(figures_dir, exist_ok=True)
                dst_path = os.path.join(figures_dir, fname)
                download_figure(src_url, dst_path)
            return ("block", {
                "type": "figure",
                "src": fname,
                "alt": alt,
                "caption": caption,
            })

        elif btype == "list":
            items = convert_list(inner, slug_type_map)
            ordered = attrs.get("ordered", False)
            ltype = "ordered-list" if ordered else "unordered-list"
            return ("block", {"type": ltype, "items": items})

        elif btype == "html":
            return ("skip", None)

        else:
            return ("block", {"type": "unknown", "content": inner})

    for idx, (btype, attrs, inner) in enumerate(blocks):
        is_prereq_para = (
            btype == "paragraph" and attrs.get("className", "") == "prerequisite-warning"
        )
        is_recall_shortcode = (
            btype == "shortcode"
            and 'type="recall-collapsed"' in inner
        )
        is_dropcap = btype == "paragraph" and attrs.get("dropCap", False)
        is_heading4 = btype == "heading" and attrs.get("level") == 4

        # State transitions
        if state == STATE_ABSTRACT:
            if is_prereq_para or is_recall_shortcode:
                state = STATE_PREREQ
                has_prereq = True
            elif is_dropcap:
                state = STATE_PROLOGUE
                kind, converted = convert_block(btype, attrs, inner, idx)
                if kind == "block" and converted:
                    prologue.append(converted)
                continue

        if state == STATE_PREREQ:
            if is_dropcap:
                state = STATE_PROLOGUE
                kind, converted = convert_block(btype, attrs, inner, idx)
                if kind == "block" and converted:
                    prologue.append(converted)
                continue

        if state == STATE_PROLOGUE:
            if is_heading4:
                state = STATE_SECTION
                heading_text = re.sub(r"<[^>]+>", "", inner).strip()
                current_section = {
                    "title": heading_text,
                    "slug": slugify(heading_text),
                    "body": [],
                }
                sections.append(current_section)
                continue

        if state == STATE_SECTION:
            if is_heading4:
                heading_text = re.sub(r"<[^>]+>", "", inner).strip()
                current_section = {
                    "title": heading_text,
                    "slug": slugify(heading_text),
                    "body": [],
                }
                sections.append(current_section)
                continue

        # Convert the block
        kind, converted = convert_block(btype, attrs, inner, idx)
        if kind == "skip" or converted is None:
            continue

        if kind == "epilogue":
            content = converted.get("content", "")
            if "következő részt" in content and "találod" in content:
                continue  # skip "A következő részt itt találod..." block
            epilogue_blocks.append(converted)
        elif state == STATE_ABSTRACT:
            abstract.append(converted)
        elif state == STATE_PREREQ:
            prereq.append(converted)
        elif state == STATE_PROLOGUE:
            prologue.append(converted)
        elif state == STATE_SECTION:
            if current_section is not None:
                current_section["body"].append(converted)

    return {
        "abstract": abstract,
        "prerequisite-warning": prereq if has_prereq else None,
        "prologue": prologue,
        "sections": sections,
        "epilogue": epilogue_blocks,
    }


# ---------------------------------------------------------------------------
# YAML Serializer
# ---------------------------------------------------------------------------

def yaml_scalar(value):
    """Return a YAML-safe representation of a plain string scalar value.

    Uses single-quoted style (backslash is literal — good for LaTeX).
    Single quotes within the value are escaped by doubling.
    Quoting is applied when the value contains YAML-special characters.
    """
    if not value:
        return '""'

    needs_quoting = (
        value[0] in '[{*|>!@`%'
        or ': ' in value
        or value.startswith('- ')
        or value in ('true', 'false', 'null', 'yes', 'no')
        or value[-1] == ':'
        or '\\' in value
    )

    if not needs_quoting:
        return value

    # Single-quoted style: escape ' by doubling it; backslash is literal
    return "'" + value.replace("'", "''") + "'"


def yaml_list_item(item):
    """Return a YAML-safe quoted string for a list item.

    Always quotes (items may contain special chars). Uses single-quoted style
    so LaTeX backslashes are preserved literally.
    """
    return "'" + item.replace("'", "''") + "'"


def render_block_scalar(text, indent):
    """Render a block scalar (|) value. Returns list of lines (without the '|' header)."""
    pad = " " * indent
    lines = []
    for line in text.split("\n"):
        if line.strip():
            lines.append(pad + line)
        else:
            lines.append("")
    return lines


def render_content_block(block, base_indent=2):
    """Render a single content block as YAML lines."""
    pad = " " * base_indent
    field_pad = " " * (base_indent + 2)
    content_pad = " " * (base_indent + 4)
    lines = []
    t = block["type"]

    if t == "narrative":
        lines.append(f"{pad}- type: narrative")
        lines.append(f"{field_pad}content: |")
        lines.extend(render_block_scalar(block["content"], base_indent + 4))

    elif t == "figure":
        lines.append(f"{pad}- type: figure")
        if "lead-in" in block:
            lines.append(f"{field_pad}lead-in: |")
            lines.extend(render_block_scalar(block["lead-in"], base_indent + 4))
        lines.append(f"{field_pad}src: {block['src']}")
        lines.append(f"{field_pad}alt: {yaml_scalar(block['alt'])}")
        lines.append(f"{field_pad}caption: {yaml_scalar(block['caption'])}")

    elif t == "formula":
        lines.append(f"{pad}- type: formula")
        if "lead-in" in block:
            lines.append(f"{field_pad}lead-in: |")
            lines.extend(render_block_scalar(block["lead-in"], base_indent + 4))
        lines.append(f"{field_pad}content: |")
        lines.extend(render_block_scalar(block["content"], base_indent + 4))

    elif t == "embed":
        lines.append(f"{pad}- type: embed")
        lines.append(f"{field_pad}target:")
        lines.append(f"{content_pad}type: {block['target']['type']}")
        lines.append(f"{content_pad}name: {block['target']['name']}")

    elif t == "recall":
        lines.append(f"{pad}- type: recall")
        lines.append(f"{field_pad}target:")
        lines.append(f"{content_pad}type: {block['target']['type']}")
        lines.append(f"{content_pad}name: {block['target']['name']}")

    elif t in ("unordered-list", "ordered-list"):
        lines.append(f"{pad}- type: {t}")
        if "lead-in" in block:
            lines.append(f"{field_pad}lead-in: |")
            lines.extend(render_block_scalar(block["lead-in"], base_indent + 4))
        lines.append(f"{field_pad}items:")
        for item in block["items"]:
            lines.append(f"{content_pad}- {yaml_list_item(item)}")

    elif t == "typewriter":
        lines.append(f"{pad}- type: typewriter")
        if "lead-in" in block:
            lines.append(f"{field_pad}lead-in: |")
            lines.extend(render_block_scalar(block["lead-in"], base_indent + 4))
        lines.append(f"{field_pad}rows:")
        for row in block["rows"]:
            lines.append(f"{content_pad}- {yaml_list_item(row)}")

    elif t == "unknown":
        lines.append(f"{pad}- type: unknown")
        lines.append(f"{field_pad}content: |")
        lines.extend(render_block_scalar(block["content"], base_indent + 4))

    return lines


def render_content_list(blocks, base_indent=2):
    """Render a list of content blocks to YAML lines."""
    lines = []
    for block in blocks:
        lines.extend(render_content_block(block, base_indent))
    return lines


# ---------------------------------------------------------------------------
# Reference collection
# ---------------------------------------------------------------------------

# Matches [slug] bracket references in narrative/lead-in text
_BRACKET_REF_RE = re.compile(r"\[([a-z][a-z0-9\-]*)\]")


def collect_refs_from_text(text, slug_type_map, refs):
    """Scan text for [slug] references and add found ones to refs dict."""
    for m in _BRACKET_REF_RE.finditer(text):
        slug = m.group(1)
        if slug in slug_type_map:
            refs[slug] = {"target": {"type": slug_type_map[slug], "name": slug}}


def collect_references(blocks, slug_type_map):
    """Return a sorted references dict for all [slug] refs in a list of blocks."""
    refs = {}
    for block in blocks:
        if block.get("type") == "narrative":
            collect_refs_from_text(block.get("content", ""), slug_type_map, refs)
        if "lead-in" in block:
            collect_refs_from_text(block["lead-in"], slug_type_map, refs)
    return dict(sorted(refs.items()))


def render_references(refs):
    """Render a references: field as YAML lines (empty if no refs)."""
    if not refs:
        return []
    lines = ["references:"]
    for key in sorted(refs):
        val = refs[key]
        lines.append(f"  {key}:")
        lines.append(f"    target:")
        lines.append(f"      type: {val['target']['type']}")
        lines.append(f"      name: {val['target']['name']}")
    return lines


def serialize_chapter(article_name, title, article_data, section_slugs, slug_type_map):
    """Serialize chapter YAML."""
    # Collect references from all chapter-level content (not sections)
    chapter_blocks = (
        (article_data.get("abstract") or [])
        + (article_data.get("prerequisite-warning") or [])
        + (article_data.get("prologue") or [])
        + (article_data.get("epilogue") or [])
    )
    refs = collect_references(chapter_blocks, slug_type_map)

    lines = [
        f"type: chapter",
        f"name: {article_name}",
        f"title: {yaml_scalar(title)}",
    ]
    ref_lines = render_references(refs)
    if ref_lines:
        lines.append("")
        lines.extend(ref_lines)

    lines.append("")
    lines.append("abstract:")
    lines.extend(render_content_list(article_data["abstract"]))

    prereq = article_data.get("prerequisite-warning")
    if prereq is not None:
        lines.append("")
        lines.append("prerequisite-warning:")
        lines.extend(render_content_list(prereq))

    lines.append("")
    lines.append("prologue:")
    lines.extend(render_content_list(article_data["prologue"]))

    lines.append("")
    lines.append("sections:")
    for sec in section_slugs:
        lines.append(f"  - {sec}")

    lines.append("")
    lines.append("epilogue:")
    lines.extend(render_content_list(article_data["epilogue"]))

    return "\n".join(lines) + "\n"


def serialize_section(section_name, title, body_blocks, slug_type_map):
    """Serialize section YAML."""
    refs = collect_references(body_blocks, slug_type_map)

    lines = [
        f"type: section",
        f"name: {section_name}",
        f"title: {yaml_scalar(title)}",
    ]
    ref_lines = render_references(refs)
    if ref_lines:
        lines.append("")
        lines.extend(ref_lines)

    lines.append("")
    lines.append("body:")
    lines.extend(render_content_list(body_blocks))
    return "\n".join(lines) + "\n"


# ---------------------------------------------------------------------------
# Main conversion
# ---------------------------------------------------------------------------

def convert_article(raw_html_path, article_index, article_title, slug_type_map):
    """Convert one article's HTML to YAML."""
    # Determine slugs
    article_slug = os.path.splitext(os.path.basename(raw_html_path))[0]
    article_name = article_slug  # e.g. "11-alice-es-bob-szamelmeletet-epit"

    print(f"\n[{article_index:02d}] {article_title}")

    # Read raw HTML
    with open(raw_html_path, "r", encoding="utf-8") as f:
        html = f.read()

    # Parse WP blocks
    wp_blocks = parse_wp_blocks(html)
    print(f"  Parsed {len(wp_blocks)} WP blocks")

    # Output dirs
    article_dir = os.path.join(ARTICLES_OUT, article_name)
    os.makedirs(article_dir, exist_ok=True)

    # Figure counter (mutable via list)
    fig_counter = [0]

    # Classify and convert
    article_data = classify_blocks_v2(
        wp_blocks, slug_type_map, article_dir, fig_counter
    )

    # Apply lead-in rule to each content list
    article_data["abstract"] = apply_lead_in_rule(article_data["abstract"])
    article_data["prologue"] = apply_lead_in_rule(article_data["prologue"])
    article_data["epilogue"] = apply_lead_in_rule(article_data["epilogue"])

    # Strip full-block ***...*** from abstract and epilogue narratives
    article_data["abstract"] = strip_bold_italic_from_narratives(article_data["abstract"])
    article_data["epilogue"] = strip_bold_italic_from_narratives(article_data["epilogue"])
    if article_data.get("prerequisite-warning"):
        article_data["prerequisite-warning"] = apply_lead_in_rule(
            article_data["prerequisite-warning"]
        )
    for sec in article_data["sections"]:
        sec["body"] = apply_lead_in_rule(sec["body"])

    # Assign section names (zero-padded index within article)
    section_slugs = []
    written_files = []

    for sec_idx, sec in enumerate(article_data["sections"], 1):
        sec_name = f"{sec_idx:02d}-{sec['slug']}"
        section_slugs.append(sec_name)

        sec_yaml = serialize_section(sec_name, sec["title"], sec["body"], slug_type_map)
        sec_path = os.path.join(article_dir, f"{sec_name}.yaml")
        with open(sec_path, "w", encoding="utf-8") as f:
            f.write(sec_yaml)
        written_files.append(sec_path)
        print(f"    Written: {sec_name}.yaml")

    # Write chapter YAML
    chapter_yaml = serialize_chapter(
        article_name, article_title, article_data, section_slugs, slug_type_map
    )
    chapter_path = os.path.join(ARTICLES_OUT, f"{article_name}.yaml")
    with open(chapter_path, "w", encoding="utf-8") as f:
        f.write(chapter_yaml)
    written_files.append(chapter_path)
    print(f"  Written: {article_name}.yaml")

    # Re-wrap all written files
    for fp in written_files:
        wrap_yaml.process_file(fp)

    print(
        f"  {len(article_data['sections'])} sections, "
        f"{fig_counter[0]} figures"
    )
    return written_files


def main():
    global DOWNLOAD_IMAGES
    if "--no-download" in sys.argv:
        DOWNLOAD_IMAGES = False
        print("Image download disabled.")

    print("Building slug→type map ...")
    slug_type_map = build_slug_type_map()
    print(f"  {len(slug_type_map)} entities indexed")

    print("\nParsing article titles from SQL dump ...")
    titles = parse_article_titles()
    print(f"  Found titles for indices: {sorted(titles.keys())}")

    # Find raw HTML files for articles 11-27
    raw_files = sorted(glob.glob(os.path.join(RAW_ARTICLES, "*.html")))
    target_files = [
        f for f in raw_files
        if re.match(r".*(1[1-9]|2[0-7])-", os.path.basename(f))
    ]

    print(f"\nConverting {len(target_files)} articles ...")
    all_written = []

    for raw_path in target_files:
        basename = os.path.basename(raw_path)
        idx_m = re.match(r"(\d+)-", basename)
        if not idx_m:
            continue
        idx = int(idx_m.group(1))
        title = titles.get(idx, f"Article {idx}")
        written = convert_article(raw_path, idx, title, slug_type_map)
        all_written.extend(written)

    print(f"\nDone — {len(all_written)} YAML files written.")

    # Verify: count YAML parse errors
    import yaml
    errors = []
    for fp in all_written:
        try:
            yaml.safe_load(open(fp, encoding="utf-8"))
        except Exception as e:
            errors.append((fp, str(e)))
    if errors:
        print(f"\nYAML ERRORS ({len(errors)}):")
        for fp, err in errors:
            print(f"  {fp}: {err}")
    else:
        print(f"All {len(all_written)} files parse cleanly as YAML.")


if __name__ == "__main__":
    main()
