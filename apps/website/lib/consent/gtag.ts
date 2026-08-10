import { gaCookieClearStrings, gaCookieNames, hasGaCookies } from './cookies'

/**
 * Google Analytics 4 glue, including Consent Mode v2.
 *
 * Public by design and inlined into the static export at build time, like
 * NEXT_PUBLIC_TURNSTILE_SITEKEY. Empty is the kill switch: with no ID nothing
 * here does anything and ConsentGate renders no UI at all, which is what lets
 * this code ship to production before the GA4 properties exist.
 */
export const measurementId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID ?? ''

const SCRIPT_ID = 'ga4-gtag-script'

declare global {
  interface Window {
    dataLayer?: unknown[]
    gtag?: (...args: unknown[]) => void
  }
}

/**
 * Why there is no inline <head> script anywhere in this feature.
 *
 * The canonical Consent Mode recipe puts `consent default` in an inline head
 * script because gtag.js loads immediately afterwards and the two are racing.
 * Here there is no race: gtag.js is never appended unless the stored decision is
 * `granted`. What actually guarantees correct ordering is position in
 * `window.dataLayer` — a plain array that gtag.js drains in order whenever it
 * eventually loads — not wall-clock timing. So pushing `consent default` before
 * `consent update` before `config` from an effect is exactly as correct as doing
 * it from the document head, and it keeps the "nothing loads before consent"
 * rule enforceable by inspection.
 */
export function ensureDataLayer(): void {
  window.dataLayer = window.dataLayer || []
  if (!window.gtag) {
    // Must be a function declaration, not an arrow: gtag.js expects the raw
    // `arguments` object, exactly as Google's own snippet pushes it.
    window.gtag = function gtag() {
      // eslint-disable-next-line prefer-rest-params
      window.dataLayer!.push(arguments)
    }
  }
}

function gtag(...args: unknown[]): void {
  window.gtag?.(...args)
}

/**
 * Deny everything up front. This is the SECONDARY gate — the primary one is that
 * no script is injected at all. Do not delete it as dead code: it is what makes
 * the tag's own SDK behave correctly if it ever loads by another route, and it is
 * what a Consent Mode audit looks for.
 */
export function setDefaultConsentDenied(): void {
  gtag('consent', 'default', {
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
    analytics_storage: 'denied',
  })
  // No `wait_for_update`: it exists so an already-loaded tag will pause for an
  // async CMP's answer, which cannot happen here.
}

/**
 * Google's documented per-property opt-out flag. Set defensively before any
 * injection so that re-granting later in the same session flips it back.
 */
function setTagDisabled(disabled: boolean): void {
  if (!measurementId) return
  ;(window as unknown as Record<string, unknown>)[`ga-disable-${measurementId}`] = disabled
}

export function grantAnalyticsConsent(): void {
  setTagDisabled(false)
  gtag('consent', 'update', { analytics_storage: 'granted' })
}

/**
 * Remove GA4's own cookies.
 *
 * Called on withdrawal, but also on EVERY load where the stored decision does not
 * resolve to `granted` — a GA cookie can outlive the consent that created it in
 * several ways: the visitor cleared yp_consent by hand, it expired after 12
 * months, or the cookie-policy version moved on and the old grant no longer
 * covers it. GA is not loaded in any of those states, so the cookies would never
 * be transmitted; the reason to clear them anyway is that leaving them means a
 * later acceptance silently resumes the OLD client id instead of starting fresh,
 * and that a reader following the cookie policy's invitation to check DevTools
 * would find analytics cookies we told them were not there.
 */
export function clearAnalyticsCookies(): void {
  if (!hasGaCookies(document.cookie)) return
  for (const cookie of gaCookieClearStrings(
    window.location.hostname,
    gaCookieNames(document.cookie, measurementId),
    window.location.protocol === 'https:',
  )) {
    document.cookie = cookie
  }
}

/**
 * Withdraw consent without a page reload.
 *
 * A loaded gtag.js cannot be unloaded, and `consent update -> denied` on its own
 * does NOT stop network traffic — GA4 keeps sending cookieless consent-mode
 * pings, which would violate the "no requests to Google" requirement. So all
 * three steps are needed: tell the SDK, then hard-disable the tag, then remove
 * the cookies it already set.
 */
export function denyAnalyticsConsent(): void {
  gtag('consent', 'update', { analytics_storage: 'denied' })
  setTagDisabled(true)
  clearAnalyticsCookies()
}

/**
 * Append the tag and configure it. Idempotent via the script id, matching the
 * Turnstile injection in components/newsletter/NewsletterForm.tsx.
 *
 * `traffic_type` goes on `config` rather than on each event so it propagates to
 * everything this tag sends — the same way GA4's own internal-traffic tagging
 * works, and one less thing to forget at a future call site.
 */
export function loadTag({ internal }: { internal: boolean }): void {
  if (!measurementId) return
  setTagDisabled(false)

  // Queue configuration first: the array is drained in order once the script
  // arrives, so this cannot land after the tag has started reporting.
  gtag('js', new Date())
  gtag('config', measurementId, {
    // Page views are sent manually from ConsentGate — see sendPageView.
    send_page_view: false,
    ...(internal ? { traffic_type: 'internal' } : {}),
  })

  if (document.getElementById(SCRIPT_ID)) return
  const script = document.createElement('script')
  script.id = SCRIPT_ID
  script.async = true
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`
  document.head.appendChild(script)
}

/**
 * Send one page_view.
 *
 * `page_location` is CONSTRUCTED from origin + pathname rather than read from
 * `location.href`, which drops the query string on purpose: newsletter
 * confirmation links arrive carrying single-use tokens (`?newsletter_ask=confirm
 * &sid=…&stok=…`), and those must never reach Google. NewsletterLanding scrubs
 * them in its own mount effect, but sibling effect ordering is not something to
 * bet single-use tokens on. No page on this site is query-driven, so nothing is
 * lost.
 */
export function sendPageView(pathname: string): void {
  if (!measurementId) return
  gtag('event', 'page_view', {
    page_location: `${window.location.origin}${pathname}`,
    page_path: pathname,
    page_title: document.title,
  })
}
