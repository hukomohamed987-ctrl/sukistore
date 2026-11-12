const express = require('express');
const router = express.Router();
const db = require('../database/db');
const { authenticate, requirePermission } = require('../middleware/auth');
const { logActivity } = require('../utils/activityLogger');

// Get all categories (Public)
router.get('/', async (req, res) => {
  try {
    const categories = await db.categories.getAll();
    const products = await db.products.getAll();

    // Attach product count to each category
    const categoriesWithCount = categories.map(cat => {
      const count = products.filter(p => p.categoryId === cat.id && p.isActive !== false).length;
      return {
        ...cat,
        productCount: count
      };
    });

    // Sort by orderIndex ascending
    categoriesWithCount.sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0));

    res.json({ success: true, categories: categoriesWithCount });
  } catch (err) {
    console.error('Fetch categories error:', err);
    res.status(500).json({ success: false, message: 'حدث خطأ أثناء جلب الأقسام' });
  }
});

// ==========================================
// SUBCATEGORY ROUTES (Square Banners & Navigation)
// ==========================================

// Get all subcategories or by categoryId
router.get('/subcategories', async (req, res) => {
  try {
    const { categoryId } = req.query;
    let list = await db.subcategories.getAll();
    if (categoryId && categoryId !== 'all') {
      list = list.filter(s => String(s.categoryId) === String(categoryId));
    }

    const products = await db.products.getAll();
    const enriched = list.map(sub => {
      const count = products.filter(p => (String(p.subcategoryId) === String(sub.id) || String(p.subcategory) === String(sub.id)) && p.isActive !== false).length;
      return {
        ...sub,
        isVisible: sub.isVisible !== false,
        productCount: count
      };
    });

    enriched.sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0));
    res.json({ success: true, subcategories: enriched });
  } catch (err) {
    console.error('Fetch subcategories error:', err);
    res.status(500).json({ success: false, message: 'فشل جلب الأقسام الفرعية' });
  }
});

// Alias: Get subcategories by categoryId via URL path
router.get('/:categoryId/subcategories', async (req, res) => {
  req.query.categoryId = req.params.categoryId;
  const list = await db.subcategories.find(s => String(s.categoryId) === String(req.params.categoryId));
  res.json({ success: true, subcategories: list });
});

// Get single subcategory
router.get('/subcategories/:subId', async (req, res) => {
  try {
    const { subId } = req.params;
    const sub = await db.subcategories.getById(subId);
    if (!sub) {
      return res.status(404).json({ success: false, message: 'القسم الفرعي غير موجود' });
    }
    res.json({ success: true, subcategory: sub });
  } catch (err) {
    res.status(500).json({ success: false, message: 'فشل جلب القسم الفرعي' });
  }
});

// Admin: Add Subcategory
router.post('/subcategories', authenticate, requirePermission('canManageCategories'), async (req, res) => {
  try {
    const { name, categoryId, description, discountText, image, bannerUrl, bannerTitle, bannerSubtitle, isVisible, orderIndex } = req.body;
    if (!name || !categoryId) {
      return res.status(400).json({ success: false, message: 'اسم القسم الفرعي والقسم الرئيسي مطلوبان' });
    }

    const category = await db.categories.getById(categoryId);
    if (!category) {
      return res.status(400).json({ success: false, message: 'القسم الرئيسي المحدد غير موجود' });
    }

    const newSub = await db.subcategories.insert({
      name: name.trim(),
      categoryId,
      description: description ? description.trim() : '',
      discountText: discountText ? discountText.trim() : '',
      image: image || 'https://images.unsplash.com/photo-1526170375885-4d8ecf77b99f?w=500',
      bannerUrl: bannerUrl ? bannerUrl.trim() : '',
      bannerTitle: bannerTitle ? bannerTitle.trim() : '',
      bannerSubtitle: bannerSubtitle ? bannerSubtitle.trim() : '',
      isVisible: isVisible !== false,
      orderIndex: Number(orderIndex) || 0
    });

    await logActivity({
      userId: req.user.id,
      userName: req.user.name,
      userRole: req.user.role,
      action: 'CREATE_SUBCATEGORY',
      module: 'categories',
      details: `قام بإضافة قسم فرعي جديد: "${newSub.name}" لقسم "${category.name}"`,
      metadata: { subcategoryId: newSub.id, categoryId }
    });

    // Auto In-App Notification to users
    db.notifications.insert({
      title: 'قسم فرعي جديد! ✨',
      message: `تمت إضافة قسم فرعي جديد: "${newSub.name}" ضمن قسم "${category.name}".`,
      type: 'subcategory',
      target: 'all',
      subcategoryId: newSub.id,
      categoryId,
      link: `#/category/${categoryId}`,
      createdAt: new Date().toISOString()
    }).catch(() => {});

    res.status(201).json({ success: true, message: 'تم إضافة القسم الفرعي بنجاح', subcategory: newSub });
  } catch (err) {
    console.error('Create subcategory error:', err);
    res.status(500).json({ success: false, message: 'فشل إضافة القسم الفرعي' });
  }
});

// Admin: Update Subcategory
router.put('/subcategories/:subId', authenticate, requirePermission('canManageCategories'), async (req, res) => {
  try {
    const { subId } = req.params;
    const { name, categoryId, description, discountText, image, bannerUrl, bannerTitle, bannerSubtitle, isVisible, orderIndex } = req.body;

    const existing = await db.subcategories.getById(subId);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'القسم الفرعي غير موجود' });
    }

    const updates = {};
    if (name) updates.name = name.trim();
    if (categoryId) updates.categoryId = categoryId;
    if (description !== undefined) updates.description = description.trim();
    if (discountText !== undefined) updates.discountText = discountText.trim();
    if (image !== undefined) updates.image = image;
    if (bannerUrl !== undefined) updates.bannerUrl = bannerUrl.trim();
    if (bannerTitle !== undefined) updates.bannerTitle = bannerTitle.trim();
    if (bannerSubtitle !== undefined) updates.bannerSubtitle = bannerSubtitle.trim();
    if (isVisible !== undefined) updates.isVisible = Boolean(isVisible);
    if (orderIndex !== undefined) updates.orderIndex = Number(orderIndex);

    const updated = await db.subcategories.update(subId, updates);

    await logActivity({
      userId: req.user.id,
      userName: req.user.name,
      userRole: req.user.role,
      action: 'UPDATE_SUBCATEGORY',
      module: 'categories',
      details: `قام بتحديث القسم الفرعي: "${updated.name}"`,
      metadata: { subcategoryId: subId }
    });

    res.json({ success: true, message: 'تم تحديث بيانات القسم الفرعي بنجاح', subcategory: updated });
  } catch (err) {
    res.status(500).json({ success: false, message: 'فشل تحديث القسم الفرعي' });
  }
});

// Admin: Toggle Subcategory Visibility
router.patch('/subcategories/:subId/toggle', authenticate, requirePermission('canManageCategories'), async (req, res) => {
  try {
    const { subId } = req.params;
    const existing = await db.subcategories.getById(subId);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'القسم الفرعي غير موجود' });
    }

    const newVisibility = existing.isVisible === false ? true : false;
    const updated = await db.subcategories.update(subId, { isVisible: newVisibility });

    res.json({
      success: true,
      message: newVisibility ? 'تم إظهار القسم الفرعي للعملاء' : 'تم إخفاء القسم الفرعي عن العملاء',
      subcategory: updated
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'فشل تغيير حالة الظهور' });
  }
});

// Admin: Reorder Subcategories
router.post('/subcategories/reorder', authenticate, requirePermission('canManageCategories'), async (req, res) => {
  try {
    const { orderedIds } = req.body;
    if (Array.isArray(orderedIds)) {
      for (let i = 0; i < orderedIds.length; i++) {
        await db.subcategories.update(orderedIds[i], { orderIndex: i });
      }
    }
    res.json({ success: true, message: 'تم إعادة ترتيب الأقسام الفرعية بنجاح' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'فشل إعادة الترتيب' });
  }
});

// Admin: Delete Subcategory
router.delete('/subcategories/:subId', authenticate, requirePermission('canManageCategories'), async (req, res) => {
  try {
    const { subId } = req.params;
    const existing = await db.subcategories.getById(subId);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'القسم الفرعي غير موجود' });
    }

    await db.subcategories.delete(subId);

    await logActivity({
      userId: req.user.id,
      userName: req.user.name,
      userRole: req.user.role,
      action: 'DELETE_SUBCATEGORY',
      module: 'categories',
      details: `قام بحذف القسم الفرعي: "${existing.name}"`,
      metadata: { subcategoryId: subId }
    });

    res.json({ success: true, message: 'تم حذف القسم الفرعي بنجاح' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'فشل حذف القسم الفرعي' });
  }
});

// Get single category by ID or slug
router.get('/:idOrSlug', async (req, res) => {
  try {
    const { idOrSlug } = req.params;
    const cat = await db.categories.findOne(
      c => String(c.id) === String(idOrSlug) || c.slug === idOrSlug
    );

    if (!cat) {
      return res.status(404).json({ success: false, message: 'القسم غير موجود' });
    }

    res.json({ success: true, category: cat });
  } catch (err) {
    res.status(500).json({ success: false, message: 'فشل جلب القسم' });
  }
});

// Add new category (Admin / Staff with permission)
router.post('/', authenticate, requirePermission('canManageCategories'), async (req, res) => {
  try {
    const { name, slug, description, image, icon, bannerUrl, bannerTitle, bannerSubtitle, orderIndex } = req.body;

    if (!name) {
      return res.status(400).json({ success: false, message: 'اسم القسم مطلوب' });
    }

    const autoSlug = (slug || name)
      .toLowerCase()
      .replace(/[^\w\u0621-\u064A0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

    const newCat = await db.categories.insert({
      name: name.trim(),
      slug: autoSlug,
      description: description ? description.trim() : '',
      image: image || '/uploads/default-category.jpg',
      icon: icon || 'tag',
      bannerUrl: bannerUrl ? bannerUrl.trim() : '',
      bannerTitle: bannerTitle ? bannerTitle.trim() : '',
      bannerSubtitle: bannerSubtitle ? bannerSubtitle.trim() : '',
      orderIndex: Number(orderIndex) || 0
    });

    await logActivity({
      userId: req.user.id,
      userName: req.user.name,
      userRole: req.user.role,
      action: 'CREATE_CATEGORY',
      module: 'categories',
      details: `قام بإضافة قسم جديد: "${newCat.name}"`,
      metadata: { categoryId: newCat.id }
    });

    // Auto In-App Notification to users
    db.notifications.insert({
      title: 'قسم جديد في سوقي ستور! 🏷️',
      message: `تم افتتاح قسم جديد: "${newCat.name}"، تصفح الآن أفضل العروض والمنتجات.`,
      type: 'category',
      target: 'all',
      categoryId: newCat.id,
      link: `#/category/${newCat.id}`,
      createdAt: new Date().toISOString()
    }).catch(() => {});

    res.status(201).json({
      success: true,
      message: 'تم إضافة القسم بنجاح',
      category: newCat
    });
  } catch (err) {
    console.error('Create category error:', err);
    res.status(500).json({ success: false, message: 'فشل إضافة القسم' });
  }
});

// Update category (Admin / Staff with permission)
router.put('/:id', authenticate, requirePermission('canManageCategories'), async (req, res) => {
  try {
    const { id } = req.params;
    const { name, slug, description, image, icon, bannerUrl, bannerTitle, bannerSubtitle, orderIndex } = req.body;

    const existing = await db.categories.getById(id);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'القسم غير موجود' });
    }

    const updates = {};
    if (name) updates.name = name.trim();
    if (slug) updates.slug = slug.trim();
    if (description !== undefined) updates.description = description.trim();
    if (image !== undefined) updates.image = image;
    if (icon !== undefined) updates.icon = icon;
    if (bannerUrl !== undefined) updates.bannerUrl = bannerUrl.trim();
    if (bannerTitle !== undefined) updates.bannerTitle = bannerTitle.trim();
    if (bannerSubtitle !== undefined) updates.bannerSubtitle = bannerSubtitle.trim();
    if (orderIndex !== undefined) updates.orderIndex = Number(orderIndex);

    const updated = await db.categories.update(id, updates);

    await logActivity({
      userId: req.user.id,
      userName: req.user.name,
      userRole: req.user.role,
      action: 'UPDATE_CATEGORY',
      module: 'categories',
      details: `قام بتحديث قسم: "${updated.name}"`,
      metadata: { categoryId: updated.id }
    });

    res.json({
      success: true,
      message: 'تم تحديث بيانات القسم بنجاح',
      category: updated
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'فشل تحديث القسم' });
  }
});

// Reorder categories
router.post('/reorder', authenticate, requirePermission('canManageCategories'), async (req, res) => {
  try {
    const { orderedIds } = req.body; // Array of IDs in desired order
    if (Array.isArray(orderedIds)) {
      for (let i = 0; i < orderedIds.length; i++) {
        await db.categories.update(orderedIds[i], { orderIndex: i });
      }
    }
    res.json({ success: true, message: 'تم إعادة ترتيب الأقسام بنجاح' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'فشل ترتيب الأقسام' });
  }
});

// Delete category (Admin / Staff with permission)
router.delete('/:id', authenticate, requirePermission('canManageCategories'), async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await db.categories.getById(id);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'القسم غير موجود' });
    }

    await db.categories.delete(id);

    // Optional: unset category from products or leave them
    const products = await db.products.find(p => p.categoryId === id);
    for (const p of products) {
      await db.products.update(p.id, { categoryId: null });
    }

    await logActivity({
      userId: req.user.id,
      userName: req.user.name,
      userRole: req.user.role,
      action: 'DELETE_CATEGORY',
      module: 'categories',
      details: `قام بحذف قسم: "${existing.name}"`,
      metadata: { categoryId: id }
    });

    res.json({ success: true, message: 'تم حذف القسم بنجاح' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'فشل حذف القسم' });
  }
});

// Bulk Delete Categories
router.post('/bulk-delete', authenticate, requirePermission('canManageCategories'), async (req, res) => {
  try {
    const ids = req.body.ids || req.body.categoryIds;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ success: false, message: 'لم يتم تحديد أي أقسام للحذف' });
    }

    let deletedCount = 0;
    for (const id of ids) {
      const resDel = await db.categories.delete(id);
      if (resDel) {
        deletedCount++;
        const subs = await db.subcategories.find(s => String(s.categoryId) === String(id));
        for (const sub of subs) {
          await db.subcategories.delete(sub.id);
        }
      }
    }

    await logActivity({
      userId: req.user.id,
      userName: req.user.name,
      userRole: req.user.role,
      action: 'BULK_DELETE_CATEGORIES',
      module: 'categories',
      details: `قام بحذف جماعي لـ (${deletedCount}) قسم رئيسي`,
      metadata: { deletedCount, categoryIds: ids }
    });

    res.json({ success: true, message: `تم حذف ${deletedCount} قسم رئيسي بنجاح`, deletedCount });
  } catch (err) {
    console.error('Bulk delete categories error:', err);
    res.status(500).json({ success: false, message: 'فشل حذف الأقسام المحددة' });
  }
});

// Bulk Delete Subcategories
router.post('/subcategories/bulk-delete', authenticate, requirePermission('canManageCategories'), async (req, res) => {
  try {
    const ids = req.body.ids || req.body.subIds || req.body.subCategoryIds;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ success: false, message: 'لم يتم تحديد أي أقسام فرعية للحذف' });
    }

    let deletedCount = 0;
    for (const id of ids) {
      const resDel = await db.subcategories.delete(id);
      if (resDel) deletedCount++;
    }

    await logActivity({
      userId: req.user.id,
      userName: req.user.name,
      userRole: req.user.role,
      action: 'BULK_DELETE_SUBCATEGORIES',
      module: 'categories',
      details: `قام بحذف جماعي لـ (${deletedCount}) قسم فرعي`,
      metadata: { deletedCount, subCategoryIds: ids }
    });

    res.json({ success: true, message: `تم حذف ${deletedCount} قسم فرعي بنجاح`, deletedCount });
  } catch (err) {
    console.error('Bulk delete subcategories error:', err);
    res.status(500).json({ success: false, message: 'فشل حذف الأقسام الفرعية المحددة' });
  }
});

module.exports = router;
