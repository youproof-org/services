'use client'

import { forwardRef } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faShieldHalved } from '@fortawesome/free-solid-svg-icons'
import styles from './consent-fab.module.scss'

/**
 * The persistent way back into the consent decision: a small fixed button in the
 * bottom-left corner, which is otherwise unoccupied (the sticky header is the
 * only other fixed chrome).
 *
 * Rendered only once a decision exists — while the banner is open, the banner is
 * the control. A ref rather than a plain callback so ConsentDialog can return
 * focus here on close, which is the part a mid-scroll dialog gets wrong if the
 * opener is not tracked.
 *
 * FontAwesome is safe in fixed chrome here because the root layout sets
 * config.autoAddCss = false and imports the sizing CSS statically — otherwise
 * the icon would paint at its native size for a frame before hydration.
 */

interface ConsentFabProps {
  label: string
  onClick: () => void
}

const ConsentFab = forwardRef<HTMLButtonElement, ConsentFabProps>(function ConsentFab(
  { label, onClick },
  ref,
) {
  return (
    <button
      ref={ref}
      className={styles.fab}
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
    >
      <FontAwesomeIcon icon={faShieldHalved} className={styles.icon} />
    </button>
  )
})

export default ConsentFab
