"use strict";

/**
 * @file opportunity-logger.js
 * @description 统一决策机会 (Decision Opportunity) 审计日志记录器
 * 格式化决策记录，不执行数据库写入。调用方需对所有合格机会调用并持久化。
 * 分母完整性仍需对事件与机会的关联进行核验，不能由格式化函数保证。
 */

const crypto = require("node:crypto");

class OpportunityLogger {
  /**
   * 构造标准 Decision Unit 记录
   * @param {Object} params
   * @param {string} params.participant_id
   * @param {string} params.session_id
   * @param {string} params.knowledge_point_id
   * @param {import('./evidence-package').EvidencePackage} params.d1_evidence
   * @param {Object} params.d2_timing - { action: string, reason: string, candidate_formed: boolean }
   * @param {import('./support-action').SupportAction} [params.d3_support=null]
   * @param {Object} [params.d4_presentation=null] - { surface: string, visible?: boolean, opened?: boolean }
   * @param {import('./authority-contract').AuthorityContract} [params.d5_authority=null]
   * @param {Object} [params.d6_lifecycle=null] - { state_before: string, action: string, state_after: string }
   * @param {Object} [params.meta={}]
   * @returns {Object} 标准化决策记录
   */
  static formatDecisionUnit({
    participant_id = "unknown",
    session_id = "unknown",
    knowledge_point_id,
    d1_evidence,
    d2_timing,
    d3_support = null,
    d4_presentation = null,
    d5_authority = null,
    d6_lifecycle = null,
    meta = {}
  }) {
    const isSilent = !["boundary", "immediate"].includes(d2_timing?.action);
    const observedBoolean = value => typeof value === "boolean" ? value : null;

    return {
      decision_id: crypto.randomUUID(),
      opportunity_timestamp: Date.now(),
      participant_id: String(participant_id),
      session_id: String(session_id),
      knowledge_point_id: String(knowledge_point_id || (d1_evidence && d1_evidence.facts ? d1_evidence.facts.current_kp : "unknown")),

      // D1 证据
      d1_observable_facts: d1_evidence ? d1_evidence.facts : null,
      d1_need_help_estimate: d1_evidence ? d1_evidence.inference.need_help_now : null,
      d1_interruptibility_estimate: d1_evidence ? d1_evidence.inference.interruptible_now : null,
      d1_confidence: d1_evidence ? d1_evidence.inference.confidence : null,
      d1_missingness: d1_evidence ? d1_evidence.missing : [],

      // D2 时机
      d2_timing_action: d2_timing ? d2_timing.action : "unknown",
      d2_timing_reason: d2_timing ? d2_timing.reason : "unknown",
      d2_candidate_formed: d2_timing ? Boolean(d2_timing.candidate_formed) : false,
      d2_is_silent: isSilent,

      // D3 支持 (沉默时为 null)
      d3_support_depth: (!isSilent && d3_support) ? d3_support.support_depth : null,
      d3_support_function: (!isSilent && d3_support) ? d3_support.support_function : null,
      d3_content_version: (!isSilent && d3_support) ? d3_support.content_version : null,
      d3_leaks_answer: (!isSilent && d3_support) ? d3_support.leaks_current_answer : null,

      // D4 呈现
      d4_presentation_surface: (!isSilent && d4_presentation) ? d4_presentation.surface : null,
      d4_visible: isSilent ? false : observedBoolean(d4_presentation?.visible),
      d4_opened: isSilent ? false : observedBoolean(d4_presentation?.opened),

      // D5 授权
      d5_authority_level: d5_authority ? d5_authority.authority_level : null,
      d5_student_action: d5_authority ? d5_authority.student_action : null,
      d5_policy_changed_after: d5_authority ? d5_authority.policy_changed_after : null,

      // D6 生命周期
      d6_lifecycle_state_before: d6_lifecycle?.state_before || null,
      d6_lifecycle_state_after: d6_lifecycle?.state_after || null,

      // 元信息
      policy_version: meta.policy_version || "proactive-policy-v2.0",
      model_version: (d1_evidence && d1_evidence.provenance) ? d1_evidence.provenance.model_version : "rule-baseline",
      condition_assigned: meta.condition_assigned || "adaptive"
    };
  }
}

module.exports = { OpportunityLogger };
