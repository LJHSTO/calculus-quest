"use strict";

/**
 * Hint Justification 采集链路的行为测试。
 *
 * 为什么必须真跑一遍而不是只 grep 源码：这个控件的正确性全在**时序**上——
 *  1. 理由必须在**看到提示之前**问（先给答案再问就只是复述，防不了 gaming）；
 *  2. 一键跳过也要落进分母，否则 providedRate 会因为"不想写字的人干脆不接受"而虚高；
 *  3. 换表征这类"本来就不问理由"的接受必须明确标记 requested=false，
 *     否则 Hint Justification Rate 会被凭空压低。
 * 这三点用正则断言源码是测不出来的，所以这里用 vm + 最小假 DOM 真跑一遍。
 */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "app/main/knowledge-assistant.js"), "utf8");
const metrics = require(path.join(root, "lib/research/process-metrics.js"));

function extractFunction(name) {
  const start = source.indexOf(`  function ${name}(`);
  assert.ok(start >= 0, `找不到函数 ${name}`);
  // 先从参数表的右括号起算，再配平花括号。直接从第一个 `{` 起算会被
  // `options = {}` 这种默认参数骗到——那个 `}` 会让深度提前归零。
  let paren = source.indexOf("(", start);
  let depth = 0;
  for (; paren < source.length; paren += 1) {
    if (source[paren] === "(") depth += 1;
    else if (source[paren] === ")") {
      depth -= 1;
      if (depth === 0) break;
    }
  }
  let index = source.indexOf("{", paren);
  let braces = 0;
  for (; index < source.length; index += 1) {
    const char = source[index];
    if (char === "{") braces += 1;
    else if (char === "}") {
      braces -= 1;
      if (braces === 0) return source.slice(start, index + 1);
    }
  }
  throw new Error(`函数 ${name} 的花括号没有配平`);
}

// ---------------------------------------------------------------- 最小假 DOM

function createNode(tag) {
  const node = {
    tagName: String(tag).toUpperCase(),
    children: [],
    parent: null,
    dataset: {},
    attributes: {},
    listeners: {},
    hidden: false,
    textContent: "",
    className: "",
    value: "",
    focusCount: 0,
    append(...items) {
      for (const item of items) {
        item.parent = node;
        node.children.push(item);
      }
    },
    appendChild(item) {
      node.append(item);
      return item;
    },
    addEventListener(type, handler) {
      (node.listeners[type] || (node.listeners[type] = [])).push(handler);
    },
    dispatch(type, event = {}) {
      let handled = false;
      for (const handler of node.listeners[type] || []) {
        handler({
          preventDefault() {
            handled = true;
          },
          ...event
        });
      }
      return handled;
    },
    querySelector(selector) {
      const match = /^\[data-([a-z-]+)\]$/i.exec(String(selector || ""));
      if (!match) return null;
      const key = match[1].replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      const walk = (current) => {
        for (const child of current.children) {
          if (Object.prototype.hasOwnProperty.call(child.dataset, key)) return child;
          const found = walk(child);
          if (found) return found;
        }
        return null;
      };
      return walk(node);
    },
    focus() {
      node.focusCount += 1;
    }
  };
  return node;
}

function loadFixture({ acceptedOptions = [] } = {}) {
  const tracked = [];
  const context = vm.createContext({
    document: { createElement: (tag) => createNode(tag) },
    track: (name, payload) => tracked.push({ name, payload }),
    acceptProactiveSuggestion: (options) => {
      acceptedOptions.push(options || {});
      return true;
    },
    console
  });
  const constants = source.match(
    /const PROACTIVE_JUSTIFICATION_ACTIONS = new Set\(\[[\s\S]*?\]\);/
  )?.[0];
  assert.ok(constants, "找不到 PROACTIVE_JUSTIFICATION_ACTIONS 白名单");
  vm.runInContext(constants, context);
  for (const name of [
    "proactiveJustificationRequired",
    "proactiveJustificationForm",
    "revealProactiveJustification",
    "submitProactiveJustification"
  ]) {
    vm.runInContext(extractFunction(name), context);
  }
  return { context, tracked, acceptedOptions };
}

// ------------------------------------------------- 1. 哪些动作要问理由

{
  const { context } = loadFixture();
  const required = [
    "observe_change",
    "review_mistake",
    "self_explain",
    "ask_clarification",
    "elicit_self_explanation",
    "concept_hint",
    "decompose_subgoal",
    "next_step_hint",
    "partial_worked_example"
  ];
  for (const action of required) {
    assert.equal(
      context.proactiveJustificationRequired({ action }),
      true,
      `${action} 会把解释递到学生手上，必须问理由`
    );
  }
  // 换表征是纯换视角导航，问"这一步为什么是对的"文不对题；
  // 它的动机另有 representation-choice 探针在采。
  assert.equal(context.proactiveJustificationRequired({ action: "switch_representation" }), false);
  assert.equal(context.proactiveJustificationRequired({ action: "" }), false);
  assert.equal(context.proactiveJustificationRequired({}), false);
  assert.equal(context.proactiveJustificationRequired(null), false);
  console.log("需要理由的动作白名单通过：9 类内容型提示要问，换表征与空动作不问。");
}

// ------------------------------------------------- 2. 控件本身

{
  const { context } = loadFixture();
  const form = context.proactiveJustificationForm({ id: "s1", action: "concept_hint" });
  assert.equal(form.hidden, false, "工厂造出来的表单默认可见，隐藏由挂载点决定");
  const label = form.children[0];
  assert.match(label.textContent, /为什么是对的/);
  const input = form.querySelector("[data-proactive-justify-input]");
  assert.ok(input, "必须能按 data 属性找回输入框");
  assert.equal(input.maxLength, 600, "理由长度要和 server.js boundedLearningText(600) 对齐");
  const footer = form.children[2];
  const buttons = footer.children;
  assert.equal(buttons.length, 2);
  assert.equal(buttons[0].type, "submit", "主操作必须是 submit，回车键才能提交");
  assert.equal(buttons[1].type, "button", "跳过必须显式声明 type=button，否则会被当成提交");
  assert.match(buttons[1].textContent, /跳过/);
  console.log("理由控件结构通过：标签/输入框/提交/一键跳过齐全，且与 600 字上限对齐。");
}

// ------------------------------------------------- 3. 提交与跳过的时序

{
  const acceptedOptions = [];
  const { context, tracked } = loadFixture({ acceptedOptions });
  const suggestion = { id: "s1", decisionId: "d1", action: "concept_hint" };
  const form = context.proactiveJustificationForm(suggestion);
  const input = form.querySelector("[data-proactive-justify-input]");
  input.value = "  因为左右极限都存在并且相等，所以极限存在。  ";
  form.dispatch("submit");
  assert.equal(acceptedOptions.length, 1, "提交后必须真的去执行接受");
  assert.equal(
    acceptedOptions[0].justification,
    "因为左右极限都存在并且相等，所以极限存在。",
    "理由要 trim 后原样传给服务端"
  );
  assert.equal(
    acceptedOptions[0].justificationRequested,
    true,
    "被问过理由的接受必须标记 requested=true，才进 Hint Justification Rate 的分母"
  );
  assert.equal(form.hidden, true, "提交后收起输入，避免重复提交");
  const submitted = tracked.filter((row) => row.name === "knowledge_proactive_justification_submitted");
  assert.equal(submitted.length, 1);
  assert.equal(submitted[0].payload.provided, true);
  assert.equal(submitted[0].payload.skipped, false);
  console.log("提交路径通过：理由 trim 后随接受一起上报，且标记为被问过。");
}

{
  const acceptedOptions = [];
  const { context, tracked } = loadFixture({ acceptedOptions });
  const suggestion = { id: "s2", decisionId: "d2", action: "next_step_hint" };
  const form = context.proactiveJustificationForm(suggestion);
  const skip = form.children[2].children[1];
  skip.dispatch("click");
  assert.equal(acceptedOptions.length, 1, "跳过也要放行，绝不能卡住学生");
  assert.equal(acceptedOptions[0].justification, "");
  assert.equal(
    acceptedOptions[0].justificationRequested,
    true,
    "跳过同样是「被问过」——必须留在分母里，否则比例会虚高"
  );
  const submitted = tracked.filter((row) => row.name === "knowledge_proactive_justification_submitted");
  assert.equal(submitted.length, 1);
  assert.equal(submitted[0].payload.skipped, true);
  assert.equal(submitted[0].payload.provided, false);
  console.log("跳过路径通过：一键跳过照样落进分母，providedRate 不会被刷高。");
}

// ------------------------------------------------- 4. 超长理由被截断

{
  const acceptedOptions = [];
  const { context } = loadFixture({ acceptedOptions });
  const form = context.proactiveJustificationForm({ id: "s3", action: "concept_hint" });
  form.querySelector("[data-proactive-justify-input]").value = "啊".repeat(900);
  form.dispatch("submit");
  assert.equal(acceptedOptions[0].justification.length, 600, "客户端也要截断，不只靠服务端");
  console.log("长度上限通过：客户端先截到 600，不让自由文本变成垃圾场。");
}

// ------------------------------------------------- 5. 展开时才计「问过」

{
  const acceptedOptions = [];
  const { context, tracked } = loadFixture({ acceptedOptions });
  const form = context.proactiveJustificationForm({ id: "s4", decisionId: "d4", action: "concept_hint" });
  const actions = createNode("footer");
  actions.hidden = false;
  context.revealProactiveJustification(
    { id: "s4", decisionId: "d4", action: "concept_hint" },
    form,
    actions
  );
  assert.equal(form.hidden, false, "展开后表单可见");
  assert.equal(actions.hidden, true, "展开后主操作行让位，避免学生绕过问理由");
  assert.ok(form.querySelector("[data-proactive-justify-input]").focusCount >= 1, "展开后要自动聚焦输入框");
  const prompted = tracked.filter((row) => row.name === "knowledge_proactive_justification_prompted");
  assert.equal(prompted.length, 1);
  assert.equal(prompted[0].payload.action, "concept_hint");
  console.log("展开路径通过：问理由时主操作行让位并自动聚焦，且只上报一次 prompted。");
}

// ------------------------------------------------- 6. 计量口径

{
  const rows = [
    // 被问过 + 写了实质理由
    { resolution: "accepted", justificationRequested: true, justification: "因为左右极限相等" },
    // 被问过 + 一键跳过
    { resolution: "accepted", justificationRequested: true, justification: "" },
    // 被问过 + 敷衍几个字（不到 8 字）
    { resolution: "accepted", justificationRequested: true, justification: "不知道" },
    // 换表征这类本来就不问理由的接受
    { resolution: "accepted", justificationRequested: false, justification: "" },
    // 没接受的不进分子也不进分母
    { resolution: "dismissed", justificationRequested: true, justification: "" }
  ];
  const result = metrics.computeHintJustification(rows);
  assert.equal(result.accepted, 4);
  assert.equal(result.prompted, 3, "换表征的接受不进分母");
  // 「不知道」也算给了理由——provided 只问有没有写字，够不够长是 substantive 的事。
  assert.equal(result.provided, 2);
  assert.equal(result.substantive, 1);
  assert.equal(result.providedRate, 2 / 3);
  assert.equal(result.substantiveRate, 1 / 3);
  assert.equal(result.skipRate, 1 / 3);
  assert.equal(result.needsRubricScoring, 1, "只有够长的理由才需要判分");
  console.log("计量口径通过：分母只算「被问过」的接受，跳过与敷衍分开报告。");
}

{
  const result = metrics.computeHintJustification([
    { resolution: "accepted", justificationRequested: false, justification: "" }
  ]);
  assert.equal(result.prompted, 0);
  assert.equal(result.providedRate, null, "没有分母时返回 null，绝不编一个 0 或 1");
  assert.match(result.note, /换表征|没有一次被问过/);
  const empty = metrics.computeHintJustification([]);
  assert.equal(empty.providedRate, null);
  console.log("零分母通过：没有一次被问过理由时返回 null 并说明原因。");
}

// ------------------------------------------------- 7. 两个挂载点共用同一实现

{
  const assistantSource = source;
  assert.match(
    assistantSource,
    /els\.proactiveJustifySlot\.replaceChildren\(proactiveJustificationForm\(suggestion\)\)/,
    "悬浮提示卡必须用同一个工厂"
  );
  assert.match(
    assistantSource,
    /const justify = proactiveJustificationForm\(suggestion\)/,
    "对话内联卡必须用同一个工厂，否则两条路径口径不可比"
  );
  const inlineStart = assistantSource.indexOf("function proactiveInlineOfferNode(");
  const inlineBody = assistantSource.slice(inlineStart, inlineStart + 4000);
  assert.doesNotMatch(
    inlineBody,
    /acceptProactiveSuggestion\(\s*\)/,
    "内联卡不能绕过问理由直接接受"
  );
  assert.match(
    assistantSource,
    /knowledge-proactive-justify-actions/,
    "CSS 类名要和 knowledge-assistant.css 对得上"
  );
  console.log("挂载点一致性通过：悬浮卡与内联卡共用工厂，内联卡无法绕过问理由。");
}

console.log("Hint Justification 采集链路通过：问理由在给提示之前、跳过进分母、换表征不进分母。");
