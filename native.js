/* Funzioni dell'app Android: widget della home e notifiche locali. Nel browser non fanno nulla. */
'use strict';

const Native = {
  on: !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()),
  plugin(name) { return this.on && window.Capacitor.Plugins ? window.Capacitor.Plugins[name] : null; },
};
const NOTIF_DEFAULTS = { planned: true, pac: true, balance: true, budget: true, diary: false, diaryTime: '21:00', weekly: true };
const notifCfg = () => Object.assign({}, NOTIF_DEFAULTS, S.settings.notif || {});

// ---------- Widget ----------
function widgetData() {
  const key = monthKey(todayISO()), spent = sumBy(monthExpenses(key)), budget = totalBudget(), pct = budget ? Math.round(spent / budget * 100) : 0;
  const up = upcomingPlanned(45).slice(0, 3).map(({ p, d }) => ({ label: `${dayFmt(d)} · ${p.name}`, amount: plannedIsMissing(p) ? '–' : fmtMoney(p.amount) }));
  const T = portfolioTotals();
  return {
    month: { label: monthLabel(key), spent: fmtMoney(spent), pct, sub: budget ? `di ${fmtMoney(budget)} · ${pct}%` : 'nessun budget impostato' },
    upcoming: up,
    portfolio: T.value ? { value: fmtMoney(T.value), gain: `${sgnMoney(T.gain)} (${sgnPct(T.pct)})`, day: T.day ? `Oggi ${sgnMoney(T.day)}` : '' } : null,
    updated: Date.now(),
  };
}
function pushWidgets() { const w = Native.plugin('SlowWidget'); if (w) w.update({ data: JSON.stringify(widgetData()) }).catch(() => {}); }

// ---------- Notifiche ----------
// Si riprogrammano tutte a ogni salvataggio: così riflettono sempre i dati attuali.
const at = (iso, hm) => { const [h, m] = hm.split(':').map(Number), d = new Date(iso + 'T12:00:00'); d.setHours(h, m, 0, 0); return d; };
function buildNotifications() {
  const c = notifCfg(), today = todayISO(), now = Date.now(), list = [];
  const push = (id, title, body, when, route) => { if (when.getTime() > now + 60000) list.push({ id, title, body, schedule: { at: when, allowWhileIdle: true }, channelId: 'slow', extra: { route } }); };
  if (c.planned) {
    const byDay = {}; upcomingPlanned(35).forEach(({ p, d }) => { if (!p.holdingId) (byDay[d] = byDay[d] || []).push(p); });
    Object.entries(byDay).forEach(([d, ps], i) => push(1000 + i, ps.length === 1 ? `Domani: ${ps[0].name}` : `Domani: ${ps.length} pagamenti`,
      ps.length === 1 ? (plannedIsMissing(ps[0]) ? 'Importo da inserire' : fmtMoney(ps[0].amount)) + (ps[0].account ? ' · ' + ps[0].account : '') : ps.map(p => `${p.name} ${plannedIsMissing(p) ? '' : fmtMoney(p.amount)}`.trim()).join(' · '), at(addDays(d, -1), '19:00'), '#pianificati'));
  }
  const pacDays = [...new Set(upcomingPlanned(35).filter(x => x.p.holdingId).map(x => x.d))];
  if (c.pac) pacDays.forEach((d, i) => push(2000 + i, 'PAC registrati', 'Gli acquisti del piano di accumulo hanno un prezzo stimato: controlla quello reale.', at(d, '18:00'), '#portafoglio'));
  if (c.balance && pacDays.length) {
    const T = balanceData(), { lo, hi } = balTarget();
    if (T.tot && (T.eqPct < lo || T.eqPct > hi)) push(3000, `Bilanciamento: azionario al ${(T.eqPct * 100).toFixed(1).replace('.', ',')}%`, 'Domani c\'è il PAC: guarda come spostare il versamento per rientrare nella fascia.', at(addDays(pacDays[0], -1), '19:30'), '#portafoglio');
  }
  if (c.diary && activeHabits().length) {
    const doneToday = live(S.habitLogs).some(l => l.date === today);
    for (let i = doneToday ? 1 : 0; i < 14; i++) push(4000 + i, 'Diario', 'Segna le attività di oggi.', at(addDays(today, i), c.diaryTime || '21:00'), '#diario');
  }
  if (c.weekly) { let d = today; for (let n = 0; n < 5; d = addDays(d, 1)) { if (new Date(d + 'T12:00:00').getDay() === 0) { push(5000 + n, 'La tua settimana', 'Guarda in Analisi com\'è andata: spese, tendenze e attività.', at(d, '19:00'), '#analisi'); n++; } } }
  return list;
}
// Budget: avviso immediato la prima volta che una categoria supera l'80% o il 100% nel mese.
function budgetAlerts() {
  if (!notifCfg().budget) return [];
  const key = monthKey(todayISO()), sent = S.settings.notified || {}, out = [];
  cats('expense').filter(c => c.budget > 0 && !c.excluded).forEach((c, i) => {
    const p = sumBy(monthExpenses(key).filter(e => e.cat === c.id)) / c.budget * 100, lvl = p >= 100 ? 100 : p >= 80 ? 80 : 0, k = `${key}|${c.id}|${lvl}`;
    if (!lvl || sent[k]) return; sent[k] = true;
    out.push({ id: 6000 + i, title: lvl === 100 ? `Budget superato: ${c.name}` : `Budget quasi finito: ${c.name}`, body: `${Math.round(p)}% dei ${fmtMoney(c.budget)} del mese.`, schedule: { at: new Date(Date.now() + 3000) }, channelId: 'slow', extra: { route: '#analisi' } });
  });
  S.settings.notified = sent; return out;
}
async function scheduleNotifications() {
  const N = Native.plugin('LocalNotifications'); if (!N) return;
  try {
    if ((await N.checkPermissions()).display !== 'granted') return;
    const pending = (await N.getPending()).notifications || [];
    if (pending.length) await N.cancel({ notifications: pending.map(n => ({ id: n.id })) });
    const list = [...buildNotifications(), ...budgetAlerts()];
    if (list.length) await N.schedule({ notifications: list });
  } catch (e) { console.warn('notifiche', e); }
}

// ---------- File: export dall'app ----------
// Nell'app il download del browser non funziona: scrive il file e apre il menu Condividi di Android (Drive, File, email…).
async function nativeSave(name, content) {
  const F = Native.plugin('Filesystem'), Sh = Native.plugin('Share');
  if (!F || !Sh) return toast('Export non disponibile');
  try {
    const { uri } = await F.writeFile({ path: name, data: content, directory: 'CACHE', encoding: 'utf8' });
    await Sh.share({ title: name, url: uri, dialogTitle: 'Salva o invia ' + name });
  } catch (e) { if (!/cancel/i.test(e.message || '')) toast('Export non riuscito: ' + (e.message || e), 3500); }
}

// ---------- Login Google nativo (per Drive) ----------
// Nell'app Google non permette il login web: si usa quello di Android, con il solo permesso sulla cartella privata di Drive.
let _gInit = null;
function nativeGoogleInit() {
  const L = Native.plugin('SocialLogin'); if (!L) return Promise.reject(new Error('login Google non disponibile'));
  return (_gInit = _gInit || L.initialize({ google: { webClientId: GOOGLE_CLIENT_ID, mode: 'online' } }));
}
async function nativeGoogleToken(interactive) {
  const L = Native.plugin('SocialLogin'); await nativeGoogleInit();
  // Dopo il primo accesso l'account è già autorizzato: nessuna schermata, solo un nuovo token.
  const opts = { scopes: [DRIVE_SCOPE], ...(interactive ? {} : { filterByAuthorizedAccounts: true, autoSelectEnabled: true }) };
  const r = await L.login({ provider: 'google', options: opts });
  const t = r && r.result && r.result.accessToken && r.result.accessToken.token;
  if (!t) throw new Error('Google non ha concesso l\'accesso a Drive');
  return t;
}
function nativeGoogleLogout() { const L = Native.plugin('SocialLogin'); if (L) L.logout({ provider: 'google' }).catch(() => {}); }

// ---------- Collegamento con l'app ----------
let nativeTimer = null;
function onDataSaved() { if (!Native.on) return; clearTimeout(nativeTimer); nativeTimer = setTimeout(() => { pushWidgets(); scheduleNotifications(); }, 800); }
async function nativeBoot() {
  if (!Native.on) return;
  const N = Native.plugin('LocalNotifications'), W = Native.plugin('SlowWidget');
  if (N) {
    N.createChannel({ id: 'slow', name: 'Slow', description: 'Scadenze, PAC, budget e promemoria', importance: 4 }).catch(() => {});
    N.addListener('localNotificationActionPerformed', a => { const r = a.notification && a.notification.extra && a.notification.extra.route; if (r) go(r); });
  }
  if (W) { try { const { route } = await W.consumeRoute(); if (route) go(route); } catch (e) { /* nessuna schermata richiesta */ } }
  onDataSaved();
}
async function enableNotifications() {
  const N = Native.plugin('LocalNotifications'); if (!N) return;
  const r = await N.requestPermissions();
  toast(r.display === 'granted' ? 'Notifiche attive' : 'Permesso negato: attivale dalle impostazioni di Android', 3500);
  onDataSaved(); route();
}
function setNotif(k, v) { S.settings.notif = Object.assign(notifCfg(), { [k]: v }); save(false); }
async function testNotification() {
  const N = Native.plugin('LocalNotifications'); if (!N) return;
  await N.schedule({ notifications: [{ id: 9999, title: 'Slow', body: 'Le notifiche funzionano.', schedule: { at: new Date(Date.now() + 2000) }, channelId: 'slow' }] });
}
function notifSettings() {
  if (!Native.on) return '<span class="hint">Notifiche e widget sono disponibili nell\'app Android di Slow.</span>';
  const c = notifCfg(), row = (k, label) => `<label class="row" style="gap:12px;cursor:pointer"><input type="checkbox" ${c[k] ? 'checked' : ''} onchange="setNotif('${k}',this.checked)" style="width:24px;min-height:24px;padding:0"><span style="font-size:14px;line-height:1.4">${label}</span></label>`;
  return `<button class="btn sm" onclick="enableNotifications()">Consenti le notifiche</button>
    ${row('planned', 'Il giorno prima di un pagamento pianificato, alle 19')}
    ${row('pac', 'Il giorno del PAC, per controllare il prezzo d\'acquisto')}
    ${row('balance', 'Il giorno prima del PAC, se il portafoglio è fuori fascia')}
    ${row('budget', 'Quando una categoria supera l\'80% o il 100% del budget')}
    ${row('weekly', 'Ogni domenica sera, il riepilogo della settimana')}
    ${row('diary', 'Promemoria del Diario se non hai segnato attività')}
    <div class="field"><label>Ora del promemoria del Diario</label><input type="time" value="${c.diaryTime}" onchange="setNotif('diaryTime',this.value)"></div>
    <button class="btn sm" onclick="testNotification()">Invia una notifica di prova</button>
    <span class="hint">Widget: tieni premuto su uno spazio vuoto della home del Pixel, scegli Widget e cerca Slow. Si aggiornano ogni volta che l'app salva dati.</span>`;
}
