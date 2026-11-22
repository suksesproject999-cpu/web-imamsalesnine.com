
(function(){
'use strict';
function detail(){return document.getElementById('imamstoreLiveOriginalDetail')}
function images(){
 const root=detail();if(!root)return [];
 const thumbs=[...root.querySelectorAll('.gallery-thumb img')].filter(el=>el.getAttribute('src')&&el.style.display!=='none');
 return thumbs;
}
function step(delta){
 const root=detail(),main=root?.querySelector('#mainProductImage');if(!main)return;
 const thumbs=images();if(thumbs.length<2)return;
 let index=thumbs.findIndex(t=>t.classList.contains('active'));
 if(index<0)index=thumbs.findIndex(t=>t.getAttribute('src')===main.getAttribute('src'));
 const next=(Math.max(0,index)+delta+thumbs.length)%thumbs.length;
 thumbs.forEach((t,i)=>t.classList.toggle('active',i===next));
 main.src=thumbs[next].getAttribute('src');
 const count=root.querySelector('.nine-gallery-count');
 if(count)count.textContent=(next+1)+' / '+thumbs.length;
}
window.nineStepGallery=step;
function openVoucherOnTop(){
 const root=detail();if(!root||!root.isConnected)return;
 const open=window.imamstoreOpenVoucherSheet||window.imamstoreV43?.openVoucher||window.V38?.openVoucher;
 if(typeof open!=='function'){window.imamstoreToast?.('Voucher belum tersedia.','error');return}
 try{
  open();
  const modal=document.querySelector('.ref-modal');
  if(modal&&!modal.hidden){
   if(modal.parentElement!==document.body)document.body.appendChild(modal);
   modal.style.zIndex='2147482000';
  }
 }catch(err){console.error('Voucher Store:',err);window.imamstoreToast?.('Voucher gagal dibuka.','error')}
}
window.nineOpenOriginalVoucher=openVoucherOnTop;
document.addEventListener('click',function(e){
 const button=e.target.closest('#imamstoreLiveOriginalDetail .nine-gallery-prev,#imamstoreLiveOriginalDetail .nine-gallery-next,#imamstoreLiveOriginalDetail .nine-voucher');
 if(!button)return;
 e.preventDefault();e.stopImmediatePropagation();
 if(button.classList.contains('nine-gallery-prev'))step(-1);
 else if(button.classList.contains('nine-gallery-next'))step(1);
 else openVoucherOnTop();
},true);
})();
