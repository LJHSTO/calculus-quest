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
    if (child.exitCode !== null) throw new Error(`server exited early\n${logs.join("")}`);
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

async function requestJson(baseUrl, method, pathname, body, token = "") {
  const response = await fetch(baseUrl + pathname, {
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

async function readStreamUntil(reader, matcher, timeoutMs = 3000) {
  const decoder = new TextDecoder();
  let buffer = "";
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const remaining = Math.max(1, deadline - Date.now());
    const result = await Promise.race([
      reader.read(),
      new Promise((_, reject) => setTimeout(() => reject(new Error("announcement stream timeout")), remaining))
    ]);
    if (result.done) break;
    buffer += decoder.decode(result.value, { stream: true });
    if (matcher.test(buffer)) return buffer;
  }
  throw new Error(`announcement stream did not match ${matcher}\n${buffer}`);
}

async function main() {
  const root = path.resolve(__dirname, "..");
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cq-announcements-"));
  const port = await freePort();
  const baseUrl = `http://127.0.0.1:${port}/calculus_quest`;
  const adminToken = "cq-announcements-admin-test";
  const logs = [];
  let child;
  let streamController;

  try {
    child = spawn(process.execPath, ["server.js", String(port)], {
      cwd: root,
      env: {
        ...process.env,
        DB_PATH: path.join(tmpDir, "announcements.db"),
        ADMIN_TOKEN: adminToken,
        HOST: "127.0.0.1",
        BASE_PATH: "calculus_quest",
        LLM_PROVIDER: "mock",
        NODE_ENV: "development"
      },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true
    });
    child.stdout.on("data", (chunk) => logs.push(chunk.toString()));
    child.stderr.on("data", (chunk) => logs.push(chunk.toString()));
    await waitForHealth(baseUrl, child, logs);

    const empty = await requestJson(baseUrl, "GET", "/api/announcements");
    assert.equal(empty.response.status, 200);
    assert.deepEqual(empty.payload.announcements, []);

    const forbidden = await requestJson(
      baseUrl,
      "GET",
      "/api/admin/announcements",
      undefined,
      "wrong-token"
    );
    assert.equal(forbidden.response.status, 403);

    const invalid = await requestJson(
      baseUrl,
      "POST",
      "/api/admin/announcements",
      { title: "", content: "缺少标题" },
      adminToken
    );
    assert.equal(invalid.response.status, 400);
    assert.equal(invalid.payload.code, "announcement_title_required");

    const oversizedContent = (
      "**重点更新**\n\n"
      + "## 使用说明\n"
      + "- 支持加粗\n"
      + "- 支持小标题\n"
      + "- 支持列表\n\n"
      + "长正文内容。".repeat(900)
    );
    const created = await requestJson(
      baseUrl,
      "POST",
      "/api/admin/announcements",
      {
        title: "平台更新",
        content: oversizedContent,
        level: "update",
        pinned: true
      },
      adminToken
    );
    assert.equal(created.response.status, 201);
    assert.equal(created.payload.announcement.status, "draft");
    assert.equal(created.payload.announcement.content.length, 5000);
    assert.match(created.payload.announcement.content, /^\*\*重点更新\*\*/);
    const announcementId = created.payload.announcement.id;
    assert.ok(announcementId);

    const draftPublic = await requestJson(baseUrl, "GET", "/api/announcements");
    assert.deepEqual(draftPublic.payload.announcements, []);

    streamController = new AbortController();
    const streamResponse = await fetch(baseUrl + "/api/announcements/stream", {
      signal: streamController.signal
    });
    assert.equal(streamResponse.status, 200);
    assert.match(streamResponse.headers.get("content-type") || "", /text\/event-stream/);
    const reader = streamResponse.body.getReader();
    await readStreamUntil(reader, /"announcements":\[\]/);

    const published = await requestJson(
      baseUrl,
      "POST",
      `/api/admin/announcements/${encodeURIComponent(announcementId)}/publish`,
      {},
      adminToken
    );
    assert.equal(published.response.status, 200);
    assert.equal(published.payload.announcement.status, "published");
    await readStreamUntil(reader, /"title":"平台更新"/);

    const publicList = await requestJson(baseUrl, "GET", "/api/announcements");
    assert.equal(publicList.payload.announcements.length, 1);
    assert.equal(publicList.payload.announcements[0].pinned, true);
    assert.equal(publicList.payload.readState, undefined);

    const readerA = await requestJson(
      baseUrl,
      "POST",
      "/api/auth/register",
      {
        nickname: "公告阅读者甲",
        email: "",
        password: "announcement-reader-a"
      }
    );
    const readerB = await requestJson(
      baseUrl,
      "POST",
      "/api/auth/register",
      {
        nickname: "公告阅读者乙",
        email: "",
        password: "announcement-reader-b"
      }
    );
    assert.equal(readerA.response.status, 200);
    assert.equal(readerB.response.status, 200);

    const unauthenticatedRead = await requestJson(
      baseUrl,
      "POST",
      `/api/announcements/${encodeURIComponent(announcementId)}/read`,
      {}
    );
    assert.equal(unauthenticatedRead.response.status, 401);

    const readerAInitial = await requestJson(
      baseUrl,
      "GET",
      "/api/announcements",
      undefined,
      readerA.payload.token
    );
    assert.deepEqual(readerAInitial.payload.readState.versions, {});

    const readerARead = await requestJson(
      baseUrl,
      "POST",
      `/api/announcements/${encodeURIComponent(announcementId)}/read`,
      {},
      readerA.payload.token
    );
    assert.equal(readerARead.response.status, 200);
    assert.equal(
      readerARead.payload.readState.versions[announcementId],
      publicList.payload.announcements[0].updatedAt
    );

    const readerAAfterRead = await requestJson(
      baseUrl,
      "GET",
      "/api/announcements",
      undefined,
      readerA.payload.token
    );
    const readerBAfterARead = await requestJson(
      baseUrl,
      "GET",
      "/api/announcements",
      undefined,
      readerB.payload.token
    );
    assert.equal(
      readerAAfterRead.payload.readState.versions[announcementId],
      publicList.payload.announcements[0].updatedAt
    );
    assert.deepEqual(readerBAfterARead.payload.readState.versions, {});

    const updated = await requestJson(
      baseUrl,
      "PUT",
      `/api/admin/announcements/${encodeURIComponent(announcementId)}`,
      {
        title: "平台更新 2",
        content: "公告内容已经实时更新。",
        level: "important",
        pinned: true
      },
      adminToken
    );
    assert.equal(updated.response.status, 200);
    assert.equal(updated.payload.announcement.content, "公告内容已经实时更新。");
    await readStreamUntil(reader, /"content":"公告内容已经实时更新。"/);

    const readerAAfterUpdate = await requestJson(
      baseUrl,
      "GET",
      "/api/announcements",
      undefined,
      readerA.payload.token
    );
    assert.deepEqual(readerAAfterUpdate.payload.readState.versions, {});

    const readerBReadAll = await requestJson(
      baseUrl,
      "POST",
      "/api/announcements/read-all",
      {},
      readerB.payload.token
    );
    assert.equal(readerBReadAll.response.status, 200);
    assert.equal(
      readerBReadAll.payload.readState.versions[announcementId],
      updated.payload.announcement.updatedAt
    );

    const rejectedExpiry = await requestJson(
      baseUrl,
      "PUT",
      `/api/admin/announcements/${encodeURIComponent(announcementId)}`,
      {
        title: "不应保存的过期修改",
        content: "这次修改应该被服务端拒绝。",
        level: "important",
        pinned: true,
        expiresAt: new Date(Date.now() - 60 * 1000).toISOString()
      },
      adminToken
    );
    assert.equal(rejectedExpiry.response.status, 400);
    assert.equal(rejectedExpiry.payload.code, "announcement_already_expired");

    const afterRejectedExpiry = await requestJson(baseUrl, "GET", "/api/announcements");
    assert.equal(afterRejectedExpiry.payload.announcements[0].title, "平台更新 2");
    assert.equal(
      afterRejectedExpiry.payload.announcements[0].content,
      "公告内容已经实时更新。"
    );

    const futureStart = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const futureEnd = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
    const scheduled = await requestJson(
      baseUrl,
      "POST",
      "/api/admin/announcements",
      {
        title: "定时维护",
        content: "这条公告尚未到生效时间。",
        level: "maintenance",
        startsAt: futureStart,
        expiresAt: futureEnd
      },
      adminToken
    );
    const scheduledId = scheduled.payload.announcement.id;
    const scheduledPublish = await requestJson(
      baseUrl,
      "POST",
      `/api/admin/announcements/${encodeURIComponent(scheduledId)}/publish`,
      {},
      adminToken
    );
    assert.equal(scheduledPublish.response.status, 200);

    const activeOnly = await requestJson(baseUrl, "GET", "/api/announcements");
    assert.deepEqual(
      activeOnly.payload.announcements.map((announcement) => announcement.id),
      [announcementId]
    );

    const withdrawn = await requestJson(
      baseUrl,
      "POST",
      `/api/admin/announcements/${encodeURIComponent(announcementId)}/withdraw`,
      {},
      adminToken
    );
    assert.equal(withdrawn.response.status, 200);
    assert.equal(withdrawn.payload.announcement.status, "withdrawn");

    const afterWithdraw = await requestJson(baseUrl, "GET", "/api/announcements");
    assert.deepEqual(afterWithdraw.payload.announcements, []);

    const adminList = await requestJson(
      baseUrl,
      "GET",
      "/api/admin/announcements",
      undefined,
      adminToken
    );
    assert.equal(adminList.response.status, 200);
    assert.equal(adminList.payload.announcements.length, 2);

    const deleted = await requestJson(
      baseUrl,
      "DELETE",
      `/api/admin/announcements/${encodeURIComponent(announcementId)}`,
      undefined,
      adminToken
    );
    assert.equal(deleted.response.status, 200);
    assert.equal(deleted.payload.deleted, true);

    streamController.abort();
    console.log("announcements API tests passed");
  } finally {
    streamController?.abort();
    await stopChild(child);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
