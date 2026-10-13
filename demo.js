/* Modalità demo: dati di esempio generati al momento. Le modifiche restano in memoria e spariscono all'uscita. */
'use strict';

// Uscita protetta: si usa il PIN del blocco app; se non c'è, un codice scelto entrando in demo.
const DEMO_PIN = 'slow.demoPin';
const demoPinCfg = () => { try { return JSON.parse(localStorage.getItem(DEMO_PIN) || 'null'); } catch (e) { return null; } };
const pinField = (id, label) => `<div class="field"><label>${label}</label><input id="${id}" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="6" autocomplete="off"></div>`;
function demoEnter() {
  if (!window.crypto || !crypto.subtle) return toast('Serve una connessione sicura (https)');
  // Entrare non chiede nulla. Serve solo sapere quale codice chiederà l'uscita: il PIN del blocco app o il codice demo, scelto una volta sola.
  if (Lock.cfg() || demoPinCfg()) return demoGo();
  sheet(`<span style="font-weight:800;font-size:18px">Codice per uscire dalla demo</span>
    <span class="hint">Scegli una volta sola un codice di 4-6 cifre: servirà solo per uscire dalla demo, entrare non lo chiede. Così puoi dare il telefono a qualcuno senza che veda i tuoi dati.</span>
    ${pinField('d-new', 'Codice')}${pinField('d-new2', 'Ripeti il codice')}
    <button class="btn primary" onclick="demoSetPin()">Entra in modalità demo</button>`);
}
async function demoSetPin() {
  const a = $('#d-new').value, b = $('#d-new2').value;
  if (!/^\d{4,6}$/.test(a)) return toast('Il codice deve avere da 4 a 6 cifre');
  if (a !== b) return toast('I due codici non coincidono');
  const salt = Lock.b64(Lock.rand(16)); localStorage.setItem(DEMO_PIN, JSON.stringify({ salt, hash: await Lock.hash(a, salt) }));
  demoGo();
}
function demoGo() { try { localStorage.setItem('slow.demo', '1'); } catch (e) { return toast('Impossibile attivare la demo'); } location.hash = '#home'; location.reload(); }
function demoExit() {
  sheet(`<span style="font-weight:800;font-size:18px">Uscire dalla demo</span>
    ${pinField('d-pin', Lock.cfg() ? 'PIN del blocco app' : 'Codice di uscita dalla demo')}
    <button class="btn primary" onclick="demoExitCheck()">Esci e torna ai dati</button>`);
}
async function demoExitCheck() {
  const v = $('#d-pin').value, d = demoPinCfg();
  const ok = Lock.cfg() ? await Lock.check(v) : !!d && (await Lock.hash(v, d.salt)) === d.hash;
  if (!ok) { if (navigator.vibrate) navigator.vibrate([30, 40, 30]); return toast('Codice errato'); }
  localStorage.removeItem('slow.demo'); location.hash = '#home'; location.reload();
}

function demoData() {
  // Generatore pseudo-casuale con seme fisso: la demo è sempre uguale.
  let seed = 20261013; const rnd = () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const between = (a, b) => Math.round((a + rnd() * (b - a)) * 100) / 100, pick = a => a[Math.floor(rnd() * a.length)], now = Date.now(), today = todayISO();
  const categories = defaultCategories().map(c => ({ ...c, budget: { spesa: 420, ristoranti: 260, trasporti: 160, svago: 120, salute: 60 }[c.id] || 0 }));
  categories.push({ id: 'e-abbonamenti', name: 'Abbonamenti', kind: 'expense', color: '#B59CFF', icon: 'play', budget: 40, excluded: false, group: 'svago', updatedAt: 1 });
  categories.push({ id: 'e-investimenti', name: 'Investimenti', kind: 'expense', color: '#6EE7B7', icon: 'bank', budget: 0, excluded: true, group: 'finanze', updatedAt: 1 });
  const ex = []; let n = 0; const add = (date, cat, amount, note, type = 'expense', account = 'Carta', extra = {}) => ex.push({ id: 'demo-' + (n++), type, amount, cat, note, date, time: `${String(8 + Math.floor(rnd() * 13)).padStart(2, '0')}:${String(Math.floor(rnd() * 60)).padStart(2, '0')}`, account, source: 'demo', updatedAt: 1, ...extra });
  for (let i = 430; i >= 0; i--) {
    const d = addDays(today, -i), dt = new Date(d + 'T12:00:00'), dow = dt.getDay(), dom = dt.getDate();
    if (dow === 2 || dow === 6) add(d, 'spesa', between(35, 95), pick(['Esselunga', 'Coop', 'Conad', 'Lidl']));
    if (rnd() < 0.55 && dow !== 0) add(d, 'ristoranti', between(1.4, 6.5), 'Bar Centrale', 'expense', pick(['Carta', 'Satispay']));
    if (dow === 5 || (dow === 6 && rnd() < 0.5)) add(d, 'ristoranti', between(22, 75), pick(['Trattoria Da Mario', 'Sushi Zen', 'Pizzeria Vesuvio', 'Osteria del Ponte']));
    if (dom === 3 || dom === 18) add(d, 'trasporti', between(48, 72), 'Eni');
    if (rnd() < 0.08) add(d, 'trasporti', between(4, 18), pick(['Telepass', 'Parcheggio centro', 'Trenitalia']));
    if (dom === 1) add(d, 'casa', 750, 'Affitto');
    if (dom === 12) add(d, 'casa', between(70, 140), 'Luce e gas');
    if (rnd() < 0.05) add(d, 'salute', between(8, 45), 'Farmacia Comunale');
    if (rnd() < 0.07) add(d, 'svago', between(12, 60), pick(['Cinema Odeon', 'Libreria Feltrinelli', 'Concerto', 'Amazon']));
    if (dom === 15) add(d, 'e-abbonamenti', 13.99, 'Netflix', 'expense', 'Carta', { source: 'planned' });
    if (dom === 16) add(d, 'e-abbonamenti', 11.99, 'Spotify', 'expense', 'Carta', { source: 'planned' });
    if (dom === 2) add(d, 'e-investimenti', 400, 'PAC ETF', 'expense', 'Broker', { source: 'planned' });
    if (dom === 27) add(d, 'stipendio', 2780, 'Stipendio', 'income', 'Conto');
    if (dom === 20 && dt.getMonth() === 11) add(d, 'stipendio', 2100, 'Tredicesima', 'income', 'Conto');
  }
  // Portafoglio: tre ETF comprati ogni mese a prezzi che salgono con qualche oscillazione.
  const holdings = [
    { id: 'demo-world', name: 'iShares Core MSCI World', isin: 'IE00B4L5Y983', symbol: 'EUNL.DE', type: 'etf', base: 88, step: 1.3, pac: 280 },
    { id: 'demo-em', name: 'iShares Core MSCI EM IMI', isin: 'IE00BKM4GZ66', symbol: 'IS3N.DE', type: 'etf', base: 30, step: 0.25, pac: 60 },
    { id: 'demo-bond', name: 'Xtrackers Global Government Bond EUR Hedged', isin: 'LU0378818131', symbol: 'DBZB.DE', type: 'obbligazione', base: 199, step: 0.15, pac: 60 },
  ];
  const trades = [], snaps = [];
  holdings.forEach(h => { for (let m = 13; m >= 0; m--) { const d = localISO(new Date(new Date().getFullYear(), new Date().getMonth() - m, 2)); if (d > today) continue; const price = Math.round((h.base + h.step * (13 - m) + between(-2, 2) * h.step) * 100) / 100; trades.push({ id: `demo-t-${h.id}-${m}`, holdingId: h.id, kind: 'buy', date: d, qty: Math.round(h.pac / price * 1e4) / 1e4, price, fee: 0, updatedAt: 1 }); } h.price = Math.round((h.base + h.step * 14.4) * 100) / 100; h.prev = Math.round(h.price * 0.996 * 100) / 100; h.priceAt = now; h.manual = true; });
  for (let i = 40; i >= 0; i -= 3) snaps.push({ id: addDays(today, -i), date: addDays(today, -i), value: 5200 + (40 - i) * 14 + between(-60, 60), cost: 5000, updatedAt: 1 });
  const planned = [
    { id: 'demo-p1', name: 'Netflix', amount: 13.99, day: 15, cat: 'e-abbonamenti' }, { id: 'demo-p2', name: 'Spotify', amount: 11.99, day: 16, cat: 'e-abbonamenti' },
    { id: 'demo-p3', name: 'Palestra', amount: 39, day: 5, cat: 'salute' }, { id: 'demo-p4', name: 'Affitto', amount: 750, day: 1, cat: 'casa' },
    { id: 'demo-p5', name: 'PAC MSCI World', amount: 280, day: 2, cat: 'e-investimenti', holdingId: 'demo-world' }, { id: 'demo-p6', name: 'PAC EM IMI', amount: 60, day: 2, cat: 'e-investimenti', holdingId: 'demo-em' },
    { id: 'demo-p7', name: 'PAC Obbligazioni', amount: 60, day: 2, cat: 'e-investimenti', holdingId: 'demo-bond' },
  ].map(p => ({ every: 1, start: addDays(today, 1), end: null, type: 'expense', account: 'Carta', auto: true, active: true, updatedAt: 1, ...p }));
  const habits = [{ id: 'demo-workout', name: 'Workout', icon: 'dumbbell', color: '#FFB36B', f: 0.45 }, { id: 'demo-read', name: 'Lettura', icon: 'book', color: '#7AD7F0', f: 0.6 }, { id: 'demo-medit', name: 'Meditazione', icon: 'clock', color: '#B59CFF', f: 0.3 }];
  const habitLogs = []; habits.forEach(h => { for (let i = 300; i >= 1; i--) if (rnd() < h.f) habitLogs.push({ id: `demo-l-${h.id}-${i}`, habitId: h.id, date: addDays(today, -i), time: '', updatedAt: 1 }); });
  const inbox = [
    { id: 'demo-n1', at: now - 3600e3, date: today, time: '09:12', amount: 3.2, merchant: 'Bar Centrale', type: 'expense', apps: ['Satispay'], cat: 'ristoranti', dup: null, status: 'pending', updatedAt: 1 },
    { id: 'demo-n2', at: now - 7200e3, date: today, time: '08:05', amount: 58.4, merchant: 'Esselunga', type: 'expense', apps: ['Nexi'], cat: 'spesa', dup: null, status: 'pending', updatedAt: 1 },
  ];
  return {
    expenses: ex, categories, habits: habits.map(({ f, ...h }) => ({ ...h, updatedAt: 1 })), habitLogs, accounts: ['Carta', 'Satispay', 'Conto', 'Broker'],
    planned, holdings: holdings.map(({ base, step, pac, ...h }) => ({ ...h, updatedAt: 1 })), trades, snaps, inbox, rules: [], notifLog: [],
    settings: { ...S.settings, name: 'Demo', plannedSeeded: true, driveOn: false, anaWidgets: null, liquidity: 9000 },
    meta: { driveFileId: null, lastSync: null },
  };
}
function demoSettings() {
  return DEMO ? `<span class="hint">Stai guardando dati di esempio. Puoi provare tutto: le modifiche spariscono all'uscita. Per uscire serve il codice.</span><button class="btn sm primary" onclick="demoExit()">Esci dalla demo e torna ai tuoi dati</button>`
    : `<span class="hint">Mostra l'app con dati di esempio: utile per provarla o farla vedere a qualcuno. Entrare è immediato; per uscire serve ${Lock.cfg() ? 'il PIN del blocco app' : demoPinCfg() ? 'il codice demo che hai scelto' : 'un codice che scegli la prima volta'}. Niente viene salvato e i tuoi dati non vengono toccati.</span><button class="btn sm" onclick="demoEnter()">Entra in modalità demo</button>${!Lock.cfg() && demoPinCfg() ? '<button class="btn sm" onclick="localStorage.removeItem(DEMO_PIN);demoEnter()">Cambia il codice demo</button>' : ''}`;
}
