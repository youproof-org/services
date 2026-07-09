import StandaloneIndex from '@/components/content/StandaloneIndex'
import { getContentGraph, initContentGraph, listAll } from '@/lib/content'

export default async function ArticlesIndex() {
  await initContentGraph()
  const graph = getContentGraph()
  return (
    <StandaloneIndex
      title="Cikkek"
      hrefBase="/articles"
      // Include unmigrated articles (no published-at) — they link to a
      // not-migrated stub, like unmigrated chapters in a book's TOC.
      items={listAll(graph.articles)}
      breadcrumbs={[
        { label: 'Főoldal', href: '/' },
        { label: 'Cikkek', href: '/articles' },
      ]}
    />
  )
}
