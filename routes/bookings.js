import { Router } from "express";
import { prisma } from "../db.js";
import nodemailer from "nodemailer";

const r = Router();

r.post("/", async (req, res) => {
  try {
    const { villaSlug, name, email, phone, from, to, guests, amount } = req.body;
    if (!villaSlug || !name || !email || !from || !to || !guests || !amount) {
      return res.status(400).json({ ok: false, error: "Fusha të pavlefshme" });
    }
    const booking = await prisma.booking.create({
      data: {
        villaSlug,
        name,
        email,
        phone: phone || null,
        checkIn: new Date(from),
        checkOut: new Date(to),
        guests: Number(guests),
        amount: Number(amount),
        status: "pending"
      }
    });
  // Legacy: This route sends emails via Gmail SMTP (often blocked on Render).
  // We now email admins via Resend on /api/payments/ok and /api/payments/fail.
    try {
      console.log({user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS ? "****" : undefined});
      const transporter = nodemailer.createTransport({
        service: "gmail",
        auth: {
          user: process.env.EMAIL_USER || "holidayvillas.ks@gmail.com",
          pass: process.env.EMAIL_PASS,
        },
      });

  const toEmail = "holidayvillas.ks@gmail.com"; // destinacioni sipas kërkesës
      const subject = `[Holiday Villas] Rezervim i ri për ${villaSlug}`;
      const html = `
        <h2>Rezervim i ri</h2>
        <p><strong>Emri:</strong> ${name}</p>
        <p><strong>Email:</strong> ${email}</p>
        <p><strong>Telefoni:</strong> ${phone || "-"}</p>
        <p><strong>Villa:</strong> ${villaSlug}</p>
        <p><strong>Check In:</strong> ${new Date(from).toLocaleString("sq-AL")}</p>
        <p><strong>Check Out:</strong> ${new Date(to).toLocaleString("sq-AL")}</p>
        <p><strong>Mysafirë:</strong> ${guests}</p>
        <p><strong>Shuma:</strong> €${Number(amount).toFixed(2)}</p>
        <hr/>
        <p>Statusi: pending</p>
      `;

      await transporter.sendMail({
        from: process.env.EMAIL_USER || "holidayvillas.ks@gmail.com",
        to: toEmail,
        subject,
        html,
        replyTo: email,
      });

      // Dërgo email konfirmimi edhe te klienti
      const SUPPORT_PHONE = process.env.SUPPORT_PHONE || "048 512 512";
      const checkInStr = new Date(from).toLocaleDateString("sq-AL");
      const checkOutStr = new Date(to).toLocaleDateString("sq-AL");
      const amountStr = `€${Number(amount).toFixed(2)}`;

      const clientSubject = `Konfirmim rezervimi · Holiday Villas`;
      const clientHTML = `
        <div style="font-family:Arial,Helvetica,sans-serif;max-width:640px;margin:0 auto;line-height:1.55;color:#111">
          <div style="padding:18px 20px;border:1px solid #eee;border-radius:12px">
            <h2 style="margin:0 0 10px 0;font-size:20px">Rezervimi juaj në Holiday Villas u kry me sukses</h2>
            <p style="margin:0 0 14px 0">Përshëndetje <strong>${name}</strong>,</p>
            <p style="margin:0 0 14px 0">
              Faleminderit që zgjodhët <strong>Holiday Villas</strong>. Konfirmojmë se rezervimi juaj është regjistruar me sukses.
            </p>

            <div style="background:#f7f7f8;border:1px solid #eee;border-radius:10px;padding:14px 16px;margin:14px 0">
              <h3 style="margin:0 0 10px 0;font-size:16px">Detajet e rezervimit</h3>
              <table style="width:100%;border-collapse:collapse;font-size:14px">
                <tr>
                  <td style="padding:6px 0;color:#555;width:160px">Villa</td>
                  <td style="padding:6px 0"><strong>${villaSlug}</strong></td>
                </tr>
                <tr>
                  <td style="padding:6px 0;color:#555">Check-in</td>
                  <td style="padding:6px 0">${checkInStr}</td>
                </tr>
                <tr>
                  <td style="padding:6px 0;color:#555">Check-out</td>
                  <td style="padding:6px 0">${checkOutStr}</td>
                </tr>
                <tr>
                  <td style="padding:6px 0;color:#555">Mysafirë</td>
                  <td style="padding:6px 0">${Number(guests)}</td>
                </tr>
                <tr>
                  <td style="padding:6px 0;color:#555">Shuma totale</td>
                  <td style="padding:6px 0"><strong>${amountStr}</strong></td>
                </tr>
              </table>
            </div>

            <p style="margin:0 0 12px 0">
              Për më shumë informata, ose nëse keni ndonjë pyetje, na kontaktoni në: <strong>${SUPPORT_PHONE}</strong>.
            </p>
            <p style="margin:0">Me respekt,<br/><strong>Holiday Villas</strong></p>
          </div>

          <p style="margin:10px 2px 0 2px;font-size:12px;color:#666">
            Ky është email automatik. Nëse ky rezervim nuk është bërë nga ju, ju lutem na kontaktoni.
          </p>
        </div>
      `;

      await transporter.sendMail({
        from: process.env.EMAIL_USER || "holidayvillas.ks@gmail.com",
        to: email,
        subject: clientSubject,
        html: clientHTML,
        replyTo: process.env.EMAIL_USER || "holidayvillas.ks@gmail.com",
      });
    } catch (mailErr) {
      // Mos e prish përgjigjen për klientin nëse email dështon
      console.error("Booking email error:", mailErr?.message || mailErr);
    }
    res.json({ ok: true, booking });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// (Temporary /available endpoint removed)

r.get("/", async (_req, res) => {
  const list = await prisma.booking.findMany({ orderBy: { id: "desc" }, take: 100 });
  res.json({ ok: true, list });
});

export default r;
