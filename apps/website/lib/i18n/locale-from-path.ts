import { DEFAULT_LOCALE, isLocale } from './config'

/**
 * The locale of the page we landed on.
 *
 * Every site URL is `/{locale}/...` (see docs/i18n-design.md), so the first path
 * segment identifies the locale wherever we land — that holds for a deep article
 * page as much as for the homepage, which matters because the confirm redirect
 * returns the user to `source_page`, not to `/{locale}`. The apex `/` is the one
 * path with no locale segment, and it redirects to `/{DEFAULT_LOCALE}` before any
 * of this runs; the isLocale guard covers it regardless.
 *
 * Read back rather than constructed, so buildLocalizedUrl stays the only thing
 * that composes locale paths. Needed at all because the components that call it
 * are mounted from the ROOT layout, which sits above the [locale] segment and has
 * no locale param.
 *
 * Touches `window`, so it must be called from an effect, never during render.
 */
export function localeFromPath(): string {
  const seg = window.location.pathname.split('/')[1] ?? ''
  return isLocale(seg) ? seg : DEFAULT_LOCALE
}
