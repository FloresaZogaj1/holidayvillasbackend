import { Router } from "express";
import { prisma } from "../db.js";

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
    res.json({ ok: true, booking });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

r.get("/", async (_req, res) => {
  const list = await prisma.booking.findMany({ orderBy: { id: "desc" }, take: 100 });
  res.json({ ok: true, list });
});

export default r;
