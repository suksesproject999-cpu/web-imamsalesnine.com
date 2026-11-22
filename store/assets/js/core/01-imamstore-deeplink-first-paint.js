
/* Direct product links receive a dedicated first paint, never a briefly visible storefront. */
(()=>{try{const id=new URL(location.href).searchParams.get('product');if(id&&/^[A-Za-z0-9_-]{1,120}$/.test(id)){document.documentElement.classList.add('imamstore-deeplink-boot')}}catch(_){}})();
