# YP-162 sub-plan: knowledge-base page layout

**Parent plan:** [`yp-162-knowledge-graph-urls-implementation-plan.md`](yp-162-knowledge-graph-urls-implementation-plan.md)
(design: [`yp-162-knowledge-graph-urls-plan.md`](yp-162-knowledge-graph-urls-plan.md))
**Sibling sub-plan:** [`yp-162-identifiers-and-anchors-sub-plan.md`](yp-162-identifiers-and-anchors-sub-plan.md) — **shipped**; it settled the anchor grammar, the fully qualified reference targets, and the identifier constraints these pages render.
**Repos touched:** `youproof-org/services` only — no content or editor change is
implied by anything here.
**Status:** **Shipped — all 21 phases of §10 are built**, on branch
`feat/yp-162-page-layout-design` in `services`. **[§12](#12-what-actually-landed) is
what actually landed**, where it diverged from these phases and why, and the final
measurements; read it before §10. §§2–7 remain the design, corrected in place at the
four points where an owner ruling during the build replaced what they said — §7.1's
per-target-kind panel table, §7.2's panel ordering, §7.2's reference count, and
§2.1's no-JavaScript reading — and again at the points a **post-run review of the
built pages** changed: those are listed together in
[§12.7](#127-post-run-review-findings), which is the index to them. §9.1's
measurements are likewise corrected where the build disagreed with them; the
disagreements themselves are listed in §12.

§§2–7 describe what the reader sees and does, not how it is built. §10 is the build
order that followed from it — 21 narrow phases, each written so that a session picking
up one of them needed the phase text and one or two source files, not this whole
document. The two data-shape prerequisites recorded in §9 were its phases 2–4.

**This sub-plan replaces §7 of the design plan and the layout half of parent phase
5 (§H).** Parent §H's component table, its H.3 interaction sketch and §7's per-page
content lists were inputs, not decisions — where this document disagrees with them,
this document wins. The parent has been amended accordingly: its §H is marked done,
its §Shipped carries phase 5, and its H.2/H.3 are pointers rather than
specifications.

> ### Working agreement (inherited from the parent plan)
>
> **Nothing is committed or pushed without approval.** Do the work, post a short
> summary of what changed and how it was verified, and wait for an explicit go.
>
> **Every phase ends with a review gate.** After a phase is committed, stop and wait
> for separate approval before starting the next one. Where a phase produces a
> **review artifact**, the artifact is what gets reviewed; derived files are not
> written until it is approved.

---

## 1. What this sub-plan is for

Parent phase 5 (routing and page components) is gated on the page layout being
settled, because the component structure follows from it. §7 of the design plan
lists *what* each page contains; it deliberately leaves *how any of it is arranged*
open. This sub-plan closes that gap.

Five surfaces to design, plus the shell they all sit in:

| § | surface |
|---|---|
| 2 | **The shell** — what every knowledge-base page has in common with the rest of the site |
| 3 | The knowledge-base root page |
| 4 | The glossary page, with client-side filtering |
| 5 | The definition and theorem index pages |
| 6 | The entity pages: definition, theorem, proof, remark — and their menu, overlay and panel |
| 7 | What happens when the reader follows an incoming or outgoing reference |

§7 is not a page; it is the behaviour that ties the other four together, and it is
what decides how much of an entity page is relationship surface versus content.

**Sections 3–5 are deliberately thin.** Those three pages are lists, they are
expected to be iterated on while they are being built, and over-specifying them now
would be guessing. §6 and §7 are where the real design is.

---

## 2. The shell — common to every knowledge-base page

Every page in §§3–6 looks and behaves like the rest of the site. Nothing here is
new invention; it is the existing shell, applied.

- **Header** — the site header as on any inner page: the brand lockup on the left,
  the primary nav on the right, collapsing behind a hamburger on narrow screens.
  The nav gains **one new item, "Tudásbázis"**, alongside the existing "Cikkek" and
  "Hírek". Every knowledge-base page is reachable from it.
- **Breadcrumb** — the header's breadcrumb row, showing where the reader is in the
  hierarchy. The chains are exactly the ones in
  [§7 of the design plan](yp-162-knowledge-graph-urls-plan.md#7-page-design--content-blocks-per-page-type):
  `Főoldal → Tudásbázis → …`, with a remark's chain following its actual ownership
  (definition, theorem, or theorem → proof).
- **Main area** — page-specific; §§3–6.
- **Newsletter form** — at the bottom of the main area, above the footer, exactly as
  on the home page and every other content page.
- **Footer** — the site footer, unchanged.
- **Cookie consent** — unchanged in every respect, including the floating button in
  the **bottom-left** corner that reopens the preferences dialog. That dialog
  continues to open above everything else on the page, including anything §6
  introduces.

Two things worth stating explicitly, because §6 adds fixed chrome of its own:

- The consent button keeps the **bottom-left** corner and keeps its behaviour. The
  knowledge-base chrome takes the **bottom-right** corner, which is currently
  unoccupied. **Only entity pages have it** — the root, glossary and index pages
  carry no bottom-right chrome at all.
- It **does not print.** The consent button already hides in print, and a menu that
  opens panels is meaningless on paper; the same applies to the overlay and the
  arrival marker.

### 2.1 Nothing a crawler must follow sits behind JavaScript

A standing rule for every page in this sub-plan, and the one constraint that
overrides layout preference where the two conflict:

**Any content that can contain an internal cross-link is rendered server-side and
present in the served HTML.** JavaScript may *reveal* it, *hide* it, *highlight* it
or *reorder* it — it must never be what *produces* it.

That covers the obvious cases (an entity's body, an index list, the glossary) and,
less obviously, everything in §6 that is invisible until the reader acts: **the
panel's contents in every one of its forms** (§6.4) — the inbound-reference lists,
the embedding context, the term and claim details — are in the HTML from the first
byte, hidden. Opening a panel unhides what is already there.

*Why:* this ticket exists to make the knowledge graph legible to search engines and
LLM crawlers. Inbound-reference lists and the embedding context are precisely the
edges of that graph — a crawler that cannot see them cannot see the structure the
work is meant to expose. Client-generated panel content would put the most valuable
part of these pages behind the one thing crawlers are least reliable at.

A secondary benefit: it also makes every one of these pages work with JavaScript
disabled, degrading to a long page with everything visible instead of a broken one.

> **"Everything visible" was ambiguous, and phase 20 settled it.** Phase 13 served
> every panel's content and left it `hidden`, which satisfies the sentence above about
> the served HTML but leaves a reader without JavaScript looking at a page whose
> panels are present and invisible. **The owner ruled that "shows every panel's
> content inline" requires visibility, not just presence.** Phase 20 implemented it
> with a stylesheet inside `<noscript>` in `Panel.tsx`, which is the only mechanism
> that answers "no JavaScript" without a class a script would have to add. **The
> served bytes are unchanged** — the sections still carry `hidden`, so a crawler reads
> identical HTML and a scripted browser never parses the rule. What that costs, and
> what it does not buy, is in [§12](#12-what-actually-landed): a no-JavaScript page
> still does not *print* its panel content.

---

## 3. The knowledge-base root page

`/{locale}/tudasbazis` — the entry point and orientation page for the knowledge
base as a whole, and the way in for both readers arriving from the nav and for
crawlers.

Content as specified in
[§7.8 of the design plan](yp-162-knowledge-graph-urls-plan.md#78-knowledge-base-root-page-):

- Breadcrumb `Főoldal → Tudásbázis`; title "Tudásbázis".
- A brief description of what the knowledge base contains and how it is structured.
- Links to the three sections — **Definíciók**, **Tételek**, **Fogalmak** — each
  with a short description and a node count.
- **No listing of individual nodes.** That is the index pages' job.

### Design notes

*Provisional — we will iterate on this during implementation.*

- The three links are the page. They should read as three **cards of equal weight**,
  not as a bulleted list of links: each card carries the section name, its one-line
  description, and its count. Side by side on desktop, stacked on mobile.
- The count is the useful part ("63 definíció"), so it should be legible at a glance
  rather than buried in the description sentence.
- The counts are the **published** counts — the same set of nodes that actually have
  a page in the current environment. A root page advertising 84 definitions while
  the index lists 63 is a bug the reader can see.
- No filter bar here. There is nothing on this page to filter.

---

## 4. The glossary page

`/{locale}/tudasbazis/fogalmak` — every term in the knowledge base on one page.
Terms have no page of their own; each entry points at the anchor on the node that
introduces it.

**The purpose of this page is that a reader can find any term in alphabetical
order, whether they are looking for it under its canonical name or under a
synonym.** Everything below follows from that.

Content as specified in
[§7.5 of the design plan](yp-162-knowledge-graph-urls-plan.md#75-glossary-page-fogalmak),
**with three changes**:

- **No one-line excerpt** from the defining node's context. Dropped: the excerpt is
  the weakest part of the entry, it is expensive to make read well across 217 rows,
  and a reader who wants the context is one click from it.
- **No "referenced by N nodes" count.** Dropped: it is not what this page is for. A
  reader here is looking a term up, not assessing how central it is.
- **Synonyms get their own rows**, alphabetized among the canonical forms rather
  than tucked under them. A reader who only knows a term under a synonym should find
  it exactly where they look for it — under its own initial, in the one ordering the
  page has. Requiring them to already know the canonical form defeats the page.

So the list is **one row per name** — canonical or synonym, treated alike as entry
points — and each row links to the anchor on the node that introduces that term.

**The whole list is in alphabetical order.**

### Design notes

*Provisional — we will iterate on this during implementation.*

- **Ordering is Hungarian-alphabetical**, not code-point order — `á` sorts with `a`,
  and `cs`/`gy`/`ny`/`sz`/`zs` are the collation's business, not ours. Every row is
  ordered on its own name, so a synonym sorts where the reader expects it and not
  where its canonical form happens to sit.
- **A synonym row should say what it is a synonym of.** It links to the same defining
  anchor as its canonical row, so the row still has to tell the reader they are about
  to land on a term with a different name — otherwise the destination looks wrong.
  Naming the canonical form on the row is the cheapest way; exact wording is an
  implementation-time call.
- Canonical and synonym rows are **equal as entry points**, but they need not look
  identical. Some visual distinction is fine, as long as it does not read as "this
  one is second-class" — both are legitimate names for the same object.
- One term with N synonyms therefore contributes **N + 1 rows**. That is intended:
  the list is an index of names, not of terms.
- The filter is **client-side and immediate** — no submit, no round trip, results
  narrowing as the reader types. Row count is small enough that this is free. With
  every name on its own row, the filter matches row text and nothing special is
  needed to make synonyms findable.
- **The field stays put while the list scrolls.** *Added by an owner ruling after the
  run.* It sticks to the top of the viewport just below the breadcrumb row, for as
  long as any of the list is on screen. This page is 559 rows long; a field that
  scrolled away with the top of the page would mean scrolling back out of the list
  before it could be narrowed, which is the opposite of what an immediate filter is
  for. The offset is the site header's own measured height, so the field lands under
  the breadcrumb at every width and after every wrap. It applies equally to the two
  index pages (§5), which share the component.
- The filter needs an **empty state** ("nincs találat") and a way to clear it in one
  action. With 217 terms a mistyped filter otherwise looks like a broken page.
- The filter must not be the only way to reach a term: with JavaScript off, the full
  alphabetical list is still there and still linked. Filtering narrows a list that is
  already rendered.
- Alphabetical section markers (an `A`, `B`, `C`… running head as the list scrolls)
  are worth trying, but only if they survive filtering without leaving empty
  headings behind.

---

## 5. The definitions and theorems index pages

`/{locale}/tudasbazis/definiciok` and `/{locale}/tudasbazis/tetelek` — the two
type-scoped listings. Designed together, and they should differ only where the
content genuinely differs.

**These are lookup tables, like the glossary.** A reader comes here knowing roughly
what they are after and wanting to find it; they are not reading the knowledge base
in order. That is what settles the ordering below.

Content as specified in
[§7.6](yp-162-knowledge-graph-urls-plan.md#76-definitions-index-page-definiciok) and
[§7.7](yp-162-knowledge-graph-urls-plan.md#77-theorems-index-page-tetelek) of the
design plan, **with one change**:

- **No one-line summary / statement preview** per row. Dropped for the same reason
  as the glossary excerpt: a mechanically-taken opening sentence of a theorem is
  usually a fragment of LaTeX, and it reads worse than nothing.

So a row carries the node's **title, followed by its label**, and links to its page:

```
Euler–Fermat tétel — 15.6. Tétel
```

The **title leads**, because it is what the reader is looking for. The **label
follows it in grey**, marking it as secondary — it is orientation ("where does this
sit in the book?"), not identification.

**Rows are listed alphabetically by title**, not in label order. Both pages have a
**client-side filter by title**.

### Design notes

*Provisional — we will iterate on this during implementation.*

- **One design, two instances.** Whatever these pages become, they become it
  together; a reader moving from Definíciók to Tételek should not have to relearn
  the page.
- Alphabetical ordering is **Hungarian-alphabetical on the title**, the same
  collation as the glossary (§4). Two lookup tables on the same site sorting
  differently would be a defect.
- Without the preview line, a row is short — so the list is **dense**, one line per
  entry, and the page becomes genuinely scannable rather than a column of cards.
- Title and label on one line means the label position varies with title length.
  Whether the labels are **right-aligned into a column** or simply trail the title
  after a separator is an implementation-time call; the column reads more like a
  table, the trailing form more like prose. Try both.
- The label is grey, so it must still clear the contrast floor — "de-emphasised" is
  not "unreadable at a glance", and it is the only in-page cue to where a node lives
  in the book.
- **Every node these pages list has a title today** — measured on the content tree:
  84/84 definitions and 191/191 theorems carry an authored `title`, after phase 1's
  backfill. (Proofs and remarks have none, but they do not appear on these pages.)
  So the "no title to lead with, nothing to alphabetize on" case does not arise now.
  It still needs a fallback rule so a newly authored node without a title cannot
  quietly sort to a strange place — but that is a guard, not a design question.
- The filter behaves exactly as the glossary's: immediate, clearable, with an empty
  state, narrowing an already-rendered list rather than fetching one.
- A count of what is being shown ("63 definíció", and while filtering, how many
  match) is cheap and answers the first question a reader has.

---

## 6. The entity pages

The four node pages — definition, theorem, proof, remark. Everything in this
section is common to all four; the per-type differences are §6.5.

An entity page is a **reading surface first**. The node's own content is the page;
everything relational is reachable, but nothing relational competes with the body
for the reader's attention. That is the single decision this whole section follows
from, and it is what makes the menu-and-panel arrangement below the right shape
rather than a set of stacked sections underneath the content.

### 6.1 The header and the content

Inside the main area, above everything else:

- **Header** — two lines, and on a proof or a remark page a third above them.
  - The **link up to the parent**, where the page has one, above the label, over a
    hairline rule of its own. *Added by an owner ruling after the run; see the
    ownership-chain links below, from where it moved.*
  - The **label** of the entity, e.g. `1.14. Tétel`. The exact wording depends on
    the type, and it is the same label the entity carries when embedded in a
    chapter. Styled like the chapter page's label (`chapter-page_chapter-label`):
    small, letter-spaced, uppercase, muted.
  - The **title**, if the entity has one. Styled like the chapter page's title
    (`chapter-page_chapter-title`). A node without a title shows only the label.
- **Content** — below the header: the body of the entity, rendered the way the same
  entity renders when embedded in a narrative context such as a chapter page
  (`embedded-entity_*`). Same typography, same LaTeX, same claim and term treatment.
  The reader should recognise it as the same object they met in the book.
- **A q.e.d. symbol closes the content**, as it does on the embedded rendering
  (`embedded-entity_qed`) — `∎` for a proof, `♣` otherwise.

#### The ownership-chain links

**One chain in two places** — *corrected by an owner ruling after the run; this
subsection used to put both halves below the body.*

- **Up** to the parent, **in the header, above the label**: a proof links to the
  theorem it proves; a remark links to the definition, theorem or proof it is
  attached to. Only a proof and a remark have one, which is 262 of the 537 pages —
  and those are exactly the pages whose `<h1>` is the bare type label, so
  "BIZONYÍTÁS" is all the header said and what is being proved was at the far end of
  the body. The reader needs it before the argument, not after it. **The rule sits
  below the link**, closing it off from the label it is telling the reader about
  rather than separating it from the breadcrumb row above it, which is a different
  kind of statement about where the page sits. *Corrected by an owner ruling after
  the run; the rule was above the link.*
- **Down** to each attached child, **below the body**: a theorem links to each of its
  proofs and each of its remarks; a definition and a proof link to each of their
  remarks. A page with no children renders nothing here. **The rows read exactly as
  the parent link does** — same size, same weight, same arrow, the hairline mirrored
  above them so it closes the body off instead of the label. *The parent half is the
  reference for both, by an owner ruling after the run; the child rows used to take
  the body's own size and weight.*

Direction is marked with an **arrow in the link** — up for the parent, down for the
children — so the reader can see which way they are moving in the chain without
reading the labels.

These were originally menu items. They are plain links instead because that is what
they are: a menu item that navigates is a link wearing a button, and the menu is for
things that happen *on* this page. Two things fall out of the change:

- **Multiple proofs or remarks need no special handling.** A menu item has to pick
  one; a list simply has more entries. The "go to the first one" fallback the menu
  version needed is gone with it.
- **They are ordinary links in the served HTML**, below the content, where a crawler
  reads them as the ownership graph they are. The menu version put the chain behind
  a control.

Note what is *not* on the page as a stacked section: referenced-by, the defined
terms, and the embedding context. All three are panel content (§6.4), reached from
the menu (§6.2); §7 is where their behaviour is settled.

The design plan's §7.3 also gave a proof page a **"Uses"** block — a list of
everything the proof cites. **There is no such block** ([D8](#8-decision-log)): the
references in the body already are that list, in the order the argument uses them,
and each is a link a crawler follows.

### 6.2 The context menu

Every entity page carries a **vertical stack of floating action buttons in the
bottom-right corner** — the page's context menu. Which items it contains depends on
the **type of the entity**, on **what that particular entity has** (terms, claims,
a proof, a remark, a parent), and on the **current state of the menu**.

**Shape of a button.** Each item has two parts: a **complete circular icon** at the
right end — the same size, weight and treatment as the cookie-consent opener in the
bottom-left corner, and laid **on** the bar rather than being the bar's own rounded end,
with a shadow of its own lifting it off — and a **caption bar extending to the left of
it**, both ends rounded. **Every bar in the stack is the same width**, the widest
caption's, so the circles line up in a column because the bars end together. *Corrected
by an owner ruling after the run: the circle used to be the pill's right end, and each
bar shrank to its own caption.*

**"The same size" is the glyph's, not the circle's.** *Corrected by an owner ruling
after the run.* The build read it as the circle — a 44px button with a 44px icon
filling it — against an opener whose shield paints at 16.66 × 13.33 inside the same
44px circle. The two corners then carried two different families of control. The
circle is unchanged; the glyph in it is now 1rem, which is the shield's own box to
within a pixel on its wider side.

**Every icon is black and white**, like the consent opener. No colour anywhere in
this chrome. The icon set lives in
[`entity-page-menu-icons/`](entity-page-menu-icons/).

#### The two permanent buttons

The bottom-most button in the stack is always one of these two, in the same place,
so the reader always knows where "the control" is.

| item | icon | when | does |
|---|---|---|---|
| **Menü** | `menu.png` — hamburger | the page is in its default state | opens the menu |
| **Vissza** | `back.png` — curved return arrow | any other state | steps **back one state** |

**"Vissza" is a back step, not a close.** It returns the menu *and the page* to
whatever the previous state was — so if an action opened a panel, or raised the
overlay, or put the page into a selection mode, "Vissza" undoes exactly that one
step and leaves everything before it intact. Pressing it repeatedly walks back to
the default state. This is why it is a return arrow and not an X: an X would promise
to dismiss everything at once, which is not what it does.

**The browser's back button does the same thing.** While the page is in any
non-default state, pressing Back is equivalent to pressing "Vissza": it steps back
one state. Once the page has walked back to its default state, Back reverts to its
normal meaning and leaves the page.

That is the behaviour a reader expects from anything that feels like navigation —
opening a panel is a place you went, so Back should be the way out of it — and it is
what keeps the page usable on a phone, where Back is a system gesture and the
"Vissza" button may be under the reader's thumb rather than in their eye line. Two
consequences:

- **Forward is symmetric.** Having stepped back with Back, Forward re-applies the
  state that was undone. Anything else makes Back a one-way trap.
- **The page's state stays out of the URL.** Every state of an entity page is the
  same URL, so a reload or a shared link opens the page in its default state, and a
  crawler sees one page rather than one per panel. This is a deliberate position, not
  an oversight: this ticket exists to make each node **one** indexable URL, and
  minting URL variants for transient UI states would work against exactly that.
  A `#…` fragment arriving from a cross-reference still just scrolls — with the
  arrival effect below.

#### Arriving at an anchor

A cross-reference that lands on a fragment scrolls the target into view, as it does
today. **On top of that, the target is briefly marked** so the reader can see what
they were sent to: a rectangle **shrinking onto** the target element, tightly framing
it, held for a moment, then gone. No lasting change to the element — it is a "here"
gesture, not a selected state.

Scrolling alone is not enough on these pages. A term is a few words inside a
paragraph and a claim is one item among several, so a reader who follows a
cross-reference lands on a screen of text with no indication of which part of it was
the point.

**A mark plays when its target is in front of the reader, and not before.** *Added by
an owner ruling after the run.* The gesture already waited for the arrival scroll to
come to rest, which is enough when there is one target. It is not enough for §7.2's
row arrival, which marks every reference in a source at once: on a long section most
of them are below the fold when the page lands, and playing all of them together
spends the gesture off-screen — the reader scrolls down later and finds the places
they came for wearing nothing. So each mark waits for its own target to come into
view, below the sticky header, and plays there. An arrival is over when every one of
its marks has played, however long the reader takes over the section.

**Only for anchors that name something inside the text:**

| anchor kind | on arrival |
|---|---|
| embedded entity | scroll **+ mark** |
| term | scroll **+ mark** |
| claim | scroll **+ mark** |
| section | scroll only |
| part (book index) | scroll only |

Sections and parts are page-structural: they scroll to a heading with their name on
it, so the reader can already see they arrived. Marking them would be noise.

**That is the complete set of anchor targets on the site** — checked against the
code rather than assumed. Five kinds of `id` are rendered into content:
`kbAnchorPath` (embedded entity), `termAnchorId`, `claimAnchorId`, `sectionAnchorId`
and `partAnchorId`. Two more `id`s exist but are not cross-reference targets: the
homepage's `#articles` / `#news` scroll targets, which come from nav rather than from
a content reference, and the dialog/form ids, which are accessibility wiring.
**Figures are not anchorable** — a figure has no `id`, and no reference can target
one. Worth knowing, since a figure is exactly the kind of thing a reader would
expect to be able to link to; making them targetable is a separate decision.

**The same effect has a second use**, on a different class of element: arriving from
a "Bejövő hivatkozások" row marks the *references* in the destination that point back
at where the reader came from (§7.2). The table above is about anchor **targets** — a
thing being pointed at; that case is about the pointing links themselves. Same
gesture, same reason, so they should look identical.

The effect covers the new pages too, where a fragment can arrive at a term or a
claim on an entity page. It should not fire when the page moves something into view
by its own doing — the scroll-into-the-upper-half in §6.4 already has the overlay
to show what is selected, and a second marker on top of it would be two answers to
one question.

**Nor should it fire for a fragment nobody asked for.** *Added by an owner ruling
after the run.* A mark needs a reason as well as a fragment change, and there are two:
the document loaded on that fragment, or the reader pressed something that led there.
A **Back or Forward step is neither** — the reader has been where they are going and
the mark was given there, so marking it again answers a question nobody asked twice.
The case that showed it: arrive at a term, select it, follow one of its source rows,
come back, and the term was framed a second time. The one case given up for it is a
fragment typed into the address bar of the page the reader is already on; the same URL
pasted into a new tab is a load, and still marked.

#### The items

The union across all four entity types. Each is present only when its availability
condition holds — see §6.5 for what that works out to per type.

| item | icon | available when | does |
|---|---|---|---|
| **Bejövő hivatkozások** | `incoming.png` | always | opens the panel with **every** inbound reference to this entity, grouped by source — §7.2 |
| **Fogalmak** | `star.png` | the entity defines ≥ 1 term | dims the page and reveals the terms in the body, making them selectable — §6.3 |
| **Állítások** | `paragraph.png` — `§` | the entity contains ≥ 1 claim | same, for claims — §6.3 |
| **Kontextus** | `target.png` — crosshair | always | opens the panel with the entity's embedding context — the panel is headed "Kontextus" too (finding 14) |

**Every menu item acts on this page; none of them navigate away.** Movement along
the ownership chain — to a proof, a remark, or a parent — is a set of plain links
below the body instead (§6.1). `proof.png`, `remark.png`, `definition.png` and
`theorem.png` are therefore not menu icons; they remain available for those links
if they are wanted there.

#### The panel contents

Four menu items open a panel, and one more path does (selecting an outgoing
reference, §7.1). Each fills the same panel with different content:

| opened by | panel shows |
|---|---|
| **Bejövő hivatkozások** | all inbound references to the entity, grouped by source — §7.2 |
| a **term** selected in Fogalmak mode | the term's canonical form and its synonyms, plus the inbound references targeting *that term* |
| a **claim** selected in Állítások mode | the claim, plus the inbound references targeting *that claim* |
| **Kontextus** | where the entity is embedded — the numbered chapter, and the numbered section nested under it, laid out as the rows of the Bejövő hivatkozások list (finding 14) |
| an **outgoing reference** in the body (§7.1) | details of what that reference points at |

*Panel layout for Bejövő hivatkozások and Kontextus will be fine-tuned during
implementation; the structure above is what is settled.*

### 6.3 The overlay

**Opening the menu dims the page.** A transparent grey overlay covers the whole
page behind the menu — the same overlay treatment the reader already knows from the
cookie consent dialog.

What is **not** covered by it:

- the menu buttons themselves,
- the cookie-consent button in the bottom-left corner,
- the panel (§6.4), when one is open.

**The overlay can also reveal parts of the page underneath it.** This is the part
that is not just a backdrop: two menu items put the page into a mode where a
particular class of thing in the body is lifted out from under the dim and made
**selectable**. The rest of the page stays dimmed, so what the reader can act on is
unambiguous — the page is telling them "these, right now".

**"Fogalmak" and "Állítások" work in two levels.**

1. **Select the mode.** The page dims, and every term (or every claim) in the body
   is revealed and becomes selectable. **No panel opens yet** — this state is purely
   "pick one". "Vissza" returns to the open menu.
2. **Select one.** The chosen term or claim stays revealed; **all the others drop
   back under the overlay**, so only the selection remains lit. The panel slides in
   with that term's or claim's details (§6.2), and the selection scrolls into the
   free upper half (§6.4). "Vissza" steps back to level 1 — panel closed, all terms
   or claims revealed and selectable again.

**The overlay alone does not lock scrolling.** In a selection mode — terms or claims
revealed, no panel yet — the reader can still scroll the page, because picking one
means finding it first, and a term can be anywhere in the body. Scrolling locks only
when a panel opens (§6.4).

**Escape and a click on the dimmed area both act as "Vissza"** ([D2](#8-decision-log)) —
one step back, not a dismissal of everything. So there are four ways to take the same
step: the button, the browser's Back, Escape, and clicking the dim.

The narrowing from "all of them" to "just this one" is the whole point of the
reveal mechanism: it shows the reader what they picked without a highlight colour, a
scroll-to, or a separate selected-state style. The overlay does the work.

**A revealed thing goes under the sticky header, not over it.** *Corrected by an
owner ruling after the run.* Lifting a term out from under the dim also lifted it over
the site header, which is inside the same wrapper, so a term scrolled to the top of
the page painted across the logo and the breadcrumb. The header is therefore raised
above the reveal for the duration of a mode — and, being then above the dim as well,
is given the dim's own wash and made click-through, so it looks and behaves exactly as
it did underneath it.

**Two revealed claims are two candidates, and have to look like it.** *Corrected by
an owner ruling after the run.* Consecutive claims sit flush — as a numbered list they
need no gap — so lighting them put two white grounds edge to edge and four revealed
claims came out as one white slab with four numbers in it, which is not a page asking
the reader to pick one of four. A claim that follows a claim is therefore given a
0.75rem gap for as long as the mode is up, against 0.25rem of ground on each side, so
a strip of the dim shows between one card and the next. Only claims: a term's ground
is 0.15em and neither two terms in a sentence nor two on consecutive lines come close
enough to merge.

Selecting an outgoing reference in the body (§7.1) is the same mechanism entered
from a different direction: no mode to pick first, so it goes straight to a
single revealed element with the panel open.

### 6.4 The panel

**Not visible by default.** When the reader clicks a menu item that has content
behind it, a panel **slides in from the bottom** and occupies the **bottom half of
the screen**. It **slides back down off-screen** when it is closed by the
appropriate menu item.

- **What it contains depends on which menu item opened it and on the entity's
  type.** One panel, many contents.
- **Every one of those contents is server-rendered and already in the page**, per
  §2.1 — hidden until the panel opens, never fetched or built on the client. Opening
  a panel is a reveal, closing it is a hide.
- It sits **above the overlay** (§6.3), so it stays fully legible while the rest of
  the page is dimmed.
- Occupying half the screen is deliberate: the body of the entity stays visible in
  the top half. The reader never loses the thing the panel is *about*.
- **Opening the panel scrolls the selected thing into the free upper half.** The
  half-screen only pays for itself if what the panel refers to is actually in the
  visible half — a term or claim sitting in the lower half of the viewport when the
  panel opens would be covered by it, and the reader would be reading a panel about
  something they can no longer see. So the page scrolls the selection up into the
  uncovered region as the panel slides in.
  - The two movements are **one gesture**, not a scroll followed by a slide: the
    selection should already be in place by the time the panel has finished
    arriving.
  - The selection should land **comfortably inside** the upper half rather than
    flush against its bottom edge, so the panel does not read as though it is about
    to swallow it.
  - When the panel opens with **no specific selection** — an item that is about the
    node as a whole — there is nothing to scroll to, and the page stays where it is.
  - **Closing the panel does not scroll back.** The reader has been reading in the
    new position; yanking the page back under them on close would be disorienting.
- **The page behind is scroll-locked while a panel is open**, and unlocks when it
  closes. The panel has just placed the relevant thing in the upper half; letting the
  page drift out from under it would undo that. Scrolling inside the **panel** is of
  course free — see the overflow note below. The overlay on its own does not lock
  anything (§6.3).
- **The panel scrolls internally, and it will need to.** Measured on the content, the
  inbound-reference list for `gyuru-test` runs to **222 distinct sources**, while the
  median entity has **2** — so the same panel must handle two rows and two hundred
  without a separate design. Its header stays put and the list scrolls under it.
- **Links inside the panel are ordinary links.** They navigate. A panel never opens a
  nested panel, and the §7.1 rule that body references are inert unless the page is in
  its default state is about the *body* — panel content is what the reader is meant to
  be acting on.

The five things the panel can contain are listed in §6.2; §7.2 details the
reference lists, which are three of them.

#### Motion

Three things on these pages animate: the panel sliding in and out, the scroll that
places the selection in the upper half, and the shrinking rectangle on arrival
(§6.2). **All three respect `prefers-reduced-motion`** — the panel appears and
disappears without the slide, the scroll jumps rather than eases, and the rectangle
appears at its final size and fades. Nothing is *removed* under reduced motion; the
marker in particular still has to do its job of showing the reader where they landed.

There is an existing convention to follow rather than invent: `root-page.module.scss`
and `consent-banner.module.scss` both already honour the query.

### 6.5 What differs by entity type

The four page types share everything in §§6.1–6.4. What actually differs is **which
menu items are present**, and that follows from the entity rather than from its type
alone — a definition that defines no term has no Fogalmak item, exactly like a
theorem that defines none.

| menu item | definition | theorem | proof | remark |
|---|---|---|---|---|
| Menü / Vissza | ● | ● | ● | ● |
| Bejövő hivatkozások | ● | ● | ● | ● |
| Kontextus | ● | ● | ● | ● |
| Fogalmak | if terms | if terms | if terms | if terms |
| Állítások | if claims | if claims | **never** | if claims |

And the ownership-chain links below the body (§6.1):

| link | definition | theorem | proof | remark |
|---|---|---|---|---|
| ↑ parent | — | — | its theorem | its definition / theorem / proof |
| ↓ proofs | — | one per proof | — | — |
| ↓ remarks | one per remark | one per remark | one per remark | — |

Reading the table against the real content, so the design is sized to what exists:

- **Kontextus is always available.** Every one of the 537 entities is embedded
  exactly once, inside a section — so this item never has an empty panel.
- **Claims on proofs are forbidden** by the identifiers sub-plan (its D3), so
  Állítások never appears on a proof page. Not "currently zero" — ruled out.
- **Terms on proofs are currently zero but deliberately not ruled out.** The content
  model supports them and they are wanted later, so a proof page must be able to
  show Fogalmak; it simply will not today.
- **A remark owns nothing** — no proofs, no remarks of its own — so its only
  ownership-chain link is the one pointing back up at its parent.
- **Definitions and theorems have no parent**, so they have no up-link.
- Measured on the content: terms are defined by 62/84 definitions, 16/191 theorems,
  4/72 remarks, 0/190 proofs; claims appear in 11 definitions, 26 theorems, 6
  remarks. So on most **theorem** and **proof** pages the menu is short — Bejövő
  hivatkozások and Kontextus, with the ownership chain in the links below the body.

*Anything beyond menu availability that turns out to differ per type gets recorded
here as it comes up.*

---

## 7. Following a reference

What the reader sees on arrival, and what they can do from there — in both
directions:

- **Outgoing** — following a reference out of a node's body to whatever it cites.
- **Incoming** — arriving from elsewhere, and reading the node's own list of what
  cites it.

### 7.1 Outgoing references

**They look exactly as they do in an embedded context.** An outgoing reference in
the body of an entity page carries the same treatment as the same reference inside a
chapter — the `ref-concept` style: text colour inherited from the surrounding prose,
a dotted grey underline, and a subtle darkening on hover. Deliberately not a blue
link: a reference is part of the sentence it sits in, and the body of an entity page
is dense with them. The reader should recognise the mark from the book.

**They are only selectable in the page's default state** — no panel open, menu
closed. While the menu is open, or while a panel is showing, the references in the
body are inert; whatever mode the page is in owns the reader's next click. This is
what keeps the modes from competing: at any moment exactly one class of thing on the
page is actionable.

**Selecting one opens the panel with the details of that reference.** The full
transition, in one gesture:

- the **overlay** comes up (§6.3), dimming the page,
- the **selected reference is revealed** from under it — lifted out of the dim, so it
  is visibly the thing the panel is about,
- the **panel slides in** from the bottom (§6.4) carrying the details of what that
  reference points at,
- and the reference is **scrolled into the free upper half** as it does, per §6.4.

So an outgoing reference is not primarily a navigation away from the page. It is a
request to see *what this is* without losing the sentence it appeared in — the
reader stays on the proof they are reading and inspects the definition it leans on.
Actually going to the referenced node is available from the panel, as a second,
deliberate step.

**What the panel shows** — **one arrangement, not five. Corrected by an owner ruling
during phase 17, and again by finding 15; the table this subsection used to carry is
superseded.**

The heading is **the target's own name**, and the content is **one row: the place the
reference leads to, named exactly as a leaf row of the Bejövő hivatkozások tree names
it** (§7.2) — its number and title on the first line, the chain below it
("bizonyítás", "bizonyítás → megjegyzés") on a second where there is one, and no
count, which is the one line of that row with nothing to say here. The row is the
link, so the second, deliberate step out is pressing what it says. No body, no
excerpt, no claim text, no synonyms.

| the reference points at | the row says |
|---|---|
| a definition, theorem, proof or remark | the numbered definition or theorem its page hangs off (`15.6. Definíció: Oszthatóság`), and the chain below it |
| a claim | the same two lines for the node that asserts it — the claim's number is the heading |
| a term | the same two lines for the node that defines it — the canonical form is the heading |
| a chapter or a section | its number and its title (`18.8. Maradékosztálygyűrűk`) |
| a book or a part | its title, which is the whole of what identifies one |
| an external URL | nothing; it is an ordinary outbound link and never opens a panel |

*What the table said before, and what the build measured.* It gave each kind its own
treatment: an entity's **full body**, **the claim itself**, a term's **synonyms**. Put
together with §2.1's rule that panel content is in the served HTML, that meant every
citing page carried a copy of everything it cited — a definition's body served once per
citation. Measured over the export with the previews in place, they accounted for
**52 KiB of the average knowledge-base page's 177.0 KiB** and **0.67 MB of the largest
page's 2.10 MB** (the figures recorded in `components/kb/panels/ReferencePanel.tsx`'s
own header comment). **The owner ruled the preview is not worth that.**

The through-line survives, narrowed: **enough to answer "what is this called, and what
kind of thing is it?" without leaving the page**, plus one link for the reader who wants
the whole thing. The old table already prescribed exactly this for one row — *"a section,
chapter or part: its title and a link to it — no body"* — so the ruling is that row
applied to all five kinds rather than a sixth treatment. Five arrangements becoming one
is also five panels reading as one design. The size figures before and after are in
[§12.3](#123-the-measurements).

**A reference stays a real link even though clicking it opens a panel** ([D1](#8-decision-log)).
It has a genuine destination and crawler discoverability is the reason this ticket
exists, so the mark is never a JavaScript-only control: middle-click, ctrl-click and
"open in new tab" navigate to the target page as on any link. Only the plain click is
intercepted, to open the panel instead.

**Opening a reference panel puts the menu into its open state** ([D2](#8-decision-log)),
with a matching "Vissza" — the same state any other panel produces, even though this
one was opened from the body rather than from a menu item.

### 7.2 Incoming references

Reached from the **Bejövő hivatkozások** menu item, which opens the panel with a
list of everything that cites this entity.

**"All incoming" means all.** The list is not limited to references aimed at the
entity as a whole: a reference targeting a **claim** or a **term** inside it is a
reference to this entity, and appears here too. The entity page is the only place
those are visible, since claims and terms have no page of their own.

**The list is grouped by source, one row per source.** A source is whatever the
reference came from, and that is not only other entities — **sections and chapters
of the book cite entities too**, and they belong in the same list. A reader asking
"where is this used?" wants the chapter as much as the theorem.

**Each row carries a count.** If one section references this entity five times, it
appears **once**, with a count of 5 — not five rows. Grouping without a count would
throw away how heavily a source leans on this entity; five rows would bury the other
sources.

**The rows are a tree: chapter → section → embedded entity.** *Added by an owner
ruling after the run.* A source is a place in the book, and places nest — an entity is
embedded in a section, a section belongs to a chapter — so a flat list ordered by
count scattered one chapter's sections and the entities inside them across two hundred
rows, and the reader had to reassemble the book from it. The rows are therefore
indented by containment. A container earns a row **even when its own narrative cites
nothing**: the chapter is part of the answer whether or not its prose joins in.

Three levels exactly, and that is a fact about the content rather than a cap: all 537
entities are embedded in a section, none directly in a chapter. A chapter
prologue/epilogue embed would be a child of its chapter, and proofs and remarks sit at
the entity level beside the theorem they belong to, because they are their own embed
blocks.

**A count is accumulated from the bottom up.** A section's count is its own
references plus every embedded entity's; a chapter's is its own plus all its
sections'. So on `gyuru-test`'s list the fourteen chapter rows account for all 548
references between them, and pressing a row promises exactly the marks it will get
(see *Going to a source* below) — a count that spoke only for the container's own
narrative would promise fewer.

**Rows are ordered by that count, highest first, within each level** — provisionally.
It is the only ordering available without inventing a relevance notion, and the
heaviest user of a node is a reasonable guess at the most useful one. Revisit once the
page exists and it is clear whether it reads well.

**A row is three stacked lines: where it leads, what it is, then how many.**
*Replaced by an owner ruling after the run.* Until then the count led the row from a
left-hand column, with the source's title beside it and its kind — definíció, tétel,
bizonyítás, megjegyzés, fejezet, szakasz — in words underneath. A row now reads top to
bottom:

- the **numbered name of the place it leads to**, at the body size, as the book writes
  that name: `16. Alice és Bob alaptétele` for a chapter, `16.1. Oszthatóság` for a
  section, `16.8. Tétel: Az asszociáltság tulajdonságai` for an entity. A proof's and a
  remark's first line names the **definition or theorem at the top of its ownership
  chain**, because that is what its page belongs to and what the reader recognizes —
  "Bizonyítás" on its own is the name of 190 different pages;
- on those rows only, **the rest of that chain**, smaller: `bizonyítás`, `megjegyzés`,
  or `bizonyítás → megjegyzés` for a remark attached to a proof. Each segment carries
  the node's authored title in parentheses when it has one; no proof or remark in the
  content has one today, so today every one of these lines is one or two bare words.
  96 of `gyuru-test`'s 236 rows have this line;
- the **count**, last, in that same smaller size and a lighter grey. It qualifies a
  place the reader has already read rather than leading the row.

**The kind is no longer a word of its own** — the ruling above supersedes phase 14's,
which added one. The lines say it: a chapter's number is `16.` where a section's is
`16.1.`, and an entity's name carries its type word, the *authored* one where the
content has one (three of `gyuru-test`'s rows read `Lemma` and one `Következmény`
rather than `Tétel`). Measured over the local export's backlink lists, **no two rows of
one list share these lines**, where **10 groups of rows shared a title and a kind**
under the previous design. "Oszthatóság", the case phase 14's label was added for, is
now three rows that read differently: `16.1. Oszthatóság` (the section, 34), `16.1.
Definíció: Oszthatóság` (the definition, 2), and the same over `megjegyzés` (the remark
on that definition, 2) — the number alone does not separate the first two, since
chapter 16's first section and its first definition are both "16.1.".
`data-backlink-source` still carries the kind for markup that needs to target it.

**The list can be very long.** Measured on the content: the entity with the most
inbound references, `gyuru-test`, is cited by **222 distinct sources** (**548**
references — the 549 this subsection carried until phase 14 was one too many, see
[§9.1 note 2](#91-notes-from-deriving-10--measured-not-assumed)), while the median
entity has **2** — **1** counting only the sources whose rows the panel actually
renders, which is what §9.1 note 1 measures. Grouping makes those 222 sources **236
rows** — 14 chapters, 60 sections, 162 entities — because of the containers that cite
nothing themselves. The design has to hold both ends without branching — hence the
panel's internal scroll (§6.4). Sizing the layout for the median case and letting the
236-row case degrade is the failure mode to avoid.

The filtered variants use the same list, narrowed:

- selecting a **term** in Fogalmak mode shows only the inbound references targeting
  **that term**, below the term's canonical form and the node that defines it;
- selecting a **claim** in Állítások mode shows only the inbound references targeting
  **that claim**.

**Identity first, in every panel.** *Corrected by an owner ruling during phase 16.*
This subsection used to put the references "above the term's canonical form and
synonyms" — references first. Phase 16's own text listed identity first, and the
ruling is that identity comes first: the heading names the thing, the line under it
qualifies it, and the list follows. The wording here was the error; the code is
right, and `ReferencePanel` (§7.1) follows the same order so that three panels read as
one design.

So the Bejövő hivatkozások panel is the unfiltered case of the same thing, and all
three should look like one list rather than three designs. They are literally the same
component — `BacklinkList`, called with a different array.

*Row layout was fine-tuned after the run, and the three lines above are where it
landed.* What is settled: grouped by source, one row per source, nested by where in
the book that source is, a count per row accumulated over everything nested under it,
each row naming the numbered place it leads to, and book sections and chapters included
alongside entities.

#### Going to a source

A row is a link. Following it takes the reader to the source — and **on arrival, every
reference in that source that points back here is marked**, with the same shrinking
rectangle used for an ordinary anchor arrival (§6.2).

**What gets marked is everything inside what was pressed.** *Corrected by an owner
ruling after the run.* The first build attributed a reference to whichever owner wrote
it and marked only those, so a section row lit the section's own nine and left the
thirteen written by the theorem and proof embedded in it dark. But the row's count is
accumulated over exactly those too, so the row promised more than the page delivered.
The marks are now the whole subtree the row names — which is also what makes a chapter
row, whose page has no fragment at all, mark its whole chapter.

The worked case: the reader has selected a term on a theorem page, and the panel says
a particular section references it thirteen times. Following that row opens the chapter
page, and all 22 renderings of those references are marked — the section's own and the
embedded theorem's, proof's and remark's alike.

> **The worked case marks 22 elements where the row reports 13. That is not a
> defect** — recorded here so the next reader does not treat it as one. A row's count
> is over reference *entries*, while a mark is a *rendered* link, and the section alone
> writes its five entries **3, 3, 1, 1 and 1** times. Both numbers are right about
> different things. `e2e/kb-highlight.test.ts` asserts both, and says so in its own
> header comment.

**The page scrolls to the first of those references**, not to the section heading.
The section anchor was only ever a proxy for "the references are somewhere in there";
on a long section it would leave the reader at the top with the marks animating
off-screen, so the effect would fire and they would see nothing.

*Why mark them at all:* a reader who arrives from this panel is not asking "what is
this section about?" They already know the answer to that — they came here for the
specific places this section leans on the thing they were reading. Dropping them at
the section start and leaving them to find those places is the panel answering a
question and then withholding the answer.

This is the counterpart of §7.1. Outgoing: see what a reference points at, without
leaving. Incoming: go to a source, and land on the exact places it cites you.

**Availability.** The item is always present, so the panel needs a real **empty
state** — measured on the content, roughly half the nodes have no inbound references
at all, and most proof and remark pages will land there. "Nincs rá hivatkozás" is a
legitimate answer to the reader's question, not a failure, and it should read that
way.

---

## 8. Decision log

### D1 — An outgoing reference stays a real link *(settled)*

Clicking a reference in the body opens the panel (§7.1) rather than navigating, but
the mark remains an anchor with a genuine `href`. Only the plain click is
intercepted; middle-click, ctrl-click and "open in new tab" navigate as usual.

*Why:* crawler discoverability is the reason this ticket exists. A reference that is
a JavaScript-only control is invisible to the crawlers the knowledge base is being
built for, which would defeat the point of giving every node a URL. The cost is that
plain click and modified click do different things — accepted knowingly.

### D2 — One "back" step, four ways to take it *(settled)*

A panel opened from the body (§7.1) puts the menu into the same open state any other
panel produces, with a matching "Vissza". **Escape** and **a click on the dimmed
area** both do what "Vissza" does — step back one state — as does the browser's
**Back** button (§6.2).

*Why:* "Vissza" is a back step rather than a close (§6.2), and every other way out
should mean the same thing. Escape or a stray click collapsing the whole stack at
once would make the two halves of the page disagree about what "back" means.

### D3 — Icon assignment *(settled)*

`menu.png` → Menü, `back.png` → Vissza, `incoming.png` → Bejövő hivatkozások,
`paragraph.png` (`§`) → Állítások, `star.png` → Fogalmak, `target.png` → Kontextus.

`definition.png`, `theorem.png`, `proof.png` and `remark.png` are no longer menu
icons — see D4 — and remain available for the ownership-chain links if wanted there.

### D4 — The ownership chain is links, not menu items *(settled)*

Movement to a proof, a remark, or a parent leaves the page, so it is a set of plain
links below the body (§6.1) rather than menu items. The parent link carries an up
arrow, the child links a down arrow.

*Why:* a menu item that navigates is a link wearing a button, and the menu is for
things that happen *on* this page. It also removes a problem rather than solving one:
a menu item has to pick one proof when there are several, while a list simply has
more entries — so the "go to the first" fallback is gone, and the chain sits in the
served HTML where a crawler reads it.

### D5 — Arriving at an anchor marks the target *(settled)*

A fragment arrival scrolls as it does today and additionally marks the target with a
shrinking rectangle that frames it briefly and disappears — **for embedded entities,
terms and claims only**. Sections and parts scroll without a mark.

*Why:* a term is a few words inside a paragraph; scrolling alone does not tell the
reader which part of the screen they were sent to. A section or part anchor lands on
a heading bearing its own name, so the same marker would be noise. See §6.2 for the
full inventory of anchor kinds this was checked against.

The same mark is reused for arrivals from a "Bejövő hivatkozások" row, where what is
marked is the set of *references* pointing back at the reader's origin, and the page
scrolls to the first of them rather than to the source's own anchor (§7.2, D7).

### D6 — Relational content is server-rendered, not client-generated *(settled)*

Panel contents — inbound-reference lists, embedding context, term and claim details —
are in the served HTML from the first byte and merely revealed when a panel opens.
Generalized in §2.1 to: **anything that can contain an internal cross-link is
server-rendered.**

*Why:* the inbound-reference lists are the edges of the knowledge graph, and exposing
that graph to crawlers is the whole point of the ticket. Putting them behind a click
handler hides the most valuable part of these pages from the readers the work is for.

### D7 — How the arrival highlight is transmitted *(settled)*

Three parts:

1. **Every rendered reference carries `data-target-fqn`** — the fully qualified name
   of what it points at.
2. **Following a source row appends a query parameter** naming the FQN to highlight.
   The parameter is added by the client at click time, so the served HTML keeps clean
   hrefs and crawlers never see the variant.
3. **The arrival page scrubs the parameter** once it has applied the effect, so it
   never reaches the address bar, a copied link, or an index.

*Why the FQN:* the identifiers sub-plan already made it the canonical target string
and the graph's map key, so this introduces no new identity concept and needs nothing
computed at render time. It also serves the parent plan's H.3 claim/term ↔ backlink
cross-highlighting, which was specified against the pre-FQN target shape — one
attribute, two features.

*Why a query parameter, rather than something that leaves the URL untouched:*
references render as `target="_blank"` links today
([InlineText.tsx:223](../../apps/website/components/content/InlineText.tsx#L223)), so
arrival can be a **cold load in a fresh tab**. That rules out `sessionStorage`, the
client router carrying intent in memory, and `history.state`. Encoding it in the
fragment is worse: the fragment is already spent on the scroll target, and
overloading it would break native no-JS scrolling. A query parameter leaves the
fragment alone, is ignored harmlessly when unhandled, and survives a cold load. It
wins by elimination rather than by being elegant.

*Three conditions on the implementation:*

- **Validate the parameter against the FQN character rule before it reaches a
  selector.** The sub-plan's rule makes an FQN strictly `[a-z0-9-]` segments joined
  by dots, so anything else is rejected outright — otherwise a URL parameter flows
  into `querySelectorAll`.
- **Carry the FQN and nothing else.** Where to scroll is derivable from where the
  matches are; extra parameters are more URL surface and more to keep in sync.
- **Mind the existing scrubbers.** `NewsletterLanding` and `ConsentGate` already
  scrub query parameters in their mount effects, and
  [layout.tsx](../../apps/website/app/layout.tsx) records that their order and their
  re-reading of `window.location.search` is deliberate so neither clobbers the
  other's parameters. A third scrubber joins that arrangement and needs the same care.

### D8 — No "Uses" block on a proof page *(settled)*

The design plan's §7.3 gave a proof page a "Uses" list — every definition, theorem
and claim the proof cites. It is not built.

*Why:* the proof's body already contains exactly that list, in the order the argument
uses them, with each one a real link (D1). A separate block would restate the same
edges out of order and out of context, and add a maintenance surface for no new
information. The same reasoning applies to a "defined terms" list: Fogalmak (§6.2)
gives the reader the terms in place rather than as a duplicate roster.

---

## 9. Open questions

*None outstanding for the UX.* Everything raised while writing §§2–7 is settled and
recorded in §8.

Two data-shape prerequisites were raised here and are **deliberately not UX
questions** — they belong to the implementation design that follows this document:

- The inbound-reference lists (§7.2) need a backlink index; the identifiers sub-plan
  removed the previous one (its S4), so one has to be built against fully qualified
  name targets.
- The glossary (§4) needs synonyms in its projection; they are authored on the term
  definition but the glossary entry does not carry them today.

Both are noted so the implementation design starts with them already on the list, not
because the UX depends on an answer.

### 9.1 Notes from deriving §10 — measured, not assumed

Everything below was measured while writing the phases, on the real content at
`content 8a9a364` and the real code on this branch. Nothing here reopens a §8
decision; each is a fact a phase has to be built against, and each is attached to
the phase that owns it.

> **Checked against the finished build, at the end of phase 21.** Two notes moved.
> **Note 4's glossary counts** are now **341 rows, 217 canonical and 124 synonyms** —
> a content fix during the run removed a duplicated synonym; see the note. **Note 5's
> "0 occurrences of `tudasbazis`" is historical**: the export now has **540** pages
> under that segment and `check-anchors` checks **22 594** fragment links, up from
> 11 086.
>
> Re-measured and unchanged: note 1 in full (537 / median 1 / 244 empty and the
> distribution `244, 164, 73, 42, 14`; 389 / median 1 / 168 empty and
> `168, 117, 55, 36, 13`; 293 pages with any, median 5; 129 over five rows, 56 over
> twenty); note 2 (548 from 222 local, 533 from 207 deployed); note 3's **3789**
> distinct pairs and its 207; note 9 (190/190 proofs and 72/72 remarks carry no
> authored title, so 262 of 537). Note 3's `467 / 353 / 114` breakdown is over the
> *pre-filter* fold, which the shipped index no longer exposes, so it stands as
> recorded rather than re-verified. Notes 6, 7 and 8 are statements about the code and
> are discharged: the nav item and the homepage block are still parent phases J.1–J.2
> (see [§12](#12-what-actually-landed)), `data-target-fqn` did come off
> `ref.target.fqn` at the point `InlineText` emits the anchor, and the icons are
> generated into `public/assets/generated/kb-menu/` by `scripts/gen-kb-menu-icons.mjs`.

**1. The panel's row counts.** §7.2 says the median entity has 2 inbound sources. That
figure is recoverable only by counting every authored source, including the ones whose
own page this build does not generate (note 3). Counting what the panel would actually
render, the median is **1** in both env modes:

| set | pages | median sources shown | pages with an empty panel |
|---|---|---|---|
| local build — every embedded node | 537 | 1 | 244 (45%) |
| `SITE_ENV=staging` — the pages that ship | 389 | 1 | 168 (43%) |
| local, counting only pages that have any | 293 | 5 | — |

Distribution, which is what the panel has to hold — local (537 pages) and deployed
(389):

| sources | 0 | 1–5 | 6–20 | 21–50 | 51+ |
|---|---|---|---|---|---|
| local | 244 | 164 | 73 | 42 | 14 |
| deployed | 168 | 117 | 55 | 36 | 13 |

So "median 2, maximum 222" understates the middle from both ends: nearly half the
panels are empty, and **129** of the 537 need more than five rows, **56** more than
twenty. The conclusion §6.4 draws (one list, internally scrolled, header pinned) is
unchanged and better supported than the median suggested.

**2. `gyuru-test` is 548 references from 222 sources, not 549.** §7.2 said 549 (§6.4
quotes the 222 sources but no reference count); the count over the built graph is 548
from 222 distinct sources. On a deployed build it is **533 references from 207
sources** — see note 3. The design conclusions are unaffected. *Discharged:* phase 14
cited the measured numbers, §7.2 has been corrected to 548, and
`components/kb/panels/BacklinksPanel.tsx` carries 222/207 in its header comment.

**3. A backlink source can be a page this build does not generate.** Of the **3789**
distinct (target, source) pairs, **467** have a source with no page on a deployed
build:

| dropped source kind | pairs | what a row would link to |
|---|---|---|
| proof / theorem / definition / remark | 353 | **a 404** — `kbPageExists` is false for it |
| section / chapter | 114 | a chapter page that renders as a not-migrated stub |

The first 353 must be filtered — a panel row that 404s on staging is exactly the class
of bug `validateKbLinks` exists to prevent. The second 114 is a judgement call that
belongs to phase 2: the URL resolves, so nothing breaks, but the row answers "where is
this used?" with a stub. `gyuru-test` is the cheapest way to see the difference — 222
sources locally, **212** on a deployed build with stub sources kept, **207** with them
dropped. Either way the empty state of §7.2 is reached by **168 of the 389** shipped
pages.

**4. A glossary row cannot be keyed by its name.** §4's one-row-per-name list comes
to **341 rows**: 217 canonical forms plus **124** synonyms, spread over 83 terms that
have at least one. Those names are not unique — 9 canonical forms are carried by more
than one node (already known, [parent D5](yp-162-knowledge-graph-urls-implementation-plan.md#d5--glossary-grouping-for-duplicate-terms-settled--shipped-in-phase-4)),
13 of the 110 distinct synonym strings occur more than once, and **6 synonyms are also
somebody else's canonical form** (`egységelem`, `inverz`, `maradékosztálygyűrű`,
`nullelem`, `szorzás`, `összeadás`). A row is therefore identified by (owner, term key,
name), and two rows may legitimately carry the same visible text and point at different
nodes — which is also why §4 requires a synonym row to name its canonical form.

> **The counts here were 342 rows / 125 synonyms / 14 repeated synonym strings when
> this note was written, and every target in this document written before phase 4 is
> off by one.** A content fix during the run removed a duplicated synonym:
> `gyuru-test.yaml`'s `multiplicative-identity` listed `egységelem` among its **own**
> canonical form's synonyms, so the same name would have appeared twice on the index,
> both rows linking to the same anchor. Fixed in the content repo as `fb76f03` on
> `feat/yp-162-knowledge-graph-pages` ("Stop a term from listing its own canonical form
> as a synonym"); the only term in the content doing it.
> `multiplikatív egységelem` stays — a real alternative name. The corrected figures
> above are what the built page renders: `grep -o 'data-filter-text="'
> out/hu/tudasbazis/fogalmak.html | wc -l` is 341.

**5. The anchor gate decides where the routing phase can stop.**
[`scripts/check-anchors.mjs`](../../apps/website/scripts/check-anchors.mjs) reads the
built HTML and skips fragments whose target page is absent from the export. So the
moment an entity route exists, every `…#fogalmak.{f}` and `…#allitasok.{c}` pointing
into it is checked against the ids that page actually renders — and a placeholder
entity page fails the postbuild gate. That is why phase 5 routes the four list pages
only, and the entity routes land in phase 9 together with the body that renders those
ids. Today the export contains **0** occurrences of `tudasbazis`, so nothing is
checked yet.

> *Historical, and it held.* The split worked: phase 5 shipped the four list pages
> with a green gate and phase 9 shipped the 537 entity pages with a green one. The
> finished export has **540** pages under `tudasbazis` and `check-anchors` reports
> **22 594** fragment links across 587 pages, **0 broken, 0 skipped** — up from
> 11 086 across 46.

**6. Where the shell work already has an owner.** The nav item and the homepage entry
block that §2 assumes are parent phases [J.1 and J.2](yp-162-knowledge-graph-urls-implementation-plan.md#j-phase-7--navigation-discovery-internal-linking-services--done-529f953);
§10 does not duplicate them. Breadcrumb chains are inseparable from the pages that
carry them, so they land in phases 5 and 9 — which discharges parent J.3.

**7. The interactive layer has no existing hook in the body markup.**
[`InlineText.tsx`](../../apps/website/components/content/InlineText.tsx) emits
**global** class names, not CSS-module ones — a reference is
`<a class="ref-concept" target="_blank">` ([line 223](../../apps/website/components/content/InlineText.tsx#L223))
and a term is `<span class="term" id="…">` with no style attached to `.term` at all.
So the reveal, inert and marked states of §§6.3/7.1 are expressible from a global
stylesheet without touching the block components, and `data-target-fqn` (D7) has
`ref.target.fqn` available at the point the anchor is emitted. The `target="_blank"`
is also why D7 must survive a cold load.

**8. The menu icons are not yet assets.** The six icons D3 assigns are 512×512 PNGs
in [`entity-page-menu-icons/`](entity-page-menu-icons/), outside the app. The repo's
idiom for this is a source asset under `apps/website/assets/` plus a `sharp`
generator in `scripts/gen-*.mjs` writing to `public/assets/generated/`, wired into
`prebuild`/`predev` — see `gen-og-images.mjs`. Phase 11 does that and nothing else,
so a 512px icon never reaches a 44px button.

**9. On 262 of the 537 pages, §6.1's two header lines say the same thing.** A proof and
a remark carry no authored `title` (0/190 and 0/72, measured), and `kbNodeTitle`
derives one from the owner: `Bizonyítás: {theorem title}`. The label line above it is
built from the same word — `ENTITY_LABEL_HU['proof']` — so a proof page's header would
read `BIZONYÍTÁS` / `Bizonyítás: Euler–Fermat tétel`. §6.1 already says what to do
("a node without a title shows only the label"), and the fix is to read `node.title`
for the header while keeping `kbNodeTitle` everywhere a node needs a *standalone* name
— the breadcrumb leaf, `<title>`, an index row, a backlink row — which is what parent
H.4's one-helper rule is for. Phase 9 has to make the call explicitly rather than
reach for the helper by reflex.

---

## 10. Phases

> **All 21 phases have shipped.** This section is the build order as it was written,
> kept as the record of why the order was what it was. It is corrected in place at the
> points where the build proved a figure or a gate command wrong, each correction marked
> as such. **[§12](#12-what-actually-landed) is what actually landed** — the commits,
> the divergences, the final measurements, and what is still outstanding. Read that
> first if you want the state of the code rather than the plan for reaching it.

Twenty-one phases, deliberately narrow. The order is a consequence of the layout, not
an input to it: the documents that still describe the old design are corrected first,
then the data shapes §§4 and 7.2 need, then the pages that have no incoming fragments,
then the entity page, then one interaction at a time.

Phase 1 is documentation and comes before the two §9 prerequisites on purpose. §7 of
the design plan and §H of the parent both currently specify a different page — a
component table, a "Uses" block, an `aria-pressed` selection model — and every phase
below promises a session that a short reading list is enough. That promise is false
while a document a reader might reasonably open contradicts this one.

### How to read a phase

Each phase below is written to be **the only thing a session has to read**, plus the
one or two source files it names. A phase states its files, its reading list, what
"done" means as a command, and its gate. If a phase seems to need the whole design in
mind, that is a defect in the phase, not in the reader — say so and split it.

What is *not* repeated in every phase, because it holds for all of them:

- **The working agreement at the top of this document applies to every phase.**
  Nothing is committed or pushed without approval; after a commit, stop and wait for
  separate approval before starting the next phase.
- **Node.** `engines` requires ≥ 24.18, and the bundled `pnpm` refuses to run at all
  below 22.13 — which is what a default PATH here produces. `nvm use` first; the
  failure mode is a `pnpm` error that looks nothing like the task.
- **Commands.** All of them run in `apps/website`:
  `pnpm typecheck`, `pnpm test`, `pnpm build`, `SITE_ENV=staging pnpm build`
  (the shell variable wins over `.env.local` — verified), and
  `find out -name '*.html' | wc -l` for the page count. `pnpm build` runs
  `set-html-lang.mjs`, `check-build-version.mjs`, `check-analytics-build.mjs` and
  `check-anchors.mjs` as `postbuild`, so a green build is already three checks and a
  `<html lang>` rewrite. `check-anchors` is the one that matters most below.
- **Baseline, measured on this branch today, not quoted from the parent plan:**
  46 HTML pages in both env modes, 14.3 s wall for `pnpm build` including `prebuild`,
  **96/96** tests passing, 11 086 internal fragment links checked with 0 broken, and
  **0** occurrences of `tudasbazis` anywhere in the export. *(Each of these five is
  re-measured at the end of the run in [§12.3](#123-the-measurements).)*
- **Localized strings** come from `lib/i18n/locales.json`. The four labels these
  pages need — `knowledgeBase`, `definitionsIndex`, `theoremsIndex`, `glossary` — and
  every container segment already exist there. No new literal belongs in a component.
- **Every URL** goes through `buildLocalizedUrl` / the `urlFor*` helpers in
  `lib/content/urls.ts`. All ten KB `UrlKey`s shipped in parent phase 4; nothing here
  constructs a path by hand.

### Phase table

| # | phase | § it builds | new files? |
|---|---|---|---|
| 1 | Amend the documents this design supersedes | — | docs only |
| 2 | Backlink index against FQN targets | 7.2 | no |
| 3 | Glossary projection carries synonyms | 4 | no |
| 4 | One row per name, and one Hungarian collation | 4, 5 | no |
| 5 | KB routing and the page shell — the four list pages | 2 | yes |
| 6 | The knowledge-base root page | 3 | yes |
| 7 | The glossary page and the shared list filter | 4 | yes |
| 8 | The definitions and theorems index pages | 5 | yes |
| 9 | Entity routes: label, title, body, q.e.d. | 6.1 | yes |
| 10 | The ownership-chain links | 6.1, D4 | yes |
| 11 | The menu icons, as assets | 6.2, D3 | yes |
| 12 | The menu, the overlay, and one back step four ways | 6.2, 6.3, D2 | yes |
| 13 | The panel: shell, slide, scroll lock, and Kontextus | 6.4 | yes |
| 14 | Bejövő hivatkozások | 7.2 | yes |
| 15 | Selection modes, level 1: reveal | 6.3 | no |
| 16 | Selection modes, level 2: the detail panel and the upper half | 6.3, 6.4 | no |
| 17 | Outgoing references: inert, intercepted, and detailed | 7.1, D1 | yes |
| 18 | The arrival marker | 6.2, D5 | yes |
| 19 | `data-target-fqn`, the highlight parameter, and marking back-references | 7.2, D7 | yes |
| 20 | Print, no-JavaScript and reduced-motion sweep | 2, 2.1, 6.4 | no |
| 21 | Close out: measurements back into this plan and the parent | — | docs only |

**Phases 1–4 have no visible output** and phases 15–20 add no pages; the page count
moves exactly twice, at phase 5 (+4) and phase 9 (+389 deployed / +537 local).

*That held exactly.* The export ends at **46 + 4 + 537 = 587** locally and
**46 + 4 + 389 = 439** on staging. Commits per phase are in
[§12.1](#121-the-21-phases-and-their-commits); two phases marked "no" in the *new
files?* column did add files, and why is in [§12.2](#122-divergences-from-the-phases-and-why).

---

### Phase 1 — Amend the documents this design supersedes

**First, and before any code**, because every later phase's reading list is only
honest once the documents it might send a reader to have stopped describing the old
design. Two of them currently would.

**Files.**
- `docs/plans/yp-162-knowledge-graph-urls-plan.md` — §7.
- `docs/plans/yp-162-knowledge-graph-urls-implementation-plan.md` — the status
  paragraph at the top, §H, §D7, §J.3, §K.3, §R2.

**Read to start.** This phase text; §§3–7 and §8 of this document; §7 of the design
plan; §H of the parent plan. Nothing in the code.

**Do.**
- **Design plan §7** — a banner at the head of the section saying it is superseded by
  this sub-plan for everything about arrangement, and per-subsection notes for the six
  places the content list itself changed: §7.1/§7.2/§7.4 lose "Defined terms",
  "Remarks", "Referenced by" and "Embedding context" *as stacked blocks* (they become
  panel content and ownership links — §6.1, §6.2); §7.2 loses "Consequences" (already
  parent D6); §7.3 loses "Uses" (D8); §7.5 loses the excerpt and the "referenced by N"
  count and gains synonym rows (§4); §7.6/§7.7 lose the summary/preview line (§5). The
  breadcrumb chains at the head of §7 stay — this design uses them unchanged.
- **Parent §H** — replace the H.2 component table and H.3 wholesale with a pointer to
  this document: H.2's ten components are not the structure being built, and H.3's
  `button`-semantics-with-`aria-pressed` sketch is explicitly **not** part of this
  design (§11). Keep H.1 (routing) and H.4 (titles) as the requirements they are, each
  annotated with the phase below that owns it. Say plainly at the top of §H that the
  layout gate is **lifted** and that §10 of this sub-plan is the build order.
- **Parent status paragraph** — "gated on the page-layout design being settled" is no
  longer true.
- **Parent D7** ("do chapter and section referrers appear in Referenced by?") — settled
  by §7.2: yes, in the same list, grouped by source like any other. Mark it settled and
  point at §7.2.
- **Parent J.3 and K.3** — a note that breadcrumbs land per page phase (5 and 9), and
  that the backlink-index and glossary tests land in phases 2–4 rather than in phase 8.
- **Parent R2** ("thin content") — point at §7.2's empty state and note 3 in §9.1;
  the mitigation it records leans on "Uses" and "Defined terms", neither of which is
  built.

**Done when.** `pnpm test` is still 96/96 (this phase touches no code, so a change in
that number means something else happened); §7 of the design plan and §H of the parent
both open with a superseded/lifted note naming this document; and
`grep -n 'aria-pressed\|Uses.*proof\|Consequences' docs/plans/yp-162-knowledge-graph-urls-implementation-plan.md`
returns only historical mentions, none phrased as a requirement.

**Review gate.** The diff of the two documents is the review artifact. No code follows
until it is approved.

---

### Phase 2 — Backlink index against FQN targets

The first of the two §9 prerequisites. Pure data; no component, no page.

**Files.**
- `apps/website/lib/content/types.ts` — `KbBacklinkSource`, `KbBacklinks`, and
  `backlinks` on `ContentGraph`.
- `apps/website/lib/content/graph.ts` — `buildBacklinkIndex(graph)`, called from
  `buildGraphFromRaw`.
- `apps/website/test/kb-graph.test.mjs`, `apps/website/test/support/raw-graph.mjs`.

**Read to start.** This phase text; `lib/content/graph.ts` — specifically `refOwners`
(the documented seam for exactly this fold), `kbPageExists`, and `buildGlossary` as
the model for a derived projection; `test/support/raw-graph.mjs`.

**Do.**
- Fold over `refOwners(graph)`. For each reference with a path target, find the
  **owning entity** of the target: the target FQN itself if it is one of the 537
  nodes, otherwise the FQN minus its trailing `.claims.{c}` or `.terms.{t}` step.
  Everything else (books, chapters, sections, standalone items, external URLs) is not
  a KB target and is skipped.
- Group by (owning entity, source) and carry a **count**, per §7.2. A source is the
  `refOwners` owner: a chapter, a section, or one of the four entity types. Shape:

  ```
  KbBacklinkSource { kind; fqn; title; href; count }
  KbBacklinks       { all: KbBacklinkSource[]; byTarget: Map<string, KbBacklinkSource[]> }
  graph.backlinks:  Map<string /* owning entity FQN */, KbBacklinks>
  ```

  `all` is §7.2's unfiltered list; `byTarget` keyed by the *full* target FQN gives the
  per-term and per-claim variants of §7.2 with no second index and no filtering at
  render time.
- `href`: `urlForKbNode` for an entity source; the chapter URL for a chapter; the
  chapter URL plus `sectionAnchorId` for a section. `title`: `kbNodeTitle` for an
  entity, the chapter title for a chapter, the section title for a section.
- **Filter sources by page existence.** An entity source with `kbPageExists === false`
  is dropped — 353 pairs on a deployed build, each of which would be a 404 (§9.1 note
  3). For the 114 chapter/section pairs whose chapter is unpublished, decide and
  record the decision in this phase's summary; the recommendation is to drop them too,
  since the row promises the reader a place and delivers a stub.
- Order `all` and each `byTarget` entry by **count descending**, tie-broken by title
  with `localeCompare(…, 'hu')` — phase 4 replaces that call with the shared
  comparator.

**Done when.** `pnpm test` passes with new tests asserting, on the fixture graph: a
reference to a claim and one to a term both land under the owning entity; two
references from one source collapse to one row with `count: 2`; a chapter and a
section source appear in the same list; `all` is count-ordered; and a source whose
page does not exist is absent under `SITE_ENV=staging`. And, against the real content
(a throwaway script, not a committed test): `graph.backlinks.get('definitions.gyuru-test').all`
has **222** rows summing to **548** locally and **207** summing to **533** with
`SITE_ENV=staging` (**212**/**538** if unpublished-chapter sources are kept — the
decision above is visible right here); the index covers **293** of 537 nodes locally
and **221** of 389 on staging. `pnpm build` stays green and the page count stays at 46.

**Review gate.** The shape of `KbBacklinks` is the thing to review — every one of
phases 14, 16 and 19 reads it.

---

### Phase 3 — Glossary projection carries synonyms

The second §9 prerequisite, and the smallest phase here.

**Files.**
- `apps/website/lib/content/types.ts` — `GlossaryEntry`.
- `apps/website/lib/content/graph.ts` — `buildGlossary`.
- `apps/website/test/kb-graph.test.mjs`.

**Read to start.** This phase text; `buildGlossary` in `lib/content/graph.ts`; the
`TermDefinition` interface in `lib/content/types.ts` (which already has
`synonyms?: string[]` — the authored data is there, the projection just drops it).

**Do.** Carry `synonyms` onto `GlossaryEntry`, sourced from
`node.terms[termKey].synonyms`. Nothing else: no row expansion, no re-sorting — that
is phase 4. Keep the one-row-per-(owner, term key) rule that parent D5 settled.

**Done when.** `pnpm test` passes with a test asserting a synonym-carrying term's
entry exposes them and a synonym-less one exposes none or an empty list, and, against
the real content, `graph.glossary.length === 217` unchanged with **83** entries
carrying at least one synonym and **124** synonyms in total. *(125 as written; the
content fix in §9.1 note 4 landed after this phase and moved every synonym target in
this document down by one.)*

**Review gate.** Small enough to review as a diff.

---

### Phase 4 — One row per name, and one Hungarian collation

§4's list is an index of *names*, not of terms; §5's two pages sort on title with the
same collation. Both are pure data, so both land before any page renders.

**Files.**
- `apps/website/lib/content/glossary-rows.ts` *(new)* — the name-row projection.
- `apps/website/lib/content/collate.ts` *(new)* — the one comparator.
- `apps/website/lib/content/graph.ts` — use the comparator in `buildGlossary` and in
  phase 2's tie-break.
- `apps/website/test/kb-graph.test.mjs` or a new `test/glossary-rows.test.mjs`.

**Read to start.** This phase text; §4 of this document; `buildGlossary` in
`lib/content/graph.ts`; note 4 in §9.1.

**Do.**
- **The comparator.** One exported function wrapping `localeCompare(a, b, 'hu')` with
  the options settled here (at minimum `sensitivity` and `numeric`), so the glossary,
  both index pages and the backlink tie-break cannot drift apart. Two lookup tables on
  one site sorting differently is a defect (§5).
- **The rows.** Expand each `GlossaryEntry` into **one row per name**: the canonical
  form, plus one per synonym. A row carries its own `name`, the `canonical` it belongs
  to, whether it *is* the canonical, and the entry's `href`. Sort the whole list on
  `name` with the comparator — so a synonym sorts under its own initial, not its
  canonical's (§4).
- **Do not key a row by its name.** 341 rows over 206 distinct canonical forms and 110
  distinct synonym strings, with 6 strings that are both (§9.1 note 4). The identity of
  a row is (owner, term key, name).

**Done when.** `pnpm test` passes with tests asserting: a term with two synonyms
yields three rows; a synonym row names its canonical and points at the same `href`;
`á` sorts among `a` rather than after `z`; and the six strings that are both a synonym
and someone's canonical form yield two distinct rows with different `href`s. Against
the real content: **341** rows, of which **217** canonical and **124** synonym. *(342 /
125 as written — see §9.1 note 4.)*

**Review gate.** The row shape and the sort order are what phases 7 and 8 render.

---

### Phase 5 — KB routing and the page shell — the four list pages

Routing for `tudasbazis`, `tudasbazis/definiciok`, `tudasbazis/tetelek` and
`tudasbazis/fogalmak` only. **Not** the entity routes: the postbuild anchor gate
starts checking fragments into a page the moment it exists, so an entity page without
its term and claim ids fails the build (§9.1 note 5). Entity routes are phase 9.

**Files.**
- `apps/website/lib/i18n/config.ts` — flip `knowledge-base` to `true` in
  `ROUTABLE_AT_ROOT` (one line; the other KB keys stay `false`, which is what makes
  `/hu/definiciok` 404 rather than resolving).
- `apps/website/app/[locale]/[[...path]]/page.tsx` — four new `Resolved` variants, the
  `key0 === 'knowledge-base'` branch of `resolvePath`, four `generateStaticParams`
  entries per locale, and the `generateMetadata` cases.
- `apps/website/components/kb/KbPageShell.tsx` + `kb-page-shell.module.scss` *(new)* —
  header (`mode="inner"`), breadcrumb row, `<main>`, newsletter form, footer.
- `apps/website/lib/content/kb-breadcrumbs.ts` *(new)* — the chain builder.
- Four placeholder bodies under `components/kb/`, each rendering its title only.

**Read to start.** This phase text; §2 of this document; `app/[locale]/[[...path]]/page.tsx`
(the `resolvePath`/`generateStaticParams`/`generateMetadata` trio and the `chapter`
case of the dispatcher, as the model for the shell); `lib/i18n/url.ts` for the `UrlKey`s.

**Do.**
- Depths 1–3 in the KB branch: bare (`kb-root`), then `definition`/`theorem`/`term`
  segments as the three index pages. Depths 4–6 return `null` for now — phase 9 fills
  them in, and until then an entity URL 404s rather than rendering an empty page.
- `generateMetadata`: `ogType: 'website'` for all four; titles from the existing
  labels; the locale's `defaultDescription` is acceptable for four pages (the
  duplicate-description problem §H.1 flags is about the 389 entity pages, and belongs
  to phase 9).
- The breadcrumb builder handles all **seven** kinds now, including the three entity
  chains, so phase 9 adds no breadcrumb code. A remark's chain follows its actual
  ownership (§2).
- The shell puts the newsletter form at the bottom of the main area, above the footer,
  exactly as `StandaloneRoute` and `SiteFooter` already do it.

**Done when.** `pnpm build` emits **50** HTML files (46 + 4) in both env modes,
`check-anchors` reports 0 broken, and all four URLs render the shell with the right
breadcrumb chain: `/hu/tudasbazis`, `/hu/tudasbazis/definiciok`,
`/hu/tudasbazis/tetelek`, `/hu/tudasbazis/fogalmak`. `/hu/definiciok` and
`/hu/tudasbazis/definiciok/gyuru-test` both 404. `pnpm typecheck` clean. A test
asserting the breadcrumb chain for each of the seven kinds, the proof-remark chain
included.

**Review gate.** The shell and the breadcrumb chains, since phases 6–9 all sit inside
them.

---

### Phase 6 — The knowledge-base root page

**Files.**
- `apps/website/components/kb/KbRootPage.tsx` + `kb-root-page.module.scss`.
- `apps/website/lib/i18n/locales.json` — three one-line section descriptions and the
  count nouns, as labels. No Hungarian literal in the component.

**Read to start.** This phase text; §3 of this document; `components/kb/KbPageShell.tsx`
from phase 5; `kbPageExists` in `lib/content/graph.ts`.

**Do.** Three cards of equal weight — Definíciók, Tételek, Fogalmak — each with the
section name, its one-line description, and its count, side by side on desktop and
stacked on mobile (§3). The count is legible at a glance rather than buried in the
sentence. Counts are the **published** counts: `kbPageExists`-filtered node counts for
the two type indexes, so the root page and the page it links to can never disagree
(§3).

**One thing to decide and record here.** Fogalmak has two defensible counts: **217**
terms, or the **341** rows the page actually lists (§9.1 note 4). §3's rule is that the
root page must not advertise a number the index contradicts, which argues for 341 —
but "341 fogalom" is not true, since 341 is a count of names. Pick one, say it in the
card's wording rather than leaving a bare number, and make the glossary page's own
count agree (phase 7).

*Decided in phase 6:* the card says both, in words — the wording lives in
`locales.json` and `test/locale-labels.test.mjs` asserts that the two glossary counts
read as rows and the terms they name, so the row count and the term count can never be
presented as the same number.

**Done when.** `pnpm build` and `SITE_ENV=staging pnpm build` both green, and the
definition and theorem counts on the rendered page equal those index pages' own counts
in the same env: **84 / 191** locally and **63 / 136** on staging. Check it as a
command, not by eye — grep the counts out of `out/hu/tudasbazis.html` and compare with
the index pages' rendered counts once phase 8 lands, and against the graph until then.

**Review gate.** Visual; the card treatment is explicitly provisional (§3), so this is
the phase to iterate in.

---

### Phase 7 — The glossary page and the shared list filter

**Files.**
- `apps/website/components/kb/GlossaryPage.tsx` + `glossary-page.module.scss`.
- `apps/website/components/kb/ListFilter.tsx` + `list-filter.module.scss` *(new,
  client)* — reused verbatim by phase 8.
- `apps/website/lib/i18n/locales.json` — filter placeholder, "nincs találat", the
  clear-filter label, the synonym-row wording.

**Read to start.** This phase text; §4 of this document; `lib/content/glossary-rows.ts`
from phase 4.

**Do.**
- The full **341-row** list, server-rendered in name order, every row a link to the
  defining anchor. This is the crawler's view and the no-JavaScript view; the filter
  narrows what is already there and never produces it (§2.1, §4).
- A **synonym row names its canonical form** — the destination carries a different name
  than the row, so without it the landing looks wrong (§4). Canonical and synonym rows
  may look different but neither reads as second-class.
- `ListFilter` is the only client component: immediate, no submit, matching row text,
  with an empty state and a one-action clear (§4). It takes the rows as children and
  filters DOM nodes it did not create, so it works the same for phase 8's title lists.
- Alphabetical section markers are worth trying but must not leave empty headings
  behind when filtering (§4) — if that costs more than it gives, drop them and say so.

**Done when.** `pnpm build` green;
`grep -o 'data-filter-text="' out/hu/tudasbazis/fogalmak.html | wc -l` is **341**; with
JavaScript disabled the page still lists and links all 341; filtering to a string no row
contains shows "nincs találat" and clearing restores 341. A test on the row projection is
already in phase 4, so this phase's test surface is the filter's matching, if it is worth
one.

> *Two corrections to this gate, both settled in phase 21.* The count is **341**, not
> 342 (§9.1 note 4). And the command was `grep -c 'class="[^"]*glossary-row' …`, which
> **can only ever print 0 or 1**: the exported HTML is a single line and `grep -c`
> counts *lines*, not matches. `grep -o … | wc -l` is the form that counts occurrences.
> The same mistake is in phases 13 and 19 and is corrected there too — see the note
> under phase 13.

**Review gate.** Visual, plus the no-JavaScript check. Row layout is provisional (§4).

---

### Phase 8 — The definitions and theorems index pages

One design, two instances (§5). If the two files diverge beyond the type they list,
the phase has gone wrong.

**Files.**
- `apps/website/components/kb/KbTypeIndexPage.tsx` + `kb-type-index-page.module.scss`.
- `apps/website/app/[locale]/[[...path]]/page.tsx` — pass the type through.

**Read to start.** This phase text; §5 of this document; `components/kb/ListFilter.tsx`
and `lib/content/collate.ts`; `kbNodeTitle` in `lib/content/graph.ts`.

**Do.**
- One line per node: **title first**, then the label in grey — `Euler–Fermat tétel —
  15.6. Tétel`. Dense, scannable, no preview line (§5).
- Sorted by title with phase 4's comparator. Filter by title, same `ListFilter`.
- A count of what is shown, and of what matches while filtering (§5).
- The grey label must still clear the contrast floor — it is the only in-page cue to
  where a node sits in the book (§5).
- **A title fallback**, even though it cannot fire today: 84/84 definitions and 191/191
  theorems carry an authored title (measured). `kbNodeTitle` already implements the
  chain; use it rather than reading `node.title`, so a future untitled node sorts
  somewhere defensible instead of first.
- Whether labels are right-aligned into a column or trail the title after a separator
  is an implementation call — try both (§5).

**Done when.** `pnpm build` green; the two pages' rendered counts are **84** and **191**
locally and **63** and **136** with `SITE_ENV=staging`; the first and last rows of each
are the Hungarian-collation first and last, not the code-point ones; the two components
differ only in the node set and the labels they are given.

**Review gate.** Visual, both pages side by side. Provisional per §5.

---

### Phase 9 — Entity routes: label, title, body, q.e.d.

The page count moves from 50 to **439** (staging) / **587** (local) here. Everything
relational is later phases; this one is the reading surface (§6.1).

**Files.**
- `apps/website/app/[locale]/[[...path]]/page.tsx` — KB branch depths 4–6, the four
  entity `Resolved` variants, `generateStaticParams` filtered by `kbPageExists`, and
  `generateMetadata` with a per-node excerpt.
- `apps/website/components/kb/KbEntityPage.tsx` + `kb-entity-page.module.scss` *(new)*.
- `apps/website/lib/content/kb-excerpt.ts` *(new)* — first narrative block, truncated.

**Read to start.** This phase text; §6.1 of this document;
`components/content/EmbeddedEntity.tsx` and `components/content/ChapterPage.tsx` (for
the label/title treatment and how `embedIndices`/`figureIndices` are built);
`kbRefs`, `ownPageScope` and `kbAnchorPath` in `lib/content/urls.ts`.

**Do.**
- **Header, two lines.** The entity's label (`1.14. Tétel`) styled like
  `chapter-page_chapter-label`, and the title styled like `chapter-page_chapter-title`.
  A node with no title shows the label alone (§6.1) — which is 0 of 275 definitions and
  theorems but **all 262** proofs and remarks. Read `node.title` here, not
  `kbNodeTitle`: the derived title is built from the same word as the label, so the
  helper would print the type twice (§9.1 note 9). `kbNodeTitle` is still what the
  breadcrumb leaf, the `<title>` and every list row use.
- **Body**, rendered the way the same entity renders when embedded: `ContentBlocks`
  with the same typography, LaTeX, claim and term treatment. Two things must be right
  or the anchor gate catches it:
  - refs go through **`kbRefs()`** so a reference on a KB page points at the target's
    KB page rather than at a chapter anchor (parent A20/R6 — this phase is where that
    two-href machinery is first exercised end to end);
  - claim and term anchors use **`ownPageScope(node)`**, not `embeddedScope(node)`: on
    its own page the node drops out of the path, so a term is `#fogalmak.{f}` and not
    `#definiciok.{d}.fogalmak.{f}` (identifiers sub-plan §3.2).
- `embedIndices`/`figureIndices` are chapter-scoped (parent A17): borrow them from
  `graph.embedding.get(key).chapter`, the way `ChapterPage` builds them.
- **q.e.d.** closes the content: `∎` for a proof, `♣` otherwise (§6.1).
- `generateMetadata`: `ogType: 'article'`, and a real per-node `excerpt` — 389 pages
  sharing `defaultDescription` is a duplicate-description finding waiting to happen
  (parent H.1).

**Done when.** `SITE_ENV=staging pnpm build` emits **439** HTML files and `pnpm build`
emits **587**; `check-anchors` reports 0 broken across all of them — that is the real
gate, because it is the first build in which KB-page fragments are checked at all, and
it will be checking far more than 11 086; `pnpm typecheck` clean. Spot-check one page
of each of the four types in both env modes. Re-measure build wall time against the
**14.3 s / 46-page** baseline and record it (parent R8).

**Review gate.** The body must be recognisably the same object the reader met in the
book (§6.1) — compare an entity page against the same entity embedded in its chapter,
side by side.

---

### Phase 10 — The ownership-chain links

**Files.**
- `apps/website/components/kb/OwnershipLinks.tsx` + `ownership-links.module.scss`.
- `apps/website/components/kb/KbEntityPage.tsx` — render it below the body.

**Read to start.** This phase text; §6.1's ownership-chain subsection and the second
table in §6.5; `urlForKbNode` in `lib/content/urls.ts`.

**Do.** A short list of plain links below the body: **up** to the parent (a proof to
its theorem; a remark to its definition, theorem or proof) and **down** to each
attached child (a theorem to each proof and each remark; a definition and a proof to
each remark). An arrow in the link marks the direction (D4). A remark owns nothing, so
it gets exactly one link; definitions and theorems have no parent, so they get none.
Ordinary `<a>` elements in the served HTML — this is the ownership graph a crawler
reads (§6.1). Filter by `kbPageExists` so a link to an unpublished child does not 404.

**Done when.** `pnpm build` and `SITE_ENV=staging pnpm build` green with `check-anchors`
at 0 broken; a theorem with several proofs shows one link per proof, not a "first one"
fallback (D4); every link resolves in both env modes.

**Review gate.** Visual, plus a check that no link 404s on staging.

---

### Phase 11 — The menu icons, as assets

Deliberately its own phase so no later one has to think about image pipelines, and so
a 512 px PNG never reaches a 44 px button.

**Files.**
- `apps/website/assets/kb-menu/{menu,back,incoming,star,paragraph,target}.png` — the
  six D3 assigns, copied from [`entity-page-menu-icons/`](entity-page-menu-icons/).
- `apps/website/scripts/gen-kb-menu-icons.mjs` *(new)*.
- `apps/website/package.json` — add it to `prebuild` and `predev`.

**Read to start.** This phase text; D3; `scripts/gen-logo-lockup.mjs` (the shortest
example of the `sharp`-generator idiom).

**Do.** Downscale each source to the sizes a 2.75 rem circular button needs and write
them to `public/assets/generated/kb-menu/`, following the existing generator
convention: source asset in `assets/`, generated output in `public/assets/generated/`,
wired into `prebuild`/`predev`. `definition.png`, `theorem.png`, `proof.png` and
`remark.png` are **not** menu icons (D3/D4) and are not copied; if phase 10's links
want them, that is a separate decision.

**Done when.** `pnpm build` regenerates all six with no manual step, each output is
under a few kB, and the six render crisply at 2.75 rem on a 2× display. `git status`
shows the generated directory ignored, not committed — check `.gitignore` first.

**Review gate.** Look at the six at their real size, in the corner, against the
consent button.

---

### Phase 12 — The menu, the overlay, and one back step four ways

The first interactive phase, and the state machine every later one plugs into. No
panels yet: the menu opens, the page dims, and there are four ways to step back.

**Files.**
- `apps/website/components/kb/EntityChrome.tsx` *(new, client)* — the state machine.
- `apps/website/components/kb/MenuStack.tsx` + `menu-stack.module.scss` *(new)*.
- `apps/website/components/kb/Overlay.tsx` + `overlay.module.scss` *(new)*.
- `apps/website/styles/_variables.scss` — **two** new z-indexes, both below `$z-fab`
  (900): the overlay lower, the menu stack and the panel above it. That ordering is
  what keeps the consent button clickable through the dim and its dialog above
  everything here (§2, §6.3).

**Read to start.** This phase text; §§6.2 and 6.3 of this document, and D2;
`components/consent/ConsentFab.tsx` + `consent-fab.module.scss` (the button treatment
and the corner convention the stack mirrors); `components/consent/ConsentDialog.tsx`
for the existing overlay treatment.

**Do.**
- A **vertical stack of buttons in the bottom-right**: a complete circle laid on the
  right end of a caption bar, every bar the same width so the circles line up. Black and
  white only (§6.2).
- The bottom-most button is **Menü** in the default state and **Vissza** in every other
  state, in the same place (§6.2).
- **The state machine.** A stack of states, not a boolean. "Vissza" pops **one**. The
  browser's **Back** pops one too — push a history entry on each state change and pop
  on `popstate`, so **Forward re-applies** what Back undid (§6.2). **Escape** and **a
  click on the dim** are the same single step (D2). The page's state never reaches the
  URL: same URL in every state, so a reload or a shared link opens the default state
  and a crawler sees one page (§6.2).
- **The overlay** dims everything except the menu buttons, the consent button, and
  (from phase 13) the panel. It does **not** lock scrolling on its own (§6.3).
- Items present per entity: **Bejövő hivatkozások** and **Kontextus** always;
  **Fogalmak** if the node defines ≥ 1 term; **Állítások** if it contains ≥ 1 claim and
  is not a proof (§6.5, and the identifiers sub-plan's D3 forbids claims on proofs).
  Wire the items as disabled-for-now buttons; phases 13–16 give them behaviour.

**Done when.** On a real page: Menü opens and dims; Vissza, Escape, a click on the dim
and the browser's Back each step back exactly one state; Forward re-applies it; the URL
never changes; the consent button stays clickable and its dialog opens above the dim.
Measured availability, on a local build (all 537 nodes): Fogalmak appears on **62**
definitions, **16** theorems, **4** remarks and **0** proofs; Állítások on **11**
definitions, **26** theorems, **6** remarks and never on a proof. Check those counts by
grepping the export, not by sampling.

**Review gate.** Interaction review. Everything after this phase depends on the back
semantics being right, so this is the gate to be slow at.

---

### Phase 13 — The panel: shell, slide, scroll lock, and Kontextus

One panel, one content to prove it. Kontextus first because it is available on all 537
nodes and has no empty state (§6.5).

**Files.**
- `apps/website/components/kb/Panel.tsx` + `panel.module.scss` *(new)*.
- `apps/website/components/kb/panels/ContextPanel.tsx` *(new)*.
- `apps/website/components/kb/EntityChrome.tsx` — the panel-open states.

**Read to start.** This phase text; §6.4 of this document; `graph.embedding` and
`EmbeddingContext` in `lib/content/types.ts`; `components/ui/Modal.tsx` for the
existing overlay/scroll interaction.

**Do.**
- Slides in from the bottom over the **bottom half** of the screen; slides back down
  on close. Above the overlay, so it stays legible while the page is dimmed (§6.4).
- **Server-rendered, hidden.** The panel's markup is in the HTML from the first byte
  and opening it unhides it (§2.1, D6). Nothing is fetched or built on the client —
  this is the constraint that overrides layout preference where they conflict.
- **Scroll-locks the page** while open, unlocks on close; the panel scrolls internally,
  header pinned (§6.4).
- **Reduced motion**: the panel appears and disappears without the slide. Follow the
  existing convention in `root-page.module.scss` / `consent-banner.module.scss` (§6.4).
- **Kontextus** shows book → chapter → section. Available on every node, since all 537
  are embedded exactly once inside a section (§6.5) — so no empty state, and if one is
  ever reachable the embedding data is wrong, not the panel.
- Links inside the panel are ordinary links and navigate; a panel never opens a nested
  panel (§6.4).

**Done when.** `grep -o 'data-kb-panel-kind="' out/hu/tudasbazis/definiciok/gyuru-test.html | wc -l`
is non-zero with JavaScript disabled — i.e. the content is served, not generated; the
panel opens over the bottom half, the page behind does not scroll, the panel does
scroll, and Vissza closes it and unlocks; with `prefers-reduced-motion` there is no
slide. Every Kontextus panel across the export has three levels — check by grepping the
export for an empty one, expecting **0**.

> **The gate as written was `grep -c 'kb-panel' out/…html` ≥ 1, and it measures far
> less than it looks like it does.** The exported HTML is a **single line**, and
> `grep -c` counts *lines*, not matches — so it prints 0 or 1 and nothing else, and
> "≥ 1" is satisfied by one occurrence as readily as by a thousand. It would catch a
> panel that was not served at all and nothing weaker than that. `grep -o … | wc -l` is
> the form that counts occurrences. Phase 19's gate and phase 7's have the same shape
> and are corrected there.
>
> **A second trap for any future gate of this kind: content passed as a `ReactNode`
> prop into a client component is serialized a *second* time, into the RSC flight
> payload**, so a bare attribute-name grep double-counts. Measured on
> `gyuru-test.html`: `grep -o 'data-target-fqn'` gives **84** and
> `grep -o 'data-target-fqn="'` gives **42**; across the export, 35 796 against
> 17 902 — exactly double, both times. **Match `attr="` to count DOM attributes.**

**Review gate.** The panel geometry and the scroll lock; phases 14–17 all reuse both.

---

### Phase 14 — Bejövő hivatkozások

The panel's hardest content, and the reason phase 2 exists.

**Files.**
- `apps/website/components/kb/panels/BacklinksPanel.tsx` + its scss *(new)*.
- `apps/website/lib/i18n/locales.json` — the empty-state string and the count wording.

**Read to start.** This phase text; §7.2 of this document; the `KbBacklinks` shape in
`lib/content/types.ts` from phase 2; note 1 and note 3 in §9.1.

**Do.**
- One row per **source**, with a **count**, ordered by count descending (§7.2). A
  source is an entity, a section or a chapter — all in one list, because a reader
  asking "where is this used?" wants the chapter as much as the theorem (§7.2).
- **All incoming means all**: references aimed at a claim or a term inside the entity
  are references to the entity and belong here. `graph.backlinks.get(fqn).all` is
  already exactly that list.
- A real **empty state** — "nincs rá hivatkozás" as a legitimate answer, not a failure
  (§7.2). It is reached by **168 of the 389** shipped pages (§9.1 note 3), so it is a
  main case, not an edge one.
- **Size for the middle, not the median.** 129 nodes have more than five sources, 56
  have more than twenty, and `gyuru-test` has 222 locally / **207** on a deployed build
  (§9.1 notes 1–2). One list, internally scrolled, no separate design for the long case
  (§6.4).
- Ordering is provisional (§7.2) — revisit once the page exists.

**Done when.** `grep -o 'data-backlink-source' out/hu/tudasbazis/definiciok/gyuru-test.html | wc -l`
is **222** on a local build and **207** with `SITE_ENV=staging`; the counts on that page
sum to **548** and **533** respectively; a page with no inbound references shows the
empty state; every row's href resolves in both env modes (the crawler in parent phase 8
is the second layer, but check it here). The 222 rows are present with JavaScript
disabled.

**Review gate.** Open the `gyuru-test` panel and a two-row panel and an empty one.
Row layout is provisional (§7.2); the grouping, the counts and the inclusion of
chapters and sections are not.

---

### Phase 15 — Selection modes, level 1: reveal

The overlay stops being a backdrop and starts revealing (§6.3). Level 1 only: pick a
mode, see the candidates, no panel yet.

**Files.**
- `apps/website/components/kb/EntityChrome.tsx` — the two mode states.
- `apps/website/app/globals.scss` — the reveal and inert states for `.term` and for the
  claim block, expressed globally.

**Read to start.** This phase text; §6.3 of this document;
`components/content/InlineText.tsx` lines 261–270 (where a term span is emitted) and
`components/content/blocks/ClaimBlock.tsx`; note 7 in §9.1.

**Do.**
- **Fogalmak** dims the page and lifts every term in the body out from under the dim,
  selectable. **Állítások** does the same for claims. No panel opens (§6.3).
- **Scrolling stays free** in a selection mode: picking a term means finding it first,
  and a term can be anywhere in the body (§6.3).
- "Vissza" returns to the open menu.
- The markup already carries what this needs: a term is `<span class="term" id="…">`
  and a claim is a `<div>` with the claim block's own class, both **global** class
  names, so the states are expressible from `globals.scss` without touching the block
  components (§9.1 note 7). That is also why they are not focusable — a deliberate
  deferral, §11.

**Done when.** On a definition with several terms, Fogalmak reveals exactly the terms
and nothing else, the page still scrolls, and Vissza returns to the open menu. On a
proof, Fogalmak is absent (0 proofs define terms) and Állítások is absent by rule.
Verify the reveal hits every term on the page, not the first — count the revealed
elements against `Object.keys(node.terms).length`, which is exact: `validateTermInsertions`
fails the build unless each term is inserted **exactly once** in its node's body, so
there is one span per key and no duplicate ids.

**Review gate.** Interaction review: is "these, right now" unambiguous?

---

### Phase 16 — Selection modes, level 2: the detail panel and the upper half

**Files.**
- `apps/website/components/kb/panels/TermPanel.tsx`,
  `apps/website/components/kb/panels/ClaimPanel.tsx` *(new)*.
- `apps/website/components/kb/EntityChrome.tsx` — the selected state and the scroll.
- `apps/website/components/kb/Panel.tsx` — the scroll-into-the-upper-half behaviour.

**Read to start.** This phase text; §6.3's two-level description and the
scroll-into-the-upper-half bullets of §6.4; §7.2's two filtered variants; the
`byTarget` map from phase 2.

**Do.**
- **Selecting one** keeps it revealed and **drops all the others back under the
  overlay**, so only the selection is lit — that narrowing is the whole point of the
  mechanism and replaces a highlight colour, a scroll-to and a selected-state style
  (§6.3).
- The panel slides in with the selection's details: for a term, its canonical form and
  its synonyms plus the inbound references targeting **that term**; for a claim, the
  claim plus the inbound references targeting **that claim** (§6.2, §7.2). Both come
  from `backlinks.byTarget.get(targetFqn)`, so all three reference lists are one list
  narrowed, not three designs (§7.2).
- **One gesture**: the selection is already in the free upper half by the time the panel
  finishes arriving, landing comfortably inside it rather than flush against its bottom
  edge. **Closing does not scroll back** (§6.4). Under reduced motion the scroll jumps
  rather than eases (§6.4).
- The arrival marker must **not** fire for this scroll — the overlay already says what
  is selected, and two answers to one question is one too many (§6.2). This matters
  once phase 18 lands; state it here so phase 18 inherits it.
- "Vissza" steps back to level 1: panel closed, all terms revealed and selectable again
  (§6.3).

**Done when.** Selecting a term on a page whose terms are heavily referenced opens a
panel whose row count equals `byTarget` for that term and is smaller than the
unfiltered list; the selected term sits in the upper half with the panel over the lower
half; Vissza returns to level 1 and a second Vissza to the open menu. With JavaScript
disabled, every term panel and claim panel is present in the HTML (§2.1) — count them
against the node's term and claim counts.

**Review gate.** Interaction review, on a long body where the term starts below the
fold.

---

### Phase 17 — Outgoing references: inert, intercepted, and detailed

**Files.**
- `apps/website/components/kb/panels/ReferencePanel.tsx` *(new)*.
- `apps/website/components/kb/EntityChrome.tsx` — the click interception and the inert
  rule.
- `apps/website/app/globals.scss` — the inert state for `.ref-concept` inside a KB page.

**Read to start.** This phase text; §7.1 of this document and D1;
`components/content/InlineText.tsx` lines 174–245 (every branch that emits a
reference; `ref-concept` is used at 223, 228 and 237); the `RefEntry`/`PathRefTarget`
shapes in `lib/content/types.ts`.

**Do.**
- References keep the **`ref-concept`** treatment they have in a chapter: inherited
  colour, dotted grey underline, subtle hover. Not a blue link (§7.1).
- **Inert unless the page is in its default state.** While the menu is open or a panel
  is showing, body references do not respond — at any moment exactly one class of thing
  on the page is actionable (§7.1).
- **Plain click only** is intercepted: the mark stays a real `<a>` with a real `href`,
  so middle-click, ctrl-click and "open in new tab" navigate (D1). The existing anchors
  already carry `target="_blank"`, so the interception must `preventDefault` and the
  no-JavaScript behaviour is a normal navigation.
- The transition is one gesture: overlay up, the selected reference revealed from under
  it, panel in, reference scrolled into the free upper half (§7.1, §6.4) — the same
  machinery as phase 16, entered without a mode to pick first.
- Panel content per target kind, per §7.1's table: entity → label, title, body and a
  link to its page; claim → the claim and a link to the owning node at that claim; term
  → canonical form, synonyms and a link to the defining node at that term; section,
  chapter or part → title and a link, **no body**; external URL → **no panel at all**,
  it is an ordinary outbound link.
- Opening a reference panel puts the menu into its open state with a matching "Vissza"
  (D2).

**Done when.** On a proof page dense with references: a plain click opens the panel
without navigating; ctrl-click opens the target page in a new tab; an external
reference navigates and opens no panel; while a panel is open, clicking another
reference does nothing. Every reference panel is in the served HTML (§2.1) — count them
against the node's reference count. `check-anchors` still 0 broken: the panel's "link to
its page" hrefs are new fragment links and are now gated.

**Review gate.** Interaction review, plus an explicit check of the modified-click
behaviour, since D1 accepted that cost knowingly.

---

### Phase 18 — The arrival marker

**Files.**
- `apps/website/components/kb/ArrivalMarker.tsx` *(new, client)* + its scss.
- `apps/website/app/layout.tsx` — mount it beside the existing fixed chrome, outside
  `.page-root` (that container's transform would make a fixed marker position against
  the document instead of the viewport — the comment there says so).

**Read to start.** This phase text; §6.2's "Arriving at an anchor" and D5;
`app/layout.tsx`'s body comment; `lib/content/urls.ts` for the five anchor builders.

**Do.**
- On a fragment arrival, scroll as today and additionally **mark** the target: a
  rectangle shrinking onto it, framing it tightly, held a moment, gone. No lasting
  change to the element (§6.2).
- **Only for the three anchor kinds that name something inside the text** — embedded
  entity, term, claim. Sections and parts scroll without a mark: they land on a heading
  bearing their own name, so a marker would be noise (D5). That is the complete set of
  anchor targets on the site; figures have no `id` and cannot be targeted at all (§6.2).
- Works on every page, not only KB pages — a chapter arrival gets the same gesture.
- **Reduced motion**: appears at its final size and fades. It is not removed, because
  showing the reader where they landed is its job (§6.4).
- Does **not** fire for a scroll the page performs itself (§6.2, and phase 16).

**Done when.** Following a term reference from a chapter into another chapter marks the
term; following a section reference marks nothing; the marker never fires on a
selection scroll; with `prefers-reduced-motion` there is no shrink but there is still a
mark. Check the anchor-kind table against the builders, not against memory:
`kbAnchorPath`, `termAnchorId`, `claimAnchorId` get a mark; `sectionAnchorId` and
`partAnchorId` do not.

**Review gate.** Interaction review on a real cross-chapter arrival.

---

### Phase 19 — `data-target-fqn`, the highlight parameter, and marking back-references

D7, in one phase because its three parts are useless separately.

**Files.**
- `apps/website/components/content/InlineText.tsx` — `data-target-fqn` on every
  rendered reference.
- `apps/website/components/kb/panels/BacklinksPanel.tsx` — append the parameter at
  click time.
- `apps/website/components/kb/HighlightOnArrival.tsx` *(new, client)* — read, validate,
  apply, scrub.
- `apps/website/app/layout.tsx` — mount it after `NewsletterLanding` and `ConsentGate`.

**Read to start.** This phase text; **D7 in full**; `app/layout.tsx`'s comment about
the two existing scrubbers; `components/newsletter/NewsletterLanding.tsx` and
`components/consent/ConsentGate.tsx` mount effects; `parseFqn` in `lib/content/fqn.ts`.

**Do.**
1. **Every rendered reference carries `data-target-fqn`** — `ref.target.fqn` is already
   on the entry at render time, for **thirteen** of the fourteen kinds; an external
   target has none and gets none.

   > **"All fourteen kinds" is thirteen in practice.** `RefTargetKind`
   > (`lib/content/fqn.ts`) has fourteen members, but `InlineText` has **no branch for
   > a `parts.` target** — a pre-existing gap, not one this phase introduced — and no
   > reference in the content targets one, so nothing renders through it. Its seven
   > link-emitting branches cover book, chapter, section, the four standalone kinds,
   > claim, term, and the four entity kinds: thirteen. `InlineText.tsx`'s own comment
   > says "thirteen path kinds". A `parts.` target would fall through to the
   > `ref-error` span, which is visible, so the gap fails loudly if content ever adds
   > one.
2. **A source row appends the query parameter at click time**, naming the FQN to
   highlight, so the served HTML keeps clean hrefs and no crawler sees the variant
   (D7).
3. **The arrival page validates, applies and scrubs.** Three conditions from D7, none
   optional:
   - **Validate against the FQN character rule before the value reaches a selector** —
     strictly `[a-z0-9-]` segments joined by dots, anything else rejected outright.
     Otherwise a URL parameter flows into `querySelectorAll`.
   - **Carry the FQN and nothing else.** Where to scroll is derivable from where the
     matches are.
   - **Mind the existing scrubbers.** `NewsletterLanding` and `ConsentGate` both scrub
     in their mount effects, in DOM order, each re-reading `window.location.search` at
     the top of its own effect — deliberately, per the comment in `layout.tsx`. A third
     scrubber joins that arrangement and needs the same care.
- On arrival, **mark every reference pointing back at the origin** with phase 18's
  gesture, and **scroll to the first of them**, not to the source's own anchor: on a
  long section the marks would animate off-screen and the effect would fire invisibly
  (§7.2, D5).

**Done when.** The worked case in §7.2 works end to end: select a term on a theorem
page, follow a section row that reports five references, land on the chapter page with
all five marked and the page at the first of them. The parameter is gone from the
address bar afterwards; a copied link carries no parameter; a hand-crafted parameter
containing anything outside the character rule is ignored rather than acted on; the
newsletter and consent parameters still work when one arrives alongside this one.
`grep -o 'data-target-fqn="' out/hu/tudasbazis/definiciok/gyuru-test.html | wc -l` is
non-zero, and `grep -rho 'href="/hu/[^"]*?[^"]*"' out | wc -l` is **0** — the parameter
is added by the client at click time and must never be in the served HTML (D7). Note the
export does contain 47 query-carrying hrefs today (`/icon.svg?…` and one YouTube link),
so check internal paths specifically rather than grepping for `?`.

> *Two corrections to this gate.* `grep -c` counts lines, not matches, on a
> single-line export file, so "non-zero" was a much weaker assertion than it reads as —
> and the trailing `="` matters, because a bare `data-target-fqn` also matches the RSC
> flight payload and double-counts. Both are the same pair of mistakes as phase 13's gate; see the
> note there. Measured on the finished export: **42** DOM attributes on `gyuru-test`,
> **17 902** across the export over **651** distinct values.

**Review gate.** Interaction review plus the parameter-validation check written as a
test, since it is the one place a URL value reaches a selector.

---

### Phase 20 — Print, no-JavaScript and reduced-motion sweep

One phase to check the three cross-cutting rules once, on the finished pages, instead
of trusting nineteen phases to have each remembered.

**Files.** Whichever of the scss modules the sweep finds wanting; ideally none.

**Read to start.** This phase text; §2's print bullet; §2.1; §6.4's motion note.

**Do.**
- **Print.** None of the entity-page chrome prints: not the menu, not the overlay, not
  the panel, not the marker (§2). The consent button already does this — `@media print
  { display: none }` in `consent-fab.module.scss` is the pattern.
- **No JavaScript.** Every page degrades to a long page with everything visible, not a
  broken one (§2.1). This is the phase where that is verified as a whole rather than
  per content type: the body, the ownership links, all five panel contents, the full
  glossary, both index lists.
- **Reduced motion.** All three animations — the panel slide, the scroll into the upper
  half, the arrival marker — respect the query, and none of them is *removed* (§6.4).

**Done when.** Print preview of an entity page shows the body and the ownership links
and none of the chrome; with JavaScript disabled, an entity page shows the body,
the ownership links, and every panel's content inline; with `prefers-reduced-motion`
nothing slides, nothing eases, and the marker still marks. Do the no-JavaScript check
against the **built export**, not the dev server, and record the three counts (backlink
rows, term panels, claim panels) for one page as evidence.

**Review gate.** The no-JavaScript pass is the one that matters — §2.1 is the rule that
overrides layout preference, and this is the only phase that tests it end to end.

---

### Phase 21 — Close out: measurements back into this plan and the parent

**Files.**
- `docs/plans/yp-162-page-layout-sub-plan.md` — a "what actually landed" section, the
  status line, and §9.1 corrected where the build disagreed with the measurement.
- `docs/plans/yp-162-knowledge-graph-urls-implementation-plan.md` — §Shipped gains
  phase 5; §H is marked done; parent R6 and R8 are discharged or re-measured; §K's test
  list is reconciled with the tests that actually exist.

**Read to start.** This phase text; the §Shipped section of the parent plan as the
model for the format; the summaries of phases 1–20.

**Do.** Record what landed, where it diverged from these phases and why — the parent's
"Divergences from the plan, and why" is the right shape, and it is the part of that
document that has been most useful. Specifically: the final page count and build wall
time against the **14.3 s / 46 pages** baseline (R8), the final test count against
**96**, the fragment count against **11 086**, and whether the two-href machinery held
up in practice (R6, which stays live until a KB page renders).

State clearly what parent phases 6–9 still owe: the KB URLs in `app/sitemap.ts` and the
sitemap splitter (§I), the nav item and the homepage entry block (§J.1–J.2), and the
crawler caps, which parent R3 already measures as overflowing — **439** of the 500-page
cap at this phase's end, before the five unpublished chapters ship.

**Done when.** A reader who lands on the parent plan's §H, or on §7 of the design plan,
or on §10 above, gets the same account of what exists. No document still describes a
component table, a "Uses" block, or an `aria-pressed` selection model as something to
build.

**Review gate.** The two document diffs.

---

## 11. Out of scope

Inherits the parent plan's [§M](yp-162-knowledge-graph-urls-implementation-plan.md#m-out-of-scope)
exclusions. Added by this document:

- **Keyboard and screen-reader access to the entity-page chrome.** The menu, the
  selection modes and the panel are designed for pointer interaction only. Terms
  render as non-focusable `<span>`s and claims as `<div>`s, so neither is reachable by
  keyboard, and the parent plan's H.3 `button`-semantics-and-`aria-pressed` sketch is
  **not** part of this design. A deliberate deferral, not an oversight — it is a real
  gap and should be its own piece of work. Note that §2.1 limits the damage: every
  page's content, including all the panel contents, is in the served HTML, so nothing
  is *unreachable* — only the interactive layer is pointer-only.

  **As built, the gap has a third part worth naming**, found in phase 17 and confirmed
  in phase 21: **reference marks are `<a>` elements, so unlike terms and claims they
  *are* focusable — and phase 17 makes them inert while a mode is open without
  removing them from the tab order.** So a keyboard reader can reach a mark whose
  activation is being swallowed, which is worse than a mark they cannot reach at all.
  Whoever picks the deferred work up owns this too; it is not a separate finding.
- **Responsive detail for the entity-page chrome.** The half-screen panel and the
  captioned button stack are specified once, not per breakpoint. What they do on a
  phone in landscape, or at 320px, is settled during implementation.
- **A "Uses" block** on proof pages — D8.
- **Per-term pages, per-claim pages, and namespace pages** — already excluded by the
  design plan (§3.3, §9) and unchanged by anything here.
- **Making figures anchorable.** §6.2 records that no reference can target a figure.
  Worth fixing; not here.
- **Search across the knowledge base.** The three list pages filter what is already on
  them; there is no cross-page search, and the site header's existing search is
  untouched.

---

## 12. What actually landed

Written at the end of phase 21, on branch `feat/yp-162-page-layout-design` in
`services`. Everything below was measured on that branch, not carried over from the
phase texts — correcting the phase texts where they disagreed was the point of the
phase, and the disagreements are named. The parent plan's
[§Shipped](yp-162-knowledge-graph-urls-implementation-plan.md#shipped--all-nine-phases) is
the model for this format and carries the same account of phase 5 as a whole.

### 12.1 The 21 phases and their commits

| phase | what landed | commits |
|---|---|---|
| 1 | Amended the parent's §H and the design plan's §7 so neither still specified a different page | `629c8b9` |
| 2 | Backlink index over fully qualified name targets: `graph.backlinks`, grouped by source with a count, page-existence filtered | `9d56bb3` |
| 3 | `synonyms` carried onto `GlossaryEntry` | `de06b69` |
| 4 | One row per name (`lib/content/glossary-rows.ts`) and one Hungarian comparator (`lib/content/collate.ts`) | `ad05dca`, `758fc80` |
| 5 | KB routing at depths 1–3, `KbPageShell`, breadcrumb chains for all seven KB page kinds (`lib/content/kb-breadcrumbs.ts`) | `79da168` |
| 6 | The knowledge-base root page, with published counts | `70a110f` |
| 7 | The glossary page and the shared `ListFilter` (`lib/utils/filter-text.ts`) | `b1d9da5` |
| 8 | The definitions and theorems index pages — one component, twice | `8ca085b` |
| 9 | Entity routes at depths 4–6: header, body, q.e.d., per-node excerpt (`lib/content/kb-excerpt.ts`) | `f01b672` |
| 10 | The ownership-chain links | `08de0ba` |
| 11 | The six menu icons as generated assets (`scripts/gen-kb-menu-icons.mjs`) | `5be5653` |
| 12 | The menu, the overlay, one back step four ways (`lib/kb/chrome-state.ts`) — **and Playwright** | `cf7c730`, `545ae84` |
| 13 | The panel: shell, slide, scroll lock, Kontextus | `3608835` |
| 14 | Bejövő hivatkozások; the visible kind label followed later | `d37993d`, `7eac0f0` |
| 15 | Selection modes, level 1: the reveal | `7ac0f9c` |
| 16 | Level 2: `TermPanel`, `ClaimPanel`, and the scroll into the upper half | `441b3c5` |
| 17 | Outgoing references: inert, intercepted, `ReferencePanel`; then the no-body ruling | `a94669f`, `1aa44eb` |
| 18 | The arrival marker (`lib/utils/motion.ts`) | `97709a2` |
| 19 | `data-target-fqn`, the highlight parameter, back-reference marks (`lib/kb/highlight.ts`) | `37147d1` |
| 20 | The print / no-JavaScript / reduced-motion sweep | `d4aa639` |
| 21 | This section, and the parent's | *this diff* |

The phase texts were written before any of it; `cc7abbf` is where they were derived and
is the baseline every "before" figure below is measured against.

### 12.2 Divergences from the phases, and why

- **Playwright was added mid-run, and it was not in the plan at all.** Phase 12's D2
  contract — one back step means one back step, four ways in — is about `pushState` and
  `popstate` in a real browser, and no unit test can assert it. `545ae84` added
  `@playwright/test`, `playwright.config.ts`, `scripts/serve-out.mjs` (which serves the
  export and refuses to start without one) and a workspace catalog entry. Every phase
  from 12 on then has browser tests instead of an "interaction review" it could only
  describe. `pnpm test:e2e` is deliberately **not** part of `pnpm test`: it needs a
  browser binary and a built `out/`. The run ends with **114 browser tests in 8 files**
  where the baseline had none.
- **§7.1's per-target-kind table was superseded by an owner ruling in phase 17**, and
  it is the largest divergence in the run. See §7.1, which now carries the ruling and
  the measurement that prompted it; the size figures are in §12.3.
- **§7.2's panel ordering was corrected by an owner ruling in phase 16** — identity
  first, in every panel. §7.2's wording was the error; the code is right. Recorded in
  §7.2.
- **A backlink row gained a visible kind label** — definíció / tétel / bizonyítás /
  megjegyzés / fejezet / szakasz — by an owner ruling that landed as `7eac0f0`, after
  phase 17 had started rather than inside phase 14. **57 same-title groups in the
  backlink data span more than one kind**, eight of them in `gyuru-test`'s own list, so
  without the label two rows could read alike and lead elsewhere. Superseded after the
  run by [§12.7](#127-post-run-review-findings) finding 13, which puts the same
  information in the row's numbered name instead. Recorded in §7.2.
- **§2.1's no-JavaScript reading was ambiguous, and phase 20 settled it.** Phase 13
  served every panel's content and left it `hidden`, which satisfies §2.1's letter.
  Phase 20 ruled that "shows every panel's content inline" requires visibility, and
  implemented it with a stylesheet inside `<noscript>`. **The served bytes did not
  change.** Recorded in §2.1.
- **Two phases marked "no new files" in the phase table added some.** Phase 4 added
  `lib/content/collate.ts` and `lib/content/glossary-rows.ts`; phase 16 added
  `components/kb/panels/TermPanel.tsx` and `ClaimPanel.tsx`. In both cases the
  alternative was a second responsibility inside `graph.ts` or `Panel.tsx`. The column
  was a guess made before the code existed and is not worth trusting.
- **Four phases shipped as two commits** (4, 12, 14, 17) and the rest as one. Three of
  those second commits are the rulings above; `758fc80` is a comment fix.
- **The glossary counts moved during the run**, from 342 rows / 125 synonyms to
  **341 / 124**, because of a content fix rather than a code change:
  `gyuru-test.yaml`'s `multiplicative-identity` listed `egységelem` among its own
  canonical form's synonyms, so the same name would have appeared twice on the index,
  both rows linking to the same anchor. Fixed in the content repo as **`fb76f03`** on
  `feat/yp-162-knowledge-graph-pages`. **Every target written into this document before
  phase 4 is off by one**; §9.1 note 4 and the phase 3, 4, 6 and 7 texts are corrected
  in place.
- **Three gate commands in the phase texts measure far less than they look like they
  do**, and are corrected where they stand (phases 7, 13, 19). `grep -c` counts *lines*,
  and the exported HTML is one line, so it prints 0 or 1 regardless of how many matches
  there are — enough to catch "nothing was served", nothing weaker. Separately, content passed as a
  `ReactNode` prop into a client component is serialized a **second** time into the RSC
  flight payload, so a bare attribute-name grep double-counts: on `gyuru-test.html`,
  `grep -o 'data-target-fqn'` gives 84 and `grep -o 'data-target-fqn="'` gives 42.
  **Match `attr="` to count DOM attributes.**
- **Phase 19's "all fourteen kinds" is thirteen.** `InlineText` has no branch for a
  `parts.` target and no content references one. Pre-existing; recorded under phase 19.

### 12.3 The measurements

Baseline is `cc7abbf`, measured on this branch before phase 1. Everything in the
"final" columns was measured at the end of phase 21.

| | baseline | final, local | final, `SITE_ENV=staging` |
|---|---|---|---|
| HTML pages in the export | 46 | **587** | **439** |
| of which knowledge-base pages | 0 | 541 (537 entity + 3 index + root) | 393 (389 + 3 + root) |
| `pnpm build` wall, incl. `prebuild` + `postbuild` | 14.3 s | **22.780 s** | **21.811 s** |
| of which `next build` compile | — | 4.7 s | 4.6 s |
| unit tests, `pnpm test` | 96 | **202** | — |
| browser tests, `pnpm test:e2e` | none — Playwright did not exist | **114 in 8 files** | — |
| fragment links, `check-anchors` | 11 086 / 0 broken / 0 skipped | **22 594 / 0 / 0** | **22 335 / 2 accepted / 0** |
| `pnpm typecheck` | clean | clean | — |
| `du -sh out/` | — | **234M** | 171M |
| average knowledge-base page | — | **130.2 KiB** over 540 files under `out/hu/tudasbazis` | — |
| largest knowledge-base page | — | **1 432 765 B (1.43 MB)** | — |

Verbatim, from the local build's `postbuild`:

```
set-html-lang: scanned 587 HTML file(s), rewrote lang on 0.
[check-build-version] footer version OK across 586 page(s).
[check-analytics-build] OFF (measurementId=unset, cookiePolicyVersion=1); 587 page(s) clean of pre-consent GA.
[check-anchors] 22594 internal fragment link(s) checked across 587 page(s).
pnpm build  44.09s user 8.58s system 231% cpu 22.780 total
```

**Build time — parent R8 is discharged.** R8 feared growth at ~11× the page count.
**12.8× the pages cost 1.59× the wall time**, so the per-page cost fell by an order of
magnitude: the fixed `prebuild` generators dominate a 46-page build and are amortised
over 587. `next build` itself compiles in 4.7 s.

**Tests.** The 106 new unit tests are +13 on `kb-graph.test.mjs` and eight new files:
`kb-chrome` 32, `kb-excerpt` 17, `glossary-rows` 9, `highlight-param` 8,
`locale-labels` 7, `kb-breadcrumbs` 7, `anchor-kind` 7, `filter-text` 6. The 114
browser tests are `kb-highlight` 24, `kb-select` 22, `kb-reference` 18, `kb-chrome` 13,
`kb-panel` 11, `kb-backlinks` 10, `kb-arrival` 9, `kb-sweep` 7.

**Page size, and the ruling that shaped it.** The chain, in order:

| point in the run | average KB page | largest KB page | `out/` |
|---|---|---|---|
| before `ReferencePanel` | 113.4 KB | 1.41 MB | 216 MB |
| with §7.1's full-body previews | 173.2 KB *(recorded as 177.0 KiB in `ReferencePanel.tsx`)* | 2.10 MB | 268 MB |
| after the owner's no-body ruling | 124.9 KiB | 1.43 MB | 228 MB |
| end of phase 20, measured here | **130.2 KiB** | **1.43 MB** | **234M** |

The two pre-ruling figures come from phase 16's and phase 17's own reports and cannot
be re-measured from this tree; **they do not reconcile exactly** — 173.2 KB is 169.1
KiB, not 177.0 KiB — and the reason is unrecorded. The direction and the order of
magnitude are not in doubt: the previews cost roughly a third of every page, because
§7.1's full-body rule combined with §2.1's served-HTML rule served a definition's body
once per citation. The 124.9 → 130.2 KiB drift after the ruling is phases 18–20 adding
the arrival marker, `data-target-fqn` and the `<noscript>` sheet.

**What the graph and the pages actually hold:**

- **537 entity pages** locally, **389** on staging — the A9/D9 prediction, unchanged.
- **Glossary:** 341 rows over 217 canonical terms, 124 synonyms, 83 terms carrying at
  least one. 206 distinct canonical forms, 110 distinct synonym strings, 6 strings that
  are both.
- **Backlinks:** **3789** distinct (target, source) pairs. `gyuru-test` is the extreme
  at **222 sources / 548 references** locally and **207 / 533** on staging; the median
  entity shows **1**. The **empty state is reached by 244 of 537** pages locally and
  **168 of 389** on staging — §7.2's empty state carries nearly half the pages, which
  is why it reads as an answer rather than as a missing list.
- **`data-target-fqn`:** **42** DOM attributes on `gyuru-test`, **17 902** across the
  export, over **651** distinct values.
- **The no-JavaScript census**, on `/hu/tudasbazis/tetelek/maradekosztalygyuruk` — the
  page chosen because it carries all five panel kinds *and* an ownership link:
  **23 panel sections**, being 1 Kontextus (3 levels), 1 Bejövő hivatkozások (13 rows
  over 34 references), 4 term panels, 5 claim panels and 12 reference panels. With
  scripting off, all 23 are visible — and **all 23 still carry `hidden`**, which is the
  same assertion read the other way: the reveal is a stylesheet, not a change to the
  bytes. `e2e/kb-sweep.test.ts` pins every one of those numbers, against the built
  export rather than the dev server.

### 12.4 Accepted states — recorded so nobody fixes them

- **The staging build exits 1, by design.** `check-anchors` reports exactly two broken
  anchors on staging, both into `alice-es-bob-atlepi-a-celvonalat`:
  `#szakaszok.az-aks-primteszt` and
  `#szakaszok.primitiv-gyokok-es-a-diffie-hellman-kulcscsere-protokoll`. They cite
  content not yet migrated, and the stub in their place carries a link to the legacy
  page. **The owner ruled they stay.** The condition on this acceptance is
  **exactly these two** — a third is a real failure, and so is either of these two
  becoming a different fragment.
- **At 360px, on a first visit, the consent banner covers the Menü button outright**
  (`$z-banner: 950` over `$z-kb-chrome: 800`, both in `styles/_variables.scss`). **The
  owner ruled this acceptable**: the cookie question is a one-time gate, and once it is
  answered the corner is free. Not a defect.
- **The §7.2 worked case marks nine elements where the row reports five.** Both numbers
  are right about different things; see the note in §7.2.
- **Two CSS transitions are unguarded by `prefers-reduced-motion`, deliberately.**
  `components/kb/kb-root-page.module.scss:53` (a card's hover `box-shadow`) and
  `app/globals.scss:104` (`.ref-concept`'s hover `text-decoration-color`, site-wide and
  pre-existing since the initial migration in `d4ae76b`). Neither moves anything, and
  neither is one of §6.4's three animations.
- **`display: contents` is the floor for the no-JavaScript pairing.** A browser without
  it falls back to the titles as one block and the contents as another. Legible, not
  broken.

### 12.5 Unresolved — stated, not fixed

- **A no-JavaScript page still does not print its panel content.** With the
  `<noscript>` reveal and the `@media print` hide both in play, the print rule wins.
  The article and the ownership links print, which is what §2 asks for ("it does not
  print"). Carrying the appended sections into a no-JavaScript printout would need a
  new ruling; nobody has asked for one.
- **The four interaction review gates from phases 15–18 have not had a human review.**
  The level-1 reveal, level 2 on a long body, modified-click behaviour, and a real
  cross-chapter arrival all have browser tests asserting the mechanics, and none has
  been looked at by a person. They are **outstanding, not passed.**
- **Terms, claims and reference marks are not keyboard-focusable** — and an inert
  reference mark stays focusable while its activation is swallowed, because
  `pointer-events: none` is what makes it inert. §11 records the deferral and now
  records this third part of it.
- **`check-anchors` has a blind spot: it validates fragment links only, not whole-path
  links.** A link to a page that does not exist passes it. The crawler on a live
  deploy is the layer that would catch that, and it is parent phase 8.
- **`pnpm lint` is unusable repo-wide.** `next lint` is deprecated in this Next
  version and drops into an interactive ESLint setup prompt, exiting 1 on an untouched
  tree. Pre-existing, and it means **no phase in this run had a lint gate**. Migrating
  to the ESLint CLI is its own piece of work.
- **`scripts/check-analytics-build.mjs` does not load `.env.local`.**
  `gen-cookie-policy-version.mjs`, `gen-content-lastmod.mjs` and `set-html-lang.mjs`
  all `import './lib/load-env.mjs'`; that script does not, so a local staging build
  needs `NEXT_PUBLIC_GA_MEASUREMENT_ID` passed on the command line or the check reports
  a mismatch. Out of scope this run; worth fixing.
- **Playwright's `test.use({ reducedMotion: 'reduce' })` is a silent no-op** on 1.62.1
  in this setup: it does not set the media query, so a test relying on it passes without
  testing anything. `page.emulateMedia({ reducedMotion: 'reduce' })` works. Worth
  knowing before writing the next browser test.

### 12.6 What parent phases 6–9 still owe

None of this is in scope for this sub-plan, and all of it is now the only thing between
the knowledge base and a deployed, crawlable state. Verified against the tree at the end
of phase 21:

- **§I — sitemaps.** `app/sitemap.ts` contains **no** KB URLs and
  `scripts/split-sitemap.mjs` does not exist. `out/sitemap.xml` carries **31** `<loc>`
  entries against 587 pages in the export. Nothing in the knowledge base is
  sitemapped.
- **§J.1–J.2 — navigation and discovery.** `SiteHeader`'s `navLinks` is still the two
  hardcoded literals `'Cikkek'` and `'Hírek'`; there is no "Tudásbázis" item, and no
  knowledge-base block on the locale homepage. **§2 of this sub-plan assumes the nav
  item and it does not exist** — so today no knowledge-base page is reachable from the
  homepage, and therefore not from the crawler's seed either. This is the most
  consequential of the four.
- **§K — the quality gate.** `tools/smoke-tests/scripts/crawl.mjs` still has
  `MAX_PAGES = 500` and `MAX_DEPTH = 5`, and `cappedAtMaxPages` is a `console.log`, not
  a fatal finding. **Parent R3's overflow is now measured at 439 of the 500 cap**, before
  the five unpublished chapters ship. `MAX_DEPTH` counts **link hops from the seed**, and
  the shortest chain to the deepest entity page is homepage → KB root → theorem index →
  theorem → proof → its remark: **depth 5, exactly at the limit, with no margin** — and
  only once §J.2 gives the homepage a link to the KB root at all. Parent §K.1 asks for 7.
- **§L — documentation.** `docs/i18n-design.md` §4a and its field-summary table, and
  `docs/content-site-and-static-generation.md`'s canonical-URL rule and page counts,
  still describe a knowledge base whose entities are non-addressable.

The parent plan's §I, §J, §K and §L carry the same account, and its R3 has been
re-measured to 439.

### 12.7 Post-run review findings

The owner read the built pages after phase 21 and raised a list of findings. They are
not divergences from the phases (§12.2) — the phases were built as written — but
rulings on what the built result should be instead, so each one is corrected in place
in §§2–7 as well as recorded here. Findings from the same reading are still arriving;
this section grows with them.

| # | finding | where the design now says it | how it was verified |
|---|---|---|---|
| 1 | The filter on the glossary and the two index pages sticks below the breadcrumb while the list scrolls | §4, design notes | `e2e/kb-filter.test.ts` — the field's box against the breadcrumb row's, at the end of all three lists, and narrowing from there |
| 2 | On a proof or a remark page the link to the parent leads the header, above the label and its rule (see finding 7); the list below the body keeps only the children | §6.1 | `e2e/kb-sweep.test.ts` — served HTML, geometry rather than DOM order, plus "no up-link below" |
| 3 | A menu icon is the size of the consent shield's glyph, not of its circle | §6.2 | `e2e/kb-chrome.test.ts` — all five glyphs measured against the shield's own rendered box |
| 4 | A revealed term or claim scrolled to the top goes under the sticky header | §6.3 | `e2e/kb-select.test.ts` — pixels of the same term under the header and mid-page, so both directions are asserted |
| 5 | An arrival mark plays when its own target is in view, not when the arrival lands | §6.2 | `e2e/kb-highlight.test.ts` — the off-screen marks are not drawn at all until the reader walks the section, and then are |
| 6 | An arrival mark needs a reason as well as a fragment change: a load, or a press. A Back or Forward step is neither | §6.2 | `e2e/kb-arrival.test.ts` — an unpressed fragment change, then a step back and forward over it; and `e2e/kb-highlight.test.ts` — the reported case end to end |
| 7 | The parent link's hairline sits below it, closing it off from the label rather than from the breadcrumb | §6.1 | `e2e/kb-sweep.test.ts` — the rule read off the list's own box, with the link still above the heading |
| 8 | The child links read exactly as the parent link does; the parent half is the reference | §6.1 | the two lists share every rule but placement in `ownership-links.module.scss`, so there is nothing left to diverge |
| 9 | The icon is a complete circle laid on the caption bar, with a shadow of its own, and every bar is the same width | §6.2 | `e2e/kb-chrome.test.ts` — the circle still measures the 44px touch target, hairline included |
| 10 | The incoming-references list is grouped chapter → section → embedded entity, counts accumulated bottom-up | §7.2 | `test/kb-graph.test.mjs` — the tree and the accumulation as invariants over a fixture that exercises every branch; `e2e/kb-backlinks.test.ts` — 236 rows over three levels, ordered within each, and the 14 chapter rows summing to all 548 references |
| 11 | Pressing a row marks every reference inside it, entities embedded in it included, so the marks match the accumulated count | §7.2 | `e2e/kb-highlight.test.ts` — 22 marks on the worked case against 22 in-section references derived independently from the DOM, and 108 on the page that are not marked |
| 12 | Two revealed claims are separated, rather than merging into one white slab | §6.3 | `e2e/kb-select.test.ts` still passes unchanged — the hit test and the census are about what is lifted, and the gap changes neither |
| 13 | A backlink row is three stacked lines — the numbered place it leads to, the ownership chain below it, the count — and carries no kind word | §7.2 | `test/kb-graph.test.mjs` — the two lines of a chapter, a section, a theorem, a proof, a remark and a remark on a proof, off a fixture that owns all six; `e2e/kb-backlinks.test.ts` — 236 first lines and 96 ownership lines in the served HTML, the number shape and the type word asserted per kind, and all 236 rows reading differently from one another |
| 14 | The Kontextus panel is headed "Kontextus", and its two levels are laid out as the rows of the Bejövő hivatkozások tree: the numbered chapter, the numbered section indented under it, no book | §6.2, §6.4 | `e2e/kb-panel.test.ts` — the heading, the two hrefs, the numbers each row starts with, and the section's row read as nested and stepped right of the chapter's; `e2e/kb-sweep.test.ts` — two levels in the served HTML |
| 15 | A pressed outgoing reference shows the target as a leaf row of the Bejövő hivatkozások tree — label and ownership lines, no count, no "Ugrás a hivatkozott lapra" — and the row is the link | §7.1 | `e2e/kb-reference.test.ts` — the row's label read against the number a backlink row gives the same target, the one link per panel, and an exact element census of all 23 reference panels on the two worked pages, 3 of them carrying the second line |

Four notes on the shape of these fixes, because each cost more than it looks:

- **The filter's offset is `--header-height`**, published by
  `components/layout/HeaderHeightProbe.tsx` and already in use by the homepage hero, so
  no second measurement of the header exists. With no JavaScript the property is absent
  and the bar parks behind the header, which is harmless: the filter is inert without
  scripting anyway.
- **Finding 3 turned on a measurement, not a number in a stylesheet.**
  `components/consent/consent-fab.module.scss` asks for a 1.125rem shield and does not
  get it: FontAwesome's own `.svg-inline--fa { height: 1em; width: 1.25em }` wins the
  cascade, and a `<button>` takes the user agent's 13.33px font rather than the page's
  16px, so the shield paints **16.66 × 13.33**. The menu glyph is therefore 1rem — that
  box to within a pixel on its wider side — and the consent button is left exactly as
  it is. Making the shield's own declaration take effect instead would have changed a
  control on every page of the site, which nobody asked for.
- **Finding 6 could not be expressed as "ignore `popstate`", which is what it looks
  like.** Measured in Chromium with the Navigation API alongside: an ordinary fragment
  navigation fires `popstate` too, with the same `state === null` and the same fragment
  as the traversal onto that entry, so nothing in the event tells a press from a step
  back. `navigationType === 'traverse'` does say it, and is deliberately unused — the
  rule as stated needs no new API and holds in every browser. What carries it instead is
  a one-shot permit in `components/kb/ArrivalMarker.tsx`, granted by the document's load
  and by a plain same-tab press on a link with a fragment, and spent by the next arrival
  whether or not that arrival was a marked kind.
- **Finding 4 needed a new layer, not a smaller z-index.** The reveal has to stay above
  the dim, and the dim is below the reveal, so a header above the reveal is necessarily
  above the dim too: `$z-kb-header: 730` sits between the reveal and the panel, and
  `app/globals.scss` gives the header the dim's own 50% wash and `pointer-events: none`
  for the duration, so it looks and behaves as it did underneath. The existing hit test
  in `e2e/kb-select.test.ts` still passes unchanged, and it passes for a different
  reason than before — which is why the note beside it now says so.
