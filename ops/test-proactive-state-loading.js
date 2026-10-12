"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");

const requests = [];
const window = {
  location: { origin: "https://example.test" }, setTimeout, clearTimeout,
  fetch: (url, options) => new Promise((resolve, reject) => {
    options.signal?.addEventListener("abort", () => reject(new Error("timeout")), { once: true });
    requests.push({ url, options, resolve, reject });
  })
};
vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../app/main/request-coalescing.js"), "utf8"), {
  window, document: { baseURI: "https://example.test/calculus_quest/" },
  URL, Headers, AbortController, Map, JSON
});
const url = "api/learning/proactive/state?chapterId=V14-C1";
const options = { headers: { Authorization: "Bearer test-one" } };
function complete(index, revision) {
  requests[index].resolve(new Response(JSON.stringify({ revision })));
}
async function main() {
  const loads = Array.from({ length: 30 }, () => window.fetch(url, options));
  assert.equal(requests.length, 1, "Concurrent state GETs share one network request");
  complete(0, 1);
  const responses = await Promise.all(loads);
  assert.equal((await responses[0].json()).revision, 1);
  assert.equal((await responses[29].json()).revision, 1, "Each consumer has an independent response body");
  const old = window.fetch(url, options);
  const mutation = window.fetch("api/learning/proactive/preference", { ...options, method: "POST" });
  complete(2, "saved");
  await mutation;
  const fresh = window.fetch(url, options);
  assert.equal(requests.length, 3, "A mutation queues a fresh read without overlapping the older request");
  complete(1, "old");
  await old;
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(requests.length, 4, "The queued read starts after the older request finishes");
  complete(3, "fresh");
  assert.equal((await (await fresh).json()).revision, "fresh");
  const userOne = window.fetch(url, options);
  const userTwo = window.fetch(url, { headers: { Authorization: "Bearer test-two" } });
  assert.equal(requests.length, 6, "Different credentials never share responses");
  complete(4, "one");
  complete(5, "two");
  await Promise.all([userOne, userTwo]);
  const failed = window.fetch(url, options);
  requests[6].reject(new Error("offline"));
  await assert.rejects(failed, /offline/);
  const recovered = window.fetch(url, options);
  complete(7, "recovered");
  assert.equal((await (await recovered).json()).revision, "recovered");
  assert.equal(requests[7].url, url, "Existing subpath fetch adapter still owns URL rewriting");
  console.log("state transport coalescing, response cloning, mutation invalidation, account isolation and recovery passed");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
