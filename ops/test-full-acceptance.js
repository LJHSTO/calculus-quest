"use strict";
// Run existing isolated fixtures; keep evidence per test and never use a live DB.
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),out=process.env.ACCEPTANCE_OUTPUT_DIR?path.resolve(process.env.ACCEPTANCE_OUTPUT_DIR):path.join(root,'output/全功能与学习界面验收-2026-10-22/测试日志');
const named=["test-auth-login","test-persistent-preview","test-learning-snapshot-versioning","test-quiz-snapshot-reconciliation","test-functions-limits","test-student-learning-flow","test-slide-deck","test-course-playback","test-courseware-browser","test-courseware-contract-honesty","test-openmaic-package","test-learning-layout-comfort","test-fullscreen-hint","test-embedded-help-browser","test-courseware-context","test-assistant-grounding","test-authoritative-quiz-api","test-quiz-draft-recovery","test-course-assessment-security","test-short-answer-recovery","test-return-context","test-hint-justification-ui","test-retention-v4-api","test-transfer-instrument","test-main-common-tasks","test-study-allocation","test-student-data-chain-api","test-main-human-browser","test-learning-notes-api","test-feedback-api","test-announcements-api","test-learning-assistant-api","test-conversation-context","test-learner-memory","test-courseware-semantic-events","test-evidence-strength","test-proactive-evidence-audit","test-quiet-dwell-reachability","test-proactive-policy","test-proactive-verification-v3","test-parallel-check-bank","test-scene-switch-lifecycle","test-research-controls-browser","test-proactive-exposure-browser","test-proactive-study-api","test-courseware-verification-match","test-proactive-state-loading","test-design-space-projection","test-research-controls","test-proactivity-randomization","test-study-workbench","test-learning-event-durability","test-admin-statistics","test-admin-analysis-export","test-admin-regrade-api","test-selected-participant-export","test-error-monitoring","test-education-replay","test-education-replay-runner","test-live-model-integration","test-grading-model-audit","test-support-cycle","test-support-cycle-browser","test-support-inquiry","test-pilot-study-browser","test-pilot-study","test-pilot-analysis"];
const extra=['test-six-dimension-runtime','test-proactive-gate-sensitivity','test-static-security','test-deployment-safety','test-subpath-deployment','test-db-flush-durability','test-pilot-analysis','test-pilot-study','test-pilot-study-browser','test-support-inquiry','test-error-monitoring-browser','test-learning-workspace-browser','test-platform-browser-smoke','test-admin-layout-browser','test-learning-web-acceptance','test-courseware-embedded-layout','test-proactive-analysis','test-research-analysis-export','test-admin-export-all','test-proactive-verification-browser','test-proactive-submission-browser'];
extra.push('test-pilot-evaluation','test-pilot-review-materials');
extra.push('test-functions-limits-review');
extra.push('test-research-sites-policy','test-research-sites-materials','test-research-sites-session','test-research-sites-store','test-research-sites-browser','test-research-sites-analysis','test-research-sites-api','test-research-sites-layout-browser');
extra.push('test-score-evidence','test-learning-event-clock','test-functions-limits-metrics','test-transfer-instrument');
extra.push('test-research-sites-parameter-sensitivity');
extra.push('test-cross-entry-auth-browser','test-learner-pilot','test-learner-pilot-browser');
extra.push('test-shared-network-limit','test-rate-limit-window');
extra.push('test-learner-journey-contract');
extra.push('test-ordinary-onboarding');
extra.push('test-rehearsal-experience','test-rehearsal-browser');
extra.push('test-pilot-v2-boundaries','test-mixed-learning-scenes-browser','test-learning-interaction-contract','test-concept-games');
const browser=/browser|layout-comfort|fullscreen-hint|proactive-exposure|learning-web-acceptance/;
const suite=process.argv[2]||'core';
// The old seven-point V14-C3 smoke script assumes a retired consent/outcome UI.
// Current six-point registration/learning/measurement paths have dedicated fixtures.
const excluded=new Set(['test-live-model-integration','test-platform-browser-smoke']);
const repair=['test-evidence-strength','test-db-flush-durability','test-fullscreen-hint','test-error-monitoring','test-error-monitoring-browser','test-learning-event-clock','test-learning-event-durability','test-proactive-study-api','test-support-cycle-browser','test-pilot-study-browser','test-static-security','test-subpath-deployment'];
const selected=suite==='repair'?repair:[...new Set([...named,...extra])].filter(n=>!excluded.has(n)&&(suite==='all'||(suite==='browser')===browser.test(n)));
const filter=process.env.ACCEPTANCE_TEST_FILTER?new RegExp(process.env.ACCEPTANCE_TEST_FILTER):null;
const tests=filter?selected.filter(n=>filter.test(n)):selected;
if(!tests.length)throw new Error('没有匹配的验收用例，不能生成通过报告');
const missing=tests.filter(n=>!fs.existsSync(path.join(root,'ops',n+'.js')));
if(missing.length)throw new Error('验收入口缺失，不得静默跳过：'+missing.join(', '));
fs.mkdirSync(out,{recursive:true});const results=[],report=path.join(out,suite+'-结果.json');
const build=spawnSync(process.execPath,['ops/build-learning-runtime.js'],{cwd:root,encoding:'utf8',windowsHide:true,timeout:120000});
fs.writeFileSync(path.join(out,'runtime-build.log'),(build.stdout||'')+(build.stderr||''));
if(build.status!==0)throw new Error('学习运行包构建失败，请查看runtime-build.log');
for(const test of tests){
 const startedAt=new Date().toISOString(),start=Date.now();
 // Both course players traverse all resources; per-page action timeouts remain bounded.
 const r=spawnSync(process.execPath,['ops/'+test+'.js'],{cwd:root,encoding:'utf8',windowsHide:true,timeout:test==='test-courseware-browser'?10800000:360000,maxBuffer:20*1024*1024});
 const log=path.join(out,test+'.log');if(fs.existsSync(log)&&!fs.existsSync(log+'.initial'))fs.copyFileSync(log,log+'.initial');
 fs.writeFileSync(log,(r.stdout||'')+(r.stderr||'')+(r.error?String(r.error):''));
 const row={test,startedAt,durationMs:Date.now()-start,passed:r.status===0,exitCode:r.status};results.push(row);console.log(JSON.stringify(row));
 fs.writeFileSync(report,JSON.stringify({synthetic:true,suite,filter:process.env.ACCEPTANCE_TEST_FILTER||null,notSelected:selected.filter(n=>!tests.includes(n)),results},null,2));
}
process.exitCode=results.every(r=>r.passed)?0:1;
