// Channel Management Service
import { prisma } from "../db.js";

export class ChannelManager {
  constructor() {
    this.channels = {
      'booking_com': {
        name: 'Booking.com',
        api_endpoint: process.env.BOOKING_API_URL,
        api_key: process.env.BOOKING_API_KEY
      },
      'website': {
        name: 'Holiday Villas Website',
        internal: true
      }
    };
  }

  // Sync availability across all channels
  async syncAvailability(villaSlug, checkIn, checkOut, available = false) {
    try {
      // 1. Update local database
      await this.updateLocalAvailability(villaSlug, checkIn, checkOut, available);
      
      // 2. Update external channels
      await this.updateBookingCom(villaSlug, checkIn, checkOut, available);
      
      // 3. Log the sync
      await this.logSync(villaSlug, checkIn, checkOut, available);
      
      return { success: true };
    } catch (error) {
      console.error('Sync error:', error);
      return { success: false, error: error.message };
    }
  }

  // Update local database
  async updateLocalAvailability(villaSlug, checkIn, checkOut, available) {
    const startDate = new Date(checkIn);
    const endDate = new Date(checkOut);
    
    if (available) {
      // Remove blocking entries
      await prisma.availability.deleteMany({
        where: {
          villaSlug,
          date: {
            gte: startDate,
            lt: endDate
          }
        }
      });
    } else {
      // Add blocking entries
      const dates = this.getDatesBetween(startDate, endDate);
      
      for (const date of dates) {
        await prisma.availability.upsert({
          where: {
            villaSlug_date: {
              villaSlug,
              date
            }
          },
          update: {
            available: false,
            source: 'booking_com'
          },
          create: {
            villaSlug,
            date,
            available: false,
            source: 'booking_com'
          }
        });
      }
    }
  }

  // Update Booking.com (placeholder - requires real API)
  async updateBookingCom(villaSlug, checkIn, checkOut, available) {
    // This would use Booking.com's XML API or REST API
    // For now, we'll just log it
    console.log(`[Booking.com Sync] ${villaSlug}: ${checkIn} to ${checkOut} - Available: ${available}`);
    
    // Example API call structure:
    /*
    const response = await fetch(`${this.channels.booking_com.api_endpoint}/availability`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.channels.booking_com.api_key}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        property_id: this.mapVillaToBookingId(villaSlug),
        date_from: checkIn,
        date_to: checkOut,
        available: available ? 1 : 0
      })
    });
    */
  }

  // Map our villa slugs to Booking.com property IDs
  mapVillaToBookingId(villaSlug) {
    const mapping = {
      'vip-1': 'BOOKING_PROPERTY_ID_1',
      'vip-2': 'BOOKING_PROPERTY_ID_2',
      'vip-3': 'BOOKING_PROPERTY_ID_3',
      'premium-1': 'BOOKING_PROPERTY_ID_4',
      'premium-2': 'BOOKING_PROPERTY_ID_5',
      'premium-3': 'BOOKING_PROPERTY_ID_6'
    };
    return mapping[villaSlug];
  }

  // Get all dates between two dates
  getDatesBetween(startDate, endDate) {
    const dates = [];
    const currentDate = new Date(startDate);
    
    while (currentDate < endDate) {
      dates.push(new Date(currentDate));
      currentDate.setDate(currentDate.getDate() + 1);
    }
    
    return dates;
  }

  // Log sync operations
  async logSync(villaSlug, checkIn, checkOut, available) {
    await prisma.syncLog.create({
      data: {
        villaSlug,
        checkIn: new Date(checkIn),
        checkOut: new Date(checkOut),
        available,
        syncedAt: new Date(),
        source: 'channel_manager'
      }
    });
  }

  // Handle incoming booking from any channel
  async handleBooking(booking, source = 'website') {
    try {
      // 1. Create booking in database
      const newBooking = await prisma.booking.create({
        data: {
          villaSlug: booking.villaSlug,
          name: booking.name,
          email: booking.email,
          phone: booking.phone,
          checkIn: new Date(booking.checkIn),
          checkOut: new Date(booking.checkOut),
          guests: booking.guests,
          amount: booking.amount,
          source: source,
          status: 'confirmed'
        }
      });

      // 2. Block availability on all channels
      await this.syncAvailability(
        booking.villaSlug, 
        booking.checkIn, 
        booking.checkOut, 
        false // not available
      );

      // 3. Send confirmation
      await this.sendBookingConfirmation(newBooking);

      return { success: true, booking: newBooking };
    } catch (error) {
      console.error('Booking handling error:', error);
      return { success: false, error: error.message };
    }
  }

  // Send booking confirmation
  async sendBookingConfirmation(booking) {
    // Email confirmation logic here
    console.log(`Booking confirmation sent for booking ${booking.id}`);
  }

  // Webhook endpoint for Booking.com
  async handleBookingComWebhook(webhookData) {
    try {
      const booking = {
        villaSlug: this.mapBookingIdToVilla(webhookData.property_id),
        name: webhookData.guest_name,
        email: webhookData.guest_email,
        phone: webhookData.guest_phone,
        checkIn: webhookData.checkin_date,
        checkOut: webhookData.checkout_date,
        guests: webhookData.guest_count,
        amount: webhookData.total_amount,
        bookingReference: webhookData.booking_id
      };

      return await this.handleBooking(booking, 'booking_com');
    } catch (error) {
      console.error('Booking.com webhook error:', error);
      return { success: false, error: error.message };
    }
  }

  // Map Booking.com property ID to our villa slug
  mapBookingIdToVilla(propertyId) {
    const reverseMapping = {
      'BOOKING_PROPERTY_ID_1': 'vip-1',
      'BOOKING_PROPERTY_ID_2': 'vip-2',
      'BOOKING_PROPERTY_ID_3': 'vip-3',
      'BOOKING_PROPERTY_ID_4': 'premium-1',
      'BOOKING_PROPERTY_ID_5': 'premium-2',
      'BOOKING_PROPERTY_ID_6': 'premium-3'
    };
    return reverseMapping[propertyId];
  }
}

export default ChannelManager;