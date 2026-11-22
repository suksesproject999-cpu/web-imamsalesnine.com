
(function(){
  let photos=[],index=0,startX=0,startY=0;
  const modal=()=>document.getElementById('nfSheetGallery');
  function product(){
    try{return currentProduct||null}catch(e){return null}
  }
  function draw(){
    if(!photos.length)return;
    document.getElementById('nfGalleryImage').src=photos[index].src;
    document.getElementById('nfGalleryCount').textContent=(index+1)+'/'+photos.length;
    document.getElementById('nfGalleryCaption').textContent=photos[index].label||'';
  }
  window.nfOpenSheetGallery=function(){
    const p=product();if(!p)return;
    const gallery=[p.gambar,...(Array.isArray(p.gallery)?p.gallery:[])];
    const names=(Array.isArray(p.varian)?p.varian:[]).map(v=>typeof v==='string'?v:(v?.nama||v?.name||v?.label||''));
    const seen=new Set();
    photos=gallery.map((g,i)=>({
      src:typeof g==='string'?g:(g?.url||g?.src||g?.gambar||''),
      label:i===0?(p.nama||'Foto utama'):(names[i-1]||p.nama||'Foto produk')
    })).filter(o=>{if(!o.src||seen.has(o.src))return false;seen.add(o.src);return true;});
    if(!photos.length)return;
    const sheetPhoto=document.querySelector('#purchaseContent .purchase-image')?.src;
    index=Math.max(0,photos.findIndex(o=>{try{return new URL(o.src,location.href).href===sheetPhoto}catch(e){return false}}));
    draw();modal().classList.add('nf-open');
  };
  window.nfCloseSheetGallery=function(){modal().classList.remove('nf-open');};
  const el=modal();
  el.addEventListener('touchstart',e=>{if(!e.touches.length)return;startX=e.touches[0].clientX;startY=e.touches[0].clientY;},{passive:true});
  el.addEventListener('touchend',e=>{
    if(!e.changedTouches.length||photos.length<2)return;
    const dx=e.changedTouches[0].clientX-startX,dy=e.changedTouches[0].clientY-startY;
    if(Math.abs(dx)>50&&Math.abs(dx)>Math.abs(dy)*1.3){index=(index+(dx<0?1:-1)+photos.length)%photos.length;draw();}
  },{passive:true});
  document.addEventListener('keydown',e=>{
    if(!el.classList.contains('nf-open'))return;
    if(e.key==='Escape')window.nfCloseSheetGallery();
    if(photos.length>1&&(e.key==='ArrowRight'||e.key==='ArrowLeft')){
      index=(index+(e.key==='ArrowRight'?1:-1)+photos.length)%photos.length;draw();
    }
  });
})();
