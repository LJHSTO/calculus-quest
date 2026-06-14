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

document.querySelector("#reset-progress").addEventListener("click", () => {
  if (!confirm("确定要重置所有学习记录吗？此操作不可撤销，所有测验结果和进度将被清除。")) return;
  trackLearningEvent("reset_progress", {
    completed: state.completed.length,
    quizResults: (state.quizResults || []).length
  });
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
  state.recommendationsCollapsed = false;
  state.logs = ["已重置学习记录。"];
  state.note = "";
  currentChapterId = chapters[0].id;
  currentUnitId = "";
  saveState();
  if (isSignedIn()) syncLearningSnapshot("reset");
  renderAll();
});

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
