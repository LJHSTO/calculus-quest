const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const index = fs.readFileSync(path.join(root, "index.html"), "utf8");
const theme = fs.readFileSync(path.join(root, "app/main/theme.js"), "utf8");
const styles = fs.readFileSync(path.join(root, "styles.css"), "utf8");

assert.match(index, /id="theme-launcher"[\s\S]*?disabled[\s\S]*?aria-disabled="true"/);
assert.match(index, /aria-label="外观设置暂未开放"/);
assert.match(theme, /const THEMES_LOCKED = true/);
assert.match(theme, /launcher\.disabled/);
assert.match(theme, /closeMenu\(\);/);
assert.match(styles, /\.theme-launcher:disabled/);
console.log("home theme lock tests passed");
