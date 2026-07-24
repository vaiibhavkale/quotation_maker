# HIQM - HESEOS Intelligent Quotation Maker

Multi-tenant, white-label quotation intelligence platform. Next.js 15 · PostgreSQL (Supabase) · Drizzle · Auth.js · @react-pdf/renderer · Groq AI.

## What's inside

| Capability | Where |
|---|---|
| Multi-tenancy with Postgres RLS (FORCE) | `src/db/migrations/0000_init.sql`, `src/db/index.ts` (`withTenant`) |
| White-label branding per partner | `/settings/branding`, applied to app shell, PDF, public quote page |
| 2-minute BOQ builder with live GST (CGST/SGST vs IGST) | `/quotes/new`, deterministic engine in `src/lib/gst.ts` |
| Per-tenant FY quote numbering (ACME/QT/2026-27/00042) | `src/app/actions/quotes.ts` |
| Lifecycle state machine + immutable revisions + diff | `src/lib/lifecycle.ts`, quote detail page |
| White-label PDF (<1s) + Excel export | `/quotes/[id]/pdf`, `/quotes/[id]/excel` |
| WhatsApp tracked sharing → auto "Viewed" flip | `/q/[token]` public page (DocSend-style) |
| Customer online acceptance (digital, timestamped) | `/q/[token]` Accept button |
| CEO Command Center: India → Zone → State → City → Org → **Employee** drilldown | `/dashboard` |
| PAN-India rep leaderboard (no drilling required) | `/dashboard`, `topPerformers()` in `src/lib/analytics.ts` |
| Quote Health Score (transparent rules, AI-ready) | `src/lib/health.ts` |
| Win Probability - stage-weighted, explainable (distinct from Health) | `src/lib/win-probability.ts`, quote detail page |
| Deal Desk - auto-flags deep-discount/high-value quotes, blocks Approve until an admin clears it | `src/lib/deal-desk.ts`, `transitionQuote()` |
| Full CRM lifecycle: Lead → Site Visit → Project → Quote → Order | `/leads`, `/projects`, `/orders` |
| Orders auto-created the moment a quote converts | `transitionQuote()` in `src/app/actions/quotes.ts` |
| Notifications engine (ageing, deal-desk holds, site visits due) - rules-based, dedupe-safe | `src/lib/notifications.ts`, bell in the app header |
| Team management (invite/role/remove) | `/team` |
| Ask HIQM - natural-language analytics (SQL numbers, AI narration) | `/ask` |
| AI WhatsApp follow-up drafter | quote detail page |
| AI usage cap - 30 requests / 30 min per user, shared across both AI features | `src/lib/ai-rate-limit.ts` |
| Audit log on every mutation, with a viewer UI | `/audit`, `audit_logs` table |

## Setup (10 minutes)

### 1. Database - Supabase
1. Create a project at supabase.com. **Note the region** - Supabase's pooler
   hostname is `aws-<0 or 1>-<region>.pooler.supabase.com`; the cluster
   number isn't always `aws-0`, so if a connection fails with "Tenant or
   user not found" try the other one.
2. This project's **direct connection host is IPv6-only** (Supabase's
   default for new projects), so both migrations and the app connect
   through the **Supavisor pooler** instead - no IPv6 needed.
3. `cp .env.example .env` and fill in `DATABASE_URL` / `DIRECT_DATABASE_URL`
   using the pooler host, your project ref, and DB password (Project
   Settings → Database → Connection string).

### 2. Migrate, then create the least-privilege app role
```bash
npm install
npm run db:migrate   # applies schema, RLS policies, AND creates the `hiqm_app` role
```
**Critical:** the Supabase `postgres` role has `BYPASSRLS` - every RLS
policy is silently a no-op under it. Immediately after migrating:
```sql
ALTER ROLE hiqm_app WITH PASSWORD '<generate a strong one>';
```
Then set `DATABASE_URL` (the app's *runtime* connection, used for
everything except migrations) to connect as `hiqm_app`, not `postgres`:
```
DATABASE_URL="postgresql://hiqm_app.<project-ref>:<hiqm_app password>@<pooler-host>:6543/postgres"
DIRECT_DATABASE_URL="postgresql://postgres.<project-ref>:<postgres password>@<pooler-host>:5432/postgres"
```
`DIRECT_DATABASE_URL` (used only by `db:migrate`/`db:seed`) stays on
`postgres` since seeding needs to bypass RLS to write demo data freely.

### 3. Seed demo data
```bash
npm run db:seed      # PAN-India demo data: 5 tenants, 165 quotes, bulk-inserted (seconds, not minutes)
```

### 4. Auth + AI
```bash
# .env
AUTH_SECRET=$(openssl rand -base64 32)   # any long random string
GROQ_API_KEY=gsk_...                     # console.groq.com (free tier is fine)
```
AI usage is capped at 30 requests per 30 minutes per user (shared across Ask
HIQM and the WhatsApp follow-up drafter) - enforced in Postgres via
`ai_requests`/`checkAiRateLimit()`, not an in-memory counter, since an
in-memory counter would silently reset on every Vercel cold start. Past the
limit, the API returns HTTP 429 with a friendly message and a `Retry-After`
header; both AI UI components already surface that message as-is.

### 5. Run
```bash
npm run dev
```

Demo logins (password `demo1234`):

| Role | Email |
|---|---|
| CEO (PAN-India) | ceo@heseos.in |
| Zone Manager (West) | west@heseos.in |
| Dealer admin | admin@acme.in |
| Dealer sales | sales@acme.in |
| SI admin | admin@voltedge.in |
| Distributor | admin@sungrid.in |

## Deploy - Vercel
1. Push to GitHub, import in Vercel.
2. Set env vars: `DATABASE_URL`, `AUTH_SECRET`, `AUTH_TRUST_HOST=true`, `NEXT_PUBLIC_APP_URL=https://your-domain`, `GROQ_API_KEY`, `GROQ_MODEL`.
3. Point your Hostinger DNS (CNAME) at Vercel for the custom domain.

## Architecture notes
- **RLS is the isolation guarantee, enforced by a role that can't bypass it.** Every business table (`customers`, `quotations`, `quote_items`, `quote_revisions`, `quote_events`, `quote_sequences`, `leads`, `site_visits`, `projects`, `orders`, `order_events`, `notifications`) has `tenant_id` + a policy keyed on per-transaction `app.tenant_id`/`app.scope` (`withTenant()` in `src/db/index.ts`). The app connects as `hiqm_app`, a role with no `BYPASSRLS` - verified live: a dealer session cannot read another dealer's `quotations`, `leads`, `projects`, or `orders` row even by pasting its UUID directly into the URL (all return 404). Migrations/seeding run as `postgres` (which does bypass RLS) since seeding needs unrestricted writes.
- **Reference tables have RLS off, not "permissive everything."** `tenants`, `users`, `memberships`, `audit_logs`, `geo_*` were never meant to be tenant-row-scoped (Supabase enables RLS by default on every new table, which had to be explicitly undone here - see `0001_fix_rls.sql`). `branding_profiles` and `quote_shares` are deliberately public-SELECT (a share's token *is* the capability; branding must render on a customer-facing PDF/page) but tenant-scoped on writes. Because `users`/`memberships` have RLS off entirely, `src/app/actions/team.ts` is the one place in the app that enforces tenant isolation by hand (`where tenant_id = ...` in application code) rather than leaning on the database - called out explicitly in that file's comments.
- **The public share page resolves identity from the token, not a session.** `/q/[token]` has no logged-in user - it looks up `quote_shares` (public read), then runs everything else inside `withTenant({ tenantId: share.tenant_id, scope: 'tenant' })`. Verified live: opening the link flips the quote to Viewed and the accept button moves it to Approved, both against the real database.
- **Migrations are tracked, not replayed blind.** `scripts/migrate.ts` keeps a `schema_migrations` ledger and applies each file exactly once - added after discovering that re-running the naive "replay every .sql file" version broke on a migration whose `create policy` statements had no re-run guard.
- **AI never computes money.** GST, totals and discounts come from the deterministic engine; Groq only narrates analytics and drafts messages.
- **The Deal Desk gate is enforced server-side, not just hidden in the UI.** `requiresDealDeskApproval()` flags a quote at create/revise time; `transitionQuote()` refuses to move a flagged, unapproved quote to `approved` unless the caller's role passes `canApproveDeals()` - verified live: a `partner_sales` session sees the hold banner and no Approve button, while `partner_admin` sees the button and can clear it.
- **Win Probability is deliberately separate from Quote Health.** Health flags whether a deal *in flight* needs attention (operational nudge); Win Probability estimates the odds a specific quote *closes*, for pipeline-weighted forecasting - same "rules now, explainable, model-ready later" philosophy, different question.
- **Every state change is an event** (`quote_events`, `order_events`) - dashboards, ageing, health scores and the notifications engine all read the same stream the future ML models will train on.
- **Notifications are rules-based and dedupe-safe**, not a cron job - there's no scheduler in this stack yet, so `syncAgeingNotifications()` runs opportunistically (bell load) and relies on a `(tenant_id, dedupe_key)` unique constraint so re-running it is a no-op for anything already raised. Broadcast notifications (`user_id IS NULL`) share one read-state across a tenant's admins at this scale; the noted upgrade path is a `notification_reads` join table.
- Demo-scale analytics run as live SQL aggregates; the upgrade path is materialized views → ClickHouse without touching callers.

## The 10-minute demo script
1. Login as `admin@acme.in` → dealer-branded shell. Add a **Lead** → schedule a **Site Visit** → mark it complete → **Convert to project**, which drops you straight into the quote builder, pre-linked.
2. Create a quote from catalogue chips - watch the stopwatch stay under 2:00.
3. Download the white-label PDF (GST split, bank + UPI, T&C, "Powered by HESEOS").
4. Share on WhatsApp → open the link on a phone → back on screen the quote flips to **Viewed** live (5s poll).
5. Tap **Accept** on the phone → status jumps to Approved with a digital acceptance event.
6. Create a revision → show the diff (price delta). Push the discount past 10% → the quote gets a **Deal Desk hold**; login as `sales@acme.in` and show the Approve button is gone, then back as `admin@acme.in` to clear it.
7. Mark it **Approved → Convert to order** - an **Order** appears automatically at `/orders`, linked back to the quote.
8. Open the notification bell - ageing/approval nudges the rules engine raised on its own.
9. Login as `ceo@heseos.in` → Command Center → drill India → West → Maharashtra → Pune → Acme → **Acme's own team leaderboard** (the drilldown's final level), or check **Top performers** on the main dashboard for the PAN-India view without drilling at all.
10. Open **Ask HIQM**: "Why are we losing quotes?" - grounded answer from live data.

## Testing
`scripts/smoke-test.mjs` is a standalone e2e check against a running `next start` - logs in as four different demo accounts and asserts: the new module pages load, a dealer cannot reach another dealer's lead/project/order by UUID (RLS), and the Deal Desk role gate actually hides/shows the Approve button server-side. Run `npm run build && npm start`, then in another terminal `npm run smoke`.

`scripts/rate-limit-test.mjs` fires 31 rapid `/api/ai/ask` requests as one user against a running server and asserts requests 1–30 pass the gate while request 31 gets a 429 with the friendly message and a `Retry-After` header. Run `npm run test:ratelimit` (any non-empty `GROQ_API_KEY` works for this - Groq itself doesn't need to succeed, only the gate is under test).
