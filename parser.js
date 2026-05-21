/**
 * parser.js — Markdown → structured JSON
 */

function parseFrontmatter(text) {
  const match = text.match(/^---\n([\s\S]*?)\n---\n/);
  if (!match) return { meta: {}, body: text };
  const meta = {};
  match[1].split("\n").forEach(line => {
    const colon = line.indexOf(":");
    if (colon > 0) meta[line.slice(0, colon).trim()] = line.slice(colon + 1).trim();
  });
  return { meta, body: text.slice(match[0].length) };
}

function parseInline(text) {
  const runs = [];
  const re = /(\*\*\*(.+?)\*\*\*|\*\*(.+?)\*\*|\*(.+?)\*|_(.+?)_)/g;
  let last = 0, m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) runs.push({ text: text.slice(last, m.index) });
    if (m[2]) runs.push({ text: m[2], bold: true, italic: true });
    else if (m[3]) runs.push({ text: m[3], bold: true });
    else if (m[4] || m[5]) runs.push({ text: m[4] || m[5], italic: true });
    last = m.index + m[0].length;
  }
  if (last < text.length) runs.push({ text: text.slice(last) });
  return runs.length ? runs : [{ text }];
}

function parseManuscript(mdText) {
  const { meta, body } = parseFrontmatter(mdText);
  const nodes = [];
  const lines = body.split("\n");
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) { i++; continue; }

    if (/^# /.test(line)) {
      nodes.push({ type: "chapter", title: line.replace(/^# /, "").trim() });
      i++; continue;
    }
    if (/^## /.test(line)) {
      nodes.push({ type: "subtitle", title: line.replace(/^## /, "").trim() });
      i++; continue;
    }
    if (/^\*{3}$/.test(trimmed)) {
      nodes.push({ type: "break" });
      i++; continue;
    }
    if (/^-{3,}$/.test(trimmed)) {
      nodes.push({ type: "hr" });
      i++; continue;
    }
    if (/^> /.test(line)) {
      const quoteLines = [];
      while (i < lines.length && /^> /.test(lines[i])) {
        quoteLines.push(lines[i].replace(/^> /, "").trim());
        i++;
      }
      const prevType = nodes.length ? nodes[nodes.length - 1].type : null;
      const isEpigraph = prevType === "chapter";
      nodes.push({
        type: isEpigraph ? "epigraph" : "quote",
        content: quoteLines.join(" "),
        runs: parseInline(quoteLines.join(" ")),
      });
      continue;
    }
    const imgMatch = trimmed.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
    if (imgMatch) {
      nodes.push({ type: "image", alt: imgMatch[1], src: imgMatch[2] });
      i++; continue;
    }
    if (/^[-*+] /.test(line)) {
      const items = [];
      while (i < lines.length && /^[-*+] /.test(lines[i])) {
        const text = lines[i].replace(/^[-*+] /, "").trim();
        items.push({ text, runs: parseInline(text) });
        i++;
      }
      nodes.push({ type: "list", ordered: false, items });
      continue;
    }
    if (/^\d+\. /.test(line)) {
      const items = [];
      while (i < lines.length && /^\d+\. /.test(lines[i])) {
        const text = lines[i].replace(/^\d+\. /, "").trim();
        items.push({ text, runs: parseInline(text) });
        i++;
      }
      nodes.push({ type: "list", ordered: true, items });
      continue;
    }
    const paraLines = [];
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !/^[#>!\-*+]/.test(lines[i]) &&
      !/^\d+\./.test(lines[i]) &&
      !/^\*{3}$/.test(lines[i].trim()) &&
      !/^-{3,}$/.test(lines[i].trim())
    ) {
      paraLines.push(lines[i].trim());
      i++;
    }
    if (paraLines.length) {
      const text = paraLines.join(" ");
      nodes.push({ type: "text", content: text, runs: parseInline(text) });
    }
  }
  return { meta, nodes };
}

function validate(nodes, meta) {
  const errors = [];
  const warnings = [];
  if (!meta.title) errors.push("Missing title");
  if (!meta.author) warnings.push("Missing author");
  const chapters = nodes.filter(n => n.type === "chapter");
  if (chapters.length === 0) warnings.push("No chapters detected — use # headings");
  chapters.forEach(ch => {
    const idx = nodes.indexOf(ch);
    const next = nodes.findIndex((n, i) => i > idx && n.type === "chapter");
    const slice = nodes.slice(idx + 1, next === -1 ? undefined : next);
    if (!slice.some(n => n.type === "text")) {
      warnings.push(`Chapter "${ch.title}" appears empty`);
    }
  });
  return { errors, warnings };
}

module.exports = { parseManuscript, validate };
