/**
 * Suki Store Admin Returns & Replacement Management
 * Features:
 * - Table of all replacement requests with defect details and photos
 * - 1-Click status transitions across the 5 stages
 * - Instant notifications to customer
 * - Direct WhatsApp contact button
 */

const ReturnsAdmin = {
  returns: [],
  currentStatusFilter: 'all',
  searchQuery: '',

  async render() {
    AdminLayout.render('returns', `
      <div class="py-12 text-center text-slate-400">
        <i class="fa-solid fa-spinner fa-spin text-3xl mb-3 text-emerald-600"></i>
        <div class="font-bold">جاري تحميل طلبات الاستبدال والضمان...</div>
      </div>
    `);

    try {
      const res = await API.get('/returns/admin/all');
      this.returns = res.returns || [];
      this.renderTable();
    } catch (err) {
      console.error('Returns admin error:', err);
      AdminLayout.render('returns', `
        <div class="p-8 text-center text-red-500 font-bold">
          حدث خطأ أثناء تحميل طلبات الاستبدال.
        </div>
      `);
    }
  },

  renderTable() {
    const STAGES = [
      { key: 'pending_review', label: 'تحت المراجعة', color: 'bg-amber-100 text-amber-900 border-amber-300' },
      { key: 'accepted', label: 'مقبول', color: 'bg-blue-100 text-blue-900 border-blue-300' },
      { key: 'courier_dispatched', label: 'تم إرسال المندوب', color: 'bg-purple-100 text-purple-900 border-purple-300' },
      { key: 'received', label: 'تم الاستلام', color: 'bg-indigo-100 text-indigo-900 border-indigo-300' },
      { key: 'replaced', label: 'تم الاستبدال', color: 'bg-emerald-100 text-emerald-900 border-emerald-300' },
      { key: 'rejected', label: 'مرفوض', color: 'bg-red-100 text-red-900 border-red-300' }
    ];

    let filtered = this.returns;
    if (this.currentStatusFilter !== 'all') {
      filtered = filtered.filter(r => r.status === this.currentStatusFilter);
    }
    if (this.searchQuery) {
      const q = this.searchQuery.toLowerCase();
      filtered = filtered.filter(r => 
        (r.returnNumber || '').toLowerCase().includes(q) ||
        (r.orderNumber || '').toLowerCase().includes(q) ||
        (r.userName || '').toLowerCase().includes(q) ||
        (r.phone || '').includes(q) ||
        (r.productTitle || '').toLowerCase().includes(q)
      );
    }

    // Counts per status
    const counts = {
      all: this.returns.length,
      pending_review: this.returns.filter(r => r.status === 'pending_review').length,
      accepted: this.returns.filter(r => r.status === 'accepted').length,
      courier_dispatched: this.returns.filter(r => r.status === 'courier_dispatched').length,
      received: this.returns.filter(r => r.status === 'received').length,
      replaced: this.returns.filter(r => r.status === 'replaced').length,
      rejected: this.returns.filter(r => r.status === 'rejected').length
    };

    const html = `
      <div>
        <!-- Page Header -->
        <div class="flex items-center justify-between mb-6 flex-wrap gap-4">
          <div>
            <h1 class="text-2xl font-black text-slate-900 flex items-center gap-2.5">
              <i class="fa-solid fa-arrow-rotate-left text-amber-500"></i>
              <span>إدارة طلبات الاستبدال والضمان (عيب صناعة)</span>
            </h1>
            <p class="text-xs text-slate-500 mt-1">متابعة وفحص وتغيير حالة طلبات الاستبدال بنقرة واحدة مع إرسال إشعار فوري للعميل</p>
          </div>
          <button onclick="ReturnsAdmin.render()" class="bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold px-3.5 py-2 rounded-xl text-xs flex items-center gap-1.5 shadow-sm">
            <i class="fa-solid fa-rotate"></i>
            <span>تحديث البيانات</span>
          </button>
        </div>

        <!-- Filter Status Tabs -->
        <div class="flex items-center gap-2 overflow-x-auto pb-2 mb-6 scrollbar-thin">
          <button 
            onclick="ReturnsAdmin.filterByStatus('all')" 
            class="px-4 py-2 rounded-xl text-xs font-black transition flex-shrink-0 flex items-center gap-1.5 ${this.currentStatusFilter === 'all' ? 'bg-slate-900 text-white shadow-sm' : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'}">
            <span>الكل</span>
            <span class="text-[10px] bg-slate-700 text-white px-1.5 py-0.2 rounded-full">${counts.all}</span>
          </button>

          ${STAGES.map(s => `
            <button 
              onclick="ReturnsAdmin.filterByStatus('${s.key}')" 
              class="px-4 py-2 rounded-xl text-xs font-black transition flex-shrink-0 flex items-center gap-1.5 ${this.currentStatusFilter === s.key ? 'bg-emerald-600 text-white shadow-sm' : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'}">
              <span>${s.label}</span>
              <span class="text-[10px] ${this.currentStatusFilter === s.key ? 'bg-emerald-800 text-white' : 'bg-slate-100 text-slate-700'} px-1.5 py-0.2 rounded-full">${counts[s.key] || 0}</span>
            </button>
          `).join('')}
        </div>

        <!-- Search Toolbar -->
        <div class="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm mb-6 flex items-center justify-between gap-4">
          <div class="relative flex-1 max-w-md">
            <i class="fa-solid fa-magnifying-glass absolute right-3.5 top-3.5 text-slate-400 text-xs"></i>
            <input 
              type="text" 
              value="${this.searchQuery}"
              placeholder="ابحث برقم الطلب، اسم العميل، الهاتف، أو اسم المنتج..."
              oninput="ReturnsAdmin.handleSearch(this.value)"
              class="w-full pr-9 pl-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:border-emerald-500"
            />
          </div>
          <div class="text-xs font-bold text-slate-500">
            إجمالي المعروض: <strong class="text-emerald-700 font-extrabold">${filtered.length}</strong> طلب
          </div>
        </div>

        <!-- Returns Table -->
        <div class="admin-card">
          <div class="admin-table-container">
            <table class="admin-table">
              <thead>
                <tr>
                  <th>رقم الطلب</th>
                  <th>العميل والتواصل</th>
                  <th>المنتج المطلوب استبداله</th>
                  <th>وصف العيب والصورة</th>
                  <th>الحالة الحالية</th>
                  <th>تغيير الحالة بنقرة واحدة</th>
                  <th>التاريخ</th>
                </tr>
              </thead>
              <tbody>
                ${filtered.length === 0 ? `
                  <tr>
                    <td colspan="7" class="text-center py-12 text-slate-400">
                      <i class="fa-solid fa-shield-halved text-3xl mb-2 opacity-50"></i>
                      <div>لا توجد طلبات استبدال مطابقة</div>
                    </td>
                  </tr>
                ` : filtered.map(r => {
                  const stageObj = STAGES.find(s => s.key === r.status) || STAGES[0];
                  const cleanPhone = (r.whatsappPhone || r.phone || '').replace(/[^\d+]/g, '');
                  const waLink = `https://wa.me/${cleanPhone.startsWith('0') ? '2' + cleanPhone : cleanPhone}`;

                  return `
                    <tr>
                      <td>
                        <div class="font-mono font-black text-xs text-slate-900">#${r.returnNumber}</div>
                        <div class="text-[10px] text-slate-400 mt-0.5">طلب أصلي: #${r.orderNumber}</div>
                      </td>
                      <td>
                        <div class="font-extrabold text-xs text-slate-900">${r.userName || 'عميل'}</div>
                        <div class="text-[11px] text-slate-500 mt-0.5 flex items-center gap-1">
                          <i class="fa-solid fa-phone text-slate-400 text-[10px]"></i>
                          <span>${r.phone}</span>
                        </div>
                        <a href="${waLink}" target="_blank" class="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 hover:underline mt-1 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                          <i class="fa-brands fa-whatsapp text-emerald-600"></i>
                          <span>محادثة واتساب مباشرة</span>
                        </a>
                      </td>
                      <td>
                        <div class="flex items-center gap-2.5">
                          <img src="${r.productImage || '/images/no-image.svg'}" class="w-11 h-11 rounded-lg object-cover border border-slate-200 flex-shrink-0" />
                          <div class="min-w-0 max-w-xs">
                            <div class="font-extrabold text-xs text-slate-800 truncate" title="${r.productTitle}">${r.productTitle}</div>
                            <div class="text-[10px] text-emerald-700 font-bold">${r.productPrice} ج.م</div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <div class="text-xs text-slate-700 font-semibold max-w-xs line-clamp-2" title="${r.description}">
                          ${r.description}
                        </div>
                        ${r.imageUrl ? `
                          <a href="${r.imageUrl}" target="_blank" class="inline-flex items-center gap-1 text-[10px] font-bold text-blue-600 hover:underline mt-1">
                            <i class="fa-solid fa-image"></i> معاينة صورة العيب
                          </a>
                        ` : '<span class="text-[10px] text-slate-400 italic">بدون صورة مرفقة</span>'}
                      </td>
                      <td>
                        <span class="inline-flex items-center gap-1 text-[11px] font-extrabold px-3 py-1 rounded-full border ${stageObj.color}">
                          <i class="fa-solid fa-circle-dot text-[8px]"></i>
                          <span>${stageObj.label}</span>
                        </span>
                      </td>
                      <td>
                        <!-- 1-Click Status Advancement Dropdown / Buttons -->
                        <div class="flex items-center gap-1 flex-wrap">
                          <select 
                            onchange="ReturnsAdmin.quickUpdateStatus('${r.id}', this.value)"
                            class="form-control text-xs font-bold py-1 px-2 rounded-lg bg-slate-50 border border-slate-300">
                            ${STAGES.map(s => `
                              <option value="${s.key}" ${r.status === s.key ? 'selected' : ''}>
                                ${s.label}
                              </option>
                            `).join('')}
                          </select>
                          <button onclick="ReturnsAdmin.openDetailsModal('${r.id}')" class="btn-icon-action" title="تفاصيل كاملة وملاحظات المندوب">
                            <i class="fa-solid fa-eye text-slate-600"></i>
                          </button>
                        </div>
                      </td>
                      <td class="text-[11px] text-slate-400">
                        ${new Date(r.createdAt).toLocaleDateString('ar-EG')}
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

    AdminLayout.render('returns', html);
  },

  filterByStatus(status) {
    this.currentStatusFilter = status;
    this.renderTable();
  },

  handleSearch(val) {
    this.searchQuery = val.trim();
    this.renderTable();
  },

  async quickUpdateStatus(returnId, newStatus) {
    const r = this.returns.find(item => item.id === returnId);
    const payload = { status: newStatus };
    // Refusing needs a reason the customer will see
    if (newStatus === 'rejected') {
      const reason = prompt('سبب رفض طلب الاستبدال (سيظهر للعميل):', '');
      if (!reason || reason.trim().length < 3) { App.showToast('لازم تكتب سبب الرفض', 'warning'); this.renderTable(); return; }
      payload.rejectionReason = reason.trim();
    }
    // The exchange trip is paid by the store: ask its cost once when the exchange is done
    if (newStatus === 'replaced' && !(r && Number(r.exchangeShippingCost) > 0)) {
      const cost = prompt('تكلفة شحن الاستبدال (رحلة المندوب) على المتجر بالجنيه — العميل لا يدفع شيئاً:', '0');
      if (cost === null) { this.renderTable(); return; }
      payload.exchangeShippingCost = Number(cost) || 0;
    }
    try {
      App.showToast('جاري تحديث حالة الاستبدال وإشعار العميل...', 'info');
      const res = await API.put(`/returns/admin/${returnId}/status`, payload);
      if (res.success) {
        App.showToast(res.message || 'تم تحديث الحالة بنجاح 🎉', 'success');
        this.render();
      }
    } catch (err) {
      App.showToast(err.message || 'فشل تحديث الحالة', 'error');
    }
  },

  openDetailsModal(returnId) {
    const r = this.returns.find(item => item.id === returnId);
    if (!r) return;

    const modalBody = `
      <div class="text-right text-xs">
        <div class="bg-slate-50 p-4 rounded-xl border border-slate-200 mb-4">
          <div class="flex items-center justify-between mb-2">
            <span class="font-bold text-slate-400">طلب استبدال:</span>
            <span class="font-mono font-black text-emerald-700 text-sm">#${r.returnNumber}</span>
          </div>
          <div class="flex items-center justify-between mb-2">
            <span class="font-bold text-slate-400">الطلب الأصلي:</span>
            <span class="font-mono font-bold text-slate-800">#${r.orderNumber}</span>
          </div>
          <div class="flex items-center justify-between">
            <span class="font-bold text-slate-400">العميل:</span>
            <span class="font-bold text-slate-900">${r.userName} (${r.phone})</span>
          </div>
        </div>

        <div class="mb-4">
          <label class="font-bold text-slate-700 block mb-1">وصف العيب المصنعي:</label>
          <div class="p-3 bg-white border border-slate-200 rounded-xl leading-relaxed whitespace-pre-line text-slate-800">
            ${r.description}
          </div>
        </div>

        ${r.imageUrl ? `
          <div class="mb-4">
            <label class="font-bold text-slate-700 block mb-1">الصورة المرفقة:</label>
            <a href="${r.imageUrl}" target="_blank">
              <img src="${r.imageUrl}" class="w-40 h-40 rounded-xl object-cover border border-slate-300 shadow-sm" />
            </a>
          </div>
        ` : ''}

        <form onsubmit="ReturnsAdmin.saveAdminDetails(event, '${r.id}')">
          <div class="form-group mb-3">
            <label class="form-label font-bold text-xs">ملاحظات الإدارة والفحص الفني</label>
            <textarea id="admin-return-notes" rows="2" class="form-control text-xs" placeholder="اكتب ملاحظات الفحص أو سبب اتخاذ القرار...">${r.adminNotes || ''}</textarea>
          </div>

          <div class="form-group mb-3">
            <label class="form-label font-bold text-xs">تكلفة شحن الاستبدال على المتجر (ج.م)</label>
            <input type="number" id="admin-return-shipcost" min="0" step="1" class="form-control text-xs" value="${r.exchangeShippingCost || ''}" placeholder="مثال: 45" />
            <span class="text-[10px] text-slate-400">الاستبدال مجاني للعميل. المبلغ ده بيتسجل مصروف على المتجر في المحاسبة لما الحالة تبقى "تم الاستبدال".</span>
          </div>
          ${r.status === 'rejected' && r.rejectionReason ? `<div class="mb-3 p-2.5 rounded-lg bg-red-50 border border-red-200 text-red-800 font-bold">سبب الرفض: ${r.rejectionReason}</div>` : ''}

          <div class="form-group mb-4">
            <label class="form-label font-bold text-xs">بيانات مندوب التوصيل للاستبدال</label>
            <input type="text" id="admin-return-courier" class="form-control text-xs" placeholder="مثال: كابتن محمود - 01012345678 - شركة أرامكس" value="${r.courierDetails || ''}" />
          </div>

          <button type="submit" class="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold py-3 rounded-xl text-xs shadow-md transition">
            حفظ الملاحظات وبيانات المندوب
          </button>
        </form>
      </div>
    `;

    App.openModal(`تفاصيل طلب الاستبدال #${r.returnNumber}`, modalBody);
  },

  async saveAdminDetails(e, returnId) {
    e.preventDefault();
    const adminNotes = document.getElementById('admin-return-notes').value.trim();
    const courierDetails = document.getElementById('admin-return-courier').value.trim();
    const shipCostRaw = document.getElementById('admin-return-shipcost')?.value;

    try {
      App.showToast('جاري حفظ البيانات...', 'info');
      const r = this.returns.find(item => item.id === returnId);
      const res = await API.put(`/returns/admin/${returnId}/status`, {
        status: r ? r.status : 'pending_review',
        adminNotes,
        courierDetails,
        ...(shipCostRaw !== undefined && shipCostRaw !== '' ? { exchangeShippingCost: Number(shipCostRaw) } : {})
      });

      if (res.success) {
        App.closeModal();
        App.showToast('تم حفظ الملاحظات بنجاح', 'success');
        this.render();
      }
    } catch (err) {
      App.showToast(err.message, 'error');
    }
  }
};
