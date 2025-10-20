import express from "express";
import { PrismaClient } from "@prisma/client";
const router = express.Router();
const prisma = new PrismaClient();

// --- Villa CRUD ---
router.get('/villas', async (req, res) => {
  const villas = await prisma.villa.findMany();
  res.json(villas);
});

router.post('/villas', async (req, res) => {
  const villa = await prisma.villa.create({ data: req.body });
  res.json(villa);
});

router.put('/villas/:id', async (req, res) => {
  const villa = await prisma.villa.update({
    where: { id: parseInt(req.params.id) },
    data: req.body,
  });
  res.json(villa);
});

router.delete('/villas/:id', async (req, res) => {
  await prisma.villa.delete({ where: { id: parseInt(req.params.id) } });
  res.json({ success: true });
});

// --- Booking CRUD ---
router.get('/bookings', async (req, res) => {
  const bookings = await prisma.booking.findMany();
  res.json(bookings);
});

router.delete('/bookings/:id', async (req, res) => {
  await prisma.booking.delete({ where: { id: parseInt(req.params.id) } });
  res.json({ success: true });
});

// --- User CRUD (admin only) ---
router.get('/users', async (req, res) => {
  const users = await prisma.user.findMany();
  res.json(users);
});

router.post('/users', async (req, res) => {
  const user = await prisma.user.create({ data: req.body });
  res.json(user);
});

router.delete('/users/:id', async (req, res) => {
  await prisma.user.delete({ where: { id: parseInt(req.params.id) } });
  res.json({ success: true });
});

export default router;
