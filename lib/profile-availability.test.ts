import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ProfileVerificationEngine,
  ExportEvidenceProvider,
  OfficialApiProvider,
  ProviderRegistry,
  isRecordStale,
  getStaleOrPendingProfiles,
  legacyToVerificationRecord,
  verificationRecordToLegacy,
  type ProfileVerificationRecord,
  type ProfileVerificationProvider,
} from './profile-availability.ts';
import type { Snapshot } from './relationships.ts';

void test('ProfileVerificationEngine: verifies 100% of unique usernames and deduplicates followers & following', async () => {
  const engine = new ProfileVerificationEngine();
  const followers = ['alice', 'bob', 'charlie', '__deleted__123'];
  const following = ['bob', 'charlie', 'david', '__deleted__456'];
  const allUsernames = [...followers, ...following];

  const report = await engine.verifyAll(allUsernames);

  // 5 unique accounts: alice, bob, charlie, david, __deleted__123, __deleted__456 -> wait, that's 6 unique
  const uniqueCount = new Set(allUsernames).size;
  assert.equal(report.summary.totalIdentified, uniqueCount);
  assert.equal(report.summary.auditedCount, uniqueCount);
  assert.equal(report.records.length, uniqueCount);

  // Bob and charlie are shared between followers and following and are processed only once
  const recordsUsernames = report.records.map((r) => r.username).sort();
  assert.deepEqual(recordsUsernames, [
    '__deleted__123',
    '__deleted__456',
    'alice',
    'bob',
    'charlie',
    'david',
  ]);
});

void test('ExportEvidenceProvider: correctly classifies deleted markers vs unconfirmed accounts', async () => {
  const provider = new ExportEvidenceProvider();
  const result = await provider.verify([
    '__deleted__789',
    'active_user',
    'another_user',
  ]);

  assert.equal(result.records.length, 3);

  const deletedRecord = result.records.find((r) => r.username === '__deleted__789');
  assert.ok(deletedRecord);
  assert.equal(deletedRecord.status, 'deleted_confirmed');
  assert.equal(deletedRecord.confidence, 'high');
  assert.equal(deletedRecord.isExcluded, true);
  assert.match(deletedRecord.reason, /marcador explícito/i);

  const standardRecord = result.records.find((r) => r.username === 'active_user');
  assert.ok(standardRecord);
  assert.equal(standardRecord.status, 'unavailable_unconfirmed');
  assert.equal(standardRecord.confidence, 'low');
  assert.equal(standardRecord.isExcluded, false);
});

void test('Conservative exclusion rules: only confirmed deletions/deactivations are excluded from metrics', () => {
  const baseRecord: ProfileVerificationRecord = {
    username: 'test_user',
    status: 'available',
    verifiedAt: new Date().toISOString(),
    providerId: 'test',
    reason: 'test reason',
    confidence: 'high',
  };

  // available -> kept
  assert.equal(
    ProfileVerificationEngine.isRecordExcluded({ ...baseRecord, status: 'available' }),
    false,
  );

  // private -> kept
  assert.equal(
    ProfileVerificationEngine.isRecordExcluded({ ...baseRecord, status: 'private' }),
    false,
  );

  // unavailable_unconfirmed -> kept
  assert.equal(
    ProfileVerificationEngine.isRecordExcluded({
      ...baseRecord,
      status: 'unavailable_unconfirmed',
      confidence: 'low',
    }),
    false,
  );

  // unknown -> kept
  assert.equal(
    ProfileVerificationEngine.isRecordExcluded({ ...baseRecord, status: 'unknown' }),
    false,
  );

  // verification_error -> kept
  assert.equal(
    ProfileVerificationEngine.isRecordExcluded({
      ...baseRecord,
      status: 'verification_error',
    }),
    false,
  );

  // deleted_confirmed -> excluded
  assert.equal(
    ProfileVerificationEngine.isRecordExcluded({
      ...baseRecord,
      status: 'deleted_confirmed',
    }),
    true,
  );

  // deactivated_confirmed -> excluded
  assert.equal(
    ProfileVerificationEngine.isRecordExcluded({
      ...baseRecord,
      status: 'deactivated_confirmed',
    }),
    true,
  );

  // User explicit override: if isExcluded === false, even deleted_confirmed is preserved
  assert.equal(
    ProfileVerificationEngine.isRecordExcluded({
      ...baseRecord,
      status: 'deleted_confirmed',
      isExcluded: false,
    }),
    false,
  );
});

void test('Snapshot filtering: excludes confirmed deleted accounts without mutating original snapshot', () => {
  const snapshot: Snapshot = {
    id: 'snap1',
    account: 'my_account',
    date: '2026-10-31',
    importedAt: '2026-10-31T12:00:00Z',
    followers: ['alice', 'bob', '__deleted__old'],
    following: ['bob', '__deleted__old', 'charlie'],
  };

  const recordsMap = new Map<string, ProfileVerificationRecord>([
    [
      '__deleted__old',
      {
        username: '__deleted__old',
        status: 'deleted_confirmed',
        verifiedAt: new Date().toISOString(),
        providerId: 'export-evidence',
        reason: 'Marcador de exportación',
        confidence: 'high',
        isExcluded: true,
      },
    ],
    [
      'alice',
      {
        username: 'alice',
        status: 'unavailable_unconfirmed',
        verifiedAt: new Date().toISOString(),
        providerId: 'export-evidence',
        reason: 'Sin confirmación',
        confidence: 'low',
        isExcluded: false,
      },
    ],
  ]);

  const filtered = ProfileVerificationEngine.filterSnapshot(snapshot, recordsMap);

  // Original snapshot is not mutated
  assert.equal(snapshot.followers.length, 3);
  assert.equal(snapshot.following.length, 3);

  // Filtered snapshot excludes __deleted__old from both sets
  assert.deepEqual(filtered.followers, ['alice', 'bob']);
  assert.deepEqual(filtered.following, ['bob', 'charlie']);
});

void test('Cancellation: engine supports AbortSignal and reports interrupted status cleanly', async () => {
  const engine = new ProfileVerificationEngine();
  const controller = new AbortController();

  const mockProvider: ProfileVerificationProvider = {
    id: 'slow-mock',
    name: 'Slow Mock',
    description: 'Simulates slow batching',
    isAvailable: () => true,
    canVerify: () => true,
    async verify(usernames, options) {
      const records: ProfileVerificationRecord[] = [];
      for (let i = 0; i < usernames.length; i++) {
        if (options?.signal?.aborted) break;
        if (i === 1) controller.abort(); // Cancel during 2nd item
        records.push({
          username: usernames[i],
          status: 'available',
          verifiedAt: new Date().toISOString(),
          providerId: 'slow-mock',
          reason: 'OK',
          confidence: 'high',
        });
      }
      return { records };
    },
  };

  const report = await engine.verifyAll(['user1', 'user2', 'user3', 'user4'], {
    provider: mockProvider,
    signal: controller.signal,
  });

  assert.equal(report.interrupted, true);
  assert.ok(report.records.length < 4);
});

void test('Progress reporting: fires onProgress callbacks with detailed counts and percentages', async () => {
  const engine = new ProfileVerificationEngine();
  const progressEvents: number[] = [];

  const usernames = Array.from({ length: 15 }, (_, i) => `user_${i}`);
  await engine.verifyAll(usernames, {
    batchSize: 5,
    onProgress: (p) => {
      progressEvents.push(p.percent);
    },
  });

  assert.ok(progressEvents.length >= 3);
  assert.equal(progressEvents[progressEvents.length - 1], 100);
});

void test('Scheduler: correctly flags stale records according to status and nextCheckAfter', () => {
  const now = Date.now();

  // Export evidence deletion marker never expires
  const permanentDeleted: ProfileVerificationRecord = {
    username: '__deleted__123',
    status: 'deleted_confirmed',
    verifiedAt: new Date(now - 100 * 24 * 60 * 60 * 1000).toISOString(),
    providerId: 'export-evidence',
    reason: 'Export marker',
    confidence: 'high',
  };
  assert.equal(isRecordStale(permanentDeleted), false);

  // Network error is stale after retry age (5 minutes)
  const freshError: ProfileVerificationRecord = {
    username: 'user_err',
    status: 'verification_error',
    verifiedAt: new Date(now - 60 * 1000).toISOString(), // 1 min ago
    providerId: 'test',
    reason: 'Net error',
    confidence: 'none',
  };
  assert.equal(isRecordStale(freshError), false);

  const staleError: ProfileVerificationRecord = {
    username: 'user_err',
    status: 'verification_error',
    verifiedAt: new Date(now - 10 * 60 * 1000).toISOString(), // 10 mins ago
    providerId: 'test',
    reason: 'Net error',
    confidence: 'none',
  };
  assert.equal(isRecordStale(staleError), true);

  // Expired nextCheckAfter
  const expiredSchedule: ProfileVerificationRecord = {
    username: 'user_sched',
    status: 'unavailable_unconfirmed',
    verifiedAt: new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString(),
    nextCheckAfter: new Date(now - 1000).toISOString(), // Expired 1s ago
    providerId: 'test',
    reason: 'Unconfirmed',
    confidence: 'low',
  };
  assert.equal(isRecordStale(expiredSchedule), true);

  // Stale detection in profile list
  const existingRecords = new Map<string, ProfileVerificationRecord>([
    ['permanent', permanentDeleted],
    ['stale', staleError],
  ]);
  const pending = getStaleOrPendingProfiles(
    ['permanent', 'stale', 'brand_new'],
    existingRecords,
  );
  assert.deepEqual(pending.sort(), ['brand_new', 'stale'].sort());
});

void test('OfficialApiProvider: cleanly handles unconfigured state without fraudulent simulation', async () => {
  const provider = new OfficialApiProvider();
  assert.equal(provider.isAvailable(), false);

  const result = await provider.verify(['business_user', 'personal_user']);
  assert.equal(result.records.length, 2);
  assert.equal(result.records[0].status, 'verification_error');
  assert.match(result.records[0].reason, /no está configurada/i);
});

void test('ProviderRegistry: allows registration, switching default and unregistering providers', () => {
  const registry = new ProviderRegistry();
  const customProvider: ProfileVerificationProvider = {
    id: 'custom-provider',
    name: 'Custom Provider',
    description: 'Custom test provider',
    isAvailable: () => true,
    canVerify: () => true,
    verify: async (usernames) => ({
      records: usernames.map((u) => ({
        username: u,
        status: 'available',
        verifiedAt: new Date().toISOString(),
        providerId: 'custom-provider',
        reason: 'Custom verified',
        confidence: 'high',
      })),
    }),
  };

  registry.register(customProvider);
  assert.equal(registry.get('custom-provider'), customProvider);

  assert.equal(registry.setDefault('custom-provider'), true);
  assert.equal(registry.getDefault().id, 'custom-provider');

  // Cannot unregister current default
  assert.equal(registry.unregister('custom-provider'), false);

  // Switch back to export-evidence, then unregister
  registry.setDefault('export-evidence');
  assert.equal(registry.unregister('custom-provider'), true);
  assert.equal(registry.get('custom-provider'), undefined);
});

void test('Legacy conversion helpers: cleanly roundtrip between UnavailableProfile and ProfileVerificationRecord', () => {
  const legacyDeleted = {
    username: '__deleted__abc',
    reason: 'Marcador de cuenta eliminada en la exportación',
    source: 'automatic' as const,
    isExcluded: true,
  };

  const record = legacyToVerificationRecord(legacyDeleted);
  assert.equal(record.username, '__deleted__abc');
  assert.equal(record.status, 'deleted_confirmed');
  assert.equal(record.confidence, 'high');
  assert.equal(record.isExcluded, true);

  const backToLegacy = verificationRecordToLegacy(record);
  assert.equal(backToLegacy.username, '__deleted__abc');
  assert.equal(backToLegacy.isExcluded, true);
});
