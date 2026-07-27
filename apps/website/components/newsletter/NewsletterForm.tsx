'use client'

import { useEffect, useRef, useState, type FormEvent } from 'react'
import Link from 'next/link'
import { buildLocalizedUrl } from '@/lib/i18n/url'
import styles from './newsletter-form.module.scss'

// Where this instance sits on the page. Part of the stable DOM id and the
// source-form-instance reference sent to the API, so the confirmation link can
// return the reader to the exact form they used.
export type NewsletterPlacement = 'pre-footer' | 'mid-content'

interface NewsletterFormProps {
  locale: string
  placement: NewsletterPlacement
}

type FormState = 'idle' | 'submitting' | 'pending' | 'blocked' | 'confirmed' | 'error'

const API_BASE = process.env.NEXT_PUBLIC_NEWSLETTER_API_BASE ?? ''
const TURNSTILE_SITEKEY = process.env.NEXT_PUBLIC_TURNSTILE_SITEKEY ?? ''
const TURNSTILE_SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'

// Minimal typing for the Turnstile global we use.
declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: Record<string, unknown>) => string
      reset: (id?: string) => void
    }
  }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function NewsletterForm({ locale, placement }: NewsletterFormProps) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [consent, setConsent] = useState(false)
  const [state, setState] = useState<FormState>('idle')
  const [fieldError, setFieldError] = useState<string | null>(null)

  // Mid-content is a collapsible interstitial: start as a slim teaser and expand
  // the full form in place, so it doesn't wall off the article. Pre-footer is
  // always expanded (natural end-of-page CTA).
  const collapsible = placement === 'mid-content'
  const [expanded, setExpanded] = useState(!collapsible)

  const turnstileToken = useRef('')
  const turnstileWidgetId = useRef<string | undefined>(undefined)
  const turnstileContainer = useRef<HTMLDivElement | null>(null)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const nameInputRef = useRef<HTMLInputElement | null>(null)

  const domId = `newsletter-form-${placement}`
  const privacyHref = buildLocalizedUrl(locale, 'page', 'adatkezeles')

  // If the reader has just landed here from the confirmation email
  // (?newsletter_confirmed=<page>#<placement>), and it targets THIS instance,
  // switch to the confirmed state and scroll into view. Self-contained per
  // instance; the fallback (form no longer present) is handled by NewsletterLanding.
  useEffect(() => {
    const param = new URLSearchParams(window.location.search).get('newsletter_confirmed')
    if (!param || param === 'invalid') return
    const targetPlacement = param.includes('#') ? param.split('#')[1] : param
    if (targetPlacement !== placement) return
    setState('confirmed')
    rootRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [placement])

  // Move focus to the first field when the interstitial expands.
  useEffect(() => {
    if (collapsible && expanded && state === 'idle') nameInputRef.current?.focus()
  }, [collapsible, expanded, state])

  // Load + explicitly render the Turnstile widget once (skipped if no sitekey,
  // e.g. local dev).
  useEffect(() => {
    if (!TURNSTILE_SITEKEY) return
    let cancelled = false

    function renderWidget() {
      if (cancelled || !window.turnstile || !turnstileContainer.current) return
      if (turnstileWidgetId.current !== undefined) return
      turnstileWidgetId.current = window.turnstile.render(turnstileContainer.current, {
        sitekey: TURNSTILE_SITEKEY,
        callback: (t: string) => {
          turnstileToken.current = t
        },
        'error-callback': () => {
          turnstileToken.current = ''
        },
        'expired-callback': () => {
          turnstileToken.current = ''
        },
      })
    }

    const existing = document.getElementById('cf-turnstile-script')
    if (window.turnstile) {
      renderWidget()
    } else if (existing) {
      existing.addEventListener('load', renderWidget)
    } else {
      const s = document.createElement('script')
      s.id = 'cf-turnstile-script'
      s.src = TURNSTILE_SCRIPT
      s.async = true
      s.defer = true
      s.addEventListener('load', renderWidget)
      document.head.appendChild(s)
    }
    return () => {
      cancelled = true
    }
  }, [])

  function resetTurnstile() {
    turnstileToken.current = ''
    if (window.turnstile && turnstileWidgetId.current !== undefined) {
      window.turnstile.reset(turnstileWidgetId.current)
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setFieldError(null)

    if (name.trim().length === 0) return setFieldError('Kérjük, add meg, hogyan szólíthatunk.')
    if (!EMAIL_RE.test(email.trim())) return setFieldError('Kérjük, adj meg egy érvényes e-mail címet.')
    if (!consent) return setFieldError('A feliratkozáshoz fogadd el az adatkezelési tájékoztatót.')
    if (TURNSTILE_SITEKEY && !turnstileToken.current) {
      return setFieldError('Kérjük, igazold, hogy nem vagy robot.')
    }

    setState('submitting')
    const pagePath = window.location.pathname
    try {
      const res = await fetch(`${API_BASE}/api/v1/newsletter/subscriptions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          locale,
          privacyAccepted: consent,
          sourcePage: pagePath,
          sourceFormInstance: `${pagePath}#${placement}`,
          turnstileToken: turnstileToken.current,
        }),
      })

      if (res.status === 202) {
        setState('pending')
      } else if (res.status === 409) {
        setState('blocked')
      } else if (res.status === 429) {
        resetTurnstile()
        setState('error')
        setFieldError('Túl sok próbálkozás. Kérjük, próbáld újra később.')
      } else {
        resetTurnstile()
        setState('error')
        setFieldError('Valami hiba történt. Kérjük, próbáld újra.')
      }
    } catch {
      resetTurnstile()
      setState('error')
      setFieldError('Nem sikerült elküldeni. Ellenőrizd az internetkapcsolatod, és próbáld újra.')
    }
  }

  return (
    <section
      ref={rootRef}
      id={domId}
      className={`${styles.newsletter}${collapsible ? ` ${styles.midContent}` : ''}`}
      aria-label="Hírlevél feliratkozás"
    >
      {collapsible && (
        <p className={styles.continues} aria-hidden="true">
          A cikk folytatódik a hírlevél-ajánló alatt ↓
        </p>
      )}
      <div className={`${styles.inner}${collapsible ? ` ${styles.interstitial}` : ''}`}>
        {state === 'pending' ? (
          <p className={styles.notice} role="status">
            <strong>Köszönjük!</strong> Küldtünk egy megerősítő e-mailt a megadott címre. Kattints a
            benne lévő linkre a feliratkozás véglegesítéséhez.
          </p>
        ) : state === 'confirmed' ? (
          <p className={styles.notice} role="status">
            <strong>Sikeresen megerősítetted a feliratkozásod.</strong> Köszönjük, hogy csatlakoztál!
          </p>
        ) : state === 'blocked' ? (
          <p className={styles.error} role="alert">
            Ezt az e-mail címet nem tudjuk felvenni a hírlevélre. Ha úgy gondolod, hogy ez tévedés,
            vedd fel velünk a kapcsolatot.
          </p>
        ) : collapsible && !expanded ? (
          <div className={styles.teaser}>
            <p className={styles.teaserText}>Tetszik a cikk? Iratkozz fel a hírlevelünkre.</p>
            <button
              type="button"
              className={styles.button}
              onClick={() => setExpanded(true)}
              aria-expanded={false}
            >
              Feliratkozom
            </button>
          </div>
        ) : (
          <>
            <h2 className={styles.heading}>Iratkozz fel a hírlevelünkre</h2>
            <form className={styles.form} onSubmit={onSubmit} noValidate>
              <label className={styles.label}>
                Hogyan szólíthatlak?
                <input
                  ref={nameInputRef}
                  className={styles.input}
                  type="text"
                  name="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoComplete="name"
                  required
                />
              </label>

              <label className={styles.label}>
                Email címed
                <input
                  className={styles.input}
                  type="email"
                  name="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  required
                />
              </label>

              <label className={styles.checkboxRow}>
                <input
                  type="checkbox"
                  name="privacy"
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                  required
                />
                <span>
                  Elfogadom az{' '}
                  <Link href={privacyHref} className={styles.link} target="_blank" rel="noopener noreferrer">
                    adatkezelési tájékoztatót
                  </Link>
                  .
                </span>
              </label>

              {TURNSTILE_SITEKEY && <div ref={turnstileContainer} className={styles.turnstile} />}

              {fieldError && (
                <p className={styles.error} role="alert">
                  {fieldError}
                </p>
              )}

              <button className={styles.button} type="submit" disabled={state === 'submitting'}>
                {state === 'submitting' ? 'Küldés…' : 'Feliratkozom'}
              </button>
            </form>
          </>
        )}
      </div>
    </section>
  )
}
