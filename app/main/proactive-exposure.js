(function initProactiveExposure(global) {
  "use strict";

  // This is an exposure measurement, not evidence that the learner read or
  // understood the help. Explicit clicks are recorded separately by the host.
  function createMonitor({ onQualified, fraction = 0.5, durationMs = 1000 } = {}) {
    const targets = new Map();
    const qualifiedKeys = new Set();
    let timer = null;
    let disposed = false;
    const now = () => global.performance.now();
    const reset = entry => { entry.startedAt = null; };

    function visibleFraction(element) {
      if (!element.isConnected || document.hidden || element.closest('[hidden], [inert], [aria-hidden="true"]')) return 0;
      let rect = element.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return 0;
      const area = rect.width * rect.height;
      let left = Math.max(0, rect.left), right = Math.min(global.innerWidth, rect.right);
      let top = Math.max(0, rect.top), bottom = Math.min(global.innerHeight, rect.bottom);
      for (let node = element; node; node = node.parentElement) {
        const style = global.getComputedStyle(node);
        if (style.display === "none" || style.visibility === "hidden" || style.visibility === "collapse"
          || Number(style.opacity) === 0 || style.contentVisibility === "hidden") return 0;
        // Root/body overflow is propagated to the viewport in this document.
        // Their content bounding rect can be shorter than viewport-positioned
        // workspaces, so only actual element scrollports clip here; IO remains
        // the authoritative viewport intersection measurement.
        if (node !== element && node !== document.body && node !== document.documentElement) {
          rect = node.getBoundingClientRect();
          if (/(auto|scroll|hidden|clip)/.test(style.overflowX)) {
            left = Math.max(left, rect.left + node.clientLeft);
            right = Math.min(right, rect.left + node.clientLeft + node.clientWidth);
          }
          if (/(auto|scroll|hidden|clip)/.test(style.overflowY)) {
            top = Math.max(top, rect.top + node.clientTop);
            bottom = Math.min(bottom, rect.top + node.clientTop + node.clientHeight);
          }
        }
      }
      return Math.max(0, right - left) * Math.max(0, bottom - top) / area;
    }

    function check() {
      if (disposed) return;
      const timestamp = now();
      for (const [element, entry] of targets) {
        if (!element.isConnected) { unwatch(element); continue; }
        let valid = false;
        try { valid = entry.valid?.() !== false; } catch {}
        const ratio = Math.min(entry.intersectionRatio, visibleFraction(element));
        if (!valid || ratio + Number.EPSILON < fraction || document.hidden) {
          reset(entry);
          continue;
        }
        if (qualifiedKeys.has(entry.key)) continue;
        if (entry.startedAt === null) entry.startedAt = timestamp;
        const elapsed = timestamp - entry.startedAt;
        if (elapsed < durationMs) continue;
        // Mark first, because the receipt may synchronously re-render its host.
        qualifiedKeys.add(entry.key);
        onQualified?.({ ...entry.metadata, key: entry.key, fraction: ratio,
          visibleDurationMs: elapsed, minimumFraction: fraction,
          minimumDurationMs: durationMs, exposureSource: "qualified_visible" });
      }
    }

    const observer = new global.IntersectionObserver(entries => {
      entries.forEach(observation => {
        const entry = targets.get(observation.target);
        if (!entry) return;
        entry.intersectionRatio = observation.isIntersecting ? observation.intersectionRatio : 0;
        if (entry.intersectionRatio + Number.EPSILON < fraction) reset(entry);
      });
      check();
    }, { threshold: [0, fraction, 1] });
    const mutation = new global.MutationObserver(check);
    mutation.observe(document.documentElement, { attributes: true, subtree: true,
      attributeFilter: ["class", "style", "hidden", "inert", "aria-hidden"] });

    function watch(element, { key, valid, metadata = {} } = {}) {
      if (!element || !key || disposed) return;
      const existing = targets.get(element);
      if (existing?.key === key) {
        existing.valid = valid;
        existing.metadata = metadata;
        check();
        return;
      }
      if (existing) unwatch(element);
      targets.set(element, { key, valid, metadata, intersectionRatio: 0, startedAt: null });
      observer.observe(element);
      if (timer === null) timer = global.setInterval(check, 50);
    }

    function unwatch(element) {
      observer.unobserve(element);
      targets.delete(element);
      if (!targets.size && timer !== null) { global.clearInterval(timer); timer = null; }
    }

    function clear({ forget = false } = {}) {
      for (const element of targets.keys()) observer.unobserve(element);
      targets.clear();
      if (timer !== null) { global.clearInterval(timer); timer = null; }
      if (forget) qualifiedKeys.clear();
    }

    function visibilityChanged() {
      if (document.hidden) targets.forEach(reset);
      check();
    }
    document.addEventListener("visibilitychange", visibilityChanged);
    global.addEventListener("scroll", check, true);
    global.addEventListener("resize", check);
    return Object.freeze({ watch, unwatch, clear, refresh: check,
      dispose() {
        clear({ forget: true }); disposed = true;
        observer.disconnect(); mutation.disconnect();
        document.removeEventListener("visibilitychange", visibilityChanged);
        global.removeEventListener("scroll", check, true);
        global.removeEventListener("resize", check);
      }
    });
  }
  global.ProactiveExposure = Object.freeze({ createMonitor });
})(window);
