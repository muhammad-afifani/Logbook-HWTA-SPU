/**
 * Penyimpanan blob/objek di perangkat (IndexedDB) dengan cadangan memori bila IndexedDB
 * tidak tersedia (mode privat, kebijakan peramban). Dipakai untuk foto draft dan antrean kirim ulang.
 */
export interface BlobStore {
  get<T>(store: string, key: string): Promise<T | undefined>
  put(store: string, key: string, value: unknown): Promise<void>
  delete(store: string, key: string): Promise<void>
  keys(store: string): Promise<string[]>
  /** true bila terpaksa memakai memori (data hilang saat tab ditutup). */
  readonly degraded: boolean
}

export function createMemoryStore(): BlobStore {
  const data = new Map<string, Map<string, unknown>>()
  const bucket = (s: string) => {
    let m = data.get(s)
    if (!m) data.set(s, (m = new Map()))
    return m
  }
  return {
    degraded: true,
    get: async <T>(s: string, k: string) => bucket(s).get(k) as T | undefined,
    put: async (s, k, v) => void bucket(s).set(k, v),
    delete: async (s, k) => void bucket(s).delete(k),
    keys: async (s) => [...bucket(s).keys()],
  }
}

const DB_NAME = 'spu-form'
const STORES = ['photos', 'queue']

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      for (const s of STORES)
        if (!req.result.objectStoreNames.contains(s)) req.result.createObjectStore(s)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
    req.onblocked = () => reject(new Error('IndexedDB diblokir'))
  })
}

function tx<T>(
  db: IDBDatabase,
  store: string,
  mode: IDBTransactionMode,
  fn: (os: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode)
    const req = fn(t.objectStore(store))
    t.oncomplete = () => resolve(req.result)
    t.onerror = () => reject(t.error)
    t.onabort = () => reject(t.error)
  })
}

export function createIdbStore(): BlobStore {
  const fallback = createMemoryStore()
  let dbPromise: Promise<IDBDatabase> | null = null
  let degraded = typeof indexedDB === 'undefined'
  const db = () => (dbPromise ??= openDb())

  async function run<T>(op: (d: IDBDatabase) => Promise<T>, alt: () => Promise<T>): Promise<T> {
    if (degraded) return alt()
    try {
      return await op(await db())
    } catch {
      degraded = true
      return alt()
    }
  }

  return {
    get degraded() {
      return degraded
    },
    get: <T>(s: string, k: string) =>
      run(
        (d) => tx<T | undefined>(d, s, 'readonly', (os) => os.get(k)),
        () => fallback.get<T>(s, k),
      ),
    put: (s, k, v) =>
      run(
        async (d) => void (await tx(d, s, 'readwrite', (os) => os.put(v, k))),
        () => fallback.put(s, k, v),
      ),
    delete: (s, k) =>
      run(
        async (d) => void (await tx(d, s, 'readwrite', (os) => os.delete(k))),
        () => fallback.delete(s, k),
      ),
    keys: (s) =>
      run(
        async (d) => (await tx(d, s, 'readonly', (os) => os.getAllKeys())).map(String),
        () => fallback.keys(s),
      ),
  }
}

let shared: BlobStore | null = null
export const defaultStore = (): BlobStore => (shared ??= createIdbStore())
