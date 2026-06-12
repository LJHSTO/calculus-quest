import { readFileSync, writeFileSync } from 'fs';

const jsonlPath = process.argv[2];
const outPath = process.argv[3] || jsonlPath.replace(/\.jsonl$/, '.md');

const lines = readFileSync(jsonlPath, 'utf-8').split(/\r?\n/).filter(Boolean);

let md = `# 对话记录\n\n> 导出时间: ${new Date().toLocaleString('zh-CN')}\n\n---\n\n`;
let qaNum = 0;
let userText = '';
let asstBlocks = [];

function cleanText(raw) {
  return raw.replace(/\n?\[ATTACHMENTS_PATHS_BEGIN\][\s\S]*?\[ATTACHMENTS_PATHS_END\]\n?/g, '');
}

const sysMarkers = [
  'Primary Request and Intent:',
  'Key Technical Concepts:',
  'Files and Code Sections:',
  'Errors and fixes:',
  'Problem Solving:',
  'All user messages:',
  'Pending Tasks:',
  'Current Work:',
  'Optional Next Step:',
  'Direct quote from user:',
  'Working directory:',
  'Continue the conversation from where it left off',
  'If you need specific details from before compaction',
  'Recent assistant responses (summarized):',
  'Recent user questions/requests:',
  'This session is being continued from a previous conversation',
  'ran out of context',
];

// Exact-match noise
const noiseSet = new Set([
  'No response requested.',
  'Also in the error path:',
]);

// English progress-update patterns — only match if the block has NO Chinese
const noisePatterns = [
  /^Now let me /, /^Now I['’]ll /, /^Now I /, /^Now adding /, /^Now updating /,
  /^Now building /, /^Now fixing /, /^Now install/, /^Now,? let/,
  /^Let me also /, /^Let me check /, /^Let me look /, /^Let me read /,
  /^Let me verify /, /^Let me fix /, /^Let me add /, /^Let me update /,
  /^Let me start /, /^Let me get /, /^Let me see /, /^Let me (re)?run /,
  /^Let me make /, /^Let me ensure /, /^Let me fetch /, /^Let me confirm /,
  /^Let me (re)?start /, /^Let me test /, /^Let me handle /, /^Let me finish /,
  /^Let me know /, /^Let me grab /, /^Let me find /, /^Let me implement /,
  /^Good, now /, /^OK, now /, /^Alright, now /,
  /^I['’]ll also /, /^I will also /, /^I['’]ve also /,
  /^Also (remove|update|add|fix|check|make|ensure|need) /,
  /^Now (the|all|both|these|we|that|this|I) /,
  /^(Server|Database|Everything|All) (is |looks |seems )/,
  /^Dependencies installed/,
  /^The files were auto-converted/,
  /^Starting with /, /^Then /, /^First,? /, /^Next,? /, /^Finally,? /,
  /^This (is|will|should|would|might|could) /,
  /^I (see|found|notice|think|believe|suspect) /,
  /^Wait[,.!]? /,
  /^Hmm[,.!]? /,
];

function isSystemSummary(text) {
  return sysMarkers.some(m => text.includes(m));
}

function isNoise(text) {
  if (noiseSet.has(text)) return true;
  // Only filter English-only blocks that match progress patterns
  const hasCJK = /[一-鿿]/.test(text);
  if (!hasCJK && noisePatterns.some(p => p.test(text))) return true;
  return false;
}

// Return user's actual question, or empty if it's just system text
function extractUserQuestion(raw) {
  let text = raw;
  // Strip task notifications
  text = text.replace(/<task-notification>[\s\S]*?<\/task-notification>/g, '');
  // Strip attachment blocks
  text = text.replace(/\n?\[ATTACHMENTS_PATHS_BEGIN\][\s\S]*?\[ATTACHMENTS_PATHS_END\]/g, '');
  text = text.trim();
  if (!text) return '';

  // Full system summary — skip entirely
  if (text.startsWith('This session is being continued') || text.startsWith('SessionStart hook additional context')) {
    // Try to find actual user instruction at the end
    const lines = text.split('\n');
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i].trim();
      if (!line) continue;
      if (isSystemSummary(line)) return '';
      if (line.startsWith('<')) continue;
      if (line.startsWith('Summary:') || line.startsWith('Continue ') || line.startsWith('Recent ')) continue;
      return line;
    }
    return '';
  }
  return text;
}

function flush() {
  if (userText && asstBlocks.length > 0) {
    const kept = asstBlocks.filter(b => !isSystemSummary(b) && !isNoise(b));
    if (kept.length > 0) {
      qaNum++;
      md += `## ${qaNum}. 问\n\n${userText}\n\n## 答\n\n${kept.join('\n\n')}\n\n---\n\n`;
    }
  }
  userText = '';
  asstBlocks = [];
}

for (const line of lines) {
  let entry;
  try { entry = JSON.parse(line); } catch { continue; }

  if (entry.type === 'user' && entry.message?.role === 'user') {
    const c = entry.message.content;
    if (typeof c !== 'string') continue;
    const question = extractUserQuestion(c);
    flush(); // Always flush — even if this message is empty
    if (question) userText = question;
  }

  if (entry.type === 'assistant' && entry.message?.role === 'assistant') {
    const content = entry.message.content;
    if (!Array.isArray(content)) continue;
    for (const block of content) {
      if (block.type === 'text' && block.text && block.text.trim()) {
        asstBlocks.push(block.text.trim());
      }
    }
  }
}

flush();
writeFileSync(outPath, md, 'utf-8');
console.log(`Done. ${qaNum} Q&A pairs → ${outPath}`);
