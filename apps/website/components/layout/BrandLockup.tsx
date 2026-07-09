import HexMark from './HexMark'
import styles from './brand-lockup.module.scss'

interface BrandLockupProps {
  // 'horizontal' — mark left of the wordmark/tagline stack (header).
  // 'stacked'    — mark above the wordmark (hero).
  variant: 'horizontal' | 'stacked'
  // Show the "DEEP MATH. HUMAN ACCESS." tagline line (default true).
  // The hero hides it (the motto lives in the header) — see §2.1.
  showTagline?: boolean
  className?: string
}

// The youproof.org brand lockup, reconstructed purely from the `HexMark` SVG +
// CSS text (no raster assets). Recolors for light/dark via `currentColor` and
// resizes fluidly (sizes are `em`-relative to the container font-size).
export default function BrandLockup({
  variant,
  showTagline = true,
  className,
}: BrandLockupProps) {
  return (
    <div className={`${styles.lockup} ${styles[variant]} ${className ?? ''}`}>
      <HexMark className={styles.mark} />
      <div className={styles.text}>
        <span className={styles.wordmark}>youproof.org</span>
        {showTagline && (
          <span className={styles.tagline}>Deep math. Human access.</span>
        )}
      </div>
    </div>
  )
}
