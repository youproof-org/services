// Regenerates content-checker.mjs from src/index.ts: pnpm --filter @youproof.org/content-checker generate
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const out = fileURLToPath(new URL('./content-checker.mjs', import.meta.url))

const HEADER = `// GENERATED FILE, DO NOT EDIT. Built from services' packages/content-checker/src/index.ts,
// packages/content-model, packages/display-templates, apps/website/lib/i18n/locales.json and
// js-yaml by packages/content-checker/build.mjs. Regenerate it with
//   pnpm --filter @youproof.org/content-checker generate
// and commit the result: CI fails when this file is out of date with its sources.
// The content repo's scripts/check-refs.mjs loads it.`

const result = await build({
  entryPoints: [fileURLToPath(new URL('./src/index.ts', import.meta.url))],
  absWorkingDir: fileURLToPath(new URL('.', import.meta.url)),
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  target: 'es2022',
  charset: 'utf8',
  legalComments: 'inline',
  banner: { js: HEADER },
  write: false,
  logLevel: 'warning',
})
writeFileSync(out, result.outputFiles[0].contents)
