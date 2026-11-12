const express = require('express');
const router = express.Router();
const db = require('../database/db');
const { authenticate, requirePermission } = require('../middleware/auth');
const { logActivity } = require('../utils/activityLogger');

// Reviews created before moderation existed have no status: they count as approved.
const isApproved = r => !r.status || r.status === 'approved';

async function reviewsNeedApproval() {
  const settings = (await db.settings.getAll())[0] || {};
  return settings.reviewsRequireApproval !== false; // default: moderation ON
}

// Merchants and investors have canManageProducts but must not moderate other people's reviews
function blockOwnerRoles(req, res, next) {
  if (req.user && (req.user.role === 'merchant' || req.user.role === 'investor')) {
    return res.status(403).json({ success: false, message: 'غير مصرح لك بإدارة التقييمات' });
  }
  next();
}
const canModerate = [authenticate, requirePermission('canManageProducts'), blockOwnerRoles];

const publicReview = r => ({
  id: r.id, productId: r.productId, userName: r.userName, userAvatar: r.userAvatar,
  rating: r.rating, comment: r.comment, isVerifiedPurchase: r.isVerifiedPurchase,
  adminReply: r.adminReply || '', createdAt: r.createdAt
});

// Get approved reviews for a specific product
router.get('/product/:productId', async (req, res) => {
  try {
    const { productId } = req.params;
    const reviews = (await db.reviews.find(r => String(r.productId) === String(productId) && isApproved(r)));
    reviews.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    res.json({ success: true, count: reviews.length, reviews: reviews.map(publicReview) });
  } catch (err) {
    res.status(500).json({ success: false, message: 'فشل جلب التقييمات' });
  }
});

// Add a review
router.post('/', authenticate, async (req, res) => {
  try {
    const { productId, rating, comment } = req.body;

    if (!productId || !rating) {
      return res.status(400).json({ success: false, message: 'معرف المنتج والتقييم بالنجوم مطلوبان' });
    }

    const numRating = Math.max(1, Math.min(5, Math.round(Number(rating)) || 5));
    const cleanComment = String(comment || '').trim().slice(0, 1000);

    const product = await db.products.getById(productId);
    if (!product) {
      return res.status(404).json({ success: false, message: 'المنتج غير موجود' });
    }

    // "Verified purchase" only when the customer actually received the product
    const customerOrders = await db.orders.find(o => String(o.userId) === String(req.user.id) && o.status === 'delivered');
    const isVerifiedPurchase = customerOrders.some(order =>
      Array.isArray(order.items) && order.items.some(item => String(item.productId) === String(productId))
    );

    const status = (await reviewsNeedApproval()) ? 'pending' : 'approved';
    const pendingMsg = 'شكراً لك! تقييمك وصلنا وهيظهر بعد مراجعته.';

    // One review per customer per product: a second submission updates the first
    const existingReview = await db.reviews.findOne(r => String(r.productId) === String(productId) && String(r.userId) === String(req.user.id));
    if (existingReview) {
      const updatedReview = await db.reviews.update(existingReview.id, {
        rating: numRating,
        comment: cleanComment,
        isVerifiedPurchase,
        userName: req.user.name,
        userAvatar: req.user.avatar || '',
        status
      });
      return res.json({ success: true, pending: status === 'pending', message: status === 'pending' ? pendingMsg : 'تم تحديث تقييمك السابق لهذا المنتج.', review: publicReview(updatedReview) });
    }

    const newReview = await db.reviews.insert({
      productId,
      productTitle: product.title || '',
      userId: req.user.id,
      userName: req.user.name,
      userAvatar: req.user.avatar || '',
      rating: numRating,
      comment: cleanComment,
      isVerifiedPurchase,
      status
    });

    res.status(201).json({
      success: true,
      pending: status === 'pending',
      message: status === 'pending' ? pendingMsg : 'شكراً لك! تم إضافة تقييمك بنجاح.',
      review: publicReview(newReview)
    });
  } catch (err) {
    console.error('Add review error:', err);
    res.status(500).json({ success: false, message: 'فشل إضافة التقييم' });
  }
});

// ===== Admin moderation =====
router.get('/admin/all', ...canModerate, async (req, res) => {
  try {
    const { status = 'all', q = '' } = req.query;
    let reviews = await db.reviews.getAll();
    const products = await db.products.getAll();
    const titleOf = id => (products.find(p => String(p.id) === String(id)) || {}).title || '';
    reviews = reviews.map(r => ({ ...r, status: r.status || 'approved', productTitle: titleOf(r.productId) || r.productTitle || '' }));
    const counts = { all: reviews.length, pending: 0, approved: 0, rejected: 0 };
    reviews.forEach(r => { counts[r.status] = (counts[r.status] || 0) + 1; });
    if (status !== 'all') reviews = reviews.filter(r => r.status === status);
    const term = String(q).trim().toLowerCase();
    if (term) reviews = reviews.filter(r => [r.userName, r.comment, r.productTitle].some(v => String(v || '').toLowerCase().includes(term)));
    reviews.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    res.json({ success: true, counts, reviews, requireApproval: await reviewsNeedApproval() });
  } catch (err) {
    res.status(500).json({ success: false, message: 'فشل جلب التقييمات' });
  }
});

router.put('/admin/:id', ...canModerate, async (req, res) => {
  try {
    const review = await db.reviews.getById(req.params.id);
    if (!review) return res.status(404).json({ success: false, message: 'التقييم غير موجود' });
    const updates = {};
    if (req.body.status !== undefined) {
      if (!['approved', 'rejected', 'pending'].includes(req.body.status)) {
        return res.status(400).json({ success: false, message: 'حالة غير صالحة' });
      }
      updates.status = req.body.status;
      updates.moderatedBy = req.user.name;
      updates.moderatedAt = new Date().toISOString();
    }
    if (req.body.adminReply !== undefined) updates.adminReply = String(req.body.adminReply || '').trim().slice(0, 1000);
    const updated = await db.reviews.update(review.id, updates);
    await logActivity({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'MODERATE_REVIEW', module: 'reviews', details: `${review.userName || ''}: ${updates.status || 'رد'}` });
    res.json({ success: true, review: updated });
  } catch (err) {
    res.status(500).json({ success: false, message: 'فشل تحديث التقييم' });
  }
});

router.delete('/admin/:id', ...canModerate, async (req, res) => {
  try {
    const deleted = await db.reviews.delete(req.params.id);
    if (!deleted) return res.status(404).json({ success: false, message: 'التقييم غير موجود' });
    await logActivity({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'DELETE_REVIEW', module: 'reviews', details: `${deleted.userName || ''}: ${String(deleted.comment || '').slice(0, 60)}` });
    res.json({ success: true, message: 'تم حذف التقييم' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'فشل حذف التقييم' });
  }
});

router.put('/admin-settings/approval', ...canModerate, async (req, res) => {
  try {
    const value = Boolean(req.body.requireApproval);
    const current = (await db.settings.getAll())[0];
    if (current) await db.settings.update(current.id, { reviewsRequireApproval: value });
    else await db.settings.insert({ id: 'store_settings', reviewsRequireApproval: value });
    res.json({ success: true, requireApproval: value });
  } catch (err) {
    res.status(500).json({ success: false, message: 'فشل حفظ الإعداد' });
  }
});

module.exports = router;
