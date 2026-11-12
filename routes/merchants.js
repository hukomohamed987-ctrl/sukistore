const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const db = require('../database/db');
const { authenticate, requirePermission } = require('../middleware/auth');
const { logActivity } = require('../utils/activityLogger');
const { getMerchantProducts, matchOrderItemToMerchant } = require('../utils/ownershipHelper');
const { loadContext, itemEconomics } = require('../utils/financeEngine');

// SECURITY: managing merchants is for admins / staff only (not merchants, investors or customers)
const requireMerchantManager = requirePermission('canManageMerchants');

// SECURITY: a merchant may read only their own record; managers may read any
function requireMerchantReadAccess(req, res, next) {
  // Merchants read their data ONLY through /accounting/merchant-portal (wholesale cost, no selling prices)
  if (req.user && req.user.role === 'merchant') {
    return res.status(403).json({ success: false, message: 'بيانات حسابك متاحة في صفحة "حسابي ومستحقاتي"' });
  }
  // Staff handling orders need the merchant contact shown in order details
  if (req.user && req.user.role === 'staff' && req.user.isActive !== false && req.user.permissions?.canManageOrders) {
    return next();
  }
  return requireMerchantManager(req, res, next);
}

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

// 1. Get all merchants with dynamic stats & merchant login details
router.get('/', authenticate, requireMerchantManager, async (req, res) => {
  try {
    const { search } = req.query;
    let merchants = await db.merchants.getAll();
    const allProducts = await db.products.getAll();
    const allProductMap = new Map(allProducts.map(p => [String(p.id), p]));
    const allOrders = await db.orders.getAll();
    const allUsers = await db.users.getAll();
    const financeCtx = await loadContext();

    // Map each merchant with live metrics and user login info
    let enriched = merchants.map(m => {
      const merchantProducts = getMerchantProducts(allProducts, m);
      const merchantProductMap = new Map(merchantProducts.map(mp => [String(mp.id), mp]));

      // Find associated merchant user account
      const merchantUser = allUsers.find(u => 
        (u.merchantId && String(u.merchantId) === String(m.id)) ||
        (!u.merchantId && u.merchantCode && u.merchantCode.trim().toLowerCase() === m.code.trim().toLowerCase())
      );

      // Delivered orders containing this merchant's products
      let deliveredOrdersCount = 0;
      let totalSales = 0;
      let totalCost = 0;
      let storeProfit = 0;

      allOrders.forEach(o => {
        if (o.status === 'delivered') {
          const matchedItems = (o.items || []).filter(item =>
            Boolean(matchOrderItemToMerchant(item, m, merchantProductMap, allProductMap))
          );
          if (matchedItems.length > 0) {
            deliveredOrdersCount++;
            const itemsSum = matchedItems.reduce((acc, it) => acc + (Number(it.price) * (Number(it.quantity) || 1)), 0);
            totalSales += itemsSum;
            // New model: merchant is owed his cost price; the margin is store profit
            matchedItems.forEach(it => {
              const econ = itemEconomics({ ...it, ownerType: 'merchant' }, financeCtx);
              totalCost += econ.cost;
              storeProfit += econ.storeProfit;
            });
          }
        }
      });

      const canEdit = merchantUser?.canEditProducts !== undefined 
        ? Boolean(merchantUser.canEditProducts) 
        : (m.canEditProducts !== undefined ? Boolean(m.canEditProducts) : true);

      return {
        ...m,
        username: merchantUser?.username || m.username || '',
        whatsapp: merchantUser?.whatsappPhone || m.whatsapp || m.phone || '',
        hasUserAccount: Boolean(merchantUser),
        userId: merchantUser?.id || m.userId || null,
        canEditProducts: canEdit,
        productsCount: merchantProducts.length,
        deliveredOrdersCount,
        totalSales: Math.round(totalSales * 100) / 100,
        totalCost: Math.round(totalCost * 100) / 100,
        storeProfit: Math.round(storeProfit * 100) / 100
      };
    });

    if (search && search.trim()) {
      const q = normalizeArabic(search.trim());
      enriched = enriched.filter(m => 
        normalizeArabic(m.name || '').includes(q) ||
        normalizeArabic(m.code || '').includes(q) ||
        normalizeArabic(m.username || '').includes(q) ||
        (m.phone && m.phone.includes(q)) ||
        (m.whatsapp && m.whatsapp.includes(q))
      );
    }

    // Sort by products count descending or creation date
    enriched.sort((a, b) => (b.productsCount || 0) - (a.productsCount || 0));

    res.json({
      success: true,
      count: enriched.length,
      merchants: enriched
    });
  } catch (err) {
    console.error('Fetch merchants error:', err);
    res.status(500).json({ success: false, message: 'فشل جلب قائمة التجار' });
  }
});

// 2. Get single merchant details by code or ID
router.get('/:code', authenticate, requireMerchantReadAccess, async (req, res) => {
  try {
    const { code } = req.params;
    const cleanCode = (code || '').trim().toLowerCase();
    const merchants = await db.merchants.getAll();
    const merchant = merchants.find(m => (m.code && m.code.toLowerCase() === cleanCode) || String(m.id) === String(code));

    if (!merchant) {
      return res.status(404).json({ success: false, message: 'التاجر غير موجود' });
    }

    const allUsers = await db.users.getAll();
    const user = allUsers.find(u => 
      (u.merchantId && String(u.merchantId) === String(merchant.id)) ||
      (u.merchantCode && u.merchantCode.toLowerCase() === cleanCode)
    );

    res.json({
      success: true,
      merchant: {
        id: merchant.id,
        code: merchant.code,
        name: merchant.name,
        phone: merchant.phone || user?.phone || '',
        whatsapp: merchant.whatsapp || user?.whatsappPhone || merchant.phone || '',
        address: merchant.address || '',
        notes: merchant.notes || '',
        username: user?.username || merchant.username || '',
        isActive: merchant.isActive !== false
      }
    });
  } catch (err) {
    console.error('Fetch merchant error:', err);
    res.status(500).json({ success: false, message: 'فشل جلب بيانات التاجر' });
  }
});

// 2.1. Get single merchant by code or ID with their products
router.get('/:code/products', authenticate, requireMerchantReadAccess, async (req, res) => {
  try {
    const { code } = req.params;
    const cleanCode = (code || '').trim().toLowerCase();
    const merchants = await db.merchants.getAll();
    const merchant = merchants.find(m => m.code?.toLowerCase() === cleanCode || m.id === code);

    const allProducts = await db.products.getAll();
    const targetMerchant = merchant || { id: '', code: cleanCode, name: '' };
    const products = getMerchantProducts(allProducts, targetMerchant);

    res.json({
      success: true,
      merchant: merchant || { code, name: 'تاجر' },
      count: products.length,
      products
    });
  } catch (err) {
    console.error('Fetch merchant products error:', err);
    res.status(500).json({ success: false, message: 'فشل جلب منتجات التاجر' });
  }
});

// 3. Create or register a new merchant + User Account
router.post('/', authenticate, requireMerchantManager, async (req, res) => {
  try {
    const {
      code,
      name,
      username,
      password,
      phone,
      whatsapp,
      canEditProducts,
      commissionRate,
      address,
      notes
    } = req.body;

    if (!code || !name) {
      return res.status(400).json({
        success: false,
        message: 'كود التاجر واسم التاجر مطلوبان'
      });
    }

    const cleanCode = code.trim().toUpperCase();
    const existing = await db.merchants.findOne(m => m.code.toUpperCase() === cleanCode);
    if (existing) {
      return res.status(400).json({
        success: false,
        message: `كود التاجر (${cleanCode}) مسجل مسبقاً باسم "${existing.name}"`
      });
    }

    // Process Username & Account credentials
    const cleanUsername = username ? username.trim().toLowerCase() : `merchant_${cleanCode.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
    
    // Check username uniqueness if provided
    const existingUser = await db.users.findOne(u => u.username && u.username.toLowerCase() === cleanUsername);
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: `اسم المستخدم (${cleanUsername}) مسجل بالفعل لحساب آخر، يُرجى اختيار اسم مستخدم مختلف.`
      });
    }

    // SECURITY: no shared default password (was '123456'); the store sets one for the merchant
    const finalPassword = String(password || '').trim();
    if (finalPassword.length < 8) {
      return res.status(400).json({ success: false, message: 'اكتب كلمة مرور لحساب التاجر (8 أحرف على الأقل)' });
    }
    const hashedPassword = await bcrypt.hash(finalPassword, 10);
    const canEdit = canEditProducts !== false && canEditProducts !== 'false';
    const cleanWhatsapp = (whatsapp || phone || '').trim();
    const cleanPhone = (phone || cleanWhatsapp).trim();

    const merchantId = uuidv4();
    const userId = uuidv4();

    // Create user account for the merchant
    const newUser = await db.users.insert({
      id: userId,
      name: name.trim(),
      username: cleanUsername,
      email: `${cleanUsername}@merchant.suki.store`,
      phone: cleanPhone,
      whatsappPhone: cleanWhatsapp,
      whatsapp: cleanWhatsapp,
      role: 'merchant',
      merchantId: merchantId,
      merchantCode: cleanCode,
      canEditProducts: canEdit,
      isActive: true,
      password: hashedPassword,
      permissions: {
        canViewDashboard: true,
        canManageProducts: true,
        canManageOrders: true
      },
      createdAt: new Date().toISOString()
    });

    // Create merchant record
    const newMerchant = await db.merchants.insert({
      id: merchantId,
      userId: userId,
      code: cleanCode,
      name: name.trim(),
      username: cleanUsername,
      phone: cleanPhone,
      whatsapp: cleanWhatsapp,
      canEditProducts: canEdit,
      commissionRate: commissionRate !== undefined && commissionRate !== '' ? Number(commissionRate) : 2.5,
      address: address ? address.trim() : '',
      notes: notes ? notes.trim() : '',
      isActive: true,
      totalProductsCount: 0
    });

    await logActivity({
      userId: req.user.id,
      userName: req.user.name,
      userRole: req.user.role,
      action: 'CREATE_MERCHANT',
      module: 'merchants',
      details: `قام بإضافة تاجر جديد وإنشاء حسابه: "${newMerchant.name}" (كود: ${newMerchant.code} / مستخدم: ${cleanUsername})`,
      metadata: { merchantId: newMerchant.id, code: newMerchant.code, userId }
    });

    res.status(201).json({
      success: true,
      message: `تم إضافة التاجر بنجاح وإنشاء حسابه (اسم المستخدم: ${cleanUsername})`,
      merchant: {
        ...newMerchant,
        username: cleanUsername,
        canEditProducts: canEdit
      }
    });
  } catch (err) {
    console.error('Create merchant error:', err);
    res.status(500).json({ success: false, message: 'فشل إضافة التاجر: ' + (err.message || '') });
  }
});

// 4. Update merchant & user account details
router.put('/:id', authenticate, requireMerchantManager, async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await db.merchants.getById(id);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'التاجر غير موجود' });
    }

    const {
      name,
      username,
      password,
      phone,
      whatsapp,
      canEditProducts,
      commissionRate,
      address,
      notes,
      isActive
    } = req.body;

    const canEdit = canEditProducts !== undefined ? (canEditProducts !== false && canEditProducts !== 'false') : existing.canEditProducts;
    const cleanWhatsapp = whatsapp !== undefined ? whatsapp.trim() : existing.whatsapp;
    const cleanPhone = phone !== undefined ? phone.trim() : existing.phone;

    // Find and update associated user account in db.users
    const user = await db.users.findOne(u => 
      (u.merchantId && String(u.merchantId) === String(id)) ||
      (existing.userId && String(u.id) === String(existing.userId)) ||
      (u.merchantCode && u.merchantCode.trim().toLowerCase() === existing.code.trim().toLowerCase())
    );

    let updatedUserId = user?.id || null;

    if (user) {
      const userUpdates = {
        name: name ? name.trim() : user.name,
        phone: cleanPhone || user.phone,
        whatsappPhone: cleanWhatsapp || user.whatsappPhone,
        whatsapp: cleanWhatsapp || user.whatsapp,
        canEditProducts: canEdit !== undefined ? Boolean(canEdit) : user.canEditProducts,
        isActive: isActive !== undefined ? Boolean(isActive) : user.isActive
      };

      if (username && username.trim() && username.trim().toLowerCase() !== user.username) {
        const cleanUser = username.trim().toLowerCase();
        const clash = await db.users.findOne(u => u.id !== user.id && u.username && u.username.toLowerCase() === cleanUser);
        if (clash) {
          return res.status(400).json({ success: false, message: 'اسم المستخدم مسجل بالفعل لحساب آخر' });
        }
        userUpdates.username = cleanUser;
        userUpdates.email = `${cleanUser}@merchant.suki.store`;
      }

      if (password && password.trim()) {
        if (password.trim().length < 8) {
          return res.status(400).json({ success: false, message: 'كلمة مرور التاجر لازم تكون 8 أحرف على الأقل' });
        }
        userUpdates.password = await bcrypt.hash(password.trim(), 10);
        userUpdates.tokenVersion = (Number(user.tokenVersion) || 1) + 1; // log out old sessions
      }

      await db.users.update(user.id, userUpdates);
    } else if (username && username.trim()) {
      // Create user account if merchant previously didn't have one
      const cleanUser = username.trim().toLowerCase();
      const finalPassword = String(password || '').trim();
      if (finalPassword.length < 8) {
        return res.status(400).json({ success: false, message: 'اكتب كلمة مرور لحساب التاجر (8 أحرف على الأقل)' });
      }
      const hashedPassword = await bcrypt.hash(finalPassword, 10);
      const createdUser = await db.users.insert({
        id: uuidv4(),
        name: (name ? name.trim() : existing.name),
        username: cleanUser,
        email: `${cleanUser}@merchant.suki.store`,
        phone: cleanPhone || '',
        whatsappPhone: cleanWhatsapp || cleanPhone || '',
        whatsapp: cleanWhatsapp || cleanPhone || '',
        role: 'merchant',
        merchantId: id,
        merchantCode: existing.code,
        canEditProducts: canEdit !== undefined ? Boolean(canEdit) : true,
        isActive: isActive !== undefined ? Boolean(isActive) : true,
        password: hashedPassword,
        permissions: {
          canViewDashboard: true,
          canManageProducts: true,
          canManageOrders: true
        },
        createdAt: new Date().toISOString()
      });
      updatedUserId = createdUser.id;
    }

    const updated = await db.merchants.update(id, {
      ...(name ? { name: name.trim() } : {}),
      ...(username ? { username: username.trim().toLowerCase() } : {}),
      ...(phone !== undefined ? { phone: cleanPhone } : {}),
      ...(whatsapp !== undefined ? { whatsapp: cleanWhatsapp } : {}),
      ...(canEdit !== undefined ? { canEditProducts: Boolean(canEdit) } : {}),
      ...(commissionRate !== undefined ? { commissionRate: Number(commissionRate) } : {}),
      ...(address !== undefined ? { address: address.trim() } : {}),
      ...(notes !== undefined ? { notes: notes.trim() } : {}),
      ...(isActive !== undefined ? { isActive: Boolean(isActive) } : {}),
      ...(updatedUserId ? { userId: updatedUserId } : {})
    });

    await logActivity({
      userId: req.user.id,
      userName: req.user.name,
      userRole: req.user.role,
      action: 'UPDATE_MERCHANT',
      module: 'merchants',
      details: `قام بتحديث بيانات التاجر وحسابه: "${updated.name}" (كود: ${updated.code})`,
      metadata: { merchantId: id, code: updated.code }
    });

    res.json({
      success: true,
      message: 'تم تحديث بيانات التاجر وحسابه بنجاح',
      merchant: updated
    });
  } catch (err) {
    console.error('Update merchant error:', err);
    res.status(500).json({ success: false, message: 'فشل تحديث بيانات التاجر' });
  }
});

// 5. Toggle merchant permission to edit their products
router.patch('/:id/toggle-edit-products', authenticate, requireMerchantManager, async (req, res) => {
  try {
    const { id } = req.params;
    const merchant = await db.merchants.getById(id);
    if (!merchant) {
      return res.status(404).json({ success: false, message: 'التاجر غير موجود' });
    }

    const newStatus = merchant.canEditProducts !== undefined ? !merchant.canEditProducts : false;

    // Update merchant
    await db.merchants.update(id, { canEditProducts: newStatus });

    // Update associated user account
    const user = await db.users.findOne(u => 
      (u.merchantId && String(u.merchantId) === String(id)) ||
      (merchant.userId && String(u.id) === String(merchant.userId)) ||
      (u.merchantCode && u.merchantCode.trim().toLowerCase() === merchant.code.trim().toLowerCase())
    );

    if (user) {
      await db.users.update(user.id, { canEditProducts: newStatus });
    }

    await logActivity({
      userId: req.user.id,
      userName: req.user.name,
      userRole: req.user.role,
      action: 'TOGGLE_MERCHANT_EDIT_PERMISSION',
      module: 'merchants',
      details: `قام بـ ${newStatus ? 'تفعيل' : 'إلغاء'} صلاحية تعديل المنتجات للتاجر "${merchant.name}"`,
      metadata: { merchantId: id, code: merchant.code, canEditProducts: newStatus }
    });

    res.json({
      success: true,
      canEditProducts: newStatus,
      message: newStatus 
        ? `تم السماح للتاجر "${merchant.name}" بتعديل منتجاته بنفسه بنجاح ✅`
        : `تم قصر حساب التاجر "${merchant.name}" على المشاهدة فقط (بدون تعديل) 🔒`
    });
  } catch (err) {
    console.error('Toggle merchant edit permission error:', err);
    res.status(500).json({ success: false, message: 'فشل تعديل صلاحية التاجر' });
  }
});

// 6. Delete merchant & associated user account
router.delete('/:id', authenticate, requireMerchantManager, async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await db.merchants.getById(id);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'التاجر غير موجود' });
    }

    // Delete associated user
    const user = await db.users.findOne(u => 
      (u.merchantId && String(u.merchantId) === String(id)) ||
      (existing.userId && String(u.id) === String(existing.userId)) ||
      (u.merchantCode && u.merchantCode.trim().toLowerCase() === existing.code.trim().toLowerCase())
    );
    if (user) {
      await db.users.delete(user.id);
    }

    await db.merchants.delete(id);

    // Also exclude from accounting collections if exists
    try {
      const settingsList = await db.settings.getAll();
      const currentSettings = settingsList[0] || {};
      let excluded = Array.isArray(currentSettings.excludedCollections) ? [...currentSettings.excludedCollections] : [];
      const keysToAdd = [
        String(id).trim().toLowerCase(),
        existing.code ? existing.code.trim().toLowerCase() : '',
        existing.name ? existing.name.trim().toLowerCase() : ''
      ].filter(Boolean);

      keysToAdd.forEach(k => {
        if (!excluded.includes(k)) excluded.push(k);
      });
      if (currentSettings.id) {
        await db.settings.update(currentSettings.id, { excludedCollections: excluded });
      }
    } catch (e) {
      console.warn('Could not update excluded collections on merchant delete:', e);
    }

    await logActivity({
      userId: req.user.id,
      userName: req.user.name,
      userRole: req.user.role,
      action: 'DELETE_MERCHANT',
      module: 'merchants',
      details: `قام بحذف التاجر وحسابه: "${existing.name}" (كود: ${existing.code})`,
      metadata: { merchantId: id, code: existing.code }
    });

    res.json({ success: true, message: 'تم حذف التاجر وحسابه بنجاح' });
  } catch (err) {
    console.error('Delete merchant error:', err);
    res.status(500).json({ success: false, message: 'فشل حذف التاجر' });
  }
});

// 7. Bulk Delete Merchants
router.post('/bulk-delete', authenticate, requireMerchantManager, async (req, res) => {
  try {
    const ids = req.body.ids || req.body.merchantIds;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ success: false, message: 'لم يتم تحديد أي تجار للحذف' });
    }

    let deletedCount = 0;
    for (const id of ids) {
      const merchant = await db.merchants.getById(id);
      if (merchant) {
        // Delete associated user
        const user = await db.users.findOne(u => 
          (merchant.userId && String(u.id) === String(merchant.userId)) ||
          (u.merchantCode && u.merchantCode.trim().toLowerCase() === (merchant.code || '').trim().toLowerCase())
        );
        if (user) {
          await db.users.delete(user.id);
        }
        await db.merchants.delete(id);

    // Also exclude from accounting collections if exists
    try {
      const settingsList = await db.settings.getAll();
      const currentSettings = settingsList[0] || {};
      let excluded = Array.isArray(currentSettings.excludedCollections) ? [...currentSettings.excludedCollections] : [];
      const keysToAdd = [
        String(id).trim().toLowerCase(),
        existing.code ? existing.code.trim().toLowerCase() : '',
        existing.name ? existing.name.trim().toLowerCase() : ''
      ].filter(Boolean);

      keysToAdd.forEach(k => {
        if (!excluded.includes(k)) excluded.push(k);
      });
      if (currentSettings.id) {
        await db.settings.update(currentSettings.id, { excludedCollections: excluded });
      }
    } catch (e) {
      console.warn('Could not update excluded collections on merchant delete:', e);
    }
        deletedCount++;
      }
    }

    await logActivity({
      userId: req.user.id,
      userName: req.user.name,
      userRole: req.user.role,
      action: 'BULK_DELETE_MERCHANTS',
      module: 'merchants',
      details: `قام بحذف جماعي لـ (${deletedCount}) تاجر`,
      metadata: { deletedCount, merchantIds: ids }
    });

    res.json({ success: true, message: `تم حذف ${deletedCount} تاجر وحساباتهم بنجاح`, deletedCount });
  } catch (err) {
    console.error('Bulk delete merchants error:', err);
    res.status(500).json({ success: false, message: 'فشل حذف التجار المحددين' });
  }
});

module.exports = router;
