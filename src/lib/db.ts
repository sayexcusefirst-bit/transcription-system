import { openDB, DBSchema, IDBPDatabase } from 'idb';

interface TranscriptionDB extends DBSchema {
  documents: {
    key: string;
    value: {
      id: string;
      fileName: string;
      uploadDate: number;
      totalPages: number;
      pdfBlob: Blob;
      lastWorkedAt: number;
    };
  };
  pages: {
    key: string;
    value: {
      id: string; // docId_pageNum
      documentId: string;
      pageNumber: number;
      rawText: string;
      isCompleted: boolean;
      completedAt?: number;
      timeSpent: number;
      pasteEvents: number;
      lastModified: number;
    };
    indexes: { 'by-documentId': string };
  };
  settings: {
    key: string;
    value: {
      id: string;
      fontSize: number;
      gridOverlay: boolean;
      syncScroll: boolean;
    };
  };
}

let dbPromise: Promise<IDBPDatabase<TranscriptionDB>>;

export function getDB() {
  if (!dbPromise && typeof window !== 'undefined') {
    dbPromise = openDB<TranscriptionDB>('TranscriptionDB', 1, {
      upgrade(db) {
        db.createObjectStore('documents', { keyPath: 'id' });
        const pageStore = db.createObjectStore('pages', { keyPath: 'id' });
        pageStore.createIndex('by-documentId', 'documentId');
        db.createObjectStore('settings', { keyPath: 'id' });
      },
    });
  }
  return dbPromise;
}

export async function addDocument(file: File, totalPages: number): Promise<string> {
  const db = await getDB();
  const id = crypto.randomUUID();
  const blob = new Blob([file], { type: file.type });
  
  await db.put('documents', {
    id,
    fileName: file.name,
    uploadDate: Date.now(),
    lastWorkedAt: Date.now(),
    totalPages,
    pdfBlob: blob,
  });

  // Initialize pages
  const tx = db.transaction('pages', 'readwrite');
  for (let i = 1; i <= totalPages; i++) {
    await tx.store.put({
      id: `${id}_${i}`,
      documentId: id,
      pageNumber: i,
      rawText: '',
      isCompleted: false,
      timeSpent: 0,
      pasteEvents: 0,
      lastModified: Date.now(),
    });
  }
  await tx.done;
  return id;
}

export async function getDocuments() {
  const db = await getDB();
  return db.getAll('documents');
}

export async function getDocument(id: string) {
  const db = await getDB();
  return db.get('documents', id);
}

export async function getPagesForDocument(documentId: string) {
  const db = await getDB();
  return db.getAllFromIndex('pages', 'by-documentId', documentId);
}

export async function updatePage(page: TranscriptionDB['pages']['value']) {
  const db = await getDB();
  page.lastModified = Date.now();
  await db.put('pages', page);
  
  const doc = await db.get('documents', page.documentId);
  if (doc) {
    doc.lastWorkedAt = Date.now();
    await db.put('documents', doc);
  }
}

export async function getPage(documentId: string, pageNumber: number) {
  const db = await getDB();
  return db.get('pages', `${documentId}_${pageNumber}`);
}

export async function deleteDocument(id: string) {
    const db = await getDB();
    await db.delete('documents', id);
    const tx = db.transaction('pages', 'readwrite');
    const pages = await tx.store.index('by-documentId').getAllKeys(id);
    for(const pageKey of pages) {
        await tx.store.delete(pageKey);
    }
    await tx.done;
}
