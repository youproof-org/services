import { notFound } from 'next/navigation'
import StandaloneRoute from '@/components/content/StandaloneRoute'
import { getContentGraph, initContentGraph } from '@/lib/content'

// Reserved top-level segments that must never be shadowed by a custom `page`
// slug. The named route segments already win in Next routing; this is a
// build-time guard against accidental collisions.
const RESERVED_SLUGS = new Set([
  'books',
  'articles',
  'newsletter',
  'landing',
  'api',
  'sitemap.xml',
  'robots.txt',
])

export async function generateStaticParams() {
  await initContentGraph()
  const graph = getContentGraph()
  const params = Array.from(graph.pages.values()).map((p) => ({ slug: p.name }))
  for (const { slug } of params) {
    if (RESERVED_SLUGS.has(slug)) {
      throw new Error(
        `Custom page slug "${slug}" collides with a reserved route segment. Rename the page.`,
      )
    }
  }
  return params
}

interface PageRouteProps {
  params: Promise<{ slug: string }>
}

export default async function PageRoute({ params }: PageRouteProps) {
  const { slug } = await params
  await initContentGraph()
  const graph = getContentGraph()
  const node = graph.pages.get(`/pages/${slug}`)
  if (!node) notFound()

  return (
    <StandaloneRoute
      node={node}
      breadcrumbs={[
        { label: 'Főoldal', href: '/' },
        { label: node.title, href: `/${slug}` },
      ]}
    />
  )
}
