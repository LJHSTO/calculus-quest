// DOM references, storage, API helpers, and course loading.
const els = {
  metricChapters: document.querySelector("#metric-chapters"),
  metricScenes: document.querySelector("#metric-scenes"),
  metricGlm: document.querySelector("#metric-glm"),
  metricHtml: document.querySelector("#metric-html"),
  metricAudio: document.querySelector("#metric-audio"),
  chapterList: document.querySelector("#chapter-list"),
  lessonList: document.querySelector("#lesson-list"),
  chapterTitle: document.querySelector("#chapter-title"),
  lessonType: document.querySelector("#lesson-type"),
  lessonTitle: document.querySelector("#lesson-title"),
  lessonSummary: document.querySelector("#lesson-summary"),
  lessonPlayer: document.querySelector("#lesson-player"),
  recommendationPanel: document.querySelector("#recommendation-panel"),
  completeLesson: document.querySelector("#complete-lesson"),
  fullscreenPlayer: document.querySelector("#fullscreen-player"),
  authGate: document.querySelector("#auth-gate"),
  loginForm: document.querySelector("#login-form"),
  nickname: document.querySelector("#nickname"),
  loginFeedback: document.querySelector("#login-feedback"),
  authStatus: document.querySelector("#auth-status"),
  authAction: document.querySelector("#auth-action"),
  agentBoard: document.querySelector("#agent-board"),
  resourceGrid: document.querySelector("#resource-grid"),
  libraryCount: document.querySelector("#library-count"),
  completedCount: document.querySelector("#completed-count"),
  chapterProgress: document.querySelector("#chapter-progress"),
  quizDashboard: document.querySelector("#quiz-dashboard"),
  activityLog: document.querySelector("#activity-log"),
  reflectionNote: document.querySelector("#reflection-note"),
  evaluationBoard: document.querySelector("#evaluation-board"),
  evaluationMetrics: document.querySelector("#evaluation-metrics"),
  evaluationRuns: document.querySelector("#evaluation-runs")
};

function storageKeyFor(participantId) {
  return participantId ? `${STORAGE_KEY}:${participantId}` : STORAGE_KEY;
}

function learningDefaults() {
  return {
    completed: [],
    quizResults: [],
    quizDrafts: {},
    submittedQuizzes: [],
    recommendationsCollapsed: false,
    logs: [],
    note: "",
    currentChapterId: "A1",
    currentUnitId: "",
    currentView: "home"
  };
}

function loadState() {
  const fallback = { ...learningDefaults(), participant: null, authToken: "" };
  try {
    const lastPid = localStorage.getItem(LAST_PARTICIPANT_KEY);
    const key = lastPid ? storageKeyFor(lastPid) : STORAGE_KEY;
    const raw = localStorage.getItem(key);
    const saved = raw ? JSON.parse(raw) : {};
    return { ...fallback, ...saved, authToken: saved.authToken || localStorage.getItem(AUTH_TOKEN_KEY) || "" };
  } catch {
    return fallback;
  }
}

function saveState() {
  state.currentChapterId = currentChapterId;
  state.currentUnitId = currentUnitId;
  state.currentView = currentView;
  const key = state.participant?.participantId
    ? storageKeyFor(state.participant.participantId)
    : STORAGE_KEY;
  localStorage.setItem(key, JSON.stringify(state));
  queueLearningSnapshot("state_change");
}

function resourceUrl(path) {
  return encodeURI(path);
}

async function fetchJson(path, errorMessage) {
  const response = await fetch(resourceUrl(path));
  if (!response.ok) throw new Error(errorMessage || `${path} 加载失败`);
  return response.json();
}

function beijingNow() {
  const d = new Date();
  return new Date(d.getTime() + 8 * 3600 * 1000).toISOString().slice(0, -1) + "+08:00";
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function renderInlineMath(text) {
  if (!text || typeof text !== "string") return escapeHtml(String(text || ""));
  if (typeof katex === "undefined") return escapeHtml(text);
  const parts = [];
  let last = 0;
  const re = /\$([^$]+)\$/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(escapeHtml(text.slice(last, m.index)));
    try {
      parts.push(katex.renderToString(m[1], { throwOnError: false, displayMode: false, trust: true }));
    } catch {
      parts.push(escapeHtml(m[0]));
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(escapeHtml(text.slice(last)));
  return parts.join("");
}

// Render $...$ math inside text that may already contain HTML tags
function renderMathInHtml(html) {
  if (!html || typeof html !== "string") return escapeHtml(String(html || ""));
  if (typeof katex === "undefined") return html;
  return html.replace(/\$([^$]+)\$/g, (_, math) => {
    try {
      return katex.renderToString(math, { throwOnError: false, displayMode: false, trust: true });
    } catch {
      return "$" + math + "$";
    }
  });
}

function isSignedIn() {
  return Boolean(state.participant?.participantId && state.authToken);
}

function renderAuth() {
  if (!els.authGate) return;
  const signedIn = isSignedIn();
  els.authGate.hidden = signedIn;
  els.authStatus.textContent = signedIn ? state.participant.nickname : "未登录";
  els.authAction.textContent = signedIn ? "退出" : "登录";
  els.authAction.setAttribute("aria-label", signedIn ? "退出测试登录" : "打开昵称登录");
}

function showLogin(message = "") {
  if (!els.authGate) return;
  els.authGate.hidden = false;
  if (els.loginFeedback) els.loginFeedback.textContent = message;
  els.nickname?.focus();
}

async function apiRequest(path, body = {}) {
  const response = await fetch(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(state.authToken ? { Authorization: `Bearer ${state.authToken}` } : {})
    },
    body: JSON.stringify(body)
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.ok === false) {
    throw new Error(payload.message || "请求失败，请稍后再试。");
  }
  return payload;
}

function learningSnapshot() {
  return {
    participant: state.participant,
    completed: state.completed || [],
    quizResults: state.quizResults || [],
    quizDrafts: state.quizDrafts || {},
    recommendationsCollapsed: Boolean(state.recommendationsCollapsed),
    logs: state.logs || [],
    note: state.note || "",
    currentChapterId,
    currentUnitId,
    currentView,
    capturedAt: beijingNow()
  };
}

function queueLearningSnapshot(reason = "state_change") {
  if (!isSignedIn()) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    syncLearningSnapshot(reason);
  }, 900);
}

async function syncLearningSnapshot(reason = "manual") {
  if (!isSignedIn()) return;
  const snapshot = learningSnapshot();
  const snapshotJson = JSON.stringify(snapshot);
  if (reason === "state_change" && snapshotJson === lastSnapshotJson) return;
  lastSnapshotJson = snapshotJson;
  try {
    await apiRequest("/api/learning/snapshot", {
      token: state.authToken,
      reason,
      snapshot
    });
  } catch (error) {
    console.warn("Learning snapshot sync failed:", error.message);
  }
}

async function trackLearningEvent(type, payload = {}, syncSnapshot = true) {
  if (!isSignedIn()) return;
  try {
    await apiRequest("/api/learning/event", {
      token: state.authToken,
      type,
      payload
    });
  } catch (error) {
    console.warn("Learning event sync failed:", error.message);
  }
  if (syncSnapshot) queueLearningSnapshot(type);
}

async function loginParticipant(nickname) {
  // Save current state to current user's key before switching
  saveState();

  const payload = await apiRequest("/api/auth/login", { nickname });
  const lastPid = localStorage.getItem(LAST_PARTICIPANT_KEY);
  const newPid = payload.participant.participantId;
  const isSameUser = lastPid === newPid;
  const isNewAccount = payload.participant.createdAt === payload.participant.lastSeenAt;

  if (!isSameUser) {
    // Migrate: if old generic key has data, move it to the new user's key
    const oldGeneric = localStorage.getItem(STORAGE_KEY);
    if (oldGeneric && !localStorage.getItem(storageKeyFor(newPid))) {
      localStorage.setItem(storageKeyFor(newPid), oldGeneric);
      localStorage.removeItem(STORAGE_KEY);
    }

    // Load new user's saved state, or start fresh
    const newKey = storageKeyFor(newPid);
    const saved = localStorage.getItem(newKey);
    if (saved) {
      // Restore this user's previous learning data
      const parsed = JSON.parse(saved);
      Object.assign(state, learningDefaults(), parsed);
    } else if (isNewAccount) {
      // Brand new account — reset all learning progress
      Object.assign(state, learningDefaults());
    }
    // Switch to home view for any user change
    currentChapterId = state.currentChapterId;
    currentUnitId = state.currentUnitId;
    switchView("home");
  }

  state.participant = payload.participant;
  state.authToken = payload.token;
  localStorage.setItem(AUTH_TOKEN_KEY, payload.token);
 localStorage.setItem(LAST_PARTICIPANT_KEY, newPid);
  // Returning user on a new browser — merge server snapshot before saving
  // (otherwise syncLearningSnapshot uploads empty state and destroys progress)
  if (!isSameUser && !isNewAccount) {
    try {
      const snapRes = await fetch("/api/learning/snapshot", {
        headers: { Authorization: `Bearer ${state.authToken}` }
      });
      if (snapRes.ok) {
        const snap = await snapRes.json();
        if (snap.ok && snap.snapshot) {
          const srv = snap.snapshot;
          state.completed = [...new Set([...(state.completed || []), ...(srv.completed || [])])];
          if (!(state.quizResults || []).length && Array.isArray(srv.quizResults))
            state.quizResults = srv.quizResults;
          if (!(state.logs || []).length && Array.isArray(srv.logs))
            state.logs = srv.logs;
          state.submittedQuizzes = [...new Set([...(state.submittedQuizzes || []), ...(srv.submittedQuizzes || [])])];
          if (!state.note && srv.note) state.note = srv.note;
          if (!state.currentChapterId && srv.currentChapterId) state.currentChapterId = srv.currentChapterId;
          if (!state.currentUnitId && srv.currentUnitId) state.currentUnitId = srv.currentUnitId;
        }
      }
  } catch { /* server snapshot unavailable */ }
 }
  
  // Also fetch authoritative quiz results from server quiz_results table
  // (the snapshot's quizResults might be stale if the previous browser
  //  didn't sync before closing. This endpoint reads the actual DB rows.)
  if (!isSameUser && !isNewAccount) {
    try {
      const qrRes = await fetch("/api/learning/quiz-results", {
        headers: { Authorization: `Bearer ${state.authToken}` }
      });
      if (qrRes.ok) {
        const qrData = await qrRes.json();
        if (qrData.ok && Array.isArray(qrData.data) && qrData.data.length) {
          const results = qrData.data.map(r => {
            let resp = r.response || "";
            if (typeof resp === "string" && resp.startsWith("[")) {
              try { resp = JSON.parse(resp); } catch {}
            }
            return {
              id: r.id,
              unitId: r.unit_id,
              questionId: r.question_id,
              chapterId: r.chapter_id,
              chapterLabel: r.chapter_label,
              unitLabel: r.unit_label,
              questionType: r.question_type,
              points: r.points,
              phase: r.phase,
              timestamp: r.created_at,
              response: resp,
              isCorrect: r.is_correct === 1 ? true : r.is_correct === 0 ? false : null,
              status: r.status,
              score: r.score,
              maxScore: r.max_score,
              estimateLabel: null
            };
          });
          state.quizResults = results;
          const unitIds = new Set();
          qrData.data.forEach(r => { if (r.unit_id) unitIds.add(r.unit_id); });
          state.submittedQuizzes = [...unitIds];
        }
      }
    } catch { /* quiz results unavailable */ }
  }
  
 saveState();
 renderAll();
 await syncLearningSnapshot("login");
}

function logoutParticipant() {
  saveState(); // Save to current user's key before clearing identity
  stopNarrationQueue();
  state.participant = null;
  state.authToken = "";
  localStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(LAST_PARTICIPANT_KEY);
  // Reset runtime learning state to defaults
  Object.assign(state, learningDefaults(), { participant: null, authToken: "" });
  currentChapterId = "A1";
  currentUnitId = "";
  switchView("home");
  renderAuth();
  showLogin("已退出登录。");
}

function quizDraftKey(unitId, questionId) {
  return `${unitId}:${questionId}`;
}

function readQuizDraft(unitId, questionId, fallback = "") {
  const value = state.quizDrafts?.[quizDraftKey(unitId, questionId)];
  return value === undefined ? fallback : value;
}

function rememberQuizDraft(unitId, questionId, value) {
  state.quizDrafts = state.quizDrafts || {};
  state.quizDrafts[quizDraftKey(unitId, questionId)] = value;
  saveState();
}

async function loadChapterManifest(chapterId) {
  if (manifests.has(chapterId)) return manifests.get(chapterId);
  if (manifestPromises.has(chapterId)) return manifestPromises.get(chapterId);

  const chapter = chapters.find((item) => item.id === chapterId) || chapters[0];
  const promise = (async () => {
    try {
      const manifest = await fetchJson(`resources/open-maic/${chapter.id}/index.json`, `${chapter.label} index 加载失败`);
      manifests.set(chapter.id, manifest);
      buildCurriculum();
      return manifest;
    } catch (error) {
      console.warn(`${chapter.label} lightweight index unavailable`, error);
      throw new Error(`${chapter.label} 轻量索引加载失败，请检查 resources/open-maic/${chapter.id}/index.json 是否已部署。`);
    } finally {
      manifestPromises.delete(chapter.id);
    }
  })();
  manifestPromises.set(chapter.id, promise);
  return promise;
}

async function ensureChapterLoaded(chapterId, options = {}) {
  if (options.showLoading !== false) {
    const chapter = chapters.find((item) => item.id === chapterId) || chapters[0];
    renderLoadingStatus(chapter.label);
  }
  await loadChapterManifest(chapterId);
  buildCurriculum();
}

async function loadCourseIndex() {
  if (courseIndex) return courseIndex;
  try {
    courseIndex = await fetchJson(COURSE_INDEX_PATH, "course-index 加载失败");
  } catch (error) {
    console.warn("Course index unavailable; metrics will use loaded chapters only.", error);
    courseIndex = { chapters: [], totals: null };
  }
  return courseIndex;
}

function chapterStats(chapterId) {
  return courseIndex?.chapters?.find((chapter) => chapter.id === chapterId) || null;
}

function totalMainUnitCount() {
  return courseIndex?.totals?.scenes || allUnits().length;
}

function isMainUnitId(id = "") {
  return chapters.some((chapter) => id.startsWith(`${chapter.id}-scene-`));
}

function scheduleChapterPrefetch() {
  if (prefetchStarted) return;
  prefetchStarted = true;
}

function preloadChapterResources(chapterId) {
  // Large interactive lessons and audio are loaded only when the learner opens them.
}

function renderLoadingStatus(chapterLabel = "课程") {
  if (!els.lessonPlayer) return;
  els.lessonPlayer.innerHTML = `
    <div class="empty-state loading-state">
      <h2>正在加载课程资源</h2>
      <p>正在读取「${escapeHtml(chapterLabel)}」的课程内容、互动实验和测验数据。</p>
      <div class="progress-line" aria-label="资源加载中">
        <span style="width:42%"></span>
      </div>
      <small>现在按章节加载，互动实验和音频会在打开时按需读取。</small>
    </div>
  `;
}

function buildCurriculum() {
  curriculum = chapters.map(buildChapter);

  supplementUnits = buildSupplementUnits();
  const currentChapter = getChapter();
  const currentSupplement = supplementUnits.some((unit) => unit.id === currentUnitId);
  if (currentChapter?.units?.length && (!currentUnitId || (!findMainUnit(currentUnitId) && !currentSupplement))) {
    currentUnitId = currentChapter.units[0].id;
  }
}

function buildChapter(chapter) {
    const manifest = manifests.get(chapter.id);
  if (!manifest) {
    return {
      ...chapter,
      manifest: null,
      units: [],
      loaded: false
    };
  }

    const quizTotal = manifest.scenes.filter((scene) => scene.type === "quiz").length;
    let quizIndex = 0;
    const scenes = manifest.scenes.map((scene, index) => {
      const assessmentPhase = scene.type === "quiz" ? assessmentPhaseFor(quizIndex++, quizTotal) : "";
      return {
        id: `${chapter.id}-scene-${scene.order || index + 1}`,
        kind: "scene",
        chapterId: chapter.id,
        scene,
        label: summarizeScene(scene, index, assessmentPhase),
        summary: describeScene(scene),
        type: scene.type,
        assessmentPhase
      };
    });

    return {
      ...chapter,
      manifest,
    units: orderMainScenes(scenes),
    loaded: true
    };
}

function orderMainScenes(scenes) {
  const pre = scenes.filter((unit) => unit.assessmentPhase === "pre");
  const rest = scenes.filter((unit) => unit.assessmentPhase !== "pre");
  return [...pre, ...rest];
}

function buildSupplementUnits() {
  let index = 0;
  return Object.entries(supplementAnalysis).flatMap(([file, analysis]) =>
    supplementModels.map((model) => ({
      id: `supplement-${model.id}-${hashString(file)}`,
      kind: "supplement",
      chapterId: analysis.chapterId,
      file,
      modelId: model.id,
      modelLabel: model.label,
      modelRole: model.role,
      label: `${analysis.title} · ${model.label}`,
      summary: `${model.role}：${analysis.bestFor}`,
      type: "supplement",
      analysis,
      order: index++
    }))
  );
}

function hashString(value) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash.toString(36);
}

function assessmentPhaseFor(index, total) {
  if (index === 0) return "pre";
  if (index === total - 1) return "post";
  return "formative";
}

function phaseText(phase) {
  return {
    pre: "前测",
    formative: "形成性测验",
    post: "后测"
  }[phase] || "";
}

function phaseGoal(phase) {
  return {
    pre: "别紧张！这不是考试，只是为了了解你对这个话题的已有理解，答错没关系，学完之后会再做一次后测来对比进步。",
    formative: "边学边检查卡点，把错误变成下一步提示。",
    post: "完成通关验证，沉淀可用于研究评估的学习证据。"
  }[phase] || "";
}

function summarizeScene(scene, index, assessmentPhase = "") {
  if (scene.type === "quiz") {
    return phaseText(assessmentPhase) || (index === 0 ? "前测" : "阶段测");
  }

  if (scene.type === "slide") {
    if (/地图|路线/.test(scene.title)) return "概念地图";
    if (/公式|桥/.test(scene.title)) return "公式桥";
    if (/复盘|兜底|检查/.test(scene.title)) return "复盘页";
    return "讲解页";
  }

  return `实验：${compactTitle(scene.title)}`;
}

function compactTitle(title) {
  return title
    .replace(/^.*?：/, "")
    .replace(/实验|挑战|游戏|探针|同步器|生成器|分类器|播放器|仪表盘|可视化|大作战|大比拼|闯关|扫描仪/g, "")
    .replace(/^\d+_/, "")
    .replace(/\.html$/, "")
    .slice(0, 12);
}

function describeScene(scene) {
  if (scene.type === "quiz") return "站内整页答题，提交后记录学习证据。";
  if (scene.type === "slide") return "概念讲解，配合教师旁白。";
  return "站内互动实验。";
}

function getChapter(id = currentChapterId) {
  return curriculum.find((chapter) => chapter.id === id) || curriculum[0] || chapters[0];
}

function findMainUnit(id) {
  for (const chapter of curriculum) {
    const unit = chapter.units.find((item) => item.id === id);
    if (unit) return unit;
  }
  return null;
}

function getUnit(id = currentUnitId) {
  const mainUnit = findMainUnit(id);
  if (mainUnit) return mainUnit;
  const supplement = supplementUnits.find((item) => item.id === id);
  if (supplement) return supplement;
  return getChapter()?.units?.[0] || null;
}

