import { expect, test, type Page, type Response } from '@playwright/test'
import { collectConsoleNoise } from './support/console-noise'
import { fixtures } from './support/fixtures'

/**
 * The RSC payload served as one external script, and the page still hydrating from it.
 *
 * `scripts/externalize-flight.mjs` moves every page's inline `self.__next_f.push`
 * scripts into one content-hashed file under `/_next/static/flight/`, relying on a
 * Next.js internal: the client reads those pushes off a global array until
 * `DOMContentLoaded`, and a classic `<script src>` runs before that event just as the
 * inline scripts did. The build checks prove the file carries the whole payload;
 * only a browser can prove React still picks it up. A Next.js change to that
 * contract passes every build check and fails here.
 *
 * Every other suite in this directory also runs against the rewritten export, so
 * each of their interactions is a hydration test too. This one states the contract
 * directly, on one page of each kind: the home page, a chapter, a knowledge-base
 * entity, and the theorem index.
 */

const PAGES = [
  { name: 'the home page', url: '/hu' },
  { name: 'a chapter', url: '/hu/konyvek/alice-es-bob/fejezetek/alice-es-bob-gyuruje' },
  { name: 'a knowledge-base entity', url: '/hu/tudasbazis/definiciok/gyuru-test' },
  { name: 'the theorem index', url: '/hu/tudasbazis/tetelek' },
] as const

const FLIGHT_PATH = '/_next/static/flight/'
const FLIGHT_SCRIPT = /<script src="(\/_next\/static\/flight\/[0-9a-f]+\.js)"><\/script>/g

/** See `kb-chrome.test.ts`: the banner covers the chrome until a decision is made. */
async function settleConsent(page: Page) {
  const reject = page.getByRole('button', { name: 'Elutasítom', exact: true })
  await reject.click()
  await expect(reject).toBeHidden()
}

function recordFlightResponses(page: Page): Response[] {
  const responses: Response[] = []
  page.on('response', (response) => {
    if (new URL(response.url()).pathname.startsWith(FLIGHT_PATH)) responses.push(response)
  })
  return responses
}

/** React sets a `__reactFiber$…` key on every DOM node it hydrated. */
function reactAttachedToMain(page: Page) {
  return page.evaluate(() => {
    const main = document.querySelector('main')
    return main !== null && Object.keys(main).some((key) => key.startsWith('__reactFiber$'))
  })
}

for (const target of PAGES) {
  test.describe(target.name, () => {
    test('serves no inline payload and loads exactly one flight script', async ({ page, request }) => {
      const served = await (await request.get(target.url)).text()
      expect(served).not.toContain('__next_f')
      const scripts = [...served.matchAll(FLIGHT_SCRIPT)].map((match) => match[1])
      expect(scripts).toHaveLength(1)

      const responses = recordFlightResponses(page)
      await page.goto(target.url, { waitUntil: 'load' })

      expect(responses.map((response) => new URL(response.url()).pathname)).toEqual(scripts)
      expect(responses[0].status()).toBe(200)
      expect(responses[0].headers()['content-type']).toMatch(/javascript/)
    })

    test('hydrates without a page error or console error', async ({ page }) => {
      const noise = collectConsoleNoise(page)
      await page.goto(target.url, { waitUntil: 'load' })

      await expect.poll(() => reactAttachedToMain(page)).toBe(true)
      expect(noise).toEqual([])
    })
  })
}

test.describe('client components work on the rewritten pages', () => {
  test('the theorem index filter narrows the list', async ({ page }) => {
    const noise = collectConsoleNoise(page)
    await page.goto('/hu/tudasbazis/tetelek')
    await settleConsent(page)
    const rows = page.locator('[data-filter-text]')
    await expect(rows).toHaveCount(fixtures.lists.theoremRows)

    await page.locator('.list-filter_input').fill('Fermat')

    await expect.poll(() => page.locator('[data-filter-text]:visible').count()).toBeLessThan(fixtures.lists.theoremRows)
    expect(await page.locator('[data-filter-text]:visible').count()).toBeGreaterThan(0)
    expect(noise).toEqual([])
  })

  test('a knowledge-base panel opens', async ({ page }) => {
    const noise = collectConsoleNoise(page)
    await page.goto('/hu/tudasbazis/definiciok/gyuru-test')
    await settleConsent(page)

    const stack = page.locator('.menu-stack_stack')
    await stack.getByRole('button', { name: 'Menü', exact: true }).click()
    await stack.getByRole('button', { name: 'Kontextus', exact: true }).click()

    await expect(page.locator('#kb-panel')).toBeVisible()
    await expect(page.locator('#kb-panel .panel_contextLevel a').first()).toBeVisible()
    expect(noise).toEqual([])
  })
})
