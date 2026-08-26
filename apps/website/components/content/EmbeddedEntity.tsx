import type { ContentBlock, RefMap, TermMap, AnchorParent } from '@/lib/content/types'
import { ENTITY_LABEL_HU } from '@/lib/content/display-template'
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
}

export default function EmbeddedEntity({ entityType, anchorId, body, label, canonicalLabel, embedIndices, figureIndices, showTitle, title, refs, terms, termParent }: EmbeddedEntityProps) {
  const typeLabelRaw = canonicalLabel ?? ENTITY_LABEL_HU[entityType] ?? entityType
  const typeLabel = typeLabelRaw.charAt(0).toUpperCase() + typeLabelRaw.slice(1)
  // Claims inside this entity share the term scope: both hang off the same node.
  const parentEntity: AnchorParent | undefined = termParent

  if (entityType === 'proof') {
    return (
      <div id={anchorId} className={styles.proof}>
        <h4 className={styles['entity-label']}>
          {typeLabel}{showTitle && title ? ` (${title})` : ''}:
        </h4>
        <ContentBlocks blocks={body} embedIndices={embedIndices} figureIndices={figureIndices} refs={refs} parentEntity={parentEntity} context="web" terms={terms} termParent={termParent} />
        <p className={styles.qed}>∎</p>
      </div>
    )
  }

  if (entityType === 'remark') {
    return (
      <div id={anchorId} className={styles.remark}>
        <h4 className={styles['entity-label']}>
          {label ? `${label}` : ''}{typeLabel}{showTitle && title ? ` (${title})` : ''}:
        </h4>
        <ContentBlocks blocks={body} embedIndices={embedIndices} figureIndices={figureIndices} refs={refs} parentEntity={parentEntity} context="web" terms={terms} termParent={termParent} />
        <p className={styles.qed}>♣</p>
      </div>
    )
  }

  const boxClass = entityType === 'definition' ? styles.definition : styles.theorem

  return (
    <div id={anchorId} className={boxClass}>
      <h4 className={styles['entity-label']}>
        {label ? `${label} ` : ''}{typeLabel}{showTitle && title ? ` (${title})` : ''}:
      </h4>
      <ContentBlocks blocks={body} embedIndices={embedIndices} figureIndices={figureIndices} refs={refs} parentEntity={parentEntity} context="web" terms={terms} termParent={termParent} />
      <p className={styles.qed}>♣</p>
    </div>
  )
}
