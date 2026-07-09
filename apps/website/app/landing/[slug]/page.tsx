import { notFound } from 'next/navigation'
import StandaloneRoute from '@/components/content/StandaloneRoute'
import { getContentGraph, initContentGraph } from '@/lib/content'

export async function generateStaticParams() {
  await initContentGraph()
  const graph = getContentGraph()
  return Array.from(graph.landings.values()).map((l) => ({ slug: l.name }))
}

interface LandingRouteProps {
  params: Promise<{ slug: string }>
}

// Landing pages are ad entry points — unlisted, and rendered with the minimal
// header (no nav/search/breadcrumb) to keep the reader on the conversion path.
export default async function LandingRoute({ params }: LandingRouteProps) {
  const { slug } = await params
  await initContentGraph()
  const graph = getContentGraph()
  const node = graph.landings.get(`/landing/${slug}`)
  if (!node) notFound()

  return <StandaloneRoute node={node} mode="minimal" />
}
