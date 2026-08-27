# YP-162 sub-plan: knowledge-base page layout

**Parent plan:** [`yp-162-knowledge-graph-urls-implementation-plan.md`](yp-162-knowledge-graph-urls-implementation-plan.md)
(design: [`yp-162-knowledge-graph-urls-plan.md`](yp-162-knowledge-graph-urls-plan.md))
**Sibling sub-plan:** [`yp-162-identifiers-and-anchors-sub-plan.md`](yp-162-identifiers-and-anchors-sub-plan.md) — **shipped**; it settled the anchor grammar, the fully qualified reference targets, and the identifier constraints these pages render.
**Repos touched:** `youproof-org/services` only — no content or editor change is
implied by anything here.
**Status:** **UX settled** (§§2–7 complete, decisions in §8, nothing open in §9).
**Phases are not yet written** — §10.

This document describes what the reader sees and does, not how it is built. No
component structure, no data flow, no file layout: those are derived in the parent's
phase 5, and two data-shape prerequisites it must start from are recorded in §9.

**This sub-plan replaces §7 of the design plan and the layout half of parent phase
5 (§H).** Parent §H's component table, its H.3 interaction sketch and §7's per-page
content lists are inputs, not decisions — where this document disagrees with them,
this document wins, and the parent gets amended when this one is complete.

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

- **Header** — two lines.
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

**Below the body, a short list of links along the ownership chain** — the entity's
parent, and the entities attached to it:

- **Up** to the parent: a proof links to the theorem it proves; a remark links to the
  definition, theorem or proof it is attached to.
- **Down** to each attached child: a theorem links to each of its proofs and each of
  its remarks; a definition and a proof link to each of their remarks.

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

**Shape of a button.** Each item has two parts: a **circular icon** on the right —
the same size, weight and treatment as the cookie-consent opener in the bottom-left
corner — and a **caption extending to the left of it**, on a bar whose left edge is
rounded into a half-circle, so the whole item reads as one pill with the icon at its
right end. Buttons are right-aligned in the stack, so their icons line up in a
column regardless of caption length.

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

#### The items

The union across all four entity types. Each is present only when its availability
condition holds — see §6.5 for what that works out to per type.

| item | icon | available when | does |
|---|---|---|---|
| **Bejövő hivatkozások** | `incoming.png` | always | opens the panel with **every** inbound reference to this entity, grouped by source — §7.2 |
| **Fogalmak** | `star.png` | the entity defines ≥ 1 term | dims the page and reveals the terms in the body, making them selectable — §6.3 |
| **Állítások** | `paragraph.png` — `§` | the entity contains ≥ 1 claim | same, for claims — §6.3 |
| **Kontextus** | `target.png` — crosshair | always | opens the panel with the entity's embedding context ("hol jelenik meg") |

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
| **Kontextus** | where the entity is embedded — book → chapter → section |
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

**What the panel shows** — a short design note; to be fine-tuned during
implementation:

| the reference points at | the panel shows |
|---|---|
| a definition, theorem, proof or remark | its label and title, its body, and a link to its page |
| a claim | the claim itself, and a link to the owning node's page at that claim |
| a term | its canonical form and synonyms, and a link to the defining node at that term |
| a section, chapter or part | its title and a link to it — no body |
| an external URL | nothing; it is an ordinary outbound link and never opens a panel |

The through-line: **enough to answer "what is this?" without leaving the page**, plus
one link for the reader who wants the whole thing. A definition's body is short enough
to show in full; a chapter's is not, which is why the book-hierarchy row is a link
only.

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

**Rows are ordered by that count, highest first** — provisionally. It is the only
ordering available without inventing a relevance notion, and the heaviest user of a
node is a reasonable guess at the most useful one. Revisit once the page exists and
it is clear whether it reads well.

**The list can be very long.** Measured on the content: the entity with the most
inbound references, `gyuru-test`, is cited by **222 distinct sources** (549
references), while the median entity has **2**. The design has to hold both without
branching — hence the panel's internal scroll (§6.4). Sizing the layout for the
median case and letting the 222-row case degrade is the failure mode to avoid.

The filtered variants use the same list, narrowed:

- selecting a **term** in Fogalmak mode shows only the inbound references targeting
  **that term**, above the term's canonical form and synonyms;
- selecting a **claim** in Állítások mode shows only the inbound references targeting
  **that claim**.

So the Bejövő hivatkozások panel is the unfiltered case of the same thing, and all
three should look like one list rather than three designs.

*Row layout will be fine-tuned during implementation.* What is settled: grouped by
source, one row per source, a count per row, and book sections and chapters included
alongside entities.

#### Going to a source

A row is a link. Following it takes the reader to the source — and **on arrival, every
reference in that source that points back here is marked**, with the same shrinking
rectangle used for an ordinary anchor arrival (§6.2).

The worked case: the reader has selected a term on a theorem page, and the panel says
a particular section references it five times. Following that row opens the chapter
page, and all five of that section's references to the term are marked.

**The page scrolls to the first of those references**, not to the section heading.
The section anchor was only ever a proxy for "the references are somewhere in there";
on a long section it would leave the reader at the top with all five marks animating
off-screen, so the effect would fire and they would see nothing.

*Why mark them at all:* a reader who arrives from this panel is not asking "what is
this section about?" They already know the answer to that — they came here for the
five specific places this section leans on the thing they were reading. Dropping them
at the section start and leaving them to find those places is the panel answering a
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

---

## 10. Phases

*To be derived once §§3–7 are settled. The build order is a consequence of the
layout, not an input to it.*

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
