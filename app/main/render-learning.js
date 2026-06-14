// Learning shell, player, lesson, and resource rendering.
function renderMetrics() {
  const totals = courseIndex?.totals;
  const loadedChapters = curriculum.filter((chapter) => chapter.loaded);
  const sceneCount = totals?.scenes || loadedChapters.reduce((sum, chapter) => sum + chapter.manifest.scenes.length, 0);
  const supplementCount = supplementUnits.length;
  const htmlCount =
    supplementCount +
    (totals?.interactive ||
      loadedChapters.reduce((sum, chapter) => sum + chapter.manifest.scenes.filter((scene) => scene.type === "interactive").length, 0));
  const audioCount = totals?.audio || loadedChapters.reduce((sum, chapter) => sum + countAudio(chapter.manifest), 0);
  els.metricChapters.textContent = curriculum.length;
  els.metricScenes.textContent = sceneCount;
  els.metricGlm.textContent = supplementCount;
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
      const total = chapter.loaded ? chapter.units.length : chapterStats(chapter.id)?.scenes || "待载入";
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
    els.lessonList.innerHTML = `<div class="empty-state">点击左侧章节卡片来加载本章的学习模块，包括 slides、互动实验和测验。</div>`;
    return;
  }
  els.lessonList.innerHTML = chapter.units
    .map((unit, index) => `
      <button class="lesson-card ${unit.id === currentUnitId ? "active" : ""}" type="button" data-unit="${unit.id}">
        <strong>${index + 1}. ${escapeHtml(unit.label)}</strong>
        <small>${typeText(unit)} · ${state.completed.includes(unit.id) ? "已完成" : "未完成"}</small>
      </button>
    `)
    .join("");
}

function typeText(unit) {
  if (unit.kind === "supplement") return "推荐补给";
  if (unit.type === "quiz") return phaseText(unit.assessmentPhase) || "测验";
  return {
    slide: "讲解",
    interactive: "互动实验"
  }[unit.type] || "学习模块";
}

function unitLearningFocus(unit) {
  if (unit.kind === "supplement") {
    return {
      action: "把刚才卡住的点换一种说法再学一遍。",
      check: unit.analysis.bestFor,
      help: `先看标题和例子，再回到主线关卡完成标记。`
    };
  }

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
    els.completeLesson.textContent = state.completed.includes(unit.id) ? "复习并跳到下一节 →" : "完成本节并跳到下一节 →";
  }
  updateFullscreenButton();
  renderRecommendationPanel();

  if (unit.kind === "supplement") {
    renderSupplement(unit);
  } else if (unit.scene.type === "quiz") {
    renderQuiz(unit);
  } else if (unit.scene.type === "slide") {
    renderSlide(unit);
  } else {
    renderInteractive(unit);
  }
  renderBottomNextButton();
  syncNarrationUi();
}

function renderCoach(scene, chapterId, unitId) {
  const actions = (scene.actions || []).filter((action) => action.text || action.prompt).slice(0, 5);
  if (!actions.length) return "";
  const audioActions = actions.filter((action) => action.audioRef);

  return `
    <div class="coach-strip">
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
      ${actions
        .map((action) => `
          <div class="coach-line" ${action.audioRef ? `data-audio-src="${resourceUrl(`resources/open-maic/${chapterId}/${action.audioRef}`)}"` : ""}>
            <strong>${action.type === "discussion" ? "讨论引导" : "教师旁白"}</strong>
            <div>${renderInlineMath(action.text || action.prompt || "")}</div>
          </div>
        `)
        .join("")}
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
    const correctCount = unitResults.filter(r => r.isCorrect === true).length;
    const total = questions.length;
    if (isPre) {
      quizTopBanner = `
        <div class="quiz-encouragement-banner" id="quiz-top-banner-${unit.id}">
          前测提交成功！你在 ${total} 题中答对了 <strong>${correctCount}</strong> 题。没答对的也不要紧——这正是接下来要学的内容。学完本章后会再做一次后测，对比看看自己进步了多少。
        </div>
        <p class="quiz-scroll-hint">向下滑动查看每道题的答案解析和参考要点。</p>`;
    } else if (unit.assessmentPhase === "post") {
      quizTopBanner = `
        <div class="quiz-encouragement-banner post" id="quiz-top-banner-${unit.id}">
          后测提交成功！你在 ${total} 题中答对了 <strong>${correctCount}</strong> 题。和前测对比一下，看看这一章你攻克了多少一开始不会的题目。
        </div>
        <p class="quiz-scroll-hint">向下滑动查看每道题的答案解析和参考要点。</p>`;
    } else {
      quizTopBanner = `
        <div class="quiz-encouragement-banner formative" id="quiz-top-banner-${unit.id}">
          形成性测验提交成功！你在 ${total} 题中答对了 <strong>${correctCount}</strong> 题。卡住的地方正好说明接下来要重点理解的内容——Agent 会根据你的答题情况推荐补给资源。
        </div>
        <p class="quiz-scroll-hint">向下滑动查看每道题的答案解析和参考要点。</p>`;
    }
  }

  // Build a lookup of latest result per question for persisted review
  const latestByQuestion = {};
  if (submitted) {
    const unitResults = (state.quizResults || []).filter(r => r.unitId === unit.id);
    for (const r of unitResults) { if (!latestByQuestion[r.questionId]) latestByQuestion[r.questionId] = r; }
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
              const review = result ? renderQuestionReview({ question, result, index }) : "";
              return `
              <article class="question-card" data-question="${question.id}">
                <h3>${index + 1}. ${renderInlineMath(question.question)}</h3>
                ${renderQuestionInput(unit, question, submitted)}
                ${review}
              </article>
            `;
            })
            .join("")}
          <div class="quiz-submit-panel${submitted ? ' submitted' : ''}">
            <button class="button primary" type="button" data-submit-quiz="${unit.id}" ${submitted ? "disabled" : ""}>${submitted ? '已提交' : '提交本次测验'}</button>
            <p>${submitted ? '该测验已提交，答案和解析见下方。如需重做请点击右上角重置。' : '提交后会记录本次测验结果，并统一显示答案、解析和短答参考要点。'}</p>
            <div class="answer-feedback" id="feedback-${unit.id}"></div>
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

function renderQuestionInput(unit, question, submitted) {
  if (question.type === "short_answer") {
    const inputId = `answer-${unit.id}-${question.id}`;
    const draft = readQuizDraft(unit.id, question.id, "");
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
      ${question.commentPrompt ? `<div class="rubric-box"><strong>评分提示</strong><p>${renderInlineMath(question.commentPrompt)}</p></div>` : ""}
    `;
  }

  return `
    <fieldset>
      ${(question.options || [])
        .map((option) => {
          const draft = readQuizDraft(unit.id, question.id, question.type === "multiple" ? [] : "");
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

function iframeElementLabel(element, doc) {
  if (!element) return "";
  const id = element.getAttribute("id");
  const labelByFor = id ? doc.querySelector(`label[for="${CSS.escape(id)}"]`) : null;
  const wrappingLabel = element.closest?.("label");
  return compactText(
    element.getAttribute("aria-label") ||
      element.getAttribute("title") ||
      labelByFor?.textContent ||
      wrappingLabel?.textContent ||
      element.textContent ||
      element.value ||
      element.getAttribute("placeholder") ||
      element.getAttribute("name") ||
      id ||
      element.className ||
      element.tagName
  );
}

function iframeElementValue(element) {
  if (!element) return "";
  const tag = element.tagName?.toLowerCase();
  const type = (element.getAttribute("type") || "").toLowerCase();
  if (type === "checkbox" || type === "radio") return element.checked ? "选中" : "未选中";
  if (tag === "select") return compactText(element.selectedOptions?.[0]?.textContent || element.value);
  if ("value" in element) return compactText(element.value, 120);
  return "";
}

function iframeElementInfo(element, event, unit) {
  const doc = element?.ownerDocument || null;
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
    className: compactText(element?.className || "", 80),
    point
  };
}

function setupIframeInteractionTracking(iframeEl, unit) {
  if (!iframeEl || iframeEl.dataset.trackingAttached === "true") return;
  iframeEl.dataset.trackingAttached = "true";
  let doc = null;
  try {
    doc = iframeEl.contentDocument || iframeEl.contentWindow?.document;
  } catch {
    return;
  }
  if (!doc) return;

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
    "[data-action]",
    "[data-role]"
  ].join(",");
  const lastInputAt = new WeakMap();
  const pointerStarts = new Map();
  const rangeStarts = new WeakMap();
  let lastPointerMoveAt = 0;

  doc.addEventListener(
    "click",
    (event) => {
      const target = event.target?.closest?.(interactiveSelector) || event.target;
      if (!target || target === doc || target === doc.documentElement || target === doc.body) return;
      trackInteraction("interactive_click", iframeElementInfo(target, event, unit));
    },
    true
  );

  doc.addEventListener(
    "input",
    (event) => {
      const target = event.target?.closest?.("input, select, textarea");
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
      const target = event.target?.closest?.("input, select, textarea");
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
    "pointerdown",
    (event) => {
      const target = event.target?.closest?.(interactiveSelector) || event.target;
      if (!target || target === doc || target === doc.documentElement || target === doc.body) return;
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
    "pointermove",
    (event) => {
      const now = Date.now();
      if (now - lastPointerMoveAt < 1000) return;
      lastPointerMoveAt = now;
      const start = pointerStarts.get(event.pointerId || 0);
      if (!start) return;
      const target = event.target?.closest?.(interactiveSelector) || start.target;
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
      const target = event.target?.closest?.(interactiveSelector) || start.target;
      const distance = Math.round(Math.hypot(event.clientX - start.x, event.clientY - start.y));
      const durationMs = Date.now() - start.at;
      const eventName = distance >= 8 ? "interactive_drag_end" : "interactive_pointer_up";
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
      const target = event.target?.closest?.(interactiveSelector) || event.target;
      trackInteraction("interactive_drag_start", { source: "iframe", ...iframeElementInfo(target, event, unit) });
    },
    true
  );

  doc.addEventListener(
    "dragend",
    (event) => {
      const target = event.target?.closest?.(interactiveSelector) || event.target;
      trackInteraction("interactive_drag_end", { source: "iframe", ...iframeElementInfo(target, event, unit) });
    },
    true
  );

  trackInteraction("interactive_ready", {
    unitId: unit.id,
    unitLabel: unit.label,
    chapterId: unit.chapterId,
    title: compactText(doc.title || unit.label)
  });
}

function renderInteractive(unit) {
  analyticsTrack("interactive_render", {
    source: "iframe",
    data: {
      unitId: unit.id,
      chapterId: unit.chapterId,
      htmlPath: unit.scene.content?.htmlPath || "",
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

  const frameSrc = htmlPath ? `src="${resourceUrl(`resources/open-maic/${unit.chapterId}/${htmlPath}`)}"` : "";
  const loadingHtml = '<div class="iframe-loader"><div class="iframe-loader-spinner"></div><p>互动实验加载中…</p></div>';
  els.lessonPlayer.innerHTML = `
    ${renderCoach(unit.scene, unit.chapterId, unit.id)}
    ${renderResourceShell(
      unit,
      unit.label,
      `<div class="iframe-container">${loadingHtml}<iframe class="embed-frame" title="${escapeHtml(unit.label)}" ${frameSrc} sandbox="allow-scripts allow-same-origin allow-forms allow-pointer-lock allow-popups" allow="fullscreen; autoplay" allowfullscreen></iframe></div>`,
      "html-resource interactive-resource"
    )}
  `;
  const iframeEl = els.lessonPlayer.querySelector("iframe");
  if (iframeEl) {
    if (html) iframeEl.srcdoc = html;
    let loaded = false;
    iframeEl.addEventListener("load", () => {
      loaded = true;
      const loader = iframeEl.parentElement?.querySelector(".iframe-loader");
      if (loader) loader.classList.add("hidden");
      setupIframeInteractionTracking(iframeEl, unit);
    });
    iframeEl.addEventListener("error", () => {
      const loader = iframeEl.parentElement?.querySelector(".iframe-loader");
      if (loader) { loader.classList.add("hidden"); loader.innerHTML = "<p>互动实验加载失败，请刷新重试。</p>"; }
    });
    setTimeout(() => {
      if (!loaded) {
        const loader = iframeEl.parentElement?.querySelector(".iframe-loader");
        if (loader) { loader.classList.add("hidden"); loader.innerHTML = "<p>互动实验加载超时，请检查网络连接后刷新。</p>"; }
      }
    }, 20000);
  }
}

function renderSupplement(unit) {
  analyticsTrack("supplement_render", {
    data: {
      unitId: unit.id,
      chapterId: unit.chapterId,
      modelId: unit.modelId,
      file: unit.file
    }
  });
  const model = supplementModels.find((item) => item.id === unit.modelId);
  els.lessonPlayer.innerHTML = `
        <div class="coach-strip">
      <div class="coach-line">
        <strong>Agent 推荐补给</strong>
        <div>${escapeHtml(unit.analysis.bestFor)} ${escapeHtml(model?.useCase || "")}</div>
      </div>
    </div>
    ${renderResourceShell(
      unit,
      unit.label,
      `<iframe class="embed-frame" title="${escapeHtml(unit.label)}" src="${resourceUrl(`resources/${unit.modelId}/${unit.file}`)}" allow="fullscreen; autoplay" allowfullscreen></iframe>`,
      "html-resource supplement-resource"
    )}
  `;
}

function renderAgent() {
  const rows = [
    ["前测先行", "每章第一步固定为 pre-test，先暴露已有直觉和概念缺口，再进入讲解、互动和形成性测验。"],
    ["隐藏补给池", "四个模型生成的补充课件默认不进入闯关列表，只作为 Agent 可调用资源池。"],
    ["证据匹配", "Agent 读取前测和形成性测验的错题、短答完整度与题干关键词，映射到函数、斜率、向量、梯度、凸性等知识点。"],
    ["模型择优", "前测弱基础优先推荐直觉类比和快速纠偏；形成性测验卡住时推荐迁移挑战和结构化复盘。"]
  ];

  els.agentBoard.innerHTML = rows
    .map(([title, text], index) => `
      <article class="agent-card">
        <span class="type-pill">Agent ${index + 1}</span>
        <h2>${title}</h2>
        <p>${text}</p>
      </article>
    `)
    .join("") + renderRecommendationBlueprint();
}

function renderRecommendationBlueprint() {
  const modelRows = supplementModels
    .map((model) => `<span class="type-pill">${model.label} · ${model.role}</span>`)
    .join("");
  const chapterRows = curriculum
    .map((chapter) => {
      const topics = Object.values(supplementAnalysis)
        .filter((item) => item.chapterId === chapter.id)
        .map((item) => item.title.replace(/^.*?：/, ""))
        .join(" / ");
      return `<tr><td>${chapter.label}</td><td>${topics}</td></tr>`;
    })
    .join("");
  return `
    <article class="agent-card agent-wide">
      <span class="type-pill">Recommendation design</span>
      <h2>推荐生成方案</h2>
      <p>把 26 个知识主题映射到 8 个微积分章节，每个主题保留 4 个模型版本，共 ${supplementUnits.length} 个隐藏补给。读取前测与形成性测验：客观题错误、短答待复核或估算得分偏低都会触发知识点匹配。按阶段选择模型：前测偏基础时推荐直觉类比和快速纠偏，形成性测验卡住时推荐迁移挑战和结构化复盘。</p>
      <div class="model-row">${modelRows}</div>
      <div class="blueprint-table-wrap">
        <table class="blueprint-table">
          <thead><tr><th>章节</th><th>关联补给主题</th></tr></thead>
          <tbody>${chapterRows}</tbody>
        </table>
      </div>
    </article>
  `;
}
