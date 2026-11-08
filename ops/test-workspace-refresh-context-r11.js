'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const core = fs.readFileSync(path.join(root, 'app/main/core.js'), 'utf8');
const workspace = fs.readFileSync(path.join(root, 'app/main/learning-workspace.js'), 'utf8');

function coreFunction(name) {
  const start = core.search(new RegExp('^(?:async )?function ' + name + '\\(', 'm'));
  assert(start >= 0, name);
  const next = core.slice(start + 1).search(/\n(?:async )?function /);
  return next < 0 ? core.slice(start) : core.slice(start, start + 1 + next);
}

function harness(store, user = 'study-synthetic-a', generation = 1, study = true) {
  const shellClasses = new Set();
  const writes = [], events = [], node = () => ({ hidden: false, value: 0, textContent: '',
    querySelector() { return {}; }, setAttribute() {}, before() {}, prepend() {},
    classList: { contains() { return false; } }, clientWidth: 1200 });
  const nodes = new Map(), shell = { dataset: {}, querySelectorAll() { return []; },
    querySelector(selector) { if (!nodes.has(selector)) nodes.set(selector, node()); return nodes.get(selector); },
    classList: { contains(name) { return shellClasses.has(name); } } };
  const participant = { participantId: user, ...(study ? { study: { id: user } } : {}) };
  const state = { participant, authToken: 'synthetic-token', currentUnitId: 'GH-01-K01', currentView: 'learn',
    selectedKnowledgeScenes: { 'GH-01-K01': 'game' }, completed: [], submittedQuizzes: [] };
  const context = vm.createContext({ state, shell, currentUnitId: 'GH-01-K01', currentChapterId: 'V14-C1', currentView: 'learn',
    learningSnapshotReady: false, learningSnapshotGeneration: 0, learningSnapshotRevision: 0,
    learningSurfaceRestore: null, logoutGeneration: 0, lastSnapshotJson: '',
    lastUnitId: '', lastScene: '', lastSurfaceOwner: '', canvasMode: 'slide', toolsCollapsed: true,
    focusRestore: null, compactLecturePrepared: false, document: { querySelector: () => shell },
    location: { search: study ? '?study=A' : '' }, AbortSignal, Set, Map, console,
    global: { innerHeight: 1000, StudyEntry: study ? { arm: 'A' } : null,
      ThreeArmStudyUI: study ? { run: { id: user } } : null,
      dispatchEvent(event) { events.push(event.type); } },
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options?.detail; } },
    $: selector => shell.querySelector(selector),
    isSignedIn: () => Boolean(context.state.participant && context.state.authToken),
    getUnit: () => context.loaded === false ? null : ({ id: context.currentUnitId, type: /-pre$/.test(context.currentUnitId) ? 'quiz' : 'knowledge', chapterId: 'V14-C1' }),
    getChapter: () => ({ units: [] }),
    selectedKnowledgeSceneType: unit => ['game', 'simulation'].includes(context.state.selectedKnowledgeScenes[unit.id]) ? context.state.selectedKnowledgeScenes[unit.id] : '',
    previewKnowledgeScenes: {}, knowledgeInteractionTypes: () => [{ id: 'game' }, { id: 'simulation' }],
    knowledgeResourceCandidate: () => null, knowledgeSceneDisplayLabel: value => value.id || value,
    trackLearningEvent() {}, analyticsTrack() {},
    learningDefaults: () => ({ completed: [], submittedQuizzes: [], selectedKnowledgeScenes: {}, currentView: 'home' }),
    validViews: new Set(['home', 'learn']), chapters: [{ id: 'V14-C1' }],
    clearPreviewKnowledgeSceneSelections() {}, normalizeLearningStateCompatibility() {},
    normalizeFailedQuizReviews() {}, loadAuthoritativeQuizResults: async () => {},
    persistStateLocally() {}, beijingNow: () => '2026-11-08T10:00:00Z',
    hideFullscreenHint() {}, setToolsCollapsed() {}, setLectureCollapsed(collapsed) { context.lectureCollapsed = collapsed; },
    compactWorkspace: () => false, pauseNarrationQueue() {}, syncPlayback() {},
    syncFullscreenHint() {}, syncKnowledgePrimaryAction() {}, renderTools() {},
    setLessonRailCollapsed(collapsed) { context.railCollapsed = collapsed; if (collapsed) shellClasses.add('lesson-collapsed'); else shellClasses.delete('lesson-collapsed'); },
    fetch: async () => ({ ok: true, json: async () => ({ ok: true, generation, revision: 3, snapshot: context.payload }) }),
    saveState() {
      const snapshot = vm.runInContext('learningSnapshot()', context);
      writes.push(JSON.parse(JSON.stringify(snapshot)));
      if (store) store.leaveContext(user, generation, snapshot.currentUnitId,
        snapshot.learningSurface === 'slide' ? 'slide' : snapshot.selectedKnowledgeScenes[snapshot.currentUnitId] || 'slide');
    }
  });
  context.window = context.global;
  for (const name of ['learningSession', 'learningSessionIsCurrent', 'setLearningSnapshotVersion', 'applyServerLearningSnapshot',
    'learningSurfaceRestoreFor', 'learningSnapshot', 'snapshotContentJson', 'hydrateLearningState', 'setKnowledgeSceneType']) {
    if (core.includes('function ' + name + '(')) vm.runInContext(coreFunction(name), context);
  }
  const start = workspace.indexOf('  function setCanvasMode('), end = workspace.indexOf('\n  shell.addEventListener("click"', start);
  assert(start >= 0 && end > start);
  vm.runInContext(workspace.slice(start, end), context);
  return { context, writes, events, run: code => vm.runInContext(code, context),
    async hydrate(snapshot) { context.payload = snapshot; return vm.runInContext('hydrateLearningState()', context); } };
}

const snapshot = (surface = 'interactive') => ({ currentUnitId: 'GH-01-K01', currentChapterId: 'V14-C1', currentView: 'learn',
  selectedKnowledgeScenes: { 'GH-01-K01': 'game' }, learningSurface: surface, completed: [], submittedQuizzes: [] });

async function main() {
  const SQL = await require('sql.js')(), database = new SQL.Database();
  const store = require('../lib/support-cycle').createStore({ db: { getDbSync: () => database, saveNow() {}, insertEvent() {} }, experimentId: 'synthetic-refresh' });
  const profile = { ...require('../lib/research-controls').defaults, boundaryOnly: true };
  async function engaged(user) {
    const scope = 'GH-01-K01';
    store.report(user, scope, 1, { need: 'concept', confirmed: true, sceneType: 'game' }, profile, 0);
    const cycle = await store.advance(user, scope, 1, { guard: () => ({ profileRevision: 0, boundary: true }),
      generate: async input => require('../lib/support-goals').generateSupport(input, { live: false }) });
    return store.act(user, cycle.id, 1, { action: 'accept' }, { adapter: {} });
  }
  const cycle = await engaged('study-synthetic-a'), h = harness(store);
  h.context.loaded = false;
  h.run('sync()');
  assert.equal(h.context.shell.dataset.classroomSurface, undefined, '认证快照尚未返回时不能先应用临时讲解场景');
  assert.equal(h.writes.length, 0, '初始化早于已验证快照时，不得先保存临时讲解场景');
  await h.hydrate(snapshot());
  assert.equal(h.run('learningSnapshot().learningSurface'), 'interactive', '课件仍未加载时，快照不得把已恢复场景改成讲解');
  h.run('sync()');
  assert(h.writes.every(s => s.learningSurface === 'interactive'), '单元尚未加载的中间 render 也不能污染恢复中的快照');
  h.context.loaded = true;
  h.run('sync()');
  assert.equal(h.context.shell.dataset.classroomSurface, 'interactive', '真实同步函数必须恢复 game 所在互动面板');
  assert(h.writes.length > 0);
  assert(h.writes.every(s => s.learningSurface === 'interactive'), '初始化所有写入都必须使用已恢复场景');
  assert.equal(store.current('study-synthetic-a', 'GH-01-K01', 1).id, cycle.id);
  assert.equal(store.current('study-synthetic-a', 'GH-01-K01', 1).status, 'engaged', '恢复及早期 snapshot 不得关闭同一支架');
  h.run('setCanvasMode("slide")');
  assert.equal(store.current('study-synthetic-a', 'GH-01-K01', 1).closeReason, 'scene_changed', '真实主动切讲解仍结束旧 game 支架');
  h.run('sync()');
  assert.equal(h.context.shell.dataset.classroomSurface, 'slide', '一次恢复不能覆盖后续用户明确切换');

  await engaged('study-late');
  const late = harness(store, 'study-late');
  late.run('sync()');
  assert.equal(late.writes.length, 0, '有缓存单元的早期 render 同样不能先写临时场景');
  await late.hydrate(snapshot()); late.run('sync()');
  assert.equal(late.context.shell.dataset.classroomSurface, 'interactive');
  late.context.currentUnitId = 'GH-01-K02'; late.context.state.selectedKnowledgeScenes['GH-01-K02'] = 'game'; late.run('sync()');
  assert.equal(late.context.shell.dataset.classroomSurface, 'slide', '真正换知识点按原规则回讲解');
  assert.equal(store.current('study-late', 'GH-01-K01', 1).closeReason, 'scene_changed', '真实换知识点仍结束旧支架');
  await engaged('study-scene');
  const scene = harness(store, 'study-scene'); await scene.hydrate(snapshot()); scene.run('sync()');
  scene.run('setKnowledgeSceneType("GH-01-K01", "simulation"); sync()');
  assert.equal(scene.context.shell.dataset.classroomSurface, 'interactive');
  assert.equal(store.current('study-scene', 'GH-01-K01', 1).closeReason, 'scene_changed', '真实换互动场景仍结束旧 game 支架');

  for (const mutation of [
    x => { x.currentUnitId = 'GH-01-K02'; },
    x => { x.state.participant = { participantId: 'study-other', study: { id: 'study-other' } }; },
    x => { x.global.ThreeArmStudyUI.run = { id: 'study-other' }; },
    x => { x.learningSnapshotGeneration = 2; },
    x => { x.state.selectedKnowledgeScenes['GH-01-K01'] = 'not-a-course-scene'; }
  ]) {
    const bad = harness(null); await bad.hydrate(snapshot()); mutation(bad.context); bad.run('sync()');
    assert.equal(bad.context.shell.dataset.classroomSurface, 'slide', '过时或不匹配的单元、轮次、代次、场景不能恢复');
  }
  const legacy = harness(null); legacy.context.learningSnapshotReady = true;
  legacy.context.state.learningSurface = 'interactive'; legacy.run('sync()');
  assert.equal(legacy.context.shell.dataset.classroomSurface, 'slide', '无当前已验证快照的旧 localStorage 字段不能恢复');
  const ordinary = harness(null, 'ordinary-synthetic', 1, false); await ordinary.hydrate(snapshot()); ordinary.run('sync()');
  assert.equal(ordinary.context.shell.dataset.classroomSurface, 'interactive', '普通账号无 study 对象仍可恢复');
  const invalid = harness(null); await invalid.hydrate(snapshot('other')); invalid.run('sync()');
  assert.equal(invalid.context.shell.dataset.classroomSurface, 'slide');
  const shortScreen = harness(null); await shortScreen.hydrate(snapshot());
  shortScreen.context.global.innerHeight = 760;
  shortScreen.context.$('.player').clientWidth = 850;
  shortScreen.run('sync()');
  assert.equal(shortScreen.context.lectureCollapsed, true, '短屏首次恢复互动后仍按原规则收叠讲稿');
  assert.equal(shortScreen.context.railCollapsed, true, '画布较窄时首次恢复互动后仍按原规则收叠路径栏');
  assert.equal(shortScreen.context.compactLecturePrepared, true);
  assert(shortScreen.writes.every(s => s.learningSurface === 'interactive'));
  const switched = harness(null); await switched.hydrate(snapshot()); switched.run('sync()');
  switched.context.state.participant = { participantId: 'study-new', study: { id: 'study-new' } };
  switched.context.global.ThreeArmStudyUI.run = { id: 'study-new' };
  await switched.hydrate(null); switched.context.currentUnitId = 'GH-01-K01'; switched.run('sync()');
  assert.equal(switched.context.shell.dataset.classroomSurface, 'slide', '同单元换账号/新轮次且无服务端快照时不继承旧互动面板');
  const delayed = harness(null); let resolveResponse;
  delayed.context.fetch = () => new Promise(resolve => { resolveResponse = resolve; });
  const hydration = delayed.hydrate(snapshot());
  delayed.context.state.participant = { participantId: 'study-other', study: { id: 'study-other' } };
  resolveResponse({ ok: true, json: async () => ({ ok: true, generation: 1, revision: 3, snapshot: snapshot() }) });
  assert.equal(await hydration, false);
  assert.equal(delayed.context.learningSurfaceRestore, null, '换账号后晚到的旧快照不得创建恢复上下文');
  delayed.run('sync()'); assert.equal(delayed.writes.length, 0);

  const independentUser = 'study-check', independent = await engaged(independentUser);
  store.act(independentUser, independent.id, 1, { action: 'start_check' }, { adapter: { nextVerificationCheck: () => ({ id: 'synthetic-check', options: [] }) } });
  store.leaveContext(independentUser, 1, 'GH-01-K01', 'slide');
  assert.equal(store.current(independentUser, 'GH-01-K01', 1).status, 'awaiting_check', '原独立检查保护不受场景恢复修改影响');
  database.close();
  console.log('刷新上下文回归通过：早/晚 hydration、先保存时序、同 run/unit/game 支架保留、真实切页关闭、错身份/代次/场景拒绝、普通账号、独立检查保护。');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
