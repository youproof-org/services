import SiteHeader from '@/components/layout/SiteHeader'
import SiteFooter from '@/components/layout/SiteFooter'
import UnavailableStub from '@/components/content/UnavailableStub'

// Landing pages are intentionally unlisted (ad entry points only). There is no
// listing at /landing — render the generic stub on every environment.
export default function LandingIndex() {
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
