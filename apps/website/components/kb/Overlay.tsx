'use client'

import styles from './overlay.module.scss'

/**
 * The dim behind the context menu (sub-plan §6.3): the same transparent grey the
 * consent and newsletter dialogs put behind themselves, over the whole page.
 *
 * What it does not cover is decided entirely by the stacking order in
 * `_variables.scss` — the menu stack sits above it, the consent button and its
 * dialog above that — so this is a plain covering layer with one behaviour: a
 * click on it is one step back, exactly what "Vissza" is (D2).
 *
 * It deliberately does **not** lock scrolling. Picking a term means finding it
 * first, and a term can be anywhere in the body, so the page has to stay
 * scrollable under the dim; scrolling locks only when a panel opens (§6.3).
 *
 * `aria-hidden`, and not a button: the chrome's keyboard and screen-reader access
 * is a separate piece of work, and Escape already carries this same step for a
 * reader who is not using a pointer.
 */

interface OverlayProps {
  onBack: () => void
}

export default function Overlay({ onBack }: OverlayProps) {
  return <div className={styles.overlay} onClick={onBack} aria-hidden="true" />
}
