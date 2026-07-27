// Idempotent Brevo bootstrap for the newsletter worker. Run manually (or as a
// one-off ops step) per environment — there is no maintained Brevo Terraform
// provider (see docs/newsletter.md). It:
//   - ensures the FNAME contact attribute exists,
//   - ensures a newsletter list exists (prints its id → set BREVO_LIST_ID),
//   - registers the transactional webhook at the worker's /webhooks/brevo,
//   - sanity-checks that the sender email is a known Brevo sender.
//
// Required env: BREVO_API_KEY, SITE_HOST, BREVO_WEBHOOK_TOKEN, BREVO_SENDER_EMAIL
// Optional env: BREVO_LIST_NAME (default "youproof.org newsletter")
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
  BREVO_LIST_NAME = "youproof.org newsletter",
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

const WEBHOOK_EVENTS = [
  "delivered",
  "hardBounce",
  "softBounce",
  "spam",
  "unsubscribed",
  "blocked",
];

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

async function ensureWebhook() {
  const url = `https://${SITE_HOST}/api/v1/newsletter/webhooks/brevo?token=${encodeURIComponent(BREVO_WEBHOOK_TOKEN)}`;
  const existing = await api("GET", "/webhooks?type=transactional");
  const match = (existing.json?.webhooks ?? []).find((w) => w.url === url);
  if (match) {
    console.log(`• transactional webhook already registered (id=${match.id})`);
    return;
  }
  const created = await api("POST", "/webhooks", {
    type: "transactional",
    url,
    events: WEBHOOK_EVENTS,
    description: "youproof newsletter worker",
  });
  if (!created.ok) throw new Error(`create webhook failed: ${created.status} ${JSON.stringify(created.json)}`);
  console.log(`• transactional webhook registered (id=${created.json.id})`);
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
await ensureWebhook();
const listId = await ensureList();
console.log(`\nDone. Set BREVO_LIST_ID=${listId} for this environment.`);
