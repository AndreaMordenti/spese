/* Spese: app personale di tracking spese e diario attività.
   Dati in locale (localStorage) e sincronizzati sulla cartella privata dell'app su Google Drive. */
'use strict';

// ---------- Utilità ----------
const $ = (sel, root = document) => root.querySelector(sel);
let _uidN = 0;
const uid = () => Date.now().toString(36) + (_uidN++).toString(36) + Math.random().toString(36).slice(2, 6);
const todayISO = () => localISO(new Date());
function localISO(d) { const t = new Date(d.getTime() - d.getTimezoneOffset() * 60000); return t.toISOString().slice(0, 10); }
function addDays(iso, n) { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return localISO(d); }
function monthKey(iso) { return iso.slice(0, 7); }
function fmtMoney(n, withCur = true) {
  const s = (Math.abs(n) || 0).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return withCur ? '€ ' + s : s;
}
function fmtInt(n) { return Math.round(n).toLocaleString('it-IT'); }
function fmtLong(iso, opts) { return new Date(iso + 'T12:00:00').toLocaleDateString('it-IT', opts); }
function fmtDate(iso, opts = { day: 'numeric', month: 'short' }) {
  if (!iso) return '';
  if (iso === todayISO()) return 'Oggi';
  if (iso === addDays(todayISO(), -1)) return 'Ieri';
  return new Date(iso + 'T12:00:00').toLocaleDateString('it-IT', opts);
}
function monthLabel(key) { const [y, m] = key.split('-'); const s = new Date(y, m - 1, 1).toLocaleDateString('it-IT', { month: 'long', year: 'numeric' }); return s[0].toUpperCase() + s.slice(1); }
function esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function toast(msg, ms = 2200) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), ms); }
function hexA(hex, a) { const n = parseInt(hex.slice(1), 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; }

// ---------- Icone (SVG inline) ----------
const I = {
  cart: '<path d="M6 6h15l-1.5 9h-12z"/><path d="M6 6 5 3H2"/><circle cx="9" cy="20" r="1"/><circle cx="18" cy="20" r="1"/>',
  food: '<path d="M3 11h18"/><path d="M12 11V4"/><path d="M5 11a7 7 0 0 1 14 0"/><path d="M4 15h16l-1 5H5z"/>',
  car: '<path d="M5 17h14v-5l-2-6H7l-2 6z"/><circle cx="8" cy="17" r="2"/><circle cx="16" cy="17" r="2"/>',
  home: '<path d="m3 11 9-8 9 8"/><path d="M5 10v10h14V10"/>',
  play: '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="m10 9 5 3-5 3z"/>',
  heart: '<path d="M12 21s-7-4.5-7-11a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 6.5-7 11-7 11z"/>',
  work: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M3 13h18"/>',
  tag: '<path d="M20 12 12 20 3 11V4h7z"/><circle cx="7.5" cy="7.5" r="1.5"/>',
  gift: '<rect x="3" y="8" width="18" height="13" rx="2"/><path d="M12 8v13"/><path d="M3 13h18"/><path d="M12 8c-2-4-6-4-6-1s4 1 6 1zm0 0c2-4 6-4 6-1s-4 1-6 1z"/>',
  book: '<path d="M4 19V5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 19a2 2 0 0 0 2 2h13"/><path d="M9 7h6"/>',
  dumbbell: '<path d="M6 5v14"/><path d="M18 5v14"/><path d="M3 8v8"/><path d="M21 8v8"/><path d="M6 12h12"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  run: '<circle cx="14" cy="4" r="2"/><path d="m8 21 3-6 3 2 2 4"/><path d="m6 12 4-3 3 1 3 3 3-1"/><path d="m11 9-1 5"/>',
  pen: '<path d="M4 20h4l10-10-4-4L4 16z"/><path d="m13 7 4 4"/>',
  plus: '<path d="M12 5v14"/><path d="M5 12h14"/>',
  check: '<path d="m5 12 5 5L20 7"/>',
  x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  back: '<path d="m15 18-6-6 6-6"/>',
  del: '<path d="M21 5H9l-6 7 6 7h12a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1z"/><path d="m18 9-6 6"/><path d="m12 9 6 6"/>',
  scan: '<path d="M4 8V5a1 1 0 0 1 1-1h3"/><path d="M16 4h3a1 1 0 0 1 1 1v3"/><path d="M20 16v3a1 1 0 0 1-1 1h-3"/><path d="M8 20H5a1 1 0 0 1-1-1v-3"/><path d="M3 12h18"/>',
  chart: '<path d="M4 20V10"/><path d="M10 20V4"/><path d="M16 20v-8"/><path d="M22 20H2"/>',
  diary: '<rect x="4" y="3" width="16" height="18" rx="3"/><path d="M8 8h8"/><path d="M8 12h8"/><path d="M8 16h5"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  trash: '<path d="M4 7h16"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M6 7l1 13h10l1-13"/><path d="M9 7V4h6v3"/>',
  camera: '<path d="M4 8h3l2-3h6l2 3h3v12H4z"/><circle cx="12" cy="13" r="3.5"/>',
  cloud: '<path d="M7 18a4 4 0 0 1-.5-8A6 6 0 0 1 18 9a4.5 4.5 0 0 1 0 9z"/>',
};
const svg = (name, size = 20, w = 2.2) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round">${I[name] || I.tag}</svg>`;
const CAT_ICONS = ['cart', 'food', 'car', 'home', 'play', 'heart', 'work', 'gift', 'book', 'tag'];
const HABIT_ICONS = ['dumbbell', 'book', 'clock', 'run', 'pen', 'heart', 'car', 'tag'];
const PALETTE = ['#7AD7F0', '#FFB36B', '#B59CFF', '#F2C94C', '#FF8FAB', '#6EE7B7', '#9AA0AE', '#F97373', '#60A5FA', '#FDBA74'];

// ---------- Stato ----------
const KEY = 'spese.v1';
const DEFAULT_ACCOUNTS = ['Carta', 'Contanti', 'Bancomat'];
const defaultCategories = () => [
  { id: 'spesa', name: 'Spesa', color: '#7AD7F0', icon: 'cart', budget: 500 },
  { id: 'ristoranti', name: 'Ristoranti', color: '#FFB36B', icon: 'food', budget: 250 },
  { id: 'trasporti', name: 'Trasporti', color: '#B59CFF', icon: 'car', budget: 200 },
  { id: 'casa', name: 'Casa', color: '#F2C94C', icon: 'home', budget: 600 },
  { id: 'svago', name: 'Svago', color: '#FF8FAB', icon: 'play', budget: 150 },
  { id: 'salute', name: 'Salute', color: '#6EE7B7', icon: 'heart', budget: 100 },
  { id: 'lavoro', name: 'Lavoro', color: '#9AA0AE', icon: 'work', budget: 0 },
  { id: 'altro', name: 'Altro', color: '#60A5FA', icon: 'tag', budget: 0 },
  { id: 'stipendio', name: 'Stipendio', color: '#6EE7B7', icon: 'work', budget: 0, kind: 'income' },
  { id: 'altre-entrate', name: 'Altre entrate', color: '#7AD7F0', icon: 'tag', budget: 0, kind: 'income' },
].map(c => ({ kind: 'expense', excluded: false, ...c, updatedAt: 1 }));
const S = load();
function load() {
  let s = null;
  try { s = JSON.parse(localStorage.getItem(KEY)); } catch (e) { /* nessun dato */ }
  s = s || {};
  return {
    expenses: s.expenses || [],
    categories: s.categories || defaultCategories(),
    habits: s.habits || [],
    habitLogs: s.habitLogs || [],
    accounts: s.accounts || [...DEFAULT_ACCOUNTS],
    settings: Object.assign({ theme: 'system', clientId: '', aiProvider: 'groq', aiKey: '', aiModel: '', aiEndpoint: '', name: '' }, s.settings || {}),
    meta: s.meta || { driveFileId: null, lastSync: null },
  };
}
let saveTimer = null;
function save(sync = true) {
  localStorage.setItem(KEY, JSON.stringify(S));
  if (sync && Drive.ready()) { clearTimeout(saveTimer); saveTimer = setTimeout(() => Drive.sync().catch(() => {}), 1500); }
}
const live = arr => arr.filter(x => !x.deleted);
const UNKNOWN_CAT = { id: '?', name: 'Senza categoria', color: '#9AA0AE', icon: 'tag', kind: 'expense', budget: 0 };
const cats = kind => live(S.categories).filter(c => (c.kind || 'expense') === kind);
const catById = id => S.categories.find(c => c.id === id) || UNKNOWN_CAT;
const habitById = id => S.habits.find(h => h.id === id);
const slug = s => String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'x';
function iconFor(name) {
  const n = String(name).toLowerCase();
  const rules = [[/aliment|spesa|supermerc/, 'cart'], [/ristor|\bbar\b|caff|fast-food/, 'food'], [/carbur|veicol|parcheg|telepass|\bauto\b|trasport|lavaggio|multe/, 'car'], [/abitaz|\bcasa\b|energia|utenz|arred|affitto|mutuo/, 'home'], [/\btv\b|stream|software|giochi|cultura|evento|intratten/, 'play'], [/salute|farmac|drogher|medic|sanit|benessere|bellezza|sport|fitness|barbier/, 'heart'], [/stipend|fattur|autonom|societ|p\.iva|serviz|lavoro|assegn|royalt/, 'work'], [/regal|benefic|piacer/, 'gift'], [/libri|audio|abbonam/, 'book']];
  const hit = rules.find(([re]) => re.test(n)); return hit ? hit[1] : 'tag';
}
function habitIconFor(name) {
  const n = String(name).toLowerCase();
  if (/workout|palestra|allen|gym/.test(n)) return 'dumbbell';
  if (/read|lettur|libro/.test(n)) return 'book';
  if (/medit/.test(n)) return 'clock';
  if (/trasfert|viagg/.test(n)) return 'car';
  if (/yoga|headache|mal di|dolor/.test(n)) return 'heart';
  return 'tag';
}
// ---------- Tema ----------
function applyTheme() {
  let t = S.settings.theme;
  if (t === 'system') t = window.matchMedia('(prefers-color-scheme: light)').matches ? 'minimal' : 'dark';
  document.documentElement.dataset.theme = t;
  $('meta[name=theme-color]').setAttribute('content', t === 'minimal' ? '#F7F6F2' : '#0D0E12');
}
window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', applyTheme);

// ---------- Routing ----------
const ROUTES = ['home', 'analisi', 'aggiungi', 'diario', 'scan', 'impostazioni', 'importa', 'spese'];
function route() {
  const h = (location.hash || '#home').slice(1).split('/');
  const name = ROUTES.includes(h[0]) ? h[0] : 'home';
  if (name !== 'aggiungi') draft = null;
  render(name, h.slice(1));
  window.scrollTo(0, 0);
}
window.addEventListener('hashchange', route);
function go(h) { location.hash = h; }

// ---------- Rendering ----------
function render(name, args) {
  const app = $('#app');
  const views = { home: viewHome, analisi: viewAnalisi, aggiungi: viewAggiungi, diario: viewDiario, scan: viewScan, impostazioni: viewSettings, importa: viewImport, spese: viewSpese };
  document.body.classList.toggle('modal', name === 'aggiungi');
  app.innerHTML = `<section class="screen active" data-view="${name}">${views[name](args)}</section>`;
  renderNav(name);
  if (views[name].after) views[name].after(args);
}
function renderNav(active) {
  const items = [['home', 'Spese', 'home'], ['analisi', 'Analisi', 'chart'], ['aggiungi', '', 'plus'], ['diario', 'Diario', 'diary'], ['scan', 'Scan', 'scan']];
  $('#nav').innerHTML = items.map(([r, label, ic]) => r === 'aggiungi'
    ? `<a href="#aggiungi" class="fab" aria-label="Aggiungi spesa">${svg('plus', 28, 3)}</a>`
    : `<a href="#${r}" class="${active === r ? 'on' : ''}">${svg(ic, 24)}<span>${label}</span></a>`).join('');
}

// ---------- Calcoli ----------
const typeOf = e => (e.type === 'income' ? 'income' : 'expense');
const byWhenDesc = (a, b) => (b.date + (b.time || '')).localeCompare(a.date + (a.time || '')) || (b.updatedAt || 0) - (a.updatedAt || 0);
function monthAll(key) { return live(S.expenses).filter(e => monthKey(e.date) === key); }
function monthExpenses(key) { return monthAll(key).filter(e => typeOf(e) === 'expense' && !catById(e.cat).excluded); }
function monthIncome(key) { return monthAll(key).filter(e => typeOf(e) === 'income'); }
function sumBy(list) { return list.reduce((a, e) => a + Number(e.amount || 0), 0); }
function topWithRest(cs, n = 7) {
  const top = cs.slice(0, n), rest = cs.slice(n);
  if (rest.length) top.push({ cat: { name: 'Altre categorie', color: '#6B7280' }, total: rest.reduce((a, c) => a + c.total, 0) });
  return top;
}
function byCategory(list) {
  const m = {}; list.forEach(e => { m[e.cat] = (m[e.cat] || 0) + Number(e.amount || 0); });
  return Object.entries(m).map(([id, total]) => ({ cat: catById(id), total })).sort((a, b) => b.total - a.total);
}
function totalBudget() { return cats('expense').filter(c => !c.excluded).reduce((a, c) => a + Number(c.budget || 0), 0); }
let currentMonth = monthKey(todayISO());
function shiftMonth(n) { const [y, m] = currentMonth.split('-').map(Number); const d = new Date(y, m - 1 + n, 1); currentMonth = localISO(d).slice(0, 7); }

// ---------- Home ----------
function viewHome() {
  const key = currentMonth, list = monthExpenses(key), total = sumBy(list), budget = totalBudget();
  const income = sumBy(monthIncome(key));
  const cs = byCategory(list);
  const [int, dec] = fmtMoney(total, false).split(',');
  const pct = budget ? Math.min(100, Math.round(total / budget * 100)) : 0;
  const recent = live(S.expenses).sort(byWhenDesc).slice(0, 6);
  const budgetCats = cats('expense').filter(c => c.budget > 0 && !c.excluded);
  const initials = (S.settings.name || 'Io').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  return `
    <div class="row between">
      <button class="row" style="gap:12px;text-align:left" onclick="go('#impostazioni')" aria-label="Apri le impostazioni">
        <div class="avatar">${esc(initials)}</div>
        <div class="col"><span class="small muted">${S.settings.name ? 'Ciao' : 'Benvenuto'}</span><span style="font-weight:700">${esc(S.settings.name || 'nelle tue spese')}</span></div>
      </button>
      <div class="row" style="gap:10px">
        <span class="sync-dot ${Drive.state}" id="sync-dot" title="Stato sincronizzazione"></span>
        <button class="chip" onclick="go('#impostazioni')" aria-label="Impostazioni">${svg('gear', 18)}</button>
      </div>
    </div>
    <div class="row between">
      <button class="chip" onclick="shiftMonth(-1);route()" aria-label="Mese precedente">${svg('back', 14, 2.5)}</button>
      <button class="chip grow" style="justify-content:center" onclick="go('#spese')">${monthLabel(key)}</button>
      <button class="chip" onclick="shiftMonth(1);route()" aria-label="Mese successivo" ${key >= monthKey(todayISO()) ? 'disabled style="opacity:.4"' : ''}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6"/></svg></button>
    </div>
    <div class="col" style="gap:6px">
      <span class="small muted">Speso ${key === monthKey(todayISO()) ? 'questo mese' : 'nel mese'}</span>
      <div class="hero-amount num"><span class="cur">€</span><span class="big">${int}</span><span class="cents">,${dec}</span></div>
      <div class="col" style="gap:10px;margin-top:8px">
        <div class="seg">${topWithRest(cs).map(c => `<div style="flex:${c.total};background:${c.cat.color}"></div>`).join('')}${budget ? `<div style="flex:${Math.max(0, budget - total)};background:var(--surface-2)"></div>` : ''}</div>
        <div class="row between small">
          <span class="muted">${budget ? pct + '% del budget' : 'Nessun budget impostato'}</span>
          <span style="color:${total > budget && budget ? 'var(--warn)' : 'var(--accent)'}">${budget ? (total > budget ? fmtMoney(total - budget) + ' oltre' : fmtMoney(budget - total) + ' disponibili') : ''}</span>
        </div>
        ${income ? `<div class="row between small"><span class="muted">Entrate del mese</span><span class="num" style="color:var(--accent)">+ ${fmtMoney(income)}</span></div>` : ''}
      </div>
    </div>
    ${budgetCats.length ? `<div class="hscroll">${budgetCats.map(c => {
      const spent = sumBy(list.filter(e => e.cat === c.id)); const p = Math.round(spent / c.budget * 100);
      return `<button class="card budget-card" onclick="go('#analisi')">
        <div class="row between"><div class="tile" style="background:${hexA(c.color, .16)};color:${c.color};width:34px;height:34px;border-radius:12px">${svg(c.icon, 18)}</div><span class="small" style="color:${p > 100 ? 'var(--warn)' : 'var(--muted)'}">${p}%</span></div>
        <div class="col" style="gap:2px;text-align:left"><span style="font-size:14px;font-weight:700">${esc(c.name)}</span><span class="small muted">${fmtMoney(spent)} di ${fmtInt(c.budget)}</span></div>
        <div class="bar"><div style="width:${Math.min(100, p)}%;background:${p > 100 ? 'var(--warn)' : c.color}"></div></div>
      </button>`; }).join('')}</div>` : ''}
    <div class="col" style="gap:14px">
      <div class="row between"><span class="section-title">Ultimi movimenti</span><a href="#spese" class="small" style="color:var(--accent)">Vedi tutti</a></div>
      ${recent.length ? `<div class="list">${recent.map(expenseRow).join('')}</div>` : `<div class="empty">Nessun movimento ancora.<br>Tocca + per registrare il primo, oppure importa i tuoi dati da Impostazioni.</div>`}
    </div>`;
}
function expenseRow(e) {
  const c = catById(e.cat), inc = typeOf(e) === 'income';
  return `<button class="item" onclick="openExpense('${e.id}')">
    <div class="tile" style="background:${hexA(c.color, .16)};color:${c.color}">${svg(c.icon)}</div>
    <div class="col grow"><span class="truncate" style="font-weight:700">${esc(e.note || c.name)}</span><span class="small muted truncate">${fmtDate(e.date)}${e.time ? ', ' + e.time : ''}${e.note ? ' · ' + esc(c.name) : ''}${e.source === 'scan' ? ' · Scontrino' : ''}${e.account && S.accounts.length > 1 ? ' · ' + esc(e.account) : ''}</span></div>
    <span class="num" style="font-size:16px;font-weight:600;color:${inc ? 'var(--accent)' : 'inherit'}">${inc ? '+' : '-'}${fmtMoney(e.amount, false)}</span>
  </button>`;
}

// ---------- Tutte le spese del mese ----------
function viewSpese() {
  const list = monthAll(currentMonth).sort(byWhenDesc);
  const groups = {}; list.forEach(e => (groups[e.date] = groups[e.date] || []).push(e));
  const spent = sumBy(monthExpenses(currentMonth)), inc = sumBy(monthIncome(currentMonth));
  return `
    <div class="row between">
      <button class="chip" onclick="history.back()" aria-label="Indietro">${svg('back', 16, 2.5)}</button>
      <span class="title" style="font-size:20px">${monthLabel(currentMonth)}</span>
      <span class="chip num">${fmtMoney(spent)}</span>
    </div>
    ${inc ? `<div class="row between small"><span class="muted">Entrate del mese</span><span class="num" style="color:var(--accent)">+ ${fmtMoney(inc)}</span></div>` : ''}
    ${list.length ? Object.entries(groups).map(([d, es]) => `
      <div class="col" style="gap:10px">
        <div class="row between small muted"><span>${fmtDate(d, { weekday: 'long', day: 'numeric', month: 'long' })}</span><span class="num">${fmtMoney(sumBy(es.filter(e => typeOf(e) === 'expense')))}</span></div>
        <div class="list">${es.map(expenseRow).join('')}</div>
      </div>`).join('') : '<div class="empty">Nessun movimento in questo mese.</div>'}`;
}
// ---------- Aggiungi / modifica spesa ----------
let draft = null;
const nowHM = () => new Date().toTimeString().slice(0, 5);
function topCats(type) {
  const since = addDays(todayISO(), -120), cnt = {};
  live(S.expenses).forEach(e => { if (typeOf(e) === type && e.date >= since) cnt[e.cat] = (cnt[e.cat] || 0) + 1; });
  return cats(type).sort((a, b) => (cnt[b.id] || 0) - (cnt[a.id] || 0) || a.name.localeCompare(b.name));
}
function newDraft(type = 'expense') { const t = topCats(type)[0]; return { id: null, type, amountStr: '0', cat: t ? t.id : '', note: '', date: todayISO(), time: nowHM(), account: S.accounts[0] || '', source: 'manual' }; }
function openExpense(id) {
  const e = S.expenses.find(x => x.id === id); if (!e) return;
  draft = { id, type: typeOf(e), amountStr: String(e.amount).replace('.', ','), cat: e.cat, note: e.note || '', date: e.date, time: e.time || '', account: e.account || '', source: e.source || 'manual' };
  go('#aggiungi/edit');
}
function setDraftType(t) {
  if (draft.type === t) return;
  const keep = { amountStr: draft.amountStr, note: draft.note, date: draft.date, time: draft.time, account: draft.account, id: draft.id, source: draft.source };
  draft = { ...newDraft(t), ...keep }; route();
}
function pickCat(id) { draft.cat = id; closeSheet(); route(); }
function openAllCats() {
  sheet(`<span style="font-weight:800;font-size:18px">Tutte le categorie</span>
    <div class="row" style="flex-wrap:wrap;gap:8px">${topCats(draft.type).map(c => `<button class="chip ${c.id === draft.cat ? 'on' : ''}" onclick="pickCat('${c.id}')"><span class="dot" style="background:${c.color}"></span>${esc(c.name)}</button>`).join('')}</div>`);
}
function viewAggiungi(args) {
  if (!draft || (draft.id && args[0] !== 'edit')) draft = newDraft();
  const [int, dec = '00'] = draft.amountStr.split(',');
  const all = topCats(draft.type); let shown = all.slice(0, 11);
  if (draft.cat && !shown.some(c => c.id === draft.cat)) { const sel = all.find(c => c.id === draft.cat); if (sel) shown = [...shown.slice(0, 10), sel]; }
  const hasMore = all.length > shown.length;
  return `
    <div class="row between">
      <button class="chip" onclick="draft=null;history.back()" aria-label="Chiudi">${svg('x', 16, 2.5)}</button>
      <span style="font-weight:800">${draft.id ? 'Modifica' : 'Nuovo movimento'}</span>
      <button class="chip" style="color:var(--accent)" onclick="go('#scan')" aria-label="Scansiona scontrino">${svg('scan', 18)}</button>
    </div>
    <div class="segmented" style="align-self:center"><button class="${draft.type === 'expense' ? 'on' : ''}" onclick="setDraftType('expense')">Spesa</button><button class="${draft.type === 'income' ? 'on' : ''}" onclick="setDraftType('income')">Entrata</button></div>
    <div class="col" style="align-items:center;gap:6px">
      <div class="amount-input num"><span class="cur">€</span><span class="big">${fmtInt(int || 0)}</span><span class="cents">,${(dec + '00').slice(0, 2)}</span></div>
      <div class="row" style="gap:8px;flex-wrap:wrap;justify-content:center">
        ${S.accounts.length ? `<select style="width:auto;min-height:36px;padding:6px 12px" onchange="draft.account=this.value">${S.accounts.map(a => `<option ${a === draft.account ? 'selected' : ''}>${esc(a)}</option>`).join('')}</select>` : ''}
        <input type="date" value="${draft.date}" style="width:auto;min-height:36px;padding:6px 12px" onchange="draft.date=this.value">
      </div>
    </div>
    <div class="cat-grid">${shown.map(c => `<button class="cat-btn ${c.id === draft.cat ? 'on' : ''}" onclick="pickCat('${c.id}')"><span style="color:${c.color}">${svg(c.icon, 22)}</span><span class="cat-name">${esc(c.name)}</span></button>`).join('')}${hasMore ? `<button class="cat-btn" style="border-style:dashed;border-color:var(--surface-3)" onclick="openAllCats()"><span style="color:var(--muted)">${svg('plus', 22)}</span><span>Altre</span></button>` : ''}</div>
    <input type="text" placeholder="Nota (facoltativa)" value="${esc(draft.note)}" oninput="draft.note=this.value">
    <div class="keypad">
      ${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => `<button onclick="key('${n}')">${n}</button>`).join('')}
      <button onclick="key(',')">,</button><button onclick="key('0')">0</button><button onclick="key('del')" aria-label="Cancella">${svg('del', 26)}</button>
    </div>
    <button class="btn primary sticky-save" onclick="saveDraft()">${svg('check', 20, 3)} ${draft.id ? 'Salva modifiche' : 'Salva'}</button>
    ${draft.id ? `<button class="btn danger" onclick="deleteExpense('${draft.id}')">Elimina</button>` : ''}`;
}
function key(k) {
  if (navigator.vibrate) navigator.vibrate(8);
  let s = draft.amountStr;
  if (k === 'del') s = s.length > 1 ? s.slice(0, -1) : '0';
  else if (k === ',') { if (!s.includes(',')) s += ','; }
  else { if (s.includes(',') && s.split(',')[1].length >= 2) return; s = s === '0' ? k : s + k; if (s.replace(',', '').length > 9) return; }
  draft.amountStr = s;
  const [int, dec = '00'] = s.split(',');
  const big = $('.amount-input .big'), cents = $('.amount-input .cents');
  if (big) big.textContent = fmtInt(int || 0);
  if (cents) cents.textContent = ',' + (dec + '00').slice(0, 2);
}
function saveDraft() {
  const amount = parseFloat(draft.amountStr.replace(',', '.'));
  if (!amount || amount <= 0) return toast('Inserisci un importo');
  if (!draft.cat) return toast('Scegli una categoria');
  const now = Date.now();
  if (draft.id) {
    const e = S.expenses.find(x => x.id === draft.id);
    Object.assign(e, { type: draft.type, amount, cat: draft.cat, note: draft.note.trim(), date: draft.date, time: draft.time, account: draft.account, updatedAt: now });
  } else {
    S.expenses.push({ id: uid(), type: draft.type, amount, cat: draft.cat, note: draft.note.trim(), date: draft.date, time: draft.time, account: draft.account, source: draft.source, updatedAt: now });
  }
  save(); draft = null; toast('Salvato'); go('#home');
}
function deleteExpense(id) {
  if (!confirm('Eliminare questo movimento?')) return;
  const e = S.expenses.find(x => x.id === id); e.deleted = true; e.updatedAt = Date.now();
  save(); draft = null; toast('Eliminato'); go('#home');
}

// ---------- Analisi ----------
let anaMode = 'mese';
function viewAnalisi() {
  const isMonth = anaMode === 'mese', year = currentMonth.slice(0, 4);
  const inPeriod = e => (isMonth ? monthKey(e.date) === currentMonth : e.date.startsWith(year));
  const list = live(S.expenses).filter(e => typeOf(e) === 'expense' && !catById(e.cat).excluded && inPeriod(e));
  const income = sumBy(live(S.expenses).filter(e => typeOf(e) === 'income' && inPeriod(e)));
  const total = sumBy(list), cs = byCategory(list), shown = topWithRest(cs);
  const C = 2 * Math.PI * 70; let acc = 0;
  const donut = shown.map(c => { const len = C * c.total / (total || 1); const el = `<circle cx="100" cy="100" r="70" fill="none" stroke="${c.cat.color}" stroke-width="26" stroke-dasharray="${Math.max(0, len - 3)} ${C}" transform="rotate(${-90 + 360 * acc / (total || 1)} 100 100)"/>`; acc += c.total; return el; }).join('');
  const months = []; for (let i = 5; i >= 0; i--) { const [y, m] = currentMonth.split('-').map(Number); const d = new Date(y, m - 1 - i, 1); const k = localISO(d).slice(0, 7); months.push({ k, label: d.toLocaleDateString('it-IT', { month: 'short' }), spent: sumBy(monthExpenses(k)), income: sumBy(monthIncome(k)) }); }
  const max = Math.max(...months.map(m => m.spent), 1), avg = months.reduce((a, m) => a + m.spent, 0) / 6;
  const budgets = cats('expense').filter(c => c.budget > 0 && !c.excluded).map(c => ({ c, spent: sumBy(monthExpenses(currentMonth).filter(e => e.cat === c.id)) })).sort((a, b) => b.spent / b.c.budget - a.spent / a.c.budget);
  return `
    <div class="row between">
      <span class="title">Analisi</span>
      <div class="segmented"><button class="${isMonth ? 'on' : ''}" onclick="anaMode='mese';route()">Mese</button><button class="${!isMonth ? 'on' : ''}" onclick="anaMode='anno';route()">Anno</button></div>
    </div>
    <div class="row between">
      <button class="chip" onclick="shiftMonth(${isMonth ? -1 : -12});route()" aria-label="Periodo precedente">${svg('back', 14, 2.5)}</button>
      <span class="small muted">${isMonth ? monthLabel(currentMonth) : year}</span>
      <button class="chip" onclick="shiftMonth(${isMonth ? 1 : 12});route()" aria-label="Periodo successivo" ${(isMonth ? currentMonth : year) >= (isMonth ? monthKey(todayISO()) : todayISO().slice(0, 4)) ? 'disabled style="opacity:.4"' : ''}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6"/></svg></button>
    </div>
    <div class="card row" style="gap:18px">
      <div class="donut-wrap">
        <svg width="136" height="136" viewBox="0 0 200 200" aria-label="Ripartizione per categoria"><circle cx="100" cy="100" r="70" fill="none" stroke="var(--surface-2)" stroke-width="26"/>${donut}</svg>
        <div class="donut-center"><span class="small muted">${isMonth ? monthLabel(currentMonth).split(' ')[0] : year}</span><span class="num" style="font-size:17px;font-weight:700">${fmtMoney(total)}</span></div>
      </div>
      <div class="legend">${cs.length ? shown.map(c => `<div class="row"><span class="dot" style="background:${c.cat.color}"></span><span class="grow truncate" style="font-weight:700">${esc(c.cat.name)}</span><span class="muted small">${Math.round(c.total / total * 100)}%</span></div>`).join('') : '<span class="muted small">Nessuna spesa nel periodo</span>'}</div>
    </div>
    <div class="card col" style="gap:14px">
      <div class="row between"><span style="font-weight:800">Entrate e spese</span><span class="small muted">${isMonth ? monthLabel(currentMonth).split(' ')[0] : year}</span></div>
      <div class="row between"><div class="stat"><span class="v num" style="color:var(--accent)">+ ${fmtMoney(income)}</span><span class="small muted">entrate</span></div><div class="stat" style="text-align:right"><span class="v num">- ${fmtMoney(total)}</span><span class="small muted">spese</span></div></div>
      <div class="row between small" style="border-top:1px solid var(--line);padding-top:12px"><span class="muted">Differenza</span><span class="num" style="font-weight:700;color:${income - total >= 0 ? 'var(--accent)' : 'var(--warn)'}">${income - total >= 0 ? '+' : '-'} ${fmtMoney(income - total)}</span></div>
    </div>
    <div class="card col" style="gap:16px">
      <div class="row between"><span style="font-weight:800">Ultimi 6 mesi</span><span class="small muted">Media ${fmtMoney(avg)}</span></div>
      <div class="bars">${months.map(m => `<div><div class="b ${m.k === currentMonth ? 'on' : ''}" style="height:${Math.round(m.spent / max * 100)}%" title="${fmtMoney(m.spent)}"></div><span class="small ${m.k === currentMonth ? '' : 'muted'}">${m.label}</span></div>`).join('')}</div>
      <div class="col" style="gap:8px;border-top:1px solid var(--line);padding-top:12px">${months.map(m => `<div class="row between small"><span class="muted" style="width:44px">${m.label}</span><span class="num" style="color:var(--accent)">+ ${fmtMoney(m.income, false)}</span><span class="num">- ${fmtMoney(m.spent, false)}</span></div>`).join('')}</div>
    </div>
    ${isMonth ? `<div class="col" style="gap:12px">
      <div class="row between"><span class="section-title">Budget del mese</span><button class="chip" style="color:var(--accent);height:32px" onclick="go('#impostazioni')">Modifica</button></div>
      <div class="list">${budgets.map(({ c, spent }) => { const p = Math.round(spent / c.budget * 100); return `<div class="item" style="flex-direction:column;align-items:stretch;gap:10px">
        <div class="row between" style="font-weight:700"><span>${esc(c.name)}</span><span style="color:${p > 100 ? 'var(--warn)' : 'var(--muted)'}">${p > 100 ? '+ ' + fmtMoney(spent - c.budget) + ' oltre' : fmtMoney(c.budget - spent) + ' rimasti'}</span></div>
        <div class="bar"><div style="width:${Math.min(100, p)}%;background:${p > 100 ? 'var(--warn)' : c.color}"></div></div></div>`; }).join('') || '<div class="empty">Nessun budget impostato. Aprilo da Impostazioni, Categorie.</div>'}</div>
    </div>` : ''}
    <div class="col" style="gap:12px">
      <span class="section-title">Per categoria</span>
      <div class="list">${cs.map(c => `<div class="item"><div class="tile" style="background:${hexA(c.cat.color, .16)};color:${c.cat.color}">${svg(c.cat.icon)}</div><div class="col grow"><span style="font-weight:700">${esc(c.cat.name)}</span><span class="small muted">${list.filter(e => e.cat === c.cat.id).length} movimenti</span></div><span class="num" style="font-weight:600">${fmtMoney(c.total)}</span></div>`).join('')}</div>
    </div>`;
}
// ---------- Diario attività ----------
let diaryDate = todayISO();
const activeHabits = () => live(S.habits).filter(h => !h.archived).sort((a, b) => (a.order ?? 999) - (b.order ?? 999) || a.name.localeCompare(b.name));
const archivedHabits = () => live(S.habits).filter(h => h.archived).sort((a, b) => a.name.localeCompare(b.name));
const logsOf = habitId => live(S.habitLogs).filter(l => l.habitId === habitId);
const isDone = (habitId, date) => live(S.habitLogs).some(l => l.habitId === habitId && l.date === date);
function toggleLog(habitId, date) {
  const existing = live(S.habitLogs).filter(l => l.habitId === habitId && l.date === date);
  if (existing.length) {
    if (existing.length > 1 && !confirm(`Rimuovere le ${existing.length} registrazioni di questo giorno?`)) return;
    existing.forEach(l => { l.deleted = true; l.updatedAt = Date.now(); });
  } else {
    S.habitLogs.push({ id: uid(), habitId, date, time: date === todayISO() ? nowHM() : '', updatedAt: Date.now() });
  }
  save(); route();
}
function weekStart(iso) { const d = new Date(iso + 'T12:00:00'); const day = (d.getDay() + 6) % 7; return addDays(iso, -day); }
function habitStats(h) {
  const dates = new Set(logsOf(h.id).map(l => l.date)), days = [...dates].sort();
  const today = todayISO(), ws = weekStart(today), mk = monthKey(today), yk = today.slice(0, 4);
  let week = 0; for (let i = 0; i < 7; i++) if (dates.has(addDays(ws, i))) week++;
  const byYear = {}; days.forEach(d => { const y = d.slice(0, 4); byYear[y] = (byYear[y] || 0) + 1; });
  return { dates, week, month: days.filter(d => monthKey(d) === mk).length, year: byYear[yk] || 0, total: days.length, first: days[0], last: days[days.length - 1], byYear };
}
const longDate = iso => (iso ? fmtDate(iso, { day: 'numeric', month: 'short', year: 'numeric' }) : 'mai');
function yearBars(st, color) {
  if (!st.first) return '';
  const y0 = Number(st.first.slice(0, 4)), y1 = new Date().getFullYear(), ys = [];
  for (let y = y0; y <= y1; y++) ys.push({ y, n: st.byYear[y] || 0 });
  const max = Math.max(...ys.map(x => x.n), 1);
  return `<div class="bars" style="height:96px;gap:6px">${ys.map(x => `<div><span class="small muted num">${x.n}</span><div class="b" style="height:${Math.max(2, Math.round(x.n / max * 100))}%;background:${x.n ? color : 'var(--surface-3)'}"></div><span class="small muted">${x.y}</span></div>`).join('')}</div>`;
}
function viewDiario() {
  const habits = activeHabits(), arch = archivedHabits(), ws = weekStart(diaryDate);
  const days = Array.from({ length: 7 }, (_, i) => addDays(ws, i));
  const labels = ['L', 'M', 'M', 'G', 'V', 'S', 'D'];
  return `
    <div class="row between">
      <div class="col" style="gap:2px"><span class="title">Diario</span><span class="small muted">${fmtLong(diaryDate, { weekday: 'long', day: 'numeric', month: 'long' })}</span></div>
      <button class="chip" style="color:var(--accent)" onclick="editHabit()">${svg('plus', 16, 2.5)} Attività</button>
    </div>
    <div class="row between">
      <button class="chip" onclick="diaryDate=addDays(diaryDate,-7);route()" aria-label="Settimana precedente">${svg('back', 14, 2.5)}</button>
      <span class="small muted">Settimana del ${fmtLong(ws, { day: 'numeric', month: 'long' })}</span>
      <button class="chip" onclick="diaryDate=addDays(diaryDate,7);route()" aria-label="Settimana successiva" ${ws >= weekStart(todayISO()) ? 'disabled style="opacity:.4"' : ''}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6"/></svg></button>
    </div>
    <div class="week">${days.map((d, i) => `<button onclick="diaryDate='${d}';route()" ${d > todayISO() ? 'disabled style="opacity:.4"' : ''}>
      <span class="small ${d === diaryDate ? '' : 'muted'}">${labels[i]}</span>
      <span class="day ${d === diaryDate ? 'today' : ''}">${Number(d.slice(8))}</span>
      <span class="dots">${habits.filter(h => isDone(h.id, d)).slice(0, 6).map(h => `<span style="background:${h.color}"></span>`).join('')}</span></button>`).join('')}</div>
    <div class="col" style="gap:10px">
      <span class="section-title">${diaryDate === todayISO() ? 'Oggi' : fmtDate(diaryDate)}</span>
      ${habits.length ? `<div class="list">${habits.map(h => { const st = habitStats(h), done = isDone(h.id, diaryDate); return `
        <div class="item">
          <button class="tile" style="background:${hexA(h.color, .16)};color:${h.color}" onclick="editHabit('${h.id}')" aria-label="Modifica ${esc(h.name)}">${svg(h.icon, 22)}</button>
          <div class="col grow"><span class="truncate" style="font-weight:700">${esc(h.name)}</span><span class="small muted">Settimana ${st.week} · mese ${st.month}</span></div>
          <button class="check ${done ? 'on' : ''}" onclick="toggleLog('${h.id}','${diaryDate}')" aria-label="${done ? 'Annulla' : 'Segna fatto'}">${svg('check', 20, 3)}</button>
        </div>`; }).join('')}</div>` : '<div class="empty">Nessuna attività. Aggiungine una con il tasto in alto, oppure importa il tuo storico da Impostazioni.</div>'}
    </div>
    ${habits.length ? `<div class="col" style="gap:10px"><span class="section-title">Storico</span>${habits.map(h => { const st = habitStats(h); const start = addDays(weekStart(todayISO()), -28); const cells = Array.from({ length: 35 }, (_, i) => addDays(start, i)); return `
      <details style="--c:${h.color}">
        <summary><span class="row" style="gap:10px"><span style="color:${h.color}">${svg(h.icon, 18)}</span>${esc(h.name)}</span><span class="small muted" style="margin-left:auto;margin-right:12px">${st.total} giorni</span></summary>
        <div>
          <div class="heat">${cells.map(d => `<div class="${st.dates.has(d) ? 'on' : d > todayISO() ? 'future' : ''}" title="${d}"></div>`).join('')}</div>
          <div class="row" style="justify-content:space-between">
            <div class="stat"><span class="v num">${st.month}</span><span class="small muted">questo mese</span></div>
            <div class="stat"><span class="v num">${st.year}</span><span class="small muted">quest'anno</span></div>
            <div class="stat"><span class="v num">${st.total}</span><span class="small muted">in totale</span></div>
          </div>
          ${yearBars(st, h.color)}
          <span class="small muted">Ultima volta: ${longDate(st.last)}${st.first ? ' · primo giorno: ' + longDate(st.first) : ''}</span>
        </div>
      </details>`; }).join('')}</div>` : ''}
    ${arch.length ? `<details><summary>Archiviate (${arch.length})</summary><div>${arch.map(h => { const st = habitStats(h); return `
      <button class="item" style="padding:8px 0;background:transparent;border:none" onclick="editHabit('${h.id}')">
        <div class="tile" style="background:${hexA(h.color, .16)};color:${h.color}">${svg(h.icon, 20)}</div>
        <div class="col grow"><span style="font-weight:700">${esc(h.name)}</span><span class="small muted">${st.total} giorni, ${st.first ? longDate(st.first) + ' › ' + longDate(st.last) : 'nessuna registrazione'}</span></div>
      </button>`; }).join('')}</div></details>` : ''}`;
}
// Un'attività = un nome. Ripulisce i nomi con timestamp e unisce i duplicati, spostando le registrazioni.
function moveHabitLogs(fromId, toId) {
  const now = Date.now(), have = new Set(logsOf(toId).map(l => l.date + '|' + (l.time || '')));
  S.habitLogs.forEach(l => {
    if (l.deleted || l.habitId !== fromId) return;
    const k = l.date + '|' + (l.time || '');
    if (have.has(k)) l.deleted = true; else { l.habitId = toId; have.add(k); }
    l.updatedAt = now;
  });
}
function normalizeHabits() {
  let changed = false;
  live(S.habits).forEach(h => {
    const name = cleanHabitName(h.name); if (!name || name === h.name) return;
    const target = live(S.habits).find(x => x.id !== h.id && slug(x.name) === slug(name));
    const now = Date.now();
    if (target) { moveHabitLogs(h.id, target.id); h.deleted = true; target.archived = target.archived && h.archived; target.updatedAt = now; }
    else h.name = name;
    h.updatedAt = now; changed = true;
  });
  if (changed) save(false);
  return changed;
}
function mergeHabit(id) {
  const to = $('#h-merge').value; if (!to) return toast('Scegli l\'attività di destinazione');
  const from = habitById(id), dest = habitById(to);
  if (!confirm(`Unire "${from.name}" in "${dest.name}"? Le registrazioni passano a "${dest.name}".`)) return;
  moveHabitLogs(id, to); from.deleted = true; from.updatedAt = Date.now(); save(); closeSheet(); toast('Attività unite'); route();
}
function editHabit(id) {
  const h = id ? habitById(id) : { name: '', color: PALETTE[live(S.habits).length % PALETTE.length], icon: 'tag' };
  sheet(`
    <span style="font-weight:800;font-size:18px">${id ? 'Modifica attività' : 'Nuova attività'}</span>
    <div class="field"><label>Nome</label><input id="h-name" value="${esc(h.name)}" placeholder="Es. Workout"></div>
    <div class="field"><label>Icona</label><div class="row" style="flex-wrap:wrap;gap:8px">${HABIT_ICONS.map(ic => `<button class="chip ${ic === h.icon ? 'on' : ''}" data-icon="${ic}" onclick="pick(this)">${svg(ic, 18)}</button>`).join('')}</div></div>
    <div class="field"><label>Colore</label><div class="row" style="flex-wrap:wrap;gap:8px">${PALETTE.map(c => `<button class="chip ${c === h.color ? 'on' : ''}" data-color="${c}" style="width:40px;padding:0;justify-content:center" onclick="pick(this)"><span class="dot" style="background:${c};width:16px;height:16px"></span></button>`).join('')}</div></div>
    <button class="btn primary" onclick="saveHabit('${id || ''}')">Salva</button>
    ${id && live(S.habits).length > 1 ? `<div class="field"><label>Unisci in un'altra attività</label><select id="h-merge"><option value="">Scegli l'attività di destinazione</option>${live(S.habits).filter(x => x.id !== id).sort((a, b) => a.name.localeCompare(b.name)).map(o => `<option value="${o.id}">${esc(o.name)}</option>`).join('')}</select></div><button class="btn" onclick="mergeHabit('${id}')">Unisci</button>` : ''}
    ${id ? `<button class="btn" onclick="archiveHabit('${id}')">${h.archived ? 'Ripristina nel diario' : 'Archivia (conserva lo storico)'}</button>
    <button class="btn danger" onclick="deleteHabit('${id}')">Elimina attività e cronologia</button>` : ''}`);
}
function pick(btn) { btn.parentElement.querySelectorAll('.chip').forEach(b => b.classList.remove('on')); btn.classList.add('on'); }
function saveHabit(id) {
  const name = $('#h-name').value.trim(); if (!name) return toast('Dai un nome all\'attività');
  const old = id ? habitById(id) : null;
  const icon = $('#sheet .chip.on[data-icon]')?.dataset.icon || old?.icon || 'tag', color = $('#sheet .chip.on[data-color]')?.dataset.color || old?.color || PALETTE[0];
  if (old) Object.assign(old, { name, icon, color, updatedAt: Date.now() });
  else { let hid = slug(name); if (habitById(hid)) hid += '-' + uid().slice(-4); S.habits.push({ id: hid, name, icon, color, order: Math.max(0, ...S.habits.map(x => x.order ?? 0)) + 1, updatedAt: Date.now() }); }
  save(); closeSheet(); route();
}
function archiveHabit(id) { const h = habitById(id); h.archived = !h.archived; h.updatedAt = Date.now(); save(); closeSheet(); route(); }
function deleteHabit(id) {
  if (!confirm('Eliminare l\'attività e tutta la sua cronologia? Non si può annullare.')) return;
  const h = habitById(id); h.deleted = true; h.updatedAt = Date.now();
  S.habitLogs.forEach(l => { if (l.habitId === id) { l.deleted = true; l.updatedAt = Date.now(); } });
  save(); closeSheet(); route();
}

// ---------- Sheet ----------
function sheet(html) { $('#sheet').innerHTML = `<div class="handle"></div>${html}`; $('#sheet-bg').classList.add('open'); }
function closeSheet() { $('#sheet-bg').classList.remove('open'); }
document.addEventListener('click', e => { if (e.target.id === 'sheet-bg') closeSheet(); });

// ---------- Scansione scontrino ----------
let scan = { img: null, result: null, busy: false, error: null };
function viewScan() {
  const ai = AI.configured();
  return `
    <div class="row between">
      <button class="chip" onclick="history.back()" aria-label="Indietro">${svg('back', 16, 2.5)}</button>
      <span style="font-weight:800">Scansiona scontrino</span>
      <span class="chip ${scan.busy ? '' : ''}" style="font-size:12px"><span class="sync-dot ${scan.busy ? 'busy' : scan.result ? 'ok' : ''}"></span>${scan.busy ? 'Lettura in corso' : scan.result ? 'Letto in ' + scan.result.ms / 1000 + ' s' : (ai ? 'Pronto' : 'AI non configurata')}</span>
    </div>
    <div class="scan-area">
      ${scan.img ? `<img src="${scan.img}" alt="Scontrino">` : `<div class="col" style="align-items:center;gap:14px;color:var(--muted);text-align:center;padding:24px">${svg('camera', 40, 1.6)}<span>Fotografa lo scontrino o scegline uno dalla galleria.<br>L'AI compila importo, data, esercente e categoria.</span></div>`}
      <div class="corner tl"></div><div class="corner tr"></div><div class="corner bl"></div><div class="corner br"></div>
    </div>
    ${!ai ? `<div class="empty">Per leggere gli scontrini serve una chiave API del modello. <a href="#impostazioni" style="color:var(--accent);font-weight:700">Configura ora</a></div>` : ''}
    <div class="row" style="gap:10px">
      <label class="btn grow" style="cursor:pointer">${svg('camera', 20)} Fotografa<input type="file" accept="image/*" capture="environment" class="hidden" onchange="onScanFile(this.files[0])"></label>
      <label class="btn grow" style="cursor:pointer">Galleria<input type="file" accept="image/*" class="hidden" onchange="onScanFile(this.files[0])"></label>
    </div>
    ${scan.error ? `<div class="empty" style="color:var(--danger);border-color:var(--danger)">${esc(scan.error)}</div>` : ''}
    ${scan.result ? scanResult() : ''}`;
}
function scanResult() {
  const r = scan.result;
  return `
    <div class="row between">
      <div class="col"><span class="small muted">Totale scontrino</span><div class="hero-amount num"><span class="cur">€</span><span class="big" style="font-size:40px">${fmtMoney(r.total, false).split(',')[0]}</span><span class="cents" style="font-size:20px">,${fmtMoney(r.total, false).split(',')[1]}</span></div></div>
    </div>
    <div class="kv">
      <div><label>Esercente</label><input id="r-merchant" value="${esc(r.merchant)}"></div>
      <div><label>Data</label><input id="r-date" type="date" value="${r.date}"></div>
      <div><label>Totale</label><input id="r-total" type="number" step="0.01" value="${r.total}"></div>
      <div><label>Categoria</label><select id="r-cat">${cats('expense').map(c => `<option value="${c.id}" ${c.id === r.cat ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></div>
      <div><label>Pagamento</label><select id="r-account">${S.accounts.map(a => `<option ${a === r.account ? 'selected' : ''}>${esc(a)}</option>`).join('')}</select></div>
      ${r.items ? `<div><label>Articoli</label><span class="small">${r.items} righe riconosciute</span></div>` : ''}
    </div>
    <button class="btn primary" onclick="confirmScan()">${svg('check', 20, 3)} Conferma e salva</button>`;
}
async function onScanFile(file) {
  if (!file) return;
  scan = { img: null, result: null, busy: false, error: null };
  scan.img = await resizeImage(file, 1280, 0.82);
  if (!AI.configured()) { route(); return; }
  scan.busy = true; route();
  const t0 = Date.now();
  try {
    const r = await AI.readReceipt(scan.img);
    r.ms = Math.round((Date.now() - t0) / 100) / 10;
    scan.result = r;
  } catch (e) { scan.error = 'Lettura non riuscita: ' + (e.message || e); }
  scan.busy = false; route();
}
function confirmScan() {
  const amount = parseFloat($('#r-total').value);
  if (!amount) return toast('Controlla il totale');
  S.expenses.push({ id: uid(), type: 'expense', amount, cat: $('#r-cat').value, note: $('#r-merchant').value.trim(), date: $('#r-date').value || todayISO(), time: '', account: $('#r-account').value, source: 'scan', updatedAt: Date.now() });
  save(); scan = { img: null, result: null, busy: false, error: null }; toast('Spesa salvata'); go('#home');
}
function resizeImage(file, max, q) {
  return new Promise((res, rej) => {
    const img = new Image(); const url = URL.createObjectURL(file);
    img.onload = () => { const s = Math.min(1, max / Math.max(img.width, img.height)); const c = document.createElement('canvas'); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url); res(c.toDataURL('image/jpeg', q)); };
    img.onerror = rej; img.src = url;
  });
}

// ---------- AI (provider OpenAI-compatibile o Anthropic) ----------
const AI = {
  providers: {
    groq: { label: 'Groq (gratuito)', endpoint: 'https://api.groq.com/openai/v1/chat/completions', model: 'meta-llama/llama-4-scout-17b-16e-instruct' },
    openrouter: { label: 'OpenRouter', endpoint: 'https://openrouter.ai/api/v1/chat/completions', model: 'qwen/qwen2.5-vl-72b-instruct:free' },
    anthropic: { label: 'Anthropic (Claude)', endpoint: 'https://api.anthropic.com/v1/messages', model: 'claude-haiku-4-5-20251001' },
    custom: { label: 'Altro (OpenAI-compatibile)', endpoint: '', model: '' },
  },
  configured() { return !!S.settings.aiKey; },
  cfg() { const p = this.providers[S.settings.aiProvider] || this.providers.custom; return { endpoint: S.settings.aiEndpoint || p.endpoint, model: S.settings.aiModel || p.model, key: S.settings.aiKey, kind: S.settings.aiProvider === 'anthropic' ? 'anthropic' : 'openai' }; },
  prompt() {
    const names = cats('expense').map(c => c.name).join(', ');
    return `Leggi questo scontrino italiano e rispondi SOLO con un oggetto JSON, senza testo prima o dopo, con queste chiavi:
{"merchant": nome dell'esercente in forma breve, "date": data in formato YYYY-MM-DD (se assente usa "${todayISO()}"), "total": totale pagato come numero con il punto decimale, "category": una tra [${names}], "items": numero di righe articolo (numero intero, 0 se non chiaro), "payment": "Carta" oppure "Contanti"}`;
  },
  async readReceipt(dataUrl) {
    const { endpoint, model, key, kind } = this.cfg();
    if (!endpoint || !model) throw new Error('endpoint o modello mancanti nelle impostazioni');
    const b64 = dataUrl.split(',')[1];
    let text;
    if (kind === 'anthropic') {
      const res = await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' }, body: JSON.stringify({ model, max_tokens: 400, messages: [{ role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: b64 } }, { type: 'text', text: this.prompt() }] }] }) });
      if (!res.ok) throw new Error('HTTP ' + res.status + ' ' + (await res.text()).slice(0, 200));
      const data = await res.json(); text = data.content.map(c => c.text || '').join('');
    } else {
      const res = await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json', 'authorization': 'Bearer ' + key }, body: JSON.stringify({ model, max_tokens: 400, temperature: 0, messages: [{ role: 'user', content: [{ type: 'text', text: this.prompt() }, { type: 'image_url', image_url: { url: dataUrl } }] }] }) });
      if (!res.ok) throw new Error('HTTP ' + res.status + ' ' + (await res.text()).slice(0, 200));
      const data = await res.json(); text = data.choices?.[0]?.message?.content || '';
    }
    const m = text.match(/\{[\s\S]*\}/); if (!m) throw new Error('risposta del modello non interpretabile');
    const j = JSON.parse(m[0]);
    const cat = cats('expense').find(c => c.name.toLowerCase() === String(j.category || '').toLowerCase()) || cats('expense')[0] || UNKNOWN_CAT;
    const total = parseFloat(String(j.total).replace(',', '.')) || 0;
    const date = /^\d{4}-\d{2}-\d{2}$/.test(j.date || '') ? j.date : todayISO();
    return { merchant: j.merchant || '', date, total, cat: cat.id, items: Number(j.items) || 0, account: S.accounts.find(a => /cont/i.test(a) === /cont/i.test(j.payment || '')) || S.accounts[0] || '' };
  },
};

// ---------- Google Drive (cartella privata dell'app) ----------
const Drive = {
  state: '', token: null, exp: 0, client: null, FILE: 'spese-data.json',
  ready() { return !!(S.settings.clientId && window.google && this.token && Date.now() < this.exp); },
  setState(s) { this.state = s; const d = $('#sync-dot'); if (d) d.className = 'sync-dot ' + s; },
  init(interactive) {
    return new Promise((res, rej) => {
      if (!S.settings.clientId) return rej(new Error('Client ID Google mancante'));
      if (!window.google?.accounts?.oauth2) return rej(new Error('Libreria Google non caricata (sei offline?)'));
      this.client = google.accounts.oauth2.initTokenClient({
        client_id: S.settings.clientId, scope: 'https://www.googleapis.com/auth/drive.appdata',
        callback: r => { if (r.error) return rej(new Error(r.error)); this.token = r.access_token; this.exp = Date.now() + (r.expires_in - 60) * 1000; sessionStorage.setItem('spese.tok', JSON.stringify({ t: this.token, e: this.exp })); res(); },
        error_callback: e => rej(new Error(e.type || 'accesso annullato')),
      });
      this.client.requestAccessToken({ prompt: interactive ? 'consent' : '' });
    });
  },
  async ensureToken() {
    if (this.token && Date.now() < this.exp) return;
    const saved = JSON.parse(sessionStorage.getItem('spese.tok') || 'null');
    if (saved && Date.now() < saved.e) { this.token = saved.t; this.exp = saved.e; return; }
    await this.init(false);
  },
  async api(url, opt = {}) {
    const res = await fetch(url, { ...opt, headers: { ...(opt.headers || {}), authorization: 'Bearer ' + this.token } });
    if (res.status === 401) { this.token = null; sessionStorage.removeItem('spese.tok'); throw new Error('sessione Google scaduta'); }
    if (!res.ok) throw new Error('Drive HTTP ' + res.status);
    return res;
  },
  async findFile() {
    if (S.meta.driveFileId) return S.meta.driveFileId;
    const r = await (await this.api(`https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=name%3D%27${this.FILE}%27&fields=files(id)`)).json();
    if (r.files?.length) { S.meta.driveFileId = r.files[0].id; return r.files[0].id; }
    const meta = { name: this.FILE, parents: ['appDataFolder'] };
    const body = new FormData(); body.append('metadata', new Blob([JSON.stringify(meta)], { type: 'application/json' })); body.append('file', new Blob([JSON.stringify(this.payload())], { type: 'application/json' }));
    const c = await (await this.api('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', { method: 'POST', body })).json();
    S.meta.driveFileId = c.id; return c.id;
  },
  payload() { return { version: 1, exportedAt: Date.now(), expenses: S.expenses, categories: S.categories, habits: S.habits, habitLogs: S.habitLogs, accounts: S.accounts }; },
  mergeArr(local, remote) {
    const m = new Map(); [...local, ...remote].forEach(x => { const cur = m.get(x.id); if (!cur || (x.updatedAt || 0) > (cur.updatedAt || 0)) m.set(x.id, x); });
    return [...m.values()];
  },
  async sync(interactive = false) {
    if (!S.settings.clientId) return;
    this.setState('busy');
    try {
      if (interactive) await this.init(true); else await this.ensureToken();
      const id = await this.findFile();
      const remote = await (await this.api(`https://www.googleapis.com/drive/v3/files/${id}?alt=media`)).json().catch(() => null);
      if (remote && remote.version) {
        S.expenses = this.mergeArr(S.expenses, remote.expenses || []);
        S.categories = this.mergeArr(S.categories, remote.categories || []);
        S.habits = this.mergeArr(S.habits, remote.habits || []);
        S.habitLogs = this.mergeArr(S.habitLogs, remote.habitLogs || []);
        if ((remote.categories || []).length) dropPristineDefaults();
        normalizeHabits();
        if (remote.accounts) S.accounts = [...new Set([...S.accounts, ...remote.accounts])];
      }
      await this.api(`https://www.googleapis.com/upload/drive/v3/files/${id}?uploadType=media`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(this.payload()) });
      S.meta.lastSync = Date.now(); save(false); this.setState('ok');
      if (interactive) { toast('Sincronizzato con Google Drive'); route(); }
    } catch (e) {
      this.setState('err'); if (interactive) toast('Sincronizzazione non riuscita: ' + e.message, 4000); else console.warn(e);
    }
  },
};

// ---------- Impostazioni ----------
const openSecs = {};
function det(id, title, body, dflt = false) {
  const open = openSecs[id] === undefined ? dflt : openSecs[id];
  return `<details ${open ? 'open' : ''} ontoggle="openSecs['${id}']=this.open"><summary>${title}</summary><div>${body}</div></details>`;
}
let catKindView = 'expense';
function viewSettings() {
  const s = S.settings, p = AI.providers[s.aiProvider] || AI.providers.custom;
  const gdrive = `
      <div class="field"><label>Client ID OAuth</label><input value="${esc(s.clientId)}" onchange="S.settings.clientId=this.value.trim();save(false)" placeholder="xxxx.apps.googleusercontent.com"><span class="hint">Lo trovi nella Google Cloud Console (vedi la guida). I dati vanno nella cartella nascosta dell'app sul tuo Drive, visibile solo a questa app.</span></div>
      <button class="btn sm" onclick="Drive.sync(true)">${svg('cloud', 18)} ${S.meta.lastSync ? 'Sincronizza ora' : 'Accedi e sincronizza'}</button>
      <span class="hint">${S.meta.lastSync ? 'Ultima sincronizzazione: ' + new Date(S.meta.lastSync).toLocaleString('it-IT') : 'Mai sincronizzato. Dopo il primo accesso la sincronizzazione avviene da sola a ogni modifica.'}</span>`;
  const ai = `
      <div class="field"><label>Provider</label><select onchange="S.settings.aiProvider=this.value;S.settings.aiModel='';S.settings.aiEndpoint='';save(false);route()">${Object.entries(AI.providers).map(([k, v]) => `<option value="${k}" ${k === s.aiProvider ? 'selected' : ''}>${v.label}</option>`).join('')}</select></div>
      <div class="field"><label>Chiave API</label><input type="password" value="${esc(s.aiKey)}" onchange="S.settings.aiKey=this.value.trim();save(false)" placeholder="Incolla la chiave"><span class="hint">Resta solo su questo dispositivo, non viene sincronizzata su Drive.</span></div>
      <div class="field"><label>Modello</label><input value="${esc(s.aiModel)}" placeholder="${esc(p.model)}" onchange="S.settings.aiModel=this.value.trim();save(false)"></div>
      <div class="field"><label>Endpoint</label><input value="${esc(s.aiEndpoint)}" placeholder="${esc(p.endpoint)}" onchange="S.settings.aiEndpoint=this.value.trim();save(false)"><span class="hint">Lascia vuoto per usare il valore predefinito del provider.</span></div>`;
  const counts = {}; live(S.expenses).forEach(e => { counts[e.cat] = (counts[e.cat] || 0) + 1; });
  const catList = cats(catKindView).sort((a, b) => (counts[b.id] || 0) - (counts[a.id] || 0) || a.name.localeCompare(b.name));
  const categories = `
      <div class="segmented" style="align-self:flex-start"><button class="${catKindView === 'expense' ? 'on' : ''}" onclick="catKindView='expense';route()">Spese</button><button class="${catKindView === 'income' ? 'on' : ''}" onclick="catKindView='income';route()">Entrate</button></div>
      <div class="list">${catList.map(c => `<button class="item" style="padding:10px 12px" onclick="editCategory('${c.id}')"><div class="tile" style="background:${hexA(c.color, .16)};color:${c.color};width:36px;height:36px">${svg(c.icon, 18)}</div><div class="col grow"><span class="truncate" style="font-weight:700">${esc(c.name)}</span><span class="small muted">${counts[c.id] || 0} movimenti${c.excluded ? ' · non conta nelle spese' : ''}</span></div><span class="small muted num">${c.budget ? fmtInt(c.budget) + ' €' : ''}</span></button>`).join('') || '<div class="empty">Nessuna categoria.</div>'}</div>
      <button class="btn sm" onclick="addCategory()">${svg('plus', 16, 2.5)} Nuova categoria</button>
      <span class="hint">Tocca una categoria per cambiare nome, impostare il budget mensile, escluderla dal totale delle spese (utile per gli investimenti) o unirla a un'altra.</span>`;
  const data = `
      <button class="btn sm" onclick="go('#importa')">Importa dati (Wallet, log, backup)</button>
      <button class="btn sm" onclick="exportJSON()">Esporta backup completo (JSON)</button>
      <button class="btn sm" onclick="exportCSV()">Esporta movimenti (CSV)</button>
      <button class="btn danger sm" onclick="wipe()">Cancella tutti i dati locali</button>
      <span class="hint">${live(S.expenses).length} movimenti, ${live(S.habitLogs).length} registrazioni di attività.</span>`;
  return `
    <div class="row between"><span class="title">Impostazioni</span><button class="chip" onclick="history.back()" aria-label="Chiudi">${svg('x', 16, 2.5)}</button></div>
    <div class="field"><label>Il tuo nome</label><input value="${esc(s.name)}" onchange="S.settings.name=this.value.trim();save(false)" placeholder="Come vuoi essere salutato"></div>
    <div class="field"><label>Aspetto</label><div class="segmented" style="align-self:flex-start">${[['system', 'Sistema'], ['dark', 'Dark'], ['minimal', 'Minimal']].map(([v, l]) => `<button class="${s.theme === v ? 'on' : ''}" onclick="S.settings.theme='${v}';save(false);applyTheme();route()">${l}</button>`).join('')}</div><span class="hint">"Sistema" segue il tema chiaro/scuro di Android: chiaro = minimal, scuro = dark.</span></div>
    ${det('data', 'Dati e importazione', data, true)}
    ${det('cats', 'Categorie e budget', categories)}
    ${det('gdrive', 'Google Drive', gdrive)}
    ${det('ai', 'Lettura scontrini con AI', ai, !AI.configured())}
    ${det('acc', 'Conti', `<input value="${esc(S.accounts.join(', '))}" onchange="S.accounts=this.value.split(',').map(x=>x.trim()).filter(Boolean);save()"><span class="hint">Separati da virgola.</span>`)}`;
}
function editCategory(id) {
  const c = catById(id), kind = c.kind || 'expense', n = live(S.expenses).filter(e => e.cat === id).length;
  const others = cats(kind).filter(x => x.id !== id).sort((a, b) => a.name.localeCompare(b.name));
  sheet(`
    <div class="col" style="gap:2px"><span style="font-weight:800;font-size:18px">${esc(c.name)}</span><span class="small muted">${n} movimenti · ${kind === 'income' ? 'entrata' : 'spesa'}</span></div>
    <div class="field"><label>Nome</label><input id="c-name" value="${esc(c.name)}"></div>
    ${kind === 'expense' ? `<div class="field"><label>Budget mensile (€)</label><input id="c-budget" type="number" min="0" inputmode="decimal" value="${c.budget || ''}" placeholder="Nessun budget"></div>
    <label class="row" style="gap:12px;cursor:pointer"><input type="checkbox" id="c-excl" ${c.excluded ? 'checked' : ''} style="width:24px;min-height:24px;padding:0"><span style="font-size:14px;line-height:1.4">Non conta nel totale delle spese (per esempio gli investimenti)</span></label>` : ''}
    ${catStyleFields(c)}
    <button class="btn primary" onclick="saveCategory('${id}')">Salva</button>
    ${others.length ? `<div class="field"><label>Unisci in un'altra categoria</label><select id="c-merge"><option value="">Scegli la categoria di destinazione</option>${others.map(o => `<option value="${o.id}">${esc(o.name)}</option>`).join('')}</select><span class="hint">I ${n} movimenti passano alla categoria scelta e questa viene rimossa.</span></div>
    <button class="btn" onclick="mergeCategory('${id}')">Unisci</button>` : ''}
    ${n === 0 ? `<button class="btn danger" onclick="removeCategory('${id}')">Elimina categoria</button>` : `<span class="hint">Per eliminare una categoria che ha movimenti, uniscila prima in un'altra.</span>`}`);
}
function catStyleFields(c) {
  return `<div class="field"><label>Icona</label><div class="row" style="flex-wrap:wrap;gap:8px">${CAT_ICONS.map(ic => `<button class="chip ${ic === c.icon ? 'on' : ''}" data-icon="${ic}" onclick="pick(this)" aria-label="${ic}">${svg(ic, 18)}</button>`).join('')}</div></div>
    <div class="field"><label>Colore</label><div class="row" style="flex-wrap:wrap;gap:8px">${PALETTE.map(col => `<button class="chip ${col === c.color ? 'on' : ''}" data-color="${col}" style="width:44px;padding:0" onclick="pick(this)" aria-label="${col}"><span class="dot" style="background:${col};width:16px;height:16px"></span></button>`).join('')}</div></div>`;
}
function saveCategory(id) {
  const c = catById(id), name = $('#c-name').value.trim(); if (!name) return toast('Il nome non può essere vuoto');
  if (name !== c.name) c.aliases = [...new Set([...(c.aliases || []), c.name])];
  c.name = name; if ($('#c-budget')) c.budget = Math.max(0, Number($('#c-budget').value) || 0); if ($('#c-excl')) c.excluded = $('#c-excl').checked;
  c.icon = $('#sheet .chip.on[data-icon]')?.dataset.icon || c.icon; c.color = $('#sheet .chip.on[data-color]')?.dataset.color || c.color;
  c.updatedAt = Date.now(); save(); closeSheet(); route();
}
function mergeCategory(id) {
  const to = $('#c-merge').value; if (!to) return toast('Scegli la categoria di destinazione');
  const from = catById(id), dest = catById(to);
  if (!confirm(`Unire "${from.name}" in "${dest.name}"?`)) return;
  const now = Date.now(); S.expenses.forEach(e => { if (e.cat === id) { e.cat = to; e.updatedAt = now; } });
  dest.aliases = [...new Set([...(dest.aliases || []), ...(from.aliases || []), from.name])]; dest.updatedAt = now;
  from.deleted = true; from.updatedAt = now; save(); closeSheet(); toast('Categorie unite'); route();
}
function removeCategory(id) { const c = catById(id); c.deleted = true; c.updatedAt = Date.now(); save(); closeSheet(); route(); }
function addCategory() {
  const c = { color: PALETTE[S.categories.length % PALETTE.length], icon: 'tag' };
  sheet(`<span style="font-weight:800;font-size:18px">Nuova categoria ${catKindView === 'income' ? 'di entrata' : 'di spesa'}</span>
    <div class="field"><label>Nome</label><input id="c-name" placeholder="Es. Animali"></div>
    ${catKindView === 'expense' ? `<div class="field"><label>Budget mensile (€)</label><input id="c-budget" type="number" min="0" inputmode="decimal" placeholder="Nessun budget"></div>` : ''}
    ${catStyleFields(c)}
    <button class="btn primary" onclick="createCategory()">Aggiungi</button>`);
}
function createCategory() {
  const name = $('#c-name').value.trim(); if (!name) return toast('Dai un nome alla categoria');
  if (findCategory(name, catKindView)) return toast('Esiste già una categoria con questo nome');
  const c = ensureCategory(name, catKindView);
  c.icon = $('#sheet .chip.on[data-icon]')?.dataset.icon || c.icon; c.color = $('#sheet .chip.on[data-color]')?.dataset.color || c.color;
  if ($('#c-budget')) c.budget = Math.max(0, Number($('#c-budget').value) || 0);
  c.updatedAt = Date.now(); save(); closeSheet(); route();
}
function download(name, content, type) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([content], { type })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); }
function exportJSON() { download(`spese-backup-${todayISO()}.json`, JSON.stringify(Drive.payload(), null, 2), 'application/json'); }
function exportCSV() {
  const rows = [['data', 'ora', 'tipo', 'importo', 'categoria', 'nota', 'conto'], ...live(S.expenses).sort((a, b) => a.date.localeCompare(b.date) || (a.time || '').localeCompare(b.time || '')).map(e => [e.date, e.time || '', typeOf(e) === 'income' ? 'entrata' : 'spesa', String(e.amount).replace('.', ','), catById(e.cat).name, e.note || '', e.account || ''])];
  download(`movimenti-${todayISO()}.csv`, '\ufeff' + rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(';')).join('\n'), 'text/csv');
}
function wipe() { if (confirm('Cancellare tutti i dati salvati su questo telefono? La copia su Drive resta.')) { localStorage.removeItem(KEY); location.reload(); } }

// ---------- Importazione ----------
// Riconosce da sola tre tipi di file: export Wallet (CSV), log attività (CSV, un file per attività) e backup dell'app (JSON).
const IT_MONTHS = { gen: 1, feb: 2, mar: 3, apr: 4, mag: 5, giu: 6, lug: 7, ago: 8, set: 9, ott: 10, nov: 11, dic: 12 };
function parseCSV(text) {
  text = String(text).replace(/^\uFEFF/, '');
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
    else if (c !== '\r') cur += c;
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
  return rows.filter(r => r.some(c => c && c.trim()));
}
function to24(t) {
  const m = String(t || '').trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i); if (!m) return '';
  let h = +m[1]; if (m[3]) { const pm = /pm/i.test(m[3]); if (h === 12) h = pm ? 12 : 0; else if (pm) h += 12; }
  return String(h).padStart(2, '0') + ':' + m[2];
}
function parseLogRows(rows) {
  const out = [];
  rows.forEach(r => {
    const m = String(r[0] || '').trim().toLowerCase().match(/^([a-zà-ù]{3})\s+(\d{1,2})\s+(\d{4})$/);
    if (!m || !IT_MONTHS[m[1]]) return;
    out.push({ date: `${m[3]}-${String(IT_MONTHS[m[1]]).padStart(2, '0')}-${m[2].padStart(2, '0')}`, time: to24(r[1]), note: (r.slice(3).find(c => c && c.trim()) || '').trim() });
  });
  return out;
}
function parseWalletRows(rows) {
  const h = rows[0].map(x => x.trim().toLowerCase()), ix = n => h.indexOf(n), out = [];
  rows.slice(1).forEach(r => {
    const amount = parseFloat(r[ix('amount')]), date = (r[ix('date')] || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || isNaN(amount)) return;
    out.push({ date, time: (r[ix('time')] || '').trim(), type: (r[ix('type')] || '').trim() === 'income' ? 'income' : 'expense', amount: Math.abs(amount), cat: (r[ix('category')] || '').trim() || 'Senza categoria', account: (r[ix('account')] || '').trim(), label: (r[ix('labels')] || '').trim() });
  });
  return out;
}
// Toglie dal nome il timestamp dell'export ("Read_ott_05_2026_11_35_02_PM" diventa "Read").
const HABIT_STAMP = /[\s_-]+(?:gen|feb|mar|apr|mag|giu|lug|ago|set|ott|nov|dic|jan|may|jun|jul|aug|sep|oct|dec)[a-z]*[\s_-]+\d{1,2}[\s_-]+\d{4}.*$/i;
const cleanHabitName = n => { const t = String(n).replace(HABIT_STAMP, '').replace(/[_-]+/g, ' ').replace(/\s*\(\d+\)$/, '').replace(/\s+/g, ' ').trim(); return t.replace(/^./, c => c.toUpperCase()); };
const habitNameFromFile = fn => cleanHabitName(fn.replace(/\.[a-z0-9]{2,4}$/i, ''));
function detectFile(name, text) {
  const t = String(text).trimStart();
  if (t[0] === '{') { try { const j = JSON.parse(t); if (j && (j.expenses || j.habitLogs || j.habits)) return { kind: 'backup', data: j }; } catch (e) { /* non valido */ } return { kind: 'unknown' }; }
  const rows = parseCSV(text); if (!rows.length) return { kind: 'unknown' };
  const head = rows[0].map(x => x.trim().toLowerCase());
  if (head.includes('date') && head.includes('amount') && head.includes('category')) { const recs = parseWalletRows(rows); return recs.length ? { kind: 'wallet', recs } : { kind: 'unknown' }; }
  const recs = parseLogRows(rows);
  if (recs.length && recs.length >= rows.length * 0.8) return { kind: 'log', habit: habitNameFromFile(name), recs };
  return { kind: 'unknown' };
}
function analyzeFiles(files) {
  const plan = { wallet: [], logs: {}, backups: [], unknown: [] };
  files.forEach(f => {
    const d = detectFile(f.name, f.text);
    if (d.kind === 'wallet') plan.wallet.push(...d.recs);
    else if (d.kind === 'log') { const k = slug(d.habit); const g = plan.logs[k] = plan.logs[k] || { names: [], recs: [] }; g.names.push(d.habit); g.recs.push(...d.recs); }
    else if (d.kind === 'backup') plan.backups.push(d.data);
    else plan.unknown.push(f.name);
  });
  return plan;
}
const moneyKey = (date, time, type, amount, cat, account) => [date, time || '', type, Number(amount).toFixed(2), String(cat).toLowerCase(), account || ''].join('|');
function diffMoney(recs) {
  const have = new Map();
  live(S.expenses).forEach(e => { const k = moneyKey(e.date, e.time, typeOf(e), e.amount, catById(e.cat).name, e.account); have.set(k, (have.get(k) || 0) + 1); });
  const fresh = []; let dup = 0;
  recs.forEach(r => { const k = moneyKey(r.date, r.time, r.type, r.amount, (findCategory(r.cat, r.type) || { name: r.cat }).name, r.account); const n = have.get(k) || 0; if (n > 0) { have.set(k, n - 1); dup++; } else fresh.push(r); });
  return { fresh, dup };
}
function diffLogs(habitKey, recs) {
  const h = live(S.habits).find(x => slug(x.name) === habitKey); const have = new Map();
  if (h) logsOf(h.id).forEach(l => { const k = l.date + '|' + (l.time || ''); have.set(k, (have.get(k) || 0) + 1); });
  const fresh = []; let dup = 0;
  recs.forEach(r => { const k = r.date + '|' + (r.time || ''); const n = have.get(k) || 0; if (n > 0) { have.set(k, n - 1); dup++; } else fresh.push(r); });
  return { fresh, dup };
}
function bestName(names) { return names.slice().sort((a, b) => (b.match(/[A-ZÀ-Ý]/g) || []).length - (a.match(/[A-ZÀ-Ý]/g) || []).length)[0].replace(/^./, c => c.toUpperCase()); }
function findCategory(name, type) {
  const kind = type === 'income' ? 'income' : 'expense', n = String(name).toLowerCase();
  return live(S.categories).find(x => (x.kind || 'expense') === kind && (x.name.toLowerCase() === n || (x.aliases || []).some(a => a.toLowerCase() === n)));
}
function ensureCategory(name, type) {
  const kind = type === 'income' ? 'income' : 'expense';
  let c = findCategory(name, type);
  if (c) return c;
  let id = (kind === 'income' ? 'i-' : 'e-') + slug(name); while (S.categories.some(x => x.id === id)) id += '-2';
  const n = S.categories.length;
  c = { id, name, kind, color: PALETTE[n % PALETTE.length], icon: iconFor(name), budget: 0, excluded: false, updatedAt: Date.now() };
  S.categories.push(c); return c;
}
function dropPristineDefaults() {
  const used = new Set(S.expenses.map(e => e.cat));
  S.categories = S.categories.filter(c => !(c.updatedAt === 1 && !used.has(c.id)));
  if (JSON.stringify(S.accounts) === JSON.stringify(DEFAULT_ACCOUNTS)) S.accounts = [];
}
function applyPlan(plan) {
  const now = Date.now(), res = { exp: 0, logs: 0, dup: 0, habits: 0 };
  plan.backups.forEach(b => {
    if ((b.categories || []).length) dropPristineDefaults();
    S.categories = Drive.mergeArr(S.categories, b.categories || []);
    S.expenses = Drive.mergeArr(S.expenses, b.expenses || []);
    S.habits = Drive.mergeArr(S.habits, b.habits || []);
    S.habitLogs = Drive.mergeArr(S.habitLogs, b.habitLogs || []);
    S.accounts = [...new Set([...S.accounts, ...(b.accounts || [])])];
    res.exp += (b.expenses || []).length; res.logs += (b.habitLogs || []).length; res.habits += (b.habits || []).length;
  });
  if (plan.wallet.length) {
    dropPristineDefaults();
    const { fresh, dup } = diffMoney(plan.wallet); res.dup += dup;
    fresh.forEach(r => {
      const cat = ensureCategory(r.cat, r.type);
      S.expenses.push({ id: uid(), type: r.type, amount: r.amount, cat: cat.id, note: r.label, date: r.date, time: r.time, account: r.account, source: 'import', updatedAt: now });
      if (r.account && !S.accounts.includes(r.account)) S.accounts.push(r.account);
    });
    res.exp += fresh.length;
  }
  Object.entries(plan.logs).forEach(([k, g]) => {
    let h = live(S.habits).find(x => slug(x.name) === k);
    if (!h) { const name = bestName(g.names), n = S.habits.length; h = { id: k, name, color: PALETTE[n % PALETTE.length], icon: habitIconFor(name), order: Math.max(0, ...S.habits.map(x => x.order ?? 0)) + 1, updatedAt: now }; if (habitById(h.id)) h.id = k + '-' + uid().slice(-4); S.habits.push(h); res.habits++; }
    const { fresh, dup } = diffLogs(k, g.recs); res.dup += dup;
    fresh.forEach(r => S.habitLogs.push({ id: uid(), habitId: h.id, date: r.date, time: r.time, note: r.note, updatedAt: now }));
    res.logs += fresh.length;
  });
  normalizeHabits(); save(); return res;
}
let pend = { plan: null };
async function onFiles(fileList) {
  const files = [];
  for (const f of fileList) {
    let text;
    if (/\.xlsx?$/i.test(f.name)) {
      if (!window.XLSX) { toast('Libreria Excel non caricata, controlla la connessione'); continue; }
      const wb = XLSX.read(await f.arrayBuffer(), { type: 'array', cellDates: true });
      text = XLSX.utils.sheet_to_csv(wb.Sheets[wb.SheetNames[0]], { dateNF: 'yyyy-mm-dd' });
    } else text = await f.text();
    files.push({ name: f.name, text });
  }
  pend = { plan: analyzeFiles(files) }; route();
}
function runImport() {
  const plan = pend.plan, res = applyPlan(plan); pend = { plan: null };
  toast(`Importati ${res.exp} movimenti e ${res.logs} registrazioni${res.dup ? ', ' + res.dup + ' già presenti saltati' : ''}`, 4000);
  go(plan.wallet.length || plan.backups.length ? '#home' : '#diario');
}
function viewImport() {
  const plan = pend.plan; let body = '';
  if (plan) {
    const cards = [];
    if (plan.wallet.length) { const { fresh, dup } = diffMoney(plan.wallet), ds = plan.wallet.map(r => r.date).sort(); const sp = fresh.filter(r => r.type === 'expense').length;
      cards.push(`<div class="item"><div class="tile" style="background:var(--surface-2);color:var(--accent)">${svg('cloud')}</div><div class="col grow"><span style="font-weight:700">Movimenti Wallet</span><span class="small muted">${plan.wallet.length} righe, dal ${longDate(ds[0])} al ${longDate(ds[ds.length - 1])}</span><span class="small">${fresh.length} nuovi (${sp} spese, ${fresh.length - sp} entrate)${dup ? ', ' + dup + ' già presenti' : ''}</span></div></div>`); }
    Object.entries(plan.logs).forEach(([k, g]) => { const { fresh, dup } = diffLogs(k, g.recs), ds = g.recs.map(r => r.date).sort(); const known = live(S.habits).some(x => slug(x.name) === k);
      cards.push(`<div class="item"><div class="tile" style="background:var(--surface-2);color:var(--accent)">${svg(habitIconFor(g.names[0]))}</div><div class="col grow"><span style="font-weight:700">${esc(bestName(g.names))}${known ? '' : ' (nuova)'}</span><span class="small muted">${g.recs.length} registrazioni, dal ${longDate(ds[0])} al ${longDate(ds[ds.length - 1])}</span><span class="small">${fresh.length} nuove${dup ? ', ' + dup + ' già presenti' : ''}</span></div></div>`); });
    plan.backups.forEach(b => cards.push(`<div class="item"><div class="tile" style="background:var(--surface-2);color:var(--accent)">${svg('cloud')}</div><div class="col grow"><span style="font-weight:700">Backup dell'app</span><span class="small muted">${(b.expenses || []).length} movimenti, ${(b.habitLogs || []).length} registrazioni, ${(b.habits || []).length} attività, ${(b.categories || []).length} categorie</span></div></div>`));
    body = `${cards.length ? `<div class="list">${cards.join('')}</div><button class="btn primary" onclick="runImport()">${svg('check', 20, 3)} Importa tutto</button>` : '<div class="empty">Nessun file riconosciuto.</div>'}
      ${plan.unknown.length ? `<div class="empty" style="color:var(--warn);border-color:var(--warn)">Non riconosciuti: ${plan.unknown.map(esc).join(', ')}</div>` : ''}`;
  }
  return `
    <div class="row between"><button class="chip" onclick="history.back()" aria-label="Indietro">${svg('back', 16, 2.5)}</button><span style="font-weight:800">Importa dati</span><span style="width:40px"></span></div>
    <p class="muted" style="font-size:13px;line-height:1.55;margin:0">Scegli uno o più file insieme. L'app riconosce da sola il tipo:<br>· export di Wallet (.csv)<br>· log delle attività (.csv, un file per attività, anche di più anni)<br>· backup dell'app (.json)<br>Quello che c'è già non viene duplicato, quindi puoi reimportare senza problemi.</p>
    <label class="btn" style="cursor:pointer">Scegli i file<input type="file" multiple accept=".csv,.json,.txt,.xlsx,.xls" class="hidden" onchange="onFiles(this.files)"></label>
    ${body}`;
}

// ---------- Avvio ----------
applyTheme();
normalizeHabits();
route();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
window.addEventListener('load', () => { setTimeout(() => { if (S.settings.clientId) Drive.sync().catch(() => {}); }, 1200); });
window.addEventListener('online', () => { if (S.settings.clientId) Drive.sync().catch(() => {}); });
