const fs = require('fs')
const path = require('path')

const [contentDir, yamlModule] = process.argv.slice(2)
if (!contentDir || !yamlModule) {
  console.error('usage: node find-chains.cjs <content dir> <js-yaml module path>')
  process.exit(1)
}
const yaml = require(yamlModule)

const CONTAINERS = {
  chapters: 'chapter', sections: 'section', definitions: 'definition', theorems: 'theorem',
  proofs: 'proof', remarks: 'remark', claims: 'claim', terms: 'term',
}
const IN_SCOPE = new Set(['definition', 'theorem', 'proof', 'remark', 'claim', 'section', 'chapter'])
const kindOf = (target) =>
  /^[a-z][a-z0-9+.-]*:/.test(target) ? 'external' : CONTAINERS[target.split('.').slice(-2)[0]] ?? 'other'
const parentOf = (target) => target.replace(/\.claims\.[^.]+$/, '')

const TOKEN = /(?<!\[)\[(\d+)\](?!\])/g
const CONNECTOR = /^[a-záéíóöőúüű]{0,8}\s*(?:,|,?\s*(?:és|vagy|illetve|valamint|ill\.|meg)|\s[–-]|\/)\s*(?:az?\s)?\s*$/i
const NUMBER_ONLY = [
  /^(?:\{the\(target\.index\)\} )?\[?\{target\.index\}\]?$/,
  /^(?:\{the\(target\.parent\.index\)\} )?\[?\{target\.parent\.index\} \{capital\(target\.parent\.label\.canonical\)\} (?:szerinti )?\{target\.index\}\]?$/,
]

const files = []
const collect = (dir) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) collect(full)
    else if (/\.ya?ml$/.test(entry.name)) files.push(full)
  }
}
collect(contentDir)
files.sort()

const collections = {}
for (const file of files) {
  const locale = path.basename(file).match(/^display-templates\.(.+)\.ya?ml$/)?.[1]
  if (locale) collections[locale] = yaml.load(fs.readFileSync(file, 'utf8')) ?? {}
}

const SKIPPED_KEYS = new Set(['references', 'terms', 'formula', 'src', 'target', 'slug', 'name'])
const textsOf = (node, out, top = true) => {
  if (typeof node === 'string') out.push(node)
  else if (Array.isArray(node)) node.forEach((child) => textsOf(child, out, false))
  else if (node && typeof node === 'object') {
    if (!top && Array.isArray(node.references)) return out
    for (const [key, child] of Object.entries(node)) {
      if (SKIPPED_KEYS.has(key)) continue
      if ((key === 'content' && node.type === 'formula') || (key === 'rows' && node.type === 'typewriter')) continue
      textsOf(child, out, false)
    }
  }
  return out
}

const owners = (node, out = []) => {
  if (Array.isArray(node)) node.forEach((child) => owners(child, out))
  else if (node && typeof node === 'object') {
    if (Array.isArray(node.references)) out.push(node)
    for (const [key, child] of Object.entries(node)) if (key !== 'references') owners(child, out)
  }
  return out
}

const describe = (member) => `[${member.index}] ${member.display} -> ${member.targets.join(' + ')}`
const excerpt = (text, from, to) =>
  text.slice(Math.max(0, from - 60), Math.min(text.length, to + 40)).replace(/\s+/g, ' ').trim()

const verdictOf = (run) => {
  const kinds = new Set(run.map((member) => member.kind))
  if (run.some((member) => member.isList)) return 'next to a list reference: extend that list'
  if (kinds.size === 1 && kinds.has('claim')) {
    const parents = new Set(run.flatMap((member) => member.targets.map(parentOf)))
    return parents.size === 1 ? 'claims of one parent: one list' : 'claims of several parents: one list, grouped by parent'
  }
  if (kinds.size === 1) return `${[...kinds][0]}s: one list`
  if (kinds.has('claim')) return 'a claim next to an entity: decided to stay separate'
  return 'several entity types: one list, grouped by type'
}

const chains = []
const loneNumberOnly = []

for (const file of files) {
  if (path.basename(file).startsWith('display-templates.')) continue
  const doc = yaml.load(fs.readFileSync(file, 'utf8'))
  for (const owner of owners(doc)) {
    const collection = collections[doc.locale ?? 'hu'] ?? {}
    for (const raw of textsOf(owner, [])) {
      const text = raw.replace(/\$[^$]+\$/g, (math) => '$' + '·'.repeat(math.length - 2) + '$')
      const members = [...text.matchAll(TOKEN)].filter((match) => owner.references[Number(match[1])]).map((match) => {
        const item = owner.references[Number(match[1])]
        const targets = (item.targets ?? [item.target]).map(String)
        const template = item.display === undefined ? undefined : collection[item.display]
        return {
          index: Number(match[1]),
          start: match.index,
          end: match.index + match[0].length,
          display: item.display ?? `text "${item.text}"`,
          targets,
          kind: kindOf(targets[0]),
          isList: template?.list !== undefined,
          numberOnly: typeof template?.template === 'string' && NUMBER_ONLY.some((re) => re.test(template.template)),
          chained: false,
        }
      })

      let run = []
      const flush = () => {
        if (run.length >= 2) {
          run.forEach((member) => { member.chained = true })
          chains.push({ file: path.relative(contentDir, file), run, verdict: verdictOf(run), text: excerpt(raw, run[0].start, run.at(-1).end) })
        }
        run = []
      }
      members.forEach((member, at) => {
        const joined = at > 0 && CONNECTOR.test(text.slice(members[at - 1].end, member.start))
        if (!joined) flush()
        if (IN_SCOPE.has(member.kind)) run.push(member)
        else flush()
      })
      flush()

      for (const member of members) {
        if (member.numberOnly && IN_SCOPE.has(member.kind) && !member.chained) {
          loneNumberOnly.push({ file: path.relative(contentDir, file), member, text: excerpt(raw, member.start, member.end) })
        }
      }
    }
  }
}

const byVerdict = {}
for (const chain of chains) (byVerdict[chain.verdict] ??= []).push(chain)

console.log(`Chains of in-scope references still written by hand: ${chains.length}`)
for (const [verdict, list] of Object.entries(byVerdict).sort()) console.log(`  ${String(list.length).padStart(3)}  ${verdict}`)
console.log(`Number-only references outside any chain: ${loneNumberOnly.length}\n`)

for (const [verdict, list] of Object.entries(byVerdict).sort()) {
  console.log(`## ${verdict} (${list.length})\n`)
  for (const chain of list) {
    console.log(chain.file)
    console.log(`  …${chain.text}…`)
    for (const member of chain.run) console.log(`    ${describe(member)}`)
    console.log()
  }
}

console.log(`## Number-only references outside any chain (${loneNumberOnly.length})\n`)
for (const { file, member, text } of loneNumberOnly) {
  console.log(file)
  console.log(`  …${text}…`)
  console.log(`    ${describe(member)}\n`)
}
