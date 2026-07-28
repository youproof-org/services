import { handleSubscribe } from "./handlers/subscribe";
import { handleConfirm } from "./handlers/confirm";
import { handleUnsubscribe } from "./handlers/unsubscribe";
import { handleWebhook } from "./handlers/webhook";
import { json } from "./lib/http";
import type { Env } from "./types";

const API_PREFIX = "/api/v1/newsletter";

/**
 * Hand-rolled routing for the newsletter API (same plain-switch style as the
 * migration worker — no framework). All paths are under `/api/v1/newsletter/*`;
 * the Cloudflare route pattern (`<site_host>/api/v1/newsletter/*`) guarantees
 * only these reach the worker, everything else serves static from R2.
 */
export async function route(
  request: Request,
  env: Env,
  url: URL,
): Promise<Response> {
  const method = request.method.toUpperCase();
  // TEMPORARY WORKAROUND (YP-142): the youproof.org zone's `.html`-stripping
  // Transform Rule rewrites extensionless paths to "<path>.html" BEFORE this
  // Worker runs, so our API paths arrive as e.g.
  // `/api/v1/newsletter/subscriptions.html` and match no route (→ 404). Strip a
  // trailing `.html` to recover the real path. Safe: the Worker only serves
  // `/api/v1/newsletter/*` and never legitimately routes a `.html` path.
  //
  // This is a stopgap. The proper fix is to exclude `/api/` from the zone
  // transform (terraform/zone/transform.tf); once that ships to production,
  // REMOVE the `.replace(/\.html$/, "")` below. See docs/newsletter.md.
  const path = url.pathname.replace(/\/+$/, "").replace(/\.html$/, "");

  if (!path.startsWith(API_PREFIX)) {
    return json({ code: "not_found" }, 404);
  }
  const sub = path.slice(API_PREFIX.length); // e.g. "/subscriptions/{id}/confirm"

  // POST /subscriptions
  if (sub === "/subscriptions" && method === "POST") {
    return handleSubscribe(request, env, url);
  }

  // /subscriptions/{id}/confirm | /subscriptions/{id}/unsubscribe
  const detail = sub.match(/^\/subscriptions\/([^/]+)\/(confirm|unsubscribe)$/);
  if (detail) {
    const [, id, action] = detail;
    if (action === "confirm" && method === "GET") {
      return handleConfirm(request, env, url, id);
    }
    if (action === "unsubscribe" && ["GET", "POST", "DELETE"].includes(method)) {
      return handleUnsubscribe(request, env, url, id, method);
    }
    return json({ code: "method_not_allowed" }, 405);
  }

  // POST /webhooks/brevo
  if (sub === "/webhooks/brevo" && method === "POST") {
    return handleWebhook(request, env, url);
  }

  return json({ code: "not_found" }, 404);
}
