// backend/server.js
require('dotenv').config();

const express = require("express");
const cors = require("cors");
const path = require("path");
const session = require('express-session');
const cloudinary = require('cloudinary').v2;

const app = express();

/* ---------------- CLOUDINARY ---------------- */
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

/* ---------------- MIDDLEWARE ---------------- */
app.use(cors({
  origin: true,
  credentials: true
}));

app.use(express.json());

app.use(session({
  name: 'officer.sid',
  secret: process.env.SESSION_SECRET || 'dev_secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: false, // set true when HTTPS
    sameSite: 'lax',
    maxAge: 1000 * 60 * 60 // 1 hour
  }
}));

/* ---------------- ROUTES ---------------- */
app.use("/api/tickets", require("./routes/qr"));
//app.use('/api/admin', require('./routes/adminExport'));
app.use("/auth", require("./routes/auth"));
app.use("/customers", require("./routes/customers"));
app.use("/confirmation", require("./routes/confirmation"));
app.use("/reservations", require("./routes/reservations"));

/* ---------------- STATIC FILES ---------------- */
// Customer pages
app.use(express.static(path.join(__dirname, "..", "frontend", "customer")));

// Back officer pages
app.use(express.static(path.join(__dirname, "..", "frontend", "back_officer")));

// QR public files
app.use("/qr", express.static(path.join(__dirname, "public_qr")));

/* ---------------- CRON JOBS ---------------- */
try {
  require('./cleanup');
  require('./promo_warning');
  console.log('Cron jobs loaded.');
} catch (e) {
  console.warn('Cron jobs not loaded:', e.message);
}

/* ---------------- SERVER ---------------- */
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
});
