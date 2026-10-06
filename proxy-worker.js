// Proxy gratuito per i prezzi (Cloudflare Workers). Serve solo se il servizio pubblico predefinito non è affidabile.
//
// 1. Su dash.cloudflare.com: Workers & Pages, Create, Create Worker, incolla questo codice, Deploy.
// 2. In Spese, Impostazioni, "Portafoglio e prezzi", incolla l'indirizzo del worker seguito da  ?url=
//    Esempio:  https://prezzi.tuonome.workers.dev/?url=
//
// Inoltra solo richieste verso Yahoo Finance e aggiunge gli header CORS che il browser richiede.
export default {
  async fetch(req) {
    const target = new URL(req.url).searchParams.get('url');
    if (!target || !/^https:\/\/query[12]\.finance\.yahoo\.com\//.test(target)) return new Response('Richiesta non valida', { status: 400 });
    const r = await fetch(target, { headers: { 'user-agent': 'Mozilla/5.0' } });
    return new Response(r.body, { status: r.status, headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'cache-control': 'max-age=300' } });
  },
};
