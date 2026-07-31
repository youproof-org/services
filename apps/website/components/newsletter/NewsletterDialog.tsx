'use client'

import { useEffect, useRef, type ReactNode, type RefObject } from 'react'
import styles from './newsletter-dialog.module.scss'

// The app's only modal shell, extracted from NewsletterLanding so the plain
// message dialog and the legacy re-subscription form can share one set of
// behaviours. Deliberately no more capable than what it replaced — no portal, no
// focus trap, no scroll lock; it opens on a full page load, over a page the user
// has not interacted with yet.

interface NewsletterDialogProps {
  title: string
  onClose: () => void
  /** Focused on open. The message dialog points this at its OK button; the form
   *  variant at its first input. */
  initialFocusRef: RefObject<HTMLElement | null>
  /** Whether a backdrop click dismisses. False for the form variant, where a
   *  stray click would discard a half-typed name. Escape always works. */
  dismissOnBackdrop?: boolean
  children: ReactNode
}

const TITLE_ID = 'newsletter-dialog-title'

export default function NewsletterDialog({
  title,
  onClose,
  initialFocusRef,
  dismissOnBackdrop = true,
  children,
}: NewsletterDialogProps) {
  const lastFocused = useRef<Element | null>(null)

  useEffect(() => {
    // Move focus into the dialog (it opens on a full-page load, so focus is on
    // <body>); restore it to wherever it was on close.
    //
    // preventScroll matters on both: focus() otherwise scrolls the focused
    // element into view, which yanks the document away from the top the moment
    // the dialog opens — and again, to wherever focus came from, when it closes.
    // The overlay is position:fixed, so it is already fully visible; there is
    // nothing to scroll to.
    lastFocused.current = document.activeElement
    initialFocusRef.current?.focus({ preventScroll: true })
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      if (lastFocused.current instanceof HTMLElement) {
        lastFocused.current.focus({ preventScroll: true })
      }
    }
    // Mount/unmount only: re-running would steal focus back on every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className={styles.overlay} onClick={dismissOnBackdrop ? onClose : undefined}>
      <div
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby={TITLE_ID}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id={TITLE_ID} className={styles.title}>
          {title}
        </h2>
        {children}
      </div>
    </div>
  )
}
