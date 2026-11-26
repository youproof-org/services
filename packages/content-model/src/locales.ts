/** The configured locale codes in a parsed `locales.json`, in the order it lists them. */
export function localeCodes(data: unknown): string[] {
  const locales = typeof data === 'object' && data !== null ? (data as { locales?: unknown }).locales : undefined
  if (typeof locales !== 'object' || locales === null || Array.isArray(locales)) {
    throw new Error("locales.json has no 'locales' mapping of locale codes to their configuration")
  }
  return Object.keys(locales)
}
