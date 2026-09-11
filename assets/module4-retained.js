(function(global){'use strict';
const check=(v,m)=>{if(!v)throw Error(m);},validate=global.M4SetPacket.validate;
const labels={answered:'已有回答',partial:'部分回答',missing:'未覆盖（待判断必要性）',unknown:'未知',not_applicable:'不适用'};
function database(){return new Promise((resolve,reject)=>{const r=indexedDB.open('amzwn-module4-local-results',1);r.onupgradeneeded=()=>r.result.createObjectStore('records');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(Error('无法打开本地结果存储'));});}
async function storage(key,value){const db=await database();try{return await new Promise((resolve,reject)=>{const t=db.transaction('records',value===undefined?'readonly':'readwrite'),s=t.objectStore('records'),r=value===undefined?s.get(key):s.put(value,key);let result;r.onsuccess=()=>{result=r.result;};t.oncomplete=()=>resolve(result);t.onerror=()=>reject(Error('本地结果保存失败'));t.onabort=t.onerror;});}finally{db.close();}}
let context=null,generation=0,active=null,feedback={},cloud=null,readState="loading";const root=document.createElement('section');root.id='module4-retained';root.className='m4-retained';root.hidden=true;
const tool=document.getElementById('module4'),stage=document.getElementById('report-stage');if(tool)tool.prepend(root);else if(stage)stage.after(root);else return;
const node=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
const key=c=>[c.userId,c.task.id,c.task.asin].map(encodeURIComponent).join(':');
function note(text){const p=root.querySelector('[data-notice]');if(p)p.textContent=text;}
function download(value,name){const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'})),a=node('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
async function remote(c,route,body){
 const session=await global.AMZWN.currentSession();check(session?.user?.id===c.userId,'账号已变化');
 const url=new URL(global.AMZWN.config.apiUrl);url.pathname=route;url.search='';url.hash='';if(!body)url.searchParams.set('taskId',c.task.id);
 const res=await fetch(url,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+session.access_token,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),cache:'no-store',signal:AbortSignal.timeout(10000)});
 const data=await res.json();const current=await global.AMZWN.currentSession();check(current?.user?.id===c.userId,'账号已变化');
 if(!res.ok){const error=Error(data.message||'服务端结果暂不可用');error.status=res.status;throw error;}return data;
}
async function show(next){const ticket=++generation;context=next;active=null;feedback={};cloud=null;readState='loading';root.replaceChildren();root.hidden=!next?.userId||!next?.task?.id||!/^B[A-Z0-9]{9}$/.test(next?.task?.asin||'');if(root.hidden)return;
 render();try{const session=await global.AMZWN.currentSession();if(ticket!==generation)return;if(session?.user?.id!==next.userId){root.hidden=true;context=null;return;}
 const data=await remote(next,'/api/module4/set-result');if(ticket!==generation)return;
 check(data.ok===true&&data.taskId===next.task.id&&data.asin===next.task.asin&&Object.hasOwn(data,'result'),'服务端结果归属无效');
 if(data.result){const r=data.result,v=await validate(r.bundle,next.task.asin,{allowSimulation:r.simulation===true});if(ticket!==generation)return;
 check(r.responseSha256===v.packet.record.responseSha256&&Number.isSafeInteger(r.version)&&r.version>0,'服务端结果版本无效');
 active=v;feedback=r.feedback||{};cloud={version:r.version,responseSha256:r.responseSha256};readState='server';render();
 try{await storage(key(next),{asin:next.task.asin,bundle:{packet:v.packet,review:v.review},feedback,serverSimulation:v.packet.source==='SIMULATION'});}catch{if(ticket===generation)note('服务端结果已读取；本地缓存不可用。');}
 }else{readState='pending';render();}
 }catch(e){if(ticket!==generation)return;readState='unavailable';
 if([401,403].includes(e.status)){render();note('未获结果访问权限，请重新登录或选择自己的任务。');return;}
 try{const saved=await storage(key(next));if(ticket!==generation)return;if(saved){check(saved.asin===next.task.asin,'缓存产品不匹配');const v=await validate(saved.bundle,next.task.asin,{allowSimulation:saved.serverSimulation===true});if(ticket!==generation)return;active=v;feedback=saved.feedback||{};readState='offline';}}catch{}
 render();note('服务端读取失败；'+(active?'以下仅为本机留存，可能过期。':'无法判断是否已经生成，请稍后重新读取。'));}
}
function render(){root.replaceChildren();if(!context)return;root.append(node('h2','模块4 · 整套图片诊断'),node('p',context.task.asin+' · '+({loading:'正在读取任务结果',server:'服务端结果；复核修改后可保存',pending:'服务端尚无整套结果',unavailable:'服务端暂不可用',offline:'离线本机留存，可能过期',local:'手动导入的本机留存，未上传'}[readState])));
 const bar=node('div');bar.className='m4-retained-actions';const input=node('input');input.type='file';input.accept='.json';input.setAttribute('aria-label','导入当前产品已留存的六图结果');const notice=node('p');notice.dataset.notice='';notice.setAttribute('role','status');
 input.addEventListener('change',async()=>{const file=input.files[0];input.value='';if(!file)return;const ticket=generation,c=context;try{check(file.size<=5000000,'结果包超过5MB');const bundle=JSON.parse(await file.text()),v=await validate(bundle,c.task.asin);if(ticket!==generation)return;let restored={};if(bundle.feedback){const f=bundle.feedback;check(f.format==='M4_AI_SET_FEEDBACK_V1'&&f.taskId===c.task.id&&f.analysisPacketSha256===v.packetSha256&&f.humanSigned===false&&f.businessQualityPass===null,'复核记录不属于当前任务或原始结果');check(f.feedback&&typeof f.feedback==='object'&&!Array.isArray(f.feedback),'复核格式无效');for(const [id,item]of Object.entries(f.feedback)){check(v.questions.some(q=>q.id===id)&&['unreviewed','accept','dispute','pending'].includes(item.decision)&&typeof item.note==='string'&&item.note.length<=2000,'复核内容无效');restored[id]={decision:item.decision,note:item.note};}}await storage(key(c),{asin:c.task.asin,bundle:{packet:v.packet,review:v.review},feedback:restored});if(ticket!==generation)return;active=v;feedback=restored;cloud=null;readState='local';render();note('结果已保存到当前账号与任务的本地空间。');}catch(e){if(ticket===generation)note(e.message);}});
 const retry=node('button','重新读取服务端结果');retry.type='button';retry.addEventListener('click',()=>show(context));bar.append(input,retry);if(tool){const link=node('a','在报告页查看');link.href='../report/?task='+encodeURIComponent(context.task.id);bar.append(link);}else{const link=node('a','返回工具页');link.href='../tool/?module4Task='+encodeURIComponent(context.task.id)+'#module4';bar.append(link);}root.append(bar,notice);
 if(!active){root.append(node('p',readState==='loading'?'正在读取……':readState==='pending'?'此任务尚无整套AI结果，待生成。可导入该产品已有留存结果；不会套用其他产品或样例。':'当前没有可显示的结果。读取失败不代表尚未生成。'));return;}
 if(active.packet.source==='SIMULATION')root.append(node('p','模拟模型 / 离线测试结果：没有真实模型调用，不能作为业务诊断。'));
 const a=active.packet.analysis,view=structuredClone(a);if(active.review){for(const c of active.review.changes){const t=view.topics.find(t=>t.id===c.topic);t.coverage=c.coverage;t.reason=c.reason;if(c.evidence)t.evidence=c.evidence;}root.append(node('p','当前含与原始响应绑定的助手复核层，未代替用户确认。'));}
 root.append(node('p',active.review?'原始概览请展开下方“原始AI结果”；主题卡片显示复核层。':a.summary));
 const preview=node('img');preview.className='m4-retained-preview';preview.hidden=true;preview.alt='';root.append(preview);
 const evidence=(parent,list)=>{for(const e of list){const b=node('button',e.sampleId+' · '+e.location);b.type='button';b.addEventListener('click',()=>{preview.src=active.images.find(i=>i.id===e.sampleId).url;preview.alt=e.sampleId+' '+e.location;preview.hidden=false;preview.scrollIntoView({block:'center'});});parent.append(b,node('p',e.observation));}};
 for(const t of view.topics){const card=node('article');card.className='m4-retained-topic';card.append(node('h3',active.questions.find(q=>q.id===t.id).question),node('b',labels[t.coverage]),node('p',t.reason));const ev=node('details');ev.append(node('summary','查看图证据'));evidence(ev,t.evidence);card.append(ev);const rev=node('details');rev.append(node('summary','按需复核此项'));const select=node('select');select.setAttribute('aria-label','复核 '+t.id);for(const [v,l]of [['unreviewed','未复核'],['accept','同意'],['dispute','有异议'],['pending','待确认']]){const o=node('option',l);o.value=v;select.append(o);}const field=node('textarea');field.maxLength=2000;field.placeholder='可选：说明异议或依据';const f=feedback[t.id]||{};select.value=['accept','dispute','pending'].includes(f.decision)?f.decision:'unreviewed';field.value=typeof f.note==='string'?f.note:'';
  const save=async()=>{const ticket=generation,c=context,v=active;feedback[t.id]={decision:select.value,note:field.value};try{await storage(key(c),{asin:c.task.asin,bundle:{packet:v.packet,review:v.review},feedback:structuredClone(feedback),serverSimulation:v.packet.source==='SIMULATION'});if(ticket===generation)note(cloud?'复核已暂存本机；请点击保存到服务器。':'复核已保存到本机；不要求逐项填写。');}catch(e){if(ticket===generation)note(e.message);}};select.addEventListener('change',save);field.addEventListener('change',save);rev.append(select,field);card.append(rev);root.append(card);}
 const roles=node('details');roles.append(node('summary','单图职责与建议'));for(const r of a.imageRoles){roles.append(node('h3',r.sampleId+' · '+r.task),node('p',r.reason));evidence(roles,r.basis);for(const x of r.recommendations)roles.append(node('p',x.text));}root.append(roles);
 if(active.review){const advice=node('details');advice.append(node('summary','改图建议与待核实事项'));for(const x of active.review.actions)advice.append(node('p',x));root.append(advice);}
 const raw=node('details');raw.append(node('summary','原始AI结果（未改写）'),node('pre',JSON.stringify(a,null,2)));root.append(raw);
 if(cloud){const saveCloud=node('button','保存复核到服务器');saveCloud.type='button';saveCloud.addEventListener('click',async()=>{const ticket=generation,c=context,binding={...cloud},submitted=structuredClone(feedback);saveCloud.disabled=true;try{const out=await remote(c,'/api/module4/set-review',{taskId:c.task.id,responseSha256:binding.responseSha256,expectedVersion:binding.version,feedback:submitted});if(ticket!==generation)return;check(out.ok===true&&out.version===binding.version+1&&out.responseSha256===binding.responseSha256,'保存状态不明确');cloud.version=out.version;note(JSON.stringify(feedback)===JSON.stringify(submitted)?'复核已保存到服务器。':'此次复核已保存；保存期间的新修改仍需再次保存。');}catch(e){if(ticket===generation){cloud=null;note('服务器保存未确认，请导出本地意见后重新读取核对；不会自动重试。');}}finally{if(ticket===generation)saveCloud.disabled=!cloud;}});root.append(saveCloud);}
 const exportButton=node('button','导出本地结果与复核');exportButton.type='button';exportButton.addEventListener('click',()=>download({packet:active.packet,review:active.review,feedback:{format:'M4_AI_SET_FEEDBACK_V1',source:active.packet.source,taskId:context.task.id,analysisPacketSha256:active.packetSha256,feedback:structuredClone(feedback),humanSigned:false,businessQualityPass:null}},context.task.asin+'-整套诊断与复核.json'));root.append(exportButton);
}
global.addEventListener('amzwn:module4-context',e=>show(e.detail));global.addEventListener('amzwn:explicit-logout',()=>show(null));global.addEventListener('amzwn:session-changed',e=>{if(!e.detail.session||e.detail.session.user.id!==context?.userId)show(null);});
global.AMZWN?.client?.auth?.onAuthStateChange((event,session)=>{if(!session||session.user.id!==context?.userId)show(null);});
global.AMZWN_RETAINED_SET=Object.freeze({validate,clear:()=>show(null)});
})(window);

(function(global){'use strict';
const tool=document.getElementById('module4');if(!tool)return;const root=document.createElement('section');root.id='module4-set-preparation';root.className='m4-retained';root.hidden=true;
const legacy=['module4-materials','module4-questions','module4-facts','module4-fee','module4-progress','module4-result'].map(id=>document.getElementById(id)).concat(tool.querySelector('.module4-quick-nav')).filter(Boolean);const anchor=document.getElementById('module4-materials');if(!anchor)return;anchor.before(root);
let ticket=0,current=null;const node=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
function clear(){ticket++;current=null;root.hidden=true;root.replaceChildren();for(const n of legacy)n.hidden=false;}
async function request(c,route='set-preparation',body){
 const session=await global.AMZWN.currentSession();if(session?.user?.id!==c.userId)throw Error('账号已变化');const url=new URL(global.AMZWN.config.apiUrl);url.pathname='/api/module4/'+route;url.search='';url.hash='';if(!body)url.searchParams.set('taskId',c.task.id);
 const r=await fetch(url,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+session.access_token,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),cache:'no-store',signal:AbortSignal.timeout(route==='set-execute'?75000:10000)});const d=await r.json();if((await global.AMZWN.currentSession())?.user?.id!==c.userId)throw Error('账号已变化');if(!r.ok||d.taskId!==c.task.id||d.asin!==c.task.asin)throw Error(d.message||'整套操作未完成');return d;
}
function render(c,d){
 const p=d.preparation;root.replaceChildren();root.hidden=false;for(const n of legacy)n.hidden=Boolean(d.canSave||d.saved);
 root.append(node('h2','本品六图 · 整套诊断'),node('p',c.task.asin+' · 仅 S01—S06，不含竞品'),node('p','当前状态：'+d.status));
 root.append(node('p',!d.saved?'以下主题沿用此前本品六图核对内容，尚未保存和确认。':p.humanConfirmed?'已明确确认当前问题及未知事实状态。':'六图准备草稿已保存，尚未确认或执行。'));
 const list=node('ul');for(const x of p.images)list.append(node('li',x.sampleId+' · 本品第'+x.sequence+'张'));root.append(list);
 const inputs=[],guarded=[];let dirty=false;
 for(const q of p.questions){const label=node('label','核对主题 '+(inputs.length+1)),field=node('textarea');field.value=q.question;field.maxLength=299;field.disabled=!d.canSave;field.setAttribute('aria-label','整套问题 '+q.id);field.addEventListener('input',()=>{dirty=true;for(const a of guarded)a.disabled=true;});label.append(field);root.append(label);inputs.push({id:q.id,field});}
 root.append(node('p','产品事实均保持未知：图片宣传或展示不等于已验证性能。确认未知状态，不会把它改成已验证的产品能力。'));
 const status=node('p');status.setAttribute('role','status');const base=()=>({taskId:c.task.id,expectedRevision:d.expectedRevision,expectedStateVersion:d.expectedStateVersion});
 async function action(button,route,extra){const turn=ticket;for(const control of root.querySelectorAll('input,textarea,button'))control.disabled=true;status.textContent='正在处理……';try{const out=await request(c,route,extra===null?undefined:{...base(),...extra});if(turn!==ticket)return;render(c,out);if(route==='set-execute')global.dispatchEvent(new CustomEvent('amzwn:module4-context',{detail:c}));}catch(e){if(turn===ticket){status.textContent=e.message+'；请重新读取核对，不会自动重试。';reload.disabled=false;}}}
 const save=node('button','一次保存六图、问题草稿与未知事实');save.type='button';save.disabled=!d.canSave;save.addEventListener('click',()=>action(save,'set-preparation',{questions:inputs.map(x=>({id:x.id,question:x.field.value.trim()})),facts:p.facts}));root.append(save);
 function confirmation(label,buttonText,allowed,route,extra){const wrap=node('label'),box=node('input');box.type='checkbox';box.setAttribute('aria-label',label);box.disabled=!allowed;const button=node('button',buttonText);button.type='button';button.disabled=true;guarded.push(box,button);box.addEventListener('change',()=>{button.disabled=dirty||!allowed||!box.checked;});button.addEventListener('click',()=>{if(!dirty&&box.checked)action(button,route,{acknowledgement:true,...extra});});wrap.append(box,node('span',label));root.append(wrap,button);}
 confirmation('我已核对这七个问题，并确认目前产品事实仍未知','确认问题与未知事实',d.canConfirm,'set-confirm',{preparationDigest:p.digest});
 if(p.humanConfirmed&&d.status==='待费用授权'){
  const quoteButton=node('button','读取本次整套报价');quoteButton.type='button';guarded.push(quoteButton);quoteButton.addEventListener('click',()=>{if(!dirty)action(quoteButton,'set-quote',null);});root.append(quoteButton);
 }
 if(d.quote){const q=d.quote;root.append(node('h3',q.simulation?'模拟报价（不会调用真实模型）':'本次整套报价'),node('p','本品六图一次请求；最多1次，不自动重试。模型 '+q.model+'，输入估算上界 '+q.maxInputTokens+' Token，输出上限 '+q.maxOutputTokens+' Token。'),node('p',q.simulation?'预算演练金额 ¥'+q.budgetEstimateCny.toFixed(2)+'；实际模型费用 ¥0。':'费用估算 ¥'+q.budgetEstimateCny.toFixed(2)+'，不是供应商保证的硬金额上限；最终以实际账单为准。'));
  const details=node('details');details.append(node('summary','查看请求与报价绑定'),node('p','请求：'+d.requestSha256),node('p','报价：'+d.quoteSha256),node('p','价格依据：'+q.source));root.append(details);
  const text=q.simulation?'我明确授权本次六图模拟执行，不调用真实模型':'我明确授权以上请求与估算费用，最多调用一次，不自动重试';
  confirmation(text,'保存本次独立授权',d.canAuthorize,'set-authorize',{requestSha256:d.requestSha256,quoteSha256:d.quoteSha256,approvalText:text+'；ASIN '+c.task.asin+'；请求 '+d.requestSha256+'；估算 ¥'+q.budgetEstimateCny+'；不是硬金额上限。'});
 }
 if(d.status==='待处理'&&d.authorizationId){const run=node('button',d.simulation?'执行一次整套模拟':'执行一次整套分析');run.type='button';run.disabled=!d.executionEnabled;guarded.push(run);run.addEventListener('click',()=>{if(!dirty)action(run,'set-execute',{authorizationId:d.authorizationId});});root.append(run);}
 const reload=node('button','重新读取整套状态');reload.type='button';reload.addEventListener('click',()=>show(c,true));root.append(reload,status);
 if(!d.executionEnabled)root.append(node('p','真实执行保持关闭：可以核对准备资料，不能创建执行授权或调用模型。'));
 if(d.receipt)root.append(node('p','本次执行已留存：'+({reserved:'已预留',in_flight:'调用中',published:'结果已发布',failed:'失败',unclear:'状态不明确'}[d.receipt.outcome]||'待核对')+'。不会自动重试。'+(d.receipt.chargeUnknown?'计费状态不明确，须核对留存记录。':'')));
}
async function show(c,force=false){if(!force&&c?.userId===current?.userId&&c?.task?.id===current?.task?.id)return;clear();if(!c?.userId||!c?.task?.id)return;current=c;const turn=ticket;try{const d=await request(c);if(turn===ticket)render(c,d);}catch(e){if(turn!==ticket)return;if((await global.AMZWN.currentSession())?.user?.id!==c.userId){if(turn===ticket)clear();return;}if(turn!==ticket)return;current=null;root.hidden=false;root.append(node('p','整套诊断：'+e.message));}}
global.addEventListener('amzwn:module4-context',e=>show(e.detail));global.addEventListener('amzwn:explicit-logout',clear);global.addEventListener('amzwn:session-changed',e=>{if(!e.detail.session||e.detail.session.user.id!==current?.userId)clear();});global.AMZWN?.client?.auth?.onAuthStateChange((_,s)=>{if(!s||s.user.id!==current?.userId)clear();});
})(window);
