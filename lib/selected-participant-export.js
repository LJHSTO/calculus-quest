"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");

const USER_TABLES = [
  "quiz_results", "events", "snapshots", "learning_state_versions", "feedback",
  "learning_notes", "learning_assistant_messages", "learning_assistant_conversations",
  "learning_assistant_daily_usage", "agent_decisions", "interaction_evidence_snapshots",
  "experiment_assignments", "proactive_participation", "proactive_decisions",
  "proactive_interventions", "proactive_policy_state", "proactive_outcome_sessions",
  "proactive_outcome_attempts", "grading_regrade_audits"
];

// Field names that carry a point in time. The value must ALSO look like a full
// ISO-8601 instant before anything is rewritten, so plain date keys such as
// learning_assistant_daily_usage.usage_date ("2026-09-21") pass through untouched.
const TIMESTAMP_FIELD = /(_at|_time|At|Time)$/;
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;
const ORDER_FIELDS = ["created_at", "at", "updated_at", "shown_at", "resolved_at", "assigned_at"];

/**
 * Rewrite an instant to UTC without changing the moment it denotes.
 *
 * Stored rows are written by beijingIso() (+08:00) while package metadata is
 * UTC Z, so one file mixed both forms. That broke lexical sorting and any
 * slice(0, 10) day bucketing. Normalising to UTC makes string order equal
 * chronological order; values that are not full ISO instants are left alone.
 */
function toUtcInstant(value) {
  if (typeof value !== "string" || !ISO_INSTANT.test(value)) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

function normalizeTimestamps(row) {
  const output = {};
  for (const [field, value] of Object.entries(row)) {
    const converted = TIMESTAMP_FIELD.test(field) ? toUtcInstant(value) : null;
    output[field] = converted === null ? value : converted;
  }
  return output;
}

/** Chronological order. ISO-UTC strings compare correctly as strings. */
function sortByTime(rows) {
  if (rows.length < 2) return rows;
  const field = ORDER_FIELDS.find((candidate) => rows.some(
    (row) => typeof row[candidate] === "string" && ISO_INSTANT.test(row[candidate])
  ));
  if (!field) return rows;
  return [...rows].sort((left, right) => String(left[field] || "").localeCompare(String(right[field] || "")));
}

function inferType(value) {
  if (value === null || value === undefined) return "unknown";
  if (typeof value === "number") return Number.isInteger(value) ? "integer" : "number";
  if (typeof value === "boolean") return "boolean";
  if (typeof value === "string") return "string";
  return "object";
}

// Meanings for the values a reader cannot interpret without help. Raw column
// values are kept as-is (they are the source of truth); this is a label registry,
// not a validation schema.
const MEANINGS = Object.freeze({
  phase: "pre=前测；formative=形成性；post=后测；retention=保持测",
  question_type: "single=单选；multiple=多选；short_answer=简答",
  is_correct: "1=正确；0=错误；-1=待评分（不是错误）",
  status: "题目或干预的生命周期状态；空串表示该表不使用该状态",
  condition: "control=对照组；treatment_full=完整主动组（treatment_shallow 已废弃）",
  decision: "intervene=应介入；stay_silent=保持安静",
  action: "教学动作，见 lib/proactive-policy/adapters/v14-c3.js 的 ACTION_PROFILES",
  support_level: "L0=前置补偿；L1..L5=支架等级；不介入不是 L0",
  policy_mode: "off=关闭；shadow=只记录不展示；active=可展示",
  candidate_kind: "触发来源：repeated_parameter/quiz_review/quiet_dwell/formative_outcome/"
    + "independent_attempt_outcome/student_requested_alternative",
  resolution: "accepted/dismissed/ignored/snoozed/expired/alternative_requested/scope_muted 等",
  student_preference: "standard=标准；reduced=更少；off=关闭主动提示",
  scope_preference: "同 student_preference，但作用域为单个知识点",
  current_level: "该知识点当前生效的支架等级 L0..L5",
  learning_generation: "学习代次；同一学生重学同一章会递增，跨代次不可直接合并",
  evidence_scope: "该条证据的作用域，例如 post_support_local_check、courseware_challenge",
  independent: "true=本次提交前无提示且无重置；false=有辅助，不能当作独立掌握证据"
});

function buildDictionary(tables) {
  return Object.fromEntries(Object.entries(tables).map(([table, rows]) => {
    const fields = new Map();
    for (const row of rows) {
      for (const [field, value] of Object.entries(row)) {
        const observed = fields.get(field) || { types: new Set(), nullable: false };
        observed.types.add(inferType(value));
        if (value === null || value === undefined) observed.nullable = true;
        fields.set(field, observed);
      }
    }
    return [table, [...fields.entries()].map(([field, observed]) => ({
      field,
      type: observed.types.size === 1 ? [...observed.types][0] : [...observed.types].join("|"),
      nullable: observed.nullable || rows.length === 0,
      missing_value: null,
      time_zone: TIMESTAMP_FIELD.test(field) ? "UTC" : "",
      meaning: MEANINGS[field] || ""
    }))];
  }));
}

function fail(status, message) {
  throw Object.assign(new Error(message), { status });
}

function buildSelectedParticipantPackage(db, requestedIds, { maxRows = 200000, maxBytes = 64 * 1024 * 1024 } = {}) {
  if (!Array.isArray(requestedIds) || !requestedIds.length || requestedIds.length > 200
    || requestedIds.some(id => typeof id !== "string" || !id.trim() || id.length > 200)) {
    fail(400, "请选择 1 至 200 位用户。");
  }
  const ids = [...new Set(requestedIds)];
  const placeholders = ids.map(() => "?").join(",");
  let rows = 0, bytes = 0;
  function read(sql, params) {
    const statement = db.prepare(sql);
    const result = [];
    try {
      statement.bind(params);
      while (statement.step()) {
        const row = statement.getAsObject();
        bytes += Buffer.byteLength(JSON.stringify(row), "utf8");
        if (++rows > maxRows || bytes > maxBytes) fail(413, "所选数据过大，未导出截断数据。请减少人数或使用离线导出。");
        result.push(row);
      }
    } finally {
      statement.free();
    }
    return sortByTime(result.map(normalizeTimestamps));
  }
  const tables = {
    users: read(`SELECT id,nickname,email,created_at,last_seen_at,profile_updated_at FROM users WHERE id IN (${placeholders}) ORDER BY id`, ids)
  };
  if (tables.users.length !== ids.length) fail(400, "部分所选用户已不存在，请刷新用户列表后重试。");
  // Session metadata is useful; bearer tokens and password hashes must never leave the server.
  tables.sessions = read(`SELECT user_id,created_at,last_seen_at,expires_at,revoked_at FROM sessions WHERE user_id IN (${placeholders})`, ids);
  for (const table of USER_TABLES) {
    tables[table] = read(`SELECT * FROM ${table} WHERE user_id IN (${placeholders})`, ids);
  }
  const experiments = [...new Set(Object.values(tables).flatMap(items => items.map(row => row.experiment_id).filter(Boolean)))];
  for (const table of ["proactive_protocol_snapshots", "proactive_experiment_runtime", "proactive_experiment_runtime_events"]) {
    tables[table] = experiments.length
      ? read(`SELECT * FROM ${table} WHERE experiment_id IN (${experiments.map(() => "?").join(",")})`, experiments)
      : [];
  }
  return {
    schema_version: "selected-participant-package-v2",
    generated_at: new Date().toISOString(),
    selected_user_ids: ids,
    scope: {
      dates: "all_history",
      generations: "all",
      includes_personal_data: true,
      timestamps_normalized_to: "UTC",
      ordering: "chronological within each table (by the table's own created_at/at field when present)"
    },
    // Which rule was applied to which kind of field, so a reader can reproduce it.
    time_normalization: {
      rule: "fields ending in _at/_time/At/Time whose value is a full ISO-8601 instant are rewritten as UTC Z",
      untouched: "values that are not full ISO instants (e.g. usage_date '2026-09-21') and all other fields",
      nested: "timestamps inside JSON text columns (evidence_snapshot_json, payload, ...) are NOT rewritten"
    },
    notice: "本包包含昵称、邮箱及原始学习记录，请按被试数据保密要求保存。共享实验协议和暂停记录仅作实验背景。",
    exclusions: ["登录令牌", "密码及密码哈希", "未选中用户数据", "其他参与者的实验汇总"],
    // Reproducibility: same rows => same fingerprint; same code => same digest.
    export_transform_digest: crypto.createHash("sha256").update(fs.readFileSync(__filename)).digest("hex"),
    data_fingerprint: crypto.createHash("sha256").update(JSON.stringify(tables)).digest("hex"),
    dictionary: buildDictionary(tables),
    counts: Object.fromEntries(Object.entries(tables).map(([name, items]) => [name, items.length])),
    tables
  };
}

module.exports = { buildSelectedParticipantPackage };
