"use strict";

/**
 * @file evidence-package.js
 * @description D1 学习状态证据包规范
 * 保证事实（可观察数据）与推断（模型估计）强隔离，支持溯源、时间窗与缺失性声明。
 */

/**
 * @typedef {Object} ObservableFacts
 * @property {string} current_kp - 知识点编码，例如 "GH-02-K02"
 * @property {string} event_type - 事件类型，如 "formative_error", "idle_stall"
 * @property {string} [error_detail] - 错误具体语义标签
 * @property {number} timestamp - 事件发生毫秒时间戳
 * @property {string} [source] - 来源标签，如 "courseware_step", "checkpoint"
 * @property {boolean} [includes_hint_influence=false] - 本次操作前是否已显示提示
 */

/**
 * @typedef {Object} InferenceEstimates
 * @property {string} [target_state="unknown"] - 推断出的学生心智误解状态
 * @property {number} [need_help_now=0] - 工程判定需要帮助分数 [0.0, 1.0] (未经校准不可称为概率)
 * @property {number} [interruptible_now=1] - 工程判定可打断性分数 [0.0, 1.0]
 * @property {number} [confidence=0] - 判定置信度 [0.0, 1.0]
 */

class EvidencePackage {
  /**
   * @param {Object} params
   * @param {ObservableFacts} params.facts
   * @param {InferenceEstimates} [params.inference]
   * @param {string[]} [params.missing] - 声明缺失的事实证据
   * @param {Object} [params.provenance] - 证据溯源元数据
   */
  constructor({ facts, inference = {}, missing = [], provenance = {} } = {}) {
    if (!facts || !facts.current_kp || !facts.event_type) {
      throw new Error("EvidencePackage: facts.current_kp and facts.event_type are strictly required");
    }

    // 事实强冻结：不可篡改
    this.facts = Object.freeze({
      current_kp: String(facts.current_kp),
      event_type: String(facts.event_type),
      error_detail: facts.error_detail ? String(facts.error_detail) : "",
      timestamp: Number(facts.timestamp || Date.now()),
      source: String(facts.source || "courseware_event"),
      includes_hint_influence: Boolean(facts.includes_hint_influence)
    });

    // 推断分离：工程估计
    this.inference = Object.freeze({
      target_state: String(inference.target_state || "unknown"),
      need_help_now: Math.max(0, Math.min(1, Number(inference.need_help_now ?? 0))),
      interruptible_now: Math.max(0, Math.min(1, Number(inference.interruptible_now ?? 1))),
      confidence: Math.max(0, Math.min(1, Number(inference.confidence ?? 0)))
    });

    this.missing = Object.freeze([...missing]);

    this.provenance = Object.freeze({
      model_version: String(provenance.model_version || "rule-baseline-v1"),
      evidence_window_seconds: Number(provenance.evidence_window_seconds || 180),
      generated_at: Date.now(),
      ...provenance
    });

    Object.freeze(this);
  }

  toJSON() {
    return {
      facts: this.facts,
      inference: this.inference,
      missing: this.missing,
      provenance: this.provenance
    };
  }
}

module.exports = { EvidencePackage };
