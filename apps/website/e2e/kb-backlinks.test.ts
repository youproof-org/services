import { expect, test, type Page } from '@playwright/test'
import { fixtures } from './support/fixtures'

/**
 * Bejövő hivatkozások: the panel's hardest content (sub-plan §7.2).
 *
 * What needs a browser here is the two ends of the range. The list is one design
 * for five rows and for two hundred and thirty-six, and whether that actually holds
 * is a question about a live layout: does the long list scroll inside the panel
 * rather than moving the page, does its last row come to rest clear of the Vissza
 * pill that sits over the sheet, and does the header stay put while it does. The
 * stylesheet cannot be read for those answers.
 *
 * The rest is about what is in the served HTML: the rows are inbound edges of the
 * knowledge graph, so §2.1 puts them in the page from the first byte, and the
 * JavaScript-disabled case below is what a crawler is served.
 *
 * Every count comes from the content graph (`e2e/support/derive-fixtures.mjs`). A
 * deployed build drops the sources whose own page it does not generate, so the same
 * list is 236 rows locally and 212 on staging; a number written down here would pin
 * the suite to one of the two, and one read off the page under test would compare the
 * page to itself.
 *
 * A row is not the same thing as a source. The list is grouped chapter → section →
 * embedded entity, and a container that cites nothing itself still earns a row.
 *
 * A row reads as three lines — the numbered name of the place it leads to, the
 * ownership chain below it on the rows that have one, then the count — so what used
 * to be asserted about a kind label is asserted about that first line here.
 *
 * Conventions from `kb-panel.test.ts`: settle the consent decision first, scope the
 * chrome's buttons to the stack, and match accessible names exactly — the site
 * header's hamburger is also called "Menü".
 */

/** The longest inbound list in the build, and everything the graph says about it. */
const LONGEST = fixtures.busiest
const BUSIEST = LONGEST.url
/** The short end of the same list: a handful of rows, still grouped, with a proof in it. */
const SHORT = fixtures.shortList
/** Nothing cites it — the empty state, which is most of the pages this build generates. */
const NOTHING_CITES_IT = fixtures.uncited.url
/**
 * `gyuru-test` specifically, for the one case below that is about ITS data rather than
 * about the shape of a list: three of its rows are titled "Oszthatóság". It has a page
 * in every build mode, so naming it costs nothing.
 */
const SHARED_TITLES = '/hu/tudasbazis/definiciok/gyuru-test'

const MENU = 'Menü'
const BACK = 'Vissza'
const INCOMING = 'Bejövő hivatkozások'

const PANEL = '#kb-panel'
const PANEL_BODY = '#kb-panel .panel_body'
const PANEL_HEADER = '#kb-panel .panel_header'
/**
 * One row of the UNFILTERED list. `next.config.ts` names a module class
 * `<file>_<local>`.
 *
 * Scoped to the `incoming` section rather than to the panel, because the panel is
 * not one list any more: §7.2's filtered variants are the same component with the
 * same classes, and a page carries one per term and one per claim (§6.3, level 2),
 * all server-rendered beside this one. `e2e/kb-select.test.ts` is where those are
 * counted; everything here is about the unfiltered case.
 */
const ROW = '#kb-panel [data-kb-panel-kind="incoming"] .backlinks-panel_link'
/** Only the chapters: the top level of the tree, whatever is nested under them. */
const TOP_ROW = `${ROW}[data-backlink-depth="0"]`
const EMPTY = '#kb-panel [data-kb-panel-kind="incoming"] .backlinks-panel_empty'
/** A row's first line: the numbered name of the place it leads to. Every row has one. */
const LABEL = `${ROW} .backlinks-panel_label`
/** Its second line, on the proof and remark rows that have an ownership chain below them. */
const OWNERSHIP = `${ROW} .backlinks-panel_ownership`

function stack(page: Page) {
  return page.locator('.menu-stack_stack')
}

function chromeButton(page: Page, name: string) {
  return stack(page).getByRole('button', { name, exact: true })
}

async function settleConsent(page: Page) {
  const reject = page.getByRole('button', { name: 'Elutasítom', exact: true })
  await reject.click()
  await expect(reject).toBeHidden()
}

/** Open an entity, then Menü → Bejövő hivatkozások, and wait out the slide. */
async function openBacklinks(page: Page, url: string) {
  await page.goto(url)
  await settleConsent(page)
  await chromeButton(page, MENU).click()
  await chromeButton(page, INCOMING).click()
  // Settled, not merely visible: the panel is visible the instant it starts moving,
  // so a geometry assertion taken before this measures the sheet in mid-air.
  await expect
    .poll(() =>
      page.evaluate(
        (selector) => document.querySelector(selector)!.getBoundingClientRect().top,
        PANEL,
      ),
    )
    .toBe(page.viewportSize()!.height / 2)
}

test.describe('the Bejövő hivatkozások panel', () => {
  test('is one row per source, grouped chapter → section → embedded entity', async ({
    page,
  }) => {
    await openBacklinks(page, BUSIEST)

    await expect(
      page.locator(PANEL).getByRole('heading', { name: 'Hol hivatkoznak rá', exact: true }),
    ).toBeVisible()

    const rows = page.locator(ROW)
    await expect(rows).toHaveCount(LONGEST.rows)

    // Three levels and no more, and each one is the kind of place it should be: a
    // chapter at the top, its sections under it, the entities embedded in them under
    // those. Every entity is embedded in a section, which is why no entity comes out
    // at depth 1.
    const byDepth = await rows.evaluateAll((links) => {
      const seen: Record<string, Set<string>> = {}
      for (const link of links) {
        const depth = link.getAttribute('data-backlink-depth')!
        ;(seen[depth] ??= new Set()).add(link.getAttribute('data-backlink-source')!)
      }
      return Object.fromEntries(Object.entries(seen).map(([depth, kinds]) => [depth, [...kinds].sort()]))
    })
    expect(byDepth).toEqual(LONGEST.kindsByDepth)

    // Ordered by count descending WITHIN a level (§7.2) — the tree is not one ordered
    // list, and a check that read the counts straight down the rendered rows would be
    // asserting the wrong thing. Read off the rendered rows rather than asserted one
    // by one: the point is the ordering, not each individual number.
    const rendered = await rows.evaluateAll((links) =>
      links.map((link) => ({
        depth: Number(link.getAttribute('data-backlink-depth')),
        count: Number(link.querySelector('[data-backlink-count]')!.getAttribute('data-backlink-count')),
      })),
    )
    for (const [i, row] of rendered.entries()) {
      const previous = rendered[i - 1]
      if (previous?.depth === row.depth) {
        expect(previous.count, `row ${i} is out of order within its level`).toBeGreaterThanOrEqual(row.count)
      }
    }

    // The accumulation, as the one sum that can check it: every reference is counted
    // exactly once at the top level, because every source is inside some chapter.
    const top = rendered.filter((row) => row.depth === 0)
    expect(top).toHaveLength(LONGEST.topRows)
    expect(top.reduce((total, row) => total + row.count, 0)).toBe(LONGEST.topCountSum)
    expect(top[0].count).toBe(LONGEST.topFirstCount)

    // …and no row promises less than what is nested under it. Walked as a stack,
    // because "nested under" is depth in the rendered order.
    const ancestors: number[] = []
    for (const row of rendered) {
      ancestors.length = row.depth
      for (const above of ancestors) expect(above).toBeGreaterThanOrEqual(row.count)
      ancestors.push(row.count)
    }

    // A source is an entity, a section OR a chapter, all in one list (§7.2).
    const kinds = await rows.evaluateAll((links) =>
      [...new Set(links.map((link) => link.getAttribute('data-backlink-source')))].sort(),
    )
    expect(kinds).toEqual(LONGEST.kinds)

    // The heaviest place is a chapter, and its row is a link to the chapter page —
    // the count is inside the link, so the whole row is the target. Its name is
    // asserted as far as its number: the rest goes through `InlineText`, so a title
    // carrying math is elements rather than the string the graph holds.
    const first = rows.first()
    await expect(first).toHaveAttribute('href', LONGEST.firstHref!)
    await expect(first.locator('.backlinks-panel_label')).toHaveText(
      new RegExp(`^${LONGEST.firstNumberPrefix.replace(/\./g, '\\.')}\\s`),
    )
    await expect(first).toContainText(`${LONGEST.topFirstCount} hivatkozás`)
  })

  test('every row names the place it leads to, numbered as the book numbers it', async ({
    page,
  }) => {
    await openBacklinks(page, BUSIEST)

    // One first line per row rather than one per list, and a second line only on the
    // proofs and the remarks — the rows whose page hangs off a definition or a theorem
    // rather than being one.
    await expect(page.locator(ROW)).toHaveCount(LONGEST.rows)
    await expect(page.locator(LABEL)).toHaveCount(LONGEST.rows)
    await expect(page.locator(OWNERSHIP)).toHaveCount(LONGEST.ownershipRows)

    // What kind of thing a source is is still on the row — that is what the row's
    // number format and its type word say — so this is the same property the kind
    // label used to carry, read off the lines that carry it now. Grouped rather than
    // compared row by row: a row whose lines disagreed with its `data-backlink-source`
    // would put a second entry in that kind's set and fail here, which makes this one
    // assertion per row in the shape of one.
    //
    // `number` is the leading index with its digits blanked, so the shape is asserted
    // and not the particular numbers; `typeWord` is what stands between the index and
    // the title, which only an entity has.
    const linesByKind = await page.locator(ROW).evaluateAll((links) => {
      const seen: Record<string, Record<string, Set<string>>> = {}
      for (const link of links) {
        const kind = link.getAttribute('data-backlink-source')!
        const label = link.querySelector('.backlinks-panel_label')!.textContent!.trim()
        const ownership = link.querySelector('.backlinks-panel_ownership')?.textContent?.trim()
        const index = /^\d+(?:\.\d+)*\./.exec(label)
        const entry = (seen[kind] ??= { number: new Set(), typeWord: new Set(), ownership: new Set() })
        entry.number.add(index ? index[0].replace(/\d+/g, 'n') : '(none)')
        entry.typeWord.add(/^\d+(?:\.\d+)*\.\s([^:]+):/.exec(label)?.[1] ?? '(none)')
        entry.ownership.add(ownership ?? '(none)')
      }
      return Object.fromEntries(
        Object.entries(seen).map(([kind, sets]) => [
          kind,
          Object.fromEntries(Object.entries(sets).map(([key, values]) => [key, [...values].sort()])),
        ]),
      )
    })
    // The graph's own projection of the same rows, so this compares what the page
    // renders against what the data layer says — a chapter's number is a single index
    // and a section's is two, which is what tells those two apart now that neither
    // says its kind in words, and an entity's type word is the AUTHORED one where the
    // content has one (a Lemma or a Következmény rather than a Tétel).
    expect(linesByKind).toEqual(LONGEST.linesByKind)
  })

  test('rows that share a title are told apart by the lines above their counts', async ({
    page,
  }) => {
    await openBacklinks(page, SHARED_TITLES)

    // The case that used to need a kind label. Three of `gyuru-test`'s rows are titled
    // "Oszthatóság": the section of the book, whose 34 include the 14 its own narrative
    // writes, the definition of that name, which cites it twice, and the remark on that
    // definition, which cites it twice as well. The number does not separate them —
    // chapter 16's first section and its first definition are both "16.1." — the type
    // word and the ownership line do.
    const titled = page.locator(ROW).filter({
      has: page.locator('.backlinks-panel_label', {
        hasText: /^16\.1\. (Definíció: )?Oszthatóság$/,
      }),
    })
    await expect(titled).toHaveCount(3)

    const lines = await titled.evaluateAll((links) =>
      links.map((link) => ({
        label: link.querySelector('.backlinks-panel_label')!.textContent!.trim(),
        ownership: link.querySelector('.backlinks-panel_ownership')?.textContent?.trim() ?? null,
        count: link.querySelector('[data-backlink-count]')!.getAttribute('data-backlink-count'),
        href: link.getAttribute('href'),
      })),
    )
    expect(lines).toEqual([
      {
        label: '16.1. Oszthatóság',
        ownership: null,
        count: '34',
        href: '/hu/konyvek/alice-es-bob/fejezetek/alice-es-bob-alaptetele#szakaszok.oszthatosag',
      },
      {
        label: '16.1. Definíció: Oszthatóság',
        ownership: 'megjegyzés',
        count: '2',
        href: '/hu/tudasbazis/definiciok/oszthatosag/megjegyzesek/1',
      },
      {
        label: '16.1. Definíció: Oszthatóság',
        ownership: null,
        count: '2',
        href: '/hu/tudasbazis/definiciok/oszthatosag',
      },
    ])
    // No two rows of the list read alike: measured over the export, no list has two
    // rows sharing these lines, where 10 groups of rows shared a title and a kind under
    // the previous design.
    const readings = await page.locator(ROW).evaluateAll((links) =>
      links.map(
        (link) =>
          `${link.querySelector('.backlinks-panel_label')!.textContent}|` +
          `${link.querySelector('.backlinks-panel_ownership')?.textContent ?? ''}`,
      ),
    )
    expect(new Set(readings).size).toBe(readings.length)
  })

  test('the long list scrolls inside the panel, under a header that stays put', async ({ page }) => {
    await openBacklinks(page, BUSIEST)

    const body = page.locator(PANEL_BODY)
    // The list really does overflow: the assertions below would pass vacuously on a
    // list that fit.
    const overflow = await body.evaluate((el) => el.scrollHeight - el.clientHeight)
    expect(overflow).toBeGreaterThan(1000)

    const headerTop = (await page.locator(PANEL_HEADER).boundingBox())!.y

    // The wheel, over the panel, so a page that was not actually locked would move.
    await page.mouse.move(400, 600)
    await page.mouse.wheel(0, 500)

    await expect.poll(() => body.evaluate((el) => el.scrollTop)).toBeGreaterThan(0)
    expect(await page.evaluate(() => window.scrollY)).toBe(0)
    expect((await page.locator(PANEL_HEADER).boundingBox())!.y).toBe(headerTop)
  })

  test('the last row comes to rest clear of the Vissza pill over the sheet', async ({ page }) => {
    await openBacklinks(page, BUSIEST)

    // All the way down, which is the only place the bottom padding matters.
    const body = page.locator(PANEL_BODY)
    await body.evaluate((el) => {
      el.scrollTop = el.scrollHeight
    })
    await expect.poll(() => body.evaluate((el) => el.scrollHeight - el.scrollTop - el.clientHeight)).toBe(0)

    // §6.2 keeps the Vissza button in the same corner whatever state the page is
    // in, so it sits OVER the panel; `.panel_body`'s bottom padding is what stops a
    // row resting underneath it.
    const lastRow = (await page.locator(ROW).last().boundingBox())!
    const pill = (await chromeButton(page, BACK).boundingBox())!
    expect(lastRow.y + lastRow.height).toBeLessThanOrEqual(pill.y)
  })

  test('two sources are the same list, just shorter — and still in their places', async ({
    page,
  }) => {
    await openBacklinks(page, SHORT.url)

    // A couple of sources, but more rows than that: each one is shown inside the
    // section and the chapter it belongs to. Grouping is not a treatment reserved for
    // the long case — there is one design (§6.4).
    const rows = page.locator(ROW)
    await expect(rows).toHaveCount(SHORT.rows)
    await expect(page.locator(TOP_ROW)).toHaveCount(SHORT.topRows)
    // No separate design for the short case: the same row, the same count, and a
    // container that carries the references under it.
    await expect(rows.first()).toContainText(`${SHORT.firstCount} hivatkozás`)
    await expect(rows.first().locator('.backlinks-panel_label')).toHaveText(
      new RegExp(`^${SHORT.firstNumberPrefix.replace(/\./g, '\\.')}\\s`),
    )
    // …including its proof row, which names the theorem its page belongs to — number
    // and type word — and then says it is the proof of it, the same two lines the long
    // list's proof rows carry.
    const proof = rows.nth(SHORT.proofRow.index)
    await expect(proof).toHaveAttribute('data-backlink-source', 'proof')
    await expect(proof.locator('.backlinks-panel_label')).toHaveText(
      new RegExp(`^${SHORT.proofRow.numberPrefix.replace(/\./g, '\\.')}\\s${SHORT.proofRow.typeWord}:`),
    )
    await expect(proof.locator('.backlinks-panel_ownership')).toHaveText(SHORT.proofRow.ownership)
    await expect(page.locator(EMPTY)).toHaveCount(0)
  })

  test('an entity nothing cites answers so, rather than showing an empty list', async ({
    page,
  }) => {
    await openBacklinks(page, NOTHING_CITES_IT)

    // The item is on every entity page (§6.5), so this is a main case, not an edge
    // one: 244 of the 537 pages this build generates land here.
    await expect(page.locator(EMPTY)).toHaveText('Nincs rá hivatkozás')
    await expect(page.locator(ROW)).toHaveCount(0)
    // …and it is the panel answering, not the panel failing to open.
    await expect(page.locator(PANEL)).toBeVisible()
    await expect(
      page.locator(PANEL).getByRole('heading', { name: 'Hol hivatkoznak rá', exact: true }),
    ).toBeVisible()
  })

  test('a row navigates to its source', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))

    await openBacklinks(page, BUSIEST)
    // §6.4: panel content is what the reader is meant to be acting on, so its links
    // are ordinary links. This also unmounts the panel while its nodes live under
    // <body> — React's own removal would throw if the adoption had not put them back.
    await page.locator(ROW).first().click()

    await expect(page).toHaveURL(
      /\/hu\/konyvek\/alice-es-bob\/fejezetek\/alice-es-bob-alaptetele$/,
    )
    expect(errors, 'navigating away from an open panel threw').toEqual([])
  })
})

test.describe('the backlink list without JavaScript', () => {
  test.use({ javaScriptEnabled: false })

  test('every row is served in the HTML, inside the page and shown inline', async ({
    page,
  }) => {
    await page.goto(BUSIEST)

    // Nothing runs here, so this is exactly what a crawler is served (§2.1/D6). The
    // inbound edges of the graph are the reason the panel is server-rendered at all.
    await expect(page.locator(`main ${PANEL}`)).toHaveCount(1)
    // And on screen, not behind a sheet that cannot open: §2.1 asks the page to
    // degrade to a long page with everything visible, and this is the long case
    // (`noJsCss` in components/kb/Panel.tsx, census in `e2e/kb-sweep.test.ts`).
    await expect(page.locator(PANEL)).toBeVisible()

    const rows = page.locator(ROW)
    await expect(rows).toHaveCount(LONGEST.rows)
    await expect(rows.first()).toBeVisible()
    await expect(rows.last()).toBeVisible()
    // First and last in the served order, which is the tree walked pre-order: `<li>`s
    // with their nested `<ul>`s inside them.
    await expect(rows.first()).toHaveAttribute('href', LONGEST.firstHref!)
    await expect(rows.last()).toHaveAttribute('href', LONGEST.lastHref!)
    // The grouping is served too, not something the client builds: the nesting is
    // `<ul>`s inside `<li>`s, which is the containment a crawler reads (§2.1).
    await expect(page.locator(TOP_ROW)).toHaveCount(LONGEST.topRows)
    await expect(
      page.locator('#kb-panel [data-kb-panel-kind="incoming"] .backlinks-panel_nested'),
    ).toHaveCount(LONGEST.nestedRows)
    // Both display lines are part of that served answer rather than something the
    // client adds, and the heaviest place is named with its number.
    await expect(page.locator(LABEL)).toHaveCount(LONGEST.rows)
    await expect(page.locator(OWNERSHIP)).toHaveCount(LONGEST.ownershipRows)
    await expect(rows.first().locator('.backlinks-panel_label')).toHaveText(
      new RegExp(`^${LONGEST.firstNumberPrefix.replace(/\./g, '\\.')}\\s`),
    )
  })

  test('an entity nothing cites is served the empty state, not an empty list', async ({ page }) => {
    await page.goto(NOTHING_CITES_IT)

    await expect(page.locator(EMPTY)).toHaveText('Nincs rá hivatkozás')
    await expect(page.locator(ROW)).toHaveCount(0)
  })
})
