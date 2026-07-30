'use client'

import { useEffect, useRef, useState } from 'react'
import { DEFAULT_LOCALE, isLocale } from '@/lib/i18n/config'
import LegacyResubscribeDialog, { type LegacyMode } from './LegacyResubscribeDialog'
import NewsletterDialog from './NewsletterDialog'
import styles from './newsletter-dialog.module.scss'

// Mounted once globally (root layout). Handles the newsletter "landing" query
// params that arrive as full-page loads from the worker's redirects:
//   ?newsletter_unsubscribed=1|error   → confirmation/failure dialog (homepage)
//   ?newsletter_confirmed=<page>#<placement>|invalid
//        → the matching NewsletterForm instance shows the confirmed state itself;
//          this only steps in with a dialog when that instance is gone (content
//          edited) or the confirmation was invalid.
//   ?newsletter_legacy=1|decline|invalid (+ &lid &ltok)
//        → the one-shot legacy re-permission campaign: open the popup that
//          collects the name + consent, or confirms an opt-out.
interface DialogContent {
  title: string
  message: string
}

interface LegacyTarget {
  id: string
  token: string
  locale: string
  mode: LegacyMode
}

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
 * that composes locale paths. Needed at all because this component is mounted
 * from the ROOT layout, which has no locale param.
 */
function localeFromPath(): string {
  const seg = window.location.pathname.split('/')[1] ?? ''
  return isLocale(seg) ? seg : DEFAULT_LOCALE
}

export default function NewsletterLanding() {
  const [dialog, setDialog] = useState<DialogContent | null>(null)
  const [legacy, setLegacy] = useState<LegacyTarget | null>(null)
  const okButtonRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const unsub = params.get('newsletter_unsubscribed')
    const confirmed = params.get('newsletter_confirmed')
    const legacyParam = params.get('newsletter_legacy')
    const lid = params.get('lid')
    const ltok = params.get('ltok')

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
    } else if (legacyParam === 'invalid') {
      next = {
        title: 'Hírlevél',
        message:
          'Ez a hivatkozás érvénytelen vagy lejárt. Ha szeretnél feliratkozni, használd az oldal alján lévő űrlapot.',
      }
    } else if ((legacyParam === '1' || legacyParam === 'decline') && lid && ltok) {
      // Captured into state HERE, before the scrub below removes them from the
      // URL. The dialog submits long after that, so it must never re-read
      // window.location.
      setLegacy({
        id: lid,
        token: ltok,
        locale: localeFromPath(),
        mode: legacyParam === 'decline' ? 'decline' : 'subscribe',
      })
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
    if (unsub || confirmed || legacyParam) {
      params.delete('newsletter_unsubscribed')
      params.delete('newsletter_confirmed')
      params.delete('sid')
      params.delete('newsletter_legacy')
      params.delete('lid')
      params.delete('ltok')
      const qs = params.toString()
      window.history.replaceState(
        null,
        '',
        window.location.pathname + (qs ? `?${qs}` : '') + window.location.hash,
      )
    }
  }, [])

  if (legacy) {
    return (
      <LegacyResubscribeDialog
        id={legacy.id}
        token={legacy.token}
        locale={legacy.locale}
        mode={legacy.mode}
        onClose={() => setLegacy(null)}
      />
    )
  }

  if (!dialog) return null

  return (
    <NewsletterDialog
      title={dialog.title}
      onClose={() => setDialog(null)}
      initialFocusRef={okButtonRef}
    >
      <p className={styles.message}>{dialog.message}</p>
      <div className={styles.actions}>
        <button
          ref={okButtonRef}
          className={styles.button}
          type="button"
          onClick={() => setDialog(null)}
        >
          Rendben
        </button>
      </div>
    </NewsletterDialog>
  )
}
