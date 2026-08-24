import type { ContentBlock, RefMap, TermMap, AnchorParent } from '@/lib/content/types'
import { ENTITY_LABEL_HU } from '@/lib/content/display-template'
import { entityAnchorId } from '@/lib/content/urls'
import type { AnchorKey } from '@/lib/i18n/config'
import ContentBlocks from './ContentBlocks'
import styles from './embedded-entity.module.scss'

interface EmbeddedEntityProps {
  entityType: string
  namespace: string
  name: string
  // Localized slug — the element id an entity-scoped cross-reference targets when
  // it lands on the embedding chapter rather than the node's own page.
  slug: string
  // The node's locale, which localizes its own anchor prefix and those of the
  // claims and terms inside it (see AnchorParent).
  locale: string
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

export default function EmbeddedEntity({ entityType, namespace, name, slug, locale, body, label, canonicalLabel, embedIndices, figureIndices, showTitle, title, refs, terms, termParent }: EmbeddedEntityProps) {
  const typeLabelRaw = canonicalLabel ?? ENTITY_LABEL_HU[entityType] ?? entityType
  const typeLabel = typeLabelRaw.charAt(0).toUpperCase() + typeLabelRaw.slice(1)
  const parentEntity: AnchorParent = { type: entityType, namespace, name, locale }
  // `entityType` is whatever the graph node reported, which is always one of the
  // four knowledge-base kinds.
  const anchorId = entityAnchorId({ type: entityType as AnchorKey, slug, locale })

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
