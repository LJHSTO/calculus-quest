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

async function requestJson(baseUrl, pathname, body) {
  const response = await fetch(baseUrl + pathname, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  return {
    response,
    payload: await response.json().catch(() => ({}))
  };
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
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cq-auth-login-"));
  const dbPath = path.join(tmpDir, "auth-login.db");
  const previousDbPath = process.env.DB_PATH;
  process.env.DB_PATH = dbPath;

  const db = require("../db");
  await db.getDb();
  const legacyTimestamp = "2026-07-09T15:49:39.972+08:00";
  db.upsertUser("legacy-login-test", "历史学习者", legacyTimestamp, legacyTimestamp, {
    nickname: "历史学习者",
    nicknameNorm: "历史学习者",
    email: "",
    emailNorm: "",
    passwordHash: ""
  });
  db.saveNow();

  const port = await freePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const logs = [];
  let child;

  try {
    child = spawn(process.execPath, ["server.js", String(port)], {
      cwd: path.resolve(__dirname, ".."),
      env: {
        ...process.env,
        DB_PATH: dbPath,
        HOST: "127.0.0.1",
        LLM_PROVIDER: "mock"
      },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true
    });
    child.stdout.on("data", (chunk) => logs.push(chunk.toString()));
    child.stderr.on("data", (chunk) => logs.push(chunk.toString()));
    await waitForHealth(baseUrl, child, logs);

    const missing = await requestJson(baseUrl, "/api/auth/login", {
      identifier: "不存在的学习者",
      password: "password-123"
    });
    assert.equal(missing.response.status, 404);
    assert.equal(missing.payload.code, "account_not_found");
    assert.equal(missing.payload.field, "identifier");
    assert.match(missing.payload.message, /没有找到这个账号/);

    const legacy = await requestJson(baseUrl, "/api/auth/login", {
      identifier: "历史学习者",
      password: "password-123"
    });
    assert.equal(legacy.response.status, 409);
    assert.equal(legacy.payload.code, "password_not_set");
    assert.match(legacy.payload.message, /同一昵称设置密码/);
    assert.match(legacy.payload.message, /学习记录会保留/);

    const nickname = `认证测试${Date.now().toString().slice(-6)}`;
    const registered = await requestJson(baseUrl, "/api/auth/register", {
      nickname,
      email: "",
      password: "correct-password-123"
    });
    assert.equal(registered.response.status, 200);

    const wrongPassword = await requestJson(baseUrl, "/api/auth/login", {
      identifier: nickname,
      password: "wrong-password-123"
    });
    assert.equal(wrongPassword.response.status, 401);
    assert.equal(wrongPassword.payload.code, "password_incorrect");
    assert.equal(wrongPassword.payload.field, "password");
    assert.match(wrongPassword.payload.message, /密码不正确/);

    const valid = await requestJson(baseUrl, "/api/auth/login", {
      identifier: nickname,
      password: "correct-password-123"
    });
    assert.equal(valid.response.status, 200);
    assert.equal(valid.payload.ok, true);
    assert.ok(valid.payload.token);

    console.log("auth login tests passed");
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
