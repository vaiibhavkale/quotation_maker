# HIQM — HESEOS Intelligent Quotation Maker

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
| CEO Command Center: India → Zone → State → City → Org drilldown | `/dashboard` |
| Quote Health Score (transparent rules, AI-ready) | `src/lib/health.ts` |
| Ask HIQM — natural-language analytics (SQL numbers, AI narration) | `/ask` |
| AI WhatsApp follow-up drafter | quote detail page |
| Audit log on every mutation | `audit_logs` table |

## Setup (10 minutes)

### 1. Database — Supabase
1. Create a project at supabase.com (region: **Mumbai ap-south-1**).
2. Project Settings → Database → copy both connection strings.
3. `cp .env.example .env` and fill `DATABASE_URL` (transaction pooler, port 6543) and `DIRECT_DATABASE_URL` (session, port 5432).

### 2. Install, migrate, seed
```bash
npm install
npm run db:migrate   # applies schema + RLS policies
npm run db:seed      # PAN-India demo data: 5 tenants, ~160 quotes
```

### 3. Auth + AI
```bash
# .env
AUTH_SECRET=$(openssl rand -base64 32)   # any long random string
GROQ_API_KEY=gsk_...                     # console.groq.com (free tier is fine)
```

### 4. Run
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

## Deploy — Vercel
1. Push to GitHub, import in Vercel.
2. Set env vars: `DATABASE_URL`, `AUTH_SECRET`, `AUTH_TRUST_HOST=true`, `NEXT_PUBLIC_APP_URL=https://your-domain`, `GROQ_API_KEY`, `GROQ_MODEL`.
3. Point your Hostinger DNS (CNAME) at Vercel for the custom domain.

## Architecture notes
- **RLS is the isolation guarantee** — every business table has `tenant_id` + a `FORCE ROW LEVEL SECURITY` policy keyed on per-transaction `app.tenant_id` / `app.scope` settings (`withTenant()` wrapper). App-level filters are UX, not security.
- **AI never computes money.** GST, totals and discounts come from the deterministic engine; Groq only narrates analytics and drafts messages.
- **Every state change is an event** (`quote_events`) — dashboards, ageing and health scores read the same stream the future ML models will train on.
- Demo-scale analytics run as live SQL aggregates; the upgrade path is materialized views → ClickHouse without touching callers.

## The 10-minute demo script
1. Login as `admin@acme.in` → dealer-branded shell. Create a quote from catalogue chips — watch the stopwatch stay under 2:00.
2. Download the white-label PDF (GST split, bank + UPI, T&C, "Powered by HESEOS").
3. Share on WhatsApp → open the link on a phone → back on screen the quote flips to **Viewed** live (5s poll).
4. Tap **Accept** on the phone → status jumps to Approved with a digital acceptance event.
5. Create a revision → show the diff (price delta).
6. Login as `ceo@heseos.in` → Command Center → drill India → West → Maharashtra → Pune → Acme → the exact quote you just made.
7. Open **Ask HIQM**: "Why are we losing quotes?" — grounded answer from live data.
