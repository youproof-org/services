'use client'

import Link from 'next/link'
import { buildLocalizedUrl } from '@/lib/i18n/url'
import type { PolicyPage } from '@/lib/consent/pages'

/**
 * Links to the pages that describe what is being consented to. Shared by the
 * banner and the reopen dialog, because the UI copy is deliberately
 * purpose-neutral (see lib/consent/copy.ts) — these links are where a visitor
 * finds out which cookies are actually involved, so both surfaces need them.
 *
 * The page list is generated from the content repo, so adding
 * `cookie-policy-version` to another page adds a link here with no code change.
 */

interface PolicyLinksProps {
  intro: string
  locale: string
  pages: readonly PolicyPage[]
  /** Class for the <a>s, so each surface keeps its own link styling. */
  linkClassName: string
  className?: string
}

export default function PolicyLinks({
  intro,
  locale,
  pages,
  linkClassName,
  className,
}: PolicyLinksProps) {
  if (pages.length === 0) return null
  return (
    <span className={className}>
      {intro}{' '}
      {pages.map((page, i) => (
        <span key={`${page.locale}/${page.slug}`}>
          {i > 0 && ' · '}
          <Link className={linkClassName} href={buildLocalizedUrl(locale, 'page', page.slug)}>
            {page.title}
          </Link>
        </span>
      ))}
    </span>
  )
}
