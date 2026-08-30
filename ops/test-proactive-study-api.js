const assert = require("node:assert/strict");
const fs = require("node:fs");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const proactivePolicy = require("../lib/proactive-policy");

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
    new Promise((resolve) => setTimeout(resolve, 5000))
  ]);
  if (child.exitCode === null) child.kill("SIGKILL");
}

async function setDecisionExpiry(dbPath, decisionId, expiresAt) {
  const initSqlJs = require("sql.js");
  const SQL = await initSqlJs();
  const database = new SQL.Database(fs.readFileSync(dbPath));
  try {
    database.run(
      "UPDATE proactive_decisions SET expires_at = ? WHERE id = ?",
      [expiresAt, decisionId]
    );
    fs.writeFileSync(dbPath, Buffer.from(database.export()));
  } finally {
    database.close();
  }
}

async function requestJson(baseUrl, method, pathname, body, token = "") {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
  return {
    response,
    payload: await response.json().catch(() => ({}))
  };
}

async function startServer(root, dbPath, mode, adminToken, options = {}) {
  const port = await freePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const logs = [];
  const child = spawn(process.execPath, ["server.js", String(port)], {
    cwd: root,
    env: {
      ...process.env,
      DB_PATH: dbPath,
      HOST: "127.0.0.1",
      NODE_ENV: "development",
      LLM_PROVIDER: "mock",
      ADMIN_TOKEN: adminToken,
      PROACTIVE_POLICY_MODE: mode,
      PROACTIVE_EXPERIMENT_ID: "v14-c3-api-test",
      PROACTIVE_EXPERIMENT_CHAPTER_ID: "V14-C3",
      PROACTIVE_POLICY_VERSION: "v14-c3-api-test-v2",
      PROACTIVE_ADAPTER_VERSION: "v14-c3-adapter-v2",
      PROACTIVE_ASSIGNMENT_VERSION: "api-test-hash-v1",
      PROACTIVE_ASSIGNMENT_SALT: "api-test-only-salt",
      PROACTIVE_PUBLIC_CHAPTER_ONLY: "true",
      LEARNING_ASSISTANT_DAILY_INTERVENTIONS: String(
        options.dailyInterventions || "10"
      ),
      LEARNING_ASSISTANT_COUNT_MOCK_USAGE: "true"
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true
  });
  child.stdout.on("data", (chunk) => logs.push(chunk.toString()));
  child.stderr.on("data", (chunk) => logs.push(chunk.toString()));
  await waitForHealth(baseUrl, child, logs);
  return { child, baseUrl, logs };
}

async function register(baseUrl, suffix) {
  const result = await requestJson(baseUrl, "POST", "/api/auth/register", {
    nickname: `主动试验${suffix}`,
    email: "",
    password: "proactive-test-password"
  });
  assert.equal(result.response.status, 200);
  assert.ok(result.payload.token);
  return {
    token: result.payload.token,
    participantId: result.payload.participant.participantId
  };
}

function testConfig(mode) {
  return proactivePolicy.configFromEnv({
    PROACTIVE_POLICY_MODE: mode,
    PROACTIVE_EXPERIMENT_ID: "v14-c3-api-test",
    PROACTIVE_EXPERIMENT_CHAPTER_ID: "V14-C3",
    PROACTIVE_POLICY_VERSION: "v14-c3-api-test-v2",
    PROACTIVE_ADAPTER_VERSION: "v14-c3-adapter-v2",
    PROACTIVE_ASSIGNMENT_VERSION: "api-test-hash-v1",
    PROACTIVE_ASSIGNMENT_SALT: "api-test-only-salt",
    PROACTIVE_PUBLIC_CHAPTER_ONLY: "true"
  });
}

function expectedCondition(participantId, stratum = "pre-high") {
  return proactivePolicy.createAssignment({
    userId: participantId,
    config: testConfig("active"),
    stratum
  }).condition;
}

async function submitPretest(baseUrl, token, preQuiz) {
  const result = await requestJson(
    baseUrl,
    "POST",
    "/api/learning/quiz/submit",
    {
      unitId: "V14-C3-pre",
      chapterId: "V14-C3",
      phase: "pre",
      answers: preQuiz.questions.map((question) => ({
        questionId: question.id,
        response: question.type === "multiple"
          ? question.answer
          : question.type === "short_answer"
            ? question.answer
            : question.answer[0]
      }))
    },
    token
  );
  assert.equal(result.response.status, 200);
  assert.equal(result.payload.results.length, preQuiz.questions.length);
  return result.payload;
}

async function seedRepeatedParameterEvidence(
  baseUrl,
  token,
  unit,
  sceneType,
  prefix,
  { clockOffsetMs = 0 } = {}
) {
  const now = Date.now();
  const events = [
    { offset: -30_000, oldValue: "8", newValue: "12" },
    { offset: -15_000, oldValue: "12", newValue: "20" },
    { offset: -1_000, oldValue: "20", newValue: "32" }
  ].map((item, index) => ({
    eventId: `${prefix}-${index + 1}`,
    type: "interaction",
    payload: {
      schemaVersion: 1,
      eventId: `${prefix}-${index + 1}`,
      eventType: "parameter_commit",
      source: "iframe",
      chapterId: "V14-C3",
      unitId: unit.id,
      unitLabel: unit.name,
      unitType: "knowledge",
      sceneType,
      value: {
        parameter: "分割数 n",
        oldValue: item.oldValue,
        newValue: item.newValue
      },
      timing: {
        clientAt: new Date(now + clockOffsetMs + item.offset).toISOString(),
        durationMs: 400
      },
      data: {
        parameter: "分割数 n",
        value: {
          parameter: "分割数 n",
          oldValue: item.oldValue,
          newValue: item.newValue
        }
      }
    }
  }));
  const result = await requestJson(
    baseUrl,
    "POST",
    "/api/learning/events",
    { events },
    token
  );
  assert.equal(result.response.status, 200);
  assert.equal(result.payload.eventIds.length, 3);
}

async function seedInteractionEvent(
  baseUrl,
  token,
  unit,
  sceneType,
  eventType,
  clientAt,
  prefix
) {
  const result = await requestJson(
    baseUrl,
    "POST",
    "/api/learning/events",
    {
      events: [{
        eventId: prefix,
        type: "interaction",
        payload: {
          schemaVersion: 1,
          eventId: prefix,
          eventType,
          source: "iframe",
          chapterId: "V14-C3",
          unitId: unit.id,
          unitLabel: unit.name,
          unitType: "knowledge",
          sceneType,
          timing: {
            clientAt,
            durationMs: 300
          }
        }
      }]
    },
    token
  );
  assert.equal(result.response.status, 200);
  assert.equal(result.payload.eventIds.length, 1);
}

async function requestRepeatedDecision(baseUrl, token, unit, sceneType) {
  return requestJson(
    baseUrl,
    "POST",
    "/api/learning/assistant/intervention",
    {
      chapterId: "V14-C3",
      unitId: unit.id,
      sceneType,
      signal: {
        kind: "repeated_parameter",
        parameter: "分割数 n",
        oldValue: "20",
        newValue: "32"
      },
      contextRef: {
        kind: "interaction",
        scope: "interactive",
        state: {
          parameter: "分割数 n",
          oldValue: "20",
          newValue: "32"
        }
      }
    },
    token
  );
}

async function requestQuietDecision(
  baseUrl,
  token,
  unit,
  sceneType,
  { boundaryRecheck = false, boundaryEventType = "" } = {}
) {
  return requestJson(
    baseUrl,
    "POST",
    "/api/learning/assistant/intervention",
    {
      chapterId: "V14-C3",
      unitId: unit.id,
      sceneType,
      signal: {
        kind: "quiet_dwell",
        dwellSeconds: 180,
        boundaryRecheck,
        boundaryEventType
      },
      contextRef: {
        kind: "unit",
        scope: "lesson"
      }
    },
    token
  );
}

async function submitWrongFormative(baseUrl, token, unit) {
  return submitFormative(baseUrl, token, unit, { correct: false });
}

async function submitFormative(baseUrl, token, unit, { correct = false } = {}) {
  const question = unit.formativeQuiz.questions[0];
  const wrongOption = question.options.find(
    (option) => !question.answer.includes(option.value)
  )?.value;
  assert.ok(wrongOption, "测试题必须存在一个明确错误选项");
  const result = await requestJson(
    baseUrl,
    "POST",
    "/api/learning/quiz/submit",
    {
      unitId: `${unit.id}-formative`,
      chapterId: "V14-C3",
      phase: "formative",
      answers: [{
        questionId: question.id,
        response: correct ? question.answer[0] : wrongOption
      }]
    },
    token
  );
  assert.equal(result.response.status, 200);
  assert.equal(result.payload.results[0].isCorrect, correct);
  return result.payload;
}

async function requestFormativeOutcome(baseUrl, token, unit) {
  return requestJson(
    baseUrl,
    "POST",
    "/api/learning/assistant/intervention",
    {
      chapterId: "V14-C3",
      unitId: `${unit.id}-formative`,
      sceneType: "",
      signal: {
        kind: "formative_outcome",
        phase: "formative"
      },
      contextRef: {
        kind: "quiz",
        scope: "quiz"
      }
    },
    token
  );
}

async function seedIndependentAttemptEvidence(
  baseUrl,
  token,
  unit,
  sceneType,
  success,
  eventId
) {
  const result = await requestJson(
    baseUrl,
    "POST",
    "/api/learning/events",
    {
      events: [{
        eventId,
        type: "interaction",
        payload: {
          schemaVersion: 1,
          eventId,
          eventType: "courseware_challenge_result",
          source: "courseware_semantic",
          chapterId: "V14-C3",
          unitId: unit.id,
          unitLabel: unit.name,
          unitType: "knowledge",
          sceneType,
          timing: {
            clientAt: new Date().toISOString(),
            durationMs: 500
          },
          data: {
            challenge_id: `${unit.id}-challenge`,
            attempt_id: eventId,
            is_correct: success
          }
        }
      }]
    },
    token
  );
  assert.equal(result.response.status, 200);
  return result.payload;
}

async function requestIndependentAttemptOutcome(
  baseUrl,
  token,
  unit,
  sceneType
) {
  return requestJson(
    baseUrl,
    "POST",
    "/api/learning/assistant/intervention",
    {
      chapterId: "V14-C3",
      unitId: unit.id,
      sceneType,
      signal: {
        kind: "independent_attempt_outcome",
        sourceEventType: "courseware_challenge_result"
      },
      contextRef: {
        kind: "unit",
        scope: "lesson"
      }
    },
    token
  );
}

function verificationResponse(unitId, check, correct) {
  const adapter = proactivePolicy.adapterForChapter("V14-C3");
  const option = check.options.find((item) => {
    const grade = adapter.gradeVerificationCheck({
      knowledgePointId: unitId,
      supportLevel: check.supportLevel,
      checkId: check.id,
      response: item.value
    });
    return grade?.correct === correct;
  });
  assert.ok(option, `验证题 ${check.id} 必须有 ${correct ? "正确" : "错误"} 选项`);
  return option.value;
}

async function submitVerificationCheck(
  baseUrl,
  token,
  unit,
  check,
  { correct = false, declined = false } = {}
) {
  return requestJson(
    baseUrl,
    "POST",
    "/api/learning/proactive/check",
    {
      chapterId: "V14-C3",
      unitId: `${unit.id}-formative`,
      scopeKey: unit.id,
      checkId: check.id,
      response: declined ? "" : verificationResponse(unit.id, check, correct),
      resolution: declined ? "declined" : "",
      durationMs: 2400,
      contextRef: {
        kind: "proactive_verification",
        scope: "quiz"
      }
    },
    token
  );
}

async function resolveDecision(baseUrl, token, decisionId, resolution) {
  return requestJson(
    baseUrl,
    "POST",
    `/api/learning/proactive/${decisionId}/resolution`,
    { resolution },
    token
  );
}

async function updateProactivePreference(baseUrl, token, preference) {
  return requestJson(
    baseUrl,
    "POST",
    "/api/learning/proactive/preference",
    {
      chapterId: "V14-C3",
      preference
    },
    token
  );
}

async function answerProactivePrompt(
  baseUrl,
  token,
  unit,
  interventionId,
  question,
  { knowledgeUnit = false } = {}
) {
  const unitId = knowledgeUnit ? unit.id : `${unit.id}-formative`;
  const response = await fetch(`${baseUrl}/api/learning/assistant/ask`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({
      chapterId: "V14-C3",
      unitId,
      sceneType: knowledgeUnit ? unit.resourceCandidates[0].type : "",
      question,
      assistantIntent: "",
      proactiveInterventionId: interventionId,
      contextRef: {
        kind: knowledgeUnit ? "unit" : "quiz",
        scope: knowledgeUnit ? "lesson" : "quiz"
      }
    })
  });
  const text = await response.text();
  assert.equal(response.status, 200, text);
  const events = text
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  assert.ok(events.some((event) => event.type === "done"));
  return events;
}

async function adminDecisions(baseUrl, adminToken) {
  return requestJson(
    baseUrl,
    "GET",
    "/api/admin/research/proactive-decisions?experimentId=v14-c3-api-test&limit=1000",
    undefined,
    adminToken
  );
}

async function runUndeliveredEscalationRegression({
  root,
  tmpDir,
  sourceChapter,
  units,
  adminToken
}) {
  const dbPath = path.join(tmpDir, "proactive-budget-closure.db");
  let runtime;
  try {
    runtime = await startServer(
      root,
      dbPath,
      "active",
      adminToken,
      { dailyInterventions: 2 }
    );
    const participants = [];
    for (let index = 0; index < 12; index += 1) {
      const participant = await register(
        runtime.baseUrl,
        `预算收束${Date.now()}${index}`
      );
      participants.push({
        ...participant,
        condition: expectedCondition(participant.participantId)
      });
      if (participants.some((item) => item.condition === "treatment")) break;
    }
    const treatment = participants.find((item) => item.condition === "treatment");
    assert.ok(treatment, "预算收束回归需要 Treatment 学生");
    await submitPretest(runtime.baseUrl, treatment.token, sourceChapter.flow.preQuiz);

    const preferenceUnit = units[4];
    await submitFormative(
      runtime.baseUrl,
      treatment.token,
      preferenceUnit,
      { correct: false }
    );
    const preferenceOffer = await requestFormativeOutcome(
      runtime.baseUrl,
      treatment.token,
      preferenceUnit
    );
    assert.equal(preferenceOffer.payload.study.deliveryDecision, "intervene");
    await resolveDecision(
      runtime.baseUrl,
      treatment.token,
      preferenceOffer.payload.decisionId,
      "shown"
    );
    await resolveDecision(
      runtime.baseUrl,
      treatment.token,
      preferenceOffer.payload.decisionId,
      "accepted"
    );
    const preferenceOff = await updateProactivePreference(
      runtime.baseUrl,
      treatment.token,
      "off"
    );
    assert.equal(preferenceOff.payload.closedLifecycleEpisodes, 1);
    const closedPreferenceState = preferenceOff.payload.data.policyStates.find(
      (row) => row.scopeKey === preferenceUnit.id
    );
    assert.equal(closedPreferenceState.lifecycle.phase, "declined");
    assert.equal(
      closedPreferenceState.lifecycle.lastOutcome,
      "student_preference_off"
    );
    await updateProactivePreference(
      runtime.baseUrl,
      treatment.token,
      "standard"
    );
    const closedPreferenceReuse = await requestFormativeOutcome(
      runtime.baseUrl,
      treatment.token,
      preferenceUnit
    );
    assert.equal(
      closedPreferenceReuse.payload.study.deliveryDecision,
      "stay_silent",
      "重新开启不得复活刚刚由学生主动结束的同一帮助回合"
    );

    const unit = units[5];
    await submitFormative(
      runtime.baseUrl,
      treatment.token,
      unit,
      { correct: false }
    );
    const l1Offer = await requestFormativeOutcome(
      runtime.baseUrl,
      treatment.token,
      unit
    );
    assert.equal(l1Offer.payload.study.deliveryDecision, "intervene");
    await resolveDecision(
      runtime.baseUrl,
      treatment.token,
      l1Offer.payload.decisionId,
      "shown"
    );
    await resolveDecision(
      runtime.baseUrl,
      treatment.token,
      l1Offer.payload.decisionId,
      "accepted"
    );
    await answerProactivePrompt(
      runtime.baseUrl,
      treatment.token,
      unit,
      l1Offer.payload.interventionId,
      "换元必须同时改写内层表达式、微分元和定积分上下限。"
    );
    const awaitingResponse = await requestJson(
      runtime.baseUrl,
      "GET",
      "/api/learning/proactive/state?chapterId=V14-C3",
      undefined,
      treatment.token
    );
    const awaitingState = awaitingResponse.payload.data.policyStates.find(
      (row) => row.scopeKey === unit.id
    );
    assert.ok(awaitingState.verificationCheck);

    const suppressedEscalation = await submitVerificationCheck(
      runtime.baseUrl,
      treatment.token,
      unit,
      awaitingState.verificationCheck,
      { correct: false }
    );
    assert.equal(suppressedEscalation.response.status, 200);
    assert.equal(
      suppressedEscalation.payload.study.deliveryDecision,
      "stay_silent"
    );
    assert.equal(suppressedEscalation.payload.interventionId, "");
    assert.equal(
      suppressedEscalation.payload.study.policyState.lifecycle.phase,
      "closed",
      "L2 未能实际交付时必须结束本轮，不能停在没有验证题的等待状态"
    );
    assert.equal(
      suppressedEscalation.payload.study.policyState.verificationCheck,
      null
    );

    const audit = await adminDecisions(runtime.baseUrl, adminToken);
    const decisionRow = audit.payload.data.rows.find(
      (row) => row.id === suppressedEscalation.payload.decisionId
    );
    assert.equal(decisionRow.action, "concept_hint");
    assert.ok(
      decisionRow.reason_codes.includes("intervention_budget_exhausted")
    );
    assert.ok(
      decisionRow.reason_codes.includes("support_escalation_not_delivered")
    );
    assert.equal(
      decisionRow.evidence_snapshot.policyStateBefore.lifecycle.phase,
      "awaiting_independent_attempt"
    );
    assert.equal(
      decisionRow.evidence_snapshot.policyStateAfter.lifecycle.phase,
      "closed"
    );
    assert.equal(
      decisionRow.evidence_snapshot.stateTransition.phase,
      "closed"
    );
    const l1Row = audit.payload.data.rows.find(
      (row) => row.intervention_id === l1Offer.payload.interventionId
    );
    assert.equal(
      l1Row.followup_outcome.independentAttempt.escalation.reasonCode,
      "intervention_budget_exhausted"
    );
  } finally {
    await stopChild(runtime?.child);
  }
}

async function main() {
  const root = path.resolve(__dirname, "..");
  const route = JSON.parse(fs.readFileSync(
    path.join(root, "data", "multi-scene-learning-route.json"),
    "utf8"
  ));
  const sourceChapter = route.chapters.find((chapter) => chapter.id === "V14-C3");
  const units = sourceChapter.modules.flatMap((module) => module.knowledgePoints);
  const unit = units[0];
  const sceneType = unit.resourceCandidates[0].type;
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cq-proactive-study-"));
  const dbPath = path.join(tmpDir, "proactive-study.db");
  const adminToken = "proactive-admin-test";
  let runtime;
  const participants = [];

  try {
    runtime = await startServer(root, dbPath, "shadow", adminToken);

    const publicRoute = await requestJson(
      runtime.baseUrl,
      "GET",
      "/api/course/multi-scene-learning-route"
    );
    assert.equal(publicRoute.response.status, 200);
    assert.deepEqual(publicRoute.payload.chapters.map((chapter) => chapter.id), ["V14-C3"]);
    const publicChapter = publicRoute.payload.chapters[0];
    assert.deepEqual(
      publicChapter.flow.preQuiz.questions.map((question) => question.id),
      sourceChapter.flow.preQuiz.questions.map((question) => question.id)
    );
    assert.deepEqual(
      publicChapter.flow.postQuiz.questions.map((question) => question.id),
      sourceChapter.flow.postQuiz.questions.map((question) => question.id)
    );
    assert.equal(publicChapter.flow.preQuiz.questions.length, 10);
    assert.equal(publicChapter.flow.postQuiz.questions.length, 10);
    assert.equal(
      publicChapter.modules.flatMap((module) => module.knowledgePoints).length,
      7
    );

    for (let index = 0; index < 12; index += 1) {
      const participant = await register(runtime.baseUrl, `${Date.now()}${index}`);
      participants.push({
        ...participant,
        condition: expectedCondition(participant.participantId)
      });
      if (
        participants.some((item) => item.condition === "control")
        && participants.some((item) => item.condition === "treatment")
      ) break;
    }
    const treatment = participants.find((item) => item.condition === "treatment");
    const control = participants.find((item) => item.condition === "control");
    assert.ok(treatment && control, "测试需要同时找到 control 与 treatment 学生");

    const pendingState = await requestJson(
      runtime.baseUrl,
      "GET",
      "/api/learning/proactive/state?chapterId=V14-C3",
      undefined,
      treatment.token
    );
    assert.equal(pendingState.response.status, 200);
    assert.equal(pendingState.payload.data.assignmentPending, true);
    assert.equal(pendingState.payload.data.assignment, null);
    assert.equal(pendingState.payload.data.pretest.ready, false);

    await seedRepeatedParameterEvidence(
      runtime.baseUrl,
      treatment.token,
      unit,
      sceneType,
      "pending-evidence"
    );
    const pendingDecision = await requestRepeatedDecision(
      runtime.baseUrl,
      treatment.token,
      unit,
      sceneType
    );
    assert.equal(pendingDecision.response.status, 200);
    assert.equal(pendingDecision.payload.study.assignmentPending, true);
    assert.equal(pendingDecision.payload.study.assignment, null);
    assert.equal(pendingDecision.payload.study.deliveryDecision, "stay_silent");
    assert.equal(pendingDecision.payload.decision.action, "stay_silent");
    assert.equal(pendingDecision.payload.interventionId, "");

    const protectedStage = await requestJson(
      runtime.baseUrl,
      "POST",
      "/api/learning/assistant/intervention",
      {
        chapterId: "V14-C3",
        unitId: "V14-C3-pre",
        sceneType: "",
        signal: { kind: "quiet_dwell", dwellSeconds: 600 },
        contextRef: { kind: "quiz", scope: "quiz" }
      },
      treatment.token
    );
    assert.equal(protectedStage.response.status, 200);
    assert.equal(protectedStage.payload.study.assignmentPending, true);
    assert.equal(protectedStage.payload.decision.action, "stay_silent");

    const pendingAdmin = await adminDecisions(runtime.baseUrl, adminToken);
    assert.equal(pendingAdmin.response.status, 200);
    assert.equal(pendingAdmin.payload.data.assignments.length, 0);
    const storedPending = pendingAdmin.payload.data.rows.find(
      (row) => row.id === pendingDecision.payload.decisionId
    );
    assert.equal(storedPending.condition, "unassigned");
    assert.equal(storedPending.stratum, "unassigned");
    assert.ok(storedPending.reason_codes.includes("experiment_assignment_pending"));
    const storedProtected = pendingAdmin.payload.data.rows.find(
      (row) => row.id === protectedStage.payload.decisionId
    );
    assert.equal(storedProtected.condition, "unassigned");
    assert.ok(storedProtected.reason_codes.includes("protected_assessment_stage"));
    assert.equal(
      storedProtected.reason_codes.includes("experiment_assignment_pending"),
      false
    );

    await submitPretest(runtime.baseUrl, treatment.token, sourceChapter.flow.preQuiz);
    await submitPretest(runtime.baseUrl, control.token, sourceChapter.flow.preQuiz);
    const treatmentState = await requestJson(
      runtime.baseUrl,
      "GET",
      "/api/learning/proactive/state?chapterId=V14-C3",
      undefined,
      treatment.token
    );
    const controlState = await requestJson(
      runtime.baseUrl,
      "GET",
      "/api/learning/proactive/state?chapterId=V14-C3",
      undefined,
      control.token
    );
    for (const [participant, state] of [
      [treatment, treatmentState],
      [control, controlState]
    ]) {
      assert.equal(state.response.status, 200);
      assert.equal(state.payload.data.assignmentPending, false);
      assert.equal(
        Object.hasOwn(state.payload.data.assignment, "condition"),
        false,
        "学生状态接口不得暴露随机条件"
      );
      assert.equal(state.payload.data.assignment.stratum, "pre-high");
      assert.equal(state.payload.data.pretest.ready, true);
      assert.equal(state.payload.data.pretest.accuracy, 1);
      assert.equal(
        state.payload.data.pretest.basis,
        "server_scored_objective_items"
      );
      assert.equal(state.payload.data.studentPreference, "standard");
    }

    const reducedPreference = await updateProactivePreference(
      runtime.baseUrl,
      treatment.token,
      "reduced"
    );
    assert.equal(reducedPreference.response.status, 200);
    assert.equal(reducedPreference.payload.data.studentPreference, "reduced");
    await seedRepeatedParameterEvidence(
      runtime.baseUrl,
      treatment.token,
      unit,
      sceneType,
      "reduced-preference-evidence"
    );
    const reducedPreferenceDecision = await requestRepeatedDecision(
      runtime.baseUrl,
      treatment.token,
      unit,
      sceneType
    );
    assert.equal(reducedPreferenceDecision.response.status, 200);
    assert.equal(
      reducedPreferenceDecision.payload.study.deliveryDecision,
      "stay_silent"
    );
    const reducedPreferenceAdmin = await adminDecisions(
      runtime.baseUrl,
      adminToken
    );
    const storedReducedPreference = reducedPreferenceAdmin.payload.data.rows.find(
      (row) => row.id === reducedPreferenceDecision.payload.decisionId
    );
    assert.ok(
      storedReducedPreference.reason_codes.includes(
        "student_preference_reduced"
      )
    );
    const restoredPreference = await updateProactivePreference(
      runtime.baseUrl,
      treatment.token,
      "standard"
    );
    assert.equal(restoredPreference.response.status, 200);
    assert.equal(restoredPreference.payload.data.studentPreference, "standard");

    const idlePreferenceUnit = units[6];
    const idlePreferenceScene = idlePreferenceUnit.resourceCandidates[0].type;
    await submitWrongFormative(
      runtime.baseUrl,
      treatment.token,
      idlePreferenceUnit
    );
    await seedInteractionEvent(
      runtime.baseUrl,
      treatment.token,
      idlePreferenceUnit,
      idlePreferenceScene,
      "interactive_scroll",
      new Date(Date.now() - 120_000).toISOString(),
      "idle-preference-shadow-dwell"
    );
    const idlePreferencePending = await requestQuietDecision(
      runtime.baseUrl,
      treatment.token,
      idlePreferenceUnit,
      idlePreferenceScene
    );
    assert.equal(
      idlePreferencePending.payload.study.pendingBoundaryEvaluation,
      true
    );
    const preferenceOffWhileIdle = await updateProactivePreference(
      runtime.baseUrl,
      treatment.token,
      "off"
    );
    assert.equal(preferenceOffWhileIdle.response.status, 200);
    assert.equal(preferenceOffWhileIdle.payload.closedLifecycleEpisodes, 0);
    const idleStateWhileOff = preferenceOffWhileIdle.payload.data.policyStates.find(
      (row) => row.scopeKey === idlePreferenceUnit.id
    );
    assert.equal(
      idleStateWhileOff.lifecycle.phase,
      "idle",
      "关闭主动提示不得把没有进行中支架的知识点误标成拒绝"
    );
    assert.equal(idleStateWhileOff.pendingBoundaryEvaluation, false);
    await updateProactivePreference(
      runtime.baseUrl,
      treatment.token,
      "standard"
    );
    const idlePreferenceFormative = await requestFormativeOutcome(
      runtime.baseUrl,
      treatment.token,
      idlePreferenceUnit
    );
    assert.equal(
      idlePreferenceFormative.payload.study.deliveryDecision,
      "stay_silent"
    );
    const idlePreferenceAudit = await adminDecisions(
      runtime.baseUrl,
      adminToken
    );
    const idlePreferenceDecision = idlePreferenceAudit.payload.data.rows.find(
      (row) => row.id === idlePreferenceFormative.payload.decisionId
    );
    assert.equal(
      idlePreferenceDecision.action,
      "elicit_self_explanation",
      "重新开启后，空闲知识点仍应响应新的强结果证据"
    );
    assert.ok(
      idlePreferenceDecision.reason_codes.includes("shadow_mode_suppressed")
    );
    assert.equal(
      idlePreferenceDecision.reason_codes.includes("support_declined"),
      false
    );

    const normalizedPastUnit = units[2];
    const normalizedPastScene = normalizedPastUnit.resourceCandidates[0].type;
    await seedRepeatedParameterEvidence(
      runtime.baseUrl,
      treatment.token,
      normalizedPastUnit,
      normalizedPastScene,
      "normalized-past-evidence",
      { clockOffsetMs: -30 * 24 * 60 * 60 * 1000 }
    );
    const normalizedPastDecision = await requestRepeatedDecision(
      runtime.baseUrl,
      treatment.token,
      normalizedPastUnit,
      normalizedPastScene
    );
    assert.equal(normalizedPastDecision.response.status, 200);
    assert.equal(
      normalizedPastDecision.payload.study.deliveryDecision,
      "stay_silent"
    );

    const nearFutureUnit = units[3];
    const nearFutureScene = nearFutureUnit.resourceCandidates[0].type;
    await seedRepeatedParameterEvidence(
      runtime.baseUrl,
      treatment.token,
      nearFutureUnit,
      nearFutureScene,
      "near-future-evidence",
      { clockOffsetMs: 5 * 60 * 1000 }
    );
    const nearFutureDecision = await requestRepeatedDecision(
      runtime.baseUrl,
      treatment.token,
      nearFutureUnit,
      nearFutureScene
    );
    assert.equal(nearFutureDecision.response.status, 200);
    assert.equal(nearFutureDecision.payload.study.deliveryDecision, "stay_silent");

    const offsetClockUnit = units[4];
    const offsetClockScene = offsetClockUnit.resourceCandidates[0].type;
    await seedRepeatedParameterEvidence(
      runtime.baseUrl,
      treatment.token,
      offsetClockUnit,
      offsetClockScene,
      "offset-clock-evidence",
      { clockOffsetMs: 8 * 60 * 60 * 1000 }
    );
    const offsetClockDecision = await requestRepeatedDecision(
      runtime.baseUrl,
      treatment.token,
      offsetClockUnit,
      offsetClockScene
    );
    assert.equal(offsetClockDecision.response.status, 200);
    assert.equal(offsetClockDecision.payload.study.deliveryDecision, "stay_silent");

    const submittedPretestProtected = await requestJson(
      runtime.baseUrl,
      "POST",
      "/api/learning/assistant/intervention",
      {
        chapterId: "V14-C3",
        unitId: "V14-C3-pre",
        sceneType: "",
        signal: { kind: "quiz_review" },
        contextRef: { kind: "quiz", scope: "quiz" }
      },
      treatment.token
    );
    assert.equal(submittedPretestProtected.response.status, 200);
    assert.equal(submittedPretestProtected.payload.decision.action, "stay_silent");
    assert.equal(submittedPretestProtected.payload.interventionId, "");

    await seedRepeatedParameterEvidence(
      runtime.baseUrl,
      treatment.token,
      unit,
      sceneType,
      "shadow-evidence"
    );
    const shadowDecision = await requestRepeatedDecision(
      runtime.baseUrl,
      treatment.token,
      unit,
      sceneType
    );
    assert.equal(shadowDecision.response.status, 200);
    assert.ok(shadowDecision.payload.decisionId);
    assert.equal(shadowDecision.payload.study.mode, "shadow");
    assert.equal(
      Object.hasOwn(shadowDecision.payload.study.assignment, "condition"),
      false,
      "学生决策响应不得暴露随机条件"
    );
    assert.equal(shadowDecision.payload.study.deliveryDecision, "stay_silent");
    assert.equal(shadowDecision.payload.decision.action, "stay_silent");
    assert.equal(
      shadowDecision.payload.decision.why,
      "当前证据不足或不适合打断，知点保持安静。",
      "Shadow 的学生响应不得泄露内部政策模式"
    );
    assert.equal(shadowDecision.payload.interventionId, "");

    const forgedWithoutEvidence = await requestRepeatedDecision(
      runtime.baseUrl,
      control.token,
      unit,
      sceneType
    );
    assert.equal(forgedWithoutEvidence.response.status, 200);
    assert.equal(forgedWithoutEvidence.payload.decision.action, "stay_silent");

    const shadowAdmin = await adminDecisions(runtime.baseUrl, adminToken);
    assert.equal(shadowAdmin.response.status, 200);
    const storedShadow = shadowAdmin.payload.data.rows.find(
      (row) => row.id === shadowDecision.payload.decisionId
    );
    assert.ok(storedShadow);
    assert.equal(storedShadow.decision, "intervene");
    assert.equal(storedShadow.delivery_decision, "stay_silent");
    assert.equal(storedShadow.action, "observe_change");
    assert.ok(storedShadow.reason_codes.includes("shadow_mode_suppressed"));
    assert.ok(storedShadow.evidence_snapshot.parameterCommitCount >= 3);
    const storedNormalizedPast = shadowAdmin.payload.data.rows.find(
      (row) => row.id === normalizedPastDecision.payload.decisionId
    );
    assert.equal(storedNormalizedPast.decision, "intervene");
    assert.ok(
      storedNormalizedPast.evidence_snapshot.parameterCommitCount >= 3,
      "原始客户端伪造为很久以前的时间，不能绕过入库后的规范化时间"
    );
    const storedNearFuture = shadowAdmin.payload.data.rows.find(
      (row) => row.id === nearFutureDecision.payload.decisionId
    );
    assert.equal(storedNearFuture.decision, "stay_silent");
    assert.ok(
      storedNearFuture.reason_codes.includes("repeated_parameter_not_verified"),
      "服务端时间尚未到达的事件不能提前成为近期过程证据"
    );
    const storedOffsetClock = shadowAdmin.payload.data.rows.find(
      (row) => row.id === offsetClockDecision.payload.decisionId
    );
    assert.equal(storedOffsetClock.decision, "intervene");
    assert.ok(
      storedOffsetClock.evidence_snapshot.parameterCommitCount >= 3,
      "明显的客户端时钟偏移应使用入库规范化时间"
    );

    const assignmentBeforeRestart = treatmentState.payload.data.assignment;
    await stopChild(runtime.child);
    runtime = await startServer(root, dbPath, "active", adminToken);

    const stateAfterRestart = await requestJson(
      runtime.baseUrl,
      "GET",
      "/api/learning/proactive/state?chapterId=V14-C3",
      undefined,
      treatment.token
    );
    assert.equal(stateAfterRestart.response.status, 200);
    assert.equal(stateAfterRestart.payload.data.mode, "active");
    assert.deepEqual(
      stateAfterRestart.payload.data.assignment,
      assignmentBeforeRestart,
      "重启后必须保留原学生 assignment"
    );

    const quietUnit = units[1];
    const quietSceneType = quietUnit.resourceCandidates[0].type;
    await submitWrongFormative(runtime.baseUrl, treatment.token, quietUnit);
    await seedInteractionEvent(
      runtime.baseUrl,
      treatment.token,
      quietUnit,
      quietSceneType,
      "interactive_scroll",
      new Date(Date.now() - 120_000).toISOString(),
      "quiet-dwell-start"
    );
    const quietPending = await requestQuietDecision(
      runtime.baseUrl,
      treatment.token,
      quietUnit,
      quietSceneType
    );
    assert.equal(quietPending.response.status, 200);
    assert.equal(quietPending.payload.study.deliveryDecision, "stay_silent");
    assert.equal(quietPending.payload.study.pendingBoundaryEvaluation, true);
    assert.equal(quietPending.payload.interventionId, "");

    const pendingQuietState = await requestJson(
      runtime.baseUrl,
      "GET",
      "/api/learning/proactive/state?chapterId=V14-C3",
      undefined,
      treatment.token
    );
    const persistedPending = pendingQuietState.payload.data.policyStates.find(
      (row) => row.scopeKey === quietUnit.id
    );
    assert.equal(persistedPending.pendingCandidateKind, "quiet_dwell");
    assert.equal(persistedPending.pendingBoundaryEvaluation, true);

    await seedInteractionEvent(
      runtime.baseUrl,
      treatment.token,
      quietUnit,
      quietSceneType,
      "interactive_submit",
      new Date().toISOString(),
      "quiet-dwell-boundary"
    );
    const quietBoundary = await requestQuietDecision(
      runtime.baseUrl,
      treatment.token,
      quietUnit,
      quietSceneType,
      {
        boundaryRecheck: true,
        boundaryEventType: "interactive_submit"
      }
    );
    assert.equal(quietBoundary.response.status, 200);
    assert.equal(quietBoundary.payload.study.deliveryDecision, "intervene");
    assert.equal(quietBoundary.payload.study.pendingBoundaryEvaluation, false);
    assert.equal(quietBoundary.payload.decision.action, "ask_clarification");
    assert.ok(quietBoundary.payload.interventionId);

    const declinedUnit = units[4];
    await submitFormative(
      runtime.baseUrl,
      treatment.token,
      declinedUnit,
      { correct: false }
    );
    const declinedSelfExplanation = await requestFormativeOutcome(
      runtime.baseUrl,
      treatment.token,
      declinedUnit
    );
    assert.equal(
      declinedSelfExplanation.payload.decision.action,
      "elicit_self_explanation"
    );
    await resolveDecision(
      runtime.baseUrl,
      treatment.token,
      declinedSelfExplanation.payload.decisionId,
      "shown"
    );
    const declinedResolution = await resolveDecision(
      runtime.baseUrl,
      treatment.token,
      declinedSelfExplanation.payload.decisionId,
      "dismissed"
    );
    assert.equal(declinedResolution.response.status, 200);
    assert.equal(
      declinedResolution.payload.data.policyState.lifecycle.phase,
      "declined"
    );
    const declinedFormativeReuse = await requestFormativeOutcome(
      runtime.baseUrl,
      treatment.token,
      declinedUnit
    );
    assert.equal(
      declinedFormativeReuse.payload.study.deliveryDecision,
      "stay_silent"
    );
    assert.equal(declinedFormativeReuse.payload.interventionId, "");
    const declinedSceneType = declinedUnit.resourceCandidates[0].type;
    await seedIndependentAttemptEvidence(
      runtime.baseUrl,
      treatment.token,
      declinedUnit,
      declinedSceneType,
      false,
      "declined-independent-failed"
    );
    const declinedIndependent = await requestIndependentAttemptOutcome(
      runtime.baseUrl,
      treatment.token,
      declinedUnit,
      declinedSceneType
    );
    assert.equal(
      declinedIndependent.payload.study.deliveryDecision,
      "stay_silent"
    );
    assert.equal(declinedIndependent.payload.interventionId, "");

    const declinedProbeUnit = units[3];
    await submitFormative(
      runtime.baseUrl,
      treatment.token,
      declinedProbeUnit,
      { correct: false }
    );
    const declinedProbeOffer = await requestFormativeOutcome(
      runtime.baseUrl,
      treatment.token,
      declinedProbeUnit
    );
    await resolveDecision(
      runtime.baseUrl,
      treatment.token,
      declinedProbeOffer.payload.decisionId,
      "shown"
    );
    await resolveDecision(
      runtime.baseUrl,
      treatment.token,
      declinedProbeOffer.payload.decisionId,
      "accepted"
    );
    await answerProactivePrompt(
      runtime.baseUrl,
      treatment.token,
      declinedProbeUnit,
      declinedProbeOffer.payload.interventionId,
      "我先说明末端新增窄条与函数值之间的关系。"
    );
    const declinedProbeStateResponse = await requestJson(
      runtime.baseUrl,
      "GET",
      "/api/learning/proactive/state?chapterId=V14-C3",
      undefined,
      treatment.token
    );
    const declinedProbeState = declinedProbeStateResponse.payload.data.policyStates.find(
      (row) => row.scopeKey === declinedProbeUnit.id
    );
    assert.ok(declinedProbeState.verificationCheck);
    const declinedProbe = await submitVerificationCheck(
      runtime.baseUrl,
      treatment.token,
      declinedProbeUnit,
      declinedProbeState.verificationCheck,
      { declined: true }
    );
    assert.equal(declinedProbe.response.status, 200);
    assert.equal(declinedProbe.payload.checkResult.status, "declined");
    assert.equal(declinedProbe.payload.study.deliveryDecision, "stay_silent");
    assert.equal(
      declinedProbe.payload.study.policyState.lifecycle.phase,
      "declined"
    );
    assert.ok(
      declinedProbe.payload.study.policyState.lifecycle.lastOutcome
        .includes("verification_declined")
    );

    const lifecycleUnit = units[5];
    await submitFormative(
      runtime.baseUrl,
      treatment.token,
      lifecycleUnit,
      { correct: false }
    );
    const selfExplanation = await requestFormativeOutcome(
      runtime.baseUrl,
      treatment.token,
      lifecycleUnit
    );
    assert.equal(selfExplanation.response.status, 200);
    assert.equal(selfExplanation.payload.study.deliveryDecision, "intervene");
    assert.equal(
      selfExplanation.payload.decision.action,
      "elicit_self_explanation"
    );
    assert.equal(
      selfExplanation.payload.decision.interactionMode,
      "student_reply"
    );
    assert.match(
      selfExplanation.payload.decision.assistantPrompt,
      /换元|微分元|上下限/
    );
    assert.ok(selfExplanation.payload.interventionId);

    const selfExplanationShown = await resolveDecision(
      runtime.baseUrl,
      treatment.token,
      selfExplanation.payload.decisionId,
      "shown"
    );
    assert.equal(selfExplanationShown.response.status, 200);
    const selfExplanationAccepted = await resolveDecision(
      runtime.baseUrl,
      treatment.token,
      selfExplanation.payload.decisionId,
      "accepted"
    );
    assert.equal(selfExplanationAccepted.response.status, 200);
    assert.equal(
      selfExplanationAccepted.payload.data.policyState.lifecycle.phase,
      "accepted_pending_response"
    );

    const pendingResponseFormativeReuse = await requestFormativeOutcome(
      runtime.baseUrl,
      treatment.token,
      lifecycleUnit
    );
    assert.equal(
      pendingResponseFormativeReuse.payload.study.deliveryDecision,
      "stay_silent"
    );
    const lifecycleSceneType = lifecycleUnit.resourceCandidates[0].type;
    const pendingResponseIndependent = await requestIndependentAttemptOutcome(
      runtime.baseUrl,
      treatment.token,
      lifecycleUnit,
      lifecycleSceneType
    );
    assert.equal(
      pendingResponseIndependent.payload.study.deliveryDecision,
      "stay_silent"
    );

    await answerProactivePrompt(
      runtime.baseUrl,
      treatment.token,
      lifecycleUnit,
      selfExplanation.payload.interventionId,
      "我理解换元是在改写整个积分变量，所以内层函数、微分元和定积分上下限都要同步换成新变量。"
    );
    const awaitingAttempt = await requestJson(
      runtime.baseUrl,
      "GET",
      "/api/learning/proactive/state?chapterId=V14-C3",
      undefined,
      treatment.token
    );
    const awaitingState = awaitingAttempt.payload.data.policyStates.find(
      (row) => row.scopeKey === lifecycleUnit.id
    );
    assert.equal(
      awaitingState.lifecycle.phase,
      "awaiting_independent_attempt"
    );
    assert.equal(awaitingState.currentLevel, "L1");
    assert.ok(awaitingState.lifecycle.responseSubmittedAt);
    assert.ok(
      awaitingState.verificationCheck,
      "L1 回复后必须签发平台自有的无提示验证题"
    );
    assert.equal(awaitingState.verificationCheck.supportLevel, "L1");
    assert.equal(
      Object.hasOwn(awaitingState.verificationCheck, "answer"),
      false,
      "学生状态接口不得泄露验证题答案"
    );

    const unverifiedIndependent = await requestIndependentAttemptOutcome(
      runtime.baseUrl,
      treatment.token,
      lifecycleUnit,
      lifecycleSceneType
    );
    assert.equal(
      unverifiedIndependent.payload.study.deliveryDecision,
      "stay_silent"
    );
    assert.equal(unverifiedIndependent.payload.interventionId, "");

    await stopChild(runtime.child);
    runtime = await startServer(root, dbPath, "active", adminToken);
    const lifecycleAfterRestart = await requestJson(
      runtime.baseUrl,
      "GET",
      "/api/learning/proactive/state?chapterId=V14-C3",
      undefined,
      treatment.token
    );
    const persistedLifecycle = lifecycleAfterRestart.payload.data.policyStates.find(
      (row) => row.scopeKey === lifecycleUnit.id
    );
    assert.equal(
      persistedLifecycle.lifecycle.phase,
      "awaiting_independent_attempt",
      "服务重启后必须保留等待独立尝试的知识点级生命周期"
    );
    assert.equal(
      persistedLifecycle.lifecycle.responseSubmittedAt,
      awaitingState.lifecycle.responseSubmittedAt
    );
    assert.equal(
      persistedLifecycle.verificationCheck.id,
      awaitingState.verificationCheck.id,
      "服务重启后必须恢复同一张尚未作答的无提示验证题"
    );

    const conceptHint = await submitVerificationCheck(
      runtime.baseUrl,
      treatment.token,
      lifecycleUnit,
      persistedLifecycle.verificationCheck,
      { correct: false }
    );
    assert.equal(conceptHint.response.status, 200);
    assert.equal(conceptHint.payload.checkResult.status, "incorrect");
    assert.equal(conceptHint.payload.checkResult.source, "policy_owned_probe");
    assert.equal(conceptHint.payload.study.deliveryDecision, "intervene");
    assert.equal(conceptHint.payload.decision.action, "concept_hint");
    assert.match(
      conceptHint.payload.decision.assistantPrompt,
      /变量系统|内层函数|导数因子|上下限/
    );

    await resolveDecision(
      runtime.baseUrl,
      treatment.token,
      conceptHint.payload.decisionId,
      "shown"
    );
    const conceptAccepted = await resolveDecision(
      runtime.baseUrl,
      treatment.token,
      conceptHint.payload.decisionId,
      "accepted"
    );
    assert.equal(conceptAccepted.response.status, 200);
    assert.equal(
      conceptAccepted.payload.data.policyState.lifecycle.phase,
      "accepted_pending_response"
    );
    assert.equal(conceptAccepted.payload.data.policyState.currentLevel, "L2");
    await answerProactivePrompt(
      runtime.baseUrl,
      treatment.token,
      lifecycleUnit,
      conceptHint.payload.interventionId,
      "我还留着旧变量的上下限，应该先按替换关系把上下限也改成新变量。"
    );

    const l2Awaiting = await requestJson(
      runtime.baseUrl,
      "GET",
      "/api/learning/proactive/state?chapterId=V14-C3",
      undefined,
      treatment.token
    );
    const l2AwaitingState = l2Awaiting.payload.data.policyStates.find(
      (row) => row.scopeKey === lifecycleUnit.id
    );
    assert.equal(l2AwaitingState.currentLevel, "L2");
    assert.equal(
      l2AwaitingState.lifecycle.phase,
      "awaiting_independent_attempt"
    );
    assert.equal(l2AwaitingState.verificationCheck.supportLevel, "L2");
    assert.notEqual(
      l2AwaitingState.verificationCheck.id,
      awaitingState.verificationCheck.id
    );

    const recoveredOutcome = await submitVerificationCheck(
      runtime.baseUrl,
      treatment.token,
      lifecycleUnit,
      l2AwaitingState.verificationCheck,
      { correct: true }
    );
    assert.equal(recoveredOutcome.response.status, 200);
    assert.equal(recoveredOutcome.payload.checkResult.status, "correct");
    assert.equal(
      recoveredOutcome.payload.study.deliveryDecision,
      "stay_silent"
    );
    assert.equal(recoveredOutcome.payload.interventionId, "");
    assert.equal(
      recoveredOutcome.payload.study.policyState.lifecycle.phase,
      "exited"
    );
    assert.equal(
      recoveredOutcome.payload.study.policyState.lifecycle.lastOutcome,
      "independent_attempt_success"
    );
    assert.equal(recoveredOutcome.payload.study.policyState.currentLevel, "L0");
    assert.equal(recoveredOutcome.payload.study.policyState.fadeLevel, 1);

    const coursewareUnit = units[6];
    const coursewareSceneType = coursewareUnit.resourceCandidates[0].type;
    const coursewareSelfExplanation = await requestFormativeOutcome(
      runtime.baseUrl,
      treatment.token,
      coursewareUnit
    );
    assert.equal(coursewareSelfExplanation.payload.study.deliveryDecision, "intervene");
    assert.equal(
      coursewareSelfExplanation.payload.decision.action,
      "elicit_self_explanation"
    );
    await resolveDecision(
      runtime.baseUrl,
      treatment.token,
      coursewareSelfExplanation.payload.decisionId,
      "shown"
    );
    await resolveDecision(
      runtime.baseUrl,
      treatment.token,
      coursewareSelfExplanation.payload.decisionId,
      "accepted"
    );
    await answerProactivePrompt(
      runtime.baseUrl,
      treatment.token,
      coursewareUnit,
      coursewareSelfExplanation.payload.interventionId,
      "我会先比较分部积分两种选择转换后的新积分，再选择能让新积分更简单的一种。"
    );
    await seedIndependentAttemptEvidence(
      runtime.baseUrl,
      treatment.token,
      coursewareUnit,
      coursewareSceneType,
      false,
      "courseware-semantic-independent-failed"
    );
    const coursewareEscalation = await requestIndependentAttemptOutcome(
      runtime.baseUrl,
      treatment.token,
      coursewareUnit,
      coursewareSceneType
    );
    assert.equal(coursewareEscalation.response.status, 200);
    assert.equal(coursewareEscalation.payload.study.deliveryDecision, "intervene");
    assert.equal(coursewareEscalation.payload.decision.action, "concept_hint");
    const coursewareAudit = await adminDecisions(runtime.baseUrl, adminToken);
    const coursewareL1Row = coursewareAudit.payload.data.rows.find(
      (row) => row.intervention_id === coursewareSelfExplanation.payload.interventionId
    );
    assert.equal(
      coursewareL1Row.followup_outcome.independentAttempt.source,
      "courseware_semantic_event"
    );
    assert.equal(
      coursewareL1Row.followup_outcome.independentAttempt.eventType,
      "courseware_challenge_result"
    );
    await resolveDecision(
      runtime.baseUrl,
      treatment.token,
      coursewareEscalation.payload.decisionId,
      "shown"
    );
    await resolveDecision(
      runtime.baseUrl,
      treatment.token,
      coursewareEscalation.payload.decisionId,
      "dismissed"
    );

    await seedRepeatedParameterEvidence(
      runtime.baseUrl,
      treatment.token,
      unit,
      sceneType,
      "active-treatment-evidence"
    );
    const activeTreatment = await requestRepeatedDecision(
      runtime.baseUrl,
      treatment.token,
      unit,
      sceneType
    );
    assert.equal(activeTreatment.response.status, 200);
    assert.equal(activeTreatment.payload.study.deliveryDecision, "intervene");
    assert.equal(activeTreatment.payload.decision.action, "observe_change");
    assert.equal(activeTreatment.payload.decision.intervene, true);
    assert.ok(activeTreatment.payload.interventionId);

    const duplicateOffer = await requestRepeatedDecision(
      runtime.baseUrl,
      treatment.token,
      unit,
      sceneType
    );
    assert.equal(duplicateOffer.response.status, 200);
    assert.equal(duplicateOffer.payload.study.deliveryDecision, "stay_silent");
    assert.equal(duplicateOffer.payload.interventionId, "");
    assert.equal(
      duplicateOffer.payload.interventionBudget.remaining,
      activeTreatment.payload.interventionBudget.remaining,
      "未决建议不应重复消耗主动介入预算"
    );

    await seedRepeatedParameterEvidence(
      runtime.baseUrl,
      control.token,
      unit,
      sceneType,
      "active-control-evidence"
    );
    const activeControl = await requestRepeatedDecision(
      runtime.baseUrl,
      control.token,
      unit,
      sceneType
    );
    assert.equal(activeControl.response.status, 200);
    assert.equal(
      Object.hasOwn(activeControl.payload.study.assignment, "condition"),
      false,
      "Control 学生也不得从响应读取自己的随机条件"
    );
    assert.equal(activeControl.payload.study.deliveryDecision, "stay_silent");
    assert.equal(activeControl.payload.decision.action, "stay_silent");
    assert.equal(
      activeControl.payload.decision.why,
      "当前证据不足或不适合打断，知点保持安静。",
      "Control 的学生响应不得泄露随机条件"
    );
    assert.equal(activeControl.payload.interventionId, "");

    const disabledPreference = await updateProactivePreference(
      runtime.baseUrl,
      control.token,
      "off"
    );
    assert.equal(disabledPreference.response.status, 200);
    assert.equal(disabledPreference.payload.data.studentPreference, "off");
    const disabledPreferenceDecision = await requestRepeatedDecision(
      runtime.baseUrl,
      control.token,
      unit,
      sceneType
    );
    assert.equal(disabledPreferenceDecision.response.status, 200);
    assert.equal(
      disabledPreferenceDecision.payload.study.deliveryDecision,
      "stay_silent"
    );
    const disabledPreferenceAdmin = await adminDecisions(
      runtime.baseUrl,
      adminToken
    );
    const storedDisabledPreference = disabledPreferenceAdmin.payload.data.rows.find(
      (row) => row.id === disabledPreferenceDecision.payload.decisionId
    );
    assert.ok(
      storedDisabledPreference.reason_codes.includes("student_preference_off")
    );
    await updateProactivePreference(runtime.baseUrl, control.token, "standard");

    const crossUserResolution = await requestJson(
      runtime.baseUrl,
      "POST",
      `/api/learning/proactive/${activeTreatment.payload.decisionId}/resolution`,
      { resolution: "accepted" },
      control.token
    );
    assert.equal(crossUserResolution.response.status, 404);

    const acceptedBeforeShown = await requestJson(
      runtime.baseUrl,
      "POST",
      `/api/learning/proactive/${activeTreatment.payload.decisionId}/resolution`,
      { resolution: "accepted" },
      treatment.token
    );
    assert.equal(acceptedBeforeShown.response.status, 409);
    assert.equal(
      acceptedBeforeShown.payload.code,
      "proactive_resolution_shown_required",
      "未确认展示的 offer 不能被客户端直接伪造成已接受"
    );

    const shown = await requestJson(
      runtime.baseUrl,
      "POST",
      `/api/learning/proactive/${activeTreatment.payload.decisionId}/resolution`,
      { resolution: "shown" },
      treatment.token
    );
    assert.equal(shown.response.status, 200);
    assert.equal(shown.payload.data.resolution, "shown");

    const accepted = await requestJson(
      runtime.baseUrl,
      "POST",
      `/api/learning/proactive/${activeTreatment.payload.decisionId}/resolution`,
      { resolution: "accepted" },
      treatment.token
    );
    assert.equal(accepted.response.status, 200);
    assert.equal(accepted.payload.data.policyState.dismissStreak, 0);
    assert.ok(accepted.payload.data.policyState.cooldownUntil);

    const replayed = await requestJson(
      runtime.baseUrl,
      "POST",
      `/api/learning/proactive/${activeTreatment.payload.decisionId}/resolution`,
      { resolution: "accepted" },
      treatment.token
    );
    assert.equal(replayed.response.status, 409);
    assert.equal(replayed.payload.code, "proactive_resolution_replayed");

    const cooldownDecision = await requestRepeatedDecision(
      runtime.baseUrl,
      treatment.token,
      unit,
      sceneType
    );
    assert.equal(cooldownDecision.response.status, 200);
    assert.equal(cooldownDecision.payload.study.deliveryDecision, "stay_silent");
    assert.equal(cooldownDecision.payload.interventionId, "");

    const activeAdmin = await adminDecisions(runtime.baseUrl, adminToken);
    assert.equal(activeAdmin.response.status, 200);
    assert.ok(
      activeAdmin.payload.data.rows.some(
        (row) => row.id === shadowDecision.payload.decisionId
      ),
      "shadow decision 必须在重启后仍可导出"
    );
    const storedActive = activeAdmin.payload.data.rows.find(
      (row) => row.id === activeTreatment.payload.decisionId
    );
    assert.equal(storedActive.intervention_status, "accepted");
    assert.equal(typeof storedActive.evidence_snapshot, "object");
    assert.equal(typeof storedActive.budget_snapshot, "object");
    assert.equal(typeof storedActive.presentation, "object");
    assert.equal(typeof storedActive.followup_outcome, "object");
    const storedSelfExplanation = activeAdmin.payload.data.rows.find(
      (row) => row.id === selfExplanation.payload.decisionId
    );
    const storedConceptHint = activeAdmin.payload.data.rows.find(
      (row) => row.id === conceptHint.payload.decisionId
    );
    const storedDeclinedReuse = activeAdmin.payload.data.rows.find(
      (row) => row.id === declinedFormativeReuse.payload.decisionId
    );
    const storedDeclinedIndependent = activeAdmin.payload.data.rows.find(
      (row) => row.id === declinedIndependent.payload.decisionId
    );
    const storedPendingResponseReuse = activeAdmin.payload.data.rows.find(
      (row) => row.id === pendingResponseFormativeReuse.payload.decisionId
    );
    const storedPendingResponseIndependent = activeAdmin.payload.data.rows.find(
      (row) => row.id === pendingResponseIndependent.payload.decisionId
    );
    const storedUnverifiedIndependent = activeAdmin.payload.data.rows.find(
      (row) => row.id === unverifiedIndependent.payload.decisionId
    );
    assert.ok(storedDeclinedReuse.reason_codes.includes("support_declined"));
    assert.ok(
      storedDeclinedIndependent.reason_codes.includes(
        "independent_attempt_not_expected"
      )
    );
    assert.ok(
      storedPendingResponseReuse.reason_codes.includes(
        "accepted_response_pending"
      )
    );
    assert.ok(
      storedPendingResponseIndependent.reason_codes.includes(
        "independent_attempt_not_expected"
      )
    );
    assert.ok(
      storedUnverifiedIndependent.reason_codes.includes(
        "independent_attempt_not_verified"
      )
    );
    assert.equal(storedSelfExplanation.scope_key, lifecycleUnit.id);
    assert.equal(storedSelfExplanation.support_level, "L1");
    assert.equal(
      storedSelfExplanation.followup_outcome.studentResponse.submitted,
      true
    );
    assert.equal(
      storedSelfExplanation.followup_outcome.independentAttempt.outcome,
      "continued_friction"
    );
    assert.equal(storedSelfExplanation.current_lifecycle.phase, "exited");
    assert.equal(storedSelfExplanation.current_policy_level, "L0");
    assert.equal(storedSelfExplanation.current_fade_level, 1);
    assert.equal(storedConceptHint.scope_key, lifecycleUnit.id);
    assert.equal(storedConceptHint.support_level, "L2");
    assert.equal(
      storedConceptHint.followup_outcome.independentAttempt.outcome,
      "independent_attempt_success"
    );
    const storedProtectedAfterSubmit = activeAdmin.payload.data.rows.find(
      (row) => row.id === submittedPretestProtected.payload.decisionId
    );
    assert.ok(storedProtectedAfterSubmit.reason_codes.includes("protected_assessment_stage"));
    const storedDuplicate = activeAdmin.payload.data.rows.find(
      (row) => row.id === duplicateOffer.payload.decisionId
    );
    assert.ok(storedDuplicate.reason_codes.includes("open_intervention_exists"));
    const storedCooldown = activeAdmin.payload.data.rows.find(
      (row) => row.id === cooldownDecision.payload.decisionId
    );
    assert.ok(storedCooldown.reason_codes.includes("policy_cooldown_active"));
    assert.ok(activeAdmin.payload.data.summary.decisions >= 9);
    assert.ok(activeAdmin.payload.data.summary.policy_interventions >= 3);
    assert.ok(activeAdmin.payload.data.summary.delivered_interventions >= 1);
    assert.ok(activeAdmin.payload.data.summary.l1_self_explanations >= 3);
    assert.equal(activeAdmin.payload.data.summary.l2_concept_hints, 2);
    assert.equal(activeAdmin.payload.data.summary.continued_friction, 2);
    assert.equal(activeAdmin.payload.data.summary.independent_success_exits, 1);
    assert.equal(
      activeAdmin.payload.data.summary.accepted,
      5,
      "观察提示、三条自我解释和概念提示五条已展示建议都应保留接受记录"
    );
    assert.ok(
      activeAdmin.payload.data.summary.conditions.some(
        (row) => row.condition === "control"
      )
    );
    assert.ok(
      activeAdmin.payload.data.summary.conditions.some(
        (row) => row.condition === "treatment"
      )
    );
    assert.ok(
      activeAdmin.payload.data.assignments.some(
        (row) => row.condition === "control"
      )
    );
    assert.ok(
      activeAdmin.payload.data.assignments.some(
        (row) => row.condition === "treatment"
      )
    );

    await stopChild(runtime.child);
    await setDecisionExpiry(
      dbPath,
      quietBoundary.payload.decisionId,
      "2026-08-27T00:00:00.000Z"
    );
    runtime = await startServer(root, dbPath, "active", adminToken);
    const expiryAdmin = await adminDecisions(runtime.baseUrl, adminToken);
    const storedExpired = expiryAdmin.payload.data.rows.find(
      (row) => row.id === quietBoundary.payload.decisionId
    );
    assert.equal(storedExpired.intervention_status, "expired");
    assert.equal(storedExpired.resolution, "expired");
    assert.equal(expiryAdmin.payload.data.summary.unresolved_offers, 0);
    assert.ok(expiryAdmin.payload.data.summary.expired >= 1);

    const cooldownAfterRestart = await requestRepeatedDecision(
      runtime.baseUrl,
      treatment.token,
      unit,
      sceneType
    );
    assert.equal(cooldownAfterRestart.response.status, 200);
    assert.equal(cooldownAfterRestart.payload.study.deliveryDecision, "stay_silent");
    assert.equal(cooldownAfterRestart.payload.interventionId, "");
    const afterRestartAdmin = await adminDecisions(runtime.baseUrl, adminToken);
    const storedCooldownAfterRestart = afterRestartAdmin.payload.data.rows.find(
      (row) => row.id === cooldownAfterRestart.payload.decisionId
    );
    assert.ok(
      storedCooldownAfterRestart.reason_codes.includes("policy_cooldown_active"),
      "重启后必须继续执行已持久化的冷却状态"
    );

    await runUndeliveredEscalationRegression({
      root,
      tmpDir,
      sourceChapter,
      units,
      adminToken
    });

    const snapshotBeforeReset = await requestJson(
      runtime.baseUrl,
      "GET",
      "/api/learning/snapshot",
      undefined,
      treatment.token
    );
    assert.equal(snapshotBeforeReset.response.status, 200);
    const resetResult = await requestJson(
      runtime.baseUrl,
      "POST",
      "/api/learning/reset",
      {
        generation: snapshotBeforeReset.payload.generation,
        baseRevision: snapshotBeforeReset.payload.revision,
        snapshot: {
          currentChapterId: "V14-C3",
          currentUnitId: "V14-C3-pre",
          completed: [],
          submittedQuizzes: [],
          quizResults: []
        }
      },
      treatment.token
    );
    assert.equal(resetResult.response.status, 200);
    assert.ok(
      resetResult.payload.proactiveReset.clearedPolicyStates > 0,
      "新学习代次必须清除旧知识点支架生命周期"
    );
    const stateAfterLearningReset = await requestJson(
      runtime.baseUrl,
      "GET",
      "/api/learning/proactive/state?chapterId=V14-C3",
      undefined,
      treatment.token
    );
    assert.equal(stateAfterLearningReset.response.status, 200);
    assert.equal(stateAfterLearningReset.payload.data.studentPreference, "standard");
    assert.equal(
      stateAfterLearningReset.payload.data.policyStates.length,
      0,
      "学生偏好可以保留，但旧学习代次的冷却、待验证和支架回合不得泄漏到新代次"
    );
    const postResetDecision = await requestRepeatedDecision(
      runtime.baseUrl,
      treatment.token,
      unit,
      sceneType
    );
    assert.equal(postResetDecision.response.status, 200);
    const auditAfterLearningReset = await adminDecisions(
      runtime.baseUrl,
      adminToken
    );
    const oldGenerationRow = auditAfterLearningReset.payload.data.rows.find(
      (row) => row.id === cooldownAfterRestart.payload.decisionId
    );
    const newGenerationRow = auditAfterLearningReset.payload.data.rows.find(
      (row) => row.id === postResetDecision.payload.decisionId
    );
    assert.equal(oldGenerationRow.learning_generation, 1);
    assert.equal(oldGenerationRow.current_learning_generation, 2);
    assert.deepEqual(
      oldGenerationRow.current_lifecycle,
      {},
      "历史学习代次的决策不得错误挂接新代次的当前生命周期"
    );
    assert.equal(newGenerationRow.learning_generation, 2);
    assert.equal(newGenerationRow.current_learning_generation, 2);

    console.log("proactive study API tests passed");
  } finally {
    await stopChild(runtime?.child);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
