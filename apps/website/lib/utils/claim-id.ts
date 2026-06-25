export function claimId(name: string, parent: { type: string; namespace: string; name: string }): string {
  const json = JSON.stringify({
    type: 'claim',
    name,
    parent: { type: parent.type, namespace: parent.namespace, name: parent.name },
  })
  return btoa(json).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}
