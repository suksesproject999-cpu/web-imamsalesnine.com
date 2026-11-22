(()=>{'use strict';
const host=document.getElementById('imamstoreLiveOriginalDetail');if(!host)return;
const get=(id)=>host.querySelector('#'+id);
function ensure(){
 if(!host.classList.contains('open'))return;
 const sticky=get('stickyCheckout');if(sticky){sticky.style.removeProperty('display');sticky.hidden=false;sticky.setAttribute('aria-label','Tombol pembelian produk')}
 const spec=get('nineSpecOverlay');if(spec){spec.setAttribute('role','presentation');spec.querySelector('.nine-spec-sheet')?.setAttribute('role','dialog')}
}
let scheduled=false;function schedule(){if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;ensure()})}
const observer=new MutationObserver(schedule);observer.observe(host,{childList:true,subtree:false,attributes:true,attributeFilter:['class']});
host.addEventListener('scroll',schedule,{passive:true});
const priorOpen=window.nineOpenSpecs,priorClose=window.nineCloseSpecs;
window.nineOpenSpecs=function(){const spec=get('nineSpecOverlay');if(!spec)return priorOpen?.();spec.style.display='flex';spec.classList.add('imamstore-spec-visible');document.body.classList.add('imamstore-spec-open')};
window.nineCloseSpecs=function(){const spec=get('nineSpecOverlay');if(!spec)return priorClose?.();spec.classList.remove('imamstore-spec-visible');spec.style.display='none';document.body.classList.remove('imamstore-spec-open')};
host.addEventListener('click',e=>{const spec=get('nineSpecOverlay');if(spec&&e.target===spec){window.nineCloseSpecs();return}},true);
const lightbox=document.getElementById('s9Lightbox');



document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!lightbox?.classList.contains('open')&&get('nineSpecOverlay')?.classList.contains('imamstore-spec-visible'))window.nineCloseSpecs()},true);
window.imamstoreV35Status=()=>({detailOpen:host.classList.contains('open'),stickyPresent:!!get('stickyCheckout'),specPresent:!!get('nineSpecOverlay'),lightboxPresent:!!lightbox,cartBridge:!!window.imamstoreCartBridge});
schedule();
})();