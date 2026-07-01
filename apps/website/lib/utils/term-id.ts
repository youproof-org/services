export function termId(name: string, parent: { type: string; namespace: string; name: string }): string {
  const json = JSON.stringify({
    type: 'term',
    name,
    parent: { type: parent.type, namespace: parent.namespace, name: parent.name },
  })
  return btoa(json).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}
