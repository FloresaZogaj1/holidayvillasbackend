// server.js
import "dotenv/config";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import crypto from "crypto";

const {
  PORT = 4000,
  CORS_ORIGIN,

  // BKT – 3D Pay Hosting
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
// Payten ver3: përfshihen TË GJITHA fushat (përveç 'hash' dhe 'encoding'),
// rend ALFABETIK sipas EMRIT të fushës, bashkim me '|', pastaj '|'+storeKey.
// Duhet "escape" për '\' dhe '|' brenda vlerave.
function makeHashV3(fields, storeKeyRaw) {
  const storeKey = String(storeKeyRaw ?? "").trim();
  const esc = (v) => String(v ?? "").replace(/\\/g, "\\\\").replace(/\|/g, "\\|");

  const keys = Object.keys(fields)
    .filter((k) => k !== "hash" && k !== "encoding")
    .sort(); // ASCII A–Z

  const plaintext = keys.map((k) => esc(fields[k])).join("|") + "|" + storeKey;
  // DEBUG: shiko çfarë po hash-on (mos log storeKey!)
  console.log("[hash v3 plaintext]", plaintext);
  return crypto.createHash("sha512").update(plaintext, "utf8").digest("base64");
}

// Vendos parametrat pas '#' nëse FRONT_* është hash-route (#/...)
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
    const { amount } = req.body || {};
    if (amount == null) return res.status(400).json({ error: "amount required" });

    const AMOUNT = Number(amount).toFixed(2); // p.sh. "120.00"
    const oid = crypto.randomUUID().replace(/-/g, "").slice(0, 20);
    const RND = String(Date.now());

    // Fusha minimale & standarde për ver3
    const fields = {
      amount: AMOUNT,
      clientid: BKT_CLIENT_ID,
      currency: String(BKT_CURRENCY),
      failUrl: BKT_FAIL_URL,
      hashAlgorithm: "ver3",
      Instalment: "",                 // me I të madhe (futet në hash edhe kur bosh)
      lang: "en",
      okUrl: BKT_OK_URL,
      oid,
      rnd: RND,
      storetype: String(BKT_STORE_TYPE), // 3D_PAY_HOSTING
      TranType: "Auth",
      encoding: "UTF-8",              // NUK futet në hash
    };

    fields.hash = makeHashV3(fields, BKT_STORE_KEY);
    console.log("[pay-init] OID=%s HASH(len)=%d", oid, fields.hash.length);

    return res.json({ gate: BKT_3D_GATE, fields, oid });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

/* -------------------- Callbacks nga BKT -------------------- */
// Verifikim i lehtë (LOG-only); gjithsesi ridërgojmë user-in te fronti.
app.post("/api/payments/ok", (req, res) => {
  try {
    const retHash = req.body.HASH || req.body.hash;
    const calc = makeHashV3(req.body, BKT_STORE_KEY);
    console.log("[pay-ok] HASHRET=%s CALC=%s mdStatus=%s ProcReturnCode=%s",
      retHash, calc, req.body.mdStatus, req.body.ProcReturnCode);

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
    const retHash = req.body.HASH || req.body.hash;
    const calc = makeHashV3(req.body, BKT_STORE_KEY);
    console.log("[pay-fail] HASHRET=%s CALC=%s ErrMsg=%s",
      retHash, calc, req.body.ErrMsg);

    const { oid, ErrMsg, Response } = req.body || {};
    const msg = ErrMsg || Response || "Payment failed";
    const target = pushParamsIntoHash(FRONT_FAIL, { oid, msg });
    return res.redirect(303, target);
  } catch {
    return res.redirect(303, FRONT_FAIL);
  }
});

app.listen(PORT, () => console.log(`[payments] listening on :${PORT}`));
