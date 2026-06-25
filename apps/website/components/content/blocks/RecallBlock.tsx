import type { EmbedTarget } from '@/lib/content/types'
import styles from './recall-block.module.scss'

interface RecallBlockProps {
  target: EmbedTarget
  embedIndices?: Record<string, string>
}

const TYPE_LABELS: Record<string, string> = {
  definition: 'Def.',
  theorem: 'Tétel',
  proof: 'Biz.',
  remark: 'Megj.',
}

export default function RecallBlock({ target, embedIndices }: RecallBlockProps) {
  const ns = target.namespace.startsWith('/') ? target.namespace.slice(1) : target.namespace
  const entityKey = `/entities/${ns}/${target.name}`
  const label = embedIndices?.[entityKey] ?? target.name
  const typeLabel = TYPE_LABELS[target.type] ?? target.type

  return (
    <div className={styles.recall}>
      <span className={styles['type-label']}>{typeLabel}</span>
      <span>{label}</span>
    </div>
  )
}
