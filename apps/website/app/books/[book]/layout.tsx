import SiteFooter from '@/components/layout/SiteFooter'

interface BookLayoutProps {
  children: React.ReactNode
}

// Each page in this subtree renders its own SiteHeader with the correct breadcrumbs.
// This layout only provides the outer flex shell and the shared footer.
export default function BookLayout({ children }: BookLayoutProps) {
  return (
    <div className="book-shell">
      {children}
      <SiteFooter />
    </div>
  )
}
