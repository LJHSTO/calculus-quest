"use strict";

const fs = require("node:fs");
const path = require("node:path");
const net = require("node:net");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");
async function main() {
  const root = path.resolve(__dirname, "..");
  const demonstrateProactive = process.argv.includes("--show-proactive");
  const dir = fs.mkdtempSync(path.join(root, "output", "functions-limits-preview-"));
  const port = await new Promise(resolve => {
    const socket = net.createServer();
    socket.listen(0, "127.0.0.1", () => { const p = socket.address().port; socket.close(() => resolve(p)); });
  });
  const env = { ...process.env, HOST: "127.0.0.1", BASE_PATH: "", NODE_ENV: "test",
    DB_PATH: path.join(dir, "preview.db"), ADMIN_TOKEN: crypto.randomBytes(32).toString("hex"),
    LLM_PROVIDER: "mock", GRADING_LLM_PROVIDER: "mock", ASSESSMENT_LLM_ENABLED: "false",
    COACH_NARRATION_LLM_ENABLED: "false", PROACTIVE_POLICY_MODE: "active",
    PROACTIVE_EXPERIMENT_CHAPTER_ID: "V14-C1", PROACTIVE_EXPERIMENT_ID: path.basename(dir),
    PROACTIVE_ADAPTER_VERSION: "functions-limits-adapter-r2",
    PROACTIVE_OUTCOME_INSTRUMENT_VERSION: "functions-limits-retention-r3",
    PROACTIVE_RETENTION_DELAY_HOURS: "72", PROACTIVE_RETENTION_CLOSE_HOURS: "0",
    PROACTIVE_ASSIGNMENT_SALT: crypto.randomBytes(32).toString("hex"),
    PROACTIVE_PARTICIPATION_MODE: "implicit-pilot", PROACTIVE_PUBLIC_CHAPTER_ONLY: "true",
    PROACTIVE_EXPERIMENT_ARMS: demonstrateProactive ? "treatment_full" : "control,treatment_full", PROACTIVE_DISPLAY_ARMS: "treatment_full",
    PROACTIVE_ARM_PROFILES_JSON: JSON.stringify({
      control: { display: false, maxSupportLevel: "L0", allowRepresentationSwitch: false },
      treatment_full: { display: true, maxSupportLevel: "L5", allowRepresentationSwitch: true }
    }), RATE_LIMIT_MAX: "5000" };
  const fd = fs.openSync(path.join(dir, "server.log"), "a");
  const child = spawn(process.execPath, ["server.js", String(port)], {
    cwd: root, env, detached: true, windowsHide: true, stdio: ["ignore", fd, fd]
  });
  fs.closeSync(fd);
  let failed = false;
  child.once("error", () => { failed = true; });
  for (let i = 0; i < 100 && !failed; i++) {
    try {
      if ((await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(1000) })).ok) {
        child.unref();
        const info = { url: `http://127.0.0.1:${port}`, pid: child.pid, directory: dir,
          mode: demonstrateProactive ? "单臂工程演示" : "双臂工程预览",
          warning: "隔离工程预览，不连接真实模型，不用于正式学生实验。" };
        fs.writeFileSync(path.join(root, "output", "函数极限预览.json"), JSON.stringify(info, null, 2), "utf8");
        console.log(JSON.stringify(info));
        return;
      }
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  child.kill();
  throw new Error("预览启动未通过健康检查。");
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
