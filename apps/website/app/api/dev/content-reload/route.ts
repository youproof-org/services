import { readReloadSignal } from '@/lib/content/reload-signal'

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
