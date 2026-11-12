/**
 * SQLite storage (built into Node 22.5+, no extra package) with the SAME methods as the
 * JSON Collection in db.js, so no route has to change.
 *
 * - One file: database/data/suki.sqlite (folder is blocked from the browser).
 * - One table per collection: id (primary key) | pos (keeps the old "newest first" order) | data (full record as JSON).
 * - Every write is a synchronous statement inside a transaction, so two requests at the same
 *   moment can no longer overwrite each other's changes (the JSON files could).
 * - runAtomic(fn): several writes all-or-nothing (used for orders / stock / accounting).
 */
const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');
const { v4: uuidv4 } = require('uuid');

const DEFAULT_FILE = path.join(__dirname, 'data', 'suki.sqlite');
const handles = new Map(); // file → { db, depth }

function openDatabase(file = process.env.DB_SQLITE_PATH || DEFAULT_FILE) {
  if (handles.has(file)) return handles.get(file).db;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON;');
  handles.set(file, { db, depth: 0 });
  return db;
}

// Close the file cleanly (scripts / restore). Writes everything from the WAL into the main file first.
function closeDatabase(file = process.env.DB_SQLITE_PATH || DEFAULT_FILE) {
  const h = handles.get(file);
  if (!h) return false;
  try { h.db.exec('PRAGMA wal_checkpoint(TRUNCATE)'); } catch (e) { /* read-only or already closed */ }
  h.db.close();
  handles.delete(file);
  return true;
}

function handleOf(db) {
  for (const h of handles.values()) if (h.db === db) return h;
  const h = { db, depth: 0 };
  handles.set(Symbol('db'), h);
  return h;
}

// Run fn inside one transaction (nested calls join the outer one)
function inTransaction(db, fn) {
  const h = handleOf(db);
  if (h.depth > 0) return fn();
  db.exec('BEGIN IMMEDIATE');
  h.depth = 1;
  try {
    const out = fn();
    if (out && typeof out.then === 'function') throw new Error('Atomic block must be synchronous (no await inside)');
    db.exec('COMMIT');
    return out;
  } catch (err) {
    try { db.exec('ROLLBACK'); } catch (e) { /* nothing to roll back */ }
    throw err;
  } finally {
    h.depth = 0;
  }
}

const SAFE_NAME = /^[a-z_][a-z0-9_]*$/;

class SqliteCollection {
  constructor(name, db = openDatabase()) {
    if (!SAFE_NAME.test(name)) throw new Error(`Bad collection name: ${name}`);
    this.name = name;
    this.db = db;
    db.exec(`CREATE TABLE IF NOT EXISTS "${name}" (id TEXT PRIMARY KEY, pos INTEGER NOT NULL, data TEXT NOT NULL)`);
    db.exec(`CREATE INDEX IF NOT EXISTS "${name}_pos" ON "${name}" (pos)`);
    this.q = {
      all: db.prepare(`SELECT data FROM "${name}" ORDER BY pos ASC`),
      byId: db.prepare(`SELECT data FROM "${name}" WHERE id = ?`),
      minPos: db.prepare(`SELECT MIN(pos) AS p FROM "${name}"`),
      upsert: db.prepare(`INSERT OR REPLACE INTO "${name}" (id, pos, data) VALUES (?, ?, ?)`),
      setData: db.prepare(`UPDATE "${name}" SET data = ? WHERE id = ?`),
      del: db.prepare(`DELETE FROM "${name}" WHERE id = ?`),
      count: db.prepare(`SELECT COUNT(*) AS n FROM "${name}"`)
    };
  }

  // ---------- synchronous core (also used inside atomic blocks) ----------
  getAllSync() { return this.q.all.all().map(r => JSON.parse(r.data)); }
  findSync(predicate) { const items = this.getAllSync(); return typeof predicate === 'function' ? items.filter(predicate) : items; }
  findOneSync(predicate) { if (typeof predicate !== 'function') return null; return this.getAllSync().find(predicate) || null; }
  getByIdSync(id) {
    if (id === undefined || id === null) return null;
    const row = this.q.byId.get(String(id));
    return row ? JSON.parse(row.data) : null;
  }
  insertSync(record) {
    const newRecord = {
      id: record.id || uuidv4(),
      ...record,
      createdAt: record.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    inTransaction(this.db, () => {
      const min = this.q.minPos.get().p;
      const pos = (min === null || min === undefined) ? 0 : min - 1; // newest first, like the JSON files
      this.q.upsert.run(String(newRecord.id), pos, JSON.stringify(newRecord));
    });
    return newRecord;
  }
  updateSync(id, updates) {
    return inTransaction(this.db, () => {
      const row = this.q.byId.get(String(id));
      if (!row) return null;
      const current = JSON.parse(row.data);
      const next = { ...current, ...updates, id: current.id, updatedAt: new Date().toISOString() };
      this.q.setData.run(JSON.stringify(next), String(id));
      return next;
    });
  }
  deleteSync(id) {
    return inTransaction(this.db, () => {
      const row = this.q.byId.get(String(id));
      if (!row) return false;
      this.q.del.run(String(id));
      return JSON.parse(row.data);
    });
  }
  countSync(predicate) {
    if (!predicate) return this.q.count.get().n;
    return this.getAllSync().filter(predicate).length;
  }

  // ---------- async API (same as the JSON Collection) ----------
  async getAll() { return this.getAllSync(); }
  async find(predicate) { return this.findSync(predicate); }
  async findOne(predicate) { return this.findOneSync(predicate); }
  async getById(id) { return this.getByIdSync(id); }
  async findById(id) { return this.getByIdSync(id); }
  async insert(record) { return this.insertSync(record); }
  async update(id, updates) { return this.updateSync(id, updates); }
  async delete(id) { return this.deleteSync(id); }
  async count(predicate) { return this.countSync(predicate); }

  // Used by the migration script only: replace the whole table with these records (keeps their order)
  replaceAll(records) {
    inTransaction(this.db, () => {
      this.db.exec(`DELETE FROM "${this.name}"`);
      records.forEach((rec, i) => this.q.upsert.run(String(rec.id), i, JSON.stringify(rec)));
    });
  }
}

// Synchronous view of a collection for atomic blocks
function syncView(col) {
  return {
    getAll: () => col.getAllSync(),
    find: p => col.findSync(p),
    findOne: p => col.findOneSync(p),
    getById: id => col.getByIdSync(id),
    findById: id => col.getByIdSync(id),
    insert: r => col.insertSync(r),
    update: (id, u) => col.updateSync(id, u),
    delete: id => col.deleteSync(id),
    count: p => col.countSync(p)
  };
}

// All-or-nothing: fn(t) gets synchronous collections (t.orders, t.products, ...). Any throw → nothing is saved.
function runAtomic(collections, fn) {
  const first = Object.values(collections)[0];
  const t = {};
  for (const [name, col] of Object.entries(collections)) t[name] = syncView(col);
  return inTransaction(first.db, () => fn(t));
}

module.exports = { SqliteCollection, openDatabase, closeDatabase, runAtomic, inTransaction, DEFAULT_FILE };
