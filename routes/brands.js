const express = require('express');
const router = express.Router();
const db = require('../database/db');
const { authenticate, requirePermission } = require('../middleware/auth');
const { logActivity } = require('../utils/activityLogger');

// Public: Get all brands (with optional category filter)
router.get('/', async (req, res) => {
  try {
    const { category, categoryId } = req.query;
    const catTarget = categoryId || category;

    let brands = await db.brands.getAll();

    if (catTarget && catTarget !== 'all') {
      brands = brands.filter(b => {
        if (Array.isArray(b.categoryIds)) {
          return b.categoryIds.includes(catTarget);
        }
        return String(b.categoryId) === String(catTarget);
      });
    }

    // Attach product count to each brand
    const products = await db.products.getAll();
    const withCounts = brands.map(brand => {
      const pCount = products.filter(p => {
        const brandMatch = (p.brand && (p.brand.toLowerCase() === brand.name.toLowerCase() || p.brandId === brand.id));
        return brandMatch && p.isActive !== false;
      }).length;

      return {
        ...brand,
        productCount: pCount
      };
    });

    res.json({ success: true, count: withCounts.length, brands: withCounts });
  } catch (err) {
    console.error('Fetch brands error:', err);
    res.status(500).json({ success: false, message: 'فشل جلب العلامات التجارية' });
  }
});

// Public: Get single brand
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const brand = await db.brands.getById(id);
    if (!brand) {
      return res.status(404).json({ success: false, message: 'العلامة التجارية غير موجودة' });
    }
    res.json({ success: true, brand });
  } catch (err) {
    res.status(500).json({ success: false, message: 'فشل جلب تفاصيل العلامة التجارية' });
  }
});

// Admin: Create brand
router.post('/', authenticate, requirePermission('canManageCategories'), async (req, res) => {
  try {
    const { name, nameEn, logo, categoryIds, categoryId, description } = req.body;

    if (!name) {
      return res.status(400).json({ success: false, message: 'اسم العلامة التجارية مطلوب' });
    }

    const cats = Array.isArray(categoryIds) ? categoryIds : (categoryId ? [categoryId] : []);

    const newBrand = await db.brands.insert({
      name: name.trim(),
      nameEn: nameEn ? nameEn.trim() : '',
      logo: logo || '',
      categoryIds: cats,
      description: description ? description.trim() : ''
    });

    await logActivity({
      userId: req.user.id,
      userName: req.user.name,
      userRole: req.user.role,
      action: 'CREATE_BRAND',
      module: 'categories',
      details: `قام بإضافة علامة تجارية جديدة: "${newBrand.name}"`,
      metadata: { brandId: newBrand.id }
    });

    res.status(201).json({
      success: true,
      message: 'تم إضافة العلامة التجارية بنجاح',
      brand: newBrand
    });
  } catch (err) {
    console.error('Create brand error:', err);
    res.status(500).json({ success: false, message: 'فشل إضافة العلامة التجارية' });
  }
});

// Admin: Update brand
router.put('/:id', authenticate, requirePermission('canManageCategories'), async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await db.brands.getById(id);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'العلامة التجارية غير موجودة' });
    }

    const { name, nameEn, logo, categoryIds, categoryId, description } = req.body;
    const updates = {};
    if (name) updates.name = name.trim();
    if (nameEn !== undefined) updates.nameEn = nameEn.trim();
    if (logo !== undefined) updates.logo = logo;
    if (categoryIds !== undefined) updates.categoryIds = categoryIds;
    if (categoryId !== undefined && !categoryIds) updates.categoryIds = [categoryId];
    if (description !== undefined) updates.description = description.trim();

    const updated = await db.brands.update(id, updates);

    await logActivity({
      userId: req.user.id,
      userName: req.user.name,
      userRole: req.user.role,
      action: 'UPDATE_BRAND',
      module: 'categories',
      details: `قام بتحديث العلامة التجارية: "${updated.name}"`,
      metadata: { brandId: updated.id }
    });

    res.json({
      success: true,
      message: 'تم تحديث العلامة التجارية بنجاح',
      brand: updated
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'فشل تحديث العلامة التجارية' });
  }
});

// Admin: Delete brand
router.delete('/:id', authenticate, requirePermission('canManageCategories'), async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await db.brands.getById(id);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'العلامة التجارية غير موجودة' });
    }

    await db.brands.delete(id);

    await logActivity({
      userId: req.user.id,
      userName: req.user.name,
      userRole: req.user.role,
      action: 'DELETE_BRAND',
      module: 'categories',
      details: `قام بحذف العلامة التجارية: "${existing.name}"`,
      metadata: { brandId: id }
    });

    res.json({ success: true, message: 'تم حذف العلامة التجارية بنجاح' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'فشل حذف العلامة التجارية' });
  }
});

module.exports = router;
