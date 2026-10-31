import {
  normalizeDeletedAccountMarker,
  type Snapshot,
} from './relationships.ts';
import type { ProfileVerificationRecord } from './profile-availability/types.ts';

// Re-export all modern types, engine, providers and registry
export * from './profile-availability/index.ts';

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

/**
 * Synchronously audits every unique relationship username using export evidence.
 * Retains 100% compatibility with synchronous importers and unit tests.
 */
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

/**
 * Converts legacy UnavailableProfile items into modern ProfileVerificationRecord objects.
 */
export function legacyToVerificationRecord(
  profile: UnavailableProfile,
): ProfileVerificationRecord {
  const isDeleted = Boolean(normalizeDeletedAccountMarker(profile.username));
  return {
    username: profile.username,
    status: isDeleted ? 'deleted_confirmed' : 'unavailable_unconfirmed',
    verifiedAt: new Date().toISOString(),
    providerId: 'export-evidence',
    reason: profile.reason || (isDeleted ? DELETED_ACCOUNT_MARKER_REASON : 'Sin confirmación'),
    confidence: isDeleted ? 'high' : 'low',
    evidence: isDeleted ? `Marker: ${profile.username}` : undefined,
    isExcluded: profile.isExcluded ?? isDeleted,
  };
}

/**
 * Converts modern ProfileVerificationRecord objects into legacy UnavailableProfile items.
 */
export function verificationRecordToLegacy(
  record: ProfileVerificationRecord,
): UnavailableProfile {
  return {
    username: record.username,
    reason: record.reason,
    source: record.providerId === 'manual' ? 'manual' : 'automatic',
    isExcluded: record.isExcluded ?? (record.status === 'deleted_confirmed' || record.status === 'deactivated_confirmed'),
  };
}
