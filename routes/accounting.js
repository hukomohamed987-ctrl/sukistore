const express = require('express');
const router = express.Router();
const db = require('../database/db');
const { authenticate } = require('../middleware/auth');
const { logActivity } = require('../utils/activityLogger');
const {
  getInvestorProducts,
  getMerchantProducts,
  matchOrderItemToInvestor,
  matchOrderItemToMerchant
} = require('../utils/ownershipHelper');
const { loadContext, orderEconomics, deliveredDate, expenseSplit, getCapitalBatches, totalCapital, investorSharePercent, round2, productCost, investorFigures } = require('../utils/financeEngine');
const { cairoDay, cairoMonth, todayCairo, previousMonth, ENTRY_TYPES, expenseCategories, closedPeriods, closedMonthError, getSettings: getStoreSettings } = require('../utils/ledger');
const { recordAuditLog } = require('../utils/security');

// Middleware: Check if user has Accounting Access (Accountant, Staff with Permission, or Super Admin)
function checkAccountingAccess(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ success: false, message: 'يجب تسجيل الدخول أولاً' });
  }

  const isSuperAdmin = req.user.role === 'super_admin' || req.user.role === 'admin';
  const hasAccountingPerm = Boolean(req.user.permissions?.canManageAccounting);
  const isAccountant = req.user.role === 'accountant' || hasAccountingPerm;

  if (!isAccountant && !isSuperAdmin) {
    return res.status(403).json({
      success: false,
      message: 'غير مصرح لك بالوصول إلى قسم المحاسبة. هذا القسم مخصص للمحاسب المالي والإدارة فقط.'
    });
  }

  // Accountant level: 'full' | 'view_only' | 'limited'
  const isWriteAccountant = isSuperAdmin || req.user.role === 'accountant' || (hasAccountingPerm && req.user.accountingLevel !== 'view_only');
  const accountingLevel = req.user.accountingLevel || (isWriteAccountant ? 'full' : 'view_only');
  req.isAccountant = isAccountant;
  req.isSuperAdmin = isSuperAdmin;
  req.accountingLevel = isWriteAccountant ? accountingLevel : 'view_only';
  req.isReadOnly = !isWriteAccountant || accountingLevel === 'view_only';
  next();
}

// Middleware: Require Write Access (Accountant only with write permission, Super Admin view only)
function requireAccountantWrite(req, res, next) {
  if (req.isReadOnly) {
    return res.status(403).json({
      success: false,
      message: req.isSuperAdmin && !req.isAccountant
        ? 'حساب المدير العام في قسم المحاسبة بصلاحية (مشاهدة فقط). التعديل والإدخال المالي مخصص للمحاسب المالي.'
        : 'حسابك بصلاحية (مشاهدة فقط) في قسم المحاسبة. لا يمكن حفظ أو تعديل أو إضافة بيانات مالية.'
    });
  }
  next();
}

// Middleware: Require Full Level for deleting or critical edits (Blocks 'limited')
function requireFullAccountant(req, res, next) {
  if (req.isReadOnly) {
    return res.status(403).json({
      success: false,
      message: 'حسابك بصلاحية (مشاهدة فقط).'
    });
  }
  if (req.accountingLevel === 'limited') {
    return res.status(403).json({
      success: false,
      message: 'صلاحيات هذا الحساب (محدودة) ولا تشمل حذف البيانات المالية أو تعديل البنود الحساسة.'
    });
  }
  next();
}

// Merchant self-service account (must be registered BEFORE the accountants-only guard below)
router.get('/merchant-portal', authenticate, (req, res) => merchantPortalHandler(req, res));

// Apply authentication and access guard to all accounting routes
router.use(authenticate, checkAccountingAccess);

// Helper: Filter by date range — days and months are counted in CAIRO time (not UTC)
function filterByDate(items, timeRange, startDate, endDate, dateField = 'createdAt') {
  const dayOf = item => cairoDay(item[dateField] || item.deliveryDate || item.date || 0);
  const today = todayCairo();
  if (timeRange === 'day') {
    return items.filter(item => dayOf(item) === today);
  } else if (timeRange === 'week') {
    const from = cairoDay(Date.now() - 6 * 24 * 60 * 60 * 1000);
    return items.filter(item => { const d = dayOf(item); return d >= from && d <= today; });
  } else if (timeRange === 'month') {
    const ym = today.slice(0, 7);
    return items.filter(item => dayOf(item).startsWith(ym));
  } else if (timeRange === 'period' && startDate) {
    // a whole accounting month, e.g. startDate = '2026-11'
    return items.filter(item => dayOf(item).startsWith(String(startDate).slice(0, 7)));
  } else if (timeRange === 'custom' && (startDate || endDate)) {
    const from = startDate ? String(startDate).slice(0, 10) : '0000-00-00';
    const to = endDate ? String(endDate).slice(0, 10) : '9999-12-31';
    return items.filter(item => { const d = dayOf(item); return d && d >= from && d <= to; });
  }
  return items;
}

// ==========================================================================
// SHARED LEDGER HELPERS (new profit model — see utils/financeEngine.js)
// ==========================================================================
const sameId = (a, b) => a !== undefined && a !== null && a !== '' && b !== undefined && b !== null && String(a) === String(b);
const sameCode = (a, b) => Boolean(a && b && String(a).trim().toLowerCase() === String(b).trim().toLowerCase());
const itemOfMerchant = (i, m) => i.ownerType === 'merchant' && (sameId(i.merchantId, m.id) || sameCode(i.merchantCode, m.code));
const itemOfInvestor = (i, inv) => i.ownerType === 'investor' && (sameId(i.investorId, inv.id) || sameCode(i.investorCode, inv.code));
const expenseOfMerchant = (e, m) => sameId(e.merchantId, m.id) || (!e.merchantId && sameCode(e.merchantCode, m.code));
const expenseOfInvestor = (e, inv) => sameId(e.investorId, inv.id) || (!e.investorId && !e.merchantId && sameCode(e.investorCode, inv.code));
const payoutOf = (type, p, ent) => p.type === type && (sameId(p.merchantId || p.investorId, ent.id) || sameCode(p.merchantCode || p.investorCode, ent.code));

// An investor's profit share % (per-investor value, else the store default)
const investorSharePercentOf = (inv, settings) => investorSharePercent({}, inv, settings);

// Delivered orders with their money split. Period filter uses the DELIVERY date.
async function loadLedger(query = {}) {
  const ctx = await loadContext();
  const delivered = (await db.orders.getAll())
    .filter(o => o.status === 'delivered')
    .map(o => ({ ...o, _deliveredAt: deliveredDate(o) }));
  const all = delivered.map(o => ({ order: o, econ: orderEconomics(o, ctx) }));
  const timeRange = query.timeRange || 'all';
  const inRangeIds = new Set(filterByDate(delivered, timeRange, query.startDate, query.endDate, '_deliveredAt').map(o => o.id));
  const period = all.filter(r => inRangeIds.has(r.order.id));
  const expensesAll = await db.expenses.getAll();
  const expensesPeriod = filterByDate(expensesAll, timeRange, query.startDate, query.endDate, 'date');
  const accounting = await db.accounting.getAll();
  return { ctx, all, period, expensesAll, expensesPeriod, accounting };
}

// Sales / dues for one merchant or investor over a set of ledger rows
function ownerStats(rows, matchItem) {
  const s = { orders: 0, units: 0, sales: 0, cost: 0, investorProfit: 0, ownerDue: 0, storeProfit: 0, costMissing: 0, discountShare: 0, orderList: [] };
  rows.forEach(({ order, econ }) => {
    const items = econ.items.filter(matchItem);
    if (!items.length) return;
    s.orders++;
    let orderSales = 0, orderDue = 0;
    items.forEach(i => {
      s.units += i.qty; s.sales += i.sales; s.cost += i.cost; s.investorProfit += i.investorProfit;
      s.ownerDue += i.ownerDue; s.storeProfit += i.storeProfit; if (i.costMissing) s.costMissing++;
      s.discountShare += i.investorDiscountShare || 0;
      orderSales += i.sales; orderDue += i.ownerDue;
    });
    const ids = new Set(items.map(i => i.productId));
    s.orderList.push({
      orderNumber: order.orderNumber,
      date: order._deliveredAt,
      customerName: order.customerName || 'عميل',
      customerPhone: order.customerPhone || '-',
      items: (order.items || []).filter(it => ids.has(String(it.productId || it.id || ''))),
      orderTotal: round2(orderSales),
      ownerDue: round2(orderDue),
      paymentMethod: order.paymentMethod || 'cod'
    });
  });
  ['sales', 'cost', 'investorProfit', 'ownerDue', 'storeProfit', 'discountShare'].forEach(k => { s[k] = round2(s[k]); });
  return s;
}

// Expense effect on an owner's dues (signed: expenses reduce, revenues increase)
function ownerExpenseEffect(expenses, matchExpense, part) {
  let expenseTotal = 0, revenueTotal = 0, signed = 0;
  expenses.filter(matchExpense).forEach(e => {
    const v = expenseSplit(e)[part];
    signed += v;
    if (v < 0) expenseTotal += -v; else revenueTotal += v;
  });
  return { expenseTotal: round2(expenseTotal), revenueTotal: round2(revenueTotal), signed: round2(signed) };
}

function merchantAccount(m, L) {
  const match = i => itemOfMerchant(i, m);
  const period = ownerStats(L.period, match);
  const life = ownerStats(L.all, match);
  const exPeriod = ownerExpenseEffect(L.expensesPeriod, e => expenseOfMerchant(e, m), 'merchant');
  const exLife = ownerExpenseEffect(L.expensesAll, e => expenseOfMerchant(e, m), 'merchant');
  const payouts = L.accounting.filter(p => payoutOf('merchant_payout', p, m));
  const totalPaid = round2(payouts.reduce((s, p) => s + (Number(p.amount) || 0), 0));
  const lifetimeDues = round2(life.ownerDue + exLife.signed);
  return { period, exPeriod, lifetimeDues, totalPaid, balance: round2(lifetimeDues - totalPaid), payouts };
}

function investorAccount(inv, L) {
  const match = i => itemOfInvestor(i, inv);
  const period = ownerStats(L.period, match);
  const life = ownerStats(L.all, match);
  const exPeriod = ownerExpenseEffect(L.expensesPeriod, e => expenseOfInvestor(e, inv), 'investor');
  const exLife = ownerExpenseEffect(L.expensesAll, e => expenseOfInvestor(e, inv), 'investor');
  const payouts = L.accounting.filter(p => payoutOf('investor_payout', p, inv));
  const totalPaid = round2(payouts.reduce((s, p) => s + (Number(p.amount) || 0), 0));
  const lifetimeDues = round2(life.ownerDue + exLife.signed);

  // Capital batches: one calculation shared with the investor's own page (financeEngine.investorFigures)
  const batchRows = investorFigures(inv, L.all.map(r => r.order), L.ctx, L.expensesAll).batches;
  const capital = totalCapital(inv);
  return {
    period, exPeriod, life, lifetimeDues, totalPaid, balance: round2(lifetimeDues - totalPaid), payouts,
    capital, batches: batchRows,
    capitalRecoveryPercent: capital > 0 ? Math.min(100, Math.round((life.cost / capital) * 100)) : 0
  };
}

// 1. Accounting Dashboard Metrics
router.get('/dashboard', async (req, res) => {
  try {
    const { timeRange = 'all', startDate, endDate } = req.query;
    const L = await loadLedger({ timeRange, startDate, endDate });

    let totalRevenue = 0, cashRevenue = 0, cashOrdersCount = 0, cardRevenue = 0, cardOrdersCount = 0;
    let storeItemProfit = 0, shippingIncome = 0, discounts = 0, storeGrossProfit = 0;
    let merchantDuesTotal = 0, investorDuesTotal = 0, costMissingItems = 0, storeGoodsCost = 0;
    L.period.forEach(({ order, econ }) => {
      totalRevenue += econ.collected;
      storeGoodsCost += econ.storeGoodsCost || 0;
      if (order.paymentMethod === 'card' || order.paymentMethod === 'card_mock') { cardRevenue += econ.collected; cardOrdersCount++; }
      else { cashRevenue += econ.collected; cashOrdersCount++; }
      storeItemProfit += econ.storeItemProfit; shippingIncome += econ.shippingFee; discounts += econ.discounts;
      storeGrossProfit += econ.storeNet; merchantDuesTotal += econ.merchantDues; investorDuesTotal += econ.investorDues;
      costMissingItems += econ.items.filter(i => i.costMissing).length;
    });
    // Store's part of expenses / revenues in the period (signed)
    let storeExpenses = 0, storeOtherRevenues = 0;
    L.expensesPeriod.forEach(e => {
      const v = expenseSplit(e).store;
      if (v < 0) storeExpenses += -v; else storeOtherRevenues += v;
    });
    const netProfit = round2(storeGrossProfit - storeExpenses + storeOtherRevenues);

    // Recent ledger entries
    const filteredLedger = filterByDate(L.accounting, timeRange, startDate, endDate, 'deliveryDate')
      .sort((a, b) => new Date(b.deliveryDate || b.createdAt) - new Date(a.deliveryDate || a.createdAt));
    const recentLedger = filteredLedger.slice(0, 15).map(item => {
      const amount = Number(item.amount ?? item.collectedAmount ?? item.totalAmount ?? 0);
      let desc = item.description || item.notes;
      if (!desc) {
        if (item.orderNumber) desc = `تحصيل قيمة الطلب #${item.orderNumber} (العميل: ${item.customerName || 'عميل'})`;
        else if (item.type === 'remittance') desc = `توريد مالي إلى الخزينة من المندوب: ${item.employeeName || ''}`;
        else if (item.type === 'merchant_payout') desc = `صرف دفعة مالية للتاجر: ${item.merchantName || ''}`;
        else if (item.type === 'investor_payout') desc = `صرف دفعة مالية للمستثمر: ${item.investorName || ''}`;
        else desc = 'عملية تسوية وقيد محاسبي';
      }
      return {
        ...item,
        id: item.id,
        orderNumber: item.orderNumber || item.id || '-',
        createdAt: item.createdAt || item.deliveryDate || new Date().toISOString(),
        type: item.type || (item.orderNumber ? 'delivered_order' : 'ledger_entry'),
        description: desc,
        amount: round2(amount),
        paymentMethod: item.paymentMethod || 'cash'
      };
    });

    const pct = (a) => totalRevenue > 0 ? Math.round((a / totalRevenue) * 100) : 0;
    res.json({
      success: true,
      isReadOnly: req.isReadOnly,
      userRole: req.user.role,
      summary: {
        totalRevenue: round2(totalRevenue),
        deliveredOrdersCount: L.period.length,
        storeItemProfit: round2(storeItemProfit),
        shippingIncome: round2(shippingIncome),
        discounts: round2(discounts),
        storeGrossProfit: round2(storeGrossProfit),
        storeExpenses: round2(storeExpenses),
        storeOtherRevenues: round2(storeOtherRevenues),
        netProfit,
        merchantDuesTotal: round2(merchantDuesTotal),
        investorDuesTotal: round2(investorDuesTotal),
        ownerDuesTotal: round2(merchantDuesTotal + investorDuesTotal),
        // Revenue = owner dues + store goods cost + store gross profit (+ any gap from old orders)
        storeGoodsCost: round2(storeGoodsCost),
        reconciliationGap: round2(totalRevenue - (merchantDuesTotal + investorDuesTotal + storeGoodsCost + storeGrossProfit)),
        netMerchantPayables: round2(merchantDuesTotal + investorDuesTotal),
        costMissingItems,
        paymentBreakdown: {
          cash: { amount: round2(cashRevenue), count: cashOrdersCount, percentage: pct(cashRevenue) },
          card: { amount: round2(cardRevenue), count: cardOrdersCount, percentage: pct(cardRevenue) }
        }
      },
      recentLedger
    });
  } catch (err) {
    console.error('Accounting dashboard error:', err);
    res.status(500).json({ success: false, message: 'فشل جلب بيانات لوحة المحاسبة' });
  }
});

// 2. Sales report grouped by day / month (by delivery date)
router.get('/reports/sales', async (req, res) => {
  try {
    const { groupBy = 'daily', timeRange = 'month', startDate, endDate } = req.query;
    const L = await loadLedger({ timeRange, startDate, endDate });
    const groups = {};
    L.period.forEach(({ order, econ }) => {
      const d = new Date(order._deliveredAt || order.createdAt || Date.now());
      const key = groupBy === 'monthly' ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` : d.toISOString().split('T')[0];
      const g = groups[key] || (groups[key] = { period: key, ordersCount: 0, grossSales: 0, shippingTotal: 0, cashSales: 0, cardSales: 0, discounts: 0, storeProfit: 0, ownerDues: 0 });
      g.ordersCount++;
      g.grossSales += econ.collected;
      g.shippingTotal += econ.shippingFee;
      g.discounts += econ.discounts;
      if (order.paymentMethod === 'card' || order.paymentMethod === 'card_mock') g.cardSales += econ.collected; else g.cashSales += econ.collected;
      g.storeProfit += econ.storeNet;
      g.ownerDues += econ.ownerDues;
    });
    const reportRows = Object.values(groups).map(g => {
      const r = { ...g };
      ['grossSales', 'shippingTotal', 'cashSales', 'cardSales', 'discounts', 'storeProfit', 'ownerDues'].forEach(k => { r[k] = round2(r[k]); });
      // legacy field names kept for older screens
      r.storeCommission = r.storeProfit;
      r.merchantDues = r.ownerDues;
      return r;
    }).sort((a, b) => b.period.localeCompare(a.period));
    res.json({ success: true, groupBy, rowsCount: reportRows.length, reports: reportRows });
  } catch (err) {
    console.error('Sales reports error:', err);
    res.status(500).json({ success: false, message: 'فشل توليد تقارير المبيعات' });
  }
});

// 3. Merchants report: merchant is owed his COST price; the margin is store profit (no commission)
router.get('/reports/merchants', async (req, res) => {
  try {
    const { timeRange = 'all', startDate, endDate, search } = req.query;
    const merchants = await db.merchants.getAll();
    const L = await loadLedger({ timeRange, startDate, endDate });
    const allProducts = L.ctx.products;

    let report = merchants.map(m => {
      const a = merchantAccount(m, L);
      return {
        id: m.id,
        code: m.code,
        name: m.name,
        phone: m.phone || '-',
        productsCount: getMerchantProducts(allProducts, m).length,
        totalDeliveredOrders: a.period.orders,
        totalUnitsSold: a.period.units,
        grossSales: a.period.sales,
        costOfSold: a.period.cost,
        storeProfit: a.period.storeProfit,
        totalExpenses: a.exPeriod.expenseTotal,
        totalRevenues: a.exPeriod.revenueTotal,
        merchantDues: round2(a.period.ownerDue + a.exPeriod.signed),
        lifetimeDues: a.lifetimeDues,
        totalPaid: a.totalPaid,
        remainingBalance: a.balance,
        costMissingItems: a.period.costMissing,
        payoutStatus: a.balance < 0 ? 'مصروف له أكثر من مستحقاته ⚠️'
          : (a.balance === 0 && a.lifetimeDues > 0 ? 'تم الصرف بالكامل ✅' : (a.balance > 0 ? 'مستحق الصرف ⏳' : 'لا توجد مبيعات'))
      };
    });
    if (search && search.trim()) {
      const q = search.trim().toLowerCase();
      report = report.filter(m => (m.name || '').toLowerCase().includes(q) || (m.code || '').toLowerCase().includes(q));
    }
    res.json({ success: true, count: report.length, isReadOnly: req.isReadOnly, merchants: report, merchantsReport: report });
  } catch (err) {
    console.error('Merchants report error:', err);
    res.status(500).json({ success: false, message: 'فشل توليد تقرير حسابات التجار' });
  }
});

// Record Payout to Merchant (Accountant ONLY)
router.post('/merchants/:merchantId/payout', requireAccountantWrite, async (req, res) => {
  try {
    const { merchantId } = req.params;
    const { amount, notes, receiptNumber } = req.body;

    if (!amount || Number(amount) <= 0) {
      return res.status(400).json({ success: false, message: 'مبلغ الصرف (أكبر من صفر) مطلوب' });
    }

    const merchant = await db.merchants.getById(merchantId);
    if (!merchant) {
      return res.status(404).json({ success: false, message: 'التاجر غير موجود' });
    }

    const payoutAmount = Number(amount);
    // Never pay more than the merchant is actually owed
    const merchantBalance = merchantAccount(merchant, await loadLedger({ timeRange: 'all' })).balance;
    if (payoutAmount > merchantBalance + 0.01) {
      return res.status(400).json({
        success: false,
        message: `المبلغ أكبر من رصيد التاجر المستحق حالياً (${round2(Math.max(0, merchantBalance))} ج.م)`
      });
    }
    const entry = await db.accounting.insert({
      type: 'merchant_payout',
      merchantId: merchant.id,
      merchantCode: merchant.code,
      merchantName: merchant.name,
      amount: payoutAmount,
      receiptNumber: receiptNumber || `RCP-${Date.now().toString().slice(-6)}`,
      notes: notes || `صرف دفعة مالية لحساب التاجر ${merchant.name}`,
      description: `صرف دفعة مالية للتاجر: ${merchant.name} (${merchant.code}) بمبلغ ${payoutAmount} ج.م`,
      recordedBy: req.user.name,
      createdAt: new Date().toISOString()
    });

    await logActivity({
      userId: req.user.id,
      userName: req.user.name,
      userRole: req.user.role,
      action: 'MERCHANT_PAYOUT',
      module: 'accounting',
      details: `قام المحاسب بتسجيل صرف دفعة مالية للتاجر "${merchant.name}" بمبلغ ${payoutAmount} ج.م`,
      metadata: { merchantId: merchant.id, amount: payoutAmount }
    });

    res.json({
      success: true,
      message: `تم تسجيل صرف مبلغ ${payoutAmount} ج.م بنجاح للتاجر "${merchant.name}" ✅`,
      payout: entry
    });
  } catch (err) {
    console.error('Merchant payout error:', err);
    res.status(500).json({ success: false, message: 'فشل تسجيل صرف الدفعة' });
  }
});

// Get Full Merchant History (Dossier)
router.get('/merchants/:merchantId/history', async (req, res) => {
  try {
    const { merchantId } = req.params;
    const merchant = await db.merchants.getById(merchantId);
    if (!merchant) {
      return res.status(404).json({ success: false, message: 'التاجر غير موجود' });
    }
    const L = await loadLedger({ timeRange: 'all' });
    const a = merchantAccount(merchant, L);
    const merchantProducts = getMerchantProducts(L.ctx.products, merchant);

    const merchantExpenses = L.expensesAll.filter(e => expenseOfMerchant(e, merchant)).map(e => ({
      id: e.id, title: e.title, amount: Number(e.amount) || 0, type: e.type,
      category: e.category || 'عام', date: e.date || e.createdAt, notes: e.notes || ''
    })).sort((x, y) => new Date(y.date) - new Date(x.date));

    const returnsList = await db.returns.find(r =>
      (r.merchantCode && merchant.code && r.merchantCode.toLowerCase() === merchant.code.toLowerCase()) ||
      merchantProducts.some(p => String(p.id) === String(r.productId))
    );
    const payouts = a.payouts.sort((x, y) => new Date(y.createdAt) - new Date(x.createdAt));
    const orders = a.period.orderList;

    res.json({
      success: true,
      merchant,
      summary: {
        productsCount: merchantProducts.length,
        deliveredOrdersCount: a.period.orders,
        totalUnitsSold: a.period.units,
        grossSales: a.period.sales,
        costOfSold: a.period.cost,
        storeProfit: a.period.storeProfit,
        totalExpenses: a.exPeriod.expenseTotal,
        totalRevenues: a.exPeriod.revenueTotal,
        merchantDues: a.lifetimeDues,
        totalPaid: a.totalPaid,
        remainingBalance: a.balance,
        costMissingItems: a.period.costMissing
      },
      products: merchantProducts.map(p => ({
        id: p.id, title: p.title, price: p.price,
        costPrice: p.costPrice !== undefined ? p.costPrice : (p.merchantPrice !== undefined ? p.merchantPrice : p.basePrice),
        stock: p.stock, salesCount: p.salesCount || 0,
        image: Array.isArray(p.images) && p.images[0] ? p.images[0] : (p.image || '')
      })),
      orders,
      payouts,
      expenses: merchantExpenses,
      returns: returnsList,
      history: { orders, payouts, expenses: merchantExpenses, returns: returnsList }
    });
  } catch (err) {
    console.error('Merchant history error:', err);
    res.status(500).json({ success: false, message: 'فشل جلب سجل التاجر' });
  }
});

// 3.5 Investors report: investor gets his COST + his share % of the profit; the rest is store profit
router.get('/reports/investors', async (req, res) => {
  try {
    const { timeRange = 'all', startDate, endDate, search } = req.query;
    const investors = await db.investors.getAll();
    const L = await loadLedger({ timeRange, startDate, endDate });

    let report = investors.map(inv => {
      const a = investorAccount(inv, L);
      const share = investorSharePercent({}, inv, L.ctx.settings);
      return {
        id: inv.id,
        code: inv.code,
        name: inv.name,
        phone: inv.phone || '-',
        profitSharePercent: share,
        capital: a.capital,
        capitalBatches: a.batches,
        productsCount: getInvestorProducts(L.ctx.products, inv).length,
        totalDeliveredOrders: a.period.orders,
        totalUnitsSold: a.period.units,
        grossSales: a.period.sales,
        totalCostOfSold: a.period.cost,
        grossProfit: round2(a.period.sales - a.period.cost),
        investorProfit: a.period.investorProfit,
        // Part of coupons / loyalty discounts carried by the investor (already inside investorProfit)
        discountShare: a.period.discountShare,
        storeProfit: a.period.storeProfit,
        totalExpenses: a.exPeriod.expenseTotal,
        totalRevenues: a.exPeriod.revenueTotal,
        netProfit: round2(a.period.investorProfit + a.exPeriod.signed),
        investorDues: round2(a.period.ownerDue + a.exPeriod.signed),
        lifetimeDues: a.lifetimeDues,
        totalPaid: a.totalPaid,
        remainingBalance: a.balance,
        capitalRecoveryPercent: a.capitalRecoveryPercent,
        costMissingItems: a.period.costMissing,
        payoutStatus: a.balance < 0 ? 'مصروف له أكثر من مستحقاته ⚠️'
          : (a.balance === 0 && a.lifetimeDues > 0 ? 'تم الصرف بالكامل ✅' : (a.balance > 0 ? 'مستحق الصرف ⏳' : 'لا توجد مبيعات'))
      };
    });
    if (search && search.trim()) {
      const q = search.trim().toLowerCase();
      report = report.filter(inv => (inv.name || '').toLowerCase().includes(q) || (inv.code || '').toLowerCase().includes(q));
    }
    res.json({ success: true, count: report.length, isReadOnly: req.isReadOnly, investors: report, investorsReport: report });
  } catch (err) {
    console.error('Investors report error:', err);
    res.status(500).json({ success: false, message: 'فشل توليد تقرير حسابات المستثمرين' });
  }
});

// Record Payout to Investor (Accountant ONLY)
router.post('/investors/:investorId/payout', requireAccountantWrite, async (req, res) => {
  try {
    const { investorId } = req.params;
    const { amount, notes, receiptNumber, paymentMethod } = req.body;

    const payoutAmount = Number(amount);
    if (!payoutAmount || payoutAmount <= 0) {
      return res.status(400).json({ success: false, message: 'مبلغ الصرف (أكبر من صفر) مطلوب' });
    }

    let investor = await db.investors.getById(investorId);
    if (!investor) {
      investor = await db.investors.findOne(i => i.code && i.code.trim().toUpperCase() === String(investorId).trim().toUpperCase());
    }
    if (!investor) {
      return res.status(404).json({ success: false, message: 'المستثمر غير موجود' });
    }

    // Never pay more than the investor is actually owed (cost + profit share − expense share)
    const investorBalance = investorAccount(investor, await loadLedger({ timeRange: 'all' })).balance;
    if (payoutAmount > investorBalance + 0.01) {
      return res.status(400).json({
        success: false,
        message: `المبلغ أكبر من رصيد المستثمر المستحق حالياً (${round2(Math.max(0, investorBalance))} ج.م)`
      });
    }

    const entry = await db.accounting.insert({
      type: 'investor_payout',
      investorId: investor.id,
      investorCode: investor.code,
      investorName: investor.name,
      amount: payoutAmount,
      paymentMethod: paymentMethod || 'cash',
      receiptNumber: receiptNumber || `INV-RCP-${Date.now().toString().slice(-6)}`,
      notes: notes || `صرف دفعة مالية لحساب المستثمر ${investor.name}`,
      description: `صرف دفعة مالية للمستثمر: ${investor.name} (${investor.code}) بمبلغ ${payoutAmount} ج.م`,
      recordedBy: req.user.name,
      createdAt: new Date().toISOString()
    });

    await logActivity({
      userId: req.user.id,
      userName: req.user.name,
      userRole: req.user.role,
      action: 'INVESTOR_PAYOUT',
      module: 'accounting',
      details: `قام المحاسب بتسجيل صرف دفعة مالية للمستثمر "${investor.name}" بمبلغ ${payoutAmount} ج.م`,
      metadata: { investorId: investor.id, amount: payoutAmount }
    });

    res.json({
      success: true,
      message: `تم تسجيل صرف مبلغ ${payoutAmount} ج.م بنجاح للمستثمر "${investor.name}" ✅`,
      payout: entry
    });
  } catch (err) {
    console.error('Investor payout error:', err);
    res.status(500).json({ success: false, message: 'فشل تسجيل صرف الدفعة للمستثمر' });
  }
});

// Get Full Investor Financial History (Dossier)
router.get('/investors/:investorId/history', async (req, res) => {
  try {
    const { investorId } = req.params;
    let investor = await db.investors.getById(investorId);
    if (!investor) {
      investor = await db.investors.findOne(i => i.code && i.code.trim().toUpperCase() === String(investorId).trim().toUpperCase());
    }
    if (!investor) {
      return res.status(404).json({ success: false, message: 'المستثمر غير موجود' });
    }
    const L = await loadLedger({ timeRange: 'all' });
    const a = investorAccount(investor, L);
    const share = investorSharePercent({}, investor, L.ctx.settings);
    const invProducts = getInvestorProducts(L.ctx.products, investor);

    const investorExpenses = L.expensesAll.filter(e => expenseOfInvestor(e, investor)).map(e => {
      const split = expenseSplit(e);
      return {
        id: e.id, title: e.title, type: e.type, amount: Number(e.amount) || 0,
        sharePercent: e.investorSharePercent !== undefined && e.investorSharePercent !== null ? Number(e.investorSharePercent) : 50,
        investorShare: Math.abs(split.investor),
        category: e.category || 'عام', date: e.date || e.createdAt, notes: e.notes || ''
      };
    }).sort((x, y) => new Date(y.date) - new Date(x.date));
    const payouts = a.payouts.sort((x, y) => new Date(y.createdAt) - new Date(x.createdAt));
    const orders = a.life.orderList;

    res.json({
      success: true,
      investor,
      summary: {
        capital: a.capital,
        profitSharePercent: share,
        productsCount: invProducts.length,
        deliveredOrdersCount: a.life.orders,
        totalUnitsSold: a.life.units,
        grossSales: a.life.sales,
        totalCostOfSold: a.life.cost,
        grossProfit: round2(a.life.sales - a.life.cost),
        investorProfit: a.life.investorProfit,
        storeProfit: a.life.storeProfit,
        totalExpenses: a.exPeriod.expenseTotal,
        totalRevenues: a.exPeriod.revenueTotal,
        netProfit: round2(a.life.investorProfit + a.exPeriod.signed),
        investorDues: a.lifetimeDues,
        totalPaid: a.totalPaid,
        remainingBalance: a.balance,
        capitalRecoveryPercent: a.capitalRecoveryPercent,
        costMissingItems: a.life.costMissing
      },
      capitalBatches: a.batches,
      products: invProducts.map(p => ({
        id: p.id, title: p.title, price: p.price,
        costPrice: p.costPrice !== undefined ? p.costPrice : p.basePrice,
        capitalBatchId: p.capitalBatchId || null,
        stock: p.stock, salesCount: p.salesCount || 0,
        image: Array.isArray(p.images) && p.images[0] ? p.images[0] : (p.image || '')
      })),
      orders,
      payouts,
      expenses: investorExpenses,
      history: { orders, payouts, expenses: investorExpenses }
    });
  } catch (err) {
    console.error('Investor history error:', err);
    res.status(500).json({ success: false, message: 'فشل جلب سجل المستثمر' });
  }
});

// 4. Coupons & Discounts Report (delivered and non-cancelled orders)
router.get('/reports/coupons', async (req, res) => {
  try {
    const orders = (await db.orders.getAll()).filter(o => o.status !== 'cancelled');
    const coupons = await db.coupons.getAll();
    const usage = {};
    coupons.forEach(c => {
      usage[c.code.toUpperCase()] = {
        code: c.code, discountType: c.discountType || 'percentage', discountValue: c.discountValue || 0,
        ordersCount: 0, totalDiscountGiven: 0, totalSalesGenerated: 0
      };
    });
    orders.forEach(o => {
      // Orders store the coupon as appliedCoupon.code (older ones may have couponCode)
      const raw = (o.appliedCoupon && o.appliedCoupon.code) || o.couponCode;
      if (!raw) return;
      const code = String(raw).toUpperCase();
      if (!usage[code]) usage[code] = { code, discountType: 'percentage', discountValue: 0, ordersCount: 0, totalDiscountGiven: 0, totalSalesGenerated: 0 };
      usage[code].ordersCount++;
      usage[code].totalDiscountGiven += Number(o.discountAmount) || 0;
      usage[code].totalSalesGenerated += Number(o.grandTotal) || 0;
    });
    const list = Object.values(usage).map(c => ({
      ...c, totalDiscountGiven: round2(c.totalDiscountGiven), totalSalesGenerated: round2(c.totalSalesGenerated)
    })).sort((a, b) => b.totalDiscountGiven - a.totalDiscountGiven);
    res.json({ success: true, count: list.length, couponsReport: list });
  } catch (err) {
    console.error('Coupons report error:', err);
    res.status(500).json({ success: false, message: 'فشل توليد تقرير الكوبونات' });
  }
});

// 5. Store profit per order (replaces the old commission report)
router.get('/reports/commissions', async (req, res) => {
  try {
    const L = await loadLedger({ timeRange: req.query.timeRange || 'all', startDate: req.query.startDate, endDate: req.query.endDate });
    let totalSales = 0, totalStoreProfit = 0, totalOwnerDues = 0;
    const items = L.period.map(({ order, econ }) => {
      totalSales += econ.collected; totalStoreProfit += econ.storeNet; totalOwnerDues += econ.ownerDues;
      return {
        orderId: order.id,
        orderNumber: order.orderNumber,
        date: order._deliveredAt,
        customerName: order.customerName || 'عميل',
        grandTotal: econ.collected,
        paymentMethod: order.paymentMethod || 'cod',
        storeProfit: econ.storeNet,
        ownerDues: econ.ownerDues,
        merchantDues: econ.merchantDues,
        investorDues: econ.investorDues,
        deliveredBy: order.deliveredBy || 'مندوب التوصيل'
      };
    });
    res.json({
      success: true,
      model: 'cost_based',
      totalSales: round2(totalSales),
      totalStoreProfit: round2(totalStoreProfit),
      totalOwnerDues: round2(totalOwnerDues),
      ordersCount: items.length,
      orders: items
    });
  } catch (err) {
    console.error('Profit report error:', err);
    res.status(500).json({ success: false, message: 'فشل توليد تقرير أرباح المتجر' });
  }
});

// 6. Merchant Collections Table (تحصيل التجار وتوريد الخزينة)
router.get('/collections', async (req, res) => {
  try {
    const orders = await db.orders.getAll();
    const deliveredOrders = orders.filter(o => o.status === 'delivered');
    const merchants = await db.merchants.getAll();
    const allProducts = await db.products.getAll();
    const allAccounting = await db.accounting.getAll();
    const remittances = allAccounting.filter(a => a.type === 'remittance');

    const settingsList = await db.settings.getAll();
    const currentSettings = settingsList[0] || {};
    const excludedCollections = Array.isArray(currentSettings.excludedCollections) 
      ? currentSettings.excludedCollections.map(k => String(k).trim().toLowerCase()) 
      : [];

    // Group delivered orders by merchant & courier
    const merchantCollectionsMap = {};

    deliveredOrders.forEach(o => {
      const courier = o.deliveredBy || 'مندوب التوصيل';
      const isCash = o.paymentMethod !== 'card';
      (o.items || []).forEach(it => {
        let m = merchants.find(mch => (it.merchantCode && mch.code.toLowerCase() === it.merchantCode.toLowerCase()) || (it.merchantName && mch.name.toLowerCase() === it.merchantName.toLowerCase()));
        if (!m) {
          const matchedProd = allProducts.find(p => String(p.id) === String(it.id || it.productId));
          if (matchedProd && matchedProd.merchantCode) {
            m = merchants.find(mch => mch.code.toLowerCase() === matchedProd.merchantCode.toLowerCase());
          }
        }
        const mName = m ? m.name : (it.merchantName || 'تاجر عام');
        const mCode = m ? m.code : (it.merchantCode || 'GEN-01');
        const key = `${mCode}__${courier}`.toLowerCase();

        // Check if excluded / deleted from collections
        if (
          excludedCollections.includes(key) ||
          excludedCollections.includes(mCode.toLowerCase()) ||
          excludedCollections.includes(mName.toLowerCase()) ||
          (m && excludedCollections.includes(String(m.id).toLowerCase()))
        ) {
          return;
        }

        if (!merchantCollectionsMap[key]) {
          merchantCollectionsMap[key] = {
            id: key,
            merchantName: mName,
            merchantCode: mCode,
            employeeName: courier,
            ordersCount: 0,
            cashToCollect: 0,
            remittedAmount: 0,
            difference: 0,
            lastDeliveryAt: o.deliveredAt || o.createdAt
          };
        }

        merchantCollectionsMap[key].ordersCount++;
        const itemAmount = (Number(it.price) || 0) * (Number(it.quantity) || 1);
        if (isCash) {
          merchantCollectionsMap[key].cashToCollect += itemAmount;
        }
      });
    });

    // If no orders yet, seed from active merchants list (excluding deleted ones)
    if (Object.keys(merchantCollectionsMap).length === 0) {
      merchants.forEach(m => {
        const key = `${m.code}__مندوب التوصيل`.toLowerCase();
        if (
          excludedCollections.includes(key) ||
          excludedCollections.includes((m.code || '').toLowerCase()) ||
          excludedCollections.includes((m.name || '').toLowerCase()) ||
          excludedCollections.includes(String(m.id).toLowerCase())
        ) {
          return;
        }
        merchantCollectionsMap[key] = {
          id: key,
          merchantName: m.name,
          merchantCode: m.code,
          employeeName: 'مندوب التوصيل',
          ordersCount: 0,
          cashToCollect: 0,
          remittedAmount: 0,
          difference: 0,
          lastDeliveryAt: null
        };
      });
    }

    // Match remittances
    remittances.forEach(rem => {
      const rName = (rem.employeeName || rem.courier || '').toLowerCase();
      Object.keys(merchantCollectionsMap).forEach(k => {
        if (k.includes(rName)) {
          merchantCollectionsMap[k].remittedAmount += (Number(rem.amount) || 0);
        }
      });
    });

    const result = Object.values(merchantCollectionsMap).filter(e => {
      const idKey = (e.id || '').toLowerCase();
      const codeKey = (e.merchantCode || '').toLowerCase();
      const nameKey = (e.merchantName || '').toLowerCase();
      return !excludedCollections.includes(idKey) && 
             !excludedCollections.includes(codeKey) && 
             !excludedCollections.includes(nameKey);
    }).map(e => ({
      ...e,
      cashToCollect: Math.round(e.cashToCollect * 100) / 100,
      remittedAmount: Math.round(e.remittedAmount * 100) / 100,
      difference: Math.round((e.cashToCollect - e.remittedAmount) * 100) / 100
    }));

    res.json({
      success: true,
      isReadOnly: req.isReadOnly,
      count: result.length,
      collections: result
    });
  } catch (err) {
    console.error('Merchant collections error:', err);
    res.status(500).json({ success: false, message: 'فشل جلب جدول تحصيل التجار' });
  }
});

// 6.1 Delete Merchant or Record from Merchant Collections Table
async function handleCollectionDelete(req, res) {
  try {
    const { id, merchantId, merchantCode, merchantName } = req.body;
    if (!id && !merchantId && !merchantCode && !merchantName) {
      return res.status(400).json({ success: false, message: 'معرف التاجر أو السجل مطلوب للحذف' });
    }

    const settingsList = await db.settings.getAll();
    const currentSettings = settingsList[0] || {};
    let excluded = Array.isArray(currentSettings.excludedCollections) 
      ? [...currentSettings.excludedCollections] 
      : [];

    const keysToAdd = [];
    if (id) keysToAdd.push(String(id).trim().toLowerCase());
    if (merchantId) keysToAdd.push(String(merchantId).trim().toLowerCase());
    if (merchantCode) keysToAdd.push(String(merchantCode).trim().toLowerCase());
    if (merchantName) keysToAdd.push(String(merchantName).trim().toLowerCase());

    if (id && id.includes('__')) {
      const codePart = id.split('__')[0].trim().toLowerCase();
      if (codePart && !keysToAdd.includes(codePart)) {
        keysToAdd.push(codePart);
      }
    }

    keysToAdd.forEach(k => {
      if (k && !excluded.includes(k)) excluded.push(k);
    });

    if (currentSettings.id) {
      await db.settings.update(currentSettings.id, { excludedCollections: excluded });
    }

    // Check if matching merchant exists in db.merchants and delete them completely
    let merchantDeleted = false;
    let deletedMerchantObj = null;

    if (merchantId) {
      deletedMerchantObj = await db.merchants.getById(merchantId);
    }
    if (!deletedMerchantObj && merchantCode) {
      deletedMerchantObj = await db.merchants.findOne(m => (m.code || '').trim().toLowerCase() === merchantCode.trim().toLowerCase());
    }
    if (!deletedMerchantObj && merchantName) {
      deletedMerchantObj = await db.merchants.findOne(m => (m.name || '').trim().toLowerCase() === merchantName.trim().toLowerCase());
    }

    if (deletedMerchantObj) {
      // Delete associated user account
      const user = await db.users.findOne(u => 
        (deletedMerchantObj.userId && String(u.id) === String(deletedMerchantObj.userId)) ||
        (u.merchantId && String(u.merchantId) === String(deletedMerchantObj.id)) ||
        (u.merchantCode && u.merchantCode.trim().toLowerCase() === deletedMerchantObj.code.trim().toLowerCase())
      );
      if (user) {
        await db.users.delete(user.id);
      }
      await db.merchants.delete(deletedMerchantObj.id);
      merchantDeleted = true;
    }

    // Unlink any products that were tied to this merchant code or id
    const allProducts = await db.products.getAll();
    for (const prod of allProducts) {
      let prodModified = false;
      const updates = {};
      if (merchantCode && prod.merchantCode && prod.merchantCode.trim().toLowerCase() === merchantCode.trim().toLowerCase()) {
        updates.merchantCode = '';
        updates.merchantName = '';
        updates.merchantId = '';
        prodModified = true;
      }
      if (deletedMerchantObj && prod.merchantId && String(prod.merchantId) === String(deletedMerchantObj.id)) {
        updates.merchantCode = '';
        updates.merchantName = '';
        updates.merchantId = '';
        prodModified = true;
      }
      if (prodModified) {
        await db.products.update(prod.id, updates);
      }
    }

    const logLabel = merchantName || merchantCode || id;
    await logActivity({
      userId: req.user.id,
      userName: req.user.name,
      userRole: req.user.role,
      action: 'DELETE_MERCHANT_COLLECTION',
      module: 'accounting',
      details: `قام بحذف التاجر وسجل التحصيل "${logLabel}" من قسم المحاسبة المالية وجدول تحصيل التجار`,
      metadata: { id, merchantCode, merchantName, merchantDeleted }
    });

    res.json({
      success: true,
      message: `تم حذف التاجر "${logLabel}" من قسم تحصيل التجار بنجاح ✅`
    });
  } catch (err) {
    console.error('Delete merchant collection error:', err);
    res.status(500).json({ success: false, message: 'فشل حذف التاجر من قسم التحصيل' });
  }
}

router.post('/collections/delete', requireAccountantWrite, handleCollectionDelete);
router.delete('/collections/:id', requireAccountantWrite, (req, res) => {
  const id = decodeURIComponent(req.params.id);
  const codePart = id.includes('__') ? id.split('__')[0] : id;
  req.body = { id, merchantCode: codePart, ...(req.body || {}) };
  return handleCollectionDelete(req, res);
});
router.delete('/merchants/:id', requireAccountantWrite, (req, res) => {
  const merchantId = req.params.id;
  req.body = { merchantId, ...(req.body || {}) };
  return handleCollectionDelete(req, res);
});

// 7. Record Remittance to Treasury (Accountant ONLY)
router.post('/collections/remit', requireAccountantWrite, async (req, res) => {
  try {
    const { employeeName, amount, notes } = req.body;

    if (!employeeName || amount === undefined || Number(amount) <= 0) {
      return res.status(400).json({
        success: false,
        message: 'اسم الموظف والمبلغ المورد (أكبر من صفر) مطلوبان'
      });
    }

    const cleanName = employeeName.trim();
    const remitVal = Number(amount);

    let emp = await db.employee_collections.findOne(e => e.employeeName.toLowerCase() === cleanName.toLowerCase());
    if (!emp) {
      emp = await db.employee_collections.insert({
        employeeName: cleanName,
        ordersCount: 0,
        cashToCollect: 0,
        remittedAmount: remitVal,
        difference: -remitVal,
        lastRemittedAt: new Date().toISOString()
      });
    } else {
      const currentRemitted = Number(emp.remittedAmount) || 0;
      const currentCash = Number(emp.cashToCollect) || 0;
      const newRemitted = currentRemitted + remitVal;
      await db.employee_collections.update(emp.id, {
        remittedAmount: newRemitted,
        difference: currentCash - newRemitted,
        lastRemittedAt: new Date().toISOString()
      });
    }

    // Log remittance entry in accounting
    const entry = await db.accounting.insert({
      type: 'remittance',
      employeeName: cleanName,
      amount: remitVal,
      notes: notes || 'توريد مبالغ نقدية إلى الخزينة',
      recordedBy: req.user.name,
      createdAt: new Date().toISOString()
    });

    await logActivity({
      userId: req.user.id,
      userName: req.user.name,
      userRole: req.user.role,
      action: 'TREASURY_REMITTANCE',
      module: 'accounting',
      details: `قام المحاسب بتسجيل توريد نقدي للخزينة من الموظف "${cleanName}" بمبلغ ${remitVal} ج.م`,
      metadata: { employeeName: cleanName, amount: remitVal }
    });

    res.json({
      success: true,
      message: `تم تسجيل توريد مبلغ ${remitVal} ج.م بنجاح من الموظف "${cleanName}" إلى الخزينة`,
      remittance: entry
    });
  } catch (err) {
    console.error('Record remittance error:', err);
    res.status(500).json({ success: false, message: 'فشل تسجيل التوريد للخزينة' });
  }
});

// 8. Update Commission Rate Setting (Accountant ONLY)
router.put('/settings', requireAccountantWrite, async (req, res) => {
  try {
    // The commission model was replaced by cost-based profit (merchants) and profit sharing (investors).
    if (req.body.storeCommissionPercent !== undefined) {
      return res.status(410).json({
        success: false,
        message: 'تم إلغاء نظام العمولة. ربح المتجر الآن = سعر البيع − سعر التكلفة (للتجار)، ونسبة المستثمر من الربح تُضبط من إعدادات المتجر أو ملف المستثمر.'
      });
    }
    const { storeCommissionPercent } = req.body;
    if (storeCommissionPercent === undefined || isNaN(Number(storeCommissionPercent))) {
      return res.status(400).json({
        success: false,
        message: 'يجب تحديد نسبة العمولة كرقم مئوي صحيح (مثال: 2.5 أو 3 أو 5)'
      });
    }

    const rate = Math.max(0, Math.min(100, Number(storeCommissionPercent)));
    const settingsList = await db.settings.getAll();
    if (settingsList.length > 0) {
      await db.settings.update(settingsList[0].id, { storeCommissionPercent: rate });
    } else {
      await db.settings.insert({ id: 'store_settings', storeCommissionPercent: rate });
    }

    await logActivity({
      userId: req.user.id,
      userName: req.user.name,
      userRole: req.user.role,
      action: 'UPDATE_COMMISSION_RATE',
      module: 'accounting',
      details: `قام المحاسب بتحديث نسبة عمولة المتجر إلى ${rate}%`,
      metadata: { storeCommissionPercent: rate }
    });

    res.json({
      success: true,
      message: `تم تحديث نسبة عمولة المتجر إلى ${rate}% بنجاح`,
      storeCommissionPercent: rate
    });
  } catch (err) {
    console.error('Update commission settings error:', err);
    res.status(500).json({ success: false, message: 'فشل تحديث إعدادات عمولة المتجر' });
  }
});

// ==========================================
// 9. EXPENSES & REVENUES MANAGEMENT (المصروفات والإيرادات العامة)
// ==========================================

// List all expenses & revenues with filtering
router.get('/expenses', async (req, res) => {
  try {
    const { type = 'all', category, timeRange = 'all', startDate, endDate, search, targetType, merchantId, investorId } = req.query;
    let list = await db.expenses.getAll();

    if (type !== 'all') {
      list = list.filter(e => e.type === type);
    }
    if (category && category !== 'all') {
      list = list.filter(e => e.category === category);
    }
    if (targetType && targetType !== 'all') {
      list = list.filter(e => {
        if (targetType === 'general') return !e.merchantId && !e.investorId;
        if (targetType === 'merchant') return Boolean(e.merchantId || e.merchantCode);
        if (targetType === 'investor') return Boolean(e.investorId || e.investorCode);
        return true;
      });
    }
    if (merchantId) {
      list = list.filter(e => String(e.merchantId) === String(merchantId) || (e.merchantCode && e.merchantCode.toLowerCase() === merchantId.toLowerCase()));
    }
    if (investorId) {
      list = list.filter(e => String(e.investorId) === String(investorId) || (e.investorCode && e.investorCode.toUpperCase() === investorId.toUpperCase()));
    }

    list = filterByDate(list, timeRange, startDate, endDate, 'date');

    if (search && search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(e => 
        (e.title && e.title.toLowerCase().includes(q)) ||
        (e.notes && e.notes.toLowerCase().includes(q)) ||
        (e.merchantName && e.merchantName.toLowerCase().includes(q)) ||
        (e.merchantCode && e.merchantCode.toLowerCase().includes(q)) ||
        (e.investorName && e.investorName.toLowerCase().includes(q)) ||
        (e.investorCode && e.investorCode.toLowerCase().includes(q))
      );
    }

    list.sort((a, b) => new Date(b.date || b.createdAt || 0) - new Date(a.date || a.createdAt || 0));

    let totalExpenses = 0;
    let totalRevenues = 0;

    list.forEach(item => {
      const amt = Number(item.amount) || 0;
      if (item.type === 'expense') totalExpenses += amt;
      else if (item.type === 'revenue') totalRevenues += amt;
    });

    res.json({
      success: true,
      expenses: list,
      stats: {
        totalItems: list.length,
        totalExpenses: Math.round(totalExpenses * 100) / 100,
        totalRevenues: Math.round(totalRevenues * 100) / 100,
        netBalance: Math.round((totalRevenues - totalExpenses) * 100) / 100
      }
    });
  } catch (err) {
    console.error('List expenses error:', err);
    res.status(500).json({ success: false, message: 'فشل جلب قائمة المصروفات والإيرادات' });
  }
});

// Add new expense or revenue item
router.post('/expenses', requireAccountantWrite, async (req, res) => {
  try {
    let { 
      title, amount, type = 'expense', category = 'عام', 
      targetType = 'general',
      merchantId, merchantName, merchantCode, 
      investorId, investorName, investorCode, 
      investorSharePercent = 50,
      date, receiptUrl, notes 
    } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({ success: false, message: 'عنوان أو وصف البند المالي مطلوب' });
    }
    const numAmount = Number(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      return res.status(400).json({ success: false, message: 'المبلغ يجب أن يكون رقماً موجباً أكبر من صفر' });
    }

    const itemDate = date ? new Date(date).toISOString() : new Date().toISOString();
    if (isNaN(new Date(itemDate).getTime())) {
      return res.status(400).json({ success: false, message: 'التاريخ غير صالح' });
    }
    const storeSettings = await getStoreSettings();
    const closedErr = await closedMonthError(itemDate, storeSettings);
    if (closedErr) return res.status(400).json({ success: false, message: closedErr });
    // Fixed category list (editable in the accounting settings) instead of free text
    const cats = expenseCategories(storeSettings);
    category = String(category || '').trim();
    if (!category || category === 'عام') category = 'أخرى';
    if (!cats.includes(category)) {
      return res.status(400).json({ success: false, message: `اختار تصنيف من القايمة: ${cats.join('، ')}` });
    }
    let expenseBatchId = null;

    // Resolve target binding (Merchant or Investor or General)
    if (targetType === 'merchant') {
      if (merchantId) {
        const m = await db.merchants.getById(merchantId);
        if (m) {
          merchantName = m.name;
          merchantCode = m.code;
        }
      }
      investorId = null;
      investorName = null;
      investorCode = null;
      investorSharePercent = null;
    } else if (targetType === 'investor') {
      const inv = investorId
        ? await db.investors.getById(investorId)
        : (investorCode ? await db.investors.findOne(i => i.code && i.code.toUpperCase() === String(investorCode).trim().toUpperCase()) : null);
      if (!inv) {
        return res.status(400).json({ success: false, message: 'اختار المستثمر اللي المصروف ده على منتجاته' });
      }
      investorId = inv.id;
      investorName = inv.name;
      investorCode = inv.code;
      // Shared expense is split by the investor's OWN profit share % (snapshot, so later % changes never rewrite it)
      investorSharePercent = investorSharePercentOf(inv, (await db.settings.getAll())[0] || {});
      // Optional: tie it to one capital batch (else it is a general expense on this investor)
      if (req.body.capitalBatchId) {
        if (!getCapitalBatches(inv).some(b => String(b.id) === String(req.body.capitalBatchId))) {
          return res.status(400).json({ success: false, message: 'دفعة رأس المال المختارة مش تبع المستثمر ده' });
        }
        expenseBatchId = String(req.body.capitalBatchId);
      }
      merchantId = null;
      merchantName = null;
      merchantCode = null;
    } else {
      targetType = 'general';
      merchantId = null;
      merchantName = null;
      merchantCode = null;
      investorId = null;
      investorName = null;
      investorCode = null;
      investorSharePercent = null;
    }

    const newExpense = await db.expenses.insert({
      title: title.trim(),
      amount: numAmount,
      type: type === 'revenue' ? 'revenue' : 'expense',
      category: (category || 'عام').trim(),
      targetType,
      merchantId: merchantId || null,
      merchantName: merchantName ? merchantName.trim() : null,
      merchantCode: merchantCode ? merchantCode.trim() : null,
      investorId: investorId || null,
      investorName: investorName ? investorName.trim() : null,
      investorCode: investorCode ? investorCode.trim() : null,
      investorSharePercent: targetType === 'investor' ? investorSharePercent : null,
      capitalBatchId: targetType === 'investor' ? expenseBatchId : null,
      date: itemDate,
      receiptUrl: (receiptUrl || '').trim(),
      notes: (notes || '').trim(),
      createdBy: req.user.id,
      createdByName: req.user.name,
      createdAt: new Date().toISOString()
    });

    const targetLabel = targetType === 'merchant' 
      ? ` [تاجر: ${merchantName || merchantCode}]` 
      : (targetType === 'investor' ? ` [مستثمر: ${investorName || investorCode} (${investorSharePercent}%)]` : ' [عام]');

    await logActivity({
      userId: req.user.id,
      userName: req.user.name,
      userRole: req.user.role,
      action: type === 'revenue' ? 'CREATE_REVENUE' : 'CREATE_EXPENSE',
      module: 'accounting',
      details: `قام بتسجيل ${type === 'revenue' ? 'إيراد' : 'مصروف'}: "${newExpense.title}" بمبلغ ${numAmount} ج.م${targetLabel}`,
      metadata: { expenseId: newExpense.id, amount: numAmount, targetType }
    });

    res.status(201).json({
      success: true,
      message: `تم تسجيل ${type === 'revenue' ? 'الإيراد' : 'المصروف'} بنجاح`,
      expense: newExpense
    });
  } catch (err) {
    console.error('Add expense error:', err);
    res.status(500).json({ success: false, message: 'فشل إضافة البند المالي' });
  }
});

// Update expense or revenue
router.put('/expenses/:id', requireAccountantWrite, async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await db.expenses.findById(id);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'البند المالي غير موجود' });
    }

    let { 
      title, amount, type, category, 
      targetType,
      merchantId, merchantName, merchantCode, 
      investorId, investorName, investorCode, 
      investorSharePercent,
      date, receiptUrl, notes 
    } = req.body;

    // Neither the old date nor the new date may be in a closed month
    const storeSettings = await getStoreSettings();
    const closedOld = await closedMonthError(existing.date || existing.createdAt, storeSettings);
    if (closedOld) return res.status(400).json({ success: false, message: closedOld });
    if (date) {
      const closedNew = await closedMonthError(new Date(date).toISOString(), storeSettings);
      if (closedNew) return res.status(400).json({ success: false, message: closedNew });
    }
    if (existing.payrollRunId) {
      return res.status(400).json({ success: false, message: 'ده مرتب متسجل من "صرف المرتبات". عدّله من صفحة الموظفين (إلغاء الصرف وإعادته).' });
    }
    if (category !== undefined) {
      const cats = expenseCategories(storeSettings);
      if (!cats.includes(String(category).trim())) {
        return res.status(400).json({ success: false, message: `اختار تصنيف من القايمة: ${cats.join('، ')}` });
      }
    }

    const updates = {};
    if (title) updates.title = title.trim();
    if (amount !== undefined) {
      const num = Number(amount);
      if (isNaN(num) || num <= 0) {
        return res.status(400).json({ success: false, message: 'المبلغ غير صالح' });
      }
      updates.amount = num;
    }
    if (type) updates.type = type === 'revenue' ? 'revenue' : 'expense';
    if (category) updates.category = category.trim();

    if (targetType !== undefined) {
      updates.targetType = targetType;
      if (targetType === 'merchant') {
        if (merchantId) {
          const m = await db.merchants.getById(merchantId);
          if (m) {
            merchantName = m.name;
            merchantCode = m.code;
          }
        }
        updates.merchantId = merchantId || null;
        updates.merchantName = merchantName ? merchantName.trim() : null;
        updates.merchantCode = merchantCode ? merchantCode.trim() : null;
        updates.investorId = null;
        updates.investorName = null;
        updates.investorCode = null;
        updates.investorSharePercent = null;
      } else if (targetType === 'investor') {
        const inv = investorId
          ? await db.investors.getById(investorId)
          : (investorCode ? await db.investors.findOne(i => i.code && i.code.toUpperCase() === String(investorCode).trim().toUpperCase()) : null);
        if (!inv) {
          return res.status(400).json({ success: false, message: 'اختار المستثمر اللي المصروف ده على منتجاته' });
        }
        const sameInvestor = existing.targetType === 'investor' && String(existing.investorId || '') === String(inv.id);
        updates.investorId = inv.id;
        updates.investorName = inv.name;
        updates.investorCode = inv.code;
        // Keep the % the expense was recorded with; take the investor's current % only if the investor changed
        updates.investorSharePercent = sameInvestor && existing.investorSharePercent !== null && existing.investorSharePercent !== undefined
          ? Number(existing.investorSharePercent)
          : investorSharePercentOf(inv, (await db.settings.getAll())[0] || {});
        if (req.body.capitalBatchId !== undefined) {
          const bid = req.body.capitalBatchId ? String(req.body.capitalBatchId) : null;
          if (bid && !getCapitalBatches(inv).some(b => String(b.id) === bid)) {
            return res.status(400).json({ success: false, message: 'دفعة رأس المال المختارة مش تبع المستثمر ده' });
          }
          updates.capitalBatchId = bid;
        } else if (!sameInvestor) {
          updates.capitalBatchId = null;
        }
        updates.merchantId = null;
        updates.merchantName = null;
        updates.merchantCode = null;
      } else {
        updates.targetType = 'general';
        updates.merchantId = null;
        updates.merchantName = null;
        updates.merchantCode = null;
        updates.investorId = null;
        updates.investorName = null;
        updates.investorCode = null;
        updates.investorSharePercent = null;
      }
    }

    if (date) updates.date = new Date(date).toISOString();
    if (receiptUrl !== undefined) updates.receiptUrl = receiptUrl.trim();
    if (notes !== undefined) updates.notes = notes.trim();
    updates.updatedAt = new Date().toISOString();

    const updated = await db.expenses.update(id, updates);

    // Edit history: exactly what changed (old → new)
    const watched = ['title', 'amount', 'type', 'category', 'date', 'targetType', 'merchantCode', 'investorCode', 'investorSharePercent', 'capitalBatchId', 'notes'];
    const changes = watched.filter(k => updates[k] !== undefined && String(updates[k] ?? '') !== String(existing[k] ?? ''));
    await logActivity({
      userId: req.user.id,
      userName: req.user.name,
      userRole: req.user.role,
      action: 'UPDATE_EXPENSE',
      module: 'accounting',
      details: `قام بتعديل البند المالي: "${updated.title}"${changes.length ? ' — ' + changes.map(k => `${k}: ${existing[k] ?? '—'} ← ${updates[k] ?? '—'}`).join(' | ') : ''}`,
      metadata: { expenseId: id, oldValues: Object.fromEntries(changes.map(k => [k, existing[k] ?? null])), newValues: Object.fromEntries(changes.map(k => [k, updates[k] ?? null])) }
    });
    await recordAuditLog({
      req, user: req.user, action: 'UPDATE_EXPENSE', targetModule: 'accounting', targetId: id,
      details: `تعديل "${updated.title}"`,
      oldValues: Object.fromEntries(changes.map(k => [k, existing[k] ?? null])),
      newValues: Object.fromEntries(changes.map(k => [k, updates[k] ?? null]))
    }).catch(() => {});

    res.json({
      success: true,
      message: 'تم تحديث البند المالي بنجاح',
      expense: updated
    });
  } catch (err) {
    console.error('Update expense error:', err);
    res.status(500).json({ success: false, message: 'فشل تعديل البند المالي' });
  }
});

// Delete expense or revenue
router.delete('/expenses/:id', requireFullAccountant, async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await db.expenses.findById(id);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'البند المالي غير موجود' });
    }
    const closedErr = await closedMonthError(existing.date || existing.createdAt);
    if (closedErr) return res.status(400).json({ success: false, message: closedErr });
    if (existing.payrollRunId) {
      return res.status(400).json({ success: false, message: 'ده مرتب متسجل من "صرف المرتبات". امسحه بإلغاء الصرف من صفحة الموظفين.' });
    }
    if (existing.returnId) {
      return res.status(400).json({ success: false, message: 'ده مصروف شحن استبدال مربوط بطلب استبدال. عدّل التكلفة من صفحة الاستبدال.' });
    }

    await db.expenses.delete(id);

    await logActivity({
      userId: req.user.id,
      userName: req.user.name,
      userRole: req.user.role,
      action: 'DELETE_EXPENSE',
      module: 'accounting',
      details: `قام بحذف البند المالي: "${existing.title}" بمبلغ ${existing.amount} ج.م (${existing.category || ''}, ${cairoDay(existing.date || existing.createdAt)})`,
      metadata: { expenseId: id, oldValues: existing }
    });
    await recordAuditLog({
      req, user: req.user, action: 'DELETE_EXPENSE', targetModule: 'accounting', targetId: id,
      details: `حذف "${existing.title}" بمبلغ ${existing.amount} ج.م`, oldValues: existing, newValues: null
    }).catch(() => {});

    res.json({
      success: true,
      message: 'تم حذف البند المالي بنجاح'
    });
  } catch (err) {
    console.error('Delete expense error:', err);
    res.status(500).json({ success: false, message: 'فشل حذف البند المالي' });
  }
});

// ==========================================
// 10. RETURNS & WARRANTY ACCOUNTING REPORT (تقرير المرتجعات والضمان وفروق الأسعار)
// ==========================================
router.get('/reports/returns', async (req, res) => {
  try {
    const { timeRange = 'all', startDate, endDate, merchantId } = req.query;

    const allReturns = await db.returns.getAll();
    const products = await db.products.getAll();
    const merchants = await db.merchants.getAll();
    const orders = await db.orders.getAll();

    // Map products & merchants by ID / code
    const prodMap = {};
    products.forEach(p => { prodMap[p.id] = p; });

    const merchMap = {};
    merchants.forEach(m => {
      merchMap[m.id] = m;
      if (m.code) merchMap[m.code] = m;
    });

    const orderMap = {};
    orders.forEach(o => { orderMap[o.id] = o; });

    let returnsList = allReturns.map(ret => {
      const prod = prodMap[ret.productId] || {};
      const order = orderMap[ret.orderId] || {};
      const merch = (prod.merchantId && merchMap[prod.merchantId]) || (prod.merchantCode && merchMap[prod.merchantCode]) || null;

      const merchantName = merch?.name || prod.merchantName || 'المتجر الرئيسي';
      const merchantCode = merch?.code || prod.merchantCode || 'GENERAL';
      const mId = merch?.id || prod.merchantId || null;

      const refundAmount = Number(ret.productPrice) || 0;
      const priceDifference = Number(ret.priceDifference) || 0;

      let returnType = 'استرجاع';
      if (ret.defectReason && ret.defectReason.includes('استبدال')) returnType = 'استبدال';
      else if (ret.defectReason && (ret.defectReason.includes('ضمان') || ret.defectReason.includes('عيب صناعة'))) returnType = 'ضمان وصيانة';

      return {
        id: ret.id,
        returnNumber: ret.returnNumber || `RET-${ret.id.slice(0, 6)}`,
        orderId: ret.orderId,
        orderNumber: ret.orderNumber || order.orderNumber || '—',
        userId: ret.userId,
        userName: ret.userName || 'عميل',
        userPhone: ret.phone || ret.whatsappPhone || '—',
        productId: ret.productId,
        productTitle: ret.productTitle || prod.title || 'منتج',
        productPrice: refundAmount,
        priceDifference,
        refundAmount,
        returnType,
        defectReason: ret.defectReason || '',
        description: ret.description || '',
        status: ret.status,
        merchantId: mId,
        merchantName,
        merchantCode,
        createdAt: ret.createdAt,
        updatedAt: ret.updatedAt
      };
    });

    if (merchantId && merchantId !== 'all') {
      returnsList = returnsList.filter(r => r.merchantId === merchantId || r.merchantCode === merchantId);
    }

    returnsList = filterByDate(returnsList, timeRange, startDate, endDate, 'createdAt');

    // Totals
    let totalReturnsCount = returnsList.length;
    let totalRefundAmount = 0;
    let totalPriceDifferences = 0;

    const merchantGroup = {};

    returnsList.forEach(r => {
      totalRefundAmount += r.refundAmount;
      totalPriceDifferences += r.priceDifference;

      const mKey = r.merchantCode || 'GENERAL';
      if (!merchantGroup[mKey]) {
        merchantGroup[mKey] = {
          merchantName: r.merchantName,
          merchantCode: r.merchantCode,
          returnsCount: 0,
          totalRefunded: 0,
          totalDifference: 0
        };
      }
      merchantGroup[mKey].returnsCount += 1;
      merchantGroup[mKey].totalRefunded += r.refundAmount;
      merchantGroup[mKey].totalDifference += r.priceDifference;
    });

    returnsList.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    res.json({
      success: true,
      returns: returnsList,
      stats: {
        totalReturnsCount,
        totalRefundAmount: Math.round(totalRefundAmount),
        totalPriceDifferences: Math.round(totalPriceDifferences),
        byMerchant: Object.values(merchantGroup).sort((a, b) => b.totalRefunded - a.totalRefunded)
      }
    });
  } catch (err) {
    console.error('Returns report error:', err);
    res.status(500).json({ success: false, message: 'فشل إنشاء تقرير المرتجعات والضمان' });
  }
});

// ==========================================
// MERCHANT PORTAL VIEW-ONLY ACCOUNTING (STRICT ISOLATION)
// ==========================================
// ==========================================================================
// STEP 4 — unified ledger, expense categories, month closing
// ==========================================================================

// All money movements in ONE list with a fixed type, a party and the Cairo month.
async function buildLedgerRows(L) {
  const rows = [];
  const push = (r) => rows.push({ ...r, period: cairoMonth(r.date), day: cairoDay(r.date), typeLabel: (ENTRY_TYPES[r.type] || {}).label || r.type, direction: (ENTRY_TYPES[r.type] || {}).direction ?? 0 });
  L.all.forEach(({ order, econ }) => push({
    id: `ord_${order.id}`, type: 'order_collection', date: order._deliveredAt, amount: econ.collected,
    party: { type: 'customer', name: order.customerName || 'عميل' }, ref: order.orderNumber,
    note: `مستحقات أصحاب البضاعة ${econ.ownerDues} • صافي المتجر ${econ.storeNet}`
  }));
  L.accounting.filter(a => a.type).forEach(a => {
    const type = a.type === 'merchant_payout' ? 'merchant_payout' : a.type === 'investor_payout' ? 'investor_payout' : a.type === 'remittance' ? 'remittance' : null;
    if (!type) return;
    push({
      id: a.id, type, date: a.date || a.createdAt, amount: round2(a.amount),
      party: type === 'merchant_payout' ? { type: 'merchant', name: a.merchantName || a.merchantCode } : type === 'investor_payout' ? { type: 'investor', name: a.investorName || a.investorCode } : { type: 'courier', name: a.employeeName || '' },
      ref: a.referenceNumber || a.reference || '', note: a.notes || a.description || ''
    });
  });
  L.expensesAll.forEach(e => {
    const type = e.employeeId ? (e.entryType || 'salary') : (e.type === 'revenue' ? 'revenue' : 'expense');
    push({
      id: e.id, type, date: e.date || e.createdAt, amount: round2(e.amount), category: e.category || '',
      party: e.employeeId ? { type: 'employee', name: e.employeeName || '' } : e.merchantId || e.merchantCode ? { type: 'merchant', name: e.merchantName || e.merchantCode } : e.investorId || e.investorCode ? { type: 'investor', name: e.investorName || e.investorCode } : { type: 'store', name: 'المتجر' },
      ref: e.payrollRunId ? `مرتبات ${e.payrollPeriod || ''}` : '', note: e.title
    });
  });
  const advances = await db.employee_adjustments.find(a => a.type === 'advance');
  advances.forEach(a => push({ id: a.id, type: 'employee_advance', date: a.date || a.createdAt, amount: round2(a.amount), party: { type: 'employee', name: a.employeeName || '' }, ref: '', note: a.note || '' }));
  L.ctx.investors.forEach(inv => getCapitalBatches(inv).forEach(b => (b.history || []).forEach((h, i) => {
    if (!(Number(h.change) > 0)) return;
    push({ id: `cap_${b.id}_${i}`, type: 'capital_in', date: h.at || b.createdAt, amount: round2(h.change), party: { type: 'investor', name: inv.name }, ref: b.label, note: h.note || '' });
  })));
  rows.sort((a, b) => new Date(b.date) - new Date(a.date));
  return rows;
}

router.get('/ledger', async (req, res) => {
  try {
    const { timeRange = 'month', startDate, endDate, type = 'all', search = '' } = req.query;
    const L = await loadLedger({ timeRange: 'all' });
    let rows = await buildLedgerRows(L);
    rows = filterByDate(rows, timeRange, startDate, endDate, 'date');
    if (type !== 'all') rows = rows.filter(r => r.type === type);
    const q = String(search).trim().toLowerCase();
    if (q) rows = rows.filter(r => [r.ref, r.note, r.party && r.party.name, r.category].some(v => String(v || '').toLowerCase().includes(q)));
    const totals = {};
    rows.forEach(r => { totals[r.type] = round2((totals[r.type] || 0) + r.amount); });
    const moneyIn = round2(rows.filter(r => r.direction > 0).reduce((s, r) => s + r.amount, 0));
    const moneyOut = round2(rows.filter(r => r.direction < 0).reduce((s, r) => s + r.amount, 0));
    res.json({ success: true, types: ENTRY_TYPES, totals, moneyIn, moneyOut, net: round2(moneyIn - moneyOut), count: rows.length, rows: rows.slice(0, 1000) });
  } catch (err) {
    console.error('Ledger error:', err);
    res.status(500).json({ success: false, message: 'فشل جلب دفتر الحركات' });
  }
});

router.get('/expense-categories', async (req, res) => {
  res.json({ success: true, categories: expenseCategories(await getStoreSettings()) });
});

router.put('/expense-categories', requireFullAccountant, async (req, res) => {
  try {
    const list = Array.isArray(req.body.categories) ? req.body.categories.map(c => String(c || '').trim()).filter(Boolean) : [];
    const unique = [...new Set(list)].slice(0, 60);
    if (unique.length < 2) return res.status(400).json({ success: false, message: 'لازم يكون فيه تصنيفين على الأقل' });
    if (unique.some(c => c.length > 40)) return res.status(400).json({ success: false, message: 'اسم التصنيف طويل (أقصى 40 حرف)' });
    const s = await getStoreSettings();
    if (s.id) await db.settings.update(s.id, { expenseCategories: unique }); else await db.settings.insert({ id: 'store_settings', expenseCategories: unique });
    res.json({ success: true, categories: expenseCategories({ expenseCategories: unique }) });
  } catch (err) {
    res.status(500).json({ success: false, message: 'فشل حفظ التصنيفات' });
  }
});

// Summary of one Cairo month (same numbers as the dashboard for that month)
async function periodSummary(ym) {
  const L = await loadLedger({ timeRange: 'period', startDate: ym });
  const sum = (f) => round2(L.period.reduce((s, r) => s + f(r.econ), 0));
  let storeExpenses = 0, storeOtherRevenues = 0;
  L.expensesPeriod.forEach(e => { const v = expenseSplit(e).store; if (v < 0) storeExpenses += -v; else storeOtherRevenues += v; });
  const storeGrossProfit = sum(e => e.storeNet);
  const payouts = L.accounting.filter(a => (a.type === 'merchant_payout' || a.type === 'investor_payout') && cairoMonth(a.date || a.createdAt) === ym);
  const salaries = L.expensesPeriod.filter(e => e.payrollRunId);
  return {
    period: ym,
    deliveredOrders: L.period.length,
    collected: sum(e => e.collected),
    merchantDues: sum(e => e.merchantDues),
    investorDues: sum(e => e.investorDues),
    storeGoodsCost: sum(e => e.storeGoodsCost || 0),
    storeGrossProfit,
    storeExpenses: round2(storeExpenses),
    storeOtherRevenues: round2(storeOtherRevenues),
    salaries: round2(salaries.reduce((s, e) => s + (Number(e.amount) || 0), 0)),
    netProfit: round2(storeGrossProfit - storeExpenses + storeOtherRevenues),
    payoutsMerchants: round2(payouts.filter(p => p.type === 'merchant_payout').reduce((s, p) => s + (Number(p.amount) || 0), 0)),
    payoutsInvestors: round2(payouts.filter(p => p.type === 'investor_payout').reduce((s, p) => s + (Number(p.amount) || 0), 0))
  };
}

async function closePeriod(ym, user, { auto = false } = {}) {
  const s = await getStoreSettings();
  const closed = { ...closedPeriods(s) };
  if (closed[ym]) return { ok: false, message: `شهر ${ym} مقفول بالفعل` };
  if (ym >= todayCairo().slice(0, 7)) return { ok: false, message: 'مينفعش تقفل الشهر الحالي أو شهر لسه ما جاش. اقفله بعد ما يخلص.' };
  closed[ym] = {
    closedAt: new Date().toISOString(),
    closedBy: auto ? 'قفل تلقائي' : (user && user.name) || 'المدير العام',
    auto,
    summary: await periodSummary(ym)
  };
  if (s.id) await db.settings.update(s.id, { closedPeriods: closed }); else await db.settings.insert({ id: 'store_settings', closedPeriods: closed });
  await logActivity({ userId: user ? user.id : 'system', userName: closed[ym].closedBy, userRole: user ? user.role : 'system', action: 'CLOSE_PERIOD', module: 'accounting', details: `قفل شهر ${ym}${auto ? ' (تلقائي)' : ''}` });
  return { ok: true, period: closed[ym] };
}

// Called by the server on start and every hour: closes last month on the chosen day (if switched on)
async function autoClosePeriods() {
  try {
    const s = await getStoreSettings();
    const day = Number(s.autoClosePeriodDay) || 0;
    if (!day) return null;
    const today = todayCairo();
    if (Number(today.slice(8, 10)) < day) return null;
    const last = previousMonth(today.slice(0, 7));
    if (closedPeriods(s)[last]) return null;
    return await closePeriod(last, null, { auto: true });
  } catch (err) {
    console.error('Auto close period error:', err.message);
    return null;
  }
}

router.get('/periods', async (req, res) => {
  try {
    const s = await getStoreSettings();
    const closed = closedPeriods(s);
    const L = await loadLedger({ timeRange: 'all' });
    const months = new Set([todayCairo().slice(0, 7), ...Object.keys(closed)]);
    L.all.forEach(r => months.add(cairoMonth(r.order._deliveredAt)));
    L.expensesAll.forEach(e => months.add(cairoMonth(e.date || e.createdAt)));
    const list = [];
    for (const ym of [...months].filter(Boolean).sort().reverse().slice(0, 24)) {
      list.push({ period: ym, closed: Boolean(closed[ym]), closedAt: closed[ym]?.closedAt || null, closedBy: closed[ym]?.closedBy || null, isCurrent: ym === todayCairo().slice(0, 7), summary: closed[ym] ? closed[ym].summary : await periodSummary(ym) });
    }
    res.json({ success: true, autoClosePeriodDay: Number(s.autoClosePeriodDay) || 0, periods: list });
  } catch (err) {
    console.error('Periods error:', err);
    res.status(500).json({ success: false, message: 'فشل جلب الشهور' });
  }
});

const requireOwner = (req, res, next) => (req.isSuperAdmin ? next() : res.status(403).json({ success: false, message: 'قفل وفتح الشهور للمدير العام بس' }));

router.post('/periods/:ym/close', requireOwner, async (req, res) => {
  const ym = String(req.params.ym);
  if (!/^\d{4}-\d{2}$/.test(ym)) return res.status(400).json({ success: false, message: 'الشهر لازم يكون بالشكل 2026-11' });
  const r = await closePeriod(ym, req.user);
  if (!r.ok) return res.status(400).json({ success: false, message: r.message });
  res.json({ success: true, message: `تم قفل شهر ${ym}. أي تعديل فيه بعد كده لازم يتعمل كقيد تسوية في شهر مفتوح.`, period: r.period });
});

router.post('/periods/:ym/reopen', requireOwner, async (req, res) => {
  const ym = String(req.params.ym);
  const reason = String(req.body.reason || '').trim();
  if (reason.length < 5) return res.status(400).json({ success: false, message: 'اكتب سبب فتح الشهر (5 حروف على الأقل)' });
  const s = await getStoreSettings();
  const closed = { ...closedPeriods(s) };
  if (!closed[ym]) return res.status(400).json({ success: false, message: 'الشهر ده مش مقفول' });
  const was = closed[ym];
  delete closed[ym];
  const history = Array.isArray(s.periodReopenHistory) ? s.periodReopenHistory : [];
  await db.settings.update(s.id, { closedPeriods: closed, periodReopenHistory: [...history, { period: ym, reopenedAt: new Date().toISOString(), by: req.user.name, reason, previousSummary: was.summary }].slice(-100) });
  await logActivity({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'REOPEN_PERIOD', module: 'accounting', details: `فتح شهر ${ym} — السبب: ${reason}` });
  await recordAuditLog({ req, user: req.user, action: 'REOPEN_PERIOD', targetModule: 'accounting', targetId: ym, details: `فتح شهر ${ym}: ${reason}`, oldValues: was.summary, newValues: null }).catch(() => {});
  res.json({ success: true, message: `تم فتح شهر ${ym}` });
});

router.put('/periods-settings', requireOwner, async (req, res) => {
  const day = Number(req.body.autoClosePeriodDay);
  if (!Number.isInteger(day) || day < 0 || day > 28) return res.status(400).json({ success: false, message: 'اليوم لازم يكون من 1 لـ 28 (أو 0 = يدوي بس)' });
  const s = await getStoreSettings();
  if (s.id) await db.settings.update(s.id, { autoClosePeriodDay: day }); else await db.settings.insert({ id: 'store_settings', autoClosePeriodDay: day });
  const r = day ? await autoClosePeriods() : null;
  res.json({ success: true, autoClosePeriodDay: day, message: day ? `الشهر اللي فات هيتقفل تلقائي يوم ${day} من كل شهر${r && r.ok ? ' (واتقفل دلوقتي لأن اليوم عدّى)' : ''}` : 'القفل بقى يدوي بس' });
});

// ==========================================================================
// MERCHANT PORTAL — what a merchant may see about HIS account (wholesale cost only).
// Never: selling price, compare-at price, discounts, coupons, shipping, store profit, customer data.
// ==========================================================================
const ORDER_STATUS_AR = { pending: 'اتعمل (قيد المراجعة)', processing: 'قيد التجهيز', shipped: 'في الطريق للعميل', delivered: 'اتسلّم للعميل', cancelled: 'اتلغى' };
const RETURN_STATUS_AR = { pending_review: 'طلب استبدال تحت المراجعة', accepted: 'استبدال مقبول', courier_dispatched: 'المندوب رايح يستلم القطعة', received: 'القطعة رجعت المخزن', replaced: 'تم الاستبدال', rejected: 'طلب الاستبدال اترفض' };

async function resolveMerchantForRequest(req) {
  if (req.user.role === 'merchant') {
    let merchant = null;
    if (req.user.merchantId) merchant = await db.merchants.getById(req.user.merchantId);
    const code = (req.user.merchantCode || '').trim().toLowerCase();
    if (!merchant && code) merchant = await db.merchants.findOne(m => m.code && m.code.trim().toLowerCase() === code);
    if (!merchant) merchant = await db.merchants.findOne(m => (m.userId && m.userId === req.user.id) || (req.user.username && m.username === req.user.username));
    return merchant;
  }
  // Store management / accountants may open any merchant's portal view
  const canInspect = ['super_admin', 'admin', 'accountant'].includes(req.user.role) || req.user.permissions?.canManageAccounting;
  if (canInspect && (req.query.merchantCode || req.query.merchantId)) {
    if (req.query.merchantId) return db.merchants.getById(req.query.merchantId);
    const qCode = String(req.query.merchantCode).trim().toLowerCase();
    return db.merchants.findOne(m => m.code && m.code.trim().toLowerCase() === qCode);
  }
  return undefined; // not allowed
}

async function merchantPortalHandler(req, res) {
  try {
    const merchant = await resolveMerchantForRequest(req);
    if (merchant === undefined) {
      return res.status(403).json({ success: false, message: 'هذه الصفحة مخصصة لحساب التاجر' });
    }
    if (!merchant) {
      return res.status(404).json({ success: false, message: 'لم يتم العثور على سجل التاجر المطلوب' });
    }

    const ctx = await loadContext();
    const [allOrders, returns] = await Promise.all([db.orders.getAll(), db.returns.getAll()]);
    const myProducts = getMerchantProducts(ctx.products, merchant);

    // Per product counters (units): sold = delivered, inOrders = still on the way
    const perProduct = new Map(myProducts.map(p => [String(p.id), { sold: 0, inOrders: 0 }]));
    const orders = [];
    allOrders.forEach(o => {
      const econ = orderEconomics(o, ctx);
      const mine = econ.items.filter(i => itemOfMerchant(i, merchant));
      if (!mine.length) return;
      const status = o.status || 'pending';
      const rawItems = o.items || [];
      const items = mine.map(i => {
        const raw = rawItems.find(r => String(r.productId || r.id || '') === i.productId) || {};
        const counter = perProduct.get(i.productId) || { sold: 0, inOrders: 0 };
        if (status === 'delivered') counter.sold += i.qty;
        else if (status !== 'cancelled') counter.inOrders += i.qty;
        perProduct.set(i.productId, counter);
        const ret = returns.filter(r => String(r.orderId) === String(o.id) && String(r.productId) === i.productId)
          .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
        return {
          productId: i.productId,
          title: i.title,
          variantLabel: raw.variantLabel || '',
          quantity: i.qty,
          unitCost: i.unitCost,
          lineCost: i.cost,
          exchangeStatus: ret ? ret.status : null,
          exchangeStatusLabel: ret ? (RETURN_STATUS_AR[ret.status] || ret.status) : null
        };
      });
      orders.push({
        orderNumber: o.orderNumber,
        date: o.createdAt,
        deliveredAt: status === 'delivered' ? deliveredDate(o) : null,
        status,
        statusLabel: ORDER_STATUS_AR[status] || status,
        hasExchange: items.some(i => i.exchangeStatus),
        units: items.reduce((s, i) => s + i.quantity, 0),
        costTotal: round2(items.reduce((s, i) => s + i.lineCost, 0)),
        // Counts toward the merchant's dues only once delivered
        countsInDues: status === 'delivered',
        items
      });
    });
    orders.sort((a, b) => new Date(b.date) - new Date(a.date));

    const products = myProducts.map(p => {
      const c = perProduct.get(String(p.id)) || { sold: 0, inOrders: 0 };
      const stock = Math.max(0, Number(p.stock) || 0);
      return {
        id: p.id,
        title: p.title,
        image: Array.isArray(p.images) && p.images.length ? p.images[0] : '',
        sku: p.sku || '',
        wholesalePrice: productCost(p),
        unitsRegistered: stock + c.sold + c.inOrders,
        unitsSold: c.sold,
        unitsInOrders: c.inOrders,
        unitsUnsold: stock,
        isActive: p.isActive !== false,
        variants: (p.variants || []).map(v => ({ label: Object.values(v.options || {}).join(' / '), stock: Number(v.stock) || 0 }))
      };
    });

    // Money: dues at cost (delivered only) ± merchant-tagged adjustments, minus payouts
    const ledger = await loadLedger({ timeRange: 'all' });
    const account = merchantAccount(merchant, ledger);
    const expenses = ledger.expensesAll.filter(e => expenseOfMerchant(e, merchant)).map(e => ({
      id: e.id, title: e.title, amount: round2(e.amount), type: e.type === 'revenue' ? 'revenue' : 'expense',
      category: e.category || 'عام', date: e.date || e.createdAt, notes: e.notes || ''
    })).sort((a, b) => new Date(b.date) - new Date(a.date));
    const payouts = account.payouts.map(p => ({
      id: p.id, amount: round2(p.amount), date: p.date || p.createdAt,
      paymentMethod: p.paymentMethod || 'تحويل', reference: p.referenceNumber || p.reference || '-', notes: p.notes || p.description || ''
    })).sort((a, b) => new Date(b.date) - new Date(a.date));

    const sum = k => products.reduce((s, p) => s + p[k], 0);
    const adjustments = round2(expenses.reduce((s, e) => s + (e.type === 'revenue' ? e.amount : -e.amount), 0));
    res.json({
      success: true,
      merchant: { id: merchant.id, code: merchant.code, name: merchant.name },
      summary: {
        productsCount: products.length,
        unitsRegistered: sum('unitsRegistered'),
        unitsSold: sum('unitsSold'),
        unitsInOrders: sum('unitsInOrders'),
        unitsUnsold: sum('unitsUnsold'),
        soldAtCost: round2(account.lifetimeDues - adjustments),
        adjustments,
        totalDues: account.lifetimeDues,
        totalPaid: account.totalPaid,
        // Positive = the store still owes the merchant; negative = merchant was paid more than earned
        remaining: account.balance
      },
      products,
      orders,
      payouts,
      expenses
    });
  } catch (err) {
    console.error('Merchant portal error:', err);
    res.status(500).json({ success: false, message: 'فشل جلب بيانات حساب التاجر' });
  }
}

module.exports = router;
module.exports.autoClosePeriods = autoClosePeriods;
