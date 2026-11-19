const messages={
  UNAUTHENTICATED:'请先登录工作台，再打开店铺广告接入。',IDENTITY_NETWORK_DISABLED:'接入服务尚未启用，请等待上线确认。',
  AMAZON_NETWORK_DISABLED:'真实授权尚未启用，请等待上线确认。',NOT_FOUND:'没有该店铺的访问权限。',
  CONFIRM_ACCOUNT_AND_UPDATES:'请核对账户归属，并确认启用自动更新。',DISCOVERY_UNAVAILABLE:'待确认账户已过期或发生变化，请重新授权。',
  NO_US_ADVERTISING_ACCOUNT:'当前授权没有返回可接入的美国广告账户，请核对店铺登录账号。',
  PROFILE_ALREADY_OWNED:'这个广告账户已绑定其他店铺，请先核对归属。',BINDING_CHANGE_REQUIRES_REVIEW:'当前店铺已有其他广告账户绑定，需要先核查变更。',
  PILOT_US_ONLY:'本次仅开放美国站接入。',START_RATE_LIMIT:'生成次数较多，请稍后再试。',
  PARTIAL_DATE_COVERAGE:'本次只返回部分日期的记录；未返回日期保留原值，不补零。',
  EMPTY_REPORT_REVIEW:'亚马逊返回空报表，已保留上次有效数据，等待核查。',
  REPORT_CREATE_UNCERTAIN:'报表创建结果未确认，已暂停重复创建，等待核查。',CREATE_INTERRUPTED:'报表创建中断，已暂停重复创建，等待核查。',
  REPORT_RATE_LIMITED:'亚马逊暂时限制请求频率，系统将按等待时间自动重试。',
  REPORT_RATE_LIMIT_REVIEW:'亚马逊要求的等待时间超出自动处理范围，更新已暂停，等待核查。',
  REAUTHORIZATION_REQUIRED:'授权已失效，请重新生成链接并完成授权。',CONSENT_EXPIRED:'授权已到期，请重新授权。',
  REPORT_ACCESS_DENIED:'广告数据访问被拒绝，请核对广告权限。',REPORT_GENERATION_FAILED:'亚马逊报表生成失败，已保留上次有效数据。',
  REPORT_DEADLINE:'报表长时间未完成，已保留上次有效数据。',REPORT_BINDING_UNAVAILABLE:'账户或操作人的权限已变化，更新已暂停。',
  REPORT_PROVIDER_UNAVAILABLE:'亚马逊服务暂时不可用，系统将自动重试。',COPY_FAILED:'浏览器未允许自动复制，请选中下方链接手动复制。'
};
const message=code=>messages[code]??'操作未完成，请稍后刷新状态；上次有效数据会保留。';
const dt=v=>v?new Intl.DateTimeFormat('zh-CN',{dateStyle:'short',timeStyle:'short',timeZone:'Asia/Shanghai'}).format(new Date(v)):'—';
const count=v=>v==null?'—':BigInt(v).toLocaleString('zh-CN');
const money=v=>v==null?'—':Number(v).toLocaleString('zh-CN',{minimumFractionDigits:2,maximumFractionDigits:2});
export function mountAdsWorkbench(root,{apiOrigin,getSession,transport=fetch,clipboard=globalThis.navigator?.clipboard,pollMs=10000,demo=false}){
  let storeId='',stores=[],requestId=null,authorizationUrl='',expiresAt=0,profiles=[],selected=null,busy=false,disposed=false,revision=0,timer;
  const origin=new URL(apiOrigin).origin;
  if(!(origin==='https://api.amzwn.com'||(demo&&/^http:\/\/127\.0\.0\.1:\d+$/.test(origin))))throw new Error('UNAPPROVED_API_ORIGIN');
  root.innerHTML=`<div class="ads-row"><h1>店铺广告接入</h1><span class="ads-subtle">美国站 · Sponsored Products</span></div>
    <p class="ads-banner" data-demo hidden>本地模拟：虚构账户和报表，链接不能用于真实店铺。</p>
    <div class="ads-row"><label>店铺 <select data-store aria-label="店铺"></select></label><button class="ads-button" data-refresh>刷新状态</button></div>
    <p data-status role="status" aria-live="polite">正在检查工作台登录状态…</p><p class="ads-error" data-error role="alert" hidden></p>
    <section class="ads-panel"><h2>1. 生成链接，到店铺紫鸟确认授权</h2><p>生成后复制到该店铺紫鸟的新标签页打开，在亚马逊页面核对 LanJiang Data Reports 并确认。</p>
    <button class="ads-button ads-primary" data-generate>生成授权链接</button><div data-link-panel hidden><label>本次授权链接<textarea class="ads-link" data-link readonly spellcheck="false" aria-label="本次授权链接"></textarea></label>
    <div class="ads-row"><button class="ads-button" data-copy>复制链接</button><span data-expiry></span></div></div></section>
    <section class="ads-panel" data-confirm-panel hidden><h2>2. 确认美国广告账户</h2><p>请核对名称、账户编号和美国站归属。尚未确认时，不会开始读取报表。</p><div data-profiles></div>
    <label class="ads-check"><input type="checkbox" data-ownership><span data-ownership-label>我已核对这个美国广告账户属于当前店铺。</span></label>
    <label class="ads-check"><input type="checkbox" data-auto><span>确认后启用每日自动更新，回刷近14个完整日期；广告销售额与订单采用7天归因。</span></label>
    <button class="ads-button ads-primary" data-confirm>确认美国站并启用自动更新</button></section>
    <section class="ads-panel"><div class="ads-row"><h2>广告数据</h2><span data-sync class="ads-subtle">尚未绑定美国广告账户</span></div>
    <p data-warning class="ads-error" hidden></p><p class="ads-subtle">USD · 站点当地日期 · 7天归因，近期销售额和订单可能回补。</p>
    <div class="ads-table-wrap"><table><thead><tr><th>日期</th><th class="ads-number">活动数</th><th class="ads-number">曝光</th><th class="ads-number">点击</th><th class="ads-number">花费 USD</th><th class="ads-number">广告销售额 USD</th><th class="ads-number">广告订单</th></tr></thead><tbody data-daily></tbody></table></div>
    <details><summary>数据状态</summary><div data-details></div></details><button class="ads-button" data-disable hidden>停用此店铺的 Ads 接入</button></section>`;
  const el=k=>root.querySelector(`[data-${k}]`),say=t=>{el('status').textContent=t;},error=e=>{el('error').hidden=!e;el('error').textContent=e?message(e.code??e.message):'';};
  el('demo').hidden=!demo;
  const controls=()=>{const canManage=stores.find(s=>s.id===storeId)?.can_manage;for(const key of ['generate','confirm','disable'])el(key).disabled=busy||!canManage;
    el('store').disabled=busy;el('copy').disabled=!authorizationUrl||Date.now()>=expiresAt;};
  const call=async(path,{method='GET',body}={})=>{
    const session=await getSession();if(!session?.access_token)throw Object.assign(new Error('UNAUTHENTICATED'),{code:'UNAUTHENTICATED'});
    const r=await transport(origin+path,{method,credentials:'omit',redirect:'error',cache:'no-store',signal:AbortSignal.timeout(15000),
      headers:{authorization:`Bearer ${session.access_token}`,...(body?{'content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
    const data=await r.json();if(!r.ok)throw Object.assign(new Error(data.error),{code:data.error});return data;
  };
  function clearLink(){authorizationUrl='';expiresAt=0;el('link').value='';el('link-panel').hidden=true;controls();}
  function renderProfiles(items){
    const signature=JSON.stringify(items.map(p=>[p.grant_id,p.profile_id,p.discovery_expires_at]));
    if(signature===el('profiles').dataset.signature)return;
    el('profiles').dataset.signature=signature;el('profiles').replaceChildren();selected=null;el('ownership').checked=false;el('auto').checked=false;
    for(const p of items){const label=document.createElement('label');label.className='ads-account';const radio=document.createElement('input');radio.type='radio';radio.name='ads-profile';radio.value=p.profile_id;
      radio.addEventListener('change',()=>{selected=p;el('ownership').checked=false;error(null);});const text=document.createElement('span');text.className='ads-id';
      text.textContent=`${p.account_name||'账户未提供名称'} · 美国 US · ${p.currency_code} · ${p.timezone} ｜账户 ${p.advertiser_id} ｜profile ${p.profile_id}`;
      label.append(radio,text);el('profiles').append(label);}
  }
  async function refresh(){
    if(!storeId||disposed)return;const at=revision,id=storeId;
    try{
      const [d,p]=await Promise.all([call(`/ads-auth/dashboard?storeId=${id}`),call(`/ads-auth/discoveries?storeId=${id}`).catch(e=>{if(stores.find(s=>s.id===id)?.can_manage)throw e;return {profiles:[]};})]);
      if(at!==revision||disposed)return;profiles=p.profiles;renderProfiles(profiles);el('confirm-panel').hidden=!profiles.length;
      const binding=d.bindings[0];el('sync').textContent=binding?`${binding.enabled&&binding.authorization_status==='active'?(d.workerEnabled?'已连接 · 每日自动更新':'已绑定 · 自动更新服务待启用'):'更新已暂停'} · 最近成功 ${dt(binding.last_success_at)}`:'尚未绑定美国广告账户';
      const warning=binding?.last_error||binding?.job_result_code||(binding?.job_status==='uncertain'?'REPORT_CREATE_UNCERTAIN':binding?.job_status==='failed'?'REPORT_GENERATION_FAILED':null);
      el('warning').hidden=!warning;el('warning').textContent=warning?message(warning):'';
      el('daily').replaceChildren();for(const row of d.daily){const tr=document.createElement('tr');
        for(const [i,v]of [row.date,count(row.campaigns),count(row.impressions),count(row.clicks),money(row.cost),money(row.sales_7d),count(row.purchases_7d)].entries()){
          const td=document.createElement('td');td.textContent=v;if(i)td.className='ads-number';tr.append(td);}el('daily').append(tr);}
      if(!d.daily.length){const tr=document.createElement('tr'),td=document.createElement('td');td.colSpan=7;td.textContent='暂无已验证的广告记录；空白不代表零花费或零销售。';tr.append(td);el('daily').append(tr);}
      el('details').textContent=binding?`美国 US / ${binding.currency_code} / ${binding.timezone} / profile ${binding.profile_id}。下一次计划：${dt(binding.next_sync_at)}。未返回的日期不补零。`:'确认账户后显示更新记录。';
      const authorizations=await call(`/ads-auth/authorizations?storeId=${id}`);if(at!==revision||disposed)return;
      const g=authorizations.authorizations.find(x=>x.region==='NA');el('disable').hidden=!g||g.status==='disabled';el('disable').dataset.grantId=g?.id??'';
      if(requestId){const r=await call(`/ads-auth/requests/${requestId}`);if(at!==revision||disposed)return;
        if(r.status==='succeeded'){clearLink();requestId=null;say(profiles.length?'已收到亚马逊授权，请在下方核对美国广告账户。':'账户状态已更新。');}
        else if(['failed','uncertain','cancelled','expired'].includes(r.status)){clearLink();requestId=null;say(r.status==='expired'?'授权链接已过期，请重新生成。':message(r.resultCode));}
      }
      controls();
    }catch(e){if(at===revision&&!disposed)error(e);}
  }
  const action=fn=>async()=>{if(busy)return;busy=true;controls();error(null);try{await fn();}catch(e){error(e);}finally{busy=false;controls();}};
  el('generate').addEventListener('click',action(async()=>{
    clearLink();requestId=null;const r=await call('/ads-auth/start',{method:'POST',body:{storeId,region:'NA',environmentConfirmed:true}});
    const u=new URL(r.authorizationUrl);if(u.origin!=='https://www.amazon.com'||u.pathname!=='/ap/oa')throw new Error('UNAPPROVED_CONSENT_URL');
    requestId=r.requestId;authorizationUrl=r.authorizationUrl;expiresAt=Date.now()+r.expiresIn*1000;el('link').value=authorizationUrl;el('link-panel').hidden=false;
    el('expiry').textContent=`有效至 ${dt(expiresAt)}；重新生成后旧链接失效。`;say('请复制链接，到当前店铺自己的紫鸟中打开。');
  }));
  el('copy').addEventListener('click',async()=>{if(Date.now()>=expiresAt){clearLink();say('链接已过期，请重新生成。');return;}try{await clipboard.writeText(authorizationUrl);say('已复制。请粘贴到该店铺紫鸟的新标签页地址栏。');}catch{el('link').focus();el('link').select();error({code:'COPY_FAILED'});}});
  el('confirm').addEventListener('click',action(async()=>{
    if(!selected||!el('ownership').checked||!el('auto').checked)throw Object.assign(new Error(),{code:'CONFIRM_ACCOUNT_AND_UPDATES'});
    await call('/ads-auth/confirm',{method:'POST',body:{storeId,grantId:selected.grant_id,profileId:selected.profile_id,ownershipConfirmed:true,automaticUpdatesConfirmed:true}});
    say('美国广告账户已确认，服务器将自动更新；工作台页面可以关闭。');await refresh();
  }));
  el('disable').addEventListener('click',action(async()=>{
    if(!globalThis.confirm('停用当前店铺的 Ads 接入并清除服务器保存的授权凭据？已保存报表保留。'))return;
    await call(`/ads-auth/authorizations/${el('disable').dataset.grantId}/disable`,{method:'POST',body:{storeId}});clearLink();await refresh();say('当前店铺 Ads 接入已停用。');
  }));
  el('refresh').addEventListener('click',()=>{error(null);refresh();});
  for(const key of ['ownership','auto'])el(key).addEventListener('change',()=>error(null));
  el('store').addEventListener('change',()=>{revision++;storeId=el('store').value;requestId=null;clearLink();profiles=[];selected=null;el('profiles').dataset.signature='';el('confirm-panel').hidden=true;error(null);refresh();});
  async function init(){try{stores=(await call('/ads-auth/stores')).stores;el('store').replaceChildren();for(const s of stores){const o=document.createElement('option');o.value=s.id;o.textContent=s.name;el('store').append(o);}
    storeId=stores[0]?.id??'';controls();say(storeId?'先生成链接，再到对应店铺的紫鸟完成授权。':'尚未登记可访问的试点店铺，请联系工作台管理员。');await refresh();
  }catch(e){error(e);say('暂时无法读取接入状态。');controls();}}
  init();timer=setInterval(()=>{if(authorizationUrl&&Date.now()>=expiresAt){clearLink();say('链接已过期，请重新生成。');}if(!busy)refresh();},pollMs);
  return {refresh,destroy(){disposed=true;clearInterval(timer);clearLink();root.replaceChildren();}};
}
