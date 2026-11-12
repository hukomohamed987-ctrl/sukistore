const express = require('express');
const router = express.Router();
const db = require('../database/db');
const { authenticate } = require('../middleware/auth');

// Helper to populate item product details and current prices
async function populateCartItems(rawItems = []) {
  const populated = [];
  for (const item of rawItems) {
    const product = await db.products.getById(item.productId);
    if (product && product.isActive !== false) {
      const maxStock = typeof product.stock === 'number' ? Math.max(0, product.stock) : (parseInt(product.stock, 10) || 0);
      populated.push({
        productId: product.id,
        title: product.title,
        price: product.price,
        compareAtPrice: product.compareAtPrice,
        image: Array.isArray(product.images) && product.images.length > 0 ? product.images[0] : '',
        saleUnit: product.saleUnit || 'قطعة',
        stock: maxStock,
        shippingCost: product.shippingCost || 0,
        quantity: Math.max(1, Math.min(Number(item.quantity) || 1, maxStock > 0 ? maxStock : 1)),
        selectedOptions: item.selectedOptions || {}
      });
    }
  }
  return populated;
}

// Get user cart (Persistent)
router.get('/', authenticate, async (req, res) => {
  try {
    let cartRecord = await db.carts.findOne(c => c.userId === req.user.id);
    if (!cartRecord) {
      cartRecord = await db.carts.insert({ userId: req.user.id, items: [] });
    }

    const items = await populateCartItems(cartRecord.items || []);
    res.json({ success: true, items });
  } catch (err) {
    console.error('Fetch cart error:', err);
    res.status(500).json({ success: false, message: 'فشل جلب السلة' });
  }
});

// Sync cart (Merge local guest items into DB cart upon login)
router.post('/sync', authenticate, async (req, res) => {
  try {
    const { localItems } = req.body;
    let cartRecord = await db.carts.findOne(c => c.userId === req.user.id);
    if (!cartRecord) {
      cartRecord = await db.carts.insert({ userId: req.user.id, items: [] });
    }

    const currentItems = cartRecord.items || [];
    const incomingItems = Array.isArray(localItems) ? localItems : [];

    // Merge: if item with same productId and same options exists, combine quantity
    for (const inc of incomingItems) {
      const matchIndex = currentItems.findIndex(ci => {
        const sameId = String(ci.productId) === String(inc.productId);
        const sameOpt = JSON.stringify(ci.selectedOptions || {}) === JSON.stringify(inc.selectedOptions || {});
        return sameId && sameOpt;
      });

      if (matchIndex > -1) {
        currentItems[matchIndex].quantity = (currentItems[matchIndex].quantity || 1) + (inc.quantity || 1);
      } else {
        currentItems.push({
          productId: inc.productId,
          quantity: inc.quantity || 1,
          selectedOptions: inc.selectedOptions || {}
        });
      }
    }

    await db.carts.update(cartRecord.id, { items: currentItems });
    const populated = await populateCartItems(currentItems);

    res.json({
      success: true,
      message: 'تمت مزامنة السلة بنجاح',
      items: populated
    });
  } catch (err) {
    console.error('Sync cart error:', err);
    res.status(500).json({ success: false, message: 'فشل مزامنة السلة' });
  }
});

// Save entire cart (Full update from client)
router.put('/', authenticate, async (req, res) => {
  try {
    const { items } = req.body;
    let cartRecord = await db.carts.findOne(c => c.userId === req.user.id);
    if (!cartRecord) {
      cartRecord = await db.carts.insert({ userId: req.user.id, items: [] });
    }

    const cleanItems = (Array.isArray(items) ? items : []).map(i => ({
      productId: i.productId,
      quantity: Number(i.quantity) || 1,
      selectedOptions: i.selectedOptions || {}
    }));

    await db.carts.update(cartRecord.id, { items: cleanItems });
    const populated = await populateCartItems(cleanItems);

    res.json({ success: true, items: populated });
  } catch (err) {
    res.status(500).json({ success: false, message: 'فشل حفظ السلة' });
  }
});

// Clear cart
router.delete('/clear', authenticate, async (req, res) => {
  try {
    const cartRecord = await db.carts.findOne(c => c.userId === req.user.id);
    if (cartRecord) {
      await db.carts.update(cartRecord.id, { items: [] });
    }
    res.json({ success: true, message: 'تم إفراغ السلة' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'فشل إفراغ السلة' });
  }
});

module.exports = router;
