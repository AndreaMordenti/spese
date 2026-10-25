/* Foto degli scontrini e tag delle spese.
   Le foto stanno sul dispositivo (IndexedDB) e su Google Drive come file a parte (receipt-<id>.jpg nella cartella
   privata dell'app); la spesa conserva solo il riferimento. Così il file dei dati resta leggero. */
'use strict';

const RDB = {
  mem: {}, // in modalità demo le foto restano solo in memoria
  open() {
    if (this.p) return this.p;
    this.p = new Promise((res, rej) => { const r = indexedDB.open('slow-receipts', 1); r.onupgradeneeded = () => r.result.createObjectStore('img'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    return this.p;
  },
  async get(id) { if (DEMO) return this.mem[id] || null; const db = await this.open(); return new Promise(res => { const q = db.transaction('img').objectStore('img').get(id); q.onsuccess = () => res(q.result || null); q.onerror = () => res(null); }); },
  async put(id, data) { if (DEMO) { this.mem[id] = data; return; } const db = await this.open(); return new Promise((res, rej) => { const t = db.transaction('img', 'readwrite'); t.objectStore('img').put(data, id); t.oncomplete = res; t.onerror = () => rej(t.error); }); },
};

// ---------- Inserimento ----------
async function receiptAttach(file) {
  if (!file) return;
  try {
    const data = await resizeImage(file, 1400, 0.72), id = 'rc-' + uid();
    await RDB.put(id, data); draft.receipt = id; draft.receiptNew = true; toast('Scontrino allegato'); route();
  } catch (e) { toast('Foto non salvata: ' + (e.message || e), 3500); }
}
async function receiptShow(id, editable) {
  sheet(`<div class="row between"><span style="font-weight:800;font-size:18px">Scontrino</span><button class="chip" onclick="closeSheet()" aria-label="Chiudi">${svg('x', 16, 2.5)}</button></div><div id="rc-img" class="empty">Carico la foto…</div>
    ${editable ? `<button class="btn danger sm" onclick="draft.receipt=null;draft.receiptNew=false;closeSheet();route()">Togli lo scontrino da questa spesa</button>` : ''}`);
  let data = await RDB.get(id);
  if (!data && Drive.on()) { try { data = await receiptFromDrive(id); } catch (e) { /* offline o file mancante */ } }
  const box = $('#rc-img'); if (!box) return;
  box.outerHTML = data ? `<img src="${data}" alt="Scontrino" style="width:100%;border-radius:var(--r-m)">` : `<div class="empty">Foto non disponibile su questo dispositivo${Drive.on() ? ' né su Drive' : ': collega Google Drive per vederla anche qui'}.</div>`;
}

// ---------- Tag ----------
const allTags = () => { const c = {}; live(S.expenses).forEach(e => (e.tags || []).forEach(t => { c[t] = (c[t] || 0) + 1; })); return Object.keys(c).sort((a, b) => c[b] - c[a]); };
function tagToggle(t) { t = String(t || '').trim().toLowerCase().replace(/^#/, '').replace(/\s+/g, '-'); if (!t) return; draft.tags = draft.tags || []; draft.tags = draft.tags.includes(t) ? draft.tags.filter(x => x !== t) : [...draft.tags, t]; }
function tagSheet() {
  const draw = () => {
    const cur = draft.tags || [], sug = [...new Set([...allTags(), 'lavoro', 'rimborsabile', 'garanzia', 'regalo', 'vacanza'])];
    $('#tag-body').innerHTML = `<div class="row" style="flex-wrap:wrap;gap:8px">${sug.map(t => `<button class="chip ${cur.includes(t) ? 'on' : ''}" onclick="tagToggle('${esc(t)}');tagSheet.draw()">#${esc(t)}</button>`).join('')}</div>`;
  };
  tagSheet.draw = draw;
  sheet(`<div class="row between"><span style="font-weight:800;font-size:18px">Tag</span><button class="chip on" onclick="closeSheet();route()">Fatto</button></div>
    <div class="search-box">${svg('tag', 18)}<input id="tag-q" type="text" placeholder="Nuovo tag e Invio" autocomplete="off" onkeydown="if(event.key==='Enter'){tagToggle(this.value);this.value='';tagSheet.draw()}"></div>
    <div id="tag-body"></div><span class="hint">Usa i tag per ritrovare spese con uno scopo comune: da rimborsare, in garanzia, di un viaggio… In Esplora puoi cercarli.</span>`);
  draw();
}
// Riga sotto la nota nella schermata di inserimento: scontrino e tag.
function receiptTagRow() {
  const tags = draft.tags || [];
  return `<div class="row" style="gap:8px;overflow-x:auto;scrollbar-width:none">
    ${draft.receipt ? `<button class="chip on" onclick="receiptShow('${draft.receipt}', true)">${svg('scan', 16)} Scontrino</button>`
      : `<label class="chip" style="cursor:pointer;flex-shrink:0">${svg('camera', 16)} Scontrino<input type="file" accept="image/*" class="hidden" onchange="receiptAttach(this.files[0])"></label>`}
    ${tags.map(t => `<button class="chip" style="flex-shrink:0" onclick="tagToggle('${esc(t)}');route()">#${esc(t)} ✕</button>`).join('')}
    <button class="chip" style="flex-shrink:0;color:var(--accent)" onclick="tagSheet()">${svg('tag', 16)} ${tags.length ? '+' : 'Tag'}</button>
  </div>`;
}

// ---------- Google Drive ----------
// Carica le foto nuove come file a parte; le scarica quando servono su un altro dispositivo.
async function receiptsSync() {
  const pend = (S.meta.rcptPending || []).slice(); if (!pend.length) return;
  for (const id of pend) {
    const data = await RDB.get(id); if (!data) { S.meta.rcptPending = S.meta.rcptPending.filter(x => x !== id); continue; }
    const blob = await (await fetch(data)).blob(), body = new FormData();
    body.append('metadata', new Blob([JSON.stringify({ name: `receipt-${id}.jpg`, parents: ['appDataFolder'], mimeType: 'image/jpeg' })], { type: 'application/json' }));
    body.append('file', blob);
    await Drive.api('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', { method: 'POST', body });
    S.meta.rcptPending = S.meta.rcptPending.filter(x => x !== id);
  }
  save(false);
}
async function receiptFromDrive(id) {
  await Drive.ensureToken();
  const q = await (await Drive.api(`https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=name%3D%27receipt-${id}.jpg%27&fields=files(id)`)).json();
  const fid = q.files && q.files[0] && q.files[0].id; if (!fid) return null;
  const blob = await (await Drive.api(`https://www.googleapis.com/drive/v3/files/${fid}?alt=media`)).blob();
  const data = await new Promise(res => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(blob); });
  await RDB.put(id, data); return data;
}
