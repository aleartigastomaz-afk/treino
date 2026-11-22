// Servidor grátis (Cloudflare Workers) do app Treino ABCDE.
// Só faz uma coisa: troca o código/renovação do Strava por um acesso,
// usando a chave secreta do Strava, que fica guardada aqui (variável STRAVA_SECRET)
// e nunca vai para o site. Só aceita pedidos vindos do app.
const ORIGEM = "https://aleartigastomaz-afk.github.io";

export default {
  async fetch(req, env) {
    const cors = { "Access-Control-Allow-Origin": ORIGEM, "Vary": "Origin" };
    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: { ...cors,
        "Access-Control-Allow-Methods": "POST", "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Max-Age": "3600" } });
    }
    if (req.method !== "POST" || req.headers.get("Origin") !== ORIGEM) {
      return new Response("Não permitido", { status: 403 });
    }
    let b = {};
    try { b = await req.json(); } catch (e) {}
    const body = { client_id: env.STRAVA_CLIENT_ID, client_secret: env.STRAVA_SECRET };
    if (b.grant_type === "authorization_code" && b.code) Object.assign(body, { grant_type: b.grant_type, code: String(b.code) });
    else if (b.grant_type === "refresh_token" && b.refresh_token) Object.assign(body, { grant_type: b.grant_type, refresh_token: String(b.refresh_token) });
    else return new Response(JSON.stringify({ error: "pedido inválido" }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
    const r = await fetch("https://www.strava.com/oauth/token", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    const out = r.ok ? { access_token: j.access_token, refresh_token: j.refresh_token, expires_at: j.expires_at,
      athlete: j.athlete ? { firstname: j.athlete.firstname, lastname: j.athlete.lastname } : null } : { error: j.message || "Strava recusou" };
    return new Response(JSON.stringify(out), { status: r.ok ? 200 : 400, headers: { ...cors, "Content-Type": "application/json" } });
  },
};
