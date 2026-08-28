import Link from 'next/link'
import type { ReactNode } from 'react'
import ContentBlocks from '@/components/content/ContentBlocks'
import InlineText from '@/components/content/InlineText'
import { getContentGraph } from '@/lib/content'
import { kbNodeByKey, kbNodeLabel, kbNodeTitle } from '@/lib/content/graph'
import { kbRefs } from '@/lib/content/urls'
import { formatLocaleLabel, getLocaleLabel } from '@/lib/i18n/config'
import { renderKatex } from '@/lib/utils/math'
import { isPathTarget } from '@/lib/content/types'
import type {
  AnchorParent,
  ContentGraph,
  KbNode,
  PathRefTarget,
} from '@/lib/content/types'
import type { KbPanelSection } from '../Panel'
import { webClaims } from './ClaimPanel'
import styles from '../panel.module.scss'

/**
 * One outgoing reference from the body, pressed (sub-plan §7.1).
 *
 * **What a reference panel is for.** A reference in a proof is part of the sentence
 * it sits in, and following it costs the reader the sentence. So a plain press does
 * not navigate: it shows what the mark points at, next to the prose that leans on
 * it, and offers the target's own page as a second, deliberate step. What is shown
 * is §7.1's table — enough to answer "what is this?", never the whole neighbourhood:
 *
 *   - an entity (definition, theorem, proof, remark): its label, its title and its
 *     body, which for a definition is the whole answer;
 *   - a claim: the claim itself, and the page of the node asserting it, at it;
 *   - a term: its canonical form and its synonyms, and the defining node's page;
 *   - the book hierarchy (a book, a part, a chapter, a section): the title and the
 *     link, and deliberately no body — a chapter's is a chapter long;
 *   - an external URL: no panel at all, so the mark stays an ordinary outbound link.
 *     That is the one case this module answers by declining to build a section.
 *
 * **Identity first, then the rest**, which is the arrangement `TermPanel` and
 * `ClaimPanel` already use: the heading names the thing, and everything under it
 * qualifies it. §7.2 is ambiguous about the order and phase 16 settled it for the
 * two level-2 panels; a third arrangement here would make three panels read as three
 * designs.
 *
 * **A panel per target, not per mark.** `ChromeState.target` for a reference is the
 * anchor's `href` (see `lib/kb/chrome-state.ts`), because a reference mark carries
 * no id — and two marks aimed at the same thing therefore share one panel, which is
 * also the only honest answer: the panel is about the target, and the target is the
 * same. The content measures 3900 authored references across the 537 nodes, with
 * `kis-fermat-tetel-megjegyzes` a worked example: 11 references, two of them
 * external and two pairs sharing a target, so 7 panels.
 *
 * A server component, like every other panel content and for the same two reasons:
 * the graph cannot cross the client boundary, and §2.1 requires this in the served
 * HTML — an outgoing reference is an edge of the knowledge graph, and the crawler
 * that cannot see the panel can at least see the link (D1) and now the target's
 * name beside it.
 */

/**
 * The anchor prefix for a claim or a term rendered inside a reference panel.
 *
 * A referenced body brings its own claims and terms, and both render with an id
 * (`components/content/blocks/ClaimBlock.tsx`, `components/content/InlineText.tsx`).
 * Rendered under the page's own scope those ids would collide with the page's —
 * `#fogalmak.{slug}` would stop being an anchor and "which element is the selection"
 * would stop having one answer — so the panel's copies get a namespace of their own,
 * as `ClaimPanel` does for the same reason. The target's fully qualified name is
 * what makes it unique per panel: one panel per target (see above), so one prefix.
 * Nothing links to these ids and nothing selects them; they exist only because that
 * is how a claim and a term render.
 */
const PANEL_PREFIX = 'kb-panel'

const scopeFor = (node: KbNode, target: PathRefTarget): AnchorParent => ({
  locale: node.locale,
  prefix: `${PANEL_PREFIX}.${target.fqn}`,
})

/** What the panel says about the thing a reference points at. */
interface ReferenceSubject {
  /** The target's own page, at the target: the reference's own resolved href. */
  href: string
  /** The panel's heading — the target's name, whatever names it. */
  title: ReactNode
  /** What is shown about it, or null for the book hierarchy (§7.1: no body). */
  detail: ReactNode
}

/**
 * The sections a node's outgoing references contribute to the panel, one per
 * distinct target.
 *
 * Order is the order of the node's own `references` map, which is the order the
 * references were authored in rather than the order they appear in the prose. The
 * panel is a set of hidden contents addressed by `target`, so nothing about it is
 * read in order; the map's order is simply the one order that exists.
 *
 * Two references are dropped: an external one, which §7.1 gives no panel, and one
 * whose `href` is unresolved — `resolveRefHrefs` throws rather than leaving an
 * internal target unresolved, so the guard is for the `[slug]` that resolves to no
 * entry at all, which `InlineText` renders as `[slug]` and never as a link.
 */
export function referencePanels(node: KbNode): KbPanelSection[] {
  const graph = getContentGraph()
  const sections: KbPanelSection[] = []
  // By href, because that is what identifies a panel — see PANEL_PREFIX above.
  const seen = new Set<string>()

  for (const entry of Object.values(kbRefs(node.references) ?? {})) {
    if (!isPathTarget(entry.target)) continue
    if (!entry.href || seen.has(entry.href)) continue
    const subject = subjectOf(graph, node, entry.target, entry.href)
    if (!subject) continue
    seen.add(subject.href)
    sections.push({
      key: 'reference',
      target: subject.href,
      title: subject.title,
      content: <ReferencePanel node={node} subject={subject} />,
    })
  }

  return sections
}

interface ReferencePanelProps {
  /** The page the reference was pressed on — its locale labels the link. */
  node: KbNode
  subject: ReferenceSubject
}

export default function ReferencePanel({ node, subject }: ReferencePanelProps) {
  return (
    <>
      {subject.detail}
      {/*
        The second, deliberate step §7.1 asks for: the whole thing, on its own page.
        An ordinary link, as every link in a panel is — panel content is what the
        reader is meant to be acting on, so it navigates (§6.4).
      */}
      <p className={styles.referenceOpen}>
        <Link href={subject.href} className={styles.referenceLink}>
          {getLocaleLabel(node.locale, 'kbPanelReferenceOpen')}
        </Link>
      </p>
    </>
  )
}

/**
 * §7.1's table, one branch per target kind.
 *
 * Null where the graph holds nothing to show. For an entity, a claim or a term that
 * cannot happen — `resolveRefHrefs` throws while building the graph unless the
 * target and its parent are both in it — so the guards are what makes that visible
 * as "no panel" rather than as a crash if it ever does.
 */
function subjectOf(
  graph: ContentGraph,
  node: KbNode,
  target: PathRefTarget,
  href: string,
): ReferenceSubject | null {
  switch (target.type) {
    case 'definition':
    case 'theorem':
    case 'proof':
    case 'remark': {
      const entity = kbNodeByKey(graph, target.fqn)
      if (!entity) return null
      const scope = scopeFor(entity, target)
      return {
        href,
        // `kbNodeTitle` rather than the authored title: 262 of the 537 nodes have
        // none (every proof and every remark), and it is the one name that is
        // always there — the same name a backlink row shows for the same node.
        title: <InlineText text={kbNodeTitle(graph, entity)} />,
        detail: (
          <>
            <p className={styles.referenceLabel}>{kbNodeLabel(graph, entity)}</p>
            {/*
              The body as the reader met it in the book: the same `ContentBlocks`
              over the same blocks, so the typography, the LaTeX, the claims and the
              terms are the ones the target's own page shows. Its OWN references are
              resolved for the knowledge-base context, so a link out of this preview
              lands on a page rather than on a chapter anchor.

              No `embedIndices` or `figureIndices`: no knowledge-base body carries an
              embed or a recall block (measured: 0 of the 537), and a figure inside
              one keeps its caption without the chapter-scoped number — that number
              belongs to the chapter this preview is not in.
            */}
            <div className={styles.referenceBody}>
              <ContentBlocks
                blocks={entity.body}
                refs={kbRefs(entity.references)}
                context="web"
                parentEntity={scope}
                terms={entity.terms}
                termParent={scope}
              />
            </div>
          </>
        ),
      }
    }

    case 'claim': {
      const owner = kbNodeByKey(graph, target.parentFqn)
      if (!owner) return null
      // The same list `ContentBlocks` numbers, so "3. állítás" here is the claim the
      // owning node's body prints a 3 in front of.
      const claims = webClaims(owner)
      const index = claims.findIndex((claim) => claim.name === target.name)
      const claim = claims[index]
      if (!claim) return null
      const scope = scopeFor(owner, target)
      return {
        href,
        title: formatLocaleLabel(node.locale, 'kbPanelClaim', { index: index + 1 }),
        detail: (
          <>
            {/* Which node asserts it: a claim has no page of its own, so its name
                is its number, and a number needs to say what it is a number in. */}
            <p className={styles.referenceLabel}>{kbNodeTitle(graph, owner)}</p>
            <div className={styles.selectionClaim}>
              <InlineText
                text={claim.content}
                refs={kbRefs(owner.references)}
                terms={owner.terms}
                termParent={scope}
              />
              {claim.formula && (
                <div
                  className={styles.selectionFormula}
                  dangerouslySetInnerHTML={{ __html: renderKatex(claim.formula, true) }}
                />
              )}
            </div>
          </>
        ),
      }
    }

    case 'term': {
      const owner = kbNodeByKey(graph, target.parentFqn)
      const term = owner?.terms?.[target.name]
      if (!owner || !term) return null
      const synonyms = term.synonyms ?? []
      return {
        href,
        // The canonical form, which is what `TermPanel` heads its panel with — the
        // glossary's name for the term rather than the words the prose displayed.
        title: <InlineText text={term.canonical} />,
        detail: (
          <>
            <p className={styles.referenceLabel}>{kbNodeTitle(graph, owner)}</p>
            {synonyms.length > 0 && (
              <p className={styles.selectionMeta}>
                <span className={styles.selectionMetaLabel}>
                  {getLocaleLabel(node.locale, 'kbPanelTermSynonyms')}
                </span>{' '}
                {/* One comma-separated line, as `TermPanel` shows them: a synonym is
                    a name, and the glossary is where each gets a row. */}
                <InlineText text={synonyms.join(', ')} />
              </p>
            )}
          </>
        ),
      }
    }

    // The book hierarchy: the title and the link, and no body (§7.1). A part and a
    // book index are not in that row's wording, which names "a section, chapter or
    // part" — they are the same kind of thing one and two steps up, and the reason
    // the row exists (a chapter's body is a chapter long) applies to them at least
    // as strongly. The content references one book and one chapter from a
    // knowledge-base node today, and one section.
    case 'book': {
      const book = graph.books.get(target.fqn)
      return book ? { href, title: <InlineText text={book.title} />, detail: null } : null
    }
    case 'part': {
      const part = graph.parts.get(target.fqn)
      return part ? { href, title: <InlineText text={part.title} />, detail: null } : null
    }
    case 'chapter': {
      const chapter = graph.chapters.get(target.fqn)
      return chapter ? { href, title: <InlineText text={chapter.title} />, detail: null } : null
    }
    case 'section': {
      const section = graph.sections.get(target.fqn)
      return section ? { href, title: <InlineText text={section.title} />, detail: null } : null
    }

    // A standalone item — an article, a newsletter, a custom page, a landing page.
    // §7.1's table has no row for one, and no knowledge-base node references one
    // (measured: 0 of the 3900 references), so rather than invent a treatment this
    // builds no panel and the mark stays what it already is: a link that navigates.
    default:
      return null
  }
}
