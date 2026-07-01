const fs = require("fs");
const path = require("path");
const initSqlJs = require("sql.js");

const DEFAULT_FEATURE_DB = path.resolve(__dirname, "..", "data", "calculus-quest.db");
const DEFAULT_MAIN_DB = path.resolve(__dirname, "..", "..", "Demo", "data", "calculus-quest.db");
const DEFAULT_MAIN_HEALTH_URL = "http://127.0.0.1:3789/api/health";
const TABLES = [
  "users",
  "sessions",
  "quiz_results",
  "events",
  "snapshots",
  "agent_decisions",
  "interaction_evidence_snapshots"
];

function parseArgs(argv) {
  const args = {
    feature: DEFAULT_FEATURE_DB,
    main: DEFAULT_MAIN_DB,
    write: false,
    backupDir: "",
    mainHealthUrl: DEFAULT_MAIN_HEALTH_URL,
    allowRunningMain: false
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--write") args.write = true;
    else if (arg === "--feature") args.feature = path.resolve(argv[++i] || "");
    else if (arg === "--main") args.main = path.resolve(argv[++i] || "");
    else if (arg === "--backup-dir") args.backupDir = path.resolve(argv[++i] || "");
    else if (arg === "--main-health-url") args.mainHealthUrl = argv[++i] || "";
    else if (arg === "--allow-running-main") args.allowRunningMain = true;
    else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return args;
}

function printHelp() {
  console.log(`Usage: node ops/merge-feature-db-to-main.js [--write] [--feature path] [--main path] [--backup-dir path] [--allow-running-main]

Default mode is dry-run. Add --write to create a timestamped backup and merge rows into main.
The merge is idempotent: existing primary keys are ignored, missing columns/tables are added from feature schema.
By default, --write refuses to run while the main health URL is reachable because sql.js may overwrite disk state from memory.`);
}

function assertFile(filePath, label) {
  if (!filePath || !fs.existsSync(filePath)) throw new Error(`${label} DB not found: ${filePath}`);
  if (!fs.statSync(filePath).isFile()) throw new Error(`${label} DB path is not a file: ${filePath}`);
}

function queryAll(db, sql, params = []) {
  const stmt = db.prepare(sql);
  try {
    stmt.bind(params);
    const rows = [];
    while (stmt.step()) rows.push(stmt.getAsObject());
    return rows;
  } finally {
    stmt.free();
  }
}

function queryOne(db, sql, params = []) {
  return queryAll(db, sql, params)[0] || {};
}

function tableExists(db, table) {
  return queryAll(db, "SELECT name FROM sqlite_master WHERE type='table' AND name=?", [table]).length > 0;
}

function tableColumns(db, table) {
  if (!tableExists(db, table)) return [];
  return queryAll(db, `PRAGMA table_info(${table})`);
}

function columnNames(db, table) {
  return tableColumns(db, table).map((row) => row.name);
}

function createSql(db, table) {
  return queryOne(db, "SELECT sql FROM sqlite_master WHERE type='table' AND name=?", [table]).sql || "";
}

function indexSql(db, table) {
  return queryAll(db, "SELECT name, sql FROM sqlite_master WHERE type='index' AND tbl_name=? AND sql IS NOT NULL", [table]);
}

function primaryKeyColumns(db, table) {
  return tableColumns(db, table)
    .filter((row) => Number(row.pk) > 0)
    .sort((a, b) => Number(a.pk) - Number(b.pk))
    .map((row) => row.name);
}

function countRows(db, table) {
  if (!tableExists(db, table)) return 0;
  return Number(queryOne(db, `SELECT COUNT(*) AS count FROM ${table}`).count || 0);
}

function maxCreatedAt(db, table) {
  const cols = columnNames(db, table);
  if (!cols.includes("created_at")) return "";
  return queryOne(db, `SELECT MAX(created_at) AS value FROM ${table}`).value || "";
}

function rowKeyWhere(cols) {
  return cols.map((col) => `${col} = ?`).join(" AND ");
}

function rowExists(db, table, keyCols, row) {
  if (!keyCols.length) return false;
  const where = rowKeyWhere(keyCols);
  const values = keyCols.map((col) => row[col]);
  return Boolean(queryOne(db, `SELECT 1 AS ok FROM ${table} WHERE ${where} LIMIT 1`, values).ok);
}

function missingColumns(main, feature, table) {
  const mainCols = new Set(columnNames(main, table));
  return tableColumns(feature, table).filter((col) => !mainCols.has(col.name));
}

function addMissingColumns(main, feature, table) {
  const added = [];
  for (const col of missingColumns(main, feature, table)) {
    let sql = `ALTER TABLE ${table} ADD COLUMN ${col.name} ${col.type || "TEXT"}`;
    if (col.dflt_value !== null && col.dflt_value !== undefined) sql += ` DEFAULT ${col.dflt_value}`;
    main.run(sql);
    added.push(col.name);
  }
  return added;
}

function ensureTable(main, feature, table) {
  if (tableExists(main, table)) return { created: false, indexes: [] };
  const sql = createSql(feature, table);
  if (!sql) throw new Error(`No CREATE TABLE SQL found for ${table}`);
  main.run(sql);
  const indexes = [];
  for (const idx of indexSql(feature, table)) {
    try {
      main.run(idx.sql);
      indexes.push(idx.name);
    } catch {
      // Index may already exist with a compatible name; table creation is the important part.
    }
  }
  return { created: true, indexes };
}

function diffTable(main, feature, table) {
  if (!tableExists(feature, table)) return { table, featureMissing: true };
  const featureCount = countRows(feature, table);
  const mainCountBefore = countRows(main, table);
  const mainHasTable = tableExists(main, table);
  const keyCols = primaryKeyColumns(feature, table);
  const mainCols = mainHasTable ? columnNames(main, table) : [];
  const featureCols = columnNames(feature, table).filter((col) => !mainHasTable || mainCols.includes(col));
  let insertable = 0;
  if (mainHasTable && keyCols.length && featureCols.length) {
    const rows = queryAll(feature, `SELECT ${featureCols.join(",")} FROM ${table}`);
    insertable = rows.filter((row) => !rowExists(main, table, keyCols, row)).length;
  } else if (!mainHasTable) {
    insertable = featureCount;
  }
  return {
    table,
    mainHasTable,
    featureCount,
    mainCountBefore,
    insertable,
    missingColumns: mainHasTable ? missingColumns(main, feature, table).map((col) => col.name) : columnNames(feature, table),
    maxCreatedAtFeature: maxCreatedAt(feature, table),
    maxCreatedAtMainBefore: mainHasTable ? maxCreatedAt(main, table) : ""
  };
}

function insertMissingRows(main, feature, table) {
  const mainCols = columnNames(main, table);
  const featureCols = columnNames(feature, table).filter((col) => mainCols.includes(col));
  if (!featureCols.length) return 0;
  const placeholders = featureCols.map(() => "?").join(",");
  const insert = main.prepare(`INSERT OR IGNORE INTO ${table} (${featureCols.join(",")}) VALUES (${placeholders})`);
  const rows = queryAll(feature, `SELECT ${featureCols.join(",")} FROM ${table}`);
  let inserted = 0;
  try {
    for (const row of rows) {
      insert.run(featureCols.map((col) => row[col]));
      inserted += main.getRowsModified();
    }
  } finally {
    insert.free();
  }
  return inserted;
}

function timestamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function backupMainDb(mainPath, backupDir = "") {
  const dir = backupDir || path.dirname(mainPath);
  fs.mkdirSync(dir, { recursive: true });
  const backupPath = path.join(dir, `calculus-quest.before-feature-merge.${timestamp()}.db`);
  fs.copyFileSync(mainPath, backupPath);
  return backupPath;
}

function writeDatabase(db, dbPath) {
  const tmp = `${dbPath}.merge.tmp`;
  fs.writeFileSync(tmp, Buffer.from(db.export()));
  fs.renameSync(tmp, dbPath);
}

async function mainServiceHealth(url) {
  if (!url) return { checked: false, running: false, url: "" };
  if (typeof fetch !== "function") return { checked: false, running: false, url, reason: "fetch_unavailable" };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 1500);
  try {
    const res = await fetch(url, { signal: controller.signal });
    return { checked: true, running: res.ok, status: res.status, url };
  } catch (err) {
    return { checked: true, running: false, url, reason: err.name === "AbortError" ? "timeout" : "unreachable" };
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  assertFile(args.feature, "Feature");
  assertFile(args.main, "Main");

  const SQL = await initSqlJs();
  const feature = new SQL.Database(fs.readFileSync(args.feature));
  const mainDb = new SQL.Database(fs.readFileSync(args.main));
  const before = TABLES.map((table) => diffTable(mainDb, feature, table));

  let backupPath = "";
  const writes = [];
  const health = await mainServiceHealth(args.mainHealthUrl);
  if (args.write) {
    if (health.running && !args.allowRunningMain) {
      throw new Error(`Main service is running at ${health.url}. Stop main first, or re-run with --allow-running-main if you understand sql.js overwrite risk.`);
    }
    backupPath = backupMainDb(args.main, args.backupDir);
    mainDb.run("PRAGMA foreign_keys = OFF");
    mainDb.run("BEGIN TRANSACTION");
    try {
      for (const table of TABLES) {
        if (!tableExists(feature, table)) continue;
        const ensured = ensureTable(mainDb, feature, table);
        const addedColumns = ensured.created ? [] : addMissingColumns(mainDb, feature, table);
        const inserted = insertMissingRows(mainDb, feature, table);
        writes.push({ table, created: ensured.created, addedColumns, indexes: ensured.indexes, inserted });
      }
      mainDb.run("COMMIT");
      writeDatabase(mainDb, args.main);
    } catch (err) {
      try { mainDb.run("ROLLBACK"); } catch {}
      throw err;
    }
  }

  const after = TABLES.map((table) => ({
    table,
    mainCountAfter: countRows(mainDb, table),
    maxCreatedAtMainAfter: maxCreatedAt(mainDb, table)
  }));
  feature.close();
  mainDb.close();

  console.log(JSON.stringify({
    ok: true,
    mode: args.write ? "write" : "dry-run",
    feature: args.feature,
    main: args.main,
    backupPath,
    mainService: health,
    before,
    writes,
    after,
    note: args.write
      ? "Merge completed. Restart main service only if it was running with an already-loaded sql.js database."
      : "Dry-run only. Re-run with --write to create a backup and merge."
  }, null, 2));
}

main().catch((err) => {
  console.error(JSON.stringify({ ok: false, error: err.message }, null, 2));
  process.exit(1);
});
