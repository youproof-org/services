import { isExternalTarget, parseFqn, type RefTargetKind } from './fqn'

export interface ExternalRefTarget {
  type: 'external'
  url: string
}

/**
 * An internal cross-reference target: a parsed fully qualified name (see fqn.ts).
 *
 * One shape for all fourteen kinds, replacing the eight hand-written interfaces
 * this used to be. Those carried the parentage each kind happened to need —
 * `namespace` on an entity, `book` + `part` on a chapter, a nested `parent` object
 * on a claim — which meant the shape of a target depended on what it pointed at,
 * and adding a kind meant adding an interface. The path already encodes parentage,
 * so it is read off the path instead.
 *
 * `type` keeps its name so the many `target.type === 'book'` checks still read the
 * same, and there is no `type` field in the YAML any more: the leading container
 * decides the root type and the last one decides the leaf's, so a declared type
 * could only ever duplicate or contradict the path.
 */
export interface PathRefTarget {
  type: RefTargetKind
  /** Leaf key — a `name`, never a slug. */
  name: string
  /** The path as authored, e.g. "theorems.t.proofs.p". Also the graph's map key. */
  fqn: string
  /** The path minus its last step; '' when the leaf sits at the root. */
  parentFqn: string
  /** Kind of the parent, or null at the root. Lets a consumer branch without re-parsing. */
  parentKind: RefTargetKind | null
}

export type RefTarget = ExternalRefTarget | PathRefTarget

/** True for every target except an external URL — i.e. everything with an `fqn`. */
export function isPathTarget(target: RefTarget): target is PathRefTarget {
  return target.type !== 'external'
}

/** The fully qualified name of a target, or the URL of an external one. */
export function refTargetKey(target: RefTarget): string {
  return target.type === 'external' ? target.url : target.fqn
}

/**
 * Read an authored `target`: a URL or a fully qualified name. Throws with a message
 * naming `where` when it is neither.
 */
export function parseRefTarget(raw: unknown, where: string): RefTarget {
  if (typeof raw !== 'string') {
    throw new Error(
      `${where}: 'target' must be a string — either a fully qualified name ` +
        `(e.g. definitions.gyuru.terms.integer-number) or a URL.`,
    )
  }
  const target = raw.trim()
  if (isExternalTarget(target)) return { type: 'external', url: target }
  const parsed = parseFqn(target, where)
  return {
    type: parsed.kind,
    name: parsed.name,
    fqn: parsed.fqn,
    parentFqn: parsed.parentFqn,
    parentKind: parsed.parentKind,
  }
}
