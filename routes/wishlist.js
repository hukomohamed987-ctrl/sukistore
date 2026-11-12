const express = require('express');
const router = express.Router();
const db = require('../database/db');
const { authenticate, optionalAuth } = require('../middleware/auth');

// ----------------------------------------------------
// 1. GET USER WISHLIST WITH HYDRATED PRODUCTS (Logged-in or Guest)
// ----------------------------------------------------
router.get('/', optionalAuth, async (req, res) => {
  try {
    let wishlistIds = [];
    if (req.user) {
      const user = await db.users.getById(req.user.id);
      wishlistIds = Array.isArray(user?.wishlist) ? user.wishlist : [];
    } else if (req.query.ids) {
      wishlistIds = String(req.query.ids).split(',').map(s => s.trim()).filter(Boolean);
    }

    const allProducts = await db.products.getAll();
    const productsMap = {};
    allProducts.forEach(p => {
      productsMap[p.id] = p;
    });

    const items = [];
    for (const prodId of wishlistIds) {
      const p = productsMap[prodId];
      if (p) {
        items.push({
          id: p.id,
          title: p.title,
          price: p.price,
          compareAtPrice: p.compareAtPrice,
          image: Array.isArray(p.images) && p.images.length > 0 ? p.images[0] : (p.image || ''),
          stock: p.stock !== undefined ? p.stock : 10,
          inStock: (p.stock === undefined || p.stock > 0) && p.isActive !== false,
          brand: p.brand || '',
          saleUnit: p.saleUnit || 'قطعة',
          shippingCost: p.shippingCost !== undefined ? p.shippingCost : 25
        });
      }
    }

    res.json({
      success: true,
      count: items.length,
      wishlistIds,
      items
    });
  } catch (err) {
    console.error('Get wishlist error:', err);
    res.status(500).json({ success: false, message: 'فشل جلب قائمة الأمنيات' });
  }
});

// ----------------------------------------------------
// 2. TOGGLE PRODUCT IN/OUT OF WISHLIST
// ----------------------------------------------------
router.post('/toggle', authenticate, async (req, res) => {
  try {
    const { productId } = req.body;
    if (!productId) {
      return res.status(400).json({ success: false, message: 'معرف المنتج مطلوب' });
    }

    const user = await db.users.getById(req.user.id);
    let wishlist = Array.isArray(user?.wishlist) ? [...user.wishlist] : [];

    const index = wishlist.indexOf(productId);
    let isAdded = false;

    if (index > -1) {
      // Remove
      wishlist.splice(index, 1);
      isAdded = false;
    } else {
      // Add
      wishlist.unshift(productId);
      isAdded = true;
    }

    await db.users.update(req.user.id, { wishlist });

    res.json({
      success: true,
      isAdded,
      message: isAdded ? 'تمت إضافة المنتج إلى قائمة أمنياتك بنجاح ❤️' : 'تمت إزالة المنتج من قائمة الأمنيات',
      wishlistCount: wishlist.length,
      wishlistIds: wishlist
    });
  } catch (err) {
    console.error('Toggle wishlist error:', err);
    res.status(500).json({ success: false, message: 'فشل تعديل قائمة الأمنيات' });
  }
});

// ----------------------------------------------------
// 3. REMOVE PRODUCT FROM WISHLIST
// ----------------------------------------------------
router.delete('/:productId', authenticate, async (req, res) => {
  try {
    const { productId } = req.params;
    const user = await db.users.getById(req.user.id);
    let wishlist = Array.isArray(user?.wishlist) ? [...user.wishlist] : [];

    wishlist = wishlist.filter(id => id !== productId);
    await db.users.update(req.user.id, { wishlist });

    res.json({
      success: true,
      message: 'تم حذف المنتج من قائمة الأمنيات',
      wishlistCount: wishlist.length,
      wishlistIds: wishlist
    });
  } catch (err) {
    console.error('Remove wishlist error:', err);
    res.status(500).json({ success: false, message: 'فشل حذف المنتج من المفضلة' });
  }
});

// ----------------------------------------------------
// 4. MOVE PRODUCT FROM WISHLIST TO CART
// ----------------------------------------------------
router.post('/move-to-cart', authenticate, async (req, res) => {
  try {
    const { productId, quantity = 1 } = req.body;
    if (!productId) {
      return res.status(400).json({ success: false, message: 'معرف المنتج مطلوب' });
    }

    const product = await db.products.getById(productId);
    if (!product) {
      return res.status(404).json({ success: false, message: 'المنتج غير موجود' });
    }

    // Add to cart
    let userCart = await db.carts.findOne(c => c.userId === req.user.id);
    if (!userCart) {
      userCart = await db.carts.insert({
        userId: req.user.id,
        items: []
      });
    }

    const items = Array.isArray(userCart.items) ? [...userCart.items] : [];
    const existingIndex = items.findIndex(it => it.productId === productId);

    if (existingIndex > -1) {
      items[existingIndex].quantity += quantity;
    } else {
      items.push({
        id: require('uuid').v4(),
        productId: product.id,
        title: product.title,
        price: product.price,
        image: Array.isArray(product.images) && product.images.length > 0 ? product.images[0] : (product.image || ''),
        shippingCost: product.shippingCost !== undefined ? product.shippingCost : 25,
        isFreeShipping: Boolean(product.isFreeShipping),
        governorateShipping: product.governorateShipping || {},
        saleUnit: product.saleUnit || 'قطعة',
        quantity
      });
    }

    await db.carts.update(userCart.id, { items });

    // Remove from wishlist
    const user = await db.users.getById(req.user.id);
    let wishlist = Array.isArray(user?.wishlist) ? [...user.wishlist] : [];
    wishlist = wishlist.filter(id => id !== productId);
    await db.users.update(req.user.id, { wishlist });

    res.json({
      success: true,
      message: 'تم نقل المنتج بنجاح إلى سلة التسوق 🛒',
      cartItemsCount: items.length,
      wishlistCount: wishlist.length,
      wishlistIds: wishlist
    });
  } catch (err) {
    console.error('Move to cart error:', err);
    res.status(500).json({ success: false, message: 'فشل نقل المنتج إلى السلة' });
  }
});
// ----------------------------------------------------
// 5. SYNC GUEST WISHLIST INTO LOGGED-IN ACCOUNT
// ----------------------------------------------------
router.post('/sync', authenticate, async (req, res) => {
  try {
    const { localIds } = req.body;
    const incoming = Array.isArray(localIds) ? localIds : [];
    const user = await db.users.getById(req.user.id);
    let wishlist = Array.isArray(user?.wishlist) ? [...user.wishlist] : [];

    for (const id of incoming) {
      if (id && !wishlist.includes(id)) {
        wishlist.push(id);
      }
    }

    await db.users.update(req.user.id, { wishlist });

    res.json({
      success: true,
      wishlistIds: wishlist,
      message: 'تمت مزامنة قائمة الأمنيات بنجاح'
    });
  } catch (err) {
    console.error('Wishlist sync error:', err);
    res.status(500).json({ success: false, message: 'فشل مزامنة قائمة الأمنيات' });
  }
});

module.exports = router;
