// The fully qualified name grammar: one example of every production, and every way
// a target can be wrong.
//
// The failure cases carry as much weight as the successes here. A reference target
// is authored by hand in YAML, so the parser is the only thing standing between a
// typo and a silently wrong link — and the difference between "unparseable",
// "unknown container" and "well-formed but illegal" is exactly what tells an author
// which of those they did.
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { parseFqn, isExternalTarget, fqnJoin, fqnSegment } from '../lib/content/fqn.ts'

const parse = (fqn) => parseFqn(fqn, 'test')

// ---------------------------------------------------------------------------
// Every production
// ---------------------------------------------------------------------------

test('every production in the grammar parses to its leaf kind', () => {
  const cases = [
    ['books.alice-es-bob', 'book', ''],
    ['books.alice-es-bob.parts.a-matematika-epitmenye', 'part', 'books.alice-es-bob'],
    ['books.alice-es-bob.chapters.gyuruje', 'chapter', 'books.alice-es-bob'],
    ['books.alice-es-bob.chapters.gyuruje.sections.hol-tartunk', 'section', 'books.alice-es-bob.chapters.gyuruje'],
    ['articles.puthagorasz', 'article', ''],
    ['newsletters.elozmenyek', 'newsletter', ''],
    ['pages.impresszum', 'page', ''],
    ['landings.mintafejezet', 'landing', ''],
    ['articles.puthagorasz.sections.bevezetes', 'section', 'articles.puthagorasz'],
    ['definitions.gyuru', 'definition', ''],
    ['theorems.gyuru-muveletei', 'theorem', ''],
    ['theorems.t.proofs.p', 'proof', 'theorems.t'],
    ['definitions.d.remarks.r', 'remark', 'definitions.d'],
    ['theorems.t.remarks.r', 'remark', 'theorems.t'],
    ['theorems.t.proofs.p.remarks.r', 'remark', 'theorems.t.proofs.p'],
    ['definitions.d.terms.egesz-szam', 'term', 'definitions.d'],
    ['theorems.t.proofs.p.terms.egesz-szam', 'term', 'theorems.t.proofs.p'],
    ['theorems.t.proofs.p.remarks.r.terms.egesz-szam', 'term', 'theorems.t.proofs.p.remarks.r'],
    ['definitions.d.claims.nullelem', 'claim', 'definitions.d'],
    ['theorems.t.claims.nullelem', 'claim', 'theorems.t'],
    ['theorems.t.remarks.r.claims.nullelem', 'claim', 'theorems.t.remarks.r'],
  ]
  for (const [fqn, kind, parentFqn] of cases) {
    const p = parse(fqn)
    assert.equal(p.kind, kind, fqn)
    assert.equal(p.parentFqn, parentFqn, `${fqn} parent`)
    assert.equal(p.fqn, fqn)
    assert.equal(p.name, fqn.split('.').pop())
  }
})

test('a chapter path carries no part, and a knowledge-base path no namespace', () => {
  // Both are the point of the grammar: a chapter moving between parts, or a node
  // between namespaces, must not change how it is referenced.
  const chapter = parse('books.alice-es-bob.chapters.gyuruje')
  assert.equal(chapter.steps.length, 2)
  assert.deepEqual(chapter.steps.map((s) => s.kind), ['book', 'chapter'])

  const proof = parse('theorems.t.proofs.p')
  assert.deepEqual(proof.steps.map((s) => s.kind), ['theorem', 'proof'])
})

test('a part is a leaf, not a chapter ancestor', () => {
  assert.equal(parse('books.b.parts.p').kind, 'part')
  assert.throws(() => parse('books.b.parts.p.chapters.c'), /puts a 'chapter' inside a 'part'/)
})

// ---------------------------------------------------------------------------
// External targets
// ---------------------------------------------------------------------------

test('an external target is recognised by its scheme, not by "//"', () => {
  assert.ok(isExternalTarget('https://example.org/x'))
  // The case a `://` test gets wrong — four of these exist in the content.
  assert.ok(isExternalTarget('mailto:hello@youproof.org'))
  assert.ok(!isExternalTarget('definitions.gyuru'))
  assert.ok(!isExternalTarget('books.b.chapters.c'))
})

test('parsing a URL as a path fails with a message that says so', () => {
  assert.throws(() => parse('https://example.org'), /is a URL, not a fully qualified name/)
})

// ---------------------------------------------------------------------------
// Malformed
// ---------------------------------------------------------------------------

test('an odd number of segments fails — a path is container/name pairs', () => {
  assert.throws(() => parse('definitions'), /even number of segments \(got 1\)/)
  assert.throws(() => parse('theorems.t.proofs'), /even number of segments \(got 3\)/)
})

test('an unknown container fails and lists the known ones', () => {
  assert.throws(() => parse('lemmas.valami'), /unknown container 'lemmas'/)
  assert.throws(() => parse('lemmas.valami'), /Known: articles, books/)
})

test('an empty target and an empty name both fail', () => {
  assert.throws(() => parse(''), /empty reference target/)
  assert.throws(() => parse('definitions.'), /even number of segments|empty name/)
})

// ---------------------------------------------------------------------------
// Well-formed but illegal — the interesting class
// ---------------------------------------------------------------------------

test('a claim on a proof fails: well-formed, and still not in the content model', () => {
  // Parses cleanly — `claims` is a real container and `proofs.p` a real parent — so
  // only the grammar table rejects it. This is the asymmetry with terms, which ARE
  // allowed on a proof.
  assert.throws(
    () => parse('theorems.t.proofs.p.claims.c'),
    /puts a 'claim' inside a 'proof'.*belongs at a 'definition' or a 'theorem' or a 'remark'/s,
  )
  assert.equal(parse('theorems.t.proofs.p.terms.x').kind, 'term')
})

test('a type that only exists at the root cannot be nested, and vice versa', () => {
  assert.throws(() => parse('definitions.d.theorems.t'), /puts a 'theorem' inside a 'definition'/)
  assert.throws(() => parse('definitions.d.books.b'), /puts a 'book' inside a 'definition'/)
  assert.throws(() => parse('proofs.p'), /puts a 'proof' at the root.*belongs at a 'theorem'/s)
  assert.throws(() => parse('sections.s'), /puts a 'section' at the root/)
  assert.throws(() => parse('terms.x'), /puts a 'term' at the root/)
})

test('a remark may hang off a definition, theorem or proof — but not another remark', () => {
  for (const p of ['definitions.d.remarks.r', 'theorems.t.remarks.r', 'theorems.t.proofs.p.remarks.r']) {
    assert.equal(parse(p).kind, 'remark')
  }
  assert.throws(() => parse('definitions.d.remarks.r.remarks.r2'), /puts a 'remark' inside a 'remark'/)
})

test('a section may hang off a chapter or any standalone item', () => {
  for (const p of [
    'books.b.chapters.c.sections.s',
    'articles.a.sections.s',
    'newsletters.n.sections.s',
    'pages.p.sections.s',
    'landings.l.sections.s',
  ]) {
    assert.equal(parse(p).kind, 'section')
  }
})

test('the error names the citation site, since the fix is in a YAML file', () => {
  assert.throws(
    () => parseFqn('lemmas.x', "reference 'gyuru'"),
    /^Error: reference 'gyuru': /,
  )
})

// ---------------------------------------------------------------------------
// Building
// ---------------------------------------------------------------------------

test('fqnJoin and fqnSegment round-trip with the parser', () => {
  assert.equal(fqnSegment('proof'), 'proofs')
  assert.equal(fqnJoin('', 'theorem', 't'), 'theorems.t')
  assert.equal(fqnJoin('theorems.t', 'proof', 'p'), 'theorems.t.proofs.p')
  const built = fqnJoin(fqnJoin('theorems.t', 'proof', 'p'), 'term', 'x')
  assert.equal(parse(built).kind, 'term')
  assert.equal(parse(built).parentFqn, 'theorems.t.proofs.p')
})
