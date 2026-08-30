import { expect, test, type Page } from '@playwright/test'

/**
 * The filter above a knowledge-base list, in a browser (sub-plan §4, §5).
 *
 * What only a browser can answer about it is where the field IS once the reader has
 * scrolled into the list. These pages are 341, 84 and 191 rows long, and the field is
 * the only control on them: it stays put under the sticky header, so narrowing the
 * list never means scrolling back out of it first. That is a `position: sticky` whose
 * offset is a custom property published at runtime by
 * `components/layout/HeaderHeightProbe.tsx` — three moving parts (the header's real
 * height, the property, the rule), and none of them can be read off a stylesheet.
 *
 * The narrowing itself is not this file's subject: `filterTextMatches` is a pure
 * function with its own unit suite (`test/filter-text.test.mjs`), and the served,
 * unfiltered list is checked in `e2e/kb-sweep.test.ts`. What is here is the pair the
 * two of those cannot cover — the field's position, and the list actually narrowing
 * under it while it holds that position.
 */

/** The three pages that carry the filter, and how many rows each serves. */
const LISTS = [
  { name: 'the glossary', url: '/hu/tudasbazis/fogalmak', rows: 341 },
  { name: 'the definitions index', url: '/hu/tudasbazis/definiciok', rows: 84 },
  { name: 'the theorems index', url: '/hu/tudasbazis/tetelek', rows: 191 },
] as const

/** `next.config.ts` names every CSS-module class of ours `<file>_<local>`. */
const CONTROLS = '.list-filter_controls'
const INPUT = '.list-filter_input'
const CLEAR = '.list-filter_clear'
const ROW = '[data-filter-text]'
const BREADCRUMB = '.site-header_breadcrumbRow'

/** See `kb-chrome.test.ts`: the banner covers the bottom until a decision is made. */
async function settleConsent(page: Page) {
  const reject = page.getByRole('button', { name: 'Elutasítom', exact: true })
  await reject.click()
  await expect(reject).toBeHidden()
}

/**
 * Where the field has come to rest, and where the chrome above it ends.
 *
 * Both measured in the same frame, because the claim is that they touch — and the
 * breadcrumb row is measured rather than the header alone, since "just below the
 * breadcrumb" is the promise and the breadcrumb is the header's last row.
 */
function geometry(page: Page) {
  return page.evaluate(
    ([controls, breadcrumb]) => {
      const field = document.querySelector(controls)!.getBoundingClientRect()
      const crumbs = document.querySelector(breadcrumb)!.getBoundingClientRect()
      const header = document.querySelector('header')!.getBoundingClientRect()
      return {
        fieldTop: field.top,
        fieldBottom: field.bottom,
        crumbsBottom: crumbs.bottom,
        headerBottom: header.bottom,
        published: getComputedStyle(document.documentElement).getPropertyValue('--header-height'),
        scrollY: window.scrollY,
      }
    },
    [CONTROLS, BREADCRUMB] as const,
  )
}

/**
 * Scroll until the last row of the list is at the bottom of the viewport.
 *
 * Not a fixed offset. `position: sticky` holds an element only while its containing
 * block is in view, and here that block is the filter with the whole list inside it —
 * so scrolling to the very bottom of the page takes the bar away with the list, past
 * the newsletter form and the footer that follow it. Correct, and not what this is
 * about: the claim is about a reader who is INSIDE the list, and the last row is the
 * furthest point that is still inside it. It is also the strongest position for the
 * claim — the shortest of the three pages has 84 rows, and this reaches the end of
 * them.
 */
async function scrollDeepIntoList(page: Page) {
  const scrolled = await page.evaluate((row) => {
    const rows = document.querySelectorAll<HTMLElement>(row)
    const last = rows[rows.length - 1]
    window.scrollBy({
      top: last.getBoundingClientRect().bottom - window.innerHeight + 8,
      behavior: 'instant' as ScrollBehavior,
    })
    return window.scrollY
  }, ROW)
  await page.evaluate(
    () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())),
  )
  return scrolled
}

for (const list of LISTS) {
  test.describe(list.name, () => {
    test('the filter field stays just below the breadcrumb as the list scrolls', async ({
      page,
    }) => {
      await page.goto(list.url)
      await settleConsent(page)
      await expect(page.locator(ROW)).toHaveCount(list.rows)

      // At rest it is where the page put it: below the counts, well down from the
      // header. This is the control against which "it stuck" means something.
      const atRest = await geometry(page)
      expect(atRest.scrollY).toBe(0)
      expect(atRest.fieldTop).toBeGreaterThan(atRest.headerBottom)

      // All the way to the end of the list, which is as far into it as a reader can be.
      await scrollDeepIntoList(page)

      const stuck = await geometry(page)
      // Far enough that the field's own served position is long gone: the shortest of
      // these lists is taller than a viewport several times over.
      expect(stuck.scrollY).toBeGreaterThan(atRest.fieldTop + 1000)
      // Touching the breadcrumb row's lower edge, not merely somewhere near the top:
      // the offset is the header's own measured height, republished on every resize,
      // so a rounded custom property is the whole of the tolerance here.
      expect(stuck.crumbsBottom).toBeCloseTo(stuck.headerBottom, 0)
      expect(Math.abs(stuck.fieldTop - stuck.crumbsBottom)).toBeLessThan(2)
      // The property the rule reads, so a failure says which of the two broke.
      expect(stuck.published.trim()).not.toBe('')
    })
  })
}

test.describe('filtering from inside the list', () => {
  test('narrows the list without the reader leaving where they are', async ({ page }) => {
    await page.goto(LISTS[1].url)
    await settleConsent(page)

    await scrollDeepIntoList(page)
    const before = await geometry(page)
    expect(Math.abs(before.fieldTop - before.crumbsBottom)).toBeLessThan(2)

    // Typed into the field where it is, which is the point of it being there: no
    // scrolling first, and no `force`.
    await page.locator(INPUT).fill('gyűrű')
    await expect.poll(async () => page.locator(`${ROW}:visible`).count()).toBeLessThan(LISTS[1].rows)
    const visible = await page.locator(`${ROW}:visible`).count()
    expect(visible).toBeGreaterThan(0)

    // The count line was rewritten from the same template the server rendered, and
    // says what the list now shows.
    await expect(page.locator('[data-filter-count]')).toContainText(String(visible))

    // A shorter list is a shorter page, so the browser may have scrolled it under the
    // reader — what matters is that the field is still exactly where it was, under the
    // breadcrumb, which is where their next keystroke goes.
    const after = await geometry(page)
    expect(Math.abs(after.fieldTop - after.crumbsBottom)).toBeLessThan(2)
    expect(after.fieldTop).toBeCloseTo(before.fieldTop, 0)

    // And the one-action clear is beside it, in the same sticky bar.
    await page.locator(CLEAR).click()
    await expect(page.locator(`${ROW}:visible`)).toHaveCount(LISTS[1].rows)
    const cleared = await geometry(page)
    expect(Math.abs(cleared.fieldTop - cleared.crumbsBottom)).toBeLessThan(2)
  })
})
