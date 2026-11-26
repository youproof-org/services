// The display template collection reader: the defaults it fills in, and the checks
// that reject a template before any reference uses it.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import yaml from 'js-yaml'

import { readDisplayTemplateCollection } from '../src/index'

const CASES = { hu: ['ine', 'ela', 'poss'] }

type Loose = Record<string, any>

function read(yamlText: string) {
  return readDisplayTemplateCollection(yaml.load(yamlText), { cases: CASES })
}

function load(yamlText: string): Loose {
  const { collection, errors } = read(yamlText)
  assert.deepEqual(errors, [])
  return collection
}

/** Asserts the template `name` is rejected, with `problem` in its error. */
function rejects(yamlText: string, name: string, problem: string) {
  const { errors } = read(yamlText)
  const prefix = `template '${name}': `
  assert.ok(
    errors.some((error) => error.startsWith(prefix) && error.includes(problem)),
    `'${prefix}…${problem}' not in:\n  ${errors.join('\n  ')}`,
  )
}

const LIST = (list: string, targets = '[chapter]') => `the-chapters:\n  targets: ${targets}\n  list:\n${list}`
const ITEM = `    item:\n      first: "{the(target.index)} [{target.index}]"\n      last: "[{target.index} fejezet]"\n      separator: ", "\n      last-separator: " és "\n`

// ---------------------------------------------------------------------------
// Reading

test('a single template reads with its targets', () => {
  assert.deepEqual(
    load(
      'the-index-label:\n  targets: [definition, theorem]\n' +
        '  template: "{the(target.index)} [{target.index} {capital(target.label.canonical)}]"\n',
    ),
    {
      'the-index-label': {
        kind: 'single',
        name: 'the-index-label',
        targets: ['definition', 'theorem'],
        template: '{the(target.index)} [{target.index} {capital(target.label.canonical)}]',
      },
    },
  )
})

test('a template with no expression is valid', () => {
  assert.equal(load('remark:\n  targets: [remark]\n  template: megjegyzés\n').remark.template, 'megjegyzés')
})

test('a list template reads with its defaults filled in', () => {
  const { list } = load(LIST(`    count: { min: 2 }\n${ITEM}    after: ekben\n`))['the-chapters']
  assert.deepEqual(list, {
    count: { min: 2 },
    order: 'sorted',
    item: {
      first: '{the(target.index)} [{target.index}]',
      middle: '{the(target.index)} [{target.index}]',
      last: '[{target.index} fejezet]',
      separator: ', ',
      lastSeparator: ' és ',
    },
    before: '',
    after: 'ekben',
  })
})

test('middle defaults to first, last to middle, and last-separator to separator', () => {
  const { item } = load(LIST('    count: 3\n    item:\n      first: "[{target.index}]"\n      separator: ", "\n'))['the-chapters'].list
  assert.equal(item.middle, '[{target.index}]')
  assert.equal(item.last, '[{target.index}]')
  assert.equal(item.lastSeparator, ', ')
})

test('an exact count is stored as a range of one value', () => {
  assert.deepEqual(load(LIST(`    count: 2\n${ITEM}`))['the-chapters'].list.count, { min: 2, max: 2 })
})

test('a grouped list template keeps its grouping, its group separators and an authored order', () => {
  const { list } = load(
    'the-entities:\n  targets: [definition, theorem]\n  list:\n    count: { min: 2, max: 4 }\n    group-by: label\n' +
      '    order: authored\n    item:\n      first: "[{target.index}]"\n' +
      '      only: "{the(target.index)} [{target.index} {capital(target.label.canonical)}]"\n' +
      '      separator: ", "\n    group:\n      separator: ", "\n      last-separator: ", valamint "\n',
  )['the-entities']
  assert.equal(list.groupBy, 'label')
  assert.equal(list.order, 'authored')
  assert.deepEqual(list.count, { min: 2, max: 4 })
  assert.deepEqual(list.group, { separator: ', ', lastSeparator: ', valamint ' })
})

test('an empty file is an empty collection, and a file that is not a mapping is an error', () => {
  assert.deepEqual(read(''), { collection: {}, errors: [] })
  assert.deepEqual(read('- a\n- b\n'), { collection: {}, errors: ['the file must map template names to templates.'] })
})

test('the valid templates of a collection with errors are still read', () => {
  const { collection, errors } = read('ok:\n  targets: [remark]\n  template: x\nBad:\n  targets: [remark]\n  template: x\n')
  assert.deepEqual(Object.keys(collection), ['ok'])
  assert.deepEqual(errors, ["template 'Bad': the name is not kebab-case"])
})

// ---------------------------------------------------------------------------
// Template entry checks

test('a name must be kebab-case', () => {
  rejects('theIndex:\n  targets: [chapter]\n  template: x\n', 'theIndex', 'the name is not kebab-case')
})

test('targets must be a non-empty list of known target types, each once', () => {
  rejects('t:\n  template: x\n', 't', "'targets' must be a non-empty list")
  rejects('t:\n  targets: []\n  template: x\n', 't', "'targets' must be a non-empty list")
  rejects('t:\n  targets: [chapter, lemma]\n  template: x\n', 't', "'lemma' is not a target type")
  rejects('t:\n  targets: [part]\n  template: x\n', 't', "'part' is not a target type")
  rejects('t:\n  targets: [external]\n  template: x\n', 't', "'external' is not a target type")
  rejects('t:\n  targets: [chapter, chapter]\n  template: x\n', 't', "'targets' lists 'chapter' twice")
})

test('a template has exactly one of template and list', () => {
  rejects('t:\n  targets: [chapter]\n', 't', "exactly one of 'template' and 'list'")
  rejects(`t:\n  targets: [chapter]\n  template: x\n  list:\n    count: 2\n${ITEM}`, 't', "exactly one of 'template' and 'list'")
})

test('an unknown key fails, at every level of the entry', () => {
  rejects('t:\n  targets: [chapter]\n  template: x\n  display: y\n', 't', "unknown key 'display'")
  rejects(LIST(`    count: 2\n    sort: authored\n${ITEM}`), 'the-chapters', "unknown key 'list.sort'")
  rejects(LIST(`    count: { min: 2, most: 3 }\n${ITEM}`), 'the-chapters', "unknown key 'list.count.most'")
  rejects(LIST(`    count: 2\n${ITEM}      second: "[x]"\n`), 'the-chapters', "unknown key 'list.item.second'")
  rejects(
    'the-entities:\n  targets: [definition]\n  list:\n    count: 2\n    group-by: label\n    item:\n' +
      '      first: "[{target.index}]"\n      only: "[{target.index}]"\n      separator: ", "\n' +
      '    group:\n      separator: ", "\n      final: " és "\n',
    'the-entities',
    "unknown key 'list.group.final'",
  )
})

test('every problem in a collection is reported at once', () => {
  const { errors } = read('A:\n  targets: [chapter]\n  template: x\nb:\n  targets: [lemma]\n  template: x\n')
  assert.ok(errors.some((e) => /template 'A': the name is not kebab-case/.test(e)), errors.join('\n'))
  assert.ok(errors.some((e) => /template 'b': 'lemma' is not/.test(e)), errors.join('\n'))
})

// ---------------------------------------------------------------------------
// Expression checks, in a template and in every item form

const single = (template: string, targets = '[definition]') => `t:\n  targets: ${targets}\n  template: "${template}"\n`

test('an expression the parser cannot read fails', () => {
  rejects(single('[{target.index foo}]'), 't', '{target.index foo} is not an expression')
  rejects(single('[{the(target.index}]'), 't', '{the(target.index} is not an expression')
  rejects(single('[{target.index]'), 't', "'{' is never closed")
})

test('an unknown built-in fails, and a known one with the wrong arguments fails', () => {
  rejects(single('{plural(target.index)}'), 't', "unknown built-in 'plural'")
  rejects(single('{the(target.index, target.name)}'), 't', 'the() takes 1 argument(s), not 2')
  rejects(single('{base(target.index, target.label)}'), 't', 'the case of base() must be a quoted case key')
  rejects(single("{base('ine', target.index)}"), 't', 'base() inflects a label')
  rejects(single('{capital(target.label)}'), 't', 'capital() takes text, not a label')
})

test('a field the target type does not have fails, for every listed type', () => {
  rejects(single('[{target.index} {target.label.canonical}]', '[definition, chapter]'), 't', "a chapter target has no 'target.label'")
  rejects(single('{target.parent.index}', '[claim, theorem]'), 't', "a theorem target has no 'target.parent'")
  rejects(single('{target.lable.canonical}'), 't', "a definition target has no 'target.lable'")
  rejects(single('{target.label.cases}'), 't', "a definition target has no 'target.label.cases'")
})

test('a label or an object where text belongs fails', () => {
  rejects(single('{target.label}'), 't', 'a label is not text')
  rejects(single('{target.parent}', '[claim]'), 't', 'it names an object, not text')
})

test('a case key no locale declares fails, and the message lists what each locale declares', () => {
  rejects(single("{base('in', target.label)}{suffix('in', target.label)}"), 't', "case 'in' is not declared. 'hu' declares: ine, ela, poss")
  assert.ok(load(single("{inflect('ine', target.parent.label)}", '[claim, term]')).t)
})

test('every item form of a list is checked, not only the first', () => {
  rejects(LIST(`    count: 2\n${ITEM}`.replace('last: "[{target.index} fejezet]"', 'last: "[{target.label.canonical}]"')), 'the-chapters',
    "list.item.last: {target.label.canonical}: a chapter target has no 'target.label'")
  rejects(LIST(`    count: { min: 1 }\n${ITEM}      only: "{nope(target.index)}"\n`), 'the-chapters', "list.item.only: {nope(target.index)}: unknown built-in 'nope'")
})

// ---------------------------------------------------------------------------
// Links

test('a template or an item form holds at most one link', () => {
  rejects(single('[{target.index}] és [{target.index}]'), 't', 'it may hold one link [...], not several')
  rejects(LIST(`    count: 2\n${ITEM}`.replace('"[{target.index} fejezet]"', '"[{target.index}] [fejezet]"')), 'the-chapters',
    'list.item.last: it may hold one link [...], not several')
  rejects(single('[{target.index}'), 't', "'[' and ']' don't pair up")
  rejects(single('{target.index}]['), 't', "']' comes before its '['")
})

test('a form without a link is valid, and brackets inside math are not links', () => {
  assert.ok(load(single('{the(target.index)} {target.index}')).t)
  assert.ok(load(single('[{target.index}] $[0]_3$ $[1]_3$')).t)
})

test('before, after and the separators carry no link and no expression', () => {
  rejects(LIST(`    count: 2\n${ITEM}    after: " [fejezetekben]"\n`), 'the-chapters', 'list.after: it may not hold a link')
  rejects(LIST(`    count: 2\n${ITEM}    before: "{target.index}"\n`), 'the-chapters', 'list.before: {target.index}: there is no target here to read')
  rejects(LIST(`    count: 2\n${ITEM}`.replace('separator: ", "', 'separator: ", [x] "')), 'the-chapters', 'list.item.separator: it may not hold a link')
  rejects(
    'the-entities:\n  targets: [definition]\n  list:\n    count: 2\n    group-by: label\n    item:\n' +
      '      first: "[{target.index}]"\n      only: "[{target.index}]"\n      separator: ", "\n' +
      '    group:\n      separator: ", "\n      last-separator: " [és] "\n',
    'the-entities',
    'list.group.last-separator: it may not hold a link',
  )
})

// ---------------------------------------------------------------------------
// List shape

test('count is required, and is a whole number or a range whose min is smaller than its max', () => {
  rejects(LIST(ITEM), 'the-chapters', "'list.count' is required")
  rejects(LIST(`    count: 0\n${ITEM}`), 'the-chapters', "'list.count' must be a whole number of at least 1")
  rejects(LIST(`    count: two\n${ITEM}`), 'the-chapters', "'list.count' must be a number or a range")
  rejects(LIST(`    count: { min: 3, max: 3 }\n${ITEM}`), 'the-chapters', "'list.count.min' (3) must be smaller than 'list.count.max' (3)")
  rejects(LIST(`    count: { min: 4, max: 2 }\n${ITEM}`), 'the-chapters', "must be smaller than 'list.count.max' (2)")
  rejects(LIST(`    count: { min: 2, max: 2.5 }\n${ITEM}`), 'the-chapters', "'list.count.max' must be a whole number")
})

test('a list that can render one target needs an only form', () => {
  rejects(LIST(`    count: { max: 3 }\n${ITEM}`), 'the-chapters', "'list.item.only' is required when 'list.count' allows one target")
  rejects(LIST(`    count: 1\n${ITEM}`), 'the-chapters', "'list.item.only' is required when 'list.count' allows one target")
  assert.deepEqual(load(LIST(`    count: { max: 3 }\n${ITEM}      only: "[{target.index} fejezet]"\n`))['the-chapters'].list.count, { min: 1, max: 3 })
})

const GROUPED = (groupBy: string, targets: string, only = '      only: "[{target.index}]"\n') =>
  `g:\n  targets: ${targets}\n  list:\n    count: { min: 2 }\n    group-by: ${groupBy}\n    item:\n` +
  `      first: "[{target.index}]"\n${only}      separator: ", "\n    group:\n      separator: ", "\n`

test('group-by is label, parent or type, and needs an only form and group separators', () => {
  assert.equal(load(GROUPED('label', '[definition, theorem]')).g.list.groupBy, 'label')
  assert.equal(load(GROUPED('parent', '[claim]')).g.list.groupBy, 'parent')
  assert.equal(load(GROUPED('type', '[claim, theorem, chapter]')).g.list.groupBy, 'type')
  rejects(GROUPED('variant', '[definition]'), 'g', "'list.group-by' must be one of label, parent, type")
  rejects(GROUPED('label', '[definition]', ''), 'g', "'list.item.only' is required with 'group-by'")
  rejects(GROUPED('label', '[definition]').replace(/    group:\n.*\n$/, ''), 'g', "'list.group' with a 'separator' is required with 'group-by'")
  rejects(LIST(`    count: 2\n${ITEM}    group:\n      separator: ", "\n`), 'the-chapters', "'list.group' only applies with 'group-by'")
})

test('group-by must be supported by every target type', () => {
  rejects(GROUPED('parent', '[claim, chapter]'), 'g', "'list.group-by: parent' does not apply to chapter: only claims have a parent")
  rejects(GROUPED('label', '[theorem, claim, section]'), 'g', "'list.group-by: label' does not apply to claim, section")
})

test('order is absent or authored', () => {
  rejects(LIST(`    count: 2\n    order: sorted\n${ITEM}`), 'the-chapters', "'list.order' is either absent")
})
