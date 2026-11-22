(()=>{'use strict';
const detail=document.getElementById('imamstoreLiveOriginalDetail');if(!detail)return;
const lightbox=document.getElementById('s9Lightbox');
function hideLightbox(){if(lightbox){lightbox.classList.remove('open');lightbox.style.display='none';lightbox.setAttribute('aria-hidden','true')}document.body.classList.remove('imamstore-lightbox-open')}
function showLightbox(){if(lightbox){lightbox.style.display='flex';lightbox.classList.add('open');lightbox.setAttribute('aria-hidden','false');document.body.classList.add('imamstore-lightbox-open')}}
const x=document.getElementById('s9LightboxClose');if(x)x.addEventListener('click',e=>{e.preventDefault();e.stopImmediatePropagation();hideLightbox()},true);
lightbox?.addEventListener('click',e=>{if(e.target===lightbox)hideLightbox()});
window.openLightbox=function(){const im=detail.querySelector('#mainProductImage');const target=document.getElementById('s9LightboxImage');if(!im||!target)return;target.src=im.currentSrc||im.src;target.onerror=()=>{target.onerror=null;const fallback=detail.querySelector('.gallery-thumb img');if(fallback)target.src=fallback.currentSrc||fallback.src};showLightbox()};

window.nineOpenSpecs=function(){const overlay=detail.querySelector('#nineSpecOverlay');if(!overlay)return;overlay.classList.add('imamstore-visible');overlay.style.display='flex';overlay.setAttribute('aria-hidden','false')};
window.nineCloseSpecs=function(){const overlay=detail.querySelector('#nineSpecOverlay');if(!overlay)return;overlay.classList.remove('imamstore-visible');overlay.style.display='none';overlay.setAttribute('aria-hidden','true')};
// Handler panah detail digabung ke pengendali navigasi di bawah.
const watcher=new MutationObserver(()=>{if(!detail.classList.contains('open'))return;const sticky=detail.querySelector('#stickyCheckout');if(sticky){sticky.style.display='flex';sticky.removeAttribute('hidden')}const up=detail.querySelector('#nineAllBackTop');if(up){up.setAttribute('aria-label','Kembali ke atas halaman detail');up.title='Kembali ke atas';up.onclick=null}const img=detail.querySelector('#mainProductImage');if(img&&!img.dataset.v33Fallback){img.dataset.v33Fallback='1';img.addEventListener('error',()=>{const p=window.imamstoreActiveProduct;const fallback=p?.gambar||p?.images?.[0]||p?.gambarTambahan?.[0];if(fallback&&img.src!==fallback)img.src=fallback})}});
watcher.observe(detail,{childList:true,subtree:false,attributes:true,attributeFilter:['class']});

window.addEventListener('keydown',e=>{if(e.key==='Escape'&&lightbox?.classList.contains('open')){e.stopImmediatePropagation();hideLightbox()}},true);
window.imamstoreV33Status=()=>({sticky:!!detail.querySelector('#stickyCheckout'),spec:!!detail.querySelector('#nineSpecOverlay'),lightbox:!!lightbox,cart:!!document.getElementById('s5Cart'),checkoutIsPreview:true});
})();