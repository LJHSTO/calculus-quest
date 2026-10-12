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

  function formatSec(sec) {
    return sec > 0 ? `${sec}s 冷却中` : "0s (随时可介入)";
  }

  function renderHUD() {
    if (!panel) return;
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
  }

  function triggerStudentSnooze() {
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

    // Event Listeners
    toggleBtn.addEventListener("click", () => {
      hudState.isOpen = !hudState.isOpen;
      panel.classList.toggle("is-hidden", !hudState.isOpen);
      if (hudState.isOpen) renderHUD();
    });

    panel.querySelector(".proactive-hud-close").addEventListener("click", () => {
      hudState.isOpen = false;
      panel.classList.add("is-hidden");
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

    // Listen to real workspace & assistant events
    window.addEventListener("cq:courseware-event", (event) => {
      const detail = event.detail || {};
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
    reset: resetAllHUD
  };

})(window);
