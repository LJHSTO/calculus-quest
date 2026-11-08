'use strict';
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), assert = require('node:assert/strict');
const { readPackage } = require('../lib/openmaic-package');
const root = path.resolve(__dirname, '..'), prefix = 'resources/open-maic/pro-supplements-r11';
const sha = data => crypto.createHash('sha256').update(data).digest('hex');
const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const input = process.argv[2]; assert(input, '请指定已复核的 OpenMAIC Pro 课堂 ZIP');
const packet = readPackage(path.resolve(input)), scenes = packet.manifest.scenes;
assert.equal(scenes.length, 6); assert.equal(packet.manifest.stage.name, '函数与极限·原风格例题补充·r11');
const routeFile = path.join(root, 'data/multi-scene-learning-route.json'), route = JSON.parse(fs.readFileSync(routeFile, 'utf8'));
const points = route.chapters.find(c => c.id === 'V14-C1').modules.flatMap(m => m.knowledgePoints);
const files = [], records = [];
function write(relative, content) { const file = path.join(root, relative); assert(file.startsWith(root + path.sep)); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, content); files.push({ path: relative, bytes: Buffer.byteLength(content), sha256: sha(content) }); }
for (const [index, scene] of scenes.entries()) {
  const point = points[index]; assert.equal(scene.content.type, 'interactive');
  let html = scene.content.html; assert(typeof html === 'string' && html.includes('id="rv"') || typeof html === 'string' && html.includes("id='rv'"));
  assert(!/<(?:script|iframe)[^>]+src=["']https?:/i.test(html), '补页不能依赖未经冻结的远程脚本或嵌入页面');
  const sourceHtmlHash = sha(html), id = point.id + '-pro-r11-example';
  const page = structuredClone(point.slide.lecturePages?.[0]); assert(page?.canvas?.elements?.length, '缺少原有降级文字讲解');
  page.canvas.id = id; page.canvas.authoredHtml = prefix + '/' + point.id + '.html';
  const actions = scene.actions.filter(a => a.type === 'speech').map(a => ({ id: a.id, type: a.type, text: a.text, audioRef: a.audioRef }));
  assert.equal(actions.length, 3);
  // The fallback must say the same thing as this page's narration, even if its HTML cannot load.
  page.canvas.elements = [
    { id: id+'-title', type:'text', left:40, top:30, width:920, height:65, rotate:0, content:'<p style="font-size:27px;color:#1e3a8a;font-weight:700">'+escape(scene.title)+'</p>', defaultFontName:'Microsoft YaHei' },
    ...actions.map((a,i)=>({ id:id+'-step-'+i, type:'text', left:55, top:115+i*125, width:890, height:115, rotate:0, content:'<p style="font-size:20px;line-height:1.5;color:#334155">'+escape(a.text)+'</p>', defaultFontName:'Microsoft YaHei' })),
    { id:id+'-fallback', type:'text', left:55, top:515, width:890, height:30, rotate:0, content:'<p style="font-size:14px;color:#64748b">交互页暂时未能加载，先阅读同页讲解；切回上一页后可重新进入。</p>', defaultFontName:'Microsoft YaHei' }
  ];
  for (const action of actions) {
    assert(/^audio\/audio-\d+\.mp3$/.test(action.audioRef), '媒体路径无效');
    const audio = packet.entries.get(action.audioRef); assert(audio, '缺少配套语音');
    const target = prefix + '/' + action.audioRef; if (!files.some(f => f.path === target)) write(target, audio.read());
  }
  const init = `<script>window.__cqLectureError=false;window.addEventListener('error',function(){window.__cqLectureError=true;parent.postMessage({type:'cq:authored-lecture-error',pageId:${JSON.stringify(id)}},'*');});</script>`;
  const ready = `<script>document.addEventListener('DOMContentLoaded',function(){Promise.resolve(document.fonts&&document.fonts.ready).then(function(){if(!window.__cqLectureError&&document.getElementById('rv')&&document.getElementById('stage'))parent.postMessage({type:'cq:authored-lecture-ready',pageId:${JSON.stringify(id)}},'*');});});</script>`;
  html = html.replace(/<head>/i, '<head>' + init).replace(/<body(?:\s[^>]*)?>/i, match => match.replace('>', ' data-cq-lecture-page="true">')).replace(/<\/body>/i, ready + '</body>');
  write(page.canvas.authoredHtml, html);
  Object.assign(page, { title: scene.title, summary: actions.map(a => a.text).join('\n'), kind: 'pro_authored_worked_example', audioRoot: 'open-maic/pro-supplements-r11', teachingActions: actions });
  point.slide.lecturePages = [page]; point.slide.pages = [point.slide.canvas, page.canvas]; point.slide.lectureVersion = 'openmaic-pro-lessons-r11';
  records.push({ pointId: point.id, title: scene.title, sourceHtmlSha256: sourceHtmlHash, installedPath: page.canvas.authoredHtml, narrationCount: actions.length });
}
const identity = route.chapters.flatMap(chapter => [
  ...['preQuiz', 'postQuiz'].flatMap(phase => (chapter.flow?.[phase]?.questions || []).map(q => ({ chapterId: chapter.id, unitId: chapter.id + '-' + (phase === 'preQuiz' ? 'pre' : 'post'), id: q.id, sourceId: q.sourceId, type: q.type, knowledgePointIds: q.knowledgePointIds, points: q.points }))),
  ...(chapter.modules || []).flatMap(m => (m.knowledgePoints || []).flatMap(p => (p.formativeQuiz?.questions || []).map(q => ({ chapterId: chapter.id, unitId: p.id + '-formative', id: q.id, sourceId: q.sourceId, type: q.type, knowledgePointIds: q.knowledgePointIds, adaptiveRole: q.adaptiveRole, points: q.points }))))
]);
route.quizKnowledgePointCuration.questionSetFingerprint = sha(JSON.stringify(identity));
fs.writeFileSync(routeFile, JSON.stringify(route, null, 2) + '\n');
write(prefix + '/provenance.json', JSON.stringify({ version: 'openmaic-pro-lessons-r11', source: 'OpenMAIC Pro', sourcePackageSha256: packet.sourceHash, integration: '保留原讲解页与24个互动；六个Pro补页仅增加加载握手和网站上下文标记。', pages: records, files }, null, 2) + '\n');
console.log(JSON.stringify({ pages: records.length, files: files.length, sourcePackageSha256: packet.sourceHash }));
