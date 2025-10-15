import express from "express";
import cors from "cors";
import helmet from "helmet";

const app = express();

const ALLOWED_ORIGINS = [
  "https://holidayvillasks.com",
  "https://www.holidayvillasks.com",
];

app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(express.json());

// CORS i ngushtë
app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);              // lejo POST nga curl/Render
      if (ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
      return cb(new Error("CORS blocked: " + origin));
    },
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type"],
    credentials: false,
    maxAge: 600,
  })
);

// Preflight
app.options("*", cors());
