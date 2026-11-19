import { mountAdsWorkbench } from '../ads-auth/workbench.mjs';

// The private report and its sandbox remain unchanged. Only its live viewer is extended.
const css = `
#module-toggle-ads:checked~.report-layout .module-panel[data-module="ads"]{display:block}
.module-menu button[data-ads-menu]{font:inherit;text-align:left;background:transparent}
#module-toggle-ads:checked~.report-layout button[data-ads-menu]{background:#fff4eb;border-color:#f26b21;color:#8b3c0b;box-shadow:0 8px 24px #f26b2117}
#module-toggle-ads:checked~.report-layout button[data-ads-menu] .module-number{background:#f26b21;color:#fff}
.module-menu button[data-ads-menu]:focus-visible{outline:2px solid #f26b21;outline-offset:2px}
#ads-workbench{--ink:#344054;--muted:#667085;--canvas:#fff;--surface:#f9fafb;--hairline:#d0d5dd;--teal:#f26b21;--radius-md:12px;max-width:none;margin:0;padding:0;gap:16px;font-size:14px}
#ads-workbench h1{font-size:22px}#ads-workbench h2{font-size:17px}
#ads-workbench .ads-panel{padding:18px;box-shadow:none}
#ads-workbench .ads-link{box-sizing:border-box}
#ads-workbench table th,#ads-workbench table td{width:auto!important}
#ads-workbench .ads-number{text-align:right!important}
@media(max-width:700px){#ads-workbench .ads-panel{padding:12px}#ads-workbench h1{font-size:20px}}
`;

export function installAdsWorkbenchIntegration({ app=window.AMZWN, stage=document.querySelector('#report-stage') }={}) {
  if(!app || !stage)return {destroy(){}};
  let active=null, generation=0, disposed=false, authOwner=null;
  const watched=new WeakSet();
  function clear(){generation++;active?.destroy();active=null;}

  async function mount(frame){
    const doc=frame.contentDocument;
    if(disposed || !frame.isConnected || active?.doc===doc || !doc?.querySelector('.report-layout'))return;
    const turn=++generation;
    let session;
    try{session=await app.currentSession();}catch{return;}
    if(disposed || turn!==generation || !frame.isConnected || frame.contentDocument!==doc || !session?.user?.id)return;
    const owner=session.user.id;
    if(authOwner && authOwner!==owner)return;
    authOwner=owner;
    const layout=doc.querySelector('.report-layout'),menu=layout.querySelector('.module-menu'),content=layout.querySelector('.module-content');
    if(!menu || !content || doc.getElementById('module-toggle-ads'))return;
    active?.destroy();
    const radio=doc.createElement('input');radio.type='radio';radio.name='report-module';radio.id='module-toggle-ads';radio.className='module-toggle';
    layout.before(radio);
    const button=doc.createElement('button');button.type='button';button.className='module-menu-item is-ready';button.dataset.adsMenu='';button.setAttribute('aria-controls','ads-workbench-panel');button.setAttribute('aria-pressed','false');
    button.innerHTML='<span class="module-number">授权</span><span class="module-name">店铺授权</span><small>美国站 · Ads</small>';
    menu.append(button);
    const panel=doc.createElement('section');panel.id='ads-workbench-panel';panel.className='module-panel';panel.dataset.module='ads';panel.setAttribute('aria-label','店铺授权');
    const root=doc.createElement('div');root.id='ads-workbench';panel.append(root);content.append(panel);
    const link=doc.createElement('link');link.rel='stylesheet';link.href=new URL('../ads-auth/ads-auth.css',import.meta.url).href;doc.head.append(link);
    const style=doc.createElement('style');style.dataset.adsIntegration='';style.textContent=css;doc.head.append(style);
    const viewerStyle=stage.ownerDocument.createElement('style');viewerStyle.textContent='.amzwn-ads-open .report-follow-scroll{display:none!important}';stage.ownerDocument.head.append(viewerStyle);
    let component=null, removed=false;
    function selected(){
      button.setAttribute('aria-pressed',String(radio.checked));
      stage.ownerDocument.documentElement.classList.toggle('amzwn-ads-open',radio.checked);
      if(!radio.checked || component || removed)return;
      component=mountAdsWorkbench(root,{
        apiOrigin:'https://api.amzwn.com',
        getSession:async()=>{
          const next=await app.currentSession();
          return !removed && next?.user?.id===owner ? next : null;
        }
      });
    }
    const change=()=>selected();
    const open=()=>{radio.checked=true;selected();radio.dispatchEvent(new Event('change',{bubbles:true}));};
    button.addEventListener('click',open);layout.parentElement.addEventListener('change',change);
    active={doc,frame,owner,destroy(){
      if(removed)return;removed=true;component?.destroy();
      button.removeEventListener('click',open);layout.parentElement?.removeEventListener('change',change);
      if(radio.checked){const first=doc.getElementById('module-toggle-01');if(first)first.checked=true;}
      stage.ownerDocument.documentElement.classList.remove('amzwn-ads-open');
      for(const node of [radio,button,panel,link,style,viewerStyle])node.remove();
    }};
  }

  function scan(){
    if(disposed)return;
    const frame=stage.querySelector('iframe.report-frame');
    if(active && (active.frame!==frame || active.doc!==frame?.contentDocument))clear();
    if(!frame)return;
    if(!watched.has(frame)){
      watched.add(frame);frame.addEventListener('load',()=>{void mount(frame);},{once:true});
    }
    void mount(frame);
  }
  function accountChanged(session){
    const next=session?.user?.id??null;
    if((active && active.owner!==next) || (authOwner && authOwner!==next))clear();
    authOwner=next;
  }
  const observer=new MutationObserver(scan);observer.observe(stage,{childList:true});
  const logout=()=>accountChanged(null),changed=e=>accountChanged(e.detail?.session);
  window.addEventListener('amzwn:explicit-logout',logout);window.addEventListener('amzwn:session-changed',changed);
  const subscription=app.client.auth?.onAuthStateChange((_,session)=>accountChanged(session))?.data?.subscription;
  scan();
  return {destroy(){disposed=true;clear();observer.disconnect();subscription?.unsubscribe();window.removeEventListener('amzwn:explicit-logout',logout);window.removeEventListener('amzwn:session-changed',changed);}};
}

if(typeof window!=='undefined' && document.querySelector('#report-stage'))installAdsWorkbenchIntegration();
