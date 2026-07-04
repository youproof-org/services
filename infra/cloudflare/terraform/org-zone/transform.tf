# `.html`-stripping URL-rewrite Transform Rule for the youproof.org zone.
#
# The R2 content bucket stores every page as a `.html` object
# (`/` -> `index.html`, `/books/x/chapters/y` -> `books/x/chapters/y.html`; see
# the implementation contract "R2 object keys"). Public URLs must NOT expose the
# `.html` extension, so this rule rewrites the request path at the edge to the
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
#      AND path has no file extension
#
# "No file extension" = the last path segment contains no "." (so real assets
# like `/styles/app.css` or `/img/logo.svg`, which have an extension, are left
# untouched and served straight from R2). Expressing "the last segment has a
# dot" cleanly requires the regex `matches` operator: `\.[^/.]+$` = a dot
# followed by one-or-more non-slash/non-dot chars at end of the path.
#
# TODO verify plan tier: the `matches` (regex) operator in rules expressions
# requires a Cloudflare plan with regex support (Pro/Business+; not Free). If
# this zone is on a plan without regex, replace rule 2's extension check with an
# explicit `not (ends_with(path,".css") or ends_with(path,".js") or ...)` chain
# over the known asset extensions (mirrors the regex-free style used in
# redirects.tf). Kept as regex here because it is the correct general form.
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
      # not "/", not a trailing-slash "directory" path, and the last segment has
      # no extension (no dot). See the regex/plan-tier note in the header.
      expression = "http.request.uri.path != \"/\" and not ends_with(http.request.uri.path, \"/\") and not http.request.uri.path matches \"\\\\.[^/.]+$\""
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
