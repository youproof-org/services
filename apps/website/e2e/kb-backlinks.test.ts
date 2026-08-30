import { expect, test, type Page } from '@playwright/test'

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
 * Row counts are the LOCAL export's — `pnpm test:e2e` runs against `pnpm build`
 * (see package.json). A deployed build drops the sources whose own page it does not
 * generate, which takes `gyuru-test` from 222 sources to 207 (§9.1 notes 2–3).
 *
 * A row is not the same thing as a source any more. The list is grouped chapter →
 * section → embedded entity, and a container that cites nothing itself still earns a
 * row, so `gyuru-test`'s 222 sources are 236 rows: 14 chapters, 60 sections and 162
 * entities.
 *
 * A row reads as three lines — the numbered name of the place it leads to, the
 * ownership chain below it on the 96 rows that have one, then the count — so what used
 * to be asserted about a kind label is asserted about that first line here.
 *
 * Conventions from `kb-panel.test.ts`: settle the consent decision first, scope the
 * chrome's buttons to the stack, and match accessible names exactly — the site
 * header's hamburger is also called "Menü".
 */

/**
 * The entity with the most inbound references in the content: 222 sources in 236
 * rows, 548 references.
 */
const BUSIEST = '/hu/tudasbazis/definiciok/gyuru-test'
/** Two sources, one reference each, in five rows — the short end of the same list. */
const TWO_ROWS = '/hu/tudasbazis/definiciok/csoporthomomorfizmus'
/** Nothing cites it, which is 244 of the 537 pages this build generates (§9.1 note 1). */
const NOTHING_CITES_IT = '/hu/tudasbazis/definiciok/csoporthomomorfizmus-magja-es-kepe'

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
    await expect(rows).toHaveCount(236)

    // Three levels and no more, and each one is the kind of place it should be: a
    // chapter at the top, its sections under it, the entities embedded in them under
    // those. Every one of the 537 entities is embedded in a section, which is why no
    // entity comes out at depth 1.
    const byDepth = await rows.evaluateAll((links) => {
      const seen: Record<string, Set<string>> = {}
      for (const link of links) {
        const depth = link.getAttribute('data-backlink-depth')!
        ;(seen[depth] ??= new Set()).add(link.getAttribute('data-backlink-source')!)
      }
      return Object.fromEntries(Object.entries(seen).map(([depth, kinds]) => [depth, [...kinds].sort()]))
    })
    expect(byDepth).toEqual({
      '0': ['chapter'],
      '1': ['section'],
      '2': ['definition', 'proof', 'remark', 'theorem'],
    })

    // Ordered by count descending WITHIN a level (§7.2) — the tree is not one ordered
    // list, and a check that read the counts straight down the rendered rows would be
    // asserting the wrong thing. Read off the rendered rows rather than asserted one
    // by one: the point is the ordering, not 236 individual numbers.
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
    // 222 sources, 548 references, 14 chapters holding all of them.
    const top = rendered.filter((row) => row.depth === 0)
    expect(top).toHaveLength(14)
    expect(top.reduce((total, row) => total + row.count, 0)).toBe(548)
    expect(top[0].count).toBe(135)

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
    expect(kinds).toEqual(['chapter', 'definition', 'proof', 'remark', 'section', 'theorem'])

    // The heaviest place is a chapter, and its row is a link to the chapter page —
    // the count is inside the link, so the whole row is the target.
    const first = rows.first()
    await expect(first).toHaveAttribute(
      'href',
      '/hu/konyvek/alice-es-bob/fejezetek/alice-es-bob-alaptetele',
    )
    await expect(first).toContainText('16. Alice és Bob alaptétele')
    await expect(first).toContainText('135 hivatkozás')
  })

  test('every row names the place it leads to, numbered as the book numbers it', async ({
    page,
  }) => {
    await openBacklinks(page, BUSIEST)

    // One first line per row rather than one per list: 236 rows, 236 names. And 96
    // second lines — the proofs and the remarks, which are the rows whose page hangs
    // off a definition or a theorem rather than being one.
    await expect(page.locator(ROW)).toHaveCount(236)
    await expect(page.locator(LABEL)).toHaveCount(236)
    await expect(page.locator(OWNERSHIP)).toHaveCount(96)

    // What kind of thing a source is is still on the row — that is what the row's
    // number format and its type word say — so this is the same property the kind
    // label used to carry, read off the lines that carry it now. Grouped rather than
    // compared row by row: a row whose lines disagreed with its `data-backlink-source`
    // would put a second entry in that kind's set and fail here, which makes this 236
    // assertions in the shape of one.
    //
    // `number` is the leading index with its digits blanked, so the shape is asserted
    // and not 236 particular numbers; `typeWord` is what stands between the index and
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
    expect(linesByKind).toEqual({
      // A chapter's number is a single index and a section's is two, which is what
      // tells those two apart now that neither says its kind in words.
      chapter: { number: ['n.'], typeWord: ['(none)'], ownership: ['(none)'] },
      section: { number: ['n.n.'], typeWord: ['(none)'], ownership: ['(none)'] },
      // An entity carries its type word inside its label, and it is the AUTHORED one
      // where the content has one: three of these rows are a Lemma and one a
      // Következmény rather than a Tétel (`labels.canonical`, via `kbNodeLabel`).
      definition: { number: ['n.n.'], typeWord: ['Definíció'], ownership: ['(none)'] },
      theorem: {
        number: ['n.n.'],
        typeWord: ['Következmény', 'Lemma', 'Tétel'],
        ownership: ['(none)'],
      },
      // A proof and a remark name the definition or theorem their page belongs to, so
      // their first line is one of those and the second line is which of its children
      // the row leads to. One remark in this list is attached to a proof rather than
      // to the theorem, and its line carries the whole chain.
      proof: {
        number: ['n.n.'],
        typeWord: ['Következmény', 'Lemma', 'Tétel'],
        ownership: ['bizonyítás'],
      },
      remark: {
        number: ['n.n.'],
        typeWord: ['Definíció', 'Tétel'],
        ownership: ['bizonyítás → megjegyzés', 'megjegyzés'],
      },
    })
  })

  test('rows that share a title are told apart by the lines above their counts', async ({
    page,
  }) => {
    await openBacklinks(page, BUSIEST)

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
        href: '/hu/tudasbazis/definiciok/oszthatosag/megjegyzesek/oszthatosag-megjegyzes',
      },
      {
        label: '16.1. Definíció: Oszthatóság',
        ownership: null,
        count: '2',
        href: '/hu/tudasbazis/definiciok/oszthatosag',
      },
    ])
    // No two rows of the list read alike: measured over the local export, no list has
    // two rows sharing these lines, where 10 groups of rows shared a title and a kind
    // under the previous design.
    const readings = await page.locator(ROW).evaluateAll((links) =>
      links.map(
        (link) =>
          `${link.querySelector('.backlinks-panel_label')!.textContent}|` +
          `${link.querySelector('.backlinks-panel_ownership')?.textContent ?? ''}`,
      ),
    )
    expect(new Set(readings).size).toBe(readings.length)
  })

  test('the 236 rows scroll inside the panel, under a header that stays put', async ({ page }) => {
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
    await openBacklinks(page, TWO_ROWS)

    // Two sources, but five rows: a proof and a section, each shown inside the
    // section and the chapter it belongs to. Grouping is not a treatment reserved for
    // the long case — there is one design (§6.4).
    const rows = page.locator(ROW)
    await expect(rows).toHaveCount(5)
    await expect(page.locator(TOP_ROW)).toHaveCount(2)
    // No separate design for the short case: the same row, the same count, and a
    // container that carries the one reference under it.
    await expect(rows.first()).toContainText('1 hivatkozás')
    await expect(rows.first()).toContainText('25. Alice és Bob fontos párhuzamokat talál')
    // …including the third row, a proof, which names its theorem and then says it is
    // the proof of it — the same two lines the long list's proof rows carry.
    await expect(rows.nth(2)).toContainText('25.22. Tétel: Ciklikus csoportok struktúratétele')
    await expect(rows.nth(2)).toContainText('bizonyítás')
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

  test('all 236 rows are served in the HTML, inside the page and shown inline', async ({
    page,
  }) => {
    await page.goto(BUSIEST)

    // Nothing runs here, so this is exactly what a crawler is served (§2.1/D6). The
    // inbound edges of the graph are the reason the panel is server-rendered at all.
    await expect(page.locator(`main ${PANEL}`)).toHaveCount(1)
    // And on screen, not behind a sheet that cannot open: §2.1 asks the page to
    // degrade to a long page with everything visible, and 236 rows is the long case
    // (`noJsCss` in components/kb/Panel.tsx, census in `e2e/kb-sweep.test.ts`).
    await expect(page.locator(PANEL)).toBeVisible()

    const rows = page.locator(ROW)
    await expect(rows).toHaveCount(236)
    await expect(rows.first()).toBeVisible()
    await expect(rows.last()).toBeVisible()
    await expect(rows.first()).toHaveAttribute(
      'href',
      '/hu/konyvek/alice-es-bob/fejezetek/alice-es-bob-alaptetele',
    )
    await expect(rows.last()).toHaveAttribute(
      'href',
      '/hu/tudasbazis/tetelek/miller-rabin-szorzat/bizonyitasok/miller-rabin-szorzat-bizonyitas',
    )
    // The grouping is served too, not something the client builds: the nesting is
    // `<ul>`s inside `<li>`s, which is the containment a crawler reads (§2.1).
    await expect(page.locator(TOP_ROW)).toHaveCount(14)
    await expect(
      page.locator('#kb-panel [data-kb-panel-kind="incoming"] .backlinks-panel_nested'),
    ).toHaveCount(57)
    // Both display lines are part of that served answer rather than something the
    // client adds: 236 names, 96 ownership lines, and the heaviest place named and
    // numbered as chapter 16.
    await expect(page.locator(LABEL)).toHaveCount(236)
    await expect(page.locator(OWNERSHIP)).toHaveCount(96)
    await expect(rows.first()).toContainText('16. Alice és Bob alaptétele')
  })

  test('an entity nothing cites is served the empty state, not an empty list', async ({ page }) => {
    await page.goto(NOTHING_CITES_IT)

    await expect(page.locator(EMPTY)).toHaveText('Nincs rá hivatkozás')
    await expect(page.locator(ROW)).toHaveCount(0)
  })
})
