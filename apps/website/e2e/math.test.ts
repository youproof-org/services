import { expect, test, type Page } from '@playwright/test'
import { collectConsoleNoise } from './support/console-noise'

/**
 * Formulas served as LaTeX source and typeset in the browser by `MathEnhancer`.
 *
 * `scripts/check-math-source.mjs` proves the export ships no typeset formula. What
 * only a browser can show is the other half: that every formula gets typeset, and
 * that the reader stays where they are while it happens. A typeset formula is a
 * different size from its source, so every swap above the reader moves the page
 * under them unless the enhancer scrolls it back. Each arrival here has hundreds of
 * formulas above its target, still LaTeX when the page lands.
 */

const CHAPTER = '/hu/konyvek/alice-es-bob/fejezetek/alice-es-bob-gyuruje'
/** Most of the way down the chapter, with 524 formulas above it. */
const SECTION = 'szakaszok.gyuruk-es-testek'
/** The knowledge-base page whose context links to that section. */
const ENTITY = '/hu/tudasbazis/definiciok/gyuru-test'

/** See `kb-highlight.test.ts`, which this arrival is borrowed from. */
const HIGHLIGHT_CHAPTER = '/hu/konyvek/alice-es-bob/fejezetek/alice-bob-es-a-kinaiak'
const HIGHLIGHT_SECTION = 'szakaszok.a-kinai-maradektetel'
const HIGHLIGHT_FQN = 'theorems.egesz-szamok-maradekosztalyai.terms.residue-class-modulo-m'

const PENDING = '.tex-src'
const TYPESET = '.katex'
const STRIP_TEXT = 'A képletek megjelenítéséhez kapcsold be a JavaScriptet.'
const TYPESET_WAIT = { timeout: 30_000 }
/** Sub-pixel layout rounding, and nothing more. */
const HELD_PX = 2

interface Frame {
  at: number
  /** The tracked element's top on screen, or null before it exists or is chosen. */
  top: number | null
  pending: number
  pendingOnScreen: number
  pendingAbove: number
}

/**
 * One frame per `requestAnimationFrame`, from before the page's own scripts run. The
 * tracked element is `selector`'s first match, or whatever a test later sets as
 * `window.__tracked`.
 */
async function recordFrames(page: Page, selector: string | null) {
  await page.addInitScript(
    ([selector, pendingSelector]) => {
      const frames: Frame[] = []
      const global = window as unknown as { __frames: Frame[]; __tracked?: Element }
      global.__frames = frames
      const tick = (at: number) => {
        const tracked = global.__tracked ?? (selector ? document.querySelector(selector) : null)
        let pending = 0
        let pendingOnScreen = 0
        let pendingAbove = 0
        for (const formula of document.querySelectorAll(pendingSelector)) {
          pending++
          const { top, bottom } = formula.getBoundingClientRect()
          if (bottom <= 0) pendingAbove++
          else if (top < window.innerHeight) pendingOnScreen++
        }
        frames.push({
          at,
          top: tracked?.getBoundingClientRect().top ?? null,
          pending,
          pendingOnScreen,
          pendingAbove,
        })
        requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
    },
    [selector, PENDING] as const,
  )
}

/**
 * Chromium's scroll anchoring would hold the reader in place by itself and hide a
 * broken enhancer. Safari has none, so with it off this run stands in for Safari.
 */
async function withoutScrollAnchoring(page: Page) {
  await page.addInitScript(() => {
    document.addEventListener('DOMContentLoaded', () => {
      const style = document.createElement('style')
      style.textContent = '* { overflow-anchor: none !important; }'
      document.head.append(style)
    })
  })
}

const recorded = (page: Page) => page.evaluate(() => (window as unknown as { __frames: Frame[] }).__frames)

const pendingCount = (page: Page) => page.locator(PENDING).count()

/** React sets a `__reactFiber$…` key on every DOM node it hydrated. */
const hydrated = (page: Page) =>
  page.evaluate(() => Object.keys(document.querySelector('main')!).some((key) => key.startsWith('__reactFiber$')))

/**
 * The frames from the one where the tracked element first reached where it ends up.
 * Every one of them must still be there: a page that lands and is then pushed away by
 * a swap, or scrolled back to it late, fails.
 */
function fromLanding(frames: Frame[]) {
  const placed = frames.filter((frame) => frame.top !== null)
  const final = placed.at(-1)!.top!
  const landedAt = placed.findIndex((frame) => Math.abs(frame.top! - final) <= HELD_PX)
  return { final, landing: placed[landedAt], afterLanding: placed.slice(landedAt) }
}

function drift(frames: Frame[], final: number) {
  return Math.max(...frames.map((frame) => Math.abs(frame.top! - final)))
}

/** See `kb-chrome.test.ts`: the banner covers the chrome until a decision is made. */
async function settleConsent(page: Page) {
  const reject = page.getByRole('button', { name: 'Elutasítom', exact: true })
  await reject.click()
  await expect(reject).toBeHidden()
}

const sectionSelector = (id: string) => `[id="${id}"]`

test('every formula ships as LaTeX source and is typeset once the page loads', async ({ page, request }) => {
  const served = await (await request.get(CHAPTER)).text()
  const sources = served.match(/class="tex-src"/g)?.length ?? 0
  expect(sources).toBeGreaterThan(0)
  expect(served).not.toContain('class="katex"')

  const noise = collectConsoleNoise(page)
  await page.goto(CHAPTER)

  await expect.poll(() => pendingCount(page), TYPESET_WAIT).toBe(0)
  expect(await page.locator(TYPESET).count()).toBeGreaterThanOrEqual(sources)
  // With JavaScript on, a <noscript> is text, not markup.
  await expect(page.locator('.noscript-strip')).toHaveCount(0)
  expect(noise).toEqual([])
})

test('?math=source leaves the page as it was served', async ({ page, request }) => {
  const served = await (await request.get(CHAPTER)).text()
  const sources = served.match(/class="tex-src"/g)!.length

  await page.goto(`${CHAPTER}?math=source`)
  await expect.poll(() => hydrated(page)).toBe(true)
  // The enhancer would have started by now: it runs in the effect after hydration.
  await page.waitForTimeout(1000)

  expect(await pendingCount(page)).toBe(sources)
  expect(await page.locator(TYPESET).count()).toBe(0)
})

test.describe('the reader stays where they arrived while the formulas above them are typeset', () => {
  test.beforeEach(({ page }) => withoutScrollAnchoring(page))

  test('loading a chapter at a fragment', async ({ page }) => {
    await recordFrames(page, sectionSelector(SECTION))
    await page.goto(`${CHAPTER}#${SECTION}`)
    await expect.poll(() => pendingCount(page), TYPESET_WAIT).toBe(0)

    const { final, landing, afterLanding } = fromLanding(await recorded(page))
    // Below the sticky header, at the top of the screen.
    expect(final).toBeGreaterThan(0)
    expect(final).toBeLessThan(page.viewportSize()!.height / 3)
    // The swaps this is about were still to come when the page landed.
    expect(landing.pendingAbove).toBeGreaterThan(100)
    expect(drift(afterLanding, final)).toBeLessThanOrEqual(HELD_PX)
  })

  test('following a link to a fragment from another page', async ({ page }) => {
    await recordFrames(page, sectionSelector(SECTION))
    await page.goto(ENTITY)
    await settleConsent(page)

    const stack = page.locator('.menu-stack_stack')
    await stack.getByRole('button', { name: 'Menü', exact: true }).click()
    await stack.getByRole('button', { name: 'Kontextus', exact: true }).click()
    await page.locator(`#kb-panel a[href="${CHAPTER}#${SECTION}"]`).click()
    await page.waitForURL(`**${CHAPTER}#${SECTION}`)
    await expect.poll(() => pendingCount(page), TYPESET_WAIT).toBe(0)

    // The init script ran once, on the entity page: this is a client-side navigation.
    const frames = await recorded(page)
    expect(frames.some((frame) => frame.top === null)).toBe(true)
    const { final, landing, afterLanding } = fromLanding(frames)
    expect(final).toBeGreaterThan(0)
    expect(final).toBeLessThan(page.viewportSize()!.height / 3)
    expect(landing.pendingAbove).toBeGreaterThan(100)
    expect(drift(afterLanding, final)).toBeLessThanOrEqual(HELD_PX)
  })

  test('a highlight arrival, at the first reference it marks', async ({ page }) => {
    const reference = `[data-target-fqn="${HIGHLIGHT_FQN}"], [data-target-fqn^="${HIGHLIGHT_FQN}."]`
    const firstInSection = reference
      .split(', ')
      .map((part) => `${sectionSelector(HIGHLIGHT_SECTION)} ${part}`)
      .join(', ')
    await recordFrames(page, firstInSection)
    await page.goto(`${HIGHLIGHT_CHAPTER}?kb_highlight=${HIGHLIGHT_FQN}#${HIGHLIGHT_SECTION}`)
    await expect.poll(() => pendingCount(page), TYPESET_WAIT).toBe(0)

    const { final, landing, afterLanding } = fromLanding(await recorded(page))
    const height = page.viewportSize()!.height
    // Centred, as `kb-highlight.test.ts` asserts of the same arrival.
    expect(Math.abs(final - height / 2)).toBeLessThan(height / 4)
    expect(landing.pendingAbove).toBeGreaterThan(50)
    expect(drift(afterLanding, final)).toBeLessThanOrEqual(HELD_PX)
  })
})

test('after a fast scroll, the formulas on screen are typeset first and the reader stays put', async ({ page }) => {
  // Slow enough that the chapter is still mostly LaTeX when the scroll stops.
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
  await withoutScrollAnchoring(page)
  await recordFrames(page, null)
  await page.goto(CHAPTER)
  await expect.poll(() => hydrated(page)).toBe(true)

  // A fling: a jump a frame, each short of the margin the enhancer watches, so it
  // queues every formula it passes. All in the page, since a pause of the settle time
  // between two jumps would let the enhancer start mid-scroll.
  const stoppedAt = await page.evaluate(
    async ({ steps, stepPx, pendingSelector }) => {
      const nextFrame = () => new Promise(requestAnimationFrame)
      for (let step = 1; step <= steps; step++) {
        window.scrollTo({ top: step * stepPx, behavior: 'instant' as ScrollBehavior })
        await nextFrame()
      }
      await nextFrame()
      const line = document.elementFromPoint(window.innerWidth / 2, window.innerHeight * 0.3)!
      ;(window as unknown as { __tracked: Element }).__tracked = line.closest(pendingSelector)?.parentElement ?? line
      return performance.now()
    },
    { steps: 12, stepPx: 1500, pendingSelector: PENDING },
  )
  await expect
    .poll(async () => (await recorded(page)).some((frame) => frame.at > stoppedAt && frame.pendingOnScreen === 0), TYPESET_WAIT)
    .toBe(true)

  const after = (await recorded(page)).filter((frame) => frame.at > stoppedAt && frame.top !== null)
  const stop = after[0]
  // The scroll passed hundreds of formulas on its way down, still LaTeX.
  expect(stop.pendingAbove).toBeGreaterThan(100)
  // They wait for the ones on screen.
  expect(after.find((frame) => frame.pendingOnScreen === 0)!.pendingAbove).toBeGreaterThan(0)
  expect(drift(after, stop.top!)).toBeLessThanOrEqual(HELD_PX)
})

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false })

  test('the formulas stay LaTeX, and a strip says why without covering the footer', async ({ page }) => {
    await page.goto(CHAPTER)
    expect(await pendingCount(page)).toBeGreaterThan(0)
    const strip = page.locator('.noscript-strip')
    await expect(strip).toHaveText(STRIP_TEXT)

    const measure = (top: number) =>
      page.evaluate((top) => {
        window.scrollTo({ top, behavior: 'instant' as ScrollBehavior })
        return {
          strip: document.querySelector('.noscript-strip')!.getBoundingClientRect().toJSON() as DOMRect,
          footerBottom: document.querySelector('footer')!.getBoundingClientRect().bottom,
          height: window.innerHeight,
        }
      }, top)

    const midway = await measure(10_000)
    expect(midway.strip.bottom).toBeCloseTo(midway.height, 0)

    const end = await measure(1_000_000)
    expect(end.strip.bottom).toBeCloseTo(end.height, 0)
    expect(end.strip.top).toBeGreaterThanOrEqual(end.footerBottom - 0.5)
  })
})
