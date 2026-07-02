// Shared config and HTTP helpers for the migration Worker smoke suite.
//
// Reads ONLY environment variables that already exist in the deploy pipeline
// (the same GitHub Environment vars Terraform consumes) — no new variables are
// introduced. Everything else (base URL, www host, mode) is derived.

function required(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`smoke-tests: required env var ${name} is not set`);
  }
  return value;
}

export const config = {
  // Public host the Worker is bound to, e.g. "staging.youproof.hu".
  workerDomain: required("WORKER_DOMAIN"),
  // Host migrated paths 301 to, e.g. "youproof.org".
  redirectTargetHost: process.env.REDIRECT_TARGET_HOST ?? "",
  // Legacy origin host. EMPTY => post-migration mode (Worker returns 410 for
  // unmigrated paths and there is no legacy origin to check).
  legacyProxyHost: process.env.LEGACY_PROXY_HOST ?? "",
  // "production" | "staging" (already set job-level in CI).
  environment: process.env.ENVIRONMENT ?? "",
};

export const baseUrl = `https://${config.workerDomain}`;
export const wwwHost = `www.${config.workerDomain}`;
export const isProduction = config.environment === "production";
// The absence of a legacy host mirrors the Worker's own pre/post-migration gate.
export const isPostMigration = config.legacyProxyHost === "";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Connection/TLS errors that can occur for a few seconds right after a deploy
// while the Cloudflare edge settles (mirrors the ~30s Universal-SSL propagation
// seen during staging validation). Retried so the blocking suite doesn't flake.
const TRANSIENT =
  /(ECONNRESET|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|UND_ERR|handshake|TLS|SSL|socket|fetch failed|abort|timeout)/i;
const RETRY_DELAYS_MS = [1000, 2000, 4000, 8000];
const DEFAULT_TIMEOUT_MS = 15000;

/**
 * fetch() with redirect following disabled by default (so 3xx + Location are
 * observable), a per-request timeout (no request can hang the run), and an
 * optional bounded retry on transient connection/TLS errors.
 *
 * @param {object} [opts]
 * @param {number} [opts.timeoutMs] per-attempt timeout (default 15s)
 * @param {number} [opts.retries]   transient-error retries (default full backoff;
 *   the crawler passes 0 so a dead link fails fast instead of retrying)
 */
export async function request(
  url,
  { method = "GET", redirect = "manual", headers, timeoutMs = DEFAULT_TIMEOUT_MS, retries = RETRY_DELAYS_MS.length } = {},
) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fetch(url, { method, redirect, headers, signal: AbortSignal.timeout(timeoutMs) });
    } catch (err) {
      lastErr = err;
      const reason = String(err?.cause?.code ?? err?.cause?.message ?? err?.message ?? err);
      if (attempt >= retries || !TRANSIENT.test(reason)) throw err;
      await sleep(RETRY_DELAYS_MS[Math.min(attempt, RETRY_DELAYS_MS.length - 1)]);
    }
  }
  throw lastErr;
}
