/**
 * Employees, working hours and payroll (step 4).
 *  - Two pay types: monthly salary, or hourly rate × recorded hours.
 *  - Attendance: one record per employee per day (check-in / check-out → hours, overnight supported).
 *  - Adjustments: bonus (+), deduction (−), advance (cash given early, taken back from that month's salary).
 *  - Payroll run for a Cairo month: one "مرتبات" expense per employee on the store (= gross),
 *    linked to the employee, so the accounting / ledger / month closing see it like any other expense.
 *    Net paid = gross − advances. A run can be cancelled (while the month is open) and re-done.
 * Access: store owner (super admin) and accountants (write needs a non view-only accounting level).
 */
const express = require('express');
const router = express.Router();
const db = require('../database/db');
const { authenticate } = require('../middleware/auth');
const { logActivity } = require('../utils/activityLogger');
const { cairoDay, cairoMonth, todayCairo, closedMonthError, getSettings } = require('../utils/ledger');

const r2 = n => Math.round((Number(n) || 0) * 100) / 100;
const isYm = v => /^\d{4}-(0[1-9]|1[0-2])$/.test(String(v || ''));
const isDay = v => /^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) && !isNaN(new Date(`${v}T12:00:00Z`).getTime());
const isTime = v => /^([01]\d|2[0-3]):[0-5]\d$/.test(String(v || ''));
const daysInMonth = ym => { const [y, m] = ym.split('-').map(Number); return new Date(Date.UTC(y, m, 0)).getUTCDate(); };
const monthEndIso = ym => `${ym}-${String(daysInMonth(ym)).padStart(2, '0')}T12:00:00.000Z`;
const PAY_TYPES = { monthly: 'شهري', hourly: 'بالساعة' };
const ADJ_TYPES = { bonus: 'مكافأة', deduction: 'خصم', advance: 'سلفة' };

// ---------- access ----------
router.use(authenticate, (req, res, next) => {
  const u = req.user;
  const owner = u.role === 'super_admin' || u.role === 'admin';
  const accountant = u.role === 'accountant' || Boolean(u.permissions && u.permissions.canManageAccounting);
  if (!owner && !accountant) return res.status(403).json({ success: false, message: 'قسم الموظفين والمرتبات للمدير العام والمحاسب بس' });
  const level = u.accountingLevel || (u.permissions && u.permissions.accountingLevel) || 'full';
  req.canWrite = owner || (accountant && level !== 'view_only');
  next();
});
const write = (req, res, next) => (req.canWrite ? next() : res.status(403).json({ success: false, message: 'حسابك مشاهدة بس في المرتبات' }));

function hoursBetween(checkIn, checkOut) {
  const [h1, m1] = checkIn.split(':').map(Number);
  const [h2, m2] = checkOut.split(':').map(Number);
  let mins = (h2 * 60 + m2) - (h1 * 60 + m1);
  if (mins < 0) mins += 24 * 60; // night shift past midnight
  return r2(mins / 60);
}

function readEmployee(body, existing = {}) {
  const e = {};
  const err = msg => ({ error: msg });
  if (body.name !== undefined) { e.name = String(body.name).trim().slice(0, 80); if (!e.name) return err('اسم الموظف مطلوب'); }
  if (body.phone !== undefined) e.phone = String(body.phone || '').trim().slice(0, 20);
  if (body.jobTitle !== undefined) e.jobTitle = String(body.jobTitle || '').trim().slice(0, 60);
  if (body.notes !== undefined) e.notes = String(body.notes || '').trim().slice(0, 500);
  if (body.payType !== undefined) { if (!PAY_TYPES[body.payType]) return err('نوع المرتب لازم يكون شهري أو بالساعة'); e.payType = body.payType; }
  const payType = e.payType || existing.payType;
  if (body.monthlySalary !== undefined && String(body.monthlySalary) !== '') {
    const v = Number(body.monthlySalary); if (!Number.isFinite(v) || v < 0) return err('المرتب الشهري لازم يكون رقم صفر أو أكثر'); e.monthlySalary = r2(v);
  }
  if (body.hourlyRate !== undefined && String(body.hourlyRate) !== '') {
    const v = Number(body.hourlyRate); if (!Number.isFinite(v) || v < 0) return err('سعر الساعة لازم يكون رقم صفر أو أكثر'); e.hourlyRate = r2(v);
  }
  if (body.dailyHours !== undefined && String(body.dailyHours) !== '') {
    const v = Number(body.dailyHours); if (!Number.isFinite(v) || v <= 0 || v > 24) return err('ساعات اليوم من 1 لـ 24'); e.dailyHours = v;
  }
  if (body.startDate !== undefined) { if (body.startDate && !isDay(body.startDate)) return err('تاريخ التعيين غلط'); e.startDate = body.startDate || null; }
  if (body.endDate !== undefined) { if (body.endDate && !isDay(body.endDate)) return err('تاريخ نهاية العمل غلط'); e.endDate = body.endDate || null; }
  if (body.isActive !== undefined) e.isActive = Boolean(body.isActive);
  if (body.userId !== undefined) e.userId = body.userId || null;
  if (payType === 'monthly' && (e.monthlySalary ?? existing.monthlySalary) === undefined) return err('اكتب المرتب الشهري');
  if (payType === 'hourly' && (e.hourlyRate ?? existing.hourlyRate) === undefined) return err('اكتب سعر الساعة');
  return { fields: e };
}

async function nextCode() {
  const all = await db.employees.getAll();
  const max = all.reduce((m, e) => Math.max(m, Number(String(e.code || '').replace(/\D/g, '')) || 0), 0);
  return `EMP-${String(max + 1).padStart(3, '0')}`;
}

// ---------- payroll calculation (pure; used by preview, run and statements) ----------
function payrollLine(emp, ym, attendance, adjustments) {
  const att = attendance.filter(a => a.employeeId === emp.id && String(a.date).startsWith(ym));
  const hours = r2(att.reduce((s, a) => s + (Number(a.hours) || 0), 0));
  const adj = adjustments.filter(a => a.employeeId === emp.id && a.period === ym);
  const sumOf = t => r2(adj.filter(a => a.type === t).reduce((s, a) => s + (Number(a.amount) || 0), 0));
  let base = 0, rate = null, proration = null;
  if (emp.payType === 'hourly') {
    rate = Number(emp.hourlyRate) || 0;
    base = r2(hours * rate);
  } else {
    // Monthly salary, pro-rated by calendar days if hired / left during the month
    const dim = daysInMonth(ym);
    const first = `${ym}-01`, last = `${ym}-${String(dim).padStart(2, '0')}`;
    const from = emp.startDate && emp.startDate > first ? emp.startDate : first;
    const to = emp.endDate && emp.endDate < last ? emp.endDate : last;
    const days = from > to ? 0 : Math.round((new Date(`${to}T12:00:00Z`) - new Date(`${from}T12:00:00Z`)) / 86400000) + 1;
    base = r2((Number(emp.monthlySalary) || 0) * days / dim);
    if (days !== dim) proration = `${days} من ${dim} يوم`;
  }
  const bonuses = sumOf('bonus'), deductions = sumOf('deduction'), advances = sumOf('advance');
  const gross = r2(Math.max(0, base + bonuses - deductions));
  return {
    employeeId: emp.id, code: emp.code, name: emp.name, jobTitle: emp.jobTitle || '', payType: emp.payType,
    payTypeLabel: PAY_TYPES[emp.payType], hours, daysWorked: att.length, rate, monthlySalary: emp.payType === 'monthly' ? Number(emp.monthlySalary) || 0 : null,
    proration, base, bonuses, deductions, advances, gross, net: r2(gross - advances),
    adjustmentIds: adj.map(a => a.id)
  };
}

function employeeWorksIn(emp, ym) {
  const first = `${ym}-01`, last = `${ym}-${String(daysInMonth(ym)).padStart(2, '0')}`;
  if (emp.startDate && emp.startDate > last) return false;
  if (emp.endDate && emp.endDate < first) return false;
  return true;
}

// ======================= STAFF ACCOUNTS ↔ EMPLOYEES =======================
const STAFF_ROLES = ['staff', 'accountant', 'admin'];
const ROLE_AR = { staff: 'موظف لوحة تحكم', accountant: 'محاسب', admin: 'مدير', super_admin: 'المدير العام' };

// Every dashboard staff account automatically has an employee record (salary to be set by the accountant)
async function syncStaffEmployees() {
  const [users, emps] = await Promise.all([db.users.getAll(), db.employees.getAll()]);
  const staff = users.filter(u => STAFF_ROLES.includes(u.role));
  let codeNum = emps.reduce((m, e) => Math.max(m, Number(String(e.code || '').replace(/\D/g, '')) || 0), 0);
  for (const u of staff) {
    if (emps.some(e => e.userId === u.id)) continue;
    codeNum += 1;
    await db.employees.insert({
      code: `EMP-${String(codeNum).padStart(3, '0')}`, userId: u.id, name: u.name || u.email, phone: u.phone || '',
      jobTitle: ROLE_AR[u.role] || 'موظف', payType: 'monthly', monthlySalary: 0, needsSetup: true, isActive: u.isActive !== false,
      startDate: cairoDay(u.createdAt || new Date()), createdBy: 'تلقائي (حساب لوحة التحكم)'
    });
  }
  // Staff account deleted → keep the history, mark the employee as no longer working
  for (const e of emps) {
    if (e.userId && !users.some(u => u.id === e.userId) && e.isActive !== false) {
      await db.employees.update(e.id, { isActive: false, endDate: todayCairo(), userId: null, note: 'حساب لوحة التحكم اتمسح' });
    }
  }
}

function onlineSecondsBetween(user, fromDay, toDay) {
  const daily = user && user.dailyHours ? Object.values(user.dailyHours) : [];
  return daily.filter(d => d.date >= fromDay && d.date <= toDay).reduce((s, d) => s + (Number(d.seconds) || 0), 0);
}

// Accountant view: every staff member, hours actually spent on the dashboard and actions done
router.get('/staff-activity', async (req, res) => {
  try {
    await syncStaffEmployees();
    const today = todayCairo();
    const ym = isYm(req.query.period) ? req.query.period : today.slice(0, 7);
    const weekFrom = cairoDay(Date.now() - 6 * 86400000);
    const [users, logs, emps] = await Promise.all([db.users.getAll(), db.activity_logs.getAll(), db.employees.getAll()]);
    const nowMs = Date.now();
    const staff = users.filter(u => STAFF_ROLES.includes(u.role) || u.role === 'super_admin');
    const rows = staff.map(u => {
      const mine = logs.filter(l => String(l.userId) === String(u.id));
      const dayOf = l => cairoDay(l.createdAt);
      const count = pred => mine.filter(pred).length;
      const monthLogs = mine.filter(l => dayOf(l).startsWith(ym));
      const byModule = {};
      monthLogs.forEach(l => { byModule[l.module || 'أخرى'] = (byModule[l.module || 'أخرى'] || 0) + 1; });
      const online = Boolean(u.isOnline !== false && u.lastHeartbeatAt && nowMs - new Date(u.lastHeartbeatAt).getTime() < 75000);
      const emp = emps.find(e => e.userId === u.id);
      return {
        userId: u.id, name: u.name, email: u.email, role: u.role, roleLabel: ROLE_AR[u.role] || u.role,
        isActive: u.isActive !== false, online, lastSeen: u.lastHeartbeatAt || null,
        permissions: Object.keys(u.permissions || {}).filter(k => u.permissions[k] === true),
        hours: {
          today: r2(onlineSecondsBetween(u, today, today) / 3600),
          week: r2(onlineSecondsBetween(u, weekFrom, today) / 3600),
          month: r2(onlineSecondsBetween(u, `${ym}-01`, `${ym}-31`) / 3600)
        },
        actions: {
          today: count(l => dayOf(l) === today),
          week: count(l => dayOf(l) >= weekFrom && dayOf(l) <= today),
          month: monthLogs.length,
          byModule
        },
        recent: mine.slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 8)
          .map(l => ({ at: l.createdAt, action: l.action, module: l.module, details: String(l.details || '').slice(0, 140) })),
        employee: emp ? { id: emp.id, code: emp.code, payType: emp.payType, needsSetup: Boolean(emp.needsSetup) || (emp.payType === 'monthly' ? !(Number(emp.monthlySalary) > 0) : !(Number(emp.hourlyRate) > 0)) } : null
      };
    });
    res.json({ success: true, period: ym, staff: rows });
  } catch (err) {
    console.error('Staff activity error:', err);
    res.status(500).json({ success: false, message: 'فشل جلب نشاط الموظفين' });
  }
});

// Turn the dashboard online hours of one day into an attendance record (useful for hourly staff)
router.post('/attendance/from-online', write, async (req, res) => {
  const { employeeId, date } = req.body;
  const emp = employeeId ? await db.employees.getById(employeeId) : null;
  if (!emp || !emp.userId) return res.status(400).json({ success: false, message: 'الموظف ده مش مربوط بحساب لوحة تحكم' });
  const user = await db.users.getById(emp.userId);
  const secs = onlineSecondsBetween(user, date, date);
  if (!secs) return res.status(400).json({ success: false, message: 'مفيش ساعات أونلاين متسجلة في اليوم ده' });
  req.body = { employeeId, date, hours: Math.round(secs / 900) / 4, note: 'من ساعات الاتصال الفعلي على لوحة التحكم' };
  return saveAttendance(req, res);
});

// ======================= EMPLOYEES =======================
router.get('/', async (req, res) => {
  try {
    await syncStaffEmployees();
    const ym = isYm(req.query.period) ? req.query.period : todayCairo().slice(0, 7);
    const [emps, att, adj, users] = await Promise.all([db.employees.getAll(), db.attendance.getAll(), db.employee_adjustments.getAll(), db.users.getAll()]);
    const list = emps.map(e => {
      const u = e.userId ? users.find(x => x.id === e.userId) : null;
      const onlineByDay = {};
      if (u && u.dailyHours) Object.values(u.dailyHours).forEach(d => { if (String(d.date).startsWith(ym)) onlineByDay[d.date] = r2((Number(d.seconds) || 0) / 3600); });
      const needsSetup = e.payType === 'monthly' ? !(Number(e.monthlySalary) > 0) : !(Number(e.hourlyRate) > 0);
      return { ...e, needsSetup, linkedAccount: u ? { email: u.email, role: u.role } : null, onlineByDay, payTypeLabel: PAY_TYPES[e.payType], month: payrollLine(e, ym, att, adj) };
    })
      .sort((a, b) => (b.isActive !== false) - (a.isActive !== false) || String(a.code).localeCompare(String(b.code)));
    res.json({ success: true, period: ym, canWrite: req.canWrite, employees: list });
  } catch (err) {
    res.status(500).json({ success: false, message: 'فشل جلب الموظفين' });
  }
});

router.post('/', write, async (req, res) => {
  try {
    const body = { payType: 'monthly', ...req.body };
    if (!body.name) return res.status(400).json({ success: false, message: 'اسم الموظف مطلوب' });
    const r = readEmployee(body);
    if (r.error) return res.status(400).json({ success: false, message: r.error });
    const emp = await db.employees.insert({ code: await nextCode(), isActive: true, startDate: todayCairo(), ...r.fields, createdBy: req.user.name });
    await logActivity({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'CREATE_EMPLOYEE', module: 'employees', details: `أضاف الموظف ${emp.name} (${emp.code}) — ${PAY_TYPES[emp.payType]}` });
    res.status(201).json({ success: true, message: `تم إضافة ${emp.name}`, employee: emp });
  } catch (err) {
    res.status(500).json({ success: false, message: 'فشل إضافة الموظف' });
  }
});

// ======================= ATTENDANCE =======================
router.get('/attendance/list', async (req, res) => {
  try {
    const { date, period, employeeId } = req.query;
    let rows = await db.attendance.getAll();
    if (isDay(date)) rows = rows.filter(a => a.date === date);
    if (isYm(period)) rows = rows.filter(a => String(a.date).startsWith(period));
    if (employeeId) rows = rows.filter(a => a.employeeId === employeeId);
    rows.sort((a, b) => String(b.date).localeCompare(String(a.date)));
    res.json({ success: true, attendance: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: 'فشل جلب الحضور' });
  }
});

// Save (create or replace) one day for one employee
router.put('/attendance', write, (req, res) => saveAttendance(req, res));
async function saveAttendance(req, res) {
  try {
    const { employeeId, date, checkIn, checkOut, note } = req.body;
    const emp = employeeId ? await db.employees.getById(employeeId) : null;
    if (!emp) return res.status(404).json({ success: false, message: 'الموظف غير موجود' });
    if (!isDay(date)) return res.status(400).json({ success: false, message: 'التاريخ غلط (لازم 2026-11-12)' });
    if (date > todayCairo()) return res.status(400).json({ success: false, message: 'مينفعش تسجل حضور ليوم لسه ما جاش' });
    const closedErr = await closedMonthError(`${date}T12:00:00Z`);
    if (closedErr) return res.status(400).json({ success: false, message: closedErr });
    const run = await db.payroll_runs.findOne(r => r.period === date.slice(0, 7) && r.status === 'posted');
    if (run) return res.status(400).json({ success: false, message: `مرتبات شهر ${date.slice(0, 7)} اتصرفت. ألغِ الصرف الأول لو عايز تعدّل الحضور.` });
    let hours;
    if (req.body.hours !== undefined && String(req.body.hours) !== '' && !checkIn && !checkOut) {
      hours = Number(req.body.hours);
      if (!Number.isFinite(hours) || hours < 0 || hours > 24) return res.status(400).json({ success: false, message: 'عدد الساعات من 0 لـ 24' });
    } else {
      if (!isTime(checkIn) || !isTime(checkOut)) return res.status(400).json({ success: false, message: 'اكتب ساعة الحضور والانصراف بالشكل 09:00' });
      hours = hoursBetween(checkIn, checkOut);
      if (hours > 20) return res.status(400).json({ success: false, message: 'الساعات أكتر من 20 ساعة، راجع الحضور والانصراف' });
    }
    const existing = await db.attendance.findOne(a => a.employeeId === emp.id && a.date === date);
    const fields = { employeeId: emp.id, employeeName: emp.name, date, checkIn: checkIn || null, checkOut: checkOut || null, hours: r2(hours), note: String(note || '').trim().slice(0, 200), recordedBy: req.user.name };
    const saved = existing ? await db.attendance.update(existing.id, fields) : await db.attendance.insert(fields);
    res.json({ success: true, message: `تم تسجيل ${r2(hours)} ساعة لـ ${emp.name} يوم ${date}`, attendance: saved });
  } catch (err) {
    console.error('Attendance error:', err);
    res.status(500).json({ success: false, message: 'فشل تسجيل الحضور' });
  }
}

router.delete('/attendance/:id', write, async (req, res) => {
  const a = await db.attendance.getById(req.params.id);
  if (!a) return res.status(404).json({ success: false, message: 'السجل غير موجود' });
  const closedErr = await closedMonthError(`${a.date}T12:00:00Z`);
  if (closedErr) return res.status(400).json({ success: false, message: closedErr });
  if (await db.payroll_runs.findOne(r => r.period === String(a.date).slice(0, 7) && r.status === 'posted')) {
    return res.status(400).json({ success: false, message: 'مرتبات الشهر ده اتصرفت. ألغِ الصرف الأول.' });
  }
  await db.attendance.delete(a.id);
  res.json({ success: true, message: 'تم مسح يوم الحضور' });
});

// ======================= ADJUSTMENTS (bonus / deduction / advance) =======================
router.get('/adjustments/list', async (req, res) => {
  let rows = await db.employee_adjustments.getAll();
  if (isYm(req.query.period)) rows = rows.filter(a => a.period === req.query.period);
  if (req.query.employeeId) rows = rows.filter(a => a.employeeId === req.query.employeeId);
  rows.sort((a, b) => new Date(b.date) - new Date(a.date));
  res.json({ success: true, adjustments: rows.map(a => ({ ...a, typeLabel: ADJ_TYPES[a.type] })) });
});

router.post('/adjustments', write, async (req, res) => {
  try {
    const { employeeId, type, amount, note } = req.body;
    const emp = employeeId ? await db.employees.getById(employeeId) : null;
    if (!emp) return res.status(404).json({ success: false, message: 'الموظف غير موجود' });
    if (!ADJ_TYPES[type]) return res.status(400).json({ success: false, message: 'النوع لازم يكون مكافأة أو خصم أو سلفة' });
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) return res.status(400).json({ success: false, message: 'المبلغ لازم يكون أكبر من صفر' });
    const date = isDay(req.body.date) ? req.body.date : todayCairo();
    const period = isYm(req.body.period) ? req.body.period : date.slice(0, 7);
    for (const d of [`${date}T12:00:00Z`, `${period}-01T12:00:00Z`]) {
      const closedErr = await closedMonthError(d);
      if (closedErr) return res.status(400).json({ success: false, message: closedErr });
    }
    if (await db.payroll_runs.findOne(r => r.period === period && r.status === 'posted')) {
      return res.status(400).json({ success: false, message: `مرتبات ${period} اتصرفت. سجّلها على الشهر الجاي أو ألغِ الصرف.` });
    }
    const adj = await db.employee_adjustments.insert({
      employeeId: emp.id, employeeName: emp.name, type, amount: r2(value), date, period,
      note: String(note || '').trim().slice(0, 200), recordedBy: req.user.name
    });
    await logActivity({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'EMPLOYEE_ADJUSTMENT', module: 'employees', details: `${ADJ_TYPES[type]} ${r2(value)} ج.م لـ ${emp.name} (مرتب ${period})` });
    res.status(201).json({ success: true, message: `تم تسجيل ${ADJ_TYPES[type]} ${r2(value)} ج.م لـ ${emp.name}`, adjustment: adj });
  } catch (err) {
    res.status(500).json({ success: false, message: 'فشل التسجيل' });
  }
});

router.delete('/adjustments/:id', write, async (req, res) => {
  const a = await db.employee_adjustments.getById(req.params.id);
  if (!a) return res.status(404).json({ success: false, message: 'غير موجود' });
  if (a.payrollRunId) return res.status(400).json({ success: false, message: 'ده اتحسب في مرتب اتصرف. ألغِ الصرف الأول.' });
  const closedErr = await closedMonthError(`${a.date}T12:00:00Z`);
  if (closedErr) return res.status(400).json({ success: false, message: closedErr });
  await db.employee_adjustments.delete(a.id);
  res.json({ success: true, message: 'تم المسح' });
});

// ======================= PAYROLL =======================
async function computePayroll(ym) {
  const [emps, att, adj] = await Promise.all([db.employees.getAll(), db.attendance.getAll(), db.employee_adjustments.getAll()]);
  const lines = emps.filter(e => employeeWorksIn(e, ym) && (e.isActive !== false || e.endDate)).map(e => payrollLine(e, ym, att, adj))
    .filter(l => l.gross > 0 || l.advances > 0 || l.hours > 0);
  const t = k => r2(lines.reduce((s, l) => s + l[k], 0));
  return { period: ym, lines, totals: { base: t('base'), bonuses: t('bonuses'), deductions: t('deductions'), advances: t('advances'), gross: t('gross'), net: t('net'), hours: t('hours') } };
}

router.get('/payroll/runs', async (req, res) => {
  const runs = (await db.payroll_runs.getAll()).sort((a, b) => String(b.period).localeCompare(String(a.period)));
  res.json({ success: true, runs });
});

router.get('/payroll/preview', async (req, res) => {
  const ym = isYm(req.query.period) ? req.query.period : todayCairo().slice(0, 7);
  const p = await computePayroll(ym);
  const posted = await db.payroll_runs.findOne(r => r.period === ym && r.status === 'posted');
  res.json({ success: true, ...p, alreadyPosted: posted || null });
});

router.post('/payroll/run', write, async (req, res) => {
  try {
    const ym = req.body.period;
    if (!isYm(ym)) return res.status(400).json({ success: false, message: 'اختار الشهر (مثال 2026-11)' });
    if (ym > todayCairo().slice(0, 7)) return res.status(400).json({ success: false, message: 'مينفعش تصرف مرتبات شهر لسه ما جاش' });
    const closedErr = await closedMonthError(monthEndIso(ym));
    if (closedErr) return res.status(400).json({ success: false, message: closedErr });
    if (await db.payroll_runs.findOne(r => r.period === ym && r.status === 'posted')) {
      return res.status(400).json({ success: false, message: `مرتبات ${ym} اتصرفت قبل كده` });
    }
    const p = await computePayroll(ym);
    if (!p.lines.length) return res.status(400).json({ success: false, message: 'مفيش مرتبات تتصرف في الشهر ده' });
    const run = await db.payroll_runs.insert({ period: ym, status: 'posted', createdBy: req.user.name, totals: p.totals, lines: [] });
    const lines = [];
    for (const l of p.lines) {
      let expenseId = null;
      if (l.gross > 0) {
        const exp = await db.expenses.insert({
          title: `مرتب ${l.name} — ${ym}`,
          amount: l.gross, type: 'expense', category: 'مرتبات', targetType: 'general',
          merchantId: null, merchantCode: null, merchantName: null, investorId: null, investorCode: null, investorName: null, investorSharePercent: null,
          employeeId: l.employeeId, employeeName: l.name, entryType: 'salary', payrollRunId: run.id, payrollPeriod: ym,
          date: monthEndIso(ym),
          notes: `${l.payTypeLabel}${l.payType === 'hourly' ? ` (${l.hours} ساعة × ${l.rate})` : ''} + مكافآت ${l.bonuses} − خصومات ${l.deductions}. الصافي بعد السلف: ${l.net}`,
          createdBy: req.user.id, createdByName: req.user.name
        });
        expenseId = exp.id;
      }
      for (const id of l.adjustmentIds) await db.employee_adjustments.update(id, { payrollRunId: run.id });
      lines.push({ ...l, expenseId });
    }
    const saved = await db.payroll_runs.update(run.id, { lines });
    await logActivity({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'PAYROLL_RUN', module: 'employees', details: `صرف مرتبات ${ym}: ${lines.length} موظف، إجمالي ${p.totals.gross} ج.م، صافي ${p.totals.net} ج.م` });
    res.status(201).json({ success: true, message: `تم صرف مرتبات ${ym} (${lines.length} موظف) وتسجيلها في المصروفات`, run: saved });
  } catch (err) {
    console.error('Payroll run error:', err);
    res.status(500).json({ success: false, message: 'فشل صرف المرتبات' });
  }
});

router.post('/payroll/:id/cancel', write, async (req, res) => {
  const run = await db.payroll_runs.getById(req.params.id);
  if (!run || run.status !== 'posted') return res.status(404).json({ success: false, message: 'الصرف غير موجود أو اتلغى' });
  const closedErr = await closedMonthError(monthEndIso(run.period));
  if (closedErr) return res.status(400).json({ success: false, message: closedErr });
  const reason = String(req.body.reason || '').trim();
  if (reason.length < 3) return res.status(400).json({ success: false, message: 'اكتب سبب الإلغاء' });
  for (const l of run.lines || []) if (l.expenseId) await db.expenses.delete(l.expenseId);
  const adj = await db.employee_adjustments.find(a => a.payrollRunId === run.id);
  for (const a of adj) await db.employee_adjustments.update(a.id, { payrollRunId: null });
  await db.payroll_runs.update(run.id, { status: 'cancelled', cancelledBy: req.user.name, cancelledAt: new Date().toISOString(), cancelReason: reason });
  await logActivity({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'PAYROLL_CANCEL', module: 'employees', details: `إلغاء صرف مرتبات ${run.period} — ${reason}` });
  res.json({ success: true, message: `تم إلغاء صرف مرتبات ${run.period} ومسح مصروفاتها` });
});

// ======================= ONE EMPLOYEE =======================
router.get('/:id/statement', async (req, res) => {
  const emp = await db.employees.getById(req.params.id);
  if (!emp) return res.status(404).json({ success: false, message: 'الموظف غير موجود' });
  const [att, adj, runs] = await Promise.all([
    db.attendance.find(a => a.employeeId === emp.id),
    db.employee_adjustments.find(a => a.employeeId === emp.id),
    db.payroll_runs.find(r => r.status === 'posted')
  ]);
  const months = [...new Set([...att.map(a => String(a.date).slice(0, 7)), ...adj.map(a => a.period), todayCairo().slice(0, 7)])].sort().reverse().slice(0, 12);
  const byMonth = months.map(ym => {
    const run = runs.find(r => r.period === ym);
    const paid = run ? (run.lines || []).find(l => l.employeeId === emp.id) : null;
    return { period: ym, paid: Boolean(paid), line: paid || payrollLine(emp, ym, att, adj) };
  });
  res.json({
    success: true,
    employee: { ...emp, payTypeLabel: PAY_TYPES[emp.payType] },
    months: byMonth,
    attendance: att.sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 62),
    adjustments: adj.sort((a, b) => new Date(b.date) - new Date(a.date)).map(a => ({ ...a, typeLabel: ADJ_TYPES[a.type] }))
  });
});

router.put('/:id', write, async (req, res) => {
  try {
    const emp = await db.employees.getById(req.params.id);
    if (!emp) return res.status(404).json({ success: false, message: 'الموظف غير موجود' });
    const r = readEmployee(req.body, emp);
    if (r.error) return res.status(400).json({ success: false, message: r.error });
    const changed = Object.keys(r.fields).filter(k => String(r.fields[k] ?? '') !== String(emp[k] ?? ''));
    const saved = await db.employees.update(emp.id, { ...r.fields, needsSetup: false });
    if (changed.length) {
      await logActivity({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'UPDATE_EMPLOYEE', module: 'employees', details: `عدّل ${emp.name}: ${changed.map(k => `${k}: ${emp[k] ?? '—'} ← ${r.fields[k] ?? '—'}`).join(' | ')}` });
    }
    res.json({ success: true, message: 'تم الحفظ', employee: saved });
  } catch (err) {
    res.status(500).json({ success: false, message: 'فشل التعديل' });
  }
});

router.delete('/:id', write, async (req, res) => {
  const emp = await db.employees.getById(req.params.id);
  if (!emp) return res.status(404).json({ success: false, message: 'الموظف غير موجود' });
  const hasHistory = (await db.payroll_runs.find(r => (r.lines || []).some(l => l.employeeId === emp.id))).length > 0 ||
    (await db.attendance.find(a => a.employeeId === emp.id)).length > 0;
  if (hasHistory) {
    // Keep the history: the employee is only marked as no longer working
    await db.employees.update(emp.id, { isActive: false, endDate: emp.endDate || todayCairo() });
    return res.json({ success: true, message: `${emp.name} عنده حضور أو مرتبات متسجلة، فاتعلّم "مش شغال" بدل المسح (عشان الحسابات القديمة)` });
  }
  await db.employees.delete(emp.id);
  res.json({ success: true, message: `تم مسح ${emp.name}` });
});

module.exports = router;
module.exports._test = { payrollLine, hoursBetween };
