// backend/routes/payments.js
import crypto from "crypto";
import { Router } from "express";
import { prisma } from "../db.js";

const r = Router();

// Payten EST hash: Base64(SHA1(clientid + oid + amount + okUrl + failUrl + rnd + storekey))
function bktHash({ clientId, oid, amount, okUrl, failUrl, rnd, storeKey }) {
  const plain = `${clientId}${oid}${amount}${okUrl}${failUrl}${rnd}${storeKey}`;
  const sha1 = crypto.createHash("sha1").update(plain, "utf8").digest();
  return Buffer.from(sha1).toString("base64");
}

r.post("/init", async (req, res) => {
  try {
    const {
      BKT_CLIENT_ID: clientId,
      BKT_STORE_KEY: storeKey,
      BKT_3D_GATE: gate,
      BKT_OK_URL: okUrl,
      BKT_FAIL_URL: failUrl,
    } = process.env;

    const { amount, email, meta = {} } = req.body || {};
    if (!amount || !email) return res.status(400).json({ error: "amount dhe email kërkohen" });

    const amountStr = Number(amount).toFixed(2);
    if (!/^\d+\.\d{2}$/.test(amountStr)) return res.status(400).json({ error: "amount i pavlefshëm" });

    // Krijo booking pending
    const booking = await prisma.booking.create({
      data: {
        villaSlug: meta.villa || "unknown",
        name: meta.customer?.firstName
          ? `${meta.customer.firstName} ${meta.customer?.lastName || ""}`.trim()
          : (email.split("@")[0] || "Guest"),
        email,
        phone: meta.customer?.phone || null,
        checkIn: meta.from ? new Date(meta.from) : null,
        checkOut: meta.to ? new Date(meta.to) : null,
        guests: Number(meta.guests || 1),
        amount: Number(amountStr),
        status: "pending",
      },
    });

    // EST fushat
    const oid = String(booking.id).padStart(18, "0");
    const rnd = crypto.randomBytes(8).toString("hex");
    const currency = "978";           // EUR
    const storetype = "3D_PAY_HOSTING";
    const lang = "sq";
    const TranType = "Auth";
    const instalment = "";

    const hash = bktHash({
      clientId,
      oid,
      amount: amountStr,
      okUrl,
      failUrl,
      rnd,
      storeKey,
    });

    // Mos përfshi kurrë cvv2/pan/exp në HOSTING
    const fields = {
      clientid: clientId,
      amount: amountStr,
      oid,
      okUrl,
      failUrl,
      rnd,
      hash,
      storetype,
      currency,
      lang,
      email,
      TranType,
      instalment,
      BillToName: meta.customer?.firstName
        ? `${meta.customer.firstName} ${meta.customer?.lastName || ""}`.trim()
        : undefined,
      BillToTel: meta.customer?.phone || undefined,
      BillToEmail: email,
      description: `Holiday Villas • ${meta.villaName || meta.villa || ""}`.trim(),
    };

    // Kthe JSON për auto-POST në bankë
    return res.json({ gate, fields });
  } catch (e) {
    console.error("payments/init error:", e);
    return res.status(500).json({ error: "payment init failed" });
  }
});

// OK callback
r.post("/ok", async (req, res) => {
  try {
    const { FRONT_OK } = process.env;
    const oidStr = (req.body?.oid || "").toString().replace(/^0+/, "");
    const bookingId = Number(oidStr);
    if (!Number.isNaN(bookingId)) {
      await prisma.booking.update({ where: { id: bookingId }, data: { status: "paid" } });
    }
    return res.redirect(`${process.env.FRONT_OK}?oid=${encodeURIComponent(req.body?.oid || "")}`);
  } catch (e) {
    console.error("payments/ok error:", e);
    return res.redirect(process.env.FRONT_OK || "/");
  }
});

// FAIL callback
r.post("/fail", async (req, res) => {
  try {
    const { FRONT_FAIL } = process.env;
    const oid = (req.body?.oid || "").toString();
    const msg =
      (req.body?.ErrMsg || req.body?.errmsg || req.body?.Response || "Payment failed").toString();
    return res.redirect(`${FRONT_FAIL}?oid=${encodeURIComponent(oid)}&msg=${encodeURIComponent(msg)}`);
  } catch (e) {
    console.error("payments/fail error:", e);
    return res.redirect(process.env.FRONT_FAIL || "/");
  }
});

export default r;
