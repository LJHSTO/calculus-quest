// Learning shell, player, lesson, and resource rendering.
function renderMetrics() {
  const totals = courseIndex?.totals;
  const loadedChapters = curriculum.filter((chapter) => chapter.loaded);
  const chapterCount = courseIndex?.chapters?.length || curriculum.length || loadedChapters.length;
  const coreSceneCount = chapterCount * AGENTIC_CORE_SCENE_ORDERS.length;
  const sceneCount = coreSceneCount || loadedChapters.reduce((sum, chapter) => sum + (chapter.units || []).length, 0);
  const adaptiveCount = chapterCount * (AGENTIC_RELEARN_SCENE_ORDERS.length + AGENTIC_EXTENSION_SCENE_ORDERS.length);
  const coreInteractiveCount = chapterCount * AGENTIC_CORE_INTERACTIVE_SCENE_ORDERS.length;
  const htmlCount =
    coreInteractiveCount ||
    loadedChapters.reduce((sum, chapter) => sum + (chapter.allUnits || chapter.units || []).filter((unit) => unit.type === "interactive").length, 0);
  const audioCount = totals?.audio || loadedChapters.reduce((sum, chapter) => sum + countAudio(chapter.manifest), 0);
  els.metricChapters.textContent = curriculum.length;
  els.metricScenes.textContent = sceneCount;
  els.metricGlm.textContent = adaptiveCount;
  els.metricHtml.textContent = htmlCount;
  els.metricAudio.textContent = audioCount;
}

function countAudio(manifest) {
  return manifest.scenes.reduce(
    (sum, scene) => sum + (scene.actions || []).filter((action) => action.audioRef).length,
    0
  );
}

function renderChapters() {
  els.chapterList.innerHTML = curriculum
    .map((chapter, index) => {
      const done = chapter.units.filter((unit) => state.completed.includes(unit.id)).length;
      const total = chapter.loaded ? chapter.units.length : AGENTIC_CORE_SCENE_ORDERS.length;
      const guide = chapterGuides[chapter.id];
      return `
        <button class="chapter-card ${chapter.id === currentChapterId ? "active" : ""}" type="button" data-chapter="${chapter.id}">
          <span class="chapter-card-top">
            <strong>第 ${index + 1} 章 ${escapeHtml(chapter.label)}</strong>
            ${guide ? `<span>${guide.difficulty}</span>` : ""}
          </span>
          <small>${chapter.loaded ? `${done}/${total} 模块` : `${total} 模块 · 目录待载入`} · ${escapeHtml(chapter.summary)}</small>
          ${guide ? `<small class="chapter-bridge">${escapeHtml(guide.bridge)} · ${guide.pace}</small>` : ""}
        </button>
      `;
    })
    .join("");
}

function renderLessons() {
  const chapter = getChapter();
  els.chapterTitle.textContent = chapter.label;
  if (!chapter.loaded) {
    els.lessonList.innerHTML = '<div class="empty-state">点击左侧章节卡片来加载本章的学习模块，包括 slides、互动实验和测验。</div>';
    return;
  }
  els.lessonList.innerHTML = chapter.units.map(function(unit, index) {
    const isLocked = typeof agenticIsUnitUnlocked === "function"
      && !agenticIsUnitUnlocked(unit.id)
      && !agenticIsSkipped(unit.id);
    const isSkipped = typeof agenticIsSkipped === "function" && agenticIsSkipped(unit.id);
    const statusText = isLocked ? "待解锁" : isSkipped ? "可回看" : state.completed.includes(unit.id) ? "已完成" : "未完成";
    const lockIcon = isLocked ? " [锁定]" : isSkipped ? " [可回看]" : "";
    const cls = ["lesson-card", unit.id === currentUnitId ? "active" : "", isLocked ? "locked" : ""].filter(Boolean).join(" ");
    const icon = unitIcon(unit);
    return "<button class=\"" + cls + "\" type=\"button\" data-unit=\"" + unit.id + "\"" + (isLocked ? " aria-disabled=\"true\"" : "") + ">"
      + "<span class=\"lesson-card-icon\">" + icon + "</span>"
      + "<span class=\"lesson-card-body\">"
      + "<strong>" + (index + 1) + ". " + escapeHtml(unit.label) + "</strong>"
      + "<small>" + typeText(unit) + " · " + statusText + lockIcon + "</small>"
      + "</span>"
      + "</button>";
  }).join("");
}

function unitIcon(unit) {
  if (unit.type === "quiz") {
    if (unit.assessmentPhase === "pre") return "测";
    if (unit.assessmentPhase === "post") return "后";
    return "练";
  }
  if (unit.type === "slide") return "读";
  if (unit.type === "interactive") return "互";
  return "学";
}

function typeText(unit) {
  if (unit.type === "quiz") return phaseText(unit.assessmentPhase) || "测验";
  return {
    slide: "讲解",
    interactive: "互动实验"
  }[unit.type] || "学习模块";
}

function unitLearningFocus(unit) {
  if (unit.type === "quiz") {
    return {
      action:
        unit.assessmentPhase === "pre"
          ? "先按直觉作答，不需要提前查公式。"
          : unit.assessmentPhase === "post"
            ? "像一次小通关一样整页完成，再提交。"
            : "把刚学过的想法迁移到题目里，整页完成后再提交。",
      check: "提交前不显示答案；提交后会跳回第一题，逐题复盘答案解析。",
      help: "短答题写出推理过程即可，Agent/教师后续可以复核。"
    };
  }

  if (unit.type === "slide") {
    return {
      action: "先抓住这一页想建立的一个核心图像或公式关系。",
      check: "看完后试着用自己的话解释标题里的关键词。",
      help: "可以点「播放全部」听完整旁白，再进入互动实验。"
    };
  }

  return {
    action: "先动手拖拽或点击，观察变量、图像和数值怎样一起变化。",
    check: "不要只看结论，至少做一次反方向操作，比较变化差异。",
    help: "实验页可全屏；做完后用「完成本节」留下学习记录。"
  };
}

function renderPlayer() {
  const unit = getUnit();
  if (!unit) {
    els.lessonType.textContent = "Loading";
    els.lessonTitle.textContent = "正在加载章节";
    els.lessonSummary.textContent = "按章节加载资源，稍等片刻即可开始学习。";
    els.completeLesson.disabled = true;
    els.completeLesson.textContent = "完成本节并跳到下一节";
    renderRecommendationPanel();
    renderLoadingStatus(getChapter()?.label || "课程");
    return;
  }
  if (activeNarration && activeNarration.unitId !== unit.id) stopNarrationQueue();
  currentUnitId = unit.id;
  currentChapterId = unit.chapterId;
  saveState();

  els.lessonType.textContent = typeText(unit);
  els.lessonTitle.innerHTML = renderInlineMath(unit.label);
  const guide = chapterGuides[unit.chapterId];
  els.lessonSummary.innerHTML = `${renderInlineMath(unit.summary)}${guide?.goal ? `<small style="display:block;margin-top:4px;color:var(--muted);">${renderInlineMath(guide.goal)}${guide?.checkpoint ? " " + renderInlineMath(guide.checkpoint) : ""}</small>` : ""}`;
  els.completeLesson.disabled = false;
  const chapter = getChapter();
  const unitIdx = chapter.units.findIndex(u => u.id === unit.id);
  const isLastInChapter = unitIdx >= chapter.units.length - 1;
  const chapterIdx = curriculum.findIndex(c => c.id === chapter.id);
  const isLastUnit = isLastInChapter && chapterIdx >= curriculum.length - 1;
  if (isLastUnit) {
    els.completeLesson.textContent = state.completed.includes(unit.id) ? "已完成，记录复习" : "完成本节";
  } else {
    els.completeLesson.textContent = state.completed.includes(unit.id) ? "复习并跳到下一节" : "完成本节并跳到下一节";
  }
  updateFullscreenButton();
  renderRecommendationPanel();

  if (unit.scene.type === "quiz") {
    renderQuiz(unit);
  } else if (unit.scene.type === "slide") {
    renderSlide(unit);
  } else {
    renderInteractive(unit);
  }
  renderBottomNextButton();
  if (typeof syncAgenticPlayerCta === "function") syncAgenticPlayerCta(unit);
  if (typeof renderAgenticCoachPanel === "function") renderAgenticCoachPanel();
  syncNarrationUi();
}

function renderCoach(scene, chapterId, unitId) {
  const actions = (scene.actions || []).filter((action) => action.text || action.prompt).slice(0, 5);
  if (!actions.length) return "";
  const audioActions = actions.filter((action) => action.audioRef);
  const collapsed = Boolean(state.narrationCollapsed);

  return `
    <div class="coach-strip ${collapsed ? "collapsed" : ""}" data-coach-strip>
      <div class="coach-strip-header">
        <div>
          <span class="type-pill">语音旁白</span>
          <strong>${audioActions.length ? `${audioActions.length} 段可播放` : "课堂提示"}</strong>
        </div>
        <button class="button soft" type="button" data-toggle-narration aria-expanded="${collapsed ? "false" : "true"}">
          ${collapsed ? "展开旁白" : "收起旁白"}
        </button>
      </div>
      ${
        audioActions.length
          ? `<div class="coach-toolbar" data-narration-unit="${unitId}" data-narration-total="${audioActions.length}">
              <button class="button soft" type="button" data-play-narration>播放全部</button>
              <button class="button soft" type="button" data-pause-narration>暂停</button>
              <button class="button soft" type="button" data-stop-narration>停止</button>
              <div class="narration-timeline">
                <input class="narration-progress" type="range" min="0" max="1000" value="0" data-narration-seek aria-label="拖动旁白进度" />
                <div class="narration-meta">
                  <span data-narration-time>00:00 / --:--</span>
                  <span data-narration-segment>0/${audioActions.length} 段</span>
                </div>
              </div>
            </div>`
          : ""
      }
      <div class="coach-content" data-narration-content ${collapsed ? "hidden" : ""}>
        ${actions
          .map((action) => `
            <div class="coach-line" ${action.audioRef ? `data-audio-src="${resourceUrl(`resources/open-maic/${chapterId}/${action.audioRef}`)}"` : ""}>
              <strong>${action.type === "discussion" ? "讨论引导" : "教师旁白"}</strong>
              <div>${renderInlineMath(action.text || action.prompt || "")}</div>
            </div>
          `)
          .join("")}
      </div>
    </div>
  `;
}

function renderResourceShell(unit, title, body, className = "") {
  return `
    <section class="resource-shell ${className}" data-resource-shell data-resource-unit="${unit.id}">
      <div class="resource-toolbar">
        <div>
          <span class="type-pill">${typeText(unit)}</span>
          <strong>${escapeHtml(title)}</strong>
        </div>
        <button class="button soft" type="button" data-resource-fullscreen>全屏</button>
      </div>
      <div class="resource-body">
        ${body}
      </div>
    </section>
  `;
}

function renderQuiz(unit) {
  analyticsTrack("quiz_render", {
    source: "quiz",
    data: {
      unitId: unit.id,
      chapterId: unit.chapterId,
      phase: unit.assessmentPhase || "",
      moduleRole: moduleRoleForUnit(unit)
    }
  });
  const questions = unit.scene.content?.questions || [];
  const submitted = (state.submittedQuizzes || []).includes(unit.id);
  const isPre = unit.assessmentPhase === "pre";

  // Persist encouragement banner for submitted quizzes
  let quizTopBanner = "";
  if (submitted) {
    const unitResults = (state.quizResults || []).filter(r => r.unitId === unit.id);
    const summary = summarizeQuizAttempt(unitResults, questions);
    const outcomeHtml = quizOutcomeHtml(summary);
    if (isPre) {
      quizTopBanner = `
        <div class="quiz-encouragement-banner" id="quiz-top-banner-${unit.id}">
          前测提交成功！你在 ${outcomeHtml}。没答对的也不要紧——这正是接下来要学的内容。学完本章后会再做一次后测，对比看看自己进步了多少。
        </div>
        <p class="quiz-scroll-hint">向下滑动查看 Agentic Coach 讲解，答错的题先思考再看答案。</p>`;
    } else if (unit.assessmentPhase === "post") {
      quizTopBanner = `
        <div class="quiz-encouragement-banner post" id="quiz-top-banner-${unit.id}">
          后测提交成功！你在 ${outcomeHtml}。和前测对比一下，看看这一章你攻克了多少一开始不会的题目。
        </div>
        <p class="quiz-scroll-hint">向下滑动查看 Agentic Coach 讲解，答错的题先思考再看答案。</p>`;
    } else {
      quizTopBanner = `
        <div class="quiz-encouragement-banner formative" id="quiz-top-banner-${unit.id}">
          形成性测验提交成功！你在 ${outcomeHtml}。卡住的地方正好说明接下来要重点理解的内容——Agent 会用 MAIC-UI 互动课件帮你换种方式重学或解锁一步拓展。
        </div>
        <p class="quiz-scroll-hint">向下滑动查看 Agentic Coach 讲解，答错的题先思考再看答案。</p>`;
    }
  }

  // Build a lookup of latest result per question for persisted review
  const latestByQuestion = {};
  let submittedTotalHtml = "";
  if (submitted) {
    const unitResults = (state.quizResults || []).filter(r => r.unitId === unit.id);
    Object.assign(latestByQuestion, quizLatestResultsByQuestion(unitResults));
    const summary = summarizeQuizAttempt(unitResults, questions);
    submittedTotalHtml = `<div class="quiz-section-total">${quizOutcomeHtml(summary)}</div>`;
  }

  els.lessonPlayer.innerHTML = `
    ${renderCoach(unit.scene, unit.chapterId, unit.id)}
    ${renderResourceShell(
      unit,
      unit.label,
      `
        ${renderAssessmentBanner(unit)}
        <div class="quiz-card">
          ${quizTopBanner}
          ${questions
            .map((question, index) => {
              const result = latestByQuestion[question.id];
              const fallbackShortResult = submitted && question.type === "short_answer" && !result
                ? {
                    mode: "short_answer",
                    response: readQuizDraft(unit.id, question.id, ""),
                    isCorrect: null,
                    status: "pending_review",
                    score: null,
                    maxScore: question.points || 0
                  }
                : null;
              const reviewResult = result || fallbackShortResult;
              const review = reviewResult ? renderQuestionReview({ question, result: reviewResult, index, unit }) : "";
              const scoreLabel = quizQuestionScoreLabel(question, reviewResult || null);
              return `
              <article class="question-card" data-question="${question.id}">
                <div class="question-title-row">
                  <h3>${index + 1}. ${renderInlineMath(question.question)}</h3>
                  ${scoreLabel ? `<span class="question-score-pill">${escapeHtml(scoreLabel)}</span>` : ""}
                </div>
                ${renderQuestionInput(unit, question, submitted, reviewResult)}
                ${review}
              </article>
            `;
            })
            .join("")}
          <div class="quiz-submit-panel${submitted ? ' submitted' : ''}">
            <button class="button primary" type="button" data-submit-quiz="${unit.id}" ${submitted ? "disabled" : ""}>${submitted ? '已提交' : '提交本次测验'}</button>
            <p>${submitted ? '该测验已提交，答案、解析、每题得分和小节总分见下方。' : '提交后会记录本次测验结果；评分参考会在提交后随解析显示。'}</p>
            <div class="answer-feedback" id="feedback-${unit.id}">${submittedTotalHtml}</div>
          </div>
        </div>
      `,
      "quiz-resource"
    )}
  `;
  setupQuizVisibilityTracking(unit);
}

function renderAssessmentBanner(unit) {
  if (!unit.assessmentPhase) return "";
  return `
    <div class="assessment-banner ${unit.assessmentPhase}">
      <span class="type-pill">${phaseText(unit.assessmentPhase)}</span>
      <p>${phaseGoal(unit.assessmentPhase)}</p>
    </div>
  `;
}

function renderQuestionInput(unit, question, submitted, result = null) {
  if (question.type === "short_answer") {
    const inputId = `answer-${unit.id}-${question.id}`;
    const draft = submitted && result?.response != null ? result.response : readQuizDraft(unit.id, question.id, "");
    return `
      <div class="short-answer-box">
        <label for="${inputId}">写下你的推理或计算过程</label>
        <textarea
          id="${inputId}"
          name="${unit.id}-${question.id}"
          rows="5"
          data-short-answer
          data-unit-id="${unit.id}"
         data-question-id="${question.id}"
          ${submitted ? "disabled" : ""}
         placeholder="例如：先写出计算步骤，再解释几何或物理意义。"
        >${escapeHtml(draft)}</textarea>
        <div class="draft-status">本题草稿会自动保存在本地记录中</div>
      </div>
    `;
  }

  return `
    <fieldset>
      ${(question.options || [])
        .map((option) => {
          const draft = submitted && result?.response != null ? result.response : readQuizDraft(unit.id, question.id, question.type === "multiple" ? [] : "");
          const selected = Array.isArray(draft) ? draft.includes(option.value) : draft === option.value;
          return `
          <label>
            <input
              type="${question.type === "multiple" ? "checkbox" : "radio"}"
              name="${unit.id}-${question.id}"
              value="${option.value}"
              data-choice-answer
              data-unit-id="${unit.id}"
              data-question-id="${question.id}"
              ${selected ? "checked" : ""}
              ${submitted ? "disabled" : ""}
            />
            <span>${option.value}. ${renderInlineMath(option.label)}</span>
          </label>
        `;
        })
        .join("")}
    </fieldset>
  `;
}

function renderSlide(unit) {
  analyticsTrack("slide_render", {
    data: {
      unitId: unit.id,
      chapterId: unit.chapterId,
      moduleRole: moduleRoleForUnit(unit)
    }
  });
  const canvas = unit.scene.content?.canvas;
  if (!canvas) {
    els.lessonPlayer.innerHTML = `
      ${renderCoach(unit.scene, unit.chapterId, unit.id)}
      ${renderResourceShell(unit, unit.label, `<div class="empty-state">这一页没有可渲染的画布内容。</div>`, "slide-resource")}
    `;
    return;
  }

  els.lessonPlayer.innerHTML = `
    ${renderCoach(unit.scene, unit.chapterId, unit.id)}
    ${renderResourceShell(
      unit,
      unit.label,
      `<div class="slide-wrap">
        <div class="slide-stage" style="background:${canvas.background?.color || canvas.theme?.backgroundColor || "#fff"}">
          ${(canvas.elements || []).map((element) => renderSlideElement(element, canvas, unit.chapterId)).join("")}
        </div>
      </div>`,
      "slide-resource"
    )}
  `;
}

function renderSlideElement(element, canvas, chapterId) {
  const base = canvas.viewportSize || 1000;
  const ratio = canvas.viewportRatio || 0.5625;
  const hBase = base * ratio;
  const left = ((element.left || 0) / base) * 100;
  const top = ((element.top || 0) / hBase) * 100;
  const width = ((element.width || 1) / base) * 100;
  const height = ((element.height || 1) / hBase) * 100;
  const rotate = element.rotate || 0;
  const common = `left:${left}%;top:${top}%;width:${width}%;height:${height}%;transform:rotate(${rotate}deg);`;

  if (element.type === "text") {
    const content = element.content || "";
    const rendered = /<[a-zA-Z][^>]*>/.test(content) ? renderMathInHtml(content) : renderInlineMath(content);
    return `<div class="slide-element slide-text" style="${common}color:${element.defaultColor || "inherit"}">${rendered}</div>`;
  }

  if (element.type === "shape") {
    return `<div class="slide-element" style="${common}background:${element.fill || "#e9edf5"};border-radius:4px;"></div>`;
  }

  if (element.type === "image") {
    return `<img class="slide-element" alt="" src="${slideImageSrc(element.src, chapterId)}" style="${common};object-fit:contain;" />`;
  }

  if (element.type === "line") {
    const end = element.end || [element.width || 1, element.height || 1];
    const length = Math.max(1, Math.hypot(end[0] || 0, end[1] || 0));
    const angle = Math.atan2(end[1] || 0, end[0] || 0) * (180 / Math.PI);
    return `<div class="slide-element slide-line" style="left:${left}%;top:${top}%;width:${(length / base) * 100}%;height:${Math.max(element.width || 2, 2)}px;background:${element.color || "#94a3b8"};transform:rotate(${angle}deg);"></div>`;
  }

  if (element.type === "latex") {
    const html = element.html || escapeHtml(element.latex || "");
    return `<div class="slide-element slide-latex" style="${common}color:${element.color || "inherit"}">${html}</div>`;
  }

  if (element.type === "table") {
    return `<div class="slide-element slide-table-wrap" style="${common}">${renderSlideTable(element)}</div>`;
  }

  return "";
}

function slideImageSrc(src = "", chapterId = currentChapterId) {
  if (!src) return "";
  if (/^(data:|https?:|\/)/i.test(src)) return src;
  if (src.startsWith("gen_img_")) return resourceUrl(`resources/open-maic/${chapterId}/media/${src}.png`);
  return resourceUrl(`resources/open-maic/${chapterId}/${src}`);
}

function renderSlideTable(element) {
  const rows = element.data || [];
  const border = element.outline?.color || "#d9d9d9";
  return `
    <table class="slide-table" style="border-color:${border}">
      <tbody>
        ${rows
          .map(
            (row) => `
              <tr>
                ${(row || [])
                  .map((cell) => {
                    const style = cell.style || {};
                    const attrs = [
                      `style="background:${style.backcolor || "transparent"};text-align:${style.align || "left"};font-weight:${style.bold ? 800 : 500};"`
                    ];
                    if (cell.colspan > 1) attrs.push(`colspan="${cell.colspan}"`);
                    if (cell.rowspan > 1) attrs.push(`rowspan="${cell.rowspan}"`);
                    return `<td ${attrs.join(" ")}>${escapeHtml(cell.text || "")}</td>`;
                  })
                  .join("")}
              </tr>
            `
          )
          .join("")}
      </tbody>
    </table>
  `;
}

function compactText(value = "", limit = 80) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, limit);
}

function normalizeIframeElement(node, doc) {
  if (!node || node === doc) return doc.body || doc.documentElement;
  if (node.nodeType === 1) return node;
  return node.parentElement || doc.body || doc.documentElement;
}

function iframeClassName(element) {
  const cls = element?.className;
  if (typeof cls === "string") return cls;
  if (cls?.baseVal) return cls.baseVal;
  return "";
}

function cssEscapeIdent(value) {
  return window.CSS?.escape ? CSS.escape(value) : String(value || "").replace(/["\\]/g, "\\$&");
}

function iframeElementLabel(element, doc) {
  element = normalizeIframeElement(element, doc);
  if (!element) return "";
  if (element === doc.body || element === doc.documentElement) return doc.title || "课件页面";
  const id = element.getAttribute?.("id");
  const labelByFor = id ? doc.querySelector(`label[for="${cssEscapeIdent(id)}"]`) : null;
  const wrappingLabel = element.closest?.("label");
  return compactText(
    element.getAttribute("aria-label") ||
      element.getAttribute("title") ||
      labelByFor?.textContent ||
      wrappingLabel?.textContent ||
      (element.tagName?.toLowerCase() === "canvas" ? "画布" : "") ||
      (element.tagName?.toLowerCase() === "svg" ? "图形区域" : "") ||
      element.textContent ||
      element.value ||
      element.getAttribute("placeholder") ||
      element.getAttribute("name") ||
      id ||
      iframeClassName(element) ||
      element.tagName
  );
}

function iframeElementValue(element) {
  if (!element) return "";
  const tag = element.tagName?.toLowerCase();
  const type = (element.getAttribute("type") || "").toLowerCase();
  if (type === "checkbox" || type === "radio") return element.checked ? "选中" : "未选中";
  if (tag === "select") return compactText(element.selectedOptions?.[0]?.textContent || element.value);
  if (type === "password") return element.value ? "已输入" : "空";
  if (["range", "number", "color", "date", "time", "month", "week"].includes(type)) return compactText(element.value, 120);
  if (tag === "textarea" || element.isContentEditable || ["text", "search", "email", "url", "tel"].includes(type)) {
    const text = element.isContentEditable ? element.textContent || "" : element.value || "";
    return `已输入 ${text.length} 个字符`;
  }
  if ("value" in element) return compactText(element.value, 120);
  return "";
}

function iframeElementInfo(element, event, unit) {
  let doc = element?.ownerDocument || event?.target?.ownerDocument || null;
  element = doc ? normalizeIframeElement(element, doc) : element;
  doc = element?.ownerDocument || doc;
  const rect = element?.getBoundingClientRect?.();
  const point =
    event && typeof event.clientX === "number" && rect
      ? {
          x: Math.round(event.clientX - rect.left),
          y: Math.round(event.clientY - rect.top),
          width: Math.round(rect.width),
          height: Math.round(rect.height)
        }
      : null;
  return {
    source: "iframe",
    unitId: unit.id,
    unitLabel: unit.label,
    chapterId: unit.chapterId,
    tag: element?.tagName?.toLowerCase() || "",
    role: element?.getAttribute?.("role") || "",
    type: element?.getAttribute?.("type") || "",
    label: doc ? iframeElementLabel(element, doc) : "",
    value: iframeElementValue(element),
    id: element?.getAttribute?.("id") || "",
    name: element?.getAttribute?.("name") || "",
    className: compactText(iframeClassName(element), 80),
    point
  };
}

function iframeActionTarget(event, doc, selector) {
  const raw = normalizeIframeElement(event.target, doc);
  const closest = raw?.closest?.(selector);
  if (closest) return closest;
  if (raw && raw !== doc && raw !== doc.documentElement) return raw;
  return doc.body || doc.documentElement;
}

function setupIframeInteractionTracking(iframeEl, unit) {
  if (!iframeEl) return;
  let doc = null;
  try {
    doc = iframeEl.contentDocument || iframeEl.contentWindow?.document;
  } catch {
    return;
  }
  if (!doc) return;
  if (doc.__calculusQuestTrackingUnit === unit.id) return;
  doc.__calculusQuestTrackingUnit = unit.id;

  const interactiveSelector = [
    "button",
    "a",
    "input",
    "select",
    "textarea",
    "label",
    "canvas",
    "svg",
    "[role='button']",
    "[role='slider']",
    "[contenteditable='true']",
    "[tabindex]",
    "[data-action]",
    "[data-role]"
  ].join(",");
  const inputSelector = "input, select, textarea, [contenteditable='true']";
  const lastInputAt = new WeakMap();
  const pointerStarts = new Map();
  const rangeStarts = new WeakMap();
  let lastPointerMoveAt = 0;
  let lastWheelAt = 0;
  let lastScrollAt = 0;

  doc.addEventListener(
    "click",
    (event) => {
      const target = iframeActionTarget(event, doc, interactiveSelector);
      if (!target) return;
      trackInteraction("interactive_click", iframeElementInfo(target, event, unit));
    },
    true
  );

  doc.addEventListener(
    "dblclick",
    (event) => {
      const target = iframeActionTarget(event, doc, interactiveSelector);
      if (!target) return;
      trackInteraction("interactive_double_click", iframeElementInfo(target, event, unit));
    },
    true
  );

  doc.addEventListener(
    "contextmenu",
    (event) => {
      const target = iframeActionTarget(event, doc, interactiveSelector);
      if (!target) return;
      trackInteraction("interactive_context_menu", iframeElementInfo(target, event, unit));
    },
    true
  );

  doc.addEventListener(
    "input",
    (event) => {
      const target = event.target?.closest?.(inputSelector);
      if (!target) return;
      const now = Date.now();
      const last = lastInputAt.get(target) || 0;
      if (now - last < 700) return;
      lastInputAt.set(target, now);
      const info = iframeElementInfo(target, event, unit);
      if ((target.getAttribute("type") || "").toLowerCase() === "range") {
        const start = rangeStarts.get(target);
        if (!start) rangeStarts.set(target, { value: target.value, at: now });
        trackInteraction("parameter_change", {
          source: "iframe",
          ...info,
          param: target.getAttribute("name") || target.getAttribute("id") || info.label,
          value: {
            old: start?.value || "",
            new: target.value,
            min: target.min || "",
            max: target.max || ""
          }
        });
        return;
      }
      trackInteraction("interactive_input", info);
    },
    true
  );

  doc.addEventListener(
    "change",
    (event) => {
      const target = event.target?.closest?.(inputSelector);
      if (!target) return;
      const info = iframeElementInfo(target, event, unit);
      if ((target.getAttribute("type") || "").toLowerCase() === "range") {
        const start = rangeStarts.get(target);
        trackInteraction("parameter_commit", {
          source: "iframe",
          ...info,
          param: target.getAttribute("name") || target.getAttribute("id") || info.label,
          value: {
            old: start?.value || "",
            new: target.value,
            min: target.min || "",
            max: target.max || ""
          },
          durationMs: start?.at ? Date.now() - start.at : 0
        });
        rangeStarts.delete(target);
        return;
      }
      trackInteraction("interactive_change", info);
    },
    true
  );

  doc.addEventListener(
    "submit",
    (event) => {
      const target = event.target?.closest?.("form") || event.target;
      trackInteraction("interactive_submit", iframeElementInfo(target, event, unit));
    },
    true
  );

  doc.addEventListener(
    "keydown",
    (event) => {
      const target = iframeActionTarget(event, doc, interactiveSelector);
      if (!target) return;
      const isTextEntry = target.closest?.(inputSelector);
      const isPlainCharacter = event.key?.length === 1 && !event.altKey && !event.ctrlKey && !event.metaKey;
      if (isTextEntry && isPlainCharacter) return;
      const key = isPlainCharacter ? "character" : event.key || "";
      trackInteraction("interactive_keydown", {
        source: "iframe",
        ...iframeElementInfo(target, event, unit),
        key,
        code: event.code || "",
        modifiers: {
          alt: event.altKey,
          ctrl: event.ctrlKey,
          meta: event.metaKey,
          shift: event.shiftKey
        }
      });
    },
    true
  );

  doc.addEventListener(
    "wheel",
    (event) => {
      const now = Date.now();
      if (now - lastWheelAt < 800) return;
      lastWheelAt = now;
      const target = iframeActionTarget(event, doc, interactiveSelector);
      if (!target) return;
      trackInteraction("interactive_wheel", {
        source: "iframe",
        ...iframeElementInfo(target, event, unit),
        deltaX: Math.round(event.deltaX || 0),
        deltaY: Math.round(event.deltaY || 0),
        deltaMode: event.deltaMode || 0
      });
    },
    { capture: true, passive: true }
  );

  doc.addEventListener(
    "scroll",
    (event) => {
      const now = Date.now();
      if (now - lastScrollAt < 1200) return;
      lastScrollAt = now;
      const rawTarget = normalizeIframeElement(event.target, doc);
      const scrollNode = rawTarget === doc.body || rawTarget === doc.documentElement
        ? doc.scrollingElement || doc.documentElement
        : rawTarget;
      trackInteraction("interactive_scroll", {
        source: "iframe",
        ...iframeElementInfo(scrollNode, event, unit),
        scrollTop: Math.round(scrollNode?.scrollTop || 0),
        scrollLeft: Math.round(scrollNode?.scrollLeft || 0)
      });
    },
    { capture: true, passive: true }
  );

  doc.addEventListener(
    "pointerdown",
    (event) => {
      const target = iframeActionTarget(event, doc, interactiveSelector);
      if (!target) return;
      pointerStarts.set(event.pointerId || 0, {
        at: Date.now(),
        x: event.clientX,
        y: event.clientY,
        target
      });
      const eventName = target.matches?.("canvas, svg") ? "canvas_pointer_down" : "interactive_pointer_down";
      trackInteraction(eventName, { source: "iframe", ...iframeElementInfo(target, event, unit) });
    },
    true
  );

  doc.addEventListener(
    "pointercancel",
    (event) => {
      const start = pointerStarts.get(event.pointerId || 0);
      if (!start) return;
      pointerStarts.delete(event.pointerId || 0);
      const target = iframeActionTarget(event, doc, interactiveSelector) || start.target;
      trackInteraction("interactive_pointer_cancel", {
        source: "iframe",
        ...iframeElementInfo(target, event, unit),
        durationMs: Date.now() - start.at
      });
    },
    true
  );

  doc.addEventListener(
    "pointermove",
    (event) => {
      const now = Date.now();
      if (now - lastPointerMoveAt < 1000) return;
      lastPointerMoveAt = now;
      const start = pointerStarts.get(event.pointerId || 0);
      if (!start) return;
      const target = iframeActionTarget(event, doc, interactiveSelector) || start.target;
      const distance = Math.round(Math.hypot(event.clientX - start.x, event.clientY - start.y));
      if (distance < 8) return;
      trackInteraction("interactive_drag_move", {
        source: "iframe",
        ...iframeElementInfo(target, event, unit),
        distance,
        durationMs: now - start.at
      });
    },
    true
  );

  doc.addEventListener(
    "pointerup",
    (event) => {
      const start = pointerStarts.get(event.pointerId || 0);
      if (!start) return;
      pointerStarts.delete(event.pointerId || 0);
      const target = iframeActionTarget(event, doc, interactiveSelector) || start.target;
      const distance = Math.round(Math.hypot(event.clientX - start.x, event.clientY - start.y));
      const durationMs = Date.now() - start.at;
      const eventName = distance >= 8
        ? "interactive_drag_end"
        : target.matches?.("canvas, svg")
          ? "canvas_pointer_up"
          : "interactive_pointer_up";
      trackInteraction(eventName, {
        source: "iframe",
        ...iframeElementInfo(target, event, unit),
        distance,
        durationMs
      });
    },
    true
  );

  doc.addEventListener(
    "dragstart",
    (event) => {
      const target = iframeActionTarget(event, doc, interactiveSelector);
      trackInteraction("interactive_drag_start", { source: "iframe", ...iframeElementInfo(target, event, unit) });
    },
    true
  );

  doc.addEventListener(
    "dragend",
    (event) => {
      const target = iframeActionTarget(event, doc, interactiveSelector);
      trackInteraction("interactive_drag_end", { source: "iframe", ...iframeElementInfo(target, event, unit) });
    },
    true
  );

  trackInteraction("interactive_ready", {
    source: "iframe",
    unitId: unit.id,
    unitLabel: unit.label,
    chapterId: unit.chapterId,
    title: compactText(doc.title || unit.label)
  });
}

function interactiveFrameSrc(unit, htmlPath) {
  if (!htmlPath) return "";
  const resourceRoot = unit.scene.content?.resourceRoot;
  if (resourceRoot) return resourceUrl(`resources/${resourceRoot}/${htmlPath}`);
  return resourceUrl(`resources/open-maic/${unit.chapterId}/${htmlPath}`);
}

function renderInteractive(unit) {
  analyticsTrack("interactive_render", {
    source: "iframe",
    data: {
      unitId: unit.id,
      chapterId: unit.chapterId,
      htmlPath: unit.scene.content?.htmlPath || "",
      resourceRoot: unit.scene.content?.resourceRoot || "open-maic",
      moduleRole: moduleRoleForUnit(unit)
    }
  });
  const html = unit.scene.content?.html;
  const htmlPath = unit.scene.content?.htmlPath;
  if (!html && !htmlPath) {
    els.lessonPlayer.innerHTML = `
      ${renderCoach(unit.scene, unit.chapterId, unit.id)}
      ${renderResourceShell(unit, unit.label, `<div class="empty-state">这一项没有内置互动 HTML。</div>`, "html-resource interactive-resource")}
    `;
    return;
  }

  const frameSrc = interactiveFrameSrc(unit, htmlPath);
  const loadingHtml = '<div class="iframe-loader"><div class="iframe-loader-spinner"></div><p>互动实验加载中…</p></div>';
  els.lessonPlayer.innerHTML = `
    ${renderCoach(unit.scene, unit.chapterId, unit.id)}
    ${renderResourceShell(
      unit,
      unit.label,
      `<div class="iframe-container">${loadingHtml}<iframe class="embed-frame" title="${escapeHtml(unit.label)}" sandbox="allow-scripts allow-same-origin allow-forms allow-pointer-lock allow-popups" allow="fullscreen; autoplay" allowfullscreen></iframe></div>`,
      "html-resource interactive-resource"
    )}
  `;
  const iframeEl = els.lessonPlayer.querySelector("iframe");
  if (iframeEl) {
    let loaded = false;
    const loader = () => iframeEl.parentElement?.querySelector(".iframe-loader");
    const expectedFrameUrl = frameSrc ? new URL(frameSrc, window.location.href).href : "";
    const isDocumentReady = () => {
      try {
        const doc = iframeEl.contentDocument || iframeEl.contentWindow?.document;
        if (!doc?.body || doc.readyState !== "complete") return false;
        if (expectedFrameUrl) {
          const frameUrl = iframeEl.contentWindow?.location?.href || "";
          if (!frameUrl || frameUrl === "about:blank" || frameUrl !== expectedFrameUrl) return false;
        }
        return true;
      } catch {
        return false;
      }
    };
    const markLoaded = () => {
      if (!loaded) {
        loaded = true;
        const node = loader();
        if (node) {
          node.classList.add("hidden");
          window.setTimeout(() => node.remove(), 350);
        }
      }
      try {
        setupIframeInteractionTracking(iframeEl, unit);
      } catch (error) {
        console.warn("Interactive tracking unavailable:", error.message);
      }
    };
    iframeEl.addEventListener("load", () => {
      if (isDocumentReady()) markLoaded();
    });
    iframeEl.addEventListener("error", () => {
      const node = loader();
      if (node) { node.classList.add("hidden"); node.innerHTML = "<p>互动实验加载失败，请刷新重试。</p>"; }
    });
    if (html) iframeEl.srcdoc = html;
    else if (frameSrc) iframeEl.src = frameSrc;
    if (html) {
      requestAnimationFrame(() => {
        if (!loaded && isDocumentReady()) markLoaded();
      });
    }
    setTimeout(() => {
      if (!loaded) {
        if (isDocumentReady()) {
          markLoaded();
          return;
        }
        const node = loader();
        if (node) { node.classList.add("hidden"); node.innerHTML = "<p>互动实验加载超时，请检查网络连接后刷新。</p>"; }
      }
    }, 20000);
  }
}

function renderAgent() {
  const rows = [
    ["前测先行", "每章第一步固定为 pre-test，先暴露已有直觉和概念缺口，再进入讲解、互动和形成性测验。"],
    ["MAIC-UI 重学/拓展", "换一种方式重学和一步拓展都来自同一套 MAIC-UI 互动课件，不再按测验结果推荐外部补充课程。"],
    ["证据驱动", "Agent 读取前测、形成性测验和后测表现，只决定是否跳过、重学、拓展或继续主线。"],
    ["学生确认", "每次路径改变都由学生确认；跳过不会直接落到形成性测验，而会先进入一个互动热身。"]
  ];

  els.agentBoard.innerHTML = rows
    .map(([title, text], index) => `
      <article class="agent-card">
        <span class="type-pill">Agent ${index + 1}</span>
        <h2>${title}</h2>
        <p>${text}</p>
      </article>
    `)
    .join("") + renderAgenticBlueprint();
}

function renderAgenticBlueprint() {
  const chapterRows = curriculum
    .map((chapter) => {
      const adaptiveLabel = (order) => AGENTIC_MAIC_UI_ADAPTIVE_MAP?.[chapter.id]?.[order]?.label || AGENTIC_ADAPTIVE_SCENE_LABELS[order];
      const relearn = AGENTIC_RELEARN_SCENE_ORDERS.map((order) => `${AGENTIC_ADAPTIVE_SCENE_LABELS[order]}：${adaptiveLabel(order)}`).join(" / ");
      const extension = AGENTIC_EXTENSION_SCENE_ORDERS.map((order) => `${AGENTIC_ADAPTIVE_SCENE_LABELS[order]}：${adaptiveLabel(order)}`).join(" / ");
      return `<tr><td>${chapter.label}</td><td>${relearn}</td><td>${extension}</td></tr>`;
    })
    .join("");
  return `
    <article class="agent-card agent-wide">
      <span class="type-pill">Agentic active-learning</span>
      <h2>MAIC-UI 路径编排方案</h2>
      <p>当前只使用 ${escapeHtml(MAIC_UI_MODEL.label)} 生成的 MAIC-UI 课件作为重学和拓展资源。主线保留前测、讲解、互动、形成性测验和后测；新加课件只在学生需要时出现，作为“换一种方式重学”或“解锁一步拓展”。</p>
      <div class="model-row"><span class="type-pill">${escapeHtml(MAIC_UI_MODEL.label)} · ${escapeHtml(MAIC_UI_MODEL.role)}</span></div>
      <div class="blueprint-table-wrap">
        <table class="blueprint-table">
          <thead><tr><th>章节</th><th>换一种方式重学</th><th>一步拓展</th></tr></thead>
          <tbody>${chapterRows}</tbody>
        </table>
      </div>
    </article>
  `;
}

function renderLessonSceneButton(unit) {
  const isSkipped = typeof agenticIsSkipped === "function" && agenticIsSkipped(unit.id);
  const isUnlocked = typeof agenticIsUnitUnlocked !== "function" || agenticIsUnitUnlocked(unit.id);
  const isLocked = !isUnlocked && !isSkipped;
  const isDone = state.completed.includes(unit.id);
  const cls = ["lesson-scene-chip", unit.id === currentUnitId ? "active" : "", isLocked ? "locked" : "", isSkipped ? "skipped" : "", unit.flowKind === "adaptive" ? "adaptive" : ""].filter(Boolean).join(" ");
  const statusText = isLocked ? "\u5f85\u89e3\u9501" : isSkipped ? "\u53ef\u56de\u770b" : isDone ? "\u5df2\u5b8c\u6210" : unit.flowKind === "adaptive" ? "\u53ef\u9009" : "\u53ef\u5b66";
  return '<button class="' + cls + '" type="button" data-unit="' + unit.id + '"' + (isLocked ? ' aria-disabled="true"' : '') + '>'
    + '<span>' + unitIcon(unit) + '</span>'
    + '<strong>' + escapeHtml(unit.label) + '</strong>'
    + '<small>' + escapeHtml(learningSceneRole(unit)) + ' · ' + statusText + '</small>'
    + '</button>';
}

function renderLessons() {
  const chapter = getChapter();
  els.chapterTitle.textContent = chapter.label;
  if (!chapter.loaded) {
    els.lessonList.innerHTML = '<div class="empty-state">\u70b9\u51fb\u5de6\u4fa7\u7ae0\u8282\u5361\u7247\u52a0\u8f7d\u672c\u7ae0\u5b66\u4e60\u6a21\u5757\u3002</div>';
    return;
  }

  const displayUnits = typeof agenticDisplayUnitsForChapter === "function" ? agenticDisplayUnitsForChapter(chapter) : chapter.units;
  if (!displayUnits.length) {
    els.lessonList.innerHTML = '<div class="empty-state">完成当前小节后，Agentic Coach 会把你选择的下一步显示在这里。</div>';
    return;
  }
  els.lessonList.innerHTML = displayUnits.map((unit, index) => {
    const isSkipped = typeof agenticIsSkipped === "function" && agenticIsSkipped(unit.id);
    const isUnlocked = typeof agenticIsUnitUnlocked !== "function" || agenticIsUnitUnlocked(unit.id);
    const isLocked = !isUnlocked && !isSkipped;
    const isDone = state.completed.includes(unit.id);
    const isRecommended = isUnlocked && !isSkipped && !isDone;
    const cls = ["lesson-card", unit.id === currentUnitId ? "active" : "", isLocked ? "locked" : "", isSkipped ? "skipped" : "", isRecommended ? "recommended" : "", unit.flowKind === "adaptive" ? "adaptive" : ""].filter(Boolean).join(" ");
    const statusText = isLocked ? "\u5f85\u89e3\u9501" : isSkipped ? "\u53ef\u56de\u770b" : isDone ? "\u5df2\u5b8c\u6210" : unit.flowKind === "adaptive" ? "\u65b0\u52a0\u8bfe\u4ef6" : "\u4e0b\u4e00\u6b65";
    const flowText = unit.flowKind === "adaptive" ? ' · ' + escapeHtml(unit.flowLabel || "\u65b0\u52a0\u8bfe\u4ef6") : "";
    return '<button class="' + cls + '" type="button" data-unit="' + unit.id + '"' + (isLocked ? ' aria-disabled="true"' : '') + '>'
      + '<span class="lesson-card-icon">' + unitIcon(unit) + '</span>'
      + '<span class="lesson-card-body"><strong>' + (index + 1) + '. ' + escapeHtml(unit.label) + '</strong>'
      + '<small>' + typeText(unit) + flowText + ' · ' + statusText + '</small></span>'
      + '</button>';
  }).join('');
}

function renderChapters() {
  els.chapterList.innerHTML = curriculum
    .map((chapter, index) => {
      const isUnlocked = typeof agenticIsChapterUnlocked !== "function" || agenticIsChapterUnlocked(chapter.id);
      const displayUnits = typeof agenticDisplayUnitsForChapter === "function"
        ? agenticDisplayUnitsForChapter(chapter)
        : chapter.units;
      const done = chapter.units.filter((unit) => state.completed.includes(unit.id)).length;
      const total = chapter.loaded ? chapter.units.length : AGENTIC_CORE_SCENE_ORDERS.length;
      const adaptiveShown = displayUnits.filter((unit) => unit.flowKind === "adaptive").length;
      const guide = chapterGuides[chapter.id];
      const cls = [
        "chapter-card",
        chapter.id === currentChapterId ? "active" : "",
        isUnlocked ? "" : "locked"
      ].filter(Boolean).join(" ");
      const status = isUnlocked ? `${done}/${total} 模块` : "未解锁";
      return `
        <button class="${cls}" type="button" data-chapter="${chapter.id}" ${isUnlocked ? "" : 'aria-disabled="true"'}>
          <span class="chapter-card-top">
            <strong>第 ${index + 1} 章 ${escapeHtml(chapter.label)}</strong>
            <span>${isUnlocked ? (guide?.difficulty || "可学习") : "锁定"}</span>
          </span>
          <small>${status}${adaptiveShown ? ` · ${adaptiveShown} 个新加课件` : ""} · ${escapeHtml(chapter.summary)}</small>
          ${guide && isUnlocked ? `<small class="chapter-bridge">${escapeHtml(guide.bridge)} · ${guide.pace}</small>` : ""}
        </button>
      `;
    })
    .join("");
}

function syncAgenticPlayerCta(unit) {
  if (!els.completeLesson || !unit) return;
  if (unit.type === "quiz" && !(state.submittedQuizzes || []).includes(unit.id)) {
    els.completeLesson.textContent = "提交测验后解锁下一步";
  } else if (typeof agenticIsCurrentPending === "function" && agenticIsCurrentPending(unit.id)) {
    els.completeLesson.textContent = "先选择下一步";
  } else if (state.agenticPath?.activeDetour?.unitId === unit.id && state.agenticPath.activeDetour.phase === "post") {
    els.completeLesson.textContent = state.completed.includes(unit.id) ? "复习完成后选择下一步" : "完成重学后选择下一步";
  } else if (state.agenticPath?.oneStepExtension?.unitId === unit.id && typeof agenticIsCrossChapterResume === "function" && agenticIsCrossChapterResume(state.agenticPath.oneStepExtension.fromUnitId, state.agenticPath.oneStepExtension.resumeUnitId)) {
    els.completeLesson.textContent = state.completed.includes(unit.id) ? "复习拓展并进入下一章" : "完成拓展并进入下一章";
  }
}
