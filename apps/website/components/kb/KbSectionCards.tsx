import Link from 'next/link'
import { getContentGraph } from '@/lib/content'
import { kbSectionCards } from '@/lib/content/kb-sections'
import { getLocaleLabel } from '@/lib/i18n/config'
import styles from './kb-section-cards.module.scss'

interface KbSectionCardsProps {
  locale: string
  // The level a card's name sits at, which depends on what is above the cards: the
  // knowledge-base root page's h1 title, or the homepage section's h2 heading.
  headingLevel?: 'h2' | 'h3'
}

/**
 * The three section cards of the knowledge base, as plain links. Rendered both by
 * the knowledge-base root page and by the locale homepage's entry block, from the
 * one card set in `kb-sections.ts`, so the two cannot drift apart in shape, in
 * wording or in their counts.
 */
export default function KbSectionCards({
  locale,
  headingLevel: Heading = 'h2',
}: KbSectionCardsProps) {
  const cards = kbSectionCards(getContentGraph(), locale)
  return (
    <ul className={styles.cards}>
      {cards.map((card) => (
        <li key={card.href}>
          <Link href={card.href} className={styles.card}>
            <Heading className={styles.name}>{getLocaleLabel(locale, card.nameKey)}</Heading>
            <p className={styles.count}>{card.count}</p>
          </Link>
        </li>
      ))}
    </ul>
  )
}
