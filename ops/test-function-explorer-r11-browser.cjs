'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { chromium } = require('playwright-core');
(async () => {
  const url = process.env.STUDENT_UX_BASE_URL;
  assert(url && /^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(url), '须显式指定本机合成服务');
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1100, height: 750 } }), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(url + '/resources/open-maic/GH-01-函数、坐标与图像读法入门/interactive/03_输入、输出和函数规则：拖动实验.html');
    await page.getByText('试试自己的函数（可选）', { exact: true }).click();
    const field = page.getByLabel('自定义函数表达式');
    await field.fill('sqrt(x)'); await page.getByRole('button', { name: '绘制这个函数', exact: true }).click();
    await page.locator('#input_x-slider').fill('-1'); await page.locator('#input_x-slider').dispatchEvent('input');
    assert.equal(await page.locator('#hud-y').innerText(), '无实数值');
    await page.locator('#input_x-slider').fill('4'); await page.locator('#input_x-slider').dispatchEvent('input');
    assert.equal(await page.locator('#hud-y').innerText(), '2.0');
    await field.fill('window.alert(1)'); await page.getByRole('button', { name: '绘制这个函数', exact: true }).click();
    assert.equal(await field.getAttribute('aria-invalid'), 'true');
    assert.match(await page.locator('#machine-rule').innerText(), /sqrt\(x\)/);
    await page.getByRole('button', { name: '恢复示例 2x' }).click();
    assert.match(await page.locator('#machine-rule').innerText(), /2x/);
    await field.fill('1/x'); await page.getByRole('button', { name: '绘制这个函数', exact: true }).click();
    await page.locator('#input_x-slider').fill('0'); await page.locator('#input_x-slider').dispatchEvent('input');
    assert.equal(await page.locator('#hud-y').innerText(), '无实数值');
    const out = path.resolve(__dirname, '../tmp/function-explorer-r11'); fs.mkdirSync(out, { recursive: true });
    for (const width of [1100, 390]) {
      await page.setViewportSize({ width, height: 750 });
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), '横向溢出 ' + width);
      await page.locator('#custom-function-r11').scrollIntoViewIfNeeded();
      await page.screenshot({ path: path.join(out, '自定义函数-' + width + '.png') });
    }
    assert.deepEqual(errors, []); console.log(JSON.stringify({ realInput: true, undefinedNotZero: true, safeRejection: true, originalPresetRestored: true, pageErrors: errors }));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
