// KG-driven adaptive coach. Implements the three new affordances:
//   1) pre-test mastery -> let the student skip downstream nodes
//   2) post-test gaps   -> propose alt-modality re-learning paths
//   3) extension        -> permit a single-hop jump along extension edges
//
// The coach builds a deterministic plan from the KG, then asks the LLM adapter to wrap it
// in a short Chinese narration so the UI can present it as an agentic conversation.

const kg = require("./kg");
const llm = require("./llm");

const PRE_TEST_SKIP_THRESHOLD = 0.8;
const POST_TEST_REMEDIATE_THRESHOLD = 0.6;
const CORE_SCENE_ORDERS = new Set([1, 2, 3, 4, 6, 7, 8, 9, 10, 15]);
const RELEARN_SCENE_ORDERS = [5, 11, 12];
const EXTENSION_SCENE_ORDERS = [13, 14];

function chapterAccuracy(summary, chapterId, phase) {
  const item = summary.byChapter.find((entry) => entry.chapterId === chapterId && entry.phase === phase);
  return item ? item.accuracy : null;
}

function chapterTitle(chapterId) {
  const chapter = kg.chapterById(chapterId);
  return chapter ? chapter.title : chapterId;
}

function candidateFromUnit(unit, reason, extra = {}) {
  return {
    id: unit.id,
    title: unit.title,
    role: unit.role,
    modality: unit.modality,
    chapterId: unit.chapterId,
    reason,
    ...extra
  };
}

function unitsByOrders(units, orders) {
  const orderSet = new Set(orders);
  return units.filter((unit) => orderSet.has(unit.order));
}

function plan({ chapterId, currentUnitId, quizSummary }) {
  const chapter = kg.chapterById(chapterId);
  if (!chapter) return { ok: false, reason: "unknown_chapter" };

  const units = kg.unitsInChapter(chapterId);
  const preTest = units.find((unit) => unit.role === "pre_test");
  const postTest = units.find((unit) => unit.role === "post_test");
  const summary = quizSummary || { byChapter: [], wrongConcepts: [] };

  const preAcc = chapterAccuracy(summary, chapterId, "pre");
  const postAcc = chapterAccuracy(summary, chapterId, "post");

  const skipCandidates = [];
  const remediationCandidates = [];
  const extensionCandidates = [];

  // 1) Pre-test mastery -> propose to skip the next few non-checkpoint experiments.
  if (preAcc !== null && preAcc >= PRE_TEST_SKIP_THRESHOLD && preTest) {
    const downstream = kg.skippableUnitsAfter(preTest.id, { limit: 6 });
    downstream
      .filter((unit) => CORE_SCENE_ORDERS.has(unit.order))
      .forEach((unit) => skipCandidates.push(candidateFromUnit(unit, `pre_test_accuracy=${preAcc.toFixed(2)}`)));
  }

  // 2) Post-test gaps -> prefer same-chapter adaptive relearn units, then fall back to KG alt-modality variants.
  if (postAcc !== null && postAcc < POST_TEST_REMEDIATE_THRESHOLD && postTest) {
    const seen = new Set();
    unitsByOrders(units, RELEARN_SCENE_ORDERS).forEach((unit) => {
      seen.add(unit.id);
      remediationCandidates.push(candidateFromUnit(unit, `post_test_accuracy=${postAcc.toFixed(2)}`, {
        replaces: postTest.id
      }));
    });
    if (remediationCandidates.length < 3) {
      units.filter((unit) => unit.type === "interactive" && unit.order < postTest.order)
        .slice(-6)
        .forEach((unit) => {
          kg.altModalityUnitsFor(unit.id, { limit: 2 }).forEach((alt) => {
            if (seen.has(alt.id) || CORE_SCENE_ORDERS.has(alt.order)) return;
            seen.add(alt.id);
            remediationCandidates.push(candidateFromUnit(alt, `post_test_accuracy=${postAcc.toFixed(2)}`, {
              replaces: unit.id
            }));
          });
        });
    }
    remediationCandidates.splice(3);
  }

  // 3) Extension: prefer one same-chapter branch experiment, with graph one-hop as fallback.
  unitsByOrders(units, EXTENSION_SCENE_ORDERS).forEach((unit) => {
    extensionCandidates.push(candidateFromUnit(unit, "same_chapter_extension"));
  });
  if (!extensionCandidates.length) {
    kg.extensionUnitsForChapter(chapterId, { limit: 2 }).forEach((entry) => {
      extensionCandidates.push(candidateFromUnit(entry.unit, "extension_one_hop", {
        chapterId: entry.chapter.id,
        chapterTitle: entry.chapter.title
      }));
    });
  }

  const draftForLlm = {
    chapterId,
    chapterTitle: chapter.title,
    skip: skipCandidates.slice(0, 4),
    remediate: remediationCandidates.slice(0, 3),
    extension: extensionCandidates.slice(0, 1),
    weakConcepts: summary.wrongConcepts.slice(0, 3).map((entry) => entry.tag).join("、")
  };

  return {
    ok: true,
    chapterId,
    chapterTitle: chapter.title,
    currentUnitId,
    metrics: { preAccuracy: preAcc, postAccuracy: postAcc, weakConcepts: summary.wrongConcepts.slice(0, 5) },
    skipCandidates,
    remediationCandidates,
    extensionCandidates,
    draftForLlm
  };
}

async function explain(planResult, { studentName = "同学", studyGoal } = {}) {
  if (!planResult.ok) return { narration: "暂时没有可推荐的下一步。", provider: "skip" };
  const goal = studyGoal || "围绕本章核心概念建立稳固直觉";
  const system = [
    "你是一名高中阶段的微积分先修课 AI 学习助教，遵循 retrieve-first / progressive-hint-ladder / transfer-bridge 等学生侧学习技能。",
    "你只能在当前章节的知识图谱基础上推荐：跳过、换种模态再学、单步拓展。这三类决定全部由学生确认。",
    "不要泄露后测答案，不要把推荐写成命令式；用平和、鼓励的口吻；中文输出。"
  ].join("\n");
  const user = [
    `学生：${studentName}`,
    `当前章节：${planResult.chapterTitle}`,
    `本章学习目标：${goal}`,
    `前测正确率：${planResult.metrics.preAccuracy !== null ? planResult.metrics.preAccuracy.toFixed(2) : "未完成"}`,
    `后测正确率：${planResult.metrics.postAccuracy !== null ? planResult.metrics.postAccuracy.toFixed(2) : "未完成"}`,
    "",
    "下面是 KG 推荐的草案（来自检索 + 规则，不要随意改动内容，只用自然语言串起来）：",
    "<<<plan_json>>>",
    JSON.stringify({ ...planResult.draftForLlm, openingNote: `${studentName}，我看了你刚才的答题，给你一个三选一的小决定：` }, null, 2),
    "<<<end>>>",
    "",
    "请在 80-160 字之间，用 2-3 段口语化中文表达，让学生自己选择是否跳过、换种学法或解锁拓展。结尾给出 1 句鼓励性的反问，邀请他做出选择。"
  ].join("\n");
  try {
    const out = await llm.complete({ system, user, maxTokens: 500 });
    return { narration: (out.text || "").trim(), provider: out.provider };
  } catch (error) {
    return { narration: "（AI 助教暂时离线，下面是基于规则的建议。）", provider: "fallback", error: error.message };
  }
}

module.exports = { plan, explain };
