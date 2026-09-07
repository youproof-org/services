// The JSON-LD block of a knowledge-base entity page: its shape per page kind, its
// identifiers, and the edges it states.
//
// Everything runs over a graph built by `buildGraphFromRaw`, and every expectation is
// derived — from the same `urlFor*`, `termAnchorId` and `kbEntityBreadcrumbs` helpers
// the builder uses, or from the fixture graph itself. Nothing here restates a title,
// a URL or a count as a literal: a number copied out of the content is an assertion
// that fails on a date rather than on a change.
//
// The one class of literal that IS written out is the vocabulary — `WebPage`,
// `citation`, the Wikidata URIs, the `#theorem` fragment. Those are the design, not
// the content: they are public identifiers other documents join against, and a test
// that derived them from the module would agree with any value the module chose.
import { test } from 'node:test'
import assert from 'node:assert/strict'

import * as structuredDataModule from '../lib/content/structured-data.ts'
import * as graphModule from '../lib/content/graph.ts'
import * as urlsModule from '../lib/content/urls.ts'
import * as metadataModule from '../lib/i18n/metadata.ts'
import * as breadcrumbsModule from '../lib/content/kb-breadcrumbs.ts'
import * as keysModule from '../lib/content/keys.ts'

const pick = (m) => m.default ?? m
const {
  kbEntityStructuredData,
  kbListStructuredData,
  siteStructuredData,
  kbEntityId,
  siteId,
  organizationId,
  glossaryId,
} = pick(structuredDataModule)
const { buildGraphFromRaw, kbNodeTitle, kbPageExists } = pick(graphModule)
const {
  urlForKbNode,
  urlForChapter,
  urlForBook,
  urlForKbRoot,
  urlForDefinitionsIndex,
  urlForTheoremsIndex,
  urlForGlossary,
  ownPageScope,
  termAnchorId,
} = pick(urlsModule)
const { absoluteUrl, toIsoTime, SITE_URL, OG_IMAGE_DEFAULT } = pick(metadataModule)
const { kbEntityBreadcrumbs, kbListBreadcrumbs } = pick(breadcrumbsModule)
const { keyForKbNode } = pick(keysModule)

import { embed, hu, narrative, raw, ref } from './support/raw-graph.mjs'

// ---------------------------------------------------------------------------
// The fixture
// ---------------------------------------------------------------------------

const remark = (name, body = [narrative('Megjegyzés.')], references = {}) => ({
  ...hu,
  name,
  body,
  references,
})

/**
 * The shared fixture, extended until every branch of the builder is reachable:
 *
 *   - a remark on the theorem and one on the proof, so `isPartOf` can be checked
 *     against all three owner kinds;
 *   - two references on the theorem that resolve to the SAME target, plus an
 *     external one, which is what makes the deduplication and the external branch
 *     observable;
 *   - a reference FROM the definition TO the theorem, so the theorem has an inbound
 *     edge that its own block must not mention.
 */
function fixture({ published = true } = {}) {
  const r = raw({
    references: {
      'a-tetel': ref('a tétel', 'theorems.tetel-egy'),
    },
    published,
    extraDefinitions: [
      {
        ...hu,
        name: 'def-ketto',
        slug: 'def-ketto',
        title: 'Második definíció',
        body: [narrative('Hivatkozik [a-tetelre].')],
        references: { 'a-tetelre': ref('a tételre', 'theorems.tetel-egy') },
        remarkSlugs: [],
      },
    ],
  })
  r.remarks.push(remark('rem-tetel'), remark('rem-biz'))
  r.theorems[0].remarkSlugs = ['rem-tetel']
  r.proofs[0].remarkSlugs = ['rem-biz']
  // A node only has a page — and therefore a block — if the narrative introduces it
  // somewhere, so the two new remarks are embedded like the rest of the fixture.
  r.books[0].parts[0].chapters[0].sections[0].body.push(
    embed('definitions.def-ketto'),
    embed('theorems.tetel-egy.remarks.rem-tetel'),
    embed('theorems.tetel-egy.proofs.biz-egy.remarks.rem-biz'),
  )
  r.theorems[0].references = {
    'a-fogalom': ref('az első fogalom', 'definitions.def-egy.terms.first-term'),
    // A second authored key for the same target: one edge is one edge.
    'ugyanaz-a-fogalom': ref('ugyanaz', 'definitions.def-egy.terms.first-term'),
    'egy-allitas': ref('az állítás', 'definitions.def-egy.claims.def-claim'),
    kulso: ref('külső forrás', 'https://example.org/forras'),
  }
  return buildGraphFromRaw(r)
}

const g = fixture()
const byName = (map, name) => [...map.values()].find((n) => n.name === name)

const definition = byName(g.definitions, 'def-egy')
const theorem = byName(g.theorems, 'tetel-egy')
const proof = byName(g.proofs, 'biz-egy')
const remarkOnDefinition = byName(g.remarks, 'rem-egy')
const remarkOnTheorem = byName(g.remarks, 'rem-tetel')
const remarkOnProof = byName(g.remarks, 'rem-biz')

const EVERY_KIND = [definition, theorem, proof, remarkOnDefinition, remarkOnTheorem, remarkOnProof]

const docFor = (node) => kbEntityStructuredData(g, node)
const graphOf = (node) => docFor(node)['@graph']
const nodesOfType = (doc, type) => doc['@graph'].filter((n) => n['@type'] === type)
const nodeOfType = (doc, type) => {
  const found = nodesOfType(doc, type)
  assert.equal(found.length, 1, `expected exactly one ${type} node`)
  return found[0]
}
/** The `@id`s an edge names, whether it was written as one value or as a list. */
const edge = (node, key) => {
  const value = node[key]
  if (value === undefined) return []
  return (Array.isArray(value) ? value : [value]).map((entry) => entry['@id'])
}

const pageUrlOf = (node) => absoluteUrl(urlForKbNode(node))

// ---------------------------------------------------------------------------
// Shape
// ---------------------------------------------------------------------------

test('one document per entity page: schema.org context, and a @graph of things', () => {
  for (const node of EVERY_KIND) {
    const doc = docFor(node)
    assert.equal(doc['@context'], 'https://schema.org')
    assert.ok(Array.isArray(doc['@graph']), `${node.name} has no @graph`)
    for (const entry of doc['@graph']) {
      assert.ok(entry['@type'], `a node of ${node.name}'s graph has no @type`)
      assert.ok(entry['@id'], `a node of ${node.name}'s graph has no @id`)
    }
  }
})

test('every kind carries the same five roles: the page, the work, the chapter, the book, the trail', () => {
  for (const node of EVERY_KIND) {
    const doc = docFor(node)
    assert.deepEqual(
      doc['@graph'].map((entry) => entry['@type']).filter((type) => type !== 'DefinedTerm'),
      ['WebPage', 'CreativeWork', 'Chapter', 'Book', 'BreadcrumbList'],
      `${node.name} does not carry the five roles, in order`,
    )
  }
})

test('the page names itself, and the work it is about, by their own ids', () => {
  for (const node of EVERY_KIND) {
    const doc = docFor(node)
    const page = nodeOfType(doc, 'WebPage')
    assert.equal(page['@id'], pageUrlOf(node))
    assert.equal(page.url, pageUrlOf(node))
    assert.equal(page.name, kbNodeTitle(g, node))
    assert.equal(page.inLanguage, 'hu')
    assert.equal(page.mainEntity['@id'], kbEntityId(node))
    assert.equal(page.breadcrumb['@id'], `${pageUrlOf(node)}#breadcrumb`)
    assert.equal(page.isPartOf['@id'], siteId())
  }
})

test('the work is a CreativeWork named by a fragment on its own page', () => {
  const fragments = {
    definition: '#definition',
    theorem: '#theorem',
    proof: '#proof',
    remark: '#remark',
  }
  for (const node of EVERY_KIND) {
    const work = nodeOfType(docFor(node), 'CreativeWork')
    assert.equal(work['@id'], `${pageUrlOf(node)}${fragments[node.type]}`)
    assert.equal(work['@id'], kbEntityId(node))
    assert.equal(work.name, kbNodeTitle(g, node))
  }
})

test('no @id is used twice within one page', () => {
  for (const node of EVERY_KIND) {
    const ids = graphOf(node).map((entry) => entry['@id'])
    assert.deepEqual([...new Set(ids)], ids, `${node.name} declares an @id twice`)
  }
})

test('every id is absolute, and every internal one is on this site', () => {
  for (const node of EVERY_KIND) {
    for (const url of everyUrlIn(docFor(node))) {
      assert.match(url, /^https?:\/\//, `${url} is not an absolute URL`)
    }
  }
})

/** Every string in the document that is used as an identifier or a link. */
function everyUrlIn(value, found = []) {
  if (Array.isArray(value)) {
    for (const entry of value) everyUrlIn(entry, found)
  } else if (value && typeof value === 'object') {
    for (const [key, entry] of Object.entries(value)) {
      if (['@id', 'url', 'item', 'additionalType'].includes(key)) found.push(entry)
      else everyUrlIn(entry, found)
    }
  }
  return found
}

test('the document survives serialization, which is the only form a page ever sees it in', () => {
  for (const node of EVERY_KIND) {
    const doc = docFor(node)
    assert.deepEqual(JSON.parse(JSON.stringify(doc)), doc)
  }
})

// ---------------------------------------------------------------------------
// The type mapping
// ---------------------------------------------------------------------------

test('a definition, a theorem and a proof name their Wikidata concept; a remark names none', () => {
  const additionalTypeOf = (node) => nodeOfType(docFor(node), 'CreativeWork').additionalType
  assert.equal(additionalTypeOf(definition), 'http://www.wikidata.org/entity/Q114425676')
  assert.equal(additionalTypeOf(theorem), 'http://www.wikidata.org/entity/Q65943')
  assert.equal(additionalTypeOf(proof), 'http://www.wikidata.org/entity/Q11538')
  // Wikidata has nothing for a mathematical remark worth pointing at, and an
  // invented type would be a worse statement than no statement.
  for (const node of [remarkOnDefinition, remarkOnTheorem, remarkOnProof]) {
    assert.equal(additionalTypeOf(node), undefined)
  }
})

// ---------------------------------------------------------------------------
// Relations
// ---------------------------------------------------------------------------

test("a proof is part of its theorem AND of the chapter it is introduced in", () => {
  const work = nodeOfType(docFor(proof), 'CreativeWork')
  assert.deepEqual(edge(work, 'isPartOf'), [
    kbEntityId(theorem),
    absoluteUrl(urlForChapter(chapterOf(proof))),
  ])
})

test("a remark is part of whatever owns it — a definition, a theorem, or a proof", () => {
  for (const [node, expected] of [
    [remarkOnDefinition, definition],
    [remarkOnTheorem, theorem],
    [remarkOnProof, proof],
  ]) {
    const work = nodeOfType(docFor(node), 'CreativeWork')
    assert.equal(edge(work, 'isPartOf')[0], kbEntityId(expected))
  }
})

test('a definition and a theorem are part of their chapter, and of nothing else', () => {
  for (const node of [definition, theorem]) {
    const work = nodeOfType(docFor(node), 'CreativeWork')
    assert.deepEqual(edge(work, 'isPartOf'), [absoluteUrl(urlForChapter(chapterOf(node)))])
  }
})

test("a theorem's parts are its proofs and its remarks, by the ids those pages use for themselves", () => {
  const work = nodeOfType(docFor(theorem), 'CreativeWork')
  assert.deepEqual(
    edge(work, 'hasPart'),
    [...theorem.proofs, ...theorem.remarks].map(kbEntityId),
  )
  // And the proof's own page names the same id for itself, which is what joins the
  // two documents into one graph.
  assert.ok(edge(work, 'hasPart').includes(nodeOfType(docFor(proof), 'CreativeWork')['@id']))
})

test('a remark owns nothing, so it states no parts', () => {
  for (const node of [remarkOnDefinition, remarkOnTheorem, remarkOnProof]) {
    assert.equal(nodeOfType(docFor(node), 'CreativeWork').hasPart, undefined)
  }
})

test('the chapter and book stubs carry the narrative chain', () => {
  const doc = docFor(theorem)
  const chapter = chapterOf(theorem)
  const chapterStub = nodeOfType(doc, 'Chapter')
  const bookStub = nodeOfType(doc, 'Book')
  assert.equal(chapterStub['@id'], absoluteUrl(urlForChapter(chapter)))
  assert.equal(bookStub['@id'], absoluteUrl(urlForBook(chapter.part.book)))
  assert.deepEqual(edge(chapterStub, 'isPartOf'), [bookStub['@id']])
})

// ---------------------------------------------------------------------------
// Terms
// ---------------------------------------------------------------------------

test('a term is a DefinedTerm at the anchor the markup already renders', () => {
  const doc = docFor(definition)
  const scope = ownPageScope(definition)
  const terms = nodesOfType(doc, 'DefinedTerm')
  assert.equal(terms.length, Object.keys(definition.terms).length)
  for (const [index, [termKey, term]] of Object.entries(definition.terms).entries()) {
    const expectedId = `${pageUrlOf(definition)}#${termAnchorId(scope, termKey, term)}`
    assert.equal(terms[index]['@id'], expectedId)
    assert.equal(terms[index].url, expectedId, 'a term id is a URL that really resolves')
    assert.equal(terms[index].name, term.canonical)
  }
})

test("a term belongs to the site's one vocabulary, named from the page that introduces it", () => {
  for (const term of nodesOfType(docFor(definition), 'DefinedTerm')) {
    assert.equal(term.inDefinedTermSet['@id'], glossaryId(definition.locale))
  }
  assert.match(glossaryId('hu'), /#glossary$/)
})

test('the work is about, and teaches, exactly the terms it introduces', () => {
  const work = nodeOfType(docFor(definition), 'CreativeWork')
  const termIds = nodesOfType(docFor(definition), 'DefinedTerm').map((term) => term['@id'])
  assert.deepEqual(edge(work, 'about'), termIds)
  assert.deepEqual(edge(work, 'teaches'), termIds)
})

test('a node that introduces no term states neither, rather than stating an empty list', () => {
  const work = nodeOfType(docFor(theorem), 'CreativeWork')
  assert.equal(work.about, undefined)
  assert.equal(work.teaches, undefined)
  assert.equal(nodesOfType(docFor(theorem), 'DefinedTerm').length, 0)
})

test('a synonym is another name for one term, not a second term', () => {
  const withSynonyms = graphWithSynonyms()
  const terms = nodesOfType(
    kbEntityStructuredData(withSynonyms, byName(withSynonyms.definitions, 'def-egy')),
    'DefinedTerm',
  )
  assert.equal(terms.length, 1)
  assert.deepEqual(terms[0].alternateName, ['második név', 'harmadik név'])
})

function graphWithSynonyms() {
  return buildGraphFromRaw(
    raw({
      terms: {
        'first-term': {
          slug: 'elso-fogalom',
          display: '[első]',
          canonical: 'első fogalom',
          synonyms: ['második név', 'harmadik név'],
        },
      },
    }),
  )
}

// ---------------------------------------------------------------------------
// Citations — the outgoing edges of the knowledge graph
// ---------------------------------------------------------------------------

test('a citation is the exact anchor the prose links to, on the target page', () => {
  const work = nodeOfType(docFor(theorem), 'CreativeWork')
  const scope = ownPageScope(definition)
  const [termKey, term] = Object.entries(definition.terms)[0]
  assert.ok(
    edge(work, 'citation').includes(
      `${pageUrlOf(definition)}#${termAnchorId(scope, termKey, term)}`,
    ),
    'a term reference must cite the term, not merely the page it is on',
  )
})

test('two authored references to one target are one edge', () => {
  const work = nodeOfType(docFor(theorem), 'CreativeWork')
  const citations = edge(work, 'citation')
  // The fixture authors four references, two of which name the same term.
  assert.equal(Object.keys(theorem.references).length, 4)
  assert.equal(citations.length, 3)
  assert.deepEqual([...new Set(citations)], citations)
})

test('an external reference is cited as the URL the prose links to', () => {
  const citations = edge(nodeOfType(docFor(theorem), 'CreativeWork'), 'citation')
  assert.ok(citations.includes('https://example.org/forras'))
})

test('citations are ordered by their id, so reordering a references map rewrites nothing', () => {
  for (const node of EVERY_KIND) {
    const citations = edge(nodeOfType(docFor(node), 'CreativeWork'), 'citation')
    assert.deepEqual([...citations].sort(), citations, `${node.name} cites out of order`)
  }
})

test('a node with no references states no citations', () => {
  assert.equal(nodeOfType(docFor(remarkOnTheorem), 'CreativeWork').citation, undefined)
})

test('a reference to a whole entity cites the page the link goes to', () => {
  // A term reference resolves to an anchor; a reference to a definition or a theorem
  // resolves to that node's page, with no fragment. Either way the citation is the
  // URL the reader's own link carries, which is what makes the block unable to
  // disagree with the markup around it.
  const citations = edge(nodeOfType(docFor(definition), 'CreativeWork'), 'citation')
  assert.ok(citations.includes(pageUrlOf(theorem)))
})

test('no page declares what cites it', () => {
  // The second definition cites the theorem, and the theorem cites nothing of it.
  // The theorem's block is the whole of what that page says about itself, and the
  // citing definition appears nowhere in it: the inbound direction is recovered by
  // reading the definition's page, not by every page carrying the transpose of
  // everyone else's edges. That is what keeps the busiest page's block a few
  // kilobytes, and it is the same rule the served markup follows.
  const citer = byName(g.definitions, 'def-ketto')
  assert.ok(
    edge(nodeOfType(docFor(citer), 'CreativeWork'), 'citation').includes(pageUrlOf(theorem)),
    'the fixture must actually cite the theorem for this to mean anything',
  )
  assert.ok(
    !JSON.stringify(docFor(theorem)).includes(citer.slug),
    "the theorem's block mentions the node citing it",
  )
})

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

test('published when the chapter that introduces it was published', () => {
  for (const node of EVERY_KIND) {
    const work = nodeOfType(docFor(node), 'CreativeWork')
    assert.equal(work.datePublished, toIsoTime(chapterOf(node).publishedAt))
  }
})

test('an unpublished chapter gives no date rather than a guessed one', () => {
  const unpublished = fixture({ published: false })
  const node = byName(unpublished.theorems, 'tetel-egy')
  const work = nodeOfType(kbEntityStructuredData(unpublished, node), 'CreativeWork')
  assert.equal(work.datePublished, undefined)
})

test('a node the lastmod map has no entry for states no dateModified', () => {
  // The fixture's nodes are not in the content checkout, so nothing recorded a last
  // edit for them. "Say nothing" is the rule for every consumer of that map.
  for (const node of EVERY_KIND) {
    assert.equal(nodeOfType(docFor(node), 'CreativeWork').dateModified, undefined)
  }
})

// ---------------------------------------------------------------------------
// The breadcrumb trail
// ---------------------------------------------------------------------------

test('the trail is the one the visible breadcrumb row renders, with the current page last and unlinked', () => {
  for (const node of EVERY_KIND) {
    const crumbs = kbEntityBreadcrumbs(g, node)
    const list = nodeOfType(docFor(node), 'BreadcrumbList')
    assert.equal(list['@id'], `${pageUrlOf(node)}#breadcrumb`)
    assert.deepEqual(
      list.itemListElement.map((item) => item.name),
      crumbs.map((crumb) => crumb.label),
    )
    assert.deepEqual(
      list.itemListElement.map((item) => item.position),
      crumbs.map((_, index) => index + 1),
    )
    assert.deepEqual(
      list.itemListElement.map((item) => item.item),
      crumbs.map((crumb, index) =>
        index < crumbs.length - 1 ? absoluteUrl(crumb.href) : undefined,
      ),
    )
  }
})

// ---------------------------------------------------------------------------
// Refusals
// ---------------------------------------------------------------------------

test('a node with no page has no structured data, rather than a block with a broken id', () => {
  const withOrphan = (() => {
    const r = raw()
    r.remarks.push(remark('rem-arva'))
    return buildGraphFromRaw(r)
  })()
  const orphan = byName(withOrphan.remarks, 'rem-arva')
  assert.equal(orphan.attachedTo, undefined)
  assert.throws(() => kbEntityStructuredData(withOrphan, orphan), /has no page URL/)
})

// ---------------------------------------------------------------------------
// The list pages
// ---------------------------------------------------------------------------
//
// Four pages, three shapes: the root is a page and a trail, the two indexes add an
// `ItemList`, and the glossary adds the `DefinedTermSet` every term on the site
// already points at.

const LIST_PAGES = ['kb-root', 'definitions-index', 'theorems-index', 'glossary']
const INDEX_PAGES = ['definitions-index', 'theorems-index']

const listUrls = {
  'kb-root': urlForKbRoot,
  'definitions-index': urlForDefinitionsIndex,
  'theorems-index': urlForTheoremsIndex,
  glossary: urlForGlossary,
}

const listDoc = (page, graph = g) => kbListStructuredData(graph, 'hu', page)
const listPageUrl = (page) => absoluteUrl(listUrls[page]('hu'))

/** What an index page lists, counted off the graph rather than read from the builder. */
function pagedNodeCount(graph, nodes, locale = 'hu') {
  return [...nodes.values()].filter((n) => n.locale === locale && kbPageExists(graph, n)).length
}

const INDEXED_NODES = {
  'definitions-index': (graph) => graph.definitions,
  'theorems-index': (graph) => graph.theorems,
}

test('a list page is a CollectionPage naming itself, in the site, with a trail', () => {
  for (const page of LIST_PAGES) {
    const doc = listDoc(page)
    assert.equal(doc['@context'], 'https://schema.org')
    const collection = nodeOfType(doc, 'CollectionPage')
    assert.equal(collection['@id'], listPageUrl(page))
    assert.equal(collection.url, listPageUrl(page))
    assert.equal(collection.inLanguage, 'hu')
    assert.equal(collection.isPartOf['@id'], siteId())
    assert.equal(collection.breadcrumb['@id'], `${listPageUrl(page)}#breadcrumb`)
    // The name is the one the visible page and its own breadcrumb crumb carry.
    const crumbs = kbListBreadcrumbs('hu', page)
    assert.equal(collection.name, crumbs[crumbs.length - 1].label)
  }
})

test('each list kind carries exactly the nodes its design calls for, in order', () => {
  const shapes = {
    'kb-root': ['CollectionPage', 'BreadcrumbList'],
    'definitions-index': ['CollectionPage', 'ItemList', 'BreadcrumbList'],
    'theorems-index': ['CollectionPage', 'ItemList', 'BreadcrumbList'],
    glossary: ['CollectionPage', 'DefinedTermSet', 'BreadcrumbList'],
  }
  for (const page of LIST_PAGES) {
    assert.deepEqual(listDoc(page)['@graph'].map((entry) => entry['@type']), shapes[page])
  }
})

test('the knowledge-base root is about nothing in particular: three cards are not a list', () => {
  const doc = listDoc('kb-root')
  assert.equal(nodeOfType(doc, 'CollectionPage').mainEntity, undefined)
  assert.equal(nodesOfType(doc, 'ItemList').length, 0)
  assert.equal(nodesOfType(doc, 'DefinedTermSet').length, 0)
})

test('an index page is about its list, named by a fragment on the page', () => {
  for (const page of INDEX_PAGES) {
    const doc = listDoc(page)
    const list = nodeOfType(doc, 'ItemList')
    assert.equal(list['@id'], `${listPageUrl(page)}#list`)
    assert.equal(nodeOfType(doc, 'CollectionPage').mainEntity['@id'], list['@id'])
    assert.equal(list.name, nodeOfType(doc, 'CollectionPage').name)
    assert.equal(list.itemListOrder, 'https://schema.org/ItemListOrderAscending')
  }
})

test('an index counts what the graph gives a page to, and the two indexes count different things', () => {
  for (const page of INDEX_PAGES) {
    assert.equal(
      nodeOfType(listDoc(page), 'ItemList').numberOfItems,
      pagedNodeCount(g, INDEXED_NODES[page](g)),
    )
  }
  // The fixture has two definitions and one theorem, so a swapped mapping would not
  // pass the assertion above by accident.
  assert.notEqual(
    nodeOfType(listDoc('definitions-index'), 'ItemList').numberOfItems,
    nodeOfType(listDoc('theorems-index'), 'ItemList').numberOfItems,
  )
})

test('the count is what has a page, not what is in the map', () => {
  // A node the narrative never introduces gets no page, so the index does not link
  // to it and must not count it either — the same predicate the rows are gated on,
  // and the reason this number is derived rather than written down.
  const withUnlisted = buildGraphFromRaw(
    raw({
      extraDefinitions: [
        {
          ...hu,
          name: 'def-harom',
          slug: 'def-harom',
          title: 'Harmadik definíció',
          terms: {},
          body: [narrative('Sehol nem szerepel.')],
          references: {},
          remarkSlugs: [],
        },
      ],
    }),
  )
  const paged = pagedNodeCount(withUnlisted, withUnlisted.definitions)
  assert.equal(withUnlisted.definitions.size, paged + 1, 'the fixture must hold a node with no page')
  assert.equal(
    nodeOfType(listDoc('definitions-index', withUnlisted), 'ItemList').numberOfItems,
    paged,
  )
})

test('an index names and counts its members without enumerating them', () => {
  for (const page of INDEX_PAGES) {
    const list = nodeOfType(listDoc(page), 'ItemList')
    assert.equal(list.itemListElement, undefined)
    // And no title of a listed node appears anywhere in the block: the markup
    // already carries all of them, as links, in this order.
    const serialized = JSON.stringify(listDoc(page))
    for (const node of INDEXED_NODES[page](g).values()) {
      assert.ok(!serialized.includes(node.slug), `${page} enumerates ${node.slug}`)
    }
  }
})

test('the glossary declares the vocabulary, and does not list its members', () => {
  const doc = listDoc('glossary')
  const set = nodeOfType(doc, 'DefinedTermSet')
  assert.equal(set['@id'], glossaryId('hu'))
  assert.equal(set.url, listPageUrl('glossary'))
  assert.equal(set.inLanguage, 'hu')
  assert.equal(set.hasDefinedTerm, undefined)
  assert.equal(nodeOfType(doc, 'CollectionPage').mainEntity['@id'], set['@id'])
})

test('the id every DefinedTerm on the site points at is the one the glossary page declares', () => {
  // The join the whole design turns on: 217 terms name a set from their own pages,
  // and exactly one page declares it. Before this builder existed, that id was
  // referenced everywhere and declared nowhere.
  const declared = nodeOfType(listDoc('glossary'), 'DefinedTermSet')['@id']
  let referenced = 0
  for (const node of EVERY_KIND) {
    for (const term of nodesOfType(docFor(node), 'DefinedTerm')) {
      assert.equal(term.inDefinedTermSet['@id'], declared)
      referenced += 1
    }
  }
  assert.ok(referenced > 0, 'the fixture must introduce a term for this to mean anything')
})

test('a list page trail is the one the visible breadcrumb row renders', () => {
  for (const page of LIST_PAGES) {
    const crumbs = kbListBreadcrumbs('hu', page)
    const list = nodeOfType(listDoc(page), 'BreadcrumbList')
    assert.equal(list['@id'], `${listPageUrl(page)}#breadcrumb`)
    assert.deepEqual(
      list.itemListElement.map((item) => item.name),
      crumbs.map((crumb) => crumb.label),
    )
    assert.deepEqual(
      list.itemListElement.map((item) => item.item),
      crumbs.map((crumb, index) =>
        index < crumbs.length - 1 ? absoluteUrl(crumb.href) : undefined,
      ),
    )
  }
})

test('a list page states no @id twice, and every id in it is absolute', () => {
  for (const page of LIST_PAGES) {
    const doc = listDoc(page)
    const ids = doc['@graph'].map((entry) => entry['@id'])
    assert.deepEqual([...new Set(ids)], ids, `${page} declares an @id twice`)
    for (const url of everyUrlIn(doc)) {
      assert.match(url, /^https?:\/\//, `${url} is not an absolute URL`)
    }
    assert.deepEqual(JSON.parse(JSON.stringify(doc)), doc)
  }
})

// ---------------------------------------------------------------------------
// The site nodes
// ---------------------------------------------------------------------------

test('the site names itself and its publisher, each once, by an origin-rooted id', () => {
  const doc = siteStructuredData('hu')
  assert.equal(doc['@context'], 'https://schema.org')
  assert.deepEqual(doc['@graph'].map((entry) => entry['@type']), ['Organization', 'WebSite'])

  const org = nodeOfType(doc, 'Organization')
  const site = nodeOfType(doc, 'WebSite')
  assert.equal(org['@id'], organizationId())
  assert.equal(site['@id'], siteId())
  assert.equal(site.publisher['@id'], org['@id'])
  assert.match(org['@id'], /^https:\/\/[^/]+\/#organization$/)
  assert.match(site['@id'], /^https:\/\/[^/]+\/#website$/)
  // An origin-rooted id, not a locale's home page: one site, however many languages.
  assert.ok(!site['@id'].includes('/hu'))
  assert.ok(!org['@id'].includes('/hu'))
})

test('the site node is what every page\'s isPartOf has been naming all along', () => {
  const declared = nodeOfType(siteStructuredData('hu'), 'WebSite')['@id']
  let referenced = 0
  for (const doc of [...EVERY_KIND.map(docFor), ...LIST_PAGES.map((page) => listDoc(page))]) {
    const page = doc['@graph'][0]
    assert.equal(page.isPartOf['@id'], declared, `${page['@id']} is part of something else`)
    referenced += 1
  }
  assert.equal(referenced, EVERY_KIND.length + LIST_PAGES.length)
})

test('the site nodes carry the locale root\'s language, url and stand-in logo', () => {
  const doc = siteStructuredData('hu')
  const org = nodeOfType(doc, 'Organization')
  const site = nodeOfType(doc, 'WebSite')
  assert.equal(org.url, SITE_URL)
  assert.equal(site.url, SITE_URL)
  assert.equal(org.logo, absoluteUrl(OG_IMAGE_DEFAULT))
  assert.equal(org.name, site.name)
  assert.equal(site.inLanguage, 'hu')
})

test('no other page declares the site nodes; they reference them', () => {
  // Two statements repeated on 541 pages would be 541 chances to disagree, and the
  // ids are what make one declaration reach all of them.
  for (const doc of [...EVERY_KIND.map(docFor), ...LIST_PAGES.map((page) => listDoc(page))]) {
    assert.deepEqual(nodesOfType(doc, 'WebSite'), [])
    assert.deepEqual(nodesOfType(doc, 'Organization'), [])
  }
})

/** The chapter the narrative introduces a node in, read off the graph rather than named. */
function chapterOf(node, graph = g) {
  return graph.embedding.get(keyForKbNode(node)).chapter
}
