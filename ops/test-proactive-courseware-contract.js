const assert = require("node:assert/strict");
const v14c3Contracts = require("../data/proactive-courseware-contracts.json");
const v14c1Contracts = require("../data/functions-limits-courseware-contracts.json");
const { buildCourseContextIndex } = require("../lib/learning-assistant");

const route = require("../data/multi-scene-learning-route.json");
const index = buildCourseContextIndex(route);

const testContractSets = [
  { name: "V14-C1 (函数与极限实验主章节)", contracts: v14c1Contracts },
  ...(route.chapters.some((item) => item.id === v14c3Contracts?.chapterId)
    ? [{ name: "V14-C3 (微积分应用对照章节)", contracts: v14c3Contracts }]
    : [])
];

for (const { name, contracts } of testContractSets) {
  const chapter = route.chapters.find((item) => item.id === contracts.chapterId);
  assert.ok(chapter, `${name} 实验章节必须存在`);

  const knowledgePoints = chapter.modules.flatMap((module) => module.knowledgePoints || []);
  assert.equal(
    knowledgePoints.length,
    Object.keys(contracts.knowledgePoints).length,
    `${name} 知识点数量与合同声明不一致`
  );
  for (const point of knowledgePoints) {
    const contract = contracts.knowledgePoints[point.id];
    assert.ok(contract?.learningTask, `${name} - ${point.id} 缺少学习任务`);
    assert.ok(contract.successEvidence?.length >= 2, `${name} - ${point.id} 缺少成功证据`);
    assert.ok(contract.misconceptionSignals?.length >= 1, `${name} - ${point.id} 缺少误解信号`);
    assert.ok(contract.supports?.length >= 1, `${name} - ${point.id} 缺少允许支架`);
    const unit = index.units.get(point.id);
    assert.ok(unit, `${name} - ${point.id} 未在课程索引中找到对应单元`);
    assert.equal(
      unit.taskContract.learningTask,
      contract.learningTask,
      `${name} - ${point.id} 课程索引中的任务合同与数据文件不一致`
    );
  }
}
console.log("proactive courseware contract tests passed for both V14-C1 and V14-C3");

