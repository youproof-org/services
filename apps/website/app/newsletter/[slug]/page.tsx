import { notFound } from 'next/navigation'
import StandaloneRoute from '@/components/content/StandaloneRoute'
import { getContentGraph, initContentGraph } from '@/lib/content'

export async function generateStaticParams() {
  await initContentGraph()
  const graph = getContentGraph()
  return Array.from(graph.newsletters.values()).map((n) => ({ slug: n.name }))
}

interface NewsletterRouteProps {
  params: Promise<{ slug: string }>
}

export default async function NewsletterRoute({ params }: NewsletterRouteProps) {
  const { slug } = await params
  await initContentGraph()
  const graph = getContentGraph()
  const node = graph.newsletters.get(`/newsletter/${slug}`)
  if (!node) notFound()

  return (
    <StandaloneRoute
      node={node}
      breadcrumbs={[
        { label: 'Főoldal', href: '/' },
        { label: 'Hírek', href: '/newsletter' },
        { label: node.title, href: `/newsletter/${slug}` },
      ]}
    />
  )
}
