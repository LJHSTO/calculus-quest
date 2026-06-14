// Recommendation generation and recommendation UI.
function allUnits() {
  return curriculum.flatMap((chapter) => chapter.units.map((unit) => ({ ...unit, chapterLabel: chapter.label })));
}

function allNavigableUnits() {
  return [...allUnits(), ...supplementUnits];
}

function recommendedNavigableUnits() {
  const main = allUnits();
  if (!supplementEntryUnitId) return main;
  const entryUnit = getUnit(supplementEntryUnitId);
  if (!entryUnit) return main;
  const recs = generateRecommendations(entryUnit.chapterId);
  const recSupplementUnits = recs.map(r => r.unit).filter(Boolean);
  const entryIdx = main.findIndex(u => u.id === supplementEntryUnitId);
  if (entryIdx < 0) return main;
  return [
    ...main.slice(0, entryIdx + 1),
    ...recSupplementUnits,
    ...main.slice(entryIdx + 1)
  ];
}

function currentNavigableUnits() {
  return supplementEntryUnitId ? recommendedNavigableUnits() : allUnits();
}

function mainCompletedCount() {
  const mainIds = new Set(allUnits().map((unit) => unit.id));
  return state.completed.filter((id) => mainIds.has(id) || isMainUnitId(id)).length;
}

function generateRecommendations(chapterId = currentChapterId, limit = 6) {
  const evidence = recommendationEvidence(chapterId);
  if (!evidence.length) return [];

  const topicScores = new Map();
  evidence.forEach((item) => {
    const matches = matchQuestionToSupplements(item.question, item.unit, item.phase);
    matches.forEach((match) => {
      const current = topicScores.get(match.file) || {
        file: match.file,
        score: 0,
        triggers: [],
        bestPhase: item.phase
      };
      current.score += match.score * item.weight;
      current.triggers.push({ ...item, matchedTags: match.tags });
      if (item.phase === "formative") current.bestPhase = "formative";
      topicScores.set(match.file, current);
    });
  });

  return Array.from(topicScores.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, 4)
    .flatMap((topic) => {
      const trigger = topic.triggers[0];
      return modelPlanFor(topic.bestPhase, trigger.result)
        .map((modelId, index) => {
          const unit = supplementUnits.find((item) => item.modelId === modelId && item.file === topic.file);
          if (!unit) return null;
          return {
            unit,
            score: topic.score - index * 0.15,
            phase: topic.bestPhase,
            trigger,
            reason: recommendationReason(unit, trigger),
            matchedTags: trigger.matchedTags || []
          };
        })
        .filter(Boolean);
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

function recommendationEvidence(chapterId) {
  return (state.quizResults || [])
    .filter((item) => item.chapterId === chapterId && ["pre", "formative"].includes(resultPhase(item)))
    .map((result) => {
      const unit = getUnit(result.unitId);
      if (!unit?.scene) return null;
      const question = unit?.scene?.content?.questions?.find((item) => item.id === result.questionId);
      if (!question) return null;
      const scoreRate = result.maxScore ? (result.score || 0) / result.maxScore : result.isCorrect === false ? 0 : 1;
      const weak =
        result.isCorrect === false ||
        result.status === "pending_review" ||
        (result.maxScore && scoreRate < 0.72);
      if (!weak) return null;
      return {
        result,
        unit,
        question,
        phase: resultPhase(result),
        scoreRate,
        weight: resultPhase(result) === "formative" ? 1.25 : 1
      };
    })
    .filter(Boolean);
}

function matchQuestionToSupplements(question, unit, phase) {
  const corpus = questionCorpus(question, unit);
  const chapterFiles = Object.entries(supplementAnalysis).filter(([, analysis]) => analysis.chapterId === unit.chapterId);
  const matches = chapterFiles
    .map(([file, analysis], index) => {
      const matchedTags = analysis.tags.filter((tag) => corpus.includes(tag.toLowerCase()));
      const titleTokens = analysis.title.split(/[：、\s]+/).filter((token) => token.length >= 2);
      const titleHits = titleTokens.filter((token) => corpus.includes(token.toLowerCase())).length;
      const fallback = phase === "pre" ? Math.max(0.2, 1 - index * 0.08) : Math.max(0.15, 0.7 - index * 0.05);
      return {
        file,
        tags: matchedTags,
        score: matchedTags.length * 2.5 + titleHits * 1.5 + fallback
      };
    })
    .sort((a, b) => b.score - a.score);
  return matches.slice(0, 2);
}

function questionCorpus(question, unit) {
  const optionText = (question.options || []).map((option) => `${option.value} ${option.label}`).join(" ");
  return `${unit.scene?.title || ""} ${question.question || ""} ${question.analysis || ""} ${question.commentPrompt || ""} ${optionText}`.toLowerCase();
}

function modelPlanFor(phase, result) {
  if (phase === "pre") return ["gemini-3.1-pro", "qwen3.6-27b"];
  if (result?.status === "pending_review" || result?.questionType === "short_answer") return ["qwen3.6-35b-a3b", "glm-5"];
  return ["qwen3.6-27b", "qwen3.6-35b-a3b"];
}

function recommendationReason(unit, trigger) {
  const tags = trigger.matchedTags?.length ? `命中关键词：${trigger.matchedTags.join("、")}。` : "";
  const phase = phaseText(trigger.phase);
  const status = statusText(trigger.result);
  return `${phase}中的「${trigger.unit.label}」显示为${status}。${tags}${unit.analysis.bestFor}`;
}

function renderRecommendationPanel() {
  if (!els.recommendationPanel) return;
  const unit = getUnit();
  if (!unit) {
    els.recommendationPanel.hidden = true;
    els.recommendationPanel.innerHTML = "";
    return;
  }
  const chapterId = unit.chapterId || currentChapterId;
  const recommendations = generateRecommendations(chapterId);
  if (!recommendations.length) {
    els.recommendationPanel.hidden = true;
    els.recommendationPanel.innerHTML = "";
    return;
  }

  const collapsed = Boolean(state.recommendationsCollapsed);
  els.recommendationPanel.hidden = false;
  els.recommendationPanel.dataset.collapsed = collapsed ? "true" : "false";
  els.recommendationPanel.innerHTML = `
    <div class="recommendation-heading">
      <div>
        <p class="eyebrow">学习推荐</p>
        <h2>根据测验结果推荐补充课程</h2>
      </div>
      <div class="recommendation-controls">
        <span>${recommendations.length} 个推荐</span>
        <button class="button soft" type="button" data-toggle-recommendations aria-expanded="${collapsed ? "false" : "true"}" aria-controls="recommendation-content">${collapsed ? "展开" : "收起"}</button>
      </div>
    </div>
    <div id="recommendation-content" class="recommendation-content ${collapsed ? "collapsed" : ""}">
      <div class="recommendation-list">
      ${recommendations
        .map(({ unit, reason, phase, matchedTags }) => {
          const done = state.completed.includes(unit.id);
          return `
          <article class="recommendation-card">
            <div>
              <span class="type-pill">${unit.modelLabel} · ${unit.modelRole}</span>
              <h3>${escapeHtml(unit.analysis.title)}</h3>
              <p>${escapeHtml(reason)}</p>
              <small>${phaseText(phase)} · ${escapeHtml(unit.analysis.prerequisite)} ${
                matchedTags.length ? `· ${matchedTags.map(escapeHtml).join(" / ")}` : ""
              }</small>
            </div>
            <div class="recommendation-actions">
              <span class="status-pill ${done ? "done" : "todo"}">${done ? "已学完" : "待学习"}</span>
              <button class="button soft" type="button" data-open-supplement="${unit.id}">学习补给</button>
              <button class="button soft" type="button" data-complete-supplement="${unit.id}" ${done ? "disabled" : ""}>
                ${done ? "已学完" : "标记已学完"}
              </button>
            </div>
          </article>
        `;
        })
        .join("")}
      </div>
    </div>
  `;
}

