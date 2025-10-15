
import { Router } from "express";
import crypto from "crypto";
const r = Router();

// BKT 3D Pay merchant info
const CLIENT_ID = "530061270";
const STORE_KEY = "SKEY3319";
const GATE_URL = "https://pgw.bkt-ks.com/fim/est3Dgate";
const OK_URL = "https://holidayvillasbackend.onrender.com/api/payments/ok";
const FAIL_URL = "https://holidayvillasbackend.onrender.com/api/payments/fail";

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

// Frontend redirect URLs
const FRONT_OK   = "https://holidayvillasks.com/#/payment/success";
const FRONT_FAIL = "https://holidayvillasks.com/#/payment/fail";

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
