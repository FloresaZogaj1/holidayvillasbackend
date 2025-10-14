// server.js
import "dotenv/config";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import crypto from "crypto";

const {
  PORT = 4000,
  CORS_ORIGIN,
  BKT_CLIENT_ID,
  BKT_STORE_KEY,
  BKT_3D_GATE,
  BKT_OK_URL,
  BKT_FAIL_URL,
  FRONT_OK,
  FRONT_FAIL,
  BKT_STORE_TYPE = "3D_PAY_HOSTING",
  BKT_CURRENCY = "978",
} = process.env;

const app = express();

/* ------------ CORS ------------ */
app.use((req, res, next) => {
  const origin = req.headers.origin || "";
  if (origin && CORS_ORIGIN && origin === CORS_ORIGIN) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    req.headers["access-control-request-headers"] ||
      "Content-Type, Accept, Origin, Authorization"
  );
  if (req.method === "OPTIONS") return res.status(204).end();
  next();
});

/* ---- Parsers & Security ---- */
app.use(express.urlencoded({ extended: true })); // BKT dërgon x-www-form-urlencoded
app.use(express.json());
app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(morgan("tiny"));

/* ------------ Utils ------------ */
const t = (v) => String(v ?? "").trim();
function hashV2({ clientid, oid, amount, okUrl, failUrl, TranType, instalment, rnd, storekey }) {
  const plain =
    t(clientid) + t(oid) + t(amount) + t(okUrl) + t(failUrl) +
    t(TranType) + t(instalment) + t(rnd) + t(storekey);
  return crypto.createHash("sha1").update(plain, "utf8").digest("base64");
}

/* ------------ Health ------------ */
app.get("/", (_req, res) => res.json({ ok: true, service: "payments" }));
app.get("/health", (_req, res) => res.json({ ok: true, ts: Date.now() }));

/* ---- INIT → kthe form fields për bankën ---- */
app.post("/api/payments/init", (req, res) => {
  const { amount } = req.body || {};
  if (amount == null) return res.status(400).json({ error: "amount required" });

  const AMOUNT = Number(amount).toFixed(2);
  const oid = crypto.randomUUID().replace(/-/g, "").slice(0, 20);
  const RND = String(Date.now());
  const TranType = "Auth";
  const instalment = "";

  const hash = hashV2({
    clientid: BKT_CLIENT_ID,
    oid,
    amount: AMOUNT,
    okUrl: BKT_OK_URL,
    failUrl: BKT_FAIL_URL,
    TranType,
    instalment,
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
    instalment: "",
    currency: BKT_CURRENCY,          // 978 = EUR
    rnd: RND,
    storetype: BKT_STORE_TYPE,        // 3D_PAY_HOSTING
    hash,                             // ver2 SHA1 base64
    encoding: "UTF-8",
    lang: "en",
  };

  return res.json({ gate: BKT_3D_GATE, fields, oid });
});

/* ---- OK/FALLBACK → redirect te fronti ---- */
function pushParamsIntoHash(baseUrl, params = {}) {
  const u = new URL(baseUrl);
  if (u.hash && u.hash.startsWith("#/")) {
    const [path, q] = u.hash.slice(1).split("?");
    const hq = new URLSearchParams(q || "");
    Object.entries(params).forEach(([k, v]) => v != null && v !== "" && hq.set(k, String(v)));
    u.hash = `${path}?${hq.toString()}`;
    u.search = "";
  } else {
    Object.entries(params).forEach(([k, v]) => v != null && v !== "" && u.searchParams.set(k, String(v)));
  }
  return u.toString();
}

app.post("/api/payments/ok", (req, res) => {
  console.log("[BKT RETURN - OK]", {
    oid: req.body?.oid,
    ProcReturnCode: req.body?.ProcReturnCode,
    mdStatus: req.body?.mdStatus,
    ErrMsg: req.body?.ErrMsg || req.body?.errmsg || req.body?.Response,
    HostRefNum: req.body?.HostRefNum,
    AuthCode: req.body?.AuthCode,
  });

  const { oid, ProcReturnCode, mdStatus } = req.body || {};
  const mdOk = ["1", "2", "3", "4"].includes(String(mdStatus || ""));
  const bankOk = String(ProcReturnCode || "") === "00";
  const target = pushParamsIntoHash(FRONT_OK, { oid, ok: bankOk && mdOk ? "1" : "0" });
  return res.redirect(303, target);
});

app.post("/api/payments/fail", (req, res) => {
 console.log("[BKT RETURN - FAIL]", {
    oid: req.body?.oid,
    ProcReturnCode: req.body?.ProcReturnCode,
    mdStatus: req.body?.mdStatus,
    ErrMsg: req.body?.ErrMsg || req.body?.errmsg || req.body?.Response,
    HostRefNum: req.body?.HostRefNum,
    AuthCode: req.body?.AuthCode,
  });

  const { oid, ErrMsg, Response } = req.body || {};
  const msg = ErrMsg || Response || "Payment failed";
  const target = pushParamsIntoHash(FRONT_FAIL, { oid, msg });
  return res.redirect(303, target);
});
/* ------------ Listen ------------ */
app.listen(PORT, () => console.log(`[payments] :${PORT}`));
