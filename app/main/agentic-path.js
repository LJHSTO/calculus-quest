// Agentic Coach path-locking and KG recommendation UI.
const AGENTIC_PRE_SKIP_THRESHOLD = 0.8;
const AGENTIC_POST_REMEDIATION_THRESHOLD = 0.6;

function agenticDefaults() {
  return {
    enabled: true,
    unlocked: ["A1-scene-1"],
    visibleUnits: ["A1-scene-1"],
    skipped: {},
    decisions: [],
    pendingPlan: null,
    pendingAt: "",
    chapterExtensionsUsed: {},
    usedAdaptiveUnits: {},
    insertedAfter: {},
    activeDetour: null,
    lastNarration: "完成当前小节后，我会为你准备合适的下一步。"
  };
}

function ensureAgenticPath() {
  if (!state.agenticPath) state.agenticPath = agenticDefaults();
  const defaults = agenticDefaults();
  Object.keys(defaults).forEach((key) => {
    if (state.agenticPath[key] === undefined) state.agenticPath[key] = defaults[key];
  });
  state.agenticPath.unlocked = Array.from(new Set([...(state.agenticPath.unlocked || []), "A1-scene-1", ...(state.completed || [])]));
  state.agenticPath.visibleUnits = Array.from(new Set([...(state.agenticPath.visibleUnits || []), "A1-scene-1", currentUnitId || "", ...(state.completed || [])].filter(Boolean)));
  state.agenticPath.skipped = state.agenticPath.skipped || {};
  state.agenticPath.decisions = state.agenticPath.decisions || [];
  state.agenticPath.chapterExtensionsUsed = state.agenticPath.chapterExtensionsUsed || {};
  state.agenticPath.usedAdaptiveUnits = state.agenticPath.usedAdaptiveUnits || {};
  state.agenticPath.insertedAfter = state.agenticPath.insertedAfter || {};
  state.agenticPath.oneStepExtension = state.agenticPath.oneStepExtension || null;
  state.agenticPath.activeDetour = state.agenticPath.activeDetour || null;
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
  return curriculum.flatMap((chapter) => chapter.units || []);
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
  return Boolean(ensureAgenticPath().skipped?.[unitId]);
}

function agenticIsUnitUnlocked(unitId) {
  const unit = findMainUnit(unitId);
  const path = ensureAgenticPath();
  return path.unlocked.includes(unitId) || state.completed.includes(unitId);
}

function agenticIsChapterUnlocked(chapterId) {
  const chapter = getChapter(chapterId);
  const path = ensureAgenticPath();
  if (path.unlocked.some((id) => id.startsWith(`${chapterId}-scene-`))) return true;
  if ((state.completed || []).some((id) => id.startsWith(`${chapterId}-scene-`))) return true;
  if (!chapter?.units?.length) return chapterId === "A1";
  return chapter.units.some((unit) => agenticIsUnitUnlocked(unit.id) || agenticIsSkipped(unit.id));
}

function agenticUnlockUnit(unitId, reason = "agent_recommended") {
  if (!unitId) return false;
  const path = ensureAgenticPath();
  agenticRevealUnit(unitId);
  if (!path.unlocked.includes(unitId)) {
    path.unlocked.push(unitId);
    addLog(`Agent 解锁：${agenticUnitLabel(unitId)}。`);
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
    const nextId = agenticNextUnitIdAfter(anchorUnitId) || agenticNextMainUnitAfter(anchorUnitId)?.id || "";
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
    nextUnitId: pending?.nextUnitId || pending?.resumeUnitId || agenticNextUnitIdAfter(pending?.anchorUnitId || pending?.unitId || "") || "",
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
  if (!pending) return false;
  return !pending.chapterId || pending.chapterId === currentChapterId;
}

function agenticPendingAppliesToUnit(unitId) {
  const pending = ensureAgenticPath().pendingPlan;
  return Boolean(pending && pending.unitId === unitId);
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

function agenticNextUnlockedUnitAfter(unitId) {
  if (agenticPendingAppliesToUnit(unitId)) return null;
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
  if (path.oneStepExtension?.unitId === unit.id || path.activeDetour?.unitId === unit.id) return true;
  if (path.pendingPlan?.unitId === unit.id) return true;
  return Boolean(path.insertedAfter?.[unit.id]);
}

function agenticDisplayUnitsForChapter(chapter = getChapter()) {
  const units = chapter?.allUnits || chapter?.units || [];
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
    return `后测已经完成。本章当前没有新的 MAIC-UI 重学或拓展需要安排，${nextText}`;
  }
  if (unit?.assessmentPhase === "formative") {
    return `形成性测验已经记录。本节暂时不用插入额外课件，${nextText}`;
  }
  if (unit?.assessmentPhase === "pre") {
    return `前测已经记录。先按主线继续学习，${nextText}`;
  }
  return next ? `下一步已解锁：${next.label}` : "本章已完成。";
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
  return Boolean(pending && pending.unitId === unitId);
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
      addLog("Agent 正在等待你选择下一步，先处理推荐卡片，再继续通关。");
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
  const objective = records.filter(({ result }) => result.isCorrect !== null);
  const correct = objective.filter(({ result }) => result.isCorrect === true).length;
  return {
    objective: objective.length,
    correct,
    accuracy: objective.length ? correct / objective.length : null
  };
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

function agenticApplyRemoteGrading(remote, unit) {
  const gradingResults = Array.isArray(remote?.gradingResults) ? remote.gradingResults : [];
  if (!gradingResults.length) return;
  const byQuestion = new Map(gradingResults.map((result) => [result.questionId, result]));
  let changed = false;
  state.quizResults = (state.quizResults || []).map((entry) => {
    if (entry.unitId !== unit.id) return entry;
    const grade = byQuestion.get(entry.questionId);
    if (!grade) return entry;
    const maxScore = quizMaxScoreFor({}, entry);
    const earnedScore = grade.score == null ? entry.score : quizScoreFromPercent(grade.score, maxScore);
    changed = true;
    return {
      ...entry,
      aiScore: grade.score,
      aiConfidence: grade.confidence,
      aiFeedback: grade.feedback || "",
      aiErrorType: grade.errorType || "",
      aiNeedsReview: Boolean(grade.needsReview),
      status: grade.score == null ? "pending_review" : "ai_reviewed",
      isCorrect: grade.score == null ? entry.isCorrect : grade.score >= 60,
      score: grade.score == null ? entry.score : earnedScore
    };
  });
  if (changed) {
    saveState();
    if (unit?.id === currentUnitId && typeof renderQuiz === "function") renderQuiz(unit);
  }
}

async function agenticAfterQuizSubmit(unit, records) {
  ensureAgenticPath();
  const stats = agenticQuizStats(records);
  const phase = unit.assessmentPhase;
  const remote = await agenticRequestPlan(unit, records);
  agenticApplyRemoteGrading(remote, unit);
  const plan = remote?.plan || null;
  const narration = remote?.narration || "Agent 已根据你的答题情况更新下一步。";
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
  const extensionCandidates = agenticMergeCandidates(
    agenticResolvePlanUnits(agenticPlannerRankedCandidates(plan, { action: "extend", chapterId: unit.chapterId }), {
      chapterId: unit.chapterId
    }),
    agenticLocalCandidates(unit.chapterId, AGENTIC_EXTENSION_SCENE_ORDERS, "same_chapter_extension"),
    agenticResolvePlanUnits(plan?.extensionCandidates, {
      chapterId: unit.chapterId,
      flowKind: "adaptive",
      sceneOrders: AGENTIC_EXTENSION_SCENE_ORDERS
    })
  );
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

  if (phase === "pre" && stats.accuracy !== null && stats.accuracy >= AGENTIC_PRE_SKIP_THRESHOLD && skipCandidates.length) {
    const safeSkipCandidates = agenticTrimSkipCandidates(skipCandidates).slice(0, 6);
    if (safeSkipCandidates.length) {
      actions.push({ type: "skip", label: "跳过已掌握，先做一个热身", primary: true, units: safeSkipCandidates });
    }
    actions.push({ type: "continue", label: "仍按顺序巩固", units: [] });
  }

  if (phase === "post") {
    if (stats.accuracy !== null && stats.accuracy < AGENTIC_POST_REMEDIATION_THRESHOLD && rankedRelearnCandidates.length) {
      actions.push({ type: "remediate", label: "换一种 MAIC-UI 互动重学", primary: true, units: rankedRelearnCandidates.slice(0, 1) });
    }
    const extension = agenticFirstUnusedCandidate(rankedExtensionCandidates, unit.chapterId);
    if (extension) actions.push({ type: "extension", label: "解锁一步 MAIC-UI 拓展", primary: actions.length === 0, units: [extension] });
    actions.push({ type: "continue", label: "进入下一章", units: [] });
  }

  if (phase === "formative") {
    if (stats.accuracy !== null && stats.accuracy < AGENTIC_POST_REMEDIATION_THRESHOLD && rankedRelearnCandidates.length) {
      actions.push({ type: "remediate", label: "换一种 MAIC-UI 互动重学", primary: true, units: rankedRelearnCandidates.slice(0, 1) });
      actions.push({ type: "continue", label: "继续巩固主线", units: [] });
    } else if (stats.accuracy !== null && stats.accuracy >= AGENTIC_PRE_SKIP_THRESHOLD) {
      const extension = agenticFirstUnusedCandidate(rankedExtensionCandidates, unit.chapterId);
      if (extension) {
        actions.push({ type: "extension", label: "解锁一步 MAIC-UI 拓展", primary: true, units: [extension] });
        actions.push({ type: "continue", label: "继续主线", units: [] });
      }
    }
  }

  if (!actions.length) {
    const sceneChoicePlan = agenticBuildSceneChoicePlan(unit, remote);
    if (sceneChoicePlan) {
      const path = ensureAgenticPath();
      path.pendingPlan = sceneChoicePlan;
      path.pendingAt = unit.id;
      path.lastNarration = agenticStudentNarrationForPending(sceneChoicePlan);
      saveState();
      renderAll();
      return;
    }
    const next = agenticUnlockDefaultNext(unit.id, "quiz_no_special_plan");
    ensureAgenticPath().lastNarration = agenticNoSpecialPlanNarration(unit, next);
    if (next) ensureAgenticPath().oneStepExtension = null;
    saveState();
    renderAll();
    return;
  }

  const path = ensureAgenticPath();
  path.pendingPlan = {
    unitId: unit.id,
    chapterId: unit.chapterId,
    phase,
    stats,
    narration,
    provider: remote?.provider || "mock",
    agentDecisionId: remote?.decisionId || "",
    decisionCreatedAt: remote?.decisionCreatedAt || "",
    plan,
    actions,
    createdAt: beijingNow()
  };
  path.pendingAt = unit.id;
  path.lastNarration = agenticStudentNarrationForPending(path.pendingPlan);
  saveState();
  renderAll();
}

function agenticBuildPostRelearnExtensionPlan(detour, completedUnit) {
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
      { type: "extension", label: "解锁一步 MAIC-UI 拓展", primary: true, units: [extension] },
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
  if (unit.id === currentUnitId) renderAll();
}

function agenticOnUnitCompleted(unit) {
  if (!unit) return;
  const path = ensureAgenticPath();
  if (path.pendingPlan?.unitId === unit.id) return;
  if (unit.type === "quiz" && (unit.assessmentPhase === "pre" || unit.assessmentPhase === "post")) return;
  if (path.oneStepExtension?.unitId === unit.id) {
    const resumeId = path.oneStepExtension.resumeUnitId || agenticNextUnitIdAfter(path.oneStepExtension.fromUnitId);
    const fromUnitId = path.oneStepExtension.fromUnitId || unit.id;
    const isCrossChapter = agenticIsCrossChapterResume(fromUnitId, resumeId);
    path.oneStepExtension = null;
    agenticUnlockUnit(resumeId, isCrossChapter ? "advance_from_one_step_extension" : "return_from_one_step_extension");
    path.lastNarration = isCrossChapter
      ? `跨章预告已完成，进入下一章：${agenticUnitLabel(resumeId)}。`
      : `拓展一步已完成，回到主线：${agenticUnitLabel(resumeId)}。`;
    return { id: resumeId, label: agenticUnitLabel(resumeId) };
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
    }
    if (resumeId) agenticUnlockUnit(resumeId, "return_from_relearn_detour");
    path.lastNarration = resumeId ? `重学支线已完成，回到主线：${label}。` : "重学支线已完成。";
    return resumeId ? { id: resumeId, label } : null;
  }
  const adaptiveResume = agenticResumeAfterInsertedAdaptive(unit);
  if (adaptiveResume?.id) {
    agenticUnlockUnit(adaptiveResume.id, "return_from_adaptive_review");
    path.lastNarration = `这节 MAIC-UI 课件已经复习完成，回到主线：${adaptiveResume.label}。`;
    return adaptiveResume;
  }
  const sceneChoicePlan = agenticBuildSceneChoicePlan(unit);
  if (sceneChoicePlan) {
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
    continue: "按顺序巩固",
    remediate: "换方式重学",
    extension: "一步拓展"
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
      const hasExtension = Boolean(agenticUnusedExtensionCandidate(activeDetour.chapterId || unit.chapterId, "post_relearn_complete"));
      return hasExtension
        ? `当前是后测后的 MAIC-UI 重学「${unit.label}」。完成后我会先给出一步拓展选项，你可以选择跨章预告，也可以直接进入下一章；不会直接把你跳走。`
        : `当前是后测后的 MAIC-UI 重学「${unit.label}」。完成后本章就收束，下一步进入下一章。`;
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
      return `当前是 MAIC-UI 拓展「${unit.label}」。这一步是额外挑战，不会替代主线学习；先试一个新情境，再把它和本章核心概念连起来。${resumeText}`;
    }
    return `当前是 MAIC-UI 重学「${unit.label}」。这节用另一种交互方式补稳刚才暴露的卡点；重点是重新操作、重新解释，而不是只看一遍答案。${resumeText}`;
  }

  if (unit.assessmentPhase === "pre") {
    return submitted
      ? `前测已经提交。本节只用于定位已有基础；如果出现跳过建议，需要你确认后才会改变路径。${nextText}`
      : `当前是本章前测。按真实想法作答就好，结果只用来判断是否需要跳过已掌握内容，答错不会扣掉后续学习机会。`;
  }

  if (unit.assessmentPhase === "formative") {
    return submitted
      ? `形成性测验已经提交。我会根据这次小检查判断是否插入 MAIC-UI 重学或一步拓展；没有待选择建议时，就按已解锁路径继续。${nextText}`
      : `当前是形成性测验。它用来发现“刚学完但还没稳”的地方；提交后我会只在本节后面安排必要的重学或拓展。`;
  }

  if (unit.assessmentPhase === "post") {
    return submitted
      ? `后测已经提交。这一步用于收束本章证据；如果仍有卡点，我会提供重学或拓展二选一，选择拓展后就不再安排重学。${nextText}`
      : `当前是本章后测。先独立完成，再由 Coach 判断是否需要 MAIC-UI 重学、一步拓展，或直接进入下一章。`;
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

  return path?.lastNarration || nextText;
}

function agenticStudentNarrationForPending(pending) {
  const actions = pending?.actions || [];
  const phase = pending?.phase || "";
  const remediateAction = actions.find((action) => action.type === "remediate");
  const extensionAction = actions.find((action) => action.type === "extension");
  const skipAction = actions.find((action) => action.type === "skip");
  const continueAction = actions.find((action) => action.type === "continue");
  const hasRemediate = Boolean(remediateAction);
  const hasExtension = Boolean(extensionAction);
  const hasSkip = Boolean(skipAction);
  const continueLabel = continueAction?.label || "继续主线";

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
      ? `${reason}。下一节你可以选「${label}」，也可以走「${defaultLabel}」。选完后，Inside chapter 只显示你实际选择的路径。`
      : `${reason}。请选择下一节要进入的学习场景；选完后，Inside chapter 只显示你实际选择的路径。`;
  }

  if (phase === "post_relearn_complete") {
    const extensionLabel = agenticActionUnitLabel(extensionAction);
    return extensionLabel
      ? `你已经完成后测后的 MAIC-UI 重学。现在可以再做一步拓展「${extensionLabel}」，把刚补稳的想法迁移到新情境；也可以直接${continueLabel}。`
      : `你已经完成后测后的 MAIC-UI 重学。本章当前没有新的拓展可选，可以直接${continueLabel}。`;
  }

  if (phase === "post" && hasRemediate && hasExtension) {
    const relearnLabel = agenticActionUnitLabel(remediateAction);
    const extensionLabel = agenticActionUnitLabel(extensionAction);
    const targets = [relearnLabel ? `重学「${relearnLabel}」` : "", extensionLabel ? `拓展「${extensionLabel}」` : ""].filter(Boolean).join("，");
    return targets
      ? `后测已经完成。你可以在${targets}之间选一个，或者直接${continueLabel}。如果选择拓展，本章就不再安排重学。`
      : `后测已经完成。你可以二选一：先换一种 MAIC-UI 互动重学，或者直接做一步 MAIC-UI 拓展；选择拓展后，本章就不再安排重学。`;
  }

  if (phase === "post" && hasExtension) {
    const label = agenticActionUnitLabel(extensionAction);
    return label
      ? `后测已经完成。你的主线学习可以收束了；如果还想多挑战一步，可以解锁「${label}」，完成后再进入下一章。`
      : `后测已经完成。你的主线学习可以收束了；如果还想多挑战一步，可以解锁一节 MAIC-UI 拓展课。`;
  }

  if (phase === "post" && hasRemediate) {
    const label = agenticActionUnitLabel(remediateAction);
    return label
      ? `后测显示还有一个点值得补稳。我已把「${label}」放到本节后面，你可以换一种 MAIC-UI 互动方式再学一遍。`
      : "后测显示还有一个点值得补稳。我为你加了一节 MAIC-UI 互动重学课。";
  }

  if (phase === "post") {
    return `后测已经完成。本章当前没有新的 MAIC-UI 重学或拓展需要安排，可以${continueLabel}。`;
  }

  if (phase === "formative" && hasRemediate) {
    const label = agenticActionUnitLabel(remediateAction);
    return label
      ? `形成性测验显示这个知识点还需要换个角度稳一稳。我已把「${label}」加在本节后面，你可以先重学再回到主线。`
      : "形成性测验显示这个知识点还需要换个角度稳一稳。我为你加了一节 MAIC-UI 互动重学课。";
  }

  if (phase === "formative" && hasExtension) {
    const label = agenticActionUnitLabel(extensionAction);
    return label
      ? `形成性测验表现不错。你可以解锁一步拓展「${label}」，也可以直接继续主线。`
      : "形成性测验表现不错。你可以解锁一步 MAIC-UI 拓展，也可以直接继续主线。";
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
      ? `刚才这组题暴露出一个值得再稳一稳的点。我已经把「${label}」加在本节后面，你可以先换一种 MAIC-UI 互动方式再学一遍。`
      : "刚才这组题暴露出一个值得再稳一稳的点。我为你加了一节 MAIC-UI 互动重学课。";
  }
  if (hasExtension) {
    const label = agenticActionUnitLabel(extensionAction);
    return label
      ? `你刚才的表现已经可以向前多看一步。我把「${label}」作为本节后的可选拓展，完成后再回到主线。`
      : "你刚才的表现已经可以向前多看一步。我为你加了一节可选 MAIC-UI 拓展课。";
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

  try {
    if (type === "skip") {
      action.units.forEach((unit) => {
        path.skipped[unit.id] = true;
      });
      const lastSkipped = action.units[action.units.length - 1]?.id || pending.unitId;
      const target = agenticNextNonQuizMainUnitAfter(lastSkipped) || agenticNextMainUnitAfter(lastSkipped) || agenticNextMainUnitAfter(pending.unitId);
      targetId = target?.id || "";
      agenticUnlockUnit(targetId, "pretest_skip_accept");
      path.lastNarration = targetId
        ? `已跳过 ${action.units.length} 个掌握度较高的模块，先进入热身学习：${agenticUnitLabel(targetId)}，再做阶段检查。`
        : `已跳过 ${action.units.length} 个掌握度较高的模块。`;
      addLog(`接受 Agent 建议，跳过 ${action.units.length} 个已掌握模块。`);
    } else if (type === "scene") {
      targetId = action.units[0]?.id || pending.resumeUnitId || "";
      const targetUnit = findMainUnit(targetId);
      if (targetUnit?.flowKind === "adaptive") agenticRememberAdaptiveUse(targetId, pending.anchorUnitId || pending.unitId, { insertAfter: false });
      agenticUnlockUnit(targetId, "student_next_scene_choice");
      path.lastNarration = targetId
        ? `已选择下一节场景：${agenticUnitLabel(targetId)}。Inside chapter 只会显示你实际选择的学习路径。`
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
            resumeUnitId: pending.resumeUnitId || agenticNextUnitIdAfter(anchorUnitId)
          }
        : null;
      path.lastNarration = targetId
        ? `已切换到 MAIC-UI 重学：${label}。${afterRelearnText}`
        : "已记录换一种方式重学的选择。";
      addLog("接受 Agent 建议，换一种方式重新学习。 ");
    } else if (type === "extension") {
      targetId = action.units[0]?.id || "";
      path.chapterExtensionsUsed[pending.chapterId] = true;
      agenticRememberAdaptiveUse(targetId, pending.anchorUnitId || pending.unitId);
      agenticUnlockUnit(targetId, pending.phase === "interaction_scene_choice" ? "interaction_scene_choice_extension" : "chapter_extension_one_hop");
      const label = agenticActionUnitLabel(action) || agenticUnitLabel(targetId);
      path.oneStepExtension = {
        unitId: targetId,
        fromUnitId: pending.anchorUnitId || pending.unitId,
        resumeUnitId: pending.resumeUnitId || agenticNextUnitIdAfter(pending.anchorUnitId || pending.unitId)
      };
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
      addLog("接受 Agent 建议，只解锁一步拓展知识点。 ");
    } else {
      const anchorUnitId = pending.anchorUnitId || pending.unitId;
      targetId = pending.resumeUnitId || agenticNextUnitIdAfter(anchorUnitId) || agenticNextMainUnitAfter(anchorUnitId)?.id || "";
      agenticUnlockUnit(targetId, "student_continue_linear");
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
      skippedUnitIds: type === "skip" ? action.units.map((unit) => unit.id) : []
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
        skippedUnitIds: type === "skip" ? action.units.map((unit) => unit.id) : []
      }
    });
    path.pendingPlan = null;
    path.pendingAt = "";
    path.decisionInFlight = "";
    saveState();
    if (targetId) {
      await agenticOpenUnit(targetId);
    } else {
      renderAll();
    }
  } catch (error) {
    path.decisionInFlight = "";
    saveState();
    renderAgenticCoachPanel();
    addLog(`Agent 路径切换失败：${error.message || "请重试"}`);
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
        ? `当前是「${currentChapter?.label || "本章"}」。这里没有待选择的 Coach 建议，完成测验或当前小节后，我会根据本章表现更新下一步。`
        : agenticCurrentUnitNarration(currentUnit, path);
    const title = agenticCoachTitleForUnit(currentUnit);
    node.hidden = false;
    node.innerHTML = `
      <section class="agentic-coach-card calm">
        <div class="agentic-coach-header">
          <span>Agentic Coach</span>
          <strong>${escapeHtml(title)}</strong>
        </div>
        <p>${escapeHtml(narration)}</p>
      </section>
    `;
    return;
  }

  const inFlight = path.decisionInFlight || "";
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
        <span>Agentic Coach</span>
        <strong>选择你的下一步</strong>
      </div>
      <p>${escapeHtml(narration)}</p>
      <div class="agentic-actions">${actionButtons}</div>
    </section>
  `;
}
