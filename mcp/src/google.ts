// Login: Claude/ChatGPT → questo server → Google. Entra solo l'account in ALLOWED_EMAIL.
const SCOPES = "openid email https://www.googleapis.com/auth/drive.appdata";
const b64 = (s: string) => btoa(unescape(encodeURIComponent(s)));
const unb64 = (s: string) => decodeURIComponent(escape(atob(s)));

export const GoogleHandler = {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === "/authorize") {
      const oauthReq = await env.OAUTH_PROVIDER.parseAuthRequest(req);
      const g = new URL("https://accounts.google.com/o/oauth2/v2/auth");
      g.search = new URLSearchParams({
        client_id: env.GOOGLE_CLIENT_ID, redirect_uri: url.origin + "/callback", response_type: "code",
        scope: SCOPES, access_type: "offline", prompt: "consent", state: b64(JSON.stringify(oauthReq)),
      }).toString();
      return Response.redirect(g.toString(), 302);
    }
    if (url.pathname === "/callback") {
      const code = url.searchParams.get("code"), state = url.searchParams.get("state");
      if (!code || !state) return new Response("Accesso annullato.", { status: 400 });
      const oauthReq = JSON.parse(unb64(state));
      const r = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ code, client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET, redirect_uri: url.origin + "/callback", grant_type: "authorization_code" }),
      });
      const tok: any = await r.json();
      if (!tok.id_token || !tok.refresh_token) return new Response("Google non ha concesso l'accesso: " + (tok.error_description || tok.error || "riprova"), { status: 400 });
      const claims = JSON.parse(atob(tok.id_token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
      const email = String(claims.email || "").toLowerCase();
      if (!claims.email_verified || !env.ALLOWED_EMAIL || email !== env.ALLOWED_EMAIL.toLowerCase())
        return new Response(`L'account ${email} non è autorizzato a usare Slow.`, { status: 403 });
      const { redirectTo } = await env.OAUTH_PROVIDER.completeAuthorization({
        request: oauthReq, userId: email, metadata: { label: email }, scope: oauthReq.scope,
        props: { email, refreshToken: tok.refresh_token },
      });
      return Response.redirect(redirectTo, 302);
    }
    return new Response("Slow MCP: aggiungi https://" + url.host + "/mcp come connettore in Claude o ChatGPT.", { status: 200 });
  },
};
