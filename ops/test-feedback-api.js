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

async function jsonRequest(baseUrl, pathname, options = {}) {
  const response = await fetch(baseUrl + pathname, {
    method: options.method || "GET",
    headers: {
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      ...(options.body ? { "Content-Type": "application/json" } : {})
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const payload = await response.json().catch(() => ({}));
  return { response, payload };
}

async function waitForHealth(baseUrl, child, logs) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
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

async function main() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cq-feedback-api-"));
  const port = await freePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const adminToken = "cq-feedback-admin-test";
  const logs = [];
  let child;

  try {
    child = spawn(process.execPath, ["server.js", String(port)], {
      cwd: path.resolve(__dirname, ".."),
      env: {
        ...process.env,
        DB_PATH: path.join(tmpDir, "feedback-api.db"),
        ADMIN_TOKEN: adminToken,
        HOST: "127.0.0.1",
        LLM_PROVIDER: "mock"
      },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true
    });
    child.stdout.on("data", (chunk) => logs.push(chunk.toString()));
    child.stderr.on("data", (chunk) => logs.push(chunk.toString()));
    await waitForHealth(baseUrl, child, logs);

    const unauthenticated = await jsonRequest(baseUrl, "/api/learning/feedback", {
      method: "POST",
      body: { feedbackType: "other", content: "未登录反馈" }
    });
    assert.equal(unauthenticated.response.status, 401);

    const nickname = `反馈测试${Date.now().toString().slice(-6)}`;
    const registered = await jsonRequest(baseUrl, "/api/auth/register", {
      method: "POST",
      body: { nickname, email: "", password: "feedback-pass-123" }
    });
    assert.equal(registered.response.status, 200);
    assert.equal(registered.payload.ok, true);
    const learnerToken = registered.payload.token;
    assert.ok(learnerToken);

    const invalidType = await jsonRequest(baseUrl, "/api/learning/feedback", {
      method: "POST",
      token: learnerToken,
      body: { feedbackType: "invalid", content: "类型不合法" }
    });
    assert.equal(invalidType.response.status, 400);
    assert.equal(invalidType.payload.code, "feedback_type_invalid");

    const blank = await jsonRequest(baseUrl, "/api/learning/feedback", {
      method: "POST",
      token: learnerToken,
      body: { feedbackType: "other", content: "   " }
    });
    assert.equal(blank.response.status, 400);
    assert.equal(blank.payload.code, "feedback_content_required");

    const tooLong = await jsonRequest(baseUrl, "/api/learning/feedback", {
      method: "POST",
      token: learnerToken,
      body: { feedbackType: "other", content: "建".repeat(2001) }
    });
    assert.equal(tooLong.response.status, 400);
    assert.equal(tooLong.payload.code, "feedback_content_too_long");

    const forgedCourseware = await jsonRequest(baseUrl, "/api/learning/feedback", {
      method: "POST",
      token: learnerToken,
      body: {
        feedbackType: "courseware",
        content: "这条反馈伪造了一个不存在的课件目标。",
        targetScope: "courseware",
        unitId: "forged-unit",
        sceneType: "simulation",
        resourceFile: "../forged.html",
        resourceTitle: "伪造课件",
        currentView: "feedback"
      }
    });
    assert.equal(forgedCourseware.response.status, 400);
    assert.equal(forgedCourseware.payload.code, "feedback_target_invalid");

    const globalFeedback = await jsonRequest(baseUrl, "/api/learning/feedback", {
      method: "POST",
      token: learnerToken,
      body: {
        feedbackType: "platform",
        content: "希望反馈入口在手机上也容易点击。",
        targetScope: "global",
        currentView: "feedback"
      }
    });
    assert.equal(globalFeedback.response.status, 200);
    assert.ok(globalFeedback.payload.feedbackId);

    const route = JSON.parse(fs.readFileSync(
      path.resolve(__dirname, "..", "data", "openmaic-v14-route.json"),
      "utf8"
    ));
    let legalTarget = null;
    for (const chapter of route.chapters || []) {
      for (const module of chapter.modules || []) {
        for (const knowledgePoint of module.knowledgePoints || []) {
          const candidate = knowledgePoint.resourceCandidates?.[0];
          if (!candidate) continue;
          legalTarget = { chapter, module, knowledgePoint, candidate };
          break;
        }
        if (legalTarget) break;
      }
      if (legalTarget) break;
    }
    assert.ok(legalTarget, "route must contain at least one legal courseware feedback target");

    const lectureFeedback = await jsonRequest(baseUrl, "/api/learning/feedback", {
      method: "POST",
      token: learnerToken,
      body: {
        feedbackType: "courseware",
        content: "讲解页中的定义需要更清楚。",
        targetScope: "courseware",
        chapterId: "forged-chapter",
        moduleId: "forged-module",
        unitId: legalTarget.knowledgePoint.id,
        knowledgePoint: "伪造知识点名称",
        sceneType: "slide",
        resourceFile: "",
        resourceTitle: "伪造讲解页标题",
        currentView: "feedback"
      }
    });
    assert.equal(lectureFeedback.response.status, 200);
    assert.ok(lectureFeedback.payload.feedbackId);

    const coursewareFeedback = await jsonRequest(baseUrl, "/api/learning/feedback", {
      method: "POST",
      token: learnerToken,
      body: {
        feedbackType: "courseware",
        content: "拖动滑块后图像没有及时变化。",
        targetScope: "courseware",
        chapterId: "forged-chapter",
        moduleId: "forged-module",
        unitId: legalTarget.knowledgePoint.id,
        knowledgePoint: "伪造知识点名称",
        sceneType: legalTarget.candidate.type || legalTarget.candidate.widgetType,
        resourceFile: legalTarget.candidate.file,
        resourceTitle: "伪造课件标题",
        currentView: "feedback"
      }
    });
    assert.equal(coursewareFeedback.response.status, 200);
    assert.ok(coursewareFeedback.payload.feedbackId);

    const forbidden = await jsonRequest(baseUrl, "/api/admin/stats/feedback", {
      token: "wrong-admin-token"
    });
    assert.equal(forbidden.response.status, 403);

    const dashboard = await jsonRequest(baseUrl, "/api/admin/stats/feedback", {
      token: adminToken
    });
    assert.equal(dashboard.response.status, 200);
    assert.equal(dashboard.payload.data.summary.total, 3);
    assert.equal(dashboard.payload.data.summary.courseware, 2);
    assert.equal(dashboard.payload.data.summary.users, 1);
    assert.equal(dashboard.payload.data.rows.length, 3);
    assert.equal(dashboard.payload.data.rows[0].content, "拖动滑块后图像没有及时变化。");
    assert.equal(dashboard.payload.data.rows[0].chapter_id, legalTarget.chapter.id);
    assert.equal(dashboard.payload.data.rows[0].module_id, legalTarget.module.id);
    assert.equal(dashboard.payload.data.rows[0].knowledge_point, legalTarget.knowledgePoint.name);
    assert.equal(dashboard.payload.data.rows[0].resource_title, legalTarget.candidate.title);
    assert.equal(dashboard.payload.data.rows[0].nickname, nickname);
    const lectureRow = dashboard.payload.data.rows.find((row) => row.scene_type === "slide");
    assert.ok(lectureRow);
    assert.equal(lectureRow.resource_file, "");
    assert.equal(lectureRow.resource_title, `${legalTarget.knowledgePoint.name} · 讲解页`);

    const coursewareOnly = await jsonRequest(baseUrl, "/api/admin/stats/feedback?type=courseware", {
      token: adminToken
    });
    assert.equal(coursewareOnly.response.status, 200);
    assert.deepEqual(
      coursewareOnly.payload.data.rows.map((row) => row.feedback_type),
      ["courseware", "courseware"]
    );

    console.log("feedback API tests passed");
  } finally {
    await stopChild(child);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
