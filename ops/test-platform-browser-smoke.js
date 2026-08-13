const assert = require("node:assert/strict");
const fs = require("node:fs");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { chromium } = require("playwright-core");

const root = path.resolve(__dirname, "..");
const screenshotPath = path.join(root, "tmp", "platform-browser-smoke-admin.png");
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
    await page.locator('[data-auth-mode="register"]').click();
    const nickname = `浏览器回归${Date.now().toString().slice(-6)}`;
    await page.locator("#nickname").fill(nickname);
    await page.locator("#register-password").fill("browser-smoke-123");
    await page.locator("#register-password-confirm").fill("browser-smoke-123");
    await page.locator("#login-submit").click();
    await page.locator("#auth-status").filter({ hasText: nickname }).waitFor({ timeout: 20000 });

    await page.locator('[data-view="learn"]').first().click();
    await page.locator("#chapter-rail-toggle").click();
    await page.locator("#chapter-rail").waitFor({ state: "visible", timeout: 10000 });
    await page.locator('[data-chapter="V14-C2"]').click();
    await page.locator('[data-submit-quiz="V14-C2-pre"]').waitFor({ state: "visible", timeout: 20000 });
    assert.equal(await page.locator(".quiz-preview-locked").count(), 1);
    assert.equal(await page.locator(".question-card").count(), 0);
    assert.equal(await page.locator("[data-choice-answer], [data-short-answer]").count(), 0);
    assert.equal(
      await page.evaluate(() => ensureAgenticPath().unlocked.includes("V14-C2-pre")),
      false
    );

    await page.waitForTimeout(1500);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.locator("#app-loader").waitFor({ state: "hidden", timeout: 20000 });
    await page.locator('[data-submit-quiz="V14-C2-pre"]').waitFor({ state: "visible", timeout: 20000 });
    assert.equal(await page.locator(".question-card").count(), 0);
    assert.equal(
      await page.evaluate(() => ensureAgenticPath().unlocked.includes("V14-C2-pre")),
      false,
      "refreshing a future quiz preview must not unlock it"
    );

    if (!await page.locator("#chapter-rail").isVisible()) {
      await page.locator("#chapter-rail-toggle").click();
    }
    await page.locator('[data-chapter="V14-C1"]').click();
    await page.locator('[data-submit-quiz="V14-C1-pre"]').waitFor({ state: "visible", timeout: 20000 });
    await answerVisibleQuiz(page);
    await page.locator('[data-submit-quiz="V14-C1-pre"]').click();
    await page.locator('[data-submit-quiz="V14-C1-pre"]').filter({ hasText: "已提交" }).waitFor({ timeout: 30000 });
    const coachAction = page.locator("[data-agentic-action]").first();
    await coachAction.waitFor({ state: "visible", timeout: 30000 });
    await coachAction.click();
    await page.waitForFunction(() => currentUnitId !== "V14-C1-pre", null, { timeout: 30000 });
    assert.equal(
      await page.evaluate(() => ensureAgenticPath().unlocked.includes(currentUnitId)),
      true,
      "the confirmed Coach action must unlock the selected next unit"
    );

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

    await page.locator('[data-auth-mode="register"]').click();
    const secondNickname = `浏览器换号${Date.now().toString().slice(-6)}`;
    await page.locator("#nickname").fill(secondNickname);
    await page.locator("#register-password").fill("browser-switch-123");
    await page.locator("#register-password-confirm").fill("browser-switch-123");
    await page.locator("#login-submit").click();
    await page.locator("#auth-status").filter({ hasText: secondNickname }).waitFor({ timeout: 20000 });
    const secondParticipant = await page.evaluate(async () => {
      const target = getUnit("V14-C2-pre");
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
      `platform browser smoke tests passed (${screenshotPath}, ${shortAnswerScreenshotPath}, ${mobileScreenshotPath})`
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
