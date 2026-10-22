/**
 * Print pipeline: layouts produce vector primitives in millimetres; the same
 * primitives feed the on-screen SVG preview and the pdf-lib renderer, so the
 * preview is exactly what gets printed. Nothing is rasterised.
 */
export type PaperFormat = 'A0' | 'A1' | 'A3' | 'A4';
export type Orientation = 'landscape' | 'portrait';

export const PAPER_MM: Record<PaperFormat, [number, number]> = {
  A0: [1189, 841],
  A1: [841, 594],
  A3: [420, 297],
  A4: [297, 210],
};

export function pageSize(format: PaperFormat, orientation: Orientation) {
  const [long, short] = PAPER_MM[format];
  return orientation === 'landscape' ? { w: long, h: short } : { w: short, h: long };
}

export type Prim =
  | { t: 'rect'; x: number; y: number; w: number; h: number; fill?: string; stroke?: string; sw?: number; r?: number; opacity?: number }
  | { t: 'line'; x1: number; y1: number; x2: number; y2: number; stroke: string; sw: number; dash?: number[] }
  | { t: 'text'; x: number; y: number; s: string; size: number; bold?: boolean; color: string; align?: 'left' | 'center' | 'right' }
  | { t: 'circle'; cx: number; cy: number; r: number; fill: string }
  | { t: 'poly'; points: [number, number][]; fill: string }
  | { t: 'qr'; x: number; y: number; size: number; modules: boolean[][]; color: string };

export interface PrintPage { w: number; h: number; prims: Prim[] }
export interface PrintDoc { title: string; pages: PrintPage[] }

export const PT_TO_MM = 25.4 / 72;
export const MM_TO_PT = 72 / 25.4;

/** Width in millimetres of `text` at `sizePt`. Backed by real Helvetica metrics (pdf-lib). */
export interface Measure {
  width(text: string, sizePt: number, bold?: boolean): number;
}

export const PRINT_COLORS = {
  ink: '#16233B',
  text: '#1A2230',
  muted: '#5E6878',
  faint: '#8A93A3',
  line: '#C9D0DA',
  hair: '#E1E5EB',
  weekend: '#F1F3F6',
  missing: '#E4E7EC',
  holidayBg: '#FBEAF0',
  holiday: '#B4365F',
  event: '#1F63D0',
  project: '#34405E',
  course: '#0F8A7A',
  deadline: '#C26A00',
  milestone: '#7048E8',
  overdue: '#C42B2B',
  done: '#2F8F4E',
  white: '#FFFFFF',
};

const WIN_ANSI_EXTRA = new Set('€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ');
const REPLACE: Record<string, string> = {
  '\u202f': ' ', '\u00a0': ' ', '\u2009': ' ', '\u2011': '-', '\u2010': '-', '\u2192': '->', '\u2190': '<-',
  '\u2265': '>=', '\u2264': '<=', '\u2212': '-', '\u2026': '…', '\u00b7': '·', '\u2715': 'x', '\u2713': 'v',
};

/** Keeps text inside the WinAnsi charset of the standard PDF fonts (French accents included). */
export function sanitize(text: string): string {
  let out = '';
  for (const ch of (text ?? '').normalize('NFC').replace(/[\r\n\t]+/g, ' ')) {
    if (REPLACE[ch] !== undefined) { out += REPLACE[ch]; continue; }
    const c = ch.codePointAt(0)!;
    if ((c >= 0x20 && c <= 0x7e) || (c >= 0xa0 && c <= 0xff) || WIN_ANSI_EXTRA.has(ch)) out += ch;
  }
  return out.replace(/ {2,}/g, ' ');
}

export function fitText(m: Measure, text: string, maxW: number, size: number, bold = false): string {
  const s = sanitize(text);
  if (maxW <= 0) return '';
  if (m.width(s, size, bold) <= maxW) return s;
  let lo = 0, hi = s.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (m.width(s.slice(0, mid).trimEnd() + '…', size, bold) <= maxW) lo = mid; else hi = mid - 1;
  }
  return lo <= 0 ? '' : s.slice(0, lo).trimEnd() + '…';
}

export function wrapText(m: Measure, text: string, maxW: number, size: number, maxLines: number, bold = false): string[] {
  const words = sanitize(text).split(' ').filter(Boolean);
  const lines: string[] = [];
  let cur = '';
  for (let i = 0; i < words.length; i++) {
    const next = cur ? `${cur} ${words[i]}` : words[i];
    if (m.width(next, size, bold) <= maxW || !cur) { cur = next; continue; }
    lines.push(cur);
    cur = words[i];
    if (lines.length === maxLines - 1) {
      lines.push(fitText(m, words.slice(i).join(' '), maxW, size, bold));
      return lines;
    }
  }
  if (cur) lines.push(lines.length === maxLines - 1 ? fitText(m, cur, maxW, size, bold) : cur);
  return lines.slice(0, maxLines);
}

/** Helper collecting primitives for one page. */
export class PageBuilder {
  prims: Prim[] = [];
  constructor(readonly w: number, readonly h: number, readonly m: Measure) {}
  rect(x: number, y: number, w: number, h: number, o: Omit<Extract<Prim, { t: 'rect' }>, 't' | 'x' | 'y' | 'w' | 'h'> = {}) {
    if (w > 0 && h > 0) this.prims.push({ t: 'rect', x, y, w, h, ...o });
  }
  line(x1: number, y1: number, x2: number, y2: number, stroke: string, sw: number, dash?: number[]) {
    this.prims.push({ t: 'line', x1, y1, x2, y2, stroke, sw, dash });
  }
  text(x: number, y: number, s: string, size: number, color: string, o: { bold?: boolean; align?: 'left' | 'center' | 'right'; maxW?: number } = {}) {
    const str = o.maxW !== undefined ? fitText(this.m, s, o.maxW, size, o.bold) : sanitize(s);
    if (str) this.prims.push({ t: 'text', x, y, s: str, size, color, bold: o.bold, align: o.align });
  }
  circle(cx: number, cy: number, r: number, fill: string) { this.prims.push({ t: 'circle', cx, cy, r, fill }); }
  diamond(cx: number, cy: number, r: number, fill: string) {
    this.prims.push({ t: 'poly', points: [[cx, cy - r], [cx + r, cy], [cx, cy + r], [cx - r, cy]], fill });
  }
  page(): PrintPage { return { w: this.w, h: this.h, prims: this.prims }; }
}
