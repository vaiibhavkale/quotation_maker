import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import postgres from "postgres";

async function main() {
  const url = process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL;
  if (!url) throw new Error("Set DIRECT_DATABASE_URL (or DATABASE_URL) first");
  const sql = postgres(url, { max: 1, prepare: false });

  const dir = join(process.cwd(), "src", "db", "migrations");
  const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();

  for (const file of files) {
    console.log(`→ applying ${file}`);
    const ddl = readFileSync(join(dir, file), "utf8");
    await sql.unsafe(ddl);
  }

  console.log("✓ migrations applied");
  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
