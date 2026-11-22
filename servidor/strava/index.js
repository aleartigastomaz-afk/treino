// Servidor do app Treino ABCDE: busca as corridas no Strava.
// A chave secreta do Strava fica no Secret Manager do Google (variável STRAVA_SECRET),
// nunca no site. Só usuários logados no app conseguem chamar.
const functions = require("@google-cloud/functions-framework");
const admin = require("firebase-admin");
admin.initializeApp();
const db = admin.firestore();

const CLIENT_ID = process.env.STRAVA_CLIENT_ID;
const SECRET = process.env.STRAVA_SECRET;
const ORIGINS = ["https://aleartigastomaz-afk.github.io"];
const DIAS = 90; // quantos dias de corridas buscar

async function stravaToken(body) {
  const r = await fetch("https://www.strava.com/oauth/token", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ client_id: CLIENT_ID, client_secret: SECRET, ...body }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error("Strava recusou: " + (j.message || r.status));
  return j;
}

functions.http("strava", async (req, res) => {
  const origin = req.get("origin");
  if (ORIGINS.includes(origin)) { res.set("Access-Control-Allow-Origin", origin); res.set("Vary", "Origin"); }
  if (req.method === "OPTIONS") {
    res.set("Access-Control-Allow-Methods", "POST");
    res.set("Access-Control-Allow-Headers", "Authorization, Content-Type");
    res.set("Access-Control-Max-Age", "3600");
    return res.status(204).send("");
  }
  if (req.method !== "POST") return res.status(405).send("");
  try {
    const idToken = (req.get("authorization") || "").replace(/^Bearer /, "");
    const user = await admin.auth().verifyIdToken(idToken);
    const { action, code } = req.body || {};
    const priv = db.collection("strava_tokens").doc(user.uid); // ninguém lê pelo app
    const pub = db.collection("corridas").doc(user.uid);       // só corridas, lidas pela dupla

    if (action === "connect") {
      const j = await stravaToken({ code, grant_type: "authorization_code" });
      await priv.set({ access_token: j.access_token, refresh_token: j.refresh_token, expires_at: j.expires_at });
      await pub.set({ connected: true, name: [j.athlete?.firstname, j.athlete?.lastname].filter(Boolean).join(" ") }, { merge: true });
    }
    if (action === "disconnect") {
      await priv.delete();
      await pub.set({ connected: false }, { merge: true });
      return res.json({ ok: true });
    }

    const snap = await priv.get();
    if (!snap.exists) return res.json({ connected: false });
    let t = snap.data();
    if (t.expires_at < Date.now() / 1000 + 120) {
      const j = await stravaToken({ refresh_token: t.refresh_token, grant_type: "refresh_token" });
      t = { access_token: j.access_token, refresh_token: j.refresh_token, expires_at: j.expires_at };
      await priv.set(t);
    }
    const after = Math.floor(Date.now() / 1000) - DIAS * 86400;
    const r = await fetch(`https://www.strava.com/api/v3/athlete/activities?after=${after}&per_page=200`, {
      headers: { authorization: "Bearer " + t.access_token },
    });
    const acts = await r.json();
    if (!r.ok) throw new Error("Strava recusou: " + (acts.message || r.status));
    const runs = {};
    for (const a of acts) {
      const type = a.sport_type || a.type || "";
      if (!/Run/.test(type)) continue;
      runs[a.id] = {
        date: String(a.start_date_local).slice(0, 10),
        hour: String(a.start_date_local).slice(11, 16),
        name: a.name, dist: a.distance, time: a.moving_time, type,
        hr: a.average_heartrate || null, elev: a.total_elevation_gain || 0,
      };
    }
    await pub.set({ connected: true, runs, lastSync: Date.now() }, { merge: true });
    res.json({ ok: true, count: Object.keys(runs).length });
  } catch (e) {
    console.error(e);
    res.status(400).json({ error: String(e.message || e) });
  }
});
