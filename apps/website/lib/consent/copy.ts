import { DEFAULT_LOCALE } from '@/lib/i18n/config'

/**
 * Consent UI strings.
 *
 * Not in lib/i18n/locales.json: that file's `labels` dictionary is typed as flat
 * single-line strings and `getLocaleLabel` throws on a missing key, neither of
 * which suits multi-sentence copy — and it is also read by a plain .mjs
 * redirect-manifest generator. A dedicated module keeps the shape honest while
 * staying data-driven for a future locale.
 *
 * Register matches the rest of the site: informal second person, plain
 * statements, no scare quotes around "sütik".
 *
 * Deliberately PURPOSE-NEUTRAL: the copy talks about "sütik, amelyek nem
 * szükségesek a működéshez" and never names Google Analytics or any other
 * specific tool. The banner is the consent surface for whatever non-essential
 * cookies the site uses — analytics today, possibly more later — and the linked
 * policy pages are where the specifics belong, so a new purpose needs a content
 * edit and a version bump, not a copy rewrite here. Do not reintroduce
 * tool-specific wording.
 */

export interface ConsentCopy {
  /** Landmark label for the banner region. */
  bannerLabel: string
  bannerText: string
  accept: string
  reject: string
  /** Precedes the policy-page links. */
  detailsIntro: string
  fabLabel: string
  dialogTitle: string
  dialogText: string
  optionGranted: string
  optionDenied: string
  save: string
  cancel: string
  /** Prefixes the stored decision's date. */
  decidedOn: string
  decisionGranted: string
  decisionDenied: string
}

const COPY: Record<string, ConsentCopy> = {
  hu: {
    bannerLabel: 'Süti-hozzájárulás',
    bannerText:
      'A működéshez szükséges sütiken túl olyan sütiket is használunk, amelyekhez a ' +
      'hozzájárulásod kell. Az alábbi tájékoztatókban bővebben olvashatsz ezekről.',
    accept: 'Engedélyezem',
    reject: 'Elutasítom',
    detailsIntro: 'Részletek:',
    fabLabel: 'Süti-beállítások',
    dialogTitle: 'Süti-beállítások',
    dialogText:
      'Itt bármikor megváltoztathatod, hogy engedélyezed-e a hozzájáruláshoz kötött ' +
      'sütiket. A döntésed csak ebben a böngészőben érvényes.',
    optionGranted: 'Engedélyezem a hozzájáruláshoz kötött sütiket',
    optionDenied: 'Csak a működéshez szükséges sütiket engedélyezem',
    save: 'Mentés',
    cancel: 'Mégsem',
    decidedOn: 'A mostani döntésed',
    decisionGranted: 'engedélyezve',
    decisionDenied: 'elutasítva',
  },
}

export function getConsentCopy(locale: string): ConsentCopy {
  return COPY[locale] ?? COPY[DEFAULT_LOCALE] ?? COPY.hu
}
