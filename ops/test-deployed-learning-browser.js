"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { chromium } = require("playwright-core");

const base = process.env.LEARNING_BASE_URL;
assert.ok(base && process.env.LEARNING_ALLOW_TEST_ACCOUNT === "1",
  "Set LEARNING_BASE_URL and LEARNING_ALLOW_TEST_ACCOUNT=1 for a synthetic deployment test.");
const output = path.resolve(process.env.LEARNING_BROWSER_OUTPUT || "output/公网学习验收");
const stages = [];
const started = Date.now();
function record(label, since) {
  const stage = { label, elapsedMs: Date.now() - since };
  stages.push(stage);
  console.log(JSON.stringify(stage));
}

async function main() {
  fs.mkdirSync(output, { recursive: true });
  const executablePath = [
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"
  ].find(fs.existsSync);
  const browser = await chromium.launch({
    executablePath, headless: true,
    ...(process.env.LEARNING_BROWSER_PROXY ? { proxy: { server: process.env.LEARNING_BROWSER_PROXY } } : {}),
    args: ["--disable-extensions", "--enable-webgl", "--ignore-gpu-blocklist", "--use-angle=swiftshader",
      ...(process.env.LEARNING_DISABLE_QUIC === "1" ? ["--disable-quic"] : []),
      ...(!process.env.LEARNING_BROWSER_PROXY ? ["--no-proxy-server"] : [])]
  });
  let page;
  const errors = [];
  const failures = [];
  const resources = [];
  const requests = new Map();
  const consoleErrors = [];
  try {
    page = await browser.newPage({ viewport: { width: 1366, height: 768 }, reducedMotion: "reduce" });
    page.setDefaultTimeout(45000);
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => {
      if (message.type() === "error") consoleErrors.push(message.text().slice(0, 800));
    });
    page.on("requestfailed", request => {
      if (!/ERR_ABORTED/.test(request.failure()?.errorText || "")) {
        failures.push({ path: new URL(request.url()).pathname, error: request.failure()?.errorText });
      }
    });
    page.on("response", response => {
      if (response.url().startsWith("http")) {
        const record = { path: new URL(response.url()).pathname, status: response.status(),
          contentType: response.headers()["content-type"] };
        resources.push(record);
        requests.set(response.request(), record);
      }
    });
    page.on("requestfinished", request => {
      const record = requests.get(request);
      if (record) record.completeMs = Math.round(request.timing().responseEnd);
    });
    console.log("开始公网冷启动");
    await page.goto(base, { waitUntil: "domcontentloaded", timeout: 90000 });
    await page.locator("#app-loader.hidden").waitFor({ state: "attached", timeout: 60000 });
    record("首次打开", started);
    await page.screenshot({ path: path.join(output, "01-首页.png") });
    const nickname = `工程验收勿纳入分析${Date.now()}`;
    const password = crypto.randomBytes(18).toString("hex");
    let since = Date.now();
    await page.locator('[data-auth-mode="register"]').click();
    await page.locator("#nickname").fill(nickname);
    await page.locator("#register-password").fill(password);
    await page.locator("#register-password-confirm").fill(password);
    await page.locator("#login-submit").click();
    await page.locator("#auth-gate").waitFor({ state: "hidden" });
    record("注册测试账号", since);
    await page.locator('[data-view="learn"]').first().click();
    const ordinaryEntry=page.getByRole('button',{name:'没有加入码，进入普通学习',exact:true});
    const preparation=await page.evaluate(async()=>{
      const r=await fetch('api/learning/learner-preferences',{headers:{Authorization:`Bearer ${state.authToken}`}});
      return (await r.json()).data.preparation;
    });
    if(preparation?.stage==='entry'){
      await ordinaryEntry.click();
      await page.locator('#pilot-dialog').waitFor({state:'hidden'});
    }
    await page.locator('[data-choice-answer][value="__unknown__"]').first().waitFor();
    for (const input of await page.locator('[data-choice-answer][value="__unknown__"],[data-short-unknown]').all()) {
      await input.check();
    }
    since = Date.now();
    const submission = page.waitForResponse(response => response.url().endsWith("/api/learning/quiz/submit"));
    await page.getByRole("button", { name: "提交本次测验", exact: true }).click();
    const response = await submission;
    assert.equal(response.status(), 200);
    const payload = await response.json();
    assert.equal(payload.results.length, 12);
    record("前测提交与服务端判分", since);
    const prepare=page.locator('[data-quiz-path-action="pilot-next"]');
    if(preparation?.required){
      await prepare.last().waitFor({state:'visible'});
      await prepare.last().click();
      await page.getByRole('button',{name:'先使用全部默认设置',exact:true}).click();
      await page.getByRole('button',{name:'保存并开始学习',exact:true}).click();
      await page.locator('#learner-setup').waitFor({state:'hidden'});
      record('六维默认设置保存与进入学习',since);
    }else{
      const coach=page.locator('#workspace-coach-toggle');
      if(await coach.isVisible())await coach.click();
      await page.getByRole("button", { name: /按.*开始学习/ }).first().click();
    }
    since = Date.now();
    await page.locator('[data-openmaic-state="ready"]').waitFor({ timeout: 45000 });
    const native = page.locator("iframe[data-openmaic-slide]").contentFrame();
    assert.ok(await native.locator(".slide-element").count() > 3);
    record("首次原生讲解", since);
    await page.screenshot({ path: path.join(output, "02-原生讲解.png") });
    assert.ok(!resources.some(item => item.path.endsWith("/highlighter.js")), "Math slides must not load optional code grammars.");
    for (const type of ["simulation", "mindMap", "game", "visualization3d"]) {
      since = Date.now();
      await page.locator('[data-workspace-canvas="interactive"]').click();
      await page.locator(`[data-knowledge-scene="${type}"]`).click();
      const iframe = page.locator("iframe[data-courseware-frame]");
      await iframe.waitFor();
      const frame = iframe.contentFrame();
      await frame.locator("body").waitFor();
      await frame.locator("body").evaluate(() => new Promise(resolve => {
        if (document.readyState === "complete") resolve();
        else window.addEventListener("load", resolve, { once: true });
      }));
      await page.waitForFunction(() => document.querySelector("iframe[data-courseware-frame]")
        ?.dataset.cqContextBridge === "ready");
      const ranges = frame.locator('input[type="range"]:visible');
      if (await ranges.count()) {
        const range = ranges.first();
        if (await range.isEnabled()) {
          await range.focus();
          await range.press("ArrowRight");
        }
      }
      if (type === "visualization3d") {
        const canvas = frame.locator("canvas:visible").first();
        await canvas.waitFor();
        const image = (await canvas.screenshot()).toString("base64");
        const colors = await frame.locator("body").evaluate(async (_body, encoded) => {
          const image = new Image();
          image.src = `data:image/png;base64,${encoded}`;
          await image.decode();
          const sample = document.createElement("canvas");
          sample.width = 96; sample.height = 96;
          const context = sample.getContext("2d");
          context.drawImage(image, 0, 0, 96, 96);
          const pixels = context.getImageData(0, 0, 96, 96).data;
          const values = new Set();
          for (let i = 0; i < pixels.length; i += 4) values.add(`${pixels[i] >> 4},${pixels[i + 1] >> 4},${pixels[i + 2] >> 4}`);
          return values.size;
        }, image);
        assert.ok(colors >= 12, `3D canvas is blank: ${colors}`);
      }
      record(`互动-${type}`, since);
      await page.screenshot({ path: path.join(output, `03-${type}.png`) });
    }
    if(process.env.LEARNING_LIVE_MODEL_SMOKE==='1'){
      since=Date.now();
      const toolsToggle=page.locator('#workspace-tools-toggle');
      if(await toolsToggle.getAttribute('aria-expanded')==='false')await toolsToggle.click();
      await page.locator('[data-workspace-tab="chat"]').click();
      await page.locator('#knowledge-question-input').fill('请用一个简单例子解释函数为什么要求每个输入只有一个输出，并用数学公式表示这个例子。');
      const answer=page.waitForResponse(r=>r.url().includes('/api/learning/assistant/ask')&&r.request().method()==='POST');
      await page.locator('[data-knowledge-send]').click();
      const response=await answer;assert.equal(response.status(),200);
      const events=(await response.text()).trim().split('\n').filter(Boolean).map(line=>JSON.parse(line));
      const done=events.find(e=>e.type==='done');assert.ok(done,'完整收到回答');assert.notEqual(done.fallback,true,'必须由真实模型回答');
      assert.match(done.message?.modelAudit?.requestedModel||'',/^gpt-5\.4-mini/,'当前公开网站使用指定的官方模型');
      const text=events.filter(e=>e.type==='delta').map(e=>e.delta).join('');assert.ok(text.length>30);
      fs.writeFileSync(path.join(output,'真实模型回答.json'),JSON.stringify({synthetic:true,provider:done.message?.provider||null,modelAudit:done.message?.modelAudit||null,fallback:done.fallback===true,text},null,2));
      await page.screenshot({path:path.join(output,'04-真实模型数学回答.png')});
      await toolsToggle.click();
      record('公网真实模型回答与完整流传输',since);
    }
    assert.equal(await page.evaluate(() => analyticsFlushUntilSettled()), true);
    since = Date.now();
    await page.reload({ waitUntil: "domcontentloaded", timeout: 60000 });
    await page.locator("#app-loader.hidden").waitFor({ state: "attached" });
    await page.waitForFunction(() => learningSnapshotReady === true);
    assert.equal(await page.locator("#auth-gate").isVisible(), false);
    record("刷新恢复登录与学习记录", since);
    assert.deepEqual(errors, []);
    assert.deepEqual(failures, []);
    fs.writeFileSync(path.join(output, "验收结果.json"), JSON.stringify({
      passed: true, base, stages, errors, failures, resources, testAccount: nickname,
      scope: "公网注册、前测提交、首个知识点原生讲解、四类互动、3D非空画布及刷新恢复。"
    }, null, 2));
    console.log("PUBLIC_LEARNING_FLOW_PASSED");
  } catch (error) {
    const frames = [];
    if (page) {
      for (const frame of page.frames()) {
        frames.push(await frame.evaluate(() => ({
          url: location.href, state: document.readyState, title: document.title,
          text: document.body?.innerText.slice(0, 400),
          scripts: [...document.scripts].map(script => script.src).filter(Boolean)
        })).catch(error => ({ message: error.message })));
      }
      await page.screenshot({ path: path.join(output, "失败现场.png"), timeout: 10000 }).catch(() => {});
      console.log("PAGE_TEXT", (await page.locator("body").innerText({ timeout: 5000 }).catch(() => "")).slice(0, 3000));
      console.log("FRAME_DIAGNOSTICS", JSON.stringify(frames));
      console.log("CONSOLE_ERRORS", JSON.stringify(consoleErrors));
    }
    fs.writeFileSync(path.join(output, "验收结果.json"), JSON.stringify({
      passed: false, base, stages, message: error.message, errors, failures, resources, frames, consoleErrors
    }, null, 2));
    throw error;
  } finally {
    await browser.close();
  }
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
