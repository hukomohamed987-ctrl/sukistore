/**
 * Suki Store Single Product Details Page
 */

const ProductPage = {
  product: null,
  selectedOptions: {},
  currentImageIndex: 0,
  quantity: 1,

  async render(productId) {
    const main = document.getElementById('main-content');
    main.innerHTML = `
      <div class="container py-12 text-center text-slate-400">
        <i class="fa-solid fa-spinner fa-spin text-3xl mb-3 text-emerald-600"></i>
        <div>جاري تحميل بيانات المنتج...</div>
      </div>
    `;

    try {
      const res = await API.get(`/products/${productId}`);
      if (!res.success || !res.product) {
        main.innerHTML = `<div class="container py-16 text-center text-red-500 font-bold">المنتج غير موجود أو تم حذفه</div>`;
        return;
      }

      this.product = res.product;
      this.selectedOptions = {};
      this.currentImageIndex = 0;
      this.quantity = 1;

      // Initialize default selections for variations (prefer the first option that is in stock)
      const firstInStock = Array.isArray(this.product.variants)
        ? this.product.variants.find(v => (Number(v.stock) || 0) > 0)
        : null;
      if (Array.isArray(this.product.variations)) {
        this.product.variations.forEach(v => {
          if (firstInStock && firstInStock.options && firstInStock.options[v.name] !== undefined) {
            this.selectedOptions[v.name] = firstInStock.options[v.name];
          } else if (v.values && v.values.length > 0) {
            this.selectedOptions[v.name] = v.values[0];
          }
        });
      }

      this.renderFullView();
    } catch (err) {
      console.error('Product render error:', err);
      main.innerHTML = `<div class="container py-16 text-center text-red-500 font-bold">فشل تحميل تفاصيل المنتج</div>`;
    }
  },

  renderFullView() {
    const p = this.product;
    const main = document.getElementById('main-content');

    // Learn from customer view
    if (typeof SmartRecommendations !== 'undefined') {
      SmartRecommendations.recordProductView(p);
    }

    const images = Array.isArray(p.images) && p.images.length > 0
      ? p.images
      : [p.image || '/images/no-image.svg'];

    // Per-option stock / price: the chosen size/colour decides what is available and its price
    const variant = this.getSelectedVariant();
    const hasVariantList = Array.isArray(p.variants) && p.variants.length > 0;
    const stockNow = hasVariantList ? (variant ? Number(variant.stock) || 0 : 0) : (Number(p.stock) || 0);
    const priceNow = variant && variant.price ? variant.price : p.price;
    const skuNow = (variant && variant.sku) || p.sku || '';

    const hasDiscount = p.compareAtPrice && p.compareAtPrice > priceNow;
    const discountPercent = hasDiscount
      ? Math.round(((p.compareAtPrice - priceNow) / p.compareAtPrice) * 100)
      : 0;

    const currentGov = State.getDeliveryGovernorate();
    const hasGovRestrictions = Array.isArray(p.allowedGovernorates) && p.allowedGovernorates.length > 0;
    const isGovAllowed = !hasGovRestrictions || p.allowedGovernorates.some(g => g.trim() === currentGov || currentGov.includes(g.trim()) || g.trim().includes(currentGov));

    main.innerHTML = `
      <div class="container py-6">
        <!-- Breadcrumb -->
        <div class="flex items-center gap-2 text-xs text-slate-500 mb-6 font-semibold">
          <a href="#/" class="hover:text-emerald-600">الرئيسية</a>
          <span>/</span>
          ${p.category ? `
            <a href="#/category/${p.category.id}" class="hover:text-emerald-600">${p.category.name}</a>
            <span>/</span>
          ` : ''}
          <span class="text-slate-800 font-bold truncate max-w-sm">${p.title}</span>
        </div>

        <!-- Product Hero Details Box -->
        <div class="product-details-container">
          <!-- Gallery -->
          <div>
            <div class="gallery-main-img-box">
              <img id="detail-main-img" src="${images[this.currentImageIndex]}" alt="${p.title}" class="gallery-main-img" loading="lazy" decoding="async" />
            </div>

            <!-- Thumbnails -->
            ${images.length > 1 ? `
              <div class="gallery-thumbs">
                ${images.map((img, idx) => `
                  <button class="thumb-btn ${idx === this.currentImageIndex ? 'active' : ''}" onclick="ProductPage.changeImage(${idx})">
                    <img src="${img}" alt="صورة ${idx + 1}" loading="lazy" decoding="async" />
                  </button>
                `).join('')}
              </div>
            ` : ''}

            <!-- Video Button if exists -->
            ${p.videoUrl ? `
              <div class="mt-4">
                <button onclick="ProductPage.openVideoModal('${p.videoUrl}')" class="w-full bg-slate-800 hover:bg-slate-900 text-white py-2.5 px-4 rounded-xl font-bold text-sm flex items-center justify-center gap-2">
                  <i class="fa-solid fa-play text-red-500"></i>
                  <span>مشاهدة فيديو توضيحي للمنتج</span>
                </button>
              </div>
            ` : ''}
          </div>

          <!-- Product Info & Actions -->
          <div class="flex flex-col">
            ${p.brand ? `
              <a href="#/category/all?brand=${encodeURIComponent(p.brand)}" class="text-xs font-bold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 px-3 py-1 rounded-full mb-2.5 inline-flex items-center gap-1.5 w-fit border border-emerald-100">
                <i class="fa-solid fa-award text-amber-500"></i> العلامة التجارية: <span>${p.brand}</span>
              </a>
            ` : ''}

            <h1 class="detail-title">${p.title}</h1>

            <div class="flex items-center gap-4 mb-3">
              ${p.reviewCount > 0 ? `
                <div class="product-rating text-base">
                  <i class="fa-solid fa-star"></i>
                  <span class="font-bold text-slate-800">${p.ratingAverage}</span>
                  <span class="product-rating-count">(${p.reviewCount} تقييم)</span>
                </div>
              ` : `<span class="text-xs font-bold text-slate-400"><i class="fa-regular fa-star"></i> لا توجد تقييمات بعد</span>`}
              <span class="text-slate-300">•</span>
              <span class="detail-unit-badge">وحدة البيع: ${p.saleUnit || 'قطعة'}</span>
              <span class="text-slate-300">•</span>
              <span class="text-xs font-bold ${stockNow > 0 ? 'text-emerald-600' : 'text-red-500'}">
                ${stockNow > 0 ? `متوفر في المخزون (${stockNow})` : (variant ? 'الاختيار ده خلص' : 'نفذت الكمية')}
              </span>
              ${skuNow ? `<span class="text-slate-300">•</span><span class="text-[11px] text-slate-400 font-mono">SKU: ${skuNow}</span>` : ''}
            </div>

            <!-- Price Box -->
            <div class="detail-price-box">
              <div class="flex items-baseline gap-3">
                <span class="text-3xl font-extrabold text-emerald-600">${priceNow}</span>
                <span class="text-slate-600 font-bold">ج.م</span>
                ${hasDiscount ? `
                  <span class="text-slate-400 line-through text-base font-semibold">${p.compareAtPrice} ج.م</span>
                  <span class="bg-red-500 text-white font-extrabold text-xs px-2.5 py-1 rounded-full">وفر ${discountPercent}%</span>
                ` : ''}
              </div>
              <div class="text-xs text-slate-500 mt-2 font-medium flex items-center justify-between flex-wrap gap-2">
                <span><i class="fa-solid fa-hand-holding-dollar text-emerald-600"></i> الدفع عند الاستلام متاح</span>
                ${(() => {
                  const currentGov = State.getDeliveryGovernorate();
                  if (p.isFreeShipping || p.shippingCost === 0) {
                    return '<span class="text-emerald-700 font-bold"><i class="fa-solid fa-truck-fast"></i> شحن مجاني لكافة المحافظات 🎉</span>';
                  } else if (p.governorateShipping && p.governorateShipping[currentGov] !== undefined && p.governorateShipping[currentGov] !== '') {
                    return `<span class="text-slate-700 font-bold"><i class="fa-solid fa-truck text-emerald-600"></i> الشحن إلى ${currentGov}: ${p.governorateShipping[currentGov]} ج.م</span>`;
                  } else if (p.shippingCost) {
                    return `<span class="text-slate-700 font-bold"><i class="fa-solid fa-truck text-emerald-600"></i> الشحن إلى ${currentGov}: ${p.shippingCost} ج.م</span>`;
                  } else {
                    return `<span class="text-slate-700 font-bold"><i class="fa-solid fa-truck text-emerald-600"></i> شحن سريع إلى ${currentGov}</span>`;
                  }
                })()}
              </div>

              <!-- Delivery Destination Bar (SHEIN Style with Eligibility Check) -->
              <div class="mt-3 pt-2.5 border-t border-slate-100 text-xs">
                <div class="flex items-center justify-between">
                  <div class="flex items-center gap-1.5 text-slate-600 font-bold">
                    <i class="fa-solid fa-location-dot text-amber-500"></i>
                    <span>التوصيل إلى: <strong class="text-emerald-700">${currentGov}</strong></span>
                  </div>
                  <button type="button" onclick="State.openChangeAddressModal()" class="text-emerald-600 hover:text-emerald-700 font-bold underline cursor-pointer">
                    تغيير 📍
                  </button>
                </div>
                ${!isGovAllowed ? `
                  <div class="mt-2 p-2.5 bg-red-50 text-red-700 rounded-xl border border-red-200 flex items-center gap-2 font-bold text-[11px] leading-snug">
                    <i class="fa-solid fa-triangle-exclamation text-red-600 text-sm flex-shrink-0"></i>
                    <span>عذراً، هذا المنتج غير متاح للشحن لمحافظة (${currentGov}). يُرجى تغيير المحافظة لمتابعة الشراء.</span>
                  </div>
                ` : ''}
              </div>
            </div>

            <!-- Dynamic Variations -->
            ${Array.isArray(p.variations) && p.variations.length > 0 ? `
              <div class="my-4">
                ${p.variations.map(variation => `
                  <div class="variation-group">
                    <span class="variation-label">${variation.name}: <strong class="text-emerald-700">${this.selectedOptions[variation.name] || ''}</strong></span>
                    <div class="variation-options">
                      ${(variation.values || []).map(val => {
                        const soldOut = hasVariantList && !this.optionHasStock(variation.name, val);
                        return `
                        <button
                          class="variation-pill ${this.selectedOptions[variation.name] === val ? 'active' : ''} ${soldOut ? 'opacity-40 line-through' : ''}"
                          title="${soldOut ? 'خلص من المخزون' : ''}"
                          data-name="${String(variation.name).replace(/"/g, '&quot;')}" data-val="${String(val).replace(/"/g, '&quot;')}"
                          onclick="ProductPage.selectOption(this.dataset.name, this.dataset.val)">
                          ${val}
                        </button>
                      `;}).join('')}
                    </div>
                  </div>
                `).join('')}
              </div>
            ` : ''}

            <!-- Quantity Stepper -->
            <div class="my-4">
              <div class="flex items-center justify-between mb-1.5">
                <span class="variation-label">الكمية المطلوبة:</span>
                <span class="text-xs font-bold ${stockNow > 0 ? (stockNow <= 5 ? 'text-amber-600 animate-pulse' : 'text-slate-500') : 'text-red-500'}">
                  ${stockNow > 0 ? (stockNow <= 5 ? `متبقي ${stockNow} فقط في المخزون!` : `المتاح: ${stockNow} قطعة`) : 'غير متوفر بالمخزون'}
                </span>
              </div>
              ${stockNow > 0 ? `
                <div class="quantity-stepper">
                  <button class="stepper-btn" onclick="ProductPage.changeQty(-1)">-</button>
                  <input type="text" class="stepper-input" id="detail-qty-input" value="${this.quantity}" readonly />
                  <button class="stepper-btn" onclick="ProductPage.changeQty(1)">+</button>
                </div>
              ` : `
                <div class="p-2.5 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 text-red-700 text-xs font-bold flex items-center gap-2">
                  <i class="fa-solid fa-triangle-exclamation"></i>
                  <span>${variant || hasVariantList ? 'الاختيار ده خلص من المخزون، جرّب مقاس أو لون تاني' : 'نفدت كمية هذا المنتج من المخزون مؤقتاً'}</span>
                </div>
              `}
            </div>

            <!-- Action Buttons -->
            <div class="action-buttons-group">
              ${stockNow > 0 ? `
                <button class="btn-primary-action flex-1 ${!isGovAllowed ? 'opacity-50 cursor-not-allowed' : ''}" onclick="${isGovAllowed ? 'ProductPage.handleAddToCart()' : 'App.showToast(\'هذا المنتج غير متاح للشحن لمحافظتك\', \'warning\')'}">
                  <i class="fa-solid fa-cart-plus"></i>
                  <span>أضف إلى السلة</span>
                </button>
                <button class="btn-secondary-action ${!isGovAllowed ? 'opacity-50 cursor-not-allowed' : ''}" onclick="${isGovAllowed ? 'ProductPage.handleBuyNow()' : 'App.showToast(\'هذا المنتج غير متاح للشحن لمحافظتك\', \'warning\')'}">
                  <i class="fa-solid fa-bolt"></i>
                  <span>شراء الآن</span>
                </button>
              ` : `
                <button disabled class="btn-primary-action flex-1 opacity-50 cursor-not-allowed bg-slate-400">
                  <i class="fa-solid fa-box-open"></i>
                  <span>نفدت الكمية من المخزون</span>
                </button>
              `}
              <button id="product-detail-wishlist-btn" class="w-14 h-12 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-400 hover:text-red-500 hover:border-red-200 flex items-center justify-center text-xl transition shadow-sm ${State.isInWishlist(p.id) ? 'text-red-500 !border-red-300 !bg-red-50 dark:!bg-red-950/40' : ''}" onclick="ProductPage.toggleWishlist(event)" title="أضف إلى المفضلة">
                <i class="${State.isInWishlist(p.id) ? 'fa-solid' : 'fa-regular'} fa-heart"></i>
              </button>
            </div>

            <!-- Social Share Bar -->
            <div class="mt-4 p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700 flex items-center justify-between flex-wrap gap-2">
              <div class="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <i class="fa-solid fa-share-nodes text-emerald-600"></i>
                <span>مشاركة المنتج:</span>
              </div>
              <div class="flex items-center gap-2">
                <a href="${this.getWhatsappShareUrl()}" target="_blank" rel="noopener noreferrer" class="bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition shadow-sm">
                  <i class="fa-brands fa-whatsapp text-sm"></i>
                  <span>واتساب</span>
                </a>
                <a href="${this.getFacebookShareUrl()}" target="_blank" rel="noopener noreferrer" class="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition shadow-sm">
                  <i class="fa-brands fa-facebook text-sm"></i>
                  <span>فيسبوك</span>
                </a>
                <button onclick="ProductPage.copyProductLink()" class="bg-white dark:bg-slate-700 hover:bg-slate-100 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-600 text-xs font-bold px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition">
                  <i class="fa-regular fa-copy"></i>
                  <span>نسخ الرابط</span>
                </button>
              </div>
            </div>

            <!-- Official Guarantee Badge (Requirement 7) -->
            <div class="mt-6 pt-6 border-t border-slate-100">
              <div class="p-3.5 bg-emerald-50 rounded-2xl border border-emerald-200 text-xs text-emerald-950 font-bold leading-relaxed flex items-center gap-3 shadow-sm">
                <div class="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center text-lg flex-shrink-0 shadow-sm">
                  <i class="fa-solid fa-shield-halved"></i>
                </div>
                <div>
                  <div class="font-black text-sm text-emerald-900 mb-0.5">ضمان سوقي ستور المعتمد 🛡️</div>
                  <div class="font-bold text-emerald-800 text-[11.5px] leading-snug">
                    ضمان استبدال خلال 14 يوم في حالة عيب الصناعة.
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Description & Reviews Tabs -->
        <div class="bg-white rounded-2xl border border-slate-200 p-6 md:p-8 shadow-sm my-8">
          <div class="border-b border-slate-200 pb-4 mb-6">
            <h3 class="text-xl font-bold text-slate-800">وصف ومواصفات المنتج</h3>
          </div>
          <div class="text-slate-700 leading-relaxed text-sm md:text-base whitespace-pre-line mb-8">
            ${p.description || 'لا يوجد وصف متاح لهذا المنتج حالياً.'}
          </div>

          <!-- Customer Reviews Section -->
          <div class="border-t border-slate-200 pt-8">
            <div class="flex items-center justify-between flex-wrap gap-4 mb-6">
              <div>
                <h3 class="text-xl font-bold text-slate-800">تقييمات وآراء العملاء</h3>
                <div class="text-sm text-slate-500 font-medium">بناءً على ${p.reviewCount || 0} تقييم حقيقي</div>
              </div>
              <button onclick="ProductPage.openReviewModal()" class="bg-emerald-50 text-emerald-700 font-bold px-4 py-2 rounded-xl text-sm hover:bg-emerald-100 flex items-center gap-2">
                <i class="fa-solid fa-pen"></i> أضف تقييمك
              </button>
            </div>

            <!-- Reviews list -->
            ${Array.isArray(p.reviews) && p.reviews.length > 0 ? `
              <div class="flex flex-col gap-4">
                ${p.reviews.map(r => `
                  <div class="bg-slate-50 p-4 rounded-xl border border-slate-100">
                    <div class="flex items-center justify-between mb-2">
                      <div class="flex items-center gap-3">
                        <img src="${r.userAvatar || 'https://api.dicebear.com/7.x/initials/svg?seed=' + encodeURIComponent(r.userName)}" class="w-8 h-8 rounded-full border border-slate-200 object-cover" loading="lazy" decoding="async" />
                        <div>
                          <div class="font-bold text-sm text-slate-800">${ProductPage.esc(r.userName)}</div>
                          ${r.isVerifiedPurchase ? `
                            <span class="text-[11px] text-emerald-600 font-bold flex items-center gap-1">
                              <i class="fa-solid fa-circle-check"></i> عملية شراء مؤكدة
                            </span>
                          ` : ''}
                        </div>
                      </div>
                      <div class="text-amber-500 text-xs">
                        ${Array.from({ length: 5 }).map((_, i) => `
                          <i class="fa-${i < r.rating ? 'solid' : 'regular'} fa-star"></i>
                        `).join('')}
                      </div>
                    </div>
                    <p class="text-sm text-slate-700 leading-relaxed mt-2">${ProductPage.esc(r.comment)}</p>
                    ${r.adminReply ? `
                      <div class="mt-2 p-2.5 rounded-lg bg-emerald-50 border border-emerald-100 text-xs text-emerald-900">
                        <span class="font-black"><i class="fa-solid fa-store"></i> رد سوقي ستور:</span> ${ProductPage.esc(r.adminReply)}
                      </div>
                    ` : ''}
                    <div class="text-[11px] text-slate-400 mt-2">${new Date(r.createdAt).toLocaleDateString('ar-EG')}</div>
                  </div>
                `).join('')}
              </div>
            ` : `
              <div class="text-center py-8 text-slate-400 text-sm">
                لا توجد تقييمات لهذا المنتج بعد. كن أول من يقيّم المنتج!
              </div>
            `}
          </div>
        </div>

        <!-- Similar Products Section (Carousel of up to 10 similar products with Left/Right arrows) -->
        ${Array.isArray(p.related) && p.related.length > 0 ? `
          <div class="my-10">
            <div class="flex items-center justify-between mb-4 flex-wrap gap-2">
              <div>
                <h2 class="text-xl md:text-2xl font-black text-slate-900 flex items-center gap-2">
                  <i class="fa-solid fa-clone text-emerald-600"></i>
                  <span>منتجات مشابهة (${p.related.length} منتج)</span>
                </h2>
                <p class="text-xs text-slate-500 mt-1">منتجات مختارة بعناية من نفس الفئة والماركة قد تناسب اهتماماتك</p>
              </div>
              <!-- Carousel scroll arrows -->
              <div class="flex items-center gap-2">
                <button type="button" onclick="ProductPage.scrollSimilar('right')" class="w-9 h-9 rounded-full bg-white border border-slate-200 shadow-sm text-slate-700 hover:bg-emerald-50 hover:text-emerald-600 transition flex items-center justify-center font-bold" title="السابق">
                  <i class="fa-solid fa-chevron-right text-sm"></i>
                </button>
                <button type="button" onclick="ProductPage.scrollSimilar('left')" class="w-9 h-9 rounded-full bg-white border border-slate-200 shadow-sm text-slate-700 hover:bg-emerald-50 hover:text-emerald-600 transition flex items-center justify-center font-bold" title="التالي">
                  <i class="fa-solid fa-chevron-left text-sm"></i>
                </button>
              </div>
            </div>

            <!-- Horizontal Scrollable Track -->
            <div id="similar-products-track" class="flex items-stretch gap-4 overflow-x-auto pb-4 scroll-smooth scrollbar-thin snap-x">
              ${p.related.map(rel => `
                <div class="snap-start flex-shrink-0 w-64 md:w-72">
                  ${HomePage.renderProductCard(rel)}
                </div>
              `).join('')}
            </div>
          </div>
        ` : ''}
      </div>
    `;
  },

  scrollSimilar(direction) {
    const track = document.getElementById('similar-products-track');
    if (!track) return;
    const distance = 300;
    if (direction === 'left') {
      track.scrollBy({ left: -distance, behavior: 'smooth' });
    } else {
      track.scrollBy({ left: distance, behavior: 'smooth' });
    }
  },

  changeImage(index) {
    this.currentImageIndex = index;
    const imgEl = document.getElementById('detail-main-img');
    const images = Array.isArray(this.product.images) ? this.product.images : [this.product.image];
    if (imgEl && images[index]) {
      imgEl.src = images[index];
    }
    const thumbs = document.querySelectorAll('.thumb-btn');
    thumbs.forEach((t, i) => t.classList.toggle('active', i === index));
  },

  esc(str) {
    return String(str === undefined || str === null ? '' : str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  },

  selectOption(name, value) {
    this.selectedOptions[name] = value;
    this.quantity = 1;
    this.renderFullView();
  },

  // The variant (size/colour combination with its own stock & price) matching the selection
  getSelectedVariant(selection = this.selectedOptions) {
    const list = this.product && Array.isArray(this.product.variants) ? this.product.variants : [];
    return list.find(v => {
      const opts = v.options || {};
      const keys = Object.keys(opts);
      return keys.length > 0 && keys.every(k => String(selection[k] || '').trim() === String(opts[k]).trim());
    }) || null;
  },

  // Is there any stock for this value, given the other options already chosen?
  optionHasStock(name, value) {
    const list = this.product && Array.isArray(this.product.variants) ? this.product.variants : [];
    return list.some(v => {
      const opts = v.options || {};
      if (String(opts[name] || '').trim() !== String(value).trim()) return false;
      if ((Number(v.stock) || 0) <= 0) return false;
      return Object.keys(opts).every(k => k === name || !this.selectedOptions[k] || String(this.selectedOptions[k]).trim() === String(opts[k]).trim());
    });
  },

  currentStock() {
    const p = this.product;
    if (!p) return 0;
    if (Array.isArray(p.variants) && p.variants.length) {
      const v = this.getSelectedVariant();
      return v ? Math.max(0, Number(v.stock) || 0) : 0;
    }
    return typeof p.stock === 'number' ? Math.max(0, p.stock) : (parseInt(p.stock, 10) || 0);
  },

  // Product copy carrying the chosen option's price, for the cart display
  productForCart() {
    const v = this.getSelectedVariant();
    if (!v) return this.product;
    return { ...this.product, price: v.price || this.product.price, stock: Math.max(0, Number(v.stock) || 0) };
  },

  changeQty(delta) {
    const maxStock = this.currentStock();
    if (maxStock <= 0) {
      this.quantity = 0;
      App.showToast('عفواً، هذا المنتج غير متوفر في المخزون', 'warning');
      return;
    }

    // Check quantity already in cart
    const inCart = (State.cart || [])
      .filter(i => String(i.productId || i.id) === String(this.product?.id))
      .reduce((sum, i) => sum + (Number(i.quantity) || 0), 0);

    if (delta > 0) {
      if (this.quantity >= maxStock) {
        App.showToast(`عفواً، أقصى كمية متاحة في المخزون هي ${maxStock} قطعة فقط ⚠️`, 'warning');
        return;
      }
      if (inCart + this.quantity + delta > maxStock) {
        App.showToast(`لديك بالفعل ${inCart} في السلة، والكمية المتاحة في المخزون هي ${maxStock} قطعة فقط ⚠️`, 'warning');
        return;
      }
    }

    const newQty = Math.max(1, Math.min(maxStock, this.quantity + delta));
    this.quantity = newQty;
    const input = document.getElementById('detail-qty-input');
    if (input) input.value = newQty;
  },

  async handleAddToCart() {
    const maxStock = this.currentStock();
    if (maxStock <= 0) {
      App.showToast('عفواً، الاختيار ده نفدت كميته من المخزون حالياً', 'warning');
      return;
    }
    const ok = await State.addToCart(this.productForCart(), this.quantity, this.selectedOptions);
    if (ok !== false) {
      CartDrawer.open();
    }
  },

  async handleBuyNow() {
    const maxStock = this.currentStock();
    if (maxStock <= 0) {
      App.showToast('عفواً، الاختيار ده نفدت كميته من المخزون حالياً', 'warning');
      return;
    }
    const ok = await State.addToCart(this.productForCart(), this.quantity, this.selectedOptions);
    if (ok !== false) {
      window.location.hash = '#/checkout';
    }
  },

  openVideoModal(videoUrl) {
    const isDirect = videoUrl.includes('/uploads/') || videoUrl.endsWith('.mp4') || videoUrl.endsWith('.webm') || videoUrl.endsWith('.mov') || videoUrl.endsWith('.mkv');
    const playerHtml = isDirect
      ? `<video src="${videoUrl}" controls autoplay playsinline class="w-full h-full rounded-xl bg-black"></video>`
      : `<iframe class="w-full h-full rounded-xl" src="${videoUrl.replace('watch?v=', 'embed/')}" frameborder="0" allowfullscreen allow="autoplay; encrypted-media"></iframe>`;

    App.openModal('فيديو توضيحي للمنتج 🎬', `
      <div class="aspect-video w-full bg-slate-900 rounded-xl overflow-hidden shadow-lg">
        ${playerHtml}
      </div>
    `);
  },

  openReviewModal() {
    if (!State.user) {
      AuthModal.open('login');
      App.showToast('يُرجى تسجيل الدخول أولاً لإضافة تقييمك', 'info');
      return;
    }

    App.openModal('إضافة تقييمك للمنتج', `
      <form onsubmit="ProductPage.submitReview(event)">
        <div class="form-group mb-4">
          <label class="form-label">التقييم بالنجوم:</label>
          <div class="flex gap-2 text-2xl text-amber-400 cursor-pointer" id="rating-stars-picker">
            ${[1, 2, 3, 4, 5].map(star => `
              <i class="fa-solid fa-star hover:scale-110 transition-transform" onclick="ProductPage.setReviewStars(${star})" data-star="${star}"></i>
            `).join('')}
          </div>
          <input type="hidden" id="review-stars-val" value="5" />
        </div>

        <div class="form-group mb-4">
          <label class="form-label">تعليقك ورأيك في المنتج:</label>
          <textarea id="review-comment-input" rows="4" class="form-control" placeholder="شاركنا تجربتك مع المنتج، جودته، وسرعة التوصيل..." required></textarea>
        </div>

        <button type="submit" class="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 rounded-xl text-sm">
          نشر التقييم
        </button>
      </form>
    `);
  },

  setReviewStars(stars) {
    const input = document.getElementById('review-stars-val');
    if (input) input.value = stars;
    const starIcons = document.querySelectorAll('#rating-stars-picker i');
    starIcons.forEach((icon, i) => {
      icon.className = i < stars ? 'fa-solid fa-star' : 'fa-regular fa-star';
    });
  },

  async submitReview(e) {
    e.preventDefault();
    const rating = document.getElementById('review-stars-val').value;
    const comment = document.getElementById('review-comment-input').value;

    try {
      const res = await API.post('/reviews', {
        productId: this.product.id,
        rating,
        comment
      });

      if (res.success) {
        App.closeModal();
        App.showToast(res.message, 'success');
        this.render(this.product.id);
      }
    } catch (err) {
      App.showToast(err.message, 'error');
    }
  },

  getShareUrl() {
    return window.location.origin + window.location.pathname + '#/product/' + (this.product ? this.product.id : '');
  },

  getWhatsappShareUrl() {
    const url = encodeURIComponent(this.getShareUrl());
    const text = encodeURIComponent(`شاهد هذا المنتج على سوقي ستور: ${this.product?.title || ''} بسعر ${this.product?.price || ''} ج.م\n` + this.getShareUrl());
    return `https://api.whatsapp.com/send?text=${text}`;
  },

  getFacebookShareUrl() {
    const url = encodeURIComponent(this.getShareUrl());
    return `https://www.facebook.com/sharer/sharer.php?u=${url}`;
  },

  async copyProductLink() {
    const url = this.getShareUrl();
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        const dummy = document.createElement('input');
        document.body.appendChild(dummy);
        dummy.value = url;
        dummy.select();
        document.execCommand('copy');
        document.body.removeChild(dummy);
      }
      App.showToast('تم نسخ رابط المنتج المباشر بنجاح! 📋', 'success');
    } catch {
      App.showToast('تعذر نسخ الرابط تلقائياً', 'warning');
    }
  },

  async toggleWishlist(e) {
    if (!this.product) return;
    await State.toggleWishlist(this.product.id, e);
    const btn = document.getElementById('product-detail-wishlist-btn');
    if (btn) {
      const active = State.isInWishlist(this.product.id);
      btn.className = `w-14 h-12 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-400 hover:text-red-500 hover:border-red-200 flex items-center justify-center text-xl transition shadow-sm ${active ? 'text-red-500 !border-red-300 !bg-red-50 dark:!bg-red-950/40' : ''}`;
      btn.innerHTML = `<i class="${active ? 'fa-solid' : 'fa-regular'} fa-heart"></i>`;
    }
  }
};
