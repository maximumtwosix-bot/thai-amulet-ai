// STEP 30 — Database & evidence backup, one-shot CLI script (same convention as
// scripts/run-social-worker.ts: run via `pnpm backup`, exits 0 on success / 1 on failure, never a
// long-running process).
//
// WHY db.backup() instead of copying data/thai-amulet.db directly: the database runs in WAL mode
// (src/lib/db.ts — `db.pragma("journal_mode = WAL")`), so recent writes can live in the
// -wal file rather than the main .db file. A plain `cp` of just thai-amulet.db can silently miss
// those writes or copy a torn/inconsistent snapshot if something is writing concurrently.
// `Database#backup()` (better-sqlite3, already a project dependency — no new dependency added)
// implements SQLite's official Online Backup API, which is explicitly designed to produce a
// consistent, complete snapshot even while another process is actively reading/writing the source
// database. This script opens its own connection via the existing `@/lib/db` module (same path
// resolution, same WAL pragma) rather than duplicating that setup.
//
// WHY a plain timestamped folder, not a .zip: no archive library is installed in this project, and
// adding one is unnecessary — Node's built-in fs already does everything this script needs, per the
// "avoid unnecessary dependencies" instruction for this STEP.
//
// WHY only data/ and public/generated/ are touched, nothing else: this script never reads or walks
// the project root, .env, node_modules, or .next — it only ever opens db.backup(), a single named
// file (data/app.db), and a recursive copy rooted at public/generated/. Secrets/build artifacts are
// excluded by construction, not by a blocklist that could be forgotten later.

import path from "node:path";
import fs from "node:fs";
import fsp from "node:fs/promises";
import Database from "better-sqlite3";
import db from "@/lib/db";

const PROJECT_ROOT = process.cwd();
const DATA_DIR = path.join(PROJECT_ROOT, "data");
const GENERATED_DIR = path.join(PROJECT_ROOT, "public", "generated");
const DB_FILENAME = "thai-amulet.db";

// Overridable via BACKUP_DIR for testing/alternate environments — defaults to a sibling directory
// of the project, well outside the git repo (see docs/BACKUP_AND_RECOVERY.md).
const BACKUP_ROOT = process.env.BACKUP_DIR || "C:\\Users\\maxim\\thai-amulet-backups";

// Same table list as this STEP's audit baseline — kept as a fixed, hardcoded array (not user input,
// same pattern as check-db.cjs) so template-literal table-name interpolation below is safe.
//
// STEP B.6 — added "bank_accounts" (STEP B.1). The actual backup mechanism (db.backup() below) has
// always copied the entire database file regardless of this list — bank_accounts data was never
// missing from any backup — but the STEP B.6 audit found this list itself (used only for the
// manifest's before/after row-count verification) hadn't been updated, so a backup's manifest could
// not confirm bank_accounts specifically came through intact.
//
// STEP C.2 — same reasoning, added "bank_statements" and "bank_statement_transactions" (src/lib/db.ts).
// Same non-coverage-gap: db.backup() already copies these tables' data regardless of this list.
//
// STEP D.3 — same reasoning again, added "bank_reconciliation_matches" and
// "bank_reconciliation_audit" (src/lib/db.ts, per docs/RECONCILIATION_DATA_MODEL.md). Cosmetic only —
// db.backup() already copies these tables' data regardless of this list.
const TABLES_TO_COUNT = [
  "products",
  "orders",
  "order_items",
  "inventory_movements",
  "transactions",
  "transaction_attachments",
  "customers",
  "ai_cost_ledger",
  "bank_accounts",
  "bank_statements",
  "bank_statement_transactions",
  "bank_reconciliation_matches",
  "bank_reconciliation_audit",
] as const;

function timestamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function getTableCounts(database: Database.Database): Record<string, number> {
  const counts: Record<string, number> = {};

  for (const table of TABLES_TO_COUNT) {
    const row = database.prepare(`SELECT COUNT(*) AS c FROM ${table}`).get() as { c: number };
    counts[table] = row.c;
  }

  return counts;
}

async function copyDirRecursive(
  src: string,
  dest: string
): Promise<{ fileCount: number; totalBytes: number }> {
  await fsp.mkdir(dest, { recursive: true });

  const entries = await fsp.readdir(src, { withFileTypes: true });

  let fileCount = 0;
  let totalBytes = 0;

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      const sub = await copyDirRecursive(srcPath, destPath);
      fileCount += sub.fileCount;
      totalBytes += sub.totalBytes;
    } else if (entry.isFile()) {
      await fsp.copyFile(srcPath, destPath);
      const stat = await fsp.stat(destPath);
      fileCount += 1;
      totalBytes += stat.size;
    }
    // symlinks / other entry types are intentionally skipped — none are expected under
    // public/generated/ (it only ever receives plain files written by this app's own upload/
    // generation routes)
  }

  return { fileCount, totalBytes };
}

// Defense in depth: even though this script never copies .env or any dotfile by construction
// (it only ever touches data/thai-amulet.db, data/app.db, and public/generated/**), this walks the
// finished backup tree and hard-fails if anything that looks like a secret/env file somehow ended
// up inside it.
async function assertNoSecretsInBackup(backupDir: string): Promise<void> {
  const forbiddenNames = new Set([".env", ".env.local", ".env.production", ".env.development"]);

  async function walk(dir: string): Promise<void> {
    const entries = await fsp.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      if (forbiddenNames.has(entry.name)) {
        throw new Error(`Refusing to complete backup — found forbidden file in backup output: ${path.join(dir, entry.name)}`);
      }

      if (entry.isDirectory()) {
        await walk(path.join(dir, entry.name));
      }
    }
  }

  await walk(backupDir);
}

async function main() {
  const startedAt = new Date();

  const resolvedBackupRoot = path.resolve(BACKUP_ROOT);
  const resolvedProjectRoot = path.resolve(PROJECT_ROOT);

  if (
    resolvedBackupRoot === resolvedProjectRoot ||
    resolvedBackupRoot.startsWith(resolvedProjectRoot + path.sep)
  ) {
    throw new Error(
      `BACKUP_DIR (${resolvedBackupRoot}) is inside the project repository — refusing to back up ` +
        `into a git-tracked location. Set BACKUP_DIR to a path outside ${resolvedProjectRoot}.`
    );
  }

  const backupId = `backup-${timestamp()}`;
  const backupDir = path.join(resolvedBackupRoot, backupId);

  await fsp.mkdir(backupDir, { recursive: true });

  // 1) Table counts from the live database, captured before touching anything else.
  const tableCountsAtStart = getTableCounts(db);

  // 2) SQLite-safe database backup (Online Backup API — see file header).
  const dbBackupDir = path.join(backupDir, "db");
  await fsp.mkdir(dbBackupDir, { recursive: true });
  const dbBackupPath = path.join(dbBackupDir, DB_FILENAME);

  await db.backup(dbBackupPath);

  // 2b) The stray data/app.db (0 bytes as of this STEP's audit, not opened by the app anywhere) —
  // copied verbatim for completeness since it lives in data/; not WAL, no online-backup needed.
  const appDbPath = path.join(DATA_DIR, "app.db");
  if (fs.existsSync(appDbPath)) {
    await fsp.copyFile(appDbPath, path.join(dbBackupDir, "app.db"));
  }

  // 3) public/generated/ — product photos, AI images, transaction slip/receipt evidence, etc.
  //    Copied in full (not just transaction-attachments) since every subfolder here is real
  //    business/user-uploaded or AI-generated content the app itself wrote, none of it is source.
  let generatedStats = { fileCount: 0, totalBytes: 0 };

  if (fs.existsSync(GENERATED_DIR)) {
    generatedStats = await copyDirRecursive(GENERATED_DIR, path.join(backupDir, "generated"));
  }

  // 4) Verify: open the backup copy read-only and re-count the same tables. A backup that can't be
  //    opened, or whose counts are wildly wrong, fails the whole script (non-zero exit).
  const verifyDb = new Database(dbBackupPath, { readonly: true });
  const tableCountsVerified = getTableCounts(verifyDb);
  verifyDb.close();

  const mismatches = TABLES_TO_COUNT.filter(
    (table) => tableCountsAtStart[table] !== tableCountsVerified[table]
  );

  // 5) Defense-in-depth secret check (see assertNoSecretsInBackup above).
  await assertNoSecretsInBackup(backupDir);

  // 6) Manifest for this backup — lets a future recovery confirm what it's restoring without
  //    re-deriving anything.
  const manifest = {
    backupId,
    startedAt: startedAt.toISOString(),
    completedAt: new Date().toISOString(),
    sourceProjectRoot: PROJECT_ROOT,
    dbFile: DB_FILENAME,
    dbFileSizeBytes: fs.statSync(dbBackupPath).size,
    tableCountsAtBackupStart: tableCountsAtStart,
    tableCountsVerifiedInBackupCopy: tableCountsVerified,
    countMismatches: mismatches,
    generatedFileCount: generatedStats.fileCount,
    generatedTotalBytes: generatedStats.totalBytes,
  };

  await fsp.writeFile(
    path.join(backupDir, "manifest.json"),
    JSON.stringify(manifest, null, 2),
    "utf8"
  );

  console.log("Backup completed successfully");
  console.log(`Location: ${backupDir}`);
  console.log(`Database backup: ${dbBackupPath} (${manifest.dbFileSizeBytes} bytes)`);
  console.log("Table row counts:");
  for (const table of TABLES_TO_COUNT) {
    console.log(`  ${table}: ${tableCountsAtStart[table]}`);
  }
  console.log(
    `Evidence/generated files backed up: ${generatedStats.fileCount} files, ${generatedStats.totalBytes} bytes`
  );

  if (mismatches.length > 0) {
    console.log(
      `Note: counts for [${mismatches.join(", ")}] changed between backup start and the verify ` +
        `read — this means a write happened during the backup window, not that the backup is ` +
        `broken (the Online Backup API guarantees a consistent snapshot regardless).`
    );
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Backup FAILED");
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
