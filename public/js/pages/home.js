/**
 * Suki Store Homepage
 */

const HomePage = {
  currentSlide: 0,
  sliderInterval: null,
  banners: [],

  async render() {
    const main = document.getElementById('main-content');
    main.innerHTML = `
      <div class="container py-8 text-center text-slate-400">
        <i class="fa-solid fa-spinner fa-spin text-3xl mb-3 text-emerald-600"></i>
        <div>جاري تحميل أحدث العروض والمنتجات...</div>
      </div>
    `;

    try {
      const [bannersRes, stripRes, featuredRes, latestRes, bestSellersRes, showcasesRes] = await Promise.all([
        API.get('/banners', { placement: 'home' }), // category-page banners stay on their category pages
        API.get('/banners', { placement: 'strip' }).catch(() => ({ banners: [] })),
        API.get('/products/featured'),
        API.get('/products/latest'),
        API.get('/products/best-sellers').catch(() => ({ products: [] })),
        API.get('/showcases').catch(() => ({ showcases: [] }))
      ]);
      const promoRes = await API.get('/coupons/home-promo').catch(() => ({ coupon: null }));
      const promo = promoRes.coupon;
      const promoText = promo
        ? (promo.discountType === 'fixed' ? `وفّر ${promo.discountValue} ج.م على طلبك!` : `وفّر ${promo.discountValue}% إضافية على مشترياتك!`)
        : '';
      const promoCode = promo ? String(promo.code).replace(/[^A-Za-z0-9_\-]/g, '') : '';

      this.banners = bannersRes.banners || [];
      const stripBanners = stripRes.banners || [];
      const featured = featuredRes.products || [];
      const latest = latestRes.products || [];
      const bestSellers = bestSellersRes.products || [];
      const categories = State.categories || [];
      const recommended = typeof SmartRecommendations !== 'undefined' ? await SmartRecommendations.getRecommendedProducts(8) : [];

      main.innerHTML = `
        <div class="container">
          <!-- 1. Hero Banner Slider -->
          ${this.renderSlider(this.banners)}

          <!-- 2. Thin promo banners (dashboard: البانرات ← بانر رفيع تحت السلايدر). Hidden when there are none. -->
          ${this.renderStrip(stripBanners)}

          <!-- 2.5 Showcases: moving picture cards (merchants / investors / categories / brands) -->
          ${typeof Showcases !== 'undefined' ? Showcases.sectionHtml(showcasesRes) : ''}

          <!-- 3. Featured Categories -->
          <div class="my-8">
            <div class="section-header">
              <h2 class="section-title"><i class="fa-solid fa-layer-group"></i> تصفح حسب الأقسام</h2>
              <a href="#/category/all" class="section-view-all">كل الأقسام <i class="fa-solid fa-angle-left"></i></a>
            </div>
            <div class="categories-grid">
              ${categories.map(cat => `
                <a href="#/category/${cat.id}" class="category-card">
                  <img src="${cat.image || '/images/no-image.svg'}" class="category-card-img" loading="lazy" decoding="async" alt="${cat.name}" />
                  <span class="category-card-name">${cat.name}</span>
                  <span class="category-card-count">${cat.productCount || 0} منتج</span>
                </a>
              `).join('')}
            </div>
          </div>

          <!-- 4. Smart Recommendations (Requirement 4: Natural suggestions without saying 'recently viewed') -->
          ${recommended.length > 0 ? `
            <div class="my-10">
              <div class="section-header">
                <div>
                  <h2 class="section-title"><i class="fa-solid fa-wand-magic-sparkles text-emerald-600"></i> مختارات تناسب اهتماماتك</h2>
                  <p class="text-xs text-slate-500 mt-0.5">منتجات مقترحة خصيصاً لك بناءً على تفضيلاتك في سوقي ستور</p>
                </div>
                <a href="#/category/all" class="section-view-all">عرض المزيد <i class="fa-solid fa-angle-left"></i></a>
              </div>
              <div class="products-grid">
                ${recommended.slice(0, 8).map(p => this.renderProductCard(p)).join('')}
              </div>
            </div>
          ` : ''}

          <!-- 4.5. Best Selling Products (الأكثر مبيعاً) -->
          ${bestSellers && bestSellers.length > 0 ? `
            <div class="my-10 bg-gradient-to-l from-amber-500/5 via-rose-500/5 to-transparent p-4 sm:p-6 rounded-3xl border border-amber-200/60 dark:border-amber-900/40">
              <div class="section-header mb-4">
                <div>
                  <h2 class="section-title flex items-center gap-2">
                    <span class="w-8 h-8 rounded-xl bg-amber-500 text-white flex items-center justify-center text-sm shadow-sm">
                      <i class="fa-solid fa-fire"></i>
                    </span>
                    <span>الأكثر مبيعاً في سوقي ستور</span>
                  </h2>
                  <p class="text-xs text-slate-500 mt-1">المنتجات الأكثر طلباً وإقبالاً من قِبل عملاء متجرنا</p>
                </div>
                <a href="#/category/all?sort=bestseller" class="section-view-all font-bold">عرض الكل <i class="fa-solid fa-angle-left"></i></a>
              </div>
              <div class="products-grid">
                ${bestSellers.slice(0, 8).map(p => this.renderProductCard(p)).join('')}
              </div>
            </div>
          ` : ''}

          <!-- 5. Featured Products -->
          <div class="my-8">
            <div class="section-header">
              <h2 class="section-title"><i class="fa-solid fa-star text-amber-500"></i> منتجات مميزة وعروض كبرى</h2>
              <a href="#/category/all?sort=discount" class="section-view-all">مشاهدة الكل <i class="fa-solid fa-angle-left"></i></a>
            </div>
            <div class="products-grid">
              ${featured.map(p => this.renderProductCard(p)).join('')}
            </div>
          </div>

          <!-- 6. Promotional Big Banner (only when a real, working coupon is chosen in the dashboard) -->
          ${promo ? `
          <div class="my-10 rounded-2xl overflow-hidden shadow-md relative" style="background: linear-gradient(135deg, #064e3b 0%, #047857 50%, #0f172a 100%);">
            <div class="p-8 md:p-12 text-white max-w-xl z-10 relative">
              <span class="bg-amber-400 text-slate-900 font-extrabold text-xs px-3 py-1 rounded-full inline-block mb-3">كوبون خصم إضافي</span>
              <h3 class="text-2xl md:text-3xl font-extrabold mb-3">${promoText}</h3>
              <p class="text-emerald-100 text-sm mb-6 leading-relaxed">
                استخدم كود الخصم <code class="bg-white/20 px-2 py-0.5 rounded font-mono font-bold text-amber-300">${promoCode}</code> عند إتمام طلبك${promo.minOrderValue ? ` (للطلبات من ${promo.minOrderValue} ج.م)` : ''}.
              </p>
              <a href="#/category/all" class="btn-cta text-sm">تسوق العروض الآن <i class="fa-solid fa-arrow-left"></i></a>
            </div>
          </div>
          ` : ''}

          <!-- 7. Latest Arrivals -->
          <div class="my-8">
            <div class="section-header">
              <h2 class="section-title"><i class="fa-solid fa-bolt text-emerald-600"></i> أحدث المنتجات المضافة</h2>
              <a href="#/category/all?sort=newest" class="section-view-all">مشاهدة المزيد <i class="fa-solid fa-angle-left"></i></a>
            </div>
            <div class="products-grid">
              ${latest.map(p => this.renderProductCard(p)).join('')}
            </div>
          </div>
        </div>
      `;

      this.initSliderEvents();
      if (typeof Showcases !== 'undefined') Showcases.init();
    } catch (err) {
      console.error('Home render error:', err);
      main.innerHTML = `
        <div class="container py-12 text-center text-red-600 font-bold">
          حدث خطأ أثناء تحميل محتوى الصفحة الرئيسية. يُرجى تحديث الصفحة.
        </div>
      `;
    }
  },

  // Thin promo banners under the big slider (up to 8). Same height as the old 4 info boxes.
  renderStrip(banners = []) {
    const list = (banners || []).slice(0, 8);
    if (!list.length) return '';
    const esc = v => String(v === undefined || v === null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const safeLink = l => { const s = String(l || '').trim(); return /^(#\/|\/|https?:\/\/)/i.test(s) ? s : '#/'; };
    const cols = Math.min(list.length, 4);
    return `
      <div class="promo-strip promo-strip-${cols}">
        ${list.map(b => {
          const img = b.imageUrl || b.image || '';
          const external = /^https?:\/\//i.test(String(b.linkUrl || ''));
          const hasText = b.title || b.subtitle || b.badgeText;
          return `
          <a href="${esc(safeLink(b.linkUrl))}" class="promo-strip-item" ${external ? 'target="_blank" rel="noopener"' : ''} style="background:${esc(b.bgGradient || 'linear-gradient(135deg,#059669,#065f46)')}">
            ${img ? `<img src="${esc(img)}" alt="${esc(b.title || 'عرض')}" loading="lazy" />` : ''}
            ${hasText ? `
              <div class="promo-strip-text">
                ${b.badgeText ? `<span class="promo-strip-badge">${esc(b.badgeText)}</span>` : ''}
                ${b.title ? `<span class="promo-strip-title">${esc(b.title)}</span>` : ''}
                ${b.subtitle ? `<span class="promo-strip-sub">${esc(b.subtitle)}</span>` : ''}
              </div>` : ''}
          </a>`;
        }).join('')}
      </div>`;
  },

  renderSlider(banners = []) {
    if (!banners || banners.length === 0) return '';

    return `
      <div class="hero-slider-container">
        <div class="slider-wrapper">
          ${banners.map((b, idx) => {
            const isFull = b.bannerType === 'image_full_width';
            if (isFull) {
              return `
                <div class="slide-item ${idx === 0 ? 'active' : ''} slide-item-full relative overflow-hidden" data-slide-index="${idx}">
                  <a href="${b.linkUrl || '#/products'}" class="block w-full h-full relative">
                    <img src="${b.imageUrl || 'https://images.unsplash.com/photo-1607082348824-0a96f2a4b9da?w=1200'}" class="w-full h-full object-cover" loading="${idx === 0 ? 'eager' : 'lazy'}" decoding="async" alt="${b.title || 'بنر سوقي ستور'}" />
                    ${(b.title || b.badgeText) ? `
                      <div class="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent flex items-end p-6 md:p-10 text-white">
                        <div>
                          ${b.badgeText ? `<span class="slide-badge mb-2">${b.badgeText}</span>` : ''}
                          ${b.title ? `<h2 class="slide-title text-xl md:text-3xl font-black text-white">${b.title}</h2>` : ''}
                          ${b.subtitle ? `<p class="slide-subtitle text-slate-200 mt-1">${b.subtitle}</p>` : ''}
                        </div>
                      </div>
                    ` : ''}
                  </a>
                </div>
              `;
            }
            return `
              <div class="slide-item ${idx === 0 ? 'active' : ''}" style="background: ${b.bgGradient || '#0f172a'};" data-slide-index="${idx}">
                <div class="slide-content">
                  ${b.badgeText ? `<span class="slide-badge">${b.badgeText}</span>` : ''}
                  <h2 class="slide-title">${b.title}</h2>
                  <p class="slide-subtitle">${b.subtitle || ''}</p>
                  <a href="${b.linkUrl || '#/products'}" class="btn-cta">
                    <span>تسوق الآن</span>
                    <i class="fa-solid fa-arrow-left"></i>
                  </a>
                </div>
                <div class="slide-media">
                  <img src="${b.imageUrl || 'https://images.unsplash.com/photo-1607082348824-0a96f2a4b9da?w=600'}" class="slide-img" loading="${idx === 0 ? 'eager' : 'lazy'}" decoding="async" alt="${b.title || 'سوقي ستور'}" />
                </div>
              </div>
            `;
          }).join('')}
        </div>

        <!-- Arrows -->
        <button class="slider-nav-btn slider-nav-prev" onclick="HomePage.changeSlide(-1)" title="السابق">
          <i class="fa-solid fa-angle-right"></i>
        </button>
        <button class="slider-nav-btn slider-nav-next" onclick="HomePage.changeSlide(1)" title="التالي">
          <i class="fa-solid fa-angle-left"></i>
        </button>

        <!-- Dots -->
        <div class="slider-dots">
          ${banners.map((_, idx) => `
            <div class="dot ${idx === 0 ? 'active' : ''}" onclick="HomePage.goToSlide(${idx})"></div>
          `).join('')}
        </div>
      </div>
    `;
  },

  initSliderEvents() {
    clearInterval(this.sliderInterval);
    if (this.banners.length <= 1) return;

    this.sliderInterval = setInterval(() => {
      this.changeSlide(1);
    }, 5500);
  },

  changeSlide(direction) {
    if (!this.banners.length) return;
    this.goToSlide((this.currentSlide + direction + this.banners.length) % this.banners.length);
  },

  goToSlide(index) {
    this.currentSlide = index;
    const slides = document.querySelectorAll('.slide-item');
    const dots = document.querySelectorAll('.slider-dots .dot');

    slides.forEach((s, idx) => {
      s.classList.toggle('active', idx === index);
    });
    dots.forEach((d, idx) => {
      d.classList.toggle('active', idx === index);
    });
  },

  renderProductCard(product) {
    State.registerProduct(product);
    const hasDiscount = product.compareAtPrice && product.compareAtPrice > product.price;
    const discountPercent = hasDiscount
      ? Math.round(((product.compareAtPrice - product.price) / product.compareAtPrice) * 100)
      : 0;

    const mainImage = Array.isArray(product.images) && product.images.length > 0
      ? product.images[0]
      : (product.image || '/images/no-image.svg');

    return `
      <div class="product-card">
        <div class="product-thumb-wrapper">
          <button class="btn-wishlist ${State.isInWishlist(product.id) ? 'active' : ''}" data-wishlist-id="${product.id}" onclick="State.toggleWishlist('${product.id}', event)" title="أضف إلى المفضلة">
            <i class="${State.isInWishlist(product.id) ? 'fa-solid' : 'fa-regular'} fa-heart"></i>
          </button>
          <a href="#/product/${product.id}" class="block w-full h-full">
            <img src="${mainImage}" alt="${product.title}" class="product-thumb" loading="lazy" decoding="async" />
          </a>
          ${hasDiscount ? `
            <span class="discount-badge">وفر ${discountPercent}%</span>
          ` : ''}
          <span class="sale-unit-badge">لكل ${product.saleUnit || 'قطعة'}</span>
        </div>

        <div class="product-info">
          ${product.brand ? `
            <a href="#/category/all?brand=${encodeURIComponent(product.brand)}" class="text-[11px] font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 px-2.5 py-0.5 rounded-full inline-block mb-1.5 w-fit">
              <i class="fa-solid fa-award ml-1"></i>${product.brand}
            </a>
          ` : ''}

          <a href="#/product/${product.id}" class="product-title" title="${product.title}">
            ${product.title}
          </a>

          ${product.reviewCount > 0 ? `
            <div class="product-rating">
              <i class="fa-solid fa-star"></i>
              <span class="font-bold text-slate-700">${product.ratingAverage}</span>
              <span class="product-rating-count">(${product.reviewCount})</span>
            </div>
          ` : `<div class="product-rating text-slate-400 text-[11px]"><span>جديد • لا توجد تقييمات بعد</span></div>`}

          <div class="product-pricing">
            <span class="price-current">${product.price}</span>
            <span class="price-currency">ج.م</span>
            ${hasDiscount ? `
              <span class="price-original">${product.compareAtPrice} ج.م</span>
            ` : ''}
          </div>

          <div class="text-[11px] mt-1 mb-2 font-medium">
            ${product.isFreeShipping || product.shippingCost === 0
              ? '<span class="text-emerald-600 font-bold"><i class="fa-solid fa-truck-fast"></i> شحن مجاني</span>'
              : `<span class="text-slate-500"><i class="fa-solid fa-truck"></i> شحن: ${product.shippingCost || 25} ج.م</span>`}
          </div>

          <!-- Product Guarantee Badge -->
          <div class="product-warranty-badge text-[10.5px] text-emerald-800 bg-emerald-50/90 rounded-lg py-1 px-2 mb-3 flex items-center gap-1.5 font-bold border border-emerald-200/70 leading-snug">
            <i class="fa-solid fa-shield-check text-emerald-600 flex-shrink-0 text-xs"></i>
            <span>ضمان استبدال خلال 14 يوم في حالة عيب الصناعة</span>
          </div>

          ${Array.isArray(product.variants) && product.variants.length > 0 ? `
            <a class="btn-add-cart" href="#/product/${product.id}">
              <i class="fa-solid fa-sliders"></i>
              <span>اختار المقاس/اللون</span>
            </a>
          ` : `
            <button class="btn-add-cart" onclick="State.addToCartById('${product.id}')">
              <i class="fa-solid fa-cart-plus"></i>
              <span>أضف إلى السلة</span>
            </button>
          `}
        </div>
      </div>
    `;
  }
};
