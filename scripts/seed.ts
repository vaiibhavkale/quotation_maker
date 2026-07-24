/**
 * Seeds a believable PAN-India demo dataset - bulk-insert version (few round
 * trips instead of thousands) so it finishes in seconds over a remote DB:
 *  - Geo: 5 zones, 8 states, 12 cities
 *  - Tenants: HESEOS HQ, 1 distributor, 2 dealers, 1 SI (each branded)
 *  - Users: CEO + partner admins/sales (password: demo1234)
 *  - ~165 quotations across statuses, zones and the last 90 days
 */
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import bcrypt from "bcryptjs";

const url = process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL;
if (!url) throw new Error("Set DIRECT_DATABASE_URL (or DATABASE_URL) first");
const sql = postgres(url, { max: 1, prepare: false, ssl: "require" });

const rand = (n: number) => Math.floor(Math.random() * n);
const pick = <T,>(a: T[]): T => a[rand(a.length)];
const daysAgo = (n: number) => new Date(Date.now() - n * 864e5);

async function main() {
  await sql`select set_config('app.scope', 'global', false)`;

  /* - Reset transactional demo data so this script is safely re-runnable -
     (children before parents; tenants/users/memberships/geo/branding are
     upserted above instead, so they're left alone here) */
  console.log("Resetting existing demo data…");
  await sql`delete from order_events`;
  await sql`delete from orders`;
  await sql`delete from quote_events`;
  await sql`delete from quote_revisions`;
  await sql`delete from quote_items`;
  await sql`delete from quotations`;
  await sql`delete from site_visits`;
  await sql`delete from projects`;
  await sql`delete from leads`;
  await sql`delete from customers`;
  await sql`delete from notifications`;

  /* - Geography - */
  await sql`insert into geo_zones (id, name) values
    ('north','North'),('south','South'),('east','East'),('west','West'),('central','Central')
    on conflict (id) do nothing`;
  await sql`insert into geo_states (id, name, zone_id, gst_state_code) values
    ('MH','Maharashtra','west','27'), ('GJ','Gujarat','west','24'),
    ('DL','Delhi','north','07'),      ('UP','Uttar Pradesh','north','09'),
    ('KA','Karnataka','south','29'),  ('TN','Tamil Nadu','south','33'),
    ('WB','West Bengal','east','19'), ('MP','Madhya Pradesh','central','23')
    on conflict (id) do nothing`;
  await sql`insert into geo_cities (id, name, state_id) values
    ('MH-PUN','Pune','MH'), ('MH-MUM','Mumbai','MH'), ('GJ-AHM','Ahmedabad','GJ'),
    ('DL-DEL','New Delhi','DL'), ('UP-NOI','Noida','UP'), ('KA-BLR','Bengaluru','KA'),
    ('TN-CHE','Chennai','TN'), ('WB-KOL','Kolkata','WB'), ('MP-IND','Indore','MP'),
    ('MH-NAG','Nagpur','MH'), ('KA-MYS','Mysuru','KA'), ('GJ-SUR','Surat','GJ')
    on conflict (id) do nothing`;

  /* - Tenants + branding (10 tenants, sequential is fine) - */
  const tenants = [
    { slug: "heseos", name: "HESEOS Energy Pvt Ltd", type: "heseos", zone: "west", state: "MH", city: "MH-PUN", color: "#E8821E" },
    { slug: "sungrid", name: "SunGrid Distributors", type: "distributor", zone: "north", state: "DL", city: "DL-DEL", color: "#0E7490" },
    { slug: "acme", name: "Acme Solar Solutions", type: "dealer", zone: "west", state: "MH", city: "MH-PUN", color: "#166534" },
    { slug: "voltedge", name: "VoltEdge Systems", type: "si", zone: "south", state: "KA", city: "KA-BLR", color: "#7C3AED" },
    { slug: "raypower", name: "RayPower Traders", type: "dealer", zone: "east", state: "WB", city: "WB-KOL", color: "#B91C1C" },
  ];
  const tenantIds: Record<string, string> = {};
  for (const t of tenants) {
    const [row] = await sql`
      insert into tenants (name, slug, type, zone_id, state_id, city_id)
      values (${t.name}, ${t.slug}, ${t.type}, ${t.zone}, ${t.state}, ${t.city})
      on conflict (slug) do update set name = excluded.name
      returning id`;
    tenantIds[t.slug] = row.id;
    await sql`
      insert into branding_profiles (tenant_id, display_name, primary_color, gstin, address, phone, email,
        bank_name, bank_account, bank_ifsc, upi_id, signature_name, terms, footer_note, powered_by_heseos)
      values (${row.id}, ${t.name}, ${t.color},
        ${"27" + t.slug.toUpperCase().padEnd(10, "A").slice(0, 10) + "1Z5"},
        ${t.city.split("-")[1] + ", India"}, '+91 98220 00000', ${t.slug + "@example.in"},
        'HDFC Bank', '50100234567890', 'HDFC0001234', ${t.slug + "@upi"}, 'Authorized Signatory',
        'Prices valid for 15 days. 50% advance with PO, balance before dispatch. GST extra as applicable. Warranty as per manufacturer terms.',
        'Thank you for your business!', ${t.slug !== "heseos"})
      on conflict (tenant_id) do nothing`;
  }

  /* - Users + memberships - */
  const hash = await bcrypt.hash("demo1234", 10);
  const mkUser = async (email: string, name: string, tenant: string, role: string, geoScope: object | null = null) => {
    const [u] = await sql`
      insert into users (email, name, password_hash) values (${email}, ${name}, ${hash})
      on conflict (email) do update set name = excluded.name returning id`;
    await sql`
      insert into memberships (user_id, tenant_id, role, geo_scope)
      values (${u.id}, ${tenantIds[tenant]}, ${role}, ${geoScope as never})
      on conflict (user_id, tenant_id) do update set role = excluded.role`;
    return u.id as string;
  };
  const ceoId = await mkUser("ceo@heseos.in", "Rajesh Mehta (CEO)", "heseos", "ceo");
  await mkUser("west@heseos.in", "Priya Kulkarni (West ZM)", "heseos", "zone_manager", { zoneId: "west" });
  const sellers: Record<string, string[]> = {
    acme: [await mkUser("admin@acme.in", "Amit Deshmukh", "acme", "partner_admin"), await mkUser("sales@acme.in", "Sneha Patil", "acme", "partner_sales")],
    voltedge: [await mkUser("admin@voltedge.in", "Karthik Rao", "voltedge", "partner_admin"), await mkUser("sales@voltedge.in", "Divya Iyer", "voltedge", "partner_sales")],
    raypower: [await mkUser("admin@raypower.in", "Sourav Bose", "raypower", "partner_admin")],
    sungrid: [await mkUser("admin@sungrid.in", "Vikram Singh", "sungrid", "partner_admin")],
    heseos: [await mkUser("direct@heseos.in", "Rohit Sharma", "heseos", "partner_sales")],
  };
  // Whoever can actually clear a deal-desk hold per tenant (mirrors
  // canApproveDeals in src/lib/deal-desk.ts) - used only to keep seeded
  // approved_by_id values consistent with what the real approval gate
  // would allow. Every tenant here has a partner_admin except "heseos"
  // itself, whose only seller is partner_sales - the CEO covers that case.
  const approverBySlug: Record<string, string> = {
    acme: sellers.acme[0], voltedge: sellers.voltedge[0], raypower: sellers.raypower[0],
    sungrid: sellers.sungrid[0], heseos: ceoId,
  };

  /* - Build everything else in memory, then bulk-insert - */
  const catalogue = [
    { d: "Solar PV Module 540Wp Mono PERC", hsn: "85414012", rate: 1250000, gst: 1200 },
    { d: "String Inverter 5kW 3-Phase", hsn: "85044030", rate: 4500000, gst: 1200 },
    { d: "Hybrid Inverter 8kW with BMS", hsn: "85044030", rate: 9800000, gst: 1200 },
    { d: "Li-Ion Battery Pack 5kWh LFP", hsn: "85076000", rate: 12500000, gst: 1800 },
    { d: "Module Mounting Structure (per kW)", hsn: "73089090", rate: 550000, gst: 1800 },
    { d: "DC Cable 4 sqmm (per 100m)", hsn: "85446090", rate: 480000, gst: 1800 },
    { d: "ACDB/DCDB Combiner Box", hsn: "85371000", rate: 850000, gst: 1800 },
    { d: "Earthing Kit with LA", hsn: "85389000", rate: 320000, gst: 1800 },
    { d: "Net Metering Liaison & Commissioning", hsn: "998739", rate: 1500000, gst: 1800 },
    { d: "5-Year AMC (per kW)", hsn: "998719", rate: 120000, gst: 1800 },
  ];
  const custNames = [
    "Shree Ganesh Industries", "Lotus Residency CHS", "Krishna Agro Mills", "TechNova Park",
    "Green Valley School", "Hotel Rajwada", "Apex Cold Storage", "Mahalaxmi Textiles",
    "Sundar Hospital", "City Mall Complex", "Patel Farms", "Orbit Warehousing",
  ];
  const statuses = ["draft", "shared", "viewed", "negotiation", "approved", "converted", "lost"] as const;
  const statusWeight = [15, 18, 22, 15, 12, 12, 6];
  const wPick = () => {
    let r = rand(100), acc = 0;
    for (let i = 0; i < statuses.length; i++) { acc += statusWeight[i]; if (r < acc) return statuses[i]; }
    return "draft";
  };
  const cityByState: Record<string, string[]> = {
    MH: ["MH-PUN", "MH-MUM", "MH-NAG"], GJ: ["GJ-AHM", "GJ-SUR"], DL: ["DL-DEL"], UP: ["UP-NOI"],
    KA: ["KA-BLR", "KA-MYS"], TN: ["TN-CHE"], WB: ["WB-KOL"], MP: ["MP-IND"],
  };
  const states = Object.keys(cityByState);
  const partnerSlugs = ["acme", "voltedge", "raypower", "sungrid", "heseos"];

  const homeStateByTenant: Record<string, string> = {};
  for (const slug of partnerSlugs) {
    const t = tenants.find((x) => x.slug === slug)!;
    homeStateByTenant[slug] = t.state;
  }

  const customerRows: { id: string; tenant_id: string; name: string; contact_name: string; phone: string; email: string; gstin: string; billing_address: string; state_id: string; city_id: string }[] = [];
  const custByTenant: Record<string, { id: string; stateId: string }[]> = {};

  for (const slug of partnerSlugs) {
    const tId = tenantIds[slug];
    const homeState = homeStateByTenant[slug];
    custByTenant[slug] = [];
    for (let i = 0; i < 6; i++) {
      const st = i < 4 ? homeState : pick(states);
      const id = randomUUID();
      customerRows.push({
        id, tenant_id: tId, name: `${pick(custNames)} ${i + 1}`, contact_name: "Procurement Head",
        phone: `+91 98${100000 + rand(899999)}`, email: `buyer${i}@${slug}.example.in`,
        gstin: `${st}ABCDE1234F1Z${rand(9)}`, billing_address: "Plot 12, MIDC Area",
        state_id: st, city_id: pick(cityByState[st]),
      });
      custByTenant[slug].push({ id, stateId: st });
    }
  }

  /* - Leads → Site visits → Projects (full PRD lifecycle ahead of the first quote) - */
  const leadNames = [
    "Ramesh Patil", "Anita Sharma", "Suresh Naidu", "Meera Iyer", "Vijay Kumar",
    "Pooja Reddy", "Arjun Nair", "Kavita Joshi", "Manoj Gupta", "Deepa Menon",
  ];
  const leadSources = ["referral", "website", "walk_in", "cold_call", "partner"];
  const leadStatuses = ["new", "site_visit_scheduled", "site_visit_done", "converted", "dropped"] as const;
  const leadStatusWeight = [25, 20, 15, 30, 10];
  const wPickLead = () => {
    let r = rand(100), acc = 0;
    for (let i = 0; i < leadStatuses.length; i++) { acc += leadStatusWeight[i]; if (r < acc) return leadStatuses[i]; }
    return "new";
  };

  const leadRows: Record<string, unknown>[] = [];
  const siteVisitRows: Record<string, unknown>[] = [];
  const projectRows: Record<string, unknown>[] = [];
  const projectsByCustomer: Record<string, string[]> = {};

  for (const slug of partnerSlugs) {
    const tId = tenantIds[slug];
    const nLeads = slug === "heseos" ? 4 : 7;
    for (let i = 0; i < nLeads; i++) {
      const leadId = randomUUID();
      const status = wPickLead();
      const assignee = pick(sellers[slug]);
      const created = daysAgo(rand(60));
      const convertedCustomer = status === "converted" ? pick(custByTenant[slug]) : null;

      leadRows.push({
        id: leadId, tenant_id: tId, name: pick(leadNames), phone: `+91 97${100000 + rand(899999)}`,
        email: null, source: pick(leadSources), notes: null, status,
        drop_reason: status === "dropped" ? pick(["Budget mismatch", "Went with local vendor", "Project shelved"]) : null,
        assigned_to_id: assignee, customer_id: convertedCustomer?.id ?? null,
        created_at: created, updated_at: created,
      });

      if (["site_visit_scheduled", "site_visit_done", "converted"].includes(status)) {
        const done = status !== "site_visit_scheduled";
        const scheduledAt = new Date(created.getTime() + (1 + rand(5)) * 864e5);
        siteVisitRows.push({
          id: randomUUID(), tenant_id: tId, lead_id: leadId,
          scheduled_at: scheduledAt, completed_at: done ? new Date(scheduledAt.getTime() + 2 * 36e5) : null,
          engineer_id: assignee, status: done ? "completed" : "scheduled",
          notes: done ? "Roof survey complete, shadow-free area confirmed." : null,
          created_at: created,
        });
      }

      if (status === "converted" && convertedCustomer) {
        const projectId = randomUUID();
        projectRows.push({
          id: projectId, tenant_id: tId, customer_id: convertedCustomer.id, lead_id: leadId,
          name: `${pick(["Rooftop Solar", "Hybrid Power System", "Solar + Storage"])} - ${convertedCustomer.id.slice(0, 4)}`,
          address: "Site address on file", status: "active", created_at: created,
        });
        (projectsByCustomer[convertedCustomer.id] ??= []).push(projectId);
      }
    }

    // A couple of standalone projects per tenant with no lead in the chain
    // (e.g. an existing customer starting a second project directly).
    for (let i = 0; i < 2; i++) {
      const cust = pick(custByTenant[slug]);
      const projectId = randomUUID();
      projectRows.push({
        id: projectId, tenant_id: tId, customer_id: cust.id, lead_id: null,
        name: `${pick(["Rooftop Solar Expansion", "Phase 2 Ground Mount", "Backup Storage Add-on"])}`,
        address: "Site address on file", status: pick(["active", "active", "on_hold", "completed"]),
        created_at: daysAgo(rand(45)),
      });
      (projectsByCustomer[cust.id] ??= []).push(projectId);
    }
  }

  const quotationRows: Record<string, unknown>[] = [];
  const itemRows: Record<string, unknown>[] = [];
  const revisionRows: Record<string, unknown>[] = [];
  const eventRows: Record<string, unknown>[] = [];
  const seqByTenant: Record<string, number> = {};

  for (const slug of partnerSlugs) {
    const tId = tenantIds[slug];
    const homeState = homeStateByTenant[slug];
    const fy = "2026-27";
    let seq = 0;
    const nQuotes = slug === "heseos" ? 25 : 35;

    for (let i = 0; i < nQuotes; i++) {
      seq++;
      const cust = pick(custByTenant[slug]);
      const creator = pick(sellers[slug]);
      const created = daysAgo(rand(90));
      const status = wPick();
      const interState = cust.stateId !== homeState;

      // Force ~1 in 12 quotes well past the deal-desk discount threshold
      // (src/lib/deal-desk.ts: >10%) so the approval-gate feature has
      // guaranteed, deterministic demo data instead of hoping random
      // per-line discounts happen to average out above the line.
      const forceHighDiscount = i % 12 === 0;

      let subtotal = 0, discountTotal = 0, cgst = 0, sgst = 0, igst = 0;
      const lines: { it: (typeof catalogue)[number]; qty: number; disc: number; lineTotal: number }[] = [];
      const nItems = 2 + rand(4);
      for (let j = 0; j < nItems; j++) {
        const it = pick(catalogue);
        const qty = (1 + rand(20)) * 100;
        const disc = forceHighDiscount ? pick([1200, 1500, 1800]) : pick([0, 0, 250, 500, 750, 1000]);
        const gross = Math.round((it.rate * qty) / 100);
        const discAmt = Math.round((gross * disc) / 10000);
        const lineTotal = gross - discAmt;
        subtotal += gross; discountTotal += discAmt;
        const tax = Math.round((lineTotal * it.gst) / 10000);
        if (interState) igst += tax; else { cgst += Math.round(tax / 2); sgst += tax - Math.round(tax / 2); }
        lines.push({ it, qty, disc, lineTotal });
      }
      const grand = subtotal - discountTotal + cgst + sgst + igst;
      const number = `${slug.toUpperCase()}/QT/${fy}/${String(seq).padStart(5, "0")}`;
      const qId = randomUUID();

      // Deal-desk gate - mirrors the threshold in src/lib/deal-desk.ts
      // (duplicated here rather than imported: this script runs standalone
      // via tsx, outside Next's path-alias resolution).
      const discPctForGate = subtotal > 0 ? (discountTotal / subtotal) * 100 : 0;
      const needsApproval = discPctForGate > 10 || grand >= 50_00_000 * 100;
      // The app's own server action refuses to reach 'approved'/'converted'
      // with an unresolved deal-desk hold, so seed data has to respect that
      // same invariant - only earlier-stage quotes can be left pending.
      const approvedById = needsApproval && ["approved", "converted"].includes(status)
        ? approverBySlug[slug]
        : null;

      const custProjects = projectsByCustomer[cust.id];
      const projectId = custProjects && custProjects.length > 0 && rand(100) < 50 ? pick(custProjects) : null;

      quotationRows.push({
        id: qId, tenant_id: tId, customer_id: cust.id, project_id: projectId, created_by_id: creator, number,
        title: `${pick(["Rooftop Solar", "Hybrid Power System", "Solar + Storage", "Ground Mount Array"])} - ${Math.round(3 + rand(97))} kW`,
        status, current_revision: 1, place_of_supply_state_id: cust.stateId,
        subtotal, discount_total: discountTotal, cgst, sgst, igst, grand_total: grand,
        valid_until: new Date(created.getTime() + 15 * 864e5),
        needs_approval: needsApproval, approved_by_id: approvedById,
        lost_reason: status === "lost" ? pick(["Price too high", "Went with competitor", "Project postponed", "Budget cut"]) : null,
        created_at: created, updated_at: created,
      });

      let pos = 0;
      for (const l of lines) {
        itemRows.push({
          id: randomUUID(), tenant_id: tId, quotation_id: qId, position: pos++, description: l.it.d,
          hsn_code: l.it.hsn, unit: "nos", quantity: l.qty, rate: l.it.rate, discount_pct: l.disc,
          gst_rate_pct: l.it.gst, line_total: l.lineTotal,
        });
      }

      revisionRows.push({
        id: randomUUID(), tenant_id: tId, quotation_id: qId, revision_no: 1,
        snapshot: JSON.stringify({ number, subtotal, grand, note: "seed" }), reason: null, created_by_id: creator,
      });

      const evs: [string, Date][] = [["created", created]];
      const order = ["shared", "viewed", "negotiation", "approved", "converted"];
      const idx = status === "draft" ? -1 : status === "lost" ? 2 + rand(2) : order.indexOf(status);
      for (let k = 0; k <= idx && k < order.length; k++) {
        evs.push([order[k], new Date(created.getTime() + (k + 1) * (6 + rand(30)) * 36e5)]);
      }
      if (status === "lost") evs.push(["lost", new Date(created.getTime() + 8 * 864e5)]);
      for (const [type, at] of evs) {
        eventRows.push({ id: randomUUID(), tenant_id: tId, quotation_id: qId, type, actor_id: creator, meta: null, created_at: at });
      }
    }
    seqByTenant[slug] = seq;
  }

  // Orders - auto-created for every 'converted' quotation, exactly like the
  // app's own transitionQuote() does the moment a quote converts. Built
  // after quotationRows is final since it depends on each quote's status/number.
  const orderRows: Record<string, unknown>[] = [];
  const orderEventRows: Record<string, unknown>[] = [];
  const orderStages = ["production", "dispatch", "installation", "completed"] as const;

  for (const q of quotationRows as { id: string; tenant_id: string; number: string; status: string; grand_total: number; created_at: Date }[]) {
    if (q.status !== "converted") continue;
    const orderId = randomUUID();
    const stageIdx = pick([0, 0, 1, 1, 2, 3]); // most orders early in fulfillment, a few completed
    const stage = orderStages[stageIdx];
    const advance = stage === "completed" ? q.grand_total : Math.round(q.grand_total * (0.2 + Math.random() * 0.3));

    orderRows.push({
      id: orderId, tenant_id: q.tenant_id, quotation_id: q.id,
      order_number: q.number.replace("/QT/", "/ORD/"), stage, advance_received: advance,
      created_at: q.created_at, updated_at: q.created_at,
    });

    for (let k = 0; k <= stageIdx; k++) {
      orderEventRows.push({
        id: randomUUID(), tenant_id: q.tenant_id, order_id: orderId,
        type: k === 0 ? "created" : orderStages[k], actor_id: null, meta: null,
        created_at: new Date(q.created_at.getTime() + (k + 1) * 2 * 864e5),
      });
    }
  }

  console.log(
    `Inserting ${customerRows.length} customers, ${leadRows.length} leads, ${projectRows.length} projects, ` +
    `${quotationRows.length} quotations, ${itemRows.length} items, ${eventRows.length} events, ${orderRows.length} orders…`
  );

  await sql`insert into customers ${sql(customerRows, "id", "tenant_id", "name", "contact_name", "phone", "email", "gstin", "billing_address", "state_id", "city_id")}`;
  await sql`insert into leads ${sql(leadRows as never, "id", "tenant_id", "name", "phone", "email", "source", "notes", "status", "drop_reason", "assigned_to_id", "customer_id", "created_at", "updated_at")}`;
  if (siteVisitRows.length > 0) {
    await sql`insert into site_visits ${sql(siteVisitRows as never, "id", "tenant_id", "lead_id", "scheduled_at", "completed_at", "engineer_id", "status", "notes", "created_at")}`;
  }
  await sql`insert into projects ${sql(projectRows as never, "id", "tenant_id", "customer_id", "lead_id", "name", "address", "status", "created_at")}`;
  await sql`insert into quotations ${sql(quotationRows as never, "id", "tenant_id", "customer_id", "project_id", "created_by_id", "number", "title", "status", "current_revision", "place_of_supply_state_id", "subtotal", "discount_total", "cgst", "sgst", "igst", "grand_total", "valid_until", "needs_approval", "approved_by_id", "lost_reason", "created_at", "updated_at")}`;
  await sql`insert into quote_items ${sql(itemRows as never, "id", "tenant_id", "quotation_id", "position", "description", "hsn_code", "unit", "quantity", "rate", "discount_pct", "gst_rate_pct", "line_total")}`;
  await sql`insert into quote_revisions ${sql(revisionRows as never, "id", "tenant_id", "quotation_id", "revision_no", "snapshot", "reason", "created_by_id")}`;
  await sql`insert into quote_events ${sql(eventRows as never, "id", "tenant_id", "quotation_id", "type", "actor_id", "meta", "created_at")}`;
  if (orderRows.length > 0) {
    await sql`insert into orders ${sql(orderRows as never, "id", "tenant_id", "quotation_id", "order_number", "stage", "advance_received", "created_at", "updated_at")}`;
    await sql`insert into order_events ${sql(orderEventRows as never, "id", "tenant_id", "order_id", "type", "actor_id", "meta", "created_at")}`;
  }

  for (const slug of partnerSlugs) {
    await sql`insert into quote_sequences (tenant_id, fy, last_value) values (${tenantIds[slug]}, '2026-27', ${seqByTenant[slug]})
      on conflict (tenant_id, fy) do update set last_value = ${seqByTenant[slug]}`;
  }

  console.log("\nSeed complete. Logins (password: demo1234):");
  console.log("  CEO         → ceo@heseos.in");
  console.log("  Dealer      → admin@acme.in / sales@acme.in");
  console.log("  SI          → admin@voltedge.in");
  console.log("  Distributor → admin@sungrid.in");
  await sql.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
