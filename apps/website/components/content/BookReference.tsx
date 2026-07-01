import Link from 'next/link'
import type { BookNode } from '@/lib/content/types'
import styles from './book-reference.module.scss'

interface BookReferenceProps {
  book: BookNode
  bookRomanIndex: string
}

export default function BookReference({ book, bookRomanIndex }: BookReferenceProps) {
  return (
    <Link href={`/books/${book.name}`} className={styles['book-ref']}>
      {book.logo && (
        <div className={styles['book-ref__logo']}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={book.logo.src}
            alt={book.logo.alt}
            style={{ objectFit: 'contain' }}
            loading="lazy"
            width='100%'
            height='100%'
          />
        </div>
      )}
      <div className={styles['book-ref__info']}>
        <p className={styles['book-ref__episode']}>Episode <strong>{bookRomanIndex}</strong></p>
        <p className={styles['book-ref__title']}>{book.title}</p>
      </div>
    </Link>
  )
}
