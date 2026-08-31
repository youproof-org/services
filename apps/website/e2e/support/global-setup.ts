import { execFileSync } from 'node:child_process'
import path from 'node:path'

/**
 * Derives the suite's expected values from the content graph before any spec runs.
 *
 * Spawned rather than imported: the graph is TypeScript that imports `server-only`,
 * a specifier only a bundler resolves, so reaching it needs the same tsx + shim
 * entry `pnpm test` uses. Playwright's own transform has neither.
 *
 * Its stderr is held back and only shown when it fails — loading the graph prints a
 * warning per unpublished cross-reference, which is build noise, not test output.
 */
export default function globalSetup(): void {
  try {
    execFileSync(
      process.execPath,
      ['--import', 'tsx', '--import', './test/support/register.mjs', 'e2e/support/derive-fixtures.mjs'],
      { cwd: path.join(__dirname, '..', '..'), stdio: ['ignore', 'inherit', 'pipe'] },
    )
  } catch (error) {
    const stderr = (error as { stderr?: Buffer }).stderr?.toString() ?? ''
    throw new Error(`could not derive the browser suite's fixtures from the content graph.\n\n${stderr}`)
  }
}
