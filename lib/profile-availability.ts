import {
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

export type ProfileAvailabilityAudit = {
  auditedCount: number;
  confirmedDeletedUsernames: string[];
  unconfirmedCount: number;
};

/** Audits every unique relationship username using export evidence only. */
export function auditProfileAvailability(
  followers: string[],
  following: string[],
): ProfileAvailabilityAudit {
  const seen = new Set<string>();
  const confirmedDeletedUsernames: string[] = [];
  const auditList = (usernames: string[]) => {
    for (const username of usernames) {
      if (seen.has(username)) continue;
      seen.add(username);
      if (normalizeDeletedAccountMarker(username))
        confirmedDeletedUsernames.push(username);
    }
  };
  auditList(followers);
  auditList(following);
  return {
    auditedCount: seen.size,
    confirmedDeletedUsernames,
    unconfirmedCount: seen.size - confirmedDeletedUsernames.length,
  };
}

export function isUnavailableProfileExcluded(profile: UnavailableProfile) {
  return (
    normalizeDeletedAccountMarker(profile.username) !== null &&
    profile.isExcluded !== false
  );
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
    existing
      .filter((profile) => normalizeDeletedAccountMarker(profile.username))
      .map((profile) => [
        profile.username,
        {
          ...profile,
          source: 'automatic',
          isExcluded: profile.isExcluded ?? true,
        } satisfies UnavailableProfile,
      ]),
  );

  for (const candidate of detectedUsernames) {
    const username = normalizeDeletedAccountMarker(candidate);
    if (!username) continue;
    const current = profiles.get(username);
    // Preserve an explicit correction that keeps a detected marker included.
    if (current && current.isExcluded === false) continue;
    if (!current)
      profiles.set(username, {
        username,
        reason: DELETED_ACCOUNT_MARKER_REASON,
        source: 'automatic',
        isExcluded: true,
      });
    else
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
