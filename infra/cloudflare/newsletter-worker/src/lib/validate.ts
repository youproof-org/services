/**
 * Input validation + normalization for the subscribe endpoint. The server never
 * trusts client-side validation. Self-contained (no runtime imports) so it can
 * be unit-tested by importing the .ts directly under Node's native type
 * stripping.
 */

export interface SubscribeInput {
  name: string;
  email: string;
  locale: string;
  privacyAccepted: boolean;
  sourcePage: string;
  sourceFormInstance: string;
  /** Turnstile token; presence is checked here, verified server-side in Phase 4. */
  turnstileToken: string;
}

export type ValidationResult =
  | { ok: true; value: SubscribeInput }
  | { ok: false; errors: string[] };

const MAX_NAME = 200;
const MAX_EMAIL = 320; // RFC 5321 max
const MAX_PATH = 2048;

// Pragmatic email check: exactly one @, non-empty local part, a dotted domain,
// no whitespace. Deliverability is validated for real by the double opt-in.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Trim + lowercase; the canonical form used as the D1 upsert key. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isValidEmail(email: string): boolean {
  return email.length > 0 && email.length <= MAX_EMAIL && EMAIL_RE.test(email);
}

/**
 * A source path must be a site-relative absolute path (leading slash, no
 * scheme/host) so a confirmation redirect built from it can't be turned into an
 * open redirect to another origin.
 */
export function isSafeRelativePath(path: string): boolean {
  return (
    typeof path === "string" &&
    path.length > 0 &&
    path.length <= MAX_PATH &&
    path.startsWith("/") &&
    !path.startsWith("//") &&
    !path.includes("\\") &&
    !/[\x00-\x1f]/.test(path)
  );
}

function asString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

/** Validate and normalize a parsed JSON subscribe body. */
export function validateSubscribeBody(body: unknown): ValidationResult {
  const errors: string[] = [];
  const b = (body ?? {}) as Record<string, unknown>;

  const name = asString(b.name).trim();
  if (name.length === 0) errors.push("name_required");
  else if (name.length > MAX_NAME) errors.push("name_too_long");

  const email = normalizeEmail(asString(b.email));
  if (!isValidEmail(email)) errors.push("email_invalid");

  const privacyAccepted = b.privacyAccepted === true;
  if (!privacyAccepted) errors.push("privacy_not_accepted");

  const locale = asString(b.locale).trim();
  if (locale.length === 0 || !/^[a-z]{2}(-[a-z]{2})?$/i.test(locale)) {
    errors.push("locale_invalid");
  }

  const sourcePage = asString(b.sourcePage).trim();
  if (!isSafeRelativePath(sourcePage)) errors.push("source_page_invalid");

  const sourceFormInstance = asString(b.sourceFormInstance).trim();
  if (sourceFormInstance.length === 0 || sourceFormInstance.length > MAX_PATH) {
    errors.push("source_form_instance_invalid");
  }

  const turnstileToken = asString(b.turnstileToken).trim();
  if (turnstileToken.length === 0) errors.push("turnstile_missing");

  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: {
      name,
      email,
      locale,
      privacyAccepted,
      sourcePage,
      sourceFormInstance,
      turnstileToken,
    },
  };
}

// --- legacy re-permission campaign ---

export interface LegacyResubscribeInput {
  name: string;
  privacyAccepted: boolean;
  token: string;
}

export type LegacyResubscribeResult =
  | { ok: true; value: LegacyResubscribeInput }
  | { ok: false; errors: string[] };

/**
 * Validate the popup body for a legacy re-subscription.
 *
 * Deliberately smaller than validateSubscribeBody: the email comes from the
 * legacy_contacts row (never the client), the locale likewise, and there is no
 * Turnstile because the invite token already proves control of the mailbox.
 * Error codes are reused verbatim so the frontend can share its copy.
 */
export function validateLegacyResubscribeBody(body: unknown): LegacyResubscribeResult {
  const errors: string[] = [];
  const b = (body ?? {}) as Record<string, unknown>;

  const name = asString(b.name).trim();
  if (name.length === 0) errors.push("name_required");
  else if (name.length > MAX_NAME) errors.push("name_too_long");

  const privacyAccepted = b.privacyAccepted === true;
  if (!privacyAccepted) errors.push("privacy_not_accepted");

  const token = asString(b.token).trim();
  if (token.length === 0) errors.push("token_missing");

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, value: { name, privacyAccepted, token } };
}
