/**
 * Suki Store Admin - Merchants Management (إدارة حسابات التجار)
 * View, search, create merchant accounts, manage edit permissions, and export balance sheets.
 */

const MerchantsAdmin = {
  merchants: [],
  searchQuery: '',
  editingMerchantId: null,
  selectedIds: new Set(),

  toggleSelectAll(checked) {
    if (checked) {
      this.merchants.forEach(m => this.selectedIds.add(String(m.id)));
    } else {
      this.selectedIds.clear();
    }
    this.renderTable();
  },

  toggleSelectOne(id, checked) {
    id = String(id);
    if (checked) {
      this.selectedIds.add(id);
    } else {
      this.selectedIds.delete(id);
    }
    this.renderTable();
  },

  async bulkDelete() {
    if (this.selectedIds.size === 0) {
      App.showToast('لم يتم تحديد أي تجار للحذف', 'warning');
      return;
    }
    const count = this.selectedIds.size;
    const confirmed = confirm(`تحذير: هل أنت متأكد من حذف ${count} تاجر محدد وحسابات دخولهم؟ لا يمكن التراجع.`);
    if (!confirmed) return;

    try {
      const res = await API.post('/merchants/bulk-delete', {
        ids: Array.from(this.selectedIds)
      });
      if (res.success) {
        App.showToast(`تم حذف ${res.deletedCount || count} تاجر بنجاح`, 'success');
        this.selectedIds.clear();
        await this.fetchMerchants();
      } else {
        App.showToast(res.message || 'فشل حذف التجار المحددين', 'error');
      }
    } catch (err) {
      console.error('Merchants bulk delete error:', err);
      App.showToast(err.message || 'حدث خطأ أثناء الحذف الجماعي', 'error');
    }
  },

  async render() {
    AdminLayout.render('merchants', `
      <div class="py-12 text-center text-slate-400">
        <i class="fa-solid fa-spinner fa-spin text-3xl mb-3 text-emerald-600"></i>
        <div class="font-bold">جاري تحميل قائمة وبيانات التجار...</div>
      </div>
    `);

    await this.fetchMerchants();
  },

  async fetchMerchants() {
    try {
      const q = this.searchQuery ? `?search=${encodeURIComponent(this.searchQuery)}` : '';
      const res = await API.get(`/merchants${q}`);
      this.merchants = res.merchants || [];
      this.renderTable();
    } catch (err) {
      console.error('Failed to load merchants:', err);
      AdminLayout.render('merchants', `
        <div class="p-8 text-center text-rose-600 bg-rose-50 rounded-xl border border-rose-200">
          <i class="fa-solid fa-circle-exclamation text-3xl mb-2"></i>
          <div>فشل تحميل قائمة التجار. يُرجى المحاولة مرة أخرى.</div>
        </div>
      `);
    }
  },

  renderTable() {
    const totalMerchants = this.merchants.length;
    const totalProducts = this.merchants.reduce((acc, m) => acc + (m.productsCount || 0), 0);
    const totalSales = this.merchants.reduce((acc, m) => acc + (m.totalSales || 0), 0);
    const totalDelivered = this.merchants.reduce((acc, m) => acc + (m.deliveredOrdersCount || 0), 0);

    const content = `
      <div class="space-y-6 text-right" dir="rtl">
        <!-- Top Banner -->
        <div class="bg-gradient-to-l from-slate-900 to-slate-800 text-white p-6 rounded-2xl shadow-lg">
          <div class="flex items-center justify-between flex-wrap gap-4">
            <div>
              <h1 class="text-2xl font-black mb-1 flex items-center gap-2.5">
                <i class="fa-solid fa-store text-emerald-400"></i>
                <span>قسم التجار (حسابات وصلاحيات الموردين)</span>
              </h1>
              <p class="text-slate-300 text-sm">
                إنشاء وإدارة حسابات دخول التجار، كود التاجر، رقم الواتساب، والتحكم في إمكانية تعديل المنتجات
              </p>
            </div>
            <div class="flex items-center gap-2">
              <a href="#/admin/bulk-upload" class="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 rounded-xl text-xs font-extrabold shadow-sm transition flex items-center gap-2">
                <i class="fa-solid fa-file-invoice"></i>
                <span>رفع منتجات لشيت التاجر</span>
              </a>
              <button onclick="MerchantsAdmin.openModal()" class="bg-teal-600 hover:bg-teal-700 text-white px-4 py-2.5 rounded-xl text-xs font-extrabold shadow-sm transition flex items-center gap-2 cursor-pointer">
                <i class="fa-solid fa-user-plus"></i>
                <span>إنشاء حساب تاجر جديد</span>
              </button>
            </div>
          </div>
        </div>

        <!-- Metrics Cards -->
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <div class="text-xs font-bold text-slate-500 mb-1">إجمالي التجار</div>
            <div class="text-2xl font-black text-slate-800">${totalMerchants}</div>
          </div>
          <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <div class="text-xs font-bold text-slate-500 mb-1">المنتجات المرتبطة بتجار</div>
            <div class="text-2xl font-black text-emerald-600">${totalProducts}</div>
          </div>
          <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <div class="text-xs font-bold text-slate-500 mb-1">الطلبات المسلمة للتجار</div>
            <div class="text-2xl font-black text-teal-600">${totalDelivered}</div>
          </div>
          <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <div class="text-xs font-bold text-slate-500 mb-1">إجمالي مبيعات التجار</div>
            <div class="text-2xl font-black text-amber-600">${Math.round(totalSales).toLocaleString('ar-EG')} ج.م</div>
          </div>
        </div>

        <!-- Search and Filter Bar -->
        <div class="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm">
          <div class="flex items-center justify-between flex-wrap gap-3">
            <div class="relative flex-1 min-w-[260px]">
              <input 
                type="text" 
                id="merchants-search-input" 
                class="form-control text-xs pr-9 font-medium" 
                placeholder="ابحث بكود التاجر، الاسم، اسم المستخدم، أو رقم الهاتف..." 
                value="${this.searchQuery}" 
                oninput="MerchantsAdmin.onSearchInput(this.value)"
              />
              <i class="fa-solid fa-magnifying-glass absolute right-3 top-2.5 text-slate-400 text-xs"></i>
            </div>
            <div class="flex items-center gap-2">
              ${this.selectedIds.size > 0 ? `
                <button onclick="MerchantsAdmin.bulkDelete()" class="bg-red-600 hover:bg-red-700 text-white font-extrabold px-3.5 py-2 rounded-xl text-xs flex items-center gap-1.5 shadow-sm transition animate-pulse">
                  <i class="fa-solid fa-trash-can"></i>
                  <span>حذف التجار المحددين (${this.selectedIds.size})</span>
                </button>
              ` : ''}
              ${this.searchQuery ? `
                <button onclick="MerchantsAdmin.clearSearch()" class="btn btn-secondary text-xs px-3 py-1.5 flex items-center gap-1">
                  <i class="fa-solid fa-xmark"></i> مسح البحث
                </button>
              ` : ''}
            </div>
          </div>
        </div>

        <!-- Merchants Table -->
        <div class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div class="overflow-x-auto">
            <table class="w-full text-right text-xs">
              <thead class="bg-slate-50 text-slate-700 font-extrabold border-b border-slate-200">
                <tr>
                  <th class="py-3 px-3 w-10 text-center">
                    <input 
                      type="checkbox" 
                      id="merchants-select-all" 
                      class="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer" 
                      ${this.merchants.length > 0 && this.merchants.every(m => this.selectedIds.has(String(m.id))) ? 'checked' : ''} 
                      onchange="MerchantsAdmin.toggleSelectAll(this.checked)" 
                      title="تحديد كافة التجار"
                    />
                  </th>
                  <th class="py-3 px-3 w-10 text-center">#</th>
                  <th class="py-3 px-3">كود التاجر</th>
                  <th class="py-3 px-3">اسم التاجر</th>
                  <th class="py-3 px-3">حساب الدخول والواتساب</th>
                  <th class="py-3 px-3 text-center">حق التاجر (التكلفة)</th>
                  <th class="py-3 px-3 text-center">المنتجات</th>
                  <th class="py-3 px-3 text-center">المبيعات المحصلة</th>
                  <th class="py-3 px-3 text-center">صلاحية تعديل المنتجات</th>
                  <th class="py-3 px-3 text-center w-36">إجراءات</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100 bg-white">
                ${this.merchants.length === 0 ? `
                  <tr>
                    <td colspan="10" class="py-12 text-center text-slate-400">
                      <i class="fa-solid fa-store-slash text-3xl mb-2 block"></i>
                      <div class="font-bold">لا يوجد تجار مطابقين للبحث</div>
                    </td>
                  </tr>
                ` : this.merchants.map((m, idx) => {
                  const isChecked = this.selectedIds.has(String(m.id));
                  return `
                  <tr class="hover:bg-slate-50/70 transition ${isChecked ? 'bg-emerald-50/25' : ''}">
                    <td class="py-3 px-3 text-center">
                      <input 
                        type="checkbox" 
                        class="merchant-row-check rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer" 
                        value="${m.id}" 
                        ${isChecked ? 'checked' : ''} 
                        onchange="MerchantsAdmin.toggleSelectOne('${m.id}', this.checked)"
                      />
                    </td>
                    <td class="py-3 px-3 text-center font-bold text-slate-400">${idx + 1}</td>
                    <td class="py-3 px-3 font-mono font-black text-emerald-700 text-sm">
                      <span class="inline-flex items-center px-2 py-0.5 rounded-lg bg-emerald-50 border border-emerald-200">
                        ${m.code}
                      </span>
                    </td>
                    <td class="py-3 px-3 font-bold text-slate-800">
                      <div class="font-black text-slate-900">${m.name}</div>
                      ${m.address ? `<div class="text-[10px] text-slate-400 font-normal truncate max-w-xs">${m.address}</div>` : ''}
                    </td>
                    <td class="py-3 px-3 font-mono text-slate-600">
                      <div class="flex flex-col gap-0.5">
                        <span class="font-bold text-slate-800 flex items-center gap-1">
                          <i class="fa-solid fa-user-tag text-slate-400 text-[10px]"></i>
                          <span>${m.username || (m.code.toLowerCase())}</span>
                        </span>
                        ${m.whatsapp ? `
                          <a href="https://wa.me/20${m.whatsapp.replace(/^0+/, '')}" target="_blank" class="text-emerald-600 hover:text-emerald-700 font-bold flex items-center gap-1 text-[11px]" title="مراسلة التاجر عبر واتساب">
                            <i class="fa-brands fa-whatsapp text-emerald-500"></i>
                            <span>${m.whatsapp}</span>
                          </a>
                        ` : (m.phone ? `<span class="text-[11px] text-slate-400">${m.phone}</span>` : '<span class="text-[10px] text-slate-300">بدون هاتف</span>')}
                      </div>
                    </td>
                    <td class="py-3 px-3 text-center font-bold text-slate-700">
                      ${(m.totalCost || 0).toLocaleString('ar-EG')} ج.م
                    </td>
                    <td class="py-3 px-3 text-center">
                      <a href="#/admin/products?merchantCode=${encodeURIComponent(m.code)}" class="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-black bg-slate-100 text-slate-800 hover:bg-emerald-50 hover:text-emerald-700 transition" title="عرض كافة منتجات هذا التاجر">
                        <i class="fa-solid fa-boxes-stacked ml-1 text-slate-400"></i>
                        <span>${m.productsCount || 0}</span>
                      </a>
                    </td>
                    <td class="py-3 px-3 text-center font-black text-emerald-700 text-sm">
                      ${(m.totalSales || 0).toLocaleString('ar-EG')} ج.م
                    </td>
                    <td class="py-3 px-3 text-center">
                      <button 
                        type="button" 
                        onclick="MerchantsAdmin.toggleCanEdit('${m.id}')" 
                        class="px-2.5 py-1 rounded-full text-[11px] font-black cursor-pointer transition flex items-center gap-1 mx-auto ${m.canEditProducts !== false ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200 border border-emerald-300' : 'bg-amber-100 text-amber-800 hover:bg-amber-200 border border-amber-300'}"
                        title="انقر لتبديل صلاحية التعديل للتاجر"
                      >
                        ${m.canEditProducts !== false ? `
                          <i class="fa-solid fa-pen-nib text-[10px] text-emerald-600"></i>
                          <span>مسموح بالتعديل</span>
                        ` : `
                          <i class="fa-solid fa-lock text-[10px] text-amber-600"></i>
                          <span>مشاهدة فقط</span>
                        `}
                      </button>
                    </td>
                    <td class="py-3 px-3 text-center">
                      <div class="inline-flex items-center gap-1.5">
                        <button 
                          type="button" 
                          onclick="MerchantsAdmin.openSheetModal('${m.id}')" 
                          class="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 p-2 rounded-lg border border-indigo-200 transition" 
                          title="عرض وطباعة كشف الحساب / شيت التاجر"
                        >
                          <i class="fa-solid fa-file-invoice-dollar"></i>
                        </button>
                        <a 
                          href="#/admin/products?merchantCode=${encodeURIComponent(m.code)}" 
                          class="bg-slate-50 hover:bg-slate-100 text-slate-700 p-2 rounded-lg border border-slate-200 transition" 
                          title="عرض منتجات التاجر"
                        >
                          <i class="fa-solid fa-eye"></i>
                        </a>
                        <button 
                          type="button" 
                          onclick="MerchantsAdmin.openModal('${m.id}')" 
                          class="bg-amber-50 hover:bg-amber-100 text-amber-700 p-2 rounded-lg border border-amber-200 transition" 
                          title="تعديل بيانات وحساب التاجر"
                        >
                          <i class="fa-solid fa-pen-to-square"></i>
                        </button>
                        <button 
                          type="button" 
                          onclick="MerchantsAdmin.deleteMerchant('${m.id}', '${m.name}')" 
                          class="bg-rose-50 hover:bg-rose-100 text-rose-700 p-2 rounded-lg border border-rose-200 transition" 
                          title="حذف التاجر وحسابه"
                        >
                          <i class="fa-solid fa-trash-can"></i>
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

    AdminLayout.render('merchants', content);
  },

  onSearchInput(val) {
    this.searchQuery = val.trim();
    clearTimeout(this._searchTimer);
    this._searchTimer = setTimeout(() => {
      this.fetchMerchants();
    }, 300);
  },

  clearSearch() {
    this.searchQuery = '';
    const input = document.getElementById('merchants-search-input');
    if (input) input.value = '';
    this.fetchMerchants();
  },

  async toggleCanEdit(merchantId) {
    try {
      const res = await API.patch(`/merchants/${merchantId}/toggle-edit-products`);
      if (res.success) {
        App.showToast(res.message, 'success');
        this.fetchMerchants();
      } else {
        App.showToast(res.message || 'فشل تعديل الصلاحية', 'error');
      }
    } catch (err) {
      console.error('Toggle can edit error:', err);
      App.showToast(err.message || 'حدث خطأ أثناء تعديل صلاحية التاجر', 'error');
    }
  },

  openModal(merchantId = null) {
    this.editingMerchantId = merchantId;
    const m = merchantId ? this.merchants.find(x => x.id === merchantId) : null;
    const title = m ? `تعديل بيانات وحساب التاجر: ${m.name}` : 'إنشاء حساب تاجر ومورد جديد';

    const defaultUsername = m ? (m.username || m.code.toLowerCase()) : '';
    const canEdit = m ? (m.canEditProducts !== false) : true;

    const body = `
      <form onsubmit="MerchantsAdmin.submitForm(event)" class="text-right space-y-3.5" dir="rtl">
        <!-- Merchant Identification -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div class="form-group">
            <label class="form-label text-xs font-bold text-slate-700">كود التاجر (Merchant Code) *</label>
            <input 
              type="text" 
              id="m-code" 
              class="form-control text-xs font-mono font-bold uppercase tracking-wider" 
              value="${m ? m.code : ''}" 
              placeholder="مثال: M-101 أو TR-50" 
              ${m ? 'disabled' : 'required'} 
            />
            <span class="text-[10px] text-slate-400">الكود هو المعرف الفريد لمنتجات التاجر</span>
          </div>

          <div class="form-group">
            <label class="form-label text-xs font-bold text-slate-700">اسم التاجر أو الشركة *</label>
            <input type="text" id="m-name" class="form-control text-xs font-bold" value="${m ? m.name : ''}" placeholder="اسم التاجر أو المتجر..." required />
          </div>
        </div>

        <!-- Login Credentials -->
        <div class="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
          <div class="text-xs font-extrabold text-slate-800 flex items-center gap-1.5 pb-2 border-b border-slate-200">
            <i class="fa-solid fa-key text-emerald-600"></i>
            <span>بيانات تسجيل الدخول لحساب التاجر</span>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div class="form-group">
              <label class="form-label text-xs font-bold text-slate-700">اسم المستخدم (Username) *</label>
              <input 
                type="text" 
                id="m-username" 
                class="form-control text-xs font-mono font-bold" 
                value="${defaultUsername}" 
                placeholder="مثال: elalamya_store" 
                required 
              />
              <span class="text-[10px] text-slate-400">يستخدمه التاجر للدخول للوحة التحكم</span>
            </div>

            <div class="form-group">
              <label class="form-label text-xs font-bold text-slate-700">
                كلمة المرور ${m ? '(اتركها فارغة إذا لم ترد تغييرها)' : '*'}
              </label>
              <input 
                type="text" 
                id="m-password" 
                class="form-control text-xs font-mono" 
                placeholder="${m ? '••••••••' : 'أدخل كلمة مرور قوية...'}" 
                ${m ? '' : 'required'} 
              />
            </div>
          </div>
        </div>

        <!-- Contact & WhatsApp -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div class="form-group">
            <label class="form-label text-xs font-bold text-slate-700 flex items-center gap-1">
              <i class="fa-brands fa-whatsapp text-emerald-600"></i>
              <span>رقم الواتساب (اختياري)</span>
            </label>
            <input type="tel" id="m-whatsapp" class="form-control text-xs font-mono" value="${m ? (m.whatsapp || '') : ''}" placeholder="01012345678" />
            <span class="text-[10px] text-slate-400">للتواصل المباشر مع التاجر وإرسال إشعارات الطلبات</span>
          </div>

          <div class="form-group">
            <label class="form-label text-xs font-bold text-slate-700">رقم الهاتف الآخر (اختياري)</label>
            <input type="tel" id="m-phone" class="form-control text-xs font-mono" value="${m ? (m.phone || '') : ''}" placeholder="01098765432" />
          </div>
        </div>

        <!-- Permissions & Commission -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div class="form-group">
            <label class="form-label text-xs font-bold text-slate-700">طريقة حساب التاجر</label>
            <div class="text-[11px] text-slate-600 bg-slate-50 border border-slate-200 rounded-xl p-2.5 leading-5">
              التاجر بياخد <b>سعر التكلفة</b> المسجل على كل منتج، وأي زيادة في سعر البيع هي ربح المتجر. (لا توجد عمولة)
            </div>
          </div>

          <div class="form-group">
            <label class="form-label text-xs font-bold text-slate-700">صلاحية تعديل المنتجات *</label>
            <select id="m-can-edit" class="form-control text-xs font-bold">
              <option value="true" ${canEdit ? 'selected' : ''}>🟢 نعم، يستطيع التاجر تعديل منتجاته بنفسه</option>
              <option value="false" ${!canEdit ? 'selected' : ''}>🔒 لا، حساب التاجر للمشاهدة فقط (التعديل للإدارة فقط)</option>
            </select>
            <span class="text-[10px] text-slate-400">السوبر أدمن والمشرفين المصرح لهم يملكون دائماً تعديل أي منتج</span>
          </div>
        </div>

        <div class="form-group">
          <label class="form-label text-xs font-bold text-slate-700">عنوان المقر أو المخزن</label>
          <input type="text" id="m-address" class="form-control text-xs" value="${m ? (m.address || '') : ''}" placeholder="المحافظة - المنطقة - الشارع..." />
        </div>

        <div class="form-group">
          <label class="form-label text-xs font-bold text-slate-700">ملاحظات إضافية</label>
          <textarea id="m-notes" class="form-control text-xs" rows="2" placeholder="ملاحظات حول التاجر، حسابات، اتفاقيات...">${m ? (m.notes || '') : ''}</textarea>
        </div>

        <div class="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
          <button type="button" onclick="App.closeModal()" class="btn btn-secondary text-xs px-4 py-2">
            إلغاء
          </button>
          <button type="submit" class="bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs px-6 py-2.5 rounded-xl shadow-sm transition">
            ${m ? 'حفظ التعديلات' : 'إنشاء حساب التاجر'}
          </button>
        </div>
      </form>
    `;

    App.openModal(title, body);
  },

  async submitForm(e) {
    e.preventDefault();
    const code = document.getElementById('m-code')?.value?.trim().toUpperCase();
    const name = document.getElementById('m-name')?.value?.trim();
    const username = document.getElementById('m-username')?.value?.trim().toLowerCase();
    const password = document.getElementById('m-password')?.value?.trim();
    const whatsapp = document.getElementById('m-whatsapp')?.value?.trim();
    const phone = document.getElementById('m-phone')?.value?.trim();
    const canEditProducts = document.getElementById('m-can-edit')?.value === 'true';
    const commissionRate = typeof Utils !== 'undefined' ? Utils.parseNumber(document.getElementById('m-commission')?.value, 2.5) : (Number(document.getElementById('m-commission')?.value) || 2.5);
    const address = document.getElementById('m-address')?.value?.trim();
    const notes = document.getElementById('m-notes')?.value?.trim();

    if (!name || (!this.editingMerchantId && !code)) {
      App.showToast('كود التاجر واسم التاجر مطلوبان', 'warning');
      return;
    }

    if (!username) {
      App.showToast('اسم المستخدم للدخول مطلوب', 'warning');
      return;
    }

    if (!this.editingMerchantId && !password) {
      App.showToast('كلمة المرور مطلوبة لإنشاء حساب التاجر', 'warning');
      return;
    }

    try {
      if (this.editingMerchantId) {
        const payload = {
          name,
          username,
          phone,
          whatsapp,
          canEditProducts,
          commissionRate,
          address,
          notes
        };
        if (password) payload.password = password;

        const res = await API.put(`/merchants/${this.editingMerchantId}`, payload);
        if (res.success) {
          App.showToast('تم تحديث بيانات وحساب التاجر بنجاح', 'success');
          App.closeModal();
          this.fetchMerchants();
        } else {
          App.showToast(res.message || 'فشل التحديث', 'error');
        }
      } else {
        const res = await API.post('/merchants', {
          code,
          name,
          username,
          password,
          phone,
          whatsapp,
          canEditProducts,
          commissionRate,
          address,
          notes
        });
        if (res.success) {
          App.showToast('تم إنشاء حساب التاجر بنجاح 🚀', 'success');
          App.closeModal();
          this.fetchMerchants();
        } else {
          App.showToast(res.message || 'فشل إنشاء الحساب', 'error');
        }
      }
    } catch (err) {
      console.error('Merchant form error:', err);
      App.showToast(err.message || 'حدث خطأ في حفظ بيانات التاجر', 'error');
    }
  },

  async deleteMerchant(id, name) {
    if (!confirm(`هل أنت متأكد من حذف التاجر "${name}" وحسابه نهائياً؟`)) return;

    try {
      const res = await API.delete(`/merchants/${id}`);
      if (res.success) {
        App.showToast('تم حذف التاجر وحسابه بنجاح', 'info');
        this.fetchMerchants();
      } else {
        App.showToast(res.message || 'فشل الحذف', 'error');
      }
    } catch (err) {
      console.error('Delete merchant error:', err);
      App.showToast(err.message || 'فشل حذف التاجر', 'error');
    }
  },

  openSheetModal(id) {
    const m = this.merchants.find(x => x.id === id);
    if (!m) return;

    // New model: the merchant is owed his cost price; the difference is store profit (no commission)
    const gross = m.totalSales || 0;
    const netDues = Math.round((m.totalCost || 0) * 100) / 100;
    const storeComm = Math.round((m.storeProfit || 0) * 100) / 100;

    const sheetHtml = `
      <div id="merchant-sheet-printable" class="p-6 bg-white rounded-2xl text-right space-y-4" dir="rtl">
        <!-- Sheet Header -->
        <div class="flex items-center justify-between pb-4 border-b border-slate-200 flex-wrap gap-2">
          <div>
            <div class="flex items-center gap-2">
              <span class="bg-indigo-100 text-indigo-800 text-xs font-black px-2.5 py-0.5 rounded-full">${m.code}</span>
              <h2 class="text-xl font-black text-slate-800">${m.name}</h2>
            </div>
            <p class="text-xs text-slate-400 mt-1">كشف حساب ومستحقات التاجر - سوقي ستور</p>
          </div>
          <div class="text-left font-mono text-xs text-slate-500">
            <div>التاريخ: ${new Date().toLocaleDateString('ar-EG')}</div>
            <div>الهاتف: ${m.whatsapp || m.phone || 'غير مسجل'}</div>
            <div>اسم المستخدم: ${m.username || m.code.toLowerCase()}</div>
          </div>
        </div>

        <!-- Financial Summary Grid -->
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 py-2">
          <div class="p-3 bg-slate-50 rounded-xl border border-slate-200">
            <div class="text-[10px] font-bold text-slate-500">المنتجات المسجلة</div>
            <div class="text-base font-black text-slate-800 mt-0.5">${m.productsCount || 0} منتج</div>
          </div>
          <div class="p-3 bg-slate-50 rounded-xl border border-slate-200">
            <div class="text-[10px] font-bold text-slate-500">الطلبات المسلمة</div>
            <div class="text-base font-black text-emerald-700 mt-0.5">${m.deliveredOrdersCount || 0} طلب</div>
          </div>
          <div class="p-3 bg-slate-50 rounded-xl border border-slate-200">
            <div class="text-[10px] font-bold text-slate-500">إجمالي المبيعات المحصلة</div>
            <div class="text-base font-black text-slate-800 mt-0.5">${gross.toLocaleString('ar-EG')} ج.م</div>
          </div>
          <div class="p-3 bg-emerald-50 rounded-xl border border-emerald-200">
            <div class="text-[10px] font-bold text-emerald-700">صافي المستحقات للتاجر</div>
            <div class="text-lg font-black text-emerald-800 mt-0.5">${netDues.toLocaleString('ar-EG')} ج.م</div>
          </div>
        </div>

        <!-- Breakdown Details -->
        <div class="rounded-xl border border-slate-200 overflow-hidden text-xs">
          <div class="bg-slate-50 p-2.5 font-bold border-b text-slate-700">تفاصيل الحسبة المالية للتاجر:</div>
          <div class="divide-y divide-slate-100 p-2 text-slate-700">
            <div class="flex justify-between py-1.5 px-2">
              <span>إجمالي المبيعات الإجمالية (Gross Sales):</span>
              <span class="font-bold">${gross.toLocaleString('ar-EG')} ج.م</span>
            </div>
            <div class="flex justify-between py-1.5 px-2">
              <span>حق التاجر (سعر التكلفة × الكميات المباعة):</span>
              <span class="font-bold text-slate-800">${netDues.toLocaleString('ar-EG')} ج.م</span>
            </div>
            <div class="flex justify-between py-1.5 px-2">
              <span>ربح المتجر (سعر البيع − التكلفة):</span>
              <span class="font-bold text-purple-700">${storeComm.toLocaleString('ar-EG')} ج.م</span>
            </div>
            <div class="flex justify-between py-2 px-2 bg-emerald-50 text-emerald-900 font-black rounded-lg">
              <span>صافي رصيد التاجر القابل للصرف:</span>
              <span class="text-sm">${netDues.toLocaleString('ar-EG')} ج.م</span>
            </div>
          </div>
        </div>

        <!-- Footer / Action Buttons -->
        <div class="flex items-center justify-between pt-3 border-t border-slate-200 no-print flex-wrap gap-2">
          <button type="button" onclick="App.closeModal()" class="btn btn-secondary text-xs px-4 py-2">
            إغلاق
          </button>
          <div class="flex items-center gap-2">
            <button 
              type="button" 
              onclick="ExportKit.print('#merchant-sheet-printable', 'شيت حساب التاجر ${m.code}')"
              class="px-4 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold flex items-center gap-1.5 shadow-sm">
              <i class="fa-solid fa-print"></i>
              <span>طباعة الشيت</span>
            </button>
            <button
              type="button"
              id="btn-export-sheet-img"
              onclick="MerchantsAdmin.downloadSheetAsImage('${m.code}')"
              class="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold flex items-center gap-1.5 shadow">
              <i class="fa-solid fa-file-pdf"></i>
              <span>PDF</span>
            </button>
            <button type="button" onclick="ExportKit.excel('#merchant-sheet-printable', 'شيت حساب التاجر ${m.code}')" class="px-4 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold flex items-center gap-1.5 shadow-sm">
              <i class="fa-solid fa-file-excel text-green-600"></i>
              <span>Excel</span>
            </button>
          </div>
        </div>
      </div>
    `;

    App.openModal(`شيت حساب التاجر: ${m.name} (${m.code})`, sheetHtml);
  },

  // (was "save as image", which broke Arabic letters) → real PDF through the print page
  async downloadSheetAsImage(code) {
    ExportKit.pdf('#merchant-sheet-printable', `شيت حساب التاجر ${code}`);
  }
};
