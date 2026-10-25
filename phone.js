/* Diario → Telefono: quanto e come usi il telefono, e se ti toglie tempo alle attività.
   I numeri li legge l'app Android (permesso "Accesso ai dati di utilizzo"); si salvano un giorno per riga,
   senza contenuti, e arrivano su Drive come il resto. Il test dell'ora viene dal protocollo di Arthur Brooks:
   metti via il telefono per un'ora e conta quante volte ci pensi; più di una volta ogni 5 minuti è un campanello. */
'use strict';

const PT_KEY = 'slow.phoneTest', PT_LIMIT = 12; // 60 minuti / 5
const phoneDays = () => live(S.phone || []).sort((a, b) => a.date < b.date ? -1 : 1);
const fmtMin = m => m >= 60 ? `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m` : `${m} min`;
let phoneAccess = null;

// Legge gli ultimi giorni dal telefono e aggiorna solo quelli cambiati.
async function phonePull() {
  const W = Native.plugin('SlowWidget'); if (!W || DEMO) return;
  try { phoneAccess = (await W.usageAccess()).granted; } catch (e) { phoneAccess = false; }
  if (!phoneAccess) return;
  let items = []; try { items = (await W.usageDays({ days: phoneDays().length ? 3 : 30 })).items || []; } catch (e) { return; }
  let changed = 0; const now = Date.now();
  items.forEach(it => {
    const cur = (S.phone || []).find(x => x.id === it.date);
    const rec = { id: it.date, date: it.date, screenMin: it.screenMin, unlocks: it.unlocks, first: it.first, last: it.last, lateMin: it.lateMin, apps: it.apps || [] };
    if (cur && JSON.stringify({ ...cur, updatedAt: 0 }) === JSON.stringify({ ...rec, updatedAt: 0 })) return;
    if (cur) Object.assign(cur, rec, { updatedAt: now, deleted: false }); else S.phone.push({ ...rec, updatedAt: now });
    changed++;
  });
  if (changed) { save(); if (location.hash === '#diario') route(); }
}
async function phoneEnable() {
  const W = Native.plugin('SlowWidget'); if (!W) return;
  await W.openUsageAccess();
  toast('Attiva Slow nell\'elenco, poi torna qui', 3500);
}

// ---------- Test dell'ora ----------
const ptCur = () => { try { return JSON.parse(localStorage.getItem(PT_KEY) || 'null'); } catch (e) { return null; } };
const ptSet = v => { try { v ? localStorage.setItem(PT_KEY, JSON.stringify(v)) : localStorage.removeItem(PT_KEY); } catch (e) { /* niente */ } };
function ptStart() { ptSet({ start: Date.now(), count: 0 }); route(); }
function ptPlus() { const t = ptCur(); if (!t) return; t.count++; ptSet(t); if (navigator.vibrate) navigator.vibrate(15); route(); }
function ptStop(save_ = true) {
  const t = ptCur(); ptSet(null); if (!t) return route();
  const mins = Math.min(60, Math.round((Date.now() - t.start) / 60000));
  if (save_ && mins >= 10) { S.phoneTests.push({ id: uid(), date: todayISO(), count: t.count, mins, updatedAt: Date.now() }); save(); toast(`Test salvato: ${t.count} volte in ${mins} min`); }
  else if (save_) toast('Test troppo breve: serve almeno 10 minuti');
  route();
}
let ptTimer = null;
function ptTick() {
  clearInterval(ptTimer);
  ptTimer = setInterval(() => {
    const t = ptCur(), el = $('#pt-left'); if (!t || !el) return clearInterval(ptTimer);
    const left = 60 - Math.floor((Date.now() - t.start) / 60000);
    if (left <= 0) { clearInterval(ptTimer); ptStop(); return; }
    el.textContent = `${left} min rimasti`;
  }, 15000);
}
function ptCard() {
  const t = ptCur(), last = live(S.phoneTests || []).sort((a, b) => (a.date < b.date ? 1 : -1))[0];
  if (t) {
    const left = Math.max(0, 60 - Math.floor((Date.now() - t.start) / 60000)); setTimeout(ptTick, 0);
    if (!left) setTimeout(() => ptStop(), 0);
    return `<div class="col" style="gap:10px;align-items:center;text-align:center">
      <span class="small muted" id="pt-left">${left} min rimasti</span>
      <span class="num" style="font-size:44px;font-weight:800;color:${t.count > PT_LIMIT ? 'var(--warn)' : 'inherit'}">${t.count}</span>
      <span class="small muted">volte che hai pensato al telefono</span>
      <button class="btn primary" style="width:100%" onclick="ptPlus()">+ Ci ho pensato</button>
      <div class="row" style="gap:8px;width:100%"><button class="btn sm grow" onclick="ptStop()">Termina e salva</button><button class="btn sm grow" onclick="ptStop(false)">Annulla</button></div>
    </div>`;
  }
  const per = last ? last.count * 60 / Math.max(last.mins, 1) : 0;
  return `<span class="small" style="line-height:1.5">Metti via il telefono per un'ora. Ogni volta che ti viene in mente, tocca +. Più di ${PT_LIMIT} volte in un'ora (una ogni 5 minuti) vuol dire che il telefono ti sta togliendo concentrazione.</span>
    ${last ? `<span class="small muted">Ultimo test: <b>${last.count} volte in ${last.mins} min</b> (${fmtDate(last.date)}). ${per > PT_LIMIT ? '<span style="color:var(--warn)">Sopra la soglia.</span>' : 'Sotto la soglia.'}</span>` : ''}
    <button class="btn sm" onclick="ptStart()">Inizia il test · 60 min</button>`;
}

// ---------- Curiosità ----------
function phoneFacts(days, habits) {
  const today = todayISO(), r30 = days.filter(d => d.date >= addDays(today, -30) && d.date < today), p30 = days.filter(d => d.date >= addDays(today, -60) && d.date < addDays(today, -30));
  if (r30.length < 7) return [];
  const avg = a => a.reduce((s, d) => s + d.unlocks, 0) / a.length, facts = [];
  const med = [...r30].sort((a, b) => a.unlocks - b.unlocks)[Math.floor(r30.length / 2)].unlocks;
  const low = r30.filter(d => d.unlocks < med), high = r30.filter(d => d.unlocks >= med);
  // Per ogni attività: quante volte la fai nei giorni con pochi sblocchi rispetto agli altri. Mostra le due differenze più grandi.
  if (low.length >= 3 && high.length >= 3) {
    const rate = (h, a) => a.filter(d => isDone(h.id, d.date)).length / a.length;
    habits.map(h => ({ h, a: rate(h, low), b: rate(h, high) })).filter(x => Math.abs(x.a - x.b) >= 0.15).sort((x, y) => Math.abs(y.a - y.b) - Math.abs(x.a - x.b)).slice(0, 2)
      .forEach(x => facts.push(`Nei giorni con meno di ${med} sblocchi hai fatto <b>${esc(x.h.name)} il ${Math.round(x.a * 100)}%</b> delle volte, contro il ${Math.round(x.b * 100)}% degli altri giorni.`));
  }
  const late = r30.filter(d => d.lateMin >= 5);
  if (late.length) {
    const after = new Set(late.map(d => d.date)), rest = r30.filter(d => !after.has(d.date));
    const read = habits.map(h => ({ h, a: late.filter(d => isDone(h.id, d.date)).length / late.length, b: rest.length ? rest.filter(d => isDone(h.id, d.date)).length / rest.length : 0 })).sort((x, y) => (y.b - y.a) - (x.b - x.a))[0];
    facts.push(`Hai usato il telefono dopo mezzanotte <b>${late.length} notti su ${r30.length}</b>${read && read.b - read.a >= 0.15 ? `; il giorno dopo ${esc(read.h.name)} scende dal ${Math.round(read.b * 100)}% al ${Math.round(read.a * 100)}%` : ''}.`);
  }
  if (p30.length >= 7) { const a = avg(r30), b = avg(p30), d = (a - b) / b * 100; facts.push(`Sblocchi medi: <b>${Math.round(a)} al giorno</b>, ${Math.abs(d) < 3 ? 'come il mese prima' : `<span style="color:${d < 0 ? 'var(--accent)' : 'var(--warn)'}">${d > 0 ? '+' : '−'}${Math.abs(Math.round(d))}%</span> rispetto al mese prima`}.`); }
  else facts.push(`Sblocchi medi: <b>${Math.round(avg(r30))} al giorno</b> negli ultimi ${r30.length} giorni.`);
  return facts;
}

// ---------- Sezione del Diario ----------
function phoneSection(habits) {
  const days = phoneDays(), d = days.filter(x => x.date <= diaryDate).pop();
  if (!days.length && !Native.on) return ''; // sul web compare solo se l'app Android ha già mandato dati
  let body;
  if (!days.length) {
    if (phoneAccess === null) setTimeout(phonePull, 0);
    body = `<span class="small" style="line-height:1.5">Slow può leggere dal telefono quanto lo usi: tempo di schermo, sblocchi, primo e ultimo uso, app più usate. Restano solo numeri per giorno, niente contenuti.</span>
      <button class="btn sm primary" onclick="phoneEnable()">Consenti l'accesso ai dati di utilizzo</button>`;
  } else {
    const isToday = d && d.date === todayISO(), gap = d ? Math.round(d.screenMin / Math.max(d.unlocks, 1)) : 0;
    const w7 = days.filter(x => x.date > addDays(diaryDate, -7) && x.date <= diaryDate), maxU = Math.max(1, ...w7.map(x => x.unlocks));
    const facts = phoneFacts(days, habits);
    body = !d ? '<div class="empty">Nessun dato per questo giorno.</div>' : `
      <span class="small muted">${isToday ? 'Oggi, finora' : fmtDate(d.date)}</span>
      <div class="ex-kpis">
        <div class="stat"><span class="v num">${fmtMin(d.screenMin)}</span><span class="small muted">di schermo</span></div>
        <div class="stat"><span class="v num" style="color:${d.unlocks > 80 ? 'var(--warn)' : 'inherit'}">${d.unlocks}</span><span class="small muted">sblocchi</span></div>
        <div class="stat"><span class="v num">${gap} min</span><span class="small muted">per sblocco</span></div>
        <div class="stat"><span class="v num">${d.first || '–'}<span class="small muted"> / ${d.last || '–'}</span></span><span class="small muted">primo sblocco / ultimo uso</span></div>
      </div>
      ${d.lateMin ? `<span class="small" style="color:var(--warn)">${d.lateMin} min di telefono tra mezzanotte e le 5.</span>` : ''}
      <div class="col" style="gap:6px"><span class="small muted">Sblocchi, ultimi 7 giorni</span><div class="bars" style="height:72px;gap:6px">${w7.map(x => `<div><span class="small muted num">${x.unlocks}</span><div class="b" style="height:${Math.max(2, Math.round(x.unlocks / maxU * 100))}%;background:${x.date === d.date ? 'var(--accent)' : 'var(--surface-3)'}"></div><span class="small muted">${WEEKDAYS[(new Date(x.date + 'T12:00:00').getDay() + 6) % 7].slice(0, 1).toUpperCase()}</span></div>`).join('')}</div></div>
      ${(d.apps || []).length ? `<div class="col" style="gap:4px"><span class="small muted">App più usate</span>${d.apps.slice(0, 3).map(a => `<div class="row between small"><span class="truncate">${esc(a.n)}</span><span class="num muted">${fmtMin(a.min)} · ${a.opens} aperture</span></div>`).join('')}</div>` : ''}
      ${facts.length ? `<div class="col" style="gap:8px"><span style="font-weight:800">Curiosità · ultimi 30 giorni</span>${facts.map(f => `<span class="small" style="line-height:1.5">• ${f}</span>`).join('')}</div>` : ''}`;
  }
  return `<div class="col" style="gap:10px"><span class="section-title">Telefono</span>
    <div class="card col" style="gap:12px">${body}</div>
    <div class="card col" style="gap:10px"><span style="font-weight:800">Test dell'ora</span>${ptCard()}</div></div>`;
}
