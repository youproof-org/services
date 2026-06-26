"""
extract_articles.py

Extracts raw post_content for all 27 "Alice és Bob" article posts from the
WordPress SQL dump and writes them as HTML files into raw-data/articles/.

Filename format: {zero-padded-index}-{kebab-title}.html
  - Index: numeric prefix from post_name  (e.g. "1-alapfogalmak-..." → 01)
  - Kebab title: slugified post_title      (e.g. "Alice és Bob színrelép" → alice-es-bob-szinrelep)
"""

import os
import re

SQL_FILE = "youproof_dbdump_20260304.sql"
OUT_DIR  = "raw-data/articles"

HU_MAP = str.maketrans(
    "áéíóöőúüűÁÉÍÓÖŐÚÜŰ",
    "aeiooouuuAEIOOOUUU",
)

def slugify(title: str) -> str:
    s = title.translate(HU_MAP).lower()
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return s

def unescape_sql(s: str) -> str:
    return (
        s.replace("\\'", "'")
         .replace('\\"', '"')
         .replace("\\n", "\n")
         .replace("\\r", "\r")
         .replace("\\\\", "\\")
    )

def parse(sql: str) -> list[dict]:
    # Row-tail pattern: matches post_name through end of each 'post' row.
    # Avoids parsing the variable-length post_content field.
    # Columns after post_name: to_ping (non-empty), pinged, modified, modified_gmt,
    # content_filtered(''), parent(0), guid, menu_order(0), post_type, mime_type, comment_count
    tail_re = re.compile(
        r"'([0-9]+-[a-z0-9\-]+)','[^']*','[^']*',"
        r"'(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})','(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})',"
        r"'',\d+,'[^']+',\d+,'post','[^']*',-?\d+\)"
    )

    posts = []
    for m in tail_re.finditer(sql):
        post_name = m.group(1)

        # Scan backwards to find the start of this INSERT row
        row_start = sql.rfind("\n(", 0, m.start())
        row_text  = sql[row_start + 1 : m.end()]

        # Extract post_id
        id_m = re.match(r"\((\d+),", row_text)
        if not id_m:
            continue
        post_id = int(id_m.group(1))

        # Extract post_title (must start with 'Alice')
        title_m = re.search(r",'(Alice[^']*(?:\\'[^']*)*?)','", row_text)
        if not title_m:
            continue
        post_title = title_m.group(1)

        # Extract index from post_name prefix
        idx_m = re.match(r"(\d+)-", post_name)
        if not idx_m:
            continue
        index = int(idx_m.group(1))

        # Extract post_content using post_title as right delimiter.
        # Content sits between the 4th SQL column and post_title.
        delimiter = f"','{post_title}','"
        parts = row_text.split(delimiter)
        if len(parts) < 2:
            print(f"  WARNING: could not split on title for post {post_id} ({post_title!r})")
            continue
        before_title = parts[0]

        # Left boundary: skip (id, author, 'date', 'date_gmt', '
        start_m = re.match(r"\(\d+,\d+,'[^']+','[^']+',' ?", before_title)
        if not start_m:
            print(f"  WARNING: could not find content start for post {post_id}")
            continue
        content_raw = before_title[start_m.end():]
        post_content = unescape_sql(content_raw)

        posts.append({
            "id":      post_id,
            "name":    post_name,
            "title":   post_title,
            "index":   index,
            "content": post_content,
        })

    return sorted(posts, key=lambda p: p["index"])


def main():
    print(f"Reading {SQL_FILE} ...")
    with open(SQL_FILE, "r", encoding="utf-8") as f:
        sql = f.read()

    posts = parse(sql)
    print(f"Found {len(posts)} Alice posts")

    os.makedirs(OUT_DIR, exist_ok=True)

    for post in posts:
        idx_str    = f"{post['index']:02d}"
        title_slug = slugify(post['title'])
        filename   = f"{idx_str}-{title_slug}.html"
        filepath   = os.path.join(OUT_DIR, filename)
        with open(filepath, "w", encoding="utf-8") as f:
            f.write(post["content"])
        print(f"  {filename}  (post_id={post['id']})")

    print(f"\nDone — {len(posts)} files written to {OUT_DIR}/")

if __name__ == "__main__":
    main()
