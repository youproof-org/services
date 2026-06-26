"""
wrap_yaml.py

Re-wraps all YAML block scalar content fields (field: |) in the
data-preprocessing/phase-1/articles/ tree at WRAP_WIDTH total characters.
"""

import os
import re
import textwrap
import glob

WRAP_WIDTH = 115


def wrap_block_lines(block_lines, indent):
    """Re-wrap a list of block-scalar lines (with leading indent) as paragraphs."""
    available = WRAP_WIDTH - len(indent)
    result = []

    # Split into paragraphs separated by blank lines
    paragraphs = []
    current = []
    for line in block_lines:
        if line.strip() == "":
            if current:
                paragraphs.append(current)
                current = []
            paragraphs.append(None)  # blank separator
        else:
            current.append(line)
    if current:
        paragraphs.append(current)

    for para in paragraphs:
        if para is None:
            result.append("")
        else:
            text = " ".join(l.strip() for l in para)
            wrapped = textwrap.fill(
                text,
                width=available,
                break_long_words=False,
                break_on_hyphens=False,
            )
            for wl in wrapped.split("\n"):
                result.append(indent + wl)

    return result


def process_file(filepath):
    with open(filepath, "r", encoding="utf-8") as f:
        lines = f.read().split("\n")

    result = []
    i = 0

    while i < len(lines):
        line = lines[i]

        # Detect any YAML block scalar: "  some-key: |"
        if re.match(r"^.*: \|$", line):
            result.append(line)
            i += 1

            # Find the indent of the block content
            j = i
            while j < len(lines) and lines[j].strip() == "":
                j += 1
            if j >= len(lines):
                continue

            indent_m = re.match(r"^(\s+)", lines[j])
            if not indent_m:
                continue
            indent = indent_m.group(1)

            # Collect all lines belonging to this block
            block_lines = []
            while i < len(lines) and (
                lines[i].startswith(indent) or lines[i].strip() == ""
            ):
                block_lines.append(lines[i])
                i += 1

            # Remove trailing blank lines from block (preserve one trailing newline via YAML |)
            while block_lines and block_lines[-1].strip() == "":
                block_lines.pop()

            result.extend(wrap_block_lines(block_lines, indent))
        else:
            result.append(line)
            i += 1

    new_content = "\n".join(result)
    with open(filepath, "w", encoding="utf-8") as f:
        f.write(new_content)


def main():
    base = "data-preprocessing/phase-1/articles"
    files = glob.glob(f"{base}/**/*.yaml", recursive=True) + glob.glob(f"{base}/*.yaml")
    files = sorted(set(files))

    for fp in files:
        process_file(fp)
        print(f"  Wrapped: {fp}")

    print(f"\nDone — {len(files)} files processed")


if __name__ == "__main__":
    main()
