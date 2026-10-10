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
const SECRET_RE = /\b(codice|otp|password|pin|passcode)\b/i;
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
    const d = new Date(n.time), date = localISO(d), time = d.toTimeString().slice(0, 5), app = PAY_APPS[n.pkg] || 'Notifica';
    // Stesso pagamento da due app (es. Satispay e banca) a pochi minuti: uno solo.
    const twin = S.inbox.find(x => !x.deleted && Math.abs(x.amount - p.amount) < 0.01 && Math.abs(x.at - n.time) < 15 * 60000);
    if (twin) { if (!twin.apps.includes(app)) { twin.apps.push(app); twin.updatedAt = Date.now(); if (!twin.merchant && p.merchant) twin.merchant = p.merchant; } return; }
    // Già registrato (a mano o da un pagamento pianificato) nello stesso giorno o il precedente?
    const dup = live(S.expenses).find(e => Math.abs(Number(e.amount) - p.amount) < 0.01 && typeOf(e) === p.type && Math.abs(isoDay(e.date) - isoDay(date)) <= 1);
    S.inbox.push({ id: 'n-' + n.time + '-' + Math.round(p.amount * 100), at: n.time, date, time, amount: p.amount, merchant: p.merchant, type: p.type, apps: [app], cat: guessCat(p.merchant, p.type), dup: dup ? dup.id : null, status: 'pending', updatedAt: Date.now() });
    added++;
  });
  S.notifLog = S.notifLog.slice(0, 60);
  save();
  return added;
}

// ---------- Schermata "Da confermare" ----------
function inboxRow(x) {
  const c = x.cat ? catById(x.cat) : null, opts = topCats(x.type).map(k => `<option value="${k.id}" ${k.id === x.cat ? 'selected' : ''}>${esc(k.name)}</option>`).join('');
  return `<div class="card col" style="gap:10px">
    <div class="row between" style="align-items:flex-start"><div class="col" style="gap:2px;min-width:0"><span class="truncate" style="font-weight:800">${esc(x.merchant || 'Esercente non riconosciuto')}</span><span class="small muted">${dayFmt(x.date)} ${x.time} · ${esc(x.apps.join(' + '))}</span></div>
      <span class="num" style="font-size:18px;font-weight:700;color:${x.type === 'income' ? 'var(--accent)' : 'inherit'}">${x.type === 'income' ? '+' : '-'}${fmtMoney(x.amount, false)}</span></div>
    ${x.dup ? `<span class="small" style="color:var(--warn)">Forse già registrato: c'è un movimento uguale in quei giorni.</span>` : ''}
    <select onchange="inboxSet('${x.id}','cat',this.value)" aria-label="Categoria">${c ? '' : '<option value="">Scegli la categoria</option>'}${opts}</select>
    <div class="row" style="gap:8px"><button class="btn sm primary grow" onclick="inboxConfirm('${x.id}')">${svg('check', 18, 3)} Conferma</button><button class="chip" onclick="inboxEdit('${x.id}')" aria-label="Modifica">${svg('pen', 18)}</button><button class="chip" onclick="inboxSkip('${x.id}')" aria-label="Scarta">${svg('x', 18, 2.5)}</button></div>
  </div>`;
}
function viewInbox() {
  const list = inboxPending(), ready = list.filter(x => x.cat && !x.dup);
  return `
    <div class="row between">
      <button class="chip" onclick="history.back()" aria-label="Indietro">${svg('back', 16, 2.5)}</button>
      <span style="font-weight:800">Da confermare</span>
      <span class="chip num">${list.length}</span>
    </div>
    ${ready.length > 1 ? `<button class="btn sm" onclick="inboxConfirmAll()">${svg('check', 18, 3)} Conferma tutti quelli con categoria (${ready.length})</button>` : ''}
    ${list.map(inboxRow).join('') || '<div class="empty">Niente da confermare.<br>I pagamenti letti dalle notifiche compaiono qui.</div>'}
    <span class="hint">La categoria scelta per un esercente viene ricordata: la prossima volta la propone da sola.</span>`;
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
  const n = inboxPending().length; if (!n) return '';
  return `<a href="#inbox" class="empty" style="color:var(--accent);border-color:var(--accent);padding:12px">${n === 1 ? '1 pagamento letto dalle notifiche' : n + ' pagamenti letti dalle notifiche'}: tocca per confermare</a>`;
}

// ---------- Impostazioni ----------
async function notifReadSettingsFill() {
  const W = Native.plugin('SlowWidget'), el = $('#nr-status'); if (!W || !el) return;
  const r = await W.notifAccess(); const on = (r.apps || '').split(',');
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
    <button class="btn sm" onclick="go('#inbox')">Vedi i movimenti da confermare (${inboxPending().length})</button>
    <button class="btn sm" onclick="notifLogShare()">Condividi le ultime notifiche lette</button>
    <span class="hint">Se un pagamento non viene letto bene, condividi questo file: serve a migliorare la lettura per quella app.</span>`;
}
