import { route } from "./router";
import { json } from "./lib/http";
import type { Env } from "./types";

/**
 * youproof.org newsletter subscription Worker.
 *
 * Bound to `<site_host>/api/v1/newsletter/*` on the .org zone (the first worker
 * route on that zone — everything else is served static from R2). Owns all
 * subscription state in D1 and implements double opt-in itself; Brevo is used
 * only to send email and to report delivery/bounce/spam via webhooks.
 *
 * See docs/newsletter.md for the full architecture and verification checklist.
 */
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    try {
      return await route(request, env, url);
    } catch (err) {
      // Never leak internals; log for observability (Workers logs), return a
      // generic 500 so the frontend can show a safe error state.
      console.error("newsletter-worker unhandled error", err);
      return json({ code: "internal_error" }, 500);
    }
  },
} satisfies ExportedHandler<Env>;
