/* Smart Search Pro 2D — satu dropdown untuk beranda + detail.
 * Rendering ringan per frame; tanpa timer 150 ms atau query Firebase baru.
 */
(()=>{'use strict';
 const data=window.imamstoreSmartSearchData;
 const mainInput=document.getElementById('search');
 const detailHost=document.getElementById('imamstoreLiveOriginalDetail');
 if(!data||!mainInput||!detailHost)return;

 const popup=document.createElement('div');
 popup.id='imamstoreSmartSearchSuggestions';
 popup.className='iss-search-list';
 popup.setAttribute('role','listbox');
 popup.setAttribute('aria-label','Saran produk ImamStore');
 popup.hidden=true;
 const heading=document.createElement('div');
 heading.className='iss-search-heading';
 heading.textContent='Saran produk';
 const results=document.createElement('div');
 results.className='iss-search-results';
 popup.append(heading,results);
 document.body.append(popup);

 const cache=new Map();
 let activeInput=null;
 let frame=0;
 let positionFrame=0;
 let composing=false;
 const rupiah=value=>Number.isFinite(value)&&value>0
  ?'Rp '+Math.round(value).toLocaleString('id-ID'):'Harga belum tersedia';

 function attachA11y(input){
  input.setAttribute('aria-controls',popup.id);
  input.setAttribute('aria-haspopup','listbox');
  input.setAttribute('aria-expanded','false');
  input.setAttribute('autocomplete','off');
 }
 attachA11y(mainInput);
 function currentDetail(){return detailHost.querySelector('#nineDetailSearchInput')}
 function isSearchInput(node){return node===mainInput||node?.id==='nineDetailSearchInput'&&detailHost.contains(node)}

 function hide(){
  if(frame){cancelAnimationFrame(frame);frame=0;}
  popup.hidden=true;
  if(activeInput)activeInput.setAttribute('aria-expanded','false');
 }
 function switchInput(input){
  if(activeInput!==input){hide();activeInput=input;}
  attachA11y(input);
 }
 function openProduct(item){
  if(!item)return;
  const origin=activeInput;
  hide();
  origin?.blur();
  document.dispatchEvent(new CustomEvent('imamstore:open-product',{detail:{id:item.id}}));
 }
 function makeRow(item){
  const row=document.createElement('button');
  row.type='button';
  row.className='iss-search-row';
  row.setAttribute('role','option');
  const image=document.createElement('img');
  image.className='iss-search-image';
  image.alt='';
  image.loading='lazy';
  image.decoding='async';
  image.addEventListener('error',()=>{
   if(image.dataset.fallback)return;
   image.dataset.fallback='1';
   image.src='/images/no-image.png';
  });
  const main=document.createElement('span');
  main.className='iss-search-main';
  const title=document.createElement('strong');
  title.className='iss-search-title';
  const meta=document.createElement('span');
  meta.className='iss-search-meta';
  const sku=document.createElement('small');
  sku.className='iss-search-sku';
  const price=document.createElement('span');
  price.className='iss-search-price';
  meta.append(sku,price);
  main.append(title,meta);
  row.append(image,main);
  row.addEventListener('mousedown',e=>e.preventDefault());
  row.addEventListener('click',()=>openProduct(row.smartItem));
  row.smartNodes={image,title,sku,price};
  updateRow(row,item);
  return row;
 }
 function updateRow(row,item){
  row.smartItem=item;
  const {image,title,sku,price}=row.smartNodes;
  const src=item.image||'/images/no-image.png';
  if(image.getAttribute('src')!==src){
   image.dataset.fallback='';
   image.setAttribute('src',src);
  }
  if(title.textContent!==item.name)title.textContent=item.name;
  const skuText=item.sku?'SKU: '+item.sku:'Produk ImamStore';
  if(sku.textContent!==skuText)sku.textContent=skuText;
  const priceText=rupiah(item.price);
  if(price.textContent!==priceText)price.textContent=priceText;
  row.setAttribute('aria-label',item.name+(item.sku?', '+skuText:'')+', '+priceText);
 }
 function positionPopup(){
  positionFrame=0;
  if(popup.hidden||!activeInput||!activeInput.isConnected)return;
  const r=activeInput.getBoundingClientRect();
  const v=window.visualViewport;
  const vx=v?.offsetLeft||0,vy=v?.offsetTop||0;
  const vw=v?.width||window.innerWidth,vh=v?.height||window.innerHeight;
  const margin=12;
  const width=Math.max(0,Math.min(540,vw-margin*2));
  const left=vw<=720?vx+margin:Math.min(vx+vw-width-margin,Math.max(vx+margin,r.left));
  const below=vy+vh-r.bottom-8-margin;
  const above=r.top-vy-margin-8;
  const placeAbove=below<142&&above>below;
  const available=Math.max(90,placeAbove?above:below);
  const height=Math.min(390,available);
  popup.style.width=width+'px';
  popup.style.left=left+'px';
  popup.style.maxHeight=height+'px';
  popup.style.top=(placeAbove?Math.max(vy+margin,r.top-height-8):r.bottom+8)+'px';
 }
 function schedulePosition(){
  if(popup.hidden||positionFrame)return;
  positionFrame=requestAnimationFrame(positionPopup);
 }
 function render(){
  frame=0;
  const input=activeInput;
  if(!input||!input.isConnected||!isSearchInput(input))return hide();
  if(input===currentDetail()&&!detailHost.classList.contains('open'))return hide();
  const term=input.value.trim();
  if(term.length<2)return hide();
  const matches=data.find(term,8);
  heading.textContent=matches.length?'Saran produk · '+matches.length+' teratas':'Saran produk';
  if(matches.length){
   const fragment=document.createDocumentFragment();
   for(const item of matches){
    const key=String(item.id);
    let row=cache.get(key);
    if(!row){row=makeRow(item);cache.set(key,row)}
    else updateRow(row,item);
    fragment.append(row);
   }
   results.replaceChildren(fragment);
  }else{
   const empty=document.createElement('div');
   empty.className='iss-search-empty';
   empty.textContent='Produk belum ditemukan. Coba nama atau kode lain.';
   results.replaceChildren(empty);
  }
  popup.hidden=false;
  input.setAttribute('aria-expanded','true');
  positionPopup();
  if(cache.size>40){
   // Batas cache DOM ketika pengguna mencari banyak produk berbeda.
   const retained=new Set(matches.map(item=>String(item.id)));
   for(const key of cache.keys())if(!retained.has(key))cache.delete(key);
  }
 }
 function scheduleRender(input){
  switchInput(input);
  if(input.value.trim().length<2){hide();return}
  if(frame)cancelAnimationFrame(frame);
  frame=requestAnimationFrame(render);
 }
 function handleInput(e){
  if(!isSearchInput(e.target)||composing||e.isComposing)return;
  scheduleRender(e.target);
 }
 function handleFocus(e){
  if(isSearchInput(e.target))scheduleRender(e.target);
 }
 function handleKeydown(e){
  const input=isSearchInput(e.target)?e.target:null;
  if(input){
   if(popup.hidden||activeInput!==input)return;
   if(e.key==='Escape'){e.preventDefault();hide();return}
   const first=results.querySelector('.iss-search-row');
   if(first&&(e.key==='ArrowDown'||e.key==='Enter')){
    e.preventDefault();
    if(e.key==='ArrowDown')first.focus();else first.click();
   }
   return;
  }
  const row=e.target.closest?.('.iss-search-row');
  if(!row||!popup.contains(row))return;
  if(e.key==='Escape'){
   e.preventDefault();hide();activeInput?.focus();return;
  }
  if(e.key!=='ArrowDown'&&e.key!=='ArrowUp')return;
  const rows=[...results.querySelectorAll('.iss-search-row')];
  const index=rows.indexOf(row);
  const next=rows[index+(e.key==='ArrowDown'?1:-1)];
  if(next){e.preventDefault();next.focus()}
  else if(e.key==='ArrowUp'&&index===0){e.preventDefault();activeInput?.focus()}
 }
 mainInput.addEventListener('input',handleInput);
 mainInput.addEventListener('focus',handleFocus);
 mainInput.addEventListener('keydown',handleKeydown);
 detailHost.addEventListener('input',handleInput);
 detailHost.addEventListener('focusin',handleFocus);
 detailHost.addEventListener('keydown',handleKeydown);
 document.addEventListener('compositionstart',e=>{if(isSearchInput(e.target))composing=true});
 document.addEventListener('compositionend',e=>{
  if(!isSearchInput(e.target))return;
  composing=false;scheduleRender(e.target);
 });
 popup.addEventListener('keydown',handleKeydown);
 document.addEventListener('pointerdown',e=>{
  if(!popup.contains(e.target)&&e.target!==activeInput)hide();
 });
 document.addEventListener('imamstore:open-product',hide);
 document.addEventListener('imamstore:catalog-updated',()=>{
  if(!popup.hidden&&activeInput?.isConnected)scheduleRender(activeInput);
 });
 document.getElementById('clearSearch')?.addEventListener('click',hide);
 window.addEventListener('resize',schedulePosition,{passive:true});
 window.addEventListener('scroll',schedulePosition,{passive:true,capture:true});
 window.visualViewport?.addEventListener('resize',schedulePosition,{passive:true});
 window.visualViewport?.addEventListener('scroll',schedulePosition,{passive:true});
 window.addEventListener('pagehide',hide);
})();
