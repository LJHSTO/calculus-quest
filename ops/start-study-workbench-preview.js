"use strict";
const fs = require("node:fs"), path = require("node:path"), net = require("node:net"), crypto = require("node:crypto"), { spawn } = require("node:child_process");
async function main() {
  const root = path.resolve(__dirname, ".."), kind = process.argv[2] || "recheck";
  if (!["recheck", "placement", "embedded"].includes(kind)) throw new Error("预演方案应为recheck、placement或embedded");
  const port = await new Promise(resolve => { const s = net.createServer(); s.listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => resolve(p)); }); });
  fs.mkdirSync(path.join(root, "output"), { recursive: true });
  const dir = fs.mkdtempSync(path.join(root, "output/study-workbench-preview-"));
  const child = spawn(process.execPath, ["server.js", String(port)], { cwd: root, windowsHide: true, detached: true, stdio: "ignore", env: {
    ...process.env, NODE_ENV: "test", HOST: "127.0.0.1", BASE_PATH: "", DB_PATH: path.join(dir, "test.db"),
    PROACTIVE_STUDY_WORKBENCH: kind, PROACTIVE_STUDY_SEED: crypto.randomBytes(32).toString("hex"), PROACTIVE_STUDY_PROTOCOL_ID: path.basename(dir),
    PROACTIVE_POLICY_MODE: "off", PROACTIVE_EXPERIMENT_ID: path.basename(dir), PROACTIVE_EXPERIMENT_CHAPTER_ID: "V14-C1",
    PROACTIVE_ADAPTER_VERSION: "functions-limits-adapter-r2", PROACTIVE_OUTCOME_INSTRUMENT_VERSION: "functions-limits-retention-r4",
    LLM_PROVIDER: "mock", GRADING_LLM_PROVIDER: "mock", ASSESSMENT_LLM_ENABLED: "false", COACH_NARRATION_LLM_ENABLED: "false",
    LOCAL_ADMIN_AUTH_BYPASS: "true", RATE_LIMIT_MAX: "5000"
  } });
  let ready = false; for (let n = 0; n < 100; n++) { try { ready = (await fetch(`http://127.0.0.1:${port}/api/health`)).ok; } catch {} if (ready) break; await new Promise(r => setTimeout(r, 100)); }
  if (!ready) { child.kill(); throw new Error("研究预演启动失败"); }
  child.unref();
  const result = { url: `http://127.0.0.1:${port}/study-workbench.html`, pid: child.pid, directory: dir, kind, mode: "隔离工程预演，禁止用于正式招募" };
  fs.writeFileSync(path.join(root, `output/研究工作台预览-${kind}.json`), JSON.stringify(result, null, 2)); console.log(JSON.stringify(result, null, 2));
}
main().catch(e => { console.error(e.message); process.exitCode = 1; });
