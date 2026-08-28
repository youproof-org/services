import { expect, test, type Page } from '@playwright/test'

/**
 * Bejövő hivatkozások: the panel's hardest content (sub-plan §7.2).
 *
 * What needs a browser here is the two ends of the range. The list is one design
 * for two rows and for two hundred and twenty-two, and whether that actually holds
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
 * Conventions from `kb-panel.test.ts`: settle the consent decision first, scope the
 * chrome's buttons to the stack, and match accessible names exactly — the site
 * header's hamburger is also called "Menü".
 */

/** The entity with the most inbound references in the content: 222 sources, 548 references. */
const BUSIEST = '/hu/tudasbazis/definiciok/gyuru-test'
/** Two sources, one reference each — the short end of the same list. */
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
const EMPTY = '#kb-panel [data-kb-panel-kind="incoming"] .backlinks-panel_empty'
/** The kind label under a row's title — every row has one, whatever kind it is. */
const KIND = `${ROW} .backlinks-panel_kind`

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
  test('is one row per source, count first, with chapters and sections among the entities', async ({
    page,
  }) => {
    await openBacklinks(page, BUSIEST)

    await expect(
      page.locator(PANEL).getByRole('heading', { name: 'Hol hivatkoznak rá', exact: true }),
    ).toBeVisible()

    const rows = page.locator(ROW)
    await expect(rows).toHaveCount(222)

    // Ordered by count descending (§7.2). Read off the rendered rows rather than
    // asserted one by one: the point is the ordering, not 222 individual numbers.
    const counts = await rows.evaluateAll((links) =>
      links.map((link) => Number(link.querySelector('[data-backlink-count]')!.getAttribute('data-backlink-count'))),
    )
    expect(counts[0]).toBe(15)
    expect(counts.at(-1)).toBe(1)
    expect([...counts].sort((a, b) => b - a)).toEqual(counts)
    // …and the counts are per source, not per row: 222 sources, 548 references.
    expect(counts.reduce((total, count) => total + count, 0)).toBe(548)

    // A source is an entity, a section OR a chapter, all in one list (§7.2).
    const kinds = await rows.evaluateAll((links) =>
      [...new Set(links.map((link) => link.getAttribute('data-backlink-source')))].sort(),
    )
    expect(kinds).toEqual(['chapter', 'definition', 'proof', 'remark', 'section', 'theorem'])

    // The heaviest source is a section, and its row is a link to the section's
    // anchor on its chapter page — the count is inside the link, so the whole row
    // is the target.
    const first = rows.first()
    await expect(first).toHaveAttribute(
      'href',
      '/hu/konyvek/alice-es-bob/fejezetek/alice-es-bob-az-absztrakcio-utjan#szakaszok.gyuruk-alapveto-tulajdonsagai',
    )
    await expect(first).toContainText('Gyűrűk alapvető tulajdonságai')
    await expect(first).toContainText('15 hivatkozás')
  })

  test('every row says in words what kind of thing its source is', async ({ page }) => {
    await openBacklinks(page, BUSIEST)

    // One label per row rather than one per list: 222 rows, 222 labels.
    await expect(page.locator(ROW)).toHaveCount(222)
    await expect(page.locator(KIND)).toHaveCount(222)

    // …and each row's label is its OWN kind. Grouped rather than compared row by
    // row: a label that disagreed with its row's `data-backlink-source` would put a
    // second word in that kind's set and fail here, so this is 222 assertions in the
    // shape of one.
    const pairs = await page.locator(ROW).evaluateAll((links) =>
      links.map((link) => [
        link.getAttribute('data-backlink-source'),
        link.querySelector('.backlinks-panel_kind')!.textContent!.trim(),
      ]),
    )
    const wordsByKind = new Map<string, Set<string>>()
    for (const [kind, word] of pairs) {
      if (!wordsByKind.has(kind!)) wordsByKind.set(kind!, new Set())
      wordsByKind.get(kind!)!.add(word!)
    }
    expect(Object.fromEntries([...wordsByKind].map(([kind, words]) => [kind, [...words]]))).toEqual({
      chapter: ['fejezet'],
      section: ['szakasz'],
      definition: ['definíció'],
      theorem: ['tétel'],
      proof: ['bizonyítás'],
      remark: ['megjegyzés'],
    })
  })

  test('two sources with the same title are told apart by their kind', async ({ page }) => {
    await openBacklinks(page, BUSIEST)

    // The reason the label exists. Eight of `gyuru-test`'s 222 sources share a title
    // with another source of a different kind; "Oszthatóság" is one of them — the
    // section of the book that cites this definition 14 times, and the definition of
    // the same name that cites it twice. Without the label the two rows are the same
    // title over two different counts, and nothing says which is which.
    const pair = page
      .locator(ROW)
      .filter({ has: page.getByText('Oszthatóság', { exact: true }) })
    await expect(pair).toHaveCount(2)

    const both = await pair.evaluateAll((links) =>
      links.map((link) => ({
        kind: link.querySelector('.backlinks-panel_kind')!.textContent!.trim(),
        count: link.querySelector('[data-backlink-count]')!.getAttribute('data-backlink-count'),
        href: link.getAttribute('href'),
      })),
    )
    expect(both).toEqual([
      {
        kind: 'szakasz',
        count: '14',
        href: '/hu/konyvek/alice-es-bob/fejezetek/alice-es-bob-alaptetele#szakaszok.oszthatosag',
      },
      { kind: 'definíció', count: '2', href: '/hu/tudasbazis/definiciok/oszthatosag' },
    ])
  })

  test('the 222 rows scroll inside the panel, under a header that stays put', async ({ page }) => {
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

  test('two sources are the same list, just shorter', async ({ page }) => {
    await openBacklinks(page, TWO_ROWS)

    const rows = page.locator(ROW)
    await expect(rows).toHaveCount(2)
    // No separate design for the short case (§6.4): the same row, the same count.
    await expect(rows.first()).toContainText('1 hivatkozás')
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
      /\/hu\/konyvek\/alice-es-bob\/fejezetek\/alice-es-bob-az-absztrakcio-utjan#szakaszok\.gyuruk-alapveto-tulajdonsagai$/,
    )
    expect(errors, 'navigating away from an open panel threw').toEqual([])
  })
})

test.describe('the backlink list without JavaScript', () => {
  test.use({ javaScriptEnabled: false })

  test('all 222 rows are served in the HTML, inside the page and shown inline', async ({
    page,
  }) => {
    await page.goto(BUSIEST)

    // Nothing runs here, so this is exactly what a crawler is served (§2.1/D6). The
    // inbound edges of the graph are the reason the panel is server-rendered at all.
    await expect(page.locator(`main ${PANEL}`)).toHaveCount(1)
    // And on screen, not behind a sheet that cannot open: §2.1 asks the page to
    // degrade to a long page with everything visible, and 222 rows is the long case
    // (`noJsCss` in components/kb/Panel.tsx, census in `e2e/kb-sweep.test.ts`).
    await expect(page.locator(PANEL)).toBeVisible()

    const rows = page.locator(ROW)
    await expect(rows).toHaveCount(222)
    await expect(rows.first()).toBeVisible()
    await expect(rows.last()).toBeVisible()
    await expect(rows.first()).toHaveAttribute(
      'href',
      '/hu/konyvek/alice-es-bob/fejezetek/alice-es-bob-az-absztrakcio-utjan#szakaszok.gyuruk-alapveto-tulajdonsagai',
    )
    await expect(rows.last()).toHaveAttribute(
      'href',
      '/hu/tudasbazis/tetelek/vegesen-generalt-idealok-maximumfeltetele',
    )
    // The kind label is part of that served answer, not something the client adds:
    // the heaviest source is a section and says so.
    await expect(page.locator(KIND)).toHaveCount(222)
    await expect(rows.first()).toContainText('szakasz')
  })

  test('an entity nothing cites is served the empty state, not an empty list', async ({ page }) => {
    await page.goto(NOTHING_CITES_IT)

    await expect(page.locator(EMPTY)).toHaveText('Nincs rá hivatkozás')
    await expect(page.locator(ROW)).toHaveCount(0)
  })
})
