(function(){"use strict";
 const by=id=>document.getElementById(id),el=(tag,text)=>{const n=document.createElement(tag);if(text!=null)n.textContent=String(text);return n;};let credential="",role="rater";
 const base=location.pathname.replace(/\/research-rater\.html$/,"");
 for(const [id,label] of [["study","研究方向"],["mode","记录类型"],["role","身份"],["credential","评分凭据或管理员密码"]])by(id).setAttribute("aria-label",label);
 async function api(operation,body){const prefix=role==="admin"?"admin/":"",r=await fetch(base+"/api/"+prefix+"research-sites/"+by("study").value+"/"+operation+"?mode="+by("mode").value,{method:body?"POST":"GET",headers:{Authorization:"Bearer "+credential,"Content-Type":"application/json"},...(body?{body:JSON.stringify(body)}:{})});const j=await r.json();if(!r.ok)throw new Error(j.message);return j.data;}
 const button=(text,fn)=>{const b=el("button",text);b.type="button";b.onclick=()=>Promise.resolve().then(fn).catch(e=>{by("message").textContent=e.message;});return b;};
 async function show(){const target=by("review");target.replaceChildren();by("message").textContent="正在读取";
  if(role==="admin"){
   const box=el("section");box.className="panel";const name=el("input");name.setAttribute("aria-label","评分者编号");name.maxLength=100;
   box.append(el("h2","创建本方向独立评分凭据"),name,button("创建凭据",async()=>{const r=await api("raters",{name:name.value});const token=el("textarea");token.readOnly=true;token.value=r.token;token.setAttribute("aria-label","新评分凭据");box.append(el("p","此凭据仅用于当前方向和记录类型。请由负责人安全交给对应评分者。"),token);}));
   box.append(button("下载研究记录",async()=>{const data=await api("export"),blob=new Blob([JSON.stringify(data,null,2)],{type:"application/json"}),url=URL.createObjectURL(blob),a=el("a");a.href=url;a.download=by("study").selectedOptions[0].textContent+"-研究记录.json";a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}));target.append(box);by("message").textContent="管理员只在此创建凭据与导出。独立评分请切换评分者身份。";return;
  }
  const data=await api("rater");by("message").textContent=data.reviewer+"：共"+data.items.length+"份待独立复核的回答。没有材料时可稍后刷新。";
  for(const item of data.items){const box=el("article");box.className="panel case-box";box.append(el("h2","回答片段"),el("p",item.prompt),el("blockquote",item.response),el("h3","评分量规"));
   const list=el("ul");for(const rubric of item.rubric||[])list.append(el("li",typeof rubric==="string"?rubric:rubric.criterion+"（"+rubric.points+"分）"));box.append(list,el("p","参考解释："+item.referenceAnswer));
   const score=el("input");score.type="number";score.min="0";score.max=String(item.maxScore);score.step="0.5";const label=el("label","得分（0–"+item.maxScore+"）");label.append(score);const reason=el("textarea");reason.maxLength=3000;reason.setAttribute("aria-label","评分依据");box.append(label,el("p","依据具体步骤说明给分和扣分"),reason);
   if(item.reviews.length)box.append(el("p","你已记录的评分："+item.reviews.map(r=>r.score+"分，"+r.reason).join("；")));
   const save=button("记录独立评分",async()=>{if(score.value===""||!reason.value.trim())throw new Error("请填写分数和评分依据。");await api("rater",{blindId:item.blindId,score:Number(score.value),reason:reason.value});save.disabled=true;save.textContent="本次评分已保存";});box.append(save);target.append(box);
  }
 }
 by("login").onsubmit=e=>{e.preventDefault();credential=by("credential").value;by("credential").value="";role=by("role").value;show().catch(e=>{by("message").textContent=e.message;});};
 fetch(base+"/api/research-sites").then(r=>r.json()).then(j=>{for(const s of j.data.sites)by("study").append(new Option(s.title,s.id));}).catch(()=>{by("message").textContent="暂时无法读取研究目录。";});
})();
