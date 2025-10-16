// server.js  (ESM)
import express from "express";
import cors from "cors";
import helmet from "helmet";
import crypto from "crypto";
import dotenv from 'dotenv';
dotenv.config();


const app = express();

// ---------- ENV ----------
const FRONT_OK   = process.env.FRONT_OK   || "https://holidayvillasks.com/#/payment/success";
const FRONT_FAIL = process.env.FRONT_FAIL || "https://holidayvillasks.com/#/payment/fail";
const BKT_CLIENT_ID = process.env.BKT_CLIENT_ID;
const BKT_STORE_KEY = process.env.BKT_STORE_KEY;
const BKT_3D_GATE   = process.env.BKT_3D_GATE || "https://pgw.bkt-ks.com/fim/est3Dgate";
const BKT_OK_URL    = process.env.BKT_OK_URL;
const BKT_FAIL_URL  = process.env.BKT_FAIL_URL;

// ---------- MID ----------
app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(express.json());
// BKT zakonisht POST-on application/x-www-form-urlencoded
app.use(express.urlencoded({ extended: false }));

app.use(
    cors({
      origin: (origin, cb) => {
        const allowedOrigins = [
          "https://holidayvillasks.com",
          "https://www.holidayvillasks.com",
          "http://localhost:5173"
        ];

        if (!origin || allowedOrigins.includes(origin) || origin === "null") {
          return cb(null, true);
        }

        return cb(new Error("CORS " + origin));
      },
      methods: ["GET", "POST", "OPTIONS"],
      allowedHeaders: ["Content-Type"],
      credentials: false,
      maxAge: 600,
    })
);

app.options("*", cors());

// ---------- HEALTH ----------
app.get("/health", (_req,res)=>res.status(200).json({ ok:true }));

// ---------- HELPERS ----------
function hashV3(f){
  const plain = `${f.clientid}${f.oid}${f.amount}${f.okUrl}${f.failUrl}${f.TranType}${f.Installment}${f.rnd}${BKT_STORE_KEY}`;
  const sha1 = crypto.createHash("sha1").update(plain,"utf8").digest();
  return Buffer.from(sha1).toString("base64");
}

// ---------- PAYMENTS ----------
const r = express.Router();

r.get("/ping", (_req,res)=>res.json({ up:true }));

r.post("/init", (req,res)=>{
  if (!BKT_CLIENT_ID || !BKT_STORE_KEY || !BKT_OK_URL || !BKT_FAIL_URL)
    return res.status(500).json({ error:"Missing BKT env" });

  const amount = String(Number(req.body?.amount ?? 0).toFixed(2));
  if (amount === "0.00") return res.status(400).json({ error:"Invalid amount" });

  const email = String(req.body?.email ?? "");
  const fields = {
    clientid: String(BKT_CLIENT_ID),
    oid: crypto.randomBytes(10).toString("hex"),
    amount,
    okUrl: BKT_OK_URL,
    failUrl: BKT_FAIL_URL,
    TranType: "Auth",
    Installment: "",
    storetype: "3D_PAY_HOSTING",
    currency: "978",
    lang: "en",
    email,
    BillToName: "",
    HashAlgorithm: "ver3",
    rnd: crypto.randomBytes(16).toString("hex"),
  };
  fields.hash = hashV3(fields);
  res.json({ gate: BKT_3D_GATE, fields });
});

// Prano GET dhe POST nga gateway
r.all("/ok", (req, res) => {
  const p = { ...req.query, ...req.body };
  const oid = p.oid || p.OrderId || "";
  const target = `${FRONT_OK}${FRONT_OK.includes("?") ? "&" : "?"}oid=${encodeURIComponent(oid)}`;
  return res.redirect(302, target);
});

r.all("/fail", (req, res) => {
  try {
    const p = { ...req.query, ...req.body };
    const oid = p.oid || p.OrderId || "";
    const msg = p.msg || p.ErrMsg || p.Response || "Payment failed";
    const target =
      `${FRONT_FAIL}${FRONT_FAIL.includes("?") ? "&" : "?"}` +
      `oid=${encodeURIComponent(oid)}&msg=${encodeURIComponent(msg)}`;
    return res.redirect(302, target);
  } catch (err) {
    console.error("/fail error", err);
    res.status(500).json({ error: "fail_route_error", details: err?.message });
  }
});

app.use("/api/payments", r);

// ---------- START ----------
const PORT = process.env.PORT || 4000;
app.listen(PORT, "0.0.0.0", ()=>console.log("API up on", PORT));
