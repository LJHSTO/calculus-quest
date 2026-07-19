const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cq-feedback-db-"));
process.env.DB_PATH = path.join(tmpDir, "feedback.db");

const db = require("../db");
let feedbackModule = {};
try {
  feedbackModule = require("../lib/feedback");
} catch {}

assert.equal(typeof feedbackModule.normalizeFeedbackInput, "function", "normalizeFeedbackInput must exist");
assert.equal(
  typeof feedbackModule.validateCoursewareFeedbackTarget,
  "function",
  "validateCoursewareFeedbackTarget must exist"
);
assert.equal(typeof db.insertFeedback, "function", "db.insertFeedback must exist");
assert.equal(typeof db.feedbackDashboard, "function", "db.feedbackDashboard must exist");

const {
  normalizeFeedbackInput,
  buildCoursewareFeedbackTargetLookup,
  validateCoursewareFeedbackTarget
} = feedbackModule;

async function main() {
  await db.getDb();
  const now = new Date().toISOString();

  const empty = normalizeFeedbackInput({ feedbackType: "learning_content", content: "   " });
  assert.equal(empty.ok, false);
  assert.equal(empty.code, "feedback_content_required");

  const invalidType = normalizeFeedbackInput({ feedbackType: "unknown", content: "建议" });
  assert.equal(invalidType.ok, false);
  assert.equal(invalidType.code, "feedback_type_invalid");

  const tooLong = normalizeFeedbackInput({
    feedbackType: "other",
    content: "建".repeat(2001)
  });
  assert.equal(tooLong.ok, false);
  assert.equal(tooLong.code, "feedback_content_too_long");

  const normalized = normalizeFeedbackInput({
    feedbackType: "courseware",
    content: "  拖动滑块后图像没有变化。  ",
    targetScope: "courseware",
    chapterId: "V14-C1",
    moduleId: "V14-C1-M1",
    unitId: "V14-C1-M1-KP1",
    knowledgePoint: "函数与变化",
    sceneType: "simulation",
    resourceFile: "demo.html",
    resourceTitle: "函数变化拖动实验",
    currentView: "feedback"
  });
  assert.equal(normalized.ok, true);
  assert.equal(normalized.value.content, "拖动滑块后图像没有变化。");
  assert.equal(normalized.value.target_scope, "courseware");

  let fallbackLookupCalled = false;
  const routeTargetLookup = buildCoursewareFeedbackTargetLookup(
    {
      chapters: [{
        id: "V14-C1",
        modules: [{
          id: "GH-01",
          knowledgePoints: [{
            id: "V14-C1-M1-KP1",
            name: "函数与变化",
            resourceCandidates: [{
              file: "demo.html",
              title: "函数变化拖动实验（route）",
              type: "simulation"
            }]
          }]
        }]
      }]
    },
    () => {
      fallbackLookupCalled = true;
      return null;
    }
  );
  const canonicalTarget = validateCoursewareFeedbackTarget(normalized.value, routeTargetLookup);
  assert.equal(canonicalTarget.ok, true);
  assert.equal(fallbackLookupCalled, false, "route target must not depend on the KG fallback");
  assert.equal(canonicalTarget.value.module_id, "GH-01");
  assert.equal(canonicalTarget.value.resource_title, "函数变化拖动实验（route）");

  const lectureTarget = validateCoursewareFeedbackTarget(
    {
      ...normalized.value,
      scene_type: "slide",
      resource_file: "",
      resource_title: "伪造讲解页标题"
    },
    routeTargetLookup
  );
  assert.equal(lectureTarget.ok, true);
  assert.equal(lectureTarget.value.scene_type, "slide");
  assert.equal(lectureTarget.value.resource_file, "");
  assert.equal(lectureTarget.value.resource_title, "函数与变化 · 讲解页");

  const forgedTarget = validateCoursewareFeedbackTarget(
    { ...normalized.value, resource_file: "forged.html" },
    () => ({
      id: "V14-C1-M1-KP1",
      kind: "unit",
      role: "knowledge",
      resourceCandidates: [{ file: "demo.html", title: "合法课件", type: "simulation" }]
    })
  );
  assert.equal(forgedTarget.ok, false);
  assert.equal(forgedTarget.code, "feedback_target_invalid");

  const platform = normalizeFeedbackInput({
    feedbackType: "platform",
    content: "希望按钮更明显。",
    targetScope: "courseware",
    resourceFile: "should-not-persist.html",
    currentView: "feedback"
  });
  assert.equal(platform.ok, true);
  assert.equal(platform.value.target_scope, "global");
  assert.equal(platform.value.resource_file, "");

  db.upsertUser("u-feedback", "反馈学生", now, now);
  db.insertEvent({
    id: "event-before",
    user_id: "u-feedback",
    type: "unit_enter",
    payload: {},
    created_at: now
  });
  db.insertSnapshot({
    id: "snapshot-before",
    user_id: "u-feedback",
    reason: "test",
    data: { completed: ["u1"], note: "历史反思保留" },
    created_at: now
  });

  db.insertFeedback({
    id: "feedback-global",
    user_id: "u-feedback",
    ...platform.value,
    created_at: now
  });
  db.insertFeedback({
    id: "feedback-courseware",
    user_id: "u-feedback",
    ...normalized.value,
    created_at: new Date(Date.now() + 1000).toISOString()
  });

  const dashboard = db.feedbackDashboard({});
  assert.equal(dashboard.summary.total, 2);
  assert.equal(dashboard.summary.courseware, 1);
  assert.equal(dashboard.summary.users, 1);
  assert.equal(dashboard.summary.targets, 1);
  assert.equal(dashboard.summary.byType.platform, 1);
  assert.equal(dashboard.summary.byType.courseware, 1);
  assert.equal(dashboard.rows[0].content, "拖动滑块后图像没有变化。");
  assert.equal(dashboard.rows[0].nickname, "反馈学生");
  assert.ok(dashboard.rows[0].chapter_label);
  assert.doesNotMatch(dashboard.rows[0].unit_label, /V14-C1|GH-01/);

  const filtered = db.feedbackDashboard({ feedbackType: "platform" });
  assert.deepEqual(filtered.rows.map((row) => row.id), ["feedback-global"]);

  const detail = db.userDetail("u-feedback", {});
  assert.equal(detail.eventCount, 1);
  assert.equal(detail.researchSummary.feedbackCount, 2);
  assert.equal(detail.researchSummary.activeDays, 1);

  const learningState = db.getLearningSnapshotState("u-feedback", now);
  const reset = db.resetLearningSnapshot({
    id: "feedback-reset-snapshot",
    user_id: "u-feedback",
    data: { completed: [], quizResults: [], note: "" },
    generation: learningState.generation,
    baseRevision: learningState.revision,
    created_at: new Date(Date.now() + 2000).toISOString()
  });
  assert.equal(reset.ok, true);
  assert.equal(db.feedbackDashboard({ query: "希望按钮" }).summary.total, 1);

  db.saveNow();
  fs.rmSync(tmpDir, { recursive: true, force: true });
  console.log("learning feedback database tests passed");
}

main().catch((error) => {
  try {
    db.saveNow();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {}
  console.error(error);
  process.exitCode = 1;
});
