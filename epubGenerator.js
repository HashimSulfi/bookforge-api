/**
 * epubGenerator.js — manuscript text + config → EPUB file
 */

const { execSync } = require("child_process");
const fs   = require("fs");
const path = require("path");

const TEMPLATE = path.join(__dirname, "template");

function generateEPUB({ manuscriptText, title, author, publisher, language, theme, coverPath, outputPath }) {
  const themeName = (theme && theme.epub && theme.epub.css)
    ? theme.epub.css
    : "noir.css";
  const cssFile = path.join(TEMPLATE, themeName);

  // Write manuscript to temp file
  const tmpMd = outputPath.replace(".epub", "_tmp.md");
  fs.writeFileSync(tmpMd, manuscriptText);

  const args = [
    `"${tmpMd}"`,
    `-o "${outputPath}"`,
    `--epub-chapter-level=1`,
    `--toc --toc-depth=1`,
    `--metadata title="${title.replace(/"/g, '\\"')}"`,
    `--metadata author="${(author || "").replace(/"/g, '\\"')}"`,
    `--metadata lang="${language || "en"}"`,
    publisher ? `--metadata publisher="${publisher.replace(/"/g, '\\"')}"` : "",
    fs.existsSync(cssFile)  ? `--css="${cssFile}"` : "",
    coverPath && fs.existsSync(coverPath) ? `--epub-cover-image="${coverPath}"` : "",
  ].filter(Boolean).join(" ");

  try {
    execSync(`pandoc ${args}`, { stdio: "pipe" });
    // Cleanup temp
    if (fs.existsSync(tmpMd)) fs.unlinkSync(tmpMd);
    return { success: true };
  } catch (err) {
    if (fs.existsSync(tmpMd)) fs.unlinkSync(tmpMd);
    return { success: false, error: err.stderr?.toString()?.slice(0, 300) || err.message };
  }
}

module.exports = { generateEPUB };
