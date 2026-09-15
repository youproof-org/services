// Whether a content item renders a stub page instead of its content, and which
// one — the single definition shared by the routes that render the stub and by
// `generateMetadata`, which has to put the matching robots directive on it.
// Two definitions of "this page is a stub" is how a page ends up rendering the
// not-migrated stub while its head says the content is indexable.
//
// Unpublished content stubs out only on the deployed environments (SITE_ENV is
// set by the deploy workflow). Locally it renders normally so authors can
// preview drafts.
const isDeployedEnv =
  process.env.SITE_ENV === 'staging' || process.env.SITE_ENV === 'production'

// The two stub pages, named by the `data-stub` value their components carry.
export type StubKind = 'not-migrated' | 'unavailable'

/**
 * The stub this item renders on this environment, or `null` when it renders its
 * real content. Structurally satisfied by both `ChapterNode` and
 * `StandaloneNode`, which are the two kinds of item that have a stub.
 */
export function stubKindFor(node: { published: boolean; legacyPath?: string }): StubKind | null {
  if (node.published || !isDeployedEnv) return null
  return node.legacyPath ? 'not-migrated' : 'unavailable'
}
