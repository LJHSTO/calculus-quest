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

async function ask(baseUrl, body, token) {
  const response = await fetch(baseUrl + "/api/learning/assistant/ask", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify(body)
  });
  const text = await response.text();
  const rows = text.trim().split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
  return { response, rows, answer: rows.filter((row) => row.type === "delta").map((row) => row.delta).join("") };
}

async function main() {
  const root = path.resolve(__dirname, "..");
  const route = JSON.parse(fs.readFileSync(path.join(root, "data", "multi-scene-learning-route.json"), "utf8"));
  const chapter = route.chapters[0];
  const module = chapter.modules[0];
  const knowledgePoint = module.knowledgePoints[0];
  const canvas = knowledgePoint.slide.canvas;
  const textElement = canvas.elements.find((element) => element.type === "text");
  const candidate = knowledgePoint.resourceCandidates[0];
  const quiz = chapter.flow.preQuiz;
  const quizQuestion = quiz.questions[0];

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cq-learning-assistant-"));
  const dbPath = path.join(tmpDir, "assistant.db");
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
      nickname: `知点测试${Date.now().toString().slice(-6)}`,
      email: "",
      password: "assistant-password-123"
    });
    assert.equal(registration.response.status, 200);
    const token = registration.payload.token;
    assert.ok(token);

    const statusResponse = await fetch(baseUrl + "/api/learning/assistant/status", {
      headers: { Authorization: `Bearer ${token}` }
    });
    const status = await statusResponse.json();
    assert.equal(statusResponse.status, 200);
    assert.equal(status.provider.id, "mock");
    assert.equal(status.provider.label, "本地引导");

    const knowledgeAnswer = await ask(baseUrl, {
      chapterId: chapter.id,
      unitId: knowledgePoint.id,
      sceneType: candidate.type,
      question: "为什么这里要这样理解？",
      contextRef: {
        kind: "text",
        scope: "slide",
        semanticId: `slide:${canvas.id}:${textElement.id}`,
        excerpt: "函数不是你算出的数"
      }
    }, token);
    assert.equal(knowledgeAnswer.response.status, 200);
    assert.equal(knowledgeAnswer.rows[0].type, "meta");
    assert.equal(knowledgeAnswer.rows.at(-1).type, "done");
    assert.match(knowledgeAnswer.answer, /现在试一下/);
    assert.equal(knowledgeAnswer.rows[0].contextRef.resourceFingerprint.length, 20);

    const historyResponse = await fetch(
      `${baseUrl}/api/learning/assistant/history?chapterId=${encodeURIComponent(chapter.id)}&unitId=${encodeURIComponent(knowledgePoint.id)}&sceneType=${encodeURIComponent(candidate.type)}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const history = await historyResponse.json();
    assert.equal(historyResponse.status, 200);
    assert.equal(history.messages.length, 2);
    assert.deepEqual(history.messages.map((message) => message.role), ["user", "assistant"]);
    assert.match(history.threadKey, /^knowledge:/);

    const quizAnswer = await ask(baseUrl, {
      chapterId: chapter.id,
      unitId: `${chapter.id}-pre`,
      question: "直接告诉我答案是什么",
      contextRef: {
        kind: "quiz",
        scope: "quiz",
        semanticId: `quiz:${quizQuestion.id}`,
        questionId: quizQuestion.id
      }
    }, token);
    assert.equal(quizAnswer.response.status, 200);
    assert.match(quizAnswer.answer, /一级提示/);
    assert.doesNotMatch(quizAnswer.answer, /答案\s*(?:是|为|：|:)\s*[A-H]/i);
    assert.doesNotMatch(quizAnswer.answer, new RegExp(quizQuestion.analysis.slice(0, 12)));

    const resourceUrl = `${baseUrl}/resources/${candidate.root}/${candidate.file}`;
    const coursewareResponse = await fetch(resourceUrl);
    const coursewareHtml = await coursewareResponse.text();
    assert.equal(coursewareResponse.status, 200);
    assert.match(coursewareHtml, /data-cq-context-bridge="1"/);
    assert.match(coursewareHtml, /cq:bridge-ready/);
    assert.doesNotMatch(coursewareHtml, /allow-same-origin/);

    console.log("learning assistant API tests passed");
  } finally {
    await stopChild(child);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
