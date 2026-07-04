import styles from './stub-page.module.scss'

interface NotMigratedStubProps {
  // Chapter's old youproof.hu path (e.g. "/some/legacy/path").
  legacyPath: string
}

// Stub for a chapter that exists in the content model but is not yet migrated
// (`published: false`) and has a `legacy-path`. Links to the legacy site.
export default function NotMigratedStub({ legacyPath }: NotMigratedStubProps) {
  const legacyHref = `https://youproof.hu${legacyPath}`
  return (
    <div className={styles.stub}>
      <h1 className={styles.title}>Ez a fejezet még nem költözött át</h1>
      <p className={styles.message}>
        Ez a tartalom még nem érhető el az új oldalon. Addig is elolvashatod
        a régi oldalunkon.
      </p>
      <a href={legacyHref} className={styles.action}>
        Tovább a régi oldalra
      </a>
    </div>
  )
}
