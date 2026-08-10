'use client'

import { useEffect, useRef } from 'react'
import type { ConsentCopy } from '@/lib/consent/copy'
import type { PolicyPage } from '@/lib/consent/pages'
import PolicyLinks from './PolicyLinks'
import styles from './consent-banner.module.scss'

/**
 * First-visit consent bar. Presentational — ConsentGate owns all the state.
 *
 * Deliberately NOT a dialog: `role="region"` with a label, no `aria-modal`, no
 * autofocus, no focus trap. The site has to stay usable while the decision is
 * pending, so trapping focus or announcing the page as hidden would both be
 * wrong. There is no close button and Escape does not dismiss either —
 * dismissing without deciding is implied consent, and a dismissible banner has
 * to come back on the next page anyway.
 *
 * No aria-live: this is persistent interactive content, not a status message.
 * Being last in DOM order and a labelled landmark is the right discovery path.
 */

interface ConsentBannerProps {
  copy: ConsentCopy
  locale: string
  pages: readonly PolicyPage[]
  onAccept: () => void
  onReject: () => void
}

export default function ConsentBanner({
  copy,
  locale,
  pages,
  onAccept,
  onReject,
}: ConsentBannerProps) {
  const ref = useRef<HTMLDivElement>(null)

  // Publish the bar's height as `--consent-banner-height` on <html> so
  // globals.scss can pad the body by it — the bar is position:fixed, so without
  // this it permanently covers the bottom of the page, including the footer's
  // legal links. Same ResizeObserver pattern as layout/HeaderHeightProbe.tsx.
  // Cleared on unmount so the padding disappears with the banner.
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const apply = () =>
      document.documentElement.style.setProperty(
        '--consent-banner-height',
        `${el.offsetHeight}px`,
      )
    apply()
    const ro = new ResizeObserver(apply)
    ro.observe(el)
    return () => {
      ro.disconnect()
      document.documentElement.style.removeProperty('--consent-banner-height')
    }
  }, [])

  return (
    <div ref={ref} className={styles.banner} role="region" aria-label={copy.bannerLabel}>
      <div className={styles.inner}>
        <p className={styles.text}>
          {copy.bannerText}{' '}
          <PolicyLinks
            intro={copy.detailsIntro}
            locale={locale}
            pages={pages}
            linkClassName={styles.link}
            className={styles.links}
          />
        </p>
        {/* Both actions are the same control, visually. The primary/secondary
            pairing used by the newsletter dialogs is deliberately NOT reused
            here: equal prominence is the anti-dark-pattern requirement, so a
            later "consistency" cleanup must not reintroduce it. */}
        <div className={styles.actions}>
          <button className={styles.button} type="button" onClick={onAccept}>
            {copy.accept}
          </button>
          <button className={styles.button} type="button" onClick={onReject}>
            {copy.reject}
          </button>
        </div>
      </div>
    </div>
  )
}
