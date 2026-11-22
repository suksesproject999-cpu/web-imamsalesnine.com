
(function(){
 'use strict';
 const root=document.getElementById('whOrigin'),toggle=document.getElementById('whOriginToggle'),search=document.getElementById('whOriginSearch'),list=document.getElementById('whOriginList'),label=document.getElementById('whOriginValue');
 if(!root)return;
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','&quot;':'&quot;',"'":'&#39;'}[c]));
 const key='nine_store_warehouse_id';
 let warehouses=[],selectedId=null,initialized=false;
 try{selectedId=localStorage.getItem(key)}catch(e){}
 function close(){root.classList.remove('open');toggle.setAttribute('aria-expanded','false')}
 function render(){
  const active=warehouses.filter(w=>w.active!==false);
  const chosen=active.find(w=>w.id===selectedId);
  const fallback=active.find(w=>w.isDefault)||active.find(w=>/dki jakarta/i.test((w.province||'')+' '+(w.city||'')))||active[0];
  const selected=chosen||fallback;
  if(selected){selectedId=selected.id;label.textContent=selected.city||selected.province||selected.name;try{localStorage.setItem(key,selected.id)}catch(e){}}
  else{selectedId=null;label.textContent=initialized?'Lokasi belum tersedia':'DKI Jakarta'}
  const q=search.value.trim().toLocaleLowerCase('id');
  const shown=active.filter(w=>[w.city,w.province,w.name].some(v=>String(v||'').toLocaleLowerCase('id').includes(q)));
  list.innerHTML=shown.length?shown.map(w=>`<button type="button" class="wh-origin-option ${w.id===selectedId?'selected':''}" role="option" aria-selected="${w.id===selectedId}" data-wh-id="${esc(w.id)}"><i class="fa-solid fa-warehouse" style="color:#84b54f"></i><span><strong>${esc(w.city||w.province||w.name)}</strong><small>${esc(w.province||'')}${w.name?' · '+esc(w.name):''}</small></span>${w.id===selectedId?'<i class="fa-solid fa-check-circle"></i>':''}</button>`).join(''):'<div class="wh-origin-empty">Tidak ada gudang yang cocok.</div>';
 }
 toggle.addEventListener('click',()=>{const open=!root.classList.contains('open');root.classList.toggle('open',open);toggle.setAttribute('aria-expanded',String(open));if(open){render();search.focus({preventScroll:true})}});
 search.addEventListener('input',render);
 list.addEventListener('click',e=>{const b=e.target.closest('[data-wh-id]');if(!b)return;selectedId=b.dataset.whId;try{localStorage.setItem(key,selectedId)}catch(e){}render();close();root.dispatchEvent(new CustomEvent('warehousechange',{detail:{warehouseId:selectedId},bubbles:true}))});
 document.addEventListener('pointerdown',e=>{if(!root.contains(e.target))close()});
 document.addEventListener('keydown',e=>{if(e.key==='Escape')close()});
 function subscribe(){
  if(typeof firebase==='undefined'||!firebase.apps||!firebase.apps.length){setTimeout(subscribe,300);return}
  firebase.firestore().collection('store_warehouses').onSnapshot(snap=>{warehouses=snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(Number(a.order)||0)-(Number(b.order)||0)||String(a.city||'').localeCompare(String(b.city||'')));initialized=true;render()},err=>{initialized=true;label.textContent='Lokasi belum tersedia';list.innerHTML='<div class="wh-origin-empty">Lokasi belum bisa dimuat.</div>';console.warn('Gudang Store:',err)});
 }
 subscribe();
})();
