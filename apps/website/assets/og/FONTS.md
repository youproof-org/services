# Bundled fonts (OG image generation + the wordmark web font)

These TrueType files are build inputs for `scripts/gen-og-images.mjs`, which
renders the OpenGraph share images at build time (via `@resvg/resvg-js`), and —
for `GoogleSans-Medium.ttf` only — for `scripts/gen-wordmark-font.mjs`, which
subsets it to the `siteName` glyphs and emits the self-hosted wordmark face at
`public/assets/generated/google-sans-wordmark.otf`.

So `GoogleSans-Medium.ttf` **does** reach the browser, but only as that ~3 KB
subset; the full files are never served. Mulish is handled separately by
`next/font/google`, which self-hosts it at build time.

Both are licensed under the **SIL Open Font License, Version 1.1**
(<https://openfontlicense.org>). The full license text and copyright are embedded
in each file's `name` table (name IDs 0/13/14). Per the OFL, this attribution is
provided and the font names are unmodified.

| File | Family | Source | License |
| --- | --- | --- | --- |
| `GoogleSans-Medium.ttf` | Google Sans (500) | Google Fonts (`fonts.google.com`) | OFL 1.1, © Google LLC |
| `GoogleSans-Regular.ttf` | Google Sans (400) | Google Fonts | OFL 1.1, © Google LLC |
| `Mulish-Italic.ttf` | Mulish (italic) | Google Fonts / <https://github.com/googlefonts/mulish> | OFL 1.1, © The Mulish Project Authors |

`GoogleSans-Medium` is the wordmark, `GoogleSans-Regular` the (lighter) tagline
(mirroring the site's `--font-wordmark` stack); `Mulish-Italic` is the motto
(mirroring the hero tagline). To refresh, re-download the corresponding weights
from Google Fonts.

Redistributing the `GoogleSans-Medium` subset as a web font is permitted by the
OFL, which allows redistribution of the font and of derivative (subset) works.
`gen-wordmark-font.mjs` copies the copyright notice and license URL into the
generated file's `name` table (and fails the build if they don't carry over), and
renames the family to `Google Sans Wordmark` — the source declares no Reserved Font
Name, so this is allowed, and it keeps the subset from clashing with a full
Google Sans installation.
