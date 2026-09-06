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
export function fileKind(path: string): 'followers' | 'following' | null {
  const name = path.replaceAll('\\', '/').split('/').pop()?.toLowerCase() ?? '';
  if (/^followers(?:_\d+)?\.json$/.test(name)) return 'followers';
  if (/^following(?:_\d+)?\.json$/.test(name)) return 'following';
  return null;
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
    if (!name && typeof first?.href === 'string') {
      try {
        const url = new URL(first.href);
        if (['www.instagram.com', 'instagram.com'].includes(url.hostname)) {
          const parts = url.pathname.split('/').filter(Boolean);
          name = normalize(parts[0] === '_u' ? parts[1] : parts[0]);
        }
      } catch {}
    }
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
): Record<Group, string[]> {
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
  return {
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
