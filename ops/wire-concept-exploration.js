'use strict';
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),route=require('../data/multi-scene-learning-route.json');
const M=require('../resources/open-maic/主动探索证据/exploration-model');
let count=0;
for(const module of route.chapters.find(c=>c.id==='V14-C1').modules)for(const point of module.knowledgePoints)for(const candidate of point.resourceCandidates){
 if(!M.get(point.id,candidate.type))continue;
 const file=path.join(root,'resources',candidate.root,candidate.file);let source=fs.readFileSync(file,'utf8');
 source=source.replace(/\n<!-- concept-exploration:start -->[\s\S]*?<!-- concept-exploration:end -->\n?/g,'\n');
 source=source.replace(/(<script[^>]*id="openmaic-semantic-contract"[^>]*>)([\s\S]*?)(<\/script>)/,(_,a,json,b)=>{
  const contract=JSON.parse(json);contract.contract_revision=M.version;contract.evidence_events=[...new Set([...contract.evidence_events,'attempt_submitted','challenge_result','task_progress'])];
  Object.assign(contract.capabilities,{reports_attempt:true,reports_challenge:true,judges_correctness:true});
  contract.concept_exploration={version:M.version,optional:true,grading:'server_rechecked_process',independent:false};return a+'\n'+JSON.stringify(contract,null,2)+'\n'+b;
 });
 const relative=path.relative(path.dirname(file),path.join(root,'resources/open-maic/主动探索证据')).replace(/\\/g,'/');
 const block=`\n<!-- concept-exploration:start -->\n<script type="application/json" data-concept-exploration>${JSON.stringify({point:point.id,scene:candidate.type})}</script>\n<script src="${relative}/exploration-model.js"></script>\n<script src="${relative}/exploration-runtime.js"></script>\n<!-- concept-exploration:end -->\n`;
 if(!source.includes('</body>'))throw Error('课件缺少 body 结束标签');source=source.replace('</body>',block+'</body>');fs.writeFileSync(file,source);count++;
}
if(count!==18)throw Error('预期18个非game场景，实际'+count);console.log('已接入18个自由探索场景；原探索与操作保持开放。');
