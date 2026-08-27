'use client'

import type { KbMenuIcon, KbMenuItem, KbMenuItemKey } from '@/lib/kb/menu-items'
import styles from './menu-stack.module.scss'

/**
 * The entity page's context menu: a vertical stack of pill buttons in the
 * bottom-right corner (sub-plan §6.2).
 *
 * The corner is the mirror of the cookie-consent opener's, and so is the button
 * treatment — a 2.75rem circle, white on a hairline border, black and white only.
 * Each item extends that circle leftwards into a caption bar with a half-circle
 * left edge, so the whole item reads as one pill with the icon at its right end.
 * The stack is right-aligned, which is what lines the icons up in a column however
 * long the captions are.
 *
 * The bottom-most button is the constant: **Menü** in the default state and
 * **Vissza** in every other one, in the same place, so the reader always knows
 * where the control is.
 *
 * The items above it show in the open-menu state only. A panel is opened from the
 * menu and never opens another one (§6.4), so once a panel is up the stack is that
 * one button — which is also what keeps the corner uncluttered over the sheet. An
 * item whose phase has not landed yet is rendered disabled rather than dropped, so
 * the menu is the same shape throughout and nothing offers a press it will not act
 * on.
 */

interface MenuStackProps {
  /** The items this entity has (`kbMenuItems`), top to bottom. */
  items: readonly KbMenuItem[]
  /** True in every non-default state: the last button is Vissza rather than Menü. */
  open: boolean
  /** True in the open-menu state only: the items show. */
  showItems: boolean
  /** The items that have behaviour behind them; the rest render disabled. */
  liveItems: readonly KbMenuItemKey[]
  /** Caption of the bottom-most button in the default state. */
  openLabel: string
  /** …and in every other state. */
  backLabel: string
  onOpen: () => void
  onSelect: (key: KbMenuItemKey) => void
  onBack: () => void
}

const ICON_DIR = '/assets/generated/kb-menu'

/**
 * The device-pixel-ratio variants `scripts/gen-kb-menu-icons.mjs` writes: the same
 * icon at 44, 88 and 132 px for the 44 px box, so a retina screen gets a sharp one
 * and nobody downloads the 512 px original.
 */
const DPRS = [1, 2, 3]

function MenuIcon({ name }: { name: KbMenuIcon }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      className={styles.icon}
      src={`${ICON_DIR}/${name}@1x.png`}
      srcSet={DPRS.map((dpr) => `${ICON_DIR}/${name}@${dpr}x.png ${dpr}x`).join(', ')}
      width={44}
      height={44}
      // The caption beside it says the same thing, so the icon is decoration.
      alt=""
    />
  )
}

export default function MenuStack({
  items,
  open,
  showItems,
  liveItems,
  openLabel,
  backLabel,
  onOpen,
  onSelect,
  onBack,
}: MenuStackProps) {
  return (
    <div className={styles.stack}>
      {showItems &&
        items.map((item) => {
          const live = liveItems.includes(item.key)
          return (
            <button
              key={item.key}
              type="button"
              className={styles.item}
              disabled={!live}
              onClick={live ? () => onSelect(item.key) : undefined}
            >
              <span className={styles.caption}>{item.label}</span>
              <MenuIcon name={item.icon} />
            </button>
          )
        })}

      <button type="button" className={styles.item} onClick={open ? onBack : onOpen}>
        <span className={styles.caption}>{open ? backLabel : openLabel}</span>
        <MenuIcon name={open ? 'back' : 'menu'} />
      </button>
    </div>
  )
}
