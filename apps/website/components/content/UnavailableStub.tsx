import Link from 'next/link'
import styles from './stub-page.module.scss'

// Generic "Sorry" stub. Shared by the global not-found page and by chapter
// pages whose YAML is `published: false` with no `legacy-path`.
export default function UnavailableStub() {
  return (
    <div className={styles.stub}>
      <h1 className={styles.title}>Sajnáljuk, ez az oldal nem érhető el</h1>
      <p className={styles.message}>
        A keresett oldal nem található, vagy még nem elérhető.
      </p>
      <Link href="/" className={styles.action}>
        Vissza a főoldalra
      </Link>
    </div>
  )
}
