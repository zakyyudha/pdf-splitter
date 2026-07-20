'use strict';

const path = require('path');
const express = require('express');
const multer = require('multer');
const { PDFDocument } = require('pdf-lib');

// A4 dimensions in PDF points (1 pt = 1/72 inch).
// Portrait A4 = 210mm x 297mm.
const A4_WIDTH_PT = 595.28;
const A4_HEIGHT_PT = 841.89;
const A4_RATIO = A4_HEIGHT_PT / A4_WIDTH_PT; // ~1.4142 (height per unit width)

// Keep uploads in memory (works well with serverless / Vercel).
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }, // 25 MB
});

/**
 * Split every page of a source PDF into vertical slices.
 *
 * For each source page (typically a single very tall screenshot), the page is
 * cut top-to-bottom into `slice` segments. Each output page keeps the original
 * page width; its height is either:
 *   - A4-proportional to the width (auto mode), or
 *   - originalHeight / pages (manual mode when `pages` is provided).
 *
 * @param {Buffer|Uint8Array} inputBytes - Raw bytes of the source PDF.
 * @param {number|null} pages - Desired number of output pages per source page.
 *                              When null/<=0, the count is derived from A4 height.
 * @returns {Promise<{bytes: Uint8Array, pageCount: number}>}
 */
async function splitTallPdf(inputBytes, pages) {
  const srcDoc = await PDFDocument.load(inputBytes, { ignoreEncryption: true });
  const outDoc = await PDFDocument.create();

  const srcPageCount = srcDoc.getPageCount();
  if (srcPageCount === 0) {
    throw new Error('The uploaded PDF has no pages.');
  }

  let totalOutPages = 0;

  for (let p = 0; p < srcPageCount; p++) {
    const srcPage = srcDoc.getPage(p);

    // Embed pages one at a time so a single blank/contentless page cannot
    // abort the whole document.
    let embeddedPage;
    try {
      embeddedPage = await outDoc.embedPage(srcPage);
    } catch (err) {
      // Page has no drawable contents; carry it over as a blank page.
      const { width: bw, height: bh } = srcPage.getSize();
      outDoc.addPage([bw, bh]);
      totalOutPages++;
      continue;
    }

    const width = embeddedPage.width;
    const height = embeddedPage.height;

    // Determine slice height.
    let sliceCount;
    if (pages && pages > 0) {
      sliceCount = Math.floor(pages);
    } else {
      // Auto: each slice is A4-tall relative to the page width.
      const a4SliceHeight = width * A4_RATIO;
      sliceCount = Math.max(1, Math.ceil(height / a4SliceHeight));
    }

    const sliceHeight = height / sliceCount;

    // Slice 0 = top of the source page.
    for (let i = 0; i < sliceCount; i++) {
      const outPage = outDoc.addPage([width, sliceHeight]);
      // PDF origin is bottom-left. Shift the full embedded page down so that
      // the i-th slice (counted from the top) lands in the visible band
      // [0, sliceHeight]. Content outside the page box is clipped by viewers.
      const drawY = (i + 1) * sliceHeight - height;
      outPage.drawPage(embeddedPage, {
        x: 0,
        y: drawY,
        width,
        height,
      });
      totalOutPages++;
    }
  }

  const bytes = await outDoc.save();
  return { bytes, pageCount: totalOutPages };
}

function createApp() {
  const app = express();

  app.use(express.static(path.join(__dirname, 'public')));

  app.get('/api/health', (req, res) => {
    res.json({ ok: true });
  });

  app.post('/api/split', upload.single('pdf'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No PDF file was uploaded.' });
      }

      let pages = null;
      if (req.body.pages !== undefined && String(req.body.pages).trim() !== '') {
        const parsed = Number.parseInt(req.body.pages, 10);
        if (Number.isNaN(parsed) || parsed < 1) {
          return res
            .status(400)
            .json({ error: 'Pages must be a positive whole number.' });
        }
        pages = parsed;
      }

      const { bytes, pageCount } = await splitTallPdf(req.file.buffer, pages);

      const originalName = (req.file.originalname || 'document.pdf').replace(
        /\.pdf$/i,
        ''
      );
      const downloadName = `${originalName}-split.pdf`;

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${downloadName}"`
      );
      res.setHeader('X-Page-Count', String(pageCount));
      return res.send(Buffer.from(bytes));
    } catch (err) {
      console.error('Split failed:', err);
      return res
        .status(500)
        .json({ error: err.message || 'Failed to split the PDF.' });
    }
  });

  // Multer / generic error handler.
  app.use((err, req, res, next) => {
    if (err instanceof multer.MulterError) {
      return res.status(400).json({ error: err.message });
    }
    console.error(err);
    return res.status(500).json({ error: 'Unexpected server error.' });
  });

  return app;
}

module.exports = { createApp, splitTallPdf };
