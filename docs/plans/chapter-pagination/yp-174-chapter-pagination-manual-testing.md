# YP-174 chapter pagination: manual testing before staging.

Run this on a local build before you promote the three branches to staging. The
automated suites already cover a lot (`pnpm test`, the postbuild gates, and 153
Playwright tests in Chromium). This guide covers what they can't: other browsers,
touch and small screens, how the joins feel, and a human read of the metadata and
the policy text.

Tick each box as you go. Write down anything odd next to the step, with the URL and
the browser.

## 1. Setup.

- [ ] Check out the three branches:
  - services: `feat/yp-174-chapter-pagination`
  - content: `content/yp-174-chapter-pages`
  - editor: `feat/yp-174-chapter-pages`
- [ ] Check that `apps/website/.env.local` has `CONTENT_DIR` pointing at the content
      checkout and `NEXT_PUBLIC_GA_MEASUREMENT_ID` set, so the consent banner and GA4
      run.
- [ ] Build from `apps/website`:

  ```sh
  source ~/.nvm/nvm.sh && nvm use 24.18.0
  pnpm install
  pnpm build
  ```

- [ ] Check the end of the build log. You should see:
  - `[externalize-flight]` moved pushes into one file per page;
  - `[check-flight]` found one external flight file per page;
  - `[check-page-size]` checked 606 pages, and the largest is
    `alice-es-bob-felcsavarja-a-szamegyenest.html` at about 1.42 MB.
- [ ] Serve the export: `node scripts/serve-out.mjs` (port 4321). This serves `out/`
      the way the CDN does. Don't test with `next dev`, because its hydration and
      routing differ from production.

All URLs below start with `http://localhost:4321/hu/konyvek/alice-es-bob/fejezetek/`.

### The split chapters.

| # | Slug | Status | Sections | Pages |
|---|---|---|---|---|
| 18 | `alice-es-bob-felcsavarja-a-szamegyenest` | published | 9 | 1–4, 5–9 |
| 20 | `alice-bob-euler-es-fermat` | published | 7 | 1–4, 5–7 |
| 21 | `alice-es-bob-titkosit` | published | 10 | 1–4, 5–10 |
| 22 | `alice-bob-es-a-kinaiak` | published | 7 | 1–4, 5–7 |
| 24 | `alice-es-bob-komolyabb-fegyverekhez-nyul` | published | 8 | 1–6, 7–8 |
| 25 | `alice-es-bob-fontos-parhuzamokat-talal` | draft | 8 | 1–4, 5–8 |
| 26 | `alice-es-bob-atlepi-a-celvonalat` | draft | 12 | 1–4, 5–8, 9–12 |

A local build renders drafts in full, so 25 and 26 paginate here. On staging and
production they're still one stub page each. Chapter 26 is the only chapter with
three pages, so it's the one to use for a middle page.

## 2. Without JavaScript.

Turn JavaScript off in DevTools (Command Menu → "Disable JavaScript").

- [ ] Open `alice-es-bob-titkosit`. It shows the abstract, the prologue, and
      sections 21.1–21.4. There's no epilogue. At the bottom, a link reads
      "21.5. A Rivest-Shamir-Adleman (RSA) aszimmetrikus kulcsú rejtjelező eljárás".
- [ ] Follow it. `alice-es-bob-titkosit/2` shows the chapter header, a link back
      above the content, sections 21.5–21.10, and the epilogue. There's no abstract
      or prologue.
- [ ] The section, embed, and figure numbers on page 2 continue from page 1. They
      don't restart at 1.
- [ ] Open `alice-es-bob-atlepi-a-celvonalat/2`. It has both a prev link and a next
      link.
- [ ] No newsletter form appears inside a chapter body. The pre-footer form is still
      there.
- [ ] Turn JavaScript back on.

## 3. Page metadata.

Use View Source, not the Elements panel, so you see what a crawler sees. Check
`alice-es-bob-titkosit` and `alice-es-bob-titkosit/2`.

- [ ] `<title>` and `<meta name="description">` match that page's `meta` in
      `chapter.yaml`.
- [ ] `og:title` on page 2 ends in "(2. rész)". Page 1 has no suffix.
- [ ] `<link rel="canonical">` and `og:url` point at the page itself. Page 1's
      canonical has no `/1`.
- [ ] Page 1 has `<link rel="next">` and no `rel="prev"`. Page 2 has `rel="prev"`
      pointing at the bare chapter URL, and no `rel="next"`.
- [ ] `alice-es-bob-atlepi-a-celvonalat/2` has both.
- [ ] Paste the JSON-LD into the Schema.org validator (validator.schema.org). It
      parses, and the `Chapter` name is the chapter title, not the page meta title.
- [ ] The HTML has no inline `self.__next_f.push`. One
      `<script src="/_next/static/flight/….js">` loads the payload instead.

## 4. Addresses that must 404.

Each of these should show the site's 404 page:

- [ ] `alice-es-bob-titkosit/1`
- [ ] `alice-es-bob-titkosit/0`
- [ ] `alice-es-bob-titkosit/02`
- [ ] `alice-es-bob-titkosit/3`
- [ ] `alice-es-bob-atlepi-a-celvonalat/4`

`alice-es-bob-titkosit/2/`, with a trailing slash, also 404s on the local server.
Check it again on staging, since the CDN decides there.

## 5. Scrolling forward from page 1.

Keep DevTools Network open, filtered to Fetch/XHR.

- [ ] Open `alice-es-bob-titkosit` and scroll down steadily. Before you reach the
      end of 21.4, page 2 arrives without a reload. There's one request for
      `alice-es-bob-titkosit/2`, and no `/_next/static/flight/` script loads for it.
- [ ] The join is invisible. There's no flash, no jump, and no gap. The page 1 to
      page 2 link is replaced by the content.
- [ ] When 21.5 nears the top quarter of the window, the address bar changes to
      `…/alice-es-bob-titkosit/2` and the tab title changes to page 2's title.
- [ ] Scroll back up past the boundary. The address and title return to page 1.
- [ ] Press Back. You leave the chapter and go to where you were before it, not to
      page 1 of the chapter.
- [ ] Repeat on chapter 26 and scroll through to page 3. Each page loads once, and
      the address moves through `/2` and `/3`.
- [ ] Reload while the address shows `/2`. You land on the top of page 2, and page 1
      then loads above it without moving what you're reading.

## 6. Landing on a later page.

- [ ] Open `alice-es-bob-titkosit/2` directly and don't scroll. Page 1 loads above
      you. The first line of 21.5 stays where it was, under the sticky header.
- [ ] Scroll up. The content of page 1 is all there, ending with 21.4, and the
      address changes back to the chapter URL when you cross into it.
- [ ] Open `alice-es-bob-atlepi-a-celvonalat/2`. Both page 1 above and page 3 below
      load as you scroll toward them.
- [ ] Try this once on a slow connection (DevTools → Network → "Slow 4G"). Nothing
      jumps when a page arrives late.
- [ ] Try this once with the request blocked (right-click the page 1 request →
      "Block request URL", then reload). The plain link to the other page stays, and
      it works.

## 7. Links to a section on a later page.

- [ ] Open the knowledge base page `/hu/tudasbazis/tetelek/maradekosztalygyuruk`. In
      its context panel, the chapter link points at
      `…/alice-es-bob-felcsavarja-a-szamegyenest/2#szakaszok.maradekosztalygyuruk`.
- [ ] Follow it. The page smooth-scrolls to 18.8, which lands just under the sticky
      header. When page 1 loads above it after the scroll stops, 18.8 stays put.
- [ ] `alice-es-bob-idealjai` links to 18.8 in chapter 18. Find the link in the
      Elements panel by searching for
      `felcsavarja-a-szamegyenest/2#szakaszok.maradekosztalygyuruk`. It opens a new
      tab on page 2 of chapter 18 and lands on 18.8.
- [ ] In `alice-bob-euler-es-fermat`, section 20.4 (page 1) links to 20.5 (page 2).
      That link also opens a new tab, on `…/alice-bob-euler-es-fermat/2`, and lands on
      20.5. A reference opening a new tab is the existing behaviour, so the pager's
      in-place scroll for links within a chapter never triggers on current content.
- [ ] Use Find (Command-F) for a phrase on page 2 while you're on page 1, after page
      2 has loaded. The browser finds it.

## 8. Newsletter forms inside a chapter.

A form goes before a section when it's a multiple of three sections from the first
section of the page you landed on, with at least three sections before it and three
after it. A form never appears right under the chapter header. That slot fills once
the page above it loads.

| Land on | Forms appear before |
|---|---|
| `alice-es-bob-titkosit` | 21.4 and 21.7 |
| `alice-es-bob-titkosit/2` | 21.8, then 21.5 once page 1 has loaded |
| `alice-es-bob-atlepi-a-celvonalat` | 26.4, 26.7, and 26.10 |
| `alice-es-bob-atlepi-a-celvonalat/2` | 26.8, then 26.5 once page 1 has loaded |
| `alice-es-bob-atlepi-a-celvonalat/3` | 26.6, then 26.9 once page 2 has loaded |
| `alice-es-bob-komolyabb-fegyverekhez-nyul/2` | 24.4, once page 1 has loaded |

- [ ] The forms appear where the table says, and nowhere else.
- [ ] No form moves or disappears while you scroll up and down.
- [ ] Each form is collapsible. Open two forms and check that they open and close
      separately.
- [ ] Each form has a different id in the Elements panel, `newsletter-form-mid-content-{b}`.

Actually submitting a form is a staging check. There, confirm that the
confirmation link brings you back to the page that was in the address bar when you
submitted, and that only the form you used shows the confirmed state.

## 9. Analytics.

Use a fresh private window with DevTools Network filtered to `collect`.

- [ ] Accept the consent banner on `alice-es-bob-titkosit`. One `/g/collect` with
      `en=page_view` fires, with `dl` set to the chapter URL.
- [ ] Scroll into page 2. Exactly one more `page_view` fires when the address
      changes, with `dl` ending in `/2` and `dt` set to page 2's title.
- [ ] Scroll back into page 1. One more `page_view` fires, for page 1.
- [ ] Loading a neighbouring page in the background, before you reach it, sends
      nothing.
- [ ] Open the consent dialog and reject. Scrolling across a boundary now sends
      nothing.

The local build sends to whichever property `.env.local` names. Open the page with
`?ga_debug=exclude` first if you don't want these hits in that property's reports.

## 10. Browsers and screens.

CI runs Chromium only, so this is the only check the other engines get. Repeat
sections 5, 6, and 7 in each:

- [ ] Safari on macOS
- [ ] Firefox
- [ ] Safari on an iPhone, or the Simulator. Use the touch scroll, and check the
      join mid-fling.
- [ ] Chrome at 360px wide (DevTools device mode). The prev and next links wrap
      cleanly, and nothing scrolls sideways.

## 11. Printing.

- [ ] Print preview on `alice-es-bob-titkosit` after page 2 has loaded. It prints
      both pages, since both are in the document. Write down how the newsletter forms
      and the prev and next links look. Nothing in this branch changes print styles,
      so compare with a single-page chapter.

## 12. Sitemap.

- [ ] `out/sitemap-konyvek.xml` lists every page of the five published split
      chapters, such as `…/alice-es-bob-titkosit/2`. It lists no page of chapter 25
      or 26, because they're drafts.

## 13. Policy pages.

- [ ] Read `/hu/suti-cookie-kezelese` and `/hu/adatkezeles`. Both say that a page view
      also counts when you scroll into another page of a split chapter, and that the
      path and the page title are sent.
- [ ] Decide whether this change needs a `cookie-policy-version` bump and a new
      "Hatályos" date. Neither is changed on the branch, and `adatkezeles` promises
      to update the date when the policy changes.

## 14. Editor (v1.3.0).

The editor now reads a chapter's sections from `pages` and groups them by page in
the tree. It has no UI for page layout or page meta, so a save writes each page's
`meta` and `sections` back exactly as they were in the file. These steps check that
it shows the new shape correctly and never damages it.

Work on a scratch copy of the content branch, or be ready to `git checkout` the
files you touch. Before each save check, run `git status` in the content repo so you
know it's clean.

### Setup.

- [ ] In the editor repo on `feat/yp-174-chapter-pages`, run
      `source ~/.nvm/nvm.sh && nvm use 24.18.0`, then `npm install` and `npm test`.
      The round-trip tests pass.
- [ ] Run `npm run build`, open the editor repo in VS Code, and press F5 to start an
      Extension Development Host. (The release script only packages on
      `stable/released`, so a local VSIX isn't the way to test a feature branch.)
- [ ] In the new window, open the content repo. The extension's details show version
      1.3.0.

### The tree.

- [ ] Chapter 21 shows two groups, "Page 1" and "Page 2". Page 1 holds 21.1–21.4 and
      Page 2 holds 21.5–21.10, in order.
- [ ] Chapter 26 shows "Page 1", "Page 2", and "Page 3", with four sections each.
- [ ] Chapter 24 shows six sections under Page 1 and two under Page 2.
- [ ] A single-page chapter, such as chapter 17, shows its sections straight under
      the chapter, with no page group.
- [ ] Clicking a page group does nothing. It doesn't select anything or open a panel.
- [ ] Clicking a section under Page 2 opens that section. Its references show under
      it in the tree, as they do for a section on page 1.
- [ ] Every chapter from 1 to 27 shows all its sections. Compare the counts with
      `npm run check:pages` in the content repo, which reports 208 sections in total.

### Saving.

- [ ] Open chapter 21, change a word in the prologue, and save. `git diff` shows only
      that word. The `pages` block, with both pages' `meta` and `sections`, is
      unchanged and still sits between `prologue` and `epilogue`.
- [ ] Undo the change, save again, and check that `git diff` is empty.
- [ ] Do the same on the epilogue of chapter 26, a three-page chapter.
- [ ] Open a section on page 2 of chapter 21, such as 21.8, change a word, and save.
      Only that section's file changes. `chapter.yaml` isn't touched.
- [ ] Run "save recursively" on chapter 22 with nothing changed. `git diff` is empty.
- [ ] Run it again after changing one section on each page. Only those two section
      files change.
- [ ] After any of these saves, `npm run check:pages` in the content repo still
      passes.

### Edits made outside the editor.

- [ ] With chapter 25 open, move `csoportok-homomorfizmustetele` from page 1 to page
      2 in `chapter.yaml` by hand, then reload the model. The tree shows the section
      under Page 2.
- [ ] Remove the second page from `chapter.yaml` so the chapter has one page again,
      and reload. The page groups go away, and every section shows under the
      chapter.
- [ ] Put a page's keys out of order by hand (`sections` before `meta`), reload,
      change a word in the prologue in the editor, and save with Cmd+S. `meta`
      comes first again.
- [ ] `git checkout` the file afterwards.

## 15. Before you promote.

- [ ] Merge the content branch into `draft` first. The services build rejects the
      old chapter shape, so its CI fails against a `draft` without `pages`.
- [ ] Then merge services. The editor can go in any time.
- [ ] After the staging deploy, repeat sections 4, 5, 8 (with a real submission), and
      9 there. Then re-run the Ahrefs audit and check that no page is over 2 MB.
