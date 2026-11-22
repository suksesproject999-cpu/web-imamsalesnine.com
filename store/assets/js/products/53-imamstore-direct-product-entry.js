
/* One direct-link controller: reuse the existing renderer; never block on a product image. */
(()=>{'use strict';
 const root=document.documentElement;
 if(!root.classList.contains('imamstore-deeplink-boot'))return;
 const gate=document.getElementById('imamstoreDeepLinkGate');
 const target=new URL(location.href).searchParams.get('product');
 if(!gate||!target)return;
 let finished=false,opened=false,seedTimer=0,limit=0;
 const clear=()=>{
  clearTimeout(seedTimer);clearTimeout(limit);
  document.removeEventListener('imamstore:catalog-updated',onCatalog);
  window.removeEventListener('popstate',onPopState);
  root.classList.remove('imamstore-deeplink-boot');gate.remove();
 };
 const showError=()=>{if(finished)return;gate.classList.add('dl-failed')};
 const reveal=()=>{
  if(finished)return;
  finished=true;
  gate.classList.add('dl-revealing');
  const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  setTimeout(clear,reduced?0:205);
 };
 function open(){
  if(finished||opened||new URL(location.href).searchParams.get('product')!==target)return;
  opened=true;clearTimeout(seedTimer);
  // The existing detail renderer opens synchronously; use one frame for paint.
  try{
   document.dispatchEvent(new CustomEvent('imamstore:open-product',{detail:{id:target,fromDeepLink:true}}));
  }catch(error){
   console.error('[ImamStore deeplink] Unable to open product:',error);
   opened=false;showError();return;
  }
  requestAnimationFrame(()=>{
   if(finished)return;
   const detail=document.getElementById('imamstoreLiveOriginalDetail');
   if(!detail?.classList.contains('open')||!detail.querySelector('.product-detail')){
    opened=false;showError();return;
   }
   detail.scrollTop=0;
   const shell=detail.querySelector('.nine-detail-shell');if(shell)shell.scrollTop=0;
   // Only the image request is prioritized; it must never keep the entire page hidden.
   const img=detail.querySelector('#mainProductImage');
   if(img){img.loading='eager';img.decoding='async';try{img.fetchPriority='high'}catch(_){}}
   if(new URL(location.href).searchParams.get('product')===target)reveal();
   else{finished=true;clear()}
  });
 }
 function onCatalog(){
  if(finished||opened)return;
  const state=window.imamstoreDeepLinkCatalogState;
  if(!state)return;
  const found=state.ids?.includes(target);
  if(state.phase==='cms'){
   if(found)open();
   else if(!state.fromCache)showError();
  }else if(state.phase==='seed'){
   // Prefer the full Firestore catalog on direct entry; offline/slow CMS still falls back to seed.
   if(found){clearTimeout(seedTimer);seedTimer=setTimeout(open,2200)}
  }else if(state.phase==='cms-error'){
   if(found)open();else showError();
  }
 }
 function onPopState(){
  if(!finished&&new URL(location.href).searchParams.get('product')!==target){
   finished=true;clear();
  }
 }
 document.addEventListener('imamstore:catalog-updated',onCatalog);
 window.addEventListener('popstate',onPopState);
 onCatalog();
 // If network/catalog initialization stalls, reveal useful retry controls.
 limit=setTimeout(()=>{if(!finished)showError()},10000);
 document.getElementById('imamstoreDeepLinkRetry')?.addEventListener('click',()=>location.reload());
 document.getElementById('imamstoreDeepLinkHome')?.addEventListener('click',()=>{
  const url=new URL(location.href);url.searchParams.delete('product');
  history.replaceState(history.state,'',url.pathname+url.search+url.hash);
  finished=true;clear();
 });
})();
