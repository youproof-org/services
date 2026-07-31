'use client'

import { useEffect, useRef, useState } from 'react'
import { DEFAULT_LOCALE, isLocale } from '@/lib/i18n/config'
import LegacyResubscribeDialog, { type LegacyMode } from './LegacyResubscribeDialog'
import NewsletterDialog from './NewsletterDialog'
import SubscriptionActionDialog, { type ActionMode } from './SubscriptionActionDialog'
import styles from './newsletter-dialog.module.scss'

// Mounted once globally (root layout). Handles the newsletter "landing" query
// params that arrive as full-page loads from the worker's redirects:
//   ?newsletter_ask=confirm|unsubscribe (+ &sid &stok &sform)
//        → the emailed link was READ-ONLY; open the dialog that actually POSTs.
//          See SubscriptionActionDialog and the worker's confirm/unsubscribe
//          handlers for why the GET can't be allowed to act.
//   ?newsletter_unsubscribed=error     → failure dialog
//   ?newsletter_confirmed=invalid      → failure dialog
//          (the success values of those two are no longer emitted: success now
//          arrives via the POST above, not via a redirect marker.)
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

interface ActionTarget {
  id: string
  token: string
  mode: ActionMode
  formInstance: string | null
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
  const [action, setAction] = useState<ActionTarget | null>(null)
  const okButtonRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const unsub = params.get('newsletter_unsubscribed')
    const confirmed = params.get('newsletter_confirmed')
    const legacyParam = params.get('newsletter_legacy')
    const lid = params.get('lid')
    const ltok = params.get('ltok')
    const ask = params.get('newsletter_ask')
    const sid = params.get('sid')
    const stok = params.get('stok')

    let next: DialogContent | null = null

    if ((ask === 'confirm' || ask === 'unsubscribe') && sid && stok) {
      // Captured into state HERE, before the scrub below. The dialog POSTs long
      // after that, so it must never re-read window.location.
      setAction({
        id: sid,
        token: stok,
        mode: ask,
        formInstance: params.get('sform'),
      })
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
    }

    if (next) setDialog(next)

    // Clean the params so a refresh/back doesn't re-trigger. Runs after the
    // form's own mount effect (children mount before this layout-level sibling).
    if (unsub || confirmed || legacyParam || ask) {
      params.delete('newsletter_unsubscribed')
      params.delete('newsletter_confirmed')
      params.delete('newsletter_ask')
      params.delete('sid')
      params.delete('stok')
      params.delete('sform')
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

  if (action) {
    return (
      <SubscriptionActionDialog
        id={action.id}
        token={action.token}
        mode={action.mode}
        formInstance={action.formInstance}
        onClose={() => setAction(null)}
      />
    )
  }

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
