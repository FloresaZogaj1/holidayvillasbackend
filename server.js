// server.js (ESM)
import express from "express";
import cors from "cors";
import helmet from "helmet";
import crypto from "crypto";
import dotenv from "dotenv";
import villasRouter from "./routes/villas.js";
import { createMailTransporterIfConfigured, notifyPaymentByEmail, pickPaymentDebugFields } from "./utils/emailService.js";
import { prisma } from "./db.js";
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

const ADMIN_EMAIL_TO = process.env.ADMIN_EMAIL_TO || "holidayvillas.ks@gmail.com";

// ---------- EMAIL (debug notifications on payment callbacks) ----------
// If RESEND_API_KEY is set, emailService will use Resend. In that case,
// don't initialize SMTP at all (Render -> Gmail was timing out).
const mailer = process.env.RESEND_API_KEY ? null : createMailTransporterIfConfigured(process.env);

// Log email provider configuration (no secrets) so Render logs confirm which path is active.
console.log("[startup/email] config", {
  hasResendKey: !!process.env.RESEND_API_KEY,
  hasSmtpUser: !!process.env.EMAIL_USER,
  hasSmtpPass: !!process.env.EMAIL_PASS,
  hasAdminTo: !!process.env.ADMIN_EMAIL_TO,
  resolvedMailer: mailer ? "smtp" : "none",
});

// ---------- MIDDLEWARE ----------
app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// --------- DEBUG: minimal API request logger (helpful on Render/local) ---------
app.use((req, _res, next) => {
  try {
    if (req.path?.startsWith("/api/")) {
      console.log(
        `[${new Date().toISOString()}] ${req.method} ${req.originalUrl} ` +
          `ip=${req.headers["x-forwarded-for"] || req.socket?.remoteAddress || ""}`
      );
    }
  } catch {
    // ignore logger errors
  }
  next();
});


// CORS vetëm për API që thirret nga frontend-i
const apiCors = cors({
  origin(origin, cb) {
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
});

app.options("/api/*", apiCors);
app.use("/api/admin", apiCors, villasRouter);

// ---------- HEALTH ----------
app.get("/health", (_req, res) => res.status(200).json({ ok: true }));

// Diagnostics endpoint to confirm env is visible at runtime (no secrets).
// Keep under /api to be visible in our request logger.
app.get("/api/debug/email", (_req, res) => {
  const allowSmtp = String(process.env.ALLOW_SMTP || "").toLowerCase() === "true";
  const nodeEnv = process.env.NODE_ENV || null;
  const smtpConfigured = !!process.env.EMAIL_USER && !!process.env.EMAIL_PASS;
  const smtpEnabled = smtpConfigured && (allowSmtp || nodeEnv !== "production");
  res.json({
    hasResendKey: !!process.env.RESEND_API_KEY,
    resendFrom: process.env.RESEND_FROM || null,
    hasSmtpUser: !!process.env.EMAIL_USER,
    hasSmtpPass: !!process.env.EMAIL_PASS,
    hasAdminTo: !!process.env.ADMIN_EMAIL_TO,
    nodeEnv,
    allowSmtp,
    smtpEnabled,
    providerPreferred: process.env.RESEND_API_KEY ? "resend" : (smtpEnabled ? "smtp" : "none"),
  });
});

// ---------- HASH HELPERS ----------
function hashV3(fields, storeKey) {
  const ordered = [
    fields.amount,
    fields.BillToName,
    fields.clientid,
    fields.currency,
    fields.email,
    fields.failUrl,
    fields.HashAlgorithm,  // "ver3"
    fields.Installment,    // "" but must be present
    fields.lang,
    fields.oid,
    fields.okUrl,
    fields.rnd,
    fields.storetype,
    fields.TranType,
    storeKey,
  ];
  const plain = ordered.join("|");
  // ver3 commonly uses SHA512 then Base64
  const digest = crypto.createHash("sha512").update(plain, "utf8").digest();
  return Buffer.from(digest).toString("base64");
}

// ---------- HASH HELPERS ----------
function buildHashV3_SHA512(fields, storeKey) {
  // Order per Payten ver3 doc
  const ordered = [
    fields.amount,        // with 2 decimals
    fields.BillToName,    // avoid non-ASCII for now
    fields.clientid,
    fields.currency,
    fields.email,
    fields.failUrl,
    fields.HashAlgorithm, // "ver3"
    fields.Installment,   // empty string but present
    fields.lang,
    fields.oid,
    fields.okUrl,
    fields.rnd,
    fields.storetype,     // KEEP EXACT CASE you send: "3D_PAY_HOSTING"
    fields.TranType,
    storeKey,
  ];
  const plain = ordered.join("|");
  const digest = crypto.createHash("sha512").update(plain, "utf8").digest();
  return { hash: Buffer.from(digest).toString("base64"), plain };
}


// ---------- PAYMENTS ----------
const r = express.Router();

r.get("/ping", (_req, res) => res.json({ up: true }));

// pickPaymentDebugFields imported from emailService.js

// ---------------- INIT ----------------
r.post("/init", apiCors, (req, res) => {
  try {
    if (!BKT_CLIENT_ID || !BKT_STORE_KEY || !BKT_OK_URL || !BKT_FAIL_URL) {
      console.error("[payments/init] Missing BKT env", {
        hasClientId: !!BKT_CLIENT_ID,
        hasStoreKey: !!BKT_STORE_KEY,
        hasOkUrl: !!BKT_OK_URL,
        hasFailUrl: !!BKT_FAIL_URL,
      });
      return res.status(500).json({ error: "Missing BKT env" });
    }

    const amount = String(Number(req.body?.amount ?? 0).toFixed(2));
    if (amount === "0.00") {
      console.warn("[payments/init] Invalid amount", { amount: req.body?.amount });
      return res.status(400).json({ error: "Invalid amount" });
    }

    const email = String(req.body?.email ?? "");
    const meta = req.body?.meta ?? null;
    const fields = {
      clientid: String(BKT_CLIENT_ID),
      oid: crypto.randomBytes(10).toString("hex"),
      amount,
      okUrl: BKT_OK_URL, // must match whitelisted exactly
      failUrl: BKT_FAIL_URL, // must match whitelisted exactly
      TranType: "Auth",
      Installment: "",
      storetype: "3D_PAY_HOSTING", // match your terminal config
      currency: "978",
      lang: "en",
      email,
      BillToName: "Holiday Villas",
      HashAlgorithm: "ver3",
      encoding: "UTF-8", // REQUIRED by Payten email
      rnd: crypto.randomBytes(16).toString("hex"),
    };

    const { hash, plain } = buildHashV3_SHA512(fields, BKT_STORE_KEY);
    fields.hash = hash;

    // Debug: verify what you hash == what you send
    console.log("[payments/init] HASH_PLAIN_VER3:", plain);
    console.log("[payments/init] FIELDS_TO_GATE:", fields);

    // Persist reservation metadata so /ok and /fail can email full reservation details.
    // Don't block payment init if DB fails; just log.
    (async () => {
      try {
        await prisma.paymentAttempt.upsert({
          where: { oid: fields.oid },
          update: {
            amount: Number(amount),
            currency: fields.currency,
            email,
            meta,
            status: "initiated",
          },
          create: {
            oid: fields.oid,
            amount: Number(amount),
            currency: fields.currency,
            email,
            meta,
            status: "initiated",
          },
        });
      } catch (e) {
        console.error("[payments/init] failed to persist paymentAttempt", e?.message || e);
      }
    })();

    return res.json({ gate: BKT_3D_GATE, fields, oid: fields.oid });
  } catch (err) {
    console.error("[payments/init] error", err);
    return res.status(500).json({ error: "Init failed" });
  }
});


// ---------------- OK / FAIL ----------------
// Këto rrugë pranojnë POST nga banka => asnjë CORS
r.all("/ok", (req, res) => {
  const p = { ...req.query, ...req.body };

  console.log("[payments/ok] callback received", {
    method: req.method,
    contentType: req.headers["content-type"],
    keys: Object.keys(p || {}),
    debug: pickPaymentDebugFields(p),
  });

  const oid = p.oid || p.OrderId || "";
  const transId = p.TransId || p.transId || "";
  const target = `${FRONT_OK}${FRONT_OK.includes("?") ? "&" : "?"}oid=${encodeURIComponent(oid)}${transId ? `&transId=${encodeURIComponent(transId)}` : ""}`;
  console.log("[payments/ok] redirecting", { oid, transId, target });

  // Fire-and-forget email notification; do not block redirect.
  (async () => {
    let attempt = null;
    try {
      if (oid) {
        attempt = await prisma.paymentAttempt.findUnique({ where: { oid } });
        await prisma.paymentAttempt.update({ where: { oid }, data: { status: "ok" } });
      }
    } catch (e) {
      console.error("[payments/ok] paymentAttempt lookup/update failed", e?.message || e);
    }
    notifyPaymentByEmail({
      kind: "OK",
      payload: { ...p, attempt },
      redirectTarget: target,
      mailer,
      to: ADMIN_EMAIL_TO,
    });
  })();

  return res.redirect(302, target);
});

r.all("/fail", (req, res) => {
  try {
    const p = { ...req.query, ...req.body };

    console.warn("[payments/fail] callback received", {
      method: req.method,
      contentType: req.headers["content-type"],
      keys: Object.keys(p || {}),
      debug: pickPaymentDebugFields(p),
    });

    const oid = p.oid || p.OrderId || "unknown";
    const msg = p.msg || p.ErrMsg || p.Response || "Payment failed";
    const transId = p.TransId || p.transId || "";
    const target =
      `${FRONT_FAIL}${FRONT_FAIL.includes("?") ? "&" : "?"}` +
      `oid=${encodeURIComponent(oid)}&msg=${encodeURIComponent(msg)}` +
      (transId ? `&transId=${encodeURIComponent(transId)}` : "");

    console.warn("[payments/fail] redirecting", { oid, msg, transId, target });

    // Fire-and-forget email notification; do not block redirect.
    (async () => {
      let attempt = null;
      try {
        if (oid && oid !== "unknown") {
          attempt = await prisma.paymentAttempt.findUnique({ where: { oid } });
          await prisma.paymentAttempt.update({ where: { oid }, data: { status: "fail" } });
        }
      } catch (e) {
        console.error("[payments/fail] paymentAttempt lookup/update failed", e?.message || e);
      }
      notifyPaymentByEmail({
        kind: "FAIL",
        payload: { ...p, attempt },
        redirectTarget: target,
        mailer,
        to: ADMIN_EMAIL_TO,
      });
    })();

    return res.redirect(302, target);
  } catch (err) {
    console.error("[payments/fail] error", err);
    const target = `${FRONT_FAIL}${FRONT_FAIL.includes("?") ? "&" : "?"}oid=unknown&msg=Payment failed`;

    // Best-effort email about handler crash.
    notifyPaymentByEmail({
      kind: "FAIL_HANDLER_ERROR",
      payload: { error: String(err) },
      redirectTarget: target,
      mailer,
      to: ADMIN_EMAIL_TO,
    });

    return res.redirect(302, target);
  }
});

app.use("/api/payments", r);

// ---------- CONTACT ----------
import contactRouter from "./routes/contact.js";
app.use("/api/contact", apiCors, contactRouter);

// ---------- AVAILABILITY ----------
import availabilityRouter from "./routes/availability.js";
app.use("/api/availability", apiCors, availabilityRouter);

// ---------- CHANNELS ----------
import channelsRouter from "./routes/channels.js";
app.use("/api/channels", apiCors, channelsRouter);

// ---------- ADMIN ----------
import adminRouter from "./routes/admin.js";
app.use("/api/admin", apiCors, adminRouter);

// ---------- START ----------
const PORT = process.env.PORT || 4000;
app.listen(PORT, "0.0.0.0", () => console.log("API up on", PORT));
