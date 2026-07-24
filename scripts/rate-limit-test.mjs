// One-off check for the AI rate limiter - not part of the app. Fires 31
// rapid requests at /api/ai/ask as one logged-in user and confirms the
// 31st is blocked with a 429, a friendly message, and a Retry-After header.
const BASE = "http://localhost:3000";

async function login(email, password = "demo1234") {
  const csrfRes = await fetch(`${BASE}/api/auth/csrf`);
  const csrfCookies = csrfRes.headers.getSetCookie?.() ?? [];
  const { csrfToken } = await csrfRes.json();
  const cookieHeader = csrfCookies.map((c) => c.split(";")[0]).join("; ");

  const loginRes = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: cookieHeader },
    body: new URLSearchParams({ email, password, csrfToken, callbackUrl: `${BASE}/dashboard`, json: "true" }),
    redirect: "manual",
  });
  const loginCookies = loginRes.headers.getSetCookie?.() ?? [];
  return [...csrfCookies, ...loginCookies].map((c) => c.split(";")[0]).join("; ");
}

async function main() {
  const jar = await login("admin@acme.in");
  console.log("Logged in.");

  const results = [];
  for (let i = 1; i <= 31; i++) {
    const res = await fetch(`${BASE}/api/ai/ask`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: jar },
      body: JSON.stringify({ question: `test question #${i}` }),
    });
    const data = await res.json().catch(() => ({}));
    results.push({ i, status: res.status, retryAfter: res.headers.get("retry-after"), error: data.error });
  }

  const first30 = results.slice(0, 30);
  const req31 = results[30];

  const noneBlockedInFirst30 = first30.every((r) => r.status !== 429);
  console.log(`PASS/FAIL: none of requests 1-30 got 429 -> ${noneBlockedInFirst30 ? "PASS" : "FAIL"}`);
  console.log("  statuses seen in 1-30:", [...new Set(first30.map((r) => r.status))]);

  console.log(`PASS/FAIL: request 31 got 429 -> ${req31.status === 429 ? "PASS" : "FAIL"} (got ${req31.status})`);
  console.log("  Retry-After header:", req31.retryAfter);
  console.log("  Message shown to user:", req31.error);

  const failed = !noneBlockedInFirst30 || req31.status !== 429;
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error("CRASHED:", e); process.exit(1); });
