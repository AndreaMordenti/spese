/* Esplora: analisi filtrabili di spese e diario, quota investibile, diversificazione del portafoglio. */
'use strict';

// ---------- Filtri ----------
const EX = { tab: 'spese', period: '6m', from: '', to: '', type: 'expense', group: '', cat: '', account: '', q: '', compare: 'prev', invest: false, sort: 'date', months: 12, habit: '' };
const PERIODS = [['month', 'Questo mese'], ['lastmonth', 'Mese scorso'], ['3m', 'Ultimi 3 mesi'], ['6m', 'Ultimi 6 mesi'], ['12m', 'Ultimi 12 mesi'], ['ytd', "Quest'anno"], ['lastyear', 'Anno scorso'], ['all', 'Tutto'], ['custom', 'Personalizzato']];
function exRange() {
  const t = todayISO(), [y, m] = t.split('-').map(Number), first = (yy, mm) => localISO(new Date(yy, mm - 1, 1)), last = (yy, mm) => localISO(new Date(yy, mm, 0));
  switch (EX.period) {
    case 'month': return [first(y, m), t];
    case 'lastmonth': return [first(y, m - 1), last(y, m - 1)];
    case '3m': return [first(y, m - 2), t];
    case '6m': return [first(y, m - 5), t];
    case '12m': return [first(y, m - 11), t];
    case 'ytd': return [`${y}-01-01`, t];
    case 'lastyear': return [`${y - 1}-01-01`, `${y - 1}-12-31`];
    case 'all': { const ds = live(S.expenses).map(e => e.date).sort(); return [ds[0] || t, t]; }
    default: return [EX.from || first(y, m), EX.to || t];
  }
}
function exCompareRange([a, b]) {
  if (EX.compare === 'year') return [addDays(a, -365), addDays(b, -365)];
  if (EX.compare === 'prev') { const n = daysBetween(a, b) + 1; return [addDays(a, -n), addDays(a, -1)]; }
  return null;
}
function exMatch(e, [a, b], typeOverride) {
  const c = catById(e.cat), type = typeOverride || EX.type;
  if (e.date < a || e.date > b) return false;
  if (type !== 'all' && typeOf(e) !== type) return false;
  if (typeOf(e) === 'expense' && c.excluded && !EX.invest) return false;
  if (EX.group && groupOf(c) !== EX.group) return false;
  if (EX.cat && e.cat !== EX.cat) return false;
  if (EX.account && (e.account || '') !== EX.account) return false;
  if (EX.q && !`${e.note || ''} ${c.name}`.toLowerCase().includes(EX.q.toLowerCase())) return false;
  return true;
}
function exSet(k, v) { EX[k] = v; if (k === 'group') EX.cat = ''; route(); }
function exFilters(onlyPeriod) {
  const sel = (k, opts, label) => `<label class="ex-f"><span>${label}</span><select onchange="exSet('${k}',this.value)">${opts.map(([v, l]) => `<option value="${esc(v)}" ${String(EX[k]) === String(v) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>`;
  const catOpts = [['', 'Tutte'], ...cats(EX.type === 'income' ? 'income' : 'expense').filter(c => !EX.group || groupOf(c) === EX.group).sort((a, b) => a.name.localeCompare(b.name)).map(c => [c.id, c.name])];
  const accs = [...new Set(live(S.expenses).map(e => e.account).filter(Boolean))].sort();
  return `<div class="ex-filters">
    ${sel('period', PERIODS, 'Periodo')}
    ${EX.period === 'custom' ? `<label class="ex-f"><span>Dal</span><input type="date" value="${exRange()[0]}" onchange="EX.from=this.value;route()"></label><label class="ex-f"><span>Al</span><input type="date" value="${exRange()[1]}" onchange="EX.to=this.value;route()"></label>` : ''}
    ${onlyPeriod ? '' : `${sel('type', [['expense', 'Spese'], ['income', 'Entrate'], ['all', 'Tutto']], 'Tipo')}
    ${EX.type !== 'income' ? sel('group', [['', 'Tutti'], ...CAT_GROUPS.map(g => [g.id, g.name])], 'Gruppo') : ''}
    ${sel('cat', catOpts, 'Categoria')}
    ${accs.length > 1 ? sel('account', [['', 'Tutti'], ...accs.map(a => [a, a])], 'Conto') : ''}
    ${sel('compare', [['prev', 'Periodo precedente'], ['year', 'Anno prima'], ['none', 'Nessuno']], 'Confronta con')}
    <label class="ex-f grow"><span>Cerca</span><input type="search" value="${esc(EX.q)}" placeholder="Esercente o nota" onchange="exSet('q',this.value)"></label>
    <label class="row ex-check"><input type="checkbox" ${EX.invest ? 'checked' : ''} onchange="exSet('invest',this.checked)"><span>Includi investimenti</span></label>
    ${EX.group || EX.cat || EX.account || EX.q ? `<button class="chip" onclick="Object.assign(EX,{group:'',cat:'',account:'',q:''});route()">Azzera filtri</button>` : ''}`}
  </div>`;
}
const deltaTxt = (cur, prev) => { if (!prev) return '<span class="muted">–</span>'; const d = cur - prev, p = d / prev * 100; return `<span style="color:${d > 0 ? 'var(--warn)' : 'var(--accent)'}">${d >= 0 ? '+' : '-'}${Math.abs(Math.round(p))}%</span>`; };

// ---------- Scheda Spese ----------
function exSpese() {
  const R = exRange(), CR = exCompareRange(R), all = live(S.expenses), F = all.filter(e => exMatch(e, R)), FC = CR ? all.filter(e => exMatch(e, CR)) : [];
  const days = daysBetween(R[0], R[1]) + 1, months = days / 30.44, isAll = EX.type === 'all';
  const out = F.filter(e => typeOf(e) === 'expense'), inn = F.filter(e => typeOf(e) === 'income'), main = EX.type === 'income' ? inn : out;
  const tot = sumBy(main), totC = sumBy(FC.filter(e => typeOf(e) === (EX.type === 'income' ? 'income' : 'expense')));
  const kpi = (v, l, extra = '') => `<div class="stat"><span class="v num">${v}</span><span class="small muted">${l}${extra}</span></div>`;
  // Andamento: giorni se il periodo è corto, altrimenti mesi.
  let pts;
  if (days <= 62) pts = Array.from({ length: days }, (_, i) => { const d = addDays(R[0], i); return { label: String(Number(d.slice(8))), v: sumBy(main.filter(e => e.date === d)) }; });
  else { const ks = []; for (let d = R[0].slice(0, 7); d <= R[1].slice(0, 7); d = localISO(new Date(Number(d.slice(0, 4)), Number(d.slice(5)), 1)).slice(0, 7)) ks.push(d); pts = ks.map(k => ({ label: shortMonth(k), v: sumBy(main.filter(e => monthKey(e.date) === k)) })); }
  if (pts.length) pts[pts.length - 1].on = true;
  // Il mese (o il giorno) in corso è parziale: non entra nella tendenza.
  const partial = R[1] === todayISO() && pts.length > 2 ? 1 : 0;
  const { lr, svg: chart } = pts.length >= 2 ? trendBars(pts, { aria: 'Andamento nel periodo', fit: pts.length - partial }) : { svg: '' };
  // Ripartizione per gruppo e categoria, con confronto.
  const byCat = {}, byCatC = {}; main.forEach(e => { byCat[e.cat] = (byCat[e.cat] || 0) + Number(e.amount); }); FC.forEach(e => { byCatC[e.cat] = (byCatC[e.cat] || 0) + Number(e.amount); });
  const cnt = {}; main.forEach(e => { cnt[e.cat] = (cnt[e.cat] || 0) + 1; });
  const groups = EX.type === 'income' ? [{ g: { id: 'inc', name: 'Entrate', color: '#6EE7B7', icon: 'work' }, cs: Object.keys(byCat) }] : CAT_GROUPS.map(g => ({ g, cs: Object.keys(byCat).filter(id => groupOf(catById(id)) === g.id) })).filter(x => x.cs.length);
  const rowsHtml = groups.map(({ g, cs }) => { const gt = cs.reduce((a, id) => a + byCat[id], 0), gtc = cs.reduce((a, id) => a + (byCatC[id] || 0), 0); return `
    <tr class="ex-grp"><td><button class="row" style="gap:8px" onclick="exSet('group','${g.id === 'inc' ? '' : g.id}')"><span class="dot" style="background:${g.color}"></span><b>${g.name}</b></button></td><td class="num">${fmtMoney(gt, false)}</td><td class="num">${tot ? Math.round(gt / tot * 100) : 0}%</td><td></td><td class="num">${CR ? deltaTxt(gt, gtc) : ''}</td></tr>
    ${cs.sort((a, b) => byCat[b] - byCat[a]).map(id => `<tr><td style="padding-left:26px"><button onclick="EX.cat='${id}';route()">${esc(catById(id).name)}</button></td><td class="num">${fmtMoney(byCat[id], false)}</td><td class="num muted">${tot ? Math.round(byCat[id] / tot * 100) : 0}%</td><td class="num muted">${cnt[id]}</td><td class="num">${CR ? deltaTxt(byCat[id], byCatC[id] || 0) : ''}</td></tr>`).join('')}`; }).join('');
  // Esercenti più frequenti (dalla nota).
  const mk = typeof merchantKey === 'function' ? merchantKey : (x => String(x || '').toLowerCase().trim());
  const byM = {}; main.filter(e => e.note && e.source !== 'planned').forEach(e => { const k = mk(e.note); if (!k) return; const o = byM[k] = byM[k] || { name: e.note, tot: 0, n: 0 }; o.tot += Number(e.amount); o.n++; });
  const topM = Object.values(byM).sort((a, b) => b.tot - a.tot).slice(0, 10);
  // Movimenti filtrati.
  const sorted = F.slice().sort(EX.sort === 'amount' ? (a, b) => b.amount - a.amount : byWhenDesc).slice(0, 300);
  return `
    <div class="ex-grid">
      <div class="card ex-wide"><div class="ex-kpis">
        ${isAll ? kpi(fmtMoney(sumBy(inn)), 'entrate') + kpi(fmtMoney(sumBy(out)), 'uscite') + kpi(sgnMoney(sumBy(inn) - sumBy(out)), 'differenza') : kpi(fmtMoney(tot), EX.type === 'income' ? 'entrate' : 'spese', CR ? ' · ' + deltaTxt(tot, totC) + ' vs confronto' : '')}
        ${kpi(fmtMoney(tot / Math.max(months, 1)), 'al mese')}${kpi(fmtMoney(tot / days), 'al giorno')}${kpi(String(main.length), 'movimenti')}${kpi(fmtMoney(main.length ? tot / main.length : 0), 'importo medio')}
      </div></div>
      <div class="card col ex-wide" style="gap:12px"><div class="row between"><span style="font-weight:800">Andamento</span>${lr ? `<span class="small" style="font-weight:700;color:${slopeColor(lr.b, tot / pts.length)}">tendenza ${trendWord(lr.b, tot / pts.length, days <= 62 ? '/giorno' : '/mese')}</span>` : ''}</div>${chart || '<span class="muted small">Nessun dato nel periodo.</span>'}</div>
      <div class="card col" style="gap:10px"><span style="font-weight:800">Per gruppo e categoria</span>
        <div class="scroll-x"><table class="tbl"><thead><tr><th>Voce</th><th>€</th><th>%</th><th>Mov.</th><th>${CR ? 'Δ' : ''}</th></tr></thead><tbody>${rowsHtml || '<tr><td colspan="5" class="muted">Nessun movimento.</td></tr>'}</tbody></table></div>
        <span class="hint">Tocca un gruppo o una categoria per filtrare.</span></div>
      <div class="card col" style="gap:10px"><span style="font-weight:800">Dove spendi di più</span><span class="hint">Esercenti delle spese registrate a mano o dalle notifiche; i pagamenti pianificati sono esclusi.</span>
        ${topM.length ? `<table class="tbl"><thead><tr><th>Esercente / nota</th><th>€</th><th>Volte</th></tr></thead><tbody>${topM.map(m => `<tr><td><button onclick="exSet('q',${esc(JSON.stringify(m.name))})">${esc(m.name)}</button></td><td class="num">${fmtMoney(m.tot, false)}</td><td class="num muted">${m.n}</td></tr>`).join('')}</tbody></table>` : '<span class="muted small">Aggiungi una nota (esercente) ai movimenti per vedere questa classifica.</span>'}</div>
      ${exRecurring()}
      <div class="card col ex-wide" style="gap:10px"><div class="row between"><span style="font-weight:800">Movimenti (${F.length})</span><span class="row" style="gap:8px"><button class="chip ${EX.sort === 'date' ? 'on' : ''}" onclick="exSet('sort','date')">Data</button><button class="chip ${EX.sort === 'amount' ? 'on' : ''}" onclick="exSet('sort','amount')">Importo</button><button class="chip" onclick="exExportCSV()">CSV</button></span></div>
        <div class="scroll-x"><table class="tbl"><thead><tr><th>Data</th><th>Descrizione</th><th>Categoria</th><th>Conto</th><th>€</th></tr></thead><tbody>${sorted.map(e => `<tr onclick="openExpense('${e.id}')" style="cursor:pointer"><td class="muted">${fmtDate(e.date, { day: 'numeric', month: 'short', year: '2-digit' })}</td><td>${esc(e.note || '')}</td><td>${esc(catById(e.cat).name)}</td><td class="muted">${esc(e.account || '')}</td><td class="num" style="color:${typeOf(e) === 'income' ? 'var(--accent)' : 'inherit'}">${typeOf(e) === 'income' ? '+' : '-'}${fmtMoney(e.amount, false)}</td></tr>`).join('')}</tbody></table></div>
        ${F.length > 300 ? '<span class="hint">Mostrati i primi 300: usa i filtri o esporta il CSV.</span>' : ''}</div>
    </div>`;
}
// Spese ricorrenti non ancora pianificate: stesso esercente, importo simile, in almeno 3 mesi diversi.
function exRecurring() {
  const from = addDays(todayISO(), -365), mk = typeof merchantKey === 'function' ? merchantKey : (x => String(x || '').toLowerCase());
  const plannedNames = new Set(plannedAll().map(p => mk(p.name)));
  const g = {}; live(S.expenses).filter(e => typeOf(e) === 'expense' && e.date >= from && e.note && e.source !== 'planned').forEach(e => { const k = mk(e.note); if (!k) return; (g[k] = g[k] || []).push(e); });
  const rec = Object.entries(g).map(([k, es]) => { const ms = new Set(es.map(e => monthKey(e.date))), am = es.map(e => Number(e.amount)), avg = am.reduce((a, b) => a + b, 0) / am.length, spread = (Math.max(...am) - Math.min(...am)) / avg;
    const days = es.map(e => Number(e.date.slice(8))).sort((a, b) => a - b); return { k, name: es[0].note, months: ms.size, avg, spread, day: days[Math.floor(days.length / 2)], cat: es[0].cat }; })
    .filter(r => r.months >= 3 && r.spread < 0.25 && !plannedNames.has(r.k)).sort((a, b) => b.avg - a.avg).slice(0, 8);
  return `<div class="card col" style="gap:10px"><span style="font-weight:800">Spese ricorrenti trovate</span>
    ${rec.length ? `<table class="tbl"><thead><tr><th>Voce</th><th>€/mese</th><th>Mesi</th><th></th></tr></thead><tbody>${rec.map(r => `<tr><td>${esc(r.name)}</td><td class="num">${fmtMoney(r.avg, false)}</td><td class="num muted">${r.months}</td><td><button class="chip" style="height:32px" onclick="exPlan(${esc(JSON.stringify(r))})">Pianifica</button></td></tr>`).join('')}</tbody></table>` : '<span class="muted small">Nessuna spesa ricorrente non pianificata negli ultimi 12 mesi.</span>'}
    <span class="hint">Stesso esercente e importo simile in almeno 3 mesi. "Pianifica" lo aggiunge ai pagamenti pianificati, da confermare.</span></div>`;
}
function exPlan(r) {
  const id = 'pl-' + uid();
  S.planned.push({ id, name: r.name, amount: Math.round(r.avg * 100) / 100, day: r.day || 1, every: 1, start: addDays(todayISO(), 1), end: null, type: 'expense', cat: r.cat, account: S.accounts[0] || '', auto: false, active: true, updatedAt: Date.now() });
  save(); editPlanned(id);
}
function exExportCSV() {
  const R = exRange(), F = live(S.expenses).filter(e => exMatch(e, R)).sort((a, b) => a.date.localeCompare(b.date));
  const rows = [['data', 'tipo', 'importo', 'categoria', 'gruppo', 'nota', 'conto'], ...F.map(e => [e.date, typeOf(e) === 'income' ? 'entrata' : 'spesa', String(e.amount).replace('.', ','), catById(e.cat).name, groupById(groupOf(catById(e.cat))).name, e.note || '', e.account || ''])];
  download(`slow-movimenti-${R[0]}_${R[1]}.csv`, '﻿' + rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(';')).join('\n'), 'text/csv');
}

// ---------- Scheda Risparmio: quanto puoi investire ----------
const median = a => { const s = a.slice().sort((x, y) => x - y), n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : 0; };
function exSavingsSet(k, v) { S.settings[k] = v; save(); route(); }
function exRisparmio() {
  const n = EX.months, { months } = completedMonths(n);
  const rows = months.map(m => { const inc = sumBy(monthIncome(m.k)), exp = sumBy(monthExpenses(m.k)), inv = sumBy(monthAll(m.k).filter(e => typeOf(e) === 'expense' && catById(e.cat).excluded)); return { ...m, inc, exp, inv, margin: inc - exp, free: inc - exp - inv }; });
  const withInc = rows.filter(r => r.inc > 0);
  const buffer = Number(S.settings.saveBuffer ?? 20), emMonths = Number(S.settings.emergencyMonths ?? 6), liquidity = Number(S.settings.liquidity || 0), hasLiq = liquidity > 0;
  const mInc = median(withInc.map(r => r.inc)), mExp = median(rows.map(r => r.exp)), mInv = rows.reduce((a, r) => a + r.inv, 0) / (rows.length || 1), margin = mInc - mExp;
  const pac = plannedAll().filter(p => p.active !== false && (p.holdingId || plannedExcluded(p))).reduce((a, p) => a + plannedMonthly(p), 0);
  const investable = Math.max(0, margin * (1 - buffer / 100)), extra = investable - Math.max(pac, mInv);
  const emTarget = emMonths * mExp, emGap = hasLiq ? Math.max(0, emTarget - liquidity) : 0;
  const { svg: chart } = trendBars(rows.map((r, i) => ({ label: r.label, v: Math.max(0, r.margin), on: i === rows.length - 1 })), { aria: 'Margine mensile: entrate meno spese' });
  if (!withInc.length) return `<div class="empty">Per calcolare la quota investibile servono le entrate (es. lo stipendio) registrate negli ultimi mesi.</div>`;
  const big = (v, l, color) => `<div class="stat"><span class="v num" style="${color ? 'color:' + color : ''}">${v}</span><span class="small muted">${l}</span></div>`;
  return `
    <div class="ex-grid">
      <div class="card col ex-wide" style="gap:14px">
        <div class="row between" style="flex-wrap:wrap;gap:8px"><span style="font-weight:800">Quanto puoi investire ogni mese</span><span class="row" style="gap:6px">${[6, 12, 24].map(m => `<button class="chip ${n === m ? 'on' : ''}" style="height:32px" onclick="EX.months=${m};route()">${m} mesi</button>`).join('')}</span></div>
        <div class="ex-kpis">${big(fmtMoney(mInc), 'entrate tipiche (mediana)')}${big(fmtMoney(mExp), 'spese tipiche, investimenti esclusi')}${big(fmtMoney(margin), 'margine al mese', margin >= 0 ? 'var(--accent)' : 'var(--warn)')}${big(fmtMoney(Math.max(pac, mInv)), 'già investito al mese')}</div>
        <div class="col" style="gap:8px;padding:14px;border-radius:var(--r-m);background:${hexA('#D4FF5B', .08)};border:1px solid var(--accent)">
          <span class="small muted">Quota investibile (margine meno il ${buffer}% tenuto come liquidità)</span>
          <span class="num" style="font-size:30px;font-weight:700">${fmtMoney(investable)}<span class="small muted" style="font-size:13px"> al mese</span></span>
          <span style="font-weight:700;color:${extra >= 0 ? 'var(--accent)' : 'var(--warn)'}">${extra >= 1 ? `Puoi aumentare gli investimenti di circa ${fmtMoney(extra)} al mese.` : extra <= -1 ? `Oggi investi ${fmtMoney(-extra)} al mese più della quota suggerita: stai usando parte del cuscinetto.` : 'Investi già circa la quota suggerita.'}</span>
          ${emGap > 0 ? `<span class="small" style="color:var(--warn)">Prima conviene completare il fondo di emergenza: mancano ${fmtMoney(emGap)} (obiettivo ${emMonths} mesi di spese = ${fmtMoney(emTarget)}). Al ritmo del margine servono circa ${Math.ceil(emGap / Math.max(margin, 1))} mesi.</span>` : liquidity ? `<span class="small muted">Fondo di emergenza a posto: hai ${fmtMoney(liquidity)} di liquidità, l'obiettivo è ${fmtMoney(emTarget)} (${emMonths} mesi di spese).</span>` : `<span class="small muted">Inserisci qui sotto la liquidità che hai sui conti per verificare il fondo di emergenza (obiettivo ${fmtMoney(emTarget)}).</span>`}
        </div>
        <div class="ex-filters">
          <label class="ex-f"><span>Cuscinetto di liquidità (%)</span><input type="number" min="0" max="90" value="${buffer}" onchange="exSavingsSet('saveBuffer',+this.value)"></label>
          <label class="ex-f"><span>Fondo emergenza (mesi di spese)</span><input type="number" min="0" max="24" value="${emMonths}" onchange="exSavingsSet('emergencyMonths',+this.value)"></label>
          <label class="ex-f"><span>Liquidità sui conti oggi (€)</span><input type="number" min="0" value="${liquidity || ''}" placeholder="facoltativo" onchange="exSavingsSet('liquidity',+this.value)"></label>
        </div>
        <span class="hint">Uso la mediana per non farmi ingannare da mesi eccezionali (tredicesima, spese straordinarie). Gli investimenti sono le categorie escluse dalle spese, come "Investimenti" e i PAC. Indicazione di calcolo, non consulenza finanziaria.</span>
      </div>
      <div class="card col" style="gap:12px"><span style="font-weight:800">Margine mese per mese</span>${chart}</div>
      <div class="card col" style="gap:10px"><span style="font-weight:800">Dettaglio</span><div class="scroll-x"><table class="tbl"><thead><tr><th>Mese</th><th>Entrate</th><th>Spese</th><th>Investito</th><th>Resta</th></tr></thead><tbody>
        ${rows.slice().reverse().map(r => `<tr><td>${monthLabel(r.k)}</td><td class="num">${fmtMoney(r.inc, false)}</td><td class="num">${fmtMoney(r.exp, false)}</td><td class="num">${fmtMoney(r.inv, false)}</td><td class="num" style="color:${r.free >= 0 ? 'var(--accent)' : 'var(--warn)'}">${r.free >= 0 ? '' : '-'}${fmtMoney(r.free, false)}</td></tr>`).join('')}</tbody></table></div></div>
    </div>`;
}

// ---------- Scheda Diario ----------
function exDiario() {
  const R = exRange(), habits = activeHabits(), days = daysBetween(R[0], R[1]) + 1;
  if (!habits.length) return '<div class="empty">Nessuna attività nel diario.</div>';
  const h = habitById(EX.habit) || habits[0], dates = habitStats(h).dates;
  const rows = habits.map(x => { const ds = [...habitStats(x).dates].filter(d => d >= R[0] && d <= R[1]).sort(); let best = 0, run = 0, prev = null; ds.forEach(d => { run = prev && addDays(prev, 1) === d ? run + 1 : 1; best = Math.max(best, run); prev = d; }); return { x, n: ds.length, best }; });
  // Calendario dell'anno: 53 settimane × 7 giorni.
  const start = addDays(weekStart(todayISO()), -52 * 7), cells = Array.from({ length: 53 * 7 }, (_, i) => addDays(start, i));
  const cal = `<div class="ex-cal">${Array.from({ length: 53 }, (_, w) => `<div>${cells.slice(w * 7, w * 7 + 7).map(d => `<span title="${d}" style="background:${dates.has(d) ? h.color : d > todayISO() ? 'transparent' : 'var(--surface-2)'}"></span>`).join('')}</div>`).join('')}</div>`;
  const sp = typeof dailySpend === 'function' ? dailySpend() : {}; let a = 0, an = 0, b = 0, bn = 0;
  for (let d = R[0]; d <= R[1]; d = addDays(d, 1)) { if (dates.has(d)) { a += sp[d] || 0; an++; } else { b += sp[d] || 0; bn++; } }
  return `
    <div class="ex-grid">
      <div class="card col ex-wide" style="gap:10px"><span style="font-weight:800">Attività nel periodo</span><div class="scroll-x"><table class="tbl"><thead><tr><th>Attività</th><th>Giorni</th><th>% dei giorni</th><th>A settimana</th><th>Serie record</th></tr></thead><tbody>
        ${rows.map(r => `<tr><td><button class="row" style="gap:8px" onclick="exSet('habit','${r.x.id}')"><span class="dot" style="background:${r.x.color}"></span>${esc(r.x.name)}</button></td><td class="num">${r.n}</td><td class="num">${Math.round(r.n / days * 100)}%</td><td class="num">${(r.n / (days / 7)).toFixed(1).replace('.', ',')}</td><td class="num">${r.best}</td></tr>`).join('')}</tbody></table></div></div>
      <div class="card col ex-wide" style="gap:10px"><div class="row between"><span style="font-weight:800">${esc(h.name)}: ultimo anno</span><span class="small muted">${dates.size} giorni in totale</span></div>${cal}</div>
      ${an >= 3 && bn >= 3 ? `<div class="card col" style="gap:8px"><span style="font-weight:800">${esc(h.name)} e spese</span><span>Nei giorni con ${esc(h.name)} spendi in media <b class="num">${fmtMoney(a / an)}</b>, negli altri <b class="num">${fmtMoney(b / bn)}</b>.</span><span class="hint">Nel periodo scelto, investimenti esclusi.</span></div>` : ''}
    </div>`;
}

// ---------- Scheda Diversificazione ----------
// Pesi indicativi per area (2025) dei principali ETF UCITS. Verifica sempre il KID/factsheet dell'emittente.
const REGIONS = { usa: 'USA', europe: 'Europa', japan: 'Giappone', pacific: 'Altri sviluppati', em: 'Emergenti' };
const MARKET = { usa: 61, europe: 15, japan: 6, pacific: 7, em: 11 }; // mercato azionario globale (MSCI ACWI IMI, circa)
const ETF_KB = {
  IE000BI8OT95: { name: 'Amundi Core MSCI World', idx: 'msci-world', cls: 'eq', ter: 0.12, reg: { usa: 72, europe: 16, japan: 6, pacific: 6 } },
  IE00B4L5Y983: { name: 'iShares Core MSCI World', idx: 'msci-world', cls: 'eq', ter: 0.20, reg: { usa: 72, europe: 16, japan: 6, pacific: 6 } },
  IE00B5BMR087: { name: 'iShares Core S&P 500', idx: 'sp500', cls: 'eq', ter: 0.07, reg: { usa: 100 } },
  IE00BKM4GZ66: { name: 'iShares Core MSCI EM IMI', idx: 'em-imi', cls: 'eq', ter: 0.18, reg: { em: 100 } },
  IE00BK5BQT80: { name: 'Vanguard FTSE All-World', idx: 'all-world', cls: 'eq', ter: 0.19, reg: { usa: 62, europe: 14, japan: 6, pacific: 7, em: 11 } },
  IE00B3YLTY66: { name: 'SPDR MSCI ACWI IMI', idx: 'acwi-imi', cls: 'eq', ter: 0.17, reg: { usa: 61, europe: 15, japan: 6, pacific: 7, em: 11 } },
  IE00B4K48X80: { name: 'iShares Core MSCI Europe', idx: 'msci-europe', cls: 'eq', ter: 0.12, reg: { europe: 100 } },
  IE0006WW1TQ4: { name: 'Xtrackers MSCI World ex USA', idx: 'world-ex-usa', cls: 'eq', ter: 0.15, reg: { europe: 56, japan: 20, pacific: 24 } },
  IE00B4L5YX21: { name: 'iShares Core MSCI Japan IMI', idx: 'japan-imi', cls: 'eq', ter: 0.15, reg: { japan: 100 } },
  IE00BF4RFH31: { name: 'iShares MSCI World Small Cap', idx: 'world-small', cls: 'eq', ter: 0.35, reg: { usa: 60, europe: 15, japan: 11, pacific: 14 } },
  LU0378818131: { name: 'Xtrackers Global Government Bond EUR Hedged', idx: 'global-govt', cls: 'bond', ter: 0.25 },
  IE00BDBRDM35: { name: 'iShares Core Global Aggregate Bond EUR Hedged', idx: 'global-agg', cls: 'bond', ter: 0.10 },
  IE00B4WXJJ64: { name: 'iShares Core € Govt Bond', idx: 'euro-govt', cls: 'bond', ter: 0.07 },
  IE00B0M62X26: { name: 'iShares € Inflation Linked Govt Bond', idx: 'euro-infl', cls: 'bond', ter: 0.09 },
  IE00B579F325: { name: 'Invesco Physical Gold (ETC)', idx: 'gold', cls: 'gold', ter: 0.12 },
};
// Quale indice contiene già quale (sovrapposizioni).
const CONTAINS = { 'msci-world': ['sp500', 'msci-europe', 'japan-imi', 'world-ex-usa'], 'all-world': ['msci-world', 'sp500', 'msci-europe', 'japan-imi', 'world-ex-usa', 'em-imi'], 'acwi-imi': ['msci-world', 'sp500', 'msci-europe', 'japan-imi', 'world-ex-usa', 'em-imi', 'world-small'], 'global-govt': ['euro-govt'], 'global-agg': ['global-govt', 'euro-govt'] };
// "il 61%" ma "l'11%", "l'1%", "l'80%".
const artPct = v => { const n = Math.round(v); return (/^(1|11|8\d?)$/.test(String(n)) ? "l'" : 'il ') + n + '%'; };
const overlaps = (a, b) => a === b || (CONTAINS[a] || []).includes(b) || (CONTAINS[b] || []).includes(a);
function exDiversificazione() {
  const rows = holdingsLive().map(h => ({ h, v: position(h).value, kb: ETF_KB[h.isin] })).filter(r => r.v > 0);
  if (!rows.length) return '<div class="empty">Aggiungi i tuoi strumenti in Portafoglio per vedere la diversificazione.</div>';
  const eq = rows.filter(r => r.kb && r.kb.cls === 'eq'), eqTot = eq.reduce((a, r) => a + r.v, 0), tot = rows.reduce((a, r) => a + r.v, 0), unknown = rows.filter(r => !r.kb);
  const reg = {}; Object.keys(REGIONS).forEach(k => { reg[k] = eqTot ? eq.reduce((a, r) => a + r.v * (r.kb.reg[k] || 0) / 100, 0) / eqTot * 100 : 0; });
  const cls = {}; rows.forEach(r => { const c = r.kb ? r.kb.cls : 'altro'; cls[c] = (cls[c] || 0) + r.v; });
  const CLS = { eq: 'Azioni', bond: 'Obbligazioni', gold: 'Oro', altro: 'Non classificati' };
  // Sovrapposizioni tra gli ETF che hai.
  const ov = []; rows.forEach((a, i) => rows.slice(i + 1).forEach(b => { if (a.kb && b.kb && overlaps(a.kb.idx, b.kb.idx)) ov.push([a, b]); }));
  const held = rows.filter(r => r.kb).map(r => r.kb.idx), terW = rows.filter(r => r.kb).reduce((a, r) => a + r.v * r.kb.ter, 0) / (rows.filter(r => r.kb).reduce((a, r) => a + r.v, 0) || 1);
  // Suggerimenti: aree sottopesate di oltre 5 punti rispetto al mercato globale, con ETF che non si sovrappongono a quelli che hai.
  const tips = [];
  Object.keys(REGIONS).forEach(k => {
    const d = reg[k] - MARKET[k]; if (d >= -5) return;
    const mine = eq.find(r => (r.kb.reg[k] || 0) >= 90);
    if (mine) { tips.push(`<b>${REGIONS[k]}</b> pesa ${artPct(reg[k])} contro ${artPct(MARKET[k])} del mercato: hai già <b>${esc(mine.h.name)}</b>, basta aumentarne il PAC.`); return; }
    const alt = Object.entries(ETF_KB).filter(([, e]) => e.cls === 'eq' && (e.reg[k] || 0) >= 50 && !held.some(i => overlaps(i, e.idx)));
    if (alt.length) tips.push(`<b>${REGIONS[k]}</b> pesa ${artPct(reg[k])} contro ${artPct(MARKET[k])} del mercato. Alternative che non si sovrappongono: ${alt.map(([isin, e]) => `${esc(e.name)} (<span class="num">${isin}</span>, TER ${e.ter.toString().replace('.', ',')}%)`).join('; ')}.`);
  });
  Object.keys(REGIONS).forEach(k => { const d = reg[k] - MARKET[k]; if (d > 8) tips.push(`<b>${REGIONS[k]}</b> pesa ${artPct(reg[k])}, ${d.toFixed(0)} punti sopra il mercato globale: per ridurre il peso indirizza i nuovi versamenti altrove, senza vendere.`); });
  if (!held.some(i => ['world-small', 'acwi-imi'].includes(i))) tips.push(`Non hai <b>small cap</b>: sono aziende più piccole, poco presenti negli indici principali. Un ETF che non si sovrappone: iShares MSCI World Small Cap (<span class="num">IE00BF4RFH31</span>, TER 0,35%).`);
  if (held.includes('global-govt') && !held.some(i => ['euro-infl', 'euro-govt'].includes(i))) tips.push(`Sul lato obbligazioni hai solo titoli di Stato globali coperti dal cambio. Per diversificare: iShares € Inflation Linked Govt Bond (<span class="num">IE00B0M62X26</span>), che protegge dall'inflazione europea, o una quota di oro come Invesco Physical Gold (<span class="num">IE00B579F325</span>).`);
  const regRows = Object.keys(REGIONS).map(k => `<tr><td>${REGIONS[k]}</td><td class="num">${reg[k].toFixed(1).replace('.', ',')}%</td><td class="num muted">${MARKET[k]}%</td><td class="num" style="color:${Math.abs(reg[k] - MARKET[k]) <= 5 ? 'var(--muted)' : reg[k] > MARKET[k] ? 'var(--warn)' : 'var(--accent)'}">${reg[k] - MARKET[k] >= 0 ? '+' : ''}${(reg[k] - MARKET[k]).toFixed(0)}</td></tr>`).join('');
  return `
    <div class="ex-grid">
      <div class="card col" style="gap:14px"><span style="font-weight:800">Azioni per area geografica</span>
        <div class="row" style="gap:18px"><div class="donut-wrap">${donutSvg(Object.keys(REGIONS).map((k, i) => ({ value: reg[k], color: PALETTE[i] })))}<div class="donut-center"><span class="small muted">azioni</span><span class="num" style="font-weight:700">${fmtMoney(eqTot).replace(/,\d\d$/, '')}</span></div></div>
        <div class="legend">${Object.keys(REGIONS).map((k, i) => `<div class="row"><span class="dot" style="background:${PALETTE[i]}"></span><span class="grow">${REGIONS[k]}</span><span class="muted small">${reg[k].toFixed(0)}%</span></div>`).join('')}</div></div>
        <table class="tbl"><thead><tr><th>Area</th><th>Tu</th><th>Mercato</th><th>Δ punti</th></tr></thead><tbody>${regRows}</tbody></table>
        <span class="hint">Scomposizione "look-through": ogni ETF diviso per i paesi che contiene. Mercato = azionario globale (MSCI ACWI IMI). Pesi indicativi.</span></div>
      <div class="card col" style="gap:12px"><span style="font-weight:800">Composizione</span>
        <table class="tbl"><tbody>${Object.entries(cls).map(([c, v]) => `<tr><td>${CLS[c]}</td><td class="num">${fmtMoney(v, false)}</td><td class="num muted">${Math.round(v / tot * 100)}%</td></tr>`).join('')}</tbody></table>
        <span class="small muted">Costo medio ponderato (TER): <b class="num">${terW.toFixed(2).replace('.', ',')}%</b> all'anno.</span>
        ${unknown.length ? `<span class="hint">Non classificati: ${unknown.map(r => esc(r.h.name)).join(', ')}. Aggiungo il loro ISIN alla base dati se mi dici quali sono.</span>` : ''}</div>
      <div class="card col ex-wide" style="gap:10px"><span style="font-weight:800">Sovrapposizioni</span>
        ${ov.length ? ov.map(([a, b]) => `<span>⚠ <b>${esc(a.h.name)}</b> e <b>${esc(b.h.name)}</b> si sovrappongono: ${a.kb.idx === b.kb.idx ? 'replicano lo stesso indice.' : 'uno è già quasi tutto contenuto nell\'altro, quindi averli entrambi aumenta solo il peso di quella parte.'}</span>`).join('') : '<span class="muted">Nessuna sovrapposizione tra i tuoi ETF.</span>'}</div>
      <div class="card col ex-wide" style="gap:10px"><span style="font-weight:800">Idee per diversificare</span>
        ${tips.length ? tips.map(t => `<span style="line-height:1.5">• ${t}</span>`).join('') : '<span class="muted">La distribuzione è già vicina al mercato globale.</span>'}
        <span class="hint">Idee generali basate su pesi indicativi, non consulenza finanziaria: verifica sempre KID, costi e tasse prima di investire.</span></div>
    </div>`;
}

// ---------- Schermata ----------
const EX_TABS = [['spese', 'Spese'], ['risparmio', 'Risparmio'], ['diario', 'Diario'], ['diversificazione', 'Diversificazione']];
function viewEsplora(args) {
  if (args && args[0] && EX_TABS.some(t => t[0] === args[0])) EX.tab = args[0];
  const body = { spese: exSpese, risparmio: exRisparmio, diario: exDiario, diversificazione: exDiversificazione }[EX.tab]();
  return `
    <div class="row between"><div class="col" style="gap:2px"><span class="title">Esplora</span><span class="small muted">Analisi dettagliate e filtrabili</span></div>${typeof gearBtn === 'function' ? gearBtn() : ''}</div>
    <div class="segmented ex-tabs">${EX_TABS.map(([k, l]) => `<button class="${EX.tab === k ? 'on' : ''}" onclick="EX.tab='${k}';route()">${l}</button>`).join('')}</div>
    ${EX.tab === 'spese' ? exFilters() : EX.tab === 'diario' ? exFilters(true) : ''}
    ${body}`;
}
VIEWS.esplora = viewEsplora;
