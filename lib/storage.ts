import type { Snapshot } from './relationships';
import type { UnavailableProfile } from './profile-availability';
async function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('followlens-local', 2);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains('snapshots'))
        request.result.createObjectStore('snapshots', { keyPath: 'id' });
      if (!request.result.objectStoreNames.contains('unavailableProfiles'))
        request.result.createObjectStore('unavailableProfiles', {
          keyPath: 'account',
        });
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
type AvailabilityRecord = {
  account: string;
  profiles: UnavailableProfile[];
};

export async function getUnavailableProfiles(account: string) {
  const db = await openDB();
  return new Promise<UnavailableProfile[]>((resolve, reject) => {
    const tx = db.transaction('unavailableProfiles', 'readonly');
    const req = tx.objectStore('unavailableProfiles').get(account);
    req.onsuccess = () => {
      const profiles =
        (req.result as AvailabilityRecord | undefined)?.profiles ?? [];
      resolve(
        profiles.map((profile) => ({
          ...profile,
          source: profile.source ?? 'manual',
          isExcluded: profile.isExcluded ?? true,
        })),
      );
    };
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => db.close();
  });
}

export async function saveUnavailableProfiles(
  account: string,
  profiles: UnavailableProfile[],
) {
  const db = await openDB();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction('unavailableProfiles', 'readwrite');
    const store = tx.objectStore('unavailableProfiles');
    if (profiles.length) store.put({ account, profiles } satisfies AvailabilityRecord);
    else store.delete(account);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(new Error('No se pudo guardar la lista local de perfiles.'));
    };
  });
}

export async function getSnapshots(): Promise<Snapshot[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('snapshots', 'readonly');
    const req = tx.objectStore('snapshots').getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => db.close();
  });
}
export async function saveSnapshot(snapshot: Snapshot) {
  const db = await openDB();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction('snapshots', 'readwrite');
    tx.objectStore('snapshots').put(snapshot);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(
        new Error(
          'No se pudo guardar. Puede que el almacenamiento esté lleno.',
        ),
      );
    };
  });
}
export async function deleteSnapshot(id: string) {
  const db = await openDB();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction('snapshots', 'readwrite');
    tx.objectStore('snapshots').delete(id);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(new Error('No se pudo eliminar la importación.'));
    };
  });
}
