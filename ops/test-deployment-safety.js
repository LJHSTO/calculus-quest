const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cq-deployment-safety-"));
process.env.DB_PATH = path.join(tmpDir, "production.db");
const serverSource = fs.readFileSync(path.join(root, "server.js"), "utf8");

const db = require("../db");

const info = db.databaseSafetyInfo();
assert.equal(info.configured, true);
assert.equal(info.externalToWorkspace, true);
assert.equal(db.clearLearningDataForUser, undefined);

db.acquireWriteLock();
assert.equal(fs.existsSync(info.lockPath), true);
db.acquireWriteLock();
db.releaseWriteLock();
assert.equal(fs.existsSync(info.lockPath), false);

const missingPath = spawnSync(process.execPath, ["-e", "require('./db')"], {
  cwd: root,
  encoding: "utf8",
  env: {
    ...process.env,
    NODE_ENV: "production",
    DB_PATH: ""
  }
});
assert.notEqual(missingPath.status, 0);
assert.match(`${missingPath.stdout}\n${missingPath.stderr}`, /requires DB_PATH/);
assert.match(serverSource, /POST" && url\.pathname === "\/api\/admin\/shutdown"/);
assert.match(serverSource, /shutdown\("ADMIN_SHUTDOWN"\)/);

async function verifyAtomicImmediateSave() {
  await db.getDb();
  const originalRenameSync = fs.renameSync;
  let replaceCount = 0;
  fs.renameSync = (source, destination) => {
    if (path.resolve(destination) === path.resolve(info.path)) replaceCount += 1;
    return originalRenameSync(source, destination);
  };
  try {
    db.saveNow();
    db.upsertUser(
      "deployment-safety-user",
      "发布安全测试",
      "2026-07-19T08:00:00.000+08:00",
      "2026-07-19T08:00:00.000+08:00"
    );
    db.saveNow();
  } finally {
    fs.renameSync = originalRenameSync;
  }
  assert.equal(replaceCount, 2, "saveNow must atomically replace both new and existing database files");
  assert.equal(fs.existsSync(info.path), true);
  assert.equal(fs.existsSync(`${info.path}.tmp`), false);
}

verifyAtomicImmediateSave()
  .then(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    console.log("deployment safety tests passed");
  })
  .catch((error) => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
