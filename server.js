import express from "express";
import cors from "cors";
import helmet from "helmet";
import crypto from "crypto";

const app = express();

// ---------- ENV ----------
const FRONTENDS = [
  "https://holidayvillasks.com",
  "https://www.holidayvillasks.com",
  "http://localhost:5173"
];

// ---------- MID ----------
// Helmet
app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Strict CORS for rest of app
app.use(
  cors({
        origin: function (origin, callback) {
          // Always allow localhost:5173 and production frontend
          if (!origin) return callback(null, true);
          if (
            FRONTENDS.includes(origin) ||
            origin?.includes("localhost:5173") ||
            origin === process.env.FRONTEND_URL
          ) {
            return callback(null, true);
          } else {
            console.error("Blocked by CORS", origin);
            return callback(new Error("Not allowed by CORS"));
          }
        },
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
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true,
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
    if (!amount) {
      console.error("amount_required", { body: req.body });
      return res.status(400).json({ error: "amount_required" });
    }

    try {
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
    } catch (err) {
      console.error("init_failed_inner", {
        error: err,
        env: {
          CLIENT_ID,
          STORE_KEY,
          GATE_URL,
          OK_URL,
          FAIL_URL
        },
        body: req.body
      });
      return res.status(500).json({ error: "init_failed_inner", details: err?.message });
    }
  } catch (e) {
    console.error("init_failed_outer", e);
    return res.status(500).json({ error: "init_failed_outer", details: e?.message });
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

const DEFAULT_PORT = 4000;
const PORT = process.env.PORT || DEFAULT_PORT;

function startServer(port) {
  const server = app.listen(port, "0.0.0.0", () => {
    const actualPort = server.address().port;
    console.log("API up on", actualPort);
  });
  server.on('error', err => {
    if (err.code === 'EADDRINUSE') {
      console.warn(`Port ${port} in use, trying another port...`);
      startServer(0); // 0 means random available port
    } else {
      console.error('Server error:', err);
    }
  });
}

startServer(PORT);