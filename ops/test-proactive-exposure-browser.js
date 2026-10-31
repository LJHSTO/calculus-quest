"use strict";

// Focused measurement fixtures do not simulate learning or establish human
// usability. verifyRealCandidate is also called by the real support lifecycle
// test, with server-issued L2/L3 offers and unmodified learner responses.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright-core");
const root = path.resolve(__dirname, "..");
const output = path.join(root, "output", "playwright", "主动曝光边界");
const helperFile = path.join(root, "app/main/proactive-exposure.js");
const realRuns = new WeakMap();
const realCases = [];

async function armRealCandidate(page) {
  if (!realRuns.has(page)) {
    const requests = [];
    page.on("request", request => {
      if (request.url().includes("/resolution")) requests.push({ url: request.url(), body: request.postDataJSON() });
    });
    realRuns.set(page, requests);
    await page.evaluate(() => {
      window.__exposureEvents = [];
      const original = analyticsTrack;
      analyticsTrack = function (eventType, payload) {
        if (eventType === "proactive_surface_visible" || eventType === "knowledge_proactive_suggestion_shown"
          || eventType === "knowledge_proactive_suggestion_interacted"
          || eventType === "knowledge_proactive_justification_prompted") {
          window.__exposureEvents.push({ eventType, data: payload?.data, at: performance.now() });
        }
        return original.apply(this, arguments);
      };
    });
  }
  await page.evaluate(() => {
    window.__exposureMask?.remove();
    window.__exposureMask = document.createElement("style");
    window.__exposureMask.textContent = ".knowledge-proactive-inline-offer{opacity:0!important}";
    document.head.append(window.__exposureMask);
  });
}

async function verifyRealCandidate(page, { mode = "qualified" } = {}) {
  fs.mkdirSync(output, { recursive: true });
  const originalView = await page.evaluate(() => KnowledgeAssistant.designSpaceSnapshot().view);
  const offer = await page.evaluate(() => KnowledgeAssistant.designSpaceSnapshot().offer);
  assert.ok(offer?.decisionId, "曝光验收必须使用真实服务器候选");
  const requests = realRuns.get(page);
  const receipts = () => requests.filter(row => row.url.includes(`/${offer.decisionId}/`)
    && row.body.resolution === "shown").map(row => row.body);
  const visible = () => page.evaluate(id => window.__exposureEvents.filter(row =>
    row.eventType === "proactive_surface_visible" && row.data.decisionId === id), offer.decisionId);
  const record = (name, input, expected, actual) => {
    realCases.push({ name, dimensions: ["D3", "D4", "D5", "D6"], input, expected, actual, result: "通过" });
    fs.writeFileSync(path.join(output, "真实学习流程曝光验收.json"), JSON.stringify({
      scope: "隔离数据库、真实服务器候选；遮挡与样式为可控测试条件；不作为真人学习效果证据", cases: realCases
    }, null, 2), "utf8");
  };
  const checkState = await page.evaluate(() => ({
    checkId: KnowledgeAssistant.designSpaceSnapshot().check?.id || null,
    phase: KnowledgeAssistant.designSpaceSnapshot().policyState?.lifecycle?.phase,
    nextSupportLevel: KnowledgeAssistant.designSpaceSnapshot().offer?.supportLevel
  }));
  assert.equal(checkState.checkId, null, "新帮助等待同意期间不能重放已结算的旧检查");
  assert.equal(await page.locator(".knowledge-proactive-verification:visible").count(), 0);
  record(`${offer.supportLevel} 待确认期间移除旧检查`, { completedCheck: "上一轮已提交", nextOffer: offer.supportLevel },
    { actionableCheckId: null, visibleOldChecks: 0 }, { ...checkState, visibleOldChecks: 0 });
  await page.evaluate(() => KnowledgeAssistant.setSupportView({ placement: "sidebar", modality: "tip" }));
  const native = page.locator("[data-knowledge-messages] .knowledge-proactive-inline-offer");
  await native.waitFor({ state: "visible" });
  await page.waitForTimeout(1150);
  assert.equal((await visible()).length, 0, "构造原生内联卡和隐藏渲染不能记纯曝光");
  assert.equal(receipts().length, 0, "未曝光也未交互时不得发送业务 shown");
  record(`${offer.supportLevel} 原生隐藏渲染`, { placement: "sidebar", modality: "tip", opacity: 0, waitMs: 1150 },
    { qualifiedExposures: 0, shownReceipts: 0 }, { qualifiedExposures: 0, shownReceipts: 0 });
  if (mode === "interaction") {
    // Keep the actual form mounted in the surface that the lifecycle test will
    // continue using; moving an open form is not part of this quick-click test.
    await page.evaluate(view => KnowledgeAssistant.setSupportView(view), originalView);
    const interactiveOffer = page.locator(".learning-support-surface .knowledge-proactive-inline-offer");
    await interactiveOffer.waitFor({ state: "visible" });
    await page.evaluate(() => window.__exposureMask.remove());
    await interactiveOffer.scrollIntoViewIfNeeded();
    await interactiveOffer.locator("footer button.is-primary").click();
    const immediateCount = (await visible()).length;
    await page.evaluate(() => { window.__exposureMask.textContent = ".knowledge-proactive-inline-offer{opacity:0!important}";
      document.head.append(window.__exposureMask); });
    assert.equal(immediateCount, 0, "快速接受不得混入纯曝光计数");
    for (let i = 0; i < 20 && !receipts().length; i++) await page.waitForTimeout(100);
    assert.equal(receipts().length, 1);
    assert.equal(receipts()[0].exposureSource, "explicit_interaction");
    assert.equal(receipts()[0].qualifiedVisible, false);
    assert.equal(receipts()[0].visibleDurationMs, 0);
    record(`${offer.supportLevel} 快速接受`, { visibleForLessThanMs: 1000, action: "接受并展开理由" },
      { qualifiedExposuresAtClick: 0, shownReceipts: 1, exposureSource: "explicit_interaction", qualifiedVisible: false },
      { qualifiedExposuresAtClick: immediateCount, shownReceipts: receipts().length, receipt: receipts()[0] });
    await page.evaluate(() => window.__exposureMask.remove());
    const draft = "我会先区分输入、输出与对应规则，再说明这个线索为什么合适。";
    await interactiveOffer.locator("[data-proactive-justify-input]").fill(draft);
    const expectedPolicy = await page.evaluate(() => ({
      supportLevel: KnowledgeAssistant.designSpaceSnapshot().offer.supportLevel,
      body: KnowledgeAssistant.designSpaceSnapshot().offer.body,
      lifecyclePhase: KnowledgeAssistant.designSpaceSnapshot().policyState.lifecycle.phase,
      checkId: KnowledgeAssistant.designSpaceSnapshot().check?.id || null
    }));
    for (const view of [{ placement: "sidebar", modality: "tip" },
      { placement: "inline", modality: "example" }, { placement: "sidebar", modality: "chat" }, originalView]) {
      await page.evaluate(view => KnowledgeAssistant.setSupportView(view), view);
      const restoredOffer = page.locator(".knowledge-proactive-inline-offer:visible");
      await restoredOffer.locator("[data-proactive-justify]").waitFor({ state: "visible" });
      const actualDraft = await restoredOffer.locator("[data-proactive-justify-input]").inputValue();
      assert.equal(actualDraft, draft, "D4切换不能丢失学生已写理由");
      assert.equal(await restoredOffer.locator("footer").isVisible(), false);
      const actualPolicy = await page.evaluate(() => ({
        supportLevel: KnowledgeAssistant.designSpaceSnapshot().offer.supportLevel,
        body: KnowledgeAssistant.designSpaceSnapshot().offer.body,
        lifecyclePhase: KnowledgeAssistant.designSpaceSnapshot().policyState.lifecycle.phase,
        checkId: KnowledgeAssistant.designSpaceSnapshot().check?.id || null
      }));
      assert.deepEqual(actualPolicy, expectedPolicy);
      record(`理由草稿跨 ${view.placement}/${view.modality} 保留`, { candidate: offer.decisionId, draft, view },
        { draftPreserved: true, justificationOpen: true, supportUnchanged: true },
        { draftPreserved: actualDraft === draft, justificationOpen: true, supportUnchanged: true, policy: actualPolicy });
    }
    const prompted = await page.evaluate(id => window.__exposureEvents.filter(row =>
      row.eventType === "knowledge_proactive_justification_prompted" && row.data.decisionId === id).length, offer.decisionId);
    assert.equal(prompted, 1, "跨D4恢复理由表单不能重复记录被问过理由");
    record("跨呈现恢复不重复计算理由提示", { switches: 4, candidate: offer.decisionId },
      { prompted: 1 }, { prompted });
    await page.screenshot({ path: path.join(output, "真实候选-快速接受与理由.png") });
    return { acceptAlreadyClicked: true };
  }
  await page.evaluate(() => window.__exposureMask.remove());
  await native.scrollIntoViewIfNeeded();
  await page.waitForTimeout(1250);
  const nativeVisible = await visible();
  if (!nativeVisible.length) {
    const geometry = await native.evaluate(node => ({ candidate: node.getBoundingClientRect().toJSON(),
      ancestors: [...(function* () { for(let current=node;current;current=current.parentElement) yield current; })()]
        .map(current => ({ class: current.className, hidden: current.hidden, ariaHidden: current.getAttribute("aria-hidden"),
          rect: current.getBoundingClientRect().toJSON(), display: getComputedStyle(current).display,
          visibility: getComputedStyle(current).visibility, opacity: getComputedStyle(current).opacity,
          overflow: getComputedStyle(current).overflow, clientHeight: current.clientHeight })) }));
    fs.writeFileSync(path.join(output, "原生曝光未合格诊断.json"), JSON.stringify(geometry, null, 2), "utf8");
    await page.screenshot({ path: path.join(output, "原生曝光未合格诊断.png") });
  }
  assert.equal(nativeVisible.length, 1, "原生sidebar tip连续可见满1秒必须记一次纯曝光");
  assert.ok(nativeVisible[0].data.fraction >= 0.5 && nativeVisible[0].data.visibleDurationMs >= 1000);
  assert.equal(receipts().length, 1);
  assert.equal(receipts()[0].exposureSource, "qualified_visible");
  assert.equal(receipts()[0].qualifiedVisible, true);
  record("原生 sidebar × tip 合格曝光", { visibility: "前台、卡片至少50%、连续1秒" },
    { qualifiedExposures: 1, shownReceipts: 1, source: "qualified_visible" },
    { qualifiedExposures: nativeVisible.length, shownReceipts: receipts().length, evidence: nativeVisible[0].data });
  await page.screenshot({ path: path.join(output, "真实候选-原生助教栏.png") });
  const before = await page.evaluate(() => ({ level: KnowledgeAssistant.designSpaceSnapshot().offer.supportLevel,
    body: KnowledgeAssistant.designSpaceSnapshot().offer.body, check: KnowledgeAssistant.designSpaceSnapshot().check?.id || null }));
  await page.evaluate(() => KnowledgeAssistant.setSupportView({ placement: "inline", modality: "chat" }));
  const alternate = page.locator(".learning-support-surface .knowledge-proactive-inline-offer");
  await alternate.waitFor({ state: "visible" });
  await alternate.scrollIntoViewIfNeeded();
  await page.waitForTimeout(1200);
  assert.equal((await visible()).length, 1, "换位置与形式不能重复累计同一候选纯曝光");
  assert.equal(receipts().length, 1, "原生/alternate共用业务 shown 幂等");
  const after = await page.evaluate(() => ({ level: KnowledgeAssistant.designSpaceSnapshot().offer.supportLevel,
    body: KnowledgeAssistant.designSpaceSnapshot().offer.body, check: KnowledgeAssistant.designSpaceSnapshot().check?.id || null }));
  assert.deepEqual(after, before, "D4变化不改变D3内容/层级及D6检查");
  record("原生转 alternate 后候选幂等与维度隔离", { from: "sidebar/tip", to: "inline/chat", candidate: offer.decisionId },
    { qualifiedExposures: 1, shownReceipts: 1, supportUnchanged: true },
    { qualifiedExposures: (await visible()).length, shownReceipts: receipts().length, supportUnchanged: true });
  await page.screenshot({ path: path.join(output, "真实候选-课件旁对话.png") });
  await page.evaluate(view => KnowledgeAssistant.setSupportView(view), originalView);
  return { acceptAlreadyClicked: false };
}

async function fixtureMain() {
  fs.mkdirSync(output, { recursive: true });
  const executablePath = [process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"].filter(Boolean).find(fs.existsSync);
  assert.ok(executablePath, "需要 Chrome 或 Edge");
  const browser = await chromium.launch({ executablePath, headless: true });
  const page = await browser.newPage({ viewport: { width: 1000, height: 700 } });
  const cases = [];
  const count = () => page.evaluate(() => window.receipts.length);
  const sample = () => page.evaluate(() => window.receipts);
  const setup = async (key, height = 100) => page.evaluate(({ key, height }) => {
    window.monitor?.dispose(); window.receipts = []; window.validOwner = "学生甲";
    document.body.innerHTML = '<h1>主动帮助曝光边界验收</h1><p>这是测量夹具，不包含学习成绩。</p><div id="clip" style="width:400px;height:100px;overflow:hidden"><article id="offer" style="box-sizing:border-box;width:400px;height:200px;background:#eef6f3;padding:20px">知点建议：先说说你观察到的变化。</article><div style="height:400px" aria-hidden="true"></div></div>';
    document.querySelector("#clip").style.height = `${height}px`;
    window.target = document.querySelector("#offer");
    window.monitor = ProactiveExposure.createMonitor({ onQualified: receipt => receipts.push(receipt) });
    window.watch = (candidateKey, owner = "学生甲") => monitor.watch(target, { key: candidateKey,
      valid: () => validOwner === owner, metadata: { owner } });
    watch(key);
  }, { key, height });
  async function test(name, input, expected, run) {
    try { const actual = await run(); cases.push({ name, dimensions: ["D4", "D5", "D6"], input, expected, actual, result: "通过" }); }
    catch (error) { cases.push({ name, input, expected, actual: await sample(), result: "失败", error: error.message }); throw error; }
    finally { fs.writeFileSync(path.join(output, "曝光测量边界验收.json"), JSON.stringify({
      scope: "真实Chromium中的独立测量夹具；隐藏页以document.hidden状态和visibilitychange事件模拟；非真人研究", cases
    }, null, 2), "utf8"); }
  }
  try {
    await page.setContent('<html lang="zh-CN"><body></body></html>');
    await page.addScriptTag({ path: helperFile });
    await test("49%不得曝光", { cardHeight: 200, visibleHeight: 98, waitMs: 1200 }, { count: 0 }, async () => {
      await setup("49", 98); await page.waitForTimeout(1200); assert.equal(await count(), 0);
      await page.screenshot({ path: path.join(output, "测量夹具-49百分比.png") }); return { count: await count() };
    });
    await test("50%连续1秒才曝光", { cardHeight: 200, visibleHeight: 100, firstWaitMs: 450, totalWaitMs: 1200 },
      { beforeOneSecond: 0, final: 1, fraction: 0.5, minimumDurationMs: 1000 }, async () => {
        await setup("50"); await page.waitForTimeout(450); const early = await count(); assert.equal(early, 0);
        await page.waitForTimeout(750); const rows = await sample(); assert.equal(rows.length, 1);
        assert.equal(rows[0].fraction, 0.5); assert.ok(rows[0].visibleDurationMs >= 1000);
        await page.screenshot({ path: path.join(output, "测量夹具-50百分比.png") }); return { beforeOneSecond: early, receipt: rows[0] };
      });
    await test("同一候选再次观察不重复", { key: "50", repeats: 2, waitMs: 1200 }, { count: 1 }, async () => {
      await page.evaluate(() => { watch("50"); watch("50"); }); await page.waitForTimeout(1200);
      assert.equal(await count(), 1); return { count: await count() };
    });
    for (const [name, hide, show] of [
      ["滚出可见区域后重新计时", () => { document.querySelector("#clip").scrollTop = 200; }, () => { document.querySelector("#clip").scrollTop = 0; }],
      ["父容器折叠后重新计时", () => { document.querySelector("#clip").hidden = true; }, () => { document.querySelector("#clip").hidden = false; }],
      ["父容器透明后重新计时", () => { document.querySelector("#clip").style.opacity = "0"; }, () => { document.querySelector("#clip").style.opacity = "1"; }],
      ["原生弹窗覆盖后重新计时", () => { const dialog=document.createElement('dialog');dialog.id='exposure-blocker';dialog.textContent='学习回顾';document.body.append(dialog);dialog.showModal(); }, () => { document.querySelector('#exposure-blocker').close();document.querySelector('#exposure-blocker').remove(); }],
      ["隐藏页恢复后重新计时", () => { Object.defineProperty(document, "hidden", { configurable: true, get: () => true }); document.dispatchEvent(new Event("visibilitychange")); },
        () => { delete document.hidden; document.dispatchEvent(new Event("visibilitychange")); }]
    ]) {
      await test(name, { initialVisibleMs: 650, interruptionMs: 150, resumedFirstMs: 650, resumedTotalMs: 1150 },
        { beforeFreshOneSecond: 0, final: 1 }, async () => {
          await setup(name); await page.waitForTimeout(650); await page.evaluate(hide); await page.waitForTimeout(150);
          await page.evaluate(show); await page.waitForTimeout(650); const early = await count(); assert.equal(early, 0);
          await page.waitForTimeout(500); assert.equal(await count(), 1); return { beforeFreshOneSecond: early, receipt: (await sample())[0] };
        });
    }
    await test("候选替换后重新计时", { oldKey: "旧候选", oldVisibleMs: 650, newKey: "新候选", newFirstMs: 650 },
      { oldReceipts: 0, newReceiptsAfterOneSecond: 1 }, async () => {
        await setup("旧候选"); await page.waitForTimeout(650); await page.evaluate(() => watch("新候选"));
        await page.waitForTimeout(650); assert.equal(await count(), 0); await page.waitForTimeout(500);
        const rows = await sample(); assert.equal(rows.length, 1); assert.equal(rows[0].key, "新候选"); return { receipts: rows };
      });
    await test("身份失效不把旧候选记给新身份", { oldOwner: "学生甲", oldVisibleMs: 650, newOwner: "学生乙" },
      { oldOwnerReceipts: 0, newOwnerReceiptsAfterOneSecond: 1 }, async () => {
        await setup("甲的候选"); await page.waitForTimeout(650); await page.evaluate(() => { validOwner = "学生乙"; monitor.refresh(); });
        await page.waitForTimeout(600); assert.equal(await count(), 0);
        await page.evaluate(() => { monitor.clear({ forget: true }); watch("乙的候选", "学生乙"); });
        await page.waitForTimeout(650); assert.equal(await count(), 0); await page.waitForTimeout(500);
        const rows = await sample(); assert.equal(rows.length, 1); assert.equal(rows[0].owner, "学生乙"); return { receipts: rows };
      });
    await test("移除再挂载后重新计时", { beforeRemovalMs: 650, detachedMs: 150, afterRemountFirstMs: 650 },
      { beforeFreshOneSecond: 0, final: 1 }, async () => {
        await setup("重挂载"); await page.waitForTimeout(650); await page.evaluate(() => target.remove()); await page.waitForTimeout(150);
        await page.evaluate(() => { document.querySelector("#clip").prepend(target); watch("重挂载"); });
        await page.waitForTimeout(650); const early = await count(); assert.equal(early, 0); await page.waitForTimeout(500);
        assert.equal(await count(), 1); return { beforeFreshOneSecond: early, receipt: (await sample())[0] };
      });
    console.log(`主动曝光测量边界：${cases.length}/${cases.length} 通过；逐例输入、预期与实际已保存。`);
  } finally { await browser.close(); }
}

module.exports = { armRealCandidate, verifyRealCandidate };
if (require.main === module) fixtureMain().catch(error => { console.error(error); process.exitCode = 1; });
