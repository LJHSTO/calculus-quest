(function initProactiveHUD(global) {
  "use strict";

  // 6D Proactive Policy Live Inspector (HUD)
  const hudState = {
    isOpen: false,
    currentKp: "GH-01-K01",
    chapter: "V14-C1 (函数与极限)",
    // D1 Learning Evidence
    d1: {
      recent_event: "slider_explore",
      interaction_type: "simulation",
      facts: {
        drag_count: 3,
        pause_duration_ms: 2400,
        erratic_exploration: false
      },
      inference: {
        target_state: "hesitating_near_boundary",
        need_help_now: 0.72,
        interruptible_now: 0.85,
        confidence: 0.90
      }
    },
    // D2 Timing & Strategic Silence
    d2: {
      action: "boundary",
      reason: "natural_task_boundary_reached",
      boundary_detected: true,
      silent_reason: "none (action_dispatched)",
      candidate_formed: true
    },
    // D3 Support Depth & Anti-Leak
    d3: {
      level: "L2",
      function_type: "conceptual_conflict",
      title: "知点建议：留意自变量从两侧逼近时的对应值",
      anti_leak_status: "PASS (未命中任何答案泄露模式)",
      followup_check_id: "GH-01-K01-probe-l2-fl-r2",
      check_prompt: "当 x 从负侧无限趋近 0 时，函数值是否有唯一确定极限？"
    },
    // D4 Placement x Modality Orthogonal Matrix
    d4: {
      placement: "inline",
      modality: "tip",
      placement_target: "[data-proactive-inline-host]",
      rendered_surface: "原位嵌入卡片 (零视线脱离)"
    },
    // D5 Learner Authority Contract
    d5: {
      authority_level: "A3 (建议且需确认)",
      student_action: "idle",
      is_kp_muted: false,
      hard_blocking: "STANDBY"
    },
    // D6 Lifecycle Closed-Loop & Unified Cooldown
    d6: {
      episode_state: "offered",
      cooldown_remaining_sec: 0,
      escalation_count: 0,
      probe_result: "pending"
    }
  };

  let toggleBtn = null;
  let panel = null;
  let cooldownTimer = null;
  let eventCount = 0;

  function formatSec(sec) {
    return sec > 0 ? `${sec}s 冷却中` : "0s (随时可介入)";
  }

  function renderHUD() {
    if (!panel) return;
    const badge = panel.querySelector(".proactive-hud-badge");
    if (badge) {
      badge.textContent = `${hudState.currentKp} · 监听事件: ${eventCount}`;
    }
    const body = panel.querySelector(".proactive-hud-body");
    if (!body) return;

    body.innerHTML = `
      <!-- D1 Evidence Package Card -->
      <section class="proactive-dimension-card">
        <div class="dim-card-header">
          <span class="dim-card-title">D1 学习证据包 (Evidence Package)</span>
          <span class="dim-card-tag tag-blue">${hudState.d1.interaction_type}</span>
        </div>
        <div class="dim-metrics-grid">
          <div class="dim-metric-row">
            <span class="dim-metric-label">最近操作事件:</span>
            <span class="dim-metric-val is-highlight">${hudState.d1.recent_event}</span>
          </div>
          <div class="dim-metric-row">
            <span class="dim-metric-label">停顿思考时长:</span>
            <span class="dim-metric-val">${(hudState.d1.facts.pause_duration_ms / 1000).toFixed(1)}s</span>
          </div>
          <div class="dim-metric-row">
            <span class="dim-metric-label">求助需求度:</span>
            <span class="dim-metric-val is-highlight">${(hudState.d1.inference.need_help_now * 100).toFixed(0)}%</span>
          </div>
          <div class="dim-metric-row">
            <span class="dim-metric-label">可打扰性:</span>
            <span class="dim-metric-val">${(hudState.d1.inference.interruptible_now * 100).toFixed(0)}%</span>
          </div>
          <div class="dim-metric-full">
            <strong>事实/推断物理隔离：</strong> 推断目标 = ${hudState.d1.inference.target_state} | 置信度 = ${(hudState.d1.inference.confidence * 100).toFixed(0)}%
          </div>
        </div>
      </section>

      <!-- D2 Timing Gate Card -->
      <section class="proactive-dimension-card">
        <div class="dim-card-header">
          <span class="dim-card-title">D2 时机门控与沉默 (Timing & Silence)</span>
          <span class="dim-card-tag ${hudState.d2.action === 'silent' ? 'tag-amber' : 'tag-green'}">${hudState.d2.action.toUpperCase()}</span>
        </div>
        <div class="dim-metrics-grid">
          <div class="dim-metric-row">
            <span class="dim-metric-label">门控决策:</span>
            <span class="dim-metric-val is-highlight">${hudState.d2.action}</span>
          </div>
          <div class="dim-metric-row">
            <span class="dim-metric-label">自然边界:</span>
            <span class="dim-metric-val">${hudState.d2.boundary_detected ? '✅ 已命中边界' : '⏳ 交互连贯中'}</span>
          </div>
          <div class="dim-metric-full">
            <strong>决策审计理由：</strong> ${hudState.d2.silent_reason || hudState.d2.reason}
          </div>
        </div>
      </section>

      <!-- D3 Support & Anti-Leak Card -->
      <section class="proactive-dimension-card">
        <div class="dim-card-header">
          <span class="dim-card-title">D3 教学支持深度 (Support & Anti-Leak)</span>
          <span class="dim-card-tag tag-purple">${hudState.d3.level}</span>
        </div>
        <div class="dim-metrics-grid">
          <div class="dim-metric-row">
            <span class="dim-metric-label">支架梯级:</span>
            <span class="dim-metric-val is-highlight">${hudState.d3.level} (${hudState.d3.function_type})</span>
          </div>
          <div class="dim-metric-row">
            <span class="dim-metric-label">防泄题审计:</span>
            <span class="dim-metric-val" style="color: #34d399;">${hudState.d3.anti_leak_status}</span>
          </div>
          <div class="dim-metric-full">
            <strong>复查探针 (Check):</strong> [${hudState.d3.followup_check_id}]<br>
            <em>${hudState.d3.check_prompt}</em>
          </div>
        </div>
      </section>

      <!-- D4 Placement x Modality Matrix -->
      <section class="proactive-dimension-card">
        <div class="dim-card-header">
          <span class="dim-card-title">D4 呈现位置与形式 (Placement x Modality)</span>
          <span class="dim-card-tag tag-blue">${hudState.d4.placement} × ${hudState.d4.modality}</span>
        </div>
        <div class="dim-metrics-grid">
          <div class="dim-metric-row">
            <span class="dim-metric-label">呈现位置:</span>
            <span class="dim-metric-val is-highlight">${hudState.d4.placement === 'inline' ? '内嵌原位 (Inline)' : '边栏抽屉 (Sidebar)'}</span>
          </div>
          <div class="dim-metric-row">
            <span class="dim-metric-label">交互形式:</span>
            <span class="dim-metric-val">${hudState.d4.modality.toUpperCase()}</span>
          </div>
          <div class="dim-metric-full">
            <strong>挂载插槽：</strong> ${hudState.d4.placement_target} · ${hudState.d4.rendered_surface}
          </div>
        </div>
      </section>

      <!-- D5 Learner Authority Card -->
      <section class="proactive-dimension-card">
        <div class="dim-card-header">
          <span class="dim-card-title">D5 学习者授权契约 (Learner Authority)</span>
          <span class="dim-card-tag ${hudState.d5.is_kp_muted ? 'tag-rose' : 'tag-green'}">${hudState.d5.is_kp_muted ? 'MUTED' : 'ACTIVE'}</span>
        </div>
        <div class="dim-metrics-grid">
          <div class="dim-metric-row">
            <span class="dim-metric-label">授权等级:</span>
            <span class="dim-metric-val">${hudState.d5.authority_level}</span>
          </div>
          <div class="dim-metric-row">
            <span class="dim-metric-label">物理阻断:</span>
            <span class="dim-metric-val ${hudState.d5.is_kp_muted ? 'tag-rose' : ''}">${hudState.d5.is_kp_muted ? '⛔ 硬阻断生效中' : 'STANDBY (允许主动介入)'}</span>
          </div>
          <div class="dim-metric-full">
            <strong>学生控制动作：</strong> ${hudState.d5.student_action} (支持 accept/snooze/alternative/mute_kp)
          </div>
        </div>
      </section>

      <!-- D6 Lifecycle & Cooldown Card -->
      <section class="proactive-dimension-card">
        <div class="dim-card-header">
          <span class="dim-card-title">D6 支架生命周期 (Lifecycle & Cooldown)</span>
          <span class="dim-card-tag ${hudState.d6.episode_state === 'faded' ? 'tag-green' : 'tag-amber'}">${hudState.d6.episode_state.toUpperCase()}</span>
        </div>
        <div class="dim-metrics-grid">
          <div class="dim-metric-row">
            <span class="dim-metric-label">Episode 状态:</span>
            <span class="dim-metric-val is-highlight">${hudState.d6.episode_state}</span>
          </div>
          <div class="dim-metric-row">
            <span class="dim-metric-label">统一冷却计时:</span>
            <span class="dim-metric-val">${formatSec(hudState.d6.cooldown_remaining_sec)}</span>
          </div>
          <div class="dim-metric-full">
            <strong>闭环状态流：</strong> idle ➔ offered ➔ engaged ➔ probing ➔ faded (升级次数: ${hudState.d6.escalation_count}/1)
          </div>
        </div>
      </section>
    `;
  }

  function updateHUDState(updates = {}) {
    Object.assign(hudState, updates);
    renderHUD();
  }

  function startCooldownCountdown(seconds = 30) {
    clearInterval(cooldownTimer);
    hudState.d6.cooldown_remaining_sec = seconds;
    renderHUD();
    cooldownTimer = setInterval(() => {
      if (hudState.d6.cooldown_remaining_sec > 0) {
        hudState.d6.cooldown_remaining_sec -= 1;
        renderHUD();
      } else {
        clearInterval(cooldownTimer);
        renderHUD();
      }
    }, 1000);
  }

  function escapeHtml(str) {
    return String(str || "").replace(/[&<>"']/g, (m) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[m]));
  }

  function removeInSituIntervention() {
    const host = document.querySelector("[data-proactive-inline-host]");
    if (host) host.innerHTML = "";
  }

  function renderInSituIntervention(opts = {}) {
    const host = document.querySelector("[data-proactive-inline-host]");
    if (!host) return;

    const level = opts.level || hudState.d3.level || "L2";
    const title = opts.title || hudState.d3.title || "知点建议：留意自变量从两侧逼近时的对应值";
    const prompt = opts.prompt || hudState.d3.check_prompt || "当 x 从负侧无限趋近 0 时，函数值是否有唯一确定极限？";
    const showProbe = opts.showProbe === true;

    host.innerHTML = `
      <div class="proactive-insitu-card ${opts.isEscalated ? 'is-escalated' : ''}" data-proactive-insitu-card>
        <div class="proactive-insitu-header">
          <div class="proactive-insitu-badge-group">
            <span class="proactive-insitu-chip chip-level">⚡ ${escapeHtml(level)} 概念支架</span>
            <span class="proactive-insitu-chip chip-placement">D4 内嵌原位 (Inline)</span>
            <span class="proactive-insitu-chip chip-guard">🛡️ 防泄题: PASS</span>
            <span class="proactive-insitu-chip chip-auth">D5: ${escapeHtml(hudState.d5.authority_level)}</span>
          </div>
          <button type="button" class="proactive-insitu-close" title="稍后处理" data-insitu-action="snooze">&times;</button>
        </div>
        <div class="proactive-insitu-body">
          <h4 class="proactive-insitu-title">${escapeHtml(title)}</h4>
          <p class="proactive-insitu-desc">
            ${level === 'L3'
              ? '建议拆解为两个子目标：① 观察左极限 lim(x→0⁻) f(x)；② 观察右极限 lim(x→0⁺) f(x)。对比两侧是否收敛于同一数值。'
              : '观察滑块滑动到 0 附近时，左侧蓝点与右侧橙点的纵坐标落点。两点是否在垂直方向重合？'}
          </p>
        </div>
        <div class="proactive-insitu-footer">
          <button type="button" class="insitu-btn is-primary" data-insitu-action="accept">接受线索并高亮焦点</button>
          <button type="button" class="insitu-btn is-secondary" data-insitu-action="probe">${showProbe ? '收起随堂微测' : '📝 原位随堂微测 (Formative Probe)'}</button>
          <button type="button" class="insitu-btn is-outline" data-insitu-action="alternative">换一种帮助 (A4)</button>
          <button type="button" class="insitu-btn is-subtle" data-insitu-action="snooze">稍后 (30s 冷却)</button>
        </div>
        <div class="proactive-insitu-probe-container ${showProbe ? '' : 'is-hidden'}" data-insitu-probe-container>
          <div class="insitu-probe-card">
            <div class="insitu-probe-header">
              <span class="insitu-probe-tag">随堂形成性微测 · 闭环评估 (D6)</span>
              <small>此测试不计入总分，仅用于自查当前理解</small>
            </div>
            <div class="insitu-probe-question">
              <strong>问题：</strong> ${escapeHtml(prompt)}
            </div>
            <div class="insitu-probe-options">
              <button type="button" class="insitu-probe-opt" data-opt-idx="0">A. 有，两侧极限一定存在且相等</button>
              <button type="button" class="insitu-probe-opt" data-opt-idx="1">B. 不一定，若左侧与右侧趋近值不同，则整体极限不存在 (正确)</button>
              <button type="button" class="insitu-probe-opt" data-opt-idx="2">C. 只要 x=0 点有定义，极限就必定存在</button>
              <button type="button" class="insitu-probe-opt" data-opt-idx="3">D. 极限仅取决于函数定义域的端点值</button>
            </div>
            <div class="insitu-probe-feedback is-hidden" data-insitu-probe-feedback></div>
          </div>
        </div>
      </div>
    `;

    const card = host.querySelector("[data-proactive-insitu-card]");
    if (!card) return;

    card.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-insitu-action]");
      if (btn) {
        const action = btn.dataset.insituAction;
        if (action === "snooze") {
          triggerStudentSnooze();
          removeInSituIntervention();
        } else if (action === "accept") {
          hudState.d5.student_action = "accept (采纳建议)";
          hudState.d6.episode_state = "engaged";
          renderHUD();
          btn.textContent = "✓ 已采纳线索";
          btn.disabled = true;
        } else if (action === "probe") {
          const probeContainer = card.querySelector("[data-insitu-probe-container]");
          if (probeContainer) {
            probeContainer.classList.toggle("is-hidden");
            btn.textContent = probeContainer.classList.contains("is-hidden")
              ? "📝 原位随堂微测 (Formative Probe)"
              : "收起随堂微测";
          }
        } else if (action === "alternative") {
          triggerErrorEscalation();
        }
      }

      const optBtn = e.target.closest(".insitu-probe-opt");
      if (optBtn) {
        const idx = parseInt(optBtn.dataset.optIdx, 10);
        const fb = card.querySelector("[data-insitu-probe-feedback]");
        card.querySelectorAll(".insitu-probe-opt").forEach(b => b.classList.remove("is-selected", "is-correct", "is-wrong"));
        optBtn.classList.add("is-selected");
        if (fb) {
          fb.classList.remove("is-hidden");
          if (idx === 1) {
            optBtn.classList.add("is-correct");
            fb.className = "insitu-probe-feedback is-success";
            fb.innerHTML = "<strong>✓ 理解正确！</strong> 左右极限必须同时存在且相等，整体极限才存在。D6 支架已完成闭环，正在褪除为自主探索状态。";
            hudState.d6.episode_state = "faded";
            hudState.d6.probe_result = "passed";
            renderHUD();
          } else {
            optBtn.classList.add("is-wrong");
            fb.className = "insitu-probe-feedback is-warning";
            fb.innerHTML = "<strong>思考一下：</strong> 极限强调的是两侧无限趋近时的趋势是否一致，而非单侧或定义值。建议再观察上方图像。";
            hudState.d6.probe_result = "incorrect_retry";
            renderHUD();
          }
        }
      }
    });
  }

  // Quick Sandbox Interactive Triggers
  function triggerBoundaryAction() {
    updateHUDState({
      d1: {
        recent_event: "slider_dwell_stop",
        interaction_type: "simulation",
        facts: { drag_count: 5, pause_duration_ms: 3200, erratic_exploration: false },
        inference: { target_state: "parameter_boundary_halt", need_help_now: 0.82, interruptible_now: 0.95, confidence: 0.94 }
      },
      d2: {
        action: "boundary",
        reason: "task_natural_boundary_and_high_interruptibility",
        boundary_detected: true,
        silent_reason: "none (intervene_now)",
        candidate_formed: true
      },
      d3: {
        level: "L2",
        function_type: "conceptual_conflict",
        title: "知点建议：留意自变量从负侧与正侧逼近时的差异",
        anti_leak_status: "PASS (通过敏感词与反向解析扫描)",
        followup_check_id: "GH-01-K01-probe-l2-fl-r2",
        check_prompt: "当 x 从负侧无限趋近 0 时，函数值是否有唯一确定极限？"
      },
      d4: {
        placement: "inline",
        modality: "tip",
        placement_target: "[data-proactive-inline-host]",
        rendered_surface: "原位嵌入卡片 (伴随高亮)"
      },
      d6: {
        episode_state: "offered",
        cooldown_remaining_sec: 0,
        escalation_count: 0,
        probe_result: "pending"
      }
    });
    renderInSituIntervention({ level: "L2", showProbe: false });
  }

  function triggerErrorEscalation() {
    updateHUDState({
      d1: {
        recent_event: "misconception_failed_attempt",
        interaction_type: "game",
        facts: { drag_count: 2, pause_duration_ms: 4500, erratic_exploration: false },
        inference: { target_state: "persistent_concept_confusion", need_help_now: 0.95, interruptible_now: 0.88, confidence: 0.98 }
      },
      d2: {
        action: "immediate",
        reason: "repeated_misconception_trigger",
        boundary_detected: true,
        silent_reason: "none (support_escalated)",
        candidate_formed: true
      },
      d3: {
        level: "L3",
        function_type: "subgoal_decomposition",
        title: "知点建议：先拆解为两步——第一步观察左极限，第二步观察右极限",
        anti_leak_status: "PASS (题目标准答案已物理隔离)",
        followup_check_id: "GH-01-K01-probe-l3-fl-r2",
        check_prompt: "若左极限为 2，右极限为 3，单一总体极限是否存在？"
      },
      d4: {
        placement: "inline",
        modality: "widget",
        placement_target: "[data-proactive-inline-host]",
        rendered_surface: "原位微测试草稿板"
      },
      d6: {
        episode_state: "engaged",
        cooldown_remaining_sec: 0,
        escalation_count: 1,
        probe_result: "pending"
      }
    });
    renderInSituIntervention({ level: "L3", isEscalated: true, showProbe: true });
  }

  function triggerStudentSnooze() {
    removeInSituIntervention();
    updateHUDState({
      d2: {
        action: "silent",
        reason: "cooldown_suppression_active",
        boundary_detected: false,
        silent_reason: "student_requested_snooze",
        candidate_formed: false
      },
      d5: {
        authority_level: "A3",
        student_action: "snooze (稍后提醒)",
        is_kp_muted: false,
        hard_blocking: "COOLDOWN_ACTIVE"
      },
      d6: {
        episode_state: "idle",
        cooldown_remaining_sec: 30,
        escalation_count: 0,
        probe_result: "snoozed"
      }
    });
    startCooldownCountdown(30);
  }

  function triggerMuteScope() {
    removeInSituIntervention();
    clearInterval(cooldownTimer);
    updateHUDState({
      d2: {
        action: "silent",
        reason: "student_disabled_kp_proactivity",
        boundary_detected: false,
        silent_reason: "student_opted_out_for_current_kp",
        candidate_formed: false
      },
      d5: {
        authority_level: "A3",
        student_action: "mute_kp (关闭此知识点主动提醒)",
        is_kp_muted: true,
        hard_blocking: "HARD_BLOCKED (物理阻断，绝不弹窗)"
      },
      d6: {
        episode_state: "idle",
        cooldown_remaining_sec: 0,
        escalation_count: 0,
        probe_result: "muted"
      }
    });
  }

  function resetAllHUD() {
    removeInSituIntervention();
    clearInterval(cooldownTimer);
    updateHUDState({
      d1: {
        recent_event: "clean_workspace_enter",
        interaction_type: "simulation",
        facts: { drag_count: 0, pause_duration_ms: 0, erratic_exploration: false },
        inference: { target_state: "fresh_exploration", need_help_now: 0.1, interruptible_now: 0.5, confidence: 0.8 }
      },
      d2: {
        action: "silent",
        reason: "exploration_in_progress",
        boundary_detected: false,
        silent_reason: "low_help_need_strategic_silence",
        candidate_formed: false
      },
      d3: {
        level: "L1",
        function_type: "attention_focus",
        title: "知点建议：留意坐标系横纵坐标的变化关联",
        anti_leak_status: "PASS",
        followup_check_id: "GH-01-K01-probe-l1-fl-r2",
        check_prompt: "观察滑块移动时，哪一侧的数值率先发生改变？"
      },
      d4: {
        placement: "inline",
        modality: "tip",
        placement_target: "[data-proactive-inline-host]",
        rendered_surface: "原位嵌入卡片"
      },
      d5: {
        authority_level: "A3",
        student_action: "idle",
        is_kp_muted: false,
        hard_blocking: "STANDBY"
      },
      d6: {
        episode_state: "idle",
        cooldown_remaining_sec: 0,
        escalation_count: 0,
        probe_result: "pending"
      }
    });
  }

  function mountHUD() {
    if (document.querySelector(".proactive-hud-toggle-btn")) return;

    // 1. Toggle Button
    toggleBtn = document.createElement("button");
    toggleBtn.className = "proactive-hud-toggle-btn";
    toggleBtn.setAttribute("type", "button");
    toggleBtn.innerHTML = `
      <span class="hud-pulse-dot"></span>
      <span>⚡ 6D 策略看板</span>
    `;

    // 2. Panel
    panel = document.createElement("aside");
    panel.className = "proactive-hud-panel is-hidden";
    panel.innerHTML = `
      <div class="proactive-hud-header">
        <div class="proactive-hud-title">
          <span>⚡ 6D Proactive Policy Inspector</span>
          <span class="proactive-hud-badge">V14-C1 实时监控</span>
        </div>
        <button class="proactive-hud-close" title="收起看板">&times;</button>
      </div>
      <div class="proactive-hud-body"></div>
      <div class="proactive-hud-actions">
        <div class="proactive-hud-actions-title">六维交互沙盒即时仿真测试</div>
        <div class="proactive-hud-btn-row">
          <button class="hud-action-btn" data-hud-action="boundary">边界介入 (D1/D2)</button>
          <button class="hud-action-btn" data-hud-action="error">困难升级 (D3/D4)</button>
          <button class="hud-action-btn" data-hud-action="snooze">稍后冷却 (D5/D6)</button>
          <button class="hud-action-btn is-danger" data-hud-action="mute">静音阻断 (D5)</button>
          <button class="hud-action-btn" data-hud-action="reset">重置状态</button>
        </div>
      </div>
    `;

    document.body.append(toggleBtn, panel);

    // Event Listeners: Draggable Toggle Button
    let btnPointerDown = false;
    let btnStartX = 0;
    let btnStartY = 0;
    let btnInitialLeft = 0;
    let btnInitialTop = 0;
    let btnMoved = false;

    toggleBtn.addEventListener("pointerdown", (e) => {
      btnPointerDown = true;
      btnMoved = false;
      btnStartX = e.clientX;
      btnStartY = e.clientY;
      const rect = toggleBtn.getBoundingClientRect();
      btnInitialLeft = rect.left;
      btnInitialTop = rect.top;
      try { toggleBtn.setPointerCapture(e.pointerId); } catch {}
    });

    toggleBtn.addEventListener("pointermove", (e) => {
      if (!btnPointerDown) return;
      const dx = e.clientX - btnStartX;
      const dy = e.clientY - btnStartY;
      if (!btnMoved && Math.hypot(dx, dy) > 4) {
        btnMoved = true;
        toggleBtn.classList.add("is-dragging");
      }
      if (btnMoved) {
        let nextLeft = btnInitialLeft + dx;
        let nextTop = btnInitialTop + dy;
        const maxLeft = window.innerWidth - toggleBtn.offsetWidth - 8;
        const maxTop = window.innerHeight - toggleBtn.offsetHeight - 8;
        nextLeft = Math.max(8, Math.min(maxLeft, nextLeft));
        nextTop = Math.max(8, Math.min(maxTop, nextTop));
        toggleBtn.style.left = `${nextLeft}px`;
        toggleBtn.style.top = `${nextTop}px`;
        toggleBtn.style.bottom = "auto";
        toggleBtn.style.right = "auto";
      }
    });

    toggleBtn.addEventListener("pointerup", (e) => {
      if (btnPointerDown) {
        btnPointerDown = false;
        try { toggleBtn.releasePointerCapture(e.pointerId); } catch {}
        setTimeout(() => {
          toggleBtn.classList.remove("is-dragging");
        }, 50);
      }
    });

    toggleBtn.addEventListener("pointercancel", () => {
      btnPointerDown = false;
      toggleBtn.classList.remove("is-dragging");
    });

    toggleBtn.addEventListener("click", (e) => {
      if (btnMoved) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      hudState.isOpen = !hudState.isOpen;
      panel.classList.toggle("is-hidden", !hudState.isOpen);
      if (hudState.isOpen) {
        toggleBtn.style.display = "none";
        if (!panel.dataset.customPositioned) {
          const rect = toggleBtn.getBoundingClientRect();
          let panelTop = rect.top - 620;
          let panelLeft = rect.left;
          if (panelTop < 16) panelTop = 16;
          if (panelLeft + 480 > window.innerWidth) panelLeft = Math.max(16, window.innerWidth - 490);
          panel.style.left = `${Math.max(16, panelLeft)}px`;
          panel.style.top = `${Math.max(16, panelTop)}px`;
          panel.style.bottom = "auto";
          panel.style.right = "auto";
        }
        renderHUD();
      }
    });

    // Event Listeners: Draggable Panel Header
    const panelHeader = panel.querySelector(".proactive-hud-header");
    let panelPointerDown = false;
    let panelStartX = 0;
    let panelStartY = 0;
    let panelInitialLeft = 0;
    let panelInitialTop = 0;

    panelHeader.addEventListener("pointerdown", (e) => {
      if (e.target.closest(".proactive-hud-close")) return;
      panelPointerDown = true;
      panelStartX = e.clientX;
      panelStartY = e.clientY;
      const rect = panel.getBoundingClientRect();
      panelInitialLeft = rect.left;
      panelInitialTop = rect.top;
      try { panelHeader.setPointerCapture(e.pointerId); } catch {}
      panelHeader.classList.add("is-dragging");
      panel.dataset.customPositioned = "true";
    });

    panelHeader.addEventListener("pointermove", (e) => {
      if (!panelPointerDown) return;
      const dx = e.clientX - panelStartX;
      const dy = e.clientY - panelStartY;
      let nextLeft = panelInitialLeft + dx;
      let nextTop = panelInitialTop + dy;
      const maxLeft = window.innerWidth - panel.offsetWidth - 8;
      const maxTop = window.innerHeight - 80;
      nextLeft = Math.max(8, Math.min(maxLeft, nextLeft));
      nextTop = Math.max(8, Math.min(maxTop, nextTop));
      panel.style.left = `${nextLeft}px`;
      panel.style.top = `${nextTop}px`;
      panel.style.bottom = "auto";
      panel.style.right = "auto";
    });

    panelHeader.addEventListener("pointerup", (e) => {
      if (panelPointerDown) {
        panelPointerDown = false;
        try { panelHeader.releasePointerCapture(e.pointerId); } catch {}
        panelHeader.classList.remove("is-dragging");
      }
    });

    panelHeader.addEventListener("pointercancel", () => {
      panelPointerDown = false;
      panelHeader.classList.remove("is-dragging");
    });

    panel.querySelector(".proactive-hud-close").addEventListener("click", () => {
      hudState.isOpen = false;
      panel.classList.add("is-hidden");
      toggleBtn.style.display = "";
    });

    panel.addEventListener("click", (event) => {
      const btn = event.target.closest("[data-hud-action]");
      if (!btn) return;
      const act = btn.dataset.hudAction;
      if (act === "boundary") triggerBoundaryAction();
      else if (act === "error") triggerErrorEscalation();
      else if (act === "snooze") triggerStudentSnooze();
      else if (act === "mute") triggerMuteScope();
      else if (act === "reset") resetAllHUD();
    });

    let lastActionTime = Date.now();

    function syncActiveContext() {
      const unit = typeof getUnit === "function" ? getUnit() : null;
      if (unit) {
        hudState.currentKp = unit.label || unit.id || hudState.currentKp;
        const scene = typeof selectedKnowledgeSceneType === "function" ? selectedKnowledgeSceneType(unit) : "";
        if (scene) hudState.d1.interaction_type = scene;
      }
    }

    // 1. Listen to real iframe postMessage events (Simulation / Game / MindMap / 3D)
    window.addEventListener("message", (event) => {
      const data = event.data;
      if (!data || typeof data !== "object") return;
      const now = Date.now();
      const pauseMs = now - lastActionTime;
      lastActionTime = now;
      syncActiveContext();

      if (data.type === "cq:interaction") {
        eventCount += 1;
        const et = data.eventType || "interaction";
        const param = data.contextRef?.state?.parameter || data.contextRef?.label || "";
        const val = data.contextRef?.state?.newValue !== undefined ? data.contextRef.state.newValue : "";
        hudState.d1.facts.drag_count = (hudState.d1.facts.drag_count || 0) + 1;
        hudState.d1.facts.pause_duration_ms = Math.min(pauseMs, 10000);
        hudState.d1.recent_event = param ? `${et}: ${param}=${val}` : et;

        if (et === "parameter_commit") {
          hudState.d2.action = "boundary";
          hudState.d2.reason = "natural_task_boundary_reached";
          hudState.d2.boundary_detected = true;
          hudState.d2.silent_reason = "none (dispatched_at_boundary)";
          hudState.d1.inference.interruptible_now = 0.90;
          hudState.d1.inference.need_help_now = Math.min(0.95, (hudState.d1.inference.need_help_now || 0.5) + 0.05);
        } else if (et === "parameter_input") {
          hudState.d2.action = "silent";
          hudState.d2.reason = "continuous_slider_dragging";
          hudState.d2.boundary_detected = false;
          hudState.d2.silent_reason = "low_interruptibility_wait_for_boundary";
          hudState.d1.inference.interruptible_now = 0.25;
        } else if (et === "interactive_click") {
          hudState.d2.action = "boundary";
          hudState.d2.reason = "interactive_action_committed";
          hudState.d2.boundary_detected = true;
          hudState.d2.silent_reason = "none (action_committed)";
        }
        renderHUD();
      } else if (data.type === "maic_learning_event") {
        eventCount += 1;
        const et = data.event_type || data.eventType || "challenge";
        const isCorrect = data.is_correct === true || data.result === "correct";
        hudState.d1.recent_event = `${et} (${isCorrect ? '提交正确' : '挑战受挫'})`;
        if (!isCorrect) {
          hudState.d1.inference.target_state = "concept_conflict_in_challenge";
          hudState.d1.inference.need_help_now = 0.92;
          hudState.d2.action = "immediate";
          hudState.d2.reason = "repeated_challenge_misconception";
          hudState.d2.silent_reason = "none (support_escalated)";
          hudState.d3.level = "L3";
          hudState.d6.episode_state = "offered";
        } else {
          hudState.d1.inference.target_state = "challenge_solved";
          hudState.d1.inference.need_help_now = 0.20;
          hudState.d6.episode_state = "faded";
        }
        renderHUD();
      }
    });

    // 2. Listen to workspace & navigation changes
    window.addEventListener("cq:lesson-rendered", () => {
      syncActiveContext();
      renderHUD();
    });
    window.addEventListener("cq:learning-layout-change", () => {
      syncActiveContext();
      renderHUD();
    });

    // 3. Listen to proactive suggestion & check lifecycle events
    window.addEventListener("cq:courseware-event", (event) => {
      const detail = event.detail || {};
      eventCount += 1;
      hudState.d1.recent_event = detail.type || detail.action || "user_action";
      if (detail.facts) Object.assign(hudState.d1.facts, detail.facts);
      renderHUD();
    });

    window.addEventListener("cq:proactive-suggestion", (event) => {
      const s = event.detail?.suggestion;
      if (!s) return;
      hudState.d3.level = s.supportLevel || "L2";
      hudState.d3.title = s.title || hudState.d3.title;
      hudState.d6.episode_state = "offered";
      renderHUD();
    });

    syncActiveContext();
    renderHUD();
  }

  // Auto mount on DOM ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mountHUD);
  } else {
    mountHUD();
  }

  // Export to window for debugging
  global.CalculusQuest6DHUD = {
    state: hudState,
    update: updateHUDState,
    triggerBoundary: triggerBoundaryAction,
    triggerError: triggerErrorEscalation,
    triggerSnooze: triggerStudentSnooze,
    triggerMute: triggerMuteScope,
    reset: resetAllHUD,
    renderInSitu: renderInSituIntervention,
    removeInSitu: removeInSituIntervention
  };

})(window);
