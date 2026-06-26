#!/usr/bin/env python3
"""
Extract all yp-element-normal entities from youproof.hu/kriptografia
and generate structured YAML files.

Usage:
    python3 extract.py [--dry-run] [--article N]
"""

import re
import sys
import time
import urllib.request
import unicodedata
import os
import yaml

ARTICLES = [
    (1,  "1-alapfogalmak-caesar-vigenere-enigma-kulcsmegosztas"),
    (2,  "2-informacio-adat-ascii-entropia-forraskodolas-digitalizalas"),
    (3,  "3-szamrendszerek-binaris-hexadecimalis-szamabrazolas-bitmap"),
    (4,  "4-csatornakodolas-hibajavito-kod-kodelmelet-hamming-tavolsag"),
    (5,  "5-one-time-pad-passziv-aktiv-tamado-haromutas-kulcsforgalom"),
    (6,  "6-turing-gep-formalis-nyelv-rekurzivan-felsorolhato-rekurziv-megallasi-problema"),
    (7,  "7-algoritmus-bonyolultsag-problemaosztalyok-polinomialis-exponencialis-p-np-sejtes-tanu-tetel"),
    (8,  "8-karp-redukcio-np-teljes-np-nehez-cook-levin-tetel-logikai-halozatok-graf-izomorfizmus"),
    (9,  "9-diffie-hellman-protokoll-egyiranyu-fuggveny-modularis-aritmetika-asszimmetrikus-kulcs"),
    (10, "10-publikus-privat-kulcs-digitalis-alairas-kriptografiai-hash-fuggveny-szuletesnap-paradoxon-tanusitvany"),
    (11, "11-peano-axiomarendszer-termeszetes-szam-muvelet-osszeadas-kommutativitas-asszociativitas-teljes-indukcio"),
    (12, "12-szorzas-disztributivitas-teljes-indukcio-indirekt-bizonyitas-relacio-teljes-rendezes-rendezett-halmaz"),
    (13, "13-adossag-ekvivalenciarelacio-ekvivalencia-osztaly-egesz-szam-homomorfizmus-beagyazas-negativ-szam"),
    (14, "14-egesz-szam-szorzas-absztrakt-algebra-neutralis-elem-inverz-kivonas-gyuru-ferdetest-test"),
    (15, "15-rendezett-gyuru-absztrakt-algebra-egesz-szam-rendezesi-relacio-rendezesi-axiomak"),
    (16, "16-oszhatosag-egyseg-asszocialt-felbonthatatlan-prim-szamelmelet-alaptetele"),
    (17, "17-euklideszi-algoritmus-maradekos-osztas-legnagyobb-kozos-oszto-euklideszi-gyuru"),
    (18, "18-modularis-aritmetika-homomorfizmus-kongruencia-reszgyuru-ideal-maradekosztalygyuru"),
    (19, "19-foidealgyuruk-generalt-ideal-foideal-szamelmelet-alaptetele-halmaz-halmazrendszer-metszet-unio"),
    (20, "20-kongruencia-redukalt-maradekosztaly-euler-fuggveny-linearis-kongruencia-maradekrendszer-euler-fermat-tetel"),
    (21, "21-rsa-algoritmus-kibovitett-euklideszi-algoritmus-euler-fuggveny-kulcsgeneralas-ismetelt-negyzetreemeles-modszere"),
    (22, "22-kinai-maradektetel-konguenciarendszerek-kis-fermat-tetel-rsa-bizonyitas-gyuruk-direkt-szorzata-rsa-dekodolas"),
    (23, "23-primteszteles-fermat-primteszt-miller-rabin-primteszt-carmichael-szam-univerzalis-alprim-fermat-faktorizacio"),
    (24, "24-csoport-reszcsoport-mellekosztaly-lagrange-tetel-csoport-rendje-elem-rendje-miller-rabin-primteszt"),
    (25, "25-homomorfizmus-normaloszto-faktorcsoport-generalt-reszcsoport-ciklikus-csoport"),
    (26, "26-polinom-primitiv-gyok-carmichael-szam-korselt-kriterium-miller-rabin-primteszt"),
    (27, "27-elliptikus-gorbek-diffie-hellman-birch-es-swinnerton-dyer-sejtes-kvantumszamitogep"),
]

BASE_URL = "https://youproof.hu/kriptografia/"

# Detect entity type from header text
TYPE_PATTERNS = [
    (r'\bBizonyítás\b',     'proof'),
    (r'\bDefiníció\b',      'definition'),
    (r'\bTétel\b',          'theorem'),
    (r'\bLemma\b',          'theorem'),   # label="lemma"
    (r'\bÁllítás\b',        'theorem'),   # label="állítás"
    (r'\bKövetkezmény\b',   'theorem'),   # label="következmény"
    (r'\bMegjegyzés\b',     'remark'),
]

LABEL_MAP = {
    'Tétel':        'tétel',
    'Lemma':        'lemma',
    'Állítás':      'állítás',
    'Következmény': 'következmény',
}


def hu_to_ascii(s):
    """Transliterate Hungarian characters to ASCII for IDs."""
    mapping = str.maketrans('áéíóöőúüűÁÉÍÓÖŐÚÜŰ', 'aeiooouuuAEIOOOUUU')
    return s.translate(mapping)


def slugify(s):
    """Convert a string to a slug suitable for use as a YAML id."""
    s = hu_to_ascii(s.lower())
    s = re.sub(r'[^a-z0-9]+', '-', s)
    return s.strip('-')


def convert_math(html_fragment):
    """Convert wp-katex-eq spans to $...$ / $$...$$."""
    # class may be "wp-katex-eq katex-display" or similar; use data-display as the signal
    html_fragment = re.sub(
        r'<span\b[^>]*\bwp-katex-eq\b[^>]*\bdata-display="true"[^>]*>(.*?)</span>',
        r'$$\1$$',
        html_fragment, flags=re.DOTALL
    )
    html_fragment = re.sub(
        r'<span\b[^>]*\bdata-display="true"\b[^>]*\bwp-katex-eq\b[^>]*>(.*?)</span>',
        r'$$\1$$',
        html_fragment, flags=re.DOTALL
    )
    html_fragment = re.sub(
        r'<span\b[^>]*\bwp-katex-eq\b[^>]*\bdata-display="false"[^>]*>(.*?)</span>',
        r'$\1$',
        html_fragment, flags=re.DOTALL
    )
    html_fragment = re.sub(
        r'<span\b[^>]*\bdata-display="false"\b[^>]*\bwp-katex-eq\b[^>]*>(.*?)</span>',
        r'$\1$',
        html_fragment, flags=re.DOTALL
    )
    return html_fragment


def html_to_markdown(html_fragment):
    """Convert an HTML fragment to clean Markdown text."""
    # Convert math first
    text = convert_math(html_fragment)
    # Bold
    text = re.sub(r'<strong>(.*?)</strong>', r'**\1**', text, flags=re.DOTALL)
    text = re.sub(r'<b>(.*?)</b>', r'**\1**', text, flags=re.DOTALL)
    # Italic
    text = re.sub(r'<em>(.*?)</em>', r'*\1*', text, flags=re.DOTALL)
    text = re.sub(r'<i>(.*?)</i>', r'*\1*', text, flags=re.DOTALL)
    # Strip remaining tags
    text = re.sub(r'<[^>]+>', '', text)
    # Decode HTML entities
    text = text.replace('&nbsp;', ' ')
    text = text.replace('&amp;', '&')
    text = text.replace('&lt;', '<')
    text = text.replace('&gt;', '>')
    text = text.replace('&quot;', '"')
    text = text.replace('&#9827;', '♣')  # proof end marker (sometimes used)
    text = text.replace('&#x25a0;', '■')
    text = text.replace('&mdash;', '—')
    text = text.replace('&ndash;', '–')
    # Normalize whitespace
    text = re.sub(r'\n{3,}', '\n\n', text)
    text = re.sub(r'[ \t]+', ' ', text)
    text = text.strip()
    return text


def extract_elements(html):
    """
    Extract all yp-element-normal divs from the article HTML.
    Returns list of dicts: {element_id, header, type, label, number, title, content_html}
    """
    elements = []

    # Find all div starts
    div_starts = [m.start() for m in re.finditer(r'<div[^>]*class="yp-element-normal"[^>]*>', html)]

    for i, start in enumerate(div_starts):
        # Determine end: next div start or a reasonable chunk
        end = div_starts[i + 1] if i + 1 < len(div_starts) else min(start + 50000, len(html))
        chunk = html[start:end]

        # Extract yp-element id
        elem_id_m = re.search(r'id="(yp-element-\d+)"', chunk)
        element_id = elem_id_m.group(1) if elem_id_m else f'unknown-{i}'

        # Extract header text
        h4_m = re.search(r'<h4[^>]*>(.*?)</h4>', chunk, re.DOTALL)
        if not h4_m:
            continue
        header_raw = h4_m.group(1)
        header = re.sub(r'<[^>]+>', '', header_raw).strip().rstrip(':')

        # Determine entity type
        entity_type = None
        label = None
        for pattern, etype in TYPE_PATTERNS:
            if re.search(pattern, header):
                entity_type = etype
                # Extract label word for theorems
                lm = re.search(pattern, header)
                if lm and etype == 'theorem':
                    label = LABEL_MAP.get(lm.group(), 'tétel')
                break

        if entity_type is None:
            entity_type = 'unknown'

        # Parse number and title from header
        # Examples: "11.1. Definíció (Peano-axiómarendszer)"
        #           "11.5. Lemma"
        #           "Bizonyítás"
        number = None
        title = None
        num_m = re.match(r'^(\d+\.\d+\.?)\s+', header)
        if num_m:
            number = num_m.group(1).rstrip('.')
            rest = header[num_m.end():]
            # Strip type keyword, keep parenthetical title
            rest = re.sub(r'^(Definíció|Tétel|Lemma|Állítás|Következmény|Megjegyzés)\s*', '', rest)
            paren_m = re.match(r'^\((.+)\)', rest.strip())
            if paren_m:
                title = paren_m.group(1)

        # Extract content (everything after the h4, up to the next element or end)
        content_start = h4_m.end()
        # Remove the "link to related element" comment block if present
        content_html = chunk[content_start:]
        # Remove WordPress block comments
        content_html = re.sub(r'<!-- .*?-->', '', content_html, flags=re.DOTALL)
        # Remove the outer div close
        content_html = re.sub(r'</div>\s*$', '', content_html.strip())

        content_text = html_to_markdown(content_html)

        elements.append({
            'element_id': element_id,
            'header': header,
            'type': entity_type,
            'label': label,
            'number': number,
            'title': title,
            'content': content_text,
        })

    return elements


def fetch_article(slug):
    url = BASE_URL + slug + '/'
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return resp.read().decode('utf-8')


def make_id(entity_type, number, title, article_num, seq):
    """Generate a stable YAML id for an entity."""
    prefix_map = {
        'definition': 'def',
        'theorem':    'thm',
        'proof':      'proof',
        'remark':     'rem',
        'unknown':    'unk',
    }
    prefix = prefix_map.get(entity_type, 'unk')

    if title:
        slug = slugify(title)[:40]
    elif number:
        slug = slugify(number.replace('.', '-'))
    else:
        slug = f'art{article_num}-{seq}'

    return f'{prefix}-{slug}'


def entity_to_yaml(entity_id, entity):
    """Produce a YAML string for the entity."""
    lines = []
    lines.append(f'id: {entity_id}')
    lines.append(f'type: {entity["type"]}')

    if entity['type'] == 'theorem' and entity.get('label'):
        lines.append(f'label: "{entity["label"]}"')

    if entity.get('title'):
        lines.append(f'title: "{entity["title"]}"')

    lines.append('tags: []')
    lines.append('references: []')

    if entity['type'] == 'proof':
        lines.append('proves: # TODO: fill in theorem id')

    lines.append('items:')
    lines.append(f'  - type: content')
    lines.append(f'    id: {entity_id}-body')

    if entity['type'] not in ('proof',):
        lines.append(f'    terms: []')

    # Content as YAML block scalar
    content = entity['content']
    lines.append('    content: |')
    for line in content.splitlines():
        lines.append('      ' + line)

    return '\n'.join(lines) + '\n'


def article_topic(article_num):
    """Return the primary math topic folder for an article."""
    if article_num in (1, 2, 3, 4, 5, 9, 10, 27):
        return 'cryptography'
    elif article_num in (6, 7, 8):
        return 'complexity-theory'
    elif article_num in (11, 12, 20, 21, 22, 23):
        return 'number-theory'
    elif article_num in (13,):
        return 'set-theory'
    elif article_num in range(14, 20):
        return 'ring-theory'
    elif article_num in (24, 25, 26):
        return 'group-theory'
    else:
        return 'cryptography'


def type_folder(entity_type):
    return {
        'definition': 'definitions',
        'theorem':    'theorems',
        'proof':      'proofs',
        'remark':     'remarks',
        'unknown':    'definitions',
    }.get(entity_type, 'definitions')


def output_path(article_num, entity_type, entity_id):
    topic = article_topic(article_num)
    folder = type_folder(entity_type)
    return f'content/math/{topic}/{folder}/{entity_id}.yaml'


def main():
    dry_run = '--dry-run' in sys.argv
    only_article = None
    if '--article' in sys.argv:
        idx = sys.argv.index('--article')
        only_article = int(sys.argv[idx + 1])

    total_counts = {'definition': 0, 'theorem': 0, 'proof': 0, 'remark': 0, 'unknown': 0}
    id_seen = {}  # track duplicate ids

    for art_num, slug in ARTICLES:
        if only_article and art_num != only_article:
            continue

        print(f'\n=== Article {art_num}: {slug[:50]}... ===', flush=True)
        try:
            html = fetch_article(slug)
        except Exception as e:
            print(f'  ERROR fetching: {e}', flush=True)
            continue

        elements = extract_elements(html)
        print(f'  Found {len(elements)} elements', flush=True)

        seq = 0
        for elem in elements:
            seq += 1
            eid = make_id(elem['type'], elem['number'], elem['title'], art_num, seq)

            # Handle duplicate IDs
            if eid in id_seen:
                eid = f'{eid}-{art_num}-{seq}'
            id_seen[eid] = True

            path = output_path(art_num, elem['type'], eid)
            print(f'  [{elem["type"]:10}] {elem.get("number") or "":10} {eid}', flush=True)

            total_counts[elem['type']] = total_counts.get(elem['type'], 0) + 1

            if not dry_run:
                os.makedirs(os.path.dirname(path), exist_ok=True)
                with open(path, 'w', encoding='utf-8') as f:
                    f.write(entity_to_yaml(eid, elem))

        time.sleep(0.5)  # be polite to the server

    print('\n=== TOTALS ===')
    for t, c in sorted(total_counts.items()):
        print(f'  {t:12}: {c}')
    print(f'  {"TOTAL":12}: {sum(total_counts.values())}')


if __name__ == '__main__':
    main()
