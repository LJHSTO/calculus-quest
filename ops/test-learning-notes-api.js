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
  return { response, payload: await response.json().catch(() => ({})) };
}

async function register(baseUrl, nickname) {
  return requestJson(baseUrl, "POST", "/api/auth/register", {
    nickname,
    email: "",
    password: "learning-notes-password-123"
  });
}

function noteFixture({ id, chapterId, unitId, updatedAt, note = "先看横向间隔怎样缩小" }) {
  return {
    id,
    threadKey: `knowledge:${unitId}`,
    chapterId,
    unitId,
    excerpt: "当 Δx 趋近于 0 时",
    note,
    color: "mint",
    contextRef: {
      kind: "text",
      scope: "slide",
      chapterId,
      unitId,
      semanticId: `slide:${unitId}:text-1`,
      excerpt: "当 Δx 趋近于 0 时",
      confidence: "high"
    },
    locator: {
      source: "document",
      semanticId: `slide:${unitId}:text-1`,
      exact: "当 Δx 趋近于 0 时",
      prefix: "观察",
      suffix: "割线"
    },
    createdAt: "2026-07-25T08:00:00.000Z",
    updatedAt
  };
}

async function main() {
  const root = path.resolve(__dirname, "..");
  const route = JSON.parse(fs.readFileSync(path.join(root, "data", "multi-scene-learning-route.json"), "utf8"));
  const chapter = route.chapters[0];
  const unit = chapter.modules[0].knowledgePoints[0];
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cq-learning-notes-"));
  const port = await freePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const logs = [];
  let child;

  try {
    child = spawn(process.execPath, ["server.js", String(port)], {
      cwd: root,
      env: {
        ...process.env,
        DB_PATH: path.join(tmpDir, "notes.db"),
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

    const userA = await register(baseUrl, `笔记甲${Date.now().toString().slice(-6)}`);
    const userB = await register(baseUrl, `笔记乙${Date.now().toString().slice(-6)}`);
    assert.equal(userA.response.status, 200);
    assert.equal(userB.response.status, 200);
    const tokenA = userA.payload.token;
    const tokenB = userB.payload.token;
    const noteId = "note-cross-device-1";
    const firstNote = noteFixture({
      id: noteId,
      chapterId: chapter.id,
      unitId: unit.id,
      updatedAt: "2026-07-25T08:05:00.000Z"
    });

    const created = await requestJson(
      baseUrl,
      "PUT",
      `/api/learning/notes/${encodeURIComponent(noteId)}`,
      firstNote,
      tokenA
    );
    assert.equal(created.response.status, 200);
    assert.equal(created.payload.note.id, noteId);

    const listAResponse = await fetch(
      `${baseUrl}/api/learning/notes?unitId=${encodeURIComponent(unit.id)}`,
      { headers: { Authorization: `Bearer ${tokenA}` } }
    );
    const listA = await listAResponse.json();
    assert.equal(listAResponse.status, 200);
    assert.equal(listA.notes.length, 1);
    assert.equal(listA.notes[0].note, firstNote.note);
    assert.equal(listA.notes[0].locator.exact, firstNote.locator.exact);

    const listBResponse = await fetch(
      `${baseUrl}/api/learning/notes?unitId=${encodeURIComponent(unit.id)}`,
      { headers: { Authorization: `Bearer ${tokenB}` } }
    );
    const listB = await listBResponse.json();
    assert.equal(listBResponse.status, 200);
    assert.equal(listB.notes.length, 0, "notes must be isolated per account");

    const updated = await requestJson(
      baseUrl,
      "PUT",
      `/api/learning/notes/${encodeURIComponent(noteId)}`,
      { ...firstNote, note: "先比较割线和切线的方向", updatedAt: "2026-07-25T08:10:00.000Z" },
      tokenA
    );
    assert.equal(updated.response.status, 200);
    assert.equal(updated.payload.note.note, "先比较割线和切线的方向");

    const migration = await requestJson(baseUrl, "POST", "/api/learning/notes/sync", {
      unitId: unit.id,
      notes: [
        { ...firstNote, note: "旧设备上的较旧内容", updatedAt: "2026-07-25T08:06:00.000Z" },
        noteFixture({
          id: "note-migrated-2",
          chapterId: chapter.id,
          unitId: unit.id,
          note: "这条来自旧浏览器",
          updatedAt: "2026-07-25T08:12:00.000Z"
        })
      ]
    }, tokenA);
    assert.equal(migration.response.status, 200);
    assert.equal(migration.payload.notes.length, 2);
    assert.equal(
      migration.payload.notes.find((note) => note.id === noteId).note,
      "先比较割线和切线的方向",
      "an older local migration must not overwrite the newer server note"
    );

    const syncedDeletion = await requestJson(baseUrl, "POST", "/api/learning/notes/sync", {
      unitId: unit.id,
      notes: [],
      deletedIds: ["note-migrated-2"]
    }, tokenA);
    assert.equal(syncedDeletion.response.status, 200);
    assert.deepEqual(syncedDeletion.payload.notes.map((note) => note.id), [noteId]);

    const forbiddenDelete = await requestJson(
      baseUrl,
      "DELETE",
      `/api/learning/notes/${encodeURIComponent(noteId)}`,
      undefined,
      tokenB
    );
    assert.equal(forbiddenDelete.response.status, 404);

    const deleted = await requestJson(
      baseUrl,
      "DELETE",
      `/api/learning/notes/${encodeURIComponent(noteId)}`,
      undefined,
      tokenA
    );
    assert.equal(deleted.response.status, 200);
    assert.equal(deleted.payload.deleted, true);

    const afterDeleteResponse = await fetch(
      `${baseUrl}/api/learning/notes?unitId=${encodeURIComponent(unit.id)}`,
      { headers: { Authorization: `Bearer ${tokenA}` } }
    );
    const afterDelete = await afterDeleteResponse.json();
    assert.deepEqual(afterDelete.notes.map((note) => note.id), []);

    console.log("learning notes API tests passed");
  } finally {
    await stopChild(child);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
