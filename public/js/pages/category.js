/**
 * Suki Store Category & Subcategory Catalog Page
 * Features:
 * - Square Subcategory Banners in a horizontal scroll carousel with Right/Left arrows
 * - Smart Search & live filtering within category/subcategory
 * - 40 items pagination
 * - Guarantee text under each product
 */

const CategoryPage = {
  currentCategoryId: null,
  currentSubcategoryId: null,
  currentBrand: null,
  currentSort: 'newest',
  currentDiscountFilter: false,
  minPrice: '',
  maxPrice: '',
  currentPage: 1,
  pageSize: 40,
  totalPages: 1,
  searchQuery: null,
  categoryBrands: [],
  subcategories: [],

  async render(categoryId = null, queryParams = {}) {
    this.currentCategoryId = categoryId;
    this.currentSubcategoryId = queryParams.subcategory || queryParams.subcategoryId || null;
    this.searchQuery = queryParams.q || null;
    this.currentSort = queryParams.sort || 'newest';
    this.currentBrand = queryParams.brand || null;
    this.currentPage = parseInt(queryParams.page, 10) || 1;

    const main = document.getElementById('main-content');
    main.innerHTML = `
      <div class="container py-12 text-center text-slate-400">
        <i class="fa-solid fa-spinner fa-spin text-4xl mb-3 text-emerald-600"></i>
        <div class="font-bold text-slate-600">جاري تحميل تشكيلة المنتجات والأقسام...</div>
      </div>
    `;

    try {
      let category = null;
      if (this.currentCategoryId && this.currentCategoryId !== 'all') {
        const catRes = await API.get(`/categories/${this.currentCategoryId}`);
        category = catRes.category;
      }

      // Fetch Subcategories for this category (or all if 'all')
      const subParams = {};
      if (this.currentCategoryId && this.currentCategoryId !== 'all') {
        subParams.categoryId = this.currentCategoryId;
      }
      const subRes = await API.get('/categories/subcategories', subParams);
      this.subcategories = (subRes.subcategories || []).filter(s => s.isVisible !== false);

      // Fetch brands for this category
      const brandParams = {};
      if (this.currentCategoryId && this.currentCategoryId !== 'all') {
        brandParams.categoryId = this.currentCategoryId;
      }
      const brandsRes = await API.get('/brands', brandParams);
      this.categoryBrands = brandsRes.brands || [];

      // Fetch dynamic placement banners (supports multiple banners per category / subcategory)
      let pageBanners = [];
      try {
        if (this.currentSubcategoryId && this.currentSubcategoryId !== 'all') {
          const bRes = await API.get('/banners', { placement: 'subcategory', subcategoryId: this.currentSubcategoryId });
          pageBanners = bRes.banners || [];
        } else if (this.currentCategoryId && this.currentCategoryId !== 'all') {
          const bRes = await API.get('/banners', { placement: 'category', categoryId: this.currentCategoryId });
          pageBanners = bRes.banners || [];
        }
      } catch (e) {
        pageBanners = [];
      }

      // Fetch products with query, pagination (40 items max)
      const params = {
        sort: this.currentSort,
        page: this.currentPage,
        limit: this.pageSize
      };
      if (this.currentCategoryId && this.currentCategoryId !== 'all') {
        params.category = this.currentCategoryId;
      }
      if (this.currentSubcategoryId && this.currentSubcategoryId !== 'all') {
        params.subcategory = this.currentSubcategoryId;
      }
      if (this.currentBrand && this.currentBrand !== 'all') {
        params.brand = this.currentBrand;
      }
      if (this.searchQuery) {
        params.q = this.searchQuery;
      }
      if (this.currentDiscountFilter) {
        params.hasDiscount = 'true';
      }
      if (this.minPrice) {
        params.minPrice = this.minPrice;
      }
      if (this.maxPrice) {
        params.maxPrice = this.maxPrice;
      }

      const productsRes = await API.get('/products', params);
      const products = productsRes.products || [];
      const totalCount = productsRes.count || products.length;
      this.totalPages = productsRes.totalPages || Math.ceil(totalCount / this.pageSize) || 1;

      // Active subcategory object if selected
      const activeSubcategory = this.currentSubcategoryId 
        ? this.subcategories.find(s => String(s.id) === String(this.currentSubcategoryId)) 
        : null;

      main.innerHTML = `
        <div class="container py-6">
          <!-- Breadcrumb -->
          <div class="flex items-center gap-2 text-xs text-slate-500 mb-6 font-semibold flex-wrap">
            <a href="#/" class="hover:text-emerald-600">الرئيسية</a>
            <span>/</span>
            ${category ? `
              <a href="#/category/${category.id}" onclick="CategoryPage.filterBySubcategory(null); return false;" class="hover:text-emerald-600">${category.name}</a>
            ` : this.searchQuery ? `
              <span>نتائج البحث عن: <strong class="text-emerald-700">"${this.searchQuery}"</strong></span>
            ` : `
              <a href="#/category/all" class="text-slate-800 font-bold hover:text-emerald-600">جميع الأقسام</a>
            `}
            ${activeSubcategory ? `
              <span>/</span>
              <span class="text-emerald-700 font-bold">${activeSubcategory.name}</span>
            ` : ''}
            ${this.currentBrand ? `
              <span>/</span>
              <span class="text-emerald-700 font-bold">ماركة: ${this.currentBrand}</span>
            ` : ''}
          </div>

          <!-- Category / Subcategory Hero Banner(s) -->
          ${(() => {
            if (pageBanners && pageBanners.length > 0) {
              return `
                <div class="space-y-4 mb-6">
                  ${pageBanners.map(b => `
                    <div class="relative rounded-2xl overflow-hidden shadow-md border border-slate-200 aspect-[21/9] sm:aspect-[24/7] max-h-64 bg-slate-900 group">
                      <a href="${b.linkUrl || 'javascript:void(0)'}" class="block w-full h-full relative">
                        <img src="${b.imageUrl}" class="w-full h-full object-cover transition duration-300 group-hover:scale-102" loading="lazy" decoding="async" />
                        ${(b.title || b.badgeText) ? `
                          <div class="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent flex items-end p-6 text-white">
                            <div>
                              ${b.badgeText ? `<span class="bg-emerald-600 text-white text-xs font-black px-2.5 py-1 rounded-full inline-block mb-1 shadow-sm">${b.badgeText}</span>` : ''}
                              ${b.title ? `<h2 class="text-xl md:text-3xl font-black text-white">${b.title}</h2>` : ''}
                              ${b.subtitle ? `<p class="text-xs md:text-sm text-slate-200 mt-1 line-clamp-1">${b.subtitle}</p>` : ''}
                            </div>
                          </div>
                        ` : ''}
                      </a>
                    </div>
                  `).join('')}
                </div>
              `;
            }

            const activeSub = this.subcategories.find(s => String(s.id) === String(this.currentSubcategoryId));
            if (activeSub && activeSub.bannerUrl) {
              return `
                <div class="relative rounded-2xl mb-6 overflow-hidden shadow-lg min-h-[160px] md:min-h-[220px] flex items-center bg-slate-900 text-white">
                  <img src="${activeSub.bannerUrl}" class="absolute inset-0 w-full h-full object-cover opacity-50" loading="lazy" decoding="async" />
                  <div class="relative z-10 p-6 md:p-10 max-w-2xl">
                    <div class="inline-flex items-center gap-1.5 bg-emerald-500 text-white text-xs font-bold px-3 py-1 rounded-full mb-2 shadow-sm">
                      <i class="fa-solid fa-tag"></i> <span>${activeSub.discountText || 'عروض مميزة'}</span>
                    </div>
                    <h1 class="text-2xl md:text-4xl font-black mb-2 text-white">${activeSub.bannerTitle || activeSub.name}</h1>
                    <p class="text-slate-200 text-xs md:text-sm font-medium leading-relaxed">${activeSub.bannerSubtitle || activeSub.description || ''}</p>
                  </div>
                </div>
              `;
            }
            if (category) {
              const bgImg = category.bannerUrl || '';
              return `
                <div class="relative text-white rounded-2xl p-6 md:p-8 mb-6 flex flex-col md:flex-row items-center justify-between gap-6 shadow-md overflow-hidden ${bgImg ? 'bg-slate-900' : 'bg-gradient-to-r from-emerald-800 to-slate-900'}">
                  ${bgImg ? `<img src="${bgImg}" class="absolute inset-0 w-full h-full object-cover opacity-40" loading="lazy" decoding="async" />` : ''}
                  <div class="relative z-10">
                    <div class="inline-flex items-center gap-1.5 bg-emerald-500/20 text-emerald-300 text-xs px-3 py-1 rounded-full mb-3 border border-emerald-400/30">
                      <i class="fa-solid fa-layer-group"></i>
                      <span>قسم رئيسي</span>
                    </div>
                    <h1 class="text-2xl md:text-3xl font-extrabold mb-2">${category.bannerTitle || category.name}</h1>
                    <p class="text-emerald-100 text-sm max-w-xl leading-relaxed">${category.bannerSubtitle || category.description || ''}</p>
                    <div class="mt-4 text-xs font-bold text-amber-300 flex items-center gap-2">
                      <i class="fa-solid fa-box-open"></i> متوفر حالياً: ${totalCount} منتج في هذا القسم
                    </div>
                  </div>
                  <img src="${category.image || '/uploads/default-category.jpg'}" class="w-28 h-28 md:w-36 md:h-36 rounded-xl object-cover border-2 border-white/20 shadow-lg relative z-10" loading="lazy" decoding="async" />
                </div>
              `;
            }
            return '';
          })()}

          <!-- Square Subcategories Carousel with Left/Right Arrows -->
          ${this.subcategories.length > 0 ? `
            <div class="mb-8">
              <div class="flex items-center justify-between mb-4">
                <div>
                  <h2 class="text-lg md:text-xl font-extrabold text-slate-800 flex items-center gap-2">
                    <i class="fa-solid fa-grip text-emerald-600"></i>
                    <span>الأقسام الفرعية (${this.subcategories.length} أقسام)</span>
                  </h2>
                  <p class="text-xs text-slate-500 mt-1">اضغط على أي قسم فرعي لعرض منتجاته وفلترتها بالكامل</p>
                </div>
                <!-- Carousel Arrow Buttons -->
                <div class="flex items-center gap-2">
                  <button type="button" onclick="CategoryPage.scrollSubcategories('right')" class="w-9 h-9 rounded-full bg-white border border-slate-200 shadow-sm text-slate-700 hover:bg-emerald-50 hover:text-emerald-600 transition flex items-center justify-center font-bold" title="السابق">
                    <i class="fa-solid fa-chevron-right text-sm"></i>
                  </button>
                  <button type="button" onclick="CategoryPage.scrollSubcategories('left')" class="w-9 h-9 rounded-full bg-white border border-slate-200 shadow-sm text-slate-700 hover:bg-emerald-50 hover:text-emerald-600 transition flex items-center justify-center font-bold" title="التالي">
                    <i class="fa-solid fa-chevron-left text-sm"></i>
                  </button>
                </div>
              </div>

              <!-- Square Banners Horizontal Container -->
              <div id="subcategories-scroll-track" class="flex items-center gap-4 overflow-x-auto pb-4 scroll-smooth scrollbar-thin snap-x">
                <!-- All products pill card -->
                <div 
                  onclick="CategoryPage.filterBySubcategory(null)"
                  class="cursor-pointer snap-start flex-shrink-0 w-44 md:w-52 rounded-2xl p-4 border-2 transition text-center flex flex-col items-center justify-center aspect-square shadow-sm ${!this.currentSubcategoryId ? 'border-emerald-600 bg-emerald-50/50 shadow-md ring-2 ring-emerald-500/20' : 'border-slate-200 bg-white hover:border-emerald-300'}">
                  <div class="w-14 h-14 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-2xl mb-3">
                    <i class="fa-solid fa-border-all"></i>
                  </div>
                  <div class="font-extrabold text-sm text-slate-800 mb-1">عرض كل المنتجات</div>
                  <div class="text-[11px] text-slate-500">كافة الأقسام الفرعية</div>
                </div>

                <!-- Subcategory Square Banner Cards -->
                ${this.subcategories.map(sub => {
                  const isSelected = String(this.currentSubcategoryId) === String(sub.id);
                  return `
                    <div 
                      onclick="CategoryPage.filterBySubcategory('${sub.id}')"
                      class="cursor-pointer snap-start flex-shrink-0 w-44 md:w-52 rounded-2xl relative overflow-hidden group border-2 transition aspect-square shadow-sm ${isSelected ? 'border-emerald-600 ring-2 ring-emerald-500/30 shadow-lg' : 'border-slate-200 hover:border-emerald-400 hover:shadow-md'}">
                      
                      <!-- Square Banner Image -->
                      <img src="${sub.image || 'https://images.unsplash.com/photo-1526170375885-4d8ecf77b99f?w=500'}" alt="${sub.name}" class="w-full h-full object-cover transition duration-300 group-hover:scale-105" loading="lazy" decoding="async" />

                      <!-- Discount Text Badge (Optional) -->
                      ${sub.discountText ? `
                        <div class="absolute top-2.5 right-2.5 bg-gradient-to-r from-red-600 to-amber-500 text-white font-extrabold text-[10px] md:text-xs px-2.5 py-1 rounded-full shadow-md flex items-center gap-1 z-10">
                          <i class="fa-solid fa-bolt text-[10px]"></i>
                          <span>${sub.discountText}</span>
                        </div>
                      ` : ''}

                      <!-- Active Check Badge -->
                      ${isSelected ? `
                        <div class="absolute top-2.5 left-2.5 bg-emerald-600 text-white w-6 h-6 rounded-full flex items-center justify-center text-xs shadow-md z-10">
                          <i class="fa-solid fa-check"></i>
                        </div>
                      ` : ''}

                      <!-- Overlay Gradient & Text -->
                      <div class="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-900/60 to-transparent flex flex-col justify-end p-3.5 text-white">
                        <div class="font-black text-sm md:text-base leading-tight drop-shadow-md mb-1">${sub.name}</div>
                        ${sub.description ? `
                          <div class="text-[11px] text-slate-200 line-clamp-2 leading-relaxed opacity-90">${sub.description}</div>
                        ` : ''}
                      </div>
                    </div>
                  `;
                }).join('')}
              </div>
            </div>
          ` : ''}

          <!-- Smart Search Bar inside Category/Subcategory -->
          <div class="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm mb-6">
            <div class="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
              <div class="relative flex-1">
                <i class="fa-solid fa-magnifying-glass absolute right-3.5 top-3.5 text-slate-400 text-sm"></i>
                <input 
                  type="text" 
                  id="category-smart-search"
                  value="${this.searchQuery || ''}"
                  placeholder="ابحث داخل ${activeSubcategory ? activeSubcategory.name : (category ? category.name : 'المنتجات')} بالاسم أو المواصفات..."
                  onkeyup="CategoryPage.handleSearchInput(event)"
                  class="w-full pr-10 pl-10 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs md:text-sm focus:outline-none focus:border-emerald-500 focus:bg-white transition"
                />
                ${this.searchQuery ? `
                  <button onclick="CategoryPage.clearSearch()" class="absolute left-3 top-3 text-slate-400 hover:text-slate-600 text-sm">
                    <i class="fa-solid fa-xmark"></i>
                  </button>
                ` : ''}
              </div>
              <button onclick="CategoryPage.triggerSearch()" class="bg-emerald-600 text-white font-bold text-xs md:text-sm px-5 py-2.5 rounded-xl hover:bg-emerald-700 transition flex items-center justify-center gap-1.5 flex-shrink-0">
                <i class="fa-solid fa-filter"></i>
                <span>تطبيق البحث والفلترة</span>
              </button>
            </div>
          </div>

          <!-- Brands Filter Bar -->
          ${this.categoryBrands.length > 0 ? `
            <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm mb-6">
              <div class="text-xs font-bold text-slate-700 mb-3 flex items-center justify-between">
                <span class="flex items-center gap-1.5"><i class="fa-solid fa-award text-amber-500"></i> تصفح حسب العلامات التجارية:</span>
                ${this.currentBrand ? `
                  <button onclick="CategoryPage.filterByBrand(null)" class="text-red-500 hover:underline text-[11px] font-bold">
                    إلغاء فلتر الماركة &times;
                  </button>
                ` : ''}
              </div>
              <div class="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-thin">
                <button 
                  onclick="CategoryPage.filterByBrand(null)"
                  class="px-3.5 py-1.5 rounded-full text-xs font-bold transition flex-shrink-0 ${!this.currentBrand ? 'bg-emerald-600 text-white shadow-sm' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}">
                  الكل
                </button>
                ${this.categoryBrands.map(b => `
                  <button 
                    onclick="CategoryPage.filterByBrand('${b.name}')"
                    class="px-3.5 py-1.5 rounded-full text-xs font-bold transition flex-shrink-0 flex items-center gap-1.5 ${this.currentBrand === b.name ? 'bg-emerald-600 text-white shadow-sm' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}">
                    <span>${b.name}</span>
                    <span class="text-[10px] opacity-75">(${b.productCount || 0})</span>
                  </button>
                `).join('')}
              </div>
            </div>
          ` : ''}

          <!-- Filters & Sorting Bar -->
          <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm mb-6 flex flex-wrap items-center justify-between gap-4">
            <div class="text-sm font-bold text-slate-700">
              عدد المنتجات: <span class="text-emerald-600 font-extrabold text-base">${totalCount}</span>
              ${totalCount > this.pageSize ? `<span class="text-xs text-slate-400 mr-2">(يعرض 40 منتج بكل صفحة)</span>` : ''}
              ${activeSubcategory ? `<span class="text-xs bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-md mr-2 font-bold">${activeSubcategory.name}</span>` : ''}
            </div>

            <div class="flex flex-wrap items-center gap-3">
              <!-- Discount filter toggle -->
              <label class="flex items-center gap-2 text-xs md:text-sm font-bold text-slate-700 cursor-pointer bg-slate-50 px-3 py-2 rounded-lg border border-slate-200">
                <input 
                  type="checkbox" 
                  ${this.currentDiscountFilter ? 'checked' : ''} 
                  onchange="CategoryPage.toggleDiscount(this.checked)"
                  class="accent-emerald-600 w-4 h-4 cursor-pointer"
                />
                <span>عروض وخصومات فقط 🔥</span>
              </label>

              <!-- Sort Dropdown -->
              <div class="flex items-center gap-2 text-xs md:text-sm">
                <span class="text-slate-500 font-semibold">ترتيب حسب:</span>
                <select onchange="CategoryPage.changeSort(this.value)" class="form-control text-xs md:text-sm py-2 px-3 bg-white font-semibold">
                  <option value="newest" ${this.currentSort === 'newest' ? 'selected' : ''}>الأحدث وصولاً</option>
                  <option value="price_asc" ${this.currentSort === 'price_asc' ? 'selected' : ''}>السعر: من الأقل للأعلى</option>
                  <option value="price_desc" ${this.currentSort === 'price_desc' ? 'selected' : ''}>السعر: من الأعلى للأقل</option>
                  <option value="rating" ${this.currentSort === 'rating' ? 'selected' : ''}>الأعلى تقييماً</option>
                  <option value="discount" ${this.currentSort === 'discount' ? 'selected' : ''}>أكبر نسبة خصم</option>
                </select>
              </div>
            </div>
          </div>

          <!-- Product Grid -->
          ${products.length === 0 ? `
            <div class="bg-white rounded-2xl border border-slate-200 p-16 text-center shadow-sm">
              <div class="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4 text-3xl text-slate-400">
                <i class="fa-solid fa-magnifying-glass"></i>
              </div>
              <h3 class="text-lg font-bold text-slate-800 mb-2">لا توجد منتجات مطابقة لخيارات الفلترة الحالية</h3>
              <p class="text-sm text-slate-500 mb-6">جرّب إلغاء فلتر القسم الفرعي أو الماركة أو الخصم لعرض المزيد من المنتجات</p>
              <button onclick="CategoryPage.resetFilters()" class="inline-block bg-emerald-600 text-white font-bold px-6 py-2.5 rounded-full text-sm hover:bg-emerald-700">
                إعادة ضبط الفلترة بالكامل
              </button>
            </div>
          ` : `
            <div class="products-grid">
              ${products.map(p => HomePage.renderProductCard(p)).join('')}
            </div>

            <!-- Pagination Controls (40 per page) -->
            ${this.totalPages > 1 ? `
              <div class="mt-10 flex items-center justify-center gap-2 flex-wrap">
                <button 
                  onclick="CategoryPage.goToPage(${this.currentPage - 1})"
                  ${this.currentPage <= 1 ? 'disabled' : ''}
                  class="px-4 py-2.5 rounded-xl border border-slate-200 text-xs font-bold flex items-center gap-1.5 transition ${this.currentPage <= 1 ? 'opacity-40 cursor-not-allowed bg-slate-50 text-slate-400' : 'bg-white text-slate-700 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-300'}">
                  <i class="fa-solid fa-angle-right"></i>
                  <span>الصفحة السابقة</span>
                </button>

                <div class="flex items-center gap-1">
                  ${Array.from({ length: this.totalPages }).map((_, i) => {
                    const pageNum = i + 1;
                    if (this.totalPages > 8 && Math.abs(pageNum - this.currentPage) > 3 && pageNum !== 1 && pageNum !== this.totalPages) {
                      if (pageNum === 2 || pageNum === this.totalPages - 1) {
                        return `<span class="px-1 text-slate-400">...</span>`;
                      }
                      return '';
                    }
                    return `
                      <button 
                        onclick="CategoryPage.goToPage(${pageNum})"
                        class="w-10 h-10 rounded-xl text-xs font-bold transition flex items-center justify-center ${this.currentPage === pageNum ? 'bg-emerald-600 text-white shadow-sm' : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'}">
                        ${pageNum}
                      </button>
                    `;
                  }).join('')}
                </div>

                <button 
                  onclick="CategoryPage.goToPage(${this.currentPage + 1})"
                  ${this.currentPage >= this.totalPages ? 'disabled' : ''}
                  class="px-4 py-2.5 rounded-xl border border-slate-200 text-xs font-bold flex items-center gap-1.5 transition ${this.currentPage >= this.totalPages ? 'opacity-40 cursor-not-allowed bg-slate-50 text-slate-400' : 'bg-white text-slate-700 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-300'}">
                  <span>الصفحة التالية</span>
                  <i class="fa-solid fa-angle-left"></i>
                </button>
              </div>
              <div class="text-center text-xs text-slate-400 mt-2 font-semibold">
                عرض الصفحة ${this.currentPage} من إجمالي ${this.totalPages} صفحة
              </div>
            ` : ''}
          `}
        </div>
      `;
    } catch (err) {
      console.error('Category render error:', err);
      main.innerHTML = `
        <div class="container py-12 text-center text-red-600 font-bold">
          حدث خطأ أثناء تحميل منتجات القسم.
        </div>
      `;
    }
  },

  scrollSubcategories(direction) {
    const track = document.getElementById('subcategories-scroll-track');
    if (!track) return;
    const distance = 300;
    if (direction === 'left') {
      track.scrollBy({ left: -distance, behavior: 'smooth' });
    } else {
      track.scrollBy({ left: distance, behavior: 'smooth' });
    }
  },

  filterBySubcategory(subId) {
    this.currentSubcategoryId = subId;
    this.currentPage = 1;
    this.render(this.currentCategoryId, {
      subcategory: this.currentSubcategoryId,
      brand: this.currentBrand,
      q: this.searchQuery,
      sort: this.currentSort,
      page: 1
    });
  },

  handleSearchInput(event) {
    if (event.key === 'Enter') {
      this.triggerSearch();
    }
  },

  triggerSearch() {
    const input = document.getElementById('category-smart-search');
    this.searchQuery = input ? input.value.trim() : null;
    this.currentPage = 1;
    this.render(this.currentCategoryId, {
      subcategory: this.currentSubcategoryId,
      brand: this.currentBrand,
      q: this.searchQuery,
      sort: this.currentSort,
      page: 1
    });
  },

  clearSearch() {
    this.searchQuery = null;
    this.currentPage = 1;
    this.render(this.currentCategoryId, {
      subcategory: this.currentSubcategoryId,
      brand: this.currentBrand,
      sort: this.currentSort,
      page: 1
    });
  },

  filterByBrand(brandName) {
    this.currentBrand = brandName;
    this.currentPage = 1;
    this.render(this.currentCategoryId, {
      subcategory: this.currentSubcategoryId,
      q: this.searchQuery,
      brand: this.currentBrand,
      sort: this.currentSort,
      page: 1
    });
  },

  changeSort(newSort) {
    this.currentSort = newSort;
    this.currentPage = 1;
    this.render(this.currentCategoryId, {
      subcategory: this.currentSubcategoryId,
      q: this.searchQuery,
      brand: this.currentBrand,
      sort: newSort,
      page: 1
    });
  },

  toggleDiscount(isChecked) {
    this.currentDiscountFilter = isChecked;
    this.currentPage = 1;
    this.render(this.currentCategoryId, {
      subcategory: this.currentSubcategoryId,
      q: this.searchQuery,
      brand: this.currentBrand,
      sort: this.currentSort,
      page: 1
    });
  },

  goToPage(pageNum) {
    if (pageNum < 1 || pageNum > this.totalPages) return;
    this.currentPage = pageNum;
    this.render(this.currentCategoryId, {
      subcategory: this.currentSubcategoryId,
      q: this.searchQuery,
      brand: this.currentBrand,
      sort: this.currentSort,
      page: pageNum
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  },

  resetFilters() {
    this.currentSubcategoryId = null;
    this.currentBrand = null;
    this.currentDiscountFilter = false;
    this.currentSort = 'newest';
    this.searchQuery = null;
    this.currentPage = 1;
    this.render(this.currentCategoryId, {});
  }
};
