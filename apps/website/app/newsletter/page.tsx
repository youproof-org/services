import StandaloneIndex from '@/components/content/StandaloneIndex'
import { getContentGraph, initContentGraph, listPublished } from '@/lib/content'

export default async function NewsletterIndex() {
  await initContentGraph()
  const graph = getContentGraph()
  return (
    <StandaloneIndex
      title="Hírek"
      hrefBase="/newsletter"
      items={listPublished(graph.newsletters)}
      breadcrumbs={[
        { label: 'Főoldal', href: '/' },
        { label: 'Hírek', href: '/newsletter' },
      ]}
    />
  )
}
