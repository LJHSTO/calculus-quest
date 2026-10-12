const assert = require("node:assert/strict");
const assistant = require("../lib/learning-assistant");
const index = assistant.buildCourseContextIndex(require("../data/multi-scene-learning-route.json"));
const viewport = assistant.resolveAssistantContext({
  index, chapterId: "V14-C3", unitId: "GH-07-K03", sceneType: "visualization3d",
  contextRef: { kind: "viewport", scope: "interactive", coarse: true, confidence: "low", label: "当前画布" }
});
for (const question of [
  "我点中的红色线段为什么变短了？",
  "图中这个点为什么跑到左边了？",
  "选中的蓝色区域是不是面积？"
]) {
  const reply = assistant.unresolvedVisualReferenceReply({ resolved: viewport, question });
  assert.match(reply, /无法确认/);
  assert.doesNotMatch(reply, /意味着|说明导数|你已经掌握/);
}
for (const question of ["什么是换元法？", "为什么du=2dx？", "请用一个例子解释定积分。"]) {
  assert.equal(assistant.unresolvedVisualReferenceReply({ resolved: viewport, question }), "");
}
for (const contextRef of [
  { kind: "interaction", scope: "interactive", semanticId: "interactive:id:a", state: { parameter: "a", oldValue: "2", newValue: "1" } },
  { kind: "text", scope: "slide", excerpt: "红线表示u=2x。" }
]) {
  const resolved = assistant.resolveAssistantContext({
    index, chapterId: "V14-C3", unitId: "GH-07-K03", sceneType: "simulation", contextRef
  });
  assert.equal(assistant.unresolvedVisualReferenceReply({ resolved, question: "这条红线为什么变短？" }), "");
}
const prompt = assistant.buildAssistantPrompt({ resolved: viewport, question: "什么是换元法？" });
assert.match(prompt.system, /min\/max/);
assert.match(prompt.system, /有限近似恰好等于/);
console.log("助教证据边界通过：未定位图形先澄清；一般概念、精确参数和文字引用不受阻；提示保留参数范围和数学特例。");
