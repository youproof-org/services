import Link from 'next/link'
import styles from './book-toc.module.scss'

interface ChapterEntry {
  name: string
  title: string
}

interface PartEntry {
  name: string
  title: string
  chapters: ChapterEntry[]
}

interface BookTocProps {
  bookName: string
  bookTitle: string
  parts: PartEntry[]
}

export default function BookToc({ bookName, bookTitle, parts }: BookTocProps) {
  let chapterIndex = 0

  return (
    <div className={styles.toc}>
      <h1 className={styles.heading}>{bookTitle}</h1>
      <div className={styles.parts}>
        {parts.map((part) => {
          return (
            <section key={part.name}>
              <h2 className={styles['part-title']}>{part.title}</h2>
              <ol className={styles.chapters}>
                {part.chapters.map((chapter) => {
                  chapterIndex++
                  const n = chapterIndex
                  return (
                    <li key={chapter.name} className={styles.chapter}>
                      <Link href={`/books/${bookName}/chapters/${chapter.name}`}>
                        <span className={styles['chapter-number']}>{n}.</span>
                        <span>{chapter.title}</span>
                      </Link>
                    </li>
                  )
                })}
              </ol>
            </section>
          )
        })}
      </div>
    </div>
  )
}
