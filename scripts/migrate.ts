import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import postgres from "postgres";

// Tracks applied migrations in a ledger table so each file runs exactly
// once, ever - re-running this script (e.g. after adding a new migration)
// no longer replays already-applied files. Idempotent DDL (if not exists /
// if exists) is still good practice, but it isn't a substitute for this:
// 0001_fix_rls.sql's `create policy` statements had no built-in re-run
// guard and broke a naive "just replay every file" runner the first time
// a new migration was added after it.
async function main() {
  const url = process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL;
  if (!url) throw new Error("Set DIRECT_DATABASE_URL (or DATABASE_URL) first");
  const sql = postgres(url, { max: 1, prepare: false, ssl: "require" });

  await sql`
    create table if not exists schema_migrations (
      filename text primary key,
      applied_at timestamptz not null default now()
    )
  `;

  const dir = join(process.cwd(), "src", "db", "migrations");
  const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();

  const applied = new Set(
    (await sql`select filename from schema_migrations`).map((r) => r.filename)
  );

  let ranAny = false;
  for (const file of files) {
    if (applied.has(file)) {
      console.log(`= skipping ${file} (already applied)`);
      continue;
    }
    console.log(`→ applying ${file}`);
    const ddl = readFileSync(join(dir, file), "utf8");
    await sql.unsafe(ddl);
    await sql`insert into schema_migrations (filename) values (${file})`;
    ranAny = true;
  }

  console.log(ranAny ? "✓ migrations applied" : "✓ nothing to apply, up to date");
  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
