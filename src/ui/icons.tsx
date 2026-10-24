import type { CSSProperties } from 'react';

const P = {
  year: 'M3.5 5h17v15h-17z M3.5 9.5h17 M8 3v4 M16 3v4 M7 13h2 M11 13h2 M15 13h2 M7 16.5h2 M11 16.5h2',
  calendar: 'M3.5 5h17v15h-17z M3.5 9.5h17 M8 3v4 M16 3v4 M8 13.5h3v3H8z',
  layers: 'M12 3.5 3 8.5l9 5 9-5z M3 13l9 5 9-5 M3 17l9 5 9-5',
  tasks: 'M4 4h16v16H4z M8 12.5l3 3 5-6.5',
  bell: 'M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15z M10 20.5a2 2 0 0 0 4 0',
  course: 'M2 9.5 12 4.5l10 5-10 5z M6 11.5v4.5c0 1.5 3 3 6 3s6-1.5 6-3v-4.5 M22 9.5v6',
  users: 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M2 21c0-3.5 3-6 7-6s7 2.5 7 6 M16.5 3.3a4 4 0 0 1 0 7.4 M22 20.5c0-2.6-1.6-4.6-4-5.4',
  printer: 'M6 9V3.5h12V9 M6 18H3.5v-8h17v8H18 M7 14h10v7H7z',
  settings: 'M4 6.5h9 M17 6.5h3 M15 4.5v4 M4 12h3 M11 12h9 M9 10v4 M4 17.5h11 M19 17.5h1 M17 15.5v4',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14z M20.5 20.5 16 16',
  plus: 'M12 5v14 M5 12h14',
  left: 'M15 5.5 8.5 12l6.5 6.5',
  right: 'M9 5.5l6.5 6.5L9 18.5',
  down: 'M6 9l6 6 6-6',
  x: 'M6 6l12 12 M18 6 6 18',
  more: 'M5.5 12h.01 M12 12h.01 M18.5 12h.01',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M12 7v5l3.5 2',
  pin: 'M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z M12 12a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
  filter: 'M4 5h16l-6.2 7.2V18L10.2 20v-7.8z',
  download: 'M12 4v11 M7 10.5l5 5 5-5 M5 20h14',
  upload: 'M12 20V9 M7 13.5l5-5 5 5 M5 4h14',
  refresh: 'M20 11.5A8 8 0 0 0 6 6.3L4 8.5 M4 4v4.5h4.5 M4 12.5A8 8 0 0 0 18 17.7l2-2.2 M20 20v-4.5h-4.5',
  alert: 'M12 3.5 2.5 20h19z M12 10v4.5 M12 17.3h.01',
  repeat: 'M17 2.5l3 3-3 3 M4 11.5v-2a4 4 0 0 1 4-4h12 M7 21.5l-3-3 3-3 M20 12.5v2a4 4 0 0 1-4 4H4',
  diamond: 'M12 3.5l8.5 8.5-8.5 8.5L3.5 12z',
  trash: 'M4 7h16 M9.5 7V4h5v3 M6 7l1 13h10l1-13 M10 11v5.5 M14 11v5.5',
  copy: 'M8.5 8.5h11v11h-11z M4.5 15.5v-11h11',
  archive: 'M3.5 4h17v4h-17z M5 8v12h14V8 M10 12h4',
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1 M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  circle: 'M12 20.5a8.5 8.5 0 1 0 0-17 8.5 8.5 0 0 0 0 17z',
  checkCircle: 'M12 20.5a8.5 8.5 0 1 0 0-17 8.5 8.5 0 0 0 0 17z M8.3 12.3l2.6 2.6 4.9-5.6',
  back: 'M19.5 12H5 M11 5.5 4.5 12l6.5 6.5',
  edit: 'M4 20h4.2L19 9.2 14.8 5 4 15.8z M13.5 6.3l4.2 4.2',
  menu: 'M4 6.5h16 M4 12h16 M4 17.5h16',
  gantt: 'M4 5.5h8 M8 10h11 M6 14.5h8 M12 19h8',
  list: 'M9 6.5h11 M9 12h11 M9 17.5h11 M4.5 6.5h.01 M4.5 12h.01 M4.5 17.5h.01',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M4.5 21c0-4 3.4-6.5 7.5-6.5s7.5 2.5 7.5 6.5',
  external: 'M14 4h6v6 M20 4l-9 9 M18 14v6H4V6h6',
  database: 'M12 8.5c4.4 0 8-1.3 8-3s-3.6-3-8-3-8 1.3-8 3 3.6 3 8 3z M4 5.5v13c0 1.7 3.6 3 8 3s8-1.3 8-3v-13 M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3',
  info: 'M12 20.5a8.5 8.5 0 1 0 0-17 8.5 8.5 0 0 0 0 17z M12 11v5.5 M12 7.8h.01',
  map: 'M9 4.5 3.5 6.8v13l5.5-2.3 6 2.3 5.5-2.3v-13L15 6.8z M9 4.5v13 M15 6.8v13',
  today: 'M3.5 5h17v15h-17z M3.5 9.5h17 M8 3v4 M16 3v4 M12 15.2a1.2 1.2 0 1 0 0-.01z',
} as const;

export type IconName = keyof typeof P;

export function Icon({ name, size = 18, style, className }: { name: IconName; size?: number; style?: CSSProperties; className?: string }) {
  const heavy = name === 'more';
  return (
    <svg className={className} style={style} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={heavy ? 2.8 : 1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d={P[name]} />
    </svg>
  );
}
