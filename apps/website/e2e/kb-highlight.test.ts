import { expect, test, type BrowserContext, type Page } from '@playwright/test'

/**
 * The arrival highlight: follow a "Bejövő hivatkozások" row and land on the places
 * that source cites you (sub-plan §7.2, D7).
 *
 * Nothing here can be read off a module. The three parts of D7 only exist together —
 * an attribute in the served HTML, a parameter appended by a click, and a page that
 * validates it, marks what it names and takes the parameter back out of the address
 * bar — and every claim about them is a claim about a live document: how many
 * rectangles appeared, which elements they framed, where the page came to rest, and
 * what the URL said afterwards. The character rule itself is a pure function and is
 * tested as one in `test/highlight-param.test.mjs`; what is here is the same rule
 * refusing to act on a real page.
 *
 * ## How a gesture that lasts one second is measured without a race
 *
 * The same recorder `e2e/kb-arrival.test.ts` installs, widened to many marks at once:
 * a `context.addInitScript` that samples every marker's box **on the marker's own
 * style write** rather than on an animation frame of its own. That is not a detail —
 * rAF callbacks run in registration order and an init script registers before React
 * loads, so a sampler of its own would read a marker's box from the previous frame
 * against a target's box from the current one, which on a page that scrolled reads as
 * a marker that lost its target (measured in phase 18: 59px, 178px and 1819px gaps).
 * A `MutationObserver` on the inline `style` fires as a microtask right after the
 * component has written the frame.
 *
 * One entry per marker ELEMENT here, where `kb-arrival` keys entries by the anchor
 * being marked: a highlight arrival puts several rectangles up at once and all of
 * them name the same fully qualified name, so the name cannot tell them apart.
 *
 * ## Mutation checks
 *
 * Two, and both are permanent tests rather than a note:
 *
 *   - **the counts in the worked case are discriminating.** 108 references to that
 *     term are on the page and 22 of them are inside the section the row named; the
 *     marks must be the 9 the section itself made. A rule that dropped the scope, or
 *     the owner boundary, or both, fails on a number rather than on a judgement.
 *   - **the hostile parameters** run the same "a marker appeared" assertion against
 *     inputs that differ from the working one only in the parameter's value, and
 *     require nothing to be marked and nothing to be thrown.
 *
 * A third, out of band, is recorded in the phase report: `data-ref-owner` was renamed
 * in the built chunk that carries the arrival's filter — leaving the attribute in the
 * HTML untouched, so the scope collapsed to the page and every boundary vanished — and
 * exactly 7 of the 24 tests here failed, every one of them on `Expected: 9, Received:
 * 108`. The 17 that passed are the ones that do not depend on a mark appearing: the
 * fourteen hostile parameters, the two other negative cases, and the href check.
 *
 * Conventions from `kb-arrival.test.ts` and `kb-select.test.ts`: settle the consent
 * decision first, scope chrome locators to the stack's own CSS-module class, and
 * match accessible names exactly.
 */

/**
 * §7.2's worked case, as it exists in the content.
 *
 * The reader is on a theorem page, has selected one of its terms, and the panel
 * offers 40 sources. The third of them is a SECTION of the book reporting 5
 * references — the case §7.2 describes — and following it opens the chapter that
 * section belongs to.
 *
 * Every number is read off the built export:
 * `grep -o 'data-kb-panel-kind="term" data-kb-panel-target="…"' out/hu/tudasbazis/tetelek/egesz-szamok-maradekosztalyai.html`
 * for the panel, and its rows for the count and the href.
 */
const THEOREM = '/hu/tudasbazis/tetelek/egesz-szamok-maradekosztalyai'
const TERM_ANCHOR = 'fogalmak.modulo-m-maradekosztaly'
const TERM_FQN = 'theorems.egesz-szamok-maradekosztalyai.terms.residue-class-modulo-m'
const ROW_COUNT = 5
const CHAPTER = '/hu/konyvek/alice-es-bob/fejezetek/alice-bob-es-a-kinaiak'
const SECTION = 'szakaszok.a-kinai-maradektetel'
const ROW_HREF = `${CHAPTER}#${SECTION}`

/**
 * What the arrival must mark, and the two numbers that make that a real claim.
 *
 * `MARKS` is what the section itself wrote: 9 rendered references, from the 5
 * reference entries the row counted — the section uses those five slugs 3, 3, 1, 1 and
 * 1 times in its narrative (`Object.entries(section.references)` filtered by target,
 * against the `[slug]` uses in its body). A row's count is over ENTRIES; a mark is a
 * rendered link, and the two are different quantities on this content.
 *
 * `IN_SECTION` is every reference to the term inside that section, embedded entities
 * included, and `ON_PAGE` is every one in the chapter. Both are what the marks must
 * NOT be: the 13 extra inside the section were written by an embedded theorem and its
 * proof, which have rows of their own in the same list, and the 86 beyond it belong to
 * other sections.
 */
const MARKS = 9
const IN_SECTION = 22
const ON_PAGE = 108

/** A fully qualified name nothing on the chapter page points at. */
const ABSENT_FQN = 'definitions.nincs-ilyen-definicio'

/** The parameter's name (`lib/kb/highlight.ts`). */
const PARAM = 'kb_highlight'

/** The component's own constants (`components/kb/ArrivalMarker.tsx`). */
const SHRINK_MS = 320
const HOLD_MS = 420
const FADE_MS = 260
const GESTURE_MS = SHRINK_MS + HOLD_MS + FADE_MS
const OUTSET_TIGHT = 4
const OUTSET_WIDE = 26

/** `next.config.ts` names every CSS-module class of ours `<file>_<local>`. */
const MARKER = '[data-kb-arrival-marker]'
const PANEL = '#kb-panel'
const OVERLAY = '.overlay_overlay'
const ROW = `${PANEL} [data-kb-panel-kind="term"][data-kb-panel-target="${TERM_ANCHOR}"] .backlinks-panel_link`

const MENU = 'Menü'
const TERMS = 'Fogalmak'

/**
 * One animation frame of one marker.
 *
 * `scrollY` is part of the frame because a mark now plays when its own target comes
 * into view, so two marks of one arrival can be drawn at two different scroll
 * positions: a marker's box is in viewport coordinates, and only `box + scrollY` can
 * be compared with a target measured later.
 */
interface MarkFrame {
  top: number
  left: number
  width: number
  height: number
  opacity: number
  zIndex: string
  pointerEvents: string
  scrollY: number
  /** When it was sampled, which is when the component wrote it. */
  at: number
}

interface Recorded {
  name: string
  frames: MarkFrame[]
}

async function installRecorder(context: BrowserContext) {
  await context.addInitScript(() => {
    const store: Recorded[] = []
    ;(window as unknown as { __marks: Recorded[] }).__marks = store
    const seen = new Map<Element, Recorded>()

    const sample = (element: Element) => {
      let current = seen.get(element)
      if (!current) {
        current = { name: element.getAttribute('data-kb-arrival-marker') ?? '', frames: [] }
        seen.set(element, current)
        store.push(current)
      }
      const box = element.getBoundingClientRect()
      const computed = getComputedStyle(element)
      current.frames.push({
        top: box.top,
        left: box.left,
        width: box.width,
        height: box.height,
        opacity: Number(computed.opacity),
        zIndex: computed.zIndex,
        pointerEvents: computed.pointerEvents,
        scrollY: window.scrollY,
        at: performance.now(),
      })
    }

    new MutationObserver((records) => {
      // Every marker in the batch, once each: the component writes five style
      // properties per box per frame, and with nine boxes up they arrive as
      // forty-five records of one frame.
      const done = new Set<Element>()
      for (const record of records) {
        const element = record.target
        if (!(element instanceof Element)) continue
        if (!element.hasAttribute('data-kb-arrival-marker')) continue
        if (done.has(element)) continue
        done.add(element)
        sample(element)
      }
    }).observe(document, { attributes: true, subtree: true, attributeFilter: ['style'] })
  })
}

function recorded(page: Page): Promise<Recorded[]> {
  return page.evaluate(() => (window as unknown as { __marks?: Recorded[] }).__marks ?? [])
}

/**
 * Every marker this page produced, once they have all finished and gone.
 *
 * A mark plays when its own target comes into view, so an arrival whose marks are not
 * all on screen only reaches this state after the reader has scrolled past them —
 * `scrollPastEveryMark`. The boxes leaving the DOM is the second half of the check and
 * is what says the arrival is over rather than merely quiet: they are unmounted
 * together, when the last mark has faded.
 */
async function completedMarks(page: Page, expected: number): Promise<Recorded[]> {
  await expect.poll(async () => (await recorded(page)).length).toBe(expected)
  await expect(page.locator(MARKER)).toHaveCount(0)
  return recorded(page)
}

/** See `kb-chrome.test.ts`: the banner covers the chrome until a decision is made. */
async function settleConsent(page: Page) {
  const reject = page.getByRole('button', { name: 'Elutasítom', exact: true })
  await reject.click()
  await expect(reject).toBeHidden()
}

function stack(page: Page) {
  return page.locator('.menu-stack_stack')
}

function chromeButton(page: Page, name: string) {
  return stack(page).getByRole('button', { name, exact: true })
}

/**
 * Open the theorem page and select the term, exactly as a reader does: Menü →
 * Fogalmak, then press the term in the body.
 *
 * The term is placed at 0.8 of the viewport before it is pressed, as
 * `kb-select.test.ts` does and for the same reason: a click at a position that is
 * off-screen lands on whatever happens to be there instead.
 */
async function selectTerm(page: Page) {
  await page.goto(THEOREM)
  await settleConsent(page)
  await chromeButton(page, MENU).click()
  await chromeButton(page, TERMS).click()
  await expect(page.locator(OVERLAY)).toBeVisible()

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
    TERM_ANCHOR,
  )
  await page.mouse.click(spot.x, spot.y)
  await expect(page.locator(PANEL)).toBeVisible()
}

/**
 * What the marks should have framed, measured on the arrived-at page: every
 * reference the SECTION itself made at the term.
 *
 * Re-derived here from plain DOM queries rather than taken from the component, so
 * this is a second opinion about the same set and not the implementation agreeing
 * with itself.
 */
function ownReferences(page: Page) {
  return page.evaluate(
    ([fqn, section]) => {
      const selector = `[data-target-fqn="${fqn}"], [data-target-fqn^="${fqn}."]`
      const scope = document.getElementById(section)!
      const all = [...document.querySelectorAll<HTMLElement>(selector)]
      const inSection = all.filter((element) => scope.contains(element))
      const own = inSection.filter(
        (element) => element.closest('[data-ref-owner]') === scope && !element.closest('#kb-panel'),
      )
      const headerBottom = Math.max(
        0,
        Math.round(document.querySelector('header')!.getBoundingClientRect().bottom),
      )
      return {
        onPage: all.length,
        inSection: inSection.length,
        // In DOCUMENT coordinates, because a mark is drawn whenever its own target
        // reaches the reader and the page has moved on by the time this is read. A
        // marker's frame carries the `scrollY` it was written at, so the two are
        // comparable in this space and in no other.
        own: own.map((element) => {
          const box = element.getBoundingClientRect()
          return {
            top: box.top + window.scrollY,
            left: box.left,
            width: box.width,
            height: box.height,
            // Whether the reader can see it right now: below the sticky header, above
            // the fold. The same gate `ArrivalMarks` applies through its observer's
            // `rootMargin`, computed here from the DOM rather than taken from it.
            visible: box.bottom > headerBottom && box.top < window.innerHeight,
          }
        }),
      }
    },
    [TERM_FQN, SECTION] as const,
  )
}

/**
 * Walk the page past the reader in three-quarter-viewport steps, so every mark's
 * target is in front of them at least once.
 *
 * This is what a reader does with a long section, and since a mark plays when its own
 * target comes into view, it is also the only way an arrival with off-screen marks
 * ever finishes. Downwards only: the marks are in document order and the arrival
 * centres the first of them, so nothing to be woken is above where the page landed.
 *
 * `instant`, because `:root` carries `scroll-behavior: smooth` and a smooth step would
 * still be travelling when the next one was issued. Two frames per step, which is what
 * lets the observer deliver — intersections are delivered after the frame's animation
 * callbacks have run.
 *
 * **It waits for the arrival to have landed first.** The gesture holds off until the
 * arrival scroll comes to rest (`SETTLE_FRAMES` in `components/kb/ArrivalMarker.tsx`),
 * and a walk that started before that never lets it: the page would still be moving
 * when the wait gave up, four seconds later, by which time every mark is above the
 * viewport and none of them can come into it again. The first mark being drawn is the
 * signal that the arrival is over and the reader has the page.
 */
async function scrollPastEveryMark(page: Page) {
  await expect.poll(async () => (await recorded(page)).length).toBeGreaterThan(0)
  await page.evaluate(async () => {
    const frame = () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      )
    let previous = -1
    while (window.scrollY !== previous) {
      previous = window.scrollY
      window.scrollBy({ top: window.innerHeight * 0.75, behavior: 'instant' as ScrollBehavior })
      await frame()
    }
  })
}

test.describe('the worked case (§7.2)', () => {
  test('a section row reporting five references lands on all of them, marked', async ({
    context,
    page,
  }) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await installRecorder(context)
    await selectTerm(page)

    // The row §7.2 describes, found by what it says rather than by position.
    const row = page.locator(ROW).filter({ has: page.locator(`[data-backlink-count="${ROW_COUNT}"]`) })
    await expect(row).toHaveCount(1)
    // The served href is clean, and it stays clean: this is what a crawler reads and
    // what "copy link address" copies (D7).
    await expect(row).toHaveAttribute('href', ROW_HREF)
    await expect(row).toHaveAttribute('data-highlight-fqn', TERM_FQN)

    await row.click()

    // Arrived — and the parameter is already gone from the address bar. Polled
    // because it was there for a moment: it is how the page was asked to highlight.
    await expect(page).toHaveURL(new RegExp(`${CHAPTER}#${SECTION.replace(/\./g, '\\.')}$`))
    expect(new URL(page.url()).search).toBe('')

    // Every one of them, which means walking the section: the marks below the fold
    // wait for the reader to reach them.
    await scrollPastEveryMark(page)
    const marks = await completedMarks(page, MARKS)
    expect(marks.map((mark) => mark.name)).toEqual(Array(MARKS).fill(TERM_FQN))

    // The discriminating numbers: 108 references to this term are on the page and 22
    // are inside this section, and neither is what was marked.
    const references = await ownReferences(page)
    expect(references.onPage).toBe(ON_PAGE)
    expect(references.inSection).toBe(IN_SECTION)
    expect(references.own).toHaveLength(MARKS)

    // Each mark framed a different one of them, tightly (§6.2's OUTSET_TIGHT) — read
    // off the marker's last frame at full opacity, which is the frame the fade starts
    // from, and matched against the elements' own boxes.
    //
    // In document coordinates: the boxes were written at nine different scroll
    // positions and are measured at a tenth, so `frame.top + frame.scrollY` is the only
    // form in which the two are the same quantity.
    const settled = marks.map((mark) => {
      const held = mark.frames.filter((entry) => entry.opacity === 1)
      return held[held.length - 1]
    })
    const unmatched = [...references.own]
    for (const frame of settled) {
      const top = frame.top + frame.scrollY
      const index = unmatched.findIndex(
        (target) =>
          Math.abs(target.top - top - OUTSET_TIGHT) < 1 &&
          Math.abs(target.left - frame.left - OUTSET_TIGHT) < 1 &&
          Math.abs(target.width + OUTSET_TIGHT * 2 - frame.width) < 1 &&
          Math.abs(target.height + OUTSET_TIGHT * 2 - frame.height) < 1,
      )
      expect(index, `no unframed reference at ${JSON.stringify(frame)}`).toBeGreaterThanOrEqual(0)
      unmatched.splice(index, 1)
    }
    expect(unmatched).toEqual([])
    expect(errors).toEqual([])
  })

  test('the page comes to rest at the first of the marks, not at the section heading', async ({
    context,
    page,
  }) => {
    await installRecorder(context)
    await selectTerm(page)
    await page
      .locator(ROW)
      .filter({ has: page.locator(`[data-backlink-count="${ROW_COUNT}"]`) })
      .click()
    // Where the ARRIVAL put the page, so nothing here may scroll it: the marks below
    // the fold are left waiting, and the gesture that has played is the first one's.
    await expect.poll(async () => (await recorded(page)).length).toBeGreaterThan(0)

    const viewport = page.viewportSize()!
    const where = await page.evaluate(
      ([fqn, section]) => {
        const selector = `[data-target-fqn="${fqn}"], [data-target-fqn^="${fqn}."]`
        const scope = document.getElementById(section)!
        const first = [...document.querySelectorAll<HTMLElement>(selector)].find(
          (element) => element.closest('[data-ref-owner]') === scope,
        )!
        return {
          first: first.getBoundingClientRect().top,
          heading: scope.getBoundingClientRect().top,
          scrollY: window.scrollY,
        }
      },
      [TERM_FQN, SECTION] as const,
    )

    // The page moved, and it moved to the reference rather than to the anchor the row
    // carried: §7.2's whole point is that the section heading was only ever a proxy
    // for "the references are somewhere in there".
    expect(where.scrollY).toBeGreaterThan(0)
    expect(where.first).toBeGreaterThan(0)
    expect(where.first).toBeLessThan(viewport.height)
    // Centred, which is what puts it clear of the sticky header with its sentence
    // readable above and below.
    expect(Math.abs(where.first - viewport.height / 2)).toBeLessThan(viewport.height / 4)
    // And the heading is above the fold — the reader is INSIDE the section, not at
    // the top of it.
    expect(where.heading).toBeLessThan(0)
  })

  test('nothing in the served HTML carries the parameter, before or after', async ({ page }) => {
    // The served markup first: 435 chapter rows and 7683 rows in all carry a clean
    // href, and the parameter is added by the client at click time (D7). Asserted on
    // the page the reader is on, hydrated, with the listener installed.
    await selectTerm(page)
    expect(await page.locator(`a[href*="${PARAM}"]`).count()).toBe(0)

    const row = page.locator(ROW).filter({ has: page.locator(`[data-backlink-count="${ROW_COUNT}"]`) })
    await row.click()

    // …and on the page it led to, once the arrival has been dealt with: no parameter
    // in the address bar, so no parameter in a copied link either, and none in any
    // href on the new page.
    await expect(page).toHaveURL(new RegExp(`${CHAPTER}#`))
    await expect.poll(() => new URL(page.url()).search).toBe('')
    expect(await page.locator(`a[href*="${PARAM}"]`).count()).toBe(0)
  })
})

test.describe('a parameter the page will not act on', () => {
  /**
   * Everything a crafted URL can carry, named by what it is. The same shapes
   * `test/highlight-param.test.mjs` runs against the rule directly — a selector
   * injection, a bracket, a universal selector, whitespace, a percent escape, unicode,
   * an empty segment, a leading and a trailing dot, and a value far too long.
   */
  const HOSTILE: Record<string, string> = {
    'a quote closing the attribute selector': `${TERM_FQN}"`,
    'a quote and an injected clause': `x"], [data-target-fqn^="`,
    'a bracket': `${TERM_FQN}]`,
    'a universal selector': '*',
    'a comma-separated second selector': `${TERM_FQN},*`,
    'a pseudo-class': `${TERM_FQN}:has(a)`,
    'a space': `${TERM_FQN} a`,
    'a percent-encoded quote': `${TERM_FQN}%22`,
    'unicode': 'definitions.gyűrű-test',
    'uppercase': TERM_FQN.toUpperCase(),
    'an empty segment': TERM_FQN.replace('.terms.', '..terms.'),
    'a leading dot': `.${TERM_FQN}`,
    'a trailing dot': `${TERM_FQN}.`,
    'far too long': `definitions.${'x'.repeat(600)}`,
  }

  for (const [what, value] of Object.entries(HOSTILE)) {
    test(`${what} is ignored rather than acted on`, async ({ context, page }) => {
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      await installRecorder(context)

      // The same arrival as the working one above, differing only in the parameter's
      // value — which is what makes "nothing was marked" a discriminating result
      // rather than a page that could never have marked anything.
      await page.goto(`${CHAPTER}?${PARAM}=${encodeURIComponent(value)}#${SECTION}`)
      // Waited out in full: a marker cannot still be coming after twice the length of
      // the whole gesture.
      await page.waitForTimeout(GESTURE_MS * 2)

      expect(await recorded(page)).toEqual([])
      await expect(page.locator(MARKER)).toHaveCount(0)
      // Scrubbed all the same. A value this page will not act on is exactly a value
      // that should not be left in the address bar (D7).
      expect(new URL(page.url()).search).toBe('')
      expect(new URL(page.url()).hash).toBe(`#${SECTION}`)
      // And nothing threw on the way: the rule rejects before the value is used, so
      // there is no selector to fail to parse.
      expect(errors).toEqual([])
    })
  }

  test('a well-formed name nothing on the page points at marks nothing, and is still scrubbed', async ({
    context,
    page,
  }) => {
    await installRecorder(context)
    await page.goto(`${CHAPTER}?${PARAM}=${ABSENT_FQN}#${SECTION}`)
    await page.waitForTimeout(GESTURE_MS * 2)

    expect(await recorded(page)).toEqual([])
    expect(new URL(page.url()).search).toBe('')
  })

  test('a page arrived at without the parameter is never marked', async ({ context, page }) => {
    await installRecorder(context)
    await page.goto(`${CHAPTER}#${SECTION}`)
    await page.waitForTimeout(GESTURE_MS * 2)
    expect(await recorded(page)).toEqual([])
  })
})

test.describe('alongside the two scrubbers already there', () => {
  test('a newsletter parameter still opens its dialog, and both are scrubbed', async ({
    context,
    page,
  }) => {
    await installRecorder(context)
    // `newsletter_confirmed=invalid` is one of the worker's redirect markers
    // (`components/newsletter/NewsletterLanding.tsx`); it opens a dialog and needs no
    // token, which makes it the one that can be arrived at in a test.
    await page.goto(
      `${CHAPTER}?newsletter_confirmed=invalid&${PARAM}=${TERM_FQN}#${SECTION}`,
    )

    // NewsletterLanding acted…
    await expect(page.getByRole('heading', { name: 'Megerősítés', exact: true })).toBeVisible()
    // …and so did this phase, on the same load. The walk is what lets every mark
    // play; see `scrollPastEveryMark`.
    await scrollPastEveryMark(page)
    const marks = await completedMarks(page, MARKS)
    expect(marks.map((mark) => mark.name)).toEqual(Array(MARKS).fill(TERM_FQN))
    // Neither scrubber clobbered the other's parameter, and neither is left behind.
    expect(new URL(page.url()).search).toBe('')
    expect(new URL(page.url()).hash).toBe(`#${SECTION}`)
  })

  test('a ga_debug parameter still takes effect, and both are scrubbed', async ({
    context,
    page,
  }) => {
    await installRecorder(context)
    // `ga_debug=exclude` is read by ConsentGate before the consent decision and
    // recorded in a cookie (`lib/consent/storage.ts`), which is what makes "it still
    // took effect" checkable without a tag being loaded.
    await page.goto(`${CHAPTER}?ga_debug=exclude&${PARAM}=${TERM_FQN}#${SECTION}`)

    await scrollPastEveryMark(page)
    const marks = await completedMarks(page, MARKS)
    expect(marks.map((mark) => mark.name)).toEqual(Array(MARKS).fill(TERM_FQN))

    const cookies = await context.cookies()
    expect(cookies.find((cookie) => cookie.name === 'yp_ga_exclude')?.value).toBe('1')
    expect(new URL(page.url()).search).toBe('')
    expect(new URL(page.url()).hash).toBe(`#${SECTION}`)
  })

  test('all three at once', async ({ context, page }) => {
    await installRecorder(context)
    await page.goto(
      `${CHAPTER}?ga_debug=exclude&newsletter_confirmed=invalid&${PARAM}=${TERM_FQN}#${SECTION}`,
    )

    await expect(page.getByRole('heading', { name: 'Megerősítés', exact: true })).toBeVisible()
    await scrollPastEveryMark(page)
    await completedMarks(page, MARKS)
    const cookies = await context.cookies()
    expect(cookies.find((cookie) => cookie.name === 'yp_ga_exclude')?.value).toBe('1')
    expect(new URL(page.url()).search).toBe('')
  })
})

test.describe('a mark plays when the reader can see it, not before', () => {
  /**
   * The property this describe block exists for, and the one thing a test can say
   * about it that a reading of the component cannot: the marks whose targets are
   * off-screen when the page lands are **not drawn at all**, and are drawn when the
   * reader reaches them.
   *
   * Every number here is derived on the page rather than written down, because how
   * many of the nine fit on one screen is a fact about a chapter's typography at one
   * viewport size and would be a hostage to either changing. What is asserted is the
   * relation: played == visible, waiting == the rest, and waiting > 0 — the last of
   * which is what makes this section discriminating at all.
   */
  test('the ones off-screen wait, and play as they are scrolled in', async ({
    context,
    page,
  }) => {
    await installRecorder(context)
    await page.goto(`${CHAPTER}?${PARAM}=${TERM_FQN}#${SECTION}`)

    // The arrival's own gesture, and only it. Polled to the point where the count
    // stops growing rather than to a number: it is the marks that fit on the screen
    // the page came to rest on.
    await expect.poll(async () => (await recorded(page)).length).toBeGreaterThan(0)
    const references = await ownReferences(page)
    const visible = references.own.filter((reference) => reference.visible).length
    expect(references.own).toHaveLength(MARKS)
    // The premise: the section is longer than a screen, so some of what was marked is
    // below the fold. Without this the rest of the test would be vacuous.
    expect(visible).toBeGreaterThan(0)
    expect(visible).toBeLessThan(MARKS)

    // Exactly the visible ones have been drawn — and it stays that way: waited out
    // past the whole length of the gesture, so this is not a race with a box that was
    // about to start.
    await page.waitForTimeout(GESTURE_MS * 2)
    const played = await recorded(page)
    expect(played).toHaveLength(visible)
    // The boxes are all still there, the waiting ones included: the arrival is not
    // over until every mark has played, so nothing has been unmounted.
    await expect(page.locator(MARKER)).toHaveCount(MARKS)

    // The ones that played, played together and played in full: every first frame
    // within a frame or two of every other, which is what "the marks on this screen are
    // one gesture" means now that the arrival no longer starts all nine.
    const startedAt = played.map((mark) => mark.frames[0].at)
    expect(Math.max(...startedAt) - Math.min(...startedAt)).toBeLessThan(50)
    for (const mark of played) {
      expect(mark.frames.length).toBeGreaterThan(3)
      expect(mark.frames[mark.frames.length - 1].opacity).toBeLessThan(0.2)
    }

    // Now the reader walks the section, and the rest play as they arrive in front of
    // them. Each of the late ones was drawn at a scroll position the arrival never saw,
    // which is the trace that says it waited rather than merely finished late.
    await scrollPastEveryMark(page)
    const marks = await completedMarks(page, MARKS)
    const arrival = played[0].frames[0]
    const late = marks.slice(played.length)
    expect(late).toHaveLength(MARKS - visible)
    for (const mark of late) {
      // Later in time than the whole of the arrival's own gesture, and at a scroll
      // position the arrival never saw — the two traces of having waited.
      expect(mark.frames[0].at).toBeGreaterThan(arrival.at + GESTURE_MS)
      expect(mark.frames[0].scrollY).toBeGreaterThan(arrival.scrollY)
      // And the same gesture when it did come: wide first, tight last.
      expect(mark.frames[0].width - mark.frames[mark.frames.length - 1].width).toBeCloseTo(
        (OUTSET_WIDE - OUTSET_TIGHT) * 2,
        0,
      )
    }
  })

  test('every one of the nine closes, holds and fades the same way', async ({
    context,
    page,
  }) => {
    await installRecorder(context)
    await page.goto(`${CHAPTER}?${PARAM}=${TERM_FQN}#${SECTION}`)
    await scrollPastEveryMark(page)
    const marks = await completedMarks(page, MARKS)
    expect(marks).toHaveLength(MARKS)

    for (const mark of marks) {
      // Started wide and ended tight, monotonically — not "the first is bigger than
      // the last", which would pass for a box that jumped. The outset is read off the
      // box's own width against its final width, since which element a given box
      // framed is not something the box says.
      const widths = mark.frames.map((frame) => frame.width)
      const final = widths[widths.length - 1]
      expect(widths[0] - final).toBeCloseTo((OUTSET_WIDE - OUTSET_TIGHT) * 2, 0)
      for (let i = 1; i < widths.length; i += 1) {
        expect(widths[i]).toBeLessThanOrEqual(widths[i - 1] + 0.01)
      }

      // Held at full strength, then faded to nothing.
      const opacity = mark.frames.map((frame) => frame.opacity)
      expect(Math.max(...opacity)).toBe(1)
      expect(opacity[opacity.length - 1]).toBeLessThan(0.2)
      expect(opacity.filter((value) => value === 1).length).toBeGreaterThan(3)

      // A decoration and nothing else, at the layer `_variables.scss` gives it.
      for (const frame of mark.frames) {
        expect(frame.zIndex).toBe('690')
        expect(frame.pointerEvents).toBe('none')
      }
    }
  })

  test('under prefers-reduced-motion there is no shrink and there are still nine marks', async ({
    context,
    page,
  }) => {
    // `page.emulateMedia` rather than the `reducedMotion` fixture, which on Playwright
    // 1.62.1 leaves `matchMedia` false in the page — see `kb-arrival.test.ts`.
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await installRecorder(context)
    await page.goto(`${CHAPTER}?${PARAM}=${TERM_FQN}#${SECTION}`)
    expect(
      await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches),
    ).toBe(true)

    // Reduced motion removes the closing movement, not the visibility gate: a box
    // still waits for its target, and appearing at full size in front of the reader is
    // the point of both rules at once.
    await scrollPastEveryMark(page)
    const marks = await completedMarks(page, MARKS)
    // Still nine marks: §6.4 removes the movement, not the marker.
    expect(marks.map((mark) => mark.name)).toEqual(Array(MARKS).fill(TERM_FQN))

    const references = await ownReferences(page)
    expect(references.own).toHaveLength(MARKS)

    // And no shrink: every box is at its final size on its very first frame. The
    // discriminating trace against the animated case above, which starts 44px wider.
    for (const mark of marks) {
      const widths = mark.frames.map((frame) => frame.width)
      expect(widths[0]).toBeCloseTo(widths[widths.length - 1], 0)
      expect(mark.frames[0].opacity).toBe(1)
      expect(mark.frames[mark.frames.length - 1].opacity).toBeLessThan(0.2)
    }
  })
})

test.describe('coming back from a source', () => {
  test('the term the reader left is not marked again (§6.2)', async ({ context, page }) => {
    await installRecorder(context)

    /*
      Arrived at the term by its fragment, so the marker has already answered "here it
      is" once — a page that had never been marked would pass this by doing nothing at
      all, exactly as `kb-arrival.test.ts` starts its own §6.2 case from one recorded
      arrival.
    */
    await page.goto(`${THEOREM}#${TERM_ANCHOR}`)
    await settleConsent(page)
    await expect.poll(async () => (await recorded(page)).length).toBe(1)
    await expect(page.locator(MARKER)).toHaveCount(0)

    await chromeButton(page, MENU).click()
    await chromeButton(page, TERMS).click()
    await expect(page.locator(OVERLAY)).toBeVisible()
    // Already in view: the page arrived on this very term, so the reveal needs no
    // scroll to reach it and the click lands where the fragment left it.
    await page.locator(`.page-root [id="${TERM_ANCHOR}"]`).click()
    await expect(page.locator(PANEL)).toBeVisible()

    await page.locator(ROW).nth(2).click()
    await expect(page).toHaveURL(new RegExp(SECTION))
    await expect.poll(async () => (await recorded(page)).length).toBeGreaterThan(1)

    /*
      Back to the theorem, whose URL still names that term. The reader has been here and
      the term has been marked, so the return marks nothing: one recorded arrival on this
      page, the one they started from. Before `popstate` claimed the destination, this
      was two.
    */
    const beforeBack = (await recorded(page)).length
    await page.goBack()
    await expect(page).toHaveURL(new RegExp(`${THEOREM}#${TERM_ANCHOR}$`))
    await page.waitForTimeout(GESTURE_MS * 2)
    expect((await recorded(page)).length).toBe(beforeBack)
    await expect(page.locator(MARKER)).toHaveCount(0)
  })
})
