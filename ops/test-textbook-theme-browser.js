const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const net = require("node:net");
const { spawn } = require("node:child_process");
const { chromium } = require("playwright-core");

const root = path.resolve(__dirname, "..");
const functionsLimits = process.env.TEXTBOOK_TEST_CHAPTER === "V14-C1";
const scienceSample = "https://www.ecsponline.com/yz/B80FF7491E2F84AB089693F76C9A2953E000.pdf";
const chineseExpected = {
  "GH-01-K01": `${scienceSample}#page=7`,
  "GH-01-K02": `${scienceSample}#page=8`,
  "GH-01-K03": `${scienceSample}#page=10`,
  "GH-02-K01": `${scienceSample}#page=21`,
  "GH-02-K02": `${scienceSample}#page=22`,
  "GH-02-K03": "https://academic.hep.com.cn/flsc/CN/chapter/978-7-04-034526-1/chapter04"
};
const expected = functionsLimits ? chineseExpected : {
  "GH-06-K01": "calculus-volume-1/pages/5-1-approximating-areas",
  "GH-06-K02": "calculus-volume-1/pages/5-2-the-definite-integral",
  "GH-06-K03": "calculus-volume-1/pages/4-10-antiderivatives",
  "GH-07-K01": "calculus-volume-1/pages/5-3-the-fundamental-theorem-of-calculus",
  "GH-07-K02": "calculus-volume-1/pages/5-3-the-fundamental-theorem-of-calculus",
  "GH-07-K03": "calculus-volume-1/pages/5-5-substitution",
  "GH-07-K04": "calculus-volume-2/pages/3-1-integration-by-parts"
};

async function main() {
  const port = await new Promise((resolve) => {
    const socket = net.createServer();
    socket.listen(0, "127.0.0.1", () => {
      const value = socket.address().port;
      socket.close(() => resolve(value));
    });
  });
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "cq-textbook-theme-"));
  const output = path.join(root, "output", "playwright", functionsLimits ? "中文教材入口" : "textbook-theme");
  fs.mkdirSync(output, { recursive: true });
  const server = spawn(process.execPath, ["server.js", String(port)], {
    cwd: root, windowsHide: true,
    env: { ...process.env, HOST: "127.0.0.1", NODE_ENV: "test",
      DB_PATH: path.join(temp, "test.db"), ADMIN_TOKEN: "textbook-test-admin",
      LLM_PROVIDER: "mock", GRADING_LLM_PROVIDER: "mock",
      PROACTIVE_EXPERIMENT_CHAPTER_ID: functionsLimits ? "V14-C1" : "V14-C3",
      PROACTIVE_POLICY_MODE: "off", RATE_LIMIT_MAX: "5000" },
    stdio: "ignore"
  });
  let browser;
  try {
    const base = `http://127.0.0.1:${port}`;
    let healthy = false;
    for (let i = 0; i < 80; i++) {
      try { healthy = (await fetch(`${base}/api/health`)).ok; } catch {}
      if (healthy) break;
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
    assert.ok(healthy, "Isolated server must start");
    const executablePath = [process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
      "C:/Program Files/Google/Chrome/Application/chrome.exe",
      "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"]
      .filter(Boolean).find((file) => fs.existsSync(file));
    browser = await chromium.launch({ executablePath, headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(base);
    await page.locator("#app-loader").waitFor({ state: "hidden" });
    await page.screenshot({ path: path.join(output, "登录-桌面.png") });
    await page.locator('[data-auth-mode="register"]').click();
    await page.locator("#nickname").fill("教材主题验收");
    await page.locator("#register-password").fill("textbook-test-password");
    await page.locator("#register-password-confirm").fill("textbook-test-password");
    await page.locator("#login-submit").click();
    await page.locator("#auth-gate").waitFor({ state: "hidden" });

    async function openUnit(id) {
      await page.evaluate((id) => {
        const unit = getChapter().units.find((entry) => entry.id === id);
        assertFixture(unit);
        function assertFixture(value) { if (!value) throw new Error(`Missing fixture: ${id}`); }
        const route = ensureAgenticPath();
        if (!route.unlocked.includes(id)) route.unlocked.push(id);
        currentUnitId = id;
        currentChapterId = unit.chapterId;
        switchView("learn");
        renderAll();
        KnowledgeAssistant.sync();
      }, id);
    }

    for (const [id, suffix] of Object.entries(expected)) {
      await openUnit(id);
      const link = page.locator(".textbook-reading");
      await link.waitFor();
      assert.equal(await link.count(), 1);
      assert.equal(await link.getAttribute("href"), functionsLimits ? suffix : `https://openstax.org/books/${suffix}`);
      assert.equal(await link.locator("span").innerText(), functionsLimits ? "中文" : "英文");
      assert.equal(await link.getAttribute("target"), "_blank");
      assert.match(await link.getAttribute("rel"), /noopener/);
      await page.locator('[data-workspace-canvas="interactive"]').click();
      assert.equal(await link.count(), 0, "No textbook on interactive surface");
      await page.locator('[data-workspace-canvas="slide"]').click();
      await link.waitFor();
    }
    await page.locator('[data-openmaic-state="ready"]').waitFor({ timeout: 20000 });
    await page.screenshot({ path: path.join(output, "教材入口-桌面.png") });
    // Inject only the read-only lock snapshot to exercise fail-closed rendering.
    await page.evaluate(() => {
      window.savedReadingAssistant = KnowledgeAssistant;
      window.KnowledgeAssistant = {
        ...savedReadingAssistant,
        workspaceSnapshot: () => ({ ...savedReadingAssistant.workspaceSnapshot(), locked: true })
      };
      dispatchEvent(new CustomEvent("cq:workspace-data-change"));
    });
    assert.equal(await page.locator(".textbook-reading").count(), 0, "Independent work lock hides textbook");
    await page.evaluate(() => {
      window.KnowledgeAssistant = savedReadingAssistant;
      delete window.savedReadingAssistant;
      dispatchEvent(new CustomEvent("cq:workspace-data-change"));
    });
    await page.locator(".textbook-reading").waitFor();
    const quizId = await page.evaluate(() => getChapter().units.find((unit) => unit.type === "quiz").id);
    await openUnit(quizId);
    assert.equal(await page.locator(".textbook-reading").count(), 0, "No textbook during quiz");

    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 });
      for (const view of ["home", "feedback", "progress"]) {
        await page.locator(`[data-view="${view}"]`).first().click();
        await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
        await page.screenshot({ path: path.join(output, `${view}-${width}.png`), fullPage: true });
        assert.ok(await page.evaluate(() =>
          document.documentElement.scrollWidth <= innerWidth + 1), `${view} horizontal overflow at ${width}`);
        assert.equal(await page.locator("body").evaluate((body) => getComputedStyle(body).backgroundColor), "rgb(244, 246, 248)");
      }
    }
    await openUnit(functionsLimits ? "GH-01-K01" : "GH-06-K01");
    await page.locator(".textbook-reading").waitFor();
    await page.screenshot({ path: path.join(output, "教材入口-手机.png"), fullPage: true });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    const login = await browser.newPage({ viewport: { width: 390, height: 740 } });
    await login.goto(base);
    await login.locator("#auth-gate").waitFor();
    for (const mode of ["login", "register"]) {
      await login.locator(`[data-auth-mode="${mode}"]`).click();
      await login.locator("#login-submit").scrollIntoViewIfNeeded();
      await login.screenshot({ path: path.join(output, `${mode}-手机.png`) });
      assert.ok(await login.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      assert.ok(await login.locator("#login-submit").isVisible());
    }
    assert.deepEqual(errors, []);
    console.log(`PASS: ${Object.keys(expected).length} textbook mappings, surface/quiz/independent-work protection, desktop/mobile theme and authentication layouts`);
  } finally {
    await browser?.close();
    server.kill();
    await new Promise((resolve) => server.exitCode !== null ? resolve() : server.once("exit", resolve));
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
