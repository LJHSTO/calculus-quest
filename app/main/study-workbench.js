(function () {
  "use strict";
  const stage = document.querySelector("#stage"), error = document.querySelector("#error"), withdraw = document.querySelector("#withdraw");
  let token = sessionStorage.getItem("study-workbench-token") || "", state = null, queue = Promise.resolve(), timer = null, observer = null;
  const exposed = new Set();
  let embeddedChannel = "", embeddedFrame = null, embeddedTarget = "courseware", embeddedVisibility = null, embeddedTimer = null;
  const node = (tag, text, cls) => { const el = document.createElement(tag); if (text) el.textContent = text; if (cls) el.className = cls; return el; };
  function button(text, action, cls) { const el = node("button", text, cls); el.type = "button"; el.onclick = action; return el; }
  async function api(path, body) {
    const response = await fetch(`api/${path}`, { method: body ? "POST" : "GET", headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { "Content-Type": "application/json" } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const data = await response.json(); if (!response.ok) throw new Error(data.message || "操作未完成，请刷新重试。"); return data;
  }
  function showError(e) { error.hidden = false; error.textContent = e.message; }
  async function refresh() { state = (await api("learning/study-workbench")).data; render(); }
  function action(name, payload = {}, silent = false) {
    queue = queue.then(async () => {
      if (silent && !["explore", "support"].includes(state?.session?.stage)) return;
      error.hidden = true;
      const next = (await api("learning/study-workbench/action", { action: name, fingerprint: state.protocol.fingerprint, revision: state.session.revision, ...payload })).data;
      state = next;
      if (!silent) render();
      return true;
    }).catch(async e => { showError(e); if (!silent) { try { await refresh(); } catch {} } return false; });
    return queue;
  }
  function addActions(parent, entries) { const row = node("div", "", "actions"); for (const [text, actionName, cls] of entries) row.append(button(text, () => action(actionName), cls)); parent.append(row); }
  function embeddedMessage(type, extra = {}) {
    embeddedFrame?.contentWindow?.postMessage({ type, channel: embeddedChannel, ...extra }, "*");
  }
  function clearEmbedded() {
    embeddedMessage("cq:embedded-clear"); clearTimeout(embeddedTimer); embeddedTimer = null;
    embeddedFrame = null; embeddedVisibility = null; embeddedChannel = "";
  }
  function sendEmbedded() {
    if (embeddedTarget !== "courseware" || !state?.session?.help || !embeddedFrame?.isConnected) return;
    const s = state.session;
    embeddedMessage("cq:embedded-show", { scope: s.knowledgePointId, text: s.help.text, allowAccept: s.stage === "support" });
  }
  function checkEmbeddedVisibility() {
    const v = embeddedVisibility, key = `${state?.protocol?.fingerprint}:${state?.session?.index}`;
    let visible = false;
    if (v && embeddedTarget === "courseware" && state?.session?.stage === "support" && embeddedFrame?.isConnected && !document.hidden && v.fraction >= .5) {
      const f = embeddedFrame.getBoundingClientRect(), r = v.rect;
      // Intersect the child card with both the iframe and the parent viewport.
      const sx = embeddedFrame.clientWidth / v.viewport.width, sy = embeddedFrame.clientHeight / v.viewport.height;
      const x = f.left + embeddedFrame.clientLeft + r.x * sx, y = f.top + embeddedFrame.clientTop + r.y * sy;
      const width = r.width * sx, height = r.height * sy;
      const area = Math.max(0, Math.min(x + width, f.right, innerWidth) - Math.max(x, f.left, 0)) * Math.max(0, Math.min(y + height, f.bottom, innerHeight) - Math.max(y, f.top, 0));
      visible = width > 0 && height > 0 && area / (width * height) >= .5;
    }
    if (!visible || exposed.has(key)) { clearTimeout(embeddedTimer); embeddedTimer = null; return; }
    if (!embeddedTimer) embeddedTimer = setTimeout(() => { embeddedTimer = null; if (!document.hidden && embeddedTarget === "courseware" && state?.session?.stage === "support") { exposed.add(key); action("exposure", { fraction: .5, visibleDurationMs: 1000 }, true); } }, 1000);
  }
  function chooseEmbeddedTarget(target, locate = false) {
    if (!state?.session?.help || !embeddedFrame?.isConnected) return;
    embeddedTarget = target; embeddedVisibility = null; clearTimeout(embeddedTimer); embeddedTimer = null;
    observer?.disconnect(); clearTimeout(timer); document.onvisibilitychange = null;
    const slot = stage.querySelector(".practice-hint"); if (slot) slot.replaceChildren();
    stage.querySelectorAll("[data-embedded-target]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.embeddedTarget === target)));
    if (target === "practice" && slot) {
      embeddedMessage("cq:embedded-clear");
      const card = node("aside", "", "task-hint"); card.setAttribute("aria-label", "这道练习的线索");
      card.append(node("strong", "知点 · 这一步的线索"), node("p", state.session.help.text)); slot.append(card);
      observeHelp(card);
      if (locate) { stage.querySelector(".guided-practice").scrollIntoView({ block: "start" }); stage.querySelector("#practice-response").focus({ preventScroll: true }); }
    } else { sendEmbedded(); if (locate) embeddedMessage("cq:embedded-locate"); }
    action("courseware_event", { event: { type: "courseware_support_anchor", data: { parameter: "help_location", value: target }, clientAt: new Date().toISOString() } }, true);
  }
  function guidedPractice(s, parent) {
    const section = node("section", "", "guided-practice"); section.setAttribute("aria-label", "有帮助的练习作答");
    const label = node("label", s.practice.prompt); label.htmlFor = "practice-response";
    const input = node("textarea"); input.id = "practice-response"; input.rows = 4; input.maxLength = 1200; input.value = s.practice.response;
    input.placeholder = "写下你的判断过程，可以修改，也可以暂时留空。";
    input.addEventListener("focus", () => { if (embeddedTarget !== "practice") chooseEmbeddedTarget("practice"); });
    input.addEventListener("change", () => action("practice_draft", { response: input.value }, true));
    section.append(node("h3", "写下你的想法"), label, node("div", "", "practice-hint"), input,
      node("p", "这是可以使用线索的练习，不计入独立测验成绩。", "small"));
    const controls = node("div", "", "actions");
    controls.append(button("保存想法并独立试一题", async () => { if (await action("practice_draft", { response: input.value }, true)) action("accept"); }, "primary"),
      button("跳过这段练习", () => action("skip")), button("关闭帮助", () => action("close")));
    section.append(controls); parent.append(section);
  }
  function observeHelp(el) {
    const key = `${state.protocol.fingerprint}:${state.session.index}`;
    if (exposed.has(key)) return;
    let qualifying = false;
    const stopTimer = () => { clearTimeout(timer); timer = null; };
    observer = new IntersectionObserver(entries => {
      qualifying = entries[0].intersectionRatio >= .5;
      stopTimer();
      if (qualifying && !document.hidden) timer = setTimeout(() => {
        if (document.hidden || state.session.stage !== "support" || exposed.has(key)) return;
        exposed.add(key); action("exposure", { fraction: .5, visibleDurationMs: 1000 }, true);
      }, 1000);
    }, { threshold: [.5] });
    observer.observe(el);
    // A foreground return starts a fresh uninterrupted visibility interval.
    document.onvisibilitychange = () => { stopTimer(); if (!document.hidden && qualifying) { observer.unobserve(el); observer.observe(el); } };
  }
  function render() {
    clearTimeout(timer); observer?.disconnect(); document.onvisibilitychange = null;
    clearEmbedded(); embeddedTarget = "courseware";
    const s = state?.session; if (!s) return;
    stage.replaceChildren(); withdraw.hidden = !s.controls.canWithdraw;
    stage.append(node("p", s.stage === "complete" ? "流程已完成" : `学习单元 ${s.index + 1} / ${s.total}`, "progress"));
    const heading = node("h2", s.title); heading.tabIndex = -1; stage.append(heading);
    if (["complete", "withdrawn"].includes(s.stage)) {
      stage.append(node("p", s.stage === "withdrawn" ? "本次流程已退出，后续帮助已停止。已记录的工程数据保留供核对。" : s.completion));
      stage.append(node("a", "返回学习平台")); stage.lastChild.href = "./"; return;
    }
    if (s.probe) {
      stage.append(node("p", "请独立作答；当前不显示帮助或即时得分。可以选择我不会，也可以跳过。", "small"));
      stage.append(node("p", s.probe.prompt, "question"));
      const options = node("fieldset", "", "options"); options.setAttribute("aria-label", "选择答案");
      for (const o of [...s.probe.options, { value: "unknown", label: "我不会" }, { value: "skip", label: "跳过这道题" }]) {
        const label = node("label"), radio = node("input"); radio.type = "radio"; radio.name = "probe"; radio.value = o.value; label.append(radio, node("span", o.label)); options.append(label);
      }
      stage.append(options, button("提交并继续", () => {
        const response = options.querySelector("input:checked")?.value;
        if (!response) { showError(new Error("请选择一个选项。")); return; }
        action("answer", { probeId: s.probe.id, response });
      }, "primary"));
    } else if (["explore", "support"].includes(s.stage)) {
      stage.append(node("p", "请观察课件中的输入、输出和变化，完成你的尝试后继续。"));
      const inTask = s.help?.placement === "in_task";
      const workspace = node("div", "", `workspace${s.help ? "" : " no-help"}${state.protocol.kind === "embedded" ? " embedded-workspace" : ""}`), course = node("div", "", "course");
      if (s.resource) { const frame = node("iframe"); frame.title = `${s.title}互动课件`; frame.src = s.resource; frame.setAttribute("sandbox", "allow-scripts"); course.append(frame); if (inTask) { embeddedFrame = frame; embeddedChannel = crypto.randomUUID(); frame.addEventListener("load", sendEmbedded); } }
      workspace.append(course);
      if (inTask) {
        const location = node("div", "", "embedded-location"); location.setAttribute("aria-label", "选择当前学习任务");
        for (const [target, title] of [["courseware", "在课件步骤里看线索"], ...(s.practice ? [["practice", "在练习作答处看线索"]] : [])]) {
          const b = button(title, () => chooseEmbeddedTarget(target, true)); b.dataset.embeddedTarget = target; b.setAttribute("aria-pressed", String(target === "courseware")); location.append(b);
        }
        stage.append(location, workspace); if (s.practice) guidedPractice(s, stage);
        stage.append(node("p", "线索跟随当前任务显示；进入独立题目时会自动收起。", "small"));
      } else if (s.help) {
        const card = node("aside", "", `help${s.help.placement === "inline" ? " help-inline" : ""}`);
        card.append(node("h3", "一个思考线索"), node("p", s.help.text));
        if (s.stage === "support") { addActions(card, [["接受并独立试一题", "accept", "primary"], ["稍后", "later"], ["跳过", "skip"], ["关闭帮助", "close"]]); }
        else addActions(card, [["关闭帮助", "dismiss_manual_help"]]);
        workspace.append(card); stage.append(workspace); if (s.stage === "support") observeHelp(card);
      } else stage.append(workspace);
      if (s.stage === "explore") addActions(stage, [["完成尝试，继续", "continue", "primary"], ["我需要帮助", "request_help"]]);
    } else if (s.stage === "survey") {
      stage.append(node("p", "以下问题用于检查问卷流程，可以跳过。1表示完全不同意，7表示完全同意。", "small"));
      const form = node("div");
      for (const [key, label] of [["interruption", "刚才系统主动提供的帮助打断了我的解题思路。"], ["control", "我能够决定是否接受和停止系统的帮助。"], ["effort", "理解刚才的学习内容需要我付出较多脑力。"]]) {
        const field = node("fieldset", "", "survey-item"); field.append(node("legend", label)); const ratings = node("div", "", "ratings");
        for (const value of [1, 2, 3, 4, 5, 6, 7, "skip"]) {
          const option = node("label"), input = node("input"); input.type = "radio"; input.name = key; input.value = value;
          option.append(input, node("span", value === "skip" ? "跳过" : String(value))); ratings.append(option);
        }
        field.append(ratings); form.append(field);
      }
      stage.append(form, button("保存并进入下一单元", () => {
        const answers = {}; for (const key of ["interruption", "control", "effort"]) { const value = form.querySelector(`input[name="${key}"]:checked`)?.value; if (!value) { showError(new Error("请为每题选择评分或跳过。")); return; } answers[key] = value === "skip" ? null : Number(value); }
        action("survey", { answers });
      }, "primary"));
    }
    heading.focus({ preventScroll: true }); window.scrollTo(0, 0);
  }
  withdraw.onclick = () => action("withdraw");
  window.addEventListener("message", event => {
    const frame = stage.querySelector("iframe");
    if (!frame || event.source !== frame.contentWindow) return;
    const message = event.data;
    if (message?.type === "cq:embedded-ready") { sendEmbedded(); return; }
    if (message?.channel && message.channel === embeddedChannel && frame === embeddedFrame) {
      if (message.type === "cq:embedded-action" && embeddedTarget === "courseware") {
        if (message.action === "practice" && state.session.practice) chooseEmbeddedTarget("practice", true);
        else if (message.action === "close" && state.session.stage === "support") action("close");
        else if (message.action === "dismiss_manual_help" && state.session.stage === "explore") action("dismiss_manual_help");
      } else if (message.type === "cq:embedded-visibility") {
        const r = message.rect, v = message.viewport;
        if (r && v && [r.x,r.y,r.width,r.height,v.width,v.height,message.fraction].every(Number.isFinite) && v.width > 0 && v.height > 0) { embeddedVisibility = message; checkEmbeddedVisibility(); }
      } else if (message.type === "cq:embedded-unavailable") {
        showError(new Error("当前课件未找到对应步骤。可在练习作答处查看线索。"));
        if (state.session.practice) chooseEmbeddedTarget("practice");
      } else if (message.type === "cq:embedded-mounted") {
        action("courseware_event", { event: { type: "courseware_support_mounted", data: { parameter: String(message.location || "").slice(0, 80), value: String(message.anchor || "").slice(0, 100) }, clientAt: new Date().toISOString() } }, true);
      }
      return;
    }
    if (message?.type !== "maic_learning_event") return;
    const p = event.data.payload || {};
    const type = /^(courseware_|parameter_|maic_)/.test(p.event_type || "") ? p.event_type : `courseware_${p.event_type || "unknown"}`;
    action("courseware_event", { event: { type, data: p, clientAt: p.timestamp } }, true);
  });
  window.addEventListener("scroll", checkEmbeddedVisibility, true); window.addEventListener("resize", checkEmbeddedVisibility); document.addEventListener("visibilitychange", checkEmbeddedVisibility);
  document.querySelector("#start").onclick = async () => {
    try {
      if (!document.querySelector("#ack").checked) throw new Error("请先确认工程预演说明。");
      const account = await api("auth/register", { nickname: `研究预演${Date.now()}`, password: crypto.randomUUID() });
      token = account.token; sessionStorage.setItem("study-workbench-token", token);
      state = (await api("learning/study-workbench/start", { acknowledged: true })).data; render();
    } catch (e) { showError(e); }
  };
  if (token) refresh().catch(e => { sessionStorage.removeItem("study-workbench-token"); token = ""; showError(e); });
})();
