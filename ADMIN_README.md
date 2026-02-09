Holiday Villas — Admin setup

This file explains how to set up the admin panel locally and in production.

Required environment variables (backend):

- DATABASE_URL  — your database connection string (MySQL)
- JWT_SECRET    — secret used to sign admin JWTs (set to a strong value in prod)
- EMAIL_USER    — email address used for sending notifications (or transactional provider)
- EMAIL_PASS    — password or app password for `EMAIL_USER` (or API key)
- BKT_CLIENT_ID, BKT_STORE_KEY, BKT_OK_URL, BKT_FAIL_URL — payment gateway config

Seeding the database (creates an admin and example data):

1. Install dependencies and build if needed:

```powershell
cd backend
npm install
```

2. Run Prisma migrations (if not applied):

```powershell
npx prisma migrate deploy
# or for dev: npx prisma migrate dev
```

3. Run the seed script:

```powershell
node seed.js
```

Default seeded admin credentials (for local/dev):

- email: admin@holidayvillas.com
- password: admin123

Notes:
- `seed.js` now hashes passwords using bcrypt so the admin login will work with the authentication middleware.
- In production, DO NOT use the default seeded password; change it after seeding or create a new admin via `/api/admin/users`.
- Make sure `JWT_SECRET` is set in your production environment; otherwise the default value will be used which is insecure.

Admin API endpoints (protected):
- POST /api/admin/login                 -> { email, password } => { token }
- GET  /api/admin/villas
- POST /api/admin/villas
- PUT  /api/admin/villas/:id
- DELETE /api/admin/villas/:id
- GET  /api/admin/bookings
- PUT  /api/admin/bookings/:id
- DELETE /api/admin/bookings/:id
- GET  /api/admin/bookings/stats
- GET  /api/admin/users
- POST /api/admin/users
- PUT  /api/admin/users/:id
- DELETE /api/admin/users/:id
- GET  /api/admin/users/stats

If you want me to add a small `/api/admin/ping` endpoint or an automated smoke-test script that attempts login and fetches bookings, tell me and I'll add it.