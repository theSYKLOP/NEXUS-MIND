/* ==========================================================================
   NEXUS-MIND — INDEXEDDB PERSISTENCE (Multi-conversations, Chunks, Graph)
   ========================================================================== */

const DB_NAME = 'nexusmind_v2';
const DB_VERSION = 1;
let dbInstance = null;

export function openDB() {
  if (dbInstance) return Promise.resolve(dbInstance);

  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      
      // Conversations Store
      if (!db.objectStoreNames.contains('conversations')) {
        const convStore = db.createObjectStore('conversations', { keyPath: 'id' });
        convStore.createIndex('updatedAt', 'updatedAt', { unique: false });
      }

      // Messages Store
      if (!db.objectStoreNames.contains('messages')) {
        const msgStore = db.createObjectStore('messages', { keyPath: 'id' });
        msgStore.createIndex('conversationId', 'conversationId', { unique: false });
        msgStore.createIndex('createdAt', 'createdAt', { unique: false });
      }

      // Knowledge Documents
      if (!db.objectStoreNames.contains('documents')) {
        db.createObjectStore('documents', { keyPath: 'id' });
      }

      // RAG Chunks
      if (!db.objectStoreNames.contains('chunks')) {
        const chunkStore = db.createObjectStore('chunks', { keyPath: 'id' });
        chunkStore.createIndex('docId', 'docId', { unique: false });
      }

      // Graph Memory
      if (!db.objectStoreNames.contains('graph')) {
        db.createObjectStore('graph', { keyPath: 'id' });
      }
    };

    req.onsuccess = () => {
      dbInstance = req.result;
      resolve(dbInstance);
    };

    req.onerror = () => reject(req.error);
  });
}

/**
 * Ensures dbInstance is initialized before any transaction
 */
export async function getDB() {
  if (!dbInstance) {
    await openDB();
  }
  return dbInstance;
}

// Generic Store Operations
export async function dbPut(storeName, item) {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).put(item);
    tx.oncomplete = () => resolve(item);
    tx.onerror = () => reject(tx.error);
  });
}

export async function dbGetAll(storeName) {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const req = tx.objectStore(storeName).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(tx.error || req.error);
  });
}

export async function dbGet(storeName, key) {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const req = tx.objectStore(storeName).get(key);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(tx.error || req.error);
  });
}

export async function dbDelete(storeName, key) {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function dbClear(storeName) {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Clears knowledge base stores only (documents, chunks, graph)
 */
export async function clearKnowledgeBaseOnly() {
  await dbClear('documents');
  await dbClear('chunks');
  await dbClear('graph');
}

/**
 * Clears ALL local data (conversations, messages, documents, chunks, graph)
 */
export async function clearAllLocalBase() {
  const stores = ['conversations', 'messages', 'documents', 'chunks', 'graph'];
  for (const s of stores) {
    try {
      await dbClear(s);
    } catch (e) {
      console.warn(`Failed clearing store ${s}:`, e);
    }
  }
}

/**
 * Deletes a single document and all its chunks
 */
export async function deleteDocument(docId) {
  const db = await getDB();
  // 1. Delete document record
  await dbDelete('documents', docId);
  // 2. Delete all related chunks
  try {
    const tx = db.transaction('chunks', 'readwrite');
    const store = tx.objectStore('chunks');
    const index = store.index('docId');
    const req = index.getAllKeys(docId);
    req.onsuccess = () => {
      const keys = req.result || [];
      keys.forEach(k => store.delete(k));
    };
    await new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn('Error deleting associated chunks:', err);
  }
}

// Higher Level Conversation Helpers
export async function getConversations() {
  const all = await dbGetAll('conversations');
  return all.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}

export async function createConversation(title = 'Nouvelle discussion') {
  const conv = {
    id: `conv_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    title,
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  await dbPut('conversations', conv);
  return conv;
}

export async function updateConversationTitle(id, newTitle) {
  const conv = await dbGet('conversations', id);
  if (conv) {
    conv.title = newTitle;
    conv.updatedAt = Date.now();
    await dbPut('conversations', conv);
  }
}

export async function deleteConversation(id) {
  const db = await getDB();
  await dbDelete('conversations', id);
  try {
    const tx = db.transaction('messages', 'readwrite');
    const store = tx.objectStore('messages');
    const index = store.index('conversationId');
    const req = index.getAllKeys(id);
    req.onsuccess = () => {
      const keys = req.result || [];
      keys.forEach(k => store.delete(k));
    };
    await new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn('Error deleting associated messages:', err);
  }
}

export function getMessagesForConversation(conversationId) {
  return new Promise((resolve, reject) => {
    const tx = dbInstance.transaction('messages', 'readonly');
    const index = tx.objectStore('messages').index('conversationId');
    const req = index.getAll(conversationId);
    req.onsuccess = () => {
      const msgs = req.result || [];
      resolve(msgs.sort((a, b) => a.createdAt - b.createdAt));
    };
    req.onerror = () => reject(tx.error);
  });
}

export async function saveMessage(message) {
  if (!message.id) {
    message.id = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  }
  if (!message.createdAt) {
    message.createdAt = Date.now();
  }
  await dbPut('messages', message);

  // Touch conversation updatedAt
  const conv = await dbGet('conversations', message.conversationId);
  if (conv) {
    conv.updatedAt = Date.now();
    // Auto-update conversation title if it's the first user message
    if (conv.title === 'Nouvelle discussion' && message.role === 'user') {
      conv.title = message.content.slice(0, 36) + (message.content.length > 36 ? '…' : '');
    }
    await dbPut('conversations', conv);
  }
  return message;
}
