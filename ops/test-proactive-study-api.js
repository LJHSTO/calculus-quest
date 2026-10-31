const assert = require("node:assert/strict");
const fs = require("node:fs");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const proactivePolicy = require("../lib/proactive-policy");
const proactiveOutcomes = require("../lib/proactive-outcomes/archive/v14-c3-v3");

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

async function simulateArchivedWaitingCheck(dbPath, userId, scopeKey, checkId = "") {
  const SQL = await require("sql.js")();
  const database = new SQL.Database(fs.readFileSync(dbPath));
  try {
    const statement = database.prepare(
      "SELECT lifecycle_json FROM proactive_policy_state WHERE user_id = ? AND scope_key = ? AND experiment_id = ?"
    );
    statement.bind([userId, scopeKey, "v14-c3-api-test"]);
    assert.equal(statement.step(), true);
    const lifecycle = JSON.parse(statement.getAsObject().lifecycle_json);
    statement.free();
    if (checkId) lifecycle.activeVerificationCheckId = checkId;
    else delete lifecycle.activeVerificationCheckId;
    database.run("UPDATE proactive_policy_state SET lifecycle_json = ? WHERE user_id = ? AND scope_key = ? AND experiment_id = ?",
      [JSON.stringify(lifecycle), userId, scopeKey, "v14-c3-api-test"]);
    fs.writeFileSync(dbPath, Buffer.from(database.export()));
  } finally { database.close(); }
}

const maintenanceTokens=new Map();
async function requestJson(baseUrl, method, pathname, body, token = "") {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(pathname==='/api/admin/learning/reset'?{'x-admin-token':maintenanceTokens.get(baseUrl)}:{}),
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
  const payload = await response.json().catch(() => ({}));
  return { response, payload };
}

async function startServer(root, dbPath, mode, adminToken, options = {}) {
  const port = await freePort();
  const baseUrl = `http://127.0.0.1:${port}`;maintenanceTokens.set(baseUrl,adminToken);
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
      LOCAL_ADMIN_AUTH_BYPASS: "false",
      PROACTIVE_POLICY_MODE: mode,
      PROACTIVE_OUTCOME_INSTRUMENT_VERSION: "v14-c3-outcomes-v3",
      PROACTIVE_EXPERIMENT_ID: options.experimentId || "v14-c3-api-test",
      PROACTIVE_EXPERIMENT_CHAPTER_ID: "V14-C3",
      PROACTIVE_POLICY_VERSION: options.policyVersion || "v14-c3-api-test-v3",
      PROACTIVE_ADAPTER_VERSION: options.adapterVersion || "v14-c3-adapter-v3",
      PROACTIVE_ASSIGNMENT_STRATEGY: options.assignmentStrategy || "hash",
      PROACTIVE_ASSIGNMENT_VERSION: options.assignmentVersion || "api-test-hash-v1",
      PROACTIVE_ASSIGNMENT_SALT: "api-test-only-salt",
      PROACTIVE_GLOBAL_PREFERENCE_CONTROL:
        options.globalPreferenceControl === false ? "false" : "true",
      PROACTIVE_PUBLIC_CHAPTER_ONLY: "true",
      PROACTIVE_PARTICIPATION_MODE:
        options.participationMode || "implicit-pilot",
      PROACTIVE_CONSENT_VERSION: options.consentVersion || "",
      PROACTIVE_CONSENT_NOTICE_URL: options.consentNoticeUrl || "",
      PROACTIVE_EXPERIMENT_ARMS: options.experimentArms || "control,treatment",
      PROACTIVE_DISPLAY_ARMS: options.displayArms || "treatment",
      ...(options.retentionDelayHours === "use-server-default"
        ? {}
        : {
            PROACTIVE_RETENTION_DELAY_HOURS: String(
              options.retentionDelayHours ?? 0
            )
          }),
      ...(options.retentionCloseHours === "use-server-default"
        ? {}
        : {
            PROACTIVE_RETENTION_CLOSE_HOURS: String(
              options.retentionCloseHours ?? 120
            )
          }),
      ...(options.retentionReminderHours === "use-server-default"
        ? {}
        : {
            PROACTIVE_RETENTION_REMINDER_HOURS: String(
              options.retentionReminderHours ?? "0,96"
            )
          }),
      LEARNING_ASSISTANT_DAILY_INTERVENTIONS: String(
        options.dailyInterventions || "30"
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

let registrationSequence = 0;

async function register(baseUrl, suffix) {
  registrationSequence += 1;
  const uniquePrefix = registrationSequence.toString(36);
  const compactSuffix = String(suffix || "")
    .replace(/\s+/g, "")
    .slice(-12);
  const result = await requestJson(baseUrl, "POST", "/api/auth/register", {
    nickname: `主动${uniquePrefix}-${compactSuffix}`.slice(0, 24),
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
    PROACTIVE_POLICY_VERSION: "v14-c3-api-test-v3",
    PROACTIVE_ADAPTER_VERSION: "v14-c3-adapter-v3",
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

async function submitPosttest(baseUrl, token, postQuiz) {
  const result = await requestJson(
    baseUrl,
    "POST",
    "/api/learning/quiz/submit",
    {
      unitId: "V14-C3-post",
      chapterId: "V14-C3",
      phase: "post",
      answers: postQuiz.questions.map((question) => ({
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
  assert.equal(result.payload.results.length, postQuiz.questions.length);
  return result.payload;
}

async function outcomeState(baseUrl, token) {
  return requestJson(
    baseUrl,
    "GET",
    "/api/learning/proactive/outcomes?chapterId=V14-C3",
    undefined,
    token
  );
}

async function updateParticipation(
  baseUrl,
  token,
  action,
  {
    confirmed = action === "enroll",
    consentVersion = "",
    reason = action === "withdraw" ? "student_withdrawal" : ""
  } = {}
) {
  return requestJson(
    baseUrl,
    "POST",
    "/api/learning/proactive/participation",
    {
      chapterId: "V14-C3",
      action,
      confirmed,
      consentVersion,
      reason
    },
    token
  );
}

async function startOutcome(baseUrl, token, stageId) {
  return requestJson(
    baseUrl,
    "POST",
    "/api/learning/proactive/outcomes/start",
    {
      chapterId: "V14-C3",
      stageId
    },
    token
  );
}

async function saveOutcomeDraft(
  baseUrl,
  token,
  stageId,
  sessionId,
  responses
) {
  return requestJson(
    baseUrl,
    "POST",
    "/api/learning/proactive/outcomes/draft",
    {
      chapterId: "V14-C3",
      stageId,
      sessionId,
      responses
    },
    token
  );
}

async function submitOutcome(
  baseUrl,
  token,
  stageId,
  sessionId,
  responses
) {
  return requestJson(
    baseUrl,
    "POST",
    "/api/learning/proactive/outcomes/submit",
    {
      chapterId: "V14-C3",
      stageId,
      sessionId,
      responses,
      startedAt: "2000-01-01T00:00:00.000Z",
      durationMs: 1
    },
    token
  );
}

async function withdrawOutcome(
  baseUrl,
  token,
  sessionId,
  reason = "student_exit"
) {
  return requestJson(
    baseUrl,
    "POST",
    "/api/learning/proactive/outcomes/withdraw",
    {
      chapterId: "V14-C3",
      sessionId,
      reason
    },
    token
  );
}

async function skipOutcome(
  baseUrl,
  token,
  sessionId,
  reason = "student_skip"
) {
  return requestJson(
    baseUrl,
    "POST",
    "/api/learning/proactive/outcomes/skip",
    {
      chapterId: "V14-C3",
      sessionId,
      reason
    },
    token
  );
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
  eventId,
  evidenceOverrides = {}
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
            is_correct: success,
            independent: true,
            hint_count: 0,
            reset_count: 0,
            ...evidenceOverrides
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

async function resolveDecision(baseUrl, token, decisionId, resolution, extra = {}) {
  return requestJson(
    baseUrl,
    "POST",
    `/api/learning/proactive/${decisionId}/resolution`,
    { resolution, ...extra },
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

async function updateProactiveScopePreference(
  baseUrl,
  token,
  scopeKey,
  preference
) {
  return requestJson(
    baseUrl,
    "POST",
    "/api/learning/proactive/scope-preference",
    {
      chapterId: "V14-C3",
      scopeKey,
      preference
    },
    token
  );
}

async function requestAlternativeHelp(
  baseUrl,
  token,
  unit,
  currentSceneType,
  sourceDecisionId
) {
  return requestJson(
    baseUrl,
    "POST",
    "/api/learning/assistant/intervention",
    {
      chapterId: "V14-C3",
      unitId: unit.id,
      sceneType: currentSceneType,
      signal: {
        kind: "student_requested_alternative",
        sourceDecisionId
      },
      contextRef: {
        kind: "unit",
        scope: "lesson"
      }
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
  const response = await requestProactivePromptAnswer(
    baseUrl,
    token,
    unit,
    interventionId,
    question,
    { knowledgeUnit }
  );
  const text = await response.text();
  assert.equal(response.status, 200, text);
  const events = text
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  assert.ok(events.some((event) => event.type === "done"));
  return events;
}

async function requestProactivePromptAnswer(
  baseUrl,
  token,
  unit,
  interventionId,
  question,
  { knowledgeUnit = false } = {}
) {
  const unitId = knowledgeUnit ? unit.id : `${unit.id}-formative`;
  return fetch(`${baseUrl}/api/learning/assistant/ask`, {
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
}

async function adminDecisions(
  baseUrl,
  adminToken,
  experimentId = "v14-c3-api-test"
) {
  return requestJson(
    baseUrl,
    "GET",
    `/api/admin/research/proactive-decisions?experimentId=${encodeURIComponent(experimentId)}&limit=1000`,
    undefined,
    adminToken
  );
}

async function updateExperimentRuntime(
  baseUrl,
  adminToken,
  status,
  reason = "",
  updatedBy = "api-test"
) {
  return requestJson(
    baseUrl,
    "POST",
    "/api/admin/research/proactive-runtime",
    {
      experimentId: "v14-c3-api-test",
      status,
      reason,
      updatedBy
    },
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
    const prematureReply = await requestProactivePromptAnswer(
      runtime.baseUrl,
      treatment.token,
      preferenceUnit,
      preferenceOffer.payload.interventionId,
      "我还没有接受这次主动建议。"
    );
    assert.equal(prematureReply.status, 409);
    assert.equal(
      (await prematureReply.json()).code,
      "assistant_intervention_not_accepted"
    );
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
    const closedReply = await requestProactivePromptAnswer(
      runtime.baseUrl,
      treatment.token,
      preferenceUnit,
      preferenceOffer.payload.interventionId,
      "关闭主动帮助后不应继续复用这条提示。"
    );
    assert.equal(closedReply.status, 409);
    assert.equal(
      (await closedReply.json()).code,
      "assistant_intervention_expired"
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

async function runBalancedAssignmentRegression({
  root,
  tmpDir,
  sourceChapter,
  adminToken
}) {
  const dbPath = path.join(tmpDir, "proactive-balanced-assignment.db");
  let runtime;
  try {
    runtime = await startServer(
      root,
      dbPath,
      "shadow",
      adminToken,
      {
        assignmentStrategy: "stratified-balanced",
        assignmentVersion: "api-test-balanced-v1",
        experimentArms: "control,minimal,adaptive",
        displayArms: "minimal,adaptive"
      }
    );
    for (let index = 0; index < 15; index += 1) {
      const participant = await register(
        runtime.baseUrl,
        `平衡分配${Date.now()}${index}`
      );
      await submitPretest(
        runtime.baseUrl,
        participant.token,
        sourceChapter.flow.preQuiz
      );
      const state = await requestJson(
        runtime.baseUrl,
        "GET",
        "/api/learning/proactive/state?chapterId=V14-C3",
        undefined,
        participant.token
      );
      assert.equal(state.response.status, 200);
      assert.equal(state.payload.data.assignmentPending, false);
    }
    const admin = await adminDecisions(runtime.baseUrl, adminToken);
    assert.equal(admin.response.status, 200);
    assert.equal(
      admin.payload.data.policy.assignmentStrategy,
      "stratified-balanced"
    );
    assert.equal(
      admin.payload.data.policy.assignmentVersion,
      "api-test-balanced-v1"
    );
    const counts = Object.fromEntries(
      ["control", "minimal", "adaptive"].map((condition) => {
        const participants = admin.payload.data.assignments
          .filter((row) => (
            row.condition === condition
            && row.stratum === "pre-high"
          ))
          .reduce((sum, row) => sum + Number(row.participants || 0), 0);
        return [condition, participants];
      })
    );
    assert.equal(
      Object.values(counts).reduce((sum, value) => sum + value, 0),
      15
    );
    assert.ok(
      Math.max(...Object.values(counts)) - Math.min(...Object.values(counts)) <= 1,
      `三臂层内平衡分配人数差不应超过 1：${JSON.stringify(counts)}`
    );
  } finally {
    await stopChild(runtime?.child);
  }
}

async function runProtocolDriftRegression({
  root,
  tmpDir,
  adminToken
}) {
  const dbPath = path.join(tmpDir, "proactive-protocol-drift.db");
  const experimentId = "v14-c3-protocol-drift-test";
  const baselineOptions = {
    experimentId,
    policyVersion: "v14-c3-protocol-baseline-v1"
  };
  let runtime;
  try {
    runtime = await startServer(
      root,
      dbPath,
      "shadow",
      adminToken,
      baselineOptions
    );
    const baseline = await requestJson(
      runtime.baseUrl,
      "GET",
      `/api/admin/research/proactive-decisions?experimentId=${encodeURIComponent(experimentId)}`,
      undefined,
      adminToken
    );
    assert.equal(baseline.response.status, 200);
    const baselineFingerprint = baseline.payload.data.protocol.fingerprint;
    assert.match(baselineFingerprint, /^[a-f0-9]{64}$/);
    await stopChild(runtime.child);
    runtime = null;

    let driftRuntime;
    let driftError = null;
    try {
      driftRuntime = await startServer(
        root,
        dbPath,
        "shadow",
        adminToken,
        {
          ...baselineOptions,
          policyVersion: "v14-c3-protocol-drifted-v2"
        }
      );
    } catch (error) {
      driftError = error;
    } finally {
      await stopChild(driftRuntime?.child);
    }
    assert.ok(driftError, "同一 experiment id 的协议漂移必须拒绝启动");
    assert.match(
      driftError.message,
      /协议指纹与已冻结快照不一致|PROACTIVE_PROTOCOL_FINGERPRINT_MISMATCH/
    );

    runtime = await startServer(
      root,
      dbPath,
      "shadow",
      adminToken,
      baselineOptions
    );
    const restored = await requestJson(
      runtime.baseUrl,
      "GET",
      `/api/admin/research/proactive-decisions?experimentId=${encodeURIComponent(experimentId)}`,
      undefined,
      adminToken
    );
    assert.equal(restored.response.status, 200);
    assert.equal(
      restored.payload.data.protocol.fingerprint,
      baselineFingerprint
    );
    assert.equal(restored.payload.data.protocol.currentMatches, true);
  } finally {
    await stopChild(runtime?.child);
  }
}

async function runDefaultRetentionDelayRegression({
  root,
  tmpDir,
  adminToken
}) {
  const dbPath = path.join(tmpDir, "proactive-retention-default.db");
  let runtime;
  try {
    runtime = await startServer(root, dbPath, "shadow", adminToken, {
      experimentId: "v14-c3-retention-default-test",
      policyVersion: "v14-c3-retention-default-v1",
      adapterVersion: "v14-c3-adapter-v3",
      assignmentVersion: "retention-default-v1",
      retentionDelayHours: "use-server-default",
      retentionCloseHours: "use-server-default",
      retentionReminderHours: "use-server-default"
    });
    const admin = await adminDecisions(
      runtime.baseUrl,
      adminToken,
      "v14-c3-retention-default-test"
    );
    assert.equal(admin.response.status, 200);
    assert.equal(
      admin.payload.data.protocol.definition.retentionDelayHours,
      72,
      "未提供有效配置时，延迟保持测应默认在章后测 72 小时后开放"
    );
    assert.equal(admin.payload.data.outcomes.retentionDelayHours, 72);
    assert.equal(
      admin.payload.data.protocol.definition.retentionCloseHours,
      null,
      "延迟保持测默认不设置关闭时间"
    );
    assert.equal(admin.payload.data.outcomes.retentionCloseHours, null);
    assert.deepEqual(
      admin.payload.data.protocol.definition.retentionReminderHours,
      [72, 96],
      "保持测运营提醒应固定记录 72 小时与 96 小时两个节点"
    );
    assert.deepEqual(admin.payload.data.outcomes.retentionReminderHours, [72, 96]);
  } finally {
    await stopChild(runtime?.child);
  }
}

async function runPilotAssignmentPrivacyRegression({
  root,
  tmpDir,
  sourceChapter,
  units,
  adminToken
}) {
  const experimentId = "v14-c3-pilot-privacy-test";
  const dbPath = path.join(tmpDir, "proactive-pilot-privacy.db");
  let runtime;
  try {
    runtime = await startServer(root, dbPath, "active", adminToken, {
      experimentId,
      policyVersion: "v14-c3-pilot-privacy-v1",
      assignmentVersion: "pilot-privacy-hash-v1",
      globalPreferenceControl: false
    });
    const participant = await register(runtime.baseUrl, `隐私${Date.now()}`);
    await submitPretest(runtime.baseUrl, participant.token, sourceChapter.flow.preQuiz);

    const state = await requestJson(
      runtime.baseUrl,
      "GET",
      "/api/learning/proactive/state?chapterId=V14-C3",
      undefined,
      participant.token
    );
    assert.equal(state.response.status, 200);
    assert.ok(state.payload.data.assignment);
    assert.equal(Object.hasOwn(state.payload.data.assignment, "condition"), false);
    assert.equal(state.payload.data.globalPreferenceControlEnabled, false);

    const lockedPreference = await updateProactivePreference(
      runtime.baseUrl,
      participant.token,
      "off"
    );
    assert.equal(lockedPreference.response.status, 403);
    assert.equal(lockedPreference.payload.code, "proactive_global_preference_locked");

    const unit = units[0];
    const semanticEventId = `pilot-binding-${Date.now()}`;
    const event = await requestJson(
      runtime.baseUrl,
      "POST",
      "/api/learning/events",
      {
        events: [{
          eventId: semanticEventId,
          type: "interaction",
          payload: {
            schemaVersion: 1,
            eventId: semanticEventId,
            eventType: "courseware_challenge_result",
            source: "iframe",
            chapterId: "V14-C3",
            unitId: unit.id,
            unitLabel: unit.name,
            unitType: "knowledge",
            sceneType: unit.resourceCandidates[0].type,
            research: {
              experimentId: "forged-experiment",
              condition: "forged-condition",
              cohort: "forged-cohort",
              assignmentVersion: "forged-version",
              learningGeneration: 999,
              protocolFingerprint: "forged-fingerprint"
            },
            data: {
              event_id: semanticEventId,
              attempt_id: `${semanticEventId}-attempt`,
              attempt_number: 1,
              challenge_id: "pilot-server-binding-check",
              resource_id: "pilot-courseware-resource",
              resource_title: "Pilot 服务端绑定检查",
              knowledge_point_id: unit.id,
              concept_tag: unit.name,
              scene_type: unit.resourceCandidates[0].type,
              independent: true,
              hint_count: 0,
              reset_count: 0,
              is_correct: true,
              completed: true,
              time_on_task_ms: 1200
            }
          }
        }]
      },
      participant.token
    );
    assert.equal(event.response.status, 200);

    const admin = await adminDecisions(runtime.baseUrl, adminToken, experimentId);
    assert.equal(admin.response.status, 200);
    const rosterRow = admin.payload.data.assignmentRoster.rows.find(
      (row) => row.user_id === participant.participantId
    );
    const analysisRow = admin.payload.data.participantAnalysis.find(
      (row) => row.user_id === participant.participantId
    );
    assert.ok(rosterRow?.condition);
    assert.equal(analysisRow?.condition, rosterRow.condition);
    assert.ok(
      admin.payload.data.coursewareChallenges.some(
        (row) => row.challenge_id === "pilot-server-binding-check"
      )
    );
    assert.equal(typeof admin.payload.data.analysisSummary, "object");
    assert.equal(typeof admin.payload.data.dataQuality, "object");
    const metadataMismatchIds = new Set([
      "courseware_experiment_mismatch",
      "courseware_group_mismatch",
      "courseware_assignment_version_mismatch",
      "courseware_generation_mismatch",
      "courseware_protocol_mismatch"
    ]);
    assert.equal(
      admin.payload.data.dataQuality.signals.some(
        (signal) => metadataMismatchIds.has(signal.id)
      ),
      false,
      "课件客户端伪造的实验元数据必须被服务端真实分组覆盖"
    );
  } finally {
    await stopChild(runtime?.child);
  }
}

async function runExplicitParticipationRegression({
  root,
  tmpDir,
  sourceChapter,
  units,
  adminToken
}) {
  const dbPath = path.join(tmpDir, "proactive-explicit-participation.db");
  const consentVersion = "v14-c3-consent-test-v1";
  const consentNoticeUrl = "/research/v14-c3-consent-test-v1.html";
  let runtime;
  try {
    runtime = await startServer(
      root,
      dbPath,
      "active",
      adminToken,
      {
        participationMode: "explicit-consent",
        consentVersion,
        consentNoticeUrl,
        dailyInterventions: 30
      }
    );

    let interventionParticipant = null;
    for (let index = 0; index < 16; index += 1) {
      const participant = await register(
        runtime.baseUrl,
        `显式参与${Date.now()}${index}`
      );
      if (
        expectedCondition(participant.participantId) === "treatment"
      ) {
        interventionParticipant = participant;
        break;
      }
    }
    assert.ok(
      interventionParticipant,
      "显式参与回归需要一个 Treatment 学生"
    );

    await submitPretest(
      runtime.baseUrl,
      interventionParticipant.token,
      sourceChapter.flow.preQuiz
    );
    const beforeConsent = await requestJson(
      runtime.baseUrl,
      "GET",
      "/api/learning/proactive/state?chapterId=V14-C3",
      undefined,
      interventionParticipant.token
    );
    assert.equal(beforeConsent.response.status, 200);
    assert.equal(beforeConsent.payload.data.pretest.ready, true);
    assert.equal(beforeConsent.payload.data.participation.mode, "explicit-consent");
    assert.equal(beforeConsent.payload.data.participation.status, "not_enrolled");
    assert.equal(beforeConsent.payload.data.participation.canEnroll, true);
    assert.equal(
      beforeConsent.payload.data.participation.consentVersion,
      consentVersion
    );
    assert.equal(
      beforeConsent.payload.data.participation.consentNoticeUrl,
      consentNoticeUrl
    );
    assert.equal(beforeConsent.payload.data.assignment, null);
    assert.equal(beforeConsent.payload.data.assignmentPending, false);
    assert.equal(beforeConsent.payload.data.candidateCollectionEnabled, false);

    await seedRepeatedParameterEvidence(
      runtime.baseUrl,
      interventionParticipant.token,
      units[0],
      units[0].resourceCandidates[0].type,
      "explicit-before-consent"
    );
    const beforeConsentDecision = await requestRepeatedDecision(
      runtime.baseUrl,
      interventionParticipant.token,
      units[0],
      units[0].resourceCandidates[0].type
    );
    assert.equal(beforeConsentDecision.response.status, 200);
    assert.equal(
      beforeConsentDecision.payload.study.deliveryDecision,
      "stay_silent"
    );
    assert.equal(beforeConsentDecision.payload.decision.action, "stay_silent");

    const staleConsent = await updateParticipation(
      runtime.baseUrl,
      interventionParticipant.token,
      "enroll",
      {
        confirmed: true,
        consentVersion: "stale-consent-version"
      }
    );
    assert.equal(staleConsent.response.status, 409);
    assert.equal(
      staleConsent.payload.code,
      "proactive_consent_confirmation_required"
    );

    const unconfirmedConsent = await updateParticipation(
      runtime.baseUrl,
      interventionParticipant.token,
      "enroll",
      {
        confirmed: false,
        consentVersion
      }
    );
    assert.equal(unconfirmedConsent.response.status, 409);
    assert.equal(
      unconfirmedConsent.payload.code,
      "proactive_consent_confirmation_required"
    );

    const enrollment = await updateParticipation(
      runtime.baseUrl,
      interventionParticipant.token,
      "enroll",
      { confirmed: true, consentVersion }
    );
    assert.equal(enrollment.response.status, 200);
    assert.equal(enrollment.payload.idempotent, false);
    assert.equal(enrollment.payload.data.participation.status, "enrolled");
    assert.equal(enrollment.payload.data.assignmentPending, false);
    assert.ok(enrollment.payload.data.assignment);
    assert.equal(enrollment.payload.data.candidateCollectionEnabled, true);

    const lifecycleUnit = units[0];
    await submitWrongFormative(
      runtime.baseUrl,
      interventionParticipant.token,
      lifecycleUnit
    );
    const lifecycleOffer = await requestFormativeOutcome(
      runtime.baseUrl,
      interventionParticipant.token,
      lifecycleUnit
    );
    assert.equal(lifecycleOffer.payload.study.deliveryDecision, "intervene");
    await resolveDecision(
      runtime.baseUrl,
      interventionParticipant.token,
      lifecycleOffer.payload.decisionId,
      "shown"
    );
    await resolveDecision(
      runtime.baseUrl,
      interventionParticipant.token,
      lifecycleOffer.payload.decisionId,
      "accepted"
    );
    await answerProactivePrompt(
      runtime.baseUrl,
      interventionParticipant.token,
      lifecycleUnit,
      lifecycleOffer.payload.interventionId,
      "我先解释自己刚才为什么会选错。"
    );
    const lifecycleStateBeforeWithdrawal = await requestJson(
      runtime.baseUrl,
      "GET",
      "/api/learning/proactive/state?chapterId=V14-C3",
      undefined,
      interventionParticipant.token
    );
    assert.ok(
      lifecycleStateBeforeWithdrawal.payload.data.policyStates.some(
        (row) => (
          row.scopeKey === lifecycleUnit.id
          && row.lifecycle.phase === "awaiting_independent_attempt"
        )
      ),
      "退出研究前应存在一个等待独立验证的支架生命周期"
    );

    const pendingUnit = units[1];
    const pendingScene = pendingUnit.resourceCandidates[0].type;
    await seedRepeatedParameterEvidence(
      runtime.baseUrl,
      interventionParticipant.token,
      pendingUnit,
      pendingScene,
      "explicit-pending-offer"
    );
    const pendingOffer = await requestRepeatedDecision(
      runtime.baseUrl,
      interventionParticipant.token,
      pendingUnit,
      pendingScene
    );
    assert.equal(pendingOffer.payload.study.deliveryDecision, "intervene");
    assert.ok(pendingOffer.payload.interventionId);

    const withdrawal = await updateParticipation(
      runtime.baseUrl,
      interventionParticipant.token,
      "withdraw",
      { reason: "privacy_concern" }
    );
    assert.equal(withdrawal.response.status, 200);
    assert.equal(withdrawal.payload.idempotent, false);
    assert.ok(withdrawal.payload.closure.closedInterventions >= 1);
    assert.ok(withdrawal.payload.closure.closedLifecycleEpisodes >= 1);
    assert.equal(withdrawal.payload.data.participation.status, "withdrawn");
    assert.equal(withdrawal.payload.data.participation.canEnroll, false);
    assert.equal(withdrawal.payload.data.participation.canWithdraw, false);
    assert.equal(withdrawal.payload.data.assignment, null);
    assert.equal(withdrawal.payload.data.assignmentPending, false);
    assert.equal(withdrawal.payload.data.candidateCollectionEnabled, false);
    assert.deepEqual(withdrawal.payload.data.policyStates, []);

    const reenroll = await updateParticipation(
      runtime.baseUrl,
      interventionParticipant.token,
      "enroll",
      { confirmed: true, consentVersion }
    );
    assert.equal(reenroll.response.status, 409);
    assert.equal(
      reenroll.payload.code,
      "proactive_participation_withdrawn_terminal"
    );

    await seedRepeatedParameterEvidence(
      runtime.baseUrl,
      interventionParticipant.token,
      pendingUnit,
      pendingScene,
      "explicit-after-withdrawal"
    );
    const withdrawnDecision = await requestRepeatedDecision(
      runtime.baseUrl,
      interventionParticipant.token,
      pendingUnit,
      pendingScene
    );
    assert.equal(withdrawnDecision.response.status, 200);
    assert.equal(
      withdrawnDecision.payload.study.deliveryDecision,
      "stay_silent"
    );
    assert.equal(withdrawnDecision.payload.decision.action, "stay_silent");

    const measurementParticipant = await register(
      runtime.baseUrl,
      `显式测量退出${Date.now()}`
    );
    const measurementEnrollment = await updateParticipation(
      runtime.baseUrl,
      measurementParticipant.token,
      "enroll",
      { confirmed: true, consentVersion }
    );
    assert.equal(measurementEnrollment.response.status, 200);
    await submitPretest(
      runtime.baseUrl,
      measurementParticipant.token,
      sourceChapter.flow.preQuiz
    );
    await submitPosttest(
      runtime.baseUrl,
      measurementParticipant.token,
      sourceChapter.flow.postQuiz
    );
    const measurementStart = await startOutcome(
      runtime.baseUrl,
      measurementParticipant.token,
      "near_transfer"
    );
    assert.equal(measurementStart.response.status, 200);
    assert.ok(measurementStart.payload.sessionId);
    const measurementWithdrawal = await updateParticipation(
      runtime.baseUrl,
      measurementParticipant.token,
      "withdraw",
      { reason: "burden" }
    );
    assert.equal(measurementWithdrawal.response.status, 200);
    assert.equal(
      measurementWithdrawal.payload.closure.withdrawnOutcomeSessions,
      1
    );
    const withdrawnOutcomeState = await outcomeState(
      runtime.baseUrl,
      measurementParticipant.token
    );
    assert.equal(withdrawnOutcomeState.response.status, 200);
    assert.equal(withdrawnOutcomeState.payload.data.activeSession, null);
    assert.equal(
      withdrawnOutcomeState.payload.data.participation.status,
      "withdrawn"
    );
    const withdrawnNearTransfer = withdrawnOutcomeState.payload.data.stages.find(
      (stage) => stage.id === "near_transfer"
    );
    assert.equal(withdrawnNearTransfer.status, "withdrawn");

    const admin = await adminDecisions(runtime.baseUrl, adminToken);
    assert.equal(admin.response.status, 200);
    assert.equal(admin.payload.data.policy.participationMode, "explicit-consent");
    assert.equal(admin.payload.data.policy.participationReady, true);
    assert.equal(admin.payload.data.integrity.signals.length, 8);
    assert.equal(
      admin.payload.data.integrity.signals.find(
        (signal) => signal.id === "post_withdrawal_display"
      )?.count,
      0
    );
    assert.ok(
      admin.payload.data.assignments.reduce(
        (sum, row) => sum + Number(row.participants || 0),
        0
      ) >= 2,
      "退出研究后原 assignment 必须保留供 ITT 分析"
    );
    assert.ok(
      admin.payload.data.participation.some(
        (row) => (
          row.status === "withdrawn"
          && row.consent_version === consentVersion
          && Number(row.participants || 0) >= 2
        )
      )
    );
    const storedPendingOffer = admin.payload.data.rows.find(
      (row) => row.id === pendingOffer.payload.decisionId
    );
    assert.equal(storedPendingOffer.intervention_status, "study_withdrawn");
    assert.equal(storedPendingOffer.resolution, "study_withdrawn");
    assert.equal(storedPendingOffer.participation_status, "withdrawn");
    assert.equal(
      storedPendingOffer.participation_consent_version,
      consentVersion
    );
    const storedWithdrawnDecision = admin.payload.data.rows.find(
      (row) => row.id === withdrawnDecision.payload.decisionId
    );
    assert.ok(
      storedWithdrawnDecision.reason_codes.includes("participant_withdrawn")
    );
    assert.equal(storedWithdrawnDecision.participation_status, "withdrawn");
    const storedBeforeConsentDecision = admin.payload.data.rows.find(
      (row) => row.id === beforeConsentDecision.payload.decisionId
    );
    assert.ok(
      storedBeforeConsentDecision.reason_codes.includes(
        "participant_not_enrolled"
      )
    );
    const treatmentFlow = admin.payload.data.participantFlow.find(
      (row) => row.condition === "treatment"
    );
    assert.ok(treatmentFlow?.studyWithdrawn >= 1);
    assert.ok(
      admin.payload.data.participantFlow.some(
        (row) => row.nearWithdrawn >= 1 && row.studyWithdrawn >= 1
      ),
      "研究退出与测量退出必须在参与者流中分别保留"
    );
    assert.ok(
      Array.isArray(admin.payload.data.outcomes.sessions),
      "管理员 API 必须返回测量会话明细"
    );
    const withdrawnMeasurementSession = admin.payload.data.outcomes.sessions.find(
      (row) => row.id === measurementStart.payload.sessionId
    );
    assert.ok(withdrawnMeasurementSession);
    assert.equal(withdrawnMeasurementSession.status, "withdrawn");
    assert.equal(
      withdrawnMeasurementSession.withdrawal_reason,
      "consent_withdrawal"
    );
    assert.equal(
      withdrawnMeasurementSession.participation_status,
      "withdrawn"
    );
    assert.equal(
      withdrawnMeasurementSession.participation_consent_version,
      consentVersion
    );
    assert.ok(
      admin.payload.data.outcomes.sessionSummary.some(
        (row) => (
          row.stage === "near_transfer"
          && row.status === "withdrawn"
          && Number(row.sessions || 0) >= 1
        )
      ),
      "管理员 API 必须保留按阶段与状态汇总的测量失访"
    );
  } finally {
    await stopChild(runtime?.child);
  }
}

async function runDecisionAuthorizationRegression({
  root,
  tmpDir,
  sourceChapter,
  units,
  adminToken
}) {
  const dbPath = path.join(tmpDir, "proactive-decision-authorization.db");
  let runtime;
  try {
    runtime = await startServer(root, dbPath, "active", adminToken);
    let treatment = null;
    for (let index = 0; index < 24; index += 1) {
      const candidate = await register(
        runtime.baseUrl,
        `decision-auth-${Date.now()}-${index}`
      );
      if (expectedCondition(candidate.participantId) === "treatment") {
        treatment = candidate;
        break;
      }
    }
    assert.ok(treatment, "决策授权回归需要 Treatment 学生");
    await submitPretest(runtime.baseUrl, treatment.token, sourceChapter.flow.preQuiz);

    const pausedUnit = units[0];
    const pausedSceneType = pausedUnit.resourceCandidates[0].type;
    await seedRepeatedParameterEvidence(
      runtime.baseUrl,
      treatment.token,
      pausedUnit,
      pausedSceneType,
      "decision-auth-paused"
    );
    const pausedOffer = await requestRepeatedDecision(
      runtime.baseUrl,
      treatment.token,
      pausedUnit,
      pausedSceneType
    );
    assert.equal(pausedOffer.payload.study.deliveryDecision, "intervene");
    await resolveDecision(
      runtime.baseUrl,
      treatment.token,
      pausedOffer.payload.decisionId,
      "shown"
    );

    const paused = await updateExperimentRuntime(
      runtime.baseUrl,
      adminToken,
      "paused",
      "决策授权回归：暂停后旧提示不得继续执行",
      "authorization-regression"
    );
    assert.equal(paused.response.status, 200);
    const pausedResolution = await resolveDecision(
      runtime.baseUrl,
      treatment.token,
      pausedOffer.payload.decisionId,
      "accepted"
    );
    assert.equal(pausedResolution.response.status, 409);
    assert.equal(
      pausedResolution.payload.code,
      "proactive_decision_paused",
      "实验暂停后不得把旧提示继续记为已接受"
    );
    const pausedAlternative = await requestAlternativeHelp(
      runtime.baseUrl,
      treatment.token,
      pausedUnit,
      pausedSceneType,
      pausedOffer.payload.decisionId
    );
    assert.equal(pausedAlternative.response.status, 409);
    assert.equal(
      pausedAlternative.payload.code,
      "proactive_alternative_source_paused",
      "实验暂停后不得由旧提示继续派生替代帮助"
    );

    const resumed = await updateExperimentRuntime(
      runtime.baseUrl,
      adminToken,
      "active",
      "",
      "authorization-regression"
    );
    assert.equal(resumed.response.status, 200);

    const staleUnit = units[1];
    const staleSceneType = staleUnit.resourceCandidates[0].type;
    await seedRepeatedParameterEvidence(
      runtime.baseUrl,
      treatment.token,
      staleUnit,
      staleSceneType,
      "decision-auth-generation"
    );
    const staleOffer = await requestRepeatedDecision(
      runtime.baseUrl,
      treatment.token,
      staleUnit,
      staleSceneType
    );
    assert.equal(staleOffer.payload.study.deliveryDecision, "intervene");
    await resolveDecision(
      runtime.baseUrl,
      treatment.token,
      staleOffer.payload.decisionId,
      "shown"
    );

    const snapshot = await requestJson(
      runtime.baseUrl,
      "GET",
      "/api/learning/snapshot",
      undefined,
      treatment.token
    );
    assert.equal(snapshot.response.status, 200);
    const reset = await requestJson(
      runtime.baseUrl,
      "POST",
      "/api/admin/learning/reset",
      {
        generation: snapshot.payload.generation,
        baseRevision: snapshot.payload.revision,
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
    assert.equal(reset.response.status, 200);

    const staleResolution = await resolveDecision(
      runtime.baseUrl,
      treatment.token,
      staleOffer.payload.decisionId,
      "accepted"
    );
    assert.equal(staleResolution.response.status, 410);
    assert.equal(
      staleResolution.payload.code,
      "proactive_decision_inactive",
      "旧学习代次的提示不得在新代次中继续改变状态"
    );
    const staleAlternative = await requestAlternativeHelp(
      runtime.baseUrl,
      treatment.token,
      staleUnit,
      staleSceneType,
      staleOffer.payload.decisionId
    );
    assert.equal(staleAlternative.response.status, 410);
    assert.equal(
      staleAlternative.payload.code,
      "proactive_alternative_source_inactive",
      "旧学习代次的提示不得在新代次中派生替代帮助"
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

    // 伪造的信号在**知识点单元**上必须被明确拒绝，而不是"碰巧静默"。
    // 管理式路径会用自己的服务端证据重判一遍，所以伪造本就造不出干预；
    // 但如果只是静默，"信号校验还在不在"就永远测不出来——一旦哪天被删掉，
    // 客户端就可以拿任意声明去试探策略层。这条断言就是那道保险。
    const forgedQuizReviewInManagedChapter = await requestJson(
      runtime.baseUrl,
      "POST",
      "/api/learning/assistant/intervention",
      {
        chapterId: "V14-C3",
        unitId: unit.id,
        sceneType,
        signal: { kind: "quiz_review", incorrect: 99, pendingReview: 0 },
        contextRef: { kind: "unit", scope: "lesson" }
      },
      treatment.token
    );
    assert.equal(forgedQuizReviewInManagedChapter.response.status, 400);
    assert.equal(
      forgedQuizReviewInManagedChapter.payload.code,
      "assistant_intervention_signal_mismatch",
      "知识点单元上的 quiz_review 必须被拒绝：这里根本没有测验成绩可复盘"
    );
    const forgedDwellInManagedChapter = await requestJson(
      runtime.baseUrl,
      "POST",
      "/api/learning/assistant/intervention",
      {
        chapterId: "V14-C3",
        unitId: unit.id,
        sceneType,
        signal: { kind: "quiet_dwell", dwellSeconds: 5 },
        contextRef: { kind: "unit", scope: "lesson" }
      },
      treatment.token
    );
    assert.equal(forgedDwellInManagedChapter.response.status, 400);
    assert.equal(
      forgedDwellInManagedChapter.payload.code,
      "assistant_intervention_signal_mismatch",
      "停留时长不够就不能声称学生在原地卡住"
    );

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
    // 受保护测量阶段（未交卷的预/后测）必须由策略层回答，并**落一条决策记录**：
    // 管理端统计（protected_blocks）和事后分析都靠它。所以这里要断言 200 静默 +
    // `protected_assessment_stage` 理由码，而不是"信号不合法"的 400——后者会把
    // "考试期间不打扰"误报成"你的信号发错了"，并且让决策记录直接消失。
    assert.equal(protectedStage.response.status, 200);
    assert.equal(protectedStage.payload.study.assignmentPending, true);
    assert.equal(protectedStage.payload.decision.action, "stay_silent");

    const pendingAdmin = await adminDecisions(runtime.baseUrl, adminToken);
    assert.equal(pendingAdmin.response.status, 200);
    assert.equal(pendingAdmin.payload.data.assignments.length, 0);
    assert.equal(pendingAdmin.payload.data.policy.assignmentStrategy, "hash");
    assert.equal(pendingAdmin.payload.data.runtime.status, "active");
    assert.equal(pendingAdmin.payload.data.runtimeEvents.length, 0);
    assert.equal(pendingAdmin.payload.data.protocol.currentMatches, true);
    assert.match(
      pendingAdmin.payload.data.protocol.fingerprint,
      /^[a-f0-9]{64}$/
    );
    assert.equal(
      pendingAdmin.payload.data.protocol.definition.courseRouteVersion,
      route.versionId
    );
    assert.match(
      pendingAdmin.payload.data.protocol.definition.courseRouteDigest,
      /^[a-f0-9]{64}$/
    );
    assert.match(
      pendingAdmin.payload.data.protocol.definition.sourceDigests.policyKernel,
      /^[a-f0-9]{64}$/
    );
    assert.equal(
      pendingAdmin.payload.data.protocol.definition.stoppingRules.advisoryOnly,
      true
    );
    assert.equal(
      pendingAdmin.payload.data.outcomes.instrumentVersion,
      "v14-c3-outcomes-v3"
    );
    assert.equal(pendingAdmin.payload.data.integrity.advisoryOnly, true);
    assert.equal(pendingAdmin.payload.data.integrity.signals.length, 8);
    assert.deepEqual(pendingAdmin.payload.data.participantFlow, []);
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
      "accepted",
      // Hint Justification：学生接受内容型提示时说的那句理由。
      // 它必须落到**决策行**（followup_outcome_json）上，不能只留在事件载荷里——
      // 分析包导出的是决策表，三层因变量的过程层要能只凭一份导出就算出来。
      {
        justification: "因为要先确定自变量，才能对应到唯一的输出值。",
        justificationRequested: true
      }
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

    await stopChild(runtime.child);
    runtime = await startServer(root, dbPath, "active", adminToken);
    const acceptedPromptAfterRestart = await requestJson(runtime.baseUrl,"GET",
      `/api/learning/assistant/history?chapterId=V14-C3&unitId=${lifecycleUnit.id}-formative`,undefined,treatment.token);
    assert.equal(acceptedPromptAfterRestart.response.status,200);
    assert.equal(acceptedPromptAfterRestart.payload.pendingSupportPrompt?.interventionId,selfExplanation.payload.interventionId,
      "服务重启后恢复原已接受帮助，不重新签发新的业务介入");
    assert.equal(acceptedPromptAfterRestart.payload.pendingSupportPrompt?.content,selfExplanation.payload.decision.assistantPrompt);

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
    assert.equal(awaitingState.verificationCheck.instrumentVersion, "v14-c3-verification-v3");
    assert.equal(awaitingState.verificationCheck.evidenceScope, "post_support_local_check");
    assert.equal(awaitingState.lifecycle.activeVerificationCheckId, awaitingState.verificationCheck.id);
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

    await stopChild(runtime.child);
    await simulateArchivedWaitingCheck(dbPath, treatment.participantId, lifecycleUnit.id,
      `${lifecycleUnit.id}-probe-l1-v2`);
    runtime = await startServer(root, dbPath, "active", adminToken);
    const v2Waiting = await requestJson(runtime.baseUrl, "GET",
      "/api/learning/proactive/state?chapterId=V14-C3", undefined, treatment.token);
    const v2Check = v2Waiting.payload.data.policyStates.find((row) => row.scopeKey === lifecycleUnit.id).verificationCheck;
    assert.equal(v2Check.instrumentVersion, "v14-c3-verification-v2");
    assert.equal(v2Check.id, `${lifecycleUnit.id}-probe-l1-v2`);
    const staleV3 = await submitVerificationCheck(runtime.baseUrl, treatment.token,
      lifecycleUnit, persistedLifecycle.verificationCheck, { correct: false });
    assert.equal(staleV3.response.status, 409, "v2等待回合不能提交同层v3题");
    assert.equal(staleV3.payload.code, "proactive_verification_stale");
    await stopChild(runtime.child);
    await simulateArchivedWaitingCheck(dbPath, treatment.participantId, lifecycleUnit.id);
    runtime = await startServer(root, dbPath, "active", adminToken);
    const legacyWaiting = await requestJson(runtime.baseUrl, "GET",
      "/api/learning/proactive/state?chapterId=V14-C3", undefined, treatment.token);
    const legacyCheck = legacyWaiting.payload.data.policyStates.find(
      (row) => row.scopeKey === lifecycleUnit.id
    ).verificationCheck;
    assert.equal(legacyCheck.id, `${lifecycleUnit.id}-probe-l1-v1`,
      "旧等待回合缺少签发题号时只能恢复原v1题");
    assert.equal(legacyCheck.instrumentVersion, "v14-c3-verification-v1");
    const wrongVersionCheck = await submitVerificationCheck(runtime.baseUrl, treatment.token,
      lifecycleUnit, persistedLifecycle.verificationCheck, { correct: false });
    assert.equal(wrongVersionCheck.response.status, 409);
    assert.equal(wrongVersionCheck.payload.code, "proactive_verification_stale");
    const conceptHint = await submitVerificationCheck(
      runtime.baseUrl,
      treatment.token,
      lifecycleUnit,
      legacyCheck,
      { correct: false }
    );
    assert.equal(conceptHint.response.status, 200);
    assert.equal(conceptHint.payload.checkResult.status, "incorrect");
    assert.equal(conceptHint.payload.checkResult.source, "policy_owned_probe");
    assert.equal(conceptHint.payload.checkResult.instrumentVersion, "v14-c3-verification-v1");
    assert.equal(conceptHint.payload.checkResult.evidenceScope, "post_support_local_check");
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
    assert.equal(l2AwaitingState.verificationCheck.instrumentVersion, "v14-c3-verification-v3");
    assert.notEqual(
      l2AwaitingState.verificationCheck.id,
      awaitingState.verificationCheck.id
    );

    const subgoal = await submitVerificationCheck(
      runtime.baseUrl,
      treatment.token,
      lifecycleUnit,
      l2AwaitingState.verificationCheck,
      { correct: false }
    );
    assert.equal(subgoal.response.status, 200);
    assert.equal(subgoal.payload.checkResult.status, "incorrect");
    assert.equal(subgoal.payload.study.deliveryDecision, "intervene");
    assert.equal(subgoal.payload.decision.action, "decompose_subgoal");
    assert.equal(subgoal.payload.decision.supportLevel, "L3");
    await resolveDecision(
      runtime.baseUrl,
      treatment.token,
      subgoal.payload.decisionId,
      "shown"
    );
    await resolveDecision(
      runtime.baseUrl,
      treatment.token,
      subgoal.payload.decisionId,
      "accepted"
    );
    await answerProactivePrompt(
      runtime.baseUrl,
      treatment.token,
      lifecycleUnit,
      subgoal.payload.interventionId,
      "我先定义 u，再检查导数因子和 dx 是否合成 du，最后单独换定积分上下限。"
    );
    const l3StateResponse = await requestJson(
      runtime.baseUrl,
      "GET",
      "/api/learning/proactive/state?chapterId=V14-C3",
      undefined,
      treatment.token
    );
    const l3State = l3StateResponse.payload.data.policyStates.find(
      (row) => row.scopeKey === lifecycleUnit.id
    );
    assert.equal(l3State.currentLevel, "L3");
    assert.equal(l3State.verificationCheck.supportLevel, "L3");

    const nextStep = await submitVerificationCheck(
      runtime.baseUrl,
      treatment.token,
      lifecycleUnit,
      l3State.verificationCheck,
      { correct: false }
    );
    assert.equal(nextStep.response.status, 200);
    assert.equal(nextStep.payload.decision.action, "next_step_hint");
    assert.equal(nextStep.payload.decision.supportLevel, "L4");
    await resolveDecision(
      runtime.baseUrl,
      treatment.token,
      nextStep.payload.decisionId,
      "shown"
    );
    await resolveDecision(
      runtime.baseUrl,
      treatment.token,
      nextStep.payload.decisionId,
      "accepted"
    );
    await answerProactivePrompt(
      runtime.baseUrl,
      treatment.token,
      lifecycleUnit,
      nextStep.payload.interventionId,
      "我会先圈出仍含 x 的部分，让积分号内、微分元和上下限统一使用 u。"
    );
    const l4StateResponse = await requestJson(
      runtime.baseUrl,
      "GET",
      "/api/learning/proactive/state?chapterId=V14-C3",
      undefined,
      treatment.token
    );
    const l4State = l4StateResponse.payload.data.policyStates.find(
      (row) => row.scopeKey === lifecycleUnit.id
    );
    assert.equal(l4State.currentLevel, "L4");
    assert.equal(l4State.verificationCheck.supportLevel, "L4");

    const partialExample = await submitVerificationCheck(
      runtime.baseUrl,
      treatment.token,
      lifecycleUnit,
      l4State.verificationCheck,
      { correct: false }
    );
    assert.equal(partialExample.response.status, 200);
    assert.equal(
      partialExample.payload.decision.action,
      "partial_worked_example"
    );
    assert.equal(partialExample.payload.decision.supportLevel, "L5");
    await resolveDecision(
      runtime.baseUrl,
      treatment.token,
      partialExample.payload.decisionId,
      "shown"
    );
    await resolveDecision(
      runtime.baseUrl,
      treatment.token,
      partialExample.payload.decisionId,
      "accepted"
    );
    await answerProactivePrompt(
      runtime.baseUrl,
      treatment.token,
      lifecycleUnit,
      partialExample.payload.interventionId,
      "例子里 u=x²、du=2x dx，上下限仍是 0 到 1，所以最后只需计算新的 u 积分。"
    );
    const l5StateResponse = await requestJson(
      runtime.baseUrl,
      "GET",
      "/api/learning/proactive/state?chapterId=V14-C3",
      undefined,
      treatment.token
    );
    const l5State = l5StateResponse.payload.data.policyStates.find(
      (row) => row.scopeKey === lifecycleUnit.id
    );
    assert.equal(l5State.currentLevel, "L5");
    assert.equal(l5State.verificationCheck.supportLevel, "L5");

    const recoveredOutcome = await submitVerificationCheck(
      runtime.baseUrl,
      treatment.token,
      lifecycleUnit,
      l5State.verificationCheck,
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
    assert.ok(
      Date.parse(recoveredOutcome.payload.study.policyState.cooldownUntil)
        > Date.now() + 15 * 60 * 1000,
      "服务端必须真正持久化渐退后的延长冷却"
    );

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
    for (const [index, spatial] of [
      { challenge_id: "GH-07-K01-strip-level-1-strip-1" },
      { challenge_id: "spatial-check", evidence_scope: "motor_placement" }
    ].entries()) {
      await seedIndependentAttemptEvidence(runtime.baseUrl, treatment.token, coursewareUnit,
        coursewareSceneType, true, `courseware-spatial-only-${index}`, spatial);
      const ignored = await requestIndependentAttemptOutcome(runtime.baseUrl, treatment.token,
        coursewareUnit, coursewareSceneType);
      assert.equal(ignored.payload.study.policyState.lifecycle.phase, "awaiting_independent_attempt",
        "拖拽位置正确不能结束概念支架；历史无范围字段的拼图事件也不例外");
      assert.equal(ignored.payload.study.policyState.currentLevel, "L1");
    }
    for (const [index, invalid] of [
      { independent: false },
      { independent: null },
      { independent: "true" },
      { hint_count: 1 },
      { reset_count: 1 },
      { selected_zone: "missed", error_type: "missed_expression" }
    ].entries()) {
      await seedIndependentAttemptEvidence(
        runtime.baseUrl, treatment.token, coursewareUnit, coursewareSceneType, false,
        `courseware-not-independent-${index}`, invalid
      );
      const ignored = await requestIndependentAttemptOutcome(
        runtime.baseUrl, treatment.token, coursewareUnit, coursewareSceneType
      );
      assert.equal(ignored.response.status, 200);
      assert.notEqual(ignored.payload.study.deliveryDecision, "intervene",
        `非独立或漏接结果不能触发支架升级：${JSON.stringify(invalid)}`);
      assert.equal(ignored.payload.study.policyState.currentLevel, "L1");
    }
    for (const success of [true, false]) {
      await seedIndependentAttemptEvidence(
        runtime.baseUrl, treatment.token, coursewareUnit, coursewareSceneType,
        success, `courseware-unaligned-${success}`, { challenge_id: "unaligned-game" }
      );
      const ignored = await requestIndependentAttemptOutcome(
        runtime.baseUrl, treatment.token, coursewareUnit, coursewareSceneType
      );
      assert.equal(ignored.response.status, 200);
      assert.equal(ignored.payload.study.policyState.lifecycle.phase, "awaiting_independent_attempt");
      assert.equal(ignored.payload.study.policyState.currentLevel, "L1",
        "未经目标核对的游戏正确或错误都不能改变支架层级");
    }
    await seedIndependentAttemptEvidence(
      runtime.baseUrl,
      treatment.token,
      coursewareUnit,
      coursewareSceneType,
      false,
      "courseware-semantic-independent-failed",
      { evidence_scope: "factor_selection" }
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
    const coursewareChallenge = coursewareAudit.payload.data.coursewareChallenges.find(
      (row) => row.challenge_id === `${coursewareUnit.id}-challenge`
    );
    assert.ok(coursewareChallenge, "实际事件应进入管理员挑战分析");
    assert.equal(coursewareChallenge.attempts, 7);
    assert.equal(coursewareChallenge.independent_attempts, 1);
    assert.equal(coursewareChallenge.supported_attempts, 2);
    assert.equal(coursewareChallenge.missed_attempts, 1);
    assert.equal(coursewareChallenge.unclassified_attempts, 3);
    assert.equal(coursewareChallenge.attempts,
      coursewareChallenge.independent_attempts + coursewareChallenge.supported_attempts
        + coursewareChallenge.missed_attempts + coursewareChallenge.unclassified_attempts,
      "四类尝试应互斥且完整，漏接不能混进提示后分母");
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
    // 匹配规则版本在 v3 时加了"目标未核对就不采用"和"操作证据不是概念检查"两条拒绝理由
    // （见本段下面两条断言），所以这里跟随适配器实际版本，而不是历史文档里的 v2。
    assert.equal(coursewareL1Row.followup_outcome.independentAttempt.matchingVersion,
      "v14-c3-courseware-match-v3");
    assert.equal(coursewareL1Row.followup_outcome.independentAttempt.matchReason,
      "factor_selection_matches_support_target");
    assert.ok(coursewareAudit.payload.data.rows.filter((row) =>
      row.evidence_snapshot?.coursewareVerificationMatch?.reasonCode
        === "courseware_target_alignment_unverified").length >= 2,
    "未核对目标而拒绝采用的两种成绩必须进入管理员审计");
    assert.match(coursewareL1Row.followup_outcome.independentAttempt.checkId, /^courseware-event:/);
    const spatialRows = coursewareAudit.payload.data.rows.filter((row) =>
      row.evidence_snapshot?.coursewareVerificationMatch?.reasonCode === "motor_placement_not_concept_check");
    assert.ok(spatialRows.length >= 2, "不采用操作证据的理由必须进入实际管理员数据");
    await resolveDecision(
      runtime.baseUrl,
      treatment.token,
      coursewareEscalation.payload.decisionId,
      "shown"
    );
    const forgedAlternative = await requestAlternativeHelp(
      runtime.baseUrl,
      control.token,
      coursewareUnit,
      coursewareSceneType,
      coursewareEscalation.payload.decisionId
    );
    assert.equal(forgedAlternative.response.status, 404);
    const alternativeHelp = await requestAlternativeHelp(
      runtime.baseUrl,
      treatment.token,
      coursewareUnit,
      coursewareSceneType,
      coursewareEscalation.payload.decisionId
    );
    assert.equal(alternativeHelp.response.status, 200);
    assert.equal(alternativeHelp.payload.study.deliveryDecision, "intervene");
    assert.equal(alternativeHelp.payload.decision.action, "switch_representation");
    assert.equal(alternativeHelp.payload.decision.interactionMode, "scene_switch");
    assert.equal(alternativeHelp.payload.decision.targetUnitId, coursewareUnit.id);
    assert.notEqual(
      alternativeHelp.payload.decision.targetSceneType,
      coursewareSceneType
    );
    await resolveDecision(
      runtime.baseUrl,
      treatment.token,
      alternativeHelp.payload.decisionId,
      "shown"
    );
    await resolveDecision(
      runtime.baseUrl,
      treatment.token,
      alternativeHelp.payload.decisionId,
      "accepted"
    );

    const autonomyUnit = units[2];
    const autonomySceneType = autonomyUnit.resourceCandidates[0].type;
    await seedRepeatedParameterEvidence(
      runtime.baseUrl,
      treatment.token,
      autonomyUnit,
      autonomySceneType,
      "autonomy-snooze-evidence"
    );
    const autonomyOffer = await requestRepeatedDecision(
      runtime.baseUrl,
      treatment.token,
      autonomyUnit,
      autonomySceneType
    );
    assert.equal(autonomyOffer.payload.study.deliveryDecision, "intervene");
    await resolveDecision(
      runtime.baseUrl,
      treatment.token,
      autonomyOffer.payload.decisionId,
      "shown"
    );
    const snoozed = await resolveDecision(
      runtime.baseUrl,
      treatment.token,
      autonomyOffer.payload.decisionId,
      "snoozed"
    );
    assert.equal(snoozed.response.status, 200);
    assert.equal(snoozed.payload.data.resolution, "snoozed");
    assert.equal(snoozed.payload.data.policyState.dismissStreak, 0);
    assert.ok(
      Date.parse(snoozed.payload.data.policyState.cooldownUntil) > Date.now(),
      "稍后处理必须设置知识点级冷却"
    );

    let scopeMuteTreatment = null;
    for (let index = 0; index < 24; index += 1) {
      const candidate = await register(
        runtime.baseUrl,
        `scope-mute-${Date.now()}-${index}`
      );
      const condition = expectedCondition(candidate.participantId);
      if (condition === "treatment") {
        scopeMuteTreatment = { ...candidate, condition };
        break;
      }
    }
    assert.ok(
      scopeMuteTreatment,
      "知识点静音回归需要一个没有既有政策生命周期的 Treatment 学生"
    );
    await submitPretest(
      runtime.baseUrl,
      scopeMuteTreatment.token,
      sourceChapter.flow.preQuiz
    );

    const scopeMuteUnit = units[3];
    const scopeMuteSceneType = scopeMuteUnit.resourceCandidates[0].type;
    await seedRepeatedParameterEvidence(
      runtime.baseUrl,
      scopeMuteTreatment.token,
      scopeMuteUnit,
      scopeMuteSceneType,
      "scope-mute-open-evidence"
    );
    const scopeMuteOffer = await requestRepeatedDecision(
      runtime.baseUrl,
      scopeMuteTreatment.token,
      scopeMuteUnit,
      scopeMuteSceneType
    );
    assert.equal(scopeMuteOffer.payload.study.deliveryDecision, "intervene");
    await resolveDecision(
      runtime.baseUrl,
      scopeMuteTreatment.token,
      scopeMuteOffer.payload.decisionId,
      "shown"
    );
    const beforeScopeMuteAudit = await adminDecisions(
      runtime.baseUrl,
      adminToken
    );
    const ignoredBeforeScopeMute = Number(
      beforeScopeMuteAudit.payload.data.summary.ignored || 0
    );
    const scopeMuted = await updateProactiveScopePreference(
      runtime.baseUrl,
      scopeMuteTreatment.token,
      scopeMuteUnit.id,
      "off"
    );
    assert.equal(scopeMuted.response.status, 200);
    assert.equal(scopeMuted.payload.scopePreference, "off");
    const mutedState = scopeMuted.payload.data.policyStates.find(
      (row) => row.scopeKey === scopeMuteUnit.id
    );
    assert.equal(mutedState.scopePreference, "off");
    assert.equal(mutedState.studentPreference, "off");
    const scopeMuteAudit = await adminDecisions(runtime.baseUrl, adminToken);
    const storedScopeMuted = scopeMuteAudit.payload.data.rows.find(
      (row) => row.id === scopeMuteOffer.payload.decisionId
    );
    assert.equal(
      storedScopeMuted.resolution,
      "scope_muted",
      "明确关闭知识点提醒不能记成隐式忽略"
    );
    assert.equal(
      Number(scopeMuteAudit.payload.data.summary.ignored || 0),
      ignoredBeforeScopeMute,
      "明确关闭知识点提醒不得污染隐式忽略指标"
    );
    const mutedDecision = await requestRepeatedDecision(
      runtime.baseUrl,
      scopeMuteTreatment.token,
      scopeMuteUnit,
      scopeMuteSceneType
    );
    assert.equal(mutedDecision.payload.study.deliveryDecision, "stay_silent");
    const mutedAudit = await adminDecisions(runtime.baseUrl, adminToken);
    const mutedDecisionRow = mutedAudit.payload.data.rows.find(
      (row) => row.id === mutedDecision.payload.decisionId
    );
    assert.ok(mutedDecisionRow.reason_codes.includes("student_preference_off"));
    const scopeRestored = await updateProactiveScopePreference(
      runtime.baseUrl,
      scopeMuteTreatment.token,
      scopeMuteUnit.id,
      "standard"
    );
    assert.equal(scopeRestored.response.status, 200);
    assert.equal(scopeRestored.payload.scopePreference, "standard");

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

    const lockedOutcomes = await outcomeState(
      runtime.baseUrl,
      treatment.token
    );
    assert.equal(lockedOutcomes.response.status, 200);
    assert.equal(
      lockedOutcomes.payload.data.instrumentVersion,
      proactiveOutcomes.version
    );
    assert.ok(
      lockedOutcomes.payload.data.stages.every(
        (stage) => stage.status === "locked" && !stage.items
      ),
      "章后测前不得下发结果测量题目"
    );
    await submitPosttest(
      runtime.baseUrl,
      treatment.token,
      sourceChapter.flow.postQuiz
    );
    const availableOutcomes = await outcomeState(
      runtime.baseUrl,
      treatment.token
    );
    const nearTransfer = availableOutcomes.payload.data.stages.find(
      (stage) => stage.id === "near_transfer"
    );
    const representationTransfer = availableOutcomes.payload.data.stages.find(
      (stage) => stage.id === "representation_transfer"
    );
    const retentionLocked = availableOutcomes.payload.data.stages.find(
      (stage) => stage.id === "retention"
    );
    assert.equal(nearTransfer.status, "available");
    assert.equal(representationTransfer.status, "locked");
    assert.equal(retentionLocked.status, "locked");
    assert.equal(nearTransfer.items.length, 5);
    assert.equal(Object.hasOwn(representationTransfer, "items"), false);
    nearTransfer.items.forEach((item) => {
      assert.equal(Object.hasOwn(item, "answer"), false);
      assert.ok(item.options.length >= 3);
      assert.ok(item.knowledgePointId);
      assert.ok(item.cognitiveProcess);
    });
    const nearStarted = await startOutcome(
      runtime.baseUrl,
      treatment.token,
      "near_transfer"
    );
    assert.equal(nearStarted.response.status, 200);
    assert.equal(nearStarted.payload.data.activeSession.stageId, "near_transfer");
    assert.equal(nearStarted.payload.data.activeSession.status, "active");
    assert.ok(nearStarted.payload.data.activeSession.id);
    assert.ok(nearStarted.payload.data.activeSession.startedAt);
    const nearSessionId = nearStarted.payload.data.activeSession.id;
    const nearDraft = await saveOutcomeDraft(
      runtime.baseUrl,
      treatment.token,
      "near_transfer",
      nearSessionId,
      {
        "V14-C3-NT-r3-01": "b"
      }
    );
    assert.equal(nearDraft.response.status, 200);
    assert.equal(nearDraft.payload.answered, 1);

    const restoredOutcome = await outcomeState(
      runtime.baseUrl,
      treatment.token
    );
    assert.equal(restoredOutcome.response.status, 200);
    assert.equal(restoredOutcome.payload.data.activeSession.id, nearSessionId);
    assert.deepEqual(
      restoredOutcome.payload.data.activeSession.responses,
      { "V14-C3-NT-r3-01": "b" },
      "跨设备读取必须恢复服务端保存的作答草稿"
    );
    assert.equal(
      restoredOutcome.payload.data.stages.find(
        (stage) => stage.id === "near_transfer"
      ).status,
      "active",
      "刷新或跨设备读取时必须恢复同一测量会话"
    );

    const blockedIntervention = await requestJson(
      runtime.baseUrl,
      "POST",
      "/api/learning/assistant/intervention",
      {
        chapterId: "V14-C3",
        unitId: unit.id,
        sceneType,
        signal: { kind: "quiet_dwell" },
        contextRef: { kind: "unit", scope: "lesson" }
      },
      treatment.token
    );
    assert.equal(blockedIntervention.response.status, 409);
    assert.equal(
      blockedIntervention.payload.code,
      "proactive_outcome_session_active"
    );

    const blockedAskResponse = await fetch(
      `${runtime.baseUrl}/api/learning/assistant/ask`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${treatment.token}`
        },
        body: JSON.stringify({
          chapterId: "V14-C3",
          unitId: unit.id,
          sceneType,
          question: "这道测量题应该怎么做？",
          contextRef: { kind: "unit", scope: "lesson" }
        })
      }
    );
    const blockedAsk = await blockedAskResponse.json();
    assert.equal(blockedAskResponse.status, 409);
    assert.equal(blockedAsk.code, "proactive_outcome_session_active");

    const blockedPlan = await requestJson(
      runtime.baseUrl,
      "POST",
      "/api/learning/kg/plan",
      {
        chapterId: "V14-C3",
        currentUnitId: unit.id,
        completedUnitIds: []
      },
      treatment.token
    );
    assert.equal(blockedPlan.response.status, 409);
    assert.equal(blockedPlan.payload.code, "proactive_outcome_session_active");

    const incompleteOutcome = await submitOutcome(
      runtime.baseUrl,
      treatment.token,
      "near_transfer",
      nearSessionId,
      {}
    );
    assert.equal(incompleteOutcome.response.status, 400);
    assert.equal(
      incompleteOutcome.payload.code,
      "proactive_outcome_responses_incomplete"
    );
    const nearSubmitted = await submitOutcome(
      runtime.baseUrl,
      treatment.token,
      "near_transfer",
      nearSessionId,
      {
        "V14-C3-NT-r3-01": "b",
        "V14-C3-NT-r3-02": "a",
        "V14-C3-NT-r3-03": "c",
        "V14-C3-NT-r3-04": "c",
        "V14-C3-NT-r3-05": "b"
      }
    );
    assert.equal(nearSubmitted.response.status, 200);
    assert.equal(Object.hasOwn(nearSubmitted.payload, "score"), false);
    assert.equal(
      nearSubmitted.payload.feedbackPolicy,
      "acknowledgement_only"
    );
    const nearSubmittedStage = nearSubmitted.payload.data.stages.find(
      (stage) => stage.id === "near_transfer"
    );
    assert.equal(nearSubmittedStage.review.answersReleased, false);
    assert.equal(nearSubmittedStage.review.items[0].response, "b");
    assert.equal(
      Object.hasOwn(nearSubmittedStage.review.items[0], "isCorrect"),
      false,
      "before the retention endpoint, review may show the learner response but must not reveal correctness"
    );
    assert.equal(nearSubmitted.payload.sessionId, nearSessionId);
    assert.equal(
      nearSubmitted.payload.data.stages.find(
        (stage) => stage.id === "representation_transfer"
      ).status,
      "available",
      "完成近迁移后才开放跨表征迁移"
    );
    assert.notEqual(
      nearSubmitted.payload.startedAt,
      "2000-01-01T00:00:00.000Z",
      "测量开始时间必须以服务端会话为准"
    );
    const nearReplay = await submitOutcome(
      runtime.baseUrl,
      treatment.token,
      "near_transfer",
      nearSessionId,
      {
        "V14-C3-NT-r3-01": "b",
        "V14-C3-NT-r3-02": "a",
        "V14-C3-NT-r3-03": "c",
        "V14-C3-NT-r3-04": "c",
        "V14-C3-NT-r3-05": "b"
      }
    );
    assert.equal(nearReplay.response.status, 200);
    assert.equal(nearReplay.payload.idempotent, true);
    const representationStarted = await startOutcome(
      runtime.baseUrl,
      treatment.token,
      "representation_transfer"
    );
    assert.equal(representationStarted.response.status, 200);
    const representationSubmitted = await submitOutcome(
      runtime.baseUrl,
      treatment.token,
      "representation_transfer",
      representationStarted.payload.data.activeSession.id,
      {
        "V14-C3-RT-r3-01": "a",
        "V14-C3-RT-r3-02": "c",
        "V14-C3-RT-r3-03": "b",
        "V14-C3-RT-r3-04": "b",
        "V14-C3-RT-r3-05": "a"
      }
    );
    assert.equal(representationSubmitted.response.status, 200);
    const retentionAvailable = representationSubmitted.payload.data.stages.find(
      (stage) => stage.id === "retention"
    );
    assert.equal(retentionAvailable.status, "available");
    const retentionStarted = await startOutcome(
      runtime.baseUrl,
      treatment.token,
      "retention"
    );
    assert.equal(retentionStarted.response.status, 200);
    const retentionSubmitted = await submitOutcome(
      runtime.baseUrl,
      treatment.token,
      "retention",
      retentionStarted.payload.data.activeSession.id,
      {
        "V14-C3-DR-r3-01": "c",
        "V14-C3-DR-r3-02": "b",
        "V14-C3-DR-r3-03": "a",
        "V14-C3-DR-r3-04": "a",
        "V14-C3-DR-r3-05": "c"
      }
    );
    assert.equal(retentionSubmitted.response.status, 200);
    assert.equal(retentionSubmitted.payload.data.answerReviewReleased, true);
    const releasedNearStage = retentionSubmitted.payload.data.stages.find(
      (stage) => stage.id === "near_transfer"
    );
    assert.equal(releasedNearStage.review.answersReleased, true);
    assert.equal(releasedNearStage.review.items[0].isCorrect, true);
    assert.equal(releasedNearStage.review.items[0].correctOption, "b");

    const withdrawalParticipant = await register(
      runtime.baseUrl,
      `测量退出${Date.now()}`
    );
    await submitPretest(
      runtime.baseUrl,
      withdrawalParticipant.token,
      sourceChapter.flow.preQuiz
    );
    await submitPosttest(
      runtime.baseUrl,
      withdrawalParticipant.token,
      sourceChapter.flow.postQuiz
    );
    const withdrawalStarted = await startOutcome(
      runtime.baseUrl,
      withdrawalParticipant.token,
      "near_transfer"
    );
    assert.equal(withdrawalStarted.response.status, 200);
    const skipped = await skipOutcome(
      runtime.baseUrl,
      withdrawalParticipant.token,
      withdrawalStarted.payload.data.activeSession.id
    );
    assert.equal(skipped.response.status, 409);
    assert.equal(skipped.payload.code, "permanent_skip_disabled");
    const stillActive = await requestJson(runtime.baseUrl,"GET","/api/learning/proactive/outcomes?chapterId=V14-C3",undefined,withdrawalParticipant.token);
    assert.equal(stillActive.payload.data.activeSession.id,withdrawalStarted.payload.data.activeSession.id,"拒绝永久跳过后原测量会话仍保留");

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
    // 理由必须能从决策行读出来——分析脚本只吃导出的分析包，读不到事件表。
    assert.equal(
      storedSelfExplanation.followup_outcome.studentJustification,
      "因为要先确定自变量，才能对应到唯一的输出值。",
      "学生写的接受理由必须落在决策行上，否则分析包算不出 Hint Justification Rate"
    );
    assert.equal(
      storedSelfExplanation.followup_outcome.justificationRequested,
      true,
      "确实问过理由的接受要标记 requested=true，才会进比例的分母"
    );
    const storedConceptHint = activeAdmin.payload.data.rows.find(
      (row) => row.id === conceptHint.payload.decisionId
    );
    const storedSubgoal = activeAdmin.payload.data.rows.find(
      (row) => row.id === subgoal.payload.decisionId
    );
    const storedNextStep = activeAdmin.payload.data.rows.find(
      (row) => row.id === nextStep.payload.decisionId
    );
    const storedPartialExample = activeAdmin.payload.data.rows.find(
      (row) => row.id === partialExample.payload.decisionId
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
    assert.ok(
      storedDeclinedReuse.reason_codes.includes("policy_cooldown_active"),
      "学生明确拒绝后的新形成性结果必须先遵守冷却，不能立即再次进入支架生命周期"
    );
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
    assert.equal(storedSelfExplanation.followup_outcome.independentAttempt.instrumentVersion,
      "v14-c3-verification-v1");
    assert.equal(storedConceptHint.followup_outcome.independentAttempt.instrumentVersion,
      "v14-c3-verification-v3");
    assert.equal(storedConceptHint.followup_outcome.independentAttempt.evidenceScope,
      "post_support_local_check");
    assert.equal(storedConceptHint.followup_outcome.independentAttempt.subSkill,
      l2AwaitingState.verificationCheck.subSkill);
    assert.equal(
      storedConceptHint.followup_outcome.independentAttempt.outcome,
      "continued_friction"
    );
    assert.equal(storedSubgoal.support_level, "L3");
    assert.equal(
      storedSubgoal.followup_outcome.independentAttempt.outcome,
      "continued_friction"
    );
    assert.equal(storedNextStep.support_level, "L4");
    assert.equal(
      storedNextStep.followup_outcome.independentAttempt.outcome,
      "continued_friction"
    );
    assert.equal(storedPartialExample.support_level, "L5");
    assert.equal(
      storedPartialExample.followup_outcome.independentAttempt.outcome,
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
    assert.equal(activeAdmin.payload.data.summary.l3_subgoal_decompositions, 1);
    assert.equal(activeAdmin.payload.data.summary.l4_next_step_hints, 1);
    assert.equal(activeAdmin.payload.data.summary.l5_partial_examples, 1);
    assert.equal(activeAdmin.payload.data.summary.representation_switches, 1);
    assert.ok(activeAdmin.payload.data.summary.snoozed >= 1);
    assert.ok(activeAdmin.payload.data.summary.alternative_requested >= 1);
    assert.equal(activeAdmin.payload.data.summary.continued_friction, 5);
    assert.equal(activeAdmin.payload.data.summary.independent_success_exits, 1);
    assert.ok(activeAdmin.payload.data.summary.autonomy.scope_mutes >= 1);
    assert.ok(activeAdmin.payload.data.summary.autonomy.scope_restores >= 1);
    assert.ok(
      activeAdmin.payload.data.summary.autonomy.global_reduced_changes >= 1
    );
    assert.equal(
      activeAdmin.payload.data.summary.autonomy.current_muted_scopes,
      0,
      "恢复知识点提醒后，当前静音范围应回到 0"
    );
    assert.equal(
      activeAdmin.payload.data.summary.accepted,
      9,
      "五级支架、换表征与观察提示的已展示接受记录必须完整保留"
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
    assert.ok(Array.isArray(activeAdmin.payload.data.assignmentRoster.rows));
    assert.ok(activeAdmin.payload.data.assignmentRoster.total >= 2);
    const treatmentRoster = activeAdmin.payload.data.assignmentRoster.rows.find(
      (row) => row.user_id === treatment.participantId
    );
    const controlRoster = activeAdmin.payload.data.assignmentRoster.rows.find(
      (row) => row.user_id === control.participantId
    );
    assert.equal(treatmentRoster.condition, "treatment");
    assert.equal(controlRoster.condition, "control");
    assert.equal(treatmentRoster.stratum, "pre-high");
    assert.equal(treatmentRoster.assignment_version, "api-test-hash-v1");
    assert.equal(activeAdmin.payload.data.outcomes.rows.length, 3);
    assert.equal(activeAdmin.payload.data.outcomes.summary.length, 3);
    assert.ok(
      activeAdmin.payload.data.outcomes.rows.every(
        (row) => Array.isArray(row.item_results)
      )
    );
    const treatmentFlow = activeAdmin.payload.data.participantFlow.find(
      (row) => row.condition === "treatment"
    );
    assert.ok(treatmentFlow);
    assert.ok(treatmentFlow.assigned >= 1);
    assert.ok(treatmentFlow.evidenceParticipants >= 1);
    assert.ok(treatmentFlow.exposedParticipants >= 1);
    assert.ok(treatmentFlow.posttestCompleted >= 1);
    assert.ok(treatmentFlow.nearSubmitted >= 1);
    assert.ok(treatmentFlow.representationSubmitted >= 1);
    assert.ok(treatmentFlow.retentionSubmitted >= 1);
    assert.ok(
      activeAdmin.payload.data.participantFlow.some(
        (row) => row.nearSkipped > 0
      )
      === false, '禁止永久跳过不会制造跳过记录'
    );
    assert.equal(
      activeAdmin.payload.data.integrity.signals.find(
        (signal) => signal.id === "protected_assessment_display"
      ).count,
      0
    );
    assert.equal(
      activeAdmin.payload.data.integrity.signals.find(
        (signal) => signal.id === "non_display_arm_display"
      ).count,
      0
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
    assert.equal(storedExpired.intervention_status, "ignored");
    assert.equal(storedExpired.resolution, "ignored",'切换场景时旧候选已经关闭，不再留到测量开始');
    assert.equal(expiryAdmin.payload.data.summary.unresolved_offers, 0);

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
    await runBalancedAssignmentRegression({
      root,
      tmpDir,
      sourceChapter,
      adminToken
    });
    await runExplicitParticipationRegression({
      root,
      tmpDir,
      sourceChapter,
      units,
      adminToken
    });
    await runDecisionAuthorizationRegression({
      root,
      tmpDir,
      sourceChapter,
      units,
      adminToken
    });
    await runProtocolDriftRegression({
      root,
      tmpDir,
      adminToken
    });
    await runDefaultRetentionDelayRegression({
      root,
      tmpDir,
      adminToken
    });
    await runPilotAssignmentPrivacyRegression({
      root,
      tmpDir,
      sourceChapter,
      units,
      adminToken
    });

    await seedRepeatedParameterEvidence(
      runtime.baseUrl,
      scopeMuteTreatment.token,
      scopeMuteUnit,
      scopeMuteSceneType,
      "runtime-pause-open-offer"
    );
    const pauseOffer = await requestRepeatedDecision(
      runtime.baseUrl,
      scopeMuteTreatment.token,
      scopeMuteUnit,
      scopeMuteSceneType
    );
    assert.equal(pauseOffer.response.status, 200);
    assert.equal(pauseOffer.payload.study.deliveryDecision, "intervene");
    assert.ok(pauseOffer.payload.interventionId);
    const pauseWithoutReason = await updateExperimentRuntime(
      runtime.baseUrl,
      adminToken,
      "paused"
    );
    assert.equal(pauseWithoutReason.response.status, 400);
    const unauthorizedPause = await requestJson(
      runtime.baseUrl,
      "POST",
      "/api/admin/research/proactive-runtime",
      {
        experimentId: "v14-c3-api-test",
        status: "paused",
        reason: "未授权测试"
      }
    );
    assert.equal(unauthorizedPause.response.status, 403);
    const paused = await updateExperimentRuntime(
      runtime.baseUrl,
      adminToken,
      "paused",
      "停止规则演练：检查未决提示收束",
      "research-operator-a"
    );
    assert.equal(paused.response.status, 200);
    assert.equal(paused.payload.data.runtime.status, "paused");
    assert.equal(paused.payload.data.runtime.updatedBy, "research-operator-a");
    assert.ok(paused.payload.data.closedInterventions >= 1);
    assert.equal(paused.payload.data.runtimeEvents[0].status, "paused");
    const pausedDecision = await requestRepeatedDecision(
      runtime.baseUrl,
      scopeMuteTreatment.token,
      scopeMuteUnit,
      scopeMuteSceneType
    );
    assert.equal(pausedDecision.response.status, 200);
    assert.equal(pausedDecision.payload.study.runtime.status, "paused");
    assert.equal(pausedDecision.payload.study.deliveryDecision, "stay_silent");
    const pausedAdmin = await adminDecisions(runtime.baseUrl, adminToken);
    const closedPauseOffer = pausedAdmin.payload.data.rows.find(
      (row) => row.id === pauseOffer.payload.decisionId
    );
    assert.equal(closedPauseOffer.intervention_status, "experiment_paused");
    assert.equal(closedPauseOffer.resolution, "experiment_paused");
    const storedPausedDecision = pausedAdmin.payload.data.rows.find(
      (row) => row.id === pausedDecision.payload.decisionId
    );
    assert.ok(
      storedPausedDecision.reason_codes.includes("experiment_runtime_paused")
    );
    await stopChild(runtime.child);
    runtime = await startServer(root, dbPath, "active", adminToken);
    const pausedAfterRestart = await adminDecisions(runtime.baseUrl, adminToken);
    assert.equal(pausedAfterRestart.payload.data.runtime.status, "paused");
    assert.equal(
      pausedAfterRestart.payload.data.runtime.reason,
      "停止规则演练：检查未决提示收束"
    );
    const resumed = await updateExperimentRuntime(
      runtime.baseUrl,
      adminToken,
      "active",
      "",
      "research-operator-a"
    );
    assert.equal(resumed.response.status, 200);
    assert.equal(resumed.payload.data.runtime.status, "active");
    assert.equal(resumed.payload.data.runtimeEvents[0].status, "active");
    assert.equal(resumed.payload.data.runtimeEvents[1].status, "paused");

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
      "/api/admin/learning/reset",
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
