import { getLocaleLabel } from '@/lib/i18n/config'

interface GlossaryPageProps {
  locale: string
}

// Glossary body. Placeholder: the title only, so the routing and the shell around it
// can be reviewed before the one-row-per-name list and its filter land on it.
export default function GlossaryPage({ locale }: GlossaryPageProps) {
  return <h1>{getLocaleLabel(locale, 'glossary')}</h1>
}
