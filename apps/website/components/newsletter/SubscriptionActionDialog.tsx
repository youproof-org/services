'use client'

import { useRef, useState } from 'react'
import NewsletterDialog from './NewsletterDialog'
import dialogStyles from './newsletter-dialog.module.scss'
import formStyles from './newsletter-form.module.scss'

// The second half of the confirm and unsubscribe flows. Both emailed links are
// now read-only GETs that only land here — the state change happens on the POST
// this dialog issues, because a button is the one thing a mail-security sandbox
// will not do for you. See the docblocks in the worker's confirm.ts /
// unsubscribe.ts for the full reasoning.
//
// One component for both: it is the same state machine (one tokenized bodyless
// POST, one settled message, one primary button), differing only in copy and
// whether a cancel is offered.

const API_BASE = process.env.NEXT_PUBLIC_NEWSLETTER_API_BASE ?? ''

/** Fired at the window when a confirmation lands and the originating form is
 *  still on the page. NewsletterForm listens for it. */
export const CONFIRMED_EVENT = 'newsletter:confirmed'

export type ActionMode = 'confirm' | 'unsubscribe'

interface SubscriptionActionDialogProps {
  id: string
  token: string
  mode: ActionMode
  /** `source_form_instance` ("<page>#<placement>"), when the worker knew it. */
  formInstance?: string | null
  onClose: () => void
}

type State = 'idle' | 'submitting' | 'done' | 'blocked' | 'gone' | 'expired' | 'error'

export default function SubscriptionActionDialog({
  id,
  token,
  mode,
  formInstance,
  onClose,
}: SubscriptionActionDialogProps) {
  const [state, setState] = useState<State>('idle')
  const [fieldError, setFieldError] = useState<string | null>(null)

  const primaryRef = useRef<HTMLButtonElement | null>(null)
  const closeRef = useRef<HTMLButtonElement | null>(null)

  const endpoint =
    `${API_BASE}/api/v1/newsletter/subscriptions/${encodeURIComponent(id)}/${mode}` +
    `?token=${encodeURIComponent(token)}`

  /**
   * Hand the reader back to the exact form they subscribed from, which already
   * owns the "Köszönjük" state. Returns false when that instance isn't on the
   * page (the subscription had no source form, or the content was edited since),
   * in which case this dialog has to say it itself.
   */
  function handOffToForm(): boolean {
    if (!formInstance) return false
    const placement = formInstance.includes('#') ? formInstance.split('#')[1] : formInstance
    if (!document.getElementById(`newsletter-form-${placement}`)) return false
    window.dispatchEvent(new CustomEvent(CONFIRMED_EVENT, { detail: { placement } }))
    return true
  }

  async function submit() {
    setFieldError(null)
    setState('submitting')
    try {
      const res = await fetch(endpoint, { method: 'POST' })
      if (res.ok) {
        // On the happy path the dialog says nothing at all: it closes, and the
        // form behind it shows the confirmation. Two success messages for one
        // action would just be noise.
        if (mode === 'confirm' && handOffToForm()) {
          onClose()
          return
        }
        setState(mode === 'confirm' ? 'done' : 'gone')
        return
      }
      if (res.status === 404) {
        setState('expired')
        return
      }
      if (res.status === 409) {
        const body = (await res.json().catch(() => null)) as { code?: string } | null
        setState(body?.code === 'subscription_unsubscribed' ? 'gone' : 'blocked')
        return
      }
      // 403 / 5xx: keep the prompt up so the button stays retryable.
      setState('idle')
      setFieldError('Nem sikerült elküldeni. Kérjük, próbáld újra.')
    } catch {
      setState('idle')
      setFieldError('Nem sikerült elküldeni. Ellenőrizd az internetkapcsolatod, és próbáld újra.')
    }
  }

  // --- settled: one message and an acknowledgement ---------------------------

  const settled: Partial<Record<State, { title: string; message: string }>> = {
    done: {
      title: 'Feliratkozás megerősítve',
      message: 'Sikeresen megerősítetted a feliratkozásod. Köszönjük, hogy csatlakoztál!',
    },
    gone:
      mode === 'unsubscribe'
        ? {
            title: 'Leiratkozás',
            message: 'Sikeresen leiratkoztál a hírlevélről. Többé nem küldünk neked e-mailt.',
          }
        : {
            title: 'Hírlevél',
            message:
              'Korábban leiratkoztál erről a címről, ezért ez a megerősítő hivatkozás már nem érvényes. Ha mégis szeretnéd megkapni a hírlevelet, iratkozz fel újra az oldal alján lévő űrlappal.',
          },
    blocked: {
      title: 'Hírlevél',
      message:
        'Ezt az e-mail címet nem tudjuk felvenni a hírlevélre. Ha úgy gondolod, hogy ez tévedés, vedd fel velünk a kapcsolatot.',
    },
    expired: {
      title: mode === 'confirm' ? 'Megerősítés' : 'Leiratkozás',
      message: 'Ez a hivatkozás már nem érvényes — lehet, hogy korábban már felhasználtad.',
    },
  }

  const done = settled[state]
  if (done) {
    return (
      <NewsletterDialog title={done.title} onClose={onClose} initialFocusRef={closeRef}>
        <p className={dialogStyles.message} role="status">
          {done.message}
        </p>
        <div className={dialogStyles.actions}>
          <button ref={closeRef} className={dialogStyles.button} type="button" onClick={onClose}>
            Rendben
          </button>
        </div>
      </NewsletterDialog>
    )
  }

  // --- prompt ----------------------------------------------------------------

  const busy = state === 'submitting'
  const prompt =
    mode === 'confirm'
      ? {
          title: 'Feliratkozás megerősítése',
          message: 'Már csak egy kattintás van hátra.',
          action: 'Megerősítem',
        }
      : {
          title: 'Leiratkozás',
          message:
            'Biztosan nem kérsz több levelet? Ha megerősíted, azonnal töröljük a címedet a hírlevél listájáról.',
          action: 'Leiratkozom',
        }

  return (
    <NewsletterDialog
      title={prompt.title}
      onClose={onClose}
      initialFocusRef={primaryRef}
      // The confirm dialog has no cancel by design — following the emailed link
      // already expressed the intent, and the button only exists to prove a
      // human is here. A backdrop click would be a hidden cancel either way.
      dismissOnBackdrop={false}
    >
      <p className={dialogStyles.message}>{prompt.message}</p>
      {fieldError && (
        <p className={formStyles.error} role="alert">
          {fieldError}
        </p>
      )}
      <div className={dialogStyles.actions}>
        <button
          ref={primaryRef}
          className={dialogStyles.button}
          type="button"
          onClick={submit}
          disabled={busy}
        >
          {busy ? 'Küldés…' : prompt.action}
        </button>
        {mode === 'unsubscribe' && (
          <button
            className={dialogStyles.secondaryButton}
            type="button"
            onClick={onClose}
            disabled={busy}
          >
            Mégsem
          </button>
        )}
      </div>
    </NewsletterDialog>
  )
}
