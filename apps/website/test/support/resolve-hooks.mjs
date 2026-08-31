// `server-only` is not a real installed package — Next resolves it at bundle time
// to enforce that a module never reaches the client. Anything importing the content
// graph therefore fails to resolve it under plain Node, so tests alias it to an
// empty module. The guard is a build-time concern; it has no runtime behaviour to
// preserve here.
export async function resolve(specifier, context, next) {
  if (specifier === 'server-only') {
    return { url: 'data:text/javascript,export{}', shortCircuit: true }
  }
  return next(specifier, context)
}
