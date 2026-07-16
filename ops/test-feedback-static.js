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

assert.match(index, /data-view="feedback">反馈<\/button>/);
assert.match(index, /id="feedback-view"/);
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

console.log("feedback static tests passed");
