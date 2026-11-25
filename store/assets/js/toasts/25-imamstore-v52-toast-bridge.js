(() => {
  'use strict';

  // Fallback global dan bridge event. checkout/33 mengganti fungsi global ini
  // saat elemen keranjang serta checkout tersedia; jangan putuskan bridge-nya.
  let timer = null, toast = null;

  function ensure() {
    if (toast?.isConnected) return toast;
    toast = document.createElement('div');
    toast.id = 'imamstoreActiveToast';
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');
    Object.assign(toast.style, {
      position: 'fixed',
      left: '50%',
      top: 'max(16px,env(safe-area-inset-top))',
      transform: 'translateX(-50%)',
      maxWidth: 'min(90vw,390px)',
      minWidth: '160px',
      boxSizing: 'border-box',
      padding: '12px 18px',
      borderRadius: '14px',
      background: '#222',
      color: '#fff',
      font: '600 14px/1.4 Poppins,sans-serif',
      textAlign: 'center',
      boxShadow: '0 10px 30px rgba(0,0,0,.25)',
      zIndex: '2147483646',
      pointerEvents: 'none',
      opacity: '0',
      transition: 'opacity .18s ease'
    });
    document.body.appendChild(toast);
    return toast;
  }

  window.imamstoreToast = function(message, type = 'info') {
    const el = ensure();
    clearTimeout(timer);
    el.textContent = String(message ?? '');
    el.style.background = type === 'error' ? '#b42318' : type === 'success' ? '#287d38' : '#222';
    el.style.opacity = '1';
    timer = setTimeout(() => { el.style.opacity = '0'; }, 2200);
  };

  // Feedback tambah keranjang khusus: tidak dibatasi host detail/keranjang aktif.
  // Pertahankan imamstoreToast untuk modul lama dan validasi checkout.
  let addFeedbackTimer = 0;
  window.imamstoreCartAddFeedback = function(result) {
    const ok = result?.ok === true;
    const title = String(result?.message || (ok ? 'Berhasil ditambahkan ke keranjang' : 'Gagal menambahkan ke keranjang'));
    if (typeof window.Swal?.fire === 'function') {
      return window.Swal.fire({
        toast: true,
        position: 'top',
        icon: ok ? 'success' : 'error',
        title,
        showConfirmButton: false,
        timer: ok ? 1900 : 2600,
        timerProgressBar: true,
        width: 'min(92vw,380px)',
        customClass: {
          container: 'imamstore-cart-add-container',
          popup: 'imamstore-cart-add-toast'
        }
      });
    }
    // Fallback jika SweetAlert2 CDN belum dimuat: elemen toast root, bukan scoped host.
    const el = document.getElementById('toast');
    if (el) {
      clearTimeout(addFeedbackTimer);
      el.textContent = title;
      el.classList.remove('success', 'error', 'info', 'warning');
      el.classList.add(ok ? 'success' : 'error', 'show');
      addFeedbackTimer = setTimeout(() => el.classList.remove('show'), ok ? 1900 : 2600);
    } else console.warn('ImamStore cart feedback:', title);
  };

  // Late binding sengaja: event menuju imamstoreToast terbaru (checkout/33).
  document.addEventListener('imamstore:toast', e =>
    window.imamstoreToast(e.detail?.message, e.detail?.type)
  );
  document.addEventListener('imamstore:open-product', () => {
    if (toast) toast.style.opacity = '0';
  });
})();
