import SiteHeader from '@/components/layout/SiteHeader'
import SiteFooter from '@/components/layout/SiteFooter'
import UnavailableStub from '@/components/content/UnavailableStub'

// There is no all-books index (a single book exists, and the homepage lists
// books). Hitting /books directly is a dead end, not a directory — render the
// generic stub on every environment. Mirrors app/not-found.tsx.
export default function BooksIndex() {
  return (
    <div className="book-shell">
      <SiteHeader breadcrumbs={[{ label: 'Főoldal', href: '/' }]} />
      <div className="hero-placeholder" aria-hidden="true" />
      <main className="page-content">
        <UnavailableStub />
      </main>
      <SiteFooter />
    </div>
  )
}
