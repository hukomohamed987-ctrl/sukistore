const express = require('express');
const router = express.Router();
const db = require('../database/db');
const { authenticate, requirePermission } = require('../middleware/auth');
const { logActivity } = require('../utils/activityLogger');

// Public: Get active banners (supports ?placement=home|category|subcategory&categoryId=...&subcategoryId=...)
router.get('/', async (req, res) => {
  try {
    const { placement, categoryId, subcategoryId } = req.query;
    let banners = await db.banners.find(b => b.isActive !== false);

    if (placement) {
      banners = banners.filter(b => (b.placement || 'home') === placement);
    }
    if (categoryId) {
      banners = banners.filter(b => String(b.categoryId) === String(categoryId));
    }
    if (subcategoryId) {
      banners = banners.filter(b => String(b.subcategoryId) === String(subcategoryId));
    }

    banners.sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0));
    res.json({ success: true, banners });
  } catch (err) {
    res.status(500).json({ success: false, message: 'فشل جلب البانرات' });
  }
});

// Admin: Get all banners (including inactive)
router.get('/all', authenticate, requirePermission('canManageBanners'), async (req, res) => {
  try {
    const { placement, categoryId, subcategoryId } = req.query;
    let banners = await db.banners.getAll();

    if (placement) {
      banners = banners.filter(b => (b.placement || 'home') === placement);
    }
    if (categoryId) {
      banners = banners.filter(b => String(b.categoryId) === String(categoryId));
    }
    if (subcategoryId) {
      banners = banners.filter(b => String(b.subcategoryId) === String(subcategoryId));
    }

    banners.sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0));
    res.json({ success: true, banners });
  } catch (err) {
    res.status(500).json({ success: false, message: 'فشل جلب البانرات' });
  }
});

// Admin: Create banner
router.post('/', authenticate, requirePermission('canManageBanners'), async (req, res) => {
  try {
    const {
      title,
      subtitle,
      badgeText,
      imageUrl,
      linkUrl,
      bgGradient,
      colorName,
      orderIndex,
      isActive,
      placement,
      categoryId,
      subcategoryId,
      bannerType
    } = req.body;

    if (!title && !imageUrl) {
      return res.status(400).json({ success: false, message: 'عنوان البانر أو الصورة مطلوبة' });
    }

    const newBanner = await db.banners.insert({
      title: title ? title.trim() : '',
      subtitle: subtitle ? subtitle.trim() : '',
      badgeText: badgeText ? badgeText.trim() : 'عرض خاص',
      imageUrl: imageUrl || '',
      linkUrl: linkUrl || '#/products',
      bgGradient: bgGradient || 'linear-gradient(135deg, #059669 0%, #065f46 100%)',
      colorName: colorName || 'أخضر زمردي',
      orderIndex: Number(orderIndex) || 0,
      isActive: isActive !== undefined ? Boolean(isActive) : true,
      placement: placement || 'home',
      categoryId: categoryId || null,
      subcategoryId: subcategoryId || null,
      bannerType: bannerType || 'image_full_width'
    });

    await logActivity({
      userId: req.user.id,
      userName: req.user.name,
      userRole: req.user.role,
      action: 'CREATE_BANNER',
      module: 'banners',
      details: `قام بإضافة بانر جديد: "${newBanner.title || newBanner.placement}"`,
      metadata: { bannerId: newBanner.id }
    });

    res.status(201).json({
      success: true,
      message: 'تم إضافة البانر بنجاح',
      banner: newBanner
    });
  } catch (err) {
    console.error('Create banner error:', err);
    res.status(500).json({ success: false, message: 'فشل إضافة البانر' });
  }
});

// Admin: Update banner
router.put('/:id', authenticate, requirePermission('canManageBanners'), async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await db.banners.getById(id);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'البانر غير موجود' });
    }

    const {
      title,
      subtitle,
      badgeText,
      imageUrl,
      linkUrl,
      bgGradient,
      colorName,
      orderIndex,
      isActive,
      placement,
      categoryId,
      subcategoryId,
      bannerType
    } = req.body;

    const updates = {};
    if (title !== undefined) updates.title = title ? title.trim() : '';
    if (subtitle !== undefined) updates.subtitle = subtitle ? subtitle.trim() : '';
    if (badgeText !== undefined) updates.badgeText = badgeText ? badgeText.trim() : '';
    if (imageUrl !== undefined) updates.imageUrl = imageUrl;
    if (linkUrl !== undefined) updates.linkUrl = linkUrl;
    if (bgGradient !== undefined) updates.bgGradient = bgGradient;
    if (colorName !== undefined) updates.colorName = colorName;
    if (orderIndex !== undefined) updates.orderIndex = Number(orderIndex);
    if (isActive !== undefined) updates.isActive = Boolean(isActive);
    if (placement !== undefined) updates.placement = placement;
    if (categoryId !== undefined) updates.categoryId = categoryId;
    if (subcategoryId !== undefined) updates.subcategoryId = subcategoryId;
    if (bannerType !== undefined) updates.bannerType = bannerType;

    const updated = await db.banners.update(id, updates);

    await logActivity({
      userId: req.user.id,
      userName: req.user.name,
      userRole: req.user.role,
      action: 'UPDATE_BANNER',
      module: 'banners',
      details: `قام بتحديث البانر: "${updated.title}"`,
      metadata: { bannerId: updated.id }
    });

    res.json({
      success: true,
      message: 'تم تحديث البانر بنجاح',
      banner: updated
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'فشل تحديث البانر' });
  }
});

// Admin: Delete banner
router.delete('/:id', authenticate, requirePermission('canManageBanners'), async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await db.banners.getById(id);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'البانر غير موجود' });
    }

    await db.banners.delete(id);

    await logActivity({
      userId: req.user.id,
      userName: req.user.name,
      userRole: req.user.role,
      action: 'DELETE_BANNER',
      module: 'banners',
      details: `قام بحذف البانر: "${existing.title}"`,
      metadata: { bannerId: id }
    });

    res.json({ success: true, message: 'تم حذف البانر بنجاح' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'فشل حذف البانر' });
  }
});

module.exports = router;
