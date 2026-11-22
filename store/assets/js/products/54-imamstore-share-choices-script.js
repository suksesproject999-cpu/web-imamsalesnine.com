
/* Two explicit share options. Photos become File objects BEFORE the user taps share,
   preserving the transient user activation required by the native Web Share API.
   Only the public image is fetched; no login/account/cart code is involved. */
(function(){'use strict';
 if(window.imamstoreShareChoices)return;
 const ORIGIN='https://store.imamsales.com/';
 const el=document.createElement('div');el.id='imamstoreShareChoices';el.hidden=true;
 el.setAttribute('role','dialog');el.setAttribute('aria-modal','true');
 el.setAttribute('aria-label','Bagikan produk');
 el.innerHTML='<button class="isc-backdrop" type="button" aria-label="Tutup"></button>'+
  '<div class="isc-panel"><div class="isc-head"><h2>Bagikan Produk</h2><button class="isc-close" type="button" aria-label="Tutup">×</button></div>'+
  '<p class="isc-product"></p>'+
  '<button class="isc-action isc-link" type="button"><span class="isc-icon"><i class="fa-solid fa-link"></i></span><span><strong>Bagikan Link</strong><small>Pratinjau produk di WhatsApp dan aplikasi lain</small></span></button>'+
  '<button class="isc-action isc-photo" type="button" disabled><span class="isc-icon"><i class="fa-regular fa-image"></i></span><span><strong class="isc-photo-label">Bagikan Foto + QR</strong><small class="isc-photo-info">Menyiapkan gambar Share...</small></span></button>'+
  '<button class="isc-action isc-copy" type="button"><span class="isc-icon"><i class="fa-regular fa-copy"></i></span><span><strong>Salin Link</strong><small>Simpan tautan untuk dikirim manual</small></span></button>'+
  '<p class="isc-status" role="status" aria-live="polite"></p>'+
  '<p class="isc-note">Beberapa aplikasi tidak menyertakan teks tautan saat menerima foto. Jika perlu, gunakan Salin Link.</p></div>';
 document.body.append(el);
 const q=s=>el.querySelector(s);
 let payload=null,photo=null,seq=0,lastFocus=null;
 const text=v=>String(v??'').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();
 const idOk=v=>v!==null&&v!==undefined&&/^[A-Za-z0-9_-]{1,120}$/.test(String(v));
 function imageCandidates(p){return [p?.gambar,p?.image,p?.thumbnail,p?.foto,p?.fotoUtama,p?.mainImage,p?.photo,p?.imageUrl,
  ...(Array.isArray(p?.gallery)?p.gallery:[]),...(Array.isArray(p?.galeri)?p.galeri:[]),...(Array.isArray(p?.images)?p.images:[]),...(Array.isArray(p?.fotoProduk)?p.fotoProduk:[])];}
 function getImage(p){for(const v of imageCandidates(p)){
   const s=typeof v==='string'?v:(v?.url||v?.src||v?.gambar||v?.image||'');
   if(typeof s!=='string'||!s.trim()||/no-image|placeholder/i.test(s))continue;
   if(/^data:image\/(?:png|jpe?g|webp|gif|avif);base64,/i.test(s))return s;
   try{const url=new URL(s,ORIGIN);if(url.protocol==='https:' && !url.username&&!url.password)return url.href}catch{}
  }return '';
 }
 // Metadata kecil yang sudah disiapkan oleh generator, dengan fallback aman
 // untuk produk baru yang belum masuk snapshot GitHub berikutnya.
 async function preparedShare(id){
   try {
     const res=await fetch('/share-data/'+encodeURIComponent(id)+'.json',{
       credentials:'omit',cache:'default',signal:AbortSignal.timeout(2200)
     });
     if(!res.ok||!(res.headers.get('content-type')||'').includes('json'))return null;
     const item=await res.json();
     return item&&String(item.id)===String(id)&&item.sharePath==='/p/'+id+'/' ? item:null;
   }catch{return null}
 }
 async function fetchPhotoAsFile(src,p,isPoster){
   let source=src;
   if(!src.startsWith('data:')){
     const url=new URL(src,ORIGIN);
     if(url.origin===location.origin&& !url.pathname.startsWith('/.netlify/')&&
        !url.pathname.startsWith('/_share-image/')&&!url.pathname.startsWith('/images/share-posters/')){
       const cdn=new URL('/.netlify/images',location.origin);
       cdn.searchParams.set('url',url.pathname+url.search);cdn.searchParams.set('w','960');cdn.searchParams.set('h','504');
       cdn.searchParams.set('fit','contain');cdn.searchParams.set('fm','jpg');cdn.searchParams.set('q','63');source=cdn.href;
     }
   }
   const res=await fetch(source,{mode:'cors',credentials:'omit',signal:AbortSignal.timeout(16000)});
   if(!res.ok)throw Error('photo-request-failed');
   const blob=await res.blob();
   if(!blob.type.startsWith('image/')||blob.size<50||blob.size>6*1024*1024)throw Error('invalid-photo');
   if(blob.type==='image/jpeg')return {file:new File([blob],'ImamStore-Produk-'+p.id+(isPoster?'-QR':'')+'.jpg',{type:'image/jpeg'}),isPoster};
   const bitmap=await createImageBitmap(blob);
   try{
     const ratio=Math.min(960/bitmap.width,504/bitmap.height,1);
     const c=document.createElement('canvas');c.width=Math.max(1,Math.round(bitmap.width*ratio));c.height=Math.max(1,Math.round(bitmap.height*ratio));
     c.getContext('2d',{alpha:false}).drawImage(bitmap,0,0,c.width,c.height);
     const jpeg=await new Promise(resolve=>c.toBlob(resolve,'image/jpeg',.7));
     if(!jpeg||jpeg.size>6*1024*1024)throw Error('image-conversion-failed');
     return {file:new File([jpeg],'ImamStore-Produk-'+p.id+'.jpg',{type:'image/jpeg'}),isPoster};
   }finally{bitmap.close?.()}
 }
 async function makeFile(p,meta){
   const choices=[];
   if(typeof meta?.poster==='string'&&meta.poster.startsWith('/images/share-posters/')){
     choices.push({source:new URL(meta.poster,ORIGIN).href,isPoster:true});
   }
   const base=getImage(p);
   if(base)choices.push({source:base,isPoster:false});
   for(const choice of choices){try{return await fetchPhotoAsFile(choice.source,p,choice.isPoster)}catch{}}
   return null;
 }
 function close(){if(el.hidden)return;el.hidden=true;seq++;payload=null;photo=null;try{lastFocus?.focus({preventScroll:true})}catch{}lastFocus=null}
 function status(message){q('.isc-status').textContent=message}
 function open(p,invoker){
   if(!p||!idOk(p.id))return;
   const link=new URL('/',location.origin);link.searchParams.set('product',String(p.id));
   payload={id:String(p.id),name:text(p.nama||p.name||'Produk ImamStore'),link:link.href};
   photo=null;const token=++seq;lastFocus=invoker||document.activeElement;
   q('.isc-product').textContent=payload.name;
   q('.isc-photo').disabled=true;
   q('.isc-photo-label').textContent='Bagikan Foto + QR';
   q('.isc-photo-info').textContent='Menyiapkan gambar Share...';
   status('');el.hidden=false;q('.isc-close').focus({preventScroll:true});
   const manifest=preparedShare(String(p.id));
   manifest.then(meta=>{
     if(token!==seq||el.hidden)return;
     if(meta?.sharePath)payload.link=new URL(meta.sharePath,ORIGIN).href;
   });
   if(!navigator.share||!navigator.canShare){
     q('.isc-photo-info').textContent='Perangkat ini belum mendukung berbagi foto langsung';return;
   }
   manifest.then(meta=>makeFile(p,meta)).then(result=>{
     if(token!==seq||el.hidden)return;
     if(result?.file&&navigator.canShare({files:[result.file]})){
       photo=result.file;
       q('.isc-photo').disabled=false;
       q('.isc-photo-label').textContent=result.isPoster?'Bagikan Foto + QR':'Bagikan Foto + Link';
       q('.isc-photo-info').textContent=result.isPoster
         ? 'Kartu produk dengan QR siap dibagikan'
         : 'Foto siap dibagikan bersama link';
     }else q('.isc-photo-info').textContent='Foto tidak tersedia. Gunakan Bagikan Link.';
   }).catch(()=>{if(token===seq&&!el.hidden)q('.isc-photo-info').textContent='Foto belum tersedia. Gunakan Bagikan Link.'});
 }
 async function linkShare(){if(!payload)return;const {name,link}=payload;
  try{if(navigator.share){await navigator.share({title:name,text:name,url:link});close()}
  else if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(link);status('Link produk berhasil disalin.')}
  else{prompt('Salin tautan produk',link)}}catch(e){if(e?.name!=='AbortError')status('Belum berhasil membagikan link. Coba Salin Link.')}}
 async function photoShare(){if(!photo||!payload||!navigator.canShare?.({files:[photo]}))return;
  // This call MUST be synchronous with the user's click: no await/fetch before share().
  const input={files:[photo],title:payload.name,text:payload.name+'\n'+payload.link};
  try{await navigator.share(input);close()}catch(e){if(e?.name!=='AbortError')status('Belum berhasil membagikan foto. Coba Bagikan Link.')}}
 async function copy(){if(!payload)return;try{if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(payload.link);status('Link produk berhasil disalin.')}
  else{prompt('Salin tautan produk',payload.link)}}catch{status('Belum bisa menyalin link. Coba Bagikan Link.')}}
 q('.isc-backdrop').addEventListener('click',close);
 q('.isc-close').addEventListener('click',close);
 q('.isc-link').addEventListener('click',linkShare);
 q('.isc-photo').addEventListener('click',photoShare);
 q('.isc-copy').addEventListener('click',copy);
 document.addEventListener('keydown',e=>{if(!el.hidden&&e.key==='Escape'){e.preventDefault();close()}});
 window.imamstoreShareChoices=Object.freeze({open,close});
})();
