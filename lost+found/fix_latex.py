#!/usr/bin/env python3
"""
Fix corrupted LaTeX commands in content/ YAML files.

Root cause: when raw-data HTML files were created, LaTeX commands starting with \n or \r
had their escape character interpreted as newline/CR, then joined back as empty or space,
producing corrupted command names.

Class A fixes (intrinsically invalid LaTeX commands — always corrupted):
  \eq   → \neq   (word boundary: won't touch \equiv, \eqref, etc.)
  \otin → \notin (word boundary: won't touch \otimes, etc.)
  \ang  → \rang  (word boundary: won't touch \angle, etc.)

Class B fixes (ambiguous — detected by backslash+space, which is always wrong):
  \ mid  → \nmid  (valid \mid never has a space after backslash)
  \ succ → \nsucc
  \ leq  → \nleq
"""

import re
import sys
from collections import Counter
from pathlib import Path

REPO = Path(__file__).resolve().parent
CONTENT = REPO / 'content'

SUBS = [
    # WordPress [latex]...[/latex] shortcodes → $...$
    (re.compile(r'\[latex\](.*?)\[/latex\]', re.DOTALL), r'$\1$'),
    # Class A — intrinsically invalid, no-space variant
    (re.compile(r'\\eq(?![a-zA-Z])'),    r'\\neq'),
    (re.compile(r'\\otin(?![a-zA-Z])'),  r'\\notin'),
    (re.compile(r'\\ang(?![a-zA-Z])'),   r'\\rang'),
    # Class B — backslash+space+stem (space variant)
    (re.compile(r'\\ eq(?![a-zA-Z])'),   r'\\neq'),
    (re.compile(r'\\ otin(?![a-zA-Z])'), r'\\notin'),
    (re.compile(r'\\ ang(?![a-zA-Z])'),  r'\\rang'),
    (re.compile(r'\\ mid(?![a-zA-Z])'),  r'\\nmid'),
    (re.compile(r'\\ succ(?![a-zA-Z])'), r'\\nsucc'),
    (re.compile(r'\\ leq(?![a-zA-Z])'),  r'\\nleq'),
]

pattern_names = [r'[latex]', r'\eq', r'\otin', r'\ang', r'\ eq', r'\ otin', r'\ ang', r'\ mid', r'\ succ', r'\ leq']

def fix_file(path: Path, dry_run: bool) -> Counter:
    text = path.read_text(encoding='utf-8')
    counts = Counter()
    for (pat, repl), name in zip(SUBS, pattern_names):
        new_text, n = pat.subn(repl, text)
        if n:
            counts[name] += n
            text = new_text
    if counts and not dry_run:
        path.write_text(text, encoding='utf-8')
    return counts

def main():
    dry_run = '--dry-run' in sys.argv
    if dry_run:
        print('[DRY RUN] No files will be modified.\n')

    total_files = 0
    total_counts: Counter = Counter()

    for yaml_file in sorted(CONTENT.rglob('*.yaml')):
        counts = fix_file(yaml_file, dry_run)
        if counts:
            total_files += 1
            total_counts += counts
            rel = yaml_file.relative_to(REPO)
            changes = ', '.join(f'{name}: {n}' for name, n in sorted(counts.items()))
            print(f'  {rel}  [{changes}]')

    print(f'\nSummary: {total_files} files {"would be " if dry_run else ""}modified')
    for name, n in sorted(total_counts.items()):
        print(f'  {name} → replaced {n}x')

if __name__ == '__main__':
    main()
