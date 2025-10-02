// server.js
import express from "express";
import crypto from "crypto";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

/* -------- Utils -------- */
function requireEnv(key) {
  const val = process.env[key];
  if (!val) {
    console.error(`❌ Missing env: ${key}`);
    throw new Error(`Missing env: ${key}`);
  }
  return val;
}
function b64sha512(s) {
  return crypto.createHash("sha512").update(s, "utf8").digest("base64");
}

/* -------- ENV -------- */
const ENV = {
  CLIENT_ID: requireEnv("NESTPAY_CLIENT_ID"),
  STORE_KEY: requireEnv("NESTPAY_STORE_KEY"),
  GATEWAY: requireEnv("NESTPAY_GATEWAY"),
  BASE_URL: requireEnv("BASE_URL"), // p.sh. https://holidayvillasks.com
  CURRENCY: requireEnv("CURRENCY"),
  LANG: process.env.LANG || "EN",
  CORS_ORIGIN: process.env.CORS_ORIGIN || "*",
};

console.log("✅ ENV loaded:", {
  CLIENT_ID: ENV.CLIENT_ID,
  GATEWAY: ENV.GATEWAY,
  BASE_URL: ENV.BASE_URL,
  CURRENCY: ENV.CURRENCY,
  LANG: ENV.LANG,
  CORS_ORIGIN: ENV.CORS_ORIGIN,
});

/* -------- App -------- */
const app = express();
app.set("trust proxy", 1);                 // pas Nginx-it
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors({ origin: ENV.CORS_ORIGIN }));

// Healthcheck
app.get("/health", (_req, res) => res.json({ ok: true }));

/* -------- Helpers (3D_Pay_Hosting) -------- */
function buildFields({ amount, oid, okUrl, failUrl, rnd, email }) {
  return {
    clientid: ENV.CLIENT_ID,
    storetype: "3D_Pay_Hosting",
    trantype: "Auth",
    amount: Number(amount).toFixed(2),
    oid,
    okUrl,
    failUrl,
    currency: ENV.CURRENCY, // 978 = EUR
    lang: ENV.LANG,
    email: email || "",
    rnd,
    encoding: "UTF-8",
    hashAlgorithm: "ver3",
    HASHVERSION: "v3",
  };
}
function buildHashV3(f) {
  const plain = f.clientid + f.oid + f.amount + f.okUrl + f.failUrl + f.rnd + ENV.STORE_KEY;
  return b64sha512(plain);
}

/* -------- Routes -------- */
// INIT → kthen formë auto-submit drejt gateway-t
app.post("/api/payments/init", async (req, res) => {
  try {
    const { amount, email } = req.body || {};
    if (!amount) return res.status(400).json({ error: "amount required" });

    const now = Date.now();
    const oid = `HV-${now}`;
    const rnd = String(now);

    const okUrl = `${ENV.BASE_URL}/pay/ok`;
    const failUrl = `${ENV.BASE_URL}/pay/fail`;

    const fields = buildFields({ amount, oid, okUrl, failUrl, rnd, email });
    const hash = buildHashV3(fields);
    const action = ENV.GATEWAY;

    const htmlInputs = Object.entries({ ...fields, hash })
      .map(([k, v]) => `<input type="hidden" name="${k}" value="${String(v).replace(/"/g, "&quot;")}" />`)
      .join("\n");

    res.send(`<!doctype html>
<html><body onload="document.forms[0].submit()" style="font-family:system-ui">
  <form method="post" action="${action}">
    ${htmlInputs}
    <noscript><button type="submit">Proceed to Payment</button></noscript>
  </form>
</body></html>`);
  } catch (e) {
    console.error("INIT error:", e);
    res.status(500).json({ error: e.message });
  }
});

// OK callback (verifikim HASH sipas HASHPARAMS + 3D + Approved)
app.post("/pay/ok", express.urlencoded({ extended: true }), (req, res) => {
  const p = req.body || {};
  const order = (p.HASHPARAMS || "").split(":").filter(Boolean);
  let concat = "";
  for (const name of order) concat += (p[name] ?? "");
  const localHash = b64sha512(concat + ENV.STORE_KEY);

  const hashOk = localHash === p.HASH;
  const approved = p.Response === "Approved";
  const mdOk = ["1", "2", "3", "4"].includes(String(p.mdStatus));
  const success = hashOk && approved && mdOk && String(p.ProcReturnCode) === "00";

  if (success) {
    return res.send(`<!doctype html>
<html><body style="font-family:system-ui;padding:40px">
  <h2>✅ Pagesa u konfirmua</h2>
  <p><b>Order ID:</b> ${p.oid}</p>
  <p><b>AuthCode:</b> ${p.AuthCode || "-"}</p>
  <p><b>TransId:</b> ${p.TransId || "-"}</p>
  <p><b>Amount:</b> ${p.amount || "-"}</p>
  <p><b>Currency:</b> ${p.currency || "-"}</p>
</body></html>`);
  }

  return res.status(400).send(`<!doctype html>
<html><body style="font-family:system-ui;padding:40px">
  <h2>⚠️ Dështim verifikimi ose refuzim</h2>
  <pre style="white-space:pre-wrap;background:#f6f7f8;padding:12px;border-radius:8px">
Response        = ${p.Response}
mdStatus        = ${p.mdStatus}
ProcReturnCode  = ${p.ProcReturnCode}
HASH verified   = ${hashOk}
  </pre>
</body></html>`);
});

// FAIL callback (refuzime / gabime)
app.post("/pay/fail", express.urlencoded({ extended: true }), (req, res) => {
  const p = req.body || {};
  console.log("---- CALLBACK /pay/fail ----");
  console.log(p);

  return res.status(200).send(`<!doctype html>
<html><body style="font-family:system-ui;padding:40px">
  <h2 style="margin:0 0 12px 0">❌ Pagesa u refuzua</h2>
  <p>Ju lutem provoni përsëri ose përdorni një kartë tjetër.</p>
  <h3 style="margin-top:16px">DEBUG</h3>
  <ul>
    <li><b>Response:</b> ${p.Response || "-"}</li>
    <li><b>mdStatus:</b> ${p.mdStatus || "-"}</li>
    <li><b>ProcReturnCode:</b> ${p.ProcReturnCode || "-"}</li>
    <li><b>ErrMsg:</b> ${p.ErrMsg || "-"}</li>
  </ul>
  <pre style="white-space:pre-wrap;background:#f6f7f8;padding:12px;border-radius:8px">${JSON.stringify(p, null, 2)}</pre>
</body></html>`);
});

/* -------- Test page -------- */
const PORT = process.env.PORT || 4000;
app.get("/testpay", (_req, res) => {
  res.send(`<!doctype html>
<html>
  <body style="font-family:system-ui;padding:24px;max-width:520px;margin:auto">
    <h2>BKT Stage — Test Payment</h2>
    <form method="post" action="/api/payments/init" style="display:grid;gap:12px">
      <label>Shuma (€)
        <input name="amount" value="1.23" />
      </label>
      <label>Email (opsional)
        <input name="email" value="test@example.com" />
      </label>
      <button type="submit" style="padding:10px 14px">Paguaj</button>
    </form>
    <p style="margin-top:10px;font-size:12px;color:#555">
      Përdor kartën e testit: 4090700100360047 — 12/30 — 000
    </p>
  </body>
</html>`);
});

app.listen(PORT, () => console.log("Payments server on :" + PORT));
