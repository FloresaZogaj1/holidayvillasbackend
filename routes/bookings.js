import { Router } from "express";
import { prisma } from "../db.js";
import nodemailer from "nodemailer";

const r = Router();

r.post("/", async (req, res) => {
  try {
    // Temporary block: disallow new bookings until 2026-01-05
    const blockUntil = new Date("2026-01-05T00:00:00.000Z");
    const now = new Date();
    if (now < blockUntil) {
      return res.status(403).json({ ok: false, error: "Rezervimet janë të mbyllura deri më 5 Janar 2026." });
    }
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
    // Dërgo email njoftimi për rezervim (minimal, pa prekur pjesë të tjera)
    try {
      const transporter = nodemailer.createTransport({
        service: "gmail",
        auth: {
          user: process.env.EMAIL_USER || "holidayvillas.ks@gmail.com",
          pass: process.env.EMAIL_PASS,
        },
      });

      const toEmail = "hollidayvillas.ks@gmail.com"; // destinacioni sipas kërkesës
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
      const clientSubject = `Rezervimi juaj u pranua - ${villaSlug}`;
      const clientHTML = `
        <h2>Përshëndetje ${name},</h2>
        <p>Faleminderit për rezervimin tuaj në <strong>Holiday Villas</strong>. Rezervimi u regjistrua me sukses.</p>
        <p>Brenda pak kohe, dikush nga stafi ynë do t'ju kontaktojë për detaje të mëtejshme.</p>
        <h3>Detajet e rezervimit</h3>
        <p><strong>Villa:</strong> ${villaSlug}</p>
        <p><strong>Check In:</strong> ${new Date(from).toLocaleString("sq-AL")}</p>
        <p><strong>Check Out:</strong> ${new Date(to).toLocaleString("sq-AL")}</p>
        <p><strong>Mysafirë:</strong> ${guests}</p>
        <p><strong>Shuma totale:</strong> €${Number(amount).toFixed(2)}</p>
        <hr/>
        <p>Nëse keni pyetje, mund të përgjigjeni direkt në këtë email.</p>
        <p>— Holiday Villas</p>
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

// Endpoint to check if bookings are currently allowed
r.get("/available", (_req, res) => {
  const blockUntil = new Date("2026-01-05T00:00:00.000Z");
  const now = new Date();
  if (now < blockUntil) {
    return res.status(200).json({ ok: false, error: "Rezervimet janë të mbyllura deri më 5 Janar 2026." });
  }
  res.json({ ok: true });
});

r.get("/", async (_req, res) => {
  const list = await prisma.booking.findMany({ orderBy: { id: "desc" }, take: 100 });
  res.json({ ok: true, list });
});

export default r;
