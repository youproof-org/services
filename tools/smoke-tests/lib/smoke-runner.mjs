// Programmatic runner for the node:test smoke suites (tests/*.test.mjs), used by
// the quality gate to fold the smoke results into the JSON artifact.
//
// Uses the built-in node:test run() API (Node >= 18) rather than parsing a TAP
// stream: it yields structured events, so this stays zero-dependency and robust.
// Each test file runs in its own process (the default), so a file that throws on
// import (e.g. a missing required env var) surfaces as a single failed case named
// after the file rather than crashing the run.

import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { run } from "node:test";

/**
 * Run every tests/*.test.mjs and collect top-level cases.
 *
 * @param {object} [opts]
 * @param {string} [opts.testDir]  absolute path to the tests dir (default: ../tests)
 * @returns {Promise<{ total, passed, failed, skipped, cases: Array<{name,status,detail}> }>}
 */
export async function runSmoke({ testDir } = {}) {
  const dir = testDir ?? fileURLToPath(new URL("../tests/", import.meta.url));
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".test.mjs"))
    .sort()
    .map((f) => dir + f);

  const cases = [];
  for await (const event of run({ files })) {
    if (event.type !== "test:pass" && event.type !== "test:fail") continue;
    const d = event.data;
    // nesting === 0 is a top-level test() (or a whole file that failed to load);
    // deeper events are subtests already reflected in their parent's result.
    if (d.nesting !== 0) continue;

    let status;
    if (event.type === "test:fail") status = "fail";
    else if (d.skip) status = "skip";
    else if (d.todo) status = "todo";
    else status = "pass";

    let detail = "";
    if (status === "fail") {
      const err = d.details?.error;
      detail = (err?.cause?.message ?? err?.message ?? String(err ?? "")).split("\n")[0].slice(0, 300);
    } else if (status === "skip" && typeof d.skip === "string") {
      detail = d.skip;
    } else if (status === "todo" && typeof d.todo === "string") {
      detail = d.todo;
    }

    cases.push({ name: d.name, status, detail });
  }

  const passed = cases.filter((c) => c.status === "pass").length;
  const failed = cases.filter((c) => c.status === "fail").length;
  const skipped = cases.filter((c) => c.status === "skip" || c.status === "todo").length;
  return { total: cases.length, passed, failed, skipped, cases };
}
