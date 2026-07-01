/**
 * Normalize an incoming request pathname into the canonical form used for
 * manifest lookups and admin-path matching. This MUST be applied consistently
 * to both the request path and (implicitly, via the schema) the manifest keys
 * so that a lookup is an exact match.
 *
 * Rules:
 *  - Decode percent-encoding once (so "/foo%20bar" matches "/foo bar"). Already
 *    decoded by `URL.pathname`? No — `URL.pathname` keeps it encoded, so we
 *    decode here explicitly.
 *  - Collapse to a single leading slash; guarantee a leading slash.
 *  - Strip a trailing slash, EXCEPT for the root path "/".
 *  - Matching is case-SENSITIVE. WordPress slugs are conventionally lowercase
 *    and case-sensitive at the path level; revisit only if the live site is
 *    found to serve mixed-case slugs that must match case-insensitively.
 */
export function normalizePath(pathname: string): string {
  let path = pathname;

  // Decode percent-encoding. Be defensive: a malformed escape sequence throws,
  // in which case we fall back to the raw pathname rather than 500-ing.
  try {
    path = decodeURIComponent(path);
  } catch {
    path = pathname;
  }

  if (!path.startsWith("/")) {
    path = "/" + path;
  }

  // Collapse any run of leading slashes to one.
  path = path.replace(/^\/+/, "/");

  // Strip trailing slash(es) except when the whole path is just "/".
  if (path.length > 1) {
    path = path.replace(/\/+$/, "");
    if (path === "") {
      path = "/";
    }
  }

  return path;
}
