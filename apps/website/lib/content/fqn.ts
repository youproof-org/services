/**
 * Fully qualified names: the internal projection of the one grammar that addresses
 * everything in the content model.
 *
 *   path ::= container "." key ("." container "." key)*
 *
 * Containers are canonical English plurals; keys are `name` values. This is what a
 * cross-reference target is, and it is language-independent — the localized
 * projection with `slug` keys is the anchor (see urls.ts).
 *
 * Two properties are load-bearing and easy to lose by accident:
 *
 *   - **No namespace appears.** Knowledge-base entity names are unique per type, so
 *     a node's address survives a namespace reorganization. Nothing here may take a
 *     namespace as input.
 *   - **A part is a sibling branch, not a chapter's ancestor.** `books.{b}.parts.{p}`
 *     is a leaf; a chapter hangs off `books.{b}.chapters.{c}` directly. The grammar
 *     mirrors the ADDRESS tree, not the containment tree — chapter URLs already
 *     flatten parts out, and a chapter moving between parts must not move its
 *     address.
 *
 * `.` is the separator, so no name may contain one; `validateIdentifiers` enforces
 * that, and this module assumes it.
 */

/** What a fully qualified name can point at. The leaf container decides which. */
export type RefTargetKind =
  | 'book' | 'part' | 'chapter' | 'section'
  | 'article' | 'newsletter' | 'page' | 'landing'
  | 'definition' | 'theorem' | 'proof' | 'remark'
  | 'claim' | 'term'

/**
 * Container segment → the kind of thing it holds.
 *
 * NOT the same vocabulary as `ContainerKey` in lib/i18n/config.ts, and the
 * difference is deliberate: that one is about URL and anchor *segments*, so it has
 * no `pages` (a custom page sits at the locale root with no container segment) and
 * it has a `knowledge-base` outer segment that addresses nothing on its own. This
 * one is about *containment* in the content model.
 */
const CONTAINERS: Record<string, RefTargetKind> = {
  books: 'book',
  parts: 'part',
  chapters: 'chapter',
  sections: 'section',
  articles: 'article',
  newsletters: 'newsletter',
  pages: 'page',
  landings: 'landing',
  definitions: 'definition',
  theorems: 'theorem',
  proofs: 'proof',
  remarks: 'remark',
  claims: 'claim',
  terms: 'term',
}

/** Inverse of CONTAINERS, for building an FQN from nodes. */
const SEGMENT: Record<RefTargetKind, string> = Object.fromEntries(
  Object.entries(CONTAINERS).map(([segment, kind]) => [kind, segment]),
) as Record<RefTargetKind, string>

/** The container segment for a kind, e.g. 'proof' → 'proofs'. */
export function fqnSegment(kind: RefTargetKind): string {
  return SEGMENT[kind]
}

/** Append a step to an FQN. `parent` may be empty, for a root-level step. */
export function fqnJoin(parent: string, kind: RefTargetKind, name: string): string {
  const step = `${SEGMENT[kind]}.${name}`
  return parent ? `${parent}.${step}` : step
}

/**
 * Which parents each kind may hang off. This is the grammar, and it is what makes
 * a well-formed-but-illegal path an error rather than an unresolvable lookup:
 * `theorems.{t}.proofs.{p}.claims.{c}` parses fine and is still wrong, because a
 * proof is one argument rather than a set of numbered assertions.
 *
 * `null` means "only at the root".
 */
const LEGAL_PARENTS: Record<RefTargetKind, readonly (RefTargetKind | null)[]> = {
  book: [null],
  article: [null],
  newsletter: [null],
  page: [null],
  landing: [null],
  definition: [null],
  theorem: [null],
  part: ['book'],
  chapter: ['book'],
  section: ['chapter', 'article', 'newsletter', 'page', 'landing'],
  proof: ['theorem'],
  remark: ['definition', 'theorem', 'proof'],
  term: ['definition', 'theorem', 'proof', 'remark'],
  // No `proof` — see above.
  claim: ['definition', 'theorem', 'remark'],
}

/** One `container.key` step of a parsed path. */
export interface FqnStep {
  kind: RefTargetKind
  name: string
}

export interface ParsedFqn {
  /** The path as authored, e.g. "theorems.t.proofs.p". */
  fqn: string
  /** What the path points at, from its last container. */
  kind: RefTargetKind
  /** The leaf key — a `name`, never a slug. */
  name: string
  /** The path minus its last step; '' when the leaf is at the root. */
  parentFqn: string
  /** Kind of the parent, or null when the leaf is at the root. */
  parentKind: RefTargetKind | null
  /** Every step, root first. The leaf is the last element. */
  steps: readonly FqnStep[]
}

/**
 * A target is external when it carries a URI scheme.
 *
 * A scheme test, NOT a `://` test: `mailto:` targets have no slashes, and there are
 * four of them in the content. Names may not contain `:` (the character rule), and
 * the container segments are a fixed set, so no fully qualified name can match this
 * and no URL can be mistaken for one.
 */
export function isExternalTarget(target: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(target)
}

/**
 * Parse a fully qualified name, or throw with a message naming what was wrong.
 *
 * `where` describes the citation site and appears in every error, because a bad
 * target is authored in a YAML file and the file is what the author needs to open.
 */
export function parseFqn(fqn: string, where: string): ParsedFqn {
  if (!fqn) throw new Error(`${where}: empty reference target.`)
  if (isExternalTarget(fqn)) {
    throw new Error(`${where}: '${fqn}' is a URL, not a fully qualified name.`)
  }

  const parts = fqn.split('.')
  if (parts.length % 2 !== 0) {
    throw new Error(
      `${where}: '${fqn}' is not a valid reference target — a path is a series of ` +
        `'container.name' pairs, so it must have an even number of segments (got ${parts.length}).`,
    )
  }

  const steps: FqnStep[] = []
  for (let i = 0; i < parts.length; i += 2) {
    const segment = parts[i]
    const name = parts[i + 1]
    const kind = CONTAINERS[segment]
    if (!kind) {
      throw new Error(
        `${where}: '${fqn}' names an unknown container '${segment}'. ` +
          `Known: ${Object.keys(CONTAINERS).sort().join(', ')}.`,
      )
    }
    if (!name) throw new Error(`${where}: '${fqn}' has an empty name after '${segment}'.`)
    steps.push({ kind, name })
  }

  // Grammar check, step by step, so the message names the offending pair rather
  // than just rejecting the whole path.
  for (let i = 0; i < steps.length; i++) {
    const { kind } = steps[i]
    const parentKind = i === 0 ? null : steps[i - 1].kind
    if (!LEGAL_PARENTS[kind].includes(parentKind)) {
      const where2 = parentKind ? `inside a '${parentKind}'` : 'at the root'
      const legal = LEGAL_PARENTS[kind]
        .map((p) => (p === null ? 'the root' : `a '${p}'`))
        .join(' or ')
      throw new Error(
        `${where}: '${fqn}' puts a '${kind}' ${where2}, which the content model does ` +
          `not allow — a '${kind}' belongs at ${legal}.`,
      )
    }
  }

  const leaf = steps[steps.length - 1]
  return {
    fqn,
    kind: leaf.kind,
    name: leaf.name,
    parentFqn: parts.slice(0, -2).join('.'),
    parentKind: steps.length > 1 ? steps[steps.length - 2].kind : null,
    steps,
  }
}
