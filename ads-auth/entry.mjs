import { mountAdsWorkbench } from './workbench.mjs';
mountAdsWorkbench(document.getElementById('ads-workbench'),{
  apiOrigin:'https://api.amzwn.com',
  getSession:()=>window.AMZWN?.currentSession?.()??Promise.resolve(null)
});
