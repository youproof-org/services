/**
 * Cloudflare Turnstile server-side verification. The frontend widget produces a
 * token; we verify it here against Turnstile's siteverify endpoint before
 * accepting a subscription. Together with the Origin check and rate limiting
 * this is the bot/abuse layer for the (session-less) subscribe endpoint.
 */
import type { Env } from "../types";

const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export async function verifyTurnstile(
  env: Env,
  token: string,
  remoteIp: string | null,
): Promise<boolean> {
  const form = new URLSearchParams();
  form.set("secret", env.TURNSTILE_SECRET);
  form.set("response", token);
  if (remoteIp) form.set("remoteip", remoteIp);

  try {
    const res = await fetch(SITEVERIFY_URL, { method: "POST", body: form });
    if (!res.ok) return false;
    const data = (await res.json()) as { success?: boolean };
    return data.success === true;
  } catch (err) {
    // A verification outage must fail closed (reject), never fail open.
    console.error("turnstile siteverify error", err);
    return false;
  }
}
