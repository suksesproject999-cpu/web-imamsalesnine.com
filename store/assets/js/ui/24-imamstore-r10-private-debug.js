
(()=>{'use strict';
if(new URLSearchParams(location.search).get('checkoutDebug')!=='1')return;
const start=()=>{
 const b=document.createElement('button');b.type='button';b.textContent='Salin Laporan Checkout';
 b.setAttribute('aria-label','Salin laporan diagnostik checkout');
 Object.assign(b.style,{position:'fixed',right:'9px',top:'max(10px,env(safe-area-inset-top))',zIndex:'2147483645',maxWidth:'185px',padding:'9px 12px',font:'700 11px Arial,sans-serif',borderRadius:'12px',background:'#202a20',color:'white',border:'1px solid #8cc63f'});
 b.addEventListener('click',async()=>{
  const text=JSON.stringify(window.imamstoreCheckoutSafeReport?.()||{version:'R10',status:'Belum ada checkout'},null,2);
  try{await navigator.clipboard.writeText(text)}catch(_){window.prompt('Salin laporan berikut:',text);return}
  if(window.Swal?.fire)await window.Swal.fire({icon:'success',title:'Laporan disalin',text:'Laporan teknis tanpa alamat, nomor HP, atau identitas pribadi sudah disalin.',confirmButtonColor:'#8cc63f'});
  else window.alert('Laporan disalin.');
 });
 document.body.appendChild(b);
};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
