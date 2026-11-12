const express = require('express');
const router = express.Router();
const fs = require('fs');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const upload = require('../middleware/upload');
const db = require('../database/db');
const { authenticate, optionalAuth, requirePermission, isSuperAdmin } = require('../middleware/auth');
const { logActivity } = require('../utils/activityLogger');
const { isInvestorOwned } = require('../utils/ownershipHelper');
const { applyCapitalChange, newCapitalBatch, productCost, getCapitalBatches } = require('../utils/financeEngine');
const { sanitizeVariants, sumVariantStock } = require('../utils/variants');

// Enforce strict single-owner assignment (either Investor OR Merchant OR Store direct — never both)
async function resolveExclusiveOwnership(body = {}, reqUser = {}, fallbackExisting = null) {
  if (reqUser && reqUser.role === 'merchant') {
    return {
      ownerType: 'merchant',
      merchantId: reqUser.merchantId || null,
      merchantCode: (reqUser.merchantCode || '').trim().toUpperCase(),
      merchantName: (reqUser.name || '').trim(),
      investorId: null,
      investorCode: '',
      investorName: ''
    };
  }

  const reqOwnerType = body.ownerType;
  const reqInvId = body.investorId !== undefined ? body.investorId : (fallbackExisting?.investorId || null);
  const reqInvCode = body.investorCode !== undefined ? String(body.investorCode || '').trim().toUpperCase() : (fallbackExisting?.investorCode || '');
  const reqInvName = body.investorName !== undefined ? String(body.investorName || '').trim() : (fallbackExisting?.investorName || '');

  const reqMerchId = body.merchantId !== undefined ? body.merchantId : (fallbackExisting?.merchantId || null);
  const reqMerchCode = body.merchantCode !== undefined ? String(body.merchantCode || '').trim().toUpperCase() : (fallbackExisting?.merchantCode || '');
  const reqMerchName = body.merchantName !== undefined ? String(body.merchantName || '').trim() : (fallbackExisting?.merchantName || '');

  const chooseInvestor =
    reqOwnerType === 'investor' ||
    (reqOwnerType !== 'merchant' && reqOwnerType !== 'store' && Boolean(reqInvId || reqInvCode));

  if (chooseInvestor && (reqInvId || reqInvCode)) {
    let inv = reqInvId ? await db.investors.getById(reqInvId) : null;
    if (!inv && reqInvCode) {
      inv = await db.investors.findOne(i => i.code && i.code.trim().toUpperCase() === reqInvCode);
    }
    return {
      ownerType: 'investor',
      investorId: inv ? inv.id : (reqInvId || null),
      investorCode: inv ? inv.code : reqInvCode,
      investorName: inv ? inv.name : reqInvName,
      merchantId: null,
      merchantCode: '',
      merchantName: ''
    };
  }

  const chooseMerchant =
    reqOwnerType === 'merchant' ||
    (reqOwnerType !== 'store' && Boolean(reqMerchId || reqMerchCode));

  if (chooseMerchant && (reqMerchId || reqMerchCode || reqMerchName)) {
    let merch = reqMerchId ? await db.merchants.getById(reqMerchId) : null;
    if (!merch && reqMerchCode) {
      merch = await db.merchants.findOne(m => m.code && m.code.trim().toLowerCase() === reqMerchCode.toLowerCase());
    }
    return {
      ownerType: 'merchant',
      merchantId: merch ? merch.id : (reqMerchId || null),
      merchantCode: merch ? merch.code : reqMerchCode,
      merchantName: merch ? merch.name : reqMerchName,
      investorId: null,
      investorCode: '',
      investorName: ''
    };
  }

  return {
    ownerType: 'store',
    merchantId: null,
    merchantCode: '',
    merchantName: '',
    investorId: null,
    investorCode: '',
    investorName: ''
  };
}

// Helper: Normalize Arabic text for robust search (handling alif variants, ta marbuta, yaa, and diacritics)
function normalizeArabic(text) {
  if (!text) return '';
  return String(text)
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '') // remove tashkeel and tatweel
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .trim();
}

// Validate money / quantity fields. Only fields that are present are checked.
// Returns an Arabic error message, or null when everything is valid.
function validateProductNumbers({ price, stock, compareAtPrice, shippingCost, costPrice } = {}) {
  const has = v => v !== undefined && v !== null && v !== '';
  const num = v => Number(String(v).trim());
  if (has(price)) {
    const p = num(price);
    if (!Number.isFinite(p) || p <= 0) return 'سعر البيع يجب أن يكون رقماً أكبر من صفر';
  }
  if (has(stock)) {
    const s = num(stock);
    if (!Number.isFinite(s) || s < 0) return 'المخزون يجب أن يكون رقماً (صفر أو أكثر)';
  }
  if (has(compareAtPrice)) {
    const c = num(compareAtPrice);
    if (!Number.isFinite(c) || c < 0) return 'السعر قبل الخصم يجب أن يكون رقماً موجباً';
    if (has(price) && c > 0 && c < num(price)) return 'السعر قبل الخصم يجب أن يكون أكبر من سعر البيع';
  }
  if (has(shippingCost)) {
    const sc = num(shippingCost);
    if (!Number.isFinite(sc) || sc < 0) return 'تكلفة الشحن يجب أن تكون صفراً أو أكثر';
  }
  if (has(costPrice)) {
    const cp = num(costPrice);
    if (!Number.isFinite(cp) || cp < 0) return 'سعر التكلفة يجب أن يكون صفراً أو أكثر';
  }
  return null;
}

// SKU / barcode / weight / per-option stock. Only fields present in the body are returned.
// Returns { error } or { fields }.
async function readExtraProductFields(body = {}, currentId = null) {
  const fields = {};
  const str = v => String(v === undefined || v === null ? '' : v).trim();
  if (body.sku !== undefined) {
    fields.sku = str(body.sku).toUpperCase().slice(0, 64);
    if (fields.sku) {
      const clash = await db.products.findOne(p => String(p.id) !== String(currentId) && str(p.sku).toUpperCase() === fields.sku);
      if (clash) return { error: `كود SKU "${fields.sku}" مستخدم بالفعل للمنتج "${clash.title}"` };
    }
  }
  if (body.barcode !== undefined) {
    fields.barcode = str(body.barcode).slice(0, 64);
    if (fields.barcode && !/^[0-9A-Za-z\-]+$/.test(fields.barcode)) return { error: 'الباركود لازم يكون أرقام/حروف إنجليزي بس' };
  }
  if (body.weightKg !== undefined) {
    if (str(body.weightKg) === '') fields.weightKg = null;
    else {
      const w = Number(body.weightKg);
      if (!Number.isFinite(w) || w < 0 || w > 1000) return { error: 'الوزن لازم يكون رقم بالكيلو (من 0 لـ 1000)' };
      fields.weightKg = Math.round(w * 1000) / 1000;
    }
  }
  if (body.variants !== undefined) {
    const { variants, error } = sanitizeVariants(body.variants);
    if (error) return { error };
    fields.variants = variants;
    // With options, the product stock is always the total of the options
    if (variants.length) fields.stock = sumVariantStock(variants);
  }
  return { fields };
}

// SECURITY: fields customers and visitors must never receive
const PRIVATE_COST_FIELDS = ['costPrice', 'basePrice', 'merchantPrice'];
const PRIVATE_OWNER_FIELDS = ['commissionRate', 'merchantName', 'merchantCode', 'merchantId',
  'investorName', 'investorCode', 'investorId', 'ownerType', 'isBestSellerBackup'];

function isDashboardViewer(user) {
  return Boolean(user && user.role && user.role !== 'customer');
}

// Strip private fields. Cost fields are always removed here (callers that may show
// cost to super admins / the linked investor handle that separately).
function toPublicProduct(p, user = null) {
  if (!p || typeof p !== 'object') return p;
  const safe = { ...p };
  PRIVATE_COST_FIELDS.forEach(k => delete safe[k]);
  if (!isDashboardViewer(user)) PRIVATE_OWNER_FIELDS.forEach(k => delete safe[k]);
  return safe;
}

// Merchants only VIEW their products: the store enters the wholesale cost and sets the selling price.
function blockMerchantWrites(req, res, next) {
  if (req.user && req.user.role === 'merchant') {
    return res.status(403).json({ success: false, message: 'حساب التاجر للمشاهدة فقط. إضافة أو تعديل المنتجات بتتم من إدارة المتجر.' });
  }
  next();
}

// What a merchant may see of HIS product: wholesale cost, stock, options. Never the selling
// price, compare-at price, discount %, shipping prices or store/owner internals.
const MERCHANT_HIDDEN_FIELDS = ['price', 'compareAtPrice', 'discountPercent', 'shippingCost', 'customShippingCost',
  'governorateShipping', 'costPrice', 'basePrice', 'merchantPrice', 'commissionRate', 'investorId', 'investorCode',
  'investorName', 'isBestSellerBackup', 'bestSellerOrder', 'excludeFromBestSellers'];
function toMerchantProduct(p) {
  if (!p || typeof p !== 'object') return p;
  const safe = { ...p, wholesalePrice: productCost(p) };
  MERCHANT_HIDDEN_FIELDS.forEach(k => delete safe[k]);
  if (Array.isArray(safe.variants)) safe.variants = safe.variants.map(v => ({ id: v.id, options: v.options, stock: v.stock, sku: v.sku }));
  return safe;
}

// Helper to calculate rating statistics
async function attachRatingStats(product) {
  // Only approved reviews count; a product nobody rated has NO rating (null), not 5 stars.
  const reviews = await db.reviews.find(r => String(r.productId) === String(product.id) && (!r.status || r.status === 'approved'));
  const reviewCount = reviews.length;
  const ratingAverage = reviewCount > 0
    ? Number((reviews.reduce((acc, r) => acc + (Number(r.rating) || 0), 0) / reviewCount).toFixed(1))
    : null;

  return {
    ...product,
    reviewCount,
    ratingAverage
  };
}

// Live Autocomplete Suggestions (for search dropdown as user types)
router.get('/suggest', async (req, res) => {
  try {
    const rawQ = (req.query.q || '').trim();
    if (!rawQ || rawQ.length < 1) {
      return res.json({ success: true, suggestions: [] });
    }

    const normQ = normalizeArabic(rawQ);
    const products = await db.products.find(p => p.isActive !== false);
    const matches = products.filter(p => {
      const title = normalizeArabic(p.title || '');
      const desc = normalizeArabic(p.description || '');
      const tags = normalizeArabic(Array.isArray(p.tags) ? p.tags.join(' ') : '');
      const brand = normalizeArabic(p.brand || '');
      return title.includes(normQ) || desc.includes(normQ) || tags.includes(normQ) || brand.includes(normQ);
    }).slice(0, 8);

    const suggestions = matches.map(p => ({
      id: p.id,
      title: p.title,
      price: p.price,
      compareAtPrice: p.compareAtPrice || null,
      image: Array.isArray(p.images) && p.images.length > 0 ? p.images[0] : (p.image || ''),
      saleUnit: p.saleUnit || 'قطعة',
      brand: p.brand || ''
    }));

    res.json({ success: true, suggestions });
  } catch (err) {
    res.status(500).json({ success: false, message: 'خطأ في الاقتراحات' });
  }
});

// Featured Products
router.get('/featured', async (req, res) => {
  try {
    const products = await db.products.find(p => p.isActive !== false && p.isFeatured === true);
    const withStats = await Promise.all(products.map(attachRatingStats));
    res.json({ success: true, products: withStats.map(p => toPublicProduct(p)) });
  } catch (err) {
    res.status(500).json({ success: false, message: 'فشل جلب المنتجات المميزة' });
  }
});

// Latest Arrivals
router.get('/latest', async (req, res) => {
  try {
    const products = await db.products.find(p => p.isActive !== false);
    products.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    const latest = products.slice(0, 12);
    const withStats = await Promise.all(latest.map(attachRatingStats));
    res.json({ success: true, products: withStats.map(p => toPublicProduct(p)) });
  } catch (err) {
    res.status(500).json({ success: false, message: 'فشل جلب أحدث المنتجات' });
  }
});

// Get all products (Public with filters, search, sorting, and pagination max 40)
router.get('/', optionalAuth, async (req, res) => {
  try {
    const {
      q,
      category,
      subcategory,
      subcategoryId,
      brand,
      brandId,
      merchantCode,
      merchantName,
      merchant,
      investorId,
      investorCode,
      minPrice,
      maxPrice,
      hasDiscount,
      sort,
      includeInactive,
      lowStock,
      lowStockThreshold = 15,
      bestseller,
      page = 1,
      limit = 40
    } = req.query;

    let allRawProducts = await db.products.getAll();

    // If requester is an authenticated merchant, scope to their own products only
    if (req.user && req.user.role === 'merchant') {
      let mId = req.user.merchantId ? String(req.user.merchantId) : '';
      let mCode = (req.user.merchantCode || '').trim().toLowerCase();

      // Fallback: look up merchant record in db.merchants by userId or username
      if (!mId || !mCode) {
        const m = await db.merchants.findOne(x => (x.userId && x.userId === req.user.id) || (req.user.username && x.username === req.user.username));
        if (m) {
          if (!mId && m.id) mId = String(m.id);
          if (!mCode && m.code) mCode = m.code.trim().toLowerCase();
        }
      }

      if (!mId && !mCode) {
        allRawProducts = [];
      } else {
        allRawProducts = allRawProducts.filter(p => {
          if (isInvestorOwned(p)) return false;
          if (mId && p.merchantId) return String(p.merchantId) === mId;
          return mCode && p.merchantCode && p.merchantCode.trim().toLowerCase() === mCode;
        });
      }
    }

    // If requester is an authenticated investor, scope to their own products only
    if (req.user && req.user.role === 'investor') {
      let invId = req.user.investorId ? String(req.user.investorId) : '';
      let invCode = (req.user.investorCode || '').trim().toLowerCase();

      if (!invId || !invCode) {
        const inv = await db.investors.findOne(x => (x.userId && x.userId === req.user.id) || (req.user.username && x.username === req.user.username));
        if (inv) {
          if (!invId && inv.id) invId = String(inv.id);
          if (!invCode && inv.code) invCode = inv.code.trim().toLowerCase();
        }
      }

      if (!invId && !invCode) {
        allRawProducts = [];
      } else {
        allRawProducts = allRawProducts.filter(p => {
          if (!isInvestorOwned(p)) return false;
          if (p.investorId) return invId && String(p.investorId) === invId;
          return invCode && p.investorCode && p.investorCode.trim().toLowerCase() === invCode;
        });
      }
    }

    const thresholdNum = Number(lowStockThreshold) || 15;
    const totalAllCount = allRawProducts.length;
    const totalLowStockCount = allRawProducts.filter(p => Number(p.stock) <= thresholdNum).length;
    const totalBestSellersCount = allRawProducts.filter(p => p.isBestSeller === true || ((p.salesCount || 0) > 0 && p.excludeFromBestSellers !== true)).length;

    let products = allRawProducts;

    // Unless admin explicitly asks for inactive ones
    if (includeInactive !== 'true') {
      products = products.filter(p => p.isActive !== false);
    }

    // Filter low stock
    if (lowStock === 'true') {
      products = products.filter(p => Number(p.stock) <= thresholdNum);
    }

    // Filter bestseller
    if (bestseller === 'true') {
      products = products.filter(p => p.isBestSeller === true || ((p.salesCount || 0) > 0 && p.excludeFromBestSellers !== true));
    }

    // Filter by category
    if (category && category !== 'all') {
      products = products.filter(p => String(p.categoryId) === String(category));
    }

    // Filter by subcategory
    const targetSub = subcategoryId || subcategory;
    if (targetSub && targetSub !== 'all') {
      products = products.filter(p => 
        String(p.subcategoryId) === String(targetSub) || 
        String(p.subcategory) === String(targetSub)
      );
    }

    // Filter by brand (name or brandId)
    if (brand && brand !== 'all') {
      const bTarget = brand.toLowerCase();
      products = products.filter(p => p.brand && p.brand.toLowerCase() === bTarget);
    }
    if (brandId && brandId !== 'all') {
      products = products.filter(p => String(p.brandId) === String(brandId));
    }

    // Filter by merchant code or name (strictly exclude investor products)
    const targetMerchantCode = merchantCode || merchant;
    if (targetMerchantCode && targetMerchantCode !== 'all') {
      const codeTerm = targetMerchantCode.trim().toLowerCase();
      products = products.filter(p => !isInvestorOwned(p) && (
        (p.merchantCode && p.merchantCode.trim().toLowerCase() === codeTerm) ||
        (p.merchantName && normalizeArabic(p.merchantName).includes(normalizeArabic(codeTerm)))
      ));
    }
    if (merchantName && merchantName !== 'all') {
      const nameTerm = normalizeArabic(merchantName.trim());
      products = products.filter(p => !isInvestorOwned(p) && (
        p.merchantName && normalizeArabic(p.merchantName).includes(nameTerm)
      ));
    }

    // Filter by investor id or code
    if (investorId && investorId !== 'all') {
      products = products.filter(p => isInvestorOwned(p) && p.investorId && String(p.investorId) === String(investorId));
    }
    if (investorCode && investorCode !== 'all') {
      const invTerm = investorCode.trim().toLowerCase();
      products = products.filter(p => isInvestorOwned(p) && p.investorCode && p.investorCode.trim().toLowerCase() === invTerm);
    }

    // Filter by text search (matches title, description, tags, brand, merchant code, merchant name)
    if (q && q.trim()) {
      const term = normalizeArabic(q);
      products = products.filter(p => {
        const title = normalizeArabic(p.title || '');
        const desc = normalizeArabic(p.description || '');
        const tags = normalizeArabic(Array.isArray(p.tags) ? p.tags.join(' ') : '');
        const pBrand = normalizeArabic(p.brand || '');
        const mCode = normalizeArabic(p.merchantCode || '');
        const mName = normalizeArabic(p.merchantName || '');
        return title.includes(term) || desc.includes(term) || tags.includes(term) || pBrand.includes(term) || mCode.includes(term) || mName.includes(term);
      });
    }

    // Filter by price
    if (minPrice) {
      products = products.filter(p => (p.price || 0) >= Number(minPrice));
    }
    if (maxPrice) {
      products = products.filter(p => (p.price || 0) <= Number(maxPrice));
    }

    // Filter discount
    if (hasDiscount === 'true') {
      products = products.filter(p => p.compareAtPrice && p.compareAtPrice > p.price);
    }

    let withStats = await Promise.all(products.map(attachRatingStats));

    // Sort
    switch (sort) {
      case 'price_asc':
        withStats.sort((a, b) => (a.price || 0) - (b.price || 0));
        break;
      case 'price_desc':
        withStats.sort((a, b) => (b.price || 0) - (a.price || 0));
        break;
      case 'rating':
        // Rated products first (by average, then number of reviews); unrated products last
        withStats.sort((a, b) => ((b.ratingAverage || 0) - (a.ratingAverage || 0)) || ((b.reviewCount || 0) - (a.reviewCount || 0)));
        break;
      case 'discount':
        withStats.sort((a, b) => {
          const discA = a.compareAtPrice ? ((a.compareAtPrice - a.price) / a.compareAtPrice) : 0;
          const discB = b.compareAtPrice ? ((b.compareAtPrice - b.price) / b.compareAtPrice) : 0;
          return discB - discA;
        });
        break;
      case 'newest':
      default:
        withStats.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        break;
    }

    const totalCount = withStats.length;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 40));
    const totalPages = Math.ceil(totalCount / limitNum) || 1;
    const startIndex = (pageNum - 1) * limitNum;
    const paginatedProducts = withStats.slice(startIndex, startIndex + limitNum);

    // Cost price privacy rule:
    // Super admin sees cost price on all products.
    // Investor sees cost price ONLY on their linked products.
    // Staff, normal users, and public visitors MUST NEVER see costPrice / basePrice / merchantPrice.
    const isSuper = isSuperAdmin(req.user);
    const isInvestorUser = req.user && req.user.role === 'investor';
    const userInvId = (req.user && req.user.investorId) ? String(req.user.investorId) : '';
    const userInvCode = (req.user && req.user.investorCode) ? req.user.investorCode.trim().toLowerCase() : '';

    const sanitizedProducts = paginatedProducts.map(p => {
      // Merchants (already limited to their own products above) see wholesale cost ONLY
      if (req.user && req.user.role === 'merchant') return toMerchantProduct(p);
      let canViewCost = isSuper;
      if (!canViewCost && isInvestorUser) {
        if ((userInvId && p.investorId && String(p.investorId) === userInvId) ||
            (userInvCode && p.investorCode && p.investorCode.trim().toLowerCase() === userInvCode)) {
          canViewCost = true;
        }
      }

      if (!canViewCost) {
        return toPublicProduct(p, req.user);
      }
      return p;
    });

    res.json({
      success: true,
      count: totalCount,
      totalAll: totalAllCount,
      totalLowStock: totalLowStockCount,
      totalBestSellers: totalBestSellersCount,
      page: pageNum,
      limit: limitNum,
      totalPages,
      hasMore: pageNum < totalPages,
      products: sanitizedProducts
    });
  } catch (err) {
    console.error('Fetch products error:', err);
    res.status(500).json({ success: false, message: 'حدث خطأ أثناء جلب المنتجات' });
  }
});

// Get related products for a product
router.get('/:id/related', async (req, res) => {
  try {
    const { id } = req.params;
    const product = await db.products.getById(id);
    if (!product) {
      return res.status(404).json({ success: false, message: 'المنتج غير موجود' });
    }

    const subId = product.subcategoryId || product.subcategory;
    const allActive = await db.products.find(p => String(p.id) !== String(id) && p.isActive !== false);

    const sameSub = subId 
      ? allActive.filter(p => (String(p.subcategoryId) === String(subId) || String(p.subcategory) === String(subId)))
      : [];

    const sameBrand = product.brand 
      ? allActive.filter(p => p.brand && p.brand.toLowerCase() === product.brand.toLowerCase() && !sameSub.some(s => s.id === p.id))
      : [];

    const sameCat = product.categoryId 
      ? allActive.filter(p => String(p.categoryId) === String(product.categoryId) && !sameSub.some(s => s.id === p.id) && !sameBrand.some(b => b.id === p.id))
      : [];

    const combinedSimilar = [...sameSub, ...sameBrand, ...sameCat].slice(0, 10);
    const related = await Promise.all(combinedSimilar.map(attachRatingStats));

    res.json({ success: true, relatedProducts: related.map(p => toPublicProduct(p)) });
  } catch (err) {
    res.status(500).json({ success: false, message: 'فشل جلب المنتجات المشابهة' });
  }
});

// Public: Get Best Selling Products (Active & in-stock only)
router.get('/best-sellers', async (req, res) => {
  try {
    const products = await db.products.getAll();
    // A product qualifies if:
    // 1. In stock (> 0) and active
    // 2. Not explicitly excluded (excludeFromBestSellers !== true)
    // 3. Either explicitly pinned as isBestSeller === true OR has salesCount > 0
    let activeBestSellers = products.filter(p => {
      if (p.isActive === false || (p.stock || 0) <= 0) return false;
      if (p.excludeFromBestSellers === true) return false;
      return p.isBestSeller === true || (p.salesCount || 0) > 0;
    });

    // If no products have sales yet, fallback to active products with stock that are not excluded
    if (activeBestSellers.length === 0) {
      activeBestSellers = products.filter(p => p.isActive !== false && (p.stock || 0) > 0 && p.excludeFromBestSellers !== true);
    }

    // Sort by bestSellerOrder first, then salesCount descending, then rating
    activeBestSellers.sort((a, b) => {
      if ((a.bestSellerOrder || 0) > 0 && (b.bestSellerOrder || 0) > 0) {
        return (a.bestSellerOrder || 0) - (b.bestSellerOrder || 0);
      }
      if ((a.bestSellerOrder || 0) > 0) return -1;
      if ((b.bestSellerOrder || 0) > 0) return 1;
      return (b.salesCount || 0) - (a.salesCount || 0);
    });

    res.json({
      success: true,
      count: activeBestSellers.length,
      products: activeBestSellers.slice(0, 30).map(p => toPublicProduct(p))
    });
  } catch (err) {
    console.error('Get best sellers error:', err);
    res.status(500).json({ success: false, message: 'فشل جلب المنتجات الأكثر مبيعاً' });
  }
});

// Get single product details + related products
router.get('/:id', optionalAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const product = await db.products.getById(id);

    if (!product) {
      return res.status(404).json({ success: false, message: 'المنتج غير موجود' });
    }

    const productWithStats = await attachRatingStats(product);

    // Fetch category info
    let category = null;
    if (product.categoryId) {
      category = await db.categories.getById(product.categoryId);
    }

    // Fetch reviews
    // Only approved reviews are public; never expose reviewer user ids
    const reviews = (await db.reviews.find(r => String(r.productId) === String(id) && (!r.status || r.status === 'approved')))
      .map(r => ({ id: r.id, userName: r.userName, userAvatar: r.userAvatar, rating: r.rating, comment: r.comment,
        isVerifiedPurchase: r.isVerifiedPurchase, adminReply: r.adminReply || '', createdAt: r.createdAt }));
    reviews.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    // Fetch subcategory info if available
    let subcategory = null;
    const subId = product.subcategoryId || product.subcategory;
    if (subId) {
      subcategory = await db.subcategories.findOne(s => String(s.id) === String(subId) || s.name === subId);
    }

    // Fetch up to 10 similar products (Prioritized: same subcategory -> same brand -> same category)
    let related = [];
    const allActive = await db.products.find(p => String(p.id) !== String(id) && p.isActive !== false);
    
    const sameSub = subId 
      ? allActive.filter(p => (String(p.subcategoryId) === String(subId) || String(p.subcategory) === String(subId)))
      : [];

    const sameBrand = product.brand
      ? allActive.filter(p => p.brand && p.brand.toLowerCase() === product.brand.toLowerCase() && !sameSub.some(s => s.id === p.id))
      : [];

    const sameCat = product.categoryId
      ? allActive.filter(p => String(p.categoryId) === String(product.categoryId) && !sameSub.some(s => s.id === p.id) && !sameBrand.some(b => b.id === p.id))
      : [];

    const combinedSimilar = [...sameSub, ...sameBrand, ...sameCat].slice(0, 10);
    related = await Promise.all(combinedSimilar.map(attachRatingStats));

    const finalProductData = {
      ...productWithStats,
      category,
      subcategory,
      reviews,
      related
    };

    // Cost price privacy rule:
    // Only Super Admin or the specific linked investor can view cost price
    const isSuper = isSuperAdmin(req.user);
    let canViewCost = isSuper;
    if (!canViewCost && req.user && req.user.role === 'investor') {
      const userInvId = req.user.investorId ? String(req.user.investorId) : '';
      const userInvCode = req.user.investorCode ? req.user.investorCode.trim().toLowerCase() : '';
      if ((userInvId && product.investorId && String(product.investorId) === userInvId) ||
          (userInvCode && product.investorCode && product.investorCode.trim().toLowerCase() === userInvCode)) {
        canViewCost = true;
      }
    }

    let responseProduct = finalProductData;
    if (!canViewCost) {
      responseProduct = toPublicProduct(finalProductData, req.user);
    }
    if (Array.isArray(responseProduct.related)) {
      responseProduct.related = responseProduct.related.map(rp => toPublicProduct(rp, req.user));
    }
    // Reviews: never expose reviewer emails / phones publicly
    if (Array.isArray(responseProduct.reviews)) {
      responseProduct.reviews = responseProduct.reviews.map(({ userEmail, email, phone, userPhone, ...r }) => r);
    }

    res.json({
      success: true,
      product: responseProduct
    });
  } catch (err) {
    console.error('Product detail error:', err);
    res.status(500).json({ success: false, message: 'فشل جلب تفاصيل المنتج' });
  }
});

// Admin: Smart AI Upload & Parse from Image, PDF, or Document
router.post('/smart-upload-parse', authenticate, requirePermission('canManageProducts'), blockMerchantWrites, (req, res, next) => {
  upload.single('file')(req, res, (err) => {
    if (err) {
      return res.status(400).json({ success: false, message: err.message || 'فشل رفع المستند' });
    }
    next();
  });
}, async (req, res) => {
  try {
    const file = req.file;
    const rawText = req.body.rawText || '';
    let presets = {};
    if (req.body.presets) {
      try {
        presets = typeof req.body.presets === 'string' ? JSON.parse(req.body.presets) : req.body.presets;
      } catch (e) {
        presets = {};
      }
    }

    const categories = await db.categories.getAll();
    const subcategories = db.subcategories ? await db.subcategories.getAll() : [];

    const fileBuffer = file ? fs.readFileSync(file.path) : null;
    const mimeType = file?.mimetype || '';

    const SmartProductExtractor = require('../utils/smartProductExtractor');
    const result = await SmartProductExtractor.extract({
      fileBuffer,
      filePath: file?.path,
      originalName: file?.originalname,
      mimeType,
      rawText,
      presets,
      categories,
      subcategories
    });

    res.json(result);
  } catch (err) {
    console.error('Smart AI upload parse error:', err);
    res.status(500).json({ success: false, message: 'حدث خطأ أثناء معالجة المستند بالذكاء الاصطناعي: ' + err.message });
  } finally {
    const file = req.file;
    if (file && file.path && fs.existsSync(file.path)) {
      try { fs.unlinkSync(file.path); } catch (e) {}
    }
  }
});

// Admin: Bulk Create Products linked to Merchant or Investor
router.post('/bulk', authenticate, requirePermission('canManageProducts'), blockMerchantWrites, async (req, res) => {
  try {
    const { 
      ownerType, 
      merchantCode, 
      merchantName, 
      investorCode, 
      investorName, 
      investorId, 
      ownerCode, 
      ownerName, 
      products 
    } = req.body;

    if (!Array.isArray(products) || products.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'يجب إضافة منتج واحد على الأقل في الشيت'
      });
    }

    // Strict exclusive ownership: Investor ONLY or Merchant ONLY
    const isInvestor = ownerType === 'investor'
      ? true
      : (ownerType === 'merchant' ? false : (Boolean(investorCode || investorId) && !merchantCode));

    let cleanMerchantCode = '';
    let cleanMerchantName = '';
    let merchant = null;

    let cleanInvestorCode = '';
    let cleanInvestorName = '';
    let finalInvestorId = null;
    let capitalBatchForUpload = null;
    let generatedInvestorLogin = null;

    if (isInvestor) {
      cleanInvestorCode = (investorCode || ownerCode || '').trim().toUpperCase();
      cleanInvestorName = (investorName || ownerName || '').trim();

      if (!cleanInvestorCode || !cleanInvestorName) {
        return res.status(400).json({
          success: false,
          message: 'كود المستثمر واسم المستثمر مطلوبان لرفع المنتجات الجماعية'
        });
      }

      // Mandatory Capital check for investor
      const rawCapital = req.body.capital !== undefined && req.body.capital !== '' ? Number(req.body.capital) : null;
      if (rawCapital === null || isNaN(rawCapital) || rawCapital <= 0) {
        return res.status(400).json({
          success: false,
          message: 'رأس المال إجباري للمستثمر ويجب أن يكون رقماً أكبر من صفر'
        });
      }

      // Investor sheet rule: every row needs a cost price (> 0) and a whole quantity (≥ 1),
      // and the capital of this upload must equal Σ (cost price × quantity). No guessing from the sale price.
      const sheetProblems = [];
      let totalInventoryCost = 0;
      products.forEach((p, idx) => {
        const label = `المنتج #${idx + 1}${p.title ? ` (${p.title})` : ''}`;
        const rawCost = p.costPrice !== undefined && p.costPrice !== '' ? p.costPrice : p.basePrice;
        const pCost = rawCost === undefined || rawCost === '' || rawCost === null ? NaN : Number(rawCost);
        const pStock = p.stock === undefined || p.stock === '' || p.stock === null ? NaN : Number(p.stock);
        if (!Number.isFinite(pCost) || pCost <= 0) sheetProblems.push(`${label}: سعر التكلفة إجباري لمنتجات المستثمر`);
        if (!Number.isInteger(pStock) || pStock < 1) sheetProblems.push(`${label}: الكمية إجبارية (رقم صحيح 1 أو أكثر)`);
        if (Number.isFinite(pCost) && Number.isFinite(pStock)) totalInventoryCost += pCost * pStock;
      });
      if (sheetProblems.length) {
        return res.status(400).json({ success: false, message: 'الشيت ناقص بيانات، ومفيش أي حاجة اتحفظت ولا رأس المال اتغيّر', errors: sheetProblems });
      }
      totalInventoryCost = Math.round(totalInventoryCost * 100) / 100;

      if (Math.abs(totalInventoryCost - rawCapital) >= 1) {
        const diff = Math.round(Math.abs(rawCapital - totalInventoryCost) * 100) / 100;
        const direction = totalInventoryCost > rawCapital ? 'تجاوز رأس المال' : 'أقل من رأس المال';
        return res.status(400).json({
          success: false,
          message: `رأس المال لازم يساوي تكلفة بضاعة الشيت (سعر التكلفة × الكمية) = ${totalInventoryCost} ج.م، والمكتوب ${rawCapital} ج.م. الفارق: ${diff} ج.م (${direction}).`,
          requiredCapital: totalInventoryCost
        });
      }

      // Validate every row BEFORE touching capital, so a bad sheet never changes the investor's capital
      const preErrors = [];
      products.forEach((p, idx) => {
        if (!p.title || p.price === undefined || p.price === '') preErrors.push(`المنتج #${idx + 1}: عنوان المنتج وسعر البيع مطلوبان`);
        else {
          const e = validateProductNumbers({ price: p.price, stock: p.stock, costPrice: p.costPrice });
          if (e) preErrors.push(`المنتج #${idx + 1} (${p.title}): ${e}`);
        }
      });
      if (preErrors.length) {
        return res.status(400).json({ success: false, message: 'يوجد أخطاء في الشيت، لم يتم حفظ أي منتج ولم يتغير رأس المال', errors: preErrors });
      }

      let investor = null;
      if (investorId) {
        investor = await db.investors.getById(investorId);
      }
      if (!investor && cleanInvestorCode) {
        investor = await db.investors.findOne(i => i.code && i.code.toUpperCase() === cleanInvestorCode);
      }
      if (!investor && cleanInvestorName) {
        investor = await db.investors.findOne(i => i.name && i.name.trim().toLowerCase() === cleanInvestorName.toLowerCase());
      }

      if (investor) {
        finalInvestorId = investor.id;
        cleanInvestorCode = investor.code || cleanInvestorCode;
        cleanInvestorName = investor.name || cleanInvestorName;

        // Capital is NEVER overwritten: either a new separate batch, or added to an existing batch
        const capitalMode = req.body.capitalMode === 'add' ? 'add' : 'new';
        let change;
        try {
          change = applyCapitalChange(investor, {
            mode: capitalMode,
            amount: rawCapital,
            batchId: req.body.capitalBatchId,
            label: req.body.capitalBatchLabel,
            note: `رفع شيت منتجات (${products.length} منتج)`,
            user: req.user
          });
        } catch (capErr) {
          return res.status(capErr.status || 400).json({ success: false, message: capErr.message });
        }
        capitalBatchForUpload = change.batch;
        await db.investors.update(investor.id, {
          capitalBatches: change.capitalBatches,
          capital: change.capital,
          lastUploadAt: new Date().toISOString()
        });
      } else {
        // Auto-register NEW investor in db.investors and linked user account in db.users
        const newInvId = uuidv4();
        const newUserId = uuidv4();
        const cleanUsername = cleanInvestorCode.toLowerCase().replace(/[^a-z0-9]/g, '') || `inv_${Date.now().toString().slice(-4)}`;
        // SECURITY: random one-time password shown to the admin once (never a shared default, never stored readable)
        const defaultPass = require('crypto').randomBytes(9).toString('base64').replace(/[^a-zA-Z0-9]/g, '').slice(0, 10) + '#7';
        generatedInvestorLogin = { username: cleanUsername, password: defaultPass };
        const hashedPass = await bcrypt.hash(defaultPass, 10);

        await db.users.insert({
          id: newUserId,
          name: cleanInvestorName,
          email: `${cleanUsername}@investor.suki.store`,
          username: cleanUsername,
          phone: (req.body.phone || '').trim(),
          whatsappPhone: (req.body.phone || '').trim(),
          password: hashedPass,
          role: 'investor',
          investorId: newInvId,
          investorCode: cleanInvestorCode,
          isActive: true,
          canEditProducts: false,
          createdAt: new Date().toISOString()
        });

        investor = await db.investors.insert({
          id: newInvId,
          userId: newUserId,
          code: cleanInvestorCode,
          name: cleanInvestorName,
          username: cleanUsername,
          phone: (req.body.phone || '').trim(),
          whatsapp: (req.body.phone || '').trim(),
          capital: rawCapital,
          capitalBatches: [(capitalBatchForUpload = newCapitalBatch(rawCapital, req.body.capitalBatchLabel || 'رأس المال الأول', req.user, `رفع شيت منتجات (${products.length} منتج)`))],
          notes: 'تم التسجيل تلقائياً عبر شيت الرفع الجماعي للمنتجات',
          isActive: true,
          totalProductsCount: products.length,
          lastUploadAt: new Date().toISOString(),
          createdAt: new Date().toISOString()
        });

        finalInvestorId = newInvId;
        cleanInvestorCode = investor.code;
        cleanInvestorName = investor.name;
      }
    } else {
      cleanMerchantCode = (merchantCode || ownerCode || '').trim().toUpperCase();
      cleanMerchantName = (merchantName || ownerName || '').trim();

      if (!cleanMerchantCode || !cleanMerchantName) {
        return res.status(400).json({
          success: false,
          message: 'كود التاجر واسم التاجر مطلوبان لرفع المنتجات الجماعية'
        });
      }

      // Auto-register or update merchant in db.merchants
      merchant = await db.merchants.findOne(m => m.code.toUpperCase() === cleanMerchantCode);
      if (!merchant) {
        merchant = await db.merchants.insert({
          code: cleanMerchantCode,
          name: cleanMerchantName,
          phone: '',
          commissionRate: 2.5,
          isActive: true,
          totalProductsCount: products.length,
          lastUploadAt: new Date().toISOString()
        });
      } else {
        await db.merchants.update(merchant.id, {
          name: cleanMerchantName,
          totalProductsCount: (merchant.totalProductsCount || 0) + products.length,
          lastUploadAt: new Date().toISOString()
        });
      }
    }

    const allCategories = await db.categories.getAll();
    const allSubcategories = await db.subcategories.getAll();
    const defaultCatId = allCategories[0]?.id || 'cat-electronics';

    const insertedProducts = [];
    const errors = [];

    for (let i = 0; i < products.length; i++) {
      const p = products[i];
      const indexNum = i + 1;

      if (!p.title || p.price === undefined || p.price === '') {
        errors.push(`المنتج #${indexNum}: عنوان المنتج وسعر البيع مطلوبان`);
        continue;
      }
      const bulkNumbersError = validateProductNumbers({ price: p.price, stock: p.stock, costPrice: p.costPrice });
      if (bulkNumbersError) {
        errors.push(`المنتج #${indexNum} (${p.title}): ${bulkNumbersError}`);
        continue;
      }

      let catId = p.categoryId || p.category;
      if (catId) {
        const foundCat = allCategories.find(c => 
          c.id === catId || 
          c.name.trim().toLowerCase() === String(catId).trim().toLowerCase() ||
          c.slug === catId
        );
        if (foundCat) catId = foundCat.id;
      }
      if (!catId) catId = defaultCatId;

      let finalSubId = p.subcategoryId || p.subcategory || null;
      if (finalSubId) {
        const foundSub = allSubcategories.find(s => 
          s.id === finalSubId || 
          s.name.trim().toLowerCase() === String(finalSubId).trim().toLowerCase()
        );
        if (foundSub) finalSubId = foundSub.id;
      }
      if (!finalSubId && catId) {
        const subs = allSubcategories.filter(s => s.categoryId === catId);
        if (subs && subs.length > 0) finalSubId = subs[0].id;
      }

      if (!catId) {
        errors.push(`المنتج #${indexNum} ("${p.title}"): يجب اختيار القسم الرئيسي`);
        continue;
      }

      const freeShip = Boolean(p.isFreeShipping);
      const shipCost = freeShip ? 0 : (p.shippingCost !== undefined && p.shippingCost !== '' ? Number(p.shippingCost) : (Number(p.shippingPrice) || 25));

      const sellingPrice = Number(p.price) || 0;
      let rawCost = 0;
      if (p.costPrice !== undefined && p.costPrice !== null && p.costPrice !== '' && !isNaN(Number(p.costPrice))) {
        rawCost = Number(p.costPrice);
      } else if (p.merchantPrice !== undefined && p.merchantPrice !== null && p.merchantPrice !== '' && !isNaN(Number(p.merchantPrice))) {
        rawCost = Number(p.merchantPrice);
      } else if (p.basePrice !== undefined && p.basePrice !== null && p.basePrice !== '' && !isNaN(Number(p.basePrice))) {
        rawCost = Number(p.basePrice);
      } else {
        rawCost = sellingPrice;
      }
      const rawBase = p.basePrice !== undefined && p.basePrice !== null && p.basePrice !== '' && !isNaN(Number(p.basePrice)) ? Number(p.basePrice) : rawCost;

      let rawCompare = null;
      if (p.compareAtPrice !== undefined && p.compareAtPrice !== null && p.compareAtPrice !== '' && !isNaN(Number(p.compareAtPrice))) {
        rawCompare = Number(p.compareAtPrice);
      }

      const newProduct = await db.products.insert({
        title: String(p.title).trim(),
        description: p.description ? String(p.description).trim() : '',
        categoryId: catId,
        category: catId,
        subcategoryId: finalSubId,
        subcategory: finalSubId,
        brand: p.brand ? String(p.brand).trim() : '',
        brandId: p.brandId || null,
        price: sellingPrice, // 1. سعر البيع بعد الخصم
        costPrice: rawCost, // 2. سعر التكلفة (التوريد)
        basePrice: rawBase,
        merchantPrice: isInvestor ? rawCost : (p.merchantPrice !== undefined ? Number(p.merchantPrice) : rawCost),
        commissionRate: p.commissionRate !== undefined ? Number(p.commissionRate) : 0,
        compareAtPrice: rawCompare, // 3. سعر البيع قبل الخصم
        saleUnit: p.saleUnit || 'قطعة',
        stock: p.stock !== undefined && p.stock !== '' ? Number(p.stock) : 50,
        shippingCost: shipCost,
        isFreeShipping: freeShip,
        governorateShipping: typeof p.governorateShipping === 'object' && p.governorateShipping !== null ? p.governorateShipping : {},
        allowedGovernorates: Array.isArray(p.allowedGovernorates) ? p.allowedGovernorates : [],
        isLargeItem: Boolean(p.isLargeItem),
        customShippingCost: p.customShippingCost !== undefined && p.customShippingCost !== '' ? Number(p.customShippingCost) : null,
        warrantyText: p.warrantyText || 'ضمان استبدال خلال 14 يوم في حالة عيب الصناعة',
        images: Array.isArray(p.images) ? p.images : [],
        videoUrl: p.videoUrl || '',
        variations: Array.isArray(p.variations) ? p.variations : [],
        isFeatured: Boolean(p.isFeatured),
        isActive: p.isActive !== undefined ? Boolean(p.isActive) : true,
        tags: Array.isArray(p.tags) ? p.tags : [],
        salesCount: 0,
        ownerType: isInvestor ? 'investor' : 'merchant',
        merchantCode: isInvestor ? '' : cleanMerchantCode,
        merchantName: isInvestor ? '' : cleanMerchantName,
        merchantId: isInvestor ? null : (merchant ? merchant.id : null),
        investorCode: isInvestor ? cleanInvestorCode : '',
        investorName: isInvestor ? cleanInvestorName : '',
        investorId: isInvestor ? finalInvestorId : null,
        ...(isInvestor && capitalBatchForUpload ? { capitalBatchId: capitalBatchForUpload.id } : {})
      });

      insertedProducts.push(newProduct);
    }

    if (insertedProducts.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'فشل حفظ أي منتج من الشيت لوجود أخطاء في البيانات',
        errors
      });
    }

    if (isInvestor && finalInvestorId) {
      const invRecord = await db.investors.getById(finalInvestorId);
      if (invRecord) {
        await db.investors.update(finalInvestorId, {
          totalProductsCount: (invRecord.totalProductsCount || 0) + insertedProducts.length,
          lastUploadAt: new Date().toISOString()
        });
      }
    }

    const entityLabel = isInvestor ? 'للمستثمر' : 'للتاجر';
    const entityName = isInvestor ? cleanInvestorName : cleanMerchantName;
    const entityCode = isInvestor ? cleanInvestorCode : cleanMerchantCode;

    await logActivity({
      userId: req.user.id,
      userName: req.user.name,
      userRole: req.user.role,
      action: 'BULK_CREATE_PRODUCTS',
      module: 'products',
      details: `قام برفع ونشر ${insertedProducts.length} منتج دفعة واحدة ${entityLabel} "${entityName}" (كود: ${entityCode})`,
      metadata: { 
        ownerType: isInvestor ? 'investor' : 'merchant', 
        entityCode, 
        entityName, 
        count: insertedProducts.length 
      }
    });

    res.status(201).json({
      success: true,
      message: `تم رفع ونشر ${insertedProducts.length} منتج بنجاح ${entityLabel} "${entityName}" (${entityCode})`,
      count: insertedProducts.length,
      ownerType: isInvestor ? 'investor' : 'merchant',
      entityCode,
      entityName,
      errors: errors.length > 0 ? errors : undefined,
      capitalBatch: capitalBatchForUpload || undefined,
      // Shown ONCE to the admin when a new investor account was created automatically
      newInvestorLogin: generatedInvestorLogin || undefined,
      products: insertedProducts
    });
  } catch (err) {
    console.error('Bulk product upload error:', err);
    res.status(500).json({ success: false, message: 'فشل الرفع الجماعي للمنتجات' });
  }
});

// Admin: Create product
router.post('/', authenticate, requirePermission('canManageProducts'), blockMerchantWrites, async (req, res) => {
  try {
    // Investor accounts are read-only
    if (req.user.role === 'investor') {
      return res.status(403).json({
        success: false,
        message: 'حساب المستثمر مخصص للمشاهدة والتقارير فقط وغير مصرح له بإضافة المنتجات.'
      });
    }

    // Permission check for merchants
    if (req.user.role === 'merchant') {
      if (req.user.canEditProducts === false) {
        return res.status(403).json({
          success: false,
          message: 'حسابك مخصص للمشاهدة فقط، لا تملك صلاحية لإضافة أو تعديل المنتجات. يُرجى مراجعة إدارة المتجر.'
        });
      }
    }

    const {
      title,
      description,
      categoryId,
      subcategoryId,
      subcategory,
      brand,
      brandId,
      merchantCode,
      merchantName,
      price,
      compareAtPrice,
      saleUnit, // e.g. قطعة, كيلو, لتر, علبة...
      stock,
      shippingCost, // Default is 25 EGP
      isFreeShipping,
      governorateShipping, // { "القاهرة": 25, "الإسكندرية": 35, ... }
      allowedGovernorates, // Array of allowed Egyptian governorates
      isLargeItem,
      customShippingCost,
      warrantyText,
      images, // array of urls
      videoUrl, // youtube or direct video link
      variations, // array of { name: 'المقاس', values: ['S', 'M', 'L'] }
      isFeatured,
      isBestSeller,
      bestSellerOrder,
      isActive,
      tags
    } = req.body;

    if (!title || price === undefined) {
      return res.status(400).json({
        success: false,
        message: 'عنوان المنتج وسعر البيع مطلوبان'
      });
    }

    const numbersError = validateProductNumbers({ price, stock, compareAtPrice, shippingCost: isFreeShipping ? undefined : shippingCost, costPrice: req.body.costPrice });
    if (numbersError) {
      return res.status(400).json({ success: false, message: numbersError });
    }

    if (!categoryId || (!subcategoryId && !subcategory)) {
      return res.status(400).json({
        success: false,
        message: 'يجب اختيار القسم الرئيسي والقسم الفرعي التابع له قبل حفظ المنتج'
      });
    }

    const extra = await readExtraProductFields(req.body);
    if (extra.error) return res.status(400).json({ success: false, message: extra.error });

    const freeShip = Boolean(isFreeShipping);
    const finalShipCost = freeShip ? 0 : (shippingCost !== undefined && shippingCost !== '' ? Number(shippingCost) : 25);
    const finalSubId = subcategoryId || subcategory || null;
    const finalStock = extra.fields.stock !== undefined ? extra.fields.stock : (stock !== undefined ? Number(stock) : 50);

    let bestSeller = Boolean(isBestSeller);
    let bestSellerBackup = false;
    if (bestSeller && finalStock === 0) {
      bestSeller = false;
      bestSellerBackup = true;
    }

    const ownership = await resolveExclusiveOwnership(req.body, req.user);

    // Investor product: belongs to a capital batch (the one chosen, else the investor's latest batch)
    let capitalBatchId = null;
    if (ownership.ownerType === 'investor' && ownership.investorId) {
      const inv = await db.investors.getById(ownership.investorId);
      const batches = getCapitalBatches(inv);
      const chosen = req.body.capitalBatchId && batches.find(b => String(b.id) === String(req.body.capitalBatchId));
      capitalBatchId = chosen ? chosen.id : (batches.length ? batches[batches.length - 1].id : null);
    }

    const newProduct = await db.products.insert({
      ...(capitalBatchId ? { capitalBatchId } : {}),
      title: title.trim(),
      description: description ? description.trim() : '',
      categoryId: categoryId || null,
      subcategoryId: finalSubId,
      subcategory: finalSubId,
      brand: brand ? brand.trim() : '',
      brandId: brandId || null,
      ownerType: ownership.ownerType,
      merchantId: ownership.merchantId,
      merchantCode: ownership.merchantCode,
      merchantName: ownership.merchantName,
      price: Number(price) || 0,
      costPrice: req.body.costPrice !== undefined ? Number(req.body.costPrice) : (req.body.basePrice !== undefined ? Number(req.body.basePrice) : (req.body.merchantPrice !== undefined ? Number(req.body.merchantPrice) : 0)),
      basePrice: req.body.costPrice !== undefined ? Number(req.body.costPrice) : (req.body.basePrice !== undefined ? Number(req.body.basePrice) : (req.body.merchantPrice !== undefined ? Number(req.body.merchantPrice) : 0)),
      merchantPrice: req.body.costPrice !== undefined ? Number(req.body.costPrice) : (req.body.basePrice !== undefined ? Number(req.body.basePrice) : (req.body.merchantPrice !== undefined ? Number(req.body.merchantPrice) : 0)),
      investorId: ownership.investorId,
      investorCode: ownership.investorCode,
      investorName: ownership.investorName,
      commissionRate: req.body.commissionRate !== undefined ? Number(req.body.commissionRate) : 0,
      compareAtPrice: compareAtPrice ? Number(compareAtPrice) : null,
      saleUnit: saleUnit || 'قطعة',
      stock: finalStock,
      shippingCost: finalShipCost,
      isFreeShipping: freeShip,
      governorateShipping: typeof governorateShipping === 'object' && governorateShipping !== null ? governorateShipping : {},
      allowedGovernorates: Array.isArray(allowedGovernorates) ? allowedGovernorates : [],
      isLargeItem: Boolean(isLargeItem),
      customShippingCost: customShippingCost !== undefined ? Number(customShippingCost) : null,
      warrantyText: warrantyText || 'ضمان استبدال خلال 14 يوم في حالة عيب الصناعة',
      sku: extra.fields.sku || '',
      barcode: extra.fields.barcode || '',
      weightKg: extra.fields.weightKg !== undefined ? extra.fields.weightKg : null,
      variants: extra.fields.variants || [],
      images: Array.isArray(images) && images.length > 0 ? images : ['/images/no-image.svg'],
      videoUrl: videoUrl || '',
      variations: Array.isArray(variations) ? variations : [],
      isFeatured: Boolean(isFeatured),
      isBestSeller: bestSeller,
      isBestSellerBackup: bestSellerBackup,
      bestSellerOrder: Number(bestSellerOrder) || 0,
      isActive: isActive !== undefined ? Boolean(isActive) : true,
      tags: Array.isArray(tags) ? tags : [],
      salesCount: 0
    });

    // Automatic In-App Notification to users
    db.notifications.insert({
      title: 'منتج جديد متوفر الآن! 🎉',
      message: `تمت إضافة منتج جديد: "${newProduct.title}" بسعر ${newProduct.price} ج.م`,
      type: 'product',
      target: 'all',
      productId: newProduct.id,
      link: `#/product/${newProduct.id}`,
      createdAt: new Date().toISOString()
    }).catch(() => {});

    await logActivity({
      userId: req.user.id,
      userName: req.user.name,
      userRole: req.user.role,
      action: 'CREATE_PRODUCT',
      module: 'products',
      details: `قام بإضافة منتج جديد: "${newProduct.title}" (سعر: ${newProduct.price} ج.م، شحن: ${newProduct.isFreeShipping ? 'مجاني' : newProduct.shippingCost + ' ج.م'}${newProduct.merchantName ? '، التاجر: ' + newProduct.merchantName : ''})`,
      metadata: { productId: newProduct.id }
    });

    res.status(201).json({
      success: true,
      message: 'تم إضافة المنتج بنجاح',
      product: newProduct
    });
  } catch (err) {
    console.error('Create product error:', err);
    res.status(500).json({ success: false, message: 'فشل إضافة المنتج' });
  }
});

// Admin: Update product
router.put('/:id', authenticate, requirePermission('canManageProducts'), blockMerchantWrites, async (req, res) => {
  try {
    // Investor accounts are read-only
    if (req.user.role === 'investor') {
      return res.status(403).json({
        success: false,
        message: 'حساب المستثمر مخصص للمشاهدة والتقارير فقط وغير مصرح له بتعديل المنتجات.'
      });
    }

    const { id } = req.params;
    const existing = await db.products.getById(id);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'المنتج غير موجود' });
    }

    // Permission and ownership check for merchants
    if (req.user.role === 'merchant') {
      if (req.user.canEditProducts === false) {
        return res.status(403).json({
          success: false,
          message: 'حسابك مخصص للمشاهدة فقط، لا تملك صلاحية لتعديل المنتجات. يُرجى مراجعة إدارة المتجر.'
        });
      }
      const isOwner = (existing.merchantId && String(existing.merchantId) === String(req.user.merchantId)) ||
                      (existing.merchantCode && existing.merchantCode.trim().toLowerCase() === (req.user.merchantCode || '').trim().toLowerCase());
      if (!isOwner) {
        return res.status(403).json({
          success: false,
          message: 'غير مصرح لك بتعديل منتجات تاجر آخر.'
        });
      }
    }

    const {
      title,
      description,
      categoryId,
      subcategoryId,
      subcategory,
      brand,
      brandId,
      merchantCode,
      merchantName,
      price,
      compareAtPrice,
      saleUnit,
      stock,
      shippingCost,
      isFreeShipping,
      governorateShipping,
      allowedGovernorates,
      isLargeItem,
      customShippingCost,
      warrantyText,
      images,
      videoUrl,
      variations,
      isFeatured,
      isBestSeller,
      isBestSellerBackup,
      bestSellerOrder,
      isActive,
      tags
    } = req.body;

    // Compare-at price is checked against the new price, or the current one if unchanged
    const numbersError = validateProductNumbers({
      price,
      stock,
      compareAtPrice,
      shippingCost: isFreeShipping ? undefined : shippingCost,
      costPrice: req.body.costPrice
    }) || ((compareAtPrice !== undefined && compareAtPrice !== '' && compareAtPrice !== null && price === undefined)
      ? validateProductNumbers({ price: existing.price, compareAtPrice })
      : null);
    if (numbersError) {
      return res.status(400).json({ success: false, message: numbersError });
    }

    const updates = {};
    if (title !== undefined) updates.title = title.trim();
    if (description !== undefined) updates.description = description.trim();
    if (categoryId !== undefined) updates.categoryId = categoryId;
    if (subcategoryId !== undefined || subcategory !== undefined) {
      const sId = subcategoryId || subcategory;
      updates.subcategoryId = sId;
      updates.subcategory = sId;
    }
    if (brand !== undefined) updates.brand = brand.trim();
    if (brandId !== undefined) updates.brandId = brandId;
    if (price !== undefined) updates.price = Number(price);
    if (req.body.costPrice !== undefined) {
      const cp = Number(req.body.costPrice);
      updates.costPrice = cp;
      updates.basePrice = cp;
      updates.merchantPrice = cp;
    } else if (req.body.basePrice !== undefined) {
      const cp = Number(req.body.basePrice);
      updates.costPrice = cp;
      updates.basePrice = cp;
      updates.merchantPrice = cp;
    } else if (req.body.merchantPrice !== undefined) {
      const cp = Number(req.body.merchantPrice);
      updates.costPrice = cp;
      updates.basePrice = cp;
      updates.merchantPrice = cp;
    }

    const hasOwnershipChange = ['ownerType', 'merchantId', 'merchantCode', 'merchantName', 'investorId', 'investorCode', 'investorName']
      .some(k => req.body[k] !== undefined);
    if (hasOwnershipChange) {
      const ownership = await resolveExclusiveOwnership(req.body, req.user, existing);
      Object.assign(updates, ownership);
    }
    if (req.body.commissionRate !== undefined) updates.commissionRate = Number(req.body.commissionRate);
    if (compareAtPrice !== undefined) updates.compareAtPrice = compareAtPrice ? Number(compareAtPrice) : null;
    if (saleUnit !== undefined) updates.saleUnit = saleUnit;
    if (stock !== undefined) updates.stock = Number(stock);

    if (isFreeShipping !== undefined) {
      updates.isFreeShipping = Boolean(isFreeShipping);
      if (updates.isFreeShipping) {
        updates.shippingCost = 0;
      } else if (shippingCost !== undefined) {
        updates.shippingCost = Number(shippingCost);
      }
    } else if (shippingCost !== undefined) {
      updates.shippingCost = Number(shippingCost);
      if (updates.shippingCost === 0) updates.isFreeShipping = true;
    }

    if (governorateShipping !== undefined) {
      updates.governorateShipping = typeof governorateShipping === 'object' && governorateShipping !== null ? governorateShipping : {};
    }
    if (allowedGovernorates !== undefined) {
      updates.allowedGovernorates = Array.isArray(allowedGovernorates) ? allowedGovernorates : [];
    }
    if (isLargeItem !== undefined) updates.isLargeItem = Boolean(isLargeItem);
    if (customShippingCost !== undefined) updates.customShippingCost = Number(customShippingCost);
    if (warrantyText !== undefined) updates.warrantyText = warrantyText;

    if (images !== undefined) updates.images = Array.isArray(images) ? images : [images];
    if (videoUrl !== undefined) updates.videoUrl = videoUrl;
    if (variations !== undefined) updates.variations = variations;
    if (isFeatured !== undefined) updates.isFeatured = Boolean(isFeatured);

    const extra = await readExtraProductFields(req.body, id);
    if (extra.error) return res.status(400).json({ success: false, message: extra.error });
    Object.assign(updates, extra.fields);
    // A product that keeps its options: its stock is always the options' total, never a typed number
    if (extra.fields.variants === undefined && Array.isArray(existing.variants) && existing.variants.length) {
      delete updates.stock;
    }

    // Best Seller & Stock Auto-Backup / Auto-Restore Logic
    const finalStock = updates.stock !== undefined ? updates.stock : (existing.stock || 0);
    let isBS = isBestSeller !== undefined ? Boolean(isBestSeller) : Boolean(existing.isBestSeller);
    let isBSBackup = Boolean(existing.isBestSellerBackup);

    if (finalStock === 0) {
      if (isBS) {
        isBS = false;
        isBSBackup = true;
      }
    } else if (finalStock > 0) {
      if (isBSBackup) {
        isBS = true;
        isBSBackup = false;
      }
    }

    if (isBestSeller !== undefined || updates.stock !== undefined) {
      updates.isBestSeller = isBS;
      updates.isBestSellerBackup = isBSBackup;
    }
    if (bestSellerOrder !== undefined) {
      updates.bestSellerOrder = Number(bestSellerOrder) || 0;
    }

    if (isActive !== undefined) updates.isActive = Boolean(isActive);
    if (tags !== undefined) updates.tags = tags;

    const updated = await db.products.update(id, updates);

    await logActivity({
      userId: req.user.id,
      userName: req.user.name,
      userRole: req.user.role,
      action: 'UPDATE_PRODUCT',
      module: 'products',
      details: `قام بتحديث بيانات المنتج: "${updated.title}"`,
      metadata: { productId: updated.id }
    });

    res.json({
      success: true,
      message: 'تم تحديث بيانات المنتج بنجاح',
      product: updated
    });
  } catch (err) {
    console.error('Update product error:', err);
    res.status(500).json({ success: false, message: 'فشل تحديث المنتج' });
  }
});

// Admin: Toggle product in/out of Best Sellers manually
router.post('/:id/toggle-bestseller', authenticate, requirePermission('canManageProducts'), blockMerchantWrites, async (req, res) => {
  try {
    const { id } = req.params;
    const product = await db.products.getById(id);
    if (!product) {
      return res.status(404).json({ success: false, message: 'المنتج غير موجود' });
    }

    const currentStatus = Boolean(product.isBestSeller);
    const newStatus = !currentStatus;

    const updates = {
      isBestSeller: newStatus,
      isBestSellerBackup: false,
      excludeFromBestSellers: !newStatus
    };

    const updated = await db.products.update(id, updates);

    await logActivity({
      userId: req.user.id,
      userName: req.user.name,
      userRole: req.user.role,
      action: newStatus ? 'ADD_TO_BEST_SELLERS' : 'REMOVE_FROM_BEST_SELLERS',
      module: 'products',
      details: newStatus
        ? `قام بإضافة المنتج "${product.title}" إلى قائمة الأكثر مبيعاً`
        : `قام بإزالة المنتج "${product.title}" يدوياً من قائمة الأكثر مبيعاً`,
      metadata: { productId: id }
    });

    res.json({
      success: true,
      isBestSeller: newStatus,
      excludeFromBestSellers: !newStatus,
      message: newStatus ? 'تمت إضافة المنتج إلى قائمة الأكثر مبيعاً ⭐' : 'تمت إزالة المنتج من قائمة الأكثر مبيعاً بنجاح'
    });
  } catch (err) {
    console.error('Toggle bestseller error:', err);
    res.status(500).json({ success: false, message: 'فشل تعديل حالة الأكثر مبيعاً' });
  }
});

// Admin: Delete product
router.delete('/:id', authenticate, requirePermission('canManageProducts'), blockMerchantWrites, async (req, res) => {
  try {
    // Investor accounts are read-only
    if (req.user.role === 'investor') {
      return res.status(403).json({
        success: false,
        message: 'حساب المستثمر مخصص للمشاهدة والتقارير فقط وغير مصرح له بحذف المنتجات.'
      });
    }

    const { id } = req.params;
    const existing = await db.products.getById(id);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'المنتج غير موجود' });
    }

    // Permission and ownership check for merchants
    if (req.user.role === 'merchant') {
      if (req.user.canEditProducts === false) {
        return res.status(403).json({
          success: false,
          message: 'حسابك مخصص للمشاهدة فقط، لا تملك صلاحية لحذف المنتجات.'
        });
      }
      const isOwner = (existing.merchantId && String(existing.merchantId) === String(req.user.merchantId)) ||
                      (existing.merchantCode && existing.merchantCode.trim().toLowerCase() === (req.user.merchantCode || '').trim().toLowerCase());
      if (!isOwner) {
        return res.status(403).json({
          success: false,
          message: 'غير مصرح لك بحذف منتجات تاجر آخر.'
        });
      }
    }

    await db.products.delete(id);

    await logActivity({
      userId: req.user.id,
      userName: req.user.name,
      userRole: req.user.role,
      action: 'DELETE_PRODUCT',
      module: 'products',
      details: `قام بحذف المنتج: "${existing.title}"`,
      metadata: { productId: id }
    });

    res.json({ success: true, message: 'تم حذف المنتج بنجاح' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'فشل حذف المنتج' });
  }
});

module.exports = router;
