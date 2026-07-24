/**
 * Environment bindings supplied per-deployment by Terraform (see
 * `infra/cloudflare/terraform/newsletter/worker.tf`). Production and staging are
 * two separate deployments of this same codebase with different values; nothing
 * about domains, keys, or list ids is hardcoded in source.
 */
export interface Env {
  /** D1 database holding subscriptions, suppression list, and the event log. */
  DB: D1Database;

  // --- secret_text bindings (never logged) ---
  /** Brevo REST API key, sent as the `api-key` header on Brevo calls. */
  BREVO_API_KEY: string;
  /**
   * Shared secret embedded in the Brevo webhook URL as `?token=`. Brevo offers
   * no HMAC signing for transactional webhooks, so this token (plus an optional
   * IP-range check) is how we authenticate inbound webhook POSTs.
   */
  BREVO_WEBHOOK_TOKEN: string;
  /** Cloudflare Turnstile secret key for server-side siteverify. */
  TURNSTILE_SECRET: string;

  // --- plain_text bindings ---
  /**
   * Commit SHA of the `youproof-org/content` repo this worker was built against
   * — the privacy-policy version a subscriber accepts. Also inlined into the
   * bundle via buildinfo.json; this binding is a belt-and-suspenders copy that
   * lets ops read the value without unbundling. See docs/newsletter.md.
   */
  CONTENT_SHA: string;
  /** Public site host for building confirm/redirect URLs, e.g. "youproof.org". */
  SITE_HOST: string;
  /** Default locale for the post-unsubscribe homepage redirect, e.g. "hu". */
  DEFAULT_LOCALE: string;
  /**
   * Comma-separated allowlist of acceptable Origin/Referer origins for the
   * subscribe POST, e.g. "https://youproof.org,https://www.youproof.org".
   */
  ALLOWED_ORIGINS: string;
  /** Brevo list id confirmed subscribers are synced into (as a string). */
  BREVO_LIST_ID: string;
  /** Verified Brevo sender email for the confirmation email. */
  BREVO_SENDER_EMAIL: string;
}

/** Subscription lifecycle status. See docs/newsletter.md and the D1 schema. */
export type SubscriptionStatus =
  | "pending"
  | "confirmed"
  | "unsubscribed"
  | "blocked";
