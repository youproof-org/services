// Where the mid-content newsletter forms go. Articles and newsletters get one form,
// before the section nearest the middle, decided on the server (`midContentIndex`,
// read by StandalonePage). Chapters get one every few sections, decided on the
// client (`chapterSlotTakesForm`, read by ChapterPager), because a paginated
// chapter's right places depend on which page the reader arrived on.

export const MID_CONTENT_MIN_SECTIONS = 6

/**
 * Index of the section to render the mid-content form *before*, or -1 when the
 * piece is too short to warrant one.
 */
export function midContentIndex(sectionCount: number): number {
  if (sectionCount < MID_CONTENT_MIN_SECTIONS) return -1
  return Math.floor(sectionCount / 2)
}

/**
 * The sections between two forms in a chapter, and the fewest a form may have
 * before or after it.
 */
export const CHAPTER_FORM_SPACING = 3

export interface ChapterSlot {
  /** Sections in the whole chapter, every page counted. */
  sectionCount: number
  /**
   * The chapter-global index of the first section on the page the reader arrived
   * on. Fixed for the visit, so a form never moves once placed.
   */
  arrival: number
  /** The chapter-global index of the section the slot precedes. */
  slot: number
  /** Whether section `slot - 1` is in the document yet. */
  sectionBeforeLoaded: boolean
}

/**
 * Whether a chapter's newsletter slot gets a form: on the lattice counted from
 * the arrival section, with at least `CHAPTER_FORM_SPACING` sections before and
 * after it, and with the section above it already loaded.
 *
 * The last condition only holds back the slot above the first section of the
 * earliest page in the document, whose previous section is on a page not loaded
 * yet. On arrival that is `slot === arrival`, so no form sits right under the
 * chapter header. The slot is filled once the page above it is prepended.
 */
export function chapterSlotTakesForm({ sectionCount, arrival, slot, sectionBeforeLoaded }: ChapterSlot): boolean {
  return (
    (slot - arrival) % CHAPTER_FORM_SPACING === 0 &&
    slot >= CHAPTER_FORM_SPACING &&
    sectionCount - slot >= CHAPTER_FORM_SPACING &&
    sectionBeforeLoaded
  )
}
