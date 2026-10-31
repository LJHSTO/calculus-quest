"use strict";
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright-core');
const root=path.resolve(__dirname,'..');
const sample=String.raw`可以。最简单的例子是“输入一个数，输出它的平方”。

设规则为
\[
f(x)=x^2
\]

比如：
- 输入 \(2\)，输出 \(f(2)=4\)
- 输入 \(-3\)，输出 \(f(-3)=9\)

对同一个输入，规则只能给出一个结果。不能又说 \(f(2)=4\)，又说 \(f(2)=5\)。不同输入可以得到相同输出。

\[
f(2)=4,\quad f(-2)=4
\]`;
async function main(){
 const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 const out=path.join(root,'output/服务器同步与模型接入-20261030/回答排版回归');fs.mkdirSync(out,{recursive:true});
 const results=[];
 try{
  const page=await browser.newPage({viewport:{width:900,height:1100}});
  await page.setContent('<main><article class="knowledge-message assistant"><div><strong>知点</strong></div><div class="assistant-content"></div></article></main>');
  const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
  for(const m of html.matchAll(/<link rel="stylesheet" href="([^"]+)"/g))await page.addStyleTag({path:path.join(root,m[1].split('?')[0])});
  await page.addScriptTag({path:path.join(root,'app/main/assistant-content.js')});
  await page.addStyleTag({content:'body{display:block;background:white;padding:24px}main{width:320px}.knowledge-message{width:100%}'});
  await page.evaluate(text=>AssistantContent.renderInto(document.querySelector('.assistant-content'),text),sample);
  for(const width of [280,320,390]){
   await page.locator('main').evaluate((e,w)=>e.style.width=w+'px',width);
   const geometry=await page.locator('.assistant-content').evaluate(e=>({width:e.clientWidth,scroll:e.scrollWidth,blocks:[...e.children].map(c=>{const r=c.getBoundingClientRect();return {tag:c.tagName,x:r.x,y:r.y,w:r.width,h:r.height};})}));
   assert.ok(geometry.blocks.length>=5);
   assert.ok(geometry.scroll<=geometry.width+2,'回答不得横向撑出侧栏');
   assert.ok(geometry.blocks.every(b=>b.w>=width*.75),'每段应占满正文宽度，不得被挤成竖列');
   for(let i=1;i<geometry.blocks.length;i++)assert.ok(geometry.blocks[i].y>=geometry.blocks[i-1].y+geometry.blocks[i-1].h-1,'段落、公式和列表须从上到下排列');
   await page.screenshot({path:path.join(out,'回答宽度-'+width+'.png')});results.push({width,...geometry});
  }
  fs.writeFileSync(path.join(out,'验收结果.json'),JSON.stringify({passed:true,results},null,2));
  console.log('回答排版通过：280、320、390px，段落和列表纵向排列、无横向溢出。');
 }finally{await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
