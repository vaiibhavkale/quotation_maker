// One-off e2e smoke test against a running `next start` on localhost:3000.
// Not part of the app - deleted after use. Exercises: login, new-module
// pages, cross-tenant RLS isolation on leads/projects/orders, and the
// deal-desk role gate on the quote detail page.
import postgres from "postgres";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(".env", "utf8").split("\n").filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; })
);
const sql = postgres(env.DIRECT_DATABASE_URL, { max: 1, prepare: false, ssl: "require" });

const BASE = "http://localhost:3000";
let failures = 0;
const ok = (cond, label) => { console.log(`${cond ? "PASS" : "FAIL"} - ${label}`); if (!cond) failures++; };

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
  const allCookies = [...csrfCookies, ...loginCookies].map((c) => c.split(";")[0]);
  const jar = allCookies.join("; ");
  const hasSession = allCookies.some((c) => /session-token/i.test(c));
  return { jar, hasSession, status: loginRes.status };
}

async function get(jar, path) {
  const res = await fetch(`${BASE}${path}`, { headers: { Cookie: jar }, redirect: "manual" });
  const text = res.status < 400 ? await res.text() : "";
  return { status: res.status, text };
}

async function main() {
  // - Reference data straight from the DB -
  const [acmeTenant] = await sql`select id from tenants where slug = 'acme'`;
  const [voltedgeTenant] = await sql`select id from tenants where slug = 'voltedge'`;
  const [acmeLead] = await sql`select id from leads where tenant_id = ${acmeTenant.id} limit 1`;
  const [acmeProject] = await sql`select id from projects where tenant_id = ${acmeTenant.id} limit 1`;
  const [acmeOrder] = await sql`select id from orders where tenant_id = ${acmeTenant.id} limit 1`;
  const [heldQuote] = await sql`
    select id, number from quotations
    where tenant_id = ${acmeTenant.id} and needs_approval = true and approved_by_id is null
      and status in ('shared','viewed','negotiation') limit 1`;

  console.log("Reference data:", {
    acmeLead: acmeLead?.id, acmeProject: acmeProject?.id, acmeOrder: acmeOrder?.id, heldQuote: heldQuote?.number,
  });

  // - 1. Login as acme partner_admin, hit every new module page -
  const admin = await login("admin@acme.in");
  ok(admin.hasSession, "acme admin login sets a session cookie");

  for (const path of ["/leads", "/projects", "/orders", "/team", "/audit", "/dashboard"]) {
    const r = await get(admin.jar, path);
    ok(r.status === 200, `acme admin GET ${path} → 200 (got ${r.status})`);
  }

  // - 2. Cross-tenant RLS isolation: voltedge admin must not see acme's rows -
  const voltedge = await login("admin@voltedge.in");
  ok(voltedge.hasSession, "voltedge admin login sets a session cookie");

  if (acmeLead) {
    const r = await get(voltedge.jar, `/leads/${acmeLead.id}`);
    ok(r.status === 404, `voltedge admin GET acme's /leads/${acmeLead.id} → 404 (got ${r.status})`);
  }
  if (acmeProject) {
    const r = await get(voltedge.jar, `/projects/${acmeProject.id}`);
    ok(r.status === 404, `voltedge admin GET acme's /projects/${acmeProject.id} → 404 (got ${r.status})`);
  }
  if (acmeOrder) {
    const r = await get(voltedge.jar, `/orders/${acmeOrder.id}`);
    // orders is a shared-visibility list for leadership but tenant users should
    // only see their own tenant's order the page renders the DB row regardless
    // of caller tenant only if RLS/ownership check passes - verify it 404s.
    ok(r.status === 404, `voltedge admin GET acme's /orders/${acmeOrder.id} → 404 (got ${r.status})`);
  }

  // - 3. Deal-desk role gate on the quote detail page -
  if (heldQuote) {
    const sales = await login("sales@acme.in");
    const salesView = await get(sales.jar, `/quotes/${heldQuote.id}`);
    ok(salesView.status === 200, `acme sales GET held quote ${heldQuote.number} → 200`);
    ok(!salesView.text.includes("Mark approved"), `acme sales (non-approver) does NOT see "Mark approved" on ${heldQuote.number}`);
    ok(salesView.text.includes("deal-desk"), `acme sales sees the deal-desk hold banner on ${heldQuote.number}`);

    const adminView = await get(admin.jar, `/quotes/${heldQuote.id}`);
    ok(adminView.text.includes("Mark approved"), `acme partner_admin (approver) DOES see "Mark approved" on ${heldQuote.number}`);
  } else {
    console.log("SKIP - no held (needs_approval) quote found in seed data for this check");
  }

  // - 4. CEO dashboard: leaderboard + employee drilldown -
  const ceo = await login("ceo@heseos.in");
  const dash = await get(ceo.jar, "/dashboard");
  ok(dash.status === 200, "CEO GET /dashboard → 200");
  ok(dash.text.includes("Top performers"), "CEO dashboard shows Top performers leaderboard");

  const drill = await get(ceo.jar, `/dashboard?tenant=${acmeTenant.id}&tenantName=Acme`);
  ok(drill.status === 200, "CEO GET /dashboard?tenant=<acme> (employee drilldown) → 200");
  ok(drill.text.includes("Team") || drill.text.includes("Drilldown"), "CEO employee-level drilldown renders");

  console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`}`);
  await sql.end();
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error("SMOKE TEST CRASHED:", e); process.exit(1); });
