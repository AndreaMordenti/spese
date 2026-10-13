# Slow MCP

Server MCP che permette a Claude e ChatGPT di leggere e scrivere i dati di Slow.
Gira su Cloudflare Workers (piano gratuito) e lavora sullo stesso file di Google Drive dell'app
(`spese-data.json` nella cartella privata dell'app). Accetta un solo account Google.

## Strumenti

Lettura: `riepilogo_mese`, `cerca_movimenti`, `pagamenti_pianificati`, `portafoglio`, `quota_investibile`,
`diario`, `da_confermare`, `categorie`.
Scrittura: `registra_movimento`, `modifica_movimento`, `elimina_movimento`, `conferma_pagamento`,
`segna_attivita`, `pianifica_pagamento`, `registra_operazione`.

## Installazione (una volta)

```bash
cd mcp
npm install
npx wrangler login                          # login a Cloudflare nel browser
npx wrangler kv namespace create OAUTH_KV   # copia l'id in wrangler.jsonc al posto di DA_CREARE
npx wrangler secret put ALLOWED_EMAIL       # il tuo indirizzo Google
npx wrangler secret put GOOGLE_CLIENT_SECRET   # client secret del client web del progetto "Spese"
npx wrangler deploy
```

In Google Cloud (progetto "Spese" → Google Auth Platform → Client → client web) aggiungi tra gli
**URI di reindirizzamento autorizzati**: `https://slow-mcp.<sottodominio>.workers.dev/callback`.

## Collegarlo

- **Claude** (web, desktop, app): Impostazioni → Connettori → Aggiungi connettore personalizzato →
  `https://slow-mcp.<sottodominio>.workers.dev/mcp`.
- **ChatGPT**: Impostazioni → Connettori → Modalità sviluppatore → Crea → stesso indirizzo `/mcp`.

Al primo uso si apre il login Google: entra solo l'account indicato in `ALLOWED_EMAIL`.
