import express from "express";
const router = express.Router();
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

// --- Get all villas ---
router.get('/villas', async (req, res) => {
  try {
    const villas = await prisma.villa.findMany();
    res.json(villas);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch villas' });
  }
});

// --- Create a new villa ---
router.post('/villas', async (req, res) => {
  try {
    const { name, slug, type, price } = req.body;
    const villa = await prisma.villa.create({
      data: { name, slug, type, price }
    });
    res.json(villa);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create villa' });
  }
});

// --- Update a villa ---
router.put('/villas/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { name, slug, type, price } = req.body;
    const villa = await prisma.villa.update({
      where: { id },
      data: { name, slug, type, price }
    });
    res.json(villa);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update villa' });
  }
});

// --- Delete a villa ---
router.delete('/villas/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    await prisma.villa.delete({ where: { id } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete villa' });
  }
});

export default router;