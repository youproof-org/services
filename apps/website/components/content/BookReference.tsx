import Link from 'next/link'
import type { BookNode } from '@/lib/content/types'
import HexMark from '@/components/layout/HexMark'
import { urlForBook } from '@/lib/content/urls'
import styles from './book-reference.module.scss'

interface BookReferenceProps {
  book: BookNode
  bookRomanIndex: string
  // When true (default) the block links to the book's index page. When false it
  // renders as a plain (non-anchor) block — used on the book index page itself,
  // where the title is also the page's <h1>.
  linked?: boolean
}

export default function BookReference({ book, bookRomanIndex, linked = true }: BookReferenceProps) {
  const Title = linked ? 'p' : 'h1'
  const inner = (
    <>
      <div className={styles['book-ref__logo']}>
        <HexMark className={styles['book-ref__mark']} />
      </div>
      <div className={styles['book-ref__info']}>
        <p className={styles['book-ref__episode']}>
          Episode <strong>{bookRomanIndex}</strong>
        </p>
        <Title className={styles['book-ref__title']}>{book.title}</Title>
      </div>
    </>
  )

  return linked ? (
    <Link href={urlForBook(book)} className={styles['book-ref']}>
      {inner}
    </Link>
  ) : (
    <div className={styles['book-ref']}>{inner}</div>
  )
}
