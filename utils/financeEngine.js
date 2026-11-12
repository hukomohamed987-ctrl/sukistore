/**
 * Suki Store finance engine — ONE place that decides who gets what from every sale.
 *
 * Business rules (set by the owner, 2026-11-11):
 *  - Store-owned product:   the whole sale belongs to the store (profit = sale − cost if a cost is known).
 *  - Merchant product:      the merchant is owed his COST price only. Everything above it is store profit.
 *                           (No commission percentage any more.)
 *  - Investor product:      the investor gets back his COST + his share (%) of the profit (sale − cost).
 *                           The rest of the profit is the store's. A loss is shared the same way.
 *  - Coupons / loyalty discounts: spread over the order lines by value. On merchant / store lines the store
 *    pays them. On investor lines (orders with discountRule 'shared', i.e. new orders) they come out of the
 *    profit and are split by the investor's %. Shipping fees collected are store income.
 *  - Expenses: general → store. Merchant-tagged → reduce that merchant's dues.
 *              Investor-tagged → split by the investor's profit share % (snapshotted on the expense).
 *
 * Costs are taken from the order item snapshot (item.costPrice) so editing a product later never
 * rewrites history. Old orders without a snapshot fall back to the product's current cost.
 */
const db = require('../database/db');
const { isInvestorOwned, isMerchantOwned } = require('./ownershipHelper');

const round2 = n => Math.round((Number(n) || 0) * 100) / 100;
const DEFAULT_INVESTOR_SHARE = 50;

function num(v) {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function productCost(product) {
  if (!product) return null;
  return num(product.costPrice) ?? num(product.merchantPrice) ?? num(product.basePrice);
}

function itemOwnerType(item, product) {
  if (item && item.ownerType) return item.ownerType;
  const src = product || item;
  if (isInvestorOwned(src)) return 'investor';
  if (isMerchantOwned(src)) return 'merchant';
  return 'store';
}

function investorSharePercent(item, investor, settings) {
  const pct = num(item && item.investorProfitSharePercent)
    ?? num(investor && investor.profitSharePercent)
    ?? num(settings && settings.defaultInvestorProfitSharePercent)
    ?? DEFAULT_INVESTOR_SHARE;
  return Math.min(100, Math.max(0, pct));
}

/**
 * Money split for one order line.
 * `alloc` = this line's part of the order discounts { coupon, loyalty } (see orderEconomics) and
 * `sharedDiscounts` = true when the order follows the rule "investor carries his % of discounts".
 */
function itemEconomics(item, ctx = {}, alloc = { coupon: 0, loyalty: 0 }, sharedDiscounts = false) {
  const product = ctx.productsById ? ctx.productsById.get(String(item.productId || item.id || '')) : null;
  const ownerType = itemOwnerType(item, product);
  const qty = Number(item.quantity) || 1;
  const unitPrice = num(item.price) ?? num(product && product.price) ?? 0;
  const snapCost = num(item.costPrice);
  const unitCost = snapCost ?? productCost(product) ?? 0;
  const costMissing = snapCost === null && productCost(product) === null;
  const sales = unitPrice * qty;
  const cost = unitCost * qty;
  const grossProfit = sales - cost;

  const investorId = item.investorId || (product && product.investorId) || null;
  const investorCode = item.investorCode || (product && product.investorCode) || '';
  const investor = ownerType === 'investor' && ctx.investorsById
    ? (ctx.investorsById.get(String(investorId)) || (investorCode && ctx.investorsByCode && ctx.investorsByCode.get(String(investorCode).toUpperCase())) || null)
    : null;

  // storeProfit is the store's part BEFORE discounts; storeDiscountShare is what the store pays of them.
  const couponPart = Number(alloc && alloc.coupon) || 0;
  const loyaltyPart = Number(alloc && alloc.loyalty) || 0;
  const discount = couponPart + loyaltyPart;
  let ownerDue = 0, storeProfit = 0, investorProfit = 0, sharePercent = null;
  let investorDiscountShare = 0, storeDiscountShare = discount;
  if (ownerType === 'merchant') {
    // Merchant always gets his full cost: discounts are the store's
    ownerDue = cost;
    storeProfit = grossProfit;
  } else if (ownerType === 'investor') {
    sharePercent = investorSharePercent(item, investor, ctx.settings);
    const pct = sharePercent / 100;
    if (sharedDiscounts) {
      // Discounts come out of the profit (after cost) and are split by the same percentage
      investorDiscountShare = discount * pct;
      storeDiscountShare = discount - investorDiscountShare;
    }
    investorProfit = grossProfit * pct - investorDiscountShare;
    ownerDue = cost + investorProfit;
    storeProfit = grossProfit * (1 - pct);
  } else {
    storeProfit = costMissing ? sales : grossProfit;
  }

  return {
    productId: String(item.productId || item.id || ''),
    title: item.title || (product && product.title) || '',
    ownerType,
    merchantId: item.merchantId || (product && product.merchantId) || null,
    merchantCode: item.merchantCode || (product && product.merchantCode) || '',
    investorId: investor ? investor.id : investorId,
    investorCode: investor ? investor.code : investorCode,
    capitalBatchId: item.capitalBatchId || (product && product.capitalBatchId) || null,
    qty,
    unitPrice: round2(unitPrice),
    unitCost: round2(unitCost),
    costMissing,
    sales: round2(sales),
    cost: round2(cost),
    grossProfit: round2(grossProfit),
    sharePercent,
    investorProfit: round2(investorProfit),
    ownerDue: round2(ownerDue),
    storeProfit: round2(storeProfit),
    couponDiscount: round2(couponPart),
    loyaltyDiscount: round2(loyaltyPart),
    discount: round2(discount),
    investorDiscountShare: round2(investorDiscountShare),
    storeDiscountShare: round2(storeDiscountShare)
  };
}

// Orders placed after 2026-11-11 carry `discountRule: 'shared'` (set at checkout):
// on them an investor carries his % of the coupon / loyalty discount on his products.
// Older orders keep the old rule (store paid all discounts) so settled accounts never change.
function ordersSharesDiscounts(order) {
  return order && order.discountRule === 'shared';
}

/**
 * Money split for a whole order.
 * Identity: collected = ownerDues + storeGoodsCost + storeItemProfit + shippingFee − discounts(store part)
 */
function orderEconomics(order, ctx = {}) {
  const raw = order.items || [];
  const coupon = Number(order.discountAmount) || 0;
  const loyalty = Number(order.loyaltyDiscountAmount) || 0;
  // Spread the order discount over its lines in proportion to each line's sales value
  const lineSales = raw.map(it => (Number(it.price) || 0) * (Number(it.quantity) || 1));
  const totalSales = lineSales.reduce((s, v) => s + v, 0);
  const shared = ordersSharesDiscounts(order);
  const items = raw.map((it, idx) => {
    const w = totalSales > 0 ? lineSales[idx] / totalSales : 0;
    return itemEconomics(it, ctx, { coupon: coupon * w, loyalty: loyalty * w }, shared);
  });
  const sum = (f) => round2(items.reduce((s, i) => s + f(i), 0));
  const shippingFee = round2(order.shippingFee || order.shippingCost || 0);
  const discountsTotal = round2(coupon + loyalty);
  const discountsInvestorPart = sum(i => i.investorDiscountShare);
  // What the store itself pays of the discounts (everything not carried by investors)
  const discounts = round2(discountsTotal - discountsInvestorPart);
  const storeItemProfit = sum(i => i.storeProfit);
  return {
    orderId: order.id,
    orderNumber: order.orderNumber,
    items,
    sales: sum(i => i.sales),
    cost: sum(i => i.cost),
    // Cost of the store's OWN goods sold (money that just comes back to the store, not profit)
    storeGoodsCost: sum(i => i.ownerType === 'store' && !i.costMissing ? i.cost : 0),
    merchantDues: sum(i => i.ownerType === 'merchant' ? i.ownerDue : 0),
    investorDues: sum(i => i.ownerType === 'investor' ? i.ownerDue : 0),
    ownerDues: sum(i => i.ownerDue),
    storeItemProfit,
    shippingFee,
    discounts,
    discountsTotal,
    discountsInvestorPart,
    discountRule: shared ? 'shared' : 'store',
    storeNet: round2(storeItemProfit + shippingFee - discounts),
    collected: round2(order.grandTotal || 0),
    paymentMethod: order.paymentMethod || 'cod'
  };
}

function deliveredDate(order) {
  if (order.deliveredAt) return order.deliveredAt;
  const h = Array.isArray(order.statusHistory) ? order.statusHistory.filter(x => x.status === 'delivered').pop() : null;
  return (h && h.timestamp) || order.createdAt;
}

/** Split one expense/revenue entry between store, merchant and investor. Signed: expense < 0, revenue > 0. */
function expenseSplit(e) {
  const amt = Number(e.amount) || 0;
  const sign = e.type === 'revenue' ? 1 : -1;
  if (e.investorId || (e.investorCode && !e.merchantId && !e.merchantCode)) {
    const pct = (num(e.investorSharePercent) ?? 50) / 100;
    return { store: round2(sign * amt * (1 - pct)), investor: round2(sign * amt * pct), merchant: 0 };
  }
  if (e.merchantId || e.merchantCode) {
    return { store: 0, investor: 0, merchant: round2(sign * amt) };
  }
  return { store: round2(sign * amt), investor: 0, merchant: 0 };
}

async function loadContext() {
  const [products, investors, settingsList] = await Promise.all([
    db.products.getAll(), db.investors.getAll(), db.settings.getAll()
  ]);
  return {
    productsById: new Map(products.map(p => [String(p.id), p])),
    investorsById: new Map(investors.map(i => [String(i.id), i])),
    investorsByCode: new Map(investors.filter(i => i.code).map(i => [String(i.code).toUpperCase(), i])),
    settings: settingsList[0] || {},
    products,
    investors
  };
}

/**
 * Investor capital is kept as separate batches (each upload can start a new batch or add to one).
 * Older records only have a single `capital` number: that becomes one "legacy" batch.
 */
function getCapitalBatches(investor) {
  if (!investor) return [];
  if (Array.isArray(investor.capitalBatches) && investor.capitalBatches.length > 0) return investor.capitalBatches;
  const cap = Number(investor.capital) || 0;
  return cap > 0 ? [{ id: 'legacy', label: 'رأس المال الأساسي', amount: cap, createdAt: investor.createdAt || null, history: [] }] : [];
}

function totalCapital(investor) {
  return round2(getCapitalBatches(investor).reduce((s, b) => s + (Number(b.amount) || 0), 0));
}

function newCapitalBatch(amount, label, user, note) {
  const now = new Date().toISOString();
  const id = 'cap_' + require('crypto').randomBytes(6).toString('hex');
  return {
    id,
    label: String(label || '').trim() || `دفعة رأس مال ${now.slice(0, 10)}`,
    amount: round2(amount),
    createdAt: now,
    history: [{ at: now, change: round2(amount), by: user ? user.name : 'النظام', note: note || 'إنشاء الدفعة' }]
  };
}

/**
 * Add capital to an investor without ever overwriting earlier capital.
 *  mode 'new' → a separate batch (tracked and recovered on its own)
 *  mode 'add' → increases an existing batch (batchId, or the latest batch)
 * A negative amount with mode 'add' is a correction (never below zero).
 * Returns { capitalBatches, capital, batch } to save on the investor.
 */
function applyCapitalChange(investor, { mode = 'new', amount, label, batchId, note, user } = {}) {
  const value = Number(amount);
  if (!Number.isFinite(value) || value === 0) {
    const err = new Error('مبلغ رأس المال يجب أن يكون رقماً غير صفري'); err.status = 400; throw err;
  }
  // Materialize the legacy single number as a real batch the first time batches are used
  const batches = getCapitalBatches(investor).map(b => ({ ...b, history: Array.isArray(b.history) ? [...b.history] : [] }));
  let batch;
  if (mode === 'add' && batches.length > 0) {
    batch = batchId ? batches.find(b => String(b.id) === String(batchId)) : batches[batches.length - 1];
    if (!batch) { const err = new Error('دفعة رأس المال المختارة غير موجودة'); err.status = 400; throw err; }
    const next = round2((Number(batch.amount) || 0) + value);
    if (next < 0) { const err = new Error('لا يمكن أن يصبح رأس مال الدفعة أقل من صفر'); err.status = 400; throw err; }
    batch.amount = next;
    batch.history.push({ at: new Date().toISOString(), change: round2(value), by: user ? user.name : 'النظام', note: note || (value > 0 ? 'زيادة على الدفعة' : 'تصحيح بالنقص') });
  } else {
    if (value < 0) { const err = new Error('الدفعة الجديدة يجب أن تكون بمبلغ موجب'); err.status = 400; throw err; }
    batch = newCapitalBatch(value, label || `دفعة رأس مال رقم ${batches.length + 1}`, user, note);
    batches.push(batch);
  }
  const capital = round2(batches.reduce((s, b) => s + (Number(b.amount) || 0), 0));
  return { capitalBatches: batches, capital, batch };
}

function validateSharePercent(v) {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0 || n > 100) return 'نسبة المستثمر من الربح يجب أن تكون رقماً بين 0 و 100';
  return null;
}

const emptyBatchStats = () => ({ units: 0, cost: 0, sales: 0, investorProfit: 0, discountShare: 0, ownerDue: 0 });

function itemIsInvestors(i, inv) {
  if (i.ownerType !== 'investor' || !inv) return false;
  if (i.investorId && inv.id && String(i.investorId) === String(inv.id)) return true;
  return Boolean(i.investorCode && inv.code && String(i.investorCode).trim().toUpperCase() === String(inv.code).trim().toUpperCase());
}

/**
 * Everything about one investor from delivered orders:
 * totals, per-product figures, capital batches (recovered at cost), expense share and dues.
 * `orders` = delivered orders to include (already filtered by period if needed).
 */
function investorFigures(inv, orders, ctx, expenses = []) {
  const perProduct = new Map();
  const t = { units: 0, sales: 0, cost: 0, investorProfit: 0, storeProfit: 0, ownerDue: 0, costMissing: 0,
    discountsOnProducts: 0, discountShare: 0, couponShare: 0, loyaltyShare: 0, profitBeforeDiscounts: 0 };
  const perBatch = new Map();
  const orderRows = [];
  orders.forEach(o => {
    const mine = orderEconomics(o, ctx).items.filter(i => itemIsInvestors(i, inv));
    if (mine.length) {
      const sum = f => round2(mine.reduce((s, i) => s + f(i), 0));
      orderRows.push({
        orderId: o.id, orderNumber: o.orderNumber, date: o.createdAt, deliveredAt: deliveredDate(o),
        units: sum(i => i.qty), sales: sum(i => i.sales), cost: sum(i => i.cost),
        discountShare: sum(i => i.investorDiscountShare), investorProfit: sum(i => i.investorProfit), ownerDue: sum(i => i.ownerDue)
      });
    }
    mine.forEach(i => {
      t.units += i.qty; t.sales += i.sales; t.cost += i.cost; t.investorProfit += i.investorProfit;
      t.storeProfit += i.storeProfit; t.ownerDue += i.ownerDue; if (i.costMissing) t.costMissing++;
      t.discountsOnProducts += i.discount;
      t.discountShare += i.investorDiscountShare;
      if (i.discount > 0) {
        t.couponShare += i.investorDiscountShare * (i.couponDiscount / i.discount);
        t.loyaltyShare += i.investorDiscountShare * (i.loyaltyDiscount / i.discount);
      }
      t.profitBeforeDiscounts += i.investorProfit + i.investorDiscountShare;
      const p = perProduct.get(i.productId) || { units: 0, sales: 0, cost: 0, investorProfit: 0, discount: 0 };
      p.units += i.qty; p.sales += i.sales; p.cost += i.cost; p.investorProfit += i.investorProfit; p.discount += i.discount;
      perProduct.set(i.productId, p);
      const bKey = i.capitalBatchId || '__none__';
      const b = perBatch.get(bKey) || emptyBatchStats();
      b.units += i.qty; b.cost += i.cost; b.sales += i.sales; b.investorProfit += i.investorProfit;
      b.discountShare += i.investorDiscountShare; b.ownerDue += i.ownerDue;
      perBatch.set(bKey, b);
    });
  });
  // Expenses: those tagged to a capital batch go to that batch; the rest are "general" for this investor
  let expenseShare = 0, revenueShare = 0;
  const batchExpense = new Map(); // batchId → signed investor share
  let generalExpenseSigned = 0;
  expenses.forEach(e => {
    const matches = (e.investorId && String(e.investorId) === String(inv.id)) ||
      (!e.investorId && !e.merchantId && e.investorCode && inv.code && String(e.investorCode).toUpperCase() === String(inv.code).toUpperCase());
    if (!matches) return;
    const v = expenseSplit(e).investor;
    if (v < 0) expenseShare += -v; else revenueShare += v;
    if (e.capitalBatchId) batchExpense.set(String(e.capitalBatchId), (batchExpense.get(String(e.capitalBatchId)) || 0) + v);
    else generalExpenseSigned += v;
  });
  const batches = getCapitalBatches(inv);
  const batchRows = batches.map(b => {
    const own = perBatch.get(String(b.id)) || emptyBatchStats();
    // Products uploaded before batches existed belong to the legacy batch (or to the only batch)
    const legacy = (b.id === 'legacy' || batches.length === 1) ? (perBatch.get('__none__') || emptyBatchStats()) : emptyBatchStats();
    const add = k => own[k] + legacy[k];
    const cost = add('cost');
    const amount = Number(b.amount) || 0;
    const expSigned = batchExpense.get(String(b.id)) || 0;
    return {
      id: b.id, label: b.label, amount: round2(amount), createdAt: b.createdAt || null,
      unitsSold: add('units'), costRecovered: round2(cost), sales: round2(add('sales')),
      // Same rules as the whole account, per batch
      investorProfitBeforeDiscounts: round2(add('investorProfit') + add('discountShare')),
      discountShare: round2(add('discountShare')),
      investorProfit: round2(add('investorProfit')),
      expenseShare: round2(Math.max(0, -expSigned)),
      revenueShare: round2(Math.max(0, expSigned)),
      netProfit: round2(add('investorProfit') + expSigned),
      dues: round2(add('ownerDue') + expSigned),
      capitalStillInGoods: round2(Math.max(0, amount - cost)),
      recoveryPercent: amount > 0 ? Math.min(100, Math.round((cost / amount) * 100)) : 0,
      history: Array.isArray(b.history) ? b.history : []
    };
  });
  const capital = totalCapital(inv);
  return {
    units: t.units,
    sales: round2(t.sales),
    cost: round2(t.cost),
    grossProfit: round2(t.sales - t.cost),
    investorProfit: round2(t.investorProfit),
    // His profit before his part of the discounts, and the discounts he carried (coupon / loyalty)
    investorProfitBeforeDiscounts: round2(t.profitBeforeDiscounts),
    discountsOnProducts: round2(t.discountsOnProducts),
    discountShare: round2(t.discountShare),
    couponShare: round2(t.couponShare),
    loyaltyShare: round2(t.loyaltyShare),
    orders: orderRows,
    storeProfit: round2(t.storeProfit),
    expenseShare: round2(expenseShare),
    revenueShare: round2(revenueShare),
    netProfit: round2(t.investorProfit - expenseShare + revenueShare),
    dues: round2(t.ownerDue - expenseShare + revenueShare),
    costMissing: t.costMissing,
    capital,
    capitalRecoveryPercent: capital > 0 ? Math.min(100, Math.round((t.cost / capital) * 100)) : 0,
    batches: batchRows,
    // Expenses on this investor that are not tied to one batch (shown apart from the batches)
    generalExpenseSigned: round2(generalExpenseSigned),
    // Sales of products with a batch id that no longer exists (should be 0)
    unassignedBatchSales: round2([...perBatch.entries()].filter(([k]) => k !== '__none__' && !batches.some(b => String(b.id) === k)).reduce((s, [, v]) => s + v.sales, 0)),
    perProduct
  };
}

module.exports = {
  newCapitalBatch,
  applyCapitalChange,
  validateSharePercent,
  itemIsInvestors,
  investorFigures,
  round2,
  DEFAULT_INVESTOR_SHARE,
  productCost,
  itemOwnerType,
  investorSharePercent,
  itemEconomics,
  orderEconomics,
  deliveredDate,
  expenseSplit,
  loadContext,
  getCapitalBatches,
  totalCapital
};
