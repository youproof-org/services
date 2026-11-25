// Collects the places where the content chains several references into one list by hand.
// Usage: node collect.cjs <content-repo>/content <services>/apps/website/node_modules/js-yaml
const fs = require('fs'), path = require('path')
const [root, yamlPath] = process.argv.slice(2)
const yaml = require(path.resolve(yamlPath))

const CONTAINERS = { books: 'book', parts: 'part', chapters: 'chapter', sections: 'section', definitions: 'definition', theorems: 'theorem', proofs: 'proof', remarks: 'remark', claims: 'claim', terms: 'term', articles: 'article', newsletters: 'newsletter', pages: 'page', landings: 'landing' }
const IN_SCOPE = new Set(['definition', 'theorem', 'proof', 'remark', 'claim', 'section', 'chapter'])
const kindOf = (t) => (/^[a-z][a-z0-9+.-]*:/.test(t) ? 'external' : CONTAINERS[t.split('.').slice(-2)[0]] ?? 'unknown')

const TOKEN = /(?<!\[)\[([a-zA-Z][a-zA-Z0-9-]*)\](?!\])/g
// Text allowed between two members of a list: an optional case ending glued to the
// previous link, then a comma and/or a conjunction, then an optional article.
const CONNECTOR = /^[a-záéíóöőúüű]{0,8}\s*(?:,|,?\s*(?:és|vagy|illetve|valamint|ill\.|meg)|\s[–-]|\/)\s*(?:az?\s)?\s*$/i
const INDEX_ONLY = /^(?:\{the\(target\.index\)\} )?\[?\{target\.index\}\]?$|^(?:\{the\(target\.parent\.index\)\} )?\[?\{target\.parent\.index\} \{capital\(target\.parent\.label\.canonical\)\} \{target\.index\}\]?$/
const norm = (d) => String(d ?? '').replace(/\s*,\s*/g, ', ').trim()

const files = []
;(function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (/\.ya?ml$/.test(e.name)) files.push(p) } })(root)

function inlineStrings(o, out, top = true) {
  if (typeof o === 'string') out.push(o)
  else if (Array.isArray(o)) o.forEach((x) => inlineStrings(x, out, false))
  else if (o && typeof o === 'object') {
    if (!top && o.references && !Array.isArray(o.references)) return
    for (const [k, v] of Object.entries(o)) {
      if (['references', 'terms', 'formula', 'src', 'target', 'slug', 'name'].includes(k)) continue
      if ((k === 'content' && o.type === 'formula') || (k === 'rows' && o.type === 'typewriter')) continue
      inlineStrings(v, out, false)
    }
  }
}

// Position of every target in reading order, and the label variant of every entity,
// so each place can be checked against what a list template does: sort the targets
// by position, then group them.
const load = (f) => yaml.load(fs.readFileSync(f, 'utf8'))
const variantOf = new Map(), claimsOf = new Map(), position = new Map()
for (const f of files) {
  const y = load(f)
  if (!y || !['definition', 'theorem', 'proof', 'remark'].includes(y.type)) continue
  const fqn = y.type + 's.' + y.name
  if (y.type === 'definition' || y.type === 'theorem') variantOf.set(fqn, y.label ?? y.type)
  claimsOf.set(fqn, (y.body ?? []).filter((b) => b.type === 'claim').map((b) => b.name))
}
{
  let n = 0
  const embeds = (blocks) => { for (const b of blocks ?? []) { if (b.type === 'embed' && !position.has(b.target)) position.set(b.target, ++n); if (b.blocks) embeds(b.blocks) } }
  const chapterFiles = files.filter((f) => path.basename(f) === 'chapter.yaml').sort()
  for (const cf of chapterFiles) {
    const ch = load(cf), dir = path.dirname(cf), book = path.relative(root, dir).split(path.sep)[1]
    const chFqn = `books.${book}.chapters.${ch.name}`
    position.set(chFqn, ++n); embeds(ch.prologue)
    for (const sf of files.filter((f) => path.dirname(f) === dir && f !== cf).sort()) {
      const sec = load(sf); position.set(`${chFqn}.sections.${sec.name}`, ++n); embeds(sec.body)
    }
    embeds(ch.epilogue)
  }
}
const positionOf = (m) => {
  if (m.kind !== 'claim') return position.get(m.target)
  const [parent, claim] = m.target.split('.claims.')
  const p = position.get(parent), i = (claimsOf.get(parent) ?? []).indexOf(claim)
  return p === undefined || i < 0 ? undefined : p + (i + 1) / 1000
}
const groupKeyOf = (m) => (m.kind === 'claim' ? m.target.split('.claims.')[0] : m.kind === 'definition' || m.kind === 'theorem' ? `${m.kind}/${variantOf.get(m.target)}` : m.kind)

const places = []
function scanOwner(o, file) {
  if (!o || typeof o !== 'object') return
  if (o.references && typeof o.references === 'object' && !Array.isArray(o.references)) {
    const strings = []; inlineStrings(o, strings)
    for (const raw of strings) {
      const text = raw.replace(/\$[^$]+\$/g, (m) => '$' + '·'.repeat(m.length - 2) + '$')
      const toks = [...text.matchAll(TOKEN)].filter((m) => o.references[m[1]]).map((m) => {
        const e = o.references[m[1]]
        return { key: m[1], start: m.index, end: m.index + m[0].length, kind: kindOf(String(e.target)), display: norm(e.display), target: String(e.target) }
      })
      let i = 0
      while (i < toks.length) {
        let j = i; const seps = []; let loose = false
        while (j + 1 < toks.length) {
          const gap = text.slice(toks[j].end, toks[j + 1].start)
          const strict = CONNECTOR.test(gap)
          const weak = !strict && gap.length <= 40 && !/[.!?;:]/.test(gap) && INDEX_ONLY.test(toks[j].display) && IN_SCOPE.has(toks[j].kind) && toks[j + 1].kind === toks[j].kind
          if (!strict && !weak) break
          if (weak) loose = true
          seps.push(gap); j++
        }
        if (j > i) {
          const members = toks.slice(i, j + 1)
          const kinds = members.map((m) => m.kind)
          const scope = kinds.every((k) => IN_SCOPE.has(k)) ? 'in-scope' : kinds.some((k) => IN_SCOPE.has(k)) ? 'mixed-scope' : 'out-of-scope'
          const after = raw.slice(members.at(-1).end, members.at(-1).end + 30).split(/[.!?;:,\n]/)[0]
          const mids = members.slice(1, -1).map((m) => m.display), midSeps = seps.slice(0, -1)
          const regular = new Set(mids).size <= 1 && new Set(midSeps.map((s) => s.trim())).size <= 1
          const pos = members.map(positionOf)
          const ordered = pos.some((x) => x === undefined) ? null : pos.every((x, k) => k === 0 || pos[k - 1] <= x)
          const keys = members.map(groupKeyOf)
          const groups = [...new Set(keys)]
          const allClaims = kinds.every((k) => k === 'claim'), types = new Set(kinds)
          const grouping = groups.length === 1 ? (allClaims ? 'one parent' : 'flat') : allClaims ? 'group-by parent' : types.size > 1 && !kinds.includes('claim') && new Set(keys.map((k) => k.split('/')[0])).size === groups.length ? 'group-by type' : kinds.includes('claim') ? 'mixed claim and entity' : 'group-by label'
          // Grouping keeps each group together, so a list whose groups interleave is reordered.
          const interleaved = keys.some((k, x) => x > 0 && k !== keys[x - 1] && keys.slice(0, x - 1).includes(k))
          const ending = (raw.slice(members.at(-1).end).match(/^[a-záéíóöőúüű]+/i) ?? [''])[0]
          places.push({
            grouping, groups: groups.length, ordered, interleaved, ending,
            file: path.relative(root, file), scope, match: loose ? 'loose' : 'strict', count: members.length,
            kinds: [...new Set(kinds)].sort().join('+'), regular,
            source: raw.slice(members[0].start, members.at(-1).end), after,
            first: members[0].display, middle: mids[0] ?? null, last: members.at(-1).display,
            separator: midSeps[0] ?? null, lastSeparator: seps.at(-1),
            members: members.map((m) => ({ key: m.key, kind: m.kind, display: m.display, target: m.target })),
          })
        }
        i = j + 1
      }
    }
  }
  for (const [k, v] of Object.entries(o)) {
    if (k === 'references') continue
    if (Array.isArray(v)) v.forEach((x) => scanOwner(x, file)); else if (v && typeof v === 'object') scanOwner(v, file)
  }
}
for (const f of files) scanOwner(yaml.load(fs.readFileSync(f, 'utf8')), f)

fs.writeFileSync(path.join(__dirname, 'places.json'), JSON.stringify(places, null, 1) + '\n')

const inScope = places.filter((p) => p.scope === 'in-scope')
const count = (arr, f) => arr.reduce((a, x) => ((a[f(x)] = (a[f(x)] ?? 0) + 1), a), {})
const shapes = new Map()
for (const p of inScope) {
  const sig = JSON.stringify([p.kinds, p.first, p.middle, p.last, (p.separator ?? '').trim(), p.lastSeparator.trim(), p.regular])
  const s = shapes.get(sig) ?? { n: 0, counts: new Set(), example: p, kinds: p.kinds }
  s.n++; s.counts.add(p.count); shapes.set(sig, s)
}
const md = []
md.push('# Hand-chained reference lists', '', 'Generated by `collect.cjs`. Every place is in `places.json`.', '')
md.push('| Scope | Strict | Loose |', '|---|---|---|')
for (const s of ['in-scope', 'mixed-scope', 'out-of-scope']) md.push(`| ${s} | ${places.filter((p) => p.scope === s && p.match === 'strict').length} | ${places.filter((p) => p.scope === s && p.match === 'loose').length} |`)
md.push('', `In-scope places by member count: ${JSON.stringify(count(inScope, (p) => p.count))}`, `In-scope places by kinds: ${JSON.stringify(count(inScope, (p) => p.kinds))}`, `Irregular in-scope places: ${inScope.filter((p) => !p.regular).length}`, '')
md.push('## What the list templates have to handle (in scope)', '')
md.push('A list template sorts its targets by position and can group them. Each place is checked against that.', '')
md.push('| Grouping the place needs | Places |', '|---|---|')
for (const [k, v] of Object.entries(count(inScope, (p) => p.grouping)).sort((a, b) => b[1] - a[1])) md.push(`| ${k} | ${v} |`)
md.push('', '| Authored order | Places |', '|---|---|', `| ascending by position | ${inScope.filter((p) => p.ordered === true).length} |`, `| not ascending, so sorting would change the text | ${inScope.filter((p) => p.ordered === false).length} |`, `| unknown (a target is not embedded in a chapter) | ${inScope.filter((p) => p.ordered === null).length} |`, `| groups interleave, so grouping would reorder | ${inScope.filter((p) => p.interleaved).length} |`, '')
md.push('| Case ending glued after the list in the body | Places |', '|---|---|')
for (const [k, v] of Object.entries(count(inScope, (p) => p.ending || '(none)')).sort((a, b) => b[1] - a[1])) md.push(`| ${k} | ${v} |`)
md.push('', '### Places that are not ascending, or need grouping', '', '| File | Grouping | Ordered | Source |', '|---|---|---|---|')
for (const p of inScope.filter((p) => p.ordered === false || p.groups > 1)) md.push(`| ${p.file.split('/').slice(-2).join('/')} | ${p.grouping} | ${p.ordered} | \`${p.source.replace(/\|/g, '\\|').replace(/\n/g, ' ')}\` |`)
md.push('')
md.push('## Shapes (in scope)', '', `${shapes.size} distinct shapes. A shape is the kinds, the first, middle and last display, and the separators.`, '')
md.push('| Places | Counts | Kinds | First | Middle | Last | Separator | Last separator | Example | Following text (example) |', '|---|---|---|---|---|---|---|---|---|---|')
const cell = (s) => (s == null || s === '' ? '' : '`' + String(s).replace(/\|/g, '\\|').replace(/\n/g, ' ') + '`')
for (const s of [...shapes.values()].sort((a, b) => b.n - a.n)) {
  const e = s.example
  md.push(`| ${s.n} | ${[...s.counts].sort().join(', ')} | ${s.kinds} | ${cell(e.first)} | ${cell(e.middle)} | ${cell(e.last)} | ${cell(e.separator)} | ${cell(e.lastSeparator)} | ${cell(e.source)} | ${cell(e.after)} |`)
}
fs.writeFileSync(path.join(__dirname, 'summary.md'), md.join('\n') + '\n')
console.log(md.slice(0, 12).join('\n')); console.log('shapes', shapes.size, 'covering', inScope.length)
const top = [...shapes.values()].sort((a, b) => b.n - a.n)
console.log('shapes with >=3 places:', top.filter((s) => s.n >= 3).length, 'covering', top.filter((s) => s.n >= 3).reduce((a, s) => a + s.n, 0))
console.log('shapes with 1 place:', top.filter((s) => s.n === 1).length)
