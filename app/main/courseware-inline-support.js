(function () {
  "use strict";
  if (window.parent === window || window.__cqInlineSupport) return;
  window.__cqInlineSupport = true;
  // Explicit curriculum anchors. No guessed selector supplied by a model.
  const anchors = {
    "GH-01-K01": ["#input_x-slider", ".control-group"],
    "GH-01-K02": ["#num_dots-slider", ".control-group"],
    "GH-01-K03": ["#trend_indicator-slider", ".slider-group"],
    "GH-02-K01": ["#prediction-input", ".prediction-input-row"],
    "GH-02-K02": ["#leftStart-slider", ".control-group"],
    "GH-02-K03": ["#point_y_coordinate-slider", ".control-group"]
  };
  let card = null, payload = null, observer = null, nativeObserver = null, fraction = 0;
  const send = (type, data = {}) => window.parent.postMessage({ type, channel: payload?.channel, ...data }, "*");
  function visibility() {
    if (!card?.isConnected) return;
    const r = card.getBoundingClientRect();
    send("cq:embedded-visibility", { fraction: document.hidden ? 0 : fraction, rect: { x: r.x, y: r.y, width: r.width, height: r.height }, viewport: { width: innerWidth, height: innerHeight } });
  }
  function clear() { observer?.disconnect(); observer = null; nativeObserver?.disconnect(); nativeObserver = null; card?.remove(); card = null; fraction = 0; }
  function show(data) {
    if (typeof data.channel !== "string" || data.channel.length > 100 || typeof data.text !== "string" || data.text.length > 1200) return;
    let contract;
    try { contract = JSON.parse(document.querySelector("#openmaic-semantic-contract")?.textContent || "{}"); } catch { return; }
    if (contract.knowledge_point_id !== data.scope || contract.scene_type !== "simulation") return;
    if (payload?.channel === data.channel && card?.isConnected) { visibility(); return; }
    clear(); payload = data;
    let spec = anchors[data.scope], control = spec && document.querySelector(spec[0]);
    // Preserve the lesson's locked prediction task. Until it opens, attach to x.
    if (data.scope === "GH-02-K01" && !control?.getClientRects().length) { spec = ["#x-position-slider", ".control-group"]; control = document.querySelector(spec[0]); }
    const group = control?.closest(spec[1]);
    if (!group) { send("cq:embedded-unavailable", { reason: "reviewed_anchor_missing" }); return; }
    const root = document.createElement("section"); card = root; root.dataset.cqEmbeddedHelp = "";
    root.setAttribute("aria-label", "当前步骤的学习线索"); root.tabIndex = -1;
    // Shadow styles isolate imported classroom CSS; the host remains normal flow.
    root.style.cssText = "display:block;position:static;box-sizing:border-box;width:100%;min-width:0;margin:10px 0;clear:both;grid-column:1/-1;";
    const shadow = root.attachShadow({ mode: "open" }), style = document.createElement("style");
    style.textContent = ":host{font:14px/1.7 'Microsoft YaHei',sans-serif;color:#29384b;color-scheme:light}*{box-sizing:border-box}.card{background:#f0f8f6;border:1px solid #9ac7ba;border-left:3px solid #317c68;border-radius:7px;padding:12px 14px;overflow-wrap:anywhere}strong{font-size:13px;color:#256451}p{margin:7px 0 12px}footer{display:flex;gap:8px;flex-wrap:wrap}button{font:inherit;font-size:13px;min-height:36px;padding:6px 10px;border-radius:5px;border:1px solid #a7c6bc;background:white;color:#285746;cursor:pointer}button:focus-visible{outline:3px solid #7462c5;outline-offset:2px}button:hover{background:#dfeee9}";
    const box = document.createElement("div"); box.className = "card";
    const title = document.createElement("strong"); title.textContent = spec[0] === "#prediction-input" ? "知点 · 预测作答线索" : "知点 · 当前步骤线索";
    const text = document.createElement("p"); text.textContent = data.text;
    const actions = document.createElement("footer");
    const entries = data.allowAccept ? [["带着线索写想法", "practice"], ["关闭帮助", "close"]] : [["关闭帮助", "dismiss_manual_help"]];
    for (const [label, action] of entries) { const b = document.createElement("button"); b.type = "button"; b.textContent = label; b.onclick = () => send("cq:embedded-action", { action }); actions.append(b); }
    box.append(title, text, actions); shadow.append(style, box); group.after(root);
    observer = new IntersectionObserver(entries => { fraction = entries[0].intersectionRatio; visibility(); }, { threshold: [0, .5, 1] }); observer.observe(root);
    if (data.scope === "GH-02-K01") {
      const nativeAnswer = document.querySelector("#pred-unlocked");
      if (nativeAnswer) {
        nativeObserver = new MutationObserver(() => {
          if (!card?.isConnected || card.parentElement !== nativeAnswer || nativeAnswer.getClientRects().length) return;
          const fallback = document.querySelector("#x-position-slider")?.closest(".control-group");
          if (!fallback) return;
          fallback.after(card); card.shadowRoot.querySelector("strong").textContent = "知点 · 当前步骤线索";
          send("cq:embedded-mounted", { anchor: "#x-position-slider", location: "courseware_control" }); requestAnimationFrame(visibility);
        });
        nativeObserver.observe(nativeAnswer, { attributes: true, attributeFilter: ["style", "hidden", "class"] });
      }
    }
    send("cq:embedded-mounted", { anchor: spec[0], location: spec[0] === "#prediction-input" ? "courseware_answer" : "courseware_control" });
    requestAnimationFrame(visibility);
  }
  window.addEventListener("message", event => {
    if (event.source !== window.parent || !event.data || typeof event.data !== "object") return;
    if (event.data.type === "cq:embedded-show") show(event.data);
    else if (event.data.channel === payload?.channel && event.data.type === "cq:embedded-clear") clear();
    else if (event.data.channel === payload?.channel && event.data.type === "cq:embedded-locate") { card?.scrollIntoView({ block: "nearest", behavior: "instant" }); card?.focus({ preventScroll: true }); requestAnimationFrame(visibility); }
  });
  document.addEventListener("scroll", visibility, true); document.addEventListener("visibilitychange", visibility); window.addEventListener("resize", visibility);
  document.addEventListener("focusin", event => {
    if (payload?.scope !== "GH-02-K01" || !card?.isConnected || event.target.id !== "prediction-input") return;
    const group = event.target.closest(".prediction-input-row"); if (!group || group.nextElementSibling === card) return;
    group.after(card); card.shadowRoot.querySelector("strong").textContent = "知点 · 预测作答线索";
    send("cq:embedded-mounted", { anchor: "#prediction-input", location: "courseware_answer" }); requestAnimationFrame(visibility);
  });
  window.parent.postMessage({ type: "cq:embedded-ready" }, "*");
})();
