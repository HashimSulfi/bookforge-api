/**
 * docxGenerator.js — nodes + config → DOCX buffer
 */

const {
  Document, Packer, Paragraph, TextRun, Header, Footer,
  AlignmentType, HeadingLevel, PageNumber, BorderStyle,
  PageBreak, ImageRun, TableOfContents, StyleLevel,
} = require("docx");

async function generateDOCX({ nodes, title, subtitle, author, publisher, year, theme, coverBuffer }) {
  const T = theme.docx || {};
  const FONT   = T.font         || "Georgia";
  const HFONT  = T.headingFont  || "Arial";
  const FSIZE  = T.fontSize     || 24;
  const LSPACE = T.lineSpacing  || 360;
  const HCOLOR = T.headingColor || "1A1A2E";
  const QCOLOR = T.quoteColor   || "333333";
  const ACCENT = T.accentColor  || "C9A84C";
  const CHSP   = T.chapterSpacingBefore || 1440;
  const PGSIZE = T.pageSize === "a4"
    ? { width: 11906, height: 16838 }
    : { width: 12240, height: 15840 };
  const MARGINS = { top: 1440, bottom: 1440, left: 1800, right: 1440 };

  function makeRuns(runs, opts = {}) {
    return (runs || []).map(r => new TextRun({
      text:    r.text,
      font:    opts.font   || FONT,
      size:    opts.size   || FSIZE,
      bold:    r.bold   || opts.bold   || false,
      italics: r.italic || opts.italic || false,
      color:   opts.color  || "000000",
    }));
  }

  function textPara(node, opts = {}) {
    return new Paragraph({
      alignment: opts.align || AlignmentType.JUSTIFIED,
      spacing: { line: LSPACE, before: opts.before || 0, after: opts.after || 160 },
      indent: opts.noIndent ? {} : { firstLine: 720 },
      children: makeRuns(node.runs || [{ text: node.content || "" }], opts),
    });
  }

  // ── Cover ──────────────────────────────────────
  const coverChildren = [];
  if (coverBuffer) {
    coverChildren.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 200 },
      children: [new ImageRun({ data: coverBuffer, transformation: { width: 400, height: 600 }, type: "png" })],
    }));
  } else {
    for (let i = 0; i < 6; i++) coverChildren.push(new Paragraph({ children: [new TextRun("")] }));
  }
  coverChildren.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 200 },
    children: [new TextRun({ text: title, font: HFONT, size: 56, bold: true, color: HCOLOR })],
  }));
  if (subtitle) {
    coverChildren.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 600 },
      children: [new TextRun({ text: subtitle, font: HFONT, size: 30, italics: true, color: "555555" })],
    }));
  }
  coverChildren.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 120, after: 400 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: ACCENT, space: 1 } },
    children: [new TextRun("")],
  }));
  coverChildren.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 100 },
    children: [new TextRun({ text: author, font: HFONT, size: 28, color: "333333" })],
  }));
  if (publisher) {
    coverChildren.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: `${publisher} · ${year || new Date().getFullYear()}`, font: HFONT, size: 20, color: "888888" })],
    }));
  }

  // ── TOC ───────────────────────────────────────
  const tocChildren = [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 720, after: 480 },
      children: [new TextRun({ text: "Contents", font: HFONT, size: 36, bold: true, color: HCOLOR })],
    }),
    new TableOfContents("Contents", {
      hyperlink: true,
      headingStyleRange: "1-1",
      stylesWithLevels: [new StyleLevel("Heading 1", 1)],
    }),
    new Paragraph({ children: [new PageBreak()] }),
  ];

  // ── Body ──────────────────────────────────────
  const body = [];
  let firstInChapter = false;

  for (const node of nodes) {
    if (node.type === "chapter") {
      body.push(new Paragraph({ children: [new PageBreak()] }));
      body.push(new Paragraph({
        heading: HeadingLevel.HEADING_1,
        alignment: AlignmentType.CENTER,
        spacing: { before: CHSP, after: 480 },
        children: [new TextRun({ text: node.title, font: HFONT, size: 36, bold: true, color: HCOLOR })],
      }));
      firstInChapter = true;
    } else if (node.type === "subtitle") {
      body.push(new Paragraph({
        heading: HeadingLevel.HEADING_2,
        alignment: AlignmentType.LEFT,
        spacing: { before: 480, after: 240 },
        children: [new TextRun({ text: node.title, font: HFONT, size: 26, bold: true, color: HCOLOR })],
      }));
    } else if (node.type === "text") {
      body.push(textPara(node, { noIndent: firstInChapter }));
      firstInChapter = false;
    } else if (node.type === "break") {
      body.push(new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 240, after: 240 },
        children: [new TextRun({ text: "* * *", font: FONT, size: FSIZE, color: ACCENT })],
      }));
      firstInChapter = true;
    } else if (node.type === "hr") {
      body.push(new Paragraph({
        spacing: { before: 240, after: 240 },
        border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: "CCCCCC", space: 1 } },
        children: [new TextRun("")],
      }));
    } else if (node.type === "quote" || node.type === "epigraph") {
      const isEpi = node.type === "epigraph";
      body.push(new Paragraph({
        alignment: AlignmentType.LEFT,
        spacing: { before: isEpi ? 480 : 240, after: isEpi ? 720 : 240, line: LSPACE },
        indent: { left: isEpi ? 1440 : 720, right: 720 },
        border: isEpi ? {} : { left: { style: BorderStyle.SINGLE, size: 12, color: ACCENT, space: 10 } },
        children: makeRuns(node.runs || [{ text: node.content }], { italic: true, color: QCOLOR }),
      }));
      if (isEpi) firstInChapter = true;
    } else if (node.type === "list") {
      node.items.forEach((item, idx) => {
        body.push(new Paragraph({
          alignment: AlignmentType.LEFT,
          spacing: { before: idx === 0 ? 160 : 0, after: idx === node.items.length - 1 ? 160 : 80, line: LSPACE },
          indent: { left: 720, hanging: 360 },
          children: [
            new TextRun({ text: node.ordered ? `${idx + 1}.  ` : "•  ", font: FONT, size: FSIZE }),
            ...makeRuns(item.runs || [{ text: item.text }]),
          ],
        }));
      });
    }
  }

  // ── Header / Footer ───────────────────────────
  const header = new Header({
    children: [new Paragraph({
      alignment: AlignmentType.RIGHT,
      border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: "CCCCCC", space: 1 } },
      spacing: { after: 120 },
      children: [
        new TextRun({ text: `${author}  |  `, font: HFONT, size: 18, color: "888888" }),
        new TextRun({ text: title, font: HFONT, size: 18, italics: true, color: "888888" }),
      ],
    })],
  });
  const footer = new Footer({
    children: [new Paragraph({
      alignment: AlignmentType.CENTER,
      border: { top: { style: BorderStyle.SINGLE, size: 4, color: "CCCCCC", space: 1 } },
      spacing: { before: 120 },
      children: [new TextRun({ children: [PageNumber.CURRENT], font: HFONT, size: 18, color: "888888" })],
    })],
  });

  const doc = new Document({
    features: { updateFields: true },
    styles: {
      default: { document: { run: { font: FONT, size: FSIZE } } },
      paragraphStyles: [
        {
          id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
          run: { size: 36, bold: true, font: HFONT, color: HCOLOR },
          paragraph: { spacing: { before: CHSP, after: 480 }, outlineLevel: 0 },
        },
        {
          id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
          run: { size: 26, bold: true, font: HFONT, color: HCOLOR },
          paragraph: { spacing: { before: 480, after: 240 }, outlineLevel: 1 },
        },
      ],
    },
    sections: [
      { properties: { page: { size: PGSIZE, margin: MARGINS } }, children: coverChildren },
      { properties: { page: { size: PGSIZE, margin: MARGINS } }, children: tocChildren },
      {
        properties: { page: { size: PGSIZE, margin: MARGINS } },
        headers: { default: header },
        footers: { default: footer },
        children: body,
      },
    ],
  });

  return await Packer.toBuffer(doc);
}

module.exports = { generateDOCX };
