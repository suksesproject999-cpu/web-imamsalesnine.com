/* ImamStore R39.1 — Admin V5 video moderation navigation.
   Navigation only: never stores credentials, grants roles, or changes seller data. */
(()=>{
  'use strict';
  const DEST='https://store.imamsales.com/video/moderasi.html';
  function visit(){ window.location.assign(DEST); }
  function createMenuButton(){
    const button=document.createElement('button');
    button.type='button';
    button.className='site-menu-item';
    button.id='imamVideoModerationLink';
    button.innerHTML='<i class="fa-solid fa-comments" aria-hidden="true"></i><span><b>Komentar Video</b><small>Moderasi komentar publik dari video produk.</small></span>';
    button.addEventListener('click',visit);
    return button;
  }
  function init(){
    const dropdown=document.getElementById('site-menu-dropdown');
    if(dropdown && !document.getElementById('imamVideoModerationLink')){
      const label=Array.from(dropdown.querySelectorAll('.site-menu-group-label')).find(e=>e.textContent.trim()==='AINEX');
      const divider=label?.previousElementSibling;
      dropdown.insertBefore(createMenuButton(),divider || label || dropdown.lastChild);
    }
    const nav=document.querySelector('#nexai-workspace-nav .nexai-workspace-links');
    if(nav && !document.getElementById('imamVideoModerationTab')){
      const button=document.createElement('button');button.id='imamVideoModerationTab';
      button.type='button';button.textContent='Komentar Video';
      button.title='Moderasi Suka dan Komentar Video';
      button.addEventListener('click',visit);
      nav.append(button);
    }
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
