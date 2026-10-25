/* Movimenti letti dalle notifiche di pagamento (app Android): lista "Da confermare" e regole per la categoria. */
'use strict';

const PAY_APPS = {
  'com.satispay.customer': 'Satispay', 'com.google.android.apps.walletnfcrel': 'Google Wallet', 'it.icbpi.mobile': 'Nexi',
  'com.vipera.chebanca': 'Mediobanca Premier', 'it.ing.banking': 'ING', 'com.americanexpress.android.acctsvcs.it': 'American Express',
  'com.revolut.revolut': 'Revolut', 'com.paypal.android.p2pmobile': 'PayPal', 'com.sella.BancaSella': 'Banca Sella',
};
const inboxPending = () => live(S.inbox || []).filter(x => x.status === 'pending').sort((a, b) => b.at - a.at);

// ---------- Lettura del testo ----------
// Regole generiche per le frasi tipiche ("Hai pagato 4,50 € a Bar Centrale", "Pagamento di 12,00 EUR presso ESSELUNGA"…).
const SECRET_RE = /\b(codice|otp|password|pin|passcode|cvv|cvc)\b/i;
const NOT_PAYMENT_RE = /(saldo disponibile|estratto conto|promo|offerta|sconto del|cashback disponibile|invita|accedi|nuovo dispositivo)/i;
const INCOME_RE = /(hai ricevuto|ricevut[oi]|accredit|rimbors|bonifico in (arrivo|entrata)|in entrata|refund|received)/i;
function parseAmount(s) {
  const m = s.match(/(?:€|eur)\s?(\d{1,3}(?:[.\s]\d{3})*,\d{1,2}|\d+(?:[.,]\d{1,2})?)/i) || s.match(/(\d{1,3}(?:[.\s]\d{3})*,\d{1,2}|\d+(?:[.,]\d{1,2})?)\s?(?:€|eur\b|euro)/i);
  if (!m) return 0;
  let t = m[1].replace(/\s/g, '');
  t = t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t;
  return Math.round(parseFloat(t) * 100) / 100 || 0;
}
const GENERIC_TITLE = /(accredit|bonific|rimbors|ricevut|pagament|transazion|spesa|acquisto|addebit|notific|operazion|movimento|carta|satispay|nexi|ing\b|wallet|revolut|paypal|mediobanca|american express|sella|^hai |^nuov)/i;
function parseMerchant(n, full) {
  const m = full.match(/(?:presso|esercente|merchant|pagato a|pagamento a|speso da|da|a|at|su|verso)\s+([A-Z0-9][\w&'’.\- ]{1,38}?)(?=\s*(?:[,.;·:!]|\s+(?:con|il|alle|tramite|per|autorizzat\w*|effettuat\w*|eseguit\w*|approvat\w*|addebitat\w*|completat\w*|in data)\b|$))/);
  if (m && !/^\d/.test(m[1])) return m[1].trim();
  if (n.title && !GENERIC_TITLE.test(n.title) && !/\d+[.,]\d{2}/.test(n.title)) return n.title.trim();
  return '';
}
function parseNotif(n) {
  const full = [n.title, n.text, n.sub].filter(Boolean).join(' · ');
  if (SECRET_RE.test(full)) return { secret: true };
  const amount = parseAmount(full);
  if (!amount || NOT_PAYMENT_RE.test(full)) return null;
  return { amount, merchant: parseMerchant(n, full), type: INCOME_RE.test(full) ? 'income' : 'expense' };
}

// ---------- Categoria: prima le tue scelte, poi parole chiave ----------
const merchantKey = m => String(m || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim().split(' ').slice(0, 3).join(' ');
const KEYWORD_CATS = [
  [/esselunga|coop|conad|lidl|carrefour|pam\b|eurospin|aldi|despar|iper|bennet|tigros|naturasi|supermerc|market/i, /alimentar|spesa|supermerc/i, 'cibo'],
  [/bar\b|caff|cafe|pasticc|gelat|starbucks/i, /bar|caff/i, 'cibo'],
  [/ristor|pizz|trattor|osteria|sushi|burger|mcdonald|kebab|deliveroo|glovo|just ?eat/i, /ristor|fast/i, 'cibo'],
  [/eni\b|enilive|q8|tamoil|esso|ip\b|api\b|shell|carbur|benzin/i, /carbur|benzin/i, 'trasporti'],
  [/autostrad|telepass|parcheg|trenitalia|italo|atm\b|uber|taxi|free ?now/i, /trasport|parcheg|telepass|taxi/i, 'trasporti'],
  [/farmac|parafarm/i, /farmac/i, 'salute'],
  [/amazon|zalando|ikea|decathlon|mediaworld|unieuro|zara|h&m/i, /shopping|abbigl|elettron|acquist/i, 'shopping'],
  [/netflix|spotify|disney|prime video|apple\.com|google play|openai|chatgpt/i, /abbonam|stream|software/i, 'svago'],
];
function guessCat(merchant, type) {
  if (type === 'income') return (cats('income')[0] || {}).id || '';
  const k = merchantKey(merchant), r = k && live(S.rules || []).find(x => x.key === k);
  if (r && catById(r.cat) !== UNKNOWN_CAT) return r.cat;
  const hit = KEYWORD_CATS.find(([re]) => re.test(merchant || ''));
  if (!hit) return '';
  const list = topCats('expense');
  const byName = list.find(c => hit[1].test(c.name)), byGroup = list.find(c => groupOf(c) === hit[2]);
  return (byName || byGroup || {}).id || '';
}
function learnRule(merchant, cat) {
  const key = merchantKey(merchant); if (!key || !cat) return;
  S.rules = S.rules || []; const r = S.rules.find(x => x.key === key);
  if (r) Object.assign(r, { cat, deleted: false, updatedAt: Date.now() }); else S.rules.push({ id: 'r-' + key.replace(/ /g, '-'), key, cat, updatedAt: Date.now() });
}

// ---------- Un pagamento letto → lista "Da confermare" (notifiche e SMS) ----------
function addInbox(p, at, app) {
  S.inbox = S.inbox || [];
  const d = new Date(at), date = p.date || localISO(d), time = p.time || d.toTimeString().slice(0, 5), id = 'n-' + at + '-' + Math.round(p.amount * 100);
  if (S.inbox.some(x => x.id === id)) return false;
  if (p.type === 'expense' && matchesPlanned(p.amount, date)) return false; // già coperto da un pagamento pianificato
  // Stesso pagamento da due fonti (es. app e SMS della banca) a pochi minuti: uno solo.
  const twin = S.inbox.find(x => !x.deleted && Math.abs(x.amount - p.amount) < 0.01 && Math.abs(x.at - at) < 15 * 60000);
  if (twin) { if (!twin.apps.includes(app)) { twin.apps.push(app); twin.updatedAt = Date.now(); if (!twin.merchant && p.merchant) twin.merchant = p.merchant; } return false; }
  // Già registrato (a mano, da un pianificato o da un import) nello stesso giorno o in quello prima/dopo?
  const dup = live(S.expenses).find(e => Math.abs(Number(e.amount) - p.amount) < 0.01 && typeOf(e) === p.type && Math.abs(isoDay(e.date) - isoDay(date)) <= 1);
  S.inbox.push({ id, at, date, time, amount: p.amount, merchant: p.merchant, type: p.type, apps: [app], cat: guessCat(p.merchant, p.type), dup: dup ? dup.id : null, status: 'pending', updatedAt: Date.now() });
  return true;
}

// Un pagamento pianificato (Netflix, palestra, PAC…) registrato in automatico non va riproposto dalle notifiche:
// stesso importo (±2%) e scadenza a 3 giorni o meno.
function matchesPlanned(amount, date) {
  return plannedAll().some(p => p.active !== false && Number(p.amount) > 0 && Math.abs(Number(p.amount) - amount) <= Math.max(0.05, Number(p.amount) * 0.02)
    && occurrences(p, addDays(date, -3), addDays(date, 3)).length > 0);
}
// Ripulisce la lista dai pagamenti già in attesa che coincidono con un pianificato (es. letti prima di questa regola).
function inboxDropPlanned() {
  let n = 0; inboxPending().forEach(x => { if (x.type === 'expense' && matchesPlanned(x.amount, x.date)) { Object.assign(x, { status: 'skip', reason: 'planned', updatedAt: Date.now() }); n++; } });
  if (n) save(); return n;
}

// ---------- SMS delle banche ----------
const SMS_SENDERS = { 'Nexi': 'Nexi', 'MB Premier': 'Mediobanca Premier', 'CheBanca!': 'Mediobanca Premier', 'ING': 'ING', 'SMS SELLA': 'Banca Sella', 'Revolut': 'Revolut', 'BBVA': 'BBVA', 'illimity': 'illimity' };
const smsSenders = () => (S.settings.smsSenders || Object.keys(SMS_SENDERS));
const num = t => { t = String(t).replace(/\s/g, ''); if (/,\d{1,2}$/.test(t)) t = t.replace(/\./g, '').replace(',', '.'); else if (/\.\d{3}$/.test(t)) t = t.replace(/\./g, ''); return Math.round(parseFloat(t) * 100) / 100 || 0; };
const isMe = who => { const me = (S.settings.name || '').toLowerCase().trim(); return !!me && who.toLowerCase().replace(/\s+/g, ' ').includes(me); };
// Formati reali visti negli SMS (Nexi, Mediobanca/CheBanca!), poi le regole generiche delle notifiche.
function parseSms(sender, body, at) {
  if (SECRET_RE.test(body)) return { secret: true };
  if (/addebitat|estratto conto|riepilogo|saldo/i.test(body)) return null; // addebito mensile della carta: le spese sono già contate una per una
  const y = new Date(at).getFullYear(), pad = v => String(v).padStart(2, '0');
  let m = body.match(/autorizzazione\s+EUR\s+([\d.,]+)\s+(\d{2})\/(\d{2})\s+(\d{2})[.:](\d{2})\s+-\s+(.+?)\s+-\s/i);
  if (m) { const dd = `${m[3] === '12' && new Date(at).getMonth() === 0 ? y - 1 : y}-${m[3]}-${m[2]}`; return { amount: num(m[1]), merchant: m[6].replace(/\s+/g, ' ').trim(), type: 'expense', date: dd, time: `${m[4]}:${m[5]}` }; }
  if ((m = body.match(/prelievo di EUR\s+([\d.,]+)/i))) return { amount: num(m[1]), merchant: 'Prelievo contanti', type: 'expense' };
  if ((m = body.match(/bonifico di\s+([\d.,]+)\s*Euro.*?a favore di\s+(.+?)(?:\s+in data|\s+da Conto|\.\s*Data|\.$)/i))) {
    const by = (body.match(/^(.+?)\s+ha richiesto/i) || [])[1] || '', norm = v => v.toLowerCase().replace(/\s+/g, ' ').trim();
    if (isMe(m[2]) || (by && norm(by) === norm(m[2]))) return null; // giroconto verso un tuo conto
    return { amount: num(m[1]), merchant: 'Bonifico a ' + m[2].trim(), type: 'expense' };
  }
  return parseNotif({ title: sender, text: body });
}
async function ingestSms(monthsBack) {
  const W = Native.plugin('SlowWidget'); if (!W) return 0;
  try { if (!(await W.smsAccess()).granted) return 0; } catch (e) { return 0; }
  const since = monthsBack ? Date.now() - monthsBack * 30.44 * 864e5 : (S.settings.smsSince || Date.now() - 7 * 864e5);
  let items = [];
  try { items = (await W.readSms({ since: Math.round(since), senders: smsSenders().join('|') })).items || []; } catch (e) { return 0; }
  S.notifLog = S.notifLog || []; let added = 0, last = S.settings.smsSince || 0;
  items.forEach(sm => {
    last = Math.max(last, sm.date);
    const p = parseSms(sm.address, sm.body, sm.date);
    if (p && p.secret) return;
    if (!monthsBack) S.notifLog.unshift({ at: sm.date, app: 'SMS ' + sm.address, title: sm.address, text: sm.body, read: p ? `-${p.amount} ${p.merchant}` : 'ignorato' });
    if (p && addInbox(p, sm.date, SMS_SENDERS[sm.address] || sm.address)) added++;
  });
  S.settings.smsSince = last; S.notifLog = S.notifLog.slice(0, 60);
  if (items.length) save();
  return added;
}
async function smsEnable() {
  const W = Native.plugin('SlowWidget'); if (!W) return;
  const r = await W.requestSms();
  if (!r.granted) return toast('Permesso SMS negato: puoi concederlo dalle impostazioni di Android', 3500);
  if (!S.settings.smsSince) S.settings.smsSince = Date.now() - 7 * 864e5;
  const n = await ingestSms(); toast(n ? `${n} pagamenti trovati negli SMS` : 'Lettura SMS attiva'); route();
}
async function smsImportHistory(months) {
  if (!confirm(`Leggo gli SMS delle banche degli ultimi ${months} mesi e li metto in "Da confermare". Quelli già presenti in Slow vengono segnalati come doppioni. Procedo?`)) return;
  const n = await ingestSms(months); toast(`${n} pagamenti trovati`, 3000); go('#inbox');
}
function inboxSkipDups() { inboxPending().filter(x => x.dup).forEach(x => Object.assign(x, { status: 'skip', updatedAt: Date.now() })); save(); route(); }

// ---------- Dalla coda delle notifiche alla lista "Da confermare" ----------
async function ingestNotifications() {
  const W = Native.plugin('SlowWidget'); if (!W) return 0;
  let items = [];
  try { items = (await W.takeNotifications()).items || []; } catch (e) { return 0; }
  if (!items.length) return 0;
  S.inbox = S.inbox || []; S.notifLog = S.notifLog || [];
  let added = 0;
  items.forEach(n => {
    const p = parseNotif(n);
    if (p && p.secret) return; // codici e password: non si conservano nemmeno nel registro
    S.notifLog.unshift({ at: n.time, app: PAY_APPS[n.pkg] || n.pkg, title: n.title, text: n.text, read: p ? `${p.type === 'income' ? '+' : '-'}${p.amount} ${p.merchant}` : 'ignorata' });
    if (!p) return;
    if (addInbox(p, n.time, PAY_APPS[n.pkg] || 'Notifica')) added++;
  });
  S.notifLog = S.notifLog.slice(0, 60);
  save();
  return added;
}

// ---------- Schermata "Da confermare" ----------
function inboxRow(x) {
  const c = x.cat ? catById(x.cat) : null;
  return `<div class="card col" style="gap:10px">
    <div class="row between" style="align-items:flex-start"><div class="col" style="gap:2px;min-width:0"><span class="truncate" style="font-weight:800">${esc(x.merchant || 'Esercente non riconosciuto')}</span><span class="small muted">${dayFmt(x.date)} ${x.time} · ${esc(x.apps.join(' + '))}</span></div>
      <span class="num" style="font-size:18px;font-weight:700;color:${x.type === 'income' ? 'var(--accent)' : 'inherit'}">${x.type === 'income' ? '+' : '-'}${fmtMoney(x.amount, false)}</span></div>
    ${x.dup ? `<span class="small" style="color:var(--warn)">Forse già registrato: c'è un movimento uguale in quei giorni.</span>` : ''}
    <button class="cat-current" onclick="inboxPickCat('${x.id}')" aria-label="Scegli la categoria">
      ${c ? `<span class="tile" style="background:${hexA(c.color, .16)};color:${c.color};width:36px;height:36px">${svg(c.icon, 18)}</span><span class="col grow" style="gap:0;text-align:left;min-width:0"><span class="truncate" style="font-weight:700">${esc(c.name)}</span>${x.type === 'expense' ? `<span class="small muted truncate">${groupById(groupOf(c)).name}</span>` : ''}</span>`
        : `<span class="grow" style="text-align:left;color:var(--warn);font-weight:700">Scegli la categoria</span>`}
      <span class="small" style="color:var(--accent);flex-shrink:0">${svg('search', 16)} ${c ? 'Cambia' : 'Cerca'}</span>
    </button>
    <div class="row" style="gap:8px"><button class="btn sm primary grow" onclick="inboxConfirm('${x.id}')">${svg('check', 18, 3)} Conferma</button><button class="chip" onclick="inboxEdit('${x.id}')" aria-label="Modifica">${svg('pen', 18)}</button><button class="chip" onclick="inboxSkip('${x.id}')" aria-label="Scarta">${svg('x', 18, 2.5)}</button></div>
  </div>`;
}
function inboxPickCat(id) { const x = inboxById(id); openCatPicker({ type: x.type, cat: x.cat, apply: c => inboxSet(id, 'cat', c) }); }
function viewInbox() {
  inboxDropPlanned();
  const list = inboxPending(), ready = list.filter(x => x.cat && !x.dup);
  return `
    <div class="row between">
      <button class="chip" onclick="history.back()" aria-label="Indietro">${svg('back', 16, 2.5)}</button>
      <span style="font-weight:800">Da confermare</span>
      <span class="chip num">${list.length}</span>
    </div>
    ${list.filter(x => x.dup).length > 1 ? `<button class="btn sm" onclick="inboxSkipDups()">${svg('x', 18, 2.5)} Scarta quelli già registrati (${list.filter(x => x.dup).length})</button>` : ''}
    ${ready.length > 1 ? `<button class="btn sm" onclick="inboxConfirmAll()">${svg('check', 18, 3)} Conferma tutti quelli con categoria (${ready.length})</button>` : ''}
    ${list.map(inboxRow).join('') || '<div class="empty">Niente da confermare.<br>I pagamenti letti dalle notifiche compaiono qui.</div>'}
    <span class="hint">La categoria scelta per un esercente viene ricordata: la prossima volta la propone da sola. I pagamenti che coincidono con un pagamento pianificato non vengono proposti, perché sono già registrati.</span>`;
}
VIEWS.inbox = viewInbox;
const inboxById = id => (S.inbox || []).find(x => x.id === id);
function inboxSet(id, k, v) { const x = inboxById(id); x[k] = v; x.updatedAt = Date.now(); save(); }
function inboxToExpense(x, cat) {
  S.expenses.push({ id: 'x-' + uid(), type: x.type, amount: x.amount, cat, note: x.merchant || '', date: x.date, time: x.time, account: x.apps[0], source: 'notifica', updatedAt: Date.now() });
  learnRule(x.merchant, cat); Object.assign(x, { status: 'done', updatedAt: Date.now() });
}
function inboxConfirm(id) {
  const x = inboxById(id); if (!x.cat) return toast('Scegli la categoria');
  inboxToExpense(x, x.cat); save(); toast('Registrato'); route();
}
function inboxConfirmAll() { inboxPending().filter(x => x.cat && !x.dup).forEach(x => inboxToExpense(x, x.cat)); save(); toast('Registrati'); route(); }
function inboxSkip(id) { const x = inboxById(id); Object.assign(x, { status: 'skip', updatedAt: Date.now() }); save(); route(); }
// Modifica completa: apre la schermata di inserimento già compilata.
function inboxEdit(id) {
  const x = inboxById(id);
  draft = { id: null, type: x.type, amountStr: String(x.amount).replace('.', ','), cat: x.cat || (topCats(x.type)[0] || {}).id || '', note: x.merchant || '', date: x.date, time: x.time, account: S.accounts.includes(x.apps[0]) ? x.apps[0] : S.accounts[0] || '', source: 'notifica', inboxId: id };
  go('#aggiungi/edit');
}
function inboxHomeBlock() {
  inboxDropPlanned();
  const n = inboxPending().length; if (!n) return '';
  return `<a href="#inbox" class="empty" style="color:var(--accent);border-color:var(--accent);padding:12px">${n === 1 ? '1 pagamento letto dalle notifiche' : n + ' pagamenti letti dalle notifiche'}: tocca per confermare</a>`;
}

// ---------- Impostazioni ----------
async function notifReadSettingsFill() {
  const W = Native.plugin('SlowWidget'), el = $('#nr-status'); if (!W || !el) return;
  const r = await W.notifAccess(); const on = (r.apps || '').split(',');
  const sm = $('#sms-status'); if (sm) { const g = (await W.smsAccess()).granted; sm.innerHTML = g ? '<span style="color:var(--accent);font-weight:700">Lettura SMS attiva</span>' : '<span style="color:var(--warn);font-weight:700">Lettura SMS non ancora consentita</span>'; }
  el.innerHTML = r.enabled ? '<span style="color:var(--accent);font-weight:700">Accesso alle notifiche attivo</span>' : '<span style="color:var(--warn);font-weight:700">Accesso alle notifiche non ancora concesso</span>';
  $('#nr-apps').innerHTML = Object.entries(PAY_APPS).map(([pkg, label]) => `<label class="row" style="gap:12px;cursor:pointer"><input type="checkbox" data-pkg="${pkg}" ${on.includes(pkg) ? 'checked' : ''} onchange="notifAppsSave()" style="width:24px;min-height:24px;padding:0"><span style="font-size:14px">${label}</span></label>`).join('');
}
function notifAppsSave() { const W = Native.plugin('SlowWidget'); if (W) W.setNotifApps({ apps: [...document.querySelectorAll('#nr-apps input:checked')].map(i => i.dataset.pkg).join(',') }); }
function notifLogShare() {
  const t = (S.notifLog || []).map(l => `${new Date(l.at).toLocaleString('it-IT')} · ${l.app}\n${l.title}\n${l.text}\n→ letto come: ${l.read}`).join('\n\n');
  if (!t) return toast('Nessuna notifica letta finora');
  nativeSave('slow-notifiche-lette.txt', t);
}
function notifReadSettings() {
  if (!Native.on) return '<span class="hint">Disponibile nell\'app Android di Slow.</span>';
  setTimeout(notifReadSettingsFill, 0);
  return `<div id="nr-status" class="small">Controllo…</div>
    <button class="btn sm" onclick="Native.plugin('SlowWidget').openNotifAccess()">Apri "Accesso alle notifiche" di Android</button>
    <span class="hint">Nella schermata di Android attiva <b>Slow</b>. Slow legge solo le app spuntate qui sotto, e solo per trovare i pagamenti: il testo resta sul telefono. I codici di sicurezza (OTP, PIN) vengono scartati senza salvarli.</span>
    <div id="nr-apps" class="col" style="gap:10px"></div>
    <span style="font-weight:800;margin-top:6px">SMS delle banche</span>
    <div id="sms-status" class="small">Controllo…</div>
    <button class="btn sm" onclick="smsEnable()">Consenti la lettura degli SMS</button>
    <div class="col" style="gap:10px">${Object.keys(SMS_SENDERS).map(s => `<label class="row" style="gap:12px;cursor:pointer"><input type="checkbox" ${smsSenders().includes(s) ? 'checked' : ''} onchange="S.settings.smsSenders=[...document.querySelectorAll('[data-sms]:checked')].map(i=>i.dataset.sms);save(false)" data-sms="${esc(s)}" style="width:24px;min-height:24px;padding:0"><span style="font-size:14px">${esc(s)}</span></label>`).join('')}</div>
    <div class="row" style="gap:8px">${[3, 6, 12].map(m => `<button class="chip" onclick="smsImportHistory(${m})">Importa ${m} mesi</button>`).join('')}</div>
    <span class="hint">Slow legge solo gli SMS dei mittenti spuntati. I messaggi con codici, PIN o CVV vengono scartati senza salvarli; gli addebiti mensili della carta e i bonifici verso te stesso sono ignorati. Per riconoscere i giroconti metti il tuo nome in "Profilo e aspetto".</span>
    <button class="btn sm" onclick="go('#inbox')">Vedi i movimenti da confermare (${inboxPending().length})</button>
    <button class="btn sm" onclick="notifLogShare()">Condividi le ultime notifiche lette</button>
    <span class="hint">Se un pagamento non viene letto bene, condividi questo file: serve a migliorare la lettura per quella app.</span>`;
}
