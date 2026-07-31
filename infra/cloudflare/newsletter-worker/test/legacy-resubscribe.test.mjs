// The landing + conversion half of the legacy re-permission campaign.
//
// Two invariants matter most here and are asserted explicitly:
//   1. The GET writes NOTHING (mail scanners and click trackers prefetch it).
//   2. Converting is idempotent, because the row is marked rather than deleted.
import assert from "node:assert/strict";
import { test, beforeEach, afterEach } from "node:test";
import {
  handleLegacyLanding,
  handleLegacyResubscribe,
} from "../src/handlers/legacy.ts";
import {
  confirmSubscription,
  getSubscriptionByEmail,
  subscribeUpsert,
  unsubscribeSubscription,
  upsertSuppression,
} from "../src/lib/db.ts";
import { FakeD1, makeDeps } from "./helpers/fake-d1.mjs";

let contactsResponder;
let calls;
const originalFetch = globalThis.fetch;
beforeEach(() => {
  calls = [];
  contactsResponder = () => new Response(JSON.stringify({ id: 1 }), { status: 201 });
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), method: init?.method, body: init?.body });
    if (String(url).includes("/contacts")) return contactsResponder();
    return new Response(JSON.stringify({ id: 1 }), { status: 200 });
  };
});
afterEach(() => {
  globalThis.fetch = originalFetch;
});

const env = (db) => ({
  DB: db,
  ALLOWED_ORIGINS: "https://youproof.org",
  BREVO_API_KEY: "k",
  BREVO_LIST_ID: "7",
  BREVO_SENDER_EMAIL: "s@x",
  SITE_HOST: "youproof.org",
  DEFAULT_LOCALE: "hu",
});

/** An invited legacy contact, as the cron would have left it. */
function seedInvited(db, email = "regi@example.com") {
  return db.seedLegacy({
    email,
    status: "invited",
    invite_token: "invtok",
    invited_at: "2026-07-20T00:00:00.000Z",
    send_attempts: 1,
  });
}

const get = (id, token) =>
  new Request(
    `https://youproof.org/api/v1/newsletter/legacy/${id}/resubscribe?token=${token}`,
  );

const post = (id, body, origin = "https://youproof.org") =>
  new Request(`https://youproof.org/api/v1/newsletter/legacy/${id}/resubscribe`, {
    method: "POST",
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify(body),
  });

const validBody = { token: "invtok", name: "Anna", privacyAccepted: true };

const call = (h, req, db, id) => h(req, env(db), new URL(req.url), id);

/** Contact upserts only — upsertContact also GETs /contacts/lists/{id} first. */
const contactUpserts = () =>
  calls.filter((c) => c.method === "POST" && c.url.endsWith("/contacts"));

// --- the landing GET ---------------------------------------------------------

test("a valid invite link redirects to the locale homepage carrying id and token", async () => {
  const db = new FakeD1();
  const row = seedInvited(db);

  const res = await call(handleLegacyLanding, get(row.id, "invtok"), db, row.id);

  assert.equal(res.status, 302);
  const loc = new URL(res.headers.get("location"));
  assert.equal(loc.origin + loc.pathname, "https://youproof.org/hu");
  assert.equal(loc.searchParams.get("newsletter_legacy"), "1");
  assert.equal(loc.searchParams.get("lid"), row.id);
  assert.equal(loc.searchParams.get("ltok"), "invtok");
});

test("the landing GET is side-effect free, so a scanner prefetch costs nothing", async () => {
  const db = new FakeD1();
  const row = seedInvited(db);
  const before = JSON.stringify(db.legacy.get(row.id));

  await call(handleLegacyLanding, get(row.id, "invtok"), db, row.id);
  await call(handleLegacyLanding, get(row.id, "invtok"), db, row.id);

  assert.equal(
    JSON.stringify(db.legacy.get(row.id)),
    before,
    "row byte-identical after two prefetches — nothing minted, nothing consumed",
  );
  assert.equal(calls.length, 0, "and no outbound calls");
});

test("a bad or unknown token lands on the homepage with an invalid marker", async () => {
  const db = new FakeD1();
  const row = seedInvited(db);

  for (const [id, tok] of [
    [row.id, "wrong"],
    ["no-such-id", "invtok"],
  ]) {
    const res = await call(handleLegacyLanding, get(id, tok), db, id);
    assert.equal(res.status, 302);
    assert.equal(
      new URL(res.headers.get("location")).searchParams.get("newsletter_legacy"),
      "invalid",
    );
  }
});

test("a spent invite (already converted) no longer opens the form", async () => {
  const db = new FakeD1();
  const row = db.seedLegacy({ email: "regi@example.com", status: "converted" });

  const res = await call(handleLegacyLanding, get(row.id, "invtok"), db, row.id);

  assert.equal(
    new URL(res.headers.get("location")).searchParams.get("newsletter_legacy"),
    "invalid",
    "nulling invite_token on convert is what makes the link single-use",
  );
});

// --- the conversion POST -----------------------------------------------------

test("converts a legacy contact straight to a confirmed subscriber", async () => {
  const db = new FakeD1();
  const row = seedInvited(db);

  const res = await call(handleLegacyResubscribe, post(row.id, validBody), db, row.id);

  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { status: "confirmed" });

  const sub = await getSubscriptionByEmail(db, "regi@example.com");
  assert.equal(sub.status, "confirmed", "no second double opt-in — the link proved the mailbox");
  assert.equal(sub.name, "Anna");
  assert.equal(sub.confirmed_at !== null, true);
  assert.ok(sub.privacy_content_sha !== undefined, "consent recorded against a content SHA");
  assert.equal(sub.source_form_instance, "legacy-repermission", "traceable to the campaign");

  assert.equal(contactUpserts().length, 1, "synced to Brevo");

  const after = db.legacy.get(row.id);
  assert.equal(after.status, "converted");
  assert.equal(after.invite_token, null);
  assert.equal(after.subscription_id, sub.id);
});

test("a double submit is idempotent — the second still reports success", async () => {
  const db = new FakeD1();
  const row = seedInvited(db);

  const first = await call(handleLegacyResubscribe, post(row.id, validBody), db, row.id);
  const second = await call(handleLegacyResubscribe, post(row.id, validBody), db, row.id);

  assert.equal(first.status, 200);
  assert.equal(
    second.status,
    200,
    "marking (not deleting) the row is what avoids a 404 right after a success message",
  );
  assert.equal(db.rows.size, 1, "still exactly one subscription");
  assert.equal(contactUpserts().length, 1, "no duplicate sync");
});

test("an address that meanwhile subscribed normally converges instead of duplicating", async () => {
  const db = new FakeD1();
  const row = seedInvited(db);
  await subscribeUpsert(
    db,
    {
      name: "Régi",
      email: "regi@example.com",
      locale: "hu",
      sourcePage: "/hu",
      sourceFormInstance: "/hu#pre-footer",
    },
    "sha",
    makeDeps(),
  );

  const res = await call(handleLegacyResubscribe, post(row.id, validBody), db, row.id);

  assert.equal(res.status, 200);
  assert.equal(db.rows.size, 1);
  const sub = await getSubscriptionByEmail(db, "regi@example.com");
  assert.equal(sub.status, "confirmed", "their pending signup is completed, not duplicated");
  assert.equal(sub.name, "Anna", "the name from the popup wins");
});

test("an unsubscribed address is resurrected and confirmed on explicit request", async () => {
  const db = new FakeD1();
  const row = seedInvited(db);
  const created = await subscribeUpsert(
    db,
    {
      name: "Régi",
      email: "regi@example.com",
      locale: "hu",
      sourcePage: "/hu",
      sourceFormInstance: "/hu#pre-footer",
    },
    "sha",
    makeDeps(),
  );
  await confirmSubscription(db, created.subscription.id, "2026-07-01T00:00:00.000Z");
  await unsubscribeSubscription(db, created.subscription.id, "2026-07-02T00:00:00.000Z");

  const res = await call(handleLegacyResubscribe, post(row.id, validBody), db, row.id);

  assert.equal(res.status, 200);
  assert.equal((await getSubscriptionByEmail(db, "regi@example.com")).status, "confirmed");
});

test("a suppressed address is refused and the legacy row retired", async () => {
  const db = new FakeD1();
  const row = seedInvited(db);
  await upsertSuppression(db, "regi@example.com", "bounce", "2026-07-10T00:00:00.000Z");

  const res = await call(handleLegacyResubscribe, post(row.id, validBody), db, row.id);

  assert.equal(res.status, 409);
  assert.deepEqual(await res.json(), { code: "subscription_blocked" });
  assert.equal(db.rows.size, 0, "no subscription created");
  assert.equal(db.legacy.get(row.id).status, "declined", "and it leaves every worklist");
});

test("rejects a wrong token, an unknown id, and a declined row", async () => {
  const db = new FakeD1();
  const invited = seedInvited(db);
  const declined = db.seedLegacy({ email: "nem@example.com", status: "declined" });

  const cases = [
    [invited.id, { ...validBody, token: "wrong" }],
    ["no-such-id", validBody],
    [declined.id, validBody],
  ];
  for (const [id, body] of cases) {
    const res = await call(handleLegacyResubscribe, post(id, body), db, id);
    assert.equal(res.status, 404, `expected 404 for ${id}`);
  }
  assert.equal(db.rows.size, 0);
});

test("requires a name and an explicit privacy acceptance", async () => {
  const db = new FakeD1();
  const row = seedInvited(db);

  for (const [body, code] of [
    [{ ...validBody, name: "  " }, "name_required"],
    [{ ...validBody, privacyAccepted: false }, "privacy_not_accepted"],
    [{ ...validBody, token: "" }, "token_missing"],
  ]) {
    const res = await call(handleLegacyResubscribe, post(row.id, body), db, row.id);
    assert.equal(res.status, 400);
    assert.ok((await res.json()).errors.includes(code));
  }
  assert.equal(db.rows.size, 0, "nothing created by a rejected submission");
});

test("rejects a cross-origin post", async () => {
  const db = new FakeD1();
  const row = seedInvited(db);

  const res = await call(
    handleLegacyResubscribe,
    post(row.id, validBody, "https://evil.example"),
    db,
    row.id,
  );

  assert.equal(res.status, 403);
});

test("a failed Brevo sync still confirms the subscriber and leaves it to the reconciler", async () => {
  const db = new FakeD1();
  const row = seedInvited(db);
  contactsResponder = () => new Response("brevo down", { status: 500 });

  const res = await call(handleLegacyResubscribe, post(row.id, validBody), db, row.id);

  assert.equal(res.status, 200, "the user's outcome does not depend on Brevo");
  const sub = await getSubscriptionByEmail(db, "regi@example.com");
  assert.equal(sub.status, "confirmed");
  assert.equal(sub.brevo_synced_at, null, "left for the scheduled reconciliation");
  assert.equal(db.legacy.get(row.id).status, "converted");
});
