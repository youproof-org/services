import SiteHeader from '@/components/layout/SiteHeader'
import SiteFooter from '@/components/layout/SiteFooter'
import UnavailableStub from '@/components/content/UnavailableStub'

// Rendered by Next.js for any path with no matching route/param (also uploaded
// as the CDN 404 object). Shares the generic "Sorry" stub with unpublished,
// legacy-path-less chapters. Lives under the root layout only (not the book
// layout), so it renders its own shell + footer.
export default function NotFound() {
  return (
    <div className="book-shell">
      <SiteHeader breadcrumbs={[{ label: 'Főoldal', href: '/' }]} />
      <main className="stub-main">
        <UnavailableStub />
      </main>
      <SiteFooter />
    </div>
  )
}
