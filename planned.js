/* Pagamenti pianificati: ricorrenze mensili che si registrano da sole alla scadenza. */
'use strict';

const plannedAll = () => live(S.planned);
const pad2 = n => String(n).padStart(2, '0');

// Date di scadenza (ISO) tra from e to inclusi. Se il giorno non esiste nel mese (es. 31) usa l'ultimo giorno.
function occurrences(p, from, to) {
  const out = [], lo = from > p.start ? from : p.start, hi = p.end && p.end < to ? p.end : to;
  if (lo > hi) return out;
  const every = Math.max(1, Number(p.every) || 1), [sy, sm] = p.start.split('-').map(Number), si = sy * 12 + sm - 1;
  let [y, m] = lo.split('-').map(Number);
  for (let guard = 0; guard < 1200; guard++) {
    if (`${y}-${pad2(m)}-01` > hi) break;
    const mi = y * 12 + m - 1;
    if (mi >= si && (mi - si) % every === 0) { const d = `${y}-${pad2(m)}-${pad2(Math.min(p.day, new Date(y, m, 0).getDate()))}`; if (d >= lo && d <= hi) out.push(d); }
    m++; if (m > 12) { m = 1; y++; }
  }
  return out;
}
const nextOccurrence = (p, after = todayISO()) => occurrences(p, addDays(after, 1), addDays(after, 800))[0] || null;
const plannedIsMissing = p => !(Number(p.amount) > 0);
const plannedExcluded = p => (p.type || 'expense') === 'expense' && !!catById(p.cat).excluded;
const plannedMonthly = p => Number(p.amount || 0) / Math.max(1, Number(p.every) || 1);

// Registra le scadenze già passate (ultimi 400 giorni) dei pagamenti automatici. L'id è fisso: nessun doppione, nemmeno tra dispositivi.
function postPlanned() {
  const today = todayISO(), floor = addDays(today, -400), have = new Set(S.expenses.map(e => e.id)); let n = 0;
  plannedAll().forEach(p => {
    if (p.active === false || p.auto === false || plannedIsMissing(p)) return;
    occurrences(p, floor, today).forEach(d => {
      const id = `p-${p.id}-${d}`; if (have.has(id)) return; have.add(id);
      S.expenses.push({ id, type: p.type || 'expense', amount: Number(p.amount), cat: p.cat, note: p.name, date: d, time: '', account: p.account || '', source: 'planned', pid: p.id, updatedAt: Date.now() }); n++;
    });
  });
  if (n) { save(); toast(n === 1 ? 'Registrato 1 pagamento pianificato' : `Registrati ${n} pagamenti pianificati`, 3000); }
  return n;
}
// Scadenze di pagamenti non automatici ancora da confermare (ultimi 45 giorni).
function pendingPlanned() {
  const today = todayISO(), have = new Set(S.expenses.map(e => e.id)), out = [];
  plannedAll().forEach(p => { if (p.active === false || p.auto !== false) return; occurrences(p, addDays(today, -45), today).forEach(d => { if (!have.has(`p-${p.id}-${d}`)) out.push({ p, d }); }); });
  return out.sort((a, b) => a.d.localeCompare(b.d));
}
function upcomingPlanned(days) {
  const today = todayISO(), out = [];
  plannedAll().forEach(p => { if (p.active !== false) occurrences(p, addDays(today, 1), addDays(today, days)).forEach(d => out.push({ p, d })); });
  return out.sort((a, b) => a.d.localeCompare(b.d) || a.p.name.localeCompare(b.p.name));
}
function confirmPending(pid, d) {
  const p = S.planned.find(x => x.id === pid); if (!p) return;
  S.expenses.push({ id: `p-${pid}-${d}`, type: p.type || 'expense', amount: Number(p.amount), cat: p.cat, note: p.name, date: d, time: '', account: p.account || '', source: 'planned', pid, updatedAt: Date.now() });
  save(); route();
}
function skipPending(pid, d) { // tombstone: la scadenza non viene più proposta
  S.expenses.push({ id: `p-${pid}-${d}`, type: 'expense', amount: 0, cat: '', date: d, deleted: true, source: 'planned', pid, updatedAt: Date.now() }); save(); route();
}

// ---------- Dati iniziali ----------
const PLAN_SEEDS = [
  { id: 'seed-tv', name: 'Finanziamento TV', amount: 45.19, day: 5, end: '2027-01-05', re: /finanz|rat[ae]\b|prestit/i, fb: 'Finanziamenti' },
  { id: 'seed-savechildren', name: 'Save the Children', amount: 20, day: 8, re: /benefic|regal|dona/i, fb: 'Regali e beneficenza' },
  { id: 'seed-vodafone', name: 'Vodafone (2 utenze)', amount: 19.9, day: 9, re: /telefon|utenz|internet/i, fb: 'Utenze' },
  { id: 'seed-spotify', name: 'Spotify', amount: 11.9, day: 15, re: /stream|abbonam|software/i, fb: 'Abbonamenti' },
  { id: 'seed-openai', name: 'OpenAI', amount: 0, day: 16, re: /software|abbonam|stream/i, fb: 'Abbonamenti' },
  { id: 'seed-palestra', name: 'Palestra', amount: 26.57, day: 17, re: /palestra|\bsport|fitness|benessere/i, fb: 'Sport' },
  { id: 'seed-netflix', name: 'Netflix', amount: 13.99, day: 17, re: /stream|abbonam/i, fb: 'Abbonamenti' },
  { id: 'seed-pac', name: 'Piano investimenti (Trade Republic)', amount: 500, day: 3, re: /investim/i, fb: 'Investimenti', excluded: true, account: 'Trade Republic' },
];
function seedPlanned() {
  if (S.settings.plannedSeeded) return;
  S.settings.plannedSeeded = true;
  if (!S.planned.length) {
    const today = todayISO();
    PLAN_SEEDS.forEach(sd => {
      let cat = cats('expense').find(c => sd.re.test(c.name));
      if (!cat) { cat = ensureCategory(sd.fb, 'expense'); if (sd.excluded) cat.excluded = true; }
      const account = sd.account || (S.accounts.includes('Carta') ? 'Carta' : S.accounts[0] || '');
      if (account && !S.accounts.includes(account)) S.accounts.push(account);
      S.planned.push({ id: sd.id, name: sd.name, amount: sd.amount, day: sd.day, every: 1, start: today, end: sd.end || null, type: 'expense', cat: cat.id, account, auto: true, active: true, updatedAt: Date.now() });
    });
  }
  save();
}

// ---------- Schermata ----------
const dayFmt = d => fmtDate(d, { day: 'numeric', month: 'short', ...(d.slice(0, 4) !== todayISO().slice(0, 4) ? { year: 'numeric' } : {}) });
function plannedRepeat(p) {
  const ev = Number(p.every) > 1 ? `ogni ${p.every} mesi` : 'ogni mese';
  return `${ev} il ${p.day}${p.end ? ' · fino al ' + dayFmt(p.end) : ''}`;
}
function plannedRow(p) {
  const c = catById(p.cat), next = p.active === false ? null : nextOccurrence(p), inc = (p.type || 'expense') === 'income';
  return `<button class="item" onclick="editPlanned('${p.id}')" ${p.active === false ? 'style="opacity:.55"' : ''}>
    <div class="tile" style="background:${hexA(c.color, .16)};color:${c.color}">${svg(c.icon)}</div>
    <div class="col grow"><span class="truncate" style="font-weight:700">${esc(p.name)}</span><span class="small muted truncate">${plannedRepeat(p)}</span><span class="small truncate" style="color:${plannedIsMissing(p) ? 'var(--warn)' : 'var(--muted)'}">${p.active === false ? 'Sospeso' : plannedIsMissing(p) ? 'Importo da inserire' : next ? 'Prossimo: ' + dayFmt(next) : 'Concluso'}${p.auto === false ? ' · da confermare' : ''}</span></div>
    <span class="num" style="font-size:16px;font-weight:600;color:${inc ? 'var(--accent)' : 'inherit'}">${inc ? '+' : ''}${fmtMoney(p.amount, false)}</span></button>`;
}
function viewPlanned() {
  const act = plannedAll().filter(p => p.active !== false), sus = plannedAll().filter(p => p.active === false);
  const exp = act.filter(p => (p.type || 'expense') === 'expense'), fixed = exp.filter(p => !plannedExcluded(p)), inv = exp.filter(plannedExcluded);
  const sum = l => l.reduce((a, p) => a + plannedMonthly(p), 0), pend = pendingPlanned();
  const sorted = act.slice().sort((a, b) => (nextOccurrence(a) || '9').localeCompare(nextOccurrence(b) || '9') || a.name.localeCompare(b.name));
  return `
    <div class="row between">
      <button class="chip" onclick="history.back()" aria-label="Indietro">${svg('back', 16, 2.5)}</button>
      <span style="font-weight:800">Pagamenti pianificati</span>
      <button class="chip" style="color:var(--accent)" onclick="editPlanned()" aria-label="Nuovo pagamento pianificato">${svg('plus', 18, 2.5)}</button>
    </div>
    <div class="card col" style="gap:12px">
      <div class="row between"><div class="stat"><span class="v num">${fmtMoney(sum(fixed))}</span><span class="small muted">spese fisse al mese</span></div>${inv.length ? `<div class="stat" style="text-align:right"><span class="v num" style="color:var(--accent)">${fmtMoney(sum(inv))}</span><span class="small muted">investimenti al mese</span></div>` : ''}</div>
      <span class="hint">Importi medi mensili dei pagamenti attivi. Si registrano da soli nel giorno di scadenza e puoi correggerli dopo come qualsiasi movimento.</span>
    </div>
    ${pend.length ? `<div class="col" style="gap:10px"><span class="section-title">Da confermare</span><div class="list">${pend.map(({ p, d }) => `<div class="item"><div class="col grow"><span class="truncate" style="font-weight:700">${esc(p.name)}</span><span class="small muted">${dayFmt(d)} · ${fmtMoney(p.amount)}</span></div><button class="chip on" onclick="confirmPending('${p.id}','${d}')">Registra</button><button class="chip" onclick="skipPending('${p.id}','${d}')">Salta</button></div>`).join('')}</div></div>` : ''}
    <div class="col" style="gap:10px"><span class="section-title">Attivi</span>
      <div class="list">${sorted.map(plannedRow).join('') || '<div class="empty">Nessun pagamento pianificato.<br>Tocca + per aggiungerne uno.</div>'}</div></div>
    ${sus.length ? `<div class="col" style="gap:10px"><span class="section-title">Sospesi</span><div class="list">${sus.map(plannedRow).join('')}</div></div>` : ''}`;
}
VIEWS.pianificati = viewPlanned;

function editPlanned(id) {
  const p = id ? S.planned.find(x => x.id === id) : { name: '', amount: '', day: new Date().getDate(), every: 1, start: todayISO(), end: '', type: 'expense', cat: topCats('expense')[0]?.id || '', account: S.accounts[0] || '', auto: true };
  const kind = p.type || 'expense';
  sheet(`<span style="font-weight:800;font-size:18px">${id ? 'Modifica pagamento' : 'Nuovo pagamento pianificato'}</span>
    <div class="segmented" style="align-self:flex-start"><button class="${kind === 'expense' ? 'on' : ''}" data-k="expense" onclick="planKind('expense',this)">Spesa</button><button class="${kind === 'income' ? 'on' : ''}" data-k="income" onclick="planKind('income',this)">Entrata</button></div>
    <div class="field"><label>Nome</label><input id="p-name" value="${esc(p.name)}" placeholder="Es. Netflix"></div>
    <div class="row" style="gap:12px"><div class="field grow"><label>Importo (€)</label><input id="p-amount" type="number" step="0.01" min="0" inputmode="decimal" value="${p.amount === '' ? '' : Number(p.amount)}"></div><div class="field grow"><label>Giorno del mese</label><input id="p-day" type="number" min="1" max="31" inputmode="numeric" value="${p.day}"></div></div>
    <div class="field"><label>Categoria</label><select id="p-cat">${cats(kind).map(c => `<option value="${c.id}" ${c.id === p.cat ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></div>
    <div class="field"><label>Conto</label><select id="p-account">${[...new Set([...S.accounts, p.account].filter(Boolean))].map(a => `<option ${a === p.account ? 'selected' : ''}>${esc(a)}</option>`).join('')}</select></div>
    <div class="field"><label>Si ripete</label><select id="p-every">${[[1, 'Ogni mese'], [2, 'Ogni 2 mesi'], [3, 'Ogni 3 mesi'], [6, 'Ogni 6 mesi'], [12, 'Ogni anno']].map(([v, l]) => `<option value="${v}" ${v === Number(p.every) ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
    <div class="row" style="gap:12px"><div class="field grow"><label>Dal</label><input id="p-start" type="date" value="${p.start}"></div><div class="field grow"><label>Fino al (facoltativo)</label><input id="p-end" type="date" value="${p.end || ''}"></div></div>
    <label class="row" style="gap:12px;cursor:pointer"><input type="checkbox" id="p-auto" ${p.auto !== false ? 'checked' : ''} style="width:24px;min-height:24px;padding:0"><span style="font-size:14px;line-height:1.4">Registra da solo alla scadenza (altrimenti ti chiede conferma)</span></label>
    <button class="btn primary" onclick="savePlanned('${id || ''}')">Salva</button>
    ${id ? `<button class="btn" onclick="togglePlanned('${id}')">${p.active === false ? 'Riattiva' : 'Sospendi'}</button><button class="btn danger" onclick="deletePlanned('${id}')">Elimina</button>` : ''}`);
}
function planKind(k, btn) { btn.parentElement.querySelectorAll('button').forEach(b => b.classList.remove('on')); btn.classList.add('on'); const sel = $('#p-cat'); if (sel) sel.innerHTML = cats(k).map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join(''); }
function savePlanned(id) {
  const name = $('#p-name').value.trim(), amount = parseFloat($('#p-amount').value), day = Math.round(Number($('#p-day').value)), start = $('#p-start').value, end = $('#p-end').value || null;
  if (!name) return toast('Dai un nome al pagamento');
  if (!(amount >= 0)) return toast('Inserisci l\'importo');
  if (!(day >= 1 && day <= 31)) return toast('Il giorno deve essere tra 1 e 31');
  if (!start) return toast('Scegli la data di inizio');
  if (end && end < start) return toast('La data di fine è prima dell\'inizio');
  const data = { name, amount, day, start, end, every: Number($('#p-every').value) || 1, type: $('#sheet .segmented .on')?.dataset.k || 'expense', cat: $('#p-cat').value, account: $('#p-account').value, auto: $('#p-auto').checked, updatedAt: Date.now() };
  if (id) Object.assign(S.planned.find(x => x.id === id), data); else S.planned.push({ id: 'pl-' + uid(), active: true, ...data });
  save(); postPlanned(); closeSheet(); route();
}
function togglePlanned(id) { const p = S.planned.find(x => x.id === id); p.active = p.active === false; p.updatedAt = Date.now(); save(); postPlanned(); closeSheet(); route(); }
function deletePlanned(id) {
  if (!confirm('Eliminare questo pagamento pianificato? I movimenti già registrati restano.')) return;
  const p = S.planned.find(x => x.id === id); p.deleted = true; p.updatedAt = Date.now(); save(); closeSheet(); route();
}

// ---------- Home e Analisi ----------
function plannedHomeBlock() {
  if (!plannedAll().length) return '';
  const up = upcomingPlanned(30), pend = pendingPlanned().length, tot = up.filter(u => (u.p.type || 'expense') === 'expense').reduce((a, u) => a + Number(u.p.amount || 0), 0);
  return `<div class="col" style="gap:12px">
    <div class="row between"><span class="section-title">Prossimi pagamenti</span><a href="#pianificati" class="small" style="color:var(--accent)">Gestisci</a></div>
    ${pend ? `<a href="#pianificati" class="empty" style="color:var(--warn);border-color:var(--warn);padding:12px">${pend} ${pend === 1 ? 'pagamento da confermare' : 'pagamenti da confermare'}</a>` : ''}
    ${up.length ? `<div class="list">${up.slice(0, 4).map(({ p, d }) => { const c = catById(p.cat); return `<a href="#pianificati" class="item"><div class="tile" style="background:${hexA(c.color, .16)};color:${c.color}">${svg(c.icon)}</div><div class="col grow"><span class="truncate" style="font-weight:700">${esc(p.name)}</span><span class="small muted">${dayFmt(d)}</span></div><span class="num" style="font-size:16px;font-weight:600">${plannedIsMissing(p) ? '–' : fmtMoney(p.amount, false)}</span></a>`; }).join('')}</div>
    <span class="small muted">${up.length > 4 ? `e altri ${up.length - 4} · ` : ''}${fmtMoney(tot)} nei prossimi 30 giorni</span>` : '<div class="empty">Nessun pagamento nei prossimi 30 giorni.</div>'}
  </div>`;
}

ANA_WIDGETS.planned = { title: 'Pagamenti pianificati', desc: 'Quanto è già stato pagato e quanto resta da pagare nel periodo, con le prossime scadenze.', icon: 'repeat', render(c) {
  const today = todayISO(), all = [];
  plannedAll().forEach(p => { if (p.active !== false) occurrences(p, c.p.start, c.p.end).forEach(d => all.push({ p, d })); });
  const exp = all.filter(x => (x.p.type || 'expense') === 'expense'), fixed = exp.filter(x => !plannedExcluded(x.p)), inv = exp.filter(x => plannedExcluded(x.p));
  const S_ = l => l.reduce((a, x) => a + Number(x.p.amount || 0), 0), left = fixed.filter(x => x.d > today), next = all.filter(x => x.d > today).sort((a, b) => a.d.localeCompare(b.d)).slice(0, 4);
  if (!all.length) return `<div class="card col" style="gap:10px"><span style="font-weight:800">Pagamenti pianificati</span><span class="muted small">Nessuna scadenza nel periodo.</span><a href="#pianificati" class="small" style="color:var(--accent)">Gestisci i pagamenti pianificati</a></div>`;
  return `<div class="card col" style="gap:14px">
    <div class="row between"><span style="font-weight:800">Pagamenti pianificati</span><a href="#pianificati" class="small" style="color:var(--accent)">Gestisci</a></div>
    <div class="row between"><div class="stat"><span class="v num">${fmtMoney(S_(left))}</span><span class="small muted">ancora da pagare</span></div><div class="stat" style="text-align:right"><span class="v num">${fmtMoney(S_(fixed))}</span><span class="small muted">spese fisse totali</span></div></div>
    <div class="bar"><div style="width:${S_(fixed) ? Math.round((S_(fixed) - S_(left)) / S_(fixed) * 100) : 0}%;background:var(--accent)"></div></div>
    ${inv.length ? `<div class="row between small"><span class="muted">Investimenti pianificati</span><span class="num" style="color:var(--accent)">${fmtMoney(S_(inv))}</span></div>` : ''}
    ${next.length ? `<div class="col" style="gap:8px;border-top:1px solid var(--line);padding-top:12px">${next.map(x => `<div class="row between small"><span class="truncate"><span class="muted">${dayFmt(x.d)}</span> · ${esc(x.p.name)}</span><span class="num">${plannedIsMissing(x.p) ? '–' : fmtMoney(x.p.amount, false)}</span></div>`).join('')}</div>` : ''}
  </div>`; } };

// Inseriti di default per chi non ha mai personalizzato Analisi.
ANA_DEFAULT.splice(1, 0, 'planned'); ANA_DEFAULT.splice(4, 0, 'trendline');
