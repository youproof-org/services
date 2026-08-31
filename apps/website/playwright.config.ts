import { existsSync } from 'node:fs'
import path from 'node:path'
import { defineConfig, devices } from '@playwright/test'

/**
 * Browser tests for the parts of the site that only exist once JavaScript runs.
 *
 * Everything in `test/` is a `node:test` unit suite over pure modules; it can check
 * what a reducer decides but not that a click reaches it, that a history entry
 * survives Forward, or that a fixed layer is actually on top. This config exists
 * for those, and only those — the unit suites stay where they are and stay the
 * cheap, default `pnpm test`.
 *
 * ## Against the export, not the dev server
 *
 * `pnpm build` writes `out/`, and `out/` is literally what is uploaded. `next dev`
 * hydrates differently, injects an error overlay and compiles per request, so a
 * pass there is not evidence about production. `scripts/serve-out.mjs` puts the
 * export behind http and Playwright drives that.
 *
 * The export is NOT built here. It is minutes of work and hundreds of pages, and a
 * test command that silently triggers it is a test command nobody runs. Missing
 * `out/` is a hard, explained failure instead.
 */

// `__dirname`, not `import.meta.dirname`: Playwright compiles the config to CJS
// because this package is not `"type": "module"`, and `import.meta` is a syntax
// error there.
const OUT = path.join(__dirname, 'out')
const PORT = 4321
const BASE_URL = `http://127.0.0.1:${PORT}`

if (!existsSync(OUT)) {
  throw new Error(
    'apps/website/out/ does not exist. The browser tests run against the built static\n' +
      'export, so build it first:\n\n' +
      '    pnpm --filter @youproof.org/website build\n',
  )
}

export default defineConfig({
  testDir: './e2e',
  // Derives the expected row counts and fixture entities from the content graph, so
  // the suite passes against a local export and a deployed one — the two build
  // different page sets. See e2e/support/derive-fixtures.mjs.
  globalSetup: require.resolve('./e2e/support/global-setup'),
  // The repo names its suites `*.test.*`; there is no reason for these to be the
  // one exception.
  testMatch: '**/*.test.ts',
  fullyParallel: true,
  // A `test.only` left behind is a suite that silently stops checking things.
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
  },
  projects: [
    // Chromium only. The suite checks an interaction contract — history entries,
    // stacking order, hydration — not rendering; a second engine would triple the
    // browser download for evidence the site's own layout tests do not need.
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: `node scripts/serve-out.mjs ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    stdout: 'ignore',
    stderr: 'pipe',
  },
})
