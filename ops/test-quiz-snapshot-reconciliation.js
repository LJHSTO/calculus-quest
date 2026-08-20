const assert = require("node:assert/strict");
const fs = require("node:fs");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

const route = require("../data/multi-scene-learning-route.json");
const courseAssessment = require("../lib/course-assessment");
const reconciliation = require("../lib/quiz-reconciliation");

const assessmentIndex = courseAssessment.buildAssessmentIndex(route);
const assessmentFingerprint = courseAssessment.assessmentFingerprint(route);

function questionText(entry) {
  return entry.question.question
    || entry.question.prompt
    || entry.question.title
    || entry.question.text
    || "";
}

function snapshotRecord(entry, overrides = {}) {
  const question = entry.question;
  const answer = Array.isArray(question.answer) ? [...question.answer] : question.answer ?? [];
  const response = question.type === "short_answer"
    ? "我会先写出定义，再结合题干条件说明判断依据。"
    : question.type === "multiple"
      ? answer
      : answer[0];
  return {
    id: `snapshot-${entry.unitId}-${question.id}`,
    unitId: entry.unitId,
    chapterId: entry.chapterId,
    phase: entry.phase,
    questionId: question.id,
    questionType: question.type,
    questionText: questionText(entry),
    answer,
    response,
    maxScore: Number(question.points || 0),
    points: Number(question.points || 0),
    isCorrect: question.type === "short_answer" ? null : true,
    status: question.type === "short_answer" ? "pending_review" : "correct",
    score: question.type === "short_answer" ? 0 : Number(question.points || 0),
    timestamp: "2026-08-19T10:00:00.000+08:00",
    ...overrides
  };
}

function findEntry(predicate, message = "the route must contain the requested assessment fixture") {
  const entry = Array.from(assessmentIndex.values()).find(predicate);
  assert.ok(entry, message);
  return entry;
}

function queryRows(db, sql, params = []) {
  const statement = db.getDbSync().prepare(sql);
  statement.bind(params);
  const rows = [];
  while (statement.step()) rows.push(statement.getAsObject());
  statement.free();
  return rows;
}

function buildRows({ userId, generation = 1, records, submittedUnits, fingerprint = assessmentFingerprint }) {
  return reconciliation.buildSnapshotQuizRecords({
    userId,
    generation,
    snapshot: {
      courseAssessmentFingerprint: fingerprint,
      submittedQuizzes: submittedUnits,
      quizResults: records,
      capturedAt: "2026-08-19T10:02:00.000+08:00"
    },
    assessmentIndex,
    courseAssessment,
    assessmentFingerprint,
    fallbackTimestamp: "2026-08-19T10:02:00.000+08:00"
  });
}

function testSnapshotValidation(objectiveEntry, shortEntry, adaptiveEntry) {
  const validRows = buildRows({
    userId: "validation-user",
    records: [snapshotRecord(objectiveEntry), snapshotRecord(shortEntry)],
    submittedUnits: [objectiveEntry.unitId, shortEntry.unitId]
  });
  assert.equal(validRows.length, 2);
  const objective = validRows.find((row) => row.question_id === objectiveEntry.question.id);
  const short = validRows.find((row) => row.question_id === shortEntry.question.id);
  assert.equal(objective.is_correct, 1, "objective results must be rescored from the current answer key");
  assert.equal(objective.score, objectiveEntry.question.points);
  assert.equal(short.status, "pending_review");
  assert.equal(short.is_correct, -1);

  const draftRows = buildRows({
    userId: "draft-user",
    records: [snapshotRecord(shortEntry)],
    submittedUnits: []
  });
  assert.equal(draftRows.length, 0, "a draft without a submitted marker must not become a result");

  const adaptiveRows = buildRows({
    userId: "adaptive-user",
    records: [snapshotRecord(adaptiveEntry)],
    submittedUnits: [adaptiveEntry.unitId]
  });
  assert.equal(adaptiveRows.length, 1, "v2 knowledge-point formative results must remain valid");
  assert.equal(adaptiveRows[0].unit_id, adaptiveEntry.unitId);

  const changedQuestionRows = buildRows({
    userId: "changed-question-user",
    records: [snapshotRecord(objectiveEntry, {
      questionText: "旧版本题面",
      answer: ["not-the-current-answer"]
    })],
    submittedUnits: [objectiveEntry.unitId],
    fingerprint: ""
  });
  assert.equal(changedQuestionRows.length, 0, "an old unversioned question must not be reinterpreted");

  const foreignFingerprintRows = buildRows({
    userId: "foreign-fingerprint-user",
    records: [snapshotRecord(objectiveEntry)],
    submittedUnits: [objectiveEntry.unitId],
    fingerprint: "another-assessment-version"
  });
  assert.equal(foreignFingerprintRows.length, 0, "a mismatched assessment fingerprint must reject the snapshot");
}

async function testDatabaseReconciliation(db, objectiveEntry, shortEntry) {
  const userId = "reconcile-db-user";
  const createdAt = "2026-08-19T09:00:00.000+08:00";
  db.upsertUser(userId, "快照对账", createdAt, createdAt);

  const pendingRows = buildRows({
    userId,
    records: [snapshotRecord(objectiveEntry), snapshotRecord(shortEntry)],
    submittedUnits: [objectiveEntry.unitId, shortEntry.unitId]
  });
  const first = db.reconcileQuizResults(pendingRows);
  assert.deepEqual(
    { inserted: first.inserted, updated: first.updated, skipped: first.skipped },
    { inserted: 2, updated: 0, skipped: 0 }
  );

  const repeated = db.reconcileQuizResults(pendingRows);
  assert.deepEqual(
    { inserted: repeated.inserted, updated: repeated.updated, skipped: repeated.skipped },
    { inserted: 0, updated: 0, skipped: 2 },
    "replaying the same snapshot must be idempotent"
  );

  const objectiveRow = queryRows(
    db,
    "SELECT * FROM quiz_results WHERE user_id = ? AND question_id = ?",
    [userId, objectiveEntry.question.id]
  )[0];
  db.getDbSync().run(
    "UPDATE quiz_results SET score = 0, is_correct = 0, status = 'manual_hold' WHERE id = ?",
    [objectiveRow.id]
  );
  db.reconcileQuizResults(pendingRows);
  const preservedObjective = queryRows(
    db,
    "SELECT score, is_correct, status FROM quiz_results WHERE id = ?",
    [objectiveRow.id]
  )[0];
  assert.deepEqual(
    preservedObjective,
    { score: 0, is_correct: 0, status: "manual_hold" },
    "existing objective evidence must not be overwritten"
  );

  const gradedShort = snapshotRecord(shortEntry, {
    aiScore: Number(shortEntry.question.points || 0),
    aiConfidence: 0.97,
    aiFeedback: "异步评分完成。",
    aiErrorType: "",
    isCorrect: true,
    status: "ai_reviewed",
    score: Number(shortEntry.question.points || 0)
  });
  const gradedRows = buildRows({
    userId,
    records: [snapshotRecord(objectiveEntry), gradedShort],
    submittedUnits: [objectiveEntry.unitId, shortEntry.unitId]
  });
  const graded = db.reconcileQuizResults(gradedRows);
  assert.deepEqual(
    { inserted: graded.inserted, updated: graded.updated },
    { inserted: 0, updated: 1 },
    "a completed short-answer review must update the pending row"
  );
  const repeatedGrade = db.reconcileQuizResults(gradedRows);
  assert.deepEqual(
    { inserted: repeatedGrade.inserted, updated: repeatedGrade.updated },
    { inserted: 0, updated: 0 }
  );

  const generationTwo = buildRows({
    userId,
    generation: 2,
    records: [snapshotRecord(objectiveEntry), gradedShort],
    submittedUnits: [objectiveEntry.unitId, shortEntry.unitId]
  });
  assert.equal(
    db.reconcileQuizResults(generationTwo).inserted,
    2,
    "a new learning generation must keep its own result rows"
  );

  const collisionUser = "reconcile-collision-user";
  db.upsertUser(collisionUser, "ID 冲突", createdAt, createdAt);
  db.insertQuizResult({
    ...pendingRows[0],
    id: "shared-client-id",
    user_id: collisionUser,
    unit_id: "legacy-unit",
    question_id: "legacy-question"
  });
  const collision = db.reconcileQuizResults([{
    ...pendingRows[0],
    id: "shared-client-id",
    user_id: collisionUser,
    unit_id: "new-unit",
    question_id: "new-question"
  }]);
  assert.equal(collision.inserted, 0, "an id collision must not attach to another logical result");
}

function freePort() {
  return new Promise((resolve, reject) => {
    const listener = net.createServer();
    listener.once("error", reject);
    listener.listen(0, "127.0.0.1", () => {
      const address = listener.address();
      listener.close(() => resolve(address.port));
    });
  });
}

async function requestJson(baseUrl, pathname, options = {}) {
  const headers = {};
  if (options.token) headers.Authorization = `Bearer ${options.token}`;
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  const response = await fetch(baseUrl + pathname, {
    method: options.method || "GET",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body)
  });
  return {
    response,
    payload: await response.json().catch(() => ({}))
  };
}

async function waitForHealth(baseUrl, child, logs) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (child.exitCode !== null) {
      throw new Error(`server exited early (${child.exitCode})\n${logs.join("")}`);
    }
    try {
      const response = await fetch(`${baseUrl}/api/health`);
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

async function testSnapshotApi(baseUrl, objectiveEntry, shortEntry) {
  const registered = await requestJson(baseUrl, "/api/auth/register", {
    method: "POST",
    body: {
      nickname: `v2快照对账${Date.now().toString().slice(-6)}`,
      email: "",
      password: "snapshot-reconciliation-123"
    }
  });
  assert.equal(registered.response.status, 200, JSON.stringify(registered.payload));
  const token = registered.payload.token;
  const initial = await requestJson(baseUrl, "/api/learning/snapshot", { token });
  assert.equal(initial.response.status, 200, JSON.stringify(initial.payload));

  const pendingSnapshot = {
    courseAssessmentFingerprint: assessmentFingerprint,
    submittedQuizzes: [objectiveEntry.unitId, shortEntry.unitId],
    quizResults: [snapshotRecord(objectiveEntry), snapshotRecord(shortEntry)],
    quizAttempts: {},
    capturedAt: "2026-08-19T10:02:00.000+08:00"
  };
  const saved = await requestJson(baseUrl, "/api/learning/snapshot", {
    method: "POST",
    token,
    body: {
      generation: initial.payload.generation,
      baseRevision: initial.payload.revision,
      reason: "snapshot_results_missing_from_table",
      snapshot: pendingSnapshot
    }
  });
  assert.equal(saved.response.status, 200, JSON.stringify(saved.payload));
  assert.deepEqual(
    {
      inserted: saved.payload.quizReconciliation?.inserted,
      updated: saved.payload.quizReconciliation?.updated,
      candidates: saved.payload.quizReconciliation?.candidates
    },
    { inserted: 2, updated: 0, candidates: 2 }
  );

  const gradedShort = snapshotRecord(shortEntry, {
    aiScore: Number(shortEntry.question.points || 0),
    aiConfidence: 0.98,
    aiFeedback: "快照中的异步评分已返回。",
    aiErrorType: "",
    isCorrect: true,
    status: "ai_reviewed",
    score: Number(shortEntry.question.points || 0)
  });
  const reviewed = await requestJson(baseUrl, "/api/learning/snapshot", {
    method: "POST",
    token,
    body: {
      generation: saved.payload.generation,
      baseRevision: saved.payload.revision,
      reason: "snapshot_short_answer_graded",
      snapshot: {
        ...pendingSnapshot,
        quizResults: [snapshotRecord(objectiveEntry), gradedShort],
        capturedAt: "2026-08-19T10:03:00.000+08:00"
      }
    }
  });
  assert.equal(reviewed.response.status, 200, JSON.stringify(reviewed.payload));
  assert.deepEqual(
    {
      inserted: reviewed.payload.quizReconciliation?.inserted,
      updated: reviewed.payload.quizReconciliation?.updated
    },
    { inserted: 0, updated: 1 }
  );

  const stored = await requestJson(baseUrl, "/api/learning/quiz-results", { token });
  assert.equal(stored.response.status, 200, JSON.stringify(stored.payload));
  const reviewedRow = stored.payload.data.find((row) => row.question_id === shortEntry.question.id);
  assert.ok(reviewedRow);
  assert.equal(reviewedRow.status, "ai_reviewed");
  assert.equal(Number(reviewedRow.ai_score), Number(shortEntry.question.points || 0));
}

async function testStartupRecovery(dbPath, db, objectiveEntry, shortEntry) {
  const userId = "startup-recovery-user";
  const createdAt = "2026-08-19T09:00:00.000+08:00";
  db.upsertUser(userId, "启动恢复", createdAt, createdAt);
  db.currentLearningGeneration(userId, createdAt);
  db.insertSnapshot({
    id: "startup-recovery-snapshot",
    user_id: userId,
    reason: "before_server_start",
    generation: 1,
    revision: 1,
    created_at: "2026-08-19T09:01:00.000+08:00",
    data: {
      courseAssessmentFingerprint: assessmentFingerprint,
      submittedQuizzes: [objectiveEntry.unitId, shortEntry.unitId],
      quizResults: [snapshotRecord(objectiveEntry), snapshotRecord(shortEntry)],
      quizAttempts: {}
    }
  });
  db.saveNow();
  db.releaseWriteLock();

  const port = await freePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const adminToken = "snapshot-recovery-test-token";
  const logs = [];
  const child = spawn(process.execPath, ["server.js", String(port)], {
    cwd: path.resolve(__dirname, ".."),
    env: {
      ...process.env,
      DB_PATH: dbPath,
      HOST: "127.0.0.1",
      ADMIN_TOKEN: adminToken,
      NODE_ENV: "test",
      LLM_PROVIDER: "mock"
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true
  });
  child.stdout.on("data", (chunk) => logs.push(chunk.toString()));
  child.stderr.on("data", (chunk) => logs.push(chunk.toString()));

  try {
    await waitForHealth(baseUrl, child, logs);
    const exported = await requestJson(baseUrl, "/api/admin/export", { token: adminToken });
    assert.equal(exported.response.status, 200, JSON.stringify(exported.payload));
    const startupRows = exported.payload.data.quizResults.filter((row) => row.user_id === userId);
    assert.equal(startupRows.length, 2, "startup must restore submitted rows from stored snapshots");
    await testSnapshotApi(baseUrl, objectiveEntry, shortEntry);
  } finally {
    await stopChild(child);
  }
}

async function main() {
  const firstChapter = route.chapters[0];
  const preUnitId = `${firstChapter.id}-pre`;
  const preEntries = courseAssessment.assessmentEntriesForUnit(assessmentIndex, {
    chapterId: firstChapter.id,
    unitId: preUnitId,
    phase: "pre"
  });
  const objectiveEntry = preEntries.find((entry) => entry.question.type !== "short_answer");
  const shortEntry = preEntries.find((entry) => entry.question.type === "short_answer");
  const adaptiveEntry = findEntry(
    (entry) => /-K\d+-formative$/u.test(entry.unitId),
    "the v2 route must contain a knowledge-point formative assessment"
  );
  assert.ok(objectiveEntry && shortEntry, "the first pretest must contain objective and short-answer questions");

  testSnapshotValidation(objectiveEntry, shortEntry, adaptiveEntry);

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "cq-quiz-reconciliation-"));
  const dbPath = path.join(tempDir, "quiz-reconciliation.db");
  const previousDbPath = process.env.DB_PATH;
  process.env.DB_PATH = dbPath;
  const db = require("../db");
  try {
    await db.getDb();
    await testDatabaseReconciliation(db, objectiveEntry, shortEntry);
    await testStartupRecovery(dbPath, db, objectiveEntry, shortEntry);
    console.log("quiz snapshot reconciliation tests passed");
  } finally {
    try { db.releaseWriteLock(); } catch {}
    if (previousDbPath === undefined) delete process.env.DB_PATH;
    else process.env.DB_PATH = previousDbPath;
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
