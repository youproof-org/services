"""
Convert [yp_element slug="..." type="link" /] shortcodes in math entity YAML files
to structured references: field + [slug] bracket notation.
"""
import glob
import re
import sys
import os
import yaml

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..'))
import wrap_yaml

BASE = os.path.dirname(__file__)
FOLDERS = ['definitions', 'theorems', 'proofs', 'remarks']

SC_RE = re.compile(
    r'\[yp_element\s+slug="([^"]+)"\s+type="link"(?:\s+show_type_name="[^"]*")?\s*/\]'
)


def build_slug_type_map():
    slug_to_type = {}
    for folder in FOLDERS:
        for filepath in glob.glob(os.path.join(BASE, folder, '*.yaml')):
            doc = yaml.safe_load(open(filepath, encoding='utf-8'))
            if doc and 'name' in doc and 'type' in doc:
                slug_to_type[doc['name']] = doc['type']
    return slug_to_type


def build_refs_block(refs_dict):
    lines = ['references:']
    for key in sorted(refs_dict):
        val = refs_dict[key]
        lines.append(f'  {key}:')
        lines.append(f'    target:')
        lines.append(f'      type: {val["target"]["type"]}')
        lines.append(f'      name: {val["target"]["name"]}')
    return '\n'.join(lines) + '\n'


def process_file(filepath, slug_to_type):
    text = open(filepath, encoding='utf-8').read()

    found_slugs = list(dict.fromkeys(m.group(1) for m in SC_RE.finditer(text)))

    has_existing_refs = bool(re.search(r'^references:', text, re.MULTILINE))

    if not found_slugs and not has_existing_refs:
        return  # nothing to do

    # Replace shortcodes with [slug]
    new_text = SC_RE.sub(lambda m: f'[{m.group(1)}]', text)

    # Build merged references dict
    if has_existing_refs:
        doc = yaml.safe_load(new_text)
        existing = doc.get('references') or {}
        # Normalise: existing entries may be None if value was empty
        merged = {k: v for k, v in existing.items() if v is not None}
    else:
        merged = {}

    for slug in found_slugs:
        if slug not in merged:
            etype = slug_to_type.get(slug, 'unknown')
            merged[slug] = {'target': {'type': etype, 'name': slug}}

    refs_block = build_refs_block(merged)

    if has_existing_refs:
        # Replace existing references: block (from ^references: up to ^content:)
        new_text = re.sub(
            r'^references:.*?(?=^content:)',
            refs_block,
            new_text,
            flags=re.DOTALL | re.MULTILINE,
        )
    else:
        # Insert before content:
        new_text = re.sub(
            r'^content:',
            refs_block + 'content:',
            new_text,
            flags=re.MULTILINE,
            count=1,
        )

    open(filepath, 'w', encoding='utf-8').write(new_text)
    wrap_yaml.process_file(filepath)


def main():
    slug_to_type = build_slug_type_map()
    total = 0
    for folder in FOLDERS:
        for filepath in sorted(glob.glob(os.path.join(BASE, folder, '*.yaml'))):
            before = open(filepath, encoding='utf-8').read()
            process_file(filepath, slug_to_type)
            after = open(filepath, encoding='utf-8').read()
            if before != after:
                total += 1
    print(f'Modified {total} files.')


if __name__ == '__main__':
    main()
