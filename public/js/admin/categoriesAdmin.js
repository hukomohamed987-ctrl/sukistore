/**
 * Suki Store Admin Categories & Subcategories Management
 * Supports full CRUD, Reorder, Visibility Toggle, and Square Banners Control
 */

const CategoriesAdmin = {
  currentTab: 'subcategories', // 'main' | 'subcategories'
  categories: [],
  subcategories: [],
  selectedCategoryFilter: 'all',
  editingCatId: null,
  editingSubId: null,
  currentImageUrl: '',
  selectedSubIds: new Set(),
  selectedCatIds: new Set(),

  toggleSelectAllSubs(checked) {
    let filteredSubs = this.subcategories;
    if (this.selectedCategoryFilter && this.selectedCategoryFilter !== 'all') {
      filteredSubs = filteredSubs.filter(s => String(s.categoryId) === String(this.selectedCategoryFilter));
    }
    if (checked) {
      filteredSubs.forEach(s => this.selectedSubIds.add(String(s.id)));
    } else {
      this.selectedSubIds.clear();
    }
    this.renderView();
  },

  toggleSelectSub(id, checked) {
    id = String(id);
    if (checked) {
      this.selectedSubIds.add(id);
    } else {
      this.selectedSubIds.delete(id);
    }
    this.renderView();
  },

  async bulkDeleteSubs() {
    if (this.selectedSubIds.size === 0) {
      App.showToast('لم يتم تحديد أي أقسام فرعية للحذف', 'warning');
      return;
    }
    const count = this.selectedSubIds.size;
    const confirmed = confirm(`هل أنت متأكد من حذف ${count} قسم فرعي وبنر محدد؟ لا يمكن التراجع.`);
    if (!confirmed) return;

    try {
      const res = await API.post('/categories/subcategories/bulk-delete', {
        ids: Array.from(this.selectedSubIds)
      });
      if (res.success) {
        App.showToast(`تم حذف ${res.deletedCount || count} قسم فرعي بنجاح`, 'success');
        this.selectedSubIds.clear();
        await this.render();
      } else {
        App.showToast(res.message || 'فشل الحذف الجماعي للأقسام الفرعية', 'error');
      }
    } catch (err) {
      console.error('Bulk delete subcategories error:', err);
      App.showToast(err.message || 'حدث خطأ أثناء الحذف الجماعي', 'error');
    }
  },

  toggleSelectAllCats(checked) {
    if (checked) {
      this.categories.forEach(c => this.selectedCatIds.add(String(c.id)));
    } else {
      this.selectedCatIds.clear();
    }
    this.renderView();
  },

  toggleSelectCat(id, checked) {
    id = String(id);
    if (checked) {
      this.selectedCatIds.add(id);
    } else {
      this.selectedCatIds.delete(id);
    }
    this.renderView();
  },

  async bulkDeleteCats() {
    if (this.selectedCatIds.size === 0) {
      App.showToast('لم يتم تحديد أي أقسام رئيسية للحذف', 'warning');
      return;
    }
    const count = this.selectedCatIds.size;
    const confirmed = confirm(`تحذير: هل أنت متأكد من حذف ${count} قسم رئيسي؟ سيتم إزالة ربط المنتجات والأقسام الفرعية التابعة.`);
    if (!confirmed) return;

    try {
      const res = await API.post('/categories/bulk-delete', {
        ids: Array.from(this.selectedCatIds)
      });
      if (res.success) {
        App.showToast(`تم حذف ${res.deletedCount || count} قسم رئيسي بنجاح`, 'success');
        this.selectedCatIds.clear();
        await this.render();
      } else {
        App.showToast(res.message || 'فشل الحذف الجماعي للأقسام الرئيسية', 'error');
      }
    } catch (err) {
      console.error('Bulk delete categories error:', err);
      App.showToast(err.message || 'حدث خطأ أثناء الحذف الجماعي', 'error');
    }
  },

  async render(tab = null) {
    if (tab) this.currentTab = tab;

    AdminLayout.render('categories', `
      <div class="py-12 text-center text-slate-400">
        <i class="fa-solid fa-spinner fa-spin text-3xl mb-3 text-emerald-600"></i>
        <div class="font-bold">جاري تحميل الأقسام والبنرات الفرعية...</div>
      </div>
    `);

    try {
      const [catRes, subRes] = await Promise.all([
        API.get('/categories'),
        API.get('/categories/subcategories')
      ]);

      this.categories = catRes.categories || [];
      this.subcategories = subRes.subcategories || [];

      this.renderView();
    } catch (err) {
      console.error('Categories admin render error:', err);
      AdminLayout.render('categories', `
        <div class="p-8 text-center text-red-500 font-bold">
          حدث خطأ أثناء تحميل بيانات الأقسام.
        </div>
      `);
    }
  },

  renderView() {
    const isSubTab = this.currentTab === 'subcategories';

    const html = `
      <div>
        <!-- Page Header -->
        <div class="flex items-center justify-between mb-6 flex-wrap gap-4">
          <div>
            <h1 class="text-2xl font-black text-slate-900 flex items-center gap-2">
              <i class="fa-solid fa-layer-group text-emerald-600"></i>
              <span>نظام الأقسام والبنرات المربعة</span>
            </h1>
            <p class="text-xs text-slate-500 mt-1">التحكم الكامل في الأقسام الرئيسية والبنرات الفرعية المربعة ونصوص الخصومات</p>
          </div>
          <div class="flex items-center gap-2">
            ${isSubTab ? `
              <button onclick="CategoriesAdmin.openSubcategoryModal()" class="bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold px-4 py-2.5 rounded-xl text-xs flex items-center gap-2 shadow-md transition">
                <i class="fa-solid fa-plus"></i>
                <span>إضافة بنر قسم فرعي جديد</span>
              </button>
            ` : `
              <button onclick="CategoriesAdmin.openCategoryModal()" class="bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold px-4 py-2.5 rounded-xl text-xs flex items-center gap-2 shadow-md transition">
                <i class="fa-solid fa-plus"></i>
                <span>إضافة قسم رئيسي جديد</span>
              </button>
            `}
          </div>
        </div>

        <!-- Tabs Navigation -->
        <div class="flex items-center gap-3 border-b border-slate-200 mb-6 pb-2">
          <button 
            type="button"
            onclick="CategoriesAdmin.switchTab('subcategories')"
            class="px-5 py-2.5 rounded-xl font-extrabold text-xs transition flex items-center gap-2 ${isSubTab ? 'bg-emerald-600 text-white shadow-sm' : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'}">
            <i class="fa-solid fa-grip"></i>
            <span>الأقسام الفرعية والبنرات المربعة (${this.subcategories.length})</span>
          </button>

          <button 
            type="button"
            onclick="CategoriesAdmin.switchTab('main')"
            class="px-5 py-2.5 rounded-xl font-extrabold text-xs transition flex items-center gap-2 ${!isSubTab ? 'bg-emerald-600 text-white shadow-sm' : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'}">
            <i class="fa-solid fa-folder-tree"></i>
            <span>الأقسام الرئيسية (${this.categories.length})</span>
          </button>
        </div>

        <!-- Tab Content -->
        ${isSubTab ? this.renderSubcategoriesTab() : this.renderMainCategoriesTab()}
      </div>
    `;

    AdminLayout.render('categories', html);
  },

  switchTab(tab) {
    this.currentTab = tab;
    this.renderView();
  },

  // ==========================================
  // TAB 1: SUBCATEGORIES & SQUARE BANNERS
  // ==========================================
  renderSubcategoriesTab() {
    let filteredSubs = this.subcategories;
    if (this.selectedCategoryFilter && this.selectedCategoryFilter !== 'all') {
      filteredSubs = filteredSubs.filter(s => String(s.categoryId) === String(this.selectedCategoryFilter));
    }
    const allSubsSelected = filteredSubs.length > 0 && filteredSubs.every(s => this.selectedSubIds.has(String(s.id)));

    return `
      <!-- Subcategory Filter Toolbar -->
      <div class="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm mb-6 flex flex-wrap items-center justify-between gap-4">
        <div class="flex items-center gap-3 flex-wrap">
          <span class="text-xs font-bold text-slate-700 flex items-center gap-1.5">
            <i class="fa-solid fa-filter text-emerald-600"></i> تصفية حسب القسم الرئيسي:
          </span>
          <select 
            onchange="CategoriesAdmin.onCategoryFilterChange(this.value)" 
            class="form-control text-xs font-bold py-2 px-3 bg-slate-50 border-slate-200 rounded-xl max-w-xs">
            <option value="all" ${this.selectedCategoryFilter === 'all' ? 'selected' : ''}>كافة الأقسام الرئيسية (${this.subcategories.length} قسم فرعي)</option>
            ${this.categories.map(c => `
              <option value="${c.id}" ${this.selectedCategoryFilter === c.id ? 'selected' : ''}>
                ${c.name}
              </option>
            `).join('')}
          </select>
        </div>

        <div class="flex items-center gap-3 flex-wrap">
          <div class="text-xs text-slate-500 font-bold">
            معروض حالياً: <span class="text-emerald-700 font-extrabold">${filteredSubs.length}</span> بنر فرعي
          </div>
          ${this.selectedSubIds.size > 0 ? `
            <button onclick="CategoriesAdmin.bulkDeleteSubs()" class="bg-red-600 hover:bg-red-700 text-white font-extrabold px-3.5 py-2 rounded-xl text-xs flex items-center gap-1.5 shadow-sm transition animate-pulse">
              <i class="fa-solid fa-trash-can"></i>
              <span>حذف الأقسام الفرعية المحددة (${this.selectedSubIds.size})</span>
            </button>
          ` : ''}
        </div>
      </div>

      <!-- Subcategories Grid / Table -->
      <div class="admin-card">
        <div class="admin-table-container">
          <table class="admin-table">
            <thead>
              <tr>
                <th style="width: 40px; text-align: center;">
                  <input 
                    type="checkbox" 
                    id="sub-select-all" 
                    class="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                    ${allSubsSelected ? 'checked' : ''} 
                    onchange="CategoriesAdmin.toggleSelectAllSubs(this.checked)" 
                    title="تحديد الكل"
                  />
                </th>
                <th class="w-20">البنر المربع</th>
                <th>اسم القسم الفرعي</th>
                <th>القسم الرئيسي</th>
                <th>نص الخصم / العرض</th>
                <th>الوصف</th>
                <th>الحالة (ظهور)</th>
                <th>الإجراءات</th>
              </tr>
            </thead>
            <tbody>
              ${filteredSubs.length === 0 ? `
                <tr>
                  <td colspan="8" class="text-center py-12 text-slate-400">
                    <i class="fa-solid fa-grip text-3xl mb-2 opacity-50"></i>
                    <div>لا توجد أقسام فرعية مطابقة للفلتر</div>
                  </td>
                </tr>
              ` : filteredSubs.map(sub => {
                const parentCat = this.categories.find(c => String(c.id) === String(sub.categoryId));
                const isVisible = sub.isVisible !== false;
                const isChecked = this.selectedSubIds.has(String(sub.id));
                return `
                  <tr class="${isChecked ? 'bg-emerald-50/25' : ''}">
                    <td style="text-align: center;">
                      <input 
                        type="checkbox" 
                        class="subcat-row-check rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                        value="${sub.id}"
                        ${isChecked ? 'checked' : ''}
                        onchange="CategoriesAdmin.toggleSelectSub('${sub.id}', this.checked)"
                      />
                    </td>
                    <td>
                      <div class="w-14 h-14 rounded-xl overflow-hidden border border-slate-200 relative group aspect-square shadow-sm">
                        <img src="${sub.image || 'https://images.unsplash.com/photo-1526170375885-4d8ecf77b99f?w=100'}" class="w-full h-full object-cover" />
                      </div>
                    </td>
                    <td>
                      <div class="font-extrabold text-slate-900 text-xs">${sub.name}</div>
                      <div class="text-[10px] text-slate-400 font-mono">ID: ${sub.id}</div>
                    </td>
                    <td>
                      <span class="inline-flex items-center gap-1 text-[11px] font-bold bg-slate-100 text-slate-700 px-2.5 py-1 rounded-lg">
                        <i class="fa-solid fa-folder text-amber-500"></i>
                        <span>${parentCat ? parentCat.name : 'غير محدد'}</span>
                      </span>
                    </td>
                    <td>
                      ${sub.discountText ? `
                        <span class="inline-flex items-center gap-1 text-[11px] font-extrabold bg-red-50 text-red-700 border border-red-200 px-2 py-0.5 rounded-full">
                          <i class="fa-solid fa-bolt text-[10px]"></i>
                          <span>${sub.discountText}</span>
                        </span>
                      ` : `
                        <span class="text-[11px] text-slate-400 italic">بدون خصم</span>
                      `}
                    </td>
                    <td>
                      <div class="text-[11px] text-slate-500 max-w-xs truncate" title="${sub.description || ''}">
                        ${sub.description || '-'}
                      </div>
                    </td>
                    <td>
                      <button 
                        type="button" 
                        onclick="CategoriesAdmin.toggleSubcategoryVisibility('${sub.id}')"
                        class="px-3 py-1 rounded-full text-[11px] font-bold transition flex items-center gap-1.5 ${isVisible ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200' : 'bg-slate-200 text-slate-600 hover:bg-slate-300'}"
                        title="انقر لتغيير حالة الإظهار">
                        <i class="fa-solid ${isVisible ? 'fa-eye text-emerald-600' : 'fa-eye-slash text-slate-500'}"></i>
                        <span>${isVisible ? 'ظاهر للعملاء' : 'مخفي'}</span>
                      </button>
                    </td>
                    <td>
                      <div class="flex items-center gap-1.5">
                        <button onclick="CategoriesAdmin.editSubcategory('${sub.id}')" class="btn-icon-action" title="تعديل البنر">
                          <i class="fa-solid fa-pen-to-square text-blue-600"></i>
                        </button>
                        <button onclick="CategoriesAdmin.deleteSubcategory('${sub.id}')" class="btn-icon-action danger" title="حذف">
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
    `;
  },

  onCategoryFilterChange(val) {
    this.selectedCategoryFilter = val;
    this.renderView();
  },

  // ==========================================
  // TAB 2: MAIN CATEGORIES
  // ==========================================
  renderMainCategoriesTab() {
    const allCatsSelected = this.categories.length > 0 && this.categories.every(c => this.selectedCatIds.has(String(c.id)));

    return `
      <div class="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm mb-6 flex flex-wrap items-center justify-between gap-4">
        <div class="text-xs text-slate-600 font-bold">
          إجمالي الأقسام الرئيسية المسجلة: <span class="text-emerald-700 font-black">${this.categories.length}</span> قسم
        </div>
        ${this.selectedCatIds.size > 0 ? `
          <button onclick="CategoriesAdmin.bulkDeleteCats()" class="bg-red-600 hover:bg-red-700 text-white font-extrabold px-3.5 py-2 rounded-xl text-xs flex items-center gap-1.5 shadow-sm transition animate-pulse">
            <i class="fa-solid fa-trash-can"></i>
            <span>حذف الأقسام الرئيسية المحددة (${this.selectedCatIds.size})</span>
          </button>
        ` : ''}
      </div>

      <div class="admin-card">
        <div class="admin-table-container">
          <table class="admin-table">
            <thead>
              <tr>
                <th style="width: 40px; text-align: center;">
                  <input 
                    type="checkbox" 
                    id="cat-select-all" 
                    class="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                    ${allCatsSelected ? 'checked' : ''} 
                    onchange="CategoriesAdmin.toggleSelectAllCats(this.checked)" 
                    title="تحديد الكل"
                  />
                </th>
                <th>صورة القسم</th>
                <th>اسم القسم الرئيسي</th>
                <th>الرابط المختصر (Slug)</th>
                <th>الأيقونة</th>
                <th>الأقسام الفرعية التابعة</th>
                <th>إجمالي المنتجات</th>
                <th>الترتيب</th>
                <th>الإجراءات</th>
              </tr>
            </thead>
            <tbody>
              ${this.categories.length === 0 ? `
                <tr><td colspan="9" class="text-center py-8 text-slate-400">لا توجد أقسام مسجلة</td></tr>
              ` : this.categories.map(cat => {
                const subCount = this.subcategories.filter(s => String(s.categoryId) === String(cat.id)).length;
                const isChecked = this.selectedCatIds.has(String(cat.id));
                return `
                  <tr class="${isChecked ? 'bg-emerald-50/25' : ''}">
                    <td style="text-align: center;">
                      <input 
                        type="checkbox" 
                        class="cat-row-check rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                        value="${cat.id}"
                        ${isChecked ? 'checked' : ''}
                        onchange="CategoriesAdmin.toggleSelectCat('${cat.id}', this.checked)"
                      />
                    </td>
                    <td>
                      <img src="${cat.image || '/images/no-image.svg'}" class="w-12 h-12 rounded-xl object-cover border border-slate-200" />
                    </td>
                    <td>
                      <div class="font-extrabold text-slate-900 text-xs">${cat.name}</div>
                      <div class="text-[10px] text-slate-400 max-w-xs truncate">${cat.description || ''}</div>
                    </td>
                    <td class="text-xs text-slate-500 font-mono">${cat.slug}</td>
                    <td>
                      <span class="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-600 inline-flex items-center justify-center text-xs">
                        <i class="fa-solid fa-${cat.icon || 'tag'}"></i>
                      </span>
                    </td>
                    <td>
                      <button 
                        onclick="CategoriesAdmin.viewCategorySubs('${cat.id}')"
                        class="text-xs font-bold bg-amber-50 text-amber-800 hover:bg-amber-100 border border-amber-200 px-2.5 py-1 rounded-lg transition inline-flex items-center gap-1.5">
                        <i class="fa-solid fa-grip"></i>
                        <span>${subCount} أقسام فرعية</span>
                      </button>
                    </td>
                    <td>
                      <span class="bg-slate-100 text-slate-800 font-bold px-2.5 py-0.5 rounded-full text-xs">
                        ${cat.productCount || 0} منتج
                      </span>
                    </td>
                    <td class="font-bold text-xs text-slate-700">${cat.orderIndex || 0}</td>
                    <td>
                      <div class="flex items-center gap-1">
                        <button onclick="CategoriesAdmin.editCategory('${cat.id}')" class="btn-icon-action" title="تعديل">
                          <i class="fa-solid fa-pen-to-square text-blue-600"></i>
                        </button>
                        <button onclick="CategoriesAdmin.deleteCategory('${cat.id}')" class="btn-icon-action danger" title="حذف">
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
    `;
  },

  viewCategorySubs(catId) {
    this.selectedCategoryFilter = catId;
    this.currentTab = 'subcategories';
    this.renderView();
  },

  // ==========================================
  // SUBCATEGORY MODAL & ACTIONS
  // ==========================================
  openSubcategoryModal(sub = null) {
    this.editingSubId = sub ? sub.id : null;
    this.currentImageUrl = sub && sub.image ? sub.image : '';
    const title = sub ? 'تعديل بنر القسم الفرعي' : 'إضافة بنر قسم فرعي جديد';

    const modalBody = `
      <form onsubmit="CategoriesAdmin.submitSubcategoryForm(event)" class="text-right">
        <div class="form-group mb-3">
          <label class="form-label font-bold text-xs">القسم الرئيسي التابع له *</label>
          <select id="sub-cat-parent" class="form-control text-xs font-bold" required>
            <option value="">-- اختر القسم الرئيسي --</option>
            ${this.categories.map(c => `
              <option value="${c.id}" ${sub && String(sub.categoryId) === String(c.id) ? 'selected' : (this.selectedCategoryFilter === c.id ? 'selected' : '')}>
                ${c.name}
              </option>
            `).join('')}
          </select>
        </div>

        <div class="form-group mb-3">
          <label class="form-label font-bold text-xs">اسم القسم الفرعي *</label>
          <input type="text" id="sub-name" class="form-control text-xs font-bold" placeholder="مثال: هواتف ذكية، ساعات رجالية..." value="${sub ? sub.name : ''}" required />
        </div>

        <div class="form-group mb-3">
          <label class="form-label font-bold text-xs">نص الخصم أو العرض (اختياري)</label>
          <input type="text" id="sub-discount" class="form-control text-xs" placeholder="مثال: خصم حتى 25%، عروض الموسم، تخفيضات الصيف..." value="${sub ? (sub.discountText || '') : ''}" />
        </div>

        <!-- Square Banner Image Upload / URL -->
        <div class="form-group mb-3 bg-slate-50 p-3 rounded-xl border border-slate-200">
          <label class="form-label font-bold mb-2 flex items-center gap-1.5 text-xs text-slate-800">
            <i class="fa-solid fa-image text-emerald-600"></i>
            <span>صورة البنر المربع (Square Banner - 1:1)</span>
          </label>

          ${ImagePicker.html({ id: 'sub-image', value: sub ? (sub.image || '') : '', label: 'الصورة', hint: '(مربعة)', onChange: 'CategoriesAdmin.updateSubPreview' })}
        </div>

        <!-- Dedicated Wide Header Banner for Subcategory Page -->
        <div class="form-group mb-3 bg-purple-50/50 p-3 rounded-xl border border-purple-200">
          <label class="form-label font-bold mb-2 flex items-center gap-1.5 text-xs text-purple-900">
            <i class="fa-solid fa-panorama text-purple-600"></i>
            <span>بانر عريض للقسم الفرعي (يظهر أعلى صفحة القسم الفرعي)</span>
          </label>
          <div class="space-y-2">
            ${ImagePicker.html({ id: 'sub-banner-url', value: sub ? (sub.bannerUrl || '') : '', label: 'صورة البانر العريض', wide: true })}
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <input type="text" id="sub-banner-title" class="form-control text-xs" placeholder="عنوان البانر الترويجي..." value="${sub ? (sub.bannerTitle || '') : ''}" />
              <input type="text" id="sub-banner-subtitle" class="form-control text-xs" placeholder="النص الفرعي للبانر..." value="${sub ? (sub.bannerSubtitle || '') : ''}" />
            </div>
          </div>
        </div>

        <div class="form-group mb-3">
          <label class="form-label font-bold text-xs">ترتيب الظهور</label>
          <input type="number" id="sub-order" class="form-control text-xs" value="${sub ? (sub.orderIndex || 0) : 0}" />
        </div>

        <div class="form-group mb-4">
          <label class="form-label font-bold text-xs">وصف مختصر للقسم الفرعي</label>
          <textarea id="sub-desc" rows="2" class="form-control text-xs" placeholder="وصف يجذب العميل ويشرح محتوى هذا القسم...">${sub ? (sub.description || '') : ''}</textarea>
        </div>

        <div class="flex items-center gap-2 mb-4 bg-emerald-50 p-2.5 rounded-xl border border-emerald-200">
          <input type="checkbox" id="sub-visible" class="accent-emerald-600 w-4 h-4 cursor-pointer" ${sub ? (sub.isVisible !== false ? 'checked' : '') : 'checked'} />
          <label for="sub-visible" class="text-xs font-bold text-emerald-900 cursor-pointer">
            إظهار هذا القسم الفرعي للعملاء في المتجر
          </label>
        </div>

        <button type="submit" class="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold py-3.5 rounded-xl text-sm shadow-md transition">
          ${sub ? 'حفظ تعديلات البنر الفرعي' : 'إضافة البنر الفرعي'}
        </button>
      </form>
    `;

    App.openModal(title, modalBody);
  },

  editSubcategory(id) {
    const sub = this.subcategories.find(s => s.id === id);
    if (sub) this.openSubcategoryModal(sub);
  },

  async uploadSubImageFile(e) {
    const file = e.target.files[0];
    if (!file) return;

    try {
      App.showToast('جاري رفع صورة البنر المربع...', 'info');
      const res = await API.upload(file);
      if (res.success && res.url) {
        this.currentImageUrl = res.url;
        const imgInput = document.getElementById('sub-image');
        if (imgInput) imgInput.value = res.url;
        this.updateSubPreview(res.url);
        App.showToast('تم رفع صورة البنر بنجاح', 'success');
      }
    } catch (err) {
      App.showToast(err.message || 'فشل رفع الصورة', 'error');
    }
  },

  updateSubPreview(url) {
    const preview = document.getElementById('sub-img-preview');
    if (preview) {
      preview.src = url || 'https://images.unsplash.com/photo-1526170375885-4d8ecf77b99f?w=120';
    }
    this.currentImageUrl = url;
  },

  async submitSubcategoryForm(e) {
    e.preventDefault();
    const categoryId = document.getElementById('sub-cat-parent').value;
    const name = document.getElementById('sub-name').value.trim();
    const discountText = document.getElementById('sub-discount').value.trim();
    const image = (document.getElementById('sub-image').value.trim()) || this.currentImageUrl;
    const orderIndex = Number(document.getElementById('sub-order').value) || 0;
    const description = document.getElementById('sub-desc').value.trim();
    const isVisible = document.getElementById('sub-visible').checked;
    const bannerUrl = (document.getElementById('sub-banner-url')?.value || '').trim();
    const bannerTitle = (document.getElementById('sub-banner-title')?.value || '').trim();
    const bannerSubtitle = (document.getElementById('sub-banner-subtitle')?.value || '').trim();

    if (!categoryId || !name) {
      App.showToast('يُرجى اختيار القسم الرئيسي وكتابة اسم القسم الفرعي', 'error');
      return;
    }

    const payload = { categoryId, name, discountText, image, bannerUrl, bannerTitle, bannerSubtitle, orderIndex, description, isVisible };

    try {
      if (this.editingSubId) {
        const res = await API.put(`/categories/subcategories/${this.editingSubId}`, payload);
        if (res.success) {
          App.closeModal();
          App.showToast('تم تحديث بيانات القسم الفرعي بنجاح', 'success');
          this.render();
        }
      } else {
        const res = await API.post('/categories/subcategories', payload);
        if (res.success) {
          App.closeModal();
          App.showToast('تم إضافة القسم الفرعي بنجاح', 'success');
          this.render();
        }
      }
    } catch (err) {
      App.showToast(err.message, 'error');
    }
  },

  async toggleSubcategoryVisibility(subId) {
    try {
      const res = await API.patch(`/categories/subcategories/${subId}/toggle`);
      if (res.success) {
        App.showToast(res.message, 'success');
        this.render();
      }
    } catch (err) {
      App.showToast(err.message || 'فشل تغيير حالة الظهور', 'error');
    }
  },

  deleteSubcategory(id) {
    const sub = this.subcategories.find(s => s.id === id);
    const name = sub ? sub.name : '';
    App.confirm(`هل أنت متأكد من حذف القسم الفرعي "${name}"؟`, async () => {
      try {
        const res = await API.delete(`/categories/subcategories/${id}`);
        if (res.success) {
          App.showToast('تم حذف القسم الفرعي بنجاح', 'success');
          this.render();
        }
      } catch (err) {
        App.showToast(err.message, 'error');
      }
    });
  },

  // ==========================================
  // MAIN CATEGORY MODAL & ACTIONS
  // ==========================================
  openCategoryModal(cat = null) {
    this.editingCatId = cat ? cat.id : null;
    this.currentImageUrl = cat && cat.image ? cat.image : '';
    const titleText = cat ? 'تعديل بيانات القسم الرئيسي' : 'إضافة قسم رئيسي جديد';

    const modalBody = `
      <form onsubmit="CategoriesAdmin.submitCategoryForm(event)" class="text-right">
        <div class="form-group mb-3">
          <label class="form-label font-bold text-xs">اسم القسم الرئيسي *</label>
          <input type="text" id="cat-name" class="form-control text-xs font-bold" value="${cat ? cat.name : ''}" required />
        </div>

        <div class="grid grid-cols-2 gap-3 mb-3">
          <div class="form-group">
            <label class="form-label font-bold text-xs">الرابط المختصر (Slug)</label>
            <input type="text" id="cat-slug" class="form-control text-xs" placeholder="electronics" value="${cat ? (cat.slug || '') : ''}" />
          </div>

          <div class="form-group">
            <label class="form-label font-bold text-xs">اسم الأيقونة (FontAwesome)</label>
            <input type="text" id="cat-icon" class="form-control text-xs" placeholder="tv, smartphone, shirt..." value="${cat ? (cat.icon || 'tag') : 'tag'}" />
          </div>
        </div>

        <div class="form-group mb-3 bg-slate-50 p-3 rounded-xl border border-slate-200">
          ${ImagePicker.html({ id: 'cat-image', value: cat ? (cat.image || '') : '', label: 'صورة القسم الرئيسي', onChange: 'CategoriesAdmin.updateCatPreview' })}
        </div>

        <!-- Main Category Header Banner (Hero Banner) -->
        <div class="form-group mb-3 bg-emerald-50/50 p-3 rounded-xl border border-emerald-200">
          <label class="form-label font-bold mb-2 flex items-center gap-1.5 text-xs text-emerald-900">
            <i class="fa-solid fa-panorama text-emerald-600"></i>
            <span>بانر رئيسي عريض للقسم (يظهر كخلفية أعلى صفحة القسم)</span>
          </label>
          <div class="space-y-2">
            ${ImagePicker.html({ id: 'cat-banner-url', value: cat ? (cat.bannerUrl || '') : '', label: 'صورة البانر العريض', hint: '(مقاس عريض مثلاً 1200×300)', wide: true })}
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <input type="text" id="cat-banner-title" class="form-control text-xs" placeholder="عنوان ترويجي للبانر..." value="${cat ? (cat.bannerTitle || '') : ''}" />
              <input type="text" id="cat-banner-subtitle" class="form-control text-xs" placeholder="وصف ترويجي فرعي..." value="${cat ? (cat.bannerSubtitle || '') : ''}" />
            </div>
          </div>
        </div>

        <div class="form-group mb-3">
          <label class="form-label font-bold text-xs">ترتيب الظهور في القائمة</label>
          <input type="number" id="cat-order" class="form-control text-xs" value="${cat ? (cat.orderIndex || 0) : 0}" />
        </div>

        <div class="form-group mb-4">
          <label class="form-label font-bold text-xs">وصف القسم الرئيسي</label>
          <textarea id="cat-desc" rows="2" class="form-control text-xs">${cat ? (cat.description || '') : ''}</textarea>
        </div>

        <button type="submit" class="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold py-3.5 rounded-xl text-sm shadow-md transition">
          ${cat ? 'حفظ تعديلات القسم الرئيسي' : 'إضافة القسم الرئيسي'}
        </button>
      </form>
    `;

    App.openModal(titleText, modalBody);
  },

  editCategory(id) {
    const cat = this.categories.find(c => c.id === id);
    if (cat) this.openCategoryModal(cat);
  },

  deleteCategory(id) {
    const cat = this.categories.find(c => c.id === id);
    const name = cat ? cat.name : '';
    App.confirm(`هل أنت متأكد من حذف القسم "${name}"؟ قد يؤثر ذلك على المنتجات والأقسام الفرعية التابعة له.`, async () => {
      try {
        const res = await API.delete(`/categories/${id}`);
        if (res.success) {
          App.showToast('تم حذف القسم بنجاح', 'success');
          this.render();
        }
      } catch (err) {
        App.showToast(err.message, 'error');
      }
    });
  },

  async uploadCatImageFile(e) {
    const file = e.target.files[0];
    if (!file) return;

    try {
      App.showToast('جاري رفع صورة القسم...', 'info');
      const res = await API.upload(file);
      if (res.success && res.url) {
        this.currentImageUrl = res.url;
        const imgInput = document.getElementById('cat-image');
        if (imgInput) imgInput.value = res.url;
        this.updateCatPreview(res.url);
        App.showToast('تم رفع صورة القسم بنجاح', 'success');
      }
    } catch (err) {
      App.showToast(err.message || 'فشل رفع الصورة', 'error');
    }
  },

  updateCatPreview(url) {
    const preview = document.getElementById('cat-img-preview');
    if (preview) {
      preview.src = url || '/images/no-image.svg';
    }
    this.currentImageUrl = url;
  },

  async submitCategoryForm(e) {
    e.preventDefault();
    const name = document.getElementById('cat-name').value.trim();
    const slug = document.getElementById('cat-slug').value.trim();
    const icon = document.getElementById('cat-icon').value.trim();
    const image = (document.getElementById('cat-image').value.trim()) || this.currentImageUrl;
    const orderIndex = Number(document.getElementById('cat-order').value) || 0;
    const description = document.getElementById('cat-desc').value.trim();
    const bannerUrl = (document.getElementById('cat-banner-url')?.value || '').trim();
    const bannerTitle = (document.getElementById('cat-banner-title')?.value || '').trim();
    const bannerSubtitle = (document.getElementById('cat-banner-subtitle')?.value || '').trim();

    const payload = { name, slug, icon, image, bannerUrl, bannerTitle, bannerSubtitle, orderIndex, description };

    try {
      if (this.editingCatId) {
        const res = await API.put(`/categories/${this.editingCatId}`, payload);
        if (res.success) {
          App.closeModal();
          App.showToast('تم تحديث القسم بنجاح', 'success');
          this.render();
        }
      } else {
        const res = await API.post('/categories', payload);
        if (res.success) {
          App.closeModal();
          App.showToast('تم إضافة القسم بنجاح', 'success');
          this.render();
        }
      }
    } catch (err) {
      App.showToast(err.message, 'error');
    }
  }
};
