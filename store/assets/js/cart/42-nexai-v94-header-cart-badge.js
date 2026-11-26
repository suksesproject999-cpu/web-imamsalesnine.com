
(()=>{
 'use strict';
 const countItems=()=>{
  let rows=[];
  try{
   const raw=localStorage.getItem('imamstore_cart_stage5');
   const parsed=raw?JSON.parse(raw):[];
   if(Array.isArray(parsed))rows=parsed;
  }catch(_){}
  return rows.reduce((sum,item)=>sum+Math.max(0,Math.floor(Number(item.qty??item.jumlah??item.quantity??0)||0)),0);
 };
 const refresh=()=>{
  const count=countItems();
  for(const id of ['nineHeaderCartCount','s4CartCount']){
   const el=document.getElementById(id);
   if(!el)continue;
   // ImamStore badge rapi R1: visual 99+; actual quantity stays numeric.
   el.textContent=count>99?'99+':String(count);
   el.hidden=count===0;
   el.setAttribute('aria-hidden','true');
   const button=el.closest('button');
   if(button)button.setAttribute('aria-label','Keranjang, '+count+' barang');
  }
  const countLabel=document.getElementById('refCartCount');
  if(countLabel)countLabel.textContent='('+count+')';
  return count;
 };
 window.imamstoreRefreshCartBadge=refresh;
 document.addEventListener('nine:cartchange',refresh);
 window.addEventListener('storage',event=>{if(!event.key||event.key==='imamstore_cart_stage5')refresh()});
 document.addEventListener('imamstore:open-product',refresh);
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',refresh,{once:true});
 else refresh();
})();
