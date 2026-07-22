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
  const needsQuizSubmit = unit.type === "quiz" && !unit.placeholderQuiz && !(state.submittedQuizzes || []).includes(unit.id);
  const needsSceneChoice = unit.type === "knowledge" && !selectedKnowledgeSceneType(unit);
  nextBtn.disabled = needsSceneChoice;
  nextBtn.textContent = needsSceneChoice
    ? "先选择一个互动场景"
    : needsQuizSubmit
      ? "先提交测验"
      : pending
        ? "先选择下一步"
        : next
          ? `下一步：${next.label}`
          : "完成本节";
  nextBtn.addEventListener("click", async () => {
    if (pending) {
      addLog("请先在学习建议卡片中选择下一步。");
      if (typeof focusAgenticCoachPanel === "function") focusAgenticCoachPanel();
      else if (typeof renderAgenticCoachPanel === "function") renderAgenticCoachPanel();
      return;
    }

    const current = getUnit();
    if (current.type === "knowledge" && !selectedKnowledgeSceneType(current)) {
      addLog("请先选择一个互动场景，再完成本节。");
      return;
    }
    if (current.type === "quiz" && !current.placeholderQuiz && !(state.submittedQuizzes || []).includes(current.id)) {
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
  authMode = mode === "register" ? "register" : "login";
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
    els.registerPassword.value = "";
  }
  if (els.registerPasswordConfirm) {
    els.registerPasswordConfirm.required = authMode === "register";
    els.registerPasswordConfirm.value = "";
  }
  if (els.loginFeedback) els.loginFeedback.textContent = "";
  setTimeout(() => {
    if (authMode === "register") {
      if (els.registerPassword) els.registerPassword.value = "";
      if (els.registerPasswordConfirm) els.registerPasswordConfirm.value = "";
    }
    (authMode === "register" ? els.nickname || els.email : els.loginIdentifier)?.focus();
  }, 0);
  setTimeout(() => {
    if (authMode === "register" && document.activeElement !== els.registerPassword) {
      if (els.registerPassword) els.registerPassword.value = "";
      if (els.registerPasswordConfirm && document.activeElement !== els.registerPasswordConfirm) {
        els.registerPasswordConfirm.value = "";
      }
    }
  }, 250);
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
    analyticsTrack(currentMode === "register" ? "register_success" : "login_success", { source: "auth" });
    setupInteractionTracking();
    if (currentUnitId) analyticsEnterUnit(getUnit(currentUnitId), "login");
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
  if (!confirm("确定要重置所有学习记录吗？此操作不可撤销，所有测验结果和进度将被清除。")) return;
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
    logs: ["已重置学习记录。"],
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

function setChapterRailCollapsed(collapsed, options = {}) {
  const rail = document.getElementById("chapter-rail");
  const toggle = document.getElementById("chapter-rail-toggle");
  const shell = rail?.closest(".learning-shell");
  if (!rail || !toggle) return false;
  const shouldPersist = options.persist !== false;
  rail.classList.toggle("collapsed", collapsed);
  rail.setAttribute("aria-hidden", collapsed ? "true" : "false");
  shell?.classList.toggle("chapter-collapsed", collapsed);
  toggle.textContent = collapsed ? "章节" : "×";
  toggle.setAttribute("aria-expanded", collapsed ? "false" : "true");
  toggle.setAttribute("aria-label", collapsed ? "展开章节列表" : "关闭章节列表");
  toggle.setAttribute("title", collapsed ? "展开章节列表" : "关闭章节列表");
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

  setChapterRailCollapsed(true, { persist: false, focusCurrent: false });
  toggle.addEventListener("click", () => {
    const collapsed = !rail.classList.contains("collapsed");
    setChapterRailCollapsed(collapsed);
  });
  document.addEventListener("click", (event) => {
    if (rail.classList.contains("collapsed")) return;
    if (rail.contains(event.target) || toggle.contains(event.target)) return;
    setChapterRailCollapsed(true, { persist: false, focusCurrent: false });
  });
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || rail.classList.contains("collapsed")) return;
    setChapterRailCollapsed(true, { persist: false, focusCurrent: false });
    toggle.focus();
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
          showLogin("登录状态已过期，请重新登录后继续学习。");
        } else {
          console.warn("Learning snapshot restore failed:", error.message);
        }
      }
    }

    await loadCourseIndex();
    buildCurriculum();
    renderAll();
    setupChapterRailToggle();
    clearTimeout(safetyTimer);
    document.getElementById("app-loader")?.classList.add("hidden");

    await ensureChapterLoaded(currentChapterId);
    if (!currentUnitId) currentUnitId = getChapter().units[0]?.id || "";
    if (typeof ensureAgenticPath === "function") {
      ensureAgenticPath();
      const initialUnitId = getChapter()?.units?.[0]?.id || currentUnitId || "";
      if (typeof agenticUnlockUnit === "function" && (!currentUnitId || currentUnitId === initialUnitId || state.completed.includes(currentUnitId))) {
        agenticUnlockUnit(currentUnitId || initialUnitId, "initial_load");
      }
      if (typeof agenticGuardNavigation === "function" && currentUnitId && !agenticGuardNavigation(currentUnitId, { allowPrevious: true, silent: true })) {
        currentChapterId = chapters[0]?.id || "";
        currentUnitId = getChapter(currentChapterId)?.units?.[0]?.id || "";
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
