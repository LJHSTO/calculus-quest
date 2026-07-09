// Agentic Coach path-locking and KG recommendation UI.
const AGENTIC_PRE_SKIP_THRESHOLD = 0.8;
const AGENTIC_POST_REMEDIATION_THRESHOLD = 0.6;
const AGENTIC_ENABLE_EXTENSION = false;
const AGENTIC_REMOTE_PLAN_TIMEOUT_MS = 2500;
const AGENTIC_ALWAYS_RECOMMEND_EXTENSION_CHAPTERS = new Set(["V14-X2", "V14-X5"]);
const AGENTIC_FINAL_MASTERY_EXTENSION_CHAPTERS = new Set(["V14-X3", "V14-X4"]);

function agenticV14Mode() {
  return typeof isOpenMaicV14Route === "function" && isOpenMaicV14Route();
}
function agenticInitialUnitId() {
  const firstChapter = (typeof curriculum !== "undefined" && curriculum[0]) || getChapter?.();
  return firstChapter?.units?.[0]?.id || currentUnitId || `${chapters[0]?.id || "V14-C1"}-pre`;
}

function agenticChapterPostUnit(chapter) {
  const units = chapter?.units || chapter?.allUnits || [];
  return [...units].reverse().find((unit) => unit.type === "quiz" && unit.assessmentPhase === "post") || null;
}

function agenticIsExtensionChapter(chapter = {}) {
  return Boolean(chapter?.extension || chapter?.track === "extension");
}

function agenticExtensionChapterHasEvidence(chapterId = "") {
  if (!chapterId) return false;
  const belongs = (unitId) => agenticChapterIdForUnitId(unitId) === chapterId;
  return (state.completed || []).some(belongs)
    || (state.submittedQuizzes || []).some(belongs)
    || (state.quizResults || []).some((entry) => (entry?.chapterId || agenticChapterIdForUnitId(entry?.unitId || "")) === chapterId)
    || Object.keys(state.quizAttempts || {}).some((unitId) => belongs(unitId));
}

function agenticExtensionChapterVisible(chapterId = "", path = state.agenticPath || {}) {
  if (!chapterId) return false;
  const unlocked = new Set(path.unlockedExtensionChapters || []);
  return unlocked.has(chapterId) || agenticExtensionChapterHasEvidence(chapterId);
}

function agenticExtensionChaptersForChapter(chapterId = "") {
  return (curriculum || [])
    .filter((chapter) => agenticIsExtensionChapter(chapter) && chapter.recommendedAfter === chapterId)
    .sort((a, b) => (a.order || 0) - (b.order || 0) || String(a.id).localeCompare(String(b.id), "zh-Hans-CN"));
}

function agenticFirstLockedExtensionChapterFor(chapterId = "") {
  return agenticLockedExtensionChaptersForChapter(chapterId)[0] || null;
}

function agenticLockedExtensionChaptersForChapter(chapterId = "") {
  const path = state.agenticPath || {};
  return agenticExtensionChaptersForChapter(chapterId)
    .filter((chapter) => !agenticExtensionChapterVisible(chapter.id, path));
}

function agenticRecordsForChapterPost(chapterId = "", fallbackRecords = []) {
  const chapter = getChapter?.(chapterId) || (curriculum || []).find((item) => item.id === chapterId);
  const post = agenticChapterPostUnit(chapter);
  if (post?.id) {
    const records = agenticQuizRecordsForUnit(post.id);
    if (records.length) return records;
  }
  return fallbackRecords || [];
}

function agenticChapterPostMasteryIsHigh(chapterId = "", fallbackRecords = []) {
  const records = agenticRecordsForChapterPost(chapterId, fallbackRecords);
  const stats = agenticQuizStats(records);
  if (stats.accuracy === null || stats.accuracy < AGENTIC_PRE_SKIP_THRESHOLD) return false;
  const assessedMastery = agenticQuizKnowledgeMastery(records, chapterId)
    .filter((item) => item.attempts > 0 && item.status !== "pending" && item.status !== "unknown");
  return assessedMastery.length > 0 && assessedMastery.every((item) => item.status === "strong");
}

function agenticMainChaptersThrough(chapterId = "") {
  const main = (curriculum || []).filter((chapter) => !agenticIsExtensionChapter(chapter));
  const index = main.findIndex((chapter) => chapter.id === chapterId);
  return index >= 0 ? main.slice(0, index + 1) : [];
}

function agenticCumulativeMasteryIsHighThrough(chapterId = "", currentRecords = []) {
  const chaptersToCheck = agenticMainChaptersThrough(chapterId);
  return chaptersToCheck.length > 0 && chaptersToCheck.every((chapter) =>
    agenticChapterPostMasteryIsHigh(chapter.id, chapter.id === chapterId ? currentRecords : [])
  );
}

function agenticShouldRecommendExtensionChapter(chapter = {}, unit = {}, records = []) {
  if (!chapter?.id) return false;
  if (AGENTIC_ALWAYS_RECOMMEND_EXTENSION_CHAPTERS.has(chapter.id)) return true;
  if (AGENTIC_FINAL_MASTERY_EXTENSION_CHAPTERS.has(chapter.id)) {
    return agenticCumulativeMasteryIsHighThrough(unit.chapterId || chapter.recommendedAfter, records);
  }
  return agenticChapterPostMasteryIsHigh(unit.chapterId || chapter.recommendedAfter, records);
}

function agenticRecommendedExtensionChaptersForPost(unit = {}, records = []) {
  return agenticLockedExtensionChaptersForChapter(unit.chapterId)
    .filter((chapter) => agenticShouldRecommendExtensionChapter(chapter, unit, records));
}

function agenticExtensionChapterCandidate(chapter) {
  if (!chapter) return null;
  const firstUnit = chapter.units?.[0] || chapter.allUnits?.[0] || null;
  const copy = typeof chapterDisplayCopy === "function" ? chapterDisplayCopy(chapter) : { label: chapter.label };
  return {
    id: firstUnit?.id || "",
    chapterId: chapter.id,
    title: copy.label || chapter.label,
    label: copy.label || chapter.label,
    role: "extension_chapter",
    modality: "chapter",
    reason: `recommended_after_${chapter.recommendedAfter || "main"}`
  };
}

function agenticUnlockExtensionChapter(chapterId = "", fromChapterId = "", reason = "posttest_extension_recommended") {
  const path = ensureAgenticPath();
  const chapter = getChapter?.(chapterId) || (curriculum || []).find((item) => item.id === chapterId);
  if (!chapter || !agenticIsExtensionChapter(chapter)) return null;
  path.unlockedExtensionChapters = Array.from(new Set([...(path.unlockedExtensionChapters || []), chapter.id]));
  if (fromChapterId) {
    path.extensionRecommendations = path.extensionRecommendations || {};
    path.extensionRecommendations[chapter.id] = {
      fromChapterId,
      reason,
      unlockedAt: beijingNow()
    };
  }
  const firstUnit = chapter.units?.[0] || chapter.allUnits?.[0] || null;
  if (firstUnit?.id) agenticUnlockUnit(firstUnit.id, reason);
  analyticsTrack("agentic_extension_chapter_unlocked", { data: { chapterId: chapter.id, fromChapterId, reason } });
  trackLearningEvent("agentic_extension_chapter_unlocked", { chapterId: chapter.id, fromChapterId, reason }, false);
  return firstUnit;
}

function agenticVisibleChapterEntries() {
  const path = state.agenticPath || {};
  const main = (curriculum || []).filter((chapter) => !agenticIsExtensionChapter(chapter));
  const extensions = (curriculum || []).filter((chapter) =>
    agenticIsExtensionChapter(chapter) && agenticExtensionChapterVisible(chapter.id, path)
  );
  const entries = [];
  let extensionIndex = 0;
  main.forEach((chapter, mainIndex) => {
    entries.push({ chapter, index: curriculum.indexOf(chapter), mainIndex: mainIndex + 1, extensionIndex: 0 });
    extensions
      .filter((extension) => extension.recommendedAfter === chapter.id)
      .forEach((extension) => {
        extensionIndex += 1;
        entries.push({ chapter: extension, index: curriculum.indexOf(extension), mainIndex: 0, extensionIndex });
      });
  });
  extensions
    .filter((extension) => !main.some((chapter) => chapter.id === extension.recommendedAfter))
    .forEach((extension) => {
      extensionIndex += 1;
      entries.push({ chapter: extension, index: curriculum.indexOf(extension), mainIndex: 0, extensionIndex });
    });
  return entries;
}

function agenticMarkChapterReadyOnPath(path, chapterId, reason = "") {
  if (!path || !chapterId) return false;
  const chapter = getChapter?.(chapterId) || (curriculum || []).find((item) => item.id === chapterId);
  const post = agenticChapterPostUnit(chapter);
  path.chapterAdvanceReady = path.chapterAdvanceReady || {};
  path.chapterAdvanceReady[chapterId] = true;
  if (post?.id) path.chapterAdvanceReady[post.id] = true;
  if (reason) {
    path.chapterAdvanceReasons = path.chapterAdvanceReasons || {};
    path.chapterAdvanceReasons[chapterId] = reason;
    if (post?.id) path.chapterAdvanceReasons[post.id] = reason;
  }
  return true;
}

function agenticMarkChapterReadyToAdvance(chapterId, reason = "") {
  return agenticMarkChapterReadyOnPath(ensureAgenticPath(), chapterId, reason);
}

function agenticDecisionShowsPostAdvance(chapter, path = state.agenticPath || {}) {
  const post = agenticChapterPostUnit(chapter);
  if (!post?.id) return false;
  return (path.decisions || []).some((decision) =>
    decision?.fromUnitId === post.id &&
    decision.action === "continue" &&
    (decision.targetId || decision.nextUnitId)
  );
}

function agenticChapterReadyToAdvance(chapter, path = state.agenticPath || {}) {
  const post = agenticChapterPostUnit(chapter);
  if (!post?.id) return false;
  const ready = path.chapterAdvanceReady || {};
  if (ready[chapter.id] || ready[post.id]) return true;
  const submitted = (state.submittedQuizzes || []).includes(post.id);
  const completed = (state.completed || []).includes(post.id);
  if (!submitted && !completed) return false;
  return agenticDecisionShowsPostAdvance(chapter, path);
}

function agenticV14ChapterUnlockedBySequence(chapterId) {
  if (!agenticV14Mode()) return true;
  const list = typeof curriculum !== "undefined" ? curriculum : [];
  const index = list.findIndex((chapter) => chapter.id === chapterId);
  const target = list[index];
  if (agenticIsExtensionChapter(target)) return agenticExtensionChapterVisible(chapterId, state.agenticPath || {});
  if (index <= 0) return index === 0 || !chapterId;
  for (let i = 0; i < index; i += 1) {
    if (list[i]?.extension || list[i]?.track === "extension") continue;
    if (!agenticChapterReadyToAdvance(list[i], state.agenticPath || {})) return false;
  }
  return true;
}

function agenticCurrentUnitIsAllowed(unitId = "") {
  if (!unitId || !agenticV14Mode()) return true;
  const chapterId = agenticChapterIdForUnitId(unitId) || currentChapterId;
  return agenticV14ChapterUnlockedBySequence(chapterId);
}

function agenticNormalizeCurrentPosition() {
  if (!agenticV14Mode()) return;
  const firstChapter = curriculum?.[0];
  if (!firstChapter) return;
  if (!agenticV14ChapterUnlockedBySequence(currentChapterId)) {
    currentChapterId = firstChapter.id;
    currentUnitId = firstChapter.units?.[0]?.id || "";
    return;
  }
  if (currentUnitId && !agenticCurrentUnitIsAllowed(currentUnitId)) {
    currentUnitId = getChapter(currentChapterId)?.units?.[0]?.id || firstChapter.units?.[0]?.id || "";
  }
}

function agenticDefaults() {
  const firstUnitId = agenticInitialUnitId();
  return {
    enabled: true,
    unlocked: [firstUnitId],
    visibleUnits: [firstUnitId],
    skipped: {},
    decisions: [],
    pendingPlan: null,
    pendingAt: "",
    chapterExtensionsUsed: {},
    unlockedExtensionChapters: [],
    extensionRecommendations: {},
    usedAdaptiveUnits: {},
    insertedAfter: {},
    activeDetour: null,
    activeExtensionChapter: null,
    reviewResume: null,
    reviewQueue: null,
    chapterAdvanceReady: {},
    chapterAdvanceReasons: {},
    lastNarration: "完成当前小节后，我会为你准备合适的下一步。"
  };
}

function agenticPruneLockedV14Path(path) {
  if (!agenticV14Mode() || !path) return;
  const allowedChapters = new Set((curriculum || [])
    .filter((chapter) => agenticV14ChapterUnlockedBySequence(chapter.id))
    .map((chapter) => chapter.id));
  const keepUnit = (unitId) => {
    const chapterId = agenticChapterIdForUnitId(unitId);
    return !chapterId || allowedChapters.has(chapterId);
  };
  path.unlocked = (path.unlocked || []).filter(keepUnit);
  path.visibleUnits = (path.visibleUnits || []).filter(keepUnit);
  Object.keys(path.skipped || {}).forEach((unitId) => {
    if (!keepUnit(unitId)) delete path.skipped[unitId];
  });
  Object.keys(path.chapterAdvanceReady || {}).forEach((key) => {
    const chapterId = getChapter?.(key)?.id || agenticChapterIdForUnitId(key) || key;
    if (chapterId && !allowedChapters.has(chapterId)) delete path.chapterAdvanceReady[key];
  });
}
function ensureAgenticPath() {
  if (!state.agenticPath) state.agenticPath = agenticDefaults();
  const defaults = agenticDefaults();
  Object.keys(defaults).forEach((key) => {
    if (state.agenticPath[key] === undefined) state.agenticPath[key] = defaults[key];
  });
  if (agenticV14Mode()) agenticNormalizeCurrentPosition();
  const firstUnitId = agenticInitialUnitId();
  const safeCurrentUnitId = agenticCurrentUnitIsAllowed(currentUnitId) ? currentUnitId : "";
  state.agenticPath.unlocked = Array.from(new Set([...(state.agenticPath.unlocked || []), firstUnitId, safeCurrentUnitId, ...(state.completed || [])].filter(Boolean)));
  state.agenticPath.visibleUnits = Array.from(new Set([...(state.agenticPath.visibleUnits || []), firstUnitId, safeCurrentUnitId, ...(state.completed || [])].filter(Boolean)));
  state.agenticPath.skipped = state.agenticPath.skipped || {};
  state.agenticPath.decisions = state.agenticPath.decisions || [];
  state.agenticPath.chapterExtensionsUsed = state.agenticPath.chapterExtensionsUsed || {};
  state.agenticPath.unlockedExtensionChapters = state.agenticPath.unlockedExtensionChapters || [];
  state.agenticPath.extensionRecommendations = state.agenticPath.extensionRecommendations || {};
  state.agenticPath.usedAdaptiveUnits = state.agenticPath.usedAdaptiveUnits || {};
  state.agenticPath.insertedAfter = state.agenticPath.insertedAfter || {};
  state.agenticPath.oneStepExtension = state.agenticPath.oneStepExtension || null;
  state.agenticPath.activeDetour = state.agenticPath.activeDetour || null;
  state.agenticPath.activeExtensionChapter = state.agenticPath.activeExtensionChapter || null;
  state.agenticPath.reviewResume = state.agenticPath.reviewResume || null;
  state.agenticPath.reviewQueue = state.agenticPath.reviewQueue || null;
  state.agenticPath.chapterAdvanceReady = state.agenticPath.chapterAdvanceReady || {};
  state.agenticPath.chapterAdvanceReasons = state.agenticPath.chapterAdvanceReasons || {};
  agenticReconcilePathWithEvidence(state.agenticPath);
  return state.agenticPath;
}

function agenticEvidenceUnitIds() {
  const ids = new Set(state.completed || []);
  (state.submittedQuizzes || []).forEach((unitId) => ids.add(unitId));
  (state.quizResults || []).forEach((entry) => {
    const unitId = entry?.unitId || entry?.unit_id || "";
    if (unitId) ids.add(unitId);
  });
  return ids;
}

function agenticReconcilePathWithEvidence(path) {
  const unlocked = new Set(path.unlocked || []);
  const visible = new Set(path.visibleUnits || []);
  const completed = new Set(state.completed || []);
  const submitted = new Set(state.submittedQuizzes || []);
  const quizEvidence = new Set((state.quizResults || []).map((entry) => entry?.unitId || entry?.unit_id || "").filter(Boolean));

  agenticEvidenceUnitIds().forEach((unitId) => {
    if (!unitId) return;
    unlocked.add(unitId);
    visible.add(unitId);
    if (submitted.has(unitId) || quizEvidence.has(unitId)) {
      submitted.add(unitId);
      completed.add(unitId);
    }
    const unit = findMainUnit(unitId);
    if (!unit) return;

    if (unit.type === "quiz") {
      submitted.add(unit.id);
      completed.add(unit.id);
    }

    const chapter = getChapter(unit.chapterId);
    (chapter?.units || [])
      .filter((candidate) => candidate.sceneOrder <= unit.sceneOrder)
      .forEach((candidate) => unlocked.add(candidate.id));
  });

  if (currentUnitId) visible.add(currentUnitId);
  if (path.oneStepExtension?.unitId) visible.add(path.oneStepExtension.unitId);
  if (path.activeDetour?.unitId) visible.add(path.activeDetour.unitId);
  if (path.reviewResume?.unitId) visible.add(path.reviewResume.unitId);
  (path.reviewQueue?.queue || []).forEach((unitId) => visible.add(unitId));
  Object.keys(path.insertedAfter || {}).forEach((unitId) => visible.add(unitId));

  path.unlocked = Array.from(unlocked);
  path.visibleUnits = Array.from(visible).filter((unitId) => findMainUnit(unitId) || agenticParseUnitId(unitId));
  state.completed = Array.from(completed);
  state.submittedQuizzes = Array.from(submitted);
}

function agenticRevealUnit(unitId) {
  if (!unitId) return false;
  const path = ensureAgenticPath();
  path.visibleUnits = path.visibleUnits || [];
  if (path.visibleUnits.includes(unitId)) return false;
  path.visibleUnits.push(unitId);
  return true;
}

function agenticAllMainUnits() {
  return (curriculum || [])
    .filter((chapter) => !agenticV14Mode() || !agenticIsExtensionChapter(chapter) || agenticExtensionChapterVisible(chapter.id))
    .flatMap((chapter) => chapter.units || []);
}

function agenticAllChapterUnits(chapterId) {
  const chapter = getChapter(chapterId);
  return chapter?.allUnits || chapter?.units || [];
}

function agenticStubCoreUnit(chapterId, sceneOrder) {
  const id = `${chapterId}-scene-${sceneOrder}`;
  const existing = findMainUnit(id);
  if (existing) return existing;
  const chapter = chapters.find((item) => item.id === chapterId);
  return {
    id,
    kind: "scene",
    chapterId,
    sceneOrder,
    flowKind: "core",
    label: `${chapter?.label || chapterId} · 第 ${sceneOrder} 节`
  };
}

function agenticCandidateFromUnit(unit, reason = "") {
  return {
    id: unit.id,
    title: unit.label,
    label: unit.label,
    role: unit.flowLabel || unit.assessmentPhase || unit.type,
    modality: unit.type,
    chapterId: unit.chapterId,
    reason
  };
}

function agenticLocalCandidates(chapterId, sceneOrders, reason) {
  const orderSet = new Set(sceneOrders);
  return agenticAllChapterUnits(chapterId)
    .filter((unit) => orderSet.has(unit.sceneOrder))
    .map((unit) => agenticCandidateFromUnit(unit, reason));
}

function agenticResolvePlanUnits(candidates = [], { chapterId = "", flowKind = "", sceneOrders = [] } = {}) {
  const orderSet = sceneOrders.length ? new Set(sceneOrders) : null;
  const seen = new Set();
  return (candidates || [])
    .map((candidate) => {
      const unit = findMainUnit(candidate.id);
      if (!unit) return null;
      if (chapterId && unit.chapterId !== chapterId) return null;
      if (flowKind && unit.flowKind !== flowKind) return null;
      if (orderSet && !orderSet.has(unit.sceneOrder)) return null;
      if (seen.has(unit.id)) return null;
      seen.add(unit.id);
      return {
        ...candidate,
        id: unit.id,
        title: unit.flowKind === "adaptive" ? unit.label : candidate.title || unit.label,
        label: unit.flowKind === "adaptive" ? unit.label : candidate.label || unit.label,
        role: candidate.role || unit.flowLabel || unit.assessmentPhase || unit.type,
        modality: candidate.modality || unit.type,
        chapterId: unit.chapterId
      };
    })
    .filter(Boolean);
}

function agenticMergeCandidates(...groups) {
  const seen = new Set();
  return groups.flat().filter((candidate) => {
    if (!candidate?.id || seen.has(candidate.id)) return false;
    seen.add(candidate.id);
    return true;
  });
}

function agenticPlannerRankedCandidates(plan, { action = "", chapterId = "" } = {}) {
  const choices = Array.isArray(plan?.rankedSceneChoices) ? plan.rankedSceneChoices : [];
  const recommended = plan?.plannerInsight?.recommendedPath || {};
  const preferredAction = action || recommended.action || "";
  return choices
    .filter((candidate) => !chapterId || candidate.chapterId === chapterId)
    .filter((candidate) => {
      if (!preferredAction || preferredAction === "continue") return true;
      if (preferredAction === "extend") return candidate.difficultyBand === "extension" || ["extend", "preview", "transfer"].includes(candidate.scenarioType);
      if (preferredAction === "remediate") return candidate.difficultyBand === "remedial" || ["remediate", "manipulate", "compare", "explain"].includes(candidate.scenarioType);
      return true;
    })
    .map((candidate) => ({
      id: candidate.id,
      title: candidate.label || candidate.title || agenticUnitLabel(candidate.id),
      label: candidate.label || candidate.title || agenticUnitLabel(candidate.id),
      role: candidate.role || candidate.scenarioType || "planner",
      modality: candidate.modality || candidate.representation || "",
      chapterId: candidate.chapterId || chapterId,
      reason: candidate.reason || `planner_${preferredAction || "ranked"}`,
      plannerScore: candidate.score,
      plannerReasons: candidate.reasons || []
    }));
}

function agenticPreferredRelearnOrders(phase = "") {
  if (phase === "formative") return [5, 11, 12];
  if (phase === "post") return [11, 12, 5];
  return AGENTIC_RELEARN_SCENE_ORDERS;
}

function agenticPreferredExtensionOrders(phase = "") {
  if (phase === "post") return [14, 13];
  if (phase === "post_relearn_complete") return [14, 13];
  return [13, 14];
}

function agenticUsedAdaptiveSet(chapterId) {
  return new Set(ensureAgenticPath().usedAdaptiveUnits?.[chapterId] || []);
}

function agenticRankAdaptiveCandidates(candidates = [], preferredOrders = [], chapterId = "") {
  const orderRank = new Map(preferredOrders.map((order, index) => [order, index]));
  const used = agenticUsedAdaptiveSet(chapterId);
  const ranked = [...candidates].sort((a, b) => {
    const aOrder = agenticParseUnitId(a.id)?.order ?? Number.MAX_SAFE_INTEGER;
    const bOrder = agenticParseUnitId(b.id)?.order ?? Number.MAX_SAFE_INTEGER;
    const aRank = orderRank.has(aOrder) ? orderRank.get(aOrder) : Number.MAX_SAFE_INTEGER;
    const bRank = orderRank.has(bOrder) ? orderRank.get(bOrder) : Number.MAX_SAFE_INTEGER;
    return aRank - bRank || aOrder - bOrder;
  });
  const unused = ranked.filter((candidate) => !used.has(candidate.id));
  return unused.length ? unused : ranked;
}

function agenticFirstUnusedCandidate(candidates = [], chapterId = "") {
  const used = agenticUsedAdaptiveSet(chapterId);
  return (candidates || []).find((candidate) => candidate?.id && !used.has(candidate.id)) || null;
}

function agenticUnusedExtensionCandidate(chapterId, phase = "") {
  if (!chapterId) return null;
  const extensionCandidates = agenticLocalCandidates(chapterId, AGENTIC_EXTENSION_SCENE_ORDERS, "same_chapter_extension");
  const ranked = agenticRankAdaptiveCandidates(
    extensionCandidates,
    agenticPreferredExtensionOrders(phase),
    chapterId
  );
  return agenticFirstUnusedCandidate(ranked, chapterId);
}

function agenticRememberAdaptiveUse(unitId, fromUnitId = "", options = {}) {
  if (!unitId) return;
  const path = ensureAgenticPath();
  const unit = findMainUnit(unitId);
  const chapterId = unit?.chapterId || agenticParseUnitId(unitId)?.chapterId || "";
  if (!chapterId) return;
  path.usedAdaptiveUnits[chapterId] = Array.from(new Set([...(path.usedAdaptiveUnits[chapterId] || []), unitId]));
  if (fromUnitId && options.insertAfter !== false) path.insertedAfter[unitId] = fromUnitId;
}

function agenticUnitIndex(unitId) {
  return agenticAllMainUnits().findIndex((unit) => unit.id === unitId);
}

function agenticIsSkipped(unitId) {
  if ((state.completed || []).includes(unitId)) return false;
  return Boolean(ensureAgenticPath().skipped?.[unitId]);
}

function agenticIsPendingReviewUnit(unitId) {
  const path = ensureAgenticPath();
  if (!unitId) return false;
  const activeQueue = agenticActiveReviewQueueIds(path);
  const unskipIds = new Set(path.reviewQueue?.unskipIds || path.reviewResume?.unskipIds || []);
  if (path.reviewResume?.unitId === unitId) return !unskipIds.has(unitId) && path.reviewResume?.type !== "unskip_knowledge";
  if (activeQueue.includes(unitId)) return !unskipIds.has(unitId) && path.reviewQueue?.type !== "unskip_knowledge";
  const pending = path.pendingPlan;
  const action = (pending?.actions || []).find((item) =>
    item.type === "review_knowledge" ||
    item.type === "unskip_knowledge" ||
    item.type === "review_and_unskip_knowledge"
  );
  const choices = action?.knowledgeChoices || action?.units || [];
  return choices.some((choice) => {
    if (choice?.id !== unitId || choice.checked === false) return false;
    const reviewMode = choice.reviewMode || (action?.type === "unskip_knowledge" ? "unskip" : "review");
    return reviewMode !== "unskip";
  });
}

function agenticLessonStatusKind(unitId) {
  const path = ensureAgenticPath();
  const activeQueue = agenticActiveReviewQueueIds(path);
  const unskipIds = new Set(path.reviewQueue?.unskipIds || path.reviewResume?.unskipIds || []);
  if (
    (path.reviewResume?.unitId === unitId && (path.reviewResume?.type === "unskip_knowledge" || unskipIds.has(unitId))) ||
    (activeQueue.includes(unitId) && (path.reviewQueue?.type === "unskip_knowledge" || unskipIds.has(unitId)))
  ) return "learn";
  if (agenticIsPendingReviewUnit(unitId)) return "review";
  if (agenticIsSkipped(unitId)) return "skipped";
  return "";
}

function agenticIsUnitUnlocked(unitId) {
  const unit = findMainUnit(unitId);
  const path = ensureAgenticPath();
  return path.unlocked.includes(unitId) || state.completed.includes(unitId);
}

function agenticIsChapterUnlocked(chapterId) {
  if (agenticV14Mode()) return agenticV14ChapterUnlockedBySequence(chapterId);
  const chapter = getChapter(chapterId);
  const path = ensureAgenticPath();
  if (path.unlocked.some((id) => id.startsWith(`${chapterId}-scene-`))) return true;
  if ((state.completed || []).some((id) => id.startsWith(`${chapterId}-scene-`))) return true;
  if (!chapter?.units?.length) return chapterId === "A1";
  return chapter.units.some((unit) => agenticIsUnitUnlocked(unit.id) || agenticIsSkipped(unit.id));
}

function agenticVisibleChaptersForNav() {
  if (!agenticV14Mode()) return curriculum.map((chapter, index) => ({ chapter, index }));
  return agenticVisibleChapterEntries().map((entry) => ({
    ...entry,
    unlocked: agenticIsChapterUnlocked(entry.chapter.id)
  }));
}
function agenticUnlockUnit(unitId, reason = "agent_recommended") {
  if (!unitId) return false;
  const path = ensureAgenticPath();
  agenticRevealUnit(unitId);
  if (!path.unlocked.includes(unitId)) {
    path.unlocked.push(unitId);
    addLog(`学习路径已解锁：${agenticUnitLabel(unitId)}。`);
    analyticsTrack("agentic_unlock", { data: { unitId, reason } });
    trackLearningEvent("agentic_unlock", { unitId, reason }, false);
    return true;
  }
  return false;
}

function agenticUnitLabel(unitId) {
  const unit = findMainUnit(unitId);
  return unit?.label || unitId;
}

function agenticActionUnitLabel(action, index = 0) {
  const candidate = action?.units?.[index];
  if (!candidate) return "";
  return candidate.label || candidate.title || agenticUnitLabel(candidate.id);
}

function agenticActionTargetIds(action, pending = null) {
  const ids = (action?.units || []).map((unit) => unit?.id).filter(Boolean);
  if (!ids.length && action?.type === "continue" && pending?.resumeUnitId) ids.push(pending.resumeUnitId);
  if (!ids.length && action?.type === "continue" && pending) {
    const anchorUnitId = pending.anchorUnitId || pending.unitId || "";
    const nextId = agenticNextMainUnitAfter(anchorUnitId)?.id || agenticNextUnitIdAfter(anchorUnitId) || "";
    if (nextId) ids.push(nextId);
  }
  return ids;
}

function agenticActionSummary(action, pending = null) {
  const unitIds = agenticActionTargetIds(action, pending);
  return {
    type: action?.type || "",
    label: action?.label || "",
    primary: Boolean(action?.primary),
    unitIds,
    unitLabels: unitIds.map((unitId) => agenticUnitLabel(unitId)),
    scenarioType: action?.scenarioType || (unitIds[0] ? findMainUnit(unitIds[0])?.scenarioType || "" : ""),
    representation: unitIds[0] ? findMainUnit(unitIds[0])?.representation || "" : "",
    reason: action?.reason || action?.units?.[0]?.reason || ""
  };
}

function agenticPendingActionSummaries(pending = null) {
  return (pending?.actions || []).map((action) => agenticActionSummary(action, pending));
}

function agenticPlanCreatedAtMs(pending = null) {
  const stamp = pending?.createdAt || pending?.decisionCreatedAt || "";
  const value = stamp ? Date.parse(stamp) : NaN;
  return Number.isFinite(value) ? value : 0;
}

function agenticDecisionLatencyMs(pending = null) {
  const createdAtMs = agenticPlanCreatedAtMs(pending);
  return createdAtMs ? Math.max(0, Date.now() - createdAtMs) : null;
}

function agenticDecisionMeta(pending, action, targetId) {
  const selectedCandidateIds = agenticActionTargetIds(action, pending);
  const plannerPath = pending?.plan?.plannerInsight?.recommendedPath || pending?.plan?.recommendedPath || {};
  return {
    sourceAgentDecisionId: pending?.agentDecisionId || pending?.decisionId || "",
    recommendationCreatedAt: pending?.createdAt || pending?.decisionCreatedAt || "",
    choiceLatencyMs: agenticDecisionLatencyMs(pending),
    candidateActions: agenticPendingActionSummaries(pending),
    selectedActionLabel: action?.label || "",
    selectedCandidateIds,
    selectedSceneId: action?.type === "scene" ? targetId : "",
    selectedScenarioType: action?.scenarioType || (targetId ? findMainUnit(targetId)?.scenarioType || "" : ""),
    nextUnitId: pending?.nextUnitId || pending?.resumeUnitId || agenticNextMainUnitAfter(pending?.anchorUnitId || pending?.unitId || "")?.id || agenticNextUnitIdAfter(pending?.anchorUnitId || pending?.unitId || "") || "",
    nextClusterId: pending?.nextClusterId || "",
    nextClusterLabel: pending?.nextClusterLabel || "",
    plannerStrategy: pending?.plan?.plannerInsight?.strategy || pending?.plan?.strategy || "",
    plannerAction: plannerPath.action || "",
    plannerTargetId: plannerPath.targetId || "",
    phase: pending?.phase || "",
    provider: pending?.provider || ""
  };
}

function agenticParseUnitId(unitId = "") {
  const match = String(unitId).match(/^(.+)-scene-(\d+)$/);
  if (!match) return null;
  return { chapterId: match[1], order: Number(match[2]) };
}

function agenticChapterIndex(chapterId) {
  return chapters.findIndex((chapter) => chapter.id === chapterId);
}

function agenticSceneCount(chapterId) {
  const chapter = getChapter(chapterId);
  return chapter?.units?.length || chapterStats(chapterId)?.scenes || 15;
}

function agenticNextUnitIdAfter(unitId) {
  return agenticNextMainUnitAfter(unitId, { includeSkipped: true })?.id || "";
}

function agenticPendingAppliesToCurrent(pending = ensureAgenticPath().pendingPlan) {
  return agenticPendingAppliesToUnitId(pending, currentUnitId);
}

function agenticPendingAppliesToUnitId(pending = null, unitId = "") {
  if (!pending) return false;
  if (pending.unitId) return pending.unitId === unitId;
  if (pending.anchorUnitId) return pending.anchorUnitId === unitId;
  const unit = findMainUnit(unitId);
  const chapterId = unit?.chapterId || currentChapterId;
  return !pending.chapterId || pending.chapterId === chapterId;
}

function agenticPendingAppliesToUnit(unitId) {
  const pending = ensureAgenticPath().pendingPlan;
  return agenticPendingAppliesToUnitId(pending, unitId);
}

function agenticChapterIdForUnitId(unitId = "") {
  const unit = findMainUnit(unitId);
  return unit?.chapterId || agenticParseUnitId(unitId)?.chapterId || "";
}

function agenticIsCrossChapterResume(fromUnitId = "", resumeUnitId = "") {
  const fromChapterId = agenticChapterIdForUnitId(fromUnitId);
  const resumeChapterId = agenticChapterIdForUnitId(resumeUnitId);
  return Boolean(fromChapterId && resumeChapterId && fromChapterId !== resumeChapterId);
}

function agenticResumeAfterInsertedAdaptive(unit) {
  if (!unit || unit.flowKind !== "adaptive") return null;
  const path = ensureAgenticPath();
  if (path.pendingPlan?.unitId === unit.id) return null;
  if (path.activeDetour?.unitId === unit.id && path.activeDetour.phase === "post") return null;
  const anchorUnitId =
    path.activeDetour?.unitId === unit.id
      ? path.activeDetour.fromUnitId
      : path.oneStepExtension?.unitId === unit.id
        ? path.oneStepExtension.fromUnitId
        : path.insertedAfter?.[unit.id];
  if (!anchorUnitId) return null;
  const resumeId =
    (path.activeDetour?.unitId === unit.id ? path.activeDetour.resumeUnitId : "") ||
    (path.oneStepExtension?.unitId === unit.id ? path.oneStepExtension.resumeUnitId : "") ||
    agenticNextUnitIdAfter(anchorUnitId) ||
    agenticNextMainUnitAfter(anchorUnitId)?.id ||
    "";
  if (!resumeId || resumeId === unit.id) return null;
  return {
    id: resumeId,
    label: agenticUnitLabel(resumeId),
    chapterId: agenticParseUnitId(resumeId)?.chapterId || ""
  };
}

function agenticNextMainUnitAfter(unitId, { includeSkipped = false } = {}) {
  const units = agenticAllMainUnits();
  const idx = units.findIndex((unit) => unit.id === unitId);
  if (idx >= 0) {
    for (let i = Math.max(0, idx + 1); i < units.length; i += 1) {
      if (includeSkipped || !agenticIsSkipped(units[i].id)) return units[i];
    }
  }

  const parsed = agenticParseUnitId(unitId);
  const chapterIdx = parsed ? agenticChapterIndex(parsed.chapterId) : -1;
  if (!parsed || chapterIdx < 0) return null;

  const candidateIds = [];
  const currentOrderIdx = AGENTIC_CORE_SCENE_ORDERS.indexOf(parsed.order);
  if (currentOrderIdx >= 0) {
    AGENTIC_CORE_SCENE_ORDERS.slice(currentOrderIdx + 1).forEach((order) => {
      candidateIds.push({ chapterId: parsed.chapterId, order });
    });
  } else {
    AGENTIC_CORE_SCENE_ORDERS
      .filter((order) => order > parsed.order)
      .forEach((order) => candidateIds.push({ chapterId: parsed.chapterId, order }));
  }
  chapters.slice(chapterIdx + 1).forEach((chapter) => {
    candidateIds.push({ chapterId: chapter.id, order: AGENTIC_CORE_SCENE_ORDERS[0] });
  });

  for (const candidate of candidateIds) {
    const id = `${candidate.chapterId}-scene-${candidate.order}`;
    if (includeSkipped || !agenticIsSkipped(id)) return agenticStubCoreUnit(candidate.chapterId, candidate.order);
  }
  return null;
}

function agenticNextNonQuizMainUnitAfter(unitId) {
  let cursor = unitId;
  const seen = new Set();
  while (cursor && !seen.has(cursor)) {
    seen.add(cursor);
    const next = agenticNextMainUnitAfter(cursor);
    if (!next) return null;
    const unit = findMainUnit(next.id) || next;
    if (unit.type !== "quiz") return unit;
    cursor = next.id;
  }
  return null;
}

function agenticTrimSkipCandidates(candidates = []) {
  const trimmed = [...candidates];
  while (trimmed.length) {
    const lastSkipped = trimmed[trimmed.length - 1]?.id;
    const next = agenticNextMainUnitAfter(lastSkipped);
    const nextUnit = next ? findMainUnit(next.id) || next : null;
    if (nextUnit && nextUnit.type !== "quiz") break;
    trimmed.pop();
  }
  return trimmed;
}

function agenticNormalizeReviewQueue(path = ensureAgenticPath()) {
  const queueState = path.reviewQueue;
  if (!queueState?.queue?.length) return [];
  const seen = new Set();
  const queue = queueState.queue.filter((unitId) => {
    if (!unitId || seen.has(unitId) || !findMainUnit(unitId)) return false;
    seen.add(unitId);
    return true;
  });
  queueState.queue = queue;
  queueState.currentIndex = Math.min(
    Math.max(Number(queueState.currentIndex) || 0, 0),
    Math.max(queue.length - 1, 0)
  );
  return queue;
}

function agenticActiveReviewQueueIds(path = ensureAgenticPath()) {
  const queue = agenticNormalizeReviewQueue(path);
  if (!queue.length) return [];
  const index = Math.min(
    Math.max(Number(path.reviewQueue?.currentIndex) || 0, 0),
    queue.length - 1
  );
  return queue.slice(index);
}

function agenticReviewQueueTargetAfter(unitId) {
  const path = ensureAgenticPath();
  const queue = agenticActiveReviewQueueIds(path);
  if (!queue.length) return null;
  const idx = queue.indexOf(unitId);
  if (idx < 0) return null;
  const nextId = queue[idx + 1] || "";
  return nextId ? (findMainUnit(nextId) || { id: nextId, label: agenticUnitLabel(nextId), chapterId: agenticChapterIdForUnitId(nextId) }) : null;
}

function agenticNextUnlockedUnitAfter(unitId) {
  if (agenticPendingAppliesToUnit(unitId)) return null;
  const reviewNext = agenticReviewQueueTargetAfter(unitId);
  if (reviewNext?.id) return reviewNext;
  const current = findMainUnit(unitId) || getUnit(unitId);
  const adaptiveResume = agenticResumeAfterInsertedAdaptive(current);
  if (adaptiveResume?.id && (agenticIsUnitUnlocked(adaptiveResume.id) || state.completed.includes(adaptiveResume.id))) {
    return findMainUnit(adaptiveResume.id) || adaptiveResume;
  }
  const units = currentNavigableUnits();
  const idx = units.findIndex((unit) => unit.id === unitId);
  for (let i = Math.max(0, idx + 1); i < units.length; i += 1) {
    if (agenticIsUnitUnlocked(units[i].id) && !agenticIsSkipped(units[i].id)) return units[i];
  }
  return null;
}

function agenticPreviousUnlockedUnitBefore(unitId) {
  const units = currentNavigableUnits();
  const idx = units.findIndex((unit) => unit.id === unitId);
  for (let i = idx - 1; i >= 0; i -= 1) {
    if (agenticIsUnitUnlocked(units[i].id) && !agenticIsSkipped(units[i].id)) return units[i];
  }
  return null;
}

function agenticShouldShowUnit(unit) {
  if (!unit) return false;
  const path = ensureAgenticPath();
  if (unit.id === currentUnitId) return true;
  if ((path.visibleUnits || []).includes(unit.id)) return true;
  if (state.completed.includes(unit.id)) return true;
  if (path.oneStepExtension?.unitId === unit.id || path.activeDetour?.unitId === unit.id || path.reviewResume?.unitId === unit.id) return true;
  if ((path.reviewQueue?.queue || []).includes(unit.id)) return true;
  if (path.pendingPlan?.unitId === unit.id) return true;
  return Boolean(path.insertedAfter?.[unit.id]);
}

function agenticDisplayUnitsForChapter(chapter = getChapter()) {
  const units = agenticV14Mode() ? chapter?.units || [] : chapter?.allUnits || chapter?.units || [];
  if (agenticV14Mode() && agenticIsExtensionChapter(chapter) && !agenticExtensionChapterVisible(chapter.id)) return [];
  if (agenticV14Mode()) return agenticOrderDisplayedUnits(units);
  return agenticOrderDisplayedUnits(units.filter(agenticShouldShowUnit));
}

function agenticOrderDisplayedUnits(units = []) {
  const path = ensureAgenticPath();
  const insertedAfter = path.insertedAfter || {};
  const placed = new Set();
  const inserted = units
    .filter((unit) => insertedAfter[unit.id])
    .sort((a, b) => (agenticParseUnitId(a.id)?.order || 0) - (agenticParseUnitId(b.id)?.order || 0));
  const result = [];
  const appendInsertions = (anchorId) => {
    inserted
      .filter((unit) => !placed.has(unit.id) && insertedAfter[unit.id] === anchorId)
      .forEach((unit) => {
        result.push(unit);
        placed.add(unit.id);
      });
  };

  units.forEach((unit) => {
    if (insertedAfter[unit.id]) return;
    result.push(unit);
    placed.add(unit.id);
    appendInsertions(unit.id);
  });
  inserted.forEach((unit) => {
    if (!placed.has(unit.id)) {
      result.push(unit);
      placed.add(unit.id);
    }
  });
  return result;
}

function agenticUnlockDefaultNext(unitId, reason = "linear_progress") {
  const next = agenticNextMainUnitAfter(unitId);
  if (next) {
    agenticUnlockUnit(next.id, reason);
    return next;
  }
  const nextId = agenticNextUnitIdAfter(unitId);
  if (nextId) {
    agenticUnlockUnit(nextId, reason);
    return { id: nextId, label: agenticUnitLabel(nextId), chapterId: agenticParseUnitId(nextId)?.chapterId || "" };
  }
  return null;
}

function agenticNoSpecialPlanNarration(unit, next) {
  const nextText = next?.label ? `下一步进入：${next.label}。` : "本章已完成。";
  if (unit?.assessmentPhase === "post") {
    return `后测已经完成，整体表现已记录。先${nextText}`;
  }
  if (unit?.assessmentPhase === "formative") {
    return `形成性测验已经记录。本节暂时不用插入额外课件，${nextText}`;
  }
  if (unit?.assessmentPhase === "pre") {
    return `前测已经记录。先按主线继续学习，${nextText}`;
  }
  return next ? `下一步已解锁：${next.label}` : "本章已完成。";
}

function agenticRenderLearningUpdate() {
  renderAll();
  if (typeof renderAgenticCoachPanel === "function") renderAgenticCoachPanel();
}

async function agenticOpenUnit(unitId) {
  if (!unitId) return;
  const parsed = agenticParseUnitId(unitId);
  if (parsed?.chapterId && !getChapter(parsed.chapterId)?.loaded) {
    await ensureChapterLoaded(parsed.chapterId, { showLoading: true });
  }
  const unit = getUnit(unitId);
  const targetChapterId = unit?.chapterId || parsed?.chapterId;
  if (targetChapterId && targetChapterId !== currentChapterId) {
    await selectChapter(targetChapterId);
  }
  selectUnit(unitId);
}

function agenticCanLeaveCurrent() {
  const pending = ensureAgenticPath().pendingPlan;
  return !pending || !agenticPendingAppliesToCurrent(pending);
}

function agenticIsCurrentPending(unitId = currentUnitId) {
  const pending = ensureAgenticPath().pendingPlan;
  return agenticPendingAppliesToUnitId(pending, unitId);
}

function agenticGuardNavigation(targetUnitId, { allowPrevious = false, silent = false } = {}) {
  const target = getUnit(targetUnitId);
  if (!target) return false;
  const current = getUnit(currentUnitId);
  const path = ensureAgenticPath();

  const isReviewTarget =
    agenticIsSkipped(targetUnitId) ||
    (allowPrevious && state.completed.includes(targetUnitId)) ||
    targetUnitId === path.pendingPlan?.unitId;

  const pendingBlocksTarget = path.pendingPlan && (!target.chapterId || target.chapterId === path.pendingPlan.chapterId);
  if (pendingBlocksTarget && targetUnitId !== path.pendingPlan.unitId && !isReviewTarget) {
    if (!silent) {
      const pendingLabel = agenticUnitLabel(path.pendingPlan.unitId || path.pendingPlan.anchorUnitId || "");
      addLog(`请先回到「${pendingLabel || "当前测验"}」处理学习建议，再继续通关。`);
      renderAgenticCoachPanel();
    }
    return false;
  }

  if (agenticIsSkipped(targetUnitId)) return true;
  if (allowPrevious && state.completed.includes(targetUnitId)) return true;
  if (current?.id === targetUnitId && agenticIsUnitUnlocked(targetUnitId)) return true;
  const allowed = agenticIsUnitUnlocked(targetUnitId);
  if (!allowed && !silent) agenticLockedMessage(targetUnitId);
  return allowed;
}

function agenticLockedMessage(unitId) {
  const unit = getUnit(unitId);
  const next = agenticNextUnlockedUnitAfter(currentUnitId) || getUnit(currentUnitId);
  addLog(`「${unit?.label || unitId}」还未解锁。请先完成当前下一步「${next?.label || "当前关卡"}」。`);
  renderAgenticCoachPanel();
}

function focusAgenticCoachPanel() {
  if (typeof renderAgenticCoachPanel === "function") renderAgenticCoachPanel();
  const node = document.querySelector("#agentic-coach-panel");
  if (!node) return;
  node.scrollIntoView({ behavior: "smooth", block: "start" });
  node.classList.remove("coach-focus-pulse");
  void node.offsetWidth;
  node.classList.add("coach-focus-pulse");
  window.setTimeout(() => {
    const firstAction = node.querySelector("[data-agentic-action]");
    if (firstAction) firstAction.focus({ preventScroll: true });
  }, 320);
}

function agenticQuizStats(records) {
  const objective = records.filter(({ result }) => result.isCorrect !== null && result.status !== "pending_review");
  const correct = objective.filter(({ result }) => result.isCorrect === true).length;
  return {
    objective: objective.length,
    correct,
    accuracy: objective.length ? correct / objective.length : null
  };
}

function agenticQuizRecordsForUnit(unitId) {
  const unit = getUnit(unitId);
  if (!unit?.scene?.content?.questions) return [];
  const sourceRecords = typeof quizRecordsForUnit === "function" ? quizRecordsForUnit(unitId) : (state.quizResults || []).filter((row) => row.unitId === unitId);
  const byQuestion = new Map();
  sourceRecords.forEach((row) => {
    if (row?.questionId && !byQuestion.has(row.questionId)) byQuestion.set(row.questionId, row);
  });
  return (unit.scene.content.questions || [])
    .map((question, index) => {
      const result = byQuestion.get(question.id);
      return result ? { index, question, result } : null;
    })
    .filter(Boolean);
}

function agenticQuizHasPendingShortAnswer(records = []) {
  return records.some(({ question, result }) =>
    question?.type === "short_answer" &&
    (result?.status === "pending_review" || result?.isCorrect === null)
  );
}
function agenticKnowledgePointsForChapter(chapterId) {
  const chapter = getChapter(chapterId);
  return (chapter?.modules || []).flatMap((module) => (module.knowledgePoints || []).map((point) => ({
    id: point.id,
    name: point.name || point.id,
    goal: point.goal || "",
    misconception: point.misconception || "",
    moduleId: module.id,
    moduleTitle: module.title || module.id
  })));
}

function agenticQuestionKnowledgePointIds(question = {}, chapterId = "") {
  const explicit = question.knowledgePointIds || question.knowledge_point_ids || question.coachHint?.knowledgePointIds || [];
  if (Array.isArray(explicit) && explicit.length) return explicit;
  const moduleId = question.moduleId || question.module_id || "";
  const points = agenticKnowledgePointsForChapter(chapterId).filter((point) => !moduleId || point.moduleId === moduleId);
  return points.length ? [points[0].id] : [];
}

function agenticQuizKnowledgeMastery(records = [], chapterId = "") {
  const points = agenticKnowledgePointsForChapter(chapterId);
  const byId = new Map(points.map((point) => [point.id, {
    ...point,
    attempts: 0,
    correct: 0,
    wrong: 0,
    earned: 0,
    possible: 0,
    pending: 0,
    questions: []
  }]));

  records.forEach(({ question, result }) => {
    const ids = agenticQuestionKnowledgePointIds(question, chapterId);
    ids.forEach((id) => {
      const item = byId.get(id);
      if (!item) return;
      item.attempts += 1;
      item.questions.push(question.id);
      const maxScore = quizMaxScoreFor(question, result);
      const earned = quizEarnedScore(result, question);
      if (earned !== null && earned !== undefined) {
        if (maxScore) item.possible += maxScore;
        item.earned += earned;
      }
      if (result.isCorrect === true) item.correct += 1;
      else if (result.isCorrect === false) item.wrong += 1;
      else item.pending += 1;
    });
  });

  return Array.from(byId.values()).map((item) => {
    const scoreRate = item.possible ? item.earned / item.possible : null;
    const objectiveRate = item.correct + item.wrong ? item.correct / (item.correct + item.wrong) : null;
    const mastery = scoreRate ?? objectiveRate;
    const hasScoredEvidence = item.possible > 0 || item.correct + item.wrong > 0;
    const status = item.attempts === 0
      ? "unknown"
      : !hasScoredEvidence
        ? "pending"
        : mastery !== null && mastery >= AGENTIC_PRE_SKIP_THRESHOLD && item.wrong === 0
        ? "strong"
        : (mastery !== null && mastery < AGENTIC_POST_REMEDIATION_THRESHOLD) || item.wrong > item.correct
          ? "weak"
          : "partial";
    return {
      ...item,
      mastery: mastery === null ? null : Math.round(mastery * 100) / 100,
      status
    };
  });
}

function agenticKnowledgeUnitsFromMastery(records = [], chapterId = "", statuses = ["weak", "partial"]) {
  const statusSet = new Set(statuses);
  const chapter = getChapter(chapterId);
  const masteryById = new Map(agenticQuizKnowledgeMastery(records, chapterId).map((item) => [item.id, item]));
  return (chapter?.units || [])
    .filter((unit) => unit.type === "knowledge")
    .map((unit) => ({ unit, mastery: masteryById.get(unit.id) }))
    .filter(({ mastery }) => mastery && statusSet.has(mastery.status))
    .sort((a, b) => (a.unit.sceneOrder || 0) - (b.unit.sceneOrder || 0));
}

function agenticKnowledgeCandidatesFromMastery(records = [], chapterId = "", reason = "quiz_weak_knowledge", statuses = ["weak", "partial"]) {
  return agenticKnowledgeUnitsFromMastery(records, chapterId, statuses).map(({ unit, mastery }) => ({
    ...agenticCandidateFromUnit(unit, reason),
    mastery: mastery.mastery,
    status: mastery.status,
    moduleId: mastery.moduleId,
    moduleTitle: mastery.moduleTitle,
    reason
  }));
}

function agenticBuildPreKnowledgeSelectionPlan(unit, records = [], remote = null) {
  const choices = agenticQuizKnowledgeMastery(records, unit.chapterId);
  if (!choices.length) return null;
  const stats = agenticQuizStats(records);
  const highMastery = stats.accuracy !== null && stats.accuracy >= AGENTIC_PRE_SKIP_THRESHOLD;
  const knowledgeChoices = choices.map((choice) => {
    const checked = highMastery ? choice.status !== "strong" : true;
    const reason = choice.status === "strong"
      ? "前测表现较稳，可考虑跳过。"
      : choice.status === "weak"
        ? "前测暴露卡点，建议保留学习。"
        : choice.status === "partial"
          ? "已有部分基础，建议快速巩固。"
          : "前测证据不足，建议先学习。";
    return {
      id: choice.id,
      name: choice.name,
      moduleId: choice.moduleId,
      moduleTitle: choice.moduleTitle,
      goal: choice.goal,
      mastery: choice.mastery,
      status: choice.status,
      checked,
      reason
    };
  });
  return {
    unitId: unit.id,
    anchorUnitId: unit.id,
    chapterId: unit.chapterId,
    phase: "pre_knowledge_selection",
    stats,
    narration: remote?.narration || "前测已完成。请确认本章哪些知识点要继续学习；未勾选的知识点会暂时跳过，并保留回看入口。",
    provider: remote?.provider || "local-pretest-knowledge-selection",
    plan: remote?.plan || null,
    resumeUnitId: agenticNextMainUnitAfter(unit.id)?.id || "",
    actions: [
      {
        type: "select_knowledge",
        label: "按勾选知识点开始学习",
        primary: true,
        knowledgeChoices,
        units: []
      }
    ],
    createdAt: beijingNow()
  };
}

function agenticKnowledgeCandidatesFromQuiz(unit, records = [], reason = "quiz_weak_concept") {
  const weakIds = new Set(agenticQuizKnowledgeMastery(records, unit.chapterId)
    .filter((choice) => choice.status === "weak" || choice.status === "partial")
    .map((choice) => choice.id));
  if (!weakIds.size) return [];
  const chapter = getChapter(unit.chapterId);
  return (chapter?.allUnits || chapter?.units || [])
    .filter((candidate) => candidate.type === "knowledge" && weakIds.has(candidate.id))
    .map((candidate) => ({
      ...agenticCandidateFromUnit(candidate, reason),
      reason
    }));
}

function agenticQuizQuestionsForPlan(records = [], unit = null) {
  return records.map(({ question, result }) => ({
    unitId: result.unitId || unit?.id || "",
    chapterId: unit?.chapterId || "",
    questionId: question.id,
    questionType: question.type,
    questionText: question.prompt || question.question || question.title || question.text || "",
    referenceAnswer: question.referenceAnswer || question.answerText || question.analysis || "",
    rubric: question.commentPrompt || question.rubric || "",
    concepts: question.concepts || question.tags || [],
    points: question.points || result.maxScore || 0,
    response: result.response
  }));
}

function agenticApplyGradingResults(gradingResults = [], unit = null) {
  const results = Array.isArray(gradingResults) ? gradingResults : [];
  if (!results.length || !unit?.id) return false;
  const byQuestion = new Map(results.map((result) => [result.questionId, result]));
  let changed = false;
  state.quizResults = (state.quizResults || []).map((entry) => {
    if (entry.unitId !== unit.id) return entry;
    const grade = byQuestion.get(entry.questionId);
    if (!grade) return entry;
    const maxScore = quizMaxScoreFor({}, entry);
    if (grade.score == null) {
      const fallbackFeedback = grade.feedback || "智能批改暂时失败，已先按 0 分计入，不影响继续学习。";
      changed = true;
      return {
        ...entry,
        aiScore: 0,
        aiConfidence: grade.confidence ?? 0,
        aiFeedback: fallbackFeedback,
        aiErrorType: grade.errorType || "pending_review",
        aiWeakConcepts: Array.isArray(grade.weakConcepts) ? grade.weakConcepts : [],
        aiReasoning: grade.reasoning || "",
        aiNeedsReview: true,
        status: "ai_reviewed",
        isCorrect: false,
        score: 0,
        fallbackScored: true
      };
    }
    const earnedScore = Math.max(0, Math.min(maxScore, Number(grade.score) || 0));
    changed = true;
    return {
      ...entry,
      aiScore: grade.score,
      aiConfidence: grade.confidence,
      aiFeedback: grade.feedback || "",
      aiErrorType: grade.errorType || "",
      aiWeakConcepts: Array.isArray(grade.weakConcepts) ? grade.weakConcepts : [],
      aiReasoning: grade.reasoning || "",
      aiNeedsReview: Boolean(grade.needsReview),
      status: "ai_reviewed",
      isCorrect: grade.isCorrect === false ? false : earnedScore >= maxScore * 0.6,
      score: earnedScore
    };
  });
  if (changed) saveState();
  return changed;
}

function interactionEvidenceForUnit(unitId) {
  if (!unitId) return null;
  const bucket = state.analytics?.interactionEvidence?.[unitId] || {};
  const quizRows = (state.quizResults || []).filter((row) => (row.unitId || row.unit_id) === unitId);
  const questionCount = new Set(quizRows.map((row) => row.questionId || row.question_id).filter(Boolean)).size;
  const pendingReview = quizRows.filter((row) => row.status === "pending_review" || row.isCorrect === null).length;
  const scoredRows = quizRows.filter((row) => row.isCorrect === true || row.isCorrect === false);
  const correctRows = scoredRows.filter((row) => row.isCorrect === true);
  const accuracy = scoredRows.length ? correctRows.length / scoredRows.length : null;
  const repeatCount = Math.max(bucket.repeatCount || 0, state.analytics?.visitedUnits?.[unitId] || 0);
  const dwellMs = bucket.dwellMs || 0;
  const answerRevealCount = bucket.answerRevealCount || 0;
  const shortAnswerLength = bucket.shortAnswerLength || 0;
  const choiceChangeCount = bucket.choiceChangeCount || 0;
  const narrationTouches = (bucket.narrationPlayCount || 0) + (bucket.narrationPauseCount || 0) + (bucket.narrationSeekCount || 0);
  const frictionScore = Math.min(1, (
    Math.min(1, answerRevealCount / 2) * 0.25 +
    Math.min(1, repeatCount / 3) * 0.2 +
    Math.min(1, choiceChangeCount / 6) * 0.2 +
    Math.min(1, narrationTouches / 5) * 0.15 +
    Math.min(1, dwellMs / 480000) * 0.2
  ));
  const engagementScore = Math.min(1, (
    Math.min(1, (bucket.events || 0) / 30) * 0.25 +
    Math.min(1, dwellMs / 360000) * 0.3 +
    Math.min(1, (bucket.resourceFullscreenCount || 0) / 2) * 0.15 +
    Math.min(1, narrationTouches / 4) * 0.15 +
    Math.min(1, (bucket.uiWheelCount || 0) / 8) * 0.15
  ));
  const riskLevel = accuracy !== null && accuracy < 0.6 || frictionScore >= 0.65 ? "high" : frictionScore >= 0.35 ? "medium" : "low";
  const suggestedMove = riskLevel === "high"
    ? "alternate_scene"
    : accuracy !== null && accuracy >= 0.8 && frictionScore < 0.35
      ? "extend"
      : engagementScore < 0.25
        ? "make_interactive"
        : "continue";
  return {
    unitId,
    chapterId: bucket.chapterId || agenticChapterIdForUnitId(unitId),
    events: bucket.events || 0,
    dwellMs,
    repeatCount,
    answerRevealCount,
    questionVisibleCount: bucket.questionVisibleCount || 0,
    choiceChangeCount,
    shortAnswerLength,
    resourceFullscreenCount: bucket.resourceFullscreenCount || 0,
    narrationPlayCount: bucket.narrationPlayCount || 0,
    narrationPauseCount: bucket.narrationPauseCount || 0,
    narrationSeekCount: bucket.narrationSeekCount || 0,
    uiWheelCount: bucket.uiWheelCount || 0,
    uiInputCount: bucket.uiInputCount || 0,
    parameterChangeCount: bucket.parameterChangeCount || 0,
    questionCount,
    pendingReview,
    accuracy,
    frictionScore: Math.round(frictionScore * 1000) / 1000,
    engagementScore: Math.round(engagementScore * 1000) / 1000,
    riskLevel,
    suggestedMove
  };
}

function interactionEvidenceForChapter(chapterId) {
  const ids = new Set();
  Object.keys(state.analytics?.interactionEvidence || {}).forEach((unitId) => {
    if (!chapterId || agenticChapterIdForUnitId(unitId) === chapterId || unitId.startsWith(`${chapterId}-scene-`)) ids.add(unitId);
  });
  (state.quizResults || []).forEach((row) => {
    const unitId = row.unitId || row.unit_id || "";
    if (unitId && (!chapterId || unitId.startsWith(`${chapterId}-scene-`))) ids.add(unitId);
  });
  return Array.from(ids).map(interactionEvidenceForUnit).filter(Boolean);
}

function agenticScenePreferenceScore(scene, anchorEvidence) {
  if (!scene) return 0;
  const role = learningSceneRole(scene);
  const isInteractive = scene.type === "interactive";
  const isSlide = scene.type === "slide";
  const isAdaptive = scene.flowKind === "adaptive";
  let score = 0;
  if (anchorEvidence?.suggestedMove === "alternate_scene") {
    if (isInteractive) score += 4;
    if (isAdaptive) score += 3;
    if (/重学|自适应|互动/.test(role)) score += 2;
  } else if (anchorEvidence?.suggestedMove === "make_interactive") {
    if (isInteractive) score += 4;
    if (isSlide) score -= 1;
  } else if (anchorEvidence?.suggestedMove === "extend") {
    if (isAdaptive) score += 3;
    if (/拓展|预告/.test(role)) score += 3;
  } else {
    if (!isAdaptive) score += 1;
  }
  if (state.completed.includes(scene.id)) score -= 1;
  if (typeof agenticIsUnitUnlocked === "function" && agenticIsUnitUnlocked(scene.id)) score += 0.5;
  return score;
}

function rankSiblingLearningScenes(unit, scenes = siblingLearningScenes(unit)) {
  const evidence = interactionEvidenceForUnit(unit?.id || "");
  return [...(scenes || [])].sort((a, b) => {
    const scoreDiff = agenticScenePreferenceScore(b, evidence) - agenticScenePreferenceScore(a, evidence);
    return scoreDiff || (a.sceneOrder || 0) - (b.sceneOrder || 0);
  });
}

async function agenticRequestPlan(unit, records = []) {
  if (!isSignedIn()) return null;
  try {
    const payload = await apiRequest("/api/learning/kg/plan", {
      chapterId: unit.chapterId,
      currentUnitId: unit.id,
      quizResults: state.quizResults || [],
      quizQuestions: agenticQuizQuestionsForPlan(records, unit),
      completedUnitIds: state.completed || [],
      interactionEvidence: {
        current: interactionEvidenceForUnit(unit.id),
        chapter: interactionEvidenceForChapter(unit.chapterId).slice(-30)
      }
    });
    return payload;
  } catch (error) {
    console.warn("Agentic KG plan failed:", error);
    return null;
  }
}

function agenticApplyRemotePlanWhenReady(unit, records = []) {
  agenticRequestPlan(unit, records)
    .then((remote) => agenticApplyRemoteGrading(remote, unit))
    .catch((error) => console.warn("Agentic remote grading refresh failed:", error));
}

async function agenticRequestPlanForLocalDecision(unit, records = []) {
  const remotePromise = agenticRequestPlan(unit, records);
  let applied = false;
  remotePromise
    .then((remote) => {
      if (!remote || applied) return;
      applied = true;
      agenticApplyRemoteGrading(remote, unit);
    })
    .catch((error) => console.warn("Agentic delayed plan failed:", error));
  const remote = await Promise.race([
    remotePromise,
    new Promise((resolve) => window.setTimeout(() => resolve(null), AGENTIC_REMOTE_PLAN_TIMEOUT_MS))
  ]);
  if (remote && !applied) {
    applied = true;
    agenticApplyRemoteGrading(remote, unit);
  }
  return remote;
}

function agenticApplyRemoteGrading(remote, unit) {
  const changed = agenticApplyGradingResults(remote?.gradingResults, unit);
  if (changed && unit?.id === currentUnitId && typeof renderQuiz === "function") {
    renderQuiz(unit);
  }
}

function agenticScorePendingShortAnswersAsZero(unit, reason = "智能批改暂时失败，已先按 0 分计入，不影响继续学习。") {
  if (!unit?.id) return false;
  let changed = false;
  state.quizResults = (state.quizResults || []).map((entry) => {
    if (entry.unitId !== unit.id || entry.questionType !== "short_answer") return entry;
    if (entry.status !== "pending_review" && entry.isCorrect !== null) return entry;
    changed = true;
    return {
      ...entry,
      aiScore: 0,
      aiConfidence: 0,
      aiFeedback: reason,
      aiErrorType: entry.aiErrorType || "api_error",
      aiWeakConcepts: Array.isArray(entry.aiWeakConcepts) ? entry.aiWeakConcepts : [],
      aiReasoning: entry.aiReasoning || "",
      aiNeedsReview: true,
      status: "ai_reviewed",
      isCorrect: false,
      score: 0,
      fallbackScored: true
    };
  });
  if (changed) saveState();
  return changed;
}

function agenticBuildPendingGradingPlan(unit, records = [], options = {}) {
  const shortCount = records.filter(({ question }) => question?.type === "short_answer").length;
  return {
    unitId: unit.id,
    anchorUnitId: unit.id,
    chapterId: unit.chapterId,
    phase: "grading_pending",
    stats: agenticQuizStats(records),
    narration: options.message || `还有 ${shortCount || "若干"} 道简答题正在批改。批改完成后，我会把简答题得分一起纳入掌握度，再给出回看、补学或继续主线的建议。`,
    provider: options.provider || "grading-pending",
    plan: null,
    resumeUnitId: agenticNextMainUnitAfter(unit.id)?.id || "",
    actions: [],
    createdAt: beijingNow()
  };
}

function agenticSetPendingGrading(unit, records = [], options = {}) {
  const path = ensureAgenticPath();
  path.pendingPlan = agenticBuildPendingGradingPlan(unit, records, options);
  path.pendingAt = unit.id;
  path.lastNarration = path.pendingPlan.narration;
  saveState();
  agenticRenderLearningUpdate();
}

async function agenticBuildRecommendationAfterGrading(unit, records, remote = null) {
  ensureAgenticPath();
  const stats = agenticQuizStats(records);
  const phase = unit.assessmentPhase;

  if (phase === "pre") {
    const knowledgePlan = agenticBuildPreKnowledgeSelectionPlan(unit, records, null);
    if (knowledgePlan) {
      const path = ensureAgenticPath();
      path.pendingPlan = knowledgePlan;
      path.pendingAt = unit.id;
      path.lastNarration = agenticStudentNarrationForPending(knowledgePlan);
      saveState();
      agenticRenderLearningUpdate();
      return;
    }
  }

  const plan = remote?.plan || null;
  const narration = remote?.narration || "学习建议已根据你的答题情况更新下一步。";
  const plannerAction = plan?.plannerInsight?.recommendedPath?.action || plan?.recommendedPath?.action || "";
  const actions = [];
  const localSkipOrders = AGENTIC_CORE_SCENE_ORDERS.filter((order) => order > unit.sceneOrder && order < 8);
  const skipCandidates = agenticMergeCandidates(
    agenticResolvePlanUnits(plan?.skipCandidates, {
      chapterId: unit.chapterId,
      flowKind: "core"
    }),
    agenticLocalCandidates(unit.chapterId, localSkipOrders, "pre_test_mastery")
  );
  const relearnCandidates = agenticMergeCandidates(
    agenticKnowledgeCandidatesFromQuiz(unit, records, "quiz_weak_knowledge"),
    agenticResolvePlanUnits(agenticPlannerRankedCandidates(plan, { action: "remediate", chapterId: unit.chapterId }), {
      chapterId: unit.chapterId
    }),
    agenticResolvePlanUnits(plan?.remediationCandidates, {
      chapterId: unit.chapterId,
      flowKind: "adaptive",
      sceneOrders: AGENTIC_RELEARN_SCENE_ORDERS
    }),
    agenticLocalCandidates(unit.chapterId, AGENTIC_RELEARN_SCENE_ORDERS, "post_test_relearn")
  );
  const extensionCandidates = AGENTIC_ENABLE_EXTENSION ? agenticMergeCandidates(
    agenticResolvePlanUnits(agenticPlannerRankedCandidates(plan, { action: "extend", chapterId: unit.chapterId }), {
      chapterId: unit.chapterId
    }),
    agenticLocalCandidates(unit.chapterId, AGENTIC_EXTENSION_SCENE_ORDERS, "same_chapter_extension"),
    agenticResolvePlanUnits(plan?.extensionCandidates, {
      chapterId: unit.chapterId,
      flowKind: "adaptive",
      sceneOrders: AGENTIC_EXTENSION_SCENE_ORDERS
    })
  ) : [];
  const rankedRelearnCandidates = agenticRankAdaptiveCandidates(
    relearnCandidates,
    agenticPreferredRelearnOrders(phase),
    unit.chapterId
  );
  const rankedExtensionCandidates = agenticRankAdaptiveCandidates(
    extensionCandidates,
    agenticPreferredExtensionOrders(phase),
    unit.chapterId
  );
  const weakKnowledgeCandidates = agenticKnowledgeCandidatesFromMastery(records, unit.chapterId, "quiz_weak_knowledge");
  const extensionChapters = phase === "post" ? agenticRecommendedExtensionChaptersForPost(unit, records) : [];

  if (phase === "pre" && stats.accuracy !== null && stats.accuracy >= AGENTIC_PRE_SKIP_THRESHOLD && skipCandidates.length) {
    const safeSkipCandidates = agenticTrimSkipCandidates(skipCandidates).slice(0, 6);
    if (safeSkipCandidates.length) {
      actions.push({ type: "skip", label: "跳过已掌握，先做一个热身", primary: true, units: safeSkipCandidates });
    }
    actions.push({ type: "continue", label: "仍按顺序巩固", units: [] });
  }

  if (phase === "post") {
    if ((stats.accuracy !== null && stats.accuracy < AGENTIC_POST_REMEDIATION_THRESHOLD || weakKnowledgeCandidates.length) && weakKnowledgeCandidates.length) {
      actions.push({ type: "review_knowledge", label: "选择回看知识点", primary: true, units: weakKnowledgeCandidates });
    } else if (stats.accuracy !== null && stats.accuracy < AGENTIC_POST_REMEDIATION_THRESHOLD && rankedRelearnCandidates.length) {
      actions.push({ type: "remediate", label: "换一种互动方式重学", primary: true, units: rankedRelearnCandidates.slice(0, 1) });
    }
    const extension = agenticFirstUnusedCandidate(rankedExtensionCandidates, unit.chapterId);
    if (extension) actions.push({ type: "extension", label: "解锁一步拓展", primary: actions.length === 0, units: [extension] });
    if (extensionChapters.length) {
      const candidate = agenticExtensionChapterCandidate(extensionChapters[0]);
      if (candidate?.id) {
        const labels = extensionChapters
          .map((chapter) => (typeof chapterDisplayCopy === "function" ? chapterDisplayCopy(chapter).label : chapter.label))
          .filter(Boolean)
          .join(" / ");
        actions.push({
          type: "extension_chapter",
          label: `解锁扩展：${labels || candidate.label}`,
          primary: actions.length === 0,
          units: [candidate],
          extensionChapterId: extensionChapters[0].id,
          extensionChapterIds: extensionChapters.map((chapter) => chapter.id)
        });
      }
    }
    actions.push({ type: "continue", label: "进入下一章", primary: actions.length === 0, units: [] });
  }

  if (phase === "formative") {
    const skippedWeak = weakKnowledgeCandidates.filter((candidate) => agenticIsSkipped(candidate.id));
    const priorWeak = weakKnowledgeCandidates.filter((candidate) => {
      if (agenticIsSkipped(candidate.id)) return false;
      const target = findMainUnit(candidate.id);
      return !target?.sceneOrder || !unit.sceneOrder || target.sceneOrder <= unit.sceneOrder;
    });
    if (priorWeak.length && skippedWeak.length) {
      actions.push({
        type: "review_and_unskip_knowledge",
        label: "选择回看和补学",
        primary: true,
        units: [
          ...priorWeak.map((candidate) => ({ ...candidate, reviewMode: "review" })),
          ...skippedWeak.map((candidate) => ({ ...candidate, reviewMode: "unskip" }))
        ]
      });
    } else if (priorWeak.length) {
      actions.push({ type: "review_knowledge", label: "选择回看知识点", primary: true, units: priorWeak });
    }
    if (!priorWeak.length && skippedWeak.length) {
      actions.push({
        type: "unskip_knowledge",
        label: "选择是否补学已跳过内容",
        primary: actions.length === 0,
        units: skippedWeak.map((candidate) => ({ ...candidate, reviewMode: "unskip" }))
      });
    }
    if (!actions.length && stats.accuracy !== null && stats.accuracy < AGENTIC_POST_REMEDIATION_THRESHOLD && rankedRelearnCandidates.length) {
      actions.push({ type: "remediate", label: "换一种互动方式重学", primary: true, units: rankedRelearnCandidates.slice(0, 1) });
    }
    if (actions.length) {
      actions.push({ type: "continue", label: "继续主线", units: [] });
    } else if (stats.accuracy !== null && stats.accuracy >= AGENTIC_PRE_SKIP_THRESHOLD) {
      const extension = agenticFirstUnusedCandidate(rankedExtensionCandidates, unit.chapterId);
      if (extension) {
        actions.push({ type: "extension", label: "解锁一步拓展", primary: true, units: [extension] });
        actions.push({ type: "continue", label: "继续主线", units: [] });
      }
    }
  }

  if (!actions.length) {
    if (phase === "post") agenticMarkChapterReadyToAdvance(unit.chapterId, "post_no_special_plan");
    const next = agenticUnlockDefaultNext(unit.id, "quiz_no_special_plan");
    ensureAgenticPath().lastNarration = agenticNoSpecialPlanNarration(unit, next);
    if (next) ensureAgenticPath().oneStepExtension = null;
    saveState();
    agenticRenderLearningUpdate();
    return;
  }

  const path = ensureAgenticPath();
  const activeExtensionResume = path.activeExtensionChapter?.chapterId === unit.chapterId
    ? path.activeExtensionChapter.resumeUnitId || ""
    : "";
  path.pendingPlan = {
    unitId: unit.id,
    chapterId: unit.chapterId,
    phase,
    stats,
    narration,
    provider: remote?.provider || "mock",
    anchorUnitId: unit.id,
    resumeUnitId: activeExtensionResume || agenticNextMainUnitAfter(unit.id)?.id || "",
    agentDecisionId: remote?.decisionId || "",
    decisionCreatedAt: remote?.decisionCreatedAt || "",
    plan,
    actions,
    createdAt: beijingNow()
  };
  path.pendingAt = unit.id;
  path.lastNarration = agenticStudentNarrationForPending(path.pendingPlan);
  saveState();
  agenticRenderLearningUpdate();
}

async function agenticAfterQuizSubmit(unit, records) {
  ensureAgenticPath();
  if (agenticQuizHasPendingShortAnswer(records)) {
    agenticSetPendingGrading(unit, records);
    const remote = await agenticRequestPlan(unit, records);
    agenticApplyRemoteGrading(remote, unit);
    const scoredRecords = agenticQuizRecordsForUnit(unit.id);
    if (agenticQuizHasPendingShortAnswer(scoredRecords)) {
      agenticScorePendingShortAnswersAsZero(unit);
      const fallbackRecords = agenticQuizRecordsForUnit(unit.id);
      if (unit?.id === currentUnitId && typeof renderQuiz === "function") renderQuiz(unit);
      await agenticBuildRecommendationAfterGrading(unit, fallbackRecords.length ? fallbackRecords : records, remote);
      return;
    }
    await agenticBuildRecommendationAfterGrading(unit, scoredRecords, remote);
    return;
  }

  const remote = await agenticRequestPlanForLocalDecision(unit, records);
  const scoredRecords = agenticQuizRecordsForUnit(unit.id);
  await agenticBuildRecommendationAfterGrading(unit, scoredRecords.length ? scoredRecords : records, remote);
}

function agenticBuildPostRelearnExtensionPlan(detour, completedUnit) {
  if (!AGENTIC_ENABLE_EXTENSION) return null;
  const path = ensureAgenticPath();
  const sourceUnit = findMainUnit(detour?.fromUnitId);
  const chapterId = detour?.chapterId || sourceUnit?.chapterId || completedUnit?.chapterId || "";
  const extension = agenticUnusedExtensionCandidate(chapterId, "post_relearn_complete");
  const resumeUnitId = detour?.resumeUnitId || agenticNextUnitIdAfter(detour?.fromUnitId || completedUnit?.id);
  if (!chapterId || !extension) return null;
  return {
    unitId: completedUnit.id,
    anchorUnitId: detour?.fromUnitId || completedUnit.id,
    chapterId,
    phase: "post_relearn_complete",
    stats: detour?.stats || null,
    narration: "",
    provider: "local",
    plan: null,
    resumeUnitId,
    actions: [
      { type: "extension", label: "解锁一步拓展", primary: true, units: [extension] },
      { type: "continue", label: resumeUnitId ? "进入下一章" : "继续主线", units: [] }
    ],
    createdAt: beijingNow()
  };
}

function agenticBuildSceneChoicePlan(unit, remote = null) {
  if (!unit) return null;
  const next = agenticNextMainUnitAfter(unit.id);
  if (!next?.id) return null;
  const nextUnit = findMainUnit(next.id) || next;
  if (!nextUnit || nextUnit.type === "quiz") return null;
  const evidence = interactionEvidenceForUnit(unit.id);
  const remotePlan = remote?.plan || remote;
  const plannerAction = remotePlan?.plannerInsight?.recommendedPath?.action || remotePlan?.recommendedPath?.action || "";
  const nextCluster = typeof learningClusterForUnit === "function" ? learningClusterForUnit(nextUnit) : null;
  const nextClusterOrders = new Set(nextCluster?.orders || [nextUnit.sceneOrder]);
  const plannerChoices = agenticResolvePlanUnits(agenticPlannerRankedCandidates(remotePlan, { chapterId: unit.chapterId }), {
    chapterId: unit.chapterId
  }).filter((candidate) => candidate.id !== unit.id && candidate.id !== nextUnit.id)
    .filter((candidate) => nextClusterOrders.has((findMainUnit(candidate.id) || {}).sceneOrder))
    .filter((scene) => (findMainUnit(scene.id) || scene).type !== "quiz")
    .slice(0, 2)
    .map((scene) => {
      const resolved = findMainUnit(scene.id) || scene;
      return {
        ...agenticCandidateFromUnit(resolved, scene.reason || `next_scene_${evidence?.suggestedMove || "continue"}`),
        plannerScore: scene.plannerScore,
        plannerReasons: scene.plannerReasons || []
      };
    });
  const localAlternatives = rankSiblingLearningScenes(nextUnit)
    .filter((scene) => scene.id !== nextUnit.id && scene.id !== unit.id)
    .filter((scene) => nextClusterOrders.has(scene.sceneOrder))
    .filter((scene) => scene.type !== "quiz")
    .filter((scene) => !state.completed.includes(scene.id) && !agenticIsSkipped(scene.id))
    .slice(0, 2)
    .map((scene) => agenticCandidateFromUnit(scene, `next_scene_${evidence?.suggestedMove || "continue"}`));
  const alternatives = agenticMergeCandidates(plannerChoices, localAlternatives)
    .filter((candidate) => candidate.id !== nextUnit.id)
    .slice(0, 1);
  const actions = [];
  const alternate = alternatives[0];
  const alternateUnit = alternate ? findMainUnit(alternate.id) : null;
  const explicitPlannerMove = Boolean(plannerAction && plannerAction !== "continue");
  const explicitEvidenceMove = Boolean(evidence?.suggestedMove && evidence.suggestedMove !== "continue");
  const shouldPreferAlternate = Boolean(alternate && (explicitPlannerMove || explicitEvidenceMove));
  if (alternate) {
    actions.push({
      type: "scene",
      label: `${shouldPreferAlternate ? "推荐场景" : "可选场景"}：${alternate.label || agenticUnitLabel(alternate.id)}`,
      primary: shouldPreferAlternate,
      units: [alternate],
      scenarioType: alternateUnit?.scenarioType || ""
    });
  }
  actions.push({ type: "continue", label: `默认场景：${agenticUnitLabel(next.id)}`, primary: !shouldPreferAlternate, units: [] });
  if (actions.length <= 1) return null;
  return {
    unitId: unit.id,
    anchorUnitId: unit.id,
    chapterId: unit.chapterId,
    phase: "interaction_scene_choice",
    stats: null,
    evidence,
    narration: remote?.narration || "",
    provider: remote?.provider || (plannerChoices.length ? "planner-interaction-evidence" : "local-interaction-evidence"),
    agentDecisionId: remote?.decisionId || "",
    decisionCreatedAt: remote?.decisionCreatedAt || "",
    plan: remotePlan || null,
    resumeUnitId: next.id,
    nextUnitId: next.id,
    nextClusterId: nextCluster?.id || "",
    nextClusterLabel: nextCluster?.label || "下一小节",
    actions,
    createdAt: beijingNow()
  };
}

async function agenticRefreshPendingSceneChoicePlan(unit) {
  if (!unit || unit.type === "quiz" || !isSignedIn()) return;
  const path = ensureAgenticPath();
  if (path.pendingPlan?.unitId !== unit.id || path.pendingPlan?.phase !== "interaction_scene_choice") return;
  const remote = await agenticRequestPlan(unit, []);
  const refreshed = agenticBuildSceneChoicePlan(unit, remote);
  if (!refreshed) return;
  const currentPath = ensureAgenticPath();
  if (currentPath.pendingPlan?.unitId !== unit.id || currentPath.pendingPlan?.phase !== "interaction_scene_choice") return;
  currentPath.pendingPlan = {
    ...refreshed,
    createdAt: currentPath.pendingPlan.createdAt || refreshed.createdAt
  };
  currentPath.pendingAt = unit.id;
  currentPath.lastNarration = agenticStudentNarrationForPending(currentPath.pendingPlan);
  saveState();
  if (unit.id === currentUnitId) agenticRenderLearningUpdate();
}

function agenticOnUnitCompleted(unit) {
  if (!unit) return;
  const path = ensureAgenticPath();
  if (path.pendingPlan?.unitId === unit.id) return;
  if (unit.type === "quiz" && (unit.assessmentPhase === "pre" || unit.assessmentPhase === "post")) return;
  const reviewQueue = agenticNormalizeReviewQueue(path);
  const reviewIndex = reviewQueue.indexOf(unit.id);
  if (reviewIndex >= 0) {
    const nextReviewId = reviewQueue[reviewIndex + 1] || "";
    if (nextReviewId) {
      path.reviewQueue.currentIndex = reviewIndex + 1;
      path.reviewResume = {
        ...(path.reviewResume || {}),
        type: path.reviewQueue?.type || path.reviewResume?.type || "review_knowledge",
        unitId: nextReviewId,
        fromUnitId: path.reviewQueue?.fromUnitId || path.reviewResume?.fromUnitId || unit.id,
        chapterId: path.reviewQueue?.chapterId || path.reviewResume?.chapterId || unit.chapterId,
        phase: path.reviewQueue?.phase || path.reviewResume?.phase || "",
        resumeUnitId: path.reviewQueue?.resumeUnitId || path.reviewResume?.resumeUnitId || ""
      };
      agenticUnlockUnit(nextReviewId, path.reviewQueue?.type === "unskip_knowledge" ? "continue_unskip_review_queue" : "continue_review_queue");
      path.lastNarration = `继续处理你勾选的下一个知识点：${agenticUnitLabel(nextReviewId)}。`;
      return { id: nextReviewId, label: agenticUnitLabel(nextReviewId) };
    }
    const resumeId =
      path.reviewQueue?.resumeUnitId ||
      path.reviewResume?.resumeUnitId ||
      agenticNextMainUnitAfter(path.reviewQueue?.fromUnitId || path.reviewResume?.fromUnitId || unit.id)?.id ||
      "";
    const queuePhase = path.reviewQueue?.phase || path.reviewResume?.phase || "";
    const queueChapterId = path.reviewQueue?.chapterId || path.reviewResume?.chapterId || unit.chapterId;
    path.reviewQueue = null;
    path.reviewResume = null;
    if (queuePhase === "post") agenticMarkChapterReadyOnPath(path, queueChapterId, "post_review_queue_completed");
    if (resumeId) agenticUnlockUnit(resumeId, "return_from_review_queue");
    path.lastNarration = resumeId
      ? `你勾选的回看知识点已完成，回到主线：${agenticUnitLabel(resumeId)}。`
      : "你勾选的回看知识点已完成。";
    return resumeId ? { id: resumeId, label: agenticUnitLabel(resumeId) } : null;
  }
  if (path.oneStepExtension?.unitId === unit.id) {
    const resumeId = path.oneStepExtension.resumeUnitId || agenticNextUnitIdAfter(path.oneStepExtension.fromUnitId);
    const fromUnitId = path.oneStepExtension.fromUnitId || unit.id;
    const isCrossChapter = agenticIsCrossChapterResume(fromUnitId, resumeId);
    const extensionChapterId = path.oneStepExtension.chapterId || agenticChapterIdForUnitId(fromUnitId) || unit.chapterId;
    if (path.oneStepExtension.phase === "post") agenticMarkChapterReadyOnPath(path, extensionChapterId, "post_extension_completed");
    path.oneStepExtension = null;
    agenticUnlockUnit(resumeId, isCrossChapter ? "advance_from_one_step_extension" : "return_from_one_step_extension");
    path.lastNarration = isCrossChapter
      ? `跨章预告已完成，进入下一章：${agenticUnitLabel(resumeId)}。`
      : `拓展一步已完成，回到主线：${agenticUnitLabel(resumeId)}。`;
    return { id: resumeId, label: agenticUnitLabel(resumeId) };
  }
  if (path.reviewResume?.unitId === unit.id) {
    const reviewResume = path.reviewResume;
    const resumeId = reviewResume.resumeUnitId || agenticNextMainUnitAfter(reviewResume.fromUnitId || unit.id)?.id || "";
    path.reviewResume = null;
    if (reviewResume.phase === "post") agenticMarkChapterReadyOnPath(path, reviewResume.chapterId || unit.chapterId, "post_review_completed");
    if (resumeId) agenticUnlockUnit(resumeId, "return_from_quiz_review");
    path.lastNarration = resumeId
      ? `回看知识点已完成，回到主线：${agenticUnitLabel(resumeId)}。`
      : "回看知识点已完成。";
    return resumeId ? { id: resumeId, label: agenticUnitLabel(resumeId) } : null;
  }
  if (path.activeDetour?.unitId === unit.id) {
    const detour = path.activeDetour;
    const resumeId = path.activeDetour.resumeUnitId || path.activeDetour.fromUnitId || "";
    const label = agenticUnitLabel(resumeId);
    path.activeDetour = null;
    if (detour.phase === "post") {
      const followUp = agenticBuildPostRelearnExtensionPlan(detour, unit);
      if (followUp) {
        path.pendingPlan = followUp;
        path.pendingAt = unit.id;
        path.lastNarration = agenticStudentNarrationForPending(followUp);
        return null;
      }
      agenticMarkChapterReadyOnPath(path, detour.chapterId || unit.chapterId, "post_relearn_completed");
    }
    if (resumeId) agenticUnlockUnit(resumeId, "return_from_relearn_detour");
    path.lastNarration = resumeId ? `重学支线已完成，回到主线：${label}。` : "重学支线已完成。";
    return resumeId ? { id: resumeId, label } : null;
  }
  const adaptiveResume = agenticResumeAfterInsertedAdaptive(unit);
  if (adaptiveResume?.id) {
    agenticUnlockUnit(adaptiveResume.id, "return_from_adaptive_review");
    path.lastNarration = `这节互动课件已经复习完成，回到主线：${adaptiveResume.label}。`;
    return adaptiveResume;
  }
  const sceneChoicePlan = agenticBuildSceneChoicePlan(unit);
  if (!agenticV14Mode() && sceneChoicePlan) {
    path.pendingPlan = sceneChoicePlan;
    path.pendingAt = unit.id;
    path.lastNarration = agenticStudentNarrationForPending(sceneChoicePlan);
    agenticRefreshPendingSceneChoicePlan(unit).catch((error) => console.warn("Planner refresh failed:", error));
    return null;
  }
  const unlockedNext = agenticNextUnlockedUnitAfter(unit.id);
  if (unlockedNext?.id) {
    path.lastNarration = `继续沿着已解锁路径前进：${unlockedNext.label || agenticUnitLabel(unlockedNext.id)}。`;
    return unlockedNext;
  }
  return agenticUnlockDefaultNext(unit.id, "unit_completed");
}

function agenticDecisionRecord(action, detail = {}) {
  const path = ensureAgenticPath();
  path.decisions.unshift({ action, ...detail, at: beijingNow() });
  path.decisions = path.decisions.slice(0, 80);
  analyticsTrack("agentic_decision", { data: { action, ...detail } });
  trackLearningEvent("agentic_decision", { action, ...detail }, false);
}

function agenticDecisionText(decision) {
  const actionText = {
    skip: "跳过已掌握",
    select_knowledge: "自主勾选知识点",
    review_knowledge: "回看知识点",
    unskip_knowledge: "补学已跳过内容",
    review_and_unskip_knowledge: "回看/补学知识点",
    continue: "按顺序巩固",
    remediate: "换方式重学",
    extension: "一步拓展",
    extension_chapter: "扩展章节"
  }[decision.action] || decision.action;
  const target = decision.targetLabel || agenticUnitLabel(decision.targetId);
  const skipText = decision.skippedUnitIds?.length ? `，跳过 ${decision.skippedUnitIds.length} 节` : "";
  return `${actionText}${target ? ` -> ${target}` : ""}${skipText}`;
}

function renderAgenticDecisionTrail() {
  return "";
}

function agenticNextStatusText(unit) {
  if (!unit?.id) return "完成当前小节后，我会根据学习记录更新下一步。";
  const next = agenticNextUnlockedUnitAfter(unit.id);
  if (next?.id) return `当前已解锁的下一步是「${next.label || agenticUnitLabel(next.id)}」。`;
  const planned = agenticNextMainUnitAfter(unit.id);
  if (planned?.id) return `完成本节后，我会根据记录解锁「${agenticUnitLabel(planned.id)}」。`;
  return "这是当前路径的最后一步。";
}

function agenticCoachTitleForUnit(unit) {
  if (!unit) return "学习建议";
  if (unit.flowKind === "adaptive") {
    if (AGENTIC_EXTENSION_SCENE_ORDERS.includes(unit.sceneOrder)) return "拓展小节";
    return "重学小节";
  }
  if (unit.assessmentPhase === "pre") return "前测定位";
  if (unit.assessmentPhase === "formative") return "形成性测验";
  if (unit.assessmentPhase === "post") return "后测收束";
  if (unit.type === "slide") {
    const text = `${unit.label || ""} ${unit.scene?.title || ""}`;
    if (/地图|路线/.test(text)) return "概念地图";
    if (/公式|桥|框架/.test(text)) return "公式桥";
    if (/复盘|兜底/.test(text)) return "复盘整理";
    return "概念讲解";
  }
  if (unit.type === "interactive") return "互动实验";
  if (unit.type === "knowledge") return "选择互动场景";
  return "学习建议";
}

function agenticCurrentUnitNarration(unit, path) {
  if (!unit) return "正在加载当前小节，稍等一下我再给你下一步建议。";
  const guide = chapterGuides[unit.chapterId];
  const nextText = agenticNextStatusText(unit);
  const submitted = (state.submittedQuizzes || []).includes(unit.id);
  const sceneText = `${unit.label || ""} ${unit.scene?.title || ""}`;

  if (unit.flowKind === "adaptive") {
    const activeDetour = path.activeDetour?.unitId === unit.id ? path.activeDetour : null;
    if (activeDetour?.phase === "post") {
      const hasExtension = AGENTIC_ENABLE_EXTENSION && Boolean(agenticUnusedExtensionCandidate(activeDetour.chapterId || unit.chapterId, "post_relearn_complete"));
      return hasExtension
        ? `当前是后测后的互动重学「${unit.label}」。完成后我会先给出一步拓展选项，你可以选择跨章预告，也可以直接进入下一章。`
        : `当前是后测后的互动重学「${unit.label}」。完成后本章就收束，下一步进入下一章。`;
    }
    const resume = agenticResumeAfterInsertedAdaptive(unit);
    const anchorUnitId =
      path.oneStepExtension?.unitId === unit.id
        ? path.oneStepExtension.fromUnitId
        : path.insertedAfter?.[unit.id] || "";
    const resumeText = resume?.label
      ? agenticIsCrossChapterResume(anchorUnitId, resume.id)
        ? `完成后进入下一章「${resume.label}」。`
        : `完成后回到「${resume.label}」。`
      : nextText;
    if (AGENTIC_EXTENSION_SCENE_ORDERS.includes(unit.sceneOrder)) {
      return `当前是拓展小节「${unit.label}」。这一步是额外挑战，不会替代主线学习；先试一个新情境，再把它和本章核心概念连起来。${resumeText}`;
    }
    return `当前是互动重学「${unit.label}」。这节用另一种交互方式补稳刚才暴露的卡点；重点是重新操作、重新解释，而不是只看一遍答案。${resumeText}`;
  }

  if (unit.assessmentPhase === "pre") {
    return submitted
      ? `前测已经提交。本节只用于定位已有基础；如果出现跳过建议，需要你确认后才会改变路径。${nextText}`
      : `当前是本章前测。按真实想法作答就好，结果只用来判断是否需要跳过已掌握内容，答错不会扣掉后续学习机会。`;
  }

  if (unit.assessmentPhase === "formative") {
    return submitted
      ? `形成性测验已提交。先看学习建议，再决定回看或继续。${nextText}`
      : "当前是形成性测验。按真实理解作答，提交后再选下一步。";
  }

  if (unit.assessmentPhase === "post") {
    return submitted
      ? `后测已提交。先看学习建议，再决定回看或进入下一章。${nextText}`
      : "当前是本章后测。先独立完成，提交后再选下一步。";
  }

  if (unit.type === "slide") {
    if (/地图|路线/.test(sceneText)) {
      return `当前是「${unit.label}」。先把本章路线看清楚：${guide?.bridge || "核心概念之间的关系"}。看完后再进入实验，操作会更有方向感。${nextText}`;
    }
    if (/公式|桥|框架/.test(sceneText)) {
      return `当前是「${unit.label}」。这里把直觉翻译成符号和公式；先对照例子看每个量代表什么，再进入后面的互动检验。${nextText}`;
    }
    if (/复盘|兜底/.test(sceneText)) {
      return `当前是「${unit.label}」。这节适合把前面操作过的现象整理成一句自己的解释，再继续后测或下一段主线。${nextText}`;
    }
    return `当前是「${unit.label}」。先抓住这一页的核心关系，再带着问题进入下一节。${nextText}`;
  }

  if (unit.type === "interactive") {
    return `当前是主线互动实验「${unit.label}」。至少做一次关键操作，再反向试一次，观察图像、数值或公式是否同步变化。${nextText}`;
  }

  if (unit.type === "knowledge") {
    const selectedType = typeof selectedKnowledgeSceneType === "function" ? selectedKnowledgeSceneType(unit) : "";
    const types = typeof knowledgeInteractionTypes === "function" ? knowledgeInteractionTypes(unit) : [];
    const selected = types.find((type) => type.id === selectedType) || {};
    const selectedLabel = selected.label || selected.title || selectedType || "互动场景";
    return `当前知识点是「${unit.label}」。先看讲解页，再体验「${selectedLabel}」。${nextText}`;
  }

  return path?.lastNarration || nextText;
}

function agenticStudentNarrationForPending(pending) {
  const actions = pending?.actions || [];
  const phase = pending?.phase || "";
  const remediateAction = actions.find((action) => action.type === "remediate");
  const extensionChapterAction = actions.find((action) => action.type === "extension_chapter");
  const extensionAction = actions.find((action) => action.type === "extension") || extensionChapterAction;
  const skipAction = actions.find((action) => action.type === "skip");
  const reviewAction = actions.find((action) => action.type === "review_knowledge");
  const unskipAction = actions.find((action) => action.type === "unskip_knowledge");
  const combinedReviewAction = actions.find((action) => action.type === "review_and_unskip_knowledge");
  const continueAction = actions.find((action) => action.type === "continue");
  const hasRemediate = Boolean(remediateAction);
  const hasExtension = Boolean(extensionAction);
  const hasSkip = Boolean(skipAction);
  const hasReview = Boolean(reviewAction);
  const hasUnskip = Boolean(unskipAction);
  const hasCombinedReview = Boolean(combinedReviewAction);
  const continueLabel = continueAction?.label || "继续主线";

  if (phase === "pre_knowledge_selection") {
    const action = actions.find((item) => item.type === "select_knowledge") || {};
    const choices = action.knowledgeChoices || [];
    const learnCount = choices.filter((choice) => choice.checked).length;
    const skipCount = choices.length - learnCount;
    return `前测已经完成。我把本章 ${choices.length} 个知识点列出来了：建议继续学习 ${learnCount} 个，暂时跳过 ${skipCount} 个。你可以自己勾选，确认后再改变学习路径。`;
  }

  if (phase === "interaction_scene_choice") {
    const sceneAction = actions.find((action) => action.type === "scene") || remediateAction || extensionAction;
    const label = agenticActionUnitLabel(sceneAction);
    const defaultLabel = continueAction?.label || "默认场景";
    const evidence = pending.evidence || {};
    const reason = evidence.riskLevel === "high"
      ? "刚才的交互里出现了反复查看、停留较久或答题卡顿"
      : evidence.suggestedMove === "extend"
        ? "刚才的完成比较顺畅"
        : "下一小节有不同学习场景可选";
    return label
      ? `${reason}。下一节你可以选「${label}」，也可以走「${defaultLabel}」。选完后，本章路径会记录你的实际选择。`
      : `${reason}。请选择下一节要进入的学习场景；选完后，本章路径会记录你的实际选择。`;
  }

  if (phase === "post_relearn_complete") {
    const extensionLabel = agenticActionUnitLabel(extensionAction);
    return extensionLabel
      ? `你已经完成后测后的互动重学。现在可以再做一步拓展「${extensionLabel}」，把刚补稳的想法迁移到新情境；也可以直接${continueLabel}。`
      : `你已经完成后测后的互动重学。本章当前没有新的拓展可选，可以直接${continueLabel}。`;
  }

  if (phase === "post" && hasRemediate && hasExtension) {
    const relearnLabel = agenticActionUnitLabel(remediateAction);
    const extensionLabel = agenticActionUnitLabel(extensionAction);
    const extensionKind = extensionChapterAction ? "扩展章节" : "拓展";
    const targets = [relearnLabel ? `重学「${relearnLabel}」` : "", extensionLabel ? `${extensionKind}「${extensionLabel}」` : ""].filter(Boolean).join("，");
    return targets
      ? `后测已经完成。你可以在${targets}之间选一个，或者直接${continueLabel}。`
      : `后测已经完成。你可以二选一：先换一种方式互动重学，或者解锁扩展；也可以直接继续主线。`;
  }

  if (phase === "post" && hasReview && hasExtension) {
    const reviewLabel = agenticActionUnitLabel(reviewAction);
    const extensionLabel = agenticActionUnitLabel(extensionAction);
    return `后测已经完成。${reviewLabel ? `建议先回看「${reviewLabel}」；` : "有知识点建议回看；"}也可以选择解锁扩展${extensionLabel ? `「${extensionLabel}」` : ""}，或直接${continueLabel}。`;
  }

  if (phase === "post" && hasExtension) {
    const label = agenticActionUnitLabel(extensionAction);
    const extensionKind = extensionChapterAction ? "扩展章节" : "一步拓展";
    return label
      ? `后测已经完成。你的主线学习可以收束了；如果还想多挑战，可以解锁${extensionKind}「${label}」。`
      : `后测已经完成。你的主线学习可以收束了；如果还想多挑战，可以解锁扩展课。`;
  }

  if (phase === "post" && hasRemediate) {
    const label = agenticActionUnitLabel(remediateAction);
    return label
      ? `后测显示还有一个点值得补稳。我已把「${label}」放到本节后面，你可以换一种互动方式再学一遍。`
      : "后测显示还有一个点值得补稳。我为你加了一节互动重学课。";
  }

  if (phase === "post" && hasReview) {
    const label = agenticActionUnitLabel(reviewAction);
    return label
      ? `后测显示「${label}」还需要补稳。建议先回看这个知识点，再决定是否进入下一章。`
      : `后测显示还有知识点需要补稳。建议先回看薄弱点，再决定是否进入下一章。`;
  }

  if (phase === "post") {
    return `后测已经完成，整体表现已达标。建议后续挑战拓展课件；当前拓展课件暂未添加，可以${continueLabel}。`;
  }

  if (phase === "formative" && hasCombinedReview) {
    const choices = agenticReviewChoicesForAction(combinedReviewAction);
    const reviewCount = choices.filter((choice) => choice.reviewMode !== "unskip").length;
    const unskipCount = choices.filter((choice) => choice.reviewMode === "unskip").length;
    return `形成性测验提示两类调整：前面学过但不稳的 ${reviewCount} 个知识点建议回看；之前跳过但这次暴露薄弱的 ${unskipCount} 个知识点建议补学。你可以逐项选择。`;
  }

  if (phase === "formative" && hasUnskip) {
    const label = agenticActionUnitLabel(unskipAction);
    return label
      ? `形成性测验显示「${label}」虽然前测表现不错，但现在还不够稳。建议补学这个已跳过的知识点。`
      : `形成性测验显示有被跳过的知识点还不够稳。建议补学这一段。`;
  }

  if (phase === "formative" && hasReview) {
    const label = agenticActionUnitLabel(reviewAction);
    return label
      ? `形成性测验显示前半内容里的「${label}」还需要回看。先把这个点补稳，再继续主线。`
      : `形成性测验显示前半内容还需要回看。先补稳薄弱点，再继续主线。`;
  }

  if (phase === "formative" && hasRemediate) {
    const label = agenticActionUnitLabel(remediateAction);
    return label
      ? `形成性测验显示这个知识点还需要换个角度稳一稳。我已把「${label}」加在本节后面，你可以先重学再回到主线。`
      : "形成性测验显示这个知识点还需要换个角度稳一稳。我为你加了一节互动重学课。";
  }

  if (phase === "formative" && hasExtension) {
    const label = agenticActionUnitLabel(extensionAction);
    return label
      ? `形成性测验表现不错。你可以解锁一步拓展「${label}」，也可以直接继续主线。`
      : "形成性测验表现不错。你可以解锁一步拓展，也可以直接继续主线。";
  }

  if (phase === "formative") {
    return `形成性测验已经记录。当前不用插入额外课件，可以${continueLabel}。`;
  }

  if (phase === "pre" && hasSkip) {
    return "前测显示你已经掌握了一部分基础内容。你可以少走几步，先进入更有价值的互动热身；也可以仍按顺序巩固。";
  }

  if (hasRemediate) {
    const label = agenticActionUnitLabel(remediateAction);
    return label
      ? `刚才这组题暴露出一个值得再稳一稳的点。我已经把「${label}」加在本节后面，你可以先换一种互动方式再学一遍。`
      : "刚才这组题暴露出一个值得再稳一稳的点。我为你加了一节互动重学课。";
  }
  if (hasExtension) {
    const label = agenticActionUnitLabel(extensionAction);
    return label
      ? `你刚才的表现已经可以向前多看一步。我把「${label}」作为本节后的可选拓展，完成后再回到主线。`
      : "你刚才的表现已经可以向前多看一步。我为你加了一节可选拓展课。";
  }
  if (hasSkip) return "这组题说明你已经掌握了不少基础内容，可以少走几步，直接进入下一个更有价值的练习。";
  return `请选择接下来最适合你的学习方式：${continueLabel}。`;
}

async function agenticApplyDecision(type) {
  const path = ensureAgenticPath();
  const pending = path.pendingPlan;
  if (!pending) return;
  const action = pending.actions.find((item) => item.type === type);
  if (!action) return;
  if (path.decisionInFlight) return;
  path.decisionInFlight = type;
  renderAgenticCoachPanel();
  let targetId = "";
  let decisionMeta = null;
  let skippedUnitIds = [];

  try {
    if (type === "skip") {
      action.units.forEach((unit) => {
        path.skipped[unit.id] = true;
      });
      skippedUnitIds = action.units.map((unit) => unit.id);
      const lastSkipped = action.units[action.units.length - 1]?.id || pending.unitId;
      const target = agenticNextNonQuizMainUnitAfter(lastSkipped) || agenticNextMainUnitAfter(lastSkipped) || agenticNextMainUnitAfter(pending.unitId);
      targetId = target?.id || "";
      agenticUnlockUnit(targetId, "pretest_skip_accept");
      path.lastNarration = targetId
        ? `已跳过 ${action.units.length} 个掌握度较高的模块，先进入热身学习：${agenticUnitLabel(targetId)}，再做阶段检查。`
        : `已跳过 ${action.units.length} 个掌握度较高的模块。`;
      addLog(`接受学习建议，跳过 ${action.units.length} 个已掌握模块。`);
    } else if (type === "select_knowledge") {
      const choices = action.knowledgeChoices || [];
      const selectedIds = new Set(choices.filter((choice) => choice.checked).map((choice) => choice.id));
      const skippedChoices = choices.filter((choice) => !selectedIds.has(choice.id));
      skippedChoices.forEach((choice) => {
        const unit = findMainUnit(choice.id);
        if (unit?.type === "knowledge") path.skipped[unit.id] = true;
      });
      skippedUnitIds = skippedChoices.map((choice) => choice.id).filter((id) => findMainUnit(id));
      const anchorUnitId = pending.anchorUnitId || pending.unitId;
      const next = agenticNextMainUnitAfter(anchorUnitId) || agenticNextUnitIdAfter(anchorUnitId);
      targetId = next?.id || (typeof next === "string" ? next : "");
      choices.forEach((choice) => {
        if (selectedIds.has(choice.id)) delete path.skipped[choice.id];
      });
      agenticUnlockUnit(targetId, "pretest_knowledge_selection");
      const learnCount = choices.length - skippedChoices.length;
      path.lastNarration = targetId
        ? `已按你的选择保留 ${learnCount} 个知识点，暂时跳过 ${skippedChoices.length} 个；下一步进入：${agenticUnitLabel(targetId)}。`
        : `已按你的选择保留 ${learnCount} 个知识点，暂时跳过 ${skippedChoices.length} 个。`;
      addLog(`前测后自主选择学习 ${learnCount} 个知识点，跳过 ${skippedChoices.length} 个。`);
    } else if (type === "review_knowledge" || type === "unskip_knowledge" || type === "review_and_unskip_knowledge") {
      const choices = agenticReviewChoicesForAction(action);
      const selectedIds = choices.filter((choice) => choice.checked).map((choice) => choice.id).filter((id) => findMainUnit(id));
      if (!selectedIds.length) {
        const continueTarget = pending.resumeUnitId || agenticNextMainUnitAfter(pending.anchorUnitId || pending.unitId)?.id || agenticNextUnitIdAfter(pending.anchorUnitId || pending.unitId) || "";
        targetId = continueTarget;
        if (pending.phase === "post") agenticMarkChapterReadyOnPath(path, pending.chapterId, "post_review_declined");
        agenticUnlockUnit(targetId, "student_skip_review_selection");
        path.reviewQueue = null;
        path.reviewResume = null;
        path.lastNarration = targetId ? `已继续主线：${agenticUnitLabel(targetId)}。` : "已继续主线。";
        addLog("已按你的选择不回看薄弱知识点，继续主线。");
      } else {
      const selectedChoices = choices.filter((choice) => choice.checked && findMainUnit(choice.id));
      const unskipIds = selectedChoices
        .filter((choice) => type === "unskip_knowledge" || choice.reviewMode === "unskip")
        .map((choice) => choice.id);
      if (unskipIds.length) {
        unskipIds.forEach((unitId) => {
          delete path.skipped[unitId];
        });
      }
        const anchorUnitId = pending.anchorUnitId || pending.unitId;
        const resumeUnitId = pending.resumeUnitId || agenticNextMainUnitAfter(anchorUnitId)?.id || agenticNextUnitIdAfter(anchorUnitId) || "";
        targetId = selectedIds[0] || resumeUnitId || "";
        selectedIds.forEach((unitId) => agenticUnlockUnit(unitId, unskipIds.includes(unitId) ? "formative_unskip_knowledge" : "quiz_review_knowledge"));
        agenticUnlockUnit(targetId, unskipIds.includes(targetId) ? "formative_unskip_knowledge" : "quiz_review_knowledge");
        const queueType = unskipIds.length && unskipIds.length === selectedIds.length
          ? "unskip_knowledge"
          : type;
        path.reviewQueue = targetId
          ? {
              type: queueType,
              queue: selectedIds,
              currentIndex: 0,
              fromUnitId: anchorUnitId,
              chapterId: pending.chapterId,
              phase: pending.phase,
              resumeUnitId,
              unskipIds
            }
          : null;
        path.reviewResume = targetId
          ? {
              type: unskipIds.includes(targetId) ? "unskip_knowledge" : "review_knowledge",
              unitId: targetId,
              fromUnitId: anchorUnitId,
              chapterId: pending.chapterId,
              phase: pending.phase,
              resumeUnitId,
              unskipIds
            }
          : null;
        path.lastNarration = targetId
          ? type === "unskip_knowledge"
            ? `已按你的选择安排补学 ${selectedIds.length} 个知识点，先学习：${agenticUnitLabel(targetId)}。`
            : type === "review_and_unskip_knowledge"
              ? `已按你的选择安排 ${selectedIds.length} 个知识点，其中 ${unskipIds.length} 个会补学；先进入：${agenticUnitLabel(targetId)}。`
            : `已按你的选择安排 ${selectedIds.length} 个回看知识点，先回看：${agenticUnitLabel(targetId)}。`
          : "已记录回看知识点的选择。";
        addLog(type === "unskip_knowledge" ? "根据形成性测验补学已跳过知识点。" : type === "review_and_unskip_knowledge" ? "根据形成性测验合并处理回看和补学知识点。" : "根据测验结果回看薄弱知识点。 ");
      }
    } else if (type === "scene") {
      targetId = action.units[0]?.id || pending.resumeUnitId || "";
      const targetUnit = findMainUnit(targetId);
      if (targetUnit?.flowKind === "adaptive") agenticRememberAdaptiveUse(targetId, pending.anchorUnitId || pending.unitId, { insertAfter: false });
      agenticUnlockUnit(targetId, "student_next_scene_choice");
      path.lastNarration = targetId
        ? `已选择下一节场景：${agenticUnitLabel(targetId)}。本章路径会记录你的实际选择。`
        : "已记录下一节场景选择。";
      addLog("选择下一节学习场景。 ");
    } else if (type === "remediate") {
      targetId = action.units[0]?.id || "";
      const anchorUnitId = pending.anchorUnitId || pending.unitId;
      agenticRememberAdaptiveUse(targetId, anchorUnitId);
      agenticUnlockUnit(targetId, pending.phase === "interaction_scene_choice" ? "interaction_scene_choice" : "posttest_alt_modality");
      const label = agenticActionUnitLabel(action) || agenticUnitLabel(targetId);
      const postRelearnExtension = pending.phase === "post"
        ? agenticUnusedExtensionCandidate(pending.chapterId, "post_relearn_complete")
        : null;
      const afterRelearnText =
        pending.phase === "interaction_scene_choice"
          ? "完成后再回到你刚才的主线下一步。"
          : pending.phase === "post"
          ? postRelearnExtension
            ? "完成后你可以再选择一步拓展，或直接进入下一章。"
            : "完成后直接进入下一章。"
          : "完成后再回到主线巩固。";
      path.activeDetour = targetId
        ? {
            type: "remediate",
            unitId: targetId,
            fromUnitId: anchorUnitId,
            chapterId: pending.chapterId,
            phase: pending.phase,
            stats: pending.stats || null,
            resumeUnitId: pending.resumeUnitId || agenticNextMainUnitAfter(anchorUnitId)?.id || agenticNextUnitIdAfter(anchorUnitId)
          }
        : null;
      if (!targetId && pending.phase === "post") agenticMarkChapterReadyOnPath(path, pending.chapterId, "post_relearn_unavailable");
      path.lastNarration = targetId
        ? `已切换到互动重学：${label}。${afterRelearnText}`
        : "已记录换一种方式重学的选择。";
      addLog("接受学习建议，换一种方式重新学习。 ");
    } else if (type === "extension_chapter") {
      const extensionChapterId = action.extensionChapterId || action.units[0]?.chapterId || "";
      const extensionChapterIds = (action.extensionChapterIds?.length ? action.extensionChapterIds : [extensionChapterId]).filter(Boolean);
      const extensionChapter = getChapter(extensionChapterId);
      let firstUnit = null;
      extensionChapterIds.forEach((chapterId, index) => {
        const unlockedFirst = agenticUnlockExtensionChapter(chapterId, pending.chapterId, "posttest_extension_chapter");
        if (index === 0) firstUnit = unlockedFirst;
      });
      targetId = firstUnit?.id || action.units[0]?.id || "";
      const anchorUnitId = pending.anchorUnitId || pending.unitId;
      const resumeUnitId = pending.resumeUnitId || agenticNextMainUnitAfter(anchorUnitId)?.id || agenticNextUnitIdAfter(anchorUnitId) || "";
      path.chapterExtensionsUsed[pending.chapterId] = true;
      if (pending.phase === "post") agenticMarkChapterReadyOnPath(path, pending.chapterId, "post_extension_chapter_unlocked");
      if (resumeUnitId) agenticUnlockUnit(resumeUnitId, "post_extension_resume_ready");
      path.activeExtensionChapter = targetId
        ? { chapterId: extensionChapterId, fromChapterId: pending.chapterId, fromUnitId: anchorUnitId, resumeUnitId }
        : null;
      const label = action.label?.replace(/^解锁扩展：/, "") || action.units[0]?.label || (typeof chapterDisplayCopy === "function" ? chapterDisplayCopy(extensionChapter).label : extensionChapter?.label) || agenticUnitLabel(targetId);
      path.lastNarration = targetId
        ? `已解锁扩展章节：${label}。章节列表会把它插到推荐位置，完成后可回到主线下一章。`
        : "已记录扩展章节推荐。";
      addLog(`接受学习建议，解锁扩展章节「${label}」。`);
    } else if (type === "extension") {
      targetId = action.units[0]?.id || "";
      path.chapterExtensionsUsed[pending.chapterId] = true;
      agenticRememberAdaptiveUse(targetId, pending.anchorUnitId || pending.unitId);
      agenticUnlockUnit(targetId, pending.phase === "interaction_scene_choice" ? "interaction_scene_choice_extension" : "chapter_extension_one_hop");
      const label = agenticActionUnitLabel(action) || agenticUnitLabel(targetId);
      path.oneStepExtension = {
        unitId: targetId,
        fromUnitId: pending.anchorUnitId || pending.unitId,
        resumeUnitId: pending.resumeUnitId || agenticNextMainUnitAfter(pending.anchorUnitId || pending.unitId)?.id || agenticNextUnitIdAfter(pending.anchorUnitId || pending.unitId),
        chapterId: pending.chapterId,
        phase: pending.phase
      };
      if (!targetId && pending.phase === "post") agenticMarkChapterReadyOnPath(path, pending.chapterId, "post_extension_unavailable");
      const afterExtensionText =
        pending.phase === "interaction_scene_choice"
          ? "完成后会回到你刚才的主线下一步。"
          : pending.phase === "post"
          ? "本章不再安排重学，完成后进入下一章。"
          : pending.phase === "post_relearn_complete"
            ? "完成后进入下一章。"
            : "完成后会回到主线。";
      path.lastNarration = targetId
        ? `已解锁一步拓展：${label}。${afterExtensionText}`
        : "已记录一步拓展选择。";
      addLog("接受学习建议，只解锁一步拓展知识点。 ");
    } else {
      const anchorUnitId = pending.anchorUnitId || pending.unitId;
      targetId = pending.resumeUnitId || agenticNextMainUnitAfter(anchorUnitId)?.id || agenticNextUnitIdAfter(anchorUnitId) || "";
      if (pending.phase === "post") agenticMarkChapterReadyOnPath(path, pending.chapterId, "post_continue_confirmed");
      if (path.activeExtensionChapter?.chapterId === pending.chapterId) path.activeExtensionChapter = null;
      agenticUnlockUnit(targetId, "student_continue_linear");
      path.reviewQueue = null;
      path.reviewResume = null;
      path.lastNarration = targetId
        ? `已保留顺序学习，下一步进入：${agenticUnitLabel(targetId)}。`
        : "已保留顺序学习。";
      addLog("选择继续主线通关。 ");
    }

    decisionMeta = agenticDecisionMeta(pending, action, targetId);

    agenticDecisionRecord(type, {
      ...decisionMeta,
      fromUnitId: pending.anchorUnitId || pending.unitId,
      targetId,
      targetLabel: agenticActionUnitLabel(action) || agenticUnitLabel(targetId),
      chapterId: pending.chapterId,
      selectedSceneId: type === "scene" ? targetId : "",
      skippedUnitIds
    });
    analyticsTrack("agentic_decision_executed", {
      data: {
        ...decisionMeta,
        action: type,
        fromUnitId: pending.anchorUnitId || pending.unitId,
        targetId,
        targetLabel: agenticActionUnitLabel(action) || agenticUnitLabel(targetId),
        chapterId: pending.chapterId,
        selectedSceneId: type === "scene" ? targetId : "",
        skippedUnitIds
      }
    });
    path.pendingPlan = null;
    path.pendingAt = "";
    path.decisionInFlight = "";
    saveState();
    if (targetId) {
      await agenticOpenUnit(targetId);
    } else {
      agenticRenderLearningUpdate();
    }
  } catch (error) {
    path.decisionInFlight = "";
    saveState();
    renderAgenticCoachPanel();
    addLog(`学习路径切换失败：${error.message || "请重试"}`);
    throw error;
  }
}

function agenticSceneChoicePanel(unit) {
  if (!unit || typeof siblingLearningScenes !== "function") return "";
  const cluster = typeof learningClusterForUnit === "function" ? learningClusterForUnit(unit) : null;
  const evidence = interactionEvidenceForUnit(unit.id);
  const scenes = rankSiblingLearningScenes(unit).filter((scene) => scene.id !== unit.id);
  if (!cluster || !scenes.length) return "";
  const chips = scenes.slice(0, 5).map((scene) => {
    const locked = typeof agenticIsUnitUnlocked === "function" && !agenticIsUnitUnlocked(scene.id) && !(typeof agenticIsSkipped === "function" && agenticIsSkipped(scene.id));
    const cls = ["agentic-scene-choice", scene.flowKind === "adaptive" ? "adaptive" : "", locked ? "locked" : ""].filter(Boolean).join(" ");
    return '<button class="' + cls + '" type="button" data-unit="' + scene.id + '"' + (locked ? ' aria-disabled="true"' : '') + '>'
      + '<span>' + escapeHtml(learningSceneRole(scene)) + '</span>'
      + '<strong>' + escapeHtml(scene.label) + '</strong>'
      + '</button>';
  }).join('');
  const reason = evidence?.suggestedMove === "alternate_scene"
    ? "根据刚才的停留、回看答案或反复操作，优先给你排了同知识点的替代场景。"
    : evidence?.suggestedMove === "extend"
      ? "刚才比较顺畅，优先给你排了可以迁移或拓展的相邻场景。"
      : "这些是同一知识点下的相邻学习场景，你可以自主切换。";
  return '<div class="agentic-scene-choices"><div><strong>' + escapeHtml(cluster.label) + '</strong><small>' + escapeHtml(cluster.focus) + '</small><small>' + escapeHtml(reason) + '</small></div><div class="agentic-scene-choice-grid">' + chips + '</div></div>';
}

function agenticUpdatePendingKnowledgeChoice(choiceId, checked) {
  const path = ensureAgenticPath();
  const pending = path.pendingPlan;
  if (!pending) return false;
  const action = (pending.actions || []).find((item) => item.type === "select_knowledge" || item.type === "review_knowledge" || item.type === "unskip_knowledge" || item.type === "review_and_unskip_knowledge");
  const choice = (action?.knowledgeChoices || []).find((item) => item.id === choiceId);
  if (!choice) return false;
  choice.checked = Boolean(checked);
  choice.studentChanged = true;
  path.lastNarration = agenticStudentNarrationForPending(pending);
  saveState();
  renderAgenticCoachPanel();
  return true;
}

function agenticUpdateReviewChoiceMode(choiceId, mode) {
  const path = ensureAgenticPath();
  const pending = path.pendingPlan;
  if (!pending) return false;
  const action = (pending.actions || []).find((item) => item.type === "review_knowledge" || item.type === "unskip_knowledge" || item.type === "review_and_unskip_knowledge");
  const choices = action ? agenticReviewChoicesForAction(action) : [];
  const choice = choices.find((item) => item.id === choiceId);
  if (!choice) return false;
  const actionMode = choice.reviewMode === "unskip" ? "learn" : "review";
  choice.choiceMode = mode === actionMode ? actionMode : "skip";
  choice.checked = choice.choiceMode === actionMode;
  choice.studentChanged = true;
  path.lastNarration = agenticStudentNarrationForPending(pending);
  saveState();
  renderAgenticCoachPanel();
  return true;
}

function agenticReviewChoicesForAction(action = {}) {
  if (action.knowledgeChoices?.length) {
    action.knowledgeChoices.forEach((choice) => {
      const mastery = Number(choice.mastery);
      const actionMode = choice.reviewMode === "unskip" ? "learn" : "review";
      if (!choice.choiceMode) choice.choiceMode = choice.checked === false ? "skip" : actionMode;
      if (Number.isFinite(mastery) && mastery < AGENTIC_POST_REMEDIATION_THRESHOLD && choice.checked !== false && !choice.studentChanged) {
        choice.checked = true;
        choice.choiceMode = actionMode;
      }
      if (Number.isFinite(mastery) && mastery < AGENTIC_POST_REMEDIATION_THRESHOLD && choice.checked === false && !choice.studentChanged) {
        choice.checked = true;
        choice.choiceMode = actionMode;
      }
    });
    return action.knowledgeChoices;
  }
  action.knowledgeChoices = (action.units || []).map((candidate, index) => {
    const unit = findMainUnit(candidate.id) || {};
    const reviewMode = candidate.reviewMode || (action.type === "unskip_knowledge" ? "unskip" : "review");
    const mastery = Number(candidate.mastery);
    const shouldCheck = Number.isFinite(mastery) ? mastery < AGENTIC_POST_REMEDIATION_THRESHOLD : index < 3;
    return {
      id: candidate.id,
      name: candidate.label || candidate.title || unit.label || candidate.id,
      moduleId: candidate.moduleId || unit.moduleId || "",
      moduleTitle: candidate.moduleTitle || unit.moduleTitle || "本章知识点",
      goal: unit.conceptClusterFocus || unit.scene?.content?.knowledgePoint?.goal || "",
      mastery: candidate.mastery,
      status: candidate.status || "",
      reviewMode,
      checked: shouldCheck,
      choiceMode: shouldCheck ? (reviewMode === "unskip" ? "learn" : "review") : "skip",
      reason: reviewMode === "unskip" ? "前测选择跳过，但本次测验暴露薄弱，建议补学。" : "前面已学内容本次测验不稳，建议回看。"
    };
  });
  return action.knowledgeChoices;
}

function agenticRenderReviewSelectionPlan(pending, inFlight = "") {
  const action = (pending.actions || []).find((item) => item.type === "review_and_unskip_knowledge" || item.type === "review_knowledge" || item.type === "unskip_knowledge") || {};
  const choices = agenticReviewChoicesForAction(action);
  const checkedCount = choices.filter((choice) => choice.checked).length;
  const extensionButtons = (pending.actions || [])
    .filter((item) => item.type === "extension_chapter" || item.type === "extension")
    .map((item) => `
      <button class="button ${item.primary ? "primary" : "soft"}" type="button" data-agentic-action="${escapeHtml(item.type)}" ${inFlight ? "disabled" : ""}>
        ${escapeHtml(inFlight === item.type ? "处理中..." : item.label)}
      </button>
    `).join("");
  const renderGroups = (itemsToRender) => {
    const sectionGrouped = itemsToRender.reduce((map, choice) => {
      const key = choice.moduleTitle || choice.moduleId || "本章知识点";
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(choice);
      return map;
    }, new Map());
    return Array.from(sectionGrouped.entries()).map(([moduleTitle, items]) => `
      <div class="agentic-knowledge-group">
        <strong>${escapeHtml(moduleTitle)}</strong>
        ${items.map((choice) => {
          const mastery = choice.mastery === null || choice.mastery === undefined ? "" : `掌握度 ${Math.round(Number(choice.mastery) * 100)}%`;
          const isUnskip = choice.reviewMode === "unskip";
          const activeMode = choice.choiceMode || (choice.checked ? (isUnskip ? "learn" : "review") : "skip");
          const primaryMode = isUnskip ? "learn" : "review";
          const primaryText = isUnskip ? "补学" : "回看";
          const skipText = isUnskip ? "仍然跳过" : "暂不回看";
          const statusText = isUnskip ? "已跳过" : "已学过";
          return `
            <article class="agentic-knowledge-decision ${activeMode === primaryMode ? "selected" : "skipped"}">
              <div class="agentic-knowledge-copy">
                <span class="status-pill ${isUnskip ? "locked" : "todo"}">${statusText}</span>
                <b>${escapeHtml(choice.name)}</b>
                <small>${escapeHtml([mastery, choice.reason].filter(Boolean).join(" · "))}</small>
              </div>
              <div class="agentic-choice-toggle" role="group" aria-label="${escapeHtml(choice.name)}处理方式">
                <button class="${activeMode === primaryMode ? "active" : ""}" type="button" data-agentic-review-choice="${escapeHtml(choice.id)}" data-agentic-review-mode="${primaryMode}" ${inFlight ? "disabled" : ""}>${primaryText}</button>
                <button class="${activeMode === "skip" ? "active" : ""}" type="button" data-agentic-review-choice="${escapeHtml(choice.id)}" data-agentic-review-mode="skip" ${inFlight ? "disabled" : ""}>${skipText}</button>
              </div>
            </article>
          `;
        }).join("")}
      </div>
    `).join("");
  };
  const reviewChoices = choices.filter((choice) => choice.reviewMode !== "unskip");
  const unskipChoices = choices.filter((choice) => choice.reviewMode === "unskip");
  const combined = action.type === "review_and_unskip_knowledge";
  const groups = combined
    ? [
        reviewChoices.length ? `<div class="agentic-knowledge-section"><h4>建议回看已学内容</h4>${renderGroups(reviewChoices)}</div>` : "",
        unskipChoices.length ? `<div class="agentic-knowledge-section"><h4>建议补学已跳过内容</h4>${renderGroups(unskipChoices)}</div>` : ""
      ].filter(Boolean).join("")
    : renderGroups(choices);
  const title = "根据这次测验，建议调整学习路径";
  const buttonText = "按我的选择开始学习";
  return `
    <section class="agentic-coach-card decision knowledge-selection">
      <div class="agentic-coach-header">
        <strong>${title}</strong>
      </div>
      <p>${checkedCount ? `建议先处理 ${checkedCount} 个知识点。你可以逐项选择“回看”“补学”或暂时不处理。` : "如果暂时不处理这些建议，可以直接继续主线。"}</p>
      <div class="agentic-knowledge-selection">${groups}</div>
      <div class="agentic-actions">
        <button class="button primary" type="button" data-agentic-action="${escapeHtml(action.type)}" ${inFlight ? "disabled" : ""}>
          ${escapeHtml(inFlight === action.type ? "处理中..." : buttonText)}
        </button>
        ${extensionButtons}
        ${(pending.actions || []).some((item) => item.type === "continue")
          ? `<button class="button soft" type="button" data-agentic-action="continue" ${inFlight ? "disabled" : ""}>继续主线</button>`
          : ""}
      </div>
    </section>
  `;
}

function agenticRenderKnowledgeSelectionPlan(pending, inFlight = "") {
  const action = (pending.actions || []).find((item) => item.type === "select_knowledge") || {};
  const choices = action.knowledgeChoices || [];
  const grouped = choices.reduce((map, choice) => {
    const key = choice.moduleTitle || choice.moduleId || "本章知识点";
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(choice);
    return map;
  }, new Map());
  const groups = Array.from(grouped.entries()).map(([moduleTitle, items]) => `
    <div class="agentic-knowledge-group">
      <strong>${escapeHtml(moduleTitle)}</strong>
      ${items.map((choice) => {
        const mastery = choice.mastery === null || choice.mastery === undefined ? "证据不足" : `掌握度 ${Math.round(Number(choice.mastery) * 100)}%`;
        return `
          <label class="agentic-knowledge-check ${choice.checked ? "checked" : ""}">
            <input type="checkbox" data-agentic-knowledge-choice="${escapeHtml(choice.id)}" ${choice.checked ? "checked" : ""} ${inFlight ? "disabled" : ""} />
            <span><b>${escapeHtml(choice.name)}</b><small>${escapeHtml(mastery)} · ${escapeHtml(choice.reason || "")}</small></span>
          </label>
        `;
      }).join("")}
    </div>
  `).join("");
  return `
    <section class="agentic-coach-card decision knowledge-selection">
      <div class="agentic-coach-header">
        <strong>选择本章要学的知识点</strong>
      </div>
      <p>${escapeHtml(agenticStudentNarrationForPending(pending))}</p>
      <div class="agentic-knowledge-selection">${groups}</div>
      <div class="agentic-actions">
        <button class="button primary" type="button" data-agentic-action="select_knowledge" ${inFlight ? "disabled" : ""}>
          ${escapeHtml(inFlight === "select_knowledge" ? "处理中..." : action.label || "按勾选知识点开始学习")}
        </button>
      </div>
    </section>
  `;
}
function renderAgenticCoachPanel() {
  const node = document.querySelector("#agentic-coach-panel");
  if (!node) return;
  const path = ensureAgenticPath();
  const pending = path.pendingPlan;
  const shouldShowPending = pending && agenticPendingAppliesToCurrent(pending);

  if (!shouldShowPending) {
    const currentUnit = getUnit(currentUnitId);
    const currentChapter = getChapter(currentChapterId);
    const narration =
      pending && !agenticPendingAppliesToCurrent(pending)
        ? `当前是「${currentChapter?.label || "本章"}」。这里没有待选择的学习建议，完成测验或当前小节后，我会根据本章表现更新下一步。`
        : agenticCurrentUnitNarration(currentUnit, path);
    const title = agenticCoachTitleForUnit(currentUnit);
    node.hidden = false;
    const knowledgeChoices = typeof renderKnowledgeSceneChoicePanel === "function" ? renderKnowledgeSceneChoicePanel(currentUnit) : "";
    node.innerHTML = `
      <section class="agentic-coach-card calm ${knowledgeChoices ? "knowledge-choice-card" : ""}">
        <div class="agentic-coach-header">
          <strong>${escapeHtml(title)}</strong>
        </div>
        <p>${escapeHtml(narration)}</p>
        ${knowledgeChoices}
      </section>
    `;
    return;
  }

  const inFlight = path.decisionInFlight || "";
  if (pending.phase === "grading_pending") {
    node.hidden = false;
    node.innerHTML = `
      <section class="agentic-coach-card decision grading-pending">
        <div class="agentic-coach-header">
          <strong>正在批改简答题</strong>
        </div>
        <p>${escapeHtml(pending.narration || "简答题批改完成后，我会再给出学习路径建议。")}</p>
      </section>
    `;
    return;
  }
  if (pending.phase === "pre_knowledge_selection") {
    node.hidden = false;
    node.innerHTML = agenticRenderKnowledgeSelectionPlan(pending, inFlight);
    return;
  }
  if ((pending.actions || []).some((action) => action.type === "review_and_unskip_knowledge" || action.type === "review_knowledge" || action.type === "unskip_knowledge")) {
    node.hidden = false;
    node.innerHTML = agenticRenderReviewSelectionPlan(pending, inFlight);
    return;
  }
  const actionButtons = pending.actions.map((action) => `
    <button class="button ${action.primary ? "primary" : "soft"}" type="button" data-agentic-action="${action.type}" ${inFlight ? "disabled" : ""}>
      ${escapeHtml(inFlight === action.type ? "处理中..." : action.label)}
    </button>
  `).join("");
  const narration = agenticStudentNarrationForPending(pending);
  node.hidden = false;
  node.innerHTML = `
    <section class="agentic-coach-card decision">
      <div class="agentic-coach-header">
        <strong>选择你的下一步</strong>
      </div>
      <p>${escapeHtml(narration)}</p>
      <div class="agentic-actions">${actionButtons}</div>
    </section>
  `;
}
