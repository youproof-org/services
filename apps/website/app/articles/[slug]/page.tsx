import { notFound } from 'next/navigation'
import StandaloneRoute from '@/components/content/StandaloneRoute'
import { getContentGraph, initContentGraph } from '@/lib/content'

export async function generateStaticParams() {
  await initContentGraph()
  const graph = getContentGraph()
  // Enumerate every article (published or not) so referenced paths resolve;
  // unpublished ones render a stub on deployed envs.
  return Array.from(graph.articles.values()).map((a) => ({ slug: a.name }))
}

interface ArticleRouteProps {
  params: Promise<{ slug: string }>
}

export default async function ArticleRoute({ params }: ArticleRouteProps) {
  const { slug } = await params
  await initContentGraph()
  const graph = getContentGraph()
  const node = graph.articles.get(`/articles/${slug}`)
  if (!node) notFound()

  return (
    <StandaloneRoute
      node={node}
      breadcrumbs={[
        { label: 'Főoldal', href: '/' },
        { label: 'Cikkek', href: '/articles' },
        { label: node.title, href: `/articles/${slug}` },
      ]}
    />
  )
}
