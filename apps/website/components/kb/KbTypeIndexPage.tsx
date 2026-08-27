import { getLocaleLabel } from '@/lib/i18n/config'

// One design, two instances: the definitions index and the theorems index differ
// only in the node type they list.
export type KbIndexType = 'definition' | 'theorem'

interface KbTypeIndexPageProps {
  locale: string
  type: KbIndexType
}

// Definitions/theorems index body. Placeholder: the title only, so the routing and
// the shell around it can be reviewed before the filtered, collated node list lands
// on it.
export default function KbTypeIndexPage({ locale, type }: KbTypeIndexPageProps) {
  const title = getLocaleLabel(locale, type === 'definition' ? 'definitionsIndex' : 'theoremsIndex')
  return <h1>{title}</h1>
}
