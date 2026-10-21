"use strict";

/**
 * @file adversarial-scenario-tests.js
 * @description 10 大对抗性场景测试套件 (ADV-01 ~ ADV-10)
 * 验证在没有真人被试的情况下，系统在极端边界与恶意输入下依然恪守政策合规性。
 */

const assert = require("node:assert/strict");
const {
  EvidencePackage,
  TimingGate,
  TIMING_ACTIONS,
  SupportAction,
  AuthorityContract,
  OpportunityLogger
} = require("../lib/proactive-policy");

async function runAdversarialSuite() {
  console.log("=== 开始执行 10 大对抗性场景测试套件 (ADV-01 ~ ADV-10) ===\n");
  const gate = new TimingGate();

  // ADV-01: 连续 6 次正确后突然连续 3 次错误 -> D1 必须敏锐捕获新困难
  {
    console.log("执行 ADV-01: 稳态后突发错误识别...");
    const ev = new EvidencePackage({
      facts: {
        current_kp: "GH-02-K02",
        event_type: "consecutive_errors",
        error_detail: "f(0)_as_limit",
        timestamp: Date.now(),
        source: "formative_check"
      },
      inference: {
        target_state: "recent_misconception",
        need_help_now: 0.85,
        interruptible_now: 0.80,
        confidence: 0.88
      }
    });
    const decision = gate.evaluate({
      evidence: ev,
      cooldownState: null,
      studentAuthority: null,
      assessmentPhase: "practice",
      atBoundary: true
    });
    assert.strictEqual(decision.action, TIMING_ACTIONS.BOUNDARY);
    assert.strictEqual(decision.candidate_formed, true);
    console.log("  ✅ ADV-01 通过: 成功识别新困难并在自然边界触发候选");
  }

  // ADV-02: 学生点击'关闭'后继续犯同类错误 -> D5 必须强制沉默，严格保护学生能动性
  {
    console.log("执行 ADV-02: 尊重学生关闭权 (D5 硬阻断)...");
    const ev = new EvidencePackage({
      facts: { current_kp: "GH-02-K02", event_type: "formative_error", timestamp: Date.now() },
      inference: { target_state: "persistent_error", need_help_now: 0.99, interruptible_now: 0.95, confidence: 0.99 }
    });
    const decision = gate.evaluate({
      evidence: ev,
      cooldownState: null,
      studentAuthority: { is_kp_disabled: true },
      assessmentPhase: "practice"
    });
    assert.strictEqual(decision.action, TIMING_ACTIONS.SILENT);
    assert.strictEqual(decision.reason, "student_disabled_kp_proactivity");
    assert.strictEqual(decision.candidate_formed, false);
    console.log("  ✅ ADV-02 通过: 学生关闭后，即使 HelpNeed=0.99 也绝对静默");
  }

  // ADV-03: 测量阶段 (pre/post/transfer/retention) 爆发极高 HelpNeed -> D2 强制绝对沉默
  {
    console.log("执行 ADV-03: 测量保护区零打扰 (D2 强制沉默)...");
    const ev = new EvidencePackage({
      facts: { current_kp: "GH-02-K02", event_type: "post_test_failure", timestamp: Date.now() },
      inference: { target_state: "fatal_misconception", need_help_now: 1.0, interruptible_now: 1.0, confidence: 1.0 }
    });
    for (const phase of ["pre", "post", "transfer", "retention", "delayed"]) {
      const decision = gate.evaluate({ evidence: ev, cooldownState: null, assessmentPhase: phase });
      assert.strictEqual(decision.action, TIMING_ACTIONS.SILENT);
      assert.strictEqual(decision.reason, "protected_assessment_phase");
      assert.strictEqual(decision.candidate_formed, false);
    }
    console.log("  ✅ ADV-03 通过: 所有保护性测量阶段一律绝对静默");
  }

  // ADV-04: 拖动操作中途 (正在思考/操作，低打断性) -> D2 必须进入 wait 状态，等待自然边界
  {
    console.log("执行 ADV-04: 保护专注状态 (低可打断性时保持等待)...");
    const ev = new EvidencePackage({
      facts: { current_kp: "GH-02-K02", event_type: "in_drag_stall", timestamp: Date.now() },
      inference: { target_state: "stalled", need_help_now: 0.85, interruptible_now: 0.20, confidence: 0.70 }
    });
    const decision = gate.evaluate({
      evidence: ev,
      cooldownState: null,
      assessmentPhase: "practice",
      atBoundary: false
    });
    assert.strictEqual(decision.action, TIMING_ACTIONS.WAIT);
    assert.strictEqual(decision.reason, "low_interruptibility_wait_for_boundary");
    assert.strictEqual(decision.candidate_formed, true);
    console.log("  ✅ ADV-04 通过: HelpNeed 高但打断性低时，安全等待自然边界");
  }

  // ADV-05: 处于冷却时间窗内 -> D2 必须进入 silent 状态，带具体剩余时间
  {
    console.log("执行 ADV-05: 冷却期物理拦截...");
    const ev = new EvidencePackage({
      facts: { current_kp: "GH-02-K02", event_type: "error", timestamp: Date.now() },
      inference: { target_state: "error", need_help_now: 0.80, interruptible_now: 0.80, confidence: 0.80 }
    });
    const now = Date.now();
    const decision = gate.evaluate({
      evidence: ev,
      cooldownState: { activeUntil: now + 120000 },
      assessmentPhase: "practice"
    });
    assert.strictEqual(decision.action, TIMING_ACTIONS.SILENT);
    assert.strictEqual(decision.reason, "cooling_down");
    assert.ok(decision.remaining_cooldown_ms > 0);
    console.log("  ✅ ADV-05 通过: 冷却期内拒绝重复弹窗");
  }

  // ADV-06: 顺序响应的内存状态检查；不模拟并发点击或数据库持久化。
  {
    console.log("执行 ADV-06: 快速连续控制指令处理...");
    const contract = new AuthorityContract({ level: "A1" });
    const sessionState = { currentKp: "GH-02-K02", disabledKnowledgePoints: new Set(), cooldownUntil: 0 };
    contract.recordStudentResponse("accept", sessionState);
    contract.recordStudentResponse("delay", sessionState);
    assert.ok(sessionState.cooldownUntil > Date.now());
    contract.recordStudentResponse("close", sessionState);
    assert.ok(sessionState.disabledKnowledgePoints.has("GH-02-K02"));
    assert.strictEqual(contract.student_action, "close");
    assert.strictEqual(contract.policy_changed_after, true);
    console.log("  ✅ ADV-06 通过: 最终控制状态已更新；跨刷新另由接口测试覆盖");
  }

  // ADV-07: L1-L3 支架严禁泄露当前题答案 -> D3 构造时硬校验拦截
  {
    console.log("执行 ADV-07: D3 支架防泄题硬校验...");
    assert.throws(() => {
      new SupportAction({
        depth: "L2",
        functionType: "concept_hint",
        targetKp: "GH-02-K02",
        contentText: "答案选 A",
        remainingStudentTask: "无",
        followupCheckId: "chk-01",
        leaksCurrentAnswer: true // 恶意标记泄题
      });
    }, /strictly forbidden from leaking the current answer/);
    console.log("  ✅ ADV-07 通过: 低级支架泄题被硬抛出拒绝");
  }

  // ADV-08: 缺失独立复查题的支架拒绝签发 -> 保证渐退闭环
  {
    console.log("执行 ADV-08: D3 必须绑定独立复查题...");
    assert.throws(() => {
      new SupportAction({
        depth: "L2",
        functionType: "concept_hint",
        targetKp: "GH-02-K02",
        contentText: "左右极限说的是趋近趋势",
        remainingStudentTask: "计算左右极限",
        followupCheckId: null // 缺失复查题
      });
    }, /valid followupCheckId is strictly required/);
    console.log("  ✅ ADV-08 通过: 缺失复查题无法实例化");
  }

  // ADV-09: 沉默决策也必须产生审计日志且字段完整 (沉默分母)
  {
    console.log("执行 ADV-09: 沉默机会审计记录...");
    const ev = new EvidencePackage({
      facts: { current_kp: "GH-02-K02", event_type: "minor_hesitation", timestamp: Date.now() },
      inference: { target_state: "normal_exploration", need_help_now: 0.30, interruptible_now: 0.90, confidence: 0.90 }
    });
    const timing = gate.evaluate({ evidence: ev, assessmentPhase: "practice" });
    const log = OpportunityLogger.formatDecisionUnit({
      participant_id: "P01",
      knowledge_point_id: "GH-02-K02",
      d1_evidence: ev,
      d2_timing: timing
    });
    assert.strictEqual(log.d2_timing_action, "silent");
    assert.strictEqual(log.d2_is_silent, true);
    assert.strictEqual(log.d3_support_depth, null);
    assert.strictEqual(log.d4_presentation_surface, null);
    assert.ok(log.decision_id);
    console.log("  ✅ ADV-09 通过: 沉默记录格式正确并清空展示字段；本用例不写数据库");
  }

  // ADV-10: 正常探索操作 (多频拖动滑块) 不被误判为困难
  {
    console.log("执行 ADV-10: 正常探索操作防误判...");
    const ev = new EvidencePackage({
      facts: { current_kp: "GH-02-K02", event_type: "slider_explore", timestamp: Date.now() },
      inference: { target_state: "exploring", need_help_now: 0.25, interruptible_now: 0.95, confidence: 0.85 }
    });
    const timing = gate.evaluate({ evidence: ev, assessmentPhase: "practice" });
    assert.strictEqual(timing.action, TIMING_ACTIONS.SILENT);
    assert.strictEqual(timing.reason, "help_need_below_threshold");
    console.log("  ✅ ADV-10 通过: 探索操作不触发错误打扰");
  }

  console.log("\n10/10 项契约场景通过；不替代真实系统回归、内容审查或真人实验放行。");
}

if (require.main === module) {
  runAdversarialSuite().catch((err) => {
    console.error("对抗性测试执行失败:", err);
    process.exit(1);
  });
}

module.exports = { runAdversarialSuite };
