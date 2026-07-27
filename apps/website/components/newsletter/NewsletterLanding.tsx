'use client'

import { useEffect, useState } from 'react'
import styles from './newsletter-landing.module.scss'

// Mounted once globally (root layout). Handles the two newsletter "landing"
// query params that arrive as full-page loads from the worker's redirects:
//   ?newsletter_unsubscribed=1|error   → confirmation/failure dialog (homepage)
//   ?newsletter_confirmed=<page>#<placement>|invalid
//        → the matching NewsletterForm instance shows the confirmed state itself;
//          this only steps in with a dialog when that instance is gone (content
//          edited) or the confirmation was invalid.
interface DialogContent {
  title: string
  message: string
}

export default function NewsletterLanding() {
  const [dialog, setDialog] = useState<DialogContent | null>(null)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const unsub = params.get('newsletter_unsubscribed')
    const confirmed = params.get('newsletter_confirmed')

    let next: DialogContent | null = null

    if (unsub === '1') {
      next = {
        title: 'Leiratkozás',
        message: 'Sikeresen leiratkoztál a hírlevélről. Többé nem küldünk neked e-mailt.',
      }
    } else if (unsub === 'error') {
      next = {
        title: 'Leiratkozás',
        message:
          'A leiratkozás nem sikerült — lehet, hogy a hivatkozás érvénytelen vagy már felhasználtad.',
      }
    } else if (confirmed === 'invalid') {
      next = {
        title: 'Megerősítés',
        message:
          'A megerősítés nem sikerült — lehet, hogy a hivatkozás érvénytelen vagy lejárt. Próbálj meg újra feliratkozni.',
      }
    } else if (confirmed) {
      // A form instance owns the in-place confirmed state; only fall back to a
      // dialog if that instance no longer exists on the page.
      const placement = confirmed.includes('#') ? confirmed.split('#')[1] : confirmed
      const el = document.getElementById(`newsletter-form-${placement}`)
      if (!el) {
        next = {
          title: 'Feliratkozás megerősítve',
          message: 'Sikeresen megerősítetted a feliratkozásod. Köszönjük, hogy csatlakoztál!',
        }
      }
    }

    if (next) setDialog(next)

    // Clean the params so a refresh/back doesn't re-trigger. Runs after the
    // form's own mount effect (children mount before this layout-level sibling).
    if (unsub || confirmed) {
      params.delete('newsletter_unsubscribed')
      params.delete('newsletter_confirmed')
      params.delete('sid')
      const qs = params.toString()
      window.history.replaceState(
        null,
        '',
        window.location.pathname + (qs ? `?${qs}` : '') + window.location.hash,
      )
    }
  }, [])

  useEffect(() => {
    if (!dialog) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setDialog(null)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [dialog])

  if (!dialog) return null

  return (
    <div className={styles.overlay} onClick={() => setDialog(null)}>
      <div
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="newsletter-dialog-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="newsletter-dialog-title" className={styles.title}>
          {dialog.title}
        </h2>
        <p className={styles.message}>{dialog.message}</p>
        <button className={styles.button} type="button" onClick={() => setDialog(null)}>
          Rendben
        </button>
      </div>
    </div>
  )
}
