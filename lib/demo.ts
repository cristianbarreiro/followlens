import type { Snapshot } from './relationships';
const names = [
  'ana.rivera',
  'bruno.fotos',
  'caro.design',
  'daniel.uy',
  'elena.art',
  'fer.viaja',
  'gabi.cocina',
  'helena.m',
  'ivan.dev',
  'juli.rojas',
  'karen.uy',
  'leo.mendez',
  'lucia.silva',
  'marcos.fit',
  'nati.crea',
  'oscar.a',
  'pablo.sur',
  'rocio.ilustra',
  'sofi.mora',
  'tomas.costa',
  'vale.reads',
  'vero.uy',
  'will.film',
  'ximena.b',
  'yago.music',
  'zoe.cafe',
];
const followers = Array.from(
  { length: 164 },
  (_, i) => names[i] ?? `comunidad.${String(i + 1).padStart(3, '0')}`,
);
const following = [
  ...followers.slice(0, 112),
  ...Array.from(
    { length: 36 },
    (_, i) => `estudio.${String(i + 1).padStart(2, '0')}`,
  ),
];
export const demoSnapshots: Snapshot[] = [
  {
    id: 'demo-1',
    account: 'cuenta.ejemplo',
    date: '2026-07-06',
    importedAt: '2026-07-06',
    followers: followers.slice(0, 143),
    following: following.slice(0, 133),
  },
  {
    id: 'demo-2',
    account: 'cuenta.ejemplo',
    date: '2026-08-06',
    importedAt: '2026-08-06',
    followers,
    following,
  },
  {
    id: 'demo-3',
    account: 'cuenta.ejemplo',
    date: '2026-09-06',
    importedAt: '2026-09-06',
    followers: [
      ...followers.slice(8),
      ...Array.from({ length: 25 }, (_, i) => `nuevo.circulo${i + 1}`),
    ],
    following: [
      ...following.slice(3),
      ...Array.from({ length: 7 }, (_, i) => `nuevo.circulo${i + 1}`),
    ],
  },
];
