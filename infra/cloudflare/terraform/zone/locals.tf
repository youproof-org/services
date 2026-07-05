# Shared locals for the youproof.org zone rulesets (transform.tf + cache.tf).
#
# The Cloudflare Rules language's regex `matches` operator is Business/Enterprise
# only — it is NOT available on Free or Pro. This account is on the Free plan, so
# "does the path have a file extension?" is expressed WITHOUT regex, by testing
# `ends_with()` against a known, enumerated set of asset extensions.
#
# Trade-off vs. a general regex: this matches only the extensions listed below,
# not "any extension". That is fine for a Next.js static export (a finite, known
# set of file types; pages themselves are extensionless), but this list MUST be
# kept in sync with the file types the export actually emits — add new asset
# types here if they ever appear.
locals {
  # Static-asset file extensions: served straight from R2 with a long TTL
  # (cache.tf rule 1) and left untouched by the .html-append rewrite
  # (transform.tf rule 2). NOTE: `.html` is deliberately NOT in this list — HTML
  # gets its own short-TTL cache rule, and the transform rule handles `.html`
  # separately (a request already ending in `.html` must not get another `.html`).
  asset_extensions = [
    ".css", ".js", ".mjs", ".json", ".map", ".txt", ".xml", ".ico",
    ".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp", ".avif",
    ".woff", ".woff2", ".ttf", ".otf", ".eot",
  ]

  # Rules-expression fragment: true when the request path ends with any asset
  # extension above. Built once here so transform.tf and cache.tf can't drift.
  # e.g. `ends_with(http.request.uri.path, ".css") or ends_with(...) or ...`.
  asset_ext_match = join(" or ", [
    for e in local.asset_extensions : "ends_with(http.request.uri.path, \"${e}\")"
  ])
}
