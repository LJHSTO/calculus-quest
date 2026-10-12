"use strict";

const assert = require("node:assert/strict");
const http = require("node:http");
const https = require("node:https");
const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");
const crypto = require("node:crypto");

const base = process.env.LEARNING_BASE_URL;
assert.ok(base, "Set LEARNING_BASE_URL to the deployed application URL.");
const root = path.resolve(__dirname, "..");
const results = [];
const timeoutMs = Number(process.env.LEARNING_RESOURCE_TIMEOUT_MS || 30000);

function download(relative) {
  const url = new URL(relative, base.replace(/\/?$/, "/"));
  return new Promise((resolve, reject) => {
    const started = performance.now();
    const request = (url.protocol === "https:" ? https : http).get(url, {
      headers: { "Accept-Encoding": "gzip" }
    }, response => {
      const chunks = [];
      const ttfbMs = performance.now() - started;
      response.on("data", chunk => chunks.push(chunk));
      response.on("error", reject);
      response.on("aborted", () => reject(new Error(`Incomplete response: ${relative}`)));
      response.on("end", () => {
        try {
          const raw = Buffer.concat(chunks);
          assert.equal(response.statusCode, 200, relative);
          if (response.headers["content-length"]) {
            assert.equal(raw.length, Number(response.headers["content-length"]), relative);
          }
          const body = response.headers["content-encoding"] === "gzip" ? zlib.gunzipSync(raw) : raw;
          const record = { path: relative, bytes: raw.length, decodedBytes: body.length,
            ttfbMs: Math.round(ttfbMs), totalMs: Math.round(performance.now() - started) };
          results.push(record);
          console.log(JSON.stringify(record));
          resolve(body);
        } catch (error) { reject(error); }
      });
    });
    const timer = setTimeout(() => request.destroy(new Error(`Timeout: ${relative}`)), timeoutMs);
    request.on("error", reject);
    request.on("close", () => clearTimeout(timer));
  });
}

async function main() {
  for (let i = 0; i < 3; i++) {
    const health = JSON.parse(await download("api/health"));
    assert.equal(health.ok, true);
    const route = JSON.parse(await download("api/course/multi-scene-learning-route"));
    assert.ok(route.chapters.some(chapter => chapter.id === "V14-C1"));
    const renderer = await download("assets/openmaic-classroom/renderer.js?v=20260909");
    const local = fs.readFileSync(path.join(root, "assets/openmaic-classroom/renderer.js"));
    const hash = value => crypto.createHash("sha256").update(value).digest("hex");
    assert.equal(hash(renderer), hash(local), "Renderer differs from the checked local build.");
  }
  if (process.argv.includes("--full")) {
    const home = (await download("")).toString("utf8");
    assert.ok(home.includes("assets/learning-runtime.js?v="), "The deployed homepage must use the verified startup bundle.");
    const runtime = await download("assets/learning-runtime.js?v=20260917");
    assert.equal(crypto.createHash("sha256").update(runtime).digest("hex"),
      crypto.createHash("sha256").update(fs.readFileSync(path.join(root, "assets/learning-runtime.js"))).digest("hex"));
    assert.equal([...home.matchAll(/<link rel="stylesheet"/g)].length, 1);
    const styles = await download("assets/learning-runtime.css?v=20260917");
    assert.equal(crypto.createHash("sha256").update(styles).digest("hex"),
      crypto.createHash("sha256").update(fs.readFileSync(path.join(root, "assets/learning-runtime.css"))).digest("hex"));
    for (const module of require("../assets/courseware-modules/manifest.json")) {
      const bytes = await download("assets/courseware-modules/" + module.file);
      assert.equal(crypto.createHash("sha256").update(bytes).digest("hex"), module.sha256);
    }
    await download("lib/fonts/KaTeX_Main-Regular.woff2");
    await download("assets/openmaic-classroom/frame.html");
    await download("assets/openmaic-classroom/renderer.css?v=20260909");
    const route = require("../data/multi-scene-learning-route.json");
    const chapter = route.chapters.find(item => item.id === "V14-C1");
    for (const module of chapter.modules) {
      for (const point of module.knowledgePoints) {
        for (const candidate of point.resourceCandidates) {
          const relative = ["resources", ...candidate.root.split("/"), ...candidate.file.split("/")]
            .map(encodeURIComponent).join("/");
          await download(`${relative}?cqContextBridge=1`);
        }
      }
    }
  }
  return { passed: true, base, checkedAt: new Date().toISOString(), results };
}

main().then(report => {
  if (process.env.LEARNING_RESOURCE_REPORT) {
    const destination = path.resolve(process.env.LEARNING_RESOURCE_REPORT);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, JSON.stringify(report, null, 2), "utf8");
  }
  console.log(`Deployment resource checks passed: ${results.length}`);
}).catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
