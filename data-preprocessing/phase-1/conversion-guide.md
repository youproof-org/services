# Phase-1 Conversion Guide: Raw HTML → Structured YAML

This document describes the procedure for converting raw WordPress HTML files
(under `raw-data/articles/`) into structured YAML files (under
`data-preprocessing/phase-1/articles/`).

Article 01 (`01-alice-es-bob-szinrelep`) is fully converted and serves as the
reference implementation.

---

## Output folder structure

```
data-preprocessing/phase-1/articles/
  {nn}-{kebab-title}.yaml              ← chapter file
  {nn}-{kebab-title}/
    {mm}-{kebab-section-title}.yaml    ← one file per section
    figures/
      {kk}-{kebab-description}.jpg    ← locally downloaded images, sequential
```

- `nn` = zero-padded article index (matches the prefix in `raw-data/articles/`)
- `mm` = zero-padded section index within the article, starting at 01
- `kk` = zero-padded figure index within the article, starting at 01

---

## Math entity YAML structure

Math entities are stored in `data-preprocessing/phase-1/{type}s/{slug}.yaml` where
`{type}` is `definition`, `theorem`, `proof`, or `remark`.

```yaml
# --- Definition ---
type: definition
name: asszocialt
remarks:                          # always present; list of remark slugs (may be empty)
  - asszocialt-megjegyzes
references:                       # present when the entity contains cross-references
  reszcsoport:
    target:
      type: definition
      name: reszcsoport
content:
  - type: narrative
    content: |
      Egy ***kommutatív gyűrű*** valamely $a$ és $b$ elemeire...

# --- Theorem ---
type: theorem
name: abszolutertek-euklideszi-norma
proofs:                           # always present; list of proof slugs (may be empty)
  - abszolutertek-euklideszi-norma-bizonyitas
remarks: []                       # always present; list of remark slugs (may be empty)
references:                       # present when the entity contains cross-references
  egesz-szamok-abszoluterteke:
    target:
      type: definition
      name: egesz-szamok-abszoluterteke
content:
  - type: narrative
    content: |
      A [egesz-szamok-abszoluterteke] szerinti...

# --- Proof ---
type: proof
name: abszolutertek-euklideszi-norma-bizonyitas
remarks: []                       # always present; list of remark slugs (may be empty)
references:                       # present when the entity contains cross-references
  egesz-szamok-abszoluterteke:
    target:
      type: definition
      name: egesz-szamok-abszoluterteke
  rendezett-gyuru:
    target:
      type: definition
      name: rendezett-gyuru
content:
  - type: narrative
    content: |
      Az abszolútérték-függvény képhalmaza a [egesz-szamok-abszoluterteke] alapján...
  - type: formula
    lead-in: |
      Visszafelé: ha $|a|=0$, akkor az alábbi két eset lehetséges:
    content: |
      \begin{aligned}a&=0\\-a&=0\end{aligned}

# --- Remark ---
type: remark
name: asszocialt-megjegyzes
content:
  - type: narrative
    content: |
      Egy testben bármely $a\neq 0$ és...
```

**Field presence rules:**

| Entity type | `proofs` field | `remarks` field | `references` field |
|---|---|---|---|
| `theorem` | always (empty list if none) | always (empty list if none) | present only when content contains cross-references |
| `definition` | absent | always (empty list if none) | present only when content contains cross-references |
| `proof` | absent | always (empty list if none) | present only when content contains cross-references |
| `remark` | absent | absent | present only when content contains cross-references |

**Field order within a file:** `type` → `name` → `proofs` (theorems only) → `remarks` (all except remark) → `references` (when present) → `content`.

---

## `references` field

The `references` field declares every cross-reference that appears in the entity's `content`. It is a mapping from a **local reference key** to a **target descriptor**:

```yaml
references:
  {local-reference-key}:
    target:
      type: {definition|theorem|proof|remark}
      name: {target-entity-slug}
```

- The local reference key equals the slug of the target entity (they are always identical in phase 1).
- Entries are sorted alphabetically by key.
- Inside `content`, a cross-reference is written as `[{local-reference-key}]` — a bare bracket expression matching the key in `references`.
- One entry per unique target; if the same entity is referenced multiple times in a single file, it appears once in `references` and multiple times in `content`.

**Example** (from `abszolutertek-euklideszi-norma-bizonyitas.yaml`):

```yaml
references:
  egesz-szamok-abszoluterteke:
    target:
      type: definition
      name: egesz-szamok-abszoluterteke
  rendezett-gyuru:
    target:
      type: definition
      name: rendezett-gyuru
```

Used in content as:

```
...képhalmaza a [egesz-szamok-abszoluterteke] alapján valóban...
...teljesíti a [rendezett-gyuru]ban megfogalmazott rendezési axiómákat...
```

Note that Hungarian grammatical suffixes attach directly after the closing bracket: `[rendezett-gyuru]ban`, `[euklideszi-gyuru]t`, `[peano-osszeadas]jának`, etc.

---

**Associations** are extracted from the WordPress database dump:
- `remarks` lists are built from `yp_remarked_by` taxonomy relationships
- `proofs` lists are built from `yp_proven_by` taxonomy relationships

---

## Chapter YAML structure

```yaml
type: chapter
name: 01-alice-es-bob-szinrelep
title: Alice és Bob színrelép

abstract:
  - type: narrative
    content: |
      ...

prologue:
  - type: narrative
    content: |
      ...

sections:
  - 01-a-kriptografia-megjelenese
  - 02-a-caesar-kod
  - ...

epilogue:
  - type: narrative
    content: |
      ...
```

### Detecting abstract, prologue, epilogue, sections

| Part | Source |
|---|---|
| **abstract** | All `wp:paragraph` elements **before** the first `wp:paragraph {"dropCap":true}` |
| **prologue** | The `wp:paragraph {"dropCap":true}` element and all subsequent `wp:paragraph` elements **until the first `wp:heading`** |
| **sections** | Content between `wp:heading` elements (see below) |
| **epilogue** | The bold-italic closing paragraph(s) at the very end of the last section (series teaser + "next article" link) — these are **excluded** from the last section's body |

The epilogue paragraphs are recognizable as `<p><strong><em>A sorozat következő...</em></strong></p>` and the "következő részt itt találod" link paragraph.

---

## Section YAML structure

```yaml
type: section
name: 02-a-caesar-kod
title: A Caesar-kód

body:
  - type: narrative
    content: |
      ...
  - type: figure
    lead-in: |
      Optional intro sentence for the figure.
    src: 01-caesar-kod.jpg
    alt: ...
    caption: ...
  - type: formula
    lead-in: |
      Optional intro sentence for the formula.
    content: |
      \begin{aligned}x &= 1 \\ y &= 2\end{aligned}
  - type: unordered-list
    lead-in: |
      Optional intro sentence for the list.
    items:
      - "**Bold label:** plain text item"
      - 'Item containing "quotes"'
  - type: typewriter
    lead-in: |
      Optional intro sentence for the table.
    rows:
      - "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
      - "_OP_QRSTUVWXYZABCDEF_G_HIJKLMN"
  - type: unknown
    content: |
      <raw inner HTML>
```

---

## WordPress block → YAML type mapping

| WordPress block | YAML type | Notes |
|---|---|---|
| `wp:paragraph` | `narrative` | Strip HTML tags, convert formatting (see below) |
| `wp:image` | `figure` | `src`, `alt`, `caption` fields; optional `lead-in` |
| `wp:shortcode` with `[latex display="true"]` | `formula` | Display (block) formula; extract body only, optional `lead-in` |
| `wp:list` (`<ul>...</ul>`) | `unordered-list` | Bulleted list; items as markdown strings, optional `lead-in` |
| `wp:quote` | `unknown` | Preserve raw inner HTML in `content` field |
| `wp:paragraph {"align":"center","className":"typewriter"}` | `typewriter` | Monospace alignment block; `<br>` → rows, `&nbsp;` → spaces, `<u>` → `_text_`; optional `lead-in` |
| `wp:html` containing `<div id="...">` | **skip** | Navigation anchors that appear between sections; do not include in any section body |

If a new block type is encountered that doesn't fit an existing mapping, use
`type: unknown` and put the raw inner HTML as the `content` value.

---

## Content formatting rules (for `narrative` type)

Strip all HTML tags except as noted below, and apply these conversions:

| HTML | YAML markdown |
|---|---|
| `<strong>text</strong>` | `**text**` |
| `<em>text</em>` | `text` (italic stripped, plain text kept) |
| `<em><strong>text</strong></em>` or `<strong><em>text</em></strong>` | `***text***` |
| `<a href="...">text</a>` | `text` (link URL dropped) |
| `<sup>text</sup>` | `^text^` |
| `[latex]{formula}[/latex]` (inline shortcode) | `${formula}$` |
| `[yp_element slug="..." type="link" /]` | `[{slug}]` — converted to local reference notation; the slug must appear as a key in the entity's `references` field |
| Unicode U+2013 (–, en-dash) | `&ndash;` |
| `<br>` inside narrative | newline |
| Hungarian typographic quotes „..." | `"..."` (convert to straight double quotes) |

### Word-break italics
When italic markup wraps a word that has a grammatical suffix attached outside
the tags (e.g. `<em>nyílt szöveg</em>nek`), the suffix stays outside the
markers: `***nyílt szöveg***nek`.

---

## Unordered list handling

`type: unordered-list` items are converted from `<ul>...</ul>` HTML lists.

1. Extract each `<li>...</li>` element and strip the HTML wrapper.
2. Convert inline HTML within each item using the same rules as narrative content:
   `<strong>` → `**`, `<strong><em>` → `***`, `<em>` → plain text, `<a>` → text only,
   `<sup>` → `^text^`, `&amp;` → `&`, `&nbsp;` → ` `.
3. Quote each item as a YAML string: use single quotes `'...'` if the text contains `"`,
   otherwise double quotes `"..."`.
4. Add `lead-in` using the same rule as for figures and formulas: if the immediately preceding
   narrative paragraph ends with an introductory sentence (ending with `:`), split that sentence
   out and place it in `lead-in`.

---

## Typewriter block handling

`type: typewriter` represents monospace-aligned multi-row blocks (cipher tables, alphabet shift tables,
encoding examples) rendered with a typewriter font where each column position must align across all rows.

Source HTML: `<p class="has-text-align-center typewriter">row1<br>row2<br>row3</p>`

1. Split the inner HTML on `<br>` tags; each segment becomes one item in `rows:`.
2. Normalize `&nbsp;` → regular space ` ` (preserve multiple spaces for column alignment).
3. Convert `<u>text</u>` → `_text_` (single underscores mark underlined characters).
4. Strip any remaining HTML tags.
5. Quote each row as a YAML double-quoted string `"..."`.
6. Add `lead-in` using the same rule as for figures and formulas: if the immediately preceding
   narrative paragraph ends with an introductory sentence (ending with `:`), split that sentence
   out and place it in `lead-in`.

---

## Formula handling

`type: formula` items contain a raw LaTeX expression as their `content` (no shortcode wrapper).

1. Strip the `[latex display="true"]` prefix and `[/latex]` suffix from the shortcode body.
2. Unescape HTML entities within the formula body: `&amp;` → `&` (LaTeX column separator
   used in `aligned` environments), etc.
3. Wrap the formula body at 115 chars like any other block scalar.
4. Add `lead-in` using the same rule as for figures: if the immediately preceding narrative
   paragraph ends with an explicit introductory sentence (ending with `:`), split that sentence
   out of the narrative and place it in `lead-in`.

---

## Figure handling

1. Download the image from the `src` URL in the `wp:image` block.
2. Save it under the article's `figures/` subfolder with a sequential
   zero-padded name: `01-{description}.jpg`, `02-{description}.jpg`, etc.
   Use a short English or transliterated kebab description derived from the
   figure caption or context.
3. Set `src: {filename}` in the YAML (the `figures/` subfolder is implicit).
4. Set `alt` from the `alt` attribute of the `<img>` tag (or the caption if
   `alt` is empty).
5. Set `caption` from the `<figcaption>` element.
6. Add `lead-in` only when the immediately preceding narrative paragraph ends
   with an explicit introductory sentence for the figure (e.g. "Az alábbi ábra
   ... mutatja:"). In that case, split that sentence out of the narrative and
   place it in `lead-in`. If the narrative does not have such a sentence, omit
   `lead-in`.

---

## Line wrapping

Wrap all block scalar content fields (`content: |`, `lead-in: |`) at
**115 Unicode characters** per line (not bytes — Hungarian multi-byte UTF-8
characters each count as 1). Use the `wrap_yaml.py` script at the repo root
to apply wrapping consistently across all files in a folder.

---

## Naming conventions

### Article (chapter) file
`{nn}-{kebab(post_title)}.yaml`

Kebab conversion: lowercase, transliterate Hungarian characters
(`á→a`, `é→e`, `í→i`, `ó→o`, `ö→o`, `ő→o`, `ú→u`, `ü→u`, `ű→u`),
replace non-alphanumeric with `-`, collapse consecutive `-`.

### Section files
`{mm}-{kebab(h4_heading_text)}.yaml`
Apply the same kebab conversion to the heading text.

### Figure files
`{kk}-{kebab(short_description)}.jpg`
Sequential within the article, starting at 01.

---

## Scripts

| Script | Purpose |
|---|---|
| `wrap_yaml.py` | Re-wraps all `field: |` block scalars at 115 chars across a directory tree |
| `extract_articles.py` | Extracts raw `post_content` HTML for all 27 article posts from the SQL dump |
| `data-preprocessing/phase-1/convert_references.py` | Converts all `[yp_element slug="..." type="link" /]` shortcodes in math entity YAML files to `[slug]` notation and populates the `references:` field |

---

## Reference: article 01 section list

| File | Title |
|---|---|
| `01-a-kriptografia-megjelenese.yaml` | A kriptográfia megjelenése |
| `02-a-caesar-kod.yaml` | A Caesar-kód |
| `03-a-vigenere-kod.yaml` | A Vigenére-kód |
| `04-a-kriptografia-alapelve.yaml` | A kriptográfia alapelve |
| `05-az-enigma.yaml` | Az Enigma |
| `06-az-enigma-mukodese.yaml` | Az Enigma működése |
| `07-az-enigma-feltorese.yaml` | Az Enigma feltörése |
| `08-a-kulcsmegosztas-problemaja.yaml` | A kulcsmegosztás problémája |
