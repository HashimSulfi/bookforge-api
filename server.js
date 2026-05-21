/**
 * server.js — Book Builder API
 *
 * Endpoints:
 *   POST   /api/generate              — build DOCX + EPUB
 *   GET    /api/download/:id/:format  — download file
 *   GET    /api/history               — last 20 builds
 *   DELETE /api/history/:id           — remove build
 *   GET    /api/themes                — list themes
 *   GET    /api/health                — health check
 */

const express = require("express");
const cors    = require("cors");
const path    = require("path");
const fs      = require("fs");

const generateRouter = require("./routes/generate");

const app  = express();
const PORT = process.env.PORT || 3001;
const TEMP = path.join(__dirname, "temp");

// ── Middleware ─────────────────────────────────────
app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// ── Routes ─────────────────────────────────────────
app.use("/api/generate",  generateRouter);
app.use("/api/download",  generateRouter);
app.use("/api/history",   generateRouter);
app.use("/api/themes",    generateRouter);

// Health check
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    version: "1.0.0",
    uptime: Math.floor(process.uptime()),
    builds: require("./routes/generate").history.length,
  });
});

// ── Temp cleanup (files older than 2 hours) ────────
function cleanupTemp() {
  if (!fs.existsSync(TEMP)) return;
  const now = Date.now();
  const TWO_HOURS = 2 * 60 * 60 * 1000;
  fs.readdirSync(TEMP).forEach(dir => {
    const dirPath = path.join(TEMP, dir);
    try {
      const stat = fs.statSync(dirPath);
      if (now - stat.mtimeMs > TWO_HOURS) {
        fs.rmSync(dirPath, { recursive: true, force: true });
      }
    } catch (_) {}
  });
}
setInterval(cleanupTemp, 30 * 60 * 1000); // every 30 min

// ── Start ──────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n📚  Book Builder API running on port ${PORT}`);
  console.log(`    Health:  http://localhost:${PORT}/api/health`);
  console.log(`    Themes:  http://localhost:${PORT}/api/themes`);
  console.log(`    History: http://localhost:${PORT}/api/history\n`);
});

module.exports = app;
