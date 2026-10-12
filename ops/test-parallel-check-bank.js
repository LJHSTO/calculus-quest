"use strict";
// 平行题库：同一 (知识点, 支架等级) 的第二次支架回合必须仍有检查题可发。
//
// 这是唯一一个"数据开始收集就无法补救"的问题。原逻辑是：发题时若候选题 id 等于
// lastVerificationCheckId 就不发；而每个 (知识点, 等级) 只有一道题。两件事相乘的
// 后果不是练习效应，是**近端结果整条缺失**。本测试把"每轮都有新题"钉死。
const assert = require("node:assert/strict");
const adapter = require("../lib/proactive-policy/adapters/functions-limits-r2");
const checkBank = require("../lib/proactive-policy/adapters/functions-limits-check-bank");

const LEVELS = ["L1", "L2", "L3", "L4", "L5"];
const knowledgePoints = Object.keys(adapter.knowledgePoints);
assert.ok(knowledgePoints.length >= 6, `应至少有 6 个知识点，实际 ${knowledgePoints.length}`);

// --- 1. 每轮都发得出题，且轮转不重复 --------------------------------------
let combinations = 0;
for (const knowledgePointId of knowledgePoints) {
  for (const level of LEVELS) {
    combinations += 1;
    const issued = [];
    let last = "";
    for (let round = 0; round < 3; round += 1) {
      const check = adapter.nextVerificationCheck(knowledgePointId, level, last);
      assert.ok(check, `${knowledgePointId}/${level} 第 ${round + 1} 轮没有发题`);
      assert.notEqual(
        check.id, last,
        `${knowledgePointId}/${level} 第 ${round + 1} 轮与上一轮同题`
      );
      issued.push(check.id);
      last = check.id;
    }
    assert.equal(
      new Set(issued).size, 3,
      `${knowledgePointId}/${level} 三轮应给出三道不同的题，实际 ${new Set(issued).size} 道`
    );
    // 第四轮回到第一道，说明是轮转而不是耗尽
    const wrapped = adapter.nextVerificationCheck(knowledgePointId, level, last);
    assert.equal(wrapped.id, issued[0], `${knowledgePointId}/${level} 第四轮应回到第一道`);
  }
}
assert.equal(combinations, knowledgePoints.length * LEVELS.length);

// --- 2. 每道题本身是合法的四选一（第五个是"我不会"）----------------------
for (const knowledgePointId of knowledgePoints) {
  for (const level of LEVELS) {
    let last = "";
    for (let round = 0; round < 3; round += 1) {
      const check = adapter.nextVerificationCheck(knowledgePointId, level, last);
      last = check.id;
      assert.ok(check.prompt && check.prompt.length > 8, `${check.id} 题干过短`);
      const values = check.options.map((option) => option.value);
      assert.deepEqual(
        values, ["A", "B", "C", "D", "__unknown__"],
        `${check.id} 选项应为 A/B/C/D + 我不会，实际 ${values.join("/")}`
      );
      const labels = check.options.map((option) => option.label);
      assert.equal(
        new Set(labels).size, labels.length,
        `${check.id} 有重复的选项文字`
      );
      assert.equal(check.supportLevel, level, `${check.id} 的等级标记不对`);
      assert.equal(check.instrumentVersion, adapter.verificationVersion, `${check.id} 版本标记不对`);
      // 发题函数的返回值会原样塞进学生状态接口 policyStates[].verificationCheck，
      // 所以它必须是**投影**而不是题库原始对象。漏了这条就会把答案连同题目一起发给学生。
      assert.equal(
        Object.hasOwn(check, "answer"), false,
        `${check.id} 把答案键泄露给了学生状态接口`
      );
      assert.equal(
        check.evidenceScope, "post_support_local_check",
        `${check.id} 缺少证据范围标记，事后无法区分近端检查与其它作答`
      );
    }
  }
}

// --- 3. 答案键必须真的判对 -------------------------------------------------
// 平行题是新写的，答案键错了会让近端结果变成噪声。
let graded = 0;
for (const knowledgePointId of knowledgePoints) {
  for (const level of LEVELS) {
    let last = "";
    for (let round = 0; round < 3; round += 1) {
      const check = adapter.nextVerificationCheck(knowledgePointId, level, last);
      last = check.id;
      const correctValues = check.options
        .filter((option) => option.value !== "__unknown__")
        .filter((option) => {
          const result = adapter.gradeVerificationCheck({
            knowledgePointId, supportLevel: level, checkId: check.id, response: option.value
          });
          return result?.correct === true;
        });
      assert.equal(
        correctValues.length, 1,
        `${check.id} 应恰好有一个正确选项，实际 ${correctValues.length} 个`
      );
      // "我不会"必须是错的
      const unknown = adapter.gradeVerificationCheck({
        knowledgePointId, supportLevel: level, checkId: check.id, response: "__unknown__"
      });
      assert.equal(unknown?.correct, false, `${check.id} 的"我不会"不应判对`);
      graded += 1;
    }
  }
}
assert.equal(graded, combinations * 3);

// --- 4. 题库与发题一致 -----------------------------------------------------
assert.equal(typeof checkBank.variantsFor, "function");
for (let i = 0; i < knowledgePoints.length; i += 1) {
  for (let j = 0; j < LEVELS.length; j += 1) {
    const variants = checkBank.variantsFor(i, j);
    assert.equal(
      variants.length, 2,
      `${knowledgePoints[i]}/${LEVELS[j]} 应有 2 道平行题，实际 ${variants.length}`
    );
    for (const row of variants) {
      assert.ok(Array.isArray(row) && row.length === 3, "变体行结构应为 [题干, 选项, 答案下标]");
      assert.ok(typeof row[0] === "string" && row[0].length > 6, "变体题干过短");
      assert.equal(row[1].length, 3, "变体应有 3 个选项");
      assert.ok(Number.isInteger(row[2]) && row[2] >= 0 && row[2] < 3, "变体答案下标越界");
    }
  }
}

console.log(
  `平行题库通过：${knowledgePoints.length} 个知识点 × ${LEVELS.length} 个等级 = ${combinations} 个组合，`
  + `每个组合连续三轮给出三道不同的题、第四轮回到第一道；`
  + `${graded} 道题全部四选一且答案键唯一正确；"我不会"一律判错。`
);
