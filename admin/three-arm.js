(function(){
  'use strict';
  const host=document.getElementById('study-admin-content'),status=document.getElementById('study-admin-status');let token='';
  const el=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
  function button(text,fn){const b=el('button',text);b.type='button';b.onclick=async()=>{b.disabled=true;status.textContent='';try{await fn();}catch(e){status.textContent=e.message;}finally{b.disabled=false;}};return b;}
  async function request(path='',body){const r=await fetch('api/admin/three-arm'+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});const p=await r.json();if(!r.ok)throw new Error(p.message||'读取失败');return p.data;}
  function download(name,data){const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json;charset=utf-8'})),a=el('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  async function load(){const {protocol:p}=await request();host.replaceChildren();document.getElementById('study-admin-login').hidden=true;
    const section=el('section');section.append(el('h2','三组共同默认配置'),el('p','A固定；B可配置并获得关联反馈；C可配置并获得常规回顾。B、C修改规则相同。体验与正式记录分别保存。'));
    const list=el('ul');for(const [id,description]of LearnerPreferences.behaviorSummary(p.answers))list.append(el('li',id+'：'+description));section.append(list,el('p',p.teacherReview.status==='approved'?`已由 ${p.teacherReview.reviewer} 于 ${new Date(p.teacherReview.at).toLocaleString('zh-CN')} 确认。`:'尚未完成教师确认。三个体验入口可使用，正式随机分组入口等待确认。'));
    if(p.teacherReview.status!=='approved'){
      const name=el('input');name.placeholder='审阅教师或负责人姓名';name.setAttribute('aria-label','配置审阅人');const note=el('textarea');note.placeholder='确认依据或说明';note.setAttribute('aria-label','配置审阅说明');const label=el('label'),check=el('input');check.type='checkbox';label.append(check,document.createTextNode('我已实际审阅以上六项共同默认配置，确认适合本次教学任务'));section.append(name,note,label,button('记录教师确认并开放正式入口',async()=>{await request('/baseline',{reviewer:name.value,note:note.value,confirmed:check.checked});await load();}));
    }
    const links=el('p');for(const [arm,text]of [['A','A组体验'],['B','B组体验'],['C','C组体验'],['assigned','正式统一入口']]){const a=el('a',text);a.href='./?study='+arm;a.target='_blank';a.style.marginRight='16px';links.append(a);}section.append(links);host.append(section);
    host.append(button('导出三组完整研究记录',async()=>download('三组实验记录-'+new Date().toISOString().slice(0,10)+'.json',await request('/export'))),button('打开匿名配置判断评分',rating),button('退出管理',()=>{token='';host.replaceChildren();document.getElementById('study-admin-login').hidden=false;}));
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
