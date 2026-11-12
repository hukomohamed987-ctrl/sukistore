/**
 * Accounting tools (step 4): unified ledger, month closing, expense categories.
 */
const LedgerAdmin = {
  tab: 'ledger',
  range: 'month',
  type: 'all',
  search: '',
  data: null,

  esc(s) { return String(s === undefined || s === null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); },
  m(n) { return `${(Number(n) || 0).toLocaleString('ar-EG')} ج.م`; },
  isOwner() { return State.user && (State.user.role === 'super_admin' || State.user.role === 'admin'); },

  async render(tab) {
    if (tab) this.tab = tab;
    AdminLayout.render('ledger', `<div class="py-12 text-center text-slate-400"><i class="fa-solid fa-spinner fa-spin text-3xl mb-3 text-emerald-600"></i><div>جاري التحميل...</div></div>`);
    try {
      if (this.tab === 'periods') this.data = await API.get('/accounting/periods');
      else if (this.tab === 'categories') this.data = await API.get('/accounting/expense-categories');
      else this.data = await API.get('/accounting/ledger', { timeRange: this.range, type: this.type, search: this.search });
      this.renderView();
    } catch (err) {
      AdminLayout.render('ledger', `<div class="p-8 text-center text-rose-600">${this.esc(err.message)}</div>`);
    }
  },

  renderView() {
    const tabs = [['ledger', 'دفتر الحركات', 'fa-book'], ['periods', 'قفل الشهور', 'fa-lock'], ['categories', 'تصنيفات المصروفات', 'fa-tags']];
    const body = this.tab === 'periods' ? this.renderPeriods() : this.tab === 'categories' ? this.renderCategories() : this.renderLedger();
    AdminLayout.render('ledger', `
      <div class="space-y-4 text-right" dir="rtl">
        <div class="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 class="text-2xl font-black text-slate-900"><i class="fa-solid fa-book text-emerald-600"></i> دفتر الحركات والشهور</h1>
            <p class="text-xs text-slate-500 mt-1">كل الفلوس اللي دخلت وخرجت في مكان واحد، وقفل الشهور عشان الحسابات اللي اتسوّت ما تتغيرش</p>
          </div>
          <div class="flex items-center gap-2 flex-wrap">
            ${this.tab !== 'categories' ? ExportKit.buttons('#ledger-body', this.tab === 'periods' ? 'ملخص الشهور' : 'دفتر الحركات') : ''}
            <a href="#/admin/accounting" class="text-xs font-bold text-emerald-700 hover:underline"><i class="fa-solid fa-arrow-right"></i> رجوع للمحاسبة</a>
          </div>
        </div>
        <div class="flex gap-2 flex-wrap">
          ${tabs.map(([k, l, i]) => `<button onclick="LedgerAdmin.render('${k}')" class="px-4 py-2 rounded-xl text-xs font-bold ${this.tab === k ? 'bg-emerald-600 text-white' : 'bg-white border border-slate-200 text-slate-700'}"><i class="fa-solid ${i}"></i> ${l}</button>`).join('')}
        </div>
        <div id="ledger-body">${body}</div>
      </div>`);
  },

  renderLedger() {
    const d = this.data;
    const ranges = [['day', 'النهارده'], ['week', 'آخر 7 أيام'], ['month', 'الشهر ده'], ['all', 'الكل']];
    const dirCls = r => r.direction > 0 ? 'text-emerald-700' : r.direction < 0 ? 'text-rose-700' : 'text-slate-600';
    const sign = r => r.direction > 0 ? '+' : r.direction < 0 ? '−' : '';
    return `
      <div class="admin-card p-4">
        <div class="flex gap-2 flex-wrap items-center mb-3">
          ${ranges.map(([k, l]) => `<button onclick="LedgerAdmin.range='${k}'; LedgerAdmin.render()" class="px-3 py-1.5 rounded-lg text-xs font-bold ${this.range === k ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-700'}">${l}</button>`).join('')}
          <select class="form-control text-xs w-auto" onchange="LedgerAdmin.type=this.value; LedgerAdmin.render()">
            <option value="all">كل الأنواع</option>
            ${Object.entries(d.types || {}).map(([k, t]) => `<option value="${k}" ${this.type === k ? 'selected' : ''}>${this.esc(t.label)}</option>`).join('')}
          </select>
          <input class="form-control text-xs w-auto" placeholder="بحث (رقم طلب، اسم، بند)..." value="${this.esc(this.search)}" onchange="LedgerAdmin.search=this.value; LedgerAdmin.render()" />
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-3 text-xs font-bold">
          <div class="bg-emerald-50 rounded-xl p-3"><div class="text-emerald-700">فلوس دخلت</div><div class="text-lg font-black text-emerald-800">${this.m(d.moneyIn)}</div></div>
          <div class="bg-rose-50 rounded-xl p-3"><div class="text-rose-700">فلوس خرجت</div><div class="text-lg font-black text-rose-800">${this.m(d.moneyOut)}</div></div>
          <div class="bg-slate-50 rounded-xl p-3"><div class="text-slate-600">الفرق</div><div class="text-lg font-black ${d.net >= 0 ? 'text-emerald-800' : 'text-rose-800'}">${this.m(d.net)}</div></div>
        </div>
        <div class="admin-table-container">
          <table class="admin-table">
            <thead><tr><th>التاريخ</th><th>النوع</th><th>الطرف</th><th>البيان</th><th>المرجع</th><th>المبلغ</th><th>الشهر</th></tr></thead>
            <tbody>
              ${(d.rows || []).length === 0 ? '<tr><td colspan="7" class="text-center py-8 text-slate-400">مفيش حركات في الفترة دي</td></tr>' : d.rows.map(r => `
                <tr>
                  <td class="text-xs text-slate-500">${this.esc(r.day)}</td>
                  <td><span class="text-[11px] font-bold px-2 py-0.5 rounded bg-slate-100">${this.esc(r.typeLabel)}</span>${r.category ? `<div class="text-[10px] text-slate-400">${this.esc(r.category)}</div>` : ''}</td>
                  <td class="text-xs">${this.esc(r.party && r.party.name)}</td>
                  <td class="text-xs text-slate-600 max-w-xs">${this.esc(r.note)}</td>
                  <td class="text-xs font-mono">${this.esc(r.ref)}</td>
                  <td class="text-xs font-black ${dirCls(r)}">${sign(r)}${this.m(r.amount)}</td>
                  <td class="text-[11px] text-slate-400">${this.esc(r.period)}</td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
        <p class="text-[10.5px] text-slate-400 mt-2">"توريد مندوب" حركة داخلية (الفلوس اتنقلت من المندوب للخزنة)، ومش بتتحسب دخل جديد. التواريخ بتوقيت مصر.</p>
      </div>`;
  },

  renderPeriods() {
    const d = this.data;
    const owner = this.isOwner();
    return `
      <div class="admin-card p-4">
        <div class="flex items-center justify-between flex-wrap gap-3 mb-3">
          <div class="text-xs text-slate-600 leading-6">
            <b>القفل يدوي:</b> المدير العام بيقفل الشهر بعد ما يخلص ويراجعه. بعد القفل مفيش إضافة أو تعديل أو مسح لأي حركة تاريخها في الشهر ده.
          </div>
          ${owner ? `
            <div class="flex items-center gap-2 text-xs font-bold bg-slate-50 border border-slate-200 rounded-xl p-2">
              <span>قفل تلقائي يوم</span>
              <input id="auto-close-day" type="number" min="0" max="28" value="${d.autoClosePeriodDay || 0}" class="form-control text-xs w-16 text-center" />
              <span>من الشهر اللي بعده</span>
              <button onclick="LedgerAdmin.saveAutoClose()" class="bg-slate-800 text-white px-3 py-1.5 rounded-lg">حفظ</button>
              <span class="text-[10px] text-slate-400">(0 = يدوي بس)</span>
            </div>` : ''}
        </div>
        <div class="admin-table-container">
          <table class="admin-table">
            <thead><tr><th>الشهر</th><th>الحالة</th><th>طلبات مسلّمة</th><th>المحصّل</th><th>مستحقات التجار والمستثمرين</th><th>مصروفات المتجر</th><th>المرتبات</th><th>صافي ربح المتجر</th><th></th></tr></thead>
            <tbody>
              ${(d.periods || []).map(p => `
                <tr>
                  <td class="font-mono font-bold text-xs">${this.esc(p.period)}${p.isCurrent ? ' <span class="text-[10px] text-blue-600">(الحالي)</span>' : ''}</td>
                  <td class="text-xs">${p.closed ? `<span class="text-rose-700 font-bold"><i class="fa-solid fa-lock"></i> مقفول</span><div class="text-[10px] text-slate-400">${this.esc(p.closedBy)} • ${new Date(p.closedAt).toLocaleDateString('ar-EG')}</div>` : '<span class="text-emerald-700 font-bold"><i class="fa-solid fa-lock-open"></i> مفتوح</span>'}</td>
                  <td class="text-xs">${p.summary.deliveredOrders}</td>
                  <td class="text-xs font-bold">${this.m(p.summary.collected)}</td>
                  <td class="text-xs">${this.m((p.summary.merchantDues || 0) + (p.summary.investorDues || 0))}</td>
                  <td class="text-xs text-rose-700">${this.m(p.summary.storeExpenses)}</td>
                  <td class="text-xs">${this.m(p.summary.salaries)}</td>
                  <td class="text-xs font-black ${(p.summary.netProfit || 0) >= 0 ? 'text-emerald-700' : 'text-rose-700'}">${this.m(p.summary.netProfit)}</td>
                  <td class="text-xs">${owner ? (p.closed
                    ? `<button onclick="LedgerAdmin.reopen('${p.period}')" class="text-amber-700 font-bold hover:underline">فتح الشهر</button>`
                    : (p.isCurrent ? '<span class="text-slate-300">—</span>' : `<button onclick="LedgerAdmin.close('${p.period}')" class="bg-rose-600 text-white px-3 py-1 rounded-lg font-bold">قفل الشهر</button>`)) : ''}</td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
        <p class="text-[10.5px] text-slate-400 mt-2">أرقام الشهر المقفول بتتحفظ وقت القفل. لو اضطريت تفتح شهر، لازم تكتب السبب وبيتسجل مع الأرقام القديمة.</p>
      </div>`;
  },

  close(ym) {
    App.confirm(`قفل شهر ${ym}؟ بعد القفل مفيش تعديل في أي حركة تاريخها في الشهر ده.`, async () => {
      try { const r = await API.post(`/accounting/periods/${ym}/close`); App.showToast(r.message, 'success'); this.render('periods'); }
      catch (err) { App.showToast(err.message, 'error'); }
    });
  },

  reopen(ym) {
    App.openModal(`فتح شهر ${ym}`, `
      <div class="text-right text-xs">
        <p class="text-slate-600 mb-2">فتح شهر مقفول بيخلي حساباته تتغير. اكتب السبب (بيتسجل):</p>
        <textarea id="reopen-reason" rows="3" class="form-control mb-3"></textarea>
        <button onclick="LedgerAdmin.confirmReopen('${ym}')" class="w-full bg-amber-600 hover:bg-amber-700 text-white font-bold py-2.5 rounded-xl">فتح الشهر</button>
      </div>`);
  },

  async confirmReopen(ym) {
    try { const r = await API.post(`/accounting/periods/${ym}/reopen`, { reason: document.getElementById('reopen-reason').value }); App.closeModal(); App.showToast(r.message, 'success'); this.render('periods'); }
    catch (err) { App.showToast(err.message, 'error'); }
  },

  async saveAutoClose() {
    try { const r = await API.put('/accounting/periods-settings', { autoClosePeriodDay: Number(document.getElementById('auto-close-day').value) }); App.showToast(r.message, 'success'); this.render('periods'); }
    catch (err) { App.showToast(err.message, 'error'); }
  },

  renderCategories() {
    const list = this.data.categories || [];
    return `
      <div class="admin-card p-4 max-w-xl">
        <p class="text-xs text-slate-600 mb-3">التصنيفات اللي بتظهر في فورم المصروف. سطر لكل تصنيف. ("مرتبات" و"شحن استبدال" بيستخدمهم السيستم وموجودين دايماً.)</p>
        <textarea id="cats-input" rows="12" class="form-control text-sm mb-3">${this.esc(list.join('\n'))}</textarea>
        <button onclick="LedgerAdmin.saveCategories()" class="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-5 py-2.5 rounded-xl text-xs">حفظ التصنيفات</button>
      </div>`;
  },

  async saveCategories() {
    const categories = document.getElementById('cats-input').value.split('\n').map(s => s.trim()).filter(Boolean);
    try {
      const r = await API.put('/accounting/expense-categories', { categories });
      if (typeof AccountingAdmin !== 'undefined') AccountingAdmin.expenseCategories = r.categories;
      App.showToast('تم حفظ التصنيفات', 'success'); this.render('categories');
    } catch (err) { App.showToast(err.message, 'error'); }
  }
};
