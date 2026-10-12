const assert = require("node:assert/strict");
const fs = require("node:fs");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => resolve(address.port));
    });
  });
}

async function waitForHealth(baseUrl, child, logs) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (child.exitCode !== null) {
      throw new Error(`server exited early (${child.exitCode})\n${logs.join("")}`);
    }
    try {
      const response = await fetch(baseUrl + "/api/health");
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`server health timeout\n${logs.join("")}`);
}

async function stopChild(child) {
  if (!child || child.exitCode !== null) return;
  child.kill("SIGTERM");
  await Promise.race([
    new Promise((resolve) => child.once("exit", resolve)),
    new Promise((resolve) => setTimeout(resolve, 4000))
  ]);
  if (child.exitCode === null) child.kill("SIGKILL");
}

async function main() {
  const root = path.resolve(__dirname, "..");
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cq-static-security-"));
  const dbPath = path.join(tmpDir, "static-security.db");
  const port = await freePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const adminToken = "static-security-admin-token";
  const logs = [];
  let child;

  try {
    child = spawn(process.execPath, ["server.js", String(port)], {
      cwd: root,
      env: {
        ...process.env,
        DB_PATH: dbPath,
        HOST: "127.0.0.1",
        LLM_PROVIDER: "mock",
        NODE_ENV: "development",
        ADMIN_TOKEN: adminToken,
        LOCAL_ADMIN_AUTH_BYPASS: "false"
      },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true
    });
    child.stdout.on("data", (chunk) => logs.push(chunk.toString()));
    child.stderr.on("data", (chunk) => logs.push(chunk.toString()));
    await waitForHealth(baseUrl, child, logs);

    for (const pathname of [
      "/",
      "/styles.css",
      "/app/main/core.js",
      "/assets/openmaic-classroom/frame.html",
      "/assets/openmaic-classroom/renderer.js?v=64621ad-016-v1",
      "/assets/openmaic-classroom/renderer.css?v=64621ad-016-v1",
      "/admin/admin.js",
      "/lib/katex.min.js",
      "/lib/question-math.js",
      "/lib/chart.umd.min.js",
      "/lib/interaction-policy.js",
      "/lib/active-time-policy.js",
      "/data/multi-scene-learning-route.json",
      "/data/knowledge-graph.json",
      "/api/course/multi-scene-learning-route"
    ]) {
      const response = await fetch(baseUrl + pathname);
      assert.equal(response.status, 200, `${pathname} must remain public`);
    }

    for (const pathname of [
      "/.env",
      "/.env.example",
      "/.gitignore",
      "/server.js",
      "/db.js",
      "/lib/proactive-outcomes/v14-c3.js",
      "/lib/courseware-font-assets.js",
      "/lib/learning-runtime.js",
      "/assets/learning-runtime.json",
      "/assets/courseware-modules/manifest.json",
      "/lib/proactive-outcomes/archive/v14-c3-v2.js",
      "/ops/build-outcome-figures-r3.js",
      "/resources/assessment/v14-c3-r3/unlisted.svg",
      "/package.json",
      "/package-lock.json",
      "/app/classroom-renderer/entry.jsx",
      "/app/classroom-renderer/frame.html",
      "/assets/openmaic-classroom/provenance.json",
      "/docs/production-release.md"
    ]) {
      const response = await fetch(baseUrl + pathname);
      assert.ok(
        response.status === 403 || response.status === 404,
        `${pathname} must not be downloadable (received ${response.status})`
      );
    }
    const outcomeFigures = require("../lib/proactive-outcomes/v14-c3")
      .forVersion("v14-c3-outcomes-v3")
      .publicStage("representation_transfer").items.map((item) => item.figure.src);
    for (const file of outcomeFigures) {
      const response = await fetch(`${baseUrl}/${file}`);
      assert.equal(response.status, 200);
      assert.match(response.headers.get("content-type"), /image\/svg\+xml/);
    }
    const renderer = await fetch(baseUrl + "/assets/openmaic-classroom/renderer.js?v=64621ad-016-v1", {
      headers: { "Accept-Encoding": "gzip" }
    });
    assert.equal(renderer.headers.get("content-encoding"), "gzip");
    assert.match(renderer.headers.get("cache-control"), /immutable/);
    const rendererBytes = await renderer.arrayBuffer();
    assert.ok(rendererBytes.byteLength < 3 * 1024 * 1024, "Optional code grammars must not inflate the initial renderer.");
    const chapter = require("../data/multi-scene-learning-route.json").chapters.find(item => item.id === "V14-C1");
    const candidate = chapter.modules[0].knowledgePoints[0].resourceCandidates.find(item => item.type === "visualization3d");
    const largeCoursewarePath = "/" + ["resources", ...candidate.root.split("/"), ...candidate.file.split("/")]
      .map(encodeURIComponent).join("/");
    const largeCourseware = await fetch(baseUrl + largeCoursewarePath, { headers: { "Accept-Encoding": "gzip" } });
    assert.equal(largeCourseware.headers.get("content-encoding"), "gzip", "Large interactive HTML must be compressed.");
    const largeCoursewareText = await largeCourseware.text();
    assert.ok(largeCoursewareText.includes("data-cq-context-bridge"), "Compression must preserve the learning bridge.");
    assert.ok(!largeCoursewareText.includes("data:font/woff2;base64,"), "Courseware must reuse existing cacheable math fonts.");
    assert.ok(largeCoursewareText.includes("../../../../lib/fonts/KaTeX_"));
    assert.ok(!largeCoursewareText.includes("data:text/javascript;base64,"), "Shared 3D modules must not be downloaded inside every lesson.");
    const coursewareModules = require("../assets/courseware-modules/manifest.json");
    for (const module of coursewareModules) {
      const response = await fetch(baseUrl + "/assets/courseware-modules/" + module.file);
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("access-control-allow-origin"), "*");
      assert.match(response.headers.get("cache-control"), /immutable/);
      assert.equal(response.headers.get("content-encoding"), "gzip");
    }
    const compressedRoute = await fetch(baseUrl + "/api/course/multi-scene-learning-route", {
      headers: { "Accept-Encoding": "gzip" }
    });
    assert.equal(compressedRoute.headers.get("content-encoding"), "gzip");
    assert.ok(!(await compressedRoute.text()).includes('"answer":'));
    const noGzip = await fetch(baseUrl + "/styles.css", { headers: { "Accept-Encoding": "gzip;q=0" } });
    assert.equal(noGzip.headers.get("content-encoding"), null);
    const bundledHome = await (await fetch(baseUrl + "/")).text();
    assert.ok(bundledHome.includes("assets/learning-runtime.js?v="));
    assert.equal([...bundledHome.matchAll(/<script src=/g)].length, 2);
    const runtime = await fetch(baseUrl + "/assets/learning-runtime.js?v=test", {
      headers: { "Accept-Encoding": "gzip" }
    });
    assert.equal(runtime.headers.get("content-encoding"), "gzip");
    assert.ok((await runtime.text()).includes("function renderAll"));
    assert.equal([...bundledHome.matchAll(/<link rel="stylesheet"/g)].length, 1);
    const bundledStyles = await fetch(baseUrl + "/assets/learning-runtime.css?v=test", {
      headers: { "Accept-Encoding": "gzip" }
    });
    assert.equal(bundledStyles.status, 200);
    assert.match(bundledStyles.headers.get("content-type"), /text\/css/);
    assert.equal(bundledStyles.headers.get("content-encoding"), "gzip");
    assert.match(bundledStyles.headers.get("cache-control"), /immutable/);
    assert.match(await bundledStyles.text(), /\.\.\/lib\/fonts\/KaTeX_Main-Regular\.woff2/);
    const uncompressedRenderer = await fetch(baseUrl + "/assets/openmaic-classroom/renderer.js", {
      method: "HEAD", headers: { "Accept-Encoding": "gzip;q=0" }
    });
    assert.equal(uncompressedRenderer.headers.get("content-encoding"), null);
    const font = await fetch(baseUrl + "/lib/fonts/KaTeX_Main-Regular.woff2");
    assert.equal(font.status, 200);
    assert.equal(font.headers.get("access-control-allow-origin"), "*");

    const manifest = await fetch(
      baseUrl + "/resources/open-maic/GH-01-%E5%87%BD%E6%95%B0%E3%80%81%E5%9D%90%E6%A0%87%E4%B8%8E%E5%9B%BE%E5%83%8F%E8%AF%BB%E6%B3%95%E5%85%A5%E9%97%A8/manifest.json"
    );
    assert.equal(manifest.status, 410);

    const wrongMethod = await fetch(baseUrl + "/styles.css", { method: "POST" });
    assert.equal(wrongMethod.status, 405);

    for (const pathname of [
      "/data/multi-scene-learning-route.json",
      "/api/course/multi-scene-learning-route"
    ]) {
      const response = await fetch(baseUrl + pathname);
      assert.equal(response.status, 200, `${pathname} must remain public`);
      const text = await response.text();
      assert.ok(!text.includes('"answer":'), `${pathname} must not leak quiz answers`);
      assert.ok(!text.includes('"analysis":'), `${pathname} must not leak quiz analysis`);
    }

    const publicRouteHead = await fetch(
      baseUrl + "/data/multi-scene-learning-route.json",
      { method: "HEAD" }
    );
    assert.equal(publicRouteHead.status, 200);
    assert.match(publicRouteHead.headers.get("content-type") || "", /application\/json/);

    const flowRouteAnonymous = await fetch(baseUrl + "/api/course/flow-test-route");
    assert.equal(flowRouteAnonymous.status, 403, "flow-test route must require the admin token");
    const flowRouteAdmin = await fetch(baseUrl + "/api/course/flow-test-route", {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert.equal(flowRouteAdmin.status, 200, "flow-test route must accept the admin token");
    const flowRouteText = await flowRouteAdmin.text();
    assert.ok(flowRouteText.includes('"answer":'), "admin flow-test route keeps the answer key");

    console.log("static security tests passed");
  } finally {
    await stopChild(child);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
