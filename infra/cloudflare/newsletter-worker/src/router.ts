import { handleSubscribe } from "./handlers/subscribe";
import { handleConfirm } from "./handlers/confirm";
import {
  handleLegacyDecline,
  handleLegacyDeclineLanding,
  handleLegacyLanding,
  handleLegacyResubscribe,
} from "./handlers/legacy";
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
  const path = url.pathname.replace(/\/+$/, ""); // tolerate a trailing slash

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

  // /legacy/{id}/resubscribe | /legacy/{id}/decline — the one-shot re-permission
  // campaign for the defunct site's newsletter list. Both GETs are
  // read-only by design; see handlers/legacy.ts.
  const legacy = sub.match(/^\/legacy\/([^/]+)\/(resubscribe|decline)$/);
  if (legacy) {
    const [, id, action] = legacy;
    if (action === "resubscribe") {
      if (method === "GET") return handleLegacyLanding(request, env, url, id);
      if (method === "POST") return handleLegacyResubscribe(request, env, url, id);
    } else {
      if (method === "GET") return handleLegacyDeclineLanding(request, env, url, id);
      if (method === "POST" || method === "DELETE") {
        return handleLegacyDecline(request, env, url, id);
      }
    }
    return json({ code: "method_not_allowed" }, 405);
  }

  // POST /webhooks/brevo
  if (sub === "/webhooks/brevo" && method === "POST") {
    return handleWebhook(request, env, url);
  }

  return json({ code: "not_found" }, 404);
}
