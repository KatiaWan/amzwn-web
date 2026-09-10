(function(global){'use strict';
const check=(v,m)=>{if(!v)throw Error(m);},hash=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',typeof value==='string'?new TextEncoder().encode(value):value))).map(n=>n.toString(16).padStart(2,'0')).join('');
const labels={answered:'已有回答',partial:'部分回答',missing:'未覆盖（待判断必要性）',unknown:'未知',not_applicable:'不适用'};
async function validate(bundle,asin,{allowSimulation=false}={}){
 const p=bundle.packet||bundle;check(p.format==='M4_SET_ANALYSIS_RETAINED_V1'&&(p.source==='LOCAL_RECORDS_UNVERIFIED'||(allowSimulation&&p.source==='SIMULATION'&&p.record?.actualModelCalls===0))&&p.record?.source===p.source&&p.record.scope==='own','仅支持本品整套留存结果；模拟包不可导入');
 check(typeof p.request==='string'&&p.request.length<2200000&&typeof p.rawResponse==='string'&&p.rawResponse.length<1100000,'结果大小不合要求');
 check(await hash(p.request)===p.record.requestSha256&&await hash(p.rawResponse)===p.record.responseSha256,'请求或响应校验失败');
 const request=JSON.parse(p.request),response=JSON.parse(p.rawResponse),parts=request.messages?.[0]?.content;
 check(request.messages?.length===1&&Array.isArray(parts)&&parts.length===13,'不是受支持的六图请求');
 check(request.model===p.record.model&&response.model===p.record.model&&response.id===p.record.responseId&&response.choices?.length===1&&response.choices[0].finish_reason==='stop'&&JSON.stringify(response.usage)===JSON.stringify(p.record.usage),'调用记录与响应不一致');
 const images=[];for(let i=0;i<6;i++){
  const meta=JSON.parse(parts[1+i*2].text),image=parts[2+i*2];
  check(meta.sampleId==='S0'+(i+1)&&meta.asin===asin&&image.type==='image_url'&&/^data:image\/jpeg;base64,/.test(image.image_url?.url),'结果不属于当前ASIN或图片映射错误');
  const bytes=Uint8Array.from(atob(image.image_url.url.slice(23)),c=>c.charCodeAt(0));check(await hash(bytes)===meta.imageFileSha256,'图片校验失败');images.push({id:meta.sampleId,url:image.image_url.url});
 }
 const prefix='产品信息主题仅本灯带样例适用，其他产品需另设主题：';const line=parts[0].text.split('\n').find(x=>x.startsWith(prefix));check(line,'未找到受支持的原始问题契约');const questions=JSON.parse(line.slice(prefix.length));check(Array.isArray(questions)&&questions.length===7&&new Set(questions.map(q=>q.id)).size===7&&questions.every(q=>typeof q.id==='string'&&/^[a-z][a-z0-9_]{0,63}$/.test(q.id)&&!['constructor','prototype','__proto__'].includes(q.id)&&typeof q.question==='string'&&q.question.length<300),'问题契约无效');
 const contract=global.M4SetContract.create({questions});check(parts[0].text===contract.prompt('own'),'提示契约不一致');const analysis=contract.parse(response.choices[0].message.content,'own');
 check(JSON.stringify(analysis)===JSON.stringify(p.analysis)&&JSON.stringify(p.record.sampleIds)===JSON.stringify(analysis.sampleIds),'解析结果不一致');check(p.source==='SIMULATION'||!/SIMULATION|SYNTHETIC_TEST_ONLY/.test(p.rawResponse),'模拟结果不能作为真实结果');
 let review=null;if(bundle.review){const r=bundle.review;check(r.responseSha256===p.record.responseSha256&&r.humanApproved===false&&Array.isArray(r.changes)&&r.changes.length<=7&&new Set(r.changes.map(c=>c.topic)).size===r.changes.length,'复核层绑定无效');
  for(const c of r.changes){check(questions.some(q=>q.id===c.topic)&&Object.keys(labels).includes(c.coverage)&&typeof c.reason==='string'&&c.reason.length<1500,'复核层内容无效');if(c.evidence)check(Array.isArray(c.evidence)&&c.evidence.every(e=>images.some(i=>i.id===e.sampleId)&&typeof e.location==='string'&&e.location.length<200&&typeof e.observation==='string'&&e.observation.length<500),'复核证据无效');}
  check(Array.isArray(r.actions)&&r.actions.length<=10&&r.actions.every(x=>typeof x==='string'&&x.length<1500),'建议无效');review=r;
 }
 return {packet:p,review,images,questions,packetSha256:await hash(JSON.stringify(p))};
}
global.M4SetPacket={validate};if(typeof module!=='undefined')module.exports=global.M4SetPacket;
})(globalThis);
