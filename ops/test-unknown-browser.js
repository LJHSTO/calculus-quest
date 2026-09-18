"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright-core");

async function main() {
  const root = path.resolve(__dirname, "..");
  const url = process.env.UNKNOWN_TEST_URL
    || JSON.parse(fs.readFileSync(path.join(root, "output/函数极限预览.json"), "utf8")).url;
  const executablePath = ["C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"].find(fs.existsSync);
  const browser = await chromium.launch({ executablePath, headless: true, args: ["--no-proxy-server"] });
  try {
    const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
    page.setDefaultTimeout(45000);
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(url);
    await page.locator('[data-auth-mode="register"]').click();
    await page.locator("#nickname").fill(`不会选项${Date.now()}`);
    await page.locator("#register-password").fill("preview-test-password");
    await page.locator("#register-password-confirm").fill("preview-test-password");
    await page.locator("#login-submit").click();
    await page.locator("#auth-gate").waitFor({ state: "hidden" });
    await page.locator('[data-view="learn"]').first().click();
    const first = page.locator('[data-choice-answer][type="radio"]').first();
    await first.waitFor();
    for (const fieldset of await page.locator("fieldset").filter({ has: page.locator("[data-choice-answer]") }).all()) {
      assert.deepEqual(await fieldset.locator("[data-choice-answer]").evaluateAll(inputs => inputs.map(input => input.value)),
        ["A", "B", "C", "D", "__unknown__"]);
      const unknownLabel = fieldset.locator("label.unknown-choice-option");
      assert.equal((await unknownLabel.innerText()).trim(), "我不会");
      const lastChoice = await fieldset.locator('input[value="D"]').locator("..").boundingBox();
      const extraChoice = await unknownLabel.boundingBox();
      assert.ok(extraChoice.y >= lastChoice.y + lastChoice.height + 8, "我不会必须独立放在 A-D 下方");
    }
    const name = await first.getAttribute("name");
    const unknown = page.locator(`input[name="${name}"][value="__unknown__"]`);
    await first.check();
    await unknown.check();
    assert.equal(await first.isChecked(), false);
    const multiple = page.locator('[data-choice-answer][type="checkbox"]').first();
    const multipleName = await multiple.getAttribute("name");
    const multipleUnknown = page.locator(`input[name="${multipleName}"][value="__unknown__"]`);
    await multiple.check();
    await multipleUnknown.check();
    assert.equal(await multiple.isChecked(), false);
    await multiple.check();
    assert.equal(await multipleUnknown.isChecked(), false);
    await multipleUnknown.check();
    const textarea = page.locator("[data-short-answer]").first();
    const shortUnknown = page.locator("[data-short-unknown]").first();
    await textarea.fill("保留这份推理草稿");
    await shortUnknown.check();
    assert.equal(await textarea.isDisabled(), true);
    await shortUnknown.uncheck();
    assert.equal(await textarea.inputValue(), "保留这份推理草稿");
    await shortUnknown.check();
    const beforeReload = await page.evaluate(() => ({
      recovery: state.quizDraftRecovery, drafts: state.quizDrafts,
      generation: learningSnapshotGeneration, revision: learningSnapshotRevision
    }));
    await page.reload();
    await page.locator("[data-short-unknown]").first().waitFor({ state: "attached" });
    await page.waitForFunction(() => learningSnapshotReady === true);
    assert.equal(await page.locator("[data-short-unknown]").first().isChecked(), true,
      JSON.stringify({ beforeReload, afterReload: await page.evaluate(() => ({
        recovery: state.quizDraftRecovery, drafts: state.quizDrafts,
        generation: learningSnapshotGeneration, revision: learningSnapshotRevision
      })) }));
    assert.equal(await page.locator(`input[name="${multipleName}"][value="__unknown__"]`).isChecked(), true);
    await page.locator('[data-view="learn"]').first().click();
    const directory = path.join(root, "output/playwright/不会选项");
    fs.mkdirSync(directory, { recursive: true });
    await first.scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(directory, "四个知识选项与独立不会.png") });
    for (const width of [1366, 1920]) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
      await page.locator("[data-short-unknown]").first().scrollIntoViewIfNeeded();
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "测验页面横向溢出");
      await page.screenshot({ path: path.join(directory, `简答与不会-${width}.png`) });
    }
    await page.setViewportSize({ width: 1366, height: 768 });
    for (const input of await page.locator('[data-choice-answer][value="__unknown__"],[data-short-unknown]').all()) await input.check();
    const submitted = page.waitForResponse(response => response.url().endsWith("/api/learning/quiz/submit"));
    await page.getByRole("button", { name: "提交本次测验", exact: true }).click();
    const response = await submitted;
    assert.equal(response.status(), 200);
    const payload = await response.json();
    assert.equal(payload.results.length, 12);
    assert.ok(payload.results.every(row => row.score === 0 && row.isCorrect === false && row.status === "incorrect"));
    const saved = await page.evaluate(async () => {
      const response = await fetch("/api/learning/quiz-results", { headers: { Authorization: `Bearer ${state.authToken}` } });
      return (await response.json()).data;
    });
    assert.equal(saved.filter(row => row.unit_id === "V14-C1-pre").length, 12);
    assert.ok(saved.every(row => row.score === 0));
    if (!process.env.UNKNOWN_TEST_URL) {
      await page.evaluate(() => {
        const unit = getUnit("V14-C1-pre");
        const archived = unit.scene.content.quizConfig.archivedQuestions;
        state.quizAttempts = {};
        state.quizDrafts = {};
        state.quizResults = archived.map(question => ({
          unitId: unit.id, chapterId: unit.chapterId, questionId: question.id,
          response: "__unknown__", score: 0, maxScore: question.points,
          isCorrect: false, status: "incorrect"
        }));
        state.submittedQuizzes = [unit.id];
        renderQuiz(unit);
      });
      assert.match(await page.locator(".quiz-version-notice").innerText(), /旧版测验/);
      assert.equal(await page.locator('[data-question^="V14-C1-fl-r1-pre-"]').count(), 12);
      assert.equal(await page.locator('[data-choice-answer][value="D"]').count(), 0,
        "历史三选项答卷不能伪装成新版四选项答卷");
    }
    assert.deepEqual(errors, []);
    console.log("不会选项浏览器通过：单选/多选互斥、简答撤销、刷新恢复、两种桌面宽度显示、12题服务端零分与落库。");
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
