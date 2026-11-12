/**
 * Suki Store Admin Products Management
 * Dual image mode, 25 EGP default shipping, Free shipping toggle, Egypt Governorates rates, and Category Brands
 */

const EGYPT_GOVS_PRODUCTS = [
  'القاهرة', 'الجيزة', 'الإسكندرية', 'الدقهلية', 'البحر الأحمر', 'البحيرة', 'الفيوم',
  'الغربية', 'الإسماعيلية', 'المنوفية', 'المنيا', 'القليوبية', 'الوادي الجديد',
  'السويس', 'أسوان', 'أسيوط', 'بني سويف', 'بورسعيد', 'دمياط', 'الشرقية',
  'جنوب سيناء', 'كفر الشيخ', 'مطروح', 'الأقصر', 'قنا', 'شمال سيناء', 'سوهاج'
];

const ProductsAdmin = {
  products: [],
  categories: [],
  subcategories: [],
  brands: [],
  investors: [],
  currentSearch: '',
  currentCatFilter: 'all',
  currentStockFilter: 'all', // 'all' | 'low-stock'
  lowStockThreshold: 15,
  currentPage: 1,
  totalPages: 1,
  totalCount: 0,
  totalAll: 0,
  totalLowStock: 0,
  editingProductId: null,
  uploadedImages: [],
  variationsList: [],
  governorateShippingMap: {},
  selectedIds: new Set(),
  currentMerchantFilter: '',
  currentInvestorFilter: '',
  _searchTimer: null,

  isSuperAdminUser() {
    const u = State.user;
    if (!u) return false;
    if (u.isOwner === true) return true;
    if (u.role === 'super_admin') return true;
    const email = (u.email || '').trim().toLowerCase();
    const username = (u.username || '').trim().toLowerCase();
    if (email === 'admin@suki.store' || email === 'ahmed@suki.store') return true;
    if (username === 'admin' || username === 'ahmed') return true;
    return false;
  },

  async render(params = {}) {
    if (params && params.filter === 'low-stock') {
      this.currentStockFilter = 'low-stock';
    }
    if (params && params.page) {
      this.currentPage = Number(params.page) || 1;
    }
    if (params && params.merchantCode) {
      this.currentMerchantFilter = params.merchantCode;
    }
    if (params && params.investorCode) {
      this.currentInvestorFilter = params.investorCode;
    }

    AdminLayout.render('products', `
      <div class="py-12 text-center text-slate-400">
        <i class="fa-solid fa-spinner fa-spin text-3xl mb-3 text-emerald-600"></i>
        <div class="font-bold">جاري جلب قائمة المنتجات والأقسام والعلامات التجارية...</div>
      </div>
    `);

    try {
      const [cRes, subRes, bRes, sRes, invRes] = await Promise.all([
        API.get('/categories'),
        API.get('/categories/subcategories'),
        API.get('/brands'),
        API.get('/admin/settings').catch(() => ({ settings: { lowStockThreshold: 15 } })),
        API.get('/investors').catch(() => ({ investors: [] }))
      ]);

      this.categories = cRes.categories || [];
      this.subcategories = subRes.subcategories || [];
      this.brands = bRes.brands || [];
      this.investors = invRes.investors || [];
      if (sRes.settings && sRes.settings.lowStockThreshold) {
        this.lowStockThreshold = Number(sRes.settings.lowStockThreshold);
      }

      await this.loadProducts(this.currentPage);
    } catch (err) {
      console.error('Products admin render error:', err);
    }
  },

  async loadProducts(page = 1) {
    this.currentPage = page;
    const query = {
      includeInactive: 'true',
      page: this.currentPage,
      limit: 40,
      lowStockThreshold: this.lowStockThreshold
    };
    if (this.currentStockFilter === 'low-stock') {
      query.lowStock = 'true';
    } else if (this.currentStockFilter === 'bestseller') {
      query.bestseller = 'true';
    }
    if (this.currentCatFilter !== 'all') {
      query.category = this.currentCatFilter;
    }
    if (this.currentSearch && this.currentSearch.trim()) {
      query.q = this.currentSearch.trim();
    }
    if (this.currentMerchantFilter && this.currentMerchantFilter.trim()) {
      query.merchantCode = this.currentMerchantFilter.trim();
    }
    if (this.currentInvestorFilter && this.currentInvestorFilter.trim()) {
      query.investorCode = this.currentInvestorFilter.trim();
    }

    try {
      const pRes = await API.get('/products', query);
      this.products = pRes.products || [];
      this.totalCount = pRes.count || 0;
      this.totalAll = pRes.totalAll || 0;
      this.totalLowStock = pRes.totalLowStock || 0;
      this.totalBestSellers = pRes.totalBestSellers || 0;
      this.totalPages = pRes.totalPages || 1;
      this.renderTable();
    } catch (err) {
      console.error('Failed to load products page:', err);
      App.showToast(err.message || 'فشل تحميل المنتجات', 'error');
    }
  },

  goToPage(p) {
    if (p < 1 || p > this.totalPages || p === this.currentPage) return;
    this.loadProducts(p);
  },

  getFilteredProducts() {
    return this.products;
  },

  renderPaginationButtons() {
    const total = this.totalPages;
    const current = this.currentPage;
    if (total <= 1) return '';

    let pages = [];
    if (total <= 7) {
      for (let i = 1; i <= total; i++) pages.push(i);
    } else {
      pages.push(1);
      if (current > 3) pages.push('...');
      const start = Math.max(2, current - 1);
      const end = Math.min(total - 1, current + 1);
      for (let i = start; i <= end; i++) {
        if (!pages.includes(i)) pages.push(i);
      }
      if (current < total - 2) pages.push('...');
      if (!pages.includes(total)) pages.push(total);
    }

    return pages.map(p => {
      if (p === '...') {
        return `<span class="px-2 py-1 text-xs text-slate-400 font-mono">...</span>`;
      }
      const isActive = p === current;
      return `
        <button 
          type="button" 
          onclick="ProductsAdmin.goToPage(${p})" 
          class="w-8 h-8 rounded-xl text-xs font-bold transition flex items-center justify-center ${isActive ? 'bg-emerald-600 text-white shadow-sm ring-2 ring-emerald-400' : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'}">
          ${p}
        </button>
      `;
    }).join('');
  },

  handleInvestorFilter(val) {
    this.currentInvestorFilter = val;
    this.currentPage = 1;
    this.loadProducts(1);
  },

  renderTable() {
    const isMerchant = State.user && State.user.role === 'merchant';
    const isInvestor = State.user && State.user.role === 'investor';
    const isSuper = this.isSuperAdminUser();
    const canEdit = !isMerchant && !isInvestor && (isSuper || (State.user.canManageProducts !== false && State.user.canEditProducts !== false));

    const filtered = this.products;
    const allFilteredSelected = filtered.length > 0 && filtered.every(p => this.selectedIds.has(p.id));

    const html = `
      <div>
        ${isInvestor ? `
          <div class="p-4 bg-gradient-to-r from-blue-900 to-indigo-900 text-white rounded-2xl mb-4 flex items-center justify-between gap-3 shadow-md flex-wrap">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center text-blue-300 text-lg">
                <i class="fa-solid fa-chart-pie"></i>
              </div>
              <div>
                <div class="font-extrabold text-sm">مرحباً بك، ${State.user.name || 'المستثمر'} (${State.user.investorCode || 'حساب مستثمر'})</div>
                <div class="text-xs text-blue-200 mt-0.5">تستعرض هنا المنتجات الممولة برأس مالك، أسعار التكلفة وسعر البيع وأرباحك (مشاهدة فقط).</div>
              </div>
            </div>
            <a href="#/admin/investor-accounting" class="bg-white hover:bg-blue-50 text-blue-900 px-4 py-2 rounded-xl text-xs font-black transition flex items-center gap-2 shadow-sm">
              <i class="fa-solid fa-file-invoice-dollar text-blue-600"></i>
              <span>كشف الحساب ومتابعة الأرباح</span>
            </a>
          </div>
        ` : isMerchant && !canEdit ? `
          <div class="p-3.5 bg-amber-50 border border-amber-200 text-amber-800 text-xs font-bold rounded-2xl mb-4 flex items-center gap-2.5 shadow-sm">
            <i class="fa-solid fa-lock text-amber-600 text-sm"></i>
            <span>حسابك كمورد مضبوط بصلاحية "مشاهدة فقط". تعديل المنتجات أو إضافة منتجات جديدة مقتصر على إدارة المتجر.</span>
          </div>
        ` : ''}

        <div class="flex items-center justify-between mb-6 flex-wrap gap-4">
          <div>
            <h1 class="text-2xl font-extrabold text-slate-900">
              ${isInvestor ? `منتجاتي الممولة (${State.user.investorCode || State.user.name})` : isMerchant ? `منتجاتي (${State.user.merchantCode || State.user.name})` : 'إدارة المنتجات والمخزون'}
            </h1>
            <p class="text-xs text-slate-500 mt-1">
              ${isInvestor ? 'متابعة المنتجات المشتراة برأس مالك، المخزون، والمبيعات والأرباح' : isMerchant ? 'متابعة كافة منتجاتك المسجلة وأسعارها ومخزونها في سوقي ستور' : 'التحكم في الأسعار، الشحن المخصص أو المجاني، العلامات التجارية، وتنبيهات المخزون المنخفض'}
            </p>
          </div>
          <div class="flex items-center gap-2 flex-wrap">
            ${!isInvestor && !isMerchant ? `
              <button onclick="API.download('/exports/products', {}, 'products.xlsx').catch(e => App.showToast(e.message, 'error'))" class="bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 font-bold px-3 py-2.5 rounded-xl text-xs flex items-center gap-1.5">
                <i class="fa-solid fa-file-excel text-green-600"></i> تصدير Excel
              </button>
            ` : ''}
            ${canEdit ? `
              <!-- Bulk Delete Selected Button -->
              <button 
                id="products-bulk-delete-btn" 
                onclick="ProductsAdmin.bulkDelete()" 
                class="${this.selectedIds.size > 0 ? '' : 'hidden'} bg-red-600 hover:bg-red-700 text-white font-bold px-3 py-2.5 rounded-xl text-xs flex items-center gap-1.5 transition shadow-sm animate-pulse">
                <i class="fa-solid fa-trash-can"></i>
                <span>حذف المحدد (<span id="products-selected-count">${this.selectedIds.size}</span>)</span>
              </button>
            ` : ''}

            <!-- Delete All Products Button (Super Admin Only) -->
            ${isSuper ? `
              <button 
                onclick="ProductsAdmin.deleteAllPrompt()" 
                class="bg-red-50 hover:bg-red-100 text-red-700 border border-red-300 font-bold px-3 py-2.5 rounded-xl text-xs flex items-center gap-1.5 transition" 
                title="حذف كافة المنتجات من المتجر بضغطة واحدة مع تأكيد كلمة المرور">
                <i class="fa-solid fa-dumpster-fire text-red-600"></i>
                <span>حذف كافة المنتجات (حذف الكل)</span>
              </button>
            ` : ''}

            ${!isMerchant && !isInvestor ? `
              <button onclick="AdminDashboard.openThresholdSettingsModal(${this.lowStockThreshold})" class="bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 font-bold px-3 py-2.5 rounded-xl text-xs flex items-center gap-1.5 transition">
                <i class="fa-solid fa-sliders text-amber-500"></i>
                <span>حد التنبيه (${this.lowStockThreshold} قطعة)</span>
              </button>
            ` : ''}

            ${canEdit ? `
              <a href="#/admin/bulk-upload" class="bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 text-white font-extrabold px-3.5 py-2.5 rounded-xl text-xs flex items-center gap-2 shadow-sm transition border border-teal-400/30" title="رفع جماعي شيت تاجر أو مستثمر بالذكاء الاصطناعي">
                <i class="fa-solid fa-wand-magic-sparkles text-amber-300"></i>
                <span>رفع جماعي شيت تاجر أو مستثمر</span>
              </a>
              <button onclick="ProductsAdmin.openModal()" class="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-4 py-2.5 rounded-xl text-xs flex items-center gap-2 shadow-md transition">
                <i class="fa-solid fa-plus"></i>
                <span>إضافة منتج جديد</span>
              </button>
            ` : `
              <span class="bg-slate-100 text-slate-500 font-bold px-3 py-2 rounded-xl text-xs border border-slate-200 flex items-center gap-1.5">
                <i class="fa-solid fa-lock text-slate-400"></i>
                <span>${isInvestor ? 'حساب مستثمر (مشاهدة فقط)' : 'التعديل والإضافة معطل'}</span>
              </span>
            `}
          </div>
        </div>

        <!-- Stock View Tabs -->
        <div class="flex items-center gap-3 mb-4 flex-wrap">
          <button 
            onclick="ProductsAdmin.setStockFilter('all')" 
            class="px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 ${this.currentStockFilter === 'all' ? 'bg-slate-800 text-white shadow-sm' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}">
            <i class="fa-solid fa-boxes-stacked"></i>
            <span>كافة المنتجات (${this.totalAll || this.totalCount})</span>
          </button>
          <button 
            onclick="ProductsAdmin.setStockFilter('low-stock')" 
            class="px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 ${this.currentStockFilter === 'low-stock' ? 'bg-red-600 text-white shadow-md' : 'bg-red-50 border border-red-200 text-red-700 hover:bg-red-100'}">
            <i class="fa-solid fa-triangle-exclamation"></i>
            <span>منتجات قاربت على النفاذ (${this.totalLowStock})</span>
          </button>
          <button 
            onclick="ProductsAdmin.setStockFilter('bestseller')" 
            class="px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 ${this.currentStockFilter === 'bestseller' ? 'bg-amber-600 text-white shadow-md' : 'bg-amber-50 border border-amber-200 text-amber-800 hover:bg-amber-100'}">
            <i class="fa-solid fa-star text-amber-500"></i>
            <span>الأكثر مبيعاً (${this.totalBestSellers || 0})</span>
          </button>
        </div>

        <div class="admin-card">
          <!-- Filter bar -->
          <div class="admin-card-header flex flex-wrap items-center justify-between gap-3">
            <div class="flex items-center gap-3 flex-1 max-w-md">
              <input 
                type="text" 
                class="form-control text-xs" 
                placeholder="ابحث باسم المنتج أو الماركة..." 
                value="${this.currentSearch}" 
                oninput="ProductsAdmin.handleSearch(this.value)"
              />
            </div>

            <div class="flex items-center gap-3 flex-wrap">
              <input 
                type="text" 
                class="form-control text-xs font-bold" 
                placeholder="فلترة بكود أو اسم التاجر..." 
                value="${this.currentMerchantFilter || ''}" 
                oninput="ProductsAdmin.handleMerchantFilter(this.value)"
                style="max-width: 170px;"
              />
              <select class="form-control text-xs font-bold" onchange="ProductsAdmin.handleInvestorFilter(this.value)" style="max-width: 170px;">
                <option value="">كل المستثمرين</option>
                ${(this.investors || []).map(inv => `
                  <option value="${inv.code}" ${this.currentInvestorFilter === inv.code ? 'selected' : ''}>${inv.code} - ${inv.name}</option>
                `).join('')}
              </select>
              <select class="form-control text-xs" onchange="ProductsAdmin.handleCatFilter(this.value)">
                <option value="all">كل الأقسام الرئيسية</option>
                ${this.categories.map(c => `
                  <option value="${c.id}" ${this.currentCatFilter === c.id ? 'selected' : ''}>${c.name}</option>
                `).join('')}
              </select>
              <span class="text-xs font-bold text-slate-600 bg-slate-50 px-2.5 py-1.5 rounded-lg border border-slate-200">
                (إجمالي: ${this.totalCount} منتج | صفحة ${this.currentPage} من ${this.totalPages})
              </span>
            </div>
          </div>

          <!-- Table -->
          <div class="admin-table-container">
            <table class="admin-table">
              <thead>
                <tr>
                  <th style="width: 40px; text-align: center;">
                    <input 
                      type="checkbox" 
                      id="products-select-all" 
                      class="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                      ${allFilteredSelected ? 'checked' : ''} 
                      onchange="ProductsAdmin.toggleSelectAll(this.checked)" 
                      title="تحديد الكل"
                    />
                  </th>
                  <th>صورة المنتج</th>
                  <th>اسم المنتج</th>
                  <th>الماركة</th>
                  <th>القسم</th>
                  <th>السعر والخصم</th>
                  <th>الشحن</th>
                  <th>المخزون</th>
                  <th>المبيعات</th>
                  <th>الحالة</th>
                  <th>الإجراءات</th>
                </tr>
              </thead>
              <tbody>
                ${filtered.length === 0 ? `
                  <tr>
                    <td colspan="11" class="text-center py-8 text-slate-400">لا توجد منتجات مطابقة لخيارات البحث</td>
                  </tr>
                ` : filtered.map(p => {
                  const cat = this.categories.find(c => c.id === p.categoryId);
                  const sub = this.subcategories.find(s => s.id === (p.subcategoryId || p.subcategory));
                  const img = Array.isArray(p.images) && p.images.length > 0 ? p.images[0] : (p.image || '');
                  const isLow = Number(p.stock) <= this.lowStockThreshold;
                  const isChecked = this.selectedIds.has(p.id);
                  return `
                    <tr class="${isLow ? 'bg-red-50/30' : ''} ${isChecked ? 'bg-emerald-50/20' : ''}">
                      <td style="text-align: center;">
                        <input 
                          type="checkbox" 
                          class="product-row-check rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                          value="${p.id}"
                          ${isChecked ? 'checked' : ''}
                          onchange="ProductsAdmin.toggleSelectOne('${p.id}', this.checked)"
                        />
                      </td>
                      <td>
                        <img src="${img || '/images/no-image.svg'}" class="w-12 h-12 rounded-lg object-cover border border-slate-200" loading="lazy" decoding="async" />
                      </td>
                      <td>
                        <div class="font-bold text-slate-800 text-xs max-w-xs truncate">${p.title}</div>
                        <div class="flex items-center gap-1 flex-wrap mt-0.5">
                          ${p.isFeatured ? '<span class="text-[10px] bg-amber-100 text-amber-800 font-bold px-1.5 py-0.5 rounded">مميز ⭐</span>' : ''}
                          ${p.isBestSeller ? '<span class="text-[10px] bg-rose-100 text-rose-800 font-extrabold px-1.5 py-0.5 rounded">الأكثر مبيعاً 🔥</span>' : ''}
                          ${p.isBestSellerBackup ? '<span class="text-[10px] bg-slate-200 text-slate-700 font-bold px-1.5 py-0.5 rounded">الأكثر مبيعاً (معلق - نفذت الكمية) ⏸️</span>' : ''}
                        </div>
                        ${p.merchantCode ? `
                          <div class="inline-flex items-center gap-1 mt-1 px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200 text-[10px] font-bold font-mono">
                            <i class="fa-solid fa-store text-[9px]"></i>
                            <span>${p.merchantCode}${p.merchantName ? ' - ' + p.merchantName : ''}</span>
                          </div>
                        ` : ''}
                        ${p.investorCode ? `
                          <div class="inline-flex items-center gap-1 mt-1 px-1.5 py-0.5 rounded bg-blue-50 text-blue-800 border border-blue-200 text-[10px] font-bold">
                            <i class="fa-solid fa-user-tie text-[9px]"></i>
                            <span>مستثمر: ${p.investorCode}${p.investorName ? ' - ' + p.investorName : ''}</span>
                          </div>
                        ` : ''}
                      </td>
                      <td>
                        <span class="text-xs font-bold ${p.brand ? 'text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded' : 'text-slate-400'}">
                          ${p.brand || '—'}
                        </span>
                      </td>
                      <td class="text-xs text-slate-700">
                        <div class="font-bold text-slate-800">${cat ? cat.name : 'بدون قسم'}</div>
                        ${sub ? `<div class="text-[10px] text-emerald-600 font-semibold">${sub.name}</div>` : ''}
                      </td>
                      <td>
                        ${isSuper ? `
                          <div class="font-black text-slate-900 text-xs">سعر البيع: <span class="text-emerald-700 font-extrabold">${p.price} ج.م</span></div>
                          ${p.compareAtPrice ? `<div class="text-[10px] text-slate-400">قبل الخصم: <span class="line-through">${p.compareAtPrice} ج.م</span></div>` : ''}
                          ${p.costPrice !== undefined ? `<div class="text-[10px] text-amber-800 font-bold bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200 mt-1 inline-block">التكلفة: ${p.costPrice} ج.م</div>` : ''}
                        ` : isInvestor ? `
                          <div class="font-black text-slate-900 text-xs">سعر البيع: <span class="text-emerald-700 font-extrabold">${p.price} ج.م</span></div>
                          ${p.compareAtPrice ? `<div class="text-[10px] text-slate-400">قبل الخصم: <span class="line-through">${p.compareAtPrice} ج.م</span></div>` : ''}
                          ${p.costPrice !== undefined ? `<div class="text-[10px] text-blue-800 font-bold bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200 mt-1 inline-block">التكلفة: ${p.costPrice} ج.م</div>` : ''}
                        ` : isMerchant ? `
                          <div class="font-black text-teal-700 text-xs flex items-center gap-1" title="سعر التاجر (التوريد)">
                            <i class="fa-solid fa-tag text-[10px]"></i>
                            <span>سعر التوريد: ${p.merchantPrice !== undefined ? p.merchantPrice : (p.basePrice || p.price)} ج.م</span>
                          </div>
                          <div class="text-[10px] text-slate-400 mt-0.5">سعر العميل: ${p.price} ج.م</div>
                        ` : `
                          <!-- Staff view: ONLY Selling Price and Discount Price. NEVER Cost Price! -->
                          <div class="font-extrabold text-emerald-700 text-xs">${p.price} ج.م</div>
                          ${p.compareAtPrice ? `<div class="text-[10px] text-slate-400 line-through">${p.compareAtPrice} ج.م</div>` : ''}
                        `}
                      </td>
                      <td>
                        ${p.isFreeShipping || p.shippingCost === 0 
                          ? '<span class="text-[11px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">مجاني 🎉</span>' 
                          : `<span class="text-xs font-bold text-slate-700">${p.shippingCost !== undefined && p.shippingCost !== null ? p.shippingCost + ' ج.م' : 'حسب المحافظة'}</span>`}
                      </td>
                      <td>
                        ${isLow 
                          ? `<span class="low-stock-badge"><i class="fa-solid fa-triangle-exclamation"></i> ${p.stock} قارب على النفاذ</span>`
                          : `<span class="font-bold text-xs text-slate-700">${p.stock}</span>`}
                      </td>
                      <td class="text-xs font-bold text-slate-600">${p.salesCount || 0}</td>
                      <td>
                        <span class="status-pill ${p.isActive !== false ? 'status-active' : 'status-locked'}">
                          ${p.isActive !== false ? 'نشط' : 'معطل'}
                        </span>
                      </td>
                      <td>
                        <div class="flex items-center gap-1">
                          ${canEdit ? `
                            <button 
                              type="button" 
                              onclick="ProductsAdmin.toggleBestSeller('${p.id}')" 
                              class="btn-icon-action ${p.isBestSeller ? 'text-amber-500 bg-amber-50 border border-amber-200' : 'text-slate-400 hover:text-amber-500'}" 
                              title="${p.isBestSeller ? 'إزالة من قائمة الأكثر مبيعاً' : 'إضافة إلى الأكثر مبيعاً'}">
                              <i class="fa-${p.isBestSeller ? 'solid' : 'regular'} fa-star"></i>
                            </button>
                            <button onclick="ProductsAdmin.editProduct('${p.id}')" class="btn-icon-action" title="تعديل">
                              <i class="fa-solid fa-pen-to-square text-blue-600"></i>
                            </button>
                            <button onclick="ProductsAdmin.deleteProduct('${p.id}')" class="btn-icon-action danger" title="حذف">
                              <i class="fa-solid fa-trash text-red-600"></i>
                            </button>
                          ` : `
                            <span class="text-[10px] bg-slate-100 text-slate-500 font-bold px-2 py-1 rounded-md border border-slate-200">
                              <i class="fa-solid fa-eye text-slate-400 ml-1"></i>مشاهدة فقط
                            </span>
                          `}
                        </div>
                      </td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>

          <!-- Pagination Bar -->
          ${this.totalPages > 1 ? `
            <div class="p-4 bg-white border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div class="text-xs text-slate-500 font-bold">
                عرض <span class="text-slate-900 font-black">${this.products.length}</span> منتج (من <span class="text-emerald-700 font-extrabold">${(this.currentPage - 1) * 40 + 1}</span> إلى <span class="text-emerald-700 font-extrabold">${Math.min(this.currentPage * 40, this.totalCount)}</span> من إجمالي <span class="text-emerald-700 font-extrabold">${this.totalCount}</span> منتج)
              </div>

              <div class="flex items-center gap-1.5 flex-wrap justify-center">
                <!-- Previous Button -->
                <button 
                  type="button"
                  onclick="ProductsAdmin.goToPage(${this.currentPage - 1})"
                  ${this.currentPage <= 1 ? 'disabled' : ''}
                  class="px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-bold transition flex items-center gap-1 ${this.currentPage <= 1 ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : 'bg-white hover:bg-slate-50 text-slate-700 shadow-sm'}">
                  <i class="fa-solid fa-angle-right"></i>
                  <span>السابق</span>
                </button>

                <!-- Page numbers with smart window -->
                ${this.renderPaginationButtons()}

                <!-- Next Button -->
                <button 
                  type="button"
                  onclick="ProductsAdmin.goToPage(${this.currentPage + 1})"
                  ${this.currentPage >= this.totalPages ? 'disabled' : ''}
                  class="px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-bold transition flex items-center gap-1 ${this.currentPage >= this.totalPages ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : 'bg-white hover:bg-slate-50 text-slate-700 shadow-sm'}">
                  <span>التالي</span>
                  <i class="fa-solid fa-angle-left"></i>
                </button>
              </div>
            </div>
          ` : `
            <div class="p-3 bg-white border-t border-slate-200 text-xs text-slate-500 font-bold text-center">
              إجمالي المنتجات المعروضة: <span class="text-emerald-700 font-extrabold">${this.totalCount}</span> منتج
            </div>
          `}
        </div>
      </div>
    `;

    AdminLayout.render('products', html);
  },

  toggleSelectAll(checked) {
    const filtered = this.getFilteredProducts();
    if (checked) {
      filtered.forEach(p => this.selectedIds.add(p.id));
    } else {
      filtered.forEach(p => this.selectedIds.delete(p.id));
    }
    this.updateBulkUI();
  },

  toggleSelectOne(id, checked) {
    if (checked) {
      this.selectedIds.add(id);
    } else {
      this.selectedIds.delete(id);
    }
    this.updateBulkUI();
  },

  updateBulkUI() {
    const btn = document.getElementById('products-bulk-delete-btn');
    const countSpan = document.getElementById('products-selected-count');
    if (btn) {
      if (this.selectedIds.size > 0) {
        btn.classList.remove('hidden');
        if (countSpan) countSpan.textContent = this.selectedIds.size;
      } else {
        btn.classList.add('hidden');
      }
    }
    const selectAllCheck = document.getElementById('products-select-all');
    if (selectAllCheck) {
      const filtered = this.getFilteredProducts();
      selectAllCheck.checked = filtered.length > 0 && filtered.every(p => this.selectedIds.has(p.id));
    }
    document.querySelectorAll('.product-row-check').forEach(chk => {
      chk.checked = this.selectedIds.has(chk.value);
    });
  },

  async bulkDelete() {
    const count = this.selectedIds.size;
    if (count === 0) return;
    App.confirm(`هل أنت متأكد من رغبتك في حذف ${count} منتج محدد نهائياً؟`, async () => {
      try {
        const idsArray = Array.from(this.selectedIds);
        const res = await API.post('/admin/products/bulk-delete', { ids: idsArray, productIds: idsArray });
        if (res.success) {
          App.showToast(`تم حذف ${res.deletedCount || count} منتج بنجاح`, 'success');
          this.selectedIds.clear();
          this.loadProducts(1);
        }
      } catch (err) {
        App.showToast(err.message, 'error');
      }
    });
  },

  async toggleBestSeller(id) {
    try {
      const res = await API.post(`/products/${id}/toggle-bestseller`);
      if (res.success) {
        App.showToast(res.message, 'success');
        const p = this.products.find(x => x.id === id);
        if (p) {
          p.isBestSeller = res.isBestSeller;
          p.excludeFromBestSellers = res.excludeFromBestSellers;
        }
        this.renderTable();
      } else {
        App.showToast(res.message || 'فشل تعديل الحالة', 'error');
      }
    } catch (err) {
      App.showToast(err.message || 'فشل تعديل حالة الأكثر مبيعاً', 'error');
    }
  },

  deleteAllPrompt() {
    const html = `
      <div class="p-2 text-right">
        <div class="w-14 h-14 rounded-2xl bg-red-100 text-red-600 flex items-center justify-center text-2xl mx-auto mb-4">
          <i class="fa-solid fa-triangle-exclamation"></i>
        </div>
        <h3 class="text-base font-extrabold text-slate-800 text-center mb-2">تأكيد حذف كافة المنتجات من المتجر</h3>
        <p class="text-xs text-red-600 text-center leading-relaxed mb-4 font-bold">
          تحذير أمني: هذا الإجراء سيقوم بحذف كافة المنتجات (${this.products.length} منتج) نهائياً ولا يمكن التراجع عنه.
        </p>
        <div class="form-group mb-4">
          <label class="form-label text-xs">كلمة مرور حسابك الحالية للتأكيد الأمني *</label>
          <input type="password" id="delete-all-password" class="form-control text-xs" placeholder="أدخل كلمة مرور الأدمن..." />
        </div>
        <div class="flex gap-2">
          <button type="button" onclick="ProductsAdmin.confirmDeleteAll()" class="w-full py-2.5 bg-red-600 hover:bg-red-700 text-white font-extrabold rounded-xl text-xs transition">
            تأكيد وحذف الكل نهائياً
          </button>
          <button type="button" onclick="App.closeModal()" class="w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition">
            إلغاء
          </button>
        </div>
      </div>
    `;
    App.openModal('حذف كافة المنتجات', html);
  },

  async confirmDeleteAll() {
    const passwordInput = document.getElementById('delete-all-password');
    const password = passwordInput ? passwordInput.value : '';
    if (!password) {
      App.showToast('يُرجى إدخال كلمة المرور للتأكيد', 'error');
      return;
    }
    try {
      const res = await API.post('/admin/products/delete-all', { password });
      if (res.success) {
        App.closeModal();
        App.showToast(`تم حذف كافة المنتجات بنجاح (${res.deletedCount} منتج)`, 'success');
        this.selectedIds.clear();
        this.loadProducts(1);
      }
    } catch (err) {
      App.showToast(err.message, 'error');
    }
  },

  setStockFilter(filter) {
    this.currentStockFilter = filter;
    this.currentPage = 1;
    this.loadProducts(1);
  },

  handleSearch(val) {
    this.currentSearch = val;
    clearTimeout(this._searchTimer);
    this._searchTimer = setTimeout(() => {
      this.currentPage = 1;
      this.loadProducts(1);
    }, 300);
  },

  handleCatFilter(val) {
    this.currentCatFilter = val;
    this.currentPage = 1;
    this.loadProducts(1);
  },

  handleMerchantFilter(val) {
    this.currentMerchantFilter = val;
    clearTimeout(this._searchTimer);
    this._searchTimer = setTimeout(() => {
      this.currentPage = 1;
      this.loadProducts(1);
    }, 300);
  },

  openModal(product = null) {
    const isSuper = this.isSuperAdminUser();
    this.editingProductId = product ? product.id : null;
    this.uploadedImages = product && Array.isArray(product.images) ? [...product.images] : [];
    this.productVideoUrl = product && product.videoUrl ? product.videoUrl : '';
    this.variationsList = product && Array.isArray(product.variations) ? JSON.parse(JSON.stringify(product.variations)) : [];
    this.variantsList = product && Array.isArray(product.variants) ? JSON.parse(JSON.stringify(product.variants)) : [];
    this.variantsTouched = false;
    this.governorateShippingMap = product && product.governorateShipping ? { ...product.governorateShipping } : {};
    this.allowedGovernorates = product && Array.isArray(product.allowedGovernorates) && product.allowedGovernorates.length > 0 
      ? [...product.allowedGovernorates] 
      : [...EGYPT_GOVS_PRODUCTS];

    const isFree = product ? (product.isFreeShipping || product.shippingCost === 0) : false;
    const defaultShipping = product ? (product.shippingCost !== undefined ? product.shippingCost : 0) : 0;

    const titleText = product ? 'تعديل بيانات المنتج والشحن' : 'إضافة منتج جديد للمتجر';

    const modalBody = `
      <form onsubmit="ProductsAdmin.submitForm(event)" class="text-right">
        <!-- Title & Category -->
        <div class="form-group mb-3">
          <label class="form-label">عنوان المنتج *</label>
          <input type="text" id="p-title" class="form-control" value="${product ? product.title : ''}" required />
        </div>

        <!-- Investor & Merchant Linkage -->
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3 bg-slate-50 p-3 rounded-xl border border-slate-200">
          <div class="form-group">
            <label class="form-label text-xs font-black text-blue-950 flex items-center gap-1">
              <i class="fa-solid fa-user-tie text-blue-600"></i>
              <span>المستثمر المموّل للمنتج (اختياري)</span>
            </label>
            <select id="p-investor-id" class="form-control text-xs font-bold" onchange="if(this.value){const mc=document.getElementById('p-merchant-code'),mn=document.getElementById('p-merchant-name');if(mc)mc.value='';if(mn)mn.value='';}">
              <option value="">-- بدون مستثمر (ملك للمتجر مباشرة) --</option>
              ${(this.investors || []).map(inv => `
                <option value="${inv.id}" data-code="${inv.code}" data-name="${inv.name}" ${(product && (String(product.investorId) === String(inv.id) || (product.investorCode && product.investorCode === inv.code))) ? 'selected' : ''}>
                  ${inv.code} - ${inv.name}
                </option>
              `).join('')}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label text-xs font-bold text-slate-700 flex items-center gap-1">
              <i class="fa-solid fa-store text-emerald-600"></i>
              <span>التاجر / المورد (اختياري)</span>
            </label>
            <div class="grid grid-cols-2 gap-1.5">
              <input type="text" id="p-merchant-code" class="form-control text-xs font-mono font-bold uppercase" value="${product && !(product.ownerType === 'investor' || product.investorId || product.investorCode) ? (product.merchantCode || '') : ''}" placeholder="كود التاجر" oninput="if(this.value.trim()){const inv=document.getElementById('p-investor-id');if(inv)inv.value='';}" />
              <input type="text" id="p-merchant-name" class="form-control text-xs font-bold" value="${product && !(product.ownerType === 'investor' || product.investorId || product.investorCode) ? (product.merchantName || '') : ''}" placeholder="اسم التاجر" oninput="if(this.value.trim()){const inv=document.getElementById('p-investor-id');if(inv)inv.value='';}" />
            </div>
          </div>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 mb-3">
          <div class="form-group">
            <label class="form-label text-xs font-bold text-slate-700">1. القسم الرئيسي *</label>
            <select id="p-category" class="form-control text-xs font-bold" onchange="ProductsAdmin.onCategoryChanged(this.value)" required>
              <option value="">-- اختر القسم الرئيسي --</option>
              ${this.categories.map(c => `
                <option value="${c.id}" ${product && product.categoryId === c.id ? 'selected' : ''}>${c.name}</option>
              `).join('')}
            </select>
          </div>

          <div class="form-group">
            <label class="form-label text-xs font-bold text-slate-700">2. القسم الفرعي التابع له (إجباري) *</label>
            <select id="p-subcategory" class="form-control text-xs font-bold" required ${product && product.categoryId ? '' : 'disabled'}>
              <option value="">${product && product.categoryId ? '-- اختر القسم الفرعي --' : 'اختر القسم الرئيسي أولاً'}</option>
            </select>
          </div>

          <div class="form-group">
            <label class="form-label text-xs font-bold text-slate-700">العلامة التجارية (Brand)</label>
            <select id="p-brand-select" class="form-control text-xs" onchange="ProductsAdmin.onBrandSelect(this.value)">
              <option value="">اختر الماركة</option>
              ${this.brands.map(b => `
                <option value="${b.name}" ${product && product.brand === b.name ? 'selected' : ''}>${b.name} (${b.nameEn || ''})</option>
              `).join('')}
              <option value="__custom__">+ إدخال ماركة أخرى...</option>
            </select>
            <input type="text" id="p-brand-custom" class="form-control text-xs mt-1.5 hidden" placeholder="اكتب اسم الماركة..." value="${product ? (product.brand || '') : ''}" />
          </div>

          <div class="form-group">
            <label class="form-label text-xs font-bold text-slate-700">وحدة البيع *</label>
            <select id="p-sale-unit" class="form-control text-xs">
              <option value="قطعة" ${product && product.saleUnit === 'قطعة' ? 'selected' : ''}>قطعة</option>
              <option value="كيلو" ${product && product.saleUnit === 'كيلو' ? 'selected' : ''}>كيلو</option>
              <option value="لتر" ${product && product.saleUnit === 'لتر' ? 'selected' : ''}>لتر</option>
              <option value="علبة" ${product && product.saleUnit === 'علبة' ? 'selected' : ''}>علبة</option>
              <option value="كرتونة" ${product && product.saleUnit === 'كرتونة' ? 'selected' : ''}>كرتونة</option>
              <option value="طقم" ${product && product.saleUnit === 'طقم' ? 'selected' : ''}>طقم</option>
              <option value="متر" ${product && product.saleUnit === 'متر' ? 'selected' : ''}>متر</option>
            </select>
          </div>
        </div>

        <!-- Pricing, Margin & Stock -->
        <div class="bg-slate-50 border border-slate-200 p-3.5 rounded-xl mb-3">
          <div class="flex items-center justify-between mb-2">
            <label class="form-label font-extrabold text-slate-900 mb-0 flex items-center gap-1.5 text-xs">
              <i class="fa-solid fa-coins text-emerald-600"></i>
              <span>أسعار المنتج وتفاصيل البيع (تسعير حر وغير مقيد بنسبة إجبارية)</span>
            </label>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 ${isSuper ? 'md:grid-cols-3' : 'md:grid-cols-2'} gap-3">
            ${isSuper ? `
              <div class="form-group bg-amber-50/70 p-2.5 rounded-lg border border-amber-200">
                <label class="form-label text-xs font-black text-amber-950 flex items-center gap-1">
                  <i class="fa-solid fa-lock text-amber-700"></i>
                  <span>سعر التكلفة (سوبر أدمن فقط) *</span>
                </label>
                <input 
                  type="number" 
                  id="p-cost-price" 
                  class="form-control text-xs font-bold text-amber-900 bg-white" 
                  value="${product ? (product.costPrice !== undefined ? product.costPrice : (product.basePrice || product.merchantPrice || '')) : ''}" 
                  step="0.5" 
                  placeholder="سعر شراء القطعة..." 
                  oninput="ProductsAdmin.updateMarginIndicator()"
                />
                <div class="text-[10px] text-amber-800 mt-1 font-semibold">سري وخاص بالسوبر أدمن ولا يظهر للموظفين</div>
              </div>
            ` : ''}

            <div class="form-group">
              <label class="form-label text-xs font-black text-emerald-900">سعر البيع للعميل (ج.م) *</label>
              <input 
                type="number" 
                id="p-price" 
                class="form-control text-xs font-black text-emerald-700 bg-white" 
                value="${product ? product.price : ''}" 
                step="0.5" 
                placeholder="سعر البيع..." 
                required 
                oninput="ProductsAdmin.updateMarginIndicator()"
              />
            </div>

            <div class="form-group">
              <label class="form-label text-xs font-bold text-slate-500">السعر قبل الخصم (اختياري)</label>
              <input 
                type="number" 
                id="p-compare" 
                class="form-control text-xs" 
                value="${product && product.compareAtPrice ? product.compareAtPrice : ''}" 
                step="0.5" 
                placeholder="مثال: 120" 
              />
            </div>
          </div>

          ${isSuper ? `
            <div id="p-margin-badge" class="mt-2 text-xs font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1.5 rounded-lg border border-emerald-200 inline-flex items-center gap-1.5">
              <i class="fa-solid fa-circle-info"></i>
              <span id="p-margin-text">الأسعار حرة ومستقلة تماماً.</span>
            </div>
          ` : ''}
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
          <div class="form-group">
            <label class="form-label text-xs font-bold">الكمية بالمخزون *</label>
            <input type="number" id="p-stock" class="form-control text-xs font-bold" value="${product ? product.stock : 50}" required ${this.variantsList.length ? 'readonly title="المخزون = مجموع مخزون المقاسات/الألوان"' : ''} />
            <p id="p-stock-hint" class="text-[10.5px] text-slate-400 mt-1 ${this.variantsList.length ? '' : 'hidden'}">المخزون بيتحسب لوحده من جدول المقاسات/الألوان تحت.</p>
          </div>
          <div class="form-group">
            <label class="form-label text-xs font-bold">كود المنتج SKU</label>
            <input type="text" id="p-sku" class="form-control text-xs font-mono" value="${product ? (product.sku || '') : ''}" placeholder="مثال: TSH-001" maxlength="64" />
          </div>
          <div class="form-group">
            <label class="form-label text-xs font-bold">الباركود</label>
            <input type="text" id="p-barcode" class="form-control text-xs font-mono" value="${product ? (product.barcode || '') : ''}" placeholder="مثال: 6221234567890" maxlength="64" />
          </div>
          <div class="form-group">
            <label class="form-label text-xs font-bold">الوزن (كجم)</label>
            <input type="number" id="p-weight" class="form-control text-xs" step="0.001" min="0" value="${product && product.weightKg !== null && product.weightKg !== undefined ? product.weightKg : ''}" placeholder="مثال: 0.5" />
          </div>
        </div>

        <!-- Shipping System Box -->
        <div class="bg-amber-50/50 border border-amber-200 p-4 rounded-xl mb-4">
          <div class="flex items-center justify-between mb-2 flex-wrap gap-2">
            <label class="form-label font-extrabold text-amber-900 mb-0 flex items-center gap-1.5">
              <i class="fa-solid fa-truck text-emerald-600"></i> إعدادات شحن المنتج
            </label>
            <label class="flex items-center gap-1.5 text-xs font-bold text-emerald-800 cursor-pointer bg-white px-2.5 py-1 rounded-lg border border-emerald-300">
              <input type="checkbox" id="p-free-shipping" ${isFree ? 'checked' : ''} onchange="ProductsAdmin.toggleFreeShipping(this.checked)" class="accent-emerald-600 w-4 h-4" />
              <span>شحن مجاني لهذا المنتج (Free Shipping) 🎁</span>
            </label>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
            <div class="form-group">
              <label class="form-label text-xs">سعر الشحن الأساسي للمنتج (ج.م) *</label>
              <input type="number" id="p-shipping-cost" class="form-control text-xs" value="${isFree ? 0 : defaultShipping}" ${isFree ? 'disabled' : ''} required />
              <span class="text-[10px] text-slate-500">القيمة الأساسية المعتمدة عند عدم تحديد تكلفة خاصة بالمحافظة</span>
            </div>
            <div class="form-group flex flex-col justify-end">
              <button type="button" onclick="ProductsAdmin.toggleGovShippingSection()" class="bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold py-2.5 px-3 rounded-lg border border-slate-300 flex items-center justify-between">
                <span>تخصيص الشحن حسب المحافظة (27 محافظة مصرية)</span>
                <i class="fa-solid fa-chevron-down text-slate-400"></i>
              </button>
            </div>
          </div>

          <!-- Governorates Custom Shipping Matrix (Collapsible) -->
          <div id="gov-shipping-matrix" class="hidden bg-white p-3 rounded-lg border border-slate-200 max-h-64 overflow-y-auto">
            <div class="text-[11px] font-bold text-slate-600 mb-2 pb-1 border-b border-slate-100 flex items-center justify-between flex-wrap gap-2">
              <span>اختر محافظات الشحن المتاحة للمنتج وسعر الشحن لكل محافظة:</span>
              <div class="flex items-center gap-1.5">
                <button type="button" onclick="ProductsAdmin.selectAllGovs()" class="text-xs bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded border border-emerald-200 font-bold hover:bg-emerald-100">
                  <i class="fa-solid fa-check-double ml-0.5"></i> تحديد الكل
                </button>
                <button type="button" onclick="ProductsAdmin.deselectAllGovs()" class="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded border border-slate-200 font-bold hover:bg-slate-200">
                  إلغاء التحديد
                </button>
                <button type="button" onclick="ProductsAdmin.resetGovShipping()" class="text-xs text-red-500 hover:underline px-1">
                  مسح الأسعار
                </button>
              </div>
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
              ${EGYPT_GOVS_PRODUCTS.map(gov => {
                const isAllowed = this.allowedGovernorates.includes(gov);
                const customPrice = this.governorateShippingMap[gov] !== undefined ? this.governorateShippingMap[gov] : '';
                return `
                  <div class="flex items-center justify-between gap-1 text-xs bg-slate-50 p-2 rounded-lg border border-slate-200">
                    <label class="flex items-center gap-1.5 cursor-pointer truncate">
                      <input type="checkbox" class="gov-allowed-check accent-emerald-600 w-3.5 h-3.5" data-gov="${gov}" ${isAllowed ? 'checked' : ''} />
                      <span class="font-bold text-slate-800">${gov}</span>
                    </label>
                    <div class="flex items-center gap-1">
                      <input 
                        type="number" 
                        class="form-control text-xs p-1 h-7 text-center w-14 font-mono font-bold" 
                        placeholder="افتراضي" 
                        value="${customPrice}"
                        onchange="ProductsAdmin.updateGovShipping('${gov}', this.value)"
                      />
                      <span class="text-[10px] text-slate-400">ج.م</span>
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          </div>
        </div>

        <!-- Description -->
        <div class="form-group mb-3">
          <label class="form-label">وصف المنتج ومواصفاته</label>
          <textarea id="p-desc" rows="3" class="form-control">${product ? (product.description || '') : ''}</textarea>
        </div>

        <!-- Dual Image Mode: Upload from Device OR Paste URL (Up to 15 Images) -->
        <div class="form-group mb-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
          <div class="flex items-center justify-between mb-3 flex-wrap gap-2">
            <label class="form-label font-extrabold mb-0 flex items-center gap-2">
              <i class="fa-solid fa-images text-emerald-600"></i>
              <span>صور المنتج (رفع من الجهاز أو رابط URL - حتى 15 صورة)</span>
            </label>
            <span id="p-images-counter" class="text-xs font-bold text-slate-600 bg-white px-2 py-0.5 rounded-lg border border-slate-200">${this.uploadedImages.length} من 15 صورة</span>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
            <!-- Option 1: File Upload from device (Supports multiple) -->
            <div class="bg-white p-3 rounded-lg border border-dashed border-emerald-300 flex flex-col justify-center">
              <div class="text-xs font-bold text-emerald-800 mb-1 flex items-center gap-1.5">
                <i class="fa-solid fa-cloud-arrow-up"></i> خيار 1: رفع صور من جهازك (يمكن اختيار صور متعددة)
              </div>
              <input type="file" id="p-img-file" accept="image/*" multiple class="text-xs mt-1" onchange="ProductsAdmin.uploadImageFiles(event)" />
            </div>

            <!-- Option 2: Image URL -->
            <div class="bg-white p-3 rounded-lg border border-slate-200 flex flex-col justify-center">
              <div class="text-xs font-bold text-slate-700 mb-1 flex items-center gap-1.5">
                <i class="fa-solid fa-link"></i> خيار 2: إضافة رابط صورة (URL)
              </div>
              <div class="flex gap-1.5 mt-1">
                <input type="text" dir="ltr" inputmode="url" id="p-img-url" class="form-control text-xs" placeholder="https://..." />
                <button type="button" onclick="ProductsAdmin.addImageFromInput()" class="bg-emerald-600 text-white hover:bg-emerald-700 px-3 rounded-lg text-xs font-bold flex-shrink-0">إضافة</button>
              </div>
            </div>
          </div>

          <!-- Image Previews Container -->
          <div id="p-images-preview" class="flex flex-wrap gap-2 pt-2 border-t border-slate-200">
            ${this.uploadedImages.map((img, i) => `
              <div class="relative w-16 h-16 rounded-xl overflow-hidden border ${i === 0 ? 'border-emerald-500 ring-2 ring-emerald-400' : 'border-slate-300'} shadow-sm">
                <img src="${img}" class="w-full h-full object-cover" />
                ${i === 0 ? '<span class="absolute bottom-0 inset-x-0 bg-emerald-700/80 text-white text-[9px] text-center font-bold">الرئيسية</span>' : ''}
                <button type="button" onclick="ProductsAdmin.removeImage(${i})" class="absolute top-0 right-0 bg-red-600 text-white w-4 h-4 text-[10px] flex items-center justify-center font-bold rounded-bl">×</button>
              </div>
            `).join('')}
          </div>
        </div>

        <!-- Product Video: Device Upload OR Video URL -->
        <div class="form-group mb-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
          <div class="flex items-center justify-between mb-3 flex-wrap gap-2">
            <label class="form-label font-extrabold mb-0 flex items-center gap-2">
              <i class="fa-solid fa-video text-emerald-600"></i>
              <span>فيديو المنتج (رفع من الجهاز أو رابط - اختياري)</span>
            </label>
            <span id="p-video-status" class="text-xs font-bold text-slate-500">${this.productVideoUrl ? '<span class="text-emerald-600">فيديو مضاف ✅</span>' : 'لا يوجد فيديو'}</span>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
            <!-- Option 1: Upload Video from device -->
            <div class="bg-white p-3 rounded-lg border border-dashed border-emerald-300 flex flex-col justify-center">
              <div class="text-xs font-bold text-emerald-800 mb-1 flex items-center gap-1.5">
                <i class="fa-solid fa-cloud-arrow-up"></i> خيار 1: رفع فيديو من جهازك (mp4, webm, mov)
              </div>
              <input type="file" id="p-video-file" accept="video/*" class="text-xs mt-1" onchange="ProductsAdmin.uploadVideoFile(event)" />
            </div>

            <!-- Option 2: Video URL -->
            <div class="bg-white p-3 rounded-lg border border-slate-200 flex flex-col justify-center">
              <div class="text-xs font-bold text-slate-700 mb-1 flex items-center gap-1.5">
                <i class="fa-solid fa-link"></i> خيار 2: رابط فيديو (YouTube أو مباشر)
              </div>
              <div class="flex gap-1.5 mt-1">
                <input type="text" dir="ltr" inputmode="url" id="p-video-url" class="form-control text-xs" placeholder="https://www.youtube.com/watch?v=..." value="${product && product.videoUrl ? product.videoUrl : ''}" oninput="ProductsAdmin.updateVideoFromUrl(this.value)" />
              </div>
            </div>
          </div>

          <!-- Video Preview container -->
          <div id="p-video-preview" class="${this.productVideoUrl ? '' : 'hidden'} mt-2 pt-2 border-t border-slate-200">
            <div class="flex items-center justify-between bg-white p-2.5 rounded-lg border border-slate-200">
              <div class="flex items-center gap-2 truncate">
                <i class="fa-solid fa-circle-play text-emerald-600 text-lg"></i>
                <span id="p-video-name" class="text-xs font-mono truncate text-slate-700">${this.productVideoUrl || ''}</span>
              </div>
              <button type="button" onclick="ProductsAdmin.removeVideo()" class="text-red-500 hover:text-red-700 text-xs font-bold px-2 py-1">حذف الفيديو &times;</button>
            </div>
          </div>
        </div>

        <!-- Dynamic Variations Builder -->
        <div class="form-group mb-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
          <div class="flex items-center justify-between mb-2">
            <label class="form-label font-bold mb-0">الخيارات الديناميكية (المقاس، اللون، السعة...)</label>
            <button type="button" onclick="ProductsAdmin.addVariationRow()" class="bg-emerald-50 text-emerald-700 font-bold px-2.5 py-1 rounded-lg text-xs hover:bg-emerald-100">+ خيار جديد</button>
          </div>

          <div id="variations-container" class="flex flex-col gap-2">
            ${this.variationsList.map((v, idx) => `
              <div class="flex items-center gap-2">
                <input type="text" placeholder="اسم الخيار (مثل: المقاس)" class="form-control text-xs w-1/3" value="${v.name}" oninput="ProductsAdmin.updateVariationName(${idx}, this.value)" />
                <input type="text" placeholder="القيم مفصولة بفاصلة (مثل: S, M, L)" class="form-control text-xs flex-1" value="${(v.values || []).join(', ')}" oninput="ProductsAdmin.updateVariationValues(${idx}, this.value)" />
                <button type="button" onclick="ProductsAdmin.removeVariationRow(${idx})" class="text-red-500 font-bold px-2">×</button>
              </div>
            `).join('')}
          </div>

          <div class="mt-3 pt-3 border-t border-slate-200">
            <div class="flex items-center justify-between gap-2 flex-wrap mb-2">
              <span class="text-xs font-bold text-slate-700">مخزون وسعر لكل اختيار <span class="text-slate-400 font-normal">(اختياري: لو مقاس خلص، يبان للعميل إنه خلص)</span></span>
              <div class="flex gap-2">
                <button type="button" onclick="ProductsAdmin.buildVariantsTable()" class="bg-emerald-600 text-white font-bold px-2.5 py-1 rounded-lg text-xs hover:bg-emerald-700">اعمل/حدّث الجدول</button>
                <button type="button" onclick="ProductsAdmin.clearVariants()" class="bg-white border border-slate-300 text-slate-600 font-bold px-2.5 py-1 rounded-lg text-xs ${this.variantsList.length ? '' : 'hidden'}" id="p-variants-clear">إلغاء</button>
              </div>
            </div>
            <div id="variants-table">${this.renderVariantsTable()}</div>
          </div>
        </div>

        <div class="flex items-center gap-6 mb-6 flex-wrap">
          <label class="flex items-center gap-2 text-xs font-bold cursor-pointer">
            <input type="checkbox" id="p-featured" ${product && product.isFeatured ? 'checked' : ''} class="accent-emerald-600 w-4 h-4" />
            <span>عرض في قسم المنتجات المميزة بالرئيسية ⭐</span>
          </label>

          <label class="flex items-center gap-2 text-xs font-bold cursor-pointer">
            <input type="checkbox" id="p-bestseller" ${product && (product.isBestSeller || product.isBestSellerBackup) ? 'checked' : ''} class="accent-amber-500 w-4 h-4" />
            <span>المنتجات الأكثر مبيعاً 🔥</span>
          </label>

          <div class="flex items-center gap-1.5 text-xs font-bold">
            <span class="text-slate-600">ترتيب الظهور:</span>
            <input type="number" id="p-bestseller-order" class="form-control text-xs w-16 p-1 text-center font-bold" value="${product ? (product.bestSellerOrder || 0) : 0}" min="0" placeholder="0" />
          </div>

          <label class="flex items-center gap-2 text-xs font-bold cursor-pointer">
            <input type="checkbox" id="p-active" ${!product || product.isActive !== false ? 'checked' : ''} class="accent-emerald-600 w-4 h-4" />
            <span>المنتج مفعّل ونشط للبيع في المتجر ✅</span>
          </label>
        </div>

        <button type="submit" class="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3.5 rounded-xl text-sm transition">
          ${product ? 'حفظ التعديلات' : 'إضافة المنتج'}
        </button>
      </form>
    `;

    App.openModal(titleText, modalBody);

    const activeCatId = product ? product.categoryId : '';
    const activeSubId = product ? (product.subcategoryId || product.subcategory) : '';
    this.onCategoryChanged(activeCatId, activeSubId);
  },

  onCategoryChanged(catId, preselectedSubId = null) {
    const subSelect = document.getElementById('p-subcategory');
    if (subSelect) {
      if (!catId) {
        subSelect.disabled = true;
        subSelect.innerHTML = '<option value="">اختر القسم الرئيسي أولاً</option>';
      } else {
        subSelect.disabled = false;
        const matchingSubs = this.subcategories.filter(s => String(s.categoryId) === String(catId));
        if (matchingSubs.length === 0) {
          subSelect.innerHTML = '<option value="">لا توجد أقسام فرعية لهذا القسم</option>';
        } else {
          subSelect.innerHTML = `
            <option value="">-- اختر القسم الفرعي التابع له (إجباري) * --</option>
            ${matchingSubs.map(s => `
              <option value="${s.id}" ${preselectedSubId && (String(s.id) === String(preselectedSubId) || s.name === preselectedSubId) ? 'selected' : ''}>
                ${s.name} ${s.discountText ? `(${s.discountText})` : ''}
              </option>
            `).join('')}
          `;
        }
      }
    }

    const brandSelect = document.getElementById('p-brand-select');
    if (brandSelect) {
      // Filter brands matching this category
      const catBrands = this.brands.filter(b => {
        if (Array.isArray(b.categoryIds)) return b.categoryIds.includes(catId);
        return String(b.categoryId) === String(catId);
      });

      brandSelect.innerHTML = `
        <option value="">اختر الماركة</option>
        ${catBrands.map(b => `<option value="${b.name}">${b.name} (${b.nameEn || ''})</option>`).join('')}
        ${this.brands.filter(b => !catBrands.includes(b)).map(b => `<option value="${b.name}">${b.name}</option>`).join('')}
        <option value="__custom__">+ إدخال ماركة أخرى...</option>
      `;
    }
  },

  onBrandSelect(val) {
    const customInput = document.getElementById('p-brand-custom');
    if (!customInput) return;
    if (val === '__custom__') {
      customInput.classList.remove('hidden');
      customInput.focus();
    } else {
      customInput.classList.add('hidden');
      customInput.value = val;
    }
  },

  toggleFreeShipping(isFree) {
    const costInput = document.getElementById('p-shipping-cost');
    if (costInput) {
      if (isFree) {
        costInput.value = 0;
        costInput.disabled = true;
      } else {
        costInput.disabled = false;
        costInput.value = costInput.value && costInput.value !== '0' ? costInput.value : 35;
      }
    }
  },

  toggleGovShippingSection() {
    const matrix = document.getElementById('gov-shipping-matrix');
    if (matrix) matrix.classList.toggle('hidden');
  },

  updateGovShipping(gov, val) {
    if (val === '' || isNaN(val)) {
      delete this.governorateShippingMap[gov];
    } else {
      this.governorateShippingMap[gov] = Number(val);
    }
  },

  resetGovShipping() {
    this.governorateShippingMap = {};
    const inputs = document.querySelectorAll('#gov-shipping-matrix input[type="number"]');
    inputs.forEach(i => i.value = '');
  },

  selectAllGovs() {
    const checks = document.querySelectorAll('.gov-allowed-check');
    checks.forEach(c => c.checked = true);
  },

  deselectAllGovs() {
    const checks = document.querySelectorAll('.gov-allowed-check');
    checks.forEach(c => c.checked = false);
  },

  addImageFromInput() {
    const input = document.getElementById('p-img-url');
    if (!input || !input.value.trim()) return;
    if (this.uploadedImages.length >= 15) {
      App.showToast('لا يمكن إضافة أكثر من 15 صورة للمنتج الواحد', 'warning');
      return;
    }
    this.uploadedImages.push(input.value.trim());
    input.value = '';
    this.refreshImagePreviews();
    App.showToast('تمت إضافة رابط الصورة بنجاح', 'success');
  },

  async uploadImageFiles(e) {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    if (this.uploadedImages.length >= 15) {
      App.showToast('تم الوصول للحد الأقصى لصور المنتج (15 صورة)', 'warning');
      return;
    }

    const availableSlots = 15 - this.uploadedImages.length;
    const filesToUpload = files.slice(0, availableSlots);

    try {
      App.showToast(`جاري رفع ${filesToUpload.length} صورة للمنتج من جهازك...`, 'info');
      let urls = [];
      if (filesToUpload.length === 1) {
        const res = await API.upload(filesToUpload[0]);
        if (res.success && res.url) urls.push(res.url);
      } else {
        const res = await API.uploadMultiple(filesToUpload);
        if (res.success && res.urls) urls = res.urls;
      }

      urls.forEach(u => this.uploadedImages.push(u));
      this.refreshImagePreviews();
      App.showToast(`تم رفع ${urls.length} صورة بنجاح ✅`, 'success');
    } catch (err) {
      App.showToast(err.message || 'فشل رفع الصور', 'error');
    }
  },

  async uploadVideoFile(e) {
    const file = e.target.files[0];
    if (!file) return;

    try {
      App.showToast('جاري رفع فيديو المنتج من جهازك...', 'info');
      const res = await API.uploadVideo(file);
      if (res.success && res.url) {
        this.productVideoUrl = res.url;
        this.refreshVideoPreview();
        App.showToast('تم رفع فيديو المنتج بنجاح 🎬', 'success');
      }
    } catch (err) {
      App.showToast(err.message || 'فشل رفع الفيديو', 'error');
    }
  },

  updateVideoFromUrl(url) {
    this.productVideoUrl = url.trim();
    this.refreshVideoPreview();
  },

  removeVideo() {
    this.productVideoUrl = '';
    const input = document.getElementById('p-video-url');
    if (input) input.value = '';
    const fileInput = document.getElementById('p-video-file');
    if (fileInput) fileInput.value = '';
    this.refreshVideoPreview();
    App.showToast('تمت إزالة الفيديو', 'info');
  },

  refreshVideoPreview() {
    const preview = document.getElementById('p-video-preview');
    const nameEl = document.getElementById('p-video-name');
    const statusEl = document.getElementById('p-video-status');
    if (statusEl) {
      statusEl.innerHTML = this.productVideoUrl ? '<span class="text-emerald-600">فيديو مضاف ✅</span>' : '<span class="text-slate-400">لا يوجد فيديو</span>';
    }
    if (preview && nameEl) {
      if (this.productVideoUrl) {
        nameEl.innerText = this.productVideoUrl;
        preview.classList.remove('hidden');
      } else {
        preview.classList.add('hidden');
      }
    }
  },

  removeImage(index) {
    this.uploadedImages.splice(index, 1);
    this.refreshImagePreviews();
  },

  refreshImagePreviews() {
    const box = document.getElementById('p-images-preview');
    const counter = document.getElementById('p-images-counter');
    if (counter) counter.innerText = `${this.uploadedImages.length} من 15 صورة`;
    if (box) {
      box.innerHTML = this.uploadedImages.map((img, i) => `
        <div class="relative w-16 h-16 rounded-xl overflow-hidden border ${i === 0 ? 'border-emerald-500 ring-2 ring-emerald-400' : 'border-slate-300'} shadow-sm">
          <img src="${img}" class="w-full h-full object-cover" />
          ${i === 0 ? '<span class="absolute bottom-0 inset-x-0 bg-emerald-700/80 text-white text-[9px] text-center font-bold">الرئيسية</span>' : ''}
          <button type="button" onclick="ProductsAdmin.removeImage(${i})" class="absolute top-0 right-0 bg-red-600 text-white w-4 h-4 text-[10px] flex items-center justify-center font-bold rounded-bl">×</button>
        </div>
      `).join('');
    }
  },

  addVariationRow() {
    this.variationsList.push({ name: '', values: [] });
    this.refreshVariations();
  },

  removeVariationRow(idx) {
    this.variationsList.splice(idx, 1);
    this.refreshVariations();
  },

  updateVariationName(idx, val) {
    if (this.variationsList[idx]) this.variationsList[idx].name = val.trim();
  },

  updateVariationValues(idx, val) {
    if (this.variationsList[idx]) {
      this.variationsList[idx].values = val.split(',').map(s => s.trim()).filter(Boolean);
    }
  },

  refreshVariations() {
    const cont = document.getElementById('variations-container');
    if (cont) {
      cont.innerHTML = this.variationsList.map((v, idx) => `
        <div class="flex items-center gap-2">
          <input type="text" placeholder="اسم الخيار (مثل: المقاس)" class="form-control text-xs w-1/3" value="${v.name}" oninput="ProductsAdmin.updateVariationName(${idx}, this.value)" />
          <input type="text" placeholder="القيم مفصولة بفاصلة (مثل: M, L, XL)" class="form-control text-xs flex-1" value="${(v.values || []).join(', ')}" oninput="ProductsAdmin.updateVariationValues(${idx}, this.value)" />
          <button type="button" onclick="ProductsAdmin.removeVariationRow(${idx})" class="text-red-500 font-bold px-2">×</button>
        </div>
      `).join('');
    }
  },

  // ===== Per-option stock / price (variants) =====
  variantsList: [],
  variantsTouched: false,

  variantKey(options) {
    return JSON.stringify(Object.keys(options || {}).sort().map(k => [k, String(options[k])]));
  },

  renderVariantsTable() {
    const list = this.variantsList || [];
    if (!list.length) return '<div class="text-[11px] text-slate-400">اكتب الخيارات فوق (زي المقاس: S, M, L) ودوس "اعمل الجدول".</div>';
    const esc = s => String(s === undefined || s === null ? '' : s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
    return `
      <div class="overflow-auto max-h-72">
        <table class="w-full text-xs">
          <thead><tr class="text-slate-500"><th class="text-right p-1">الاختيار</th><th class="p-1">المخزون</th><th class="p-1">السعر (فاضي = سعر المنتج)</th><th class="p-1">SKU</th></tr></thead>
          <tbody>
            ${list.map((v, i) => `
              <tr class="border-t border-slate-200">
                <td class="p-1 font-bold">${esc(Object.values(v.options || {}).join(' / '))}</td>
                <td class="p-1"><input type="number" min="0" class="form-control text-xs w-20" value="${Number(v.stock) || 0}" oninput="ProductsAdmin.updateVariant(${i}, 'stock', this.value)" /></td>
                <td class="p-1"><input type="number" min="0" step="0.01" class="form-control text-xs w-24" value="${v.price || ''}" oninput="ProductsAdmin.updateVariant(${i}, 'price', this.value)" /></td>
                <td class="p-1"><input type="text" class="form-control text-xs w-28 font-mono" value="${esc(v.sku || '')}" oninput="ProductsAdmin.updateVariant(${i}, 'sku', this.value)" /></td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
      <div class="text-[11px] text-slate-500 mt-1">إجمالي المخزون: <b id="p-variants-total">${list.reduce((s, v) => s + (Number(v.stock) || 0), 0)}</b> قطعة</div>`;
  },

  refreshVariantsUi() {
    const box = document.getElementById('variants-table');
    if (box) box.innerHTML = this.renderVariantsTable();
    const has = this.variantsList.length > 0;
    const stock = document.getElementById('p-stock');
    if (stock) {
      stock.readOnly = has;
      if (has) stock.value = this.variantsList.reduce((s, v) => s + (Number(v.stock) || 0), 0);
    }
    const hint = document.getElementById('p-stock-hint');
    if (hint) hint.classList.toggle('hidden', !has);
    const clear = document.getElementById('p-variants-clear');
    if (clear) clear.classList.toggle('hidden', !has);
  },

  buildVariantsTable() {
    const vars = this.variationsList.filter(v => v.name && v.values && v.values.length);
    if (!vars.length) return App.showToast('اكتب خيار واحد على الأقل (مثلاً: المقاس = S, M, L)', 'warning');
    let combos = [{}];
    for (const v of vars) {
      const next = [];
      combos.forEach(c => v.values.forEach(val => next.push({ ...c, [v.name]: val })));
      combos = next;
      if (combos.length > 200) return App.showToast('الاختيارات كتير أوي (أكتر من 200 تركيبة)', 'warning');
    }
    const old = new Map((this.variantsList || []).map(v => [this.variantKey(v.options), v]));
    this.variantsList = combos.map(options => old.get(this.variantKey(options)) || { options, stock: 0, price: '', sku: '' });
    this.variantsTouched = true;
    this.refreshVariantsUi();
  },

  clearVariants() {
    this.variantsList = [];
    this.variantsTouched = true;
    this.refreshVariantsUi();
  },

  updateVariant(i, field, value) {
    const v = this.variantsList[i];
    if (!v) return;
    v[field] = field === 'stock' ? Math.max(0, parseInt(value, 10) || 0) : value;
    this.variantsTouched = true;
    if (field === 'stock') {
      const total = this.variantsList.reduce((s, x) => s + (Number(x.stock) || 0), 0);
      const t = document.getElementById('p-variants-total'); if (t) t.textContent = total;
      const stock = document.getElementById('p-stock'); if (stock) stock.value = total;
    }
  },

  editProduct(id) {
    const product = this.products.find(p => p.id === id);
    if (product) {
      this.openModal(product);
    }
  },

  deleteProduct(id) {
    const p = this.products.find(x => x.id === id);
    const title = p ? p.title : '';
    App.confirm(`هل أنت متأكد من رغبتك في حذف المنتج "${title}" نهائياً؟`, async () => {
      try {
        const res = await API.delete(`/products/${id}`);
        if (res.success) {
          App.showToast('تم حذف المنتج بنجاح', 'success');
          this.loadProducts(this.currentPage);
        }
      } catch (err) {
        App.showToast(err.message, 'error');
      }
    });
  },

  async toggleBestSeller(id) {
    try {
      const res = await API.post(`/products/${id}/toggle-bestseller`);
      if (res.success) {
        App.showToast(res.message, 'success');
        const p = this.products.find(x => x.id === id);
        if (p) {
          p.isBestSeller = res.isBestSeller;
          p.excludeFromBestSellers = res.excludeFromBestSellers;
        }
        this.renderTable();
      } else {
        App.showToast(res.message || 'فشل تعديل الحالة', 'error');
      }
    } catch (err) {
      App.showToast(err.message || 'فشل تعديل حالة الأكثر مبيعاً', 'error');
    }
  },

  updateMarginIndicator() {
    const costEl = document.getElementById('p-cost-price');
    const priceEl = document.getElementById('p-price');
    const textEl = document.getElementById('p-margin-text');
    if (!textEl) return;
    const cost = costEl ? Number(costEl.value) : 0;
    const price = priceEl ? Number(priceEl.value) : 0;
    if (cost > 0 && price > 0) {
      const diff = Math.round((price - cost) * 100) / 100;
      const pct = Math.round(((price - cost) / cost) * 100);
      textEl.innerHTML = `الفرق بين البيع والتكلفة: <span class="font-black ${diff >= 0 ? 'text-emerald-800' : 'text-red-700'}">${diff} ج.م (${pct}%)</span> — تسعير حر.`;
    } else {
      textEl.innerText = 'الأسعار حرة ومستقلة تماماً وغير مقيدة بنسبة إجبارية.';
    }
  },

  async submitForm(e) {
    e.preventDefault();
    const title = document.getElementById('p-title').value.trim();
    const categoryId = document.getElementById('p-category').value;
    const subSelect = document.getElementById('p-subcategory');
    const subcategoryId = subSelect ? subSelect.value : '';

    if (!categoryId) {
      App.showToast('يُرجى اختيار القسم الرئيسي أولاً', 'warning');
      return;
    }

    if (!subcategoryId) {
      App.showToast('يُرجى اختيار القسم الفرعي للمنتج (إجباري)', 'warning');
      return;
    }

    const saleUnit = document.getElementById('p-sale-unit').value;
    const price = typeof Utils !== 'undefined' ? Utils.parseNumber(document.getElementById('p-price').value) : Number(document.getElementById('p-price').value);
    const compareAtPrice = document.getElementById('p-compare').value ? (typeof Utils !== 'undefined' ? Utils.parseNumber(document.getElementById('p-compare').value) : Number(document.getElementById('p-compare').value)) : null;
    const stock = typeof Utils !== 'undefined' ? Utils.parseNumber(document.getElementById('p-stock').value) : Number(document.getElementById('p-stock').value);
    const description = document.getElementById('p-desc').value.trim();
    const videoUrl = this.productVideoUrl || (document.getElementById('p-video-url') ? document.getElementById('p-video-url').value.trim() : '');
    const isFeatured = document.getElementById('p-featured').checked;
    const isBestSeller = document.getElementById('p-bestseller')?.checked || false;
    const bestSellerOrder = typeof Utils !== 'undefined' ? Utils.parseNumber(document.getElementById('p-bestseller-order')?.value, 0) : (Number(document.getElementById('p-bestseller-order')?.value) || 0);
    const isActive = document.getElementById('p-active').checked;

    // Allowed Governorates
    const allowedGovChecks = document.querySelectorAll('.gov-allowed-check:checked');
    const allowedGovernorates = Array.from(allowedGovChecks).map(c => c.getAttribute('data-gov'));

    // Ownership: strictly mutually exclusive (investor OR merchant OR store)
    const rawMerchantCode = (document.getElementById('p-merchant-code')?.value || '').trim().toUpperCase();
    const rawMerchantName = (document.getElementById('p-merchant-name')?.value || '').trim();

    // Investor
    const investorSelect = document.getElementById('p-investor-id');
    let investorId = null;
    let investorCode = '';
    let investorName = '';
    if (investorSelect && investorSelect.value) {
      investorId = investorSelect.value;
      const opt = investorSelect.options[investorSelect.selectedIndex];
      investorCode = opt ? (opt.getAttribute('data-code') || '') : '';
      investorName = opt ? (opt.getAttribute('data-name') || '') : '';
    }

    let ownerType = 'store';
    let merchantCode = '';
    let merchantName = '';
    if (investorId) {
      ownerType = 'investor';
    } else if (rawMerchantCode || rawMerchantName) {
      ownerType = 'merchant';
      merchantCode = rawMerchantCode;
      merchantName = rawMerchantName;
    }

    // Cost price (Super Admin only)
    const costPriceInput = document.getElementById('p-cost-price');
    const costPrice = costPriceInput ? (costPriceInput.value !== '' ? (typeof Utils !== 'undefined' ? Utils.parseNumber(costPriceInput.value) : Number(costPriceInput.value)) : 0) : undefined;

    // Brand
    const brandSelect = document.getElementById('p-brand-select').value;
    const brandCustom = document.getElementById('p-brand-custom').value.trim();
    const brand = brandSelect === '__custom__' ? brandCustom : (brandSelect || brandCustom);

    // Shipping
    const isFreeShipping = document.getElementById('p-free-shipping').checked;
    const shippingCost = isFreeShipping ? 0 : (typeof Utils !== 'undefined' ? Utils.parseNumber(document.getElementById('p-shipping-cost').value || 0) : Number(document.getElementById('p-shipping-cost').value || 0));

    const images = this.uploadedImages.length > 0
      ? this.uploadedImages
      : ['/images/no-image.svg'];

    const validVariations = this.variationsList.filter(v => v.name && v.values && v.values.length > 0);

    const payload = {
      title,
      categoryId,
      subcategoryId,
      subcategory: subcategoryId,
      brand,
      ownerType,
      merchantCode,
      merchantName,
      investorId,
      investorCode,
      investorName,
      saleUnit,
      price,
      compareAtPrice,
      stock,
      shippingCost,
      isFreeShipping,
      governorateShipping: this.governorateShippingMap,
      allowedGovernorates,
      description,
      images,
      videoUrl,
      variations: validVariations,
      isFeatured,
      isBestSeller,
      bestSellerOrder,
      isActive,
      sku: (document.getElementById('p-sku') || {}).value || '',
      barcode: (document.getElementById('p-barcode') || {}).value || '',
      weightKg: (document.getElementById('p-weight') || {}).value || ''
    };
    // Only send options' stock when it exists or was changed (keeps old products untouched)
    if (this.variantsTouched || (this.variantsList || []).length) {
      // Drop rows whose option values no longer exist in the options above
      const valid = this.variationsList.filter(v => v.name && v.values && v.values.length);
      payload.variants = (this.variantsList || []).filter(v =>
        Object.entries(v.options || {}).every(([k, val]) => valid.some(x => x.name === k && x.values.includes(val))) &&
        valid.every(x => (v.options || {})[x.name] !== undefined)
      );
      if ((this.variantsList || []).length && !payload.variants.length) {
        App.showToast('جدول المقاسات/الألوان مش متطابق مع الخيارات. دوس "اعمل/حدّث الجدول" تاني.', 'warning');
        return;
      }
    }

    if (costPrice !== undefined) {
      payload.costPrice = costPrice;
      payload.basePrice = costPrice;
      payload.merchantPrice = costPrice;
    }

    try {
      if (this.editingProductId) {
        const res = await API.put(`/products/${this.editingProductId}`, payload);
        if (res.success) {
          App.closeModal();
          App.showToast('تم تحديث بيانات المنتج والشحن بنجاح', 'success');
          this.loadProducts(this.currentPage);
        }
      } else {
        const res = await API.post('/products', payload);
        if (res.success) {
          App.closeModal();
          App.showToast('تم إضافة المنتج بنجاح', 'success');
          this.loadProducts(1);
        }
      }
    } catch (err) {
      App.showToast(err.message, 'error');
    }
  }
};
