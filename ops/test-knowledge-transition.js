const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const coreSource = fs.readFileSync(path.join(root, "app/main/core.js"), "utf8");
const agenticSource = fs.readFileSync(path.join(root, "app/main/agentic-path.js"), "utf8");
const navigationSource = fs.readFileSync(path.join(root, "app/main/navigation.js"), "utf8");
const coreCompatibilitySource = coreSource.slice(
  coreSource.indexOf("function learningQuizUnitId"),
  coreSource.indexOf("function loadState")
);

function unit(id, chapterId, sceneOrder, type = "knowledge", assessmentPhase = "", options = {}) {
  return {
    id,
    chapterId,
    sceneOrder,
    type,
    assessmentPhase,
    label: id,
    adaptiveFormative: type === "quiz" && assessmentPhase === "formative" && Boolean(options.questions),
    knowledgePointId: options.knowledgePointId || (type === "knowledge" ? id : ""),
    placeholderQuiz: options.questions ? false : true,
    scene: { content: { questions: options.questions || [] } }
  };
}

const checkQuestions = [
  { id: "KP1-check-q1", type: "single" },
  { id: "KP1-check-q2", type: "multiple" }
];
const c1 = {
  id: "C1",
  label: "第一章",
  order: 1,
  track: "main",
  units: [
    unit("C1-pre", "C1", 1, "quiz", "pre"),
    unit("KP1", "C1", 2),
    unit("KP1-formative", "C1", 3, "quiz", "formative", { knowledgePointId: "KP1", questions: checkQuestions }),
    unit("KP2", "C1", 4),
    unit("KP2-formative", "C1", 5, "quiz", "formative", { knowledgePointId: "KP2", questions: checkQuestions.map((q) => ({ ...q, id: q.id.replace("KP1", "KP2") })) }),
    unit("C1-review", "C1", 6, "slide"),
    unit("C1-post", "C1", 7, "quiz", "post")
  ]
};
const c2 = {
  id: "C2",
  label: "第二章",
  order: 2,
  track: "main",
  units: [unit("C2-pre", "C2", 1, "quiz", "pre")]
};
const curriculum = [c1, c2];
const allUnits = curriculum.flatMap((chapter) => chapter.units);
const analyticsEvents = [];
const snapshotSyncReasons = [];
let knowledgeTransitionFocusCalls = 0;

function freshState(overrides = {}) {
  return {
    completed: [],
    submittedQuizzes: [],
    quizResults: [],
    quizAttempts: {},
    quizDrafts: {},
    selectedKnowledgeScenes: {},
    knowledgeTransitionChoices: {},
    pendingKnowledgeTransition: null,
    logs: [],
    returnToQuiz: null,
    agenticPath: null,
    ...overrides
  };
}

const context = vm.createContext({
  console,
  curriculum,
  chapters: curriculum,
  state: freshState(),
  currentChapterId: "C1",
  currentUnitId: "KP1",
  AGENTIC_CORE_SCENE_ORDERS: [],
  AGENTIC_RELEARN_SCENE_ORDERS: [],
  AGENTIC_EXTENSION_SCENE_ORDERS: [],
  AGENTIC_ENABLE_EXTENSION: false,
  isMultiSceneLearningRoute: () => true,
  getChapter(id) {
    return curriculum.find((chapter) => chapter.id === (id || context.currentChapterId)) || null;
  },
  findMainUnit(id) {
    return allUnits.find((item) => item.id === id) || null;
  },
  getUnit(id) {
    return context.findMainUnit(id || context.currentUnitId);
  },
  selectedKnowledgeSceneType(id) {
    const unitId = typeof id === "object" ? id.id : id;
    return context.state.selectedKnowledgeScenes?.[unitId || context.currentUnitId] || "";
  },
  moduleRoleForUnit: () => "knowledge",
  siblingLearningScenes: () => [],
  quizResourceReviewContext: () => null,
  addLog(message) {
    context.state.logs.unshift(message);
  },
  analyticsTrack(type, payload) {
    analyticsEvents.push({ type, payload });
  },
  analyticsEnterUnit: () => {},
  trackLearningEvent: () => {},
  syncLearningSnapshot: async (reason) => {
    snapshotSyncReasons.push(reason);
  },
  saveState: () => {},
  renderAll: () => {},
  renderAgenticCoachPanel: () => {},
  focusAgenticCoachPanel: () => {},
  beijingNow: () => "2026-08-19T10:00:00+08:00",
  escapeHtml: (value) => String(value || ""),
  document: {
    querySelector: () => null,
    querySelectorAll: () => []
  },
  window: {
    setTimeout,
    scrollTo: () => {}
  },
  CustomEvent: class CustomEvent {}
});

context.ensureChapterLoaded = async () => {};
context.selectChapter = async (chapterId) => {
  context.currentChapterId = chapterId;
  return true;
};
context.selectUnit = (unitId) => {
  const target = context.findMainUnit(unitId);
  if (!target) return false;
  context.currentChapterId = target.chapterId;
  context.currentUnitId = target.id;
  return true;
};

vm.runInContext(coreCompatibilitySource, context, { filename: "app/main/core-compatibility.js" });
vm.runInContext(agenticSource, context, { filename: "app/main/agentic-path.js" });
vm.runInContext(navigationSource, context, { filename: "app/main/navigation.js" });
context.renderAll = () => {};
context.focusKnowledgeTransitionChoice = () => {
  knowledgeTransitionFocusCalls += 1;
  return true;
};

function reset(overrides = {}) {
  context.state = freshState(overrides.state || {});
  context.currentChapterId = overrides.chapterId || "C1";
  context.currentUnitId = overrides.unitId || "KP1";
  analyticsEvents.length = 0;
  snapshotSyncReasons.length = 0;
  knowledgeTransitionFocusCalls = 0;
  context.ensureAgenticPath();
}

function testSelectedSceneShowsTransitionPreview() {
  reset({
    state: {
      selectedKnowledgeScenes: { KP1: "simulation" },
      agenticPath: { unlocked: ["KP1"], visibleUnits: ["KP1"] }
    }
  });
  const preview = context.agenticKnowledgeTransitionPreviewFor(context.getUnit("KP1"));
  assert.equal(preview?.knowledgeUnitId, "KP1");
  assert.equal(preview?.formativeUnitId, "KP1-formative");
  assert.equal(preview?.targetUnitId, "KP2");
  assert.equal(context.state.pendingKnowledgeTransition, null, "互动尚未完成时不能提前写入选择状态");

  const markup = context.agenticRenderKnowledgeTransitionPreviewPanel(preview);
  assert.match(markup, /完成当前互动后，选择下一步/);
  assert.match(markup, /互动场景已经选好/);
  assert.match(markup, /data-knowledge-transition-stage="preview"/);
  assert.match(markup, /完成互动后可选：/);
  assert.match(markup, /<strong>直接继续<\/strong>/);
  assert.match(markup, /<strong>做小题测一测<\/strong>/);
  assert.doesNotMatch(markup, /data-knowledge-transition=/);

  const active = {
    knowledgeUnitId: "KP1",
    formativeUnitId: "KP1-formative",
    targetUnitId: "KP2",
    chapterId: "C1"
  };
  assert.match(context.agenticRenderKnowledgeTransitionPanel(active, "continue"), /跳过小测直接进入「KP2」/);
  assert.match(context.agenticRenderKnowledgeTransitionPanel(active, "formative"), /正在打开即时检测/);
  assert.doesNotMatch(context.agenticRenderKnowledgeTransitionPanel(active, "continue"), /正在进入/);
  assert.doesNotMatch(context.agenticRenderKnowledgeTransitionPanel(active, "continue"), /正在继续/);
}

async function testCompletionCreatesChoice() {
  reset({
    state: {
      selectedKnowledgeScenes: { KP1: "simulation" },
      agenticPath: { unlocked: ["KP1"], visibleUnits: ["KP1"] }
    }
  });
  assert.equal(
    context.agenticCompletionCta(context.getUnit("KP1")).label,
    "完成本节并选择下一步",
    "知识点完成前应说明下一步还需要由学生选择"
  );
  const completed = await context.completeAndAdvanceCurrentUnit({ preventDefault() {} });
  assert.equal(completed, true);
  assert.deepEqual(Array.from(context.state.completed), ["KP1"]);
  assert.equal(context.state.pendingKnowledgeTransition.formativeUnitId, "KP1-formative");
  assert.equal(context.state.pendingKnowledgeTransition.targetUnitId, "KP2");
  assert.equal(context.state.quizResults.length, 0);
  assert.equal(context.currentUnitId, "KP1");
  assert.equal(context.agenticNextUnlockedUnitAfter("KP1"), null, "待选择时不能绕过选择自动前进");
  assert.ok(analyticsEvents.some((event) => event.type === "knowledge_transition_prompt"));
  assert.deepEqual(snapshotSyncReasons, ["knowledge_transition_prompt"]);
  assert.equal(knowledgeTransitionFocusCalls, 1, "完成知识点后应自动定位到顶部下一步选择卡");
}

async function testContinueSkipsOnlyOptionalCheck() {
  await context.agenticChooseKnowledgeTransition("continue");
  assert.equal(context.currentUnitId, "KP2");
  assert.equal(context.state.knowledgeTransitionChoices.KP1.choice, "continue");
  assert.equal(context.state.agenticPath.skipped["KP1-formative"], true);
  assert.equal(context.state.completed.includes("KP1-formative"), false);
  assert.equal(context.state.submittedQuizzes.includes("KP1-formative"), false);
  assert.equal(context.state.quizResults.length, 0);
  assert.deepEqual(snapshotSyncReasons, ["knowledge_transition_prompt", "knowledge_transition_choice"]);
  assert.equal(await context.agenticChooseKnowledgeTransition("continue"), false, "重复点击不能产生第二次选择");
}

async function testChoiceRejectsInvalidOrConcurrentSubmission() {
  reset({
    state: {
      completed: ["KP1"],
      selectedKnowledgeScenes: { KP1: "simulation" },
      agenticPath: { unlocked: ["KP1"], visibleUnits: ["KP1"] }
    }
  });
  assert.ok(context.agenticBeginKnowledgeTransition(context.getUnit("KP1")));
  assert.equal(await context.agenticChooseKnowledgeTransition("unknown"), false);
  assert.equal(context.state.pendingKnowledgeTransition.knowledgeUnitId, "KP1");

  const firstChoice = context.agenticChooseKnowledgeTransition("continue");
  assert.equal(await context.agenticChooseKnowledgeTransition("formative"), false, "选择提交中不能被第二次点击覆盖");
  assert.equal(await firstChoice, true);
  assert.equal(context.state.knowledgeTransitionChoices.KP1.choice, "continue");
}

async function testPendingChoiceBlocksCompletionRetry() {
  reset({
    state: {
      completed: ["KP1"],
      pendingKnowledgeTransition: {
        knowledgeUnitId: "KP1",
        formativeUnitId: "KP1-formative",
        targetUnitId: "KP2",
        chapterId: "C1",
        createdAt: "2026-08-19T09:00:00+08:00"
      },
      selectedKnowledgeScenes: { KP1: "simulation" },
      agenticPath: { unlocked: ["KP1"], visibleUnits: ["KP1"] }
    }
  });
  const retried = await context.completeAndAdvanceCurrentUnit({ preventDefault() {} });
  assert.equal(retried, false, "待选择状态不能再次记录知识点复习");
  assert.equal(context.state.pendingKnowledgeTransition.knowledgeUnitId, "KP1");
}

async function testFormativeChoiceOpensExactUnit() {
  reset({
    state: {
      completed: ["KP1"],
      selectedKnowledgeScenes: { KP1: "simulation" },
      agenticPath: { unlocked: ["KP1"], visibleUnits: ["KP1"] }
    }
  });
  assert.ok(context.agenticBeginKnowledgeTransition(context.getUnit("KP1")));
  await context.agenticChooseKnowledgeTransition("formative");
  assert.equal(context.currentUnitId, "KP1-formative");
  assert.equal(context.state.knowledgeTransitionChoices.KP1.choice, "formative");
  assert.equal(context.state.agenticPath.skipped["KP1-formative"], false);
  assert.equal(context.state.completed.includes("KP1-formative"), false);
  assert.equal(context.state.submittedQuizzes.includes("KP1-formative"), false);
}

function testRefreshAndLegacyBypass() {
  reset({
    state: {
      completed: ["KP1"],
      pendingKnowledgeTransition: {
        knowledgeUnitId: "KP1",
        formativeUnitId: "KP1-formative",
        targetUnitId: "KP2",
        chapterId: "C1",
        createdAt: "2026-08-19T09:00:00+08:00"
      },
      agenticPath: { unlocked: ["KP1"], visibleUnits: ["KP1"] }
    }
  });
  assert.equal(context.agenticGuardNavigation("KP2", { allowPrevious: true }), false);
  assert.equal(context.agenticIsSkipped("KP1-formative"), false, "刷新后的待选择小题不能被当成已跳过");

  reset({
    state: {
      completed: ["KP1"],
      quizResults: [{ unitId: "old-removed-unit", questionId: "old-q", response: "历史答案" }],
      agenticPath: { unlocked: ["KP1"], visibleUnits: ["KP1"] }
    }
  });
  assert.equal(context.agenticIsSkipped("KP1-formative"), true, "没有新状态的历史用户应安全绕过新增小题");
  assert.equal(context.agenticNextUnlockedUnitAfter("KP1")?.id, "KP2");
  assert.equal(context.state.quizResults.length, 1, "历史答题记录不能被清理");
}

function testPendingChoiceRestoresKnowledgeCursor() {
  reset({
    state: {
      completed: ["KP1"],
      pendingKnowledgeTransition: {
        knowledgeUnitId: "KP1",
        formativeUnitId: "KP1-formative",
        targetUnitId: "KP2",
        chapterId: "C1",
        createdAt: "2026-08-19T09:00:00+08:00"
      },
      agenticPath: { unlocked: ["KP1"], visibleUnits: ["KP1"] }
    },
    unitId: "KP2"
  });
  assert.equal(context.currentUnitId, "KP1", "刷新或旧标签页不能把待选择状态带到别的知识点");
}

async function testReviewFollowsSavedTransitionChoice() {
  reset({
    state: {
      completed: ["KP1"],
      selectedKnowledgeScenes: { KP1: "simulation" },
      knowledgeTransitionChoices: {
        KP1: {
          choice: "continue",
          knowledgeUnitId: "KP1",
          formativeUnitId: "KP1-formative",
          targetUnitId: "KP2",
          chosenAt: "2026-08-19T10:00:00+08:00"
        }
      },
      agenticPath: {
        unlocked: ["KP1", "KP2"],
        visibleUnits: ["KP1", "KP2"],
        skipped: { "KP1-formative": true }
      }
    }
  });
  assert.equal(context.agenticCompletionCta(context.getUnit("KP1")).label, "复习并跳到下一节");
  assert.equal(await context.completeAndAdvanceCurrentUnit({ preventDefault() {} }), true);
  assert.equal(context.currentUnitId, "KP2", "选择直接继续后，复习不能重新插入小题");

  reset({
    state: {
      completed: ["KP1"],
      selectedKnowledgeScenes: { KP1: "simulation" },
      knowledgeTransitionChoices: {
        KP1: {
          choice: "formative",
          knowledgeUnitId: "KP1",
          formativeUnitId: "KP1-formative",
          targetUnitId: "KP1-formative",
          chosenAt: "2026-08-19T10:00:00+08:00"
        }
      },
      agenticPath: { unlocked: ["KP1", "KP1-formative"], visibleUnits: ["KP1", "KP1-formative"] }
    }
  });
  assert.equal(
    context.agenticNextUnlockedUnitAfter("KP1")?.id,
    "KP1-formative",
    "选择做小题且尚未完成时，复习路径必须先经过当前知识点检测"
  );
  assert.equal(context.agenticCompletionCta(context.getUnit("KP1")).label, "复习后做小题测一测");
  assert.equal(await context.completeAndAdvanceCurrentUnit({ preventDefault() {} }), true);
  assert.equal(context.currentUnitId, "KP1-formative", "选择小题后，复习应回到未完成的小题");

  reset({
    state: {
      completed: ["KP1", "KP1-formative"],
      submittedQuizzes: ["KP1-formative"],
      selectedKnowledgeScenes: { KP1: "simulation" },
      knowledgeTransitionChoices: {
        KP1: {
          choice: "formative",
          knowledgeUnitId: "KP1",
          formativeUnitId: "KP1-formative",
          targetUnitId: "KP1-formative",
          chosenAt: "2026-08-19T10:00:00+08:00"
        }
      },
      agenticPath: { unlocked: ["KP1", "KP1-formative", "KP2"], visibleUnits: ["KP1", "KP1-formative", "KP2"] }
    }
  });
  assert.equal(
    context.agenticKnowledgeTransitionResumeFor(context.getUnit("KP1"))?.target?.id,
    "KP1-formative",
    "即使检测已有记录，显式选择做小题也必须保留检测在复习路径中"
  );
  assert.equal(context.agenticCompletionCta(context.getUnit("KP1")).label, "复习后做小题测一测");
  assert.equal(await context.completeAndAdvanceCurrentUnit({ preventDefault() {} }), true);
  assert.equal(context.currentUnitId, "KP1-formative", "小题已有完成记录时，复习仍应按已选路径经过检测");
}

function testSkippedKnowledgeAlsoSkipsInsertedCheck() {
  reset({
    state: {
      completed: ["KP1"],
      agenticPath: {
        unlocked: ["KP1"],
        visibleUnits: ["KP1"],
        skipped: { KP2: true }
      }
    }
  });
  assert.equal(context.agenticIsSkipped("KP2-formative"), true, "旧跳过记录也应覆盖新增 formative");
  const pending = context.agenticBeginKnowledgeTransition(context.getUnit("KP1"));
  assert.equal(pending.targetUnitId, "C1-review", "目标应越过已跳过知识点及其 formative");
}

function testExistingFormativeEvidenceDoesNotPromptAgain() {
  reset({
    state: {
      completed: ["KP1", "KP1-formative"],
      submittedQuizzes: ["KP1-formative"],
      selectedKnowledgeScenes: { KP1: "simulation" },
      agenticPath: { unlocked: ["KP1", "KP1-formative"], visibleUnits: ["KP1", "KP1-formative"] }
    }
  });
  const next = context.agenticOnUnitCompleted(context.getUnit("KP1"));
  assert.equal(next?.id, "KP2", "已有 formative 证据时应直接进入后续单元");
  assert.equal(context.state.pendingKnowledgeTransition, null);
  assert.equal(context.state.knowledgeTransitionChoices.KP1.choice, "formative");
  assert.equal(
    context.agenticKnowledgeTransitionResumeFor(context.getUnit("KP1"))?.target?.id,
    "KP2",
    "历史检测证据推断出的兼容路径不应被当成新的显式小题选择"
  );
}

async function testLegacyCompletedKnowledgeReviewBypassesPrompt() {
  reset({
    state: {
      completed: ["KP1"],
      selectedKnowledgeScenes: { KP1: "simulation" },
      agenticPath: { unlocked: ["KP1"], visibleUnits: ["KP1"] }
    }
  });
  const next = await context.completeAndAdvanceCurrentUnit({ preventDefault() {} });
  assert.equal(next, true);
  assert.equal(context.state.pendingKnowledgeTransition, null, "历史完成记录复习时不能突然新增阻断选择");
  assert.equal(context.currentUnitId, "KP2");
}

function testChapterEndTarget() {
  reset({
    state: {
      completed: ["KP2"],
      selectedKnowledgeScenes: { KP2: "simulation" },
      agenticPath: { unlocked: ["KP2"], visibleUnits: ["KP2"] }
    },
    unitId: "KP2"
  });
  const pending = context.agenticBeginKnowledgeTransition(context.getUnit("KP2"));
  assert.equal(pending.targetUnitId, "C1-review", "最后一个知识点应先进入章节收束，而不是越过章节边界");
}

async function testNoFormativeQuestionFallsBack() {
  const formative = context.findMainUnit("KP2-formative");
  const originalQuestions = formative.scene.content.questions;
  formative.scene.content.questions = [];
  reset({
    state: {
      completed: ["KP2"],
      agenticPath: { unlocked: ["KP2"], visibleUnits: ["KP2"] }
    },
    unitId: "KP2"
  });
  assert.equal(context.agenticBeginKnowledgeTransition(context.getUnit("KP2")), null);
  formative.scene.content.questions = originalQuestions;
}

function testAdaptiveCoreFailureDoesNotCompletePath() {
  const coreRecord = {
    unitId: "KP1-formative",
    questionId: "KP1-check-q1",
    isCorrect: false,
    status: "incorrect"
  };
  reset({
    state: {
      completed: ["KP1", "KP1-formative"],
      submittedQuizzes: ["KP1-formative"],
      quizResults: [coreRecord],
      quizAttempts: {
        "KP1-formative": {
          adaptiveFormative: true,
          records: [coreRecord]
        }
      },
      agenticPath: { unlocked: ["KP1", "KP1-formative"], visibleUnits: ["KP1", "KP1-formative"] }
    }
  });

  assert.equal(context.learningFormativeAttemptComplete("KP1-formative", context.state), false);
  context.normalizeLearningStateCompatibility(context.state);
  assert.equal(context.state.submittedQuizzes.includes("KP1-formative"), false);
  assert.equal(context.state.completed.includes("KP1-formative"), false);
  assert.equal(context.state.quizResults.length, 1, "核心错题记录必须保留");

  context.state.completed.push("KP1-formative");
  context.state.submittedQuizzes.push("KP1-formative");
  context.ensureAgenticPath();
  assert.equal(context.state.completed.includes("KP1-formative"), false, "路径归并不能重新标记 formative 完成");
  assert.equal(context.state.submittedQuizzes.includes("KP1-formative"), false, "路径归并不能重新标记 formative 已提交");
  assert.equal(context.agenticKnowledgeTransitionFormativeHasEvidence("KP1-formative"), false);
}

function testAdaptiveDiagnosticCompletesFormative() {
  const coreRecord = {
    unitId: "KP1-formative",
    questionId: "KP1-check-q1",
    isCorrect: false,
    status: "incorrect"
  };
  const diagnosticRecord = {
    unitId: "KP1-formative",
    questionId: "KP1-check-q2",
    isCorrect: false,
    status: "incorrect"
  };
  const state = freshState({
    completed: ["KP1", "KP1-formative"],
    submittedQuizzes: [],
    quizResults: [diagnosticRecord, coreRecord],
    quizAttempts: {
      "KP1-formative": {
        adaptiveFormative: true,
        records: [diagnosticRecord]
      }
    }
  });
  assert.equal(context.learningFormativeAttemptComplete("KP1-formative", state), true);
  context.normalizeLearningStateCompatibility(state);
  assert.equal(state.submittedQuizzes.includes("KP1-formative"), true);
  assert.equal(state.completed.includes("KP1-formative"), true);
}

function testLegacyFormativeMarkerSurvives() {
  const legacyUnitId = "V14-C1-formative";
  const state = freshState({
    submittedQuizzes: [legacyUnitId],
    completed: [legacyUnitId],
    quizResults: [{ unitId: legacyUnitId, questionId: "legacy-question", isCorrect: false }]
  });
  assert.equal(context.learningFormativeAttemptComplete(legacyUnitId, state), true);
  context.normalizeLearningStateCompatibility(state);
  assert.equal(state.submittedQuizzes.includes(legacyUnitId), true);
  assert.equal(state.completed.includes(legacyUnitId), true);
}

function testClientUsesLatestAdaptiveEvidence() {
  const state = freshState({
    quizResults: [
      {
        unitId: "KP1-formative",
        questionId: "KP1-check-q1",
        isCorrect: false,
        timestamp: "2026-08-19T02:00:00.000Z"
      },
      {
        unitId: "KP1-formative",
        questionId: "KP1-check-q1",
        isCorrect: 1,
        timestamp: "2026-08-19T02:01:00.000Z"
      }
    ],
    quizAttempts: {
      "KP1-formative": {
        adaptiveFormative: true,
        records: []
      }
    }
  });
  assert.equal(
    context.learningFormativeAttemptComplete("KP1-formative", state),
    true,
    "客户端应按时间采用最新核心题结果，并兼容旧格式数值正确标记"
  );
}

function testEmptyAdaptiveAttemptDoesNotCompleteFormative() {
  const unitId = "KP1-formative";
  const state = freshState({
    completed: ["KP1", unitId],
    quizAttempts: {
      [unitId]: { adaptiveFormative: true }
    }
  });
  assert.equal(
    context.learningFormativeAttemptComplete(unitId, state),
    false,
    "只有空 attempt 元数据不能证明即时检测已提交"
  );
  context.normalizeLearningStateCompatibility(state);
  assert.equal(state.submittedQuizzes.includes(unitId), false);
  assert.equal(state.completed.includes(unitId), false);

  const submittedState = freshState({
    quizAttempts: {
      [unitId]: {
        adaptiveFormative: true,
        submittedAt: "2026-08-19T10:00:00+08:00"
      }
    }
  });
  assert.equal(
    context.learningFormativeAttemptComplete(unitId, submittedState),
    true,
    "旧格式带正式提交时间的 attempt 仍应保留完成兼容"
  );
}

(async () => {
  testSelectedSceneShowsTransitionPreview();
  await testCompletionCreatesChoice();
  await testContinueSkipsOnlyOptionalCheck();
  await testChoiceRejectsInvalidOrConcurrentSubmission();
  await testPendingChoiceBlocksCompletionRetry();
  await testFormativeChoiceOpensExactUnit();
  testRefreshAndLegacyBypass();
  testPendingChoiceRestoresKnowledgeCursor();
  await testReviewFollowsSavedTransitionChoice();
  testSkippedKnowledgeAlsoSkipsInsertedCheck();
  testExistingFormativeEvidenceDoesNotPromptAgain();
  await testLegacyCompletedKnowledgeReviewBypassesPrompt();
  testChapterEndTarget();
  await testNoFormativeQuestionFallsBack();
  testAdaptiveCoreFailureDoesNotCompletePath();
  testAdaptiveDiagnosticCompletesFormative();
  testLegacyFormativeMarkerSurvives();
  testClientUsesLatestAdaptiveEvidence();
  testEmptyAdaptiveAttemptDoesNotCompleteFormative();
  console.log("knowledge transition tests passed");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
