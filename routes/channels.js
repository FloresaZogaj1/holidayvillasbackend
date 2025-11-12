import { Router } from "express";
import ChannelManager from "../utils/ChannelManager.js";

const r = Router();
const channelManager = new ChannelManager();

// Manual sync endpoint (për admin)
r.post("/sync", async (req, res) => {
  try {
    const { villaSlug, checkIn, checkOut, available } = req.body;
    
    if (!villaSlug || !checkIn || !checkOut) {
      return res.status(400).json({ 
        ok: false, 
        error: "Villa slug, check-in dhe check-out janë të detyrueshme" 
      });
    }

    const result = await channelManager.syncAvailability(villaSlug, checkIn, checkOut, available);
    
    res.json({ 
      ok: true, 
      message: "Availability u sync-ua në të gjitha kanalet",
      result 
    });

  } catch (error) {
    console.error('Sync error:', error);
    res.status(500).json({ 
      ok: false, 
      error: "Gabim në sync-imin e availability" 
    });
  }
});

// Booking.com webhook endpoint
r.post("/booking-webhook", async (req, res) => {
  try {
    // Verify webhook signature (në produksion)
    // const isValid = verifyBookingComSignature(req.headers, req.body);
    // if (!isValid) return res.status(401).json({ error: "Invalid signature" });

    const result = await channelManager.handleBookingComWebhook(req.body);
    
    if (result.success) {
      res.json({ 
        ok: true, 
        message: "Booking processed successfully",
        booking: result.booking 
      });
    } else {
      res.status(400).json({ 
        ok: false, 
        error: result.error 
      });
    }

  } catch (error) {
    console.error('Booking webhook error:', error);
    res.status(500).json({ 
      ok: false, 
      error: "Webhook processing failed" 
    });
  }
});

// Get sync logs (për debugging)
r.get("/sync-logs", async (req, res) => {
  try {
    const { limit = 50, villaSlug } = req.query;
    
    const where = villaSlug ? { villaSlug } : {};
    
    const logs = await prisma.syncLog.findMany({
      where,
      orderBy: { syncedAt: 'desc' },
      take: parseInt(limit)
    });

    res.json({ 
      ok: true, 
      logs,
      count: logs.length
    });

  } catch (error) {
    console.error('Sync logs error:', error);
    res.status(500).json({ 
      ok: false, 
      error: "Gabim në marrjen e sync logs" 
    });
  }
});

// Check availability across channels
r.post("/check-availability", async (req, res) => {
  try {
    const { villaSlug, checkIn, checkOut } = req.body;
    
    if (!villaSlug || !checkIn || !checkOut) {
      return res.status(400).json({ 
        ok: false, 
        error: "Villa slug, check-in dhe check-out janë të detyrueshme" 
      });
    }

    // Check local availability
    const startDate = new Date(checkIn);
    const endDate = new Date(checkOut);

    const conflictingBookings = await prisma.booking.findMany({
      where: {
        villaSlug: villaSlug,
        status: { in: ['confirmed', 'pending'] },
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

    // Check blocked dates
    const blockedDates = await prisma.availability.findMany({
      where: {
        villaSlug,
        available: false,
        date: {
          gte: startDate,
          lt: endDate
        }
      }
    });

    const isAvailable = conflictingBookings.length === 0 && blockedDates.length === 0;

    res.json({ 
      ok: true, 
      available: isAvailable,
      conflictingBookings: conflictingBookings.length,
      blockedDates: blockedDates.length,
      sources: blockedDates.map(d => d.source).filter((v, i, a) => a.indexOf(v) === i)
    });

  } catch (error) {
    console.error('Availability check error:', error);
    res.status(500).json({ 
      ok: false, 
      error: "Gabim në kontrollin e availability" 
    });
  }
});

export default r;