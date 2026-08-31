import type { RefMap, TermMap, AnchorParent } from '@/lib/content/types'
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
  // Intrinsic pixel dimensions (from the figure-dimensions sidecar). Rendered as
  // width/height so the browser reserves space for lazy figures — otherwise a
  // figure above an anchor loads late and shifts the cross-ref target out of view.
  width?: number
  height?: number
  refs?: RefMap
  terms?: TermMap
  termParent?: AnchorParent
}

export default function FigureBlock({ leadIn, selfRefDisplay, src, alt, caption, figureIndex, size, width, height, refs, terms, termParent }: FigureBlockProps) {
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
          width={width}
          height={height}
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
