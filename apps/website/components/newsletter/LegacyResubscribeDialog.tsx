'use client'

import Link from 'next/link'
import { useRef, useState } from 'react'
import { buildLocalizedUrl } from '@/lib/i18n/url'
import NewsletterDialog from './NewsletterDialog'
import dialogStyles from './newsletter-dialog.module.scss'
import styles from './newsletter-form.module.scss'

// The landing step of the one-shot legacy re-permission campaign. Reached only
// by following a tokenized link from the invite email, which is why there is no
// email field (the worker knows the address) and no Turnstile (the token is
// already proof that a human with mailbox access clicked). All this collects is
// what the legacy list never had: a name and an explicit privacy acceptance.

const API_BASE = process.env.NEXT_PUBLIC_NEWSLETTER_API_BASE ?? ''

export type LegacyMode = 'subscribe' | 'decline'

interface LegacyResubscribeDialogProps {
  id: string
  token: string
  locale: string
  mode: LegacyMode
  onClose: () => void
}

type State = 'idle' | 'submitting' | 'done' | 'declined' | 'blocked' | 'expired' | 'error'

export default function LegacyResubscribeDialog({
  id,
  token,
  locale,
  mode,
  onClose,
}: LegacyResubscribeDialogProps) {
  const [state, setState] = useState<State>('idle')
  const [name, setName] = useState('')
  const [consent, setConsent] = useState(false)
  const [fieldError, setFieldError] = useState<string | null>(null)

  const nameInputRef = useRef<HTMLInputElement | null>(null)
  const confirmButtonRef = useRef<HTMLButtonElement | null>(null)
  const closeButtonRef = useRef<HTMLButtonElement | null>(null)

  const privacyHref = buildLocalizedUrl(locale, 'page', 'adatkezeles')
  const endpoint = `${API_BASE}/api/v1/newsletter/legacy/${encodeURIComponent(id)}`

  const settled = state === 'done' || state === 'declined' || state === 'blocked' || state === 'expired'

  function mapFailure(status: number) {
    // 404 covers a spent token as well as an unknown row — from the user's side
    // those are the same thing: this link no longer works.
    if (status === 404) return 'expired'
    if (status === 409) return 'blocked'
    return 'error'
  }

  async function onSubscribe(e: React.FormEvent) {
    e.preventDefault()
    setFieldError(null)

    if (name.trim().length === 0) {
      setFieldError('Kérlek, add meg, hogyan szólíthatlak.')
      return
    }
    if (!consent) {
      setFieldError('A feliratkozáshoz fogadd el az adatkezelési tájékoztatót.')
      return
    }

    setState('submitting')
    try {
      const res = await fetch(`${endpoint}/resubscribe`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token, name: name.trim(), privacyAccepted: consent }),
      })
      setState(res.ok ? 'done' : (mapFailure(res.status) as State))
    } catch {
      setState('error')
      setFieldError('Nem sikerült elküldeni. Ellenőrizd az internetkapcsolatod, és próbáld újra.')
    }
  }

  async function onDecline() {
    setState('submitting')
    try {
      const res = await fetch(
        `${endpoint}/decline?token=${encodeURIComponent(token)}`,
        { method: 'POST' },
      )
      setState(res.ok ? 'declined' : (mapFailure(res.status) as State))
    } catch {
      setState('error')
      setFieldError('Nem sikerült elküldeni. Ellenőrizd az internetkapcsolatod, és próbáld újra.')
    }
  }

  // --- settled states: one message + an acknowledge button -------------------

  if (settled) {
    const message: Record<string, string> = {
      done: 'Kész! Felvettelek a hírlevél listájára. Köszönöm, hogy velem tartasz.',
      declined: 'Rendben, töröltem a címedet. Nem kapsz több levelet.',
      blocked:
        'Ezt az e-mail címet nem tudom felvenni a hírlevélre. Ha szerinted ez tévedés, írj nekem.',
      expired: 'Ez a hivatkozás már nem érvényes — lehet, hogy korábban már felhasználtad.',
    }
    return (
      <NewsletterDialog
        title={state === 'done' ? 'Feliratkozás megerősítve' : 'Hírlevél'}
        onClose={onClose}
        initialFocusRef={closeButtonRef}
      >
        <p className={dialogStyles.message} role="status">
          {message[state]}
        </p>
        <div className={dialogStyles.actions}>
          <button
            ref={closeButtonRef}
            className={dialogStyles.button}
            type="button"
            onClick={onClose}
          >
            Rendben
          </button>
        </div>
      </NewsletterDialog>
    )
  }

  // --- decline: confirm before acting ----------------------------------------
  //
  // The emailed decline link is a GET, and GETs get prefetched by mail scanners,
  // so the worker only redirects here rather than opting anyone out. This step is
  // where the decision actually gets made.

  if (mode === 'decline') {
    return (
      <NewsletterDialog
        title="Leiratkozás"
        onClose={onClose}
        initialFocusRef={confirmButtonRef}
        dismissOnBackdrop={false}
      >
        <p className={dialogStyles.message}>
          Biztosan nem kérsz több levelet? Ha megerősíted, azonnal törlöm a címedet.
        </p>
        {fieldError && (
          <p className={styles.error} role="alert">
            {fieldError}
          </p>
        )}
        <div className={dialogStyles.actions}>
          <button
            ref={confirmButtonRef}
            className={dialogStyles.button}
            type="button"
            onClick={onDecline}
            disabled={state === 'submitting'}
          >
            {state === 'submitting' ? 'Küldés…' : 'Töröld a címem'}
          </button>
          <button className={dialogStyles.secondaryButton} type="button" onClick={onClose}>
            Mégsem
          </button>
        </div>
      </NewsletterDialog>
    )
  }

  // --- subscribe: the name + consent the legacy list never had ---------------

  return (
    <NewsletterDialog
      title="Feliratkozás az új hírlevélre"
      onClose={onClose}
      initialFocusRef={nameInputRef}
      dismissOnBackdrop={false}
    >
      <p className={dialogStyles.message}>
        Már csak azt áruld el, hogyan szólíthatlak — az e-mail címedet ismerem.
      </p>
      <form className={styles.form} onSubmit={onSubscribe} noValidate>
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
            <Link
              href={privacyHref}
              className={styles.link}
              target="_blank"
              rel="noopener noreferrer"
            >
              adatkezelési tájékoztatót
            </Link>
            .
          </span>
        </label>
        {fieldError && (
          <p className={styles.error} role="alert">
            {fieldError}
          </p>
        )}
        <div className={dialogStyles.actions}>
          <button className={dialogStyles.button} type="submit" disabled={state === 'submitting'}>
            {state === 'submitting' ? 'Küldés…' : 'Feliratkozom'}
          </button>
          <button className={dialogStyles.secondaryButton} type="button" onClick={onClose}>
            Most nem
          </button>
        </div>
      </form>
    </NewsletterDialog>
  )
}
