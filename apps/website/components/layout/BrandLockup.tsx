import HexMark from './HexMark'
import { DEFAULT_LOCALE, getLocaleConfig } from '@/lib/i18n/config'
import styles from './brand-lockup.module.scss'

interface BrandLockupProps {
  // 'horizontal' — mark left of the wordmark/tagline stack (header).
  // 'stacked'    — mark above the wordmark (hero).
  variant: 'horizontal' | 'stacked'
  // Show the tagline line (default true). The hero hides it (§2.1).
  showTagline?: boolean
  // Locale for the wordmark + tagline text (both are locale-specific data in
  // locales.json). Defaults to DEFAULT_LOCALE for locale-agnostic call sites.
  locale?: string
  className?: string
}

// The youproof.org brand lockup, reconstructed purely from the `HexMark` SVG +
// CSS text (no raster assets). Recolors for light/dark via `currentColor` and
// resizes fluidly (sizes are `em`-relative to the container font-size). The
// wordmark + tagline come from the locale dictionary, never hardcoded.
export default function BrandLockup({
  variant,
  showTagline = true,
  locale = DEFAULT_LOCALE,
  className,
}: BrandLockupProps) {
  const cfg = getLocaleConfig(locale)
  return (
    <div className={`${styles.lockup} ${styles[variant]} ${className ?? ''}`}>
      <HexMark className={styles.mark} />
      <div className={styles.text}>
        <span className={styles.wordmark}>{cfg.siteName}</span>
        {showTagline && (
          <span className={styles.tagline}>{cfg.tagline}</span>
        )}
      </div>
    </div>
  )
}
