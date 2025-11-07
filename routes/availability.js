import { Router } from "express";
import { prisma } from "../db.js";

const r = Router();

// Check villa availability for specific dates
r.post("/check-availability", async (req, res) => {
  try {
    const { villaSlug, checkIn, checkOut } = req.body;

    if (!villaSlug || !checkIn || !checkOut) {
      return res.status(400).json({ 
        ok: false, 
        error: "Vila, check-in dhe check-out janë të detyrueshme" 
      });
    }

    const startDate = new Date(checkIn);
    const endDate = new Date(checkOut);

    // Check if there are any conflicting bookings
    const conflictingBookings = await prisma.booking.findMany({
      where: {
        villaSlug: villaSlug,
        status: {
          in: ['confirmed', 'pending'] // Don't include cancelled bookings
        },
        OR: [
          // New booking starts during existing booking
          {
            AND: [
              { checkIn: { lte: startDate } },
              { checkOut: { gt: startDate } }
            ]
          },
          // New booking ends during existing booking  
          {
            AND: [
              { checkIn: { lt: endDate } },
              { checkOut: { gte: endDate } }
            ]
          },
          // New booking completely encompasses existing booking
          {
            AND: [
              { checkIn: { gte: startDate } },
              { checkOut: { lte: endDate } }
            ]
          },
          // Existing booking completely encompasses new booking
          {
            AND: [
              { checkIn: { lte: startDate } },
              { checkOut: { gte: endDate } }
            ]
          }
        ]
      }
    });

    const isAvailable = conflictingBookings.length === 0;

    res.json({ 
      ok: true, 
      available: isAvailable,
      conflictingBookings: conflictingBookings.length
    });

  } catch (error) {
    console.error('Availability check error:', error);
    res.status(500).json({ 
      ok: false, 
      error: "Gabim në kontrollin e disponueshmërisë" 
    });
  }
});

// Get available villas for date range
r.post("/available-villas", async (req, res) => {
  try {
    const { checkIn, checkOut, category } = req.body;

    // All possible villas
    const allVillas = [
      { slug: "vip-1", name: "VIP 1", category: "VIP" },
      { slug: "vip-2", name: "VIP 2", category: "VIP" },
      { slug: "vip-3", name: "VIP 3", category: "VIP" },
      { slug: "premium-1", name: "Premium 1", category: "Premium" },
      { slug: "premium-2", name: "Premium 2", category: "Premium" },
      { slug: "premium-3", name: "Premium 3", category: "Premium" }
    ];

    // Filter by category if provided
    let villas = allVillas;
    if (category && category !== "all") {
      villas = allVillas.filter(v => v.category === category);
    }

    // If no dates provided, return all villas
    if (!checkIn || !checkOut) {
      return res.json({ 
        ok: true, 
        availableVillas: villas
      });
    }

    const startDate = new Date(checkIn);
    const endDate = new Date(checkOut);

    // Check availability for each villa
    const availabilityChecks = await Promise.all(
      villas.map(async (villa) => {
        const conflictingBookings = await prisma.booking.findMany({
          where: {
            villaSlug: villa.slug,
            status: {
              in: ['confirmed', 'pending']
            },
            OR: [
              {
                AND: [
                  { checkIn: { lte: startDate } },
                  { checkOut: { gt: startDate } }
                ]
              },
              {
                AND: [
                  { checkIn: { lt: endDate } },
                  { checkOut: { gte: endDate } }
                ]
              },
              {
                AND: [
                  { checkIn: { gte: startDate } },
                  { checkOut: { lte: endDate } }
                ]
              },
              {
                AND: [
                  { checkIn: { lte: startDate } },
                  { checkOut: { gte: endDate } }
                ]
              }
            ]
          }
        });

        return {
          ...villa,
          available: conflictingBookings.length === 0
        };
      })
    );

    // Filter to only available villas
    const availableVillas = availabilityChecks.filter(v => v.available);

    res.json({ 
      ok: true, 
      availableVillas: availableVillas,
      totalChecked: villas.length,
      availableCount: availableVillas.length
    });

  } catch (error) {
    console.error('Available villas error:', error);
    res.status(500).json({ 
      ok: false, 
      error: "Gabim në marrjen e villave të disponueshme" 
    });
  }
});

export default r;