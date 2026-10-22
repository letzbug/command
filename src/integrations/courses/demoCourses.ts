import { addDays, formatDate, weekdayMon0 } from '../../domain/dates';
import type { ISODate } from '../../domain/types';
import type { RawUniPopCourse } from './unipopAdapter';

/**
 * Fictional demonstration courses, written in the same raw schema as the live
 * feed so they flow through the real adapter. Titles, trainers and counts are
 * invented; venues are generic. Never mixed with live data.
 */
interface DemoDef {
  code: string;
  title: string;
  theme: string;
  themeCode: string;
  cat: string;
  catName: string;
  venue: 'belval' | 'clausen' | 'dudelange' | 'distance';
  room?: string;
  days: number[]; // weekday indexes (0 = lundi)
  time: string;
  duration: string;
  weeks: number; // 0 = single session
  weekOffset: number;
  capacity: number;
}

const WD = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];

const VENUES: Record<DemoDef['venue'], RawUniPopCourse['adresseCours']> = {
  belval: { nom: 'Université Populaire Belval', localite: 'Esch-sur-Alzette', codePostal: '4360', rueNumero: '14, Porte de France' },
  clausen: { nom: 'Ancienne école Clausen', localite: 'Luxembourg (Clausen)', codePostal: '1343' },
  dudelange: { nom: 'Centre de formation (démo)', localite: 'Dudelange', codePostal: '3524' },
  distance: { nom: 'DISTANCE', localite: 'DISTANCE' },
};

const DEFS: DemoDef[] = [
  { code: 'IN-IA-1', title: 'Rédiger plus vite avec l’IA générative', theme: 'Intelligence artificielle', themeCode: 'IA', cat: 'TIC', catName: "TECHNOLOGIES D'INFORMATION ET DE LA COMMUNICATION", venue: 'belval', room: 'C1.03.07', days: [3], time: '10:00', duration: '2h', weeks: 0, weekOffset: 2, capacity: 12 },
  { code: 'IN-IA-2', title: 'IA générative pour les associations', theme: 'Intelligence artificielle', themeCode: 'IA', cat: 'TIC', catName: "TECHNOLOGIES D'INFORMATION ET DE LA COMMUNICATION", venue: 'belval', room: 'C2.06.01', days: [3], time: '18:00', duration: '1h40', weeks: 0, weekOffset: 2, capacity: 14 },
  { code: 'IN-IA-3', title: 'Comprendre l’IA : usages, limites et sécurité', theme: 'Intelligence artificielle', themeCode: 'IA', cat: 'TIC', catName: "TECHNOLOGIES D'INFORMATION ET DE LA COMMUNICATION", venue: 'distance', days: [1], time: '18:30', duration: '1h30', weeks: 4, weekOffset: 4, capacity: 25 },
  { code: 'IN-INFO-1', title: 'Initiation PC et Internet', theme: 'Informatique', themeCode: 'INFO', cat: 'TIC', catName: "TECHNOLOGIES D'INFORMATION ET DE LA COMMUNICATION", venue: 'dudelange', days: [0, 3], time: '11:15', duration: '2h', weeks: 6, weekOffset: 0, capacity: 9 },
  { code: 'IN-INFO-2', title: 'Smartphone et tablette au quotidien', theme: 'Informatique', themeCode: 'INFO', cat: 'TIC', catName: "TECHNOLOGIES D'INFORMATION ET DE LA COMMUNICATION", venue: 'dudelange', days: [1], time: '09:00', duration: '2h', weeks: 6, weekOffset: 1, capacity: 9 },
  { code: 'LA-LB-1', title: 'Luxembourgeois A1.1', theme: 'Luxembourgeois', themeCode: 'LB', cat: 'LAN', catName: 'LANGUES', venue: 'distance', days: [0, 1, 2, 3], time: '09:00', duration: '3h', weeks: 5, weekOffset: 0, capacity: 25 },
  { code: 'LA-LB-2', title: 'Luxembourgeois A2.1', theme: 'Luxembourgeois', themeCode: 'LB', cat: 'LAN', catName: 'LANGUES', venue: 'belval', room: 'C1.02.11', days: [0, 2], time: '18:00', duration: '2h', weeks: 8, weekOffset: 0, capacity: 18 },
  { code: 'LA-FR-1', title: 'Français A2.1', theme: 'Français', themeCode: 'FR', cat: 'LAN', catName: 'LANGUES', venue: 'distance', days: [0, 1, 2, 3], time: '13:00', duration: '3h', weeks: 5, weekOffset: 1, capacity: 25 },
  { code: 'LA-EN-1', title: 'English conversation B1', theme: 'Anglais', themeCode: 'EN', cat: 'LAN', catName: 'LANGUES', venue: 'clausen', days: [1], time: '18:30', duration: '1h40', weeks: 8, weekOffset: 0, capacity: 14 },
  { code: 'SO-YOG-1', title: 'Yoga doux du mardi', theme: 'Yoga', themeCode: 'YOG', cat: 'ACP', catName: 'ACTIVITE PHYSIQUE  ET BIEN-ÊTRE', venue: 'belval', room: 'E.00.02', days: [1], time: '18:00', duration: '1h30', weeks: 8, weekOffset: 0, capacity: 12 },
  { code: 'SO-BE-1', title: 'Mieux gérer son stress au travail', theme: 'Bien-être', themeCode: 'BE', cat: 'ACP', catName: 'ACTIVITE PHYSIQUE  ET BIEN-ÊTRE', venue: 'belval', room: 'C2.06.01', days: [4], time: '18:00', duration: '1h40', weeks: 0, weekOffset: 3, capacity: 10 },
  { code: 'AR-CUIS-1', title: 'Cuisine de saison en petits groupes', theme: 'Cuisine', themeCode: 'CUIS', cat: 'ART', catName: 'ARTS ET ARTISANAT', venue: 'dudelange', days: [5], time: '09:30', duration: '3h', weeks: 0, weekOffset: 1, capacity: 10 },
  { code: 'AR-PHO-1', title: 'Photographier avec son smartphone', theme: 'Photographie', themeCode: 'PHO', cat: 'ART', catName: 'ARTS ET ARTISANAT', venue: 'clausen', days: [2], time: '18:30', duration: '2h', weeks: 4, weekOffset: 2, capacity: 12 },
  { code: 'SCI-HIST-1', title: 'Le Luxembourg industriel, de la mine à Belval', theme: 'Histoire', themeCode: 'HIST', cat: 'SCH', catName: 'SCIENCES HUMAINES ET SOCIALES', venue: 'belval', days: [3], time: '18:00', duration: '2h30', weeks: 4, weekOffset: 1, capacity: 20 },
  { code: 'SCM-BIO-1', title: 'Balade : plantes sauvages comestibles', theme: 'Biologie', themeCode: 'BIO', cat: 'SCM', catName: 'SCIENCES NATURELLES ET MATHÉMATIQUES', venue: 'clausen', days: [5], time: '09:00', duration: '2h', weeks: 0, weekOffset: 4, capacity: 15 },
  { code: 'SO-COA-1', title: 'Prendre la parole en public', theme: 'Coaching', themeCode: 'COA', cat: 'ACP', catName: 'ACTIVITE PHYSIQUE  ET BIEN-ÊTRE', venue: 'belval', room: 'C2.06.01', days: [5], time: '09:20', duration: '4h10', weeks: 0, weekOffset: 5, capacity: 12 },
];

/** Deterministic PRNG so the demo looks identical after every reset. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const toFr = (iso: ISODate) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
const nextWeekday = (from: ISODate, wd: number) => addDays(from, (wd - weekdayMon0(from) + 7) % 7);

export function demoCourses(year: number): RawUniPopCourse[] {
  const rand = mulberry32(year * 7919);
  const terms: { start: ISODate; label: string; scale: number }[] = [
    { start: `${year}-01-12`, label: 'hiver', scale: 1 },
    { start: `${year}-04-20`, label: 'printemps', scale: 1 },
    { start: `${year}-07-06`, label: 'été', scale: 0.4 },
    { start: `${year}-09-28`, label: 'automne', scale: 1 },
    { start: `${year + 1}-01-11`, label: 'hiver', scale: 1 },
  ];
  const out: RawUniPopCourse[] = [];
  let n = 1;
  for (const term of terms) {
    for (const def of DEFS) {
      if (term.scale < 1 && rand() > term.scale) continue;
      const first = nextWeekday(addDays(term.start, def.weekOffset * 7), def.days[0]);
      const last = def.weeks ? addDays(first, def.weeks * 7 - 1) : first;
      const capacity = def.capacity;
      const enrolled = Math.min(capacity, Math.round(capacity * (0.35 + rand() * 0.7)));
      const schedule = def.weeks
        ? def.days.map((d) => `${WD[d]} à ${def.time} (durée ${def.duration})`).join(', ')
        : `${WD[def.days[0]]} ${toFr(first).replace(/\//g, '-')} à ${def.time} (durée ${def.duration})`;
      out.push({
        id: 900000 + n,
        coursId: `${def.code}-${n}`,
        coursCode: `${def.code}-${n}`,
        intitule: def.title,
        description: `Formation de démonstration (${term.label} ${first.slice(0, 4)}). Contenu fictif généré pour illustrer UniPop COMMAND — première séance le ${formatDate(first, 'long')}.`,
        categorieCodeUnipop: def.cat,
        categorieNom: def.catName,
        matiereCode: def.themeCode,
        matiereNom: def.theme,
        dateDebut: toFr(first),
        dateFin: toFr(last),
        horairePrevu: schedule,
        horaires: def.days.map((d) => ({ jour: WD[d], heure: def.time, duree: def.duration })),
        adresseCours: { ...VENUES[def.venue], ...(def.room ? { salle: def.room } : {}) },
        enseignants: [{ prenom: 'Formateur·rice', nom: `démo ${String((n % 12) + 1).padStart(2, '0')}` }],
        nbInscrits: enrolled,
        nbPlaces: capacity,
        format: def.venue === 'distance' ? 'DISTANCE' : 'PRESENTIEL',
        langueCoursNom: def.themeCode === 'EN' ? 'Anglais' : 'Français',
        niveau: 'Tous les niveaux',
        organisateur: { nom: 'UniPop (démo)' },
      });
      n++;
    }
  }
  return out;
}
