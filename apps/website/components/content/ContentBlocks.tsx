import type {
  ContentBlock,
  DefinitionNode,
  TheoremNode,
  ProofNode,
  RemarkNode,
  RefMap,
  TermMap,
  AnchorParent,
} from '@/lib/content/types'
import { getContentGraph } from '@/lib/content'
import { kbPageExists } from '@/lib/content/graph'
import { kbAnchorPath, embeddedScope, urlForKbNode } from '@/lib/content/urls'

type AnyEntity = DefinitionNode | TheoremNode | ProofNode | RemarkNode
import InlineText from './InlineText'
import NarrativeBlock from './blocks/NarrativeBlock'
import FormulaBlock from './blocks/FormulaBlock'
import FigureBlock from './blocks/FigureBlock'
import ListBlock from './blocks/ListBlock'
import RecallBlock from './blocks/RecallBlock'
import QuoteBlock from './blocks/QuoteBlock'
import SubsectionBlock from './blocks/SubsectionBlock'
import DetailsBlock from './blocks/DetailsBlock'
import EmbeddedEntity from './EmbeddedEntity'
import ClaimBlock from './blocks/ClaimBlock'
import styles from './content-blocks.module.scss'

interface ContentBlocksProps {
  blocks: ContentBlock[]
  embedIndices?: Record<string, string>
  figureIndices?: Map<object, string>
  refs?: RefMap
  context: 'web' | 'latex'
  dropCapFirst?: boolean
  parentEntity?: AnchorParent
  terms?: TermMap
  termParent?: AnchorParent
}

export default function ContentBlocks({ blocks, embedIndices, figureIndices, refs, context, dropCapFirst, parentEntity, terms, termParent }: ContentBlocksProps) {
  let firstNarrativeSeen = false
  let claimIndex = 0
  return (
    <>
      {blocks.map((block, i) => {
        if (block.context && block.context !== context) return null
        switch (block.type) {
          case 'narrative': {
            const isFirst = dropCapFirst && !firstNarrativeSeen
            firstNarrativeSeen = true
            return (
              <NarrativeBlock
                key={i}
                content={block.content}
                refs={refs}
                dropCap={isFirst}
                terms={terms}
                termParent={termParent}
              />
            )
          }
          case 'formula':
            return (
              <FormulaBlock
                key={i}
                leadIn={block.leadIn}
                content={block.content}
                leadOut={block.leadOut}
                refs={refs}
                terms={terms}
                termParent={termParent}
              />
            )
          case 'figure':
            return (
              <FigureBlock
                key={i}
                leadIn={block.leadIn}
                src={block.src}
                alt={block.alt}
                caption={block.caption}
                figureIndex={figureIndices?.get(block)}
                selfRefDisplay={block.selfReference?.display}
                size={block.size}
                width={block.width}
                height={block.height}
                refs={refs}
                terms={terms}
                termParent={termParent}
              />
            )
          case 'unordered-list':
          case 'ordered-list':
            return (
              <ListBlock
                key={i}
                type={block.type}
                leadIn={block.leadIn}
                items={block.items}
                refs={refs}
                terms={terms}
                termParent={termParent}
              />
            )
          case 'recall':
            return (
              <RecallBlock
                key={i}
                target={block.target}
                embedIndices={embedIndices}
              />
            )
          case 'embed': {
            const graph = getContentGraph()
            const { type: entityType, name, fqn: entityKey } = block.target
            const label = embedIndices?.[entityKey]

            let entity: AnyEntity | undefined =
              graph.definitions.get(entityKey) ??
              graph.theorems.get(entityKey) ??
              graph.proofs.get(entityKey) ??
              graph.remarks.get(entityKey)

            if (!entity) {
              // Fallback: search by name if namespace resolution fails
              for (const v of graph.definitions.values()) {
                if (v.name === name) { entity = v; break }
              }
              if (!entity) for (const v of graph.theorems.values()) {
                if (v.name === name) { entity = v; break }
              }
              if (!entity) for (const v of graph.proofs.values()) {
                if (v.name === name) { entity = v; break }
              }
              if (!entity) for (const v of graph.remarks.values()) {
                if (v.name === name) { entity = v; break }
              }
            }

            if (!entity) {
              return (
                <div key={i} className={styles['unknown-block']}>
                  [unresolved embed: {entityType}/{name}]
                </div>
              )
            }

            // `urlForKbNode` is null-typed for a node it cannot address; `kbPageExists`
            // already rules that out here, so the coalesce is only about the type.
            const kbHref = kbPageExists(graph, entity)
              ? urlForKbNode(entity) ?? undefined
              : undefined

            return (
              <EmbeddedEntity
                key={i}
                entityType={entity.type}
                body={entity.body}
                label={label}
                embedIndices={embedIndices}
                figureIndices={figureIndices}
                showTitle={block.showTitle}
                title={entity.title}
                canonicalLabel={entity.labels?.canonical}
                refs={entity.references}
                terms={entity.terms}
                anchorId={kbAnchorPath(entity)}
                termParent={embeddedScope(entity)}
                locale={entity.locale}
                kbHref={kbHref}
              />
            )
          }
          case 'claim':
            claimIndex++
            return (
              <ClaimBlock
                key={i}
                index={claimIndex}
                name={block.name}
                slug={block.slug}
                content={block.content}
                formula={block.formula}
                refs={refs}
                parent={parentEntity}
                terms={terms}
                termParent={termParent}
              />
            )
          case 'typewriter':
            return (
              <div key={i}>
                {block.leadIn && (
                  <p className={styles['typewriter-lead-in']}>
                    <InlineText text={block.leadIn} refs={refs} />
                  </p>
                )}
                <pre className={styles['typewriter-block']}>
                  {block.rows.join('\n')}
                </pre>
              </div>
            )
          case 'quote':
            return (
              <QuoteBlock
                key={i}
                leadIn={block.leadIn}
                quote={block.quote}
                author={block.author}
                refs={refs}
                terms={terms}
                termParent={termParent}
              />
            )
          case 'subsection':
            return (
              <SubsectionBlock
                key={i}
                title={block.title}
                blocks={block.blocks}
                embedIndices={embedIndices}
                figureIndices={figureIndices}
                refs={refs}
                context={context}
                terms={terms}
                termParent={termParent}
              />
            )
          case 'details':
            return (
              <DetailsBlock
                key={i}
                title={block.title}
                blocks={block.blocks}
                embedIndices={embedIndices}
                figureIndices={figureIndices}
                refs={refs}
                context={context}
                terms={terms}
                termParent={termParent}
              />
            )
          default:
            return null
        }
      })}
    </>
  )
}
