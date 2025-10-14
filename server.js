// backend/server.js
import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import paymentsRouter from "./routes/payments.js";

const app = express();

// ---- config ----
const {
  CORS_ORIGIN,
  NODE_ENV = "production",
  PORT = 4000,
} = process.env;

const allow = [
  "https://holidayvillasks.com",
  "https://www.holidayvillasks.com",
  CORS_ORIGIN,
].filter(Boolean);

// ---- middleware ----
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json());
app.use(
  cors({
    origin(origin, cb) {
      if (!origin) return cb(null, true);
      if (allow.some((o) => origin.endsWith(new URL(o).host) || o === origin))
        return cb(null, true);
      return cb(null, false);
    },
    methods: ["GET", "POST", "OPTIONS"],
  })
);
app.use(morgan(NODE_ENV === "production" ? "combined" : "dev"));

// ---- routes ----
app.use("/api", paymentsRouter);
app.get("/", (_req, res) => res.send("ok"));
app.get("/health", (_req, res) => res.json({ ok: true }));

// ---- start ----
app.listen(PORT, () => {
  console.log(`api listening on :${PORT}`);
});
