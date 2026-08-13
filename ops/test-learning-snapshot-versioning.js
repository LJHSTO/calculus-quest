const assert = require("node:assert/strict");
const fs = require("node:fs");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const initSqlJs = require("sql.js");
const vm = require("node:vm");

const learningRoute = require("../data/multi-scene-learning-route.json");

function firstPretestSubmission() {
  const chapter = learningRoute.chapters?.[0];
  const questions = chapter?.flow?.preQuiz?.questions || [];
  assert.ok(chapter?.id && questions.length, "the first chapter pretest must remain available");
  return {
    unitId: `${chapter.id}-pre`,
    chapterId: chapter.id,
    phase: "pre",
    questionCount: questions.length,
    answers: questions.map((question) => ({
      questionId: question.id,
      response: question.type === "short_answer"
        ? "我会说明关键概念、判断依据和对应的数学关系。"
        : question.type === "multiple"
          ? question.answer
          : question.answer?.[0]
    }))
  };
}

function testClientSnapshotIncludesReturnToQuiz() {
  const coreSource = fs.readFileSync(path.resolve(__dirname, "../app/main/core.js"), "utf8");
  const snapshotStart = coreSource.indexOf("function learningSnapshot()");
  const snapshotEnd = coreSource.indexOf("\nfunction snapshotContentJson", snapshotStart);
  assert.ok(snapshotStart >= 0 && snapshotEnd > snapshotStart, "client learning snapshot must remain testable");
  const returnToQuiz = {
    unitId: "V14-C1-formative",
    targetUnitId: "GH-01-K01",
    questionId: "GH-01-formative-q1"
  };
  const context = vm.createContext({
    state: {
      participant: { participantId: "snapshot-test" },
      completed: [],
      quizResults: [],
      quizDrafts: {},
      quizAttempts: {},
      submittedQuizzes: [],
      selectedKnowledgeScenes: {},
      returnToQuiz,
      narrationCollapsed: false,
      logs: [],
      note: "",
      analytics: {},
      lastLearningContext: null,
      agenticPath: null
    },
    currentChapterId: "V14-C1",
    currentUnitId: "GH-01-K01",
    currentView: "learn",
    beijingNow: () => "2026-08-13T12:00:00.000+08:00"
  });
  vm.runInContext(coreSource.slice(snapshotStart, snapshotEnd), context, {
    filename: "app/main/core.js"
  });
  const snapshotReturnContext = context.learningSnapshot().returnToQuiz;
  assert.ok(
    snapshotReturnContext,
    "return-to-quiz context must be included in the client learning snapshot"
  );
  assert.deepEqual(JSON.parse(JSON.stringify(snapshotReturnContext)), returnToQuiz);
}

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

async function createLegacySnapshotDatabase(dbPath) {
  const SQL = await initSqlJs();
  const legacyDb = new SQL.Database();
  legacyDb.run(`
    CREATE TABLE users (
      id TEXT PRIMARY KEY,
      nickname TEXT NOT NULL,
      created_at TEXT NOT NULL,
      last_seen_at TEXT
    )
  `);
  legacyDb.run(`
    CREATE TABLE snapshots (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      reason TEXT DEFAULT '',
      data TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL
    )
  `);
  legacyDb.run(
    "INSERT INTO users (id, nickname, created_at, last_seen_at) VALUES (?, ?, ?, ?)",
    ["legacy-user", "旧版学习者", "2026-07-01T00:00:00.000Z", "2026-07-01T00:00:00.000Z"]
  );
  legacyDb.run(
    "INSERT INTO snapshots (id, user_id, reason, data, created_at) VALUES (?, ?, ?, ?, ?)",
    [
      "legacy-snapshot",
      "legacy-user",
      "legacy_progress",
      JSON.stringify({
        completed: ["legacy-unit"],
        quizResults: [{
          id: "legacy-result",
          unit_id: "legacy-quiz",
          question_id: "legacy-question"
        }],
        quizAttempts: {
          "legacy-attempt-quiz": {
            unitId: "legacy-attempt-quiz",
            records: []
          }
        },
        note: "旧快照必须保留"
      }),
      "2026-07-01T00:01:00.000Z"
    ]
  );
  fs.writeFileSync(dbPath, Buffer.from(legacyDb.export()));
  legacyDb.close();
}

async function assertLegacySnapshotMigrated(dbPath) {
  const SQL = await initSqlJs();
  const migratedDb = new SQL.Database(fs.readFileSync(dbPath));
  const columns = [];
  const columnStatement = migratedDb.prepare("PRAGMA table_info(snapshots)");
  while (columnStatement.step()) columns.push(columnStatement.getAsObject().name);
  columnStatement.free();
  assert.equal(columns.includes("generation"), true);
  assert.equal(columns.includes("revision"), true);

  const snapshotStatement = migratedDb.prepare(`
    SELECT data, generation, revision
    FROM snapshots
    WHERE id = 'legacy-snapshot'
  `);
  assert.equal(snapshotStatement.step(), true);
  const legacySnapshot = snapshotStatement.getAsObject();
  snapshotStatement.free();
  migratedDb.close();

  assert.deepEqual(JSON.parse(legacySnapshot.data).completed, ["legacy-unit"]);
  assert.equal(JSON.parse(legacySnapshot.data).note, "旧快照必须保留");
  assert.equal(Number(legacySnapshot.generation), 0);
  assert.equal(Number(legacySnapshot.revision), 0);
}

async function assertResetHistoryRetained(dbPath, userId, beforeGeneration, resetGeneration, expectedQuizRows) {
  const SQL = await initSqlJs();
  const migratedDb = new SQL.Database(fs.readFileSync(dbPath));
  try {
    const quizStatement = migratedDb.prepare(
      "SELECT COUNT(*) AS count FROM quiz_results WHERE user_id = ?"
    );
    quizStatement.bind([userId]);
    assert.equal(quizStatement.step(), true);
    const quizCount = Number(quizStatement.getAsObject().count || 0);
    quizStatement.free();
    assert.equal(
      quizCount,
      expectedQuizRows,
      "reset must retain prior quiz rows for administrator and research audit"
    );

    const snapshotStatement = migratedDb.prepare(`
      SELECT generation, reason
      FROM snapshots
      WHERE user_id = ?
      ORDER BY generation, revision
    `);
    snapshotStatement.bind([userId]);
    const snapshots = [];
    while (snapshotStatement.step()) snapshots.push(snapshotStatement.getAsObject());
    snapshotStatement.free();
    assert.equal(
      snapshots.some((row) => Number(row.generation) === Number(beforeGeneration)),
      true,
      "reset must retain snapshots from the prior learning generation"
    );
    assert.equal(
      snapshots.some((row) =>
        Number(row.generation) === Number(resetGeneration) && row.reason === "reset"
      ),
      true,
      "reset must append an authoritative snapshot for the new learning generation"
    );
  } finally {
    migratedDb.close();
  }
}

async function main() {
  const regressionFailures = [];
  try {
    testClientSnapshotIncludesReturnToQuiz();
  } catch (error) {
    regressionFailures.push(error);
  }
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cq-snapshot-versioning-"));
  const dbPath = path.join(tmpDir, "snapshot-versioning.db");
  const port = await freePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const logs = [];
  let child;

  try {
    await createLegacySnapshotDatabase(dbPath);
    child = spawn(process.execPath, ["server.js", String(port)], {
      cwd: path.resolve(__dirname, ".."),
      env: {
        ...process.env,
        DB_PATH: dbPath,
        HOST: "127.0.0.1",
        LLM_PROVIDER: "mock",
        NODE_ENV: "development"
      },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true
    });
    child.stdout.on("data", (chunk) => logs.push(chunk.toString()));
    child.stderr.on("data", (chunk) => logs.push(chunk.toString()));
    await waitForHealth(baseUrl, child, logs);

    const legacyUpgrade = await requestJson(baseUrl, "/api/auth/register", {
      method: "POST",
      body: {
        nickname: "旧版学习者",
        email: "",
        password: "legacy-upgrade-123"
      }
    });
    assert.equal(legacyUpgrade.response.status, 200);
    assert.equal(legacyUpgrade.payload.participant.participantId, "legacy-user");
    const legacyState = await requestJson(baseUrl, "/api/learning/snapshot", {
      token: legacyUpgrade.payload.token
    });
    assert.equal(legacyState.response.status, 200);
    assert.deepEqual(
      legacyState.payload.snapshot.submittedQuizzes.sort(),
      ["legacy-attempt-quiz", "legacy-quiz"],
      "旧快照缺少 submittedQuizzes 时必须从历史题目和测验尝试恢复"
    );
    assert.equal(legacyState.payload.snapshot.note, "旧快照必须保留");

    const registered = await requestJson(baseUrl, "/api/auth/register", {
      method: "POST",
      body: {
        nickname: `快照测试${Date.now().toString().slice(-6)}`,
        email: "",
        password: "snapshot-test-123"
      }
    });
    assert.equal(registered.response.status, 200);
    const token = registered.payload.token;
    const participantId = registered.payload.participant.participantId;

    const initial = await requestJson(baseUrl, "/api/learning/snapshot", { token });
    assert.equal(initial.response.status, 200);
    assert.equal(initial.payload.snapshot, null);
    assert.equal(Number.isInteger(initial.payload.generation), true);
    assert.equal(Number.isInteger(initial.payload.revision), true);

    const richSnapshot = {
      completed: ["V14-C1-M1-pre"],
      quizResults: [
        {
          id: "snapshot-result-1",
          unitId: "V14-C1-M1-pre",
          questionId: "snapshot-question-1",
          score: 1,
          maxScore: 1
        }
      ],
      submittedQuizzes: ["V14-C1-M1-pre"],
      selectedKnowledgeScenes: {
        "GH-01-K01": "game"
      },
      logs: ["原有学习记录"],
      note: "保留这条反思",
      returnToQuiz: {
        unitId: "V14-C1-formative",
        targetUnitId: "GH-01-K01",
        questionId: "GH-01-formative-q1"
      },
      agenticPath: {
        skipped: {
          "GH-01-K01": true
        }
      },
      capturedAt: "2026-07-18T09:00:00.000+08:00"
    };
    const richSave = await requestJson(baseUrl, "/api/learning/snapshot", {
      method: "POST",
      token,
      body: {
        generation: initial.payload.generation,
        baseRevision: initial.payload.revision,
        reason: "rich_state",
        snapshot: richSnapshot
      }
    });
    assert.equal(richSave.response.status, 200);

    const pretest = firstPretestSubmission();
    const quizSubmission = await requestJson(baseUrl, "/api/learning/quiz/submit", {
      method: "POST",
      token,
      body: {
        unitId: pretest.unitId,
        chapterId: pretest.chapterId,
        phase: pretest.phase,
        answers: pretest.answers
      }
    });
    assert.equal(quizSubmission.response.status, 200);
    assert.equal(quizSubmission.payload.results.length, pretest.questionCount);

    const lateEmpty = await requestJson(baseUrl, "/api/learning/snapshot", {
      method: "POST",
      token,
      body: {
        generation: richSave.payload.generation,
        baseRevision: initial.payload.revision,
        reason: "late_empty_state",
        snapshot: {
          completed: [],
          quizResults: [],
          submittedQuizzes: [],
          logs: [],
          note: "",
          capturedAt: "2026-07-18T08:59:00.000+08:00"
        }
      }
    });
    try {
      assert.equal(lateEmpty.response.status, 409);
      assert.equal(lateEmpty.payload.code, "snapshot_revision_conflict");
    } catch (error) {
      regressionFailures.push(error);
    }

    const afterLateEmpty = await requestJson(baseUrl, "/api/learning/snapshot", { token });
    assert.deepEqual(afterLateEmpty.payload.snapshot.completed, ["V14-C1-M1-pre"]);
    assert.equal(afterLateEmpty.payload.snapshot.quizResults[0].id, "snapshot-result-1");
    assert.equal(afterLateEmpty.payload.snapshot.note, "保留这条反思");
    assert.deepEqual(afterLateEmpty.payload.snapshot.returnToQuiz, richSnapshot.returnToQuiz);

    const resumeSkippedLesson = await requestJson(baseUrl, "/api/learning/snapshot", {
      method: "POST",
      token,
      body: {
        generation: afterLateEmpty.payload.generation,
        baseRevision: afterLateEmpty.payload.revision,
        reason: "resume_skipped_lesson",
        snapshot: {
          agenticPath: {
            skipped: {}
          },
          selectedKnowledgeScenes: {},
          capturedAt: "2026-07-18T09:01:00.000+08:00"
        }
      }
    });
    assert.equal(resumeSkippedLesson.response.status, 200);
    const afterResume = await requestJson(baseUrl, "/api/learning/snapshot", { token });
    try {
      assert.deepEqual(
        afterResume.payload.snapshot.agenticPath.skipped,
        {},
        "removing a skipped lesson must survive snapshot sync and refresh"
      );
      assert.deepEqual(
        afterResume.payload.snapshot.selectedKnowledgeScenes,
        {},
        "removing a selected knowledge scene must survive snapshot sync and refresh"
      );
    } catch (error) {
      regressionFailures.push(error);
    }

    const reset = await requestJson(baseUrl, "/api/learning/reset", {
      method: "POST",
      token,
      body: {
        generation: afterResume.payload.generation,
        baseRevision: afterResume.payload.revision,
        snapshot: {
          completed: [],
          quizResults: [],
          submittedQuizzes: [],
          logs: ["已重置学习记录。"],
          note: ""
        }
      }
    });
    assert.equal(reset.response.status, 200);
    assert.equal(reset.payload.generation > afterResume.payload.generation, true);

    const staleAfterReset = await requestJson(baseUrl, "/api/learning/snapshot", {
      method: "POST",
      token,
      body: {
        generation: afterLateEmpty.payload.generation,
        baseRevision: afterLateEmpty.payload.revision,
        reason: "delayed_pre_reset_request",
        snapshot: richSnapshot
      }
    });
    assert.equal(staleAfterReset.response.status, 409);
    assert.equal(staleAfterReset.payload.code, "snapshot_generation_conflict");

    const finalState = await requestJson(baseUrl, "/api/learning/snapshot", { token });
    assert.deepEqual(finalState.payload.snapshot.completed, []);
    assert.deepEqual(finalState.payload.snapshot.quizResults, []);
    assert.equal(finalState.payload.generation, reset.payload.generation);
    const currentQuizResults = await requestJson(baseUrl, "/api/learning/quiz-results", { token });
    assert.equal(currentQuizResults.response.status, 200);
    assert.deepEqual(
      currentQuizResults.payload.data,
      [],
      "student APIs must expose only the current learning generation after reset"
    );

    const unversioned = await requestJson(baseUrl, "/api/learning/snapshot", {
      method: "POST",
      token,
      body: {
        reason: "legacy_client",
        snapshot: richSnapshot
      }
    });
    assert.equal(unversioned.response.status, 409);
    assert.equal(unversioned.payload.code, "snapshot_version_required");

    await new Promise((resolve) => setTimeout(resolve, 2500));
    await stopChild(child);
    child = null;
    await assertLegacySnapshotMigrated(dbPath);
    await assertResetHistoryRetained(
      dbPath,
      participantId,
      richSave.payload.generation,
      reset.payload.generation,
      pretest.questionCount
    );

    if (regressionFailures.length) {
      throw new AggregateError(regressionFailures, "learning snapshot regression tests failed");
    }
    console.log("learning snapshot versioning tests passed");
  } finally {
    await stopChild(child);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  if (error instanceof AggregateError) {
    console.error(error.message);
    error.errors.forEach((item) => console.error(item.stack || item.message));
  } else {
    console.error(error.stack || error.message);
  }
  process.exitCode = 1;
});
