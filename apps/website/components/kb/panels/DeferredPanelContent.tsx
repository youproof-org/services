'use client'

import { useState, type ReactNode } from 'react'

/**
 * A panel content that reaches the page when the reader opens it, and is absent
 * from the served HTML until then.
 *
 * **What it removes is the second copy, not the content.** `children` is a
 * `ReactNode` prop handed across the client boundary, so the server renders it
 * either way and the finished tree travels in the RSC payload — the
 * `self.__next_f.push(...)` scripts every App Router page already carries, which is
 * how any panel's markup reaches the browser at all. Returning `null` during the
 * server HTML pass drops only the *other* copy, the one written into the markup a
 * crawler reads. So nothing is fetched, nothing is rebuilt from data, and a row the
 * reader sees on open is the same row the server always built: this component
 * cannot change how one looks, only when it lands.
 *
 * Measured over the local export when this landed: the busiest page,
 * `tudasbazis/definiciok/gyuru-test`, went from 891 backlink rows in its markup to
 * 7 and from 1,359,614 to 924,870 served bytes, while its payload kept all 891 rows
 * and grew by 526 bytes. Across all 588 pages the markup fell from 55.53 MiB to
 * 50.31 MiB. The 7 that stay are `panels/ReferencePanel.tsx`, which wears the same
 * stylesheet and is not an inbound list.
 *
 * **Why anything is deferred at all.** An inbound-reference list is the transpose
 * of edges the citing pages already state in their own markup, so serving it here
 * repeats what the crawler can already read — on the busiest entity page it was
 * most of the document. Everything else a crawler should follow stays in the served
 * HTML: the body, the ownership chain, the Kontextus panel and the reference panels
 * are untouched. `DEFERRED_PANEL_KINDS` in `components/kb/KbEntityPage.tsx` is the
 * one place that says which contents this applies to.
 *
 * **`everOpened`, not `open`.** Closing must not throw the content away while the
 * sheet is still sliding down — the same reason `Panel` keeps showing the last
 * content after the active key has dropped to `null`. Once produced, a content
 * stays produced for the life of the page.
 *
 * The flag is raised during render rather than in an effect, again as `Panel` does
 * for `shown`: an effect would paint one frame of an empty panel over the page
 * before the content arrived, which is the glitch the whole state exists to avoid.
 * React re-renders this component immediately with the new state and never commits
 * the discarded pass, so this is a render loop of two and not a second commit.
 */
interface DeferredPanelContentProps {
  /** Whether this content is the one the panel is showing. */
  open: boolean
  children: ReactNode
}

export default function DeferredPanelContent({ open, children }: DeferredPanelContentProps) {
  const [everOpened, setEverOpened] = useState(open)
  if (open && !everOpened) setEverOpened(true)
  return everOpened ? <>{children}</> : null
}
