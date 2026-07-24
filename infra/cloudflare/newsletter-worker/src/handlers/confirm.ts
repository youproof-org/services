import { json } from "../lib/http";
import type { Env } from "../types";

/**
 * GET /api/v1/newsletter/subscriptions/{id}/confirm?token=…
 *
 * Phase 2 will: verify the confirm token, mark the subscription confirmed, sync
 * the contact into the Brevo list, then 302-redirect back to the originating
 * page with `?newsletter_confirmed=<formInstanceId>&sid=<id>`.
 */
export async function handleConfirm(
  _request: Request,
  _env: Env,
  _url: URL,
  _id: string,
): Promise<Response> {
  return json({ code: "not_implemented" }, 501);
}
