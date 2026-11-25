/* Smart Search Pro 2B — tampilan saran beranda + detail, satu mesin katalog.
 * Tidak membuat query Firebase baru, tidak mengubah checkout atau data produk.
 */
(()=>{'use strict';
 const data=window.imamstoreSmartSearchData;
 const mainInput=document.getElementById('search');
 const detailHost=document.getElementById('imamstoreLiveOriginalDetail');
 if(!data||!mainInput||!detailHost)return;

 const money=value=>Number.isFinite(value)&&value>0
  ?'Rp '+Math.round(value).toLocaleString('id-ID'):'Harga belum tersedia';
 const home=document.createElement('div');
 home.id='imamstoreSmartSearchSuggestions';
 home.className='iss-search-list iss-home-suggestions';
 home.setAttribute('role','listbox');
 home.setAttribute('aria-label','Saran produk ImamStore');
 home.hidden=true;
 document.body.append(home);
 mainInput.setAttribute('aria-controls',home.id);
 mainInput.setAttribute('aria-expanded','false');

 function hideHome(){home.hidden=true;mainInput.setAttribute('aria-expanded','false');}
 function putRow(target,item,onSelect){
  const button=document.createElement('button');
  button.type='button';
  button.className='iss-search-row';
  button.setAttribute('role','option');
  button.setAttribute('aria-label',item.name+(item.sku?' SKU '+item.sku:''));
  const image=document.createElement('img');
  image.className='iss-search-image';
  image.src=item.image;
  image.alt='';
  image.loading='lazy';
  image.decoding='async';
  image.addEventListener('error',()=>{
   if(image.dataset.fallback)return;
   image.dataset.fallback='1';
   image.src='/images/no-image.png';
  });
  const copy=document.createElement('span');
  copy.className='iss-search-copy';
  const title=document.createElement('strong');
  title.textContent=item.name;
  const sku=document.createElement('small');
  sku.textContent=item.sku?'SKU: '+item.sku:'Produk ImamStore';
  copy.append(title,sku);
  const price=document.createElement('span');
  price.className='iss-search-price';
  price.textContent=money(item.price);
  button.append(image,copy,price);
  button.addEventListener('mousedown',event=>event.preventDefault());
  button.addEventListener('click',onSelect);
  target.append(button);
 }
 function fill(target,query,select,limit){
  target.replaceChildren();
  if(String(query).trim().length<2){target.hidden=true;return false;}
  const matches=data.find(query,limit);
  if(!matches.length){
   const empty=document.createElement('div');
   empty.className='iss-search-empty';
   empty.textContent='Produk tidak ditemukan';
   target.append(empty);
  }else{
   matches.forEach(item=>putRow(target,item,()=>select(item)));
  }
  target.hidden=false;
  return true;
 }
 function positionHome(){
  if(home.hidden)return;
  const rect=mainInput.getBoundingClientRect();
  const viewport=window.visualViewport;
  const viewportWidth=viewport?.width||window.innerWidth;
  const width=Math.max(220,Math.min(450,Math.max(rect.width,320),viewportWidth-16));
  home.style.width=width+'px';
  home.style.left=Math.max(8,Math.min(rect.left,viewportWidth-width-8))+'px';
  home.style.top=Math.min(rect.bottom+7,(viewport?.height||window.innerHeight)-110)+'px';
 }
 function openProduct(item){
  hideHome();
  mainInput.blur();
  document.dispatchEvent(new CustomEvent('imamstore:open-product',{detail:{id:item.id}}));
 }
 function renderHome(){
  if(fill(home,mainInput.value,openProduct,8)){
   mainInput.setAttribute('aria-expanded','true');
   positionHome();
  }else hideHome();
 }
 function renderDetail(host,query){
  const input=host.querySelector('#nineDetailSearchInput');
  const target=host.querySelector('#nineDetailSearchResults');
  if(!input||!target||input.value!==query)return;
  target.classList.add('iss-search-list');
  fill(target,query,item=>{
   target.hidden=true;
   input.blur();
   document.dispatchEvent(new CustomEvent('imamstore:open-product',{detail:{id:item.id}}));
  },8);
 }
 mainInput.addEventListener('input',renderHome);
 mainInput.addEventListener('focus',renderHome);
 mainInput.addEventListener('keydown',event=>{
  if(home.hidden)return;
  if(event.key==='Escape'){event.preventDefault();hideHome();return;}
  if(event.key==='ArrowDown'){
   const first=home.querySelector('button');
   if(first){event.preventDefault();first.focus();}
  }else if(event.key==='Enter'){
   const first=home.querySelector('button');
   if(first){event.preventDefault();first.click();}
  }
 });
 home.addEventListener('keydown',event=>{
  if(event.key==='Escape'){event.preventDefault();hideHome();mainInput.focus();return;}
  if(!['ArrowDown','ArrowUp'].includes(event.key))return;
  const rows=[...home.querySelectorAll('button')];
  const index=rows.indexOf(document.activeElement);
  const next=rows[index+(event.key==='ArrowDown'?1:-1)];
  if(next){event.preventDefault();next.focus();}
  else if(event.key==='ArrowUp'&&index===0){event.preventDefault();mainInput.focus();}
 });
 detailHost.addEventListener('keydown',event=>{
  if(event.target.id!=='nineDetailSearchInput'||event.key!=='ArrowDown')return;
  const first=detailHost.querySelector('#nineDetailSearchResults:not([hidden]) button');
  if(first){event.preventDefault();first.focus();}
 });
 document.addEventListener('pointerdown',event=>{
  if(!home.contains(event.target)&&event.target!==mainInput)hideHome();
 });
 document.addEventListener('imamstore:open-product',hideHome);
 document.addEventListener('imamstore:catalog-updated',()=>{
  if(!home.hidden&&document.activeElement===mainInput)renderHome();
  const detailInput=detailHost.querySelector('#nineDetailSearchInput');
  if(detailInput&&detailInput.value.trim().length>=2)
   renderDetail(detailHost,detailInput.value);
 });
 document.getElementById('clearSearch')?.addEventListener('click',hideHome);
 window.addEventListener('resize',positionHome,{passive:true});
 window.addEventListener('scroll',positionHome,{passive:true,capture:true});
 window.visualViewport?.addEventListener('resize',positionHome,{passive:true});
 window.imamstoreSmartSearchUI=Object.freeze({renderDetail});
})();
