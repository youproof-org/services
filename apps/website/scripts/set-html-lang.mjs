#!/usr/bin/env node
// Post-build fix: set a correct per-locale `<html lang>` on every exported page.
//
// WHY: with `output: 'export'` the root layout (app/layout.tsx) renders a single
// static `<html lang>` for ALL pages, because the App Router root <html> sits
// above the [locale] segment and can't read the route locale (and export has no
// middleware). So every page — including future /{en}/... pages — would ship the
// default locale's lang. This step rewrites `<html lang>` in the exported HTML to
// match each page's actual locale, derived from its output path.
//
// Runs as `postbuild` (part of `next build`). It is a NO-OP for the current
// single-locale (hu) output (hu pages already carry lang="hu"), so it ships
// safely now and becomes correct-by-construction the moment a second locale's
// content exists — nothing to remember. The independent guard
// (tools/smoke-tests/tests/html-lang.test.mjs) verifies the result and blocks the
// deploy if any page's lang is wrong.

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { join, relative, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const outDir = resolve(here, '..', 'out')
const localesPath = resolve(here, '..', 'lib', 'i18n', 'locales.json')

if (!existsSync(outDir)) {
  // No static export present (e.g. a non-export build) — nothing to do.
  console.log(`set-html-lang: no export dir at ${outDir} — skipping.`)
  process.exit(0)
}

const localesData = JSON.parse(readFileSync(localesPath, 'utf8'))
const locales = localesData.locales
const localeKeys = Object.keys(locales)
// Default locale: mirror config.ts (env override, else first configured locale).
const defaultLocale = process.env.DEFAULT_LOCALE?.trim() && locales[process.env.DEFAULT_LOCALE.trim()]
  ? process.env.DEFAULT_LOCALE.trim()
  : localeKeys[0]

// The `<html lang>` value for a page, from the first segment of its out/-relative
// path: a configured locale key → that locale's htmlLang; anything else (root
// index.html, 404.html, other non-locale routes) → the default locale's htmlLang.
function langForRelPath(relPath) {
  const segments = relPath.split('/')
  const first = segments.length === 1 ? segments[0].replace(/\.html$/, '') : segments[0]
  const key = localeKeys.includes(first) ? first : defaultLocale
  return locales[key].htmlLang
}

function walkHtml(dir, acc = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walkHtml(full, acc)
    else if (entry.endsWith('.html')) acc.push(full)
  }
  return acc
}

let rewritten = 0
let scanned = 0
for (const file of walkHtml(outDir)) {
  scanned++
  const html = readFileSync(file, 'utf8')
  const want = langForRelPath(relative(outDir, file).split('\\').join('/'))
  // Replace the lang attribute inside the first <html …> tag only.
  const next = html.replace(/(<html[^>]*\blang=")[^"]*(")/, `$1${want}$2`)
  if (next !== html) {
    writeFileSync(file, next)
    rewritten++
  }
}

console.log(`set-html-lang: scanned ${scanned} HTML file(s), rewrote lang on ${rewritten}.`)
