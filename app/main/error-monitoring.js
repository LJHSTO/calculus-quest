(function () {
  "use strict";
  const ownScript = document.currentScript;
  const base = new URL("../../", ownScript.src);
  const endpoint = new URL("api/monitoring/errors", base);
  const originalFetch = window.fetch.bind(window);
  let sent = 0;
  const seen = new Set();
  const routes = new Set(["/api/learning/quiz/submit", "/api/learning/assistant/chat",
    "/api/learning/proactive/check", "/api/learning/proactive/outcomes/submit",
    "/api/learning/notes", "/api/auth/login", "/api/auth/register"]);
  function report(data) {
    if (data.file) {
      try {
        const file = new URL(data.file, location.href);
        const relative = file.pathname.slice(base.pathname.length);
        data.file = file.origin === location.origin && file.pathname.startsWith(base.pathname)
          && /^(app\/main\/|admin\/)[a-z0-9-]+\.(js|css)$/.test(relative) ? relative : "";
      } catch { data.file = ""; }
    }
    if (data.route && !routes.has(data.route)) data.route = "/api/other";
    if (sent >= 10) return;
    const key = JSON.stringify(data);
    if (seen.has(key)) return;
    seen.add(key);
    sent++;
    originalFetch(endpoint, { method: "POST", credentials: "omit", keepalive: true,
      headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }).catch(() => {});
  }
  function routeOf(value) {
    try {
      const url = new URL(value instanceof Request ? value.url : value, location.href);
      if (url.origin !== location.origin || !url.pathname.startsWith(base.pathname)) return "";
      const route = "/" + url.pathname.slice(base.pathname.length);
      return route.startsWith("/api/") && !route.startsWith("/api/monitoring/") ? route : "";
    } catch { return ""; }
  }
  window.addEventListener("error", (event) => {
    if (event.target !== window) {
      const node = event.target;
      if (node?.tagName === "SCRIPT" || node?.tagName === "LINK") {
        report({ code: "resource_failed", file: node.src || node.href });
      }
      return;
    }
    report({ code: "browser_error", file: event.filename, line: event.lineno, column: event.colno });
  }, true);
  window.addEventListener("unhandledrejection", () => report({ code: "browser_rejection" }));
  window.fetch = async function (...args) {
    const route = routeOf(args[0]);
    try {
      const response = await originalFetch(...args);
      if (route && response.status >= 500) report({ code: "api_5xx", route, status: response.status });
      return response;
    } catch (error) {
      if (route && error?.name !== "AbortError") report({ code: "api_network", route });
      throw error;
    }
  };
})();
