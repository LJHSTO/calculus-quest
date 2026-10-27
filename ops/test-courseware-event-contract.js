const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { normalize, V2 } = require("../app/main/courseware-event-contract.js");

const event = {
  schemaVersion: V2, eventType: "challenge_result",
  chapterId: "course-1", knowledgePointId: "concept-1",
  sceneId: "scene-1", taskId: "task-1", attemptId: "attempt-1",
  attemptNumber: 2, isCorrect: false, independenceLevel: "independent",
  errorCategory: "width-height", timestamp: "2026-09-08T12:00:00Z"
};
const normalized = normalize(event);
assert.equal(normalized.attempt_id, "attempt-1");
assert.equal(normalized.is_correct, false);
assert.equal(normalized.error_type, "width-height");
assert.equal(normalized.independence_level, "independent");
assert.equal(normalized.independent, undefined, "契约阶段不能替代独立作答证据");
assert.equal(normalize({ isCorrect: "false" }).is_correct, undefined);
assert.equal(normalize({ independent: "true" }).independent, undefined);
assert.equal(normalize({ independent: true, hintCount: 1 }).independent, false);
assert.equal(normalize({ independent: true, hintCount: 0 }).independent, true);
assert.deepEqual(normalize({ event_type: "challenge_result", is_correct: true }), {
  event_type: "challenge_result", is_correct: true
});
const nested = { ...event, eventType: "scene_completed" };
assert.equal(normalize({
  event_type: "interaction_complete", interaction_state: nested, timestamp: event.timestamp
}), null, "显式旧版副本不应重复计数");
assert.ok(normalize({
  event_type: "interaction_complete", interaction_state: nested, timestamp: "different"
}), "不能丢掉不同时间的独立事件");
assert.ok(normalize({
  event_type: "challenge_result", interaction_state: event, timestamp: event.timestamp
}), "不能按内容相同删除真实挑战");
assert.equal(normalize(null), null);
assert.equal(normalize([]), null);
const received = [];
const sandbox = {
  window: { CoursewareEventContract: { normalize } },
  getUnit: (id) => ({ id, chapterId: "platform-chapter", label: "平台绑定课件" }),
  currentUnitId: "unit-1",
  currentChapterId: "platform-chapter",
  trackInteraction: (type, payload) => received.push({ type, payload })
};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname, "../app/main/render-learning.js"), "utf8"), sandbox);
const frame = {
  closest: () => ({ dataset: { resourceUnit: "unit-1" } }),
  dataset: { contextSceneType: "simulation" }, title: "实际课件"
};
assert.equal(sandbox.trackCoursewareLearningEvent(frame, { payload: event }), true);
assert.equal(received[0].type, "courseware_challenge_result");
assert.equal(received[0].payload.attempt_id, "attempt-1");
assert.equal(received[0].payload.is_correct, false);
assert.equal(received[0].payload.task_id, "task-1");
assert.equal(received[0].payload.chapterId, "platform-chapter");
assert.equal(sandbox.trackCoursewareLearningEvent(frame, { payload: {
  event_type: "interaction_complete", interaction_state: nested, timestamp: nested.timestamp
} }), false);
assert.equal(received.length, 1);
assert.equal(sandbox.trackCoursewareLearningEvent(frame, { payload: {
  schemaVersion: V2, eventType: "representation_switched", strategyTag: "compare"
} }), true);
assert.equal(received[1].type, "courseware_representation_switched");
assert.equal(received[1].payload.strategy_tag, "compare");
assert.equal(sandbox.trackCoursewareLearningEvent(frame, { payload: {
  schemaVersion: V2, eventType: "parameter_changed", parameter: "n", value: 8, previousValue: 4
} }), true);
assert.equal(received[2].payload.parameter, "n");
assert.equal(received[2].payload.value, 8);
assert.equal(received[2].payload.previous_value, 4);
assert.equal(sandbox.trackCoursewareLearningEvent(frame, { payload: {
  event_type: "unknown-event"
} }), false);
console.log("OpenMAIC 事件适配测试通过：新旧字段、兼容副本与独立作答证据边界。");
const exploration=require('../resources/open-maic/主动探索证据/exploration-model');
const point=exploration.points[0],task=exploration.get(point,'simulation');
for(const response of task.options.map((_,i)=>i)){
 const payload={event_type:'challenge_result',task_version:exploration.version,scene_type:'simulation',knowledge_point_id:point,challenge_id:`${point}:simulation:concept`,response,independent:false,evidence_scope:'concept_exploration_attempt',feedback_seen:true};
 assert.equal(sandbox.trackCoursewareLearningEvent(frame,{payload}),true);
 const persisted=received.at(-1).payload;
 assert.equal(persisted.task_version,exploration.version);
 assert.equal(persisted.feedback_seen,true);
 assert.equal(require('../lib/assisted-game-evidence').grade(persisted,point),response===task.answer,'iframe→主页面→服务端复核不丢失任务版本');
}
