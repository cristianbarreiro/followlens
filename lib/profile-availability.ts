import {
  normalize,
  normalizeDeletedAccountMarker,
  type Snapshot,
} from './relationships.ts';

export type UnavailableProfile = {
  username: string;
  reason: string;
  source?: 'manual' | 'automatic';
  isExcluded?: boolean;
};

export const DELETED_ACCOUNT_MARKER_REASON =
  'Marcador de cuenta eliminada en la exportación';

export function parseUnavailableUsernames(input: string) {
  const usernames = new Set<string>();
  const invalid: string[] = [];
  for (const token of input.split(/[\s,;]+/).filter(Boolean)) {
    const username = normalize(token);
    if (username) usernames.add(username);
    else invalid.push(token);
  }
  return { usernames: [...usernames].sort(), invalid };
}

export function isUnavailableProfileExcluded(profile: UnavailableProfile) {
  // Older IndexedDB records predate isExcluded and remain active classifications.
  return profile.isExcluded !== false;
}

export function excludedUnavailableProfiles(
  profiles: UnavailableProfile[],
) {
  return profiles.filter(isUnavailableProfileExcluded);
}

export function mergeDetectedUnavailableProfiles(
  existing: UnavailableProfile[],
  detectedUsernames: string[],
): UnavailableProfile[] {
  const profiles = new Map(
    existing.map((profile) => [
      profile.username,
      {
        ...profile,
        source: profile.source ?? 'manual',
        isExcluded: profile.isExcluded ?? true,
      } satisfies UnavailableProfile,
    ]),
  );

  for (const candidate of detectedUsernames) {
    const username = normalizeDeletedAccountMarker(candidate);
    if (!username) continue;
    const current = profiles.get(username);
    // A manual mark or correction is the user's decision and wins on later imports.
    if (current?.source === 'manual') continue;
    if (!current)
      profiles.set(username, {
        username,
        reason: DELETED_ACCOUNT_MARKER_REASON,
        source: 'automatic',
        isExcluded: true,
      });
  }

  return [...profiles.values()].sort((a, b) =>
    a.username.localeCompare(b.username),
  );
}

export function withoutUnavailableProfiles(
  snapshot: Snapshot,
  usernames: ReadonlySet<string>,
): Snapshot {
  if (!usernames.size) return snapshot;
  return {
    ...snapshot,
    followers: snapshot.followers.filter((name) => !usernames.has(name)),
    following: snapshot.following.filter((name) => !usernames.has(name)),
  };
}
