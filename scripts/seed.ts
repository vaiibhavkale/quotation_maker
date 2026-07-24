/**
 * Seeds a believable PAN-India demo dataset:
 *  - Geo: 5 zones, 8 states, 12 cities
 *  - Tenants: HESEOS HQ, 1 distributor, 2 dealers, 1 SI (each branded)
 *  - Users: CEO + partner admins/sales (password: demo1234)
 *  - ~160 quotations across statuses, zones and the last 90 days
 */
import postgres from "postgres";
import bcrypt from "bcryptjs";

const url = process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL;
if (!url) throw new Error("Set DIRECT_DATABASE_URL (or DATABASE_URL) first");
const sql = postgres(url, { max: 1, prepare: false });

const rand = (n: number) => Math.floor(Math.random() * n);
const pick = <T,>(a: T[]): T => a[rand(a.length)];
const daysAgo = (n: number) => new Date(Date.now() - n * 864e5);

async function main() {
  // seed runs as service context — bypass RLS via global scope on this session
  await sql`select set_config('app.scope', 'global', false)`;

  /* ── Geography ── */
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

  /* ── Tenants ── */
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

  /* ── Users ── */
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

  const ceo = await mkUser("ceo@heseos.in", "Rajesh Mehta (CEO)", "heseos", "ceo");
  await mkUser("west@heseos.in", "Priya Kulkarni (West ZM)", "heseos", "zone_manager", { zoneId: "west" });
  const sellers: Record<string, string[]> = {};
  sellers["acme"] = [
    await mkUser("admin@acme.in", "Amit Deshmukh", "acme", "partner_admin"),
    await mkUser("sales@acme.in", "Sneha Patil", "acme", "partner_sales"),
  ];
  sellers["voltedge"] = [
    await mkUser("admin@voltedge.in", "Karthik Rao", "voltedge", "partner_admin"),
    await mkUser("sales@voltedge.in", "Divya Iyer", "voltedge", "partner_sales"),
  ];
  sellers["raypower"] = [await mkUser("admin@raypower.in", "Sourav Bose", "raypower", "partner_admin")];
  sellers["sungrid"] = [await mkUser("admin@sungrid.in", "Vikram Singh", "sungrid", "partner_admin")];
  sellers["heseos"] = [await mkUser("direct@heseos.in", "Rohit Sharma", "heseos", "partner_sales")];

  /* ── Customers + Quotations ── */
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

  const partnerSlugs = ["acme", "voltedge", "raypower", "sungrid", "heseos"];
  const cityByState: Record<string, string[]> = {
    MH: ["MH-PUN", "MH-MUM", "MH-NAG"], GJ: ["GJ-AHM", "GJ-SUR"], DL: ["DL-DEL"], UP: ["UP-NOI"],
    KA: ["KA-BLR", "KA-MYS"], TN: ["TN-CHE"], WB: ["WB-KOL"], MP: ["MP-IND"],
  };
  const states = Object.keys(cityByState);

  for (const slug of partnerSlugs) {
    const tId = tenantIds[slug];
    const [{ state_id: homeState }] = await sql`select state_id from tenants where id = ${tId}`;

    // customers per tenant
    const custIds: { id: string; stateId: string }[] = [];
    for (let i = 0; i < 6; i++) {
      const st = i < 4 ? homeState : pick(states); // mostly local, some inter-state
      const [c] = await sql`
        insert into customers (tenant_id, name, contact_name, phone, email, gstin, billing_address, state_id, city_id)
        values (${tId}, ${pick(custNames) + " " + (i + 1)}, 'Procurement Head', ${"+91 98" + (100000 + rand(899999))},
          ${"buyer" + i + "@" + slug + ".example.in"}, ${st + "ABCDE1234F1Z" + rand(9)},
          'Plot 12, MIDC Area', ${st}, ${pick(cityByState[st])})
        returning id, state_id`;
      custIds.push({ id: c.id, stateId: c.state_id });
    }

    const fy = "2026-27";
    let seq = 0;
    const nQuotes = slug === "heseos" ? 25 : 35;
    for (let i = 0; i < nQuotes; i++) {
      seq++;
      const cust = pick(custIds);
      const creator = pick(sellers[slug]);
      const created = daysAgo(rand(90));
      const status = wPick();
      const interState = cust.stateId !== homeState;

      // build 2–5 items
      let subtotal = 0, discountTotal = 0, cgst = 0, sgst = 0, igst = 0;
      const lines: { it: (typeof catalogue)[number]; qty: number; disc: number; lineTotal: number }[] = [];
      const nItems = 2 + rand(4);
      for (let j = 0; j < nItems; j++) {
        const it = pick(catalogue);
        const qty = (1 + rand(20)) * 100;
        const disc = pick([0, 0, 250, 500, 750, 1000]);
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

      const [q] = await sql`
        insert into quotations (tenant_id, customer_id, created_by_id, number, title, status,
          place_of_supply_state_id, subtotal, discount_total, cgst, sgst, igst, grand_total,
          valid_until, lost_reason, created_at, updated_at)
        values (${tId}, ${cust.id}, ${creator}, ${number},
          ${pick(["Rooftop Solar", "Hybrid Power System", "Solar + Storage", "Ground Mount Array"]) + " — " + Math.round(3 + rand(97)) + " kW"},
          ${status}, ${cust.stateId}, ${subtotal}, ${discountTotal}, ${cgst}, ${sgst}, ${igst}, ${grand},
          ${new Date(created.getTime() + 15 * 864e5)},
          ${status === "lost" ? pick(["Price too high", "Went with competitor", "Project postponed", "Budget cut"]) : null},
          ${created}, ${created})
        returning id`;

      let pos = 0;
      for (const l of lines) {
        await sql`
          insert into quote_items (tenant_id, quotation_id, position, description, hsn_code, unit,
            quantity, rate, discount_pct, gst_rate_pct, line_total)
          values (${tId}, ${q.id}, ${pos++}, ${l.it.d}, ${l.it.hsn}, 'nos',
            ${l.qty}, ${l.it.rate}, ${l.disc}, ${l.it.gst}, ${l.lineTotal})`;
      }

      await sql`
        insert into quote_revisions (tenant_id, quotation_id, revision_no, snapshot, created_by_id)
        values (${tId}, ${q.id}, 1, ${JSON.stringify({ number, subtotal, grand, note: "seed" })}, ${creator})`;

      // lifecycle events
      const evs: [string, Date][] = [["created", created]];
      const order = ["shared", "viewed", "negotiation", "approved", "converted"];
      const idx = status === "draft" ? -1 : status === "lost" ? 2 + rand(2) : order.indexOf(status);
      for (let k = 0; k <= idx && k < order.length; k++) {
        evs.push([order[k], new Date(created.getTime() + (k + 1) * (6 + rand(30)) * 36e5)]);
      }
      if (status === "lost") evs.push(["lost", new Date(created.getTime() + 8 * 864e5)]);
      for (const [type, at] of evs) {
        await sql`insert into quote_events (tenant_id, quotation_id, type, actor_id, created_at)
          values (${tId}, ${q.id}, ${type}, ${creator}, ${at})`;
      }
    }
    await sql`insert into quote_sequences (tenant_id, fy, last_value) values (${tId}, ${fy}, ${seq})
      on conflict (tenant_id, fy) do update set last_value = ${seq}`;
    console.log(`✓ ${slug}: ${nQuotes} quotes`);
  }

  console.log("\nSeed complete. Logins (password: demo1234):");
  console.log("  CEO         → ceo@heseos.in");
  console.log("  Dealer      → admin@acme.in / sales@acme.in");
  console.log("  SI          → admin@voltedge.in");
  console.log("  Distributor → admin@sungrid.in");
  await sql.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
