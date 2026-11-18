(async function(){
  'use strict';
  const path=window.location.pathname;
  if (path.startsWith('/login')) return;
  const isVip=/^\/vip\/([^/]+)/.exec(path);
  const isProduct=path==='/adminb.html';
  const isAdmin=path.startsWith('/admin') && !isProduct;
  if(!isVip && !isProduct && !isAdmin)return;

  let token,expectedRole,scopedKey;
  if(isVip){
    const folder=isVip[1];
    expectedRole='vip';
    scopedKey='imamsales:session:vip:'+folder;
    token=localStorage.getItem(scopedKey)
      || (localStorage.getItem('role')==='vip'?localStorage.getItem('token'):null);
  } else if(isAdmin){
    expectedRole='admin';
    scopedKey='imamsales:session:admin';
    token=localStorage.getItem(scopedKey)
      || (localStorage.getItem('role')==='admin'?localStorage.getItem('token'):null);
  } else {
    expectedRole='product_admin';
    scopedKey='imamsales:session:product_admin';
    token=localStorage.getItem(scopedKey)
      || (localStorage.getItem('role')==='product_admin'?localStorage.getItem('token'):null);
  }
  if(!token){ window.location.replace('/login'); return; }
  try{
    const res=await fetch('/.netlify/functions/verify-token',{
      method:'GET',cache:'no-store',headers:{Authorization:'Bearer '+token}
    });
    if(!res.ok){
      // A transient server error must not destroy a still-valid session.
      if(res.status===401 || res.status===403){
        localStorage.removeItem(scopedKey);
        window.location.replace('/login');
      }
      return;
    }
    const result=await res.json();
    const user=result?.user;
    if(!result?.success || !user || user.role!==expectedRole ||
      (isVip && user.folder!==isVip[1])){
      // A mistaken URL or a wrong role must not erase another role's credentials.
      window.location.replace('/login');
      return;
    }
    // One-time migration from legacy token to namespaced token.
    if(localStorage.getItem(scopedKey)!==token)localStorage.setItem(scopedKey,token);
  }catch(e){
    // Avoid localStorage.clear() and redirect loops on offline/network failures.
    console.warn('[ImamSales Session] Pemeriksaan server sementara gagal:',e?.name||'network');
  }
})();
