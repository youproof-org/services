const fs = require('fs')
const path = require('path')

const [contentDir, yamlModule] = process.argv.slice(2)
if (!contentDir || !yamlModule) {
  console.error('usage: node measure.cjs <content dir> <js-yaml module path>')
  process.exit(1)
}
const yaml = require(yamlModule)

const NOUNS = [
  ['rendezési axióm', 'order-axiom'],
  ['Peano-axióm', 'peano-axiom'],
  ['gyűrűaxióm', 'ring-axiom'],
  ['csoportaxióm', 'group-axiom'],
  ['axióm', 'axiom'],
  ['állítás', 'statement'],
  ['tulajdonság', 'property'],
  ['feltétel', 'condition'],
  ['pont', 'point'],
]
const nounOf = (template) => NOUNS.find(([word]) => template.includes(word))?.[1] ?? '(none)'

const templates = yaml.load(
  fs.readFileSync(path.join(contentDir, 'display-templates/display-templates.hu.yaml'), 'utf8'),
)

const files = []
const collect = (dir) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) collect(full)
    else if (/\.ya?ml$/.test(entry.name) && !full.includes('display-templates')) files.push(full)
  }
}
collect(contentDir)

const uses = {}
const nounsByParent = {}
const nounsBySource = {}
const literal = {}
let claimFiles = 0
let claimBlocks = 0

const bump = (map, key) => { map[key] = (map[key] ?? 0) + 1 }

const readReferences = (node, file) => {
  if (Array.isArray(node)) return node.forEach((child) => readReferences(child, file))
  if (!node || typeof node !== 'object') return
  if (Array.isArray(node.references)) {
    for (const item of node.references) {
      for (const target of item.targets ?? [item.target]) {
        if (typeof target !== 'string' || !target.includes('.claims.')) continue
        if (item.text !== undefined) { bump(literal, item.text); continue }
        const parent = target.replace(/\.claims\..*$/, '')
        const noun = nounOf(templates[item.display].template ?? JSON.stringify(templates[item.display].list))
        bump(uses, item.display)
        bump((nounsByParent[parent] ??= {}), noun)
        const ownFile = file.includes(parent.split('.').pop())
        bump((nounsBySource[noun] ??= {}), ownFile ? 'parent or its proof' : 'elsewhere')
      }
    }
  }
  for (const [key, child] of Object.entries(node)) if (key !== 'references') readReferences(child, file)
}

const countClaims = (node) => {
  if (Array.isArray(node)) return node.reduce((sum, child) => sum + countClaims(child), 0)
  if (!node || typeof node !== 'object') return 0
  return (node.type === 'claim' ? 1 : 0) + Object.values(node).reduce((sum, child) => sum + countClaims(child), 0)
}

for (const file of files) {
  const doc = yaml.load(fs.readFileSync(file, 'utf8'))
  readReferences(doc, path.relative(contentDir, file))
  const claims = countClaims(doc)
  if (claims) { claimFiles++; claimBlocks += claims }
}

const claimTemplates = Object.entries(templates).filter(([, t]) => t.targets.includes('claim'))
console.log(`Templates that accept a claim: ${claimTemplates.length}`)
console.log(`Files with claim blocks: ${claimFiles}, claim blocks: ${claimBlocks}\n`)

console.log('Uses per template')
for (const [name, t] of claimTemplates) {
  console.log(`${String(uses[name] ?? 0).padStart(5)}  ${nounOf(t.template ?? '').padEnd(12)} ${name}`)
}

const totals = {}
const templatesPerNoun = {}
for (const nouns of Object.values(nounsByParent)) for (const [noun, n] of Object.entries(nouns)) totals[noun] = (totals[noun] ?? 0) + n
for (const [, t] of claimTemplates) bump(templatesPerNoun, nounOf(t.template ?? ''))
console.log('\nNoun: references, templates, cited from')
for (const [noun, n] of Object.entries(totals).sort((a, b) => b[1] - a[1])) {
  console.log(`${String(n).padStart(5)}  ${String(templatesPerNoun[noun]).padStart(3)}  ${noun.padEnd(12)} ${JSON.stringify(nounsBySource[noun])}`)
}

const parents = Object.keys(nounsByParent)
const named = (nouns) => Object.entries(nouns).filter(([noun]) => noun !== 'point' && noun !== '(none)').sort((a, b) => b[1] - a[1])
console.log(`\nParents cited through a claim: ${parents.length}`)
console.log(`Cited with more than one noun: ${parents.filter((p) => Object.keys(nounsByParent[p]).filter((n) => n !== '(none)').length > 1).length}`)
console.log(`Cited with a noun other than pont: ${parents.filter((p) => named(nounsByParent[p]).length > 0).length}`)

console.log('\nMost used noun other than pont, by parent type')
const dominant = {}
for (const parent of parents) bump(dominant, `${parent.split('.')[0]}: ${named(nounsByParent[parent])[0]?.[0] ?? '(pont or no noun only)'}`)
for (const [key, n] of Object.entries(dominant).sort()) console.log(`${String(n).padStart(5)}  ${key}`)

console.log('\nParents cited with two nouns other than pont')
let minority = 0
for (const parent of parents) {
  const nouns = named(nounsByParent[parent])
  if (nouns.length < 2) continue
  minority += nouns.slice(1).reduce((sum, [, n]) => sum + n, 0)
  console.log(`  ${parent} ${JSON.stringify(Object.fromEntries(nouns))}`)
}
console.log(`References in the minority: ${minority}`)

console.log('\nLiteral text on a claim target')
for (const [text, n] of Object.entries(literal)) console.log(`${String(n).padStart(5)}  ${text}`)
