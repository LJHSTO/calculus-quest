import { readFileSync } from 'fs';
const md = readFileSync('D:/Desktop/calculus-quest-conversation.md', 'utf-8');

// Look for remaining noise
const noiseTerms = ['No response requested', 'Also in the error path', 'Now let me', 'Now I need'];
for (const s of noiseTerms) {
  const re = new RegExp(s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
  const count = (md.match(re) || []).length;
  if (count > 0) console.log('FOUND', count, 'x:', s);
}

// Check for long English-only paragraphs
const paras = md.split('\n\n');
let enCount = 0;
for (const p of paras) {
  const cjk = (p.match(/[一-鿿]/g) || []).length;
  if (cjk === 0 && p.length > 80 && !p.startsWith('#') && !p.startsWith('>') && !p.startsWith('`') && !p.startsWith('|')) {
    enCount++;
    if (enCount <= 5) console.log('ENGLISH para (' + p.length + 'c):', p.slice(0, 200));
  }
}
console.log('Total English paras >80 chars:', enCount);
console.log('Done.');
