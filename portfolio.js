/* Portafoglio investimenti: strumenti (ISIN/ticker), operazioni, prezzi, rendimento, allocazione e tendenza. */
'use strict';

const HOLDING_TYPES = { etf: 'ETF', azione: 'Azioni', obbligazione: 'Obbligazioni', crypto: 'Cripto', altro: 'Altro' };
const TRADE_LABEL = { buy: 'Acquisto', sell: 'Vendita', div: 'Dividendo' };
const holdingsLive = () => live(S.holdings);
const holdingById = id => S.holdings.find(h => h.id === id);
const tradesOf = hid => live(S.trades).filter(t => t.holdingId === hid).sort((a, b) => a.date.localeCompare(b.date) || (a.updatedAt || 0) - (b.updatedAt || 0));
const fmtQty = q => Number(q || 0).toLocaleString('it-IT', { maximumFractionDigits: 4 });
const colorOfHolding = h => PALETTE[Math.max(0, holdingsLive().findIndex(x => x.id === h.id)) % PALETTE.length];
const gainColor = n => (n >= 0 ? 'var(--accent)' : 'var(--warn)');

// Posizione di uno strumento col metodo del prezzo medio ponderato.
function position(h) {
  let qty = 0, cost = 0, realized = 0, div = 0;
  tradesOf(h.id).forEach(t => {
    const q = Number(t.qty || 0), pr = Number(t.price || 0), fee = Number(t.fee || 0);
    if (t.kind === 'buy') { qty += q; cost += q * pr + fee; }
    else if (t.kind === 'sell') { const avg = qty ? cost / qty : 0, sq = Math.min(q, qty); realized += sq * pr - fee - avg * sq; cost -= avg * sq; qty -= sq; }
    else if (t.kind === 'div') div += Number(t.amount || 0);
  });
  if (qty < 1e-9) { qty = 0; cost = 0; }
  const price = Number(h.price || 0), value = qty * price;
  return { qty, cost, avg: qty ? cost / qty : 0, price, value, gain: value - cost, pct: cost > 0 ? (value - cost) / cost * 100 : 0, realized, div, day: h.prev && qty ? qty * (price - h.prev) : 0, missing: qty > 0 && !price };
}
function portfolioTotals() {
  const rows = holdingsLive().map(h => ({ h, p: position(h) })), sum = k => rows.reduce((a, r) => a + r.p[k], 0);
  const t = { rows, value: sum('value'), cost: sum('cost'), gain: sum('gain'), realized: sum('realized'), div: sum('div'), day: sum('day'), missing: rows.filter(r => r.p.missing).length };
  t.pct = t.cost > 0 ? t.gain / t.cost * 100 : 0; t.total = t.gain + t.realized + t.div;
  const prevValue = t.value - t.day; t.dayPct = prevValue > 0 ? t.day / prevValue * 100 : 0;
  return t;
}
// Una fotografia al giorno del valore del portafoglio: serve per disegnare l'andamento e la tendenza.
function snapshotPortfolio() {
  const T = portfolioTotals(); if (!T.value || T.missing) return;
  const today = todayISO(), cur = S.snaps.find(s => s.id === today), value = Math.round(T.value * 100) / 100, cost = Math.round(T.cost * 100) / 100;
  if (cur && cur.value === value && cur.cost === cost) return;
  const snap = { id: today, date: today, value, cost, updatedAt: Date.now() };
  if (cur) Object.assign(cur, snap); else S.snaps.push(snap);
  save(false);
}

// ---------- Prezzi ----------
const Quotes = {
  fxCache: {},
  // Yahoo Finance non ammette chiamate dirette dal browser: passa da un proxy (il tuo, se impostato; altrimenti uno pubblico).
  async json(url) {
    const tpl = (S.settings.proxyUrl || '').trim(), tries = []; let err = 'rete';
    // Nell'app Android le richieste sono native: Yahoo si chiama direttamente, il proxy serve solo come riserva.
    if (typeof Native !== 'undefined' && Native.on) tries.push(url);
    if (tpl) tries.push(tpl.includes('{url}') ? tpl.replace('{url}', encodeURIComponent(url)) : tpl + encodeURIComponent(url));
    tries.push('https://api.allorigins.win/raw?url=' + encodeURIComponent(url));
    for (const t of tries) { try { const r = await fetch(t); if (r.ok) return await r.json(); err = 'HTTP ' + r.status; } catch (e) { err = 'rete'; } }
    throw new Error('prezzi non raggiungibili (' + err + ')');
  },
  async fx(cur) {
    if (!cur || cur === 'EUR') return 1; if (this.fxCache[cur]) return this.fxCache[cur];
    const j = await (await fetch(`https://data-api.ecb.europa.eu/service/data/EXR/D.${cur}.EUR.SP00.A?lastNObservations=1&format=jsondata`)).json();
    const obs = Object.values(Object.values(j.dataSets[0].series)[0].observations)[0][0]; return (this.fxCache[cur] = 1 / Number(obs));
  },
  async search(q) {
    const j = await this.json('https://query2.finance.yahoo.com/v1/finance/search?q=' + encodeURIComponent(q) + '&quotesCount=8&newsCount=0');
    return (j.quotes || []).filter(x => x.symbol && x.quoteType !== 'OPTION').map(x => ({ symbol: x.symbol, name: x.longname || x.shortname || x.symbol, exch: x.exchDisp || x.exchange || '', type: x.quoteType || '' }));
  },
  async yahoo(symbol) {
    const j = await this.json('https://query1.finance.yahoo.com/v8/finance/chart/' + encodeURIComponent(symbol) + '?range=5d&interval=1d');
    const r = j.chart && j.chart.result && j.chart.result[0]; if (!r) throw new Error('ticker non trovato: ' + symbol);
    const m = r.meta, closes = ((r.indicators.quote[0] || {}).close || []).filter(x => x != null); let cur = m.currency, k = 1;
    if (cur === 'GBp' || cur === 'GBX') { k = 0.01; cur = 'GBP'; }
    const f = (await this.fx(cur)) * k, last = m.regularMarketPrice ?? closes[closes.length - 1];
    return { price: last * f, prev: (closes.length > 1 ? closes[closes.length - 2] : m.chartPreviousClose) * f, name: m.longName || m.shortName || symbol, currency: m.currency };
  },
  async gecko(id) {
    const j = await (await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(id)}&vs_currencies=eur&include_24hr_change=true`)).json(), x = j[id];
    if (!x) throw new Error('cripto non trovata: ' + id); return { price: x.eur, prev: x.eur / (1 + (x.eur_24h_change || 0) / 100) };
  },
  async refresh(h) {
    if (!h.symbol) throw new Error('manca il ticker');
    const q = h.type === 'crypto' ? await this.gecko(h.symbol) : await this.yahoo(h.symbol);
    Object.assign(h, { price: q.price, prev: q.prev, priceAt: Date.now(), priceSrc: 'auto', updatedAt: Date.now() });
  },
};
let pfBusy = false, pfAutoDone = false;
// Ticker noti per ISIN: completano gli strumenti importati senza ticker (es. da Trade Republic).
const KNOWN_TICKERS = { IE000BI8OT95: 'WRDU.AS', IE00B5BMR087: 'SXR8.DE', LU0378818131: 'DBZB.DE', IE00BKM4GZ66: 'IS3N.DE', IE00B4L5Y983: 'EUNL.DE', IE00BK5BQT80: 'VWCE.DE' };
function fillTickers() {
  let n = 0; holdingsLive().forEach(h => { if (!h.symbol && KNOWN_TICKERS[h.isin]) { Object.assign(h, { symbol: KNOWN_TICKERS[h.isin], manual: false, updatedAt: Date.now() }); n++; } });
  if (n) save();
}
async function pfRefresh(silent) {
  if (pfBusy) return;
  fillTickers(); const hs = holdingsLive().filter(h => h.symbol && !h.manual && position(h).qty > 0);
  if (!hs.length) { if (!silent) toast('Nessuno strumento con ticker da aggiornare'); return; }
  pfBusy = true; if (!silent) toast('Aggiorno i prezzi…', 8000); let ok = 0, err = '';
  for (const h of hs) { try { await Quotes.refresh(h); ok++; } catch (e) { err = e.message; } }
  pfBusy = false; save(false); snapshotPortfolio();
  if (!silent || ok) toast(ok === hs.length ? 'Prezzi aggiornati' : ok ? `Aggiornati ${ok} su ${hs.length}: ${err}` : 'Aggiornamento non riuscito: ' + err, 4000);
  if (location.hash === '#portafoglio') route();
}

// ---------- Schermata ----------
let pfMode = 'strumenti';
function ago(ts) { if (!ts) return 'mai'; const m = Math.round((Date.now() - ts) / 60000); return m < 1 ? 'adesso' : m < 60 ? m + ' min fa' : m < 1440 ? Math.round(m / 60) + ' h fa' : Math.round(m / 1440) + ' g fa'; }
function pfHoldingRow(r) {
  const { h, p } = r, col = colorOfHolding(h);
  return `<button class="item" onclick="holdingSheet('${h.id}')">
    <div class="tile" style="background:${hexA(col, .16)};color:${col}">${svg('trend')}</div>
    <div class="col grow"><span class="truncate" style="font-weight:700">${esc(h.name)}</span><span class="small muted truncate">${p.qty ? fmtQty(p.qty) + ' quote' : 'Posizione chiusa'}${h.symbol ? ' · ' + esc(h.symbol) : ''}</span></div>
    <div class="col" style="align-items:flex-end;gap:2px">${p.missing ? '<span class="small" style="color:var(--warn)">Prezzo mancante</span>' : `<span class="num" style="font-size:16px;font-weight:600">${p.qty ? fmtMoney(p.value, false) : sgnMoney(p.realized + p.div)}</span>${p.qty ? `<span class="small num" style="color:${gainColor(p.gain)}">${sgnPct(p.pct)}</span>` : ''}`}</div>
  </button>`;
}
// ---------- Grafico del valore (stile Trade Republic / eToro) ----------
// Prezzi storici giornalieri da Yahoo, conservati sul dispositivo (non su Drive) e aggiornati due volte al giorno.
const HIST_KEY = 'slow.hist';
const histCache = () => { try { return JSON.parse(localStorage.getItem(HIST_KEY) || '{}'); } catch (e) { return {}; } };
let pfRange = '3M', pfHistBusy = false;
async function pfLoadHistory() {
  if (pfHistBusy || DEMO) return;
  const c = histCache(), need = holdingsLive().filter(h => h.symbol && h.type !== 'crypto' && position(h).qty > 0 && (!c[h.symbol] || Date.now() - c[h.symbol].at > 12 * 3600e3));
  if (!need.length) return;
  pfHistBusy = true; let changed = false;
  for (const h of need) {
    try {
      const j = await Quotes.json('https://query1.finance.yahoo.com/v8/finance/chart/' + encodeURIComponent(h.symbol) + '?range=5y&interval=1d'), r = j.chart.result[0];
      let cur = r.meta.currency, k = 1; if (cur === 'GBp' || cur === 'GBX') { k = 0.01; cur = 'GBP'; }
      const f = (await Quotes.fx(cur)) * k, cl = (r.indicators.quote[0] || {}).close || [];
      c[h.symbol] = { at: Date.now(), pts: r.timestamp.map((t, i) => [Math.floor(t / 86400), cl[i] == null ? null : Math.round(cl[i] * f * 1e4) / 1e4]).filter(p => p[1] != null) };
      changed = true;
    } catch (e) { /* senza storico si usano i prezzi delle operazioni */ }
  }
  pfHistBusy = false;
  if (changed) { try { localStorage.setItem(HIST_KEY, JSON.stringify(c)); } catch (e) { /* spazio pieno: niente cache */ } if (location.hash === '#portafoglio') route(); }
}
// Valore del portafoglio giorno per giorno: quote possedute × prezzo di quel giorno. "cost" = capitale investito.
function pfSeries() {
  const trs = live(S.trades).filter(t => t.kind !== 'div').sort((a, b) => a.date.localeCompare(b.date));
  if (!trs.length) return [];
  const c = histCache(), d0 = isoDay(trs[0].date), d1 = isoDay(todayISO()), hs = holdingsLive();
  const prices = {}; hs.forEach(h => {
    const pts = [...((h.symbol && c[h.symbol]) ? c[h.symbol].pts : []), ...tradesOf(h.id).filter(t => t.price > 0).map(t => [isoDay(t.date), Number(t.price)])];
    if (h.price) pts.push([d1, Number(h.price)]);
    prices[h.id] = pts.sort((a, b) => a[0] - b[0]);
  });
  const qty = {}, costH = {}, ptr = {}, last = {}; let ti = 0; const out = [];
  for (let d = d0; d <= d1; d++) {
    while (ti < trs.length && isoDay(trs[ti].date) <= d) {
      const t = trs[ti++], id = t.holdingId, q = Number(t.qty), held = qty[id] || 0;
      if (t.kind === 'buy') { qty[id] = held + q; costH[id] = (costH[id] || 0) + q * Number(t.price) + Number(t.fee || 0); }
      else if (t.kind === 'sell' && held > 0) { const sold = Math.min(q, held); costH[id] -= (costH[id] || 0) / held * sold; qty[id] = held - sold; } // vendita: esce il costo medio delle quote vendute
    }
    const cost = Object.values(costH).reduce((x, y) => x + y, 0);
    let v = 0;
    hs.forEach(h => { const pts = prices[h.id]; let i = ptr[h.id] || 0; while (i < pts.length && pts[i][0] <= d) { last[h.id] = pts[i][1]; i++; } ptr[h.id] = i; v += (qty[h.id] || 0) * (last[h.id] || 0); });
    out.push({ d, v: Math.round(v * 100) / 100, cost: Math.max(0, Math.round(cost * 100) / 100) });
  }
  return out;
}
const PF_RANGES = [['1S', 7], ['1M', 30], ['3M', 91], ['1A', 365], ['Max', 0]];
function pfChart(T) {
  const all = pfSeries(); if (all.length < 2) return '';
  const n = (PF_RANGES.find(r => r[0] === pfRange) || PF_RANGES[2])[1], pts = n ? all.slice(-n - 1) : all, a = pts[0], z = pts[pts.length - 1];
  // Rendimento del periodo al netto dei versamenti fatti nel periodo (come nelle app dei broker).
  const added = z.cost - a.cost, perf = (z.v - a.v) - added, pct = (a.v + Math.max(0, added)) ? perf / (a.v + Math.max(0, added)) * 100 : 0;
  const W = 340, H = 170, vs = pts.flatMap(p => [p.v, p.cost]), lo = Math.min(...vs) * 0.98, hi = Math.max(...vs) * 1.01;
  const X = i => (W * i) / (pts.length - 1), Y = v => 6 + (H - 12) * (1 - (v - lo) / ((hi - lo) || 1));
  const line = pts.map((p, i) => (i ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(p.v).toFixed(1)).join('');
  const inv = pts.map((p, i) => (i ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(p.cost).toFixed(1)).join('');
  const col = perf >= 0 ? 'var(--accent)' : 'var(--warn)';
  window.__pfPts = pts;
  const fmtD = d => new Date((d + 0.5) * 864e5).toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: n === 0 || n >= 365 ? '2-digit' : undefined, timeZone: 'UTC' });
  return `<div class="card col" style="gap:10px">
    <div class="row between"><span id="pf-scrub" class="small muted">${pfRange === 'Max' ? 'Da sempre' : 'Ultimo ' + { '1S': 'settimana', '1M': 'mese', '3M': 'trimestre', '1A': 'anno' }[pfRange]}</span>
      <span class="num" style="font-weight:800;color:${col}">${sgnMoney(perf)} (${sgnPct(pct)})</span></div>
    <svg viewBox="0 0 ${W} ${H}" width="100%" style="touch-action:pan-y" onpointermove="pfScrub(event,this)" onpointerleave="pfScrubEnd()" role="img" aria-label="Valore del portafoglio nel tempo">
      <defs><linearGradient id="pfg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:${perf >= 0 ? '#D4FF5B' : '#FFB36B'};stop-opacity:.28"/><stop offset="1" style="stop-color:${perf >= 0 ? '#D4FF5B' : '#FFB36B'};stop-opacity:0"/></linearGradient></defs>
      <path d="${line}L${W} ${H}L0 ${H}Z" fill="url(#pfg)"/>
      <path d="${inv}" style="fill:none;stroke:var(--muted);stroke-width:1.5;stroke-dasharray:3 5"/>
      <path d="${line}" style="fill:none;stroke:${col};stroke-width:2.5;stroke-linejoin:round;stroke-linecap:round"/>
      <line id="pf-cursor" x1="-10" x2="-10" y1="0" y2="${H}" style="stroke:var(--text);stroke-width:1;opacity:.5"/>
    </svg>
    ${holdingsLive().some(h => h.symbol && position(h).qty > 0 && !histCache()[h.symbol]) && !DEMO ? '<span class="small" style="color:var(--warn)">Storico prezzi non ancora scaricato: andamento approssimato.</span>' : ''}
    <div class="row between small muted"><span>${fmtD(a.d)}</span><span class="row" style="gap:6px"><span style="border-top:2px dashed var(--muted);width:14px;display:inline-block"></span>investito</span><span>Oggi</span></div>
    <div class="segmented" style="align-self:stretch;justify-content:space-between">${PF_RANGES.map(([k]) => `<button class="${pfRange === k ? 'on' : ''}" style="flex:1" onclick="pfRange='${k}';route()">${k}</button>`).join('')}</div>
  </div>`;
}
function pfScrub(ev, el) {
  const pts = window.__pfPts; if (!pts) return;
  const r = el.getBoundingClientRect(), i = Math.max(0, Math.min(pts.length - 1, Math.round((ev.clientX - r.left) / r.width * (pts.length - 1)))), p = pts[i];
  const c = $('#pf-cursor'); if (c) { const x = (340 * i) / (pts.length - 1); c.setAttribute('x1', x); c.setAttribute('x2', x); }
  const l = $('#pf-scrub'); if (l) l.innerHTML = `<b style="color:var(--text)">${fmtMoney(p.v)}</b> · ${new Date((p.d + 0.5) * 864e5).toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })} · investito ${fmtMoney(p.cost)}`;
}
function pfScrubEnd() { const c = $('#pf-cursor'); if (c) { c.setAttribute('x1', -10); c.setAttribute('x2', -10); } }

function viewPortfolio() {
  const T = portfolioTotals(), open = T.rows.filter(r => r.p.qty > 0).sort((a, b) => b.p.value - a.p.value), closed = T.rows.filter(r => !r.p.qty);
  const groups = {}; open.forEach(r => { const k = pfMode === 'tipo' ? (HOLDING_TYPES[r.h.type] || 'Altro') : r.h.name; groups[k] = groups[k] || { label: k, value: 0, color: pfMode === 'tipo' ? PALETTE[Object.keys(HOLDING_TYPES).findIndex(t => HOLDING_TYPES[t] === k) % PALETTE.length] : colorOfHolding(r.h) }; groups[k].value += r.p.value; });
  const items = Object.values(groups).filter(g => g.value > 0).sort((a, b) => b.value - a.value), [int, dec] = fmtMoney(T.value, false).split(',');
  const last = Math.max(0, ...holdingsLive().map(h => h.priceAt || 0)), adv = typeof pfAdvice === 'function' ? pfAdvice() : null;
  return `
    <div class="row between"><span class="title">Portafoglio</span>
      <div class="row" style="gap:8px"><button class="chip" onclick="pfRefresh()" aria-label="Aggiorna i prezzi">${svg('repeat', 18)}</button><button class="chip" style="color:var(--accent)" onclick="holdingEdit()" aria-label="Aggiungi strumento">${svg('plus', 18, 2.5)}</button>${gearBtn()}</div></div>
    ${holdingsLive().length ? `
    <div class="col" style="gap:4px">
      <div class="hero-amount num"><span class="cur">€</span><span class="big">${int}</span><span class="cents">,${dec}</span></div>
      <div class="row" style="gap:14px;flex-wrap:wrap" class="small"><span class="num" style="font-weight:700;color:${gainColor(T.gain)}">${sgnMoney(T.gain)} (${sgnPct(T.pct)}) totale</span>${T.day ? `<span class="num small" style="color:${gainColor(T.day)}">${sgnMoney(T.day)} oggi</span>` : ''}</div>
      <span class="small muted">Investiti ${fmtMoney(T.cost)} · prezzi ${ago(last)}</span>
    </div>
    ${T.missing ? `<div class="empty" style="color:var(--warn);border-color:var(--warn);padding:12px">${T.missing} ${T.missing === 1 ? 'strumento senza prezzo' : 'strumenti senza prezzo'}: tocca per inserirlo o aggiorna i prezzi.</div>` : ''}
    ${pfChart(T)}
    <div class="col" style="gap:10px"><span class="section-title">Posizioni</span><div class="list">${open.map(pfHoldingRow).join('') || '<div class="empty">Nessuna posizione aperta.</div>'}</div></div>
    ${adv ? `<div class="card col" style="gap:10px"><div class="row between"><span style="font-weight:800">Consigli</span><a href="#esplora/diversificazione" class="small" style="color:var(--accent)">Dettagli</a></div>${adv.risk.concat(adv.geo).slice(0, 4).map(t => `<span class="small" style="line-height:1.45">• ${t}</span>`).join('')}</div>` : ''}
    ${items.length ? `<div class="card col" style="gap:14px"><div class="row between"><span style="font-weight:800">Allocazione</span><div class="segmented"><button class="${pfMode === 'strumenti' ? 'on' : ''}" onclick="pfMode='strumenti';route()">Strumenti</button><button class="${pfMode === 'tipo' ? 'on' : ''}" onclick="pfMode='tipo';route()">Tipo</button></div></div>
      <div class="row" style="gap:18px"><div class="donut-wrap">${donutSvg(items)}<div class="donut-center"><span class="small muted">${items.length}</span><span class="small muted">${pfMode === 'tipo' ? 'tipi' : 'strumenti'}</span></div></div>
      <div class="legend">${items.map(g => `<div class="row"><span class="dot" style="background:${g.color}"></span><span class="grow truncate" style="font-weight:700">${esc(g.label)}</span><span class="muted small">${Math.round(g.value / T.value * 100)}%</span></div>`).join('')}</div></div></div>` : ''}
    ${closed.length ? `<div class="col" style="gap:12px"><span class="section-title">Chiusi</span><div class="list">${closed.map(pfHoldingRow).join('')}</div></div>` : ''}`
    : `<div class="empty">Nessuno strumento ancora.<br>Tocca + per aggiungere un ETF, un'azione o una cripto cercandolo per ISIN o ticker, poi registra gli acquisti.</div>`}`;
}
viewPortfolio.after = () => { pfLoadHistory(); if (!pfAutoDone) { pfAutoDone = true; const stale = Date.now() - Math.max(0, ...holdingsLive().map(h => h.priceAt || 0)) > 30 * 60000; if (stale) pfRefresh(true); } };
VIEWS.portafoglio = viewPortfolio;

// ---------- Strumento: modifica e ricerca ----------
let pfResults = [];
function holdingEdit(id) {
  const h = id ? holdingById(id) : { name: '', isin: '', symbol: '', type: 'etf', price: '', manual: false };
  sheet(`<span style="font-weight:800;font-size:18px">${id ? 'Modifica strumento' : 'Nuovo strumento'}</span>
    <div class="field"><label>ISIN o nome da cercare</label><div class="row" style="gap:8px"><input id="h-isin" value="${esc(h.isin)}" placeholder="Es. IE00BK5BQT80" autocapitalize="characters" style="text-transform:uppercase"><button class="chip on" style="flex-shrink:0" onclick="holdingSearch()">Cerca</button></div><span class="hint" id="h-hint">Trova il ticker da usare per i prezzi. Se la ricerca non funziona, inseriscilo a mano.</span></div>
    <div id="h-res" class="list"></div>
    <div class="field"><label>Nome</label><input id="h-name" value="${esc(h.name)}" placeholder="Es. Vanguard FTSE All-World"></div>
    <div class="row" style="gap:12px"><div class="field grow"><label>Tipo</label><select id="h-type">${Object.entries(HOLDING_TYPES).map(([k, l]) => `<option value="${k}" ${k === h.type ? 'selected' : ''}>${l}</option>`).join('')}</select></div><div class="field grow"><label>Ticker prezzi</label><input id="h-symbol" value="${esc(h.symbol)}" placeholder="VWCE.DE" autocapitalize="characters"></div></div>
    <span class="hint">Per le cripto usa l'id CoinGecko (es. bitcoin). Lascia vuoto il ticker per gestire il prezzo a mano.</span>
    <div class="field"><label>Prezzo attuale (€)</label><input id="h-price" type="number" step="0.0001" inputmode="decimal" value="${h.price === '' ? '' : Number(h.price)}" placeholder="Si aggiorna da solo se c'è il ticker"></div>
    ${id ? '' : `<div class="field"><label>Posizione già in portafoglio (facoltativo)</label><div class="row" style="gap:12px"><input id="h-qty" type="number" step="0.0001" inputmode="decimal" placeholder="Quote"><input id="h-avg" type="number" step="0.0001" inputmode="decimal" placeholder="Prezzo medio €"></div><span class="hint">Registra un acquisto di apertura a oggi. Per lo storico preciso aggiungi poi le singole operazioni.</span></div>`}
    <button class="btn primary" onclick="holdingSave('${id || ''}')">Salva</button>`);
}
async function holdingSearch() {
  const q = $('#h-isin').value.trim(); if (!q) return toast('Scrivi un ISIN o un nome');
  const res = $('#h-res'), hint = $('#h-hint'); hint.textContent = 'Cerco…';
  try {
    pfResults = await Quotes.search(q); hint.textContent = pfResults.length ? 'Scegli la quotazione (per i prezzi in euro preferisci borse come XETRA o Milano):' : 'Nessun risultato. Inserisci il ticker a mano.';
    res.innerHTML = pfResults.map((r, i) => `<button class="item" style="padding:10px 12px" onclick="holdingPick(${i})"><div class="col grow"><span class="truncate" style="font-weight:700">${esc(r.name)}</span><span class="small muted">${esc(r.symbol)} · ${esc(r.exch)} · ${esc(r.type)}</span></div></button>`).join('');
  } catch (e) { hint.textContent = 'Ricerca non riuscita: ' + e.message + '. Inserisci il ticker a mano o imposta un proxy nelle impostazioni.'; }
}
async function holdingPick(i) {
  const r = pfResults[i]; if (!r) return;
  $('#h-symbol').value = r.symbol; if (!$('#h-name').value.trim()) $('#h-name').value = r.name;
  if (/CRYPTO/i.test(r.type)) $('#h-type').value = 'crypto'; else if (/EQUITY/i.test(r.type)) $('#h-type').value = 'azione';
  $('#h-res').innerHTML = ''; $('#h-hint').textContent = 'Leggo il prezzo…';
  try { const q = await Quotes.yahoo(r.symbol); $('#h-price').value = Math.round(q.price * 10000) / 10000; $('#h-hint').textContent = `Prezzo letto (${q.currency}, convertito in euro).`; } catch (e) { $('#h-hint').textContent = 'Ticker scelto, prezzo non letto: ' + e.message; }
}
function holdingSave(id) {
  const name = $('#h-name').value.trim(), symbol = $('#h-symbol').value.trim(), isin = $('#h-isin').value.trim().toUpperCase().replace(/\s/g, ''), type = $('#h-type').value, price = parseFloat($('#h-price').value);
  if (!name) return toast('Dai un nome allo strumento');
  const isIsin = /^[A-Z]{2}[A-Z0-9]{9}\d$/.test(isin), now = Date.now();
  const data = { name, symbol, isin: isIsin ? isin : '', type, manual: !symbol, updatedAt: now };
  if (price > 0) Object.assign(data, { price, priceAt: now, priceSrc: symbol ? 'auto' : 'manuale' });
  let h;
  if (id) { h = holdingById(id); Object.assign(h, data); }
  else {
    h = { id: 'h-' + uid(), ...data }; S.holdings.push(h);
    const q = parseFloat($('#h-qty').value), avg = parseFloat($('#h-avg').value);
    if (q > 0) S.trades.push({ id: 't-' + uid(), holdingId: h.id, kind: 'buy', date: todayISO(), qty: q, price: avg > 0 ? avg : (price > 0 ? price : 0), fee: 0, opening: true, updatedAt: now });
  }
  save(); snapshotPortfolio(); closeSheet(); route();
  if (!id && symbol && !(price > 0)) pfRefresh(true);
}

// ---------- Strumento: dettaglio e operazioni ----------
function holdingSheet(id) {
  const h = holdingById(id); if (!h) return; const p = position(h), trs = tradesOf(id).slice().reverse();
  sheet(`<div class="col" style="gap:2px"><span style="font-weight:800;font-size:18px">${esc(h.name)}</span><span class="small muted">${[h.isin, h.symbol, HOLDING_TYPES[h.type]].filter(Boolean).map(esc).join(' · ')}</span></div>
    <div class="kv">
      <div><label>Prezzo</label><span class="num" style="font-weight:700">${p.price ? fmtMoney(p.price) : '–'} <span class="small muted">${h.priceAt ? ago(h.priceAt) : ''}</span></span></div>
      <div><label>Quote</label><span class="num" style="font-weight:700">${fmtQty(p.qty)}</span></div>
      <div><label>Prezzo medio</label><span class="num" style="font-weight:700">${p.qty ? fmtMoney(p.avg) : '–'}</span></div>
      <div><label>Investito</label><span class="num" style="font-weight:700">${fmtMoney(p.cost)}</span></div>
      <div><label>Valore</label><span class="num" style="font-weight:700">${fmtMoney(p.value)}</span></div>
      <div><label>Guadagno</label><span class="num" style="font-weight:700;color:${gainColor(p.gain)}">${sgnMoney(p.gain)} (${sgnPct(p.pct)})</span></div>
      ${p.div ? `<div><label>Dividendi</label><span class="num" style="font-weight:700">${fmtMoney(p.div)}</span></div>` : ''}
      ${p.realized ? `<div><label>Realizzato</label><span class="num" style="font-weight:700;color:${gainColor(p.realized)}">${sgnMoney(p.realized)}</span></div>` : ''}
    </div>
    <div class="row" style="gap:8px"><input id="h-quick" type="number" step="0.0001" inputmode="decimal" placeholder="Nuovo prezzo €" style="min-height:44px"><button class="chip on" style="flex-shrink:0" onclick="holdingQuickPrice('${id}')">Salva prezzo</button>${h.symbol ? `<button class="chip" style="flex-shrink:0" onclick="holdingRefreshOne('${id}')" aria-label="Aggiorna online">${svg('repeat', 16)}</button>` : ''}</div>
    <div class="row" style="gap:8px"><button class="btn sm primary" onclick="tradeSheet('${id}','buy')">Acquisto</button><button class="btn sm" onclick="tradeSheet('${id}','sell')">Vendita</button><button class="btn sm" onclick="tradeSheet('${id}','div')">Dividendo</button></div>
    ${trs.length ? `<div class="col" style="gap:8px"><span class="section-title" style="font-size:15px">Operazioni</span><div class="list">${trs.map(t => `<button class="item" style="padding:10px 12px" onclick="tradeSheet('${id}','${t.kind}','${t.id}')"><div class="col grow"><span style="font-weight:700">${TRADE_LABEL[t.kind]}${t.opening ? ' · apertura' : ''}${t.estimated ? ' · stimata' : ''}</span><span class="small muted">${dayFmt(t.date)}${t.kind === 'div' ? '' : ' · ' + fmtQty(t.qty) + ' × ' + fmtMoney(t.price)}</span></div><span class="num" style="font-weight:600">${fmtMoney(t.kind === 'div' ? t.amount : t.qty * t.price, false)}</span></button>`).join('')}</div></div>` : ''}
    <button class="btn" onclick="holdingEdit('${id}')">Modifica strumento</button>
    <button class="btn danger" onclick="holdingDelete('${id}')">Elimina strumento e operazioni</button>`);
}
function holdingQuickPrice(id) {
  const v = parseFloat($('#h-quick').value); if (!(v > 0)) return toast('Inserisci un prezzo');
  const h = holdingById(id); Object.assign(h, { price: v, priceAt: Date.now(), priceSrc: 'manuale', updatedAt: Date.now() }); save(); snapshotPortfolio(); holdingSheet(id); route();
}
async function holdingRefreshOne(id) {
  const h = holdingById(id); toast('Aggiorno…', 6000);
  try { await Quotes.refresh(h); save(false); snapshotPortfolio(); toast('Prezzo aggiornato'); holdingSheet(id); route(); } catch (e) { toast('Non riuscito: ' + e.message, 4000); }
}
function holdingDelete(id) {
  if (!confirm('Eliminare lo strumento e tutte le sue operazioni? Non si può annullare.')) return;
  const now = Date.now(); holdingById(id).deleted = true; holdingById(id).updatedAt = now;
  S.trades.forEach(t => { if (t.holdingId === id) { t.deleted = true; t.updatedAt = now; } }); save(); closeSheet(); route();
}

let tr = null;
function tradeSheet(hid, kind, tid) {
  const h = holdingById(hid), t = tid ? S.trades.find(x => x.id === tid) : null;
  tr = t ? { hid, kind: t.kind, tid, date: t.date, qty: t.qty || '', price: t.price || '', fee: t.fee || '', amount: t.kind === 'div' ? t.amount : Math.round(t.qty * t.price * 100) / 100 }
    : { hid, kind, tid: null, date: todayISO(), qty: '', price: h.price || '', fee: '', amount: '' };
  tradeDraw();
}
function tradeDraw() {
  const h = holdingById(tr.hid), div = tr.kind === 'div';
  sheet(`<div class="col" style="gap:2px"><span style="font-weight:800;font-size:18px">${tr.tid ? 'Modifica operazione' : 'Nuova operazione'}</span><span class="small muted">${esc(h.name)}</span></div>
    <div class="segmented" style="align-self:flex-start">${Object.entries(TRADE_LABEL).map(([k, l]) => `<button class="${tr.kind === k ? 'on' : ''}" onclick="tradeKind('${k}')">${l}</button>`).join('')}</div>
    <div class="field"><label>Data</label><input id="t-date" type="date" value="${tr.date}" onchange="tr.date=this.value"></div>
    ${div ? `<div class="field"><label>Importo incassato (€)</label><input id="t-amount" type="number" step="0.01" inputmode="decimal" value="${tr.amount}" oninput="tr.amount=this.value"></div>` : `
    <div class="row" style="gap:12px"><div class="field grow"><label>Prezzo per quota (€)</label><input id="t-price" type="number" step="0.0001" inputmode="decimal" value="${tr.price}" oninput="tradeCalc('price')"></div><div class="field grow"><label>Quote</label><input id="t-qty" type="number" step="0.0001" inputmode="decimal" value="${tr.qty}" oninput="tradeCalc('qty')"></div></div>
    <div class="row" style="gap:12px"><div class="field grow"><label>Importo (€)</label><input id="t-amount" type="number" step="0.01" inputmode="decimal" value="${tr.amount}" oninput="tradeCalc('amount')"></div><div class="field grow"><label>Commissioni (€)</label><input id="t-fee" type="number" step="0.01" inputmode="decimal" value="${tr.fee}" oninput="tr.fee=this.value"></div></div>
    <span class="hint">Come con un piano di accumulo: inserisci importo e prezzo e le quote si calcolano da sole.</span>`}
    <button class="btn primary" onclick="tradeSave()">Salva</button>
    ${tr.tid ? `<button class="btn danger" onclick="tradeDelete()">Elimina operazione</button>` : ''}`);
}
function tradeKind(k) { tr.kind = k; tradeDraw(); }
function tradeCalc(src) {
  const g = id => parseFloat($('#' + id).value), set = (id, v) => { $('#' + id).value = Number.isFinite(v) ? Math.round(v * 1e4) / 1e4 : ''; };
  const price = g('t-price'), qty = g('t-qty'), amount = g('t-amount');
  if (src === 'amount' && price > 0) set('t-qty', amount / price); else if (src === 'qty' && price > 0) set('t-amount', Math.round(qty * price * 100) / 100); else if (src === 'price') { if (qty > 0) set('t-amount', Math.round(qty * price * 100) / 100); else if (amount > 0 && price > 0) set('t-qty', amount / price); }
  Object.assign(tr, { price: $('#t-price').value, qty: $('#t-qty').value, amount: $('#t-amount').value });
}
function tradeSave() {
  const h = holdingById(tr.hid), now = Date.now(); let rec;
  if (!tr.date) return toast('Scegli la data');
  if (tr.kind === 'div') { const a = parseFloat(tr.amount); if (!(a > 0)) return toast('Inserisci l\'importo'); rec = { kind: 'div', date: tr.date, amount: a, qty: 0, price: 0, fee: 0 }; }
  else {
    const q = parseFloat(tr.qty), pr = parseFloat(tr.price), fee = parseFloat(tr.fee) || 0;
    if (!(q > 0) || !(pr > 0)) return toast('Servono quote e prezzo');
    if (tr.kind === 'sell' && q > position(h).qty + 1e-9 && !tr.tid) return toast('Stai vendendo più quote di quelle che hai');
    rec = { kind: tr.kind, date: tr.date, qty: q, price: pr, fee };
  }
  if (tr.tid) Object.assign(S.trades.find(x => x.id === tr.tid), rec, { updatedAt: now });
  else S.trades.push({ id: 't-' + uid(), holdingId: tr.hid, ...rec, updatedAt: now });
  if (!h.price && rec.price > 0) Object.assign(h, { price: rec.price, priceAt: now, priceSrc: 'manuale', updatedAt: now });
  save(); snapshotPortfolio(); holdingSheet(tr.hid); route();
}
function tradeDelete() {
  if (!confirm('Eliminare questa operazione?')) return;
  const t = S.trades.find(x => x.id === tr.tid); t.deleted = true; t.updatedAt = Date.now(); save(); snapshotPortfolio(); holdingSheet(tr.hid); route();
}

// ---------- Impostazioni ----------
// ---------- Bilanciamento (azionario / obbligazionario) ----------
// Stesse regole dell'artefatto "Allocazione Trade Republic": fascia obiettivo sull'azionario,
// si ribilancia solo spostando gli importi dei PAC, mai vendendo.
const assetClass = h => (h.type === 'obbligazione' ? 'bond' : h.type === 'etf' || h.type === 'azione' ? 'eq' : null);
// Profilo di rischio → quota azionaria obiettivo. "Personalizzato" usa la fascia scritta a mano.
const RISK = { prudente: ['Prudente', 25, 35], bilanciato: ['Bilanciato', 45, 55], dinamico: ['Dinamico', 75, 80], aggressivo: ['Aggressivo', 85, 95] };
const riskProfile = () => (RISK[S.settings.risk] ? S.settings.risk : S.settings.risk === 'custom' || S.settings.target ? 'custom' : 'dinamico');
const riskLabel = () => (RISK[riskProfile()] || ['Personalizzato'])[0];
const balTarget = () => { const r = RISK[riskProfile()], t = S.settings.target || {}; const lo = r ? r[1] : Number(t.lo) || 75, hi = r ? r[2] : Number(t.hi) || 80; return { lo: lo / 100, hi: hi / 100, mid: (lo + hi) / 200 }; };
// Importo mensile del PAC collegato a ogni strumento (pagamenti pianificati attivi).
function pacOf(hid) { return plannedAll().filter(p => p.active !== false && p.holdingId === hid).reduce((a, p) => a + plannedMonthly(p), 0); }
function balanceData() {
  const rows = holdingsLive().map(h => ({ h, cls: assetClass(h), value: position(h).value, pac: pacOf(h.id) })).filter(r => r.cls && (r.value > 0 || r.pac > 0));
  const sum = (k, f) => rows.filter(f).reduce((a, r) => a + r[k], 0);
  const T = { rows, eq: sum('value', r => r.cls === 'eq'), bond: sum('value', r => r.cls === 'bond'), M: sum('pac', () => true) };
  T.tot = T.eq + T.bond; T.eqPct = T.tot ? T.eq / T.tot : 0;
  const nexts = plannedAll().filter(p => p.active !== false && p.holdingId).map(p => nextOccurrence(p)).filter(Boolean).sort();
  T.next = nexts[0] || null; return T;
}
// Divide un importo tra gli strumenti di una classe in proporzione ai PAC attuali (in parti uguali se nessuno ha un PAC).
function balSplit(T, cls, amount) {
  const pool = T.rows.filter(r => r.cls === cls), base = pool.reduce((a, r) => a + r.pac, 0), withPac = pool.filter(r => r.pac > 0);
  const use = base > 0 ? withPac : pool;
  return use.map(r => ({ r, amount: amount * (base > 0 ? r.pac / base : 1 / use.length) }));
}
function balAlloc(T, eqAmt, bondAmt) {
  // Arrotonda all'euro senza perdere il totale: lo scarto va allo strumento con l'importo più alto.
  const list = [...balSplit(T, 'eq', eqAmt), ...balSplit(T, 'bond', bondAmt)].map(x => ({ ...x, amount: Math.round(x.amount) }));
  const diff = Math.round(eqAmt + bondAmt) - list.reduce((a, x) => a + x.amount, 0);
  if (diff && list.length) list.reduce((m, x) => (x.amount > m.amount ? x : m)).amount += diff;
  return list.map(({ r, amount }) => {
    const d = amount - r.pac;
    return `<div class="row between small" style="border-bottom:1px dotted var(--line);padding-bottom:6px"><span class="truncate">${esc(r.h.name)}</span><span class="num" style="font-weight:700;white-space:nowrap">${fmtMoney(amount).replace(',00', '')} <span class="muted" style="font-weight:500">${Math.abs(d) < 1 ? 'invariato' : 'da ' + fmtMoney(r.pac).replace(',00', '')}</span></span></div>`;
  }).join('');
}
function balanceCard() {
  const T = balanceData(), { lo, hi, mid } = balTarget();
  if (!T.tot) return '';
  const inBand = T.eqPct >= lo && T.eqPct <= hi, p1 = x => (x * 100).toFixed(1).replace('.', ',') + '%';
  const X = p => Math.max(0, Math.min(100, (p * 100 - 50) * 2)); // scala 50–100%
  const status = inBand ? 'Dentro la fascia' : `${T.eqPct > hi ? 'Sopra il tetto' : 'Sotto la soglia'} · ${(((T.eqPct > hi ? T.eqPct - hi : lo - T.eqPct)) * 100).toFixed(1).replace('.', ',')} punti`;
  const M = T.M, nextLbl = T.next ? dayFmt(T.next) : 'prossimo versamento';
  let recovery = '';
  if (M > 0 && !inBand) {
    const toBond = Math.max(0, Math.min(M, T.eq + M - mid * (T.tot + M))), toEq = M - toBond, after = (T.eq + toEq) / (T.tot + M), ok = after >= lo && after <= hi;
    recovery = `<div class="col" style="gap:10px;padding:14px;border-radius:var(--r-m);border:1px solid var(--warn);background:${hexA('#FFB36B', .08)}">
      <div class="col" style="gap:2px"><span class="small muted">Una tantum</span><span style="font-weight:800">Recupero: versamento del ${nextLbl}</span></div>
      <span class="small muted" style="line-height:1.45">${ok ? 'Concentra il versamento di questo mese per rientrare nella fascia in un colpo solo.' : 'Un solo mese non basta a rientrare: sposta tutto da una parte e ricontrolla il mese prossimo.'}</span>
      ${balAlloc(T, toEq, toBond)}
      <span class="small" style="border-top:1px solid var(--line);padding-top:8px">Dopo il versamento: azionario <b class="num">${p1(after)}</b>${ok ? ', dentro la fascia.' : ', ancora fuori: si ricontrolla.'}</span>
    </div>`;
  }
  const twice = T.eq / (T.tot + 2 * M);
  return `<div class="card col" style="gap:14px">
    <div class="row between" style="flex-wrap:wrap;gap:8px"><span style="font-weight:800">Bilanciamento</span><span class="chip" style="height:30px;font-size:12px;color:${inBand ? 'var(--accent)' : 'var(--warn)'};border-color:currentColor">${status}</span></div>
    <div class="row" style="gap:10px;align-items:baseline;flex-wrap:wrap"><span class="num" style="font-size:34px;font-weight:700;line-height:1">${p1(T.eqPct)}</span><span class="small muted">azionario · ${p1(1 - T.eqPct)} obbligazionario</span></div>
    <div class="col" style="gap:4px">
      <div style="position:relative;height:28px;border-radius:6px;background:var(--surface-2);overflow:hidden">
        <div style="position:absolute;top:0;bottom:0;left:${X(lo)}%;width:${X(hi) - X(lo)}%;background:${hexA('#6EE7B7', .28)}"></div>
        <div style="position:absolute;top:0;bottom:0;width:3px;border-radius:2px;left:calc(${X(T.eqPct)}% - 1.5px);background:${inBand ? 'var(--text)' : 'var(--warn)'}"></div>
      </div>
      <div class="row between small muted num"><span>50%</span><span>${Math.round(lo * 100)}–${Math.round(hi * 100)}%</span><span>100%</span></div>
    </div>
    ${M > 0 ? `${inBand ? `<span class="small muted">Nessun recupero necessario: l'allocazione è già nella fascia. Prossimo versamento: ${nextLbl}.</span>` : recovery}
    <div class="col" style="gap:10px">
      <div class="col" style="gap:2px"><span class="small muted">Ogni mese${inBand ? '' : ', dopo il recupero'}</span><span style="font-weight:800">Split a regime: ${p1(mid).replace(',0%', '%')} / ${p1(1 - mid).replace(',0%', '%')}</span></div>
      ${balAlloc(T, M * mid, M * (1 - mid))}
      <span class="small muted">Mantiene l'azionario intorno al ${p1(mid)}, al centro della fascia.</span>
    </div>
    <span class="hint"><b>Attenzione:</b> non ripetere il recupero due mesi di fila. Due versamenti interamente sull'obbligazionario porterebbero l'azionario al ${p1(twice)}.</span>`
      : '<span class="hint">Collega i pagamenti pianificati agli strumenti (campo "Piano di accumulo su") per avere i suggerimenti sui PAC.</span>'}
    <span class="hint"><b>Mai vendere:</b> con ${fmtMoney(M).replace(',00', '')} al mese in ingresso i versamenti bastano a correggere la deriva; vendere farebbe pagare il 26% sulle plusvalenze. Cripto e strumenti "Altro" sono esclusi dal calcolo. Strumento di calcolo, non consulenza finanziaria.</span>
  </div>`;
}

function portfolioSettings() {
  return `<div class="field"><label>Proxy per i prezzi (facoltativo)</label><input value="${esc(S.settings.proxyUrl || '')}" onchange="S.settings.proxyUrl=this.value.trim();save(false)" placeholder="https://tuo-worker.workers.dev/?url="><span class="hint">I prezzi di ETF e azioni vengono da Yahoo Finance, che il browser non può interrogare direttamente. Senza proxy uso un servizio pubblico che a volte non risponde: in quel caso inserisci il prezzo a mano. Per la massima affidabilità puoi creare un tuo proxy gratuito su Cloudflare con il codice nel file proxy-worker.js del progetto.</span></div>
      <div class="field"><label>Profilo di rischio</label><select onchange="S.settings.risk=this.value;save();route()">${Object.entries(RISK).map(([k, r]) => `<option value="${k}" ${riskProfile() === k ? 'selected' : ''}>${r[0]} · azioni ${r[1]}–${r[2]}%</option>`).join('')}<option value="custom" ${riskProfile() === 'custom' ? 'selected' : ''}>Personalizzato</option></select></div>
      ${riskProfile() === 'custom' ? `<div class="field"><label>Fascia azioni personalizzata (%)</label><div class="row" style="gap:12px"><input type="number" min="0" max="100" inputmode="numeric" value="${(S.settings.target || {}).lo || 75}" onchange="S.settings.target={...(S.settings.target||{}),lo:+this.value};save(false)" aria-label="Minimo"><input type="number" min="0" max="100" inputmode="numeric" value="${(S.settings.target || {}).hi || 80}" onchange="S.settings.target={...(S.settings.target||{}),hi:+this.value};save(false)" aria-label="Massimo"></div></div>` : ''}
      <button class="btn sm" onclick="pfRefresh()">${svg('repeat', 18)} Aggiorna i prezzi ora</button>
      <button class="btn sm" onclick="go('#portafoglio')">${svg('trend', 18)} Apri il portafoglio</button>`;
}
