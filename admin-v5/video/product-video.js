/* ImamStore R37 — Media Produk CMS (Admin V5 Seller Center).
 * This script runs inside the existing same-origin Seller Center srcdoc iframe.
 * Uses its existing `draft`, `markDirty`, `renderEditor` and `saveProduct` lifecycle.
 * Does NOT create separate Firebase clients, collections or write paths.
 */
(function () {
  'use strict';
  if (window.__imamstoreR37VideoInstalled) return;
  if (typeof window.renderEditor !== 'function' || typeof window.saveProduct !== 'function') {
    console.warn('[ImamStore R37] Seller Center editor belum siap.');
    return;
  }
  window.__imamstoreR37VideoInstalled = true;

  const STORE_ORIGIN = 'https://store.imamsales.com';
  const MAX_VIDEOS = 8; // Matches R36 gallery consumption.
  const SCRIPT_URL = '/admin-v5/video/product-video.css';
  const css = document.createElement('link');
  css.rel = 'stylesheet';
  css.href = SCRIPT_URL;
  document.head.appendChild(css);

  function activeDraft() {
    try { return typeof draft !== 'undefined' ? draft : null; }
    catch (_) { return null; }
  }
  function markChanged() { if (typeof markDirty === 'function') markDirty(); }
  function videosOf(p) {
    const input = p?.videoProduk;
    const list = Array.isArray(input) ? input : input ? [input] : [];
    return list.map(entry => typeof entry === 'string' ? {url: entry, poster: '', judul: ''}
      : entry && typeof entry === 'object' && !Array.isArray(entry) ? {...entry} : {url:'',poster:'',judul:''});
  }
  function normalizePath(value, kind) {
    let v = String(value || '').trim().replace(/\\/g, '/');
    if (!v) return '';
    if (/^https?:\/\//i.test(v)) return v;
    // File Manager uses store/videos/produk/, while its PUBLIC path is /videos/produk/.
    if (kind === 'video' && /^\/?store\/videos\//i.test(v)) v=v.replace(/^\/?store\/videos\//i,'videos/');
    if (kind === 'poster' && /^\/?store\/images\//i.test(v)) v=v.replace(/^\/?store\/images\//i,'images/');
    return v.startsWith('/') ? v : '/' + v;
  }
  function mediaURL(value, kind) {
    const v = normalizePath(value, kind);
    if (!v || v.length > 1800) return null;
    try {
      const u = new URL(v, STORE_ORIGIN + '/');
      if (u.protocol !== 'https:') return null;
      if (kind === 'video' && !/\.(mp4|webm)$/i.test(u.pathname)) return null;
      if (kind === 'poster' && !/\.(jpg|jpeg|png|webp|avif)$/i.test(u.pathname)) return null;
      return u.href;
    } catch (_) { return null; }
  }
  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  }
  function field(labelText, val, index, key, placeholder, hint) {
    const wrap=el('label','r37-field');
    wrap.appendChild(el('span','r37-label',labelText));
    const input=el('input','r37-input');
    input.type='text';
    input.value=String(val || '');
    input.placeholder=placeholder;
    input.autocomplete='off';
    input.dataset.r37Index=String(index);
    input.dataset.r37Key=key;
    wrap.append(input);
    if (hint) wrap.append(el('small','r37-hint',hint));
    return wrap;
  }
  function showStatus(card, message, bad=false) {
    const s=card.querySelector('.r37-status');
    if (!s) return;
    s.textContent=message;
    s.classList.toggle('r37-error',bad);
  }
  function renderSection(card) {
    const p=activeDraft();
    if (!p || !card?.isConnected) return;
    card.replaceChildren();
    const heading=el('h3','', '🎬 Video Produk R37');
    card.append(heading);
    const body=el('div','r37-body');
    const note=el('p','r37-note', 'Video di galeri utama dan kartu Video Terkait dibaca dari CMS produk ini. Simpan URL MP4/WebM; file video fisik diunggah lewat Git/Netlify, bukan form ini.');
    body.append(note);
    const type=el('label','r37-field r37-type');
    type.append(el('span','r37-label','TIPE PRODUK (untuk video terkait)'));
    const typeInput=el('input','r37-input');
    typeInput.type='text'; typeInput.id='r37ProductType';
    typeInput.value=String(p.tipeProduk || '');
    typeInput.placeholder='Contoh: RELAY 5 PIN';
    typeInput.autocomplete='off';
    typeInput.dataset.r37Type='1';
    type.append(typeInput);
    type.append(el('small','r37-hint','Gunakan teks tipe yang SAMA pada produk-produk berkaitan. Bila kosong, R36 akan mencoba kategori produk.'));
    body.append(type);

    const list=videosOf(p);
    const counts=el('div','r37-count',`${list.length} / ${MAX_VIDEOS} video produk`);
    body.append(counts);
    const rows=el('div','r37-list');
    list.forEach((item,index)=>{
      const box=el('div','r37-video-item');
      const head=el('div','r37-item-head');
      head.append(el('strong','',`Video ${index+1}`));
      const actions=el('div','r37-actions');
      for (const [action,title,disabled] of [
        ['up','↑',index===0], ['down','↓',index===list.length-1],['remove','Hapus',false]]) {
        const btn=el('button','r37-btn r37-btn-secondary',title);
        btn.type='button';btn.dataset.r37Action=action;btn.dataset.r37Index=String(index);
        btn.disabled=disabled;
        btn.setAttribute('aria-label',action==='remove'?`Hapus video ${index+1}`:`Geser video ${index+1} ${action}`);
        actions.append(btn);
      }
      head.append(actions);box.append(head);
      const grid=el('div','r37-grid');
      grid.append(field('URL VIDEO',item.url||item.src||'',index,'url','/videos/produk/RELAY-5PIN-DEMO.mp4','Folder fisik: store/videos/produk/'));
      grid.append(field('THUMBNAIL / POSTER',item.poster||item.thumbnail||'',index,'poster','/images/produk/RELAY-5PIN-VIDEO-COVER.jpg','Opsional. Jika kosong, R36 memakai foto utama produk.'));
      grid.append(field('JUDUL VIDEO',item.judul||item.title||'',index,'judul','Demo pemasangan relay 5 pin','Ditampilkan pada kartu video terkait.'));
      box.append(grid);
      const check=el('div','r37-verify');
      const videoButton=el('button','r37-btn r37-btn-secondary','Cek URL Video');
      videoButton.type='button';videoButton.dataset.r37Action='check-video';videoButton.dataset.r37Index=String(index);
      const posterButton=el('button','r37-btn r37-btn-secondary','Cek Poster');
      posterButton.type='button';posterButton.dataset.r37Action='check-poster';posterButton.dataset.r37Index=String(index);
      check.append(videoButton,posterButton);box.append(check);
      rows.append(box);
    });
    body.append(rows);
    const add=el('button','r37-btn r37-btn-add','+ Tambah Video');
    add.type='button';add.dataset.r37Action='add';add.disabled=list.length>=MAX_VIDEOS;
    body.append(add);
    const status=el('div','r37-status');status.setAttribute('role','status');status.setAttribute('aria-live','polite');body.append(status);
    card.append(body);
  }
  function mount() {
    const p=activeDraft();
    const editor=document.getElementById('editor');
    if (!p || !editor) return;
    const grid=editor.querySelector('.grid');
    if (!grid) return;
    let card=editor.querySelector('.r37-video-card');
    if (!card) {
      card=el('section','card full r37-video-card');
      // Keep the module next to the original photo gallery editor.
      const gallery=[...grid.querySelectorAll('.card > h3')].find(n=>n.textContent.trim()==='Gallery Gambar')?.closest('.card');
      if (gallery) gallery.after(card);
      else grid.append(card);
      card.addEventListener('input',onInput);
      card.addEventListener('change',onChange);
      card.addEventListener('click',onClick);
    }
    renderSection(card);
  }
  function onInput(e) {
    const target=e.target;
    if (!(target instanceof HTMLInputElement)) return;
    const p=activeDraft(); if (!p) return;
    if (target.dataset.r37Type) {
      p.tipeProduk=target.value;
      markChanged();
      return;
    }
    const i=Number(target.dataset.r37Index),key=target.dataset.r37Key;
    if (!Number.isSafeInteger(i) || i<0 || !['url','poster','judul'].includes(key))return;
    const entries=videosOf(p);if (!entries[i])return;
    entries[i][key]=target.value;
    if (key==='url') delete entries[i].src;
    if (key==='poster') delete entries[i].thumbnail;
    if (key==='judul') delete entries[i].title;
    p.videoProduk=entries;
    markChanged();
  }
  function onChange(e) {
    const target=e.target;
    if (!(target instanceof HTMLInputElement) || !['url','poster'].includes(target.dataset.r37Key)) return;
    const p=activeDraft(); if (!p) return;
    const i=Number(target.dataset.r37Index), key=target.dataset.r37Key;
    const entries=videosOf(p);if (!entries[i])return;
    const v=normalizePath(target.value,key==='url'?'video':'poster');
    if (target.value!==v) {
      target.value=v;
      entries[i][key]=v;
      p.videoProduk=entries;
      markChanged();
    }
  }
  function onClick(e) {
    const button=e.target.closest('button[data-r37-action]');
    if (!button) return;
    const p=activeDraft();if (!p)return;
    const card=button.closest('.r37-video-card');
    const op=button.dataset.r37Action;
    const list=videosOf(p);
    const i=Number(button.dataset.r37Index);
    if (op==='add') {
      if (list.length>=MAX_VIDEOS) {showStatus(card,'Maksimal 8 video per produk.',true);return;}
      list.push({url:'',poster:'',judul:''});
      p.videoProduk=list;markChanged();renderSection(card);
    } else if (op==='remove' && list[i]) {
      list.splice(i,1);p.videoProduk=list;markChanged();renderSection(card);
    } else if ((op==='up'||op==='down') && list[i]) {
      const j=i+(op==='up'?-1:1);
      if (j<0||j>=list.length)return;
      [list[i],list[j]]=[list[j],list[i]];
      p.videoProduk=list;markChanged();renderSection(card);
    } else if ((op==='check-video'||op==='check-poster') && list[i]) {
      const key=op==='check-video'?'video':'poster';
      const source=key==='video'?list[i].url||list[i].src:list[i].poster||list[i].thumbnail;
      const url=mediaURL(source,key);
      if (!url) {showStatus(card,`URL ${key} belum valid.`,true);return;}
      // Open on the SAME host used by R36, not the Admin site.
      window.open(url,'_blank','noopener,noreferrer');
      showStatus(card,'Tab baru dibuka. Pastikan media tampil dan tidak 404.');
    }
  }
  function validateBeforePublish() {
    const p=activeDraft();if (!p)return true;
    const list=videosOf(p);
    let error='';
    if (list.length>MAX_VIDEOS)error=`Maksimal ${MAX_VIDEOS} video per produk.`;
    const seen=new Set();
    if (!error) for (let i=0;i<list.length;i++) {
      const entry=list[i];
      const url=mediaURL(entry.url||entry.src,'video');
      if (!url) {error=`Video ${i+1}: isi URL MP4/WebM HTTPS atau path /videos/produk/... yang valid.`;break;}
      if (seen.has(url)){error=`Video ${i+1}: URL video duplikat.`;break;}
      seen.add(url);
      if ((entry.poster||entry.thumbnail) && !mediaURL(entry.poster||entry.thumbnail,'poster')) {
        error=`Video ${i+1}: poster harus JPG/PNG/WebP/AVIF HTTPS atau path /images/...`;break;
      }
      if (String(entry.judul||entry.title||'').length>140){error=`Video ${i+1}: judul maksimal 140 karakter.`;break;}
    }
    if (String(p.tipeProduk||'').length>100)error='Tipe produk maksimal 100 karakter.';
    if (!error) {
      // Publishing may be triggered before the URL field loses focus (onchange).
      // Persist PUBLIC paths, never the physical store/videos/... file-system path.
      if (list.length) {
        const normalized=list.map(entry=>({
          ...entry,
          ...(entry.url ? {url:normalizePath(entry.url,'video')} : {}),
          ...(entry.src ? {src:normalizePath(entry.src,'video')} : {}),
          ...(entry.poster ? {poster:normalizePath(entry.poster,'poster')} : {}),
          ...(entry.thumbnail ? {thumbnail:normalizePath(entry.thumbnail,'poster')} : {})
        }));
        if (JSON.stringify(p.videoProduk)!==JSON.stringify(normalized)) {
          p.videoProduk=normalized;
          markChanged();
        }
      }
      return true;
    }
    const card=document.querySelector('.r37-video-card');
    if(card){showStatus(card,error,true);card.scrollIntoView({behavior:'smooth',block:'center'});}
    const saveState=document.getElementById('saveState');if(saveState)saveState.textContent=error;
    console.warn('[ImamStore R37] Publish dibatalkan:',error);
    return false;
  }

  const oldRender=window.renderEditor;
  window.renderEditor=function(...args) {const result=oldRender.apply(this,args);mount();return result;};
  const oldSave=window.saveProduct;
  window.saveProduct=function(...args) {if(!validateBeforePublish())return Promise.resolve();return oldSave.apply(this,args);};
  if (activeDraft() && document.getElementById('editor')) mount();
  window.imamstoreR37Video={version:'R37-product-cms-video',normalizePath,mediaURL,validateBeforePublish};
})();
