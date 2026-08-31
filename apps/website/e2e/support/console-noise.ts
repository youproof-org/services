import type { Page } from '@playwright/test'

/**
 * Collects what the page's OWN code logs at error or warning level.
 *
 * Cross-origin messages are dropped. A deployed build bakes in a real Turnstile
 * sitekey, so the newsletter widget loads challenges.cloudflare.com — which, against
 * a 127.0.0.1 export, cannot match its allowed domain and logs a failed WebGPU probe
 * ("No available adapters."), a 400 and error 110200. None of that is the site's
 * doing, and none of it appears in a local build, which has no sitekey and so never
 * loads the widget at all: the assertion would otherwise pass on a developer machine
 * and fail in CI.
 *
 * A message with no location URL is kept — that is where an uncaught error from the
 * page's own scripts lands, which is exactly what these assertions exist to catch.
 */
export function collectConsoleNoise(page: Page): string[] {
  const noise: string[] = []
  page.on('console', (message) => {
    if (message.type() !== 'error' && message.type() !== 'warning') return
    const source = message.location().url
    if (source && !sameOrigin(source, page.url())) return
    noise.push(`${message.type()}: ${message.text()}`)
  })
  page.on('pageerror', (error) => noise.push(`pageerror: ${error.message}`))
  return noise
}

function sameOrigin(a: string, b: string): boolean {
  try {
    return new URL(a).origin === new URL(b).origin
  } catch {
    return true
  }
}
