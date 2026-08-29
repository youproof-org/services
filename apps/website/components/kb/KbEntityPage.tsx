import ContentBlocks from '@/components/content/ContentBlocks'
import InlineText from '@/components/content/InlineText'
import { getContentGraph } from '@/lib/content'
import { kbNodeLabel, kbOwnership } from '@/lib/content/graph'
import { keyForKbNode } from '@/lib/content/keys'
import { claimAnchorId, kbRefs, ownPageScope, termAnchorId } from '@/lib/content/urls'
import { formatLocaleLabel, getLocaleLabel } from '@/lib/i18n/config'
import { kbMenuItems } from '@/lib/kb/menu-items'
import { buildChapterEmbedIndices, buildChapterFigureIndices, getChapterIndex } from '@/lib/utils/index-helpers'
import type { KbNode } from '@/lib/content/types'
import EntityChrome from './EntityChrome'
import OwnershipLinks from './OwnershipLinks'
import type { KbPanelSection } from './Panel'
import BacklinksPanel from './panels/BacklinksPanel'
import ClaimPanel, { webClaims } from './panels/ClaimPanel'
import ContextPanel from './panels/ContextPanel'
import { referencePanels } from './panels/ReferencePanel'
import TermPanel from './panels/TermPanel'
import styles from './kb-entity-page.module.scss'

interface KbEntityPageProps {
  node: KbNode
}

/**
 * The reading surface of one knowledge-base entity (sub-plan §6.1): a two-line
 * header, the body, the q.e.d. that closes it, and the ownership chain below.
 *
 * The body is the SAME object the reader met in the book — `ContentBlocks` over the
 * node's own body, so the typography, the LaTeX, the claims and the terms are the
 * ones `EmbeddedEntity` renders inside a chapter. Two things differ, and both are
 * about where the page's links and ids point:
 *
 *   - refs go through `kbRefs`, so a reference from here lands on the target's own
 *     knowledge-base page rather than on the chapter anchor a chapter page uses;
 *   - claims and terms take `ownPageScope`, so a term is `#fogalmak.{f}` — on its
 *     own page the node drops out of the anchor path (identifiers sub-plan §3.2).
 *
 * Both are checked by the postbuild anchor gate, which reads the ids out of the
 * built HTML: the glossary and every claim/term reference resolved for the
 * knowledge-base context point at exactly these ids.
 */
export default function KbEntityPage({ node }: KbEntityPageProps) {
  const graph = getContentGraph()
  const label = kbNodeLabel(graph, node)
  /**
   * Whether this page has something above it in the ownership chain — a proof's
   * theorem, a remark's owner — which is what the header leads with (§6.1 as
   * amended). Only used here to decide whether the header carries the rule that
   * separates that link from the breadcrumb above it; `OwnershipLinks` finds the link
   * itself, so the two cannot disagree about whether there is one.
   */
  const owned = kbOwnership(graph, node).parent !== undefined

  // Embed and figure numbering is chapter-scoped ("11.3."), so it is built from
  // the chapter that embeds this node — the same numbers the reader saw there,
  // rather than a second sequence starting at 1 on every entity page. A node with
  // no embedding has no page at all (`kbPageExists`), so this is always present;
  // the fallback keeps a body renderable rather than throwing if that changes.
  const chapter = graph.embedding.get(keyForKbNode(node))?.chapter
  const chapterIndex = chapter ? getChapterIndex(chapter) : 0
  const embedIndices = chapter ? buildChapterEmbedIndices(graph, chapter, chapterIndex) : undefined
  const figureIndices = chapter ? buildChapterFigureIndices(graph, chapter, chapterIndex) : undefined

  // The scope of every claim and term in this body: this node's own page.
  const scope = ownPageScope(node)

  /**
   * The claims this body asserts, in the order `ContentBlocks` renders them and
   * numbered the way `ClaimBlock` numbers them — so a panel's "3. állítás" is the
   * one the body shows as "3.". `webClaims` owns which claims those are, because a
   * reference panel numbers another node's claims by the same rule.
   */
  const claims = webClaims(node)

  /*
    In the menu's order (§6.2), which is the order the reader meets the items in —
    and then the level-2 panels, which no menu item opens (§6.3).

    A panel per term and a panel per claim, all of them server-rendered and all of
    them in the served HTML: §2.1 does not distinguish between a content the menu
    opens and one the body opens, and these are the per-term and per-claim
    narrowings of the inbound-reference list, which is knowledge-graph structure by
    any reading. `target` is the selected element's own anchor id, which is the
    handle the click that picks it will arrive with.
  */
  const panels: KbPanelSection[] = [
    {
      key: 'incoming',
      title: getLocaleLabel(node.locale, 'kbPanelIncoming'),
      content: <BacklinksPanel node={node} />,
    },
    {
      key: 'context',
      title: getLocaleLabel(node.locale, 'kbPanelContext'),
      content: <ContextPanel node={node} />,
    },
    ...Object.entries(node.terms ?? {}).map(([termKey, term]) => ({
      key: 'term' as const,
      target: termAnchorId(scope, termKey, term),
      // The term itself heads its panel: it is the subject, and the reveal has
      // already lit it in the body (§6.3), so the two agree by naming the same thing.
      title: <InlineText text={term.canonical} />,
      content: <TermPanel node={node} termKey={termKey} term={term} />,
    })),
    ...claims.map((claim, index) => ({
      key: 'claim' as const,
      target: claimAnchorId(scope, claim),
      // A claim has no name of its own, so its position in the body is what names
      // it — the same number `ClaimBlock` prints in front of it.
      title: formatLocaleLabel(node.locale, 'kbPanelClaim', { index: index + 1 }),
      content: <ClaimPanel node={node} claim={claim} />,
    })),
    /*
      …and one per outgoing reference in the prose (§7.1), which the body opens too:
      pressing a reference is a request to see what it points at without leaving the
      sentence. Keyed by the reference's own href rather than by an element id,
      because a reference mark has none — `referencePanels` owns the whole of that,
      including which references get a panel at all.
    */
    ...referencePanels(node),
  ]

  return (
    <>
      <article className={styles.entity}>
        {/*
          The header, and on a proof or a remark page it opens with the link up to
          what the page is about (§6.1 as amended). That is a change of reading order
          and not only of position: 262 of the 537 pages have no title of their own,
          so their <h1> is the bare type label — "BIZONYÍTÁS" — and the theorem it
          proves is the first thing the reader needs, not the last. The header takes a
          rule above that link when there is one (`.owned`), the same hairline the
          ownership list below the body sits under, which is what makes the two halves
          of the chain read as one object in two places.
        */}
        <header className={owned ? `${styles.header} ${styles.owned}` : styles.header}>
          <OwnershipLinks node={node} placement="header" />
          {node.title ? (
            <>
              <p className={styles.label}>{label}</p>
              <h1 className={styles.title}><InlineText text={node.title} /></h1>
            </>
          ) : (
            // No authored title, which is every proof and every remark (262 of the
            // 537 pages — sub-plan §9.1 note 9). `kbNodeTitle` would derive one from
            // the same word the label is built from, so the header would read
            // "BIZONYÍTÁS / Bizonyítás: Euler-Fermat tétel"; §6.1 shows the label
            // alone instead. It carries the <h1>, because a page needs a heading and
            // this is the page's name — the class keeps the label's own styling.
            <h1 className={styles.label}>{label}</h1>
          )}
        </header>

        <ContentBlocks
          blocks={node.body}
          embedIndices={embedIndices}
          figureIndices={figureIndices}
          refs={kbRefs(node.references)}
          context="web"
          parentEntity={scope}
          terms={node.terms}
          termParent={scope}
        />

        {/* Closes the content, as it does on the embedded rendering (§6.1). */}
        <p className={styles.qed}>{node.type === 'proof' ? '∎' : '♣'}</p>

        {/*
          Below the q.e.d., not above it: the glyph closes the body, and the chain is
          not part of the body — it is where this entity sits among the others. §6.1
          puts the links "below the body", and the body ends at the q.e.d.

          The DOWN half only — the proofs and remarks attached to this entity. The one
          link up moved into the header above, where the reader meets it before the
          body rather than after it; a page with no children renders nothing here.
        */}
        <OwnershipLinks node={node} placement="body" />
      </article>

      {/*
        The interactive chrome (§6.2): fixed in the bottom-right corner, and a
        sibling of the article rather than part of it — it acts on the page, it is
        not something the page says. `kbMenuItems` decides what it carries, on the
        server: which items an entity has follows from the entity (§6.5), and a
        `KbNode` cannot be handed to a client component.

        The panel's contents go the same way and for the same reason, but they are
        markup rather than data: a server component per content, rendered here and
        handed over already finished, which is what puts it in the served HTML
        (§2.1). The two the menu opens, plus one per term and one per claim; the
        rest join this list as their phases land.
      */}
      <EntityChrome
        items={kbMenuItems(node)}
        openLabel={getLocaleLabel(node.locale, 'kbMenuOpen')}
        backLabel={getLocaleLabel(node.locale, 'kbMenuBack')}
        panels={panels}
      />
    </>
  )
}
