(function initProactiveSurface(global) {
  "use strict";
  const labels = { inline: "任务内", sidebar: "助教栏", tip: "提示", example: "例子", interactive: "动手试", chat: "对话" };
  const examples = {
    "GH-01-K01": { title: "输入如何对应输出", rule: "y = 2x + 1", question: "改变输入后，输出如何变化？同一个输入能否同时对应两个不同输出？", value: x => 2 * x + 1 },
    "GH-01-K02": { title: "把坐标放回函数规则", rule: "y = x + 3", question: "点的第一个数是输入。试着写出一个满足规则的有序对。", value: x => x + 3 },
    "GH-01-K03": { title: "负数也可以上升", rule: "y = x − 6", question: "按输入增大的顺序比较输出；把输出的正负与变化方向分开。", value: x => x - 6 },
    "GH-02-K01": { title: "观察靠近的趋势", rule: "x ≠ 2 时 y = x + 1", question: "从两侧把输入移向 2；有限次观察能帮助猜测，不能替代极限的证明。", value: x => x === 2 ? "该点未定义" : x + 1 },
    "GH-02-K02": { title: "分别观察左右两侧", rule: "x < 0 时 y = x − 1；x > 0 时 y = x + 1", question: "分别记录从左侧与右侧靠近 0 时的输出，再由你比较它们。", value: x => x === 0 ? "该点未定义" : x < 0 ? x - 1 : x + 1 },
    "GH-02-K03": { title: "附近的趋势与点上的值", rule: "x ≠ 1 时 y = x + 2；x = 1 时 y = 5", question: "分开检查函数值、两侧的共同趋势，以及二者是否相等。", value: x => x === 1 ? 5 : x + 2 }
  };
  let shell = null, toolbar = null, snapshot = null, renderKey = "", busy = false;
  const widgetValues = new Map();
  const drafts = new Map();
  let ownerKey = "";
  let observedOffer = null;
  const node = (tag, className, text) => {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text !== undefined) el.textContent = text;
    return el;
  };
  function record(kind, data) { global.KnowledgeAssistant?.trackSupportSurface(kind, data); }
  function stopExposure() {
    if (observedOffer) global.KnowledgeAssistant?.unobserveSupportOffer(observedOffer);
    observedOffer = null;
  }
  function observeOffer(next) {
    const target = next.offer && shell?.querySelector(".knowledge-proactive-inline-offer");
    if (observedOffer && observedOffer !== target) stopExposure();
    if (target) {
      observedOffer = target;
      global.KnowledgeAssistant?.observeSupportOffer(target, next.offer);
    } else stopExposure();
  }

  function makeToolbar(parent) {
    toolbar = node("details", "support-display-settings");
    const summary = node("summary", "", "帮助怎么显示");
    toolbar.append(summary);
    toolbar.addEventListener("keydown", event => {
      if (event.key !== "Escape" || !toolbar.open) return;
      event.preventDefault();
      event.stopPropagation();
      toolbar.open = false;
      summary.focus({ preventScroll: true });
    });
    const body = node("div", "support-display-options");
    [["placement", ["sidebar", "inline"], "位置"], ["modality", ["tip", "example", "interactive", "chat"], "形式"]].forEach(([key, options, label]) => {
      const group = node("fieldset"); group.append(node("legend", "", label));
      options.forEach(value => {
        const button = node("button", "", labels[value]);
        button.type = "button"; button.dataset.supportSetting = key; button.dataset.supportValue = value;
        button.addEventListener("click", () => {
          if (global.KnowledgeAssistant.setSupportView({ ...snapshot.view, [key]: value })) {
            record("opened", { reason: "learner_selected_surface" });
          }
        });
        group.append(button);
      });
      body.append(group);
    });
    body.append(node("p", "support-display-note"));
    const memory=node("section","support-memory-controls");memory.dataset.agentControls="";
    body.append(memory);
    memory.addEventListener("click",async event=>{
      const button=event.target.closest("[data-agent-action]");if(!button)return;
      button.disabled=true;
      const action=button.dataset.agentAction;
      const command=action==="grant"?{action,scope:snapshot.scopeKey,capability:button.dataset.capability,confirmed:true,hours:168}
        :{action,id:button.dataset.id};
      try{await global.KnowledgeAssistant.agentRuntimeRequest(command);}
      catch(error){button.disabled=false;memory.querySelector("[role=status]").textContent=error.message;}
    });
    toolbar.append(body); parent.append(toolbar);
  }
  function syncToolbarSettings(next) {
    const fixed = Boolean(next.researchControls?.enabled && next.researchControls.revision > 0);
    const engineering = Boolean(next.researchControls?.enabled);
    // The demonstration console owns D4 settings and D5/D6 permissions.
    // Keep the learner toolbar only when that console is not enabled.
    if (engineering) { toolbar.hidden = true; toolbar.open = false; return; }
    toolbar.querySelector("summary").textContent = "帮助怎么显示";
    toolbar.querySelectorAll("fieldset").forEach(group => { group.hidden = engineering; });
    toolbar.querySelectorAll("[data-support-setting]").forEach(button => {
      button.disabled = fixed || engineering;
      button.setAttribute("aria-pressed", String(next.view[button.dataset.supportSetting] === button.dataset.supportValue));
    });
    toolbar.querySelector(".support-display-note").textContent = engineering
      ? `当前：${labels[next.view.placement]} · ${labels[next.view.modality]}。请在六维观察台的 D4 中统一设置；这里显示同一项设置的结果。是否接受帮助仍由你决定。`
      : fixed
      ? "当前提示位置由六维控制台固定；可在控制台调整后续提示的位置。是否接受帮助仍由你决定。"
      : "提示保留原有支架；例子和动手试会增加补充练习。是否接受帮助由你决定。";
    const memory=toolbar.querySelector("[data-agent-controls]");
    if(memory) {
      const data=next.agentRuntime;
      const key=JSON.stringify([next.scopeKey,data,next.locked,next.check?.id]);
      if(memory.dataset.key!==key) {
        memory.dataset.key=key;memory.replaceChildren();
        memory.hidden=!data || next.locked || Boolean(next.check);
        if(!memory.hidden) {
          memory.append(node("h4","","学习记忆与提醒"));
          const records=data.memory.filter(r=>r.scope===next.scopeKey);
          memory.append(node("p","",`已保存本知识点 ${records.length} 次独立检查记录。记录跨登录保留，不代表已经掌握。`));
          for(const [capability,title] of [["open_hint","允许自动展开本知识点线索（7天）"],["prepare_review","允许准备本知识点复习提醒（7天）"]]) {
            const permission=data.permissions.find(p=>p.scope===next.scopeKey&&p.capability===capability);
            const button=node("button","",permission?(capability==="open_hint"?"撤回自动展开授权":"撤回复习提醒授权"):title);
            button.type="button";button.dataset.agentAction=permission?"revoke":"grant";
            button.dataset.capability=capability;button.dataset.id=permission?.id||"";memory.append(button);
          }
          for(const task of data.tasks.filter(t=>t.kind==="review"&&t.scope===next.scopeKey&&t.status==="ready")) {
            memory.append(node("p","",task.payload.message));
            const dismiss=node("button","","关闭这条提醒");dismiss.type="button";dismiss.dataset.agentAction="dismiss";dismiss.dataset.id=task.id;memory.append(dismiss);
          }
          memory.append(node("small","","授权仅作用于当前知识点，可随时撤回；不会自动答题或提交。提醒在登录平台时查看。"),
            node("p","", ""));
          memory.lastChild.setAttribute("role","status");
        }
      }
    }
  }
  function mountHost(next) {
    const tabs = document.querySelector(".workspace-canvas-toolbar");
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
      [-2, 0, 2].forEach((x, index) => {
        const item = node("div");
        item.append(node("span", "", `${index === 0 ? "一起看" : "你来试"} · 输入 ${x}`),
          node("strong", "", index === 0 ? `代入规则，输出为 ${data.value(x)}` : "输出由你计算"));
        grid.append(item);
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
    next={...next,check:next.check||(next.supportCycle?.status==="awaiting_check"?{id:next.supportCycle.check.id}:null)};
    global.SupportCycleUI?.sync(next);
    const tabsForHelp=document.querySelector('.workspace-canvas-toolbar');
    let helpButton=document.getElementById('support-need-launcher');
    if(tabsForHelp&&!helpButton){helpButton=node('button','support-need-launcher','主动求助');helpButton.id='support-need-launcher';helpButton.type='button';helpButton.title='你也可以随时提出需要；助手的主动询问不依赖这个按钮。';helpButton.setAttribute('aria-description',helpButton.title);helpButton.onclick=()=>global.SupportCycleUI?.openManual();tabsForHelp.append(helpButton);}
    if(helpButton)helpButton.hidden=!(next.signedIn&&next.active&&next.unitType==='knowledge'&&!next.locked&&!next.check&&next.taskReady!==false);
    if (next.ownerKey !== ownerKey) {
      stopExposure();
      ownerKey = next.ownerKey; drafts.clear(); widgetValues.clear();
      renderKey = ""; busy = false; shell?.replaceChildren();
    }
    snapshot = next;
    if (global.TaskSupport?.sync(next)) {
      stopExposure(); if(shell)shell.hidden=true;
      const tabs=document.querySelector(".workspace-canvas-toolbar");
      if(tabs&&!toolbar?.isConnected)makeToolbar(tabs);
      if(toolbar){toolbar.hidden=Boolean(next.locked || next.check);syncToolbarSettings(next);}
      return;
    }
    const eligible = next.signedIn && next.active && next.unitType === "knowledge" && !next.locked && next.taskReady !== false;
    if (!eligible) {stopExposure(); if(shell) shell.hidden = true; if(toolbar) toolbar.hidden = true; return;}
    const host = mountHost(next);
    if (!host) {stopExposure(); if(shell) shell.hidden = true; return;}
    toolbar.hidden = false;
    syncToolbarSettings(next);
    if(!next.offer&&!next.prompt&&!next.check&&!next.feedback&&!global.SupportCycleUI?.active(next.supportCycle)&&!global.SupportCycleUI?.manualOpen(next)&&!global.PilotStudyUI?.active(next)&&next.view.modality==='tip'){if(shell)shell.hidden=true;return;}
    const owns = next.researchControls?.enabled || next.view.placement === "inline" || next.view.modality !== "tip"
      || (next.view.format||"plain")!=="plain" || ["A1","A4"].includes(next.offer?.authority?.level);
    if (!owns) {stopExposure(); if(shell) shell.hidden = true; return;}
    if (!shell) {
      shell = node("section", "learning-support-surface");
      shell.setAttribute("aria-label", "知点学习帮助");
      shell.addEventListener("click", event => {if(event.target.closest("button")) record("interacted", { interaction: "support_control" });});
    }
    const moved = shell.parentNode !== host;
    if (moved) host.prepend(shell);
    shell.hidden = false; shell.dataset.placement = next.view.placement; shell.dataset.modality = next.view.modality;
    const key = JSON.stringify([next.scopeKey, next.view, next.offer, next.check, next.checkSelection, next.prompt, next.feedback, next.busy, next.muted, next.policyState?.lifecycle,next.supportCycle,next.supportBusy,next.pilotRevision,global.SupportCycleUI?.deferInquiry(next.supportCycle),global.SupportCycleUI?.manualOpen(next)]);
    if (key === renderKey && !moved) {observeOffer(next); return;}
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
    close.title = "收起补充展示，当前帮助保留在助教栏；不会替你拒绝帮助";
    close.addEventListener("click", () => {record("dismissed", { reason: "surface_collapsed" }); global.KnowledgeAssistant.setSupportView({ placement: "sidebar", modality: "tip" });});
    header.append(close); shell.append(header);
    if (next.muted) {
      const notice = node("div", "support-quiet-state", "本知识点的主动提醒已关闭。你仍可主动提问。");
      const restore = node("button", "", "恢复本知识点提醒"); restore.type = "button"; restore.disabled = next.busy;
      restore.addEventListener("click", () => global.KnowledgeAssistant.supportAction("restore")); notice.append(restore); shell.append(notice);
    }
    const content = node("div", "support-surface-content");
    content.append(global.KnowledgeAssistant.createSupportContent()); shell.append(content);
    if (!next.offer && !next.prompt && !next.check && !next.feedback && !global.SupportCycleUI?.active(next.supportCycle) && next.view.modality === "tip") {
      shell.append(node("p", "support-quiet-state", "你可以继续独立探索。出现值得关注的学习证据时，知点才会提出建议。"));
    }
    // Supplements are explicitly learner-requested, never claimed to be the
    // same D3 manipulation as the policy-issued, unchanged support above.
    if (!next.check && !global.PilotStudyUI?.active(next) && ["example", "interactive"].includes(next.view.modality)) {
      const practice = practiceExample(next.view.modality === "interactive"); if(practice) shell.append(practice);
    }
    if (next.view.modality === "chat" && !next.check && !global.PilotStudyUI?.active(next)) {
      const form = conversationForm(); form.querySelector("textarea").value = draft; shell.append(form);
    }
    if (next.check) shell.append(node("p", "support-independent-note", "先独立完成这道检查，也可以跳过。检查期间收起补充练习。"));
    record("rendered", { content: next.check ? "independent_check" : next.offer ? "policy_offer" : "learner_opened", supportLevel: next.offer?.supportLevel || next.policyState?.currentLevel || "L0" });
    if (focusOnSelection) shell.querySelector('[role="radio"][aria-checked="true"]')?.focus({ preventScroll: true });
    // Use the same candidate-level 50% / 1 s exposure definition as the native
    // sidebar. Merely rendering or changing modality does not count as shown.
    observeOffer(next);
  }
  global.ProactiveSurface = Object.freeze({ sync });
  global.addEventListener("cq:learning-layout-change", () => {
    if(global.KnowledgeAssistant) {renderKey=""; sync(global.KnowledgeAssistant.designSpaceSnapshot());}
  });
})(window);
