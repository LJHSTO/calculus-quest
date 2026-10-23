const fs = require("node:fs");
const path = require("node:path");
const net = require("node:net");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");

async function main() {
  const root = path.resolve(__dirname, "..");
  const configFile = "D:/Desktop/key.txt";
  if (!fs.existsSync(configFile)) throw new Error("外部模型配置文件不存在。");
  const env = { ...process.env };
  for (const key of [
    "GRADING_API_KEY", "GRADING_BASE_URL", "GRADING_WIRE_API",
    "OPENAI_COMPATIBLE_API_KEY", "OPENAI_COMPATIBLE_BASE_URL", "OPENAI_COMPATIBLE_WIRE_API",
    "INNOSPARK_API_KEY", "INNOSPARK_BASE_URL", "OPENAI_WIRE_API"
  ]) env[key] = "";
  fs.mkdirSync(path.join(root, "output"), { recursive: true });
  const directory = fs.mkdtempSync(path.join(root, "output", "preview-live-auto-"));
  const port = await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const value = server.address().port;
      server.close(() => resolve(value));
    });
  });
  Object.assign(env, {
    NODE_ENV: "test", HOST: "127.0.0.1", BASE_PATH: "",
    DB_PATH: path.join(directory, "preview.db"),
    ADMIN_TOKEN: crypto.randomBytes(32).toString("hex"),
    LLM_PROVIDER: "openai-compatible", LLM_CONFIG_FILE: configFile,
    OPENAI_COMPATIBLE_MODEL: "auto", INNOSPARK_MODEL: "auto",
    GRADING_LLM_PROVIDER: "openai-compatible", GRADING_CONFIG_FILE: configFile,
    GRADING_MODEL: "auto", GRADING_TIMEOUT_MS: "60000",
    LEARNING_ASSISTANT_MODEL: "auto", COACH_NARRATION_MODEL: "auto",
    ASSESSMENT_MODEL: "auto", ASSESSMENT_LLM_ENABLED: "false",
    COACH_NARRATION_LLM_ENABLED: "false",
    PROACTIVE_POLICY_MODE: "active", PROACTIVE_PARTICIPATION_MODE: "implicit-pilot",
    PROACTIVE_EXPERIMENT_ID: path.basename(directory),
    PROACTIVE_EXPERIMENT_CHAPTER_ID: "V14-C1",
    PROACTIVE_OUTCOME_INSTRUMENT_VERSION: "functions-limits-retention-r4",
    PROACTIVE_ADAPTER_VERSION: require("../lib/proactive-policy/adapters/functions-limits").version,
    PROACTIVE_ASSIGNMENT_STRATEGY: "hash",
    PROACTIVE_ASSIGNMENT_SALT: crypto.randomBytes(32).toString("hex"),
    PROACTIVE_EXPERIMENT_ARMS: "control,treatment_full",
    PROACTIVE_DISPLAY_ARMS: "treatment_full",
    PROACTIVE_ARM_PROFILES_JSON: JSON.stringify({
      control: { display: false, maxSupportLevel: "L0", allowRepresentationSwitch: false },
      treatment_full: { display: true, maxSupportLevel: "L5", allowRepresentationSwitch: true }
    }),
    RATE_LIMIT_MAX: "2000"
  });
  const log = fs.openSync(path.join(directory, "server.log"), "a");
  const child = spawn(process.execPath, ["server.js", String(port)], {
    cwd: root, env, detached: true, windowsHide: true, stdio: ["ignore", log, log]
  });
  fs.closeSync(log);
  let startupError = null;
  child.once("error", (error) => { startupError = error; });
  const url = `http://127.0.0.1:${port}`;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (startupError || child.exitCode !== null) break;
    try {
      if ((await fetch(`${url}/api/health`, { signal: AbortSignal.timeout(1000) })).ok) {
        child.unref();
        console.log(JSON.stringify({
          url, pid: child.pid, directory, requestedModel: "auto",
          arms: ["control", "treatment_full"],
          warning: "真实接口工程预览，可能产生调用费用；不要输入真实学生数据。评分校准尚未通过。"
        }));
        return;
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  child.kill();
  throw new Error("隔离预览未通过健康检查，未使用正式数据库。");
}

main().catch(() => {
  console.error("真实模型预览启动失败；请检查本地配置，不要分享日志中的敏感信息。");
  process.exitCode = 1;
});
