import assert from "node:assert/strict";
import { test } from "node:test";
import {
  sendTransactionalEmail,
  upsertContact,
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

test("upsertContact sends updateEnabled + ext_id + FNAME + listIds", async () => {
  await withFetch(
    () => new Response(JSON.stringify({ id: 42 }), { status: 201 }),
    async (calls) => {
      await upsertContact(env, { email: "a@b.co", name: "Anna", extId: "sub-1" });
      const body = JSON.parse(calls[0].init.body);
      assert.equal(body.email, "a@b.co");
      assert.equal(body.ext_id, "sub-1");
      assert.equal(body.updateEnabled, true);
      assert.equal(body.attributes.FNAME, "Anna");
      assert.deepEqual(body.listIds, [7]);
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

test("classifyBrevoEvent normalizes casing/format", () => {
  assert.equal(classifyBrevoEvent("hard_bounce"), "bounce");
  assert.equal(classifyBrevoEvent("hardBounce"), "bounce");
  assert.equal(classifyBrevoEvent("spam"), "spam");
  assert.equal(classifyBrevoEvent("unsubscribed"), "unsubscribe");
  assert.equal(classifyBrevoEvent("soft_bounce"), "other");
  assert.equal(classifyBrevoEvent("delivered"), "other");
  assert.equal(classifyBrevoEvent("opened"), "other");
});
