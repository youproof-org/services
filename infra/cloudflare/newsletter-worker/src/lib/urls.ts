import type { Env } from "../types";

/**
 * Build an absolute https URL on the configured public site host from a
 * site-relative path (validated upstream to start with a single "/") plus query
 * params. Used for the confirm + unsubscribe landing redirects. Building from a
 * validated relative path (never a client-supplied absolute URL) keeps these
 * redirects closed against open-redirect abuse.
 */
export function siteUrl(
  env: Env,
  path: string,
  params: Record<string, string> = {},
): string {
  const base = `https://${env.SITE_HOST}`;
  const url = new URL(path.startsWith("/") ? path : `/${path}`, base);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return url.toString();
}

/** The `/{locale}` homepage path for a locale (falls back to DEFAULT_LOCALE). */
export function homePath(env: Env, locale?: string | null): string {
  const l = (locale && locale.trim()) || env.DEFAULT_LOCALE || "hu";
  return `/${l}`;
}
