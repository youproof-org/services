// Shared raw-graph fixture for the content-model tests.
//
// Everything is driven through `buildGraphFromRaw` with a hand-built raw graph, so
// the tests assert real graph invariants rather than facts about a fixture on disk.
// Lives here rather than in one test file because both the knowledge-base tests and
// the identifier-rule tests need the same starting point.
import { RAW_GRAPH_VERSION } from '../../lib/content/graph.ts'

export const NS = '/proba'
export const hu = { locale: 'hu', namespace: NS }

export const narrative = (content) => ({ type: 'narrative', content })
export const claim = (name, slug, content = 'Állítás.') => ({ type: 'claim', name, slug, content })
export const embed = (type, name) => ({ type: 'embed', target: { type, name, namespace: NS } })

/**
 * A raw graph with one chapter/section embedding a definition, a theorem, its
 * proof, and a remark on the definition. `published` controls whether the chapter
 * is published, which is what gates page existence on a deployed build.
 */
export function raw({ published = true, references = {}, extraDefinitions = [], terms } = {}) {
  return {
    version: RAW_GRAPH_VERSION,
    episodeOrder: ['konyv'],
    definitions: [
      {
        ...hu,
        name: 'def-egy',
        slug: 'def-egy',
        title: 'Első definíció',
        terms: terms ?? {
          'first-term': { slug: 'elso-fogalom', display: '[első]', canonical: 'első fogalom' },
        },
        body: [narrative('Törzs [[first-term]].'), claim('def-claim', 'def-allitas')],
        references,
        remarkSlugs: ['rem-egy'],
      },
      ...extraDefinitions,
    ],
    theorems: [
      {
        ...hu,
        name: 'tetel-egy',
        slug: 'tetel-egy',
        title: 'Első tétel',
        body: [narrative('Tétel.')],
        references: {},
        proofSlugs: ['biz-egy'],
        remarkSlugs: [],
      },
    ],
    proofs: [
      {
        ...hu,
        name: 'biz-egy',
        slug: 'biz-egy',
        body: [narrative('Bizonyítás.')],
        references: {},
        remarkSlugs: [],
      },
    ],
    remarks: [
      { ...hu, name: 'rem-egy', slug: 'rem-egy', body: [narrative('Megjegyzés.')], references: {} },
    ],
    books: [
      {
        name: 'konyv',
        slug: 'konyv',
        locale: 'hu',
        title: 'Könyv',
        abstract: [],
        parts: [
          {
            name: 'resz',
            slug: 'resz',
            locale: 'hu',
            title: 'Rész',
            chapters: [
              {
                name: 'fejezet',
                slug: 'fejezet',
                locale: 'hu',
                title: 'Fejezet',
                publishedAt: published ? '2020-01-01 00:00:00' : undefined,
                abstract: [],
                prologue: [],
                epilogue: [],
                references: {},
                sections: [
                  {
                    name: 'szakasz',
                    slug: 'szakasz',
                    locale: 'hu',
                    title: 'Szakasz',
                    references: {},
                    body: [
                      embed('definition', 'def-egy'),
                      embed('theorem', 'tetel-egy'),
                      embed('proof', 'biz-egy'),
                      embed('remark', 'rem-egy'),
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
    standalones: [],
  }
}

export { RAW_GRAPH_VERSION }
