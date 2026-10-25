(function () {
  "use strict";
  if (parent === window || window.__cqTaskSupport) return;
  window.__cqTaskSupport = true;
  // Reviewed native controls for six knowledge points. Fixed game/3D overlays
  // deliberately use the outer task footer so their canvas stays unobstructed.
  const simulation = {
    "GH-01-K01": ["#input_x-slider", ".control-group"],
    "GH-01-K02": ["#num_dots-slider", ".control-group"],
    "GH-01-K03": ["#trend_indicator-slider", ".slider-group"],
    "GH-02-K01": ["#x-position-slider", ".control-group"],
    "GH-02-K02": ["#leftStart-slider", ".control-group"],
    "GH-02-K03": ["#point_y_coordinate-slider", ".control-group"]
  };
  const maps = {
    "GH-01-K01": "#sidebar", "GH-01-K02": "#sidebar", "GH-01-K03": ".sidebar-content",
    "GH-02-K01": "#sidebar", "GH-02-K02": "#sidebar-content", "GH-02-K03": "#sidebarContent"
  };
  let current, host, content, visibleRatio = 0, intersection, treeKey = "", layoutObserver;
  const send = (type, fields = {}) => parent.postMessage({ type, channel: current?.channel, ...fields }, "*");
  let pointerHeld=false;
  function reportActivity(){
    const focus=host?.shadowRoot?.activeElement||document.activeElement;
    send("cq:task-busy",{busy:pointerHeld||Boolean(focus?.matches('textarea,input:not([type=button]):not([type=checkbox]):not([type=range]),[contenteditable=true]'))});
  }
  document.addEventListener("pointerdown",()=>{pointerHeld=true;reportActivity();},true);
  for(const event of ["pointerup","pointercancel"])document.addEventListener(event,()=>{pointerHeld=false;reportActivity();},true);
  document.addEventListener("focusin",reportActivity,true);
  document.addEventListener("focusout",()=>setTimeout(reportActivity,0),true);
  const visible = el => el && el.getClientRects().length && getComputedStyle(el).visibility !== "hidden"
    && getComputedStyle(el).pointerEvents !== 'none' && getComputedStyle(el).opacity !== '0';
  function anchor() {
    const kp = current.scope, type = current.sceneType;
    const explicit=document.querySelector('[data-cq-support-anchor]');
    if(visible(explicit))return {el:explicit,after:false,name:'data-cq-support-anchor'};
    // These exports position their game screens and 3D controls over the canvas.
    // Growing those containers would cover learning content. Use the parent's
    // normal-flow task footer, keeping the full original interactive viewport.
    if(type === "game" || type === "visualization3d") return null;
    if (type === "simulation") {
      const nativeInput = kp === "GH-02-K01" && document.querySelector("#prediction-input");
      if (visible(nativeInput) && (document.activeElement === nativeInput || host?.parentElement?.id === "pred-unlocked")) return { el: nativeInput.closest(".prediction-input-row"), after: true, name: "#prediction-input" };
      const spec = simulation[kp], el = spec && document.querySelector(spec[0])?.closest(spec[1]);
      return visible(el) ? { el, after: true, name: spec[0] } : null;
    }
    const selectors = type === "mindMap" ? [maps[kp]] : [];
    for (const selector of selectors.filter(Boolean)) {
      const el = document.querySelector(selector);
      // A collapsed diagram panel is not a valid exposure opportunity.
      if (visible(el) && el.getBoundingClientRect().width >= 180 && !el.closest(".collapsed,.hidden")) return { el, after: false, name: selector };
    }
    return null;
  }
  function geometry() {
    if (!host?.isConnected) return;
    const body=content.querySelector('[data-support-body]'), target=body||host, r=target.getBoundingClientRect();
    const area=Math.max(0,Math.min(r.bottom,innerHeight)-Math.max(r.top,0))*Math.max(0,Math.min(r.right,innerWidth)-Math.max(r.left,0));
    const fraction=r.width*r.height>0?area/(r.width*r.height):0;
    send("cq:task-visibility", { pilotProbe:content.querySelector('[data-pilot-probe]')?.dataset.pilotProbe||null,supportBodyVisible:Boolean(body&&visible(body)&&!body.closest("details:not([open])")),fraction:document.hidden?0:fraction, rect: { x:r.x,y:r.y,width:r.width,height:r.height }, viewport:{width:innerWidth,height:innerHeight} });
  }
  function clear() {
    intersection?.disconnect(); layoutObserver?.disconnect(); host?.remove();
    host = content = intersection = layoutObserver = null; treeKey = ""; visibleRatio = 0;
  }
  const tags = new Set(["div","section","article","header","footer","p","strong","span","small","label","form","fieldset","legend","textarea","input","button","br","ul","ol","li","h3","h4","output","details","summary"]);
  const mathTags=new Set(['math','semantics','mrow','mi','mn','mo','mfrac','msup','msub','msubsup','msqrt','mroot','mover','munder','munderover','mtable','mtr','mtd','mtext','mspace','menclose','mstyle','mpadded']);
  function fromTree(item, depth = 0, revision = current.revision) {
    if (!item || depth > 18) return document.createTextNode("");
    if (typeof item.text === "string") return document.createTextNode(item.text.slice(0, 16000));
    if (!tags.has(item.tag) && !mathTags.has(item.tag)) return document.createTextNode("");
    const el = mathTags.has(item.tag) ? document.createElementNS('http://www.w3.org/1998/Math/MathML',item.tag) : document.createElement(item.tag);
    if (item.hidden) el.hidden = true;
    if (item.supportBody) el.dataset.supportBody=item.supportBody;
    if (item.pilotProbe) el.dataset.pilotProbe=String(item.pilotProbe).slice(0,100);
    for (const key of ["type","placeholder","aria-label","aria-pressed","role","aria-checked","min","max","step","rows","maxLength","display","mathvariant","stretchy","fence","separator","scriptlevel","columnalign"]) if (item.attrs?.[key] != null) el.setAttribute(key, String(item.attrs[key]).slice(0, 300));
    if(item.tag==="details") {el.open=item.open===true;el.addEventListener("toggle",()=>{send("cq:task-control",{id:item.id,kind:"toggle",open:el.open,revision});geometry();});}
    if (item.tag === "button") el.type = "button";
    if (item.disabled) el.disabled = true;
    if (item.value != null) el.value = String(item.value);
    if (item.id) el.dataset.taskControl = item.id;
    for (const child of (item.children || []).slice(0, 200)) el.append(fromTree(child, depth + 1, revision));
    if (item.id && ["textarea","input"].includes(item.tag)) el.addEventListener("input", () => send("cq:task-control", { id:item.id, kind:"input", revision, value:el.value.slice(0,2000) }));
    if (item.id && item.tag === "button") el.addEventListener("click", () => send("cq:task-control", { id:item.id, kind:"click", revision }));
    if (item.id && item.tag === "form") el.addEventListener("submit", e => { e.preventDefault(); send("cq:task-control", { id:item.id, kind:"submit", revision }); });
    return el;
  }
  function place() {
    if (!current) return;
    const target = anchor();
    if (!target) { host?.remove(); send("cq:task-unavailable", {reason:"no_visible_reviewed_anchor"}); return; }
    if (!host) {
      host = document.createElement("section"); host.dataset.cqEmbeddedHelp = "task"; host.tabIndex = -1; host.setAttribute("aria-label","当前任务的学习帮助");
      host.style.cssText = "display:block;position:static;flex:0 0 auto;box-sizing:border-box;width:100%;min-width:0;grid-column:1/-1;margin:12px 0;clear:both;";
      const shadow = host.attachShadow({mode:"open"}), style = document.createElement("style");
      style.textContent = ":host{font:14px/1.75 'Microsoft YaHei',sans-serif;color:#243c35;color-scheme:light}*{box-sizing:border-box}[hidden]{display:none!important}.card{padding:14px;background:#eff7f3;border:1px solid #a9cbbd;border-left:3px solid #397e63;border-radius:8px;overflow-wrap:anywhere}article{margin:0 0 12px}p{margin:8px 0}header,footer{display:flex;gap:8px;flex-wrap:wrap;align-items:center}strong{font-size:14px}small{display:block;color:#536b61;font-size:12px}button{font:inherit;line-height:1.5;min-height:38px;max-width:100%;padding:7px 10px;margin:4px 5px 4px 0;border:1px solid #9cbbad;border-radius:5px;background:white;color:#245c46;cursor:pointer;white-space:normal}button:hover{background:#dfede5}button:disabled{opacity:.6;cursor:wait}label{display:block}textarea{display:block;width:100%;min-height:94px;resize:vertical;background:#fff;color:#26394a;border:1px solid #9cbbad;border-radius:5px;padding:10px;font:inherit;margin:10px 0}input{max-width:100%;font:inherit}button:focus-visible,textarea:focus-visible{outline:3px solid #8b79d4;outline-offset:2px}";
      style.textContent += '[role="note"]{padding:12px 16px;border-radius:16px 16px 16px 4px;background:#e2f0e8;border:1px solid #bbd5c7}';
      style.textContent += 'button[aria-pressed="true"]{background:#d5e9dd;border-color:#397e63}summary{cursor:pointer;padding:8px 0}details{margin:6px 0}';
      style.textContent += '[data-pilot-probe]{max-height:340px;overflow:auto;overscroll-behavior:contain;scroll-padding:8px}fieldset{min-width:0;margin:12px 0;padding:8px;border:1px solid #c4d6cd;border-radius:6px}legend{font-weight:600;max-width:100%;padding:0 4px}';
      content = document.createElement("div"); content.className = "card"; shadow.append(style, content);
      intersection = new IntersectionObserver(entries => {visibleRatio=entries[0].intersectionRatio;geometry();},{threshold:[0,.5,1]}); intersection.observe(host);
    }
    if (target.after ? target.el.nextElementSibling !== host : host.parentElement !== target.el) {
      if (target.after) target.el.after(host); else target.el.append(host);
      send("cq:task-mounted",{anchor:target.name});
    }
    // Echoed draft values must not replace the button between pointerdown and
    // click. Structural/permission changes still rebuild the surface.
    const key = JSON.stringify(current.tree,(name,value)=>name==='value'?undefined:value);
    if (key !== treeKey) {
      const active=host.shadowRoot.activeElement, focused=active?.dataset.taskControl, label=active?.getAttribute('aria-label');
      const expanded=new Map([...content.querySelectorAll('details')].map(n=>[n.querySelector('summary')?.textContent,n.open]));
      treeKey=key; content.replaceChildren(fromTree(current.tree));
      for(const node of content.querySelectorAll('details')){const key=node.querySelector('summary')?.textContent;if(expanded.has(key))node.open=expanded.get(key);}
      const field=focused&&content.querySelector(`[data-task-control="${focused}"]`) || label&&[...content.querySelectorAll('textarea,input')].find(n=>n.getAttribute('aria-label')===label);
      field?.focus({preventScroll:true});
    }else{
      function syncValues(item){if(!item||typeof item!=='object')return;if(item.id&&item.value!=null){const field=content.querySelector(`[data-task-control="${item.id}"]`);if(field&&field!==host.shadowRoot.activeElement&&field.value!==String(item.value))field.value=String(item.value);}for(const child of item.children||[])syncValues(child);}
      syncValues(current.tree);
    }
    requestAnimationFrame(geometry);
  }
  window.addEventListener("message", event => {
    if (event.source !== parent || !event.data) return;
    const data = event.data;
    if (data.type === "cq:task-show") {
      let contract; try{contract=JSON.parse(document.querySelector("#openmaic-semantic-contract")?.textContent || "{}");}catch{return;}
      if(!simulation[data.scope] || contract.knowledge_point_id!==data.scope || contract.scene_type!==data.sceneType || typeof data.channel!=="string" || data.channel.length>100 || !data.tree || JSON.stringify(data.tree).length>60000)return;
      if(current?.channel!==data.channel)clear();current=data;place();reportActivity();
      if(!layoutObserver){layoutObserver=new MutationObserver(()=>{if(current)place();});layoutObserver.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:["class","style","hidden"]});}
    } else if(data.channel===current?.channel && data.type==="cq:task-clear"){current=null;clear();}
    else if(data.channel===current?.channel && data.type==="cq:task-locate"){host?.scrollIntoView({block:"nearest"});host?.focus({preventScroll:true});}
    else if(data.channel===current?.channel && data.type==="cq:task-return"){
      const target=anchor()?.el;target?.scrollIntoView({block:'start'});
      target?.querySelector('input,button,textarea')?.focus({preventScroll:true});
    }
  });
  document.addEventListener("focusin",()=>{if(current)place();});
  document.addEventListener("scroll",geometry,true);document.addEventListener("visibilitychange",geometry);window.addEventListener("resize",geometry);
  parent.postMessage({type:"cq:task-ready"},"*");
})();
