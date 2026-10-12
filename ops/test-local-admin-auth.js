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

async function requestJson(baseUrl, pathname, token = "") {
  const response = await fetch(baseUrl + pathname, {
    headers: token ? { Authorization: `Bearer ${token}` } : {}
  });
  return { response, payload: await response.json().catch(() => ({})) };
}

async function runCase(root, dbPath, expected, overrides = {}) {
  const port = await freePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const logs = [];
  const token = "local-admin-auth-test";
  const childEnv = {
    ...process.env,
    DB_PATH: dbPath,
    HOST: "127.0.0.1",
    LLM_PROVIDER: "mock",
    ADMIN_TOKEN: token,
    ...overrides
  };
  let child;
  try {
    child = spawn(process.execPath, ["server.js", String(port)], {
      cwd: root,
      env: childEnv,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true
    });
    child.stdout.on("data", (chunk) => logs.push(chunk.toString()));
    child.stderr.on("data", (chunk) => logs.push(chunk.toString()));
    await waitForHealth(baseUrl, child, logs);

    const status = await requestJson(baseUrl, "/api/admin/auth/status");
    assert.equal(status.response.status, 200);
    assert.equal(status.payload.data.localBypass, expected.bypass);
    assert.equal(status.payload.data.authenticated, expected.authenticated);

    const anonymousOverview = await requestJson(baseUrl, "/api/admin/stats/overview");
    assert.equal(anonymousOverview.response.status, expected.anonymousStatus);

    const authenticatedOverview = await requestJson(
      baseUrl,
      "/api/admin/stats/overview",
      token
    );
    assert.equal(authenticatedOverview.response.status, 200);
  } finally {
    await stopChild(child);
  }
}

async function main() {
  const root = path.resolve(__dirname, "..");
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "cq-local-admin-auth-"));
  try {
    await runCase(
      root,
      path.join(tempDir, "loopback-enabled.db"),
      { bypass: true, authenticated: true, anonymousStatus: 200 },
      { LOCAL_ADMIN_AUTH_BYPASS: "true" }
    );
    await runCase(
      root,
      path.join(tempDir, "loopback-disabled.db"),
      { bypass: false, authenticated: false, anonymousStatus: 403 },
      { LOCAL_ADMIN_AUTH_BYPASS: "false" }
    );
    await runCase(
      root,
      path.join(tempDir, "wildcard-host.db"),
      { bypass: false, authenticated: false, anonymousStatus: 403 },
      { HOST: "0.0.0.0" }
    );
    console.log("local admin auth tests passed");
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
