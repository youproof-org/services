import { expect, test, type Page } from '@playwright/test'

/**
 * Outgoing references in the body: pressed, modified-clicked, and inert
 * (sub-plan §7.1, D1).
 *
 * Almost everything §7.1 asks for is runtime behaviour that no stylesheet and no
 * reducer can be read for. "A plain click opens the panel instead of navigating"
 * is a statement about `preventDefault` on a real anchor with `target="_blank"`;
 * "a ctrl-click navigates" is a statement about NOT calling it, and D1 accepted the
 * cost of those two differing knowingly, so the two are checked separately and
 * against each other. "While a panel is open the references are inert" is a claim
 * about hit-testing a mark that the reveal has just lifted over the dim — the one
 * state in which the dim is not what makes it unpressable.
 *
 * Same conventions as `kb-select.test.ts`: settle the consent decision first, scope
 * every chrome locator to the stack's own class, match accessible names exactly, and
 * ask geometry questions with a real mouse click at a placed position rather than
 * with `locator.click()`, which would choose the position itself.
 *
 * Two habits from phases 15 and 16 are kept deliberately:
 *
 *   - **hit-test every mark**, not the first. A rule that reached one anchor would
 *     pass any weaker check, and the inert rule is the one this phase is about.
 *   - **mutation-check the rule.** The inert rule is deleted from the live
 *     stylesheet and the same assertion is required to flip, so the pass says the
 *     rule is what does it rather than that the layout happened to suit.
 */

/**
 * A remark dense with references, and the one that carries every case at once.
 *
 * Read off the built HTML: 22 reference marks in the article over 9 distinct hrefs,
 * of which 2 are external URLs — so 7 reference panels. It also displays the same
 * reference several times (one of them 6 times, another 4), which is what makes
 * "the mark the reader pressed is the one revealed" a question with a wrong answer
 * available.
 */
const ENTITY = '/hu/tudasbazis/tetelek/kis-fermat-tetel/megjegyzesek/kis-fermat-tetel-megjegyzes'
const MARK_COUNT = 22
const PANEL_COUNT = 7
const EXTERNAL_COUNT = 2

/** An entity target displayed 3 times, and the heading its panel is given. */
const ENTITY_TARGET = '/hu/tudasbazis/tetelek/euler-fermat-tetel'
const ENTITY_TARGET_TITLE = 'Euler-Fermat tétel'
/** A term target displayed 6 times — the repeated case, for "which one was pressed". */
const TERM_TARGET = '/hu/tudasbazis/definiciok/primtulajdonsagu-elem#fogalmak.primtulajdonsagu-elem'
/** An external URL: an ordinary outbound link, and never a panel (§7.1). */
const EXTERNAL_TARGET = 'https://oeis.org/A001567'

/**
 * A second remark, for the reference that wears the OTHER treatment.
 *
 * `ref-concept` is what an entity, a claim and a term reference look like;
 * `ref-link` is what the book hierarchy and an external URL look like
 * (`components/content/InlineText.tsx`). Only one knowledge-base node references a
 * section, and this is it — so it is the only page on which a `ref-link` opens a
 * panel, and the only place the class-independence of the interception can be shown.
 */
const HIERARCHY_ENTITY = '/hu/tudasbazis/definiciok/reszhalmaz/megjegyzesek/reszhalmaz-megjegyzes'
const SECTION_TARGET =
  '/hu/konyvek/alice-es-bob/fejezetek/alice-es-bob-felcsavarja-a-szamegyenest#szakaszok.maradekosztalygyuruk'
const SECTION_TARGET_TITLE = 'Maradékosztálygyűrűk'

const MENU = 'Menü'
const BACK = 'Vissza'

/** `next.config.ts` names every CSS-module class of ours `<file>_<local>`. */
const ARTICLE = '.kb-entity-page_entity'
const OVERLAY = '.overlay_overlay'
const PANEL = '#kb-panel'
/** Both reference treatments, which is what `EntityChrome`'s own selector matches. */
const MARKS = `${ARTICLE} :is(a.ref-concept, a.ref-link)`

function stack(page: Page) {
  return page.locator('.menu-stack_stack')
}

function chromeButton(page: Page, name: string) {
  return stack(page).getByRole('button', { name, exact: true })
}

function marks(page: Page) {
  return page.locator(MARKS)
}

/** See `kb-chrome.test.ts`: the banner covers the chrome until a decision is made. */
async function settleConsent(page: Page) {
  const reject = page.getByRole('button', { name: 'Elutasítom', exact: true })
  await reject.click()
  await expect(reject).toBeHidden()
}

/**
 * Open the page with the consent decision settled and the outside world stubbed out.
 *
 * The marks are real links with real destinations, and half the point of this file
 * is that some of them are followed — an external one on purpose (§7.1) and every
 * modified click by design (D1). Answering anything that is not the local server
 * with an empty page keeps those off the network while still letting the browser
 * open the tab and land on the URL, which is the whole of what is asserted. Aborting
 * instead would leave the popup on `chrome-error://chromewebdata/` (measured), where
 * "did it go to oeis.org?" can no longer be asked.
 */
async function openEntity(page: Page, url = ENTITY) {
  await page.context().route(
    (target) => target.hostname !== '127.0.0.1' && target.hostname !== 'localhost',
    (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '' }),
  )
  await page.goto(url)
  await settleConsent(page)
  await expect(chromeButton(page, MENU)).toBeVisible()
  if (url === ENTITY) await expect(marks(page)).toHaveCount(MARK_COUNT)
}

/** Every reference mark's href, in document order. */
function markHrefs(page: Page): Promise<string[]> {
  return marks(page).evaluateAll((found) =>
    found.map((mark) => mark.getAttribute('href') ?? ''),
  )
}

/** Which marks point at one target — a body displays a reference more than once. */
async function indexesOf(page: Page, href: string): Promise<number[]> {
  const hrefs = await markHrefs(page)
  return hrefs.flatMap((candidate, index) => (candidate === href ? [index] : []))
}

/**
 * Put one mark at a chosen fraction of the viewport and report where it ended up.
 *
 * The same placing `kb-select.test.ts` does for a candidate, and for the same
 * reason: §6.4's scroll exists for a selection that the panel would cover, so a test
 * about it has to be able to say where the mark was when it was pressed.
 * `getClientRects()[0]` rather than the bounding box, because an inline mark can wrap
 * across two lines and the box of a wrapped span includes the gutter between them.
 */
function placeMarkAt(page: Page, index: number, fraction: number) {
  return page.evaluate(
    ({ selector, at, nth }) =>
      new Promise<{ x: number; y: number; top: number; bottom: number }>((resolve) => {
        const mark = document.querySelectorAll<HTMLElement>(selector)[nth]
        const first = mark.getBoundingClientRect()
        window.scrollTo({
          top: window.scrollY + first.top - window.innerHeight * at,
          behavior: 'instant' as ScrollBehavior,
        })
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            const rect = mark.getClientRects()[0]
            resolve({
              x: rect.left + rect.width / 2,
              y: rect.top + rect.height / 2,
              top: rect.top,
              bottom: rect.bottom,
            })
          }),
        )
      }),
    { selector: MARKS, at: fraction, nth: index },
  )
}

/** Press it there, with a real mouse click — so the press is hit-tested too. */
async function pressMarkAt(page: Page, index: number, fraction: number) {
  const spot = await placeMarkAt(page, index, fraction)
  await page.mouse.click(spot.x, spot.y)
  return spot
}

/**
 * What a click at each mark's own centre would land on: `'self'` when the mark (or
 * something inside it) is what the reader would press, and the covering element's
 * class otherwise.
 *
 * Placed a quarter of the way down rather than centred, as `kb-select.test.ts`'s
 * level-2 hit test is: with a panel open, the middle of the viewport IS the panel's
 * top edge, so every answer would be "the panel" and the test would be about
 * nothing.
 */
function hitTestMarks(page: Page): Promise<string[]> {
  return page.evaluate(async (selector) => {
    const frame = () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      )
    const results: string[] = []
    for (const mark of Array.from(document.querySelectorAll<HTMLElement>(selector))) {
      const first = mark.getBoundingClientRect()
      window.scrollTo({
        top: window.scrollY + first.top - window.innerHeight * 0.25,
        behavior: 'instant' as ScrollBehavior,
      })
      await frame()
      const rect = mark.getClientRects()[0]
      const found = document.elementFromPoint(
        rect.left + rect.width / 2,
        rect.top + rect.height / 2,
      )
      results.push(
        found?.closest('a') === mark ? 'self' : (found?.getAttribute('class') ?? 'nothing'),
      )
    }
    return results
  }, MARKS)
}

/**
 * Every element inside the article raised out of the normal flow, by its class — the
 * census `kb-select.test.ts` uses, and the only form that can fail when something
 * unintended comes up with the selection.
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
 * Delete the rule that makes a body reference inert and report how many matched.
 *
 * The mutation check, in the form phase 15 and phase 16 established: every assertion
 * about inertness is a statement about a live hit-test, and a hit-test that came out
 * right for another reason would satisfy them all. One rule, two selectors — the two
 * reference treatments.
 */
function dropInertRule(page: Page): Promise<number> {
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
          rule.selectorText.includes('[data-kb-chrome]') &&
          rule.style.pointerEvents === 'none'
        ) {
          sheet.deleteRule(index)
          removed += 1
        }
      }
    }
    return removed
  })
}

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

/** The sticky header's lower edge: where the region the panel leaves free begins. */
function headerBottom(page: Page): Promise<number> {
  return page.evaluate(() => document.querySelector('header')!.getBoundingClientRect().bottom)
}

/** The wrapper's transform, which is what a reveal has to get out of the way of. */
function pageRootTransform(page: Page): Promise<string> {
  return page.evaluate(() => getComputedStyle(document.querySelector('.page-root')!).transform)
}

/** The selected mark's box in the viewport, by the attribute the chrome puts on it. */
function selectionBox(page: Page) {
  return page.evaluate(() => {
    const mark = document.querySelector('.page-root a[data-kb-selected]')
    if (!mark) throw new Error('no selected reference on the page')
    const rect = mark.getClientRects()[0]
    return { top: rect.top, bottom: rect.bottom }
  })
}

test.describe('a plain click opens the panel instead of navigating', () => {
  test('the panel is the reference, and the page has not moved on', async ({ page, context }) => {
    await openEntity(page)
    const url = page.url()

    const [index] = await indexesOf(page, ENTITY_TARGET)
    await pressMarkAt(page, index, 0.4)
    await expectPanelSettled(page)

    // Not navigated, and not opened elsewhere either: the mark carries
    // `target="_blank"`, so "did not navigate" has to mean no second tab as well.
    expect(page.url()).toBe(url)
    expect(context.pages()).toHaveLength(1)

    // Exactly one content is showing, and it is this reference's — addressed by the
    // href, which is the only handle the mark carries (D1: it stays a plain <a>).
    await expect(page.locator(`${PANEL} section:not([hidden])`)).toHaveCount(1)
    await expect(
      page.locator(
        `${PANEL} section:not([hidden])[data-kb-panel-kind="reference"][data-kb-panel-target="${ENTITY_TARGET}"]`,
      ),
    ).toHaveCount(1)
    // Identity first: the target's own name heads the panel (§7.1, §7.2).
    await expect(
      page.locator(PANEL).getByRole('heading', { name: ENTITY_TARGET_TITLE, exact: true }),
    ).toBeVisible()
    // …and the second, deliberate step out is offered inside it.
    await expect(
      page.locator(`${PANEL} section:not([hidden])`).getByRole('link', {
        name: 'Ugrás a hivatkozott lapra',
        exact: true,
      }),
    ).toBeVisible()

    // D2: the panel opened from the body puts the menu in its open state, with the
    // one Vissza button — the same state a menu item's panel produces.
    await expect(chromeButton(page, BACK)).toBeVisible()
    await expect(chromeButton(page, MENU)).toHaveCount(0)
    await expect(page.locator(OVERLAY)).toBeVisible()
  })

  test('the pressed mark is revealed, and nothing else in the article is', async ({ page }) => {
    await openEntity(page)
    expect(await lifted(page)).toEqual([])
    const transform = await pageRootTransform(page)
    expect(transform).not.toBe('none')

    const [index] = await indexesOf(page, ENTITY_TARGET)
    await pressMarkAt(page, index, 0.4)
    await expectPanelSettled(page)

    // One thing raised in the whole article, and it is a reference mark.
    expect(await lifted(page)).toEqual(['ref-concept'])
    await expect(page.locator(`${ARTICLE} a[data-kb-selected]`)).toHaveCount(1)
    await expect(page.locator(`body[data-kb-selected="${ENTITY_TARGET}"]`)).toHaveCount(1)
    // No selection MODE: nothing revealed a class of things for this to be one of
    // (§7.1), so the reveal is gated on the selection alone — and the wrapper's
    // transform still has to come off for it, exactly as in a mode.
    await expect(page.locator('body[data-kb-select]')).toHaveCount(0)
    expect(await pageRootTransform(page)).toBe('none')

    // …and one back step gives all of it up, transform included.
    await chromeButton(page, BACK).click()
    await expect(page.locator(PANEL)).toBeHidden()
    await expect(page.locator(OVERLAY)).toHaveCount(0)
    await expect(chromeButton(page, MENU)).toBeVisible()
    expect(await lifted(page)).toEqual([])
    await expect(page.locator('body[data-kb-selected]')).toHaveCount(0)
    expect(await pageRootTransform(page)).toBe(transform)
  })

  test('the mark that was pressed is the one revealed, not the first of its kind', async ({
    page,
  }) => {
    await openEntity(page)
    const repeated = await indexesOf(page, TERM_TARGET)
    // The case that makes this worth asking: one reference, six marks.
    expect(repeated.length).toBeGreaterThan(1)

    const last = repeated[repeated.length - 1]
    await pressMarkAt(page, last, 0.4)
    await expectPanelSettled(page)

    // A state names a reference by its href, and six marks share this one. The panel
    // is right for all six; the reveal has to be right for the pressed one.
    const selected = await marks(page).evaluateAll((found) =>
      found.map((mark) => mark.hasAttribute('data-kb-selected')),
    )
    expect(selected.flatMap((is, index) => (is ? [index] : []))).toEqual([last])
  })

  test('the mark is scrolled into the free upper half, panel over the rest', async ({ page }) => {
    await openEntity(page)
    const viewport = page.viewportSize()!

    const repeated = await indexesOf(page, TERM_TARGET)
    // Pressed in the half the sheet is about to cover, which is the case §6.4's
    // scroll exists for: leaving it there would hide the thing the panel is about.
    const pressed = await pressMarkAt(page, repeated[repeated.length - 1], 0.8)
    expect(pressed.top).toBeGreaterThan(viewport.height / 2)

    await expectPanelSettled(page)
    await expectScrollSettled(page)

    const box = await selectionBox(page)
    const top = await headerBottom(page)
    expect(await panelTop(page)).toBe(viewport.height / 2)
    expect(box.top).toBeGreaterThanOrEqual(top)
    expect(box.bottom).toBeLessThanOrEqual(viewport.height / 2)
    // "Comfortably inside it rather than flush against its bottom edge" (§6.4): the
    // same machinery as a picked term, so the same centring in the free region.
    const above = box.top - top
    const below = viewport.height / 2 - box.bottom
    expect(Math.abs(above - below)).toBeLessThanOrEqual(2)
  })
})

test.describe('a modified click navigates, as on any link (D1)', () => {
  test('Meta-click opens the target page in a new tab, and no panel', async ({
    page,
    context,
  }) => {
    // Meta, not Control: on macOS "open in new tab" is the command key, and a
    // Control-click is the platform's SECONDARY click — Chromium opens no tab for it
    // at all (measured: `context.waitForEvent('page')` times out). The code keys on
    // meta, ctrl, shift and alt alike; this is the one of them the platform under
    // test turns into a new tab.
    await openEntity(page)
    const [index] = await indexesOf(page, ENTITY_TARGET)

    const [popup] = await Promise.all([
      context.waitForEvent('page'),
      marks(page).nth(index).click({ modifiers: ['Meta'] }),
    ])

    // The target page, in a tab of its own — the reason D1 keeps the mark a link.
    await expect.poll(() => popup.url()).toContain(ENTITY_TARGET)
    expect(context.pages()).toHaveLength(2)

    // …and the page behind is untouched: no panel, no dim, no history entry.
    await expect(page.locator(PANEL)).toBeHidden()
    await expect(page.locator(OVERLAY)).toHaveCount(0)
    await expect(page.locator('body[data-kb-chrome]')).toHaveCount(0)
    await expect(chromeButton(page, MENU)).toBeVisible()
    await popup.close()
  })

  test('no modified click is intercepted, whichever modifier is held', async ({ page }) => {
    // The other half, and the one that is about this code rather than about the
    // platform: with any of the four modifiers held, the press is not taken. What the
    // browser then does with it — a new tab for Meta, a context menu for Control on
    // macOS, a new window for Shift — is the browser's business and not the page's.
    await openEntity(page)
    const [index] = await indexesOf(page, ENTITY_TARGET)

    for (const modifier of ['Control', 'Shift', 'Alt'] as const) {
      const spot = await placeMarkAt(page, index, 0.4)
      await page.keyboard.down(modifier)
      await page.mouse.click(spot.x, spot.y)
      await page.keyboard.up(modifier)

      // No panel and no dim: nothing about the page's state changed, which is the
      // whole of "not intercepted" from this side.
      await expect(page.locator(PANEL)).toBeHidden()
      await expect(page.locator(OVERLAY)).toHaveCount(0)
      await expect(page.locator('body[data-kb-chrome]')).toHaveCount(0)
      await expect(chromeButton(page, MENU)).toBeVisible()
    }
  })
})

test.describe('an external reference is an ordinary outbound link (§7.1)', () => {
  test('it navigates and opens no panel', async ({ page, context }) => {
    await openEntity(page)
    const [index] = await indexesOf(page, EXTERNAL_TARGET)

    // A plain click this time, and it is NOT intercepted: there is no panel for an
    // external URL, so there is nothing to show and nothing to prevent.
    const [popup] = await Promise.all([
      context.waitForEvent('page'),
      marks(page).nth(index).click(),
    ])
    await expect.poll(() => popup.url()).toContain('oeis.org/A001567')

    await expect(page.locator(PANEL)).toBeHidden()
    await expect(page.locator('body[data-kb-chrome]')).toHaveCount(0)
    await expect(chromeButton(page, MENU)).toBeVisible()
    await popup.close()
  })

  test('and the served HTML has no panel for it', async ({ page }) => {
    await openEntity(page)
    const hrefs = await markHrefs(page)
    const external = hrefs.filter((href) => /^https?:/.test(href))
    expect(external).toHaveLength(EXTERNAL_COUNT)

    const targets = await page
      .locator(`${PANEL} [data-kb-panel-kind="reference"]`)
      .evaluateAll((sections) => sections.map((s) => s.getAttribute('data-kb-panel-target')))
    for (const href of external) expect(targets).not.toContain(href)
  })
})

test.describe('a reference into the book hierarchy (§7.1)', () => {
  test('the section reference opens a panel with its title and a link, and no body', async ({
    page,
    context,
  }) => {
    await openEntity(page, HIERARCHY_ENTITY)
    const [index] = await indexesOf(page, SECTION_TARGET)
    // It wears `ref-link` rather than `ref-concept`, and it is intercepted all the
    // same: what decides is whether the page has a panel for the href, because a
    // class cannot tell a chapter reference from an external URL.
    expect(
      await marks(page).nth(index).evaluate((mark) => mark.className),
    ).toBe('ref-link')

    await pressMarkAt(page, index, 0.4)
    await expectPanelSettled(page)
    expect(context.pages()).toHaveLength(1)

    const section = page.locator(
      `${PANEL} section:not([hidden])[data-kb-panel-target="${SECTION_TARGET}"]`,
    )
    await expect(section).toHaveCount(1)
    await expect(
      page.locator(PANEL).getByRole('heading', { name: SECTION_TARGET_TITLE, exact: true }),
    ).toBeVisible()
    // "Title and a link — no body" (§7.1): the section's own prose is a section long,
    // so the panel is the name and the way there, and nothing else.
    const links = section.getByRole('link')
    await expect(links).toHaveCount(1)
    await expect(links).toHaveAttribute('href', SECTION_TARGET)
    // …and the mark is revealed, which is the same rule a `ref-concept` gets.
    expect(await lifted(page)).toEqual(['ref-link'])
  })
})

test.describe('while a panel is open the references are inert (§7.1)', () => {
  test('no mark can be pressed, the revealed one included', async ({ page }) => {
    await openEntity(page)
    // In the default state every mark is pressable — which is what makes the same
    // hit test after the press mean something.
    expect((await hitTestMarks(page)).filter((hit) => hit === 'self')).toHaveLength(MARK_COUNT)

    const [index] = await indexesOf(page, ENTITY_TARGET)
    await pressMarkAt(page, index, 0.4)
    await expectPanelSettled(page)

    // Not one of the 22, and for two different reasons: 21 are under the dim, and the
    // 22nd is over it and inert by the rule — which is the one this phase adds.
    const hits = await hitTestMarks(page)
    expect(hits.filter((hit) => hit === 'self')).toHaveLength(0)
    expect(hits.filter((hit) => hit === 'overlay_overlay')).toHaveLength(MARK_COUNT)
  })

  test('the revealed mark is inert because of that rule, and nothing else', async ({ page }) => {
    await openEntity(page)
    const [index] = await indexesOf(page, ENTITY_TARGET)
    await pressMarkAt(page, index, 0.4)
    await expectPanelSettled(page)
    expect((await hitTestMarks(page)).filter((hit) => hit === 'self')).toHaveLength(0)

    // Take the rule away and the revealed mark comes straight back within reach — so
    // the assertion above was about this rule, not about a stacking order that
    // happened to suit it. The other 21 stay under the dim, which is the other half
    // of §7.1's inertness and needs no rule (see app/globals.scss).
    expect(await dropInertRule(page)).toBe(1)
    const hits = await hitTestMarks(page)
    expect(hits.filter((hit) => hit === 'self')).toHaveLength(1)
    expect(hits[index]).toBe('self')
  })

  test('activating one anyway does nothing — it does not navigate', async ({ page, context }) => {
    await openEntity(page)
    const [index] = await indexesOf(page, ENTITY_TARGET)
    await pressMarkAt(page, index, 0.4)
    await expectPanelSettled(page)

    // A dispatched click, which is what a keyboard Enter on a focused mark comes
    // down to: `pointer-events` cannot stop it, so the component swallows it. Both
    // the revealed mark and one still under the dim.
    const other = (await indexesOf(page, TERM_TARGET))[0]
    for (const nth of [index, other]) {
      await page.evaluate(
        ({ selector, at }) => {
          const mark = document.querySelectorAll<HTMLElement>(selector)[at]
          mark.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
        },
        { selector: MARKS, at: nth },
      )
    }

    // Nowhere new, nothing opened, and the reference panel still showing exactly
    // what it was showing: an inert mark is not a second way to change the state.
    expect(context.pages()).toHaveLength(1)
    await expect(page.locator(`body[data-kb-chrome="reference"]`)).toHaveCount(1)
    await expect(page.locator(`body[data-kb-selected="${ENTITY_TARGET}"]`)).toHaveCount(1)
    await expect(page.locator(`${PANEL} section:not([hidden])`)).toHaveCount(1)
  })

  test('a real click on another mark is the dim, so it is one step back (D2)', async ({
    page,
    context,
  }) => {
    await openEntity(page)
    const [index] = await indexesOf(page, ENTITY_TARGET)
    await pressMarkAt(page, index, 0.4)
    await expectPanelSettled(page)

    // A mouse click where another reference is: it lands on the dim, because that is
    // what covers it, and a click on the dim is one back step whatever it was aimed
    // at (D2). What it must NOT be is a navigation or a second panel.
    const other = (await indexesOf(page, TERM_TARGET))[0]
    const spot = await placeMarkAt(page, other, 0.25)
    await page.mouse.click(spot.x, spot.y)

    expect(context.pages()).toHaveLength(1)
    await expect(page.locator(PANEL)).toBeHidden()
    await expect(page.locator(OVERLAY)).toHaveCount(0)
    await expect(chromeButton(page, MENU)).toBeVisible()
  })

  test('a mark is inert with the menu open too, before any panel', async ({ page, context }) => {
    await openEntity(page)
    await chromeButton(page, MENU).click()
    await expect(page.locator(OVERLAY)).toBeVisible()

    // §7.1 is about the default state, not about panels: with the menu up, the menu
    // owns the reader's next click.
    await expect(page.locator('body[data-kb-chrome="menu"]')).toHaveCount(1)
    expect((await hitTestMarks(page)).filter((hit) => hit === 'self')).toHaveLength(0)
    await page.evaluate(
      ({ selector }) => {
        const mark = document.querySelectorAll<HTMLElement>(selector)[0]
        mark.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
      },
      { selector: MARKS },
    )
    expect(context.pages()).toHaveLength(1)
    await expect(page.locator(PANEL)).toBeHidden()
  })
})

test.describe('the back step out of a reference panel (D2)', () => {
  test('Vissza, Escape and the browser Back each take one step', async ({ page }) => {
    await openEntity(page)
    const [index] = await indexesOf(page, ENTITY_TARGET)
    const url = page.url()

    for (const step of [
      async () => chromeButton(page, BACK).click(),
      async () => page.keyboard.press('Escape'),
      async () => page.goBack(),
    ]) {
      await pressMarkAt(page, index, 0.4)
      await expectPanelSettled(page)
      // Pressed from the default state, so the stack is one deep: one step out is
      // the default state, not an open menu (§7.1 — no mode to return to).
      await step()
      await expect(page.locator(PANEL)).toBeHidden()
      await expect(page.locator(OVERLAY)).toHaveCount(0)
      await expect(chromeButton(page, MENU)).toBeVisible()
      await expect(page.locator('body[data-kb-chrome]')).toHaveCount(0)
      // The address bar never carried the state, so a back step cannot change it.
      expect(page.url()).toBe(url)
    }
  })

  test('opening and closing a reference panel produces no console noise', async ({ page }) => {
    const noise: string[] = []
    page.on('console', (message) => {
      if (message.type() === 'error' || message.type() === 'warning') {
        noise.push(`${message.type()}: ${message.text()}`)
      }
    })
    page.on('pageerror', (error) => noise.push(`pageerror: ${error.message}`))

    await openEntity(page)
    for (const target of [ENTITY_TARGET, TERM_TARGET]) {
      const [index] = await indexesOf(page, target)
      await pressMarkAt(page, index, 0.4)
      await expectPanelSettled(page)
      await chromeButton(page, BACK).click()
      await expect(page.locator(PANEL)).toBeHidden()
    }

    expect(noise).toEqual([])
  })
})

test.describe('the reference panels without JavaScript', () => {
  test.use({ javaScriptEnabled: false })

  test('every reference panel is in the served HTML', async ({ page }) => {
    await page.goto(ENTITY)

    // §2.1: an outgoing reference is an edge of the knowledge graph, and what it
    // points at is served with the page rather than fetched when pressed.
    await expect(page.locator(`main ${PANEL}`)).toHaveCount(1)
    await expect(page.locator(`${PANEL} [data-kb-panel-kind="reference"]`)).toHaveCount(
      PANEL_COUNT,
    )

    // The count, against the node's own references: one panel per DISTINCT internal
    // target, which is what a panel is about. 22 marks over 9 hrefs here, two of them
    // external — so 7, and the sets have to match exactly rather than in size.
    const hrefs = await markHrefs(page)
    expect(hrefs).toHaveLength(MARK_COUNT)
    const internal = [...new Set(hrefs.filter((href) => !/^https?:/.test(href)))]
    expect(internal).toHaveLength(PANEL_COUNT)

    const targets = await page
      .locator(`${PANEL} [data-kb-panel-kind="reference"]`)
      .evaluateAll((sections) => sections.map((s) => s.getAttribute('data-kb-panel-target')))
    expect([...targets].sort()).toEqual([...internal].sort())

    // …and the contents are there, not just the sections: a heading per panel and
    // the link out of each one.
    await expect(
      page.locator(`${PANEL} h2[id^="kb-panel-title-reference-"]`),
    ).toHaveCount(PANEL_COUNT)
    await expect(
      page.locator(`${PANEL} [data-kb-panel-kind="reference"] a[href="${ENTITY_TARGET}"]`),
    ).toHaveCount(1)
  })
})
