'use client'

import { useRef, useState, type RefObject } from 'react'
import Modal from '@/components/ui/Modal'
import { huDate } from '@/lib/utils/format-date'
import type { ConsentCopy } from '@/lib/consent/copy'
import type { PolicyPage } from '@/lib/consent/pages'
import type { ConsentDecision, ConsentRecord } from '@/lib/consent/record'
import PolicyLinks from './PolicyLinks'
import styles from './consent-dialog.module.scss'

/**
 * Reopened from the shield button to change an existing decision.
 *
 * Opts into the shared Modal's focus trap and scroll lock, which the newsletter
 * dialogs leave off: this one opens mid-scroll over a page the visitor is already
 * reading, so Tab must not walk out of it and the page must not scroll away
 * underneath.
 *
 * A radiogroup with the current choice pre-selected, rather than two buttons —
 * the point of reopening is to see and change what you already chose, and radios
 * give arrow-key selection for free. Closing without saving keeps the existing
 * decision, which is why Escape and a backdrop click are both safe here.
 */

interface ConsentDialogProps {
  copy: ConsentCopy
  locale: string
  /** Same content-derived list the banner links; the copy stays purpose-neutral,
   *  so these are where the visitor reads what they are deciding about. */
  pages: readonly PolicyPage[]
  current: ConsentDecision
  /** The stored record, for showing when the decision was made. */
  record: ConsentRecord | null
  /** The shield button that opened this, so focus lands back on it. */
  returnFocusRef: RefObject<HTMLElement | null>
  onSave: (decision: ConsentDecision) => void
  onClose: () => void
}

export default function ConsentDialog({
  copy,
  locale,
  pages,
  current,
  record,
  returnFocusRef,
  onSave,
  onClose,
}: ConsentDialogProps) {
  const [choice, setChoice] = useState<ConsentDecision>(current)
  const firstRadioRef = useRef<HTMLInputElement | null>(null)

  return (
    <Modal
      title={copy.dialogTitle}
      onClose={onClose}
      initialFocusRef={firstRadioRef}
      returnFocusRef={returnFocusRef}
      trapFocus
      lockScroll
    >
      <p className={styles.message}>
        {copy.dialogText}{' '}
        <PolicyLinks
          intro={copy.detailsIntro}
          locale={locale}
          pages={pages}
          linkClassName={styles.link}
        />
      </p>

      <fieldset className={styles.options}>
        <legend className={styles.legend}>{copy.dialogTitle}</legend>
        <label className={styles.option}>
          <input
            ref={firstRadioRef}
            type="radio"
            name="consent"
            value="granted"
            checked={choice === 'granted'}
            onChange={() => setChoice('granted')}
          />
          <span>{copy.optionGranted}</span>
        </label>
        <label className={styles.option}>
          <input
            type="radio"
            name="consent"
            value="denied"
            checked={choice === 'denied'}
            onChange={() => setChoice('denied')}
          />
          <span>{copy.optionDenied}</span>
        </label>
      </fieldset>

      {record && (
        <p className={styles.meta}>
          {copy.decidedOn}:{' '}
          {record.d === 'granted' ? copy.decisionGranted : copy.decisionDenied} (
          {huDate(record.t)})
        </p>
      )}

      <div className={styles.actions}>
        <button className={styles.button} type="button" onClick={() => onSave(choice)}>
          {copy.save}
        </button>
        <button className={styles.secondaryButton} type="button" onClick={onClose}>
          {copy.cancel}
        </button>
      </div>
    </Modal>
  )
}
