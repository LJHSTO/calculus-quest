const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(process.env.CQ_ROOT || path.join(__dirname, ".."));
const source = fs.readFileSync(path.join(root, "app/main/agentic-path.js"), "utf8");
const route = JSON.parse(fs.readFileSync(path.join(root, "data/multi-scene-learning-route.json"), "utf8"));

function unit(id, chapterId, sceneOrder, type = "knowledge", assessmentPhase = "", options = {}) {
  return {
    id,
    chapterId,
    sceneOrder,
    type,
    assessmentPhase,
    label: options.label || id,
    knowledgePointId: options.knowledgePointId || "",
    adaptiveFormative: Boolean(options.adaptiveFormative),
    placeholderQuiz: Boolean(options.placeholderQuiz),
    scene: { content: { questions: options.questions || [] } }
  };
}

function routeKnowledgePointEntries(routeChapter) {
  return (routeChapter.modules || []).flatMap((module) =>
    (module.knowledgePoints || []).map((knowledgePoint) => ({ module, knowledgePoint }))
  );
}

function hasQuestions(flow = {}) {
  return Array.isArray(flow?.questions) && flow.questions.length > 0;
}

function routeUsesKnowledgeChecks(routeChapter, entries) {
  const availability = entries.map(({ knowledgePoint }) => hasQuestions(knowledgePoint.formativeQuiz));
  const hasAny = availability.some(Boolean);
  const hasEvery = availability.length > 0 && availability.every(Boolean);
  assert.equal(
    hasAny && !hasEvery,
    false,
    `${routeChapter.id} 不能混用知识点即时检测和章节形成性测验`
  );
  return hasEvery;
}

function routeFormativeMidpointIndex(routeChapter, entries) {
  if (!entries.length) return 0;
  const fallback = Math.max(1, Math.ceil(entries.length / 2));
  const boundaries = [];
  let seen = 0;
  (routeChapter.modules || []).forEach((module) => {
    seen += (module.knowledgePoints || []).length;
    if (seen > 0 && seen < entries.length) boundaries.push(seen);
  });
  if (!boundaries.length) return fallback;
  return boundaries.reduce((best, next) => {
    const bestDistance = Math.abs(best - fallback);
    const nextDistance = Math.abs(next - fallback);
    return nextDistance < bestDistance ? next : best;
  }, boundaries[0]);
}

function runtimeChapter(routeChapter, index) {
  const id = routeChapter.id;
  const units = [];
  let sceneOrder = 1;
  const entries = routeKnowledgePointEntries(routeChapter);
  const usesKnowledgeChecks = routeUsesKnowledgeChecks(routeChapter, entries);
  const formativeIndex = routeFormativeMidpointIndex(routeChapter, entries);
  const chapterPre = routeChapter.flow?.preQuiz || {};
  const chapterFormative = routeChapter.flow?.formativeQuiz || {};
  const chapterPost = routeChapter.flow?.postQuiz || {};
  assert.ok(hasQuestions(chapterPre), `${id} 必须保留可用的前测题`);
  assert.ok(hasQuestions(chapterPost), `${id} 必须保留可用的后测题`);
  if (!usesKnowledgeChecks) {
    assert.ok(hasQuestions(chapterFormative), `${id} 必须保留可用的章节形成性测验题`);
  }
  units.push(unit(`${id}-pre`, id, sceneOrder++, "quiz", "pre", {
    questions: chapterPre.questions || []
  }));
  entries.forEach(({ knowledgePoint }, entryIndex) => {
    if (!usesKnowledgeChecks && entryIndex === formativeIndex) {
      units.push(unit(`${id}-formative`, id, sceneOrder++, "quiz", "formative", {
        label: `检测：${routeChapter.title || id}`,
        questions: chapterFormative.questions || []
      }));
    }
    units.push(unit(knowledgePoint.id, id, sceneOrder++, "knowledge", "", {
      label: knowledgePoint.name || knowledgePoint.id,
      knowledgePointId: knowledgePoint.id
    }));
    if (usesKnowledgeChecks) {
      const questions = knowledgePoint.formativeQuiz?.questions || [];
      assert.ok(questions.length, `${knowledgePoint.id} 必须保留可用的知识点即时检测题`);
      units.push(unit(`${knowledgePoint.id}-formative`, id, sceneOrder++, "quiz", "formative", {
        label: `检测：${knowledgePoint.name || knowledgePoint.id}`,
        knowledgePointId: knowledgePoint.id,
        adaptiveFormative: true,
        questions
      }));
    }
  });
  if (!usesKnowledgeChecks && entries.length <= formativeIndex) {
    units.push(unit(`${id}-formative`, id, sceneOrder++, "quiz", "formative", {
      label: `检测：${routeChapter.title || id}`,
      questions: chapterFormative.questions || []
    }));
  }
  const review = routeChapter.flow?.review || {};
  if (
    review.canvas
    || review.slides?.length
    || review.sections?.length
    || review.cards?.length
    || review.items?.length
    || review.htmlPath
    || review.resourceCandidates?.length
    || review.courseware
    || review.content
  ) {
    units.push(unit(`${id}-review`, id, sceneOrder++, "slide"));
  }
  units.push(unit(`${id}-post`, id, sceneOrder++, "quiz", "post", {
    questions: chapterPost.questions || []
  }));
  return {
    id,
    label: routeChapter.title || id,
    order: Number(routeChapter.order || index + 1),
    track: routeChapter.track || (routeChapter.extension ? "extension" : "main"),
    extension: Boolean(routeChapter.extension),
    recommendedAfter: routeChapter.recommendedAfter || "",
    modules: routeChapter.modules || [],
    usesKnowledgeChecks,
    units,
    allUnits: units,
    loaded: true
  };
}

const curriculum = (route.chapters || []).map(runtimeChapter);
const allUnits = curriculum.flatMap((chapter) => chapter.units);
const mainChapters = curriculum.filter((chapter) => !chapter.extension);
const extensions = curriculum.filter((chapter) => chapter.extension);

assert.deepEqual(
  extensions.map((chapter) => [chapter.id, chapter.recommendedAfter]),
  [
    ["V14-X1", "V14-C3"],
    ["V14-X2", "V14-C4"],
    ["V14-X3", "V14-C6"],
    ["V14-X4", "V14-C6"],
    ["V14-X5", "V14-C5"]
  ],
  "扩展章节推荐关系必须与当前课程路由一致"
);

function learningState(overrides = {}) {
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
  state: learningState(),
  currentChapterId: mainChapters[0]?.id || "",
  currentUnitId: mainChapters[0]?.units?.[0]?.id || "",
  AGENTIC_CORE_SCENE_ORDERS: [],
  AGENTIC_RELEARN_SCENE_ORDERS: [],
  AGENTIC_EXTENSION_SCENE_ORDERS: [],
  AGENTIC_ENABLE_EXTENSION: false,
  isMultiSceneLearningRoute: () => true,
  getChapter(id) {
    return curriculum.find((chapter) => chapter.id === (id || context.currentChapterId)) || null;
  },
  findMainUnit(id) {
    return allUnits.find((candidate) => candidate.id === id) || null;
  },
  getUnit(id) {
    return context.findMainUnit(id || context.currentUnitId);
  },
  siblingLearningScenes: () => [],
  selectedKnowledgeSceneType: () => "",
  quizResourceReviewContext: () => null,
  chapterStats: () => ({ scenes: 3 }),
  addLog: () => {},
  analyticsTrack: () => {},
  trackLearningEvent: () => {},
  isSignedIn: () => false,
  quizReviewIsPending: (result = {}) => result.status === "pending_review" || result.isCorrect === null,
  quizMaxScoreFor: (question = {}, result = {}) => Number(result.maxScore || question.points || 1),
  quizEarnedScore: (result = {}, question = {}) => {
    if (Number.isFinite(Number(result.score))) return Number(result.score);
    return result.isCorrect === true ? Number(question.points || 1) : 0;
  },
  saveState: () => {},
  renderAll: () => {},
  renderAgenticCoachPanel: () => {},
  beijingNow: () => "2026-08-19T12:00:00.000+08:00",
  escapeHtml: (value) => String(value || ""),
  document: { querySelector: () => null, querySelectorAll: () => [] },
  window: { setTimeout, scrollTo: () => {} },
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

vm.runInContext(source, context, { filename: "app/main/agentic-path.js" });
context.agenticRenderLearningUpdate = () => {};

function chapterPost(chapter) {
  return [...(chapter.units || [])].reverse().find((candidate) => candidate.assessmentPhase === "post");
}

function chapterAdvanceReadyThrough(chapterId) {
  const sourceIndex = mainChapters.findIndex((chapter) => chapter.id === chapterId);
  const ready = {};
  mainChapters.slice(0, sourceIndex + 1).forEach((chapter) => {
    ready[chapter.id] = true;
    ready[chapterPost(chapter).id] = true;
  });
  return ready;
}

function reset({ state, chapterId, unitId }) {
  context.state = learningState(state);
  context.currentChapterId = chapterId;
  context.currentUnitId = unitId;
  context.ensureAgenticPath();
}

function extensionChoicePlan(source, extension, resumeUnitId) {
  const sourcePost = chapterPost(source);
  const firstUnit = extension.units[0];
  return {
    unitId: sourcePost.id,
    anchorUnitId: sourcePost.id,
    chapterId: source.id,
    phase: "post",
    resumeUnitId,
    actions: [{
      type: "extension_chapter",
      actionKey: `extension_chapter:${extension.id}`,
      label: `推荐扩展：${extension.label}`,
      units: [{ id: firstUnit.id, chapterId: extension.id, label: extension.label }],
      extensionChapterId: extension.id,
      extensionChapterIds: [extension.id]
    }],
    createdAt: "2026-08-19T12:00:00.000+08:00"
  };
}

function extensionContinuePlan(extension, resumeUnitId) {
  const post = chapterPost(extension);
  return {
    unitId: post.id,
    anchorUnitId: post.id,
    chapterId: extension.id,
    phase: "post",
    resumeUnitId,
    actions: [{ type: "continue", label: "完成扩展并继续", units: [] }],
    createdAt: "2026-08-19T12:01:00.000+08:00"
  };
}

function extensionKnowledgeUnits(extension) {
  return extension.units.filter((candidate) => candidate.type === "knowledge");
}

function extensionReviewUnit(extension) {
  return extension.units.find((candidate) => candidate.id === `${extension.id}-review`) || null;
}

function addUnique(list, value) {
  if (!list.includes(value)) list.push(value);
}

function correctQuizRecords(unit) {
  const questions = unit?.scene?.content?.questions || [];
  assert.ok(questions.length, `${unit?.id || "当前测验"} 必须有实际题目`);
  return questions.map((question) => {
    const maxScore = Number(question.points || 1);
    return {
      question,
      result: {
        unitId: unit.id,
        questionId: question.id,
        isCorrect: true,
        status: "scored",
        score: maxScore,
        maxScore
      }
    };
  });
}

async function submitQuizAsCorrect(unit) {
  const records = correctQuizRecords(unit);
  records.forEach(({ result }) => context.state.quizResults.push(result));
  addUnique(context.state.completed, unit.id);
  addUnique(context.state.submittedQuizzes, unit.id);
  await context.agenticAfterQuizSubmit(unit, records);
}

async function walkChosenExtensionCorePath(extension) {
  const path = context.state.agenticPath;
  const extensionPre = extension.units[0];
  const extensionPost = chapterPost(extension);
  const knowledgeUnits = extensionKnowledgeUnits(extension);
  const review = extensionReviewUnit(extension);
  assert.equal(extensionPre.assessmentPhase, "pre", `${extension.id} 的首步必须是实际前测单元`);
  assert.equal(extensionPost?.assessmentPhase, "post", `${extension.id} 必须有实际后测单元`);
  assert.ok(knowledgeUnits.length, `${extension.id} 必须包含实际知识点单元`);

  addUnique(context.state.completed, extensionPre.id);
  addUnique(context.state.submittedQuizzes, extensionPre.id);
  path.pendingPlan = context.agenticBuildPreKnowledgeSelectionPlan(extensionPre, []);
  path.pendingAt = extensionPre.id;
  assert.ok(path.pendingPlan, `${extension.id} 前测后应生成知识点自主选择`);
  await context.agenticApplyDecision("select_knowledge");
  assert.equal(context.currentUnitId, knowledgeUnits[0].id, `${extension.id} 前测选择后应进入首个真实知识点`);

  if (extension.usesKnowledgeChecks) {
    for (let index = 0; index < knowledgeUnits.length; index += 1) {
      const knowledge = knowledgeUnits[index];
      const formativeId = `${knowledge.id}-formative`;
      const expectedNext = knowledgeUnits[index + 1] || review || extensionPost;
      assert.equal(context.currentUnitId, knowledge.id, `${extension.id} 应按真实知识点顺序学习`);
      assert.equal(context.agenticUnitCompletionAllowed(knowledge.id), true, `${knowledge.id} 必须在前序完成后可完成`);
      context.state.selectedKnowledgeScenes[knowledge.id] = "simulation";
      addUnique(context.state.completed, knowledge.id);
      const pending = context.agenticBeginKnowledgeTransition(knowledge);
      assert.equal(pending?.formativeUnitId, formativeId, `${knowledge.id} 必须只关联自己的即时检测`);
      await context.agenticChooseKnowledgeTransition("continue");
      assert.equal(context.state.agenticPath.skipped[formativeId], true, `${knowledge.id} 选择直接继续只能跳过自己的即时检测`);
      assert.equal(context.currentUnitId, expectedNext.id, `${knowledge.id} 选择直接继续后必须进入正确的后续单元`);
    }
  } else {
    const coreUnits = extension.units.filter((candidate) =>
      candidate.type === "knowledge" || candidate.assessmentPhase === "formative"
    );
    assert.ok(coreUnits.some((candidate) => candidate.assessmentPhase === "formative"), `${extension.id} 必须经过实际章节形成性测验`);
    for (let index = 0; index < coreUnits.length; index += 1) {
      const current = coreUnits[index];
      const expectedNext = coreUnits[index + 1] || review || extensionPost;
      assert.equal(context.currentUnitId, current.id, `${extension.id} 应按真实章节路径逐步学习`);
      assert.equal(context.agenticUnitCompletionAllowed(current.id), true, `${current.id} 必须在前序完成后可完成`);
      if (current.type === "knowledge") {
        context.state.selectedKnowledgeScenes[current.id] = "simulation";
        addUnique(context.state.completed, current.id);
        const next = context.agenticOnUnitCompleted(current);
        assert.equal(next?.id, expectedNext.id, `${current.id} 完成后必须解锁正确的下一步`);
      } else {
        await submitQuizAsCorrect(current);
        assert.equal(context.state.agenticPath.pendingPlan, null, `${current.id} 全对后不应留下未处理的路径选择`);
      }
      assert.equal(context.agenticUnitCompletionAllowed(expectedNext.id), true, `${expectedNext.id} 必须在前一步后解锁`);
      await context.agenticOpenUnit(expectedNext.id);
    }
  }

  if (review) {
    assert.equal(context.agenticUnitCompletionAllowed(review.id), true, `${extension.id} 的章节收束页必须可完成`);
    addUnique(context.state.completed, review.id);
    const next = context.agenticOnUnitCompleted(review);
    assert.equal(next?.id, extensionPost.id, `${extension.id} 收束页完成后必须进入后测`);
    await context.agenticOpenUnit(extensionPost.id);
  }
  assert.equal(context.currentUnitId, extensionPost.id, `${extension.id} 的实际知识点序列必须抵达后测`);
  assert.equal(context.agenticUnitCompletionAllowed(extensionPost.id), true, `${extension.id} 后测必须可完成`);
}

async function verifyChosenExtensionProgression(extension) {
  const source = mainChapters.find((chapter) => chapter.id === extension.recommendedAfter);
  const sourceIndex = mainChapters.indexOf(source);
  const nextMain = mainChapters[sourceIndex + 1] || null;
  const resumeUnitId = nextMain?.units?.[0]?.id || "";
  const sourcePost = chapterPost(source);
  const extensionPost = chapterPost(extension);
  const ready = chapterAdvanceReadyThrough(source.id);

  reset({
    chapterId: source.id,
    unitId: sourcePost.id,
    state: {
      completed: [sourcePost.id],
      submittedQuizzes: [sourcePost.id],
      agenticPath: {
        unlocked: [sourcePost.id],
        visibleUnits: [sourcePost.id],
        pendingPlan: extensionChoicePlan(source, extension, resumeUnitId),
        pendingAt: sourcePost.id,
        chapterAdvanceReady: ready,
        chapterAdvanceReasons: {}
      }
    }
  });

  await context.agenticApplyDecision("extension_chapter", `extension_chapter:${extension.id}`);
  let pathState = context.state.agenticPath;
  assert.equal(context.currentUnitId, extension.units[0].id, `${extension.id} 应从首个单元进入`);
  assert.ok(pathState.unlockedExtensionChapters.includes(extension.id), `${extension.id} 应记录为已解锁`);
  assert.equal(context.agenticExtensionChapterVisible(extension.id, pathState), true, `${extension.id} 应在章节栏可学习`);
  assert.equal(context.agenticUnitCompletionAllowed(extension.units[0].id), true, `${extension.id} 首单元必须可完成`);
  if (nextMain) {
    assert.equal(context.agenticChapterUnlockedBySequence(nextMain.id), false, `${extension.id} 完成前不能越过扩展直接进入下一主线章`);
  }

  await walkChosenExtensionCorePath(extension);
  await submitQuizAsCorrect(extensionPost);
  assert.ok(
    context.state.agenticPath.pendingPlan?.actions?.some((action) => action.type === "continue"),
    `${extension.id} 后测后必须保留明确的回主线选择`
  );
  await context.agenticApplyDecision("continue");
  pathState = context.state.agenticPath;
  assert.equal(pathState.activeExtensionChapter, null, `${extension.id} 完成后不能留下阻塞主线的活动扩展状态`);
  assert.equal(pathState.chapterAdvanceReady[source.id], true, `${extension.id} 完成后应确认来源主线章可推进`);
  if (nextMain) {
    assert.equal(context.agenticIsUnitUnlocked(resumeUnitId), true, `${extension.id} 的主线恢复入口必须解锁`);
    assert.equal(context.agenticChapterUnlockedBySequence(nextMain.id), true, `${extension.id} 完成后不应卡住下一主线章`);
    assert.equal(context.currentUnitId, resumeUnitId, `${extension.id} 完成后应回到 ${nextMain.id}`);
  } else {
    assert.equal(context.currentUnitId, extensionPost.id, `${extension.id} 位于课程末尾时应停留在已完成扩展，不跳到错误章节`);
  }
}

async function verifyDirectExtensionReturn(extension) {
  const source = mainChapters.find((chapter) => chapter.id === extension.recommendedAfter);
  const sourceIndex = mainChapters.indexOf(source);
  const nextMain = mainChapters[sourceIndex + 1] || null;
  const resumeUnitId = nextMain?.units?.[0]?.id || "";
  const sourcePost = chapterPost(source);
  const extensionPost = chapterPost(extension);
  const ready = chapterAdvanceReadyThrough(source.id);

  reset({
    chapterId: extension.id,
    unitId: extensionPost.id,
    state: {
      completed: [sourcePost.id, extensionPost.id],
      submittedQuizzes: [sourcePost.id, extensionPost.id],
      agenticPath: {
        unlocked: extension.units.map((candidate) => candidate.id),
        visibleUnits: extension.units.map((candidate) => candidate.id),
        unlockedExtensionChapters: [extension.id],
        pendingPlan: extensionContinuePlan(extension, resumeUnitId),
        pendingAt: extensionPost.id,
        chapterAdvanceReady: ready,
        chapterAdvanceReasons: {}
      }
    }
  });

  await context.agenticApplyDecision("continue");
  assert.equal(context.state.agenticPath.chapterAdvanceReady[source.id], true, `${extension.id} 的历史完成记录也应恢复来源主线的推进状态`);
  if (nextMain) {
    assert.equal(context.currentUnitId, resumeUnitId, `${extension.id} 直接进入时完成后仍应回到下一主线章`);
    assert.equal(context.agenticChapterUnlockedBySequence(nextMain.id), true, `${extension.id} 直接进入时不能卡住主线路径`);
  }
}

(async () => {
  for (const extension of extensions) {
    await verifyChosenExtensionProgression(extension);
    await verifyDirectExtensionReturn(extension);
  }
  console.log(`extension chapter progression tests passed for ${extensions.length} chapters`);
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
