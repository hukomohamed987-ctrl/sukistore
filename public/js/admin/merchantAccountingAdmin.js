/**
 * Suki Store — Merchant portal (view only).
 * The merchant sees ONLY: his products at wholesale cost, units registered / sold / unsold,
 * his orders with their status (incl. exchanges), and money paid / still owed.
 * Never: selling price, discounts, coupons, shipping, store profit or customer data.
 */
const MerchantAccountingAdmin = {
  data: null,
  tab: 'account',
  orderFilter: 'all',
  search: '',

  esc(s) {
    return String(s === undefined || s === null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  },
  money(n) { return `${(Number(n) || 0).toLocaleString('ar-EG')} ج.م`; },
  section() { return { account: 'merchant-account', products: 'merchant-products', orders: 'merchant-orders' }[this.tab] || 'merchant-account'; },

  async render(tab = 'account') {
    this.tab = ['account', 'products', 'orders'].includes(tab) ? tab : 'account';
    AdminLayout.render(this.section(), `
      <div class="py-12 text-center text-slate-400">
        <i class="fa-solid fa-spinner fa-spin text-3xl mb-3 text-emerald-600"></i>
        <div class="font-bold">جاري تحميل بيانات حسابك...</div>
      </div>`);
    try {
      const res = await API.get('/accounting/merchant-portal');
      this.data = res;
      this.renderView();
    } catch (err) {
      AdminLayout.render(this.section(), `
        <div class="p-8 text-center text-red-500 bg-red-50 rounded-2xl border border-red-200">
          <i class="fa-solid fa-triangle-exclamation text-3xl mb-2"></i>
          <div class="font-bold">${this.esc(err.message || 'حدث خطأ أثناء تحميل بيانات الحساب')}</div>
        </div>`);
    }
  },

  setTab(t) { window.location.hash = t === 'account' ? '#/admin/merchant-accounting' : `#/admin/${t}`; },

  card(label, value, sub, color = 'slate', icon = 'fa-circle') {
    // Full class names (no string building) so the built Tailwind CSS includes them
    const C = {
      slate: ['bg-slate-50 text-slate-600', 'text-slate-800'],
      indigo: ['bg-indigo-50 text-indigo-600', 'text-indigo-700'],
      emerald: ['bg-emerald-50 text-emerald-600', 'text-emerald-700'],
      amber: ['bg-amber-50 text-amber-600', 'text-amber-700'],
      teal: ['bg-teal-50 text-teal-600', 'text-teal-700'],
      rose: ['bg-rose-50 text-rose-600', 'text-rose-700']
    }[color] || ['bg-slate-50 text-slate-600', 'text-slate-800'];
    return `
      <div class="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
        <div class="flex items-center justify-between text-slate-500 text-xs font-bold mb-2">
          <span>${label}</span>
          <span class="w-8 h-8 rounded-lg ${C[0]} flex items-center justify-center text-sm"><i class="fa-solid ${icon}"></i></span>
        </div>
        <div class="text-xl font-black ${C[1]}">${value}</div>
        ${sub ? `<div class="text-[11px] text-slate-400 mt-1">${sub}</div>` : ''}
      </div>`;
  },

  renderView() {
    const { merchant, summary: s } = this.data;
    const tabs = [['account', 'حسابي ومستحقاتي', 'fa-wallet'], ['products', 'منتجاتي', 'fa-box'], ['orders', 'طلبات منتجاتي', 'fa-receipt']];
    const remaining = Number(s.remaining) || 0;
    const html = `
      <div class="space-y-5 text-right" dir="rtl" id="merchant-portal-body">
        <div class="bg-gradient-to-l from-slate-900 via-slate-800 to-emerald-950 text-white p-5 rounded-2xl shadow-lg">
          <div class="flex items-center justify-between flex-wrap gap-3">
            <div>
              <div class="flex items-center gap-2 mb-1">
                <span class="px-2 py-0.5 rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-mono font-black text-xs">${this.esc(merchant.code)}</span>
                <span class="px-2 py-0.5 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold text-xs"><i class="fa-solid fa-lock text-[10px]"></i> مشاهدة فقط</span>
              </div>
              <h1 class="text-xl font-black">أهلاً ${this.esc(merchant.name)}</h1>
              <p class="text-xs text-slate-300 mt-1">كل الأسعار هنا بسعر الجملة بتاعك. مستحقاتك بتتحسب على القطع اللي اتسلّمت للعميل بس.</p>
            </div>
            ${ExportKit.buttons('#merchant-portal-body', `كشف حساب التاجر ${merchant.code}`, { dark: true })}
          </div>
        </div>

        <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
          ${this.card('القطع المسجلة', `${s.unitsRegistered} قطعة`, `${s.productsCount} منتج`, 'indigo', 'fa-boxes-stacked')}
          ${this.card('القطع اللي اتباعت', `${s.unitsSold} قطعة`, 'اتسلّمت للعميل', 'emerald', 'fa-circle-check')}
          ${this.card('في طلبات لسه ماشية', `${s.unitsInOrders} قطعة`, 'لسه ما اتسلّمتش', 'amber', 'fa-truck-fast')}
          ${this.card('القطع اللي ما اتباعتش', `${s.unitsUnsold} قطعة`, 'موجودة في المخزن', 'slate', 'fa-warehouse')}
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
          ${this.card('إجمالي مستحقاتك', this.money(s.totalDues), `مبيعات بسعر الجملة ${this.money(s.soldAtCost)}${s.adjustments ? ` ${s.adjustments < 0 ? '−' : '+'} تسويات ${this.money(Math.abs(s.adjustments))}` : ''}`, 'emerald', 'fa-sack-dollar')}
          ${this.card('اتورّدلك', this.money(s.totalPaid), `${(this.data.payouts || []).length} دفعة`, 'teal', 'fa-money-bill-transfer')}
          ${remaining >= 0
            ? this.card('لسه ما اتورّدش', this.money(remaining), remaining > 0 ? 'مستحق ليك عند المتجر' : 'كل مستحقاتك اتسوّت ✅', remaining > 0 ? 'amber' : 'emerald', 'fa-hourglass-half')
            : this.card('اتورّدلك زيادة', this.money(-remaining), 'هيتخصم من مستحقاتك الجاية (غالباً بسبب طلب اتلغى أو اتصحح)', 'rose', 'fa-circle-exclamation')}
        </div>

        <div class="flex gap-2 flex-wrap no-print">
          ${tabs.map(([k, label, icon]) => `
            <button onclick="MerchantAccountingAdmin.setTab('${k}')" class="px-4 py-2 rounded-xl text-xs font-bold ${this.tab === k ? 'bg-emerald-600 text-white' : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'}">
              <i class="fa-solid ${icon}"></i> ${label}
            </button>`).join('')}
        </div>

        <div id="merchant-tab-body">${this.tab === 'products' ? this.renderProducts() : this.tab === 'orders' ? this.renderOrders() : this.renderAccount()}</div>
      </div>`;
    AdminLayout.render(this.section(), html);
  },

  table(head, rows, empty) {
    return `
      <div class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div class="overflow-x-auto">
          <table class="w-full text-right text-xs">
            <thead class="bg-slate-50 text-slate-600 font-extrabold border-b border-slate-200"><tr>${head.map(h => `<th class="py-3 px-3">${h}</th>`).join('')}</tr></thead>
            <tbody class="divide-y divide-slate-100">${rows.length ? rows.join('') : `<tr><td colspan="${head.length}" class="py-8 text-center text-slate-400 font-bold">${empty}</td></tr>`}</tbody>
          </table>
        </div>
      </div>`;
  },

  renderAccount() {
    const { payouts = [], expenses = [] } = this.data;
    return `
      <h2 class="font-extrabold text-sm text-slate-800 mb-2"><i class="fa-solid fa-hand-holding-dollar text-emerald-600"></i> الدفعات اللي اتورّدتلك</h2>
      ${this.table(['المبلغ', 'التاريخ', 'طريقة التحويل', 'المرجع', 'ملاحظات'], payouts.map(p => `
        <tr><td class="py-3 px-3 font-black text-emerald-700">${this.money(p.amount)}</td>
        <td class="py-3 px-3">${new Date(p.date).toLocaleDateString('ar-EG')}</td>
        <td class="py-3 px-3">${this.esc(p.paymentMethod)}</td>
        <td class="py-3 px-3 font-mono">${this.esc(p.reference)}</td>
        <td class="py-3 px-3 text-slate-500">${this.esc(p.notes || '-')}</td></tr>`), 'لسه مفيش دفعات متسجلة')}
      ${expenses.length ? `
        <h2 class="font-extrabold text-sm text-slate-800 mb-2 mt-5"><i class="fa-solid fa-file-invoice text-rose-600"></i> تسويات على حسابك (خصومات أو إضافات)</h2>
        ${this.table(['البند', 'النوع', 'المبلغ', 'التاريخ', 'ملاحظات'], expenses.map(e => `
          <tr><td class="py-3 px-3 font-bold">${this.esc(e.title)}</td>
          <td class="py-3 px-3">${e.type === 'revenue' ? '<span class="text-emerald-700 font-bold">إضافة لحسابك</span>' : '<span class="text-rose-700 font-bold">خصم من حسابك</span>'}</td>
          <td class="py-3 px-3 font-black">${this.money(e.amount)}</td>
          <td class="py-3 px-3">${new Date(e.date).toLocaleDateString('ar-EG')}</td>
          <td class="py-3 px-3 text-slate-500">${this.esc(e.notes || '-')}</td></tr>`), '')}` : ''}`;
  },

  renderProducts() {
    const term = this.search.trim().toLowerCase();
    const list = (this.data.products || []).filter(p => !term || (p.title || '').toLowerCase().includes(term) || (p.sku || '').toLowerCase().includes(term));
    return `
      <input class="form-control text-xs mb-3 max-w-sm no-print" placeholder="ابحث باسم المنتج أو الكود..." value="${this.esc(this.search)}" onchange="MerchantAccountingAdmin.search=this.value; MerchantAccountingAdmin.renderView()" />
      ${this.table(['المنتج', 'سعر الجملة', 'مسجّل', 'اتباع', 'في طلبات ماشية', 'ما اتباعش (في المخزن)', 'الحالة'], list.map(p => `
        <tr>
          <td class="py-3 px-3"><div class="flex items-center gap-2">
            ${p.image ? `<img src="${this.esc(p.image)}" class="w-9 h-9 rounded-lg object-cover border border-slate-200" loading="lazy" />` : ''}
            <div><div class="font-bold text-slate-800">${this.esc(p.title)}</div>
            ${p.sku ? `<div class="text-[10px] font-mono text-slate-400">${this.esc(p.sku)}</div>` : ''}
            ${p.variants.length ? `<div class="text-[10px] text-slate-500">${p.variants.map(v => `${this.esc(v.label)}: ${v.stock}`).join(' • ')}</div>` : ''}</div></div></td>
          <td class="py-3 px-3 font-black text-emerald-700">${p.wholesalePrice === null ? '<span class="text-amber-600">مش متسجل</span>' : this.money(p.wholesalePrice)}</td>
          <td class="py-3 px-3 font-bold">${p.unitsRegistered}</td>
          <td class="py-3 px-3 font-bold text-emerald-700">${p.unitsSold}</td>
          <td class="py-3 px-3 font-bold text-amber-700">${p.unitsInOrders}</td>
          <td class="py-3 px-3 font-bold">${p.unitsUnsold}</td>
          <td class="py-3 px-3">${p.isActive ? '<span class="text-emerald-700 font-bold">معروض</span>' : '<span class="text-slate-400 font-bold">مش معروض</span>'}</td>
        </tr>`), 'مفيش منتجات مسجلة باسمك')}`;
  },

  renderOrders() {
    const filters = [['all', 'الكل'], ['open', 'لسه ماشية'], ['delivered', 'اتسلّمت'], ['cancelled', 'اتلغت'], ['exchange', 'فيها استبدال']];
    const statusCls = { pending: 'bg-slate-100 text-slate-700', processing: 'bg-blue-50 text-blue-700', shipped: 'bg-amber-50 text-amber-700', delivered: 'bg-emerald-50 text-emerald-700', cancelled: 'bg-rose-50 text-rose-700' };
    const list = (this.data.orders || []).filter(o => {
      if (this.orderFilter === 'open') return ['pending', 'processing', 'shipped'].includes(o.status);
      if (this.orderFilter === 'exchange') return o.hasExchange;
      if (this.orderFilter === 'all') return true;
      return o.status === this.orderFilter;
    });
    return `
      <div class="flex gap-2 flex-wrap mb-3 no-print">
        ${filters.map(([k, l]) => `<button onclick="MerchantAccountingAdmin.orderFilter='${k}'; MerchantAccountingAdmin.renderView()" class="px-3 py-1.5 rounded-lg text-xs font-bold ${this.orderFilter === k ? 'bg-slate-800 text-white' : 'bg-white border border-slate-200 text-slate-600'}">${l}</button>`).join('')}
      </div>
      ${this.table(['رقم الطلب', 'التاريخ', 'القطع (بسعر الجملة)', 'الإجمالي بسعر الجملة', 'الحالة'], list.map(o => `
        <tr>
          <td class="py-3 px-3 font-mono font-bold">#${this.esc(o.orderNumber)}</td>
          <td class="py-3 px-3 text-slate-500">${new Date(o.date).toLocaleDateString('ar-EG')}</td>
          <td class="py-3 px-3">${o.items.map(i => `
            <div class="mb-1"><span class="font-bold">${this.esc(i.title)}</span>${i.variantLabel ? ` <span class="text-slate-400">(${this.esc(i.variantLabel)})</span>` : ''}
            — ${i.quantity} × ${this.money(i.unitCost)}
            ${i.exchangeStatusLabel ? `<span class="inline-block text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-200 rounded px-1.5 mr-1"><i class="fa-solid fa-arrow-rotate-left"></i> ${this.esc(i.exchangeStatusLabel)}</span>` : ''}</div>`).join('')}</td>
          <td class="py-3 px-3 font-black ${o.countsInDues ? 'text-emerald-700' : 'text-slate-400'}">${this.money(o.costTotal)}${o.countsInDues ? '' : '<div class="text-[10px] font-semibold">مش داخل في مستحقاتك لسه</div>'}</td>
          <td class="py-3 px-3"><span class="px-2 py-1 rounded-lg text-[11px] font-bold ${statusCls[o.status] || statusCls.pending}">${this.esc(o.statusLabel)}</span></td>
        </tr>`), 'مفيش طلبات في الفلتر ده')}`;
  }
};
