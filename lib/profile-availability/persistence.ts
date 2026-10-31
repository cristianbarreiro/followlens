import { normalizeDeletedAccountMarker } from '../relationships.ts';
import type { UnavailableProfile } from '../profile-availability.ts';
import type { ProfileVerificationRecord } from './types.ts';

const DB_NAME = 'followlens-local';
const DB_VERSION = 3;

interface StoredVerificationData {
  account: string;
  records: ProfileVerificationRecord[];
  updatedAt: string;
}

interface LegacyAvailabilityRecord {
  account: string;
  profiles: UnavailableProfile[];
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB no está disponible en este entorno.'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('snapshots')) {
        db.createObjectStore('snapshots', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('unavailableProfiles')) {
        db.createObjectStore('unavailableProfiles', { keyPath: 'account' });
      }
      if (!db.objectStoreNames.contains('verificationRecords')) {
        db.createObjectStore('verificationRecords', { keyPath: 'account' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(
        new Error('No se puede acceder al almacenamiento de este navegador.'),
      );
    request.onblocked = () =>
      reject(
        new Error('Cerrá otras pestañas de FollowLens y volvé a intentar.'),
      );
  });
}

/**
 * Loads stored verification records for a given account.
 * Automatically falls back to and migrates legacy unavailableProfiles records if present.
 */
export async function getVerificationRecords(
  account: string,
): Promise<ProfileVerificationRecord[]> {
  const db = await openDB();
  return new Promise<ProfileVerificationRecord[]>((resolve, reject) => {
    try {
      const tx = db.transaction(
        ['verificationRecords', 'unavailableProfiles'],
        'readonly',
      );
      const store = tx.objectStore('verificationRecords');
      const req = store.get(account);

      req.onsuccess = () => {
        const result = req.result as StoredVerificationData | undefined;
        if (result && Array.isArray(result.records) && result.records.length > 0) {
          resolve(result.records);
          return;
        }

        // Check legacy unavailableProfiles store for fallback
        const legacyStore = tx.objectStore('unavailableProfiles');
        const legacyReq = legacyStore.get(account);

        legacyReq.onsuccess = () => {
          const legacyResult = legacyReq.result as
            | LegacyAvailabilityRecord
            | undefined;
          if (
            legacyResult &&
            Array.isArray(legacyResult.profiles) &&
            legacyResult.profiles.length > 0
          ) {
            const migrated: ProfileVerificationRecord[] =
              legacyResult.profiles.map((profile) => {
                const isDeleted = Boolean(
                  normalizeDeletedAccountMarker(profile.username),
                );
                return {
                  username: profile.username,
                  status: isDeleted ? 'deleted_confirmed' : 'unavailable_unconfirmed',
                  verifiedAt: new Date().toISOString(),
                  providerId: 'export-evidence',
                  reason:
                    profile.reason ??
                    (isDeleted
                      ? 'Marcador de cuenta eliminada en la exportación'
                      : 'Perfil sin confirmación conservado'),
                  confidence: isDeleted ? 'high' : 'low',
                  evidence: isDeleted ? `Legacy marker: ${profile.username}` : undefined,
                  isExcluded: profile.isExcluded ?? isDeleted,
                };
              });
            resolve(migrated);
          } else {
            resolve([]);
          }
        };

        legacyReq.onerror = () => resolve([]);
      };

      req.onerror = () => reject(req.error);
      tx.oncomplete = () => db.close();
    } catch (err) {
      db.close();
      reject(err);
    }
  });
}

/**
 * Saves verification records for a specific account in IndexedDB.
 */
export async function saveVerificationRecords(
  account: string,
  records: ProfileVerificationRecord[],
): Promise<void> {
  const db = await openDB();
  return new Promise<void>((resolve, reject) => {
    try {
      const tx = db.transaction(
        ['verificationRecords', 'unavailableProfiles'],
        'readwrite',
      );
      const store = tx.objectStore('verificationRecords');
      const legacyStore = tx.objectStore('unavailableProfiles');

      if (records.length > 0) {
        store.put({
          account,
          records,
          updatedAt: new Date().toISOString(),
        } satisfies StoredVerificationData);

        // Keep legacy store in sync for backward compatibility
        const legacyProfiles: UnavailableProfile[] = records
          .filter((r) => r.status === 'deleted_confirmed')
          .map((r) => ({
            username: r.username,
            reason: r.reason,
            source: 'automatic',
            isExcluded: r.isExcluded ?? true,
          }));
        legacyStore.put({
          account,
          profiles: legacyProfiles,
        } satisfies LegacyAvailabilityRecord);
      } else {
        store.delete(account);
        legacyStore.delete(account);
      }

      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        reject(
          new Error('No se pudo guardar la verificación de perfiles en este navegador.'),
        );
      };
    } catch (err) {
      db.close();
      reject(err);
    }
  });
}

/**
 * Clears verification records for an account.
 */
export async function clearVerificationRecords(account: string): Promise<void> {
  return saveVerificationRecords(account, []);
}

