'use strict';
// Real mouse selection and drag in the opaque course iframe. The bridge keeps
// the sandbox intact; no DOM DragEvent, fabricated text payload or CDP drop is used.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require('playwright-core');
const base = process.env.STUDENT_UX_BASE_URL || '';
assert(/^http:\/\/127\.0\.0\.1:\d+$/.test(base), '仅允许本机合成服务');
const out = path.resolve(__dirname, '../output/playwright/r11-native-note');
fs.mkdirSync(out, { recursive: true });

async function main() {
  const account = { nickname: `笔记拖拽合成验收${Date.now()}`, password: 'Note-r11-synthetic-password' };
  const api = async (url, body, method = body ? 'POST' : 'GET') => {
    const response = await fetch(base + url, { method, headers: { 'Content-Type': 'application/json', 'X-Study-Arm': 'B', ...(account.token ? { Authorization: `Bearer ${account.token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const result = await response.json();
    assert.equal(response.status, 200, `${url}: ${result.message || response.status}`);
    return result;
  };
  account.token = (await api('/api/auth/register', account)).token;
  let pref = (await api('/api/learning/learner-preferences')).data;
  const baseline = (await api('/api/study/survey?stage=baseline')).data;
  await api('/api/study/survey', { stage: 'baseline', answers: Object.fromEntries(baseline.items.map(q => [q.id, 3])) });
  const bank = require('../lib/assessments/functions-limits-r11');
  await api('/api/learning/quiz/submit', { chapterId: 'V14-C1', unitId: 'V14-C1-pre', phase: 'pre', answers: bank.questions('pre', pref.study.assessmentOrder[0]).map(q => ({ questionId: q.id, response: q.type === 'short_answer' ? '__unknown__' : q.answer[0] })) });
  pref = (await api('/api/learning/learner-preferences')).data;
  await api('/api/learning/learner-preferences', { answers: pref.record.answers, expectedRevision: pref.record.revision });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.setDefaultTimeout(20000);
  let report = {};
  try {
    await page.goto(base + '/?study=B');
    await page.locator('#app-loader.hidden').waitFor({ state: 'attached' });
    await page.locator('#login-identifier').fill(account.nickname);
    await page.locator('#login-password').fill(account.password);
    await page.locator('#login-submit').click();
    await page.locator('#auth-gate').waitFor({ state: 'hidden' });
    await page.locator('[data-view=learn]').first().click();
    await page.evaluate(() => { ensureAgenticPath().pendingPlan = null; agenticUnlockUnit('GH-01-K01', 'note_drag_synthetic_fixture'); selectUnit('GH-01-K01'); LearningWorkspace.showLecture(); });
    await page.locator('[data-openmaic-state=ready]').first().waitFor();
    await page.getByRole('button', { name: '下一讲解页', exact: true }).first().click();
    await page.waitForFunction(() => document.querySelector('[data-openmaic-page]')?.dataset.openmaicPage === '2' && document.querySelector('[data-openmaic-state]')?.dataset.openmaicState === 'ready');
    const frame = page.frames().find(f => f.url().includes('/pro-supplements-r11/GH-01-K01.html'));
    const source = frame.locator('.think p');
    await frame.evaluate(() => { window.noteModes = []; window.addEventListener('message', e => { if (e.data?.type === 'cq:note-drop-mode') noteModes.push({ enabled: Boolean(e.data.channel), channelLength: e.data.channel?.length }); }); });
    await source.click({ clickCount: 3 });
    await page.locator('[data-knowledge-selection-note]').click();
    const input = page.locator('[data-knowledge-note-input]');
    await input.waitFor({ state: 'visible' });
    const originalAnchor = await page.locator('[data-knowledge-note-excerpt]').textContent();
    const draft = '我的已有草稿：先判断定义域。';
    await input.fill(draft);
    // Make a fresh real selection while the draft is open; it must survive.
    await source.click({ clickCount: 3 });
    assert.equal(await input.inputValue(), draft);
    assert(await input.isVisible());
    assert.equal(await page.locator('[data-knowledge-note-excerpt]').textContent(), originalAnchor);
    const selected = (await frame.evaluate(() => getSelection().toString())).trim();
    assert(selected.length > 0);
    // No movement, an outside release, Escape, and forged message senders must
    // leave the existing draft unchanged.
    let origin = await source.boundingBox();
    await page.mouse.click(origin.x + 30, origin.y + 10);
    assert.equal(await page.locator('.knowledge-note-drag-layer').count(), 0);
    assert.equal(await input.inputValue(), draft);
    const startMouseDrag = async () => {
      await source.click({ clickCount: 3 });
      origin = await source.boundingBox();
      await page.mouse.move(origin.x + 30, origin.y + 10);
      await page.mouse.down();
      await page.waitForTimeout(180);
      await page.mouse.move(origin.x + 60, origin.y + 20, { steps: 8 });
      await page.locator('.knowledge-note-drag-layer').waitFor({ state: 'attached' });
    };
    await startMouseDrag();
    await page.mouse.move(40, 130, { steps: 20 });
    await page.mouse.up();
    await page.locator('.knowledge-note-drag-layer').waitFor({ state: 'detached' });
    assert.equal(await input.inputValue(), draft);
    await startMouseDrag();
    await page.keyboard.press('Escape');
    await page.mouse.up();
    await page.locator('.knowledge-note-drag-layer').waitFor({ state: 'detached' });
    assert.equal(await input.inputValue(), draft);
    await page.evaluate(() => window.postMessage({ type: 'cq:note-text-drag', channel: 'forged', text: '不得写入' }, '*'));
    await frame.evaluate(() => parent.postMessage({ type: 'cq:note-text-drag', channel: 'forged', text: '不得写入' }, '*'));
    await page.waitForTimeout(150);
    assert.equal(await page.locator('.knowledge-note-drag-layer').count(), 0);
    assert.equal(await input.inputValue(), draft);
    await source.click({ clickCount: 3 });
    await frame.evaluate(() => {
      window.nativeNoteSourceEvents = [];
      for (const type of ['dragstart', 'dragend', 'pointerdown', 'pointermove', 'pointerup']) document.addEventListener(type, e => nativeNoteSourceEvents.push({ type, trusted: e.isTrusted, prevented:e.defaultPrevented,buttons:e.buttons,x:e.clientX,y:e.clientY,types: [...(e.dataTransfer?.types || [])] }), true);
    });
    await page.evaluate(() => {
      window.nativeNoteTargetEvents = [];
      for (const type of ['dragenter', 'dragover', 'drop', 'pointerup']) document.addEventListener(type, e => nativeNoteTargetEvents.push({ type, trusted: e.isTrusted, target: e.target.id || e.target.className || e.target.tagName, types: [...(e.dataTransfer?.types || [])] }), true);
    });
    const src = await source.boundingBox();
    const dst = await input.boundingBox();
    await page.mouse.move(src.x + 30, src.y + 10);
    await page.mouse.down();
    await page.waitForTimeout(180);
    await page.mouse.move(src.x + 60, src.y + 20, { steps: 8 });
    await page.locator('.knowledge-note-drag-layer').waitFor({ state: 'attached' });
    await page.mouse.move(dst.x + 30, dst.y + 25, { steps: 20 });
    await page.mouse.move(dst.x + 35, dst.y + 28);
    await page.mouse.up();
    await page.locator('.knowledge-note-drag-layer').waitFor({ state: 'detached' });
    const expected = draft + '\n' + selected;
    assert.equal(await input.inputValue(), expected);
    assert.equal(await page.locator('[data-knowledge-note-excerpt]').textContent(), originalAnchor);
    const sourceEvents = await frame.evaluate(() => nativeNoteSourceEvents);
    const targetEvents = await page.evaluate(() => nativeNoteTargetEvents);
    assert(sourceEvents.some(e => e.type === 'dragstart' && e.trusted));
    assert(targetEvents.some(e => e.type === 'pointerup' && e.trusted && e.target === 'knowledge-note-drag-layer'));
    const readiness = await page.evaluate(() => state.analytics?.interactionEvidence?.['GH-01-K01']?.coursewareReadiness || null);
    assert(!Object.values(readiness?.scenes || {}).some(item => item.attemptedAt), '笔记拖拽不可计作数学互动');
    await page.screenshot({ path: path.join(out, '原生选区拖入已有草稿.png') });
    const saved = page.waitForResponse(r => /\/api\/learning\/notes\//.test(r.url()) && r.request().method() === 'PUT');
    await page.locator('[data-knowledge-note-save]').click();
    await saved;
    const notes = await api('/api/learning/notes?unitId=GH-01-K01');
    const list = Array.isArray(notes) ? notes : notes.notes;
    const stored = list.find(note => note.note === expected);
    assert(stored, '服务器没有保存完整拖拽笔记');
    assert.equal(stored.excerpt, originalAnchor);
    await page.reload();
    await page.locator('#app-loader.hidden').waitFor({ state: 'attached' });
    await page.locator('#auth-gate').waitFor({ state: 'hidden' });
    await page.locator('[data-view=learn]').first().click();
    await page.evaluate(() => { selectUnit('GH-01-K01'); KnowledgeAssistant.open(); });
    await page.locator('[data-workspace-tab=notes]').click();
    await page.locator('#workspace-notes').getByText(expected, { exact: true }).waitFor();
    await page.locator('[data-openmaic-state=ready]').first().waitFor();
    await page.screenshot({ path: path.join(out, '刷新后完整笔记.png') });
    assert.deepEqual(errors, []);
    report = { passed: true, syntheticOnly: true, nativeSourceSelection: true, nativeTrustedDragStart: true, nativeTrustedPointerRelease: true, draftAndAnchorPreserved: true, clickWithoutDragUnchanged: true, releaseOutsideUnchanged: true, escapeCancels: true, forgedSourceAndChannelRejected: true, savedOnServer: true, reloadedVisible: true, noMathInteractionCredit: true, sourceEvents, targetEvents, errors, limits: ['保留 opaque iframe 沙箱；真实选区 dragstart 后由经过来源和 nonce 校验的 bridge 与透明接收层完成鼠标松开落点判断，没有 DOM 合成拖拽事件。'] };
    console.log(JSON.stringify({ passed: true, output: out }));
  } catch (error) {
    await page.screenshot({ path: path.join(out, '失败现场.png') });
    report = { passed: false, message: error.message, source: await Promise.all(page.frames().filter(f => f.url().includes('pro-supplements')).map(f => f.evaluate(() => ({events:window.nativeNoteSourceEvents || [],modes:window.noteModes||[]})))), target: await page.evaluate(() => window.nativeNoteTargetEvents || []),state:await page.evaluate(()=>({noteVisible:document.querySelector('[data-knowledge-note-input]')?.checkVisibility(),independent:KnowledgeAssistant.pendingIndependentCheck(),regulation:ThreeArmStudyUI.judgmentActive,run:ThreeArmStudyUI.run?.id,meta:KnowledgeAssistant.designSpaceSnapshot()?.context})), errors };
    throw error;
  } finally {
    fs.writeFileSync(path.join(out, '原生拖拽保存回归.json'), JSON.stringify(report, null, 2));
    await browser.close();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
