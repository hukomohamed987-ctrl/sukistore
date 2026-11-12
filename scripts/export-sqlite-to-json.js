/**
 * Way back: write the current SQLite data to the JSON files, so the site can run on JSON again.
 *
 *   node scripts/export-sqlite-to-json.js          → dry run (counts only)
 *   node scripts/export-sqlite-to-json.js --yes    → backup current JSON files, then overwrite them
 *
 * After it: remove DB_DRIVER=sqlite from .env and restart.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'database', 'data');
const write = process.argv.includes('--yes');
const { SqliteCollection, openDatabase, DEFAULT_FILE } = require('../database/sqliteStore');

const sqlFile = process.env.DB_SQLITE_PATH || DEFAULT_FILE;
if (!fs.existsSync(sqlFile)) { console.log('No SQLite file found — nothing to export.'); process.exit(1); }
const sdb = openDatabase(sqlFile);
const names = sdb.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all().map(r => r.name);

(async () => {
  const out = {};
  for (const name of names) out[name] = await new SqliteCollection(name, sdb).getAll();
  console.table(names.map(n => ({ name: n, records: out[n].length })));
  if (!write) { console.log('Dry run only. Run with --yes to write the JSON files.'); return; }

  const backupDir = path.join(ROOT, 'backups', `json-before-export-${new Date().toISOString().replace(/[:.]/g, '-')}`);
  fs.mkdirSync(backupDir, { recursive: true });
  for (const f of fs.readdirSync(DATA_DIR)) if (f.endsWith('.json')) fs.copyFileSync(path.join(DATA_DIR, f), path.join(backupDir, f));
  for (const name of names) {
    const file = path.join(DATA_DIR, `${name}.json`);
    const tmp = `${file}.${Date.now()}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(out[name], null, 2), 'utf8');
    fs.renameSync(tmp, file);
  }
  console.log(`✔ Exported ${names.length} collections to JSON. Old JSON files saved in ${path.relative(ROOT, backupDir)}`);
})();
