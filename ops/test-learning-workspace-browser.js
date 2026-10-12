const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const net = require("node:net");
const { spawn } = require("node:child_process");
const { chromium } = require("playwright-core");
const { buildCourseContextIndex } = require("../lib/learning-assistant");

const root = path.resolve(__dirname, "..");
const output = path.join(root, "output", "playwright");
const executablePath = [
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Google/Chrome/Application/chrome.exe"
].filter(Boolean).find((candidate) => fs.existsSync(candidate));

async function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
  });
}

async function register(page) {
  await page.locator('[data-auth-mode="register"]').click();
  await page.locator("#nickname").fill(`工作区验收${Date.now().toString().slice(-7)}`);
  await page.locator("#register-password").fill("workspace-test-password");
  await page.locator("#register-password-confirm").fill("workspace-test-password");
  await page.locator("#login-submit").click();
  await page.locator("#auth-gate").waitFor({ state: "hidden" });
}

// Seed only navigation eligibility, not courseware events, answers, notes, or assistant responses.
async function openKnowledgeFixture(page) {
  await page.evaluate(() => {
    const unit = getChapter().units.find((entry) => entry.type === "knowledge");
    const route = ensureAgenticPath();
    if (!route.unlocked.includes(unit.id)) route.unlocked.push(unit.id);
    currentUnitId = unit.id;
    currentChapterId = unit.chapterId;
    switchView("learn");
    renderAll();
    KnowledgeAssistant.sync();
  });
}

async function noOverflow(page, label) {
  await page.waitForFunction(() => !document.querySelector(".core-learning-workspace")
    ?.getAnimations().some((animation) => animation.playState === "running"));
  const sizes = await page.evaluate(() => ({
    content: document.documentElement.scrollWidth,
    viewport: document.documentElement.clientWidth
  }));
  assert.ok(sizes.content <= sizes.viewport + 1, `${label}: ${JSON.stringify(sizes)}`);
}

async function main() {
  assert.ok(executablePath, "需要已安装的 Chrome 或 Edge");
  fs.mkdirSync(output, { recursive: true });
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "cq-workspace-"));
  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  const server = spawn(process.execPath, ["server.js", String(port)], {
    cwd: root,
    env: {
      ...process.env, NODE_ENV: "test", HOST: "127.0.0.1",
      DB_PATH: path.join(temp, "workspace.db"), ADMIN_TOKEN: "workspace-test-admin",
      LLM_PROVIDER: "mock", GRADING_LLM_PROVIDER: "mock",
      PROACTIVE_POLICY_MODE: "off", RATE_LIMIT_MAX: "2000"
    },
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"]
  });
  let browser;
  let logs = "";
  server.stdout.on("data", (data) => { logs += data.toString(); });
  server.stderr.on("data", (data) => { logs += data.toString(); });
  try {
    let healthy = false;
    for (let i = 0; i < 80; i += 1) {
      try { healthy = (await fetch(`${base}/api/health`)).ok; } catch {}
      if (healthy || server.exitCode !== null) break;
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
    assert.ok(healthy, `测试服务启动失败：${logs}`);
    browser = await chromium.launch({ executablePath, headless: true });
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
    const errors = [];
    const consoleErrors = [];
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text().slice(0, 1200));
    });
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(base);
    await page.locator("#app-loader").waitFor({ state: "hidden" });
    await register(page);
    await page.locator('[data-view="learn"]').first().click();
    await page.locator('[data-workspace-tab="notes"]').click();
    assert.equal(await page.locator("#workspace-note-new").isDisabled(), true);
    assert.match(await page.locator("#workspace-notes").innerText(), /独立作答/);
    await page.locator('[data-workspace-tab="chat"]').click();
    let releaseSlide;
    const slideGate = new Promise((resolve) => { releaseSlide = resolve; });
    await page.route("**/assets/openmaic-classroom/frame.html", async (route) => {
      await slideGate;
      await route.continue();
    });
    await openKnowledgeFixture(page);
    await page.locator(".workspace-canvas-tabs").waitFor();
    assert.equal(await page.locator(".multi-scene-slide-panel").isVisible(), true);
    assert.equal(await page.locator(".multi-scene-scene-panel").isVisible(), false);
    await page.locator("#classroom-playback").waitFor();
    assert.equal(await page.locator('[data-openmaic-state="loading"] > .slide-wrap').isVisible(),
      false, "原生课件加载期间不能先展示另一套渲染再跳变");
    releaseSlide();
    await page.locator('[data-openmaic-state="ready"]').waitFor({ timeout: 30000 }).catch(async (error) => {
      console.error("上游渲染状态", errors, consoleErrors, await page.locator("iframe[data-openmaic-slide]").count());
      throw error;
    });
    const nativeSlide = await (await page.locator("iframe[data-openmaic-slide]").elementHandle()).contentFrame();
    assert.ok(await nativeSlide.locator(".slide-element").count() > 3, "应由上游 SlideCanvas 渲染真实课件元素");
    assert.ok(await nativeSlide.locator(".katex").count() > 0, "原生视图应保留数学公式排版");
    await page.locator('[data-workspace-canvas="interactive"]').click();
    await page.locator('[data-workspace-canvas="slide"]').click();
    const slideSamples = await page.evaluate(async () => {
      const frames = new Set();
      const samples = [];
      for (let i = 0; i < 100; i += 1) {
        await new Promise(requestAnimationFrame);
        const host = document.querySelector(".multi-scene-slide-fullscreen-stage");
        const wrap = host.querySelector("[data-slide-canvas]");
        frames.add(host.querySelector("iframe"));
        samples.push({ width: wrap.getBoundingClientRect().width, height: host.getBoundingClientRect().height });
      }
      return { frames: frames.size, tail: samples.slice(40) };
    });
    const slideJitter = Object.fromEntries(["width", "height"].map((key) => [
      key, Math.max(...slideSamples.tail.map((s) => s[key])) - Math.min(...slideSamples.tail.map((s) => s[key]))
    ]));
    console.log("讲解切换稳定性", { frames: slideSamples.frames, ...slideJitter });
    assert.equal(slideSamples.frames, 1, "切换后不得反复挂载slide");
    assert.ok(slideJitter.width <= 1 && slideJitter.height <= 1, "讲解画布静置后仍然抖动");
    await page.waitForFunction(() => !document.querySelector('[data-classroom-action="play"]').disabled);
    await page.locator('[data-classroom-action="play"]').click();
    await page.waitForFunction(() => typeof activeNarration !== "undefined" && activeNarration?.status === "playing");
    await page.locator("#classroom-playback-rate").selectOption("1.5");
    assert.equal(await page.evaluate(() => activeNarration.audio.playbackRate), 1.5);
    await page.locator('[data-classroom-action="play"]').click();
    assert.equal(await page.evaluate(() => activeNarration.status), "paused");
    await page.screenshot({ path: path.join(output, "OpenMAIC学习页-讲解.png") });
    const beforeCollapse = await page.locator(".player").boundingBox();
    await page.locator("#lesson-rail-toggle").click();
    await page.locator("#workspace-tools-toggle").click();
    await page.waitForTimeout(300);
    const afterCollapse = await page.locator(".player").boundingBox();
    assert.ok(afterCollapse.width > beforeCollapse.width + 400, "双侧栏收起后应把空间还给课件");
    assert.equal(await page.locator("#lesson-rail").isVisible(), false);
    assert.equal(await page.locator(".workspace-tabs").isVisible(), false);
    const nativeBounds = await nativeSlide.evaluate(() => {
      const slide = document.querySelector("#slide > div > div");
      const rect = slide.getBoundingClientRect();
      return { width: innerWidth, height: innerHeight, right: rect.right, bottom: rect.bottom };
    });
    assert.ok(nativeBounds.right <= nativeBounds.width + 1 && nativeBounds.bottom <= nativeBounds.height + 1,
      `上游课件不得裁切：${JSON.stringify(nativeBounds)}`);
    await page.screenshot({ path: path.join(output, "OpenMAIC学习页-专注.png") });
    await page.reload();
    await page.locator("#app-loader").waitFor({ state: "hidden" });
    await openKnowledgeFixture(page);
    assert.equal(await page.locator("#workspace-tools-toggle").getAttribute("aria-expanded"), "true");
    assert.equal(await page.locator("#lesson-rail-toggle").getAttribute("aria-expanded"), "true");
    await page.locator('[data-classroom-action="quote"]').click();
    await page.locator("#knowledge-assistant-panel").waitFor({ state: "visible" });
    await page.locator('[data-openmaic-state="ready"]').waitFor();
    await page.locator("[data-knowledge-pick]").click();
    const pickedSlide = await (await page.locator("iframe[data-openmaic-slide]").elementHandle()).contentFrame();
    await pickedSlide.locator("body.picking").waitFor();
    await pickedSlide.locator(".base-element-text").first().click();
    await page.locator("[data-knowledge-context-copy]").filter({ hasText: "小矩形" }).waitFor();
    const referencedRequest = page.waitForRequest((request) =>
      request.method() === "POST" && request.url().includes("/api/learning/assistant/ask"));
    const referencedResponse = page.waitForResponse((response) => response.url().includes("/api/learning/assistant/ask"));
    await page.locator("#knowledge-question-input").fill("请结合我引用的课件解释这个概念。");
    await page.locator("#knowledge-question-input").press("Enter");
    const referencedPayload = (await referencedRequest).postDataJSON();
    assert.equal(referencedPayload.contextRef.scope, "slide");
    assert.ok(referencedPayload.contextRef.semanticId, "应向服务端发送原生课件元素标识");
    const contextIndex = buildCourseContextIndex(JSON.parse(fs.readFileSync(path.join(root, "data/multi-scene-learning-route.json"), "utf8")));
    assert.ok(contextIndex.units.get(referencedPayload.unitId)?.objects.has(referencedPayload.contextRef.semanticId),
      "原生元素标识必须命中服务端真实课程对象索引");
    assert.equal(referencedPayload.sceneType, "", "讲解页提问不能被归为后台的互动场景");
    const answer = await referencedResponse;
    assert.equal(answer.status(), 200);
    await page.waitForFunction(() => !document.querySelector("[data-knowledge-send]").disabled, null, { timeout: 15000 });
    console.log("原生元素引用已完成真实提问与回复。");
    await pickedSlide.locator(".base-element-text .text").first().evaluate((node) => {
      const selection = getSelection();
      const range = document.createRange();
      range.selectNodeContents(node);
      selection.removeAllRanges();
      selection.addRange(range);
      document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    });
    await page.locator("[data-knowledge-selection-note]").click();
    await page.locator("#knowledge-note-input").fill("原生课件划线定位测试");
    await page.locator("[data-knowledge-note-save]").click();
    console.log("已保存原生课件划线笔记，检查高亮同步。");
    await pickedSlide.waitForFunction(() => CSS.highlights.get("note-amber")?.size > 0);
    await page.locator('[data-workspace-tab="notes"]').click();
    await page.locator(".workspace-note button").click();
    await page.locator("[data-knowledge-note-delete]").click();
    await pickedSlide.waitForFunction(() => CSS.highlights.get("note-amber")?.size === 0);
    await page.locator('[data-workspace-tab="chat"]').click();
    await page.locator('[data-workspace-canvas="interactive"]').click();
    await page.locator('[data-knowledge-scene="simulation"]').click();
    assert.equal(await page.locator("#workspace-tools-toggle").getAttribute("aria-expanded"), "true");
    assert.equal(await page.locator("#lesson-rail-toggle").getAttribute("aria-expanded"), "true");
    await page.locator(".iframe-loader").waitFor({ state: "hidden" });
    await page.screenshot({ path: path.join(output, "课件默认双栏.png") });
    await page.locator('[data-classroom-action="focus-canvas"]').click();
    const frameElement = page.locator("iframe[data-courseware-frame]");
    await frameElement.waitFor();
    const handle = await frameElement.elementHandle();
    const frame = await handle.contentFrame();
    await frame.waitForLoadState("domcontentloaded");
    await page.locator(".iframe-loader").waitFor({ state: "hidden" });
    await page.setViewportSize({ width: 1366, height: 768 });
    await noOverflow(page, "interactive-default");
    await frame.waitForFunction(() => {
      const canvas = document.querySelector("#canvas").getBoundingClientRect();
      return canvas.top >= -1 && canvas.bottom <= innerHeight + 1;
    });
    const initialInteractive = await frameElement.boundingBox();
    const footerBox = await page.locator(".classroom-footer").boundingBox();
    assert.ok(initialInteractive.y + initialInteractive.height <= footerBox.y + 1,
      `iframe 底部不能被裁掉：${JSON.stringify({ initialInteractive, footerBox })}`);
    console.log("互动默认区域", initialInteractive, await frame.evaluate(() => ({
      viewport: [innerWidth, innerHeight],
      canvas: document.querySelector("#canvas").getBoundingClientRect().toJSON()
    })));
    await page.screenshot({ path: path.join(output, "互动画布-默认尺寸.png") });
    assert.ok(initialInteractive.width >= 1000 && initialInteractive.height >= 500
      && initialInteractive.width / initialInteractive.height <= 2.21,
      `用户拓宽后画布应保持合理比例：${JSON.stringify(initialInteractive)}`);
    assert.equal(await page.evaluate(() => localStorage.getItem("classroomToolsCollapsed")), "0",
      "临时专注不能覆盖阅读侧栏偏好");
    await page.locator('[data-workspace-canvas="slide"]').click();
    assert.equal(await page.locator("#workspace-tools-toggle").getAttribute("aria-expanded"), "false");
    await page.locator('[data-classroom-action="focus-canvas"]').click();
    assert.equal(await page.locator("#workspace-tools-toggle").getAttribute("aria-expanded"), "true");
    assert.equal(await page.locator("#lesson-rail-toggle").getAttribute("aria-expanded"), "true");
    await page.locator('[data-workspace-canvas="interactive"]').click();
    await page.locator('[data-classroom-action="focus-canvas"]').click();
    await page.setViewportSize({ width: 1600, height: 1000 });
    await noOverflow(page, "interactive-restored");
    await frame.waitForFunction(() => innerWidth >= 1500);
    const controls = frame.locator('input[type="range"]');
    assert.ok(await controls.count() > 0, "真实互动课件应有参数控件");
    await controls.first().evaluate((input) => {
      input.value = "8";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await frame.locator("#mainBtn").click();
    await frame.evaluate(() => window.scrollTo(0, 0));
    await frame.waitForFunction(() => {
      const text = document.querySelector("#riemann-sum-display")?.textContent;
      return text && Number.isFinite(Number(text)) && Number(text) > 0;
    }).catch(async (error) => {
      console.error("课件动画状态", await frame.evaluate(() => ({
        url: location.pathname,
        status: document.querySelector("#status-text")?.textContent,
        sum: document.querySelector("#riemann-sum-display")?.textContent,
        animation: typeof state === "object" ? state : null
      })), errors);
      throw error;
    });
    await frame.evaluate(() => window.scrollTo(0, 0));
    await page.evaluate(() => window.scrollTo(0, 0));
    assert.ok(await frame.locator("canvas,svg").count() > 0, "应渲染真实课件图形");
    // Sidebar resizing must not reload the active interactive scene.
    const frameUrl = frame.url();
    await page.locator("#workspace-tools-toggle").click();
    await page.locator("#workspace-tools-toggle").click();
    assert.equal(frame.url(), frameUrl);
    assert.equal(await frame.evaluate(() => document.querySelector("#partition_count-slider").value), "8");
    await page.locator("#workspace-tools-toggle").click();
    await page.locator("#lesson-rail-toggle").click();
    await page.locator("#knowledge-assistant-panel").waitFor({ state: "visible" });
    await noOverflow(page, "assistant-expanded");
    const [player, assistant, rail] = await Promise.all([
      page.locator("#lesson-player").boundingBox(),
      page.locator("#knowledge-assistant-panel").boundingBox(),
      page.locator("#lesson-rail").boundingBox()
    ]);
    assert.ok(assistant.x >= player.x + player.width - 1, "助教不得遮住中央课件");
    assert.ok(assistant.y < 140, "助教应停靠在标签栏下方");
    assert.ok(rail.width > 150, "打开助教不能挤走桌面学习路径");
    await noOverflow(page, "desktop");
    assert.equal(await page.locator(".workspace-tabs button[aria-selected='true']").evaluate(
      (element) => getComputedStyle(element).borderBottomColor), "rgb(103, 87, 217)");
    await frame.waitForFunction(() => {
      const canvas = document.querySelector("#canvas").getBoundingClientRect();
      const controls = document.querySelector("#controls").getBoundingClientRect();
      return canvas.height >= innerHeight * .8 && canvas.width > 200
        && canvas.left >= controls.right - 2;
    }).catch(async (error) => {
      console.error("互动布局", JSON.stringify(await frame.evaluate(() => ({
        viewport: [innerWidth, innerHeight],
        elements: [".app-container", "#controls", "#canvas-container", "#canvas"].map((selector) => {
          const element = document.querySelector(selector);
          return { selector, rect: element.getBoundingClientRect().toJSON(),
            style: element.getAttribute("style") };
        })
      })), null, 2));
      throw error;
    });
    assert.ok(await frame.evaluate(() => {
      const canvas = document.querySelector("#canvas");
      const pixels = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
      let purple = 0;
      for (let i = 0; i < pixels.length; i += 16) {
        if (pixels[i + 2] > pixels[i] * 1.2 && pixels[i] > pixels[i + 1] * 1.1
          && pixels[i + 2] > 90 && pixels[i + 3] > 0) purple += 1;
      }
      return purple > 100;
    }), "面积图应有实际绘制的曲线和矩形像素");
    await page.screenshot({ path: path.join(output, "学习工作区-桌面.png") });
    await page.locator('[data-workspace-tab="notes"]').click();
    await page.locator("#workspace-note-new").click();
    await page.locator("#knowledge-note-input").waitFor({ state: "visible", timeout: 5000 }).catch(async (error) => {
      console.error("笔记浮层状态", await page.locator("#knowledge-note-input").evaluate((input) => {
        const nodes = [];
        for (let node = input; node; node = node.parentElement) {
          const css = getComputedStyle(node);
          nodes.push({ tag: node.tagName, id: node.id, cls: node.className, hidden: node.hidden,
            display: css.display, visibility: css.visibility, overflow: css.overflow,
            transform: css.transform, rect: node.getBoundingClientRect().toJSON() });
        }
        return nodes;
      }));
      throw error;
    });
    await page.locator("#knowledge-note-input").fill("先固定区间，再比较分割数变化后的面积误差。");
    const saved = page.waitForResponse((response) =>
      response.url().includes("/api/learning/notes") && response.request().method() === "PUT");
    await page.locator("[data-knowledge-note-save]").click();
    assert.equal((await saved).status(), 200);
    await page.locator(".workspace-note").waitFor();
    assert.match(await page.locator("#workspace-notes").innerText(), /固定区间/);
    await page.locator(".workspace-note button").click();
    await page.locator("#knowledge-note-input").fill("先固定区间，再比较分割数；完成后独立解释宽和高。");
    await page.locator("[data-knowledge-note-save]").click();
    await page.locator('[data-workspace-tab="profile"]').click();
    assert.match(await page.locator("#workspace-profile").innerText(), /1 条/);
    await page.locator('[data-workspace-tab="map"]').click();
    assert.ok(await page.locator("#workspace-map button").count() >= 3);
    await page.locator('[data-workspace-tab="map"]').press("Home");
    assert.equal(await page.locator('[data-workspace-tab="chat"]').getAttribute("aria-selected"), "true");
    await page.locator("[data-knowledge-close]").click();
    assert.equal(await page.locator("#workspace-tools-toggle").getAttribute("aria-expanded"), "false");
    await page.setViewportSize({ width: 1366, height: 768 });
    await noOverflow(page, "laptop");
    await frame.waitForFunction(() => {
      const rect = document.querySelector("#canvas").getBoundingClientRect();
      return rect.height >= innerHeight * .8 && rect.top >= -2 && rect.bottom <= innerHeight + 2;
    });
    await page.screenshot({ path: path.join(output, "学习工作区-笔记本.png") });
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.locator("#workspace-tools-toggle").click();
    await page.locator('[data-workspace-tab="chat"]').click();
    if (await page.locator('[data-knowledge-open]').isVisible()) await page.locator('[data-knowledge-open]').click();
    await noOverflow(page, "wide");
    await page.screenshot({ path: path.join(output, "学习工作区-宽屏.png") });
    // Exercise asynchronous Coach rendering with the real transition renderer.
    await page.evaluate(() => {
      const unit = getUnit();
      if (!state.completed.includes(unit.id)) state.completed.push(unit.id);
      agenticBeginKnowledgeTransition(unit);
      renderAgenticCoachPanel();
    });
    await page.waitForTimeout(100);
    const coachBounds = await page.locator("#agentic-coach-panel").boundingBox();
    assert.ok(coachBounds.height > 300, `Coach 选择不能被压进小滚动框：${JSON.stringify(coachBounds)}`);
    await page.locator("#workspace-coach-toggle").click();
    await frame.locator("#mainBtn").waitFor({ state: "visible" });
    assert.equal(await page.locator("#workspace-coach-toggle").innerText(), "选择下一步");
    await page.evaluate(() => focusAgenticCoachPanel());
    await page.locator("#agentic-coach-panel").waitFor({ state: "visible" });
    assert.equal(await page.locator("#workspace-coach-toggle").innerText(), "返回课件");
    await page.locator("#workspace-coach-toggle").click();
    assert.equal(await frame.locator("#partition_count-slider").inputValue(), "8");
    await page.locator("#workspace-coach-toggle").click();
    await page.locator("[data-knowledge-transition='formative']").waitFor({ state: "visible" });
    for (const viewport of [{ width: 1366, height: 768 }, { width: 1600, height: 1000 }, { width: 1920, height: 1080 }]) {
      await page.setViewportSize(viewport);
      await noOverflow(page, `coach-${viewport.width}`);
      const optionStyles = await page.locator(".knowledge-transition-actions > button").evaluateAll(
        (buttons) => buttons.map((button) => {
          const css = getComputedStyle(button);
          const rect = button.getBoundingClientRect();
          return { background: css.backgroundColor, color: css.color, width: rect.width, height: rect.height };
        }));
      assert.deepEqual(optionStyles[0], optionStyles[1], "跳过小测和做小测必须保持相同视觉权重");
      assert.equal(await page.locator("#lesson-player").isVisible(), false);
      assert.equal(await page.locator("#classroom-playback").isVisible(), false);
      for (const button of await page.locator("#agentic-coach-panel button").all()) {
        await button.click({ trial: true });
      }
      await page.screenshot({ path: path.join(output, `Coach选择-${viewport.width}.png`) });
      await page.locator("#workspace-coach-toggle").click();
      await page.waitForTimeout(300);
      const [courseBox, assistantBox] = await Promise.all([
        frameElement.boundingBox(), page.locator("#knowledge-assistant-panel").boundingBox()
      ]);
      assert.ok(courseBox.width > 600 && courseBox.height > 250,
        `课件应保有可操作区域：${JSON.stringify(courseBox)}`);
      assert.ok(courseBox.x + courseBox.width <= assistantBox.x, "助手不可覆盖课件");
      await frame.locator("#mainBtn").click({ trial: true });
      assert.equal(await frame.locator("#partition_count-slider").inputValue(), "8");
      const lectureToggle = page.locator('[data-classroom-action="toggle-lecture"]');
      if (await lectureToggle.getAttribute("aria-label") === "显示讲解") await lectureToggle.click();
      await page.waitForTimeout(100);
      const beforeLecture = (await frameElement.boundingBox()).height;
      await page.locator('[data-classroom-action="toggle-lecture"]').click();
      await page.waitForTimeout(100);
      assert.ok((await frameElement.boundingBox()).height > beforeLecture + 50, "隐藏讲解应真正释放画布高度");
      const embeddedBounds = await frame.evaluate(() => {
        const rect = document.querySelector("#canvas").getBoundingClientRect();
        return { top: rect.top, bottom: rect.bottom, height: innerHeight,
          toggleVisible: Boolean(document.querySelector(".mobile-toggle")?.getClientRects().length) };
      });
      assert.ok(embeddedBounds.top >= -1 && embeddedBounds.bottom <= embeddedBounds.height + 1
        && !embeddedBounds.toggleVisible, `嵌入式画布不可被课件手机导航挤出：${JSON.stringify(embeddedBounds)}`);
      await frame.locator("#controls").evaluate((element) => { element.scrollTop = 0; });
      await page.screenshot({ path: path.join(output, `Coach返回课件-${viewport.width}.png`) });
      await page.locator('[data-classroom-action="toggle-lecture"]').click();
      await page.locator("#workspace-coach-toggle").click();
    }
    await page.locator("[data-knowledge-transition='formative']").click();
    await page.waitForFunction(() => getUnit()?.type === "quiz");
    assert.equal(await page.locator("#lesson-player").isVisible(), true);
    await page.reload();
    await page.locator("#app-loader").waitFor({ state: "hidden" });
    await openKnowledgeFixture(page);
    if (await page.locator("#workspace-tools-toggle").getAttribute("aria-expanded") === "false") {
      await page.locator("#workspace-tools-toggle").click();
    }
    await page.locator('[data-workspace-tab="notes"]').click();
    await page.locator(".workspace-note").waitFor();
    assert.match(await page.locator("#workspace-notes").innerText(), /独立解释/);
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.locator('[data-workspace-canvas="interactive"]').click();
    if ((await page.locator('[data-classroom-action="focus-canvas"]').getAttribute("aria-pressed")) !== "true") {
      await page.locator('[data-classroom-action="focus-canvas"]').click();
    }
    let scenePositions = null;
    for (const scene of ["simulation", "mindMap", "game", "visualization3d"]) {
      await page.locator(`[data-knowledge-scene="${scene}"]`).click();
      await page.locator("iframe[data-courseware-frame]").waitFor();
      await page.locator(".iframe-loader").waitFor({ state: "hidden" });
      await noOverflow(page, scene);
      const sceneButtons = page.locator(".workspace-canvas-toolbar [data-knowledge-scene]");
      assert.deepEqual(await sceneButtons.evaluateAll((nodes) => nodes.map((node) => node.dataset.knowledgeScene)),
        ["simulation", "game", "mindMap", "visualization3d"], "推荐更新不能改变四场景位置");
      const layout = await sceneButtons.evaluateAll((nodes) => nodes.map((node) => {
        const box = node.getBoundingClientRect();
        const label = node.querySelector(".scene-option-copy").getBoundingClientRect();
        return { x: box.x, y: box.y, width: box.width, height: box.height, labelTop: label.top - box.top };
      }));
      if (scenePositions) {
        assert.ok(layout.every((box, index) => ["x", "y", "width", "height"].every(
          (key) => Math.abs(box[key] - scenePositions[index][key]) <= 1
        )), "切换场景不得移动四个选项或改变其尺寸");
      } else scenePositions = layout;
      assert.ok(layout.every((box) => Math.abs(box.labelTop - layout[0].labelTop) <= 2
        && Math.abs(box.height - layout[0].height) <= 1), "推荐和已选状态不能导致按钮或标题错位");
      assert.equal(await sceneButtons.filter({ has: page.locator(".scene-selection-badge") }).count(), 1);
      await page.locator('.workspace-canvas-toolbar [data-recommended="true"] .coach-recommendation-badge')
        .waitFor({ state: "visible" });
      const currentFrame = page.locator("iframe[data-courseware-frame]");
      const bounds = await currentFrame.boundingBox();
      const footer = await page.locator(".classroom-footer").boundingBox();
      assert.ok(bounds.width >= 1000 && bounds.height >= 500
        && bounds.width / bounds.height <= 2.21
        && bounds.y + bounds.height <= footer.y,
        `${scene} 应占据完整互动区域：${JSON.stringify(bounds)}`);
      const content = await (await currentFrame.elementHandle()).contentFrame();
      assert.ok(await content.locator("canvas,svg,button,input").count() > 0);
      await page.waitForTimeout(500);
      if (scene === "game") {
        await page.locator(".classroom-fullscreen-hint").waitFor({ state: "visible" });
        assert.match(await page.locator(".classroom-fullscreen-hint").innerText(), /建议全屏学习/);
        await page.screenshot({ path: path.join(output, "全屏学习建议-关闭按钮.png") });
        await page.getByRole("button", { name: "今天不再显示全屏建议" }).click();
        assert.equal(await page.locator(".classroom-fullscreen-hint").isVisible(), false);
        assert.equal(await page.evaluate(() => Boolean(document.fullscreenElement)
          || document.querySelector(".core-learning-workspace").classList.contains("is-local-fullscreen-target")), false);
        const start = content.locator("#start-screen button");
        const startBox = await start.boundingBox();
        assert.ok(startBox.y + startBox.height <= bounds.y + bounds.height,
          "游戏开始按钮应直接可见，无需寻找滚动位置");
        await start.click();
        await content.locator("#start-screen").waitFor({ state: "hidden" });
        await content.locator('button[onclick="autoFill()"]').click();
        assert.ok(Number(await content.locator("#rect-count").innerText()) > 0);
        const gameLayout = await content.evaluate(() => {
          const canvas = document.querySelector("#game-canvas").getBoundingClientRect();
          const controls = document.querySelector("#controls-panel").getBoundingClientRect();
          return { canvas: canvas.toJSON(), controls: controls.toJSON(), height: innerHeight };
        });
        assert.ok(gameLayout.canvas.width >= bounds.width - gameLayout.controls.width - 50
          && gameLayout.canvas.width >= 700 && gameLayout.canvas.height > 350
          && gameLayout.canvas.width / gameLayout.canvas.height <= 2.21
          && gameLayout.canvas.right <= gameLayout.controls.left
          && gameLayout.canvas.bottom <= gameLayout.height,
          `游戏画布和操作区应完整并排：${JSON.stringify(gameLayout)}`);
        await page.setViewportSize({ width: 1920, height: 912 });
        await noOverflow(page, "游戏宽屏拓宽");
        await content.waitForFunction(() => {
          const canvas = document.querySelector("#game-canvas").getBoundingClientRect();
          const controls = document.querySelector("#controls-panel").getBoundingClientRect();
          return innerWidth >= 1400 && canvas.width >= innerWidth - controls.width - 50
            && canvas.height > 350
            && canvas.width / canvas.height <= 2.21
            && canvas.right <= controls.left && canvas.bottom <= innerHeight;
        });
        await page.screenshot({ path: path.join(output, "互动画布-game-1920x912.png") });
        await page.setViewportSize({ width: 1366, height: 768 });
        await noOverflow(page, "游戏恢复笔记本");
      }
      if (scene === "visualization3d") {
        await content.waitForFunction(() => Boolean(window._camera));
        for (const viewport of [{ width: 1366, height: 768 }, { width: 1920, height: 1080 }]) {
          await page.setViewportSize(viewport);
          for (const view of ["3d", "top", "side"]) {
            await content.locator(`#view-${view}`).click();
            await page.waitForTimeout(1000);
            const framing = await content.evaluate(() => {
              const camera = window._camera;
              const group = window._threeObjects.curve_mesh;
              group.updateMatrixWorld(true);
              let outside = 0;
              let count = 0;
              group.traverse((object) => {
                const vertices = object.geometry?.attributes.position;
                if (!vertices) return;
                for (let i = 0; i < vertices.count; i += 1) {
                  const p = camera.position.clone().fromBufferAttribute(vertices, i)
                    .applyMatrix4(object.matrixWorld).project(camera);
                  count += 1;
                  if (Math.abs(p.x) > 1 || Math.abs(p.y) > 1 || Math.abs(p.z) > 1) outside += 1;
                }
              });
              const canvas = document.querySelector("#canvas-container canvas").getBoundingClientRect();
              const controls = document.querySelector("#controls").getBoundingClientRect();
              return { count, outside, bottom: canvas.bottom, controlsTop: controls.top };
            });
            assert.ok(framing.count > 100 && framing.outside === 0 && framing.bottom <= framing.controlsTop + 1,
              `${viewport.width}/${view} 曲线必须完整入镜且不被控件遮挡：${JSON.stringify(framing)}`);
            await page.screenshot({ path: path.join(output, `三维取景-${view}-${viewport.width}.png`) });
          }
          const before = await content.evaluate(() => window._camera.position.toArray());
          await content.locator("#zoom-in-btn").click();
          const after = await content.evaluate(() => window._camera.position.toArray());
          assert.notDeepEqual(after, before, "缩放必须真实改变相机位置");
        }
        await page.setViewportSize({ width: 1366, height: 768 });
        await content.locator("#view-3d").click();
        await page.waitForTimeout(1000);
      }
      await page.screenshot({ path: path.join(output, `互动画布-${scene}-1366.png`) });
    }
    await page.setViewportSize({ width: 1920, height: 912 });
    await page.evaluate(() => {
      const points = getChapter().units.filter((unit) => unit.type === "knowledge").slice(0, 4);
      const pending = {
        actions: [{ type: "review_knowledge", knowledgeChoices: points.map((unit, index) => ({
          id: unit.id, name: unit.label, moduleTitle: index < 2 ? "积分直觉：面积、累积与原函数" : "微积分基本定理与积分方法",
          mastery: 0, reviewMode: "review", checked: index < 2,
          choiceMode: index < 2 ? "review" : "skip", reason: "本次相关题目需要复盘。"
        })) }, { type: "continue" }]
      };
      const panel = document.querySelector("#agentic-coach-panel");
      panel.innerHTML = agenticRenderReviewSelectionPlan(pending);
      panel.hidden = false;
      LearningWorkspace.showCoach();
    });
    await page.locator(".agentic-bulk-toolbar").waitFor({ state: "visible" });
    const reviewLayout = await page.evaluate(() => {
      const toolbar = document.querySelector(".agentic-bulk-toolbar").getBoundingClientRect();
      const groups = [...document.querySelectorAll(".agentic-knowledge-group")].map(
        (node) => node.getBoundingClientRect().toJSON());
      return { toolbar: toolbar.toJSON(), groups };
    });
    assert.ok(reviewLayout.groups[0].top >= reviewLayout.toolbar.bottom,
      "批量选择栏必须在知识点分组上方，不能占用一列");
    assert.ok(reviewLayout.groups.every((group) => Math.abs(group.x - reviewLayout.toolbar.x) <= 1),
      "回看分组应左对齐，不能交错分布");
    await page.screenshot({ path: path.join(output, "后测回看选择-1920x912.png") });
    await page.evaluate(() => renderAgenticCoachPanel());
    if (process.env.WORKSPACE_DESKTOP_ONLY !== "1") {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.locator('[data-workspace-canvas="slide"]').click();
      await noOverflow(page, "手机讲解");
      assert.equal(await page.locator("#agentic-coach-panel").isVisible(), false);
      assert.equal(await page.locator(".multi-scene-knowledge-player [data-coach-strip]").first().isVisible(), false);
      assert.equal(await page.locator(".workspace-canvas-toolbar > .agentic-knowledge-choice").isVisible(), false);
      await page.screenshot({ path: path.join(output, "学习工作区-手机讲解.png"), fullPage: true });
      await page.locator('[data-workspace-canvas="interactive"]').click();
      for (const scene of ["simulation", "mindMap", "game", "visualization3d"]) {
        await page.locator(`[data-knowledge-scene="${scene}"]`).click();
        await page.locator(".iframe-loader").waitFor({ state: "hidden" });
        await noOverflow(page, `手机-${scene}`);
        const box = await page.locator("iframe[data-courseware-frame]").boundingBox();
        assert.ok(box.width >= 350 && box.height >= 500, `手机画布不可被挤窄：${JSON.stringify(box)}`);
        for (const button of await page.locator(".workspace-canvas-toolbar button").all()) {
          if (await button.isVisible()) await button.click({ trial: true });
        }
        await page.screenshot({ path: path.join(output, `学习工作区-手机-${scene}.png`), fullPage: true });
      }
    }
    assert.deepEqual(errors, []);
    assert.deepEqual(consoleErrors, []);
    console.log("学习工作区浏览器测试通过：上游原生渲染与公式、播放与倍速、元素引用、真实互动、双栏收起与恢复、笔记同步、测验锁和桌面布局。");
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
