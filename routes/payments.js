import crypto from "crypto";
import { Router } from "express";
import { prisma } from "../db.js";

const r = Router();

function bktHash({ clientId, oid, amount, okUrl, failUrl, rnd, storeKey }) {
  // Payten est: SHA1(clientId + oid + amount + okUrl + failUrl + rnd + storeKey) -> Base64
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

    // Regjistro rezervimin si pending
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
        amount: Number(amount),
        status: "pending",
      },
    });

    // Fushat për 3D_PAY_HOSTING
    const oid = booking.id.toString().padStart(18, "0"); // unik
    const rnd = crypto.randomBytes(8).toString("hex");
    const currency = "978";           // EUR
    const storetype = "3D_PAY_HOSTING";
    const lang = "sq";                // ose "en"
    const TranType = "Auth";
    const instalment = "";            // bosh kur s'ka këste

    // Hash sipas Payten (varianti i thjeshtë funksional)
    const hash = bktHash({ clientId, oid, amount: Number(amount).toFixed(2), okUrl, failUrl, rnd, storeKey });

    const fields = {
      clientid: clientId,
      amount: Number(amount).toFixed(2),
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
      // Opsionale të dobishme:
      BillToName: meta.customer?.firstName
        ? `${meta.customer.firstName} ${meta.customer?.lastName || ""}`.trim()
        : undefined,
      BillToTel: meta.customer?.phone || undefined,
      BillToEmail: email,
      description: `Holiday Villas • ${meta.villaName || meta.villa || ""}`.trim(),
    };

    // Kthe JSON që front-i ta POST-ojë te BKT
    res.json({ gate, fields });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "payment init failed" });
  }
});

// BKT do të rikthejë te këto URL; bëj redirect në frontend për UX
r.post("/ok", async (req, res) => {
  try {
    const { FRONT_OK } = process.env;
    const oid = (req.body?.oid || "").toString();
    // shëno si paid në DB nëse dëshiron verifikim minimal
    if (oid) {
      const bookingId = Number(oid);
      if (!Number.isNaN(bookingId)) {
        await prisma.booking.update({ where: { id: bookingId }, data: { status: "paid" } });
      }
    }
    return res.redirect(`${process.env.FRONT_OK}?oid=${encodeURIComponent(oid)}`);
  } catch {
    return res.redirect(process.env.FRONT_OK || "/");
  }
});

r.post("/fail", async (req, res) => {
  try {
    const { FRONT_FAIL } = process.env;
    const oid = (req.body?.oid || "").toString();
    const msg = (req.body?.ErrMsg || req.body?.errmsg || req.body?.Response || "Payment failed").toString();
    return res.redirect(`${FRONT_FAIL}?oid=${encodeURIComponent(oid)}&msg=${encodeURIComponent(msg)}`);
  } catch {
    return res.redirect(process.env.FRONT_FAIL || "/");
  }
});

export default r;
