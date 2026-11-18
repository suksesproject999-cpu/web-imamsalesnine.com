// ImamSales R25: independent Netlify sessions for VIP and Admin.
// Paths and JSON contracts remain identical to the legacy login.js.
async function login(){
  const params = new URLSearchParams(window.location.search);
  const target = params.get('target') === 'product' ? 'product' : '';
  const username = document.getElementById('username').value;
  const password = document.getElementById('password').value;
  const error = document.getElementById('error');
  const loading = document.getElementById('loading');
  const card = document.getElementById('card');
  error.textContent = '';
  loading.style.display = 'block';
  try {
    const res = await fetch('/.netlify/functions/login', {
      method:'POST', headers:{'Content-Type':'application/json'},
      cache:'no-store', body:JSON.stringify({username,password,target})
    });
    const data = await res.json();
    loading.style.display = 'none';
    if (res.ok && data.success && typeof data.token === 'string') {
      let next;
      if (data.role === 'vip') {
        if (typeof data.folder !== 'string' || !/^[a-z0-9][a-z0-9-]{1,64}$/.test(data.folder))
          throw new Error('Folder VIP tidak valid.');
        localStorage.setItem('imamsales:session:vip:' + data.folder, data.token);
        // Do NOT overwrite legacy token/role: Admin V5 may be signed in simultaneously.
        next = '/vip/' + encodeURIComponent(data.folder);
      } else if (data.role === 'admin') {
        localStorage.setItem('imamsales:session:admin', data.token);
        localStorage.setItem('token', data.token); // legacy Admin V5 compatibility
        localStorage.setItem('role', 'admin');
        next = '/admin';
      } else if (data.role === 'product_admin') {
        localStorage.setItem('imamsales:session:product_admin', data.token);
        localStorage.setItem('token', data.token); // legacy Product Admin compatibility
        localStorage.setItem('role','product_admin');
        next = '/adminb.html';
      } else {
        throw new Error('Role akun tidak dikenal.');
      }
      card.classList.add('success');
      setTimeout(()=>{window.location.href=next},500);
    } else {
      card.classList.add('shake');
      setTimeout(()=>card.classList.remove('shake'),300);
      error.textContent = data.message || 'Login gagal';
    }
  } catch(err) {
    loading.style.display = 'none';
    error.textContent = err?.message === 'Folder VIP tidak valid.' || err?.message === 'Role akun tidak dikenal.'
      ? err.message : 'Server tidak dapat dihubungi';
  }
}
document.getElementById('password').addEventListener('keydown', e=>{
  if(e.key==='Enter')login();
});
