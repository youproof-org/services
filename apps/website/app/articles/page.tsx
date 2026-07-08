import StandaloneIndex from '@/components/content/StandaloneIndex'
import { getContentGraph, initContentGraph, listPublished } from '@/lib/content'

export default async function ArticlesIndex() {
  await initContentGraph()
  const graph = getContentGraph()
  return (
    <StandaloneIndex
      title="Cikkek"
      hrefBase="/articles"
      items={listPublished(graph.articles)}
      breadcrumbs={[
        { label: 'Főoldal', href: '/' },
        { label: 'Cikkek', href: '/articles' },
      ]}
    />
  )
}
