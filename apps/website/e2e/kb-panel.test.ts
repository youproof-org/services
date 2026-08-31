import { expect, test, type Page } from '@playwright/test'
import { collectConsoleNoise } from './support/console-noise'

/**
 * The entity page's panel: the geometry, the slide, the scroll lock, and the one
 * content that proves them (sub-plan §6.4).
 *
 * Almost none of this is reachable without a browser. `test/kb-chrome.test.mjs`
 * knows what a panel state *means*, and the build gate knows the contents are in
 * the served HTML — but whether the sheet actually covers the bottom half, whether
 * the page under it is really frozen, whether the panel itself still scrolls, and
 * whether `prefers-reduced-motion` removes the slide are all questions about
 * rendered CSS on a live layout. Reasoning about the stylesheet answers none of
 * them.
 *
 * Same conventions as `kb-chrome.test.ts`: settle the consent decision first,
 * scope the chrome's buttons to the stack, and match accessible names exactly.
 */

/** The same entity the chrome suite uses: the one with all four menu items. */
const ENTITY = '/hu/tudasbazis/definiciok/gyuru-test'

const MENU = 'Menü'
const BACK = 'Vissza'
const CONTEXT = 'Kontextus'

/** The panel's own handle — a literal id, not a CSS-module class (see `Panel.tsx`). */
const PANEL = '#kb-panel'
/** The scroller inside it; `next.config.ts` names module classes `<file>_<local>`. */
const PANEL_BODY = '#kb-panel .panel_body'
const PANEL_HEADER = '#kb-panel .panel_header'
const OVERLAY = '.overlay_overlay'

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

async function openEntity(page: Page) {
  await page.goto(ENTITY)
  await settleConsent(page)
  await expect(chromeButton(page, MENU)).toBeVisible()
}

/**
 * The panel's distance from the top of the viewport, read straight from the layout.
 *
 * `getBoundingClientRect` rather than Playwright's `boundingBox()` because this is
 * asked of a CLOSED panel too — `visibility: hidden` is exactly the state
 * Playwright calls "not visible", and the question here is where the box is, not
 * whether the reader can see it.
 */
function panelTop(page: Page): Promise<number> {
  return page.evaluate(
    (selector) => document.querySelector(selector)!.getBoundingClientRect().top,
    PANEL,
  )
}

/**
 * Wait for the slide to finish.
 *
 * `toBeVisible()` is not that: the panel becomes visible the instant it starts
 * moving, so a geometry assertion taken right after it measures the sheet in
 * mid-air. Every test that is not ABOUT the movement waits for it to stop first.
 */
async function expectSettled(page: Page) {
  await expect.poll(() => panelTop(page)).toBe(page.viewportSize()!.height / 2)
}

/** What the panel is doing two frames after a chrome button was pressed. */
interface SlideSample {
  /** Where the panel is — its resting place already, or somewhere on the way. */
  top: number
  /** The CSS transitions actually running on it, by property. */
  running: string[]
}

/**
 * Press a chrome button and sample the panel on the second frame afterwards.
 *
 * The press happens IN the page rather than through `locator.click()`, and this is
 * the one place in the suite that does so. The question is what the panel does in
 * the first few milliseconds, and a Playwright click plus a separate read puts a
 * protocol round trip of unpredictable length in between — enough, measured, for a
 * 280ms slide to be over about a third of the time. Two animation frames is a
 * fixed, small distance into the movement instead.
 */
async function pressAndSample(page: Page, caption: string): Promise<SlideSample> {
  return page.evaluate((label) => {
    const button = Array.from(document.querySelectorAll<HTMLButtonElement>('.menu-stack_item'))
      .find((candidate) => candidate.textContent?.trim() === label)
    if (!button) throw new Error(`no chrome button captioned '${label}'`)
    button.click()
    return new Promise<SlideSample>((resolve) => {
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          const panel = document.getElementById('kb-panel')!
          resolve({
            top: panel.getBoundingClientRect().top,
            running: panel
              .getAnimations()
              .map((animation) => String((animation as { transitionProperty?: string }).transitionProperty ?? '')),
          })
        }),
      )
    })
  }, caption)
}

/** Menü → Kontextus, the two presses that put the panel up, and the slide done. */
async function openContextPanel(page: Page) {
  await chromeButton(page, MENU).click()
  await chromeButton(page, CONTEXT).click()
  await expectSettled(page)
}

test.describe('the Kontextus panel', () => {
  test('opens over the bottom half of the screen, above the dim', async ({ page }) => {
    await openEntity(page)

    const panel = page.locator(PANEL)
    // Present from the first byte and out of the way until asked for.
    await expect(panel).toHaveCount(1)
    await expect(panel).toBeHidden()

    await openContextPanel(page)
    await expect(panel).toBeVisible()

    const viewport = page.viewportSize()!

    const box = (await panel.boundingBox())!
    // The bottom half, and all of it: §6.4 keeps the entity's body visible in the
    // top half so the reader never loses the thing the panel is about.
    expect(box.width).toBe(viewport.width)
    expect(Math.round(box.y)).toBe(Math.round(viewport.height / 2))
    expect(Math.round(box.y + box.height)).toBe(viewport.height)

    // Above the overlay, checked on the rendered result rather than on the
    // z-index scale: whatever is painted at the panel's centre belongs to it.
    const topmost = await page.evaluate(
      ([x, y]) => {
        const element = document.elementFromPoint(x, y)
        return element ? (element.closest('#kb-panel') ? 'panel' : element.className) : 'nothing'
      },
      [viewport.width / 2, viewport.height * 0.75] as const,
    )
    expect(topmost).toBe('panel')
  })

  test('shows the embedding as a numbered chapter and the section nested under it', async ({ page }) => {
    await openEntity(page)
    await openContextPanel(page)

    await expect(page.locator(PANEL).getByRole('heading', { name: 'Kontextus', exact: true })).toBeVisible()

    // Two levels, in that order, on an entity whose embedding is known content, each
    // named the way a backlink row names the same place: its number, then its title.
    const links = page.locator(`${PANEL} .panel_contextLevel a`)
    await expect(links).toHaveCount(2)
    await expect(links.nth(0)).toHaveAttribute(
      'href',
      '/hu/konyvek/alice-es-bob/fejezetek/alice-es-bob-gyuruje',
    )
    await expect(links.nth(0)).toHaveText(/^14\. /)
    await expect(links.nth(1)).toHaveAttribute(
      'href',
      '/hu/konyvek/alice-es-bob/fejezetek/alice-es-bob-gyuruje#szakaszok.gyuruk-es-testek',
    )
    await expect(links.nth(1)).toHaveText(/^14\.6\. /)

    // …and nested, not merely listed: the section's row is inside the chapter's and
    // steps right of it, which is what says which contains which (§7.2's tree).
    await expect(
      page.locator(`${PANEL} .panel_contextLevel .panel_contextNested .panel_contextLink`),
    ).toHaveCount(1)
    const [chapterBox, sectionBox] = await links.evaluateAll((nodes) =>
      nodes.map((node) => node.getBoundingClientRect().left),
    )
    expect(sectionBox).toBeGreaterThan(chapterBox)
  })

  test('the menu items give way to the panel, and Vissza brings them back', async ({ page }) => {
    await openEntity(page)
    await chromeButton(page, MENU).click()
    await expect(chromeButton(page, CONTEXT)).toBeVisible()

    await chromeButton(page, CONTEXT).click()
    await expect(page.locator(PANEL)).toBeVisible()
    // §6.4: a panel never opens a nested panel, so the items are not on offer over
    // it — the corner is the one Vissza button.
    await expect(chromeButton(page, CONTEXT)).toHaveCount(0)
    await expect(chromeButton(page, BACK)).toBeVisible()

    // One step back is the open menu again, not the default state: the dim stays.
    await chromeButton(page, BACK).click()
    await expect(page.locator(PANEL)).toBeHidden()
    await expect(page.locator(OVERLAY)).toBeVisible()
    await expect(chromeButton(page, CONTEXT)).toBeVisible()

    // …and the second step is the default state.
    await chromeButton(page, BACK).click()
    await expect(page.locator(OVERLAY)).toHaveCount(0)
    await expect(chromeButton(page, MENU)).toBeVisible()
  })

  test('scroll-locks the page while open and unlocks it on Vissza', async ({ page }) => {
    await openEntity(page)
    await openContextPanel(page)

    // Over the uncovered top half, and with the wheel rather than `scrollTo`,
    // which would move a page that `overflow: hidden` had frozen for a real reader.
    await page.mouse.move(400, 200)
    await page.mouse.wheel(0, 600)
    // Poll for a while so a lock that merely lags would still fail here.
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0)

    await chromeButton(page, BACK).click()
    await expect(page.locator(PANEL)).toBeHidden()

    await page.mouse.wheel(0, 600)
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0)
  })

  test('scrolls internally with its header pinned, and the page stays put', async ({ page }) => {
    await openEntity(page)
    await openContextPanel(page)

    // Kontextus is two rows and fits. The list that does NOT fit is phase 14's —
    // measured at 222 sources for this very entity, against a median of 2 — so the
    // overflow is given something to overflow with rather than left untested until
    // the content that needs it arrives.
    await page.evaluate((selector) => {
      const filler = document.createElement('div')
      filler.style.height = '2000px'
      document.querySelector(selector)!.append(filler)
    }, PANEL_BODY)

    const headerTop = (await page.locator(PANEL_HEADER).boundingBox())!.y

    await page.mouse.move(400, 600)
    await page.mouse.wheel(0, 500)

    await expect.poll(() => page.locator(PANEL_BODY).evaluate((el) => el.scrollTop)).toBeGreaterThan(0)
    // The wheel moved the panel, not the document (§6.4).
    expect(await page.evaluate(() => window.scrollY)).toBe(0)
    // …and the header did not travel with the list.
    expect((await page.locator(PANEL_HEADER).boundingBox())!.y).toBe(headerTop)
  })

  test('slides in from the bottom, and back down again', async ({ page }) => {
    await openEntity(page)
    const viewport = page.viewportSize()!
    await chromeButton(page, MENU).click()

    // Two frames in, the panel is on its way rather than arrived — and it is a
    // transition of the transform doing it, not a jump.
    const opening = await pressAndSample(page, CONTEXT)
    expect(opening.running).toContain('transform')
    expect(opening.top).toBeGreaterThan(viewport.height / 2)
    await expectSettled(page)

    // §6.4: it slides back DOWN off-screen on close, rather than simply going away.
    const closing = await pressAndSample(page, BACK)
    expect(closing.running).toContain('transform')
    expect(closing.top).toBeLessThan(viewport.height)
    await expect.poll(() => panelTop(page)).toBe(viewport.height)
  })

  test('a link inside the panel navigates, and leaves the page scrollable', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))

    await openEntity(page)
    await openContextPanel(page)

    // §6.4: links in the panel are ordinary links. This is also the one gesture that
    // unmounts the panel while its nodes are living under <body> — if the adoption
    // did not put them back first, React's own removal would throw here.
    await page.locator(`${PANEL} .panel_contextLevel a`).first().click()
    await expect(page).toHaveURL(/\/hu\/konyvek\/alice-es-bob\/fejezetek\/alice-es-bob-gyuruje$/)

    expect(errors, 'navigating away from an open panel threw').toEqual([])

    // The lock left with the panel: the chapter page is not frozen.
    await page.mouse.move(400, 300)
    await page.mouse.wheel(0, 600)
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0)
  })

  test('opening and closing the panel logs no error or warning', async ({ page }) => {
    const noise = collectConsoleNoise(page)

    await openEntity(page)
    await openContextPanel(page)
    await chromeButton(page, BACK).click()
    await expect(page.locator(PANEL)).toBeHidden()

    expect(noise).toEqual([])
  })
})

test.describe('the panel under prefers-reduced-motion', () => {
  test('appears and disappears without the slide', async ({ page }) => {
    // `page.emulateMedia` rather than the `reducedMotion` fixture: on Playwright
    // 1.62.1 a `test.use({ reducedMotion: 'reduce' })` in this describe leaves
    // `matchMedia('(prefers-reduced-motion: reduce)')` false in the page, so the
    // test would have passed by never enabling the thing it is about.
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await openEntity(page)
    const viewport = page.viewportSize()!
    await chromeButton(page, MENU).click()

    // The same sample the slide test takes, and the discriminating one: nothing is
    // animating, and the panel is at its resting place on the very frame it opens.
    const opening = await pressAndSample(page, CONTEXT)
    expect(opening.running).toEqual([])
    expect(opening.top).toBe(viewport.height / 2)
    await expect(page.locator(PANEL)).toBeVisible()
    await expect(page.locator(PANEL)).toHaveCSS('transition-duration', '0s')

    // …and it disappears the same way. Nothing else about the panel changes:
    // reduced motion removes the movement, not the panel (§6.4).
    const closing = await pressAndSample(page, BACK)
    expect(closing.running).toEqual([])
    expect(closing.top).toBe(viewport.height)
    await expect(page.locator(PANEL)).toBeHidden()
    await expect(page.locator(`${PANEL} .panel_contextLevel a`)).toHaveCount(2)
  })
})

test.describe('the panel without JavaScript', () => {
  test.use({ javaScriptEnabled: false })

  test('is served with its contents, inside the page and shown inline', async ({ page }) => {
    await page.goto(ENTITY)

    // §2.1/D6: the embedding is an edge of the knowledge graph, so it is in the HTML
    // rather than produced on the client. Nothing here runs, so what this sees is
    // exactly what a crawler is served.
    await expect(page.locator(PANEL)).toHaveCount(1)
    await expect(page.locator(`main ${PANEL}`)).toHaveCount(1)

    // …and it is shown, not merely served: §2.1's other half asks the page to degrade
    // to a long page with everything visible, so with no JavaScript the sheet is a
    // block in the flow rather than a sheet fixed off the bottom edge. `noJsCss` in
    // components/kb/Panel.tsx is what does it, and `e2e/kb-sweep.test.ts` is where the
    // whole census lives.
    await expect(page.locator(PANEL)).toBeVisible()
    await expect(page.locator(PANEL)).toHaveCSS('position', 'static')

    const links = page.locator(`${PANEL} .panel_contextLevel a`)
    await expect(links).toHaveCount(2)
    await expect(links.nth(1)).toHaveAttribute(
      'href',
      '/hu/konyvek/alice-es-bob/fejezetek/alice-es-bob-gyuruje#szakaszok.gyuruk-es-testek',
    )
  })
})

test.describe('adoption', () => {
  test('moves the served nodes to <body> instead of rendering a second copy', async ({ page }) => {
    await openEntity(page)

    // One panel on the page, and it is no longer where the server put it: the
    // element that was inside <main> in the served HTML (the test above) is now a
    // child of the body-level host. A client-side re-render would leave two.
    await expect(page.locator(PANEL)).toHaveCount(1)
    await expect(page.locator(`body > [data-kb-panel-host] > ${PANEL}`)).toHaveCount(1)
    await expect(page.locator(`main ${PANEL}`)).toHaveCount(0)

    // The content travelled with it — the nodes are the served ones, not a rebuild.
    await expect(page.locator(`${PANEL} .panel_contextLevel a`)).toHaveCount(2)

    // …and that is what lets it be fixed to the VIEWPORT: `.page-root` carries a
    // transform, which would have made the panel size itself to the document.
    await openContextPanel(page)
    const viewport = page.viewportSize()!
    await page.evaluate(() => window.scrollTo(0, 0))
    expect(await panelTop(page)).toBe(viewport.height / 2)
  })
})
