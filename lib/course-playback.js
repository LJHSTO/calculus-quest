(function (global, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else global.CoursePlayback = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";
  const timed = new Set(["speech", "discussion", "play_video"]);
  const supported = new Set([...timed, "spotlight", "laser", "widget_highlight", "widget_setState", "widget_annotation", "widget_reveal"]);
  const estimate = action => action.type === "discussion" ? 8 : action.type === "play_video" ? 30
    : action.type === "speech" ? Math.max(2, String(action.text || action.prompt || "").length / 4.5) : 0;

  // Only authored playback fields cross the public course boundary. Quiz
  // content, solutions, agent prompts, and arbitrary executable code never do.
  function publicActions(actions) {
    return (Array.isArray(actions) ? actions : []).filter(a => supported.has(a.type)).map(a => {
      const safe = { id: String(a.id || ""), type: a.type };
      for (const k of ["text", "prompt", "audioRef", "elementId", "target", "content", "topic", "color"])
        if (typeof a[k] === "string") safe[k] = a[k].slice(0, 12000);
      if (a.state && typeof a.state === "object" && !Array.isArray(a.state)) safe.state = JSON.parse(JSON.stringify(a.state));
      if (Number.isFinite(a.dimOpacity)) safe.dimOpacity = Math.max(0, Math.min(1, a.dimOpacity));
      return safe;
    });
  }

  function create(actions, ports) {
    const steps = publicActions(actions), durations = steps.map(estimate);
    const now = ports.now || (() => performance.now());
    const every = ports.every || (fn => setInterval(fn, 60)), cancel = ports.cancel || clearInterval;
    let status = "idle", index = -1, offset = 0, rate = 1, timer = null, clock = now(), epoch = 0;
    let media = null, reading = false, effectUntil = 0, caption = "", warning = "";
    const snapshot = () => ({ status, index, rate, caption, warning,
      elapsed: durations.slice(0, Math.max(0, index)).reduce((a,b)=>a+b,0) + offset,
      total: durations.reduce((a,b)=>a+b,0), actionId: steps[index]?.id || "", actions: steps.length });
    const changed = () => ports.onChange?.(snapshot());
    const clearMedia = () => { epoch++; media?.stop?.(); media = null; };
    const clearEffects = () => { effectUntil = 0; ports.clearEffects?.(); };
    function finish() {
      clearMedia(); status = "ended"; index = steps.length; offset = 0; caption = "讲解结束，可以继续探索。";
      if (timer !== null) cancel(timer); timer = null; clearEffects(); changed();
    }
    function visual(action, replay = false) {
      if (action.type === "spotlight" || action.type === "laser") effectUntil = now() + 5000;
      ports.action?.(action, { source: "authored_playback", replay });
    }
    function enter(next, seconds = 0) {
      clearMedia(); index = next; offset = seconds; reading = false; clock = now(); warning = "";
      while (index < steps.length && !timed.has(steps[index].type)) visual(steps[index++]);
      if (index >= steps.length) return finish();
      const action = steps[index], owner = epoch;
      caption = action.type === "discussion" ? `思考一下：${action.topic || action.prompt || ""}` : action.text || action.prompt || "";
      ports.action?.(action, { source: "authored_playback", replay: false });
      if ((action.type === "speech" && action.audioRef) || action.type === "play_video") {
        media = ports.media?.(action, {
          time(value) { if (owner !== epoch || !Number.isFinite(value)) return; offset = value; changed(); },
          duration(value) { if (owner !== epoch || !Number.isFinite(value) || value <= 0) return; durations[index] = value; changed(); },
          ended() { if (owner === epoch) enter(index + 1); },
          failed(reason) {
            if (owner !== epoch) return;
            clearMedia(); reading = true; clock = now();
            warning = reason || "音频暂不可用，已切换为文字讲解。";
            durations[index] = Math.max(offset + 2, estimate(action)); changed();
          }
        }, { offset: seconds, rate, paused: status !== "playing" });
        if (!media) reading = true;
      } else reading = true;
      changed();
    }
    function tick() {
      const t = now(), dt = Math.max(0, t - clock) / 1000; clock = t;
      if (status !== "playing") return;
      if (effectUntil && t >= effectUntil) clearEffects();
      if (reading && index >= 0 && index < steps.length) {
        offset += dt * rate;
        if (offset >= durations[index]) enter(index + 1); else changed();
      }
    }
    function play() {
      if (!steps.length) return false;
      if (status === "playing") return true;
      const start = status === "idle" || status === "ended";
      status = "playing"; clock = now();
      if (timer === null) timer = every(tick);
      if (start) enter(0); else media?.play?.();
      changed(); return true;
    }
    function pause() { if (status !== "playing") return; tick(); if (status !== "playing") return; status = "paused"; media?.pause?.(); changed(); }
    function stop() {
      clearMedia(); if (timer !== null) cancel(timer); timer = null;
      status = "idle"; index = -1; offset = 0; caption = ""; warning = ""; clearEffects(); changed();
    }
    function seek(ratio) {
      const total = durations.reduce((a,b)=>a+b,0);
      if (!steps.length || !total) return;
      const position = Math.min(1, Math.max(0, Number(ratio) || 0));
      let target = position * total, next = 0;
      while (next < steps.length && (durations[next] === 0 || target >= durations[next])) target -= durations[next++];
      // Fractional estimated speech durations can leave a tiny remainder in
      // the last segment. The end control must still include trailing actions.
      if(position===1){next=steps.length;target=0;}
      clearMedia(); clearEffects();
      // Reconstruct authored parameter state, never answers or student progress.
      // Transient annotations before the seek position are intentionally cleared.
      for (let i = 0; i < next; i++) if (["widget_setState", "widget_reveal"].includes(steps[i].type)) visual(steps[i], true);
      if (next === steps.length) return finish();
      for (let i = next - 1; i >= 0; i--) {
        if (timed.has(steps[i].type)) break;
        if (["laser", "spotlight", "widget_highlight"].includes(steps[i].type)) visual(steps[i], true);
      }
      if (status !== "playing") status = "paused";
      enter(next, target);
      if (timer === null) timer = every(tick);
    }
    return { play, pause, stop, seek, snapshot, setRate(value) {
      tick(); rate = Math.min(2, Math.max(.5, Number(value) || 1)); media?.setRate?.(rate); changed();
    }};
  }
  return Object.freeze({ publicActions, create });
});
