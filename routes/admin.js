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
  const bookings = await prisma.booking.findMany({
    include: {
      villa: {
        select: {
          id: true,
          name: true,
          slug: true,
          type: true
        }
      }
    },
    orderBy: { createdAt: 'desc' }
  });
  res.json(bookings);
});

router.put('/bookings/:id', async (req, res) => {
  const booking = await prisma.booking.update({
    where: { id: parseInt(req.params.id) },
    data: req.body,
  });
  res.json(booking);
});

router.delete('/bookings/:id', async (req, res) => {
  await prisma.booking.delete({ where: { id: parseInt(req.params.id) } });
  res.json({ success: true });
});

// Get booking statistics
router.get('/bookings/stats', async (req, res) => {
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
    prisma.booking.count({
      where: {
        createdAt: { gte: startOfMonth }
      }
    }),
    prisma.booking.count({
      where: {
        createdAt: { gte: startOfYear }
      }
    }),
    prisma.booking.count({
      where: { status: 'pending' }
    }),
    prisma.booking.count({
      where: { status: 'paid' }
    })
  ]);

  res.json({
    total: totalBookings,
    monthly: monthlyBookings,
    yearly: yearlyBookings,
    pending: pendingBookings,
    paid: paidBookings
  });
});

// --- User CRUD (admin only) ---
router.get('/users', async (req, res) => {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      createdAt: true
      // Don't include password in response
    }
  });
  res.json(users);
});

// Create new user
router.post('/users', async (req, res) => {
  try {
    const { email, password, name, role } = req.body;
    
    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email }
    });
    
    if (existingUser) {
      return res.status(400).json({ error: 'User with this email already exists' });
    }
    
    const user = await prisma.user.create({ 
      data: { email, password, name, role },
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
    const { email, name, role, password } = req.body;
    const updateData = { email, name, role };
    
    // Only update password if provided
    if (password && password.trim() !== '') {
      updateData.password = password;
    }
    
    const user = await prisma.user.update({
      where: { id: parseInt(req.params.id) },
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
    const userId = parseInt(req.params.id);
    
    // Prevent deleting the last admin
    const adminCount = await prisma.user.count({
      where: { role: 'admin' }
    });
    
    const userToDelete = await prisma.user.findUnique({
      where: { id: userId }
    });
    
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
          createdAt: {
            gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) // Last 30 days
          }
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

// Login endpoint
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await prisma.user.findUnique({
      where: { email }
    });
    
    if (user && user.password === password && user.role === 'admin') {
      res.json({ 
        success: true, 
        user: { 
          id: user.id, 
          email: user.email, 
          name: user.name, 
          role: user.role 
        } 
      });
    } else {
      res.status(401).json({ error: 'Invalid credentials or not admin' });
    }
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
