// server.js (ESM)
import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import crypto from "crypto";

const {
  PORT = 4000,
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

// Parsers
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Security & logs
app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(morgan("tiny"));

/* -------- CORS i saktë (lista me presje + OPTIONS) -------- */
const allowList = (CORS_ORIGIN || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

// bëj cache-friendly për CDN/proxy
app.use((req, res, next) => {
  res.header("Vary", "Origin");
  next();
});

app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin || allowList.includes(origin)) return cb(null, true);
      return cb(new Error("Not allowed by CORS: " + origin));
    },
    credentials: true,
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type"],
  })
);

// lejo preflight
app.options("*", cors());
/* ----------------------------------------------------------- */

// Health
app.get("/health", (_req, res) => res.json({ ok: true, ts: Date.now() }));

// NestPay helper – SHA512 → base64
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
      // description: JSON.stringify(meta || {}), // opsionale
    };

    return res.json({ gate: BKT_3D_GATE, fields, oid, meta: meta || null });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// OK/FAIL (POST nga banka) → redirect te fronti
app.post("/api/payments/ok", (req, res) => {
  try {
    const { oid } = req.body || {};
    const url = new URL(FRONT_OK);
    if (oid) url.searchParams.set("oid", oid);
    return res.redirect(303, url.toString());
  } catch {
    return res.redirect(303, FRONT_OK);
  }
});

app.post("/api/payments/fail", (req, res) => {
  try {
    const { oid, ErrMsg } = req.body || {};
    const url = new URL(FRONT_FAIL);
    if (oid) url.searchParams.set("oid", oid);
    if (ErrMsg) url.searchParams.set("msg", ErrMsg);
    return res.redirect(303, url.toString());
  } catch {
    return res.redirect(303, FRONT_FAIL);
  }
});

app.listen(PORT, () => {
  console.log(`[payments] listening on :${PORT}`);
  console.log(`Allow CORS: ${allowList.join(" | ") || "(none)"}`);
});
