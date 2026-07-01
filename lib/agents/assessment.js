const { completeChat } = require("../llm");

const ASSESSMENT_MODEL = process.env.ASSESSMENT_MODEL || process.env.PIONEER_MODEL || "pioneer/auto";

const SYSTEM_PROMPT = `你是一个学习诊断专家。根据学生的答题数据和AI评分结果，诊断学生的知识掌握状态。

严格使用以下 JSON 格式输出：
{
  "masteryLevel": <0.0-1.0>,
  "weakConcepts": [{"concept": "<概念名>", "severity": "high"|"medium"|"low", "reason": "<原因>"}],
  "suggestedAction": "skip"|"remediate"|"extend"|"continue",
  "confidenceLevel": <0.0-1.0>,
  "summary": "<一句话中文诊断总结>"
}`;

function buildPrompt({ quizSummary, gradingResults, interactionEvents }) {
  const parts = ["## 答题数据"];
  if (quizSummary?.byChapter?.length) {
    quizSummary.byChapter.forEach(ch => {
      parts.push(`- 章节 ${ch.chapterId}，阶段 ${ch.phase}，正确 ${ch.correct}/${ch.total}，准确率 ${(ch.accuracy * 100).toFixed(0)}%`);
    });
  }
  if (quizSummary?.wrongConcepts?.length) {
    parts.push("\n## 错误概念");
    quizSummary.wrongConcepts.slice(0, 10).forEach(wc => {
      parts.push(`- 概念 ${wc.tag}，错误次数 ${wc.count}`);
    });
  }
  if (gradingResults?.length) {
    parts.push("\n## 简答题AI评分");
    gradingResults.forEach(gr => {
      parts.push(`- 题目 ${gr.questionId}：${gr.score}分，错误类型 ${gr.errorType}，弱概念 [${gr.weakConcepts.join(",")}]，反馈：${gr.feedback}`);
    });
  }
  if (interactionEvents && interactionEvents.length) {
    const eventTypes = {};
    let totalTime = 0, paramChanges = 0;
    interactionEvents.forEach(e => {
      const t = e?.type || e?.payload?.eventType || "unknown";
      eventTypes[t] = (eventTypes[t] || 0) + 1;
      const dur = e?.payload?.timing?.durationMs || e?.timing?.durationMs || 0;
      totalTime += dur;
      if (t === "parameter_commit" || t === "parameter_change") paramChanges++;
    });
    parts.push("\n## 课件交互数据");
    parts.push("- 总交互事件数：" + interactionEvents.length);
    parts.push("- 总停留时长：" + Math.round(totalTime / 1000) + " 秒");
    parts.push("- 参数调整次数：" + paramChanges);
    const topTypes = Object.entries(eventTypes).sort((a,b) => b[1]-a[1]).slice(0,5);
    topTypes.forEach(([t, c]) => parts.push("- 事件类型 " + t + "：" + c + " 次"));
  }
  return parts.join("\n");
}

function safeParse(text) {
  try {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
  } catch {}
  return null;
}

async function analyze({ quizSummary, gradingResults, interactionEvents }) {
  const which = require("../llm").provider();
  if (which !== "pioneer") {
    const acc = quizSummary?.byChapter?.[0]?.accuracy ?? 0.5;
    const wc = (quizSummary?.wrongConcepts || []).slice(0, 3).map(w => ({ concept: w.tag, severity: w.count >= 3 ? "high" : "medium", reason: `错误 ${w.count} 次` }));
    const action = acc >= 0.8 ? "skip" : acc < 0.6 ? "remediate" : "continue";
    return { masteryLevel: acc, weakConcepts: wc, suggestedAction: action, confidenceLevel: 0.5, summary: "基于规则的诊断结果" };
  }
  try {
    const result = await completeChat({
      system: SYSTEM_PROMPT,
      user: buildPrompt({ quizSummary, gradingResults, interactionEvents }),
      jsonHint: true,
      maxTokens: 500,
      model: ASSESSMENT_MODEL
    });
    const parsed = safeParse(result.text);
    if (!parsed) return fallback(quizSummary);
    return {
      masteryLevel: parsed.masteryLevel ?? 0.5,
      weakConcepts: Array.isArray(parsed.weakConcepts) ? parsed.weakConcepts : [],
      suggestedAction: parsed.suggestedAction || "continue",
      confidenceLevel: parsed.confidenceLevel ?? 0.5,
      summary: parsed.summary || ""
    };
  } catch {
    return fallback(quizSummary);
  }
}

function fallback(quizSummary) {
  const acc = quizSummary?.byChapter?.[0]?.accuracy ?? 0.5;
  return { masteryLevel: acc, weakConcepts: [], suggestedAction: acc >= 0.8 ? "skip" : acc < 0.6 ? "remediate" : "continue", confidenceLevel: 0.3, summary: "诊断降级为规则模式" };
}

module.exports = { analyze };
