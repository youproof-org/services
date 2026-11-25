import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  capitalizeSegments,
  checkLinkText,
  checkTemplate,
  joinSegments,
  linkSegments,
  resolveTemplate,
  segmentsText,
  TemplateCaseError,
  TEMPLATE_CONTEXT_SHAPES,
  TEMPLATE_TARGET_TYPES,
  type TemplateContext,
} from '../src/index'

const LEMMA = {
  canonical: 'lemma',
  cases: { ine: { base: 'lemmá', suffix: 'ban' }, poss: { base: 'lemmá', suffix: 'ja' } },
}

const ctx: TemplateContext = {
  target: { index: '5.2.', name: 'x', title: 'Cím', type: 'theorem', label: LEMMA },
}

// ---------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------

test('paths and built-ins resolve against the context', () => {
  assert.equal(
    resolveTemplate("{the(target.index)} [{target.index} {capital(base('ine', target.label))}]{suffix('ine', target.label)}", ctx),
    'az [5.2. Lemmá]ban',
  )
  assert.equal(resolveTemplate("{inflect('poss', target.label)}", ctx), 'lemmája')
  assert.equal(resolveTemplate('{capital(target.label.canonical)}', ctx), 'Lemma')
  assert.equal(resolveTemplate("{capital('szó')}", ctx), 'Szó')
})

test('the article follows the spoken form of the leading number', () => {
  const article = (index: string) => resolveTemplate('{the(target.index)}', { target: { index } })
  assert.deepEqual(['1.', '2.3.', '5.1.', '50.', '15.', ''].map(article), ['az', 'a', 'az', 'az', 'a', 'a'])
})

test('a template without braces comes back unchanged, and math braces are never expressions', () => {
  assert.equal(resolveTemplate('megjegyzés', ctx), 'megjegyzés')
  assert.equal(resolveTemplate('[modulo $p^{c+1}$ maradékosztály]', ctx), '[modulo $p^{c+1}$ maradékosztály]')
  assert.equal(resolveTemplate('$\\frac{m}{d}$ és {target.index}', ctx), '$\\frac{m}{d}$ és 5.2.')
})

test('an unparseable expression is printed as written, text after a parsed one is ignored, and a missing field is empty', () => {
  assert.equal(resolveTemplate('{(}', ctx), '{(}')
  assert.equal(resolveTemplate("{'open}", ctx), "{'open}")
  assert.equal(resolveTemplate('{target.index foo}', ctx), '5.2.')
  assert.equal(resolveTemplate('[{target.nope}]', ctx), '[]')
  assert.equal(resolveTemplate('{target.label}', ctx), '')
})

test('an unknown built-in throws', () => {
  assert.throws(() => resolveTemplate('{plural(target.index)}', ctx), /Unknown built-in: "plural"/)
})

test('a case the label does not have, or a case applied to something else, throws a TemplateCaseError', () => {
  assert.throws(
    () => resolveTemplate("{base('acc', target.label)}", ctx),
    (err) => err instanceof TemplateCaseError && err.caseKey === 'acc' && /case 'acc' is not declared/.test(err.message),
  )
  assert.throws(
    () => resolveTemplate("{base('ine', target.index)}", ctx),
    (err) => err instanceof TemplateCaseError && /applied to something that is not a label/.test(err.message),
  )
})

// ---------------------------------------------------------------------------
// Checks
// ---------------------------------------------------------------------------

const CASES = { hu: ['ine', 'poss'], en: ['gen'] }
const form = (template: string, targets = ['definition'] as const) =>
  checkTemplate(template, targets, { links: 'at-most-one', cases: CASES })

test('a valid template has no problems', () => {
  assert.deepEqual(form("{the(target.index)} [{target.index} {capital(base('ine', target.label))}]"), [])
  assert.deepEqual(form("{inflect('gen', target.label)}"), [])
  assert.deepEqual(form('[{target.index}] $[0]_3$'), [])
})

test('a case key no locale declares is reported with what each locale declares', () => {
  assert.deepEqual(form("{base('acc', target.label)}"), [
    "{base('acc', target.label)}: case 'acc' is not declared. 'hu' declares: ine, poss; 'en' declares: gen",
  ])
})

test('fields, built-ins, arguments and links are checked', () => {
  assert.deepEqual(form('{target.parent.index}'), ["{target.parent.index}: a definition target has no 'target.parent'"])
  assert.deepEqual(form('{nope(target.index)}'), ["{nope(target.index)}: unknown built-in 'nope'. Known: the, capital, base, suffix, inflect"])
  assert.deepEqual(form('{capital(target.label)}'), ['{capital(target.label)}: capital() takes text, not a label'])
  assert.deepEqual(form('{target.label}'), ['{target.label}: a label is not text: read its canonical word or inflect it'])
  assert.deepEqual(form('[a] [b]'), ['it may hold one link [...], not several'])
  assert.deepEqual(form('{x'), ["'{' is never closed"])
  assert.deepEqual(
    checkTemplate('[x] {target.index}', [], { links: 'none', expressions: false, cases: CASES }),
    ['{target.index}: there is no target here to read', 'it may not hold a link [...]'],
  )
})

test('every target type has a context shape', () => {
  assert.deepEqual(Object.keys(TEMPLATE_CONTEXT_SHAPES).sort(), [...TEMPLATE_TARGET_TYPES].sort())
})

// ---------------------------------------------------------------------------
// Segments
// ---------------------------------------------------------------------------

test('the span from the first [ to the last ] is the link', () => {
  assert.deepEqual(linkSegments('az [1.2. Definíció]ban', 't'), [
    { kind: 'text', text: 'az ' },
    { kind: 'link', text: '1.2. Definíció', target: 't' },
    { kind: 'text', text: 'ban' },
  ])
  assert.deepEqual(linkSegments('[a] és [b]', 't'), [
    { kind: 'text', text: '' },
    { kind: 'link', text: 'a] és [b', target: 't' },
    { kind: 'text', text: '' },
  ])
})

test('a display without a bracket pair is a link as a whole, and an empty one has no segments', () => {
  assert.deepEqual(linkSegments('kis Fermat-tétel', 't'), [{ kind: 'link', text: 'kis Fermat-tétel', target: 't' }])
  assert.deepEqual(linkSegments('a ] b [', 't'), [{ kind: 'link', text: 'a ] b [', target: 't' }])
  assert.deepEqual(linkSegments('[]', 't').map((s) => s.kind), ['text', 'link', 'text'])
  assert.deepEqual(linkSegments('', 't'), [])
})

test('neighbouring text segments are joined', () => {
  assert.deepEqual(
    joinSegments([
      { kind: 'text', text: '' },
      { kind: 'text', text: 'a ' },
      { kind: 'text', text: 'b ' },
      { kind: 'link', text: '', target: 't' },
      { kind: 'link', text: 'c', target: 'u' },
      { kind: 'text', text: '' },
    ]),
    [
      { kind: 'text', text: 'a b ' },
      { kind: 'link', text: '', target: 't' },
      { kind: 'link', text: 'c', target: 'u' },
      { kind: 'text', text: '' },
    ],
  )
})

test('capitalization changes the first visible character, in whichever segment holds it', () => {
  assert.deepEqual(capitalizeSegments(linkSegments('az [1.] fejezet', 't')).map((s) => s.text), ['Az ', '1.', ' fejezet'])
  assert.deepEqual(capitalizeSegments(linkSegments('kis tétel', 't')).map((s) => s.text), ['Kis tétel'])
  assert.deepEqual(capitalizeSegments(linkSegments('[kongruenciá]val', 't')).map((s) => s.text), ['', 'Kongruenciá', 'val'])
  assert.deepEqual(capitalizeSegments(linkSegments(' a [tétel] ', 't')).map((s) => s.text), [' A ', 'tétel', ' '])
  assert.deepEqual(
    capitalizeSegments([
      { kind: 'text', text: '' },
      { kind: 'link', text: '', target: 't' },
      { kind: 'text', text: '  ' },
      { kind: 'link', text: 'élő', target: 'u' },
    ]).map((s) => s.text),
    ['', '', '  ', 'Élő'],
  )
  assert.deepEqual(capitalizeSegments(linkSegments('[] ', 't')).map((s) => s.text), ['', '', ' '])
  assert.deepEqual(capitalizeSegments([]), [])
})

test('capitalization keeps every segment but the one it changes, and its kind and target', () => {
  const segments = linkSegments('[kis] tétel', 't')
  const capitalized = capitalizeSegments(segments)
  assert.deepEqual(capitalized[1], { kind: 'link', text: 'Kis', target: 't' })
  assert.equal(capitalized[0], segments[0])
  assert.equal(capitalized[2], segments[2])
  assert.equal(segments[1].text, 'kis', 'the input is not mutated')
})

// ---------------------------------------------------------------------------
// Literal link text
// ---------------------------------------------------------------------------

test('literal link text may mark one link and holds no expression', () => {
  assert.deepEqual(checkLinkText('kis Fermat-tétel'), [])
  assert.deepEqual(checkLinkText('a [gyűrű]k'), [])
  assert.deepEqual(checkLinkText('modulo $p^{c+1}$ [maradékosztály]'), [], 'braces inside math are not expressions')
  assert.deepEqual(checkLinkText('[a] és [b]'), ['it may hold one link [...], not several'])
  assert.deepEqual(checkLinkText('a [b'), ["'[' and ']' don't pair up"])
  assert.deepEqual(checkLinkText('a ]b['), ["']' comes before its '['"])
  assert.deepEqual(checkLinkText('az [{target.index}]'), [
    '{target.index} is an expression, and literal text has none: name a template in the collection instead',
  ])
})

test('the text of a display is its segments without link markup', () => {
  assert.equal(segmentsText(linkSegments('az [1.2. Definíció]ban', 't')), 'az 1.2. Definícióban')
})
