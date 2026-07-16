const feedbackUiState = {
  targets: [],
  selectedTargetId: "",
  lastUnitId: "",
  submitting: false
};

function currentFeedbackType() {
  return document.querySelector('input[name="feedback-type"]:checked')?.value || "learning_content";
}

function feedbackTargetsForCurrentUnit() {
  const unit = getUnit(currentUnitId);
  const types = unit?.type === "knowledge" ? knowledgeInteractionTypes(unit) : [];
  const selectedTypeId = unit?.type === "knowledge" ? selectedKnowledgeSceneType(unit) : "";
  return FeedbackTargets.buildCoursewareFeedbackTargets({
    unit,
    types,
    selectedTypeId,
    candidateForType: (typeId) => knowledgeResourceCandidate(unit, typeId),
    cleanTitle: (candidate) =>
      cleanStudentResourceTitle(candidate.title || candidate.file, unit.label)
  });
}

function selectedFeedbackTarget() {
  return feedbackUiState.targets.find((target) => target.id === feedbackUiState.selectedTargetId)
    || feedbackUiState.targets[0]
    || { id: "global", targetScope: "global" };
}

function renderFeedbackTargets() {
  const strip = document.querySelector("#feedback-target-strip");
  if (!strip) return;
  strip.innerHTML = feedbackUiState.targets.map((target) => `
    <button class="feedback-target-option" type="button"
      data-feedback-target="${escapeHtml(target.id)}"
      aria-pressed="${target.id === feedbackUiState.selectedTargetId ? "true" : "false"}">
      <span class="feedback-target-kicker">${target.isCurrent ? "当前课件" : target.targetScope === "global" ? "全部课件" : "同知识点课件"}</span>
      <strong>${escapeHtml(target.label)}</strong>
      <span>${escapeHtml(target.description || "")}</span>
    </button>
  `).join("");
}

function renderFeedbackPage() {
  const unit = getUnit(currentUnitId);
  const nextUnitId = unit?.id || "";
  feedbackUiState.targets = feedbackTargetsForCurrentUnit();
  const current = feedbackUiState.targets.find(
    (target) => target.isCurrent && target.targetScope === "courseware"
  );
  const contextChanged = feedbackUiState.lastUnitId !== nextUnitId;
  const selectedStillValid = feedbackUiState.targets.some(
    (target) => target.id === feedbackUiState.selectedTargetId
  );
  if (contextChanged || !selectedStillValid) {
    feedbackUiState.selectedTargetId = current?.id || "global";
  }
  feedbackUiState.lastUnitId = nextUnitId;

  const targetPanel = document.querySelector("#courseware-feedback-targets");
  if (targetPanel) targetPanel.hidden = currentFeedbackType() !== "courseware";
  renderFeedbackTargets();
}

function updateFeedbackCharacterCount() {
  const content = document.querySelector("#feedback-content")?.value || "";
  const counter = document.querySelector("#feedback-char-count");
  if (counter) counter.textContent = `${content.length} / 2000`;
}

function setFeedbackStatus(message = "", tone = "") {
  const status = document.querySelector("#feedback-form-status");
  if (!status) return;
  status.textContent = message;
  status.dataset.tone = tone;
}

async function submitLearningFeedback(event) {
  event.preventDefault();
  if (feedbackUiState.submitting) return;

  const contentNode = document.querySelector("#feedback-content");
  const submitButton = document.querySelector("#submit-feedback");
  const content = contentNode?.value.trim() || "";
  if (!content) {
    setFeedbackStatus("请填写反馈内容。", "error");
    contentNode?.focus();
    return;
  }

  const target = currentFeedbackType() === "courseware"
    ? selectedFeedbackTarget()
    : { targetScope: "global" };
  const currentUnit = getUnit(currentUnitId);
  feedbackUiState.submitting = true;
  if (submitButton) submitButton.disabled = true;
  setFeedbackStatus("正在提交…", "");

  try {
    await apiRequest("/api/learning/feedback", {
      feedbackType: currentFeedbackType(),
      content,
      targetScope: target.targetScope || "global",
      chapterId: target.chapterId || currentChapterId || "",
      moduleId: target.moduleId || currentUnit?.moduleId || "",
      unitId: target.unitId || currentUnitId || "",
      knowledgePoint: target.knowledgePoint || currentUnit?.label || "",
      sceneType: target.sceneType || "",
      resourceFile: target.resourceFile || "",
      resourceTitle: target.resourceTitle || "",
      currentView
    });
    contentNode.value = "";
    updateFeedbackCharacterCount();
    setFeedbackStatus("反馈已提交，谢谢你的建议。", "ok");
  } catch (error) {
    setFeedbackStatus(error.message || "提交失败，请稍后重试。", "error");
  } finally {
    feedbackUiState.submitting = false;
    if (submitButton) submitButton.disabled = false;
  }
}

document.querySelectorAll('input[name="feedback-type"]').forEach((input) => {
  input.addEventListener("change", () => {
    setFeedbackStatus("");
    renderFeedbackPage();
  });
});

document.querySelector("#feedback-content")?.addEventListener("input", () => {
  updateFeedbackCharacterCount();
  const status = document.querySelector("#feedback-form-status");
  if (status?.dataset.tone === "error") setFeedbackStatus("");
});

let feedbackDrag = null;
const feedbackTargetStrip = document.querySelector("#feedback-target-strip");

feedbackTargetStrip?.addEventListener("click", (event) => {
  if (feedbackDrag?.moved) return;
  const targetId = FeedbackTargets.feedbackTargetIdFromPointer(event.target, feedbackDrag);
  if (!targetId) return;
  feedbackUiState.selectedTargetId = targetId;
  setFeedbackStatus("");
  renderFeedbackTargets();
});

feedbackTargetStrip?.addEventListener("pointerdown", (event) => {
  feedbackDrag = {
    pointerId: event.pointerId,
    startTargetId: FeedbackTargets.feedbackTargetIdFromPointer(event.target),
    startX: event.clientX,
    scrollLeft: feedbackTargetStrip.scrollLeft,
    moved: false
  };
  feedbackTargetStrip.setPointerCapture(event.pointerId);
});

feedbackTargetStrip?.addEventListener("pointermove", (event) => {
  if (!feedbackDrag || feedbackDrag.pointerId !== event.pointerId) return;
  const delta = event.clientX - feedbackDrag.startX;
  if (Math.abs(delta) > 5) feedbackDrag.moved = true;
  feedbackTargetStrip.scrollLeft = feedbackDrag.scrollLeft - delta;
});

function finishFeedbackDrag(event) {
  if (!feedbackDrag || feedbackDrag.pointerId !== event.pointerId) return;
  if (feedbackTargetStrip.hasPointerCapture(event.pointerId)) {
    feedbackTargetStrip.releasePointerCapture(event.pointerId);
  }
  window.setTimeout(() => { feedbackDrag = null; }, 0);
}

feedbackTargetStrip?.addEventListener("pointerup", finishFeedbackDrag);
feedbackTargetStrip?.addEventListener("pointercancel", finishFeedbackDrag);
document.querySelector("#learning-feedback-form")?.addEventListener("submit", submitLearningFeedback);

updateFeedbackCharacterCount();
renderFeedbackPage();
