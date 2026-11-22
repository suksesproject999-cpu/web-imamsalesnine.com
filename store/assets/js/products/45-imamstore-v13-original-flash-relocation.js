
(()=>{'use strict';
const detail=document.getElementById('imamstoreLiveOriginalDetail');if(!detail)return;
let queued=false;
function relocate(){
 queued=false;
 if(!detail.classList.contains('open'))return;
 const gallery=detail.querySelector('.product-detail .gallery-main');
 const banner=detail.querySelector('.nine-detail-flash-badge');
 if(!gallery||!banner)return;
 if(banner.parentElement!==gallery)gallery.appendChild(banner);
}
function schedule(){if(!queued){queued=true;requestAnimationFrame(relocate)}}
new MutationObserver(schedule).observe(detail,{childList:true,subtree:true});
detail.addEventListener('scroll',schedule,{passive:true});
schedule();
})();
