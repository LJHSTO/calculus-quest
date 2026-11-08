'use strict';
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const file = path.join(root, 'resources/open-maic/GH-01-函数、坐标与图像读法入门/interactive/03_输入、输出和函数规则：拖动实验.html');
let html = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
html = html.replace(/(?:if \(Number\.isFinite\(my\)\) )+drawPoint\(g, state.input_x, my\);/g, 'if (Number.isFinite(my)) drawPoint(g, state.input_x, my);');
const fixes = [
  ['drawPoint(g, state.input_x, my);', 'if (Number.isFinite(my)) drawPoint(g, state.input_x, my);'],
  ['const my = fn.rule(t);\n    const p', 'const my = fn.rule(t);\n    if (!Number.isFinite(my)) return;\n    const p'],
  ['(Number.isFinite(Number(my)) ? Number(my) : 0).toFixed(1)', "(Number.isFinite(my) ? my.toFixed(1) : '无实数值')"],
  ['(Number.isFinite(Number(y)) ? Number(y) : 0).toFixed(1)', "(Number.isFinite(y) ? y.toFixed(1) : '无实数值')"]
];
if (!html.includes('if (!Number.isFinite(my) || my < graphYCenter - graphYHalf || my > graphYCenter + graphYHalf)')) {
  const before = 'if (my < -10 || my > 10)', after = 'if (!Number.isFinite(my) || my < -10 || my > 10)';
  assert(html.includes(before) || html.includes(after), 'Missing finite output guard');
  if (!html.includes(after)) html = html.replaceAll(before, after);
}
for (const [before, after] of fixes) { assert(html.includes(before) || html.includes(after), 'Missing source anchor: ' + before); if (!html.includes(after)) html = html.replaceAll(before, after); }
html = html.replace(/\n<script data-function-explorer-r11>[\s\S]*?<\/script>\n/g, '');
const script = ['function-expression-r11.js', 'function-explorer-r11.js'].map(name => fs.readFileSync(path.join(root, 'lib/courseware', name), 'utf8')).join('\n');
html = html.replace('</body>', '\n<script data-function-explorer-r11>\n' + script + '\n</script>\n</body>');
fs.writeFileSync(file, html);
console.log('已接入原函数拖动图；保留原预设、滑块、布局与反馈。');
