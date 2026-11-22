
(()=>{'use strict';
const root=document.getElementById('imamstoreLiveOriginalDetail');
if(!root)return;
const isViewBadge=el=>el&&el.nodeType===1&&(
 el.matches?.('.nine-view-badge,.detail-view-badge,[data-view-badge]')||
 (el.matches?.('.nine-gallery-badge,.nine-gallery-overlay-badge')&&/dilihat/i.test(el.textContent||''))
);
function dedupeViews(){
 const galleries=root.querySelectorAll('.nine-detail-gallery,.nine-gallery,.detail-product-gallery,.nine-gallery-stage');
 galleries.forEach(gallery=>{
  const badges=Array.from(gallery.querySelectorAll('*')).filter(isViewBadge);
  badges.slice(1).forEach(el=>el.remove());
 });
}
let scheduled=false;
const observer=new MutationObserver(()=>{if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;dedupeViews()})});
observer.observe(root,{childList:true,subtree:true});
dedupeViews();
})();
