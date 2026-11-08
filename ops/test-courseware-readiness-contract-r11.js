'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { normalize } = require('../app/main/courseware-event-contract');
const source = fs.readFileSync(require.resolve('../app/main/render-learning.js'), 'utf8');
const sanitize = vm.runInNewContext(source.slice(0, source.indexOf('function coursewareFrameUrl')) + ';sanitizeCoursewareLearningEvent');

for (const [point, record] of [
  ['GH-02-K02', { view: 'angle', left: 1, right: -1 }],
  ['GH-02-K03', { value: 3, limit: 1 }]
]) {
  const payload = normalize({
    event_type: 'exploration_observed', emission_source: 'student',
    knowledge_point_id: point, scene_type: 'visualization3d',
    evidence_scope: 'native_construction_r10', independent: false,
    parameters: { task_id: point + '-visualization3d', state: { records: [record] }, prior_feedback_count: 0 }
  });
  const received = JSON.parse(JSON.stringify(sanitize(payload)));
  assert.deepEqual(received.parameters.state.records, [record], '保留观察按钮的真实结果不能在课件事件转接中变成空数组');
  assert.equal(received.independent, false, '一次观察不能变成独立掌握证据');
}
const cyclic = {}; cyclic.again = cyclic;
assert.doesNotThrow(() => sanitize({ parameters: cyclic }), '嵌套对象仍有深度上限');
const bounded = sanitize({ parameters: { items: Array.from({ length: 100 }, () => 'x'.repeat(2000)) } });
assert.equal(bounded.parameters.items.length, 30);
assert.equal(bounded.parameters.items[0].length, 1200);
console.log('课件尝试契约通过：空间观察完整保留、独立标记不变、数组/文本/递归有界。');
