/**
 * Origin/Referer allowlist — the CSRF-equivalent for a static, session-less
 * site: the subscribe POST is only accepted when it demonstrably originates from
 * one of our own pages. There are no cookies/ambient credentials, so this
 * (together with Turnstile + rate limiting, phase 4) is the anti-forgery/abuse
 * layer rather than a server-anchored CSRF token.
 */

/** Parse a comma-separated allowlist env value into a set of origins. */
function parseAllowed(csv: string): Set<string> {
  return new Set(
    csv
      .split(",")
      .map((s) => s.trim().replace(/\/+$/, ""))
      .filter((s) => s.length > 0),
  );
}

function originOf(value: string | null): string | null {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

/**
 * True when the request's Origin (preferred) or, absent that, its Referer maps
 * to an allowed origin. If neither header is present we reject — a legitimate
 * browser fetch always sends at least one for a cross- or same-origin POST.
 */
export function isAllowedOrigin(request: Request, allowedCsv: string): boolean {
  const allowed = parseAllowed(allowedCsv);
  if (allowed.size === 0) return false;

  const origin = request.headers.get("origin");
  if (origin) return allowed.has(origin.replace(/\/+$/, ""));

  const referer = originOf(request.headers.get("referer"));
  if (referer) return allowed.has(referer);

  return false;
}
