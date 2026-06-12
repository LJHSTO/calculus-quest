// Bottom navigation, auth wiring, interaction tracking, and app startup.
function renderBottomNextButton() {
  const unit = getUnit();
  if (!unit) return;
  const all = currentNavigableUnits();
  const idx = all.findIndex(u => u.id === unit.id);
  const chapterIdx = curriculum.findIndex(c => c.id === unit.chapterId);
  const showPrev = idx > 0 || chapterIdx > 0;
  const showNext = (idx >= 0 && idx + 1 < all.length) || (chapterIdx >= 0 && chapterIdx + 1 < curriculum.length);
  if (!showPrev && !showNext) return;
  const wrapper = document.createElement("div");
  wrapper.className = "bottom-next-wrapper";
  if (showPrev) {
    const prevBtn = document.createElement("button");
    prevBtn.className = "button soft bottom-nav-btn bottom-nav-prev";
    prevBtn.type = "button";
    prevBtn.textContent = "← 上一节";
    prevBtn.addEventListener("click", goToPrevUnit);
    wrapper.appendChild(prevBtn);
  }
  if (showNext) {
    const nextBtn = document.createElement("button");
    nextBtn.className = "button primary bottom-nav-btn";
    nextBtn.type = "button";
    nextBtn.textContent = all[idx + 1]?.chapterId !== unit.chapterId ? "完成并跳到下一章 →" : "完成并跳到下一节 →";
    nextBtn.addEventListener("click", async () => {
      completeCurrentUnit();
      await goToNextUnit();
    });
    wrapper.appendChild(nextBtn);
  }
  els.lessonPlayer.appendChild(wrapper);
}


els.authAction?.addEventListener("click", () => {
  if (isSignedIn()) {
    logoutParticipant();
    return;
  }
  showLogin();
});

els.loginForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const nickname = els.nickname.value;
  els.loginFeedback.textContent = "正在进入学习...";
  els.loginForm.querySelector("button[type='submit']").disabled = true;
  try {
    await loginParticipant(nickname);
    els.loginFeedback.textContent = "";
  } catch (error) {
    els.loginFeedback.textContent = error.message || "登录失败，请稍后再试。";
  } finally {
    els.loginForm.querySelector("button[type='submit']").disabled = false;
  }
});

document.querySelector("#save-note").addEventListener("click", () => {
  state.note = els.reflectionNote.value.trim();
  addLog("保存了一条反思笔记。");
  trackLearningEvent("save_note", { noteLength: state.note.length });
  renderProgress();
});

document.querySelector("#reset-progress").addEventListener("click", () => {
  if (!confirm("确定要重置所有学习记录吗？此操作不可撤销，所有测验结果和进度将被清除。")) return;
  trackLearningEvent("reset_progress", {
    completed: state.completed.length,
    quizResults: (state.quizResults || []).length
  });
  state.completed = [];
  state.quizResults = [];
  state.quizDrafts = {};
  state.submittedQuizzes = [];
  state.recommendationsCollapsed = false;
  state.logs = ["已重置学习记录。"];
  state.note = "";
  currentChapterId = chapters[0].id;
  currentUnitId = "";
  saveState();
  if (isSignedIn()) syncLearningSnapshot("reset");
  renderAll();
});

// ==== Interaction Tracking System ====
const interactionQueue = [];
let interactionFlushTimer = null;
let interactionUnitStart = null;
let interactionUnitId = null;
let interactionHeartbeat = null;

function trackInteraction(eventType, data = {}) {
  if (!isSignedIn()) return;
  interactionQueue.push({
    eventType,
    data,
    url: location.href,
    ua: (navigator.userAgent || "").slice(0, 80)
  });
  if (interactionQueue.length >= 50) flushInteractions();
  else if (!interactionFlushTimer) {
    interactionFlushTimer = setTimeout(flushInteractions, 5000);
  }
}

async function flushInteractions() {
  interactionFlushTimer = null;
  if (interactionQueue.length === 0) return;
  const batch = interactionQueue.splice(0);
  for (const ev of batch) {
    try { await trackLearningEvent('interaction', ev); } catch {}
  }
}

function setupInteractionTracking() {
  if (!isSignedIn()) return;
  // Click tracking on navigation and data- elements
  document.addEventListener("click", (e) => {
    const el = e.target.closest("[data-view], [data-unit], .chapter-card, .lesson-card, .nav-button");
    if (el) {
      trackInteraction('click', {
        tag: el.tagName,
        text: (el.textContent || "").trim().slice(0, 40),
        view: el.dataset.view,
        unit: el.dataset.unit
      });
    }
  });
  // View change tracking (polling-based to avoid monkey-patching)
  let lastTrackedView = '';
  setInterval(() => {
    const active = document.querySelector('.view.active')?.id || '';
    if (active && active !== lastTrackedView) {
      trackInteraction('view_change', { view: active, prev: lastTrackedView });
      lastTrackedView = active;
    }
  }, 300);
  // Unit timing
  setInterval(() => {
    const currentUnit = document.querySelector('.lesson-card.active')?.dataset?.unit || '';
    if (currentUnit && currentUnit !== interactionUnitId) {
      if (interactionUnitId && interactionUnitStart) {
        const sec = Math.round((Date.now() - interactionUnitStart) / 1000);
        if (sec >= 5) trackInteraction('time_on_unit', { unitId: interactionUnitId, seconds: sec });
      }
      interactionUnitId = currentUnit;
      interactionUnitStart = Date.now();
    }
  }, 5000);
  // postMessage bridge for iframe content
  window.addEventListener("message", (event) => {
    if (event.data?.type === "interaction_track") {
      const unit = getUnit();
      trackInteraction(event.data.eventType || 'iframe_event', {
        unitId: unit?.id || currentUnitId,
        unitLabel: unit?.label || "",
        chapterId: unit?.chapterId || currentChapterId,
        ...(event.data.payload || {})
      });
    }
  });
  // Visibility change
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      if (interactionUnitId && interactionUnitStart) {
        const sec = Math.round((Date.now() - interactionUnitStart) / 1000);
        if (sec >= 5) trackInteraction('leave_unit', { unitId: interactionUnitId, seconds: sec });
      }
      trackInteraction('visibility', { hidden: true });
    } else {
      trackInteraction('visibility', { hidden: false });
    }
  });
  // Heartbeat
  clearInterval(interactionHeartbeat);
  interactionHeartbeat = setInterval(() => {
    trackInteraction('heartbeat', { view: document.querySelector('.view.active')?.id || '' });
  }, 30000);
  // Flush on unload
  window.addEventListener("beforeunload", flushInteractions);
}


async function init() {
  // Safety timeout: always hide loader after 8 seconds
  const safetyTimer = setTimeout(() => {
    document.getElementById("app-loader")?.classList.add("hidden");
  }, 8000);

  try {
    renderAuth();
    // Restore learning data from server if localStorage appears empty
    if (isSignedIn() && (!state.completed || !state.completed.length) && !(state.quizResults || []).length) {
      try {
        const r = await fetch("/api/learning/snapshot", {
          headers: { Authorization: `Bearer ${state.authToken}` }
        });
        if (r.ok) {
          const snap = await r.json();
          if (snap.ok && snap.snapshot) {
            Object.assign(state, learningDefaults(), snap.snapshot);
            saveState();
          }
        }
      } catch { /* server snapshot unavailable, use localStorage data */ }
    }
    await loadCourseIndex();
    buildCurriculum();
    renderAll();
    clearTimeout(safetyTimer);
    document.getElementById("app-loader")?.classList.add("hidden");
    await ensureChapterLoaded(currentChapterId);
    if (!currentUnitId) currentUnitId = getChapter().units[0]?.id || "";
    preloadChapterResources(currentChapterId);
    renderAll();
    scheduleChapterPrefetch();
    setupInteractionTracking();
  } catch (error) {
    clearTimeout(safetyTimer);
    document.getElementById("app-loader")?.classList.add("hidden");
    els.lessonPlayer.innerHTML = `
      <div class="empty-state">
        <h2>资源加载失败</h2>
        <p>请通过本地服务访问这个网站，而不是直接双击 HTML 文件。错误信息：${escapeHtml(error.message)}</p>
      </div>
    `;
  }
}

init();
