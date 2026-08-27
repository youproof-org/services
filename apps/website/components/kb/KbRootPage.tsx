import { getLocaleLabel } from '@/lib/i18n/config'

interface KbRootPageProps {
  locale: string
}

// Knowledge-base root page body. Placeholder: the title only, so the routing and
// the shell around it can be reviewed before the three section cards (the orienting
// description, and the per-section counts) land on it.
export default function KbRootPage({ locale }: KbRootPageProps) {
  return <h1>{getLocaleLabel(locale, 'knowledgeBase')}</h1>
}
