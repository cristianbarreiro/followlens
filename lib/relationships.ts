export type Snapshot = {
  id: string;
  account: string;
  date: string;
  importedAt: string;
  followers: string[];
  following: string[];
};
export type Group =
  | 'followers'
  | 'following'
  | 'mutuals'
  | 'notBack'
  | 'fans'
  | 'lost'
  | 'new'
  | 'unfollowed'
  | 'followed'
  | 'lostMutuals'
  | 'newMutuals';
export const labels: Record<Group, string> = {
  followers: 'Seguidores',
  following: 'Seguidos',
  mutuals: 'Mutuos',
  notBack: 'No te siguen',
  fans: 'No seguís de vuelta',
  lost: 'Seguidores perdidos',
  new: 'Seguidores nuevos',
  unfollowed: 'Dejaste de seguir',
  followed: 'Empezaste a seguir',
  lostMutuals: 'Mutuos perdidos',
  newMutuals: 'Nuevos mutuos',
};
export function normalize(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const name = value.trim().replace(/^@/, '').toLowerCase();
  return /^[a-z0-9._]{1,30}$/.test(name) ? name : null;
}

/** Recognizes the explicit deleted-account marker used in some exports. */
export function normalizeDeletedAccountMarker(value: unknown): string | null {
  const username = normalize(value);
  return username && /^__deleted__.+$/.test(username) ? username : null;
}

const RESERVED_INSTAGRAM_PATHS = new Set([
  'p',
  'reel',
  'reels',
  'stories',
  'story',
  'tv',
  'share',
  'create',
  'explore',
  'tags',
  'locations',
  'about',
  'legal',
  'terms',
  'privacy',
  'help',
  'support',
  'press',
  'developer',
  'api',
  'directory',
  'business',
  'accounts',
  'direct',
  'emails',
  'settings',
  'challenge',
  'consent',
  'your_activity',
  'graphql',
  '_u',
]);

export function extractInstagramUsernameFromUrl(href: string): string | null {
  if (typeof href !== 'string' || !href.trim()) return null;
  try {
    const url = new URL(href, 'https://www.instagram.com');
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    const hostname = url.hostname.toLowerCase();
    if (hostname !== 'www.instagram.com' && hostname !== 'instagram.com')
      return null;

    const parts = url.pathname.split('/').filter(Boolean);
    if (!parts.length) return null;
    const isExportSlug = parts[0].toLowerCase() === '_u';
    if (
      (isExportSlug && parts.length !== 2) ||
      (!isExportSlug && parts.length !== 1)
    )
      return null;

    const candidate = parts[isExportSlug ? 1 : 0];
    if (!candidate || RESERVED_INSTAGRAM_PATHS.has(candidate.toLowerCase()))
      return null;
    return normalize(candidate);
  } catch {
    return null;
  }
}

export type FileFormat = 'json' | 'html';
export type FileKind = 'followers' | 'following';

export function fileInfo(
  path: string,
): { kind: FileKind; format: FileFormat } | null {
  const name = path.replaceAll('\\', '/').split('/').pop()?.toLowerCase() ?? '';
  const match = /^(followers(?:_\d+)?|following(?:_\d+)?)\.(json|html)$/.exec(
    name,
  );
  if (!match) return null;
  const basePrefix = match[1];
  const ext = match[2] as FileFormat;
  const kind: FileKind = basePrefix.startsWith('followers')
    ? 'followers'
    : 'following';
  return { kind, format: ext };
}

export function fileKind(path: string): FileKind | null {
  return fileInfo(path)?.kind ?? null;
}

export function selectZipRelationshipPaths(
  paths: readonly string[],
): ReadonlySet<string> {
  const candidates = paths.filter((path) => fileKind(path) !== null);
  const normalizedPaths = candidates.map((path) => ({
    path,
    segments: path
      .replaceAll('\\', '/')
      .split('/')
      .filter(Boolean)
      .map((segment) => segment.toLowerCase()),
  }));
  const knownFolders = new Set<string>();

  for (const { segments } of normalizedPaths) {
    const parent = segments.slice(0, -1);
    if (
      parent.length >= 2 &&
      parent.slice(-2).join('/') === 'connections/followers_and_following'
    ) {
      knownFolders.add(parent.join('/'));
    }
  }

  if (knownFolders.size > 1) {
    throw new Error(
      'Hay varias carpetas de seguidores. Importá los datos de una sola cuenta.',
    );
  }

  if (knownFolders.size === 1) {
    const [knownFolder] = knownFolders;
    return new Set(
      normalizedPaths
        .filter(
          ({ segments }) => segments.slice(0, -1).join('/') === knownFolder,
        )
        .map(({ path }) => path),
    );
  }

  const folders = new Set(
    normalizedPaths.map(({ segments }) => segments.slice(0, -1).join('/')),
  );
  if (folders.size > 1) {
    throw new Error(
      'Hay varias carpetas con archivos relacionales. Importá los datos de una sola cuenta.',
    );
  }

  return new Set(candidates);
}

export function parseRelationships(
  data: unknown,
  kind: 'followers' | 'following',
): string[] {
  const key =
    kind === 'followers'
      ? 'relationships_followers'
      : 'relationships_following';
  const rows = Array.isArray(data)
    ? data
    : data && typeof data === 'object'
      ? (data as Record<string, unknown>)[key]
      : undefined;
  if (!Array.isArray(rows))
    throw new Error(
      `El formato de ${kind === 'followers' ? 'seguidores' : 'seguidos'} no es compatible. Usá una exportación JSON de Instagram.`,
    );
  const names = new Set<string>();
  for (const row of rows) {
    if (!row || typeof row !== 'object')
      throw new Error('Hay un registro incompleto en la exportación.');
    const strings = Array.isArray(row.string_list_data)
      ? row.string_list_data
      : [];
    const first = strings[0];
    let name = normalize(first?.value) ?? normalize(row.title);
    if (!name && typeof first?.href === 'string')
      name = extractInstagramUsernameFromUrl(first.href);
    if (!name)
      throw new Error(
        'No se pudo leer una cuenta. No guardamos datos parciales para evitar comparaciones incorrectas.',
      );
    names.add(name);
  }
  return [...names].sort();
}
const diff = (a: Set<string>, b: Set<string>) =>
  [...a].filter((n) => !b.has(n)).sort();
const intersect = (a: Set<string>, b: Set<string>) =>
  [...a].filter((n) => b.has(n)).sort();
export function analyze(
  current: Snapshot,
  previous?: Snapshot,
  onMeasure?: (durationMs: number) => void,
): Record<Group, string[]> {
  const startedAt = onMeasure ? performance.now() : 0;
  if (
    previous &&
    (previous.account !== current.account || previous.date >= current.date)
  )
    throw new Error('Elegí una importación anterior de la misma cuenta.');
  const f = new Set(current.followers),
    g = new Set(current.following),
    pf = new Set(previous?.followers),
    pg = new Set(previous?.following);
  const m = new Set(intersect(f, g)),
    pm = new Set(intersect(pf, pg));
  const result = {
    followers: [...f].sort(),
    following: [...g].sort(),
    mutuals: [...m],
    notBack: diff(g, f),
    fans: diff(f, g),
    lost: previous ? diff(pf, f) : [],
    new: previous ? diff(f, pf) : [],
    unfollowed: previous ? diff(pg, g) : [],
    followed: previous ? diff(g, pg) : [],
    lostMutuals: previous ? diff(pm, m) : [],
    newMutuals: previous ? diff(m, pm) : [],
  };
  if (onMeasure) onMeasure(performance.now() - startedAt);
  return result;
}
export function relationship(snapshot: Snapshot, name: string) {
  const f = snapshot.followers.includes(name),
    g = snapshot.following.includes(name);
  return f && g
    ? 'Mutuos'
    : f
      ? 'Te sigue'
      : g
        ? 'Lo seguís'
        : 'Sin relación detectada';
}
export function timeline(snapshots: Snapshot[], name: string) {
  let last = '';
  return [...snapshots]
    .sort((a, b) => a.date.localeCompare(b.date))
    .flatMap((s) => {
      const state = relationship(s, name);
      if (state === last || (!last && state === 'Sin relación detectada'))
        return [];
      last = state;
      return [{ date: s.date, state }];
    });
}
export function csvRows(
  names: string[],
  group: Group,
  current: Snapshot,
  snapshots: Snapshot[],
) {
  const quote = (s: string) => `"${s.replaceAll('"', '""')}"`;
  const history = snapshots
    .filter((s) => s.account === current.account && s.date <= current.date)
    .sort((a, b) => a.date.localeCompare(b.date));
  const observations = new Map<string, { first: string; last: string }>();
  for (const s of history)
    for (const name of new Set([...s.followers, ...s.following])) {
      const seen = observations.get(name);
      observations.set(name, { first: seen?.first ?? s.date, last: s.date });
    }
  const followers = new Set(current.followers),
    following = new Set(current.following);
  const rows = names.map((n) => {
    const seen = observations.get(n);
    const relation = followers.has(n)
      ? following.has(n)
        ? 'Mutuos'
        : 'Te sigue'
      : following.has(n)
        ? 'Lo seguís'
        : 'Sin relación detectada';
    return [
      n,
      labels[group],
      relation,
      seen?.first ?? '',
      seen?.last ?? '',
      current.date,
    ];
  });
  return (
    '\uFEFF' +
    [
      [
        'usuario',
        'grupo',
        'relacion_actual',
        'primera_observacion',
        'ultima_observacion',
        'fecha_exportacion',
      ],
      ...rows,
    ]
      .map((row) => row.map(quote).join(','))
      .join('\r\n')
  );
}
