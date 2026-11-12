const express = require('express');
const router = express.Router();
const db = require('../database/db');
const { authenticate, requirePermission, isSuperAdmin, requireSuperAdmin } = require('../middleware/auth');
const { recordAuditLog } = require('../utils/security');
const { logActivity } = require('../utils/activityLogger');
const { isInvestorOwned, isMerchantOwned } = require('../utils/ownershipHelper');
const { productCost, investorSharePercent, orderEconomics, loadContext } = require('../utils/financeEngine');
// (productCost is also used by toMerchantOrder to show merchants their wholesale cost)
const { hasVariants, findVariant, variantLabel, stockChange, availableStock } = require('../utils/variants');
const { loyaltySettings, pointsForSubtotal } = require('../utils/loyalty');
const { closedMonthError, cairoDay } = require('../utils/ledger');

// Helper to generate unique order number like SUKI-83921
function generateOrderNumber() {
  const randomNum = Math.floor(10000 + Math.random() * 90000);
  return `SUKI-${randomNum}`;
}

// Order status Arabic labels & steps
const STATUS_STEPS = [
  { key: 'pending', label: 'تم استلام الطلب', desc: 'طلبك قيد المراجعة والتأكيد' },
  { key: 'processing', label: 'قيد التجهيز', desc: 'يتم تجهيز المنتجات وتغليفها' },
  { key: 'shipped', label: 'قيد الشحن', desc: 'تم تسليم الشحنة لمندوب التوصيل' },
  { key: 'delivered', label: 'تم التسليم بنجاح', desc: 'تم استلام الطلب' },
  { key: 'cancelled', label: 'ملغي', desc: 'تم إلغاء الطلب' }
];

// Build verified order lines from the database (prices, stock, options, owner snapshot).
// Returns { error } or { verifiedItems, subtotal }. Never trusts prices sent by the client.
async function buildOrderItems(items, destinationGov, settings, { skipGovCheck = false } = {}) {
  let subtotal = 0;
  const verifiedItems = [];
  for (const item of items) {
    const pId = item.productId || item.id;
    const product = await db.products.getById(pId);
    if (!product) return { error: 'المنتج غير متوفر' };

    if (!skipGovCheck && Array.isArray(product.allowedGovernorates) && product.allowedGovernorates.length > 0) {
      const isAllowed = product.allowedGovernorates.some(g => g.trim() === destinationGov || destinationGov.includes(g.trim()) || g.trim().includes(destinationGov));
      if (!isAllowed) return { error: `غير متاح التوصيل لهذه المنطقة (المنتج: "${product.title}")` };
    }

    const qty = Math.max(1, Math.floor(Number(item.quantity)) || 1);
    const variant = findVariant(product, item.selectedOptions);
    if (hasVariants(product) && !variant) return { error: `اختار المقاس/اللون المتاح للمنتج "${product.title}"` };

    const maxStock = availableStock(product, variant && variant.id);
    const alreadyTaken = verifiedItems
      .filter(v => String(v.productId) === String(product.id) && (v.variantId || null) === (variant ? variant.id : null))
      .reduce((s, v) => s + v.quantity, 0);
    if (alreadyTaken + qty > maxStock) {
      const what = variant ? `"${product.title}" (${variantLabel(variant)})` : `"${product.title}"`;
      return { error: `عفواً، الكمية المطلوبة للمنتج ${what} (${alreadyTaken + qty} قطعة) أكبر من المخزون المتوفر (${maxStock} قطعة). يُرجى تعديل الكمية في السلة.` };
    }

    const unitPrice = Number(variant && variant.price ? variant.price : product.price) || 0;
    const lineTotal = unitPrice * qty;
    subtotal += lineTotal;

    const isInvProd = isInvestorOwned(product);
    const isMerchProd = !isInvProd && isMerchantOwned(product);
    // Snapshot of the cost at the moment of sale (accounting never changes if the product is edited later)
    const snapCost = productCost(product);
    let investorShareSnapshot;
    if (isInvProd) {
      const inv = product.investorId ? await db.investors.getById(product.investorId) : null;
      investorShareSnapshot = investorSharePercent({}, inv, settings);
    }

    verifiedItems.push({
      productId: product.id,
      title: product.title,
      price: unitPrice,
      costPrice: snapCost !== null ? snapCost : undefined,
      ...(isInvProd ? { investorProfitSharePercent: investorShareSnapshot } : {}),
      ...(product.capitalBatchId ? { capitalBatchId: product.capitalBatchId } : {}),
      compareAtPrice: product.compareAtPrice,
      quantity: qty,
      image: Array.isArray(product.images) && product.images.length > 0 ? product.images[0] : '',
      saleUnit: product.saleUnit || 'قطعة',
      ownerType: isInvProd ? 'investor' : (isMerchProd ? 'merchant' : 'store'),
      merchantCode: isInvProd ? '' : (product.merchantCode || ''),
      merchantName: isInvProd ? '' : (product.merchantName || ''),
      merchantId: isInvProd ? null : (product.merchantId || null),
      investorCode: isInvProd ? (product.investorCode || '') : '',
      investorName: isInvProd ? (product.investorName || '') : '',
      investorId: isInvProd ? (product.investorId || null) : null,
      selectedOptions: variant ? { ...variant.options } : (item.selectedOptions || {}),
      ...(variant ? { variantId: variant.id, variantLabel: variantLabel(variant) } : {}),
      sku: (variant && variant.sku) || product.sku || '',
      lineTotal
    });
  }
  return { verifiedItems, subtotal };
}

// Shipping: first unit pays the highest base fee, each additional unit adds 15% of it
async function calcShippingFee(verifiedItems, destinationGov) {
  let nonFreeItems = [];
  let totalNonFreeUnits = 0;

  for (const item of verifiedItems) {
    const prod = await db.products.getById(item.productId);
    if (!prod || prod.isFreeShipping || prod.shippingCost === 0) {
      continue;
    }
    
    let baseFee = 35;
    if (prod.isLargeItem && prod.customShippingCost) {
      baseFee = Number(prod.customShippingCost);
    } else if (prod.governorateShipping && destinationGov && prod.governorateShipping[destinationGov] !== undefined) {
      baseFee = Number(prod.governorateShipping[destinationGov]);
    } else if (prod.shippingCost !== undefined && prod.shippingCost !== '') {
      baseFee = Number(prod.shippingCost);
    }

    nonFreeItems.push({ productId: prod.id, baseFee, quantity: item.quantity });
    totalNonFreeUnits += item.quantity;
  }

  let shippingFee = 0;
  if (nonFreeItems.length > 0) {
    // Find the highest base shipping item to act as the primary item
    const maxBaseFee = Math.max(...nonFreeItems.map(i => i.baseFee));
    const additionalUnits = Math.max(0, totalNonFreeUnits - 1);
    const additionalRate = 0.15; // 15% for each additional unit
    shippingFee = Math.round((maxBaseFee + (additionalUnits * maxBaseFee * additionalRate)) * 100) / 100;
  }
  return shippingFee;
}

// A problem the customer / employee should read (inside db.atomic it also cancels every write)
function fail(message, status = 400) {
  const err = new Error(message);
  err.status = status;
  err.expose = true;
  throw err;
}

// Inside db.atomic: check the stock AGAIN at the moment of taking it, then take it.
// (Between the first check and now another customer may have bought the last pieces.)
function takeStock(t, verifiedItems) {
  const need = new Map();
  for (const item of verifiedItems) {
    const key = `${item.productId}|${item.variantId || ''}`;
    const cur = need.get(key) || { item, qty: 0 };
    cur.qty += Number(item.quantity) || 0;
    need.set(key, cur);
  }
  for (const { item, qty } of need.values()) {
    const product = t.products.getById(item.productId);
    if (!product) fail(`المنتج "${item.title}" لم يعد متوفراً. احذفه من السلة وحاول تاني.`, 409);
    const have = availableStock(product, item.variantId);
    if (have < qty) {
      const what = item.variantLabel ? `"${product.title}" (${item.variantLabel})` : `"${product.title}"`;
      fail(`عفواً، المخزون اتغيّر وانت بتطلب: المتاح دلوقتي من ${what} ${have} قطعة بس. عدّل الكمية وحاول تاني.`, 409);
    }
  }
  for (const item of verifiedItems) {
    const product = t.products.getById(item.productId);
    const stockUpdates = { ...stockChange(product, item.variantId, -item.quantity), salesCount: (product.salesCount || 0) + item.quantity };
    if (stockUpdates.stock === 0 && product.isBestSeller) {
      stockUpdates.isBestSeller = false;
      stockUpdates.isBestSellerBackup = true;
    }
    t.products.update(product.id, stockUpdates);
  }
}

function uniqueOrderNumber(t) {
  let n = generateOrderNumber();
  for (let i = 0; i < 50 && t.orders.findOne(o => o.orderNumber === n); i++) n = generateOrderNumber();
  return n;
}

// Same order sent twice (double click / slow network) within 20 seconds → return the first one
function findDuplicateOrder(t, userId, verifiedItems, grandTotal) {
  if (!userId) return null;
  const sig = items => items.map(i => `${i.productId}|${i.variantId || ''}|${i.quantity}`).sort().join(',');
  const want = sig(verifiedItems);
  const since = Date.now() - 20 * 1000;
  return t.orders.findOne(o => String(o.userId) === String(userId) && !o.isManual &&
    new Date(o.createdAt).getTime() >= since && Number(o.grandTotal) === Number(grandTotal) &&
    sig(o.items || []) === want) || null;
}

// Create Order (Checkout)
// Public: which payment methods the checkout may show
router.get('/payment-options', async (req, res) => {
  try {
    const settings = (await db.settings.getAll())[0] || {};
    const { getGatewayStatus } = require('../utils/paymentGateway');
    const gw = getGatewayStatus();
    res.json({
      success: true,
      cod: true,
      card: { enabled: settings.cardPaymentEnabled === true, gatewayConnected: gw.connected }
    });
  } catch (err) {
    res.json({ success: true, cod: true, card: { enabled: false, gatewayConnected: false } });
  }
});

router.post('/', authenticate, async (req, res) => {
  try {
    const {
      items,
      shippingAddress,
      couponCode,
      useLoyaltyPoints,
      pointsToRedeem,
      notes
    } = req.body;

    // Payment method: cash always; card only when switched on in store settings.
    // Without a connected gateway a card order is recorded UNPAID (never "paid" for free).
    const wantsCard = req.body.paymentMethod === 'card_mock' || req.body.paymentMethod === 'card';
    const storeSettingsForPay = (await db.settings.getAll())[0] || {};
    if (wantsCard && storeSettingsForPay.cardPaymentEnabled !== true) {
      return res.status(400).json({ success: false, message: 'الدفع بالبطاقة غير متاح حالياً، يُرجى اختيار الدفع عند الاستلام' });
    }
    const paymentMethod = wantsCard ? 'card' : 'cod';
    const cardGateway = wantsCard ? require('../utils/paymentGateway').getGatewayStatus() : null;

    // Mutual exclusion: Cannot combine coupon and loyalty points in the same order
    if (couponCode && useLoyaltyPoints) {
      return res.status(400).json({
        success: false,
        message: 'ممنوع الجمع بين كود الخصم ونقاط الولاء في نفس الطلب. يُرجى استخدام أحدهما فقط.'
      });
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, message: 'السلة فارغة، لا يوجد منتجات للطلب' });
    }

    const shipAddr = shippingAddress || {
      fullName: req.body.customerName || req.user.name || 'عميل سوقي ستور',
      phone: req.body.customerPhone || req.user.phone || '',
      governorate: req.body.customerGovernorate || req.body.governorate || 'القاهرة',
      city: req.body.customerCity || req.body.city || req.body.customerGovernorate || 'القاهرة',
      addressLine: req.body.customerAddress || req.body.address || 'العنوان الرئيسي'
    };

    if (!shipAddr.fullName || !shipAddr.phone || (!shipAddr.city && !shipAddr.governorate)) {
      return res.status(400).json({
        success: false,
        message: 'بيانات العنوان غير مكتملة (الاسم الكامل، رقم الجوال، والمدينة/المحافظة مطلوبة)'
      });
    }

    // Destination governorate
    const destinationGov = (shipAddr.governorate || shipAddr.city || '').trim();

    // Verify stock and governorate eligibility securely from database
    const built = await buildOrderItems(items, destinationGov, storeSettingsForPay);
    if (built.error) return res.status(400).json({ success: false, message: built.error });
    let subtotal = built.subtotal;
    const verifiedItems = built.verifiedItems;
    // (Stock is decremented further below, only after coupon / loyalty checks pass)
    const shippingFee = await calcShippingFee(verifiedItems, destinationGov);

    // Coupon discount calculation (only read here; it is "used" inside the atomic block below)
    let discountAmount = 0;
    let appliedCoupon = null;
    let couponToUse = null;

    if (couponCode) {
      const cleanCode = String(couponCode).trim().toUpperCase();
      const coupon = await db.coupons.findOne(c => c.code && c.code.toUpperCase() === cleanCode && c.isActive);
      if (coupon) {
        // Check if targeted to specific user
        if (coupon.targetUserId && String(coupon.targetUserId) !== String(req.user.id)) {
          return res.status(403).json({ success: false, message: 'هذا الكوبون مخصص لحساب عميل آخر فقط' });
        }
        // SECURITY: same rules as /coupons/validate (the client can skip that call)
        if (coupon.expiresAt && new Date(coupon.expiresAt) < new Date()) {
          return res.status(400).json({ success: false, message: 'كود الخصم منتهي الصلاحية' });
        }
        if (coupon.maxUses && (coupon.usedCount || 0) >= coupon.maxUses) {
          return res.status(400).json({ success: false, message: 'تم استنفاد الحد الأقصى لاستخدام هذا الكوبون' });
        }

        if (!coupon.minOrderValue || subtotal >= coupon.minOrderValue) {
          if (coupon.discountType === 'percentage') {
            const pct = Math.min(100, Math.max(0, Number(coupon.discountValue) || 0));
            discountAmount = Math.round((subtotal * (pct / 100)) * 100) / 100;
            if (coupon.maxDiscountCap && discountAmount > coupon.maxDiscountCap) {
              discountAmount = coupon.maxDiscountCap;
            }
          } else {
            discountAmount = Math.max(0, Math.min(Number(coupon.discountValue) || 0, subtotal));
          }
          discountAmount = Math.min(discountAmount, subtotal);
          appliedCoupon = { code: coupon.code, discountAmount };
          couponToUse = coupon.id;
        }
      }
    }

    // Loyalty Points Redemption calculation
    let loyaltyDiscountAmount = 0;
    let loyaltyPointsUsed = 0;

    if (useLoyaltyPoints && !couponCode) {
      const settingsList = await db.settings.getAll();
      const settings = settingsList[0] || {};

      const ls = loyaltySettings(settings);
      if (ls.loyaltyEnabled) {
        const customer = await db.users.getById(req.user.id);
        const currentPoints = Number(customer?.loyaltyPoints) || 0;
        const minThreshold = ls.loyaltyMinRedemptionThreshold;
        const pointValueEgp = ls.loyaltyPointValueEgp;
        const maxPercent = ls.loyaltyMaxRedemptionPercent;

        if (currentPoints < minThreshold) {
          return res.status(400).json({
            success: false,
            message: `لا يمكن استخدام نقاط الولاء قبل تجميع ${minThreshold} نقطة كحد أدنى. رصيدك الحالي: ${currentPoints} نقطة.`
          });
        }

        // Maximum discount allowed is 10% of items subtotal
        const maxDiscountAllowed = Math.floor(subtotal * (maxPercent / 100));
        const maxPointsAllowed = Math.floor(maxDiscountAllowed / pointValueEgp);

        const requested = Number(pointsToRedeem) > 0 ? Number(pointsToRedeem) : currentPoints;
        loyaltyPointsUsed = Math.min(requested, currentPoints, maxPointsAllowed);
        loyaltyDiscountAmount = Math.round(loyaltyPointsUsed * pointValueEgp * 100) / 100;

        // Rule: Points cannot make the product 100% free
        if (subtotal - loyaltyDiscountAmount <= 0) {
          loyaltyDiscountAmount = Math.max(0, subtotal - 1);
          loyaltyPointsUsed = Math.floor(loyaltyDiscountAmount / pointValueEgp);
        }

        // (points are taken inside the atomic block below)
      }
    }

    const totalDiscount = discountAmount + loyaltyDiscountAmount;
    const grandTotal = Math.max(1, subtotal + shippingFee - totalDiscount);

    // ALL OR NOTHING: coupon use + points + stock + the order itself.
    // Everything is checked again here, because other orders may have changed it meanwhile.
    let duplicateOf = null;
    const newOrder = await db.atomic(t => {
      const dup = findDuplicateOrder(t, req.user.id, verifiedItems, grandTotal);
      if (dup) { duplicateOf = dup; return dup; }

      if (couponToUse) {
        const c = t.coupons.getById(couponToUse);
        if (!c || !c.isActive) fail('كود الخصم لم يعد متاحاً. شيله وحاول تاني.', 409);
        if (c.expiresAt && new Date(c.expiresAt) < new Date()) fail('كود الخصم منتهي الصلاحية', 409);
        if (c.maxUses && (Number(c.usedCount) || 0) >= Number(c.maxUses)) fail('تم استنفاد الحد الأقصى لاستخدام هذا الكوبون', 409);
        t.coupons.update(c.id, { usedCount: (Number(c.usedCount) || 0) + 1 });
      }
      if (loyaltyPointsUsed > 0) {
        const u = t.users.getById(req.user.id);
        const pts = Number(u && u.loyaltyPoints) || 0;
        if (!u || pts < loyaltyPointsUsed) fail('رصيد نقاطك اتغيّر. حدّث الصفحة وحاول تاني.', 409);
        t.users.update(u.id, { loyaltyPoints: pts - loyaltyPointsUsed });
      }
      takeStock(t, verifiedItems);

      return t.orders.insert({
      orderNumber: uniqueOrderNumber(t),
      userId: req.user.id,
      customerName: (shipAddr.fullName || req.user.name || '').trim(),
      customerEmail: req.user.email,
      customerPhone: (shipAddr.phone || req.user.phone || '').trim(),
      shippingAddress: {
        fullName: (shipAddr.fullName || req.user.name || '').trim(),
        phone: (shipAddr.phone || req.user.phone || '').trim(),
        governorate: destinationGov,
        city: (shipAddr.city || destinationGov).trim(),
        area: shipAddr.area ? shipAddr.area.trim() : '',
        street: shipAddr.street ? shipAddr.street.trim() : '',
        building: shipAddr.building ? shipAddr.building.trim() : '',
        notes: notes || shipAddr.notes || '',
        latitude: shipAddr.latitude || null,
        longitude: shipAddr.longitude || null
      },
      paymentMethod,
      // Never "paid" at creation: a connected gateway confirms payment later via its webhook
      paymentStatus: 'pending',
      ...(paymentMethod === 'card' && !(cardGateway && cardGateway.connected)
        ? { paymentNote: 'بانتظار إتمام الدفع بالبطاقة (لا توجد بوابة دفع مربوطة بعد، سيتم التواصل مع العميل)' }
        : {}),
      items: verifiedItems,
      subtotal,
      shippingFee,
      discountAmount,
      appliedCoupon,
      loyaltyPointsUsed,
      loyaltyDiscountAmount,
      grandTotal,
      // Investors carry their % of coupon / loyalty discounts on their products (see financeEngine)
      discountRule: 'shared',
      status: 'pending', // pending, processing, shipped, delivered, cancelled
      statusHistory: [
        {
          status: 'pending',
          label: 'تم استلام الطلب',
          note: 'تم إنشاء الطلب بنجاح وهو قيد المراجعة',
          timestamp: new Date().toISOString()
        }
      ]
      });
    });

    if (duplicateOf) {
      return res.status(200).json({ success: true, duplicate: true, message: 'الطلب ده اتسجّل بالفعل (اتبعت مرتين).', order: duplicateOf });
    }

    // Clear user cart
    const userCart = await db.carts.findOne(c => c.userId === req.user.id);
    if (userCart) {
      await db.carts.update(userCart.id, { items: [] });
    }

    // Auto-save address to customer profile if not already present
    try {
      const user = await db.users.getById(req.user.id);
      if (user) {
        const addresses = Array.isArray(user.addresses) ? user.addresses : [];
        const exists = addresses.some(a => 
          (a.governorate || '').trim() === destinationGov && 
          (a.street || '').trim() === (shipAddr.street || '').trim()
        );
        if (!exists) {
          const { v4: uuidv4 } = require('uuid');
          addresses.push({
            id: uuidv4(),
            label: 'عنوان التوصيل',
            recipientName: (shipAddr.fullName || req.user.name || '').trim(),
            phone: (shipAddr.phone || req.user.phone || '').trim(),
            governorate: destinationGov,
            city: (shipAddr.city || destinationGov).trim(),
            area: (shipAddr.area || '').trim(),
            street: (shipAddr.street || '').trim(),
            building: (shipAddr.building || '').trim(),
            notes: notes || shipAddr.notes || '',
            isDefault: addresses.length === 0
          });
          await db.users.update(user.id, { addresses });
        }
      }
    } catch (err) {
      console.warn('Failed to auto-save address to user profile:', err);
    }

    // Create notification for customer
    await db.notifications.insert({
      userId: req.user.id,
      orderId: newOrder.id,
      title: 'تم استلام طلبك بنجاح!',
      message: `تم تسجيل طلبك رقم #${newOrder.orderNumber} بقيمة ${newOrder.grandTotal} ج.م. سنوافيك بالتحديثات أولاً بأول.`,
      isRead: false
    });

    res.status(201).json({
      success: true,
      message: 'تم تأكيد طلبك بنجاح! شكراً لتسوقك من سوقي ستور.',
      order: newOrder
    });
  } catch (err) {
    if (err.expose) return res.status(err.status || 400).json({ success: false, message: err.message });
    console.error('Create order error:', err);
    res.status(500).json({ success: false, message: 'حدث خطأ أثناء إتمام الطلب، ولم يتم خصم أي شيء' });
  }
});

// Admin / staff: record an order that came by WhatsApp, phone or in the shop
router.post('/admin/manual', authenticate, requirePermission('canManageOrders'), async (req, res) => {
  try {
    if (req.user.role === 'merchant' || req.user.role === 'investor') {
      return res.status(403).json({ success: false, message: 'غير مصرح لك بإضافة طلبات' });
    }
    const { customer = {}, items, notes } = req.body;
    const SOURCES = { whatsapp: 'واتساب', phone: 'تليفون', store: 'من المحل', facebook: 'فيسبوك', other: 'أخرى' };
    const source = SOURCES[req.body.source] ? req.body.source : 'other';
    const name = String(customer.name || '').trim();
    const phone = String(customer.phone || '').trim();
    const governorate = String(customer.governorate || '').trim();
    if (!name || !phone || !governorate) {
      return res.status(400).json({ success: false, message: 'اسم العميل ورقم التليفون والمحافظة مطلوبين' });
    }
    if (!Array.isArray(items) || !items.length) {
      return res.status(400).json({ success: false, message: 'أضف منتج واحد على الأقل' });
    }
    const settings = (await db.settings.getAll())[0] || {};
    const built = await buildOrderItems(items, governorate, settings, { skipGovCheck: true });
    if (built.error) return res.status(400).json({ success: false, message: built.error });

    // Shipping: automatic unless the employee typed a number
    let shippingFee;
    if (req.body.shippingFee !== undefined && req.body.shippingFee !== null && String(req.body.shippingFee).trim() !== '') {
      shippingFee = Number(req.body.shippingFee);
      if (!Number.isFinite(shippingFee) || shippingFee < 0) return res.status(400).json({ success: false, message: 'مصاريف الشحن لازم تكون صفر أو أكثر' });
    } else {
      shippingFee = await calcShippingFee(built.verifiedItems, governorate);
    }
    let discountAmount = Number(req.body.discount) || 0;
    if (discountAmount < 0 || discountAmount > built.subtotal) {
      return res.status(400).json({ success: false, message: 'الخصم لازم يكون بين صفر وإجمالي المنتجات' });
    }

    // Link to an existing customer account with the same phone, if there is one
    const cleanPhone = phone.replace(/\D/g, '');
    const linkedUser = cleanPhone ? await db.users.findOne(u => u.role === 'customer' && String(u.phone || '').replace(/\D/g, '') === cleanPhone) : null;

    // ALL OR NOTHING: stock (checked again) + the order
    const order = await db.atomic(t => {
      takeStock(t, built.verifiedItems);
      return t.orders.insert({
      orderNumber: uniqueOrderNumber(t),
      userId: linkedUser ? linkedUser.id : null,
      customerName: name,
      customerEmail: linkedUser ? linkedUser.email : '',
      customerPhone: phone,
      shippingAddress: {
        fullName: name, phone, governorate,
        city: String(customer.city || governorate).trim(),
        area: String(customer.area || '').trim(),
        street: String(customer.address || customer.street || '').trim(),
        building: '', notes: String(notes || '').trim(), latitude: null, longitude: null
      },
      paymentMethod: 'cod',
      paymentStatus: 'pending',
      items: built.verifiedItems,
      subtotal: built.subtotal,
      shippingFee,
      discountAmount,
      appliedCoupon: null,
      loyaltyPointsUsed: 0,
      loyaltyDiscountAmount: 0,
      grandTotal: Math.max(0, built.subtotal + shippingFee - discountAmount),
      discountRule: 'shared',
      isManual: true,
      orderSource: source,
      orderSourceLabel: SOURCES[source],
      createdBy: req.user.name,
      status: 'pending',
      statusHistory: [{
        status: 'pending', label: 'تم استلام الطلب',
        note: `طلب يدوي (${SOURCES[source]}) سجّله ${req.user.name}`,
        byUser: req.user.name, timestamp: new Date().toISOString()
      }]
      });
    });

    if (linkedUser) {
      await db.notifications.insert({
        userId: linkedUser.id, orderId: order.id,
        title: 'تم تسجيل طلبك!',
        message: `سجّلنا طلبك رقم #${order.orderNumber} بقيمة ${order.grandTotal} ج.م. تقدر تتابعه من صفحة طلباتي.`,
        isRead: false
      });
    }
    await logActivity({
      userId: req.user.id, userName: req.user.name, userRole: req.user.role,
      action: 'CREATE_MANUAL_ORDER', module: 'orders',
      details: `أضاف طلب يدوي #${order.orderNumber} (${SOURCES[source]}) للعميل ${name} بقيمة ${order.grandTotal} ج.م`,
      metadata: { orderId: order.id }
    });
    res.status(201).json({ success: true, message: `تم تسجيل الطلب #${order.orderNumber}`, order });
  } catch (err) {
    if (err.expose) return res.status(err.status || 400).json({ success: false, message: err.message });
    console.error('Manual order error:', err);
    res.status(500).json({ success: false, message: 'فشل تسجيل الطلب' });
  }
});

// Customer: Get my orders
router.get('/my-orders', authenticate, async (req, res) => {
  try {
    const orders = await db.orders.find(o => String(o.userId) === String(req.user.id));
    orders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    res.json({ success: true, orders });
  } catch (err) {
    res.status(500).json({ success: false, message: 'فشل جلب طلباتك' });
  }
});

// Helper: Enrich order with Merchant and Investor owners details
function enrichOrderOwners(order, allProducts, allMerchants, allInvestors, isSuper) {
  const ownersMap = new Map();

  const enrichedItems = (order.items || []).map(it => {
    const prod = allProducts.find(p => String(p.id) === String(it.productId || it.id));
    const itemIsInv = prod ? isInvestorOwned(prod) : isInvestorOwned(it);

    const mCode = itemIsInv ? '' : (prod?.merchantCode || it.merchantCode || '').trim();
    const mName = itemIsInv ? '' : (prod?.merchantName || it.merchantName || '').trim();
    const invCode = itemIsInv ? (prod?.investorCode || it.investorCode || '').trim() : '';
    const invName = itemIsInv ? (prod?.investorName || it.investorName || '').trim() : '';

    if (!itemIsInv && mCode) {
      const key = `merchant_${mCode.toUpperCase()}`;
      if (!ownersMap.has(key)) {
        const mObj = allMerchants.find(m => m.code && m.code.toUpperCase() === mCode.toUpperCase());
        ownersMap.set(key, {
          type: 'merchant',
          code: mCode.toUpperCase(),
          name: mName || mObj?.name || mCode,
          phone: mObj?.phone || '',
          whatsapp: mObj?.whatsapp || mObj?.phone || '',
          address: mObj?.address || '',
          notes: mObj?.notes || ''
        });
      }
    }

    if (itemIsInv && invCode) {
      const key = `investor_${invCode.toUpperCase()}`;
      if (!ownersMap.has(key)) {
        const invObj = allInvestors.find(i =>
          (it.investorId && String(i.id) === String(it.investorId)) ||
          (prod?.investorId && String(i.id) === String(prod.investorId)) ||
          (i.code && i.code.toUpperCase() === invCode.toUpperCase())
        );
        const invData = {
          type: 'investor',
          code: invCode.toUpperCase(),
          name: invName || invObj?.name || invCode,
          phone: invObj?.phone || '',
          whatsapp: invObj?.whatsapp || invObj?.phone || '',
          address: invObj?.address || '',
          notes: invObj?.notes || ''
        };
        if (isSuper && invObj?.capital) {
          invData.capital = invObj.capital;
        }
        ownersMap.set(key, invData);
      }
    }

    return {
      ...it,
      ownerType: itemIsInv ? 'investor' : (mCode ? 'merchant' : (it.ownerType || 'store')),
      merchantCode: mCode,
      merchantName: mName,
      merchantId: itemIsInv ? null : (prod?.merchantId || it.merchantId || null),
      investorCode: invCode,
      investorName: invName
    };
  });

  return {
    ...order,
    items: enrichedItems,
    owners: Array.from(ownersMap.values())
  };
}

// What a merchant may see of an order: only HIS lines at wholesale cost + the status.
// No customer data, selling prices, totals, coupons, discounts or shipping.
const MERCHANT_RETURN_AR = { pending_review: 'طلب استبدال تحت المراجعة', accepted: 'استبدال مقبول', courier_dispatched: 'المندوب رايح يستلم القطعة', received: 'القطعة رجعت المخزن', replaced: 'تم الاستبدال', rejected: 'طلب الاستبدال اترفض' };
function toMerchantOrder(order, allProducts, returns = []) {
  const items = (order.items || []).map(it => {
    const prod = allProducts.find(p => String(p.id) === String(it.productId || it.id));
    const unitCost = it.costPrice !== undefined && it.costPrice !== null ? Number(it.costPrice) : (productCost(prod) ?? 0);
    const qty = Number(it.quantity) || 1;
    const ret = returns.filter(r => String(r.orderId) === String(order.id) && String(r.productId) === String(it.productId))
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
    return {
      productId: it.productId,
      title: it.title,
      image: it.image || '',
      variantLabel: it.variantLabel || '',
      selectedOptions: it.selectedOptions || {},
      quantity: qty,
      saleUnit: it.saleUnit || 'قطعة',
      unitCost,
      lineCost: Math.round(unitCost * qty * 100) / 100,
      exchangeStatus: ret ? ret.status : null,
      exchangeStatusLabel: ret ? (MERCHANT_RETURN_AR[ret.status] || ret.status) : null
    };
  });
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    createdAt: order.createdAt,
    status: order.status,
    deliveredAt: order.status === 'delivered' ? (order.deliveredAt || null) : null,
    governorate: (order.shippingAddress || {}).governorate || '',
    statusHistory: (order.statusHistory || []).map(h => ({ status: h.status, label: h.label, timestamp: h.timestamp })),
    items,
    merchantCostTotal: Math.round(items.reduce((s, i) => s + i.lineCost, 0) * 100) / 100,
    hasExchange: items.some(i => i.exchangeStatus),
    merchantView: true
  };
}

// Get single order details (Customer or Admin)
router.get('/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const order = await db.orders.findOne(o => String(o.id) === String(id) || o.orderNumber === id);

    if (!order) {
      return res.status(404).json({ success: false, message: 'الطلب غير موجود' });
    }

    // SECURITY: only the order owner, super admins, or staff/merchants allowed to manage orders
    const isOwnOrder = String(order.userId) === String(req.user.id);
    if (!isOwnOrder) {
      const canManage = isSuperAdmin(req.user) || req.user.role === 'admin' ||
        (req.user.role === 'staff' && req.user.isActive !== false && req.user.permissions?.canManageOrders) ||
        req.user.role === 'merchant';
      if (!canManage) {
        return res.status(403).json({ success: false, message: 'غير مصرح لك بمشاهدة هذا الطلب' });
      }
      // Merchants may only open orders that contain their own products
      if (req.user.role === 'merchant') {
        const mId = String(req.user.merchantId || '');
        const mCode = String(req.user.merchantCode || '').trim().toLowerCase();
        const hasOwnItem = (order.items || []).some(it =>
          (mId && String(it.merchantId || '') === mId) ||
          (mCode && String(it.merchantCode || '').trim().toLowerCase() === mCode)
        );
        if (!hasOwnItem) {
          return res.status(403).json({ success: false, message: 'غير مصرح لك بمشاهدة هذا الطلب' });
        }
        // Only his own lines, at wholesale cost
        const own = { ...order, items: (order.items || []).filter(it =>
          (mId && String(it.merchantId || '') === mId) ||
          (mCode && String(it.merchantCode || '').trim().toLowerCase() === mCode)) };
        const [products, returns] = await Promise.all([db.products.getAll(), db.returns.getAll()]);
        return res.json({ success: true, order: toMerchantOrder(own, products, returns), statusSteps: STATUS_STEPS });
      }
    }

    const allProducts = await db.products.getAll();
    const allMerchants = await db.merchants.getAll();
    const allInvestors = await db.investors.getAll();
    const isSuper = isSuperAdmin(req.user);

    const enrichedOrder = enrichOrderOwners(order, allProducts, allMerchants, allInvestors, isSuper);

    res.json({ success: true, order: enrichedOrder, statusSteps: STATUS_STEPS });
  } catch (err) {
    res.status(500).json({ success: false, message: 'فشل جلب تفاصيل الطلب' });
  }
});

// Admin: List all orders with filters & search
router.get('/', authenticate, requirePermission('canManageOrders'), async (req, res) => {
  try {
    const { status, search } = req.query;
    let orders = await db.orders.getAll();

    // If requester is a merchant, filter to orders containing their products only
    if (req.user.role === 'merchant') {
      let mId = req.user.merchantId ? String(req.user.merchantId) : '';
      let mCode = (req.user.merchantCode || '').trim().toLowerCase();

      if (!mId || !mCode) {
        const m = await db.merchants.findOne(x => (x.userId && x.userId === req.user.id) || (req.user.username && x.username === req.user.username));
        if (m) {
          if (!mId && m.id) mId = String(m.id);
          if (!mCode && m.code) mCode = m.code.trim().toLowerCase();
        }
      }

      const allProducts = await db.products.getAll();
      const myProductIds = new Set(
        allProducts
          .filter(p => !isInvestorOwned(p) && (
            (mId && p.merchantId && String(p.merchantId) === mId) ||
            (!p.merchantId && mCode && p.merchantCode && p.merchantCode.trim().toLowerCase() === mCode)
          ))
          .map(p => String(p.id))
      );

      const isMyMerchantItem = (it) => !isInvestorOwned(it) && (
        myProductIds.has(String(it.id || it.productId)) ||
        (mId && it.merchantId && String(it.merchantId) === mId) ||
        (!it.merchantId && mCode && it.merchantCode && it.merchantCode.trim().toLowerCase() === mCode)
      );

      orders = orders.filter(o =>
        o.items && o.items.some(isMyMerchantItem)
      ).map(o => {
        const merchantItems = (o.items || []).filter(isMyMerchantItem);
        const merchantItemsTotal = merchantItems.reduce((acc, it) => acc + (Number(it.price) * (Number(it.quantity) || 1)), 0);
        return {
          ...o,
          items: merchantItems,
          merchantTotal: merchantItemsTotal
        };
      });
    }

    if (status && status !== 'all') {
      orders = orders.filter(o => o.status === status);
    }

    // Date range filter (YYYY-MM-DD, inclusive, local day boundaries)
    const { from, to, source } = req.query;
    // Days in Cairo time
    if (from) orders = orders.filter(o => cairoDay(o.createdAt) >= String(from).slice(0, 10));
    if (to) orders = orders.filter(o => cairoDay(o.createdAt) <= String(to).slice(0, 10));
    if (source === 'manual') orders = orders.filter(o => o.isManual);
    else if (source === 'online') orders = orders.filter(o => !o.isManual);

    if (search && search.trim()) {
      const q = search.trim().toLowerCase();
      orders = orders.filter(o => {
        const num = (o.orderNumber || '').toLowerCase();
        const name = (o.customerName || '').toLowerCase();
        const phone = (o.customerPhone || '').toLowerCase();
        return num.includes(q) || name.includes(q) || phone.includes(q);
      });
    }

    orders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    const allProducts = await db.products.getAll();
    const allMerchants = await db.merchants.getAll();
    const allInvestors = await db.investors.getAll();
    const isSuper = isSuperAdmin(req.user);

    if (req.user.role === 'merchant') {
      const returns = await db.returns.getAll();
      const merchantOrders = orders.map(o => toMerchantOrder(o, allProducts, returns));
      return res.json({ success: true, count: merchantOrders.length, orders: merchantOrders, merchantView: true });
    }

    const enrichedOrders = orders.map(o => enrichOrderOwners(o, allProducts, allMerchants, allInvestors, isSuper));

    res.json({ success: true, count: enrichedOrders.length, orders: enrichedOrders });
  } catch (err) {
    res.status(500).json({ success: false, message: 'فشل جلب الطلبات' });
  }
});

// ==========================================================================
// ORDER STATUS EFFECTS (shared by the normal status change and the super-admin correction)
// ==========================================================================

// All four functions run INSIDE db.atomic (t = synchronous collections). Same rules as before;
// the difference: if any step fails, none of them is saved (no half-delivered / half-cancelled orders).

// Delivery: accounting entry, courier cash, loyalty points, milestone coupons.
// ctx = await loadContext() (loaded before the atomic block).
function applyDeliveredEffects(t, order, deliveredBy, ctx) {
  const result = { loyaltyPointsAwarded: 0, cashCollected: 0 };
  const settings = ctx.settings;
  const econ = orderEconomics(order, ctx);
  const paymentMethod = order.paymentMethod || 'cod';

  const existingEntry = t.accounting.findOne(a => a.orderId === order.id && !a.type);
  if (!existingEntry) {
    t.accounting.insert({
      orderId: order.id,
      orderNumber: order.orderNumber,
      customerName: order.customerName || 'عميل',
      customerPhone: order.customerPhone || '',
      deliveredBy,
      collectedAmount: econ.collected,
      paymentMethod,
      deliveryDate: new Date().toISOString(),
      // New profit model (no commission): who is owed what from this order
      merchantDues: econ.merchantDues,
      investorDues: econ.investorDues,
      ownerDues: econ.ownerDues,
      storeItemProfit: econ.storeItemProfit,
      shippingFee: econ.shippingFee,
      discounts: econ.discounts,
      discountsInvestorPart: econ.discountsInvestorPart,
      storeNet: econ.storeNet,
      status: 'completed',
      isRemittedToTreasury: paymentMethod !== 'cod'
    });
  }

  // Courier cash to collect (cash orders only)
  const cashAmount = paymentMethod === 'cod' ? econ.collected : 0;
  result.cashCollected = cashAmount;
  const existingEmp = t.employee_collections.findOne(e => (e.employeeName || '').toLowerCase() === deliveredBy.toLowerCase());
  if (existingEmp) {
    const newCash = (Number(existingEmp.cashToCollect) || 0) + cashAmount;
    const remitted = Number(existingEmp.remittedAmount) || 0;
    t.employee_collections.update(existingEmp.id, {
      ordersCount: (Number(existingEmp.ordersCount) || 0) + 1,
      cashToCollect: newCash,
      difference: newCash - remitted,
      lastDeliveryAt: new Date().toISOString()
    });
  } else {
    t.employee_collections.insert({
      employeeName: deliveredBy,
      ordersCount: 1,
      cashToCollect: cashAmount,
      remittedAmount: 0,
      difference: cashAmount,
      lastDeliveryAt: new Date().toISOString()
    });
  }

  // Loyalty points (e.g. 50 pts per 1,000 EGP of items) — values from the dashboard settings
  const ls = loyaltySettings(settings);
  if (ls.loyaltyEnabled && order.userId) {
    const customerUser = t.users.getById(order.userId);
    if (customerUser) {
      const earnedPoints = pointsForSubtotal(order.subtotal, settings);
      if (earnedPoints > 0) {
        const currentPoints = Number(customerUser.loyaltyPoints) || 0;
        t.users.update(customerUser.id, { loyaltyPoints: currentPoints + earnedPoints });
        result.loyaltyPointsAwarded = earnedPoints;
        t.notifications.insert({
          userId: customerUser.id,
          orderId: order.id,
          title: '🎉 نقاط ولاء جديدة في حسابك!',
          message: `تم إضافة ${earnedPoints} نقطة ولاء إلى رصيدك بعد تسليم الطلب #${order.orderNumber}. رصيدك الحالي: ${currentPoints + earnedPoints} نقطة.`,
          isRead: false
        });
      }
    }
  }

  // Milestone loyalty coupons (lifetime delivered purchases reach 3,000 / 5,000 EGP ...)
  const milestoneDiscountPercent = ls.milestoneDiscountPercent;
  const milestones = ls.milestoneThresholds;
  if (ls.milestoneCouponsEnabled && order.userId) {
    const customerUser = t.users.getById(order.userId);
    if (customerUser) {
      const userDeliveredOrders = t.orders.find(o => String(o.userId) === String(order.userId) && (o.status === 'delivered' || o.id === order.id));
      const lifetimeDeliveredTotal = userDeliveredOrders.reduce((sum, o) => sum + (Number(o.subtotal) || 0), 0);
      for (const milestone of milestones) {
        if (lifetimeDeliveredTotal < milestone) continue;
        const existingCoupon = t.coupons.findOne(c =>
          String(c.targetUserId) === String(customerUser.id) && Number(c.milestoneTarget) === Number(milestone)
        );
        if (existingCoupon) {
          if (existingCoupon.isActive === false && existingCoupon.deactivatedByCorrection) {
            t.coupons.update(existingCoupon.id, { isActive: true, deactivatedByCorrection: false });
          }
          continue;
        }
        const cleanName = (customerUser.name || 'CLIENT').replace(/[\s\W]+/g, '').toUpperCase().slice(0, 8);
        const code = `VIP${milestone >= 1000 ? Math.round(milestone / 1000) + 'K' : milestone}-${cleanName}-${Math.floor(100 + Math.random() * 900)}`;
        t.coupons.insert({
          code,
          description: `كوبون مكافأة حصرية بخصم ${milestoneDiscountPercent}% للعميل ${customerUser.name} لوصول المشتريات المسلّمة إلى ${milestone} ج.م`,
          discountType: 'percentage',
          discountValue: milestoneDiscountPercent,
          minOrderValue: 0,
          maxUses: 1,
          usedCount: 0,
          isActive: true,
          targetUserId: customerUser.id,
          targetUserName: customerUser.name,
          milestoneTarget: milestone,
          createdAt: new Date().toISOString()
        });
        t.notifications.insert({
          userId: customerUser.id,
          title: `🎁 هدية ولاء خاصة: كود خصم ${milestoneDiscountPercent}% باسمك!`,
          message: `مبروك يا ${customerUser.name}! تقديراً لولائك وبلوغ إجمالي مشترياتك المسلّمة ${milestone} ج.م، حصلت على كوبون خصم ${milestoneDiscountPercent}% باسمك (${code}) يمكنك استخدامه في طلبك القادم!`,
          isRead: false
        });
      }
    }
  }
  return result;
}

// Undo a delivery (super-admin correction only).
function revertDeliveredEffects(t, order, settings) {
  const notes = [];
  // 1. Accounting entry for this order
  const entries = t.accounting.find(a => a.orderId === order.id && !a.type);
  for (const e of entries) t.accounting.delete(e.id);
  if (entries.length) notes.push('حذف قيد التحصيل من المحاسبة');

  // 2. Loyalty points that the delivery awarded
  let awarded = Number(order.loyaltyPointsAwarded);
  if (!Number.isFinite(awarded)) {
    awarded = pointsForSubtotal(order.subtotal, settings);
  }
  if (awarded > 0 && order.userId) {
    const customer = t.users.getById(order.userId);
    if (customer) {
      t.users.update(customer.id, { loyaltyPoints: Math.max(0, (Number(customer.loyaltyPoints) || 0) - awarded) });
      notes.push(`سحب ${awarded} نقطة ولاء`);
    }
  }

  // 3. Courier cash
  const cash = Number.isFinite(Number(order.deliveredCashAmount))
    ? Number(order.deliveredCashAmount)
    : ((order.paymentMethod || 'cod') === 'cod' ? Number(order.grandTotal) || 0 : 0);
  if (order.deliveredBy) {
    const emp = t.employee_collections.findOne(e => (e.employeeName || '').toLowerCase() === String(order.deliveredBy).toLowerCase());
    if (emp) {
      const newCash = Math.max(0, (Number(emp.cashToCollect) || 0) - cash);
      t.employee_collections.update(emp.id, {
        ordersCount: Math.max(0, (Number(emp.ordersCount) || 0) - 1),
        cashToCollect: newCash,
        difference: newCash - (Number(emp.remittedAmount) || 0)
      });
      if (cash > 0) notes.push(`خصم ${cash} ج.م من عهدة ${order.deliveredBy}`);
    }
  }

  // 4. Milestone coupons that are no longer earned (only if still unused)
  if (order.userId) {
    const others = t.orders.find(o => String(o.userId) === String(order.userId) && o.status === 'delivered' && o.id !== order.id);
    const lifetime = others.reduce((s, o) => s + (Number(o.subtotal) || 0), 0);
    const coupons = t.coupons.find(c => String(c.targetUserId) === String(order.userId) && c.milestoneTarget);
    for (const c of coupons) {
      if (lifetime < Number(c.milestoneTarget) && !(Number(c.usedCount) > 0) && c.isActive !== false) {
        t.coupons.update(c.id, { isActive: false, deactivatedByCorrection: true });
        notes.push(`إيقاف كوبون المكافأة ${c.code}`);
      }
    }
  }
  return notes;
}

// Cancellation: give back stock, coupon use and loyalty points spent.
function applyCancelledEffects(t, order) {
  for (const item of (order.items || [])) {
    const product = t.products.getById(item.productId);
    if (product) {
      const qty = Number(item.quantity) || 0;
      const restored = { ...stockChange(product, item.variantId, qty), salesCount: Math.max(0, (Number(product.salesCount) || 0) - qty) };
      if (product.isBestSellerBackup && restored.stock > 0) {
        restored.isBestSeller = true;
        restored.isBestSellerBackup = false;
      }
      t.products.update(product.id, restored);
    }
  }
  if (order.appliedCoupon && order.appliedCoupon.code) {
    const coupon = t.coupons.findOne(c => c.code && c.code.toUpperCase() === String(order.appliedCoupon.code).toUpperCase());
    if (coupon) t.coupons.update(coupon.id, { usedCount: Math.max(0, (Number(coupon.usedCount) || 0) - 1) });
  }
  if (Number(order.loyaltyPointsUsed) > 0 && order.userId) {
    const customer = t.users.getById(order.userId);
    if (customer) {
      t.users.update(customer.id, { loyaltyPoints: (Number(customer.loyaltyPoints) || 0) + Number(order.loyaltyPointsUsed) });
    }
  }
}

// Undo a cancellation (super-admin correction only). Fails (and saves nothing) if the stock is gone.
function revertCancelledEffects(t, order) {
  const notes = [];
  for (const item of (order.items || [])) {
    const product = t.products.getById(item.productId);
    const qty = Number(item.quantity) || 0;
    const have = product ? availableStock(product, item.variantId) : 0;
    if (product && have < qty) {
      fail(`لا يمكن إعادة فتح الطلب: مخزون "${product.title}"${item.variantLabel ? ' (' + item.variantLabel + ')' : ''} الحالي (${have}) أقل من الكمية المطلوبة (${qty})`);
    }
  }
  for (const item of (order.items || [])) {
    const product = t.products.getById(item.productId);
    if (product) {
      const qty = Number(item.quantity) || 0;
      t.products.update(product.id, { ...stockChange(product, item.variantId, -qty), salesCount: (Number(product.salesCount) || 0) + qty });
    }
  }
  notes.push('إعادة خصم الكميات من المخزون');
  if (order.appliedCoupon && order.appliedCoupon.code) {
    const coupon = t.coupons.findOne(c => c.code && c.code.toUpperCase() === String(order.appliedCoupon.code).toUpperCase());
    if (coupon) t.coupons.update(coupon.id, { usedCount: (Number(coupon.usedCount) || 0) + 1 });
  }
  if (Number(order.loyaltyPointsUsed) > 0 && order.userId) {
    const customer = t.users.getById(order.userId);
    if (customer) {
      t.users.update(customer.id, { loyaltyPoints: Math.max(0, (Number(customer.loyaltyPoints) || 0) - Number(order.loyaltyPointsUsed)) });
    }
  }
  return notes;
}

// The order as it is NOW (inside the atomic block). Stops if someone else changed its status meanwhile.
function freshOrder(t, id, expectedStatus) {
  const order = t.orders.getById(id);
  if (!order) fail('الطلب غير موجود', 404);
  const now = order.status || 'pending';
  if (now !== expectedStatus) {
    const label = (STATUS_STEPS.find(s => s.key === now) || {}).label || now;
    fail(`حالة الطلب #${order.orderNumber} اتغيّرت من شخص تاني دلوقتي (بقت "${label}"). حدّث الصفحة وحاول تاني.`, 409);
  }
  return order;
}

// Admin: Update order status & send notification
router.put('/:id/status', authenticate, requirePermission('canManageOrders'), async (req, res, next) => {
  if (req.params.id === 'bulk') return next(); // handled by PUT /bulk/status below
  try {
    if (req.user.role === 'merchant') {
      return res.status(403).json({
        success: false,
        message: 'قائمة الطلبات لحساب التاجر مخصصة للمشاهدة فقط، ولا تملك صلاحية لتعديل حالة الطلبات.'
      });
    }

    const order = await db.orders.getById(req.params.id);
    if (!order) {
      return res.status(404).json({ success: false, message: 'الطلب غير موجود' });
    }
    const result = await changeOrderStatus(order, req.body, req.user);
    if (!result.ok) return res.status(400).json({ success: false, message: result.message });
    res.json({ success: true, message: result.message, order: result.order });
  } catch (err) {
    console.error('Update order status error:', err);
    res.status(500).json({ success: false, message: 'فشل تحديث حالة الطلب' });
  }
});

// Normal (non-correction) status change. Returns { ok, message, order }.
async function changeOrderStatus(order, { status, note, deliveredBy: deliveredByInput } = {}, user, { notifyCustomer = true } = {}) {
    const id = order.id;
    const stepInfo = STATUS_STEPS.find(s => s.key === status);
    if (!stepInfo) {
      return { ok: false, message: 'حالة الطلب غير صالحة' };
    }
    const currentStatus = order.status || 'pending';
    if (status === currentStatus) {
      return { ok: false, message: `الطلب #${order.orderNumber} بالفعل في حالة "${stepInfo.label}"` };
    }
    // Delivered and cancelled are final here. Mistakes are fixed by the super admin's
    // "correction" action, which reverses the money effects properly.
    if (currentStatus === 'delivered' || currentStatus === 'cancelled') {
      const currentLabel = (STATUS_STEPS.find(s => s.key === currentStatus) || {}).label || currentStatus;
      return {
        ok: false,
        message: `لا يمكن تغيير حالة طلب "${currentLabel}" (#${order.orderNumber}). للتصحيح استخدم زر "تصحيح الحالة" (المدير العام فقط)، وللاستبدال استخدم قسم طلبات الاستبدال.`
      };
    }

    const isNowDelivered = status === 'delivered';
    const isNowCancelled = status === 'cancelled';
    const deliveredBy = String(deliveredByInput || user.name || 'مندوب التوصيل').trim();

    const historyEntry = {
      status,
      label: stepInfo.label,
      note: note || stepInfo.desc || `تم تحديث الحالة إلى ${stepInfo.label}`,
      byUser: user.name,
      timestamp: new Date().toISOString()
    };

    // ALL OR NOTHING: the money / stock effects and the new status are saved together.
    // (Before, a failed accounting entry was only logged and the order still became "delivered".)
    const ctx = isNowDelivered ? await loadContext() : null;
    let updatedOrder;
    try {
      updatedOrder = await db.atomic(t => {
        const current = freshOrder(t, id, currentStatus); // stops a double "delivered" / double cancel
        let deliveryInfo = null;
        if (isNowDelivered) deliveryInfo = applyDeliveredEffects(t, current, deliveredBy, ctx);
        if (isNowCancelled) applyCancelledEffects(t, current);
        return t.orders.update(id, {
          status,
          statusHistory: [...(Array.isArray(current.statusHistory) ? current.statusHistory : []), historyEntry],
          ...(isNowDelivered ? {
            paymentStatus: 'paid',
            deliveredBy,
            deliveredAt: new Date().toISOString(),
            loyaltyPointsAwarded: deliveryInfo.loyaltyPointsAwarded,
            deliveredCashAmount: deliveryInfo.cashCollected
          } : {})
        });
      });
    } catch (err) {
      if (err.expose) return { ok: false, message: err.message };
      console.error('Order status change failed (nothing was saved):', err);
      return { ok: false, message: `تعذّر تحديث الطلب #${order.orderNumber}، ولم يتغيّر أي شيء (لا مخزون ولا حسابات). حاول تاني.` };
    }

    if (order.userId && notifyCustomer) {
      await db.notifications.insert({
        userId: order.userId,
        orderId: order.id,
        title: `تحديث في طلبك #${order.orderNumber}`,
        message: `أصبحت حالة طلبك: ${stepInfo.label}. ${note || ''}`,
        isRead: false
      });
    }

    await logActivity({
      userId: user.id,
      userName: user.name,
      userRole: user.role,
      action: 'UPDATE_ORDER_STATUS',
      module: 'orders',
      details: `قام بتحديث حالة الطلب #${order.orderNumber} إلى "${stepInfo.label}"${isNowDelivered ? ' (المحصل: ' + deliveredBy + ')' : ''}`,
      metadata: { orderId: order.id, status, deliveredBy: isNowDelivered ? deliveredBy : undefined }
    });

    return { ok: true, message: `تم تحديث حالة الطلب إلى "${stepInfo.label}" وإشعار العميل بنجاح`, order: updatedOrder };
}

// Admin: change the status of many orders at once
router.put('/bulk/status', authenticate, requirePermission('canManageOrders'), async (req, res) => {
  try {
    if (req.user.role === 'merchant') {
      return res.status(403).json({ success: false, message: 'حساب التاجر للمشاهدة فقط' });
    }
    const ids = Array.isArray(req.body.ids) ? [...new Set(req.body.ids.map(String))].slice(0, 200) : [];
    if (!ids.length) return res.status(400).json({ success: false, message: 'اختار طلب واحد على الأقل' });
    const done = [], failed = [];
    for (const id of ids) {
      const order = await db.orders.getById(id);
      if (!order) { failed.push({ id, message: 'الطلب غير موجود' }); continue; }
      try {
        const r = await changeOrderStatus(order, { status: req.body.status, note: req.body.note, deliveredBy: req.body.deliveredBy }, req.user);
        if (r.ok) done.push(order.orderNumber); else failed.push({ id, orderNumber: order.orderNumber, message: r.message });
      } catch (e) {
        failed.push({ id, orderNumber: order.orderNumber, message: 'خطأ أثناء التحديث' });
      }
    }
    res.json({
      success: done.length > 0,
      message: `تم تحديث ${done.length} طلب${failed.length ? `، وتعذّر ${failed.length}` : ''}`,
      updated: done, failed
    });
  } catch (err) {
    console.error('Bulk status error:', err);
    res.status(500).json({ success: false, message: 'فشل التحديث الجماعي' });
  }
});

// Customer: cancel my own order while it is still "pending" (not prepared yet)
router.put('/:id/cancel', authenticate, async (req, res) => {
  try {
    const order = await db.orders.findOne(o => String(o.id) === String(req.params.id) || o.orderNumber === req.params.id);
    if (!order || String(order.userId) !== String(req.user.id)) {
      return res.status(404).json({ success: false, message: 'الطلب غير موجود' });
    }
    if ((order.status || 'pending') !== 'pending') {
      return res.status(400).json({ success: false, message: 'الطلب دخل مرحلة التجهيز ومينفعش يتلغي من هنا. كلّمنا على خدمة العملاء.' });
    }
    const reason = String(req.body.reason || '').trim().slice(0, 300);
    // ALL OR NOTHING: give back stock / coupon / points + mark cancelled (only if still "pending" right now)
    const updated = await db.atomic(t => {
      const current = freshOrder(t, order.id, 'pending');
      applyCancelledEffects(t, current);
      return t.orders.update(order.id, {
        status: 'cancelled',
        cancelledByCustomer: true,
        cancelReason: reason,
        statusHistory: [...(Array.isArray(current.statusHistory) ? current.statusHistory : []), {
          status: 'cancelled', label: 'ملغي',
          note: `تم الإلغاء بواسطة العميل${reason ? ' — السبب: ' + reason : ''}`,
          byUser: req.user.name, timestamp: new Date().toISOString()
        }]
      });
    });
    await db.notifications.insert({
      userId: order.userId, orderId: order.id,
      title: `تم إلغاء طلبك #${order.orderNumber}`,
      message: 'تم إلغاء طلبك بناءً على طلبك. نتمنى نشوفك تاني قريب!',
      isRead: false
    });
    await logActivity({
      userId: req.user.id, userName: req.user.name, userRole: req.user.role,
      action: 'CUSTOMER_CANCEL_ORDER', module: 'orders',
      details: `العميل ألغى الطلب #${order.orderNumber}${reason ? ' — ' + reason : ''}`,
      metadata: { orderId: order.id }
    });
    res.json({ success: true, message: 'تم إلغاء الطلب', order: updated });
  } catch (err) {
    if (err.expose) return res.status(err.status || 400).json({ success: false, message: err.message });
    console.error('Customer cancel error:', err);
    res.status(500).json({ success: false, message: 'فشل إلغاء الطلب' });
  }
});

// Super admin only: correct a wrong status (including delivered / cancelled), reversing money effects.
router.put('/:id/correct-status', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { status, reason } = req.body;
    const cleanReason = String(reason || '').trim();
    if (cleanReason.length < 5) {
      return res.status(400).json({ success: false, message: 'اكتب سبب التصحيح (5 أحرف على الأقل) ليُحفظ في سجل الطلب' });
    }

    const order = await db.orders.getById(id);
    if (!order) {
      return res.status(404).json({ success: false, message: 'الطلب غير موجود' });
    }
    const stepInfo = STATUS_STEPS.find(s => s.key === status);
    if (!stepInfo) {
      return res.status(400).json({ success: false, message: 'حالة الطلب غير صالحة' });
    }
    const currentStatus = order.status || 'pending';
    if (status === currentStatus) {
      return res.status(400).json({ success: false, message: `الطلب بالفعل في حالة "${stepInfo.label}"` });
    }

    // A delivery that belongs to a CLOSED month can't be undone (its money is already settled)
    if (currentStatus === 'delivered') {
      const closedErr = await closedMonthError(order.deliveredAt || new Date().toISOString());
      if (closedErr) return res.status(400).json({ success: false, message: `الطلب ده اتسلّم في شهر مقفول. ${closedErr}` });
    }

    const deliveredBy = (req.body.deliveredBy || order.deliveredBy || req.user.name || 'مندوب التوصيل').trim();
    const ctx = await loadContext(); // settings + owners, read before the atomic block
    const fromLabel = (STATUS_STEPS.find(s => s.key === currentStatus) || {}).label || currentStatus;

    // ALL OR NOTHING: undo the old state's effects + apply the new state's effects + save the status
    const effects = [];
    const updatedOrder = await db.atomic(t => {
      const current = freshOrder(t, id, currentStatus);
      // Leaving a final state: undo its effects first (undo-cancel refuses if stock is gone → nothing saved)
      if (currentStatus === 'cancelled') effects.push(...revertCancelledEffects(t, current));
      if (currentStatus === 'delivered') effects.push(...revertDeliveredEffects(t, current, ctx.settings || {}));

      const updates = { status };
      if (status === 'delivered') {
        const info = applyDeliveredEffects(t, { ...current, status: 'delivered' }, deliveredBy, ctx);
        Object.assign(updates, {
          paymentStatus: 'paid',
          deliveredBy,
          deliveredAt: new Date().toISOString(),
          loyaltyPointsAwarded: info.loyaltyPointsAwarded,
          deliveredCashAmount: info.cashCollected
        });
        effects.push('تسجيل التسليم في المحاسبة');
      } else if (currentStatus === 'delivered') {
        Object.assign(updates, { paymentStatus: 'pending', deliveredAt: null, loyaltyPointsAwarded: 0, deliveredCashAmount: 0 });
      }
      if (status === 'cancelled') {
        applyCancelledEffects(t, current);
        effects.push('إرجاع المخزون والكوبون والنقاط');
      }
      updates.statusHistory = [...(Array.isArray(current.statusHistory) ? current.statusHistory : []), {
        status,
        label: stepInfo.label,
        note: `تصحيح من "${fromLabel}" إلى "${stepInfo.label}" — السبب: ${cleanReason}`,
        corrected: true,
        byUser: req.user.name,
        timestamp: new Date().toISOString()
      }];
      return t.orders.update(id, updates);
    });

    await db.notifications.insert({
      userId: order.userId,
      orderId: order.id,
      title: `تحديث في طلبك #${order.orderNumber}`,
      message: `تم تعديل حالة طلبك إلى: ${stepInfo.label}.`,
      isRead: false
    });
    await recordAuditLog({
      req,
      user: req.user,
      action: 'ORDER_STATUS_CORRECTION',
      targetModule: 'orders',
      targetId: order.id,
      details: `تصحيح حالة الطلب #${order.orderNumber} من "${fromLabel}" إلى "${stepInfo.label}". السبب: ${cleanReason}. ${effects.join('، ')}`,
      oldValues: { status: currentStatus },
      newValues: { status }
    }).catch(() => {});

    res.json({
      success: true,
      message: `تم تصحيح حالة الطلب إلى "${stepInfo.label}"${effects.length ? ' (' + effects.join('، ') + ')' : ''}`,
      effects,
      order: updatedOrder
    });
  } catch (err) {
    if (err.expose || err.status === 400) return res.status(err.status || 400).json({ success: false, message: err.message });
    console.error('Correct order status error (nothing was saved):', err);
    res.status(500).json({ success: false, message: 'فشل تصحيح حالة الطلب' });
  }
});

module.exports = router;
