import Link from 'next/link'
import type { ReactNode } from 'react'
import InlineText from '@/components/content/InlineText'
import { getContentGraph } from '@/lib/content'
import { kbNodeByKey, kbNodeLabel, kbNodeTitle } from '@/lib/content/graph'
import { kbRefs } from '@/lib/content/urls'
import { formatLocaleLabel, getLocaleLabel } from '@/lib/i18n/config'
import { isPathTarget } from '@/lib/content/types'
import type { ContentGraph, KbNode, PathRefTarget } from '@/lib/content/types'
import type { KbPanelSection } from '../Panel'
import { webClaims } from './ClaimPanel'
import styles from '../panel.module.scss'

/**
 * One outgoing reference from the body, pressed (sub-plan §7.1).
 *
 * **What a reference panel is for.** A reference in a proof is part of the sentence
 * it sits in, and following it costs the reader the sentence. So a plain press does
 * not navigate: it says what the mark points at, next to the prose that leans on it,
 * and offers the target's own page as a second, deliberate step.
 *
 * **What it says.** The thing's own name, the kind of thing it is, and the way
 * there — one arrangement for every target kind:
 *
 *   - an entity (definition, theorem, proof, remark): its title, and its label
 *     ("15.6. Definíció"), which is what tells the reader whether they are about to
 *     land on a definition or a theorem;
 *   - a claim: its number, and the node that asserts it;
 *   - a term: its canonical form, and the node that defines it;
 *   - a book, a part, a chapter or a section: the title, which is the whole of what
 *     identifies one;
 *   - an external URL: no panel at all, so the mark stays an ordinary outbound link.
 *     That is the one case this module answers by declining to build a section.
 *
 * **Why no preview of the target's content.** §7.1 also asked for the entity's body,
 * the claim restated and the term's synonyms, and §2.1 requires panel content in the
 * served HTML — so every citing page carried a copy of everything it cited. Measured
 * over the export, the previews cost the average knowledge-base page 52 KiB of its
 * 177.0 KiB and the largest page 0.67 MB of its 2.10 MB, because a definition's body
 * is served once per citation. The ruling is that the preview is not worth that: the
 * panel answers "what is this called, and what kind of thing is it?", and the rest is
 * one link away on the target's own page. §7.1 already prescribed exactly that for a
 * section, so this is that row applied to all five kinds rather than a sixth
 * treatment — and five arrangements becoming one is also five panels reading as one
 * design.
 *
 * **Identity first, then the rest**, which is the arrangement `TermPanel` and
 * `ClaimPanel` already use: the heading names the thing, and the line under it
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

/** What the panel says about the thing a reference points at. */
interface ReferenceSubject {
  /** The target's own page, at the target: the reference's own resolved href. */
  href: string
  /** The panel's heading — the target's name, whatever names it. */
  title: ReactNode
  /**
   * The line under the heading: what kind of thing this is, or which node holds it.
   * Null for the book hierarchy, where the title is already the whole answer.
   */
  label: ReactNode
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
  // By href, because that is what identifies a panel — one panel per target.
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
      {subject.label && <p className={styles.referenceLabel}>{subject.label}</p>}
      {/*
        The second, deliberate step §7.1 asks for, and now the whole of what the panel
        offers beyond the name: the thing itself, on its own page. An ordinary link,
        as every link in a panel is — panel content is what the reader is meant to be
        acting on, so it navigates (§6.4).
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
 * The name and the label per target kind, one branch each.
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
      return {
        href,
        // `kbNodeTitle` rather than the authored title: 262 of the 537 nodes have
        // none (every proof and every remark), and it is the one name that is
        // always there — the same name a backlink row shows for the same node.
        title: <InlineText text={kbNodeTitle(graph, entity)} />,
        label: kbNodeLabel(graph, entity),
      }
    }

    case 'claim': {
      const owner = kbNodeByKey(graph, target.parentFqn)
      if (!owner) return null
      // The same list `ContentBlocks` numbers, so "3. állítás" here is the claim the
      // owning node's body prints a 3 in front of. The number is all the name a
      // claim has, which is why this list is still needed with the text gone.
      const index = webClaims(owner).findIndex((claim) => claim.name === target.name)
      if (index < 0) return null
      return {
        href,
        title: formatLocaleLabel(node.locale, 'kbPanelClaim', { index: index + 1 }),
        // Which node asserts it: a claim has no page of its own, so its name is its
        // number, and a number needs to say what it is a number in.
        label: kbNodeTitle(graph, owner),
      }
    }

    case 'term': {
      const owner = kbNodeByKey(graph, target.parentFqn)
      const term = owner?.terms?.[target.name]
      if (!owner || !term) return null
      return {
        href,
        // The canonical form, which is what `TermPanel` heads its panel with — the
        // glossary's name for the term rather than the words the prose displayed.
        title: <InlineText text={term.canonical} />,
        label: kbNodeTitle(graph, owner),
      }
    }

    // The book hierarchy: the title and the link. A part and a book index are not in
    // §7.1's wording, which names "a section, chapter or part" — they are the same
    // kind of thing one and two steps up, and one title is as much as identifies any
    // of them. The content references one book and one chapter from a knowledge-base
    // node today, and one section.
    case 'book': {
      const book = graph.books.get(target.fqn)
      return book ? { href, title: <InlineText text={book.title} />, label: null } : null
    }
    case 'part': {
      const part = graph.parts.get(target.fqn)
      return part ? { href, title: <InlineText text={part.title} />, label: null } : null
    }
    case 'chapter': {
      const chapter = graph.chapters.get(target.fqn)
      return chapter ? { href, title: <InlineText text={chapter.title} />, label: null } : null
    }
    case 'section': {
      const section = graph.sections.get(target.fqn)
      return section ? { href, title: <InlineText text={section.title} />, label: null } : null
    }

    // A standalone item — an article, a newsletter, a custom page, a landing page.
    // §7.1's table has no row for one, and no knowledge-base node references one
    // (measured: 0 of the 3900 references), so rather than invent a treatment this
    // builds no panel and the mark stays what it already is: a link that navigates.
    default:
      return null
  }
}
