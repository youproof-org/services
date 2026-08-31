import { expect, test, type Page } from '@playwright/test'
import { fixtures, incomingRows } from './support/fixtures'
import sharp from 'sharp'

/**
 * The two selection modes, both levels: pick a mode, see the candidates, pick one
 * (sub-plan §6.3).
 *
 * This file exists because almost nothing about a reveal can be read off the
 * stylesheet. "Fogalmak lifts every term out from under the dim and nothing else"
 * is a claim about a computed stacking order and about what a click would actually
 * land on, and both of those are decided by a live layout — the dim is a
 * body-level fixed layer, the terms are spans deep inside a wrapper that carries a
 * transform, and whether the one ends up over the other is exactly the question.
 * `test/kb-chrome.test.mjs` covers the state machine behind the modes; everything
 * here is what only a browser can answer.
 *
 * Two ways of asking it, on purpose:
 *
 *   - a **census**, over every element in the article — which ones were raised out
 *     of the normal flow at all. This is the "and nothing else" half, and it is the
 *     only form that can fail when something unintended comes up with the terms.
 *   - a **hit test** at each candidate's own centre, after scrolling it into view.
 *     This is the "revealed" half: painted above the dim AND reachable, which is
 *     what "selectable" means. Doing it for every candidate rather than the first
 *     is the point — a rule that matched one span would pass any weaker check.
 *
 * Level 2 adds a third question of the same kind and asks it the same way. The
 * narrowing — "the chosen one stays lit, all the others drop back under the dim" —
 * is the mechanism standing in for a highlight colour and a selected-state style,
 * so it is checked by hit-testing every candidate rather than by reading a class
 * off one; and where the selection ENDS UP is geometry the stylesheet does not
 * contain at all, because it is the product of a scroll, a sticky header and a
 * sheet that is still arriving. The mutation check below is what keeps the census
 * honest: the rule that does the dropping is deleted at runtime and the same
 * assertion is required to fail.
 *
 * Same conventions as `kb-panel.test.ts`: settle the consent decision first, scope
 * every chrome locator to the stack's own class, and match accessible names
 * exactly — the site header's hamburger is also "Menü", the consent opener is
 * "Süti-beállítások", and an accessible name matches as a substring.
 */

/**
 * The entity with the richest body available: 12 terms and 8 claims, so both modes
 * have something to reveal and the counts are far enough from 1 that a rule
 * matching only the first candidate cannot pass.
 *
 * The two numbers are `Object.keys(node.terms).length` and the count of `claim`
 * blocks in `node.body`, read off the built graph. They are exact rather than
 * approximate: `validateTermInsertions` fails the build unless every term is
 * inserted exactly once in its node's body, so there is one `<span class="term">`
 * per key and no duplicate ids, and a claim block renders one `<div>`.
 */
const ENTITY = '/hu/tudasbazis/definiciok/gyuru-test'
const TERM_COUNT = 12
const CLAIM_COUNT = 8

/**
 * A proof, for the two items that must NOT be there (§6.5): no proof in the content
 * defines a term, and Állítások is ruled out for the type rather than for the content
 * — the identifiers sub-plan's D3 makes a claim inside a proof a build error, so the
 * menu states the rule instead of counting.
 *
 * Taken from the graph rather than named: a deployed build gives no page to a proof
 * under an unpublished chapter, and this needs one that has a page here.
 */
const PROOF = fixtures.termlessProof.url

/**
 * The candidates level 2 is checked on, and the row counts their panels must show.
 *
 * Every number here is `graph.backlinks.get('definitions.gyuru-test')` rendered off
 * the graph, counted as ROWS: the lists are grouped chapter → section →
 * embedded entity, so each one carries the containers its sources sit in as well as
 * the sources. They are the assertion, not a sample of it — "the filtered list is the
 * unfiltered one narrowed" is only worth checking against the exact figure the index
 * holds.
 *
 * `SELECTED_TERM` is the busiest term on the busiest entity, so a filter that did
 * nothing would show the whole unfiltered list instead of 154 and a filter that
 * matched nothing would show 0. `BELOW_FOLD_TERM` is the last term in the body, 1911px down a
 * 2884px page: it is off-screen when the page opens and in the half the panel is
 * about to cover when it is pressed, which is the case §6.4's scroll exists for.
 */
const SELECTED_TERM = 'fogalmak.gyuru'
const SELECTED_TERM_ROWS = 154
const BELOW_FOLD_TERM = 'fogalmak.nullgyuru'
const SELECTED_CLAIM = 'allitasok.szorzas-disztributiv'
const SELECTED_CLAIM_ROWS = 33
/**
 * The unfiltered list this entity serves in THIS build. The two filtered figures above
 * are counted from `byTarget`, which the page-existence filter leaves alone at this
 * scale; `all` is what shrinks on a deployed build, and it is also the number the two
 * are compared against, so it comes from the graph.
 */
const UNFILTERED_ROWS = incomingRows(ENTITY)

const MENU = 'Menü'
const BACK = 'Vissza'
const TERMS = 'Fogalmak'
const CLAIMS = 'Állítások'
const INCOMING = 'Bejövő hivatkozások'
const CONTEXT = 'Kontextus'

/** `next.config.ts` names every CSS-module class of ours `<file>_<local>`. */
const ARTICLE = '.kb-entity-page_entity'
const TERM = '.term'
const CLAIM = '.claim-block_claim'
const OVERLAY = '.overlay_overlay'
const PANEL = '#kb-panel'

function stack(page: Page) {
  return page.locator('.menu-stack_stack')
}

function chromeButton(page: Page, name: string) {
  return stack(page).getByRole('button', { name, exact: true })
}

/** See `kb-chrome.test.ts`: the banner covers the chrome until a decision is made. */
async function settleConsent(page: Page) {
  const reject = page.getByRole('button', { name: 'Elutasítom', exact: true })
  await reject.click()
  await expect(reject).toBeHidden()
}

async function openEntity(page: Page, url = ENTITY) {
  await page.goto(url)
  await settleConsent(page)
  await expect(chromeButton(page, MENU)).toBeVisible()
}

/** Menü, then the mode's item — the two presses that put level 1 up. */
async function enterMode(page: Page, caption: string) {
  await chromeButton(page, MENU).click()
  await chromeButton(page, caption).click()
  await expect(page.locator(OVERLAY)).toBeVisible()
}

/**
 * Every element inside the article that was raised out of the normal flow, by the
 * class it carries.
 *
 * A computed `z-index` other than `auto` is the whole of what "lifted" means here:
 * the reveal has no other effect that could put something over the dim. Scoped to
 * the article rather than the page because the shell legitimately has raised layers
 * of its own (the sticky header at `$z-header`), and those are checked separately —
 * by the hit test, which is the question that actually matters about them.
 */
function lifted(page: Page): Promise<string[]> {
  return page.evaluate((article) => {
    const root = document.querySelector(article)
    if (!root) throw new Error(`no ${article} on the page`)
    return Array.from(root.querySelectorAll('*'))
      .filter((element) => getComputedStyle(element).zIndex !== 'auto')
      .map((element) => element.getAttribute('class') ?? element.tagName.toLowerCase())
  }, ARTICLE)
}

/**
 * Scroll each match into the middle of the viewport and report what a click at its
 * centre would hit: `'self'` when the element itself (or something inside it) is
 * what the reader would press, and the covering element's class otherwise.
 *
 * `getClientRects()[0]` rather than the bounding box: a term can wrap across two
 * lines, and the bounding box of a wrapped inline span includes the empty gutter
 * between the fragments, so its centre can be a point the span does not occupy.
 *
 * Two animation frames after each scroll. `:root` carries `scroll-behavior: smooth`,
 * so `behavior: 'instant'` is what stops the scroll from being animated, and the
 * frames are what let the compositor settle before a hit test is taken — the same
 * sampling `kb-panel.test.ts` uses, for the same reason.
 */
function hitTest(page: Page, selector: string, insideOnly = true): Promise<string[]> {
  return page.evaluate(
    async ({ scope, target, inside }) => {
      const frame = () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        )
      const results: string[] = []
      for (const element of Array.from(
        document.querySelectorAll<HTMLElement>(`${scope} ${target}`),
      )) {
        element.scrollIntoView({ block: 'center', behavior: 'instant' as ScrollBehavior })
        await frame()
        const rect = element.getClientRects()[0]
        const found = document.elementFromPoint(
          rect.left + rect.width / 2,
          rect.top + rect.height / 2,
        )
        const hit = inside ? found?.closest(target) === element : found === element
        results.push(hit ? 'self' : (found?.getAttribute('class') ?? 'nothing'))
      }
      return results
    },
    { scope: ARTICLE, target: selector, inside: insideOnly },
  )
}

/** What a click at the centre of one element would land on, without scrolling. */
function coverOf(page: Page, selector: string): Promise<string> {
  return page.evaluate((target) => {
    const element = document.querySelector(target)
    if (!element) throw new Error(`no ${target} on the page`)
    element.scrollIntoView({ block: 'center', behavior: 'instant' as ScrollBehavior })
    const rect = element.getBoundingClientRect()
    const found = document.elementFromPoint(
      rect.left + rect.width / 2,
      rect.top + rect.height / 2,
    )
    return found?.getAttribute('class') ?? 'nothing'
  }, selector)
}

/**
 * The lightest and darkest pixel of the first revealed term, with the term placed
 * either inside the sticky header's box or in the middle of the page.
 *
 * A screenshot clipped to the term's own first client rect — `getClientRects()[0]`
 * for `hitTest`'s reason: a term can wrap, and the bounding box of a wrapped inline
 * then includes the gutter between its fragments. `sharp` is the website's own
 * dependency (`scripts/gen-og-images.mjs` and the menu-icon generator use it), so
 * reading the pixels back needs nothing new.
 *
 * The scroll is relative: the term is moved to a chosen height, and the header's own
 * box is where "inside the header" is read from rather than a number written here —
 * the header is 112px at this viewport and taller when the breadcrumb wraps.
 */
async function termPixels(page: Page, where: 'header' | 'middle') {
  const rect = await page.evaluate((position) => {
    const term = document.querySelector<HTMLElement>('.page-root .term')!
    const header = document.querySelector('header')!.getBoundingClientRect()
    const target = position === 'header' ? header.top + header.height / 2 : window.innerHeight * 0.4
    window.scrollBy({ top: term.getClientRects()[0].top - target, behavior: 'instant' as ScrollBehavior })
    const box = term.getClientRects()[0]
    return { x: Math.round(box.left), y: Math.round(box.top), width: Math.round(box.width), height: Math.round(box.height) }
  }, where)

  // Two frames, as `hitTest` does: the compositor has to have the new scroll position
  // before the screenshot is taken.
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  )
  const clip = await page.screenshot({ clip: rect })
  const { data } = await sharp(clip).raw().toBuffer({ resolveWithObject: true })
  return { min: Math.min(...data), max: Math.max(...data) }
}

/** The wrapper's transform, which is what a reveal has to get out of the way of. */
function pageRootTransform(page: Page): Promise<string> {
  return page.evaluate(() => getComputedStyle(document.querySelector('.page-root')!).transform)
}

test.describe('Fogalmak — level 1', () => {
  test('reveals every term in the body, and nothing else', async ({ page }) => {
    await openEntity(page)

    // The body carries exactly one span per term key, which is what makes the
    // census below a count and not an estimate.
    await expect(page.locator(`${ARTICLE} ${TERM}`)).toHaveCount(TERM_COUNT)
    // Nothing is lifted before a mode is picked: the rules are gated on the mode,
    // not left standing on the page.
    expect(await lifted(page)).toEqual([])

    await enterMode(page, TERMS)

    // "No panel opens yet" — level 1 is purely "pick one" (§6.3).
    await expect(page.locator(PANEL)).toBeHidden()

    // The census: everything raised in the article is a term, and every term is.
    const raised = await lifted(page)
    expect(raised).toEqual(Array(TERM_COUNT).fill('term'))

    // …and each of them is genuinely on top of the dim, not merely numbered above
    // it. Every one, not the first: this is the assertion the phase is about.
    expect(await hitTest(page, TERM)).toEqual(Array(TERM_COUNT).fill('self'))
  })

  test('leaves the rest of the page under the dim', async ({ page }) => {
    await openEntity(page)
    await enterMode(page, TERMS)

    // The three things a reader might expect to be pressable and must not be: the
    // page's own heading, a claim (this mode is not about claims), and the sticky
    // site header — which sits at $z-header inside the same wrapper the terms were
    // lifted out of, so it is the natural thing to come up with them by accident.
    expect(await coverOf(page, `${ARTICLE} h1`)).toBe('overlay_overlay')
    expect(await coverOf(page, `${ARTICLE} ${CLAIM} .claim-block_index`)).toBe('overlay_overlay')
    // The header is raised above the reveal while a mode is up (see the test below),
    // so what keeps it unpressable is `pointer-events: none` rather than the dim being
    // over it — and a hit test is exactly the way to tell: the click still lands on
    // the dim.
    expect(await coverOf(page, 'header')).toBe('overlay_overlay')
  })

  test('a revealed term scrolled to the top goes UNDER the sticky header', async ({ page }) => {
    await openEntity(page)
    await enterMode(page, TERMS)

    /*
      Pixels, because nothing weaker can answer this. The question is what a reader
      sees where the header and a revealed term overlap, and that is the product of
      four things no computed style contains together: the term is lifted to
      $z-kb-reveal, the header to $z-kb-header, the dim is a body-level fixed layer at
      $z-kb-overlay, and `.page-root`'s transform is off for the duration. A z-index
      comparison would be the mechanism agreeing with itself.

      Two positions for the same term, which is what makes it discriminating rather
      than a picture of a grey box: inside the header's box it must be invisible, and
      in the middle of the page it must be lit. The second one fails if the reveal has
      quietly stopped working, and the first if the header ever loses this rule.
    */
    const underHeader = await termPixels(page, 'header')
    // Nothing lighter than the dim's own wash: the term's white ground (255) and its
    // glyphs are simply not on screen. The band is the wash over the header's white
    // and over its breadcrumb text, measured.
    expect(underHeader.max).toBeLessThan(200)

    const midPage = await termPixels(page, 'middle')
    // The same term, lit: its white ground and its black glyphs, both present.
    expect(midPage.max).toBe(255)
    expect(midPage.min).toBe(0)
  })

  test('leaves the page scrolling — a term can be anywhere in the body', async ({ page }) => {
    await openEntity(page)
    await enterMode(page, TERMS)

    // With the wheel rather than `scrollTo`, which would move a page that a scroll
    // lock had frozen for a real reader. §6.3: the dim alone locks nothing, and
    // this mode in particular must not — picking a term means finding it first.
    await page.mouse.move(400, 300)
    await page.mouse.wheel(0, 600)
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0)
  })

  test('Vissza returns to the open menu, and the page goes back to normal', async ({ page }) => {
    await openEntity(page)
    const transform = await pageRootTransform(page)
    expect(transform).not.toBe('none')

    await enterMode(page, TERMS)
    // A mode gives way in the corner exactly as a panel does: the one Vissza button.
    await expect(chromeButton(page, TERMS)).toHaveCount(0)
    await expect(chromeButton(page, BACK)).toBeVisible()
    await expect(page.locator('body[data-kb-select="terms"]')).toHaveCount(1)
    // The lift needs the wrapper to stop being its own stacking context; see the
    // note in `app/globals.scss`.
    expect(await pageRootTransform(page)).toBe('none')

    await chromeButton(page, BACK).click()

    // One step back is the OPEN MENU, not the default state: the dim stays and the
    // items are on offer again (§6.3).
    await expect(chromeButton(page, TERMS)).toBeVisible()
    await expect(page.locator(OVERLAY)).toBeVisible()
    // …and the reveal is gone with the mode, wrapper and all.
    expect(await lifted(page)).toEqual([])
    await expect(page.locator('body[data-kb-select]')).toHaveCount(0)
    expect(await pageRootTransform(page)).toBe(transform)

    // …and the second step is the default state.
    await chromeButton(page, BACK).click()
    await expect(page.locator(OVERLAY)).toHaveCount(0)
    await expect(chromeButton(page, MENU)).toBeVisible()
  })

  test('a click on the dim is the same step back', async ({ page }) => {
    await openEntity(page)
    await enterMode(page, TERMS)

    // D2: four ways to take one step. Worth asking again here because a mode is the
    // one state in which the dim is not a solid sheet — the terms are holes in it,
    // and a click that missed them still has to land on the dim.
    await page.locator(OVERLAY).click({ position: { x: 20, y: 20 } })
    await expect(chromeButton(page, TERMS)).toBeVisible()
    expect(await lifted(page)).toEqual([])
  })
})

test.describe('Állítások — level 1', () => {
  test('reveals every claim in the body, and nothing else', async ({ page }) => {
    await openEntity(page)
    await expect(page.locator(`${ARTICLE} ${CLAIM}`)).toHaveCount(CLAIM_COUNT)

    await enterMode(page, CLAIMS)
    await expect(page.locator(PANEL)).toBeHidden()

    const raised = await lifted(page)
    expect(raised).toEqual(Array(CLAIM_COUNT).fill('claim-block_claim'))

    // The claim's own index number is inside the claim and never inside a term, so
    // a hit there is the claim being reachable rather than a term underneath it.
    expect(await hitTest(page, `${CLAIM} .claim-block_index`, false)).toEqual(
      Array(CLAIM_COUNT).fill('self'),
    )
  })

  test('does not reveal the terms, and leaves the page scrolling', async ({ page }) => {
    await openEntity(page)
    await enterMode(page, CLAIMS)

    // A term outside a claim stays under the dim: the modes are exclusive, and this
    // one is about claims. (A term INSIDE a claim rides up with it, which is the
    // claim being revealed whole rather than a second rule firing.)
    const covered = await page.evaluate(
      ({ article, term, claim }) => {
        const outside = Array.from(
          document.querySelectorAll<HTMLElement>(`${article} ${term}`),
        ).filter((element) => !element.closest(claim))
        const element = outside[0]
        if (!element) throw new Error('no term outside a claim on this page')
        element.scrollIntoView({ block: 'center', behavior: 'instant' as ScrollBehavior })
        const rect = element.getClientRects()[0]
        const found = document.elementFromPoint(
          rect.left + rect.width / 2,
          rect.top + rect.height / 2,
        )
        return { outside: outside.length, hit: found?.getAttribute('class') ?? 'nothing' }
      },
      { article: ARTICLE, term: TERM, claim: CLAIM },
    )
    expect(covered.outside).toBeGreaterThan(0)
    expect(covered.hit).toBe('overlay_overlay')

    await page.mouse.move(400, 300)
    await page.mouse.wheel(0, 600)
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0)
  })

  test('Vissza returns to the open menu', async ({ page }) => {
    await openEntity(page)
    await enterMode(page, CLAIMS)
    await expect(page.locator('body[data-kb-select="claims"]')).toHaveCount(1)

    await chromeButton(page, BACK).click()
    await expect(chromeButton(page, CLAIMS)).toBeVisible()
    await expect(page.locator(OVERLAY)).toBeVisible()
    expect(await lifted(page)).toEqual([])
  })
})

test.describe('where the modes are absent (§6.5)', () => {
  test('a proof offers neither Fogalmak nor Állítások', async ({ page }) => {
    await openEntity(page, PROOF)
    await chromeButton(page, MENU).click()

    // Not "disabled" — absent. The menu is built from the entity, and this one has
    // no term to reveal and, by the type rule, never a claim.
    await expect(chromeButton(page, TERMS)).toHaveCount(0)
    await expect(chromeButton(page, CLAIMS)).toHaveCount(0)

    // The whole corner, so an item cannot go missing without the list changing too.
    const captions = await stack(page)
      .getByRole('button')
      .evaluateAll((buttons) => buttons.map((button) => button.textContent?.trim() ?? ''))
    expect(captions).toEqual([INCOMING, CONTEXT, BACK])
  })
})

test.describe('a selection mode logs nothing', () => {
  test('entering and leaving both modes produces no console noise', async ({ page }) => {
    const noise: string[] = []
    page.on('console', (message) => {
      if (message.type() === 'error' || message.type() === 'warning') {
        noise.push(`${message.type()}: ${message.text()}`)
      }
    })
    page.on('pageerror', (error) => noise.push(`pageerror: ${error.message}`))

    await openEntity(page)
    for (const mode of [TERMS, CLAIMS]) {
      await enterMode(page, mode)
      await chromeButton(page, BACK).click()
      await expect(chromeButton(page, mode)).toBeVisible()
      await chromeButton(page, BACK).click()
      await expect(page.locator(OVERLAY)).toHaveCount(0)
    }

    expect(noise).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// Level 2: pick one (§6.3, §6.4)
// ---------------------------------------------------------------------------

/** Where the panel's top edge is, closed panel included (see `kb-panel.test.ts`). */
function panelTop(page: Page): Promise<number> {
  return page.evaluate(() => document.querySelector('#kb-panel')!.getBoundingClientRect().top)
}

/** The sheet at rest over the bottom half — not merely visible, which it is mid-slide. */
async function expectPanelSettled(page: Page) {
  await expect.poll(() => panelTop(page)).toBe(page.viewportSize()!.height / 2)
}

/** The document scroll no longer moving, so a geometry reading is of a final position. */
async function expectScrollSettled(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          new Promise<boolean>((resolve) => {
            const before = window.scrollY
            requestAnimationFrame(() =>
              requestAnimationFrame(() => resolve(before === window.scrollY)),
            )
          }),
      ),
    )
    .toBe(true)
}

/** An element's box in the viewport, by id — ids carry dots, so `#id` is not a selector. */
function boxOf(page: Page, id: string) {
  return page.evaluate((target) => {
    const element = document.getElementById(target)
    if (!element) throw new Error(`no element with id '${target}'`)
    const rect = element.getBoundingClientRect()
    return { top: rect.top, bottom: rect.bottom, height: rect.height }
  }, id)
}

/** The sticky header's lower edge: where the region the panel leaves free begins. */
function headerBottom(page: Page): Promise<number> {
  return page.evaluate(() => document.querySelector('header')!.getBoundingClientRect().bottom)
}

/**
 * Put a candidate at a chosen fraction of the viewport, then press it there with a
 * real mouse click.
 *
 * The placing is the point: §6.4's scroll exists for a selection that would be
 * covered by the panel, so the test has to be able to say where the selection was
 * when it was pressed. `locator.click()` scrolls the element into view itself and
 * would decide that for us. The click is a mouse click at the element's own centre
 * rather than a dispatched event, so it is hit-tested — pressing a candidate is
 * also the proof that it was reachable.
 */
async function pressCandidateAt(page: Page, id: string, fraction: number) {
  const spot = await placeCandidateAt(page, id, fraction)
  await page.mouse.click(spot.x, spot.y)
  return spot
}

/**
 * The placing on its own, for the tests that press in-page: the candidate has to
 * start somewhere known, and after one selection it is already at its destination —
 * a second press from there would move nothing and every motion assertion would
 * pass by describing a page that never moved.
 */
async function placeCandidateAt(page: Page, id: string, fraction: number) {
  return page.evaluate(
    ({ target, at }) =>
      new Promise<{ x: number; y: number; top: number; bottom: number }>((resolve) => {
        const element = document.getElementById(target)!
        const first = element.getBoundingClientRect()
        window.scrollTo({
          top: window.scrollY + first.top - window.innerHeight * at,
          behavior: 'instant' as ScrollBehavior,
        })
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            const rect = element.getClientRects()[0]
            resolve({
              x: rect.left + rect.width / 2,
              y: rect.top + rect.height / 2,
              top: rect.top,
              bottom: rect.bottom,
            })
          }),
        )
      }),
    { target: id, at: fraction },
  )
}

/**
 * Press a candidate in-page and watch the page and the panel, frame by frame, until
 * the sheet has landed.
 *
 * In-page for the same reason as `kb-panel.test.ts`'s `pressAndSample`: the question
 * is what happens in the first few milliseconds, and a Playwright click followed by
 * a separate read puts a protocol round trip of unpredictable length in the middle.
 * Frame by frame because §6.4's "one gesture" is a claim about two DURATIONS — the
 * page has to be moving while the sheet is still on its way, and it has to be
 * finished by the time the sheet has landed — and a single sample can only answer
 * half of it.
 */
interface Gesture {
  /** Where the page was when the candidate was pressed. */
  before: number
  /** Four frames in: early enough that a 280ms movement is nowhere near done. */
  early: { scrollY: number; panelTop: number }
  /** The frame the sheet reached its resting place on, and the scroll then. */
  arrival: { scrollY: number; frame: number }
  /** Where the page came to rest. */
  final: number
}

function pressAndTraceGesture(page: Page, id: string): Promise<Gesture> {
  return page.evaluate(
    (target) =>
      new Promise<Gesture>((resolve) => {
        const element = document.getElementById(target)! as HTMLElement
        const panel = document.getElementById('kb-panel')!
        const half = window.innerHeight / 2
        const before = window.scrollY
        let early: Gesture['early'] | null = null
        let arrival: Gesture['arrival'] | null = null
        let frame = 0

        element.click()
        const tick = () => {
          frame += 1
          const panelTop = panel.getBoundingClientRect().top
          if (frame === 4) early = { scrollY: window.scrollY, panelTop }
          if (arrival === null && panelTop <= half) {
            arrival = { scrollY: window.scrollY, frame }
          }
          // A few frames past the landing, so `final` is a settled position and not
          // the same reading as `arrival` by construction.
          if ((arrival !== null && frame > arrival.frame + 10) || frame > 300) {
            resolve({ before, early: early!, arrival: arrival!, final: window.scrollY })
            return
          }
          requestAnimationFrame(tick)
        }
        requestAnimationFrame(tick)
      }),
    id,
  )
}

/**
 * Report what a click at each candidate's centre would hit, with the candidate
 * placed in the region the panel leaves free.
 *
 * `hitTest` above scrolls to `block: 'center'`, which at level 2 is the panel's own
 * top edge — every answer would be "the panel" and the test would be about nothing.
 * A quarter of the way down is inside the free half whatever the candidate's height,
 * so what covers it there is the dim or nothing.
 */
function hitTestInFreeHalf(page: Page, selector: string, insideOnly = true): Promise<string[]> {
  return page.evaluate(
    async ({ scope, target, inside }) => {
      const frame = () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        )
      const results: string[] = []
      for (const element of Array.from(
        document.querySelectorAll<HTMLElement>(`${scope} ${target}`),
      )) {
        const first = element.getBoundingClientRect()
        window.scrollTo({
          top: window.scrollY + first.top - window.innerHeight * 0.25,
          behavior: 'instant' as ScrollBehavior,
        })
        await frame()
        const rect = element.getClientRects()[0]
        const found = document.elementFromPoint(
          rect.left + rect.width / 2,
          rect.top + rect.height / 2,
        )
        const hit = inside ? found?.closest(target) === element : found === element
        results.push(hit ? 'self' : (found?.getAttribute('class') ?? 'nothing'))
      }
      return results
    },
    { scope: ARTICLE, target: selector, inside: insideOnly },
  )
}

/**
 * Delete the one stylesheet rule that drops the unselected candidates back under
 * the dim, and report how many rules matched.
 *
 * This is what keeps the census above from passing vacuously. Every assertion about
 * the narrowing is a statement about a live stacking order, and a stacking order
 * that happened to be right for another reason would satisfy all of them; removing
 * the rule and requiring the same assertion to flip is the only form that says the
 * rule is what does it. One rule, two selectors — a term's and a claim's.
 */
function dropNarrowingRule(page: Page): Promise<number> {
  return page.evaluate(() => {
    let removed = 0
    for (const sheet of Array.from(document.styleSheets)) {
      let rules: CSSRule[]
      try {
        rules = Array.from(sheet.cssRules)
      } catch {
        continue
      }
      for (let index = rules.length - 1; index >= 0; index -= 1) {
        const rule = rules[index]
        if (
          rule instanceof CSSStyleRule &&
          rule.selectorText.includes(':not([data-kb-selected])')
        ) {
          sheet.deleteRule(index)
          removed += 1
        }
      }
    }
    return removed
  })
}

/** One panel section's rows, by the two attributes `Panel.tsx` puts on it. */
function panelRows(page: Page, kind: string, target?: string) {
  const section = target
    ? `${PANEL} [data-kb-panel-kind="${kind}"][data-kb-panel-target="${target}"]`
    : `${PANEL} [data-kb-panel-kind="${kind}"]`
  return page.locator(`${section} .backlinks-panel_link`)
}

test.describe('Fogalmak — level 2', () => {
  test('lights the one that was picked and drops the other eleven', async ({ page }) => {
    await openEntity(page)
    await enterMode(page, TERMS)
    // Level 1 for comparison: all twelve are up, and all twelve are reachable.
    expect(await lifted(page)).toEqual(Array(TERM_COUNT).fill('term'))

    await pressCandidateAt(page, SELECTED_TERM, 0.4)
    await expectPanelSettled(page)

    // The census, and the whole of §6.3's narrowing: one thing raised, not twelve.
    expect(await lifted(page)).toEqual(['term'])
    await expect(page.locator(`${ARTICLE} ${TERM}[data-kb-selected]`)).toHaveCount(1)
    await expect(
      page.locator(`${ARTICLE} [id="${SELECTED_TERM}"][data-kb-selected]`),
    ).toHaveCount(1)
    await expect(page.locator(`body[data-kb-selected="${SELECTED_TERM}"]`)).toHaveCount(1)
    // …and the mode is still up: level 2 is a narrowing of Fogalmak, not a different
    // state of the page (§6.3).
    await expect(page.locator('body[data-kb-select="terms"]')).toHaveCount(1)

    // The hit test, every candidate: the selection is pressable and the other eleven
    // are back under the dim, which is what "dropped back" has to mean.
    const hits = await hitTestInFreeHalf(page, TERM)
    expect(hits.filter((hit) => hit === 'self')).toHaveLength(1)
    expect(hits.filter((hit) => hit === 'overlay_overlay')).toHaveLength(TERM_COUNT - 1)
  })

  test('the drop is that stylesheet rule, and nothing else', async ({ page }) => {
    await openEntity(page)
    await enterMode(page, TERMS)
    await pressCandidateAt(page, SELECTED_TERM, 0.4)
    await expectPanelSettled(page)
    expect(await lifted(page)).toEqual(['term'])

    // Take the rule away and the eleven come straight back up — so the assertion
    // above was about this rule rather than about a layout that suited it.
    expect(await dropNarrowingRule(page)).toBe(1)
    expect(await lifted(page)).toEqual(Array(TERM_COUNT).fill('term'))
  })

  test('the panel shows the references aimed at that term, not at the entity', async ({
    page,
  }) => {
    await openEntity(page)
    await enterMode(page, TERMS)
    await pressCandidateAt(page, SELECTED_TERM, 0.4)
    await expectPanelSettled(page)

    // Exactly one content is showing, and it is this term's.
    await expect(page.locator(`${PANEL} section:not([hidden])`)).toHaveCount(1)
    await expect(
      page.locator(
        `${PANEL} section:not([hidden])[data-kb-panel-target="${SELECTED_TERM}"]`,
      ),
    ).toHaveCount(1)
    // The term itself heads the panel (§6.3: the panel and the reveal name the same
    // thing), over the same question the unfiltered list asks (§7.2).
    await expect(page.locator(PANEL).getByRole('heading', { name: 'gyűrű', exact: true })).toBeVisible()
    await expect(
      page.locator(PANEL).getByRole('heading', { name: 'Hol hivatkoznak rá', exact: true }),
    ).toBeVisible()

    // `byTarget` for this term, and smaller than `all` — the filtered list is the
    // unfiltered one narrowed, and both are on this page to be compared (§7.2).
    await expect(panelRows(page, 'term', SELECTED_TERM)).toHaveCount(SELECTED_TERM_ROWS)
    await expect(panelRows(page, 'incoming')).toHaveCount(UNFILTERED_ROWS)
    expect(SELECTED_TERM_ROWS).toBeLessThan(UNFILTERED_ROWS)

    // Same rows as the unfiltered list, so the two are one list rather than two: the
    // ordering is by count descending WITHIN a level — the list is a tree, and the
    // narrowed one is grouped exactly as the unfiltered one is — and the row is still
    // the whole link.
    const rendered = await panelRows(page, 'term', SELECTED_TERM).evaluateAll((links) =>
      links.map((link) => ({
        depth: Number(link.getAttribute('data-backlink-depth')),
        count: Number(link.querySelector('[data-backlink-count]')!.getAttribute('data-backlink-count')),
      })),
    )
    for (const [i, row] of rendered.entries()) {
      const previous = rendered[i - 1]
      if (previous?.depth === row.depth) expect(previous.count).toBeGreaterThanOrEqual(row.count)
    }
    expect(rendered.filter((row) => row.depth === 0).length).toBeGreaterThan(0)
  })

  test('the selection lands comfortably in the free upper half, panel over the rest', async ({
    page,
  }) => {
    await openEntity(page)
    const viewport = page.viewportSize()!

    // The review case, and the reason the scroll exists: the term is not on the
    // screen at all when the page opens.
    expect((await boxOf(page, BELOW_FOLD_TERM)).top).toBeGreaterThan(viewport.height)

    await enterMode(page, TERMS)
    // …and when it is pressed it is in the half the panel is about to cover, so
    // "the page stays where it is" would leave the reader reading about something
    // they can no longer see.
    const pressed = await pressCandidateAt(page, BELOW_FOLD_TERM, 0.8)
    expect(pressed.top).toBeGreaterThan(viewport.height / 2)

    await expectPanelSettled(page)
    await expectScrollSettled(page)

    const box = await boxOf(page, BELOW_FOLD_TERM)
    const top = await headerBottom(page)
    // The panel has the bottom half, and the selection is wholly inside what is
    // left of the top one — below the sticky header, above the sheet.
    expect(await panelTop(page)).toBe(viewport.height / 2)
    expect(box.top).toBeGreaterThanOrEqual(top)
    expect(box.bottom).toBeLessThanOrEqual(viewport.height / 2)

    // "Comfortably inside it rather than flush against its bottom edge" (§6.4),
    // which is centred in the free region: the clearance below is the clearance
    // above, and it is a tenth of the viewport rather than a hairline.
    const above = box.top - top
    const below = viewport.height / 2 - box.bottom
    expect(Math.abs(above - below)).toBeLessThanOrEqual(2)
    expect(below).toBeGreaterThan(viewport.height * 0.1)
  })

  test('the scroll and the slide are one gesture', async ({ page }) => {
    await openEntity(page)
    const viewport = page.viewportSize()!
    await enterMode(page, TERMS)
    // In the half the panel is about to cover, which is the case the scroll exists
    // for, and pressed from there in-page so the trace starts on the same frame.
    const placed = await placeCandidateAt(page, BELOW_FOLD_TERM, 0.8)
    expect(placed.top).toBeGreaterThan(viewport.height / 2)

    const gesture = await pressAndTraceGesture(page, BELOW_FOLD_TERM)

    // It is a real journey, not a state that was already correct: the page ends
    // somewhere else entirely.
    expect(gesture.final).not.toBe(gesture.before)

    // Four frames in, the sheet is still on its way and the page is already moving.
    // Neither waits for the other, which is the first half of "one gesture" (§6.4).
    expect(gesture.early.panelTop).toBeGreaterThan(viewport.height / 2)
    expect(gesture.early.scrollY).not.toBe(gesture.before)
    // …and it is eased rather than jumped: four frames in it is on the way, not there.
    expect(gesture.early.scrollY).not.toBe(gesture.final)

    // The second half, and the one the wording is explicit about: the selection is
    // ALREADY IN PLACE by the time the panel has finished arriving (§6.4).
    expect(gesture.arrival.scrollY).toBe(gesture.final)
  })

  test('Vissza returns to level 1, and a second Vissza to the open menu', async ({ page }) => {
    await openEntity(page)
    await enterMode(page, TERMS)
    await pressCandidateAt(page, SELECTED_TERM, 0.4)
    await expectPanelSettled(page)

    await chromeButton(page, BACK).click()
    await expect(page.locator(PANEL)).toBeHidden()

    // Level 1, whole: no selection, every candidate revealed and selectable again,
    // and the dim still up (§6.3).
    await expect(page.locator('body[data-kb-selected]')).toHaveCount(0)
    await expect(page.locator(`${ARTICLE} ${TERM}[data-kb-selected]`)).toHaveCount(0)
    await expect(page.locator('body[data-kb-select="terms"]')).toHaveCount(1)
    await expect(page.locator(OVERLAY)).toBeVisible()
    expect(await lifted(page)).toEqual(Array(TERM_COUNT).fill('term'))
    expect(await hitTest(page, TERM)).toEqual(Array(TERM_COUNT).fill('self'))

    // …and the step after that is the open menu, not the default state.
    await chromeButton(page, BACK).click()
    await expect(chromeButton(page, TERMS)).toBeVisible()
    await expect(page.locator(OVERLAY)).toBeVisible()
    expect(await lifted(page)).toEqual([])
  })

  test('closing does not scroll the page back', async ({ page }) => {
    await openEntity(page)
    await enterMode(page, TERMS)
    await pressCandidateAt(page, BELOW_FOLD_TERM, 0.8)
    await expectPanelSettled(page)
    await expectScrollSettled(page)
    const placed = await page.evaluate(() => window.scrollY)

    await chromeButton(page, BACK).click()
    // All the way down and gone, so a scroll back would have had time to happen.
    await expect.poll(() => panelTop(page)).toBe(page.viewportSize()!.height)
    await expectScrollSettled(page)

    // §6.4: the reader has been reading in the new position, and yanking the page
    // out from under them on close would be disorienting.
    expect(await page.evaluate(() => window.scrollY)).toBe(placed)
  })
})

test.describe('Állítások — level 2', () => {
  test('lights the one claim and shows the references aimed at it', async ({ page }) => {
    await openEntity(page)
    await enterMode(page, CLAIMS)
    expect(await lifted(page)).toEqual(Array(CLAIM_COUNT).fill('claim-block_claim'))

    await pressCandidateAt(page, SELECTED_CLAIM, 0.4)
    await expectPanelSettled(page)

    expect(await lifted(page)).toEqual(['claim-block_claim'])
    await expect(page.locator(`body[data-kb-selected="${SELECTED_CLAIM}"]`)).toHaveCount(1)
    await expect(page.locator('body[data-kb-select="claims"]')).toHaveCount(1)

    // The same narrowing, on the other mode: `byTarget` for this claim, well under
    // the unfiltered list, in the same list markup (§7.2).
    await expect(page.locator(`${PANEL} section:not([hidden])`)).toHaveCount(1)
    await expect(panelRows(page, 'claim', SELECTED_CLAIM)).toHaveCount(SELECTED_CLAIM_ROWS)
    expect(SELECTED_CLAIM_ROWS).toBeLessThan(UNFILTERED_ROWS)
    // Numbered by its position in the body, which is the number the body prints in
    // front of it — this is the fifth claim of the eight.
    await expect(
      page.locator(PANEL).getByRole('heading', { name: '5. állítás', exact: true }),
    ).toBeVisible()

    // …and the other seven are back under the dim, every one of them.
    const hits = await hitTestInFreeHalf(page, `${CLAIM} .claim-block_index`, false)
    expect(hits.filter((hit) => hit === 'self')).toHaveLength(1)
    expect(hits.filter((hit) => hit === 'overlay_overlay')).toHaveLength(CLAIM_COUNT - 1)
  })

  test('Vissza returns to level 1 with every claim selectable again', async ({ page }) => {
    await openEntity(page)
    await enterMode(page, CLAIMS)
    await pressCandidateAt(page, SELECTED_CLAIM, 0.4)
    await expectPanelSettled(page)

    await chromeButton(page, BACK).click()
    await expect(page.locator(PANEL)).toBeHidden()
    await expect(page.locator('body[data-kb-selected]')).toHaveCount(0)
    expect(await lifted(page)).toEqual(Array(CLAIM_COUNT).fill('claim-block_claim'))
  })
})

test.describe('level 2 under prefers-reduced-motion', () => {
  test('the scroll jumps rather than eases', async ({ page }) => {
    // `page.emulateMedia` rather than the `reducedMotion` fixture, which on
    // Playwright 1.62.1 leaves `matchMedia` false in the page — see
    // `kb-panel.test.ts`.
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await openEntity(page)
    expect(
      await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches),
    ).toBe(true)

    await enterMode(page, TERMS)
    await placeCandidateAt(page, BELOW_FOLD_TERM, 0.8)

    // The discriminating trace, against the animated one above: the page has moved,
    // and on the very first frames it is ALREADY where it is going. Nothing is
    // removed — the selection still ends up in the free upper half (§6.4).
    const gesture = await pressAndTraceGesture(page, BELOW_FOLD_TERM)
    expect(gesture.final).not.toBe(gesture.before)
    expect(gesture.early.scrollY).toBe(gesture.final)
    expect(gesture.arrival.scrollY).toBe(gesture.final)

    const viewport = page.viewportSize()!
    const box = await boxOf(page, BELOW_FOLD_TERM)
    expect(box.top).toBeGreaterThanOrEqual(await headerBottom(page))
    expect(box.bottom).toBeLessThanOrEqual(viewport.height / 2)
  })
})

test.describe('picking one logs nothing', () => {
  test('entering and leaving level 2 in both modes produces no console noise', async ({ page }) => {
    const noise: string[] = []
    page.on('console', (message) => {
      if (message.type() === 'error' || message.type() === 'warning') {
        noise.push(`${message.type()}: ${message.text()}`)
      }
    })
    page.on('pageerror', (error) => noise.push(`pageerror: ${error.message}`))

    await openEntity(page)
    for (const [mode, candidate] of [
      [TERMS, SELECTED_TERM],
      [CLAIMS, SELECTED_CLAIM],
    ] as const) {
      await enterMode(page, mode)
      await pressCandidateAt(page, candidate, 0.4)
      await expectPanelSettled(page)
      await chromeButton(page, BACK).click()
      await expect(page.locator(PANEL)).toBeHidden()
      await chromeButton(page, BACK).click()
      await expect(chromeButton(page, mode)).toBeVisible()
      await chromeButton(page, BACK).click()
      await expect(page.locator(OVERLAY)).toHaveCount(0)
    }

    expect(noise).toEqual([])
  })
})

test.describe('the level-2 panels without JavaScript', () => {
  test.use({ javaScriptEnabled: false })

  test('every term panel and every claim panel is in the served HTML', async ({ page }) => {
    await page.goto(ENTITY)

    // §2.1 draws no line between a content the menu opens and one the body opens:
    // these are the per-term and per-claim narrowings of the inbound-reference list,
    // and nothing runs here, so this is what a crawler is served.
    await expect(page.locator(`main ${PANEL}`)).toHaveCount(1)
    // Shown inline, which is the rest of §2.1: see `noJsCss` in
    // components/kb/Panel.tsx and the census in `e2e/kb-sweep.test.ts`.
    await expect(page.locator(PANEL)).toBeVisible()

    // One per term and one per claim — the same two counts the body carries, which
    // is what "every one of them" has to mean.
    await expect(page.locator(`${PANEL} [data-kb-panel-kind="term"]`)).toHaveCount(TERM_COUNT)
    await expect(page.locator(`${PANEL} [data-kb-panel-kind="claim"]`)).toHaveCount(CLAIM_COUNT)
    await expect(page.locator(`${ARTICLE} ${TERM}`)).toHaveCount(TERM_COUNT)
    await expect(page.locator(`${ARTICLE} ${CLAIM}`)).toHaveCount(CLAIM_COUNT)

    // …and every one of them is addressed by the id of the element that selects it,
    // so the click that picks a candidate has a panel to find.
    //
    // The two level-2 kinds only. A pressed outgoing reference is a third panel the
    // body opens (§7.1), and it is addressed by the mark's href rather than by an id,
    // because a reference mark has none — `e2e/kb-reference.test.ts` counts those
    // against the article's marks. The guarantee here is unchanged: for a term and a
    // claim, the handle IS the element's id.
    const targets = await page
      .locator(
        `${PANEL} [data-kb-panel-kind="term"][data-kb-panel-target],` +
          ` ${PANEL} [data-kb-panel-kind="claim"][data-kb-panel-target]`,
      )
      .evaluateAll((sections) => sections.map((s) => s.getAttribute('data-kb-panel-target')))
    const ids = await page
      .locator(`${ARTICLE} ${TERM}, ${ARTICLE} ${CLAIM}`)
      .evaluateAll((elements) => elements.map((element) => element.id))
    expect([...targets].sort()).toEqual([...ids].sort())

    // The rows themselves, not just the sections: the filtered list is served whole.
    await expect(panelRows(page, 'term', SELECTED_TERM)).toHaveCount(SELECTED_TERM_ROWS)
    await expect(panelRows(page, 'claim', SELECTED_CLAIM)).toHaveCount(SELECTED_CLAIM_ROWS)
  })
})
