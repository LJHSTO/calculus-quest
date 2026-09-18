"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const grading = require("./agents/grading");
const courseAssessment = require("./course-assessment");

const common = {
  experiment_id: ["实验编号", "string"],
  user_id: ["用户标识", "string"],
  condition: ["名册固定组别", "string"],
  learning_generation: ["学习代次", "number"]
};
const schemas = {
  participants: {
    ...common, learning_generation: ["当前学习代次", "number"], cohort: ["批次", "string"], stratum: ["前测分层", "string"],
    assignment_version: ["分配版本", "string"], assigned_at: ["分配时间", "string"],
    participation_status: ["参与状态", "string"], enrollment_basis: ["参与依据", "string"],
    consented_at: ["同意时间", "string"], withdrawn_at: ["退出时间", "string"]
  },
  quiz_attempts: {
    ...common, record_id: ["作答记录标识", "string"], unit_id: ["单元标识", "string"],
    question_id: ["题目标识", "string"], phase: ["测验阶段", "string"],
    question_type: ["题型", "string"], submitted_at: ["提交时间", "string"],
    response: ["学生回答", "string"], response_kind: ["作答类型：answer/dont_know/not_answered", "string"],
    raw_score: ["存储原分数", "number"],
    stored_status: ["存储评分状态", "string"], stored_is_correct: ["存储正误标记", "number"],
    max_score: ["存储满分", "number"], candidate_score: ["有效候选分数", "number"],
    score_state: ["评分状态", "string"], analysis_eligible: ["可进入已核验客观题分析", "boolean"],
    provenance: ["实验归属依据", "string"], instrument_version: ["提交时题库版本", "string"],
    question_digest: ["提交时题目摘要", "string"], protocol_fingerprint: ["提交时协议摘要", "string"],
    catalog_match: ["提交摘要与目录匹配", "boolean"],
    assessment_status: ["题目使用状态", "string"],
    objective_score_verified: ["客观题答案与分数复核", "boolean"],
    ai_score: ["模型原评分", "number"], ai_confidence: ["模型自报置信度", "number"],
    ai_error_type: ["模型错误类型", "string"]
  },
  phase_scores: {
    ...common, unit_id: ["单元标识", "string"], phase: ["测验阶段", "string"],
    instrument_version: ["题库版本", "string"], component: ["分数组成", "string"],
    record_count: ["原始记录数", "number"], answered_items: ["有回答题数", "number"],
    expected_items: ["按自适应规则应答题数", "number"], scored_items: ["有效候选评分题数", "number"],
    observed_score_sum: ["已有候选评分之和", "number"],
    candidate_total: ["完整候选总分", "number"], expected_max_score: ["目录满分", "number"],
    analysis_score: ["已核验客观题分析分数", "number"],
    objective_percent: ["客观题标准分（百分制）", "number"],
    duplicate_question_records: ["重复题目记录数", "number"], status: ["汇总状态", "string"]
  },
  assessment_catalog: {
    question_id: ["题目标识", "string"], unit_id: ["单元标识", "string"], phase: ["测验阶段", "string"],
    instrument_version: ["当前索引题库版本", "string"], question_digest: ["当前索引题目摘要", "string"],
    question_type: ["题型", "string"], points: ["目录满分", "number"], question_text: ["当前索引题面", "string"],
    adaptive_role: ["自适应题目角色", "string"],
    assessment_status: ["题目使用状态", "string"],
    answer_key_json: ["当前索引答案JSON", "string"], rubric_json: ["当前索引量规JSON", "string"]
  },
  courseware_events: {
    ...common, event_id: ["平台事件标识", "string"], occurred_at: ["发生时间", "string"],
    event_type: ["课件事件类型", "string"], recorded_experiment_id: ["事件记录实验编号", "string"],
    provenance: ["事件归属状态", "string"], recorded_condition: ["事件记录组别", "string"],
    protocol_fingerprint: ["事件协议摘要", "string"], semantic_event_id: ["课件语义事件标识", "string"],
    attempt_id: ["作答链标识", "string"], attempt_number: ["作答序号", "number"],
    challenge_id: ["挑战标识", "string"], resource_id: ["资源标识", "string"],
    resource_revision: ["资源修订标识", "string"], scene_type: ["场景", "string"],
    unit_id: ["单元标识", "string"], knowledge_point_id: ["知识点标识", "string"], independent: ["明确声明独立", "boolean"],
    hint_count: ["提示次数", "number"], reset_count: ["重置次数", "number"],
    correct: ["课件判定正确", "boolean"], evidence_scope: ["证据范围", "string"],
    error_type: ["课件错误类型", "string"], selected_zone: ["实际选择区", "string"],
    data_json: ["课件原始数据JSON", "string"]
  },
  outcome_items: {
    ...common, attempt_id: ["独立测量提交标识", "string"], session_id: ["测量会话标识", "string"],
    recorded_condition: ["测量记录组别", "string"],
    stage: ["独立测量阶段", "string"], instrument_version: ["测量版本", "string"],
    item_id: ["测量题目标识", "string"], construct_id: ["测量构念", "string"],
    knowledge_point_id: ["知识点标识", "string"], response: ["测量回答", "string"],
    score: ["题目分数", "number"], max_score: ["题目满分", "number"],
    correct: ["测量判定正确", "boolean"], submitted_at: ["提交时间", "string"]
  },
  outcome_sessions: {
    ...common, session_id: ["测量会话标识", "string"], stage: ["测量阶段", "string"],
    recorded_condition: ["会话记录组别", "string"],
    status: ["会话状态", "string"], instrument_version: ["测量版本", "string"],
    started_at: ["开始时间", "string"], ended_at: ["结束时间", "string"],
    withdrawal_reason: ["结束或退出原因", "string"], protocol_fingerprint: ["协议摘要", "string"]
  },
  grading_audits: {
    ...common, audit_id: ["评分审计标识", "string"], source: ["评分来源", "string"],
    record_id: ["直接关联作答标识", "string"], record_link: ["作答关联依据", "string"],
    question_id: ["题目标识", "string"], unit_id: ["单元标识", "string"],
    created_at: ["评分时间", "string"], status: ["评分应用状态", "string"],
    candidate_score: ["建议分数", "number"], requested_model: ["请求模型", "string"],
    reported_model: ["服务端报告模型", "string"], prompt_version: ["提示版本", "string"],
    prompt_hash: ["系统提示摘要", "string"], rubric_hash: ["评分量规摘要", "string"],
    rubric_scores_json: ["逐项给分与原文依据", "string"],
    previous_grade_json: ["重评前状态JSON", "string"],
    proposed_grade_json: ["评分建议及审计JSON", "string"], applied_grade_json: ["重评应用状态JSON", "string"]
  },
  proactive_decisions: {
    ...common, decision_id: ["主动决策标识", "string"], recorded_condition: ["决策记录组别", "string"],
    unit_id: ["单元标识", "string"], scene_type: ["场景", "string"],
    candidate_kind: ["候选信号类型", "string"], decision: ["政策判断", "string"],
    delivery_decision: ["实际投递判断", "string"], action: ["干预动作", "string"],
    support_level: ["支架层级", "string"], policy_version: ["政策版本", "string"],
    adapter_version: ["适配器版本", "string"], created_at: ["决策时间", "string"],
    shown_at: ["呈现时间", "string"], resolution: ["学生响应", "string"],
    intervention_status: ["干预状态", "string"], reason_codes_json: ["政策理由JSON", "string"],
    evidence_snapshot_json: ["决策证据JSON", "string"], followup_outcome_json: ["支架后检查及后续结果JSON", "string"]
  }
};
const meanings = {
  score_state: "not_answered=未作答；dont_know_scored=明确选择我不会且零分已核验；pending_review=待评分；grading_unavailable=评分失败；needs_review=待复核；invalid_score=数值异常；objective_score_mismatch=答案分数不一致；objective_scored=客观题评分；model_scored_unfrozen=模型评分未人工冻结。",
  provenance: "recorded_experiment=记录归属匹配；roster_history_unverified=仅名册关联旧记录；metadata_missing=缺少元数据；experiment_mismatch/protocol_mismatch/condition_mismatch/generation_mismatch=对应字段不一致。",
  component: "objective=客观题；short_answer=简答题；total=全卷。不同单元、代次和题库版本不合并。",
  candidate_score: "仅用于工程巡检的有效候选值；null与有效0不同；模型候选值不代表人工冻结或校准通过。",
  analysis_score: "仅完整、无重复且版本与客观判分核验通过时提供；包含未人工冻结简答的总分为空。不是研究纳入资格判断。",
  record_link: "record_id=直接关联实际更新的作答；logical_question_only=只有历史逻辑题号，不能猜配到具体代次。",
  resource_revision: "只采用事件实际提供的修订标识；未知留空，不用当前课件文件版本补造历史版本。"
};

function parse(value, fallback = {}) {
  if (value && typeof value === "object") return value;
  try { return JSON.parse(value || "") ?? fallback; } catch { return fallback; }
}

function number(value) {
  if (value === "" || value == null || typeof value === "boolean") return null;
  const result = Number(value);
  return Number.isFinite(result) ? result : null;
}

function hasAnswer(value) {
  if (value == null || !String(value).trim()) return false;
  const decoded = parse(value, value);
  return !Array.isArray(decoded) || decoded.length > 0;
}

function isUnknownResponse(value) {
  const decoded = parse(value, value);
  return decoded === "__unknown__"
    || (Array.isArray(decoded) && decoded.length === 1 && decoded[0] === "__unknown__");
}

function scoreState(row) {
  if (!hasAnswer(row.response)) return "not_answered";
  if (isUnknownResponse(row.response)) {
    return number(row.score) === 0 && Number(row.is_correct) === 0 && number(row.max_score) > 0
      ? "dont_know_scored" : "invalid_score";
  }
  if (row.status === "pending_review" || Number(row.is_correct) === -1) return "pending_review";
  if (row.question_type === "short_answer") {
    if (grading.isUnavailableGradingResult(row)) return "grading_unavailable";
    if (number(row.ai_score) === null || number(row.ai_confidence) === null
      || Number(row.ai_confidence) < 0.7) return "needs_review";
  }
  const score = number(row.score);
  const max = number(row.max_score);
  if (score === null || max === null || max <= 0 || score < 0 || score > max) return "invalid_score";
  if (row.question_type === "short_answer" && (Number(row.ai_score) < 0
    || Number(row.ai_score) > max || Math.abs(Number(row.ai_score) - score) > 0.11)) return "invalid_score";
  return row.question_type === "short_answer" ? "model_scored_unfrozen" : "objective_scored";
}

function pack(table, rows) {
  return rows.map((row) => Object.fromEntries(Object.entries(schemas[table]).map(([key, [, type]]) => {
    const value = row[key];
    return [key, value === undefined || value === "" ? null
      : type === "number" ? number(value)
        : type === "boolean" ? (typeof value === "boolean" ? value : null) : value];
  })));
}

function buildPackage({ source, protocol, assessmentIndex, generatedAt = new Date().toISOString() }) {
  const experimentId = source.experimentId;
  const roster = new Map(source.participants.map((row) => [row.user_id, row]));
  const commonFields = (row) => ({
    experiment_id: experimentId, user_id: row.user_id,
    condition: roster.get(row.user_id)?.condition || null,
    learning_generation: row.learning_generation ?? null
  });
  const catalog = Array.from(assessmentIndex.values())
    .filter((entry) => entry.chapterId === source.chapterId)
    .map((entry) => ({
      question_id: entry.question.id, unit_id: entry.unitId, phase: entry.phase,
      instrument_version: entry.question.instrumentVersion || null,
      question_digest: crypto.createHash("sha256").update(JSON.stringify(entry.question)).digest("hex"),
      question_type: entry.question.type, points: Number(entry.question.points || 0),
      adaptive_role: entry.question.adaptiveRole || null,
      assessment_status: entry.assessmentStatus || "active",
      question_text: entry.question.question || entry.question.prompt || "",
      answer_key_json: JSON.stringify(entry.question.answer ?? null),
      rubric_json: JSON.stringify(entry.question.rubric || entry.question.commentPrompt || null)
    }));
  const catalogById = new Map(catalog.map((entry) => [entry.question_id, entry]));
  const quizzes = source.quizzes.map((row) => {
    const context = parse(row.research_context_json);
    const entry = catalogById.get(row.question_id);
    const recordedExperiment = row.research_experiment_id || context.experimentId || "";
    const provenance = !recordedExperiment ? "roster_history_unverified"
      : recordedExperiment !== experimentId ? "experiment_mismatch"
        : context.protocolFingerprint !== protocol.fingerprint ? "protocol_mismatch" : "recorded_experiment";
    const catalogMatch = Boolean(context.questionDigest && context.questionDigest === entry?.question_digest
      && context.instrumentVersion && context.instrumentVersion === entry.instrument_version
      && entry.unit_id === row.unit_id && entry.phase === row.phase);
    let state = entry?.assessment_status === "archived" ? "archived_assessment" : scoreState(row);
    let objectiveVerified = null;
    if (catalogMatch && state === "dont_know_scored") {
      objectiveVerified = number(row.max_score) === Number(assessmentIndex.get(row.question_id).question.points);
      if (!objectiveVerified) state = "objective_score_mismatch";
    }
    if (catalogMatch && row.question_type !== "short_answer" && state === "objective_scored") {
      const question = assessmentIndex.get(row.question_id).question;
      const scored = courseAssessment.scoreObjectiveQuestion(question,
        question.type === "multiple" ? parse(row.response, []) : row.response);
      objectiveVerified = scored.score === number(row.score) && scored.maxScore === number(row.max_score)
        && Number(row.is_correct) === (scored.isCorrect ? 1 : 0);
      if (!objectiveVerified) state = "objective_score_mismatch";
    }
    return {
      ...commonFields(row), record_id: row.id, unit_id: row.unit_id, question_id: row.question_id,
      phase: row.phase, question_type: row.question_type, submitted_at: row.created_at, response: row.response,
      response_kind: isUnknownResponse(row.response) ? "dont_know" : hasAnswer(row.response) ? "answer" : "not_answered",
      stored_status: row.status, stored_is_correct: number(row.is_correct),
      raw_score: number(row.score), max_score: number(row.max_score),
      candidate_score: ["objective_scored", "dont_know_scored", "model_scored_unfrozen"].includes(state) ? number(row.score) : null,
      score_state: state, analysis_eligible: provenance === "recorded_experiment" && catalogMatch
        && ["objective_scored", "dont_know_scored"].includes(state) && objectiveVerified === true, provenance,
      instrument_version: context.instrumentVersion || null, question_digest: context.questionDigest || null,
      protocol_fingerprint: context.protocolFingerprint || null, catalog_match: catalogMatch,
      assessment_status: entry?.assessment_status || "unknown",
      objective_score_verified: objectiveVerified,
      ai_score: number(row.ai_score), ai_confidence: number(row.ai_confidence), ai_error_type: row.ai_error_type
    };
  });

  const groups = new Map();
  for (const row of quizzes) {
    const key = JSON.stringify([row.user_id, row.learning_generation, row.unit_id, row.phase, row.instrument_version]);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  const summaries = [];
  for (const rows of groups.values()) {
    const first = rows[0];
    const eligibleCatalog = first.instrument_version
      ? catalog.filter((item) => item.unit_id === first.unit_id && item.phase === first.phase
        && item.instrument_version === first.instrument_version) : [];
    const core = eligibleCatalog.find((item) => item.adaptive_role === "core");
    const corePassed = first.phase === "formative" && core && rows.some((row) =>
      row.question_id === core.question_id && row.objective_score_verified === true && row.stored_is_correct === 1);
    const requiredCatalog = corePassed
      ? eligibleCatalog.filter((item) => item.adaptive_role !== "diagnostic") : eligibleCatalog;
    for (const component of ["objective", "short_answer", "total"]) {
      const includes = (type) => component === "total"
        || (component === "short_answer" ? type === "short_answer" : type !== "short_answer");
      const observations = rows.filter((row) => includes(row.question_type));
      const expected = requiredCatalog.filter((item) => includes(item.question_type));
      const latest = new Map();
      observations.sort((a, b) => (Date.parse(a.submitted_at) || 0) - (Date.parse(b.submitted_at) || 0)
        || a.record_id.localeCompare(b.record_id)).forEach((row) => latest.set(row.question_id, row));
      const selected = [...latest.values()];
      const duplicateCount = observations.length - selected.length;
      const scored = selected.filter((row) => row.candidate_score !== null);
      const complete = expected.length > 0 && selected.length === expected.length
        && expected.every((item) => latest.has(item.question_id))
        && scored.length === expected.length && duplicateCount === 0
        && selected.every((row) => row.catalog_match && row.provenance === "recorded_experiment");
      const observedSum = scored.length ? scored.reduce((sum, row) => sum + row.candidate_score, 0) : null;
      const analysisReady = complete && selected.every((row) => row.analysis_eligible);
      const expectedMax = eligibleCatalog.length ? expected.reduce((sum, item) => sum + item.points, 0) : null;
      summaries.push({
        ...commonFields(first), unit_id: first.unit_id, phase: first.phase,
        instrument_version: first.instrument_version, component,
        record_count: observations.length, answered_items: selected.filter((row) => hasAnswer(row.response)).length,
        expected_items: eligibleCatalog.length ? expected.length : null, scored_items: scored.length,
        observed_score_sum: observedSum, candidate_total: complete ? observedSum : null,
        expected_max_score: expectedMax,
        analysis_score: analysisReady ? observedSum : null, duplicate_question_records: duplicateCount,
        objective_percent: component === "objective" && analysisReady && expectedMax > 0
          ? Math.round(observedSum / expectedMax * 1000000) / 10000 : null,
        status: !observations.length ? (eligibleCatalog.length && expected.length === 0 ? "not_applicable" : "not_started")
          : duplicateCount ? "duplicate_records"
          : !complete ? "incomplete_or_unverified" : analysisReady ? "objective_complete" : "model_score_not_frozen"
      });
    }
  }

  const events = source.events.flatMap((row) => {
    const payload = parse(row.payload);
    const data = payload.data || {};
    const research = payload.research || {};
    const type = String(payload.eventType || data.eventType || "");
    const chapter = payload.chapterId || data.chapter_id || "";
    if (!type.startsWith("courseware_") || (chapter && chapter !== source.chapterId)) return [];
    const recordedExperiment = research.experimentId || "";
    const provenance = !recordedExperiment ? "metadata_missing"
      : recordedExperiment !== experimentId ? "experiment_mismatch"
        : research.protocolFingerprint !== protocol.fingerprint ? "protocol_mismatch"
          : research.condition !== roster.get(row.user_id)?.condition ? "condition_mismatch"
            : number(research.learningGeneration) !== number(row.learning_generation) ? "generation_mismatch"
              : "recorded_experiment";
    return [{
      ...commonFields(row), event_id: row.id, occurred_at: row.created_at, event_type: type,
      recorded_experiment_id: recordedExperiment, provenance, recorded_condition: research.condition,
      protocol_fingerprint: research.protocolFingerprint, semantic_event_id: data.event_id || data.eventId,
      attempt_id: data.attempt_id || data.attemptId, attempt_number: number(data.attempt_number),
      challenge_id: data.challenge_id || data.question_id, resource_id: data.resource_id || payload.resourceId,
      resource_revision: data.contract_revision || data.contractRevision || data.resource_revision || null,
      scene_type: data.scene_type || payload.sceneType,
      unit_id: payload.unitId, knowledge_point_id: data.knowledge_point_id || payload.knowledgePointId,
      independent: typeof data.independent === "boolean" ? data.independent : null,
      hint_count: number(data.hint_count), reset_count: number(data.reset_count),
      correct: typeof data.is_correct === "boolean" ? data.is_correct : null,
      evidence_scope: data.evidence_scope, error_type: data.error_type, selected_zone: data.selected_zone,
      data_json: JSON.stringify(data)
    }];
  });
  const outcomeItems = source.outcomes.flatMap((row) => {
    const items = parse(row.item_results_json, []);
    return (Array.isArray(items) ? items : []).map((item) => ({
      ...commonFields(row), attempt_id: row.id, session_id: row.session_id, stage: row.stage,
      recorded_condition: row.condition,
      instrument_version: row.instrument_version, item_id: item.itemId, construct_id: item.constructId,
      knowledge_point_id: item.knowledgePointId, response: typeof item.response === "string"
        ? item.response : JSON.stringify(item.response ?? null),
      score: number(item.score), max_score: number(item.maxScore),
      correct: typeof item.correct === "boolean" ? item.correct : null, submitted_at: row.submitted_at
    }));
  });
  const recordById = new Map(quizzes.map((row) => [row.record_id, row]));
  const logicalKeys = new Set(quizzes.map((row) => JSON.stringify([row.user_id, row.question_id])));
  const gradeRow = (row, proposed) => {
    const audit = proposed.gradingAudit || {};
    return {
      ...commonFields(row), audit_id: row.id, created_at: row.created_at,
      candidate_score: number(proposed.score), requested_model: audit.requestedModel,
      reported_model: audit.reportedModel, prompt_version: audit.promptVersion,
      prompt_hash: audit.promptHash, rubric_hash: audit.rubricHash,
      rubric_scores_json: Array.isArray(proposed.rubricScores) ? JSON.stringify(proposed.rubricScores) : null,
      previous_grade_json: row.previous_grade_json || null,
      proposed_grade_json: JSON.stringify(proposed),
      applied_grade_json: row.applied_grade_json || null
    };
  };
  const grades = source.initialGrades.flatMap((row) => {
    const input = parse(row.input_summary);
    if (!logicalKeys.has(JSON.stringify([row.user_id, input.questionId]))) return [];
    if (Array.isArray(input.quizResultIds) && input.quizResultIds.length) {
      return [...new Set(input.quizResultIds)].flatMap((id) => {
        const record = recordById.get(id);
        if (!record || record.user_id !== row.user_id || record.question_id !== input.questionId) return [];
        return [{ ...gradeRow({ ...row, learning_generation: record.learning_generation }, parse(row.output_summary)),
          source: "initial_grading", record_id: id, record_link: "record_id", question_id: input.questionId,
          unit_id: record.unit_id, status: "stored_update" }];
      });
    }
    return [{ ...gradeRow(row, parse(row.output_summary)), source: "initial_grading",
      record_id: null, record_link: "logical_question_only", question_id: input.questionId,
      unit_id: input.unitId || null, status: "record_link_unverified" }];
  }).concat(source.regrades.flatMap((row) => {
    const record = recordById.get(row.quiz_result_id);
    if (!record) return [];
    return [{ ...gradeRow({ ...row, learning_generation: record.learning_generation }, parse(row.proposed_grade_json)),
      source: "admin_regrade", record_id: row.quiz_result_id, record_link: "record_id",
      question_id: row.question_id, unit_id: row.unit_id, status: row.status }];
  }));
  const tables = {
    participants: pack("participants", source.participants.map((row) => ({
      ...row, ...commonFields(row), learning_generation: row.current_learning_generation
    }))),
    quiz_attempts: pack("quiz_attempts", quizzes),
    phase_scores: pack("phase_scores", summaries),
    assessment_catalog: pack("assessment_catalog", catalog),
    courseware_events: pack("courseware_events", events),
    outcome_items: pack("outcome_items", outcomeItems),
    outcome_sessions: pack("outcome_sessions", source.sessions.map((row) => ({
      ...row, ...commonFields(row), session_id: row.id, recorded_condition: row.condition
    }))),
    grading_audits: pack("grading_audits", grades),
    proactive_decisions: pack("proactive_decisions", (source.decisions || []).map((row) => ({
      ...row, ...commonFields(row), decision_id: row.id, recorded_condition: row.condition
    })))
  };
  return {
    schema_version: "research-analysis-package-v1", generated_at: generatedAt,
    analysis_plan_suggestion: {
      primary: "post objective_percent with baseline pre objective_percent",
      primary_short_answer_weight: 0,
      secondary: "short_answer separately, only after scoring validation",
      modifies_frozen_protocol: false,
      note: "建议采用客观题标准分作为主要结果、简答单列；不是对已冻结实验协议的追溯修改，也不改变原卷分值。正式研究须预先确认。"
    },
    export_transform_digest: crypto.createHash("sha256").update(fs.readFileSync(__filename)).digest("hex"),
    data_fingerprint: crypto.createHash("sha256").update(JSON.stringify(tables)).digest("hex"),
    scope: { experiment_id: experimentId, chapter_id: source.chapterId, date_filter_applied: false,
      all_learning_generations: true, identity_fields_excluded: ["nickname", "email", "password_hash", "tokens"] },
    warnings: [
      "本包包含学生回答及评分引文，属于受限研究数据，不得公开发布。",
      "名册关联的旧记录不等于本实验有效样本；provenance为roster_history_unverified的记录须核对。",
      "candidate_total是工程候选成绩，不代表量规已校准。简答未人工冻结，analysis_score保持空值。",
      "当前索引目录不是历史题面快照。只有提交摘要匹配时才用于完整分数判定。",
      "初次评分历史审计只有逻辑题号关联，不按时间猜配到某条重置前后作答。",
      "analysis_score仅表示通过版本、分数与客观判分核验，不代表已满足知情同意、抽样或统计分析的全部纳入条件。",
      "未作答者保留在参与者表；不得只保留有完整测量的学生来冒充全部样本。",
      "课件事件保留逐次证据，未在此把奖励分或位置操作转换为概念成绩。"
    ],
    protocol,
    dictionary: Object.fromEntries(Object.entries(schemas).map(([table, fields]) => [table,
      Object.entries(fields).map(([field, [label, type]]) => ({
        field, label, type, nullable: true, missing_value: null, meaning: meanings[field] || ""
      }))])),
    tables,
    counts: Object.fromEntries(Object.entries(tables).map(([table, rows]) => [table, rows.length]))
  };
}

module.exports = { buildPackage, scoreState, schemas };
