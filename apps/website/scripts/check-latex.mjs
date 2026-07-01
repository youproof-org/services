#!/usr/bin/env node
/**
 * Checks that lualatex and dvisvgm are available in PATH.
 * Run as a postinstall hook so developers get an immediate, clear
 * message if the TeX Live toolchain is missing.
 */
import { execFileSync } from 'child_process'

function check(cmd) {
  try {
    execFileSync(cmd, ['--version'], { stdio: 'ignore' })
  } catch {
    console.error(`[check-latex] '${cmd}' not found — install TeX Live (https://tug.org/texlive/)`)
    process.exitCode = 1
  }
}

check('pdflatex')
check('dvisvgm')
