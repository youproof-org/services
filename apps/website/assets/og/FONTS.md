# Bundled fonts (OG image generation)

These TrueType files are build inputs for `scripts/gen-og-images.mjs`, which
renders the OpenGraph share images at build time (via `@resvg/resvg-js`). They
are **not** shipped to the browser — the site loads its web fonts separately.

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
