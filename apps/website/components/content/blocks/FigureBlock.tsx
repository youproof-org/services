import type { RefMap, TermMap } from '@/lib/content/types'
import InlineText from '../InlineText'
import styles from './figure-block.module.scss'

interface FigureBlockProps {
  leadIn?: string
  selfRefDisplay?: string
  src: string
  alt?: string
  caption?: string
  figureIndex?: string
  size?: 'small' | 'medium' | 'large'
  refs?: RefMap
  terms?: TermMap
  termParent?: { type: string; namespace: string; name: string }
}

export default function FigureBlock({ leadIn, selfRefDisplay, src, alt, caption, figureIndex, size, refs, terms, termParent }: FigureBlockProps) {
  return (
    <figure className={styles.figure}>
      {leadIn && (
        <p className={styles['lead-in']}>
          <InlineText text={leadIn} refs={refs} terms={terms} termParent={termParent} selfRefDisplay={selfRefDisplay} />
        </p>
      )}
      <div className={styles['image-wrapper']}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={alt ?? caption ?? ''}
          className={`${styles.img}${size === 'small' || size === 'medium' ? ` ${styles[size]}` : ''}`}
          loading="lazy"
        />
      </div>
      <figcaption className={styles.caption}>
        {figureIndex && caption && <strong>{figureIndex} ábra: </strong>}
        {figureIndex && !caption && <strong>{figureIndex} ábra</strong>}
        {caption &&
          <InlineText text={caption} refs={refs} terms={terms} termParent={termParent} />
        }
      </figcaption>
    </figure>
  )
}
