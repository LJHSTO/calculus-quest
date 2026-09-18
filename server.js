const crypto = require("crypto");
const fs = require("fs");
const http = require("http");
const net = require("net");
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

const errorMonitoring = require("./lib/error-monitoring").init();
const db = require("./db");
const courseAssessment = require("./lib/course-assessment");
const learningAssistant = require("./lib/learning-assistant");
const proactivePolicy = require("./lib/proactive-policy");
const outcomeRegistry = require("./lib/proactive-outcomes/functions-limits");
const proactiveOutcomes = outcomeRegistry.forVersion(
  process.env.PROACTIVE_OUTCOME_INSTRUMENT_VERSION || outcomeRegistry.version
);
if (!proactiveOutcomes) throw new Error("未知研究测量版本，请检查 PROACTIVE_OUTCOME_INSTRUMENT_VERSION。");
const llm = require("./lib/llm");
const kg = require("./lib/kg");
const coach = require("./lib/agentic-coach");
const orchestrator = require("./lib/agent-orchestrator");
const gradingRegrade = require("./lib/grading-regrade");
const researchAnalysis = require("./lib/research-analysis-export");
const quizReconciliation = require("./lib/quiz-reconciliation");
const feedback = require("./lib/feedback");
const systemAnnouncementApi = require("./lib/system-announcement-api");
const root = process.cwd();
const proactiveStudyConfig = proactivePolicy.configFromEnv();
const proactiveGlobalPreferenceControlEnabled = ["1", "true", "yes", "on"].includes(
  String(process.env.PROACTIVE_GLOBAL_PREFERENCE_CONTROL || "").trim().toLowerCase()
);
const configuredRetentionDelayHours = Number(
  process.env.PROACTIVE_RETENTION_DELAY_HOURS
);
const proactiveRetentionDelayHours = Number.isFinite(
  configuredRetentionDelayHours
)
  ? Math.max(proactiveOutcomes.version === outcomeRegistry.version || proactiveOutcomes.version.startsWith("functions-limits-retention-") ? 72 : 0,
      Math.min(24 * 365, configuredRetentionDelayHours))
  : 24 * 3;
const configuredRetentionCloseHours = Number(
  process.env.PROACTIVE_RETENTION_CLOSE_HOURS
);
// Zero or an omitted deadline keeps retention available after its unlock time.
const proactiveRetentionCloseHours = Number.isFinite(configuredRetentionCloseHours)
  && configuredRetentionCloseHours > 0 ? Math.max(
    proactiveRetentionDelayHours,
    Math.min(24 * 365, configuredRetentionCloseHours)
  ) : null;
const proactiveRetentionReminderHours = Array.from(new Set(
  String(process.env.PROACTIVE_RETENTION_REMINDER_HOURS || "72,96")
    .split(",")
    .map((value) => Number(value.trim()))
    .filter((value) => (
      Number.isFinite(value)
      && value >= proactiveRetentionDelayHours
      && (proactiveRetentionCloseHours === null || value < proactiveRetentionCloseHours)
    ))
    .map((value) => Math.round(value * 1000) / 1000)
)).sort((left, right) => left - right);
let proactiveProtocolDefinition = null;
let proactiveProtocolFingerprint = "";
let proactiveProtocolSnapshot = null;
let coursewareLearningEvidenceScript = "";
let coursewareBridgeScript = "";
try {
  coursewareLearningEvidenceScript = fs.readFileSync(
    path.join(root, "app", "main", "courseware-learning-evidence.js"),
    "utf8"
  );
} catch (error) {
  console.warn("Courseware learning evidence load skipped:", error.message);
}
try {
  coursewareBridgeScript = fs.readFileSync(
    path.join(root, "app", "main", "courseware-bridge.js"),
    "utf8"
  );
} catch (error) {
  console.warn("Courseware context bridge load skipped:", error.message);
}
const learningRoutePath = path.join(root, "data", "multi-scene-learning-route.json");
const learningRouteApiPaths = new Set([
  "/api/course/multi-scene-learning-route",
  // Cached clients from the previous release may still request this alias.
  "/api/course/openmaic-v14-route"
]);
const flowTestRouteApiPath = "/api/course/flow-test-route";
let learningRoute = null;
let publicLearningRouteJson = "";
let flowTestRouteJson = "";
let assessmentIndex = new Map();
let courseAssessmentFingerprint = "";
let assistantContextIndex = { routeVersion: "", units: new Map(), questions: new Map() };
try {
  learningRoute = JSON.parse(fs.readFileSync(learningRoutePath, "utf8"));
  courseAssessmentFingerprint = courseAssessment.assessmentFingerprint(learningRoute);
  const publicLearningRoute = proactivePolicy.projectRoute(
    learningRoute,
    proactiveStudyConfig
  );
  publicLearningRouteJson = JSON.stringify({
    ...courseAssessment.buildPublicLearningRoute(publicLearningRoute),
    courseAssessmentFingerprint
  });
  flowTestRouteJson = JSON.stringify(learningRoute);
  assessmentIndex = courseAssessment.buildAssessmentIndex(learningRoute);
  assistantContextIndex = learningAssistant.buildCourseContextIndex(learningRoute);
} catch (error) {
  console.warn("Multi-scene learning route load skipped:", error.message);
}
function protocolSourceDigest(relativePath) {
  return crypto
    .createHash("sha256")
    .update(fs.readFileSync(path.join(root, relativePath)))
    .digest("hex");
}

const proactiveStoppingRules = Object.freeze({
  advisoryOnly: true,
  protectedAssessmentDisplays: 0,
  nonDisplayArmDisplays: 0,
  postWithdrawalDisplays: 0,
  optOutDisplays: 0,
  incompleteEvidenceChains: 0,
  repeatDisplayWindowMs: 2 * 60 * 1000,
  unresolvedOfferThreshold: 10,
  unresolvedOfferAgeMs: 30 * 60 * 1000,
  balancedAssignmentMaximumGap: 1
});

{
  const {
    mode: _runtimeMode,
    assignmentReady: _assignmentReady,
    activationReady: _activationReady,
    ...frozenPolicy
  } = proactivePolicy.adminConfig(proactiveStudyConfig);
  const modelRuntime = llm.runtimeInfo();
  const gradingRuntime = gradingRuntimeInfo();
  proactiveProtocolDefinition = {
    schemaVersion: 1,
    experimentId: proactiveStudyConfig.experimentId,
    chapterId: proactiveStudyConfig.chapterId,
    policy: frozenPolicy,
    assignmentSaltDigest: crypto
      .createHash("sha256")
      .update(proactiveStudyConfig.assignmentSalt)
      .digest("hex"),
    decisionTtlMs: proactiveStudyConfig.decisionTtlMs,
    courseRouteVersion: learningRoute?.versionId || "",
    courseRouteDigest: protocolSourceDigest("data/multi-scene-learning-route.json"),
    courseAssessmentFingerprint,
    courseAssessmentVersion: learningRoute?.chapters?.find(
      (chapter) => chapter.id === proactiveStudyConfig.chapterId
    )?.assessmentRevision?.version || "",
    outcomeInstrumentVersion: proactiveOutcomes.version,
    verificationInstrumentVersion: proactivePolicy.adapterForChapter(proactiveStudyConfig.chapterId)?.verificationVersion || "",
    outcomeFigureDigests: Object.fromEntries(proactiveOutcomes.stageIds.flatMap((stageId) => (
      proactiveOutcomes.publicStage(stageId).items.flatMap((item) => (
        item.figure ? [[item.figure.src, protocolSourceDigest(item.figure.src)]] : []
      ))
    ))),
    retentionDelayHours: proactiveRetentionDelayHours,
    retentionCloseHours: proactiveRetentionCloseHours,
    retentionReminderHours: proactiveRetentionReminderHours,
    stoppingRules: proactiveStoppingRules,
    measurementProtection: {
      agentAssistanceAllowed: false,
      stages: ["pre", "post", ...proactiveOutcomes.stageIds],
      immediateFeedback: false
    },
    studentAutonomy: {
      globalPreferenceControl: proactiveGlobalPreferenceControlEnabled,
      scopeMuteAndRestore: true,
      snooze: true,
      alternativeHelp: true,
      studyWithdrawal: true
    },
    modelRuntime: {
      provider: modelRuntime.provider || "",
      liveConfigured: modelRuntime.liveConfigured === true,
      model: modelRuntime.model || "",
      wireApi: modelRuntime.wireApi || ""
    },
    modelRoles: {
      assistantRequestedModel: process.env.LEARNING_ASSISTANT_MODEL || modelRuntime.model || "",
      coachRequestedModel: process.env.COACH_NARRATION_MODEL || modelRuntime.model || "",
      assessmentRequestedModel: process.env.ASSESSMENT_MODEL || modelRuntime.model || "",
      assessmentEnabled: String(process.env.ASSESSMENT_LLM_ENABLED || "").trim().toLowerCase() === "true",
      coachNarrationEnabled: String(process.env.COACH_NARRATION_LLM_ENABLED || "").trim().toLowerCase() === "true",
      grading: {
        provider: gradingRuntime.provider,
        requestedModel: gradingRuntime.model,
        wireApi: gradingRuntime.wireApi,
        liveConfigured: gradingRuntime.liveConfigured
      }
    },
    sourceDigests: {
      policyKernel: protocolSourceDigest("lib/proactive-policy/index.js"),
      lifecycle: protocolSourceDigest("lib/proactive-policy/lifecycle.js"),
      studentRenderer: protocolSourceDigest("app/main/knowledge-assistant.js"),
      studentSignalClient: protocolSourceDigest("app/main/proactive-learning.js"),
      reactiveAssistant: protocolSourceDigest("lib/learning-assistant.js"),
      pathCoach: protocolSourceDigest("lib/agentic-coach.js"),
      gradingAgent: protocolSourceDigest("lib/agents/grading.js"),
      assessmentAgent: protocolSourceDigest("lib/agents/assessment.js"),
      functionsLimitsAssessment: protocolSourceDigest("lib/assessments/functions-limits-r2.js"),
      functionsLimitsAssessmentArchive: protocolSourceDigest("lib/assessments/functions-limits-r1.js"),
      functionsLimitsAdapter: protocolSourceDigest("lib/proactive-policy/adapters/functions-limits-r2.js"),
      functionsLimitsAdapterArchive: protocolSourceDigest("lib/proactive-policy/adapters/functions-limits.js"),
      functionsLimitsOutcomes: protocolSourceDigest("lib/proactive-outcomes/functions-limits.js"),
      functionsLimitsRetention: protocolSourceDigest("lib/assessments/functions-limits-retention-r3.js"),
      functionsLimitsRetentionArchive: protocolSourceDigest("lib/assessments/functions-limits-retention-r2.js"),
      textbookReadings: protocolSourceDigest("app/main/textbook-reading.js"),
      functionsLimitsTasks: protocolSourceDigest("data/functions-limits-courseware-contracts.json"),
      modelTransport: protocolSourceDigest("lib/llm.js")
    }
  };
  proactiveProtocolFingerprint = crypto
    .createHash("sha256")
    .update(JSON.stringify(proactiveProtocolDefinition))
    .digest("hex");
}

function freezeProactiveProtocol() {
  const frozenAt = new Date().toISOString();
  const protocolResult = db.ensureProactiveProtocolSnapshot({
    experiment_id: proactiveStudyConfig.experimentId,
    chapter_id: proactiveStudyConfig.chapterId,
    protocol_fingerprint: proactiveProtocolFingerprint,
    protocol: proactiveProtocolDefinition,
    created_at: frozenAt
  });
  if (!protocolResult.ok) {
    const error = new Error(
      `实验 ${proactiveStudyConfig.experimentId} 的协议指纹与已冻结快照不一致；请恢复原配置，或使用新的 PROACTIVE_EXPERIMENT_ID。`
    );
    error.code = "PROACTIVE_PROTOCOL_FINGERPRINT_MISMATCH";
    throw error;
  }
  proactiveProtocolSnapshot = protocolResult.snapshot;
  db.ensureProactiveExperimentRuntime({
    experimentId: proactiveStudyConfig.experimentId,
    updatedAt: frozenAt
  });
  db.saveNow();
}
const coursewareFeedbackTargetLookup = feedback.buildCoursewareFeedbackTargetLookup(
  learningRoute,
  kg.nodeById
);
const packageInfo = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const port = Number(process.argv[2] || process.env.PORT || 8765);
const host = process.env.HOST || "127.0.0.1";

function isLoopbackHost(value = "") {
  let normalized = String(value || "").trim().toLowerCase();
  if (normalized.startsWith("[") && normalized.includes("]")) {
    normalized = normalized.slice(1, normalized.indexOf("]"));
  }
  if (normalized.startsWith("::ffff:")) normalized = normalized.slice(7);
  if (normalized === "localhost" || normalized === "::1") return true;
  return net.isIPv4(normalized) && normalized.startsWith("127.");
}

function requestHostname(req) {
  const header = String(req.headers.host || "").trim();
  if (!header) return "";
  try {
    return new URL(`http://${header}`).hostname;
  } catch {
    return "";
  }
}

const localAdminAuthBypassEnabled = (
  !["0", "false", "no", "off"].includes(
    String(process.env.LOCAL_ADMIN_AUTH_BYPASS ?? "true").trim().toLowerCase()
  )
  && isLoopbackHost(host)
);

function isLoopbackAdminRequest(req) {
  if (!localAdminAuthBypassEnabled) return false;
  const forwardedFor = String(req.headers["x-forwarded-for"] || "")
    .split(",")[0]
    .trim();
  if (forwardedFor && !isLoopbackHost(forwardedFor)) return false;
  return isLoopbackHost(req.socket?.remoteAddress)
    && isLoopbackHost(requestHostname(req));
}

const configuredBasePath = String(process.env.BASE_PATH || "").trim();
const gradingRegradeInFlightIds = new Set();
const normalizedBasePath = configuredBasePath.replace(/^\/+|\/+$/g, "");
const basePath = normalizedBasePath ? `/${normalizedBasePath}` : "";
const researchConfig = {
  appVersion: String(process.env.APP_VERSION || packageInfo.version || "").slice(0, 80),
  experimentId: String(process.env.EXPERIMENT_ID || "").slice(0, 120),
  condition: String(process.env.EXPERIMENT_CONDITION || "").slice(0, 120),
  cohort: String(process.env.EXPERIMENT_COHORT || "").slice(0, 120),
  proactive: proactivePolicy.publicConfig(proactiveStudyConfig)
};
const maxBodyBytes = 1024 * 1024;
const maxBufferedStaticBytes = 512 * 1024;
const maxGzipBytes = 4 * 1024 * 1024;
const gzipCache = new Map();
const maxGzipCacheEntries = 32;
const sessionTtlMs = 30 * 24 * 60 * 60 * 1000;
const authAttemptWindowMs = 15 * 60 * 1000;
const maxFailedAuthAttempts = 8;
const authAttemptMap = new Map();
const assistantRateLimitMap = new Map();
const assistantInterventionRegistry = new Map();
const assistantRateLimitWindowMs = 60 * 1000;
const assistantRateLimitMax = 20;
const assistantInterventionTtlMs = 15 * 60 * 1000;
const proactiveGlobalScopeKey = "__chapter__";
const proactiveStudentPreferences = new Set(["standard", "reduced", "off"]);
const proactiveNaturalBoundaryEventTypes = new Set([
  "parameter_commit",
  "interactive_submit",
  "courseware_attempt_submitted",
  "courseware_interaction_complete",
  "courseware_formative_check_submitted",
  "courseware_challenge_result",
  "courseware_independent_check_completed"
]);
const assistantInterventionRegistryLimit = 5000;
const assistantHistoryMessageLimit = 60;
const assistantConversationTurnLimit = 30;
const assistantDailyQuotaLimit = Math.max(
  1,
  Math.min(10000, Number(process.env.LEARNING_ASSISTANT_DAILY_QUOTA || 30) || 30)
);
const assistantDailyInterventionLimit = Math.max(
  0,
  Math.min(100, Number(process.env.LEARNING_ASSISTANT_DAILY_INTERVENTIONS || 10) || 10)
);
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
  ".mp4": "video/mp4",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf"
};
const publicRootFiles = new Set([
  "index.html",
  "admin.html",
  "flow-test.html",
  "styles.css",
  "favicon.ico"
]);
const publicFlowTestFiles = new Set([
  "app/flow-test/flow-test.css",
  "app/flow-test/flow-test.js",
  "data/knowledge-graph.json"
]);
const learningRuntimeHtml = require("./lib/learning-runtime").loadLearningRuntime(root);
const coursewareModules = require("./lib/courseware-module-assets").loadCoursewareModules(root);
const publicOpenMaicRendererFiles = new Set([
  "assets/openmaic-classroom/frame.html",
  "assets/openmaic-classroom/renderer.js",
  "assets/openmaic-classroom/renderer.css",
  "assets/openmaic-classroom/renderer.js.LEGAL.txt",
  "assets/openmaic-classroom/highlighter.js",
  "assets/openmaic-classroom/highlighter.js.LEGAL.txt"
]);
const publicLearningRouteStaticPath = "/data/multi-scene-learning-route.json";
const publicLibFiles = new Set([
  "lib/katex.min.css",
  "lib/katex.min.js",
  "lib/question-math.js",
  "lib/chart.umd.min.js",
  "lib/interaction-policy.js",
  "lib/active-time-policy.js",
  "lib/quiz-question-order.js"
]);
const publicOutcomeFigureFiles = new Set([
  outcomeRegistry
].filter(Boolean).flatMap((instrument) => instrument.stageIds.flatMap((stageId) => (
  instrument.publicStage(stageId).items.flatMap((item) => item.figure ? [item.figure.src] : [])
))));
const publicResourceExtensions = new Set([
  ".html",
  ".htm",
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".svg",
  ".webp",
  ".mp3",
  ".wav",
  ".m4a",
  ".mp4"
]);
const publicAssetExtensions = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".svg",
  ".webp",
  ".ico"
]);
const publicFontExtensions = new Set([".woff", ".woff2", ".ttf"]);

function send(res, status, body, type = "text/plain; charset=utf-8", extraHeaders = {}) {
  if (res.headersSent) {
    res.destroy();
    return;
  }
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

function acceptsGzip(req) {
  return String(req.headers["accept-encoding"] || "").split(",").some((entry) => {
    const [encoding, ...parameters] = entry.trim().split(";");
    const quality = parameters.map((part) => part.trim()).find((part) => part.startsWith("q="));
    return encoding === "gzip" && (!quality || Number(quality.slice(2)) > 0);
  });
}

function shouldCompress(req, type, size) {
  if (!/\btext\/|javascript|json|svg|xml/.test(type)) return false;
  if (!acceptsGzip(req)) return false;
  return size > 1024 && size <= maxGzipBytes;
}

let compressedPublicLearningRoute;
function sendPublicLearningRoute(req, res) {
  const compressed = acceptsGzip(req);
  if (compressed && !compressedPublicLearningRoute) {
    compressedPublicLearningRoute = zlib.gzipSync(publicLearningRouteJson);
  }
  const body = compressed ? compressedPublicLearningRoute : publicLearningRouteJson;
  const headers = {
    "Cache-Control": "no-store, max-age=0, no-transform",
    "Content-Length": String(Buffer.byteLength(body)),
    Vary: "Accept-Encoding",
    ...(compressed ? { "Content-Encoding": "gzip" } : {})
  };
  send(res, 200, req.method === "HEAD" ? "" : body, "application/json; charset=utf-8", headers);
}

function cacheControlFor(filePath, url) {
  const relative = path.relative(root, filePath).replaceAll(path.sep, "/");
  const ext = path.extname(filePath).toLowerCase();
  if (coursewareModules.files.has(relative)) return "public, max-age=604800, immutable";
  if (
    relative === "index.html"
    || relative === "admin.html"
    || relative === "flow-test.html"
    || relative === "assets/openmaic-classroom/frame.html"
    || publicFlowTestFiles.has(relative)
  ) return "no-store, max-age=0, no-transform";
  if (
    relative.startsWith("resources/open-maic/")
    && (ext === ".html" || ext === ".htm")
    && url?.searchParams.has("cqContextBridge")
  ) return "no-store, max-age=0, no-transform";
  // Versioned assets (cache-busted with ?v= param) can be cached aggressively.
  if (url && url.searchParams.has("v") && (ext === ".js" || ext === ".css")) return "public, max-age=604800, immutable";
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
  const relative = path.relative(root, filePath).replaceAll(path.sep, "/");
  if (relative.startsWith("lib/fonts/") && publicFontExtensions.has(path.extname(filePath).toLowerCase())) {
    headers["Access-Control-Allow-Origin"] = "*";
  }
  if (coursewareModules.files.has(relative)) headers["Access-Control-Allow-Origin"] = "*";
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
  return /^resources\/open-maic\/.+\/manifest\.json$/.test(relative);
}

function isCoursewareHtml(filePath) {
  if (
    (!coursewareLearningEvidenceScript && !coursewareBridgeScript)
    || path.extname(filePath).toLowerCase() !== ".html"
  ) return false;
  const relative = path.relative(root, filePath).replaceAll(path.sep, "/");
  return /^resources\/open-maic\/.+\.html$/i.test(relative);
}

const rewriteCoursewareFonts = require("./lib/courseware-font-assets").createCoursewareFontRewriter(root);

function injectCoursewareBridge(data, filePath) {
  if (!coursewareLearningEvidenceScript && !coursewareBridgeScript) return data;
  const original = Buffer.isBuffer(data) ? data.toString("utf8") : String(data || "");
  const source = coursewareModules.rewrite(rewriteCoursewareFonts(original, filePath), filePath);
  if (
    /data-openmaic-learning-evidence-runtime/i.test(source)
    || /data-cq-context-bridge/i.test(source)
  ) return Buffer.from(source, "utf8");
  const evidenceInjection = coursewareLearningEvidenceScript
    ? `\n<script data-openmaic-learning-evidence-runtime="1">\n${coursewareLearningEvidenceScript.replace(/<\/script/gi, "<\\/script")}\n</script>\n`
    : "";
  const bridgeInjection = coursewareBridgeScript
    ? `\n<script data-cq-context-bridge="1">\n${coursewareBridgeScript.replace(/<\/script/gi, "<\\/script")}\n</script>\n`
    : "";
  const injection = `${evidenceInjection}${bridgeInjection}`;
  const closeBodyAt = source.toLowerCase().lastIndexOf("</body>");
  const html = closeBodyAt >= 0
    ? `${source.slice(0, closeBodyAt)}${injection}${source.slice(closeBodyAt)}`
    : `${source}${injection}`;
  return Buffer.from(html, "utf8");
}


function streamStaticFile(req, res, filePath, type, url, stat, extraHeaders = {}) {
  const headers = staticHeaders(filePath, url, {
    "Content-Length": String(stat.size),
    ...extraHeaders
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
    const now = new Date();
    const fmt = (date) => new Date(date.getTime() + 8 * 3600 * 1000).toISOString().slice(0, 10);
    const startOfDay = (date) => `${fmt(date)}T00:00:00.000+08:00`;
    const endOfDay = (date) => `${fmt(date)}T23:59:59.999+08:00`;
    let start, end;
    switch (range) {
      case "today":
        start = startOfDay(now); end = endOfDay(now);
        break;
      case "yesterday": {
        const y = new Date(now.getTime() - 86400000);
        start = startOfDay(y); end = endOfDay(y);
        break;
      }
      case "24h":
        start = beijingIso(new Date(now.getTime() - 86400000));
        end = beijingIso(now);
        break;
      case "14d": {
        const d = new Date(now.getTime() - 14 * 86400000);
        start = startOfDay(d); end = endOfDay(now);
        break;
      }
      case "30d": {
        const d = new Date(now.getTime() - 30 * 86400000);
        start = startOfDay(d); end = endOfDay(now);
        break;
      }
      case "month": {
        start = `${fmt(now).slice(0, 7)}-01T00:00:00.000+08:00`;
        end = endOfDay(now);
        break;
      }
      default:
        start = ""; end = "";
    }
    return { startDate: start, endDate: end };
  }
  const start = url.searchParams.get("start_date") || "";
  const end = url.searchParams.get("end_date") || "";
  const startInclusive = start ? `${start}T00:00:00.000+08:00` : "";
  const endInclusive = end ? `${end}T23:59:59.999+08:00` : "";
  return { startDate: startInclusive, endDate: endInclusive };
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

function trustedClientEventTime(item = {}, receivedAt = new Date()) {
  const candidate = item?.payload?.timing?.clientAt;
  const parsed = Date.parse(String(candidate || ""));
  if (!Number.isFinite(parsed)) return receivedAt.getTime();
  const delta = parsed - receivedAt.getTime();
  const maxPastSkewMs = 7 * 24 * 60 * 60 * 1000;
  const maxFutureSkewMs = 10 * 60 * 1000;
  return delta >= -maxPastSkewMs && delta <= maxFutureSkewMs
    ? parsed
    : receivedAt.getTime();
}

function clientEventId(userId = "", item = {}) {
  const raw = String(item.eventId || item.payload?.eventId || "").trim();
  if (!raw || raw.length > 200 || !/^[A-Za-z0-9:._-]+$/.test(raw)) {
    return crypto.randomUUID();
  }
  return `${userId}:${raw}`;
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

// Simple in-memory rate limiter for API routes.
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW = Math.max(
  100,
  Number(process.env.RATE_LIMIT_WINDOW_MS || 60000) || 60000
);
const RATE_LIMIT_MAX = Math.max(
  1,
  Number(process.env.RATE_LIMIT_MAX || 120) || 120
);

function checkRateLimit(req) {
  const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket.remoteAddress || "unknown";
  const now = Date.now();
  let entry = rateLimitMap.get(ip);
  if (!entry || now >= entry.resetAt) {
    entry = { count: 0, resetAt: now + RATE_LIMIT_WINDOW };
    rateLimitMap.set(ip, entry);
  }
  entry.count++;
  if (entry.count > RATE_LIMIT_MAX) return false;

 // Cleanup stale entries periodically
 if (rateLimitMap.size > 5000) {
   for (const [key, val] of rateLimitMap) {
     if (now >= val.resetAt) rateLimitMap.delete(key);
   }
 }
  return true;
}

function checkAssistantRateLimit(userId = "") {
  const key = String(userId || "unknown");
  const now = Date.now();
  let entry = assistantRateLimitMap.get(key);
  if (!entry || now > entry.resetAt) {
    entry = { count: 0, resetAt: now + assistantRateLimitWindowMs };
    assistantRateLimitMap.set(key, entry);
  }
  entry.count += 1;
  if (assistantRateLimitMap.size > 5000) {
    for (const [itemKey, item] of assistantRateLimitMap) {
      if (now > item.resetAt) assistantRateLimitMap.delete(itemKey);
    }
  }
  return {
    ok: entry.count <= assistantRateLimitMax,
    retryAfterSeconds: Math.max(1, Math.ceil((entry.resetAt - now) / 1000))
  };
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

const sessionTouchIntervalMs = 60 * 1000;

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
  const lastSeenMs = Date.parse(session.last_seen_at || "");
  if (!Number.isFinite(lastSeenMs) || Date.now() - lastSeenMs >= sessionTouchIntervalMs) {
    db.touchSession(token, ts);
    db.upsertUser(participant.id, participant.nickname || "", participant.created_at, ts, {
      nicknameNorm: participant.nickname_norm || normalizeIdentity(participant.nickname || ""),
      email: participant.email || "",
      emailNorm: participant.email_norm || normalizeEmail(participant.email || ""),
      passwordHash: participant.password_hash || "",
      passwordUpdatedAt: participant.password_updated_at || "",
      profileUpdatedAt: participant.profile_updated_at || ""
    });
  }
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

function persistGradingResults(participant, results = []) {
  if (!participant || !Array.isArray(results)) return;
  results.forEach((gr) => {
    if (!gr?.questionId) return;
    const quizResultIds = db.updateQuizResultAiGrading(gr.questionId, participant.id, {
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
      input_summary: { questionId: gr.questionId, unitId: gr.unitId || "", chapterId: gr.chapterId || "",
        quizResultIds: quizResultIds || [] },
      output_summary: {
        score: gr.score, confidence: gr.confidence, errorType: gr.errorType,
        needsReview: Boolean(gr.needsReview), gradingAudit: gr.gradingAudit || null,
        rubricScores: gr.rubricScores || []
      },
      confidence: gr.confidence,
      llm_provider: gr.provider || "",
      latency_ms: 0,
      created_at: nowIso()
    });
  });
}

function parseSnapshotDataValue(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(String(value || "{}"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function reconcileSnapshotQuizResultsForUser(userId, snapshot, generation, fallbackTimestamp = "") {
  const resolvedGeneration = Number(generation) > 0 ? Number(generation) : 1;
  return quizReconciliation.reconcileSnapshotQuizResults({
    db,
    userId,
    generation: resolvedGeneration,
    snapshot: db.normalizeLearningSnapshot(parseSnapshotDataValue(snapshot)),
    assessmentIndex,
    courseAssessment,
    assessmentFingerprint: courseAssessmentFingerprint,
    fallbackTimestamp
  });
}

function reconcileStoredSnapshotQuizResults() {
  const totals = {
    users: 0,
    snapshots: 0,
    candidates: 0,
    inserted: 0,
    updated: 0,
    skipped: 0
  };
  db.listUsers().forEach((user) => {
    totals.users += 1;
    try {
      const snapshots = db.listLearningSnapshots(user.id);
      snapshots.forEach((snapshot) => {
        totals.snapshots += 1;
        // Generation 0 is the pre-versioning legacy snapshot format.  It
        // belongs to the first learning generation, not to a later reset.
        const generation = Number(snapshot.generation) > 0 ? Number(snapshot.generation) : 1;
        const result = reconcileSnapshotQuizResultsForUser(
          user.id,
          snapshot.data,
          generation,
          snapshot.created_at
        );
        totals.inserted += result.inserted;
        totals.updated += result.updated;
        totals.skipped += result.skipped;
        totals.candidates += result.candidates;
      });
    } catch (error) {
      console.error(`Stored snapshot quiz reconciliation skipped for ${user.id}:`, error.message);
    }
  });
  return totals;
}

function gradingRuntimeInfo() {
  const provider = String(
    process.env.GRADING_LLM_PROVIDER
    || llm.provider()
  ).toLowerCase();
  const runtime = llm.runtimeInfo({
    provider,
    model: process.env.GRADING_MODEL || undefined,
    baseUrl: process.env.GRADING_BASE_URL || undefined,
    apiKey: process.env.GRADING_API_KEY || undefined,
    wireApi: process.env.GRADING_WIRE_API || undefined,
    configFile: process.env.GRADING_CONFIG_FILE || undefined
  });
  return {
    provider,
    model: String(runtime.model || "").slice(0, 120),
    wireApi: runtime.wireApi || "",
    credentialSource: runtime.credentialSource || "",
    liveConfigured: runtime.liveConfigured === true
  };
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
  if (isLoopbackAdminRequest(req)) return true;
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
    : decoded === "/flow-test" ? "flow-test.html"
    : decoded.replace(/^\/+/, "");
  const normalized = publicPath.replaceAll("\\", "/");
  const extension = path.extname(normalized).toLowerCase();
  const isManifest = /^resources\/open-maic\/.+\/manifest\.json$/.test(normalized);
  const isPublicResource = normalized.startsWith("resources/open-maic/")
    && !/^resources\/open-maic\/(?:prompts|versions)(?:\/|$)/.test(normalized)
    && (
      normalized === "resources/open-maic/course-index.json"
      || publicResourceExtensions.has(extension)
    );
  const allowed = publicRootFiles.has(normalized)
    || publicOutcomeFigureFiles.has(normalized)
    || publicOpenMaicRendererFiles.has(normalized)
    || coursewareModules.files.has(normalized)
    || normalized === "assets/learning-runtime.js"
    || normalized === "assets/learning-runtime.css"
    || publicFlowTestFiles.has(normalized)
    || normalized.startsWith("app/") && (extension === ".js" || extension === ".css")
    || normalized.startsWith("admin/") && (extension === ".js" || extension === ".css")
    || normalized.startsWith("assets/") && publicAssetExtensions.has(extension)
    || publicLibFiles.has(normalized)
    || normalized.startsWith("lib/fonts/") && publicFontExtensions.has(extension)
    || isManifest
    || isPublicResource;
  if (!allowed || normalized.split("/").some((part) => !part || part === "." || part === "..")) return null;
  const filePath = path.resolve(root, publicPath);
  return filePath === root || filePath.startsWith(root + path.sep) ? filePath : null;
}

function snapshotVersion(body = {}) {
  const generation = Number(body.generation);
  const baseRevision = Number(body.baseRevision);
  return {
    generation,
    baseRevision,
    validGeneration: Number.isInteger(generation) && generation > 0,
    validBaseRevision: Number.isInteger(baseRevision) && baseRevision >= 0
  };
}

function sendSnapshotConflict(res, result) {
  const generationConflict = result.conflict === "generation";
  sendJson(res, 409, {
    ok: false,
    code: generationConflict ? "snapshot_generation_conflict" : "snapshot_revision_conflict",
    message: generationConflict
      ? "学习记录已在其他页面重置或更新，请刷新后继续。"
      : "学习记录已在其他页面更新，已拒绝当前页面的旧版本覆盖。",
    generation: result.generation,
    revision: result.revision
  });
}

function assistantProviderInfo() {
  const runtime = llm.runtimeInfo();
  const id = runtime.provider;
  const live = runtime.live === true && runtime.liveConfigured === true;
  return {
    id,
    live,
    model: String(runtime.model || "").slice(0, 120),
    wireApi: runtime.wireApi || "",
    credentialSource: runtime.credentialSource || "",
    verification: live ? "pending" : "local",
    label: live ? "模型待验证" : "本地引导"
  };
}

function beijingDateKey(date = new Date()) {
  return new Date(date.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function assistantQuotaInfo(userId, date = new Date()) {
  const usageDate = beijingDateKey(date);
  const used = db.getLearningAssistantDailyUsage(userId, usageDate).requestCount;
  return {
    usageDate,
    limit: assistantDailyQuotaLimit,
    used,
    remaining: Math.max(0, assistantDailyQuotaLimit - used)
  };
}

function sendAssistantQuizLocked(res, userId) {
  sendJson(res, 403, {
    ok: false,
    code: "assistant_quiz_locked_until_submit",
    message: "提交本次测验后即可使用知点复盘。",
    quizSubmitted: false,
    quota: assistantQuotaInfo(userId)
  });
}

function assistantRequestConsumesQuota(providerInfo = assistantProviderInfo()) {
  return Boolean(
    providerInfo.live
    || process.env.LEARNING_ASSISTANT_COUNT_MOCK_USAGE === "true"
  );
}

function consumeAssistantQuota(userId, date = new Date()) {
  const usageDate = beijingDateKey(date);
  return {
    usageDate,
    ...db.consumeLearningAssistantDailyQuota(
      userId,
      usageDate,
      assistantDailyQuotaLimit,
      date.toISOString()
    )
  };
}

function releaseAssistantQuota(userId, date = new Date()) {
  const usageDate = beijingDateKey(date);
  return {
    usageDate,
    ...db.releaseLearningAssistantDailyQuota(
      userId,
      usageDate,
      assistantDailyQuotaLimit,
      new Date().toISOString()
    )
  };
}

function consumeAssistantInterventionBudget(userId, date = new Date()) {
  const usageDate = beijingDateKey(date);
  return {
    usageDate,
    ...db.consumeLearningAssistantInterventionBudget(
      userId,
      usageDate,
      assistantDailyInterventionLimit,
      date.toISOString()
    )
  };
}

function proactiveInterventionBudgetInfo(userId, date = new Date()) {
  const usageDate = beijingDateKey(date);
  const used = db.getLearningAssistantDailyUsage(userId, usageDate).interventionCount;
  return {
    usageDate,
    limit: assistantDailyInterventionLimit,
    used,
    remaining: Math.max(0, assistantDailyInterventionLimit - used)
  };
}

function publicProactiveAssignment(assignment = null) {
  if (!assignment) return null;
  return {
    experimentId: assignment.experiment_id || "",
    cohort: assignment.cohort || "",
    stratum: assignment.stratum || "unstratified",
    assignmentVersion: assignment.assignment_version || "",
    assignedAt: assignment.assigned_at || ""
  };
}

function publicProactiveParticipation(participation = null) {
  const status = participation?.status === "withdrawn"
    ? "withdrawn"
    : participation?.status === "enrolled"
      ? "enrolled"
      : "not_enrolled";
  return {
    mode: proactiveStudyConfig.participationMode,
    ready: proactiveStudyConfig.participationReady,
    status,
    enrolled: status === "enrolled",
    withdrawn: status === "withdrawn",
    canEnroll: status === "not_enrolled"
      && proactiveStudyConfig.participationMode === "explicit-consent"
      && proactiveStudyConfig.participationReady,
    canWithdraw: status === "enrolled",
    consentVersion: proactiveStudyConfig.consentVersion,
    consentNoticeUrl: proactiveStudyConfig.consentNoticeUrl,
    enrollmentBasis: participation?.enrollment_basis || "",
    consentedAt: participation?.consented_at || "",
    withdrawnAt: participation?.withdrawn_at || "",
    withdrawalReason: participation?.withdrawal_reason || ""
  };
}

function proactiveParticipationForUser(userId, options = {}) {
  const existing = db.getProactiveParticipation(
    userId,
    proactiveStudyConfig.experimentId
  );
  if (existing || options.createImplicit === false) return existing;
  if (proactiveStudyConfig.participationMode !== "implicit-pilot") return null;
  const recordedAt = nowIso();
  return db.enrollProactiveParticipation({
    user_id: userId,
    experiment_id: proactiveStudyConfig.experimentId,
    enrollment_basis: "implicit_engineering_pilot",
    consent_version: proactiveStudyConfig.consentVersion,
    consented_at: recordedAt,
    updated_by: "system",
    created_at: recordedAt,
    updated_at: recordedAt
  }).participation;
}

function proactiveExperimentRuntime() {
  return db.getProactiveExperimentRuntime(
    proactiveStudyConfig.experimentId
  ) || db.ensureProactiveExperimentRuntime({
    experimentId: proactiveStudyConfig.experimentId,
    updatedAt: nowIso()
  });
}

function publicProactiveRuntime(runtime = proactiveExperimentRuntime()) {
  const status = runtime?.status === "paused" ? "paused" : "active";
  return {
    status,
    paused: status === "paused",
    reason: status === "paused" ? runtime.pause_reason || "" : "",
    pausedAt: status === "paused" ? runtime.paused_at || "" : "",
    updatedAt: runtime?.updated_at || ""
  };
}

function adminProactiveRuntime(runtime = proactiveExperimentRuntime()) {
  return {
    ...publicProactiveRuntime(runtime),
    updatedBy: runtime?.updated_by || "",
    changed: runtime?.changed === true
  };
}

function proactiveProtocolPayload(experimentId = proactiveStudyConfig.experimentId) {
  const snapshot = experimentId === proactiveStudyConfig.experimentId
    ? proactiveProtocolSnapshot
    : db.getProactiveProtocolSnapshot(experimentId);
  if (!snapshot) return null;
  const definition = parseStoredJson(snapshot.protocol_json || "{}", {});
  return {
    experimentId: snapshot.experiment_id || experimentId,
    chapterId: snapshot.chapter_id || definition.chapterId || "",
    fingerprint: snapshot.protocol_fingerprint || "",
    frozenAt: snapshot.created_at || "",
    definition,
    currentMatches: experimentId === proactiveStudyConfig.experimentId
      ? snapshot.protocol_fingerprint === proactiveProtocolFingerprint
      : null
  };
}

function proactiveAssessmentQuestionCount(phase = "") {
  const normalizedPhase = boundedLearningText(phase, 40).toLowerCase();
  return Array.from(assessmentIndex.values()).filter((entry) => (
    entry.chapterId === proactiveStudyConfig.chapterId
    && entry.phase === normalizedPhase
    && entry.unitId === `${proactiveStudyConfig.chapterId}-${normalizedPhase}`
  )).length;
}

function proactiveIntegrityReport(experimentId = proactiveStudyConfig.experimentId) {
  const protocol = proactiveProtocolPayload(experimentId);
  const policy = protocol?.definition?.policy || proactivePolicy.adminConfig(
    proactiveStudyConfig
  );
  const rules = protocol?.definition?.stoppingRules || proactiveStoppingRules;
  const metrics = db.proactiveIntegrityDiagnostics({
    experimentId,
    experimentArms: policy.experimentArms || [],
    displayArms: policy.displayArms || [],
    assignmentStrategy: policy.assignmentStrategy || "hash",
    repeatWindowMs: Number(
      rules.repeatDisplayWindowMs || proactiveStoppingRules.repeatDisplayWindowMs
    ),
    unresolvedThreshold: Number(
      rules.unresolvedOfferThreshold || proactiveStoppingRules.unresolvedOfferThreshold
    ),
    unresolvedAgeMs: Number(
      rules.unresolvedOfferAgeMs || proactiveStoppingRules.unresolvedOfferAgeMs
    )
  });
  const signal = (id, label, severity, count, detail, flagged = count > 0) => ({
    id,
    label,
    severity,
    status: flagged ? severity : "ok",
    count: Number(count || 0),
    detail
  });
  const signals = [
    signal(
      "protected_assessment_display",
      "受保护测量阶段出现展示",
      "critical",
      metrics.protectedDisplays,
      "前测、后测与独立迁移/保持测量期间不得展示主动帮助。"
    ),
    signal(
      "non_display_arm_display",
      "非展示实验臂出现展示",
      "critical",
      metrics.nonDisplayArmDisplays,
      "Control 或协议中 display=false 的实验臂不得收到主动提示。"
    ),
    signal(
      "post_withdrawal_display",
      "退出研究后仍出现展示",
      "critical",
      metrics.postWithdrawalDisplays,
      "学生退出研究后仍可继续正常学习，但不得再收到主动实验提示。"
    ),
    signal(
      "opt_out_display",
      "学生关闭后仍出现展示",
      "critical",
      metrics.optOutDisplays,
      "全局关闭或知识点静音后，后续展示视为自主权违规。"
    ),
    signal(
      "incomplete_evidence_chain",
      "应介入决策缺少证据链",
      "critical",
      metrics.incompleteEvidence,
      "应介入判断必须同时保留结构化证据引用与证据快照。"
    ),
    signal(
      "rapid_repeat_display",
      "同知识点短时间重复展示",
      "warning",
      metrics.repeatedDisplays,
      `同一学生同一知识点 ${Math.round(metrics.repeatWindowMs / 60000)} 分钟内重复展示需要人工复核。`
    ),
    signal(
      "unresolved_offer_backlog",
      "未决主动提示积压",
      "warning",
      metrics.unresolvedOffers,
      `未决提示达到 ${metrics.unresolvedThreshold} 条，或最早一条超过 ${Math.round(metrics.unresolvedAgeMs / 60000)} 分钟时建议暂停排查。`,
      metrics.unresolvedOffers >= metrics.unresolvedThreshold
        || metrics.unresolvedOldestAgeMs >= metrics.unresolvedAgeMs
    ),
    signal(
      "assignment_imbalance",
      "分层实验臂明显失衡",
      "warning",
      metrics.imbalancedStrata.length,
      "该信号只提示分配可行性风险，不自动判定因果分析失效。"
    )
  ];
  return {
    advisoryOnly: true,
    generatedAt: metrics.generatedAt,
    summary: {
      critical: signals.filter((entry) => entry.status === "critical").length,
      warning: signals.filter((entry) => entry.status === "warning").length,
      ok: signals.filter((entry) => entry.status === "ok").length
    },
    signals,
    metrics
  };
}

function proactivePretestStratum(userId) {
  const pretestUnitId = `${proactiveStudyConfig.chapterId}-pre`;
  const expectedEntries = Array.from(assessmentIndex.values())
    .filter((entry) => (
      entry.chapterId === proactiveStudyConfig.chapterId
      && entry.phase === "pre"
      && entry.unitId === pretestUnitId
    ));
  const basis = "server_scored_objective_items";
  if (!expectedEntries.length) {
    return { ready: false, stratum: "unstratified", basis };
  }
  const expectedIds = new Set(expectedEntries.map((entry) => entry.question.id));
  const latest = new Map();
  db.getQuizResultsByUser(userId, 500).forEach((row) => {
    if (
      row.chapter_id === proactiveStudyConfig.chapterId
      && row.phase === "pre"
      && row.unit_id === pretestUnitId
      && expectedIds.has(row.question_id)
      && !latest.has(row.question_id)
    ) {
      latest.set(row.question_id, row);
    }
  });
  if (latest.size < expectedIds.size) {
    return {
      ready: false,
      stratum: "unstratified",
      submitted: latest.size,
      expected: expectedIds.size,
      basis
    };
  }
  const objectiveIds = new Set(
    expectedEntries
      .filter((entry) => entry.question.type !== "short_answer")
      .map((entry) => entry.question.id)
  );
  const scored = Array.from(latest.values())
    .filter((row) => (
      objectiveIds.has(row.question_id)
      && Number(row.is_correct) >= 0
      && Number(row.max_score || 0) > 0
    ));
  const earned = scored.reduce((sum, row) => sum + Number(row.score || 0), 0);
  const possible = scored.reduce((sum, row) => sum + Number(row.max_score || 0), 0);
  const accuracy = possible > 0 ? earned / possible : null;
  return {
    ready: true,
    stratum: accuracy !== null && accuracy >= 0.6 ? "pre-high" : "pre-low",
    accuracy,
    submitted: latest.size,
    expected: expectedIds.size,
    stratificationQuestions: objectiveIds.size,
    earned,
    possible,
    basis
  };
}

function proactiveAssessmentCompletion(userId, phase = "") {
  const normalizedPhase = boundedLearningText(phase, 40).toLowerCase();
  const unitId = `${proactiveStudyConfig.chapterId}-${normalizedPhase}`;
  const expectedEntries = Array.from(assessmentIndex.values())
    .filter((entry) => (
      entry.chapterId === proactiveStudyConfig.chapterId
      && entry.phase === normalizedPhase
      && entry.unitId === unitId
    ));
  if (!expectedEntries.length) {
    return {
      ready: false,
      phase: normalizedPhase,
      unitId,
      submitted: 0,
      expected: 0,
      completedAt: ""
    };
  }
  const expectedIds = new Set(
    expectedEntries.map((entry) => entry.question.id)
  );
  const latest = new Map();
  db.getQuizResultsByUser(userId, 500).forEach((row) => {
    if (
      row.chapter_id === proactiveStudyConfig.chapterId
      && row.phase === normalizedPhase
      && row.unit_id === unitId
      && expectedIds.has(row.question_id)
      && !latest.has(row.question_id)
    ) {
      latest.set(row.question_id, row);
    }
  });
  const completedAt = Array.from(latest.values())
    .map((row) => row.created_at || "")
    .filter(Boolean)
    .sort()
    .at(-1) || "";
  return {
    ready: latest.size >= expectedIds.size,
    phase: normalizedPhase,
    unitId,
    submitted: latest.size,
    expected: expectedIds.size,
    completedAt
  };
}

function publicProactiveOutcomeSession(session = null) {
  if (!session) return null;
  return {
    id: session.id,
    stageId: session.stage,
    status: session.status,
    startedAt: session.started_at || "",
    endedAt: session.ended_at || "",
    learningGeneration: Number(session.learning_generation || 1),
    instrumentVersion: session.instrument_version || "",
    protocolFingerprint: session.protocol_fingerprint || "",
    withdrawalReason: session.withdrawal_reason || "",
    pausedAt: session.paused_at || "",
    pauseCount: Number(session.pause_count || 0),
    pausedDurationMs: Number(session.paused_duration_ms || 0),
    responses: session.status === "active"
      ? parseStoredJson(session.draft_response_json || "{}", {})
      : {}
  };
}

const proactiveOutcomeAnswerKeyCache = new Map();

function proactiveOutcomeAnswerKey(stageId = "", instrument = proactiveOutcomes) {
  const cacheKey = `${instrument.version}:${stageId}`;
  if (proactiveOutcomeAnswerKeyCache.has(cacheKey)) {
    return proactiveOutcomeAnswerKeyCache.get(cacheKey);
  }
  const stage = instrument.publicStage(stageId);
  const answers = {};
  if (stage?.items?.length) {
    const baseline = Object.fromEntries(
      stage.items.map((item) => [item.id, item.options?.[0]?.value || ""])
    );
    stage.items.forEach((item) => {
      const correctOption = (item.options || []).find((option) => {
        const graded = instrument.grade(stageId, {
          ...baseline,
          [item.id]: option.value
        });
        return graded?.results?.find((result) => result.itemId === item.id)?.correct === true;
      });
      if (correctOption) answers[item.id] = correctOption.value;
    });
  }
  proactiveOutcomeAnswerKeyCache.set(cacheKey, answers);
  return answers;
}

function proactiveOutcomeReview(stageId, attempt, answersReleased) {
  if (!attempt) return null;
  const instrument = outcomeRegistry.forVersion(attempt.instrument_version || "");
  const stage = instrument?.publicStage(stageId);
  if (!stage) return {
    unavailable: true,
    reason: "该记录的原题库版本暂不可用，不能用当前题目解释旧作答。",
    instrumentVersion: attempt.instrument_version || "",
    items: []
  };
  const responses = parseStoredJson(attempt.response_json || "{}", {});
  const resultRows = parseStoredJson(attempt.item_results_json || "[]", []);
  const resultByItem = new Map(
    (Array.isArray(resultRows) ? resultRows : []).map((row) => [row.itemId, row])
  );
  const answerKey = answersReleased ? proactiveOutcomeAnswerKey(stageId, instrument) : {};
  return {
    instrumentVersion: instrument.version,
    answersReleased,
    submittedAt: attempt.submitted_at || "",
    ...(answersReleased
      ? {
          score: Number(attempt.score || 0),
          maxScore: Number(attempt.max_score || 0),
          accuracy: Number(attempt.accuracy || 0)
        }
      : {}),
    items: stage.items.map((item) => {
      const response = String(responses[item.id] || "");
      const responseOption = item.options.find((option) => option.value === response);
      const result = resultByItem.get(item.id) || null;
      const correctOption = answersReleased ? String(answerKey[item.id] || "") : "";
      const correctOptionEntry = answersReleased
        ? item.options.find((option) => option.value === correctOption)
        : null;
      return {
        id: item.id,
        constructId: item.constructId,
        prompt: item.prompt,
        options: item.options,
        ...(item.figure ? { figure: item.figure } : {}),
        response,
        responseLabel: responseOption?.label || "未作答",
        ...(answersReleased
          ? {
              isCorrect: result?.correct === true,
              correctOption,
              correctOptionLabel: correctOptionEntry?.label || ""
            }
          : {})
      };
    })
  };
}

function proactiveOutcomeState(
  userId,
  chapterId,
  now = Date.now()
) {
  const managed = chapterId === proactiveStudyConfig.chapterId
    && proactiveOutcomes.chapterId === proactiveStudyConfig.chapterId;
  const participation = managed
    ? proactiveParticipationForUser(userId)
    : null;
  const assignment = managed ? proactiveAssignmentForUser(userId) : null;
  const posttest = managed
    ? proactiveAssessmentCompletion(userId, "post")
    : { ready: false, completedAt: "", submitted: 0, expected: 0 };
  const postCompletedAt = Date.parse(posttest.completedAt || "");
  const retentionUnlockAt = Number.isFinite(postCompletedAt)
    ? postCompletedAt + proactiveRetentionDelayHours * 60 * 60 * 1000
    : NaN;
  const retentionCloseAt = proactiveRetentionCloseHours !== null && Number.isFinite(postCompletedAt)
    ? postCompletedAt + proactiveRetentionCloseHours * 60 * 60 * 1000
    : NaN;

  if (managed && Number.isFinite(retentionCloseAt) && now >= retentionCloseAt) {
    const retentionSession = db.getProactiveOutcomeSession(
      userId,
      proactiveStudyConfig.experimentId,
      "retention"
    );
    if (retentionSession?.status === "active") {
      db.expireProactiveOutcomeSession({
        userId,
        sessionId: retentionSession.id,
        reason: "retention_window_expired",
        endedAt: new Date(retentionCloseAt).toISOString()
      });
    }
  }
  const attempts = managed
    ? db.listProactiveOutcomeAttempts(
        userId,
        proactiveStudyConfig.experimentId
      )
    : [];
  const sessions = managed
    ? db.listProactiveOutcomeSessions(
        userId,
        proactiveStudyConfig.experimentId
      )
    : [];
  const attemptByStage = new Map(
    attempts.map((attempt) => [attempt.stage, attempt])
  );
  const sessionByStage = new Map(
    sessions.map((session) => [session.stage, session])
  );
  const activeSession = sessions.find(
    (session) => session.status === "active"
  ) || null;
  const terminalSessionStatuses = new Set([
    "submitted",
    "skipped",
    "withdrawn",
    "expired"
  ]);
  const stageTerminal = (stageId) => (
    attemptByStage.has(stageId)
    || terminalSessionStatuses.has(sessionByStage.get(stageId)?.status)
  );
  const priorVersion = sessions[0]?.instrument_version || attempts[0]?.instrument_version;
  const workflow = priorVersion ? outcomeRegistry.forVersion(priorVersion) || proactiveOutcomes : proactiveOutcomes;
  const transferComplete = workflow.stageIds
    .filter((stageId) => stageId !== "retention").every(stageTerminal);
  const answerReviewReleased = workflow.stageIds.every(stageTerminal);
  const reminderHistory = managed
    ? db.proactiveRetentionReminderHistory(
        userId,
        proactiveStudyConfig.experimentId
      )
    : [];
  const shownReminderHours = new Set(
    reminderHistory
      .filter((row) => row.action === "shown")
      .map((row) => Number(row.milestoneHours))
      .filter(Number.isFinite)
  );
  const elapsedRetentionHours = Number.isFinite(postCompletedAt)
    ? Math.max(0, (now - postCompletedAt) / (60 * 60 * 1000))
    : 0;
  const dueReminderHours = transferComplete
    && Number.isFinite(retentionUnlockAt)
    && now >= retentionUnlockAt
    && (!Number.isFinite(retentionCloseAt) || now < retentionCloseAt)
    && !stageTerminal("retention")
    ? proactiveRetentionReminderHours.filter((hours) => (
        elapsedRetentionHours >= hours && !shownReminderHours.has(hours)
      ))
    : [];
  const nextReminderHours = proactiveRetentionReminderHours.find(
    (hours) => hours > elapsedRetentionHours && !shownReminderHours.has(hours)
  );
  const retentionWindowStatus = !posttest.ready
    ? "not_scheduled"
    : stageTerminal("retention")
      ? attemptByStage.has("retention") ? "completed" : sessionByStage.get("retention")?.status || "closed"
      : Number.isFinite(retentionCloseAt) && now >= retentionCloseAt
        ? "expired"
        : Number.isFinite(retentionUnlockAt) && now < retentionUnlockAt
          ? "waiting"
          : transferComplete
            ? "open"
            : "waiting_for_transfer";

  const stages = workflow.stageIds.map((stageId) => {
    const attempt = attemptByStage.get(stageId) || null;
    const session = sessionByStage.get(stageId) || null;
    const instrumentVersion = attempt
      ? attempt.instrument_version || ""
      : session ? session.instrument_version || "" : workflow.version;
    const stageInstrument = outcomeRegistry.forVersion(instrumentVersion);
    const instrument = stageInstrument?.publicStage(stageId)
      || workflow.publicStage(stageId);
    let status = "locked";
    let reason = "完成章后测后开放。";
    let unlockAt = "";
    if (attempt || session?.status === "submitted") {
      status = "submitted";
      reason = answerReviewReleased
        ? "已提交；现在可以回看对错、正确答案和总分。"
        : "已提交；可以回看自己的作答，全部测量完成后统一开放对错和答案。";
    } else if (["skipped", "withdrawn", "expired"].includes(session?.status)) {
      status = session.status;
      reason = session.status === "skipped"
        ? "已永久跳过本阶段；缺失原因已记录，后续阶段仍可继续。"
        : session.status === "expired"
          ? "本阶段已超过作答窗口；超窗状态已记录。"
          : "已随研究退出结束本阶段；该失访状态会保留在研究记录中。";
    } else if (session?.status === "active") {
      status = "active";
      reason = session.paused_at
        ? "本阶段已暂时离开；作答草稿已保留，继续时恢复同一会话。"
        : "测量进行中；刷新或换设备后会继续同一会话。";
    } else if (activeSession) {
      reason = "请先完成或退出当前正在进行的独立测量。";
    } else if (participation?.status === "withdrawn") {
      reason = "你已退出本章研究；课程与主动提问仍可继续使用。";
    } else if (participation?.status !== "enrolled") {
      reason = "加入本章研究并完成章前测后开放。";
    } else if (!assignment) {
      reason = "完成章前测并进入本章实验后开放。";
    } else if (!posttest.ready) {
      reason = "完成章后测后开放。";
    } else if (
      stageId === "representation_transfer"
      && !stageTerminal("near_transfer")
    ) {
      reason = "完成或明确跳过近迁移测量后按路径开放。";
    } else if (stageId === "retention" && !transferComplete) {
      reason = "完成或明确跳过两项迁移测量后进入延迟保持阶段。";
    } else if (
      stageId === "retention"
      && Number.isFinite(retentionUnlockAt)
      && now < retentionUnlockAt
    ) {
      unlockAt = new Date(retentionUnlockAt).toISOString();
      reason = proactiveRetentionCloseHours === null
        ? `章后测提交满${proactiveRetentionDelayHours}小时后开放，开放后不设截止时间。`
        : "将在延迟窗口结束后开放。";
    } else if (
      stageId === "retention"
      && Number.isFinite(retentionCloseAt)
      && now >= retentionCloseAt
    ) {
      status = "expired";
      reason = "延迟保持测量已超过作答窗口；超窗状态已记录。";
    } else {
      status = "available";
      reason = "可独立作答；本阶段不提供知点提示、路径建议或即时反馈。"
        + (stageId === "retention" && proactiveRetentionCloseHours === null ? "开放后不设截止时间。" : "");
    }
    if (!stageInstrument && ["active", "available"].includes(status)) {
      status = "locked";
      reason = "该会话的题库版本暂不可用，请联系管理员恢复原版本；已有草稿不会被替换。";
    }
    return {
      instrumentVersion,
      id: instrument.id,
      label: instrument.label,
      purpose: instrument.purpose,
      itemCount: instrument.itemCount,
      agentAssistanceAllowed: false,
      feedbackPolicy: instrument.feedbackPolicy,
      status,
      reason,
      unlockAt,
      closeAt: stageId === "retention" && Number.isFinite(retentionCloseAt)
        ? new Date(retentionCloseAt).toISOString()
        : "",
      windowStatus: stageId === "retention" ? retentionWindowStatus : "",
      sessionId: session?.id || "",
      startedAt: session?.started_at || "",
      submittedAt: attempt?.submitted_at || "",
      endedAt: session?.ended_at || "",
      withdrawalReason: session?.withdrawal_reason || "",
      review: attempt
        ? proactiveOutcomeReview(stageId, attempt, answerReviewReleased)
        : null,
      ...(["available", "active"].includes(status)
        ? { items: instrument.items }
        : {})
    };
  });
  return {
    managed,
    chapterId,
    instrumentVersion: workflow.version,
    protocolFingerprint: proactiveProtocolFingerprint,
    retentionDelayHours: proactiveRetentionDelayHours,
    retentionCloseHours: proactiveRetentionCloseHours,
    retentionReminderHours: proactiveRetentionReminderHours,
    retentionWindow: {
      status: retentionWindowStatus,
      unlockAt: Number.isFinite(retentionUnlockAt)
        ? new Date(retentionUnlockAt).toISOString()
        : "",
      closeAt: Number.isFinite(retentionCloseAt)
        ? new Date(retentionCloseAt).toISOString()
        : "",
      dueReminderHours,
      nextReminderHours: Number.isFinite(nextReminderHours)
        ? nextReminderHours
        : null,
      reminders: reminderHistory
    },
    posttest,
    participation: publicProactiveParticipation(participation),
    assignmentPending: Boolean(
      managed
      && participation?.status === "enrolled"
      && !assignment
    ),
    activeSession: publicProactiveOutcomeSession(activeSession),
    agentAssistanceBlocked: Boolean(activeSession),
    answerReviewReleased,
    answerReviewPolicy: "全部独立测量提交、明确跳过或超窗后统一开放已提交阶段的对错和正确答案。",
    stages
  };
}

function closeProactiveSupportForOutcomeSession(userId, startedAt) {
  const closedInterventions = db.closeOpenProactiveInterventionsForUser({
    userId,
    experimentId: proactiveStudyConfig.experimentId,
    resolution: "measurement_started",
    resolvedAt: startedAt,
    followupOutcome: {
      outcome: "measurement_started",
      startedAt
    }
  });
  let closedLifecycleEpisodes = 0;
  db.listProactivePolicyStates(
    userId,
    proactiveStudyConfig.experimentId
  ).forEach((row) => {
    if (row.scope_key === proactiveGlobalScopeKey) return;
    const lifecycleState = proactivePolicy.lifecycle.normalize(
      parseStoredJson(row.lifecycle_json || "{}", {})
    );
    if (![
      "accepted_pending_response",
      "awaiting_independent_attempt"
    ].includes(lifecycleState.phase)) return;
    closedLifecycleEpisodes += 1;
    db.upsertProactivePolicyState(proactivePolicyStateRecord(row, {
      userId,
      scopeKey: row.scope_key,
      updatedAt: startedAt,
      lastReasonCode: "measurement_started",
      currentLevel: "L0",
      lifecycle: {
        ...lifecycleState,
        phase: "closed",
        supportLevel: "L0",
        activeAction: "",
        activeDecisionId: "",
        activeInterventionId: "",
        reasonCode: "measurement_started",
        lastOutcome: "measurement_started",
        lastOutcomeAt: startedAt
      }
    }));
  });
  return { closedInterventions, closedLifecycleEpisodes };
}

function closeProactiveSupportForStudyWithdrawal(userId, withdrawnAt) {
  const closedInterventions = db.closeOpenProactiveInterventionsForUser({
    userId,
    experimentId: proactiveStudyConfig.experimentId,
    resolution: "study_withdrawn",
    resolvedAt: withdrawnAt,
    followupOutcome: {
      outcome: "study_withdrawn",
      withdrawnAt
    }
  });
  let closedLifecycleEpisodes = 0;
  db.listProactivePolicyStates(
    userId,
    proactiveStudyConfig.experimentId
  ).forEach((row) => {
    if (row.scope_key === proactiveGlobalScopeKey) return;
    const lifecycleState = proactivePolicy.lifecycle.normalize(
      parseStoredJson(row.lifecycle_json || "{}", {})
    );
    const lifecycleActive = [
      "accepted_pending_response",
      "awaiting_independent_attempt"
    ].includes(lifecycleState.phase);
    if (lifecycleActive) closedLifecycleEpisodes += 1;
    db.upsertProactivePolicyState(proactivePolicyStateRecord(row, {
      userId,
      scopeKey: row.scope_key,
      updatedAt: withdrawnAt,
      lastReasonCode: "study_withdrawn",
      currentLevel: lifecycleActive ? "L0" : row.current_level || "L0",
      pendingCandidateKind: "",
      pendingCandidateAt: "",
      pendingCandidateExpiresAt: "",
      pendingEvidence: {},
      lifecycle: lifecycleActive
        ? {
            ...lifecycleState,
            phase: "closed",
            supportLevel: "L0",
            activeAction: "",
            activeDecisionId: "",
            activeInterventionId: "",
            reasonCode: "study_withdrawn",
            lastOutcome: "study_withdrawn",
            lastOutcomeAt: withdrawnAt
          }
        : lifecycleState
    }));
  });
  const withdrawnOutcomeSessions = db
    .withdrawActiveProactiveOutcomeSessionsForUser({
      userId,
      experimentId: proactiveStudyConfig.experimentId,
      reason: "consent_withdrawal",
      endedAt: withdrawnAt
    });
  return {
    closedInterventions,
    closedLifecycleEpisodes,
    withdrawnOutcomeSessions
  };
}

function activeProactiveOutcomeSession(userId) {
  return db.getActiveProactiveOutcomeSession(
    userId,
    proactiveStudyConfig.experimentId
  );
}

function rejectAgentAssistanceDuringOutcome(res, userId) {
  const session = activeProactiveOutcomeSession(userId);
  if (!session) return false;
  sendJson(res, 409, {
    ok: false,
    code: "proactive_outcome_session_active",
    message: "独立测量进行中，知点、主动提示和路径建议暂时关闭。",
    session: publicProactiveOutcomeSession(session)
  });
  return true;
}

function proactiveAssignmentForUser(userId) {
  const participation = proactiveParticipationForUser(userId);
  if (participation?.status !== "enrolled") return null;
  const existing = db.getExperimentAssignment(userId, proactiveStudyConfig.experimentId);
  const pretest = proactivePretestStratum(userId);
  if (
    existing
    && !["", "unassigned", "unstratified"].includes(String(existing.stratum || ""))
  ) {
    return existing;
  }
  if (!proactiveStudyConfig.assignmentReady) return null;
  if (!pretest.ready) return null;
  const assignmentCounts = proactiveStudyConfig.assignmentStrategy === "stratified-balanced"
    ? db.proactiveAssignmentCountsByStratum(
        proactiveStudyConfig.experimentId,
        pretest.stratum
      )
    : {};
  const proposed = proactivePolicy.createAssignment({
    userId,
    config: proactiveStudyConfig,
    stratum: pretest.stratum,
    assignmentCounts,
    assignedAt: nowIso()
  });
  const assigned = existing
    ? db.finalizeExperimentAssignment(proposed)
    : db.getOrCreateExperimentAssignment(proposed);
  db.saveNow();
  return assigned;
}

function proactiveGlobalPreference(userId) {
  const row = db.getProactivePolicyState(
    userId,
    proactiveStudyConfig.experimentId,
    proactiveGlobalScopeKey
  );
  const preference = String(row?.student_preference || "standard");
  return proactiveStudentPreferences.has(preference) ? preference : "standard";
}

function proactiveScopePreference(userId, scopeKey = "") {
  if (!scopeKey || scopeKey === proactiveGlobalScopeKey) return "standard";
  const row = db.getProactivePolicyState(
    userId,
    proactiveStudyConfig.experimentId,
    scopeKey
  );
  const preference = String(row?.scope_preference || "standard");
  return ["standard", "off"].includes(preference) ? preference : "standard";
}

function proactiveStudentPreference(userId, scopeKey = "") {
  const globalPreference = proactiveGlobalPreference(userId);
  if (globalPreference === "off") return "off";
  if (proactiveScopePreference(userId, scopeKey) === "off") return "off";
  return globalPreference === "reduced" ? "reduced" : "standard";
}

function proactiveEventType(row = {}) {
  const payload = row.payload || {};
  return String(payload.eventType || payload.data?.eventType || "");
}

function proactiveEventAt(row = {}) {
  const parsed = Date.parse(row.created_at || "");
  return Number.isFinite(parsed) ? parsed : 0;
}

function proactivePendingQuietCandidate(row = {}, now = Date.now()) {
  const kind = String(row.pending_candidate_kind || "");
  const candidateAt = Date.parse(row.pending_candidate_at || "");
  const expiresAt = Date.parse(row.pending_candidate_expires_at || "");
  const valid = kind === "quiet_dwell"
    && Number.isFinite(candidateAt)
    && candidateAt <= now
    && Number.isFinite(expiresAt)
    && expiresAt > now;
  return {
    valid,
    kind: valid ? kind : "",
    candidateAt: valid ? candidateAt : 0,
    candidateAtIso: valid ? row.pending_candidate_at : "",
    expiresAt: valid ? expiresAt : 0,
    expiresAtIso: valid ? row.pending_candidate_expires_at : "",
    evidence: valid
      ? parseStoredJson(row.pending_evidence_json || "{}", {})
      : {}
  };
}

function proactiveParameter(row = {}) {
  const payload = row.payload || {};
  const data = payload.data || {};
  const value = payload.value || data.value || data.state || data.contextRef?.state || {};
  return boundedLearningText(
    value.parameter || value.param || data.parameter || data.param || data.label,
    120
  );
}

function proactiveIndependentAttemptResult(row = {}) {
  const payload = row.payload || {};
  const data = payload.data || {};
  if ((proactiveEventType(row) === "courseware_challenge_result" && data.independent !== true)
    || data.independent === false
    || Number(data.hint_count ?? data.hintCount) > 0
    || Number(data.reset_count ?? data.resetCount) > 0
    || data.error_type === "missed_expression"
    || data.selected_zone === "missed") return null;
  const raw = data.is_correct
    ?? data.isCorrect
    ?? data.correct
    ?? data.success
    ?? data.passed
    ?? data.completed
    ?? data.result;
  if (typeof raw === "boolean") return raw;
  if (typeof raw === "number") return raw > 0;
  const normalized = boundedLearningText(raw, 40).toLowerCase();
  if (["correct", "success", "passed", "pass", "completed", "true"].includes(normalized)) {
    return true;
  }
  if (["incorrect", "failed", "fail", "wrong", "false"].includes(normalized)) {
    return false;
  }
  const score = Number(data.score);
  const maxScore = Number(data.max_score ?? data.maxScore);
  if (Number.isFinite(score) && Number.isFinite(maxScore) && maxScore > 0) {
    return score >= maxScore * 0.6;
  }
  return null;
}

function proactiveConfirmedGapCount(userId, knowledgePointId = "") {
  if (!knowledgePointId) return 0;
  const latest = new Map();
  db.getQuizResultsByUser(userId, 500).forEach((row) => {
    if (
      row.chapter_id !== proactiveStudyConfig.chapterId
      || latest.has(row.question_id)
    ) return;
    latest.set(row.question_id, row);
  });
  let count = 0;
  latest.forEach((row) => {
    if (Number(row.is_correct) !== 0) return;
    const entry = assessmentIndex.get(row.question_id);
    const ids = entry?.question?.knowledgePointIds || [];
    if (ids.includes(knowledgePointId)) count += 1;
  });
  return count;
}

function proactiveEvidenceForRequest({
  userId,
  resolved,
  signal = {},
  quizAttempt = null,
  policyState = {},
  now = Date.now()
}) {
  const rows = db.recentInteractionEventsForUnit(userId, resolved.unit.id, 800);
  const pendingQuiet = proactivePendingQuietCandidate(policyState, now);
  const lifecycleState = proactivePolicy.lifecycle.normalize(
    parseStoredJson(policyState.lifecycle_json || "{}", {})
  );
  const refs = [];
  const families = new Set();
  const evidence = {
    families: [],
    evidenceRefs: refs,
    parameterCommitCount: 0,
    taskProgressSinceFirstCommit: 0,
    confirmedIncorrect: Number(quizAttempt?.incorrect || 0),
    confirmedCorrect: Number(quizAttempt?.correct || 0),
    pendingReview: Number(quizAttempt?.pendingReview || 0),
    questionCount: Number(quizAttempt?.total || 0),
    confirmedGapCount: proactiveConfirmedGapCount(
      userId,
      resolved.unit.knowledgePointId || resolved.unit.id
    ),
    dwellSeconds: 0,
    naturalBoundary: false,
    pendingCandidateValid: pendingQuiet.valid,
    pendingCandidateAt: pendingQuiet.candidateAtIso,
    pendingCandidateExpiresAt: pendingQuiet.expiresAtIso,
    boundaryEventType: ""
  };
  if (["quiz_review", "formative_outcome"].includes(signal.kind)) {
    if (evidence.questionCount > 0) families.add("result");
    if (
      signal.kind === "formative_outcome"
      && [
        "accepted_pending_response",
        "awaiting_independent_attempt"
      ].includes(lifecycleState.phase)
    ) {
      families.add("history");
      if (lifecycleState.activeInterventionId) {
        refs.push({
          id: lifecycleState.activeInterventionId,
          sourceType: "proactive_intervention",
          capturedAt: lifecycleState.responseSubmittedAt
            || lifecycleState.acceptedAt
        });
      }
    }
    db.getQuizResultsByUserUnit(userId, resolved.unit.id)
      .slice(0, 30)
      .forEach((row) => refs.push({
        id: row.id,
        sourceType: "quiz_result",
        capturedAt: row.created_at
      }));
  }

  const latestEvent = rows
    .map((row) => ({ row, at: proactiveEventAt(row), type: proactiveEventType(row) }))
    .filter((entry) => entry.at > 0 && entry.at <= now)
    .sort((left, right) => right.at - left.at)[0] || null;
  if (latestEvent) {
    evidence.dwellSeconds = Math.max(0, Math.floor((now - latestEvent.at) / 1000));
    const boundaryAgeMs = now - latestEvent.at;
    evidence.naturalBoundary = proactiveNaturalBoundaryEventTypes.has(latestEvent.type)
      && boundaryAgeMs >= 0
      && boundaryAgeMs <= 12_000;
    evidence.boundaryEventType = evidence.naturalBoundary ? latestEvent.type : "";
  }
  if (signal.kind === "quiet_dwell") {
    if (signal.boundaryRecheck === true) {
      const boundaryAfterCandidate = pendingQuiet.valid
        && latestEvent
        && evidence.naturalBoundary
        && latestEvent.at >= pendingQuiet.candidateAt;
      evidence.naturalBoundary = Boolean(boundaryAfterCandidate);
      evidence.boundaryEventType = boundaryAfterCandidate ? latestEvent.type : "";
      if (boundaryAfterCandidate) {
        const pendingFamilies = Array.isArray(pendingQuiet.evidence.families)
          ? pendingQuiet.evidence.families
          : [];
        pendingFamilies
          .filter((family) => ["time", "result"].includes(family))
          .forEach((family) => families.add(family));
        evidence.dwellSeconds = Math.max(
          0,
          Number(pendingQuiet.evidence.dwellSeconds || 0)
        );
        evidence.confirmedGapCount = Math.max(
          evidence.confirmedGapCount,
          Number(pendingQuiet.evidence.confirmedGapCount || 0)
        );
        (Array.isArray(pendingQuiet.evidence.evidenceRefs)
          ? pendingQuiet.evidence.evidenceRefs
          : []
        ).forEach((ref) => refs.push(ref));
        refs.push({
          id: latestEvent.row.id,
          sourceType: "interaction",
          eventType: latestEvent.type,
          capturedAt: latestEvent.row.created_at
        });
      }
    } else if (
      evidence.dwellSeconds >= assistantMinimumDwellSeconds(resolved, resolved.scene?.type)
    ) {
      families.add("time");
      if (evidence.confirmedGapCount > 0) families.add("result");
      if (latestEvent) {
        refs.push({
          id: latestEvent.row.id,
          sourceType: "interaction",
          eventType: latestEvent.type,
          capturedAt: latestEvent.row.created_at
        });
      }
    }
  }

  if (signal.kind === "repeated_parameter") {
    const requestedParameter = boundedLearningText(signal.parameter, 120);
    const commits = rows
      .map((row) => ({
        row,
        at: proactiveEventAt(row),
        type: proactiveEventType(row),
        parameter: proactiveParameter(row)
      }))
      .filter((entry) => (
        entry.type === "parameter_commit"
        && entry.at > 0
        && entry.at <= now
        && now - entry.at <= 45_000
        && (!requestedParameter || entry.parameter === requestedParameter)
      ))
      .sort((left, right) => left.at - right.at);
    evidence.parameterCommitCount = commits.length;
    if (commits.length >= 3) {
      families.add("process");
      families.add("task");
      const firstAt = commits[0].at;
      evidence.taskProgressSinceFirstCommit = rows.filter((row) => {
        const at = proactiveEventAt(row);
        return at >= firstAt && at <= now && [
          "courseware_interaction_complete",
          "courseware_observable_evidence_captured",
          "courseware_challenge_result"
        ].includes(proactiveEventType(row));
      }).length;
      commits.slice(-5).forEach((entry) => refs.push({
        id: entry.row.id,
        sourceType: "interaction",
        eventType: entry.type,
        capturedAt: entry.row.created_at
      }));
    }
  }
  if (signal.kind === "independent_attempt_outcome") {
    const responseSubmittedAt = Date.parse(
      lifecycleState.responseSubmittedAt || ""
    );
    const attempt = rows
      .map((row) => ({
        row,
        at: proactiveEventAt(row),
        type: proactiveEventType(row),
        success: proactiveIndependentAttemptResult(row)
      }))
      .filter((entry) => (
        [
          "courseware_challenge_result",
          "courseware_formative_check_submitted"
        ].includes(entry.type)
        && entry.at > 0
        && entry.at <= now
        && now - entry.at <= 2 * 60 * 1000
        && (
          !Number.isFinite(responseSubmittedAt)
          || entry.at >= responseSubmittedAt
        )
        && typeof entry.success === "boolean"
      ))
      .sort((left, right) => right.at - left.at)[0] || null;
    if (attempt) {
      const adapter = proactivePolicy.adapterForChapter(resolved.unit.chapterId || proactiveStudyConfig.chapterId);
      const matching = adapter?.coursewareVerificationMatch?.({
        knowledgePointId: resolved.unit.knowledgePointId || resolved.unit.id,
        supportLevel: lifecycleState.supportLevel || policyState.current_level,
        data: attempt.row.payload?.data || {}
      }) || { eligible: false, reasonCode: "courseware_matching_unavailable" };
      evidence.coursewareVerificationMatch = {
        ...matching,
        eventId: attempt.row.id,
        challengeId: boundedLearningText(attempt.row.payload?.data?.challenge_id, 180)
      };
      refs.push({
        id: attempt.row.id,
        sourceType: "interaction",
        eventType: attempt.type,
        capturedAt: attempt.row.created_at
      });
      if (!matching.eligible) {
        evidence.families = Array.from(families);
        return evidence;
      }
      evidence.independentAttemptVerified = true;
      evidence.independentAttemptSuccess = attempt.success;
      evidence.confirmedCorrect = attempt.success ? 1 : 0;
      evidence.confirmedIncorrect = attempt.success ? 0 : 1;
      evidence.questionCount = 1;
      evidence.verificationSource = "courseware_semantic_event";
      evidence.verificationCheckId = `courseware-event:${attempt.row.id}`;
      evidence.verificationEvidenceScope = matching.evidenceScope;
      evidence.verificationSubSkill = matching.subSkill;
      evidence.verificationMatchingVersion = matching.matchingVersion;
      evidence.verificationMatchReason = matching.reasonCode;
      evidence.verificationEventType = attempt.type;
      evidence.verificationStage = proactivePolicy.lifecycle
        .verificationStageForSupportLevel(
          lifecycleState.supportLevel || policyState.current_level
        ) || "after_l1";
      families.add("task");
      if (lifecycleState.phase === "awaiting_independent_attempt") {
        families.add("history");
      }
    }
  }
  evidence.families = Array.from(families);
  return evidence;
}

function mergeProactiveEvidence(rebuilt = {}, trusted = null) {
  if (!trusted || typeof trusted !== "object" || Array.isArray(trusted)) {
    return rebuilt;
  }
  return {
    ...rebuilt,
    ...trusted,
    families: Array.from(new Set([
      ...(Array.isArray(rebuilt.families) ? rebuilt.families : []),
      ...(Array.isArray(trusted.families) ? trusted.families : [])
    ])),
    evidenceRefs: [
      ...(Array.isArray(rebuilt.evidenceRefs) ? rebuilt.evidenceRefs : []),
      ...(Array.isArray(trusted.evidenceRefs) ? trusted.evidenceRefs : [])
    ]
  };
}

function proactiveSilentAssistantDecision(policyDecision = {}) {
  const reason = policyDecision.reasonCodes?.[0] || "policy_stay_silent";
  const messages = {
    protected_assessment_stage: "当前是独立测量阶段，知点保持安静。",
    experiment_assignment_pending: "完成章前测后，知点才会启用本章实验政策。",
    participant_not_enrolled: "当前未加入本章主动学习研究，知点不会展示实验性主动提示。",
    participant_withdrawn: "你已退出本章研究，知点不会再展示实验性主动提示。",
    participation_config_required: "本章研究参与配置尚未冻结，主动政策保持关闭。",
    policy_mode_off: "当前主动政策已关闭。",
    intervention_budget_exhausted: "知点今天已减少主动打扰。",
    policy_cooldown_active: "正在遵守学生的冷却与降频选择。",
    open_intervention_exists: "当前已有一条建议等待处理，知点暂不重复打扰。",
    quiet_dwell_waiting_for_boundary: "知点先记录这处停留，等你完成当前一步后再判断是否需要介入。",
    quiet_dwell_boundary_not_verified: "还没有出现合适的任务边界，知点继续保持安静。",
    quiet_dwell_pending_absent: "这次边界没有对应的待评估停留证据，知点保持安静。"
  };
  return {
    action: "stay_silent",
    intervene: false,
    eyebrow: "",
    title: "",
    body: "",
    actionLabel: "",
    draftQuestion: "",
    assistantPrompt: "",
    replyOptions: [],
    interactionMode: "none",
    contextMode: "unit",
    contextSummary: "",
    why: messages[reason] || "当前证据不足或不适合打断，知点保持安静。",
    confidence: Math.max(0, 1 - Number(policyDecision.uncertaintyScore ?? 1))
  };
}

function publicProactivePolicyState(row = {}, options = {}) {
  const pendingQuiet = proactivePendingQuietCandidate(row);
  const studentPreference = proactiveStudentPreferences.has(
    String(options.studentPreference || row.student_preference || "")
  )
    ? String(options.studentPreference || row.student_preference)
    : "standard";
  const lifecycleState = proactivePolicy.lifecycle.normalize(
    parseStoredJson(row.lifecycle_json || "{}", {})
  );
  const scopePreference = ["standard", "off"].includes(
    String(row.scope_preference || "")
  )
    ? String(row.scope_preference)
    : "standard";
  const adapter = proactivePolicy.adapterForChapter(
    proactiveStudyConfig.chapterId
  );
  const checkLevel = row.current_level || lifecycleState.supportLevel;
  // Pre-v2 waiting episodes did not persist the issued check id.
  const issuedCheckId = lifecycleState.activeVerificationCheckId
    || `${row.scope_key}-probe-${String(checkLevel).toLowerCase()}-v1`;
  const candidateCheck = studentPreference !== "off"
    && lifecycleState.phase === "awaiting_independent_attempt"
    ? adapter?.publicVerificationCheck?.(
        row.scope_key || "",
        checkLevel,
        issuedCheckId
      )
    : null;
  const verificationCheck = candidateCheck
    && candidateCheck.id !== lifecycleState.lastVerificationCheckId
    ? candidateCheck
    : null;
  return {
    scopeKey: row.scope_key || "",
    dismissStreak: Number(row.dismiss_streak || 0),
    cooldownUntil: row.cooldown_until || "",
    currentLevel: row.current_level || "L0",
    fadeLevel: Number(row.fade_level || 0),
    studentPreference,
    scopePreference,
    lastReasonCode: row.last_reason_code || "",
    pendingCandidateKind: pendingQuiet.kind,
    pendingCandidateAt: pendingQuiet.candidateAtIso,
    pendingCandidateExpiresAt: pendingQuiet.expiresAtIso,
    pendingBoundaryEvaluation: pendingQuiet.valid,
    lifecycle: {
      phase: lifecycleState.phase,
      activeAction: lifecycleState.activeAction,
      supportLevel: lifecycleState.supportLevel,
      reasonCode: lifecycleState.reasonCode,
      acceptedAt: lifecycleState.acceptedAt,
      responseSubmittedAt: lifecycleState.responseSubmittedAt,
      lastOutcome: lifecycleState.lastOutcome,
      lastOutcomeAt: lifecycleState.lastOutcomeAt,
      lastVerificationCheckId: lifecycleState.lastVerificationCheckId,
      activeVerificationCheckId: lifecycleState.activeVerificationCheckId,
      attemptCount: lifecycleState.attemptCount,
      successEvidenceCount: lifecycleState.successEvidenceCount,
      frictionEvidenceCount: lifecycleState.frictionEvidenceCount
    },
    verificationCheck,
    updatedAt: row.updated_at || ""
  };
}

function proactivePolicyStateRecord(existing = {}, {
  userId,
  scopeKey,
  updatedAt,
  lastReasonCode = existing.last_reason_code || "",
  pendingCandidateKind = existing.pending_candidate_kind || "",
  pendingCandidateAt = existing.pending_candidate_at || "",
  pendingCandidateExpiresAt = existing.pending_candidate_expires_at || "",
  pendingEvidence = parseStoredJson(existing.pending_evidence_json || "{}", {}),
  currentLevel = existing.current_level || "L0",
  fadeLevel = Number(existing.fade_level || 0),
  studentPreference = existing.student_preference || "standard",
  scopePreference = existing.scope_preference || "standard",
  cooldownUntil = existing.cooldown_until || "",
  lifecycle = parseStoredJson(existing.lifecycle_json || "{}", {})
} = {}) {
  return {
    user_id: userId,
    experiment_id: proactiveStudyConfig.experimentId,
    scope_key: scopeKey,
    dismiss_streak: Number(existing.dismiss_streak || 0),
    cooldown_until: cooldownUntil,
    current_level: currentLevel,
    fade_level: fadeLevel,
    student_preference: proactiveStudentPreferences.has(String(studentPreference))
      ? String(studentPreference)
      : "standard",
    scope_preference: ["standard", "off"].includes(String(scopePreference))
      ? String(scopePreference)
      : "standard",
    last_reason_code: lastReasonCode,
    pending_candidate_kind: pendingCandidateKind,
    pending_candidate_at: pendingCandidateAt,
    pending_candidate_expires_at: pendingCandidateExpiresAt,
    pending_evidence: pendingEvidence,
    lifecycle,
    updated_at: updatedAt
  };
}

function proactivePolicyStateSnapshot(row = {}) {
  const lifecycleState = proactivePolicy.lifecycle.normalize(
    parseStoredJson(row.lifecycle_json || "{}", {})
  );
  return {
    scopeKey: row.scope_key || "",
    dismissStreak: Number(row.dismiss_streak || 0),
    cooldownUntil: row.cooldown_until || "",
    currentLevel: row.current_level || "L0",
    fadeLevel: Number(row.fade_level || 0),
    studentPreference: proactiveStudentPreferences.has(
      String(row.student_preference || "")
    )
      ? String(row.student_preference)
      : "standard",
    scopePreference: ["standard", "off"].includes(
      String(row.scope_preference || "")
    )
      ? String(row.scope_preference)
      : "standard",
    pendingCandidateKind: row.pending_candidate_kind || "",
    pendingCandidateAt: row.pending_candidate_at || "",
    pendingCandidateExpiresAt: row.pending_candidate_expires_at || "",
    lifecycle: lifecycleState
  };
}

function proactiveStudyState(userId, chapterId) {
  const managed = chapterId === proactiveStudyConfig.chapterId;
  const participation = managed
    ? proactiveParticipationForUser(userId)
    : null;
  const pretest = managed ? proactivePretestStratum(userId) : null;
  const assignment = managed ? proactiveAssignmentForUser(userId) : null;
  const runtime = managed ? proactiveExperimentRuntime() : null;
  const activeOutcomeSession = managed
    ? activeProactiveOutcomeSession(userId)
    : null;
  const studentPreference = managed
    ? proactiveGlobalPreference(userId)
    : "standard";
  return {
    managed,
    ...proactivePolicy.publicConfig(proactiveStudyConfig),
    participation: publicProactiveParticipation(participation),
    assignmentPending: Boolean(
      managed
      && participation?.status === "enrolled"
      && !assignment
    ),
    assignment: publicProactiveAssignment(assignment),
    runtime: runtime ? publicProactiveRuntime(runtime) : null,
    studentPreference,
    globalPreferenceControlEnabled: proactiveGlobalPreferenceControlEnabled,
    pretest,
    outcomeSession: publicProactiveOutcomeSession(activeOutcomeSession),
    agentAssistanceBlocked: Boolean(activeOutcomeSession),
    candidateCollectionEnabled: Boolean(
      managed
      && proactiveStudyConfig.mode !== "off"
      && runtime?.status !== "paused"
      && !activeOutcomeSession
      && participation?.status === "enrolled"
    ),
    policyStates: assignment
      ? db.listProactivePolicyStates(userId, proactiveStudyConfig.experimentId)
          .filter((row) => row.scope_key !== proactiveGlobalScopeKey)
          .map((row) => publicProactivePolicyState(row, {
            studentPreference: proactiveStudentPreference(
              userId,
              row.scope_key
            )
          }))
      : []
  };
}

function coursewareSemanticEventType(type = "", payload = {}) {
  if (String(type || "") !== "interaction") return "";
  const eventType = boundedLearningText(
    payload?.eventType || payload?.data?.eventType,
    120
  ).toLowerCase();
  return eventType.startsWith("courseware_") ? eventType : "";
}

function serverBoundLearningEvent(userId, type = "", payload = {}, createdAt = nowIso()) {
  const sourcePayload = payload && typeof payload === "object" && !Array.isArray(payload)
    ? payload
    : {};
  const eventType = coursewareSemanticEventType(type, sourcePayload);
  const learningGeneration = db.currentLearningGeneration(userId, createdAt);
  if (!eventType) {
    return { payload: sourcePayload, learningGeneration };
  }
  const assignment = db.getExperimentAssignment(
    userId,
    proactiveStudyConfig.experimentId
  );
  const research = sourcePayload.research
    && typeof sourcePayload.research === "object"
    && !Array.isArray(sourcePayload.research)
    ? sourcePayload.research
    : {};
  return {
    learningGeneration,
    payload: {
      ...sourcePayload,
      research: {
        ...research,
        experimentId: proactiveStudyConfig.experimentId,
        condition: assignment?.condition || "unassigned",
        cohort: assignment?.cohort || proactiveStudyConfig.cohort || "",
        assignmentVersion: assignment?.assignment_version
          || proactiveStudyConfig.assignmentVersion
          || "",
        learningGeneration,
        protocolFingerprint: proactiveProtocolFingerprint
      }
    }
  };
}

function proactiveDecisionRecord({
  decisionId,
  userId,
  assignment,
  policyDecision,
  evidence,
  budget,
  policyStateBefore,
  policyStateAfter
}) {
  return {
    id: decisionId,
    user_id: userId,
    experiment_id: proactiveStudyConfig.experimentId,
    condition: policyDecision.condition || assignment?.condition || "unassigned",
    cohort: assignment?.cohort || proactiveStudyConfig.cohort || "",
    stratum: assignment?.stratum || "unassigned",
    assignment_version: assignment?.assignment_version
      || proactiveStudyConfig.assignmentVersion
      || "",
    learning_generation: db.currentLearningGeneration(
      userId,
      policyDecision.createdAt
    ),
    policy_mode: proactiveStudyConfig.mode,
    chapter_id: policyDecision.chapterId,
    unit_id: policyDecision.unitId,
    scope_key: policyDecision.scopeKey || policyDecision.unitId,
    scene_type: policyDecision.sceneType,
    candidate_kind: policyDecision.candidateKind,
    policy_version: proactiveStudyConfig.policyVersion,
    contract_version: proactiveStudyConfig.contractVersion,
    adapter_version: proactiveStudyConfig.adapterVersion,
    decision: policyDecision.decision,
    delivery_decision: policyDecision.deliveryDecision,
    action: policyDecision.action,
    support_level: policyDecision.supportLevel,
    help_need_score: policyDecision.helpNeedScore,
    interruptibility_score: policyDecision.interruptibilityScore,
    uncertainty_score: policyDecision.uncertaintyScore,
    reason_codes: policyDecision.reasonCodes,
    evidence_refs: evidence.evidenceRefs || [],
    evidence_snapshot: {
      ...evidence,
      evidenceRefs: undefined,
      policyStateBefore,
      policyStateAfter,
      lifecycleOutcome: policyDecision.lifecycleOutcome || "",
      stateTransition: policyDecision.stateTransition || null,
      policyAdjustments: policyDecision.policyAdjustments || {},
      learnerOptions: policyDecision.learnerOptions || {}
    },
    budget_snapshot: budget,
    created_at: policyDecision.createdAt,
    expires_at: policyDecision.expiresAt
  };
}

function proactivePolicyStateAfterResolution({
  existing = {},
  decision = {},
  interventionId = "",
  resolution,
  resolvedAt,
  latencyMs = 0
}) {
  const priorStreak = Math.max(0, Number(existing.dismiss_streak || 0));
  const negative = resolution === "dismissed" || resolution === "ignored";
  const nextStreak = negative
    ? Math.min(3, priorStreak + 1)
    : resolution === "accepted" ? 0 : priorStreak;
  const baseCooldownMs = 10 * 60 * 1000;
  const cooldownMs = resolution === "accepted"
    ? baseCooldownMs
    : resolution === "snoozed"
      ? 15 * 60 * 1000
    : negative ? baseCooldownMs * Math.max(1, nextStreak) : 0;
  const lifecycleState = proactivePolicy.lifecycle.afterResolution({
    lifecycle: parseStoredJson(existing.lifecycle_json || "{}", {}),
    decision,
    interventionId,
    resolution,
    resolvedAt
  });
  return {
    user_id: decision.user_id,
    experiment_id: decision.experiment_id,
    scope_key: decision.scope_key || decision.unit_id,
    dismiss_streak: nextStreak,
    cooldown_until: cooldownMs
      ? new Date(Date.parse(resolvedAt) + cooldownMs).toISOString()
      : existing.cooldown_until || "",
    current_level: resolution === "accepted"
      ? decision.support_level || "L0"
      : existing.current_level || "L0",
    fade_level: Math.max(0, Number(existing.fade_level || 0)),
    student_preference: existing.student_preference || "standard",
    scope_preference: existing.scope_preference || "standard",
    last_reason_code: `${resolution}:${Math.max(0, Math.trunc(Number(latencyMs || 0)))}`,
    pending_candidate_kind: existing.pending_candidate_kind || "",
    pending_candidate_at: existing.pending_candidate_at || "",
    pending_candidate_expires_at: existing.pending_candidate_expires_at || "",
    pending_evidence: parseStoredJson(existing.pending_evidence_json || "{}", {}),
    lifecycle: lifecycleState,
    updated_at: resolvedAt
  };
}

function publicAssistantConversation(row = {}) {
  return {
    id: row.id || "",
    threadKey: row.thread_key || "",
    chapterId: row.chapter_id || "",
    unitId: row.unit_id || "",
    knowledgePointId: row.knowledge_point_id || "",
    title: String(row.title || "新对话"),
    archivedAt: row.archived_at || "",
    messageCount: Number(row.message_count || 0),
    createdAt: row.created_at || "",
    updatedAt: row.updated_at || row.created_at || ""
  };
}

function buildAssistantConversation(userId, resolved, timestamp, title = "新对话") {
  return {
    id: crypto.randomUUID(),
    user_id: userId,
    thread_key: resolved.threadKey,
    chapter_id: resolved.unit.chapterId,
    unit_id: resolved.unit.id,
    knowledge_point_id: resolved.unit.knowledgePointId || "",
    title: String(title || "新对话").replace(/\s+/g, " ").trim().slice(0, 42) || "新对话",
    created_at: timestamp,
    updated_at: timestamp
  };
}

function assistantConversationForRequest(userId, resolved, conversationId = "", timestamp = nowIso()) {
  const requestedId = String(conversationId || "").trim();
  if (requestedId) {
    const existing = db.getLearningAssistantConversation(userId, requestedId);
    if (!existing || existing.thread_key !== resolved.threadKey) {
      const error = new Error("当前对话不存在，或不属于这个学习位置。");
      error.code = "assistant_conversation_not_found";
      error.status = 404;
      throw error;
    }
    return {
      conversation: publicAssistantConversation(existing),
      record: existing,
      createConversation: false
    };
  }
  const record = buildAssistantConversation(userId, resolved, timestamp);
  return {
    conversation: publicAssistantConversation({ ...record, message_count: 0 }),
    record,
    createConversation: true
  };
}

function parseAssistantContextJson(value = "") {
  try {
    const parsed = typeof value === "string" ? JSON.parse(value || "{}") : value;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function parseStoredJson(value, fallback) {
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    return parsed === undefined || parsed === null ? fallback : parsed;
  } catch {
    return fallback;
  }
}

function publicAssistantMessage(row = {}) {
  const storedContext = parseAssistantContextJson(row.context_json || row.context);
  const {
    assistantGuidance,
    assistantIntent,
    proactivePrompt,
    proactivePromptVisible,
    ...contextRef
  } = storedContext;
  return {
    id: row.id || "",
    role: row.role === "assistant" ? "assistant" : "user",
    content: String(row.content || ""),
    contextRef,
    guidance: assistantGuidance || null,
    assistantIntent: assistantIntent || "",
    proactivePrompt: row.role === "user" ? boundedLearningText(proactivePrompt, 500, true) : "",
    proactivePromptVisible: proactivePromptVisible !== false,
    provider: row.provider || "",
    quizSubmitted: Number(row.quiz_submitted || 0) === 1,
    createdAt: row.created_at || ""
  };
}

function boundedLearningText(value = "", limit = 1200, multiline = false) {
  const source = String(value ?? "").replace(/\u0000/g, "");
  return (multiline ? source.replace(/\r\n?/g, "\n") : source.replace(/\s+/g, " "))
    .trim()
    .slice(0, limit);
}

function pruneAssistantInterventions(now = Date.now()) {
  for (const [id, record] of assistantInterventionRegistry) {
    if (Number(record?.expiresAt || 0) <= now) assistantInterventionRegistry.delete(id);
  }
  while (assistantInterventionRegistry.size > assistantInterventionRegistryLimit) {
    const oldest = assistantInterventionRegistry.keys().next().value;
    if (!oldest) break;
    assistantInterventionRegistry.delete(oldest);
  }
}

function issueAssistantIntervention(
  userId,
  resolved,
  decision = {},
  now = Date.now(),
  options = {}
) {
  const assistantPrompt = boundedLearningText(decision.assistantPrompt, 500, true);
  if (!assistantPrompt || decision.interactionMode !== "student_reply") return "";
  pruneAssistantInterventions(now);
  const id = boundedLearningText(options.id, 180) || crypto.randomUUID();
  assistantInterventionRegistry.set(id, {
    id,
    decisionId: boundedLearningText(options.decisionId, 180),
    userId,
    unitId: resolved.unit.id,
    threadKey: resolved.threadKey,
    action: boundedLearningText(decision.action, 40),
    assistantPrompt,
    reviewIndex: Math.max(0, Math.trunc(Number(decision.reviewIndex || 0))),
    reviewTotal: Math.max(0, Math.trunc(Number(decision.reviewTotal || 0))),
    questionId: boundedLearningText(decision.questionId, 180),
    promptVisible: decision.promptVisible !== false,
    sourceMessageId: boundedLearningText(decision.sourceMessageId, 180),
    reviewAction: ["continue", "next"].includes(String(decision.reviewAction || ""))
      ? String(decision.reviewAction)
      : "",
    createdAt: now,
    expiresAt: now + assistantInterventionTtlMs
  });
  return id;
}

function getAssistantIntervention(
  userId,
  unitId,
  interventionId = "",
  { consume = false, now = Date.now() } = {}
) {
  const id = boundedLearningText(interventionId, 180);
  if (!id) return null;
  pruneAssistantInterventions(now);
  const record = assistantInterventionRegistry.get(id);
  if (
    !record
    || record.userId !== userId
    || record.unitId !== unitId
    || record.expiresAt <= now
  ) return null;
  if (consume) assistantInterventionRegistry.delete(id);
  return record;
}

function proactiveDecisionInteractionAccess(userId, decision = {}, now = Date.now()) {
  if (
    !decision?.id
    || decision.user_id !== userId
    || decision.experiment_id !== proactiveStudyConfig.experimentId
    || decision.chapter_id !== proactiveStudyConfig.chapterId
    || decision.delivery_decision !== "intervene"
    || Number(decision.learning_generation || 1)
      !== db.currentLearningGeneration(userId)
    || proactiveStudyConfig.mode !== "active"
  ) {
    return { ok: false, reason: "inactive", scopeKey: "" };
  }
  const expiresAt = Date.parse(decision.expires_at || "");
  if (Number.isFinite(expiresAt) && expiresAt <= now) {
    return {
      ok: false,
      reason: "expired",
      scopeKey: decision.scope_key || decision.unit_id
    };
  }
  const runtime = proactiveExperimentRuntime();
  if (runtime?.status === "paused") {
    return {
      ok: false,
      reason: "paused",
      scopeKey: decision.scope_key || decision.unit_id
    };
  }
  const participation = db.getProactiveParticipation(
    userId,
    decision.experiment_id
  );
  const scopeKey = decision.scope_key || decision.unit_id;
  if (
    participation?.status !== "enrolled"
    || !scopeKey
    || proactiveStudentPreference(userId, scopeKey) === "off"
    || Boolean(activeProactiveOutcomeSession(userId))
  ) {
    return { ok: false, reason: "inactive", scopeKey };
  }
  return { ok: true, reason: "", scopeKey };
}

function policyAssistantInterventionAccess(userId, unitId, record = {}) {
  if (!record.decisionId) return { ok: true, code: "", terminal: false };
  const decision = db.getProactiveDecisionForUser(userId, record.decisionId);
  const intervention = db.getProactiveIntervention(record.id);
  if (
    !decision
    || !intervention
    || intervention.user_id !== userId
    || intervention.decision_id !== decision.id
    || decision.experiment_id !== proactiveStudyConfig.experimentId
    || decision.unit_id !== unitId
    || decision.delivery_decision !== "intervene"
    || decision.action !== record.action
    || Number(decision.learning_generation || 1)
      !== db.currentLearningGeneration(userId)
  ) {
    return {
      ok: false,
      code: "assistant_intervention_expired",
      terminal: true
    };
  }
  if (intervention.status !== "accepted") {
    const pendingAcceptance = ["offered", "shown"].includes(intervention.status);
    return {
      ok: false,
      code: pendingAcceptance
        ? "assistant_intervention_not_accepted"
        : "assistant_intervention_expired",
      terminal: !pendingAcceptance
    };
  }
  const runtime = proactiveExperimentRuntime();
  if (runtime?.status === "paused") {
    return {
      ok: false,
      code: "assistant_intervention_paused",
      terminal: false
    };
  }
  const participation = db.getProactiveParticipation(
    userId,
    decision.experiment_id
  );
  const scopeKey = decision.scope_key || decision.unit_id;
  if (
    participation?.status !== "enrolled"
    || proactiveStudentPreference(userId, scopeKey) === "off"
  ) {
    return {
      ok: false,
      code: "assistant_intervention_expired",
      terminal: true
    };
  }
  if (proactivePolicy.lifecycle.isLifecycleAction(decision.action)) {
    const policyState = db.getProactivePolicyState(
      userId,
      decision.experiment_id,
      scopeKey
    ) || {};
    const lifecycleState = proactivePolicy.lifecycle.normalize(
      parseStoredJson(policyState.lifecycle_json || "{}", {})
    );
    if (
      lifecycleState.phase !== "accepted_pending_response"
      || lifecycleState.activeDecisionId !== decision.id
      || lifecycleState.activeInterventionId !== record.id
    ) {
      return {
        ok: false,
        code: "assistant_intervention_expired",
        terminal: true
      };
    }
  }
  return { ok: true, code: "", terminal: false };
}

function normalizeAssistantQuizReviewProgress(progress = {}) {
  const source = progress && typeof progress === "object" && !Array.isArray(progress)
    ? progress
    : {};
  const status = [
    "awaiting_choice",
    "awaiting_reply",
    "answered",
    "stopped",
    "completed"
  ].includes(String(source.status || ""))
    ? String(source.status)
    : "";
  const reviewTotal = Math.max(0, Math.min(30, Math.trunc(Number(source.reviewTotal || 0))));
  const reviewIndex = Math.max(
    0,
    Math.min(Math.max(0, reviewTotal - 1), Math.trunc(Number(source.reviewIndex || 0)))
  );
  const targetReviewIndex = Math.max(
    0,
    Math.min(Math.max(0, reviewTotal - 1), Math.trunc(Number(source.targetReviewIndex ?? reviewIndex)))
  );
  return {
    status,
    done: status === "completed" || source.done === true,
    reviewIndex,
    reviewTotal,
    questionId: boundedLearningText(source.questionId, 180),
    action: ["continue", "next"].includes(String(source.action || "")) ? String(source.action) : "",
    targetReviewIndex,
    targetQuestionId: boundedLearningText(source.targetQuestionId, 180),
    completionMessage: boundedLearningText(source.completionMessage, 220, true)
  };
}

function assistantQuizReviewProgress(row = {}) {
  const storedContext = parseAssistantContextJson(row.context_json || row.context);
  return normalizeAssistantQuizReviewProgress(
    storedContext?.assistantGuidance?.quizReviewProgress
  );
}

function updateAssistantQuizReviewProgress(row = {}, progress = {}) {
  if (!row?.user_id || !row?.id) return null;
  const storedContext = parseAssistantContextJson(row.context_json || row.context);
  const assistantGuidance = storedContext.assistantGuidance
    && typeof storedContext.assistantGuidance === "object"
    && !Array.isArray(storedContext.assistantGuidance)
    ? storedContext.assistantGuidance
    : {};
  return db.updateLearningAssistantMessageContext(row.user_id, row.id, {
    ...storedContext,
    assistantGuidance: {
      ...assistantGuidance,
      quizReviewProgress: normalizeAssistantQuizReviewProgress(progress)
    }
  });
}

function quizReviewIndexFromProgress(resolved, progress = {}, { target = false } = {}) {
  const incorrectItems = Array.isArray(resolved?.quizAttempt?.incorrectItems)
    ? resolved.quizAttempt.incorrectItems
    : [];
  if (!incorrectItems.length) return -1;
  const questionId = boundedLearningText(
    target ? progress.targetQuestionId : progress.questionId,
    180
  );
  if (questionId) {
    const matchedIndex = incorrectItems.findIndex((item) => item.questionId === questionId);
    if (matchedIndex >= 0) return matchedIndex;
  }
  const numericIndex = Math.trunc(Number(
    target ? progress.targetReviewIndex : progress.reviewIndex
  ));
  return numericIndex >= 0 && numericIndex < incorrectItems.length ? numericIndex : -1;
}

function quizReviewDecisionForIndex(resolved, reviewIndex) {
  const continuation = learningAssistant.quizReviewContinuation({
    resolved,
    completedIndex: Math.trunc(Number(reviewIndex || 0)) - 1
  });
  return continuation.done ? null : continuation.decision;
}

function publicQuizReviewPrompt({
  resolved,
  sceneType = "",
  decision,
  interventionId,
  sourceMessageId = "",
  reviewAction = "",
  visible = true
} = {}) {
  if (!decision?.assistantPrompt || !interventionId) return null;
  return {
    id: `quiz-review-${interventionId}`,
    content: decision.assistantPrompt,
    action: decision.action,
    unitId: resolved.unit.id,
    sceneType: boundedLearningText(sceneType, 80),
    interventionId,
    sourceMessageId: boundedLearningText(sourceMessageId, 180),
    reviewAction: ["continue", "next"].includes(reviewAction) ? reviewAction : "",
    visible: visible !== false,
    contextSummary: decision.contextSummary || "",
    replyOptions: decision.replyOptions || []
  };
}

function assistantRecentConversation(userId, resolved, limit = 4) {
  const latest = db.listLearningAssistantConversations(userId, resolved.threadKey, 1)[0];
  if (!latest) return [];
  return db.getLearningAssistantMessages(
    userId,
    resolved.threadKey,
    Math.max(1, Math.min(Number(limit || 4), 8)),
    latest.id
  ).map((row) => ({
    role: row.role,
    content: row.content
  }));
}

function attachAssistantQuizAttempt(resolved, quizResults = []) {
  if (!resolved?.isQuiz) return null;
  resolved.quizAttempt = learningAssistant.buildQuizAttemptSummary({
    resolved,
    results: quizResults
  });
  return resolved.quizAttempt;
}

function sendAssistantSignalMismatch(res, message) {
  sendJson(res, 400, {
    ok: false,
    code: "assistant_intervention_signal_mismatch",
    message
  });
}

function assistantMinimumDwellSeconds(resolved, sceneType = "") {
  const normalizedSceneType = boundedLearningText(
    sceneType || resolved?.scene?.type || resolved?.contextRef?.sceneType,
    80
  );
  const readingScene = resolved?.unit?.type === "slide" || normalizedSceneType === "slide";
  return readingScene ? 150 : 90;
}

function learningNoteError(code, message, status = 400) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

function sanitizeLearningNoteInput(userId, input = {}, noteIdOverride = "") {
  const noteId = boundedLearningText(noteIdOverride || input.id, 180);
  if (!/^[A-Za-z0-9:_-]{1,180}$/.test(noteId)) {
    throw learningNoteError("learning_note_id_invalid", "笔记标识无效。");
  }
  const unitId = boundedLearningText(input.unitId || input.contextRef?.unitId, 180);
  const unit = assistantContextIndex.units.get(unitId);
  if (!unit) throw learningNoteError("learning_note_unit_invalid", "这条笔记对应的学习位置不存在。");
  const sanitizedContext = learningAssistant.sanitizeClientContext(input.contextRef);
  const locatorSource = input.locator && typeof input.locator === "object" ? input.locator : {};
  const createdAt = Number.isFinite(Date.parse(input.createdAt || ""))
    ? new Date(input.createdAt).toISOString()
    : nowIso();
  const updatedAt = Number.isFinite(Date.parse(input.updatedAt || ""))
    ? new Date(input.updatedAt).toISOString()
    : nowIso();
  return {
    id: noteId,
    user_id: userId,
    thread_key: unit.knowledgePointId ? `knowledge:${unit.knowledgePointId}` : `unit:${unit.id}`,
    chapter_id: unit.chapterId || "",
    unit_id: unit.id,
    excerpt: boundedLearningText(input.excerpt || sanitizedContext.excerpt, 900, true),
    note: boundedLearningText(input.note, 1200, true),
    color: ["amber", "mint", "blue", "pink"].includes(input.color) ? input.color : "amber",
    context: {
      ...sanitizedContext,
      chapterId: unit.chapterId || "",
      unitId: unit.id,
      unitLabel: unit.unitLabel || "",
      knowledgePointId: unit.knowledgePointId || "",
      knowledgePointLabel: unit.knowledgePointLabel || "",
      resourceFingerprint: boundedLearningText(input.contextRef?.resourceFingerprint, 120)
    },
    locator: {
      source: locatorSource.source === "iframe" ? "iframe" : "document",
      semanticId: boundedLearningText(locatorSource.semanticId, 180),
      exact: boundedLearningText(locatorSource.exact, 900, true),
      prefix: boundedLearningText(locatorSource.prefix, 80, true),
      suffix: boundedLearningText(locatorSource.suffix, 80, true),
      startOffset: Number.isInteger(locatorSource.startOffset) && locatorSource.startOffset >= 0
        ? locatorSource.startOffset
        : -1,
      endOffset: Number.isInteger(locatorSource.endOffset) && locatorSource.endOffset >= 0
        ? locatorSource.endOffset
        : -1
    },
    created_at: createdAt,
    updated_at: updatedAt
  };
}

function publicLearningNote(row = {}) {
  return {
    id: row.client_id || row.id || "",
    ownerKey: row.user_id || "",
    threadKey: row.thread_key || "",
    chapterId: row.chapter_id || "",
    unitId: row.unit_id || "",
    excerpt: row.excerpt || "",
    note: row.note || "",
    color: row.color || "amber",
    contextRef: parseAssistantContextJson(row.context_json),
    locator: parseAssistantContextJson(row.locator_json),
    createdAt: row.created_at || "",
    updatedAt: row.updated_at || row.created_at || ""
  };
}

function writeNdjson(res, payload) {
  if (!res.writableEnded && !res.destroyed) {
    res.write(`${JSON.stringify(payload)}\n`);
  }
}

async function generateAssistantTurn({
  resolved,
  question,
  history,
  quizSubmitted,
  assistantIntent = "",
  proactivePrompt = ""
}) {
  const prompt = learningAssistant.buildAssistantPrompt({
    resolved,
    question,
    history,
    quizSubmitted,
    assistantIntent,
    proactivePrompt
  });
  const clarification = learningAssistant.unresolvedVisualReferenceReply({ resolved, question });
  if (clarification) {
    return {
      provider: "grounding-guard",
      text: clarification,
      policy: prompt.policy,
      guidance: { ...prompt.guidance, showUnderstandingCheck: false, actions: [] },
      fallback: false
    };
  }
  const providerInfo = assistantProviderInfo();
  if (!providerInfo.live) {
    return {
      provider: providerInfo.id,
      text: learningAssistant.mockAssistantAnswer({
        resolved,
        question,
        quizSubmitted,
        assistantIntent,
        proactivePrompt
      }),
      policy: prompt.policy,
      guidance: prompt.guidance,
      fallback: false
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  try {
    const result = await llm.completeChat({
      system: prompt.system,
      user: prompt.user,
      maxTokens: 700,
      model: String(
        process.env.LEARNING_ASSISTANT_MODEL
        || process.env.OPENAI_COMPATIBLE_MODEL
        || ""
      ).trim() || undefined,
      signal: controller.signal
    });
    const text = learningAssistant.enforceQuizSafety(result.text, {
      isQuiz: resolved.isQuiz,
      quizSubmitted,
      resolved
    });
    return {
      provider: result.provider || providerInfo.id,
      text: text || learningAssistant.mockAssistantAnswer({
        resolved,
        question,
        quizSubmitted,
        assistantIntent,
        proactivePrompt
      }),
      policy: prompt.policy,
      guidance: prompt.guidance,
      fallback: !text
    };
  } catch (error) {
    console.warn("Learning assistant provider fallback:", error.message);
    return {
      provider: "fallback",
      text: learningAssistant.mockAssistantAnswer({
        resolved,
        question,
        quizSubmitted,
        assistantIntent,
        proactivePrompt
      }),
      policy: prompt.policy,
      guidance: prompt.guidance,
      fallback: true
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function generateInterventionDecision({ resolved, signal, history = [] }) {
  const providerInfo = assistantProviderInfo();
  const fallback = () => learningAssistant.deterministicInterventionDecision({ resolved, signal });
  if (!providerInfo.live) {
    return { provider: providerInfo.id, decision: fallback(), fallback: false };
  }
  const prompt = learningAssistant.buildInterventionPrompt({ resolved, signal, history });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const result = await llm.completeChat({
      system: prompt.system,
      user: prompt.user,
      jsonHint: true,
      maxTokens: 340,
      model: String(
        process.env.LEARNING_ASSISTANT_MODEL
        || process.env.OPENAI_COMPATIBLE_MODEL
        || ""
      ).trim() || undefined,
      signal: controller.signal
    });
    return {
      provider: result.provider || providerInfo.id,
      decision: learningAssistant.parseInterventionDecision(result.text, { resolved, signal }),
      fallback: false
    };
  } catch (error) {
    console.warn("Learning assistant intervention fallback:", error.message);
    return { provider: "fallback", decision: fallback(), fallback: true };
  } finally {
    clearTimeout(timeout);
  }
}

async function handleManagedProactiveIntervention({
  res,
  auth,
  resolved,
  signal,
  quizAttempt,
  sceneType,
  trustedEvidence = null,
  responseExtras = {}
}) {
  const now = new Date();
  const participation = proactiveParticipationForUser(auth.participant.id);
  const assignment = proactiveAssignmentForUser(auth.participant.id);
  const policyScopeKey = boundedLearningText(
    resolved.unit.knowledgePointId || resolved.unit.id,
    180
  );
  const studentPreference = proactiveStudentPreference(
    auth.participant.id,
    policyScopeKey
  );
  let policyState = assignment
    ? db.getProactivePolicyState(
        auth.participant.id,
        proactiveStudyConfig.experimentId,
        policyScopeKey
      ) || {}
    : {};
  policyState = {
    ...policyState,
    student_preference: studentPreference
  };
  const policyStateBefore = proactivePolicyStateSnapshot(policyState);
  const evidence = mergeProactiveEvidence(
    proactiveEvidenceForRequest({
      userId: auth.participant.id,
      resolved,
      signal,
      quizAttempt,
      policyState,
      now: now.getTime()
    }),
    trustedEvidence
  );
  let interventionBudget = proactiveInterventionBudgetInfo(auth.participant.id, now);
  const experimentRuntime = proactiveExperimentRuntime();
  const policyRuntime = {
    ...experimentRuntime,
    participationStatus: participation?.status || "not_enrolled"
  };
  let policyDecision = proactivePolicy.evaluate({
    config: proactiveStudyConfig,
    assignment,
    context: {
      chapterId: resolved.unit.chapterId,
      unitId: resolved.unit.id,
      knowledgePointId: resolved.unit.knowledgePointId || "",
      policyScopeKey,
      sceneType,
      isQuiz: resolved.isQuiz,
      quizSubmitted: resolved.quizSubmitted,
      phase: resolved.unit.phase || ""
    },
    signal,
    evidence,
    policyState,
    budget: interventionBudget,
    runtime: policyRuntime,
    now: now.getTime()
  });
  const waitingForBoundary = policyDecision.reasonCodes.includes(
    "quiet_dwell_waiting_for_boundary"
  );
  const consumedPendingBoundary = signal.kind === "quiet_dwell"
    && signal.boundaryRecheck === true
    && evidence.pendingCandidateValid
    && evidence.naturalBoundary;
  const stalePendingBoundary = signal.kind === "quiet_dwell"
    && signal.boundaryRecheck === true
    && !evidence.pendingCandidateValid
    && policyState.pending_candidate_kind === "quiet_dwell";
  if (waitingForBoundary) {
    policyState = db.upsertProactivePolicyState(proactivePolicyStateRecord(
      policyState,
      {
        userId: auth.participant.id,
        scopeKey: policyScopeKey,
        updatedAt: policyDecision.createdAt,
        lastReasonCode: "quiet_dwell_waiting_for_boundary",
        pendingCandidateKind: "quiet_dwell",
        pendingCandidateAt: policyDecision.createdAt,
        pendingCandidateExpiresAt: policyDecision.expiresAt,
        pendingEvidence: {
          families: evidence.families.filter((family) => (
            family === "time" || family === "result"
          )),
          dwellSeconds: evidence.dwellSeconds,
          confirmedGapCount: evidence.confirmedGapCount,
          evidenceRefs: evidence.evidenceRefs,
          capturedAt: policyDecision.createdAt
        }
      }
    ));
  } else if (consumedPendingBoundary || stalePendingBoundary) {
    policyState = db.upsertProactivePolicyState(proactivePolicyStateRecord(
      policyState,
      {
        userId: auth.participant.id,
        scopeKey: policyScopeKey,
        updatedAt: policyDecision.createdAt,
        lastReasonCode: consumedPendingBoundary
          ? "quiet_dwell_boundary_consumed"
          : "quiet_dwell_pending_expired",
        pendingCandidateKind: "",
        pendingCandidateAt: "",
        pendingCandidateExpiresAt: "",
        pendingEvidence: {}
      }
    ));
  }

  if (policyDecision.displayAllowed) {
    db.expireProactiveInterventions({
      at: now.toISOString(),
      userId: auth.participant.id,
      experimentId: proactiveStudyConfig.experimentId,
      scopeKey: policyScopeKey
    });
    const openIntervention = db.getOpenProactiveInterventionForScope(
      auth.participant.id,
      proactiveStudyConfig.experimentId,
      policyScopeKey,
      now.toISOString()
    );
    if (openIntervention) {
      evidence.openInterventionId = openIntervention.id;
      policyDecision = {
        ...policyDecision,
        deliveryDecision: "stay_silent",
        displayAllowed: false,
        reasonCodes: Array.from(new Set([
          ...(policyDecision.reasonCodes || []),
          "open_intervention_exists"
        ]))
      };
    }
  }

  let renderedDecision = proactiveSilentAssistantDecision(policyDecision);
  if (policyDecision.displayAllowed) {
    const adapter = proactivePolicy.adapterForChapter(resolved.unit.chapterId);
    const representationUnit = assistantContextIndex.units.get(policyScopeKey);
    const availableSceneTypes = representationUnit?.scenes instanceof Map
      ? Array.from(representationUnit.scenes.keys())
      : [];
    const candidate = adapter?.renderAction?.(policyDecision.action, {
      knowledgePointId: resolved.unit.knowledgePointId || "",
      unitId: resolved.unit.id,
      unitLabel: resolved.unit.unitLabel,
      targetUnitId: policyScopeKey,
      currentSceneType: sceneType,
      availableSceneTypes,
      signal,
      evidence,
      quizAttempt
    }) || learningAssistant.deterministicInterventionDecision({
      resolved,
      signal
    });
    if (
      candidate.intervene
      && candidate.action === policyDecision.action
    ) {
      renderedDecision = {
        ...candidate,
        supportLevel: policyDecision.supportLevel,
        learnerOptions: {
          canSnooze: policyDecision.learnerOptions?.canSnooze === true,
          canMuteScope: policyDecision.learnerOptions?.canMuteScope === true,
          canRequestAlternative: policyDecision.learnerOptions
            ?.canRequestAlternative === true
        },
        targetUnitId: candidate.targetUnitId
          || (candidate.action === "switch_representation"
            ? policyScopeKey
            : "")
      };
    } else {
      policyDecision = {
        ...policyDecision,
        deliveryDecision: "stay_silent",
        displayAllowed: false,
        reasonCodes: Array.from(new Set([
          ...(policyDecision.reasonCodes || []),
          "renderer_action_mismatch"
        ]))
      };
      renderedDecision = proactiveSilentAssistantDecision(policyDecision);
    }
  }

  if (policyDecision.displayAllowed) {
    interventionBudget = consumeAssistantInterventionBudget(auth.participant.id, now);
    if (!interventionBudget.ok) {
      policyDecision = {
        ...policyDecision,
        deliveryDecision: "stay_silent",
        displayAllowed: false,
        reasonCodes: Array.from(new Set([
          ...(policyDecision.reasonCodes || []),
          "intervention_budget_exhausted"
        ]))
      };
      renderedDecision = proactiveSilentAssistantDecision(policyDecision);
    }
  }

  if (
    policyDecision.stateTransition
    && proactivePolicy.lifecycle.isLifecycleAction(policyDecision.action)
    && !policyDecision.displayAllowed
  ) {
    const deliveryReason = [
      "intervention_budget_exhausted",
      "open_intervention_exists",
      "renderer_action_mismatch",
      "shadow_mode_suppressed",
      "control_condition_suppressed",
      "experiment_arm_display_suppressed",
      "arm_support_ceiling",
      "arm_representation_switch_disabled"
    ].find((code) => policyDecision.reasonCodes.includes(code))
      || "delivery_suppressed";
    const closedTransition = proactivePolicy.lifecycle.closeUndeliveredAction({
      transition: policyDecision.stateTransition,
      deliveryReason
    });
    policyDecision = {
      ...policyDecision,
      lifecycleOutcome: "support_escalation_not_delivered",
      stateTransition: closedTransition,
      followupOutcome: closedTransition.followupOutcome,
      reasonCodes: Array.from(new Set([
        ...(policyDecision.reasonCodes || []),
        "support_escalation_not_delivered"
      ]))
    };
  }

  const priorLifecycle = proactivePolicy.lifecycle.normalize(
    parseStoredJson(policyState.lifecycle_json || "{}", {})
  );
  if (policyDecision.followupOutcome && priorLifecycle.activeInterventionId) {
    db.updateProactiveInterventionFollowup({
      userId: auth.participant.id,
      interventionId: priorLifecycle.activeInterventionId,
      followupOutcome: {
        independentAttempt: {
          ...policyDecision.followupOutcome,
          unitId: resolved.unit.id,
          recordedAt: policyDecision.createdAt
        }
      },
      updatedAt: policyDecision.createdAt
    });
  }
  if (policyDecision.stateTransition) {
    const transition = policyDecision.stateTransition;
    policyState = db.upsertProactivePolicyState(proactivePolicyStateRecord(
      policyState,
      {
        userId: auth.participant.id,
        scopeKey: policyScopeKey,
        updatedAt: policyDecision.createdAt,
        lastReasonCode: policyDecision.lifecycleOutcome
          || "lifecycle_state_updated",
        currentLevel: transition.currentLevel || policyState.current_level || "L0",
        fadeLevel: Number(
          transition.fadeLevel ?? policyState.fade_level ?? 0
        ),
        cooldownUntil: Number(transition.cooldownMs || 0) > 0
          ? new Date(
              Date.parse(policyDecision.createdAt)
              + Number(transition.cooldownMs)
            ).toISOString()
          : policyState.cooldown_until || "",
        lifecycle: {
          ...(transition.lifecycle || {}),
          lastOutcomeAt: policyDecision.createdAt
        }
      }
    ));
  }
  const policyStateAfter = proactivePolicyStateSnapshot(policyState);

  const decisionId = crypto.randomUUID();
  db.insertProactiveDecision(proactiveDecisionRecord({
    decisionId,
    userId: auth.participant.id,
    assignment,
    policyDecision,
    evidence,
    budget: interventionBudget,
    policyStateBefore,
    policyStateAfter
  }));

  let interventionId = "";
  if (policyDecision.displayAllowed && renderedDecision.intervene) {
    interventionId = crypto.randomUUID();
    db.insertProactiveIntervention({
      id: interventionId,
      decision_id: decisionId,
      user_id: auth.participant.id,
      status: "offered",
      presentation: renderedDecision,
      created_at: policyDecision.createdAt,
      updated_at: policyDecision.createdAt
    });
    issueAssistantIntervention(
      auth.participant.id,
      resolved,
      renderedDecision,
      now.getTime(),
      { id: interventionId, decisionId }
    );
  }

  db.insertEvent({
    id: `${decisionId}:event`,
    user_id: auth.participant.id,
    type: "interaction",
    payload: {
      schemaVersion: 1,
      eventType: policyDecision.decision === "intervene"
        ? "proactive_decision_intervene"
        : "proactive_decision_silent",
      source: "proactive_policy",
      chapterId: resolved.unit.chapterId,
      unitId: resolved.unit.id,
      sceneType,
      research: {
        experimentId: proactiveStudyConfig.experimentId,
        condition: policyDecision.condition || "unassigned",
        cohort: assignment?.cohort || proactiveStudyConfig.cohort || ""
      },
      data: {
        decisionId,
        interventionId,
        policyMode: proactiveStudyConfig.mode,
        policyVersion: proactiveStudyConfig.policyVersion,
        contractVersion: proactiveStudyConfig.contractVersion,
        adapterVersion: proactiveStudyConfig.adapterVersion,
        candidateKind: signal.kind,
        policyDecision: policyDecision.decision,
        deliveryDecision: policyDecision.deliveryDecision,
        action: policyDecision.action,
        supportLevel: policyDecision.supportLevel,
        reasonCodes: policyDecision.reasonCodes
      },
      timing: {
        clientAt: policyDecision.createdAt,
        durationMs: 0
      }
    },
    created_at: policyDecision.createdAt
  });
  db.saveNow();

  sendJson(res, 200, {
    ok: true,
    provider: "deterministic-policy",
    fallback: false,
    ...responseExtras,
    decisionId,
    interventionId,
    decision: renderedDecision,
    study: {
      ...proactivePolicy.publicConfig(proactiveStudyConfig),
      participation: publicProactiveParticipation(participation),
      assignment: publicProactiveAssignment(assignment),
      assignmentPending: participation?.status === "enrolled" && !assignment,
      runtime: publicProactiveRuntime(experimentRuntime),
      studentPreference,
      deliveryDecision: policyDecision.deliveryDecision,
      policyState: publicProactivePolicyState(policyState, {
        studentPreference
      }),
      pendingBoundaryEvaluation: proactivePendingQuietCandidate(
        policyState,
        now.getTime()
      ).valid
    },
    interventionBudget,
    quota: assistantQuotaInfo(auth.participant.id)
  });
}

async function handleApi(req, res, url) {
  if (!checkRateLimit(req)) {
    sendJson(res, 429, { ok: false, message: "请求过于频繁，请稍后再试。" });
    return;
  }
  try {
    // ---- Auth ----
    if (req.method === "POST" && url.pathname === "/api/monitoring/errors") {
      const body = await readJsonBody(req);
      if (!body || typeof body !== "object" || Array.isArray(body)
        || Buffer.byteLength(JSON.stringify(body)) > 4096) {
        sendJson(res, 400, { ok: false });
        return;
      }
      errorMonitoring.capture(body, "browser");
      sendJson(res, 202, { ok: true });
      return;
    }
    if (url.pathname === "/api/admin/monitoring" && ["GET", "POST"].includes(req.method)) {
      if (!checkAdmin(req)) { sendJson(res, 403, { ok: false, message: "需要管理员密码。" }); return; }
      if (req.method === "POST") {
        const eventId = errorMonitoring.capture({ code: "monitor_test", file: "server.js" });
        const flushed = await errorMonitoring.flush();
        sendJson(res, 200, { ok: true, eventId, flushed,
          message: "测试事件已处理；Sentry接收情况请按事件编号到项目中核对。", data: errorMonitoring.status() });
      } else sendJson(res, 200, { ok: true, data: errorMonitoring.status() });
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/health") {
      sendJson(res, 200, {
        ok: true,
        time: nowIso(),
        appVersion: researchConfig.appVersion,
        basePath
      });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/research/config") {
      const courseVersion = String(learningRoute?.versionId || "").slice(0, 120);
      sendJson(res, 200, {
        ok: true,
        data: { ...researchConfig, courseVersion, courseAssessmentFingerprint }
      });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/admin/auth/status") {
      const localBypass = isLoopbackAdminRequest(req);
      sendJson(res, 200, {
        ok: true,
        data: {
          authenticated: checkAdmin(req),
          localBypass,
          tokenRequired: !localBypass
        }
      });
      return;
    }

    if (await systemAnnouncementApi.handle({
      req,
      res,
      url,
      db,
      authenticate,
      checkAdmin,
      readJsonBody,
      sendJson
    })) return;

    if (req.method === "GET" && learningRouteApiPaths.has(url.pathname)) {
      if (!publicLearningRouteJson) {
        sendJson(res, 404, { ok: false, message: "未找到多场景自适应学习路线。" });
        return;
      }
      sendPublicLearningRoute(req, res);
      return;
    }

    if (req.method === "GET" && url.pathname === flowTestRouteApiPath) {
      if (!checkAdmin(req)) {
        sendJson(res, 403, { ok: false, message: "需要管理员密码。" });
        return;
      }
      if (!flowTestRouteJson) {
        sendJson(res, 404, { ok: false, message: "未找到课件检视路线。" });
        return;
      }
      send(res, 200, flowTestRouteJson, "application/json; charset=utf-8");
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
      db.saveNow();
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
      if (!user) {
        recordFailedAuthAttempt(req, identifier);
        sendJson(res, 404, {
          ok: false,
          code: "account_not_found",
          field: "identifier",
          message: "没有找到这个账号，请检查昵称或邮箱，或先注册账号。"
        });
        return;
      }
      if (!user.password_hash) {
        recordFailedAuthAttempt(req, identifier);
        sendJson(res, 409, {
          ok: false,
          code: "password_not_set",
          field: "identifier",
          message: "这个历史账号尚未设置密码。请切换到“注册”，使用同一昵称设置密码，原有学习记录会保留。"
        });
        return;
      }
      if (!verifyPassword(password, user.password_hash)) {
        recordFailedAuthAttempt(req, identifier);
        sendJson(res, 401, {
          ok: false,
          code: "password_incorrect",
          field: "password",
          message: "密码不正确，请重新输入。"
        });
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
      const validatedTarget = feedback.validateCoursewareFeedbackTarget(
        normalized.value,
        coursewareFeedbackTargetLookup
      );
      if (!validatedTarget.ok) {
        sendJson(res, 400, validatedTarget);
        return;
      }
      const feedbackValue = validatedTarget.value;
      const feedbackId = crypto.randomUUID();
      const timestamp = nowIso();
      db.insertFeedback({
        id: feedbackId,
        user_id: auth.participant.id,
        ...feedbackValue,
        created_at: timestamp
      });
      db.insertEvent({
        id: crypto.randomUUID(),
        user_id: auth.participant.id,
        type: "feedback_submit",
        payload: {
          feedbackId,
          feedbackType: feedbackValue.feedback_type,
          targetScope: feedbackValue.target_scope,
          contentLength: feedbackValue.content.length
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
      const boundEvent = serverBoundLearningEvent(
        auth.participant.id,
        eventType,
        body.payload,
        timestamp
      );

      db.insertEvent({
        id: eventId,
        user_id: auth.participant.id,
        type: eventType,
        payload: boundEvent.payload,
        learning_generation: boundEvent.learningGeneration,
        created_at: timestamp
      });
      db.saveNow();

      sendJson(res, 200, { ok: true, eventId });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/learning/events") {
      const body = await readJsonBody(req);
      const auth = authenticate(req, body);
      if (!auth) { sendJson(res, 401, { ok: false, message: "请先登录。" }); return; }
      const events = Array.isArray(body.events) ? body.events.slice(0, 100) : [];
      const eventIds = [];
      const receivedAt = new Date();
      let previousEventTime = 0;

      events.forEach((item) => {
        const eventId = clientEventId(auth.participant.id, item);
        const requestedEventTime = trustedClientEventTime(item, receivedAt);
        const eventTime = Math.max(requestedEventTime, previousEventTime + 1);
        previousEventTime = eventTime;
        const eventType = String(item.type || "event").slice(0, 80);
        const createdAt = beijingIso(new Date(eventTime));
        const boundEvent = serverBoundLearningEvent(
          auth.participant.id,
          eventType,
          item.payload,
          createdAt
        );
        eventIds.push(eventId);
        db.insertEvent({
          id: eventId,
          user_id: auth.participant.id,
          type: eventType,
          payload: boundEvent.payload,
          learning_generation: boundEvent.learningGeneration,
          created_at: createdAt
        });
      });
      db.saveNow();

      sendJson(res, 200, { ok: true, eventIds });
      return;
    }

    // ---- Learning Snapshot ----
    if (req.method === "GET" && url.pathname === "/api/learning/snapshot") {
      const auth = authenticate(req);
      if (!auth) { sendJson(res, 401, { ok: false, message: "请先登录。" }); return; }
      const state = db.getLearningSnapshotState(auth.participant.id, nowIso());
      const snap = state.snapshot;
      if (!snap) {
        sendJson(res, 200, {
          ok: true,
          snapshot: null,
          generation: state.generation,
          revision: state.revision
        });
        return;
      }
      let data = {};
      try { data = JSON.parse(snap.data); } catch { /* use empty */ }
      data = db.normalizeLearningSnapshot(data);
      sendJson(res, 200, {
        ok: true,
        snapshot: {
          ...data,
          clientCapturedAt: data.capturedAt || "",
          capturedAt: snap.created_at
        },
        generation: state.generation,
        revision: state.revision
      });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/learning/snapshot") {
      const body = await readJsonBody(req);
      const auth = authenticate(req, body);
      if (!auth) { sendJson(res, 401, { ok: false, message: "请先登录。" }); return; }
      const version = snapshotVersion(body);
      if (!version.validGeneration || !version.validBaseRevision) {
        const state = db.getLearningSnapshotState(auth.participant.id, nowIso());
        sendJson(res, 409, {
          ok: false,
          code: "snapshot_version_required",
          message: "当前页面版本过旧，请刷新页面后继续学习。",
          generation: state.generation,
          revision: state.revision
        });
        return;
      }
      const timestamp = nowIso();
      const snapshotData = body.snapshot || {};
      const snapshotId = crypto.randomUUID();

      const result = db.saveLearningSnapshot({
        id: snapshotId,
        user_id: auth.participant.id,
        reason: String(body.reason || "manual").slice(0, 80),
        data: snapshotData,
        generation: version.generation,
        baseRevision: version.baseRevision,
        created_at: timestamp
      });
      if (!result.ok) {
        sendSnapshotConflict(res, result);
        return;
      }

      db.upsertUser(auth.participant.id, auth.participant.nickname, auth.participant.created_at, timestamp);
      let quizReconciliationResult = {
        inserted: 0,
        updated: 0,
        skipped: 0,
        total: 0,
        candidates: 0
      };
      try {
        quizReconciliationResult = reconcileSnapshotQuizResultsForUser(
          auth.participant.id,
          result.data,
          result.generation,
          timestamp
        );
        if (quizReconciliationResult.inserted || quizReconciliationResult.updated) db.saveNow();
      } catch (error) {
        // A snapshot must remain saveable even if a legacy row cannot be
        // reconciled; the next snapshot or startup scan can retry it.
        console.warn("Quiz result reconciliation skipped:", error.message);
      }
      sendJson(res, 200, {
        ok: true,
        snapshotId,
        generation: result.generation,
        revision: result.revision,
        quizReconciliation: quizReconciliationResult
      });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/learning/reset") {
      const body = await readJsonBody(req);
      const auth = authenticate(req, body);
      if (!auth) { sendJson(res, 401, { ok: false, message: "请先登录。" }); return; }
      const version = snapshotVersion(body);
      if (!version.validGeneration || !version.validBaseRevision) {
        const state = db.getLearningSnapshotState(auth.participant.id, nowIso());
        sendJson(res, 409, {
          ok: false,
          code: "snapshot_version_required",
          message: "当前页面版本过旧，请刷新页面后再重置学习记录。",
          generation: state.generation,
          revision: state.revision
        });
        return;
      }
      const timestamp = nowIso();
      const snapshotData = body.snapshot || {};
      const snapshotId = crypto.randomUUID();

      const result = db.resetLearningSnapshot({
        id: snapshotId,
        user_id: auth.participant.id,
        data: snapshotData,
        generation: version.generation,
        baseRevision: version.baseRevision,
        created_at: timestamp
      });
      if (!result.ok) {
        sendSnapshotConflict(res, result);
        return;
      }
      db.upsertUser(auth.participant.id, auth.participant.nickname, auth.participant.created_at, timestamp);
      let quizReconciliationResult = {
        inserted: 0,
        updated: 0,
        skipped: 0,
        total: 0,
        candidates: 0
      };
      try {
        quizReconciliationResult = reconcileSnapshotQuizResultsForUser(
          auth.participant.id,
          snapshotData,
          result.generation,
          timestamp
        );
        if (quizReconciliationResult.inserted || quizReconciliationResult.updated) db.saveNow();
      } catch (error) {
        console.warn("Learning reset quiz reconciliation skipped:", error.message);
      }

      const withdrawnOutcomeSessions = db
        .withdrawActiveProactiveOutcomeSessionsForUser({
          userId: auth.participant.id,
          experimentId: proactiveStudyConfig.experimentId,
          reason: "learning_reset",
          endedAt: timestamp
        });
      withdrawnOutcomeSessions.forEach((session) => {
        const started = Date.parse(session.started_at || "");
        const ended = Date.parse(session.ended_at || timestamp);
        db.insertEvent({
          id: `${session.id}:withdrawn`,
          user_id: auth.participant.id,
          type: "interaction",
          payload: {
            schemaVersion: 1,
            eventType: "proactive_outcome_withdrawn",
            source: "proactive_outcome_measurement",
            chapterId: session.chapter_id,
            unitId: `${session.chapter_id}-${session.stage}`,
            sceneType: "",
            research: {
              experimentId: session.experiment_id,
              condition: session.condition,
              cohort: session.cohort || proactiveStudyConfig.cohort || ""
            },
            data: {
              sessionId: session.id,
              stageId: session.stage,
              withdrawalReason: "learning_reset",
              instrumentVersion: session.instrument_version,
              learningGeneration: Number(session.learning_generation || 1),
              nextLearningGeneration: result.generation,
              agentAssistanceAllowed: false
            },
            timing: {
              clientAt: session.ended_at || timestamp,
              durationMs: Number.isFinite(started) && Number.isFinite(ended)
                ? Math.max(0, Math.trunc(ended - started))
                : 0
            }
          },
          created_at: session.ended_at || timestamp
        });
      });
      const proactiveReset = {
        closedInterventions: db.closeOpenProactiveInterventionsForUser({
          userId: auth.participant.id,
          experimentId: proactiveStudyConfig.experimentId,
          resolution: "learning_reset",
          resolvedAt: timestamp,
          followupOutcome: {
            outcome: "learning_generation_reset",
            generation: result.generation
          }
        }),
        clearedPolicyStates: db.clearProactivePolicyStatesForUser({
          userId: auth.participant.id,
          experimentId: proactiveStudyConfig.experimentId,
          preserveScopeKey: proactiveGlobalScopeKey
        }),
        withdrawnOutcomeSessions: withdrawnOutcomeSessions.length
      };
      if (
        proactiveReset.closedInterventions
        || proactiveReset.clearedPolicyStates
        || proactiveReset.withdrawnOutcomeSessions
      ) {
        db.insertEvent({
          id: crypto.randomUUID(),
          user_id: auth.participant.id,
          type: "interaction",
          payload: {
            schemaVersion: 1,
            eventType: "proactive_policy_lifecycle_reset",
            source: "proactive_policy",
            chapterId: proactiveStudyConfig.chapterId,
            unitId: "",
            sceneType: "",
            research: {
              experimentId: proactiveStudyConfig.experimentId
            },
            data: {
              generation: result.generation,
              ...proactiveReset
            },
            timing: {
              clientAt: timestamp,
              durationMs: 0
            }
          },
          created_at: timestamp
        });
        db.saveNow();
      }

      sendJson(res, 200, {
        ok: true,
        snapshotId,
        cleared: true,
        generation: result.generation,
        revision: result.revision,
        quizReconciliation: quizReconciliationResult,
        proactiveReset
      });
      return;
    }

    // ---- 知点：上下文学习侧栏 ----
    if (req.method === "GET" && url.pathname === "/api/learning/assistant/status") {
      const auth = authenticate(req);
      if (!auth) { sendJson(res, 401, { ok: false, message: "请先登录。" }); return; }
      sendJson(res, 200, {
        ok: true,
        provider: assistantProviderInfo(),
        courseVersion: assistantContextIndex.routeVersion || "",
        conversationTurnLimit: assistantConversationTurnLimit,
        quota: assistantQuotaInfo(auth.participant.id)
      });
      return;
    }

    if (
      ["GET", "POST"].includes(req.method)
      && url.pathname === "/api/learning/assistant/conversations"
    ) {
      const body = req.method === "POST" ? await readJsonBody(req) : {};
      const auth = authenticate(req, body);
      if (!auth) { sendJson(res, 401, { ok: false, message: "请先登录。" }); return; }
      const unitId = String(
        req.method === "GET" ? url.searchParams.get("unitId") || "" : body.unitId || ""
      ).trim();
      const chapterId = String(
        req.method === "GET" ? url.searchParams.get("chapterId") || "" : body.chapterId || ""
      ).trim();
      const sceneType = String(
        req.method === "GET" ? url.searchParams.get("sceneType") || "" : body.sceneType || ""
      ).trim();
      const quizSubmitted = Boolean(
        unitId && db.getQuizResultsByUserUnit(auth.participant.id, unitId).length
      );
      let resolved;
      try {
        resolved = learningAssistant.resolveAssistantContext({
          index: assistantContextIndex,
          chapterId,
          unitId,
          sceneType,
          contextRef: {
            kind: "unit",
            scope: unitId.endsWith("-pre") || unitId.endsWith("-formative") || unitId.endsWith("-post")
              ? "quiz"
              : "lesson"
          },
          quizSubmitted
        });
      } catch (error) {
        sendJson(res, error.status || 400, {
          ok: false,
          code: error.code || "assistant_context_error",
          message: error.message
        });
        return;
      }
      if (resolved.isQuiz && !quizSubmitted) {
        sendAssistantQuizLocked(res, auth.participant.id);
        return;
      }
      if (req.method === "POST") {
        sendJson(res, 200, {
          ok: true,
          threadKey: resolved.threadKey,
          draft: true,
          conversation: null,
          quota: assistantQuotaInfo(auth.participant.id)
        });
        return;
      }
      const conversations = db.listLearningAssistantConversations(
        auth.participant.id,
        resolved.threadKey,
        80,
        {
          query: url.searchParams.get("q") || "",
          archived: url.searchParams.get("archived") === "1"
        }
      ).map(publicAssistantConversation);
      sendJson(res, 200, {
        ok: true,
        threadKey: resolved.threadKey,
        provider: assistantProviderInfo(),
        quota: assistantQuotaInfo(auth.participant.id),
        conversations
      });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/learning/proactive/state") {
      const auth = authenticate(req);
      if (!auth) { sendJson(res, 401, { ok: false, message: "请先登录。" }); return; }
      const chapterId = boundedLearningText(
        url.searchParams.get("chapterId") || proactiveStudyConfig.chapterId,
        120
      );
      sendJson(res, 200, {
        ok: true,
        data: proactiveStudyState(auth.participant.id, chapterId)
      });
      return;
    }

    if (
      req.method === "POST"
      && url.pathname === "/api/learning/proactive/participation"
    ) {
      const body = await readJsonBody(req);
      const auth = authenticate(req, body);
      if (!auth) {
        sendJson(res, 401, { ok: false, message: "请先登录。" });
        return;
      }
      const chapterId = boundedLearningText(
        body.chapterId || proactiveStudyConfig.chapterId,
        120
      );
      if (chapterId !== proactiveStudyConfig.chapterId) {
        sendJson(res, 400, {
          ok: false,
          code: "proactive_participation_chapter_invalid",
          message: "当前章节不属于这项主动学习研究。"
        });
        return;
      }
      const action = boundedLearningText(body.action, 40).toLowerCase();
      const recordedAt = nowIso();
      if (action === "enroll") {
        const existing = proactiveParticipationForUser(
          auth.participant.id,
          { createImplicit: false }
        );
        if (existing?.status === "withdrawn") {
          sendJson(res, 409, {
            ok: false,
            code: "proactive_participation_withdrawn_terminal",
            message: "本实验中的退出记录不可撤销；你仍可继续正常学习。"
          });
          return;
        }
        if (
          proactiveStudyConfig.participationMode === "explicit-consent"
          && !proactiveStudyConfig.participationReady
        ) {
          sendJson(res, 503, {
            ok: false,
            code: "proactive_participation_config_incomplete",
            message: "研究说明与同意版本尚未配置完成，暂时不能加入。"
          });
          return;
        }
        if (
          proactiveStudyConfig.participationMode === "explicit-consent"
          && (
            body.confirmed !== true
            || boundedLearningText(body.consentVersion, 120)
              !== proactiveStudyConfig.consentVersion
          )
        ) {
          sendJson(res, 409, {
            ok: false,
            code: "proactive_consent_confirmation_required",
            message: "请先阅读当前版本的研究说明，并明确确认参加。"
          });
          return;
        }
        const enrollment = db.enrollProactiveParticipation({
          user_id: auth.participant.id,
          experiment_id: proactiveStudyConfig.experimentId,
          enrollment_basis: proactiveStudyConfig.participationMode,
          consent_version: proactiveStudyConfig.consentVersion,
          consented_at: recordedAt,
          updated_by: "student",
          created_at: recordedAt,
          updated_at: recordedAt
        });
        if (!enrollment.ok) {
          sendJson(res, 409, {
            ok: false,
            code: "proactive_participation_withdrawn_terminal",
            message: "本实验中的退出记录不可撤销；你仍可继续正常学习。"
          });
          return;
        }
        if (!enrollment.idempotent) {
          db.insertEvent({
            id: crypto.randomUUID(),
            user_id: auth.participant.id,
            type: "interaction",
            payload: {
              schemaVersion: 1,
              eventType: "proactive_participation_enrolled",
              source: "proactive_participation",
              chapterId,
              unitId: "",
              sceneType: "",
              research: {
                experimentId: proactiveStudyConfig.experimentId,
                cohort: proactiveStudyConfig.cohort
              },
              data: {
                enrollmentBasis: enrollment.participation.enrollment_basis,
                consentVersion: enrollment.participation.consent_version
              },
              timing: {
                clientAt: recordedAt,
                durationMs: 0
              }
            },
            created_at: recordedAt
          });
        }
        db.saveNow();
        sendJson(res, 200, {
          ok: true,
          idempotent: enrollment.idempotent,
          data: proactiveStudyState(auth.participant.id, chapterId)
        });
        return;
      }
      if (action === "withdraw") {
        const withdrawalReasons = new Set([
          "student_withdrawal",
          "burden",
          "privacy_concern",
          "other"
        ]);
        const requestedReason = boundedLearningText(
          body.reason || "student_withdrawal",
          80
        );
        const withdrawalReason = withdrawalReasons.has(requestedReason)
          ? requestedReason
          : "student_withdrawal";
        const withdrawal = db.withdrawProactiveParticipation({
          user_id: auth.participant.id,
          experiment_id: proactiveStudyConfig.experimentId,
          enrollment_basis: proactiveStudyConfig.participationMode,
          consent_version: proactiveStudyConfig.consentVersion,
          withdrawn_at: recordedAt,
          withdrawal_reason: withdrawalReason,
          updated_by: "student",
          created_at: recordedAt,
          updated_at: recordedAt
        });
        const closure = withdrawal.idempotent
          ? {
              closedInterventions: 0,
              closedLifecycleEpisodes: 0,
              withdrawnOutcomeSessions: []
            }
          : closeProactiveSupportForStudyWithdrawal(
              auth.participant.id,
              recordedAt
            );
        if (!withdrawal.idempotent) {
          db.insertEvent({
            id: crypto.randomUUID(),
            user_id: auth.participant.id,
            type: "interaction",
            payload: {
              schemaVersion: 1,
              eventType: "proactive_participation_withdrawn",
              source: "proactive_participation",
              chapterId,
              unitId: "",
              sceneType: "",
              research: {
                experimentId: proactiveStudyConfig.experimentId,
                cohort: proactiveStudyConfig.cohort
              },
              data: {
                withdrawalReason,
                closedInterventions: closure.closedInterventions,
                closedLifecycleEpisodes: closure.closedLifecycleEpisodes,
                withdrawnOutcomeSessions: closure.withdrawnOutcomeSessions.length,
                assignmentRetainedForItt: Boolean(
                  db.getExperimentAssignment(
                    auth.participant.id,
                    proactiveStudyConfig.experimentId
                  )
                )
              },
              timing: {
                clientAt: recordedAt,
                durationMs: 0
              }
            },
            created_at: recordedAt
          });
        }
        db.saveNow();
        sendJson(res, 200, {
          ok: true,
          idempotent: withdrawal.idempotent,
          closure: {
            closedInterventions: closure.closedInterventions,
            closedLifecycleEpisodes: closure.closedLifecycleEpisodes,
            withdrawnOutcomeSessions: closure.withdrawnOutcomeSessions.length
          },
          data: proactiveStudyState(auth.participant.id, chapterId)
        });
        return;
      }
      sendJson(res, 400, {
        ok: false,
        code: "proactive_participation_action_invalid",
        message: "研究参与操作无效。"
      });
      return;
    }

    if (
      req.method === "GET"
      && url.pathname === "/api/learning/proactive/outcomes"
    ) {
      const auth = authenticate(req);
      if (!auth) {
        sendJson(res, 401, { ok: false, message: "请先登录。" });
        return;
      }
      const chapterId = boundedLearningText(
        url.searchParams.get("chapterId") || proactiveStudyConfig.chapterId,
        120
      );
      sendJson(res, 200, {
        ok: true,
        data: proactiveOutcomeState(auth.participant.id, chapterId)
      });
      return;
    }

    if (
      req.method === "POST"
      && url.pathname === "/api/learning/proactive/outcomes/start"
    ) {
      const body = await readJsonBody(req);
      const auth = authenticate(req, body);
      if (!auth) {
        sendJson(res, 401, { ok: false, message: "请先登录。" });
        return;
      }
      const chapterId = boundedLearningText(
        body.chapterId || proactiveStudyConfig.chapterId,
        120
      );
      const stageId = boundedLearningText(body.stageId, 80);
      const stateBefore = proactiveOutcomeState(
        auth.participant.id,
        chapterId
      );
      const stage = stateBefore.stages.find((entry) => entry.id === stageId);
      if (!stateBefore.managed || !stage) {
        sendJson(res, 400, {
          ok: false,
          code: "proactive_outcome_stage_invalid",
          message: "当前测量阶段不存在。"
        });
        return;
      }
      if (stateBefore.activeSession) {
        if (stateBefore.activeSession.stageId === stageId) {
          sendJson(res, 200, {
            ok: true,
            idempotent: true,
            sessionId: stateBefore.activeSession.id,
            startedAt: stateBefore.activeSession.startedAt,
            data: stateBefore
          });
          return;
        }
        sendJson(res, 409, {
          ok: false,
          code: "proactive_outcome_session_active",
          message: "请先完成或退出当前正在进行的独立测量。",
          session: stateBefore.activeSession
        });
        return;
      }
      if (stage.status === "submitted") {
        sendJson(res, 409, {
          ok: false,
          code: "proactive_outcome_already_submitted",
          message: "本阶段已经提交，不能重复作答。"
        });
        return;
      }
      if (stage.status === "withdrawn") {
        sendJson(res, 409, {
          ok: false,
          code: "proactive_outcome_already_withdrawn",
          message: "本阶段已经退出，失访状态已被记录。"
        });
        return;
      }
      if (stage.status !== "available") {
        sendJson(res, 409, {
          ok: false,
          code: "proactive_outcome_stage_locked",
          message: stage.reason || "本阶段尚未开放。",
          unlockAt: stage.unlockAt || ""
        });
        return;
      }
      const assignment = proactiveAssignmentForUser(auth.participant.id);
      if (!assignment) {
        sendJson(res, 409, {
          ok: false,
          code: "proactive_assignment_pending",
          message: "本章实验分组尚未完成。"
        });
        return;
      }
      const startedAt = nowIso();
      const sessionId = crypto.randomUUID();
      const startResult = db.startProactiveOutcomeSession({
        id: sessionId,
        user_id: auth.participant.id,
        experiment_id: proactiveStudyConfig.experimentId,
        condition: assignment.condition,
        cohort: assignment.cohort || proactiveStudyConfig.cohort || "",
        chapter_id: chapterId,
        stage: stageId,
        instrument_version: stage.instrumentVersion,
        protocol_fingerprint: proactiveProtocolFingerprint,
        learning_generation: db.currentLearningGeneration(
          auth.participant.id,
          startedAt
        ),
        started_at: startedAt
      });
      if (!startResult.ok) {
        sendJson(res, 409, {
          ok: false,
          code: startResult.reason === "another_session_active"
            ? "proactive_outcome_session_active"
            : "proactive_outcome_session_conflict",
          message: startResult.reason === "another_session_active"
            ? "请先完成或退出当前正在进行的独立测量。"
            : "本阶段已经存在测量记录，不能重新开始。",
          session: publicProactiveOutcomeSession(startResult.session)
        });
        return;
      }
      const closed = startResult.idempotent
        ? { closedInterventions: 0, closedLifecycleEpisodes: 0 }
        : closeProactiveSupportForOutcomeSession(
            auth.participant.id,
            startResult.session.started_at
          );
      if (!startResult.idempotent) {
        db.insertEvent({
          id: `${startResult.session.id}:started`,
          user_id: auth.participant.id,
          type: "interaction",
          payload: {
            schemaVersion: 1,
            eventType: "proactive_outcome_started",
            source: "proactive_outcome_measurement",
            chapterId,
            unitId: `${chapterId}-${stageId}`,
            sceneType: "",
            research: {
              experimentId: proactiveStudyConfig.experimentId,
              condition: assignment.condition,
              cohort: assignment.cohort || proactiveStudyConfig.cohort || ""
            },
            data: {
              sessionId: startResult.session.id,
              stageId,
              instrumentVersion: stage.instrumentVersion,
              protocolFingerprint: proactiveProtocolFingerprint,
              learningGeneration: Number(
                startResult.session.learning_generation || 1
              ),
              agentAssistanceAllowed: false,
              closedInterventions: closed.closedInterventions,
              closedLifecycleEpisodes: closed.closedLifecycleEpisodes
            },
            timing: {
              clientAt: startResult.session.started_at,
              durationMs: 0
            }
          },
          created_at: startResult.session.started_at
        });
      }
      db.saveNow();
      const stateAfter = proactiveOutcomeState(
        auth.participant.id,
        chapterId
      );
      sendJson(res, 200, {
        ok: true,
        idempotent: startResult.idempotent,
        sessionId: startResult.session.id,
        startedAt: startResult.session.started_at,
        data: stateAfter
      });
      return;
    }

    if (
      req.method === "POST"
      && url.pathname === "/api/learning/proactive/outcomes/draft"
    ) {
      const body = await readJsonBody(req);
      const auth = authenticate(req, body);
      if (!auth) {
        sendJson(res, 401, { ok: false, message: "请先登录。" });
        return;
      }
      const chapterId = boundedLearningText(
        body.chapterId || proactiveStudyConfig.chapterId,
        120
      );
      const stageId = boundedLearningText(body.stageId, 80);
      const sessionId = boundedLearningText(body.sessionId, 180);
      const session = sessionId
        ? db.getProactiveOutcomeSessionById(
            auth.participant.id,
            sessionId
          )
        : null;
      if (
        !session
        || session.experiment_id !== proactiveStudyConfig.experimentId
        || session.chapter_id !== chapterId
        || session.stage !== stageId
      ) {
        sendJson(res, 409, {
          ok: false,
          code: "proactive_outcome_session_required",
          message: "当前没有可保存的独立测量会话。"
        });
        return;
      }
      const instrument = outcomeRegistry.forVersion(session.instrument_version || "");
      if (!instrument) {
        sendJson(res, 409, {
          ok: false,
          code: "proactive_outcome_version_unavailable",
          message: "原测量题库版本暂不可用，已有草稿不会被替换。"
        });
        return;
      }
      const validIds = new Set(instrument.publicStage(stageId)?.items.map((item) => item.id));
      const unknownItems = Object.keys(body.responses || {}).some((id) => !validIds.has(id));
      const responses = unknownItems ? null : instrument.sanitizeResponses(
        stageId,
        body.responses
      );
      if (!responses) {
        sendJson(res, 400, {
          ok: false,
          code: "proactive_outcome_draft_invalid",
          message: "本阶段作答草稿包含无效选项。"
        });
        return;
      }
      const updatedAt = nowIso();
      const draft = db.updateProactiveOutcomeSessionDraft({
        userId: auth.participant.id,
        sessionId,
        responses,
        updatedAt
      });
      if (!draft.ok) {
        sendJson(res, 409, {
          ok: false,
          code: "proactive_outcome_session_not_active",
          message: "当前测量会话已经结束，不能再保存草稿。"
        });
        return;
      }
      db.saveNow();
      sendJson(res, 200, {
        ok: true,
        sessionId,
        stageId,
        updatedAt,
        answered: Object.keys(responses).length,
        data: proactiveOutcomeState(auth.participant.id, chapterId)
      });
      return;
    }

    if (
      req.method === "POST"
      && url.pathname === "/api/learning/proactive/outcomes/withdraw"
    ) {
      const body = await readJsonBody(req);
      const auth = authenticate(req, body);
      if (!auth) {
        sendJson(res, 401, { ok: false, message: "请先登录。" });
        return;
      }
      const chapterId = boundedLearningText(
        body.chapterId || proactiveStudyConfig.chapterId,
        120
      );
      const sessionId = boundedLearningText(body.sessionId, 180);
      const requestedReason = boundedLearningText(body.reason, 80);
      const withdrawalReason = [
        "student_exit",
        "learning_reset",
        "consent_withdrawal",
        "technical_exit"
      ].includes(requestedReason)
        ? requestedReason
        : "student_exit";
      const session = sessionId
        ? db.getProactiveOutcomeSessionById(
            auth.participant.id,
            sessionId
          )
        : null;
      if (
        !session
        || session.experiment_id !== proactiveStudyConfig.experimentId
        || session.chapter_id !== chapterId
      ) {
        sendJson(res, 404, {
          ok: false,
          code: "proactive_outcome_session_not_found",
          message: "当前测量会话不存在。"
        });
        return;
      }
      const endedAt = nowIso();
      const withdrawal = db.withdrawProactiveOutcomeSession({
        userId: auth.participant.id,
        sessionId,
        reason: withdrawalReason,
        endedAt
      });
      if (!withdrawal.ok) {
        sendJson(res, 409, {
          ok: false,
          code: "proactive_outcome_session_not_active",
          message: "当前测量会话已经结束，不能再次退出。"
        });
        return;
      }
      if (!withdrawal.idempotent) {
        const started = Date.parse(withdrawal.session.started_at || "");
        const ended = Date.parse(withdrawal.session.ended_at || endedAt);
        const durationMs = Number.isFinite(started) && Number.isFinite(ended)
          ? Math.max(0, Math.trunc(ended - started))
          : 0;
        db.insertEvent({
          id: `${sessionId}:withdrawn`,
          user_id: auth.participant.id,
          type: "interaction",
          payload: {
            schemaVersion: 1,
            eventType: "proactive_outcome_withdrawn",
            source: "proactive_outcome_measurement",
            chapterId,
            unitId: `${chapterId}-${session.stage}`,
            sceneType: "",
            research: {
              experimentId: proactiveStudyConfig.experimentId,
              condition: session.condition,
              cohort: session.cohort || proactiveStudyConfig.cohort || ""
            },
            data: {
              sessionId,
              stageId: session.stage,
              withdrawalReason,
              instrumentVersion: session.instrument_version,
              learningGeneration: Number(session.learning_generation || 1),
              agentAssistanceAllowed: false
            },
            timing: {
              clientAt: withdrawal.session.ended_at || endedAt,
              durationMs
            }
          },
          created_at: withdrawal.session.ended_at || endedAt
        });
      }
      db.saveNow();
      sendJson(res, 200, {
        ok: true,
        idempotent: withdrawal.idempotent,
        sessionId,
        endedAt: withdrawal.session.ended_at || endedAt,
        withdrawalReason,
        data: proactiveOutcomeState(auth.participant.id, chapterId)
      });
      return;
    }

    if (
      req.method === "POST"
      && [
        "/api/learning/proactive/outcomes/pause",
        "/api/learning/proactive/outcomes/resume"
      ].includes(url.pathname)
    ) {
      const body = await readJsonBody(req);
      const auth = authenticate(req, body);
      if (!auth) {
        sendJson(res, 401, { ok: false, message: "请先登录。" });
        return;
      }
      const chapterId = boundedLearningText(
        body.chapterId || proactiveStudyConfig.chapterId,
        120
      );
      const sessionId = boundedLearningText(body.sessionId, 180);
      const session = sessionId
        ? db.getProactiveOutcomeSessionById(auth.participant.id, sessionId)
        : null;
      if (
        !session
        || session.experiment_id !== proactiveStudyConfig.experimentId
        || session.chapter_id !== chapterId
      ) {
        sendJson(res, 404, {
          ok: false,
          code: "proactive_outcome_session_not_found",
          message: "当前测量会话不存在。"
        });
        return;
      }
      const action = url.pathname.endsWith("/pause") ? "paused" : "resumed";
      const recordedAt = nowIso();
      const result = action === "paused"
        ? db.pauseProactiveOutcomeSession({
            userId: auth.participant.id,
            sessionId,
            pausedAt: recordedAt
          })
        : db.resumeProactiveOutcomeSession({
            userId: auth.participant.id,
            sessionId,
            resumedAt: recordedAt
          });
      if (!result.ok) {
        sendJson(res, 409, {
          ok: false,
          code: "proactive_outcome_session_not_active",
          message: "当前测量会话已经结束，不能更新暂离状态。"
        });
        return;
      }
      if (!result.idempotent) {
        const assignment = proactiveAssignmentForUser(auth.participant.id);
        db.insertEvent({
          id: `${sessionId}:${action}:${result.session.pause_count || 0}`,
          user_id: auth.participant.id,
          type: "interaction",
          payload: {
            schemaVersion: 1,
            eventType: `proactive_outcome_${action}`,
            source: "proactive_outcome_measurement",
            chapterId,
            unitId: `${chapterId}-${session.stage}`,
            sceneType: "",
            research: {
              experimentId: proactiveStudyConfig.experimentId,
              condition: session.condition,
              cohort: session.cohort || proactiveStudyConfig.cohort || "",
              assignmentVersion: assignment?.assignment_version || "",
              protocolFingerprint: session.protocol_fingerprint || proactiveProtocolFingerprint
            },
            data: {
              sessionId,
              stageId: session.stage,
              pauseCount: Number(result.session.pause_count || 0),
              pausedDurationMs: Number(result.session.paused_duration_ms || 0),
              resumedPauseMs: Number(result.resumedPauseMs || 0),
              learningGeneration: Number(session.learning_generation || 1)
            },
            timing: { clientAt: recordedAt, durationMs: 0 }
          },
          created_at: recordedAt
        });
      }
      db.saveNow();
      sendJson(res, 200, {
        ok: true,
        idempotent: result.idempotent,
        action,
        sessionId,
        recordedAt,
        data: proactiveOutcomeState(auth.participant.id, chapterId)
      });
      return;
    }

    if (
      req.method === "POST"
      && url.pathname === "/api/learning/proactive/outcomes/skip"
    ) {
      const body = await readJsonBody(req);
      const auth = authenticate(req, body);
      if (!auth) {
        sendJson(res, 401, { ok: false, message: "请先登录。" });
        return;
      }
      const chapterId = boundedLearningText(
        body.chapterId || proactiveStudyConfig.chapterId,
        120
      );
      const sessionId = boundedLearningText(body.sessionId, 180);
      const requestedReason = boundedLearningText(body.reason, 80);
      const skipReason = [
        "student_skip",
        "time_constraint",
        "technical_issue",
        "prefer_not_to_answer"
      ].includes(requestedReason)
        ? requestedReason
        : "student_skip";
      const session = sessionId
        ? db.getProactiveOutcomeSessionById(auth.participant.id, sessionId)
        : null;
      if (
        !session
        || session.experiment_id !== proactiveStudyConfig.experimentId
        || session.chapter_id !== chapterId
      ) {
        sendJson(res, 404, {
          ok: false,
          code: "proactive_outcome_session_not_found",
          message: "当前测量会话不存在。"
        });
        return;
      }
      const endedAt = nowIso();
      const skipped = db.skipProactiveOutcomeSession({
        userId: auth.participant.id,
        sessionId,
        reason: skipReason,
        endedAt
      });
      if (!skipped.ok) {
        sendJson(res, 409, {
          ok: false,
          code: "proactive_outcome_session_not_active",
          message: "当前测量会话已经结束，不能再次跳过。"
        });
        return;
      }
      if (!skipped.idempotent) {
        const started = Date.parse(session.started_at || "");
        const ended = Date.parse(endedAt);
        const elapsedMs = Number.isFinite(started) && Number.isFinite(ended)
          ? Math.max(0, Math.trunc(ended - started))
          : 0;
        const activeDurationMs = Math.max(
          0,
          elapsedMs - Number(skipped.session.paused_duration_ms || 0)
        );
        const assignment = proactiveAssignmentForUser(auth.participant.id);
        db.insertEvent({
          id: `${sessionId}:skipped`,
          user_id: auth.participant.id,
          type: "interaction",
          payload: {
            schemaVersion: 1,
            eventType: "proactive_outcome_skipped",
            source: "proactive_outcome_measurement",
            chapterId,
            unitId: `${chapterId}-${session.stage}`,
            sceneType: "",
            research: {
              experimentId: proactiveStudyConfig.experimentId,
              condition: session.condition,
              cohort: session.cohort || proactiveStudyConfig.cohort || "",
              assignmentVersion: assignment?.assignment_version || "",
              protocolFingerprint: session.protocol_fingerprint || proactiveProtocolFingerprint
            },
            data: {
              sessionId,
              stageId: session.stage,
              skipReason,
              instrumentVersion: session.instrument_version,
              learningGeneration: Number(session.learning_generation || 1),
              pauseCount: Number(skipped.session.pause_count || 0),
              pausedDurationMs: Number(skipped.session.paused_duration_ms || 0),
              agentAssistanceAllowed: false
            },
            timing: { clientAt: endedAt, durationMs: activeDurationMs }
          },
          created_at: endedAt
        });
      }
      db.saveNow();
      sendJson(res, 200, {
        ok: true,
        idempotent: skipped.idempotent,
        sessionId,
        endedAt: skipped.session.ended_at || endedAt,
        skipReason,
        data: proactiveOutcomeState(auth.participant.id, chapterId)
      });
      return;
    }

    if (
      req.method === "POST"
      && url.pathname === "/api/learning/proactive/outcomes/submit"
    ) {
      const body = await readJsonBody(req);
      const auth = authenticate(req, body);
      if (!auth) {
        sendJson(res, 401, { ok: false, message: "请先登录。" });
        return;
      }
      const chapterId = boundedLearningText(
        body.chapterId || proactiveStudyConfig.chapterId,
        120
      );
      const stageId = boundedLearningText(body.stageId, 80);
      const sessionId = boundedLearningText(body.sessionId, 180);
      const session = sessionId
        ? db.getProactiveOutcomeSessionById(
            auth.participant.id,
            sessionId
          )
        : null;
      if (
        !session
        || session.experiment_id !== proactiveStudyConfig.experimentId
        || session.chapter_id !== chapterId
        || session.stage !== stageId
      ) {
        sendJson(res, 409, {
          ok: false,
          code: "proactive_outcome_session_required",
          message: "请先开始本阶段独立测量，再提交答案。"
        });
        return;
      }
      if (session.status === "submitted") {
        const attempt = db.getProactiveOutcomeAttempt(
          auth.participant.id,
          proactiveStudyConfig.experimentId,
          stageId
        );
        if (!attempt) {
          sendJson(res, 409, {
            ok: false,
            code: "proactive_outcome_session_inconsistent",
            message: "测量记录状态不一致，请联系研究管理员。"
          });
          return;
        }
        sendJson(res, 200, {
          ok: true,
          idempotent: true,
          attemptId: attempt.id,
          sessionId,
          stageId,
          startedAt: attempt.started_at || session.started_at || "",
          submittedAt: attempt.submitted_at || session.ended_at || "",
          durationMs: Number(attempt.duration_ms || 0),
          feedbackPolicy: "acknowledgement_only",
          data: proactiveOutcomeState(auth.participant.id, chapterId)
        });
        return;
      }
      if (session.status !== "active") {
        sendJson(res, 409, {
          ok: false,
          code: "proactive_outcome_session_not_active",
          message: "当前测量会话已经结束，不能提交答案。"
        });
        return;
      }
      const stateBefore = proactiveOutcomeState(
        auth.participant.id,
        chapterId
      );
      const stage = stateBefore.stages.find((entry) => entry.id === stageId);
      if (!stateBefore.managed || !stage) {
        sendJson(res, 400, {
          ok: false,
          code: "proactive_outcome_stage_invalid",
          message: "当前测量阶段不存在。"
        });
        return;
      }
      if (stage.status !== "active") {
        sendJson(res, 409, {
          ok: false,
          code: "proactive_outcome_session_not_active",
          message: stage.reason || "本阶段测量会话已经结束。",
          unlockAt: stage.unlockAt || ""
        });
        return;
      }
      const instrument = outcomeRegistry.forVersion(session.instrument_version || "");
      if (!instrument) {
        sendJson(res, 409, {
          ok: false,
          code: "proactive_outcome_version_unavailable",
          message: "原测量题库版本暂不可用，本次作答未被重新判分。"
        });
        return;
      }
      const validIds = new Set(instrument.publicStage(stageId)?.items.map((item) => item.id));
      const unknownItems = Object.keys(body.responses || {}).some((id) => !validIds.has(id));
      const grade = unknownItems ? null : instrument.grade(stageId, body.responses);
      if (!grade) {
        sendJson(res, 400, {
          ok: false,
          code: "proactive_outcome_responses_incomplete",
          message: "请完成本阶段全部题目后再提交。"
        });
        return;
      }
      const assignment = proactiveAssignmentForUser(auth.participant.id);
      if (!assignment) {
        sendJson(res, 409, {
          ok: false,
          code: "proactive_assignment_pending",
          message: "本章实验分组尚未完成。"
        });
        return;
      }
      const submittedAt = nowIso();
      const startedAtValue = Date.parse(session.started_at || "");
      const submittedAtValue = Date.parse(submittedAt);
      const elapsedMs = Number.isFinite(startedAtValue)
        && Number.isFinite(submittedAtValue)
        ? Math.max(0, Math.trunc(submittedAtValue - startedAtValue))
        : 0;
      const currentPauseStartedAt = Date.parse(session.paused_at || "");
      const currentPauseMs = Number.isFinite(currentPauseStartedAt)
        && Number.isFinite(submittedAtValue)
        ? Math.max(0, Math.trunc(submittedAtValue - currentPauseStartedAt))
        : 0;
      const durationMs = Math.max(
        0,
        elapsedMs
          - Number(session.paused_duration_ms || 0)
          - currentPauseMs
      );
      const attemptId = crypto.randomUUID();
      const completion = db.submitProactiveOutcomeSession({
        userId: auth.participant.id,
        sessionId,
        submittedAt,
        attempt: {
          id: attemptId,
          user_id: auth.participant.id,
          experiment_id: proactiveStudyConfig.experimentId,
          condition: assignment.condition,
          cohort: assignment.cohort || proactiveStudyConfig.cohort || "",
          chapter_id: chapterId,
          stage: stageId,
          instrument_version: instrument.version,
          responses: Object.fromEntries(
            grade.results.map((result) => [result.itemId, result.response])
          ),
          item_results: grade.results,
          score: grade.score,
          max_score: grade.maxScore,
          accuracy: grade.accuracy,
          duration_ms: durationMs,
          learning_generation: Number(session.learning_generation || 1),
          started_at: session.started_at,
          submitted_at: submittedAt
        }
      });
      if (!completion.ok) {
        sendJson(res, 409, {
          ok: false,
          code: "proactive_outcome_session_conflict",
          message: "测量会话状态已经变化，本次答案未被重复写入。"
        });
        return;
      }
      db.insertEvent({
        id: `${sessionId}:submitted`,
        user_id: auth.participant.id,
        type: "interaction",
        payload: {
          schemaVersion: 1,
          eventType: "proactive_outcome_submitted",
          source: "proactive_outcome_measurement",
          chapterId,
          unitId: `${chapterId}-${stageId}`,
          sceneType: "",
          research: {
            experimentId: proactiveStudyConfig.experimentId,
            condition: assignment.condition,
            cohort: assignment.cohort || proactiveStudyConfig.cohort || ""
          },
          data: {
            sessionId,
            attemptId,
            stageId,
            instrumentVersion: instrument.version,
            protocolFingerprint: session.protocol_fingerprint || "",
            learningGeneration: Number(session.learning_generation || 1),
            itemCount: grade.maxScore,
            score: grade.score,
            maxScore: grade.maxScore,
            accuracy: grade.accuracy,
            agentAssistanceAllowed: false
          },
          timing: {
            clientAt: submittedAt,
            durationMs
          }
        },
        created_at: submittedAt
      });
      db.saveNow();
      sendJson(res, 200, {
        ok: true,
        idempotent: false,
        attemptId,
        sessionId,
        stageId,
        startedAt: session.started_at,
        submittedAt,
        durationMs,
        feedbackPolicy: "acknowledgement_only",
        data: proactiveOutcomeState(auth.participant.id, chapterId)
      });
      return;
    }

    if (
      req.method === "POST"
      && url.pathname === "/api/learning/proactive/preference"
    ) {
      const body = await readJsonBody(req);
      const auth = authenticate(req, body);
      if (!auth) {
        sendJson(res, 401, { ok: false, message: "请先登录。" });
        return;
      }
      if (!proactiveGlobalPreferenceControlEnabled) {
        sendJson(res, 403, {
          ok: false,
          code: "proactive_global_preference_locked",
          message: "本次实验的主动提示方案由服务端固定分配，学生不能自行切换。"
        });
        return;
      }
      const chapterId = boundedLearningText(
        body.chapterId || proactiveStudyConfig.chapterId,
        120
      );
      if (chapterId !== proactiveStudyConfig.chapterId) {
        sendJson(res, 400, {
          ok: false,
          code: "proactive_preference_scope_invalid",
          message: "当前章节不支持主动提示设置。"
        });
        return;
      }
      const preference = boundedLearningText(body.preference, 20);
      if (!proactiveStudentPreferences.has(preference)) {
        sendJson(res, 400, {
          ok: false,
          code: "proactive_preference_invalid",
          message: "主动提示设置无效。"
        });
        return;
      }

      const changedAt = nowIso();
      const previousPreference = proactiveGlobalPreference(auth.participant.id);
      const existingGlobalState = db.getProactivePolicyState(
        auth.participant.id,
        proactiveStudyConfig.experimentId,
        proactiveGlobalScopeKey
      ) || {};
      db.upsertProactivePolicyState(proactivePolicyStateRecord(
        existingGlobalState,
        {
          userId: auth.participant.id,
          scopeKey: proactiveGlobalScopeKey,
          updatedAt: changedAt,
          lastReasonCode: `student_preference_${preference}`,
          studentPreference: preference
        }
      ));

      let closedInterventions = 0;
      let closedLifecycleEpisodes = 0;
      if (preference === "off") {
        closedInterventions = db.closeOpenProactiveInterventionsForUser({
          userId: auth.participant.id,
          experimentId: proactiveStudyConfig.experimentId,
          resolution: "preference_off",
          resolvedAt: changedAt,
          followupOutcome: {
            outcome: "student_preference_off",
            previousPreference,
            preference
          }
        });
      }
      db.listProactivePolicyStates(
        auth.participant.id,
        proactiveStudyConfig.experimentId
      )
        .filter((row) => row.scope_key !== proactiveGlobalScopeKey)
        .forEach((row) => {
          const lifecycleState = proactivePolicy.lifecycle.normalize(
            parseStoredJson(row.lifecycle_json || "{}", {})
          );
          const lifecycleActive = [
            "accepted_pending_response",
            "awaiting_independent_attempt"
          ].includes(lifecycleState.phase);
          if (preference === "off" && lifecycleActive) {
            closedLifecycleEpisodes += 1;
          }
          db.upsertProactivePolicyState(proactivePolicyStateRecord(row, {
            userId: auth.participant.id,
            scopeKey: row.scope_key,
            updatedAt: changedAt,
            lastReasonCode: `student_preference_${preference}`,
            currentLevel: preference === "off" && lifecycleActive
              ? "L0"
              : row.current_level || "L0",
            studentPreference: row.student_preference || "standard",
            pendingCandidateKind: preference === "off"
              ? ""
              : row.pending_candidate_kind || "",
            pendingCandidateAt: preference === "off"
              ? ""
              : row.pending_candidate_at || "",
            pendingCandidateExpiresAt: preference === "off"
              ? ""
              : row.pending_candidate_expires_at || "",
            pendingEvidence: preference === "off"
              ? {}
              : parseStoredJson(row.pending_evidence_json || "{}", {}),
            lifecycle: preference === "off" && lifecycleActive
              ? {
                  ...lifecycleState,
                  phase: "declined",
                  supportLevel: "L0",
                  activeAction: "",
                  activeDecisionId: "",
                  activeInterventionId: "",
                  reasonCode: "student_preference_off",
                  lastOutcome: "student_preference_off",
                  lastOutcomeAt: changedAt
                }
              : lifecycleState
          }));
        });

      db.insertEvent({
        id: crypto.randomUUID(),
        user_id: auth.participant.id,
        type: "interaction",
        payload: {
          schemaVersion: 1,
          eventType: "proactive_student_preference_changed",
          source: "proactive_policy",
          chapterId,
          unitId: "",
          sceneType: "",
          research: {
            experimentId: proactiveStudyConfig.experimentId
          },
          data: {
            previousPreference,
            preference,
            closedInterventions,
            closedLifecycleEpisodes
          },
          timing: {
            clientAt: changedAt,
            durationMs: 0
          }
        },
        created_at: changedAt
      });
      db.saveNow();
      sendJson(res, 200, {
        ok: true,
        data: proactiveStudyState(auth.participant.id, chapterId),
        previousPreference,
        studentPreference: preference,
        closedInterventions,
        closedLifecycleEpisodes
      });
      return;
    }

    if (
      req.method === "POST"
      && url.pathname === "/api/learning/proactive/scope-preference"
    ) {
      const body = await readJsonBody(req);
      const auth = authenticate(req, body);
      if (!auth) {
        sendJson(res, 401, { ok: false, message: "请先登录。" });
        return;
      }
      const chapterId = boundedLearningText(
        body.chapterId || proactiveStudyConfig.chapterId,
        120
      );
      const scopeKey = boundedLearningText(body.scopeKey, 180);
      const preference = boundedLearningText(body.preference, 20);
      const adapter = proactivePolicy.adapterForChapter(chapterId);
      if (
        chapterId !== proactiveStudyConfig.chapterId
        || !scopeKey
        || !adapter?.knowledgePoint?.(scopeKey)
      ) {
        sendJson(res, 400, {
          ok: false,
          code: "proactive_scope_preference_scope_invalid",
          message: "当前知识点不支持单独设置主动提醒。"
        });
        return;
      }
      if (!["standard", "off"].includes(preference)) {
        sendJson(res, 400, {
          ok: false,
          code: "proactive_scope_preference_invalid",
          message: "知识点提醒设置无效。"
        });
        return;
      }

      const changedAt = nowIso();
      const existing = db.getProactivePolicyState(
        auth.participant.id,
        proactiveStudyConfig.experimentId,
        scopeKey
      ) || {};
      const previousPreference = proactiveScopePreference(
        auth.participant.id,
        scopeKey
      );
      const lifecycleState = proactivePolicy.lifecycle.normalize(
        parseStoredJson(existing.lifecycle_json || "{}", {})
      );
      const lifecycleActive = [
        "accepted_pending_response",
        "awaiting_independent_attempt"
      ].includes(lifecycleState.phase);
      const closedInterventions = preference === "off"
        ? db.closeOpenProactiveInterventionsForUser({
            userId: auth.participant.id,
            experimentId: proactiveStudyConfig.experimentId,
            scopeKey,
            resolution: "scope_muted",
            resolvedAt: changedAt,
            followupOutcome: {
              outcome: "scope_preference_off",
              scopeKey,
              previousPreference,
              preference
            }
          })
        : 0;
      db.upsertProactivePolicyState(proactivePolicyStateRecord(existing, {
        userId: auth.participant.id,
        scopeKey,
        updatedAt: changedAt,
        lastReasonCode: `scope_preference_${preference}`,
        currentLevel: preference === "off" && lifecycleActive
          ? "L0"
          : existing.current_level || "L0",
        scopePreference: preference,
        pendingCandidateKind: preference === "off"
          ? ""
          : existing.pending_candidate_kind || "",
        pendingCandidateAt: preference === "off"
          ? ""
          : existing.pending_candidate_at || "",
        pendingCandidateExpiresAt: preference === "off"
          ? ""
          : existing.pending_candidate_expires_at || "",
        pendingEvidence: preference === "off"
          ? {}
          : parseStoredJson(existing.pending_evidence_json || "{}", {}),
        lifecycle: preference === "off" && lifecycleActive
          ? {
              ...lifecycleState,
              phase: "declined",
              supportLevel: "L0",
              activeAction: "",
              activeDecisionId: "",
              activeInterventionId: "",
              reasonCode: "scope_preference_off",
              lastOutcome: "scope_preference_off",
              lastOutcomeAt: changedAt
            }
          : lifecycleState
      }));
      db.insertEvent({
        id: crypto.randomUUID(),
        user_id: auth.participant.id,
        type: "interaction",
        payload: {
          schemaVersion: 1,
          eventType: "proactive_scope_preference_changed",
          source: "proactive_policy",
          chapterId,
          unitId: scopeKey,
          sceneType: "",
          research: {
            experimentId: proactiveStudyConfig.experimentId
          },
          data: {
            scopeKey,
            previousPreference,
            preference,
            closedInterventions,
            closedLifecycleEpisode: preference === "off" && lifecycleActive
          },
          timing: {
            clientAt: changedAt,
            durationMs: 0
          }
        },
        created_at: changedAt
      });
      db.saveNow();
      sendJson(res, 200, {
        ok: true,
        data: proactiveStudyState(auth.participant.id, chapterId),
        scopeKey,
        previousPreference,
        scopePreference: preference,
        closedInterventions,
        closedLifecycleEpisode: preference === "off" && lifecycleActive
      });
      return;
    }

    const proactiveResolutionMatch = url.pathname.match(
      /^\/api\/learning\/proactive\/([^/]+)\/resolution$/
    );
    if (req.method === "POST" && proactiveResolutionMatch) {
      const body = await readJsonBody(req);
      const auth = authenticate(req, body);
      if (!auth) { sendJson(res, 401, { ok: false, message: "请先登录。" }); return; }
      const decisionId = boundedLearningText(
        decodeURIComponent(proactiveResolutionMatch[1]),
        180
      );
      const decision = db.getProactiveDecisionForUser(auth.participant.id, decisionId);
      if (!decision) {
        sendJson(res, 404, {
          ok: false,
          code: "proactive_decision_not_found",
          message: "这条主动建议不存在，或不属于当前学生。"
        });
        return;
      }
      const resolutionAliases = {
        shown: "shown",
        accept: "accepted",
        accepted: "accepted",
        dismiss: "dismissed",
        dismissed: "dismissed",
        ignore: "ignored",
        ignored: "ignored",
        later: "snoozed",
        snooze: "snoozed",
        snoozed: "snoozed",
        alternative_requested: "alternative_requested"
      };
      const resolution = resolutionAliases[String(body.resolution || "").trim()] || "";
      if (!resolution) {
        sendJson(res, 400, {
          ok: false,
          code: "proactive_resolution_invalid",
          message: "主动建议状态无效。"
        });
        return;
      }
      const resolvedAt = nowIso();
      const access = proactiveDecisionInteractionAccess(
        auth.participant.id,
        decision,
        Date.now()
      );
      if (!access.ok && access.reason === "expired") {
        db.resolveProactiveIntervention({
          userId: auth.participant.id,
          decisionId,
          resolution: "expired",
          resolvedAt,
          latencyMs: Math.max(0, Date.now() - Date.parse(decision.created_at || resolvedAt))
        });
        db.saveNow();
        sendJson(res, 410, {
          ok: false,
          code: "proactive_decision_expired",
          message: "这条主动建议已过期。"
        });
        return;
      }
      if (!access.ok) {
        const paused = access.reason === "paused";
        sendJson(res, paused ? 409 : 410, {
          ok: false,
          code: paused
            ? "proactive_decision_paused"
            : "proactive_decision_inactive",
          message: paused
            ? "主动实验已暂停，这条建议暂不能继续执行。"
            : "这条主动建议已不属于当前有效学习回合。"
        });
        return;
      }
      const latencyMs = Math.max(
        0,
        Date.now() - Date.parse(decision.created_at || resolvedAt)
      );
      const result = db.resolveProactiveIntervention({
        userId: auth.participant.id,
        decisionId,
        resolution,
        resolvedAt,
        latencyMs
      });
      if (!result.ok) {
        const notFound = result.reason === "not_found";
        const shownRequired = result.reason === "shown_required";
        sendJson(res, notFound ? 404 : 409, {
          ok: false,
          code: notFound
            ? "proactive_intervention_not_found"
            : shownRequired
              ? "proactive_resolution_shown_required"
              : "proactive_resolution_replayed",
          message: notFound
            ? "这条主动建议没有可更新的展示记录。"
            : shownRequired
              ? "只有确认展示过的主动建议才能被接受或关闭。"
              : "这条主动建议已经处理，不能重复改变状态。"
        });
        return;
      }
      const studentPreference = proactiveStudentPreference(
        auth.participant.id,
        decision.scope_key || decision.unit_id
      );
      let policyState = db.getProactivePolicyState(
        auth.participant.id,
        decision.experiment_id,
        decision.scope_key || decision.unit_id
      ) || {};
      policyState = {
        ...policyState,
        student_preference: studentPreference
      };
      if (resolution !== "shown") {
        policyState = db.upsertProactivePolicyState(
          proactivePolicyStateAfterResolution({
            existing: policyState,
            decision,
            interventionId: result.intervention?.id || "",
            resolution,
            resolvedAt,
            latencyMs
          })
        );
      }
      db.insertEvent({
        id: `${decisionId}:${resolution}`,
        user_id: auth.participant.id,
        type: "interaction",
        payload: {
          schemaVersion: 1,
          eventType: `proactive_offer_${resolution}`,
          source: "proactive_policy",
          chapterId: decision.chapter_id,
          unitId: decision.unit_id,
          sceneType: decision.scene_type,
          research: {
            experimentId: decision.experiment_id,
            condition: decision.condition
          },
          data: {
            decisionId,
            interventionId: result.intervention?.id || "",
            action: decision.action,
            supportLevel: decision.support_level,
            resolution,
            latencyMs
          },
          timing: {
            clientAt: resolvedAt,
            durationMs: latencyMs
          }
        },
        created_at: resolvedAt
      });
      db.saveNow();
      sendJson(res, 200, {
        ok: true,
        data: {
          decisionId,
          resolution,
          idempotent: Boolean(result.idempotent),
          policyState: publicProactivePolicyState(policyState, {
            studentPreference
          })
        }
      });
      return;
    }

    if (
      req.method === "POST"
      && url.pathname === "/api/learning/proactive/check"
    ) {
      const body = await readJsonBody(req);
      const auth = authenticate(req, body);
      if (!auth) {
        sendJson(res, 401, { ok: false, message: "请先登录。" });
        return;
      }
      if (rejectAgentAssistanceDuringOutcome(res, auth.participant.id)) {
        return;
      }
      const unitId = boundedLearningText(body.unitId, 180);
      const chapterId = boundedLearningText(
        body.chapterId || proactiveStudyConfig.chapterId,
        180
      );
      const sceneType = boundedLearningText(body.sceneType, 80);
      const scopeKey = boundedLearningText(body.scopeKey, 180);
      if (
        chapterId !== proactiveStudyConfig.chapterId
        || !scopeKey
        || !unitId
      ) {
        sendJson(res, 400, {
          ok: false,
          code: "proactive_verification_scope_invalid",
          message: "当前学习位置没有可提交的主动验证题。"
        });
        return;
      }
      const assignment = proactiveAssignmentForUser(auth.participant.id);
      if (!assignment) {
        sendJson(res, 409, {
          ok: false,
          code: "proactive_assignment_pending",
          message: "完成章前测后才能提交本章主动验证题。"
        });
        return;
      }
      const policyState = db.getProactivePolicyState(
        auth.participant.id,
        proactiveStudyConfig.experimentId,
        scopeKey
      );
      const publicState = publicProactivePolicyState(policyState || {});
      const expectedCheck = publicState.verificationCheck;
      if (!policyState || !expectedCheck) {
        sendJson(res, 409, {
          ok: false,
          code: "proactive_verification_not_expected",
          message: "这道支架后检查已经处理，或当前还没到检查阶段。"
        });
        return;
      }
      if (expectedCheck.id !== boundedLearningText(body.checkId, 180)) {
        sendJson(res, 409, {
          ok: false,
          code: "proactive_verification_stale",
          message: "这道支架后检查已经更新，请刷新后再作答。"
        });
        return;
      }

      const quizResults = db.getQuizResultsByUserUnit(
        auth.participant.id,
        unitId
      );
      let resolved;
      try {
        resolved = learningAssistant.resolveAssistantContext({
          index: assistantContextIndex,
          chapterId,
          unitId,
          sceneType,
          contextRef: body.contextRef || {
            kind: "proactive_verification",
            scope: "lesson"
          },
          quizSubmitted: Boolean(quizResults.length)
        });
      } catch (error) {
        sendJson(res, error.status || 400, {
          ok: false,
          code: error.code || "assistant_context_error",
          message: error.message
        });
        return;
      }
      const resolvedScopeKey = boundedLearningText(
        resolved.unit.knowledgePointId || resolved.unit.id,
        180
      );
      if (
        resolved.unit.chapterId !== proactiveStudyConfig.chapterId
        || resolvedScopeKey !== scopeKey
      ) {
        sendJson(res, 409, {
          ok: false,
          code: "proactive_verification_context_mismatch",
          message: "验证题与当前知识点不一致，未记录本次作答。"
        });
        return;
      }

      const adapter = proactivePolicy.adapterForChapter(
        proactiveStudyConfig.chapterId
      );
      const declined = String(body.resolution || "") === "declined";
      const grade = declined
        ? null
        : adapter?.gradeVerificationCheck?.({
            knowledgePointId: scopeKey,
            supportLevel: publicState.currentLevel,
            checkId: expectedCheck.id,
            response: boundedLearningText(body.response, 80)
          });
      if (!declined && !grade) {
        sendJson(res, 400, {
          ok: false,
          code: "proactive_verification_response_invalid",
          message: "请选择一个选项后再提交。"
        });
        return;
      }

      const submittedAt = nowIso();
      const attemptId = crypto.randomUUID();
      const checkLifecycle = proactivePolicy.lifecycle.normalize(
        parseStoredJson(policyState.lifecycle_json || "{}", {})
      );
      const verificationResult = {
        attemptId,
        checkId: expectedCheck.id,
        stage: expectedCheck.stage,
        supportLevel: expectedCheck.supportLevel,
        source: "policy_owned_probe",
        instrumentVersion: expectedCheck.instrumentVersion,
        evidenceScope: expectedCheck.evidenceScope,
        subSkill: expectedCheck.subSkill,
        status: declined
          ? "declined"
          : grade.correct ? "correct" : "incorrect",
        correct: declined ? null : grade.correct
      };
      const evidence = {
        families: declined ? ["history"] : ["task", "history"],
        evidenceRefs: [{
          id: attemptId,
          sourceType: "policy_owned_probe",
          eventType: declined
            ? "proactive_verification_declined"
            : "proactive_verification_submitted",
          capturedAt: submittedAt
        }],
        independentAttemptDeclined: declined,
        independentAttemptVerified: !declined,
        independentAttemptSuccess: declined ? false : grade.correct,
        confirmedIncorrect: declined || grade.correct ? 0 : 1,
        confirmedCorrect: !declined && grade.correct ? 1 : 0,
        questionCount: declined ? 0 : 1,
        verificationCheckId: expectedCheck.id,
        verificationStage: expectedCheck.stage,
        verificationSource: "policy_owned_probe",
        verificationInstrumentVersion: expectedCheck.instrumentVersion,
        verificationEvidenceScope: expectedCheck.evidenceScope,
        verificationSubSkill: expectedCheck.subSkill,
        verificationResponse: declined ? "" : grade.response
      };
      db.insertEvent({
        id: attemptId,
        user_id: auth.participant.id,
        type: "interaction",
        payload: {
          schemaVersion: 1,
          eventType: declined
            ? "proactive_verification_declined"
            : "proactive_verification_submitted",
          source: "proactive_policy",
          chapterId,
          unitId: resolved.unit.id,
          sceneType,
          research: {
            experimentId: proactiveStudyConfig.experimentId,
            condition: assignment.condition
          },
          data: {
            checkId: expectedCheck.id,
            instrumentVersion: expectedCheck.instrumentVersion,
            evidenceScope: expectedCheck.evidenceScope,
            subSkill: expectedCheck.subSkill,
            interventionId: checkLifecycle.activeInterventionId,
            decisionId: checkLifecycle.activeDecisionId,
            itemSnapshot: {
              prompt: expectedCheck.prompt,
              options: expectedCheck.options
            },
            stage: expectedCheck.stage,
            supportLevel: expectedCheck.supportLevel,
            response: declined ? "" : grade.response,
            isCorrect: declined ? null : grade.correct
          },
          timing: {
            clientAt: submittedAt,
            durationMs: Math.max(
              0,
              Math.min(
                60 * 60 * 1000,
                Math.trunc(Number(body.durationMs || 0))
              )
            )
          }
        },
        created_at: submittedAt
      });
      await handleManagedProactiveIntervention({
        res,
        auth,
        resolved,
        signal: {
          kind: "independent_attempt_outcome",
          sourceEventType: "policy_owned_probe",
          attemptId
        },
        quizAttempt: attachAssistantQuizAttempt(resolved, quizResults),
        sceneType,
        trustedEvidence: evidence,
        responseExtras: {
          checkResult: verificationResult
        }
      });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/learning/assistant/intervention") {
      const body = await readJsonBody(req);
      const auth = authenticate(req, body);
      if (!auth) { sendJson(res, 401, { ok: false, message: "请先登录。" }); return; }
      if (rejectAgentAssistanceDuringOutcome(res, auth.participant.id)) return;
      const unitId = boundedLearningText(body.unitId, 180);
      const chapterId = boundedLearningText(body.chapterId, 180);
      const sceneType = boundedLearningText(body.sceneType, 80);
      const signal = body.signal && typeof body.signal === "object" && !Array.isArray(body.signal)
        ? body.signal
        : {};
      if (![
        "repeated_parameter",
        "quiz_review",
        "quiet_dwell",
        "formative_outcome",
        "independent_attempt_outcome",
        "student_requested_alternative"
      ].includes(String(signal.kind || ""))) {
        sendJson(res, 400, {
          ok: false,
          code: "assistant_intervention_signal_invalid",
          message: "这次学习信号不足以进行判断。"
        });
        return;
      }
      const quizResults = unitId
        ? db.getQuizResultsByUserUnit(auth.participant.id, unitId)
        : [];
      const quizSubmitted = Boolean(quizResults.length);
      let resolved;
      try {
        resolved = learningAssistant.resolveAssistantContext({
          index: assistantContextIndex,
          chapterId,
          unitId,
          sceneType,
          contextRef: body.contextRef || {
            kind: signal.kind === "repeated_parameter" ? "interaction" : "unit",
            scope: ["quiz_review", "formative_outcome"].includes(signal.kind)
              ? "quiz"
              : "lesson"
          },
          quizSubmitted
        });
      } catch (error) {
        sendJson(res, error.status || 400, {
          ok: false,
          code: error.code || "assistant_context_error",
          message: error.message
        });
        return;
      }
      const quizAttempt = attachAssistantQuizAttempt(resolved, quizResults);
      if (resolved.unit.chapterId === proactiveStudyConfig.chapterId) {
        let trustedEvidence = null;
        if (signal.kind === "student_requested_alternative") {
          const sourceDecisionId = boundedLearningText(
            signal.sourceDecisionId,
            180
          );
          const sourceDecision = sourceDecisionId
            ? db.getProactiveDecisionForUser(
                auth.participant.id,
                sourceDecisionId
              )
            : null;
          if (!sourceDecision) {
            sendJson(res, 404, {
              ok: false,
              code: "proactive_alternative_source_not_found",
              message: "原主动建议不存在，或不属于当前学生。"
            });
            return;
          }
          const resolvedScopeKey = boundedLearningText(
            resolved.unit.knowledgePointId || resolved.unit.id,
            180
          );
          const sourceScopeKey = boundedLearningText(
            sourceDecision.scope_key || sourceDecision.unit_id,
            180
          );
          if (
            sourceDecision.chapter_id !== proactiveStudyConfig.chapterId
            || sourceScopeKey !== resolvedScopeKey
            || sourceDecision.delivery_decision !== "intervene"
            || sourceDecision.action === "switch_representation"
          ) {
            sendJson(res, 409, {
              ok: false,
              code: "proactive_alternative_source_mismatch",
              message: "原建议与当前知识点不一致，不能据此切换帮助。"
            });
            return;
          }
          const sourceAccess = proactiveDecisionInteractionAccess(
            auth.participant.id,
            sourceDecision,
            Date.now()
          );
          if (!sourceAccess.ok) {
            const paused = sourceAccess.reason === "paused";
            const expired = sourceAccess.reason === "expired";
            sendJson(res, paused ? 409 : 410, {
              ok: false,
              code: paused
                ? "proactive_alternative_source_paused"
                : expired
                  ? "proactive_alternative_source_expired"
                  : "proactive_alternative_source_inactive",
              message: paused
                ? "主动实验已暂停，暂不能由这条建议切换帮助。"
                : expired
                  ? "原主动建议已过期，不能再由它切换帮助。"
                  : "原主动建议已不属于当前有效学习回合。"
            });
            return;
          }
          const sourceIntervention = db.getProactiveInterventionForDecision(
            auth.participant.id,
            sourceDecisionId
          );
          if (!sourceIntervention || sourceIntervention.status !== "shown") {
            sendJson(res, 409, {
              ok: false,
              code: "proactive_alternative_source_not_shown",
              message: "只有已经展示的主动建议才能换一种帮助。"
            });
            return;
          }
          const requestedAt = nowIso();
          const sourceResolution = db.resolveProactiveIntervention({
            userId: auth.participant.id,
            decisionId: sourceDecisionId,
            resolution: "alternative_requested",
            resolvedAt: requestedAt,
            latencyMs: Math.max(
              0,
              Date.now() - Date.parse(
                sourceDecision.created_at || requestedAt
              )
            ),
            followupOutcome: {
              outcome: "student_requested_alternative",
              sourceDecisionId,
              requestedAt
            }
          });
          if (!sourceResolution.ok) {
            sendJson(res, 409, {
              ok: false,
              code: "proactive_alternative_source_replayed",
              message: "原建议已经处理，不能重复换帮助。"
            });
            return;
          }
          const effectivePreference = proactiveStudentPreference(
            auth.participant.id,
            sourceScopeKey
          );
          const sourceState = db.getProactivePolicyState(
            auth.participant.id,
            sourceDecision.experiment_id,
            sourceScopeKey
          ) || {};
          db.upsertProactivePolicyState(
            proactivePolicyStateAfterResolution({
              existing: {
                ...sourceState,
                student_preference: effectivePreference
              },
              decision: sourceDecision,
              interventionId: sourceIntervention.id || "",
              resolution: "alternative_requested",
              resolvedAt: requestedAt,
              latencyMs: Math.max(
                0,
                Date.now() - Date.parse(
                  sourceDecision.created_at || requestedAt
                )
              )
            })
          );
          db.insertEvent({
            id: `${sourceDecisionId}:alternative_requested`,
            user_id: auth.participant.id,
            type: "interaction",
            payload: {
              schemaVersion: 1,
              eventType: "proactive_alternative_requested",
              source: "proactive_policy",
              chapterId: sourceDecision.chapter_id,
              unitId: sourceDecision.unit_id,
              sceneType,
              research: {
                experimentId: sourceDecision.experiment_id,
                condition: sourceDecision.condition
              },
              data: {
                sourceDecisionId,
                sourceInterventionId: sourceIntervention.id || "",
                sourceAction: sourceDecision.action,
                sourceSupportLevel: sourceDecision.support_level
              },
              timing: {
                clientAt: requestedAt,
                durationMs: Math.max(
                  0,
                  Date.now() - Date.parse(
                    sourceDecision.created_at || requestedAt
                  )
                )
              }
            },
            created_at: requestedAt
          });
          trustedEvidence = {
            families: ["history", "preference"],
            sourceDecisionId,
            evidenceRefs: [{
              id: sourceDecisionId,
              sourceType: "proactive_decision",
              eventType: "proactive_alternative_requested",
              capturedAt: requestedAt
            }]
          };
          db.saveNow();
        }
        await handleManagedProactiveIntervention({
          res,
          auth,
          resolved,
          signal,
          quizAttempt,
          sceneType,
          trustedEvidence
        });
        return;
      }
      if (resolved.isQuiz && !quizSubmitted) {
        sendAssistantQuizLocked(res, auth.participant.id);
        return;
      }
      let verifiedSignal = signal;
      if (signal.kind === "quiz_review") {
        if (!resolved.isQuiz || !quizAttempt || quizAttempt.incorrect <= 0) {
          sendAssistantSignalMismatch(res, "当前没有已确认的错题可供主动复盘。");
          return;
        }
        if (quizAttempt.pendingReview > 0) {
          sendAssistantSignalMismatch(res, "简答题仍在批改，完成后再开始完整错题复盘。");
          return;
        }
        verifiedSignal = {
          ...signal,
          incorrect: quizAttempt.incorrect,
          pendingReview: quizAttempt.pendingReview,
          questionCount: quizAttempt.total,
          reviewIndex: 0
        };
      } else if (signal.kind === "formative_outcome") {
        if (
          !resolved.isQuiz
          || resolved.unit.phase !== "formative"
          || !resolved.unit.knowledgePointId
          || !quizAttempt
          || quizAttempt.pendingReview > 0
        ) {
          sendAssistantSignalMismatch(res, "当前没有可用于主动策略的完整形成性结果。");
          return;
        }
        if (quizAttempt.incorrect <= 0) {
          sendJson(res, 200, {
            ok: true,
            provider: "deterministic-policy",
            fallback: false,
            decision: proactiveSilentAssistantDecision({
              reasonCodes: ["confirmed_error_absent"],
              uncertaintyScore: 0.05
            }),
            interventionId: "",
            interventionBudget: proactiveInterventionBudgetInfo(
              auth.participant.id,
              new Date()
            ),
            quota: assistantQuotaInfo(auth.participant.id)
          });
          return;
        }
        verifiedSignal = {
          ...signal,
          kind: "quiz_review",
          incorrect: quizAttempt.incorrect,
          correct: quizAttempt.correct,
          pendingReview: quizAttempt.pendingReview,
          questionCount: quizAttempt.total,
          reviewIndex: 0
        };
      } else if (signal.kind === "repeated_parameter") {
        if (
          resolved.isQuiz
          || !resolved.scene
          || (
            resolved.contextRef.kind !== "interaction"
            && resolved.contextRef.scope !== "interactive"
          )
          || !boundedLearningText(signal.parameter, 120)
          || signal.newValue === undefined
          || signal.newValue === null
          || boundedLearningText(signal.newValue, 80) === ""
        ) {
          sendAssistantSignalMismatch(res, "当前学习位置没有可信的连续调参证据。");
          return;
        }
      } else if (
        signal.kind === "quiet_dwell"
        && (
          resolved.isQuiz
          || Number(signal.dwellSeconds || 0) < assistantMinimumDwellSeconds(resolved, sceneType)
        )
      ) {
        sendAssistantSignalMismatch(res, "当前学习状态不足以判断为有效停留。");
        return;
      }
      const interventionBudget = consumeAssistantInterventionBudget(auth.participant.id, new Date());
      if (!interventionBudget.ok) {
        sendJson(res, 429, {
          ok: false,
          code: "assistant_intervention_budget_exhausted",
          message: "知点今天已经减少主动打扰，仍可由你主动提问。",
          interventionBudget,
          quota: assistantQuotaInfo(auth.participant.id)
        });
        return;
      }
      const history = assistantRecentConversation(auth.participant.id, resolved, 4);
      const generated = await generateInterventionDecision({
        resolved,
        signal: verifiedSignal,
        history
      });
      const interventionId = issueAssistantIntervention(
        auth.participant.id,
        resolved,
        generated.decision
      );
      sendJson(res, 200, {
        ok: true,
        provider: generated.provider,
        fallback: generated.fallback,
        decision: generated.decision,
        interventionId,
        interventionBudget,
        quota: assistantQuotaInfo(auth.participant.id)
      });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/learning/notes") {
      const auth = authenticate(req);
      if (!auth) { sendJson(res, 401, { ok: false, message: "请先登录。" }); return; }
      const unitId = boundedLearningText(url.searchParams.get("unitId") || "", 180);
      if (unitId && !assistantContextIndex.units.has(unitId)) {
        sendJson(res, 400, { ok: false, code: "learning_note_unit_invalid", message: "学习位置不存在。" });
        return;
      }
      sendJson(res, 200, {
        ok: true,
        notes: db.listLearningNotes(auth.participant.id, unitId, 500).map(publicLearningNote)
      });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/learning/notes/sync") {
      const body = await readJsonBody(req);
      const auth = authenticate(req, body);
      if (!auth) { sendJson(res, 401, { ok: false, message: "请先登录。" }); return; }
      const incoming = Array.isArray(body.notes) ? body.notes.slice(0, 500) : [];
      try {
        const records = incoming.map((note) => sanitizeLearningNoteInput(auth.participant.id, note));
        const deletedIds = (Array.isArray(body.deletedIds) ? body.deletedIds : [])
          .slice(0, 500)
          .map((noteId) => boundedLearningText(noteId, 180))
          .filter((noteId) => /^[A-Za-z0-9:_-]{1,180}$/.test(noteId));
        db.syncLearningNotes(auth.participant.id, records, deletedIds);
        const unitId = boundedLearningText(body.unitId || "", 180);
        sendJson(res, 200, {
          ok: true,
          notes: db.listLearningNotes(auth.participant.id, unitId, 500).map(publicLearningNote)
        });
      } catch (error) {
        sendJson(res, error.status || 400, {
          ok: false,
          code: error.code || "learning_note_sync_failed",
          message: error.message || "笔记同步失败。"
        });
      }
      return;
    }

    const learningNoteMatch = url.pathname.match(/^\/api\/learning\/notes\/([^/]+)$/);
    if (learningNoteMatch && ["PUT", "DELETE"].includes(req.method)) {
      const body = req.method === "PUT" ? await readJsonBody(req) : {};
      const auth = authenticate(req, body);
      if (!auth) { sendJson(res, 401, { ok: false, message: "请先登录。" }); return; }
      const noteId = decodeURIComponent(learningNoteMatch[1]);
      if (req.method === "DELETE") {
        const deleted = db.deleteLearningNote(auth.participant.id, noteId);
        if (!deleted) {
          sendJson(res, 404, { ok: false, code: "learning_note_not_found", message: "这条笔记不存在或已删除。" });
          return;
        }
        sendJson(res, 200, { ok: true, deleted: true, noteId });
        return;
      }
      try {
        const record = sanitizeLearningNoteInput(auth.participant.id, body, noteId);
        const saved = db.upsertLearningNote(record);
        sendJson(res, 200, { ok: true, note: publicLearningNote(saved) });
      } catch (error) {
        sendJson(res, error.status || 400, {
          ok: false,
          code: error.code || "learning_note_save_failed",
          message: error.message || "笔记保存失败。"
        });
      }
      return;
    }

    const assistantConversationMatch = url.pathname.match(
      /^\/api\/learning\/assistant\/conversations\/([^/]+)$/
    );
    if (assistantConversationMatch && ["PATCH", "DELETE"].includes(req.method)) {
      const body = req.method === "PATCH" ? await readJsonBody(req) : {};
      const auth = authenticate(req, body);
      if (!auth) { sendJson(res, 401, { ok: false, message: "请先登录。" }); return; }
      const conversationId = decodeURIComponent(assistantConversationMatch[1]);
      const existing = db.getLearningAssistantConversation(auth.participant.id, conversationId);
      if (!existing) {
        sendJson(res, 404, {
          ok: false,
          code: "assistant_conversation_not_found",
          message: "这段对话不存在或已被删除。"
        });
        return;
      }
      if (req.method === "DELETE") {
        db.deleteLearningAssistantConversation(auth.participant.id, conversationId);
        sendJson(res, 200, { ok: true, deleted: true, conversationId });
        return;
      }

      const action = String(body.action || "").trim();
      const updatedAt = nowIso();
      let updated = null;
      if (action === "rename") {
        const title = String(body.title || "").replace(/\s+/g, " ").trim().slice(0, 80);
        if (!title) {
          sendJson(res, 400, {
            ok: false,
            code: "assistant_conversation_title_required",
            message: "请输入对话名称。"
          });
          return;
        }
        updated = db.renameLearningAssistantConversation(
          auth.participant.id,
          conversationId,
          title,
          updatedAt
        );
      } else if (["archive", "restore"].includes(action)) {
        updated = db.setLearningAssistantConversationArchived(
          auth.participant.id,
          conversationId,
          action === "archive" ? updatedAt : "",
          updatedAt
        );
      } else {
        sendJson(res, 400, {
          ok: false,
          code: "assistant_conversation_action_invalid",
          message: "无法识别这项会话操作。"
        });
        return;
      }
      sendJson(res, 200, {
        ok: true,
        conversation: publicAssistantConversation(updated)
      });
      return;
    }

    if (
      req.method === "POST"
      && url.pathname === "/api/learning/assistant/quiz-review/action"
    ) {
      const body = await readJsonBody(req);
      const auth = authenticate(req, body);
      if (!auth) { sendJson(res, 401, { ok: false, message: "请先登录。" }); return; }
      const action = String(body.action || "").trim();
      if (!["continue", "next", "stop"].includes(action)) {
        sendJson(res, 400, {
          ok: false,
          code: "assistant_quiz_review_action_invalid",
          message: "无法识别这项错题复盘操作。"
        });
        return;
      }
      const conversationId = boundedLearningText(body.conversationId, 180);
      const assistantMessageId = boundedLearningText(body.assistantMessageId, 180);
      const unitId = boundedLearningText(body.unitId, 180);
      const chapterId = boundedLearningText(body.chapterId, 180);
      const sceneType = boundedLearningText(body.sceneType, 80);
      const conversation = db.getLearningAssistantConversation(
        auth.participant.id,
        conversationId
      );
      const sourceMessage = db.getLearningAssistantMessage(
        auth.participant.id,
        assistantMessageId
      );
      if (
        !conversation
        || !sourceMessage
        || sourceMessage.role !== "assistant"
        || sourceMessage.conversation_id !== conversation.id
        || sourceMessage.unit_id !== unitId
      ) {
        sendJson(res, 404, {
          ok: false,
          code: "assistant_quiz_review_state_not_found",
          message: "这段错题复盘已不在当前对话中，请重新开始。"
        });
        return;
      }
      const latestMessage = db.getLearningAssistantMessages(
        auth.participant.id,
        conversation.thread_key,
        1,
        conversation.id
      )[0];
      if (!latestMessage || latestMessage.id !== sourceMessage.id) {
        sendJson(res, 409, {
          ok: false,
          code: "assistant_quiz_review_state_stale",
          message: "这不是当前对话最新的复盘步骤，请从最新回答继续。"
        });
        return;
      }
      const quizResults = db.getQuizResultsByUserUnit(auth.participant.id, unitId);
      const quizSubmitted = Boolean(quizResults.length);
      let resolved;
      try {
        resolved = learningAssistant.resolveAssistantContext({
          index: assistantContextIndex,
          chapterId,
          unitId,
          sceneType,
          contextRef: { kind: "unit", scope: "quiz" },
          quizSubmitted
        });
      } catch (error) {
        sendJson(res, error.status || 400, {
          ok: false,
          code: error.code || "assistant_context_error",
          message: error.message
        });
        return;
      }
      if (!resolved.isQuiz || !quizSubmitted) {
        sendAssistantQuizLocked(res, auth.participant.id);
        return;
      }
      const quizAttempt = attachAssistantQuizAttempt(resolved, quizResults);
      const progress = assistantQuizReviewProgress(sourceMessage);
      if (
        !quizAttempt
        || quizAttempt.pendingReview > 0
        || quizAttempt.incorrect <= 0
        || !["awaiting_choice", "awaiting_reply"].includes(progress.status)
      ) {
        sendJson(res, 409, {
          ok: false,
          code: "assistant_quiz_review_state_unavailable",
          message: "当前没有可继续的错题复盘步骤，请重新开始复盘。"
        });
        return;
      }
      if (action === "stop") {
        const stopped = {
          ...progress,
          status: "stopped",
          done: false,
          action: "",
          completionMessage: "已结束本轮错题复盘。"
        };
        updateAssistantQuizReviewProgress(sourceMessage, stopped);
        sendJson(res, 200, {
          ok: true,
          done: false,
          progress: normalizeAssistantQuizReviewProgress(stopped)
        });
        return;
      }
      if (progress.status !== "awaiting_choice") {
        sendJson(res, 409, {
          ok: false,
          code: "assistant_quiz_review_reply_pending",
          message: "上一步复盘问题正在等待你的回答。"
        });
        return;
      }
      const currentIndex = quizReviewIndexFromProgress(resolved, progress);
      if (currentIndex < 0) {
        sendJson(res, 409, {
          ok: false,
          code: "assistant_quiz_review_attempt_changed",
          message: "测验结果已经更新，请重新开始本轮复盘。"
        });
        return;
      }
      const targetReviewIndex = action === "continue" ? currentIndex : currentIndex + 1;
      if (targetReviewIndex >= quizAttempt.incorrectItems.length) {
        const completionMessage = `本轮 ${quizAttempt.incorrectItems.length} 道错题已复盘完成。`;
        const completed = {
          ...progress,
          status: "completed",
          done: true,
          action: "",
          completionMessage
        };
        updateAssistantQuizReviewProgress(sourceMessage, completed);
        sendJson(res, 200, {
          ok: true,
          done: true,
          progress: normalizeAssistantQuizReviewProgress(completed),
          completionMessage
        });
        return;
      }
      const decision = quizReviewDecisionForIndex(resolved, targetReviewIndex);
      if (!decision || decision.action !== "review_mistake") {
        sendJson(res, 409, {
          ok: false,
          code: "assistant_quiz_review_target_unavailable",
          message: "下一步错题复盘暂时不可用，请稍后再试。"
        });
        return;
      }
      const visible = action === "next";
      const pendingProgress = {
        ...progress,
        status: "awaiting_reply",
        done: false,
        action,
        targetReviewIndex,
        targetQuestionId: decision.questionId || ""
      };
      updateAssistantQuizReviewProgress(sourceMessage, pendingProgress);
      const interventionId = issueAssistantIntervention(
        auth.participant.id,
        resolved,
        {
          ...decision,
          promptVisible: visible,
          sourceMessageId: sourceMessage.id,
          reviewAction: action
        }
      );
      sendJson(res, 200, {
        ok: true,
        done: false,
        progress: normalizeAssistantQuizReviewProgress(pendingProgress),
        prompt: publicQuizReviewPrompt({
          resolved,
          sceneType,
          decision,
          interventionId,
          sourceMessageId: sourceMessage.id,
          reviewAction: action,
          visible
        })
      });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/learning/assistant/history") {
      const auth = authenticate(req);
      if (!auth) { sendJson(res, 401, { ok: false, message: "请先登录。" }); return; }
      const unitId = String(url.searchParams.get("unitId") || "").trim();
      const chapterId = String(url.searchParams.get("chapterId") || "").trim();
      const sceneType = String(url.searchParams.get("sceneType") || "").trim();
      const conversationId = String(url.searchParams.get("conversationId") || "").trim();
      const quizResults = unitId
        ? db.getQuizResultsByUserUnit(auth.participant.id, unitId)
        : [];
      const quizSubmitted = Boolean(quizResults.length);
      let resolved;
      try {
        resolved = learningAssistant.resolveAssistantContext({
          index: assistantContextIndex,
          chapterId,
          unitId,
          sceneType,
          contextRef: {
            kind: "unit",
            scope: unitId.endsWith("-pre") || unitId.endsWith("-formative") || unitId.endsWith("-post")
              ? "quiz"
              : "lesson"
          },
          quizSubmitted
        });
      } catch (error) {
        sendJson(res, error.status || 400, {
          ok: false,
          code: error.code || "assistant_context_error",
          message: error.message
        });
        return;
      }
      if (resolved.isQuiz && !quizSubmitted) {
        sendAssistantQuizLocked(res, auth.participant.id);
        return;
      }
      if (resolved.isQuiz) attachAssistantQuizAttempt(resolved, quizResults);
      let conversation = null;
      if (conversationId) {
        const found = db.getLearningAssistantConversation(auth.participant.id, conversationId);
        if (!found || found.thread_key !== resolved.threadKey) {
          sendJson(res, 404, {
            ok: false,
            code: "assistant_conversation_not_found",
            message: "这段历史对话不存在，或不属于当前学习位置。"
          });
          return;
        }
        conversation = publicAssistantConversation(found);
      } else {
        const latest = db.listLearningAssistantConversations(
          auth.participant.id,
          resolved.threadKey,
          1
        )[0];
        conversation = latest ? publicAssistantConversation(latest) : null;
      }
      const messages = conversation
        ? db.getLearningAssistantMessages(
            auth.participant.id,
            resolved.threadKey,
            assistantHistoryMessageLimit,
            conversation.id
          ).filter((row) => quizSubmitted || Number(row.quiz_submitted || 0) !== 1)
        : [];
      let pendingQuizReviewPrompt = null;
      const latestAssistantMessage = [...messages].reverse().find((row) => row.role === "assistant");
      if (resolved.isQuiz && latestAssistantMessage) {
        const progress = assistantQuizReviewProgress(latestAssistantMessage);
        if (progress.status === "awaiting_reply") {
          const targetReviewIndex = quizReviewIndexFromProgress(
            resolved,
            progress,
            { target: true }
          );
          const decision = targetReviewIndex >= 0
            ? quizReviewDecisionForIndex(resolved, targetReviewIndex)
            : null;
          if (
            decision?.action === "review_mistake"
            && (!progress.targetQuestionId || decision.questionId === progress.targetQuestionId)
          ) {
            const visible = progress.action === "next";
            const interventionId = issueAssistantIntervention(
              auth.participant.id,
              resolved,
              {
                ...decision,
                promptVisible: visible,
                sourceMessageId: latestAssistantMessage.id,
                reviewAction: progress.action
              }
            );
            pendingQuizReviewPrompt = publicQuizReviewPrompt({
              resolved,
              sceneType,
              decision,
              interventionId,
              sourceMessageId: latestAssistantMessage.id,
              reviewAction: progress.action,
              visible
            });
          }
        }
      }
      sendJson(res, 200, {
        ok: true,
        threadKey: resolved.threadKey,
        conversation,
        conversationTurnLimit: assistantConversationTurnLimit,
        conversationTurns: Math.floor(Number(conversation?.messageCount || 0) / 2),
        contextRef: resolved.contextRef,
        quizSubmitted,
        provider: assistantProviderInfo(),
        quota: assistantQuotaInfo(auth.participant.id),
        pendingQuizReviewPrompt,
        messages: messages.map(publicAssistantMessage)
      });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/learning/assistant/ask") {
      const body = await readJsonBody(req);
      const auth = authenticate(req, body);
      if (!auth) { sendJson(res, 401, { ok: false, message: "请先登录。" }); return; }
      if (rejectAgentAssistanceDuringOutcome(res, auth.participant.id)) return;
      const question = String(body.question || "").replace(/\u0000/g, "").trim().slice(0, 1200);
      const assistantIntent = ["self_check", "rephrase", "practice"].includes(String(body.assistantIntent || "").trim())
        ? String(body.assistantIntent).trim()
        : "";
      const proactiveInterventionId = boundedLearningText(body.proactiveInterventionId, 180);
      const unitId = String(body.unitId || "").trim();
      const chapterId = String(body.chapterId || "").trim();
      const sceneType = String(body.sceneType || "").trim();
      if (!question || !unitId) {
        sendJson(res, 400, { ok: false, message: "请输入问题，并保持当前学习单元有效。" });
        return;
      }
      const quizResults = db.getQuizResultsByUserUnit(auth.participant.id, unitId);
      const quizSubmitted = Boolean(quizResults.length);
      let resolved;
      try {
        resolved = learningAssistant.resolveAssistantContext({
          index: assistantContextIndex,
          chapterId,
          unitId,
          sceneType,
          contextRef: body.contextRef,
          quizSubmitted
        });
      } catch (error) {
        sendJson(res, error.status || 400, {
          ok: false,
          code: error.code || "assistant_context_error",
          message: error.message
        });
        return;
      }
      if (resolved.isQuiz && !quizSubmitted) {
        sendAssistantQuizLocked(res, auth.participant.id);
        return;
      }
      attachAssistantQuizAttempt(resolved, quizResults);
      const proactiveIntervention = proactiveInterventionId
        ? getAssistantIntervention(auth.participant.id, unitId, proactiveInterventionId)
        : null;
      if (proactiveInterventionId && !proactiveIntervention) {
        sendJson(res, 409, {
          ok: false,
          code: "assistant_intervention_expired",
          message: "这次复盘提示已失效，请重新开始复盘。",
          quota: assistantQuotaInfo(auth.participant.id)
        });
        return;
      }
      const policyInterventionAccess = proactiveIntervention
        ? policyAssistantInterventionAccess(
            auth.participant.id,
            unitId,
            proactiveIntervention
          )
        : { ok: true, code: "", terminal: false };
      if (!policyInterventionAccess.ok) {
        if (policyInterventionAccess.terminal) {
          getAssistantIntervention(
            auth.participant.id,
            unitId,
            proactiveInterventionId,
            { consume: true }
          );
        }
        const paused = policyInterventionAccess.code === "assistant_intervention_paused";
        const notAccepted = policyInterventionAccess.code
          === "assistant_intervention_not_accepted";
        sendJson(res, 409, {
          ok: false,
          code: policyInterventionAccess.code,
          message: paused
            ? "主动实验已暂停，这次帮助暂不继续；你仍可移除提示后主动提问。"
            : notAccepted
              ? "请先明确接受这次主动建议，再提交对应回复。"
              : "这次主动帮助已结束，请按你的想法重新提问。",
          quota: assistantQuotaInfo(auth.participant.id)
        });
        return;
      }
      let proactiveReviewSourceMessage = null;
      const proactivePrompt = proactiveIntervention?.assistantPrompt || "";
      if (proactiveIntervention?.action === "review_mistake") {
        resolved.quizReviewIndex = Math.max(
          0,
          Math.trunc(Number(proactiveIntervention.reviewIndex || 0))
        );
      }
      const rate = checkAssistantRateLimit(auth.participant.id);
      if (!rate.ok) {
        sendJson(res, 429, {
          ok: false,
          code: "assistant_rate_limited",
          message: "提问有点密集，先观察一下课件，稍后再继续。",
          retryAfterSeconds: rate.retryAfterSeconds
        });
        return;
      }

      const requestedAt = new Date();
      const providerInfo = assistantProviderInfo();
      let quota = assistantQuotaInfo(auth.participant.id, requestedAt);
      let quotaReserved = false;
      let conversationState;
      try {
        conversationState = assistantConversationForRequest(
          auth.participant.id,
          resolved,
          body.conversationId,
          requestedAt.toISOString()
        );
      } catch (error) {
        sendJson(res, error.status || 400, {
          ok: false,
          code: error.code || "assistant_conversation_error",
          message: error.message,
          quota
        });
        return;
      }
      const { conversation } = conversationState;
      if (proactiveIntervention?.sourceMessageId) {
        const sourceMessage = db.getLearningAssistantMessage(
          auth.participant.id,
          proactiveIntervention.sourceMessageId
        );
        const sourceProgress = assistantQuizReviewProgress(sourceMessage);
        const targetReviewIndex = quizReviewIndexFromProgress(
          resolved,
          sourceProgress,
          { target: true }
        );
        if (
          !sourceMessage
          || sourceMessage.role !== "assistant"
          || sourceMessage.conversation_id !== conversation.id
          || sourceMessage.unit_id !== unitId
          || sourceProgress.status !== "awaiting_reply"
          || targetReviewIndex !== proactiveIntervention.reviewIndex
          || (
            proactiveIntervention.questionId
            && sourceProgress.targetQuestionId
            && proactiveIntervention.questionId !== sourceProgress.targetQuestionId
          )
        ) {
          sendJson(res, 409, {
            ok: false,
            code: "assistant_intervention_expired",
            message: "这次复盘步骤已被更新，请从最新回答继续。",
            quota
          });
          return;
        }
        proactiveReviewSourceMessage = sourceMessage;
      }
      const conversationTurns = Math.floor(Number(conversation.messageCount || 0) / 2);
      if (conversationTurns >= assistantConversationTurnLimit) {
        sendJson(res, 409, {
          ok: false,
          code: "assistant_conversation_turn_limit",
          message: `这段对话已达到 ${assistantConversationTurnLimit} 轮，请新建对话继续。`,
          conversationTurnLimit: assistantConversationTurnLimit,
          conversationTurns,
          quota
        });
        return;
      }
      if (assistantRequestConsumesQuota(providerInfo)) {
        quota = consumeAssistantQuota(auth.participant.id, requestedAt);
        if (!quota.ok) {
          sendJson(res, 429, {
            ok: false,
            code: "assistant_daily_quota_exhausted",
            message: "今天的知点额度已用完，明天可以继续提问。",
            quota
          });
          return;
        }
        quotaReserved = true;
      }
      const historyRows = conversationState.createConversation
        ? []
        : db.getLearningAssistantMessages(
            auth.participant.id,
            resolved.threadKey,
            assistantHistoryMessageLimit,
            conversation.id
          ).filter((row) => quizSubmitted || Number(row.quiz_submitted || 0) !== 1);
      const history = historyRows.map((row) => ({
        role: row.role,
        content: row.content
      }));
      const askedAt = requestedAt.toISOString();
      const userMessageId = crypto.randomUUID();

      if (proactiveIntervention) {
        getAssistantIntervention(
          auth.participant.id,
          unitId,
          proactiveInterventionId,
          { consume: true }
        );
      }
      const generated = await generateAssistantTurn({
        resolved,
        question,
        history,
        quizSubmitted,
        assistantIntent,
        proactivePrompt
      });
      if ((generated.fallback || generated.provider === "grounding-guard") && quotaReserved) {
        quota = releaseAssistantQuota(auth.participant.id, requestedAt);
        quotaReserved = false;
      }
      const answer = learningAssistant.enforceQuizSafety(generated.text, {
        isQuiz: resolved.isQuiz,
        quizSubmitted,
        resolved
      });
      const assistantMessageId = crypto.randomUUID();
      const answeredAt = nowIso();
      let quizReviewFollowUp = null;
      if (proactiveIntervention?.action === "review_mistake") {
        const incorrectItems = Array.isArray(resolved?.quizAttempt?.incorrectItems)
          ? resolved.quizAttempt.incorrectItems
          : [];
        const matchedIndex = proactiveIntervention.questionId
          ? incorrectItems.findIndex((item) => item.questionId === proactiveIntervention.questionId)
          : -1;
        const reviewIndex = matchedIndex >= 0
          ? matchedIndex
          : Math.max(
              0,
              Math.min(
                Math.max(0, incorrectItems.length - 1),
                Math.trunc(Number(proactiveIntervention.reviewIndex || 0))
              )
            );
        quizReviewFollowUp = {
          status: "awaiting_choice",
          done: false,
          reviewIndex,
          reviewTotal: incorrectItems.length,
          questionId: incorrectItems[reviewIndex]?.questionId || proactiveIntervention.questionId || "",
          completionMessage: "",
          actions: ["continue", "next", "stop"],
          sourceMessageId: assistantMessageId
        };
      }
      const assistantGuidance = quizReviewFollowUp
        ? {
            ...generated.guidance,
            quizReviewProgress: normalizeAssistantQuizReviewProgress(quizReviewFollowUp)
          }
        : generated.guidance;
      const messageBase = {
        user_id: auth.participant.id,
        thread_key: resolved.threadKey,
        conversation_id: conversation.id,
        chapter_id: resolved.unit.chapterId,
        unit_id: resolved.unit.id,
        knowledge_point_id: resolved.unit.knowledgePointId || "",
        context: {
          ...resolved.contextRef,
          assistantGuidance,
          assistantIntent,
          proactivePrompt,
          proactivePromptVisible: proactiveIntervention?.promptVisible !== false
        },
        quiz_submitted: quizSubmitted
      };
      db.saveLearningAssistantTurn({
        conversation: conversationState.record,
        createConversation: conversationState.createConversation,
        userMessage: {
          ...messageBase,
          id: userMessageId,
          role: "user",
          content: question,
          provider: "",
          created_at: askedAt
        },
        assistantMessage: {
          ...messageBase,
          id: assistantMessageId,
          role: "assistant",
          content: answer,
          provider: generated.provider,
          created_at: answeredAt
        },
        title: conversation.messageCount === 0 ? question : "",
        updatedAt: answeredAt
      });
      if (
        proactiveIntervention
        && proactivePolicy.lifecycle.isLifecycleAction(
          proactiveIntervention.action
        )
      ) {
        const storedIntervention = db.getProactiveIntervention(
          proactiveInterventionId
        );
        const lifecycleDecision = proactiveIntervention.decisionId
          ? db.getProactiveDecisionForUser(
              auth.participant.id,
              proactiveIntervention.decisionId
            )
          : null;
        if (
          storedIntervention?.status === "accepted"
          && lifecycleDecision
        ) {
          const scopeKey = lifecycleDecision.scope_key
            || resolved.unit.knowledgePointId
            || lifecycleDecision.unit_id;
          const existingPolicyState = db.getProactivePolicyState(
            auth.participant.id,
            lifecycleDecision.experiment_id,
            scopeKey
          ) || {};
          const previousLifecycle = proactivePolicy.lifecycle.normalize(parseStoredJson(
              existingPolicyState.lifecycle_json || "{}",
              {}
            ));
          const nextLifecycle = proactivePolicy.lifecycle.afterStudentResponse({
            lifecycle: previousLifecycle,
            interventionId: proactiveInterventionId,
            respondedAt: answeredAt
          });
          if (previousLifecycle.phase === "accepted_pending_response"
            && nextLifecycle.phase === "awaiting_independent_attempt") {
            const adapter = proactivePolicy.adapterForChapter(lifecycleDecision.chapter_id);
            const issuedCheck = adapter?.publicVerificationCheck?.(scopeKey, nextLifecycle.supportLevel);
            nextLifecycle.activeVerificationCheckId = issuedCheck?.id || "";
            db.upsertProactivePolicyState(proactivePolicyStateRecord(
              existingPolicyState,
              {
                userId: auth.participant.id,
                scopeKey,
                updatedAt: answeredAt,
                lastReasonCode: "student_response_submitted",
                lifecycle: nextLifecycle
              }
            ));
            db.updateProactiveInterventionFollowup({
              userId: auth.participant.id,
              interventionId: proactiveInterventionId,
              followupOutcome: {
                studentResponse: {
                  submitted: true,
                  submittedAt: answeredAt,
                  responseLength: question.length,
                  assistantMessageId,
                  provider: generated.provider
                }
              },
              updatedAt: answeredAt
            });
            db.insertEvent({
              id: `${proactiveInterventionId}:student-response`,
              user_id: auth.participant.id,
              type: "interaction",
              payload: {
                schemaVersion: 1,
                eventType: "proactive_student_response_submitted",
                source: "proactive_policy",
                chapterId: lifecycleDecision.chapter_id,
                unitId: lifecycleDecision.unit_id,
                research: {
                  experimentId: lifecycleDecision.experiment_id,
                  condition: lifecycleDecision.condition
                },
                data: {
                  decisionId: lifecycleDecision.id,
                  interventionId: proactiveInterventionId,
                  action: lifecycleDecision.action,
                  supportLevel: lifecycleDecision.support_level,
                  verificationCheckId: issuedCheck?.id || "",
                  verificationInstrumentVersion: issuedCheck?.instrumentVersion || "",
                  responseLength: question.length
                },
                timing: {
                  clientAt: answeredAt,
                  durationMs: 0
                }
              },
              created_at: answeredAt
            });
            db.saveNow();
          }
        }
      }
      if (proactiveReviewSourceMessage) {
        const sourceProgress = assistantQuizReviewProgress(proactiveReviewSourceMessage);
        updateAssistantQuizReviewProgress(proactiveReviewSourceMessage, {
          ...sourceProgress,
          status: "answered",
          done: false,
          action: ""
        });
      }

      res.writeHead(200, {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        "X-Accel-Buffering": "no"
      });
      res.flushHeaders?.();
      writeNdjson(res, {
        type: "meta",
        threadKey: resolved.threadKey,
        conversationId: conversation.id,
        conversationTurnLimit: assistantConversationTurnLimit,
        conversationTurns: conversationTurns + 1,
        userMessageId,
        contextRef: resolved.contextRef,
        quizSubmitted,
        provider: providerInfo,
        quota
      });
      for (const delta of learningAssistant.responseChunks(answer)) {
        writeNdjson(res, { type: "delta", delta });
      }
      writeNdjson(res, {
        type: "done",
        message: {
          id: assistantMessageId,
          role: "assistant",
          content: answer,
          contextRef: resolved.contextRef,
          guidance: assistantGuidance,
          assistantIntent,
          proactivePrompt: "",
          provider: generated.provider,
          quizSubmitted,
          createdAt: answeredAt
        },
        policy: generated.policy,
        guidance: assistantGuidance,
        quizReviewFollowUp,
        fallback: generated.fallback,
        conversation: {
          ...conversation,
          title: conversation.messageCount === 0 ? question.slice(0, 42) : conversation.title,
          messageCount: conversation.messageCount + 2,
          turnCount: conversationTurns + 1,
          updatedAt: answeredAt
        },
        quota
      });
      res.end();
      return;
    }

    // ---- Learning Quiz Results (server-scored authoritative source) ----
    if (req.method === "POST" && url.pathname === "/api/learning/quiz/submit") {
      const body = await readJsonBody(req);
      const auth = authenticate(req, body);
      if (!auth) { sendJson(res, 401, { ok: false, message: "请先登录。" }); return; }
      const unitId = String(body.unitId || "").trim();
      const chapterId = String(body.chapterId || "").trim();
      const phase = String(body.phase || "").trim();
      const answers = Array.isArray(body.answers) ? body.answers.slice(0, 50) : [];
      if (!unitId || !chapterId || !phase || !answers.length) {
        sendJson(res, 400, { ok: false, message: "测验提交信息不完整。" });
        return;
      }
      let expectedEntries = courseAssessment.assessmentEntriesForUnit(assessmentIndex, {
        chapterId,
        unitId,
        phase
      });
      if (expectedEntries.some((entry) => entry.assessmentStatus === "archived")) {
        sendJson(res, 409, {
          ok: false,
          code: "quiz_archived",
          message: "这份旧版模块测验已归档，不再接收作答。请返回当前章节测验；历史记录仍保留。"
        });
        return;
      }
      const existingResults = db.getQuizResultsByUserUnit(auth.participant.id, unitId);
      const coreEntry = expectedEntries.find((entry) => entry.question?.adaptiveRole === "core");
      const diagnosticEntry = expectedEntries.find((entry) => entry.question?.adaptiveRole === "diagnostic");
      const adaptiveFormative = phase === "formative" && Boolean(coreEntry && diagnosticEntry);
      if (adaptiveFormative) {
        const coreResult = existingResults.find((row) => row.question_id === coreEntry.question.id);
        const diagnosticResult = existingResults.find((row) => row.question_id === diagnosticEntry.question.id);
        if (!coreResult) {
          expectedEntries = [coreEntry];
        } else if (Number(coreResult.is_correct) === 0 && !diagnosticResult) {
          expectedEntries = [diagnosticEntry];
        } else {
          sendJson(res, 409, { ok: false, code: "quiz_already_submitted", message: "这份知识点检测已经完成，不能重复覆盖成绩。" });
          return;
        }
      }
      const submittedQuestionIds = new Set(
        answers.map((answer) => String(answer?.questionId || "").trim()).filter(Boolean)
      );
      if (
        !expectedEntries.length
        || submittedQuestionIds.size !== answers.length
        || submittedQuestionIds.size !== expectedEntries.length
        || expectedEntries.some((entry) => !submittedQuestionIds.has(entry.question.id))
      ) {
        const legacyIds = new Set(expectedEntries.map((entry) => entry.question.legacyQuestionId).filter(Boolean));
        const staleVersion = answers.some((answer) => legacyIds.has(String(answer?.questionId || "")));
        sendJson(res, staleVersion ? 409 : 400, {
          ok: false,
          code: staleVersion ? "quiz_version_changed" : "quiz_question_set_mismatch",
          message: staleVersion
            ? "这份测验的题目版本已更新，请刷新页面后重新核对；已保存的成绩不会被覆盖。"
            : "提交题目与当前测验不完整或不匹配。"
        });
        return;
      }
      if (!adaptiveFormative && existingResults.length) {
        sendJson(res, 409, { ok: false, code: "quiz_already_submitted", message: "这份测验已经提交，不能重复覆盖成绩。" });
        return;
      }

      const seen = new Set();
      const timestamp = nowIso();
      const learningGeneration = db.currentLearningGeneration(auth.participant.id, timestamp);
      const prepared = [];
      for (const submitted of answers) {
        const questionId = String(submitted?.questionId || "").trim();
        if (!questionId || seen.has(questionId)) {
          sendJson(res, 400, { ok: false, message: "测验题目无效或重复。" });
          return;
        }
        seen.add(questionId);
        const entry = courseAssessment.assessmentEntry(assessmentIndex, {
          questionId,
          chapterId,
          unitId,
          phase
        });
        if (!entry) {
          sendJson(res, 400, { ok: false, message: "测验题目与当前章节不匹配。" });
          return;
        }
        const question = entry.question;
        let response = submitted.response;
        if (question.type === "multiple") {
          response = Array.isArray(response)
            ? Array.from(new Set(response.map((value) => String(value).trim()).filter(Boolean))).slice(0, 30)
            : [];
        } else {
          response = String(response ?? "").trim().slice(0, 12000);
        }
        if (question.type === "multiple" ? !response.length : !response) {
          sendJson(res, 400, { ok: false, message: "请完成全部题目后再提交。" });
          return;
        }

        const maxScore = Math.max(0, Number(question.points || 0));
        const unknown = response === "__unknown__" || (Array.isArray(response) && response.includes("__unknown__"));
        if (unknown && Array.isArray(response) && response.length !== 1) {
          sendJson(res, 400, { ok: false, message: "“我不会”不能与其他选项同时选择。" });
          return;
        }
        if (!unknown && question.type !== "short_answer"
          && (Array.isArray(response) ? response : [response]).some(value => !(question.options || []).some(option => option.value === value))) {
          sendJson(res, 400, { ok: false, message: "选择了无效选项。" });
          return;
        }
        const scored = unknown
          ? { isCorrect: false, score: 0, maxScore, status: "incorrect" }
          : question.type === "short_answer"
          ? { isCorrect: null, score: 0, maxScore, status: "pending_review" }
          : courseAssessment.scoreObjectiveQuestion(question, response);
        prepared.push({
          id: `${auth.participant.id}-g${learningGeneration}-${unitId}-${question.id}`,
          unitId,
          chapterId,
          questionId: question.id,
          instrumentVersion: question.instrumentVersion || "",
          questionType: question.type,
          points: maxScore,
          phase,
          timestamp,
          response,
          ...scored,
          ...courseAssessment.publicReviewFields(question),
          entry
        });
      }

      prepared.forEach((result) => {
        db.insertQuizResult({
          id: result.id,
          user_id: auth.participant.id,
          chapter_id: result.chapterId,
          chapter_label: result.entry.chapterLabel || "",
          unit_id: result.unitId,
          unit_label: result.entry.unitLabel || "",
          question_id: result.questionId,
          question_type: result.questionType,
          phase: result.phase,
          points: result.points,
          response: result.response,
          is_correct: result.isCorrect === true ? 1 : result.isCorrect === false ? 0 : -1,
          status: result.status,
          score: result.score,
          max_score: result.maxScore,
          learning_generation: learningGeneration,
          created_at: result.timestamp,
          research_context: {
            schemaVersion: 1,
            experimentId: result.chapterId === proactiveStudyConfig.chapterId
              ? proactiveStudyConfig.experimentId : "",
            protocolFingerprint: result.chapterId === proactiveStudyConfig.chapterId
              ? proactiveProtocolFingerprint : "",
            instrumentVersion: result.instrumentVersion,
            questionDigest: crypto.createHash("sha256")
              .update(JSON.stringify(result.entry.question)).digest("hex"),
            capturedAt: result.timestamp
          }
        });
      });
      db.saveNow();

      sendJson(res, 200, {
        ok: true,
        requiresDiagnostic: Boolean(
          adaptiveFormative
          && expectedEntries.length === 1
          && expectedEntries[0] === coreEntry
          && prepared[0]?.isCorrect === false
        ),
        results: prepared.map(({ entry, ...result }) => result)
      });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/learning/quiz-results") {
      const auth = authenticate(req);
      if (!auth) { sendJson(res, 401, { ok: false, message: "请先登录。" }); return; }
      const results = db.getQuizResultsByUser(auth.participant.id, 500).map((row) => {
        const entry = courseAssessment.assessmentEntry(assessmentIndex, row);
        const archived = !entry && row.chapter_id === "V14-C1" && ["pre", "post"].includes(row.phase)
          ? require("./lib/assessments/functions-limits-r1").questions(row.phase)
            .find(question => question.id === row.question_id) : null;
        const question = entry?.question || archived;
        return question ? { ...row, ...courseAssessment.publicReviewFields(question) } : row;
      });
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

    if (req.method === "GET" && url.pathname === "/api/admin/research/analysis-package") {
      if (!checkAdmin(req)) {
        sendJson(res, 403, { ok: false, message: "需要管理员密码。" });
        return;
      }
      const experimentId = boundedLearningText(
        url.searchParams.get("experimentId") || proactiveStudyConfig.experimentId, 120
      );
      const protocol = proactiveProtocolPayload(experimentId);
      if (!protocol) {
        sendJson(res, 404, { ok: false, message: "未找到该实验的冻结协议，不能借用当前协议导出。" });
        return;
      }
      try {
        const source = db.researchAnalysisSource({ experimentId, chapterId: protocol.chapterId });
        sendJson(res, 200, { ok: true, data: researchAnalysis.buildPackage({
          source, protocol, assessmentIndex, generatedAt: nowIso()
        }) });
      } catch (error) {
        if (error.code !== "ANALYSIS_EXPORT_TOO_LARGE") throw error;
        sendJson(res, 413, { ok: false, message: "数据超过单次分析包上限，未导出截断数据；请使用离线数据库导出。" });
      }
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/admin/shutdown") {
      if (!checkAdmin(req)) {
        sendJson(res, 403, { ok: false, message: "需要管理员密码。" });
        return;
      }
      sendJson(res, 202, { ok: true, message: "服务正在保存数据库并安全停止。" });
      setTimeout(() => shutdown("ADMIN_SHUTDOWN"), 50);
      return;
    }

    if (
      req.method === "GET"
      && url.pathname === "/api/admin/research/proactive-decisions"
    ) {
      if (!checkAdmin(req)) {
        sendJson(res, 403, { ok: false, message: "需要管理员密码。" });
        return;
      }
      const experimentId = boundedLearningText(
        url.searchParams.get("experimentId") || proactiveStudyConfig.experimentId,
        120
      );
      const expiredInterventions = db.expireProactiveInterventions({
        at: nowIso(),
        experimentId
      });
      if (expiredInterventions > 0) db.saveNow();
      const page = db.proactiveDecisionRows({
        experimentId,
        userId: boundedLearningText(url.searchParams.get("userId"), 180),
        condition: boundedLearningText(url.searchParams.get("condition"), 40),
        decision: boundedLearningText(url.searchParams.get("decision"), 40),
        limit: Math.max(1, Math.min(Number(url.searchParams.get("limit") || 500), 1000)),
        offset: Math.max(0, Number(url.searchParams.get("offset") || 0))
      });
      const rows = page.rows.map((row) => ({
        ...row,
        reason_codes: parseStoredJson(row.reason_codes_json || "[]", []),
        evidence_refs: parseStoredJson(row.evidence_refs_json || "[]", []),
        evidence_snapshot: parseStoredJson(row.evidence_snapshot_json || "{}", {}),
        budget_snapshot: parseStoredJson(row.budget_snapshot_json || "{}", {}),
        presentation: parseStoredJson(row.presentation || "{}", {}),
        followup_outcome: parseStoredJson(row.followup_outcome_json || "{}", {}),
        current_lifecycle: parseStoredJson(row.current_lifecycle_json || "{}", {})
      }));
      const outcomePage = db.proactiveOutcomeRows({
        experimentId,
        userId: boundedLearningText(url.searchParams.get("userId"), 180),
        condition: boundedLearningText(url.searchParams.get("condition"), 40),
        stage: boundedLearningText(url.searchParams.get("stage"), 80),
        limit: Math.max(1, Math.min(Number(url.searchParams.get("limit") || 500), 1000)),
        offset: Math.max(0, Number(url.searchParams.get("offset") || 0))
      });
      const outcomeRows = outcomePage.rows.map((row) => ({
        ...row,
        responses: parseStoredJson(row.response_json || "{}", {}),
        item_results: parseStoredJson(row.item_results_json || "[]", [])
      }));
      const outcomeSessionPage = db.proactiveOutcomeSessionRows({
        experimentId,
        userId: boundedLearningText(url.searchParams.get("userId"), 180),
        condition: boundedLearningText(url.searchParams.get("condition"), 40),
        stage: boundedLearningText(url.searchParams.get("stage"), 80),
        status: boundedLearningText(
          url.searchParams.get("outcomeSessionStatus"),
          40
        ),
        limit: Math.max(1, Math.min(Number(url.searchParams.get("limit") || 500), 1000)),
        offset: Math.max(0, Number(url.searchParams.get("offset") || 0))
      });
      const protocol = proactiveProtocolPayload(experimentId);
      const storedPolicy = protocol?.definition?.policy || {};
      const policy = experimentId === proactiveStudyConfig.experimentId
        ? proactivePolicy.adminConfig(proactiveStudyConfig)
        : storedPolicy;
      const runtime = experimentId === proactiveStudyConfig.experimentId
        ? proactiveExperimentRuntime()
        : db.getProactiveExperimentRuntime(experimentId);
      const chapterId = protocol?.chapterId || proactiveStudyConfig.chapterId;
      const retentionDelayHours = Number(
        protocol?.definition?.retentionDelayHours
        ?? (experimentId === proactiveStudyConfig.experimentId
          ? proactiveRetentionDelayHours
          : 0)
      );
      const recordedRetentionCloseHours = protocol?.definition?.retentionCloseHours;
      const retentionCloseHours = recordedRetentionCloseHours === null ? null : Number(
        recordedRetentionCloseHours ?? (experimentId === proactiveStudyConfig.experimentId
          ? proactiveRetentionCloseHours
          : retentionDelayHours)
      );
      const retentionReminderHours = Array.isArray(
        protocol?.definition?.retentionReminderHours
      )
        ? protocol.definition.retentionReminderHours
        : experimentId === proactiveStudyConfig.experimentId
          ? proactiveRetentionReminderHours
          : [];
      const assignmentRoster = db.proactiveAssignmentRoster({
        experimentId,
        condition: boundedLearningText(url.searchParams.get("condition"), 40),
        limit: Math.max(1, Math.min(Number(url.searchParams.get("limit") || 500), 1000)),
        offset: Math.max(0, Number(url.searchParams.get("offset") || 0))
      });
      const experimentAnalysis = db.proactiveExperimentAnalysis({
        outcomeInstrumentVersion: protocol?.definition?.outcomeInstrumentVersion
          || proactiveOutcomes.version,
        experimentId,
        chapterId,
        assessmentQuestionCounts: {
          pre: chapterId === proactiveStudyConfig.chapterId
            ? proactiveAssessmentQuestionCount("pre")
            : 0,
          formative: chapterId === proactiveStudyConfig.chapterId
            ? proactiveAssessmentQuestionCount("formative")
            : 0,
          post: chapterId === proactiveStudyConfig.chapterId
            ? proactiveAssessmentQuestionCount("post")
            : 0
        },
        retentionDelayHours,
        retentionCloseHours,
        retentionReminderHours,
        now: nowIso()
      });
      sendJson(res, 200, {
        ok: true,
        data: {
          ...page,
          rows,
          assignments: db.proactiveAssignmentSummary(experimentId),
          assignmentRoster,
          participation: db.proactiveParticipationSummary(experimentId),
          summary: {
            ...db.proactiveDecisionSummary(experimentId),
            autonomy: db.proactiveAutonomySummary(experimentId)
          },
          policy,
          protocol,
          runtime: runtime ? adminProactiveRuntime(runtime) : null,
          runtimeEvents: db.listProactiveExperimentRuntimeEvents(experimentId),
          integrity: proactiveIntegrityReport(experimentId),
          participantFlow: db.proactiveParticipantFlow({
            experimentId,
            chapterId,
            posttestQuestionCount: chapterId === proactiveStudyConfig.chapterId
              ? proactiveAssessmentQuestionCount("post")
              : 0
          }),
          participantAnalysis: experimentAnalysis.participants,
          coursewareChallenges: experimentAnalysis.challenges,
          analysisSummary: experimentAnalysis.summary,
          dataQuality: experimentAnalysis.quality,
          outcomes: {
            ...outcomePage,
            rows: outcomeRows,
            summary: db.proactiveOutcomeSummary(experimentId),
            sessions: outcomeSessionPage.rows,
            sessionTotal: outcomeSessionPage.total,
            sessionLimit: outcomeSessionPage.limit,
            sessionOffset: outcomeSessionPage.offset,
            sessionSummary: db.proactiveOutcomeSessionSummary(experimentId),
            instrumentVersion: protocol?.definition?.outcomeInstrumentVersion
              || (experimentId === proactiveStudyConfig.experimentId
                ? proactiveOutcomes.version
                : ""),
            retentionDelayHours,
            retentionCloseHours,
            retentionReminderHours
          }
        }
      });
      return;
    }

    if (
      req.method === "POST"
      && url.pathname === "/api/admin/research/proactive-runtime"
    ) {
      if (!checkAdmin(req)) {
        sendJson(res, 403, { ok: false, message: "需要管理员密码。" });
        return;
      }
      const body = await readJsonBody(req);
      const experimentId = boundedLearningText(
        body.experimentId || proactiveStudyConfig.experimentId,
        120
      );
      if (experimentId !== proactiveStudyConfig.experimentId) {
        sendJson(res, 409, {
          ok: false,
          code: "proactive_runtime_historical_experiment",
          message: "只能控制当前服务正在运行的主动实验。"
        });
        return;
      }
      const status = boundedLearningText(body.status, 20).toLowerCase();
      if (!["active", "paused"].includes(status)) {
        sendJson(res, 400, {
          ok: false,
          code: "proactive_runtime_status_invalid",
          message: "运行状态只能设为 active 或 paused。"
        });
        return;
      }
      const reason = boundedLearningText(body.reason, 500, true);
      if (status === "paused" && !reason) {
        sendJson(res, 400, {
          ok: false,
          code: "proactive_pause_reason_required",
          message: "暂停实验时必须记录原因。"
        });
        return;
      }
      const updatedBy = boundedLearningText(body.updatedBy || "admin", 120);
      const updatedAt = nowIso();
      const runtime = db.setProactiveExperimentRuntime({
        experimentId,
        status,
        reason,
        updatedBy,
        updatedAt
      });
      const closedInterventions = status === "paused"
        ? db.closeOpenProactiveInterventionsForExperiment({
            experimentId,
            resolvedAt: updatedAt,
            followupOutcome: {
              outcome: "experiment_paused",
              reason,
              updatedBy,
              recordedAt: updatedAt
            }
          })
        : 0;
      db.saveNow();
      sendJson(res, 200, {
        ok: true,
        data: {
          experimentId,
          protocolFingerprint: proactiveProtocolFingerprint,
          runtime: adminProactiveRuntime(runtime),
          closedInterventions,
          runtimeEvents: db.listProactiveExperimentRuntimeEvents(experimentId)
        }
      });
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
          limit: Math.max(1, Math.min(Number(url.searchParams.get("limit") || 1000), 1000)),
          offset: Math.max(0, Number(url.searchParams.get("offset") || 0))
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
      dates.limit = Math.max(1, Math.min(Number(url.searchParams.get("limit") || 500), 1000));
      dates.offset = Math.max(0, Number(url.searchParams.get("offset") || 0));
      sendJson(res, 200, { ok: true, data: db.shortAnswerResponses(dates) });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/admin/grading/regrade-candidates") {
      if (!checkAdmin(req)) { sendJson(res, 403, { ok: false, message: "需要管理员密码。" }); return; }
      const limit = Math.max(1, Math.min(Number(url.searchParams.get("limit") || 20), 100));
      const offset = Math.max(0, Number(url.searchParams.get("offset") || 0));
      const candidates = db.shortAnswerRegradeCandidates({ limit, offset });
      sendJson(res, 200, {
        ok: true,
        data: {
          ...candidates,
          runtime: gradingRuntimeInfo()
        }
      });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/admin/grading/regrade-audits") {
      if (!checkAdmin(req)) { sendJson(res, 403, { ok: false, message: "需要管理员密码。" }); return; }
      sendJson(res, 200, {
        ok: true,
        data: db.gradingRegradeAudits({
          batchId: url.searchParams.get("batchId") || "",
          limit: Math.max(1, Math.min(Number(url.searchParams.get("limit") || 100), 1000))
        })
      });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/admin/grading/regrade") {
      if (!checkAdmin(req)) { sendJson(res, 403, { ok: false, message: "需要管理员密码。" }); return; }
      const body = await readJsonBody(req);
      if (body.confirm !== "REVIEW_AND_REGRADING") {
        sendJson(res, 400, {
          ok: false,
          code: "grading_regrade_confirmation_required",
          message: "请先预览候选，并显式确认本次重新评分。"
        });
        return;
      }
      const requestedIds = Array.from(new Set(
        (Array.isArray(body.ids) ? body.ids : [])
          .map((id) => String(id || "").trim())
          .filter(Boolean)
      ));
      const batchSize = Math.max(1, Math.min(Number(body.limit || 5), 5));
      if (!requestedIds.length || requestedIds.length > batchSize) {
        sendJson(res, 400, {
          ok: false,
          code: "grading_regrade_batch_invalid",
          message: `每批必须选择 1 到 ${batchSize} 条具体记录。`
        });
        return;
      }
      const busyIds = requestedIds.filter((id) => gradingRegradeInFlightIds.has(id));
      if (busyIds.length) {
        sendJson(res, 409, {
          ok: false,
          code: "grading_regrade_in_progress",
          message: "选中的记录正在另一批重评中，请等待当前评分完成后刷新候选。",
          ids: busyIds
        });
        return;
      }
      const runtime = gradingRuntimeInfo();
      if (!runtime.liveConfigured || !["openai-compatible", "innospark", "openai"].includes(runtime.provider)) {
        sendJson(res, 503, {
          ok: false,
          code: "grading_provider_not_configured",
          message: "服务器尚未配置真实评分模型，已停止重评，原评分未改变。",
          runtime
        });
        return;
      }
      requestedIds.forEach((id) => gradingRegradeInFlightIds.add(id));
      try {
        const batch = await gradingRegrade.runRegradeBatch({
          db,
          courseAssessment,
          assessmentIndex,
          gradeOnly: (questions) => orchestrator.gradeOnly(questions),
          requestedIds,
          runtime,
          nowIso,
          randomUUID: () => crypto.randomUUID()
        });
        db.saveNow();
        sendJson(res, 200, {
          ok: true,
          data: batch
        });
      } finally {
        requestedIds.forEach((id) => gradingRegradeInFlightIds.delete(id));
      }
      return;
    }
    
    // ---- Admin: Interactions tracking ----
    if (req.method === "GET" && url.pathname === "/api/admin/stats/interactions") {
      if (!checkAdmin(req)) { sendJson(res, 403, { ok: false, message: "需要管理员密码。" }); return; }
      const dates = getDateRange(url);
      const limit = Math.max(1, Math.min(Number(url.searchParams.get("limit") || 100), 1000));
      const offset = Math.max(0, Number(url.searchParams.get("offset") || 0));
      const userId = url.searchParams.get("userId") || "";
      const detailMode = url.searchParams.get("detail") === "all" ? "all" : "meaningful";
      const data = db.getEventsByType("interaction", {
        limit,
        offset,
        userId,
        detailMode,
        dates
      });
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
      const requestedUnitId = String(body.unitId || "").trim();
      const fallbackToZero = body.fallbackToZero === true;
      const requestedIds = new Set(
        (Array.isArray(body.questions) ? body.questions : [])
          .map((question) => String(question?.questionId || "").trim())
          .filter(Boolean)
      );
      const storedRows = db.getQuizResultsByUser(auth.participant.id, 500);
      const latest = new Map();
      storedRows.forEach((row) => {
        const key = `${row.unit_id || ""}:${row.question_id || ""}`;
        if (
          !latest.has(key)
          && (!requestedUnitId || row.unit_id === requestedUnitId)
          && (!requestedIds.size || requestedIds.has(row.question_id))
        ) {
          latest.set(key, row);
        }
      });
      const questions = courseAssessment.authoritativeGradingQuestions(
        assessmentIndex,
        Array.from(latest.values())
      ).slice(0, 50);
      if (!requestedIds.size || !questions.length) {
        sendJson(res, 400, {
          ok: false,
          code: "grading_target_not_found",
          message: "没有找到可重新批改的简答题。"
        });
        return;
      }
      if (fallbackToZero) {
        const fallbackQuestions = questions.filter((question) => {
          const row = latest.get(`${question.unitId || ""}:${question.questionId || ""}`) || {};
          return row.status === "pending_review" || row.is_correct === -1;
        });
        if (!requestedIds.size || !fallbackQuestions.length) {
          sendJson(res, 400, { ok: false, message: "没有可处理的简答题。" });
          return;
        }
        const results = fallbackQuestions.map((question) => {
          const row = latest.get(`${question.unitId || ""}:${question.questionId || ""}`) || {};
          const existingFeedback = String(row.ai_feedback || "").trim();
          const feedback = /已先按 0 分计入|已暂记 0 分|可以继续学习/.test(existingFeedback)
            ? existingFeedback
            : `${existingFeedback ? `${existingFeedback.replace(/[。.!！？?\s]+$/u, "")}。` : ""}你选择继续学习。这题已暂记为 0 分并保留待复核，暂记分数不会用于学习建议。`;
          return {
            questionId: question.questionId,
            unitId: question.unitId,
            chapterId: question.chapterId,
            score: 0,
            isCorrect: false,
            confidence: 0,
            errorType: "manual_fallback",
            weakConcepts: [],
            feedback,
            reasoning: "学生选择在评分尚未完成时继续学习。",
            needsReview: true,
            provider: "manual-fallback"
          };
        });
        persistGradingResults(auth.participant, results);
        sendJson(res, 200, { ok: true, results, provider: "manual-fallback" });
        return;
      }
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
      if (rejectAgentAssistanceDuringOutcome(res, auth.participant.id)) return;
      const chapterId = String(body.chapterId || "").trim();
      const currentUnitId = String(body.currentUnitId || "").trim();
      if (!chapterId) { sendJson(res, 400, { ok: false, message: "chapterId required." }); return; }
      const sourceResults = db.getQuizResultsByUser(auth.participant.id, 500);
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
          quizQuestions: courseAssessment.authoritativeGradingQuestions(
            assessmentIndex,
            filtered,
            { retryableOnly: true }
          ),
          interactionEvidence: body.interactionEvidence && typeof body.interactionEvidence === "object" ? body.interactionEvidence : null,
          interactionEvents: recentEvents,
          completedUnitIds: Array.isArray(body.completedUnitIds) ? body.completedUnitIds.slice(0, 500) : [],
          studentName: auth.participant.nickname || "同学"
        });
        persistGradingResults(auth.participant, result.gradingResults);
        const decisionId = crypto.randomUUID();
        const decisionCreatedAt = nowIso();
        db.insertAgentDecision({
          id: decisionId, user_id: auth.participant.id, agent_type: "orchestrator",
          decision_type: "plan", input_summary: { chapterId, currentUnitId },
          output_summary: { action: coach.recommendedAction(result.plan), qa: result.qa, planner: result.planner, interactionEvidence: result.interactionEvidence },
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
            output_summary: { action: coach.recommendedAction(planResult), error: err.message, interactionEvidence: fallbackEvidence },
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
      dates.limit = Math.max(1, Math.min(Number(url.searchParams.get("limit") || 500), 1000));
      dates.offset = Math.max(0, Number(url.searchParams.get("offset") || 0));
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
    const explicitStatus = Number(error.status || 0);
    const status = explicitStatus >= 400 && explicitStatus <= 599 ? explicitStatus
      : error.message === "Request body is too large" ? 413
        : error.message === "Invalid JSON body" ? 400
          : 500;
    if (status >= 500) {
      errorMonitoring.captureException(error);
      console.error("API error:", error);
    }
    const message = status === 500 ? "服务器内部错误。"
      : error.message === "Request body is too large" ? "请求内容过大。"
        : error.message === "Invalid JSON body" ? "请求格式不正确。"
          : error.message;
    sendJson(res, status, {
      ok: false,
      ...(error.code ? { code: error.code } : {}),
      message
    });
  }
}

const server = http.createServer((req, res) => {
  // Security headers (defense-in-depth)
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");

  // Strip sub-path prefix when behind reverse proxy at e.g. /calculus_quest/
  let rawUrl = req.url || "/";
  const hasBasePath = basePath && (
    rawUrl === basePath
    || rawUrl.startsWith(basePath + "/")
    || rawUrl.startsWith(basePath + "?")
  );
  if (hasBasePath) {
    const rest = rawUrl.slice(basePath.length);
    // 不带尾斜杠访问 BASE_PATH 时补斜杠重定向，否则页面里的相对路径资源会丢失前缀
    if (rest === "" || rest.startsWith("?")) {
      res.writeHead(301, { Location: basePath + "/" + rest });
      res.end();
      return;
    }
    rawUrl = rest || "/";
  }
  const url = new URL(rawUrl, `http://${req.headers.host || "localhost"}`);
  res.once("finish", () => {
    if (res.statusCode >= 500 && !url.pathname.includes("/monitoring")) {
      errorMonitoring.capture({ code: "api_5xx", route: url.pathname, status: res.statusCode });
    }
  });

  if (url.pathname.startsWith("/api/")) {
    handleApi(req, res, url).catch((error) => {
      errorMonitoring.captureException(error);
      console.error("Unhandled API failure:", error);
      if (!res.headersSent) {
        try {
          sendJson(res, 500, { ok: false, message: "服务器内部错误。" });
          return;
        } catch {}
      }
      try { res.destroy(); } catch {}
    });
    return;
  }

  if (req.method !== "GET" && req.method !== "HEAD") {
    send(res, 405, "Method not allowed", "text/plain; charset=utf-8", { Allow: "GET, HEAD" });
    return;
  }

  if (url.pathname === publicLearningRouteStaticPath) {
    if (!publicLearningRouteJson) {
      send(res, 404, "Not found");
      return;
    }
    sendPublicLearningRoute(req, res);
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
    if (["assets/learning-runtime.js", "assets/learning-runtime.css", "assets/openmaic-classroom/renderer.js", "assets/openmaic-classroom/highlighter.js"]
      .includes(path.relative(root, filePath).replaceAll(path.sep, "/"))
      || coursewareModules.files.has(path.relative(root, filePath).replaceAll(path.sep, "/"))) {
      if (acceptsGzip(req)) {
        try {
          const compressedPath = `${filePath}.gz`;
          const compressedStat = fs.statSync(compressedPath);
          if (compressedStat.isFile() && compressedStat.mtimeMs >= stat.mtimeMs) {
            streamStaticFile(req, res, compressedPath, type, url, compressedStat, {
              ...staticHeaders(filePath, url),
              "Content-Encoding": "gzip", Vary: "Accept-Encoding",
              "Cache-Control": cacheControlFor(filePath, url)
            });
            return;
          }
        } catch {}
      }
    }
    const bridgeCourseware = isCoursewareHtml(filePath);
    const bundledIndex = learningRuntimeHtml && filePath === path.join(root, "index.html");
    if (!bridgeCourseware && !bundledIndex && (stat.size > maxBufferedStaticBytes || req.method === "HEAD")) {
      streamStaticFile(req, res, filePath, type, url, stat);
      return;
    }

    fs.readFile(filePath, (error, data) => {
      if (error) {
        send(res, 404, "Not found");
        return;
      }

      const responseData = bridgeCourseware ? injectCoursewareBridge(data, filePath)
        : filePath === path.join(root, "index.html") && learningRuntimeHtml ? learningRuntimeHtml : data;
      if (req.method === "HEAD") {
        res.writeHead(200, {
          "Content-Type": type,
          ...staticHeaders(filePath, url, {
            "Content-Length": String(responseData.length)
          })
        });
        res.end();
        return;
      }

      if (shouldCompress(req, type, responseData.length)) {
        const cacheKey = gzipCacheKey(filePath, responseData);
        const cached = gzipCache.get(cacheKey);
        if (cached) {
          send(res, 200, cached, type, staticHeaders(filePath, url, {
            "Content-Encoding": "gzip",
            Vary: "Accept-Encoding"
          }));
          return;
        }
        zlib.gzip(responseData, (gzipError, compressed) => {
          if (gzipError) {
            send(res, 200, responseData, type, staticHeaders(filePath, url));
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
      send(res, 200, responseData, type, staticHeaders(filePath, url));
    });
  });
});

function shutdown(signal) {
  console.log(`${signal} received. Saving database before shutdown...`);
  systemAnnouncementApi.closeStreams();
  try {
    db.saveNow();
  } catch (error) {
    console.error("Final database save failed:", error.message);
  }
  server.close(() => {
    db.releaseWriteLock();
    process.exit(0);
  });
  setTimeout(() => {
    db.releaseWriteLock();
    process.exit(0);
  }, 3000).unref();
}

process.once("SIGINT", () => shutdown("SIGINT"));
process.once("SIGTERM", () => shutdown("SIGTERM"));

let emergencyExitStarted = false;

function emergencyExit(kind, error) {
  if (emergencyExitStarted) return;
  emergencyExitStarted = true;
  errorMonitoring.captureException(error, kind === "Unhandled rejection" ? "server_rejection" : "server_exception");
  console.error(`${kind}:`, error);
  try {
    db.saveNow();
  } catch (saveError) {
    console.error("Emergency database save failed:", saveError.message);
  }
  try { db.releaseWriteLock(); } catch {}
  errorMonitoring.flush().finally(() => process.exit(1));
}

process.on("uncaughtException", (error) => emergencyExit("Uncaught exception", error));
process.on("unhandledRejection", (reason) => emergencyExit("Unhandled rejection", reason));

// Initialize database on startup, then start server
try {
  db.acquireWriteLock();
} catch (error) {
  console.error("Database writer lock failed:", error.message);
  process.exit(1);
}

db.getDb().then(() => {
 console.log("Database initialized.");
  systemAnnouncementApi.ensureSchema(db.getDbSync());
  freezeProactiveProtocol();
  db.saveNow();
  // Migration: fix existing is_correct bug where pending short answers (-1) were stored as 1
 try {
    const fixedCount = db.normalizeLegacyPendingShortAnswerFlags();
    if (fixedCount > 0) {
     db.saveNow();
      console.log(`Data migration: fixed ${fixedCount} short answer is_correct values.`);
   }
  } catch (e) {
   console.warn("Migration skipped:", e.message);
  }
  try {
    const restoredCount = db.normalizeReviewedShortAnswerFlags();
    if (restoredCount > 0) {
      db.saveNow();
      console.log(`Data migration: restored ${restoredCount} reviewed short answer flags.`);
    }
  } catch (e) {
    console.warn("Reviewed short answer flag migration skipped:", e.message);
  }
  try {
    const recoveredCount = db.normalizeFailedPendingQuizReviews();
    if (recoveredCount > 0) {
      db.saveNow();
      console.log(`Data migration: recovered ${recoveredCount} failed short answer reviews.`);
    }
  } catch (e) {
    console.warn("Failed short answer recovery migration skipped:", e.message);
  }
  try {
    const reconciled = reconcileStoredSnapshotQuizResults();
    if (reconciled.inserted || reconciled.updated) db.saveNow();
    if (reconciled.inserted || reconciled.updated || reconciled.snapshots) {
      console.log(
        `Data reconciliation: checked ${reconciled.snapshots}/${reconciled.users} snapshots, `
        + `inserted ${reconciled.inserted} quiz results, updated ${reconciled.updated}.`
      );
    }
  } catch (e) {
    console.warn("Stored snapshot quiz reconciliation skipped:", e.message);
  }
 server.listen(port, host, () => {
    console.log(`Calculus Quest running at http://${host}:${port}/`);
    console.log(`Admin dashboard: http://${host}:${port}/admin.html`);
  });
}).catch((err) => {
  db.releaseWriteLock();
  console.error("Failed to initialize database:", err);
  process.exit(1);
});
