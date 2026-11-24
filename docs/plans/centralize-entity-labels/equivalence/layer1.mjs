// node --import tsx --import ./test/support/register.mjs layer1.mjs <out.json>   (cwd: a website dir, CONTENT_DIR set)
import fs from 'node:fs'
import path from 'node:path'
const g = await import(path.resolve('lib/content/graph.ts')).then((m) => m.default ?? m)
const graph = g.buildGraphFromRaw(await g.loadRawGraphData())
const out = {}
const MAPS = ['books', 'parts', 'chapters', 'sections', 'definitions', 'theorems', 'proofs', 'remarks', 'articles', 'newsletters', 'pages', 'landings']
for (const map of MAPS) {
  for (const [id, node] of graph[map] ?? []) {
    for (const [key, ref] of Object.entries(node.references ?? {})) out[`ref ${map}:${node.name ?? id}#${key}`] = ref.display ?? null
  }
}
for (const node of g.kbNodes(graph)) {
  const id = `${node.type}:${node.name}`
  out[`kbNodeLabel ${id}`] = g.kbNodeLabel(graph, node)
  out[`kbNodeTitle ${id}`] = g.kbNodeTitle(graph, node)
  out[`kbEntityRowLines ${id}`] = g.kbEntityRowLines(graph, node)
}
const sorted = Object.fromEntries(Object.keys(out).sort().map((k) => [k, out[k]]))
fs.writeFileSync(process.argv[2], JSON.stringify(sorted, null, 1) + '\n')
console.log(`${Object.keys(sorted).length} entries`)
