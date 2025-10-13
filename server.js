// server.js
import "dotenv/config";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import crypto from "crypto";

const {
  PORT = 4000,
  BKT_CLIENT_ID,
  BKT_STORE_KEY,
  BKT_3D_GATE,
  BKT_STORE_TYPE = "3D_PAY_HOSTING",
  BKT_CURRENCY = "978",
  BKT_OK_URL,
  BKT_FAIL_URL,
  FRONT_OK,
  FRONT_FAIL,
  CORS_ORIGIN,
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
/* ----------------------------------------------------------- */

app.use(express.urlencoded({ extended: true })); // BKT dërgon x-www-form-urlencoded
app.use(express.json());
app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(morgan("tiny"));

app.get("/", (_req, res) => res.json({ ok: true, service: "payments" }));
app.get("/health", (_req, res) => res.json({ ok: true, ts: Date.now() }));

/* ----------------------- HASH ver3 ----------------------- */
// rend i fiksuar sipas Payten; ASCII sort për të tjerat
const ORDER = [
  "clientid",
  "oid",
  "amount",
  "okUrl",
  "failUrl",
  "TranType",
  "instalment",
  "rnd",
  "hashAlgorithm",
  "storetype",
  "lang",
  "currency",
  "email",
];

function makeHashV3(fields, storeKeyRaw) {
  const storeKey = String(storeKeyRaw ?? "").trim();
  const esc = (v) => String(v ?? "").replace(/\\/g, "\\\\").replace(/\|/g, "\\|");

  const keys = Object.keys(fields)
    .filter(k => k !== "hash" && k !== "encoding")        // vetëm këto përfshihen
    .sort((a,b) => a.localeCompare(b, "en", { sensitivity: "base" })); // A–Z

  const plaintext = keys.map(k => esc(fields[k])).join("|") + "|" + storeKey;
  return crypto.createHash("sha512").update(plaintext, "utf8").digest("base64");
}

  
function pushParamsIntoHash(baseUrl, params = {}) {
  const u = new URL(baseUrl);
  if (u.hash && u.hash.startsWith("#/")) {
    const [path, q] = u.hash.slice(1).split("?");
    const hq = new URLSearchParams(q || "");
    Object.entries(params).forEach(
      ([k, v]) => v != null && v !== "" && hq.set(k, String(v))
    );
    u.hash = `${path}?${hq.toString()}`;
    u.search = "";
  } else {
    Object.entries(params).forEach(
      ([k, v]) => v != null && v !== "" && u.searchParams.set(k, String(v))
    );
  }
  return u.toString();
}

/* -------------------- INIT → gateway fields -------------------- */
app.post("/api/payments/init", (req, res) => {
  try {
    const { amount, email, meta } = req.body || {};
    if (amount == null) return res.status(400).json({ error: "amount required" });

    const AMOUNT = Number(amount).toFixed(2);
    const oid = crypto.randomUUID().replace(/-/g, "").slice(0, 20);
    const RND = String(Date.now());

    const fields = {
      clientid: BKT_CLIENT_ID,
      oid,
      amount: AMOUNT,
      okUrl: BKT_OK_URL,
      failUrl: BKT_FAIL_URL,
      TranType: "Auth",
      instalment: "",
      rnd: RND,
      hashAlgorithm: "ver3",
      storetype: String(BKT_STORE_TYPE),
      lang: "en",
      currency: String(BKT_CURRENCY),
      email: email || "",
      encoding: "UTF-8",
    };

    fields.hash = makeHashV3(fields, BKT_STORE_KEY);
    console.log("[pay-init] OID=%s HASH=%s", oid, fields.hash);

    return res.json({ gate: BKT_3D_GATE, fields, oid, meta: meta || null });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

/* -------------------- Callbacks nga BKT -------------------- */
app.post("/api/payments/ok", (req, res) => {
  try {
    const calc = makeHashV3(req.body, BKT_STORE_KEY);
    console.log(
      "[pay-ok] HASHRET=%s CALC=%s body=",
      req.body.HASH || req.body.hash,
      calc,
      req.body
    );

    const { oid, ProcReturnCode, mdStatus } = req.body || {};
    const mdOk = ["1", "2", "3", "4"].includes(String(mdStatus || ""));
    const bankOk = String(ProcReturnCode || "") === "00";
    const target = pushParamsIntoHash(FRONT_OK, {
      oid,
      ok: bankOk && mdOk ? "1" : "0",
    });
    return res.redirect(303, target);
  } catch {
    return res.redirect(303, FRONT_OK);
  }
});

app.post("/api/payments/fail", (req, res) => {
  try {
    const calc = makeHashV3(req.body, BKT_STORE_KEY);
    console.log(
      "[pay-fail] HASHRET=%s CALC=%s ErrMsg=%s body=",
      req.body.HASH || req.body.hash,
      calc,
      req.body.ErrMsg,
      req.body
    );

    const { oid, ErrMsg, Response } = req.body || {};
    const msg = ErrMsg || Response || "Payment failed";
    const target = pushParamsIntoHash(FRONT_FAIL, { oid, msg });
    return res.redirect(303, target);
  } catch {
    return res.redirect(303, FRONT_FAIL);
  }
});

app.listen(PORT, () => console.log(`[payments] listening on :${PORT}`));
