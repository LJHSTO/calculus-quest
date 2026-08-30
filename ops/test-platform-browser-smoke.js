const assert = require("node:assert/strict");
const fs = require("node:fs");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { chromium } = require("playwright-core");

const root = path.resolve(__dirname, "..");
const studentDesktopScreenshotPath = path.join(root, "tmp", "platform-browser-smoke-student-desktop.png");
const studentMobileScreenshotPath = path.join(root, "tmp", "platform-browser-smoke-student-mobile.png");
const proactivePreferenceMobileScreenshotPath = path.join(root, "tmp", "platform-browser-smoke-proactive-preference-mobile.png");
const proactiveMobileScreenshotPath = path.join(root, "tmp", "platform-browser-smoke-proactive-mobile.png");
const screenshotPath = path.join(root, "tmp", "platform-browser-smoke-admin.png");
const proactiveAdminScreenshotPath = path.join(root, "tmp", "platform-browser-smoke-admin-proactive.png");
const proactiveAdminMobileScreenshotPath = path.join(root, "tmp", "platform-browser-smoke-admin-proactive-mobile.png");
const shortAnswerScreenshotPath = path.join(root, "tmp", "platform-browser-smoke-admin-shortanswers.png");
const mobileScreenshotPath = path.join(root, "tmp", "platform-browser-smoke-admin-mobile.png");
const browserCandidates = [
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe"
].filter(Boolean);

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
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (child.exitCode !== null) {
      throw new Error(`server exited early (${child.exitCode})\n${logs.join("")}`);
    }
    try {
      const response = await fetch(`${baseUrl}/api/health`);
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

function browserExecutable() {
  const executable = browserCandidates.find((candidate) => fs.existsSync(candidate));
  if (!executable) throw new Error("No Chrome or Edge executable found.");
  return executable;
}

function collectBrowserIssues(page) {
  const issues = [];
  page.on("pageerror", (error) => {
    issues.push(`pageerror ${page.url()}: ${error.stack || error.message || error}`);
  });
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    if (/favicon\.ico/i.test(message.text())) return;
    issues.push(`console ${page.url()}: ${message.text()}`);
  });
  page.on("requestfailed", (request) => {
    const failure = request.failure()?.errorText || "";
    if (/ERR_ABORTED/i.test(failure)) return;
    issues.push(`requestfailed ${request.url()}: ${failure}`);
  });
  return issues;
}

async function registerParticipant(page, nickname, password) {
  await page.locator('[data-auth-mode="register"]').click();
  await page.waitForFunction(() => {
    const form = document.querySelector("#login-form");
    const fields = document.querySelector("[data-register-fields]");
    return form?.dataset.authFormMode === "register" && fields?.hidden === false;
  });
  await page.locator("#nickname").fill(nickname);
  await page.locator("#register-password").fill(password);
  await page.locator("#register-password-confirm").fill(password);

  const validity = await page.locator("#login-form").evaluate((form) => ({
    valid: form.checkValidity(),
    invalid: Array.from(form.querySelectorAll(":invalid")).map((element) => element.id)
  }));
  assert.equal(validity.valid, true, `registration form is invalid: ${JSON.stringify(validity)}`);

  const responsePromise = page.waitForResponse((response) => {
    const target = new URL(response.url());
    return response.request().method() === "POST"
      && target.pathname === "/api/auth/register";
  }, { timeout: 30000 });
  await page.locator("#login-submit").click();

  let response;
  try {
    response = await responsePromise;
  } catch (error) {
    const diagnostic = await page.evaluate(() => ({
      formMode: document.querySelector("#login-form")?.dataset.authFormMode || "",
      feedback: document.querySelector("#login-feedback")?.textContent || "",
      submitDisabled: document.querySelector("#login-submit")?.disabled || false,
      authStatus: document.querySelector("#auth-status")?.textContent || "",
      authGateHidden: document.querySelector("#auth-gate")?.hidden ?? null
    }));
    throw new Error(`registration request was not observed: ${JSON.stringify(diagnostic)}\n${error.message}`);
  }

  const payload = await response.json().catch(() => ({}));
  assert.equal(
    response.status(),
    200,
    `registration failed: ${JSON.stringify(payload)}`
  );
  try {
    await page.waitForFunction((expected) => (
      document.querySelector("#auth-status")?.textContent?.includes(expected)
    ), nickname, { timeout: 30000 });
  } catch (error) {
    const diagnostic = await page.evaluate(() => ({
      feedback: document.querySelector("#login-feedback")?.textContent || "",
      submitDisabled: document.querySelector("#login-submit")?.disabled || false,
      authStatus: document.querySelector("#auth-status")?.textContent || "",
      authGateHidden: document.querySelector("#auth-gate")?.hidden ?? null,
      participantId: window.state?.participant?.participantId || "",
      currentChapterId: window.currentChapterId || "",
      currentUnitId: window.currentUnitId || ""
    }));
    throw new Error(`registration did not finish rendering: ${JSON.stringify(diagnostic)}\n${error.message}`);
  }
  await page.locator("#auth-status").waitFor({ state: "visible", timeout: 10000 });
  await page.locator("#auth-gate").waitFor({ state: "hidden", timeout: 10000 });
  return payload;
}

async function answerVisibleQuiz(page) {
  const cards = page.locator(".question-card");
  const count = await cards.count();
  assert.equal(count, 10, "the first pretest should expose ten questions");
  for (let index = 0; index < count; index += 1) {
    const card = cards.nth(index);
    const choice = card.locator("[data-choice-answer]").first();
    if (await choice.count()) {
      await choice.check();
      continue;
    }
    const textarea = card.locator("[data-short-answer]").first();
    assert.equal(await textarea.count(), 1, `question ${index + 1} has no answer control`);
    await textarea.fill(`浏览器回归作答 ${index + 1}`);
  }
}

async function injectProactiveEvents(page) {
  const response = await page.evaluate(async () => {
    const token = sessionStorage.getItem("calculus-quest-auth-token-v1") || "";
    const now = Date.now();
    const suggestionId = `browser-suggestion-${now}`;
    const events = [
      {
        eventId: `browser-smoke:${now}:shown`,
        type: "interaction",
        payload: {
          eventType: "knowledge_proactive_agent_decided",
          source: "knowledge_assistant",
          sequenceIndex: 5001,
          timing: { clientAt: new Date(now - 2000).toISOString() },
          data: {
            suggestionId,
            suggestionKind: "quiet_dwell",
            action: "ask_clarification"
          }
        }
      },
      {
        eventId: `browser-smoke:${now}:presented`,
        type: "interaction",
        payload: {
          eventType: "knowledge_proactive_suggestion_shown",
          source: "knowledge_assistant",
          sequenceIndex: 5002,
          timing: { clientAt: new Date(now - 1000).toISOString() },
          data: { suggestionId, suggestionKind: "quiet_dwell" }
        }
      },
      {
        eventId: `browser-smoke:${now}:accepted`,
        type: "interaction",
        payload: {
          eventType: "knowledge_proactive_suggestion_accepted",
          source: "knowledge_assistant",
          sequenceIndex: 5003,
          timing: { clientAt: new Date(now).toISOString() },
          data: {
            suggestionId,
            suggestionKind: "quiet_dwell",
            action: "ask_clarification"
          }
        }
      }
    ];
    const result = await fetch("api/learning/events", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ events })
    });
    return { status: result.status, payload: await result.json().catch(() => ({})) };
  });
  assert.equal(response.status, 200, JSON.stringify(response.payload));
}

async function main() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cq-platform-browser-"));
  const dbPath = path.join(tmpDir, "platform-browser.db");
  const port = await freePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const adminToken = "platform-browser-admin-token";
  const logs = [];
  let child;
  let browser;

  try {
    child = spawn(process.execPath, ["server.js", String(port)], {
      cwd: root,
      env: {
        ...process.env,
        DB_PATH: dbPath,
        HOST: "127.0.0.1",
        ADMIN_TOKEN: adminToken,
        LLM_PROVIDER: "mock",
        GRADING_LLM_PROVIDER: "mock",
        GRADING_API_KEY: "",
        OPENAI_COMPATIBLE_API_KEY: "",
        INNOSPARK_API_KEY: "",
        PROACTIVE_POLICY_MODE: "active",
        PROACTIVE_ASSIGNMENT_SALT: "platform-browser-smoke-fixed-salt",
        PROACTIVE_PUBLIC_CHAPTER_ONLY: "true",
        NODE_ENV: "test"
      },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true
    });
    child.stdout.on("data", (chunk) => logs.push(chunk.toString()));
    child.stderr.on("data", (chunk) => logs.push(chunk.toString()));
    await waitForHealth(baseUrl, child, logs);

    browser = await chromium.launch({
      executablePath: browserExecutable(),
      headless: true
    });
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const page = await context.newPage();
    const issues = collectBrowserIssues(page);
    await page.goto(`${baseUrl}/`, { waitUntil: "domcontentloaded" });
    await page.locator("#app-loader").waitFor({ state: "hidden", timeout: 20000 });

    await page.locator("#auth-gate").waitFor({ state: "visible", timeout: 20000 });
    const nickname = `浏览器回归${Date.now().toString().slice(-6)}`;
    await registerParticipant(page, nickname, "browser-smoke-123");

    await page.locator('[data-view="learn"]').first().click();
    await page.locator("#chapter-rail-toggle").click();
    await page.locator("#chapter-rail").waitFor({ state: "visible", timeout: 10000 });
    const chapterButtons = page.locator("#chapter-rail [data-chapter]");
    assert.equal(await chapterButtons.count(), 1, "试点学生端只应投影一个完整章");
    assert.equal(await chapterButtons.first().getAttribute("data-chapter"), "V14-C3");
    await page.locator('[data-chapter="V14-C3"]').click();
    await page.locator('[data-submit-quiz="V14-C3-pre"]').waitFor({ state: "visible", timeout: 20000 });
    assert.equal(await page.locator(".question-card").count(), 10);
    fs.mkdirSync(path.dirname(studentDesktopScreenshotPath), { recursive: true });
    await page.screenshot({ path: studentDesktopScreenshotPath, fullPage: true });

    await page.waitForTimeout(1500);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.locator("#app-loader").waitFor({ state: "hidden", timeout: 20000 });
    await page.locator('[data-submit-quiz="V14-C3-pre"]').waitFor({ state: "visible", timeout: 20000 });
    assert.equal(await page.locator(".question-card").count(), 10);
    assert.equal(
      await page.evaluate(() => ensureAgenticPath().unlocked.includes("V14-C3-pre")),
      true,
      "刷新后必须保留试点章前测的可访问状态"
    );
    if (await page.locator("#chapter-rail").isVisible()) {
      await page.locator("#chapter-rail-toggle").click();
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(250);
    const studentMobileLayout = await page.evaluate(() => ({
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: document.documentElement.clientWidth
    }));
    assert.ok(
      studentMobileLayout.documentWidth <= studentMobileLayout.viewportWidth + 1,
      `student page overflows mobile viewport: ${JSON.stringify(studentMobileLayout)}`
    );
    await page.screenshot({ path: studentMobileScreenshotPath, fullPage: true });
    await page.setViewportSize({ width: 1440, height: 1000 });

    if (!await page.locator("#chapter-rail").isVisible()) {
      await page.locator("#chapter-rail-toggle").click();
    }
    await page.locator('[data-chapter="V14-C3"]').click();
    await page.locator('[data-submit-quiz="V14-C3-pre"]').waitFor({ state: "visible", timeout: 20000 });
    await answerVisibleQuiz(page);
    await page.locator('[data-submit-quiz="V14-C3-pre"]').click();
    await page.locator('[data-submit-quiz="V14-C3-pre"]').filter({ hasText: "已提交" }).waitFor({ timeout: 30000 });
    const coachAction = page.locator("[data-agentic-action]").first();
    await coachAction.waitFor({ state: "visible", timeout: 30000 });
    await coachAction.click();
    await page.waitForFunction(() => currentUnitId !== "V14-C3-pre", null, { timeout: 30000 });
    assert.equal(
      await page.evaluate(() => ensureAgenticPath().unlocked.includes(currentUnitId)),
      true,
      "the confirmed Coach action must unlock the selected next unit"
    );
    await page.setViewportSize({ width: 390, height: 844 });
    const assistantPanel = page.locator("#knowledge-assistant-panel");
    if (await assistantPanel.getAttribute("aria-hidden") !== "false") {
      await page.locator("[data-knowledge-open]").click();
    }
    await assistantPanel.waitFor({ state: "visible", timeout: 10000 });
    const proactivePreference = page.locator("[data-knowledge-proactive-preference]");
    await proactivePreference.waitFor({ state: "visible", timeout: 10000 });
    const proactivePreferenceButtons = proactivePreference.locator("[data-proactive-preference]");
    assert.equal(await proactivePreferenceButtons.count(), 3);
    assert.deepEqual(
      await proactivePreferenceButtons.allTextContents(),
      ["标准", "少提醒", "关闭"]
    );
    const proactivePreferenceLayout = await proactivePreference.evaluate((node) => {
      const buttons = Array.from(node.querySelectorAll("[data-proactive-preference]"));
      const rect = node.getBoundingClientRect();
      return {
        left: rect.left,
        right: rect.right,
        buttons: buttons.map((button) => {
          const buttonRect = button.getBoundingClientRect();
          return {
            preference: button.dataset.proactivePreference,
            height: buttonRect.height,
            checked: button.getAttribute("aria-checked")
          };
        })
      };
    });
    assert.ok(
      proactivePreferenceLayout.left >= 0
      && proactivePreferenceLayout.right <= 390,
      `proactive preference escapes the mobile viewport: ${JSON.stringify(proactivePreferenceLayout)}`
    );
    assert.ok(
      proactivePreferenceLayout.buttons.every((button) => button.height >= 44),
      `proactive preference buttons need 44px mobile touch targets: ${JSON.stringify(proactivePreferenceLayout)}`
    );
    assert.equal(
      proactivePreferenceLayout.buttons.find((button) => button.preference === "standard")?.checked,
      "true"
    );
    await proactivePreference.locator('[data-proactive-preference="reduced"]').click();
    await page.waitForFunction(() => (
      document.querySelector('[data-proactive-preference="reduced"]')?.getAttribute("aria-checked") === "true"
      && document.querySelector("[data-knowledge-proactive-preference-status]")?.textContent === "仅保留强证据提醒"
    ));
    await proactivePreference.scrollIntoViewIfNeeded();
    await page.screenshot({ path: proactivePreferenceMobileScreenshotPath });
    await proactivePreference.locator('[data-proactive-preference="standard"]').click();
    await page.waitForFunction(() => (
      document.querySelector('[data-proactive-preference="standard"]')?.getAttribute("aria-checked") === "true"
    ));
    await page.evaluate(() => {
      const messages = document.querySelector("[data-knowledge-messages]");
      if (!messages) return;
      messages.replaceChildren();
      const check = document.createElement("article");
      check.className = "knowledge-message assistant knowledge-proactive-verification";
      check.dataset.proactiveCheckId = "GH-07-K03-probe-l1-v1";
      check.innerHTML = `
        <div><strong>无提示检查</strong><small>独立作答</small></div>
        <p>定积分换元时，除了替换内层表达式，还必须同步处理什么？</p>
        <div class="knowledge-proactive-verification-options" role="radiogroup">
          <button type="button" role="radio" aria-checked="false">只处理积分号</button>
          <button type="button" role="radio" aria-checked="true" class="is-selected">微分元，并把上下限改写为新变量的取值</button>
          <button type="button" role="radio" aria-checked="false">只把被积函数前的常数删掉</button>
        </div>
        <footer>
          <button type="button" class="is-primary">提交检查</button>
          <button type="button">暂不检查</button>
        </footer>
      `;
      messages.appendChild(check);
    });
    await page.waitForTimeout(250);
    await page.locator(".knowledge-proactive-verification footer").scrollIntoViewIfNeeded();
    const proactiveMobileLayout = await page.evaluate(() => {
      const panel = document.querySelector("#knowledge-assistant-panel");
      const check = document.querySelector(".knowledge-proactive-verification");
      const option = check?.querySelector(".knowledge-proactive-verification-options button");
      const panelRect = panel?.getBoundingClientRect();
      const checkRect = check?.getBoundingClientRect();
      const optionRect = option?.getBoundingClientRect();
      return {
        viewportWidth: document.documentElement.clientWidth,
        documentWidth: document.documentElement.scrollWidth,
        checkVisible: Boolean(check && getComputedStyle(check).display !== "none"),
        panelRect: panelRect ? {
          left: panelRect.left,
          right: panelRect.right,
          top: panelRect.top,
          bottom: panelRect.bottom
        } : null,
        checkRect: checkRect ? {
          left: checkRect.left,
          right: checkRect.right,
          top: checkRect.top,
          bottom: checkRect.bottom
        } : null,
        optionHeight: optionRect?.height || 0
      };
    });
    assert.equal(proactiveMobileLayout.checkVisible, true);
    assert.ok(proactiveMobileLayout.panelRect);
    assert.ok(proactiveMobileLayout.checkRect);
    assert.ok(
      proactiveMobileLayout.documentWidth <= proactiveMobileLayout.viewportWidth + 1,
      `mobile proactive verification overflows viewport: ${JSON.stringify(proactiveMobileLayout)}`
    );
    assert.ok(
      proactiveMobileLayout.checkRect.left >= proactiveMobileLayout.panelRect.left - 1
      && proactiveMobileLayout.checkRect.right <= proactiveMobileLayout.panelRect.right + 1,
      `verification card escapes the assistant panel: ${JSON.stringify(proactiveMobileLayout)}`
    );
    assert.ok(
      proactiveMobileLayout.optionHeight >= 40,
      `verification options need a stable mobile touch target: ${JSON.stringify(proactiveMobileLayout)}`
    );
    await page.screenshot({ path: proactiveMobileScreenshotPath });
    await page.locator("[data-knowledge-close]").click();
    await page.setViewportSize({ width: 1440, height: 1000 });

    await injectProactiveEvents(page);
    const firstParticipant = await page.evaluate(() => ({
      participantId: state.participant?.participantId || "",
      unitId: currentUnitId || ""
    }));
    assert.ok(firstParticipant.participantId);
    assert.ok(firstParticipant.unitId);
    await page.waitForTimeout(5500);
    await page.locator("#auth-menu-toggle").click();
    await page.locator("#auth-logout").click();
    await page.locator("#auth-gate").waitFor({ state: "visible", timeout: 20000 });

    const secondNickname = `浏览器换号${Date.now().toString().slice(-6)}`;
    await registerParticipant(page, secondNickname, "browser-switch-123");
    const secondParticipant = await page.evaluate(async () => {
      const target = getUnit("V14-C3-pre");
      analyticsEnterUnit(target, "cross_user_regression");
      await analyticsFlush();
      return {
        participantId: state.participant?.participantId || "",
        unitId: target?.id || ""
      };
    });
    assert.ok(secondParticipant.participantId);
    assert.notEqual(secondParticipant.participantId, firstParticipant.participantId);

    const interactionResponse = await fetch(
      `${baseUrl}/api/admin/stats/interactions?detail=all&limit=1000`,
      { headers: { Authorization: `Bearer ${adminToken}` } }
    );
    assert.equal(interactionResponse.status, 200);
    const interactionPayload = await interactionResponse.json();
    const interactionRows = interactionPayload.data.rows.map((row) => ({
      ...row,
      parsed: JSON.parse(row.payload || "{}")
    }));
    const firstParticipantEvents = interactionRows.filter((row) =>
      row.user_id === firstParticipant.participantId
    );
    const secondParticipantEvents = interactionRows.filter((row) =>
      row.user_id === secondParticipant.participantId
    );
    assert.ok(
      firstParticipantEvents.some((row) =>
        row.parsed.eventType === "session_end" && row.parsed.data?.reason === "logout"
      ),
      "the first participant must end their own analytics session before logout"
    );
    assert.ok(
      firstParticipantEvents.some((row) =>
        row.parsed.eventType === "time_on_unit"
        && row.parsed.unitId === firstParticipant.unitId
        && row.parsed.data?.reason === "logout"
      ),
      "the first participant must retain their own final unit dwell record"
    );
    assert.ok(
      secondParticipantEvents.some((row) => row.parsed.eventType === "session_start"),
      "the second participant must receive a fresh analytics session"
    );
    assert.equal(
      secondParticipantEvents.some((row) =>
        row.parsed.eventType === "time_on_unit"
        && row.parsed.unitId === firstParticipant.unitId
      ),
      false,
      "a previous participant's unit timer must never be attributed to the next participant"
    );

    const adminPage = await context.newPage();
    const adminIssues = collectBrowserIssues(adminPage);
    await adminPage.goto(`${baseUrl}/admin.html`, { waitUntil: "domcontentloaded" });
    await adminPage.locator("#admin-token-input").fill(adminToken);
    await adminPage.locator("#login-btn").click();
    await adminPage.locator("#app:not(.hidden)").waitFor({ timeout: 30000 });
    const submissionMetric = adminPage.locator("#overview-metrics .metric-card").filter({ hasText: "测验提交总数" });
    await submissionMetric.waitFor({ state: "visible", timeout: 30000 });
    assert.equal((await submissionMetric.locator(".value").textContent()).trim(), "1");

    await adminPage.locator('[data-tab="proactive"]').click();
    await adminPage.locator("#tab-proactive:not(.hidden)").waitFor({ timeout: 30000 });
    await adminPage.evaluate(() => {
      renderProactiveStudy({
        total: 3,
        rows: [
          {
            id: "visual-decision-l2",
            intervention_id: "visual-intervention-l2",
            created_at: "2026-08-30T10:10:00.000Z",
            nickname: "试点学生 A",
            user_id: "visual-user-a",
            experiment_id: "v14-c3-proactive-pilot-2026",
            condition: "treatment",
            cohort: "pilot",
            stratum: "pre-low",
            chapter_id: "V14-C3",
            unit_id: "GH-07-K03",
            scope_key: "GH-07-K03",
            scene_type: "simulation",
            candidate_kind: "independent_attempt_outcome",
            policy_mode: "active",
            policy_version: "v14-c3-fixed-v2",
            contract_version: "proactive-learning-contract-v1",
            adapter_version: "v14-c3-adapter-v2",
            decision: "intervene",
            delivery_decision: "intervene",
            action: "concept_hint",
            support_level: "L2",
            help_need_score: 0.94,
            interruptibility_score: 1,
            uncertainty_score: 0.06,
            reason_codes: [
              "continued_friction_after_self_explanation",
              "independent_task_boundary",
              "policy_thresholds_met"
            ],
            intervention_status: "accepted",
            resolution: "accepted",
            shown_at: "2026-08-30T10:10:02.000Z",
            resolved_at: "2026-08-30T10:10:05.000Z",
            latency_ms: 5000,
            followup_outcome: {
              studentResponse: {
                submitted: true,
                submittedAt: "2026-08-30T10:11:00.000Z",
                responseLength: 34
              },
              independentAttempt: {
                outcome: "independent_attempt_success",
                correct: 1,
                incorrect: 0,
                questionCount: 1,
                source: "courseware_semantic_event",
                eventType: "courseware_challenge_result",
                stage: "after_l2",
                recordedAt: "2026-08-30T10:12:00.000Z"
              }
            },
            current_policy_level: "L0",
            current_fade_level: 1,
            current_lifecycle: {
              phase: "exited",
              supportLevel: "L0",
              lastOutcome: "independent_attempt_success",
              attemptCount: 2,
              successEvidenceCount: 1,
              frictionEvidenceCount: 1
            },
            policy_state_updated_at: "2026-08-30T10:12:00.000Z"
          },
          {
            id: "visual-decision-l1",
            intervention_id: "visual-intervention-l1",
            created_at: "2026-08-30T10:00:00.000Z",
            nickname: "试点学生 A",
            user_id: "visual-user-a",
            experiment_id: "v14-c3-proactive-pilot-2026",
            condition: "treatment",
            cohort: "pilot",
            stratum: "pre-low",
            chapter_id: "V14-C3",
            unit_id: "GH-07-K03-formative",
            scope_key: "GH-07-K03",
            scene_type: "",
            candidate_kind: "formative_outcome",
            policy_mode: "active",
            policy_version: "v14-c3-fixed-v2",
            contract_version: "proactive-learning-contract-v1",
            adapter_version: "v14-c3-adapter-v2",
            decision: "intervene",
            delivery_decision: "intervene",
            action: "elicit_self_explanation",
            support_level: "L1",
            help_need_score: 0.92,
            interruptibility_score: 1,
            uncertainty_score: 0.08,
            reason_codes: [
              "confirmed_formative_error",
              "policy_thresholds_met"
            ],
            intervention_status: "accepted",
            resolution: "accepted",
            shown_at: "2026-08-30T10:00:02.000Z",
            resolved_at: "2026-08-30T10:00:06.000Z",
            latency_ms: 6000,
            followup_outcome: {
              studentResponse: {
                submitted: true,
                submittedAt: "2026-08-30T10:01:00.000Z",
                responseLength: 48
              },
              independentAttempt: {
                outcome: "continued_friction",
                correct: 0,
                incorrect: 1,
                questionCount: 1,
                checkId: "GH-07-K03-probe-l1-v1",
                source: "policy_owned_probe",
                eventType: "proactive_verification_submitted",
                stage: "after_l1",
                recordedAt: "2026-08-30T10:05:00.000Z"
              }
            },
            current_policy_level: "L0",
            current_fade_level: 1,
            current_lifecycle: {
              phase: "exited",
              supportLevel: "L0",
              lastOutcome: "independent_attempt_success",
              attemptCount: 2,
              successEvidenceCount: 1,
              frictionEvidenceCount: 1
            },
            policy_state_updated_at: "2026-08-30T10:12:00.000Z"
          },
          {
            id: "visual-decision-control",
            intervention_id: "",
            created_at: "2026-08-30T09:58:00.000Z",
            nickname: "试点学生 B",
            user_id: "visual-user-b",
            experiment_id: "v14-c3-proactive-pilot-2026",
            condition: "control",
            cohort: "pilot",
            stratum: "pre-high",
            chapter_id: "V14-C3",
            unit_id: "GH-06-K02",
            scope_key: "GH-06-K02",
            scene_type: "game",
            candidate_kind: "repeated_parameter",
            policy_mode: "active",
            policy_version: "v14-c3-fixed-v2",
            contract_version: "proactive-learning-contract-v1",
            adapter_version: "v14-c3-adapter-v2",
            decision: "intervene",
            delivery_decision: "stay_silent",
            action: "observe_change",
            support_level: "L1",
            help_need_score: 0.78,
            interruptibility_score: 0.82,
            uncertainty_score: 0.22,
            reason_codes: [
              "repeated_parameter_verified",
              "natural_parameter_boundary",
              "control_condition_suppressed"
            ],
            intervention_status: "",
            resolution: "",
            latency_ms: 0
          }
        ],
        assignments: [
          { condition: "control", stratum: "pre-high", participants: 1 },
          { condition: "treatment", stratum: "pre-low", participants: 1 }
        ],
        summary: {
          decisions: 3,
          participants: 2,
          policy_interventions: 3,
          delivered_interventions: 2,
          accepted: 2,
          dismissed: 0,
          ignored: 0,
          expired: 0,
          unresolved_offers: 0,
          protected_blocks: 0,
          l1_self_explanations: 1,
          l2_concept_hints: 1,
          continued_friction: 1,
          independent_success_exits: 1
        },
        policy: {
          mode: "active",
          experimentId: "v14-c3-proactive-pilot-2026",
          policyVersion: "v14-c3-fixed-v2",
          contractVersion: "proactive-learning-contract-v1",
          adapterVersion: "v14-c3-adapter-v2"
        }
      });
    });
    await adminPage.locator("#table-proactive-decisions tbody tr").first().waitFor({
      state: "visible",
      timeout: 10000
    });
    const proactiveAuditText = await adminPage.locator("#proactive-audit-detail").innerText();
    assert.match(proactiveAuditText, /引导自我解释/);
    assert.match(proactiveAuditText, /独立尝试失败/);
    assert.match(proactiveAuditText, /概念关系线索/);
    assert.match(proactiveAuditText, /独立尝试成功/);
    assert.match(proactiveAuditText, /已渐退退出/);
    assert.match(proactiveAuditText, /平台无提示近端验证题/);
    assert.match(proactiveAuditText, /课件语义结果事件/);
    await adminPage.screenshot({ path: proactiveAdminScreenshotPath, fullPage: true });
    await adminPage.setViewportSize({ width: 390, height: 844 });
    await adminPage.waitForTimeout(250);
    const proactiveAdminMobileLayout = await adminPage.evaluate(() => ({
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: document.documentElement.clientWidth,
      tableOverflowX: getComputedStyle(
        document.querySelector("#table-proactive-decisions")?.closest(".table-wrap")
      ).overflowX
    }));
    assert.ok(
      proactiveAdminMobileLayout.documentWidth <= proactiveAdminMobileLayout.viewportWidth + 1,
      `proactive admin page overflows mobile viewport: ${JSON.stringify(proactiveAdminMobileLayout)}`
    );
    assert.match(proactiveAdminMobileLayout.tableOverflowX, /auto|scroll/);
    await adminPage.screenshot({ path: proactiveAdminMobileScreenshotPath, fullPage: true });
    await adminPage.setViewportSize({ width: 1440, height: 1000 });

    await adminPage.locator('[data-tab="interactions"]').click();
    await adminPage.locator("#proactive-funnel-metrics .metric-card").first().waitFor({ timeout: 30000 });
    const shownMetric = adminPage.locator("#proactive-funnel-metrics .metric-card").filter({
      has: adminPage.locator(".label").filter({ hasText: /^建议展示$/ })
    });
    const acceptedMetric = adminPage.locator("#proactive-funnel-metrics .metric-card").filter({
      has: adminPage.locator(".label").filter({ hasText: /^接受$/ })
    });
    const shownCount = Number((await shownMetric.locator(".value").textContent()).trim());
    const acceptedCount = Number((await acceptedMetric.locator(".value").textContent()).trim());
    assert.ok(shownCount >= 1);
    assert.ok(acceptedCount >= 1);
    assert.ok(shownCount >= acceptedCount);

    fs.mkdirSync(path.dirname(screenshotPath), { recursive: true });
    await adminPage.screenshot({ path: screenshotPath, fullPage: true });
    await adminPage.locator('[data-tab="shortanswers"]').click();
    await adminPage.locator("#regrade-status-grid .regrade-status-item").first().waitFor({ timeout: 30000 });
    assert.equal(
      await adminPage.locator("#run-regrade-btn").isDisabled(),
      true,
      "mock grading must keep the historical regrade action disabled"
    );
    const regradeStatus = await adminPage.locator("#regrade-status-grid").innerText();
    assert.match(regradeStatus, /评分提供方[\s\S]*mock/);
    await adminPage.screenshot({ path: shortAnswerScreenshotPath, fullPage: true });

    await adminPage.setViewportSize({ width: 390, height: 844 });
    await adminPage.waitForTimeout(250);
    const mobileLayout = await adminPage.evaluate(() => {
      const visible = (element) => {
        const style = getComputedStyle(element);
        return style.display !== "none" && style.visibility !== "hidden" && element.getClientRects().length > 0;
      };
      const viewportWidth = document.documentElement.clientWidth;
      const overflowElements = Array.from(document.querySelectorAll("body *"))
        .filter(visible)
        .filter((element) => {
          if (element.closest(".table-wrap, .tabs")) return false;
          const rect = element.getBoundingClientRect();
          return rect.left < -1 || rect.right > viewportWidth + 1;
        })
        .slice(0, 10)
        .map((element) => ({
          tag: element.tagName,
          id: element.id || "",
          className: String(element.className || "")
        }));
      const tableWrap = document.querySelector("#table-regrade-candidates")?.closest(".table-wrap");
      return {
        documentWidth: document.documentElement.scrollWidth,
        viewportWidth,
        overflowElements,
        tableScrollWidth: tableWrap?.scrollWidth || 0,
        tableClientWidth: tableWrap?.clientWidth || 0,
        tableOverflowX: tableWrap ? getComputedStyle(tableWrap).overflowX : "",
        tableEmpty: tableWrap?.classList.contains("is-empty") || false
      };
    });
    assert.ok(
      mobileLayout.documentWidth <= mobileLayout.viewportWidth + 1,
      `admin page overflows mobile viewport: ${JSON.stringify(mobileLayout)}`
    );
    assert.deepEqual(
      mobileLayout.overflowElements,
      [],
      `visible admin controls overflow mobile viewport: ${JSON.stringify(mobileLayout.overflowElements)}`
    );
    assert.ok(mobileLayout.tableScrollWidth >= mobileLayout.tableClientWidth);
    if (!mobileLayout.tableEmpty && mobileLayout.tableScrollWidth > mobileLayout.tableClientWidth) {
      assert.match(mobileLayout.tableOverflowX, /auto|scroll/);
    } else {
      assert.equal(mobileLayout.tableOverflowX, "hidden");
    }
    await adminPage.screenshot({ path: mobileScreenshotPath, fullPage: true });
    await page.waitForTimeout(1000);
    assert.deepEqual([...issues, ...adminIssues], []);

    console.log(
      `platform browser smoke tests passed (${studentDesktopScreenshotPath}, ${studentMobileScreenshotPath}, ${proactivePreferenceMobileScreenshotPath}, ${proactiveMobileScreenshotPath}, ${screenshotPath}, ${proactiveAdminScreenshotPath}, ${proactiveAdminMobileScreenshotPath}, ${shortAnswerScreenshotPath}, ${mobileScreenshotPath})`
    );
  } finally {
    await browser?.close().catch(() => {});
    await stopChild(child);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
