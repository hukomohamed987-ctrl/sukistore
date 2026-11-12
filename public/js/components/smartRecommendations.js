/**
 * Suki Store Smart Recommendations Engine
 * Learns customer preferences silently from searches, viewed products, and categories
 * Delivers natural suggestions ("مختارات مقترحة تناسب اهتماماتك") without mentioning "recently viewed"
 */

const SmartRecommendations = {
  STORAGE_KEY: 'suki_user_interests',

  // Get current learned profile
  getProfile() {
    try {
      const raw = localStorage.getItem(this.STORAGE_KEY);
      if (!raw) return { categories: {}, subcategories: {}, brands: {}, keywords: [] };
      return JSON.parse(raw);
    } catch (e) {
      return { categories: {}, subcategories: {}, brands: {}, keywords: [] };
    }
  },

  // Save profile
  saveProfile(profile) {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(profile));
    } catch (e) {}
  },

  // Record a product view
  recordProductView(product) {
    if (!product || !product.id) return;
    const profile = this.getProfile();

    // 1. Boost category score
    if (product.categoryId) {
      profile.categories[product.categoryId] = (profile.categories[product.categoryId] || 0) + 2;
    }

    // 2. Boost subcategory score
    const subId = product.subcategoryId || product.subcategory;
    if (subId) {
      profile.subcategories[subId] = (profile.subcategories[subId] || 0) + 3;
    }

    // 3. Boost brand score
    if (product.brand) {
      profile.brands[product.brand.toLowerCase()] = (profile.brands[product.brand.toLowerCase()] || 0) + 2;
    }

    // 4. Save viewed product ID to avoid suggesting the exact same item repeatedly
    if (!profile.viewedIds) profile.viewedIds = [];
    if (!profile.viewedIds.includes(product.id)) {
      profile.viewedIds.unshift(product.id);
      if (profile.viewedIds.length > 30) profile.viewedIds.pop();
    }

    this.saveProfile(profile);
  },

  // Record a search term
  recordSearch(query) {
    if (!query || query.trim().length < 2) return;
    const profile = this.getProfile();
    const clean = query.trim().toLowerCase();
    if (!profile.keywords) profile.keywords = [];
    if (!profile.keywords.includes(clean)) {
      profile.keywords.unshift(clean);
      if (profile.keywords.length > 10) profile.keywords.pop();
    }
    this.saveProfile(profile);
  },

  // Fetch smart personalized recommendations
  async getRecommendedProducts(limit = 10) {
    try {
      const profile = this.getProfile();
      const allProducts = await dbProductsCacheOrApi();

      // Find top preferred subcategory, category, and brand
      const topSub = getTopKey(profile.subcategories);
      const topCat = getTopKey(profile.categories);
      const topBrand = getTopKey(profile.brands);
      const keywords = profile.keywords || [];
      const viewedIds = profile.viewedIds || [];

      // Score each product
      const scored = allProducts
        .filter(p => p.isActive !== false)
        .map(p => {
          let score = 0;
          const pSub = p.subcategoryId || p.subcategory;

          if (topSub && pSub && String(pSub) === String(topSub)) score += 10;
          if (topCat && p.categoryId && String(p.categoryId) === String(topCat)) score += 5;
          if (topBrand && p.brand && p.brand.toLowerCase() === topBrand.toLowerCase()) score += 4;

          // Keyword matches
          keywords.forEach(kw => {
            if ((p.title || '').toLowerCase().includes(kw)) score += 3;
            if ((p.description || '').toLowerCase().includes(kw)) score += 2;
          });

          // Discount bonus
          if (p.compareAtPrice && p.compareAtPrice > p.price) score += 2;
          // Popularity bonus
          if (p.salesCount) score += Math.min(3, p.salesCount * 0.1);

          // Slightly de-prioritize products already viewed so the recommendations stay fresh
          if (viewedIds.includes(p.id)) score -= 2;

          return { product: p, score };
        });

      scored.sort((a, b) => b.score - a.score);

      // Return top products
      let recommended = scored.slice(0, limit).map(item => item.product);

      // Fallback if user is new and has no history yet: return top rated / featured
      if (recommended.length < 4) {
        const fallbacks = allProducts.filter(p => p.isActive !== false && p.isFeatured);
        recommended = [...recommended, ...fallbacks].slice(0, limit);
      }

      return recommended;
    } catch (e) {
      console.error('Recommendations error:', e);
      return [];
    }
  }
};

// Helper: Cache products for fast in-page recommendation scoring
let _productsCache = null;
let _productsCacheTime = 0;
async function dbProductsCacheOrApi() {
  const now = Date.now();
  if (_productsCache && (now - _productsCacheTime < 60000)) {
    return _productsCache;
  }
  const res = await API.get('/products', { limit: 100 });
  _productsCache = res.products || [];
  _productsCacheTime = now;
  return _productsCache;
}

function getTopKey(obj) {
  if (!obj) return null;
  let top = null;
  let max = 0;
  for (const [k, v] of Object.entries(obj)) {
    if (v > max) {
      max = v;
      top = k;
    }
  }
  return top;
}
