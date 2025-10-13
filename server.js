// server.js
import "dotenv/config";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import crypto from "crypto";

const {
  PORT = 4000,
  CORS_ORIGIN,

  // BKT – 3D Pay Hosting (PROD)
  BKT_CLIENT_ID,
  BKT_STORE_KEY,
  BKT_3D_GATE,
  BKT_OK_URL,
  BKT_FAIL_URL,

  // Defaults
  BKT_STORE_TYPE = "3D_PAY_HOSTING",
  BKT_CURRENCY = "978",

  // Frontend (hash router)
  FRONT_OK,
  FRONT_FAIL,
} = process.env;

const app = express();

/* --------------------------- CORS --------------------------- */
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

/* --------------------------- Parsers & Security --------------------------- */
app.use(express.urlencoded({ extended: true })); // BKT dërgon x-www-form-urlencoded
app.use(express.json());
app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(morgan("tiny"));

/* --------------------------- Health --------------------------- */
app.get("/", (_req, res) => res.json({ ok: true, service: "payments" }));
app.get("/health", (_req, res) => res.json({ ok: true, ts: Date.now() }));

/* --------------------------- Helpers --------------------------- */
const t = (v) => String(v ?? "").trim();

/**
 * VER2 (klasik):
 * plain = clientid + oid + amount + okUrl + failUrl + TranType + instalment + rnd + storekey
 * hash  = Base64( SHA1(plain) )
 */
function makeHashV2({ clientid, oid, amount, okUrl, failUrl, TranType, instalment, rnd, storekey }) {
  const plain =
    t(clientid) +
    t(oid) +
    t(amount) +
    t(okUrl) +
    t(failUrl) +
    t(TranType) +
    t(instalment) +
    t(rnd) +
    t(storekey);
  console.log("[hash v2 plaintext]", plain); // kontrollo që s’ka whitespace të fshehta
  return crypto.createHash("sha1").update(plain, "utf8").digest("base64");
}

// Vendos parametrat pas '#' nëse FRONT_* është hash-route (#/...)
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

/* -------------------- INIT → gateway fields (ver2 + SHA1) -------------------- */
app.post("/api/payments/init", (req, res) => {
  try {
    const { amount } = req.body || {};
    if (amount == null) return res.status(400).json({ error: "amount required" });

    const AMOUNT = Number(amount).toFixed(2); // p.sh. "120.00"
    const oid = crypto.randomUUID().replace(/-/g, "").slice(0, 20);
    const RND = String(Date.now());
    const TranType = "Auth";
    const instalment = ""; // bosh sipas ver2

    const hash = makeHashV2({
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

    // Dërgo EDHE `instalment` në fields (disa profile e kërkojnë)
    const fields = {
      clientid: t(BKT_CLIENT_ID),
      oid: t(oid),
      amount: t(AMOUNT),
      okUrl: t(BKT_OK_URL),
      failUrl: t(BKT_FAIL_URL),
      TranType: "Auth",
      instalment: "",                        // dërgohet bosh
      currency: t(BKT_CURRENCY),
      rnd: t(RND),
      storetype: t(BKT_STORE_TYPE),          // duhet fiks 3D_PAY_HOSTING
      hash,                                  // PA hashAlgorithm
      encoding: "UTF-8",
      lang: "en",
    };

    console.log("[init fields]", fields);
    return res.json({ gate: BKT_3D_GATE, fields, oid });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

/* -------------------- Callbacks nga BKT -------------------- */
app.post("/api/payments/ok", (req, res) => {
  try {
    console.log("[pay-ok] body=", req.body);
    const { oid, ProcReturnCode, mdStatus } = req.body || {};
    const mdOk = ["1", "2", "3", "4"].includes(String(mdStatus || ""));
    const bankOk = String(ProcReturnCode || "") === "00";
    const target = pushParamsIntoHash(FRONT_OK, { oid, ok: bankOk && mdOk ? "1" : "0" });
    return res.redirect(303, target);
  } catch {
    return res.redirect(303, FRONT_OK);
  }
});

app.post("/api/payments/fail", (req, res) => {
  try {
    console.log("[pay-fail] body=", req.body);
    const { oid, ErrMsg, Response } = req.body || {};
    const msg = ErrMsg || Response || "Payment failed";
    const target = pushParamsIntoHash(FRONT_FAIL, { oid, msg });
    return res.redirect(303, target);
  } catch {
    return res.redirect(303, FRONT_FAIL);
  }
});

app.listen(PORT, () => console.log(`[payments] listening on :${PORT}`));
app.post("/api/payments/ok",(req,res)=>{console.log("[BKT OK]",req.body); const {oid,ProcReturnCode,mdStatus}=req.body||{}; const ok=["1","2","3","4"].includes(String(mdStatus)) && String(ProcReturnCode)==="00"; return res.redirect(303, pushParamsIntoHash(FRONT_OK,{oid,ok: ok?"1":"0"}));});
app.post("/api/payments/fail",(req,res)=>{console.log("[BKT FAIL]",req.body); const {oid,ErrMsg,Response}=req.body||{}; const msg=ErrMsg||Response||"Payment failed"; return res.redirect(303, pushParamsIntoHash(FRONT_FAIL,{oid,msg}));});
