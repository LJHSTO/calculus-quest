const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

async function main() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cq-interaction-quality-"));
  const dbPath = path.join(tmpDir, "interaction-quality.db");
  process.env.DB_PATH = dbPath;

  const policy = require("../lib/interaction-policy");
  const db = require("../db");
  await db.getDb();

  const userId = "interaction-quality-user";
  const unitId = "GH-01-K01";
  const sessionId = "interaction-quality-session";
  db.upsertUser(userId, "交互质量测试", "2026-07-18T09:00:00.000+08:00", "2026-07-18T09:00:00.000+08:00");

  const insertInteraction = (id, eventType, sequenceIndex, data, createdAt) => {
    db.insertEvent({
      id,
      user_id: userId,
      type: "interaction",
      payload: {
        eventType,
        sessionId,
        sequenceIndex,
        chapterId: "V14-C1",
        chapterLabel: "函数、极限与导数入口",
        unitId,
        unitLabel: unitId,
        timing: {
          clientAt: createdAt,
          durationMs: Number(data.durationMs || 0)
        },
        data
      },
      created_at: createdAt
    });
  };

  insertInteraction("event-enter", "unit_enter", 1, { unitId }, "2026-07-18T09:00:00.000+08:00");
  insertInteraction("event-wheel", "ui_wheel", 2, { unitId, deltaY: 120 }, "2026-07-18T09:00:05.000+08:00");
  insertInteraction("event-change", "ui_change", 3, { unitId, label: "A", valueSummary: "选中" }, "2026-07-18T09:00:06.000+08:00");
  insertInteraction("event-generic-click", "click", 4, { unitId, text: "知识怎么连" }, "2026-07-18T09:00:07.000+08:00");
  insertInteraction("event-switch-view", "switch_view", 5, { from: "home", to: "learn" }, "2026-07-18T09:00:08.000+08:00");
  insertInteraction("event-online-period", "online_period", 6, { unitId, seconds: 5 }, "2026-07-18T09:00:09.000+08:00");
  insertInteraction(
    "event-scene-select",
    "knowledge_scene_select",
    7,
    {
      unitId,
      sceneType: "game",
      sceneLabel: "找错并改正",
      resourceTitle: "函数机器误解修复挑战"
    },
    "2026-07-18T09:00:10.000+08:00"
  );
  insertInteraction(
    "event-time",
    "time_on_unit",
    8,
    {
      unitId,
      seconds: 30,
      durationMs: 30000
    },
    "2026-07-18T09:00:30.000+08:00"
  );
  insertInteraction(
    "event-leave",
    "unit_leave",
    9,
    { unitId, seconds: 30, durationMs: 30000 },
    "2026-07-18T09:00:30.000+08:00"
  );
  insertInteraction(
    "event-click",
    "interactive_click",
    10,
    { unitId, label: "函数规则按钮", source: "iframe" },
    "2026-07-18T09:00:31.000+08:00"
  );
  db.insertEvent({
    id: "event-legacy-switch-view",
    user_id: userId,
    type: "switch_view",
    payload: { view: "learn" },
    created_at: "2026-07-18T09:00:32.000+08:00"
  });
  db.insertEvent({
    id: "event-legacy-login",
    user_id: userId,
    type: "login",
    payload: {},
    created_at: "2026-07-18T09:00:33.000+08:00"
  });

  assert.equal(policy.isMeaningfulEventType("ui_wheel"), false);
  assert.equal(policy.isMeaningfulEventType("ui_change"), false);
  assert.equal(policy.isMeaningfulEventType("click"), false);
  assert.equal(policy.isMeaningfulEventType("online_period"), false);
  assert.equal(policy.isMeaningfulEventType("switch_view"), false);
  assert.equal(policy.isMeaningfulEventType("interactive_click"), true);

  const meaningful = db.getEventsByType("interaction", {
    limit: 20,
    offset: 0,
    userId,
    detailMode: "meaningful"
  });
  const raw = db.getEventsByType("interaction", {
    limit: 20,
    offset: 0,
    userId,
    detailMode: "all"
  });
  assert.equal(meaningful.total, 4);
  assert.equal(raw.total, 10);
  assert.deepEqual(
    new Set(meaningful.rows.map((row) => JSON.parse(row.payload).eventType)),
    new Set(["unit_enter", "knowledge_scene_select", "time_on_unit", "interactive_click"])
  );

  const summary = db.interactionSummary({ userId });
  assert.equal(summary.total, 4);
  assert.equal(summary.rawTotal, 10);
  assert.equal(summary.hiddenLowValue, 6);
  assert.deepEqual(summary.byRole, [{ module_role: "knowledge_point", count: 4 }]);

  const engagement = db.unitEngagement({ userId });
  assert.equal(engagement.length, 1);
  assert.equal(engagement[0].seconds, 30, "time_on_unit and unit_leave must not double count");
  assert.equal(engagement[0].unit_label, "输入、输出和函数规则");

  const paths = db.pathAnalysis({ userId });
  assert.equal(paths.length, 1);
  assert.equal(paths[0].total_seconds, 30);
  assert.equal(paths[0].step_count, 1);
  assert.equal(paths[0].steps[0].unit_label, "输入、输出和函数规则");
  assert.equal(paths[0].steps[0].scene_type, "game");
  assert.equal(paths[0].steps[0].scene_label, "找错并改正");
  assert.equal(paths[0].steps[0].display_label, "输入、输出和函数规则 · 找错并改正");
  assert.doesNotMatch(paths[0].path_preview, /GH-01|V14-C1/);

  const coverage = db.interactionDashboard({ userId }).actionCoverage;
  assert.equal(coverage.total, 1);
  assert.equal(coverage.types[0].event_type, "interactive_click");

  db.insertEvent({
    id: "event-login-success",
    user_id: userId,
    type: "interaction",
    payload: { eventType: "login_success", unitId, data: {} },
    created_at: "2026-07-18T09:00:38.000+08:00"
  });
  const detail = db.userDetail(userId, {});
  const detailEventTypes = detail.events.map((row) => {
    if (row.type !== "interaction") return row.type;
    return JSON.parse(row.payload || "{}").eventType || "interaction";
  });
  assert.equal(detailEventTypes.includes("switch_view"), false);
  assert.equal(detailEventTypes.includes("ui_wheel"), false);
  assert.equal(
    detailEventTypes.some((type) => type === "login" || type === "login_success"),
    true
  );
  assert.equal(detailEventTypes.includes("interactive_click"), true);
  assert.equal(
    detailEventTypes.filter((type) => type === "login" || type === "login_success").length,
    1
  );

  db.saveNow();
  fs.rmSync(tmpDir, { recursive: true, force: true });
  console.log("interaction quality tests passed");
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
