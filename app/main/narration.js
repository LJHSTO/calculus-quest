// Narration queue, playback timeline, and fullscreen helpers.
function playNarrationQueue() {
  const unit = getUnit();
  if (activeNarration && activeNarration.unitId === unit.id) {
    if (activeNarration.status === "ended") {
      setNarrationSegment(0, 0, true);
      return;
    }
    activeNarration.status = "playing";
    analyticsTrack("narration_resume", { source: "narration", data: { unitId: unit.id, segmentIndex: activeNarration.index } });
    activeNarration.audio.play().catch(() => {
      activeNarration.status = "paused";
      syncNarrationUi();
    });
    syncNarrationUi();
    return;
  }

  const sources = visibleNarrationSources();
  if (!sources.length) return;
  createNarrationQueue(sources, unit.id, true);
}

function stopNarrationQueue() {
  if (!activeNarration) return;
  const unitId = activeNarration.unitId;
  analyticsTrack("narration_stop", { source: "narration", data: { unitId, segmentIndex: activeNarration.index } });
  activeNarration.audio.pause();
  activeNarration.audio.removeAttribute("src");
  activeNarration.audio.load();
  activeNarration = null;
  resetNarrationUi(unitId);
}

function pauseNarrationQueue() {
  if (!activeNarration) return;
  activeNarration.status = "paused";
  analyticsTrack("narration_pause", { source: "narration", data: { unitId: activeNarration.unitId, segmentIndex: activeNarration.index } });
  activeNarration.audio.pause();
  syncNarrationUi();
}

function visibleNarrationSources() {
  return Array.from(document.querySelectorAll(".coach-line[data-audio-src]")).map((node) => node.dataset.audioSrc);
}

function toggleNarrationCollapse() {
  state.narrationCollapsed = !state.narrationCollapsed;
  saveState();
  document.querySelectorAll("[data-coach-strip]").forEach((strip) => {
    strip.classList.toggle("collapsed", Boolean(state.narrationCollapsed));
    const content = strip.querySelector("[data-narration-content]");
    if (content) content.hidden = Boolean(state.narrationCollapsed);
    const button = strip.querySelector("[data-toggle-narration]");
    if (button) {
      button.textContent = state.narrationCollapsed ? "展开旁白" : "收起旁白";
      button.setAttribute("aria-expanded", state.narrationCollapsed ? "false" : "true");
    }
  });
  analyticsTrack("narration_toggle", {
    source: "narration",
    data: { collapsed: Boolean(state.narrationCollapsed), unitId: getUnit()?.id || "" }
  });
}

function createNarrationQueue(sources, unitId, shouldPlay) {
  if (activeNarration && activeNarration.unitId !== unitId) stopNarrationQueue();

  const audio = new Audio();
  activeNarration = {
    audio,
    sources,
    unitId,
    index: 0,
    status: shouldPlay ? "playing" : "paused",
    durations: sources.map((source) => narrationDurationCache.get(source) || 0)
  };

  audio.addEventListener("loadedmetadata", () => {
    if (!activeNarration || activeNarration.audio !== audio) return;
    rememberNarrationDuration(activeNarration.sources[activeNarration.index], activeNarration.index, audio.duration);
    syncNarrationUi();
  });
  audio.addEventListener("timeupdate", syncNarrationUi);
  audio.addEventListener("play", () => {
    if (!activeNarration || activeNarration.audio !== audio) return;
    activeNarration.status = "playing";
    analyticsTrack("narration_segment_play", {
      source: "narration",
      data: { unitId: activeNarration.unitId, segmentIndex: activeNarration.index, total: activeNarration.sources.length }
    });
    syncNarrationUi();
  });
  audio.addEventListener("pause", () => {
    if (!activeNarration || activeNarration.audio !== audio || activeNarration.status === "ended") return;
    activeNarration.status = "paused";
    syncNarrationUi();
  });
  audio.addEventListener("ended", advanceNarration);

  preloadNarrationDurations(sources, activeNarration);
  setNarrationSegment(0, 0, shouldPlay);
}

function preloadNarrationDurations(sources, queue) {
  sources.forEach((source, index) => {
    if (narrationDurationCache.has(source)) return;
    const probe = new Audio();
    probe.preload = "metadata";
    probe.addEventListener("loadedmetadata", () => {
      rememberNarrationDuration(source, index, probe.duration);
      if (activeNarration === queue) syncNarrationUi();
    });
    probe.src = source;
  });
}

function rememberNarrationDuration(source, index, duration) {
  if (!Number.isFinite(duration) || duration <= 0) return;
  narrationDurationCache.set(source, duration);
  if (activeNarration?.sources[index] === source) activeNarration.durations[index] = duration;
}

function advanceNarration() {
  if (!activeNarration) return;
  analyticsTrack("narration_segment_end", {
    source: "narration",
    data: { unitId: activeNarration.unitId, segmentIndex: activeNarration.index, total: activeNarration.sources.length }
  });
  const nextIndex = activeNarration.index + 1;
  if (nextIndex >= activeNarration.sources.length) {
    activeNarration.status = "ended";
    analyticsTrack("narration_complete", {
      source: "narration",
      data: { unitId: activeNarration.unitId, total: activeNarration.sources.length }
    });
    syncNarrationUi();
    return;
  }
  setNarrationSegment(nextIndex, 0, true);
}

function seekNarration(ratio) {
  if (!activeNarration) {
    const unit = getUnit();
    const sources = visibleNarrationSources();
    if (!sources.length) return;
    createNarrationQueue(sources, unit.id, false);
  }

  const queue = activeNarration;
  const durations = narrationTimelineDurations(queue);
  const total = durations.reduce((sum, duration) => sum + duration, 0);
  if (!total) return;

  let target = Math.max(0, Math.min(1, ratio)) * total;
  let targetIndex = 0;
  while (targetIndex < durations.length - 1 && target > durations[targetIndex]) {
    target -= durations[targetIndex];
    targetIndex += 1;
  }
  setNarrationSegment(targetIndex, target, queue.status === "playing");
  analyticsTrack("narration_seek", {
    source: "narration",
    data: {
      unitId: queue.unitId,
      ratio: Math.max(0, Math.min(1, ratio)),
      segmentIndex: targetIndex,
      targetSeconds: Math.round(target)
    }
  });
}

function setNarrationSegment(index, seconds, shouldPlay) {
  if (!activeNarration) return;
  const queue = activeNarration;
  const nextIndex = Math.max(0, Math.min(index, queue.sources.length - 1));
  const source = queue.sources[nextIndex];
  queue.index = nextIndex;
  queue.status = shouldPlay ? "playing" : queue.status === "ended" ? "paused" : queue.status;

  const applyTime = () => {
    const duration = Number.isFinite(queue.audio.duration) ? queue.audio.duration : queue.durations[nextIndex] || 0;
    const safeTime = duration ? Math.min(Math.max(0, seconds), Math.max(0, duration - 0.05)) : Math.max(0, seconds);
    try {
      queue.audio.currentTime = safeTime;
    } catch {
      // Some browsers reject currentTime before metadata is ready; the next timeupdate will recover.
    }
    if (shouldPlay) {
      queue.audio.play().catch(() => {
        if (!activeNarration) return;
        activeNarration.status = "paused";
        syncNarrationUi();
      });
    } else {
      syncNarrationUi();
    }
  };

  if (queue.currentSource !== source) {
    queue.currentSource = source;
    queue.audio.src = source;
    queue.audio.addEventListener("loadedmetadata", applyTime, { once: true });
    queue.audio.load();
  } else {
    applyTime();
  }
  syncNarrationUi();
}

function narrationTimelineDurations(queue) {
  return queue.sources.map((source, index) => {
    const cached = queue.durations[index] || narrationDurationCache.get(source);
    if (Number.isFinite(cached) && cached > 0) return cached;
    if (index === queue.index && Number.isFinite(queue.audio.duration) && queue.audio.duration > 0) return queue.audio.duration;
    return 30;
  });
}

function narrationElapsed(queue) {
  const durations = narrationTimelineDurations(queue);
  const before = durations.slice(0, queue.index).reduce((sum, duration) => sum + duration, 0);
  return before + (Number.isFinite(queue.audio.currentTime) ? queue.audio.currentTime : 0);
}

function getNarrationToolbar(unitId = activeNarration?.unitId) {
  return Array.from(document.querySelectorAll(".coach-toolbar[data-narration-unit]")).find(
    (node) => node.dataset.narrationUnit === unitId
  );
}

function syncNarrationUi() {
  if (!activeNarration) return;
  const toolbar = getNarrationToolbar();
  if (!toolbar) return;
  const durations = narrationTimelineDurations(activeNarration);
  const total = durations.reduce((sum, duration) => sum + duration, 0);
  const elapsed = activeNarration.status === "ended" ? total : narrationElapsed(activeNarration);
  const progress = total ? Math.min(1000, Math.round((elapsed / total) * 1000)) : 0;
  const range = toolbar.querySelector("[data-narration-seek]");
  const time = toolbar.querySelector("[data-narration-time]");
  const segment = toolbar.querySelector("[data-narration-segment]");
  const play = toolbar.querySelector("[data-play-narration]");
  const pause = toolbar.querySelector("[data-pause-narration]");

  if (range) range.value = progress;
  if (time) time.textContent = `${formatDuration(elapsed)} / ${total ? formatDuration(total) : "--:--"}`;
  if (segment) segment.textContent = `${Math.min(activeNarration.index + 1, activeNarration.sources.length)}/${activeNarration.sources.length} 段`;
  if (play) play.textContent = activeNarration.status === "playing" ? "播放中" : activeNarration.status === "ended" ? "重播全部" : "继续播放";
  if (pause) pause.disabled = activeNarration.status !== "playing";
}

function resetNarrationUi(unitId) {
  const toolbar = getNarrationToolbar(unitId);
  if (!toolbar) return;
  const range = toolbar.querySelector("[data-narration-seek]");
  const time = toolbar.querySelector("[data-narration-time]");
  const segment = toolbar.querySelector("[data-narration-segment]");
  const play = toolbar.querySelector("[data-play-narration]");
  const pause = toolbar.querySelector("[data-pause-narration]");
  const total = toolbar.dataset.narrationTotal || "";
  if (range) range.value = 0;
  if (time) time.textContent = "00:00 / --:--";
  if (segment) segment.textContent = `0/${total || "0"} 段`;
  if (play) play.textContent = "播放全部";
  if (pause) pause.disabled = true;
}

function formatDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return "--:--";
  const total = Math.round(seconds);
  const minutes = String(Math.floor(total / 60)).padStart(2, "0");
  const rest = String(total % 60).padStart(2, "0");
  return `${minutes}:${rest}`;
}

async function toggleFullscreenLearning() {
  const shell = document.querySelector(".learning-shell");
  if (!shell) return;
  try {
    document.fullscreenElement === shell ? await document.exitFullscreen() : await shell.requestFullscreen();
  } finally {
    updateFullscreenButton();
    syncNarrationUi();
  }
}

async function toggleResourceFullscreen(shell) {
  if (!shell || !document.fullscreenEnabled) return;
  try {
    if (document.fullscreenElement === shell) {
      await document.exitFullscreen();
      return;
    }
    if (document.fullscreenElement) await document.exitFullscreen();
    await shell.requestFullscreen();
  } finally {
    updateFullscreenButton();
    updateResourceFullscreenButtons();
    syncNarrationUi();
  }
}

function updateFullscreenButton() {
  if (!els.fullscreenPlayer) return;
  const enabled = Boolean(document.fullscreenEnabled);
  els.fullscreenPlayer.disabled = !enabled;
  els.fullscreenPlayer.textContent = document.fullscreenElement ? "退出全屏" : "全屏";
  els.fullscreenPlayer.setAttribute("aria-label", document.fullscreenElement ? "退出全屏学习" : "进入全屏学习");
}

function updateResourceFullscreenButtons() {
  document.querySelectorAll("[data-resource-shell]").forEach((shell) => {
    const button = shell.querySelector("[data-resource-fullscreen]");
    if (!button) return;
    button.disabled = !document.fullscreenEnabled;
    button.textContent = document.fullscreenElement === shell ? "退出全屏" : "全屏";
  });
}
