(function installStateRequestCoalescing(global) {
  "use strict";
  const originalFetch = global.fetch.bind(global);
  const pending = new Map();
  let revision = 0;
  global.fetch = function fetchWithSharedState(input, options = {}) {
    if (typeof input !== "string") return originalFetch(input, options);
    const url = new URL(input, document.baseURI);
    const method = String(options.method || "GET").toUpperCase();
    if (url.origin !== global.location.origin) return originalFetch(input, options);
    if (!["GET", "HEAD"].includes(method)) {
      // Never reuse a state read across an operation that may change that state.
      revision += 1;
      return originalFetch(input, options).finally(() => { revision += 1; });
    }
    if (!url.pathname.endsWith("/api/learning/proactive/state")
      || method !== "GET" || options.signal) return originalFetch(input, options);
    const headers = new Headers(options.headers);
    const key = JSON.stringify([url.href, [...headers.entries()], options.credentials || "same-origin"]);
    let entry = pending.get(key);
    if (entry && entry.revision !== revision) {
      // Serialize a fresh read after writes; repeated syncs share the queued read.
      entry.refresh ||= entry.promise.catch(() => {}).then(() => global.fetch(input, options));
      return entry.refresh.then(response => response.clone());
    }
    if (!entry) {
      entry = { revision, promise: null, refresh: null };
      const controller = new AbortController();
      const timeout = global.setTimeout(() => controller.abort(), 15000);
      entry.promise = originalFetch(input, { ...options, signal: controller.signal }).then(async response => {
        // Keep sharing until the full body arrives, not only the response headers.
        await response.clone().arrayBuffer();
        return response;
      }).finally(() => {
        global.clearTimeout(timeout);
        if (pending.get(key) === entry) pending.delete(key);
      });
      pending.set(key, entry);
    }
    return entry.promise.then(response => response.clone());
  };
})(window);
