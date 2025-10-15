import express from "express";
import cors from "cors";
import helmet from "helmet";
import crypto from "crypto";

const app = express();

// ---------- ENV ----------
const FRONTENDS = [
  "https://holidayvillasks.com",
  "https://www.holidayvillasks.com"
];

// ---------- MID ----------
// Helmet
app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Strict CORS for rest of app
app.use(
  cors({
    origin: (o, cb) =>
      !o || FRONTENDS.includes(o)
        ? cb(null, true)
        : cb(new Error("CORS " + o)),
    methods: ["GET","POST","OPTIONS"],
    allowedHeaders: ["Content-Type"],
    credentials: false,
    maxAge: 600,
  })
);

// Payments router with relaxed CORS
const paymentsCors = cors({
  origin: true,
  methods: ["GET","POST","OPTIONS"],
  allowedHeaders: ["Content-Type"],
  credentials: false,
  maxAge: 600,
});

const paymentsRouter = express.Router();
paymentsRouter.use(paymentsCors);

// Payment initialization route
paymentsRouter.post("/init", async (req, res) => {
  try {
    const CLIENT_ID = process.env.BKT_CLIENT_ID;
    const STORE_KEY = process.env.BKT_STORE_KEY;
    const GATE_URL = process.env.BKT_3D_GATE;
    const OK_URL = process.env.BKT_OK_URL;
    const FAIL_URL = process.env.BKT_FAIL_URL;

    const { amount, email = "" } = req.body || {};
    if (!amount) return res.status(400).json({ error: "amount_required" });

    const oid = crypto.randomUUID().replace(/-/g, "").slice(0, 20);
    const rnd = crypto.randomBytes(16).toString("hex");
    const amt = Number(amount).toFixed(2);
    const TranType = "Auth";
    const Installment = "";

    // Hash calculation as per BKT 3D Pay requirements
    const plain = CLIENT_ID + oid + amt + OK_URL + FAIL_URL + TranType + Installment + rnd + STORE_KEY;
    const hash = crypto.createHash("sha1").update(plain, "utf8").digest("base64");

    const fields = {
      clientid: CLIENT_ID,
      oid,
      amount: amt,
      okUrl: OK_URL,
      failUrl: FAIL_URL,
      TranType,
      Installment,
      rnd,
      storetype: "3D_PAY_HOSTING",
      currency: "978",
      lang: "en",
      email,
      HashAlgorithm: "ver3",
      hash,
    };

    return res.json({ gate: GATE_URL, fields, oid });
  } catch (e) {
    console.error("init_failed", e);
    return res.status(500).json({ error: "init_failed" });
  }
});

// OK/FAIL endpoints
paymentsRouter.all("/ok", (req, res) => {
  const oid = req.query?.oid || req.query?.OrderId || "";
  const target = `${process.env.FRONT_OK}${process.env.FRONT_OK.includes("?") ? "&" : "?"}oid=${encodeURIComponent(oid)}`;
  return res.redirect(302, target);
});

paymentsRouter.all("/fail", (req, res) => {
  const oid = req.query?.oid || req.query?.OrderId || "";
  const msg = req.query?.msg || req.query?.ErrMsg || req.query?.Response || "Payment failed";
  const target = `${process.env.FRONT_FAIL}${process.env.FRONT_FAIL.includes("?") ? "&" : "?"}oid=${encodeURIComponent(oid)}&msg=${encodeURIComponent(msg)}`;
  return res.redirect(302, target);
});

// Mount payments router
app.use("/api/payments", paymentsRouter);

// Health and error handler
app.get("/health", (_req,res)=>res.status(200).json({ ok:true }));
app.use((err, _req, res, _next) => {
  console.error("ERR:", err?.message || err);
  if (res.headersSent) return;
  res.status(500).json({ error: "Server error" });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, "0.0.0.0", ()=>console.log("API up on", PORT));