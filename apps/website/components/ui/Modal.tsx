'use client'

import { useEffect, useRef, type ReactNode, type RefObject } from 'react'
import styles from './modal.module.scss'

/**
 * The app's modal shell. Extracted from the newsletter dialogs so the consent
 * dialog can share one set of behaviours.
 *
 * `trapFocus` and `lockScroll` are OPT-IN and default to off, which is not
 * laziness — it preserves the newsletter dialogs exactly as they were. Those open
 * on a full page load, over a page the user has not interacted with yet and has
 * not scrolled, so neither was ever needed there; switching them on would change
 * the behaviour of the double-opt-in path for no reason.
 *
 * The consent dialog opens from a floating button mid-scroll, which breaks all
 * three of those assumptions, so it opts into both and relies on
 * `initialFocusRef` restoring focus to the button that opened it.
 */

interface ModalProps {
  title: string
  onClose: () => void
  /** Focused on open. The message dialog points this at its OK button; the form
   *  variant at its first input. */
  initialFocusRef: RefObject<HTMLElement | null>
  /** Whether a backdrop click dismisses. False for the form variant, where a
   *  stray click would discard a half-typed name. Escape always works. */
  dismissOnBackdrop?: boolean
  /**
   * Keep Tab within the dialog. Required whenever `aria-modal="true"` is set over
   * content the user can otherwise reach: without it, Tab walks into content the
   * assistive technology has been told is hidden.
   */
  trapFocus?: boolean
  /** Prevent the document scrolling underneath while the dialog is open. */
  lockScroll?: boolean
  /**
   * Where to send focus on close, overriding "whatever had it when we opened".
   * Needed when the opener is a control that may not have taken focus on click —
   * Safari does not focus a clicked button — so restoring to `document.activeElement`
   * would drop focus on `<body>` instead of the button the user pressed.
   */
  returnFocusRef?: RefObject<HTMLElement | null>
  children: ReactNode
}

const TITLE_ID = 'modal-title'

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

export default function Modal({
  title,
  onClose,
  initialFocusRef,
  dismissOnBackdrop = true,
  trapFocus = false,
  lockScroll = false,
  returnFocusRef,
  children,
}: ModalProps) {
  const lastFocused = useRef<Element | null>(null)
  const dialogRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    // Move focus into the dialog; restore it to wherever it was on close.
    //
    // preventScroll matters on both: focus() otherwise scrolls the focused
    // element into view, which yanks the document away from where it was the
    // moment the dialog opens — and again, to wherever focus came from, when it
    // closes. The overlay is position:fixed, so it is already fully visible;
    // there is nothing to scroll to.
    lastFocused.current = document.activeElement
    initialFocusRef.current?.focus({ preventScroll: true })

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose()
        return
      }
      if (!trapFocus || e.key !== 'Tab') return
      const focusables = dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE)
      if (!focusables || focusables.length === 0) return
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      // Wrap at both ends. Also covers the case where focus has somehow escaped
      // the dialog already, by pulling it back to the first control.
      if (e.shiftKey && (document.activeElement === first || !dialogRef.current?.contains(document.activeElement))) {
        e.preventDefault()
        last.focus({ preventScroll: true })
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus({ preventScroll: true })
      }
    }
    document.addEventListener('keydown', onKey)

    const previousOverflow = lockScroll ? document.body.style.overflow : null
    if (lockScroll) document.body.style.overflow = 'hidden'

    return () => {
      document.removeEventListener('keydown', onKey)
      if (previousOverflow !== null) document.body.style.overflow = previousOverflow
      const restoreTo =
        returnFocusRef?.current ??
        (lastFocused.current instanceof HTMLElement ? lastFocused.current : null)
      restoreTo?.focus({ preventScroll: true })
    }
    // Mount/unmount only: re-running would steal focus back on every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className={styles.overlay} onClick={dismissOnBackdrop ? onClose : undefined}>
      <div
        ref={dialogRef}
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
