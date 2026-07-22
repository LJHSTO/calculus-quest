const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const source = fs.readFileSync(path.join(root, "app/main/agentic-path.js"), "utf8");
assert.match(source, /const activeExtensionResume = agenticActiveExtensionResumeForPhase\(path, unit\.chapterId, phase\)/);
assert.match(source, /const leavingExtensionChapter =\s*pending\.phase === "post"/);
assert.doesNotMatch(source, /post_extension_resume_ready/);
assert.doesNotMatch(source, /post_extension_chapter_unlocked/);

function unit(id, chapterId, sceneOrder, type = "knowledge", assessmentPhase = "") {
  return {
    id,
    chapterId,
    sceneOrder,
    type,
    assessmentPhase,
    label: id
  };
}

const c1 = {
  id: "C1",
  label: "第一章",
  order: 1,
  track: "main",
  units: [
    unit("C1-pre", "C1", 1, "quiz", "pre"),
    unit("C1-k1", "C1", 2),
    unit("C1-post", "C1", 3, "quiz", "post")
  ]
};
const c2 = {
  id: "C2",
  label: "第二章",
  order: 2,
  track: "main",
  units: [
    unit("C2-pre", "C2", 1, "quiz", "pre"),
    unit("C2-k1", "C2", 2),
    unit("C2-post", "C2", 3, "quiz", "post")
  ]
};
const x1 = {
  id: "X1",
  label: "扩展章",
  order: 3,
  track: "extension",
  extension: true,
  recommendedAfter: "C1",
  units: [
    unit("X1-pre", "X1", 1, "quiz", "pre"),
    unit("X1-k1", "X1", 2),
    unit("X1-post", "X1", 3, "quiz", "post")
  ]
};
const curriculum = [c1, c2, x1];

function learningState(overrides = {}) {
  return {
    completed: [],
    submittedQuizzes: [],
    quizResults: [],
    quizAttempts: {},
    selectedKnowledgeScenes: {},
    logs: [],
    agenticPath: null,
    ...overrides
  };
}

const context = vm.createContext({
  console,
  curriculum,
  chapters: curriculum,
  state: learningState(),
  currentChapterId: "C1",
  currentUnitId: "C1-pre",
  isMultiSceneLearningRoute: () => true,
  getChapter(id) {
    const chapterId = id || context.currentChapterId;
    return curriculum.find((chapter) => chapter.id === chapterId) || null;
  },
  findMainUnit(id) {
    return curriculum.flatMap((chapter) => chapter.units).find((item) => item.id === id) || null;
  },
  getUnit(id) {
    const unitId = id || context.currentUnitId;
    return context.findMainUnit(unitId);
  },
  chapterStats: () => ({ scenes: 3 }),
  addLog: () => {},
  analyticsTrack: () => {},
  trackLearningEvent: () => {},
  saveState: () => {},
  renderAll: () => {},
  renderAgenticCoachPanel: () => {},
  beijingNow: () => "2026-07-22T12:00:00.000+08:00",
  escapeHtml: (value) => String(value || "")
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

vm.runInContext(source, context, { filename: "app/main/agentic-path.js" });
context.renderAgenticCoachPanel = () => {};
context.agenticRenderLearningUpdate = () => {};

function reset({ state, chapterId, unitId }) {
  context.state = learningState(state);
  context.currentChapterId = chapterId;
  context.currentUnitId = unitId;
}

reset({
  chapterId: "C2",
  unitId: "C2-k1",
  state: {
    completed: ["C2-k1"],
    agenticPath: {
      unlocked: ["C2-k1"],
      visibleUnits: ["C2-k1"],
      activeExtensionChapter: {
        chapterId: "X1",
        fromChapterId: "C1",
        fromUnitId: "C1-post",
        resumeUnitId: "C2-pre"
      },
      chapterAdvanceReady: {},
      chapterAdvanceReasons: {}
    }
  }
});
context.ensureAgenticPath();
assert.equal(context.currentChapterId, "C2", "real later-chapter evidence must preserve the learner position");
assert.equal(
  context.state.agenticPath.chapterAdvanceReady.C1,
  true,
  "later-chapter evidence must backfill prerequisite chapter access"
);
assert.equal(
  context.state.agenticPath.activeExtensionChapter,
  null,
  "later-chapter evidence must retire a stale extension lock from an older snapshot"
);

reset({
  chapterId: "C2",
  unitId: "C2-pre",
  state: {
    agenticPath: {
      unlocked: ["C1-pre", "C2-pre"],
      visibleUnits: ["C1-pre", "C2-pre"],
      chapterAdvanceReady: {},
      chapterAdvanceReasons: {}
    }
  }
});
context.ensureAgenticPath();
assert.equal(context.currentChapterId, "C1", "a stale future position without evidence must return to the first legal chapter");
assert.equal(
  context.state.agenticPath.unlocked.includes("C2-pre"),
  false,
  "a stale future unlock without evidence must not bypass the chapter gate"
);

reset({
  chapterId: "X1",
  unitId: "X1-pre",
  state: {
    completed: ["C1-post"],
    submittedQuizzes: ["C1-post"],
    agenticPath: {
      unlocked: ["C1-pre", "C1-post", "X1-pre"],
      visibleUnits: ["C1-pre", "C1-post", "X1-pre"],
      chapterAdvanceReady: { C1: true, "C1-post": true },
      chapterAdvanceReasons: {},
      activeExtensionChapter: {
        chapterId: "X1",
        fromChapterId: "C1",
        fromUnitId: "C1-post",
        resumeUnitId: "C2-pre"
      }
    }
  }
});
context.ensureAgenticPath();
assert.equal(context.agenticExtensionChapterVisible("X1", context.state.agenticPath), true);
assert.equal(
  context.agenticChapterUnlockedBySequence("C2"),
  false,
  "choosing an extension must keep the next main chapter locked until the extension finishes"
);
assert.equal(context.agenticActiveExtensionResumeForPhase(context.state.agenticPath, "X1", "pre"), "");
assert.equal(context.agenticActiveExtensionResumeForPhase(context.state.agenticPath, "X1", "formative"), "");
assert.equal(context.agenticActiveExtensionResumeForPhase(context.state.agenticPath, "X1", "post"), "C2-pre");
context.currentChapterId = "C1";
context.currentUnitId = "C1-post";
assert.equal(context.agenticNextUnlockedUnitAfter("C1-post")?.id, "X1-pre");
const continueExtensionCta = context.agenticCompletionCta(context.getUnit("C1-post"));
assert.equal(continueExtensionCta.label, "继续扩展学习");
assert.equal(continueExtensionCta.disabled, false);
context.currentChapterId = "X1";
context.currentUnitId = "X1-pre";

const extensionPath = context.state.agenticPath;
context.agenticFinalizeActiveExtensionChapter(extensionPath, "X1", "extension_completed", { keepResume: true });
context.agenticUnlockUnit("C2-pre", "extension_resume_ready");
context.state.completed.push("X1-post");
context.currentUnitId = "X1-post";
assert.equal(extensionPath.chapterAdvanceReady.C1, true);
assert.equal(extensionPath.activeExtensionChapter.completed, true);
assert.equal(context.agenticChapterUnlockedBySequence("C2"), true);
assert.equal(context.agenticNextUnlockedUnitAfter("X1-post")?.id, "C2-pre");
assert.equal(
  context.agenticDetourResumeUnitId(
    { unitId: "C2-post", anchorUnitId: "C2-post", phase: "post", resumeUnitId: "" },
    "C2-post"
  ),
  "C2-post",
  "a final-chapter detour must return to the final main post-test"
);

reset({
  chapterId: "C1",
  unitId: "C1-pre",
  state: {
    agenticPath: {
      unlocked: ["C1-pre"],
      visibleUnits: ["C1-pre"],
      chapterAdvanceReady: {},
      chapterAdvanceReasons: {}
    }
  }
});
assert.equal(context.agenticPreviousUnlockedUnitBefore("C1-pre"), null, "the first course unit must not expose a previous target");

reset({
  chapterId: "C1",
  unitId: "C1-k1",
  state: {
    completed: ["C1-k1"],
    agenticPath: {
      unlocked: ["C1-pre", "C1-k1", "C1-post"],
      visibleUnits: ["C1-pre", "C1-k1", "C1-post"],
      chapterAdvanceReady: {},
      chapterAdvanceReasons: {}
    }
  }
});
const reviewCta = context.agenticCompletionCta(context.getUnit("C1-k1"));
assert.equal(reviewCta.label, "复习并跳到下一节");
assert.equal(reviewCta.disabled, false);

reset({
  chapterId: "C2",
  unitId: "C2-post",
  state: {
    completed: ["C1-post", "C2-post"],
    submittedQuizzes: ["C1-post", "C2-post"],
    agenticPath: {
      unlocked: ["C1-pre", "C1-post", "C2-pre", "C2-post"],
      visibleUnits: ["C1-pre", "C1-post", "C2-pre", "C2-post"],
      chapterAdvanceReady: {
        C1: true,
        "C1-post": true,
        C2: true,
        "C2-post": true
      },
      chapterAdvanceReasons: {}
    }
  }
});
const finalCta = context.agenticCompletionCta(context.getUnit("C2-post"));
assert.equal(finalCta.label, "课程已完成");
assert.equal(finalCta.disabled, true);

function postChoicePlan() {
  return {
    unitId: "C1-post",
    anchorUnitId: "C1-post",
    chapterId: "C1",
    phase: "post",
    resumeUnitId: "C2-pre",
    actions: [
      {
        type: "review_knowledge",
        label: "选择回看知识点",
        primary: true,
        units: [{ id: "C1-k1", label: "第一章知识点", reviewMode: "review" }]
      },
      {
        type: "extension_chapter",
        actionKey: "extension_chapter:X1",
        label: "推荐扩展：扩展章",
        units: [{ id: "X1-pre", chapterId: "X1", label: "扩展章" }],
        extensionChapterId: "X1",
        extensionChapterIds: ["X1"]
      },
      { type: "continue", label: "进入下一章", units: [] }
    ],
    createdAt: "2026-07-22T12:00:00.000+08:00"
  };
}

function resetPostChoiceFlow() {
  const pendingPlan = postChoicePlan();
  reset({
    chapterId: "C1",
    unitId: "C1-post",
    state: {
      completed: ["C1-k1", "C1-post"],
      submittedQuizzes: ["C1-post"],
      agenticPath: {
        unlocked: ["C1-pre", "C1-k1", "C1-post"],
        visibleUnits: ["C1-pre", "C1-k1", "C1-post"],
        pendingPlan,
        pendingAt: "C1-post",
        chapterAdvanceReady: {},
        chapterAdvanceReasons: {}
      }
    }
  });
  context.ensureAgenticPath();
}

async function testDeferredReviewAndExtensionFlows() {
  resetPostChoiceFlow();
  await context.agenticApplyDecision("extension_chapter", "extension_chapter:X1");
  let pathState = context.state.agenticPath;
  assert.equal(context.currentUnitId, "X1-pre");
  assert.ok(pathState.deferredReviewPlan, "choosing extension first must preserve the review plan");
  assert.equal(context.agenticChapterUnlockedBySequence("C2"), false);

  pathState.pendingPlan = {
    unitId: "X1-pre",
    anchorUnitId: "X1-pre",
    chapterId: "X1",
    phase: "pre",
    resumeUnitId: "X1-k1",
    actions: [{ type: "continue", label: "继续扩展学习", units: [] }],
    createdAt: "2026-07-22T12:01:00.000+08:00"
  };
  pathState.pendingAt = "X1-pre";
  await context.agenticApplyDecision("continue");
  assert.equal(context.currentUnitId, "X1-k1", "extension pre-test continue must stay inside the extension chapter");
  assert.equal(pathState.activeExtensionChapter?.chapterId, "X1");

  context.agenticUnlockUnit("X1-post", "test_extension_post");
  context.currentChapterId = "X1";
  context.currentUnitId = "X1-post";
  pathState.pendingPlan = {
    unitId: "X1-post",
    anchorUnitId: "X1-post",
    chapterId: "X1",
    phase: "post",
    resumeUnitId: "C2-pre",
    actions: [{ type: "continue", label: "完成扩展", units: [] }],
    createdAt: "2026-07-22T12:02:00.000+08:00"
  };
  pathState.pendingAt = "X1-post";
  await context.agenticApplyDecision("continue");
  pathState = context.state.agenticPath;
  assert.equal(pathState.activeExtensionChapter, null);
  assert.equal(pathState.pendingPlan?.actions?.[0]?.type, "review_knowledge");
  assert.equal(context.agenticChapterUnlockedBySequence("C2"), false);

  await context.agenticApplyDecision("review_knowledge");
  assert.equal(context.currentUnitId, "C1-k1");
  const reviewReturn = context.agenticOnUnitCompleted(context.getUnit("C1-k1"));
  assert.equal(reviewReturn?.id, "C2-pre");
  assert.equal(context.state.agenticPath.chapterAdvanceReady.C1, true);
  assert.equal(context.agenticChapterUnlockedBySequence("C2"), true);

  resetPostChoiceFlow();
  await context.agenticApplyDecision("review_knowledge");
  pathState = context.state.agenticPath;
  assert.equal(context.currentUnitId, "C1-k1");
  assert.ok(pathState.deferredExtensionPlan, "choosing review first must preserve the extension plan");
  assert.equal(context.agenticOnUnitCompleted(context.getUnit("C1-k1")), null);
  assert.equal(pathState.pendingPlan?.actions?.some((action) => action.type === "extension_chapter"), true);

  await context.agenticApplyDecision("extension_chapter", "extension_chapter:X1");
  assert.equal(context.currentUnitId, "X1-pre");
  assert.equal(context.agenticChapterUnlockedBySequence("C2"), false);
  pathState.pendingPlan = {
    unitId: "X1-post",
    anchorUnitId: "X1-post",
    chapterId: "X1",
    phase: "post",
    resumeUnitId: "C2-pre",
    actions: [{ type: "continue", label: "完成扩展", units: [] }],
    createdAt: "2026-07-22T12:03:00.000+08:00"
  };
  pathState.pendingAt = "X1-post";
  context.currentChapterId = "X1";
  context.currentUnitId = "X1-post";
  await context.agenticApplyDecision("continue");
  assert.equal(context.currentUnitId, "C2-pre");
  assert.equal(context.state.agenticPath.activeExtensionChapter, null);
  assert.equal(context.state.agenticPath.chapterAdvanceReady.C1, true);
}

testDeferredReviewAndExtensionFlows()
  .then(() => console.log("agentic navigation tests passed"))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
