/**
 * Clear ALL trial business data and start the store from zero.
 * Works on JSON files AND on SQLite (follows DB_DRIVER in .env).
 * Keeps: admin / staff / customer accounts, categories, brands, banners, settings, security logs.
 * Clears: products, orders, merchants (+ their logins), investors (+ their logins), all accounting,
 *         expenses, returns, reviews, carts, wishlists, notifications, support messages, chats,
 *         employees / attendance / payroll, OTP codes. Customers' loyalty points → 0.
 * A full backup is saved first. The reset itself is ALL OR NOTHING.
 *
 * Usage (stop the store first):  node scripts/reset-trial-data.js --yes
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
require('dotenv').config({ path: path.join(ROOT, '.env') });

if (!process.argv.includes('--yes')) {
  console.log('This deletes all trial data. Stop the store, then run with --yes to confirm.');
  process.exit(1);
}

const db = require('../database/db');
const DATA = path.join(ROOT, 'database', 'data');
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

(async () => {
  // 1. Backup (JSON files always; SQLite file too when it is in use)
  const BACKUP = path.join(ROOT, 'backups', `data-before-reset-${stamp}`);
  fs.mkdirSync(BACKUP, { recursive: true });
  for (const f of fs.readdirSync(DATA).filter(f => f.endsWith('.json'))) fs.copyFileSync(path.join(DATA, f), path.join(BACKUP, f));
  if (db.driver === 'sqlite') {
    const { backupNow } = require('../utils/sqliteBackup');
    const { file } = backupNow('before-reset');
    fs.copyFileSync(file, path.join(BACKUP, 'suki.sqlite'));
  }
  console.log(`Storage: ${db.driver}. Backup saved to ${path.relative(ROOT, BACKUP)}`);

  const EMPTY = ['products', 'orders', 'merchants', 'investors', 'accounting', 'expenses', 'employee_collections',
    'returns', 'reviews', 'carts', 'wishlists', 'notifications', 'support', 'chats', 'otps',
    'employees', 'attendance', 'employee_adjustments', 'payroll_runs'];

  // 2. Everything in one all-or-nothing block
  const report = await db.atomic(t => {
    const r = {};
    for (const name of EMPTY) {
      const rows = t[name].getAll();
      rows.forEach(row => t[name].delete(row.id));
      r[name] = `${rows.length} → 0`;
    }

    // Users: remove merchant / investor logins, zero customers' points
    const users = t.users.getAll();
    let removed = 0;
    for (const u of users) {
      if (u.role === 'merchant' || u.role === 'investor') { t.users.delete(u.id); removed++; }
      else if (u.role === 'customer') t.users.update(u.id, { loyaltyPoints: 0, wishlist: [] });
    }
    r.users = `${users.length} → ${users.length - removed} (حذف حسابات التجار والمستثمرين، ونقاط العملاء = 0)`;

    // Coupons: drop personal reward coupons, reset usage
    const coupons = t.coupons.getAll();
    let keptCoupons = 0;
    for (const c of coupons) {
      if (c.targetUserId || c.milestoneTarget) t.coupons.delete(c.id);
      else { t.coupons.update(c.id, { usedCount: 0 }); keptCoupons++; }
    }
    r.coupons = `${coupons.length} → ${keptCoupons} (الاستخدام = 0)`;

    // Settings: no closed months / reopen history from the trial period
    const s = t.settings.getAll()[0];
    if (s) t.settings.update(s.id, { closedPeriods: undefined, periodReopenHistory: undefined, trialDataResetAt: new Date().toISOString() });

    // Categories: stored product counters back to zero
    for (const c of t.categories.getAll()) if (c.productCount !== undefined) t.categories.update(c.id, { productCount: 0 });
    return r;
  });

  console.log(JSON.stringify(report, null, 2));
  console.log('Done. Start the store again.');
})().catch(err => { console.error('Reset FAILED — nothing was changed:', err.message); process.exit(1); });
