import { mkdirSync } from 'node:fs';
mkdirSync('samples', { recursive: true });
import { writeFileSync } from 'node:fs';
import { buildDemoData } from '../../src/data/seed';
import { mapUniPopCourses } from '../../src/integrations/courses/unipopAdapter';
import { demoCourses } from '../../src/integrations/courses/demoCourses';
import { buildAnnualInput, buildOpsInput, buildChecklistInput } from '../../src/print/builders';
import { layoutAnnual, layoutOperational, layoutChecklist } from '../../src/print/layouts';
import { createMeasure, renderPdf } from '../../src/print/pdf';
const TODAY = '2026-10-22';
const d = buildDemoData(TODAY);
const courses = mapUniPopCourses(demoCourses(2026)).courses;
const data = { events: d.events, tasks: d.tasks, team: d.team, courses, today: TODAY, publicAppUrl: 'https://planning.example.lu' };
const include = { events: true, projects: true, courses: true, deadlines: true, milestones: true, holidays: true, legend: true };
const scope = { ownerId: null, eventId: null };
const { measure } = await createMeasure();
for (const [f, o] of [['A0','landscape'],['A3','landscape'],['A0','portrait']] as const) {
  writeFileSync(`samples/annual-${f}-${o}.pdf`, await renderPdf(layoutAnnual(buildAnnualInput(data, { year: 2026, format: f, orientation: o, include, scope, demoCourses: true }), measure)));
}
writeFileSync('samples/ops-A0.pdf', await renderPdf(layoutOperational(buildOpsInput(data, { format: 'A0', orientation: 'landscape', rangeStart: '2026-01-01', rangeEnd: '2026-12-31', includeDone: true, scope }), measure)));
const conf = d.events.find((e) => e.title.includes('IA et formation'))!;
writeFileSync('samples/checklist.pdf', await renderPdf(layoutChecklist(buildChecklistInput(data, conf.id), measure)));
