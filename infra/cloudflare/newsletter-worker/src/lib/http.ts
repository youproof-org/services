/** Small helpers for JSON + redirect responses from the worker. */

export function json(
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      // The subscribe endpoint is same-origin; keep responses uncacheable so a
      // pending/blocked state is never served stale from the edge.
      "cache-control": "no-store",
      ...headers,
    },
  });
}

/** 302 redirect to an absolute URL (used by confirm + unsubscribe landings). */
export function redirect(location: string): Response {
  return new Response(null, {
    status: 302,
    headers: { location, "cache-control": "no-store" },
  });
}
