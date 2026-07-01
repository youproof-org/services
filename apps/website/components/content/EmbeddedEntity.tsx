import type { ContentBlock, RefMap, TermMap } from '@/lib/content/types'
import { ENTITY_LABEL_HU } from '@/lib/content/display-template'
import { entityId } from '@/lib/utils/entity-id'
import ContentBlocks from './ContentBlocks'
import styles from './embedded-entity.module.scss'

interface EmbeddedEntityProps {
  entityType: string
  namespace: string
  name: string
  body: ContentBlock[]
  label?: string
  canonicalLabel?: string
  embedIndices?: Record<string, string>
  figureIndices?: Map<object, string>
  showTitle?: boolean
  title?: string
  refs?: RefMap
  terms?: TermMap
  termParent?: { type: string; namespace: string; name: string }
}

export default function EmbeddedEntity({ entityType, namespace, name, body, label, canonicalLabel, embedIndices, figureIndices, showTitle, title, refs, terms, termParent }: EmbeddedEntityProps) {
  const typeLabelRaw = canonicalLabel ?? ENTITY_LABEL_HU[entityType] ?? entityType
  const typeLabel = typeLabelRaw.charAt(0).toUpperCase() + typeLabelRaw.slice(1)
  const parentEntity = { type: entityType, namespace, name }

  if (entityType === 'proof') {
    return (
      <div id={entityId(entityType, namespace, name)} className={styles.proof}>
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
      <div id={entityId(entityType, namespace, name)} className={styles.remark}>
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
    <div id={entityId(entityType, namespace, name)} className={boxClass}>
      <h4 className={styles['entity-label']}>
        {label ? `${label} ` : ''}{typeLabel}{showTitle && title ? ` (${title})` : ''}:
      </h4>
      <ContentBlocks blocks={body} embedIndices={embedIndices} figureIndices={figureIndices} refs={refs} parentEntity={parentEntity} context="web" terms={terms} termParent={termParent} />
      <p className={styles.qed}>♣</p>
    </div>
  )
}
