const assert = require("assert");
const fs = require("fs");
const path = require("path");
const packageKatex = require("katex");
const browserKatex = require("../lib/katex.min.js");

const css = fs.readFileSync(path.join(__dirname, "..", "lib", "katex.min.css"), "utf8");
assert.equal(packageKatex.version, "0.17.0");
assert.equal(browserKatex.version, packageKatex.version);
assert.ok(css.includes(`content:"${packageKatex.version}"`), "Browser CSS version does not match KaTeX package");

const formula = browserKatex.renderToString(String.raw`f(x)=\frac{x^2+1}{2}`, {
  throwOnError: true,
  strict: "error",
  trust: false,
  maxExpand: 1000
});
assert.match(formula, /class="katex"/);
assert.match(formula, /<math/);

const unsafeLink = browserKatex.renderToString(String.raw`\href{javascript:alert(1)}{x}`, {
  throwOnError: false,
  trust: false
});
assert.doesNotMatch(unsafeLink, /<a[^>]+href=["']javascript:/i);

const unsafeImage = browserKatex.renderToString(String.raw`\includegraphics{" onerror=alert(1) x="}`, {
  throwOnError: false,
  trust: false
});
assert.doesNotMatch(unsafeImage, /<img[^>]+onerror=/i);

console.log(JSON.stringify({ ok: true, version: browserKatex.version }, null, 2));
