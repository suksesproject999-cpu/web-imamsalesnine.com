
(()=>{'use strict';
const $=id=>document.getElementById(id);
const cart=$('s5Cart'),checkout=$('s5Draft'),order=$('refPlaceOrder');
if(!cart||!checkout)return;
function active(){
 if(checkout.classList.contains('open'))return checkout;
 if(cart.classList.contains('open'))return cart;
 const detail=$('imamstoreLiveOriginalDetail');
 if(detail&&(detail.classList.contains('open')||document.body.classList.contains('imamstore-original-open')))return detail;
 return null;
}
let toast=null,timer,shownHost=null;
function hideToast(){
 clearTimeout(timer);
 if(toast)toast.style.opacity='0';
 shownHost=null;
}
function show(message,type='info',expectedHost=null){
 const host=active();
 if(!host||(expectedHost&&host!==expectedHost))return;
 clearTimeout(timer);
 if(!toast){
  toast=document.createElement('div');toast.id='nexaiScopedToast';
  toast.setAttribute('role','status');toast.setAttribute('aria-live','polite');
  Object.assign(toast.style,{position:'fixed',top:'max(76px,env(safe-area-inset-top))',left:'50%',transform:'translateX(-50%)',maxWidth:'min(90vw,390px)',padding:'12px 17px',borderRadius:'12px',color:'#fff',font:'600 13px/1.5 system-ui,sans-serif',boxShadow:'0 8px 25px #0003',zIndex:'2147483600',textAlign:'center',pointerEvents:'none'});
 }
 shownHost=host;host.appendChild(toast);
 toast.textContent=String(message);
 toast.style.background=type==='error'?'#b42318':type==='delete'?'#F05235':type==='success'?'#8DC63F':'#333';
 toast.style.opacity='1';
 timer=setTimeout(hideToast,2100);
}
window.imamstoreToast=show;
window.imamstoreCartToast=(message)=>{
 if(cart.classList.contains('open'))show(String(message),'delete',cart);
};
const old=$('imamstoreActiveToast');
if(old)old.remove();
new MutationObserver(()=>{
 if(!toast||!shownHost)return;
 const host=active();
 if(host!==shownHost||toast.parentElement!==shownHost)hideToast();
}).observe(document.body,{subtree:true,attributes:true,attributeFilter:['class']});
function selectedAddressData(){
 let data=[];try{data=JSON.parse(localStorage.getItem('imamstore_ref_addresses_v38')||'[]')}catch{}
 const summary=$('refAddressSummary')?.textContent?.trim()||'';
 return Array.isArray(data)?data.find(x=>x?.full&&x.full===summary)||data.find(x=>x?.full&&summary.includes(x.full))||null:null;
}
function check(){
 const issues=window.imamstoreCustomerCheckoutR7?.validateSavedAddress(selectedAddressData())||[];if(issues.length)return {type:'address',issues};
 const session=window.__nineCheckoutSession;
 if(session&&Array.isArray(session.items)&&!session.items.length)return {type:'other',message:'Pilih minimal satu produk sebelum membuat pesanan.'};
 if(!$('refTermsBody')?.checked||!$('refTermsFooter')?.checked)return {type:'other',message:'Centang persetujuan Syarat & Ketentuan untuk melanjutkan checkout.'};
 return '';
}
if(order){
 // Biarkan tombol menerima klik untuk menunjukkan alasan checkout tertahan.
 const sync=()=>{if(checkout.classList.contains('open')){order.disabled=false;order.removeAttribute('aria-disabled')}};
 new MutationObserver(sync).observe(checkout,{attributes:true,attributeFilter:['class']});
 new MutationObserver(sync).observe(order,{attributes:true,attributeFilter:['disabled','aria-disabled']});
 checkout.addEventListener('click',e=>{
  const btn=e.target.closest('#refPlaceOrder');if(!btn)return;
  // Pengunjung tanpa login diarahkan ke modal autentikasi oleh submit().
  // Seluruh validasi alamat dan ketentuan tetap dijalankan setelah login.
  const buyer=window.firebase?.auth?.()?.currentUser;
  if(!buyer||buyer.isAnonymous)return;
  const error=check();
  if(error){
   e.preventDefault();
   e.stopImmediatePropagation();
   const message=error.type==='address'?error.issues[0]:error.message;
   const warning=$('refCheckoutWarning');
   if(warning){warning.textContent=message;warning.hidden=false}
   if(error.type==='address'){window.imamstoreCustomerCheckoutR7?.promptAddress(error.issues)}
   else show(message,'error');
  }
 },true);
 sync();
}
})();
