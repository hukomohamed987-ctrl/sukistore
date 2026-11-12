/**
 * Suki Store Admin Banners & Placement Management
 * Supports:
 * - Placements: Home (1200x400), Main Category (1200x350), Subcategory (1000x300)
 * - Types: Full-width Image Banner & Gradient Card Banner
 * - Multiple banners per page (Sliders / Stacked)
 * - Dual Upload: File from Device with dimension hints or URL
 * - Live interactive preview
 */

const BannersAdmin = {
  banners: [],
  categories: [],
  subcategories: [],
  editingBannerId: null,
  currentImageUrl: '',
  activeTab: 'all',

  colorPresets: [
    { name: 'أخضر زمردي فاخر (الافتراضي)', value: 'linear-gradient(135deg, #059669 0%, #065f46 100%)', badge: '#059669' },
    { name: 'أزرق نيلي عصري', value: 'linear-gradient(135deg, #1d4ed8 0%, #1e40af 100%)', badge: '#1d4ed8' },
    { name: 'بنفسجي ملكي مميز', value: 'linear-gradient(135deg, #7c3aed 0%, #5b21b6 100%)', badge: '#7c3aed' },
    { name: 'أصفر ذهبي ساطع', value: 'linear-gradient(135deg, #d97706 0%, #b45309 100%)', badge: '#d97706' },
    { name: 'أحمر مرجاني ناري', value: 'linear-gradient(135deg, #dc2626 0%, #991b1b 100%)', badge: '#dc2626' },
    { name: 'برتقالي دافئ جذاب', value: 'linear-gradient(135deg, #ea580c 0%, #c2410c 100%)', badge: '#ea580c' },
    { name: 'كحلي داكن وأنيق', value: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)', badge: '#0f172a' },
    { name: 'وردي فوشيا مبهج', value: 'linear-gradient(135deg, #db2777 0%, #9d174d 100%)', badge: '#db2777' },
    { name: 'رمادي تيتانيوم هادئ', value: 'linear-gradient(135deg, #475569 0%, #334155 100%)', badge: '#475569' },
    { name: 'تخصيص لون آخر (Custom CSS)', value: '__custom__', badge: '#888' }
  ],

  dimensionHints: {
    home: 'المقاس الموصى به للصفحة الرئيسية: 1200×400 بكسل',
    strip: 'بانر رفيع تحت السلايدر: المقاس الموصى به 900×300 بكسل (عرضه 3 أضعاف ارتفاعه)',
    category: 'المقاس الموصى به للأقسام الرئيسية: 1200×350 بكسل',
    subcategory: 'المقاس الموصى به للأقسام الفرعية: 1000×300 بكسل'
  },

  async render() {
    AdminLayout.render('banners', `
      <div class="py-12 text-center text-slate-400">
        <i class="fa-solid fa-spinner fa-spin text-3xl mb-3 text-emerald-600"></i>
        <div>جاري جلب قائمة البانرات والأقسام...</div>
      </div>
    `);

    try {
      const [bRes, cRes, subRes] = await Promise.all([
        API.get('/banners/all'),
        API.get('/categories').catch(() => ({ categories: [] })),
        API.get('/categories/subcategories').catch(() => ({ subcategories: [] }))
      ]);

      this.banners = bRes.banners || [];
      this.categories = cRes.categories || [];
      this.subcategories = subRes.subcategories || [];
      this.renderTable();
    } catch (err) {
      console.error('Banners admin render error:', err);
    }
  },

  setTab(tab) {
    this.activeTab = tab;
    this.renderTable();
  },

  renderTable() {
    let filtered = this.banners;
    if (this.activeTab !== 'all') {
      filtered = filtered.filter(b => (b.placement || 'home') === this.activeTab);
    }

    const counts = {
      all: this.banners.length,
      home: this.banners.filter(b => (b.placement || 'home') === 'home').length,
      strip: this.banners.filter(b => b.placement === 'strip').length,
      category: this.banners.filter(b => b.placement === 'category').length,
      subcategory: this.banners.filter(b => b.placement === 'subcategory').length
    };

    const html = `
      <div class="space-y-6 text-right" dir="rtl">
        <!-- Header -->
        <div class="flex items-center justify-between mb-2 flex-wrap gap-4">
          <div>
            <h1 class="text-2xl font-black text-slate-900 flex items-center gap-2">
              <i class="fa-solid fa-panorama text-emerald-600"></i>
              <span>إدارة البانرات الترويجية والإعلانات</span>
            </h1>
            <p class="text-xs text-slate-500 mt-1">
              تحكم كامل في بانرات الصفحة الرئيسية، الأقسام الرئيسية، والأقسام الفرعية مع دعم الرفع المباشر والمقاسات الموصى بها
            </p>
          </div>
          <button onclick="BannersAdmin.openModal()" class="bg-emerald-600 hover:bg-emerald-700 text-white font-black px-4 py-2.5 rounded-xl text-xs flex items-center gap-2 shadow-md transition cursor-pointer">
            <i class="fa-solid fa-plus-circle"></i>
            <span>إضافة بانر جديد</span>
          </button>
        </div>

        <!-- Filter Tabs -->
        <div class="flex items-center gap-2 border-b border-slate-200 pb-2 overflow-x-auto text-xs font-bold">
          <button onclick="BannersAdmin.setTab('all')" class="px-4 py-2 rounded-xl transition cursor-pointer flex items-center gap-1.5 ${this.activeTab === 'all' ? 'bg-emerald-600 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}">
            <span>جميع البانرات</span>
            <span class="px-1.5 py-0.5 rounded-full text-[10px] ${this.activeTab === 'all' ? 'bg-emerald-800 text-white' : 'bg-slate-200 text-slate-700'}">${counts.all}</span>
          </button>

          <button onclick="BannersAdmin.setTab('home')" class="px-4 py-2 rounded-xl transition cursor-pointer flex items-center gap-1.5 ${this.activeTab === 'home' ? 'bg-emerald-600 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}">
            <i class="fa-solid fa-house"></i>
            <span>الرئيسية (1200×400)</span>
            <span class="px-1.5 py-0.5 rounded-full text-[10px] ${this.activeTab === 'home' ? 'bg-emerald-800 text-white' : 'bg-slate-200 text-slate-700'}">${counts.home}</span>
          </button>

          <button onclick="BannersAdmin.setTab('strip')" class="px-4 py-2 rounded-xl transition cursor-pointer flex items-center gap-1.5 ${this.activeTab === 'strip' ? 'bg-emerald-600 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}">
            <i class="fa-solid fa-grip-lines"></i>
            <span>بانرات رفيعة في الرئيسية (900×300)</span>
            <span class="px-1.5 py-0.5 rounded-full text-[10px] ${this.activeTab === 'strip' ? 'bg-emerald-800 text-white' : 'bg-slate-200 text-slate-700'}">${counts.strip}</span>
          </button>

          <button onclick="BannersAdmin.setTab('category')" class="px-4 py-2 rounded-xl transition cursor-pointer flex items-center gap-1.5 ${this.activeTab === 'category' ? 'bg-emerald-600 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}">
            <i class="fa-solid fa-layer-group"></i>
            <span>الأقسام الرئيسية (1200×350)</span>
            <span class="px-1.5 py-0.5 rounded-full text-[10px] ${this.activeTab === 'category' ? 'bg-emerald-800 text-white' : 'bg-slate-200 text-slate-700'}">${counts.category}</span>
          </button>

          <button onclick="BannersAdmin.setTab('subcategory')" class="px-4 py-2 rounded-xl transition cursor-pointer flex items-center gap-1.5 ${this.activeTab === 'subcategory' ? 'bg-emerald-600 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}">
            <i class="fa-solid fa-table-cells-large"></i>
            <span>الأقسام الفرعية (1000×300)</span>
            <span class="px-1.5 py-0.5 rounded-full text-[10px] ${this.activeTab === 'subcategory' ? 'bg-emerald-800 text-white' : 'bg-slate-200 text-slate-700'}">${counts.subcategory}</span>
          </button>
        </div>

        <!-- Banners Table -->
        <div class="admin-card">
          <div class="admin-table-container">
            <table class="admin-table text-right">
              <thead>
                <tr>
                  <th class="text-center w-12">#</th>
                  <th>صورة البانر</th>
                  <th>العنوان والوصف</th>
                  <th>مكان العرض</th>
                  <th>نوع البانر</th>
                  <th>الرابط الموجه</th>
                  <th class="text-center">الترتيب</th>
                  <th class="text-center">الحالة</th>
                  <th class="text-center">الإجراءات</th>
                </tr>
              </thead>
              <tbody>
                ${filtered.length === 0 ? `
                  <tr>
                    <td colspan="9" class="text-center py-12 text-slate-400">
                      <div class="w-14 h-14 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto text-2xl mb-2">
                        <i class="fa-solid fa-panorama"></i>
                      </div>
                      <div class="font-bold text-sm text-slate-600">لا توجد بانرات مسجلة في هذا القسم</div>
                      <button onclick="BannersAdmin.openModal()" class="mt-3 text-xs text-emerald-600 font-bold hover:underline">
                        + إضافة أول بانر الآن
                      </button>
                    </td>
                  </tr>
                ` : filtered.map((b, idx) => {
                  const p = b.placement || 'home';
                  let placementBadge = '<span class="px-2 py-0.5 rounded text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-200">الرئيسية</span>';
                  if (p === 'strip') {
                    placementBadge = '<span class="px-2 py-0.5 rounded text-[11px] font-bold bg-teal-50 text-teal-700 border border-teal-200">بانر رفيع (الرئيسية)</span>';
                  } else if (p === 'category') {
                    const cat = this.categories.find(c => String(c.id) === String(b.categoryId));
                    placementBadge = `<span class="px-2 py-0.5 rounded text-[11px] font-bold bg-purple-50 text-purple-700 border border-purple-200">قسم: ${cat ? cat.name : (b.categoryId || 'عام')}</span>`;
                  } else if (p === 'subcategory') {
                    const sub = this.subcategories.find(s => String(s.id) === String(b.subcategoryId));
                    placementBadge = `<span class="px-2 py-0.5 rounded text-[11px] font-bold bg-amber-50 text-amber-800 border border-amber-200">فرعي: ${sub ? sub.name : (b.subcategoryId || 'عام')}</span>`;
                  }

                  const isFull = b.bannerType === 'image_full_width' || !b.bannerType;

                  return `
                    <tr>
                      <td class="text-center font-bold text-slate-400">${idx + 1}</td>
                      <td>
                        <div class="w-24 h-12 rounded-lg overflow-hidden border border-slate-200 shadow-sm bg-slate-100 flex items-center justify-center">
                          <img src="${b.imageUrl || 'https://images.unsplash.com/photo-1607082348824-0a96f2a4b9da?w=200'}" class="w-full h-full object-cover" />
                        </div>
                      </td>
                      <td>
                        <div class="font-extrabold text-slate-800 text-xs">${b.title || 'بدون عنوان'}</div>
                        <div class="text-[11px] text-slate-400 max-w-xs truncate">${b.subtitle || ''}</div>
                        ${b.badgeText ? `<span class="inline-block mt-1 bg-amber-100 text-amber-800 text-[10px] font-black px-1.5 py-0.5 rounded">${b.badgeText}</span>` : ''}
                      </td>
                      <td>${placementBadge}</td>
                      <td>
                        <span class="text-[11px] font-bold text-slate-600">
                          ${isFull ? '🖼️ صورة كاملة' : '🎨 بطاقة ترويجية'}
                        </span>
                      </td>
                      <td class="text-xs text-slate-500 font-mono truncate max-w-[140px]" title="${b.linkUrl}">${b.linkUrl || '-'}</td>
                      <td class="text-center font-bold text-xs text-slate-700">${b.orderIndex || 0}</td>
                      <td class="text-center">
                        <span class="status-pill ${b.isActive !== false ? 'status-active' : 'status-locked'}">
                          ${b.isActive !== false ? 'معروض' : 'مخفي'}
                        </span>
                      </td>
                      <td class="text-center">
                        <div class="inline-flex items-center gap-1">
                          <button onclick="BannersAdmin.editBanner('${b.id}')" class="btn-icon-action" title="تعديل">
                            <i class="fa-solid fa-pen-to-square text-blue-600"></i>
                          </button>
                          <button onclick="BannersAdmin.deleteBanner('${b.id}')" class="btn-icon-action danger" title="حذف">
                            <i class="fa-solid fa-trash text-red-600"></i>
                          </button>
                        </div>
                      </td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;

    AdminLayout.render('banners', html);
  },

  openModal(banner = null) {
    this.editingBannerId = banner ? banner.id : null;
    this.currentImageUrl = banner && banner.imageUrl ? banner.imageUrl : '';
    const isEdit = Boolean(banner);

    const currentPlacement = banner ? (banner.placement || 'home') : (this.activeTab !== 'all' ? this.activeTab : 'home');
    const currentBannerType = banner ? (banner.bannerType || 'image_full_width') : 'image_full_width';
    const currentGradient = banner ? (banner.bgGradient || this.colorPresets[0].value) : this.colorPresets[0].value;
    const isCustom = !this.colorPresets.some(p => p.value === currentGradient);

    const hintText = this.dimensionHints[currentPlacement] || this.dimensionHints.home;

    const modalBody = `
      <form onsubmit="BannersAdmin.submitForm(event)" class="text-right" dir="rtl">
        <!-- 1. Placement & Type -->
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3 bg-slate-50 p-3 rounded-xl border border-slate-200">
          <div class="form-group">
            <label class="form-label text-xs font-bold text-slate-800">مكان عرض البانر *</label>
            <select id="bn-placement" class="form-control text-xs font-bold" onchange="BannersAdmin.onPlacementChange(this.value)" required>
              <option value="home" ${currentPlacement === 'home' ? 'selected' : ''}>الصفحة الرئيسية — السلايدر الكبير (1200×400)</option>
              <option value="strip" ${currentPlacement === 'strip' ? 'selected' : ''}>الصفحة الرئيسية — بانر رفيع تحت السلايدر (900×300)</option>
              <option value="category" ${currentPlacement === 'category' ? 'selected' : ''}>قسم رئيسي (1200×350)</option>
              <option value="subcategory" ${currentPlacement === 'subcategory' ? 'selected' : ''}>قسم فرعي (1000×300)</option>
            </select>
          </div>

          <div class="form-group">
            <label class="form-label text-xs font-bold text-slate-800">نوع البانر *</label>
            <select id="bn-type" class="form-control text-xs font-bold" onchange="BannersAdmin.onTypeChange(this.value)">
              <option value="image_full_width" ${currentBannerType === 'image_full_width' ? 'selected' : ''}>بانر صورة عريض ممتد (Full Width Image)</option>
              <option value="gradient_card" ${currentBannerType === 'gradient_card' ? 'selected' : ''}>بطاقة ترويجية ملونة مع نص وزر (Card)</option>
            </select>
          </div>
        </div>

        <!-- Conditional Category / Subcategory selectors -->
        <div id="bn-category-selector-group" class="${['home', 'strip'].includes(currentPlacement) ? 'hidden' : ''} grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3 bg-purple-50/50 p-3 rounded-xl border border-purple-200">
          <div class="form-group">
            <label class="form-label text-xs font-bold text-purple-900">القسم الرئيسي المستهدف *</label>
            <select id="bn-category-id" class="form-control text-xs font-bold" onchange="BannersAdmin.onCategorySelectChange(this.value)">
              <option value="">-- اختر القسم الرئيسي --</option>
              ${this.categories.map(c => `
                <option value="${c.id}" ${banner && String(banner.categoryId) === String(c.id) ? 'selected' : ''}>${c.name}</option>
              `).join('')}
            </select>
          </div>

          <div class="form-group" id="bn-subcategory-wrap" class="${currentPlacement === 'subcategory' ? '' : 'hidden'}">
            <label class="form-label text-xs font-bold text-purple-900">القسم الفرعي المستهدف *</label>
            <select id="bn-subcategory-id" class="form-control text-xs font-bold">
              <option value="">-- اختر القسم الفرعي --</option>
            </select>
          </div>
        </div>

        <!-- Title, Subtitle, Badge -->
        <div class="form-group mb-3">
          <label class="form-label text-xs font-bold text-slate-800">عنوان البانر (اختياري للبانر المصور، إجباري للبطاقة)</label>
          <input type="text" id="bn-title" class="form-control text-xs font-bold" value="${banner ? (banner.title || '') : ''}" placeholder="مثال: خصومات حصرية حتى 50% على الأجهزة" oninput="BannersAdmin.updateLivePreview()" />
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
          <div class="form-group">
            <label class="form-label text-xs font-bold text-slate-700">العنوان الفرعي أو الوصف</label>
            <input type="text" id="bn-sub" class="form-control text-xs" value="${banner ? (banner.subtitle || '') : ''}" placeholder="أقوى العروض بأسعار لا تقبل المنافسة" oninput="BannersAdmin.updateLivePreview()" />
          </div>

          <div class="form-group">
            <label class="form-label text-xs font-bold text-slate-700">نص الشارة الصغيرة (Badge)</label>
            <input type="text" id="bn-badge" class="form-control text-xs font-bold" placeholder="عرض لفترة محدودة 🔥" value="${banner ? (banner.badgeText || '') : ''}" oninput="BannersAdmin.updateLivePreview()" />
          </div>
        </div>

        <!-- Dual Image Upload: Device or URL with Recommended Dimensions Display -->
        <div class="form-group mb-3 bg-emerald-50/50 p-3.5 rounded-xl border border-emerald-200">
          <div class="flex items-center justify-between mb-2 flex-wrap gap-2">
            <label class="form-label font-black mb-0 flex items-center gap-1.5 text-xs text-emerald-950">
              <i class="fa-solid fa-image text-emerald-600"></i>
              <span>صورة البانر (رفع من الجهاز أو رابط) *</span>
            </label>
            <span id="bn-dimension-hint" class="text-[11px] font-black text-amber-900 bg-amber-100 border border-amber-300 px-2.5 py-1 rounded-lg">
              ${hintText}
            </span>
          </div>

          ${ImagePicker.html({ id: 'bn-image', value: banner ? (banner.imageUrl || '') : '', label: 'صورة السلايد', wide: true, onChange: 'BannersAdmin.onUrlInput' })}
        </div>

        <!-- Color Selection (for card banner or overlay) -->
        <div id="bn-color-section" class="${currentBannerType === 'image_full_width' ? 'hidden' : ''} form-group mb-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200">
          <label class="form-label font-bold mb-2 flex items-center gap-1.5 text-xs text-slate-800">
            <i class="fa-solid fa-palette text-emerald-600"></i>
            <span>تدرج لون الخلفية (للبطاقة الترويجية)</span>
          </label>

          <select id="bn-color-select" class="form-control mb-2 text-xs font-semibold" onchange="BannersAdmin.onColorPresetChange(this.value)">
            ${this.colorPresets.map(preset => `
              <option value="${preset.value}" ${(!isCustom && preset.value === currentGradient) || (isCustom && preset.value === '__custom__') ? 'selected' : ''}>
                ${preset.name}
              </option>
            `).join('')}
          </select>

          <div id="bn-custom-color-wrap" class="${isCustom ? '' : 'hidden'} mt-2">
            <label class="text-[11px] text-slate-500 mb-1 block">تخصيص كود التدرج (CSS Linear Gradient):</label>
            <input type="text" id="bn-gradient" class="form-control font-mono text-xs" value="${currentGradient}" oninput="BannersAdmin.updateLivePreview()" />
          </div>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
          <div class="form-group">
            <label class="form-label text-xs font-bold text-slate-700">رابط التحويل عند النقر (القسم أو المنتج)</label>
            <input type="text" id="bn-link" class="form-control text-xs" placeholder="#/products أو رابط كامل" value="${banner ? (banner.linkUrl || '#/products') : '#/products'}" />
          </div>

          <div class="form-group">
            <label class="form-label text-xs font-bold text-slate-700">ترتيب الظهور في السلايدر</label>
            <input type="number" id="bn-order" class="form-control text-xs font-bold" value="${banner ? (banner.orderIndex || 0) : 0}" />
          </div>
        </div>

        <!-- Live Banner Preview Card -->
        <div class="form-group mb-4">
          <label class="text-xs font-bold text-slate-700 mb-1 block">معاينة مباشرة لشكل البانر:</label>
          <div id="bn-live-preview-wrap" class="rounded-2xl overflow-hidden border border-slate-200 shadow-md">
            <!-- Rendered live -->
          </div>
        </div>

        <div class="form-group mb-4 bg-slate-50 p-2.5 rounded-xl border border-slate-200">
          <label class="flex items-center gap-2 text-xs font-bold cursor-pointer text-slate-800">
            <input type="checkbox" id="bn-active" ${!banner || banner.isActive !== false ? 'checked' : ''} class="accent-emerald-600 w-4 h-4" />
            <span>عرض البانر ونشره فورياً في الموقع</span>
          </label>
        </div>

        <button type="submit" class="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold py-3.5 rounded-xl text-xs shadow-md transition cursor-pointer">
          ${isEdit ? 'حفظ تعديلات البانر' : 'إضافة ونشر البانر'}
        </button>
      </form>
    `;

    App.openModal(isEdit ? 'تعديل البانر' : 'إضافة بانر جديد', modalBody);

    // Initial populate of subcategories if category is chosen
    if (banner && banner.categoryId) {
      this.populateSubcategories(banner.categoryId, banner.subcategoryId);
    }
    this.updateLivePreview();
  },

  onPlacementChange(placement) {
    const hintEl = document.getElementById('bn-dimension-hint');
    if (hintEl && this.dimensionHints[placement]) {
      hintEl.textContent = this.dimensionHints[placement];
    }

    const catGroup = document.getElementById('bn-category-selector-group');
    const subWrap = document.getElementById('bn-subcategory-wrap');

    if (placement === 'home' || placement === 'strip') {
      if (catGroup) catGroup.classList.add('hidden');
    } else if (placement === 'category') {
      if (catGroup) catGroup.classList.remove('hidden');
      if (subWrap) subWrap.classList.add('hidden');
    } else if (placement === 'subcategory') {
      if (catGroup) catGroup.classList.remove('hidden');
      if (subWrap) subWrap.classList.remove('hidden');
    }

    this.updateLivePreview();
  },

  onTypeChange(type) {
    const colorSec = document.getElementById('bn-color-section');
    if (colorSec) {
      if (type === 'image_full_width') colorSec.classList.add('hidden');
      else colorSec.classList.remove('hidden');
    }
    this.updateLivePreview();
  },

  onCategorySelectChange(catId) {
    this.populateSubcategories(catId);
  },

  populateSubcategories(catId, preselectSubId = null) {
    const subSelect = document.getElementById('bn-subcategory-id');
    if (!subSelect) return;

    if (!catId) {
      subSelect.innerHTML = '<option value="">-- اختر القسم الفرعي --</option>';
      return;
    }

    const matches = this.subcategories.filter(s => String(s.categoryId) === String(catId));
    if (matches.length === 0) {
      subSelect.innerHTML = '<option value="">لا توجد أقسام فرعية مسجلة</option>';
    } else {
      subSelect.innerHTML = `
        <option value="">-- اختر القسم الفرعي --</option>
        ${matches.map(s => `
          <option value="${s.id}" ${preselectSubId && String(s.id) === String(preselectSubId) ? 'selected' : ''}>${s.name}</option>
        `).join('')}
      `;
    }
  },

  onColorPresetChange(val) {
    const customWrap = document.getElementById('bn-custom-color-wrap');
    const gradientInput = document.getElementById('bn-gradient');

    if (val === '__custom__') {
      if (customWrap) customWrap.classList.remove('hidden');
    } else {
      if (customWrap) customWrap.classList.add('hidden');
      if (gradientInput) gradientInput.value = val;
    }
    this.updateLivePreview();
  },

  onUrlInput(val) {
    this.currentImageUrl = val.trim();
    this.updateLivePreview();
  },

  async uploadImageFile(e) {
    const file = e.target.files[0];
    if (!file) return;

    try {
      App.showToast('جاري رفع صورة البانر...', 'info');
      const res = await API.upload(file);
      if (res.success && res.url) {
        this.currentImageUrl = res.url;
        const imgInput = document.getElementById('bn-image');
        if (imgInput) imgInput.value = res.url;
        this.updateLivePreview();
        App.showToast('تم رفع صورة البانر بنجاح', 'success');
      }
    } catch (err) {
      App.showToast(err.message || 'فشل رفع الصورة', 'error');
    }
  },

  updateLivePreview() {
    const wrap = document.getElementById('bn-live-preview-wrap');
    if (!wrap) return;

    const type = document.getElementById('bn-type')?.value || 'image_full_width';
    const titleVal = document.getElementById('bn-title')?.value.trim() || '';
    const subVal = document.getElementById('bn-sub')?.value.trim() || '';
    const badgeVal = document.getElementById('bn-badge')?.value.trim() || '';
    const imgVal = this.currentImageUrl || document.getElementById('bn-image')?.value.trim() || 'https://images.unsplash.com/photo-1607082348824-0a96f2a4b9da?w=1200';

    if (type === 'image_full_width') {
      wrap.innerHTML = `
        <div class="relative w-full aspect-[21/9] sm:aspect-[24/7] max-h-56 overflow-hidden bg-slate-900 group">
          <img src="${imgVal}" class="w-full h-full object-cover" />
          ${(titleVal || badgeVal) ? `
            <div class="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent flex items-end p-4 text-white">
              <div>
                ${badgeVal ? `<span class="bg-emerald-600 text-white text-[10px] font-black px-2 py-0.5 rounded-full inline-block mb-1">${badgeVal}</span>` : ''}
                ${titleVal ? `<h4 class="font-black text-sm text-white">${titleVal}</h4>` : ''}
                ${subVal ? `<p class="text-xs text-slate-200 mt-0.5 line-clamp-1">${subVal}</p>` : ''}
              </div>
            </div>
          ` : ''}
        </div>
      `;
    } else {
      const colorSelect = document.getElementById('bn-color-select');
      let gradientVal = colorSelect?.value;
      if (gradientVal === '__custom__' || !gradientVal) {
        gradientVal = document.getElementById('bn-gradient')?.value.trim() || this.colorPresets[0].value;
      }
      wrap.innerHTML = `
        <div class="p-5 text-white relative overflow-hidden flex items-center justify-between min-h-[140px]" style="background: ${gradientVal}">
          <div class="relative z-10 max-w-[65%]">
            <span class="bg-white/20 backdrop-blur-sm text-white text-[10px] font-bold px-2.5 py-0.5 rounded-full inline-block mb-1">
              ${badgeVal || 'عروض مميزة 🔥'}
            </span>
            <h3 class="text-base font-extrabold line-clamp-1">
              ${titleVal || 'عنوان البانر الرئيسي'}
            </h3>
            <p class="text-xs text-white/80 line-clamp-1 mt-0.5">
              ${subVal || 'وصف البانر أو الخصم الإضافي'}
            </p>
          </div>
          <div class="relative z-10 w-24 h-20 rounded-xl overflow-hidden bg-white/10 flex-shrink-0 flex items-center justify-center border border-white/20">
            <img src="${imgVal}" class="w-full h-full object-cover" />
          </div>
        </div>
      `;
    }
  },

  editBanner(id) {
    const b = this.banners.find(item => item.id === id);
    if (b) this.openModal(b);
  },

  deleteBanner(id) {
    const b = this.banners.find(item => item.id === id);
    const title = b ? (b.title || 'هذا البانر') : 'هذا البانر';
    App.confirm(`هل أنت متأكد من حذف البانر "${title}"؟`, async () => {
      try {
        const res = await API.delete(`/banners/${id}`);
        if (res.success) {
          App.showToast('تم حذف البانر بنجاح', 'success');
          this.render();
        }
      } catch (err) {
        App.showToast(err.message, 'error');
      }
    });
  },

  async submitForm(e) {
    e.preventDefault();
    const placement = document.getElementById('bn-placement').value;
    const bannerType = document.getElementById('bn-type').value;
    const categoryId = document.getElementById('bn-category-id')?.value || null;
    const subcategoryId = document.getElementById('bn-subcategory-id')?.value || null;

    if (placement === 'category' && !categoryId) {
      App.showToast('يجب اختيار القسم الرئيسي للبانر', 'warning');
      return;
    }
    if (placement === 'subcategory' && (!categoryId || !subcategoryId)) {
      App.showToast('يجب اختيار القسم الرئيسي والفرعي للبانر', 'warning');
      return;
    }

    const title = document.getElementById('bn-title').value.trim();
    const subtitle = document.getElementById('bn-sub').value.trim();
    const badgeText = document.getElementById('bn-badge').value.trim();
    const orderIndex = Number(document.getElementById('bn-order').value) || 0;
    const imageUrl = this.currentImageUrl || document.getElementById('bn-image').value.trim();
    const linkUrl = document.getElementById('bn-link').value.trim();

    const colorSelect = document.getElementById('bn-color-select');
    let bgGradient = colorSelect ? colorSelect.value : this.colorPresets[0].value;
    let colorName = '';

    if (bgGradient === '__custom__') {
      bgGradient = document.getElementById('bn-gradient')?.value.trim() || this.colorPresets[0].value;
      colorName = 'لون مخصص';
    } else {
      const preset = this.colorPresets.find(p => p.value === bgGradient);
      colorName = preset ? preset.name.split(' (')[0] : '';
    }

    const isActive = document.getElementById('bn-active').checked;

    if (!imageUrl && !title) {
      App.showToast('يرجى رفع صورة للبانر أو كتابة عنوان', 'warning');
      return;
    }

    const payload = {
      title,
      subtitle,
      badgeText,
      orderIndex,
      imageUrl,
      linkUrl,
      bgGradient,
      colorName,
      isActive,
      placement,
      bannerType,
      categoryId,
      subcategoryId
    };

    try {
      if (this.editingBannerId) {
        const res = await API.put(`/banners/${this.editingBannerId}`, payload);
        if (res.success) {
          App.closeModal();
          App.showToast('تم تحديث البانر بنجاح', 'success');
          this.render();
        }
      } else {
        const res = await API.post('/banners', payload);
        if (res.success) {
          App.closeModal();
          App.showToast('تم إضافة ونشر البانر بنجاح', 'success');
          this.render();
        }
      }
    } catch (err) {
      App.showToast(err.message, 'error');
    }
  }
};