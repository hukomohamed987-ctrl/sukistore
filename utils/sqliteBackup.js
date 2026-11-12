/**
 * Automatic SQLite backups (only when DB_DRIVER=sqlite).
 * - A consistent copy is made with "VACUUM INTO" (safe while the store is running).
 * - Each copy is checked (integrity_check) and a failed copy is deleted.
 * - Folder: backups/sqlite/   Name: suki-YYYY-MM-DDTHH-MM-SS.sqlite
 * - .env: SQLITE_BACKUP_HOURS (default 6, 0 = off), SQLITE_BACKUP_KEEP (default 28 copies ≈ 7 days)
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const BACKUP_DIR = path.join(ROOT, 'backups', 'sqlite');

function backupNow(label = 'auto') {
  const { openDatabase } = require('../database/sqliteStore');
  const { DatabaseSync } = require('node:sqlite');
  const db = openDatabase();
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const file = path.join(BACKUP_DIR, `suki-${stamp}${label === 'auto' ? '' : '-' + label.replace(/[^a-z0-9-]/gi, '')}.sqlite`);
  db.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
  // verify the copy really opens and is healthy
  const check = new DatabaseSync(file, { readOnly: true });
  const ok = check.prepare('PRAGMA integrity_check').get();
  check.close();
  const healthy = ok && Object.values(ok)[0] === 'ok';
  if (!healthy) { try { fs.unlinkSync(file); } catch (e) { /* already gone */ } throw new Error('Backup failed the integrity check'); }
  return { file, size: fs.statSync(file).size };
}

function pruneOld(keep) {
  if (!fs.existsSync(BACKUP_DIR)) return 0;
  const files = fs.readdirSync(BACKUP_DIR).filter(f => /^suki-.*\.sqlite$/.test(f) && !/-manual|-before/.test(f)).sort(); // oldest first
  let removed = 0;
  while (files.length > keep) { fs.unlinkSync(path.join(BACKUP_DIR, files.shift())); removed++; }
  return removed;
}

function startAutoBackups() {
  if (String(process.env.DB_DRIVER || '').toLowerCase() !== 'sqlite') return;
  const hours = Number(process.env.SQLITE_BACKUP_HOURS === undefined ? 6 : process.env.SQLITE_BACKUP_HOURS);
  const keep = Math.max(1, Number(process.env.SQLITE_BACKUP_KEEP) || 28);
  if (!(hours > 0)) { console.log('🗄️  SQLite auto-backup is OFF (SQLITE_BACKUP_HOURS=0)'); return; }
  const run = () => {
    try {
      const { file, size } = backupNow();
      const removed = pruneOld(keep);
      console.log(`🗄️  SQLite backup saved: ${path.relative(ROOT, file)} (${Math.round(size / 1024)} KB)${removed ? `, removed ${removed} old` : ''}`);
    } catch (err) {
      console.error('⚠️ SQLite backup FAILED:', err.message);
    }
  };
  setTimeout(run, 30 * 1000).unref(); // first copy shortly after start
  setInterval(run, hours * 60 * 60 * 1000).unref();
  console.log(`🗄️  SQLite auto-backup every ${hours} h, keeping the last ${keep}`);
}

module.exports = { backupNow, pruneOld, startAutoBackups, BACKUP_DIR };

// Manual: node utils/sqliteBackup.js  → one backup now (kept, never pruned)
if (require.main === module) {
  require('dotenv').config({ path: path.join(ROOT, '.env') });
  const { file, size } = backupNow('manual');
  console.log(`Backup saved: ${path.relative(ROOT, file)} (${Math.round(size / 1024)} KB)`);
}
