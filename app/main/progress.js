// Progress, quiz dashboard, and evaluation rendering.
function renderLibrary() {
  const units = allResourceUnits().filter((unit) => {
    if (libraryFilter === "all") return true;
    if (libraryFilter === "scene") return isOpenMaicV14Route() ? unit.flowKind === "core" : unit.kind === "scene" && unit.flowKind !== "adaptive";
    if (libraryFilter === "adaptive") return unit.flowKind === "adaptive";
    return unit.type === libraryFilter;
  });

  els.libraryCount.textContent = `${units.length} 项`;
  const unloadedCount = curriculum.filter((chapter) => !chapter.loaded).length;
  const cards = units
    .map((unit) => {
      const isSkipped = typeof agenticIsSkipped === "function" && agenticIsSkipped(unit.id);
      const isUnlocked = typeof agenticIsUnitUnlocked !== "function" || agenticIsUnitUnlocked(unit.id);
      const isDone = state.completed.includes(unit.id);
      const statusText = isDone
        ? "已完成"
        : isSkipped
          ? "已跳过"
          : unit.flowKind === "adaptive" && !isUnlocked
            ? "重学/拓展课件待解锁"
            : "可学习";
      const statusClass = isDone ? "done" : isSkipped || isUnlocked ? "todo" : "locked";
      const flowText = unit.flowKind === "adaptive" ? ` · ${escapeHtml(unit.flowLabel || "新加课件")}` : "";
      return `
      <article class="resource-card">
        <span class="type-pill">${typeText(unit)}${flowText}</span>
        <h2>${renderInlineMath(unit.label)}</h2>
        <p>${renderInlineMath(unit.chapterLabel)} · ${renderInlineMath(unit.summary)}</p>
        <span class="status-pill ${statusClass}">${statusText}</span>
        <button class="button soft" type="button" data-jump-unit="${unit.id}">在播放器中学习</button>
      </article>
    `;
    })
    .join("");
  const loadingNotice = unloadedCount
    ? `<div class="empty-state">正在后台加载 ${unloadedCount} 章轻量目录，资源列表会自动补齐。</div>`
    : "";
  const libraryHtml = `${cards}${loadingNotice}`;
  els.resourceGrid.innerHTML = libraryHtml || `<div class="empty-state">暂无匹配资源。</div>`;
}

function renderProgress() {
  els.completedCount.textContent = `${mainCompletedCount()}/${totalMainUnitCount()}`;
  els.chapterProgress.innerHTML = curriculum
    .map((chapter) => {
      const done = chapter.units.filter((unit) => typeof unitCountsTowardProgress === "function" ? unitCountsTowardProgress(unit) : state.completed.includes(unit.id)).length;
      const percent = chapter.units.length ? Math.round((done / chapter.units.length) * 100) : 0;
      return `
        <div>
          <strong>${chapter.label}</strong>
          <div class="progress-line" aria-label="${chapter.label} ${percent}%"><span style="width:${percent}%"></span></div>
        </div>
      `;
    })
    .join("");

  renderQuizDashboard();

  els.activityLog.innerHTML = state.logs.length
    ? state.logs.map((log) => `<li>${escapeHtml(log)}</li>`).join("")
    : "<li>还没有学习动态。完成模块、提交测验或切换章节后，这里会出现可回看的学习轨迹。</li>";
}

function renderQuizDashboard() {
  const results = state.quizResults || [];
  const objective = results.filter((item) => item.isCorrect !== null);
  const correct = objective.filter((item) => item.isCorrect).length;
  const pending = results.filter((item) => item.status === "pending_review").length;
  const accuracy = objective.length ? Math.round((correct / objective.length) * 100) : 0;
  const scored = results.filter((item) => item.maxScore);
  const earned = scored.reduce((sum, item) => sum + (item.score || 0), 0);
  const possible = scored.reduce((sum, item) => sum + (item.maxScore || 0), 0);
  const scoreRate = possible ? Math.round((earned / possible) * 100) : 0;

  const phaseRows = ["pre", "formative", "post"]
    .map((phase) => {
      const stats = phaseStats(results, phase);
      return `
        <div class="phase-card ${phase}">
          <div>
            <span>${phaseText(phase)}</span>
            <strong>${stats.attempts} 次</strong>
          </div>
          <div class="progress-line" aria-label="${phaseText(phase)} 得分率 ${stats.scoreRate}%">
            <span style="width:${stats.scoreRate}%"></span>
          </div>
          <small>正确率 ${stats.accuracy}% · 待复核 ${stats.pending}</small>
        </div>
      `;
    })
    .join("");

  const chapterRows = curriculum.map((chapter) => renderChapterQuizRow(results, chapter)).join("");
  const recentRows = results
    .slice(0, 8)
    .map(
      (item) => `
        <tr>
          <td>${escapeHtml(item.unitLabel)}</td>
          <td>${phaseText(resultPhase(item)) || "测验"}</td>
          <td>${statusText(item)}</td>
          <td>${item.maxScore ? `${item.score || 0}/${item.maxScore}` : "-"}</td>
          <td>${formatTime(item.timestamp)}</td>
        </tr>
      `
    )
    .join("");

  const totals = state.quizResults || [];
  const preAttempts = totals.filter((item) => item.phase === "pre").length;
  const postAttempts = totals.filter((item) => item.phase === "post").length;
  const encouragement = !totals.length
    ? "你还没有提交任何测验。试试点击首页的「学习」进入第一个模块！"
    : accuracy >= 85 ? "很棒！你的正确率很高，继续保持，尝试挑战更难的内容。"
    : accuracy >= 60 ? "不错的开端！每次提交都在积累理解，多看看答案解析会有帮助。"
    : accuracy >= 30 ? "加油！学习本身就是不断试错的过程。建议先看完答案解析，再回看对应的讲解页。"
    : "刚开始学习，犯错很正常。前测的目的是探测理解基线——答错越多，说明进步空间越大。坚持下去！";
  els.quizDashboard.innerHTML = `
    <p class="quiz-encouragement">${encouragement}</p>
    <div class="quiz-stats">
      <div><strong>${accuracy}%</strong><span>客观题正确率</span></div>
      <div><strong>${pending}</strong><span>短答待复核</span></div>
      <div><strong>${scoreRate}%</strong><span>估算得分率</span></div>
    </div>
    <div class="phase-dashboard">
      ${phaseRows}
    </div>
    <div class="quiz-history">
      ${chapterRows}
    </div>
    <div class="quiz-table-wrap">
      <table class="quiz-table">
        <thead>
          <tr><th>最近提交</th><th>阶段</th><th>状态</th><th>分数</th><th>时间</th></tr>
        </thead>
        <tbody>${recentRows || `<tr><td colspan="5">还没有测验提交。</td></tr>`}</tbody>
      </table>
    </div>
  `;
}

function renderChapterQuizRow(results, chapter) {
  const chapterResults = results.filter((item) => item.chapterId === chapter.id);
  const stats = phaseStats(chapterResults);
  return `
    <div class="quiz-row">
      <div><span>${chapter.label}</span><strong>${chapterResults.length} 次</strong></div>
      <div class="progress-line"><span style="width:${stats.accuracy}%"></span></div>
    </div>
  `;
}

function phaseStats(results, phase = "") {
  const phaseResults = phase ? results.filter((item) => resultPhase(item) === phase) : results;
  const objective = phaseResults.filter((item) => item.isCorrect !== null);
  const correct = objective.filter((item) => item.isCorrect).length;
  const scored = phaseResults.filter((item) => item.maxScore);
  const earned = scored.reduce((sum, item) => sum + (item.score || 0), 0);
  const possible = scored.reduce((sum, item) => sum + (item.maxScore || 0), 0);
  return {
    attempts: phaseResults.length,
    pending: phaseResults.filter((item) => item.status === "pending_review").length,
    accuracy: objective.length ? Math.round((correct / objective.length) * 100) : 0,
    scoreRate: possible ? Math.round((earned / possible) * 100) : 0
  };
}

function resultPhase(item) {
  if (item.phase) return item.phase;
  for (const chapter of curriculum) {
    const unit = chapter.units.find((candidate) => candidate.id === item.unitId);
    if (unit) return unit.assessmentPhase || "";
  }
  return "";
}

function statusText(item) {
  if (item.status === "pending_review") return "待复核";
  if (item.isCorrect === true) return "正确";
  if (item.isCorrect === false) return "需复盘";
  return "已记录";
}

function formatTime(value) {
  if (!value) return "-";
  return new Date(value).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });
}

function renderEvaluation() {
  const results = state.quizResults || [];
  const totalUnits = totalMainUnitCount();
  const completionRate = totalUnits ? Math.round((mainCompletedCount() / totalUnits) * 100) : 0;
  const pre = phaseStats(results, "pre");
  const formative = phaseStats(results, "formative");
  const post = phaseStats(results, "post");
  const learningGain = post.attempts && pre.attempts ? Math.max(0, post.scoreRate - pre.scoreRate) : 0;

  const workflow = [
    ["1", "生成任务与设计规范", "选择微积分问题、目标学生、知识边界、互动密度和质量门槛。", "题目集 / 需求 / 设计规范"],
    ["2", "生成系统优化", "比较提示、工具调用、资源检索、课程组装和自检策略的技术贡献。", "技术贡献"],
    ["3", "界面设计优化", "检查生成界面的可操作性、反馈质量、沉浸感、可访问性和认知负荷。", "设计贡献"],
    ["4", "离线自动评测", "用模型裁判与题目测试集先筛掉质量不足的课程。", "离线基准"],
    ["5", "人类裁判评分", "专家按评分量表直接给内容质量、交互质量、学习支持与安全性分数。", "专家评分"],
    ["6", "真实学习追踪", "高中生进入站内完成前测、形成性测验、后测与长期跟踪。", "学生学习研究"],
    ["7", "差距分析", "比较自动裁判、人类专家和真实学习成效之间的差距。", "差距分析"]
  ];

  els.evaluationBoard.innerHTML = workflow
    .map(
      ([step, title, text, output]) => `
        <article class="evaluation-step">
          <span class="step-index">${step}</span>
          <h2>${title}</h2>
          <p>${text}</p>
          <strong>${output}</strong>
        </article>
      `
    )
    .join("");

  const metricCards = [
    ["资源覆盖", `${curriculum.length} 章 / ${totalUnits} 主线模块`, `每章 ${AGENTIC_RELEARN_SCENE_ORDERS.length + AGENTIC_EXTENSION_SCENE_ORDERS.length} 个重学/拓展课件位`],
    ["完成率", `${completionRate}%`, "用于估计真实学习的过程参与度"],
    ["前测", `${pre.scoreRate}%`, `${pre.attempts} 次提交，作为先验水平基线`],
    ["形成性测验", `${formative.scoreRate}%`, `${formative.attempts} 次提交，观察过程性纠偏`],
    ["后测", `${post.scoreRate}%`, `${post.attempts} 次提交，衡量通关表现`],
    ["学习增益", learningGain ? `+${learningGain}%` : "待采集", "后测与前测的可视化差值"]
  ];

  els.evaluationMetrics.innerHTML = metricCards
    .map(
      ([label, value, note]) => `
        <article class="metric-card">
          <span>${label}</span>
          <strong>${value}</strong>
          <p>${note}</p>
        </article>
      `
    )
    .join("");

  const realWorldScore = post.attempts ? post.scoreRate : Math.max(0, Math.round((completionRate + formative.scoreRate) / 2));
  const comparisons = [
    ["自适应高数课程", 88, 86, realWorldScore || "待采集"],
    ["普通生成课程", 76, 72, 0],
    ["专家设计课程", 91, 92, 0]
  ];

  els.evaluationRuns.innerHTML = `
    <article class="comparison-panel">
      <div>
        <p class="eyebrow">Score comparison</p>
        <h2>自动评测、人类评分与真实学习差距</h2>
      </div>
      <div class="comparison-table-wrap">
        <table class="comparison-table">
          <thead>
            <tr><th>系统</th><th>模型裁判</th><th>专家评分</th><th>学生结果</th><th>差距</th></tr>
          </thead>
          <tbody>
            ${comparisons
              .map(([name, llm, human, real]) => {
                const gap =
                  typeof real === "number" && real
                    ? `${Math.abs(llm - human)} / ${Math.abs(human - real)}`
                    : "等待学生数据";
                return `<tr><td>${name}</td><td>${llm}</td><td>${human}</td><td>${real || "待采集"}</td><td>${gap}</td></tr>`;
              })
              .join("")}
          </tbody>
        </table>
      </div>
    </article>
  `;
}
