// ...existing code...
import express from "express";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

const router = express.Router();
const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || "change_this_secret";

// Simple admin auth middleware using JWT
async function adminAuth(req, res, next) {
  try {
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith("Bearer ")) return res.status(401).json({ error: "Missing token" });
    const token = auth.slice(7);
    const payload = jwt.verify(token, JWT_SECRET);
    if (!payload || payload.role !== "admin") return res.status(403).json({ error: "Forbidden" });
    req.user = { id: payload.id, role: payload.role };
    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid token" });
  }
}

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    console.log('Email:', email);
    console.log('Password:', password);

    const user = await prisma.user.findUnique({ where: { email } });
    console.log('User:', user);

    if (!user) return res.status(401).json({ error: 'Invalid credentials or not admin' });

    const match = await bcrypt.compare(password, user.password);
    console.log('Password Match:', match);

    if (match && user.role === 'admin') {
      const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '8h' });
      return res.json({
        success: true,
        token,
        user: { id: user.id, email: user.email, name: user.name, role: user.role }
      });
    }

    return res.status(401).json({ error: 'Invalid credentials or not admin' });
  } catch (error) {
    console.error('Login Error:', error);
    return res.status(500).json({ error: 'Server error' });
  }
});

// Apply admin auth to all routes below
router.use(adminAuth);

// Simple ping for admin UI to verify token
router.get('/ping', async (req, res) => {
  try {
    return res.json({ ok: true, user: req.user });
  } catch (err) {
    return res.status(500).json({ error: 'Ping failed' });
  }
});

// Export bookings as CSV
router.get('/bookings/export', async (req, res) => {
  try {
    const rows = await prisma.booking.findMany({
      include: { villa: { select: { name: true, slug: true, type: true } } },
      orderBy: { id: 'desc' }
    });

    const header = [
      'id','villaSlug','villaName','name','email','phone','checkIn','checkOut','guests','amount','status','source','createdAt'
    ];

    const csv = [header.join(',')].concat(rows.map(r => {
      const cols = [
        r.id,
        `"${(r.villaSlug || '')}"`,
        `"${(r.villa?.name || '')}"`,
        `"${(r.name || '')}"`,
        `"${(r.email || '')}"`,
        `"${(r.phone || '')}"`,
        r.checkIn ? r.checkIn.toISOString() : '',
        r.checkOut ? r.checkOut.toISOString() : '',
        r.guests,
        r.amount ? r.amount.toString() : '',
        r.status,
        r.source,
        r.createdAt ? r.createdAt.toISOString() : ''
      ];
      return cols.join(',');
    })).join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="bookings.csv"');
    return res.send(csv);
  } catch (err) {
    console.error('Export bookings error', err);
    return res.status(500).json({ error: 'Failed to export bookings' });
  }
});

// Bulk bookings action: { ids: [1,2], action: 'delete' } or { ids, action: 'status', status: 'paid' }
router.post('/bookings/bulk', async (req, res) => {
  try {
    const { ids, action, status } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: 'No ids provided' });

    if (action === 'delete') {
      const deleted = await prisma.booking.deleteMany({ where: { id: { in: ids } } });
      return res.json({ ok: true, deleted: deleted.count });
    }

    if (action === 'status') {
      if (!status) return res.status(400).json({ error: 'No status provided' });
      const updated = await prisma.booking.updateMany({ where: { id: { in: ids } }, data: { status } });
      return res.json({ ok: true, updated: updated.count });
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch (err) {
    console.error('Bulk bookings error', err);
    return res.status(500).json({ error: 'Bulk action failed' });
  }
});

// --- Villa CRUD ---
router.get('/villas', async (req, res) => {
  try {
    const villas = await prisma.villa.findMany();
    res.json(villas);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch villas' });
  }
});

router.post('/villas', async (req, res) => {
  try {
    const villa = await prisma.villa.create({ data: req.body });
    res.json(villa);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create villa' });
  }
});

router.put('/villas/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) return res.status(400).json({ error: 'Invalid id' });

    const villa = await prisma.villa.update({
      where: { id },
      data: req.body,
    });
    res.json(villa);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update villa' });
  }
});

router.delete('/villas/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) return res.status(400).json({ error: 'Invalid id' });

    await prisma.villa.delete({ where: { id } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete villa' });
  }
});

// --- Booking CRUD ---
router.get('/bookings', async (req, res) => {
  try {
    const { from, to, status, villa, q } = req.query;

    const where = {};

    if (status) where.status = status;
    if (villa) where.villaSlug = villa;

    if (from || to) {
      where.AND = [];
      if (from) {
        const fromDate = new Date(from);
        if (!isNaN(fromDate)) where.AND.push({ checkIn: { gte: fromDate } });
      }
      if (to) {
        const toDate = new Date(to);
        if (!isNaN(toDate)) where.AND.push({ checkOut: { lte: toDate } });
      }
      if (where.AND.length === 0) delete where.AND;
    }

    if (q) {
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { email: { contains: q, mode: 'insensitive' } },
      ];
    }

    const bookings = await prisma.booking.findMany({
      where,
      include: {
        villa: {
          select: { id: true, name: true, slug: true, type: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json(bookings);
  } catch (error) {
    console.error('Fetch bookings error', error);
    res.status(500).json({ error: 'Failed to fetch bookings' });
  }
});

router.put('/bookings/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) return res.status(400).json({ error: 'Invalid id' });

    const booking = await prisma.booking.update({
      where: { id },
      data: req.body,
    });
    res.json(booking);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update booking' });
  }
});

router.delete('/bookings/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) return res.status(400).json({ error: 'Invalid id' });

    await prisma.booking.delete({ where: { id } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete booking' });
  }
});

// Get booking statistics
router.get('/bookings/stats', async (req, res) => {
  try {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfYear = new Date(now.getFullYear(), 0, 1);

    const [
      totalBookings,
      monthlyBookings,
      yearlyBookings,
      pendingBookings,
      paidBookings
    ] = await Promise.all([
      prisma.booking.count(),
      prisma.booking.count({ where: { createdAt: { gte: startOfMonth } } }),
      prisma.booking.count({ where: { createdAt: { gte: startOfYear } } }),
      prisma.booking.count({ where: { status: 'pending' } }),
      prisma.booking.count({ where: { status: 'paid' } })
    ]);

    res.json({
      total: totalBookings,
      monthly: monthlyBookings,
      yearly: yearlyBookings,
      pending: pendingBookings,
      paid: paidBookings
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get booking statistics' });
  }
});

// --- User CRUD (admin only) ---
router.get('/users', async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        createdAt: true
      }
    });
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// Create new user
router.post('/users', async (req, res) => {
  try {
    const { email, password, name, role } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) return res.status(400).json({ error: 'User with this email already exists' });

    const hashed = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({ 
      data: { email, password: hashed, name, role },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        createdAt: true
      }
    });
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create user' });
  }
});

// Update user
router.put('/users/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) return res.status(400).json({ error: 'Invalid id' });

    const { email, name, role, password } = req.body;
    const updateData = { email, name, role };

    if (password && password.trim() !== '') {
      updateData.password = await bcrypt.hash(password, 10);
    }

    const user = await prisma.user.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        createdAt: true
      }
    });
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update user' });
  }
});

// Delete user
router.delete('/users/:id', async (req, res) => {
  try {
    const userId = Number(req.params.id);
    if (Number.isNaN(userId)) return res.status(400).json({ error: 'Invalid id' });

    const adminCount = await prisma.user.count({ where: { role: 'admin' } });
    const userToDelete = await prisma.user.findUnique({ where: { id: userId } });

    if (userToDelete?.role === 'admin' && adminCount <= 1) {
      return res.status(400).json({ error: 'Cannot delete the last admin user' });
    }

    await prisma.user.delete({ where: { id: userId } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

// Get user statistics
router.get('/users/stats', async (req, res) => {
  try {
    const [totalUsers, adminUsers, staffUsers, recentUsers] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { role: 'admin' } }),
      prisma.user.count({ where: { role: 'staff' } }),
      prisma.user.count({
        where: {
          createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
        }
      })
    ]);

    res.json({
      total: totalUsers,
      admins: adminUsers,
      staff: staffUsers,
      recent: recentUsers
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get user statistics' });
  }
});

export default router;
// ...existing code...