
(()=>{'use strict';
const target=document.getElementById('s5DraftItems');
if(!target)return;
function removeWrongEditors(){
 target.querySelectorAll('.ref-v42-change').forEach(button=>button.remove());
}
removeWrongEditors();
const observer=new MutationObserver(removeWrongEditors);
observer.observe(target,{childList:true,subtree:true});
})();
