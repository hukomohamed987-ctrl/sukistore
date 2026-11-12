/**
 * Copy all data from the JSON files (database/data/*.json) into SQLite (database/data/suki.sqlite).
 *
 *   node scripts/migrate-json-to-sqlite.js          → dry run: only checks and reports, writes nothing
 *   node scripts/migrate-json-to-sqlite.js --yes    → backup + copy + verify
 *
 * The JSON files are never changed. To go back, just remove DB_DRIVER=sqlite from .env.
 * Nothing personal is printed (only counts and ids of problem records).
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'database', 'data');
const BACKUP_ROOT = path.join(ROOT, 'backups');
const write = process.argv.includes('--yes');

const { SqliteCollection, openDatabase, DEFAULT_FILE } = require('../database/sqliteStore');

// Same list as database/db.js (read without starting the JSON engine)
const NAMES = [
  'users', 'products', 'categories', 'orders', 'coupons', 'banners', 'reviews', 'support', 'notifications',
  'carts', 'brands', 'activity_logs', 'chats', 'otps', 'wishlists', 'settings', 'push_subscriptions',
  'push_notifications', 'login_logs', 'audit_logs', 'subcategories', 'returns', 'merchants', 'investors',
  'accounting', 'employee_collections', 'expenses', 'employees', 'attendance', 'employee_adjustments', 'payroll_runs', 'showcases'
];

function readJson(name) {
  const file = path.join(DATA_DIR, `${name}.json`);
  if (!fs.existsSync(file)) return { records: [], missing: true };
  const raw = fs.readFileSync(file, 'utf8').replace(/^﻿/, '').trim();
  const data = JSON.parse(raw || '[]');
  if (!Array.isArray(data)) throw new Error(`${name}.json is not a list`);
  return { records: data, missing: false };
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const report = [];
let problems = 0;
const prepared = {};

for (const name of NAMES) {
  let records;
  try { records = readJson(name).records; } catch (err) { console.log(`✖ ${name}: can't read (${err.message})`); problems++; continue; }
  const seen = new Set();
  const fixedIds = [];
  const duplicates = [];
  const out = [];
  for (const rec of records) {
    if (!rec || typeof rec !== 'object') { problems++; continue; }
    const r = { ...rec };
    if (r.id === undefined || r.id === null || r.id === '') { r.id = crypto.randomUUID(); fixedIds.push(r.id); }
    const key = String(r.id);
    if (seen.has(key)) { duplicates.push(key); continue; } // keep the first one (what getById returned before)
    seen.add(key);
    out.push(r);
  }
  prepared[name] = out;
  report.push({ name, json: records.length, sqlite: out.length, noId: fixedIds.length, duplicates: duplicates.length });
  if (fixedIds.length) console.log(`! ${name}: ${fixedIds.length} record(s) had no id → new id given`);
  if (duplicates.length) console.log(`! ${name}: duplicate id(s) skipped (first kept): ${duplicates.slice(0, 5).join(', ')}`);
}

console.table(report);

if (!write) {
  console.log('\nDry run only — nothing was written. Run again with --yes to copy.');
  process.exit(problems ? 1 : 0);
}
if (problems) { console.log('Stopped: fix the problems above first.'); process.exit(1); }

// 1) Backup: the JSON folder + any existing SQLite file
const backupDir = path.join(BACKUP_ROOT, `before-sqlite-${stamp}`);
fs.mkdirSync(backupDir, { recursive: true });
for (const f of fs.readdirSync(DATA_DIR)) {
  if (/\.(json|sqlite)$/.test(f)) fs.copyFileSync(path.join(DATA_DIR, f), path.join(backupDir, f));
}
console.log(`Backup saved: ${path.relative(ROOT, backupDir)}`);

// 2) Copy
const sqlFile = process.env.DB_SQLITE_PATH || DEFAULT_FILE;
const sdb = openDatabase(sqlFile);
for (const name of NAMES) new SqliteCollection(name, sdb).replaceAll(prepared[name] || []);
sdb.exec('PRAGMA wal_checkpoint(TRUNCATE)');

// 3) Verify: same count, same order, identical records
let bad = 0;
(async () => {
  for (const name of NAMES) {
    const rows = await new SqliteCollection(name, sdb).getAll();
    const want = prepared[name] || [];
    const same = rows.length === want.length && rows.every((r, i) => JSON.stringify(r) === JSON.stringify(want[i]));
    if (!same) { bad++; console.log(`✖ ${name}: verification failed (${rows.length} vs ${want.length})`); }
  }
  if (bad) { console.log(`\n✖ ${bad} collection(s) differ. Keep using JSON (do not set DB_DRIVER=sqlite).`); process.exit(1); }
  console.log(`\n✔ All ${NAMES.length} collections copied and verified → ${path.relative(ROOT, sqlFile)}`);
  console.log('To switch the site: add DB_DRIVER=sqlite to .env and restart. To go back: remove it.');
})();
