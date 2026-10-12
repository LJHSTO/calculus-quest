"use strict";

/**
 * @file authority-contract.js
 * @description D5 学习者自主权与行动授权契约
 * 核心创新：独立于 D3 支架强度。确保学生的所有控制动作（接受/稍后/换一种/关闭/拒绝）
 * 真实改变系统后续策略，并在数据库中跨刷新持久化。
 */

const AUTHORITY_LEVELS = Object.freeze(["A0", "A1", "A2", "A3", "A4", "A5"]);

const STUDENT_ACTIONS = Object.freeze([
  "accept",   // 接受支架
  "delay",    // 稍后提醒 (进入强冷却)
  "switch",   // 换一种帮助
  "close",    // 彻底关闭当前知识点主动提醒
  "reject"    // 拒绝帮助 (本轮不升级)
]);

class AuthorityContract {
  /**
   * @param {Object} params
   * @param {string} params.level - "A0" ~ "A5"
   * @param {boolean} [params.confirmationRequired=true]
   * @param {boolean} [params.reversible=true]
   */
  constructor({ level = "A1", confirmationRequired = true, reversible = true } = {}) {
    if (!AUTHORITY_LEVELS.includes(level)) {
      throw new Error(`AuthorityContract: Invalid authority level "${level}". Must be one of: ${AUTHORITY_LEVELS.join(", ")}`);
    }
    this.authority_level = level;
    this.confirmation_required = Boolean(confirmationRequired);
    this.reversible = Boolean(reversible);
    this.student_action = null;
    this.action_timestamp = null;
    this.policy_changed_after = false;
  }

  /**
   * 处理学生的主动控制响应，并更新策略状态
   * @param {'accept'|'delay'|'switch'|'close'|'reject'} action
   * @param {Object} sessionPolicyState - 运行期策略会话状态
   * @returns {boolean} 是否成功改变了后续策略
   */
  recordStudentResponse(action, sessionPolicyState = {}) {
    if (!STUDENT_ACTIONS.includes(action)) {
      throw new Error(`AuthorityContract: Unknown student action "${action}".`);
    }

    this.student_action = action;
    this.action_timestamp = Date.now();

    switch (action) {
      case "close":
        // 核心 D5 操纵：彻底关闭当前知识点的主动提醒，写入持久集合
        if (sessionPolicyState.disabledKnowledgePoints instanceof Set) {
          sessionPolicyState.disabledKnowledgePoints.add(sessionPolicyState.currentKp);
        } else if (Array.isArray(sessionPolicyState.disabledKnowledgePoints)) {
          if (!sessionPolicyState.disabledKnowledgePoints.includes(sessionPolicyState.currentKp)) {
            sessionPolicyState.disabledKnowledgePoints.push(sessionPolicyState.currentKp);
          }
        }
        this.policy_changed_after = true;
        break;

      case "delay":
        // 稍后提醒：触发 10 分钟强冷却
        sessionPolicyState.cooldownUntil = Date.now() + 10 * 60 * 1000;
        this.policy_changed_after = true;
        break;

      case "reject":
        // 拒绝：本轮结束，不升级，触发 5 分钟常规冷却
        sessionPolicyState.cooldownUntil = Date.now() + 5 * 60 * 1000;
        this.policy_changed_after = true;
        break;

      case "switch":
        // 换一种帮助：标记请求备选表征或支架
        sessionPolicyState.requestedAlternative = true;
        this.policy_changed_after = true;
        break;

      case "accept":
        // 接受：允许展开支架并签发复查题
        this.policy_changed_after = true;
        break;

      default:
        this.policy_changed_after = false;
    }

    return this.policy_changed_after;
  }

  toJSON() {
    return {
      authority_level: this.authority_level,
      confirmation_required: this.confirmation_required,
      reversible: this.reversible,
      student_action: this.student_action,
      action_timestamp: this.action_timestamp,
      policy_changed_after: this.policy_changed_after
    };
  }
}

module.exports = { AuthorityContract, AUTHORITY_LEVELS, STUDENT_ACTIONS };
