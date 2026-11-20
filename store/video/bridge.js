/* ImamStore R36 video bridge — one integration module. No Firestore writes. */
(()=>{'use strict';
 const host=document.getElementById('imamstoreLiveOriginalDetail');if(!host)return;
 const origin=location.origin, path='/video/';
 const catalog=()=>{try{return window.imamstoreV29?.products?.()||[]}catch{return []}};
 const idOf=()=>String(host.querySelector('[data-detail-views]')?.getAttribute('data-detail-views')||'');
 const current=()=>catalog().find(p=>String(p.id)===idOf())||window.imamstoreActiveProduct||null;
 const safeUrl=(v,type)=>{if(typeof v!=='string'||v.length>1800)return '';try{const u=new URL(v,origin+'/');if(u.protocol!=='https:'&&u.origin!==origin)return '';if(type==='video'&&!/\.(mp4|webm)$/i.test(u.pathname))return '';if(type==='poster'&&!/\.(jpg|jpeg|png|webp|avif)$/i.test(u.pathname))return '';return u.href}catch{return ''}};
 const tidy=(v,n=95)=>String(v??'').replace(/[\x00-\x1f]/g,' ').trim().slice(0,n);
 const videos=p=>{const raw=Array.isArray(p?.videoProduk)?p.videoProduk:p?.videoProduk?[p.videoProduk]:Array.isArray(p?.videos)?p.videos:[];const urls=new Set(),items=[];for(const item of raw){const url=safeUrl(typeof item==='string'?item:item?.url||item?.src,'video');if(!url||urls.has(url))continue;urls.add(url);items.push({url,poster:safeUrl(item?.poster||item?.thumbnail||p?.gambar,'poster'),title:tidy(item?.judul||item?.title||p?.nama||'Video Produk'),productId:String(p?.id||''),productName:tidy(p?.nama||'',110),productImage:safeUrl(p?.gambar,'poster'),price:Number(p?.harga?.promo||p?.harga?.normal||p?.hargaPromo||p?.harga||0),sold:Number(p?.terjual||0)});}return items.slice(0,8)};
 const norm=v=>tidy(v,100).toLocaleLowerCase('id-ID').replace(/\s+/g,' ');
 const typeOf=p=>{for(const key of ['tipeProduk','tipe','type','subkategori','subKategori','kategori']){const v=p?.[key];if(typeof v==='string'&&v.trim())return norm(v)}return ''};
 const related=p=>{if(!p)return [];const type=typeOf(p),out=[],seen=new Set();for(const q of [p,...catalog()]){if(String(q?.id)!==String(p.id)&&(!type||typeOf(q)!==type))continue;for(const v of videos(q)){const key=v.productId+'::'+v.url;if(seen.has(key))continue;seen.add(key);out.push(v);if(out.length>=28)return out}}return out};
 const state={id:'',gallery:null,videoUrl:'',videoSig:'',relatedSig:'',reviewUrls:[],reviewFiles:[],feed:null,feedItems:[],pendingBuy:'',pendingReviews:'',feedIndex:0,reviewSubmit:null,overflowBefore:null};
 const msg=(iframe,type,value)=>{try{iframe?.contentWindow?.postMessage({source:'imamstore-video-bridge',type,...value},origin)}catch{}};
 const media=()=>[...host.querySelectorAll('.gallery-thumb > img,.gallery-thumb > button.nine-video-thumb')].filter(x=>x.tagName==='BUTTON'||(x.getAttribute('src')&&x.style.display!=='none'));
 const stopStage=()=>{const mount=host.querySelector('#nineVideoStage');if(!mount)return;msg(mount.querySelector('iframe'),'stop',{});mount.hidden=true;host.querySelector('#mainProductImage')?.removeAttribute('hidden');state.videoUrl=''};
 const selectVideo=button=>{const url=button?.dataset.url;if(!url)return;const mount=host.querySelector('#nineVideoStage');if(!mount)return;let iframe=mount.querySelector('iframe');if(!iframe){iframe=document.createElement('iframe');iframe.src=path+'?mode=player';iframe.title='Video produk';iframe.allow='fullscreen; picture-in-picture';iframe.setAttribute('allowfullscreen','');mount.append(iframe)}const entry={url,poster:button.dataset.poster,title:button.dataset.title};iframe.onload=()=>msg(iframe,'render',{entry});msg(iframe,'render',{entry});mount.hidden=false;host.querySelector('#mainProductImage')?.setAttribute('hidden','');state.videoUrl=url;media().forEach(x=>x.classList.toggle('active',x===button));setCount();};
 const setCount=()=>{const arr=media();const label=host.querySelector('.gallery-main .nine-gallery-count');if(!label)return;label.textContent=(Math.max(0,arr.findIndex(x=>x.classList.contains('active')))+1)+' / '+arr.length;host.querySelectorAll('.gallery-main .nine-gallery-prev,.gallery-main .nine-gallery-next').forEach(b=>b.disabled=arr.length<2)};
 const step=delta=>{const arr=media();if(arr.length<2)return;const active=arr.findIndex(x=>x.classList.contains('active'));const next=arr[(Math.max(0,active)+delta+arr.length)%arr.length];if(next.tagName==='BUTTON')selectVideo(next);else{stopStage();window.changeGallery?.(next);setCount()}};
 window.addEventListener('click',e=>{const b=e.target?.closest?.('#imamstoreLiveOriginalDetail .gallery-main .nine-gallery-prev,#imamstoreLiveOriginalDetail .gallery-main .nine-gallery-next');if(!b||!host.classList.contains('open')||!state.gallery?.querySelector('button.nine-video-thumb'))return;e.preventDefault();e.stopImmediatePropagation();step(b.classList.contains('nine-gallery-next')?1:-1)},true);
 function initGallery(p){const gallery=host.querySelector('.product-detail .gallery-thumb'),stage=host.querySelector('.product-detail .gallery-main');if(!gallery||!stage)return;
  if(state.gallery!==gallery){state.gallery=gallery;state.videoSig='';const mount=document.createElement('div');mount.id='nineVideoStage';mount.className='nine-video-stage';mount.hidden=true;stage.append(mount);gallery.addEventListener('click',e=>{if(e.target.closest('img')){stopStage();queueMicrotask(setCount)}},true);
   gallery.addEventListener('click',e=>{const button=e.target.closest('button.nine-video-thumb');if(button)selectVideo(button)});
   const mut=new MutationObserver(()=>{if(state.gallery===gallery)queueMicrotask(()=>refreshGallery())});mut.observe(gallery,{childList:true});
   let start=null;stage.addEventListener('touchstart',e=>{if(e.touches.length!==1)return;start={x:e.touches[0].clientX,y:e.touches[0].clientY}},{capture:true,passive:true});
   stage.addEventListener('touchend',e=>{if(!start||e.changedTouches.length!==1)return;const dx=e.changedTouches[0].clientX-start.x,dy=e.changedTouches[0].clientY-start.y;start=null;if(Math.abs(dx)<42||Math.abs(dx)<Math.abs(dy)*1.25)return;e.stopPropagation();step(dx<0?1:-1)},{capture:true,passive:true});
   stage.addEventListener('click',e=>{if(!e.target.closest('.nine-gallery-prev,.nine-gallery-next'))return;e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();step(e.target.closest('.nine-gallery-next')?1:-1)},true);
  }
  refreshGallery();
 }
 function refreshGallery(){const p=current(),gallery=state.gallery;if(!p||!gallery||!gallery.isConnected)return;const list=videos(p),signature=JSON.stringify(list.map(x=>[x.url,x.poster,x.title]));if(signature===state.videoSig&&gallery.querySelectorAll('button.nine-video-thumb').length===list.length){setCount();return}
  const selected=state.videoUrl;gallery.querySelectorAll('button.nine-video-thumb').forEach(n=>n.remove());for(const item of list){const b=document.createElement('button');b.type='button';b.className='nine-video-thumb';b.dataset.url=item.url;b.dataset.poster=item.poster;b.dataset.title=item.title;b.setAttribute('aria-label','Putar video '+item.title);if(item.poster)b.style.backgroundImage=`url(${JSON.stringify(item.poster)})`;const triangle=document.createElement('span');triangle.textContent='▶';b.append(triangle);gallery.append(b)}state.videoSig=signature;
  const preserved=[...gallery.querySelectorAll('button.nine-video-thumb')].find(x=>x.dataset.url===selected);if(preserved)selectVideo(preserved);else if(selected)stopStage();setCount();
 }
 function initRelated(p){
  let mount=host.querySelector('#nineVideoRelatedMount');
  if(!mount){
   const shop=host.querySelector('.product-detail .nine-store');if(!shop)return;
   mount=document.createElement('section');mount.id='nineVideoRelatedMount';
   mount.className='nine-video-related';mount.setAttribute('aria-label','Video terkait produk');
   shop.before(mount);
  }
  const list=related(p),sig=JSON.stringify(list.map(x=>[x.productId,x.url,x.poster,x.title,x.price]));
  if(!list.length){mount.hidden=true;state.relatedSig='';mount.replaceChildren();return}
  mount.hidden=false;
  if(sig===state.relatedSig&&mount.querySelector('.nine-video-related-track'))return;
  state.relatedSig=sig;
  // No iframe in the related rail: a nested browsing context captured vertical touch
  // and prevented the existing detail page from scrolling when swiping on a card.
  mount.replaceChildren();
  const head=document.createElement('div');head.className='nine-video-related-head';
  const title=document.createElement('h3');title.textContent='Video Terkait Produk';
  const all=document.createElement('button');all.type='button';all.className='nine-video-related-all';
  all.textContent='›';all.setAttribute('aria-label','Lihat semua video terkait');
  all.addEventListener('click',()=>openFeed(list,0));head.append(title,all);
  const track=document.createElement('div');track.className='nine-video-related-track';
  track.setAttribute('role','region');track.setAttribute('aria-label','Video terkait, geser kiri atau kanan');
  track.tabIndex=0;
  list.forEach((item,i)=>{
   const card=document.createElement('button');card.type='button';card.className='nine-video-related-card';
   card.setAttribute('aria-label','Putar video '+item.title);
   const imageUrl=item.poster||item.productImage;
   if(imageUrl){const cover=document.createElement('img');cover.src=imageUrl;cover.alt='';cover.loading='lazy';cover.decoding='async';card.append(cover)}
   const play=document.createElement('span');play.className='nine-video-related-play';
   play.textContent='▶';play.setAttribute('aria-hidden','true');
   const name=document.createElement('span');name.className='nine-video-related-title';
   name.textContent=item.title||item.productName||'Video produk';
   card.append(play,name);card.addEventListener('click',()=>openFeed(list,i));
   track.append(card);
  });
  mount.append(head,track);
 }
 function reviewMedia(){const composer=host.querySelector('.nine-review-form');if(!composer||composer.querySelector('.nine-review-media-files'))return;const area=document.createElement('div');area.className='nine-review-media-files';const label=document.createElement('label');label.textContent='Lampirkan foto / video ulasan';const input=document.createElement('input');input.type='file';input.accept='image/jpeg,image/png,image/webp,video/mp4,video/webm';input.multiple=true;label.append(input);const hint=document.createElement('small');hint.textContent='Maksimal 4 foto atau 1 video. Pratinjau tersedia; pengiriman media menunggu integrasi backend terverifikasi.';const preview=document.createElement('div');preview.className='nine-review-media-preview';const status=document.createElement('div');status.className='nine-review-media-status';const clear=document.createElement('button');clear.type='button';clear.className='nine-review-media-clear';clear.hidden=true;clear.textContent='Hapus lampiran';clear.addEventListener('click',()=>{state.reviewUrls.forEach(URL.revokeObjectURL);state.reviewUrls=[];state.reviewFiles=[];input.value='';preview.replaceChildren();status.textContent='Lampiran dihapus. Ulasan teks bisa dikirim.';clear.hidden=true});area.append(label,hint,preview,status,clear);composer.insertBefore(area,composer.querySelector('button[onclick*="nineSubmitDetailReview"]'));
  input.onchange=()=>{state.reviewUrls.forEach(URL.revokeObjectURL);state.reviewUrls=[];state.reviewFiles=[];preview.replaceChildren();const files=[...input.files];const photo=files.filter(f=>f.type.startsWith('image/')),vid=files.filter(f=>f.type.startsWith('video/'));if(files.length>4||vid.length>1||(vid.length&&photo.length)){status.textContent='Pilih maksimal 4 foto ATAU 1 video.';input.value='';return}if(files.some(f=>f.size>(f.type.startsWith('video/')?20:5)*1024*1024)){status.textContent='Batas ukuran: foto 5 MB, video 20 MB.';input.value='';return}if(files.some(f=>!['image/jpeg','image/png','image/webp','video/mp4','video/webm'].includes(f.type))){status.textContent='Format belum didukung. Pilih JPG, PNG, WebP, MP4, atau WebM.';input.value='';return}state.reviewFiles=files;clear.hidden=!files.length;status.textContent=files.length?('Terpilih '+files.length+' file. Pratinjau hanya di HP; unggah ulasan media belum tersedia. Hapus lampiran untuk mengirim ulasan teks.'):'';for(const file of files){const url=URL.createObjectURL(file);state.reviewUrls.push(url);const el=document.createElement(file.type.startsWith('video/')?'video':'img');el.src=url;if(el.tagName==='VIDEO'){el.controls=true;el.preload='metadata'}preview.append(el)}};
 }
 function wrapReview(){if(state.reviewSubmit===window.nineSubmitDetailReview)return;const original=window.nineSubmitDetailReview;if(typeof original!=='function'||original.__r36Wrapped)return;const wrapper=async(...args)=>{if(state.reviewFiles.length){const node=host.querySelector('.nine-review-media-status');if(node)node.textContent='Foto/video belum terkirim: perlu backend upload media terverifikasi. Hapus lampiran untuk mengirim ulasan teks.';return}return original.apply(window,args)};wrapper.__r36Wrapped=true;window.nineSubmitDetailReview=wrapper;state.reviewSubmit=wrapper}
 function resetReview(){state.reviewUrls.forEach(URL.revokeObjectURL);state.reviewFiles=[];state.reviewUrls=[]}
 function refresh(){if(!host.classList.contains('open')){stopStage();return}const id=idOf();if(!id)return;const p=current();if(!p)return;if(state.id!==id){stopStage();resetReview();state.id=id;state.gallery=null;state.videoSig='';state.relatedSig=''}initGallery(p);initRelated(p);reviewMedia();wrapReview();if(state.pendingBuy===id){state.pendingBuy='';window.openBuySheet?.()}if(state.pendingReviews===id){state.pendingReviews='';window.nineOpenReviews?.()}}
 let queued=false;const schedule=()=>{if(!queued){queued=true;queueMicrotask(()=>{queued=false;refresh()})}};
 new MutationObserver(schedule).observe(host,{childList:true,attributes:true,attributeFilter:['class']});
 document.addEventListener('imamstore:catalog-updated',schedule);document.addEventListener('imamstore:open-product',schedule);window.addEventListener('pageshow',schedule);schedule();
 const sendCartCount=()=>{const badge=document.getElementById('nineHeaderCartCount');const count=badge&&!badge.hidden?Math.max(0,Number(badge.textContent)||0):0;const frame=state.feed?.querySelector('iframe');if(frame)msg(frame,'cart-count',{count})};document.addEventListener('nine:cartchange',()=>{window.imamstoreRefreshCartBadge?.();sendCartCount()});window.addEventListener('storage',e=>{if(e.key==='imamstore_cart_stage5'){window.imamstoreRefreshCartBadge?.();sendCartCount()}});
 function openFeed(items,index=0){const list=items.filter(x=>x.url);if(!list.length)return;state.feedItems=list;state.feedIndex=index;let root=state.feed;if(!root){root=document.createElement('div');root.id='imamstoreR36Feed';root.hidden=true;const iframe=document.createElement('iframe');iframe.src=path+'?mode=feed';iframe.title='Video Terkait Produk';iframe.allow='fullscreen; picture-in-picture';iframe.setAttribute('allowfullscreen','');root.append(iframe);document.body.append(root);state.feed=root}const iframe=root.querySelector('iframe');root.hidden=false;if(state.overflowBefore===null)state.overflowBefore=document.documentElement.style.overflow;document.documentElement.style.overflow='hidden';iframe.onload=()=>{msg(iframe,'render',{items:list,index});sendCartCount()};msg(iframe,'render',{items:list,index});window.imamstoreRefreshCartBadge?.();sendCartCount()}
 function closeFeed(){if(!state.feed)return;msg(state.feed.querySelector('iframe'),'stop',{});state.feed.hidden=true;document.documentElement.style.overflow=state.overflowBefore??'';state.overflowBefore=null}
 window.addEventListener('message',e=>{if(e.origin!==origin||e.data?.source!=='imamstore-video-ui')return;const galleryFrame=host.querySelector('#nineVideoStage iframe'),feedFrame=state.feed?.querySelector('iframe');if(![galleryFrame?.contentWindow,feedFrame?.contentWindow].includes(e.source))return;
   if(e.data.type==='ready'){if(e.source===galleryFrame?.contentWindow){const selected=host.querySelector('.nine-video-thumb.active');if(selected)msg(galleryFrame,'render',{entry:{url:selected.dataset.url,poster:selected.dataset.poster,title:selected.dataset.title}})}if(e.source===feedFrame?.contentWindow){msg(feedFrame,'render',{items:state.feedItems,index:state.feedIndex});sendCartCount()}return}
   if(e.source===galleryFrame?.contentWindow&&e.data.type==='gallery-step'){step(Number(e.data.delta)<0?-1:1);return}
   if(e.source===feedFrame?.contentWindow){if(e.data.type==='close'){closeFeed();return}if(e.data.type==='open-search'){closeFeed();host.querySelector('#nineDetailSearchInput')?.focus();return}if(e.data.type==='cart'){closeFeed();window.goCart?.();return}if(['open-product','buy','open-reviews'].includes(e.data.type)){const id=String(e.data.productId||'');if(!/^[A-Za-z0-9_-]{1,120}$/.test(id)||!catalog().some(p=>String(p.id)===id))return;closeFeed();if(e.data.type==='buy')state.pendingBuy=id;if(e.data.type==='open-reviews')state.pendingReviews=id;if(id!==idOf())document.dispatchEvent(new CustomEvent('imamstore:open-product',{detail:{id}}));else if(e.data.type==='buy'){state.pendingBuy='';window.openBuySheet?.()}else if(e.data.type==='open-reviews'){state.pendingReviews='';window.nineOpenReviews?.()}return}}
 });
 window.addEventListener('keydown',e=>{if(e.key==='Escape'&&state.feed&&!state.feed.hidden)closeFeed()});
 window.imamstoreR36={refresh,closeFeed,version:'R38.1-related-native'};
})();
