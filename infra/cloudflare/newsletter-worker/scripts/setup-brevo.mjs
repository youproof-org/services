// Idempotent Brevo bootstrap for the newsletter worker. Run manually (or as a
// one-off ops step) per environment — there is no maintained Brevo Terraform
// provider (see docs/newsletter.md). It:
//   - ensures the FNAME contact attribute exists,
//   - ensures a newsletter list exists (prints its id → set BREVO_LIST_ID),
//   - registers the transactional AND marketing webhooks at the worker's
//     /webhooks/brevo (campaign events, incl. footer-unsubscribe, only reach a
//     marketing webhook),
//   - sanity-checks that the sender email is a known Brevo sender.
//
// Required env: BREVO_API_KEY, SITE_HOST, BREVO_WEBHOOK_TOKEN, BREVO_SENDER_EMAIL
// Optional env: BREVO_LIST_NAME (default "<SITE_HOST> newsletter"),
//               BREVO_WEBHOOK_DESCRIPTION (default "<SITE_HOST> webhook")
//
// Usage:
//   BREVO_API_KEY=... SITE_HOST=staging.youproof.org BREVO_WEBHOOK_TOKEN=... \
//   BREVO_SENDER_EMAIL=hello@youproof.org node scripts/setup-brevo.mjs

const BASE = "https://api.brevo.com/v3";

const {
  BREVO_API_KEY,
  SITE_HOST,
  BREVO_WEBHOOK_TOKEN,
  BREVO_SENDER_EMAIL,
  BREVO_LIST_NAME = `${SITE_HOST} newsletter`,
  // Human-readable webhook description shown in the Brevo dashboard. Defaults to
  // include SITE_HOST so staging and production are distinguishable even when
  // sharing one Brevo account; override with BREVO_WEBHOOK_DESCRIPTION.
  BREVO_WEBHOOK_DESCRIPTION = `${SITE_HOST} webhook`,
} = process.env;

for (const [k, v] of Object.entries({
  BREVO_API_KEY,
  SITE_HOST,
  BREVO_WEBHOOK_TOKEN,
  BREVO_SENDER_EMAIL,
})) {
  if (!v) {
    console.error(`Missing required env: ${k}`);
    process.exit(1);
  }
}

// Brevo delivers events to SEPARATE webhooks per category: transactional
// (SMTP/API email) vs marketing (campaigns). A campaign send — including a
// subscriber clicking the campaign's footer unsubscribe — only reaches a
// `marketing` webhook, so we register both at the same endpoint. Event names
// are camelCase for BOTH types (per the create-webhook API reference); the two
// categories differ only in which events exist, not in casing. `blocked` is
// transactional-only; `unsubscribed`/`hardBounce`/`spam`/`delivered` are valid
// for both. The worker's classifyBrevoEvent normalizes regardless.
const TRANSACTIONAL_EVENTS = [
  "delivered",
  "hardBounce",
  "softBounce",
  "spam",
  "unsubscribed",
  "blocked",
];
const MARKETING_EVENTS = ["unsubscribed", "hardBounce", "spam", "delivered"];

async function api(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      "api-key": BREVO_API_KEY,
      "content-type": "application/json",
      accept: "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  return { ok: res.ok, status: res.status, json };
}

async function ensureAttribute() {
  const r = await api("POST", "/contacts/attributes/normal/FNAME", { type: "text" });
  if (r.ok) console.log("• FNAME attribute created");
  else if (r.status === 400) console.log("• FNAME attribute already exists");
  else console.warn(`! FNAME attribute: unexpected ${r.status}`, r.json);
}

async function ensureFolder() {
  const list = await api("GET", "/contacts/folders?limit=50&offset=0");
  const existing = list.json?.folders?.[0];
  if (existing) return existing.id;
  const created = await api("POST", "/contacts/folders", { name: "Newsletter" });
  if (!created.ok) throw new Error(`create folder failed: ${created.status}`);
  return created.json.id;
}

async function ensureList() {
  const list = await api("GET", "/contacts/lists?limit=50&offset=0");
  const found = (list.json?.lists ?? []).find((l) => l.name === BREVO_LIST_NAME);
  if (found) {
    console.log(`• list "${BREVO_LIST_NAME}" exists → BREVO_LIST_ID=${found.id}`);
    return found.id;
  }
  const folderId = await ensureFolder();
  const created = await api("POST", "/contacts/lists", { name: BREVO_LIST_NAME, folderId });
  if (!created.ok) throw new Error(`create list failed: ${created.status} ${JSON.stringify(created.json)}`);
  console.log(`• list "${BREVO_LIST_NAME}" created → BREVO_LIST_ID=${created.json.id}`);
  return created.json.id;
}

// Brevo's dashboard restricts the webhook name/description to alphanumerics,
// hyphens, and underscores (the API is laxer, but we conform so the value shows
// cleanly and is editable in the UI). Collapse any other run of characters —
// dots in the host, spaces, parentheses — to a single hyphen.
function sanitizeDescription(s) {
  return s.replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
}

async function ensureWebhook(type, events) {
  const url = `https://${SITE_HOST}/api/v1/newsletter/webhooks/brevo?token=${encodeURIComponent(BREVO_WEBHOOK_TOKEN)}`;
  const existing = await api("GET", `/webhooks?type=${type}`);
  const match = (existing.json?.webhooks ?? []).find((w) => w.url === url);
  if (match) {
    console.log(`• ${type} webhook already registered (id=${match.id})`);
    return;
  }
  const created = await api("POST", "/webhooks", {
    type,
    url,
    events,
    description: sanitizeDescription(`${BREVO_WEBHOOK_DESCRIPTION} ${type}`),
  });
  if (!created.ok) throw new Error(`create ${type} webhook failed: ${created.status} ${JSON.stringify(created.json)}`);
  console.log(`• ${type} webhook registered (id=${created.json.id})`);
}

async function checkSender() {
  const r = await api("GET", "/senders");
  const senders = r.json?.senders ?? [];
  const found = senders.find((s) => s.email?.toLowerCase() === BREVO_SENDER_EMAIL.toLowerCase());
  if (!found) {
    console.warn(
      `! sender ${BREVO_SENDER_EMAIL} not found in Brevo. Create + verify it (and authenticate the sending domain / DKIM) in the Brevo dashboard before sending.`,
    );
  } else if (found.active === false) {
    console.warn(`! sender ${BREVO_SENDER_EMAIL} exists but is not active/verified.`);
  } else {
    console.log(`• sender ${BREVO_SENDER_EMAIL} is present`);
  }
}

console.log(`Brevo setup for host ${SITE_HOST}`);
await ensureAttribute();
await checkSender();
await ensureWebhook("transactional", TRANSACTIONAL_EVENTS);
await ensureWebhook("marketing", MARKETING_EVENTS);
const listId = await ensureList();
console.log(`\nDone. Set BREVO_LIST_ID=${listId} for this environment.`);
