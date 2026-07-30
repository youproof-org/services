// The opt-out half of the legacy re-permission campaign.
//
// The asymmetry pinned here is deliberate: GET only opens a confirmation dialog,
// POST/DELETE actually decline. A corporate mail scanner that follows every link
// in an inbox must not be able to opt someone out on their behalf — that would
// destroy a conversion silently and we would never know it happened.
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  handleLegacyDecline,
  handleLegacyDeclineLanding,
} from "../src/handlers/legacy.ts";
import { route } from "../src/router.ts";
import { FakeD1 } from "./helpers/fake-d1.mjs";

const env = (db) => ({
  DB: db,
  ALLOWED_ORIGINS: "https://youproof.org",
  SITE_HOST: "youproof.org",
  DEFAULT_LOCALE: "hu",
});

function seedInvited(db) {
  return db.seedLegacy({
    email: "regi@example.com",
    status: "invited",
    invite_token: "invtok",
    invited_at: "2026-07-20T00:00:00.000Z",
    send_attempts: 1,
  });
}

const url = (id, token) =>
  `https://youproof.org/api/v1/newsletter/legacy/${id}/decline?token=${token}`;

const call = (h, req, db, id) => h(req, env(db), new URL(req.url), id);

test("GET only opens a confirmation dialog — it declines nothing", async () => {
  const db = new FakeD1();
  const row = seedInvited(db);
  const before = JSON.stringify(db.legacy.get(row.id));

  const res = await call(
    handleLegacyDeclineLanding,
    new Request(url(row.id, "invtok")),
    db,
    row.id,
  );

  assert.equal(res.status, 302);
  const loc = new URL(res.headers.get("location"));
  assert.equal(loc.searchParams.get("newsletter_legacy"), "decline");
  assert.equal(loc.searchParams.get("lid"), row.id);
  assert.equal(loc.searchParams.get("ltok"), "invtok");
  assert.equal(
    JSON.stringify(db.legacy.get(row.id)),
    before,
    "a scanner following this link must not opt the recipient out",
  );
});

test("POST declines and burns the token", async () => {
  const db = new FakeD1();
  const row = seedInvited(db);

  const res = await call(
    handleLegacyDecline,
    new Request(url(row.id, "invtok"), { method: "POST" }),
    db,
    row.id,
  );

  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { status: "declined" });
  const after = db.legacy.get(row.id);
  assert.equal(after.status, "declined");
  assert.equal(after.invite_token, null);
  assert.ok(after.responded_at);
});

test("DELETE declines too", async () => {
  const db = new FakeD1();
  const row = seedInvited(db);

  const res = await call(
    handleLegacyDecline,
    new Request(url(row.id, "invtok"), { method: "DELETE" }),
    db,
    row.id,
  );

  assert.equal(res.status, 200);
  assert.equal(db.legacy.get(row.id).status, "declined");
});

test("repeating a one-click decline succeeds rather than erroring", async () => {
  const db = new FakeD1();
  const row = seedInvited(db);
  const req = () => new Request(url(row.id, "invtok"), { method: "POST" });

  await call(handleLegacyDecline, req(), db, row.id);
  const second = await call(handleLegacyDecline, req(), db, row.id);

  assert.equal(second.status, 200, "one-click clients retry; a retry is not a failure");
  assert.deepEqual(await second.json(), { status: "declined" });
});

test("rejects a wrong token and an unknown id", async () => {
  const db = new FakeD1();
  const row = seedInvited(db);

  for (const [id, tok] of [
    [row.id, "wrong"],
    ["no-such-id", "invtok"],
  ]) {
    const res = await call(
      handleLegacyDecline,
      new Request(url(id, tok), { method: "POST" }),
      db,
      id,
    );
    assert.equal(res.status, 404);
  }
  assert.equal(db.legacy.get(row.id).status, "invited", "untouched");
});

// --- routing -----------------------------------------------------------------

test("the router wires both legacy paths and rejects other methods", async () => {
  const db = new FakeD1();
  const row = seedInvited(db);
  const hit = (path, method = "GET") => {
    const u = new URL(`https://youproof.org/api/v1/newsletter${path}`);
    return route(new Request(u, { method }), env(db), u);
  };

  assert.equal((await hit(`/legacy/${row.id}/resubscribe?token=invtok`)).status, 302);
  assert.equal((await hit(`/legacy/${row.id}/decline?token=invtok`)).status, 302);
  assert.equal(
    (await hit(`/legacy/${row.id}/decline?token=invtok`, "POST")).status,
    200,
  );
  assert.equal((await hit(`/legacy/${row.id}/resubscribe`, "DELETE")).status, 405);
  assert.equal((await hit(`/legacy/${row.id}/nonsense`)).status, 404);
});
