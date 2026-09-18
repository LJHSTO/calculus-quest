const assert = require("node:assert/strict");
const path = require("node:path");
const { spawn } = require("node:child_process");
const chapter = process.env.TEST_PROACTIVE_CHAPTER || "V14-C1";
const adapter = require(chapter === "V14-C1"
  ? "../lib/proactive-policy/adapters/functions-limits-r2"
  : "../lib/proactive-policy/adapters/v14-c3");

async function main() {
  const verified = [];
  for (const knowledgePointId of Object.keys(adapter.knowledgePoints)) {
    await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, ["ops/test-proactive-submission-browser.js"], {
        cwd: path.resolve(__dirname, ".."), windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env, TEST_PROACTIVE_CHAPTER: chapter, TEST_PROACTIVE_KNOWLEDGE_POINT: knowledgePointId,
          TEST_PROACTIVE_GAME_MATCH: knowledgePointId === "GH-07-K04" ? "1" : "0",
          TEST_PROACTIVE_FINAL_LEVEL: "5", TEST_PROACTIVE_FINAL_OUTCOME: "correct" }
      });
      child.stdout.on("data", (chunk) => process.stdout.write(chunk));
      child.stderr.on("data", (chunk) => process.stderr.write(chunk));
      child.once("error", reject);
      child.once("exit", (code) => code === 0 ? resolve() : reject(new Error(`${knowledgePointId} 子测试退出：${code}`)));
    });
    verified.push(knowledgePointId);
  }
  assert.equal(verified.length, chapter === "V14-C1" ? 6 : 7);
  console.log(JSON.stringify({ ok: true, knowledgePoints: verified, checks: verified.length * 5 }));
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
