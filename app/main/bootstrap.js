// Bottom navigation, auth wiring, interaction tracking, and app startup.
function renderBottomNextButton() {
  const unit = getUnit();
  if (!unit) return;

  const wrapper = document.createElement("div");
  wrapper.className = "bottom-next-wrapper";

  const previous = typeof agenticPreviousUnlockedUnitBefore === "function"
    ? agenticPreviousUnlockedUnitBefore(unit.id)
    : null;
  if (previous) {
    const prevBtn = document.createElement("button");
    prevBtn.className = "button soft bottom-nav-btn bottom-nav-prev";
    prevBtn.type = "button";
    prevBtn.textContent = "上一节";
    prevBtn.addEventListener("click", goToPrevUnit);
    wrapper.appendChild(prevBtn);
  }

  const pending = typeof agenticIsCurrentPending === "function" && agenticIsCurrentPending(unit.id);
  const next = typeof agenticNextUnlockedUnitAfter === "function" ? agenticNextUnlockedUnitAfter(unit.id) : null;

  const nextBtn = document.createElement("button");
  nextBtn.className = "button primary bottom-nav-btn";
  nextBtn.type = "button";
  const needsQuizSubmit = unit.type === "quiz" && !(state.submittedQuizzes || []).includes(unit.id);
  nextBtn.textContent = needsQuizSubmit ? "先提交测验" : pending ? "先选择下一步" : next ? `下一步：${next.label}` : "完成本节";
  nextBtn.addEventListener("click", async () => {
    if (pending) {
      addLog("请先在 Coach 卡片中选择下一步。");
      if (typeof focusAgenticCoachPanel === "function") focusAgenticCoachPanel();
      else if (typeof renderAgenticCoachPanel === "function") renderAgenticCoachPanel();
      return;
    }

    const current = getUnit();
    if (current.type === "quiz" && !(state.submittedQuizzes || []).includes(current.id)) {
      addLog("测验需要先提交，下一步才会出现。");
      return;
    }

    const agenticNext = typeof agenticOnUnitCompleted === "function" ? agenticOnUnitCompleted(current) : null;
    if (completeCurrentUnit() === false) return;
    if (typeof agenticIsCurrentPending === "function" && agenticIsCurrentPending(current.id)) {
      if (typeof focusAgenticCoachPanel === "function") focusAgenticCoachPanel();
      else if (typeof renderAgenticCoachPanel === "function") renderAgenticCoachPanel();
      return;
    }
    if (agenticNext?.id && typeof agenticOpenUnit === "function") {
      await agenticOpenUnit(agenticNext.id);
      return;
    }
    await goToNextUnit();
  });
  wrapper.appendChild(nextBtn);

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
    analyticsTrack("login_success", { source: "auth" });
    setupInteractionTracking();
    if (currentUnitId) analyticsEnterUnit(getUnit(currentUnitId), "login");
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
  analyticsTrack("reflection_save", { data: { noteLength: state.note.length } });
  renderProgress();
});

document.querySelector("#reset-progress").addEventListener("click", async () => {
  if (!confirm("确定要重置所有学习记录吗？此操作不可撤销，所有测验结果和进度将被清除。")) return;
  trackLearningEvent("reset_progress", {
    completed: state.completed.length,
    quizResults: (state.quizResults || []).length
  }, false);
  analyticsTrack("reset_progress", {
    data: {
      completedCount: state.completed.length,
      quizResultCount: (state.quizResults || []).length
    }
  });
  state.completed = [];
  state.quizResults = [];
  state.quizDrafts = {};
  state.submittedQuizzes = [];
  state.narrationCollapsed = false;
  state.logs = ["已重置学习记录。"];
  state.note = "";
  state.agenticPath = null;
  currentChapterId = chapters[0].id;
  currentUnitId = getChapter(currentChapterId)?.units?.[0]?.id || "A1-scene-1";
  if (typeof ensureAgenticPath === "function") {
    ensureAgenticPath();
    if (typeof agenticUnlockUnit === "function") agenticUnlockUnit(currentUnitId, "reset_initial_load");
  }
  saveState();
  if (isSignedIn()) {
    clearTimeout(syncTimer);
    const snapshot = learningSnapshot();
    lastSnapshotJson = JSON.stringify(snapshot);
    try {
      await apiRequest("/api/learning/reset", {
        token: state.authToken,
        snapshot
      });
    } catch (error) {
      console.warn("Learning reset sync failed:", error.message);
      addLog("本地已重置，但服务器记录清空失败；请稍后再试一次重置。");
    }
  }
  renderAll();
});

function setupChapterRailToggle() {
  const rail = document.getElementById("chapter-rail");
  const toggle = document.getElementById("chapter-rail-toggle");
  const shell = rail?.closest(".learning-shell");
  if (!rail || !toggle) return;

  const applyState = (collapsed) => {
    rail.classList.toggle("collapsed", collapsed);
    shell?.classList.toggle("chapter-collapsed", collapsed);
    toggle.textContent = collapsed ? ">" : "<";
    toggle.setAttribute("aria-label", collapsed ? "展开章节列表" : "折叠章节列表");
    toggle.setAttribute("title", collapsed ? "展开章节列表" : "折叠章节列表");
  };

  applyState(localStorage.getItem("chapterRailCollapsed") !== "0");
  toggle.addEventListener("click", () => {
    const collapsed = !rail.classList.contains("collapsed");
    applyState(collapsed);
    localStorage.setItem("chapterRailCollapsed", collapsed ? "1" : "0");
  });
}
async function init() {
  const safetyTimer = setTimeout(() => {
    document.getElementById("app-loader")?.classList.add("hidden");
  }, 8000);

  try {
    renderAuth();
    if (isSignedIn() && (!state.completed || !state.completed.length) && !(state.quizResults || []).length) {
      try {
        const response = await fetch("/api/learning/snapshot", {
          headers: { Authorization: `Bearer ${state.authToken}` }
        });
        if (response.ok) {
          const snap = await response.json();
          if (snap.ok && snap.snapshot) {
            Object.assign(state, learningDefaults(), snap.snapshot);
            saveState();
          }
        }
      } catch {
        // Server snapshot is optional; local state is enough for the demo.
      }
    }

    await loadCourseIndex();
    buildCurriculum();
    renderAll();
    setupChapterRailToggle();
    clearTimeout(safetyTimer);
    document.getElementById("app-loader")?.classList.add("hidden");

    await ensureChapterLoaded(currentChapterId);
    if (!currentUnitId) currentUnitId = getChapter().units[0]?.id || "A1-scene-1";
    if (typeof ensureAgenticPath === "function") {
      ensureAgenticPath();
      if (typeof agenticUnlockUnit === "function" && (!currentUnitId || currentUnitId === "A1-scene-1" || state.completed.includes(currentUnitId))) {
        agenticUnlockUnit(currentUnitId || "A1-scene-1", "initial_load");
      }
      if (typeof agenticGuardNavigation === "function" && currentUnitId && !agenticGuardNavigation(currentUnitId, { allowPrevious: true, silent: true })) {
        currentChapterId = "A1";
        currentUnitId = "A1-scene-1";
      }
    }

    if (isSignedIn()) analyticsEnterUnit(getUnit(currentUnitId), "initial_load");
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
