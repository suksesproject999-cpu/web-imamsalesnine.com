
(function(){
 'use strict';
 // Detail utama memakai pengelola foto yang sama dengan sheet dan keranjang.
 const detail=document.getElementById('imamstoreLiveOriginalDetail');
 if(!detail)return;
 function photos(){
  const main=detail.querySelector('#mainProductImage');
  const thumbs=[...detail.querySelectorAll('.gallery-thumb img')];
  const values=[main,...thumbs].filter(Boolean).map(el=>el.currentSrc||el.src);
  const unique=new Set();
  return values.filter(url=>{
   if(!url||unique.has(url))return false;
   unique.add(url);return true;
  });
 }
 window.openLightbox=function(){
  const main=detail.querySelector('#mainProductImage');
  if(!main||!detail.classList.contains('open'))return;
  window.imamstorePhotoPreview?.openImages(photos(),main.currentSrc||main.src);
 };
 // Klik foto utama dialihkan ke galeri terpadu tanpa memengaruhi swipe thumbnail.
 detail.addEventListener('click',function(event){
  const main=event.target.closest('#mainProductImage');
  if(!main||!detail.classList.contains('open'))return;
  event.preventDefault();
  event.stopImmediatePropagation();
  window.openLightbox();
 },true);
})();
