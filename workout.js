/* Allenamento: profilo, scheda (scritta da Claude via MCP), seduta del giorno con progressione automatica, controlli periodici. */
'use strict';

// Foto degli esercizi: free-exercise-db (pubblico dominio), due scatti per esercizio, inizio e fine movimento.
const EX_IMG = (id, n) => `https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/${id}/${n}.jpg`;
const WK_FEEL = [['easy', 'Facile'], ['ok', 'Giusto'], ['hard', 'Duro'], ['fail', 'Non chiuso']];
const WK_GOALS = [['massa', 'Massa'], ['forza', 'Forza'], ['dimagrire', 'Dimagrire'], ['salute', 'Salute']];
const WK_LEVELS = [['nuovo', 'Meno di 6 mesi'], ['base', '6-12 mesi'], ['medio', '1-3 anni'], ['esperto', 'Più di 3 anni']];
const WK_EQUIP = [['palestra', 'Palestra completa'], ['manubri', 'Manubri a casa'], ['corpo', 'Corpo libero']];

const wkProfile = () => live(S.wkProfile)[0] || null;
const wkPlan = () => live(S.wkPlans).filter(p => p.active !== false).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))[0] || null;
const wkLogs = () => live(S.wkLogs).sort((a, b) => b.date.localeCompare(a.date) || (b.updatedAt || 0) - (a.updatedAt || 0));
const wkWeights = () => live(S.wkChecks).filter(c => c.kg).sort((a, b) => b.date.localeCompare(a.date));
const wkRest = s => (s >= 60 ? `${Math.floor(s / 60)}'${s % 60 ? String(s % 60).padStart(2, '0') + '"' : ''}` : s + '"');
const kg = v => (v == null || v === '' ? '' : String(Math.round(v * 10) / 10).replace('.', ','));
const roundLoad = (v, step = 1.25) => Math.max(0, Math.round(v / step) * step);

// Settimana del blocco (1…weeks) e se è quella di scarico (l'ultima).
function wkWeek(plan, date = todayISO()) {
  const w = Math.floor((isoDay(date) - isoDay(plan.startDate || todayISO())) / 7) + 1;
  return { n: Math.max(1, w), over: w > (plan.weeks || 6), deload: w === (plan.weeks || 6) };
}

// Ultimo risultato di un esercizio (per id, poi per nome: sopravvive al cambio di scheda).
function wkLastFor(ex, beforeDate) {
  for (const l of wkLogs()) {
    if (beforeDate && l.date >= beforeDate) continue;
    const r = (l.ex || {})[ex.id] || Object.values(l.ex || {}).find(x => x.name === ex.name);
    if (r && r.reps && r.reps.some(n => n > 0)) return r;
  }
  return null;
}
// Doppia progressione con la sensazione (ripetizioni in riserva): sale, resta o scende.
function wkNext(ex, date) {
  const last = wkLastFor(ex, date), top = ex.reps[1], inc = ex.inc || 2.5;
  if (!last || last.load == null) return { load: ex.load ?? null, why: ex.load != null ? 'Carico di partenza' : 'Scegli un carico che ti lasci 2 ripetizioni in riserva' };
  const allTop = last.reps.length >= ex.sets && last.reps.slice(0, ex.sets).every(n => n >= top);
  if (last.feel === 'fail') return { load: roundLoad(last.load * 0.92), why: 'Ultima volta non chiuso: si riparte più leggeri' };
  if (last.feel === 'easy') return { load: last.load + inc, why: 'Ultima volta facile: si sale' };
  if (allTop && last.feel !== 'hard') return { load: last.load + inc, why: `Chiuse tutte a ${top}: si sale` };
  return { load: last.load, why: last.feel === 'hard' ? 'Ultima volta duro: stesso carico' : `Stesso carico finché non chiudi ${ex.sets} × ${top}` };
}
// Il giorno della scheda da fare in una data: quello già registrato, altrimenti il successivo nella rotazione.
function wkDayFor(plan, date) {
  const log = wkLogs().find(l => l.date === date && l.planId === plan.id);
  if (log) return plan.days.find(d => d.id === log.dayId) || plan.days[0];
  const prev = wkLogs().find(l => l.planId === plan.id && l.date < date && l.done);
  if (!prev) return plan.days[0];
  const i = plan.days.findIndex(d => d.id === prev.dayId);
  return plan.days[(i + 1) % plan.days.length];
}
function wkLog(plan, day, date, create) {
  let l = live(S.wkLogs).find(x => x.date === date && x.planId === plan.id);
  if (!l && create) { l = { id: 'w-' + uid(), date, planId: plan.id, dayId: day.id, ex: {}, done: false, updatedAt: Date.now() }; S.wkLogs.push(l); }
  return l;
}
const wkGymHabit = () => activeHabits().find(h => h.workout) || activeHabits().find(h => /palestra|gym|workout|allenam|pesi/i.test(h.name)) || null;

// ---------- Vista ----------
let wkPickDay = null, wkTimer = null;
function viewAllenamento(args = []) {
  const prof = wkProfile();
  if (!prof || args[0] === 'profilo') return wkProfileForm(prof);
  if (args[0] === 'controllo') return wkCheckForm();
  const plan = wkPlan();
  if (!plan) return `${wkHead()}
    <div class="card col" style="gap:8px"><span style="font-weight:800">Scheda in preparazione</span><span class="small muted">Profilo salvato il ${fmtDate(new Date(prof.updatedAt).toISOString().slice(0, 10))}.</span></div>
    ${wkWeightBlock()}`;
  const date = args[0] && /^\d{4}-\d{2}-\d{2}$/.test(args[0]) ? args[0] : todayISO();
  return wkHead(plan) + wkSession(plan, date);
}
function wkHead(plan) {
  return `<div class="row between"><span class="title">Allenamento</span><div class="row" style="gap:8px">
    ${plan ? `<button class="chip" onclick="wkPlanSheet()" aria-label="La scheda">${svg('book', 18)}</button>` : ''}
    <button class="chip" onclick="go('#allenamento/profilo')" aria-label="Il tuo profilo">${svg('sliders', 18)}</button>${gearBtn()}</div></div>`;
}
function wkSession(plan, date) {
  const wk = wkWeek(plan, date), log = wkLog(plan, null, date, false);
  const day = (wkPickDay && date === wkPickDay.date && plan.days.find(d => d.id === wkPickDay.id)) || wkDayFor(plan, date);
  const isToday = date === todayISO(), done = log && log.done;
  const checkDue = wk.over && !live(S.wkChecks).some(c => c.type === 'check' && c.date >= addDays(plan.startDate, (plan.weeks || 6) * 7 - 7));
  return `
    ${checkDue ? `<button class="card col" style="gap:6px;text-align:left;background:var(--surface-2)" onclick="go('#allenamento/controllo')"><span class="small" style="color:var(--accent);font-weight:700">CONTROLLO DI FINE BLOCCO</span><span style="font-weight:700">${plan.weeks || 6} settimane finite: aggiorniamo la scheda?</span><span class="small" style="color:var(--accent)">Rispondi ›</span></button>` : ''}
    ${wk.over && !checkDue ? `<div class="small muted">Controllo fatto: la nuova scheda arriva a breve. Intanto continua con questa.</div>` : ''}
    <div class="row between">
      <button class="chip" onclick="go('#allenamento/${addDays(date, -1)}')" aria-label="Giorno precedente">${svg('back', 14, 2.5)}</button>
      <span class="small muted">${isToday ? 'Oggi' : fmtDate(date, { weekday: 'short', day: 'numeric', month: 'short' })} · settimana ${Math.min(wk.n, plan.weeks || 6)} di ${plan.weeks || 6}${wk.deload ? ' · scarico' : ''}</span>
      <button class="chip" onclick="go('#allenamento/${addDays(date, 1)}')" aria-label="Giorno successivo" ${date >= todayISO() ? 'disabled style="opacity:.4"' : ''}>${chevR}</button>
    </div>
    <div class="segmented" style="align-self:flex-start">${plan.days.map(d => `<button class="${d.id === day.id ? 'on' : ''}" onclick="wkPickDay={date:'${date}',id:'${d.id}'};wkSetDay('${date}','${d.id}');route()">${esc(d.name)}</button>`).join('')}</div>
    <div class="col" style="gap:2px"><span class="title" style="font-size:26px">${esc(day.title || day.name)}</span><span class="small muted">${day.exercises.length} esercizi${day.minutes ? ' · ~' + day.minutes + "'" : ''}${wk.deload ? ' · carichi −40%, una serie in meno' : ''}</span></div>
    ${day.exercises.map((ex, i) => wkExCard(plan, day, ex, i, date, log, wk.deload)).join('')}
    ${done ? `<div class="row between"><span style="color:var(--accent);font-weight:700">${svg('check', 16, 3)} Seduta conclusa</span><button class="chip" onclick="wkFinish('${date}',false)">Riapri</button></div>`
      : `<button class="btn" onclick="wkFinish('${date}',true)">Concludi seduta</button>`}
    ${wkWeightBlock()}`;
}
function wkExCard(plan, day, ex, i, date, log, deload) {
  const r = (log && log.ex[ex.id]) || {}, nx = wkNext(ex, date), sets = Math.max(1, ex.sets - (deload ? 1 : 0));
  const target = nx.load == null ? null : deload ? roundLoad(nx.load * 0.6) : nx.load, load = r.load ?? target;
  const reps = r.reps || [];
  const has = !!(ex.img || (ex.cues && ex.cues.length));
  return `<div class="card col" style="gap:12px">
    <div class="row between" style="align-items:flex-start"><button class="col" style="gap:2px;text-align:left;flex:1" ${has ? `onclick="const h=this.closest('.card').querySelector('.wk-how');h.hidden=!h.hidden" aria-label="Come si fa: ${esc(ex.name)}"` : ''}><span style="font-weight:800">${esc(ex.name)}</span><span class="small muted">${sets} × ${ex.reps[0]}-${ex.reps[1]} · recupero ${wkRest(ex.rest || 90)}</span></button>
      <button class="chip" onclick="wkRestStart(${ex.rest || 90})" aria-label="Avvia recupero">${svg('clock', 16)} ${wkRest(ex.rest || 90)}</button></div>
    ${has ? `<div class="col wk-how" style="gap:10px" hidden>
      ${ex.img ? `<div class="row" style="gap:6px">${[0, 1].map(n => `<img src="${EX_IMG(ex.img, n)}" alt="${esc(ex.name)}, ${n ? 'fine' : 'inizio'} movimento" loading="lazy" style="width:50%;border-radius:10px;background:#fff;aspect-ratio:4/3;object-fit:cover">`).join('')}</div>` : ''}
      ${ex.cues && ex.cues.length ? `<ul class="small" style="padding-left:18px;display:flex;flex-direction:column;gap:4px">${ex.cues.map(c => `<li>${esc(c)}</li>`).join('')}</ul>` : ''}
    </div>` : ''}
    <div style="display:grid;grid-template-columns:1.4fr repeat(${sets},1fr);gap:6px;align-items:end">
      <label class="col small muted" style="gap:4px">kg<input type="number" inputmode="decimal" step="0.5" value="${load ?? ''}" placeholder="–" style="min-height:40px;padding:6px 8px;text-align:center" onchange="wkSet('${date}','${ex.id}','load',this.value)"></label>
      ${Array.from({ length: sets }, (_, s) => `<label class="col small muted" style="gap:4px;text-align:center">${s + 1}ª<input type="number" inputmode="numeric" aria-label="Serie ${s + 1}, ripetizioni" value="${reps[s] ?? ''}" placeholder="${ex.reps[1]}" style="min-height:40px;padding:6px 2px;text-align:center;${reps[s] >= ex.reps[1] ? 'border-color:var(--accent);color:var(--accent)' : ''}" onchange="wkSet('${date}','${ex.id}','rep${s}',this.value)"></label>`).join('')}
    </div>
    <span class="small muted">${esc(nx.why)}${target != null && deload ? ` · scarico: ${kg(target)} kg` : ''}</span>
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px">${WK_FEEL.map(([k, l]) => `<button class="chip ${r.feel === k ? 'on' : ''}" style="height:34px;justify-content:center;padding:0 4px;font-size:12.5px" onclick="wkSet('${date}','${ex.id}','feel','${k}');route()">${l}</button>`).join('')}</div>
  </div>`;
}
function wkSetDay(date, dayId) { const plan = wkPlan(), l = wkLog(plan, null, date, false); if (l && l.dayId !== dayId && !Object.keys(l.ex).length) { l.dayId = dayId; l.updatedAt = Date.now(); save(); } }
function wkSet(date, exId, field, v) {
  const plan = wkPlan(), day = (wkPickDay && wkPickDay.date === date && plan.days.find(d => d.id === wkPickDay.id)) || wkDayFor(plan, date), ex = day.exercises.find(e => e.id === exId);
  const l = wkLog(plan, day, date, true); l.dayId = day.id;
  const r = l.ex[exId] = l.ex[exId] || { name: ex.name, reps: [] };
  if (field === 'load') r.load = v === '' ? null : Number(String(v).replace(',', '.'));
  else if (field === 'feel') r.feel = r.feel === v ? null : v;
  else r.reps[Number(field.slice(3))] = v === '' ? null : Number(v);
  if (r.load == null && field !== 'load') { const nx = wkNext(ex, date); if (nx.load != null) r.load = wkWeek(plan, date).deload ? roundLoad(nx.load * 0.6) : nx.load; }
  l.updatedAt = Date.now(); save();
}
function wkFinish(date, on) {
  const plan = wkPlan(), day = wkDayFor(plan, date), l = wkLog(plan, day, date, true);
  l.done = on; l.updatedAt = Date.now();
  if (on) {
    let h = wkGymHabit();
    if (!h) { h = { id: uid(), name: 'Palestra', icon: 'dumbbell', color: '#7CC4A0', workout: true, updatedAt: Date.now() }; S.habits.push(h); }
    if (!isDone(h.id, date)) S.habitLogs.push({ id: uid(), habitId: h.id, date, time: date === todayISO() ? nowHM() : '', updatedAt: Date.now() });
    toast('Seduta salvata e segnata nel Diario');
  }
  save(); route();
}
// Recupero: conto alla rovescia in basso, vibra alla fine.
function wkRestStart(sec) {
  clearInterval(wkTimer); let left = sec, el = $('#wk-timer');
  if (!el) { el = document.createElement('button'); el.id = 'wk-timer'; el.className = 'chip on'; el.style.cssText = 'position:fixed;left:50%;transform:translateX(-50%);bottom:calc(96px + env(safe-area-inset-bottom));z-index:60;height:44px;padding:0 18px;font-size:16px'; el.onclick = () => { clearInterval(wkTimer); el.remove(); }; document.body.appendChild(el); }
  const tick = () => { el.textContent = `Recupero ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')} · tocca per chiudere`; if (left-- <= 0) { clearInterval(wkTimer); if (navigator.vibrate) navigator.vibrate([200, 100, 200]); el.textContent = 'Recupero finito'; setTimeout(() => el.remove(), 2500); } };
  tick(); wkTimer = setInterval(tick, 1000);
}
function wkPlanSheet() {
  const p = wkPlan();
  sheet(`<div class="col" style="gap:14px"><span class="title" style="font-size:24px">${esc(p.name || 'La tua scheda')}</span>
    <span class="small muted">Dal ${fmtDate(p.startDate)} · ${p.weeks || 6} settimane, l'ultima di scarico</span>
    ${p.notes ? `<span class="small">${esc(p.notes)}</span>` : ''}
    ${p.days.map(d => `<div class="col" style="gap:6px"><span style="font-weight:800">${esc(d.name)} · ${esc(d.title || '')}</span>${d.exercises.map(e => `<div class="row between small"><span>${esc(e.name)}</span><span class="muted">${e.sets} × ${e.reps[0]}-${e.reps[1]}</span></div>`).join('')}</div>`).join('')}
  </div>`);
}

// ---------- Peso corporeo (ogni 2 settimane) ----------
function wkWeightBlock() {
  const ws = wkWeights(), last = ws[0], due = !last || isoDay(todayISO()) - isoDay(last.date) >= 14, prof = wkProfile();
  const first = ws[ws.length - 1], weeks = last && first && last !== first ? (isoDay(last.date) - isoDay(first.date)) / 7 : 0, rate = weeks ? (last.kg - first.kg) / first.kg * 100 / weeks : null;
  return `<div class="col" style="gap:10px"><div class="row between"><span class="section-title">Peso corporeo</span>${last ? `<span class="num" style="font-weight:700">${kg(last.kg)} kg</span>` : ''}</div>
    ${due ? `<div class="row" style="gap:8px"><input id="wk-kg" type="number" inputmode="decimal" step="0.1" placeholder="${last ? kg(last.kg) : (prof && prof.weight) || 'kg'}" style="flex:1"><button class="btn sm" onclick="wkAddWeight()">Salva peso</button></div>` : `<span class="small muted">Prossima pesata dal ${fmtDate(addDays(last.date, 14))}</span>`}
    ${rate != null ? `<span class="small muted">${rate >= 0 ? '+' : ''}${rate.toFixed(2).replace('.', ',')}% a settimana${prof && prof.goal === 'massa' ? (rate < 0.2 ? ' · per la massa serve qualcosa di più (+0,25-0,5%)' : rate > 0.6 ? ' · un po\' veloce per la massa (+0,25-0,5%)' : ' · ritmo giusto per la massa') : ''}</span>` : ''}
  </div>`;
}
function wkAddWeight() { const v = Number(String($('#wk-kg').value).replace(',', '.')); if (!(v > 20 && v < 300)) return toast('Peso non valido'); S.wkChecks.push({ id: 'k-' + uid(), type: 'weight', date: todayISO(), kg: v, updatedAt: Date.now() }); save(); route(); }

// ---------- Profilo (primo accesso) e controllo di fine blocco ----------
const WK_REPS = [['6-8', '6-8'], ['8-10', '8-10'], ['10-12', '10-12'], ['12-15', '12-15']];
const WK_REST = [['60', "1'"], ['60-90', "1'-1'30\""], ['90-120', "1'30\"-2'"], ['120-180', "2'-3'"]];
const wkChips = (name, opts, cur) => `<div class="row" style="flex-wrap:wrap;gap:6px" data-pick="${name}">${opts.map(([v, l]) => `<button type="button" class="chip ${String(cur) === String(v) ? 'on' : ''}" data-v="${v}" onclick="this.parentNode.querySelectorAll('.chip').forEach(c=>c.classList.remove('on'));this.classList.add('on')">${l}</button>`).join('')}</div>`;
const wkPicked = name => { const b = document.querySelector(`[data-pick="${name}"] .chip.on`); return b ? b.dataset.v : ''; };
function wkProfileForm(p) {
  p = p || { goal: 'massa', days: 3, minutes: 60, equip: 'palestra', level: 'medio', sex: 'm' };
  return `<div class="row between"><span class="title">${wkProfile() ? 'Il tuo profilo' : 'La tua scheda'}</span>${wkProfile() ? `<button class="chip" onclick="go('#allenamento')">${svg('x', 16)}</button>` : ''}</div>
    <div class="row" style="gap:10px"><div class="field grow"><label>Peso (kg)</label><input id="wp-weight" type="number" inputmode="decimal" value="${p.weight ?? ''}"></div><div class="field grow"><label>Altezza (cm)</label><input id="wp-height" type="number" inputmode="numeric" value="${p.height ?? ''}"></div></div>
    <div class="row" style="gap:10px"><div class="field grow"><label>Età</label><input id="wp-age" type="number" inputmode="numeric" value="${p.age ?? ''}"></div><div class="field grow"><label>Sesso</label>${wkChips('sex', [['m', 'Uomo'], ['f', 'Donna']], p.sex)}</div></div>
    <div class="field"><label>Da quanto ti alleni</label>${wkChips('level', WK_LEVELS, p.level)}</div>
    <div class="field"><label>Obiettivo</label>${wkChips('goal', WK_GOALS, p.goal)}</div>
    <div class="field"><label>Volte a settimana</label>${wkChips('days', [2, 3, 4, 5, 6].map(n => [n, n]), p.days)}</div>
    <div class="field"><label>Minuti a seduta</label>${wkChips('minutes', [45, 60, 75, 90].map(n => [n, n + "'"]), p.minutes)}</div>
    <div class="field"><label>Ripetizioni</label>${wkChips('reps', WK_REPS, p.reps || '8-10')}</div>
    <div class="field"><label>Recupero</label>${wkChips('rest', WK_REST, p.rest || '60-90')}</div>
    <div class="field"><label>Attrezzatura</label>${wkChips('equip', WK_EQUIP, p.equip)}</div>
    <div class="field"><label>Fastidi o limiti</label><input id="wp-pain" value="${esc(p.pain || '')}" placeholder="es. spalla destra, ginocchio"></div>
    <div class="field"><label>Esercizi che ami o che eviti</label><input id="wp-prefs" value="${esc(p.prefs || '')}"></div>
    <div class="field"><label>Massimali o carichi che conosci</label><input id="wp-loads" value="${esc(p.loads || '')}" placeholder="es. panca 80×8, squat 100×6"></div>
    <button class="btn" onclick="wkSaveProfile()">Salva il profilo</button>`;
}
function wkSaveProfile() {
  const n = id => { const v = $(id).value; return v === '' ? null : Number(String(v).replace(',', '.')); };
  const old = wkProfile(), p = { id: 'profile', weight: n('#wp-weight'), height: n('#wp-height'), age: n('#wp-age'), sex: wkPicked('sex'), level: wkPicked('level'), goal: wkPicked('goal'), days: Number(wkPicked('days')), minutes: Number(wkPicked('minutes')), reps: wkPicked('reps'), rest: wkPicked('rest'), equip: wkPicked('equip'), pain: $('#wp-pain').value.trim(), prefs: $('#wp-prefs').value.trim(), loads: $('#wp-loads').value.trim(), updatedAt: Date.now() };
  if (!p.weight || !p.days) return toast('Inserisci almeno peso e volte a settimana');
  if (old) Object.assign(old, p); else S.wkProfile.push(p);
  if (!wkWeights().length) S.wkChecks.push({ id: 'k-' + uid(), type: 'weight', date: todayISO(), kg: p.weight, updatedAt: Date.now() });
  save(); go('#allenamento');
}
function wkCheckForm() {
  const scale = name => wkChips(name, [1, 2, 3, 4, 5].map(n => [n, n]), 3);
  return `<div class="row between"><span class="title">Controllo</span><button class="chip" onclick="go('#allenamento')">${svg('x', 16)}</button></div>
    <div class="field"><label>Peso di oggi (kg)</label><input id="wc-kg" type="number" inputmode="decimal" step="0.1" placeholder="${wkWeights()[0] ? kg(wkWeights()[0].kg) : ''}"></div>
    <div class="field"><label>Sonno, da 1 a 5</label>${scale('sleep')}</div>
    <div class="field"><label>Energia in palestra, da 1 a 5</label>${scale('energy')}</div>
    <div class="field"><label>Fastidi nuovi</label><input id="wc-pain" placeholder="nessuno"></div>
    <div class="field"><label>Obiettivo</label>${wkChips('goal', WK_GOALS, (wkProfile() || {}).goal)}</div>
    <div class="field"><label>Volte a settimana d'ora in poi</label>${wkChips('days', [2, 3, 4, 5, 6].map(n => [n, n]), (wkProfile() || {}).days)}</div>
    <div class="field"><label>Cosa cambieresti</label><input id="wc-notes" placeholder="es. più gambe, meno panca"></div>
    <button class="btn" onclick="wkSaveCheck()">Invia</button>`;
}
function wkSaveCheck() {
  const v = $('#wc-kg').value, kgv = v ? Number(v.replace(',', '.')) : null, prof = wkProfile();
  S.wkChecks.push({ id: 'k-' + uid(), type: 'check', date: todayISO(), kg: kgv, sleep: Number(wkPicked('sleep')), energy: Number(wkPicked('energy')), pain: $('#wc-pain').value.trim(), goal: wkPicked('goal'), days: Number(wkPicked('days')), notes: $('#wc-notes').value.trim(), updatedAt: Date.now() });
  if (prof) { prof.goal = wkPicked('goal') || prof.goal; prof.days = Number(wkPicked('days')) || prof.days; if (kgv) prof.weight = kgv; prof.updatedAt = Date.now(); }
  save(); go('#allenamento');
}
VIEWS.allenamento = viewAllenamento;
