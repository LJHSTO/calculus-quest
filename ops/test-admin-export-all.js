const assert = require("node:assert/strict");
const fs = require("node:fs");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => resolve(address.port));
    });
  });
}

async function waitForHealth(baseUrl, child, logs) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (child.exitCode !== null) {
      throw new Error(`server exited early (${child.exitCode})\n${logs.join("")}`);
    }
    try {
      const response = await fetch(baseUrl + "/api/health");
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`server health timeout\n${logs.join("")}`);
}

async function stopChild(child) {
  if (!child || child.exitCode !== null) return;
  child.kill("SIGTERM");
  await Promise.race([
    new Promise((resolve) => child.once("exit", resolve)),
    new Promise((resolve) => setTimeout(resolve, 4000))
  ]);
  if (child.exitCode === null) child.kill("SIGKILL");
}

async function adminStats(baseUrl, token, name, params = "") {
  const response = await fetch(
    `${baseUrl}/api/admin/stats/${name}${params ? `?${params}` : ""}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const payload = await response.json().catch(() => ({}));
  assert.equal(response.status, 200, `${name}: ${JSON.stringify(payload)}`);
  assert.equal(payload.ok, true);
  return payload.data;
}

function assertPage(page, expected) {
  assert.equal(Array.isArray(page.rows), true);
  assert.equal(page.rows.length, expected.rows);
  assert.equal(page.total, expected.total);
  assert.equal(page.limit, expected.limit);
  assert.equal(page.offset, expected.offset);
}

async function main() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cq-admin-export-all-"));
  const dbPath = path.join(tmpDir, "admin-export-all.db");
  const previousDbPath = process.env.DB_PATH;
  process.env.DB_PATH = dbPath;
  const db = require("../db");
  await db.getDb();

  const userId = "admin-export-user";
  db.upsertUser(userId, "导出测试用户", "2026-07-18T08:00:00.000+08:00", "2026-07-18T08:00:00.000+08:00");
  for (let index = 0; index < 3; index += 1) {
    const createdAt = `2026-07-18T08:00:0${index}.000+08:00`;
    db.insertFeedback({
      id: `feedback-${index}`,
      user_id: userId,
      feedback_type: "platform",
      content: `反馈 ${index}`,
      target_scope: "global",
      created_at: createdAt
    });
    db.insertQuizResult({
      id: `short-${index}`,
      user_id: userId,
      chapter_id: "V14-C1",
      chapter_label: "函数、极限与导数入口",
      unit_id: "V14-C1-M1-pre",
      unit_label: "输入、输出和函数规则 · 前测",
      question_id: `short-question-${index}`,
      question_type: "short_answer",
      phase: "pre",
      response: `答案 ${index}`,
      is_correct: -1,
      status: "pending_review",
      score: 0,
      max_score: 1,
      created_at: createdAt
    });
    db.insertEvent({
      id: `interaction-${index}`,
      user_id: userId,
      type: "interaction",
      payload: {
        eventType: "ui_click",
        data: { label: `按钮 ${index}` }
      },
      created_at: createdAt
    });
    db.insertAgentDecision({
      id: `decision-${index}`,
      user_id: userId,
      agent_type: "orchestrator",
      decision_type: "plan",
      input_summary: { chapterId: "V14-C1", currentUnitId: "V14-C1-M1-pre" },
      output_summary: { suggestedAction: "continue" },
      confidence: 0.8,
      llm_provider: "mock",
      latency_ms: 1,
      created_at: createdAt
    });
  }
  db.saveNow();

  const port = await freePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const adminToken = "admin-export-token";
  const logs = [];
  let child;

  try {
    child = spawn(process.execPath, ["server.js", String(port)], {
      cwd: path.resolve(__dirname, ".."),
      env: {
        ...process.env,
        DB_PATH: dbPath,
        HOST: "127.0.0.1",
        ADMIN_TOKEN: adminToken,
        LLM_PROVIDER: "mock",
        NODE_ENV: "development"
      },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true
    });
    child.stdout.on("data", (chunk) => logs.push(chunk.toString()));
    child.stderr.on("data", (chunk) => logs.push(chunk.toString()));
    await waitForHealth(baseUrl, child, logs);

    for (const endpoint of [
      "feedback",
      "short-answer-responses",
      "interactions",
      "agentic-decision-trace"
    ]) {
      const detail = endpoint === "interactions" ? "&detail=all" : "";
      const first = await adminStats(baseUrl, adminToken, endpoint, `limit=2&offset=0${detail}`);
      const second = await adminStats(baseUrl, adminToken, endpoint, `limit=2&offset=2${detail}`);
      assertPage(first, { rows: 2, total: 3, limit: 2, offset: 0 });
      assertPage(second, { rows: 1, total: 3, limit: 2, offset: 2 });
      assert.equal(
        new Set([...first.rows, ...second.rows].map((row) => row.id)).size,
        3,
        `${endpoint} should export every matching row exactly once`
      );
    }

    console.log("admin export-all pagination tests passed");
  } finally {
    await stopChild(child);
    if (previousDbPath === undefined) delete process.env.DB_PATH;
    else process.env.DB_PATH = previousDbPath;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
