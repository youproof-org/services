/**
 * Id and single-purpose token generation. Tokens are unguessable random
 * strings stored on the subscription row; "verification" is a constant-time
 * comparison against the stored value (see verifyToken). No signing/HMAC is
 * needed because the tokens are never derived from data — they are opaque
 * capabilities looked up in D1.
 *
 * Self-contained (Web Crypto only) so it can be unit-tested by importing the
 * .ts directly under Node's native type stripping.
 */

/** Subscription primary key. */
export function newId(): string {
  return crypto.randomUUID();
}

/**
 * A URL-safe, unguessable token. 32 random bytes → base64url (43 chars, 256
 * bits of entropy). Used for the confirm link and the unsubscribe link.
 */
export function newToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return base64url(bytes);
}

/**
 * Constant-time string comparison so token checks don't leak length/prefix via
 * timing. Both must be non-empty and equal length to match.
 */
export function verifyToken(provided: string | null, expected: string | null): boolean {
  if (!provided || !expected) return false;
  if (provided.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < provided.length; i++) {
    diff |= provided.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}

function base64url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
