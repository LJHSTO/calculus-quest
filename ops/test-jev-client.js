"use strict";

/**
 * Jev 判断层（TypeSafe System One）的行为测试。
 *
 * 为什么这个模块最需要测试：它是唯一一个**依赖外部网络**的部件，而且它的正确性
 * 全在"出错的时候"——超时、500、返回结构不对、密钥没配。这些路径在真实网络下很难
 * 复现，但它们决定了实验会不会在收集数据当天突然停摆。
 *
 * 要钉住的契约：
 *   1. **从不抛异常**。任何失败都必须返回一个可用的决定，只是 decisionSource
 *      降级成 rule_fallback。决策点必须总是产生一个决定。
 *   2. **超时预算是硬约束**。卡住的时间不能超过配置值，否则学生会等。
 *   3. **置信度取最小值**。任何一环不确定，整体就该更保守——这是
 *      "判断不准就不替学生做主"那条设计原则的直接实现。
 *   4. **缓存**。同一次决策被重放（学生刷新、请求重试）不能拿到两个不同答案。
 */

const assert = require("node:assert/strict");
const http = require("node:http");

const jev = require("../lib/proactive-policy/jev-client");

const SAVED = {
  TYPESAFE_API_KEY: process.env.TYPESAFE_API_KEY,
  PROACTIVE_JEV_ENABLED: process.env.PROACTIVE_JEV_ENABLED,
  PROACTIVE_JEV_TIMEOUT_MS: process.env.PROACTIVE_JEV_TIMEOUT_MS,
  TYPESAFE_MODEL: process.env.TYPESAFE_MODEL
};

function restoreEnv() {
  for (const [key, value] of Object.entries(SAVED)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

/** 起一个只会按剧本回应的本地桩，替代 api.typesafe.ai。 */
function startStub(handler) {
  return new Promise((resolve) => {
    const server = http.createServer(handler);
    server.listen(0, "127.0.0.1", () => {
      resolve({
        url: `http://127.0.0.1:${server.address().port}/v1/systemone`,
        close: () => new Promise((done) => server.close(done))
      });
    });
  });
}

const STATE = {
  knowledgePoint: "输入、输出和函数规则",
  knowledgePointGoal: "把每个输入对应到唯一输出",
  topicMisconception: "把对应关系当成四则运算",
  currentActivityType: "拖动仿真",
  activityTypes: ["拖动仿真", "关系图", "误解修复挑战"],
  activityTypesOpened: ["拖动仿真"],
  dwellSeconds: 140,
  parameterCommits: 4,
  judgedAttempts: 2,
  judgedFailures: 1,
  confirmedGaps: 1,
  hintsUsed: 0,
  lastEvent: "parameter_commit"
};

function jevPayload({ needsHelp = 0.9, nextActivity = 0.8, scaffold = 0.7 } = {}) {
  return JSON.stringify({
    answers: {
      needs_help: { noul: needsHelp },
      next_activity: {
        choice: "关系图",
        confidence: nextActivity,
        probabilities: { 拖动仿真: 0.1, 关系图: 0.8, 不换: 0.1 }
      },
      scaffold_depth: {
        choice: "L2",
        confidence: scaffold,
        probabilities: { L1: 0.1, L2: 0.7, L3: 0.2 }
      }
    }
  });
}

async function main() {
  // ---------------------------------------------- 1. 没配密钥：不联网就降级
  {
    delete process.env.TYPESAFE_API_KEY;
    jev.resetCache();
    let calls = 0;
    const stub = await startStub((request, response) => {
      calls += 1;
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(jevPayload());
    });
    const result = await jev.decide(STATE, { endpoint: stub.url });
    assert.equal(result.decisionSource, "rule_fallback");
    assert.equal(result.fallbackReason, "jev_not_configured");
    assert.equal(calls, 0, "没配密钥时一次网络请求都不该发");
    assert.equal(result.confidence, null);
    assert.equal(result.needsHelp, null);
    assert.deepEqual(result.probabilities, {});
    await stub.close();
    console.log("未配置路径通过：不发请求、不抛异常，明确报告 jev_not_configured。");
  }

  // ---------------------------------------------- 2. 显式关闭
  {
    process.env.TYPESAFE_API_KEY = "test-key";
    process.env.PROACTIVE_JEV_ENABLED = "false";
    jev.resetCache();
    const result = await jev.decide(STATE, { endpoint: "http://127.0.0.1:1/never" });
    assert.equal(result.decisionSource, "rule_fallback");
    assert.equal(result.fallbackReason, "jev_disabled");
    assert.equal(jev.config().enabled, false);
    console.log("显式关闭路径通过：jev_disabled，且 config().enabled 如实为 false。");
  }

  // ---------------------------------------------- 3. 各种失败都降级、都不抛
  {
    process.env.TYPESAFE_API_KEY = "test-key";
    delete process.env.PROACTIVE_JEV_ENABLED;
    jev.resetCache();

    const cases = [];
    // HTTP 500
    const failing = await startStub((request, response) => {
      response.writeHead(500, { "Content-Type": "application/json" });
      response.end("{}");
    });
    cases.push({ name: "http_500", endpoint: failing.url, expected: "http_500" });
    // 返回结构不合法（needs_help 不是 noul）
    const malformed = await startStub((request, response) => {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ answers: { needs_help: { choice: "是" } } }));
    });
    cases.push({ name: "malformed_answer", endpoint: malformed.url, expected: "malformed_answer" });
    // 不是 JSON
    const notJson = await startStub((request, response) => {
      response.writeHead(200, { "Content-Type": "text/html" });
      response.end("<html>maintenance</html>");
    });
    cases.push({ name: "request_failed(非JSON)", endpoint: notJson.url, expected: "request_failed" });
    // 连不上
    cases.push({ name: "request_failed(拒连)", endpoint: "http://127.0.0.1:1/v1/systemone", expected: "request_failed" });

    for (const testCase of cases) {
      jev.resetCache();
      const result = await jev.decide(STATE, { endpoint: testCase.endpoint });
      assert.equal(result.decisionSource, "rule_fallback", `${testCase.name} 必须降级`);
      assert.equal(result.fallbackReason, testCase.expected, `${testCase.name} 的失败原因应可区分`);
      assert.ok(Number.isFinite(result.latencyMs) && result.latencyMs >= 0);
    }
    await failing.close();
    await malformed.close();
    await notJson.close();
    console.log("失败路径通过：HTTP 500 / 结构不合法 / 非 JSON / 连不上，全部降级且原因可区分。");
  }

  // ---------------------------------------------- 4. 超时是硬预算
  {
    process.env.TYPESAFE_API_KEY = "test-key";
    process.env.PROACTIVE_JEV_TIMEOUT_MS = "300";
    assert.equal(jev.config().timeoutMs, 300);
    jev.resetCache();
    // 只接受请求、永不回应
    const hanging = await startStub(() => {});
    const started = Date.now();
    const result = await jev.decide(STATE, { endpoint: hanging.url });
    const elapsed = Date.now() - started;
    assert.equal(result.decisionSource, "rule_fallback");
    assert.equal(result.fallbackReason, "timeout");
    assert.ok(elapsed < 2000, `超时必须真的按时放弃，实际等了 ${elapsed}ms`);
    assert.ok(elapsed >= 250, `超时不应早于预算触发，实际 ${elapsed}ms`);
    await hanging.close();
    // 预算上下限被夹住，防止有人把学生挂在一次调用上
    process.env.PROACTIVE_JEV_TIMEOUT_MS = "99999";
    assert.equal(jev.config().timeoutMs, 5000);
    process.env.PROACTIVE_JEV_TIMEOUT_MS = "1";
    assert.equal(jev.config().timeoutMs, 200);
    delete process.env.PROACTIVE_JEV_TIMEOUT_MS;
    assert.equal(jev.config().timeoutMs, 1500, "默认预算就是实测得出的 1500ms");
    console.log(`超时路径通过：预算内放弃（实测 ${elapsed}ms），且被夹在 200–5000ms。`);
  }

  // ---------------------------------------------- 5. 成功路径与字段映射
  {
    process.env.TYPESAFE_API_KEY = "test-key";
    process.env.TYPESAFE_MODEL = "jev-latest";
    delete process.env.PROACTIVE_JEV_TIMEOUT_MS;
    jev.resetCache();
    let received = null;
    const stub = await startStub(async (request, response) => {
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      received = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(jevPayload());
    });
    const result = await jev.decide(STATE, { endpoint: stub.url });
    assert.equal(result.decisionSource, "jev");
    assert.equal(result.fallbackReason, "");
    assert.equal(result.model, "jev-latest");
    assert.equal(result.needsHelp, 0.9);
    assert.equal(result.nextActivity, "关系图");
    assert.equal(result.scaffoldDepth, "L2");
    assert.deepEqual(result.probabilities.next_activity, { 拖动仿真: 0.1, 关系图: 0.8, 不换: 0.1 });
    assert.deepEqual(result.probabilities.scaffold_depth, { L1: 0.1, L2: 0.7, L3: 0.2 });
    assert.equal(result.confidences.next_activity, 0.8);
    // needs_help 的"决断度" = |0.9 - 0.5| * 2 = 0.8；最小项是 scaffold 的 0.7
    assert.ok(Math.abs(result.needsHelpDecisiveness - 0.8) < 1e-12);
    assert.ok(Math.abs(result.confidence - 0.7) < 1e-12, `整体置信度应取最小值 0.7，实际 ${result.confidence}`);

    // 请求体必须带 state 文本、model 与三个问题
    assert.equal(received.model, "jev-latest");
    assert.deepEqual(
      Object.keys(received.questions).sort(),
      ["needs_help", "next_activity", "scaffold_depth"]
    );
    assert.equal(received.questions.needs_help.type, "noul");
    assert.equal(received.questions.next_activity.type, "choice");
    assert.equal(received.questions.scaffold_depth.type, "choice");
    // 只给**可用**的活动类型写 criteria，并始终保留「不换」
    assert.deepEqual(
      Object.keys(received.questions.next_activity.criteria).sort(),
      ["不换", "关系图", "拖动仿真", "误解修复挑战"].sort()
    );
    assert.match(received.state, /输入、输出和函数规则/);
    await stub.close();
    console.log("成功路径通过：字段映射正确，整体置信度取各环最小值，criteria 只覆盖可用活动。");
  }

  // ---------------------------------------------- 6. 置信度取最小值：任一环不确定就保守
  {
    process.env.TYPESAFE_API_KEY = "test-key";
    jev.resetCache();
    // 该不该帮很决断（0.95 → 0.9），但换活动毫无把握（0.4）
    const uncertainActivity = await startStub((request, response) => {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(jevPayload({ needsHelp: 0.95, nextActivity: 0.4, scaffold: 0.9 }));
    });
    const result = await jev.decide(STATE, { endpoint: uncertainActivity.url });
    assert.ok(
      Math.abs(result.confidence - 0.4) < 1e-12,
      `任一环不确定时整体必须更保守（应 0.4，实际 ${result.confidence}）`
    );
    await uncertainActivity.close();

    // needs_help 完全没把握（0.5 → 决断度 0）时，即使其它环很确定，整体也是 0
    jev.resetCache();
    const wishyWashy = await startStub((request, response) => {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(jevPayload({ needsHelp: 0.5, nextActivity: 0.99, scaffold: 0.99 }));
    });
    const zero = await jev.decide(STATE, { endpoint: wishyWashy.url });
    assert.equal(zero.confidence, 0, "「该不该帮」没把握时整体置信度必须是 0");
    assert.equal(zero.needsHelpDecisiveness, 0);
    await wishyWashy.close();
    console.log("置信度口径通过：取各环最小值，且「该不该帮」的决断度参与取最小。");
  }

  // ---------------------------------------------- 7. 缓存：重放不能拿到两个答案
  {
    process.env.TYPESAFE_API_KEY = "test-key";
    jev.resetCache();
    let calls = 0;
    const stub = await startStub((request, response) => {
      calls += 1;
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(jevPayload({ needsHelp: 0.9 - calls * 0.1 }));
    });
    const first = await jev.decide(STATE, { endpoint: stub.url });
    const second = await jev.decide(STATE, { endpoint: stub.url });
    assert.equal(calls, 1, "同一份状态的重复调用必须命中缓存");
    assert.equal(first.cached, false);
    assert.equal(second.cached, true);
    assert.equal(second.latencyMs, 0);
    assert.equal(second.needsHelp, first.needsHelp, "重放必须拿到同一个答案");
    assert.equal(second.confidence, first.confidence);
    // 状态变了就是新的调用
    const third = await jev.decide({ ...STATE, dwellSeconds: 400 }, { endpoint: stub.url });
    assert.equal(calls, 2);
    assert.equal(third.cached, false);
    await stub.close();
    console.log("缓存路径通过：同状态重放命中缓存且答案一致，状态变化则重新判断。");
  }

  // ---------------------------------------------- 8. 问题与状态文本的措辞守卫
  {
    // 「不换」必须始终存在，否则每个决策点都会被推向换活动
    const noTypes = jev.buildQuestions({ activityTypes: [] });
    assert.deepEqual(Object.keys(noTypes.next_activity.criteria), ["不换"]);
    const unknown = jev.buildQuestions({ activityTypes: ["量子隧穿"] });
    assert.equal(unknown.next_activity.criteria["量子隧穿"], undefined, "未知活动类型不得进 criteria");
    assert.deepEqual(Object.keys(unknown.scaffold_depth.criteria), ["L1", "L2", "L3", "L4", "L5"]);

    // criteria 必须写"适合解决哪类困难"，而不是"这是什么"
    for (const [key, value] of Object.entries(jev.ACTIVITY_CRITERIA)) {
      assert.ok(value.length > 10, `${key} 的 criteria 太短，可能退化成了"这是什么"`);
    }

    // 状态文本必须把"知识点常见混淆"和"这位学生被诊断出的错误"分开。
    // 混在一起会让策略把常见混淆当成已知事实，把"选哪个场景"退化成查表。
    const text = jev.renderState({ ...STATE, topicMisconception: "把对应关系当成四则运算" });
    assert.match(text, /该知识点常见的混淆（不代表这位学生已经犯了这个错）/);
    assert.doesNotMatch(text, /已确认的错误想法|这个学生错了/);
    assert.match(text, /最近一次事件：parameter_commit/);
    // 缺字段不能渲染出 "undefined"
    const sparse = jev.renderState({});
    assert.doesNotMatch(sparse, /undefined/);
    assert.match(sparse, /知识点：未知/);
    console.log("措辞守卫通过：「不换」恒在、未知活动被排除、常见混淆不被写成已诊断错误。");
  }

  // ---------------------------------------------- 9. 端点常量与模块契约
  {
    assert.equal(jev.ENDPOINT, "https://api.typesafe.ai/v1/systemone");
    assert.equal(typeof jev.decide, "function");
    assert.equal(typeof jev.resetCache, "function");
    assert.equal(jev.config().model, process.env.TYPESAFE_MODEL || "jev-latest");
    console.log("契约通过：端点为 System One，公开 API 齐全。");
  }

  restoreEnv();
  console.log("Jev 判断层通过：从不抛异常、超时是硬预算、置信度取最小、重放走缓存、措辞不混淆。");
}

main().catch((error) => {
  restoreEnv();
  console.error(error);
  process.exitCode = 1;
});
