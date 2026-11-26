(()=>{'use strict';
// One existing launcher, one existing open-cart event. No second floating button.
const button=document.getElementById('s8CartLauncher');
if(!button)return;
const icon=button.querySelector('i');
if(!icon)return;
const name=document.createElement('span');
name.className='s8-cart-launcher-label';
name.textContent='Keranjang';
const badge=document.createElement('span');
badge.id='s8CartLauncherCount';
badge.className='s8-cart-launcher-badge';
badge.setAttribute('aria-hidden','true');
badge.hidden=true;
button.replaceChildren(icon,name,badge);
button.addEventListener('click',()=>document.dispatchEvent(new Event('imamstore:open-cart')));
})();
