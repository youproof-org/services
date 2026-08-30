import Link from 'next/link'
import type { ContentBlock, RefMap, TermMap, AnchorParent } from '@/lib/content/types'
import { ENTITY_LABEL_HU } from '@/lib/content/display-template'
import { getLocaleLabel } from '@/lib/i18n/config'
import ContentBlocks from './ContentBlocks'
import styles from './embedded-entity.module.scss'

interface EmbeddedEntityProps {
  entityType: string
  // The node's dotted anchor path on this page — computed by the caller, which is
  // the only place that has the graph node and therefore the ownership chain a
  // nested anchor needs (a proof's path carries its theorem).
  anchorId: string
  body: ContentBlock[]
  label?: string
  canonicalLabel?: string
  embedIndices?: Record<string, string>
  figureIndices?: Map<object, string>
  showTitle?: boolean
  title?: string
  refs?: RefMap
  terms?: TermMap
  termParent?: AnchorParent
  /** The entity's locale, for the knowledge-base link's label. */
  locale: string
  /**
   * The entity's own knowledge-base page, where this build generates one. Absent for
   * an entity whose embedding chapter is unpublished on a deployed build - there is
   * no page to lead to, so the box closes as it did before.
   */
  kbHref?: string
}

/**
 * What closes an entity box: the link out to the entity's own knowledge-base page,
 * and the glyph that ends the body.
 *
 * **The link is the only way from the narrative into the knowledge base.** A
 * reference inside a chapter resolves to the chapter's own anchor rather than to a
 * knowledge-base URL (`resolveRefHrefs` in lib/content/graph.ts resolves both for
 * every reference, and a chapter page takes the chapter one), so without this the
 * knowledge-base pages are reachable only by typing a URL: nothing outside them
 * links in, and they are not in the sitemap either. One link per embedded entity
 * makes all of them reachable by following links from the homepage.
 *
 * One line, the link at the left margin and the glyph at the right: the glyph already
 * had a line of its own, so no box grows. The arrow is decorative and hidden from
 * assistive technology, as the ownership chain's is (`OwnershipLinks`): the label
 * already says where the link goes, so there is nothing for a spoken form of it to add.
 */
function EntityClose({ mark, locale, kbHref }: { mark: string; locale: string; kbHref?: string }) {
  return (
    <div className={styles.close}>
      {kbHref && (
        <p className={styles['kb-link-row']}>
          <Link href={kbHref} className={styles['kb-link']}>
            {getLocaleLabel(locale, 'kbEmbeddedPageLink')}
            <span className={styles.arrow} aria-hidden="true">→</span>
          </Link>
        </p>
      )}
      <p className={styles.qed}>{mark}</p>
    </div>
  )
}

/*
  Each of the three shapes below carries `data-ref-owner`: an embedded entity owns the
  references in its body — `refOwners` in `lib/content/graph.ts` counts them as the
  entity's, and the "Bejövő hivatkozások" row that reports one names the entity and
  leads to the entity's own page (sub-plan §7.2). So a reference rendered inside this
  box is not one the surrounding chapter or section made, and
  `components/kb/HighlightOnArrival.tsx` uses the attribute to keep the two apart when
  it marks a source's references on arrival. Presence is the whole of it; the `id` is
  what says which entity.
*/
export default function EmbeddedEntity({ entityType, anchorId, body, label, canonicalLabel, embedIndices, figureIndices, showTitle, title, refs, terms, termParent, locale, kbHref }: EmbeddedEntityProps) {
  const typeLabelRaw = canonicalLabel ?? ENTITY_LABEL_HU[entityType] ?? entityType
  const typeLabel = typeLabelRaw.charAt(0).toUpperCase() + typeLabelRaw.slice(1)
  // Claims inside this entity share the term scope: both hang off the same node.
  const parentEntity: AnchorParent | undefined = termParent

  if (entityType === 'proof') {
    return (
      <div id={anchorId} className={styles.proof} data-ref-owner="">
        <h4 className={styles['entity-label']}>
          {typeLabel}{showTitle && title ? ` (${title})` : ''}:
        </h4>
        <ContentBlocks blocks={body} embedIndices={embedIndices} figureIndices={figureIndices} refs={refs} parentEntity={parentEntity} context="web" terms={terms} termParent={termParent} />
        <EntityClose mark="∎" locale={locale} kbHref={kbHref} />
      </div>
    )
  }

  if (entityType === 'remark') {
    return (
      <div id={anchorId} className={styles.remark} data-ref-owner="">
        <h4 className={styles['entity-label']}>
          {label ? `${label}` : ''}{typeLabel}{showTitle && title ? ` (${title})` : ''}:
        </h4>
        <ContentBlocks blocks={body} embedIndices={embedIndices} figureIndices={figureIndices} refs={refs} parentEntity={parentEntity} context="web" terms={terms} termParent={termParent} />
        <EntityClose mark="♣" locale={locale} kbHref={kbHref} />
      </div>
    )
  }

  const boxClass = entityType === 'definition' ? styles.definition : styles.theorem

  return (
    <div id={anchorId} className={boxClass} data-ref-owner="">
      <h4 className={styles['entity-label']}>
        {label ? `${label} ` : ''}{typeLabel}{showTitle && title ? ` (${title})` : ''}:
      </h4>
      <ContentBlocks blocks={body} embedIndices={embedIndices} figureIndices={figureIndices} refs={refs} parentEntity={parentEntity} context="web" terms={terms} termParent={termParent} />
      <EntityClose mark="♣" locale={locale} kbHref={kbHref} />
    </div>
  )
}
