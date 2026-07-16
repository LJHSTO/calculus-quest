const crypto = require("crypto");
const fs = require("fs");
const http = require("http");
const path = require("path");
const zlib = require("zlib");
// Load .env (if present) so LLM_PROVIDER / OPENAI_COMPATIBLE_API_KEY etc. can be configured without a process manager.
(function loadEnvFile() {
  try {
    const envPath = path.join(process.cwd(), ".env");
    if (!fs.existsSync(envPath)) return;
    const text = fs.readFileSync(envPath, "utf8");
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq < 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let val = trimmed.slice(eq + 1).trim();
      const first = val.charCodeAt(0);
      const last = val.charCodeAt(val.length - 1);
      if (val.length >= 2 && first === last && (first === 34 || first === 39)) val = val.slice(1, -1);
      if (key && process.env[key] === undefined) process.env[key] = val;
    }
  } catch (e) {
    console.warn(".env load skipped:", e.message);
  }
})();

const db = require("./db");
const kg = require("./lib/kg");
const coach = require("./lib/agentic-coach");
const orchestrator = require("./lib/agent-orchestrator");
const feedback = require("./lib/feedback");
const root = process.cwd();
const port = Number(process.argv[2] || process.env.PORT || 8765);
const host = process.env.HOST || "127.0.0.1";
const maxBodyBytes = 1024 * 1024;
const maxBufferedStaticBytes = 512 * 1024;
const maxGzipBytes = 256 * 1024;
const gzipCache = new Map();
const maxGzipCacheEntries = 32;
const sessionTtlMs = 30 * 24 * 60 * 60 * 1000;
const authAttemptWindowMs = 15 * 60 * 1000;
const maxFailedAuthAttempts = 8;
const authAttemptMap = new Map();

const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".m4a": "audio/mp4",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation"
};

function send(res, status, body, type = "text/plain; charset=utf-8", extraHeaders = {}) {
  res.writeHead(status, {
    "Content-Type": type,
    "Cache-Control": "no-store",
    ...extraHeaders
  });
  res.end(body);
}

function sendJson(res, status, payload) {
  send(res, status, JSON.stringify(payload), "application/json; charset=utf-8");
}

function shouldCompress(req, type, size) {
  if (!/\btext\/|javascript|json|svg|xml/.test(type)) return false;
  if (!/\bgzip\b/.test(req.headers["accept-encoding"] || "")) return false;
  return size > 1024 && size <= maxGzipBytes;
}

function cacheControlFor(filePath, url) {
  const relative = path.relative(root, filePath).replaceAll(path.sep, "/");
  const ext = path.extname(filePath).toLowerCase();
  // Versioned assets (cache-busted with ?v= param) can be cached aggressively
  if (url && url.searchParams.has("v") && (ext === ".js" || ext === ".css")) return "public, max-age=604800, immutable";
  if (relative === "index.html" || relative === "admin.html") return "no-store, max-age=0, no-transform";
  if (ext === ".js" || ext === ".css") return "no-store, max-age=0";
  if (relative.startsWith("resources/") && ext === ".json") return "public, max-age=3600";
  if (relative.startsWith("resources/")) return "public, max-age=86400";
  return "public, max-age=3600";
}

function contentSecurityPolicyFor(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext !== ".html") return null;
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' data: https://cdn.jsdelivr.net",
    "style-src 'self' 'unsafe-inline' data: https://cdn.jsdelivr.net",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data: about:",
    "media-src 'self' data: blob: https:",
    "frame-src 'self' http://localhost:3000 http://127.0.0.1:3000 http://localhost:3001 http://127.0.0.1:3001 http://localhost:8765 http://127.0.0.1:8765",
    "child-src 'self' http://localhost:3000 http://127.0.0.1:3000 http://localhost:3001 http://127.0.0.1:3001 http://localhost:8765 http://127.0.0.1:8765",
    "worker-src 'self' blob:",
    "connect-src 'self'"
  ].join("; ");
}

function staticHeaders(filePath, url, extraHeaders = {}) {
  const headers = {
    "Cache-Control": cacheControlFor(filePath, url),
    "X-Content-Type-Options": "nosniff",
    ...extraHeaders
  };
  const csp = contentSecurityPolicyFor(filePath);
  if (csp) headers["Content-Security-Policy"] = csp;
  return headers;
}

function gzipCacheKey(filePath, data) {
  try {
    const stat = fs.statSync(filePath);
    return `${filePath}:${stat.mtimeMs}:${data.length}`;
  } catch {
    return `${filePath}:${data.length}`;
  }
}

function rememberGzip(key, value) {
  if (value.length > maxGzipBytes) return;
  gzipCache.set(key, value);
  if (gzipCache.size <= maxGzipCacheEntries) return;
  const oldest = gzipCache.keys().next().value;
  if (oldest) gzipCache.delete(oldest);
}

function isBlockedStaticResource(filePath) {
  const relative = path.relative(root, filePath).replaceAll(path.sep, "/");
  return /^resources\/open-maic\/[^/]+\/manifest\.json$/.test(relative);
}


function streamStaticFile(req, res, filePath, type, url, stat) {
  const headers = staticHeaders(filePath, url, {
    "Content-Length": String(stat.size)
  });
  res.writeHead(200, {
    "Content-Type": type,
    ...headers
  });
  if (req.method === "HEAD") {
    res.end();
    return;
  }
  const stream = fs.createReadStream(filePath);
  stream.on("error", (error) => {
    console.error("Static stream error:", error.message);
    if (!res.headersSent) send(res, 500, "服务器内部错误。");
    else res.destroy(error);
  });
  stream.pipe(res);
}

function getDateRange(url) {
  const range = url.searchParams.get("range") || "";
  if (range) {
    const bj = new Date(new Date().getTime() + 8 * 3600 * 1000);
    const fmt = (d) => d.toISOString().slice(0, 10);
    let start, end;
    switch (range) {
      case "today":
        start = fmt(bj); end = fmt(bj) + "T23:59:59.999";
        break;
      case "yesterday": {
        const y = new Date(bj.getTime() - 86400000);
        start = fmt(y); end = fmt(y) + "T23:59:59.999";
        break;
      }
     case "24h": {
       const pad = (n) => String(n).padStart(2, "0");
        const d = new Date(bj.getTime() - 86400000); // 24h ago Beijing time
       start = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}+08:00`;
       end = "";
       break;
     }
      case "14d": {
        const d = new Date(bj.getTime() - 14 * 86400000);
        start = fmt(d); end = fmt(bj) + "T23:59:59.999";
        break;
      }
      case "30d": {
        const d = new Date(bj.getTime() - 30 * 86400000);
        start = fmt(d); end = fmt(bj) + "T23:59:59.999";
        break;
      }
      case "month": {
        start = fmt(new Date(bj.getFullYear(), bj.getMonth(), 1));
        end = fmt(bj) + "T23:59:59.999";
        break;
      }
      default:
        start = ""; end = "";
    }
    return { startDate: start, endDate: end };
  }
  const start = url.searchParams.get("start_date") || "";
  const end = url.searchParams.get("end_date") || "";
  // adjust end_date to be inclusive (end of day)
  const endInclusive = end ? end + "T23:59:59.999" : "";
  return { startDate: start, endDate: endInclusive };
}

function beijingIso(date = new Date()) {
  const bj = new Date(date.getTime() + 8 * 3600 * 1000);
  return bj.toISOString().slice(0, -1) + "+08:00";
}

function nowIso() {
  return beijingIso();
}

function futureIso(msFromNow) {
  return beijingIso(new Date(Date.now() + msFromNow));
}

function cleanNickname(value = "") {
  return String(value).trim().replace(/\s+/g, " ").slice(0, 24);
}

function isValidNickname(value = "") {
  return !value || (Array.from(String(value)).length >= 2 && Array.from(String(value)).length <= 24);
}

function cleanEmail(value = "") {
  return String(value).trim().toLowerCase().slice(0, 254);
}

function normalizeIdentity(value = "") {
  return String(value || "").normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
}

function normalizeEmail(value = "") {
  return cleanEmail(value).normalize("NFKC");
}

function isValidEmail(value = "") {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function cleanLoginIdentifier(value = "") {
  return String(value).trim().replace(/\s+/g, " ").slice(0, 254);
}

function participantIdFor(nickname) {
  return `participant-${crypto.createHash("sha256").update(nickname).digest("hex").slice(0, 12)}`;
}

function participantIdForIdentity(nicknameNorm, emailNorm) {
  return participantIdFor(nicknameNorm || emailNorm || crypto.randomUUID());
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const params = { N: 16384, r: 8, p: 1, keylen: 64 };
  const hash = crypto.scryptSync(String(password), salt, params.keylen, {
    N: params.N,
    r: params.r,
    p: params.p,
    maxmem: 32 * 1024 * 1024
  }).toString("hex");
  return `scrypt$${params.N}$${params.r}$${params.p}$${params.keylen}$${salt}$${hash}`;
}

function verifyPassword(password, stored = "") {
  try {
    const parts = String(stored || "").split("$");
    if (parts.length !== 7 || parts[0] !== "scrypt") return false;
    const [, n, r, p, keylen, salt, expectedHex] = parts;
    const params = {
      N: Number(n),
      r: Number(r),
      p: Number(p),
      keylen: Number(keylen)
    };
    if (!params.N || !params.r || !params.p || !params.keylen || params.keylen > 128) return false;
    if (!/^[a-f0-9]+$/i.test(expectedHex) || expectedHex.length !== params.keylen * 2) return false;
    const expected = Buffer.from(expectedHex, "hex");
    const actual = crypto.scryptSync(String(password), salt, params.keylen, {
      N: params.N,
      r: params.r,
      p: params.p,
      maxmem: 32 * 1024 * 1024
    });
    return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

function isUsablePassword(password = "") {
  const value = String(password || "");
  return value.length >= 8 && value.length <= 72;
}

function publicDisplayName(row) {
  return row?.nickname || row?.email || "未命名用户";
}

function safePublicParticipant(row) {
  if (!row) return null;
  return {
    participantId: row.id,
    loginMode: "password",
    nickname: row.nickname || "",
    email: row.email || "",
    displayName: publicDisplayName(row),
    profileUpdatedAt: row.profile_updated_at || "",
    canEditProfile: !row.profile_updated_at,
    createdAt: row.created_at,
    lastSeenAt: row.last_seen_at
  };
}

function summaryFromData(data) {
  if (!data) return {};
  const parsed = typeof data === "string" ? JSON.parse(data) : data;
  return {
    completed: Array.isArray(parsed.completed) ? parsed.completed.length : 0,
    quizResults: Array.isArray(parsed.quizResults) ? parsed.quizResults.length : 0,
    logs: Array.isArray(parsed.logs) ? parsed.logs.length : 0,
    currentChapterId: parsed.currentChapterId || "",
    currentUnitId: parsed.currentUnitId || "",
    hasNote: Boolean(parsed.note)
  };
}

// Simple in-memory rate limiter: 120 req/min per IP for API routes
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW = 60000;
const RATE_LIMIT_MAX = 120;

function checkRateLimit(req) {
  const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket.remoteAddress || "unknown";
  const now = Date.now();
  let entry = rateLimitMap.get(ip);
  if (!entry || now - entry.resetAt > RATE_LIMIT_WINDOW) {
    entry = { count: 0, resetAt: now + RATE_LIMIT_WINDOW };
    rateLimitMap.set(ip, entry);
  }
  entry.count++;
  if (entry.count > RATE_LIMIT_MAX) return false;

 // Cleanup stale entries periodically
 if (rateLimitMap.size > 5000) {
   for (const [key, val] of rateLimitMap) {
     if (now - val.resetAt > RATE_LIMIT_WINDOW) rateLimitMap.delete(key);
   }
 }
  return true;
}

function authAttemptKey(req, identifier = "") {
  const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket.remoteAddress || "unknown";
  return `${ip}|${normalizeIdentity(identifier) || "unknown"}`;
}

function authAttemptEntry(req, identifier = "") {
  const key = authAttemptKey(req, identifier);
  const now = Date.now();
  let entry = authAttemptMap.get(key);
  if (!entry || now > entry.resetAt) {
    entry = { count: 0, resetAt: now + authAttemptWindowMs };
    authAttemptMap.set(key, entry);
  }
  if (authAttemptMap.size > 5000) {
    for (const [itemKey, item] of authAttemptMap) {
      if (now > item.resetAt) authAttemptMap.delete(itemKey);
    }
  }
  return { key, entry, now };
}

function checkAuthAttemptLimit(req, identifier = "") {
  const { entry, now } = authAttemptEntry(req, identifier);
  if (entry.count < maxFailedAuthAttempts) return { ok: true, retryAfterSeconds: 0 };
  return {
    ok: false,
    retryAfterSeconds: Math.max(1, Math.ceil((entry.resetAt - now) / 1000))
  };
}

function recordFailedAuthAttempt(req, identifier = "") {
  const { entry } = authAttemptEntry(req, identifier);
  entry.count += 1;
}

function clearAuthAttemptLimit(req, identifier = "") {
  authAttemptMap.delete(authAttemptKey(req, identifier));
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > maxBodyBytes) {
        reject(new Error("Request body is too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

function bearerToken(req, body = {}) {
  const header = req.headers.authorization || "";
  if (header.toLowerCase().startsWith("bearer ")) return header.slice(7).trim();
  return String(body.token || "").trim();
}

function authenticate(req, body = {}) {
  const token = bearerToken(req, body);
  if (!token) return null;
  const session = db.getSession(token);
  if (!session) return null;
  const ts = nowIso();
  if (session.revoked_at) return null;
  if (session.expires_at && session.expires_at < ts) return null;
  const participant = db.getUser(session.user_id);
  if (!participant) return null;
  db.touchSession(token, ts);
  db.upsertUser(participant.id, participant.nickname || "", participant.created_at, ts, {
    nicknameNorm: participant.nickname_norm || normalizeIdentity(participant.nickname || ""),
    email: participant.email || "",
    emailNorm: participant.email_norm || normalizeEmail(participant.email || ""),
    passwordHash: participant.password_hash || "",
    passwordUpdatedAt: participant.password_updated_at || "",
    profileUpdatedAt: participant.profile_updated_at || ""
  });
  return { participant, token };
}

function findUserByIdentifier(identifier = "") {
  const cleaned = cleanLoginIdentifier(identifier);
  if (!cleaned) return null;
  const emailNorm = normalizeEmail(cleaned);
  if (isValidEmail(emailNorm)) {
    const byEmail = db.getUserByEmailNorm(emailNorm);
    if (byEmail) return byEmail;
  }
  return db.getUserByNicknameNorm(normalizeIdentity(cleaned));
}

function uniqueUsers(rows = []) {
  const seen = new Set();
  return rows.filter((row) => {
    if (!row?.id || seen.has(row.id)) return false;
    seen.add(row.id);
    return true;
  });
}

function usersForIdentity(nicknameNorm = "", emailNorm = "") {
  return {
    nicknameOwners: uniqueUsers(nicknameNorm ? db.getUsersByNicknameNorm(nicknameNorm) : []),
    emailOwners: uniqueUsers(emailNorm ? db.getUsersByEmailNorm(emailNorm) : [])
  };
}

function firstOtherUser(rows = [], existingId = "") {
  return rows.find((row) => row?.id && row.id !== existingId) || null;
}

function profileConflict(nicknameNorm = "", emailNorm = "", existingId = "") {
  const { nicknameOwners, emailOwners } = usersForIdentity(nicknameNorm, emailNorm);
  const nicknameOwner = firstOtherUser(nicknameOwners, existingId);
  const emailOwner = firstOtherUser(emailOwners, existingId);
  if (nicknameOwner) return { field: "nickname", message: "这个昵称已经被使用。" };
  if (emailOwner) return { field: "email", message: "这个邮箱已经被使用。" };
  return null;
}

function registrationOwnerConflict(nicknameOwners = [], emailOwners = []) {
  const owners = uniqueUsers([...nicknameOwners, ...emailOwners]);
  if (owners.length > 1) {
    const sharedNickname = nicknameOwners.length > 1;
    const sharedEmail = emailOwners.length > 1;
    if (sharedNickname && sharedEmail) return { field: "identity", message: "昵称和邮箱已经被其他账号使用，请换一组账号信息。" };
    if (sharedNickname) return { field: "nickname", message: "这个昵称已经被使用。" };
    if (sharedEmail) return { field: "email", message: "这个邮箱已经被使用。" };
    return { field: "identity", message: "昵称和邮箱分别属于不同账号，请换一个。" };
  }
  const owner = owners[0] || null;
  if (!owner?.password_hash) return { owner };
  const nicknameOwned = nicknameOwners.some((row) => row.id === owner.id);
  return {
    owner,
    field: nicknameOwned ? "nickname" : "email",
    message: nicknameOwned ? "这个昵称已经被使用。" : "这个邮箱已经被使用。"
  };
}

function sendIdentityConstraintError(res, error) {
  const message = String(error?.message || "");
  if (!/UNIQUE constraint failed/i.test(message)) return false;
  const field = message.includes("users.nickname_norm") ? "nickname"
    : message.includes("users.email_norm") ? "email"
      : "identity";
  sendJson(res, 409, {
    ok: false,
    field,
    message: field === "nickname"
      ? "这个昵称已经被使用。"
      : field === "email"
        ? "这个邮箱已经被使用。"
        : "账号信息已经被使用。"
  });
  return true;
}

function issueSession(participantId, timestamp) {
  const token = crypto.randomBytes(32).toString("hex");
  db.createSession(token, participantId, timestamp, futureIso(sessionTtlMs));
  return token;
}

function persistClientQuizResults(participant, rows = []) {
  if (!participant || !Array.isArray(rows)) return;
  rows.forEach((row) => {
    if (!row || !row.questionId && !row.question_id) return;
    const questionId = row.questionId || row.question_id || "";
    const unitId = row.unitId || row.unit_id || "";
    db.insertQuizResult({
      id: row.id || `${participant.id}-${unitId}-${questionId}`,
      user_id: participant.id,
      chapter_id: row.chapterId || row.chapter_id || "",
      chapter_label: row.chapterLabel || row.chapter_label || "",
      unit_id: unitId,
      unit_label: row.unitLabel || row.unit_label || "",
      question_id: questionId,
      question_type: row.questionType || row.question_type || row.mode || "",
      phase: row.phase || "",
      points: row.points || 0,
      response: row.response ?? "",
      is_correct: row.isCorrect === true ? 1 : row.isCorrect === false ? 0 : -1,
      status: row.status || "",
      score: row.score || 0,
      max_score: row.maxScore || row.max_score || 0,
      created_at: row.timestamp || row.created_at || nowIso()
    });
  });
}

function persistGradingResults(participant, results = []) {
  if (!participant || !Array.isArray(results)) return;
  results.forEach((gr) => {
    if (!gr?.questionId) return;
    db.updateQuizResultAiGrading(gr.questionId, participant.id, {
      unitId: gr.unitId || gr.unit_id || "",
      aiScore: gr.score,
      aiConfidence: gr.confidence,
      aiFeedback: gr.feedback,
      aiErrorType: gr.errorType
    });
    db.insertAgentDecision({
      id: crypto.randomUUID(),
      user_id: participant.id,
      agent_type: "grading",
      decision_type: "grade",
      input_summary: { questionId: gr.questionId },
      output_summary: { score: gr.score, confidence: gr.confidence, errorType: gr.errorType },
      confidence: gr.confidence,
      llm_provider: gr.provider || "",
      latency_ms: 0,
      created_at: new Date().toISOString()
    });
  });
}

function getAdminToken() {
  if (process.env.ADMIN_TOKEN) return process.env.ADMIN_TOKEN;
  try {
    const tokenFile = path.join(root, "data", "admin-token.txt");
    if (fs.existsSync(tokenFile)) return fs.readFileSync(tokenFile, "utf8").trim();
  } catch (e) {
    console.error("Failed to read admin-token.txt:", e.message);
  }
  return "";
}

function checkAdmin(req) {
  const configuredToken = getAdminToken();
  if (!configuredToken) return false;
  const requestedToken = bearerToken(req) || "";
  return requestedToken === configuredToken;
}

function safeStaticPath(urlPath) {
  let decoded = "/";
  try {
    decoded = decodeURIComponent(urlPath);
  } catch (e) {
    console.error("Failed to decode URL path:", urlPath, e.message);
    return null;
  }
  const publicPath =
    decoded === "/" ? "index.html"
    : decoded === "/admin" ? "admin.html"
    : decoded.replace(/^\/+/, "");
  // Block access to sensitive directories
  if (/^(data|ops|config|node_modules|\.claude|\.git)(\/|$)/.test(publicPath)) return null;
  const filePath = path.resolve(root, publicPath);
  return filePath === root || filePath.startsWith(root + path.sep) ? filePath : null;
}

async function handleApi(req, res, url) {
  if (!checkRateLimit(req)) {
    sendJson(res, 429, { ok: false, message: "请求过于频繁，请稍后再试。" });
    return;
  }
  try {
    // ---- Auth ----
    if (req.method === "GET" && url.pathname === "/api/health") {
      sendJson(res, 200, { ok: true, time: nowIso() });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/course/openmaic-v14-route") {
      const routePath = path.join(root, "data", "openmaic-v14-route.json");
      try {
        const route = JSON.parse(fs.readFileSync(routePath, "utf8"));
        sendJson(res, 200, route);
      } catch (error) {
        sendJson(res, 404, { ok: false, message: "未找到 Open MAIC v14 学习路线。" });
      }
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/course/openmaic-audio-map") {
      const resourceRoot = String(url.searchParams.get("root") || "").replace(/^resources[\\/]/, "").replace(/\\/g, "/");
      if (!/^open-maic\/[^/]+$/.test(resourceRoot)) {
        sendJson(res, 400, { ok: false, message: "资源路径不正确。" });
        return;
      }
      const manifestPath = path.join(root, "resources", resourceRoot, "manifest.json");
      const resolved = path.resolve(manifestPath);
      const openMaicRoot = path.resolve(root, "resources", "open-maic");
      if (!resolved.startsWith(openMaicRoot + path.sep) || !fs.existsSync(resolved)) {
        sendJson(res, 404, { ok: false, message: "未找到音频映射。" });
        return;
      }
      const manifest = JSON.parse(fs.readFileSync(resolved, "utf8"));
      const scenes = (manifest.scenes || []).map((scene) => ({
        order: scene.order,
        title: scene.title || "",
        actions: (scene.actions || [])
          .filter((action) => action.audioRef)
          .map((action) => ({
            type: action.type || "speech",
            text: action.text || action.prompt || "",
            prompt: action.prompt || "",
            audioRef: action.audioRef
          }))
      })).filter((scene) => scene.actions.length);
      sendJson(res, 200, { ok: true, resourceRoot, scenes });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/auth/register") {
      const body = await readJsonBody(req);
      const nickname = cleanNickname(body.nickname);
      const email = cleanEmail(body.email);
      const password = String(body.password || "");
      if (!nickname && !email) {
        sendJson(res, 400, { ok: false, message: "请至少填写昵称或邮箱。", field: "identity" });
        return;
      }
      if (!isValidNickname(nickname)) {
        sendJson(res, 400, { ok: false, message: "昵称需要 2-24 个字符。", field: "nickname" });
        return;
      }
      if (email && !isValidEmail(email)) {
        sendJson(res, 400, { ok: false, message: "邮箱格式不正确。", field: "email" });
        return;
      }
      if (!isUsablePassword(password)) {
        sendJson(res, 400, { ok: false, message: "密码需要 8-72 个字符。", field: "password" });
        return;
      }
      const timestamp = nowIso();
      const nicknameNorm = normalizeIdentity(nickname);
      const emailNorm = normalizeEmail(email);
      const { nicknameOwners, emailOwners } = usersForIdentity(nicknameNorm, emailNorm);
      const ownerConflict = registrationOwnerConflict(nicknameOwners, emailOwners);
      if (ownerConflict?.message) {
        sendJson(res, 409, { ok: false, message: ownerConflict.message, field: ownerConflict.field || "identity" });
        return;
      }
      const legacyAccount = ownerConflict?.owner || null;
      const participantId = legacyAccount?.id || participantIdForIdentity(nicknameNorm, emailNorm);
      try {
        db.upsertUser(participantId, nickname, legacyAccount?.created_at || timestamp, timestamp, {
          nickname,
          nicknameNorm,
          email,
          emailNorm,
          passwordHash: hashPassword(password),
          passwordUpdatedAt: timestamp,
          profileUpdatedAt: legacyAccount?.profile_updated_at || ""
        });
      } catch (error) {
        if (sendIdentityConstraintError(res, error)) return;
        throw error;
      }
      const token = issueSession(participantId, timestamp);
      db.insertEvent({
        id: crypto.randomUUID(),
        user_id: participantId,
        type: legacyAccount ? "register_upgrade" : "register",
        payload: { nickname, hasEmail: Boolean(email) },
        created_at: timestamp
      });
      const user = db.getUser(participantId);
      sendJson(res, 200, { ok: true, participant: safePublicParticipant(user), token });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/auth/login") {
      const body = await readJsonBody(req);
      const identifier = cleanLoginIdentifier(body.identifier || body.nickname || body.email);
      const password = String(body.password || "");
      if (!identifier || !password) {
        sendJson(res, 400, { ok: false, message: "请填写昵称或邮箱，并输入密码。", field: !identifier ? "identifier" : "password" });
        return;
      }
      const authLimit = checkAuthAttemptLimit(req, identifier);
      if (!authLimit.ok) {
        sendJson(res, 429, {
          ok: false,
          message: "尝试次数过多，请稍后再试。",
          retryAfterSeconds: authLimit.retryAfterSeconds
        });
        return;
      }
      const timestamp = nowIso();
      const user = findUserByIdentifier(identifier);
      if (!user?.password_hash || !verifyPassword(password, user.password_hash)) {
        recordFailedAuthAttempt(req, identifier);
        sendJson(res, 401, { ok: false, message: "账号或密码不正确。" });
        return;
      }
      clearAuthAttemptLimit(req, identifier);
      db.upsertUser(user.id, user.nickname || "", user.created_at || timestamp, timestamp, {
        nickname: user.nickname || "",
        nicknameNorm: user.nickname_norm || normalizeIdentity(user.nickname || ""),
        email: user.email || "",
        emailNorm: user.email_norm || normalizeEmail(user.email || ""),
        passwordHash: user.password_hash || "",
        passwordUpdatedAt: user.password_updated_at || "",
        profileUpdatedAt: user.profile_updated_at || ""
      });
      const token = issueSession(user.id, timestamp);
      db.insertEvent({
        id: crypto.randomUUID(),
        user_id: user.id,
        type: "login",
        payload: { via: isValidEmail(normalizeEmail(identifier)) ? "email" : "nickname" },
        created_at: timestamp
      });
      const updated = db.getUser(user.id);
      sendJson(res, 200, { ok: true, participant: safePublicParticipant(updated), token });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/auth/profile") {
      const body = await readJsonBody(req);
      const auth = authenticate(req, body);
      if (!auth) { sendJson(res, 401, { ok: false, message: "请先登录。" }); return; }
      const nickname = cleanNickname(body.nickname);
      const email = cleanEmail(body.email);
      const currentNickname = auth.participant.nickname || "";
      const currentEmail = auth.participant.email || "";
      const noChange = nickname === currentNickname && email === currentEmail;
      if (noChange) {
        sendJson(res, 200, { ok: true, participant: safePublicParticipant(db.getUser(auth.participant.id)) });
        return;
      }
      if (auth.participant.profile_updated_at) {
        sendJson(res, 403, {
          ok: false,
          field: "profile",
          message: "账号信息只能修改一次，已不能再次修改。"
        });
        return;
      }
      if (!nickname && !email) {
        sendJson(res, 400, { ok: false, message: "昵称和邮箱至少保留一个。", field: "identity" });
        return;
      }
      if (!isValidNickname(nickname)) {
        sendJson(res, 400, { ok: false, message: "昵称需要 2-24 个字符。", field: "nickname" });
        return;
      }
      if (email && !isValidEmail(email)) {
        sendJson(res, 400, { ok: false, message: "邮箱格式不正确。", field: "email" });
        return;
      }
      const nicknameNorm = normalizeIdentity(nickname);
      const emailNorm = normalizeEmail(email);
      const conflict = profileConflict(nicknameNorm, emailNorm, auth.participant.id);
      if (conflict) {
        sendJson(res, 409, { ok: false, message: conflict.message, field: conflict.field });
        return;
      }
      const timestamp = nowIso();
      let updated = null;
      try {
        updated = db.updateUserProfile(auth.participant.id, {
          nickname,
          nicknameNorm,
          email,
          emailNorm,
          profileUpdatedAt: timestamp,
          lastSeenAt: timestamp
        });
      } catch (error) {
        if (sendIdentityConstraintError(res, error)) return;
        throw error;
      }
      if (!updated) {
        sendJson(res, 404, { ok: false, message: "账号不存在，请重新登录。" });
        return;
      }
      db.insertEvent({
        id: crypto.randomUUID(),
        user_id: auth.participant.id,
        type: "profile_update",
        payload: { hasNickname: Boolean(nickname), hasEmail: Boolean(email) },
        created_at: timestamp
      });
      sendJson(res, 200, { ok: true, participant: safePublicParticipant(updated) });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/auth/logout") {
      const body = await readJsonBody(req);
      const auth = authenticate(req, body);
      if (auth) db.revokeSession(auth.token, nowIso());
      sendJson(res, 200, { ok: true });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/auth/me") {
      const body = await readJsonBody(req);
      const auth = authenticate(req, body);
      if (!auth) { sendJson(res, 401, { ok: false, message: "请先登录。" }); return; }
      sendJson(res, 200, { ok: true, participant: safePublicParticipant(auth.participant) });
      return;
    }

    // ---- Learning Feedback ----
    if (req.method === "POST" && url.pathname === "/api/learning/feedback") {
      const body = await readJsonBody(req);
      const auth = authenticate(req, body);
      if (!auth) {
        sendJson(res, 401, { ok: false, message: "请先登录。" });
        return;
      }
      const normalized = feedback.normalizeFeedbackInput(body);
      if (!normalized.ok) {
        sendJson(res, 400, normalized);
        return;
      }
      const feedbackId = crypto.randomUUID();
      const timestamp = nowIso();
      db.insertFeedback({
        id: feedbackId,
        user_id: auth.participant.id,
        ...normalized.value,
        created_at: timestamp
      });
      db.insertEvent({
        id: crypto.randomUUID(),
        user_id: auth.participant.id,
        type: "feedback_submit",
        payload: {
          feedbackId,
          feedbackType: normalized.value.feedback_type,
          targetScope: normalized.value.target_scope,
          contentLength: normalized.value.content.length
        },
        created_at: timestamp
      });
      sendJson(res, 200, { ok: true, feedbackId, createdAt: timestamp });
      return;
    }

    // ---- Learning Events ----
    if (req.method === "POST" && url.pathname === "/api/learning/event") {
      const body = await readJsonBody(req);
      const auth = authenticate(req, body);
      if (!auth) { sendJson(res, 401, { ok: false, message: "请先登录。" }); return; }
      const eventId = crypto.randomUUID();
      const timestamp = nowIso();
      const eventType = String(body.type || "event").slice(0, 80);

      db.insertEvent({
        id: eventId,
        user_id: auth.participant.id,
        type: eventType,
        payload: body.payload || {},
        created_at: timestamp
      });

      // If it's a quiz_result, also insert into quiz_results table
      if (eventType === "quiz_result") {
        const q = body.payload || {};
        db.insertQuizResult({
          id: q.id || eventId,
          user_id: auth.participant.id,
          chapter_id: q.chapterId || "",
          chapter_label: q.chapterLabel || "",
          unit_id: q.unitId || "",
          unit_label: q.unitLabel || "",
          question_id: q.questionId || "",
          question_type: q.questionType || "",
          phase: q.phase || "",
          points: q.points || 0,
          response: typeof q.response === "string" ? q.response : JSON.stringify(q.response || ""),
          is_correct: q.isCorrect === true ? 1 : q.isCorrect === false ? 0 : -1,
          status: q.status || "",
          score: q.score || 0,
          max_score: q.maxScore || 0,
          created_at: q.timestamp || timestamp
        });
      }

      sendJson(res, 200, { ok: true, eventId });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/learning/events") {
      const body = await readJsonBody(req);
      const auth = authenticate(req, body);
      if (!auth) { sendJson(res, 401, { ok: false, message: "请先登录。" }); return; }
      const events = Array.isArray(body.events) ? body.events.slice(0, 100) : [];
      const eventIds = [];
      const timestamp = nowIso();

      events.forEach((item) => {
        const eventId = crypto.randomUUID();
        eventIds.push(eventId);
        db.insertEvent({
          id: eventId,
          user_id: auth.participant.id,
          type: String(item.type || "event").slice(0, 80),
          payload: item.payload || {},
          created_at: timestamp
        });
      });

      sendJson(res, 200, { ok: true, eventIds });
      return;
    }

    // ---- Learning Snapshot ----
    if (req.method === "GET" && url.pathname === "/api/learning/snapshot") {
      const auth = authenticate(req);
      if (!auth) { sendJson(res, 401, { ok: false, message: "请先登录。" }); return; }
      const snap = db.getLatestSnapshot(auth.participant.id);
      if (!snap) { sendJson(res, 200, { ok: true, snapshot: null }); return; }
      let data = {};
      try { data = JSON.parse(snap.data); } catch { /* use empty */ }
      sendJson(res, 200, { ok: true, snapshot: { ...data, capturedAt: snap.created_at } });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/learning/snapshot") {
      const body = await readJsonBody(req);
      const auth = authenticate(req, body);
      if (!auth) { sendJson(res, 401, { ok: false, message: "请先登录。" }); return; }
      const timestamp = nowIso();
      const snapshotData = body.snapshot || {};
      const snapshotId = crypto.randomUUID();

      db.insertSnapshot({
        id: snapshotId,
        user_id: auth.participant.id,
        reason: String(body.reason || "manual").slice(0, 80),
        data: snapshotData,
        created_at: timestamp
      });

     db.upsertUser(auth.participant.id, auth.participant.nickname, auth.participant.created_at, timestamp);
     sendJson(res, 200, { ok: true, snapshotId });
     return;
    }

    if (req.method === "POST" && url.pathname === "/api/learning/reset") {
      const body = await readJsonBody(req);
      const auth = authenticate(req, body);
      if (!auth) { sendJson(res, 401, { ok: false, message: "请先登录。" }); return; }
      const timestamp = nowIso();
      const snapshotData = body.snapshot || {};
      const snapshotId = crypto.randomUUID();

      db.clearLearningDataForUser(auth.participant.id);
      db.insertSnapshot({
        id: snapshotId,
        user_id: auth.participant.id,
        reason: "reset",
        data: snapshotData,
        created_at: timestamp
      });
      db.upsertUser(auth.participant.id, auth.participant.nickname, auth.participant.created_at, timestamp);

      sendJson(res, 200, { ok: true, snapshotId, cleared: true });
      return;
    }

    // ---- Learning Quiz Results (for cross-browser sync - authoritative source) ----
    if (req.method === "GET" && url.pathname === "/api/learning/quiz-results") {
      const auth = authenticate(req);
      if (!auth) { sendJson(res, 401, { ok: false, message: "请先登录。" }); return; }
      const results = db.getQuizResultsByUser(auth.participant.id, 500);
      sendJson(res, 200, { ok: true, data: results });
      return;
    }

    // ---- Admin: Export raw data (backward compat) ----
    if (req.method === "GET" && url.pathname === "/api/admin/export") {
      if (!checkAdmin(req)) { sendJson(res, 403, { ok: false, message: "需要管理员密码。" }); return; }
      const d = db.getDbSync();
      const users = [];
      const us = d.prepare("SELECT * FROM users");
      while (us.step()) users.push(us.getAsObject());
      us.free();

      const participants = {};
      for (const u of users) {
        const snap = db.getLatestSnapshot(u.id);
        participants[u.id] = {
          participantId: u.id, loginMode: u.password_hash ? "password" : "nickname", nickname: u.nickname || "", email: u.email || "", displayName: publicDisplayName(u),
          createdAt: u.created_at, updatedAt: u.last_seen_at, lastSeenAt: u.last_seen_at,
          stats: snap ? summaryFromData(snap.data) : {}
        };
      }
      const qrs = [];
      const qs = d.prepare("SELECT * FROM quiz_results");
      while (qs.step()) qrs.push(qs.getAsObject());
      qs.free();
      sendJson(res, 200, { ok: true, data: { version: 2, participants, quizResults: qrs } });
      return;
    }

    // ---- Admin Stats APIs ----
    if (req.method === "GET" && url.pathname === "/api/admin/stats/overview") {
      if (!checkAdmin(req)) { sendJson(res, 403, { ok: false, message: "需要管理员密码。" }); return; }
      const dates = getDateRange(url);
      sendJson(res, 200, { ok: true, data: db.statsOverview(dates) });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/admin/stats/feedback") {
      if (!checkAdmin(req)) {
        sendJson(res, 403, { ok: false, message: "需要管理员密码。" });
        return;
      }
      const dates = getDateRange(url);
      sendJson(res, 200, {
        ok: true,
        data: db.feedbackDashboard({
          ...dates,
          feedbackType: url.searchParams.get("type") || "",
          targetScope: url.searchParams.get("scope") || "",
          query: url.searchParams.get("q") || "",
          limit: 1000
        })
      });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/admin/stats/chapter-accuracy") {
      if (!checkAdmin(req)) { sendJson(res, 403, { ok: false, message: "需要管理员密码。" }); return; }
      const dates = getDateRange(url);
      sendJson(res, 200, { ok: true, data: db.chapterAccuracy(dates) });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/admin/stats/question-errors") {
      if (!checkAdmin(req)) { sendJson(res, 403, { ok: false, message: "需要管理员密码。" }); return; }
      const dates = getDateRange(url);
      sendJson(res, 200, { ok: true, data: db.questionErrors(dates) });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/admin/stats/user-progress") {
      if (!checkAdmin(req)) { sendJson(res, 403, { ok: false, message: "需要管理员密码。" }); return; }
      const dates = getDateRange(url);
      sendJson(res, 200, { ok: true, data: db.userProgress(dates) });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/admin/stats/daily-activity") {
      if (!checkAdmin(req)) { sendJson(res, 403, { ok: false, message: "需要管理员密码。" }); return; }
      const dates = getDateRange(url);
      sendJson(res, 200, { ok: true, data: db.dailyActivity(30, dates) });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/admin/stats/phase-comparison") {
      if (!checkAdmin(req)) { sendJson(res, 403, { ok: false, message: "需要管理员密码。" }); return; }
      const dates = getDateRange(url);
      sendJson(res, 200, { ok: true, data: db.phaseComparison(dates) });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/admin/stats/user-detail") {
      if (!checkAdmin(req)) { sendJson(res, 403, { ok: false, message: "需要管理员密码。" }); return; }
      const userId = url.searchParams.get("userId") || "";
      if (!userId) { sendJson(res, 400, { ok: false, message: "userId required." }); return; }
      const dates = getDateRange(url);
      const detail = db.userDetail(userId, dates);
      if (!detail) { sendJson(res, 404, { ok: false, message: "User not found." }); return; }
      sendJson(res, 200, { ok: true, data: detail });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/admin/stats/users") {
      if (!checkAdmin(req)) { sendJson(res, 403, { ok: false, message: "需要管理员密码。" }); return; }
      sendJson(res, 200, { ok: true, data: db.listUsers() });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/admin/stats/question-type-accuracy") {
      if (!checkAdmin(req)) { sendJson(res, 403, { ok: false, message: "需要管理员密码。" }); return; }
      const dates = getDateRange(url);
      sendJson(res, 200, { ok: true, data: db.questionTypeAccuracy(dates) });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/admin/stats/score-distribution") {
      if (!checkAdmin(req)) { sendJson(res, 403, { ok: false, message: "需要管理员密码。" }); return; }
      const dates = getDateRange(url);
      sendJson(res, 200, { ok: true, data: db.scoreDistribution(dates) });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/admin/stats/hourly-activity") {
      if (!checkAdmin(req)) { sendJson(res, 403, { ok: false, message: "需要管理员密码。" }); return; }
      const dates = getDateRange(url);
      sendJson(res, 200, { ok: true, data: db.hourlyActivity(30, dates) });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/admin/stats/short-answer-responses") {
      if (!checkAdmin(req)) { sendJson(res, 403, { ok: false, message: "需要管理员密码。" }); return; }
      const dates = getDateRange(url);
      sendJson(res, 200, { ok: true, data: db.shortAnswerResponses(dates) });
      return;
    }
    
    // ---- Admin: Interactions tracking ----
    if (req.method === "GET" && url.pathname === "/api/admin/stats/interactions") {
      if (!checkAdmin(req)) { sendJson(res, 403, { ok: false, message: "需要管理员密码。" }); return; }
      const dates = getDateRange(url);
      const limit = Math.max(1, Math.min(Number(url.searchParams.get("limit") || 100), 1000));
      const offset = Math.max(0, Number(url.searchParams.get("offset") || 0));
      const userId = url.searchParams.get("userId") || "";
      const data = db.getEventsByType("interaction", { limit, offset, userId, dates });
      sendJson(res, 200, { ok: true, data });
      return;
    }

    // ---- Learning KG plan + agentic narration ----
    if (req.method === "GET" && url.pathname === "/api/learning/kg") {
      sendJson(res, 200, { ok: true, kg: kg.getKg() });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/learning/grade") {
      const body = await readJsonBody(req);
      const auth = authenticate(req, body);
      if (!auth) { sendJson(res, 401, { ok: false, message: "请先登录。" }); return; }
      const questions = Array.isArray(body.questions) ? body.questions.slice(0, 50) : [];
      try {
        const results = await orchestrator.gradeOnly(questions);
        persistGradingResults(auth.participant, results);
        sendJson(res, 200, { ok: true, results });
      } catch (err) {
        sendJson(res, 500, { ok: false, message: err.message });
      }
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/learning/kg/plan") {
      const body = await readJsonBody(req);
      const auth = authenticate(req, body);
      if (!auth) { sendJson(res, 401, { ok: false, message: "请先登录。" }); return; }
      const chapterId = String(body.chapterId || "").trim();
      const currentUnitId = String(body.currentUnitId || "").trim();
      if (!chapterId) { sendJson(res, 400, { ok: false, message: "chapterId required." }); return; }
      const sourceResults = Array.isArray(body.quizResults)
        ? body.quizResults.slice(0, 500)
        : db.getQuizResultsByUser(auth.participant.id, 200);
      persistClientQuizResults(auth.participant, sourceResults);
      const filtered = sourceResults.filter((row) => {
        const unitId = row.unit_id || row.unitId || "";
        const cid = row.chapter_id || row.chapterId || unitId.split("-scene-")[0];
        return cid === chapterId;
      });
      try {
        // Fetch recent interaction events from DB (client queue is flushed and cleared)
        const recentEvents = db.interactionRows({ userId: auth.participant.id }, 200)
          .map(row => { try { return typeof row.payload === "string" ? JSON.parse(row.payload) : row.payload; } catch { return {}; } })
          .slice(-80);
        const result = await orchestrator.orchestrate({
          chapterId, currentUnitId, quizResults: filtered,
          quizQuestions: Array.isArray(body.quizQuestions) ? body.quizQuestions : [],
          interactionEvidence: body.interactionEvidence && typeof body.interactionEvidence === "object" ? body.interactionEvidence : null,
          interactionEvents: recentEvents,
          completedUnitIds: Array.isArray(body.completedUnitIds) ? body.completedUnitIds.slice(0, 500) : [],
          studentName: auth.participant.nickname || "ͬѧ"
        });
        persistGradingResults(auth.participant, result.gradingResults);
        const decisionId = crypto.randomUUID();
        const decisionCreatedAt = nowIso();
        db.insertAgentDecision({
          id: decisionId, user_id: auth.participant.id, agent_type: "orchestrator",
          decision_type: "plan", input_summary: { chapterId, currentUnitId },
          output_summary: { action: result.assessment?.suggestedAction, qa: result.qa, planner: result.planner, interactionEvidence: result.interactionEvidence },
          confidence: result.assessment?.confidenceLevel || 0, llm_provider: result.provider,
          latency_ms: result.latencyMs || 0, created_at: decisionCreatedAt
        });
        db.insertInteractionEvidenceBatch(auth.participant.id, decisionId, chapterId, result.interactionEvidence, decisionCreatedAt);
        sendJson(res, 200, { ok: true, decisionId, decisionCreatedAt, plan: result.plan, narration: result.narration, provider: result.provider, gradingResults: result.gradingResults, assessment: result.assessment, analytics: result.analytics, planner: result.planner, interactionEvidence: result.interactionEvidence });
      } catch (err) {
        const summary = kg.summariseQuizResults(filtered);
        const planResult = coach.plan({ chapterId, currentUnitId, quizSummary: summary });
        let narration = "", provider = "fallback";
        try { const out = await coach.explain(planResult, { studentName: auth.participant.nickname || "同学" }); narration = out.narration; provider = out.provider; } catch { narration = "（AI 助教暂时离线，下面是基于规则的建议。）"; }
        const fallbackEvidence = body.interactionEvidence && typeof body.interactionEvidence === "object" ? body.interactionEvidence : null;
        let decisionId = "";
        let decisionCreatedAt = "";
        if (fallbackEvidence) {
          decisionId = crypto.randomUUID();
          decisionCreatedAt = nowIso();
          db.insertAgentDecision({
            id: decisionId, user_id: auth.participant.id, agent_type: "orchestrator",
            decision_type: "plan_fallback", input_summary: { chapterId, currentUnitId },
            output_summary: { action: planResult?.suggestedAction || "", error: err.message, interactionEvidence: fallbackEvidence },
            confidence: 0, llm_provider: provider, latency_ms: 0, created_at: decisionCreatedAt
          });
          db.insertInteractionEvidenceBatch(auth.participant.id, decisionId, chapterId, fallbackEvidence, decisionCreatedAt);
        }
        sendJson(res, 200, { ok: true, decisionId, decisionCreatedAt, plan: planResult, narration, provider });
      }
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/admin/stats/interaction-dashboard") {
      if (!checkAdmin(req)) { sendJson(res, 403, { ok: false, message: "需要管理员密码。" }); return; }
      const dates = getDateRange(url);
      dates.userId = url.searchParams.get("userId") || "";
      sendJson(res, 200, { ok: true, data: db.interactionDashboard(dates) });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/admin/stats/agentic-decision-trace") {
      if (!checkAdmin(req)) { sendJson(res, 403, { ok: false, message: "需要管理员密码。" }); return; }
      const dates = getDateRange(url);
      dates.userId = url.searchParams.get("userId") || "";
      sendJson(res, 200, { ok: true, data: db.agenticDecisionTrace(dates) });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/admin/stats/interaction-evidence-snapshots") {
      if (!checkAdmin(req)) { sendJson(res, 403, { ok: false, message: "需要管理员密码。" }); return; }
      const dates = getDateRange(url);
      dates.userId = url.searchParams.get("userId") || "";
      sendJson(res, 200, { ok: true, data: db.interactionEvidenceSnapshots(dates) });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/admin/stats/interaction-summary") {
      if (!checkAdmin(req)) { sendJson(res, 403, { ok: false, message: "需要管理员密码。" }); return; }
      const dates = getDateRange(url);
      dates.userId = url.searchParams.get("userId") || "";
      sendJson(res, 200, { ok: true, data: db.interactionSummary(dates) });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/admin/stats/unit-engagement") {
      if (!checkAdmin(req)) { sendJson(res, 403, { ok: false, message: "需要管理员密码。" }); return; }
      const dates = getDateRange(url);
      dates.userId = url.searchParams.get("userId") || "";
      sendJson(res, 200, { ok: true, data: db.unitEngagement(dates) });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/admin/stats/skip-repeat") {
      if (!checkAdmin(req)) { sendJson(res, 403, { ok: false, message: "需要管理员密码。" }); return; }
      const dates = getDateRange(url);
      dates.userId = url.searchParams.get("userId") || "";
      sendJson(res, 200, { ok: true, data: db.skipRepeatStats(dates) });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/admin/stats/parameter-changes") {
      if (!checkAdmin(req)) { sendJson(res, 403, { ok: false, message: "需要管理员密码。" }); return; }
      const dates = getDateRange(url);
      dates.userId = url.searchParams.get("userId") || "";
      sendJson(res, 200, { ok: true, data: db.parameterChangeStats(dates) });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/admin/stats/path-analysis") {
      if (!checkAdmin(req)) { sendJson(res, 403, { ok: false, message: "需要管理员密码。" }); return; }
      const dates = getDateRange(url);
      dates.userId = url.searchParams.get("userId") || "";
      sendJson(res, 200, { ok: true, data: db.pathAnalysis(dates) });
      return;
    }

    sendJson(res, 404, { ok: false, message: "接口不存在。" });
  } catch (error) {
    console.error("API error:", error);
    const status = error.message === "Request body is too large" ? 413
      : error.message === "Invalid JSON body" ? 400
      : 500;
    const message = status === 500 ? "服务器内部错误。"
      : error.message === "Request body is too large" ? "请求内容过大。"
        : error.message === "Invalid JSON body" ? "请求格式不正确。"
          : error.message;
    sendJson(res, status, { ok: false, message });
  }
}

const server = http.createServer((req, res) => {
  // Security headers (defense-in-depth)
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");

  // Strip sub-path prefix when behind reverse proxy at e.g. /calculus_quest/
  const BASE_PATH = process.env.BASE_PATH || "";
  let rawUrl = req.url || "/";
  if (BASE_PATH && rawUrl.startsWith(BASE_PATH)) {
    const rest = rawUrl.slice(BASE_PATH.length);
    // 不带尾斜杠访问 BASE_PATH 时补斜杠重定向，否则页面里的相对路径资源会丢失前缀
    if (rest === "" || rest.startsWith("?")) {
      res.writeHead(301, { Location: BASE_PATH + "/" + rest });
      res.end();
      return;
    }
    rawUrl = rest || "/";
  }
  const url = new URL(rawUrl, `http://${req.headers.host || "localhost"}`);

  if (url.pathname.startsWith("/api/")) {
    handleApi(req, res, url);
    return;
  }

  const filePath = safeStaticPath(url.pathname);
  if (!filePath) {
    send(res, 403, "禁止访问");
    return;
  }
  if (isBlockedStaticResource(filePath)) {
    send(res, 410, "Full manifests are disabled. Use the lightweight index.json files.");
    return;
  }

  fs.stat(filePath, (statError, stat) => {
    if (statError || !stat.isFile()) {
      send(res, 404, "Not found");
      return;
    }

    const type = types[path.extname(filePath).toLowerCase()] || "application/octet-stream";
    if (stat.size > maxBufferedStaticBytes || req.method === "HEAD") {
      streamStaticFile(req, res, filePath, type, url, stat);
      return;
    }

    fs.readFile(filePath, (error, data) => {
      if (error) {
        send(res, 404, "Not found");
        return;
      }

      if (shouldCompress(req, type, stat.size)) {
        const cacheKey = gzipCacheKey(filePath, data);
        const cached = gzipCache.get(cacheKey);
        if (cached) {
          send(res, 200, cached, type, staticHeaders(filePath, url, {
            "Content-Encoding": "gzip",
            Vary: "Accept-Encoding"
          }));
          return;
        }
        zlib.gzip(data, (gzipError, compressed) => {
          if (gzipError) {
            send(res, 200, data, type, staticHeaders(filePath, url));
            return;
          }
          rememberGzip(cacheKey, compressed);
          send(res, 200, compressed, type, staticHeaders(filePath, url, {
            "Content-Encoding": "gzip",
            Vary: "Accept-Encoding"
          }));
        });
        return;
      }
      send(res, 200, data, type, staticHeaders(filePath, url));
    });
  });
});

function shutdown(signal) {
  console.log(`${signal} received. Saving database before shutdown...`);
  try {
    db.saveNow();
  } catch (error) {
    console.error("Final database save failed:", error.message);
  }
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
}

process.once("SIGINT", () => shutdown("SIGINT"));
process.once("SIGTERM", () => shutdown("SIGTERM"));

// Initialize database on startup, then start server
db.getDb().then(() => {
 console.log("Database initialized.");
  // Migration: fix existing is_correct bug where pending short answers (-1) were stored as 1
 try {
    db.getDbSync().run(
     "UPDATE quiz_results SET is_correct = -1 WHERE question_type = 'short_answer' AND is_correct = 1"
   );
    const fixedCount = db.getDbSync().getRowsModified();
    if (fixedCount > 0) {
     db.saveNow();
      console.log(`Data migration: fixed ${fixedCount} short answer is_correct values.`);
   }
 } catch (e) {
   console.warn("Migration skipped:", e.message);
 }
 server.listen(port, host, () => {
    console.log(`Calculus Quest running at http://${host}:${port}/`);
    console.log(`Admin dashboard: http://${host}:${port}/admin.html`);
  });
}).catch((err) => {
  console.error("Failed to initialize database:", err);
  process.exit(1);
});
