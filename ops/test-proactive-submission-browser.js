const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const net = require("node:net");
const { spawn } = require("node:child_process");
const { chromium } = require("playwright-core");
const proactivePolicy = require("../lib/proactive-policy");
const route = require("../data/multi-scene-learning-route.json");
const chapterId = process.env.TEST_PROACTIVE_CHAPTER || "V14-C1";
const functionsLimits = chapterId === "V14-C1";
const replies = {
  "GH-01-K01": "同一输入必须有唯一输出，不同输入可以得到相同输出，我会逐个检查规则。",
  "GH-01-K02": "我会先读取横坐标，代入函数规则，再比较结果与纵坐标是否相等。",
  "GH-01-K03": "我会按输入增大的方向比较输出大小，负数也可以上升。",
  "GH-02-K01": "极限考察附近趋势而不是该点的值，有限项数表只能帮助猜测。",
  "GH-02-K02": "需要分别检查左右极限存在且相等，单点函数值不改变双侧极限。",
  "GH-02-K03": "连续要求函数值存在、极限存在，而且函数值等于极限。",
  "GH-06-K01": "我会固定区间，先检查矩形高度和宽度，再看上下和差距是否随着分割细化而缩小。",
  "GH-06-K02": "我会先区分正负变化，再把各段有向变化相加；路程则把各段变化的绝对值相加。",
  "GH-06-K03": "我会对候选原函数求导验证，再保留任意常数，区分一个原函数和完整的原函数族。",
  "GH-07-K01": "被积函数连续时，两个累积量相减只剩末端小区间；除以增量后再取极限，得到上限处的函数值。",
  "GH-07-K02": "我先找原函数并检查它的导数，再用原函数的上限值减下限值，不能使用被积函数端点差。",
  "GH-07-K03": "我先定义新变量，再改写微分元和上下限，确保新积分里没有混用旧变量。",
  "GH-07-K04": "我会先写出两个因子的求导和积分结果，再比较新积分是否更简单，并保留分部积分中的减号。"
};

async function verifySupportLifecycle(page, root, knowledgePointId) {
  const adapter = proactivePolicy.adapterForChapter(chapterId);
  const finalOutcome = process.env.TEST_PROACTIVE_FINAL_OUTCOME || "correct";
  const finalLevel = Number(process.env.TEST_PROACTIVE_FINAL_LEVEL || 5);
  assert.ok(["correct", "incorrect"].includes(finalOutcome), "未知最终检查结果");
  assert.ok(Number.isInteger(finalLevel) && finalLevel >= 1 && finalLevel <= 5);
  assert.ok(finalOutcome === "correct" || finalLevel === 5,
    "答错终止分支必须验证最高支架层级");
  const output = path.join(root, "output", "playwright", "主动支架桌面",
    knowledgePointId, `L${finalLevel}-${finalOutcome}`);
  fs.mkdirSync(output, { recursive: true });
  const checkIds = new Set();
  for (let level = 1; level <= finalLevel; level += 1) {
    await page.setViewportSize(level % 2
      ? { width: 1366, height: 768 } : { width: 1920, height: 1080 });
    const answerResponse = page.waitForResponse((response) =>
      response.url().includes("/api/learning/assistant/ask")
      && response.request().method() === "POST");
    await page.locator("#knowledge-question-input").fill(replies[knowledgePointId]);
    await page.locator("#knowledge-question-input").press("Enter");
    assert.equal((await answerResponse).status(), 200);
    const checkNode = page.locator(".knowledge-proactive-verification");
    await checkNode.waitFor({ state: "visible" });
    const checkId = await checkNode.getAttribute("data-proactive-check-id");
    assert.ok(!checkIds.has(checkId), "升级后必须签发新的独立检查");
    checkIds.add(checkId);
    assert.match(await checkNode.innerText(), new RegExp(`第 ${level} 次检查`));
    assert.match(await checkNode.innerText(), /支架后检查/);
    const publicState = await page.evaluate(async (chapterId) => {
      const response = await fetch(`/api/learning/proactive/state?chapterId=${chapterId}`, {
        headers: { Authorization: `Bearer ${state.authToken}` }
      });
      return response.json();
    }, chapterId);
    const policy = publicState.data.policyStates.find((row) => row.scopeKey === knowledgePointId);
    assert.equal(policy.currentLevel, `L${level}`);
    assert.equal(policy.lifecycle.phase, "awaiting_independent_attempt");
    const check = policy.verificationCheck;
    assert.equal(check.id, checkId);
    assert.equal(check.instrumentVersion, adapter.verificationVersion);
    assert.equal(policy.lifecycle.activeVerificationCheckId, checkId);
    assert.equal(Object.hasOwn(check, "answer"), false, "学生接口不得泄露检查答案");
    if (functionsLimits) {
      assert.deepEqual(check.options.map(option => option.value), ["A", "B", "C", "D", "__unknown__"]);
      assert.equal(await checkNode.getByRole("radio").count(), 5);
      assert.equal(await checkNode.locator(".unknown-choice-option").innerText(), "我不会");
    }
    if (knowledgePointId === "GH-07-K04" && level === 5 && process.env.TEST_PROACTIVE_GAME_MATCH === "1") {
      await page.evaluate(() => {
        window.__matchingSignals = [];
        window.addEventListener("cq:learning-signal", (event) => {
          const signal = event.detail?.event;
          if (signal) window.__matchingSignals.push({
            eventType: signal.eventType, unitId: signal.unitId, data: signal.data
          });
        });
      });
      await page.evaluate((id) => {
        const unit = getUnit(id);
        const path = ensureAgenticPath();
        if (!path.unlocked.includes(id)) path.unlocked.push(id);
        path.pendingPlan = null;
        state.pendingKnowledgeTransition = null;
        currentUnitId = id;
        currentChapterId = unit.chapterId;
        renderAll();
        KnowledgeAssistant.sync();
      }, knowledgePointId);
      await page.locator('[data-workspace-canvas="interactive"]').click();
      await page.locator('.workspace-canvas-toolbar [data-knowledge-scene="game"]').click();
      const frameNode = page.locator("iframe[data-courseware-frame]");
      await frameNode.waitFor();
      await page.locator(".iframe-loader").waitFor({ state: "hidden" });
      if (await page.locator(".core-learning-workspace").evaluate((node) => node.classList.contains("tools-collapsed"))) {
        await page.locator("#workspace-tools-toggle").click();
      }
      await page.locator('[data-workspace-tab="chat"]').click();
      if (await page.locator("[data-knowledge-open]").isVisible()) {
        await page.locator("[data-knowledge-open]").click();
      }
      await page.locator("#knowledge-assistant-panel").waitFor({ state: "visible" });
      const frame = await (await frameNode.elementHandle()).contentFrame();
      await frame.locator("#start-screen button").click();
      await frame.locator('.func-card[data-label="ln(x)"]').click();
      await frame.locator("#slot-u").click();
      await frame.locator('.func-card[data-label="x"]').click();
      await frame.locator("#slot-dv").click();
      const matchingResponse = page.waitForResponse((response) => response.url().includes("/assistant/intervention")
        && response.request().postDataJSON()?.signal?.kind === "independent_attempt_outcome");
      await frame.locator("#btn-confirm").click();
      const matchingResult = await (await matchingResponse.catch(async (error) => {
        console.log("游戏匹配信号诊断", await page.evaluate(() => window.__matchingSignals));
        console.log("游戏作答诊断", await frame.evaluate(() => window.OpenMaicLearningEvidence.getState()));
        throw error;
      })).json();
      assert.equal(matchingResult.study.policyState.currentLevel, "L5");
      assert.equal(matchingResult.study.policyState.lifecycle.phase, "awaiting_independent_attempt",
        "L5要求完整计算，实际游戏选对因子不能提前结束帮助");
      assert.equal(matchingResult.study.policyState.lifecycle.activeVerificationCheckId, checkId);
      const gameSignal = await page.evaluate(() => window.__matchingSignals.find(
        (signal) => signal.eventType === "courseware_challenge_result"));
      assert.equal(gameSignal.data.evidence_scope, "factor_selection");
      assert.equal(gameSignal.data.mathematically_valid_split, true);
      assert.equal(gameSignal.data.accepted_choices.length, 1);
      await checkNode.waitFor({ state: "visible" });
      await page.screenshot({ path: path.join(output, "L5-游戏选对因子仍需完成检查.png") });
    }
    const correct = level === finalLevel && finalOutcome === "correct";
    // Choose fixture answers in Node; the browser receives only the public options.
    const optionIndex = check.options.findIndex((option) => adapter.gradeVerificationCheck({
      knowledgePointId, supportLevel: check.supportLevel,
      checkId: check.id, response: option.value
    })?.correct === correct);
    assert.ok(optionIndex >= 0);
    await checkNode.getByRole("radio").nth(optionIndex).click();
    await checkNode.getByRole("button", { name: "提交检查", exact: true }).click({ trial: true });
    await page.screenshot({ path: path.join(output, `L${level}-独立检查.png`) });
    if (knowledgePointId === "GH-07-K04" && level === 4) {
      await page.setViewportSize({ width: 1366, height: 768 });
      await checkNode.getByRole("button", { name: "提交检查", exact: true }).click({ trial: true });
      const fits = await checkNode.evaluate((node) => {
        const r = node.getBoundingClientRect();
        return r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth;
      });
      assert.equal(fits, true, "L4较长的公式检查必须完整落在桌面视口内");
      await page.screenshot({ path: path.join(output, "L4-公式代入检查-1366.png") });
    }
    const resultResponse = page.waitForResponse((response) =>
      response.url().includes("/api/learning/proactive/check")
      && response.request().method() === "POST");
    await checkNode.getByRole("button", { name: "提交检查", exact: true }).click();
    const result = await resultResponse;
    assert.equal(result.status(), 200);
    const payload = await result.json();
    assert.equal(payload.checkResult.status, correct ? "correct" : "incorrect");
    if (correct) {
      assert.equal(payload.study.deliveryDecision, "stay_silent");
      assert.equal(payload.study.policyState.lifecycle.phase, "exited");
      assert.equal(payload.study.policyState.currentLevel, "L0");
      assert.equal(payload.study.policyState.fadeLevel, 1);
      assert.ok(Date.parse(payload.study.policyState.cooldownUntil) > Date.now());
      await checkNode.waitFor({ state: "hidden" });
      assert.equal(await page.locator(".knowledge-proactive-inline-offer").count(), 0,
        "独立检查通过后不能继续邀请升级支架");
      await page.screenshot({ path: path.join(output, "检查通过-停止加码.png") });
    } else if (level === 5) {
      assert.equal(payload.study.deliveryDecision, "stay_silent");
      assert.equal(payload.study.policyState.lifecycle.phase, "maximum_support_reached");
      await checkNode.waitFor({ state: "hidden" });
      const feedback = page.locator(".knowledge-proactive-check-feedback");
      await feedback.waitFor({ state: "visible" });
      assert.match(await feedback.innerText(), /本轮帮助已到上限/);
      assert.doesNotMatch(await feedback.innerText(), /只有你确认后|下一层/);
      assert.equal(await page.locator(".knowledge-proactive-inline-offer").count(), 0);
      await page.screenshot({ path: path.join(output, "达到上限-停止追加.png") });
    } else {
      assert.equal(payload.decision.supportLevel, `L${level + 1}`);
      const offer = page.locator(".knowledge-proactive-inline-offer");
      await offer.waitFor({ state: "visible" });
      const accept = offer.locator("footer button.is-primary");
      await accept.click();
    }
  }
}

async function main() {
  const root = path.resolve(__dirname, "..");
  const knowledgePointId = process.env.TEST_PROACTIVE_KNOWLEDGE_POINT || (functionsLimits ? "GH-01-K01" : "GH-06-K02");
  const point = route.chapters.find((chapter) => chapter.id === chapterId).modules
    .flatMap((module) => module.knowledgePoints).find((item) => item.id === knowledgePointId);
  assert.ok(point && replies[knowledgePointId], "未知检查知识点");
  const executablePath = [
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"
  ].filter(Boolean).find((file) => fs.existsSync(file));
  assert.ok(executablePath, "需要 Chrome 或 Edge");
  const port = await new Promise((resolve, reject) => {
    const socket = net.createServer();
    socket.on("error", reject);
    socket.listen(0, "127.0.0.1", () => {
      const value = socket.address().port;
      socket.close(() => resolve(value));
    });
  });
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "cq-proactive-submit-"));
  const server = spawn(process.execPath, ["server.js", String(port)], {
    cwd: root,
    windowsHide: true,
    stdio: "ignore",
    env: {
      ...process.env, NODE_ENV: "test", HOST: "127.0.0.1",
      DB_PATH: path.join(temp, "test.db"),
      LLM_PROVIDER: "mock", GRADING_LLM_PROVIDER: "mock",
      PROACTIVE_POLICY_MODE: "active", PROACTIVE_PARTICIPATION_MODE: "implicit-pilot",
      PROACTIVE_EXPERIMENT_ID: "browser-submission-regression",
      PROACTIVE_EXPERIMENT_CHAPTER_ID: chapterId,
      PROACTIVE_ASSIGNMENT_SALT: "isolated-browser-regression-fixture",
      PROACTIVE_ADAPTER_VERSION: "functions-limits-adapter-r2",
      // Single-arm fixture tests delivery, not experimental allocation.
      PROACTIVE_EXPERIMENT_ARMS: "treatment_full", PROACTIVE_DISPLAY_ARMS: "treatment_full",
      RATE_LIMIT_MAX: "2000"
    }
  });
  let browser;
  try {
    const base = `http://127.0.0.1:${port}`;
    let ready = false;
    for (let i = 0; i < 80; i += 1) {
      try { ready = (await fetch(`${base}/api/health`)).ok; } catch {}
      if (ready) break;
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
    assert.ok(ready, "隔离测试服务启动失败");
    browser = await chromium.launch({ executablePath, headless: true });
    const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
    page.setDefaultTimeout(10000);
    const requests = [];
    page.on("request", (request) => {
      if (request.url().includes("/assistant/intervention")) requests.push(request.postDataJSON());
    });
    await page.goto(base);
    await page.locator('[data-auth-mode="register"]').click();
    await page.locator("#nickname").fill(`干预回归${Date.now()}`);
    await page.locator("#register-password").fill("browser-test-password");
    await page.locator("#register-password-confirm").fill("browser-test-password");
    await page.locator("#login-submit").click();
    await page.locator("#auth-gate").waitFor({ state: "hidden" });
    await page.locator('[data-view="learn"]').first().click();
    const stale = await page.evaluate(async (chapterId) => {
      const questions = getUnit().scene.content.questions;
      const response = await fetch("/api/learning/quiz/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${state.authToken}` },
        body: JSON.stringify({ chapterId, unitId: `${chapterId}-pre`, phase: "pre",
          answers: questions.map((question) => ({
            questionId: question.legacyQuestionId,
            response: question.type === "multiple" ? ["A"] : "A"
          })) })
      });
      const payload = await response.json();
      return { status: response.status, code: payload.code };
    }, chapterId);
    assert.deepEqual(stale, functionsLimits ? { status: 400, code: "quiz_question_set_mismatch" }
      : { status: 409, code: "quiz_version_changed" });
    const groups = await page.locator("#lesson-player input[data-choice-answer]")
      .evaluateAll((elements) => [...new Set(elements.map((element) => element.name))]);
    for (const name of groups) await page.locator(`#lesson-player input[name="${name}"]`).first().check();
    for (const textarea of await page.locator("#lesson-player textarea").all()) {
      await textarea.fill(functionsLimits ? replies[knowledgePointId]
        : "原函数是满足求导关系的函数，不定积分包含所有相差任意常数的原函数。");
    }
    await page.getByRole("button", { name: "提交本次测验", exact: true }).click();
    await page.waitForFunction(chapterId => state.submittedQuizzes.includes(`${chapterId}-pre`), chapterId);
    const storedContexts = await page.evaluate(async (chapterId) => {
      const response = await fetch("/api/learning/quiz-results", {
        headers: { Authorization: `Bearer ${state.authToken}` }
      });
      const payload = await response.json();
      return payload.data.filter((row) => row.unit_id === `${chapterId}-pre`)
        .map((row) => ({ experimentId: row.research_experiment_id,
          context: JSON.parse(row.research_context_json) }));
    }, chapterId);
    assert.equal(storedContexts.length, functionsLimits ? 12 : 10);
    for (const record of storedContexts) {
      assert.equal(record.experimentId, "browser-submission-regression");
      assert.equal(record.context.instrumentVersion, functionsLimits ? "functions-limits-assessment-r2" : "v14-c3-assessments-r3");
      assert.match(record.context.questionDigest, /^[a-f0-9]{64}$/);
      assert.match(record.context.protocolFingerprint, /^[a-f0-9]{64}$/);
    }
    const analysisResponse = await page.request.get(`${base}/api/admin/research/analysis-package`);
    assert.equal(analysisResponse.status(), 200);
    const analysisPackage = (await analysisResponse.json()).data;
    const pretestRows = analysisPackage.tables.quiz_attempts.filter((row) => row.unit_id === `${chapterId}-pre`);
    assert.equal(pretestRows.length, functionsLimits ? 12 : 10);
    assert.ok(pretestRows.every((row) => row.provenance === "recorded_experiment" && row.catalog_match));
    assert.ok(pretestRows.filter((row) => row.question_type !== "short_answer")
      .every((row) => row.objective_score_verified === true));
    assert.equal(analysisPackage.tables.phase_scores.find((row) =>
      row.unit_id === `${chapterId}-pre` && row.component === "total").analysis_score, null,
    "模拟或未冻结的简答不能变成可直接报告的全卷研究分数");
    await page.locator("#workspace-coach-toggle").waitFor({ state: "visible" });
    await page.locator("#workspace-coach-toggle").click();
    // Seed navigation eligibility only; all answers, policy decisions and rendering are real.
    await page.evaluate((knowledgePointId) => {
      const unit = getUnit(`${knowledgePointId}-formative`);
      const route = ensureAgenticPath();
      route.unlocked.push(unit.id);
      route.pendingPlan = null;
      state.pendingKnowledgeTransition = null;
      currentUnitId = unit.id;
      currentChapterId = unit.chapterId;
      renderAll();
      KnowledgeAssistant.sync();
    }, knowledgePointId);
    const core = point.formativeQuiz.questions[0];
    const wrongChoice = core.options.find((option) => !core.answer.includes(option.value));
    await page.locator(`#lesson-player input[type=radio][value="${wrongChoice.value}"]`).check();
    await page.getByRole("button", { name: "提交本次测验", exact: true }).click();
    await page.locator("#lesson-player input[type=checkbox]").first().check();
    assert.equal(requests.filter((request) => request.unitId === `${knowledgePointId}-formative`).length, 0,
      "未完成形成性独立作答时不可请求本题干预");
    assert.equal(await page.locator("[data-knowledge-proactive-accept]").isVisible(), false);
    const decisionResponse = page.waitForResponse((response) => response.url().includes("/assistant/intervention"));
    await page.getByRole("button", { name: "提交诊断题", exact: true }).click();
    const decision = await (await decisionResponse).json();
    assert.equal(decision.provider, "deterministic-policy");
    assert.equal(decision.decision.supportLevel, "L1");
    assert.equal(decision.decision.action, "elicit_self_explanation");
    assert.equal(requests.at(-1).signal.kind, "formative_outcome");
    await page.locator("[data-knowledge-proactive-accept]").waitFor({ state: "visible" });
    if (functionsLimits) {
      const output = path.join(root, "output", "playwright", "函数极限介入显示审计");
      fs.mkdirSync(output, { recursive: true });
      for (const width of [1366, 1920]) {
        await page.setViewportSize({ width, height: width === 1366 ? 768 : 1080 });
        const presentation = await page.locator("[data-knowledge-proactive]").evaluate((element) => {
          const rect = element.getBoundingClientRect();
          return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom,
            width: rect.width, height: rect.height, viewportWidth: innerWidth, viewportHeight: innerHeight };
        });
        assert.ok(presentation.width > 0 && presentation.height > 0);
        assert.ok(presentation.left >= 0 && presentation.right <= presentation.viewportWidth + 1);
        assert.ok(presentation.top >= 0 && presentation.bottom <= presentation.viewportHeight + 1);
        await page.screenshot({ path: path.join(output, `主动建议-${width}.png`) });
      }
    }
    if (process.env.TEST_PROACTIVE_ALTERNATIVE === "1") {
      await page.evaluate((id) => {
        const path = ensureAgenticPath();
        if (!path.unlocked.includes(id)) path.unlocked.push(id);
        path.pendingPlan = null;
      }, knowledgePointId);
      const alternativeResponse = page.waitForResponse((response) =>
        response.url().includes("/assistant/intervention"));
      await page.locator("[data-knowledge-proactive-alternative]").click();
      const alternative = await (await alternativeResponse).json();
      assert.equal(alternative.decision.action, "switch_representation");
      await page.locator("[data-knowledge-proactive-accept]").click();
      await page.waitForFunction(({ unitId, scene }) => currentUnitId === unitId
        && selectedKnowledgeSceneType(getUnit()) === scene
        && document.querySelector(".core-learning-workspace").dataset.classroomSurface === "interactive",
      { unitId: knowledgePointId, scene: alternative.decision.targetSceneType });
      await page.locator("iframe[data-courseware-frame]").waitFor({ state: "visible" });
      await page.locator(".iframe-loader").waitFor({ state: "hidden" });
      const screenshotDirectory = path.join(root, "output", "playwright");
      fs.mkdirSync(screenshotDirectory, { recursive: true });
      await page.screenshot({ path: path.join(screenshotDirectory, "主动换表征-真实跳转.png") });
      console.log("主动换表征实际浏览器通过：真实替代建议、学生确认、跨课件导航、选中场景与互动画面一致。");
      return;
    }
    await page.locator("[data-knowledge-proactive-accept]").click();
    await page.locator("#knowledge-assistant-panel").waitFor({ state: "visible" });
    await verifySupportLifecycle(page, root, knowledgePointId);
    console.log(`${knowledgePointId} 真实作答主动干预回归通过：前测和诊断中静默，L1–L${process.env.TEST_PROACTIVE_FINAL_LEVEL || 5} 实际回复与支架后检查，最终结果 ${process.env.TEST_PROACTIVE_FINAL_OUTCOME || "correct"}。模型回复使用 mock。`);
  } finally {
    await browser?.close();
    server.kill();
    await Promise.race([
      new Promise((resolve) => server.once("exit", resolve)),
      new Promise((resolve) => setTimeout(resolve, 3000))
    ]);
    if (server.exitCode === null) server.kill("SIGKILL");
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
