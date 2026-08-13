const assert = require("node:assert/strict");
const fs = require("node:fs");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const coreSource = fs.readFileSync(path.join(root, "app/main/core.js"), "utf8");
const trackEventStart = coreSource.indexOf("async function trackLearningEvent");
const trackEventEnd = coreSource.indexOf("\nasync function waitForLearningEventSync", trackEventStart);
assert.ok(trackEventStart >= 0 && trackEventEnd > trackEventStart);
const trackEventSource = coreSource.slice(trackEventStart, trackEventEnd);
assert.match(trackEventSource, /deliverLearningEvent/);
assert.doesNotMatch(trackEventSource, /\/api\/learning\/event"/);
assert.match(coreSource, /apiRequest\("\/api\/learning\/events"/);
assert.match(coreSource, /eventId:\s*learningEventClientId\(\)/);
assert.match(coreSource, /learningEventMaxDeliveryAttempts\s*=\s*3/);

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

async function requestJson(baseUrl, pathname, options = {}) {
  const headers = {};
  if (options.token) headers.Authorization = `Bearer ${options.token}`;
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  const response = await fetch(baseUrl + pathname, {
    method: options.method || "GET",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body)
  });
  return {
    response,
    payload: await response.json().catch(() => ({}))
  };
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

function startServer(port, dbPath, adminToken, logs) {
  const child = spawn(process.execPath, ["server.js", String(port)], {
    cwd: root,
    env: {
      ...process.env,
      DB_PATH: dbPath,
      HOST: "127.0.0.1",
      ADMIN_TOKEN: adminToken,
      LLM_PROVIDER: "mock",
      NODE_ENV: "test"
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true
  });
  child.stdout.on("data", (chunk) => logs.push(chunk.toString()));
  child.stderr.on("data", (chunk) => logs.push(chunk.toString()));
  return child;
}

async function forceKillChild(child) {
  if (!child || child.exitCode !== null) return;
  child.kill("SIGKILL");
  await Promise.race([
    new Promise((resolve) => child.once("exit", resolve)),
    new Promise((resolve) => setTimeout(resolve, 4000))
  ]);
  assert.ok(
    child.exitCode !== null || child.signalCode !== null,
    "server must stop after a forced termination"
  );
}

async function main() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cq-learning-events-"));
  const dbPath = path.join(tmpDir, "learning-events.db");
  const port = await freePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const adminToken = "learning-event-admin-token";
  const logs = [];
  let child;

  try {
    child = startServer(port, dbPath, adminToken, logs);
    await waitForHealth(baseUrl, child, logs);

    const registered = await requestJson(baseUrl, "/api/auth/register", {
      method: "POST",
      body: {
        nickname: `事件耐久测试${Date.now().toString().slice(-6)}`,
        email: "",
        password: "event-durability-123"
      }
    });
    assert.equal(registered.response.status, 200);
    const token = registered.payload.token;
    const firstAt = new Date(Date.now() - 2000).toISOString();
    const secondAt = new Date(Date.now() - 1000).toISOString();
    const events = [
      {
        eventId: "client-event-proactive-shown",
        type: "interaction",
        payload: {
          eventType: "knowledge_proactive_suggestion_shown",
          sequenceIndex: 1,
          timing: { clientAt: firstAt },
          data: { suggestionId: "suggestion-1" }
        }
      },
      {
        eventId: "client-event-proactive-accepted",
        type: "interaction",
        payload: {
          eventType: "knowledge_proactive_suggestion_accepted",
          sequenceIndex: 2,
          timing: { clientAt: secondAt },
          data: { suggestionId: "suggestion-1" }
        }
      }
    ];

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const submittedEvents = attempt === 0
        ? events
        : events.map((event) => ({
            ...event,
            payload: {
              ...event.payload,
              timing: { clientAt: new Date().toISOString() },
              data: { suggestionId: "mutated-retry-must-not-replace" }
            }
          }));
      const submitted = await requestJson(baseUrl, "/api/learning/events", {
        method: "POST",
        token,
        body: { events: submittedEvents }
      });
      assert.equal(submitted.response.status, 200);
      assert.equal(submitted.payload.eventIds.length, 2);
    }

    await forceKillChild(child);
    child = startServer(port, dbPath, adminToken, logs);
    await waitForHealth(baseUrl, child, logs);

    const interactions = await requestJson(
      baseUrl,
      "/api/admin/stats/interactions?detail=all&limit=20",
      { token: adminToken }
    );
    assert.equal(interactions.response.status, 200);
    const rows = interactions.payload.data.rows.filter((row) => {
      const payload = JSON.parse(row.payload || "{}");
      return payload.data?.suggestionId === "suggestion-1";
    });
    assert.equal(rows.length, 2, "retrying the same batch must not duplicate events");
    const byType = new Map(rows.map((row) => [JSON.parse(row.payload).eventType, row]));
    assert.equal(
      Date.parse(byType.get("knowledge_proactive_suggestion_shown").created_at),
      Date.parse(firstAt)
    );
    assert.equal(
      Date.parse(byType.get("knowledge_proactive_suggestion_accepted").created_at),
      Date.parse(secondAt)
    );
    assert.ok(
      byType.get("knowledge_proactive_suggestion_shown").created_at
        < byType.get("knowledge_proactive_suggestion_accepted").created_at,
      "client event order must survive a shared server batch"
    );

    console.log("learning event durability tests passed");
  } finally {
    await stopChild(child);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
