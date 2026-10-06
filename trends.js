/* Linee di tendenza: regressione lineare, grafici SVG e widget di Analisi. */
'use strict';

// Regressione lineare y = a + b*x. Senza xs usa 0..n-1.
function linreg(ys, xs) {
  const n = ys.length; if (n < 2) return null;
  const X = xs || ys.map((_, i) => i), mx = X.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  ys.forEach((y, i) => { sxy += (X[i] - mx) * (y - my); sxx += (X[i] - mx) ** 2; syy += (y - my) ** 2; });
  if (!sxx) return null;
  const b = sxy / sxx; return { a: my - b * mx, b, r2: syy ? (sxy * sxy) / (sxx * syy) : 0 };
}
const sgnMoney = n => (n >= 0 ? '+ ' : '- ') + fmtMoney(Math.abs(n));
const sgnPct = n => (n >= 0 ? '+' : '-') + Math.abs(n).toFixed(2).replace('.', ',') + '%';

// Barre mensili con linea di tendenza tratteggiata e, se richiesto, una barra di proiezione.
function trendBars(pts, o = {}) {
  const W = 340, H = 150, pl = 6, pr = 6, pt = 14, pb = 22, n = pts.length, slots = n + (o.project ? 1 : 0);
  const lr = linreg(pts.map(p => p.v)), tv = i => (lr ? Math.max(0, lr.a + lr.b * i) : 0);
  const maxV = Math.max(...pts.map(p => p.v), ...(lr ? Array.from({ length: slots }, (_, i) => tv(i)) : [0]), 1);
  const cw = (W - pl - pr) / slots, X = i => pl + cw * (i + 0.5), Y = v => pt + (H - pt - pb) * (1 - v / maxV), base = H - pb;
  const bars = pts.map((p, i) => `<rect x="${(X(i) - cw * 0.32).toFixed(1)}" y="${Y(p.v).toFixed(1)}" width="${(cw * 0.64).toFixed(1)}" height="${Math.max(1, base - Y(p.v)).toFixed(1)}" rx="3" style="fill:${p.on ? 'var(--accent)' : 'var(--surface-3)'}"/>`).join('');
  const proj = o.project && lr ? `<rect x="${(X(n) - cw * 0.32).toFixed(1)}" y="${Y(tv(n)).toFixed(1)}" width="${(cw * 0.64).toFixed(1)}" height="${Math.max(1, base - Y(tv(n))).toFixed(1)}" rx="3" style="fill:none;stroke:var(--accent);stroke-width:1.5;stroke-dasharray:3 3"/>` : '';
  const line = lr ? `<line x1="${X(0).toFixed(1)}" y1="${Y(tv(0)).toFixed(1)}" x2="${X(slots - 1).toFixed(1)}" y2="${Y(tv(slots - 1)).toFixed(1)}" style="stroke:var(--warn);stroke-width:2;stroke-dasharray:5 4;stroke-linecap:round"/>` : '';
  const step = n > 8 ? 2 : 1, labels = [...pts.map(p => p.label), ...(o.project ? [o.projLabel || ''] : [])].map((l, i) => (i % step === 0 || i === slots - 1) && l ? `<text x="${X(i).toFixed(1)}" y="${H - 6}" text-anchor="middle" style="fill:var(--muted);font-size:10px;font-weight:700">${esc(l)}</text>` : '').join('');
  return { lr, svg: `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="${esc(o.aria || 'Grafico con linea di tendenza')}">${bars}${proj}${line}${labels}</svg>` };
}

// Linee nel tempo (asse x = giorni) con tendenza opzionale e proiezione a 30 giorni.
// series: [{ pts: [{ d: giorno(numero), v }], color, width, dashed, trend }]
function timeChart(series, o = {}) {
  const W = 340, H = o.h || 160, pl = 6, pr = 6, pt = 12, pb = 22, all = series.flatMap(s => s.pts);
  if (all.length < 2) return { svg: '', trends: [] };
  const d0 = Math.min(...all.map(p => p.d)), d1 = Math.max(...all.map(p => p.d)), ext = o.project ? 30 : 0, dEnd = d1 + ext, dSpan = (dEnd - d0) || 1;
  const trends = series.map(s => (s.trend && s.pts.length >= 3 ? linreg(s.pts.map(p => p.v), s.pts.map(p => p.d)) : null));
  const vals = all.map(p => p.v); trends.forEach(t => { if (t) vals.push(t.a + t.b * dEnd, t.a + t.b * d0); });
  const vMax = Math.max(...vals), vMin = Math.min(0, ...vals), vSpan = (vMax - vMin) || 1;
  const X = d => pl + (W - pl - pr) * (d - d0) / dSpan, Y = v => pt + (H - pt - pb) * (1 - (v - vMin) / vSpan);
  const paths = series.map((s, i) => {
    const pts = s.pts.slice().sort((a, b) => a.d - b.d), dpath = pts.map((p, k) => (k ? 'L' : 'M') + X(p.d).toFixed(1) + ' ' + Y(p.v).toFixed(1)).join('');
    const ds = Math.min(...pts.map(p => p.d)), tr = trends[i] ? `<line x1="${X(ds).toFixed(1)}" y1="${Y(trends[i].a + trends[i].b * ds).toFixed(1)}" x2="${X(dEnd).toFixed(1)}" y2="${Y(trends[i].a + trends[i].b * dEnd).toFixed(1)}" style="stroke:var(--warn);stroke-width:2;stroke-dasharray:5 4;stroke-linecap:round"/>` : '';
    return `<path d="${dpath}" style="fill:none;stroke:${s.color};stroke-width:${s.width || 2.5};stroke-linecap:round;stroke-linejoin:round${s.dashed ? ';stroke-dasharray:2 5' : ''}"/>${tr}`;
  }).join('');
  const fmtD = d => new Date((d + 0.5) * 864e5).toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: '2-digit', timeZone: 'UTC' });
  const lab = (d, anchor) => `<text x="${X(d).toFixed(1)}" y="${H - 6}" text-anchor="${anchor}" style="fill:var(--muted);font-size:10px;font-weight:700">${fmtD(d)}</text>`;
  return { trends, svg: `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="${esc(o.aria || 'Andamento nel tempo')}">${paths}${lab(d0, 'start')}${ext ? '' : lab(d1, 'end')}${ext ? lab(dEnd, 'end') : ''}</svg>` };
}
const isoDay = iso => Math.floor(new Date(iso + 'T12:00:00Z').getTime() / 864e5);

// Ciambella generica: items [{ color, value }]
function donutSvg(items, size = 136) {
  const total = items.reduce((a, x) => a + x.value, 0) || 1, C = 2 * Math.PI * 70; let acc = 0;
  const arcs = items.map(x => { const len = C * x.value / total, el = `<circle cx="100" cy="100" r="70" fill="none" stroke="${x.color}" stroke-width="26" stroke-dasharray="${Math.max(0, len - 3)} ${C}" transform="rotate(${-90 + 360 * acc / total} 100 100)"/>`; acc += x.value; return el; }).join('');
  return `<svg width="${size}" height="${size}" viewBox="0 0 200 200"><circle cx="100" cy="100" r="70" fill="none" stroke="var(--surface-2)" stroke-width="26"/>${arcs}</svg>`;
}

// ---------- Widget di Analisi con tendenza ----------
// Ultimi N mesi completi (esclude il mese in corso, che è parziale).
function completedMonths(n) {
  const thisKey = monthKey(todayISO()), endKey = currentMonth < thisKey ? currentMonth : localISO(new Date(Number(thisKey.slice(0, 4)), Number(thisKey.slice(5)) - 2, 1)).slice(0, 7);
  const [y, m] = endKey.split('-').map(Number), out = [];
  for (let i = n - 1; i >= 0; i--) { const d = new Date(y, m - 1 - i, 1); out.push({ k: localISO(d).slice(0, 7), label: d.toLocaleDateString('it-IT', { month: 'short' }) }); }
  return { months: out, endKey, nextLabel: new Date(y, m, 1).toLocaleDateString('it-IT', { month: 'short' }) };
}

ANA_WIDGETS.trendline = { title: 'Trend delle spese', desc: 'Andamento degli ultimi 12 mesi con linea di tendenza e stima del prossimo mese.', icon: 'trend', render() {
  const { months, nextLabel } = completedMonths(12), pts = months.map((m, i) => ({ label: m.label, v: sumBy(monthExpenses(m.k)), on: i === months.length - 1 }));
  const data = pts.filter(p => p.v > 0).length;
  if (data < 3) return `<div class="card col" style="gap:10px"><span style="font-weight:800">Trend delle spese</span><span class="muted small">Servono almeno 3 mesi con spese per tracciare la tendenza.</span></div>`;
  const { lr, svg: chart } = trendBars(pts, { project: true, projLabel: nextLabel, aria: 'Spese mensili con linea di tendenza' });
  const mean = pts.reduce((a, p) => a + p.v, 0) / pts.length, slope = lr ? lr.b : 0, flat = Math.abs(slope) < mean * 0.01, next = Math.max(0, lr.a + lr.b * pts.length);
  const verdict = flat ? 'Spese stabili' : slope > 0 ? 'Spese in crescita' : 'Spese in calo';
  return `<div class="card col" style="gap:14px">
    <div class="row between"><span style="font-weight:800">Trend delle spese</span><span class="small muted">ultimi 12 mesi</span></div>
    ${chart}
    <div class="row between" style="border-top:1px solid var(--line);padding-top:12px">
      <div class="stat"><span class="v num" style="font-size:18px;color:${flat ? 'inherit' : slope > 0 ? 'var(--warn)' : 'var(--accent)'}">${flat ? '≈ stabile' : sgnMoney(slope) + '/mese'}</span><span class="small muted">${verdict}</span></div>
      <div class="stat" style="text-align:right"><span class="v num" style="font-size:18px">${fmtMoney(next)}</span><span class="small muted">stima di ${nextLabel}</span></div>
    </div>
    <span class="hint">Linea tratteggiata: tendenza lineare sui mesi completi${lr.r2 < 0.3 ? '. Andamento molto variabile, la stima è poco affidabile' : ''}.</span>
  </div>`; } };

ANA_WIDGETS.trendcat = { title: 'Trend per categoria', desc: 'Quali categorie crescono o calano di più negli ultimi 6 mesi.', icon: 'tag', render() {
  const { months } = completedMonths(6), ids = {};
  months.forEach(m => monthExpenses(m.k).forEach(e => { ids[e.cat] = true; }));
  const rows = Object.keys(ids).map(id => { const ys = months.map(m => sumBy(monthExpenses(m.k).filter(e => e.cat === id))), lr = linreg(ys); return { cat: catById(id), ys, avg: ys.reduce((a, b) => a + b, 0) / ys.length, slope: lr ? lr.b : 0 }; })
    .filter(r => r.avg >= 1).sort((a, b) => Math.abs(b.slope) - Math.abs(a.slope)).slice(0, 6);
  const spark = ys => { const mx = Math.max(...ys, 1), pts = ys.map((v, i) => `${(i * 56 / (ys.length - 1)).toFixed(1)},${(20 - v / mx * 18).toFixed(1)}`).join(' '); return `<svg width="58" height="22" viewBox="-1 -1 58 22"><polyline points="${pts}" style="fill:none;stroke:var(--muted);stroke-width:2;stroke-linecap:round;stroke-linejoin:round"/></svg>`; };
  return `<div class="col" style="gap:12px"><div class="row between"><span class="section-title">Trend per categoria</span><span class="small muted">6 mesi</span></div>
    <div class="list">${rows.map(r => { const flat = Math.abs(r.slope) < r.avg * 0.03; return `<div class="item"><div class="tile" style="background:${hexA(r.cat.color, .16)};color:${r.cat.color}">${svg(r.cat.icon)}</div><div class="col grow"><span class="truncate" style="font-weight:700">${esc(r.cat.name)}</span><span class="small muted">media ${fmtInt(r.avg)} €/mese</span></div>${spark(r.ys)}<span class="num small" style="width:84px;text-align:right;font-weight:700;color:${flat ? 'var(--muted)' : r.slope > 0 ? 'var(--warn)' : 'var(--accent)'}">${flat ? '≈ stabile' : (r.slope > 0 ? '▲ ' : '▼ ') + fmtMoney(Math.abs(r.slope), false)}</span></div>`; }).join('') || '<div class="empty">Servono almeno alcuni mesi di spese per calcolare le tendenze.</div>'}</div></div>`; } };
