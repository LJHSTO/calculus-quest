"use strict";

const USER_TABLES = [
  "quiz_results", "events", "snapshots", "learning_state_versions", "feedback",
  "learning_notes", "learning_assistant_messages", "learning_assistant_conversations",
  "learning_assistant_daily_usage", "agent_decisions", "interaction_evidence_snapshots",
  "experiment_assignments", "proactive_participation", "proactive_decisions",
  "proactive_interventions", "proactive_policy_state", "proactive_outcome_sessions",
  "proactive_outcome_attempts", "grading_regrade_audits"
];

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
    return result;
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
    schema_version: "selected-participant-package-v1",
    generated_at: new Date().toISOString(),
    selected_user_ids: ids,
    scope: { dates: "all_history", generations: "all", includes_personal_data: true },
    notice: "本包包含昵称、邮箱及原始学习记录，请按被试数据保密要求保存。共享实验协议和暂停记录仅作实验背景。",
    exclusions: ["登录令牌", "密码及密码哈希", "未选中用户数据", "其他参与者的实验汇总"],
    counts: Object.fromEntries(Object.entries(tables).map(([name, items]) => [name, items.length])),
    tables
  };
}

module.exports = { buildSelectedParticipantPackage };
