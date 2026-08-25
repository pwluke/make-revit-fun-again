/**
 * Where uploaded buildings are saved.
 *
 * A real export is tens of megabytes of coordinates, so localStorage is out —
 * IndexedDB is the only browser store that holds this much. Metadata and point
 * data live in separate object stores so the picker can list what is saved
 * without pulling 36 MB of voxels back into memory to do it.
 */

import type { BuildingLayer } from "./building-projects";

const DB_NAME = "make-revit-fun-again";
const DB_VERSION = 1;
const META_STORE = "building-meta";
const DATA_STORE = "building-data";

export type StoredBuildingMeta = {
  id: string;
  name: string;
  savedAt: number;
  layerCount: number;
  pointCount: number;
};

type StoredBuildingData = {
  id: string;
  layers: BuildingLayer[];
};

export function storageAvailable(): boolean {
  return typeof indexedDB !== "undefined";
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(DATA_STORE)) {
        db.createObjectStore(DATA_STORE, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB blocked"));
  });
  // A failed open must not be cached, or every later call inherits the failure.
  dbPromise.catch(() => {
    dbPromise = null;
  });
  return dbPromise;
}

function promisify<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));
  });
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = tx.onerror = () =>
      reject(tx.error ?? new Error("IndexedDB transaction failed"));
  });
}

export async function listStoredBuildings(): Promise<StoredBuildingMeta[]> {
  if (!storageAvailable()) return [];
  const db = await openDb();
  const all = await promisify(
    db.transaction(META_STORE, "readonly").objectStore(META_STORE).getAll(),
  );
  return (all as StoredBuildingMeta[]).sort((a, b) => b.savedAt - a.savedAt);
}

export async function readStoredBuilding(id: string): Promise<BuildingLayer[] | null> {
  if (!storageAvailable()) return null;
  const db = await openDb();
  const record = await promisify(
    db.transaction(DATA_STORE, "readonly").objectStore(DATA_STORE).get(id),
  );
  return (record as StoredBuildingData | undefined)?.layers ?? null;
}

export async function writeStoredBuilding(
  meta: StoredBuildingMeta,
  layers: BuildingLayer[],
): Promise<void> {
  if (!storageAvailable()) return;
  const db = await openDb();
  const tx = db.transaction([META_STORE, DATA_STORE], "readwrite");
  tx.objectStore(META_STORE).put(meta);
  tx.objectStore(DATA_STORE).put({ id: meta.id, layers } satisfies StoredBuildingData);
  await done(tx);
}

export async function deleteStoredBuilding(id: string): Promise<void> {
  if (!storageAvailable()) return;
  const db = await openDb();
  const tx = db.transaction([META_STORE, DATA_STORE], "readwrite");
  tx.objectStore(META_STORE).delete(id);
  tx.objectStore(DATA_STORE).delete(id);
  await done(tx);
}
