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

  const nextBtn = document.createElement("button");
  nextBtn.className = "button primary bottom-nav-btn";
  nextBtn.type = "button";
  const needsQuizSubmit = unit.type === "quiz" && !unit.placeholderQuiz && !(state.submittedQuizzes || []).includes(unit.id);
  const needsSceneChoice = unit.type === "knowledge" && !selectedKnowledgeSceneType(unit);
  const pending = typeof agenticIsCurrentPending === "function" && agenticIsCurrentPending(unit.id);
  const returningToQuiz = typeof quizResourceReviewContext === "function"
    && Boolean(quizResourceReviewContext(unit.id));
  const cta = typeof agenticCompletionCta === "function"
    ? agenticCompletionCta(unit)
    : { label: state.completed.includes(unit.id) ? "复习并跳到下一节" : "完成本节并跳到下一节", disabled: false };
  const completionAllowed = typeof agenticUnitCompletionAllowed !== "function"
    || agenticUnitCompletionAllowed(unit.id);
  nextBtn.disabled = !returningToQuiz && (!completionAllowed || (!needsSceneChoice && !needsQuizSubmit && !pending && Boolean(cta.disabled)));
  nextBtn.textContent = returningToQuiz
    ? "返回测验"
    : !completionAllowed
    ? "未解锁：先接受学习建议"
    : needsSceneChoice
    ? "先选择一个互动场景"
    : needsQuizSubmit
      ? "先提交测验"
      : pending
        ? "先选择下一步"
        : cta.label;
  if (needsSceneChoice) {
    nextBtn.dataset.scrollKnowledgeScene = "true";
    nextBtn.setAttribute("aria-controls", "knowledge-scene-panel");
  }
  nextBtn.addEventListener("click", completeAndAdvanceCurrentUnit);
  wrapper.appendChild(nextBtn);

  els.lessonPlayer.appendChild(wrapper);
}

let authMode = "login";

function setProfileFeedback(message = "", tone = "muted") {
  if (!els.profileFeedback) return;
  els.profileFeedback.textContent = message;
  els.profileFeedback.dataset.tone = tone;
}

function clearProfileInvalidState() {
  [els.profileNickname, els.profileEmail].forEach((input) => {
    if (!input) return;
    input.removeAttribute("aria-invalid");
  });
}

function markProfileField(field = "") {
  const input = field === "nickname" ? els.profileNickname
    : field === "email" ? els.profileEmail
      : null;
  if (!input) return;
  input.setAttribute("aria-invalid", "true");
  input.focus();
  input.select?.();
}

function profileFieldFromError(error) {
  if (error?.field === "nickname" || error?.field === "email") return error.field;
  const message = error?.message || "";
  if (message.includes("昵称")) return "nickname";
  if (message.includes("邮箱")) return "email";
  return "";
}

function setAuthMode(mode) {
  const previousAuthMode = authMode;
  authMode = mode === "register" ? "register" : "login";
  const modeChanged = previousAuthMode !== authMode;
  if (els.loginForm) {
    els.loginForm.dataset.authFormMode = authMode;
    els.loginForm.classList.toggle("is-register", authMode === "register");
    els.loginForm.classList.toggle("is-login", authMode === "login");
  }
  document.querySelectorAll("[data-auth-mode]").forEach((button) => {
    button.classList.toggle("active", button.dataset.authMode === authMode);
    button.setAttribute("aria-selected", button.dataset.authMode === authMode ? "true" : "false");
  });
  document.querySelectorAll("[data-register-fields]").forEach((node) => {
    node.hidden = authMode !== "register";
  });
  document.querySelectorAll("[data-login-field]").forEach((node) => {
    node.hidden = authMode !== "login";
  });
  document.querySelectorAll("[data-login-note]").forEach((node) => {
    node.hidden = authMode !== "login";
  });
  document.querySelectorAll("[data-register-note]").forEach((node) => {
    node.hidden = authMode !== "register";
  });
  if (els.loginTitle) els.loginTitle.textContent = authMode === "register" ? "注册账号" : "登录账号";
  if (els.loginCopy) {
    els.loginCopy.textContent = authMode === "register"
      ? "创建一个学习账号，下次可以用昵称或邮箱回来继续。"
      : "输入注册时使用的昵称或邮箱，继续你的学习进度。";
  }
  if (els.loginSubmit) els.loginSubmit.textContent = authMode === "register" ? "注册并进入学习" : "登录";
  if (els.loginIdentifier) {
    els.loginIdentifier.required = authMode === "login";
    if (authMode === "register") els.loginIdentifier.value = "";
  }
  if (els.loginPassword) {
    els.loginPassword.required = authMode === "login";
    if (authMode === "register") els.loginPassword.value = "";
  }
  if (els.nickname) els.nickname.required = false;
  if (els.email) els.email.required = false;
  if (els.registerPassword) {
    els.registerPassword.required = authMode === "register";
    if (modeChanged && authMode !== "register") els.registerPassword.value = "";
  }
  if (els.registerPasswordConfirm) {
    els.registerPasswordConfirm.required = authMode === "register";
    if (modeChanged && authMode !== "register") els.registerPasswordConfirm.value = "";
  }
  if (els.loginFeedback) els.loginFeedback.textContent = "";
  setTimeout(() => {
    (authMode === "register" ? els.nickname || els.email : els.loginIdentifier)?.focus();
  }, 0);
}

document.querySelectorAll("[data-auth-mode]").forEach((button) => {
  button.addEventListener("click", () => setAuthMode(button.dataset.authMode));
});

els.authAction?.addEventListener("click", () => {
  setAuthMode("login");
  showLogin();
});

els.authMenuToggle?.addEventListener("click", (event) => {
  event.stopPropagation();
  setUserMenuOpen(els.authMenuPanel?.hidden ?? true);
});

els.authLogout?.addEventListener("click", async () => {
  if (els.authLogout.disabled) return;
  setUserMenuOpen(false);
  els.authLogout.disabled = true;
  try {
    await logoutParticipant();
    window.dispatchEvent(new CustomEvent("cq:participant-change", {
      detail: { participantId: "" }
    }));
  } catch (error) {
    console.warn("Logout failed:", error.message);
    alert(error.message || "退出失败，请稍后再试。");
  } finally {
    els.authLogout.disabled = false;
  }
});

els.authMenuPanel?.querySelectorAll("[data-view]").forEach((button) => {
  button.addEventListener("click", () => setUserMenuOpen(false));
});

document.addEventListener("click", (event) => {
  if (!els.userMenu || els.userMenu.hidden) return;
  if (!els.userMenu.contains(event.target)) setUserMenuOpen(false);
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") setUserMenuOpen(false);
});

els.loginForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const currentMode = els.loginForm?.dataset.authFormMode === "register" ? "register" : "login";
  authMode = currentMode;
  const password = currentMode === "register"
    ? els.registerPassword?.value || ""
    : els.loginPassword?.value || "";
  const credentials = currentMode === "register"
    ? {
        mode: "register",
        nickname: els.nickname?.value.trim() || "",
        email: els.email?.value.trim() || "",
        password
      }
    : {
        mode: "login",
        identifier: els.loginIdentifier?.value.trim() || "",
        password
      };
  if (currentMode === "register") {
    const confirmPassword = els.registerPasswordConfirm?.value || "";
    if (!credentials.nickname && !credentials.email) {
      els.loginFeedback.textContent = "注册时请至少填写昵称或邮箱其中一项。";
      return;
    }
    if (credentials.nickname && credentials.nickname.length < 2) {
      els.loginFeedback.textContent = "昵称需要 2-24 个字符。";
      return;
    }
    if (password !== confirmPassword) {
      els.loginFeedback.textContent = "两次输入的密码不一致。";
      return;
    }
  } else if (!credentials.identifier) {
    els.loginFeedback.textContent = "登录时请填写昵称或邮箱。";
    return;
  }
  if (password.length < 8) {
    els.loginFeedback.textContent = "密码需要至少 8 个字符。";
    return;
  }

  els.loginFeedback.textContent = currentMode === "register" ? "正在创建账号..." : "正在进入学习...";
  els.loginForm.querySelector("button[type='submit']").disabled = true;
  try {
    await loginParticipant(credentials);
    window.dispatchEvent(new CustomEvent("cq:participant-change", {
      detail: { participantId: state.participant?.participantId || "" }
    }));
    analyticsTrack(currentMode === "register" ? "register_success" : "login_success", { source: "auth" });
    setupInteractionTracking();
    if (currentUnitId) analyticsEnterUnit(getUnit(currentUnitId), "login");
    if (currentMode === "register") {
      if (els.registerPassword) els.registerPassword.value = "";
      if (els.registerPasswordConfirm) els.registerPasswordConfirm.value = "";
    } else if (els.loginPassword) {
      els.loginPassword.value = "";
    }
    els.loginFeedback.textContent = "";
  } catch (error) {
    els.loginFeedback.textContent = error.message || "登录失败，请稍后再试。";
  } finally {
    els.loginForm.querySelector("button[type='submit']").disabled = false;
  }
});

els.profileForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearProfileInvalidState();
  const nickname = els.profileNickname?.value.trim() || "";
  const email = els.profileEmail?.value.trim() || "";
  if (!nickname && !email) {
    setProfileFeedback("昵称和邮箱至少保留一个。", "error");
    markProfileField("nickname");
    return;
  }
  if (nickname && Array.from(nickname).length < 2) {
    setProfileFeedback("昵称需要 2-24 个字符。", "error");
    markProfileField("nickname");
    return;
  }
  if (nickname === (state.participant?.nickname || "") && email === (state.participant?.email || "")) {
    setProfileFeedback("账号信息没有变化。", "muted");
    return;
  }
  if (els.profileSave) els.profileSave.disabled = true;
  setProfileFeedback("正在保存...", "muted");
  try {
    await updateParticipantProfile({ nickname, email });
    clearProfileInvalidState();
    setProfileFeedback("已保存。", "ok");
    renderAll();
  } catch (error) {
    const field = profileFieldFromError(error);
    markProfileField(field);
    const suffix = error.status === 409 ? "本次修改没有保存，请换一个后再试。" : "";
    setProfileFeedback(`${error.message || "保存失败，请稍后再试。"}${suffix}`, "error");
  } finally {
    if (els.profileSave) els.profileSave.disabled = false;
  }
});

[els.profileNickname, els.profileEmail].forEach((input) => {
  input?.addEventListener("input", () => {
    input.removeAttribute("aria-invalid");
    if (els.profileFeedback?.dataset.tone === "error") setProfileFeedback("");
  });
});

document.querySelector("#reset-progress").addEventListener("click", async () => {
  setUserMenuOpen(false);
  if (!confirm("确定要开始一轮新的学习记录吗？当前进度、测验结果、知点对话和笔记将从学生端清空，历史研究记录会保留。")) return;
  const completedCount = state.completed.length;
  const quizResultCount = (state.quizResults || []).length;
  await trackLearningEvent("reset_progress", {
    completed: state.completed.length,
    quizResults: (state.quizResults || []).length
  }, false);
  analyticsTrack("reset_progress", {
    data: {
      completedCount,
      quizResultCount
    }
  });

  if (!isSignedIn()) return;
  if (!learningSnapshotReady) {
    try {
      await hydrateLearningState();
    } catch (error) {
      alert(error.message || "学习记录尚未完成同步，请重新登录后再重置。");
      return;
    }
  }

  await pauseLearningSnapshotSync();
  const firstChapterId = chapters[0]?.id || "V14-C1";
  const firstUnitId = getChapter(firstChapterId)?.units?.[0]?.id || "";
  const resetSnapshot = {
    ...learningDefaults(),
    participant: state.participant,
    currentChapterId: firstChapterId,
    currentUnitId: firstUnitId,
    currentView: "home",
    logs: ["已开始新一轮学习记录，历史研究数据已保留。"],
    capturedAt: beijingNow()
  };

  try {
    const payload = await apiRequest("api/learning/reset", {
      token: state.authToken,
      generation: learningSnapshotGeneration,
      baseRevision: learningSnapshotRevision,
      snapshot: resetSnapshot
    });
    setLearningSnapshotVersion(payload);
    if (typeof clearPreviewKnowledgeSceneSelections === "function") {
      clearPreviewKnowledgeSceneSelections();
    }
    window.KnowledgeAssistant?.resetLearningGeneration?.();
    Object.assign(state, learningDefaults(), resetSnapshot, {
      participant: state.participant,
      authToken: state.authToken
    });
    currentChapterId = firstChapterId;
    currentUnitId = firstUnitId;
    switchView("home");
    if (typeof ensureAgenticPath === "function") {
      ensureAgenticPath();
      if (typeof agenticUnlockUnit === "function") {
        agenticUnlockUnit(currentUnitId, "reset_initial_load");
      }
    }
    lastSnapshotJson = snapshotContentJson(learningSnapshot());
    persistStateLocally();
    renderAll();
  } catch (error) {
    console.warn("Learning reset sync failed:", error.message);
    alert(error.message || "学习记录重置失败，原记录已保留。");
  } finally {
    resumeLearningSnapshotSync();
  }
});

const CHAPTER_HOVER_OPEN_DELAY_MS = 120;
const CHAPTER_HOVER_CLOSE_DELAY_MS = 240;

function updateLearningRailToggle(toggle, { expanded, label }) {
  if (!toggle) return;
  const labelNode = toggle.querySelector("[data-learning-toggle-label]");
  if (labelNode && label) labelNode.textContent = label;
  toggle.classList.toggle("is-expanded", Boolean(expanded));
  toggle.dataset.state = expanded ? "expanded" : "collapsed";
}

function announceLearningLayoutChange(reason = "rail-change") {
  const shell = document.querySelector(".learning-shell");
  window.dispatchEvent(new CustomEvent("cq:learning-layout-change", {
    detail: {
      reason,
      lessonCollapsed: Boolean(shell?.classList.contains("lesson-collapsed")),
      chapterCollapsed: Boolean(shell?.classList.contains("chapter-collapsed"))
    }
  }));
}

function setChapterRailCollapsed(collapsed, options = {}) {
  const rail = document.getElementById("chapter-rail");
  const toggle = document.getElementById("chapter-rail-toggle");
  const shell = rail?.closest(".learning-shell");
  if (!rail || !toggle) return false;
  const shouldPersist = options.persist !== false;
  rail.classList.toggle("collapsed", collapsed);
  rail.setAttribute("aria-hidden", collapsed ? "true" : "false");
  shell?.classList.toggle("chapter-collapsed", collapsed);
  updateLearningRailToggle(toggle, { expanded: !collapsed, label: "章节" });
  toggle.setAttribute("aria-expanded", collapsed ? "false" : "true");
  toggle.setAttribute("aria-label", collapsed ? "展开章节列表" : "关闭章节列表");
  toggle.setAttribute(
    "title",
    collapsed ? "悬浮查看章节，点击可保持展开" : "点击收起章节列表"
  );
  announceLearningLayoutChange(collapsed ? "chapter-rail-collapsed" : "chapter-rail-expanded");
  if (shouldPersist) localStorage.setItem("chapterRailCollapsed", collapsed ? "1" : "0");
  if (!collapsed && options.focusCurrent !== false) {
    window.requestAnimationFrame(() => {
      rail.querySelector("[data-chapter].active")?.focus();
    });
  }
  return true;
}

function setupChapterRailToggle() {
  const rail = document.getElementById("chapter-rail");
  const toggle = document.getElementById("chapter-rail-toggle");
  if (!rail || !toggle) return;

  let hoverOpenTimer = null;
  let hoverCloseTimer = null;
  let pinnedOpen = false;
  const supportsHover = () => (
    window.matchMedia?.("(hover: hover) and (pointer: fine)")?.matches
    && window.innerWidth > 1180
  );
  const clearHoverTimers = () => {
    clearTimeout(hoverOpenTimer);
    clearTimeout(hoverCloseTimer);
    hoverOpenTimer = null;
    hoverCloseTimer = null;
  };
  const scheduleHoverOpen = (event) => {
    if (!supportsHover() || event?.pointerType === "touch") return;
    clearTimeout(hoverCloseTimer);
    clearTimeout(hoverOpenTimer);
    hoverOpenTimer = window.setTimeout(() => {
      if (document.querySelector("#knowledge-assistant-root.is-open")) return;
      setChapterRailCollapsed(false, { persist: false, focusCurrent: false });
    }, CHAPTER_HOVER_OPEN_DELAY_MS);
  };
  const scheduleHoverClose = (event) => {
    if (!supportsHover() || event?.pointerType === "touch" || pinnedOpen) return;
    clearTimeout(hoverOpenTimer);
    clearTimeout(hoverCloseTimer);
    hoverCloseTimer = window.setTimeout(() => {
      setChapterRailCollapsed(true, { persist: false, focusCurrent: false });
    }, CHAPTER_HOVER_CLOSE_DELAY_MS);
  };

  setChapterRailCollapsed(true, { persist: false, focusCurrent: false });
  toggle.addEventListener("pointerenter", scheduleHoverOpen);
  rail.addEventListener("pointerenter", scheduleHoverOpen);
  toggle.addEventListener("pointerleave", scheduleHoverClose);
  rail.addEventListener("pointerleave", scheduleHoverClose);
  toggle.addEventListener("click", () => {
    clearHoverTimers();
    const expanded = !rail.classList.contains("collapsed");
    if (expanded && !pinnedOpen) {
      pinnedOpen = true;
      setChapterRailCollapsed(false);
      return;
    }
    pinnedOpen = !expanded;
    setChapterRailCollapsed(expanded);
  });
  document.addEventListener("click", (event) => {
    if (rail.classList.contains("collapsed")) return;
    if (rail.contains(event.target) || toggle.contains(event.target)) return;
    pinnedOpen = false;
    clearHoverTimers();
    setChapterRailCollapsed(true, { persist: false, focusCurrent: false });
  });
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || rail.classList.contains("collapsed")) return;
    pinnedOpen = false;
    clearHoverTimers();
    setChapterRailCollapsed(true, { persist: false, focusCurrent: false });
    toggle.focus();
  });
  window.addEventListener("cq:knowledge-assistant-visibility", (event) => {
    if (!event.detail?.open) return;
    pinnedOpen = false;
    clearHoverTimers();
    setChapterRailCollapsed(true, { persist: false, focusCurrent: false });
  });
}

function setLessonRailCollapsed(collapsed, options = {}) {
  const rail = document.getElementById("lesson-rail");
  const toggle = document.getElementById("lesson-rail-toggle");
  const shell = rail?.closest(".learning-shell");
  if (!rail || !toggle) return false;
  const shouldPersist = options.persist !== false;
  rail.classList.toggle("collapsed", collapsed);
  rail.setAttribute("aria-hidden", collapsed ? "true" : "false");
  shell?.classList.toggle("lesson-collapsed", collapsed);
  updateLearningRailToggle(toggle, { expanded: !collapsed, label: "路径" });
  toggle.setAttribute("aria-expanded", collapsed ? "false" : "true");
  toggle.setAttribute("aria-label", collapsed ? "展开本章路径" : "收起本章路径");
  toggle.setAttribute("title", collapsed ? "展开本章路径" : "收起本章路径");
  announceLearningLayoutChange(collapsed ? "lesson-rail-collapsed" : "lesson-rail-expanded");
  if (shouldPersist) {
    try {
      localStorage.setItem("lessonRailCollapsed", collapsed ? "1" : "0");
    } catch {}
  }
  if (!collapsed && options.focusCurrent) {
    window.requestAnimationFrame(() => {
      rail.querySelector("[data-unit].active, .lesson-card.active, .lesson-cluster-card.active")?.focus?.();
    });
  }
  return true;
}

function setupLessonRailToggle() {
  const rail = document.getElementById("lesson-rail");
  const toggle = document.getElementById("lesson-rail-toggle");
  if (!rail || !toggle) return;

  let collapsed = false;
  try {
    collapsed = localStorage.getItem("lessonRailCollapsed") === "1";
  } catch {}
  if (document.querySelector("#knowledge-assistant-root.is-open")) collapsed = true;
  setLessonRailCollapsed(collapsed, { persist: false, focusCurrent: false });

  toggle.addEventListener("click", () => {
    setLessonRailCollapsed(!rail.classList.contains("collapsed"));
  });
  window.addEventListener("cq:knowledge-assistant-visibility", (event) => {
    if (!event.detail?.open) return;
    setLessonRailCollapsed(true, { persist: false, focusCurrent: false });
    setChapterRailCollapsed(true, { persist: false, focusCurrent: false });
  });
}

async function init() {
  const safetyTimer = setTimeout(() => {
    document.getElementById("app-loader")?.classList.add("hidden");
  }, 8000);

  try {
    renderAuth();
    if (isSignedIn()) {
      try {
        await hydrateLearningState();
      } catch (error) {
        if (error.status === 401) {
          state.authToken = "";
          learningSnapshotReady = false;
          localStorage.removeItem(AUTH_TOKEN_KEY);
          renderAuth();
          window.dispatchEvent(new CustomEvent("cq:participant-change", {
            detail: { participantId: "" }
          }));
          showLogin("登录状态已过期，请重新登录后继续学习。");
        } else {
          console.warn("Learning snapshot restore failed:", error.message);
        }
      }
    }

    await loadCourseIndex();
    buildCurriculum();
    renderAll();
    if (typeof setupLearningCanvasLayoutSync === "function") {
      setupLearningCanvasLayoutSync();
    }
    setupChapterRailToggle();
    setupLessonRailToggle();
    clearTimeout(safetyTimer);
    document.getElementById("app-loader")?.classList.add("hidden");

    await ensureChapterLoaded(currentChapterId);
    if (!currentUnitId) currentUnitId = getChapter().units[0]?.id || "";
    if (typeof ensureAgenticPath === "function") {
      ensureAgenticPath();
      if (typeof agenticGuardNavigation === "function" && currentUnitId && !agenticGuardNavigation(currentUnitId, { allowPrevious: true, silent: true })) {
        currentChapterId = chapters[0]?.id || "";
        currentUnitId = getChapter(currentChapterId)?.units?.[0]?.id || "";
      }
      if (typeof agenticRecoverInterruptedGrading === "function") {
        await agenticRecoverInterruptedGrading();
      }
    }

    setupInteractionTracking();
    if (isSignedIn()) analyticsEnterUnit(getUnit(currentUnitId), "initial_load");
    preloadChapterResources(currentChapterId);
    renderAll();
    scheduleChapterPrefetch();
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
