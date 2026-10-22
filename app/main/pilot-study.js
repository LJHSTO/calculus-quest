(function(global){
  "use strict";
  let data={enrollment:null},snapshot=null,owner="",busy=false,revision=0,dialog=null,message="",preview=null,joinCode="",shown=new Set(),lastState="";
  const drafts=new Map(),presented=new Set();
  const el=(tag,value)=>{const n=document.createElement(tag);if(value!==undefined)n.textContent=value;return n;};
  const button=(label,run)=>{const n=el("button",label);n.type="button";n.className="button soft";n.onclick=run;return n;};
  function update(next){const serialized=JSON.stringify(next);data=next;if(serialized!==lastState){lastState=serialized;revision++;global.KnowledgeAssistant?.refreshSupportSurface();}}
  async function call(path,body){return global.KnowledgeAssistant.pilotRequest(path,body);}
  async function run(path,body){if(busy)return;const requestedOwner=owner;busy=true;message="";try{const next=await call(path,body);if(owner===requestedOwner)update(next);}catch(e){if(owner===requestedOwner)message=e.message;}finally{busy=false;revision++;global.KnowledgeAssistant?.refreshSupportSurface();if(dialog?.open&&owner===requestedOwner)showDialog();}}
  function active(s){return Boolean(data.enrollment?.status==="active"&&data.pending&&data.pending.scope===s.scopeKey&&s.signedIn&&s.active&&!s.locked&&!s.check&&s.unitType==="knowledge"&&s.supportCycle?.status!=="awaiting_check"&&(presented.has(data.pending.id)||!global.SupportCycleUI?.interactionBusy));}
  function choices(parent,label,options,d,key){const field=el("fieldset"),legend=el("legend",label);field.append(legend);const row=el("div");row.style.cssText="display:flex;flex-wrap:wrap;gap:8px;margin:8px 0";
    for(const [value,name] of options){const b=button(name,()=>{d[key]=value;for(const child of row.children)child.setAttribute("aria-pressed",String(child===b));});b.setAttribute("aria-pressed",String(d[key]===value));row.append(b);}field.append(row);parent.append(field);}
  function rating(parent,label,d,key){choices(parent,label,[[null,"无法判断／不愿回答"],...[1,2,3,4,5].map(n=>[n,String(n)])],d,key);}
  function note(parent,d,label){const field=el("label",label),input=el("textarea");input.rows=2;input.maxLength=1200;input.value=d.note||"";input.setAttribute("aria-label",label);input.oninput=()=>d.note=input.value;field.append(input);parent.append(field);}
  function render(s){const p=data.pending,d=drafts.get(p.id)||{need:"",timing:null,disruption:null,reason:"",note:""};drafts.set(p.id,d);
    const root=el("section");root.className="support-cycle pilot-probe";root.dataset.pilotProbe=p.id;root.style.cssText="max-height:340px;overflow:auto;overscroll-behavior:contain";presented.add(p.id);
    root.append(el("strong","预试记录 · 刚才的学习情况"),el("p","这是一次研究记录，可以跳过。请回想这条询问出现前的情况。"));
    choices(root,"刚才是否需要一点帮助？",[["yes","需要"],["no","不需要"],["uncertain","不确定"],["decline","不愿回答"]],d,"need");
    rating(root,"这个时刻适合出现一句帮助询问吗？1很不合适—5很合适",d,"timing");
    const extra=el("details");extra.append(el("summary","补充困难、打扰程度或拒绝原因（可不填）"));
    note(extra,d,"刚才主要卡在哪里，或正在做什么？（可不填）");
    rating(extra,"这次询问打断了正在做的事吗？1完全没有—5非常明显",d,"disruption");
    choices(extra,"请选择最接近的原因",[["none","不需要"],["bad_time","时机不好"],["try_myself","想自己试"],["mismatch","内容不对"],["decline","不愿回答"],["other","其他"]],d,"reason");root.append(extra);
    const status=el("p",message);status.setAttribute("role","status");root.append(status);
    root.append(button(busy?"正在保存…":"保存这次记录",()=>{if(!d.need){status.textContent="请选择需要、不需要、不确定或不愿回答。";return;}run("/action",{action:"answer",id:p.id,...d});}),button("跳过，继续学习",()=>run("/action",{action:"skip",id:p.id})),button("退出预试",()=>open()));
    return root;
  }
  function showDialog(){
    if(!dialog){dialog=el("dialog");dialog.id="pilot-dialog";dialog.style.cssText="width:min(620px,calc(100vw - 32px));max-height:85vh;border:1px solid #dce0ed;border-radius:18px;padding:24px;color:#24324a;background:white;overflow:auto";document.body.append(dialog);}
    dialog.replaceChildren(el("h2",data.enrollment?.status==="active"?"预试记录":"参加学习预试"));
    dialog.append(button("关闭",()=>dialog.close()));
    if(data.enrollment?.status==="active"){
      dialog.append(el("p",`参与编号：${data.enrollment.participantCode}；已抽取${data.completedProbes}次记录。`),el("p",`版本：${data.version.sequence}。${data.version.withdrawal}`));
      const details=el("details");details.append(el("summary","结束本次预试并填写问卷"));
      const d=drafts.get("final")||{burden:null,control:null,usefulness:null,appropriateness:null,note:""};drafts.set("final",d);
      for(const [key,label] of [["burden","记录和询问的负担：1很轻—5很重"],["control","能自主拒绝或结束帮助：1完全不能—5完全可以"],["usefulness","帮助对本次学习有用：1完全无用—5非常有用"],["appropriateness","整体出现时机合适：1很不合适—5很合适"]])rating(details,label,d,key);
      note(details,d,"最不合适的一次、遗漏的帮助或其他建议（可不填）");details.append(button("提交结束问卷",()=>run("/action",{action:"finish",...d})));dialog.append(details);
      const request=el("textarea");request.rows=2;request.maxLength=500;request.setAttribute("aria-label","退出后的数据处理请求");
      dialog.append(el("p","退出会停止预试抽样，正常学习仍可继续。数据处理请求将交由研究负责人按同意书处理。"),el("label","退出后的数据处理请求（可不填）"),request,button("确认退出预试",()=>run("/action",{action:"withdraw",dataRequest:request.value})));
    } else {
      if(data.enrollment)dialog.append(el("p",data.enrollment.status==="withdrawn"?"你已退出预试。":"本次预试已结束。"));
      const label=el("label","研究者提供的加入码"),input=el("input");input.value=joinCode;input.autocomplete="off";input.setAttribute("aria-label","预试加入码");input.oninput=()=>joinCode=input.value;label.append(input);dialog.append(label);
      dialog.append(button("阅读预试说明",async()=>{try{preview=await call("/preview",{joinCode});message="";}catch(e){message=e.message;}showDialog();}));
      if(preview){dialog.append(el("h3",preview.title),el("p",preview.consentText),el("p",`负责人：${preview.responsible}；联系：${preview.contact}`),el("p",`数据保存：${preview.retention}`),el("p",`退出及数据处理：${preview.withdrawal}`));
        const agree=el("label"),box=el("input");box.type="checkbox";agree.append(box,document.createTextNode("我已阅读以上说明，自愿参加本版本预试。"));dialog.append(agree,button("确认并加入",()=>{if(!box.checked){message="请先阅读并勾选自愿参加。";showDialog();return;}run("/start",{joinCode,consent:true,versionHash:preview.hash});}));}
    }
    const status=el("p",message);status.setAttribute("role","status");dialog.append(status);
  }
  async function open(){try{update(await call(""));}catch(e){message=e.message;}showDialog();if(!dialog.open)dialog.showModal();}
  async function tick(){
    if(busy||!snapshot?.signedIn)return;
    const s=snapshot,requestedOwner=owner;
    try{
      if(data.enrollment?.status==="active"){
        const changed=data.pending&&(data.pending.scope!==s.scopeKey||s.locked||s.check||s.supportCycle?.status==="awaiting_check"||!s.active||document.hidden);
        if(changed){await run("/action",{action:"context_changed"});return;}
        const next=s.unitId&&s.unitType==="knowledge"?await call("/opportunity",{scope:s.scopeKey,unitId:s.unitId,sceneType:s.sceneType,
          foreground:!document.hidden,active:s.active,interactionBusy:global.SupportCycleUI?.interactionBusy===true||s.busy||s.supportBusy||dialog?.open===true}):await call("");
        if(owner!==requestedOwner)return;update(next);
        global.KnowledgeAssistant?.refreshSupportSurface();
        const p=data.pending;
        if(p&&active(s)&&!shown.has(p.id)&&!document.hidden){
          const docs=[document,...[...document.querySelectorAll("iframe")].flatMap(f=>{try{return f.contentDocument?[f.contentDocument]:[];}catch{return [];}})];
          const node=docs.flatMap(d=>[...d.querySelectorAll("[data-pilot-probe]")]).find(n=>n.dataset.pilotProbe===p.id&&n.getClientRects().length&&n.getBoundingClientRect().bottom>0&&n.getBoundingClientRect().top<(n.ownerDocument.defaultView?.innerHeight||innerHeight));
          if(node){shown.add(p.id);call("/action",{action:"shown",id:p.id}).catch(()=>shown.delete(p.id));}
        }
      }
    }catch(e){if(owner===requestedOwner)message=e.message;}
  }
  global.PilotStudyUI=Object.freeze({active,render,open,get revision(){return revision+":"+Boolean(data.pending&&!presented.has(data.pending.id)&&global.SupportCycleUI?.interactionBusy);}});
  document.getElementById("pilot-entry-button")?.addEventListener("click",open);
  global.addEventListener("cq:proactive-state",async e=>{snapshot=e.detail;const key=snapshot.signedIn?snapshot.ownerKey+":"+snapshot.generation:"";
    if(key!==owner){owner=key;data={enrollment:null};preview=null;joinCode="";drafts.clear();shown.clear();presented.clear();lastState="";dialog?.close();if(key){try{const next=await call("");if(key===owner)update(next);}catch{}}}
  });
  setInterval(tick,5000);
})(window);
