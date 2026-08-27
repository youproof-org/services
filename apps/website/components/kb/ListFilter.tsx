'use client'

import { useRef, useState, type ReactNode } from 'react'
import { filterTextMatches } from '@/lib/utils/filter-text'
import styles from './list-filter.module.scss'

interface ListFilterProps {
  /** Input placeholder, and its accessible name — there is no visible label. */
  placeholder: string
  /** Shown when a query matches no row. */
  emptyLabel: string
  /** The one-action clear. */
  clearLabel: string
  /** The list to filter: rendered in full, on the server, by the page. */
  children: ReactNode
}

/**
 * The filter above a knowledge-base list: immediate, no submit, no round trip
 * (sub-plan §4).
 *
 * The only client component on these pages, and it does not produce the list — it
 * hides rows of a list somebody else rendered on the server (§2.1). Its entire
 * contract with the page is one attribute: every filterable row carries
 * `data-filter-text` with the text to match on, and the filter toggles `hidden` on
 * exactly those elements. Nothing else about a row is its business, which is what
 * lets the glossary's name rows and the index pages' title rows share it.
 *
 * `data-filter-text` rather than the row's own `textContent`: a name authored with
 * inline LaTeX renders to KaTeX markup whose text content is the rendered glyphs
 * plus a MathML copy of the TeX source, and matching against that finds nothing a
 * reader would type. The attribute is the plain text the page wants matched.
 *
 * The DOM is written directly instead of through React state on purpose. Re-
 * rendering the rows on every keystroke would mean owning them, and owning them
 * would mean generating them — which is the one thing these lists must not be.
 */
export default function ListFilter({
  placeholder,
  emptyLabel,
  clearLabel,
  children,
}: ListFilterProps) {
  const [query, setQuery] = useState('')
  // Null while nothing is typed: "unfiltered" is a different state from "a query
  // that matched nothing", and only the second one shows the empty state.
  const [matches, setMatches] = useState<number | null>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  function apply(next: string) {
    setQuery(next)
    const rows = listRef.current?.querySelectorAll<HTMLElement>('[data-filter-text]')
    if (!rows) return
    let visible = 0
    for (const row of rows) {
      const match = filterTextMatches(row.dataset.filterText ?? '', next)
      row.hidden = !match
      if (match) visible += 1
    }
    setMatches(next.trim() === '' ? null : visible)
  }

  return (
    <div className={styles.filter}>
      <div className={styles.controls}>
        <input
          ref={inputRef}
          className={styles.input}
          type="search"
          value={query}
          placeholder={placeholder}
          aria-label={placeholder}
          autoComplete="off"
          onChange={(event) => apply(event.target.value)}
        />
        <button
          type="button"
          className={styles.clear}
          hidden={query === ''}
          onClick={() => {
            apply('')
            // Focus goes back where the reader was typing, so clearing and
            // retyping is one gesture.
            inputRef.current?.focus()
          }}
        >
          {clearLabel}
        </button>
      </div>

      {/* Served, hidden, like the rows themselves (§2.1) — a `hidden` paragraph is
          cheaper than a reason to generate text on the client. */}
      <p className={styles.empty} role="status" hidden={matches !== 0}>
        {emptyLabel}
      </p>

      <div ref={listRef}>{children}</div>
    </div>
  )
}
