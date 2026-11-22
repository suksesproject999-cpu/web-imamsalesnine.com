(()=>{'use strict';
const $=id=>document.getElementById(id),dest=$('refCartRecommend');
if(!dest)return;
const more=$('refCartMoreProducts');
if(more)more.onclick=()=>{const cart=$('s5Cart');cart?.classList.remove('open');document.body.classList.remove('stage4-detail-open');document.querySelector('.tabs [data-tab="produk"]')?.click();document.querySelector('#product-grid-auto')?.scrollIntoView({behavior:'smooth',block:'start'});};
let signature='',painting=false;
function sourceCards(){return [...document.querySelectorAll('.product-card.marketplace-card[data-product-id]')].filter(el=>!dest.contains(el)&&!el.closest('#s5Cart,#s5Draft'))}
function refresh(){
 if(painting)return;
 const source=sourceCards();if(!source.length)return;
 const chosen=source.slice(0,4);
 const sig=chosen.map(c=>[c.dataset.productId,c.textContent?.slice(0,160),c.querySelector('img')?.getAttribute('src')].join(':')).join('|');
 if(sig===signature&&dest.children.length===chosen.length)return;
 painting=true;
 try{const frag=document.createDocumentFragment();for(const card of chosen){
   const clone=card.cloneNode(true);
   clone.querySelectorAll('[id]').forEach(el=>el.removeAttribute('id'));
   clone.removeAttribute('id');clone.dataset.unifiedCard='1';
   frag.append(clone);
  }
  dest.replaceChildren(frag);signature=sig;
 }finally{painting=false}
}
// The original homepage's card renderer and delegated product navigation remain authoritative.
// No alternate catalog, ratings, sold counts, view counts, or promo badges are fabricated.
const storeTitle=document.querySelector('.hero .identity h1');
function syncStoreIdentity(){const value=storeTitle?.textContent?.trim();if(!value)return;document.querySelectorAll('#imamstoreLiveOriginalDetail .nine-store-name-link').forEach(el=>{if(el.textContent!==value)el.textContent=value});}
if(storeTitle)new MutationObserver(syncStoreIdentity).observe(storeTitle,{childList:true,characterData:true,subtree:true});
// Keep API compatibility, but all status updates belong to the single controller.
const syncPresence=()=>window.imamstorePresenceSync?.();
window.imamstoreUnifiedCards=Object.freeze({refresh,syncPresence,syncStoreIdentity});
window.addEventListener('load',()=>{refresh();syncPresence();syncStoreIdentity()});
document.addEventListener('imamstore:open-product',()=>queueMicrotask(syncStoreIdentity));
document.addEventListener('click',e=>{if(e.target.closest('#refCartRecommend'))return;if(e.target.closest('[data-product-id],#s5Cart,#storeTabs'))queueMicrotask(refresh)},true);
// Observe catalog changes rather than polling every 1.8 seconds.
const catalog=$('product-grid-auto');
if(catalog){let scheduled=false;new MutationObserver(changes=>{if(changes.some(m=>m.type==='childList')){if(scheduled)return;scheduled=true;queueMicrotask(()=>{scheduled=false;if($('s5Cart')?.classList.contains('open'))refresh()})}}).observe(catalog,{childList:true,subtree:true})} 
refresh();syncPresence();syncStoreIdentity();
})();