import { getContainerSegment } from './config'

/**
 * The single place a locale-prefixed public URL is constructed. Every internal
 * link, breadcrumb, sitemap entry, canonical/hreflang tag, and redirect target
 * must go through this — no component should string-concatenate `/{locale}/...`
 * by hand. Centralizing it makes cross-locale link bugs structurally hard to
 * introduce and keeps localized container segments (konyvek/fejezetek/…) out of
 * every call site.
 *
 * URL shapes (see docs/i18n-design.md §2):
 *   home        /{locale}
 *   book        /{locale}/{book}/{slug}
 *   chapter     /{locale}/{book}/{bookSlug}/{chapter}/{chapterSlug}
 *   article     /{locale}/{article}/{slug}
 *   newsletter  /{locale}/{newsletter}/{slug}
 *   landing     /{locale}/{landing}/{slug}
 *   page        /{locale}/{slug}                (no container segment)
 *   *-index     /{locale}/{container}           (listing pages)
 *
 * Knowledge base. Namespaces never appear: a node's URL
 * must survive a namespace reorganization, so definitions and theorems are flat
 * and the types that are *owned* by another node nest under their owner instead:
 *   kb-root            /{locale}/{kb}
 *   definitions-index  /{locale}/{kb}/{definition}
 *   theorems-index     /{locale}/{kb}/{theorem}
 *   glossary           /{locale}/{kb}/{term}
 *   definition         /{locale}/{kb}/{definition}/{slug}
 *   theorem            /{locale}/{kb}/{theorem}/{slug}
 *   proof              /{locale}/{kb}/{theorem}/{thm}/{proof}/{i}
 *   definition-remark  /{locale}/{kb}/{definition}/{def}/{remark}/{i}
 *   theorem-remark     /{locale}/{kb}/{theorem}/{thm}/{remark}/{i}
 *   proof-remark       /{locale}/{kb}/{theorem}/{thm}/{proof}/{i}/{remark}/{j}
 *
 * A proof and a remark are addressed by `{i}`, their 1-based position in the list
 * of the node that owns them (lib/content/urls.ts, kbOwnedIndex), where every other
 * type is addressed by its slug. Nothing here has to know that: an index reaches
 * this as the string it is spelled with, and `req`'s empty-segment guard holds for
 * it exactly as it does for a slug.
 *
 * A remark gets three keys rather than one variable-arity key so that `req`'s
 * exact segment count stays exact — a remark's parent chain differs in length
 * depending on what owns it, and collapsing that into one key would mean giving
 * up the arity check for every caller.
 */
export type UrlKey =
  | 'home'
  | 'book'
  | 'chapter'
  | 'article'
  | 'newsletter'
  | 'landing'
  | 'page'
  | 'books-index'
  | 'articles-index'
  | 'newsletter-index'
  | 'kb-root'
  | 'definitions-index'
  | 'theorems-index'
  | 'glossary'
  | 'definition'
  | 'theorem'
  | 'proof'
  | 'definition-remark'
  | 'theorem-remark'
  | 'proof-remark'

export function buildLocalizedUrl(locale: string, key: UrlKey, ...slugPath: string[]): string {
  const base = `/${locale}`
  switch (key) {
    case 'home':
      return base
    case 'page':
      return `${base}/${req(slugPath, 1, key)[0]}`
    case 'book':
      return `${base}/${getContainerSegment(locale, 'book')}/${req(slugPath, 1, key)[0]}`
    case 'chapter': {
      const [bookSlug, chapterSlug] = req(slugPath, 2, key)
      return `${base}/${getContainerSegment(locale, 'book')}/${bookSlug}/${getContainerSegment(locale, 'chapter')}/${chapterSlug}`
    }
    case 'article':
      return `${base}/${getContainerSegment(locale, 'article')}/${req(slugPath, 1, key)[0]}`
    case 'newsletter':
      return `${base}/${getContainerSegment(locale, 'newsletter')}/${req(slugPath, 1, key)[0]}`
    case 'landing':
      return `${base}/${getContainerSegment(locale, 'landing')}/${req(slugPath, 1, key)[0]}`
    case 'books-index':
      return `${base}/${getContainerSegment(locale, 'book')}`
    case 'articles-index':
      return `${base}/${getContainerSegment(locale, 'article')}`
    case 'newsletter-index':
      return `${base}/${getContainerSegment(locale, 'newsletter')}`

    // ── Knowledge base ──
    case 'kb-root':
      return `${base}/${kb(locale)}`
    case 'definitions-index':
      return `${base}/${kb(locale)}/${getContainerSegment(locale, 'definition')}`
    case 'theorems-index':
      return `${base}/${kb(locale)}/${getContainerSegment(locale, 'theorem')}`
    case 'glossary':
      return `${base}/${kb(locale)}/${getContainerSegment(locale, 'term')}`
    case 'definition':
      return `${base}/${kb(locale)}/${getContainerSegment(locale, 'definition')}/${req(slugPath, 1, key)[0]}`
    case 'theorem':
      return `${base}/${kb(locale)}/${getContainerSegment(locale, 'theorem')}/${req(slugPath, 1, key)[0]}`
    case 'proof': {
      const [theoremSlug, proofIndex] = req(slugPath, 2, key)
      return `${base}/${kb(locale)}/${getContainerSegment(locale, 'theorem')}/${theoremSlug}` +
        `/${getContainerSegment(locale, 'proof')}/${proofIndex}`
    }
    case 'definition-remark': {
      const [defSlug, remarkIndex] = req(slugPath, 2, key)
      return `${base}/${kb(locale)}/${getContainerSegment(locale, 'definition')}/${defSlug}` +
        `/${getContainerSegment(locale, 'remark')}/${remarkIndex}`
    }
    case 'theorem-remark': {
      const [theoremSlug, remarkIndex] = req(slugPath, 2, key)
      return `${base}/${kb(locale)}/${getContainerSegment(locale, 'theorem')}/${theoremSlug}` +
        `/${getContainerSegment(locale, 'remark')}/${remarkIndex}`
    }
    case 'proof-remark': {
      const [theoremSlug, proofIndex, remarkIndex] = req(slugPath, 3, key)
      return `${base}/${kb(locale)}/${getContainerSegment(locale, 'theorem')}/${theoremSlug}` +
        `/${getContainerSegment(locale, 'proof')}/${proofIndex}` +
        `/${getContainerSegment(locale, 'remark')}/${remarkIndex}`
    }
  }
}

/** The outer knowledge-base segment every KB page sits under. */
function kb(locale: string): string {
  return getContainerSegment(locale, 'knowledge-base')
}

function req(slugPath: string[], n: number, key: UrlKey): string[] {
  if (slugPath.length !== n || slugPath.some((s) => !s)) {
    throw new Error(`buildLocalizedUrl('${key}') expects ${n} slug segment(s), got [${slugPath.join(', ')}]`)
  }
  return slugPath
}
