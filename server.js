// server.js
import "dotenv/config";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import crypto from "crypto";

const {
  PORT = 4000,

  // Payten/BKT
  BKT_CLIENT_ID,
  BKT_STORE_KEY,
  BKT_3D_GATE,

  // Backend callbacks (publikë) ku BANKA POST-on pas 3DS
  BKT_OK_URL,
  BKT_FAIL_URL,

  // Frontend routes (hash router) ku ridërgojmë user-in
  FRONT_OK,
  FRONT_FAIL,
} = process.env;

const app = express();

/* --------------------------- CORS (preflight) --------------------------- */
// lejon vetëm origjinën e sitit tënd në prod (ndrysho si të duash)
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin) res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  const reqHeaders = req.headers["access-control-request-headers"];
  res.setHeader(
    "Access-Control-Allow-Headers",
    reqHeaders || "Content-Type, Accept, Origin, Authorization"
  );
  res.setHeader("Access-Control-Allow-Credentials", "false");
  if (req.method === "OPTIONS") return res.status(204).end();
  next();
});
/* ---------------------------------------------------------------------- */

// Parsers (BANKA dërgon application/x-www-form-urlencoded)
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Siguri & logje
app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(morgan("tiny"));

// Health
app.get("/", (_req, res) => res.json({ ok: true, service: "payments" }));
app.get("/health", (_req, res) => res.json({ ok: true, ts: Date.now() }));

/* ----------------------- Helpers ----------------------- */
// Rregull i ver3: hash = SHA-512(Base64) mbi VLERAT e të GJITHA fushave (përveç 'hash' & 'encoding'),
// të renditura alfabetikisht sipas EMRIT të fushës, të bashkuara me '|', pastaj shtohet '|'+storeKey.
// Karakteret '\' dhe '|' duhen "escape"-uar në vlera.
function makeHashV3(fields, storeKey) {
  const escape = (v) =>
    String(v ?? "")
      .replace(/\\/g, "\\\\")
      .replace(/\|/g, "\\|");

  const keys = Object.keys(fields)
    .filter((k) => k !== "hash" && k !== "encoding")
    .sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" }));

  const plaintext = keys.map((k) => escape(fields[k])).join("|") + "|" + storeKey;
  return crypto.createHash("sha512").update(plaintext, "utf8").digest("base64");
}

// Vendos parametrat pas '#' nëse FRONT_* është hash-route (#/...)
function pushParamsIntoHash(baseUrl, params = {}) {
  const u = new URL(baseUrl);

  if (u.hash && u.hash.startsWith("#/")) {
    const [path, q] = u.hash.slice(1).split("?");
    const hq = new URLSearchParams(q || "");
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== "") hq.set(k, String(v));
    });
    u.hash = `${path}?${hq.toString()}`;
    u.search = "";
  } else {
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== "") u.searchParams.set(k, String(v));
    });
  }
  return u.toString();
}
/* ------------------------------------------------------ */

/** INIT → kthen { gate, fields, oid } për auto-POST te gateway i BKT */
app.post("/api/payments/init", (req, res) => {
  try {
    const { amount, email, meta } = req.body || {};
    if (amount == null) return res.status(400).json({ error: "amount required" });

    const AMOUNT = Number(amount).toFixed(2); // p.sh. "120.00"
    const oid = crypto.randomUUID().replace(/-/g, "").slice(0, 20);
    const RND = String(Date.now());

    // Fushat sipas emrave që pranon EST (këto futen në hash ver3)
    const fields = {
      amount: AMOUNT,
      clientid: BKT_CLIENT_ID,
      currency: "978",
      email: email || "",
      encoding: "UTF-8",         // NUK futet në hash (por e dërgojmë)
      failUrl: BKT_FAIL_URL,
      hashAlgorithm: "ver3",     // ver3 = rend A–Z + '|'
      Instalment: "",            // bosh, por e pranishme (futet në hash si "")
      lang: "en",
      okUrl: BKT_OK_URL,
      oid,
      rnd: RND,
      storetype: "3D_Pay_Hosting", // fikse si në kredenciale
      TranType: "Auth",
      // description: JSON.stringify(meta || {}), // opsionale
    };

    // Llogarit hash-in ver3
    fields.hash = makeHashV3(fields, BKT_STORE_KEY);

    return res.json({ gate: BKT_3D_GATE, fields, oid, meta: meta || null });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

/** BANKA POST-on tek këto; ne ridërgojmë te fronti me query pas hash-it */
app.post("/api/payments/ok", (req, res) => {
  try {
    const { oid } = req.body || {};
    const target = pushParamsIntoHash(FRONT_OK, { oid });
    return res.redirect(303, target);
  } catch {
    return res.redirect(303, FRONT_OK);
  }
});

app.post("/api/payments/fail", (req, res) => {
  try {
    const { oid, ErrMsg, Response } = req.body || {};
    const msg = ErrMsg || Response || "Payment failed";
    const target = pushParamsIntoHash(FRONT_FAIL, { oid, msg });
    return res.redirect(303, target);
  } catch {
    return res.redirect(303, FRONT_FAIL);
  }
});

app.listen(PORT, () => {
  console.log(`[payments] listening on :${PORT}`);
});
