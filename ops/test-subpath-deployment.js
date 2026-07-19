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
      const response = await fetch(baseUrl + "/calculus_quest/api/health");
      if (response.ok) return response.json();
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
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cq-subpath-"));
  const dbPath = path.join(tmpDir, "subpath.db");
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
        BASE_PATH: "/calculus_quest/",
        LLM_PROVIDER: "mock",
        NODE_ENV: "development"
      },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true
    });
    child.stdout.on("data", (chunk) => logs.push(chunk.toString()));
    child.stderr.on("data", (chunk) => logs.push(chunk.toString()));

    const health = await waitForHealth(baseUrl, child, logs);
    assert.equal(health.ok, true);
    assert.equal(health.basePath, "/calculus_quest");

    const strippedHealthResponse = await fetch(baseUrl + "/api/health");
    assert.equal(strippedHealthResponse.status, 200, "Nginx-stripped API path must remain supported");
    const strippedHealth = await strippedHealthResponse.json();
    assert.equal(strippedHealth.basePath, "/calculus_quest");

    const redirect = await fetch(baseUrl + "/calculus_quest?from=test", { redirect: "manual" });
    assert.equal(redirect.status, 301);
    assert.equal(redirect.headers.get("location"), "/calculus_quest/?from=test");

    for (const pathname of [
      "/calculus_quest/",
      "/calculus_quest/index.html",
      "/calculus_quest/admin.html",
      "/calculus_quest/styles.css",
      "/calculus_quest/admin/admin.js",
      "/calculus_quest/lib/interaction-policy.js",
      "/calculus_quest/api/course/openmaic-v14-route"
    ]) {
      const response = await fetch(baseUrl + pathname);
      assert.equal(response.status, 200, pathname);
    }

    for (const pathname of [
      "/",
      "/index.html",
      "/admin.html",
      "/styles.css",
      "/admin/admin.js",
      "/api/course/openmaic-v14-route"
    ]) {
      const response = await fetch(baseUrl + pathname);
      assert.equal(response.status, 200, `stripped proxy path ${pathname}`);
    }

    const wrongPrefix = await fetch(baseUrl + "/calculus_quest_extra/api/health");
    assert.notEqual(wrongPrefix.status, 200);
    const duplicatedPrefix = await fetch(baseUrl + "/calculus_quest/calculus_quest/api/health");
    assert.notEqual(duplicatedPrefix.status, 200);

    console.log("subpath deployment tests passed");
  } finally {
    await stopChild(child);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
