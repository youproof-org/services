export async function register() {
  // Only run in the Node.js runtime (not Edge)
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { initContentGraph, invalidateContentGraph } = await import('./lib/content')
    // Always rebuild from YAML on startup so changes made while the server
    // was down are never served from a stale file cache.
    invalidateContentGraph()
    await initContentGraph()

    if (process.env.NODE_ENV === 'development') {
      const chokidar = await import('chokidar')
      const { getContentDir } = await import('./lib/content/loader')
      const { writeReloadSignal } = await import('./lib/content/reload-signal')
      const contentDir = getContentDir()

      let debounce: ReturnType<typeof setTimeout> | null = null

      chokidar
        .watch(contentDir, { ignoreInitial: true, persistent: true })
        .on('all', (_event, filePath) => {
          if (!filePath.endsWith('.yaml')) return
          if (debounce) clearTimeout(debounce)
          debounce = setTimeout(async () => {
            invalidateContentGraph()
            await initContentGraph()
            writeReloadSignal()
          }, 150)
        })
    }
  }
}
