/**
 * Suki Store Admin Orders Management
 */

const OrdersAdmin = {
  orders: [],
  currentStatus: 'all',
  currentSearch: '',
  fromDate: '',
  toDate: '',
  currentSource: 'all',
  selected: new Set(),

  esc(s) {
    return String(s === undefined || s === null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  },

  async render() {
    AdminLayout.render('orders', `
      <div class="py-12 text-center text-slate-400">
        <i class="fa-solid fa-spinner fa-spin text-3xl mb-3 text-emerald-600"></i>
        <div>جاري جلب قائمة الطلبات...</div>
      </div>
    `);

    try {
      const params = {};
      if (this.currentStatus !== 'all') params.status = this.currentStatus;
      if (this.currentSearch.trim()) params.search = this.currentSearch;
      if (this.fromDate) params.from = this.fromDate;
      if (this.toDate) params.to = this.toDate;
      if (this.currentSource !== 'all') params.source = this.currentSource;

      const res = await API.get('/orders', params);
      this.orders = res.orders || [];
      // Keep only selections that are still visible
      const visible = new Set(this.orders.map(o => o.id));
      this.selected = new Set([...this.selected].filter(id => visible.has(id)));
      this.renderTable();
    } catch (err) {
      console.error('Orders admin render error:', err);
    }
  },

  renderTable() {
    const isMerchant = State.user && State.user.role === 'merchant';
    const html = `
      <div>
        <div class="flex items-center justify-between mb-6 flex-wrap gap-4">
          <div>
            <h1 class="text-2xl font-extrabold text-slate-900">
              ${isMerchant ? `طلبات منتجاتي (${State.user.merchantCode || State.user.name})` : 'إدارة ومتابعة الطلبات'}
            </h1>
            <p class="text-xs text-slate-500 mt-1">
              ${isMerchant ? 'متابعة كافة طلبات الشراء التي تتضمن منتجاتك وحالة تجهيزها وتوصيلها' : 'تحديث حالات الشحن، مراجعة الفواتير، وإشعار العملاء تلقائياً'}
            </p>
          </div>
          ${!isMerchant ? `
            <div class="flex items-center gap-2 flex-wrap">
              <button onclick="OrdersAdmin.openManualOrderModal()" class="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-4 py-2.5 rounded-xl text-xs flex items-center gap-2">
                <i class="fa-solid fa-plus"></i> طلب يدوي (واتساب/تليفون)
              </button>
              <button onclick="OrdersAdmin.exportExcel()" class="bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 font-bold px-4 py-2.5 rounded-xl text-xs flex items-center gap-2">
                <i class="fa-solid fa-file-excel text-green-600"></i> تصدير Excel
              </button>
            </div>
          ` : ''}
        </div>

        <div class="admin-card">
          <!-- Filters Bar -->
          <div class="admin-card-header">
            <div class="flex items-center gap-3 flex-1 max-w-md">
              <input 
                type="text" 
                class="form-control text-xs" 
                placeholder="ابحث برقم الطلب، اسم العميل، أو الجوال..." 
                value="${this.currentSearch}" 
                oninput="OrdersAdmin.handleSearch(this.value)"
              />
            </div>

            <div class="flex items-center gap-3">
              <select class="form-control text-xs font-bold" onchange="OrdersAdmin.handleStatusFilter(this.value)">
                <option value="all" ${this.currentStatus === 'all' ? 'selected' : ''}>جميع الحالات</option>
                <option value="pending" ${this.currentStatus === 'pending' ? 'selected' : ''}>قيد المراجعة</option>
                <option value="processing" ${this.currentStatus === 'processing' ? 'selected' : ''}>قيد التجهيز</option>
                <option value="shipped" ${this.currentStatus === 'shipped' ? 'selected' : ''}>قيد الشحن والتوصيل</option>
                <option value="delivered" ${this.currentStatus === 'delivered' ? 'selected' : ''}>تم التسليم بنجاح</option>
                <option value="cancelled" ${this.currentStatus === 'cancelled' ? 'selected' : ''}>طلبات ملغية</option>
              </select>
              <span class="text-xs font-bold text-slate-600">(${this.orders.length} طلب)</span>
            </div>
          </div>

          <!-- Date / source filters -->
          <div class="flex items-center gap-2 flex-wrap px-4 pb-3 text-xs">
            <span class="font-bold text-slate-600"><i class="fa-regular fa-calendar"></i> من</span>
            <input type="date" class="form-control text-xs w-auto" value="${this.fromDate}" onchange="OrdersAdmin.setDate('from', this.value)" />
            <span class="font-bold text-slate-600">إلى</span>
            <input type="date" class="form-control text-xs w-auto" value="${this.toDate}" onchange="OrdersAdmin.setDate('to', this.value)" />
            <button onclick="OrdersAdmin.quickRange('today')" class="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 font-bold">النهارده</button>
            <button onclick="OrdersAdmin.quickRange('7')" class="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 font-bold">آخر 7 أيام</button>
            <button onclick="OrdersAdmin.quickRange('month')" class="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 font-bold">الشهر ده</button>
            ${this.fromDate || this.toDate ? `<button onclick="OrdersAdmin.quickRange('clear')" class="px-2.5 py-1.5 rounded-lg text-red-600 hover:bg-red-50 font-bold">مسح التاريخ</button>` : ''}
            ${!isMerchant ? `
              <select class="form-control text-xs w-auto font-bold" onchange="OrdersAdmin.currentSource=this.value; OrdersAdmin.render()">
                <option value="all" ${this.currentSource === 'all' ? 'selected' : ''}>كل المصادر</option>
                <option value="online" ${this.currentSource === 'online' ? 'selected' : ''}>من الموقع</option>
                <option value="manual" ${this.currentSource === 'manual' ? 'selected' : ''}>طلبات يدوية</option>
              </select>
            ` : ''}
          </div>

          ${!isMerchant && this.selected.size > 0 ? `
            <div class="mx-4 mb-3 p-3 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center gap-2 flex-wrap text-xs">
              <span class="font-black text-emerald-800">محدد ${this.selected.size} طلب</span>
              <select id="bulk-status-select" class="form-control text-xs w-auto font-bold">
                <option value="processing">قيد التجهيز</option>
                <option value="shipped">قيد الشحن</option>
                <option value="delivered">تم التسليم</option>
                <option value="cancelled">ملغي</option>
              </select>
              <input id="bulk-note" class="form-control text-xs w-auto" placeholder="ملاحظة للعميل (اختياري)" />
              <button onclick="OrdersAdmin.applyBulkStatus()" class="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-3 py-2 rounded-lg">تطبيق على المحدد</button>
              <button onclick="OrdersAdmin.selected.clear(); OrdersAdmin.renderTable()" class="text-slate-500 font-bold px-2">إلغاء التحديد</button>
            </div>
          ` : ''}

          <!-- Table -->
          <div class="admin-table-container">
            <table class="admin-table">
              <thead>
                <tr>
                  ${!isMerchant ? `<th class="w-8"><input type="checkbox" title="تحديد الكل" ${this.orders.length && this.orders.every(o => this.selected.has(o.id)) ? 'checked' : ''} onchange="OrdersAdmin.toggleAll(this.checked)" class="accent-emerald-600 w-4 h-4" /></th>` : ''}
                  <th>رقم الطلب</th>
                  <th>العميل</th>
                  <th>الجهة (التاجر / المستثمر)</th>
                  <th>تاريخ الطلب</th>
                  <th>عدد المنتجات</th>
                  <th>الإجمالي</th>
                  <th>طريقة الدفع</th>
                  <th>حالة الطلب</th>
                  <th>الإجراءات</th>
                </tr>
              </thead>
              <tbody>
                ${this.orders.length === 0 ? `
                  <tr><td colspan="10" class="text-center py-8 text-slate-400">لا توجد طلبات تطابق الفلتر</td></tr>
                ` : this.orders.map(o => `
                  <tr>
                    ${!isMerchant ? `<td><input type="checkbox" ${this.selected.has(o.id) ? 'checked' : ''} onchange="OrdersAdmin.toggleOne('${o.id}', this.checked)" class="accent-emerald-600 w-4 h-4" /></td>` : ''}
                    <td>
                      <span class="font-extrabold text-emerald-700 text-xs font-mono">#${o.orderNumber}</span>
                      ${o.isManual ? `<div class="text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 mt-1 w-fit">يدوي • ${this.esc(o.orderSourceLabel || '')}</div>` : ''}
                      ${o.cancelledByCustomer ? `<div class="text-[10px] font-bold text-red-600 mt-1">ألغاه العميل</div>` : ''}
                    </td>
                    <td>
                      <div class="font-bold text-slate-800 text-xs">${this.esc(o.customerName)}</div>
                      <div class="text-[11px] text-slate-400 font-mono">${this.esc(o.customerPhone)}</div>
                    </td>
                    <td>
                      <div class="flex flex-col gap-1 items-start">
                        ${(!o.owners || o.owners.length === 0) ? `
                          <span class="text-[11px] text-slate-400 font-bold bg-slate-50 px-2 py-0.5 rounded border border-slate-200">
                            إدارة المتجر
                          </span>
                        ` : o.owners.map(owner => `
                          <button 
                            type="button" 
                            onclick="OrdersAdmin.showOwnerContactModal('${owner.type}', '${owner.code}')" 
                            class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold transition border cursor-pointer ${owner.type === 'investor' ? 'bg-blue-50 text-blue-800 border-blue-300 hover:bg-blue-100' : 'bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100'}"
                            title="اضغط لعرض بيانات ${owner.type === 'investor' ? 'المستثمر' : 'التاجر'} والتواصل معه"
                          >
                            <i class="fa-solid ${owner.type === 'investor' ? 'fa-handshake text-blue-600' : 'fa-store text-emerald-600'}"></i>
                            <span>${owner.type === 'investor' ? 'مستثمر:' : 'تاجر:'} ${owner.name}</span>
                            <span class="text-[10px] opacity-75 font-mono">(${owner.code})</span>
                          </button>
                        `).join('')}
                      </div>
                    </td>
                    <td class="text-xs text-slate-500">
                      ${new Date(o.createdAt).toLocaleDateString('ar-EG', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td class="text-xs font-bold text-slate-700">${o.items.length} منتجات</td>
                    <td class="font-extrabold text-slate-900 text-xs">${o.merchantTotal !== undefined ? o.merchantTotal : o.grandTotal} ج.م</td>
                    <td class="text-xs text-slate-600">
                      ${o.paymentMethod === 'cod' ? 'عند الاستلام' : 'بطاقة إلكترونية'}
                    </td>
                    <td>
                      <span class="status-pill status-${o.status}">${ProfilePage.formatStatus(o.status)}</span>
                    </td>
                    <td>
                      ${State.user?.role !== 'merchant' ? `
                        <button onclick="OrdersAdmin.openStatusModal('${o.id}')" class="btn-icon-action" title="تغيير الحالة">
                          <i class="fa-solid fa-arrows-rotate text-emerald-600"></i>
                        </button>
                      ` : `
                        <span class="text-[10px] text-slate-400 font-bold bg-slate-100 px-2 py-0.5 rounded-md ml-1">مشاهدة فقط</span>
                      `}
                      <button onclick="OrdersAdmin.viewOrderDetails('${o.id}')" class="btn-icon-action" title="تفاصيل الطلب">
                        <i class="fa-solid fa-eye text-blue-600"></i>
                      </button>
                      <button onclick="OrdersAdmin.printInvoice('${o.id}')" class="btn-icon-action" title="طباعة الفاتورة الرسمية">
                        <i class="fa-solid fa-print text-slate-700"></i>
                      </button>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;

    AdminLayout.render('orders', html);
  },

  handleSearch(val) {
    this.currentSearch = val;
    this.render();
  },

  handleStatusFilter(val) {
    this.currentStatus = val;
    this.render();
  },

  setDate(which, val) {
    if (which === 'from') this.fromDate = val; else this.toDate = val;
    this.render();
  },

  quickRange(kind) {
    const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const now = new Date();
    if (kind === 'today') { this.fromDate = this.toDate = iso(now); }
    else if (kind === '7') { const f = new Date(now); f.setDate(f.getDate() - 6); this.fromDate = iso(f); this.toDate = iso(now); }
    else if (kind === 'month') { this.fromDate = iso(new Date(now.getFullYear(), now.getMonth(), 1)); this.toDate = iso(now); }
    else { this.fromDate = ''; this.toDate = ''; }
    this.render();
  },

  toggleOne(id, on) {
    if (on) this.selected.add(id); else this.selected.delete(id);
    this.renderTable();
  },

  toggleAll(on) {
    this.selected = on ? new Set(this.orders.map(o => o.id)) : new Set();
    this.renderTable();
  },

  applyBulkStatus() {
    const status = document.getElementById('bulk-status-select').value;
    const note = document.getElementById('bulk-note').value.trim();
    const ids = [...this.selected];
    const label = { processing: 'قيد التجهيز', shipped: 'قيد الشحن', delivered: 'تم التسليم', cancelled: 'ملغي' }[status];
    App.confirm(`تغيير حالة ${ids.length} طلب إلى "${label}"؟ العملاء هيوصلهم إشعار.${status === 'delivered' ? ' (هيتسجلوا في المحاسبة كمحصّلين)' : ''}${status === 'cancelled' ? ' (المخزون هيرجع)' : ''}`, async () => {
      try {
        const res = await API.put('/orders/bulk/status', { ids, status, note });
        this.selected.clear();
        const failedMsg = (res.failed || []).slice(0, 3).map(f => f.message).join('\n');
        App.showToast(res.message + (failedMsg ? ` — ${failedMsg}` : ''), (res.failed || []).length ? 'warning' : 'success');
      } catch (err) {
        App.showToast(err.message, 'error');
      }
      this.render();
    });
  },

  async exportExcel() {
    try {
      App.showToast('جاري تجهيز ملف Excel...', 'info');
      const params = { from: this.fromDate, to: this.toDate };
      if (this.currentStatus !== 'all') params.status = this.currentStatus;
      await API.download('/exports/orders', params, 'orders.xlsx');
    } catch (err) {
      App.showToast(err.message, 'error');
    }
  },

  // ===== Manual order (WhatsApp / phone / shop) =====
  manualItems: [],
  manualProducts: [],

  async openManualOrderModal() {
    this.manualItems = [];
    this.manualProducts = [];
    try {
      for (let page = 1; page <= 20; page++) {
        const res = await API.get('/products', { limit: 100, page });
        this.manualProducts.push(...(res.products || []).filter(p => p.isActive !== false));
        if (!res.hasMore) break;
      }
    } catch (e) { /* keep what loaded */ }
    const govs = ['القاهرة', 'الجيزة', 'الإسكندرية', 'القليوبية', 'الشرقية', 'الدقهلية', 'الغربية', 'المنوفية', 'البحيرة', 'كفر الشيخ', 'دمياط', 'بورسعيد', 'الإسماعيلية', 'السويس', 'الفيوم', 'بني سويف', 'المنيا', 'أسيوط', 'سوهاج', 'قنا', 'الأقصر', 'أسوان', 'البحر الأحمر', 'الوادي الجديد', 'مطروح', 'شمال سيناء', 'جنوب سيناء'];
    App.openModal('تسجيل طلب يدوي', `
      <form onsubmit="OrdersAdmin.submitManualOrder(event)" class="text-right text-xs">
        <div class="grid grid-cols-2 gap-2 mb-2">
          <div><label class="form-label font-bold">اسم العميل *</label><input id="mo-name" class="form-control text-xs" required /></div>
          <div><label class="form-label font-bold">التليفون *</label><input id="mo-phone" class="form-control text-xs" required inputmode="tel" /></div>
          <div><label class="form-label font-bold">المحافظة *</label><select id="mo-gov" class="form-control text-xs">${govs.map(g => `<option>${g}</option>`).join('')}</select></div>
          <div><label class="form-label font-bold">المدينة/المنطقة</label><input id="mo-city" class="form-control text-xs" /></div>
        </div>
        <div class="mb-2"><label class="form-label font-bold">العنوان بالتفصيل</label><input id="mo-address" class="form-control text-xs" /></div>
        <div class="mb-3"><label class="form-label font-bold">الطلب جه منين؟</label>
          <select id="mo-source" class="form-control text-xs"><option value="whatsapp">واتساب</option><option value="phone">تليفون</option><option value="facebook">فيسبوك</option><option value="store">من المحل</option><option value="other">أخرى</option></select>
        </div>

        <div class="p-3 rounded-xl border border-slate-200 bg-slate-50 mb-3">
          <label class="form-label font-bold">المنتجات *</label>
          <input id="mo-search" class="form-control text-xs mb-2" placeholder="ابحث باسم المنتج أو SKU..." oninput="OrdersAdmin.renderManualSearch(this.value)" autocomplete="off" />
          <div id="mo-search-results" class="flex flex-col gap-1 max-h-40 overflow-auto mb-2"></div>
          <div id="mo-items"></div>
        </div>

        <div class="grid grid-cols-2 gap-2 mb-2">
          <div><label class="form-label font-bold">مصاريف الشحن</label><input id="mo-shipping" type="number" min="0" step="0.01" class="form-control text-xs" placeholder="فاضي = حساب تلقائي" oninput="OrdersAdmin.renderManualItems()" /></div>
          <div><label class="form-label font-bold">خصم (ج.م)</label><input id="mo-discount" type="number" min="0" step="0.01" class="form-control text-xs" value="0" oninput="OrdersAdmin.renderManualItems()" /></div>
        </div>
        <div class="mb-3"><label class="form-label font-bold">ملاحظات</label><input id="mo-notes" class="form-control text-xs" /></div>
        <div id="mo-total" class="font-black text-sm text-emerald-700 mb-3"></div>
        <button type="submit" id="mo-submit" class="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 rounded-xl text-sm">تسجيل الطلب</button>
        <p class="text-[10.5px] text-slate-400 mt-2">المخزون بيتخصم فوراً. لو رقم التليفون مسجّل لعميل عندنا، الطلب بيظهر في حسابه.</p>
      </form>
    `);
    this.renderManualItems();
  },

  renderManualSearch(q) {
    const box = document.getElementById('mo-search-results');
    if (!box) return;
    const term = String(q || '').trim().toLowerCase();
    if (term.length < 2) { box.innerHTML = ''; return; }
    const hits = this.manualProducts.filter(p => (p.title || '').toLowerCase().includes(term) || (p.sku || '').toLowerCase().includes(term)).slice(0, 8);
    box.innerHTML = hits.length ? hits.map(p => `
      <button type="button" onclick="OrdersAdmin.addManualItem('${p.id}')" class="text-right px-2 py-1.5 rounded-lg bg-white border border-slate-200 hover:border-emerald-400 flex justify-between gap-2">
        <span class="truncate font-bold">${this.esc(p.title)}</span>
        <span class="text-slate-500 flex-shrink-0">${p.price} ج.م • مخزون ${p.stock}</span>
      </button>`).join('') : '<div class="text-slate-400 p-1">مفيش نتايج</div>';
  },

  addManualItem(productId) {
    const p = this.manualProducts.find(x => String(x.id) === String(productId));
    if (!p) return;
    const variants = Array.isArray(p.variants) ? p.variants : [];
    const firstVariant = variants.find(v => (Number(v.stock) || 0) > 0) || variants[0] || null;
    this.manualItems.push({ productId: p.id, quantity: 1, variantId: firstVariant ? firstVariant.id : null });
    const s = document.getElementById('mo-search'); if (s) s.value = '';
    this.renderManualSearch('');
    this.renderManualItems();
  },

  renderManualItems() {
    const box = document.getElementById('mo-items');
    if (!box) return;
    let subtotal = 0;
    box.innerHTML = this.manualItems.length ? this.manualItems.map((it, idx) => {
      const p = this.manualProducts.find(x => String(x.id) === String(it.productId)) || {};
      const variants = Array.isArray(p.variants) ? p.variants : [];
      const v = variants.find(x => x.id === it.variantId) || null;
      const price = Number(v && v.price ? v.price : p.price) || 0;
      subtotal += price * it.quantity;
      return `
        <div class="flex items-center gap-2 py-1.5 border-b border-slate-200 last:border-0">
          <div class="flex-1 min-w-0">
            <div class="font-bold truncate">${this.esc(p.title)}</div>
            ${variants.length ? `
              <select class="form-control text-[11px] mt-1" onchange="OrdersAdmin.manualItems[${idx}].variantId=this.value; OrdersAdmin.renderManualItems()">
                ${variants.map(x => `<option value="${x.id}" ${x.id === it.variantId ? 'selected' : ''}>${this.esc(Object.values(x.options || {}).join(' / '))} — مخزون ${x.stock}</option>`).join('')}
              </select>` : ''}
          </div>
          <input type="number" min="1" value="${it.quantity}" class="form-control text-xs w-16" onchange="OrdersAdmin.manualItems[${idx}].quantity=Math.max(1, parseInt(this.value)||1); OrdersAdmin.renderManualItems()" />
          <span class="w-20 text-left font-bold">${price * it.quantity} ج.م</span>
          <button type="button" onclick="OrdersAdmin.manualItems.splice(${idx},1); OrdersAdmin.renderManualItems()" class="text-red-500 px-1"><i class="fa-solid fa-xmark"></i></button>
        </div>`;
    }).join('') : '<div class="text-slate-400">لسه ما ضفتش منتجات</div>';
    const ship = document.getElementById('mo-shipping');
    const disc = Number((document.getElementById('mo-discount') || {}).value) || 0;
    const shipVal = ship && ship.value !== '' ? Number(ship.value) || 0 : null;
    const totalBox = document.getElementById('mo-total');
    if (totalBox) totalBox.textContent = this.manualItems.length
      ? `المنتجات: ${subtotal} ج.م${shipVal !== null ? ` + شحن ${shipVal}` : ' + شحن تلقائي'}${disc ? ` − خصم ${disc}` : ''}`
      : '';
  },

  async submitManualOrder(e) {
    e.preventDefault();
    if (!this.manualItems.length) return App.showToast('أضف منتج واحد على الأقل', 'warning');
    const val = id => (document.getElementById(id) || {}).value || '';
    const items = this.manualItems.map(it => {
      const p = this.manualProducts.find(x => String(x.id) === String(it.productId)) || {};
      const v = (p.variants || []).find(x => x.id === it.variantId);
      return { productId: it.productId, quantity: it.quantity, selectedOptions: v ? v.options : {} };
    });
    const btn = document.getElementById('mo-submit');
    if (btn) { btn.disabled = true; btn.textContent = 'جاري التسجيل...'; }
    try {
      const res = await API.post('/orders/admin/manual', {
        customer: { name: val('mo-name'), phone: val('mo-phone'), governorate: val('mo-gov'), city: val('mo-city'), address: val('mo-address') },
        source: val('mo-source'),
        items,
        shippingFee: val('mo-shipping'),
        discount: val('mo-discount'),
        notes: val('mo-notes')
      });
      App.closeModal();
      App.showToast(res.message, 'success');
      this.render();
    } catch (err) {
      App.showToast(err.message, 'error');
      if (btn) { btn.disabled = false; btn.textContent = 'تسجيل الطلب'; }
    }
  },

  openStatusModal(orderId) {
    const order = this.orders.find(o => o.id === orderId);
    if (!order) return;

    App.openModal(`تحديث حالة الطلب #${order.orderNumber}`, `
      <form onsubmit="OrdersAdmin.submitStatusChange(event, '${order.id}')" class="text-right">
        <div class="form-group mb-3">
          <label class="form-label">الحالة الجديدة *</label>
          <select id="modal-order-status" class="form-control font-bold">
            <option value="pending" ${order.status === 'pending' ? 'selected' : ''}>تم استلام الطلب (قيد المراجعة)</option>
            <option value="processing" ${order.status === 'processing' ? 'selected' : ''}>قيد التجهيز والتغليف</option>
            <option value="shipped" ${order.status === 'shipped' ? 'selected' : ''}>قيد الشحن والتوصيل مع المندوب</option>
            <option value="delivered" ${order.status === 'delivered' ? 'selected' : ''}>تم التسليم بنجاح للعميل</option>
            <option value="cancelled" ${order.status === 'cancelled' ? 'selected' : ''}>إلغاء الطلب</option>
          </select>
        </div>

        <div class="form-group mb-4">
          <label class="form-label">ملاحظة يراها العميل في الإشعار (اختياري)</label>
          <input type="text" id="modal-order-note" class="form-control" placeholder="مثال: الشحنة مع المندوب أحمد ورقم جواله 010... " />
        </div>

        <button type="submit" class="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 rounded-xl text-sm">
          تحديث الحالة وإشعار العميل
        </button>
        ${this.isSuperAdmin() ? `
          <button type="button" onclick="OrdersAdmin.openCorrectionModal('${order.id}')" class="w-full mt-2 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 font-bold py-2.5 rounded-xl text-xs flex items-center justify-center gap-2">
            <i class="fa-solid fa-screwdriver-wrench"></i>
            <span>تصحيح الحالة (المدير العام فقط)</span>
          </button>` : ''}
      </form>
    `);
  },

  isSuperAdmin() {
    return Boolean(State.user && State.user.role === 'super_admin');
  },

  // Super admin: fix a wrong status, including delivered / cancelled (money effects are reversed on the server)
  openCorrectionModal(orderId) {
    const order = this.orders.find(o => o.id === orderId);
    if (!order) return;
    const label = s => ({ pending: 'تم استلام الطلب', processing: 'قيد التجهيز', shipped: 'قيد الشحن', delivered: 'تم التسليم', cancelled: 'ملغي' }[s] || s);
    App.openModal(`تصحيح حالة الطلب #${order.orderNumber}`, `
      <form onsubmit="OrdersAdmin.submitCorrection(event, '${order.id}')" class="text-right">
        <div class="bg-amber-50 border border-amber-200 text-amber-900 text-[11px] font-bold rounded-xl p-3 mb-3 leading-6">
          الحالة الحالية: <b>${label(order.status)}</b><br/>
          التصحيح بيعكس أثر الحالة القديمة تلقائياً: لو الطلب كان "تم التسليم" يتشال قيد المحاسبة ونقاط الولاء وعهدة المندوب،
          ولو كان "ملغي" يترجع خصم المخزون والكوبون. كل تصحيح بيتسجل في سجل الطلب وسجل الأمان باسمك.
        </div>
        <div class="form-group mb-3">
          <label class="form-label">الحالة الصحيحة *</label>
          <select id="correct-order-status" class="form-control font-bold">
            ${['pending', 'processing', 'shipped', 'delivered', 'cancelled'].filter(s => s !== order.status).map(s => `<option value="${s}">${label(s)}</option>`).join('')}
          </select>
        </div>
        <div class="form-group mb-4">
          <label class="form-label">سبب التصحيح *</label>
          <input type="text" id="correct-order-reason" class="form-control" minlength="5" required placeholder="مثال: تم الضغط على تم التسليم بالخطأ" />
        </div>
        <button type="submit" class="w-full bg-amber-600 hover:bg-amber-700 text-white font-bold py-3 rounded-xl text-sm">تأكيد التصحيح</button>
      </form>
    `);
  },

  async submitCorrection(e, orderId) {
    e.preventDefault();
    const status = document.getElementById('correct-order-status').value;
    const reason = document.getElementById('correct-order-reason').value.trim();
    try {
      const res = await API.put(`/orders/${orderId}/correct-status`, { status, reason });
      if (res.success) {
        App.closeModal();
        App.showToast(res.message, 'success');
        this.render();
      }
    } catch (err) {
      App.showToast(err.message, 'error');
    }
  },

  async submitStatusChange(e, orderId) {
    e.preventDefault();
    const status = document.getElementById('modal-order-status').value;
    const note = document.getElementById('modal-order-note').value.trim();

    try {
      const res = await API.put(`/orders/${orderId}/status`, { status, note });
      if (res.success) {
        App.closeModal();
        App.showToast(res.message, 'success');
        this.render();
      }
    } catch (err) {
      App.showToast(err.message, 'error');
    }
  },

  async viewOrderDetails(orderId) {
    try {
      const res = await API.get(`/orders/${orderId}`);
      if (!res.success || !res.order) return;
      const order = res.order;
      const addr = order.shippingAddress || {};

      App.openModal(`تفاصيل الطلب #${order.orderNumber}`, `
        <div class="text-right text-xs text-slate-700">
          <div class="bg-slate-50 p-4 rounded-xl border border-slate-200 mb-4 flex justify-between items-center">
            <div>
              <div class="font-extrabold text-base text-slate-900">#${order.orderNumber}</div>
              <div class="text-[11px] text-slate-400">${new Date(order.createdAt).toLocaleString('ar-EG')}</div>
            </div>
            <span class="status-pill status-${order.status}">${ProfilePage.formatStatus(order.status)}</span>
          </div>

          <div class="mb-4">
            <h4 class="font-bold text-slate-800 mb-2">بيانات العميل والشحن:</h4>
            <div class="bg-white p-3 rounded-xl border border-slate-100 flex flex-col gap-1">
              <div><strong>الاسم:</strong> ${order.customerName}</div>
              <div><strong>الجوال:</strong> ${order.customerPhone}</div>
              <div><strong>المحافظة والمدينة:</strong> ${addr.governorate || addr.city || '—'} ${addr.city && addr.city !== addr.governorate ? '- ' + addr.city : ''}</div>
              <div><strong>تفاصيل العنوان:</strong> ${[addr.area, addr.street, addr.building].filter(Boolean).join(' - ') || '—'}</div>
              ${addr.notes ? `<div><strong>ملاحظات التوصيل:</strong> ${addr.notes}</div>` : ''}
            </div>
          </div>

          <!-- Order Owners (Merchant / Investor) -->
          <div class="mb-4">
            <h4 class="font-bold text-slate-800 mb-2 flex items-center justify-between">
              <span class="flex items-center gap-1.5"><i class="fa-solid fa-boxes-packing text-emerald-600"></i> الجهة المسؤولة عن توريد الطلب:</span>
              <span class="text-[10px] text-slate-400">اضغط لعرض بيانات الاتصال</span>
            </h4>
            <div class="bg-slate-50 p-3 rounded-xl border border-slate-200 flex flex-wrap gap-2">
              ${(order.owners && order.owners.length > 0) ? order.owners.map(owner => `
                <button 
                  type="button" 
                  onclick="OrdersAdmin.showOwnerContactModal('${owner.type}', '${owner.code}')" 
                  class="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold transition shadow-xs cursor-pointer ${owner.type === 'investor' ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-emerald-600 text-white hover:bg-emerald-700'}"
                >
                  <i class="fa-solid ${owner.type === 'investor' ? 'fa-handshake' : 'fa-store'}"></i>
                  <span>${owner.type === 'investor' ? 'مستثمر:' : 'تاجر:'} ${owner.name} (${owner.code})</span>
                  <span class="text-[10px] bg-white/20 px-1.5 py-0.5 rounded-full">عرض البيانات والتواصل &larr;</span>
                </button>
              `).join('') : '<span class="text-xs text-slate-400 font-bold">إدارة المتجر العامة</span>'}
            </div>
          </div>

          <div class="mb-4">
            <h4 class="font-bold text-slate-800 mb-2">المنتجات (${order.items.length}):</h4>
            <div class="flex flex-col gap-2 max-h-48 overflow-y-auto">
              ${order.items.map(i => `
                <div class="flex items-center justify-between border-b border-slate-100 pb-2">
                  <div class="flex items-center gap-2">
                    <img src="${i.image || '/images/no-image.svg'}" class="w-8 h-8 rounded object-cover" />
                    <div>
                      <div class="font-bold">${i.title}</div>
                      <div class="text-[10px] text-slate-400">${i.quantity} × ${i.price} ج.م</div>
                      ${(i.investorCode || i.merchantCode) ? `
                        <div class="text-[10px] font-bold ${i.investorCode ? 'text-blue-700' : 'text-emerald-700'} mt-0.5">
                          ${i.investorCode ? `💼 مستثمر: ${i.investorName || i.investorCode}` : `🏪 تاجر: ${i.merchantName || i.merchantCode}`}
                        </div>
                      ` : ''}
                    </div>
                  </div>
                  <div class="font-bold text-emerald-700">${i.price * i.quantity} ج.م</div>
                </div>
              `).join('')}
            </div>
          </div>

          <div class="border-t border-slate-200 pt-3 flex justify-between font-extrabold text-base text-slate-900 mb-4">
            <span>الإجمالي:</span>
            <span>${order.grandTotal} ج.م</span>
          </div>

          <button onclick="OrdersAdmin.printInvoice('${order.id}')" class="w-full bg-slate-900 hover:bg-slate-800 text-white font-black py-3 rounded-xl text-xs flex items-center justify-center gap-2 shadow-sm transition cursor-pointer">
            <i class="fa-solid fa-print"></i>
            <span>طباعة الفاتورة الرسمية (A4)</span>
          </button>
        </div>
      `);
    } catch (err) {
      App.showToast('فشل جلب تفاصيل الطلب', 'error');
    }
  },

  async showOwnerContactModal(type, code) {
    App.openModal(`جاري التحميل...`, `
      <div class="py-8 text-center text-slate-400">
        <i class="fa-solid fa-spinner fa-spin text-2xl text-emerald-600 mb-2"></i>
        <div>جاري جلب بيانات ${type === 'investor' ? 'المستثمر' : 'التاجر'}...</div>
      </div>
    `);

    try {
      let data = null;
      if (type === 'investor') {
        const res = await API.get(`/investors/${code}`);
        data = res.investor;
      } else {
        const res = await API.get(`/merchants/${code}`);
        data = res.merchant;
      }

      if (!data) throw new Error('تعذر العثور على البيانات');

      const isInv = type === 'investor';
      const isSuper = State.user && (State.user.role === 'super_admin' || State.user.role === 'admin');

      const modalTitle = isInv 
        ? `💼 بيانات المستثمر: ${data.name} (${data.code})`
        : `🏪 بيانات التاجر: ${data.name} (${data.code})`;

      const cleanPhone = (data.phone || '').replace(/[^0-9+]/g, '');
      const cleanWa = (data.whatsapp || data.phone || '').replace(/[^0-9]/g, '');
      const waLink = cleanWa ? (cleanWa.startsWith('20') ? `https://wa.me/${cleanWa}` : `https://wa.me/20${cleanWa.replace(/^0+/, '')}`) : '';

      const modalBody = `
        <div class="text-right text-xs space-y-4" dir="rtl">
          <!-- Header Banner -->
          <div class="p-4 rounded-2xl ${isInv ? 'bg-gradient-to-r from-blue-900 to-indigo-900 text-white' : 'bg-gradient-to-r from-emerald-800 to-teal-900 text-white'} shadow-sm">
            <div class="flex items-center justify-between flex-wrap gap-2">
              <div class="flex items-center gap-3">
                <div class="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center text-2xl">
                  <i class="fa-solid ${isInv ? 'fa-handshake text-blue-300' : 'fa-store text-emerald-300'}"></i>
                </div>
                <div>
                  <h3 class="font-black text-sm text-white">${data.name}</h3>
                  <div class="text-[11px] opacity-80 mt-0.5">
                    الكود: <span class="font-mono font-bold bg-white/20 px-2 py-0.5 rounded text-white">${data.code}</span>
                  </div>
                </div>
              </div>
              <span class="px-3 py-1 rounded-full text-xs font-bold ${isInv ? 'bg-blue-400/20 text-blue-200 border border-blue-400/30' : 'bg-emerald-400/20 text-emerald-200 border border-emerald-400/30'}">
                ${isInv ? '💼 حساب مستثمر' : '🏪 حساب تاجر'}
              </span>
            </div>
          </div>

          <!-- Contact & Info Grid -->
          <div class="bg-white rounded-2xl p-4 border border-slate-200 space-y-3">
            <h4 class="font-extrabold text-slate-800 text-xs border-b border-slate-100 pb-2 flex items-center gap-1.5">
              <i class="fa-solid fa-address-card text-emerald-600"></i>
              <span>بيانات الاتصال والتواصل المباشر:</span>
            </h4>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <!-- Phone -->
              <div class="p-3 rounded-xl bg-slate-50 border border-slate-200">
                <div class="text-[10px] text-slate-400 font-bold mb-1">رقم الهاتف:</div>
                <div class="font-bold text-slate-800 font-mono text-sm flex items-center justify-between">
                  <span>${data.phone || 'غير مسجل'}</span>
                  ${cleanPhone ? `
                    <a href="tel:${cleanPhone}" class="bg-emerald-600 hover:bg-emerald-700 text-white px-2.5 py-1 rounded-lg text-xs font-bold flex items-center gap-1 shadow-sm">
                      <i class="fa-solid fa-phone"></i>
                      <span>اتصال</span>
                    </a>
                  ` : ''}
                </div>
              </div>

              <!-- WhatsApp -->
              <div class="p-3 rounded-xl bg-slate-50 border border-slate-200">
                <div class="text-[10px] text-slate-400 font-bold mb-1">رقم الواتساب:</div>
                <div class="font-bold text-slate-800 font-mono text-sm flex items-center justify-between">
                  <span>${data.whatsapp || data.phone || 'غير مسجل'}</span>
                  ${waLink ? `
                    <a href="${waLink}" target="_blank" rel="noopener noreferrer" class="bg-green-600 hover:bg-green-700 text-white px-2.5 py-1 rounded-lg text-xs font-bold flex items-center gap-1 shadow-sm">
                      <i class="fa-brands fa-whatsapp text-sm"></i>
                      <span>واتساب</span>
                    </a>
                  ` : ''}
                </div>
              </div>

              <!-- Address -->
              <div class="p-3 rounded-xl bg-slate-50 border border-slate-200 sm:col-span-2">
                <div class="text-[10px] text-slate-400 font-bold mb-1">العنوان والمقر:</div>
                <div class="font-bold text-slate-800 text-xs flex items-center gap-2">
                  <i class="fa-solid fa-location-dot text-rose-500"></i>
                  <span>${data.address || 'لم يتم تسجيل عنوان محدد'}</span>
                </div>
              </div>

              <!-- Username / Email -->
              ${data.username ? `
                <div class="p-3 rounded-xl bg-slate-50 border border-slate-200">
                  <div class="text-[10px] text-slate-400 font-bold mb-1">اسم المستخدم للنظام:</div>
                  <div class="font-bold text-slate-700 font-mono text-xs">${data.username}</div>
                </div>
              ` : ''}

              <!-- Capital (Super Admin only for investor) -->
              ${(isInv && isSuper && data.capital !== undefined) ? `
                <div class="p-3 rounded-xl bg-blue-50 border border-blue-200">
                  <div class="text-[10px] text-blue-600 font-bold mb-1">رأس المال (خاص بالمدير فقط):</div>
                  <div class="font-black text-blue-900 font-mono text-sm">${Number(data.capital).toLocaleString('en-US')} ج.م</div>
                </div>
              ` : ''}

              <!-- Notes -->
              ${data.notes ? `
                <div class="p-3 rounded-xl bg-slate-50 border border-slate-200 sm:col-span-2">
                  <div class="text-[10px] text-slate-400 font-bold mb-1">ملاحظات:</div>
                  <div class="text-slate-600 text-xs">${data.notes}</div>
                </div>
              ` : ''}
            </div>
          </div>

          <!-- Actions -->
          <div class="flex items-center justify-between pt-2 border-t border-slate-100 flex-wrap gap-2">
            <button type="button" onclick="App.closeModal()" class="btn btn-secondary text-xs px-4 py-2">
              إغلاق
            </button>
            <a 
              href="${isInv ? `#/admin/products?investorCode=${encodeURIComponent(data.code)}` : `#/admin/products?merchantCode=${encodeURIComponent(data.code)}`}"
              onclick="App.closeModal()"
              class="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-4 py-2 rounded-xl transition flex items-center gap-1.5 shadow-sm"
            >
              <i class="fa-solid fa-boxes-stacked"></i>
              <span>عرض كافة منتجات ${isInv ? 'المستثمر' : 'التاجر'} &larr;</span>
            </a>
          </div>
        </div>
      `;

      App.openModal(modalTitle, modalBody);
    } catch (err) {
      console.error('Show owner contact modal error:', err);
      App.showToast('فشل جلب بيانات الجهة المسؤولة', 'error');
    }
  },

  async printInvoice(orderId) {
    try {
      App.showToast('جاري تجهيز الفاتورة للطباعة...', 'info');
      let order = this.orders ? this.orders.find(o => o.id === orderId) : null;
      if (!order || !order.shippingAddress) {
        const res = await API.get(`/orders/${orderId}`);
        if (res.success && res.order) {
          order = res.order;
        }
      }

      if (!order) {
        App.showToast('تعذر العثور على بيانات الطلب', 'error');
        return;
      }

      const addr = order.shippingAddress || {};
      const fullAddress = [
        addr.governorate,
        addr.city && addr.city !== addr.governorate ? addr.city : null,
        addr.area,
        addr.street,
        addr.building
      ].filter(Boolean).join(' - ') || '—';

      const items = order.items || [];
      const subtotal = items.reduce((sum, it) => sum + ((Number(it.price) || 0) * (Number(it.quantity) || 1)), 0);
      const shippingCost = Number(order.shippingCost || 0);
      const discount = Number(order.discount || 0);
      const grandTotal = Number(order.grandTotal || (subtotal + shippingCost - discount));

      const ownersText = (order.owners && order.owners.length > 0)
        ? order.owners.map(o => `${o.type === 'investor' ? 'مستثمر: ' : 'تاجر: '} ${o.name} (${o.code})`).join(' | ')
        : 'إدارة سوقي ستور العامة';

      const invoiceHtml = `
        <div style="font-family: 'Cairo', 'Segoe UI', Tahoma, sans-serif; direction: rtl; text-align: right; color: #1e293b; line-height: 1.5; padding: 10px;">
          <!-- Header -->
          <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #059669; padding-bottom: 15px; margin-bottom: 18px;">
            <div style="display: flex; align-items: center; gap: 12px;">
              <img src="/icons/icon-192.png" style="width: 55px; height: 55px; object-fit: contain; border-radius: 10px;" alt="شعار سوقي ستور" />
              <div>
                <h1 style="margin: 0; font-size: 20px; font-weight: 900; color: #064e3b;">سوقي ستور (Suki Store)</h1>
                <div style="font-size: 11px; color: #64748b; font-weight: bold;">سوقك العربي المتكامل - جمهورية مصر العربية</div>
                <div style="font-size: 10px; color: #94a3b8;">س.ت: 894021 • ب.ض: 493-201-902 • هاتف: 01000000000</div>
              </div>
            </div>
            <div style="text-align: left; direction: ltr;">
              <div style="font-size: 16px; font-weight: 900; color: #059669; letter-spacing: 0.5px;">TAX INVOICE</div>
              <div style="font-size: 13px; font-weight: bold; color: #0f172a;">#${order.orderNumber}</div>
              <div style="font-size: 10px; color: #64748b;">${new Date(order.createdAt).toLocaleDateString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
            </div>
          </div>

          <!-- Customer & Order Details Grid -->
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 20px;">
            <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 12px; font-size: 11px;">
              <div style="font-weight: 900; color: #0f172a; border-bottom: 1px solid #e2e8f0; padding-bottom: 6px; margin-bottom: 6px;">بيانات العميل والشحن:</div>
              <div><strong>اسم العميل:</strong> ${order.customerName}</div>
              <div><strong>رقم الجوال:</strong> <span style="font-family: monospace; font-size: 12px;">${order.customerPhone}</span></div>
              <div><strong>العنوان:</strong> ${fullAddress}</div>
              ${addr.notes ? `<div><strong>ملاحظات التوصيل:</strong> ${addr.notes}</div>` : ''}
            </div>

            <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 12px; font-size: 11px;">
              <div style="font-weight: 900; color: #0f172a; border-bottom: 1px solid #e2e8f0; padding-bottom: 6px; margin-bottom: 6px;">تفاصيل الطلب والتوريد:</div>
              <div><strong>طريقة الدفع:</strong> ${order.paymentMethod === 'cod' ? 'الدفع عند الاستلام (COD)' : 'بطاقة إلكترونية'}</div>
              <div><strong>حالة الطلب:</strong> ${typeof ProfilePage !== 'undefined' ? ProfilePage.formatStatus(order.status) : order.status}</div>
              <div><strong>الجهة الموردة:</strong> ${ownersText}</div>
              <div><strong>تاريخ الطباعة:</strong> ${new Date().toLocaleDateString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
            </div>
          </div>

          <!-- Products Table -->
          <table style="width: 100%; border-collapse: collapse; font-size: 11px; margin-bottom: 20px;">
            <thead>
              <tr style="background: #f1f5f9; color: #0f172a; font-weight: 900;">
                <th style="border: 1px solid #cbd5e1; padding: 8px; text-align: center; width: 35px;">م</th>
                <th style="border: 1px solid #cbd5e1; padding: 8px; text-align: right;">اسم المنتج والمواصفات</th>
                <th style="border: 1px solid #cbd5e1; padding: 8px; text-align: center;">الجهة الموردة</th>
                <th style="border: 1px solid #cbd5e1; padding: 8px; text-align: center; width: 50px;">الكمية</th>
                <th style="border: 1px solid #cbd5e1; padding: 8px; text-align: center; width: 85px;">سعر الوحدة</th>
                <th style="border: 1px solid #cbd5e1; padding: 8px; text-align: center; width: 95px;">الإجمالي</th>
              </tr>
            </thead>
            <tbody>
              ${items.map((it, idx) => `
                <tr style="background: ${idx % 2 === 0 ? '#ffffff' : '#fafafa'};">
                  <td style="border: 1px solid #e2e8f0; padding: 8px; text-align: center; font-weight: bold;">${idx + 1}</td>
                  <td style="border: 1px solid #e2e8f0; padding: 8px;">
                    <div style="font-weight: bold; color: #0f172a;">${it.title}</div>
                    ${it.selectedVariation ? `<div style="font-size: 10px; color: #64748b;">${it.selectedVariation}</div>` : ''}
                  </td>
                  <td style="border: 1px solid #e2e8f0; padding: 8px; text-align: center; font-size: 10px; color: #475569;">
                    ${it.investorCode ? `مستثمر: ${it.investorName || it.investorCode}` : (it.merchantCode ? `تاجر: ${it.merchantName || it.merchantCode}` : 'سوقي ستور')}
                  </td>
                  <td style="border: 1px solid #e2e8f0; padding: 8px; text-align: center; font-weight: 900; font-size: 12px;">${it.quantity}</td>
                  <td style="border: 1px solid #e2e8f0; padding: 8px; text-align: center;">${(Number(it.price) || 0).toLocaleString('ar-EG')} ج.م</td>
                  <td style="border: 1px solid #e2e8f0; padding: 8px; text-align: center; font-weight: 900; color: #059669;">${((Number(it.price) || 0) * (Number(it.quantity) || 1)).toLocaleString('ar-EG')} ج.م</td>
                </tr>
              `).join('')}
            </tbody>
          </table>

          <!-- Financial Summary Box -->
          <div style="display: flex; justify-content: flex-end; margin-bottom: 25px;">
            <div style="width: 280px; border: 1px solid #e2e8f0; border-radius: 10px; overflow: hidden; font-size: 11px;">
              <div style="display: flex; justify-content: space-between; padding: 6px 12px; border-bottom: 1px solid #f1f5f9;">
                <span style="color: #64748b;">المجموع الفرعي:</span>
                <span style="font-weight: bold;">${subtotal.toLocaleString('ar-EG')} ج.م</span>
              </div>
              <div style="display: flex; justify-content: space-between; padding: 6px 12px; border-bottom: 1px solid #f1f5f9;">
                <span style="color: #64748b;">تكلفة الشحن:</span>
                <span style="font-weight: bold;">${shippingCost === 0 ? 'مجاني' : shippingCost.toLocaleString('ar-EG') + ' ج.م'}</span>
              </div>
              ${discount > 0 ? `
                <div style="display: flex; justify-content: space-between; padding: 6px 12px; border-bottom: 1px solid #f1f5f9; color: #ef4444;">
                  <span>الخصم / الكوبون:</span>
                  <span style="font-weight: bold;">-${discount.toLocaleString('ar-EG')} ج.م</span>
                </div>
              ` : ''}
              <div style="display: flex; justify-content: space-between; padding: 8px 12px; background: #ecfdf5; color: #065f46; font-size: 13px; font-weight: 900;">
                <span>الإجمالي المطلوب سداده:</span>
                <span>${grandTotal.toLocaleString('ar-EG')} ج.م</span>
              </div>
            </div>
          </div>

          <!-- Signatures & Policy Footer -->
          <div style="border-top: 1px dashed #cbd5e1; padding-top: 15px; margin-top: 20px;">
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; font-size: 11px; margin-bottom: 15px;">
              <div style="text-align: center; border: 1px solid #e2e8f0; padding: 10px; border-radius: 8px;">
                <div style="font-weight: bold; margin-bottom: 25px;">توقيع العميل المستلم:</div>
                <div style="border-bottom: 1px solid #cbd5e1; width: 60%; margin: 0 auto;"></div>
              </div>
              <div style="text-align: center; border: 1px solid #e2e8f0; padding: 10px; border-radius: 8px;">
                <div style="font-weight: bold; margin-bottom: 25px;">توقيع مندوب الشحن والتسليم:</div>
                <div style="border-bottom: 1px solid #cbd5e1; width: 60%; margin: 0 auto;"></div>
              </div>
            </div>

            <div style="text-align: center; font-size: 10px; color: #64748b; line-height: 1.6;">
              <div>يحق للعميل استبدال المنتج خلال 14 يوماً من تاريخ الاستلام في حالة عيب الصناعة، بشرط الحفاظ على المنتج بحالته الأصلية والفاتورة.</div>
              <div style="font-weight: bold; color: #059669; margin-top: 4px;">شكراً لتسوقكم من سوقي ستور - نتمنى لكم تجربة سعيدة دائماً! 🌟</div>
            </div>
          </div>
        </div>
      `;

      // Print in a clean page (the old way printed a blank page on most screens)
      ExportKit.printHtml(invoiceHtml, `فاتورة طلب #${order.orderNumber || ''}`);
    } catch (err) {
      console.error('Print invoice error:', err);
      App.showToast('حدث خطأ أثناء إعداد الفاتورة للطباعة', 'error');
    }
  }
};
