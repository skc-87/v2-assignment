const express = require("express");
const dotenv = require("dotenv");
const mongoose = require("mongoose");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const connectDB = require("./config/db");
const authRoutes = require("./routes/authRoutes");
const fileRoutes = require("./routes/fileRoutes");
const path = require("path");
const modelRoute = require("./routes/modelRoutes");
const eventRoutes = require("./routes/eventRoutes");
const studentEventRoutes = require("./routes/studentEventRoutes");
const libraryRoutes = require('./routes/libraryRoutes');
const adminRoutes = require('./routes/adminRoutes');

dotenv.config();

if (!process.env.JWT_SECRET) { console.error("FATAL: JWT_SECRET is not set in environment. Exiting."); process.exit(1); }
if (!process.env.MONGO_URI) { console.error("FATAL: MONGO_URI is not set in environment. Exiting."); process.exit(1); }

connectDB();

const app = express();
app.set('trust proxy', 1); // Required for Render — fixes express-rate-limit X-Forwarded-For error

// ── 1. Comprehensive CORS Configuration (Runs First) ─────────────────────────
const corsOptions = {
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);

    if (process.env.ALLOWED_ORIGINS && process.env.ALLOWED_ORIGINS !== "*") {
      const allowed = process.env.ALLOWED_ORIGINS.split(",").map(o => o.trim().replace(/\/$/, ''));
      if (allowed.includes(origin)) return callback(null, true);
    }

    // Automatically allow any Vercel domain, Render domain, or localhost
    if (
      origin.endsWith(".vercel.app") ||
      origin.endsWith(".onrender.com") ||
      origin.startsWith("http://localhost:") ||
      origin.startsWith("http://127.0.0.1:")
    ) {
      return callback(null, true);
    }

    return callback(null, true);
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "Accept"],
  optionsSuccessStatus: 200,
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));

// ── 2. Security Headers (Helmet) ─────────────────────────────────────────────
app.use(helmet({
  crossOriginResourcePolicy: false,
}));

// ── 3. General Rate Limiter (skips preflight OPTIONS) ────────────────────────
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.method === "OPTIONS",
  message: { message: "Too many requests, please try again later." },
});
app.use(generalLimiter);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.use("/api/auth", authRoutes);
app.use("/api/files", fileRoutes);
app.use("/api/model", modelRoute);
app.use("/api/events", eventRoutes);
app.use("/api/student/events", studentEventRoutes);
app.use('/api/library', libraryRoutes);
app.use('/api/admin', adminRoutes);

// Health check endpoint for UptimeRobot / external monitors (explicit GET and HEAD)
app.route("/health")
  .get((req, res) => res.status(200).json({ status: "ok", service: "backend", uptime: process.uptime() }))
  .head((req, res) => res.status(200).end());

app.use('/api', (req, res) => {
  res.status(404).json({ message: `API route not found: ${req.method} ${req.originalUrl}` });
});

app.use((err, req, res, next) => {
  console.error(process.env.NODE_ENV === 'production' ? err.message : err.stack);
  res.status(500).json({ message: "Something went wrong!" });
});


const PORT = process.env.PORT || 5000;

if (process.env.VERCEL) {
  module.exports = app;
} else {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}