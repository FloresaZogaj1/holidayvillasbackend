// server.js
import "dotenv/config";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import crypto from "crypto";

const {
  PORT = 4000,

  // Payten/BKT sandbox/prod
  BKT_CLIENT_ID,
  BKT_STORE_KEY,
  BKT_3D_GATE,

  // URL-t ku BANKA POST-on pas 3DS (duhet të jenë publike të backendit)
  BKT_OK_URL,
  BKT_FAIL_URL,

  // URL-t ku ti do ta dërgosh përdoruesin (fronti) pas OK/FAIL
  // REKOMANDIM: përdori me HASH p.sh. https://holidayvillasks.com/#/payment/success
  FRONT_OK,
  FRONT_FAIL,
} = process.env;

const app = express();

/* --------------------------- CORS (preflight fix) --------------------------- */
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

  // s’po përdorim cookie/session
  res.setHeader("Access-Control-Allow-Credentials", "false");

  if (req.method === "OPTIONS") return res.status(204).end();
  next();
});
/* -------------------------------------------------------------------------- */

// Parsers (BANKA dërgon application/x-www-form-urlencoded)
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Siguri & logje
app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(morgan("tiny"));

// Health
app.get("/", (_req, res) => res.json({ ok: true, service: "payments" }));
app.get("/health", (_req, res) => res.json({ ok: true, ts: Date.now() }));

/** NestPay/Payten: SHA512 → base64, me concatenim fiks:
 * clientid + oid + amount + okUrl + failUrl + rnd + storekey  (UTF-8, pa ndarës)
 */
function makeHash({ clientid, oid, amount, okUrl, failUrl, rnd, storekey }) {
  const plain = `${clientid}${oid}${amount}${okUrl}${failUrl}${rnd}${storekey}`;
  return crypto.createHash("sha512").update(plain, "utf8").digest("base64");
}

/** INIT → kthen { gate, fields, oid }
 * Frontend-i bën auto-POST të 'fields' te 'gate' (BKT 3D gateway)
 */
app.post("/api/payments/init", (req, res) => {
  try {
    const { amount, email, meta } = req.body || {};
    if (amount == null) return res.status(400).json({ error: "amount required" });

    // gjithmonë 2 shifra decimale me pikë
    const AMOUNT = Number(amount).toFixed(2);

    // OID max 20 (zakon pagese)
    const oid = crypto.randomUUID().replace(/-/g, "").slice(0, 20);

    // RND unik
    const RND = String(Date.now());

    // Hash (ver3 = SHA512 base64)
    const hash = makeHash({
      clientid: BKT_CLIENT_ID,
      oid,
      amount: AMOUNT,
      okUrl: BKT_OK_URL,
      failUrl: BKT_FAIL_URL,
      rnd: RND,
      storekey: BKT_STORE_KEY,
    });

    const fields = {
      clientid: BKT_CLIENT_ID,
      oid,
      amount: AMOUNT,
      okUrl: BKT_OK_URL,
      failUrl: BKT_FAIL_URL,
      TranType: "Auth",
      currency: "978",
      rnd: RND,
      hash,
      storetype: "3D_Pay_Hosting", // CASE-SENSITIVE si në emailin e bankës
      hashAlgorithm: "ver3",        // e nevojshme për SHA512 në shumicën e setup-eve
      encoding: "UTF-8",
      lang: "en",
      email: email || "",
      // description: JSON.stringify(meta || {}),
    };

    res.json({ gate: BKT_3D_GATE, fields, oid, meta: meta || null });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** BANKA POST-on tek këto; ne ridërgojmë te fronti me query params */
app.post("/api/payments/ok", (req, res) => {
  try {
    const { oid } = req.body || {};
    const u = new URL(FRONT_OK);
    if (oid) u.searchParams.set("oid", oid);
    return res.redirect(303, u.toString());
  } catch {
    return res.redirect(303, FRONT_OK);
  }
});

app.post("/api/payments/fail", (req, res) => {
  try {
    const { oid, ErrMsg, Response } = req.body || {};
    const u = new URL(FRONT_FAIL);
    if (oid) u.searchParams.set("oid", oid);
    // Mesazhi nga banka (nëse ka). Provo ErrMsg, përndryshe Response.
    const msg = ErrMsg || Response || "Payment failed";
    if (msg) u.searchParams.set("msg", String(msg));
    return res.redirect(303, u.toString());
  } catch {
    return res.redirect(303, FRONT_FAIL);
  }
});

app.listen(PORT, () => {
  console.log(`[payments] listening on :${PORT}`);
});
