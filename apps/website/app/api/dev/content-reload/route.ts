import { readReloadSignal } from '@/lib/content/reload-signal'

// This SSE reload endpoint is dev-only. `output: export` requires every route
// handler to be declared static, so we mark it force-static. At production
// build time the GET below hits its `NODE_ENV !== 'development'` branch and
// returns a static 404, which the export accepts. In `next dev` the Full Route
// Cache is disabled, so the handler still runs live and streams per request.
export const dynamic = 'force-static'

export async function GET() {
  if (process.env.NODE_ENV !== 'development') {
    return new Response('Not found', { status: 404 })
  }

  let cleanup: (() => void) | undefined

  const stream = new ReadableStream({
    start(controller) {
      let lastSignal = readReloadSignal()

      const poll = setInterval(() => {
        const signal = readReloadSignal()
        if (signal !== lastSignal) {
          lastSignal = signal
          controller.enqueue('data: reload\n\n')
        }
      }, 500)

      const keepAlive = setInterval(() => {
        controller.enqueue(': ping\n\n')
      }, 15000)

      cleanup = () => {
        clearInterval(poll)
        clearInterval(keepAlive)
      }
    },
    cancel() {
      cleanup?.()
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}
