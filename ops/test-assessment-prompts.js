const assert = require("assert");
const fs = require("fs");
const path = require("path");

const rootDir = path.resolve(__dirname, "..");
const route = JSON.parse(fs.readFileSync(path.join(rootDir, "data", "multi-scene-learning-route.json"), "utf8"));
const promptRoot = path.join(rootDir, "prompts", "assessments");

let moduleCount = 0;
let pointCount = 0;

for (const chapter of route.chapters || []) {
  for (const module of chapter.modules || []) {
    moduleCount += 1;
    const moduleDir = path.join(promptRoot, module.id);
    const pairedPath = path.join(moduleDir, "pre-post-paired-prompt.md");
    assert.ok(fs.existsSync(pairedPath), `Missing paired prompt: ${module.id}`);

    const paired = fs.readFileSync(pairedPath, "utf8");
    assert.match(paired, new RegExp(`章节 ID：${chapter.id}`));
    assert.match(paired, new RegExp(`学习模块 ID：${module.id}`));
    assert.match(paired, /前后测测量等值与表面异构/);
    assert.match(paired, /keyPoints 都必须恰好包含 6 个字符串/);
    assert.match(paired, /严禁仅替换数值、坐标、变量名/);
    assert.match(paired, /同卷题目多样性/);
    assert.match(paired, /删除题干中的数字、字母变量和坐标后/);
    assert.match(paired, /同一知识点安排两道题时，两题必须承担不同测量功能/);
    assert.match(paired, /题干不得出现 ""、''、“”或‘’等空引号占位符/);
    assert.match(paired, /points 求和都严格等于 60/);
    assert.match(paired, /Q6 为 text 且 points=20/);
    assert.match(paired, /Q1-Q5 的 points 均为 8/);
    assert.match(paired, /正确项数量可以为 1、2 或 3/);
    assert.match(paired, /可由 JSON\.parse 直接解析/);
    assert.match(paired, /equivalence 必须且只能包含 presentationMode/);
    assert.match(paired, /two-sided-table/);
    assert.match(paired, /question 只能包含题干/);
    assert.match(paired, /不得包含竖线 \|/);
    assert.match(paired, /场景与题目归属是硬约束/);
    assert.match(paired, /整个响应中题目对象总数必须恰好为 12/);
    assert.match(paired, /不得把 post 题放入 pre outline/);
    assert.match(paired, /不得把 pre 题放入 post outline/);
    assert.match(paired, /outline 对象根层级的 difficulty/);
    assert.match(paired, /quizConfig=\{"questionCount":6,"difficulty":"medium"/);
    assert.match(paired, /不得依赖 OpenMAIC 的默认题量/);
    assert.match(paired, /左侧 3 组和右侧 3 组、合计 6 组数据/);
    assert.match(paired, /evidence\.rows 必须逐项保存题干中的这 6 组数据/);

    for (const point of module.knowledgePoints || []) {
      pointCount += 1;
      assert.ok(paired.includes(`- ID：${point.id}`), `Paired prompt omits knowledge point: ${point.id}`);
      assert.ok(paired.includes(`名称：${point.name}`), `Paired prompt renames knowledge point: ${point.id}`);

      const checkPath = path.join(moduleDir, "checks", `${point.id}-prompt.md`);
      assert.ok(fs.existsSync(checkPath), `Missing formative prompt: ${point.id}`);
      const check = fs.readFileSync(checkPath, "utf8");

      assert.ok(check.includes(`知识点 ID：${point.id}`), `Wrong knowledge-point ID: ${point.id}`);
      assert.ok(check.includes(`知识点名称：${point.name}`), `Wrong knowledge-point name: ${point.id}`);
      assert.ok(check.includes(`knowledgePointIds 必须且只能填写 ["${point.id}"]`), `Unscoped formative prompt: ${point.id}`);
      assert.match(check, /任意数量的候选学习场景/);
      assert.match(check, /只生成 3 道选择题，不生成 text 或简答题/);
      assert.match(check, /keyPoints 必须恰好包含 3 个字符串/);
      assert.match(check, /每题固定 10 分，总分 30 分/);
      assert.match(check, /正确项数量可以为 1、2 或 3/);
      assert.match(check, /可由 JSON\.parse 直接解析/);
      assert.match(check, /equivalence 必须且只能包含 presentationMode/);
      assert.match(check, /question 只能包含题干/);
      assert.match(check, /左侧 3 组和右侧 3 组、合计 6 组数据/);
      assert.doesNotMatch(check, /四选一|四个候选|恰好 2 个正确|exactly two/i);
    }
  }
}

const moduleDirs = fs.readdirSync(promptRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory());
const generatedChecks = moduleDirs.flatMap((entry) => {
  const checksDir = path.join(promptRoot, entry.name, "checks");
  return fs.existsSync(checksDir)
    ? fs.readdirSync(checksDir).filter((name) => name.endsWith("-prompt.md"))
    : [];
});

assert.strictEqual(moduleDirs.length, moduleCount, "Unexpected generated module directory count");
assert.strictEqual(generatedChecks.length, pointCount, "Unexpected generated formative prompt count");
assert.strictEqual(moduleCount, 19, "Course route module count changed; review assessment design before accepting it");
assert.strictEqual(pointCount, 72, "Course route knowledge-point count changed; review assessment design before accepting it");

const gh02Paired = fs.readFileSync(path.join(promptRoot, "GH-02", "pre-post-paired-prompt.md"), "utf8");
assert.match(gh02Paired, /本模块专用六题蓝图/);
    assert.match(gh02Paired, /不得要求因式分解、约分或直接代数求极限/);
    assert.match(gh02Paired, /相同的小数位数和正负号复杂度/);
    assert.match(gh02Paired, /①判断双侧极限是否存在（6 分）/);
    assert.match(gh02Paired, /②比较极限值与函数值（6 分）/);
    assert.match(gh02Paired, /③给出连续性结论并完整说明理由（8 分）/);
    assert.match(gh02Paired, /P01、P02 两卷一律只用正数/);
const gh02K01 = fs.readFileSync(path.join(promptRoot, "GH-02", "checks", "GH-02-K01-prompt.md"), "utf8");
assert.match(gh02K01, /本知识点专用边界/);
assert.match(gh02K01, /不得使用未给数据的“根据下表”/);

process.stdout.write(`Assessment prompts verified: ${moduleCount} modules, ${pointCount} knowledge points.\n`);
