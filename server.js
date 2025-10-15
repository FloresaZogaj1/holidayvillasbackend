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

// CORS i STRIKT për gjithë app-in, lejo vetëm frontin
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

// ---------- PAYMENTS ROUTER ----------

// CORS shumë i relaksuar VETËM për routerin e pagesave
const paymentsCors = cors({
  origin: true, // lejo çdo origin
  methods: ["GET","POST","OPTIONS"],
  allowedHeaders: ["Content-Type"],
  credentials: false,
  maxAge: 600,
});

const r = express.Router();
r.use(paymentsCors);

// shembull endpoints (shto kodin tënd ekzistues këtu)
r.get("/ping", (_req,res)=>res.json({ up:true }));

r.post("/init", (req,res)=>{
  // ... logjika jote
});

// OK/FAIL pranojnë GET dhe POST nga bank-a
r.all("/ok", (req, res) => {
  // ... logjika jote
});

r.all("/fail", (req, res) => {
  // ... logjika jote
});

// Kjo bën që /api/payments/* endpointet të lejojnë çdo origin!
app.use("/api/payments", r);

// ---------- ERROR HANDLER & START ----------
app.get("/health", (_req,res)=>res.status(200).json({ ok:true }));
app.use((err, _req, res, _next) => {
  console.error("ERR:", err?.message || err);
  if (res.headersSent) return;
  res.status(500).json({ error: "Server error" });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, "0.0.0.0", ()=>console.log("API up on", PORT));