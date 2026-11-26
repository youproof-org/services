import type { RefTargetKind } from '@youproof.org/content-model'

export interface ContextObject extends Record<string, ContextValue> {}
export type ContextValue = string | ContextObject
export type TemplateContext = Record<string, ContextObject>

/** Every target kind a display template can render: all but a part, which nothing displays. */
export type DisplayTemplateTargetType = Exclude<RefTargetKind, 'part'>

const TARGET_TYPES = {
  book: true,
  article: true,
  newsletter: true,
  page: true,
  landing: true,
  chapter: true,
  section: true,
  definition: true,
  theorem: true,
  proof: true,
  remark: true,
  claim: true,
  term: true,
} as const satisfies Record<DisplayTemplateTargetType, true>

export const TEMPLATE_TARGET_TYPES = Object.keys(TARGET_TYPES) as readonly DisplayTemplateTargetType[]

export type DisplayTemplateGroupBy = 'label' | 'parent' | 'type'

export interface DisplayTemplateSeparators {
  separator: string
  /** Defaults to `separator`. */
  lastSeparator: string
}

/** The positional forms of a list item. `middle` defaults to `first`, `last` to `middle`. */
export interface DisplayTemplateItemForms extends DisplayTemplateSeparators {
  first: string
  middle: string
  last: string
  only?: string
}

export interface DisplayTemplateList {
  /** An exact count is stored as `min === max`; no `max` means no upper bound. */
  count: { min: number; max?: number }
  groupBy?: DisplayTemplateGroupBy
  order: 'sorted' | 'authored'
  item: DisplayTemplateItemForms
  /** Between groups; present exactly when `groupBy` is. */
  group?: DisplayTemplateSeparators
  before: string
  after: string
}

interface DisplayTemplateBase {
  name: string
  targets: DisplayTemplateTargetType[]
}

export interface SingleDisplayTemplate extends DisplayTemplateBase {
  kind: 'single'
  template: string
}

export interface ListDisplayTemplate extends DisplayTemplateBase {
  kind: 'list'
  list: DisplayTemplateList
}

export type DisplayTemplate = SingleDisplayTemplate | ListDisplayTemplate

/** One locale's templates, keyed by name. */
export type DisplayTemplateCollection = Record<string, DisplayTemplate>

/** Locale -> the case keys its labels inflect for. */
export type LocaleCases = Readonly<Record<string, readonly string[]>>

export interface TextSegment {
  kind: 'text'
  text: string
}

/** Link text, and the target it links to. */
export interface LinkSegment<T> {
  kind: 'link'
  text: string
  target: T
}

/** A resolved display: plain text and link text, in reading order. */
export type DisplaySegment<T> = TextSegment | LinkSegment<T>
