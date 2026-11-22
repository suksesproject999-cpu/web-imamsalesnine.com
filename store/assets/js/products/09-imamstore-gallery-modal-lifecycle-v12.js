(()=>{'use strict';
const modal=document.getElementById('nfSheetGallery');if(!modal)return;
let priorFocus=null;
const active=()=>modal.classList.contains('nf-open');
const sync=()=>{
  const isOpen=active();modal.setAttribute('aria-hidden',String(!isOpen));
  if(isOpen){if(!priorFocus)priorFocus=document.activeElement;modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');modal.setAttribute('tabindex','-1');modal.focus({preventScroll:true});}
  else {modal.removeAttribute('aria-modal');if(priorFocus&&priorFocus.isConnected&&typeof priorFocus.focus==='function')priorFocus.focus({preventScroll:true});priorFocus=null;}
};
new MutationObserver(sync).observe(modal,{attributes:true,attributeFilter:['class']});
window.addEventListener('popstate',()=>{if(active()&&typeof window.nfCloseSheetGallery==='function')window.nfCloseSheetGallery()});
document.addEventListener('imamstore:open-product',()=>{if(active()&&typeof window.nfCloseSheetGallery==='function')window.nfCloseSheetGallery()});
// A hidden original modal must not intercept clicks or keyboard focus.
sync();
})();