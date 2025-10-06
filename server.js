// server.js
import "dotenv/config";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import crypto from "crypto";

const {
  PORT = 4000,
  // mund ta lësh bosh tani — middleware më poshtë do e lejojë origin-in e ardhur
  CORS_ORIGIN = "",
  BKT_CLIENT_ID,
  BKT_STORE_KEY,
  BKT_3D_GATE,
  BKT_OK_URL,
  BKT_FAIL_URL,
  FRONT_OK,
  FRONT_FAIL,
} = process.env;

const app = express();

/* =================== CORS ULTRA-ROBUST (manual) =================== */
// Lista opsionale (përdoret për logjikë/validim; po të duash mund të kufizosh këtu)
const allowList = (CORS_ORIGIN || "")
  .split(",")
  .map(s => s.trim())
  .filter(Boolean);

// vendos header-at CORS për ÇDO kërkesë; për OPTIONS kthe 204 menjëherë
app.use((req, res, next) => {
  const origin = req.headers.origin;

  // gjithmonë njofto cache/CDN që varet nga Origin
  res.setHeader("Vary", "Origin");

  // ECHO origin-in e kërkesës (lejon edhe preflight nga çdo origin)
  if (origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    // preflight mbyllet këtu (pa kaluar te routes)
    return res.status(204).end();
  }
  next();
});
/* ================================================================== */

// Parsers
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Siguri & logje
app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(morgan("tiny"));

// Health & root (për prova të shpejta)
app.get("/", (_req, res) => res.json({ ok: true, service: "payments" }));
app.get("/health", (_req, res) => res.json({ ok: true, ts: Date.now() }));

// Helper për NestPay hash SHA512 → base64
function makeHash({ clientid, oid, amount, okUrl, failUrl, rnd, storekey }) {
  const plain = `${clientid}${oid}${amount}${okUrl}${failUrl}${rnd}${storekey}`;
  return crypto.createHash("sha512").update(plain, "utf8").digest("base64");
}

// INIT → kthen { gate, fields } (fronti auto-POST te banka)
app.post("/api/payments/init", (req, res) => {
  try {
    const { amount, email, meta } = req.body || {};
    if (!amount) return res.status(400).json({ error: "amount required" });

    const oid = crypto.randomUUID().replace(/-/g, "").slice(0, 20);
    const AMOUNT = Number(amount).toFixed(2);
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
      storetype: "3D_PAY_HOSTING",
      lang: "en",
      email: email || "",
      // description: JSON.stringify(meta || {}),
    };

    res.json({ gate: BKT_3D_GATE, fields, oid, meta: meta || null });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Banka POST-on këtu → backend bën redirect te fronti
app.post("/api/payments/ok", (req, res) => {
  try {
    const { oid } = req.body || {};
    const u = new URL(FRONT_OK);
    if (oid) u.searchParams.set("oid", oid);
    res.redirect(303, u.toString());
  } catch {
    res.redirect(303, FRONT_OK);
  }
});

app.post("/api/payments/fail", (req, res) => {
  try {
    const { oid, ErrMsg } = req.body || {};
    const u = new URL(FRONT_FAIL);
    if (oid) u.searchParams.set("oid", oid);
    if (ErrMsg) u.searchParams.set("msg", ErrMsg);
    res.redirect(303, u.toString());
  } catch {
    res.redirect(303, FRONT_FAIL);
  }
});

app.listen(PORT, () => {
  console.log(`[payments] listening on :${PORT}`);
  console.log(`(optional allowList) ${allowList.join(" | ") || "(none)"}`);
});
