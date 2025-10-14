// backend/server.js
import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import paymentsRouter from "./routes/payments.js";

const app = express();

const allow = [
  "https://holidayvillasks.com",
  "https://www.holidayvillasks.com",
  process.env.CORS_ORIGIN,
].filter(Boolean);

app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json());
app.use(cors({ origin: allow, methods: ["GET","POST","OPTIONS"] }));
app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));

app.use("/api", paymentsRouter);      // => /api/payments/...

app.get("/", (_req, res) => res.send("ok"));
app.get("/health", (_req, res) => res.json({ ok: true }));

app.listen(process.env.PORT || 4000, () =>
  console.log("api listening")
);
