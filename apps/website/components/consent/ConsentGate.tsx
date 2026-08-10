'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { DEFAULT_LOCALE } from '@/lib/i18n/config'
import { localeFromPath } from '@/lib/i18n/locale-from-path'
import { getConsentCopy } from '@/lib/consent/copy'
import { parseGaDebugParam } from '@/lib/consent/cookies'
import { policyPagesForLocale } from '@/lib/consent/pages'
import { resolveDecision } from '@/lib/consent/record'
import type { ConsentDecision, ConsentRecord } from '@/lib/consent/record'
import { readConsent, readExclusion, setExclusion, writeConsent } from '@/lib/consent/storage'
import { cookiePolicyVersion, isConsentConfigured, policyPages } from '@/lib/consent/version'
import {
  clearAnalyticsCookies,
  denyAnalyticsConsent,
  ensureDataLayer,
  grantAnalyticsConsent,
  loadTag,
  measurementId,
  sendPageView,
  setDefaultConsentDenied,
} from '@/lib/consent/gtag'
import ConsentBanner from './ConsentBanner'
import ConsentDialog from './ConsentDialog'
import ConsentFab from './ConsentFab'

/**
 * Owns the consent decision and everything that follows from it.
 *
 * Mounted from the root layout as a sibling of `.page-root` — see the comment
 * there: `.page-root` carries `transform: translateZ(0)`, which makes it a
 * containing block for `position: fixed`, so a banner or FAB inside it would
 * centre on the document instead of the viewport.
 *
 * ## Why nothing renders on the server
 *
 * The static export is byte-identical for every visitor (R2 + CDN, no server, no
 * cookie-aware edge render), so the markup cannot know whether this visitor has
 * already decided. `mode` therefore starts as 'unresolved' and renders NOTHING;
 * the decision is made in the mount effect. Consequences, all of them wanted:
 * server HTML matches first client HTML so there is no hydration mismatch, and a
 * returning visitor never sees a flash of banner because the banner was never in
 * the markup to begin with.
 *
 * That is also why there is no inline <head> script setting a class on <html> to
 * pre-hide things — there is nothing to hide. check-analytics-build.mjs asserts
 * the banner copy never appears in the exported HTML, so this property cannot
 * regress silently.
 */

type Mode = 'unresolved' | 'hidden' | 'banner'

/** Nothing to ask about without both a tag to gate and a policy to point at. */
const ENABLED = measurementId !== '' && isConsentConfigured

export default function ConsentGate() {
  const pathname = usePathname()
  const [mode, setMode] = useState<Mode>('unresolved')
  const [record, setRecord] = useState<ConsentRecord | null>(null)
  const [granted, setGranted] = useState(false)
  const [excluded, setExcluded] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [locale, setLocale] = useState(DEFAULT_LOCALE)
  const fabRef = useRef<HTMLButtonElement | null>(null)
  const lastSentPath = useRef<string | null>(null)

  useEffect(() => {
    if (!ENABLED) return
    setLocale(localeFromPath())

    // Order matters, but only within the dataLayer array — see gtag.ts. The
    // queue must read: consent default (denied) -> consent update -> config.
    ensureDataLayer()
    setDefaultConsentDenied()

    // The debug switch is applied BEFORE the consent decision, so even the very
    // first page_view of an excluded visit carries traffic_type: internal.
    const debug = parseGaDebugParam(window.location.search)
    if (debug) {
      setExclusion(debug === 'exclude')
      // Scrub the param, matching NewsletterLanding's replaceState. Both siblings
      // scrub in their own mount effects and both re-read window.location.search
      // at the top of them, so neither can clobber the other's params — do not
      // "optimise" either one into caching the search string.
      const params = new URLSearchParams(window.location.search)
      params.delete('ga_debug')
      const qs = params.toString()
      window.history.replaceState(
        null,
        '',
        window.location.pathname + (qs ? `?${qs}` : '') + window.location.hash,
      )
    }
    const internal = readExclusion()
    setExcluded(internal)

    const stored = readConsent()
    setRecord(stored)
    const resolved = resolveDecision(stored, Date.now(), cookiePolicyVersion)
    if (resolved === 'granted') {
      setGranted(true)
      grantAnalyticsConsent()
      loadTag({ internal })
    } else {
      // GA cookies can outlive the consent that created them — the visitor cleared
      // yp_consent by hand, it expired, or the policy version moved on. Sweep them
      // here rather than only on an explicit withdrawal, so "not granted" always
      // means "no analytics cookies present". See clearAnalyticsCookies.
      clearAnalyticsCookies()
    }
    setMode(resolved === 'ask' ? 'banner' : 'hidden')
  }, [])

  // One page_view per pathname, sent manually because Next's client-side
  // navigations are History API pushes that no GA4 config call sees. The GA4
  // admin toggle for history-based page views is deliberately OFF so this is the
  // only thing emitting them; usePathname also updates on popstate, so back and
  // forward are covered. useSearchParams is deliberately NOT used: under
  // `output: 'export'` it forces a Suspense boundary, and the query string must
  // not reach GA anyway (see sendPageView).
  useEffect(() => {
    // `mode === 'unresolved'` means the mount effect has not read the stored
    // decision yet. Bailing out here is load-bearing, not defensive: `granted`
    // starts false, so acting on it before resolution would sweep the _ga cookies
    // on EVERY page load and the tag would then mint a fresh client id each time —
    // making every reload look like a brand-new user.
    if (!ENABLED || !pathname || mode === 'unresolved') return

    if (!granted) {
      // Sweep again on every navigation while consent is withheld.
      //
      // Withdrawal disables the tag immediately, so no further data is sent — but
      // gtag.js is still loaded in the page and re-creates its cookies shortly
      // after clearAnalyticsCookies() removes them, so a withdrawal mid-session
      // leaves them visible until the next full page load. Re-sweeping here clears
      // them at the next navigation instead, without reloading the page and losing
      // the reader's place. Cheap: the sweep no-ops unless a _ga cookie is present.
      clearAnalyticsCookies()
      return
    }

    if (lastSentPath.current === pathname) return
    lastSentPath.current = pathname

    // Defer one frame before reading document.title.
    //
    // sendPageView reads the title when it is called, and gtag takes plain values —
    // there is no way to have Google read it at the moment it actually transmits. So
    // the closest we get to "read it late" is waiting for the next paint, which is
    // after any follow-up commit React makes. Metadata does appear to be applied in
    // the same commit as the pathname change today, so this is hardening against a
    // slower device or a route whose metadata resolves later, not a fix for an
    // observed wrong title. Cancelled if we navigate again first, so a quick
    // A -> B never reports A's page_view with B's title.
    const frame = requestAnimationFrame(() => sendPageView(pathname))
    return () => cancelAnimationFrame(frame)
  }, [granted, pathname, mode])

  if (!ENABLED || mode === 'unresolved') return null

  const copy = getConsentCopy(locale)
  const pages = policyPagesForLocale(policyPages, locale, DEFAULT_LOCALE)

  function apply(decision: ConsentDecision) {
    setRecord(writeConsent(decision, cookiePolicyVersion))
    if (decision === 'granted') {
      setGranted(true)
      grantAnalyticsConsent()
      loadTag({ internal: excluded })
    } else {
      setGranted(false)
      denyAnalyticsConsent()
    }
    setMode('hidden')
  }

  return (
    <>
      {mode === 'banner' && (
        <ConsentBanner
          copy={copy}
          locale={locale}
          pages={pages}
          onAccept={() => apply('granted')}
          onReject={() => apply('denied')}
        />
      )}

      {/* Only once a decision exists — while the banner is up, the banner IS the
          control, which also removes any question of the two colliding. */}
      {mode === 'hidden' && (
        <ConsentFab ref={fabRef} label={copy.fabLabel} onClick={() => setDialogOpen(true)} />
      )}

      {dialogOpen && (
        <ConsentDialog
          copy={copy}
          locale={locale}
          pages={pages}
          current={granted ? 'granted' : 'denied'}
          record={record}
          returnFocusRef={fabRef}
          onSave={(decision) => {
            apply(decision)
            setDialogOpen(false)
          }}
          onClose={() => setDialogOpen(false)}
        />
      )}
    </>
  )
}
