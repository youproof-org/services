import { expect, test, type Page } from '@playwright/test'

/**
 * The two selection modes, level 1: pick a mode, see the candidates (sub-plan §6.3).
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
 * defines a term (measured: 0 of 190), and Állítások is ruled out for the type
 * rather than for the content — the identifiers sub-plan's D3 makes a claim inside
 * a proof a build error, so the menu states the rule instead of counting.
 */
const PROOF =
  '/hu/tudasbazis/tetelek/egesz-kitevos-hatvanyozas-azonossagai/bizonyitasok/egesz-kitevos-hatvanyozas-azonossagai-bizonyitas'

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
    expect(await coverOf(page, 'header')).toBe('overlay_overlay')
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
