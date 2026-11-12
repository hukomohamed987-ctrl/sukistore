const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const db = require('../database/db');
const { authenticate, requirePermission, isSuperAdmin } = require('../middleware/auth');
const { logActivity } = require('../utils/activityLogger');
const { getInvestorProducts, matchOrderItemToInvestor } = require('../utils/ownershipHelper');
const { cairoMonth } = require('../utils/ledger');
const { loadContext, investorFigures, investorSharePercent, getCapitalBatches, totalCapital, newCapitalBatch, applyCapitalChange, validateSharePercent, orderEconomics, deliveredDate, itemIsInvestors } = require('../utils/financeEngine');

// Helper to normalize Arabic
function normalizeArabic(text) {
  if (!text) return '';
  return String(text)
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .trim();
}

// Helper to generate unique Investor Code like INV-101 without colliding with historical order/product codes
async function generateUniqueInvestorCode() {
  const usedCodes = new Set();
  const [allInvestors, allOrders, allProducts] = await Promise.all([
    db.investors.getAll(),
    db.orders.getAll(),
    db.products.getAll()
  ]);

  allInvestors.forEach(i => { if (i.code) usedCodes.add(i.code.trim().toUpperCase()); });
  allProducts.forEach(p => { if (p.investorCode) usedCodes.add(p.investorCode.trim().toUpperCase()); });
  allOrders.forEach(o => {
    (o.items || []).forEach(it => {
      if (it.investorCode) usedCodes.add(it.investorCode.trim().toUpperCase());
    });
  });

  let counter = 101;
  let code = '';
  while (counter < 100000) {
    code = `INV-${counter}`;
    if (!usedCodes.has(code)) {
      return code;
    }
    counter++;
  }
  return `INV-${Date.now().toString().slice(-5)}`;
}

// ----------------------------------------------------
// 1. GET ALL INVESTORS
// ----------------------------------------------------
// SECURITY: investor accounts are read-only; they must never create or edit investor records
function blockInvestorRole(req, res, next) {
  if (req.user && (req.user.role === 'investor' || req.user.role === 'merchant' || req.user.role === 'customer')) {
    return res.status(403).json({ success: false, message: 'غير مصرح لهذا الحساب بإدارة المستثمرين' });
  }
  next();
}

router.get('/', authenticate, requirePermission('canManageInvestors'), async (req, res) => {
  try {
    const { search } = req.query;
    const isSuper = isSuperAdmin(req.user);
    const isInvestor = req.user.role === 'investor';

    let investors = await db.investors.getAll();
    const allProducts = await db.products.getAll();
    const allOrders = await db.orders.getAll();
    const allUsers = await db.users.getAll();
    const allExpenses = await db.expenses.getAll();
    const allProductMap = new Map(allProducts.map(p => [String(p.id), p]));
    const ctx = await loadContext();
    const deliveredAll = allOrders.filter(o => o.status === 'delivered');

    // If caller is an investor, only show their own record
    if (isInvestor) {
      investors = investors.filter(i => 
        (req.user.investorId && String(i.id) === String(req.user.investorId)) ||
        (req.user.investorCode && i.code && i.code.trim().toUpperCase() === req.user.investorCode.trim().toUpperCase())
      );
    }

    let enriched = investors.map(inv => {
      // Products funded strictly by this investor
      const invProducts = getInvestorProducts(allProducts, inv);
      const invProductMap = new Map(invProducts.map(ip => [String(ip.id), ip]));

      // User account linked to investor
      const invUser = allUsers.find(u => 
        (u.investorId && String(u.investorId) === String(inv.id)) ||
        (!u.investorId && u.investorCode && inv.code && u.investorCode.trim().toUpperCase() === inv.code.trim().toUpperCase())
      );

      // Money figures from the shared finance engine (cost + profit share model)
      const f = investorFigures(inv, deliveredAll, ctx, allExpenses);
      const totalUnitsSold = f.units;
      const totalSales = f.sales;
      const capital = f.capital;

      // Base public object for staff
      const result = {
        id: inv.id,
        code: inv.code,
        name: inv.name,
        username: invUser?.username || inv.username || '',
        phone: inv.phone || invUser?.phone || '',
        whatsapp: inv.whatsapp || invUser?.whatsappPhone || inv.phone || '',
        productsCount: invProducts.length,
        totalUnitsSold,
        totalSales: Math.round(totalSales * 100) / 100,
        isActive: inv.isActive !== false,
        createdAt: inv.createdAt
      };

      // PRIVACY SHIELD: Capital & Cost & Profit are visible ONLY to Super Admin and the Investor themselves
      if (isSuper || isInvestor) {
        result.capital = capital;
        result.capitalBatches = f.batches;
        result.profitSharePercent = investorSharePercent({}, inv, ctx.settings);
        result.totalCostOfSold = f.cost;
        result.grossProfit = f.grossProfit;
        result.investorProfit = f.investorProfit;
        result.totalExpenses = f.expenseShare;
        result.netProfit = f.netProfit;
        result.investorDues = f.dues;
        result.capitalRecoveryPercent = f.capitalRecoveryPercent;
        result.hasUserAccount = Boolean(invUser);
        result.notes = inv.notes || '';
        if (isSuper) result.storeProfit = f.storeProfit;
      }

      return result;
    });

    if (search && search.trim()) {
      const q = normalizeArabic(search.trim());
      enriched = enriched.filter(i => 
        normalizeArabic(i.name || '').includes(q) ||
        normalizeArabic(i.code || '').includes(q) ||
        normalizeArabic(i.username || '').includes(q) ||
        (i.phone && i.phone.includes(q))
      );
    }

    res.json({
      success: true,
      count: enriched.length,
      isSuper,
      investors: enriched
    });
  } catch (err) {
    console.error('Fetch investors error:', err);
    res.status(500).json({ success: false, message: 'فشل جلب قائمة المستثمرين' });
  }
});

// ----------------------------------------------------
// 2. GET SINGLE INVESTOR DETAILS (SUPER ADMIN OR INVESTOR)
// ----------------------------------------------------
router.get('/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { month } = req.query; // e.g. '2026-11' or undefined for all
    const isSuper = isSuperAdmin(req.user);

    let investor = null;
    if (id === 'me' || req.user.role === 'investor') {
      if (req.user.investorId) {
        investor = await db.investors.getById(req.user.investorId);
      }
      if (!investor && req.user.investorCode) {
        investor = await db.investors.findOne(i => i.code && i.code.toUpperCase() === req.user.investorCode.toUpperCase());
      }
      if (!investor) {
        investor = await db.investors.findOne(i => i.userId && i.userId === req.user.id);
      }
    }

    if (!investor) {
      investor = await db.investors.getById(id) || 
                 await db.investors.findOne(i => i.code && i.code.toUpperCase() === id.toUpperCase()) ||
                 await db.investors.findOne(i => i.userId && i.userId === id);
    }

    if (!investor) {
      return res.status(404).json({ success: false, message: 'المستثمر غير موجود' });
    }

    const isInvestor = req.user.role === 'investor' && (
      (req.user.investorId && String(req.user.investorId) === String(investor.id)) ||
      (req.user.investorCode && investor.code && req.user.investorCode.toUpperCase() === investor.code.toUpperCase()) ||
      (req.user.id && investor.userId && String(req.user.id) === String(investor.userId))
    );

    // Permission Check: If not Super Admin and not this investor, check staff permission
    const isStaff = !isSuper && !isInvestor;
    if (isStaff) {
      if (!req.user.permissions?.canManageInvestors && !req.user.permissions?.canManageProducts && !req.user.permissions?.canManageOrders) {
        return res.status(403).json({ success: false, message: 'ليس لديك صلاحية لعرض هذا المستثمر' });
      }
    }

    const allProducts = await db.products.getAll();
    const allOrders = await db.orders.getAll();

    // Linked products (strictly investor-owned only)
    const linkedProducts = getInvestorProducts(allProducts, investor);

    // Filter orders by month if requested (by DELIVERY date, same as the accounting section)
    const allDelivered = allOrders.filter(o => o.status === 'delivered');
    let deliveredOrders = allDelivered;
    if (month && month !== 'all') {
      deliveredOrders = allDelivered.filter(o => cairoMonth(deliveredDate(o)) === month);
    }

    // Money figures from the shared finance engine (cost + profit share model)
    const ctx = await loadContext();
    const allExpenses = await db.expenses.getAll();
    const monthExpenses = month && month !== 'all'
      ? allExpenses.filter(e => cairoMonth(e.date || e.createdAt) === month)
      : allExpenses;
    const f = investorFigures(investor, deliveredOrders, ctx, monthExpenses);
    // Paid / remaining are ALWAYS lifetime figures (a month view must not hide older balances)
    const lifeF = (month && month !== 'all') ? investorFigures(investor, allDelivered, ctx, allExpenses) : f;
    const allAccounting = await db.accounting.getAll();
    const payouts = allAccounting.filter(p => p.type === 'investor_payout' && (
      (p.investorId && String(p.investorId) === String(investor.id)) ||
      (!p.investorId && p.investorCode && investor.code && String(p.investorCode).toUpperCase() === investor.code.toUpperCase())
    )).map(p => ({
      id: p.id, amount: Math.round((Number(p.amount) || 0) * 100) / 100, date: p.date || p.createdAt,
      paymentMethod: p.paymentMethod || 'تحويل', reference: p.referenceNumber || p.reference || '-', notes: p.notes || p.description || ''
    })).sort((a, b) => new Date(b.date) - new Date(a.date));
    const totalPaid = Math.round(payouts.reduce((s, p) => s + p.amount, 0) * 100) / 100;

    // His orders (every status), only his lines — view only, no customer data
    const STATUS_AR = { pending: 'اتعمل (قيد المراجعة)', processing: 'قيد التجهيز', shipped: 'في الطريق للعميل', delivered: 'اتسلّم للعميل', cancelled: 'اتلغى' };
    const investorOrders = [];
    allOrders.forEach(o => {
      const lines = orderEconomics(o, ctx).items.filter(i => itemIsInvestors(i, investor));
      if (!lines.length) return;
      const raw = o.items || [];
      investorOrders.push({
        orderNumber: o.orderNumber,
        date: o.createdAt,
        deliveredAt: o.status === 'delivered' ? deliveredDate(o) : null,
        status: o.status || 'pending',
        statusLabel: STATUS_AR[o.status || 'pending'] || o.status,
        countsInAccount: o.status === 'delivered',
        items: lines.map(i => ({
          title: i.title,
          variantLabel: (raw.find(r => String(r.productId || r.id || '') === i.productId) || {}).variantLabel || '',
          quantity: i.qty, unitPrice: i.unitPrice, unitCost: i.unitCost,
          discount: i.discount, discountShare: i.investorDiscountShare, investorProfit: i.investorProfit
        })),
        sales: Math.round(lines.reduce((s, i) => s + i.sales, 0) * 100) / 100,
        investorProfit: Math.round(lines.reduce((s, i) => s + i.investorProfit, 0) * 100) / 100,
        discountShare: Math.round(lines.reduce((s, i) => s + i.investorDiscountShare, 0) * 100) / 100
      });
    });
    investorOrders.sort((a, b) => new Date(b.date) - new Date(a.date));
    const sharePercent = investorSharePercent({}, investor, ctx.settings);
    const totalUnitsSold = f.units;
    const totalSales = f.sales;
    const capital = f.capital;

    const enrichedProducts = linkedProducts.map(prod => {
      const costPrice = Number(prod.costPrice !== undefined ? prod.costPrice : (prod.basePrice || prod.merchantPrice || 0));
      const salePrice = Number(prod.price) || 0;
      const pf = f.perProduct.get(String(prod.id)) || { units: 0, sales: 0, cost: 0, investorProfit: 0, discount: 0 };
      const pData = {
        id: prod.id,
        title: prod.title,
        image: Array.isArray(prod.images) && prod.images.length > 0 ? prod.images[0] : (prod.image || ''),
        category: prod.category || '',
        stock: prod.stock || 0,
        price: salePrice,
        compareAtPrice: prod.compareAtPrice ? Number(prod.compareAtPrice) : null,
        capitalBatchId: prod.capitalBatchId || null,
        unitsSold: pf.units,
        totalSales: Math.round(pf.sales * 100) / 100
      };
      // PRIVACY SHIELD: cost and profit ONLY for Super Admin and the Investor
      if (isSuper || isInvestor) {
        pData.costPrice = costPrice;
        pData.totalCost = Math.round(pf.cost * 100) / 100;
        pData.profit = Math.round(pf.investorProfit * 100) / 100; // the investor's share of the profit
        pData.marginPercent = salePrice > 0 ? Math.round(((salePrice - costPrice) / salePrice) * 100) : 0;
        // What customers really paid per unit after coupons / loyalty
        pData.avgSoldPriceAfterDiscounts = pf.units > 0 ? Math.round(((pf.sales - pf.discount) / pf.units) * 100) / 100 : null;
      }
      return pData;
    });

    const investorExpenses = allExpenses.filter(e => {
      if (e.investorId) return String(e.investorId) === String(investor.id);
      return !e.merchantId && e.investorCode && investor.code && e.investorCode.toUpperCase() === investor.code.toUpperCase();
    }).map(e => {
      const amt = Number(e.amount) || 0;
      const pct = (e.investorSharePercent !== undefined && e.investorSharePercent !== null ? Number(e.investorSharePercent) : 50);
      return {
        id: e.id, title: e.title, type: e.type, amount: amt, sharePercent: pct,
        investorShare: Math.round(amt * (pct / 100) * 100) / 100,
        category: e.category || 'عام', date: e.date || e.createdAt, notes: e.notes || ''
      };
    });

    const responseData = {
      success: true,
      investor: {
        id: investor.id,
        code: investor.code,
        name: investor.name,
        username: investor.username,
        phone: investor.phone,
        whatsapp: investor.whatsapp || investor.phone,
        address: investor.address || '',
        notes: investor.notes || '',
        createdAt: investor.createdAt
      },
      products: enrichedProducts,
      expenses: investorExpenses.sort((a, b) => new Date(b.date) - new Date(a.date)),
      stats: {
        productsCount: linkedProducts.length,
        totalUnitsSold,
        totalSales: Math.round(totalSales * 100) / 100
      },
      selectedMonth: month || 'all',
      isSuper
    };

    // Include capital, cost, and profit ONLY for Super Admin and the Investor
    if (isSuper || isInvestor) {
      responseData.investor.capital = capital;
      responseData.investor.profitSharePercent = sharePercent;
      responseData.investor.notes = investor.notes || '';
      responseData.capitalBatches = f.batches;
      responseData.stats.capital = capital;
      responseData.stats.profitSharePercent = sharePercent;
      responseData.stats.totalCostOfSold = f.cost;
      responseData.stats.grossProfit = f.grossProfit;
      responseData.stats.investorProfit = f.investorProfit;
      responseData.stats.totalExpenses = f.expenseShare;
      responseData.stats.totalRevenues = f.revenueShare;
      responseData.stats.netProfit = f.netProfit;
      responseData.stats.investorDues = f.dues;
      responseData.stats.capitalRecoveryPercent = f.capitalRecoveryPercent;
      // Discounts / coupons / loyalty taken from his share (new orders), and the profit before them
      responseData.stats.investorProfitBeforeDiscounts = f.investorProfitBeforeDiscounts;
      responseData.stats.discountsOnProducts = f.discountsOnProducts;
      responseData.stats.discountShare = f.discountShare;
      responseData.stats.couponShare = f.couponShare;
      responseData.stats.loyaltyShare = f.loyaltyShare;
      // Lifetime account (independent of the month filter)
      responseData.account = {
        lifetimeDues: lifeF.dues,
        totalPaid,
        // Positive = still owed to the investor; negative = paid more than earned so far
        remaining: Math.round((lifeF.dues - totalPaid) * 100) / 100
      };
      responseData.payouts = payouts;
      responseData.orders = investorOrders;
      // Expenses on him not tied to one batch (positive number = cost carried)
      responseData.generalExpenseShare = Math.max(0, -f.generalExpenseSigned);
      if (isSuper) responseData.stats.storeProfit = f.storeProfit;
    }

    res.json(responseData);
  } catch (err) {
    console.error('Fetch investor detail error:', err);
    res.status(500).json({ success: false, message: 'فشل جلب تفاصيل المستثمر' });
  }
});

// ----------------------------------------------------
// 3. CREATE NEW INVESTOR (SUPER ADMIN ONLY OR PERMITTED STAFF)
// ----------------------------------------------------
router.post('/', authenticate, blockInvestorRole, requirePermission('canManageInvestors'), async (req, res) => {
  try {
    const { name, username, password, phone, whatsapp, capital, notes, customCode } = req.body;
    const isSuper = isSuperAdmin(req.user);

    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: 'اسم المستثمر مطلوب' });
    }

    const cleanUsername = (username || '').trim().toLowerCase();
    if (!cleanUsername) {
      return res.status(400).json({ success: false, message: 'اسم المستخدم لتسجيل الدخول مطلوب' });
    }

    // Check username uniqueness
    const existingUser = await db.users.findOne(u => u.username && u.username.toLowerCase() === cleanUsername);
    if (existingUser) {
      return res.status(400).json({ success: false, message: 'اسم المستخدم مسجل بالفعل لمستخدم آخر' });
    }

    const code = customCode && customCode.trim() 
      ? customCode.trim().toUpperCase() 
      : await generateUniqueInvestorCode();

    const existingCode = await db.investors.findOne(i => i.code && i.code.toUpperCase() === code);
    if (existingCode) {
      return res.status(400).json({ success: false, message: `كود المستثمر ${code} مسجل بالفعل` });
    }

    // Capital can ONLY be set by Super Admin (Mohamed Hakim & Ahmed Gharib)
    const initialCapital = isSuper ? Math.max(0, Number(capital) || 0) : 0;
    // SECURITY: no shared default password; the admin must set one for the investor
    const rawPassword = String(password || '').trim();
    if (rawPassword.length < 8) {
      return res.status(400).json({ success: false, message: 'اكتب كلمة مرور لحساب المستثمر (8 أحرف على الأقل)' });
    }
    const hashedPassword = await bcrypt.hash(rawPassword, 10);
    const shareError = validateSharePercent(req.body.profitSharePercent);
    if (shareError) return res.status(400).json({ success: false, message: shareError });

    const investorId = uuidv4();
    const userId = uuidv4();

    // 1. Create linked User Account with role 'investor'
    await db.users.insert({
      id: userId,
      name: name.trim(),
      email: `${cleanUsername}@investor.suki.store`,
      username: cleanUsername,
      phone: (phone || '').trim(),
      whatsappPhone: (whatsapp || phone || '').trim(),
      password: hashedPassword,
      role: 'investor',
      investorId: investorId,
      investorCode: code,
      isActive: true,
      canEditProducts: false, // Investors are strictly read-only
      createdAt: new Date().toISOString()
    });

    // 2. Create Investor Entity
    const newInvestor = await db.investors.insert({
      id: investorId,
      userId: userId,
      code: code,
      name: name.trim(),
      username: cleanUsername,
      phone: (phone || '').trim(),
      whatsapp: (whatsapp || phone || '').trim(),
      capital: initialCapital,
      capitalBatches: initialCapital > 0 ? [newCapitalBatch(initialCapital, 'رأس المال الأول', req.user, 'إنشاء حساب المستثمر')] : [],
      ...(isSuper && req.body.profitSharePercent !== undefined && req.body.profitSharePercent !== ''
        ? { profitSharePercent: Number(req.body.profitSharePercent) } : {}),
      notes: (notes || '').trim(),
      isActive: true,
      createdAt: new Date().toISOString()
    });

    logActivity({
      req,
      action: 'CREATE_INVESTOR',
      target: code,
      details: `تم إنشاء حساب مستثمر جديد: ${name.trim()} (${code}) برأس مال ${initialCapital} ج.م`
    }).catch(() => {});

    res.status(201).json({
      success: true,
      message: `تم إنشاء حساب المستثمر "${name.trim()}" بنجاح (${code})`,
      investor: newInvestor
    });
  } catch (err) {
    console.error('Create investor error:', err);
    res.status(500).json({ success: false, message: 'فشل إنشاء حساب المستثمر' });
  }
});

// ----------------------------------------------------
// 4. UPDATE INVESTOR
// ----------------------------------------------------
router.put('/:id', authenticate, blockInvestorRole, requirePermission('canManageInvestors'), async (req, res) => {
  try {
    const { id } = req.params;
    const { name, phone, whatsapp, capital, notes, password, isActive } = req.body;
    const isSuper = isSuperAdmin(req.user);

    const investor = await db.investors.getById(id);
    if (!investor) {
      return res.status(404).json({ success: false, message: 'المستثمر غير موجود' });
    }

    const updates = {};
    if (name) updates.name = name.trim();
    if (phone !== undefined) updates.phone = phone.trim();
    if (whatsapp !== undefined) updates.whatsapp = whatsapp.trim();
    if (notes !== undefined) updates.notes = notes.trim();
    if (isActive !== undefined) updates.isActive = Boolean(isActive);

    // Capital can ONLY be changed by Super Admin. Once batches exist, use the capital endpoint
    // (new batch / add to batch) so history is never overwritten.
    if (isSuper && capital !== undefined && capital !== '') {
      const newCap = Math.max(0, Number(capital) || 0);
      const hasBatches = Array.isArray(investor.capitalBatches) && investor.capitalBatches.length > 0;
      if (hasBatches && Math.abs(newCap - totalCapital(investor)) > 0.01) {
        return res.status(400).json({
          success: false,
          message: 'رأس مال هذا المستثمر مقسم على دفعات. استخدم "إضافة رأس مال" (دفعة جديدة أو زيادة دفعة) بدل تعديل الرقم مباشرة.'
        });
      }
      if (!hasBatches) updates.capital = newCap;
    }
    // Investor's share of the profit (%), super admin only
    if (req.body.profitSharePercent !== undefined) {
      if (!isSuper) return res.status(403).json({ success: false, message: 'تعديل نسبة الربح متاح للمدير العام فقط' });
      if (req.body.profitSharePercent === '' || req.body.profitSharePercent === null) {
        updates.profitSharePercent = null; // fall back to the store default
      } else {
        const shareError = validateSharePercent(req.body.profitSharePercent);
        if (shareError) return res.status(400).json({ success: false, message: shareError });
        updates.profitSharePercent = Number(req.body.profitSharePercent);
      }
    }

    await db.investors.update(id, updates);

    // Update linked user account if exists
    if (investor.userId) {
      const userUpdates = {};
      if (name) userUpdates.name = name.trim();
      if (phone !== undefined) userUpdates.phone = phone.trim();
      if (whatsapp !== undefined) userUpdates.whatsappPhone = whatsapp.trim();
      if (isActive !== undefined) userUpdates.isActive = Boolean(isActive);
      if (password && password.trim()) {
        if (password.trim().length < 8) {
          return res.status(400).json({ success: false, message: 'كلمة المرور الجديدة يجب أن تكون 8 أحرف على الأقل' });
        }
        userUpdates.password = await bcrypt.hash(password.trim(), 10);
        userUpdates.plainPasswordBackup = undefined; // never keep a readable copy
        userUpdates.tokenVersion = ((await db.users.getById(investor.userId))?.tokenVersion || 1) + 1;
      }
      if (Object.keys(userUpdates).length > 0) {
        await db.users.update(investor.userId, userUpdates);
      }
    }

    logActivity({
      req,
      action: 'UPDATE_INVESTOR',
      target: investor.code,
      details: `تم تحديث بيانات المستثمر: ${investor.name} (${investor.code})`
    }).catch(() => {});

    res.json({
      success: true,
      message: 'تم تحديث بيانات المستثمر بنجاح',
      investor: { ...investor, ...updates }
    });
  } catch (err) {
    console.error('Update investor error:', err);
    res.status(500).json({ success: false, message: 'فشل تحديث بيانات المستثمر' });
  }
});

// ----------------------------------------------------
// 4.1 ADD CAPITAL (SUPER ADMIN ONLY): new separate batch, or add to an existing batch
// ----------------------------------------------------
router.post('/:id/capital', authenticate, async (req, res) => {
  try {
    if (!isSuperAdmin(req.user)) {
      return res.status(403).json({ success: false, message: 'إدارة رأس مال المستثمرين متاحة للمدير العام فقط' });
    }
    const investor = await db.investors.getById(req.params.id);
    if (!investor) {
      return res.status(404).json({ success: false, message: 'المستثمر غير موجود' });
    }
    const { mode, amount, label, batchId, note } = req.body;
    if (mode !== 'new' && mode !== 'add') {
      return res.status(400).json({ success: false, message: 'اختر: دفعة رأس مال جديدة منفصلة، أو إضافة على دفعة سابقة' });
    }
    const change = applyCapitalChange(investor, { mode, amount, label, batchId, note, user: req.user });
    await db.investors.update(investor.id, { capitalBatches: change.capitalBatches, capital: change.capital });

    logActivity({
      req,
      action: 'INVESTOR_CAPITAL_CHANGE',
      target: investor.code,
      details: `${mode === 'new' ? 'دفعة رأس مال جديدة' : 'تعديل دفعة رأس مال'} للمستثمر ${investor.name}: ${amount} ج.م (${change.batch.label}). الإجمالي الآن ${change.capital} ج.م`
    }).catch(() => {});

    res.json({
      success: true,
      message: mode === 'new'
        ? `تم تسجيل دفعة رأس مال جديدة منفصلة "${change.batch.label}" بمبلغ ${change.batch.amount} ج.م`
        : `تم تعديل الدفعة "${change.batch.label}" وأصبحت ${change.batch.amount} ج.م`,
      capital: change.capital,
      capitalBatches: change.capitalBatches,
      batch: change.batch
    });
  } catch (err) {
    if (err.status === 400) return res.status(400).json({ success: false, message: err.message });
    console.error('Investor capital error:', err);
    res.status(500).json({ success: false, message: 'فشل تسجيل رأس المال' });
  }
});

// ----------------------------------------------------
// 5. DELETE INVESTOR (SUPER ADMIN ONLY)
// ----------------------------------------------------
router.delete('/:id', authenticate, async (req, res) => {
  try {
    if (!isSuperAdmin(req.user)) {
      return res.status(403).json({ success: false, message: 'حذف المستثمرين متاح للمدير العام فقط (محمد حكيم وأحمد غريب)' });
    }

    const { id } = req.params;
    const investor = await db.investors.getById(id);
    if (!investor) {
      return res.status(404).json({ success: false, message: 'المستثمر غير موجود' });
    }

    // Unlink products from this investor
    const allProducts = await db.products.getAll();
    for (const p of allProducts) {
      if ((p.investorId && String(p.investorId) === String(id)) ||
          (p.investorCode && investor.code && p.investorCode.toUpperCase() === investor.code.toUpperCase())) {
        await db.products.update(p.id, {
          investorId: null,
          investorCode: null,
          investorName: null
        });
      }
    }

    // Delete linked user account
    if (investor.userId) {
      await db.users.delete(investor.userId);
    }

    // Delete investor record
    await db.investors.delete(id);

    logActivity({
      req,
      action: 'DELETE_INVESTOR',
      target: investor.code,
      details: `تم حذف المستثمر: ${investor.name} (${investor.code})`
    }).catch(() => {});

    res.json({
      success: true,
      message: `تم حذف المستثمر "${investor.name}" وفك ارتباط منتجاته بنجاح`
    });
  } catch (err) {
    console.error('Delete investor error:', err);
    res.status(500).json({ success: false, message: 'فشل حذف المستثمر' });
  }
});

module.exports = router;
