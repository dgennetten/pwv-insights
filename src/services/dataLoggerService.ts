import type { LogEntry, LogSession } from '../types/dataLogger'

const DB_NAME    = 'pwv_data_logger'
const DB_VERSION = 1

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result
      if (!db.objectStoreNames.contains('sessions')) {
        db.createObjectStore('sessions', { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains('entries')) {
        const store = db.createObjectStore('entries', { keyPath: 'id', autoIncrement: true })
        store.createIndex('sessionId', 'sessionId', { unique: false })
      }
    }
    req.onsuccess = (e) => resolve((e.target as IDBOpenDBRequest).result)
    req.onerror   = (e) => reject((e.target as IDBOpenDBRequest).error)
  })
}

export async function getOrCreateSession(dateKey: string): Promise<LogSession> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx    = db.transaction('sessions', 'readwrite')
    const store = tx.objectStore('sessions')
    const get   = store.get(dateKey)
    get.onsuccess = () => {
      if (get.result) { resolve(get.result as LogSession); return }
      const session: LogSession = { id: dateKey, startedAt: Date.now() }
      const put = store.put(session)
      put.onsuccess = () => resolve(session)
      put.onerror   = () => reject(put.error)
    }
    get.onerror = () => reject(get.error)
  })
}

export async function addEntry(entry: Omit<LogEntry, 'id'>): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx  = db.transaction('entries', 'readwrite')
    const req = tx.objectStore('entries').add(entry)
    req.onsuccess = () => resolve()
    req.onerror   = () => reject(req.error)
  })
}

export async function getSessionEntries(sessionId: string): Promise<LogEntry[]> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx    = db.transaction('entries', 'readonly')
    const index = tx.objectStore('entries').index('sessionId')
    const req   = index.getAll(sessionId)
    req.onsuccess = () => resolve(req.result as LogEntry[])
    req.onerror   = () => reject(req.error)
  })
}

export async function markSessionEmailed(sessionId: string): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx    = db.transaction('sessions', 'readwrite')
    const store = tx.objectStore('sessions')
    const get   = store.get(sessionId)
    get.onsuccess = () => {
      const session = get.result as LogSession | undefined
      if (!session) { resolve(); return }
      const put = store.put({ ...session, emailedAt: Date.now() })
      put.onsuccess = () => resolve()
      put.onerror   = () => reject(put.error)
    }
    get.onerror = () => reject(get.error)
  })
}
