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

  // Ku BANKA POST-on pas 3DS (backend publik)
  BKT_OK_URL,
  BKT_FAIL_URL,

  // Ku ridërgojmë përdoruesin (frontend)
  // p.sh. https://holidayvillasks.com/#/payment/success
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

/* ----------------------- Helpers ----------------------- */
// SHA512 → base64 mbi concatenim fiks:
// clientid + oid + amount + okUrl + failUrl + rnd + storekey
function makeHash({ clientid, oid, amount, okUrl, failUrl, rnd, storekey }) {
  const plain = `${clientid}${oid}${amount}${okUrl}${failUrl}${rnd}${storekey}`;
  return crypto.createHash("sha512").update(plain, "utf8").digest("base64");
}

// Vendos parametrat pas '#' nëse FRONT_* është hash-route (#/...)
function pushParamsIntoHash(baseUrl, params = {}) {
  const u = new URL(baseUrl);

  // Ka hash-route?
  if (u.hash && u.hash.startsWith("#/")) {
    const [path, q] = u.hash.slice(1).split("?"); // heq '#'
    const hq = new URLSearchParams(q || "");
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== "") hq.set(k, String(v));
    });
    u.hash = `${path}?${hq.toString()}`; // query pas hash-it
    u.search = ""; // hiq query para hash-it
  } else {
    // s’ka hash → vendosi në search normal
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

    const AMOUNT = Number(amount).toFixed(2);           // p.sh. "120.00"
    const oid = crypto.randomUUID().replace(/-/g, "").slice(0, 20);
    const RND = String(Date.now());

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
      storetype: "3D_Pay_Hosting",  // CASE-SENSITIVE si në kredenciale
      hashAlgorithm: "ver3",        // SHA-512
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
