
(function(){
 'use strict';
 const drawer=document.getElementById('imamstoreMenuDrawer');
 const trigger=document.getElementById('imamstoreMenuOpen');
 if(!drawer||!trigger)return;
 const pane=drawer.querySelector('.ism-panel'),scrim=drawer.querySelector('.ism-scrim');
 const closeButton=document.getElementById('imamstoreMenuClose');
 const track=document.getElementById('imamstoreTracking'),account=document.getElementById('imamstoreAccountStatus');
 const reduced=window.matchMedia('(prefers-reduced-motion: reduce)');
 let state='closed',restoreOverflow='',lastFocus=null,trackFocus=null;
 let exitTimer=0,focusTimer=0,gesture=null,dragFrame=0,ignoreClickUntil=0;
 let onClosed=[];
 const isOpen=()=>state==='open';
 function lockScroll(){restoreOverflow=document.body.style.overflow;document.body.style.overflow='hidden'}
 function unlockScroll(){document.body.style.overflow=restoreOverflow}
 function stopTimers(){clearTimeout(exitTimer);clearTimeout(focusTimer);exitTimer=focusTimer=0}
 function focusSafe(element){if(element?.isConnected)try{element.focus({preventScroll:true})}catch{element.focus()}}
 function flushCallbacks(){const callbacks=onClosed.splice(0);for(const fn of callbacks)try{fn()}catch(error){console.error('[ImamStore menu]',error)}}
 function stopDrag(){
  if(dragFrame){cancelAnimationFrame(dragFrame);dragFrame=0}
  gesture=null;drawer.classList.remove('ism-dragging');
  pane.style.removeProperty('transform');scrim.style.removeProperty('opacity');
 }
 function finishClose(){
  if(state!=='closing')return;
  stopTimers();state='closed';drawer.classList.remove('ism-active','ism-closing');
  drawer.inert=true;drawer.setAttribute('aria-hidden','true');
  if(track.hidden){unlockScroll();focusSafe(lastFocus||trigger)}
  flushCallbacks();
 }
 function show(){
  if(state==='open')return;
  const wasClosed=state==='closed';
  stopTimers();stopDrag();
  if(wasClosed){lastFocus=document.activeElement;lockScroll()}
  onClosed.length=0;
  // Keep the drawer mounted offscreen at all times. Avoid display:none -> layout -> double rAF.
  drawer.inert=false;drawer.removeAttribute('aria-hidden');
  drawer.classList.remove('ism-closing');drawer.classList.add('ism-active','ism-open');
  state='open';trigger.setAttribute('aria-expanded','true');
  // Focusing at animation end avoids forcing mobile Chrome to relayout mid-transition.
  if(reduced.matches)focusSafe(closeButton);
  else focusTimer=setTimeout(()=>{if(isOpen())focusSafe(closeButton)},400);
 }
 function close(afterClose){
  if(typeof afterClose==='function')onClosed.push(afterClose);
  if(state==='closed'){flushCallbacks();return}
  if(state==='closing')return;
  stopTimers();stopDrag();
  state='closing';drawer.classList.add('ism-closing');drawer.classList.remove('ism-open');
  trigger.setAttribute('aria-expanded','false');
  if(reduced.matches){finishClose();return}
  // transitionend is the primary signal; timeout handles background tabs / cancelled motion.
  exitTimer=setTimeout(finishClose,390);
 }
 pane.addEventListener('transitionend',event=>{
  if(event.target===pane&&event.propertyName==='transform'&&state==='closing')finishClose();
 });
 function loginUser(){const u=window.firebase?.auth?.()?.currentUser;return u&&!u.isAnonymous?u:null}
 function syncAccount(){
  const u=loginUser(),inButton=document.getElementById('imamstoreMenuLogin'),outButton=document.getElementById('imamstoreMenuLogout');
  if(!u){account.textContent='Belanja tanpa login. Masuk hanya untuk membuat pesanan dan melihat riwayat akun.';inButton.hidden=false;outButton.hidden=true}
  else{account.textContent='Masuk sebagai '+(u.email||u.displayName||'Pelanggan ImamStore');inButton.hidden=true;outButton.hidden=false}
 }
 // Initially remove HTML's hidden flag once, keeping the closed panel offscreen and inert.
 drawer.inert=true;drawer.setAttribute('aria-hidden','true');drawer.hidden=false;
 trigger.setAttribute('aria-expanded','false');
 trigger.addEventListener('click',show);
 closeButton.addEventListener('click',()=>close());
 scrim.addEventListener('click',()=>close());
 // One pointer engine for touch/pen/mouse. Paint at most once per animation frame.
 function renderDrag(){
  dragFrame=0;if(!gesture?.dragging)return;
  const dx=Math.min(gesture.width,Math.max(0,gesture.dx));
  pane.style.transform='translate3d('+dx+'px,0,0)';
  scrim.style.opacity=String(Math.max(0,1-dx/gesture.width));
 }
 pane.addEventListener('pointerdown',event=>{
  if(!isOpen()||!event.isPrimary||(event.pointerType==='mouse'&&event.button!==0))return;
  gesture={id:event.pointerId,x:event.clientX,y:event.clientY,at:performance.now(),dx:0,width:pane.getBoundingClientRect().width+44,dragging:false};
 },{passive:true});
 pane.addEventListener('pointermove',event=>{
  const g=gesture;if(!g||event.pointerId!==g.id||!isOpen())return;
  const dx=event.clientX-g.x,dy=event.clientY-g.y;
  if(!g.dragging){
   if(Math.abs(dy)>12&&Math.abs(dy)>Math.abs(dx)){gesture=null;return}
   if(dx<12||dx<Math.abs(dy)*1.25)return;
   g.dragging=true;drawer.classList.add('ism-dragging');
   try{pane.setPointerCapture(g.id)}catch{}
  }
  g.dx=Math.max(0,dx);
  if(!dragFrame)dragFrame=requestAnimationFrame(renderDrag);
 },{passive:true});
 function settleDrag(event,cancelled=false){
  const g=gesture;if(!g||event.pointerId!==g.id)return;
  if(!g.dragging){gesture=null;return}
  ignoreClickUntil=performance.now()+320;
  if(dragFrame){cancelAnimationFrame(dragFrame);dragFrame=0}
  renderDrag();
  const elapsed=Math.max(1,performance.now()-g.at);
  const shouldClose=!cancelled&&(g.dx>=Math.min(88,g.width*.25)||(g.dx>36&&g.dx/elapsed>.45));
  // Keep the last dragged position painted before switching back to CSS transitions.
  requestAnimationFrame(()=>{
   if(gesture!==g)return;
   drawer.classList.remove('ism-dragging');
   pane.style.removeProperty('transform');scrim.style.removeProperty('opacity');
   gesture=null;
   if(shouldClose)close();
  });
 }
 pane.addEventListener('pointerup',event=>settleDrag(event),{passive:true});
 pane.addEventListener('pointercancel',event=>settleDrag(event,true),{passive:true});
 pane.addEventListener('click',event=>{
  if(performance.now()<ignoreClickUntil){event.preventDefault();event.stopImmediatePropagation()}
 },true);
 function navigateTab(tab){
  window.nineVisitStore?.();
  if(tab==='produk'&&typeof window.imamstoreShowAllStoreProducts==='function')window.imamstoreShowAllStoreProducts();
  else{document.querySelector('.tabs [data-tab="'+tab+'"]')?.click();window.storeResetVerticalHeader?.();document.getElementById('panel-'+tab)?.scrollTo({top:0,behavior:'instant'});window.imamstoreRefreshScrollTop?.()}
 }
 drawer.querySelectorAll('[data-ism-action]').forEach(btn=>btn.addEventListener('click',async()=>{
  const action=btn.dataset.ismAction;
  if(['toko','produk','kategori','favorit'].includes(action)){close(()=>navigateTab(action));return}
  // Actions that need user activation (window.open, auth) start during the click.
  close();
  if(action==='keranjang'){window.imamstoreCartBridge?.openCart?.();return}
  if(action==='pesanan'){window.nexaiOpenOrders?.();return}
  if(action==='login'){await window.nexaiRequireCustomerLogin?.();syncAccount();return}
  if(action==='logout'){
   const a=window.firebase?.auth?.();if(!loginUser())return;
   try{await a.signOut();syncAccount();window.imamstoreToast?.('Anda berhasil keluar dari akun','success')}catch(e){console.warn('Logout ImamStore gagal',String(e?.code||'unknown'));alert('Belum berhasil keluar. Silakan coba lagi.')}
   return;
  }
  if(action==='lacak'){
   trackFocus=trigger;track.hidden=false;document.body.style.overflow='hidden';
   focusSafe(document.getElementById('imamstoreTrackingCarrier'));return;
  }
  if(action==='chat'){window.open('https://wa.me/6282210109369','_blank','noopener,noreferrer');return}
  if(action==='website'){location.href='https://imamsales.com/'}
 }));
 function closeTrack(){
  if(track.hidden)return;track.hidden=true;
  if(state==='closed')unlockScroll();
  focusSafe(trackFocus);
 }
 document.getElementById('imamstoreTrackingClose').addEventListener('click',closeTrack);
 track.addEventListener('click',event=>{if(event.target===track)closeTrack()});
 document.addEventListener('keydown',event=>{
  if(event.key==='Escape'){
   if(!track.hidden){event.preventDefault();closeTrack()}
   else if(state!=='closed'){event.preventDefault();close()}
   return;
  }
  if(event.key==='Tab'&&isOpen()&&track.hidden){
   const focusable=Array.from(pane.querySelectorAll('button:not([hidden]):not([disabled]),a[href],input:not([disabled]),select:not([disabled])')).filter(el=>el.getClientRects().length);
   if(!focusable.length)return;
   const first=focusable[0],last=focusable[focusable.length-1];
   if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus()}
   else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus()}
  }
 },true);
 document.getElementById('imamstoreTrackingForm').addEventListener('submit',async event=>{
  event.preventDefault();const resi=document.getElementById('imamstoreTrackingResi').value.trim(),carrier=document.getElementById('imamstoreTrackingCarrier').value;
  const sites={jne:'https://www.jne.co.id/tracking-package',jnt:'https://www.jet.co.id/track',sicepat:'https://www.sicepat.com/',pos:'https://www.posindonesia.co.id/id/tracking'};
  const url=sites[carrier];if(!url||!resi)return;
  const status=document.getElementById('imamstoreTrackingMessage');
  const copying=navigator.clipboard?.writeText?.(resi);
  window.open(url,'_blank','noopener,noreferrer');
  try{if(!copying)throw Error('clipboard-unavailable');await copying;status.textContent='Nomor resi disalin. Tempel di halaman pelacakan ekspedisi.'}catch{status.textContent='Salin nomor resi secara manual, lalu tempel di halaman ekspedisi.'}
 });
 const a=window.firebase?.auth?.();a?.onAuthStateChanged?.(syncAccount);window.addEventListener('imamstore:customer-auth',syncAccount);syncAccount();
})();
