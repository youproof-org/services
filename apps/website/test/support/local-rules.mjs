// Pins the unit suite to the LOCAL page-existence rules, loaded via `--import` from
// the `test` script only.
//
// The deploy job exports SITE_ENV for the build, and the unit-test step inherits it.
// `graph.ts` reads it once at module evaluation to choose between the local and the
// deployed rules, so an inherited value silently flips them under every test file
// that does not pin them — the suite then passes on a developer machine and fails in
// CI. Clearing it gives every file one baseline; kb-sections-deployed.test.mjs sets
// the variable in its own body, which runs after this preload, so it still gets the
// deployed rules.
//
// This is deliberately NOT in register.mjs: the browser suite's fixture derivation
// loads that same preload (e2e/support/global-setup.ts) and MUST see the real
// SITE_ENV, because it compares the graph against an out/ that was built with it.
delete process.env.SITE_ENV
