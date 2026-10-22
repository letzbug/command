import { PDFDocument, PDFFont, PDFPage, rgb, StandardFonts } from 'pdf-lib';
import { Measure, MM_TO_PT, PrintDoc, Prim, PT_TO_MM } from './model';

const hex = (h: string) => {
  const n = parseInt(h.replace('#', ''), 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
};
const pt = (mm: number) => mm * MM_TO_PT;

export interface FontPair { regular: PDFFont; bold: PDFFont }

/** Real Helvetica metrics from pdf-lib, shared by layout, preview and PDF. */
export async function createMeasure(): Promise<{ measure: Measure; fonts: FontPair; doc: PDFDocument }> {
  const doc = await PDFDocument.create();
  const fonts = { regular: await doc.embedFont(StandardFonts.Helvetica), bold: await doc.embedFont(StandardFonts.HelveticaBold) };
  const measure: Measure = {
    width: (text, size, bold) => (bold ? fonts.bold : fonts.regular).widthOfTextAtSize(text, size) * PT_TO_MM,
  };
  return { measure, fonts, doc };
}

function roundedRectPath(x: number, y: number, w: number, h: number, r: number): string {
  const rr = Math.min(r, w / 2, h / 2);
  return `M ${x + rr} ${y} L ${x + w - rr} ${y} Q ${x + w} ${y} ${x + w} ${y + rr} L ${x + w} ${y + h - rr} Q ${x + w} ${y + h} ${x + w - rr} ${y + h} L ${x + rr} ${y + h} Q ${x} ${y + h} ${x} ${y + h - rr} L ${x} ${y + rr} Q ${x} ${y} ${x + rr} ${y} Z`;
}

function drawPrim(page: PDFPage, p: Prim, H: number, fonts: FontPair) {
  switch (p.t) {
    case 'rect': {
      if (p.r && p.r > 0.05) {
        page.drawSvgPath(roundedRectPath(pt(p.x), pt(p.y), pt(p.w), pt(p.h), pt(p.r)), {
          x: 0, y: H,
          color: p.fill ? hex(p.fill) : undefined,
          borderColor: p.stroke ? hex(p.stroke) : undefined,
          borderWidth: p.stroke ? pt(p.sw ?? 0.2) : 0,
          opacity: p.opacity, borderOpacity: p.opacity,
        });
      } else {
        page.drawRectangle({
          x: pt(p.x), y: H - pt(p.y + p.h), width: pt(p.w), height: pt(p.h),
          color: p.fill ? hex(p.fill) : undefined,
          borderColor: p.stroke ? hex(p.stroke) : undefined,
          borderWidth: p.stroke ? pt(p.sw ?? 0.2) : 0,
          opacity: p.opacity, borderOpacity: p.opacity,
        });
      }
      break;
    }
    case 'line':
      page.drawLine({
        start: { x: pt(p.x1), y: H - pt(p.y1) }, end: { x: pt(p.x2), y: H - pt(p.y2) },
        thickness: pt(p.sw), color: hex(p.stroke), dashArray: p.dash?.map(pt),
      });
      break;
    case 'text': {
      const font = p.bold ? fonts.bold : fonts.regular;
      const w = font.widthOfTextAtSize(p.s, p.size);
      const x = pt(p.x) - (p.align === 'center' ? w / 2 : p.align === 'right' ? w : 0);
      page.drawText(p.s, { x, y: H - pt(p.y), size: p.size, font, color: hex(p.color) });
      break;
    }
    case 'circle':
      page.drawCircle({ x: pt(p.cx), y: H - pt(p.cy), size: pt(p.r), color: hex(p.fill) });
      break;
    case 'poly':
      page.drawSvgPath('M ' + p.points.map(([x, y]) => `${pt(x)} ${pt(y)}`).join(' L ') + ' Z', { x: 0, y: H, color: hex(p.fill) });
      break;
    case 'qr': {
      const n = p.modules.length;
      const quiet = 2;
      const cell = p.size / (n + quiet * 2);
      page.drawRectangle({ x: pt(p.x), y: H - pt(p.y + p.size), width: pt(p.size), height: pt(p.size), color: rgb(1, 1, 1) });
      for (let r = 0; r < n; r++) {
        let c = 0;
        while (c < n) {
          if (!p.modules[r][c]) { c++; continue; }
          let e = c;
          while (e < n && p.modules[r][e]) e++;
          const x = p.x + (quiet + c) * cell, y = p.y + (quiet + r) * cell;
          page.drawRectangle({ x: pt(x), y: H - pt(y + cell), width: pt((e - c) * cell) + 0.05, height: pt(cell) + 0.05, color: hex(p.color) });
          c = e;
        }
      }
      break;
    }
  }
}

export async function renderPdf(printDoc: PrintDoc): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(printDoc.title);
  pdf.setCreator('UniPop COMMAND');
  pdf.setProducer('UniPop COMMAND — pdf-lib (vectoriel)');
  pdf.setLanguage('fr-LU');
  pdf.setCreationDate(new Date());
  const fonts = { regular: await pdf.embedFont(StandardFonts.Helvetica), bold: await pdf.embedFont(StandardFonts.HelveticaBold) };
  for (const p of printDoc.pages) {
    const page = pdf.addPage([pt(p.w), pt(p.h)]);
    const H = pt(p.h);
    for (const prim of p.prims) drawPrim(page, prim, H, fonts);
  }
  return pdf.save();
}
