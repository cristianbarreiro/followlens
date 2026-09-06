import type { Snapshot } from './relationships';
async function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('followlens-local', 1);
    request.onupgradeneeded = () =>
      request.result.createObjectStore('snapshots', { keyPath: 'id' });
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
