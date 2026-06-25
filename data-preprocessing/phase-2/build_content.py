#!/usr/bin/env python3
"""
Phase-2: Populate content/ from data-preprocessing/phase-1/

Usage:
    python3 data-preprocessing/phase-2/build_content.py [--dry-run]

Reads:
    data-preprocessing/phase-2/book-config.yaml
    data-preprocessing/phase-1/{definitions,theorems,proofs,remarks}/*.yaml

Writes:
    content/knowledge-base/  — math entities organized into topic namespaces
    content/books/            — chapters organized into a book with parts
"""

import argparse
import re
import shutil
import sys
from pathlib import Path

import yaml

REPO = Path(__file__).resolve().parents[2]
PHASE1 = REPO / 'data-preprocessing/phase-1'
CONTENT = REPO / 'content'
THIS_DIR = REPO / 'data-preprocessing/phase-2'

ENTITY_TYPES = ['definitions', 'theorems', 'proofs', 'remarks']

# ---------------------------------------------------------------------------
# Namespace hierarchy definition
# ---------------------------------------------------------------------------

NAMESPACE_TREE = {
    'halmazelmelet': {
        'title': 'Halmazelmelet',
    },
    'szamrendszerek': {
        'title': 'Számrendszerek',
        'children': {
            'termeszetes-szamok': {'title': 'Természetes számok'},
            'egesz-szamok':       {'title': 'Egész számok'},
        },
    },
    'absztrakt-algebra': {
        'title': 'Absztrakt algebra',
        'children': {
            'algebrai-strukturak': {'title': 'Algebrai struktúrák'},
            'gyuruelmelet':        {'title': 'Gyűrűelmélet'},
            'csoportelmelet':      {'title': 'Csoportelmélet'},
        },
    },
    'szamelmeleti-alapok': {
        'title': 'Számelméleti alapok',
        'children': {
            'oszthatosag':         {'title': 'Oszthatóság'},
            'modularis-aritmetika': {'title': 'Moduláris aritmetika'},
        },
    },
    'primalitas': {
        'title': 'Primalitás',
    },
    'kriptografia': {
        'title': 'Kriptográfia',
    },
    'polinomok': {
        'title': 'Polinomok',
    },
}

# Flat map: namespace path → title (for namespace.yaml generation)
def _flatten_namespace_tree(tree, prefix=''):
    result = {}
    for name, meta in tree.items():
        path = f'{prefix}{name}' if prefix else name
        result[path] = meta['title']
        children = meta.get('children', {})
        if children:
            result.update(_flatten_namespace_tree(children, prefix=f'{path}/'))
    return result

NAMESPACES = _flatten_namespace_tree(NAMESPACE_TREE)

# ---------------------------------------------------------------------------
# Namespace assignment rules
# Ordered: first matching rule wins.
# Proofs/remarks strip their suffixes and re-match against the base slug.
# ---------------------------------------------------------------------------

# Manual overrides: slug → namespace path
MANUAL_OVERRIDES = {
    # Ring ordering / general ring properties
    'szorzat-inverze':                              'absztrakt-algebra/algebrai-strukturak',
    'szorzat-egyszerusitese-gyurukben':             'absztrakt-algebra/algebrai-strukturak',
    'szorzas-rendezesfordito-gyuruben':             'absztrakt-algebra/algebrai-strukturak',
    'gyuru-reszbenrendezesenek-tulajdonsagai':      'absztrakt-algebra/algebrai-strukturak',
    'rendezesek-es-pozitivitastartomanyok-kapcsolata': 'absztrakt-algebra/algebrai-strukturak',
    'teljes-rendezes-szukseges-es-elegseges-feltetele': 'absztrakt-algebra/algebrai-strukturak',
    'teljes-rendezesek-pozitivitastartomanyainak-metszete': 'absztrakt-algebra/algebrai-strukturak',
    # Sum-preserving map theorem belongs with ring homomorphisms
    'osszegtarto-lekepezes-nullelem-es-ellentettkepzestarto': 'absztrakt-algebra/gyuruelmelet',
    # Polynomial-related results not caught by 'polinom' prefix
    'osszeg-es-szorzatpolinom-foka':                'polinomok',
    'polinomok-osszegenek-es-szorzatanak-polinomfuggvenye': 'polinomok',
    # Group-theoretic result about cyclic additive groups of Z and Z/nZ
    'egesz-szamok-es-maradekosztalygyuruk-additiv-csoportja-ciklikus':
        'absztrakt-algebra/csoportelmelet',
    # Residue classes multiplication
    'kulonbozo-maradekosztalyok-szorzasa-redukalt-maradekosztallyal':
        'szamelmeleti-alapok/modularis-aritmetika',
    # Relation (vs operation) — set theory
    'ketvaltozos-relacio': 'halmazelmelet',
    # Integers form an integral domain
    'az-egesz-szamok-halmaza-integritastartomany': 'szamrendszerek/egesz-szamok',
    # General associativity/commutativity result
    'asszociativ-kommutativ-tetszoleges-sorrend-zarojelezes':
        'absztrakt-algebra/algebrai-strukturak',
    # Unique factorization sufficient condition
    'felbontas-egyertelmusegenek-elegseges-feltetele':
        'szamelmeleti-alapok/oszthatosag',
    # Every prime is irreducible
    'minden-prim-felbonthatatlan': 'szamelmeleti-alapok/oszthatosag',
    # Generated subgroup / normal subgroup
    'generalt-reszcsoport-es-normaloszto': 'absztrakt-algebra/csoportelmelet',
    # Generated subring / ideal
    'generalt-reszgyuru-es-ideal': 'absztrakt-algebra/gyuruelmelet',
    # Absolute value as Euclidean norm (Euclidean ring result)
    'abszolutertek-euklideszi-norma': 'szamelmeleti-alapok/oszthatosag',
}

# Pattern rules: list of (prefixes, namespace_path)
# Applied in order; first match wins.
NAMESPACE_RULES = [
    # Polynomials
    (['polinom'],
     'polinomok'),

    # Cryptographic applications (Euler φ, Euler–Fermat, Fermat's little theorem, RSA)
    (['euler-fuggveny', 'euler-fermat-', 'kis-fermat-', 'rsa-'],
     'kriptografia'),

    # Primality
    (['carmichael-', 'fermat-tanu', 'miller-rabin', 'primitiv-gyok',
      'egesz-szam-p-adikus-', 'p-edik-', 'prim-modulus-', 'primhatvany',
      'primszamok-', 'primszam', 'negyzetmentesseg-', 'korselt-',
      'nem-miller-rabin-'],
     'primalitas'),

    # Modular arithmetic (must come before egesz-szamok- to catch egesz-szamok-maradek*)
    (['egesz-szamok-kozotti-', 'egesz-szamok-maradek',
      'modularis-', 'teljes-es-redukalt-', 'redukalt-maradekosztaly',
      'linearis-kongruencia', 'linearis-diofantoszi-',
      'kinai-maradektetel', 'maradekok-kulonbsege-'],
     'szamelmeleti-alapok/modularis-aritmetika'),

    # Divisibility and number-theoretic foundations
    (['oszthatosag', 'egyseg', 'asszocialt', 'felbonthatatlan', 'primtulajdonsagu',
      'szamelmelet-alap', 'euklideszi-', 'bezout-', 'legnagyobb-kozos-',
      'kituntetett-kozos-', 'relativ-primek', 'negyzetmentes-', 'osztok-'],
     'szamelmeleti-alapok/oszthatosag'),

    # Group theory (csoporthomomorfizmus before csoport to avoid prefix shadowing)
    (['csoporthomomorfizmus', 'csoport', 'reszcsoport', 'normaloszto',
      'faktorcsoport', 'ciklikus-csoportok', 'lagrange-', 'mellekosztalyok',
      'elem-rendje-es-csoport-'],
     'absztrakt-algebra/csoportelmelet'),

    # Ring theory
    (['reszgyuru', 'gyuruhomomorfizmus', 'gyuru-additiv-', 'gyuruk-',
      'ideal', 'vegesen-generalt', 'foideal', 'maradekkepzes-',
      'maradekosztalygyuru', 'maradekosztalyok-', 'maradekok-gyuruje',
      'komplexusmuveletek'],
     'absztrakt-algebra/gyuruelmelet'),

    # General algebraic structures
    (['ketvaltozos-muvelet', 'neutralis-elem', 'inverz-elem', 'rendezett-gyuru',
      'integritastartomany', 'nullosztomentes-gyuru', 'pozitivitastartomany',
      'gyuru-test', 'egesz-kitevos-hatvany', 'hatvanyozas-',
      'homomorfizmus-', 'szorzat-', 'szorzas-', 'osszeg-'],
     'absztrakt-algebra/algebrai-strukturak'),

    # Integers (construction; general egesz-szamok- patterns)
    (['egesz-szamok-', 'pozitiv-es-negativ-egesz-szamok'],
     'szamrendszerek/egesz-szamok'),

    # Natural numbers (Peano axiom construction)
    (['peano-', 'termeszetes-szamok-', 'termeszetes-szamparok-'],
     'szamrendszerek/termeszetes-szamok'),

    # Set theory, relations, functions
    (['halmaz', 'relacio', 'reflexiv-', 'szimmetrikus-', 'antiszimmetrikus-',
      'tranzitiv-', 'trichotom-', 'ekvivalencia', 'kep-teljes-inverz-kep',
      'rendezett-halmaz', 'reszhalmaz', 'fuggvenyek-'],
     'halmazelmelet'),
]


def _base_slug(slug: str) -> str:
    """Strip proof/remark suffixes to get the base entity slug."""
    for suffix in ('-bizonyitas-1', '-bizonyitas-2', '-bizonyitas-3',
                   '-bizonyitas', '-megjegyzes'):
        if slug.endswith(suffix):
            return slug[:-len(suffix)]
    return slug


def assign_namespace(slug: str) -> str:
    base = _base_slug(slug)
    # Manual overrides (try both slug and base)
    for candidate in (slug, base):
        if candidate in MANUAL_OVERRIDES:
            return MANUAL_OVERRIDES[candidate]
    # Pattern matching on base slug
    for patterns, ns in NAMESPACE_RULES:
        for p in patterns:
            if base.startswith(p) or base == p:
                return ns
    return 'UNMATCHED'


# ---------------------------------------------------------------------------
# Slug → namespace map
# ---------------------------------------------------------------------------

def build_slug_ns_map() -> dict:
    """Return {slug: namespace_path} for every matched entity in phase-1."""
    result = {}
    for etype in ENTITY_TYPES:
        type_dir = PHASE1 / etype
        if not type_dir.is_dir():
            continue
        for yaml_file in sorted(type_dir.iterdir()):
            if yaml_file.suffix == '.yaml':
                slug = yaml_file.stem
                ns = assign_namespace(slug)
                if ns != 'UNMATCHED':
                    result[slug] = ns
    return result


# ---------------------------------------------------------------------------
# Namespace injection into YAML text
# ---------------------------------------------------------------------------

def add_namespace_to_targets(text: str, slug_ns_map: dict) -> str:
    """
    Inject  namespace: /...  after the  name:  line of every  target:  block
    that references a known entity slug.  The source text's formatting
    (block scalars, quoting, indentation) is preserved exactly.

    Handled pattern (any indentation level):

        target:
          type: <entity-type>
          name: <slug>
      →
        target:
          type: <entity-type>
          name: <slug>
          namespace: /<ns-path>
    """
    lines = text.split('\n')
    out = []
    i = 0
    while i < len(lines):
        line = lines[i]
        out.append(line)

        # Detect "…target:" with nothing after the colon
        m = re.match(r'^(\s+)target:\s*$', line)
        if m and i + 2 < len(lines):
            outer_indent = m.group(1)
            # Detect inner indent from the next line
            type_m = re.match(r'^(\s+)type:\s*\S', lines[i + 1])
            if type_m:
                inner_indent = type_m.group(1)
                name_line = lines[i + 2]
                name_m = re.match(r'^' + re.escape(inner_indent) + r'name:\s*(\S+)', name_line)
                if name_m:
                    # Emit the type: and name: lines now
                    out.append(lines[i + 1])
                    out.append(name_line)
                    slug = name_m.group(1)
                    ns = slug_ns_map.get(slug)
                    if ns:
                        out.append(f'{inner_indent}namespace: /{ns}')
                    i += 3
                    continue
        i += 1
    return '\n'.join(out)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def write_yaml(path: Path, data: dict, dry_run: bool):
    if dry_run:
        print(f'  [DRY] write {path}')
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, 'w', encoding='utf-8') as f:
        yaml.dump(data, f, allow_unicode=True, default_flow_style=False,
                  sort_keys=False)


def copy_file(src: Path, dst: Path, dry_run: bool):
    if dry_run:
        print(f'  [DRY] copy {src.name} → {dst}')
        return
    dst.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(src, dst)


def copy_yaml_with_ns(src: Path, dst: Path, slug_ns_map: dict, dry_run: bool):
    """Copy a YAML file, injecting namespace into every target: block."""
    if dry_run:
        print(f'  [DRY] copy+ns {src.name} → {dst}')
        return
    text = src.read_text(encoding='utf-8')
    text = add_namespace_to_targets(text, slug_ns_map)
    dst.parent.mkdir(parents=True, exist_ok=True)
    dst.write_text(text, encoding='utf-8')


def copy_tree(src: Path, dst: Path, dry_run: bool):
    if dry_run:
        print(f'  [DRY] copytree {src} → {dst}')
        return
    if dst.exists():
        shutil.rmtree(dst)
    shutil.copytree(src, dst)


# ---------------------------------------------------------------------------
# Build knowledge base
# ---------------------------------------------------------------------------

def build_knowledge_base(dry_run: bool, slug_ns_map: dict):
    print('\n=== Knowledge base ===')

    # Create namespace.yaml files
    for ns_path, title in NAMESPACES.items():
        parts = ns_path.split('/')
        name = parts[-1]
        parent = NAMESPACE_TREE
        for p in parts[:-1]:
            parent = parent[p]['children']
        children = list(parent.get(name, {}).get('children', {}).keys())

        data = {'type': 'namespace', 'name': name, 'title': title}
        if children:
            data['children'] = children

        dst = CONTENT / 'knowledge-base' / ns_path / 'namespace.yaml'
        write_yaml(dst, data, dry_run)

    # Copy entity files
    unmatched = []
    counts = {ns: 0 for ns in NAMESPACES}

    for etype in ENTITY_TYPES:
        type_dir = PHASE1 / etype
        for yaml_file in sorted(type_dir.iterdir()):
            if yaml_file.suffix != '.yaml':
                continue
            slug = yaml_file.stem
            ns = assign_namespace(slug)
            if ns == 'UNMATCHED':
                unmatched.append((etype, slug))
                continue

            # Copy entity YAML into type subfolder (with namespace injection)
            dst_dir = CONTENT / 'knowledge-base' / ns / etype
            copy_yaml_with_ns(yaml_file, dst_dir / yaml_file.name, slug_ns_map, dry_run)
            counts[ns] += 1

            # Copy figure files into the shared figures/ subfolder for this type
            figures_src = type_dir / slug / 'figures'
            if figures_src.is_dir():
                for fig in sorted(figures_src.iterdir()):
                    if fig.is_file():
                        copy_file(fig, dst_dir / 'figures' / fig.name, dry_run)

    # Summary
    print(f'\nEntity counts per namespace:')
    for ns, count in sorted(counts.items()):
        if count:
            print(f'  {ns}: {count}')

    if unmatched:
        print(f'\nWARNING — {len(unmatched)} unmatched entities:')
        for etype, slug in unmatched:
            print(f'  [{etype}] {slug}')
    else:
        print('\nAll entities matched to a namespace.')

    total = sum(counts.values())
    print(f'\nTotal entities copied: {total}')
    return unmatched


# ---------------------------------------------------------------------------
# Build books
# ---------------------------------------------------------------------------

def build_books(dry_run: bool, slug_ns_map: dict):
    print('\n=== Books ===')

    config_path = THIS_DIR / 'book-config.yaml'
    with open(config_path, encoding='utf-8') as f:
        book_cfg = yaml.safe_load(f)

    book_name = book_cfg['name']
    book_dir = CONTENT / 'books' / book_name

    # Write book.yaml
    book_data = {
        'type': 'book',
        'name': book_name,
        'title': book_cfg['title'],
        'language': book_cfg.get('language', 'hu'),
        'parts': [p['name'] for p in book_cfg['parts']],
    }
    write_yaml(book_dir / 'book.yaml', book_data, dry_run)

    chapter_count = 0
    for part_cfg in book_cfg['parts']:
        part_name = part_cfg['name']
        part_dir = book_dir / part_name

        # Write part.yaml
        part_data = {
            'type': 'part',
            'name': part_name,
            'title': part_cfg['title'],
            'chapters': part_cfg['chapters'],
        }
        write_yaml(part_dir / 'part.yaml', part_data, dry_run)

        # Copy chapter directories
        for chapter_slug in part_cfg['chapters']:
            src_yaml = PHASE1 / 'articles' / f'{chapter_slug}.yaml'
            src_dir  = PHASE1 / 'articles' / chapter_slug

            dst_chapter_dir = part_dir / chapter_slug

            if not src_yaml.exists():
                print(f'  WARNING: missing chapter YAML: {src_yaml}')
                continue

            # Copy chapter YAML as chapter.yaml (with namespace injection)
            copy_yaml_with_ns(src_yaml, dst_chapter_dir / 'chapter.yaml', slug_ns_map, dry_run)

            # Copy section YAMLs and figures/ from chapter subdir
            if src_dir.is_dir():
                for item in src_dir.iterdir():
                    if item.is_dir():
                        copy_tree(item, dst_chapter_dir / item.name, dry_run)
                    elif item.suffix == '.yaml':
                        # Section YAML — inject namespace references
                        copy_yaml_with_ns(
                            item, dst_chapter_dir / item.name, slug_ns_map, dry_run)
                    else:
                        copy_file(item, dst_chapter_dir / item.name, dry_run)

            chapter_count += 1
            print(f'  {part_name}/{chapter_slug}')

    print(f'\nTotal chapters copied: {chapter_count}')


# ---------------------------------------------------------------------------
# Verify
# ---------------------------------------------------------------------------

def verify():
    print('\n=== Verification ===')

    # Entity count
    entity_yamls = [
        f for f in (CONTENT / 'knowledge-base').rglob('*.yaml')
        if f.name != 'namespace.yaml'
    ]
    print(f'Entity YAMLs in knowledge-base: {len(entity_yamls)}')

    # Chapter count
    chapter_yamls = list((CONTENT / 'books').rglob('chapter.yaml'))
    print(f'chapter.yaml files in books:    {len(chapter_yamls)}')

    # Figure count
    figures = list(CONTENT.rglob('*.jpg')) + list(CONTENT.rglob('*.png'))
    print(f'Image files in content/:        {len(figures)}')

    # YAML parse check
    errors = []
    for f in CONTENT.rglob('*.yaml'):
        try:
            yaml.safe_load(open(f, encoding='utf-8'))
        except Exception as e:
            errors.append((f, str(e)))
    if errors:
        print(f'\nYAML parse errors: {len(errors)}')
        for f, err in errors:
            print(f'  {f}: {err}')
    else:
        print('All YAML files parse cleanly.')


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description='Build content/ from phase-1 data')
    parser.add_argument('--dry-run', action='store_true',
                        help='Print actions without writing files')
    args = parser.parse_args()

    if not args.dry_run and CONTENT.exists():
        # Remove existing content (except .gitkeep)
        for item in CONTENT.iterdir():
            if item.name == '.gitkeep':
                continue
            if item.is_dir():
                shutil.rmtree(item)
            else:
                item.unlink()

    slug_ns_map = build_slug_ns_map()
    unmatched = build_knowledge_base(args.dry_run, slug_ns_map)
    build_books(args.dry_run, slug_ns_map)

    if not args.dry_run:
        verify()

    if unmatched:
        print(f'\nFailed: {len(unmatched)} unmatched entities.')
        sys.exit(1)
    else:
        print('\nDone.')


if __name__ == '__main__':
    main()
