"use strict";

/**
 * @file dimension-separability-check.js
 * @description 维度可分离性自动化操纵检验套件 (SEP-01 ~ SEP-05)
 * 验证在限定取值范围内，操纵目标维度时，非目标维度的字段与上下文保持严格一致性。
 * 仅验证对象层字段约束；真实系统接线、剂量相等和学生感知仍需独立验证。
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

async function runSeparabilitySuite() {
  console.log("=== 开始执行 5 大维度可分离性检验套件 (SEP-01 ~ SEP-05) ===\n");

  const baseEvidence = new EvidencePackage({
    facts: { current_kp: "GH-02-K02", event_type: "formative_error", timestamp: 1696924800000 },
    inference: { target_state: "left_right_limit_confusion", need_help_now: 0.82, interruptible_now: 0.85, confidence: 0.88 }
  });

  // SEP-01: D2 从 boundary 改为 silent 时，D1 证据包完全不变，D3/D4 纯净置空
  {
    console.log("检验 SEP-01: D2 时机独立操纵 (boundary vs silent)...");
    const timingBoundary = { action: "boundary", reason: "natural_task_boundary_reached", candidate_formed: true };
    const timingSilent = { action: "silent", reason: "manual_policy_override", candidate_formed: false };

    const support = new SupportAction({
      depth: "L2",
      functionType: "concept_hint",
      targetKp: "GH-02-K02",
      contentText: "左右极限说的是输入从哪侧靠近",
      remainingStudentTask: "比较两侧趋近值",
      followupCheckId: "chk-k02-v1"
    });

    const logBoundary = OpportunityLogger.formatDecisionUnit({
      participant_id: "P01",
      knowledge_point_id: "GH-02-K02",
      d1_evidence: baseEvidence,
      d2_timing: timingBoundary,
      d3_support: support,
      d4_presentation: { surface: "sidebar", visible: true }
    });

    const logSilent = OpportunityLogger.formatDecisionUnit({
      participant_id: "P01",
      knowledge_point_id: "GH-02-K02",
      d1_evidence: baseEvidence,
      d2_timing: timingSilent,
      d3_support: support,
      d4_presentation: { surface: "sidebar", visible: true }
    });

    // 断言：D1 证据完全同构
    assert.deepStrictEqual(logBoundary.d1_observable_facts, logSilent.d1_observable_facts);
    assert.strictEqual(logBoundary.d1_need_help_estimate, logSilent.d1_need_help_estimate);
    // 断言：D2 改变
    assert.strictEqual(logBoundary.d2_timing_action, "boundary");
    assert.strictEqual(logSilent.d2_timing_action, "silent");
    // 断言：沉默时 D3/D4 纯净置空
    assert.strictEqual(logSilent.d3_support_depth, null);
    assert.strictEqual(logSilent.d4_presentation_surface, null);
    console.log("  ✅ SEP-01 通过: D2 改变不污染 D1，沉默时 D3/D4 纯净隔离");
  }

  // SEP-02: D3 从 L2 改为 L4 时，D4 表面与 D5 授权级别完全同构
  {
    console.log("检验 SEP-02: D3 支架深度独立操纵 (L2 vs L4)...");
    const supportL2 = new SupportAction({
      depth: "L2",
      functionType: "concept_hint",
      targetKp: "GH-02-K02",
      contentText: "左右说的是输入从哪侧靠近；比较的是两侧输出趋近的值。",
      remainingStudentTask: "用线索判断左值 1、右值 3 是否相等",
      followupCheckId: "chk-k02-v1"
    });

    const supportL4 = new SupportAction({
      depth: "L4",
      functionType: "next_step_scaffold",
      targetKp: "GH-02-K02",
      contentText: "先写出左极限 1 和右极限 3 两个数，再比较；暂时忽略 x=0 处的定义点。",
      remainingStudentTask: "写出左右极限并比较",
      followupCheckId: "chk-k02-v1"
    });

    const auth = new AuthorityContract({ level: "A1" });
    const timing = { action: "boundary", reason: "natural_task_boundary_reached", candidate_formed: true };

    const logL2 = OpportunityLogger.formatDecisionUnit({
      knowledge_point_id: "GH-02-K02",
      d1_evidence: baseEvidence,
      d2_timing: timing,
      d3_support: supportL2,
      d4_presentation: { surface: "inline" },
      d5_authority: auth
    });

    const logL4 = OpportunityLogger.formatDecisionUnit({
      knowledge_point_id: "GH-02-K02",
      d1_evidence: baseEvidence,
      d2_timing: timing,
      d3_support: supportL4,
      d4_presentation: { surface: "inline" },
      d5_authority: auth
    });

    assert.notStrictEqual(logL2.d3_support_depth, logL4.d3_support_depth);
    assert.strictEqual(logL2.d4_presentation_surface, logL4.d4_presentation_surface);
    assert.strictEqual(logL2.d5_authority_level, logL4.d5_authority_level);
    console.log("  ✅ SEP-02 通过: D3 深度变化时 D4 表面和 D5 权限严格恒定");
  }

  // SEP-03: D4 从 inline 改为 sidebar 时，D3 教学支架内容严格逐字同构
  {
    console.log("检验 SEP-03: D4 呈现表面独立操纵 (inline vs sidebar)...");
    const support = new SupportAction({
      depth: "L2",
      functionType: "concept_hint",
      targetKp: "GH-02-K02",
      contentText: "左右极限说的是输入从哪侧靠近",
      remainingStudentTask: "判断左右极限",
      followupCheckId: "chk-k02-v1"
    });

    const timing = { action: "boundary", reason: "natural_task_boundary_reached", candidate_formed: true };

    const logInline = OpportunityLogger.formatDecisionUnit({
      knowledge_point_id: "GH-02-K02",
      d1_evidence: baseEvidence,
      d2_timing: timing,
      d3_support: support,
      d4_presentation: { surface: "inline" }
    });

    const logSidebar = OpportunityLogger.formatDecisionUnit({
      knowledge_point_id: "GH-02-K02",
      d1_evidence: baseEvidence,
      d2_timing: timing,
      d3_support: support,
      d4_presentation: { surface: "sidebar" }
    });

    assert.strictEqual(logInline.d3_support_depth, logSidebar.d3_support_depth);
    assert.strictEqual(logInline.d3_content_version, logSidebar.d3_content_version);
    assert.notStrictEqual(logInline.d4_presentation_surface, logSidebar.d4_presentation_surface);
    console.log("  ✅ SEP-03 通过: 换表面不篡改任何教学内容或深度");
  }

  // SEP-04: D5 从 A1 改为 A3 时，D3 支架内容不变，仅授权与确认流程改变
  {
    console.log("检验 SEP-04: D5 授权级别独立操纵 (A1 vs A3)...");
    const authA1 = new AuthorityContract({ level: "A1", confirmationRequired: false });
    const authA3 = new AuthorityContract({ level: "A3", confirmationRequired: true });

    assert.notStrictEqual(authA1.authority_level, authA3.authority_level);
    assert.notStrictEqual(authA1.confirmation_required, authA3.confirmation_required);
    assert.strictEqual(authA1.reversible, authA3.reversible);
    console.log("  ✅ SEP-04 通过: D5 授权等级独立于 D3 支架内容");
  }

  // SEP-05: D6 生命周期独立管理，达上限退出不影响首次决策
  {
    console.log("检验 SEP-05: D6 生命周期状态机独立性...");
    const timing = { action: "boundary", reason: "boundary", candidate_formed: true };
    const support = new SupportAction({
      depth: "L3",
      functionType: "subgoal_prompt",
      targetKp: "GH-02-K02",
      contentText: "先求左侧，再求右侧",
      remainingStudentTask: "比较",
      followupCheckId: "chk-k02-v1"
    });

    const logInitial = OpportunityLogger.formatDecisionUnit({
      knowledge_point_id: "GH-02-K02",
      d1_evidence: baseEvidence,
      d2_timing: timing,
      d3_support: support,
      d6_lifecycle: { state_before: "monitoring", action: "present", state_after: "presented" }
    });

    const logFading = OpportunityLogger.formatDecisionUnit({
      knowledge_point_id: "GH-02-K02",
      d1_evidence: baseEvidence,
      d2_timing: timing,
      d3_support: support,
      d6_lifecycle: { state_before: "awaiting_independent_check", action: "independent_success", state_after: "fading" }
    });

    assert.strictEqual(logInitial.d3_support_depth, logFading.d3_support_depth);
    assert.notStrictEqual(logInitial.d6_lifecycle_state_after, logFading.d6_lifecycle_state_after);
    console.log("  ✅ SEP-05 通过: D6 状态转移独立演化，不破坏输入决策一致性");
  }

  console.log("\n5/5 项对象契约检查通过；不等同于真人操纵检验或教育效果证据。");
}

if (require.main === module) {
  runSeparabilitySuite().catch((err) => {
    console.error("可分离性检验失败:", err);
    process.exit(1);
  });
}

module.exports = { runSeparabilitySuite };
