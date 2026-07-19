const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const initSqlJs = require("sql.js");

const TABLES = [
  "users",
  "sessions",
  "quiz_results",
  "events",
  "snapshots",
  "feedback",
  "agent_decisions",
  "interaction_evidence_snapshots"
];

function parseArgs(argv) {
  const args = {
    db: "",
    writeReport: "",
    compare: "",
    expectUnchanged: false,
    assertExternal: false
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--db") args.db = path.resolve(argv[++index] || "");
    else if (arg === "--write-report") args.writeReport = path.resolve(argv[++index] || "");
    else if (arg === "--compare") args.compare = path.resolve(argv[++index] || "");
    else if (arg === "--expect-unchanged") args.expectUnchanged = true;
    else if (arg === "--assert-external") args.assertExternal = true;
    else if (arg === "--help" || arg === "-h") {
      console.log("Usage: node ops/database-release-check.js --db <path> [--assert-external] [--write-report <json>] [--compare <json>] [--expect-unchanged]");
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (!args.db) throw new Error("--db is required.");
  return args;
}

function queryOne(database, sql) {
  const statement = database.prepare(sql);
  try {
    return statement.step() ? statement.getAsObject() : {};
  } finally {
    statement.free();
  }
}

function tableExists(database, table) {
  const statement = database.prepare("SELECT 1 AS ok FROM sqlite_master WHERE type='table' AND name=?");
  try {
    statement.bind([table]);
    return statement.step();
  } finally {
    statement.free();
  }
}

function workspaceContains(filePath) {
  const root = path.resolve(__dirname, "..");
  const relative = path.relative(root, filePath);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function compareReports(current, baseline, expectUnchanged) {
  const failures = [];
  for (const table of TABLES) {
    const before = Number(baseline.tables?.[table]?.rows || 0);
    const after = Number(current.tables?.[table]?.rows || 0);
    if (after < before) failures.push(`${table}: ${after} < ${before}`);
  }
  if (expectUnchanged && current.sha256 !== baseline.sha256) {
    failures.push(`SHA-256 changed: ${current.sha256} != ${baseline.sha256}`);
  }
  if (failures.length) {
    throw new Error(`Database release check failed:\n${failures.join("\n")}`);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!fs.existsSync(args.db) || !fs.statSync(args.db).isFile()) {
    throw new Error(`Database file not found: ${args.db}`);
  }
  if (args.assertExternal && workspaceContains(args.db)) {
    throw new Error("Database must be outside the code repository.");
  }

  const bytes = fs.readFileSync(args.db);
  const SQL = await initSqlJs();
  const database = new SQL.Database(bytes);
  const tables = {};
  for (const table of TABLES) {
    if (!tableExists(database, table)) {
      tables[table] = { rows: 0, missing: true, latest: "" };
      continue;
    }
    const columns = queryOne(database, `SELECT sql FROM sqlite_master WHERE type='table' AND name='${table}'`).sql || "";
    const hasCreatedAt = /\bcreated_at\b/i.test(columns);
    const row = queryOne(
      database,
      `SELECT COUNT(*) AS rows${hasCreatedAt ? ", MAX(created_at) AS latest" : ""} FROM ${table}`
    );
    tables[table] = {
      rows: Number(row.rows || 0),
      latest: row.latest || ""
    };
  }
  database.close();

  const report = {
    generatedAt: new Date().toISOString(),
    database: args.db,
    bytes: bytes.length,
    sha256: crypto.createHash("sha256").update(bytes).digest("hex").toUpperCase(),
    tables
  };

  if (args.compare) {
    const baseline = JSON.parse(fs.readFileSync(args.compare, "utf8"));
    compareReports(report, baseline, args.expectUnchanged);
  }
  if (args.writeReport) {
    fs.mkdirSync(path.dirname(args.writeReport), { recursive: true });
    fs.writeFileSync(args.writeReport, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  }

  console.log(`Database: ${report.database}`);
  console.log(`SHA-256: ${report.sha256}`);
  TABLES.forEach((table) => {
    const item = report.tables[table];
    console.log(`${table}: ${item.rows}${item.latest ? ` (latest ${item.latest})` : ""}`);
  });
  if (args.compare) console.log("Comparison passed: no tracked table lost rows.");
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
