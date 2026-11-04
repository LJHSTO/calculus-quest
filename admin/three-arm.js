(function(){
  'use strict';
  const host=document.getElementById('study-admin-content'),status=document.getElementById('study-admin-status');let token='';
  const el=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
  function button(text,fn){const b=el('button',text);b.type='button';b.onclick=async()=>{b.disabled=true;status.textContent='';try{await fn();}catch(e){status.textContent=e.message;}finally{b.disabled=false;}};return b;}
  async function request(path='',body){const r=await fetch('api/admin/three-arm'+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});const p=await r.json();if(!r.ok)throw new Error(p.message||'读取失败');return p.data;}
  function download(name,data){const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json;charset=utf-8'})),a=el('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  function csv(name,rows){if(!rows.length){status.textContent='没有符合条件的记录。';return;}const keys=[...new Set(rows.flatMap(r=>Object.keys(r)))],text=[keys,...rows.map(r=>keys.map(k=>typeof r[k]==='object'&&r[k]!==null?JSON.stringify(r[k]):r[k]))].map(r=>r.map(AdminCsv.csvCell).join(',')).join('\r\n'),url=URL.createObjectURL(new Blob(['\uFEFF'+text],{type:'text/csv;charset=utf-8'})),a=el('a');a.href=url;a.download=name+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  async function load(){const {protocol:p}=await request();host.replaceChildren();document.getElementById('study-admin-login').hidden=true;
    const section=el('section');section.append(el('h2','三组共同默认配置'),el('p','A固定；B可配置并获得关联反馈；C可配置并获得常规回顾。B、C修改规则相同。体验与正式记录分别保存。'));
    const list=el('ul');for(const [id,description]of LearnerPreferences.behaviorSummary(p.answers))list.append(el('li',id+'：'+description));section.append(list,el('p',p.teacherReview.status==='approved'?`已由 ${p.teacherReview.reviewer} 于 ${new Date(p.teacherReview.at).toLocaleString('zh-CN')} 确认。`:'尚未完成教师确认。三个体验入口可使用，正式随机分组入口等待确认。'));
    if(p.teacherReview.status!=='approved'){
      const name=el('input');name.placeholder='审阅教师或负责人姓名';name.setAttribute('aria-label','配置审阅人');const note=el('textarea');note.placeholder='确认依据或说明';note.setAttribute('aria-label','配置审阅说明');const label=el('label'),check=el('input');check.type='checkbox';label.append(check,document.createTextNode('我已实际审阅以上六项共同默认配置，确认适合本次教学任务'));section.append(name,note,label,button('记录教师确认并开放正式入口',async()=>{await request('/baseline',{reviewer:name.value,note:note.value,confirmed:check.checked});await load();}));
    }
    const links=el('p');for(const [arm,text]of [['A','A组体验'],['B','B组体验'],['C','C组体验'],['assigned','正式统一入口']]){const a=el('a',text);a.href='./?study='+arm;a.target='_blank';a.style.marginRight='16px';links.append(a);}section.append(links);host.append(section);
    host.append(button('导出三组完整研究记录',async()=>download('三组实验记录-'+new Date().toISOString().slice(0,10)+'.json',await request('/export'))),button('数据核查与逐表导出',dataTools),button('查看介入与静默回放',replay),button('打开匿名配置判断评分',rating),button('退出管理',()=>{token='';host.replaceChildren();document.getElementById('study-admin-login').hidden=false;}));
  }
  async function dataTools(){
    const bundle=await request('/export'),manifest=bundle.manifest;host.replaceChildren(el('h2','数据核查与逐表导出'),button('返回管理',load));
    for(const note of manifest.notes)host.append(el('p',note));
    host.append(el('p',`共 ${bundle.runs.length} 个学习轮次；本次导出时间 ${new Date(manifest.exportedAt).toLocaleString('zh-CN')}。`));
    const mode=el('select');mode.setAttribute('aria-label','导出数据来源');mode.append(new Option('正式记录','formal'),new Option('体验记录','preview'));
    const version=el('select');version.setAttribute('aria-label','导出协议版本');for(const p of bundle.protocols)version.append(new Option(p.id+(p.fingerprint===bundle.protocol.fingerprint?'（当前）':''),p.fingerprint));version.value=bundle.protocol.fingerprint;
    const rows=()=>manifest.summaries.filter(r=>r.mode===mode.value&&r.protocolFingerprint===version.value),ids=()=>new Set(rows().map(r=>r.runId));
    const table=el('select');table.setAttribute('aria-label','导出记录表');for(const [name,count]of Object.entries(manifest.rowCounts))table.append(new Option(`${name} · 全部 ${count} 条`,name));
    host.append(mode,version,button('下载轮次核查摘要 CSV',()=>csv('三组轮次核查-'+mode.value,rows())),button('下载摘要字段说明',()=>download('三组摘要字段说明.json',manifest.dictionary)),table,button('下载所选原始表 CSV',()=>{const selected=ids();csv('三组原始记录-'+table.value+'-'+mode.value,(bundle.tables[table.value]||[]).filter(r=>selected.has(r.user_id)));}));
    const quality=el('section');function refresh(){quality.replaceChildren(el('h3','当前筛选的完整性提示'));for(const r of rows())quality.append(el('p',`${r.runId.slice(-8)} · ${r.arm}组 · 前测 ${r.preItems} / 形成测 ${r.formativeItems} / 后测 ${r.postItems} 题 · ${r.qualityFlags||'摘要未发现缺项；仍需检查原始记录'}。`));if(!rows().length)quality.append(el('p','当前版本暂无此类记录。'));}mode.onchange=version.onchange=refresh;refresh();host.append(quality);
    const section=el('section');section.append(el('h3','记录主试协助与程序偏差'),el('p','只写事实和处理情况，不填写姓名、联系方式或无关隐私。此记录不修改学生答案；退出意愿须由负责人按同意书另行处理。'));
    const run=el('select');run.setAttribute('aria-label','协助对应学习轮次');run.append(new Option('请选择学习轮次',''));for(const r of bundle.runs)run.append(new Option(`${r.id.slice(-8)} · ${r.mode==='formal'?'正式':'体验'} · ${r.arm}组`,r.id));
    const category=el('select');category.setAttribute('aria-label','主试记录类型');for(const [key,label]of [['technical','技术协助'],['procedure','程序偏差'],['interruption','外界中断'],['withdrawal','退出意愿']])category.append(new Option(label,key));
    const operator=el('input');operator.placeholder='主试编号';operator.setAttribute('aria-label','主试编号');const note=el('textarea');note.placeholder='发生时间、持续多久、事实与处理；不要抄录学生的解题内容';note.setAttribute('aria-label','主试事实记录');note.maxLength=2000;let requestId=crypto.randomUUID();
    section.append(run,category,operator,note,button('保存主试记录',async()=>{await request('/observation',{runId:run.value,category:category.value,operator:operator.value,note:note.value,requestId,reportedAt:new Date().toISOString()});note.value='';requestId=crypto.randomUUID();status.textContent='主试记录已保存，并纳入完整研究记录导出。';}));host.append(section);
  }
  async function replay(){
    const exported=await request('/export');host.replaceChildren(el('h2','介入与静默回放'));host.append(button('返回管理',load));
    const mode=el('select');mode.setAttribute('aria-label','回放数据来源');mode.append(new Option('正式参与记录','formal'),new Option('体验记录','preview'));
    const protocol=el('select');protocol.setAttribute('aria-label','回放协议版本');
    for(const p of (exported.protocols||[]).filter(p=>p.fingerprint))protocol.append(new Option(p.id+(p.id===exported.protocol.id?'（当前）':''),p.fingerprint));protocol.value=exported.protocol.fingerprint;
    const list=el('section');host.append(mode,protocol,button('读取所选版本',async()=>{
      const bundle=await request('/replay?mode='+mode.value+'&fingerprint='+encodeURIComponent(protocol.value));list.replaceChildren(el('p',`${bundle.participantCount} 位参与者，${bundle.caseCount} 个决策时刻；${bundle.excluded.length} 条因时间或配置记录不足未进入回放。`));
      list.append(button('下载回放与人工标注文件',()=>download('三组决策回放-'+mode.value+'.json',bundle)));
      const names={silent:'保持安静',present:'提供帮助',cancel:'取消',defer:'等待'};
      for(const item of bundle.cases.slice(-100)){const d=el('details');d.append(el('summary',`${new Date(item.input.cutoff).toLocaleString('zh-CN')} · ${item.input.knowledgePointId} · ${names[item.observedPolicy.action]}`),el('p','系统记录的原因：'+item.observedPolicy.reasonCodes.join('、')),el('p',`当时配置第 ${item.input.configuration.revision} 版；${item.input.history.length} 条此前操作记录。`),el('pre',JSON.stringify({当时依据:item.input.currentEvidence,当时配置:item.input.configuration.values},null,2)));list.append(d);}
    }),list);
  }
  async function rating(){const data=await request('/rating');host.replaceChildren(el('h2','配置判断人工评分'),el('p','评分页不显示分组和姓名。每题按三个评分点各给0–2分，六题满分36分。每位评分人独立保存一份；未评分不算0分。'));
    host.append(button('返回管理',load));const rater=el('input');rater.placeholder='你的评分人编号';rater.setAttribute('aria-label','评分人编号');host.append(rater);
    const rubric=el('pre',JSON.stringify(data.instrument.configurationRubric,null,2));host.append(rubric);
    for(const a of data.attempts){const card=el('article');card.append(el('h3','作答编号 '+a.runId.slice(-8)),el('p',`已有 ${a.ratings.length} 份评分。`));const scores={};
      for(const q of data.instrument.configurationCases){const field=el('fieldset');field.append(el('legend',q.focus),el('p',q.prompt),el('p','评分参考：'+q.guide),el('p','学生回答：'+(a.answers[q.id]||'')));scores[q.id]=[null,null,null];
        for(const [index,title]of data.instrument.configurationRubric.map(r=>r[0]).entries()){const label=el('label',title),s=el('select');s.append(new Option('请选择',''));for(const n of [0,1,2])s.append(new Option(String(n),String(n)));s.onchange=()=>scores[q.id][index]=s.value===''?null:Number(s.value);label.append(s);field.append(label);}card.append(field);
      }
      card.append(button('保存本份独立评分',async()=>{const saved=await request('/rating',{runId:a.runId,rater:rater.value,scores});status.textContent=`评分已保存：${saved.total}/36。`; }));host.append(card);
    }if(!data.attempts.length)host.append(el('p','暂时没有提交的配置判断。'));
  }
  document.getElementById('study-admin-enter').onclick=async()=>{token=document.getElementById('study-admin-token').value;document.getElementById('study-admin-token').value='';try{await load();}catch(e){status.textContent=e.message;}};
})();
