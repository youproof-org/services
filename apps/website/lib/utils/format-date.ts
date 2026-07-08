// ISO datetime → "YYYY. MM. DD." (Hungarian style, deterministic — no locale
// dependency so static export and runtime agree).
export function huDate(iso?: string): string {
  if (!iso) return ''
  const parts = iso.slice(0, 10).split('-')
  return parts.length === 3 ? `${parts[0]}. ${parts[1]}. ${parts[2]}.` : ''
}
