'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const studyStages = require('../app/shared/study-stages');
const source = fs.readFileSync(require.resolve('../server.js'), 'utf8');
const start = source.indexOf("if(url.pathname==='/api/study/review'&&req.method==='GET'){");
const end = source.indexOf("if(url.pathname==='/api/study/review'&&req.method==='POST'){", start);
assert(start > 0 && end > start);
const handler = new vm.Script('(function(){' + source.slice(start, end) + '})()');
const eligibleResults = studyStages.reviews[0].points.flatMap(id => [1, 2].map(i => ({
  unit_id: id + '-formative', question_id: `fl-r11-formative-${id}-${i}`
})));
function review({ unit = 'V14-C1-pre', pre = true, post = false, results = eligibleResults, reviewed = [] } = {}) {
  let response;
  handler.runInNewContext({
    url: { pathname: '/api/study/review' }, req: { method: 'GET' }, res: {}, user: 'synthetic-run', cycles: [],
    db: { getQuizResultsByUser: () => results, getLearningSnapshotState: () => ({ snapshot: { data: JSON.stringify({ currentUnitId: unit }) } }) },
    studyStages, run: { configuredAt: '2026-11-08T00:00:00Z', reviewedStages: reviewed },
    proactiveAssessmentCompletion: (_user, phase) => ({ ready: phase === 'pre' ? pre : post }),
    parseStoredJson: JSON.parse, nowIso: () => '2026-11-08T01:00:00Z',
    threeArmStudy: { review: () => ({ marker: 'actual-review-handler-reached' }) },
    sendJson: (_res, status, data) => { response = { status, data }; }
  });
  return response;
}
assert.equal(review().status, 200, '已交前测且已完成S1时，回看前测不能误锁学习回顾');
assert.throws(() => review({ pre: false }), error => error.status === 409 && /独立作答/.test(error.message));
assert.throws(() => review({ results: eligibleResults.slice(0, 4) }), error => error.status === 409 && /前三个/.test(error.message));
assert.throws(() => review({ unit: 'V14-C1-post' }), error => error.status === 409 && /独立作答/.test(error.message));
assert.equal(review({ unit: 'V14-C1-post', post: true, reviewed: ['S1'] }).status, 200);
assert.equal(review({ unit: 'GH-01-K03-formative' }).status, 200);
console.log('学习回顾窗口通过：已交前测回看、未交测验保护、S1完整性与已交后测。');
