(()=>{'use strict';
const names={'arrow-left':'arrow-left','arrow-up':'arrow-up','message-circle':'comments','messages-square':'comments','shopping-cart':'cart-shopping','ticket':'ticket','map-pin':'location-dot','truck':'truck-fast','notebook-pen':'note-sticky','file-check':'file-contract','clipboard-list':'clipboard-list','share-2':'share-nodes','plus':'plus','minus':'minus','trash-2':'trash','pencil':'pen','percent':'percent','search':'magnifying-glass','zap':'bolt','store':'store'};
const icon=name=>'<i class="fa-solid fa-'+(names[name]||name)+'" aria-hidden="true"></i>';
function setIcon(el,name,replace=false){if(!el)return;const cls='fa-'+(names[name]||name);const current=el.querySelector(':scope > i.fa-solid');if(current){current.className='fa-solid '+cls;return}if(replace){el.innerHTML=icon(name)}else{const old=el.querySelector(':scope > svg.imam-icon');if(old)old.remove();el.insertAdjacentHTML('afterbegin',icon(name)+' ')}}
function run(){
 setIcon(document.getElementById('s5CartBack'),'arrow-left');setIcon(document.getElementById('s5DraftBack'),'arrow-left');setIcon(document.getElementById('refCartChat'),'comments');
 for(const id of ['refCartVoucher','refCheckoutVoucher'])setIcon(document.getElementById(id),'ticket');
 const address=document.querySelector('#refAddressOpen strong');setIcon(address,'location-dot');
 for(const h of document.querySelectorAll('#s5Draft .ref-checkout-card h2')){const t=h.textContent.toLowerCase();setIcon(h,t.includes('pengiriman')?'truck-fast':t.includes('catatan')?'note-sticky':t.includes('syarat')?'file-contract':'clipboard-list')}
 const detail=document.getElementById('imamstoreLiveOriginalDetail');if(detail){for(const b of detail.querySelectorAll('#stickyCheckout .sticky-icon-btn'))b.setAttribute('aria-label',b.id==='stickyChatBtn'?'Pesan':'Keranjang')
 const up=detail.querySelector('#nineAllBackTop');if(up)setIcon(up,'arrow-up',true);
 for(const b of detail.querySelectorAll('[aria-label*="Bagikan"],[aria-label*="Share"]'))setIcon(b,'share-nodes');}
}
let pending=false;function schedule(){if(pending)return;pending=true;requestAnimationFrame(()=>{pending=false;run()})}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',run,{once:true});else run();
const observer=new MutationObserver(records=>{if(records.some(r=>Array.from(r.addedNodes).some(n=>n.nodeType===1&&!n.matches?.('i.fa-solid,svg.imam-icon'))))schedule()});observer.observe(document.body,{childList:true,subtree:true});
window.imamstoreIcon47=Object.freeze({icon,refresh:run});
})();