import {
  pgTable, uuid, text, integer, bigint, timestamp, boolean, jsonb, index, uniqueIndex,
} from "drizzle-orm/pg-core";

/* ------------─ Geography ------------─ */

export const geoZones = pgTable("geo_zones", {
  id: text("id").primaryKey(), // north | south | east | west | central
  name: text("name").notNull(),
});

export const geoStates = pgTable("geo_states", {
  id: text("id").primaryKey(), // e.g. MH
  name: text("name").notNull(),
  zoneId: text("zone_id").notNull().references(() => geoZones.id),
  gstStateCode: text("gst_state_code").notNull(), // "27" for MH - drives CGST/SGST vs IGST
});

export const geoCities = pgTable("geo_cities", {
  id: text("id").primaryKey(), // e.g. MH-PUN
  name: text("name").notNull(),
  stateId: text("state_id").notNull().references(() => geoStates.id),
});

/* ------------─ Tenancy ------------─ */

export const tenants = pgTable("tenants", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  type: text("type").notNull(), // heseos | distributor | dealer | si | direct
  parentTenantId: uuid("parent_tenant_id"),
  zoneId: text("zone_id").references(() => geoZones.id),
  stateId: text("state_id").references(() => geoStates.id),
  cityId: text("city_id").references(() => geoCities.id),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const brandingProfiles = pgTable("branding_profiles", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id).unique(),
  displayName: text("display_name").notNull(),
  logoUrl: text("logo_url"),
  primaryColor: text("primary_color").notNull().default("#E8821E"),
  gstin: text("gstin"),
  address: text("address"),
  phone: text("phone"),
  email: text("email"),
  bankName: text("bank_name"),
  bankAccount: text("bank_account"),
  bankIfsc: text("bank_ifsc"),
  upiId: text("upi_id"),
  signatureName: text("signature_name"),
  terms: text("terms"),
  footerNote: text("footer_note"),
  poweredByHeseos: boolean("powered_by_heseos").notNull().default(true),
});

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const memberships = pgTable("memberships", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  role: text("role").notNull(), // super_admin | ceo | zone_manager | state_manager | partner_admin | partner_sales | viewer
  geoScope: jsonb("geo_scope"), // { zoneId?, stateId?, cityId? } for HESEOS managers
}, (t) => [uniqueIndex("memberships_user_tenant").on(t.userId, t.tenantId)]);

/* ------------─ CRM: Leads & Site Visits ------------─ */

export const leads = pgTable("leads", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  name: text("name").notNull(),
  phone: text("phone"),
  email: text("email"),
  source: text("source").notNull().default("referral"), // referral | website | walk_in | cold_call | partner
  notes: text("notes"),
  status: text("status").notNull().default("new"),
  // new | site_visit_scheduled | site_visit_done | converted | dropped
  dropReason: text("drop_reason"),
  assignedToId: uuid("assigned_to_id").references(() => users.id),
  customerId: uuid("customer_id").references(() => customers.id), // set once converted
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("leads_tenant_idx").on(t.tenantId)]);

export const siteVisits = pgTable("site_visits", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  leadId: uuid("lead_id").notNull().references(() => leads.id, { onDelete: "cascade" }),
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  engineerId: uuid("engineer_id").references(() => users.id),
  status: text("status").notNull().default("scheduled"), // scheduled | completed | cancelled
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ------------─ Project Management ------------─ */

export const projects = pgTable("projects", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  customerId: uuid("customer_id").notNull().references(() => customers.id),
  leadId: uuid("lead_id").references(() => leads.id),
  name: text("name").notNull(),
  address: text("address"),
  status: text("status").notNull().default("active"), // active | on_hold | completed | cancelled
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("projects_tenant_idx").on(t.tenantId)]);

/* ------------─ CRM: Customers ------------─ */

export const customers = pgTable("customers", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  name: text("name").notNull(),
  contactName: text("contact_name"),
  phone: text("phone"),
  email: text("email"),
  gstin: text("gstin"),
  billingAddress: text("billing_address"),
  stateId: text("state_id").references(() => geoStates.id), // place of supply
  cityId: text("city_id").references(() => geoCities.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("customers_tenant_idx").on(t.tenantId)]);

/* ------------─ Quotations ------------─ */
/* Money is stored as integer paise. */

export const quotations = pgTable("quotations", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  customerId: uuid("customer_id").notNull().references(() => customers.id),
  projectId: uuid("project_id").references(() => projects.id),
  createdById: uuid("created_by_id").notNull().references(() => users.id),
  number: text("number").notNull(), // ACME/QT/2026-27/00042
  title: text("title").notNull(),
  status: text("status").notNull().default("draft"),
  // draft | shared | viewed | negotiation | approved | converted | lost
  currentRevision: integer("current_revision").notNull().default(1),
  needsApproval: boolean("needs_approval").notNull().default(false),
  approvedById: uuid("approved_by_id").references(() => users.id),
  placeOfSupplyStateId: text("place_of_supply_state_id").references(() => geoStates.id),
  subtotal: bigint("subtotal", { mode: "number" }).notNull().default(0),
  discountTotal: bigint("discount_total", { mode: "number" }).notNull().default(0),
  cgst: bigint("cgst", { mode: "number" }).notNull().default(0),
  sgst: bigint("sgst", { mode: "number" }).notNull().default(0),
  igst: bigint("igst", { mode: "number" }).notNull().default(0),
  grandTotal: bigint("grand_total", { mode: "number" }).notNull().default(0),
  validUntil: timestamp("valid_until", { withTimezone: true }),
  lostReason: text("lost_reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("quotations_tenant_idx").on(t.tenantId),
  index("quotations_status_idx").on(t.status),
  uniqueIndex("quotations_number_tenant").on(t.tenantId, t.number),
]);

export const quoteItems = pgTable("quote_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  quotationId: uuid("quotation_id").notNull().references(() => quotations.id, { onDelete: "cascade" }),
  position: integer("position").notNull().default(0),
  description: text("description").notNull(),
  hsnCode: text("hsn_code"),
  unit: text("unit").notNull().default("nos"),
  quantity: integer("quantity").notNull().default(1), // stored ×100 (2 decimals)
  rate: bigint("rate", { mode: "number" }).notNull().default(0), // paise per unit
  discountPct: integer("discount_pct").notNull().default(0), // ×100 (2 decimals)
  gstRatePct: integer("gst_rate_pct").notNull().default(1800), // ×100 → 18.00%
  lineTotal: bigint("line_total", { mode: "number" }).notNull().default(0), // paise, after discount, pre-tax
}, (t) => [index("quote_items_quote_idx").on(t.quotationId)]);

export const quoteRevisions = pgTable("quote_revisions", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  quotationId: uuid("quotation_id").notNull().references(() => quotations.id, { onDelete: "cascade" }),
  revisionNo: integer("revision_no").notNull(),
  snapshot: jsonb("snapshot").notNull(), // full quote + items + totals at this revision
  reason: text("reason"),
  createdById: uuid("created_by_id").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("quote_revisions_unique").on(t.quotationId, t.revisionNo)]);

export const quoteShares = pgTable("quote_shares", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  quotationId: uuid("quotation_id").notNull().references(() => quotations.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  channel: text("channel").notNull().default("link"), // whatsapp | email | link
  revoked: boolean("revoked").notNull().default(false),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const quoteEvents = pgTable("quote_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  quotationId: uuid("quotation_id").notNull().references(() => quotations.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  // created | shared | viewed | downloaded | negotiation | revised | approved | converted | lost | accepted_online
  actorId: uuid("actor_id"),
  meta: jsonb("meta"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("quote_events_quote_idx").on(t.quotationId),
  index("quote_events_tenant_type_idx").on(t.tenantId, t.type),
]);

export const quoteSequences = pgTable("quote_sequences", {
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  fy: text("fy").notNull(), // 2026-27
  lastValue: integer("last_value").notNull().default(0),
}, (t) => [uniqueIndex("quote_sequences_pk").on(t.tenantId, t.fy)]);

/* ------------─ Order Conversion ------------─ */

export const orders = pgTable("orders", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  quotationId: uuid("quotation_id").notNull().references(() => quotations.id).unique(),
  orderNumber: text("order_number").notNull(),
  stage: text("stage").notNull().default("production"),
  // production | dispatch | installation | completed
  advanceReceived: bigint("advance_received", { mode: "number" }).notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("orders_tenant_idx").on(t.tenantId)]);

export const orderEvents = pgTable("order_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  orderId: uuid("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  type: text("type").notNull(), // created | production | dispatch | installation | completed
  actorId: uuid("actor_id"),
  meta: jsonb("meta"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ------------─ Notifications ------------─ */

export const notifications = pgTable("notifications", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  userId: uuid("user_id"), // null = broadcast to every admin/leadership in scope
  type: text("type").notNull(),
  // ageing_unviewed | ageing_silent | approval_needed | quote_viewed | site_visit_due
  title: text("title").notNull(),
  body: text("body"),
  link: text("link"),
  dedupeKey: text("dedupe_key"), // prevents re-notifying the same condition
  readAt: timestamp("read_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("notifications_tenant_idx").on(t.tenantId),
  uniqueIndex("notifications_dedupe").on(t.tenantId, t.dedupeKey),
]);

/* ------------─ AI usage / rate limiting ------------─ */

export const aiRequests = pgTable("ai_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  userId: uuid("user_id").notNull().references(() => users.id),
  endpoint: text("endpoint").notNull(), // ask | followup
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("ai_requests_user_window_idx").on(t.userId, t.createdAt)]);

/* ------------─ Platform ------------─ */

export const auditLogs = pgTable("audit_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id"),
  actorId: uuid("actor_id"),
  entity: text("entity").notNull(),
  entityId: text("entity_id"),
  action: text("action").notNull(),
  detail: jsonb("detail"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("audit_tenant_idx").on(t.tenantId)]);
