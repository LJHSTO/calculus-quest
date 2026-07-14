// Earth Online decorative UI sync.
// Display-only layer: does not alter quiz DOM, data-* attributes, events, or render logic.
(function () {
  function escape(value = "") {
    if (typeof escapeHtml === "function") return escapeHtml(value);
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }

  function missionTypeLabel(kind = "mission") {
    return {
      scan: "Knowledge Scan",
      boss: "Boss Challenge",
      challenge: "Practice Challenge",
      experiment: "Experiment Mission",
      knowledge: "Knowledge Mission",
      mission: "Current Mission"
    }[kind] || "Current Mission";
  }

  function renderHud(game) {
    const node = document.querySelector("#earth-online-hud");
    if (!node) return;
    const explorer = game.explorer;
    node.innerHTML = `
      <div><span>Explorer</span><strong>Lv.${explorer.level}</strong></div>
    `;
  }

  function missionActionLabel(mission) {
    if (!mission) return "等待任务加载";
    if (mission.kind === "scan") return "启动 Knowledge Scan";
    if (mission.kind === "boss") return "Boss Challenge";
    if (mission.kind === "experiment") return "完成交互实验";
    if (mission.kind === "challenge") return "完成探索挑战";
    return mission.title || "继续当前任务";
  }

  function recommendedActionLabel(mission) {
    if (!mission) return "Knowledge Scan";
    if (mission.kind === "scan") return "Knowledge Scan";
    if (mission.kind === "boss") return "Boss Challenge";
    if (mission.kind === "challenge") return "Challenge";
    if (mission.kind === "knowledge" || mission.kind === "experiment") return "Interactive Mission";
    return "Review Mission";
  }

  function renderMission(game) {
    const node = document.querySelector("#earth-current-mission");
    if (!node) return;
    const mission = game.currentMission;
    const explorer = game.explorer;
    const activeRegion = game.regions.find((region) => region.active) || game.regions[0];
    const recovery = explorer.worldRecovery || 0;
    const title = document.querySelector("#home-view .hero-copy h1");
    if (title) title.innerHTML = `${escape(activeRegion?.name || "函数平原")}<small>${escape(activeRegion?.subtitle || "Function Plains")}</small>`;
    const startButton = document.querySelector("#home-view .hero-actions .button.primary");
    if (startButton) startButton.textContent = explorer.completedCount ? "继续探索" : "开始探索";
    node.innerHTML = `
      <div class="explorer-panel-title">
        <span>EARTH ONLINE</span>
        <strong>Explorer Lv.${explorer.level}</strong>
      </div>
      <div class="world-recovery">
        <div><span>World Recovery</span><strong>${recovery}%</strong></div>
        <i><b style="width:${recovery}%"></b></i>
      </div>
      <dl class="explorer-panel-mission">
        <div><dt>Current Region</dt><dd>Earth Online<br><small>微积分觉醒计划</small></dd></div>
        <div><dt>Current Area</dt><dd>${escape(activeRegion?.name || "函数平原")}<br><small>${escape(activeRegion?.subtitle || "Function Plains")}</small></dd></div>
        <div><dt>Main Mission</dt><dd>${escape(missionActionLabel(mission))}</dd></div>
        <div><dt>Recommended</dt><dd>${escape(recommendedActionLabel(mission))}</dd></div>
      </dl>
    `;
  }

  function renderMissionBrief(game) {
    const node = document.querySelector("#earth-mission-brief");
    if (!node) return;
    node.innerHTML = `
      <div class="mission-brief-head compact">
        <span>Mission Brief</span>
        <strong>Earth Online</strong>
      </div>
      <p class="mission-brief-lore">Earth Online是一颗由知识驱动运行的数字地球。Calculus Core正等待恢复。</p>
    `;
  }

  let awakeningStartedKey = "";

  function awakeningStorageKey() {
    const participantId = state?.participant?.participantId || state?.participant?.id || "";
    return participantId ? `hasAwakenedEarthOnlineBootV3:${participantId}` : "";
  }

  function startAwakening() {
    const overlay = document.querySelector("#earth-awakening");
    const output = document.querySelector("#earth-boot-type");
    const button = document.querySelector("#earth-boot-continue");
    if (!overlay || !output || !button) return;
    const bootKey = awakeningStorageKey();
    if (!bootKey) {
      overlay.hidden = true;
      overlay.classList.add("is-dismissed");
      awakeningStartedKey = "";
      return;
    }
    if (awakeningStartedKey === bootKey) return;
    awakeningStartedKey = bootKey;
    overlay.classList.remove("is-dismissed", "is-complete");
    overlay.hidden = false;
    if (localStorage.getItem(bootKey) === "true") {
      overlay.classList.add("is-dismissed");
      overlay.hidden = true;
      return;
    }

    const lines = [
      "SYSTEM BOOT...",
      "Connecting Earth Online...",
      "Identity Verification...",
      "Explorer Authentication Passed.",
      "Synchronizing Calculus Core...",
      "Warning. Critical Failure Detected.",
      "",
      "【系统广播】",
      "Explorer，请立即响应。",
      "这里是 Earth Online 中央控制系统。",
      "由于未知异常，维持数学大陆运行的 Calculus Core 正在持续失稳。",
      "函数平原的数据坐标正在消失。",
      "极限峡谷的空间边界已经断裂。",
      "导数高塔停止计算。",
      "积分能源中心失去供能。",
      "如果 Calculus Core 完全停止运行，Earth Online 将永久关闭。",
      "系统检测到你拥有 Explorer 权限。",
      "从现在开始，你将承担修复 Earth Online 的任务。",
      "每完成一次学习，都会修复世界的一部分。",
      "每掌握一个知识点，都会点亮新的区域。",
      "最终，重新启动 Calculus Core。",
      "",
      "当前任务：前往 Function Plains，启动第一次 Knowledge Scan。"
    ];
    const text = lines.join("\n");
    let index = 0;
    output.textContent = "";
    const timer = window.setInterval(() => {
      output.textContent += text[index] || "";
      index += 1;
      if (index >= text.length) {
        window.clearInterval(timer);
        button.hidden = false;
      }
    }, 22);

    button.onclick = () => {
      localStorage.setItem(bootKey, "true");
      overlay.classList.add("is-complete");
      window.setTimeout(() => {
        overlay.hidden = true;
      }, 620);
    };
  }

  function renderRegions(game) {
    const node = document.querySelector("#earth-region-map");
    if (!node) return;
    const regions = game.regions.slice(0, 11);
    const positions = [
      { x: 50, y: 55, size: "large" },
      { x: 38, y: 43, size: "medium" },
      { x: 58, y: 39, size: "medium" },
      { x: 63, y: 56, size: "medium" },
      { x: 43, y: 67, size: "small" },
      { x: 55, y: 70, size: "small" },
      { x: 68, y: 46, size: "small" },
      { x: 34, y: 58, size: "small" },
      { x: 65, y: 66, size: "small" },
      { x: 45, y: 34, size: "small" },
      { x: 51, y: 48, size: "medium" }
    ];
    node.innerHTML = `
      <div class="earth-map-title">
        <span>EARTH ONLINE</span>
        <strong>微积分觉醒计划</strong>
        <small>Calculus Awakening</small>
        <em>Restore Earth's Knowledge Network</em>
      </div>
      <div class="earth-map-planet" aria-hidden="true">
        <span class="earth-map-continent c1"></span>
        <span class="earth-map-continent c2"></span>
        <span class="earth-map-continent c3"></span>
        <span class="earth-map-energy e1"></span>
        <span class="earth-map-energy e2"></span>
      </div>
      <svg class="earth-map-paths" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        <path d="M46 58 C36 52 34 47 30 42 S48 32 62 34 S71 50 70 66 S50 78 38 74 S60 46 78 46" />
      </svg>
      ${regions.map((region, index) => {
        const pos = positions[index] || positions[positions.length - 1];
        const state = region.active ? "当前探索" : region.unlocked ? `${region.progress}% repaired` : "需要解锁";
        const nodeState = region.progress >= 100 ? "complete" : index === 3 ? "boss" : "";
        return `
          <article class="earth-map-node ${pos.size} ${nodeState} ${region.active ? "active" : ""} ${region.unlocked ? "" : "locked"}" style="--x:${pos.x}%; --y:${pos.y}%; --node-index:${index}">
            <i aria-hidden="true"></i>
            <span>${escape(region.name)}</span>
            <strong>${escape(region.subtitle)}</strong>
            <small>${escape(state)}</small>
          </article>
        `;
      }).join("")}
      <div class="earth-mini-map" aria-hidden="true">
        <span></span><span></span><span></span>
      </div>
    `;
  }

  function rememberLearningModeChoice(event) {
    const choice = event.target.closest("[data-knowledge-scene]");
    if (!choice) return;
    const unitId = choice.dataset.unit || (typeof currentUnitId !== "undefined" ? currentUnitId : "");
    if (!unitId) return;
    try {
      sessionStorage.setItem(`eoLearningModeChosen:${unitId}`, "true");
    } catch {
      // Decorative state only.
    }
  }

  function rememberPostQuizContinue(event) {
    const action = event.target.closest("[data-agentic-action]");
    if (!action) return;
    if (action.dataset.agenticAction !== "continue") return;
    try {
      const unit = typeof getUnit === "function" ? getUnit(currentUnitId) : null;
      if (
        unit?.type === "quiz"
        && unit?.assessmentPhase === "post"
        && state?.submittedQuizzes?.includes(unit.id)
      ) {
        pendingCompletedUnitId = unit.id;
        sessionStorage.setItem("eoPendingRegionClearUnitId", unit.id);
      }
    } catch {
      // Decorative state only.
    }
  }

  function regionClearCopy(region, recovery) {
    const name = region?.subtitle || "Function Plains";
    const zh = region?.name || "函数平原";
    const messages = {
      "Function Plains": ["函数平原的数据坐标已恢复。", "你已经掌握了函数变化的基础规律。", "地表坐标网重新点亮。"],
      "Derivative Tower": ["导数高塔重新开始计算。", "你已经掌握了瞬时变化率与切线系统。", "地球的速度感知模块正在恢复。"],
      "Integral Energy Core": ["积分能源中心重新供能。", "你已经掌握了累积量与面积系统。", "Calculus Core 的能源循环开始稳定。"],
      "Gradient Highlands": ["梯度高原的方向场已被校准。", "你已经掌握了多元变化与最陡方向。", "路径导航系统恢复。"],
      "Optimization Nexus": ["优化中枢恢复决策能力。", "你已经掌握了极值、二阶信息与下降策略。", "Earth Online 的策略系统重新上线。"],
      "ML Research Lab": ["AI训练核心重新启动。", "你已经掌握了约束优化与学习系统的数学基础。", "Earth Online 正接近完全恢复。"]
    }[name] || [`${zh} 区域修复完成。`, "你已经掌握了本区域的核心能力。", "Calculus Core 稳定度提升。"];
    return [
      "SYSTEM TRANSMISSION...",
      "Explorer，信号已恢复。",
      "",
      `${zh} 区域修复完成。`,
      ...messages,
      "",
      "Region Restored",
      "+120 Knowledge Energy",
      "+3 Skill Points",
      `Earth Online 修复进度：${recovery}%`,
      "",
      "继续探索。"
    ];
  }

  let regionClearRunning = false;
  let pendingCompletedUnitId = "";

  function maybeShowRegionClear(game) {
    if (regionClearRunning || !game?.regions?.length) return;
    let completedUnit = null;
    let currentChapter = null;
    try {
      const storedPendingUnitId = pendingCompletedUnitId || sessionStorage.getItem("eoPendingRegionClearUnitId") || "";
      completedUnit = storedPendingUnitId && typeof getUnit === "function" ? getUnit(storedPendingUnitId) : null;
      currentChapter = typeof getChapter === "function" ? getChapter(completedUnit?.chapterId || currentChapterId) : null;
    } catch {
      currentChapter = null;
    }
    if (!currentChapter?.id || !Array.isArray(currentChapter.units) || !currentChapter.units.length) return;
    const isReviewingSubmittedPostQuiz = !pendingCompletedUnitId
      && currentView === "learn"
      && completedUnit === null
      && typeof getUnit === "function"
      && (() => {
        const unit = getUnit(currentUnitId);
        return unit?.chapterId === currentChapter.id
          && unit?.type === "quiz"
          && unit?.assessmentPhase === "post"
          && state?.submittedQuizzes?.includes(unit.id);
      })();
    if (isReviewingSubmittedPostQuiz) return;
    const requiredUnits = currentChapter.units.filter((unit) => {
      try {
        return typeof unitCountsTowardProgress !== "function" || unitCountsTowardProgress(unit);
      } catch {
        return true;
      }
    });
    if (!requiredUnits.length) return;
    const bossComplete = completedUnit?.chapterId === currentChapter.id
      && completedUnit?.type === "quiz"
      && completedUnit?.assessmentPhase === "post"
      && state?.completed?.includes(completedUnit.id);
    const complete = bossComplete || requiredUnits.every((unit) => state?.completed?.includes(unit.id));
    if (!complete) return;
    const key = `regionClearShownV2:${currentChapter.id}`;
    try {
      if (localStorage.getItem(key) === "true") return;
    } catch {
      return;
    }

    const overlay = document.querySelector("#earth-region-clear");
    const title = document.querySelector("#region-clear-title");
    const output = document.querySelector("#region-clear-type");
    const button = document.querySelector("#region-clear-continue");
    if (!overlay || !title || !output || !button) return;

    const region = game.regions.find((item) => item.id === currentChapter.id)
      || game.regions.find((item) => item.active)
      || game.regions[1]
      || game.regions[0];
    title.textContent = `${region?.name || "区域"} Restored`;
    output.textContent = "";
    button.hidden = true;
    overlay.hidden = false;
    regionClearRunning = true;

    const text = regionClearCopy(region, game.explorer?.worldRecovery || 0).join("\n");
    let index = 0;
    const timer = window.setInterval(() => {
      output.textContent += text[index] || "";
      index += 1;
      if (index >= text.length) {
        window.clearInterval(timer);
        button.hidden = false;
      }
    }, 20);

    button.onclick = () => {
      pendingCompletedUnitId = "";
      try {
        sessionStorage.removeItem("eoPendingRegionClearUnitId");
      } catch {
        // Presentation only.
      }
      try {
        localStorage.setItem(key, "true");
      } catch {
        // Presentation only.
      }
      overlay.classList.add("is-complete");
      window.setTimeout(() => {
        overlay.hidden = true;
        overlay.classList.remove("is-complete");
        regionClearRunning = false;
      }, 520);
    };
  }

  function hookCompleteCurrentUnit() {
    if (typeof window.completeCurrentUnit !== "function" || window.completeCurrentUnit.__earthOnlineHooked) return;
    const original = window.completeCurrentUnit;
    const wrapped = function (...args) {
      let unit = null;
      try {
        unit = typeof getUnit === "function" ? getUnit(currentUnitId) : null;
      } catch {
        unit = null;
      }
      pendingCompletedUnitId = unit?.id || "";
      const result = original.apply(this, args);
      if (result === false) pendingCompletedUnitId = "";
      return result;
    };
    wrapped.__earthOnlineHooked = true;
    window.completeCurrentUnit = wrapped;
  }

  function hookAgenticCoachPanel() {
    if (typeof window.renderAgenticCoachPanel !== "function" || window.renderAgenticCoachPanel.__earthOnlineHooked) return;
    const original = window.renderAgenticCoachPanel;
    const wrapped = function (...args) {
      const result = original.apply(this, args);
      window.setTimeout(() => {
        try {
          syncLearnMissionChrome();
        } catch {
          // Decorative sync only.
        }
      }, 0);
      return result;
    };
    wrapped.__earthOnlineHooked = true;
    window.renderAgenticCoachPanel = wrapped;
  }

  function quizDecisionGateKey(unitId = "") {
    const latestRecord = (state?.quizResults || [])
      .filter((record) => record?.unitId === unitId)
      .sort((a, b) => String(b.timestamp || "").localeCompare(String(a.timestamp || "")))[0];
    return `eoQuizDecisionViewed:${unitId}:${latestRecord?.timestamp || "submitted"}`;
  }

  function quizDecisionViewed(unitId = "") {
    if (!unitId) return false;
    try {
      return sessionStorage.getItem(quizDecisionGateKey(unitId)) === "true";
    } catch {
      return false;
    }
  }

  function syncQuizReviewGate(unit, hasDecision, isSubmittedQuizReview) {
    if (!unit?.id) return false;
    const shouldGate = Boolean(hasDecision && isSubmittedQuizReview && !quizDecisionViewed(unit.id));
    const safeId = typeof CSS !== "undefined" && typeof CSS.escape === "function" ? CSS.escape(unit.id) : unit.id.replace(/[^a-zA-Z0-9_-]/g, "\\$&");
    const feedback = document.querySelector(`#feedback-${safeId}`);
    const existing = Array.from(document.querySelectorAll("[data-eo-open-quiz-decision]")).find((node) => node.dataset.eoOpenQuizDecision === unit.id);
    if (!shouldGate) {
      existing?.remove();
      return false;
    }
    if (!feedback || existing) return true;
    const button = document.createElement("button");
    button.className = "button primary eo-quiz-decision-button";
    button.type = "button";
    button.dataset.eoOpenQuizDecision = unit.id;
    button.textContent = "查看下一步推荐";
    button.addEventListener("click", () => {
      try {
        sessionStorage.setItem(quizDecisionGateKey(unit.id), "true");
      } catch {
        // Decorative state only.
      }
      sync();
      document.querySelector("#agentic-coach-panel")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    feedback.insertAdjacentElement("afterend", button);
    return true;
  }

  function syncLearnMissionChrome() {
    const player = document.querySelector("#learn-view .player");
    const companion = document.querySelector("#earth-ai-companion");
    if (!player) return;
    let unit = null;
    try {
      unit = typeof getUnit === "function" ? getUnit(currentUnitId) : null;
    } catch {
      unit = null;
    }
    const kind = unit?.type === "quiz" && unit.assessmentPhase === "pre"
      ? "scan"
      : unit?.type === "quiz" && unit.assessmentPhase === "post"
        ? "boss"
        : unit?.type === "quiz"
          ? "challenge"
          : unit?.type === "interactive"
            ? "experiment"
            : unit?.type === "knowledge"
              ? "knowledge"
              : "mission";
    player.classList.remove(
      "mission-kind-scan",
      "mission-kind-boss",
      "mission-kind-challenge",
      "mission-kind-experiment",
      "mission-kind-knowledge",
      "mission-kind-mission",
      "mission-awaiting-mode",
      "mission-mode-selected",
      "mission-decision-page",
      "mission-quiz-review"
    );
    player.classList.add(`mission-kind-${kind}`);
    const hasModeChoice = Boolean(document.querySelector("#agentic-coach-panel .agentic-knowledge-choice"));
    const modeChosen = Boolean(unit?.id && sessionStorage.getItem(`eoLearningModeChosen:${unit.id}`) === "true");
    const hasDecision = Boolean(document.querySelector("#agentic-coach-panel .agentic-coach-card.decision"));
    const isSubmittedQuizReview = unit?.type === "quiz" && state?.submittedQuizzes?.includes(unit.id);
    const shouldGateQuizDecision = syncQuizReviewGate(unit, hasDecision, isSubmittedQuizReview);
    player.classList.toggle("mission-awaiting-mode", unit?.type === "knowledge" && hasModeChoice && !modeChosen);
    player.classList.toggle("mission-mode-selected", unit?.type === "knowledge" && modeChosen);
    player.classList.toggle("mission-decision-page", hasDecision && (!isSubmittedQuizReview || !shouldGateQuizDecision));
    player.classList.toggle("mission-quiz-review", shouldGateQuizDecision);
    if (companion) companion.classList.toggle("mission-support-active", Boolean(unit));
  }

  function sync() {
    if (!window.EarthOnlineGame || typeof window.EarthOnlineGame.derive !== "function") return;
    let game = null;
    try {
      game = window.EarthOnlineGame.derive();
    } catch (error) {
      console.warn("Earth Online UI state failed:", error);
      return;
    }
    renderHud(game);
    renderMission(game);
    renderMissionBrief(game);
    renderRegions(game);
    syncLearnMissionChrome();
    maybeShowRegionClear(game);
    startAwakening();
  }

  window.EarthOnlineUI = { sync };
  hookCompleteCurrentUnit();
  hookAgenticCoachPanel();
  document.addEventListener("click", rememberLearningModeChoice);
  document.addEventListener("click", rememberPostQuizContinue);
  document.addEventListener("DOMContentLoaded", () => {
    hookCompleteCurrentUnit();
    hookAgenticCoachPanel();
    sync();
    startAwakening();
  });
})();
