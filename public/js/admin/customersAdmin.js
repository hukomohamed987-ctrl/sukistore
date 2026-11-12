/**
 * Suki Store Admin Customers Management
 * Features:
 * - Search by Customer ID (CUST-xxxxx), Name, or Phone
 * - Full Customer Profile view (ID, Email, Phone, Secondary Phone, WhatsApp, Addresses, Orders)
 * - Full Edit Modal (Email, Phone, Secondary Phone, WhatsApp, Password, Lock/Unlock)
 * - Quick Lock/Unlock toggle
 */

const CustomersAdmin = {
  customers: [],
  currentSearch: '',
  currentStatus: '',
  selectedIds: new Set(),

  async render() {
    AdminLayout.render('customers', `
      <div class="py-12 text-center text-slate-400">
        <i class="fa-solid fa-spinner fa-spin text-3xl mb-3 text-emerald-600"></i>
        <div>جاري جلب بيانات العملاء...</div>
      </div>
    `);

    try {
      const params = {};
      if (this.currentSearch.trim()) params.search = this.currentSearch;
      if (this.currentStatus) params.status = this.currentStatus;

      const res = await API.get('/admin/customers', params);
      this.customers = res.customers || [];
      this.renderTable();
    } catch (err) {
      console.error('Customers admin render error:', err);
    }
  },

  renderTable() {
    const isSuper = State.user && State.user.role === 'super_admin';
    const allSelected = this.customers.length > 0 && this.customers.every(c => this.selectedIds.has(c.id));

    const html = `
      <div>
        <div class="flex items-center justify-between mb-6 flex-wrap gap-4">
          <div>
            <h1 class="text-2xl font-extrabold text-slate-900">إدارة حسابات العملاء</h1>
            <p class="text-xs text-slate-500 mt-1">البحث بالمعرف الفريد (ID) أو الاسم أو الهاتف، عرض العناوين، وتعديل الحسابات وقفلها</p>
          </div>
          <div class="flex items-center gap-2">
            <button onclick="API.download('/exports/customers', {}, 'customers.xlsx').catch(e => App.showToast(e.message, 'error'))" class="bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 font-bold px-3 py-2 rounded-xl text-xs flex items-center gap-2">
              <i class="fa-solid fa-file-excel text-green-600"></i> تصدير Excel
            </button>
            <!-- Bulk Delete Button -->
            <button 
              id="customers-bulk-delete-btn" 
              onclick="CustomersAdmin.bulkDelete()" 
              class="${this.selectedIds.size > 0 ? '' : 'hidden'} bg-red-600 hover:bg-red-700 text-white font-bold px-3.5 py-2 rounded-xl text-xs flex items-center gap-1.5 transition shadow-sm animate-pulse">
              <i class="fa-solid fa-trash-can"></i>
              <span>حذف المحدد (<span id="customers-selected-count">${this.selectedIds.size}</span>)</span>
            </button>
          </div>
        </div>

        <div class="admin-card">
          <!-- Search & Filter Header -->
          <div class="admin-card-header flex-wrap gap-3">
            <div class="flex items-center gap-3 flex-1 max-w-lg">
              <div class="relative w-full">
                <i class="fa-solid fa-magnifying-glass absolute right-3.5 top-3 text-slate-400 text-xs"></i>
                <input 
                  type="text" 
                  class="form-control text-xs pr-9" 
                  placeholder="ابحث بالـ ID (مثال CUST-1234) أو الاسم أو رقم الهاتف..." 
                  value="${this.currentSearch}" 
                  oninput="CustomersAdmin.handleSearch(this.value)"
                />
              </div>
            </div>

            <!-- Status Filter -->
            <div class="flex items-center gap-2">
              <button onclick="CustomersAdmin.filterStatus('')" class="px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${this.currentStatus === '' ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}">
                الكل (${this.customers.length})
              </button>
              <button onclick="CustomersAdmin.filterStatus('active')" class="px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${this.currentStatus === 'active' ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}">
                النشطة
              </button>
              <button onclick="CustomersAdmin.filterStatus('locked')" class="px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${this.currentStatus === 'locked' ? 'bg-red-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}">
                المقفلة
              </button>
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
                      id="customers-select-all" 
                      class="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                      ${allSelected ? 'checked' : ''} 
                      onchange="CustomersAdmin.toggleSelectAll(this.checked)" 
                      title="تحديد الكل"
                    />
                  </th>
                  <th>معرف العميل (ID)</th>
                  <th>بيانات العميل</th>
                  <th>أرقام الاتصال</th>
                  <th>البريد الإلكتروني</th>
                  <th>عدد الطلبات</th>
                  <th>إجمالي المشتريات</th>
                  <th>الحالة</th>
                  <th>الإجراءات</th>
                </tr>
              </thead>
              <tbody>
                ${this.customers.length === 0 ? `
                  <tr><td colspan="9" class="text-center py-8 text-slate-400">لا يوجد عملاء مطابقين لمعايير البحث</td></tr>
                ` : this.customers.map(c => {
                  const custId = c.customerId || `CUST-${(c.id || '').substring(0, 5)}`;
                  const isChecked = this.selectedIds.has(c.id);
                  return `
                    <tr class="${isChecked ? 'bg-emerald-50/20' : ''}">
                      <td style="text-align: center;">
                        <input 
                          type="checkbox" 
                          class="customer-row-check rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                          value="${c.id}"
                          ${isChecked ? 'checked' : ''}
                          onchange="CustomersAdmin.toggleSelectOne('${c.id}', this.checked)"
                        />
                      </td>
                      <td>
                        <span class="font-mono text-xs font-extrabold text-emerald-800 bg-emerald-50 px-2 py-1 rounded-md border border-emerald-200 inline-block">
                          ${custId}
                        </span>
                      </td>
                      <td>
                        <div class="flex items-center gap-2">
                          <img src="${c.avatar || 'https://api.dicebear.com/7.x/initials/svg?seed=' + encodeURIComponent(c.name)}" class="w-8 h-8 rounded-full border border-slate-200" />
                          <div>
                            <div class="font-bold text-slate-800 text-xs">${c.name}</div>
                            <div class="text-[10px] text-slate-400">انضم: ${new Date(c.createdAt || Date.now()).toLocaleDateString('ar-EG')}</div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <div class="text-xs font-mono font-bold text-slate-800">${c.phone || 'غير مسجل'}</div>
                        ${c.whatsappPhone ? `
                          <div class="text-[10px] text-emerald-600 font-bold flex items-center gap-1 mt-0.5">
                            <i class="fa-brands fa-whatsapp"></i> ${c.whatsappPhone}
                          </div>
                        ` : ''}
                      </td>
                      <td class="text-xs font-mono text-slate-600">${c.email}</td>
                      <td class="text-xs font-bold text-slate-700">${c.ordersCount || 0} طلبات</td>
                      <td class="text-xs font-extrabold text-emerald-700">${(c.totalSpent || 0).toLocaleString('ar-EG')} ج.م</td>
                      <td>
                        <span class="status-pill ${c.isLocked ? 'status-locked' : 'status-active'}">
                          ${c.isLocked ? 'مقفل 🔒' : 'نشط ✅'}
                        </span>
                      </td>
                      <td>
                        <div class="flex items-center gap-1.5">
                          <!-- View Full Details & Addresses & Orders -->
                          <button onclick="CustomersAdmin.viewCustomerProfile('${c.id}')" class="btn-icon-action" title="تفاصيل الحساب والعناوين">
                            <i class="fa-solid fa-eye text-blue-600"></i>
                          </button>

                          <!-- Edit Customer Data -->
                          <button onclick="CustomersAdmin.openEditModal('${c.id}')" class="btn-icon-action" title="تعديل بيانات الحساب وكلمة المرور">
                            <i class="fa-solid fa-user-pen text-amber-600"></i>
                          </button>

                          <!-- Toggle Lock/Unlock -->
                          <button onclick="CustomersAdmin.toggleLock('${c.id}')" class="btn-icon-action ${c.isLocked ? '' : 'danger'}" title="${c.isLocked ? 'إلغاء القفل وتفعيل الحساب' : 'قفل الحساب'}">
                            <i class="fa-solid ${c.isLocked ? 'fa-lock-open text-emerald-600' : 'fa-lock text-red-600'}"></i>
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

    AdminLayout.render('customers', html);
  },

  toggleSelectAll(checked) {
    if (checked) {
      this.customers.forEach(c => this.selectedIds.add(c.id));
    } else {
      this.selectedIds.clear();
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
    const btn = document.getElementById('customers-bulk-delete-btn');
    const countSpan = document.getElementById('customers-selected-count');
    if (btn) {
      if (this.selectedIds.size > 0) {
        btn.classList.remove('hidden');
        if (countSpan) countSpan.textContent = this.selectedIds.size;
      } else {
        btn.classList.add('hidden');
      }
    }
    const selectAllCheck = document.getElementById('customers-select-all');
    if (selectAllCheck) {
      selectAllCheck.checked = this.customers.length > 0 && this.customers.every(c => this.selectedIds.has(c.id));
    }
    document.querySelectorAll('.customer-row-check').forEach(chk => {
      chk.checked = this.selectedIds.has(chk.value);
    });
  },

  async bulkDelete() {
    const count = this.selectedIds.size;
    if (count === 0) return;
    App.confirm(`هل أنت متأكد من رغبتك في حذف ${count} عميل محدد نهائياً من قاعدة البيانات؟`, async () => {
      try {
        const res = await API.post('/admin/customers/bulk-delete', { customerIds: Array.from(this.selectedIds) });
        if (res.success) {
          App.showToast(`تم حذف ${res.deletedCount || count} عميل بنجاح`, 'success');
          this.selectedIds.clear();
          this.render();
        }
      } catch (err) {
        App.showToast(err.message, 'error');
      }
    });
  },

  handleSearch(val) {
    this.currentSearch = val;
    this.render();
  },

  filterStatus(status) {
    this.currentStatus = status;
    this.render();
  },

  toggleLock(id) {
    const c = this.customers.find(item => item.id === id);
    if (!c) return;
    const actionText = c.isLocked ? 'فتح وتفعيل' : 'قفل وتعطيل';
    App.confirm(`هل أنت متأكد من ${actionText} حساب العميل "${c.name}"؟`, async () => {
      try {
        const res = await API.put(`/admin/customers/${id}/toggle-lock`);
        if (res.success) {
          App.showToast(res.message, 'success');
          this.render();
        }
      } catch (err) {
        App.showToast(err.message, 'error');
      }
    });
  },

  async viewCustomerProfile(id) {
    try {
      const res = await API.get(`/admin/customers/${id}`);
      if (!res.success) return;
      const { customer, orders } = res;
      const custId = customer.customerId || `CUST-${(customer.id || '').substring(0, 5)}`;
      const addresses = customer.addresses || [];

      const modalBody = `
        <div class="text-right text-xs">
          <!-- Main Info Card -->
          <div class="bg-slate-50 p-4 rounded-2xl border border-slate-200 mb-4">
            <div class="flex justify-between items-center mb-3">
              <div class="flex items-center gap-3">
                <img src="${customer.avatar || 'https://api.dicebear.com/7.x/initials/svg?seed=' + encodeURIComponent(customer.name)}" class="w-12 h-12 rounded-full border border-slate-300" />
                <div>
                  <div class="font-extrabold text-sm text-slate-800">${customer.name}</div>
                  <div class="text-xs text-slate-500 font-mono">${customer.email}</div>
                </div>
              </div>
              <div class="text-left">
                <span class="font-mono text-xs font-extrabold text-emerald-800 bg-emerald-100 px-2.5 py-1 rounded-md block mb-1">
                  ${custId}
                </span>
                <span class="status-pill ${customer.isLocked ? 'status-locked' : 'status-active'}">
                  ${customer.isLocked ? 'حساب مقفل 🔒' : 'حساب نشط ✅'}
                </span>
              </div>
            </div>

            <div class="grid grid-cols-2 md:grid-cols-3 gap-2 pt-3 border-t border-slate-200 text-slate-600">
              <div>
                <span class="text-slate-400 block text-[10px]">رقم الهاتف الرئيسي:</span>
                <span class="font-mono font-bold text-slate-800">${customer.phone || 'غير مسجل'}</span>
              </div>
              <div>
                <span class="text-slate-400 block text-[10px]">الهاتف الإضافي:</span>
                <span class="font-mono font-bold text-slate-800">${customer.secondaryPhone || 'لا يوجد'}</span>
              </div>
              <div>
                <span class="text-slate-400 block text-[10px]">رقم الواتساب:</span>
                <span class="font-mono font-bold text-emerald-700">${customer.whatsappPhone || 'لا يوجد'}</span>
              </div>
            </div>
          </div>

          <!-- Saved Addresses -->
          <div class="mb-4">
            <h4 class="font-extrabold text-slate-800 mb-2 flex items-center gap-1.5">
              <i class="fa-solid fa-location-dot text-emerald-600"></i>
              <span>العناوين المسجلة (${addresses.length}):</span>
            </h4>
            ${addresses.length === 0 ? `
              <div class="bg-slate-50 p-3 rounded-xl text-center text-slate-400">لا توجد عناوين مسجلة لهذا العميل حتى الآن</div>
            ` : `
              <div class="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-48 overflow-y-auto">
                ${addresses.map(addr => `
                  <div class="bg-white p-2.5 rounded-xl border border-slate-200 ${addr.isDefault ? 'border-emerald-500 bg-emerald-50/20' : ''}">
                    <div class="flex items-center justify-between mb-1">
                      <span class="font-bold text-slate-800">${addr.title || 'عنوان'}</span>
                      ${addr.isDefault ? '<span class="text-[9px] bg-emerald-600 text-white font-bold px-1.5 py-0.5 rounded">الافتراضي</span>' : ''}
                    </div>
                    <div class="text-slate-600 text-[11px]">${addr.governorate || ''} - ${addr.city || ''}</div>
                    <div class="text-slate-500 text-[10px] truncate">${addr.details || ''}</div>
                  </div>
                `).join('')}
              </div>
            `}
          </div>

          <!-- Order History -->
          <div>
            <h4 class="font-extrabold text-slate-800 mb-2 flex items-center gap-1.5">
              <i class="fa-solid fa-box-open text-emerald-600"></i>
              <span>سجل الطلبات (${orders.length}):</span>
            </h4>
            ${orders.length === 0 ? `
              <div class="bg-slate-50 p-3 rounded-xl text-center text-slate-400">لا توجد طلبات سابقة لهذا العميل</div>
            ` : `
              <div class="flex flex-col gap-2 max-h-48 overflow-y-auto">
                ${orders.map(o => `
                  <div class="bg-white p-2.5 rounded-xl border border-slate-200 flex justify-between items-center">
                    <div>
                      <span class="font-bold text-emerald-700">#${o.orderNumber}</span>
                      <span class="text-slate-400 mr-2">${new Date(o.createdAt).toLocaleDateString('ar-EG')}</span>
                      <div class="text-[10px] text-slate-500">${o.items?.length || 0} منتجات • المحافظة: ${o.shippingAddress?.governorate || '-'}</div>
                    </div>
                    <div class="text-left">
                      <span class="status-pill status-${o.status} mb-1">${o.status}</span>
                      <div class="font-extrabold text-slate-800">${Number(o.grandTotal || 0).toLocaleString('ar-EG')} ج.م</div>
                    </div>
                  </div>
                `).join('')}
              </div>
            `}
          </div>
        </div>
      `;

      App.openModal(`تفاصيل حساب العميل: ${customer.name}`, modalBody);
    } catch (err) {
      App.showToast('فشل جلب تفاصيل العميل', 'error');
    }
  },

  async openEditModal(id) {
    try {
      const res = await API.get(`/admin/customers/${id}`);
      if (!res.success) return;
      const { customer } = res;
      const custId = customer.customerId || `CUST-${(customer.id || '').substring(0, 5)}`;

      const modalBody = `
        <form onsubmit="CustomersAdmin.submitCustomerEdit(event, '${id}')" class="text-right">
          <div class="bg-emerald-50 p-2.5 rounded-xl mb-3 border border-emerald-200 flex items-center justify-between text-xs">
            <span class="font-bold text-emerald-800">معرف العميل (ID):</span>
            <span class="font-mono font-extrabold text-emerald-900">${custId}</span>
          </div>

          <div class="form-group mb-3">
            <label class="form-label">الاسم الكامل *</label>
            <input type="text" id="edit-cust-name" class="form-control" value="${customer.name || ''}" required />
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
            <div class="form-group">
              <label class="form-label">البريد الإلكتروني *</label>
              <input type="email" id="edit-cust-email" class="form-control font-mono text-xs" value="${customer.email || ''}" required />
            </div>

            <div class="form-group">
              <label class="form-label">رقم الهاتف الأساسي *</label>
              <input type="text" id="edit-cust-phone" class="form-control font-mono text-xs" value="${customer.phone || ''}" required />
            </div>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
            <div class="form-group">
              <label class="form-label">رقم هاتف إضافي (اختياري)</label>
              <input type="text" id="edit-cust-sec-phone" class="form-control font-mono text-xs" value="${customer.secondaryPhone || ''}" placeholder="01xxxxxxxxx" />
            </div>

            <div class="form-group">
              <label class="form-label">رقم الواتساب (اختياري)</label>
              <input type="text" id="edit-cust-wa-phone" class="form-control font-mono text-xs" value="${customer.whatsappPhone || ''}" placeholder="01xxxxxxxxx" />
            </div>
          </div>

          <div class="form-group mb-3 bg-amber-50 p-3 rounded-xl border border-amber-200">
            <label class="form-label text-amber-900 font-bold mb-1">
              <i class="fa-solid fa-key ml-1"></i> تغيير كلمة المرور للعميل (اختياري)
            </label>
            <input type="password" id="edit-cust-pwd" class="form-control text-xs" placeholder="اتركها فارغة إذا كنت لا تريد التغيير (6 أحرف فأكثر)" />
          </div>

          <div class="form-group mb-4">
            <label class="flex items-center gap-2 text-xs font-bold cursor-pointer">
              <input type="checkbox" id="edit-cust-locked" ${customer.isLocked ? 'checked' : ''} class="accent-red-600 w-4 h-4" />
              <span class="text-red-700">قفل الحساب وتعطيل تسجيل دخوله</span>
            </label>
          </div>

          <button type="submit" class="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3.5 rounded-xl text-sm shadow-md">
            حفظ تعديلات الحساب
          </button>
        </form>
      `;

      App.openModal(`تعديل بيانات العميل: ${customer.name}`, modalBody);
    } catch (err) {
      App.showToast('فشل فتح نموذج تعديل العميل', 'error');
    }
  },

  async submitCustomerEdit(e, id) {
    e.preventDefault();
    const name = document.getElementById('edit-cust-name').value.trim();
    const email = document.getElementById('edit-cust-email').value.trim();
    const phone = document.getElementById('edit-cust-phone').value.trim();
    const secondaryPhone = document.getElementById('edit-cust-sec-phone').value.trim();
    const whatsappPhone = document.getElementById('edit-cust-wa-phone').value.trim();
    const password = document.getElementById('edit-cust-pwd').value;
    const isLocked = document.getElementById('edit-cust-locked').checked;

    const payload = { name, email, phone, secondaryPhone, whatsappPhone, isLocked };
    if (password && password.trim().length >= 6) {
      payload.password = password.trim();
    }

    try {
      const res = await API.put(`/admin/customers/${id}`, payload);
      if (res.success) {
        App.closeModal();
        App.showToast('تم حفظ تعديلات حساب العميل بنجاح', 'success');
        this.render();
      }
    } catch (err) {
      App.showToast(err.message || 'فشل حفظ التعديلات', 'error');
    }
  }
};
