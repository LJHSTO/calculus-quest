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
  child.kill("SIGKILL");
  await Promise.race([
    new Promise((resolve) => child.once("exit", resolve)),
    new Promise((resolve) => setTimeout(resolve, 4000))
  ]);
}

function spawnServer(root, port, dbPath, logs) {
  const child = spawn(process.execPath, ["server.js", String(port)], {
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
  return child;
}

async function main() {
  const root = path.resolve(__dirname, "..");
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cq-flush-durability-"));
  const dbPath = path.join(tmpDir, "flush-durability.db");
  const logs = [];
  let child;

  try {
    const port = await freePort();
    const baseUrl = `http://127.0.0.1:${port}`;
    child = spawnServer(root, port, dbPath, logs);
    await waitForHealth(baseUrl, child, logs);

    const registerResponse = await fetch(baseUrl + "/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nickname: "落盘测试学员",
        password: "durability-pass-1"
      })
    });
    assert.equal(registerResponse.status, 200, "registration must succeed");
    const registered = await registerResponse.json();
    assert.ok(registered.token, "registration must issue a session token");

    // 注册属于关键写入，必须在响应前同步落盘。
    assert.ok(fs.existsSync(dbPath), "database file must exist right after registration");
    const baselineMtime = fs.statSync(dbPath).mtimeMs;

    // 持续高频写入（间隔远小于 2 秒防抖）也不能阻止落盘：max-wait 必须在约 10 秒内强制刷盘。
    const deadline = Date.now() + 20000;
    let flushed = false;
    while (Date.now() < deadline) {
      const eventResponse = await fetch(baseUrl + "/api/learning/event", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${registered.token}`
        },
        body: JSON.stringify({
          type: "flush_durability_probe",
          payload: { at: Date.now() }
        })
      });
      assert.equal(eventResponse.status, 200, "event write must succeed");
      if (fs.statSync(dbPath).mtimeMs > baselineMtime) {
        flushed = true;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
    assert.ok(flushed, "database must flush to disk while writes keep arriving (max-wait)");

    // 模拟进程被 SIGKILL：磁盘上的数据必须仍可用，账号能重新登录。
    child.kill("SIGKILL");
    await new Promise((resolve) => child.once("exit", resolve));
    child = null;
    assert.ok(fs.existsSync(dbPath), "database file must survive SIGKILL");
    assert.ok(fs.statSync(dbPath).size > 0, "database file must not be empty after SIGKILL");
    const lockPath = dbPath + ".lock";
    if (fs.existsSync(lockPath)) fs.unlinkSync(lockPath);

    const restartPort = await freePort();
    const restartBaseUrl = `http://127.0.0.1:${restartPort}`;
    child = spawnServer(root, restartPort, dbPath, logs);
    await waitForHealth(restartBaseUrl, child, logs);
    const loginResponse = await fetch(restartBaseUrl + "/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        identifier: "落盘测试学员",
        password: "durability-pass-1"
      })
    });
    assert.equal(loginResponse.status, 200, "registered account must survive an unclean shutdown");

    console.log("db flush durability tests passed");
  } finally {
    await stopChild(child);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
