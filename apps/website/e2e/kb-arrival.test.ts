import { expect, test, type BrowserContext, type Page } from '@playwright/test'

/**
 * The arrival marker: land on a fragment and the thing it named is framed for a
 * moment (sub-plan §6.2, D5).
 *
 * Nothing about it can be read off a stylesheet or a reducer. "A rectangle shrinks
 * onto the target" is a claim about a box's size on consecutive frames; "a section
 * arrival marks nothing" is a claim about an element that never appears; "with
 * `prefers-reduced-motion` there is no shrink but there is still a mark" is the same
 * claim twice, once about geometry and once about the mark existing at all. And the
 * one clause that matters most — the marker must NOT fire for a scroll the page
 * performs itself (§6.2, phase 16) — is only checkable against a real chrome doing a
 * real selection scroll.
 *
 * ## How a gesture that lasts one second is measured without a race
 *
 * `locator.click()` followed by a read would be reading after the fact. So every
 * page in this file is opened with a recorder already installed — a
 * `context.addInitScript`, which runs before any page script and therefore before
 * React has mounted, in popups as well as in the page that opened them. It samples
 * the marker's box and the target's box on every animation frame for as long as a
 * marker exists, and appends one entry per marker.
 *
 * That makes the marker's whole life available afterwards: whether one appeared, what
 * it framed, how its box changed frame by frame, and that it is gone. A negative
 * assertion ("no marker") waits out the full gesture and then reads an empty list,
 * rather than checking a locator at a moment that might be too early.
 *
 * Same conventions as `kb-select.test.ts` and `kb-reference.test.ts`: settle the
 * consent decision first, scope chrome locators to the stack's own CSS-module class,
 * and match accessible names exactly.
 *
 * ## Mutation checks
 *
 * Two of them, and both are permanent tests rather than a note:
 *
 *   - the **section arrival** below runs the same "a marker appeared" assertion
 *     against a fragment that arrives, scrolls, and must not be marked — so the
 *     assertion is shown to fail when the marker does not fire, on an input that
 *     differs only in which anchor was followed;
 *   - the **selection scroll** test runs it against a page that has already been
 *     marked once, and requires the count to stay at one across a scroll, a panel
 *     and three back steps.
 *
 * A third, out of band: `term:!0` was flipped to `term:!1` in the built chunk carrying
 * `MARKED_ON_ARRIVAL` (`lib/content/urls.ts`) — "terms are not marked", and nothing
 * else. Six of the nine tests here failed, and the three that passed are exactly the
 * three that do not depend on a term being marked: the two negative ones, and the claim
 * arrival, whose row the mutation left alone.
 */

/**
 * A chapter dense with cross-references, and the one that carries both cases at
 * once: 89 marks pointing at one term in another chapter, and 10 pointing at
 * sections in other chapters. Read off the built HTML.
 */
const SOURCE = '/hu/konyvek/alice-es-bob/fejezetek/alice-es-bob-alaptetele'

/**
 * A term reference into another chapter, and the anchor it lands on.
 *
 * `definiciok.gyuru-test.fogalmak.gyuru` is `termAnchorId(embeddedScope(node), …)` —
 * a term inside a definition embedded in that chapter — so it is the marked kind,
 * and it is the deepest form of it: the kind is named by the LAST pair of the path,
 * not the first (`lib/content/urls.ts`).
 */
const TERM_TARGET = '/hu/konyvek/alice-es-bob/fejezetek/alice-es-bob-gyuruje'
const TERM_ANCHOR = 'definiciok.gyuru-test.fogalmak.gyuru'

/**
 * A section reference into another chapter. `sectionAnchorId` output, so D5 says it
 * scrolls without a mark: it lands on a heading bearing its own name.
 */
const SECTION_TARGET = '/hu/konyvek/alice-es-bob/fejezetek/alice-es-bob-eladosodik'
const SECTION_ANCHOR = 'szakaszok.ekvivalenciarelaciok'

/**
 * An unmarked fragment on the chapter that carries the marked one, so one page can
 * be walked between the two by history alone. `sectionAnchorId` output again.
 */
const UNMARKED_ON_TERM_PAGE = 'szakaszok.neutralis-elem'

/**
 * The one page in the export that offers a fragment on ITSELF through a `<Link>`: a
 * reference panel whose subject is a claim of the entity the reader is already on
 * (`components/kb/panels/ReferencePanel.tsx`). Three such links exist, all of this
 * shape, and they are the arrival no history event announces — the App Router changes
 * the URL with `pushState`, which fires neither `hashchange` nor `popstate`, and the
 * path does not change for `usePathname` to report. Measured before the marker's
 * fourth trigger existed: the URL moved and not one of the three fired.
 */
const SELF_LINK_ENTITY = '/hu/tudasbazis/tetelek/gyuru-reszbenrendezesenek-tulajdonsagai'
const SELF_LINK_ANCHOR = 'allitasok.balrol-szorzas-rendezesfordito'

/** The same term on its own entity page, where the anchor loses the node prefix. */
const ENTITY = '/hu/tudasbazis/definiciok/gyuru-test'
const ENTITY_TERM_ANCHOR = 'fogalmak.gyuru'

/**
 * The last term in that entity's body, 1911px down a 2884px page: off-screen when
 * the page opens, so pressing it makes the chrome scroll the page (§6.4). That
 * scroll is the one the marker must ignore. Same constant as `kb-select.test.ts`'s
 * `BELOW_FOLD_TERM`, and for the same reason.
 */
const BELOW_FOLD_TERM = 'fogalmak.nullgyuru'

/** The component's own constants (`components/kb/ArrivalMarker.tsx`). */
const SHRINK_MS = 320
const HOLD_MS = 420
const FADE_MS = 260
const GESTURE_MS = SHRINK_MS + HOLD_MS + FADE_MS
const OUTSET_TIGHT = 4
const OUTSET_WIDE = 26

/** `next.config.ts` names every CSS-module class of ours `<file>_<local>`. */
const MARKER = '[data-kb-arrival-marker]'
const OVERLAY = '.overlay_overlay'
const PANEL = '#kb-panel'

const MENU = 'Menü'
const BACK = 'Vissza'
const TERMS = 'Fogalmak'

/** One animation frame of one marker, with the target it was framing at that moment. */
interface MarkerFrame {
  top: number
  left: number
  width: number
  height: number
  opacity: number
  zIndex: string
  pointerEvents: string
  targetTop: number
  targetLeft: number
  targetWidth: number
  targetHeight: number
}

interface Recorded {
  anchor: string
  frames: MarkerFrame[]
}

/**
 * Install the per-frame recorder on every page this context will ever open.
 *
 * `context.addInitScript` rather than `page.addInitScript`: the arrival this phase is
 * really about happens in a POPUP — a reference mark in the body is an `<a
 * target="_blank">` (`components/content/InlineText.tsx`), so following one opens a
 * new tab — and only the context-level script is there before that tab's own scripts
 * run.
 *
 * **It samples on the marker's own style write, not on an animation frame of its
 * own.** That is not a detail: `requestAnimationFrame` callbacks run in registration
 * order, this script registers before React has even loaded, and the component's loop
 * registers later — so a rAF sampler here would read the marker's box from the
 * PREVIOUS frame against the target's box from the current one, and every frame in
 * which the page scrolled would look like a marker that had lost its target. Measured:
 * that reads as a 59px, 178px or 1819px gap depending on how far the arrival scrolled.
 * A `MutationObserver` on the inline `style` fires as a microtask immediately after
 * the component has written the frame, so both boxes are read at one instant.
 *
 * It samples the TARGET's box on the same instant for the same reason, which is what
 * lets "framing it tightly" be asked as a distance between two boxes rather than as
 * two absolute positions that only agree if nothing moved.
 */
async function installRecorder(context: BrowserContext) {
  await context.addInitScript(() => {
    const store: Recorded[] = []
    ;(window as unknown as { __arrivals: Recorded[] }).__arrivals = store

    // For the one test that has to say WHY the fourth trigger exists: which history
    // events fired at all. Nothing else reads it.
    const history: string[] = []
    ;(window as unknown as { __history: string[] }).__history = history
    addEventListener('hashchange', () => history.push('hashchange'))
    addEventListener('popstate', () => history.push('popstate'))

    let node: Element | null = null
    let current: Recorded | null = null

    const sample = (element: Element) => {
      const anchor = element.getAttribute('data-kb-arrival-marker') ?? ''
      // A new entry when the element is a new one OR when React reused the node for
      // a different anchor, so two arrivals are never recorded as one.
      if (element !== node || current === null || current.anchor !== anchor) {
        node = element
        current = { anchor, frames: [] }
        store.push(current)
      }
      const marker = element.getBoundingClientRect()
      const computed = getComputedStyle(element)
      // `getElementById`: an anchor's segments are separated by `.`, which is a class
      // separator in a selector (see `lib/content/urls.ts`).
      const target = document.getElementById(anchor)?.getBoundingClientRect()
      current.frames.push({
        top: marker.top,
        left: marker.left,
        width: marker.width,
        height: marker.height,
        opacity: Number(computed.opacity),
        zIndex: computed.zIndex,
        pointerEvents: computed.pointerEvents,
        targetTop: target?.top ?? NaN,
        targetLeft: target?.left ?? NaN,
        targetWidth: target?.width ?? NaN,
        targetHeight: target?.height ?? NaN,
      })
    }

    new MutationObserver((records) => {
      for (const record of records) {
        const element = record.target
        if (!(element instanceof Element)) continue
        if (!element.hasAttribute('data-kb-arrival-marker')) continue
        // One sample per batch: the component writes five style properties per frame
        // and they arrive as five records of one frame.
        sample(element)
        return
      }
    }).observe(document, { attributes: true, subtree: true, attributeFilter: ['style'] })
  })
}

function recorded(page: Page): Promise<Recorded[]> {
  return page.evaluate(
    () => (window as unknown as { __arrivals?: Recorded[] }).__arrivals ?? [],
  )
}

/** The one marker this page produced, once it has finished and gone. */
async function oneCompletedMarker(page: Page): Promise<Recorded> {
  await expect.poll(async () => (await recorded(page)).length).toBe(1)
  await expect(page.locator(MARKER)).toHaveCount(0)
  const all = await recorded(page)
  expect(all).toHaveLength(1)
  return all[0]
}

/** How far outside the target each edge of the frame sat, per frame. */
function outsets(frames: MarkerFrame[]) {
  return frames.map((frame) => ({
    top: frame.targetTop - frame.top,
    left: frame.targetLeft - frame.left,
    width: (frame.width - frame.targetWidth) / 2,
    height: (frame.height - frame.targetHeight) / 2,
  }))
}

/** See `kb-chrome.test.ts`: the banner covers the chrome until a decision is made. */
async function settleConsent(page: Page) {
  const reject = page.getByRole('button', { name: 'Elutasítom', exact: true })
  await reject.click()
  await expect(reject).toBeHidden()
}

/** Follow one reference mark in the body, and hand back the tab it opened. */
async function followReference(context: BrowserContext, page: Page, href: string) {
  const mark = page.locator(`a[href="${href}"]`).first()
  await expect(mark).toBeVisible()
  const [popup] = await Promise.all([context.waitForEvent('page'), mark.click()])
  // A background tab has its animation frames throttled, and the marker is driven by
  // them. This is a reader following a link, so the tab is the one they are looking
  // at.
  await popup.bringToFront()
  await popup.waitForLoadState()
  return popup
}

test.describe('following a reference into another chapter', () => {
  test('a term reference marks the term it landed on', async ({ context, page }) => {
    await installRecorder(context)
    await page.goto(SOURCE)
    await settleConsent(page)

    const popup = await followReference(context, page, `${TERM_TARGET}#${TERM_ANCHOR}`)
    expect(new URL(popup.url()).pathname).toBe(TERM_TARGET)
    expect(new URL(popup.url()).hash).toBe(`#${TERM_ANCHOR}`)

    const marker = await oneCompletedMarker(popup)
    expect(marker.anchor).toBe(TERM_ANCHOR)

    // It framed the target, not merely appeared: the last frame before the fade is
    // §6.2's "framing it tightly", the same distance on all four edges.
    const settled = outsets(marker.frames)[marker.frames.length - 1]
    expect(settled.top).toBeCloseTo(OUTSET_TIGHT, 0)
    expect(settled.left).toBeCloseTo(OUTSET_TIGHT, 0)
    expect(settled.width).toBeCloseTo(OUTSET_TIGHT, 0)
    expect(settled.height).toBeCloseTo(OUTSET_TIGHT, 0)

    // …and it was on the screen throughout, from the first frame to the last. That is
    // what the gesture's wait for the arrival scroll buys: this chapter's target is
    // 34000px down and the page eases onto it over about 1.5 seconds, so a gesture
    // that started when the FRAGMENT arrived would have played out entirely off-screen.
    const height = popup.viewportSize()!.height
    for (const frame of marker.frames) {
      expect(frame.targetTop).toBeGreaterThan(0)
      expect(frame.targetTop).toBeLessThan(height)
    }
  })

  test('a section reference marks nothing, and still scrolls (D5)', async ({ context, page }) => {
    await installRecorder(context)
    await page.goto(SOURCE)
    await settleConsent(page)

    const popup = await followReference(context, page, `${SECTION_TARGET}#${SECTION_ANCHOR}`)
    expect(new URL(popup.url()).hash).toBe(`#${SECTION_ANCHOR}`)

    // The mutation check, as a test: the clause above is "a marker appeared and
    // framed the target", and here the same recorder is read after the same kind of
    // arrival on the same kind of page, and must find nothing. Waited out in full —
    // a marker cannot still be coming after the whole gesture's length twice over.
    await popup.waitForTimeout(GESTURE_MS * 2)
    expect(await recorded(popup)).toEqual([])
    await expect(popup.locator(MARKER)).toHaveCount(0)

    // "Scroll only" is the other half of the row, so the scroll has to be there.
    const heading = await popup.evaluate((anchor) => {
      const rect = document.getElementById(anchor)!.getBoundingClientRect()
      return { top: rect.top, scrollY: window.scrollY }
    }, SECTION_ANCHOR)
    expect(heading.scrollY).toBeGreaterThan(0)
    expect(heading.top).toBeLessThan(popup.viewportSize()!.height)
  })
})

test.describe('arriving on an entity page', () => {
  test('a term anchor on the entity itself is marked, and leaves nothing behind', async ({
    context,
    page,
  }) => {
    await installRecorder(context)
    // The entity-page form of the same anchor: the page node drops out, so this is
    // `fogalmak.gyuru` rather than `definiciok.gyuru-test.fogalmak.gyuru`. Both are
    // `termAnchorId` output and both are marked.
    await page.goto(`${ENTITY}#${ENTITY_TERM_ANCHOR}`)
    const marker = await oneCompletedMarker(page)
    expect(marker.anchor).toBe(ENTITY_TERM_ANCHOR)

    // §6.2: no lasting change to the element. The served markup for a term is
    // `<span id="…" class="term">` and that is exactly what is left.
    expect(
      await page.evaluate(
        (anchor) => document.getElementById(anchor)!.getAttributeNames().sort(),
        ENTITY_TERM_ANCHOR,
      ),
    ).toEqual(['class', 'id'])
    expect(
      await page.evaluate(
        (anchor) => document.getElementById(anchor)!.className,
        ENTITY_TERM_ANCHOR,
      ),
    ).toBe('term')
  })

  test('the marker does not fire for a scroll the page performs itself (§6.2)', async ({
    context,
    page,
  }) => {
    await installRecorder(context)
    // Arrived at WITH a fragment on purpose. A page that had never been marked would
    // pass this by doing nothing at all; starting from one recorded arrival makes the
    // assertion "and not a second one", which is what §6.2 actually forbids.
    await page.goto(`${ENTITY}#${ENTITY_TERM_ANCHOR}`)
    await settleConsent(page)
    await oneCompletedMarker(page)

    const stack = page.locator('.menu-stack_stack')
    const button = (name: string) => stack.getByRole('button', { name, exact: true })

    await button(MENU).click()
    await button(TERMS).click()
    await expect(page.locator(OVERLAY)).toBeVisible()

    // A term below the fold, so picking it makes `scrollSelectionIntoUpperHalf` move
    // the page — the scroll the marker must ignore.
    // Placed at 0.8 of the viewport first, exactly as `kb-select.test.ts` does: the
    // term is off-screen when the page opens, and a click at an off-screen position
    // lands on whatever happens to be there instead.
    const spot = await page.evaluate(
      (target) =>
        new Promise<{ x: number; y: number }>((resolve) => {
          const element = document.getElementById(target)!
          const first = element.getBoundingClientRect()
          window.scrollTo({
            top: window.scrollY + first.top - window.innerHeight * 0.8,
            behavior: 'instant' as ScrollBehavior,
          })
          requestAnimationFrame(() =>
            requestAnimationFrame(() => {
              const rect = element.getClientRects()[0]
              resolve({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 })
            }),
          )
        }),
      BELOW_FOLD_TERM,
    )
    const before = await page.evaluate(() => window.scrollY)
    await page.mouse.click(spot.x, spot.y)
    await expect(page.locator(PANEL)).toBeVisible()
    await expect.poll(() => page.evaluate(() => window.scrollY)).not.toBe(before)

    // And the three back steps out of it. Each is a `popstate` on the page's single
    // URL, fragment included, which is why `popstate` is not one of the marker's
    // triggers — taking it as an arrival would re-mark the fragment on every Vissza.
    await button(BACK).click()
    await expect(page.locator(PANEL)).toBeHidden()
    await button(BACK).click()
    await expect(button(TERMS)).toBeVisible()
    await button(BACK).click()
    await expect(page.locator(OVERLAY)).toHaveCount(0)

    await page.waitForTimeout(GESTURE_MS * 2)
    expect((await recorded(page)).map((entry) => entry.anchor)).toEqual([ENTITY_TERM_ANCHOR])
    await expect(page.locator(MARKER)).toHaveCount(0)
  })
})

test.describe('a fragment arrival that fires no history event', () => {
  test('a panel link to a claim on this very page marks it (§6.2)', async ({ context, page }) => {
    await installRecorder(context)
    await page.goto(SELF_LINK_ENTITY)
    await settleConsent(page)

    const href = `${SELF_LINK_ENTITY}#${SELF_LINK_ANCHOR}`
    // The body's own reference mark to that claim opens the reference panel rather
    // than navigating (§7.1) — so nothing has arrived anywhere yet.
    await page.locator(`.page-root a[href="${href}"]`).first().click()
    await expect(page.locator(PANEL)).toBeVisible()
    expect(await recorded(page)).toEqual([])

    // The panel's link is the one that navigates, and it navigates to this page.
    await page.locator(`${PANEL} a[href="${href}"]`).click()
    const marker = await oneCompletedMarker(page)
    expect(marker.anchor).toBe(SELF_LINK_ANCHOR)
    expect(new URL(page.url()).pathname).toBe(SELF_LINK_ENTITY)

    // No `hashchange` and no `popstate` were available to notice it — which is the
    // whole reason the marker watches the fragment for a moment after a fragment link
    // is pressed. Asserted here so the day one of them starts firing, this still says
    // what it is testing.
    const events = await page.evaluate(
      () => (window as unknown as { __history?: string[] }).__history ?? [],
    )
    expect(events).toEqual([])
  })
})

test.describe('the shape of the gesture', () => {
  test('the rectangle shrinks onto the target, holds, and fades', async ({ context, page }) => {
    await installRecorder(context)
    await page.goto(`${TERM_TARGET}#${TERM_ANCHOR}`)
    const marker = await oneCompletedMarker(page)

    const spread = outsets(marker.frames)
    // Frame by frame: it starts wide, never grows, and ends tight. Not "the first is
    // bigger than the last" — that would pass for a box that jumped.
    expect(spread[0].top).toBeCloseTo(OUTSET_WIDE, 0)
    expect(spread[spread.length - 1].top).toBeCloseTo(OUTSET_TIGHT, 0)
    for (let i = 1; i < spread.length; i += 1) {
      expect(spread[i].top).toBeLessThanOrEqual(spread[i - 1].top + 0.01)
    }
    // It really moved over several frames rather than in one step.
    const shrinking = spread.filter((frame) => frame.top > OUTSET_TIGHT + 0.5).length
    expect(shrinking).toBeGreaterThan(3)

    // Held at full strength, then faded to nothing — and the fade is the end of it.
    const opacity = marker.frames.map((frame) => frame.opacity)
    expect(Math.max(...opacity)).toBe(1)
    expect(opacity[opacity.length - 1]).toBeLessThan(0.2)
    expect(opacity.filter((value) => value === 1).length).toBeGreaterThan(3)

    // The frame is a decoration and nothing else: it is not in the way of the reader
    // pressing what it is around, and it sits at the layer `_variables.scss` gives it
    // ($z-kb-marker, under every layer that means "deal with this now"). Read off the
    // recorded frames, which are live computed styles taken while the marker was up.
    for (const frame of marker.frames) {
      expect(frame.zIndex).toBe('690')
      expect(frame.pointerEvents).toBe('none')
    }
  })

  test('under prefers-reduced-motion there is no shrink and there is still a mark', async ({
    context,
    page,
  }) => {
    // `page.emulateMedia` rather than the `reducedMotion` fixture, which on
    // Playwright 1.62.1 leaves `matchMedia` false in the page — see
    // `kb-panel.test.ts` and `kb-select.test.ts`.
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await installRecorder(context)
    await page.goto(`${TERM_TARGET}#${TERM_ANCHOR}`)
    expect(
      await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches),
    ).toBe(true)

    const marker = await oneCompletedMarker(page)

    // Still a mark. §6.4 removes the movement, not the marker — showing the reader
    // where they landed is its job.
    expect(marker.anchor).toBe(TERM_ANCHOR)
    expect(marker.frames.length).toBeGreaterThan(3)

    // And no shrink: already at its final size on the very first frame, and on every
    // frame after it. The discriminating trace against the animated one above, which
    // starts at OUTSET_WIDE and takes more than three frames to get here.
    for (const frame of outsets(marker.frames)) {
      expect(frame.top).toBeCloseTo(OUTSET_TIGHT, 0)
      expect(frame.left).toBeCloseTo(OUTSET_TIGHT, 0)
      expect(frame.width).toBeCloseTo(OUTSET_TIGHT, 0)
      expect(frame.height).toBeCloseTo(OUTSET_TIGHT, 0)
    }
    // The one thing it still does is fade.
    const opacity = marker.frames.map((frame) => frame.opacity)
    expect(opacity[0]).toBe(1)
    expect(opacity[opacity.length - 1]).toBeLessThan(0.2)
  })
})

test.describe('a fragment the site does not mark', () => {
  test('a page opened without one is never marked', async ({ context, page }) => {
    await installRecorder(context)
    await page.goto(TERM_TARGET)
    await page.waitForTimeout(GESTURE_MS * 2)
    expect(await recorded(page)).toEqual([])
  })

  test('a back step onto a fragment marks it again', async ({ context, page }) => {
    await installRecorder(context)
    await page.goto(`${TERM_TARGET}#${UNMARKED_ON_TERM_PAGE}`)
    await page.waitForTimeout(GESTURE_MS * 2)
    expect(await recorded(page)).toEqual([])

    // Setting `location.hash` is what pressing a same-page fragment link does, and it
    // fires `hashchange` — the marker's second trigger.
    await page.evaluate((anchor) => {
      window.location.hash = anchor
    }, TERM_ANCHOR)
    const first = await oneCompletedMarker(page)
    expect(first.anchor).toBe(TERM_ANCHOR)

    // Back to the section fragment, which is not marked, and forward again, which is.
    await page.goBack()
    await page.waitForTimeout(GESTURE_MS * 2)
    expect((await recorded(page)).length).toBe(1)

    await page.goForward()
    await expect.poll(async () => (await recorded(page)).length).toBe(2)
    await expect(page.locator(MARKER)).toHaveCount(0)
    expect((await recorded(page)).map((entry) => entry.anchor)).toEqual([
      TERM_ANCHOR,
      TERM_ANCHOR,
    ])
  })
})
