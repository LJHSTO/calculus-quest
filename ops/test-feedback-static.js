const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relative) => {
  const file = path.join(root, relative);
  return fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
};

const index = read("index.html");
const navigation = read("app/main/navigation.js");
const events = read("app/main/events.js");
const returnContext = read("app/main/return-context.js");
const knowledgeSceneSelection = read("app/main/knowledge-scene-selection.js");
const bootstrap = read("app/main/bootstrap.js");
const core = read("app/main/core.js");
const analytics = read("app/main/analytics.js");
const renderLearning = read("app/main/render-learning.js");
const feedbackJs = read("app/main/feedback.js");
const feedbackTargetsJs = read("app/main/feedback-targets.js");
const styles = read("styles.css");
const adminHtml = read("admin.html");
const adminJs = read("admin/admin.js");
const adminCss = read("admin/admin.css");
const adminPresentation = read("admin/presentation.js");
let adminCsv = {};
try {
  adminCsv = require(path.join(root, "admin", "csv.js"));
} catch {}

assert.match(index, /data-view="feedback">反馈<\/button>/);
assert.ok(
  index.indexOf('data-view="feedback">反馈</button>') < index.indexOf('data-view="progress">记录</button>'),
  "main navigation must place feedback before progress"
);
assert.doesNotMatch(
  index.match(/<div class="user-menu-panel"[\s\S]*?<\/div>\s*<\/div>\s*<\/header>/)?.[0] || "",
  /data-view="progress">记录<\/button>/,
  "profile menu must not repeat the progress entry"
);
assert.match(index, /id="feedback-view"/);
assert.match(index, /id="chapter-rail-toggle"[^>]*aria-controls="chapter-rail"[^>]*aria-expanded="false"/);
assert.match(index, /id="feedback-content"[^>]*name="content"[^>]*autocomplete="off"/);
assert.doesNotMatch(index, /id="reflection-note"/);
assert.doesNotMatch(index, /id="save-note"/);
assert.ok(
  index.indexOf("app/main/feedback-config.js") < index.indexOf("app/main/core.js"),
  "feedback config must load before core"
);
assert.ok(
  index.indexOf("app/main/knowledge-scene-selection.js") < index.indexOf("app/main/core.js"),
  "knowledge scene selection state must load before core"
);
assert.ok(
  index.indexOf("app/main/feedback-targets.js") < index.indexOf("app/main/feedback.js"),
  "feedback targets must load before feedback UI"
);
assert.match(navigation, /renderFeedbackPage/);
assert.match(navigation, /lastLearningContext/);
assert.match(events, /returnToLearningCourseware/);
assert.match(returnContext, /captureLearningContext/);
assert.match(index, /id="progress-view"[^>]*class="view progress-view"/);
assert.match(index, /id="feedback-view"[^>]*class="view feedback-view"/);
assert.match(index, /feedback-context-callout/);
assert.doesNotMatch(bootstrap, /#save-note/);
assert.match(
  core,
  /const replaceWithServer = options\.replace === true \|\| Boolean\(payload\.snapshot\)/
);
assert.match(feedbackJs, /pointerdown/);
assert.match(feedbackJs, /aria-pressed/);
assert.match(feedbackJs, /currentFeedbackType\(\)[\s\S]*courseware/);
assert.doesNotMatch(feedbackJs, /target\.targetScope === "global" \? "全部课件"/);
assert.doesNotMatch(feedbackTargetsJs, /全局课件反馈/);
assert.doesNotMatch(feedbackTargetsJs, /id:\s*"global"/);
assert.ok(
  index.indexOf('value="courseware" checked') < index.indexOf('value="learning_content"'),
  "courseware feedback must be first and selected by default"
);
assert.match(styles, /\.feedback-target-strip/);
assert.match(styles, /scroll-snap-type:\s*x/);

assert.match(adminHtml, /data-tab="feedback">问题反馈<\/button>/);
assert.match(adminHtml, /id="tab-feedback"/);
assert.match(adminHtml, /id="table-feedback"/);
assert.match(adminHtml, /id="feedback-result-note"[^>]*aria-live="polite"/);
assert.match(adminHtml, /id="feedback-query-filter"[^>]*name="feedback-query"[^>]*autocomplete="off"/);
assert.match(adminHtml, /class="chart-grid overview-grid"/);
assert.match(adminHtml, /class="chart-grid question-grid"/);
assert.match(adminHtml, /class="chart-grid effectiveness-grid"/);
assert.match(adminHtml, /class="chart-grid activity-grid"/);
assert.match(adminHtml, /id="interaction-detail-filter"/);
assert.match(adminHtml, /id="export-interactions-all-csv"/);
assert.match(adminHtml, /导出全部 CSV/);
assert.match(adminHtml, /<th>学习位置<\/th><th>关键行为<\/th><th>行为摘要<\/th>/);
assert.ok(
  adminHtml.indexOf("admin/presentation.js") < adminHtml.indexOf("admin/admin.js"),
  "admin presentation helper must load before the admin dashboard"
);
assert.ok(
  adminHtml.indexOf("admin/csv.js") < adminHtml.indexOf("admin/admin.js"),
  "CSV escaping helper must load before the admin dashboard"
);
assert.match(adminHtml, /admin\/presentation\.js\?v=20260718-admin-quality-v5/);
assert.match(adminHtml, /lib\/interaction-policy\.js\?v=20260718-interaction-quality-v3/);
assert.match(adminHtml, /admin\/admin\.js\?v=20260722-multi-scene-v1/);
assert.ok(
  adminHtml.indexOf('id="overview-metrics"') > adminHtml.indexOf('id="tab-overview"'),
  "overview metrics must live inside the overview tab"
);
assert.doesNotMatch(adminHtml, /id="chart-activity-daily"/);
assert.match(adminJs, /测验提交/);
assert.match(adminJs, /测验覆盖单元/);
assert.match(adminJs, /detail\.eventCount/);
assert.match(adminJs, /fetchStats\("feedback"/);
assert.match(adminJs, /function feedbackFilterQueryParams/);
assert.match(adminJs, /fetchStats\("feedback", feedbackFilterQueryParams\(\)/);
assert.match(adminJs, /cachedFeedbackSummary/);
assert.match(adminJs, /data\.summary/);
assert.match(adminJs, /AdminCsv\.csvCell/);
assert.match(adminJs, /AdminCsv\.fetchAllRows/);
assert.match(adminJs, /function fetchAllStatsRows/);
assert.match(adminJs, /function interactionLearningLocation/);
assert.match(adminJs, /function knowledgeSceneName/);
assert.match(adminJs, /class="metric-card detail"/);
assert.match(adminJs, /interactionDetailMode/);
assert.match(adminJs, /if \(routeId && routeId !== value\) return chapterName\(routeId\)/);
assert.doesNotMatch(adminJs, /return chapterName\(routeMatch\[1\]\)/);
assert.match(adminJs, /fetchAllStatsRows\("feedback"/);
assert.match(adminJs, /fetchAllStatsRows\("short-answer-responses"/);
assert.match(adminJs, /fetchAllStatsRows\("agentic-decision-trace"/);
assert.match(adminJs, /fetchAllStatsRows\("interactions"/);
assert.doesNotMatch(adminJs, /querySelectorAll\("#table-shortanswers tbody tr"\)/);
assert.match(adminJs, /AdminPresentation\.feedbackContentHtml/);
assert.match(adminJs, /function prepareSortableTables/);
assert.match(adminJs, /AdminPresentation\.compareTableValues/);
assert.match(adminJs, /function setChartState/);
assert.match(adminJs, /AdminPresentation\.plannerReasonsText/);
assert.doesNotMatch(adminJs, /\[row\.knowledge_point,\s*row\.chapter_id,\s*row\.unit_id\]/);
assert.doesNotMatch(adminJs, /selectedIds\s*\?\s*`候选ID/);
assert.match(adminJs, /moduleName\(row\.unit_id,\s*row\.unit_label\s*\|\|\s*""\)/);
assert.match(adminPresentation, /function publicCourseText/);
assert.match(adminPresentation, /function feedbackContentHtml/);
assert.match(adminPresentation, /function compareTableValues/);
assert.match(adminPresentation, /function coachActionLabel/);
assert.match(adminPresentation, /function knowledgeSceneLabel/);
assert.doesNotMatch(adminJs, /未分类事件/);
assert.match(adminCss, /#table-feedback/);
assert.match(adminCss, /\.table-sortable/);
assert.match(adminCss, /\.table-wrap\.is-empty/);
assert.match(adminCss, /\.tabs[\s\S]*overflow-x:\s*auto/);
assert.match(adminCss, /\.chart-grid\.question-grid/);
assert.match(adminCss, /\.chart-grid\.interaction-grid\s*\{\s*grid-template-columns:\s*minmax\(0,\s*1fr\)/);
assert.match(adminCss, /#table-interactions td:nth-child\(5\)/);
assert.doesNotMatch(adminCss, /transition:\s*all/);

assert.doesNotMatch(analytics, /analyticsTrack\("unit_leave"/);
assert.doesNotMatch(analytics, /analyticsTrackTarget\("ui_keydown"/);
assert.doesNotMatch(analytics, /analyticsTrackTarget\("ui_wheel"/);
assert.match(analytics, /analyticsQueue\.push\(\{\s*token:\s*state\.authToken,\s*participantId:/);
assert.match(analytics, /analyticsFlushChain\s*=\s*analyticsFlushChain\.then/);
assert.match(analytics, /sceneType:\s*selectedType/);
assert.match(analytics, /function analyticsResumeUnitTimer/);
assert.match(core, /const requestToken = typeof body\?\.token === "string"/);
assert.match(core, /KnowledgeSceneSelection\.selectedType/);
assert.doesNotMatch(core, /function chooseDefaultKnowledgeScene/);
assert.match(knowledgeSceneSelection, /reading the selection|selectedType/);
assert.match(core, /await analyticsFlush\(\);\s*await waitForLearningEventSync\(\);\s*await syncLearningSnapshot\("logout"\)/);
assert.match(bootstrap, /els\.authLogout\?\.addEventListener\("click", async \(\) =>/);
assert.match(bootstrap, /const needsSceneChoice = unit\.type === "knowledge" && !selectedKnowledgeSceneType\(unit\)/);
assert.match(bootstrap, /function setChapterRailCollapsed/);
assert.match(bootstrap, /event\.key !== "Escape"/);
assert.match(renderLearning, /trackInteraction\("parameter_change",\s*\{\s*persist:\s*false/);
assert.match(renderLearning, /先选一种互动方式，再开始体验/);
assert.match(renderLearning, /data-knowledge-scene-panel/);
assert.match(renderLearning, /data-knowledge-scene-stage/);
assert.match(renderLearning, /data-knowledge-scene-fullscreen/);
assert.match(renderLearning, /data-courseware-frame/);
assert.doesNotMatch(renderLearning, /data-multi-scene-frame/);
assert.doesNotMatch(renderLearning, /\sallowfullscreen/);
assert.match(renderLearning, /cleanStudentSceneTitle\(candidate\.title \|\| candidate\.file, unit\.label\)/);
assert.match(renderLearning, /const sceneTitle = hasResource \? sceneChoiceCategoryLabel\(type\) : resourceTitle/);
assert.doesNotMatch(renderLearning, /调一调，看变化/);
assert.doesNotMatch(renderLearning, /找出问题并修正/);
assert.doesNotMatch(renderLearning, /看清概念关系/);
assert.doesNotMatch(renderLearning, /从不同视角观察/);
assert.match(events, /knowledgeSceneFullscreenButton/);
assert.match(events, /toggleResourceFullscreen\(stage\)/);
assert.doesNotMatch(events, /renderKnowledgeSceneAfterSelection/);
assert.match(styles, /\.multi-scene-courseware-stage:fullscreen/);
assert.match(styles, /\.chapter-rail\.collapsed[\s\S]*visibility:\s*hidden/);
assert.match(styles, /position:\s*fixed;[\s\S]*left:\s*max\(64px/);
assert.doesNotMatch(styles, /\.multi-scene-scene-panel:fullscreen/);
assert.doesNotMatch(renderLearning, /trackInteraction\("interactive_drag_move"/);
assert.doesNotMatch(renderLearning, /trackInteraction\("interactive_pointer_(?:down|up|cancel)"/);

assert.equal(typeof adminCsv.csvCell, "function", "admin CSV cell helper must exist");
assert.equal(typeof adminCsv.normalizePageData, "function", "admin page normalizer must exist");
assert.equal(typeof adminCsv.fetchAllRows, "function", "admin paged export helper must exist");
assert.equal(adminCsv.csvCell("普通正文"), '"普通正文"');
assert.equal(adminCsv.csvCell('包含"引号'), '"包含""引号"');
assert.equal(adminCsv.csvCell("=HYPERLINK(\"https://example.com\")"), '"\'=HYPERLINK(""https://example.com"")"');
assert.equal(adminCsv.csvCell("  +1+1"), '"\'  +1+1"');

async function testPagedExportHelper() {
  const source = [{ id: 1 }, { id: 2 }, { id: 3 }];
  const rows = await adminCsv.fetchAllRows(({ limit, offset }) => ({
    rows: source.slice(offset, offset + limit),
    total: source.length,
    limit,
    offset
  }), { pageSize: 2 });
  assert.deepEqual(rows.map((row) => row.id), [1, 2, 3]);
  assert.deepEqual(
    adminCsv.normalizePageData({ rows: source.slice(0, 2), total: 3, limit: 2, offset: 0 }),
    { rows: source.slice(0, 2), total: 3, limit: 2, offset: 0 }
  );
}

testPagedExportHelper()
  .then(() => console.log("feedback static tests passed"))
  .catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
