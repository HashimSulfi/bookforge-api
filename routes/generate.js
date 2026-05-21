/**
 * routes/generate.js
 * POST /api/generate
 */

const express  = require("express");
const multer   = require("multer");
const fs       = require("fs");
const path     = require("path");
const { v4: uuidv4 } = require("uuid");
const archiver = require("archiver");

const { parseManuscript, validate } = require("../parser");
const { generateDOCX }  = require("../docxGenerator");
const { generateEPUB }  = require("../epubGenerator");

const router  = express.Router();
const TEMP    = path.join(__dirname, "../temp");
const THEMES  = path.join(__dirname, "../themes");
const upload  = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// In-memory build history (last 50)
const history = [];

// ── Load theme ────────────────────────────────────
function loadTheme(name) {
  const file = path.join(THEMES, `${name || "noir"}.json`);
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8"));
  return {};
}

// ── POST /api/generate ────────────────────────────
router.post("/", upload.single("cover"), async (req, res) => {
  const startTime = Date.now();
  const buildId   = uuidv4();
  const buildDir  = path.join(TEMP, buildId);
  fs.mkdirSync(buildDir, { recursive: true });

  try {
    // ── Parse request ──────────────────────────────
    const {
      manuscript, title, subtitle, author,
      publisher, year, language, theme: themeName,
    } = req.body;

    if (!manuscript) return res.status(400).json({ error: "manuscript is required" });
    if (!title)      return res.status(400).json({ error: "title is required" });

    const theme = loadTheme(themeName);

    // ── Parse + validate ───────────────────────────
    const { meta, nodes } = parseManuscript(manuscript);
    const { errors, warnings } = validate(nodes, { title, author });
    if (errors.length) return res.status(422).json({ error: errors[0], errors, warnings });

    // ── Cover ──────────────────────────────────────
    let coverBuffer = null;
    let coverPath   = null;
    if (req.file) {
      coverBuffer = req.file.buffer;
      coverPath   = path.join(buildDir, "cover.png");
      fs.writeFileSync(coverPath, coverBuffer);
    }

    // ── Generate DOCX ──────────────────────────────
    const docxBuffer = await generateDOCX({
      nodes, title, subtitle: subtitle || meta.subtitle || "",
      author: author || meta.author || "",
      publisher, year, theme, coverBuffer,
    });
    const docxPath = path.join(buildDir, "book.docx");
    fs.writeFileSync(docxPath, docxBuffer);

    // ── Generate EPUB ──────────────────────────────
    const epubPath = path.join(buildDir, "book.epub");
    const epubResult = generateEPUB({
      manuscriptText: manuscript,
      title, author: author || meta.author || "",
      publisher, language: language || "en",
      theme, coverPath, outputPath: epubPath,
    });

    // ── Build ZIP of both ─────────────────────────
    const zipPath = path.join(buildDir, "book-package.zip");
    await new Promise((resolve, reject) => {
      const output  = fs.createWriteStream(zipPath);
      const archive = archiver("zip", { zlib: { level: 6 } });
      output.on("close", resolve);
      archive.on("error", reject);
      archive.pipe(output);
      archive.file(docxPath, { name: `${title}.docx` });
      if (epubResult.success) archive.file(epubPath, { name: `${title}.epub` });
      archive.finalize();
    });

    const elapsed = Date.now() - startTime;

    // ── Record history ─────────────────────────────
    const record = {
      id: buildId,
      title,
      author: author || meta.author || "Unknown",
      theme: themeName || "noir",
      chapters: nodes.filter(n => n.type === "chapter").length,
      words: nodes.filter(n => n.type === "text").map(n => n.content.split(" ").length).reduce((a, b) => a + b, 0),
      docx: true,
      epub: epubResult.success,
      timestamp: new Date().toISOString(),
      elapsed,
    };
    history.unshift(record);
    if (history.length > 50) history.pop();

    // ── Respond ────────────────────────────────────
    res.json({
      success: true,
      buildId,
      title,
      elapsed,
      warnings,
      files: {
        docx: `/api/download/${buildId}/docx`,
        epub: epubResult.success ? `/api/download/${buildId}/epub` : null,
        zip:  `/api/download/${buildId}/zip`,
      },
      stats: {
        chapters: record.chapters,
        words:    record.words,
        nodes:    nodes.length,
      },
    });

  } catch (err) {
    console.error("Build error:", err);
    // Cleanup on error
    fs.rmSync(buildDir, { recursive: true, force: true });
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/download/:id/:format ─────────────────
router.get("/download/:id/:format", (req, res) => {
  const { id, format } = req.params;
  const buildDir = path.join(TEMP, id);

  const fileMap = {
    docx: { file: "book.docx", mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", ext: "docx" },
    epub: { file: "book.epub", mime: "application/epub+zip", ext: "epub" },
    zip:  { file: "book-package.zip", mime: "application/zip", ext: "zip" },
  };

  const entry = fileMap[format];
  if (!entry) return res.status(400).json({ error: "Invalid format" });

  const filePath = path.join(buildDir, entry.file);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: "File not found or expired" });

  res.setHeader("Content-Type", entry.mime);
  res.setHeader("Content-Disposition", `attachment; filename="book.${entry.ext}"`);
  fs.createReadStream(filePath).pipe(res);
});

// ── GET /api/history ──────────────────────────────
router.get("/history", (req, res) => {
  res.json({ history: history.slice(0, 20) });
});

// ── DELETE /api/history/:id ───────────────────────
router.delete("/history/:id", (req, res) => {
  const idx = history.findIndex(h => h.id === req.params.id);
  if (idx !== -1) history.splice(idx, 1);
  const buildDir = path.join(TEMP, req.params.id);
  if (fs.existsSync(buildDir)) fs.rmSync(buildDir, { recursive: true, force: true });
  res.json({ success: true });
});

// ── GET /api/themes ───────────────────────────────
router.get("/themes", (req, res) => {
  const THEMES_DIR = path.join(__dirname, "../themes");
  const themes = fs.readdirSync(THEMES_DIR)
    .filter(f => f.endsWith(".json"))
    .map(f => {
      const t = JSON.parse(fs.readFileSync(path.join(THEMES_DIR, f), "utf8"));
      return { name: t.name, description: t.description };
    });
  res.json({ themes });
});

module.exports = router;
module.exports.history = history;

