import assert from "node:assert/strict";
import { test } from "node:test";
import {
  sendTransactionalEmail,
  sendAdminAlert,
  upsertContact,
  setEmailBlacklisted,
  classifyBrevoEvent,
  BrevoError,
} from "../src/lib/brevo.ts";

const env = {
  BREVO_API_KEY: "key-123",
  BREVO_SENDER_EMAIL: "hello@youproof.org",
  BREVO_LIST_ID: "7",
};

/** Run `fn` with globalThis.fetch stubbed; capture the calls; always restore. */
async function withFetch(handler, fn) {
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    return handler(url, init);
  };
  try {
    await fn(calls);
  } finally {
    globalThis.fetch = original;
  }
}

test("sendTransactionalEmail posts to /smtp/email and returns messageId", async () => {
  await withFetch(
    () => new Response(JSON.stringify({ messageId: "<m1@relay>" }), { status: 201 }),
    async (calls) => {
      const r = await sendTransactionalEmail(env, {
        toEmail: "a@b.co",
        toName: "Anna",
        subject: "s",
        htmlContent: "<p>h</p>",
        textContent: "h",
        listUnsubscribeUrl: "https://youproof.org/api/v1/newsletter/subscriptions/x/unsubscribe?token=t",
      });
      assert.equal(r.messageId, "<m1@relay>");
      assert.equal(calls.length, 1);
      const { url, init } = calls[0];
      assert.equal(url, "https://api.brevo.com/v3/smtp/email");
      assert.equal(init.method, "POST");
      assert.equal(init.headers["api-key"], "key-123");
      const body = JSON.parse(init.body);
      assert.equal(body.sender.email, "hello@youproof.org");
      assert.equal(body.to[0].email, "a@b.co");
      assert.match(body.headers["List-Unsubscribe"], /^<https:\/\/youproof\.org/);
      assert.equal(body.headers["List-Unsubscribe-Post"], "List-Unsubscribe=One-Click");
    },
  );
});

test("sendTransactionalEmail throws BrevoError on non-2xx", async () => {
  await withFetch(
    () => new Response("nope", { status: 400 }),
    async () => {
      await assert.rejects(
        () =>
          sendTransactionalEmail(env, {
            toEmail: "a@b.co", toName: "A", subject: "s",
            htmlContent: "h", textContent: "h", listUnsubscribeUrl: "https://x/u",
          }),
        (err) => err instanceof BrevoError && err.status === 400,
      );
    },
  );
});

test("upsertContact verifies the list, then sends updateEnabled + ext_id + FNAME + listIds", async () => {
  await withFetch(
    () => new Response(JSON.stringify({ id: 42 }), { status: 200 }),
    async (calls) => {
      await upsertContact(env, { email: "a@b.co", name: "Anna", extId: "sub-1" });
      // list-existence GET precedes the contact POST
      assert.ok(
        calls.some((c) => /\/contacts\/lists\/7$/.test(c.url)),
        "checked the configured list exists",
      );
      const post = calls.find((c) => c.url.endsWith("/contacts") && c.init.method === "POST");
      const body = JSON.parse(post.init.body);
      assert.equal(body.email, "a@b.co");
      assert.equal(body.ext_id, "sub-1");
      assert.equal(body.updateEnabled, true);
      assert.equal(body.emailBlacklisted, false); // reactivate a re-confirmed resubscriber
      assert.equal(body.attributes.FNAME, "Anna");
      assert.deepEqual(body.listIds, [7]);
    },
  );
});

test("upsertContact throws (no silent success) when the configured list does not exist", async () => {
  await withFetch(
    (url) => new Response("no", { status: String(url).includes("/contacts/lists/") ? 404 : 201 }),
    async (calls) => {
      await assert.rejects(
        () => upsertContact(env, { email: "a@b.co", name: "A", extId: "s" }),
        (e) => e instanceof BrevoError && e.status === 404,
      );
      // failed at the list check — never POSTed the contact
      assert.ok(!calls.some((c) => c.url.endsWith("/contacts") && c.init.method === "POST"));
    },
  );
});

test("upsertContact omits listIds when no numeric list id is configured", async () => {
  await withFetch(
    () => new Response(null, { status: 204 }),
    async (calls) => {
      await upsertContact({ ...env, BREVO_LIST_ID: "" }, { email: "a@b.co", name: "A", extId: "s" });
      const body = JSON.parse(calls[0].init.body);
      assert.equal(body.listIds, undefined);
    },
  );
});

test("setEmailBlacklisted PUTs emailBlacklisted:true and tolerates 404", async () => {
  await withFetch(
    () => new Response(null, { status: 204 }),
    async (calls) => {
      await setEmailBlacklisted(env, "a@b.co");
      assert.equal(calls[0].init.method, "PUT");
      assert.match(calls[0].url, /\/contacts\/a%40b\.co$/);
      assert.equal(JSON.parse(calls[0].init.body).emailBlacklisted, true);
    },
  );
  // 404 (contact doesn't exist) must NOT throw — nothing to suppress.
  await withFetch(
    () => new Response("not found", { status: 404 }),
    async () => {
      await assert.doesNotReject(() => setEmailBlacklisted(env, "ghost@b.co"));
    },
  );
});

test("classifyBrevoEvent normalizes casing/format", () => {
  assert.equal(classifyBrevoEvent("hard_bounce"), "bounce");
  assert.equal(classifyBrevoEvent("hardBounce"), "bounce");
  assert.equal(classifyBrevoEvent("spam"), "spam");
  assert.equal(classifyBrevoEvent("unsubscribed"), "unsubscribe");
  assert.equal(classifyBrevoEvent("soft_bounce"), "other");
  assert.equal(classifyBrevoEvent("delivered"), "other");
  assert.equal(classifyBrevoEvent("opened"), "other");
});

// --- sender identity (BREVO_SENDER_NAME) ---
// One variable drives the From name on every outgoing email, so the
// transactional mail, the ops alerts and the legacy invite cannot drift apart.

test("uses BREVO_SENDER_NAME as the From name on transactional sends", async () => {
  let body;
  globalThis.fetch = async (_u, init) => {
    body = JSON.parse(init.body);
    return new Response(JSON.stringify({ messageId: "<m>" }), { status: 201 });
  };

  await sendTransactionalEmail(
    { BREVO_API_KEY: "k", BREVO_SENDER_EMAIL: "hello@youproof.org", BREVO_SENDER_NAME: "Teszt Elek" },
    { toEmail: "a@b.hu", subject: "s", htmlContent: "h", textContent: "t", listUnsubscribeUrl: "https://x/u" },
  );

  assert.equal(body.sender.name, "Teszt Elek");
  assert.equal(body.sender.email, "hello@youproof.org", "envelope address is unchanged");
});

test("uses the same name for operational alerts", async () => {
  let body;
  globalThis.fetch = async (_u, init) => {
    body = JSON.parse(init.body);
    return new Response(JSON.stringify({ messageId: "<m>" }), { status: 201 });
  };

  await sendAdminAlert(
    {
      BREVO_API_KEY: "k",
      BREVO_SENDER_EMAIL: "hello@youproof.org",
      BREVO_SENDER_NAME: "Teszt Elek",
      ALERT_EMAIL: "admin@youproof.org",
    },
    "subject",
    "text",
  );

  assert.equal(body.sender.name, "Teszt Elek");
});

test("falls back to SITE_HOST, then to the brand name, when BREVO_SENDER_NAME is blank", async () => {
  let body;
  globalThis.fetch = async (_u, init) => {
    body = JSON.parse(init.body);
    return new Response(JSON.stringify({ messageId: "<m>" }), { status: 201 });
  };
  const send = (env) =>
    sendTransactionalEmail(
      { BREVO_API_KEY: "k", BREVO_SENDER_EMAIL: "hello@youproof.org", ...env },
      {
        toEmail: "a@b.hu",
        subject: "s",
        htmlContent: "h",
        textContent: "t",
        listUnsubscribeUrl: "https://x/u",
      },
    );

  // An unset GitHub variable reaches Terraform as "", so blank must behave as
  // unset rather than producing an empty From name. Falling through to SITE_HOST
  // mirrors coalesce(var.brevo_sender_name, var.site_host) in worker.tf, so
  // staging mail can never claim to be production.
  await send({ SITE_HOST: "staging.youproof.org" });
  assert.equal(body.sender.name, "staging.youproof.org");
  await send({ BREVO_SENDER_NAME: "  ", SITE_HOST: "staging.youproof.org" });
  assert.equal(body.sender.name, "staging.youproof.org");

  // Neither bound (a local wrangler dev with no .dev.vars): never an empty name.
  await send({});
  assert.equal(body.sender.name, "youproof.org");
});

test("omits the recipient name when there isn't one", async () => {
  let body;
  globalThis.fetch = async (_u, init) => {
    body = JSON.parse(init.body);
    return new Response(JSON.stringify({ messageId: "<m>" }), { status: 201 });
  };

  await sendTransactionalEmail(
    { BREVO_API_KEY: "k", BREVO_SENDER_EMAIL: "hello@youproof.org" },
    { toEmail: "a@b.hu", subject: "s", htmlContent: "h", textContent: "t", listUnsubscribeUrl: "https://x/u" },
  );

  assert.deepEqual(body.to, [{ email: "a@b.hu" }], "no empty name key for the legacy list");
});
