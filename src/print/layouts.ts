import { addDays, daysInMonth, diffDays, eachDay, MONTHS_FR, parts, weekdayMon0, WEEKDAY_LETTERS_FR, ymd } from '../domain/dates';
import type { ISODate } from '../domain/types';
import { Measure, Orientation, PageBuilder, PaperFormat, pageSize, PRINT_COLORS as C, PrintDoc, PT_TO_MM, wrapText } from './model';

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/* =====================================================================
 * Template A — Vue annuelle (wall planner: 12 month rows × 31 days)
 * ===================================================================== */

export interface AnnualItem { title: string; startDate: ISODate; endDate: ISODate; kind: 'evenement' | 'projet'; cancelled?: boolean }
export interface AnnualMarker { date: ISODate; title: string; milestone: boolean; overdue: boolean }
export interface AnnualCourseDay { total: number; groups: { label: string; count: number }[] }

export interface AnnualOptions {
  events: boolean; projects: boolean; courses: boolean; deadlines: boolean; milestones: boolean; holidays: boolean; legend: boolean;
}

export interface AnnualInput {
  year: number;
  format: PaperFormat;
  orientation: Orientation;
  title: string;
  subtitle: string;
  generatedText: string;
  filterText?: string;
  items: AnnualItem[];
  markers: AnnualMarker[];
  courseDays: Map<ISODate, AnnualCourseDay>;
  holidays: { date: ISODate; name: string }[];
  options: AnnualOptions;
  qr?: { modules: boolean[][]; caption: string } | null;
}

export function layoutAnnual(input: AnnualInput, m: Measure): PrintDoc {
  const { w: W, h: H } = pageSize(input.format, input.orientation);
  const k = Math.min(W, H) / 841;
  const detail = k >= 0.69 ? 'full' : k >= 0.34 ? 'compact' : 'minimal';
  const fs = (a0: number, min: number) => Math.max(min, a0 * k);
  const pb = new PageBuilder(W, H, m);
  const o = input.options;

  const margin = 16 * k + 4;
  const headerH = 46 * k + 8;
  const legendH = o.legend ? 22 * k + 8 : 6 * k + 4;
  const labelW = (input.orientation === 'landscape' ? 64 : 50) * k + 8;
  const gridX = margin + labelW;
  const gridW = W - margin - gridX;
  const colW = gridW / 31;
  const gridY = margin + headerH;
  const qGap = 6 * k + 1.5;
  const rowH = (H - margin - legendH - gridY - 3 * qGap) / 12;

  // Header
  const titleSize = fs(46, 14);
  pb.text(margin, margin + titleSize * PT_TO_MM, input.title, titleSize, C.ink, { bold: true, maxW: W * 0.55 });
  pb.text(margin, margin + titleSize * PT_TO_MM + fs(16, 6.5) * PT_TO_MM + 3 * k + 1, input.subtitle, fs(16, 6.5), C.muted, { maxW: W * 0.55 });
  const qrSize = input.qr ? Math.min(headerH - 6 * k, 40 * k + 6) : 0;
  const metaRight = W - margin - (qrSize ? qrSize + 6 * k + 2 : 0);
  pb.text(metaRight, margin + fs(13, 6) * PT_TO_MM, input.generatedText, fs(13, 6), C.muted, { align: 'right' });
  if (input.filterText) pb.text(metaRight, margin + 2 * fs(13, 6) * PT_TO_MM + 3 * k + 1, input.filterText, fs(13, 6), C.muted, { align: 'right', maxW: W * 0.35 });
  if (input.qr && qrSize) {
    const qx = W - margin - qrSize;
    pb.prims.push({ t: 'qr', x: qx, y: margin, size: qrSize, modules: input.qr.modules, color: C.ink });
    pb.text(qx + qrSize / 2, margin + qrSize + fs(10, 5) * PT_TO_MM + 1.5 * k, input.qr.caption, fs(10, 5), C.muted, { align: 'center' });
  }

  const holidays = new Map(input.holidays.map((h) => [h.date, h.name]));
  const markersByDay = new Map<ISODate, AnnualMarker[]>();
  for (const mk of input.markers) {
    if (mk.milestone ? !o.milestones : !o.deadlines) continue;
    const a = markersByDay.get(mk.date);
    if (a) a.push(mk); else markersByDay.set(mk.date, [mk]);
  }
  let maxCourses = 1;
  for (const v of input.courseDays.values()) maxCourses = Math.max(maxCourses, v.total);

  const items = input.items.filter((it) => (it.kind === 'projet' ? o.projects : o.events));
  const maxLanes = detail === 'full' ? 3 : 2;

  for (let mi = 0; mi < 12; mi++) {
    const month = mi + 1;
    const q = Math.floor(mi / 3);
    const y0 = gridY + mi * rowH + q * qGap;
    const dim = daysInMonth(input.year, month);
    const mStart = ymd(input.year, month, 1);
    const mEnd = ymd(input.year, month, dim);

    // Quarter label + month label
    if (mi % 3 === 0) {
      pb.text(margin, y0 + fs(22, 8) * PT_TO_MM, `T${q + 1}`, fs(22, 8), C.ink, { bold: true });
    }
    pb.text(margin + labelW * 0.32, y0 + fs(15, 6) * PT_TO_MM + 1.5 * k, cap(MONTHS_FR[mi]), fs(15, 6), C.text, { bold: true, maxW: labelW * 0.66 });

    const hdrH = Math.min(rowH * 0.2, 10 * k + 2.5);
    const laneTop = y0 + hdrH + 0.8 * k;
    const laneH = (rowH * 0.42) / maxLanes;
    const markerY = laneTop + maxLanes * laneH + rowH * 0.02;
    const markerH = rowH * 0.14;
    const courseY = markerY + markerH + rowH * 0.01;
    const courseH = y0 + rowH - courseY - 0.6 * k;

    // Cells
    for (let d = 1; d <= 31; d++) {
      const x = gridX + (d - 1) * colW;
      if (d > dim) { pb.rect(x, y0, colW, rowH, { fill: C.missing }); continue; }
      const iso = ymd(input.year, month, d);
      const wd = weekdayMon0(iso);
      const hol = o.holidays ? holidays.get(iso) : undefined;
      if (hol) pb.rect(x, y0, colW, rowH, { fill: C.holidayBg });
      else if (wd >= 5) pb.rect(x, y0, colW, rowH, { fill: C.weekend });
      const numSize = fs(13, 5);
      pb.text(x + 1.2 * k + 0.4, y0 + numSize * PT_TO_MM + 1 * k + 0.4, String(d), numSize, wd >= 5 ? C.muted : C.text, { bold: true });
      pb.text(x + colW - 1.2 * k - 0.4, y0 + numSize * PT_TO_MM + 1 * k + 0.4, WEEKDAY_LETTERS_FR[wd], fs(10, 4), C.faint, { align: 'right' });
      if (hol && detail !== 'minimal') pb.text(x + colW / 2, y0 + rowH - 1.5 * k - 0.3, hol, fs(8, 4), C.holiday, { align: 'center', maxW: colW - 1.5 });

      // Markers
      const mks = markersByDay.get(iso) ?? [];
      if (mks.length) {
        const ms = mks.filter((x) => x.milestone);
        const dl = mks.filter((x) => !x.milestone);
        const r = Math.min(markerH * 0.32, 2.4 * k + 0.5);
        let cx = x + r + 1.2 * k + 0.3;
        const cy = markerY + markerH / 2;
        const tSize = fs(9, 4);
        if (ms.length) {
          pb.diamond(cx, cy, r, C.milestone);
          if (detail === 'full' && ms.length === 1 && !dl.length) {
            pb.text(cx + r + 1 * k, cy + tSize * PT_TO_MM * 0.35, ms[0].title, tSize, C.milestone, { maxW: colW - 2 * r - 3 * k });
          } else if (ms.length > 1) pb.text(cx + r + 0.6 * k, cy + tSize * PT_TO_MM * 0.35, String(ms.length), tSize, C.milestone, { bold: true });
          cx += r * 2 + (ms.length > 1 ? 4 * k : 1.5 * k) + 0.6;
        }
        if (dl.length) {
          const overdue = dl.some((x) => x.overdue);
          pb.circle(cx, cy, r * 0.85, overdue ? C.overdue : C.deadline);
          if (dl.length > 1) pb.text(cx + r + 0.6 * k, cy + tSize * PT_TO_MM * 0.35, String(dl.length), tSize, overdue ? C.overdue : C.deadline, { bold: true });
        }
      }

      // Courses
      const cd = o.courses ? input.courseDays.get(iso) : undefined;
      if (cd && cd.total > 0 && courseH > 0.8) {
        if (detail === 'full') {
          const tSize = Math.min(fs(9, 4), (courseH / 2.2) / PT_TO_MM);
          const lines = cd.groups.slice(0, 2);
          lines.forEach((g, i) => {
            const ty = courseY + (i + 1) * tSize * PT_TO_MM * 1.12;
            const label = `${g.count} ${g.label}`;
            pb.text(x + 1.2 * k + 0.3, ty, label, tSize, C.course, { maxW: colW - 2.4 * k - 0.6 });
          });
          if (cd.groups.length > 2) {
            const rest = cd.groups.slice(2).reduce((a, g) => a + g.count, 0);
            pb.text(x + colW - 1.2 * k, courseY + 2 * tSize * PT_TO_MM * 1.12, `+${rest}`, tSize * 0.9, C.course, { align: 'right' });
          }
        } else if (detail === 'compact') {
          const s = Math.min(courseH * 0.7, 2.2 * k + 1);
          pb.rect(x + 1 * k + 0.3, courseY + (courseH - s) / 2, s, s, { fill: C.course });
          pb.text(x + 1 * k + s + 1.2, courseY + courseH / 2 + fs(9, 4) * PT_TO_MM * 0.36, String(cd.total), fs(9, 4), C.course, { bold: true });
        } else {
          pb.rect(x + 0.3, y0 + rowH - Math.max(0.8, courseH * 0.5), colW - 0.6, Math.max(0.8, courseH * 0.5), { fill: C.course, opacity: 0.25 + 0.75 * (cd.total / maxCourses) });
        }
      }
    }

    // Grid lines (under the bars)
    for (let d = 0; d <= 31; d++) pb.line(gridX + d * colW, y0, gridX + d * colW, y0 + rowH, C.hair, 0.25 * k + 0.05);
    pb.line(gridX, y0, gridX + gridW, y0, C.line, 0.35 * k + 0.08);
    pb.line(gridX, y0 + rowH, gridX + gridW, y0 + rowH, C.line, 0.35 * k + 0.08);

    // Event / project bars with lane packing
    const monthItems = items
      .filter((it) => it.startDate <= mEnd && it.endDate >= mStart)
      .map((it) => ({ ...it, s: it.startDate < mStart ? mStart : it.startDate, e: it.endDate > mEnd ? mEnd : it.endDate }))
      .sort((a, b) => a.s.localeCompare(b.s) || diffDays(b.e, b.s) - diffDays(a.e, a.s));
    const laneEnds: string[] = [];
    const overflow = new Map<number, number>();
    for (const it of monthItems) {
      let lane = laneEnds.findIndex((end) => end < it.s);
      if (lane === -1) lane = laneEnds.length;
      if (lane >= maxLanes) {
        for (const d of eachDay(it.s, it.e)) { const dd = parts(d)[2]; overflow.set(dd, (overflow.get(dd) ?? 0) + 1); }
        continue;
      }
      laneEnds[lane] = it.e;
      const ds = parts(it.s)[2], de = parts(it.e)[2];
      const bx = gridX + (ds - 1) * colW + 0.5 * k + 0.2;
      const bw = (de - ds + 1) * colW - 1 * k - 0.4;
      const by = laneTop + lane * laneH + 0.4 * k;
      const bh = laneH - 0.9 * k - 0.2;
      const fill = it.kind === 'projet' ? C.project : C.event;
      pb.rect(bx, by, bw, bh, { fill, r: Math.min(1.2 * k + 0.3, bh / 2), opacity: it.cancelled ? 0.35 : 1 });
      const tSize = Math.min(fs(10, 4.2), (bh * 0.62) / PT_TO_MM);
      const showText = detail === 'full' || de - ds >= 2;
      if (showText) {
        const cont = it.startDate < mStart ? '‹ ' : '';
        pb.text(bx + 1.2 * k + 0.4, by + bh / 2 + tSize * PT_TO_MM * 0.36, cont + it.title, tSize, C.white, { bold: true, maxW: bw - 2.4 * k - 0.8 });
      }
    }
    for (const [d, n] of overflow) {
      const x = gridX + (d - 1) * colW;
      pb.text(x + colW - 1 * k - 0.3, markerY + markerH * 0.75, `+${n}`, fs(9, 4), C.ink, { bold: true, align: 'right' });
    }

  }

  // Legend
  if (o.legend) {
    const ly = H - margin - legendH / 2 + 2 * k;
    const ts = fs(12, 5.5);
    const sw = 7 * k + 2;
    let lx = margin;
    const entries: [string, (x: number) => void][] = [];
    if (o.events) entries.push(['Événement', (x) => pb.rect(x, ly - sw * 0.3, sw, sw * 0.6, { fill: C.event, r: 0.8 * k })]);
    if (o.projects) entries.push(['Projet', (x) => pb.rect(x, ly - sw * 0.3, sw, sw * 0.6, { fill: C.project, r: 0.8 * k })]);
    if (o.milestones) entries.push(['Jalon', (x) => pb.diamond(x + sw / 2, ly, sw * 0.35, C.milestone)]);
    if (o.deadlines) {
      entries.push(['Échéance', (x) => pb.circle(x + sw / 2, ly, sw * 0.28, C.deadline)]);
      entries.push(['En retard', (x) => pb.circle(x + sw / 2, ly, sw * 0.28, C.overdue)]);
    }
    if (o.courses) entries.push([detail === 'full' ? 'Séances de formation par catégorie' : 'Séances de formation', (x) => pb.rect(x + sw * 0.2, ly - sw * 0.3, sw * 0.6, sw * 0.6, { fill: C.course })]);
    if (o.holidays) entries.push(['Jour férié (Luxembourg)', (x) => pb.rect(x, ly - sw * 0.35, sw, sw * 0.7, { fill: C.holidayBg, stroke: C.holiday, sw: 0.2 * k + 0.05 })]);
    entries.push(['Week-end', (x) => pb.rect(x, ly - sw * 0.35, sw, sw * 0.7, { fill: C.weekend, stroke: C.line, sw: 0.2 * k + 0.05 })]);
    for (const [label, draw] of entries) {
      draw(lx);
      pb.text(lx + sw + 2 * k + 0.5, ly + ts * PT_TO_MM * 0.36, label, ts, C.text);
      lx += sw + 2 * k + 0.5 + m.width(label, ts) + 9 * k + 2;
    }
    pb.text(W - margin, ly + ts * PT_TO_MM * 0.36, 'UniPop COMMAND — Built by Frank & Cameron', fs(10, 5), C.faint, { align: 'right' });
  }
  return { title: input.title, pages: [pb.page()] };
}

/* =====================================================================
 * Template B — Planning opérationnel (Gantt, paginated)
 * ===================================================================== */

export interface OpsTask {
  title: string; start: ISODate | null; due: ISODate | null; status: 'a_faire' | 'en_cours' | 'en_attente' | 'termine';
  progress: number; milestone: boolean; overdue: boolean; owner: string;
}
export interface OpsGroup { title: string; start: ISODate; end: ISODate; kind: 'evenement' | 'projet'; owner: string; progress: number | null; tasks: OpsTask[] }

export interface OpsInput {
  format: PaperFormat;
  orientation: Orientation;
  title: string;
  subtitle: string;
  generatedText: string;
  filterText?: string;
  rangeStart: ISODate;
  rangeEnd: ISODate;
  today: ISODate;
  groups: OpsGroup[];
}

const STATUS_FILL: Record<OpsTask['status'], string> = { a_faire: '#9AA6B8', en_cours: C.event, en_attente: C.deadline, termine: C.done };

export function layoutOperational(input: OpsInput, m: Measure): PrintDoc {
  const { w: W, h: H } = pageSize(input.format, input.orientation);
  const k = Math.min(W, H) / 841;
  const fs = (a0: number, min: number) => Math.max(min, a0 * k);
  const margin = 16 * k + 4;
  const headerH = 40 * k + 8;
  const legendH = 16 * k + 6;
  const timeHdrH = 16 * k + 5;
  const rowH = Math.max(4.2, 9.5 * k + 1.5);
  const tableW = W * (input.orientation === 'landscape' ? 0.3 : 0.38);
  const colTitle = tableW * 0.66, colOwner = tableW * 0.14;
  const tlX = margin + tableW;
  const tlW = W - margin - tlX;
  const totalDays = diffDays(input.rangeEnd, input.rangeStart) + 1;
  const dayW = tlW / totalDays;
  const xOf = (d: ISODate) => tlX + diffDays(d, input.rangeStart) * dayW;
  const bodyTop = margin + headerH + timeHdrH;
  const rowsPerPage = Math.max(1, Math.floor((H - margin - legendH - bodyTop) / rowH));
  const rowSize = Math.min(fs(11, 5.5), (rowH * 0.62) / PT_TO_MM);

  type Row = { group: OpsGroup; task?: OpsTask };
  const rows: Row[] = [];
  for (const g of input.groups) {
    rows.push({ group: g });
    for (const t of g.tasks) rows.push({ group: g, task: t });
  }
  const pageCount = Math.max(1, Math.ceil(rows.length / rowsPerPage));
  const pages = [];
  const clip = (d: ISODate) => (d < input.rangeStart ? input.rangeStart : d > input.rangeEnd ? input.rangeEnd : d);

  for (let p = 0; p < pageCount; p++) {
    const pb = new PageBuilder(W, H, m);
    const ts = fs(36, 13);
    pb.text(margin, margin + ts * PT_TO_MM, input.title, ts, C.ink, { bold: true, maxW: W * 0.6 });
    pb.text(margin, margin + ts * PT_TO_MM + fs(14, 6) * PT_TO_MM + 3 * k + 1, input.subtitle, fs(14, 6), C.muted, { maxW: W * 0.6 });
    pb.text(W - margin, margin + fs(12, 6) * PT_TO_MM, input.generatedText, fs(12, 6), C.muted, { align: 'right' });
    pb.text(W - margin, margin + 2 * fs(12, 6) * PT_TO_MM + 2 * k + 1, `Page ${p + 1} / ${pageCount}`, fs(12, 6), C.muted, { align: 'right' });
    if (input.filterText) pb.text(W - margin, margin + 3 * fs(12, 6) * PT_TO_MM + 4 * k + 2, input.filterText, fs(12, 6), C.muted, { align: 'right', maxW: W * 0.35 });

    // Column headers
    const hy = margin + headerH;
    const hs = fs(11, 5.5);
    pb.text(margin + 1.5 * k, hy + timeHdrH - 2.5 * k - 0.5, 'Projet / tâche', hs, C.muted, { bold: true });
    pb.text(margin + colTitle + 1.5 * k, hy + timeHdrH - 2.5 * k - 0.5, 'Resp.', hs, C.muted, { bold: true });
    pb.text(margin + tableW - 2 * k, hy + timeHdrH - 2.5 * k - 0.5, 'Échéance', hs, C.muted, { bold: true, align: 'right' });

    // Month headers and week grid
    let cursor = input.rangeStart;
    while (cursor <= input.rangeEnd) {
      const [y, mo] = parts(cursor);
      const mEnd = ymd(y, mo, daysInMonth(y, mo));
      const x1 = xOf(cursor), x2 = xOf(addDays(mEnd > input.rangeEnd ? input.rangeEnd : mEnd, 1));
      pb.rect(x1, hy, x2 - x1, timeHdrH * 0.55, { fill: mo % 2 ? '#EEF2F7' : '#E4EAF2' });
      const label = x2 - x1 > m.width(cap(MONTHS_FR[mo - 1]) + ' ' + y, hs, true) + 3 ? `${cap(MONTHS_FR[mo - 1])} ${y}` : cap(MONTHS_FR[mo - 1]).slice(0, 4);
      pb.text((x1 + x2) / 2, hy + timeHdrH * 0.55 / 2 + hs * PT_TO_MM * 0.36, label, hs, C.ink, { bold: true, align: 'center', maxW: x2 - x1 - 1 });
      pb.line(x1, hy, x1, H - margin - legendH, C.line, 0.3 * k + 0.08);
      cursor = addDays(mEnd, 1);
    }
    for (const d of eachDay(input.rangeStart, input.rangeEnd)) {
      if (weekdayMon0(d) === 0) {
        pb.line(xOf(d), hy + timeHdrH * 0.55, xOf(d), H - margin - legendH, C.hair, 0.2 * k + 0.04);
        if (dayW * 7 > m.width('88', fs(8, 4)) + 1.5) pb.text(xOf(d) + 0.6 * k + 0.2, hy + timeHdrH - 1.8 * k - 0.3, String(parts(d)[2]), fs(8, 4), C.faint);
      }
    }
    pb.line(margin, hy + timeHdrH, W - margin, hy + timeHdrH, C.line, 0.4 * k + 0.1);

    // Rows
    const slice = rows.slice(p * rowsPerPage, (p + 1) * rowsPerPage);
    slice.forEach((row, i) => {
      const y = bodyTop + i * rowH;
      const mid = y + rowH / 2;
      const textY = mid + rowSize * PT_TO_MM * 0.36;
      if (!row.task) {
        const g = row.group;
        pb.rect(margin, y, W - 2 * margin, rowH, { fill: '#F3F5F9' });
        pb.text(margin + 1.5 * k, textY, g.title + (g.progress !== null ? `  (${g.progress} %)` : ''), rowSize, C.ink, { bold: true, maxW: colTitle - 3 * k });
        pb.text(margin + colTitle + 1.5 * k, textY, g.owner, rowSize, C.text, { maxW: colOwner - 2 * k });
        if (g.end >= input.rangeStart && g.start <= input.rangeEnd) {
          const x1 = xOf(clip(g.start)), x2 = xOf(addDays(clip(g.end), 1));
          pb.rect(x1, y + rowH * 0.3, Math.max(0.8, x2 - x1), rowH * 0.4, { fill: g.kind === 'projet' ? C.project : C.event, r: rowH * 0.12 });
        }
      } else {
        const t = row.task;
        pb.text(margin + 4 * k + 1, textY, t.title, rowSize, t.status === 'termine' ? C.muted : C.text, { maxW: colTitle - 5.5 * k - 1 });
        pb.text(margin + colTitle + 1.5 * k, textY, t.owner, rowSize, C.muted, { maxW: colOwner - 2 * k });
        pb.text(margin + tableW - 2 * k, textY, t.due ? `${t.due.slice(8, 10)}/${t.due.slice(5, 7)}` : '—', rowSize, t.overdue ? C.overdue : C.text, { align: 'right', bold: t.overdue });
        const s = t.start ?? t.due, e = t.due ?? t.start;
        if (s && e && e >= input.rangeStart && s <= input.rangeEnd) {
          if (t.milestone) {
            pb.diamond(xOf(clip(e)) + dayW / 2, mid, rowH * 0.32, t.overdue ? C.overdue : C.milestone);
          } else {
            const x1 = xOf(clip(s)), x2 = xOf(addDays(clip(e), 1));
            const bw = Math.max(0.8, x2 - x1);
            pb.rect(x1, y + rowH * 0.22, bw, rowH * 0.56, { fill: STATUS_FILL[t.status], opacity: t.status === 'termine' ? 0.55 : 1, r: rowH * 0.12, stroke: t.overdue ? C.overdue : undefined, sw: t.overdue ? 0.5 * k + 0.15 : undefined });
            if (t.status !== 'termine' && t.progress > 0) pb.rect(x1, y + rowH * 0.62, bw * (t.progress / 100), rowH * 0.16, { fill: C.ink, opacity: 0.55 });
          }
        }
      }
      pb.line(margin, y + rowH, W - margin, y + rowH, C.hair, 0.2 * k + 0.04);
    });

    if (input.today >= input.rangeStart && input.today <= input.rangeEnd) {
      const tx = xOf(input.today) + dayW / 2;
      pb.line(tx, hy + timeHdrH * 0.55, tx, bodyTop + slice.length * rowH, C.overdue, 0.5 * k + 0.12, [2 * k + 0.6, 1.4 * k + 0.4]);
    }

    // Legend
    const ly = H - margin - legendH / 2;
    const ls = fs(11, 5.5);
    let lx = margin;
    const sw = 7 * k + 2;
    const legend: [string, string, 'bar' | 'diamond' | 'line'][] = [
      ['Événement / projet', C.event, 'bar'], ['À faire', STATUS_FILL.a_faire, 'bar'], ['En cours', STATUS_FILL.en_cours, 'bar'],
      ['En attente', STATUS_FILL.en_attente, 'bar'], ['Terminé', STATUS_FILL.termine, 'bar'], ['Jalon', C.milestone, 'diamond'],
      ['En retard', C.overdue, 'diamond'], ["Date d'édition", C.overdue, 'line'],
    ];
    for (const [label, color, shape] of legend) {
      if (shape === 'bar') pb.rect(lx, ly - sw * 0.25, sw, sw * 0.5, { fill: color, r: 0.6 * k });
      else if (shape === 'diamond') pb.diamond(lx + sw / 2, ly, sw * 0.32, color);
      else pb.line(lx + sw / 2, ly - sw * 0.4, lx + sw / 2, ly + sw * 0.4, color, 0.5 * k + 0.12, [1.5 * k + 0.4, 1 * k + 0.3]);
      pb.text(lx + sw + 1.5 * k + 0.5, ly + ls * PT_TO_MM * 0.36, label, ls, C.text);
      lx += sw + 1.5 * k + 0.5 + m.width(label, ls) + 7 * k + 2;
    }
    pages.push(pb.page());
  }
  return { title: input.title, pages };
}

/* =====================================================================
 * A4 checklist for on-site staff
 * ===================================================================== */

export interface ChecklistInput {
  title: string;
  lines: [string, string][]; // label, value
  tasks: { title: string; owner: string; due: string; status: string; done: boolean; milestone: boolean; overdue: boolean }[];
  generatedText: string;
  notesLines: number;
}

export function layoutChecklist(input: ChecklistInput, m: Measure): PrintDoc {
  const W = 210, H = 297, margin = 15;
  const contentW = W - 2 * margin;
  const cols = { box: 9, title: 98, owner: 24, due: 22, status: 27 };
  const rowFont = 9.5;
  const lineH = rowFont * PT_TO_MM * 1.25;
  const footer = 12;
  const pages: PageBuilder[] = [];
  let pb = new PageBuilder(W, H, m);
  pages.push(pb);
  let y = margin;

  pb.text(margin, y + 3, 'UniPop COMMAND — Liste de contrôle', 8, C.muted);
  y += 6;
  for (const line of wrapText(m, input.title, contentW, 18, 2, true)) { y += 18 * PT_TO_MM * 1.15; pb.text(margin, y, line, 18, C.ink, { bold: true }); }
  y += 4;
  for (const [label, value] of input.lines) {
    y += 5.2;
    pb.text(margin, y, label, 9.5, C.muted);
    pb.text(margin + 32, y, value, 9.5, C.text, { maxW: contentW - 32 });
  }
  y += 6;

  const tableHeader = () => {
    pb.rect(margin, y, contentW, 7.5, { fill: '#EEF2F7' });
    let x = margin + cols.box;
    const ty = y + 5;
    pb.text(x + 1, ty, 'Tâche', 8.5, C.muted, { bold: true }); x += cols.title;
    pb.text(x + 1, ty, 'Responsable', 8.5, C.muted, { bold: true }); x += cols.owner;
    pb.text(x + 1, ty, 'Échéance', 8.5, C.muted, { bold: true }); x += cols.due;
    pb.text(x + 1, ty, 'Statut', 8.5, C.muted, { bold: true });
    y += 7.5;
  };
  tableHeader();

  input.tasks.forEach((t, i) => {
    const titleLines = wrapText(m, (t.milestone ? '[Jalon] ' : '') + t.title, cols.title - 3, rowFont, 2);
    const rh = Math.max(8, titleLines.length * lineH + 3.5);
    if (y + rh > H - margin - footer) {
      pb = new PageBuilder(W, H, m);
      pages.push(pb);
      y = margin;
      tableHeader();
    }
    if (i % 2 === 1) pb.rect(margin, y, contentW, rh, { fill: '#F8F9FB' });
    const bs = 4.2;
    pb.rect(margin + 2.3, y + (rh - bs) / 2, bs, bs, { stroke: C.ink, sw: 0.35, fill: C.white });
    if (t.done) {
      pb.line(margin + 3, y + rh / 2, margin + 4.2, y + rh / 2 + 1.3, C.done, 0.6);
      pb.line(margin + 4.2, y + rh / 2 + 1.3, margin + 6, y + rh / 2 - 1.4, C.done, 0.6);
    }
    let x = margin + cols.box;
    titleLines.forEach((ln, li) => pb.text(x + 1, y + 2 + (li + 1) * lineH - 0.6, ln, rowFont, t.done ? C.muted : C.text));
    x += cols.title;
    const ty = y + rh / 2 + rowFont * PT_TO_MM * 0.36;
    pb.text(x + 1, ty, t.owner, rowFont, C.text, { maxW: cols.owner - 2 }); x += cols.owner;
    pb.text(x + 1, ty, t.due, rowFont, t.overdue ? C.overdue : C.text, { bold: t.overdue, maxW: cols.due - 2 }); x += cols.due;
    pb.text(x + 1, ty, t.status, rowFont, C.muted, { maxW: cols.status - 2 });
    pb.line(margin, y + rh, margin + contentW, y + rh, C.hair, 0.2);
    y += rh;
  });
  if (!input.tasks.length) { y += 8; pb.text(margin, y, 'Aucune tâche enregistrée pour cet événement.', 10, C.muted); }

  // Notes
  const notesH = 10 + input.notesLines * 8;
  if (y + notesH > H - margin - footer) { pb = new PageBuilder(W, H, m); pages.push(pb); y = margin; }
  y += 10;
  pb.text(margin, y, 'Notes', 11, C.ink, { bold: true });
  for (let i = 0; i < input.notesLines; i++) { y += 8; pb.line(margin, y, margin + contentW, y, C.line, 0.25); }

  pages.forEach((p, i) => {
    p.text(margin, H - margin + 3, input.generatedText, 7.5, C.faint);
    p.text(W - margin, H - margin + 3, `Page ${i + 1} / ${pages.length}`, 7.5, C.faint, { align: 'right' });
  });
  return { title: input.title, pages: pages.map((p) => p.page()) };
}
