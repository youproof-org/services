import { expect, test, type Page } from '@playwright/test'

/**
 * The link out of the narrative: every entity embedded in a chapter carries one to
 * its own knowledge-base page (`EmbeddedEntity`'s `EntityClose`).
 *
 * **Why this has a suite of its own.** It is the only edge from the book side of the
 * site into the knowledge base. A reference inside a chapter resolves to the
 * chapter's own anchor rather than to a knowledge-base URL, nothing else outside the
 * knowledge base links into it, and the sitemap does not list it — so with this link
 * broken the 541 knowledge-base pages are once again reachable only by typing a URL,
 * and no other test in the suite would notice. `kb-sweep.test.ts` asks the
 * cross-cutting questions about knowledge-base PAGES; this link lives on a chapter
 * page, which is the one surface that file does not visit.
 *
 * The no-JavaScript pass is the one that matters, for the same reason it matters in
 * the sweep: what a browser with scripting off renders is what a crawler is handed,
 * and crawler reachability is the whole point of the link.
 */

/**
 * One chapter, and its census read off the built HTML: 5 definitions, 18 theorems,
 * 18 proofs and 6 remarks. Chosen because it embeds all four types — `EntityClose` is
 * written once, but the three return shapes of `EmbeddedEntity` each render it
 * separately, so a chapter missing a type would not exercise all of them.
 */
const CHAPTER = '/hu/konyvek/alice-es-bob/fejezetek/alice-es-bob-okori-haverja'
const BOXES = 47

/** The first box in that chapter, and where its link leads. */
const FIRST_TARGET = '/hu/tudasbazis/definiciok/legnagyobb-kozos-oszto'
const FIRST_TITLE = 'Legnagyobb közös osztó'

const LABEL = 'Megnézem a tudásbázisban'

/** `next.config.ts` names every CSS-module class of ours `<file>_<local>`. */
const BOX =
  '.embedded-entity_definition, .embedded-entity_theorem,' +
  ' .embedded-entity_proof, .embedded-entity_remark'
const KB_LINK = '.embedded-entity_kb-link'
const QED = '.embedded-entity_qed'

/** See `kb-chrome.test.ts`: the banner covers the page until a decision is made. */
async function settleConsent(page: Page) {
  const reject = page.getByRole('button', { name: 'Elutasítom', exact: true })
  await reject.click()
  await expect(reject).toBeHidden()
}

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false })

  test('every embedded entity carries a link to its knowledge-base page', async ({ page }) => {
    await page.goto(CHAPTER)

    // Nothing runs here, so this is the served HTML rendered by the browser alone —
    // which is what a crawler is handed.
    await expect(page.locator(BOX)).toHaveCount(BOXES)
    await expect(page.locator(KB_LINK)).toHaveCount(BOXES)

    // Exactly one per box, asked of all 47 at once rather than box by box: a box with
    // no link cannot pass by being skipped, and two links in one box cannot hide
    // behind a total that happens to come out right.
    const wrong = await page
      .locator(BOX)
      .evaluateAll(
        (boxes, selector) =>
          boxes.filter((box) => box.querySelectorAll(selector).length !== 1).length,
        KB_LINK,
      )
    expect(wrong).toBe(0)

    const first = page.locator(KB_LINK).first()
    await expect(first).toBeVisible()
    await expect(first).toHaveAttribute('href', FIRST_TARGET)
    // By accessible name, which is the label alone: the arrow beside it is decorative
    // and `aria-hidden`, so this asserts both the wording and that the arrow stays out
    // of the name.
    await expect(page.getByRole('link', { name: LABEL, exact: true }).first()).toHaveAttribute(
      'href',
      FIRST_TARGET,
    )

    // Every href leads to a page this build generated — the link is worthless if it
    // leads nowhere, and a fragment-less internal URL is not something
    // `scripts/check-anchors.mjs` looks at.
    const targets = await page.locator(KB_LINK).evaluateAll((links) =>
      [...new Set(links.map((link) => link.getAttribute('href')))],
    )
    expect(targets).toHaveLength(BOXES)
    for (const target of targets) {
      const response = await page.request.get(target as string)
      expect(response.status(), `${target} is not in the export`).toBe(200)
    }
  })

  test('the link leads to the entity page, and the page leads back into the graph', async ({
    page,
  }) => {
    // The whole point, walked once with no JavaScript at all: from the narrative to
    // the entity's own page, and from there on into the knowledge base.
    await page.goto(CHAPTER)
    await page.locator(KB_LINK).first().click()

    await expect(page).toHaveURL(new RegExp(`${FIRST_TARGET}$`))
    await expect(page.getByRole('heading', { level: 1, name: FIRST_TITLE })).toBeVisible()
    await expect(page.locator('#kb-panel')).toHaveCount(1)
  })
})

test.describe('print', () => {
  test('the glyph prints and the link does not', async ({ page }) => {
    await page.goto(CHAPTER)
    await settleConsent(page)

    // Both assertions made twice, on screen and then on paper, so the media query is
    // shown to be what hides the link rather than something else having removed it —
    // the convention `kb-sweep.test.ts` prints by.
    await expect(page.locator(KB_LINK).first()).toBeVisible()
    await expect(page.locator(QED).first()).toBeVisible()

    await page.emulateMedia({ media: 'print' })

    await expect(page.locator(KB_LINK).first()).toHaveCSS('display', 'none')
    await expect(page.locator(KB_LINK).first()).toBeHidden()
    // The glyph stays: it closes the body, which is content and prints.
    await expect(page.locator(QED).first()).toBeVisible()
  })
})
