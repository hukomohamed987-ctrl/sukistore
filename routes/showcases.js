/**
 * Showcases ("واجهات العرض"): picture cards that slide on the home page. Each card opens its own
 * page with the products of a merchant, an investor, a category, a brand, or products picked by hand.
 *
 *   GET    /api/showcases               public: section settings + active cards (in order)
 *   GET    /api/showcases/:id           public: one active card (+ the picked products for "products")
 *   GET    /api/showcases/admin/all     dashboard: every card + section settings + lists for the selects
 *   POST   /api/showcases               dashboard: add
 *   PUT    /api/showcases/admin/order   dashboard: save the order { ids: [...] }
 *   PUT    /api/showcases/admin/section dashboard: section title / speed / on-off
 *   PUT    /api/showcases/:id           dashboard: edit
 *   DELETE /api/showcases/:id           dashboard: delete
 * Dashboard routes: super admin or the "manage categories" permission.
 */
const express = require('express');
const router = express.Router();
const db = require('../database/db');
const { authenticate, requirePermission } = require('../middleware/auth');
const { logActivity } = require('../utils/activityLogger');

const LINK_TYPES = ['merchant', 'investor', 'category', 'brand', 'products'];
const SPEEDS = ['slow', 'normal', 'fast'];
const SECTION_DEFAULTS = { enabled: true, title: 'تسوّق حسب المتجر', subtitle: 'اختار المتجر أو القسم اللي يناسبك', speed: 'normal' };
const canManage = [authenticate, requirePermission('canManageCategories')];

const str = (v, max) => String(v === undefined || v === null ? '' : v).trim().slice(0, max);
// Only our own uploads or a normal https link (never javascript:, data:, etc.)
const imageUrl = v => {
  const s = str(v, 500);
  if (!s) return '';
  if (/^\/uploads\/[\w.\-]+$/.test(s) || /^\/images\/[\w.\-\/]+$/.test(s) || /^https:\/\/[^\s"'<>]+$/i.test(s)) return s;
  return null;
};

async function getSection() {
  const s = (await db.settings.getAll())[0] || {};
  return { ...SECTION_DEFAULTS, ...(s.showcaseSection || {}) };
}

// Check the card data. Returns { error } or { data }.
async function validate(body) {
  const title = str(body.title, 80);
  if (!title) return { error: 'اكتب اسم الواجهة' };
  const linkType = LINK_TYPES.includes(body.linkType) ? body.linkType : null;
  if (!linkType) return { error: 'اختار الواجهة مربوطة بإيه (تاجر / مستثمر / قسم / ماركة / منتجات)' };

  const images = {};
  for (const k of ['image', 'logo', 'banner']) {
    const u = imageUrl(body[k]);
    if (u === null) return { error: 'رابط الصورة لازم يكون صورة مرفوعة على المتجر أو رابط يبدأ بـ https://' };
    images[k] = u;
  }
  if (!images.image) return { error: 'ارفع صورة الكارت' };

  let linkValue = str(body.linkValue, 120);
  let linkLabel = '';
  let productIds = [];
  if (linkType === 'merchant') {
    const m = linkValue && (await db.merchants.getById(linkValue));
    if (!m) return { error: 'اختار التاجر' };
    linkLabel = m.name || m.code || '';
  } else if (linkType === 'investor') {
    const inv = linkValue && (await db.investors.getById(linkValue));
    if (!inv) return { error: 'اختار المستثمر' };
    linkLabel = inv.name || inv.code || '';
  } else if (linkType === 'category') {
    const c = linkValue && (await db.categories.getById(linkValue));
    if (!c) return { error: 'اختار القسم' };
    linkLabel = c.name || '';
  } else if (linkType === 'brand') {
    const b = linkValue && (await db.brands.findOne(x => String(x.id) === linkValue || x.name === linkValue));
    if (!b) return { error: 'اختار الماركة' };
    linkValue = String(b.id);
    linkLabel = b.name || '';
  } else if (linkType === 'products') {
    const ids = Array.isArray(body.productIds) ? body.productIds.map(x => str(x, 80)).filter(Boolean) : [];
    productIds = [...new Set(ids)].slice(0, 60);
    const found = [];
    for (const id of productIds) if (await db.products.getById(id)) found.push(id);
    if (!found.length) return { error: 'اختار منتج واحد على الأقل' };
    productIds = found;
    linkValue = '';
  }

  return {
    data: {
      title,
      subtitle: str(body.subtitle, 160),
      ...images,
      linkType,
      linkValue,
      linkLabel,
      productIds,
      isActive: body.isActive !== false && body.isActive !== 'false'
    }
  };
}

// The /api/products filter that lists a card's products
function productQuery(card, brandName) {
  if (card.linkType === 'merchant') return card.merchantCode ? { merchantCode: card.merchantCode } : null;
  if (card.linkType === 'investor') return { investorId: card.linkValue };
  if (card.linkType === 'category') return { category: card.linkValue };
  if (card.linkType === 'brand') return brandName ? { brand: brandName } : null;
  return null;
}

async function publicCard(card) {
  const out = { ...card };
  if (card.linkType === 'merchant') {
    const m = await db.merchants.getById(card.linkValue);
    out.merchantCode = m ? m.code : '';
  }
  let brandName = '';
  if (card.linkType === 'brand') {
    const b = await db.brands.getById(card.linkValue);
    brandName = b ? b.name : '';
  }
  out.productQuery = productQuery(out, brandName);
  delete out.merchantCode;
  return out;
}

// ---------- public ----------
router.get('/', async (req, res) => {
  try {
    const section = await getSection();
    if (!section.enabled) return res.json({ success: true, section, showcases: [] });
    const cards = (await db.showcases.find(c => c.isActive !== false)).sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0));
    res.json({ success: true, section, showcases: cards.map(c => ({ id: c.id, title: c.title, subtitle: c.subtitle, image: c.image, logo: c.logo, linkType: c.linkType })) });
  } catch (err) {
    res.status(500).json({ success: false, message: 'فشل تحميل واجهات العرض' });
  }
});

// ---------- dashboard (registered before "/:id") ----------
router.get('/admin/all', ...canManage, async (req, res) => {
  try {
    const [cards, section, merchants, investors, categories, brands] = await Promise.all([
      db.showcases.getAll(), getSection(), db.merchants.getAll(), db.investors.getAll(), db.categories.getAll(), db.brands.getAll()
    ]);
    cards.sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0));
    res.json({
      success: true,
      section,
      showcases: cards,
      options: {
        merchants: merchants.map(m => ({ id: m.id, name: m.name || m.code, code: m.code, logo: m.logo || '' })),
        investors: investors.map(i => ({ id: i.id, name: i.name || i.code, code: i.code })),
        categories: categories.map(c => ({ id: c.id, name: c.name, image: c.image || '' })),
        brands: brands.map(b => ({ id: b.id, name: b.name, logo: b.logo || '' }))
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'فشل تحميل واجهات العرض' });
  }
});

router.put('/admin/section', ...canManage, async (req, res) => {
  try {
    const section = {
      enabled: req.body.enabled !== false && req.body.enabled !== 'false',
      title: str(req.body.title, 80) || SECTION_DEFAULTS.title,
      subtitle: str(req.body.subtitle, 160),
      speed: SPEEDS.includes(req.body.speed) ? req.body.speed : 'normal'
    };
    const s = (await db.settings.getAll())[0];
    if (s) await db.settings.update(s.id, { showcaseSection: section }); else await db.settings.insert({ id: 'store_settings', showcaseSection: section });
    res.json({ success: true, message: 'تم حفظ إعدادات القسم', section });
  } catch (err) {
    res.status(500).json({ success: false, message: 'فشل حفظ إعدادات القسم' });
  }
});

router.put('/admin/order', ...canManage, async (req, res) => {
  try {
    const ids = Array.isArray(req.body.ids) ? req.body.ids.map(String) : [];
    if (!ids.length) return res.status(400).json({ success: false, message: 'مفيش ترتيب' });
    await db.atomic(t => { ids.forEach((id, i) => { if (t.showcases.getById(id)) t.showcases.update(id, { orderIndex: i }); }); });
    res.json({ success: true, message: 'تم حفظ الترتيب' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'فشل حفظ الترتيب' });
  }
});

router.post('/', ...canManage, async (req, res) => {
  try {
    const v = await validate(req.body);
    if (v.error) return res.status(400).json({ success: false, message: v.error });
    const last = (await db.showcases.getAll()).reduce((m, c) => Math.max(m, Number(c.orderIndex) || 0), -1);
    const card = await db.showcases.insert({ ...v.data, orderIndex: last + 1, createdBy: req.user.name });
    await logActivity({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'CREATE_SHOWCASE', module: 'showcases', details: `أضاف واجهة عرض "${card.title}"` });
    res.status(201).json({ success: true, message: 'تمت إضافة الواجهة', showcase: card });
  } catch (err) {
    res.status(500).json({ success: false, message: 'فشل إضافة الواجهة' });
  }
});

router.put('/:id', ...canManage, async (req, res) => {
  try {
    const existing = await db.showcases.getById(req.params.id);
    if (!existing) return res.status(404).json({ success: false, message: 'الواجهة غير موجودة' });
    const v = await validate({ ...existing, ...req.body });
    if (v.error) return res.status(400).json({ success: false, message: v.error });
    const card = await db.showcases.update(existing.id, { ...v.data, updatedBy: req.user.name });
    await logActivity({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'UPDATE_SHOWCASE', module: 'showcases', details: `عدّل واجهة العرض "${card.title}"` });
    res.json({ success: true, message: 'تم حفظ الواجهة', showcase: card });
  } catch (err) {
    res.status(500).json({ success: false, message: 'فشل حفظ الواجهة' });
  }
});

router.delete('/:id', ...canManage, async (req, res) => {
  try {
    const deleted = await db.showcases.delete(req.params.id);
    if (!deleted) return res.status(404).json({ success: false, message: 'الواجهة غير موجودة' });
    await logActivity({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'DELETE_SHOWCASE', module: 'showcases', details: `حذف واجهة العرض "${deleted.title}"` });
    res.json({ success: true, message: 'تم حذف الواجهة' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'فشل حذف الواجهة' });
  }
});

// ---------- public: one card (last, so it never catches "/admin/...") ----------
router.get('/:id', async (req, res) => {
  try {
    const card = await db.showcases.getById(req.params.id);
    if (!card || card.isActive === false) return res.status(404).json({ success: false, message: 'الواجهة غير موجودة' });
    const out = await publicCard(card);
    if (card.linkType === 'products') {
      const products = [];
      for (const id of card.productIds || []) {
        const p = await db.products.getById(id);
        if (p && p.isActive !== false) products.push(p);
      }
      out.products = products;
    }
    delete out.createdBy; delete out.updatedBy;
    res.json({ success: true, showcase: out });
  } catch (err) {
    res.status(500).json({ success: false, message: 'فشل تحميل الواجهة' });
  }
});

module.exports = router;
