# `.html`-stripping URL-rewrite Transform Rule for the youproof.org zone.
#
# The R2 content bucket stores every page as a `.html` object
# (`/` -> `index.html`, `/books/x/chapters/y` -> `books/x/chapters/y.html`; see
# docs/cdn-and-r2.md "R2 object keys"). Public URLs must NOT expose the `.html`
# extension, so this rule rewrites the request path at the edge to the
# corresponding object key before the request reaches R2.
#
# A Transform ruleset (phase http_request_transform) is a ZONE-LEVEL SINGLETON
# (one entrypoint per phase per zone), so it lives in this shared root. It is
# zone-wide, so it automatically covers BOTH hostnames (`youproof.org` and
# `staging.youproof.org`) — no per-host duplication needed.
#
# Two mutually-exclusive rules implement the contract logic:
#   1. path == "/"                         -> rewrite to "/index.html"
#   2. path != "/" AND not ending in "/"   -> rewrite to path + ".html"
#      AND path has no known file extension
#      AND path is not under "/api/"       (those are served by a Worker, not R2)
#
# "Has no known file extension" means the path does NOT end with `.html` or any
# of the asset extensions in local.asset_extensions (locals.tf) — so real assets
# like `/styles/app.css` or `/img/logo.svg` (and directly-requested `.html`) are
# left untouched and served straight from R2, while extensionless page paths get
# `.html` appended.
#
# This is done with `ends_with()` rather than a regex because the Cloudflare
# Rules `matches` (regex) operator is Business/Enterprise-only — NOT available on
# this account's Free plan. The trade-off: it recognizes only the enumerated
# extensions, not "any extension"; keep local.asset_extensions in sync with the
# file types the Next.js static export emits (see locals.tf).
resource "cloudflare_ruleset" "html_rewrite" {
  zone_id     = cloudflare_zone.youproof_org.id
  name        = "strip .html extension (path -> R2 object key)"
  description = "Rewrite extensionless request paths to their .html object in the R2 content bucket"
  kind        = "zone"
  phase       = "http_request_transform"

  rules = [
    {
      description = "root -> /index.html"
      expression  = "http.request.uri.path == \"/\""
      action      = "rewrite"
      action_parameters = {
        uri = {
          path = {
            value = "/index.html"
          }
        }
      }
    },
    {
      description = "extensionless path -> path + .html"
      # not "/", not a trailing-slash "directory" path, not already ending in a
      # known asset extension or `.html`, and NOT under `/api/`. The `/api/`
      # exclusion keeps the newsletter Worker's API paths
      # (`/api/v1/newsletter/*`, served by a Worker on the route — not R2)
      # unrewritten; without it they'd be turned into `<path>.html` before the
      # Worker runs and match no route. Regex-free (Free-plan compatible) — see
      # the header note and locals.tf.
      expression = "http.request.uri.path != \"/\" and not ends_with(http.request.uri.path, \"/\") and not starts_with(http.request.uri.path, \"/api/\") and not (${local.asset_ext_match} or ends_with(http.request.uri.path, \".html\"))"
      action     = "rewrite"
      action_parameters = {
        uri = {
          path = {
            # Dynamic value: append ".html" to whatever path came in.
            expression = "concat(http.request.uri.path, \".html\")"
          }
        }
      }
    },
  ]
}
