import { BookCover, PrintJob } from "@/types";

const DB_NAME = "photo-booth-book";
const DB_VERSION = 2;
const STORE_NAME = "bookCovers";
const PRINT_HISTORY_STORE = "printHistory";

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(PRINT_HISTORY_STORE)) {
        db.createObjectStore(PRINT_HISTORY_STORE, { keyPath: "id" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function getAllBookCovers(): Promise<BookCover[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const request = store.getAll();
    request.onsuccess = () => {
      const covers = request.result as BookCover[];
      covers.sort((a, b) => (a.order ?? Infinity) - (b.order ?? Infinity) || b.createdAt - a.createdAt);
      resolve(covers);
    };
    request.onerror = () => reject(request.error);
  });
}

export async function getBookCover(id: string): Promise<BookCover | undefined> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(id);
    request.onsuccess = () => resolve(request.result as BookCover | undefined);
    request.onerror = () => reject(request.error);
  });
}

export async function saveBookCover(cover: BookCover): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    store.put(cover);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function deleteBookCover(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    store.delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function savePrintJob(job: PrintJob): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PRINT_HISTORY_STORE, "readwrite");
    const store = tx.objectStore(PRINT_HISTORY_STORE);
    store.put(job);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getPrintJob(id: string): Promise<PrintJob | undefined> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PRINT_HISTORY_STORE, "readonly");
    const store = tx.objectStore(PRINT_HISTORY_STORE);
    const request = store.get(id);
    request.onsuccess = () => resolve(request.result as PrintJob | undefined);
    request.onerror = () => reject(request.error);
  });
}

export async function getAllPrintJobs(): Promise<PrintJob[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PRINT_HISTORY_STORE, "readonly");
    const store = tx.objectStore(PRINT_HISTORY_STORE);
    const request = store.getAll();
    request.onsuccess = () => {
      const jobs = request.result as PrintJob[];
      jobs.sort((a, b) => b.printedAt - a.printedAt);
      resolve(jobs);
    };
    request.onerror = () => reject(request.error);
  });
}

export async function deletePrintJob(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PRINT_HISTORY_STORE, "readwrite");
    const store = tx.objectStore(PRINT_HISTORY_STORE);
    store.delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
