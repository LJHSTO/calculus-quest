(function initProactiveSurface(global) {
  "use strict";
  const labels = { inline: "课件旁", sidebar: "助教栏", tip: "提示", example: "例子", interactive: "动手试", chat: "对话" };
  const examples = {
    "GH-01-K01": { title: "输入如何对应输出", rule: "y = 2x + 1", question: "改变输入后，输出如何变化？同一个输入能否同时对应两个不同输出？", value: x => 2 * x + 1 },
    "GH-01-K02": { title: "把坐标放回函数规则", rule: "y = x + 3", question: "点的第一个数是输入。试着写出一个满足规则的有序对。", value: x => x + 3 },
    "GH-01-K03": { title: "负数也可以上升", rule: "y = x − 6", question: "按输入增大的顺序比较输出；把输出的正负与变化方向分开。", value: x => x - 6 },
    "GH-02-K01": { title: "观察靠近的趋势", rule: "x ≠ 2 时 y = x + 1", question: "从两侧把输入移向 2；有限次观察能帮助猜测，不能替代极限的证明。", value: x => x === 2 ? "该点未定义" : x + 1 },
    "GH-02-K02": { title: "分别观察左右两侧", rule: "x < 0 时 y = x − 1；x > 0 时 y = x + 1", question: "分别记录从左侧与右侧靠近 0 时的输出，再由你比较它们。", value: x => x === 0 ? "该点未定义" : x < 0 ? x - 1 : x + 1 },
    "GH-02-K03": { title: "附近的趋势与点上的值", rule: "x ≠ 1 时 y = x + 2；x = 1 时 y = 5", question: "分开检查函数值、两侧的共同趋势，以及二者是否相等。", value: x => x === 1 ? 5 : x + 2 }
  };
  let shell = null, toolbar = null, snapshot = null, renderKey = "", busy = false;
  const visibleIds = new Set();
  const widgetValues = new Map();
  const drafts = new Map();
  let ownerKey = "";
  const node = (tag, className, text) => {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text !== undefined) el.textContent = text;
    return el;
  };
  function record(kind, data) { global.KnowledgeAssistant?.trackSupportSurface(kind, data); }
  const visibility = new IntersectionObserver(entries => entries.forEach(entry => {
    if (!entry.isIntersecting || document.hidden || !snapshot?.offer) return;
    const id = `${snapshot.offer.decisionId}:${snapshot.view.placement}:${snapshot.view.modality}`;
    if (visibleIds.has(id)) return;
    visibleIds.add(id);
    record("visible", { fraction: entry.intersectionRatio });
    global.KnowledgeAssistant.supportAction("shown");
  }), { threshold: 0.3 });

  function makeToolbar(parent) {
    toolbar = node("details", "support-display-settings");
    const summary = node("summary", "", "帮助怎么显示");
    toolbar.append(summary);
    const body = node("div", "support-display-options");
    [["placement", ["sidebar", "inline"], "位置"], ["modality", ["tip", "example", "interactive", "chat"], "形式"]].forEach(([key, options, label]) => {
      const group = node("fieldset"); group.append(node("legend", "", label));
      options.forEach(value => {
        const button = node("button", "", labels[value]);
        button.type = "button"; button.dataset.supportSetting = key; button.dataset.supportValue = value;
        button.addEventListener("click", () => {
          global.KnowledgeAssistant.setSupportView({ ...snapshot.view, [key]: value });
          record("opened", { reason: "learner_selected_surface" });
        });
        group.append(button);
      });
      body.append(group);
    });
    body.append(node("p", "", "只调整帮助的显示方式；是否接受由你决定。"));
    toolbar.append(body); parent.append(toolbar);
  }
  function mountHost(next) {
    const tabs = document.querySelector(".workspace-canvas-tabs");
    if (!tabs) return null;
    if (!toolbar?.isConnected) makeToolbar(tabs);
    let host;
    if (next.view.placement === "inline") {
      const pane = document.querySelector('.multi-scene-slide-panel:not([hidden])')
        || document.querySelector('.multi-scene-scene-panel:not([hidden])');
      if (pane) {
        host = pane.querySelector("[data-proactive-inline-host]");
        if (!host) {host = node("div", "proactive-inline-host"); host.dataset.proactiveInlineHost = ""; pane.append(host);}
      }
    } else {
      host = document.querySelector(".workspace-chat-pane");
    }
    return host;
  }
  function practiceExample(interactive) {
    const data = examples[snapshot.scopeKey];
    if (!data) return null;
    const section = node("section", "support-practice");
    section.append(node("h4", "", data.title), node("p", "support-rule", data.rule));
    if (interactive) {
      const label = node("label", "", "移动输入 x，观察输出");
      const input = node("input"); input.type = "range"; input.min = "-3"; input.max = "3"; input.step = "0.1";
      input.value = String(widgetValues.get(snapshot.scopeKey) ?? -2);
      input.setAttribute("aria-label", "练习输入 x");
      const output = node("output", "support-widget-output");
      const update = () => {
        const x = Number(input.value), value = data.value(x);
        output.textContent = `输入 x = ${x.toFixed(1)}　输出 y = ${typeof value === "number" ? Number(value.toFixed(2)) : value}`;
        widgetValues.set(snapshot.scopeKey, x);
      };
      input.addEventListener("input", update);
      input.addEventListener("change", () => record("interacted", { interaction: "practice_parameter", value: Number(input.value), countsAsAssessment: false }));
      label.append(input); section.append(label, output); update();
    } else {
      const grid = node("div", "support-example-grid");
      [-2, 0, 2].forEach(x => {
        const item = node("div"); item.append(node("span", "", `输入 ${x}`), node("strong", "", "输出由你计算")); grid.append(item);
      });
      section.append(grid);
    }
    section.append(node("p", "", data.question), node("small", "", "你主动打开的补充练习，不计入独立检查成绩。"));
    return section;
  }
  function conversationForm() {
    const form = node("form", "support-chat-form");
    const label = node("label", "", "把你的想法告诉知点");
    const input = node("textarea"); input.rows = 2; input.maxLength = 2000; input.placeholder = "写下你的理解或问题"; input.required = true;
    label.append(input);
    const button = node("button", "is-primary", "发送"); button.type = "submit";
    const status = node("p", "support-form-status"); status.setAttribute("role", "status");
    form.append(label, button, status);
    form.addEventListener("submit", async event => {
      event.preventDefault(); if (busy || !input.value.trim()) return;
      busy = true; button.disabled = true; status.textContent = "知点正在整理思路…";
      record("interacted", { interaction: "chat_send" });
      try {await global.KnowledgeAssistant.supportAction("ask", input.value); input.value = "";}
      catch {status.textContent = "消息未发送，请稍后重试。";}
      finally {busy = false; button.disabled = false; renderKey = ""; sync(global.KnowledgeAssistant.designSpaceSnapshot());}
    });
    return form;
  }
  function sync(next) {
    if (next.ownerKey !== ownerKey) {
      ownerKey = next.ownerKey; drafts.clear(); widgetValues.clear(); visibleIds.clear();
      renderKey = ""; busy = false; shell?.replaceChildren();
    }
    snapshot = next;
    const eligible = next.signedIn && next.active && next.unitType === "knowledge" && !next.locked;
    if (!eligible) {if(shell) shell.hidden = true; if(toolbar) toolbar.hidden = true; return;}
    const host = mountHost(next);
    if (!host) return;
    toolbar.hidden = false;
    toolbar.querySelectorAll("[data-support-setting]").forEach(button => button.setAttribute("aria-pressed", String(next.view[button.dataset.supportSetting] === button.dataset.supportValue)));
    const owns = next.view.placement === "inline" || next.view.modality !== "tip";
    if (!owns) {if(shell) shell.hidden = true; return;}
    if (!shell) {
      shell = node("section", "learning-support-surface");
      shell.setAttribute("aria-label", "知点学习帮助");
      shell.addEventListener("click", event => {if(event.target.closest("button")) record("interacted", { interaction: "support_control" });});
      visibility.observe(shell);
    }
    const moved = shell.parentNode !== host;
    if (moved) host.prepend(shell);
    shell.hidden = false; shell.dataset.placement = next.view.placement; shell.dataset.modality = next.view.modality;
    const key = JSON.stringify([next.scopeKey, next.view, next.offer, next.check, next.checkSelection, next.prompt, next.feedback, next.busy, next.muted, next.policyState?.lifecycle]);
    if (key === renderKey && !moved) return;
    if (busy) return;
    renderKey = key;
    // Preserve a learner's unsent text across server updates and modality moves.
    const previousDraft = shell.querySelector(".support-chat-form textarea");
    if (previousDraft) drafts.set(shell.dataset.scopeKey || next.scopeKey, previousDraft.value);
    const draft = drafts.get(next.scopeKey) || "";
    shell.dataset.scopeKey = next.scopeKey;
    const focusOnSelection = shell.contains(document.activeElement) && document.activeElement?.getAttribute("role") === "radio";
    shell.replaceChildren();
    const header = node("header", "support-surface-header");
    header.append(node("strong", "", "知点 · 学习帮助"), node("span", "", labels[next.view.modality]));
    const close = node("button", "support-surface-collapse", "收起"); close.type = "button";
    close.addEventListener("click", () => {record("dismissed", { reason: "surface_collapsed" }); global.KnowledgeAssistant.setSupportView({ placement: "sidebar", modality: "tip" });});
    header.append(close); shell.append(header);
    if (next.muted) {
      const notice = node("div", "support-quiet-state", "本知识点的主动提醒已关闭。你仍可主动提问。");
      const restore = node("button", "", "恢复本知识点提醒"); restore.type = "button"; restore.disabled = next.busy;
      restore.addEventListener("click", () => global.KnowledgeAssistant.supportAction("restore")); notice.append(restore); shell.append(notice);
    }
    const content = node("div", "support-surface-content");
    content.append(global.KnowledgeAssistant.createSupportContent()); shell.append(content);
    if (!next.offer && !next.prompt && !next.check && !next.feedback && next.view.modality === "tip") {
      shell.append(node("p", "support-quiet-state", "你可以继续独立探索。出现值得关注的学习证据时，知点才会提出建议。"));
    }
    // Supplements are explicitly learner-requested, never claimed to be the
    // same D3 manipulation as the policy-issued, unchanged support above.
    if (!next.check && ["example", "interactive"].includes(next.view.modality)) {
      const practice = practiceExample(next.view.modality === "interactive"); if(practice) shell.append(practice);
    }
    if (next.view.modality === "chat" && !next.check) {
      const form = conversationForm(); form.querySelector("textarea").value = draft; shell.append(form);
    }
    if (next.check) shell.append(node("p", "support-independent-note", "先独立完成这道检查，也可以跳过。检查期间收起补充练习。"));
    record("rendered", { content: next.check ? "independent_check" : next.offer ? "policy_offer" : "learner_opened", supportLevel: next.offer?.supportLevel || next.policyState?.currentLevel || "L0" });
    if (focusOnSelection) shell.querySelector('[role="radio"][aria-checked="true"]')?.focus({ preventScroll: true });
    // Re-observe when an offer changes while the same surface stays in view.
    visibility.unobserve(shell); visibility.observe(shell);
  }
  global.ProactiveSurface = Object.freeze({ sync });
  global.addEventListener("cq:learning-layout-change", () => {
    if(global.KnowledgeAssistant) {renderKey=""; sync(global.KnowledgeAssistant.designSpaceSnapshot());}
  });
})(window);
