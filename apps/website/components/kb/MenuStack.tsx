'use client'

import type { KbMenuIcon, KbMenuItem, KbMenuItemKey } from '@/lib/kb/menu-items'
import styles from './menu-stack.module.scss'

/**
 * The entity page's context menu: a vertical stack of pill buttons in the
 * bottom-right corner (sub-plan §6.2).
 *
 * The corner is the mirror of the cookie-consent opener's, and so is the button
 * treatment — a 2.75rem circle, white on a hairline border, black and white only,
 * with a 1rem glyph centred in it, which is the size that opener's shield paints at
 * (see `.icon` in `menu-stack.module.scss` for the measurement). The circle sits ON a
 * caption bar rather than being that bar's rounded right end: it is complete, and a
 * shadow of its own lifts it off the bar it is laid on. Every bar is the same width, so
 * the circles line up in a column whatever the captions measure.
 *
 * The bottom-most button is the constant: **Menü** in the default state and
 * **Vissza** in every other one, in the same place, so the reader always knows
 * where the control is. It also pulses while `hint` is set — the corner is far from
 * the column being read, and a still white pill there was going unnoticed.
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
  /**
   * The reader has not opened the menu on this page yet, so the bottom-most button
   * pulses to say it is there (`.hint` in `menu-stack.module.scss`). Only ever true
   * in the default state: what pulses is an offer to open the menu, not Vissza.
   */
  hint: boolean
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
 * icon at 16, 32 and 48 px for the 16 px box, so a retina screen gets a sharp one
 * and nobody downloads the 512 px original.
 */
const DPRS = [1, 2, 3]

/**
 * The glyph, and the 2.75rem circle it is centred in.
 *
 * Two elements rather than one image sized to the button, because the two sizes are
 * different facts: the circle is the item's right end and the touch target (44px), the
 * glyph is what the reader looks at (1rem — the consent shield's size, which is what
 * this now matches). Padding on the image itself would express the same geometry, but
 * every one of the four numbers would then have to be read together to see either
 * size.
 */
function MenuIcon({ name }: { name: KbMenuIcon }) {
  return (
    <span className={styles.iconBox}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        className={styles.icon}
        src={`${ICON_DIR}/${name}@1x.png`}
        srcSet={DPRS.map((dpr) => `${ICON_DIR}/${name}@${dpr}x.png ${dpr}x`).join(', ')}
        width={16}
        height={16}
        // The caption beside it says the same thing, so the icon is decoration.
        alt=""
      />
    </span>
  )
}

export default function MenuStack({
  items,
  open,
  showItems,
  liveItems,
  hint,
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

      <button
        type="button"
        className={`${styles.item}${hint ? ` ${styles.hint}` : ''}`}
        onClick={open ? onBack : onOpen}
      >
        <span className={styles.caption}>{open ? backLabel : openLabel}</span>
        <MenuIcon name={open ? 'back' : 'menu'} />
      </button>
    </div>
  )
}
