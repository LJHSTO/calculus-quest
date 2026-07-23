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

async function postJson(baseUrl, pathname, body, token = "") {
  const response = await fetch(baseUrl + pathname, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify(body)
  });
  return { response, payload: await response.json().catch(() => ({})) };
}

function questionFields(value, out = []) {
  if (Array.isArray(value)) {
    value.forEach((item) => questionFields(item, out));
    return out;
  }
  if (!value || typeof value !== "object") return out;
  if (value.id && value.type && value.question) {
    out.push({
      id: value.id,
      answer: value.answer,
      analysis: value.analysis,
      commentPrompt: value.commentPrompt
    });
  }
  Object.values(value).forEach((item) => questionFields(item, out));
  return out;
}

async function main() {
  const root = path.resolve(__dirname, "..");
  const sourceRoute = JSON.parse(fs.readFileSync(path.join(root, "data", "multi-scene-learning-route.json"), "utf8"));
  const sourceQuestion = sourceRoute.chapters[0].flow.preQuiz.questions.find((question) => question.type === "single");
  const sourceFormativeQuestions = sourceRoute.chapters[0].flow.formativeQuiz.questions;
  const sourceShortQuestion = sourceFormativeQuestions.find((question) => question.type === "short_answer");
  assert.ok(sourceQuestion?.answer?.length);
  assert.ok(sourceShortQuestion);

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cq-authoritative-quiz-"));
  const dbPath = path.join(tmpDir, "authoritative-quiz.db");
  const port = await freePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const logs = [];
  let child;

  try {
    child = spawn(process.execPath, ["server.js", String(port)], {
      cwd: root,
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

    const registration = await postJson(baseUrl, "/api/auth/register", {
      nickname: `权威评分${Date.now().toString().slice(-6)}`,
      email: "",
      password: "authoritative-password-123"
    });
    assert.equal(registration.response.status, 200);
    const token = registration.payload.token;
    assert.ok(token);

    const routeResponse = await fetch(baseUrl + "/api/course/multi-scene-learning-route");
    assert.equal(routeResponse.status, 200);
    const publicRoute = await routeResponse.json();
    const publicQuestions = questionFields(publicRoute);
    assert.ok(publicQuestions.length > 0);
    publicQuestions.forEach((question) => {
      assert.equal(question.answer, undefined, `${question.id} leaked answer`);
      assert.equal(question.analysis, undefined, `${question.id} leaked analysis`);
      assert.equal(question.commentPrompt, undefined, `${question.id} leaked rubric`);
    });

    const submittedAnswers = sourceRoute.chapters[0].flow.preQuiz.questions.map((question) => ({
      questionId: question.id,
      response: question.type === "multiple"
        ? question.answer
        : question.answer[0]
    }));
    const submitted = await postJson(
      baseUrl,
      "/api/learning/quiz/submit",
      {
        unitId: "V14-C1-pre",
        chapterId: "V14-C1",
        phase: "pre",
        answers: submittedAnswers.map((answer, index) => ({
          ...answer,
          score: index === 0 ? 999 : 0,
          isCorrect: false
        }))
      },
      token
    );
    assert.equal(submitted.response.status, 200);
    assert.equal(submitted.payload.results.length, submittedAnswers.length);
    const sourceResult = submitted.payload.results.find((result) => result.questionId === sourceQuestion.id);
    assert.equal(sourceResult.isCorrect, true);
    assert.equal(sourceResult.score, sourceQuestion.points);
    assert.deepEqual(sourceResult.answer, sourceQuestion.answer);
    assert.equal(sourceResult.analysis, sourceQuestion.analysis);

    const resubmitted = await postJson(
      baseUrl,
      "/api/learning/quiz/submit",
      {
        unitId: "V14-C1-pre",
        chapterId: "V14-C1",
        phase: "pre",
        answers: submittedAnswers
      },
      token
    );
    assert.equal(resubmitted.response.status, 409);
    assert.equal(resubmitted.payload.code, "quiz_already_submitted");

    const forged = await postJson(
      baseUrl,
      "/api/learning/event",
      {
        type: "quiz_result",
        payload: {
          id: "forged-result",
          unitId: "V14-C1-pre",
          questionId: "forged-question",
          score: 999,
          maxScore: 10,
          isCorrect: true
        }
      },
      token
    );
    assert.equal(forged.response.status, 200);

    const storedResponse = await fetch(baseUrl + "/api/learning/quiz-results", {
      headers: { Authorization: `Bearer ${token}` }
    });
    const stored = await storedResponse.json();
    assert.equal(storedResponse.status, 200);
    assert.equal(stored.data.length, submittedAnswers.length);
    const storedSource = stored.data.find((result) => result.question_id === sourceQuestion.id);
    assert.equal(storedSource.score, sourceQuestion.points);

    const formativeSubmitted = await postJson(
      baseUrl,
      "/api/learning/quiz/submit",
      {
        unitId: "V14-C1-formative",
        chapterId: "V14-C1",
        phase: "formative",
        answers: sourceFormativeQuestions.map((question) => ({
          questionId: question.id,
          response: question.type === "short_answer"
            ? "我会先说明关键量之间的关系，再给出判断依据。"
            : question.type === "multiple"
              ? question.answer
              : question.answer[0]
        }))
      },
      token
    );
    assert.equal(formativeSubmitted.response.status, 200);

    const fallback = await postJson(
      baseUrl,
      "/api/learning/grade",
      {
        unitId: "V14-C1-formative",
        fallbackToZero: true,
        questions: [{ questionId: sourceShortQuestion.id }]
      },
      token
    );
    assert.equal(fallback.response.status, 200);
    assert.equal(fallback.payload.results.length, 1);
    assert.equal(fallback.payload.results[0].score, 0);
    assert.equal(fallback.payload.results[0].errorType, "manual_fallback");

    const fallbackStoredResponse = await fetch(baseUrl + "/api/learning/quiz-results", {
      headers: { Authorization: `Bearer ${token}` }
    });
    const fallbackStored = await fallbackStoredResponse.json();
    const storedShort = fallbackStored.data.find((result) => result.question_id === sourceShortQuestion.id);
    assert.equal(storedShort.status, "ai_reviewed");
    assert.equal(storedShort.is_correct, 0);
    assert.equal(storedShort.score, 0);
    assert.equal(storedShort.ai_score, 0);
    assert.equal(storedShort.ai_error_type, "manual_fallback");

    console.log("authoritative quiz API tests passed");
  } finally {
    await stopChild(child);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
