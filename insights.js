/* Analisi aggiuntive: tendenze delle spese (widget di Analisi) e analisi del Diario. */
'use strict';

const shortMonth = k => new Date(Number(k.slice(0, 4)), Number(k.slice(5)) - 1, 1).toLocaleDateString('it-IT', { month: 'short' });
const trendWord = (slope, avg, unit = '/mese') => (Math.abs(slope) < Math.abs(avg) * 0.02 ? '≈ stabile' : sgnMoney(slope) + unit);
const slopeColor = (slope, avg, goodWhenUp = false) => (Math.abs(slope) < Math.abs(avg) * 0.02 ? 'var(--muted)' : (slope > 0) === goodWhenUp ? 'var(--accent)' : 'var(--warn)');
const sparkline = (ys, color = 'var(--muted)') => { const mx = Math.max(...ys, 1), n = Math.max(ys.length - 1, 1); return `<svg width="58" height="22" viewBox="-1 -1 58 22"><polyline points="${ys.map((v, i) => `${(i * 56 / n).toFixed(1)},${(20 - Math.max(0, v) / mx * 18).toFixed(1)}`).join(' ')}" style="fill:none;stroke:${color};stroke-width:2;stroke-linecap:round;stroke-linejoin:round"/></svg>`; };

// ---------- Spese: tendenze ----------
ANA_WIDGETS.trendgroups = { title: 'Trend per gruppo', desc: 'Come cambiano negli ultimi 6 mesi i grandi gruppi di spesa (casa, cibo, trasporti…).', icon: 'home', render() {
  const { months } = completedMonths(6);
  const rows = CAT_GROUPS.map(g => { const ys = months.map(m => sumBy(monthExpenses(m.k).filter(e => groupOf(catById(e.cat)) === g.id))), lr = linreg(ys); return { g, ys, avg: ys.reduce((a, b) => a + b, 0) / ys.length, slope: lr ? lr.b : 0 }; })
    .filter(r => r.avg >= 1).sort((a, b) => b.avg - a.avg);
  return `<div class="col" style="gap:12px"><div class="row between"><span class="section-title">Trend per gruppo</span><span class="small muted">6 mesi</span></div>
    <div class="list">${rows.map(r => `<div class="item"><div class="tile" style="background:${hexA(r.g.color, .16)};color:${r.g.color}">${svg(r.g.icon)}</div><div class="col grow"><span class="truncate" style="font-weight:700">${r.g.name}</span><span class="small muted">media ${fmtInt(r.avg)} €/mese</span></div>${sparkline(r.ys)}<span class="num small" style="width:88px;text-align:right;font-weight:700;color:${slopeColor(r.slope, r.avg)}">${trendWord(r.slope, r.avg)}</span></div>`).join('') || '<div class="empty">Servono alcuni mesi di spese per calcolare le tendenze.</div>'}</div></div>`; } };

// Ritmo del mese: spesa cumulata giorno per giorno, confronto col mese prima e proiezione a fine mese.
ANA_WIDGETS.monthpace = { title: 'Ritmo del mese', desc: 'Spesa cumulata giorno per giorno rispetto al mese prima, con proiezione a fine mese.', icon: 'trend', render() {
  const k = currentMonth, [y, m] = k.split('-').map(Number), dim = new Date(y, m, 0).getDate(), prevK = localISO(new Date(y, m - 2, 1)).slice(0, 7), pdim = new Date(y, m - 1, 0).getDate();
  const today = todayISO(), isCur = k === monthKey(today), upto = isCur ? Number(today.slice(8)) : dim;
  const cum = (key, n) => { const per = Array(n + 1).fill(0); monthExpenses(key).forEach(e => { per[Number(e.date.slice(8))] += Number(e.amount || 0); }); let s = 0; return per.map((v, i) => (i ? (s += v) : 0)); };
  const cur = cum(k, dim).slice(0, upto + 1), prev = cum(prevK, pdim);
  if (!cur[upto] && !prev[pdim]) return `<div class="card col" style="gap:10px"><span style="font-weight:800">Ritmo del mese</span><span class="muted small">Nessuna spesa in questo mese né nel precedente.</span></div>`;
  const xs = Array.from({ length: upto }, (_, i) => i + 1), lr = upto >= 3 ? linreg(xs.map(d => cur[d]), xs) : null, proj = isCur && lr ? Math.max(cur[upto], lr.a + lr.b * dim) : cur[upto];
  const W = 340, H = 160, pl = 6, pr = 6, pt = 12, pb = 22, vMax = Math.max(cur[upto], prev[pdim], proj, 1);
  const X = d => pl + (W - pl - pr) * (d - 1) / (dim - 1), Y = v => pt + (H - pt - pb) * (1 - v / vMax);
  const path = (arr, n) => Array.from({ length: n }, (_, i) => (i ? 'L' : 'M') + X(Math.min(i + 1, dim)).toFixed(1) + ' ' + Y(arr[i + 1]).toFixed(1)).join('');
  const sameDayPrev = prev[Math.min(upto, pdim)], diff = cur[upto] - sameDayPrev;
  return `<div class="card col" style="gap:14px">
    <div class="row between"><span style="font-weight:800">Ritmo del mese</span><span class="row small muted" style="gap:10px"><span class="row" style="gap:6px"><span class="dot" style="background:var(--accent)"></span>${shortMonth(k)}</span><span class="row" style="gap:6px"><span class="dot" style="background:var(--muted)"></span>${shortMonth(prevK)}</span></span></div>
    <svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Spesa cumulata del mese">
      <path d="${path(prev, Math.min(pdim, dim))}" style="fill:none;stroke:var(--muted);stroke-width:2;stroke-dasharray:2 5;stroke-linecap:round"/>
      ${isCur && lr ? `<line x1="${X(upto).toFixed(1)}" y1="${Y(cur[upto]).toFixed(1)}" x2="${X(dim).toFixed(1)}" y2="${Y(proj).toFixed(1)}" style="stroke:var(--warn);stroke-width:2;stroke-dasharray:5 4;stroke-linecap:round"/>` : ''}
      <path d="${path(cur, upto)}" style="fill:none;stroke:var(--accent);stroke-width:3;stroke-linecap:round;stroke-linejoin:round"/>
      <text x="${pl}" y="${H - 6}" style="fill:var(--muted);font-size:10px;font-weight:700">1</text><text x="${W - pr}" y="${H - 6}" text-anchor="end" style="fill:var(--muted);font-size:10px;font-weight:700">${dim}</text>
    </svg>
    <div class="row between" style="border-top:1px solid var(--line);padding-top:12px">
      <div class="stat"><span class="v num" style="font-size:18px;color:${diff > 0 ? 'var(--warn)' : 'var(--accent)'}">${sgnMoney(diff)}</span><span class="small muted">rispetto ${upto === 8 || upto === 11 ? "all'" : 'al '}${upto} ${shortMonth(prevK)}</span></div>
      <div class="stat" style="text-align:right"><span class="v num" style="font-size:18px">${fmtMoney(proj)}</span><span class="small muted">${isCur ? 'stima a fine mese' : 'totale del mese'}</span></div>
    </div>
    ${isCur ? '<span class="hint">Linea tratteggiata arancio: proiezione lineare del ritmo di questo mese. Le spese grosse a inizio mese (affitto, rate) la fanno sembrare più alta nei primi giorni.</span>' : ''}
  </div>`; } };

ANA_WIDGETS.savings = { title: 'Risparmio nel tempo', desc: 'Entrate meno spese mese per mese negli ultimi 12 mesi, con la tendenza.', icon: 'bank', render() {
  const { months } = completedMonths(12), rows = months.map(m => ({ m, inc: sumBy(monthIncome(m.k)), exp: sumBy(monthExpenses(m.k)) }));
  const totInc = rows.reduce((a, r) => a + r.inc, 0), totExp = rows.reduce((a, r) => a + r.exp, 0);
  if (!totInc) return `<div class="card col" style="gap:10px"><span style="font-weight:800">Risparmio nel tempo</span><span class="muted small">Registra le entrate (es. lo stipendio) per vedere quanto risparmi ogni mese.</span></div>`;
  const pts = rows.map(r => ({ d: isoDay(r.m.k + '-15'), v: r.inc - r.exp })), c = timeChart([{ pts, color: 'var(--accent)', width: 3, trend: true }], { project: true, aria: 'Risparmio mensile con linea di tendenza' });
  const tr = c.trends[0], avg = (totInc - totExp) / rows.length, rate = (totInc - totExp) / totInc * 100;
  return `<div class="card col" style="gap:14px">
    <div class="row between"><span style="font-weight:800">Risparmio nel tempo</span><span class="small muted">ultimi 12 mesi</span></div>
    ${c.svg}
    <div class="row between" style="border-top:1px solid var(--line);padding-top:12px">
      <div class="stat"><span class="v num" style="font-size:18px;color:${avg >= 0 ? 'var(--accent)' : 'var(--warn)'}">${sgnMoney(avg)}</span><span class="small muted">media al mese · ${Math.round(rate)}% delle entrate</span></div>
      ${tr ? `<div class="stat" style="text-align:right"><span class="v num" style="font-size:18px;color:${slopeColor(tr.b * 30, avg, true)}">${trendWord(tr.b * 30, avg)}</span><span class="small muted">tendenza</span></div>` : ''}
    </div>
    <span class="hint">Gli investimenti (categorie escluse dalle spese) qui contano come risparmio.</span>
  </div>`; } };

ANA_WIDGETS.ticket = { title: 'Quante volte e quanto', desc: 'Numero di spese al mese e importo medio di ciascuna: capisci se spendi più spesso o più per volta.', icon: 'cart', render() {
  const { months, nextLabel } = completedMonths(12), rows = months.map(m => { const l = monthExpenses(m.k); return { label: m.label, n: l.length, avg: l.length ? sumBy(l) / l.length : 0 }; });
  if (rows.filter(r => r.n).length < 3) return `<div class="card col" style="gap:10px"><span style="font-weight:800">Quante volte e quanto</span><span class="muted small">Servono almeno 3 mesi con spese.</span></div>`;
  const { lr, svg: chart } = trendBars(rows.map((r, i) => ({ label: r.label, v: r.n, on: i === rows.length - 1 })), { project: true, projLabel: nextLabel, aria: 'Numero di spese al mese' });
  const lrAvg = linreg(rows.map(r => r.avg)), mN = rows.reduce((a, r) => a + r.n, 0) / rows.length, mA = rows.reduce((a, r) => a + r.avg, 0) / rows.length;
  const nWord = !lr || Math.abs(lr.b) < mN * 0.02 ? '≈ stabile' : (lr.b > 0 ? '+' : '-') + Math.abs(lr.b).toFixed(1).replace('.', ',') + '/mese';
  return `<div class="card col" style="gap:14px">
    <div class="row between"><span style="font-weight:800">Quante volte e quanto</span><span class="small muted">spese al mese</span></div>
    ${chart}
    <div class="row between" style="border-top:1px solid var(--line);padding-top:12px">
      <div class="stat"><span class="v num" style="font-size:18px">${Math.round(mN)} <span class="small muted">${nWord}</span></span><span class="small muted">spese al mese</span></div>
      <div class="stat" style="text-align:right"><span class="v num" style="font-size:18px">${fmtMoney(mA)}</span><span class="small" style="color:${slopeColor(lrAvg ? lrAvg.b : 0, mA)}">${trendWord(lrAvg ? lrAvg.b : 0, mA)} per spesa</span></div>
    </div>
  </div>`; } };

// Riga di tendenza nella schermata Spese: un colpo d'occhio, i dettagli sono in Analisi.
function homeTrendLine() {
  const { months } = completedMonths(6), ys = months.map(m => sumBy(monthExpenses(m.k)));
  if (ys.filter(Boolean).length < 3) return '';
  const lr = linreg(ys), avg = ys.reduce((a, b) => a + b, 0) / ys.length;
  return `<a href="#analisi" class="row between small" style="padding:10px 12px;border-radius:var(--r-m);background:var(--surface);border:var(--card-border)"><span class="row" style="gap:8px"><span style="color:${slopeColor(lr.b, avg)}">${svg('trend', 16)}</span>Tendenza 6 mesi</span><span class="row" style="gap:10px">${sparkline(ys)}<span class="num" style="font-weight:700;color:${slopeColor(lr.b, avg)}">${trendWord(lr.b, avg)}</span></span></a>`;
}

// ---------- Diario: analisi ----------
let _spendCache = null;
function dailySpend() { // spesa per giorno (esclusi gli investimenti), ricalcolata solo se cambiano i movimenti
  const key = S.expenses.length + '|' + todayISO();
  if (_spendCache && _spendCache.key === key) return _spendCache.map;
  const map = {}; live(S.expenses).forEach(e => { if (typeOf(e) === 'expense' && !catById(e.cat).excluded) map[e.date] = (map[e.date] || 0) + Number(e.amount || 0); });
  _spendCache = { key, map }; return map;
}
function streaks(dates) {
  const today = todayISO(), sorted = [...dates].sort();
  let cur = 0, d = dates.has(today) ? today : addDays(today, -1); while (dates.has(d)) { cur++; d = addDays(d, -1); }
  let best = 0, run = 0, prev = null; sorted.forEach(x => { run = prev && addDays(prev, 1) === x ? run + 1 : 1; best = Math.max(best, run); prev = x; });
  const weeks = new Set(sorted.map(weekStart)), tw = weekStart(today);
  let wcur = 0, w = weeks.has(tw) ? tw : addDays(tw, -7); while (weeks.has(w)) { wcur++; w = addDays(w, -7); }
  let wbest = 0, wr = 0, pw = null; [...weeks].sort().forEach(x => { wr = pw && addDays(pw, 7) === x ? wr + 1 : 1; wbest = Math.max(wbest, wr); pw = x; });
  return { cur, best, wcur, wbest };
}
// Dettagli di un'attività: serie, ultimi 12 mesi con tendenza, giorni della settimana, spesa nei giorni con e senza.
function habitInsights(h, st) {
  if (!st.total) return '';
  const s = streaks(st.dates), today = todayISO(), [y, m] = todayISO().split('-').map(Number);
  const months = Array.from({ length: 12 }, (_, i) => { const d = new Date(y, m - 12 + i, 1), k = localISO(d).slice(0, 7); return { k, label: d.toLocaleDateString('it-IT', { month: 'short' }) }; });
  const pts = months.map((mm, i) => ({ label: mm.label, v: [...st.dates].filter(d => monthKey(d) === mm.k).length, on: i === 11 }));
  const { lr, svg: chart } = trendBars(pts.slice(0, 11), { aria: 'Giorni al mese con linea di tendenza' });
  const mean = pts.slice(0, 11).reduce((a, p) => a + p.v, 0) / 11, tWord = !lr || Math.abs(lr.b) < Math.max(mean * 0.03, 0.05) ? '≈ stabile' : (lr.b > 0 ? 'in crescita, +' : 'in calo, -') + Math.abs(lr.b).toFixed(1).replace('.', ',') + ' giorni/mese';
  const wd = [0, 0, 0, 0, 0, 0, 0]; st.dates.forEach(d => { wd[(new Date(d + 'T12:00:00').getDay() + 6) % 7]++; });
  const wmax = Math.max(...wd, 1), WD = ['L', 'M', 'M', 'G', 'V', 'S', 'D'], top = wd.indexOf(Math.max(...wd));
  const from = addDays(today, -180), sp = dailySpend(); let wS = 0, wN = 0, oS = 0, oN = 0;
  for (let d = from; d <= today; d = addDays(d, 1)) { const v = sp[d] || 0; if (st.dates.has(d)) { wS += v; wN++; } else { oS += v; oN++; } }
  const spendRow = wN >= 5 && oN >= 5 && (wS + oS) > 0 ? (() => { const a = wS / wN, b = oS / oN, diff = b ? (a - b) / b * 100 : 0; return `<div class="row between small" style="border-top:1px solid var(--line);padding-top:10px"><span class="muted">Spesa media nei giorni ${esc(h.name)}</span><span class="num" style="font-weight:700">${fmtMoney(a)} <span class="muted" style="font-weight:500">vs ${fmtMoney(b)} (${diff >= 0 ? '+' : '-'}${Math.abs(Math.round(diff))}%)</span></span></div>`; })() : '';
  return `
    <div class="row" style="justify-content:space-between">
      <div class="stat"><span class="v num">${s.cur}</span><span class="small muted">${s.cur === 1 ? 'giorno' : 'giorni'} di fila</span></div>
      <div class="stat"><span class="v num">${s.wcur}</span><span class="small muted">${s.wcur === 1 ? 'settimana' : 'settimane'} di fila</span></div>
      <div class="stat" style="text-align:right"><span class="v num">${s.best}<span class="small muted"> / ${s.wbest} sett.</span></span><span class="small muted">record</span></div>
    </div>
    <div class="col" style="gap:6px"><div class="row between small"><span class="muted">Giorni al mese, ultimi 11 mesi completi</span><span style="font-weight:700;color:${!lr || tWord.startsWith('≈') ? 'var(--muted)' : lr.b > 0 ? 'var(--accent)' : 'var(--warn)'}">${tWord}</span></div>${chart}</div>
    <div class="col" style="gap:6px"><div class="row between small"><span class="muted">Giorni della settimana</span><span class="muted">più spesso: ${WEEKDAYS[top]}</span></div>
      <div class="bars" style="height:64px;gap:6px">${wd.map((v, i) => `<div><div class="b" style="height:${Math.max(3, Math.round(v / wmax * 100))}%;background:${i === top ? h.color : 'var(--surface-3)'}"></div><span class="small muted">${WD[i]}</span></div>`).join('')}</div></div>
    ${spendRow}`;
}
// Panoramica di tutte le attività: ultime 12 settimane con tendenza, costanza e confronto con la settimana prima.
function diaryOverview(habits) {
  if (!habits.length) return '';
  const tw = weekStart(todayISO()), dates = habits.map(h => habitStats(h).dates);
  const weeks = Array.from({ length: 12 }, (_, i) => addDays(tw, (i - 11) * 7));
  const countWeek = ws => { let n = 0; for (let i = 0; i < 7; i++) { const d = addDays(ws, i); dates.forEach(s => { if (s.has(d)) n++; }); } return n; };
  const pts = weeks.map((w, i) => ({ label: Number(w.slice(8)) + '/' + Number(w.slice(5, 7)), v: countWeek(w), on: i === 11 }));
  const { lr, svg: chart } = trendBars(pts.slice(0, 11), { aria: 'Attività per settimana con linea di tendenza' });
  const thisW = pts[11].v, lastW = pts[10].v; let active = 0; for (let i = 0; i < 30; i++) { const d = addDays(todayISO(), -i); if (dates.some(s => s.has(d))) active++; }
  return `<div class="card col" style="gap:14px">
    <div class="row between"><span style="font-weight:800">Andamento</span><span class="small muted">tutte le attività</span></div>
    <div class="row between">
      <div class="stat"><span class="v num">${thisW}</span><span class="small muted">questa settimana</span></div>
      <div class="stat"><span class="v num" style="color:${thisW >= lastW ? 'var(--accent)' : 'var(--warn)'}">${thisW >= lastW ? '+' : '-'}${Math.abs(thisW - lastW)}</span><span class="small muted">vs la precedente</span></div>
      <div class="stat" style="text-align:right"><span class="v num">${Math.round(active / 30 * 100)}%</span><span class="small muted">giorni attivi (30 gg)</span></div>
    </div>
    <div class="col" style="gap:6px"><div class="row between small"><span class="muted">Attività per settimana, ultime 11 complete</span>${lr ? `<span style="font-weight:700;color:${Math.abs(lr.b) < 0.1 ? 'var(--muted)' : lr.b > 0 ? 'var(--accent)' : 'var(--warn)'}">${Math.abs(lr.b) < 0.1 ? '≈ stabile' : (lr.b > 0 ? '+' : '-') + Math.abs(lr.b).toFixed(1).replace('.', ',') + '/sett.'}</span>` : ''}</div>${chart}</div>
  </div>`;
}
