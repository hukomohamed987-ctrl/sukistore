const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const DATA_DIR = path.join(__dirname, 'data');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

class Collection {
  constructor(name) {
    this.name = name;
    this.filePath = path.join(DATA_DIR, `${name}.json`);
    this._writeLock = Promise.resolve();
    this._init();
  }

  _init() {
    if (!fs.existsSync(this.filePath)) {
      fs.writeFileSync(this.filePath, JSON.stringify([], null, 2), 'utf8');
    }
  }

  async _read() {
    try {
      if (!fs.existsSync(this.filePath)) {
        return [];
      }
      const raw = await fs.promises.readFile(this.filePath, 'utf8');
      const clean = (raw || '[]').replace(/^\uFEFF/, '').trim();
      return JSON.parse(clean || '[]');
    } catch (err) {
      console.error(`Error reading collection ${this.name}:`, err);
      return [];
    }
  }

  async _write(data) {
    // Chain onto current write lock to prevent race conditions
    this._writeLock = this._writeLock.then(async () => {
      const tempPath = `${this.filePath}.${Date.now()}.${Math.random().toString(36).substring(7)}.tmp`;
      const json = JSON.stringify(data, null, 2);
      await fs.promises.writeFile(tempPath, json, 'utf8');
      try {
        await fs.promises.rename(tempPath, this.filePath);
      } catch (renameErr) {
        // Fallback for Windows file locks (EPERM / EBUSY)
        try {
          await fs.promises.copyFile(tempPath, this.filePath);
          await fs.promises.unlink(tempPath).catch(() => {});
        } catch (copyErr) {
          await fs.promises.writeFile(this.filePath, json, 'utf8');
          await fs.promises.unlink(tempPath).catch(() => {});
        }
      }
    });
    return this._writeLock;
  }

  async getAll() {
    return await this._read();
  }

  async find(predicate) {
    const items = await this._read();
    if (typeof predicate !== 'function') return items;
    return items.filter(predicate);
  }

  async findOne(predicate) {
    const items = await this._read();
    if (typeof predicate !== 'function') return null;
    return items.find(predicate) || null;
  }

  async getById(id) {
    const items = await this._read();
    return items.find(item => String(item.id) === String(id)) || null;
  }

  async findById(id) {
    return this.getById(id);
  }

  async insert(record) {
    const items = await this._read();
    const newRecord = {
      id: record.id || uuidv4(),
      ...record,
      createdAt: record.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    items.unshift(newRecord);
    await this._write(items);
    return newRecord;
  }

  async update(id, updates) {
    const items = await this._read();
    const index = items.findIndex(item => String(item.id) === String(id));
    if (index === -1) return null;

    items[index] = {
      ...items[index],
      ...updates,
      id: items[index].id, // Prevent overwriting ID
      updatedAt: new Date().toISOString()
    };
    await this._write(items);
    return items[index];
  }

  async delete(id) {
    const items = await this._read();
    const index = items.findIndex(item => String(item.id) === String(id));
    if (index === -1) return false;
    const deleted = items.splice(index, 1);
    await this._write(items);
    return deleted[0];
  }

  async count(predicate) {
    const items = await this._read();
    if (!predicate) return items.length;
    return items.filter(predicate).length;
  }
}

// Storage engine: JSON files (default) or SQLite when .env has DB_DRIVER=sqlite.
// Both have exactly the same methods. See docs/خطة-SQLite.md
const DRIVER = String(process.env.DB_DRIVER || 'json').trim().toLowerCase();
let CollectionClass = Collection;
if (DRIVER === 'sqlite') {
  const { SqliteCollection } = require('./sqliteStore');
  CollectionClass = SqliteCollection;
  console.log(`🗄️  Storage: SQLite (${process.env.DB_SQLITE_PATH || 'database/data/suki.sqlite'})`);
}

const COLLECTION_NAMES = [
  'users', 'products', 'categories', 'orders', 'coupons', 'banners', 'reviews', 'support', 'notifications',
  'carts', 'brands', 'activity_logs', 'chats', 'otps', 'wishlists', 'settings', 'push_subscriptions',
  'push_notifications', 'login_logs', 'audit_logs', 'subcategories', 'returns', 'merchants', 'investors',
  'accounting', 'employee_collections', 'expenses',
  // Staff payroll (step 4)
  'employees', 'attendance', 'employee_adjustments', 'payroll_runs',
  // Home page picture cards ("واجهات العرض")
  'showcases'
];

const db = {};
COLLECTION_NAMES.forEach(name => { db[name] = new CollectionClass(name); });
Object.defineProperty(db, 'driver', { value: DRIVER, enumerable: false });
Object.defineProperty(db, 'collectionNames', { value: COLLECTION_NAMES, enumerable: false });

Object.defineProperty(db, 'JsonCollection', { value: Collection, enumerable: false });

/**
 * db.atomic(fn) — several writes ALL OR NOTHING (orders, stock, coupons, points, accounting).
 * fn(t) must be synchronous: t.orders / t.products / ... have getById, findOne, find, getAll,
 * insert, update, delete, count (no await). If fn throws, nothing is saved.
 * Because the block never waits, no other request can slip in between its reads and writes
 * (that is what stops two customers buying the last piece, or a double cancel).
 */
function jsonAtomic(fn) {
  const loaded = {};
  const dirty = new Set();
  const load = name => {
    if (!loaded[name]) {
      const file = db[name].filePath;
      const raw = fs.existsSync(file) ? fs.readFileSync(file, 'utf8').replace(/^﻿/, '').trim() : '[]';
      loaded[name] = JSON.parse(raw || '[]');
    }
    return loaded[name];
  };
  const view = name => ({
    getAll: () => load(name).map(r => ({ ...r })),
    find: p => (typeof p === 'function' ? load(name).filter(p) : load(name)).map(r => ({ ...r })),
    findOne: p => { if (typeof p !== 'function') return null; const r = load(name).find(p); return r ? { ...r } : null; },
    getById: id => { const r = load(name).find(x => String(x.id) === String(id)); return r ? { ...r } : null; },
    findById: id => view(name).getById(id),
    insert: record => {
      const rec = { id: record.id || uuidv4(), ...record, createdAt: record.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString() };
      load(name).unshift(rec); dirty.add(name); return { ...rec };
    },
    update: (id, updates) => {
      const items = load(name);
      const i = items.findIndex(x => String(x.id) === String(id));
      if (i === -1) return null;
      items[i] = { ...items[i], ...updates, id: items[i].id, updatedAt: new Date().toISOString() };
      dirty.add(name); return { ...items[i] };
    },
    delete: id => {
      const items = load(name);
      const i = items.findIndex(x => String(x.id) === String(id));
      if (i === -1) return false;
      dirty.add(name); return items.splice(i, 1)[0];
    },
    count: p => (p ? load(name).filter(p).length : load(name).length)
  });
  const t = {};
  COLLECTION_NAMES.forEach(name => { Object.defineProperty(t, name, { get: () => view(name), enumerable: true }); });

  const out = fn(t); // throws → nothing written
  if (out && typeof out.then === 'function') throw new Error('Atomic block must be synchronous (no await inside)');
  for (const name of dirty) {
    const file = db[name].filePath;
    const tmp = `${file}.${Date.now()}.${Math.random().toString(36).slice(2)}.atomic.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(loaded[name], null, 2), 'utf8');
    try { fs.renameSync(tmp, file); } catch (e) { fs.copyFileSync(tmp, file); fs.unlinkSync(tmp); }
  }
  return out;
}

Object.defineProperty(db, 'atomic', {
  enumerable: false,
  value: async function atomic(fn) {
    if (DRIVER === 'sqlite') {
      const { runAtomic } = require('./sqliteStore');
      const cols = {};
      COLLECTION_NAMES.forEach(name => { cols[name] = db[name]; });
      return runAtomic(cols, fn);
    }
    // JSON: let pending file writes finish first, then run the block without pausing
    await Promise.all(COLLECTION_NAMES.map(name => db[name]._writeLock.catch(() => {})));
    return jsonAtomic(fn);
  }
});

module.exports = db;
