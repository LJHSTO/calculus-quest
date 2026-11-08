(function installOpenMaicSlide(global) {
  "use strict";
  const frames = new Map();
  function clearDeadline(entry) { clearTimeout(entry.timeout); entry.timeout = null; }
  function stopLoadingWatch(entry) { clearDeadline(entry); entry.resizeObserver?.disconnect(); entry.resizeObserver = null; }
  function hostVisible(entry) {
    const rect=entry.host.getBoundingClientRect();
    return !document.hidden && rect.width>0 && rect.height>0 && getComputedStyle(entry.host).visibility!=="hidden";
  }
  function syncLoadingDeadline(frame, entry) {
    if(!frame.isConnected){stopLoadingWatch(entry);frames.delete(frame);return;}
    if(entry.host.dataset.openmaicState!=="loading"){stopLoadingWatch(entry);return;}
    if(!hostVisible(entry)){clearDeadline(entry);return;}
    if(entry.timeout!==null)return;
    entry.timeout=setTimeout(()=>{
      entry.timeout=null;
      if(!frame.isConnected){stopLoadingWatch(entry);frames.delete(frame);return;}
      if(entry.host.dataset.openmaicState!=="loading"){stopLoadingWatch(entry);return;}
      if(!hostVisible(entry))return;
      entry.host.dataset.openmaicState="fallback";stopLoadingWatch(entry);
    },20000);
  }
  function syncLoadingWatches() {
    for(const [frame,entry] of frames){
      if(!frame.isConnected){stopLoadingWatch(entry);frames.delete(frame);}
      else if(entry.resizeObserver)syncLoadingDeadline(frame,entry);
    }
  }
  new MutationObserver(syncLoadingWatches).observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:["hidden","style","class"]});
  document.addEventListener("visibilitychange",syncLoadingWatches);
  global.addEventListener('cq:proactive-state',()=>{for(const entry of frames.values())entry.restorePage?.();});

  function mount(host, canvas, unit, resourceRoot) {
    if (!host || !canvas?.elements?.length) return;
    for (const [frame, entry] of frames) {
      if (!frame.isConnected) {
        stopLoadingWatch(entry);
        frames.delete(frame);
      }
    }
    function prepare(canvas) {
    const slide = structuredClone(canvas);
    function resolveMedia(value) {
      if (!value || typeof value !== "object") return;
      for (const [key, entry] of Object.entries(value)) {
        if (["src", "poster"].includes(key) && typeof entry === "string" && entry) {
          value[key] = new URL(slideImageSrc(entry, unit.chapterId, resourceRoot), document.baseURI).href;
        } else if (entry && typeof entry === "object") resolveMedia(entry);
      }
    }
    resolveMedia(slide);
    for (const element of slide.elements) {
      if (element.type === "text" && typeof element.content === "string") {
        element.content = renderSlideTextContent(element.content);
      }
      if (element.type === "shape" && typeof element.text?.content === "string") {
        element.text.content = renderSlideTextContent(element.text.content);
      }
      if (element.type === "table") {
        for (const row of element.data || []) {
          for (const cell of row || []) {
            if (typeof cell.text === "string") cell.text = renderSlideTextContent(cell.text);
          }
        }
      }
    }
      return slide;
    }
    const pages=unit?.scene?.content?.knowledgePoint?.slide?.pages||[canvas];
    const lecturePages=unit?.scene?.content?.knowledgePoint?.slide?.lecturePages||[];
    const lectureVersion=String(unit?.scene?.content?.knowledgePoint?.slide?.lectureVersion||'');
    let pageIndex=0;
    host.dataset.openmaicPage='1';host.dataset.openmaicPageSummary='';
    const slide=prepare(pages[0]);
    let frame = document.createElement("iframe");
    frame.className = "embed-frame openmaic-slide-frame";
    frame.dataset.openmaicSlide = slide.id || unit.id;
    frame.dataset.contextScope = "slide";
    frame.title = `${unit.label} · OpenMAIC 讲解`;
    frame.setAttribute("sandbox", "allow-scripts");
    frame.setAttribute("allow", "autoplay");
    const entry = {
      host, slide, context: { chapterId: unit.chapterId, unitId: unit.id, unitLabel: unit.label },
      elementRefs: Object.fromEntries(slide.elements.map((element, index) => [
        element.id, `slide:${slideSvgId(slide.id || "canvas")}:${slideSvgId(element.id || `${element.type || "element"}-${index + 1}`)}`
      ])),
      timeout: null, resizeObserver: null, authoredHtml: false
    };
    frames.set(frame, entry);
    const rendererUrl = new URL("assets/openmaic-classroom/frame.html", document.baseURI).href;
    if(pages.length>1){
      document.querySelectorAll('.openmaic-page-nav').forEach(node=>node.remove());
      const nav=document.createElement('nav');nav.className='openmaic-page-nav';nav.dataset.lectureUnit=unit.id;nav.setAttribute('aria-label','本知识点讲解页');
      const prev=document.createElement('button'),next=document.createElement('button'),status=document.createElement('span');prev.type=next.type='button';prev.textContent='上一页';next.textContent='下一页';prev.setAttribute('aria-label','上一讲解页');next.setAttribute('aria-label','下一讲解页');status.setAttribute('role','status');
      function update(){status.textContent='讲解 '+(pageIndex+1)+' / '+pages.length;prev.disabled=pageIndex===0;next.disabled=pageIndex===pages.length-1;}
      function show(index){
        if(!host.isConnected||getUnit()?.id!==unit.id||!Number.isInteger(index)||index<0||index>=pages.length||index===pageIndex)return;
        global.LessonPlayback?.pause();if(typeof pauseNarrationQueue==='function')pauseNarrationQueue();
        pageIndex=index;host.dataset.openmaicPage=String(index+1);host.dataset.openmaicPageSummary=index>0?String(lecturePages[index-1]?.summary||''):'';
        const fallbackDeck = host.querySelector('[data-slide-deck]');
        if (fallbackDeck && typeof showSlideDeckPage === 'function') showSlideDeckPage(fallbackDeck, index);
        entry.slide=prepare(pages[index]);entry.elementRefs=Object.fromEntries(entry.slide.elements.map((e,i)=>[e.id,'slide:'+slideSvgId(entry.slide.id)+':'+slideSvgId(e.id||String(i))]));frame.dataset.openmaicSlide=entry.slide.id;
        const authored = pages[index].authoredHtml;
        entry.authoredHtml = typeof authored === 'string' && /^resources\/open-maic\/pro-supplements-r11\/GH-0[12]-K0[123]\.html$/.test(authored);
        // A new browsing context rejects delayed messages from the previous page.
        stopLoadingWatch(entry); frames.delete(frame);
        const previousFrame = frame; frame = previousFrame.cloneNode(false);
        frame.removeAttribute('src'); frame.dataset.openmaicSlide = entry.slide.id;
        frames.set(frame, entry); host.dataset.openmaicState = 'loading';
        frame.src = entry.authoredHtml ? coursewareFrameUrl(authored) : rendererUrl;
        previousFrame.replaceWith(frame);
        entry.resizeObserver = new ResizeObserver(() => syncLoadingDeadline(frame, entry));
        entry.resizeObserver.observe(host); syncLoadingDeadline(frame, entry);
        update();global.LearningWorkspace?.syncPlayback?.();analyticsTrack('slide_page_view',{data:{unitId:unit.id,page:index+1,pageCount:pages.length,lectureVersion:unit?.scene?.content?.knowledgePoint?.slide?.lectureVersion||'functions-limits-lessons-r10-v1'}});
        if(typeof rememberLearningUiCursor==='function')rememberLearningUiCursor({lecturePage:index,pageId:String(pages[index].id||''),lectureVersion});
      }
      entry.restorePage=()=>{
        if(entry.pageRestored||!host.isConnected||getUnit()?.id!==unit.id)return;
        if(typeof learningUiCursorContext!=='function'||!learningUiCursorContext(unit.id))return;
        entry.pageRestored=true;
        const saved=typeof readLearningUiCursor==='function'?readLearningUiCursor(unit.id):null;
        if(saved?.lectureVersion===lectureVersion&&saved.lecturePage<pages.length&&String(pages[saved.lecturePage]?.id||'')===saved.pageId)show(saved.lecturePage);
      };
      prev.addEventListener('click',()=>show(pageIndex-1));next.addEventListener('click',()=>show(pageIndex+1));nav.append(prev,status,next);
      const controls=document.querySelector('.classroom-controlbar .classroom-controls');
      if(controls)controls.before(nav);else host.before(nav);update();
    }
    host.dataset.openmaicState = "loading";
    const loading = document.createElement("span");
    loading.className = "openmaic-slide-loading";
    loading.setAttribute("role", "status");
    loading.textContent = "课件加载中…";
    host.append(loading);
    frame.src = rendererUrl;
    host.append(frame);
    // Hidden iframes suspend renderer animation frames; give a full window only while the host is shown.
    entry.resizeObserver=new ResizeObserver(()=>syncLoadingDeadline(frame,entry));
    entry.resizeObserver.observe(host);syncLoadingDeadline(frame,entry);entry.restorePage?.();
  }

  global.addEventListener("message", (event) => {
    const pair = Array.from(frames).find(([frame]) => frame.isConnected && frame.contentWindow === event.source);
    if (!pair || !event.data || typeof event.data !== "object") return;
    const [frame, entry] = pair;
    if (entry.authoredHtml) {
      if (event.data.pageId !== entry.slide.id) return;
      if (event.data.type === 'cq:authored-lecture-ready' && entry.host.dataset.openmaicState === 'loading') {
        stopLoadingWatch(entry); entry.host.dataset.openmaicState = 'ready'; global.LearningWorkspace?.syncPlayback?.();
      } else if (event.data.type === 'cq:authored-lecture-error') {
        stopLoadingWatch(entry); entry.host.dataset.openmaicState = 'fallback'; global.LearningWorkspace?.syncPlayback?.();
      }
      return;
    }
    if (event.data.type === "cq:openmaic-ready") {
      frame.contentWindow.postMessage({ type: "cq:openmaic-slide-load", slide: entry.slide, context: entry.context, elementRefs: entry.elementRefs }, "*");
    } else if (event.data.type === "cq:openmaic-rendered" && event.data.slideId === entry.slide.id) {
      stopLoadingWatch(entry);
      // Once a fallback is visible, a late renderer must not replace the lesson.
      if (entry.host.dataset.openmaicState === "loading") entry.host.dataset.openmaicState = "ready";
      global.LearningWorkspace?.syncPlayback?.();
    } else if (event.data.type === "cq:openmaic-render-error") {
      stopLoadingWatch(entry);
      entry.host.dataset.openmaicState = "fallback";
      global.LearningWorkspace?.syncPlayback?.();
    }
  });
  global.OpenMaicSlide = Object.freeze({ mount });
})(window);
