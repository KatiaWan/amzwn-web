(function(global){'use strict';
const check=(v,m)=>{if(!v)throw Error(m);},validate=global.M4SetPacket.validate;
const labels={answered:'已有回答',partial:'部分回答',missing:'未覆盖（待判断必要性）',unknown:'未知',not_applicable:'不适用'};
function database(){return new Promise((resolve,reject)=>{const r=indexedDB.open('amzwn-module4-local-results',1);r.onupgradeneeded=()=>r.result.createObjectStore('records');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(Error('无法打开本地结果存储'));});}
async function storage(key,value){const db=await database();try{return await new Promise((resolve,reject)=>{const t=db.transaction('records',value===undefined?'readonly':'readwrite'),s=t.objectStore('records'),r=value===undefined?s.get(key):s.put(value,key);let result;r.onsuccess=()=>{result=r.result;};t.oncomplete=()=>resolve(result);t.onerror=()=>reject(Error('本地结果保存失败'));t.onabort=t.onerror;});}finally{db.close();}}
let context=null,generation=0,active=null,feedback={},editorial=null,cloud=null,readState="loading";const root=document.createElement('section');root.id='module4-retained';root.className='m4-retained';root.hidden=true;
const tool=document.getElementById('module4'),stage=document.getElementById('report-stage');if(tool)tool.prepend(root);else if(!stage)return;
const node=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
const key=c=>[c.userId,c.task.id,c.task.asin].map(encodeURIComponent).join(':');
let reportHost=null,suppressTool=false;
function reportState(){if(!reportHost)return;const {panel,menu,legacy}=reportHost;
 const labels={loading:'加载中',server:'已生成 · 待复核',pending:legacy?'旧版报告可用':'待生成',unavailable:'读取错误',forbidden:'无访问权限',offline:'离线留存',local:'本机留存'};
 if(menu){menu.querySelector('small').textContent=labels[readState]||'加载中';menu.dataset.setState=readState;menu.classList.toggle('is-ready',readState==='server'||(readState==='pending'&&Boolean(legacy)));menu.classList.remove('is-coming');}
 if(legacy)legacy.hidden=readState!=='pending';panel.dataset.setState=readState;
}
function mountReport(frame,c){
 if(!context||c.userId!==context.userId||c.task.id!==context.task.id||c.task.asin!==context.task.asin)return;
 const doc=frame.contentDocument;if(!doc)return;
 const meta=doc.querySelector('meta[name="amzwn-task-id"]');if(meta&&meta.content!==c.task.id)return;
 let panel=doc.querySelector('.module-panel[data-module="05"]'),menu=doc.querySelector('.module-menu-item[for="module-toggle-05"]'),legacy=null;
 if(panel){if(!panel.querySelector('.coming-soon')&&panel.childNodes.length){legacy=doc.createElement('div');legacy.dataset.legacyReport05='';legacy.append(...panel.childNodes);}panel.replaceChildren();if(legacy)panel.append(legacy);}
 else{panel=doc.createElement('section');panel.id='report05';panel.setAttribute('aria-label','05 图片与卖点诊断');doc.body.append(panel);}
 const css=document.querySelector('link[href*="module4-retained.css"]');if(css&&!doc.querySelector('[data-set-styles]')){const link=doc.createElement('link');link.rel='stylesheet';link.href=css.href;link.dataset.setStyles='';doc.head.append(link);}
 panel.append(root);reportHost={panel,menu,legacy};reportState();
 if(new URLSearchParams(location.search).get('module')==='05'||location.hash==='#report05'){const toggle=doc.getElementById('module-toggle-05');if(toggle)toggle.checked=true;else panel.scrollIntoView();}
}
let imageViewer=null;
function closeImageViewer(restore=true){const v=imageViewer;if(!v)return;imageViewer=null;
 document.removeEventListener('wheel',v.blockScroll,true);document.removeEventListener('touchmove',v.blockScroll,true);
 if(v.dialog.open)v.dialog.close();v.dialog.remove();
 if(restore&&v.generation===generation&&v.trigger.isConnected){v.trigger.focus({preventScroll:true});v.frameWindow?.scrollTo({left:v.frameX,top:v.frameY,behavior:'instant'});global.scrollTo({left:v.x,top:v.y,behavior:'instant'});}
}
function openImageViewer(items,index,trigger){closeImageViewer(false);const dialog=node('dialog');dialog.className='m4-evidence-dialog';dialog.setAttribute('aria-label','图证据整图查看器');
 const title=node('h2'),description=node('p'),image=node('img'),status=node('p'),bar=node('div');title.id='m4-evidence-title';description.id='m4-evidence-description';dialog.setAttribute('aria-labelledby',title.id);dialog.setAttribute('aria-describedby',description.id);image.className='m4-evidence-full';status.setAttribute('role','status');status.className='m4-evidence-load';
 const close=node('button','关闭整图查看器'),previous=node('button','上一张证据'),next=node('button','下一张证据');for(const b of [close,previous,next])b.type='button';close.autofocus=true;close.className='m4-viewer-close';bar.className='m4-viewer-controls';bar.append(previous,next,close);
 description.textContent='显示完整原图。位置说明供人工对照，不含定位框或裁剪。按 Esc 关闭，左右方向键切换证据。';
 dialog.append(title,description,bar,image,status);document.body.append(dialog);
 const fw=trigger.ownerDocument.defaultView,v={dialog,trigger,generation,x:global.scrollX,y:global.scrollY,frameWindow:fw===global?null:fw,frameX:fw.scrollX,frameY:fw.scrollY,blockScroll:e=>{if(!e.ctrlKey)e.preventDefault();}};imageViewer=v;
 function display(){const item=items[index];title.textContent=item.sampleId+' · '+item.location+'（'+(index+1)+'/'+items.length+'）';image.alt=item.sampleId+' 完整原图；'+item.location;status.textContent='正在加载原图……';image.onload=()=>{if(imageViewer===v)status.textContent='完整原图已加载';};image.onerror=()=>{if(imageViewer===v)status.textContent='原图暂时无法加载，请关闭后稍后查看。';};image.src=item.url;previous.hidden=next.hidden=items.length<2;}
 const move=delta=>{index=(index+delta+items.length)%items.length;display();};previous.addEventListener('click',()=>move(-1));next.addEventListener('click',()=>move(1));close.addEventListener('click',()=>closeImageViewer());
 dialog.addEventListener('cancel',e=>{e.preventDefault();closeImageViewer();});dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closeImageViewer();}});
 dialog.addEventListener('keydown',e=>{if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();move(e.key==='ArrowLeft'?-1:1);}
  if(e.key==='Tab'){const buttons=[...dialog.querySelectorAll('button')].filter(b=>!b.hidden&&!b.disabled),first=buttons[0],last=buttons.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus({preventScroll:true});}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus({preventScroll:true});}}
 });
 display();dialog.showModal();close.focus({preventScroll:true});document.addEventListener('wheel',v.blockScroll,{capture:true,passive:false});document.addEventListener('touchmove',v.blockScroll,{capture:true,passive:false});
}
function note(text){const p=root.querySelector('[data-notice]');if(p)p.textContent=text;}
function download(value,name){const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'})),a=node('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
async function remote(c,route,body){
 const session=await global.AMZWN.currentSession();check(session?.user?.id===c.userId,'账号已变化');
 const url=new URL(global.AMZWN.config.apiUrl);url.pathname=route;url.search='';url.hash='';if(!body)url.searchParams.set('taskId',c.task.id);
 const res=await fetch(url,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+session.access_token,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),cache:'no-store',signal:AbortSignal.timeout(10000)});
 const data=await res.json();const current=await global.AMZWN.currentSession();check(current?.user?.id===c.userId,'账号已变化');
 if(!res.ok){const error=Error(data.message||'服务端结果暂不可用');error.status=res.status;throw error;}return data;
}
async function validateEditorial(e,c,v){
 const valid=(ok)=>check(ok,'业务编辑记录与当前任务不匹配');
 const hash=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(x=>x.toString(16).padStart(2,'0')).join('');
 valid(e&&e.format==='M4_BUSINESS_EDITORIAL_V1'&&e.source==='LOCAL_EDITORIAL'&&JSON.stringify(e).length<=12000000&&Number.isSafeInteger(e.revision)&&e.revision>0);
 const b=e.binding,p=v.packet;valid(b&&b.userId===c.userId&&b.taskId===c.task.id&&b.asin===c.task.asin&&b.requestSha256===p.record.requestSha256&&b.responseSha256===p.record.responseSha256);
 const text=x=>typeof x==='string'&&x.length>0&&x.length<=1600,unique=(xs,key)=>new Set(xs.map(x=>x[key])).size===xs.length;
 valid(Array.isArray(e.media)&&e.media.length<=40&&unique(e.media,'id'));
 const parts=JSON.parse(p.request).messages[0].content,ownMeta=Array.from({length:6},(_,i)=>JSON.parse(parts[1+i*2].text)),images=new Map();
 for(const m of e.media){valid(m&&typeof m.id==='string'&&/^[A-Z][A-Z0-9_-]*$/.test(m.id)&&/^B[A-Z0-9]{9}$/.test(m.asin)&&['own','competitor'].includes(m.role)&&typeof m.dataUrl==='string'&&m.dataUrl.length<=1000000&&/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(m.dataUrl));
 const bytes=Uint8Array.from(atob(m.dataUrl.slice(23)),c=>c.charCodeAt(0));valid(await hash(bytes)===m.sha256);
 if(m.role==='own')valid(m.asin===b.asin&&ownMeta.some(x=>x.sampleId===m.id&&x.imageFileSha256===m.sha256));else valid(m.asin!==b.asin);
 images.set(m.id,m);}
 valid(e.media.filter(m=>m.role==='own').length===6);
 const refs=(ids,role,asin)=>Array.isArray(ids)&&ids.length>0&&ids.length<=6&&new Set(ids).size===ids.length&&ids.every(id=>images.has(id)&&images.get(id).role===role&&(!asin||images.get(id).asin===asin));
 valid(Array.isArray(e.coverage)&&e.coverage.length===7&&unique(e.coverage,'id')&&e.coverage.every(x=>v.questions.some(q=>q.id===x.id)&&text(x.question)&&text(x.conclusion)&&text(x.reason)&&Array.isArray(x.evidence)&&(x.evidence.length===0||refs(x.evidence,'own'))));
 valid(Array.isArray(e.ownImages)&&e.ownImages.length===6&&unique(e.ownImages,'id')&&e.ownImages.every(x=>refs([x.id],'own')&&['title','keep','observation','change','decision'].every(k=>text(x[k]))));
 valid(Array.isArray(e.comparisons)&&e.comparisons.length<=8&&unique(e.comparisons,'asin'));
 for(const comp of e.comparisons){valid(comp.asin!==b.asin&&text(comp.brand)&&Array.isArray(comp.rows)&&comp.rows.length===7&&unique(comp.rows,'id'));
 for(const row of comp.rows){valid(v.questions.some(q=>q.id===row.id)&&['本品更清楚','竞品更清楚','接近','证据不足'].includes(row.verdict)&&['title','ownText','otherText','difference','change'].every(k=>text(row[k]))&&refs(row.own,'own')&&refs(row.other,'competitor',comp.asin)&&row.other.every(id=>images.get(id).variant===comp.variant));}}
 return structuredClone(e);
}

async function show(next){closeImageViewer(false);const ticket=++generation;context=next;active=null;editorial=null;feedback={};cloud=null;readState='loading';root.replaceChildren();if(!next&&reportHost){readState='forbidden';reportState();root.remove();reportHost=null;}root.hidden=!next?.userId||!next?.task?.id||!/^B[A-Z0-9]{9}$/.test(next?.task?.asin||'');if(root.hidden)return;
 render();try{const session=await global.AMZWN.currentSession();if(ticket!==generation)return;if(session?.user?.id!==next.userId){root.hidden=true;context=null;return;}
 const data=await remote(next,'/api/module4/set-result');if(ticket!==generation)return;
 check(data.ok===true&&data.taskId===next.task.id&&data.asin===next.task.asin&&Object.hasOwn(data,'result'),'服务端结果归属无效');
 if(data.result){const r=data.result,v=await validate(r.bundle,next.task.asin,{allowSimulation:r.simulation===true});if(ticket!==generation)return;
 check(r.responseSha256===v.packet.record.responseSha256&&Number.isSafeInteger(r.version)&&r.version>0,'服务端结果版本无效');
 let business=null,businessInvalid=false;if(r.editorial){try{business=await validateEditorial(r.editorial,next,v);}catch{businessInvalid=true;}}if(ticket!==generation)return;
 active=v;editorial=business;feedback=r.feedback||{};cloud={version:r.version,responseSha256:r.responseSha256};readState='server';render();if(businessInvalid)note('业务编辑记录校验未通过，仅显示原始任务结果。');
 try{await storage(key(next),{asin:next.task.asin,bundle:{packet:v.packet,review:v.review},feedback,serverSimulation:v.packet.source==='SIMULATION'});}catch{if(ticket===generation)note('服务端结果已读取；本地缓存不可用。');}
 }else{readState='pending';render();}
 }catch(e){if(ticket!==generation)return;readState='unavailable';
 if([401,403].includes(e.status)){readState='forbidden';render();note('未获结果访问权限，请重新登录或选择自己的任务。');return;}
 try{const saved=await storage(key(next));if(ticket!==generation)return;if(saved){check(saved.asin===next.task.asin,'缓存产品不匹配');const v=await validate(saved.bundle,next.task.asin,{allowSimulation:saved.serverSimulation===true});if(ticket!==generation)return;active=v;feedback=saved.feedback||{};readState='offline';}}catch{}
 render();note('服务端读取失败；'+(active?'以下仅为本机留存，可能过期。':'无法判断是否已经生成，请稍后重新读取。'));}
}
function render(){closeImageViewer(false);root.replaceChildren();reportState();if(!context)return;if(tool&&suppressTool){root.hidden=true;return;}root.hidden=false;root.append(node('h2','模块4 · 整套图片诊断'),node('p',context.task.asin+' · '+({loading:'正在读取任务结果',server:'已生成；尚未代表用户验收通过',pending:'服务端尚无整套结果',unavailable:'服务端暂不可用',forbidden:'无访问权限',offline:'离线本机留存，可能过期',local:'手动导入的本机留存，未上传'}[readState])));
 const bar=node('div');bar.className='m4-retained-actions';const input=node('input');input.type='file';input.accept='.json';input.setAttribute('aria-label','导入当前产品已留存的六图结果');const notice=node('p');notice.dataset.notice='';notice.setAttribute('role','status');
 input.addEventListener('change',async()=>{const file=input.files[0];input.value='';if(!file)return;const ticket=generation,c=context;try{check(file.size<=5000000,'结果包超过5MB');const bundle=JSON.parse(await file.text()),v=await validate(bundle,c.task.asin);if(ticket!==generation)return;let restored={};if(bundle.feedback){const f=bundle.feedback;check(f.format==='M4_AI_SET_FEEDBACK_V1'&&f.taskId===c.task.id&&f.analysisPacketSha256===v.packetSha256&&f.humanSigned===false&&f.businessQualityPass===null,'复核记录不属于当前任务或原始结果');check(f.feedback&&typeof f.feedback==='object'&&!Array.isArray(f.feedback),'复核格式无效');for(const [id,item]of Object.entries(f.feedback)){check(v.questions.some(q=>q.id===id)&&['unreviewed','accept','dispute','pending'].includes(item.decision)&&typeof item.note==='string'&&item.note.length<=2000,'复核内容无效');restored[id]={decision:item.decision,note:item.note};}}await storage(key(c),{asin:c.task.asin,bundle:{packet:v.packet,review:v.review},feedback:restored});if(ticket!==generation)return;active=v;editorial=null;feedback=restored;cloud=null;readState='local';render();note('结果已保存到当前账号与任务的本地空间。');}catch(e){if(ticket===generation)note(e.message);}});
 const retry=node('button','重新读取服务端结果');retry.type='button';retry.addEventListener('click',()=>show(context));if(tool)bar.append(input);bar.append(retry);if(tool){const link=node('a','在报告页查看');link.href='../report/?task='+encodeURIComponent(context.task.id)+'&module=05#report05';bar.append(link);}else{const link=node('a','返回工具页');link.href=new URL('../tool/?module4Task='+encodeURIComponent(context.task.id)+'#module4',location.href).href;link.target='_top';bar.append(link);}root.append(bar,notice);
 if(!active){root.append(node('p',readState==='loading'?'正在读取……':readState==='pending'?'此任务尚无整套AI结果，待生成。可导入该产品已有留存结果；不会套用其他产品或样例。':'当前没有可显示的结果。读取失败不代表尚未生成。'));return;}
 if(active.packet.source==='SIMULATION')root.append(node('p','模拟模型 / 离线测试结果：没有真实模型调用，不能作为业务诊断。'));
 const a=active.packet.analysis,view=structuredClone(a);if(active.review){for(const c of active.review.changes){const t=view.topics.find(t=>t.id===c.topic);t.coverage=c.coverage;t.reason=c.reason;if(c.evidence)t.evidence=c.evidence;}root.append(node('p','当前含与原始响应绑定的助手复核层，未代替用户确认。'));}
 // Business view consumes only the already validated current task packet.
 const section=(id,title)=>{const s=node('section');s.className='m4-business-section';s.id=id;s.append(node('h3',title));root.append(s);return s;};
 const nav=node('nav');nav.className='m4-business-nav';nav.setAttribute('aria-label','诊断章节');
 for(const [id,label]of [['m4-coverage','整套覆盖'],['m4-own-images','本品逐图分析'],['m4-comparison','竞品对比']]){const b=node('button',label);b.type='button';b.addEventListener('click',()=>root.querySelector('#'+id)?.scrollIntoView({block:'start'}));nav.append(b);}root.append(nav);
 const table=(host,head,kind)=>{const hint=node('p','左右拖动查看全部字段；点击缩略图放大。'),slider=node('input'),wrap=node('div'),tbl=node('table'),thead=node('thead'),tr=node('tr'),body=node('tbody');
 slider.type='range';slider.min='0';slider.max='1000';slider.value='0';slider.setAttribute('aria-label',host.querySelector('h3').textContent+'左右滚动');
 wrap.className='m4-business-scroll';wrap.tabIndex=0;wrap.setAttribute('role','region');wrap.setAttribute('aria-label',host.querySelector('h3').textContent+'表格');
 tbl.className='m4-business-table '+kind;for(const h of head)tr.append(node('th',h));thead.append(tr);tbl.append(thead,body);wrap.append(tbl);host.append(hint,slider,wrap);
 slider.addEventListener('input',()=>{wrap.scrollLeft=Number(slider.value)*(wrap.scrollWidth-wrap.clientWidth)/1000;});
 wrap.addEventListener('scroll',()=>{slider.value=wrap.scrollLeft*1000/Math.max(1,wrap.scrollWidth-wrap.clientWidth);});
 return body;};
 const cell=(tr,text,tag='td')=>{const n=node(tag,text);if(tag==='th')n.scope='row';tr.append(n);return n;};
 const evidence=(parent,list)=>{const items=list.map(e=>({...e,url:active.images.find(i=>i.id===e.sampleId)?.url||editorial?.media.find(i=>i.id===e.sampleId)?.dataUrl})).filter(e=>e.url);
 const group=node('div');group.className='m4-business-images';parent.append(group);
 if(!items.length){group.append(node('span','暂无对应图证据'));return;}
 for(const [index,e]of items.entries()){const figure=node('figure'),button=node('button'),image=node('img');
 button.type='button';button.className='m4-evidence-thumb';button.setAttribute('aria-label','放大整图 '+e.sampleId+' · '+e.location);
 image.src=e.url;image.alt=e.sampleId+' 完整原图';image.width=76;image.height=66;image.loading='lazy';
 button.append(image,node('span',e.sampleId));button.addEventListener('click',()=>openImageViewer(items,index,button));figure.append(button);
 if(e.observation)figure.append(node('figcaption',e.observation));group.append(figure);}};
 if(editorial)root.append(node('p','以下含当前任务的本地编辑意见；原始AI结果未改写，是否采纳由运营决定。'));
 root.dataset.reviewOpen='false';
 const reviewToggle=node('button','记录我的意见');reviewToggle.type='button';reviewToggle.setAttribute('aria-expanded','false');reviewToggle.addEventListener('click',()=>{const open=root.dataset.reviewOpen!=='true';root.dataset.reviewOpen=String(open);reviewToggle.setAttribute('aria-expanded',String(open));reviewToggle.textContent=open?'收起我的意见':'记录我的意见';});root.append(reviewToggle);
 const coverage=section('m4-coverage','买家关心什么，整套讲清了吗？');
 const coverageBody=table(coverage,['买家问题','整套结论','证据图','判断依据','按需复核'],'m4-business-coverage');
 for(const original of view.topics){const edited=editorial?.coverage.find(x=>x.id===original.id),t=edited?{...original,reason:edited.reason,evidence:edited.evidence.map(id=>({sampleId:id,location:'编辑引用',observation:''}))}:original;const row=node('tr');row.className='m4-retained-topic';cell(row,edited?.question||active.questions.find(q=>q.id===t.id).question,'th');
 const status=node('span',edited?.conclusion||labels[t.coverage]);status.className='m4-business-status';status.dataset.status=t.coverage;cell(row).append(status);
 evidence(cell(row),t.evidence);cell(row,t.reason);
 const rev=node('details');rev.append(node('summary','复核此项'));const select=node('select');select.setAttribute('aria-label','复核 '+t.id);
 for(const [value,label]of [['unreviewed','未复核'],['accept','同意'],['dispute','有异议'],['pending','待确认']]){const option=node('option',label);option.value=value;select.append(option);}
 const field=node('textarea');field.maxLength=2000;field.placeholder='可选：说明异议或依据';field.setAttribute('aria-label','复核说明 '+t.id);
 const f=feedback[t.id]||{};select.value=['accept','dispute','pending'].includes(f.decision)?f.decision:'unreviewed';field.value=typeof f.note==='string'?f.note:'';
 const save=async()=>{const ticket=generation,c=context,v=active;feedback[t.id]={decision:select.value,note:field.value};
 try{await storage(key(c),{asin:c.task.asin,bundle:{packet:v.packet,review:v.review},feedback:structuredClone(feedback),serverSimulation:v.packet.source==='SIMULATION'});
 if(ticket===generation)note(cloud?'复核已暂存本机；请点击保存到服务器。':'复核已保存到本机；不要求逐项填写。');}catch(e){if(ticket===generation)note(e.message);}};
 select.addEventListener('change',save);field.addEventListener('change',save);rev.append(select,field);cell(row).append(rev);coverageBody.append(row);}
 const own=section('m4-own-images','先看本品：逐图保留什么，怎么改？');
 const ownBody=table(own,['本品图片与职责',editorial?'编辑处理建议':'原结果判定','值得保留','观察与问题','具体改法'],'m4-business-own');
 const tasks={unknown:'职责未知',main_overview:'产品总览',length:'长度',installation:'安装',lighting:'灯光效果',control:'控制方式',music:'音乐',other:'其他'};
 const assessments={unknown:'待判断',ok:'职责成立',concern:'有疑问',not_applicable:'不适用'};
 for(const r of a.imageRoles){const edit=editorial?.ownImages.find(x=>x.id===r.sampleId);const row=node('tr');row.dataset.sampleId=r.sampleId;const pic=cell(row,undefined,'th');
 evidence(pic,[{sampleId:r.sampleId,location:tasks[r.task],observation:''}]);pic.append(node('span',edit?.title||tasks[r.task]));
 cell(row,edit?.decision||assessments[r.assessment]);cell(row,edit?.keep||(r.assessment==='ok'?r.reason:'原结果未单列保留意见'));
 const observations=r.basis.map(e=>e.observation);if(r.assessment!=='ok')observations.push(r.reason);cell(row,edit?.observation||observations.join('；')||'原结果未列出具体问题');
 const advice=cell(row);if(edit){advice.append(node('p',edit.change));ownBody.append(row);continue;}if(!r.recommendations.length)advice.append(node('span','原结果未提出修改建议'));
 for(const recommendation of r.recommendations)advice.append(node('p',recommendation.text));ownBody.append(row);}
 const compare=section('m4-comparison','本品 vs 竞品：逐项看谁讲得更清楚');
 if(!editorial?.comparisons.length){compare.dataset.state='unavailable';compare.append(node('p','当前任务留存结果仅包含本品分析，尚无绑定此任务的竞品比较结果。不会使用其他任务或样稿中的比较结论。'));}
 else{compare.dataset.state='ready';const tabs=node('div'),content=node('div');tabs.className='m4-business-nav';compare.append(tabs,content);
 const buttons=[];
 const choose=comp=>{content.replaceChildren();content.append(node('h3','本品 vs '+comp.brand));
 const body=table(content,['比较卖点','谁讲得更清楚','本品图文',comp.brand+'图文','为什么','本品怎么改'],'m4-business-comparison');
 for(const r of comp.rows){const tr=node('tr');cell(tr,r.title,'th');const badge=node('span',r.verdict);badge.className='m4-business-status';badge.dataset.status=r.verdict==='本品更清楚'?'answered':r.verdict==='竞品更清楚'?'partial':'unknown';cell(tr).append(badge);
const ownCell=cell(tr),otherCell=cell(tr),own=node('div'),other=node('div');own.className=other.className='m4-business-inline';ownCell.append(own);otherCell.append(other);evidence(own,r.own.map(id=>({sampleId:id,location:'本品编辑引用',observation:''})));own.append(node('p',r.ownText));evidence(other,r.other.map(id=>({sampleId:id,location:comp.brand+'编辑引用',observation:''})));other.append(node('p',r.otherText));cell(tr,r.difference);cell(tr,r.change);body.append(tr);}
 buttons.forEach(([b,c])=>b.setAttribute('aria-pressed',String(c===comp)));};
 for(const comp of editorial.comparisons){const b=node('button',comp.brand);b.type='button';b.addEventListener('click',()=>choose(comp));buttons.push([b,comp]);tabs.append(b);}choose(editorial.comparisons[0]);}
 if(cloud){const saveCloud=node('button','保存复核到服务器');saveCloud.className='m4-review-action';saveCloud.type='button';saveCloud.addEventListener('click',async()=>{const ticket=generation,c=context,binding={...cloud},submitted=structuredClone(feedback);saveCloud.disabled=true;try{const out=await remote(c,'/api/module4/set-review',{taskId:c.task.id,responseSha256:binding.responseSha256,expectedVersion:binding.version,feedback:submitted});if(ticket!==generation)return;check(out.ok===true&&out.version===binding.version+1&&out.responseSha256===binding.responseSha256,'保存状态不明确');cloud.version=out.version;note(JSON.stringify(feedback)===JSON.stringify(submitted)?'复核已保存到服务器。':'此次复核已保存；保存期间的新修改仍需再次保存。');}catch(e){if(ticket===generation){cloud=null;note('服务器保存未确认，请导出本地意见后重新读取核对；不会自动重试。');}}finally{if(ticket===generation)saveCloud.disabled=!cloud;}});root.append(saveCloud);}
 const exportButton=node('button','导出本地结果与复核');exportButton.type='button';exportButton.addEventListener('click',()=>download({packet:active.packet,review:active.review,feedback:{format:'M4_AI_SET_FEEDBACK_V1',source:active.packet.source,taskId:context.task.id,analysisPacketSha256:active.packetSha256,feedback:structuredClone(feedback),humanSigned:false,businessQualityPass:null}},context.task.asin+'-整套诊断与复核.json'));root.append(exportButton);
}
global.addEventListener('amzwn:set-preparation-view',e=>{if(e.detail.userId===context?.userId&&e.detail.taskId===context?.task.id){suppressTool=e.detail.managed;render();}});
global.addEventListener('amzwn:module4-context',e=>{if(e.detail?.userId!==context?.userId||e.detail?.task?.id!==context?.task?.id)suppressTool=false;show(e.detail);});global.addEventListener('amzwn:explicit-logout',()=>show(null));global.addEventListener('amzwn:session-changed',e=>{if(!e.detail.session||e.detail.session.user.id!==context?.userId)show(null);});
global.AMZWN?.client?.auth?.onAuthStateChange((event,session)=>{if(!session||session.user.id!==context?.userId)show(null);});
global.AMZWN_RETAINED_SET=Object.freeze({validate,mountReport,clear:()=>show(null)});
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
 global.dispatchEvent(new CustomEvent('amzwn:set-preparation-view',{detail:{userId:c.userId,taskId:c.task.id,managed:Boolean(d.canSave||d.saved)}}));
 const p=d.preparation,receipt=d.receipt,done=receipt?.outcome==='published',blocked=Boolean(receipt&&!done)||['失败','执行状态不明','运行中'].includes(d.status),authorized=d.status==='待处理'&&Boolean(d.authorizationId);
 const step=done?4:authorized||blocked?3:p.humanConfirmed?2:1;
 root.replaceChildren();root.hidden=false;for(const n of legacy)n.hidden=Boolean(d.canSave||d.saved);
 root.append(node('h2','本品六图 · 整套诊断'),node('p',c.task.asin+' · 仅 S01—S06，不含竞品'));
 const steps=node('ol');steps.className='m4-steps';steps.setAttribute('aria-label','整套诊断四步');
 ['确认资料','查看费用并授权','开始分析','查看报告'].forEach((text,i)=>{const li=node('li',(i+1)+' · '+text);li.dataset.state=i+1<step?'complete':i+1===step?'current':'next';if(i+1===step)li.setAttribute('aria-current','step');steps.append(li);});root.append(steps);
 const progress=node('p');progress.className='m4-progress-note';progress.setAttribute('role','status');
 progress.textContent=done?'分析已完成，结果已发布。下一步查看报告05；是否采纳结论由你决定。':blocked?'本次执行已有留存，请核对状态。不会重复调用或自动重试。':authorized?'费用授权已保存，尚未开始分析。下一步点击“开始一次分析”。':p.humanConfirmed?'资料已确认并保存。下一步查看本次费用，再单独授权。':d.saved?'资料草稿已保存。核对下方七个问题后，勾选并确认资料。':'第一步：核对六图和七个问题，然后保存资料草稿。';root.append(progress);
 const material=node('details');material.className='m4-materials';material.open=step===1;material.append(node('summary',p.humanConfirmed?'已确认的资料：六图、七问题、事实未知':'核对六图与七个问题'));
 const list=node('ul');list.className='m4-image-list';for(const x of p.images)list.append(node('li',x.sampleId+' · 本品第'+x.sequence+'张'));material.append(list);
 const inputs=[],guarded=[];let dirty=false,busy=false;
 const main=node('div');main.className='m4-next-action';const save=node('button','保存资料草稿');save.type='button';save.className='m4-primary';save.disabled=!d.canSave;save.hidden=Boolean(d.saved)||!d.canSave;
 for(const q of p.questions){const label=node('label','核对主题 '+(inputs.length+1)),field=node('textarea');field.value=q.question;field.maxLength=299;field.disabled=!d.canSave||blocked||done;field.setAttribute('aria-label','整套问题 '+q.id);field.addEventListener('input',()=>{dirty=true;for(const a of guarded)a.disabled=true;for(const a of main.querySelectorAll('.m4-primary'))a.hidden=true;save.hidden=false;save.textContent='保存修改后的资料';progress.textContent='资料有未保存修改。请先保存；保存后需要重新确认，旧费用授权会失效。';});label.append(field);material.append(label);inputs.push({id:q.id,field});}
 material.append(node('p','产品事实保持未知。图片展示或宣传不等于已验证性能，诊断只评价图片如何回答买家问题。'));root.append(material);
 const status=node('p');status.setAttribute('role','status');const base=()=>({taskId:c.task.id,expectedRevision:d.expectedRevision,expectedStateVersion:d.expectedStateVersion});
 async function action(button,route,extra){if(busy)return;busy=true;const turn=ticket;for(const control of root.querySelectorAll('input,textarea,button'))control.disabled=true;
  const selector=document.getElementById('module4-task-select'),refresh=document.getElementById('module4-refresh');const was=[selector?.disabled,refresh?.disabled];if(selector)selector.disabled=true;if(refresh)refresh.disabled=true;
  root.setAttribute('aria-busy','true');progress.textContent=route==='set-execute'?'分析进行中，请等待。页面已锁定，不要重复提交。':'正在保存或读取，请稍候……';
  try{const out=await request(c,route,extra===null?undefined:{...base(),...extra});if(turn!==ticket)return;render(c,out);if(route==='set-execute')global.dispatchEvent(new CustomEvent('amzwn:module4-context',{detail:c}));}
  catch(e){if(turn===ticket){progress.textContent=route==='set-execute'?'执行结果尚未确认。请只重新读取状态；不要重新发起分析。':'操作未确认，请重新读取状态后核对。';status.textContent=e.message+'；不会自动重试。';reload.disabled=false;reload.className='m4-primary';for(const a of main.querySelectorAll('.m4-primary')){a.classList.remove('m4-primary');a.hidden=true;}}}
  finally{if(turn===ticket)root.removeAttribute('aria-busy');if(selector)selector.disabled=was[0];if(refresh)refresh.disabled=was[1];busy=false;}
 }
 save.addEventListener('click',()=>action(save,'set-preparation',{questions:inputs.map(x=>({id:x.id,question:x.field.value.trim()})),facts:p.facts}));main.append(save);
 function confirmation(label,buttonText,allowed,route,extra){const wrap=node('label');wrap.className='m4-confirmation';const box=node('input');box.type='checkbox';box.setAttribute('aria-label',label);box.disabled=!allowed;const button=node('button',buttonText);button.type='button';button.className='m4-primary';button.disabled=true;guarded.push(box,button);box.addEventListener('change',()=>{button.disabled=dirty||!allowed||!box.checked;});button.addEventListener('click',()=>{if(!dirty&&box.checked)action(button,route,{acknowledgement:true,...extra});});wrap.append(box,node('span',label));main.append(wrap,button);}
 if(d.saved&&!p.humanConfirmed&&!blocked&&!done)confirmation('我已核对这七个问题，并确认目前产品事实仍未知','确认资料，进入费用步骤',d.canConfirm,'set-confirm',{preparationDigest:p.digest});
 if(p.humanConfirmed&&d.status==='待费用授权'&&!d.quote&&!blocked){const quote=node('button','查看本次费用');quote.type='button';quote.className='m4-primary';guarded.push(quote);quote.addEventListener('click',()=>{if(!dirty)action(quote,'set-quote',null);});main.append(quote);}
 if(d.quote&&!blocked&&!done){const q=d.quote;const cost=node('section');cost.className='m4-cost';cost.append(node('h3',q.simulation?'模拟报价（不调用真实模型）':'本次费用估算 ¥'+q.budgetEstimateCny.toFixed(2)),node('p','本品六图，一次请求；最多1次，不自动重试。'),node('p',q.simulation?'本地预算演练，真实费用为0。':'这是费用估算，不是供应商硬金额上限；最终以实际账单为准。'));
  const details=node('details');details.append(node('summary','模型参数与请求绑定'),node('p','模型 '+q.model+'；输入估算上界 '+q.maxInputTokens+' Token；输出上限 '+q.maxOutputTokens+' Token。'),node('p','请求：'+d.requestSha256),node('p','报价：'+d.quoteSha256),node('p','价格依据：'+q.source));cost.append(details);root.append(cost);
  const text=q.simulation?'我明确授权本次六图模拟执行，不调用真实模型':'我明确授权以上请求与估算费用，最多调用一次，不自动重试';
  confirmation(text,'保存费用授权，进入分析步骤',d.canAuthorize,'set-authorize',{requestSha256:d.requestSha256,quoteSha256:d.quoteSha256,approvalText:text+'；ASIN '+c.task.asin+'；请求 '+d.requestSha256+'；估算 ¥'+q.budgetEstimateCny+'；不是硬金额上限。'});
 }
 if(authorized&&!blocked&&!done){const run=node('button',d.simulation?'开始一次模拟分析':'开始一次分析');run.type='button';run.className='m4-primary';run.disabled=!d.executionEnabled;guarded.push(run);run.addEventListener('click',()=>{if(!dirty)action(run,'set-execute',{authorizationId:d.authorizationId});});main.append(run);}
 if(done){const link=node('a','查看报告05 · 图片与卖点诊断');link.className='m4-primary';link.href='../report/?task='+encodeURIComponent(c.task.id)+'&module=05#report05';main.append(link);}
 root.append(main);const reload=node('button',blocked?'核对本次执行状态':'重新读取状态');reload.type='button';reload.className=blocked?'m4-primary':'m4-secondary';reload.addEventListener('click',()=>show(c,true));root.append(reload,status);
 if(!d.executionEnabled&&!done)root.append(node('p','真实执行入口尚未开放，可以先核对资料。'));
 if(receipt)root.append(node('p','本次执行状态：'+({reserved:'已预留',in_flight:'调用中',published:'结果已发布',failed:'失败',unclear:'状态不明确'}[receipt.outcome]||'待核对')+'。'+(receipt.chargeUnknown?'计费状态不明确，须核对留存记录。':'')));
}
async function show(c,force=false){if(!force&&c?.userId===current?.userId&&c?.task?.id===current?.task?.id)return;clear();if(!c?.userId||!c?.task?.id)return;current=c;const turn=ticket;try{const d=await request(c);if(turn===ticket)render(c,d);}catch(e){if(turn!==ticket)return;if((await global.AMZWN.currentSession())?.user?.id!==c.userId){if(turn===ticket)clear();return;}if(turn!==ticket)return;current=null;root.hidden=false;root.append(node('p','整套诊断：'+e.message));}}
global.addEventListener('amzwn:module4-context',e=>show(e.detail));global.addEventListener('amzwn:explicit-logout',clear);global.addEventListener('amzwn:session-changed',e=>{if(!e.detail.session||e.detail.session.user.id!==current?.userId)clear();});global.AMZWN?.client?.auth?.onAuthStateChange((_,s)=>{if(!s||s.user.id!==current?.userId)clear();});
})(window);
