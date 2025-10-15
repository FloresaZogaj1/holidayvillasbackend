import crypto from "crypto";

const CLIENT_ID = process.env.BKT_CLIENT_ID;
const STORE_KEY = process.env.BKT_STORE_KEY;
const GATE_URL = process.env.BKT_3D_GATE;
const OK_URL = process.env.BKT_OK_URL;
const FAIL_URL = process.env.BKT_FAIL_URL;

r.post("/init", async (req, res) => {
  try {
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
// backend/routes/payments.js
import { Router } from "express";
const r = Router();

// routes/payments.js
const FRONT_OK   = process.env.FRONT_OK   || "https://holidayvillasks.com/#/payment/success";
const FRONT_FAIL = process.env.FRONT_FAIL || "https://holidayvillasks.com/#/payment/fail";

r.get("/ok", (req, res) => {
  const oid = req.query?.oid || req.query?.OrderId || "";
  const target = `${FRONT_OK}${FRONT_OK.includes("?") ? "&" : "?"}oid=${encodeURIComponent(oid)}`;
  return res.redirect(302, target);
});

r.get("/fail", (req, res) => {
  const oid = req.query?.oid || req.query?.OrderId || "";
  const msg = req.query?.msg || req.query?.ErrMsg || req.query?.Response || "Payment failed";
  const target = `${FRONT_FAIL}${FRONT_FAIL.includes("?") ? "&" : "?"}oid=${encodeURIComponent(oid)}&msg=${encodeURIComponent(msg)}`;
  return res.redirect(302, target);
});


export default r;
