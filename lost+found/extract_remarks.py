"""
extract_remarks.py

Extracts raw post_content for all 44 'remark' posts from the WordPress SQL
dump and writes them as HTML files into raw-data/remarks/.

Filename format: {post_name}.html
"""

import os
import re

SQL_FILE = "youproof_dbdump_20260304.sql"
OUT_DIR  = "raw-data/remarks"

def unescape_sql(s: str) -> str:
    return (
        s.replace("\\'", "'")
         .replace('\\"', '"')
         .replace("\\n", "\n")
         .replace("\\r", "\r")
         .replace("\\\\", "\\")
    )

def parse(sql: str) -> list[dict]:
    tail_re = re.compile(
        r"'([a-z0-9\-]+)','','','(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})',"
        r"'(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})','',\d+,'[^']+',\d+,"
        r"'remark','[^']*',-?\d+\)"
    )

    posts = []
    for m in tail_re.finditer(sql):
        post_name = m.group(1)

        row_start = sql.rfind("\n(", 0, m.start())
        row_text  = sql[row_start + 1 : m.end()]

        id_m = re.match(r"\((\d+),", row_text)
        if not id_m:
            continue
        post_id = int(id_m.group(1))

        title_m = re.search(r",'([^']*(?:\\'[^']*)*)','[^']*','publish'", row_text)
        if not title_m:
            continue
        post_title = title_m.group(1)

        delimiter = f"','{post_title}','"
        parts = row_text.split(delimiter)
        if len(parts) < 2:
            print(f"  WARNING: could not split on title for post {post_id} ({post_title!r})")
            continue
        before_title = parts[0]

        start_m = re.match(r"\(\d+,\d+,'[^']+','[^']+',' ?", before_title)
        if not start_m:
            print(f"  WARNING: could not find content start for post {post_id}")
            continue
        post_content = unescape_sql(before_title[start_m.end():])

        posts.append({
            "id":      post_id,
            "name":    post_name,
            "title":   post_title,
            "content": post_content,
        })

    return sorted(posts, key=lambda p: p["name"])


def main():
    print(f"Reading {SQL_FILE} ...")
    with open(SQL_FILE, "r", encoding="utf-8") as f:
        sql = f.read()

    posts = parse(sql)
    print(f"Found {len(posts)} remark posts")

    os.makedirs(OUT_DIR, exist_ok=True)

    for post in posts:
        filename = f"{post['name']}.html"
        filepath = os.path.join(OUT_DIR, filename)
        with open(filepath, "w", encoding="utf-8") as f:
            f.write(post["content"])
        print(f"  {filename}  (post_id={post['id']})")

    print(f"\nDone — {len(posts)} files written to {OUT_DIR}/")

if __name__ == "__main__":
    main()
