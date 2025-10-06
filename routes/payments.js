import express from "express";
import { Router } from "express";
import { prisma } from "../db.js";

const r = Router();

/**
 * /api/payments/init
 * Pret: { amount, email, meta: { villa, from, to, nights, guests, name?, phone? } }
 * Kthen: HTML (simulim banke) që auto-redirect në /api/payments/mark-paid
 */
r.post("/init", async (req, res) => {
  try {
    const { amount, email, meta } = req.body || {};
    const { villa, from, to, nights, guests, name, phone } = meta || {};

    const booking = await prisma.booking.create({
      data: {
        villaSlug: villa || "unknown",
        name: name || email?.split("@")[0] || "Guest",
        email,
        phone: phone || null,
        checkIn: new Date(from),
        checkOut: new Date(to),
        guests: Number(guests || 1),
        amount: Number(amount || 0),
        status: "pending"
      }
    });

    const html = `<!doctype html>
<html lang="sq">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>HolidayVillas • Pagesa</title>
<style>
  body { font-family: ui-sans-serif, system-ui; background:#0f1412; color:#e6ede7; padding:24px; }
  .card { max-width:560px; margin:32px auto; background:#121a16; border:1px solid #243026; border-radius:16px; padding:24px; }
  .btn { display:inline-block; padding:12px 18px; border-radius:12px; border:1px solid #2e3a30; background:#afd185; color:#0d0f0e; font-weight:600; text-decoration:none; }
  .muted { color:#a7b3aa }
  .row { display:flex; justify-content:space-between; margin:8px 0; }
</style>
</head>
<body>
  <div class="card">
    <h2>Konfirmo Pagesën</h2>
    <p class="muted">Kjo është faqe simulimi e bankës. Pas klikimit, rezervimi shënohet si <strong>paid</strong>.</p>
    <div class="row"><span>Vila</span><strong>${villa || "-"}</strong></div>
    <div class="row"><span>Datat</span><strong>${from || "?"} → ${to || "?"} (${nights || "?"} net)</strong></div>
    <div class="row"><span>Mysafirë</span><strong>${guests || 1}</strong></div>
    <div class="row"><span>E-mail</span><strong>${email || "-"}</strong></div>
    <div class="row"><span>Shuma</span><strong>€ ${Number(amount || 0).toFixed(2)}</strong></div>

    <form method="POST" action="/api/payments/mark-paid" style="margin-top:16px">
      <input type="hidden" name="bookingId" value="${booking.id}" />
      <button class="btn" type="submit">Paguaj (Simulim)</button>
    </form>

    <p class="muted" style="margin-top:16px">Auto-konfirmim pas 1 sekonde…</p>
  </div>
  <script>
    setTimeout(() => { const f=document.forms[0]; if(f){ f.submit(); } }, 1000);
  </script>
</body>
</html>`;

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.status(200).send(html);
  } catch (e) {
    res.status(500).send(`<pre>${e.message}</pre>`);
  }
});

r.post("/mark-paid", express.urlencoded({ extended: true }), async (req, res) => {
  const bookingId = Number(req.body?.bookingId);
  if (!bookingId) return res.status(400).send("bookingId mungon");
  await prisma.booking.update({ where: { id: bookingId }, data: { status: "paid" } });

  const html = `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1" />
<title>Pagesa u krye</title>
<style>body{font-family:ui-sans-serif,system-ui;background:#0f1412;color:#e6ede7;padding:24px} .card{max-width:560px;margin:32px auto;background:#121a16;border:1px solid #243026;border-radius:16px;padding:24px} .btn{display:inline-block;padding:10px 16px;border-radius:12px;border:1px solid #2e3a30;background:#afd185;color:#0d0f0e;font-weight:600;text-decoration:none}</style>
</head><body>
<div class="card">
  <h2>✅ Pagesa u krye me sukses</h2>
  <p>Rezervimi #${bookingId} u shënua si <strong>paid</strong>.</p>
  <a class="btn" href="/">Kthehu te faqja kryesore</a>
</div>
</body></html>`;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.status(200).send(html);
});

export default r;
