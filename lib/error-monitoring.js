"use strict";
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const codes = new Set(["browser_error", "browser_rejection", "resource_failed", "api_network",
  "api_5xx", "server_exception", "server_rejection", "grading_unavailable", "monitor_test"]);
const browserCodes = new Set(["browser_error", "browser_rejection", "resource_failed", "api_network", "api_5xx"]);
const files = new Set(["server.js", "db.js", "index.html", "admin.html", "styles.css"]);
for (const directory of ["app/main", "admin", "lib", "lib/agents"]) {
  try {
    for (const name of fs.readdirSync(path.join(__dirname, "..", directory))) {
      if (/^[a-z0-9-]+\.(js|css)$/.test(name)) files.add(`${directory}/${name}`);
    }
  } catch {}
}
const routes = new Set(["/api/learning/quiz/submit", "/api/learning/assistant/chat",
  "/api/learning/proactive/check", "/api/learning/proactive/outcomes/submit",
  "/api/learning/notes", "/api/auth/login", "/api/auth/register"]);
let instance;

function safeFile(value) {
  const clean = String(value || "").split(/[?#]/)[0].replaceAll("\\", "/");
  return [...files].find((file) => clean === file || clean.endsWith(`/${file}`)) || "";
}
function normalize(input = {}, source = "server") {
  const allowedCodes = source === "browser" ? browserCodes : codes;
  const code = allowedCodes.has(input.code) ? input.code : source === "browser" ? "browser_error" : "server_exception";
  const location = safeFile(input.file);
  return {
    code, source: source === "browser" ? "browser" : "server",
    file: location,
    line: location ? Math.max(0, Math.min(100000, Math.floor(Number(input.line) || 0))) : 0,
    column: location ? Math.max(0, Math.min(100000, Math.floor(Number(input.column) || 0))) : 0,
    route: routes.has(input.route) ? input.route : input.route ? "/api/other" : "",
    status: Number(input.status) >= 500 && Number(input.status) <= 599 ? Number(input.status) : 0
  };
}

function createMonitor(options = {}) {
  const enabled = options.enabled !== false;
  const filename = options.filename || "";
  const release = String(options.release || "unversioned").replace(/[^a-zA-Z0-9._-]/g, "").slice(0, 80);
  const environment = options.environment === "production" ? "production" : "test";
  let rows = [], storageError = false, client = null, sentryState = "未配置";
  let windowAt = Date.now(), counts = { server: 0, browser: 0 }, dropped = 0;
  if (enabled && filename) {
    try {
      if (fs.existsSync(filename)) {
        const parsed = JSON.parse(fs.readFileSync(filename, "utf8"));
        rows = Array.isArray(parsed) ? parsed.slice(-200).map((row) => ({
          ...normalize(row, row.source), id: /^[a-f0-9]{32}$/.test(row.id) ? row.id : crypto.randomBytes(16).toString("hex"),
          firstAt: Number.isFinite(Date.parse(row.firstAt)) ? row.firstAt : new Date().toISOString(),
          lastAt: Number.isFinite(Date.parse(row.lastAt)) ? row.lastAt : new Date().toISOString(),
          count: Math.max(1, Number(row.count) || 1),
          release: String(row.release || "").replace(/[^a-zA-Z0-9._-]/g, "").slice(0, 80)
        })) : [];
      }
    } catch { storageError = true; }
  }
  if (enabled && options.dsn) {
    try {
      const Sentry = options.sdk || require("@sentry/node");
      // No automatic request, console, AI, performance or replay instrumentation.
      client = new Sentry.NodeClient({
        dsn: options.dsn, release, environment, defaultIntegrations: false, integrations: [],
        transport: Sentry.makeNodeTransport, stackParser: Sentry.defaultStackParser,
        sendDefaultPii: false, tracesSampleRate: 0, enableLogs: false,
        sendClientReports: false, maxBreadcrumbs: 0,
        beforeSend(event) {
          const row = normalize(event.tags || {}, event.tags?.source);
          return {
            event_id: event.event_id, timestamp: event.timestamp, platform: "node", level: "error",
            release, environment, message: row.code,
            fingerprint: [row.source, row.code, row.file, String(row.line), row.route, String(row.status)],
            tags: { ...row, line: String(row.line), column: String(row.column), status: String(row.status) }
          };
        }
      });
      client.init();
      sentryState = "已配置，尚未核验接收";
    } catch { client = null; sentryState = "初始化失败"; }
  }
  function persist() {
    if (!filename) return;
    try {
      fs.mkdirSync(path.dirname(filename), { recursive: true });
      fs.writeFileSync(`${filename}.tmp`, JSON.stringify(rows), { mode: 0o600 });
      fs.renameSync(`${filename}.tmp`, filename);
      storageError = false;
    } catch { storageError = true; }
  }
  function capture(input, source = "server") {
    if (!enabled) return null;
    try {
      const now = Date.now();
      if (now - windowAt >= 60000) { windowAt = now; counts = { server: 0, browser: 0 }; }
      const bucket = source === "browser" ? "browser" : "server";
      if (++counts[bucket] > (bucket === "browser" ? 40 : 120)) { dropped++; return null; }
      const clean = normalize(input, source);
      const match = rows.find((row) => row.release === release
        && Object.keys(clean).every((key) => row[key] === clean[key])
        && now - Date.parse(row.lastAt) < 60000);
      if (match) {
        match.count++;
        match.lastAt = new Date(now).toISOString();
        persist();
        return match.id;
      }
      const row = { ...clean, id: crypto.randomBytes(16).toString("hex"),
        release, firstAt: new Date(now).toISOString(), lastAt: new Date(now).toISOString(), count: 1 };
      rows.push(row);
      rows = rows.slice(-200);
      persist();
      if (client) {
        try {
          client.captureEvent({ event_id: row.id, timestamp: now / 1000, level: "error",
            message: row.code, tags: clean });
        } catch { sentryState = "上报失败"; }
      }
      return row.id;
    } catch { return null; }
  }
  return {
    capture,
    captureException(error, code = "server_exception") {
      const frame = String(error?.stack || "").split("\n").slice(1, 20)
        .map((line) => line.match(/(?:\(|\s)([^()]+):(\d+):(\d+)\)?$/))
        .find((match) => match && safeFile(match[1]));
      return capture({ code, file: frame?.[1] || "server.js", line: frame?.[2], column: frame?.[3] });
    },
    status: () => ({ enabled, release, environment, sentryConfigured: Boolean(client), sentryState,
      storageError, persistent: Boolean(filename), dropped, rows: rows.slice().reverse() }),
    async flush() {
      if (!client) return false;
      try { return await client.flush(1500); } catch { return false; }
    }
  };
}
function init() {
  if (instance) return instance;
  instance = createMonitor({
    enabled: process.env.ERROR_MONITORING_ENABLED !== "false",
    filename: process.env.ERROR_MONITORING_PATH || path.join(
      process.env.DB_PATH ? path.dirname(path.resolve(process.env.DB_PATH)) : path.resolve("data"),
      "error-monitoring.json"),
    release: process.env.APP_VERSION || require("../package.json").version,
    environment: process.env.NODE_ENV,
    dsn: process.env.SENTRY_DSN || ""
  });
  return instance;
}
function capture(input, source) { try { return instance?.capture(input, source) || null; } catch { return null; } }
module.exports = { init, capture, createMonitor, normalize };
