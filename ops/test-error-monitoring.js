const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");
const { createMonitor } = require("../lib/error-monitoring");

async function main() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "cq-monitor-"));
  const filename = path.join(directory, "errors.json");
  const envelopes = [];
  const receiver = http.createServer((req, res) => {
    let data = "";
    req.on("data", (chunk) => { data += chunk; });
    req.on("end", () => { envelopes.push(data); res.writeHead(200); res.end("{}"); });
  });
  await new Promise((resolve) => receiver.listen(0, "127.0.0.1", resolve));
  try {
    const monitor = createMonitor({ filename, release: "monitor-test",
      dsn: `http://synthetic@127.0.0.1:${receiver.address().port}/1` });
    const first = monitor.capture({
      code: "browser_error", file: "https://example.invalid/app/main/core.js?token=SECRET",
      line: 10, column: 2, message: "学生答案PRIVATE", stack: "PRIVATE", user: "PRIVATE",
      request: { cookies: "SECRET" }, extra: { prompt: "PRIVATE" }
    }, "browser");
    assert.match(first, /^[a-f0-9]{32}$/);
    monitor.capture({ code: "browser_error", file: "app/main/core.js", line: 10, column: 2 }, "browser");
    assert.equal(monitor.status().rows[0].count, 2);
    assert.equal(await monitor.flush(), true);
    assert.equal(envelopes.length, 1, "真实SDK应向本地接收器发送脱敏事件");
    assert.doesNotMatch(envelopes[0], /SECRET|PRIVATE|cookies|request|student|prompt|user|breadcrumbs/);
    assert.match(envelopes[0], /app\/main\/core.js/);
    assert.doesNotMatch(fs.readFileSync(filename, "utf8"), /SECRET|PRIVATE/);
    assert.equal(createMonitor({ filename }).status().rows[0].count, 2);
    monitor.captureException({ stack: "Error: PRIVATE\n    at task (D:/private/app/lib/agents/grading.js:44:3)" });
    assert.equal(monitor.status().rows[0].file, "lib/agents/grading.js");
    assert.equal(monitor.status().rows[0].line, 44);
    assert.doesNotMatch(fs.readFileSync(filename, "utf8"), /PRIVATE|D:\/private/);
    for (let i = 0; i < 60; i++) monitor.capture({ code: "server_exception" }, "browser");
    assert.ok(monitor.status().dropped > 0);
    assert.ok(monitor.capture({ code: "server_exception" }), "浏览器洪泛不能耗尽服务端错误预算");
    await monitor.flush();
    const disabled = createMonitor({ enabled: false });
    assert.equal(disabled.capture({ code: "monitor_test" }), null);
    const blocked = createMonitor({ filename: path.join(filename, "cannot-write.json") });
    assert.ok(blocked.capture({ code: "monitor_test" }));
    assert.equal(blocked.status().storageError, true, "监控磁盘错误不能抛入业务逻辑");

    // The slow logout path was undiagnosable: its route was not whitelisted and
    // every timeout was dropped. Lock both down.
    const scope = createMonitor({ filename: path.join(path.dirname(filename), "scope.json") });
    // status().rows is newest-first.
    scope.capture({ code: "api_timeout", route: "/api/auth/logout" }, "browser");
    const timeoutRow = scope.status().rows[0];
    assert.equal(timeoutRow.code, "api_timeout", "api_timeout must survive normalisation");
    assert.equal(timeoutRow.route, "/api/auth/logout", "logout must be attributable, not /api/other");
    scope.capture({ code: "api_network", route: "/api/learning/snapshot" }, "browser");
    assert.equal(scope.status().rows[0].route, "/api/learning/snapshot");
    scope.capture({ code: "api_network", route: "/api/not/whitelisted" }, "browser");
    assert.equal(scope.status().rows[0].route, "/api/other", "unknown routes still collapse");
    scope.capture({ code: "browser_rejection", detail: `boom\n${"x".repeat(400)}` }, "browser");
    const rejectionRow = scope.status().rows[0];
    assert.ok(rejectionRow.detail.startsWith("boom "), "rejection detail must be kept");
    assert.ok(rejectionRow.detail.length <= 160, "rejection detail must stay bounded");
    assert.doesNotMatch(rejectionRow.detail, /\n/, "rejection detail must stay single-line");

    console.log("错误监控通过：真实Sentry SDK本地接收、敏感信息剔除、重复合并、重启恢复、分来源限流、关闭和磁盘故障降级、超时与登出可归因。");
  } finally { await new Promise((resolve) => receiver.close(resolve)); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
