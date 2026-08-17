const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const assessmentRoot = path.join(root, 'prompts', 'assessments');
const modules = fs.readdirSync(assessmentRoot)
  .filter((name) => /^(?:GH-\d{2}|EXT-\d{2})$/.test(name))
  .filter((name) => fs.existsSync(path.join(assessmentRoot, name, 'outputs', `${name}-pre-post.json`)))
  .filter((name) => {
    if (name.startsWith('GH-')) return Number(name.slice(3)) >= 3;
    return Number(name.slice(4)) >= 1 && Number(name.slice(4)) <= 5;
  })
  .sort((a, b) => a.localeCompare(b, 'en'));

function answerText(answer) {
  return Array.isArray(answer) ? answer.join('、') : String(answer ?? '');
}

function renderQuestion(q, index) {
  if (typeof q === 'string') q = JSON.parse(q);
  const lines = [];
  const role = q.adaptiveRole === 'core' ? '核心题' : q.adaptiveRole === 'diagnostic' ? '诊断题（核心题答错后显示）' : '';
  lines.push(`#### ${index}. ${q.question}`);
  lines.push('');
  lines.push(`- 题型：${q.type}${role ? `；角色：${role}` : ''}`);
  lines.push(`- 知识点：${(q.knowledgePointIds || []).join('、')}`);
  if (q.options) {
    lines.push('- 选项：');
    lines.push('');
    for (const option of q.options) lines.push(`  - ${option.value}. ${option.label}`);
  }
  lines.push(`- 参考答案：${answerText(q.answer)}`);
  lines.push(`- 解析：${q.analysis}`);
  if (q.rubric) {
    lines.push('- 评分标准：');
    lines.push('');
    for (const item of q.rubric) lines.push(`  - ${item.criterion}（${item.points} 分）`);
  }
  lines.push('');
  return lines.join('\n');
}

const out = [
  '# 已审核测评题汇总（GH-03 至 GH-14、EXT-01 至 EXT-05）',
  '',
  '> 本文档所列章节均已完成程序校验、数学与教学合理性人工审核，并按章节提交至 feat/assessment-redesign 分支。',
  '',
  '> 每个知识点形测包含 1 道核心单选题和 1 道诊断多选题；诊断题仅在核心题答错后显示。',
  ''
];

for (const moduleId of modules) {
  const outputDir = path.join(assessmentRoot, moduleId, 'outputs');
  const prePost = JSON.parse(fs.readFileSync(path.join(outputDir, `${moduleId}-pre-post.json`), 'utf8'));
  out.push(`## ${moduleId}（已审核）`, '');
  for (const outline of prePost.outlines) {
    const label = /pre/i.test(outline.id) ? '前测' : '后测';
    const cleanTitle = outline.title.replace(new RegExp(`^${label}：`), '');
    out.push(`### ${label}：${cleanTitle}`, '');
    outline.keyPoints.forEach((q, i) => out.push(renderQuestion(q, i + 1)));
  }
  const checks = fs.readdirSync(outputDir).filter((name) => /-K\d+-check\.json$/.test(name)).sort();
  out.push('### 知识点形测', '');
  for (const file of checks) {
    const check = JSON.parse(fs.readFileSync(path.join(outputDir, file), 'utf8'));
    const outline = check.outlines[0];
    out.push(`#### ${outline.title}`, '');
    outline.keyPoints.forEach((q, i) => out.push(renderQuestion(q, i + 1)));
  }
}

const target = path.join(assessmentRoot, 'ASSESSMENT-REVIEW-ALL.md');
fs.writeFileSync(target, `${out.join('\n').replace(/\n+$/, '')}\n`, 'utf8');
console.log(target);
