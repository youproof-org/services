import { expect, test, type Page } from '@playwright/test'
import { collectConsoleNoise } from './support/console-noise'

/**
 * A split chapter read as one document (`components/content/ChapterPager.tsx`).
 *
 * The server renders one page of the chapter between two `<nav>` placeholders that
 * link to its neighbours. With JavaScript, the pager loads the neighbours as the
 * reader scrolls, keeps the URL and the title on the page in view, and places the
 * mid-content newsletter forms. Without it, the placeholders are the whole story, so
 * that pass comes first.
 *
 * The chapter is a published one, so the suite runs against a deployed build as
 * well as a local one. Its shape is asserted before anything else (`SHAPE`): the
 * expected form slots follow from it, and a content change should fail here with a
 * message saying so, not as a missing form further down.
 *
 * No fixed waits. The one claim about time, "no visible jump", is a trace of an
 * element's position on every animation frame, read by a loop the init script
 * registers before the page's own code runs.
 */

const CHAPTER = '/hu/konyvek/alice-es-bob/fejezetek/alice-es-bob-felcsavarja-a-szamegyenest'
const PAGE_2 = `${CHAPTER}/2`

/** Nine sections: §1–4 on page 1 (global indices 0–3), §5–9 on page 2 (4–8). */
const SHAPE = { sections: 9, page2FirstSection: 4 }

/**
 * Where the forms go (`chapterSlotTakesForm`, every third slot from the arrival
 * section, at least three sections either side). From page 1: 3 and 6. From page 2
 * (arrival 4): 4, once page 1 is above it, since 1 has one section before it and 7
 * only two after it.
 */
const FORMS_FROM_PAGE_1 = [3, 6]
const FORMS_FROM_PAGE_2 = [4]

/** The second section of page 2: deep enough that page 1 isn't loaded on arrival. */
const DEEP_ANCHOR = 'szakaszok.gyuruhomomorfizmus-magja-es-kepe'

/** A term defined on page 1, referenced from page 2. */
const PAGE_1_TERM = 'definiciok.gyuruhomomorfizmus.fogalmak.gyuruhomomorfizmus'

/** A term defined on page 2. */
const PAGE_2_TERM = 'definiciok.ideal.fogalmak.ideal'

const wrapper = (page: Page, index: number) => page.locator(`[data-chapter-page="${index}"]`)
const slot = (page: Page, direction: 'prev' | 'next') => page.locator(`nav[data-chapter-slot="${direction}"]`)

/** See `kb-chrome.test.ts`: the banner covers the page until a decision is made. */
async function settleConsent(page: Page, button: 'Elutasítom' | 'Engedélyezem' = 'Elutasítom') {
  const choice = page.getByRole('button', { name: button, exact: true })
  await choice.click()
  await expect(choice).toBeHidden()
}

/** The `<title>` a page is served with. */
async function servedTitle(page: Page, url: string): Promise<string> {
  const html = await (await page.request.get(url)).text()
  const match = /<title>([^<]*)<\/title>/.exec(html)
  if (!match) throw new Error(`${url} has no <title>`)
  return match[1].replaceAll('&amp;', '&')
}

/** Scroll with no animation: `app/globals.scss` sets `scroll-behavior: smooth`. */
function scrollTo(page: Page, y: number) {
  return page.evaluate((top) => window.scrollTo({ top, behavior: 'instant' }), y)
}

/** Scroll so that the element's top sits `offset` pixels below the viewport's top. */
function scrollElementTo(page: Page, selector: string, offset: number) {
  return page.evaluate(
    ([sel, off]) => {
      const element = document.querySelector(sel as string)
      if (!element) throw new Error(`no ${sel}`)
      const top = element.getBoundingClientRect().top + window.scrollY - (off as number)
      window.scrollTo({ top, behavior: 'instant' })
    },
    [selector, offset] as const,
  )
}

/** The slots that hold a form, and the id of the form in each. */
function filledSlots(page: Page) {
  return page.locator('[data-newsletter-slot]').evaluateAll((slots) =>
    slots
      .filter((element) => !(element as HTMLElement).hidden)
      .map((element) => ({
        slot: Number(element.getAttribute('data-newsletter-slot')),
        form: element.firstElementChild?.id ?? null,
        children: element.children.length,
      })),
  )
}

async function expectFormsAt(page: Page, slots: number[]) {
  await expect
    .poll(() => filledSlots(page))
    .toEqual(slots.map((b) => ({ slot: b, form: `newsletter-form-mid-content-${b}`, children: 1 })))
}

/** Scroll page 1's next placeholder into view, and wait for page 2 to take its place. */
async function appendPage2(page: Page) {
  await expect(slot(page, 'next')).toHaveCount(1)
  await scrollElementTo(page, 'nav[data-chapter-slot="next"]', 300)
  await expect(wrapper(page, 2)).toHaveCount(1)
  await expect(slot(page, 'next')).toHaveCount(0)
}

interface Frame {
  top: number
  pages: number
  scrollY: number
}

/**
 * Record, on every animation frame, the viewport top of one element, how many pages
 * are in the document, and the scroll offset. The element is `selector`'s first
 * match, or whatever the test later puts in `window.__watch`. Registered before the
 * page's own code, and a prepend commits and is held within one task, so a frame
 * can only ever see the page before the insert or after the hold.
 */
function installTrace(page: Page, selector?: string) {
  return page.addInitScript((watched) => {
    const trace: Frame[] = []
    const w = window as unknown as { __trace: Frame[]; __watch?: Element }
    w.__trace = trace
    const sample = () => {
      const element = w.__watch ?? (watched ? document.querySelector(watched) : null)
      if (element) {
        trace.push({
          top: element.getBoundingClientRect().top,
          pages: document.querySelectorAll('[data-chapter-page]').length,
          scrollY: window.scrollY,
        })
      }
      requestAnimationFrame(sample)
    }
    requestAnimationFrame(sample)
  }, selector ?? null)
}

function readTrace(page: Page): Promise<Frame[]> {
  return page.evaluate(() => (window as unknown as { __trace: Frame[] }).__trace)
}

test('the chapter still has the shape this suite assumes', async ({ page }) => {
  const count = async (url: string) => {
    const html = await (await page.request.get(url)).text()
    return {
      sections: (html.match(/<section id="szakaszok\./g) ?? []).length,
      slots: [...html.matchAll(/data-newsletter-slot="(\d+)"/g)].map((m) => Number(m[1])),
    }
  }
  const [one, two] = await Promise.all([count(CHAPTER), count(PAGE_2)])
  expect(one.sections + two.sections).toBe(SHAPE.sections)
  expect(one.sections).toBe(SHAPE.page2FirstSection)
  expect(one.slots).toEqual([1, 2, 3])
  expect(two.slots).toEqual([4, 5, 6, 7, 8])
})

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false })

  test('the placeholders are real links, and each page stands alone', async ({ page }) => {
    await page.goto(CHAPTER)
    await expect(wrapper(page, 1)).toHaveCount(1)
    await expect(wrapper(page, 2)).toHaveCount(0)
    await expect(slot(page, 'prev')).toHaveCount(0)
    const next = slot(page, 'next').getByRole('link')
    await expect(next).toHaveAttribute('href', PAGE_2)
    await expect(next).toHaveAttribute('rel', 'next')
    await expect(next).toHaveText(/^18\.5\. /)
    await expect(page.locator('[id^="newsletter-form-mid-content"]')).toHaveCount(0)
    await expect(page.locator('[data-newsletter-slot]:not([hidden])')).toHaveCount(0)

    await next.click()
    await expect(page).toHaveURL(new RegExp(`${PAGE_2}$`))
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1)
    await expect(wrapper(page, 2)).toHaveCount(1)
    await expect(wrapper(page, 1)).toHaveCount(0)
    await expect(slot(page, 'next')).toHaveCount(0)
    const prev = slot(page, 'prev').getByRole('link')
    await expect(prev).toHaveAttribute('href', CHAPTER)
    await expect(prev).toHaveAttribute('rel', 'prev')
    await expect(prev).toHaveText(/^18\.1\. /)
    await expect(page.locator('[data-newsletter-slot]:not([hidden])')).toHaveCount(0)
  })
})

test.describe('with JavaScript', () => {
  test('scrolling down appends the next page, from its HTML alone', async ({ page }) => {
    const noise = collectConsoleNoise(page)
    const fetched: string[] = []
    page.on('request', (request) => {
      const { pathname } = new URL(request.url())
      if (pathname === PAGE_2 || pathname.startsWith('/_next/static/flight/')) fetched.push(pathname)
    })
    await page.goto(CHAPTER)
    await settleConsent(page)
    await expect(wrapper(page, 2)).toHaveCount(0)

    await appendPage2(page)
    const order = await page
      .locator('[data-chapter-page]')
      .evaluateAll((wrappers) => wrappers.map((w) => w.getAttribute('data-chapter-page')))
    expect(order).toEqual(['1', '2'])
    await expect(wrapper(page, 2).locator(`[id="${PAGE_2_TERM}"]`)).toHaveCount(1)
    await expect(slot(page, 'prev')).toHaveCount(0)
    // One flight file, page 1's own: the fetched page's payload never loads.
    expect(fetched.filter((path) => path.startsWith('/_next/')).length).toBe(1)
    expect(fetched.filter((path) => path === PAGE_2)).toEqual([PAGE_2])
    expect(noise).toEqual([])
  })

  test('scrolling up from a deep landing prepends the previous page with no visible jump', async ({
    page,
  }) => {
    await installTrace(page)
    await page.goto(`${PAGE_2}#${DEEP_ANCHOR}`)
    await settleConsent(page)
    await expect(page.locator(`[id="${DEEP_ANCHOR}"]`)).toBeInViewport()

    // Deep enough that the placeholder was outside the loading margin on arrival.
    const distance = await page.evaluate(
      () => -document.querySelector('nav[data-chapter-slot="prev"]')!.getBoundingClientRect().bottom / innerHeight,
    )
    expect(distance).toBeGreaterThan(2)
    await expect(wrapper(page, 1)).toHaveCount(0)
    await expectFormsAt(page, [])
    const historyLength = await page.evaluate(() => history.length)

    // One viewport below the placeholder, inside the margin, still inside page 2. The
    // element to watch is picked in the same task as the scroll: the load starts from
    // an observer callback, which can't run before the task ends.
    await page.evaluate(() => {
      const nav = document.querySelector('nav[data-chapter-slot="prev"]')!
      const bottom = nav.getBoundingClientRect().bottom + window.scrollY
      window.scrollTo({ top: bottom + innerHeight, behavior: 'instant' })
      const w = window as unknown as { __watch?: Element }
      w.__watch = document.elementFromPoint(innerWidth / 2, innerHeight / 2) ?? undefined
    })
    await expect(wrapper(page, 1)).toHaveCount(1)
    await expect(slot(page, 'prev')).toHaveCount(0)
    await expectFormsAt(page, FORMS_FROM_PAGE_2)

    const trace = await readTrace(page)
    const beforeInsert = trace.filter((frame) => frame.pages === 1)
    const afterInsert = trace.filter((frame) => frame.pages === 2)
    expect(beforeInsert.length).toBeGreaterThan(0)
    expect(afterInsert.length).toBeGreaterThan(0)
    const tops = trace.map((frame) => frame.top)
    expect(Math.max(...tops) - Math.min(...tops)).toBeLessThanOrEqual(1)
    // The page grew above the view by page 1 and the form, and the scroll followed.
    const pageOneHeight = await wrapper(page, 1).evaluate((element) => element.getBoundingClientRect().height)
    const grown = afterInsert[afterInsert.length - 1].scrollY - beforeInsert[beforeInsert.length - 1].scrollY
    expect(grown).toBeGreaterThan(pageOneHeight)

    expect(new URL(page.url()).pathname).toBe(PAGE_2)
    expect(await page.evaluate(() => history.length)).toBe(historyLength)
  })

  test('landing on the top of page 2 prepends page 1 at once, and page 2 stays put', async ({ page }) => {
    // At scroll offset 0 the browser doesn't anchor, so this is the case the pager's
    // own hold is for: page 1 arrives above a view that hasn't scrolled at all.
    await installTrace(page, '[data-chapter-page="2"] > section')
    await page.goto(PAGE_2)
    await expect(wrapper(page, 1)).toHaveCount(1)
    await expect(slot(page, 'prev')).toHaveCount(0)

    const trace = await readTrace(page)
    const inserted = trace.findIndex((frame) => frame.pages === 2)
    expect(inserted).toBeGreaterThan(0)
    const [before, after] = [trace[inserted - 1], trace[inserted]]
    // Consecutive frames, so the fonts still settling on a fresh load can only have
    // moved it by a pixel or two. Without the hold it would move by all of page 1.
    expect(Math.abs(after.top - before.top)).toBeLessThanOrEqual(2)
    const pageOneHeight = await wrapper(page, 1).evaluate((element) => element.getBoundingClientRect().height)
    expect(after.scrollY - before.scrollY).toBeGreaterThan(pageOneHeight)
  })

  test('the URL, the title and the page views follow the page in view', async ({ page }) => {
    await page.route('https://www.googletagmanager.com/**', (route) =>
      route.fulfill({ status: 200, contentType: 'text/javascript', body: '' }),
    )
    const [title1, title2] = await Promise.all([servedTitle(page, CHAPTER), servedTitle(page, PAGE_2)])
    expect(title1).not.toBe(title2)

    await page.goto(CHAPTER)
    await settleConsent(page, 'Engedélyezem')
    const pageViews = () =>
      page.evaluate(() =>
        ((window as unknown as { dataLayer?: unknown[] }).dataLayer ?? [])
          .map((entry) => Array.from(entry as ArrayLike<unknown>))
          .filter((args) => args[0] === 'event' && args[1] === 'page_view')
          .map((args) => {
            const params = args[2] as { page_path: string; page_title: string }
            return [params.page_path, params.page_title]
          }),
      )
    await expect.poll(pageViews).toEqual([[CHAPTER, title1]])
    await expect(page).toHaveTitle(title1)
    const historyLength = await page.evaluate(() => history.length)

    await appendPage2(page)
    await scrollElementTo(page, '[data-chapter-page="2"]', 0)
    await expect.poll(() => new URL(page.url()).pathname).toBe(PAGE_2)
    await expect(page).toHaveTitle(title2)
    await expect.poll(pageViews).toEqual([
      [CHAPTER, title1],
      [PAGE_2, title2],
    ])

    await scrollElementTo(page, '[data-chapter-page="2"]', 600)
    await expect.poll(() => new URL(page.url()).pathname).toBe(CHAPTER)
    await expect(page).toHaveTitle(title1)
    await expect.poll(pageViews).toEqual([
      [CHAPTER, title1],
      [PAGE_2, title2],
      [CHAPTER, title1],
    ])

    expect(await page.evaluate(() => history.length)).toBe(historyLength)
  })

  test('forms appear only at the allowed slots, never move, and have unique ids', async ({ page }) => {
    await page.goto(CHAPTER)
    await settleConsent(page)
    await expectFormsAt(page, FORMS_FROM_PAGE_1.filter((b) => b < SHAPE.page2FirstSection))
    await page.locator('#newsletter-form-mid-content-3').evaluate((form) => {
      ;(form as unknown as { __original: boolean }).__original = true
    })

    await appendPage2(page)
    await expectFormsAt(page, FORMS_FROM_PAGE_1)
    const original = await page
      .locator('[data-newsletter-slot="3"] > #newsletter-form-mid-content-3')
      .evaluate((form) => (form as unknown as { __original?: boolean }).__original === true)
    expect(original).toBe(true)

    const ids = await page.locator('[id^="newsletter-form-"]').evaluateAll((forms) => forms.map((f) => f.id))
    expect(ids).toEqual([
      'newsletter-form-mid-content-3',
      'newsletter-form-mid-content-6',
      'newsletter-form-pre-footer',
    ])
  })

  test('confirming one form switches that form and no other', async ({ page }) => {
    await page.route(
      (url) => url.pathname.endsWith('/api/v1/newsletter/subscriptions/sub-1/confirm'),
      (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }),
    )
    const sform = encodeURIComponent(`${CHAPTER}#mid-content-6`)
    await page.goto(`${CHAPTER}?newsletter_ask=confirm&sid=sub-1&stok=tok&sform=${sform}`)
    const confirm = page.getByRole('button', { name: 'Megerősítem', exact: true })
    await expect(confirm).toBeVisible()

    await appendPage2(page)
    await expectFormsAt(page, FORMS_FROM_PAGE_1)
    await confirm.click()
    await expect(confirm).toBeHidden()

    const confirmed = page.getByText('Sikeresen megerősítetted a feliratkozásod.')
    await expect(page.locator('#newsletter-form-mid-content-6').getByText('Sikeresen megerősítetted')).toBeVisible()
    await expect(confirmed).toHaveCount(1)
    await expect(page.locator('#newsletter-form-mid-content-3').getByRole('button', { name: 'Feliratkozom' })).toBeVisible()
  })

  test('a link to a loaded page scrolls there without a reload', async ({ page, context }) => {
    await page.goto(CHAPTER)
    await settleConsent(page)
    await appendPage2(page)
    await scrollElementTo(page, '[data-chapter-page="2"]', 0)
    await expect.poll(() => new URL(page.url()).pathname).toBe(PAGE_2)
    await page.evaluate(() => {
      ;(window as unknown as { __sameDocument: boolean }).__sameDocument = true
    })
    const historyLength = await page.evaluate(() => history.length)

    // The body's references open a new tab (`InlineText`), and the pager leaves them
    // to it.
    const reference = wrapper(page, 2).locator(`a[href="${CHAPTER}#${PAGE_1_TERM}"]`).first()
    await reference.scrollIntoViewIfNeeded()
    const [popup] = await Promise.all([context.waitForEvent('page'), reference.click()])
    await popup.close()
    expect(new URL(page.url()).pathname).toBe(PAGE_2)

    // No link in a chapter body opens in the same tab today, so one is made out of
    // the same reference. That one the pager takes over.
    await reference.evaluate((link) => link.removeAttribute('target'))
    await reference.click()
    await expect.poll(() => new URL(page.url()).pathname + new URL(page.url()).hash).toBe(`${CHAPTER}#${PAGE_1_TERM}`)
    await expect(page.locator(`[id="${PAGE_1_TERM}"]`)).toBeInViewport()
    expect(await page.evaluate(() => (window as unknown as { __sameDocument?: boolean }).__sameDocument)).toBe(true)
    expect(await page.evaluate(() => history.length)).toBe(historyLength)
  })

  test('a deep link to an anchor on page 2 lands on it', async ({ page }) => {
    await page.goto(`${PAGE_2}#${PAGE_2_TERM}`)
    await settleConsent(page)
    const target = page.locator(`[id="${PAGE_2_TERM}"]`)
    await expect(target).toBeInViewport()
    await expect(page).toHaveTitle(await servedTitle(page, PAGE_2))
    expect(new URL(page.url()).pathname + new URL(page.url()).hash).toBe(`${PAGE_2}#${PAGE_2_TERM}`)
  })
})
