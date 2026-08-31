import { expect, test, type Page } from '@playwright/test'
import { collectConsoleNoise } from './support/console-noise'

/**
 * The entity page's interactive chrome, checked in a real browser.
 *
 * `test/kb-chrome.test.mjs` already covers what a back step *means* — it is a pure
 * reducer and needs no DOM. What it cannot reach is everything this file is for:
 * that the chrome mounts at all after a static export hydrates, that four different
 * gestures all land on the same one step, that Forward restores rather than
 * reloads, that the address bar never moves, and that the dim sits under the
 * consent button rather than over it.
 *
 * Deliberately small. This is an interaction contract, not a snapshot suite: no
 * screenshots, no assertions about pixels beyond the one thing geometry decides
 * (which corner a fixed control is in, and whether two of them overlap).
 */

/**
 * An entity with the richest menu available: it defines terms AND asserts claims,
 * so all four items are present (`lib/kb/menu-items.ts`). Chosen so a change that
 * only breaks the conditional items still fails here.
 */
const ENTITY = '/hu/tudasbazis/definiciok/gyuru-test'

const MENU = 'Menü'
const BACK = 'Vissza'

/**
 * The dim has no accessible name on purpose — it is `aria-hidden` and Escape
 * carries the same step for anyone not using a pointer — so there is no role or
 * text to find it by. `next.config.ts` renames CSS-module classes to a stable
 * `<file>_<local>`, which makes the class the one durable handle it has.
 */
const OVERLAY = '.overlay_overlay'

/**
 * The chrome's buttons are found inside the stack, not on the page.
 *
 * Two reasons, both of them real collisions found by this suite: the site header's
 * hamburger is also labelled "Menü" below the nav breakpoint, and an accessible
 * name is matched as a substring, so a page-wide search for "Állítások" also finds
 * the consent opener's "Süti-beállítások". Scoping to the stack, and matching
 * exactly, keeps every locator here about the chrome.
 */
function stack(page: Page) {
  return page.locator('.menu-stack_stack')
}

function chromeButton(page: Page, name: string) {
  return stack(page).getByRole('button', { name, exact: true })
}

/**
 * Settle the cookie decision, which every test here does first.
 *
 * Two reasons. The consent opener only exists once a decision has been made, and
 * two of these tests are about that opener. And the banner it replaces is fixed to
 * the bottom of the viewport at $z-banner, above the chrome's $z-kb-chrome — at
 * 1280x720 it clips the last few pixels of the Menü button, and at 360x720 it
 * covers it outright, so a first-visit reader cannot reach the menu until they have
 * answered. That is a layout question for the chrome's own phases to settle, not
 * something to assert here; this suite tests the chrome, so it starts from the
 * state a returning reader is in.
 *
 * Rejecting rather than accepting keeps gtag.js out of the page, so the console
 * assertion below is about our code and not Google's. Going through the banner
 * rather than planting a cookie keeps the test independent of the record's wire
 * format.
 */
async function settleConsent(page: Page) {
  const reject = page.getByRole('button', { name: 'Elutasítom', exact: true })
  await reject.click()
  await expect(reject).toBeHidden()
}

/** Land on the entity page with the banner out of the way and the chrome mounted. */
async function openEntity(page: Page) {
  await page.goto(ENTITY)
  await settleConsent(page)
  await expect(chromeButton(page, MENU)).toBeVisible()
}

/** Open the menu and wait until both halves of the open state are on screen. */
async function openMenu(page: Page) {
  await chromeButton(page, MENU).click()
  await expect(chromeButton(page, BACK)).toBeVisible()
  await expect(page.locator(OVERLAY)).toBeVisible()
}

/**
 * The CSS animations running on the bottom-most button, by name.
 *
 * `{ subtree: true }` is the whole point of reading it this way: the attention ring
 * is painted on `.iconBox::after`, which has no element to locate and no computed
 * style Playwright can be asked for — the animation registered on the pseudo-element
 * is the only handle on it.
 */
async function buttonAnimations(page: Page, caption: string): Promise<string[]> {
  return page.evaluate((label) => {
    const button = Array.from(
      document.querySelectorAll<HTMLButtonElement>('.menu-stack_item'),
    ).find((candidate) => candidate.textContent?.trim() === label)
    if (!button) throw new Error(`no chrome button captioned '${label}'`)
    return button
      .getAnimations({ subtree: true })
      .map((animation) => String((animation as CSSAnimation).animationName ?? ''))
  }, caption)
}

/** Assert the page is back in its default state: no dim, and the button reads Menü. */
async function expectClosed(page: Page) {
  await expect(page.locator(OVERLAY)).toHaveCount(0)
  await expect(chromeButton(page, MENU)).toBeVisible()
  await expect(chromeButton(page, BACK)).toHaveCount(0)
}

test.describe('entity chrome', () => {
  test('mounts a Menü button in the bottom-right corner', async ({ page }) => {
    await openEntity(page)

    const menu = chromeButton(page, MENU)
    const box = (await menu.boundingBox())!
    const viewport = page.viewportSize()!

    // The corner matters: the consent opener owns bottom-left, and §6.2 puts this
    // stack in the one corner that leaves it alone.
    expect(box.x).toBeGreaterThan(viewport.width / 2)
    expect(box.y + box.height).toBeGreaterThan(viewport.height * 0.8)
  })

  test('the Menü button pulses until it is pressed, and never again on that page', async ({
    page,
  }) => {
    await openEntity(page)

    // On arrival it is asking to be noticed: the corner is far from the column the
    // reader is reading, and a still white pill there was being missed.
    expect(await buttonAnimations(page, MENU)).toContain('menu-stack_hint-pulse')

    await openMenu(page)
    await page.goBack()
    await expectClosed(page)

    // The hint ends on the press and not on a timer, so it is gone even though the
    // reader is back in the state they arrived in — they have found the menu, and it
    // is the finding that the pulse was for. The dim is down and the caption reads
    // Menü again (`expectClosed`), so this is the same button in the same state.
    expect(await buttonAnimations(page, MENU)).toEqual([])
  })

  test('every menu glyph is the size of the consent shield, in a 44px button', async ({
    page,
  }) => {
    await openEntity(page)
    await openMenu(page)

    // The two corners of the screen carry the site's only fixed chrome, and §6.2 asks
    // for the opener's treatment rather than a second one — which is a statement about
    // the glyph as much as about the circle around it.
    const shield = (await page
      .getByRole('button', { name: 'Süti-beállítások' })
      .locator('svg')
      .boundingBox())!

    /*
      Against the shield AS RENDERED, which is 16.66 × 13.33 and not the 1.125rem
      square `consent-fab.module.scss` asks for: FontAwesome's own `.svg-inline--fa`
      wins the cascade, and a <button> takes the user agent's 13.33px font rather than
      the page's 16. That is exactly why this is a browser test and not a stylesheet
      read — "the same size as the shield" is a claim about what paints.

      A menu icon is a square PNG, so it is matched against the shield's wider side,
      to within a pixel. The band is deliberately tight: it excludes both the 44px the
      icons used to be and any accidental return to 1.125rem.
    */
    expect(shield.width).toBeGreaterThan(15)
    expect(shield.width).toBeLessThan(18)

    const icons = await page.locator('.menu-stack_icon').all()
    // Five: the four items plus the Menü button itself.
    expect(icons.length).toBe(5)
    for (const icon of icons) {
      const box = (await icon.boundingBox())!
      expect(box.width).toBe(box.height)
      expect(Math.abs(box.width - shield.width)).toBeLessThan(1)
    }

    // …and the button around each of them is still the 44px touch target it was: the
    // glyph shrank, the pill did not.
    for (const box of await page.locator('.menu-stack_iconBox').all()) {
      const rect = (await box.boundingBox())!
      expect(rect.width).toBe(44)
      expect(rect.height).toBe(44)
    }
  })

  test('opening the menu shows the four items and dims the page', async ({ page }) => {
    await openEntity(page)
    await openMenu(page)

    for (const label of ['Bejövő hivatkozások', 'Fogalmak', 'Állítások', 'Kontextus']) {
      await expect(chromeButton(page, label)).toBeVisible()
    }

    const overlay = page.locator(OVERLAY)
    // Visible is not enough: a zero-opacity or unpainted layer would pass that and
    // dim nothing.
    await expect(overlay).toHaveCSS('opacity', '1')
    await expect(overlay).toHaveCSS('background-color', 'rgba(0, 0, 0, 0.5)')
    const box = (await overlay.boundingBox())!
    const viewport = page.viewportSize()!
    expect(box.width).toBe(viewport.width)
    expect(box.height).toBe(viewport.height)
  })

  // The four gestures §6.2/D2 make one behaviour. Each is checked on its own, from
  // a fresh open, so a regression names the gesture that broke.
  const backPaths: Array<[string, (page: Page) => Promise<unknown>]> = [
    ['the Vissza button', (page) => chromeButton(page, BACK).click()],
    ['the Escape key', (page) => page.keyboard.press('Escape')],
    ['a click on the dim', (page) => page.locator(OVERLAY).click({ position: { x: 5, y: 5 } })],
    ["the browser's Back", (page) => page.goBack()],
  ]

  for (const [name, step] of backPaths) {
    test(`${name} steps back exactly one state`, async ({ page }) => {
      await openEntity(page)
      await openMenu(page)
      await step(page)
      await expectClosed(page)
    })
  }

  test('Forward re-applies what Back undid, without reloading the page', async ({ page }) => {
    await openEntity(page)

    // A value that only survives if the document does. Next patches
    // `history.pushState` to copy its `__NA` marker onto whatever state it is
    // handed; if the chrome's entry ever loses that marker, Next's own popstate
    // handler treats the entry as foreign and does a full navigation — which would
    // look like a pass on the visual assertion alone and wipe this.
    await page.evaluate(() => {
      ;(window as unknown as Record<string, unknown>).__chromeSentinel = 'alive'
    })

    await openMenu(page)
    await page.goBack()
    await expectClosed(page)

    await page.goForward()
    await expect(page.locator(OVERLAY)).toBeVisible()
    await expect(chromeButton(page, BACK)).toBeVisible()

    const sentinel = await page.evaluate(
      () => (window as unknown as Record<string, unknown>).__chromeSentinel,
    )
    expect(sentinel, 'the page reloaded instead of restoring the history entry').toBe('alive')
  })

  test('the URL never changes across open, back and forward', async ({ page }) => {
    await openEntity(page)
    const url = page.url()
    // Not just the path: `pushState` with a url argument could also introduce a
    // query or a fragment, and §6.2 says every state of the page is the same URL.
    expect(new URL(url).search).toBe('')
    expect(new URL(url).hash).toBe('')

    await openMenu(page)
    expect(page.url()).toBe(url)

    await page.goBack()
    await expectClosed(page)
    expect(page.url()).toBe(url)

    await page.goForward()
    await expect(page.locator(OVERLAY)).toBeVisible()
    expect(page.url()).toBe(url)
  })

  test('the page still scrolls while the dim is up', async ({ page }) => {
    await openEntity(page)
    await openMenu(page)

    // §6.3: picking a term means finding it first, so the dim must not lock the
    // page. Scrolling is driven by the wheel rather than `window.scrollTo`, which
    // would move a page that `overflow: hidden` had frozen for a real reader.
    await page.mouse.move(400, 300)
    await page.mouse.wheel(0, 600)
    await expect
      .poll(() => page.evaluate(() => window.scrollY))
      .toBeGreaterThan(0)

    // And the dim is still over the whole viewport after the scroll — a layer
    // positioned against the document rather than the viewport would have moved.
    const box = (await page.locator(OVERLAY).boundingBox())!
    expect(box.y).toBe(0)
    expect(box.height).toBe(page.viewportSize()!.height)
  })

  test('the consent button stays clickable through the dim', async ({ page }) => {
    await openEntity(page)
    await openMenu(page)

    // No force: a real click at the button's own coordinates, so a dim that
    // covered it would fail here rather than be worked around.
    await page.getByRole('button', { name: 'Süti-beállítások' }).click()

    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()

    // Above the dim, not merely present. The scale in `_variables.scss` puts
    // $z-dialog over $z-kb-overlay; this checks the rendered result rather than
    // the intent.
    const point = (await dialog.boundingBox())!
    const topmost = await page.evaluate(
      ([x, y]) => document.elementFromPoint(x, y)?.className ?? '',
      [point.x + point.width / 2, point.y + 10] as const,
    )
    expect(String(topmost)).not.toContain('overlay_overlay')
  })

  test('the consent button and the menu stack do not collide at 360px', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 720 })
    await openEntity(page)
    await openMenu(page)

    const fab = (await page.getByRole('button', { name: 'Süti-beállítások' }).boundingBox())!
    // The widest pill in the stack is what can reach across a narrow viewport.
    const items = await page.locator('.menu-stack_item').all()
    const boxes = await Promise.all(items.map(async (item) => (await item.boundingBox())!))
    const leftmost = Math.min(...boxes.map((box) => box.x))

    expect(
      leftmost,
      'the menu stack overlaps the consent button at a narrow viewport',
    ).toBeGreaterThan(fab.x + fab.width)
  })

  test('an entity page logs no error or warning', async ({ page }) => {
    const noise = collectConsoleNoise(page)

    await openEntity(page)
    await openMenu(page)
    await page.goBack()
    await expectClosed(page)

    expect(noise).toEqual([])
  })
})

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false })

  test('the entity page is complete and carries no chrome', async ({ page }) => {
    await page.goto(ENTITY)

    // §2.1: the page is the content, and the content is in the HTML. What is
    // checked here is the body of the entity, not just that something rendered.
    await expect(page.getByRole('heading', { level: 1, name: 'Gyűrű, test' })).toBeVisible()
    await expect(page.locator('main')).toContainText('gyűrű')

    // …and none of the interactive layer, which is client-only by construction.
    await expect(chromeButton(page, MENU)).toHaveCount(0)
    await expect(page.locator(OVERLAY)).toHaveCount(0)
    await expect(page.locator('.menu-stack_stack')).toHaveCount(0)
  })
})

test.describe('the menu hint under prefers-reduced-motion', () => {
  test('does not pulse, and is still a hint', async ({ page }) => {
    // `page.emulateMedia` rather than the `reducedMotion` fixture: on Playwright
    // 1.62.1 a `test.use({ reducedMotion: 'reduce' })` in this describe leaves
    // `matchMedia('(prefers-reduced-motion: reduce)')` false in the page, so the
    // test would have passed by never enabling the thing it is about.
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await openEntity(page)

    expect(await buttonAnimations(page, MENU)).toEqual([])

    // Reduced motion removes the movement, not the hint: the unpressed button wears
    // the hover treatment's black outline instead, so the control the reader was
    // missing is still the one thing that stands out in that corner.
    await expect(chromeButton(page, MENU)).toHaveCSS('border-color', 'rgb(0, 0, 0)')
    await expect(chromeButton(page, MENU).locator('.menu-stack_iconBox')).toHaveCSS(
      'border-color',
      'rgb(0, 0, 0)',
    )
  })
})

test.describe('the menu hint across a soft navigation', () => {
  /**
   * One hint per page, and a client-side navigation is a new page.
   *
   * The flow is the one that actually reaches a second entity page without a
   * document load: the menu, a panel, and a link out of it — which is also the flow
   * that has already spent this page's hint. Worth its own test because "per page"
   * is carried by `EntityChrome` being remounted on the route change and by nothing
   * else; a hint kept in a store, or a chrome hoisted above the route, would leave
   * the second page's button still.
   */
  test('the next entity page hints again', async ({ page }) => {
    await openEntity(page)
    await chromeButton(page, MENU).click()
    await chromeButton(page, 'Bejövő hivatkozások').click()

    // Scoped to the section that is up: every one of the five panel contents is in
    // the HTML from the first byte (§2.1), so the panel is full of links the reader
    // cannot see.
    const link = page
      .locator('#kb-panel [data-kb-panel-kind="incoming"] a[href^="/hu/tudasbazis/"]')
      .first()
    const href = (await link.getAttribute('href'))!
    await link.click()
    await expect(page).toHaveURL(new RegExp(`${href}$`))
    await expect(chromeButton(page, MENU)).toBeVisible()

    expect(await buttonAnimations(page, MENU)).toContain('menu-stack_hint-pulse')
  })
})
