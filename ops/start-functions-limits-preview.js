"use strict";

const fs = require("node:fs");
const path = require("node:path");
const net = require("node:net");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");
async function startPreview(options = {}) {
  const root = path.resolve(__dirname, "..");
  const output = path.join(root, "output");
  fs.mkdirSync(output, { recursive: true });
  const stateFile = options.stateFile || path.join(output, "函数极限固定入口.json");
  const publicFile = path.join(output, "函数极限预览.json");
  const isolated = options.isolated === true;
  let state = !isolated && fs.existsSync(stateFile) ? JSON.parse(fs.readFileSync(stateFile, "utf8")) : null;
  if (!state) {
    // Adopt the last published database in place. Never replace it with an empty
    // fixture, and retain the origin so existing browser sessions still work.
    const prior = !isolated && !options.stateFile && fs.existsSync(publicFile)
      ? JSON.parse(fs.readFileSync(publicFile, "utf8")) : null;
    const adopt = prior && fs.existsSync(path.join(prior.directory, "preview.db"));
    const directory = adopt ? path.resolve(prior.directory) : isolated || options.stateFile
      ? fs.mkdtempSync(path.join(output, "functions-limits-test-")) : path.join(output, "functions-limits-persistent");
    if (!directory.startsWith(output + path.sep)) throw new Error("预览数据目录必须位于项目 output 内。");
    fs.mkdirSync(directory, { recursive: true });
    const port = adopt ? Number(new URL(prior.url).port) : options.port || (isolated || options.stateFile ? await freePort() : 59225);
    state = { directory, port, pid: adopt ? prior.pid : null, adopted: Boolean(adopt),
      demonstrateProactive: options.demonstrateProactive ?? true,
      researchControls: options.researchControls ?? true,
      adminToken: crypto.randomBytes(32).toString("hex"), assignmentSalt: crypto.randomBytes(32).toString("hex"),
      experimentId: `local-learning-${crypto.randomBytes(8).toString("hex")}` };
  }
  const dir = state.directory, port = state.port;
  const demonstrateProactive = options.demonstrateProactive ?? state.demonstrateProactive;
  const researchControls = options.researchControls ?? state.researchControls;
  const url = `http://127.0.0.1:${port}`;
  const persist = () => { if (!isolated) fs.writeFileSync(stateFile, JSON.stringify(state, null, 2), { encoding: "utf8", mode: 0o600 }); };
  const lockFile = path.join(dir, "preview.db.lock");
  const ownsServer = () => {
    try { const lock = JSON.parse(fs.readFileSync(lockFile, "utf8")); return lock.pid === state.pid && path.resolve(lock.cwd) === root; }
    catch { return false; }
  };
  const healthy = async () => {
    try { return (await fetch(url + "/api/health", { signal: AbortSignal.timeout(1000) })).ok; } catch { return false; }
  };
  const publish = (reused) => {
    persist();
    const info = { url, pid: state.pid, directory: dir, persistent: !isolated, reused,
      mode: demonstrateProactive ? "单臂工程演示" : "双臂工程预览",
      warning: "本地模拟模式，账号和学习记录持续保留；不用于正式学生实验。" };
    if (!isolated && !options.stateFile) fs.writeFileSync(publicFile, JSON.stringify(info, null, 2), "utf8");
    return info;
  };
  const running = await healthy();
  if (running && !ownsServer()) throw new Error("固定端口已被其他服务占用；为保护账号数据，未更换端口或数据库。");
  if (running && !options.restart && demonstrateProactive === state.demonstrateProactive && researchControls === state.researchControls) return publish(true);
  if (running) {
    const response = await fetch(url + "/api/admin/shutdown", { method: "POST", headers: { Authorization: `Bearer ${state.adminToken}` }, signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw new Error("原服务未允许安全保存并停止；未强制终止或更换数据库。");
    for (let n = 0; n < 80 && (await healthy()); n++) await new Promise(resolve => setTimeout(resolve, 100));
    for (let n = 0; n < 50 && fs.existsSync(lockFile); n++) await new Promise(resolve => setTimeout(resolve, 100));
    if (await healthy()) throw new Error("原服务尚未停止；未启动第二个数据库写入进程。");
  }
  if (fs.existsSync(path.join(dir, "preview.db"))) {
    const backups = path.join(dir, "保留备份"); fs.mkdirSync(backups, { recursive: true });
    fs.copyFileSync(path.join(dir, "preview.db"), path.join(backups, `preview-${Date.now()}.db`), fs.constants.COPYFILE_EXCL);
  }
  state.demonstrateProactive = demonstrateProactive; state.researchControls = researchControls;
  // Local engineering revisions may freeze a new protocol, never a new account
  // database. Formal human-study servers do not use this launcher.
  persist();
  return launch(0);
  async function launch(attempt) {
    const logPath = path.join(dir, "server.log");
    const logOffset = fs.existsSync(logPath) ? fs.statSync(logPath).size : 0;
    const env = { ...process.env, HOST: "127.0.0.1", BASE_PATH: "", NODE_ENV: "test",
      DB_PATH: path.join(dir, "preview.db"), ADMIN_TOKEN: state.adminToken,
      LOCAL_ADMIN_AUTH_BYPASS: "true",
      RESEARCH_CONTROLS_ENABLED: researchControls ? "true" : "false",
      LLM_PROVIDER: "mock", GRADING_LLM_PROVIDER: "mock", ASSESSMENT_LLM_ENABLED: "false",
      COACH_NARRATION_LLM_ENABLED: "false", PROACTIVE_POLICY_MODE: "active",
      PROACTIVE_EXPERIMENT_CHAPTER_ID: "V14-C1", PROACTIVE_EXPERIMENT_ID: state.experimentId,
      PROACTIVE_ADAPTER_VERSION: "functions-limits-adapter-r2",
      PROACTIVE_OUTCOME_INSTRUMENT_VERSION: "functions-limits-retention-r3",
      PROACTIVE_RETENTION_DELAY_HOURS: "72", PROACTIVE_RETENTION_CLOSE_HOURS: "0",
      PROACTIVE_ASSIGNMENT_SALT: state.assignmentSalt,
      PROACTIVE_PARTICIPATION_MODE: "implicit-pilot", PROACTIVE_PUBLIC_CHAPTER_ONLY: "true",
      PROACTIVE_EXPERIMENT_ARMS: demonstrateProactive ? "treatment_full" : "control,treatment_full", PROACTIVE_DISPLAY_ARMS: "treatment_full",
      PROACTIVE_ARM_PROFILES_JSON: JSON.stringify({
        control: { display: false, maxSupportLevel: "L0", allowRepresentationSwitch: false },
        treatment_full: { display: true, maxSupportLevel: "L5", allowRepresentationSwitch: true }
      }), RATE_LIMIT_MAX: "5000" };
    // Never accidentally inherit a human study or live model configuration.
    delete env.MAIN_LEARNING_PROTOCOL_FILE;
    delete env.PROACTIVE_STUDY_WORKBENCH;
    const fd = fs.openSync(logPath, "a");
    const child = spawn(process.execPath, ["server.js", String(port)], {
      cwd: root, env, detached: true, windowsHide: true, stdio: ["ignore", fd, fd]
    });
    fs.closeSync(fd);
    let failed = false; child.once("error", () => { failed = true; });
    for (let i = 0; i < 100 && !failed && child.exitCode === null; i++) {
      if (await healthy()) {
        child.unref(); state.pid = child.pid; return publish(false);
      }
      await new Promise(resolve => setTimeout(resolve, 150));
    }
    if (child.exitCode === null) child.kill();
    const tail = fs.readFileSync(logPath).subarray(logOffset).toString("utf8");
    if (attempt === 0 && /PROACTIVE_PROTOCOL_FINGERPRINT_MISMATCH|协议指纹与已冻结快照不一致/.test(tail)) {
      state.experimentId = `local-learning-${crypto.randomBytes(8).toString("hex")}`;
      state.protocolUpdatedAt = new Date().toISOString(); persist();
      return launch(1);
    }
    throw new Error("固定入口启动未通过健康检查；原数据库和备份均已保留，请检查本地 server.log。");
  }
}
function freePort() {
  return new Promise(resolve => {
    const socket = net.createServer();
    socket.listen(0, "127.0.0.1", () => { const p = socket.address().port; socket.close(() => resolve(p)); });
  });
}
module.exports = { startPreview };
if (require.main === module) startPreview({
  isolated: process.argv.includes("--isolated"), restart: process.argv.includes("--restart"),
  demonstrateProactive: process.argv.includes("--show-proactive") ? true : undefined,
  researchControls: process.argv.includes("--research-controls") ? true : undefined
}).then(info => console.log(JSON.stringify(info))).catch(error => { console.error(error.message); process.exitCode = 1; });
