const assert = require("node:assert/strict");
const fs = require("node:fs");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const BEIJING_OFFSET_MS = 8 * 60 * 60 * 1000;

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

function beijingDate(ms) {
  return new Date(ms + BEIJING_OFFSET_MS).toISOString().slice(0, 10);
}

function beijingIso(ms) {
  return new Date(ms + BEIJING_OFFSET_MS).toISOString().slice(0, -1) + "+08:00";
}

async function adminStats(baseUrl, token, endpoint, params = "") {
  const response = await fetch(
    `${baseUrl}/api/admin/stats/${endpoint}${params ? `?${params}` : ""}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const payload = await response.json().catch(() => ({}));
  assert.equal(response.status, 200, `${endpoint}: ${JSON.stringify(payload)}`);
  assert.equal(payload.ok, true, `${endpoint}: ${JSON.stringify(payload)}`);
  return payload.data;
}

function recordCheck(failures, label, check) {
  try {
    check();
    console.log(`PASS ${label}`);
  } catch (error) {
    failures.push(`${label}: ${error.message}`);
    console.error(`FAIL ${label}: ${error.message}`);
  }
}

async function main() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cq-admin-statistics-"));
  const dbPath = path.join(tmpDir, "admin-statistics.db");
  const previousDbPath = process.env.DB_PATH;
  const currentBeijingDate = beijingDate(Date.now());
  const fixedNowIso = `${currentBeijingDate}T00:30:00.000+08:00`;
  const fixedNowMs = Date.parse(fixedNowIso);
  process.env.DB_PATH = dbPath;
  const db = require("../db");
  await db.getDb();

  const quizUserId = "admin-stat-quiz-user";
  db.upsertUser(
    quizUserId,
    "统计测试用户",
    beijingIso(fixedNowMs - 2 * 86400000),
    beijingIso(fixedNowMs)
  );
  for (let index = 0; index < 3; index += 1) {
    db.insertQuizResult({
      id: `admin-stat-result-${index}`,
      user_id: quizUserId,
      chapter_id: "V14-C1",
      chapter_label: "函数、极限与导数入口",
      unit_id: "V14-C1-M1-pre",
      unit_label: "输入、输出和函数规则 · 前测",
      question_id: `admin-stat-question-${index}`,
      question_type: "single",
      phase: "pre",
      points: 1,
      response: "A",
      is_correct: index === 0 ? 1 : 0,
      status: "graded",
      score: index === 0 ? 1 : 0,
      max_score: 1,
      created_at: `${currentBeijingDate}T00:15:00.000+08:00`
    });
  }
  db.insertQuizResult({
    id: "admin-stat-formative-result",
    user_id: quizUserId,
    chapter_id: "V14-C1",
    chapter_label: "函数、极限与导数入口",
    unit_id: "GH-01-K01-formative",
    unit_label: "函数、极限与导数入口 · 形成测验",
    question_id: "GH-01-K01-check-q1",
    question_type: "single",
    phase: "formative",
    points: 1,
    response: "A",
    is_correct: 0,
    status: "graded",
    score: 0,
    max_score: 1,
    created_at: `${currentBeijingDate}T00:16:00.000+08:00`
  });
  db.insertQuizResult({
    id: "admin-stat-formative-diagnostic-result",
    user_id: quizUserId,
    chapter_id: "V14-C1",
    chapter_label: "函数、极限与导数入口",
    unit_id: "GH-01-K01-formative",
    unit_label: "输入、输出和函数规则 · 即时形测",
    question_id: "GH-01-K01-check-q2",
    question_type: "multiple",
    phase: "formative",
    points: 1,
    response: "C,D",
    is_correct: 1,
    status: "graded",
    score: 1,
    max_score: 1,
    created_at: `${currentBeijingDate}T00:16:30.000+08:00`
  });
  db.getDbSync().run(
    `UPDATE learning_state_versions
     SET generation = 2, revision = 1, updated_at = ?
     WHERE user_id = ?`,
    [`${currentBeijingDate}T00:17:00.000+08:00`, quizUserId]
  );
  db.insertQuizResult({
    id: "admin-stat-post-result",
    user_id: quizUserId,
    chapter_id: "V14-C1",
    chapter_label: "函数、极限与导数入口",
    unit_id: "V14-C1-post",
    unit_label: "函数、极限与导数入口 · 后测",
    question_id: "admin-stat-post-question",
    question_type: "short_answer",
    phase: "post",
    points: 1,
    response: "因为左右极限相同。",
    is_correct: 1,
    status: "ai_reviewed",
    score: 1,
    max_score: 1,
    created_at: `${currentBeijingDate}T00:17:00.000+08:00`
  });
  db.insertAgentDecision({
    id: "admin-stat-agent-decision",
    user_id: quizUserId,
    agent_type: "orchestrator",
    decision_type: "plan",
    input_summary: {
      chapterId: "V14-C1",
      currentUnitId: "V14-C1-M1-pre"
    },
    output_summary: {
      action: "continue",
      qa: { approved: true }
    },
    confidence: 0.8,
    llm_provider: "mock",
    latency_ms: 10,
    created_at: `${currentBeijingDate}T00:00:00.000+08:00`
  });
  const historicalUtcDecisionAt = new Date(
    Date.parse(`${currentBeijingDate}T00:05:00.000+08:00`)
  ).toISOString();
  db.insertAgentDecision({
    id: "admin-stat-agent-decision-utc",
    user_id: quizUserId,
    agent_type: "orchestrator",
    decision_type: "plan",
    input_summary: {
      chapterId: "V14-C1",
      currentUnitId: "V14-C1-M1-pre"
    },
    output_summary: {
      action: "continue",
      qa: { approved: true }
    },
    confidence: 0.8,
    llm_provider: "mock",
    latency_ms: 10,
    created_at: historicalUtcDecisionAt
  });

  db.insertEvent({
    id: "admin-stat-legacy-quiz-event",
    user_id: quizUserId,
    type: "quiz_result",
    payload: { unitId: "legacy-unit" },
    created_at: `${currentBeijingDate}T00:05:00.000+08:00`
  });
  db.insertEvent({
    id: "admin-stat-current-quiz-event",
    user_id: quizUserId,
    type: "quiz_submission",
    payload: { unitId: "V14-C1-M1-pre", questionCount: 3 },
    created_at: `${currentBeijingDate}T00:10:00.000+08:00`
  });
  db.insertEvent({
    id: "admin-stat-agent-decision-executed",
    user_id: quizUserId,
    type: "interaction",
    payload: {
      eventType: "agentic_decision_executed",
      data: {
        sourceAgentDecisionId: "admin-stat-agent-decision-utc",
        fromUnitId: "V14-C1-M1-pre"
      }
    },
    created_at: `${currentBeijingDate}T00:08:00.000+08:00`
  });
  [
    {
      id: "admin-stat-short-dwell",
      eventType: "time_on_unit",
      data: { seconds: 5 }
    },
    {
      id: "admin-stat-capped-dwell",
      eventType: "time_on_unit",
      data: { seconds: 7200, sceneType: "simulation" }
    },
    {
      id: "admin-stat-proactive-shown",
      eventType: "knowledge_proactive_suggestion_shown",
      data: { suggestionKind: "quiz_review" }
    },
    {
      id: "admin-stat-proactive-accepted",
      eventType: "knowledge_proactive_suggestion_accepted",
      data: { suggestionKind: "quiz_review", action: "review_mistake" }
    }
  ].forEach((item, index) => {
    db.insertEvent({
      id: item.id,
      user_id: quizUserId,
      type: "interaction",
      payload: {
        eventType: item.eventType,
        source: "knowledge_assistant",
        chapterId: "V14-C1",
        unitId: "GH-01-K01",
        sessionId: "admin-stat-session",
        data: item.data
      },
      created_at: `${currentBeijingDate}T00:${String(20 + index).padStart(2, "0")}:00.000+08:00`
    });
  });

  const historicalEvents = [
    { id: "before-midnight", offsetMs: -40 * 60 * 1000 },
    { id: "ten-hours-ago", offsetMs: -10 * 60 * 60 * 1000 },
    { id: "twenty-hours-ago", offsetMs: -20 * 60 * 60 * 1000 }
  ];
  historicalEvents.forEach(({ id, offsetMs }) => {
    const userId = `admin-stat-${id}`;
    db.upsertUser(
      userId,
      `边界用户-${id}`,
      beijingIso(fixedNowMs - 2 * 86400000),
      beijingIso(fixedNowMs + offsetMs)
    );
    db.insertEvent({
      id: `admin-stat-event-${id}`,
      user_id: userId,
      type: "learning_activity",
      payload: { id },
      created_at: beijingIso(fixedNowMs + offsetMs)
    });
  });
  db.saveNow();

  const port = await freePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const adminToken = "admin-statistics-token";
  const logs = [];
  const fixedClockBootstrap = `
    const NativeDate = Date;
    const fixedNow = NativeDate.parse(process.env.CQ_TEST_NOW);
    global.Date = class FixedDate extends NativeDate {
      constructor(...args) {
        super(...(args.length ? args : [fixedNow]));
      }
      static now() {
        return fixedNow;
      }
    };
    require("./server.js");
  `;
  let child;

  try {
    child = spawn(process.execPath, ["-e", fixedClockBootstrap], {
      cwd: root,
      env: {
        ...process.env,
        DB_PATH: dbPath,
        HOST: "127.0.0.1",
        PORT: String(port),
        ADMIN_TOKEN: adminToken,
        LLM_PROVIDER: "mock",
        NODE_ENV: "test",
        TZ: "Asia/Shanghai",
        CQ_TEST_NOW: fixedNowIso
      },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true
    });
    child.stdout.on("data", (chunk) => logs.push(chunk.toString()));
    child.stderr.on("data", (chunk) => logs.push(chunk.toString()));
    await waitForHealth(baseUrl, child, logs);

    const [
      overview,
      todayOverview,
      userProgress,
      daily,
      hourly,
      last24Hours,
      scoreDistribution,
      todayDecisionTrace,
      phaseComparison,
      userDetail
    ] = await Promise.all([
      adminStats(baseUrl, adminToken, "overview"),
      adminStats(baseUrl, adminToken, "overview", "range=today"),
      adminStats(baseUrl, adminToken, "user-progress"),
      adminStats(baseUrl, adminToken, "daily-activity", "range=today"),
      adminStats(baseUrl, adminToken, "hourly-activity", "range=today"),
      adminStats(baseUrl, adminToken, "overview", "range=24h"),
      adminStats(baseUrl, adminToken, "score-distribution"),
      adminStats(baseUrl, adminToken, "agentic-decision-trace", "range=today"),
      adminStats(baseUrl, adminToken, "phase-comparison"),
      adminStats(baseUrl, adminToken, "user-detail", `userId=${encodeURIComponent(quizUserId)}`)
    ]);
    const listedQuizUser = db.listUsers().find((row) => row.id === quizUserId);
    const decisionTrace = db.agenticDecisionTrace({ userId: quizUserId });
    const failures = [];
    const quizUser = userProgress.find((row) => row.user_id === quizUserId);
    const todayRow = daily.find((row) => row.date === currentBeijingDate);
    const midnightHour = hourly.find((row) => Number(row.hour) === 0);

    recordCheck(failures, "多题测验在概览中按一次提交计数", () => {
      assert.equal(overview.totalQuizResults, 3);
    });
    recordCheck(failures, "前测与形成性测验在用户排名中各按一次提交计数", () => {
      assert.ok(quizUser, "quiz user was not returned");
      assert.equal(quizUser.quiz_count, 3);
    });
    recordCheck(failures, "用户列表按一次测验提交计数", () => {
      assert.ok(listedQuizUser, "listed quiz user was not returned");
      assert.equal(listedQuizUser.quiz_count, 3);
    });
    recordCheck(failures, "得分率分布按整份测验汇总", () => {
      assert.deepEqual(
        scoreDistribution.map(({ bucket, count }) => ({ bucket, count })),
        [
          { bucket: "20-39%", count: 1 },
          { bucket: "40-59%", count: 1 },
          { bucket: "满分 (100%)", count: 1 }
        ]
      );
    });
    recordCheck(failures, "Agent 建议后的测验次数按整份提交计数", () => {
      assert.equal(decisionTrace.rows.length, 2);
      assert.equal(decisionTrace.rows[0].outcome_quiz_count, 3);
    });
    recordCheck(failures, "QA approved 字段映射为管理员质量检查通过", () => {
      assert.equal(decisionTrace.rows.every((row) => row.qa_pass === true), true);
      assert.equal(todayDecisionTrace.rows.every((row) => row.qa_pass === true), true);
    });
    recordCheck(failures, "历史 UTC Agent 决策按北京时间日期纳入统计", () => {
      assert.equal(todayOverview.agentDecisionCount, 2);
      assert.equal(todayDecisionTrace.rows.length, 2);
    });
    recordCheck(failures, "混合时区 Agent 决策按绝对时间排序并关联后续行为", () => {
      assert.equal(todayDecisionTrace.rows[0].id, "admin-stat-agent-decision-utc");
      assert.equal(
        todayDecisionTrace.rows[0].executed_at,
        `${currentBeijingDate}T00:08:00.000+08:00`
      );
      assert.equal(todayDecisionTrace.rows[0].outcome_quiz_count, 3);
    });
    recordCheck(failures, "每日趋势兼容历史事件并识别 quiz_submission", () => {
      assert.ok(todayRow, "today row was not returned");
      assert.equal(todayRow.quiz_submissions, 2);
    });
    recordCheck(failures, "小时趋势兼容历史事件并识别 quiz_submission", () => {
      assert.ok(midnightHour, "midnight hour was not returned");
      assert.equal(midnightHour.quiz_submissions, 2);
    });
    recordCheck(failures, "近 24 小时窗口在 UTC+8 主机不重复偏移", () => {
      assert.equal(last24Hours.totalEvents, 10);
      assert.equal(last24Hours.activeInRange, 4);
    });
    recordCheck(failures, "今日活跃以北京时间午夜为边界", () => {
      assert.equal(overview.activeToday, 1);
    });
    recordCheck(failures, "形成性测验进入三阶段管理员统计", () => {
      const row = phaseComparison.find((item) => item.user_id === quizUserId && item.chapter_id === "V14-C1");
      assert.ok(row, "phase comparison row was not returned");
      assert.equal(row.pre_count, 3);
      assert.equal(row.formative_count, 2);
      assert.equal(row.formative_accuracy, 50);
      assert.equal(row.formative_core_count, 1);
      assert.equal(row.formative_core_accuracy, 0);
      assert.equal(row.formative_diagnostic_count, 1);
      assert.equal(row.formative_diagnostic_accuracy, 100);
      assert.equal(row.post_count, 1);
      assert.equal(row.pre_submissions, 1);
      assert.equal(row.formative_submissions, 1);
      assert.equal(row.post_submissions, 1);
      assert.equal(row.pre_score, 1);
      assert.equal(row.pre_max_score, 3);
    });
    recordCheck(failures, "用户详情按全部历史学习代次返回总体统计", () => {
      assert.equal(userDetail.scope.allHistory, true);
      assert.equal(userDetail.quizOverall.submissions, 3);
      assert.equal(userDetail.quizOverall.questions, 6);
      assert.equal(userDetail.quizOverall.correct, 3);
      assert.equal(userDetail.quizOverall.totalScore, 3);
      assert.equal(userDetail.quizOverall.totalMaxScore, 6);
      assert.equal(userDetail.quizOverall.generationCount, 2);
      assert.equal(userDetail.quizOverall.currentGeneration, 2);
    });
    recordCheck(failures, "用户详情返回三阶段与章节三阶段明细", () => {
      assert.deepEqual(
        userDetail.quizPhaseSummary.map((row) => [row.phase, row.submissions, row.questions]),
        [
          ["pre", 1, 3],
          ["formative", 1, 2],
          ["post", 1, 1]
        ]
      );
      assert.equal(userDetail.chapterPhaseSummary.length, 3);
      assert.equal(userDetail.quizQuestionTotal, 6);
      assert.equal(userDetail.quizQuestionRows.length, 6);
      assert.equal(userDetail.quizQuestionRows[0].learning_generation, 2);
    });
    recordCheck(failures, "用户详情按有效路径规则截尾并统计主动 AI", () => {
      assert.equal(userDetail.researchSummary.unitStudySeconds, 1800);
      assert.equal(userDetail.researchSummary.rawUnitStudySeconds, 7200);
      assert.equal(userDetail.researchSummary.cappedStudySegments, 1);
      assert.equal(userDetail.effectivePath.total_seconds, 1800);
      assert.equal(userDetail.effectivePath.raw_total_seconds, 7200);
      assert.equal(userDetail.proactiveSummary.shown, 1);
      assert.equal(userDetail.proactiveSummary.accepted, 1);
    });

    assert.equal(
      failures.length,
      0,
      `admin statistics regressions:\n${failures.join("\n")}`
    );
    console.log("admin statistics regression tests passed");
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
