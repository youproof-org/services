import KbSectionCards from './KbSectionCards'
import { getLocaleLabel } from '@/lib/i18n/config'
import styles from './kb-root-page.module.scss'

/**
 * Knowledge-base root page body: the orienting paragraph and the three section
 * cards, with no listing of individual nodes — that is the index pages' job (§3).
 *
 * **A card is a name and a number.** §3 also gave each card a one-line description
 * and Fogalmak a second count under its first, and the ruling is that neither earns
 * its space: the three descriptions restate what "Definíciók", "Tételek" and
 * "Fogalmak" already say to a reader who has just read `kbIntro` above them, and
 * three sentences of it push the numbers — the part of the card that is actually
 * news — down the page. The count stays, quieter than it was, because a card that
 * leads with a number reads as a statistic rather than as a way in.
 *
 * The cards, and the counts on them, come from `kb-sections.ts`, because the
 * homepage offers the same three ways in (parent plan §J.2).
 */
export default function KbRootPage({ locale }: { locale: string }) {
  return (
    <>
      <h1 className={styles.title}>{getLocaleLabel(locale, 'knowledgeBase')}</h1>
      <p className={styles.intro}>{getLocaleLabel(locale, 'kbIntro')}</p>
      <KbSectionCards locale={locale} />
    </>
  )
}
