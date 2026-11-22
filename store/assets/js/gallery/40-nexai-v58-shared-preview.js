
(function(){
'use strict';
const selector='#checkout-summary .v38-checkout-thumb';
function urlOf(img){return img.currentSrc||img.getAttribute('src')||''}
function openFor(img){
 const card=img.closest('.summary-item,.imam-cart-product,.cart-item');
 const images=card?[...card.querySelectorAll('img')]:[img];
 const primary=urlOf(img);
 const seen=new Set();
 const urls=[primary,...images.map(urlOf)].filter(url=>{
  if(!url||seen.has(url))return false;
  seen.add(url);return true;
 });
 window.imamstorePhotoPreview?.openImages(urls,primary);
}
document.addEventListener('click',event=>{
 const target=event.target.closest?.(selector);
 if(!target)return;
 event.preventDefault();event.stopPropagation();
 openFor(target);
});
document.addEventListener('keydown',event=>{
 if(event.key!=='Enter'&&event.key!==' ')return;
 const target=event.target.closest?.(selector);
 if(!target)return;
 event.preventDefault();openFor(target);
});
function mark(img){
 if(img.tabIndex<0)img.tabIndex=0;
 img.setAttribute('role','button');
 img.setAttribute('aria-label','Lihat preview foto produk');
}
function markVisiblePreviews(root=document){
 if(root.matches?.(selector))mark(root);
 root.querySelectorAll?.(selector).forEach(mark);
}
markVisiblePreviews();
let pending=false;
const previewObserver=new MutationObserver(records=>{
 if(pending)return;
 if(!records.some(record=>record.addedNodes.length))return;
 pending=true;
 queueMicrotask(()=>{pending=false;markVisiblePreviews();});
});
previewObserver.observe(document.body,{childList:true,subtree:true});
document.addEventListener('focusin',event=>{
 const img=event.target.closest?.(selector);
 if(img)mark(img);
});
})();
