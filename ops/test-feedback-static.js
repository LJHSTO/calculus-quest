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
const bootstrap = read("app/main/bootstrap.js");
const feedbackJs = read("app/main/feedback.js");
const styles = read("styles.css");
const adminHtml = read("admin.html");
const adminJs = read("admin/admin.js");
const adminCss = read("admin/admin.css");
let adminCsv = {};
try {
  adminCsv = require(path.join(root, "admin", "csv.js"));
} catch {}

assert.match(index, /data-view="feedback">反馈<\/button>/);
assert.match(index, /id="feedback-view"/);
assert.match(index, /id="feedback-content"[^>]*name="content"[^>]*autocomplete="off"/);
assert.doesNotMatch(index, /id="reflection-note"/);
assert.doesNotMatch(index, /id="save-note"/);
assert.ok(
  index.indexOf("app/main/feedback-config.js") < index.indexOf("app/main/core.js"),
  "feedback config must load before core"
);
assert.ok(
  index.indexOf("app/main/feedback-targets.js") < index.indexOf("app/main/feedback.js"),
  "feedback targets must load before feedback UI"
);
assert.match(navigation, /renderFeedbackPage/);
assert.doesNotMatch(bootstrap, /#save-note/);
assert.match(feedbackJs, /pointerdown/);
assert.match(feedbackJs, /aria-pressed/);
assert.match(styles, /\.feedback-target-strip/);
assert.match(styles, /scroll-snap-type:\s*x/);

assert.match(adminHtml, /data-tab="feedback">问题反馈<\/button>/);
assert.match(adminHtml, /id="tab-feedback"/);
assert.match(adminHtml, /id="table-feedback"/);
assert.match(adminHtml, /id="feedback-result-note"[^>]*aria-live="polite"/);
assert.match(adminHtml, /id="feedback-query-filter"[^>]*name="feedback-query"[^>]*autocomplete="off"/);
assert.ok(
  adminHtml.indexOf("admin/csv.js") < adminHtml.indexOf("admin/admin.js"),
  "CSV escaping helper must load before the admin dashboard"
);
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
assert.match(adminCss, /#table-feedback/);
assert.match(adminCss, /\.tabs[\s\S]*overflow-x:\s*auto/);

assert.equal(typeof adminCsv.csvCell, "function", "admin CSV cell helper must exist");
assert.equal(adminCsv.csvCell("普通正文"), '"普通正文"');
assert.equal(adminCsv.csvCell('包含"引号'), '"包含""引号"');
assert.equal(adminCsv.csvCell("=HYPERLINK(\"https://example.com\")"), '"\'=HYPERLINK(""https://example.com"")"');
assert.equal(adminCsv.csvCell("  +1+1"), '"\'  +1+1"');

console.log("feedback static tests passed");
