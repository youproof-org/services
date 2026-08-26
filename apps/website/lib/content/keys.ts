/**
 * The graph's map keys, which are fully qualified names.
 *
 * A key used to be a filesystem-shaped path — `/entities/{namespace}/{name}`,
 * `/books/{book}/{part}/{chapter}` — which meant two things had to be true that no
 * longer are: a knowledge-base key carried the namespace a node's address is
 * deliberately independent of, and a chapter key carried the part that chapter URLs
 * flatten out. Both made a key change when content was reorganized without the
 * node's address changing at all.
 *
 * Now a key IS the reference target: a cross-reference resolves with
 * `graph.theorems.get(target.fqn)` and no key construction at any call site.
 *
 * These live apart from graph.ts because display-template.ts needs them too, and
 * graph.ts imports display-template — so a shared module is the only place both can
 * reach without a cycle.
 */
import { fqnJoin } from './fqn'
import type {
  BookNode,
  ChapterNode,
  PartNode,
  SectionNode,
  StandaloneNode,
  KbNode,
} from './types'

export const bookKey = (bookName: string): string => fqnJoin('', 'book', bookName)

export const partKey = (bookName: string, partName: string): string =>
  fqnJoin(bookKey(bookName), 'part', partName)

/** No part segment: a chapter's address is `{book}.chapters.{chapter}` (see fqn.ts). */
export const chapterKey = (bookName: string, chapterName: string): string =>
  fqnJoin(bookKey(bookName), 'chapter', chapterName)

export const sectionKey = (
  bookName: string,
  chapterName: string,
  sectionName: string,
): string => fqnJoin(chapterKey(bookName, chapterName), 'section', sectionName)

export const standaloneKey = (kind: StandaloneNode['kind'], name: string): string =>
  fqnJoin('', kind, name)

export const standaloneSectionKey = (
  kind: StandaloneNode['kind'],
  itemName: string,
  sectionName: string,
): string => fqnJoin(standaloneKey(kind, itemName), 'section', sectionName)

export const definitionKey = (name: string): string => fqnJoin('', 'definition', name)
export const theoremKey = (name: string): string => fqnJoin('', 'theorem', name)

/** A proof nests under its theorem, so its key needs the theorem's name. */
export const proofKey = (theoremName: string, proofName: string): string =>
  fqnJoin(theoremKey(theoremName), 'proof', proofName)

/** A remark nests under whatever owns it, so its key needs the owner's key. */
export const remarkKey = (ownerKey: string, remarkName: string): string =>
  fqnJoin(ownerKey, 'remark', remarkName)

// ---------------------------------------------------------------------------
// Node → key
// ---------------------------------------------------------------------------

export const keyForBook = (book: BookNode): string => bookKey(book.name)
export const keyForPart = (part: PartNode): string => partKey(part.book.name, part.name)
export const keyForChapter = (chapter: ChapterNode): string =>
  chapterKey(chapter.part.book.name, chapter.name)
export const keyForSection = (section: SectionNode): string =>
  sectionKey(section.chapter.part.book.name, section.chapter.name, section.name)
export const keyForStandalone = (node: StandaloneNode): string =>
  standaloneKey(node.kind, node.name)

/**
 * A knowledge-base node's key, walking the ownership chain.
 *
 * An owner-less remark keys at the root. The model permits one and no content has
 * one; keying it at the root rather than throwing keeps it addressable-by-name
 * instead of unreachable, which is the same choice `kbAnchorPath` makes.
 */
export function keyForKbNode(node: KbNode): string {
  switch (node.type) {
    case 'definition': return definitionKey(node.name)
    case 'theorem':    return theoremKey(node.name)
    case 'proof':      return proofKey(node.proves.name, node.name)
    case 'remark':     return node.attachedTo
      ? remarkKey(keyForKbNode(node.attachedTo), node.name)
      : fqnJoin('', 'remark', node.name)
  }
}
