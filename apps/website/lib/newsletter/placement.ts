// Heuristic for the second, mid-content newsletter form on long chapters and
// articles: only when the piece has enough sections to be "long", inserted
// before the section nearest the middle so it's noticeable without disrupting
// the reading flow. Shared by ChapterPage and StandalonePage.

export const MID_CONTENT_MIN_SECTIONS = 6

/**
 * Index of the section to render the mid-content form *before*, or -1 when the
 * piece is too short to warrant one.
 */
export function midContentIndex(sectionCount: number): number {
  if (sectionCount < MID_CONTENT_MIN_SECTIONS) return -1
  return Math.floor(sectionCount / 2)
}
