// backend/routes/payments.js
import crypto from "crypto";
import { Router } from "express";

const r = Router();

// === helpers ===
function formatAmount(n) {
  // gjithmonë p.sh. 100.00
  return Number(n).toFixed(2);
}

function sha1Base64(s) {
  const d = crypto.createHash("sha1").update(s, "utf8").digest();
  return Buffer.from(d).toString("base64");
}

r.post("/payments/init", async (req, res) => {
  try {
    const {
      BKT_CLIENT_ID: clientid,          // p.sh. 530061270
      BKT_STORE_KEY: storekey,          // p.sh. SKEY3319
      BKT_3D_GATE: gate,                // https://pgw.bkt-ks.com/fim/est3Dgate
      BKT_OK_URL: OK_URL_BACK,          // p.sh. https://<backend>/api/payments/ok
      BKT_FAIL_URL: FAIL_URL_BACK,      // p.sh. https://<backend>/api/payments/fail
    } = process.env;

    // input nga fronti
    const { amount, email, meta = {} } = req.body || {};

    // vlera bazë
    const oid = crypto.randomUUID().replace(/-/g, "").slice(0, 20); // max 20
    const rnd = crypto.randomBytes(16).toString("hex");
    const formattedAmount = formatAmount(amount ?? 0);

    // TranType dhe Installment sipas kërkesës së bankës
    const TranType = "Auth";
    const Installment = ""; // bosh sipas emailit të bankës

    // Këto URL DUHET të jenë fiks si në hash
    const okUrl = OK_URL_BACK;
    const failUrl = FAIL_URL_BACK;

    // rendi i ver3
    const plain =
      clientid +
      oid +
      formattedAmount +
      okUrl +
      failUrl +
      TranType +
      Installment +
      rnd +
      storekey;

    const hash = sha1Base64(plain);

    // fushat që do dërgohen në gateway (duhet të përputhen 1:1 me hash)
    const fields = {
      clientid,            // kërkohet lower-case
      oid,                 // order id
      amount: formattedAmount,
      okUrl: okUrl,
      failUrl: failUrl,
      TranType,            // "Auth"
      Installment,         // bosh
      rnd,                 // random
      storetype: "3D_PAY_HOSTING",
      currency: "978",     // EUR
      lang: "en",
      email: email || "",
      BillToName: `${meta.firstName || ""} ${meta.lastName || ""}`.trim(),
      // ver3
      HashAlgorithm: "ver3",
      hash,                // Base64(SHA1(...))
    };

    // Ktheja frontit që të bëjë POST në gate me këto fusha
    return res.json({ gate, fields, oid });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "init_failed" });
  }
});

export default r;
