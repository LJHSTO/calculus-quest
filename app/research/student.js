(function () {
  "use strict";
  const base = location.pathname.split("/studies/")[0], study = location.pathname.split("/studies/")[1]?.split("/")[0] || "index";
  const mode = new URLSearchParams(location.search).get("mode") === "formal" ? "formal" : "demo";
  const stage = document.querySelector("#stage"), error = document.querySelector("#error"), status = document.querySelector("#status");
  let token = sessionStorage.getItem("calculus-quest-auth-token-v1") || "", state = null, queue = Promise.resolve(), busy = false;
  let lastInput = Date.now(), dragging = false, frame = null, resourceIndex = -1, channel = "", exposureObserver = null, exposureTimer = null;
  let feedbackId = "", helpSignature = "", draftTimer = null, embeddedGeometry = null;
  let processSending = false;
  const processKey = () => state?.session ? `research-process-v1:${study}:${mode}:${state.session.id}` : null;
  const processQueues = new Map();
  function pendingProcess(key) {
    if (!processQueues.has(key)) {
      try { processQueues.set(key, JSON.parse(sessionStorage.getItem(key) || "[]")); }
      catch { processQueues.set(key, []); }
    }
    return processQueues.get(key);
  }
  function persistProcess(key) {
    try { const items=pendingProcess(key);if(items.length)sessionStorage.setItem(key,JSON.stringify(items));else sessionStorage.removeItem(key); }
    catch { status.textContent="浏览器存储不足，尚未送达的操作暂存于本页。请保持页面打开并恢复网络。"; }
  }
  async function flushProcess() {
    const key=processKey();if(!key||processSending||!token)return;
    if(state.session.phase==="withdrawn"){processQueues.delete(key);sessionStorage.removeItem(key);return;}
    const items=pendingProcess(key);if(!items.length)return;processSending=true;
    try {
      while(items.length&&key===processKey()){
        try{await api(endpoint("process"),items[0]);items.shift();persistProcess(key);}
        catch(e){status.textContent=`有${items.length}条操作记录等待重试，请保持页面打开。`;return;}
      }
    } finally { processSending=false; }
  }
  const exposed = new Set(), node = (tag, text, cls) => { const e = document.createElement(tag); if (text != null) e.textContent = String(text); if (cls) e.className = cls; return e; };
  const button = (label, fn, cls) => { const b = node("button", label, cls); b.type = "button"; b.onclick = () => Promise.resolve().then(fn).catch(showError); return b; };
  const row = (...children) => { const e = node("div", null, "actions"); e.append(...children); return e; };
  const note = text => node("p", text, "small");
  const escapeError = e => e?.message || "暂时未能完成操作。请检查网络后重试，已保存的记录会保留。";
  function showError(e) { error.hidden = false; error.textContent = escapeError(e); error.scrollIntoView({ block: "nearest" }); }
  async function api(path, body) {
    const response = await fetch(`${base}/api/${path}`, { method: body === undefined ? "GET" : "POST", headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body !== undefined ? { "Content-Type": "application/json" } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const data = await response.json(); if (!response.ok) throw Object.assign(new Error(data.message || "请求未完成。"), { code: data.code, status: response.status }); return data.data || data;
  }
  const endpoint = operation => `research-sites/${study}/${operation}?mode=${mode}`;
  async function refresh() { state = await api(endpoint("state")); render(); }
  function serialized(fn) { queue = queue.then(async () => { busy = true; try { error.hidden = true; return await fn(); } finally { busy = false; updateLearning(); } }).catch(async e => { showError(e); if (e.status === 401) login(); if (e.code === "research_revision_conflict") { try { await refresh(); } catch {} } return false; }); return queue; }
  function action(name, payload = {}, silent = false) {
    return serialized(async () => {
      const prior = state.session.phase;
      state = await api(endpoint("action"), { requestId: crypto.randomUUID(), action: name, fingerprint: state.protocol.fingerprint, revision: state.session.revision, ...payload });
      if (silent && prior === state.session.phase) updateLearning(); else render();
      status.textContent = "已保存"; return true;
    });
  }
  async function process(type, payload = {}) {
    if (!state?.session || state.session.phase === "withdrawn") return;
    const key=processKey(),items=pendingProcess(key);
    if(items.length>=500){showError(new Error("网络中断期间的操作记录已达到暂存上限，请先恢复网络，暂停学习。"));return;}
    items.push({ eventId: crypto.randomUUID(), sessionId:state.session.id, clientPhase:state.session.phase, type, scope: state.session.scope, clientAt: Date.now(), payload });persistProcess(key);await flushProcess();
  }
  function clearView() {
    clearTimeout(draftTimer); clearTimeout(exposureTimer); exposureObserver?.disconnect(); exposureObserver = null;
    frame?.contentWindow?.postMessage({ type: "cq:task-clear", channel }, "*"); frame = null; embeddedGeometry = null;
    helpSignature = ""; feedbackId = ""; stage.replaceChildren(); stage.setAttribute("aria-busy", "false");
  }
  function login() {
    clearView(); const panel = node("section", null, "panel narrow"); panel.append(node("h1", "继续你的学习"), node("p", "使用原平台账号即可进入。不同研究入口共用账号，各自保存流程记录。"));
    const form = node("form", null, "fields"), name = node("input"), password = node("input"); name.autocomplete = "username"; name.required = true; password.type = "password"; password.autocomplete = "current-password"; password.required = true;
    for (const [text, input] of [["账号或邮箱", name], ["密码", password]]) { const label = node("label", text); label.append(input); form.append(label); }
    const submit = node("button", "登录并继续", "primary"); submit.type = "submit"; form.append(submit);
    form.onsubmit = async e => { e.preventDefault(); submit.disabled = true; try { const data = await api("auth/login", { identifier: name.value.trim(), password: password.value }); token = data.token; sessionStorage.setItem("calculus-quest-auth-token-v1", token); password.value = ""; await refresh(); } catch (e) { showError(e); } finally { submit.disabled = false; } };
    const link = node("a", "首次使用：前往原平台注册"); link.href = `${base}/`; panel.append(form, node("p")); panel.lastChild.append(link); stage.append(panel);
  }
  function check(label) { const wrapper = node("label", null, "check"), input = node("input"); input.type = "checkbox"; wrapper.append(input, node("span", label)); return { wrapper, input }; }
  function consentView() {
    const p = state.protocol, panel = node("section", null, "panel narrow"); panel.append(node("h1", p.title));
    panel.append(node("p", mode === "demo" ? "流程体验 · 不计入正式研究" : "研究说明与知情同意", "notice"));
    for (const text of [p.consent.purpose, p.consent.courseEligibility, p.consent.procedure, p.consent.assignment, p.consent.voluntary, p.consent.risks, p.consent.optional]) if (text) panel.append(node("p", text));
    if (p.consent.collected) panel.append(node("p", "记录内容：" + p.consent.collected.join("、") + "。"));
    if (mode === "formal") for (const [key, label] of [["institution", "研究机构"], ["responsiblePerson", "负责人"], ["contact", "联系方法"], ["expectedDuration","预计时长与场次"], ["compensationPolicy","补偿安排"], ["aiProcessingInfo","外部AI服务与文字处理"], ["retentionPolicy", "数据保留"], ["withdrawalPolicy", "退出与数据处理"], ["approvalReference", "审批或豁免记录"]]) panel.append(node("p", `${label}：${p.consent[key]}`));
    if (mode === "demo") panel.append(note(study === "design-space" ? "可以体验案例编码、策略设计与反思流程；体验记录不作为正式研究者的意见。" : "可以体验全部流程；演示的等待时间已缩短。正式研究按真实24小时回访、72小时保持测量执行。"));
    const ack = check("我已阅读说明，愿意开始这次流程。"), external = check("我愿意将主动提问的文字发送给外部AI模型，以获得学习回复（可不选）。"), benchmark = check("我同意将脱敏后的学习记录用于后续模型决策评测（可不选）。"), adult = check("我已满18岁，符合本研究的招募条件。" );
    panel.append(ack.wrapper); if(study !== "design-space")panel.append(external.wrapper);panel.append(benchmark.wrapper); if (mode === "formal") panel.append(adult.wrapper);
    const start = button("开始", () => serialized(async () => {
      if (!ack.input.checked || mode === "formal" && !adult.input.checked) throw new Error("请先阅读并确认参与说明。可选项目可以不选。");
      state = await api(endpoint("start"), { requestId: crypto.randomUUID(), display:{width:innerWidth,height:innerHeight,pixelRatio:devicePixelRatio}, consent: { acknowledged: true, version: p.consentVersion, adult: adult.input.checked, eligible: adult.input.checked, externalModel: external.input.checked, futureBenchmark: benchmark.input.checked } }); render();
    }), "primary");
    if (!p.readiness.ready || mode === "formal" && p.readiness.status !== "recruiting") { start.disabled = true; panel.append(node("p", "该方向尚未开放正式参与。可先体验流程；正式信息和材料审核完成后再开放。", "notice")); }
    const other = node("a", mode === "demo" ? "查看正式参与说明" : "进入流程体验"); other.href = `?mode=${mode === "demo" ? "formal" : "demo"}`;
    panel.append(row(start, other)); stage.append(panel);
  }
  function heading(text) {
    const h = node("h1", text); h.tabIndex = -1; stage.append(h);
    stage.append(note(`${mode === "demo" ? "流程体验" : "正式参与"} · 记录随账号保存`));
    const s = state.session, path = node("ol", null, "path");
    for (let i = 0; i < 6; i++) path.append(node("li", `知识点 ${i + 1}`, i < s.index ? "done" : i === s.index ? "current" : ""));
    if (study !== "design-space" && !["baseline", "pre"].includes(s.phase)) stage.append(path);
  }
  function surveyForm(questionnaire, values = {}) {
    const form = node("div"), fields = {};
    for (const q of questionnaire.items) {
      const label = node("label", q.label, "survey-row"); let input;
      if (q.type === "text") { input = node("textarea"); input.rows = 3; input.maxLength = q.maxLength; input.value = values[q.id] || ""; }
      else {
        input = node("select"); input.append(new Option("请选择，也可以跳过", ""));
        if (q.type === "choice") q.choices.forEach(c => input.append(new Option(c, c)));
        else for (let n = q.min; n <= q.max; n += q.max === 100 ? 10 : 1) input.append(new Option(String(n) + (n === q.min ? q.max === 100 ? " · 完全没把握" : " · 完全不同意／很不合适" : n === q.max ? q.max === 100 ? " · 完全有把握" : " · 完全同意／很合适" : ""), String(n)));
        input.append(new Option("跳过", "skip")); input.value = values[q.id] == null ? "" : String(values[q.id]);
      }
      input.dataset.itemId = q.id; fields[q.id] = { q, input }; label.append(input); form.append(label);
    }
    return { form, read(requireAll = true) { const result = {}; for (const [id, { q, input }] of Object.entries(fields)) {
      if (!input.value && q.type !== "text" && requireAll) { input.focus(); throw new Error("请为每项选择一个回答或明确跳过。"); }
      result[id] = !input.value || input.value === "skip" ? null : q.type === "rating" ? Number(input.value) : input.value;
    } return result; } };
  }
  function assessment(probe = false) {
    const s = state.session, quiz = probe ? { label: "独立检查", items: [{ ...s.probe, type: "single" }] } : s.quiz;
    heading(quiz.label || "独立测量"); stage.append(node("p", "独立作答中，课件与学习帮助已关闭。不会可以选“我不会”，不愿作答可以选“跳过”；两者分别记录。", "notice"));
    if (quiz.scoring) stage.append(note(quiz.scoring));
    const form = node("form", null, "quiz"), getters = {}, draft = s.draft || {};
    quiz.items.forEach((q, index) => {
      const field = node("fieldset", null, "question"); field.dataset.questionId = q.id;
      field.append(node("legend", `${index + 1}. ${q.prompt || q.question}`));
      const controls = [], prior = draft[q.id]?.response;
      let text = null;
      if (q.type === "short_answer") { text = node("textarea"); text.rows = 4; text.maxLength = 4000; text.setAttribute("aria-label", "本题回答"); text.value = prior && !["skip", "__unknown__"].includes(prior) ? prior : ""; field.append(text); }
      const options = [...(q.options || []).filter(o => o.value !== "__unknown__"), { value: probe ? "unknown" : "__unknown__", label: "我不会" }, { value: "skip", label: "跳过这题" }];
      for (const option of options) {
        const label = node("label", null, "option"), input = node("input"); input.type = q.type === "multiple" ? "checkbox" : "radio"; input.name = q.id; input.value = option.value;
        input.checked = Array.isArray(prior) ? prior.includes(option.value) : prior === option.value;
        input.onchange = () => { if (["skip", "unknown", "__unknown__"].includes(input.value)) { for (const c of controls) if (c !== input) c.checked = false; if (text) text.value = ""; } else for (const c of controls) if (["skip", "unknown", "__unknown__"].includes(c.value)) c.checked = false; };
        label.append(input, node("span", option.label)); controls.push(input); field.append(label);
      }
      if (text) text.oninput = () => controls.forEach(c => { c.checked = false; });
      const confidenceLabel = node("label", "对这题的把握程度（0–100，可留空）", "confidence"), confidence = node("input"); confidence.type = "number"; confidence.min = "0"; confidence.max = "100"; confidence.step = "1"; confidence.value = draft[q.id]?.confidence ?? ""; confidenceLabel.append(confidence); field.append(confidenceLabel);
      let explanation = null;
      if (probe) { const label = node("label", "可选：用一句话说明你的理由"); explanation = node("textarea"); explanation.rows = 2; explanation.maxLength = 2000; explanation.value = draft[q.id]?.explanation || ""; label.append(explanation); field.append(label); }
      getters[q.id] = () => {
        const selected = controls.filter(c => c.checked).map(c => c.value);
        const response = text?.value.trim() || (selected.some(v => ["skip", "unknown", "__unknown__"].includes(v)) ? selected[0] : q.type === "multiple" ? selected.length ? selected : undefined : selected[0]);
        return { response, confidence: confidence.value === "" ? null : Number(confidence.value), ...(explanation ? { explanation: explanation.value } : {}) };
      };
      form.append(field);
    });
    const read = () => Object.fromEntries(Object.entries(getters).map(([k, fn]) => [k, fn()]));
    form.addEventListener("input", () => { clearTimeout(draftTimer); draftTimer = setTimeout(() => action("save_draft", { draft: read() }, true), 900); });
    const submit = node("button", probe ? "保存判断并继续" : "提交本次测验", "primary"); submit.type = "submit"; form.append(row(submit));
    form.onsubmit = async e => { e.preventDefault(); clearTimeout(draftTimer); const answers = read(); const missing = quiz.items.find(q => answers[q.id].response === undefined);
      if (missing) { form.querySelector(`[data-question-id="${CSS.escape(missing.id)}"]`).scrollIntoView({ block: "center" }); showError(new Error("请回答每题，或明确选择我不会／跳过。")); return; }
      submit.disabled = true; const ok = await action(probe ? "probe_submit" : "quiz_submit", probe ? { probeId: s.probe.id, ...answers[s.probe.id] } : { responses: answers }); if (!ok) submit.disabled = false;
    };
    stage.append(form);
  }
  function mountResource(index) {
    const s = state.session; if (!s?.lesson) return;
    if (frame) process("resource_close", { index: resourceIndex });
    frame = node("iframe"); frame.title = index < 0 ? `${s.name}讲解课件` : s.lesson.resources[index].title;
    frame.setAttribute("sandbox", "allow-scripts allow-same-origin"); frame.setAttribute("allow", "fullscreen 'none'");
    channel = crypto.randomUUID(); resourceIndex = index; embeddedGeometry = null;
    frame.src = index < 0 ? `${base}/assets/openmaic-classroom/frame.html` : `${base}${s.lesson.resources[index].url}`;
    const mountedFrame=frame;
    frame.onload = () => {
      if(frame!==mountedFrame)return;
      if (index < 0) frame.contentWindow.postMessage({ type: "cq:openmaic-slide-load", slide: s.lesson.slide.canvas }, "*");
      try {
        const doc = frame.contentDocument;
        doc.addEventListener("pointerdown", () => { lastInput = Date.now(); dragging = true; }, true);
        for(const event of ["pointerup","pointercancel"])doc.addEventListener(event, () => { dragging = false; lastInput = Date.now(); }, true);
        doc.addEventListener("keydown", () => { lastInput = Date.now(); }, true);
      } catch {}
      sendEmbedded();
    };
    document.querySelector("#canvas").replaceChildren(frame); helpSignature = ""; updateLearning(); process("resource_open", { index, resource: index < 0 ? "lecture" : s.lesson.resources[index].type });
  }
  function sendEmbedded() {
    const offer = state?.session?.offer;
    if (resourceIndex >= 0 && offer?.status === "support" && offer.placement === "inline") frame?.contentWindow?.postMessage({ type: "cq:task-show", channel, scope: state.session.scope, sceneType: state.session.lesson.resources[resourceIndex].type,
      revision: offer.id, tree: { tag:"article", children:[{tag:"strong",children:[{text:"知点 · 当前步骤的学习支持"}]},{tag:"p",supportBody:offer.id,children:[{text:offer.content.message}]},{tag:"button",id:"research_close_support",children:[{text:"收起这条支持"}]}] } }, "*");
    else { embeddedGeometry = null; frame?.contentWindow?.postMessage({ type: "cq:task-clear", channel }, "*"); }
  }
  function embeddedExposure() {
    const g=embeddedGeometry,o=state?.session?.offer;if(!g||!o||o.status!=="support"||o.placement!=="inline"||!frame?.isConnected||document.hidden)return;
    const f=frame.getBoundingClientRect(),r=g.rect,v=g.viewport;
    if(!r||!v||![r.x,r.y,r.width,r.height,v.width,v.height,g.fraction].every(Number.isFinite)||v.width<=0||v.height<=0)return;
    const sx=frame.clientWidth/v.width,sy=frame.clientHeight/v.height,x=f.left+r.x*sx,y=f.top+r.y*sy,w=r.width*sx,h=r.height*sy;
    const area=Math.max(0,Math.min(x+w,f.right,innerWidth)-Math.max(x,f.left,0))*Math.max(0,Math.min(y+h,f.bottom,innerHeight)-Math.max(y,f.top,0));
    const qualifies=g.supportBodyVisible&&g.fraction>=.5&&w*h>0&&area/(w*h)>=.5,key=`${o.id}:support`;
    if(!qualifies){clearTimeout(exposureTimer);exposureTimer=null;return;}if(exposed.has(key)||exposureTimer)return;
    exposureTimer=setTimeout(()=>{exposureTimer=null;if(!document.hidden&&state.session.offer?.id===o.id){exposed.add(key);action("offer_exposed",{opportunityId:o.id,kind:"support",visible:true},true);}},1000);
  }
  function observeOffer(card, offer) {
    clearTimeout(exposureTimer); exposureObserver?.disconnect();
    const key = `${offer.id}:${offer.status}`; if (exposed.has(key)) return;
    exposureObserver = new IntersectionObserver(entries => { clearTimeout(exposureTimer); if (entries[0].intersectionRatio >= .5 && !document.hidden) exposureTimer = setTimeout(() => {
      if (!document.hidden && state.session.offer?.id === offer.id && state.session.offer.status === offer.status) { exposed.add(key); action("offer_exposed", { opportunityId: offer.id, kind: offer.status, visible: true }, true); }
    }, 1000); }, { threshold: [.5] }); exposureObserver.observe(card);
  }
  function updateLearning() {
    const s = state?.session; if (!s || !document.querySelector("#workspace")) return;
    const offer = s.offer, signature = JSON.stringify(offer);
    if (signature !== helpSignature) {
      helpSignature = signature; document.querySelector("#help-inline").replaceChildren(); document.querySelector("#help-side").replaceChildren();
      clearTimeout(exposureTimer); exposureObserver?.disconnect();
      if (offer) {
        const card = node("aside", null, "help-card"); card.setAttribute("aria-label", "知点的主动帮助");
        card.append(node("h3", offer.status === "inquiry" ? "知点想确认一下" : "这一步的学习支持"));
        const body=node("p", offer.text || offer.content.message);body.dataset.supportText="true";card.append(body);
        if (offer.status === "inquiry") {
          let goal = null, grant = null;
          if (offer.clarification) {
            const label = node("label", "你现在更需要哪种支持？" ); goal = node("select"); goal.append(new Option("请选择，也可以拒绝", ""));
            for (const [v,t] of [["cognitive","理解概念或步骤"],["metacognitive","检查自己哪里不确定"],["motivational","想清楚学习的价值或目标"],["emotional","缓解挫败，调整状态"],["behavioral","安排下一步学习或资源"]]) goal.append(new Option(t,v)); label.append(goal); card.append(label);
          }
          if (offer.canGrant) { grant = check("本知识点内，接下来30分钟可直接展开概念线索；最多2次，可随时撤回。跨知识点、离开30分钟或暂停后失效。"); card.append(grant.wrapper); }
          card.append(row(button("现在需要", () => { if (goal && !goal.value) throw new Error("请选择希望解决的问题，或拒绝这次帮助。"); return action("accept", { opportunityId: offer.id, goal: goal?.value, grant: grant?.input.checked === true }, true); }, "primary"), button("暂时不需要", () => action("decline", {}, true)), button("稍后再说", () => action("later", {}, true))));
        } else card.append(row(button("收起这条支持", () => action("close_help", {}, true)), button("定位学习支持", () => { if (!embeddedGeometry) card.scrollIntoView({ block: "center" }); else {frame.scrollIntoView({block:"center"});frame?.contentWindow?.postMessage({ type: "cq:task-locate", channel }, "*");} })));
        document.querySelector(offer.placement === "sidebar" ? "#help-side" : "#help-inline").append(card); observeOffer(card, offer);
        // The control stays inside the same fullscreen workspace as the lesson.
        const locate = document.querySelector("#help-locate"); locate.hidden = false; locate.textContent = offer.status === "inquiry" ? "知点有一个询问" : "查看学习支持"; locate.onclick = () => card.scrollIntoView({ block: "center", behavior: "auto" });
      } else document.querySelector("#help-locate").hidden = true;
      sendEmbedded();
    }
    const pause = document.querySelector("#pause-help"); pause.textContent = s.controls.paused ? "恢复主动帮助" : "暂停主动帮助"; pause.onclick = () => action(s.controls.paused ? "resume" : "pause", {}, true);
    document.querySelector("#revoke-help").hidden = !s.controls.grantActive;
    const next = document.querySelector("#learning-next"); if (next) next.disabled = busy || s.phase === "explore" && Date.now() < s.exploreReadyAt;
    const feedback = s.feedbackSample || s.feedbackOffers[0];
    if (feedback?.id !== feedbackId) {
      feedbackId = feedback?.id || ""; const target = document.querySelector("#feedback"); target.replaceChildren();
      if (feedback) {
        const details = node("details", null, "help-feedback"); details.append(node("summary", s.feedbackSample ? "可选反馈：刚才未收到帮助的时刻" : "可选反馈：刚才这次帮助"));
        details.append(note("可不填写，不影响继续学习。请回想所指时刻，而不是现在的状态。"));
        const survey = surveyForm(feedback.questionnaire); details.append(survey.form, row(button("保存反馈", () => action("feedback_submit", { opportunityId: feedback.id, responses: survey.read() }, true)))); target.append(details);
      }
    }
  }
  function learning() {
    const s = state.session; heading(s.name);
    stage.append(node("p", s.lesson.goal));
    const workspace = node("section", null, "workspace"); workspace.id = "workspace";
    const select = node("select"); select.setAttribute("aria-label", "学习材料"); select.append(new Option("讲解课件", "-1")); s.lesson.resources.forEach((r,i) => select.append(new Option(r.title, String(i)))); select.onchange = () => mountResource(Number(select.value));
    const fullscreen = button("全屏学习", async () => { if (document.fullscreenElement) await document.exitFullscreen(); else await workspace.requestFullscreen(); });
    const locate = button("查看学习支持", () => {}); locate.id = "help-locate"; locate.hidden = true;
    const toolbar = node("div", null, "toolbar"); toolbar.append(select, fullscreen, locate); workspace.append(toolbar);
    const grid = node("div", null, `lesson-grid${study === "placement" ? " placement" : ""}`), left = node("div"), canvas = node("div", null, "canvas"), inline = node("div", null, "help-target"), side = node("div", null, "help-side help-target"); canvas.id = "canvas"; inline.id = "help-inline"; side.id = "help-side";
    left.append(canvas, inline); grid.append(left, side); workspace.append(grid);
    const pause = button("暂停主动帮助", () => {}); pause.id = "pause-help";
    const revoke = button("撤回连续授权", () => action("revoke", {}, true)); revoke.id = "revoke-help"; revoke.hidden = true;
    const next = button(s.phase === "explore" ? "完成探索，独立检查" : "继续独立练习", () => action(s.phase === "explore" ? "begin_t1" : "begin_outcome"), "primary"); next.id = "learning-next";
    const navigation = node("div", null, "learning-next"); navigation.append(row(pause, revoke), next); workspace.append(navigation);
    stage.append(workspace); const feedback = node("div"); feedback.id = "feedback"; stage.append(feedback);
    if (s.controls.canAsk) {
      const chat = node("details", null, "chat"); chat.append(node("summary", "向知点提问"), note("主动提问使用真实AI模型。AI可能出错；进入独立测量后，对话会自动收起。"));
      const messages = node("div", null, "chat-list");
      const renderMessages = () => { messages.replaceChildren(); for (const t of state.session.conversation || []) { const turn = node("div", null, "chat-turn"); turn.append(node("strong", "你"), node("p", t.question), node("strong", "知点"), node("p", t.response)); messages.append(turn); } };
      renderMessages(); const text = node("textarea"); text.maxLength = 2000; text.rows = 3; text.setAttribute("aria-label", "给知点的问题");
      const send = button("发送问题", () => serialized(async () => { send.disabled = true; try { state = await api(endpoint("chat"), { message: text.value }); text.value = ""; renderMessages(); } finally { send.disabled = false; } }));
      chat.append(messages, text, row(send)); stage.append(chat);
    } else stage.append(note("你没有选择使用外部模型对话。主动学习支持仍可使用。"));
    mountResource(-1); updateLearning();
    if (["after_t1","explore_return"].includes(s.phase)) setTimeout(()=>{
      if(state?.session?.phase===s.phase&&!document.hidden)action("context",{context:{visible:true,typing:false,dragging,idleMs:Date.now()-lastInput,busy:false}},true);
    },100);
  }
  function cases() {
    heading("使用六维空间解释与设计");
    stage.append(node("p", "D1：依据什么发现可能需要；D2：何时介入；D3：支持目标与策略；D4：怎样呈现；D5：学生控制与系统权限；D6：怎样检查后果、调整或结束。"));
    stage.append(note("以下为合成设计情境。请独立解释，也可以指出六维无法描述的部分；不存在要求你赞同框架的标准答案。"));
    if (state.session.phase === "design_task") { const t = node("textarea"); t.rows = 8; t.maxLength = 8000; t.setAttribute("aria-label", "策略设计"); stage.append(node("p", "为“上次答错、本次独立答对但信心低”的学生设计一条主动支持策略。写出证据、时机、内容、呈现、授权和结束规则，也可说明六维中缺了什么。"), t, row(button("保存策略设计", () => action("design_submit", { response: t.value }), "primary"))); return; }
    const texts = ["学生三分钟没有操作，系统说“你不想学了”，立即播放用途讲解。", "学生独立检查答错。系统等学生结束拖动后询问，学生拒绝，于是本知识点不再询问。", "学生授权本知识点内自动展开概念线索。系统在作答框旁展示反例；进入独立测验后自动关闭，随后再记录表现。", "学生上次没有分清函数值和极限，本次独立题已答对。系统仍根据上次错误发送同一提示。"];
    const readers = [];
    for (const caseId of state.session.caseOrder) {
      const box = node("section", null, "panel case-box"); box.append(node("h2", `案例 ${readers.length + 1}`), node("p", texts[caseId]));
      const tags = node("div", null, "case-tags"), inputs = [];
      for (const d of ["D1","D2","D3","D4","D5","D6","无法归类"]) { const c = check(d); tags.append(c.wrapper); inputs.push([d,c.input]); }
      const text = node("textarea"); text.maxLength = 4000; text.setAttribute("aria-label", "分类依据与遗漏"); box.append(tags, node("label", "说明分类依据、维度交叉和遗漏"), text); stage.append(box);
      readers.push(() => ({ caseId, dimensions: inputs.filter(([,i])=>i.checked).map(([d])=>d), interpretation: text.value }));
    }
    stage.append(row(button("保存案例编码", () => action("case_submit", { responses: readers.map(f=>f()) }), "primary")));
  }
  function render() {
    const oldPhase = stage.dataset.phase; clearView(); const s = state.session; stage.dataset.phase = s?.phase || "consent";
    if (!s) return consentView();
    if (["pre","post","transfer","retention"].includes(s.phase)) assessment();
    else if (["t0","t1","outcome","return_probe","return_outcome"].includes(s.phase)) assessment(true);
    else if (["baseline","survey"].includes(s.phase)) {
      heading(study === "design-space" ? s.phase === "baseline" ? "开始前，了解你的经验" : "回顾设计空间的使用" : s.phase === "baseline" ? "开始前，你怎么看这段学习" : "回顾这段学习"); const panel = node("section",null,"panel narrow"), survey = surveyForm(s.questionnaire,s.draft || {}); panel.append(note("没有标准答案。请按自己的情况回答，可以跳过任何一项。"),survey.form,row(button("保存并继续",()=>action(s.phase === "baseline" ? "baseline_submit" : "survey_submit",{responses:survey.read()}),"primary"))); stage.append(panel);
    } else if (["explore","after_t1","explore_return"].includes(s.phase)) learning();
    else if (s.phase === "between") {
      heading("这一节已完成"); stage.append(node("p","你的回答已保存。继续之前可以稍作休息。"));
      if(!s.commonFeedback.saved){const panel=node("section",null,"panel narrow"),survey=surveyForm(s.commonFeedback.questionnaire);panel.append(node("h2","回想刚才的学习过程"),note("无论是否收到帮助，问题都相同。可以跳过；回答不会影响之后的支持。"),survey.form,row(button("保存这两项反馈",()=>action("common_feedback",{responses:survey.read()}))));stage.append(panel);}
      else stage.append(note("这段学习的反馈已保存。"));
      stage.append(row(button(s.index < 5 ? "进入下一个知识点" : "继续后续流程",()=>action("next_point"),"primary")));
    }
    else if (["return_wait","retention_wait"].includes(s.phase)) { heading(s.phase === "return_wait" ? "本次学习已保存" : "即时测量已完成"); const due = s.phase === "return_wait" ? s.returnDueAt : s.retentionDueAt; stage.append(node("p",`下一次测量开放时间：${new Date(due).toLocaleString("zh-CN")}。到时使用相同账号、相同网址继续。`)); const b = button("进入下一次测量",()=>action(s.phase === "return_wait" ? "begin_return" : "begin_retention"),"primary"); b.disabled=Date.now()<due; b.dataset.readyAt=String(due);stage.append(row(b)); }
    else if (["case_coding","design_task"].includes(s.phase)) cases();
    else { heading(s.phase === "withdrawn" ? "已退出本次研究" : "本次流程已完成"); stage.append(node("p",s.phase === "withdrawn" ? "不会再向本研究记录学习活动。已有记录的处理按知情同意说明执行。" : s.summary?.next)); }
    if (!['withdrawn','complete'].includes(s.phase)) stage.append(row(button("暂时离开，保留进度",async()=>{ if (await action("end_learning_session")) location.href=`${base}/`; }),button("退出本次研究",()=>{ if(confirm("退出后将停止本研究。已有记录按知情同意说明处理。确定退出吗？"))return action("withdraw"); },"danger")));
    if (mode === "demo") stage.append(row(button("重新体验本方向",()=>{ if(confirm("当前演示记录会保留在历史中，新一轮从头开始。确定吗？"))return serialized(async()=>{state=await api(endpoint("restart-demo"),{requestId:crypto.randomUUID(),consent:{acknowledged:true,externalModel:false,futureBenchmark:false}});render();}); })));
    if (oldPhase !== s.phase) { stage.querySelector("h1")?.focus({preventScroll:true}); window.scrollTo(0,0); }
  }
  async function index() {
    clearView(); const data = await api("research-sites"); stage.append(node("h1","主动学习支持研究入口"),node("p","原学习平台保留。下面是相互独立的研究流程，可先体验，再选择一个方向实施真人研究。"),node("p","体验数据与正式数据分开保存。未完成机构信息和材料审核的方向不会自动招募。","notice"));
    const list=node("div",null,"study-list");for(const s of data.sites){const ref=data.reference.find(r=>r.id===s.id),card=node("article",null,"panel");card.append(note(s.dimensions.join(" · ")),node("h2",s.title),node("p",ref.question),note(ref.distinction));const a=node("a","打开流程体验 →");a.href=`${base}/studies/${s.id}/`;card.append(a);list.append(card);}stage.append(list);
  }
  document.querySelector("#home").href=`${base}/`;
  document.querySelector("#account").onclick=()=>{if(study==="index")return location.href=`${base}/`;if(token){if(!confirm("切换账号前请确认当前答题已保存。继续吗？"))return;token="";sessionStorage.removeItem("calculus-quest-auth-token-v1");}login();};
  document.addEventListener("pointerdown",()=>{lastInput=Date.now();dragging=true;});document.addEventListener("pointerup",()=>{dragging=false;lastInput=Date.now();});document.addEventListener("keydown",()=>{lastInput=Date.now();});window.addEventListener("blur",()=>{dragging=false;});
  document.addEventListener("visibilitychange",()=>{clearTimeout(exposureTimer);process("page_visibility",{visible:!document.hidden});if(!document.hidden&&state?.session?.offer){helpSignature="";updateLearning();}});
  document.addEventListener("fullscreenchange",()=>process("fullscreen",{active:Boolean(document.fullscreenElement)}));
  window.addEventListener("message",e=>{
    if(!frame||e.source!==frame.contentWindow||!e.data||typeof e.data!=="object")return;
    if(e.data.type==="cq:task-ready")sendEmbedded();
    if(e.data.type==="maic_learning_event"){lastInput=Date.now();const p=e.data.payload||{};process("courseware_semantic",{eventType:String(p.event_type||"").slice(0,100),data:p});}
    if(e.data.channel!==channel)return;
    if(e.data.type==="cq:task-control"&&e.data.id==="research_close_support")action("close_help",{},true);
    if(e.data.type==="cq:task-mounted"){
      const body=document.querySelector("[data-support-text]");if(body){body.textContent="线索已放在课件当前步骤中，可点击“定位学习支持”查看。";clearTimeout(exposureTimer);exposureTimer=null;exposureObserver?.disconnect();}
      process("courseware_semantic",{eventType:"support_mounted",anchor:String(e.data.anchor||"").slice(0,100)});
    }
    if(e.data.type==="cq:task-visibility"){embeddedGeometry=e.data;embeddedExposure();}
    if(e.data.type==="cq:task-unavailable"){embeddedGeometry=null;const body=document.querySelector("[data-support-text]"),offer=state.session.offer;if(body&&offer?.status==="support"){body.textContent=offer.content.message;observeOffer(body.closest("aside"),offer);}}
  });
  window.addEventListener("scroll",embeddedExposure,true);window.addEventListener("resize",embeddedExposure);
  window.addEventListener("online",flushProcess);
  let resizeTimer;window.addEventListener("resize",()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>process("viewport_change",{width:innerWidth,height:innerHeight,pixelRatio:devicePixelRatio}),300);});
  setInterval(()=>{flushProcess();document.querySelectorAll("[data-ready-at]").forEach(b=>{b.disabled=Date.now()<Number(b.dataset.readyAt);});if(busy)return;updateLearning();
    if(state?.session?.controls.assistanceAllowed&&!document.hidden){const active=frame?.contentDocument?.activeElement||document.activeElement;action("context",{context:{visible:!document.hidden,typing:/INPUT|TEXTAREA|SELECT/.test(active?.tagName||"")&&Date.now()-lastInput<5000,dragging,idleMs:Date.now()-lastInput,busy:false}},true);}
  },5000);
  if(study==="index")index().catch(showError);else if(token)refresh().catch(e=>e.status===401?login():showError(e));else login();
})();
