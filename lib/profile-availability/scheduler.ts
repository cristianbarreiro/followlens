import type {
  ProfileVerificationRecord,
  ProfileVerificationStatus,
} from './types.ts';

export const DEFAULT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
export const ERROR_RETRY_AGE_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Determines whether a verification record has expired and requires re-checking.
 */
export function isRecordStale(
  record: ProfileVerificationRecord,
  maxAgeMs = DEFAULT_MAX_AGE_MS,
): boolean {
  // Explicit deleted marker in official export has permanent validity
  if (
    record.status === 'deleted_confirmed' &&
    record.providerId === 'export-evidence' &&
    record.confidence === 'high'
  ) {
    return false;
  }

  // Network or API errors should be retried quickly
  if (record.status === 'verification_error') {
    const verifiedTime = new Date(record.verifiedAt).getTime();
    return isNaN(verifiedTime) || Date.now() - verifiedTime > ERROR_RETRY_AGE_MS;
  }

  // If nextCheckAfter is explicitly defined
  if (record.nextCheckAfter) {
    const nextCheckTime = new Date(record.nextCheckAfter).getTime();
    if (!isNaN(nextCheckTime)) {
      return Date.now() >= nextCheckTime;
    }
  }

  // Default age check
  const verifiedTime = new Date(record.verifiedAt).getTime();
  if (isNaN(verifiedTime)) return true;
  return Date.now() - verifiedTime > maxAgeMs;
}

/**
 * Returns the list of usernames that need verification:
 * - Profiles without any recorded verification
 * - Profiles whose record is stale or has pending retries
 * - All profiles if forceRecheck is enabled
 */
export function getStaleOrPendingProfiles(
  usernames: string[],
  existingRecords: Map<string, ProfileVerificationRecord>,
  options: { forceRecheck?: boolean; maxAgeMs?: number } = {},
): string[] {
  if (options.forceRecheck) {
    return [...usernames];
  }

  const result: string[] = [];
  for (const username of usernames) {
    const record = existingRecords.get(username);
    if (!record) {
      result.push(username);
    } else if (isRecordStale(record, options.maxAgeMs)) {
      result.push(username);
    }
  }
  return result;
}

/**
 * Helper to calculate recommended next check timestamp based on verification status.
 */
export function calculateNextCheckIso(
  status: ProfileVerificationStatus,
): string | undefined {
  const now = Date.now();
  switch (status) {
    case 'deleted_confirmed':
      return undefined; // Permanent
    case 'verification_error':
      return new Date(now + ERROR_RETRY_AGE_MS).toISOString();
    case 'unavailable_unconfirmed':
    case 'unknown':
      return new Date(now + DEFAULT_MAX_AGE_MS).toISOString();
    case 'available':
    case 'private':
    case 'renamed':
      return new Date(now + 30 * 24 * 60 * 60 * 1000).toISOString(); // 30 days
    case 'deactivated_confirmed':
    case 'suspended_confirmed':
      return new Date(now + 14 * 24 * 60 * 60 * 1000).toISOString(); // 14 days
  }
}
