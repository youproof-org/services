import styles from './hex-mark.module.scss'

// Circumradius (center → vertex) and half-height of a flat-top regular hexagon.
const R = 26
const H = (R * Math.sqrt(3)) / 2 // ≈ 22.5

// Cluster: two hexagons stacked on the left (A top, C bottom) + one on the
// right (B) vertically centered between them — matches the youproof.org mark.
const A = { cx: 30, cy: 27 }
const C = { cx: 30, cy: 84 }

// B is the diagonal honeycomb neighbour of A and C, pushed outward so its gap to
// each equals the vertical edge-gap between A and C. Touching flat-top neighbours
// sit at offset (1.5R, ±H) (center distance 2H); scaling that offset to the
// actual A↔C center distance reproduces the same gap in the diagonal direction.
const AC_CENTER_DIST = C.cy - A.cy
const SCALE = AC_CENTER_DIST / (2 * H)
const B = { cx: A.cx + 1.5 * R * SCALE, cy: (A.cy + C.cy) / 2 }
const CENTERS = [A, B, C]

// Flat-top hexagon: points at left/right, flat top/bottom edges.
function hexPoints({ cx, cy }: { cx: number; cy: number }): string {
  return [
    [cx + R, cy],
    [cx + R / 2, cy + H],
    [cx - R / 2, cy + H],
    [cx - R, cy],
    [cx - R / 2, cy - H],
    [cx + R / 2, cy - H],
  ]
    .map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`)
    .join(' ')
}

interface HexMarkProps {
  // 'outline' (default): fill:none, stroke:currentColor — themes with text color.
  // 'filled': hexagons filled white (kept stroke) for visibility on dark tabs.
  variant?: 'outline' | 'filled'
  strokeWidth?: number
  className?: string
  title?: string
}

export default function HexMark({
  variant = 'outline',
  strokeWidth = 2.6,
  className,
  title,
}: HexMarkProps) {
  const filled = variant === 'filled'
  return (
    <svg
      viewBox="0 0 110 111"
      className={`${styles.mark} ${className ?? ''}`}
      role={title ? 'img' : 'presentation'}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {title && <title>{title}</title>}
      {CENTERS.map((c, i) => (
        <polygon
          key={i}
          points={hexPoints(c)}
          fill={filled ? '#fff' : 'none'}
          stroke="currentColor"
          strokeWidth={strokeWidth}
          strokeLinejoin="round"
        />
      ))}
    </svg>
  )
}
