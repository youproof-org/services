export function entityId(type: string, namespace: string, name: string): string {
  const json = JSON.stringify({ type, namespace, name })
  return btoa(json).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}
