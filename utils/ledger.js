/**
 * Accounting foundations (step 4):
 *  - Cairo dates: every day / month in the accounting is counted in Egypt time, not UTC.
 *  - ENTRY_TYPES: the fixed list of money movements shown in the unified ledger.
 *  - Month closing: a closed month (YYYY-MM) refuses any new / edited / deleted money entry dated in it.
 *  - Expense categories: one editable list instead of free text.
 */
const db = require('../database/db');

const CAIRO = 'Africa/Cairo';
const dayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: CAIRO, year: 'numeric', month: '2-digit', day: '2-digit' });

/** 'YYYY-MM-DD' of a date in Cairo time ('' for invalid dates) */
function cairoDay(date) {
  const d = date instanceof Date ? date : new Date(date || 0);
  if (isNaN(d.getTime())) return '';
  return dayFmt.format(d);
}
const cairoMonth = date => cairoDay(date).slice(0, 7);
const todayCairo = () => cairoDay(new Date());

function previousMonth(ym) {
  const [y, m] = ym.split('-').map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
}

// Money movements. direction: +1 money in, −1 money out, 0 internal (cash moving between people)
const ENTRY_TYPES = {
  order_collection:  { label: 'تحصيل طلب', direction: 1 },
  merchant_payout:   { label: 'دفعة لتاجر', direction: -1 },
  investor_payout:   { label: 'دفعة لمستثمر', direction: -1 },
  expense:           { label: 'مصروف', direction: -1 },
  revenue:           { label: 'إيراد', direction: 1 },
  remittance:        { label: 'توريد مندوب للخزنة', direction: 0 },
  capital_in:        { label: 'رأس مال داخل', direction: 1 },
  salary:            { label: 'مرتب', direction: -1 },
  employee_advance:  { label: 'سلفة موظف', direction: -1 },
  employee_bonus:    { label: 'مكافأة موظف', direction: -1 },
  employee_deduction:{ label: 'خصم من موظف', direction: 0 }
};

const DEFAULT_EXPENSE_CATEGORIES = [
  'إعلانات', 'تعبئة وتغليف', 'شحن', 'شحن استبدال', 'مرتبات', 'إيجار', 'كهرباء ومياه وإنترنت',
  'مستلزمات مكتب', 'صيانة', 'عمولات بنكية ودفع', 'رسوم حكومية', 'أخرى'
];

async function getSettings() {
  return (await db.settings.getAll())[0] || {};
}

function expenseCategories(settings) {
  const list = Array.isArray(settings && settings.expenseCategories) && settings.expenseCategories.length
    ? settings.expenseCategories : DEFAULT_EXPENSE_CATEGORIES;
  // These two are used by the system itself, so they always exist
  return [...new Set([...list, 'شحن استبدال', 'مرتبات'])];
}

function closedPeriods(settings) {
  return (settings && settings.closedPeriods && typeof settings.closedPeriods === 'object') ? settings.closedPeriods : {};
}

function isClosed(settings, date) {
  const ym = cairoMonth(date || new Date());
  return Boolean(ym && closedPeriods(settings)[ym]);
}

/** Returns an Arabic error if the date falls in a closed month, else null */
async function closedMonthError(date, settings = null) {
  const s = settings || await getSettings();
  const ym = cairoMonth(date || new Date());
  if (closedPeriods(s)[ym]) {
    return `شهر ${ym} مقفول، ومينفعش تضيف أو تعدّل أو تمسح حركات فيه. سجّل قيد تسوية في الشهر المفتوح، أو خلّي المدير العام يفتح الشهر بسبب.`;
  }
  return null;
}

module.exports = {
  CAIRO, cairoDay, cairoMonth, todayCairo, previousMonth,
  ENTRY_TYPES, DEFAULT_EXPENSE_CATEGORIES, expenseCategories,
  closedPeriods, isClosed, closedMonthError, getSettings
};
