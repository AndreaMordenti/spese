// Strumenti MCP di Slow. Lavorano sullo stesso file di Google Drive dell'app (spese-data.json nella cartella
// privata dell'app): ogni elemento ha un id e una data di modifica, quindi l'app unisce le modifiche senza perdere nulla.
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Props } from "./index";

const FILE = "spese-data.json";
type Data = Record<string, any>;

// ---------- Google Drive ----------
async function accessToken(p: Props, env: Env): Promise<string> {
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET, refresh_token: p.refreshToken, grant_type: "refresh_token" }),
  });
  const j: any = await r.json();
  if (!j.access_token) throw new Error("Accesso a Google scaduto: scollega e ricollega il connettore Slow. (" + (j.error || r.status) + ")");
  return j.access_token;
}
async function api(token: string, url: string, init: RequestInit = {}) {
  const r = await fetch(url, { ...init, headers: { ...(init.headers || {}), authorization: "Bearer " + token } });
  if (!r.ok) throw new Error("Google Drive HTTP " + r.status);
  return r;
}
async function load(p: Props, env: Env): Promise<{ data: Data; save: (d: Data) => Promise<void> }> {
  const token = await accessToken(p, env);
  const q = await (await api(token, `https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=name%3D%27${FILE}%27&fields=files(id)`)).json() as any;
  const id = q.files?.[0]?.id;
  if (!id) throw new Error("Nessun dato di Slow su Drive: apri l'app e collega Google Drive almeno una volta.");
  const data = await (await api(token, `https://www.googleapis.com/drive/v3/files/${id}?alt=media`)).json() as Data;
  const save = async (d: Data) => { d.exportedAt = Date.now(); await api(token, `https://www.googleapis.com/upload/drive/v3/files/${id}?uploadType=media`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(d) }); };
  return { data, save };
}

// ---------- Utilità sui dati (stesse regole dell'app) ----------
const live = (a: any[] = []) => a.filter(x => !x.deleted);
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const today = () => new Date(Date.now() + 2 * 3600e3).toISOString().slice(0, 10); // ora italiana (approssimata)
const eur = (n: number) => (Math.round(n * 100) / 100).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
const typeOf = (e: any) => (e.type === "income" ? "income" : "expense");
const cat = (d: Data, id: string) => (d.categories || []).find((c: any) => c.id === id) || { name: "Senza categoria", excluded: false };
const isSpend = (d: Data, e: any) => typeOf(e) === "expense" && !cat(d, e.cat).excluded;
const isInvest = (d: Data, e: any) => typeOf(e) === "expense" && !!cat(d, e.cat).excluded;
const norm = (s: string) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
function findCat(d: Data, name: string, kind: "expense" | "income") {
  const list = live(d.categories).filter((c: any) => (c.kind || "expense") === kind), n = norm(name);
  const hit = list.find((c: any) => norm(c.name) === n) || list.find((c: any) => norm(c.name).includes(n) || n.includes(norm(c.name)));
  if (!hit) throw new Error(`Categoria "${name}" non trovata. Categorie disponibili: ${list.map((c: any) => c.name).join(", ")}`);
  return hit;
}
const median = (a: number[]) => { const s = a.slice().sort((x, y) => x - y), n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : 0; };
const monthOf = (iso: string) => iso.slice(0, 7);
const prevMonth = (k: string, n = 1) => { const [y, m] = k.split("-").map(Number); const d = new Date(Date.UTC(y, m - 1 - n, 1)); return d.toISOString().slice(0, 7); };
function nextOccurrence(p: any, from: string) {
  const every = Math.max(1, Number(p.every) || 1), [sy, sm] = p.start.split("-").map(Number), si = sy * 12 + sm - 1;
  let [y, m] = from.split("-").map(Number);
  for (let i = 0; i < 400; i++) {
    const mi = y * 12 + m - 1, dim = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const dd = `${y}-${String(m).padStart(2, "0")}-${String(Math.min(p.day, dim)).padStart(2, "0")}`;
    if (mi >= si && (mi - si) % every === 0 && dd >= from && dd >= p.start) return p.end && dd > p.end ? null : dd;
    m++; if (m > 12) { m = 1; y++; }
  }
  return null;
}
function position(d: Data, h: any) {
  let qty = 0, cost = 0, realized = 0, div = 0;
  live(d.trades).filter((t: any) => t.holdingId === h.id).sort((a: any, b: any) => a.date.localeCompare(b.date)).forEach((t: any) => {
    const q = Number(t.qty || 0), pr = Number(t.price || 0), fee = Number(t.fee || 0);
    if (t.kind === "buy") { qty += q; cost += q * pr + fee; }
    else if (t.kind === "sell") { const avg = qty ? cost / qty : 0, s = Math.min(q, qty); realized += s * pr - fee - avg * s; cost -= avg * s; qty -= s; }
    else if (t.kind === "div") div += Number(t.amount || 0);
  });
  const value = qty * Number(h.price || 0);
  return { qty, cost, value, gain: value - cost, pct: cost ? (value - cost) / cost * 100 : 0, realized, div };
}
const text = (s: string) => ({ content: [{ type: "text" as const, text: s }] });
const json = (o: any) => text(JSON.stringify(o, null, 2));

export function registerTools(server: McpServer, props: () => Props, env: Env) {
  const run = <A>(fn: (a: A, d: Data, save: (d: Data) => Promise<void>) => Promise<any>) => async (a: A) => {
    try { const { data, save } = await load(props(), env); return await fn(a, data, save); }
    catch (e: any) { return { ...text("Errore: " + (e.message || e)), isError: true }; }
  };

  // ===================== LETTURA =====================
  server.tool("riepilogo_mese", "Spese ed entrate di un mese di Slow: totali, categorie principali e confronto col mese precedente. Gli investimenti sono esclusi dalle spese e indicati a parte.",
    { mese: z.string().regex(/^\d{4}-\d{2}$/).optional().describe("Mese AAAA-MM; vuoto = mese in corso") },
    run(async ({ mese }: any, d) => {
      const k = mese || monthOf(today()), pk = prevMonth(k), ex = live(d.expenses);
      const inMonth = (key: string) => ex.filter((e: any) => monthOf(e.date) === key);
      const sum = (l: any[]) => l.reduce((a, e) => a + Number(e.amount || 0), 0);
      const spend = inMonth(k).filter((e: any) => isSpend(d, e)), byCat: Record<string, number> = {};
      spend.forEach((e: any) => { const n = cat(d, e.cat).name; byCat[n] = (byCat[n] || 0) + Number(e.amount); });
      const budget = live(d.categories).filter((c: any) => (c.kind || "expense") === "expense" && !c.excluded).reduce((a: number, c: any) => a + Number(c.budget || 0), 0);
      return json({ mese: k, spese: eur(sum(spend)), entrate: eur(sum(inMonth(k).filter((e: any) => typeOf(e) === "income"))), investito: eur(sum(inMonth(k).filter((e: any) => isInvest(d, e)))),
        budget_totale: budget ? eur(budget) : "non impostato", spese_mese_precedente: eur(sum(inMonth(pk).filter((e: any) => isSpend(d, e)))), movimenti: spend.length,
        categorie: Object.entries(byCat).sort((a, b) => b[1] - a[1]).map(([n, v]) => ({ categoria: n, importo: eur(v) })) });
    }));

  server.tool("cerca_movimenti", "Cerca i movimenti di Slow per periodo, categoria, testo della nota o tipo. Restituisce anche l'id, utile per modificarli.",
    { dal: z.string().optional().describe("Data iniziale AAAA-MM-GG"), al: z.string().optional().describe("Data finale AAAA-MM-GG"), categoria: z.string().optional(), testo: z.string().optional().describe("Testo nella nota/esercente"),
      tipo: z.enum(["spesa", "entrata", "tutti"]).optional(), limite: z.number().int().min(1).max(200).optional() },
    run(async (a: any, d) => {
      const from = a.dal || "0000", to = a.al || "9999", t = norm(a.testo || ""), c = a.categoria ? norm(a.categoria) : "";
      const list = live(d.expenses).filter((e: any) => e.date >= from && e.date <= to && (a.tipo === "tutti" || !a.tipo ? true : (a.tipo === "entrata") === (typeOf(e) === "income"))
        && (!t || norm(e.note || "").includes(t)) && (!c || norm(cat(d, e.cat).name).includes(c)))
        .sort((x: any, y: any) => (y.date + (y.time || "")).localeCompare(x.date + (x.time || "")));
      const tot = list.reduce((s: number, e: any) => s + (typeOf(e) === "income" ? 1 : -1) * Number(e.amount), 0);
      return json({ trovati: list.length, saldo: eur(tot), movimenti: list.slice(0, a.limite || 50).map((e: any) => ({ id: e.id, data: e.date, tipo: typeOf(e) === "income" ? "entrata" : "spesa", importo: eur(Number(e.amount)), categoria: cat(d, e.cat).name, nota: e.note || "", conto: e.account || "" })) });
    }));

  server.tool("pagamenti_pianificati", "Elenco dei pagamenti pianificati di Slow con la prossima scadenza.", {},
    run(async (_a: any, d) => json(live(d.planned).map((p: any) => ({ id: p.id, nome: p.name, importo: eur(Number(p.amount || 0)), giorno: p.day, ogni_mesi: p.every || 1, attivo: p.active !== false, prossima: p.active === false ? null : nextOccurrence(p, today()), fine: p.end || null, categoria: cat(d, p.cat).name })))));

  server.tool("portafoglio", "Posizioni del portafoglio investimenti di Slow: valore, investito, guadagno e quota azionaria rispetto alla fascia obiettivo.", {},
    run(async (_a: any, d) => {
      const rows = live(d.holdings).map((h: any) => ({ h, p: position(d, h) })).filter((r: any) => r.p.qty > 0);
      const tot = rows.reduce((a: number, r: any) => a + r.p.value, 0), cost = rows.reduce((a: number, r: any) => a + r.p.cost, 0);
      const eq = rows.filter((r: any) => r.h.type !== "obbligazione").reduce((a: number, r: any) => a + r.p.value, 0), t = d.settings?.target || {};
      return json({ valore: eur(tot), investito: eur(cost), guadagno: eur(tot - cost), rendimento: cost ? (Math.round((tot - cost) / cost * 1000) / 10) + "%" : "–",
        azionario: tot ? Math.round(eq / tot * 1000) / 10 + "%" : "–", fascia_obiettivo: `${t.lo || 75}–${t.hi || 80}%`,
        strumenti: rows.map((r: any) => ({ id: r.h.id, nome: r.h.name, isin: r.h.isin || "", quote: r.p.qty, prezzo: eur(Number(r.h.price || 0)), valore: eur(r.p.value), guadagno: eur(r.p.gain), rendimento: Math.round(r.p.pct * 10) / 10 + "%" })) });
    }));

  server.tool("quota_investibile", "Quanto si può investire ogni mese: mediana di entrate e spese degli ultimi mesi completi (investimenti esclusi), meno il cuscinetto di liquidità impostato in Slow.",
    { mesi: z.number().int().min(3).max(24).optional() },
    run(async ({ mesi }: any, d) => {
      const n = mesi || 6, end = prevMonth(monthOf(today())), months = Array.from({ length: n }, (_, i) => prevMonth(end, i)), ex = live(d.expenses);
      const rows = months.map(k => { const l = ex.filter((e: any) => monthOf(e.date) === k), s = (f: any) => l.filter(f).reduce((a: number, e: any) => a + Number(e.amount), 0); return { k, inc: s((e: any) => typeOf(e) === "income"), exp: s((e: any) => isSpend(d, e)), inv: s((e: any) => isInvest(d, e)) }; });
      const buffer = Number(d.settings?.saveBuffer ?? 20), mInc = median(rows.filter(r => r.inc > 0).map(r => r.inc)), mExp = median(rows.map(r => r.exp)), margin = mInc - mExp;
      const inv = rows.reduce((a, r) => a + r.inv, 0) / n, investable = Math.max(0, margin * (1 - buffer / 100));
      return json({ mesi: n, entrate_tipiche: eur(mInc), spese_tipiche: eur(mExp), margine: eur(margin), cuscinetto: buffer + "%", quota_investibile: eur(investable), gia_investito_medio: eur(inv), in_piu_possibile: eur(investable - inv),
        dettaglio: rows.map(r => ({ mese: r.k, entrate: eur(r.inc), spese: eur(r.exp), investito: eur(r.inv) })), nota: "Calcolo indicativo, non consulenza finanziaria." });
    }));

  server.tool("diario", "Attività del diario di Slow: giorni negli ultimi 30, serie in corso e se sono state fatte oggi.", {},
    run(async (_a: any, d) => {
      const t = today(), logs = live(d.habitLogs), add = (iso: string, n: number) => new Date(Date.parse(iso + "T12:00:00Z") + n * 864e5).toISOString().slice(0, 10);
      return json(live(d.habits).filter((h: any) => !h.archived).map((h: any) => {
        const ds = new Set(logs.filter((l: any) => l.habitId === h.id).map((l: any) => l.date)); let s = 0, x = ds.has(t) ? t : add(t, -1); while (ds.has(x)) { s++; x = add(x, -1); }
        return { id: h.id, attivita: h.name, oggi: ds.has(t), giorni_ultimi_30: [...ds].filter((x: any) => x > add(t, -30)).length, serie_in_corso: s, totale: ds.size };
      }));
    }));

  server.tool("da_confermare", "Pagamenti letti da notifiche e SMS che aspettano conferma in Slow.", {},
    run(async (_a: any, d) => json(live(d.inbox).filter((x: any) => x.status === "pending").map((x: any) => ({ id: x.id, data: x.date, ora: x.time, importo: eur(x.amount), esercente: x.merchant, fonte: (x.apps || []).join(" + "), categoria_proposta: x.cat ? cat(d, x.cat).name : null, forse_doppione: !!x.dup })))));

  server.tool("categorie", "Elenco delle categorie di Slow (spese ed entrate) con il budget mensile.", {},
    run(async (_a: any, d) => json(live(d.categories).map((c: any) => ({ nome: c.name, tipo: c.kind === "income" ? "entrata" : "spesa", budget: c.budget ? eur(c.budget) : null, esclusa_dalle_spese: !!c.excluded })))));

  // ===================== SCRITTURA =====================
  server.tool("registra_movimento", "Registra una spesa o un'entrata in Slow. La categoria si indica per nome (vedi lo strumento categorie).",
    { importo: z.number().positive(), categoria: z.string(), tipo: z.enum(["spesa", "entrata"]).optional(), data: z.string().optional().describe("AAAA-MM-GG, vuoto = oggi"), nota: z.string().optional().describe("Esercente o descrizione"), conto: z.string().optional() },
    run(async (a: any, d, save) => {
      const kind = a.tipo === "entrata" ? "income" : "expense", c = findCat(d, a.categoria, kind);
      const e = { id: "m-" + uid(), type: kind, amount: Math.round(a.importo * 100) / 100, cat: c.id, note: a.nota || "", date: a.data || today(), time: "", account: a.conto || (d.accounts || [])[0] || "", source: "assistente", updatedAt: Date.now() };
      (d.expenses = d.expenses || []).push(e); await save(d);
      return text(`Registrato: ${kind === "income" ? "entrata" : "spesa"} di ${eur(e.amount)} in ${c.name} il ${e.date}${e.note ? " (" + e.note + ")" : ""}. Id: ${e.id}`);
    }));

  server.tool("modifica_movimento", "Modifica un movimento esistente di Slow (id da cerca_movimenti). Indica solo i campi da cambiare.",
    { id: z.string(), importo: z.number().positive().optional(), categoria: z.string().optional(), data: z.string().optional(), nota: z.string().optional(), conto: z.string().optional() },
    run(async (a: any, d, save) => {
      const e = live(d.expenses).find((x: any) => x.id === a.id); if (!e) throw new Error("Movimento non trovato: " + a.id);
      if (a.importo) e.amount = Math.round(a.importo * 100) / 100;
      if (a.categoria) e.cat = findCat(d, a.categoria, typeOf(e)).id;
      if (a.data) e.date = a.data; if (a.nota !== undefined) e.note = a.nota; if (a.conto) e.account = a.conto;
      e.updatedAt = Date.now(); await save(d); return text(`Aggiornato: ${eur(e.amount)} · ${cat(d, e.cat).name} · ${e.date}${e.note ? " · " + e.note : ""}`);
    }));

  server.tool("elimina_movimento", "Elimina un movimento di Slow (id da cerca_movimenti).", { id: z.string() },
    run(async (a: any, d, save) => {
      const e = live(d.expenses).find((x: any) => x.id === a.id); if (!e) throw new Error("Movimento non trovato: " + a.id);
      e.deleted = true; e.updatedAt = Date.now(); await save(d); return text(`Eliminato il movimento di ${eur(Number(e.amount))} del ${e.date}.`);
    }));

  server.tool("conferma_pagamento", "Conferma (o scarta) un pagamento in attesa letto da notifiche/SMS (id da da_confermare).",
    { id: z.string(), azione: z.enum(["conferma", "scarta"]), categoria: z.string().optional().describe("Obbligatoria se non c'è una categoria proposta") },
    run(async (a: any, d, save) => {
      const x = live(d.inbox).find((i: any) => i.id === a.id && i.status === "pending"); if (!x) throw new Error("Pagamento in attesa non trovato: " + a.id);
      if (a.azione === "scarta") { Object.assign(x, { status: "skip", updatedAt: Date.now() }); await save(d); return text("Scartato."); }
      const c = a.categoria ? findCat(d, a.categoria, x.type) : (x.cat ? cat(d, x.cat) : null); if (!c || !c.id) throw new Error("Indica la categoria.");
      (d.expenses = d.expenses || []).push({ id: "x-" + uid(), type: x.type, amount: x.amount, cat: c.id, note: x.merchant || "", date: x.date, time: x.time, account: (x.apps || [])[0] || "", source: "notifica", updatedAt: Date.now() });
      Object.assign(x, { status: "done", updatedAt: Date.now() });
      if (x.merchant) { const key = norm(x.merchant).replace(/[^a-z ]/g, " ").replace(/\s+/g, " ").trim().split(" ").slice(0, 3).join(" "); d.rules = d.rules || []; const r = d.rules.find((y: any) => y.key === key); if (r) Object.assign(r, { cat: c.id, updatedAt: Date.now() }); else d.rules.push({ id: "r-" + key.replace(/ /g, "-"), key, cat: c.id, updatedAt: Date.now() }); }
      await save(d); return text(`Confermato: ${eur(x.amount)} ${x.merchant || ""} in ${c.name}.`);
    }));

  server.tool("segna_attivita", "Segna come fatta un'attività del diario di Slow in un giorno.", { attivita: z.string(), data: z.string().optional().describe("AAAA-MM-GG, vuoto = oggi") },
    run(async (a: any, d, save) => {
      const n = norm(a.attivita), h = live(d.habits).find((x: any) => norm(x.name) === n) || live(d.habits).find((x: any) => norm(x.name).includes(n));
      if (!h) throw new Error(`Attività non trovata. Attività: ${live(d.habits).map((x: any) => x.name).join(", ")}`);
      const day = a.data || today();
      if (live(d.habitLogs).some((l: any) => l.habitId === h.id && l.date === day)) return text(`${h.name} era già segnata il ${day}.`);
      (d.habitLogs = d.habitLogs || []).push({ id: "h-" + uid(), habitId: h.id, date: day, time: "", updatedAt: Date.now() }); await save(d);
      return text(`Segnata: ${h.name} il ${day}.`);
    }));

  server.tool("pianifica_pagamento", "Aggiunge o modifica un pagamento pianificato di Slow. Con id modifica quello esistente.",
    { id: z.string().optional(), nome: z.string().optional(), importo: z.number().nonnegative().optional(), giorno: z.number().int().min(1).max(31).optional(), ogni_mesi: z.number().int().min(1).max(12).optional(),
      categoria: z.string().optional(), dal: z.string().optional(), fino_al: z.string().optional(), attivo: z.boolean().optional() },
    run(async (a: any, d, save) => {
      d.planned = d.planned || [];
      let p = a.id ? live(d.planned).find((x: any) => x.id === a.id) : null;
      if (a.id && !p) throw new Error("Pagamento pianificato non trovato: " + a.id);
      if (!p) { if (!a.nome || a.importo === undefined || !a.giorno || !a.categoria) throw new Error("Per un nuovo pagamento servono nome, importo, giorno e categoria.");
        p = { id: "pl-" + uid(), name: a.nome, amount: a.importo, day: a.giorno, every: a.ogni_mesi || 1, start: a.dal || today(), end: a.fino_al || null, type: "expense", cat: findCat(d, a.categoria, "expense").id, account: (d.accounts || [])[0] || "", auto: true, active: true }; d.planned.push(p); }
      else { if (a.nome) p.name = a.nome; if (a.importo !== undefined) p.amount = a.importo; if (a.giorno) p.day = a.giorno; if (a.ogni_mesi) p.every = a.ogni_mesi; if (a.categoria) p.cat = findCat(d, a.categoria, "expense").id; if (a.dal) p.start = a.dal; if (a.fino_al !== undefined) p.end = a.fino_al || null; if (a.attivo !== undefined) p.active = a.attivo; }
      p.updatedAt = Date.now(); await save(d);
      return text(`Pianificato: ${p.name}, ${eur(Number(p.amount))} il ${p.day} ${p.every > 1 ? `ogni ${p.every} mesi` : "di ogni mese"}${p.end ? " fino al " + p.end : ""}${p.active === false ? " (sospeso)" : ""}. Prossima scadenza: ${nextOccurrence(p, today()) || "nessuna"}.`);
    }));

  server.tool("registra_operazione", "Registra un acquisto, una vendita o un dividendo nel portafoglio di Slow. Lo strumento si indica per nome, ISIN o id (vedi portafoglio).",
    { strumento: z.string(), tipo: z.enum(["acquisto", "vendita", "dividendo"]), data: z.string().optional(), quote: z.number().positive().optional(), prezzo: z.number().positive().optional(), importo: z.number().positive().optional().describe("Per i dividendi, o per calcolare le quote da importo e prezzo"), commissioni: z.number().nonnegative().optional() },
    run(async (a: any, d, save) => {
      const n = norm(a.strumento), h = live(d.holdings).find((x: any) => x.id === a.strumento || norm(x.isin) === n || norm(x.name).includes(n));
      if (!h) throw new Error(`Strumento non trovato. Strumenti: ${live(d.holdings).map((x: any) => `${x.name} (${x.isin || x.id})`).join(", ")}`);
      const kind = { acquisto: "buy", vendita: "sell", dividendo: "div" }[a.tipo as string];
      let rec: any;
      if (kind === "div") { if (!a.importo) throw new Error("Indica l'importo del dividendo."); rec = { kind, amount: a.importo, qty: 0, price: 0, fee: 0 }; }
      else { const price = a.prezzo || Number(h.price || 0), qty = a.quote || (a.importo && price ? Math.round(a.importo / price * 1e6) / 1e6 : 0);
        if (!qty || !price) throw new Error("Servono quote e prezzo (oppure importo e prezzo)."); rec = { kind, qty, price, fee: a.commissioni || 0 }; }
      (d.trades = d.trades || []).push({ id: "t-" + uid(), holdingId: h.id, date: a.data || today(), ...rec, updatedAt: Date.now() }); await save(d);
      return text(`Registrato ${a.tipo} su ${h.name}${rec.qty ? `: ${rec.qty} quote a ${eur(rec.price)}` : `: ${eur(rec.amount)}`}.`);
    }));
}
