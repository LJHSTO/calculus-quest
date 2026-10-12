const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const net = require("node:net");
const { spawn } = require("node:child_process");
const { chromium } = require("playwright-core");

async function main() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "cq-monitor-browser-"));
  const port = await new Promise((resolve) => {
    const socket = net.createServer();
    socket.listen(0, "127.0.0.1", () => { const p = socket.address().port; socket.close(() => resolve(p)); });
  });
  const root = path.resolve(__dirname, ".."), base = `http://127.0.0.1:${port}/test`;
  const server = spawn(process.execPath, ["server.js", String(port)], {
    cwd: root, windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, NODE_ENV: "test", HOST: "127.0.0.1", BASE_PATH: "/test",
      DB_PATH: path.join(directory, "test.db"), ERROR_MONITORING_PATH: path.join(directory, "errors.json"),
      ERROR_MONITORING_ENABLED: "true", SENTRY_DSN: "",
      LLM_PROVIDER: "mock", GRADING_LLM_PROVIDER: "mock", LOCAL_ADMIN_AUTH_BYPASS: "false",
      ADMIN_TOKEN: "monitor-admin-test", PROACTIVE_POLICY_MODE: "off", RATE_LIMIT_MAX: "5000" }
  });
  let logs = "", browser;
  server.stdout.on("data", (chunk) => { logs += chunk; });
  server.stderr.on("data", (chunk) => { logs += chunk; });
  async function records() {
    const r = await fetch(`${base}/api/admin/monitoring`, { headers: { Authorization: "Bearer monitor-admin-test" } });
    assert.equal(r.status, 200);
    return (await r.json()).data.rows;
  }
  try {
    let healthy = false;
    for (let i = 0; i < 100; i++) {
      try { healthy = (await fetch(`${base}/api/health`)).ok; } catch {}
      if (healthy) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.ok(healthy, logs);
    assert.equal((await fetch(`${base}/api/admin/monitoring`)).status, 403);
    assert.equal((await fetch(`${base}/data/error-monitoring.json`)).status, 403);
    assert.equal((await fetch(`${base}/lib/error-monitoring.js`)).status, 403);
    const executablePath = ["C:/Program Files/Google/Chrome/Application/chrome.exe",
      "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"].find((file) => fs.existsSync(file));
    browser = await chromium.launch({ executablePath, headless: true });
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
    const reports = [];
    page.on("request", (request) => {
      if (request.url().endsWith("/api/monitoring/errors")) reports.push(request.postData());
    });
    await page.goto(`${base}/`);
    await page.locator("#app-loader").waitFor({ state: "hidden" });
    assert.equal(await page.locator(".workspace-companion-mark").count(), 0);
    assert.equal(await page.locator("#workspace-tab-profile").textContent(), "画像");
    await page.evaluate(() => {
      dispatchEvent(new ErrorEvent("error", { message: "PRIVATE-ANSWER",
        filename: location.origin + "/test/app/main/core.js?token=SECRET", lineno: 10, colno: 2 }));
      dispatchEvent(new PromiseRejectionEvent("unhandledrejection", {
        promise: Promise.resolve(), reason: "PRIVATE-CHAT"
      }));
    });
    await page.route("**/api/learning/quiz/submit**", (route) => route.fulfill({ status: 503, body: "{}" }));
    await page.evaluate(() => fetch("api/learning/quiz/submit?token=SECRET", {
      method: "POST", body: JSON.stringify({ answer: "PRIVATE-ANSWER" })
    }));
    for (let i = 0; i < 40 && (await records()).length < 3; i++) await page.waitForTimeout(100);
    assert.ok((await records()).some((row) => row.code === "api_5xx"));
    assert.doesNotMatch(JSON.stringify(reports), /SECRET|PRIVATE/);
    assert.doesNotMatch(JSON.stringify(await records()), /SECRET|PRIVATE/);
    const admin = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
    await admin.goto(`${base}/admin.html`);
    await admin.locator("#admin-token-input").fill("monitor-admin-test");
    await admin.locator("#login-btn").click();
    await admin.locator("#login-gate").waitFor({ state: "hidden" });
    await admin.locator('[data-tab="monitoring"]').click();
    await admin.locator("#monitoring-table tbody tr").first().waitFor();
    await admin.locator("#monitoring-test").click();
    await admin.waitForFunction(() => document.getElementById("monitoring-status").textContent.includes("测试事件"));
    assert.match(await admin.locator("#monitoring-table").innerText(), /监控测试/);
    const output = path.join(root, "output", "playwright");
    fs.mkdirSync(output, { recursive: true });
    await admin.screenshot({ path: path.join(output, "错误监控-管理后台.png") });
    assert.ok(await admin.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    console.log("监控浏览器回归通过：子路径、画像标签、移除字标、页面/异步/API错误、请求脱敏、管理员鉴权、测试按钮和桌面布局。");
  } finally {
    await browser?.close();
    if (server.exitCode === null) {
      const exit = new Promise((resolve) => server.once("exit", resolve));
      server.kill();
      await exit;
    }
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
