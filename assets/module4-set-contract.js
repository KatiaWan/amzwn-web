(function(root){'use strict';
function create(config){
 const check=(v,c)=>{if(!v)throw Object.assign(Error(c),{code:c});},exact=(x,k)=>x&&typeof x==='object'&&!Array.isArray(x)&&Object.keys(x).sort().join('|')===k.sort().join('|'),text=(x,max=1500)=>typeof x==='string'&&x.trim().length>0&&x.length<=max;
 function ids(scope){check(['own','S07','S08'].includes(scope),'ANALYSIS_SCOPE');return scope==='own'?['S01','S02','S03','S04','S05','S06']:[scope];}
 function parse(raw,scope){
  check(typeof raw==='string'&&raw.length<=200000,'ANALYSIS_SIZE');let x;try{x=JSON.parse(raw);}catch{check(false,'ANALYSIS_JSON');}
  const allowed=ids(scope);check(exact(x,['kind','sampleIds','summary','topics','imageRoles','limitations'])&&x.kind===(scope==='own'?'OWN_SET':'COMPETITOR_SAMPLE')&&JSON.stringify(x.sampleIds)===JSON.stringify(allowed)&&text(x.summary)&&Array.isArray(x.limitations)&&x.limitations.length<=8&&x.limitations.every(t=>text(t,500)),'ANALYSIS_SHAPE');
  function evidence(list,required){check(Array.isArray(list)&&list.length<=12&&(!required||list.length>0),'EVIDENCE_REQUIRED');const seen=new Set();for(const e of list){check(exact(e,['sampleId','location','observation'])&&allowed.includes(e.sampleId)&&text(e.location,200)&&text(e.observation,500),'EVIDENCE_SCOPE_OR_CONTENT');const key=e.sampleId+'|'+e.location;check(!seen.has(key),'DUPLICATE_EVIDENCE');seen.add(key);}}
  check(Array.isArray(x.topics)&&x.topics.length===(scope==='own'?config.questions.length:0),'TOPIC_COUNT');x.topics.forEach((r,i)=>{check(exact(r,['id','necessity','coverage','reason','evidence','inspectedSampleIds'])&&r.id===config.questions[i].id&&['necessary','optional','unknown'].includes(r.necessity)&&['answered','partial','missing','unknown','not_applicable'].includes(r.coverage)&&text(r.reason)&&Array.isArray(r.inspectedSampleIds)&&new Set(r.inspectedSampleIds).size===r.inspectedSampleIds.length&&r.inspectedSampleIds.every(s=>allowed.includes(s)),'TOPIC_SHAPE');evidence(r.evidence,['answered','partial'].includes(r.coverage));check(r.evidence.every(e=>r.inspectedSampleIds.includes(e.sampleId)),'EVIDENCE_NOT_INSPECTED');if(r.coverage==='missing')check(JSON.stringify([...r.inspectedSampleIds].sort())===JSON.stringify(allowed),'MISSING_REQUIRES_WHOLE_SET');});
  check(Array.isArray(x.imageRoles)&&x.imageRoles.length===allowed.length,'IMAGE_ROLE_COUNT');x.imageRoles.forEach((r,i)=>{check(exact(r,['sampleId','task','assessment','basis','reason','recommendations'])&&r.sampleId===allowed[i]&&['unknown','main_overview','length','installation','lighting','control','music','other'].includes(r.task)&&['unknown','ok','concern','not_applicable'].includes(r.assessment)&&text(r.reason)&&Array.isArray(r.recommendations)&&r.recommendations.length<=4,'IMAGE_ROLE_SHAPE');evidence(r.basis,r.task!=='unknown');check(r.basis.every(e=>e.sampleId===r.sampleId),'IMAGE_ROLE_FOREIGN_EVIDENCE');if(r.task==='unknown')check(r.assessment==='unknown'&&r.recommendations.length===0,'UNKNOWN_TASK_NOT_A_DEFECT');r.recommendations.forEach(a=>{check(exact(a,['text','evidence'])&&text(a.text,500),'RECOMMENDATION');evidence(a.evidence,true);check(a.evidence.every(e=>e.sampleId===r.sampleId),'RECOMMENDATION_FOREIGN_IMAGE');});});
  return x;
 }
 function prompt(scope){const allowed=ids(scope);return [
 '你审查当前提供的灯带产品图片。不要假设用户购物意向。只根据可见图像，不从背景规格或商品文字推断图片事实。',
 scope==='own'?'本品S01—S06为一整套。必要信息可由一张或多张共同回答。仅整套仍缺必要证据才提出缺口；音乐图之外没音乐是正常分工，不能逐图按全部卖点扣分。':'这是单家竞品的单张样本，不得推断它整套缺失，不得补本品证据。topics必须为空，只评价此样本实际任务。',
 '主图登记位置与实际表达任务分开；无依据任务unknown、assessment unknown、不提基于假定任务的建议。未知、不适用、未覆盖区分。necessity不明确填unknown。',
 '产品信息主题仅本灯带样例适用，其他产品需另设主题：'+JSON.stringify(scope==='own'?config.questions:[]),
 '允许证据样本：'+JSON.stringify(allowed)+'。每条证据必须定位sampleId/location/observation；禁止引用其他样本。整套missing须明确检查所有本品图并说明理由。',
 '只输出JSON，结构：{kind:"OWN_SET|COMPETITOR_SAMPLE",sampleIds:[],summary:"",topics:[{id:"主题ID",necessity:"necessary|optional|unknown",coverage:"answered|partial|missing|unknown|not_applicable",reason:"",evidence:[{sampleId:"",location:"",observation:""}],inspectedSampleIds:[]}],imageRoles:[{sampleId:"",task:"unknown|main_overview|length|installation|lighting|control|music|other",assessment:"unknown|ok|concern|not_applicable",basis:[同证据],reason:"",recommendations:[{text:"",evidence:[同证据]}]}],limitations:[]}',
 '主题顺序与输入一致，单图角色逐张对应。不输出总分或业务通过，不把图片宣传视为真实性能验证。answered/partial需非空证据；具体任务basis必填，建议证据只来自该图。' ].join('\n');}
 return {ids,parse,prompt};
}
root.M4SetContract={create};if(typeof module!=='undefined')module.exports=root.M4SetContract;
})(globalThis);
