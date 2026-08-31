import { expect, test, type BrowserContext, type Page } from '@playwright/test'
import { fixtures, incomingRows } from './support/fixtures'

/**
 * The three cross-cutting rules, checked once on the finished pages: print, no
 * JavaScript, and — from the other suites — reduced motion (sub-plan §2, §2.1, §6.4).
 *
 * Nineteen phases each had a clause of one of these, and each of them handled its own
 * piece. This file is where the three are asked as one question, on a page that
 * carries every one of the five panel contents at once, rather than trusting the sum
 * of nineteen local answers.
 *
 * ## What lives here and what does not
 *
 * **Print** is only here: no other suite emulates it, and the rule is about the page
 * as a whole — "none of the entity-page chrome prints" is a claim about four separate
 * layers, three of which only exist in a state the reader has to open first.
 *
 * **No JavaScript** is also checked per content type in `kb-panel`, `kb-select`,
 * `kb-backlinks`, `kb-reference` and `kb-chrome`, each against the content that phase
 * added. What is here is the whole-page census — the body, the ownership chain, all
 * five panel kinds and their counts on one page — plus the list pages, which have no
 * client behaviour to lose but are the other half of "every page degrades".
 *
 * **Reduced motion** is NOT re-tested here. All three animations already have a
 * frame-level test in the suite that owns them, and re-asserting them in a fifth file
 * would be a second, weaker copy:
 *
 *   - the panel slide — `kb-panel.test.ts`, "appears and disappears without the slide";
 *   - the scroll into the free upper half — `kb-select.test.ts`, "the scroll jumps
 *     rather than eases";
 *   - the arrival marker — `kb-arrival.test.ts` and `kb-highlight.test.ts`, "no shrink
 *     and there is still a mark".
 *
 * ## How print is emulated, and what that does and does not prove
 *
 * `page.emulateMedia({ media: 'print' })` makes the browser apply the print
 * stylesheets to the page it is already showing. That is exactly the right instrument
 * for `@media print { display: none }`, and it is the whole of what these rules are.
 * It is NOT a print preview: there is no pagination, no page box, no margin boxes and
 * no printer driver, so nothing here says anything about how the body breaks across
 * sheets.
 *
 * Every print assertion is made twice — once on screen and once on paper, on the same
 * page in the same state — so the media query is shown to be what hides the chrome
 * rather than something else having removed it.
 */

/**
 * The one entity page in the export that carries all five panel contents AND an
 * ownership link: 1 incoming list, 1 context chain, 4 term panels, 5 claim panels and
 * 12 reference panels, with one link down to its proof.
 *
 * The panel census is written down because it is a property of this node's own body —
 * its terms, its claims, its outgoing references — which is the same in every build.
 * Its INBOUND list is not: a deployed build drops the sources whose own page it does
 * not generate, so that count comes from the graph.
 *
 * The busier pages the other suites use are definitions with nothing above or below
 * them, so the ownership half of the gate cannot be asked there.
 */
const ENTITY = '/hu/tudasbazis/tetelek/maradekosztalygyuruk'
const ENTITY_TITLE = 'Maradékosztálygyűrűk'
const SECTION_COUNT = 23
const TERM_PANELS = 4
const CLAIM_PANELS = 5
const REFERENCE_PANELS = 12
const CONTEXT_LEVELS = 2
const PROOF_URL = '/hu/tudasbazis/tetelek/maradekosztalygyuruk/bizonyitasok/maradekosztalygyuruk-bizonyitas'

/**
 * The fragment the marker is caught on, once with print as the medium and once on
 * screen. `termAnchorId` output, which is one of the three marked kinds (D5).
 */
const MARKED_ANCHOR = 'fogalmak.maradekosztalyok-osszege'

/** The three list pages and the root; the row counts from the graph, per env mode. */
const GLOSSARY = '/hu/tudasbazis/fogalmak'
const DEFINITIONS = '/hu/tudasbazis/definiciok'
const THEOREMS = '/hu/tudasbazis/tetelek'
const ROOT = '/hu/tudasbazis'

const MENU = 'Menü'
const BACK = 'Vissza'
const CONTEXT = 'Kontextus'

/** `next.config.ts` names every CSS-module class of ours `<file>_<local>`. */
const ARTICLE = '.kb-entity-page_entity'
const OWNERSHIP = '.ownership-links_link'
const STACK = '.menu-stack_stack'
const OVERLAY = '.overlay_overlay'
const PANEL = '#kb-panel'
const PANEL_HEADER = `${PANEL} .panel_header`
const PANEL_TITLE = `${PANEL} .panel_title`
const SECTION = `${PANEL} [data-kb-panel-kind]`
const INCOMING_ROW = `${PANEL} [data-kb-panel-kind="incoming"] .backlinks-panel_link`
const CONTEXT_LINK = `${PANEL} [data-kb-panel-kind="context"] .panel_contextLink`
const FAB = '.consent-fab_fab'
const MARKER = '[data-kb-arrival-marker]'
const ROW = '[data-filter-text]'

/** See `kb-chrome.test.ts`: the banner covers the chrome until a decision is made. */
async function settleConsent(page: Page) {
  const reject = page.getByRole('button', { name: 'Elutasítom', exact: true })
  await reject.click()
  await expect(reject).toBeHidden()
}

function chromeButton(page: Page, name: string) {
  return page.locator(STACK).getByRole('button', { name, exact: true })
}

async function openEntity(page: Page) {
  await page.goto(ENTITY)
  await settleConsent(page)
  await expect(chromeButton(page, MENU)).toBeVisible()
}

/**
 * Gone, and gone by a rule rather than by not being there: `display` is read as well
 * as visibility, so a layer that is present and merely off-screen fails.
 */
async function expectNotDisplayed(page: Page, selector: string) {
  await expect(page.locator(selector)).toHaveCSS('display', 'none')
  await expect(page.locator(selector)).toBeHidden()
}

test.describe('print', () => {
  test('the body and the ownership links print; the menu and the dim do not', async ({
    page,
  }) => {
    await openEntity(page)
    await chromeButton(page, MENU).click()
    await expect(page.locator(OVERLAY)).toBeVisible()

    // On screen first, so the assertions below are shown to be about the print media
    // and not about a layer that was never there.
    await expect(page.locator(STACK)).toBeVisible()
    await expect(page.locator(OVERLAY)).toBeVisible()
    await expect(page.locator(FAB)).toBeVisible()

    await page.emulateMedia({ media: 'print' })
    expect(await page.evaluate(() => matchMedia('print').matches)).toBe(true)

    // §2: a menu that opens panels is meaningless on paper, and so are the dim it
    // puts up and the consent opener whose pattern all of them follow.
    await expectNotDisplayed(page, STACK)
    await expectNotDisplayed(page, OVERLAY)
    await expectNotDisplayed(page, FAB)

    // …and what the page IS still prints. This is the half that makes the three
    // assertions above mean "the chrome is gone" rather than "the page is gone".
    await expect(page.getByRole('heading', { level: 1, name: ENTITY_TITLE })).toBeVisible()
    await expect(page.locator(ARTICLE)).toBeVisible()
    const ownership = page.locator(OWNERSHIP)
    await expect(ownership).toHaveCount(1)
    await expect(ownership).toBeVisible()
    await expect(ownership).toHaveAttribute('href', PROOF_URL)
  })

  test('an open panel does not print', async ({ page }) => {
    await openEntity(page)
    await chromeButton(page, MENU).click()
    await chromeButton(page, CONTEXT).click()

    // Open, and at rest over the bottom half: the sheet is what must not print, so it
    // has to be a sheet at the moment print is asked for.
    await expect(page.locator(PANEL)).toBeVisible()
    await expect(page.locator(CONTEXT_LINK)).toHaveCount(CONTEXT_LEVELS)
    await expect(page.locator(CONTEXT_LINK).first()).toBeVisible()
    await expect(chromeButton(page, BACK)).toBeVisible()

    await page.emulateMedia({ media: 'print' })
    await expectNotDisplayed(page, PANEL)
    await expectNotDisplayed(page, STACK)
    await expectNotDisplayed(page, OVERLAY)

    // The article behind it is unaffected — the panel prints nothing, it does not
    // take the page with it.
    await expect(page.locator(ARTICLE)).toBeVisible()
    await expect(page.locator(OWNERSHIP)).toBeVisible()
  })

  /**
   * The marker is the one layer that cannot be caught by a locator: it lives for
   * about a second and then unmounts itself. So its computed `display` is recorded at
   * the instant it appears, by a script that is in the page before React is — the
   * same technique `kb-arrival.test.ts` uses, and for the same reason.
   */
  async function recordMarkerDisplay(context: BrowserContext) {
    await context.addInitScript(() => {
      const seen: string[] = []
      ;(window as unknown as { __markerDisplay: string[] }).__markerDisplay = seen
      new MutationObserver((records) => {
        for (const record of records) {
          for (const node of record.addedNodes) {
            if (!(node instanceof Element)) continue
            if (!node.hasAttribute('data-kb-arrival-marker')) continue
            seen.push(getComputedStyle(node).display)
          }
        }
        // `document` rather than `document.documentElement`: an init script runs before
        // the document has an element to hand, and `observe(null)` would throw and take
        // the recorder with it. `kb-arrival.test.ts` observes the same node.
      }).observe(document, { childList: true, subtree: true })
    })
  }

  function markerDisplays(page: Page): Promise<string[]> {
    return page.evaluate(
      () => (window as unknown as { __markerDisplay?: string[] }).__markerDisplay ?? [],
    )
  }

  test('the arrival marker does not print', async ({ context, page }) => {
    await recordMarkerDisplay(context)

    // Print as the medium before the document loads, so the mark is drawn under the
    // print stylesheets from its very first frame.
    await page.emulateMedia({ media: 'print' })
    await page.goto(`${ENTITY}#${MARKED_ANCHOR}`)
    await expect.poll(async () => (await markerDisplays(page)).length).toBe(1)
    expect(await markerDisplays(page)).toEqual(['none'])

    /*
      The control, and it is the same assertion: the same arrival on screen has to be
      drawn — otherwise "display: none" above would be satisfied by a marker that never
      fired. Waited out first, because the gesture ends by removing its own element and a
      second mark would otherwise reuse the node the recorder is watching for.

      A reload rather than a second fragment on the same document: only a load or a press
      is an arrival now (`components/kb/ArrivalMarker.tsx`), and a reload is a load. The
      recorder is an init script, so it starts empty on it.
    */
    await expect(page.locator(MARKER)).toHaveCount(0)
    await page.emulateMedia({ media: 'screen' })
    await page.reload()
    await expect.poll(async () => (await markerDisplays(page)).length).toBe(1)
    expect(await markerDisplays(page)).toEqual(['block'])
  })
})

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false })

  test('one entity page shows its body, its chain and all five panel contents inline', async ({
    page,
  }) => {
    await page.goto(ENTITY)

    // Nothing runs here, so everything below is the served HTML rendered by the
    // browser alone — which is both what a crawler is handed (§2.1) and what a reader
    // with scripting off sees.
    await expect(page.getByRole('heading', { level: 1, name: ENTITY_TITLE })).toBeVisible()
    await expect(page.locator(ARTICLE)).toBeVisible()
    const ownership = page.locator(OWNERSHIP)
    await expect(ownership).toHaveCount(1)
    await expect(ownership).toBeVisible()
    await expect(ownership).toHaveAttribute('href', PROOF_URL)

    // The panel is where the server put it — inside <main>, since the adoption into
    // <body> is a mount effect and nothing mounts — and it is no longer a sheet: a
    // block in the flow, at the end of the page it belongs to.
    await expect(page.locator(`main ${PANEL}`)).toHaveCount(1)
    await expect(page.locator(PANEL)).toBeVisible()
    await expect(page.locator(PANEL)).toHaveCSS('position', 'static')
    await expect(page.locator(PANEL)).toHaveCSS('visibility', 'visible')
    await expect(page.locator('[data-kb-panel-host]')).toHaveCount(0)

    // Every section, visible. The count is the census: one incoming list, one context
    // chain, one panel per term, per claim and per outgoing reference (§6.4, §7.1).
    const sections = page.locator(SECTION)
    await expect(sections).toHaveCount(SECTION_COUNT)
    for (const [kind, count] of [
      ['incoming', 1],
      ['context', 1],
      ['term', TERM_PANELS],
      ['claim', CLAIM_PANELS],
      ['reference', REFERENCE_PANELS],
    ] as const) {
      await expect(page.locator(`${PANEL} [data-kb-panel-kind="${kind}"]`)).toHaveCount(count)
    }
    // Not one of them is hidden — asked of all 23 at once rather than one at a time,
    // so a section that stayed hidden cannot pass by being skipped.
    expect(
      await sections.evaluateAll((nodes) =>
        nodes.filter((node) => (node as HTMLElement).offsetParent === null).length,
      ),
    ).toBe(0)

    // …and the contents inside them, not merely the boxes: the three counts this
    // phase records, and the context chain's links.
    await expect(page.locator(INCOMING_ROW)).toHaveCount(incomingRows(ENTITY))
    await expect(page.locator(INCOMING_ROW).first()).toBeVisible()
    await expect(page.locator(CONTEXT_LINK)).toHaveCount(CONTEXT_LEVELS)
    await expect(page.locator(CONTEXT_LINK).first()).toBeVisible()

    // The markup is unchanged by all this: the sections still carry `hidden`, and the
    // reveal is a stylesheet a browser with scripting enabled never parses. So a
    // crawler reads exactly the same HTML either way — §2.1's rule is about the bytes.
    expect(
      await sections.evaluateAll((nodes) => nodes.filter((node) => node.hasAttribute('hidden')).length),
    ).toBe(SECTION_COUNT)

    // Every title is on the page too, and — this is the part a count cannot say —
    // beside the content it names rather than in the block the pinned header holds
    // them all in. Read as geometry, pair by pair, in the order the reader meets
    // them: title, its own section, the next title. The subject of a level-2 panel IS
    // its title, so a term panel that lost it would be a list of references to
    // nothing.
    await expect(page.locator(PANEL_TITLE)).toHaveCount(SECTION_COUNT)
    await expect(page.locator(PANEL_HEADER)).toHaveCSS('display', 'contents')
    const pairs = await page.evaluate(
      ({ panelId, titleClass }) => {
        const panel = document.getElementById(panelId)!
        const titles = [...panel.querySelectorAll<HTMLElement>(`.${titleClass}`)]
        const sections = [...panel.querySelectorAll<HTMLElement>('[data-kb-panel-kind]')]
        return titles.map((title, index) => {
          const titleBox = title.getBoundingClientRect()
          const sectionBox = sections[index].getBoundingClientRect()
          const nextTitle = titles[index + 1]?.getBoundingClientRect()
          return {
            labelled: sections[index].getAttribute('aria-labelledby') === title.id,
            shown: titleBox.height > 0,
            leadsIt: titleBox.bottom <= sectionBox.top,
            andEndsBeforeTheNext: nextTitle ? sectionBox.bottom <= nextTitle.top : true,
          }
        })
      },
      { panelId: 'kb-panel', titleClass: 'panel_title' },
    )
    expect(pairs).toHaveLength(SECTION_COUNT)
    expect(
      pairs.filter(
        (pair) => pair.labelled && pair.shown && pair.leadsIt && pair.andEndsBeforeTheNext,
      ),
    ).toHaveLength(SECTION_COUNT)

    // And none of the interactive layer, which is client-only by construction.
    await expect(page.locator(STACK)).toHaveCount(0)
    await expect(page.locator(OVERLAY)).toHaveCount(0)
    await expect(page.locator(MARKER)).toHaveCount(0)
  })

  test('a proof page opens with the link up to its theorem, above the label', async ({
    page,
  }) => {
    await page.goto(PROOF_URL)

    /*
      Reading order, in the served HTML: the one link UP leads the header, above the
      <h1>, and the list below the body carries only what this page owns (§6.1 as
      amended). A proof's <h1> is the bare type label — "Bizonyítás" — so the theorem
      it proves is the first thing the reader needs; at the end of the body it is the
      last.

      Geometry rather than DOM order, because "above" is the claim: the link's box ends
      before the heading's begins, and both are inside the article's header.
    */
    const order = await page.evaluate(() => {
      const header = document.querySelector('.kb-entity-page_header')!
      const list = header.querySelector('.ownership-links_parent')!
      const link = list.querySelector('.ownership-links_link')
      const heading = header.querySelector('h1')!
      const rule = getComputedStyle(list).borderBottomWidth
      return {
        hasLink: link !== null,
        href: link?.getAttribute('href') ?? '',
        arrow: link?.querySelector('.ownership-links_arrow')?.textContent ?? '',
        above: link!.getBoundingClientRect().bottom <= heading.getBoundingClientRect().top,
        rule,
        // The down half, below the body: this proof has a remark of its own on some
        // pages and none here, and either way no link in it points up.
        upLinksBelow: [...document.querySelectorAll('.ownership-links_links .ownership-links_arrow')]
          .filter((element) => element.textContent === '↑').length,
      }
    })

    expect(order.hasLink).toBe(true)
    expect(order.href).toBe(ENTITY)
    expect(order.arrow).toBe('↑')
    expect(order.above).toBe(true)
    // The hairline BELOW the link, closing it off from the label rather than from the
    // breadcrumb row above it (`ownership-links.module.scss`).
    expect(order.rule).toBe('1px')
    expect(order.upLinksBelow).toBe(0)
  })

  test('the glossary, both index lists and the root page are complete', async ({ page }) => {
    // No panel and no chrome on any of these (§2): the only client component is the
    // filter, and it hides rows of a list the server rendered rather than producing
    // one. With nothing to hide them, every row is on the page.
    for (const [url, rows] of [
      [GLOSSARY, fixtures.lists.glossaryRows],
      [DEFINITIONS, fixtures.lists.definitionRows],
      [THEOREMS, fixtures.lists.theoremRows],
    ] as const) {
      await page.goto(url)
      await expect(page.locator(ROW)).toHaveCount(rows)
      await expect(page.locator(ROW).first()).toBeVisible()
      await expect(page.locator(ROW).last()).toBeVisible()
      await expect(page.locator(`${ROW} a`).first()).toBeVisible()
      await expect(page.locator(PANEL)).toHaveCount(0)
      await expect(page.locator(STACK)).toHaveCount(0)
    }

    await page.goto(ROOT)
    const cards = page.locator('.kb-section-cards_card')
    await expect(cards).toHaveCount(3)
    await expect(cards.first()).toBeVisible()
    await expect(page.locator(STACK)).toHaveCount(0)
  })
})

test.describe('with JavaScript', () => {
  test('the no-JavaScript reveal does not reach the reader who has it', async ({ page }) => {
    await openEntity(page)

    // The same page, the same served `<noscript>`, and none of it applied: the sheet
    // is fixed off the bottom edge and every section is hidden, exactly as the panel's
    // own suite requires. A browser with scripting enabled does not parse a
    // `<noscript>`'s contents as markup, and this is that fact asserted rather than
    // assumed.
    await expect(page.locator(PANEL)).toHaveCSS('position', 'fixed')
    await expect(page.locator(PANEL)).toHaveCSS('visibility', 'hidden')
    await expect(page.locator(PANEL)).toBeHidden()
    await expect(page.locator(SECTION)).toHaveCount(SECTION_COUNT)
    expect(
      await page
        .locator(SECTION)
        .evaluateAll((nodes) =>
          nodes.filter((node) => (node as HTMLElement).offsetParent !== null).length,
        ),
    ).toBe(0)
    // The header is a block that holds one caption still over the scroller, as it is
    // for everyone who can open the panel — not the dissolved `display: contents` the
    // no-JavaScript stylesheet turns it into — and not one of its titles is showing.
    await expect(page.locator(PANEL_HEADER)).toHaveCSS('display', 'block')
    await expect(page.locator(PANEL_TITLE)).toHaveCount(SECTION_COUNT)
    expect(
      await page
        .locator(PANEL_TITLE)
        .evaluateAll((nodes) =>
          nodes.filter((node) => (node as HTMLElement).offsetParent !== null).length,
        ),
    ).toBe(0)
  })

  /**
   * The one path the served HTML does not cover.
   *
   * On a soft navigation the `<noscript>` is rendered by the client rather than by the
   * server, and React treats a `<noscript>`'s children as text — which is why it is
   * written as raw markup rather than as an element (see `Panel`). This is that path:
   * an ownership link to the proof, which is another entity page with a panel of its
   * own, followed without a document load.
   */
  test('a soft navigation to another entity page renders it without complaint', async ({
    page,
  }) => {
    const noise: string[] = []
    page.on('console', (message) => {
      if (message.type() === 'error' || message.type() === 'warning') {
        noise.push(`${message.type()}: ${message.text()}`)
      }
    })
    page.on('pageerror', (error) => noise.push(`pageerror: ${error.message}`))

    await openEntity(page)
    await page.locator(OWNERSHIP).click()
    await expect(page).toHaveURL(new RegExp(`${PROOF_URL}$`))
    await expect(chromeButton(page, MENU)).toBeVisible()

    // The proof's own panel, closed and fixed exactly as the entity's was: the
    // stylesheet the client rendered reaches no further than the served one did.
    await expect(page.locator(PANEL)).toHaveCSS('position', 'fixed')
    await expect(page.locator(PANEL)).toBeHidden()

    // …and the reveal came with it: the `<noscript>` on this page was rendered by the
    // client rather than parsed from the served HTML, and it carries the same
    // stylesheet. Read as text, because that is what a `<noscript>`'s contents are to
    // a browser that has scripting.
    expect(
      await page.locator('main noscript').first().evaluate((node) => node.textContent ?? ''),
    ).toContain('#kb-panel')
    expect(noise).toEqual([])
  })
})
