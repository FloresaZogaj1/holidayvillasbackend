// backend/routes/payments.js
import express, { Router } from "express";
import crypto from "crypto";

const r = Router();
const urlencoded = express.urlencoded({ extended: false });

// ---------- ENV ----------
const {
  BKT_CLIENT_ID: CLIENT_ID,
  BKT_STORE_KEY: STORE_KEY,
  BKT_3D_GATE: GATE,
  BKT_OK_URL: OK_BACK,
  BKT_FAIL_URL: FAIL_BACK,
  FRONT_OK,
  FRONT_FAIL,
} = process.env;

// ---------- HELPERS ----------
const fixed2   = (n) => Number(n).toFixed(2);
const sha1b64  = (s) => Buffer.from(crypto.createHash("sha1").update(s, "utf8").digest()).toString("base64");
const trimSlash= (u) => (u || "").replace(/\/+$/,"");

// ---------- INIT ----------
r.post("/payments/init", async (req, res) => {
  try {
    const { amount, email = "", meta = {} } = req.body || {};
    if (!amount) return res.status(400).json({ error: "amount_required" });

    const oid   = crypto.randomUUID().replace(/-/g, "").slice(0, 20);
    const rnd   = crypto.randomBytes(16).toString("hex");
    const amt   = fixed2(amount);
    const okUrl = trimSlash(OK_BACK);
    const failUrl = trimSlash(FAIL_BACK);
    const TranType = "Auth";
    const Installment = "";

    const plain = CLIENT_ID + oid + amt + okUrl + failUrl + TranType + Installment + rnd + STORE_KEY;
    const hash  = sha1b64(plain);

    // --- DEBUG LOGGING ---
    console.log("Hash Debug:");
    console.log("clientid:", CLIENT_ID);
    console.log("oid:", oid);
    console.log("amount:", amt);
    console.log("okUrl:", okUrl);
    console.log("failUrl:", failUrl);
    console.log("TranType:", TranType);
    console.log("Installment:", Installment);
    console.log("rnd:", rnd);
    console.log("storekey:", STORE_KEY);
    console.log("plain string for hash:", plain);
    console.log("hash:", hash);
    const fields = {
      clientid: CLIENT_ID,
      oid,
      amount: amt,
      okUrl,
      failUrl,
      TranType,
      Installment,
      rnd,
      storetype: "3D_PAY_HOSTING",
      currency: "978",
      lang: "en",
      email,
      BillToName: `${meta.firstName || ""} ${meta.lastName || ""}`.trim(),
      HashAlgorithm: "ver3",
      hash,
    };
    console.log("fields sent:", fields);

    return res.json({ gate: GATE, fields, oid });
  } catch (e) {
    console.error("init_failed", e);
    return res.status(500).json({ error: "init_failed" });
  }
});

// ---------- OK (POST + GET) ----------
r.post("/payments/ok", urlencoded, (req, res) => {
  const { oid = "", Response = "", mdStatus = "" } = req.body || {};
  const to = new URL(trimSlash(FRONT_OK));
  if (oid) to.searchParams.set("oid", oid);
  if (Response) to.searchParams.set("resp", Response);
  if (mdStatus) to.searchParams.set("md", mdStatus);
  return res.redirect(303, to.toString());
});

r.get("/payments/ok", (req, res) => {
  // nëse dikush e hap direkt në browser
  const to = new URL(trimSlash(FRONT_OK));
  if (req.query.oid) to.searchParams.set("oid", String(req.query.oid));
  return res.redirect(303, to.toString());
});

// ---------- FAIL (POST + GET) ----------
r.post("/payments/fail", urlencoded, (req, res) => {
  const { oid = "", ErrMsg = "Payment failed", Response = "" } = req.body || {};
  const to = new URL(trimSlash(FRONT_FAIL));
  if (oid) to.searchParams.set("oid", oid);
  to.searchParams.set("msg", ErrMsg || Response || "Payment failed");
  return res.redirect(303, to.toString());
});

r.get("/payments/fail", (req, res) => {
  // nëse bankë/tester bën GET ose e hap drejtpërdrejt
  const to = new URL(trimSlash(FRONT_FAIL));
  if (req.query.oid) to.searchParams.set("oid", String(req.query.oid));
  to.searchParams.set("msg", String(req.query.msg || "Payment failed"));
  return res.redirect(303, to.toString());
});

export default r;
