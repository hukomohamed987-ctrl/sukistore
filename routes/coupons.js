const express = require('express');
const router = express.Router();
const db = require('../database/db');
const { authenticate, requirePermission } = require('../middleware/auth');
const { logActivity } = require('../utils/activityLogger');

// SECURITY: reject impossible coupon values (e.g. 500% or negative discounts)
function validateCouponValue(type, value) {
  const v = Number(value);
  if (!Number.isFinite(v) || v <= 0) return 'قيمة الخصم يجب أن تكون رقماً أكبر من صفر';
  if (type === 'percentage' && v > 100) return 'نسبة الخصم لا يمكن أن تتجاوز 100%';
  return null;
}

// Validate and apply coupon (Customer checkout)
router.post('/validate', authenticate, async (req, res) => {
  try {
    const { code, cartSubtotal } = req.body;

    if (!code) {
      return res.status(400).json({ success: false, message: 'يرجى إدخال كود الخصم' });
    }

    const cleanCode = String(code).trim().toUpperCase();
    const coupon = await db.coupons.findOne(c => c.code && c.code.toUpperCase() === cleanCode);

    if (!coupon) {
      return res.status(404).json({ success: false, message: 'كود الخصم غير موجود' });
    }

    if (!coupon.isActive) {
      return res.status(400).json({ success: false, message: 'كود الخصم متوقف حالياً' });
    }

    if (coupon.expiresAt && new Date(coupon.expiresAt) < new Date()) {
      return res.status(400).json({ success: false, message: 'كود الخصم منتهي الصلاحية' });
    }

    if (coupon.maxUses && (coupon.usedCount || 0) >= coupon.maxUses) {
      return res.status(400).json({ success: false, message: 'تم استهلاك الحد الأقصى لاستخدام هذا الكود' });
    }

    // Check if personalized coupon for specific customer
    if (coupon.targetUserId && String(coupon.targetUserId) !== String(req.user.id)) {
      return res.status(403).json({ success: false, message: 'هذا الكوبون مخصص لعميل آخر فقط' });
    }

    const subtotal = Number(cartSubtotal) || 0;
    if (coupon.minOrderValue && subtotal < coupon.minOrderValue) {
      return res.status(400).json({
        success: false,
        message: `الحد الأدنى للطلب لتفعيل هذا الكوبون هو ${coupon.minOrderValue} ج.م`
      });
    }

    // Calculate discount amount
    let discountAmount = 0;
    if (coupon.discountType === 'percentage') {
      discountAmount = Math.round((subtotal * (coupon.discountValue / 100)) * 100) / 100;
      if (coupon.maxDiscountCap && discountAmount > coupon.maxDiscountCap) {
        discountAmount = coupon.maxDiscountCap;
      }
    } else {
      // Fixed amount
      discountAmount = Math.min(Number(coupon.discountValue) || 0, subtotal);
    }

    res.json({
      success: true,
      message: `تم تطبيق كود الخصم بنجاح! وفرت ${discountAmount} ج.م`,
      coupon: {
        id: coupon.id,
        code: coupon.code,
        discountType: coupon.discountType,
        discountValue: coupon.discountValue,
        discountAmount
      }
    });
  } catch (err) {
    console.error('Coupon validate error:', err);
    res.status(500).json({ success: false, message: 'حدث خطأ أثناء فحص كود الخصم' });
  }
});

// Only one coupon is advertised on the home page at a time
async function clearOtherHomeCoupons(keepId) {
  const others = await db.coupons.find(c => c.showOnHome && String(c.id) !== String(keepId));
  for (const c of others) await db.coupons.update(c.id, { showOnHome: false });
}

// Public: the coupon advertised on the home page (only if it really works right now)
router.get('/home-promo', async (req, res) => {
  try {
    const now = new Date();
    const c = await db.coupons.findOne(x => x.showOnHome && x.isActive !== false && !x.targetUserId &&
      !(x.expiresAt && new Date(x.expiresAt) < now) &&
      !(x.maxUses && (x.usedCount || 0) >= x.maxUses));
    if (!c) return res.json({ success: true, coupon: null });
    res.json({
      success: true,
      coupon: { code: c.code, discountType: c.discountType, discountValue: c.discountValue, minOrderValue: c.minOrderValue || 0, expiresAt: c.expiresAt || null }
    });
  } catch (err) {
    res.json({ success: true, coupon: null });
  }
});

// Admin: Get all coupons
router.get('/', authenticate, requirePermission('canManageCoupons'), async (req, res) => {
  try {
    const coupons = await db.coupons.getAll();
    res.json({ success: true, coupons });
  } catch (err) {
    res.status(500).json({ success: false, message: 'فشل جلب الكوبونات' });
  }
});

// Admin: Create coupon
router.post('/', authenticate, requirePermission('canManageCoupons'), async (req, res) => {
  try {
    const {
      code,
      discountType,
      discountValue,
      minOrderValue,
      maxDiscountCap,
      maxUses,
      expiresAt,
      isActive
    } = req.body;

    if (!code || !discountValue) {
      return res.status(400).json({ success: false, message: 'كود الخصم وقيمة الخصم مطلوبان' });
    }
    const valueError = validateCouponValue(discountType === 'fixed' ? 'fixed' : 'percentage', discountValue);
    if (valueError) {
      return res.status(400).json({ success: false, message: valueError });
    }

    const cleanCode = String(code).trim().toUpperCase();
    const existing = await db.coupons.findOne(c => c.code && c.code.toUpperCase() === cleanCode);
    if (existing) {
      return res.status(400).json({ success: false, message: 'كود الخصم موجود بالفعل' });
    }

    const newCoupon = await db.coupons.insert({
      code: cleanCode,
      discountType: discountType === 'fixed' ? 'fixed' : 'percentage',
      discountValue: Number(discountValue) || 10,
      minOrderValue: Number(minOrderValue) || 0,
      maxDiscountCap: maxDiscountCap ? Number(maxDiscountCap) : null,
      maxUses: maxUses ? Number(maxUses) : null,
      usedCount: 0,
      expiresAt: expiresAt || null,
      isActive: isActive !== undefined ? Boolean(isActive) : true,
      showOnHome: Boolean(req.body.showOnHome)
    });
    if (newCoupon.showOnHome) await clearOtherHomeCoupons(newCoupon.id);

    res.status(201).json({
      success: true,
      message: 'تم إنشاء الكوبون بنجاح',
      coupon: newCoupon
    });
  } catch (err) {
    console.error('Create coupon error:', err);
    res.status(500).json({ success: false, message: 'فشل إنشاء الكوبون' });
  }
});

// Admin: Update coupon
router.put('/:id', authenticate, requirePermission('canManageCoupons'), async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await db.coupons.getById(id);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'الكوبون غير موجود' });
    }

    const {
      code,
      discountType,
      discountValue,
      minOrderValue,
      maxDiscountCap,
      maxUses,
      expiresAt,
      isActive
    } = req.body;

    if (discountType !== undefined || discountValue !== undefined) {
      const newType = (discountType || existing.discountType) === 'fixed' ? 'fixed' : 'percentage';
      const newValue = discountValue !== undefined ? discountValue : existing.discountValue;
      const valueError = validateCouponValue(newType, newValue);
      if (valueError) {
        return res.status(400).json({ success: false, message: valueError });
      }
    }

    const updates = {};
    if (code) updates.code = String(code).trim().toUpperCase();
    if (discountType) updates.discountType = discountType === 'fixed' ? 'fixed' : 'percentage';
    if (discountValue !== undefined) updates.discountValue = Number(discountValue);
    if (minOrderValue !== undefined) updates.minOrderValue = Number(minOrderValue);
    if (maxDiscountCap !== undefined) updates.maxDiscountCap = maxDiscountCap ? Number(maxDiscountCap) : null;
    if (maxUses !== undefined) updates.maxUses = maxUses ? Number(maxUses) : null;
    if (expiresAt !== undefined) updates.expiresAt = expiresAt;
    if (isActive !== undefined) updates.isActive = Boolean(isActive);
    if (req.body.showOnHome !== undefined) updates.showOnHome = Boolean(req.body.showOnHome);

    const updated = await db.coupons.update(id, updates);
    if (updates.showOnHome) await clearOtherHomeCoupons(id);

    res.json({
      success: true,
      message: 'تم تحديث الكوبون بنجاح',
      coupon: updated
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'فشل تحديث الكوبون' });
  }
});

// Admin: Delete coupon
router.delete('/:id', authenticate, requirePermission('canManageCoupons'), async (req, res) => {
  try {
    const { id } = req.params;
    await db.coupons.delete(id);
    res.json({ success: true, message: 'تم حذف الكوبون بنجاح' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'فشل حذف الكوبون' });
  }
});

// ONE definition of the loyalty / milestone settings (defaults, limits, Arabic names).
// Used by the dashboard (read + save), checkout and the delivery effects through utils/loyalty.js.
const { loyaltySettings, LOYALTY_FIELDS } = require('../utils/loyalty');

// Admin: Get Loyalty & Milestone Coupon Settings
router.get('/settings/all', authenticate, async (req, res) => {
  try {
    const settings = (await db.settings.getAll())[0] || {};
    res.json({ success: true, settings: loyaltySettings(settings) });
  } catch (err) {
    res.status(500).json({ success: false, message: 'فشل جلب إعدادات النقاط والكوبونات' });
  }
});

// Admin: Update Loyalty & Milestone Coupon Settings (validated; creates the settings record if missing)
router.put('/settings/all', authenticate, requirePermission('canManageCoupons'), async (req, res) => {
  try {
    if (req.user.role === 'merchant' || req.user.role === 'investor') {
      return res.status(403).json({ success: false, message: 'غير مصرح لك بتعديل الإعدادات' });
    }
    const body = req.body || {};
    const updates = {};
    const errors = [];
    if (body.loyaltyEnabled !== undefined) updates.loyaltyEnabled = Boolean(body.loyaltyEnabled);
    if (body.milestoneCouponsEnabled !== undefined) updates.milestoneCouponsEnabled = Boolean(body.milestoneCouponsEnabled);
    for (const [key, def] of Object.entries(LOYALTY_FIELDS)) {
      if (body[key] === undefined) continue;
      const raw = String(body[key]).trim();
      const n = Number(raw);
      if (raw === '' || !Number.isFinite(n) || n < def.min || n > def.max) {
        errors.push(`${def.label}: لازم يكون رقم من ${def.min} لـ ${def.max}`);
      } else {
        updates[key] = def.integer ? Math.round(n) : Math.round(n * 100) / 100;
      }
    }
    if (body.milestoneThresholds !== undefined) {
      const list = Array.isArray(body.milestoneThresholds) ? body.milestoneThresholds.map(Number) : [];
      if (!list.length || list.some(n => !Number.isFinite(n) || n <= 0)) {
        errors.push('مستويات المكافآت لازم تكون أرقام أكبر من صفر');
      } else {
        updates.milestoneThresholds = [...new Set(list.map(n => Math.round(n)))].sort((a, b) => a - b);
      }
    }
    if (errors.length) return res.status(400).json({ success: false, message: errors.join(' • '), errors });
    if (!Object.keys(updates).length) return res.status(400).json({ success: false, message: 'مفيش قيم اتبعتت للحفظ' });

    const current = (await db.settings.getAll())[0];
    const saved = current
      ? await db.settings.update(current.id, updates)
      : await db.settings.insert({ id: 'store_settings', ...updates });

    await logActivity({
      userId: req.user.id, userName: req.user.name, userRole: req.user.role,
      action: 'UPDATE_LOYALTY_SETTINGS', module: 'coupons',
      details: `عدّل إعدادات نقاط الولاء/المكافآت: ${Object.entries(updates).map(([k, v]) => `${(LOYALTY_FIELDS[k] || {}).label || k} = ${Array.isArray(v) ? v.join('، ') : v}`).join(' | ')}`
    });

    res.json({
      success: true,
      message: 'تم حفظ إعدادات نقاط الولاء والمكافآت ✅ (بتطبق على الطلبات الجديدة)',
      settings: loyaltySettings(saved)
    });
  } catch (err) {
    console.error('Save loyalty settings error:', err);
    res.status(500).json({ success: false, message: 'فشل حفظ الإعدادات' });
  }
});

// Customer: Get My Available Coupons (general active + personalized for my account)
router.get('/my/list', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const allCoupons = await db.coupons.find(c => c.isActive !== false);
    const now = new Date();

    const myCoupons = allCoupons.filter(c => {
      // Exclude expired
      if (c.expiresAt && new Date(c.expiresAt) < now) return false;
      // Exclude consumed
      if (c.maxUses && (c.usedCount || 0) >= c.maxUses) return false;
      // Personal coupon match or general coupon
      if (c.targetUserId) {
        return String(c.targetUserId) === String(userId);
      }
      return true;
    });

    res.json({ success: true, coupons: myCoupons });
  } catch (err) {
    res.status(500).json({ success: false, message: 'فشل جلب الكوبونات المتاحة' });
  }
});

// Customer: Get Loyalty Points Summary
router.get('/loyalty/summary', authenticate, async (req, res) => {
  try {
    const user = await db.users.getById(req.user.id);
    const settingsList = await db.settings.getAll();
    const settings = settingsList[0] || {};

    const points = Number(user?.loyaltyPoints) || 0;
    const ls = loyaltySettings(settings);
    const pointValueEgp = ls.loyaltyPointValueEgp;
    const minThreshold = ls.loyaltyMinRedemptionThreshold;
    const maxPercent = ls.loyaltyMaxRedemptionPercent;
    const loyaltyEnabled = ls.loyaltyEnabled;

    // Calculate lifetime delivered total for this customer
    const deliveredOrders = await db.orders.find(o => String(o.userId) === String(req.user.id) && o.status === 'delivered');
    const lifetimeDeliveredTotal = deliveredOrders.reduce((sum, o) => sum + (Number(o.subtotal) || 0), 0);

    res.json({
      success: true,
      loyalty: {
        points,
        pointsValueEgp: points * pointValueEgp,
        pointValueEgp,
        minThreshold,
        maxPercent,
        loyaltyEnabled,
        canRedeem: points >= minThreshold && loyaltyEnabled,
        pointsNeededToRedeem: Math.max(0, minThreshold - points),
        lifetimeDeliveredTotal,
        spendPerReward: ls.loyaltySpendPerReward,
        pointsPerReward: ls.loyaltyPointsPerReward
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'فشل جلب تفاصيل نقاط الولاء' });
  }
});

module.exports = router;
