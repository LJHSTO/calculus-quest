(function (global) {
  "use strict";
  let player = null, owner = "", scope = null, binding = "", rate = 1;
  const widgetTypes = { widget_highlight:"HIGHLIGHT_ELEMENT", widget_setState:"SET_WIDGET_STATE", widget_annotation:"ANNOTATE_ELEMENT", widget_reveal:"REVEAL_ELEMENT" };
  function post(type, payload = {}) {
    const frame = scope?.querySelector('iframe[data-courseware-frame], iframe[data-openmaic-slide]');
    frame?.contentWindow?.postMessage({ type, ...payload, source: "authored_playback", playbackId: binding }, "*");
  }
  function record(action, details) {
    analyticsTrack("courseware_authored_action", { source: "authored_playback", data: {
      actionId: action.id, actionType: action.type, unitId: getUnit()?.id || "", ...details, countsAsStudentEvidence: false
    }});
  }
  function clearEffects() { post("cq:playback-clear"); }
  function action(a, details) {
    record(a, details);
    if (["spotlight", "laser"].includes(a.type)) post("cq:playback-effect", { action: a });
    if (widgetTypes[a.type]) post("cq:playback-widget", { action: a, messageType: widgetTypes[a.type] });
  }
  function media(a, events, options) {
    if (!a.audioRef) { queueMicrotask(()=>events.failed("当前视频无法播放，请查看课件中的视频控件。")); return null; }
    const audio = new Audio(); audio.preload = "auto"; audio.playbackRate = options.rate;
    let disposed = false, started = false;
    const start = () => { if (disposed) return; started = true; audio.play().catch(()=>{
      if (!disposed) events.failed("音频暂不可用，已切换为文字讲解。");
    }); };
    const timeout = setTimeout(()=>{if (!disposed && audio.readyState === 0) events.failed();},12000);
    audio.addEventListener("loadedmetadata", () => {
      clearTimeout(timeout); events.duration(audio.duration);
      audio.currentTime = Math.max(0, Math.min(options.offset, audio.duration - .05));
      if (!options.paused && !started) start();
    });
    audio.addEventListener("timeupdate", () => events.time(audio.currentTime));
    audio.addEventListener("ended", events.ended);
    audio.addEventListener("error", () => { if (!disposed) events.failed(); });
    audio.src = resourceUrl(`resources/${knowledgeAudioRoot(getUnit())}/${a.audioRef}`);
    audio.load();
    return { play: start, pause() { options.paused = true; audio.pause(); },
      setRate(value) { audio.playbackRate = value; },
      stop() { disposed = true; clearTimeout(timeout); audio.pause(); audio.removeAttribute("src"); audio.load(); }
    };
  }
  function currentBinding(target) {
    const slot = target?.querySelector('[data-knowledge-audio-order]');
    return slot ? `${getUnit()?.id}:${slot.dataset.knowledgeAudioSlot}:${slot.dataset.knowledgeAudioOrder}` : "";
  }
  function prepare(target) {
    const key = currentBinding(target);
    if (!key || getUnit()?.type !== "knowledge") return false;
    if (player && key === owner && scope === target) return true;
    stop(); owner = key; scope = target; binding = crypto.randomUUID();
    const order = Number(target.querySelector('[data-knowledge-audio-order]').dataset.knowledgeAudioOrder);
    const actions = knowledgeAudioActions(getUnit(), order);
    if (!actions.length) return false;
    player = global.CoursePlayback.create(actions, { action, clearEffects, media,
      onChange() { global.LearningWorkspace?.syncPlayback?.(); } });
    player.setRate(rate);
    return true;
  }
  function stop() { player?.stop(); player = null; owner = ""; scope = null; binding = ""; }
  global.LessonPlayback = Object.freeze({
    play(target) { return prepare(target) && player.play(); },
    pause() { player?.pause(); }, stop,
    seek(value, target) { if (prepare(target)) player.seek(value); },
    setRate(value) { if (rate === value) return; rate = value; player?.setRate(value); },
    snapshot(target) { return player && owner === currentBinding(target) && scope?.isConnected ? player.snapshot() : null; }
  });
  global.addEventListener("cq:participant-change", stop);
  global.addEventListener('message',event=>{
    const currentFrame=scope?.querySelector('iframe[data-courseware-frame]'),m=event.data;
    if(currentFrame?.contentWindow!==event.source||m?.type!=='cq:playback-action-result'||m.playbackId!==binding)return;
    analyticsTrack('courseware_authored_action_result',{source:'authored_playback',data:{actionId:m.actionId,status:m.status,countsAsStudentEvidence:false}});
  });
  global.addEventListener("cq:lesson-rendered", () => { if (player && (!scope?.isConnected || !owner.startsWith(`${getUnit()?.id}:`))) stop(); });
})(window);
