/**
 * Local dev database: boots an embedded PostgreSQL (no system install required) with the
 * local development credentials documented in README.md. Data persists in ./.pgdata (gitignored).
 *
 *   npm run db:dev        # start (keeps running; Ctrl+C to stop)
 *
 * Production deployments should point DATABASE_URL at a managed PostgreSQL instead.
 */
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import EmbeddedPostgres from "embedded-postgres";

const DATA_DIR = resolve(__dirname, "..", ".pgdata");
const USER = "auditly";
const PASSWORD = "auditly";
const DATABASE = "auditly";
const PORT = 5432;

const pg = new EmbeddedPostgres({
  databaseDir: DATA_DIR,
  user: USER,
  password: PASSWORD,
  port: PORT,
  persistent: true,
  // Force UTF-8 — Windows locales otherwise initialize the cluster as WIN1252, which
  // rejects characters like "→" that appear in findings and alerts.
  initdbFlags: ["--encoding=UTF8", "--locale=C"],
});

async function main() {
  const alreadyInitialized = existsSync(resolve(DATA_DIR, "PG_VERSION"));
  if (!alreadyInitialized) {
    console.log(`Initializing embedded PostgreSQL cluster in ${DATA_DIR}…`);
    await pg.initialise();
  }

  await pg.start();

  try {
    await pg.createDatabase(DATABASE);
    console.log(`Created database "${DATABASE}".`);
  } catch {
    // already exists — fine
  }

  console.log(`PostgreSQL ready on port ${PORT} (database "${DATABASE}")`);
  console.log("Press Ctrl+C to stop.");

  const stop = async () => {
    console.log("\nStopping embedded PostgreSQL…");
    await pg.stop().catch(() => {});
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}

main().catch(async (err) => {
  console.error(err);
  await pg.stop().catch(() => {});
  process.exit(1);
});
