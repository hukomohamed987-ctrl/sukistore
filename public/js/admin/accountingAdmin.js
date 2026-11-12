/**
 * Suki Store Admin - Financial Accounting System
 * Complete financial dashboard, sales reports, merchant accounts,
 * coupons audit, store commission management, employee collection reconciliation,
 * general expenses & revenues management, and returns & warranty financial reports.
 *
 * Includes 1-Click Print & Download as Image (PNG) for any statement or report.
 */

const AccountingAdmin = {
  currentTab: 'dashboard',
  timeRange: 'month', // 'day' | 'week' | 'month' | 'custom' | 'all'
  startDate: '',
  endDate: '',
  isReadOnly: false,
  dashboardData: null,
  recentLedger: [],
  salesReports: [],
  salesGroupBy: 'daily',
  merchantsReport: [],
  filteredMerchantsList: null,
  investorsReport: [],
  filteredInvestorsList: null,
  couponsReport: [],
  commissionsReport: null,
  collectionsReport: [],
  filteredCollectionsList: null,
  expensesReport: [],
  expensesStats: {},
  returnsReport: [],
  returnsStats: {},
  editingExpenseId: null,

  async render() {
    AdminLayout.render('accounting', `
      <div class="py-12 text-center text-slate-400">
        <i class="fa-solid fa-spinner fa-spin text-3xl mb-3 text-emerald-600"></i>
        <div class="font-bold">جاري تحميل لوحة المحاسبة والبيانات المالية...</div>
      </div>
    `);

    await this.loadAllData();
  },

  async loadAllData() {
    try {
      const qParams = new URLSearchParams();
      if (this.timeRange) qParams.set('timeRange', this.timeRange);
      if (this.startDate) qParams.set('startDate', this.startDate);
      if (this.endDate) qParams.set('endDate', this.endDate);

      const qs = qParams.toString() ? `?${qParams.toString()}` : '';

      const [dashRes, merchRes, invRes, colRes, expRes] = await Promise.all([
        API.get(`/accounting/dashboard${qs}`).catch(e => ({ summary: {}, recentLedger: [] })),
        API.get(`/accounting/reports/merchants${qs}`).catch(e => ({ merchantsReport: [] })),
        API.get(`/accounting/reports/investors${qs}`).catch(e => ({ investorsReport: [] })),
        API.get(`/accounting/collections`).catch(e => ({ collections: [] })),
        API.get(`/accounting/expenses${qs}`).catch(e => ({ expenses: [], stats: {} }))
      ]);

      this.isReadOnly = Boolean(dashRes.isReadOnly);
      this.dashboardData = dashRes.summary || {};
      this.recentLedger = dashRes.recentLedger || [];
      this.merchantsReport = merchRes.merchantsReport || merchRes.merchants || [];
      this.investorsReport = invRes.investorsReport || invRes.investors || [];
      this.collectionsReport = colRes.collections || [];
      this.expensesReport = expRes.expenses || [];
      this.expensesStats = expRes.stats || {};

      this.renderUI();
    } catch (err) {
      console.error('Failed to load accounting data:', err);
      AdminLayout.render('accounting', `
        <div class="p-8 text-center text-rose-600 bg-rose-50 rounded-2xl border border-rose-200" dir="rtl">
          <i class="fa-solid fa-circle-exclamation text-3xl mb-2"></i>
          <div class="font-bold mb-1">${err.message || 'فشل تحميل بيانات قسم المحاسبة'}</div>
          <p class="text-xs text-rose-500">تأكد من تسجيل الدخول بحساب مصرح له (محاسب معتمد أو مدير عام).</p>
          <button onclick="AccountingAdmin.render()" class="mt-4 px-4 py-2 bg-emerald-600 text-white font-bold rounded-xl text-xs">إعادة المحاولة</button>
        </div>
      `);
    }
  },

  renderUI() {
    const s = this.dashboardData || {};
    const pBreakdown = s.paymentBreakdown || { cash: { amount: 0, percentage: 0 }, card: { amount: 0, percentage: 0 } };

    const content = `
      <div id="accounting-container" class="space-y-6 text-right" dir="rtl">
        <!-- Top Status & Role Header -->
        <div class="bg-gradient-to-l from-slate-900 via-indigo-950 to-slate-900 text-white p-6 rounded-2xl shadow-xl relative overflow-hidden">
          <div class="relative z-10 flex items-center justify-between flex-wrap gap-4">
            <div>
              <div class="flex items-center gap-2 mb-1">
                <span class="inline-flex items-center px-3 py-1 rounded-full text-xs font-black ${this.isReadOnly ? 'bg-amber-500/20 text-amber-300 border border-amber-400/30' : 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/30'}">
                  ${this.isReadOnly
                    ? '👁️ وضع المشاهدة فقط (View Only)'
                    : (State.user && (State.user.role === 'super_admin' || State.user.role === 'admin')
                        ? '👑 المدير العام (صلاحيات كاملة)'
                        : '💼 المحاسب المالي (صلاحيات كاملة)')}
                </span>
                <span class="text-xs text-slate-300">سوقي ستور - الإدارة المالية</span>
              </div>
              <h1 class="text-2xl font-black flex items-center gap-2.5">
                <i class="fa-solid fa-scale-balanced text-emerald-400"></i>
                <span>نظام المحاسبة والتقارير المالية</span>
              </h1>
              <p class="text-slate-300 text-xs mt-1">
                إدارة المصروفات، الإيرادات، حسابات التجار، المرتجعات والضمان، وتوريد الخزينة
              </p>
            </div>

            <!-- Export / Print Controls -->
            <div class="flex items-center gap-2 flex-wrap no-print">
              <button 
                type="button"
                onclick="AccountingAdmin.printReport()" 
                class="bg-white/10 hover:bg-white/20 text-white border border-white/20 font-bold px-3 py-1.5 rounded-xl text-xs flex items-center gap-1.5 shadow-sm transition">
                <i class="fa-solid fa-print"></i>
                <span>طباعة</span>
              </button>

              <button 
                type="button"
                id="btn-export-acc-img"
                onclick="AccountingAdmin.downloadAsImage()" 
                class="bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold px-3.5 py-1.5 rounded-xl text-xs flex items-center gap-1.5 shadow transition">
                <i class="fa-solid fa-file-pdf"></i>
                <span>PDF</span>
              </button>

              <button
                type="button"
                onclick="AccountingAdmin.exportExcel()"
                class="bg-white/10 hover:bg-white/20 text-white border border-white/20 font-bold px-3 py-1.5 rounded-xl text-xs flex items-center gap-1.5 shadow-sm transition">
                <i class="fa-solid fa-table"></i>
                <span>Excel (الجدول المعروض)</span>
              </button>

              <button
                type="button"
                onclick="API.download('/exports/sales', {}, 'sales.xlsx').catch(e => App.showToast(e.message, 'error'))"
                class="bg-white text-slate-800 hover:bg-slate-100 font-extrabold px-3.5 py-1.5 rounded-xl text-xs flex items-center gap-1.5 shadow transition">
                <i class="fa-solid fa-file-excel text-green-600"></i>
                <span>المبيعات والأرباح Excel</span>
              </button>

              <a href="#/admin/ledger" class="bg-white/10 hover:bg-white/20 text-white border border-white/20 font-bold px-3 py-1.5 rounded-xl text-xs flex items-center gap-1.5 transition">
                <i class="fa-solid fa-book"></i>
                <span>دفتر الحركات وقفل الشهور</span>
              </a>
              <a href="#/admin/employees" class="bg-white/10 hover:bg-white/20 text-white border border-white/20 font-bold px-3 py-1.5 rounded-xl text-xs flex items-center gap-1.5 transition">
                <i class="fa-solid fa-user-clock"></i>
                <span>الموظفين والمرتبات</span>
              </a>
            </div>
          </div>
        </div>

        ${this.isReadOnly ? `
          <div class="bg-amber-50 border border-amber-200 text-amber-900 p-3.5 rounded-xl text-xs font-bold flex items-center gap-2">
            <i class="fa-solid fa-circle-info text-amber-600 text-base"></i>
            <span>تنبيه: أنت تتصفح قسم المحاسبة في "وضع المشاهدة فقط". العمليات التعديلية والحذف محصورة بالمحاسب المالي الكامل الصلاحيات.</span>
          </div>
        ` : ''}

        <!-- Time Filter Bar -->
        <div class="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm flex items-center justify-between flex-wrap gap-3 no-print">
          <div class="flex items-center gap-1.5 flex-wrap">
            <span class="text-xs font-extrabold text-slate-700 ml-2">الفترة الزمنية:</span>
            <button onclick="AccountingAdmin.setTimeRange('day')" class="px-3 py-1.5 rounded-lg text-xs font-bold transition ${this.timeRange === 'day' ? 'bg-emerald-600 text-white shadow' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}">
              اليوم
            </button>
            <button onclick="AccountingAdmin.setTimeRange('week')" class="px-3 py-1.5 rounded-lg text-xs font-bold transition ${this.timeRange === 'week' ? 'bg-emerald-600 text-white shadow' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}">
              الأسبوع
            </button>
            <button onclick="AccountingAdmin.setTimeRange('month')" class="px-3 py-1.5 rounded-lg text-xs font-bold transition ${this.timeRange === 'month' ? 'bg-emerald-600 text-white shadow' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}">
              الشهر
            </button>
            <button onclick="AccountingAdmin.setTimeRange('all')" class="px-3 py-1.5 rounded-lg text-xs font-bold transition ${this.timeRange === 'all' ? 'bg-emerald-600 text-white shadow' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}">
              كافة الفترات
            </button>
          </div>

          <!-- Custom Date Filter -->
          <div class="flex items-center gap-2 flex-wrap">
            <div class="flex items-center gap-1 text-xs text-slate-600 font-bold">
              <span>من:</span>
              <input type="date" id="acc-start-date" class="form-control text-xs p-1.5 font-bold" value="${this.startDate}" onchange="AccountingAdmin.onCustomDateChange()" />
            </div>
            <div class="flex items-center gap-1 text-xs text-slate-600 font-bold">
              <span>إلى:</span>
              <input type="date" id="acc-end-date" class="form-control text-xs p-1.5 font-bold" value="${this.endDate}" onchange="AccountingAdmin.onCustomDateChange()" />
            </div>
            ${this.startDate || this.endDate ? `
              <button onclick="AccountingAdmin.clearCustomDate()" class="text-xs text-rose-600 hover:underline font-bold px-1">
                مسح
              </button>
            ` : ''}
          </div>
        </div>

        <!-- Key Financial Metrics (cost-based profit model: no commission) -->
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden">
            <div class="flex items-center justify-between mb-2">
              <span class="text-xs font-extrabold text-slate-500">إجمالي المبيعات المحصلة</span>
              <span class="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center text-sm"><i class="fa-solid fa-money-bill-wave"></i></span>
            </div>
            <div class="text-2xl font-black text-slate-800 mb-1">${(s.totalRevenue || 0).toLocaleString('ar-EG')} <span class="text-xs font-bold text-slate-400">ج.م</span></div>
            <div class="text-[11px] text-emerald-600 font-bold">من ${s.deliveredOrdersCount || 0} طلب مسلّم (حسب تاريخ التسليم)</div>
          </div>

          <div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden">
            <div class="flex items-center justify-between mb-2">
              <span class="text-xs font-extrabold text-slate-500">ربح المتجر من المبيعات</span>
              <span class="w-8 h-8 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center text-sm"><i class="fa-solid fa-sack-dollar"></i></span>
            </div>
            <div class="text-2xl font-black text-purple-700 mb-1">${(s.storeGrossProfit || 0).toLocaleString('ar-EG')} <span class="text-xs font-bold text-slate-400">ج.م</span></div>
            <div class="text-[10px] text-purple-700 font-bold leading-5">
              فرق السعر ${(s.storeItemProfit || 0).toLocaleString('ar-EG')} + شحن ${(s.shippingIncome || 0).toLocaleString('ar-EG')} − خصومات ${(s.discounts || 0).toLocaleString('ar-EG')}
            </div>
          </div>

          <div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden">
            <div class="flex items-center justify-between mb-2">
              <span class="text-xs font-extrabold text-slate-500">صافي ربح المتجر</span>
              <span class="w-8 h-8 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center text-sm"><i class="fa-solid fa-scale-balanced"></i></span>
            </div>
            <div class="text-2xl font-black ${(s.netProfit || 0) < 0 ? 'text-rose-700' : 'text-emerald-700'} mb-1">${(s.netProfit || 0).toLocaleString('ar-EG')} <span class="text-xs font-bold text-slate-400">ج.م</span></div>
            <div class="text-[10px] text-rose-600 font-bold">بعد خصم نصيب المتجر من المصروفات: ${(s.storeExpenses || 0).toLocaleString('ar-EG')} ج.م</div>
          </div>

          <div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden">
            <div class="flex items-center justify-between mb-2">
              <span class="text-xs font-extrabold text-slate-500">مستحقات التجار والمستثمرين</span>
              <span class="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center text-sm"><i class="fa-solid fa-hand-holding-dollar"></i></span>
            </div>
            <div class="text-2xl font-black text-indigo-700 mb-1">${(s.ownerDuesTotal || 0).toLocaleString('ar-EG')} <span class="text-xs font-bold text-slate-400">ج.م</span></div>
            <div class="text-[10px] text-indigo-600 font-bold leading-5">تجار (سعر التكلفة): ${(s.merchantDuesTotal || 0).toLocaleString('ar-EG')} — مستثمرين (تكلفة + نسبتهم): ${(s.investorDuesTotal || 0).toLocaleString('ar-EG')}</div>
          </div>
        </div>
        <!-- Where the collected money goes (sales = dues + own goods cost + store profit) -->
        ${(s.totalRevenue || 0) > 0 ? (() => {
          const f = n => (Number(n) || 0).toLocaleString('ar-EG');
          const gap = Number(s.reconciliationGap) || 0;
          return `
          <div class="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
            <div class="text-xs font-extrabold text-slate-700 mb-3"><i class="fa-solid fa-diagram-project text-emerald-600"></i> فلوس المبيعات راحت فين؟</div>
            <div class="grid grid-cols-2 lg:grid-cols-4 gap-2 text-[11px] font-bold">
              <div class="bg-slate-50 rounded-xl p-3"><div class="text-slate-500">إجمالي المحصّل</div><div class="text-base font-black text-slate-800">${f(s.totalRevenue)} ج.م</div></div>
              <div class="bg-indigo-50 rounded-xl p-3"><div class="text-indigo-600">− مستحقات التجار والمستثمرين</div><div class="text-base font-black text-indigo-700">${f(s.ownerDuesTotal)} ج.م</div></div>
              <div class="bg-amber-50 rounded-xl p-3"><div class="text-amber-700">− تكلفة بضاعة المتجر</div><div class="text-base font-black text-amber-800">${f(s.storeGoodsCost)} ج.م</div><div class="text-[10px] text-amber-700 font-semibold mt-0.5">تمن البضاعة اللي المتجر اشتراها بفلوسه، رجعلك مش ربح</div></div>
              <div class="bg-purple-50 rounded-xl p-3"><div class="text-purple-600">= ربح المتجر من المبيعات</div><div class="text-base font-black text-purple-700">${f(s.storeGrossProfit)} ج.م</div></div>
            </div>
            ${Math.abs(gap) >= 1 ? `<div class="text-[10.5px] text-slate-500 mt-2"><i class="fa-solid fa-circle-info"></i> فرق ${f(gap)} ج.م من طلبات قديمة اتسجلت قبل نظام الحسابات الجديد (مثلاً مصاريف شحن مش متسجلة في الطلب).</div>` : ''}
          </div>`;
        })() : ''}
        ${(s.costMissingItems || 0) > 0 ? `
          <div class="bg-amber-50 border border-amber-200 text-amber-900 text-[11px] font-bold rounded-xl p-3">
            <i class="fa-solid fa-triangle-exclamation"></i> يوجد ${s.costMissingItems} بند مباع بدون سعر تكلفة (طلبات قديمة لمنتجات اتحذفت). اعتُبر ربحها بالكامل للمتجر، فالربح هنا تقديري. أضف سعر التكلفة لكل منتج لتكون الأرقام دقيقة.
          </div>` : ''}
        <!-- Section Navigation Tabs (Filtered & Cleaned) -->
        <div class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div class="flex border-b border-slate-200 overflow-x-auto bg-slate-50/70 p-1.5 gap-1 text-xs font-bold no-print">
            <button onclick="AccountingAdmin.setTab('dashboard')" class="px-4 py-2.5 rounded-xl transition shrink-0 flex items-center gap-1.5 ${this.currentTab === 'dashboard' ? 'bg-white text-emerald-700 shadow-sm border border-slate-200 font-black' : 'text-slate-600 hover:text-slate-900'}">
              <i class="fa-solid fa-chart-pie"></i>
              <span>لوحة العمليات والقيود</span>
            </button>

            <button onclick="AccountingAdmin.setTab('expenses')" class="px-4 py-2.5 rounded-xl transition shrink-0 flex items-center gap-1.5 ${this.currentTab === 'expenses' ? 'bg-white text-emerald-700 shadow-sm border border-slate-200 font-black' : 'text-slate-600 hover:text-slate-900'}">
              <i class="fa-solid fa-receipt"></i>
              <span>المصروفات والإيرادات (${this.expensesReport.length})</span>
            </button>

            <button onclick="AccountingAdmin.setTab('merchants')" class="px-4 py-2.5 rounded-xl transition shrink-0 flex items-center gap-1.5 ${this.currentTab === 'merchants' ? 'bg-white text-emerald-700 shadow-sm border border-slate-200 font-black' : 'text-slate-600 hover:text-slate-900'}">
              <i class="fa-solid fa-store text-emerald-600"></i>
              <span>حسابات ومستحقات التجار (${this.merchantsReport.length})</span>
            </button>

            <button onclick="AccountingAdmin.setTab('investors')" class="px-4 py-2.5 rounded-xl transition shrink-0 flex items-center gap-1.5 ${this.currentTab === 'investors' ? 'bg-white text-blue-700 shadow-sm border border-slate-200 font-black' : 'text-slate-600 hover:text-slate-900'}">
              <i class="fa-solid fa-briefcase text-blue-600"></i>
              <span>حسابات ومستحقات المستثمرين (${this.investorsReport.length})</span>
            </button>

            <button onclick="AccountingAdmin.setTab('collections')" class="px-4 py-2.5 rounded-xl transition shrink-0 flex items-center gap-1.5 ${this.currentTab === 'collections' ? 'bg-white text-emerald-700 shadow-sm border border-slate-200 font-black' : 'text-slate-600 hover:text-slate-900'}">
              <i class="fa-solid fa-handshake text-teal-600"></i>
              <span>تحصيل التجار (${this.collectionsReport.length})</span>
            </button>
          </div>

          <!-- Printable Area Container -->
          <div id="accounting-print-area" class="p-5">
            ${this.renderActiveTabContent()}
          </div>
        </div>
      </div>
    `;

    AdminLayout.render('accounting', content);
  },

  setTab(tab) {
    this.currentTab = tab;
    this.filteredCollectionsList = null;
    this.filteredMerchantsList = null;
    this.filteredInvestorsList = null;
    this.renderUI();
  },

  setTimeRange(range) {
    this.timeRange = range;
    this.startDate = '';
    this.endDate = '';
    this.loadAllData();
  },

  onCustomDateChange() {
    const start = document.getElementById('acc-start-date')?.value;
    const end = document.getElementById('acc-end-date')?.value;
    if (start || end) {
      this.timeRange = 'custom';
      this.startDate = start || '';
      this.endDate = end || '';
      this.loadAllData();
    }
  },

  clearCustomDate() {
    this.timeRange = 'month';
    this.startDate = '';
    this.endDate = '';
    this.loadAllData();
  },

  reportElement() {
    return document.getElementById('accounting-print-area') || document.getElementById('accounting-container') || document.getElementById('admin-content');
  },

  reportTitle() {
    const tabs = { dashboard: 'لوحة العمليات', expenses: 'المصروفات والإيرادات', merchants: 'حسابات التجار', investors: 'حسابات المستثمرين', collections: 'التحصيلات', returns: 'الاستبدال والضمان' };
    return `تقرير المحاسبة — ${tabs[this.currentTab] || this.currentTab || ''}`;
  },

  printReport() {
    ExportKit.print(this.reportElement(), this.reportTitle());
  },

  exportExcel() {
    ExportKit.excel(this.reportElement(), this.reportTitle());
  },

  // (was "save as image", which broke Arabic letters) → a real PDF through the print page
  async downloadAsImage() {
    {
      ExportKit.pdf(this.reportElement(), this.reportTitle());
    }
  },

  renderActiveTabContent() {
    switch (this.currentTab) {
      case 'dashboard':
        return this.renderDashboardTab();
      case 'expenses':
        return this.renderExpensesTab();
      case 'merchants':
        return this.renderMerchantsTab();
      case 'investors':
        return this.renderInvestorsTab();
      case 'collections':
        return this.renderCollectionsTab();
      default:
        return this.renderDashboardTab();
    }
  },

  // 1. Dashboard Tab
  renderDashboardTab() {
    return `
      <div>
        <div class="flex items-center justify-between mb-4">
          <h3 class="font-extrabold text-slate-800 text-sm flex items-center gap-2">
            <i class="fa-solid fa-list-check text-emerald-600"></i>
            <span>سجل القيود المحاسبية والتسويات الأخيرة</span>
          </h3>
          <span class="text-xs text-slate-400 font-bold">آخر الحركات المحاسبية</span>
        </div>

        <div class="overflow-x-auto rounded-xl border border-slate-200">
          <table class="w-full text-right text-xs">
            <thead class="bg-slate-50 text-slate-700 font-extrabold border-b border-slate-200">
              <tr>
                <th class="py-3 px-3">رقم القيد / المرجع</th>
                <th class="py-3 px-3">التاريخ والوقت</th>
                <th class="py-3 px-3">نوع الحركة</th>
                <th class="py-3 px-3">البيان / الوصف</th>
                <th class="py-3 px-3 text-center">المبلغ (ج.م)</th>
                <th class="py-3 px-3 text-center">طريقة الدفع</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100 bg-white">
              ${this.recentLedger.length === 0 ? `
                <tr><td colspan="6" class="py-8 text-center text-slate-400 font-bold">لا توجد قيود مسجلة خلال الفترة</td></tr>
              ` : this.recentLedger.map(item => `
                <tr class="hover:bg-slate-50/70 transition">
                  <td class="py-3 px-3 font-mono font-bold text-slate-700">${item.orderNumber || item.id || '-'}</td>
                  <td class="py-3 px-3 text-slate-500 font-mono">${item.createdAt ? new Date(item.createdAt).toLocaleString('ar-EG') : '-'}</td>
                  <td class="py-3 px-3">
                    <span class="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold ${item.type === 'delivered_order' ? 'bg-emerald-50 text-emerald-700' : (item.type === 'merchant_payout' ? 'bg-purple-50 text-purple-700' : 'bg-blue-50 text-blue-700')}">
                      ${item.type === 'delivered_order' ? 'تحصيل طلب مكتمل' : (item.type === 'merchant_payout' ? 'صرف مستحقات تاجر' : 'قيد وتسوية')}
                    </span>
                  </td>
                  <td class="py-3 px-3 font-medium text-slate-800">${item.description || item.notes || ('قيد محاسبي للطلب #' + (item.orderNumber || ''))}</td>
                  <td class="py-3 px-3 text-center font-extrabold text-emerald-700">${(Number(item.amount || item.collectedAmount || 0)).toLocaleString('ar-EG')} ج.م</td>
                  <td class="py-3 px-3 text-center font-bold text-slate-600">
                    ${item.paymentMethod === 'card' ? '💳 بطاقة بنكية' : '💵 نقداً (كاش)'}
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  },

  // 2. Expenses & Revenues Tab (المصروفات والإيرادات)
  renderExpensesTab() {
    const st = this.expensesStats || {};
    return `
      <div class="space-y-4">
        <div class="flex items-center justify-between flex-wrap gap-3 pb-3 border-b border-slate-200">
          <div>
            <h3 class="font-extrabold text-slate-800 text-sm flex items-center gap-2">
              <i class="fa-solid fa-receipt text-emerald-600"></i>
              <span>إدارة المصروفات والإيرادات المالية العامة</span>
            </h3>
            <p class="text-xs text-slate-500 mt-0.5">تسجيل تكاليف الشحن، التغليف، الإعلانات، الرواتب، والإيرادات المتنوعة</p>
          </div>

          ${!this.isReadOnly ? `
            <button 
              type="button" 
              onclick="AccountingAdmin.openExpenseModal()" 
              class="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-3.5 py-2 rounded-xl text-xs flex items-center gap-1.5 shadow transition">
              <i class="fa-solid fa-plus"></i>
              <span>إضافة بند مالي (مصروف / إيراد)</span>
            </button>
          ` : ''}
        </div>

        <!-- Expenses Summary Cards -->
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div class="bg-rose-50 border border-rose-200 p-4 rounded-xl">
            <div class="text-[11px] font-bold text-rose-600 mb-1">إجمالي المصروفات</div>
            <div class="text-xl font-black text-rose-700">${(st.totalExpenses || 0).toLocaleString('ar-EG')} ج.م</div>
          </div>
          <div class="bg-emerald-50 border border-emerald-200 p-4 rounded-xl">
            <div class="text-[11px] font-bold text-emerald-600 mb-1">إجمالي الإيرادات الإضافية</div>
            <div class="text-xl font-black text-emerald-700">${(st.totalRevenues || 0).toLocaleString('ar-EG')} ج.م</div>
          </div>
          <div class="bg-slate-50 border border-slate-200 p-4 rounded-xl">
            <div class="text-[11px] font-bold text-slate-600 mb-1">الرصيد الصافي للبند</div>
            <div class="text-xl font-black ${(st.netBalance || 0) >= 0 ? 'text-emerald-700' : 'text-rose-700'}">${(st.netBalance || 0).toLocaleString('ar-EG')} ج.م</div>
          </div>
        </div>

        <!-- Table -->
        <div class="overflow-x-auto rounded-xl border border-slate-200">
          <table class="w-full text-right text-xs">
            <thead class="bg-slate-50 text-slate-700 font-extrabold border-b border-slate-200">
              <tr>
                <th class="py-3 px-3">التاريخ</th>
                <th class="py-3 px-3">النوع</th>
                <th class="py-3 px-3">التصنيف</th>
                <th class="py-3 px-3">البند / الوصف</th>
                <th class="py-3 px-3">الجهة المرتبطة</th>
                <th class="py-3 px-3 text-center">المبلغ</th>
                <th class="py-3 px-3">مسجل الحركة</th>
                <th class="py-3 px-3 text-center no-print">الإجراءات</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100 bg-white">
              ${this.expensesReport.length === 0 ? `
                <tr><td colspan="8" class="py-8 text-center text-slate-400 font-bold">لا توجد بنود مصروفات أو إيرادات مسجلة</td></tr>
              ` : this.expensesReport.map(item => `
                <tr class="hover:bg-slate-50/70 transition">
                  <td class="py-3 px-3 font-mono text-slate-600">${new Date(item.date || item.createdAt).toLocaleDateString('ar-EG')}</td>
                  <td class="py-3 px-3">
                    <span class="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold ${item.type === 'revenue' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}">
                      ${item.type === 'revenue' ? '📈 إيراد' : '📉 مصروف'}
                    </span>
                  </td>
                  <td class="py-3 px-3 font-bold text-slate-700">${item.category || 'عام'}</td>
                  <td class="py-3 px-3 font-extrabold text-slate-800">
                    <div>${item.title}</div>
                    ${item.notes ? `<div class="text-[10px] text-slate-400 font-normal">${item.notes}</div>` : ''}
                  </td>
                  <td class="py-3 px-3">
                    ${(item.targetType === 'investor' || item.investorId) ? `
                      <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-200" title="مربوط بمستثمر بنسبة تقاسم">
                        <i class="fa-solid fa-handshake text-[10px]"></i>
                        <span>مستثمر: ${item.investorName || item.investorCode || '—'}</span>
                        <span class="text-[9px] text-blue-500 font-mono">(${item.investorSharePercent !== undefined ? item.investorSharePercent : 50}%)</span>
                      </span>
                    ` : ((item.targetType === 'merchant' || item.merchantId) ? `
                      <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200" title="مربوط بتاجر ويخصم من مستحقاته">
                        <i class="fa-solid fa-briefcase text-[10px]"></i>
                        <span>تاجر: ${item.merchantName || item.merchantCode || '—'}</span>
                      </span>
                    ` : `
                      <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
                        <i class="fa-solid fa-store text-[10px]"></i>
                        <span>عام للمتجر</span>
                      </span>
                    `)}
                  </td>
                  <td class="py-3 px-3 text-center font-black ${item.type === 'revenue' ? 'text-emerald-700' : 'text-rose-700'}">
                    ${(item.amount || 0).toLocaleString('ar-EG')} ج.م
                  </td>
                  <td class="py-3 px-3 text-slate-500">${item.createdByName || 'المحاسب'}</td>
                  <td class="py-3 px-3 text-center no-print">
                    ${!this.isReadOnly ? `
                      <div class="flex items-center justify-center gap-1">
                        <button type="button" onclick="AccountingAdmin.openExpenseModal('${item.id}')" class="btn-icon-action" title="تعديل">
                          <i class="fa-solid fa-pen text-blue-600"></i>
                        </button>
                        <button type="button" onclick="AccountingAdmin.deleteExpense('${item.id}')" class="btn-icon-action danger" title="حذف">
                          <i class="fa-solid fa-trash text-red-600"></i>
                        </button>
                      </div>
                    ` : '<span class="text-slate-400 text-[10px]">عرض فقط</span>'}
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  },

  // 3. Returns & Warranty Tab (المرتجعات والضمان وفروق الأسعار)
  renderReturnsTab() {
    const st = this.returnsStats || {};
    return `
      <div class="space-y-4">
        <div class="flex items-center justify-between flex-wrap gap-3 pb-3 border-b border-slate-200">
          <div>
            <h3 class="font-extrabold text-slate-800 text-sm flex items-center gap-2">
              <i class="fa-solid fa-rotate-left text-pink-600"></i>
              <span>تقرير المرتجعات والاستبدال والضمان وفروق الأسعار</span>
            </h3>
            <p class="text-xs text-slate-500 mt-0.5">متابعة المبالغ المستردة، وفروق أسعار الاستبدال، وربطها بالتجار المعنيين</p>
          </div>
        </div>

        <!-- Returns KPI Summary -->
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div class="bg-pink-50 border border-pink-200 p-4 rounded-xl">
            <div class="text-[11px] font-bold text-pink-600 mb-1">إجمالي طلبات المرتجعات والضمان</div>
            <div class="text-xl font-black text-pink-700">${st.totalReturnsCount || 0} طلب</div>
          </div>
          <div class="bg-rose-50 border border-rose-200 p-4 rounded-xl">
            <div class="text-[11px] font-bold text-rose-600 mb-1">إجمالي مبالغ الاسترجاع</div>
            <div class="text-xl font-black text-rose-700">${(st.totalRefundAmount || 0).toLocaleString('ar-EG')} ج.م</div>
          </div>
          <div class="bg-amber-50 border border-amber-200 p-4 rounded-xl">
            <div class="text-[11px] font-bold text-amber-600 mb-1">إجمالي فروق أسعار الاستبدال</div>
            <div class="text-xl font-black text-amber-700">${(st.totalPriceDifferences || 0).toLocaleString('ar-EG')} ج.م</div>
          </div>
        </div>

        <!-- Table -->
        <div class="overflow-x-auto rounded-xl border border-slate-200">
          <table class="w-full text-right text-xs">
            <thead class="bg-slate-50 text-slate-700 font-extrabold border-b border-slate-200">
              <tr>
                <th class="py-3 px-3">رقم الطلب / المرتجع</th>
                <th class="py-3 px-3">التاريخ</th>
                <th class="py-3 px-3">النوع</th>
                <th class="py-3 px-3">العميل</th>
                <th class="py-3 px-3">المنتج</th>
                <th class="py-3 px-3">التاجر المعني</th>
                <th class="py-3 px-3 text-center">مبلغ المنتج</th>
                <th class="py-3 px-3 text-center">فرق السعر</th>
                <th class="py-3 px-3 text-center">الحالة</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100 bg-white">
              ${this.returnsReport.length === 0 ? `
                <tr><td colspan="9" class="py-8 text-center text-slate-400 font-bold">لا توجد طلبات مرتجعات أو ضمان خلال الفترة</td></tr>
              ` : this.returnsReport.map(r => `
                <tr class="hover:bg-slate-50/70 transition">
                  <td class="py-3 px-3 font-mono font-bold text-slate-700">${r.returnNumber}</td>
                  <td class="py-3 px-3 font-mono text-slate-500">${new Date(r.createdAt).toLocaleDateString('ar-EG')}</td>
                  <td class="py-3 px-3">
                    <span class="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold ${r.returnType === 'استبدال' ? 'bg-amber-50 text-amber-800' : (r.returnType.includes('ضمان') ? 'bg-purple-50 text-purple-800' : 'bg-rose-50 text-rose-800')}">
                      ${r.returnType}
                    </span>
                  </td>
                  <td class="py-3 px-3 font-bold text-slate-800">${r.userName}</td>
                  <td class="py-3 px-3 font-medium text-slate-700">${r.productTitle}</td>
                  <td class="py-3 px-3 font-bold text-indigo-700">${r.merchantName} (${r.merchantCode})</td>
                  <td class="py-3 px-3 text-center font-black text-rose-700">${(r.refundAmount || 0).toLocaleString('ar-EG')} ج.م</td>
                  <td class="py-3 px-3 text-center font-black text-amber-700">${(r.priceDifference || 0).toLocaleString('ar-EG')} ج.م</td>
                  <td class="py-3 px-3 text-center">
                    <span class="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold ${r.status === 'completed' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}">
                      ${r.status === 'completed' ? 'مكتمل ومسوى' : 'قيد المتابعة'}
                    </span>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  },

  // 4. Sales Tab
  renderSalesTab() {
    return `
      <div>
        <div class="flex items-center justify-between mb-4 flex-wrap gap-2">
          <h4 class="font-extrabold text-slate-800 text-sm flex items-center gap-2">
            <i class="fa-solid fa-chart-column text-emerald-600"></i>
            <span>تقرير المبيعات المجمعة</span>
          </h4>
          <div class="flex items-center gap-1 bg-slate-100 p-1 rounded-xl text-xs font-bold no-print">
            <button onclick="AccountingAdmin.setSalesGroupBy('daily')" class="px-3 py-1 rounded-lg transition ${this.salesGroupBy === 'daily' ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-600'}">
              يومي
            </button>
            <button onclick="AccountingAdmin.setSalesGroupBy('monthly')" class="px-3 py-1 rounded-lg transition ${this.salesGroupBy === 'monthly' ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-600'}">
              شهري
            </button>
          </div>
        </div>

        <div class="overflow-x-auto rounded-xl border border-slate-200">
          <table class="w-full text-right text-xs">
            <thead class="bg-slate-50 text-slate-700 font-extrabold border-b border-slate-200">
              <tr>
                <th class="py-3 px-3">الفترة (${this.salesGroupBy === 'daily' ? 'اليوم' : 'الشهر'})</th>
                <th class="py-3 px-3 text-center">عدد الطلبات المسلمة</th>
                <th class="py-3 px-3 text-center">إجمالي المبيعات</th>
                <th class="py-3 px-3 text-center">مبيعات كاش</th>
                <th class="py-3 px-3 text-center">مبيعات فيزا</th>
                <th class="py-3 px-3 text-center">ربح المتجر</th>
                <th class="py-3 px-3 text-center">مستحقات التجار والمستثمرين</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100 bg-white">
              ${this.salesReports.length === 0 ? `
                <tr><td colspan="7" class="py-8 text-center text-slate-400 font-bold">لا توجد مبيعات في هذه الفترة</td></tr>
              ` : this.salesReports.map(r => `
                <tr class="hover:bg-slate-50/70 transition">
                  <td class="py-3 px-3 font-bold font-mono text-slate-800">${r.period}</td>
                  <td class="py-3 px-3 text-center font-bold text-slate-700">${r.ordersCount}</td>
                  <td class="py-3 px-3 text-center font-black text-slate-900">${(r.grossSales || 0).toLocaleString('ar-EG')} ج.م</td>
                  <td class="py-3 px-3 text-center font-bold text-emerald-700">${(r.cashSales || 0).toLocaleString('ar-EG')} ج.م</td>
                  <td class="py-3 px-3 text-center font-bold text-blue-700">${(r.cardSales || 0).toLocaleString('ar-EG')} ج.م</td>
                  <td class="py-3 px-3 text-center font-black text-purple-700">${(r.storeProfit || 0).toLocaleString('ar-EG')} ج.م</td>
                  <td class="py-3 px-3 text-center font-black text-indigo-700">${(r.ownerDues || 0).toLocaleString('ar-EG')} ج.م</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  },

  async setSalesGroupBy(mode) {
    this.salesGroupBy = mode;
    const qParams = new URLSearchParams();
    if (this.timeRange) qParams.set('timeRange', this.timeRange);
    if (this.startDate) qParams.set('startDate', this.startDate);
    if (this.endDate) qParams.set('endDate', this.endDate);
    qParams.set('groupBy', mode);

    const res = await API.get(`/accounting/reports/sales?${qParams.toString()}`);
    this.salesReports = res.reports || [];
    this.renderUI();
  },

  // 3. Merchants Accounts & Dues Tab (حسابات ومستحقات التجار)
  renderMerchantsTab() {
    const list = this.filteredMerchantsList || this.merchantsReport;
    return `
      <div class="space-y-4">
        <div class="flex items-center justify-between flex-wrap gap-3 pb-3 border-b border-slate-200">
          <div>
            <h4 class="font-extrabold text-slate-800 text-sm flex items-center gap-2">
              <i class="fa-solid fa-store text-emerald-600"></i>
              <span>حسابات ومستحقات التجار التفصيلية وتتبع الصرف</span>
            </h4>
            <p class="text-xs text-slate-500 mt-0.5">التاجر مستحق سعر التكلفة فقط، والفرق ربح المتجر. متابعة المصروف والمتبقي للصرف</p>
          </div>

          <div class="flex items-center gap-2 flex-wrap">
            <div class="relative">
              <input 
                type="text" 
                id="merchant-acc-search" 
                placeholder="ابحث باسم أو كود التاجر..." 
                class="form-control text-xs w-64 pr-8 font-bold" 
                oninput="AccountingAdmin.filterMerchants(this.value)" 
              />
              <i class="fa-solid fa-magnifying-glass absolute right-2.5 top-2.5 text-slate-400 text-xs"></i>
            </div>
            <span class="text-xs font-bold bg-emerald-50 text-emerald-800 border border-emerald-200 px-3 py-1.5 rounded-xl">
              عدد التجار: ${list.length}
            </span>
          </div>
        </div>

        <div class="overflow-x-auto rounded-xl border border-slate-200">
          <table class="w-full text-right text-xs">
            <thead class="bg-slate-50 text-slate-700 font-extrabold border-b border-slate-200">
              <tr>
                <th class="py-3 px-3">كود التاجر</th>
                <th class="py-3 px-3">اسم التاجر</th>
                <th class="py-3 px-3 text-center">المنتجات والطلبات</th>
                <th class="py-3 px-3 text-center">إجمالي المبيعات</th>
                <th class="py-3 px-3 text-center">التكلفة (حق التاجر)</th>
                <th class="py-3 px-3 text-center">ربح المتجر</th>
                <th class="py-3 px-3 text-center">مستحقاته في الفترة</th>
                <th class="py-3 px-3 text-center">المصروف (المدفوع)</th>
                <th class="py-3 px-3 text-center">المتبقي للصرف</th>
                <th class="py-3 px-3 text-center">الحالة</th>
                <th class="py-3 px-3 text-center no-print">الإجراءات</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100 bg-white">
              ${list.length === 0 ? `
                <tr><td colspan="11" class="py-8 text-center text-slate-400 font-bold">لا يوجد تجار مطابقين لخيارات البحث</td></tr>
              ` : list.map(m => `
                <tr class="hover:bg-slate-50/70 transition">
                  <td class="py-3 px-3 font-mono font-black text-emerald-700">${m.code}</td>
                  <td class="py-3 px-3 font-bold text-slate-800">
                    <button type="button" onclick="AccountingAdmin.openMerchantHistoryModal('${m.id}')" class="text-slate-900 hover:text-emerald-600 font-extrabold transition flex items-center gap-1.5 cursor-pointer text-right" title="عرض السجل المالي الكامل للتاجر">
                      <span>${m.name}</span>
                      <i class="fa-solid fa-up-right-from-square text-[10px] text-slate-400"></i>
                    </button>
                    <div class="text-[10px] text-slate-400 font-mono">${m.phone || ''}</div>
                  </td>
                  <td class="py-3 px-3 text-center">
                    <span class="font-bold text-slate-700">${m.productsCount || 0} منتج</span>
                    <span class="text-[10px] text-slate-400 block">${m.totalDeliveredOrders || 0} طلب مسلم</span>
                  </td>
                  <td class="py-3 px-3 text-center font-black text-slate-900">${(m.grossSales || 0).toLocaleString('ar-EG')} ج.م</td>
                  <td class="py-3 px-3 text-center font-bold text-slate-700">${(m.costOfSold || 0).toLocaleString('ar-EG')} ج.م</td>
                  <td class="py-3 px-3 text-center font-bold text-emerald-600">${(m.storeProfit || 0).toLocaleString('ar-EG')} ج.م</td>
                  <td class="py-3 px-3 text-center font-black text-slate-900">${(m.merchantDues || 0).toLocaleString('ar-EG')} ج.م</td>
                  <td class="py-3 px-3 text-center font-bold text-purple-700">${(m.totalPaid || 0).toLocaleString('ar-EG')} ج.م</td>
                  <td class="py-3 px-3 text-center font-black text-indigo-700 text-sm bg-indigo-50/30">
                    ${(m.remainingBalance || 0).toLocaleString('ar-EG')} ج.م
                  </td>
                  <td class="py-3 px-3 text-center">
                    <span class="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold ${m.remainingBalance <= 0 && m.merchantDues > 0 ? 'bg-emerald-50 text-emerald-700' : (m.remainingBalance > 0 ? 'bg-amber-50 text-amber-800' : 'bg-slate-100 text-slate-500')}">
                      ${m.payoutStatus || 'لا توجد مبيعات'}
                    </span>
                  </td>
                  <td class="py-3 px-3 text-center no-print">
                    <div class="flex items-center justify-center gap-1.5">
                      <button 
                        type="button" 
                        onclick="AccountingAdmin.openMerchantHistoryModal('${m.id}')" 
                        class="bg-slate-100 hover:bg-slate-200 text-slate-700 px-2 py-1 rounded-lg font-bold text-[11px] transition" 
                        title="عرض الملف المالي الكامل"
                      >
                        <i class="fa-solid fa-folder-open ml-1"></i> السجل
                      </button>

                      ${!this.isReadOnly && (m.remainingBalance > 0 || m.merchantDues > 0) ? `
                        <button 
                          type="button" 
                          onclick="AccountingAdmin.openPayoutModal('${m.id}')" 
                          class="bg-emerald-600 hover:bg-emerald-700 text-white px-2.5 py-1 rounded-lg font-bold text-[11px] transition shadow-sm"
                          title="تسجيل صرف دفعة نقدية للتاجر"
                        >
                          <i class="fa-solid fa-money-bill-wave ml-1"></i> صرف
                        </button>
                      ` : ''}

                      ${!this.isReadOnly ? `
                        <button 
                          type="button" 
                          onclick="AccountingAdmin.deleteMerchant('${m.id}', '${encodeURIComponent(m.name || '')}', '${encodeURIComponent(m.code || '')}')" 
                          class="bg-red-50 hover:bg-red-100 text-red-600 px-2 py-1 rounded-lg font-bold text-[11px] transition border border-red-200 cursor-pointer" 
                          title="حذف هذا التاجر وحسابه بالكامل"
                        >
                          <i class="fa-solid fa-trash-can"></i>
                        </button>
                      ` : ''}
                    </div>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  },

  // 4. Merchant Collections Table (تحصيل التجار وتوريد الخزينة)
  renderCollectionsTab() {
    const list = this.filteredCollectionsList || this.collectionsReport;

    return `
      <div>
        <div class="flex items-center justify-between mb-4 flex-wrap gap-2">
          <div>
            <h4 class="font-extrabold text-slate-800 text-sm flex items-center gap-2">
              <i class="fa-solid fa-handshake text-emerald-600"></i>
              <span>جدول تحصيل التجار وتوريدات الخزينة</span>
            </h4>
            <p class="text-xs text-slate-500 mt-0.5">مطابقة المبالغ النقدية المحصلة لكل تاجر ومندوب مع المورد للخزينة وإدارة التجار</p>
          </div>

          <div class="flex items-center gap-2 flex-wrap">
            <div class="relative">
              <input 
                type="text" 
                id="collection-acc-search" 
                placeholder="ابحث باسم أو كود التاجر..." 
                class="form-control text-xs w-64 pr-8 font-bold" 
                oninput="AccountingAdmin.filterCollections(this.value)" 
              />
              <i class="fa-solid fa-magnifying-glass absolute right-2.5 top-2.5 text-slate-400 text-xs"></i>
            </div>
            <span class="text-xs font-bold bg-emerald-50 text-emerald-800 border border-emerald-200 px-3 py-1.5 rounded-xl">
              عدد التجار: ${list.length}
            </span>
          </div>
        </div>

        <div class="overflow-x-auto rounded-xl border border-slate-200">
          <table class="w-full text-right text-xs">
            <thead class="bg-slate-50 text-slate-700 font-extrabold border-b border-slate-200">
              <tr>
                <th class="py-3 px-3">التاجر المعني والمندوب</th>
                <th class="py-3 px-3 text-center">الطلبات</th>
                <th class="py-3 px-3 text-center">إجمالي المحصل</th>
                <th class="py-3 px-3 text-center">المورد للخزينة</th>
                <th class="py-3 px-3 text-center">المتبقي في العهدة</th>
                <th class="py-3 px-3 text-center">آخر تسليم</th>
                <th class="py-3 px-3 text-center no-print">الإجراءات</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100 bg-white">
              ${list.length === 0 ? `
                <tr><td colspan="7" class="py-8 text-center text-slate-400 font-bold">لا توجد حركات تحصيل مسجلة</td></tr>
              ` : list.map(col => `
                <tr class="hover:bg-slate-50/70 transition">
                  <td class="py-3 px-3">
                    <div class="font-black text-sm text-slate-900">${col.merchantName || 'تاجر عام'}</div>
                    <div class="text-[10px] text-slate-500 font-bold flex items-center gap-1 mt-0.5">
                      <i class="fa-solid fa-user-tag text-emerald-600"></i>
                      <span>المندوب: ${col.employeeName || 'مندوب التوصيل'}</span>
                      ${col.merchantCode ? `<span class="font-mono bg-slate-100 px-1 py-0.2 rounded text-[9px] text-slate-600">(${col.merchantCode})</span>` : ''}
                    </div>
                  </td>
                  <td class="py-3 px-3 text-center font-bold text-slate-700">${col.ordersCount || col.deliveredCount || 0}</td>
                  <td class="py-3 px-3 text-center font-black text-slate-800">${(col.cashToCollect || col.totalCollected || 0).toLocaleString('ar-EG')} ج.م</td>
                  <td class="py-3 px-3 text-center font-black text-emerald-700">${(col.remittedAmount || col.totalRemitted || 0).toLocaleString('ar-EG')} ج.م</td>
                  <td class="py-3 px-3 text-center font-black ${col.difference > 0 ? 'text-rose-700 bg-rose-50/50' : 'text-emerald-700'}">
                    ${(col.difference || 0).toLocaleString('ar-EG')} ج.م
                  </td>
                  <td class="py-3 px-3 text-center font-mono text-slate-500">
                    ${col.lastDeliveryAt ? new Date(col.lastDeliveryAt).toLocaleDateString('ar-EG') : '-'}
                  </td>
                  <td class="py-3 px-3 text-center no-print">
                    <div class="flex items-center justify-center gap-1.5 flex-wrap">
                      ${!this.isReadOnly ? `
                        <button 
                          type="button" 
                          onclick="AccountingAdmin.openRemitModal('${encodeURIComponent(col.employeeName || '')}', ${col.difference > 0 ? col.difference : 0})" 
                          class="bg-emerald-50 hover:bg-emerald-100 text-emerald-700 px-3 py-1.5 rounded-lg font-black text-[11px] border border-emerald-200 transition"
                          title="تسجيل توريد للخزينة"
                        >
                          تسجيل توريد
                        </button>
                        <button 
                          type="button" 
                          onclick="AccountingAdmin.deleteCollectionMerchant('${encodeURIComponent(col.id || '')}', '${encodeURIComponent(col.merchantCode || '')}', '${encodeURIComponent(col.merchantName || '')}')" 
                          class="bg-red-50 hover:bg-red-100 text-red-600 px-2.5 py-1.5 rounded-lg font-bold text-[11px] border border-red-200 transition flex items-center gap-1 cursor-pointer"
                          title="حذف هذا التاجر من تحصيل التجار وحسابات المحاسبة"
                        >
                          <i class="fa-solid fa-trash-can"></i>
                          <span>حذف التاجر</span>
                        </button>
                      ` : `
                        <span class="text-slate-400 font-bold text-[11px]">عرض فقط</span>
                      `}
                    </div>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  },

  // 3.5 Investors Accounts & Dues Tab (حسابات ومستحقات المستثمرين)
  renderInvestorsTab() {
    const list = this.filteredInvestorsList || this.investorsReport;
    const totalCap = list.reduce((sum, i) => sum + (Number(i.capital) || 0), 0);
    const totalSales = list.reduce((sum, i) => sum + (Number(i.grossSales) || 0), 0);
    const totalProfits = list.reduce((sum, i) => sum + (Number(i.netProfit) || 0), 0);
    const totalStoreProfit = list.reduce((sum, i) => sum + (Number(i.storeProfit) || 0), 0);
    const totalPaid = list.reduce((sum, i) => sum + (Number(i.totalPaid) || 0), 0);
    const totalRemaining = list.reduce((sum, i) => sum + (Number(i.remainingBalance) || 0), 0);

    return `
      <div class="space-y-4 text-right" dir="rtl">
        <div class="flex items-center justify-between flex-wrap gap-3 pb-3 border-b border-slate-200">
          <div>
            <h4 class="font-extrabold text-slate-800 text-sm flex items-center gap-2">
              <i class="fa-solid fa-briefcase text-blue-600"></i>
              <span>حسابات ومستحقات المستثمرين التفصيلية وتتبع الصرف</span>
            </h4>
            <p class="text-xs text-slate-500 mt-0.5">المستثمر بياخد سعر التكلفة + نسبته من الربح، والباقي ربح المتجر. متابعة رأس المال (بالدفعات)، المصروف، والمتبقي للصرف</p>
          </div>

          <div class="flex items-center gap-2 flex-wrap">
            <div class="relative">
              <input 
                type="text" 
                id="investor-acc-search" 
                placeholder="ابحث باسم أو كود المستثمر..." 
                class="form-control text-xs w-64 pr-8 font-bold" 
                oninput="AccountingAdmin.filterInvestors(this.value)" 
              />
              <i class="fa-solid fa-magnifying-glass absolute right-2.5 top-2.5 text-slate-400 text-xs"></i>
            </div>
            <span class="text-xs font-bold bg-blue-50 text-blue-800 border border-blue-200 px-3 py-1.5 rounded-xl">
              عدد المستثمرين: ${list.length}
            </span>
          </div>
        </div>

        <!-- Investors Financial Summary KPI Cards -->
        <div class="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <div class="bg-blue-50/70 border border-blue-200 p-3 rounded-xl text-center">
            <div class="text-[11px] font-bold text-blue-700">إجمالي رؤوس الأموال</div>
            <div class="text-base font-black text-blue-900 mt-1">${totalCap.toLocaleString('ar-EG')} ج.م</div>
          </div>
          <div class="bg-slate-50 border border-slate-200 p-3 rounded-xl text-center">
            <div class="text-[11px] font-bold text-slate-600">إجمالي المبيعات</div>
            <div class="text-base font-black text-slate-900 mt-1">${totalSales.toLocaleString('ar-EG')} ج.م</div>
          </div>
          <div class="bg-emerald-50/70 border border-emerald-200 p-3 rounded-xl text-center">
            <div class="text-[11px] font-bold text-emerald-700">أرباح المستثمرين / ربح المتجر</div>
            <div class="text-base font-black text-emerald-800 mt-1">${totalProfits.toLocaleString('ar-EG')} / ${totalStoreProfit.toLocaleString('ar-EG')} ج.م</div>
          </div>
          <div class="bg-purple-50/70 border border-purple-200 p-3 rounded-xl text-center">
            <div class="text-[11px] font-bold text-purple-700">المصروف (المدفوع)</div>
            <div class="text-base font-black text-purple-800 mt-1">${totalPaid.toLocaleString('ar-EG')} ج.م</div>
          </div>
          <div class="bg-amber-50/70 border border-amber-200 p-3 rounded-xl text-center">
            <div class="text-[11px] font-bold text-amber-800">الرصيد المتبقي للصرف</div>
            <div class="text-base font-black text-amber-900 mt-1">${totalRemaining.toLocaleString('ar-EG')} ج.م</div>
          </div>
        </div>

        <!-- Table -->
        <div class="overflow-x-auto rounded-xl border border-slate-200">
          <table class="w-full text-right text-xs">
            <thead class="bg-slate-50 text-slate-700 font-extrabold border-b border-slate-200">
              <tr>
                <th class="py-3 px-3">كود المستثمر</th>
                <th class="py-3 px-3">اسم المستثمر</th>
                <th class="py-3 px-3 text-center">رأس المال</th>
                <th class="py-3 px-3 text-center">المنتجات والطلبات</th>
                <th class="py-3 px-3 text-center">إجمالي المبيعات</th>
                <th class="py-3 px-3 text-center">تكلفة المباع</th>
                <th class="py-3 px-3 text-center">نصيبه من الربح</th>
                <th class="py-3 px-3 text-center">ربح المتجر</th>
                <th class="py-3 px-3 text-center">المصروف (المدفوع)</th>
                <th class="py-3 px-3 text-center">المتبقي للصرف</th>
                <th class="py-3 px-3 text-center">الحالة</th>
                <th class="py-3 px-3 text-center no-print">الإجراءات</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100 bg-white">
              ${list.length === 0 ? `
                <tr><td colspan="12" class="py-8 text-center text-slate-400 font-bold">لا يوجد مستثمرون مطابقون لخيارات البحث</td></tr>
              ` : list.map(inv => `
                <tr class="hover:bg-slate-50/70 transition">
                  <td class="py-3 px-3 font-mono font-black text-blue-700">${inv.code}</td>
                  <td class="py-3 px-3 font-bold text-slate-800">
                    <button type="button" onclick="AccountingAdmin.openInvestorHistoryModal('${inv.id}')" class="text-slate-900 hover:text-blue-600 font-extrabold transition flex items-center gap-1.5 cursor-pointer text-right" title="عرض السجل المالي الكامل للمستثمر">
                      <span>${inv.name}</span>
                      <i class="fa-solid fa-up-right-from-square text-[10px] text-slate-400"></i>
                    </button>
                    <div class="text-[10px] text-slate-400 font-mono">${inv.phone || ''}</div>
                  </td>
                  <td class="py-3 px-3 text-center font-black text-blue-800">${(inv.capital || 0).toLocaleString('ar-EG')} ج.م<span class="block text-[10px] text-slate-400 font-bold">${(inv.capitalBatches || []).length} دفعة — مسترد ${inv.capitalRecoveryPercent || 0}%</span></td>
                  <td class="py-3 px-3 text-center">
                    <span class="font-bold text-slate-700">${inv.productsCount || 0} منتج</span>
                    <span class="text-[10px] text-slate-400 block">${inv.totalDeliveredOrders || 0} طلب مسلم</span>
                  </td>
                  <td class="py-3 px-3 text-center font-black text-slate-900">${(inv.grossSales || 0).toLocaleString('ar-EG')} ج.م</td>
                  <td class="py-3 px-3 text-center font-bold text-slate-600">${(inv.totalCostOfSold || 0).toLocaleString('ar-EG')} ج.م</td>
                  <td class="py-3 px-3 text-center font-black text-emerald-700">${(inv.netProfit || 0).toLocaleString('ar-EG')} ج.م<span class="block text-[10px] text-slate-400">${inv.profitSharePercent ?? 50}% من الربح</span></td>
                  <td class="py-3 px-3 text-center font-bold text-purple-700">${(inv.storeProfit || 0).toLocaleString('ar-EG')} ج.م</td>
                  <td class="py-3 px-3 text-center font-bold text-purple-700">${(inv.totalPaid || 0).toLocaleString('ar-EG')} ج.م</td>
                  <td class="py-3 px-3 text-center font-black text-indigo-700 text-sm bg-indigo-50/30">
                    ${(inv.remainingBalance || 0).toLocaleString('ar-EG')} ج.م
                  </td>
                  <td class="py-3 px-3 text-center">
                    <span class="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold ${inv.remainingBalance <= 0 && inv.investorDues > 0 ? 'bg-emerald-50 text-emerald-700' : (inv.remainingBalance > 0 ? 'bg-amber-50 text-amber-800' : 'bg-slate-100 text-slate-500')}">
                      ${inv.payoutStatus || 'لا توجد مبيعات'}
                    </span>
                  </td>
                  <td class="py-3 px-3 text-center no-print">
                    <div class="flex items-center justify-center gap-1.5">
                      <button 
                        type="button" 
                        onclick="AccountingAdmin.openInvestorHistoryModal('${inv.id}')" 
                        class="bg-slate-100 hover:bg-slate-200 text-slate-700 px-2 py-1 rounded-lg font-bold text-[11px] transition cursor-pointer" 
                        title="عرض الملف المالي الكامل"
                      >
                        <i class="fa-solid fa-folder-open ml-1 text-blue-600"></i> السجل
                      </button>

                      ${!this.isReadOnly && (inv.remainingBalance > 0 || inv.investorDues > 0) ? `
                        <button 
                          type="button" 
                          onclick="AccountingAdmin.openInvestorPayoutModal('${inv.id}')" 
                          class="bg-blue-600 hover:bg-blue-700 text-white px-2.5 py-1 rounded-lg font-bold text-[11px] transition shadow-sm cursor-pointer"
                          title="تسجيل صرف دفعة نقدية للمستثمر"
                        >
                          <i class="fa-solid fa-money-bill-wave ml-1"></i> صرف دفعة
                        </button>
                      ` : ''}
                    </div>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  },

  filterInvestors(val) {
    if (!val || !val.trim()) {
      this.filteredInvestorsList = null;
    } else {
      const q = val.trim().toLowerCase();
      this.filteredInvestorsList = this.investorsReport.filter(inv => 
        inv.name.toLowerCase().includes(q) || 
        inv.code.toLowerCase().includes(q) || 
        (inv.phone && inv.phone.includes(q))
      );
    }
    const container = document.getElementById('accounting-print-area');
    if (container && this.currentTab === 'investors') {
      container.innerHTML = this.renderInvestorsTab();
    }
  },

  openInvestorPayoutModal(investorId) {
    if (this.isReadOnly) {
      App.showToast('صرف مستحقات المستثمرين متاح للمحاسب المالي فقط', 'warning');
      return;
    }
    const inv = this.investorsReport.find(item => item.id === investorId);
    if (!inv) return;

    const body = `
      <form onsubmit="AccountingAdmin.submitInvestorPayout(event, '${inv.id}')" class="text-right space-y-3" dir="rtl">
        <div class="bg-blue-50 border border-blue-200 p-3.5 rounded-xl">
          <div class="flex items-center justify-between mb-1">
            <span class="font-extrabold text-sm text-blue-950">${inv.name}</span>
            <span class="font-mono font-bold bg-white px-2 py-0.5 rounded text-xs text-blue-700">${inv.code}</span>
          </div>
          <div class="grid grid-cols-3 gap-2 text-center text-xs mt-2 pt-2 border-t border-blue-200">
            <div>
              <div class="text-[10px] text-slate-500">رأس المال</div>
              <div class="font-bold text-slate-800">${(inv.capital || 0).toLocaleString('ar-EG')} ج.م</div>
            </div>
            <div>
              <div class="text-[10px] text-slate-500">المصروف سابقاً</div>
              <div class="font-bold text-purple-700">${(inv.totalPaid || 0).toLocaleString('ar-EG')} ج.م</div>
            </div>
            <div>
              <div class="text-[10px] text-blue-700 font-bold">الرصيد المتبقي</div>
              <div class="font-black text-emerald-700">${(inv.remainingBalance || 0).toLocaleString('ar-EG')} ج.م</div>
            </div>
          </div>
        </div>

        <div class="form-group">
          <label class="form-label text-xs font-bold text-slate-700">المبلغ المراد صرفه للمستثمر (ج.م) *</label>
          <input 
            type="text" 
            id="inv-payout-amount" 
            class="form-control text-sm font-black text-blue-700" 
            value="${inv.remainingBalance > 0 ? inv.remainingBalance : ''}" 
            placeholder="0.00" 
            required 
          />
          <div class="text-[11px] text-slate-400 mt-1">يقبل الأرقام باللغة العربية أو الإنجليزية</div>
        </div>

        <div class="form-group">
          <label class="form-label text-xs font-bold text-slate-700">طريقة الدفع والتسليم</label>
          <select id="inv-payout-method" class="form-control text-xs font-bold">
            <option value="cash">نقداً (كاش)</option>
            <option value="bank_transfer">تحويل بنكي</option>
            <option value="vodafone_cash">فودافون كاش / محفظة إلكترونية</option>
            <option value="cheque">شيك مصرفي</option>
          </select>
        </div>

        <div class="form-group">
          <label class="form-label text-xs font-bold text-slate-700">رقم الإيصال / السند أو المرجع (اختياري)</label>
          <input type="text" id="inv-payout-receipt" class="form-control text-xs font-mono" placeholder="مثال: INV-RCP-1029" />
        </div>

        <div class="form-group">
          <label class="form-label text-xs font-bold text-slate-700">ملاحظات الصرف والبيان</label>
          <textarea id="inv-payout-notes" class="form-control text-xs" rows="2" placeholder="صرف دفعة من عوائد أو استرداد رأس مال المستثمر..."></textarea>
        </div>

        <div class="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
          <button type="button" onclick="App.closeModal()" class="btn btn-secondary text-xs px-4 py-2 cursor-pointer">
            إلغاء
          </button>
          <button type="submit" class="bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-xs px-6 py-2.5 rounded-xl shadow transition cursor-pointer">
            تأكيد تسجيل صرف الدفعة للمستثمر
          </button>
        </div>
      </form>
    `;
    App.openModal(`صرف دفعة مالية للمستثمر: ${inv.name}`, body);
  },

  async submitInvestorPayout(e, investorId) {
    e.preventDefault();
    const rawAmount = document.getElementById('inv-payout-amount')?.value;
    const amount = typeof Utils !== 'undefined' ? Utils.parseNumber(rawAmount) : Number(rawAmount);
    const paymentMethod = document.getElementById('inv-payout-method')?.value || 'cash';
    const receiptNumber = document.getElementById('inv-payout-receipt')?.value?.trim();
    const notes = document.getElementById('inv-payout-notes')?.value?.trim();

    if (!amount || isNaN(amount) || amount <= 0) {
      App.showToast('يُرجى إدخال مبلغ صحيح للصرف', 'warning');
      return;
    }

    try {
      const res = await API.post(`/accounting/investors/${investorId}/payout`, {
        amount,
        paymentMethod,
        receiptNumber,
        notes
      });
      if (res.success) {
        App.showToast(res.message || 'تم تسجيل صرف الدفعة للمستثمر بنجاح!', 'success');
        App.closeModal();
        this.loadAllData();
      } else {
        App.showToast(res.message || 'فشل تسجيل الصرف', 'error');
      }
    } catch (err) {
      App.showToast(err.message || 'حدث خطأ في صرف الدفعة', 'error');
    }
  },

  async openInvestorHistoryModal(investorId) {
    try {
      App.showToast('جاري جلب السجل الكامل للمستثمر...', 'info');
      const res = await API.get(`/accounting/investors/${investorId}/history`);
      if (!res.success) throw new Error(res.message || 'فشل الجلب');

      const inv = res.investor;
      const s = res.summary;
      const prods = res.products || [];
      const orders = res.orders || [];
      const payouts = res.payouts || [];
      const expenses = res.expenses || [];

      const body = `
        <div class="space-y-4 text-right" dir="rtl">
          <!-- Top KPI Cards -->
          <div class="grid grid-cols-2 sm:grid-cols-5 gap-2 text-center text-xs">
            <div class="bg-blue-50 border border-blue-200 p-2.5 rounded-xl">
              <div class="text-[10px] text-blue-800 font-bold">رأس المال المدخل</div>
              <div class="text-sm font-black text-blue-900">${(s.capital || 0).toLocaleString('ar-EG')} ج.م</div>
              <div class="text-[9px] text-blue-600 font-semibold">${s.productsCount || 0} منتجات ممولة</div>
            </div>
            <div class="bg-slate-50 border border-slate-200 p-2.5 rounded-xl">
              <div class="text-[10px] text-slate-500 font-bold">إجمالي المبيعات</div>
              <div class="text-sm font-black text-slate-900">${(s.grossSales || 0).toLocaleString('ar-EG')} ج.م</div>
              <div class="text-[9px] text-slate-400 font-semibold">${s.deliveredOrdersCount || 0} طلب (${s.totalUnitsSold || 0} قطعة)</div>
            </div>
            <div class="bg-rose-50 border border-rose-200 p-2.5 rounded-xl">
              <div class="text-[10px] text-rose-800 font-bold">المصروفات المشتركة (حصته)</div>
              <div class="text-sm font-black text-rose-700">${(s.totalExpenses || 0).toLocaleString('ar-EG')} ج.م</div>
              <div class="text-[9px] text-rose-500 font-semibold">${expenses.length} بنود مسجلة</div>
            </div>
            <div class="bg-emerald-50 border border-emerald-200 p-2.5 rounded-xl">
              <div class="text-[10px] text-emerald-800 font-bold">نصيبه من الربح (${s.profitSharePercent ?? 50}%)</div>
              <div class="text-sm font-black text-emerald-700">${(s.netProfit || 0).toLocaleString('ar-EG')} ج.م</div>
              <div class="text-[9px] text-emerald-600 font-semibold">ربح المتجر: ${(s.storeProfit || 0).toLocaleString('ar-EG')} ج.م</div>
            </div>
            <div class="bg-purple-50 border border-purple-200 p-2.5 rounded-xl">
              <div class="text-[10px] text-purple-800 font-bold">المصروف (المدفوع)</div>
              <div class="text-sm font-black text-purple-700">${(s.totalPaid || 0).toLocaleString('ar-EG')} ج.م</div>
              <div class="text-[9px] text-purple-500 font-semibold">${payouts.length} دفعات مسجلة</div>
            </div>
          </div>

          ${(res.capitalBatches || []).length ? `
          <div class="border border-blue-200 rounded-xl overflow-hidden">
            <div class="bg-blue-50 px-3 py-2 text-xs font-extrabold text-blue-900">دفعات رأس المال (كل دفعة تتحسب لوحدها)</div>
            <table class="w-full text-[11px]">
              <thead class="bg-white text-slate-500"><tr><th class="p-2 text-right">الدفعة</th><th class="p-2">المبلغ</th><th class="p-2">مسترد (بالتكلفة)</th><th class="p-2">نسبة الاسترداد</th><th class="p-2">نصيبه من الربح</th></tr></thead>
              <tbody class="divide-y divide-slate-100">
                ${res.capitalBatches.map(b => `<tr><td class="p-2 font-bold">${b.label}<span class="block text-[9px] text-slate-400">${b.createdAt ? new Date(b.createdAt).toLocaleDateString('ar-EG') : ''}</span></td><td class="p-2 text-center font-black text-blue-800">${(b.amount || 0).toLocaleString('ar-EG')}</td><td class="p-2 text-center">${(b.costRecovered || 0).toLocaleString('ar-EG')}</td><td class="p-2 text-center font-bold">${b.recoveryPercent || 0}%</td><td class="p-2 text-center text-emerald-700 font-bold">${(b.investorProfit || 0).toLocaleString('ar-EG')}</td></tr>`).join('')}
              </tbody>
            </table>
          </div>` : ''}
          <!-- Balance Banner -->
          <div class="bg-gradient-to-r from-blue-700 to-indigo-800 text-white p-3.5 rounded-xl flex items-center justify-between">
            <div>
              <div class="text-xs opacity-80">الرصيد المتبقي المستحق للمستثمر:</div>
              <div class="text-xl font-black mt-0.5">${(s.remainingBalance || 0).toLocaleString('ar-EG')} ج.م</div>
            </div>
            ${!this.isReadOnly && s.remainingBalance > 0 ? `
              <button type="button" onclick="App.closeModal(); AccountingAdmin.openInvestorPayoutModal('${inv.id}')" class="bg-white text-blue-800 hover:bg-blue-50 font-black text-xs px-4 py-2 rounded-xl transition shadow cursor-pointer">
                صرف دفعة الآن &larr;
              </button>
            ` : ''}
          </div>

          <!-- Section 1: Payouts Timeline -->
          <div class="border border-slate-200 rounded-xl overflow-hidden">
            <div class="bg-slate-100 px-3.5 py-2 font-bold text-xs text-slate-800 flex items-center justify-between">
              <span><i class="fa-solid fa-receipt text-blue-600 ml-1"></i> سجل الدفعات المصروفة للمستثمر (${payouts.length})</span>
            </div>
            <div class="max-h-48 overflow-y-auto divide-y divide-slate-100 text-xs">
              ${payouts.length === 0 ? `
                <div class="p-4 text-center text-slate-400">لم يتم تسجيل أي دفعات مصروفة لهذا المستثمر بعد</div>
              ` : payouts.map(p => `
                <div class="p-3 flex items-center justify-between hover:bg-slate-50 transition">
                  <div>
                    <div class="font-extrabold text-slate-900">${(Number(p.amount) || 0).toLocaleString('ar-EG')} ج.م</div>
                    <div class="text-[10px] text-slate-400 font-mono">${new Date(p.createdAt).toLocaleDateString('ar-EG')} • إيصال: ${p.receiptNumber || '-'} • طريقة: ${p.paymentMethod || 'cash'}</div>
                    ${p.notes ? `<div class="text-[10px] text-slate-500 mt-0.5">${p.notes}</div>` : ''}
                  </div>
                  <div class="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
                    بواسطة: ${p.recordedBy || 'المحاسب'}
                  </div>
                </div>
              `).join('')}
            </div>
          </div>

          <!-- Section 2: Shared Expenses & Revenues -->
          <div class="border border-slate-200 rounded-xl overflow-hidden">
            <div class="bg-slate-100 px-3.5 py-2 font-bold text-xs text-slate-800 flex items-center justify-between">
              <span><i class="fa-solid fa-file-invoice text-rose-600 ml-1"></i> المصروفات والإيرادات المشتركة للمستثمر (${expenses.length})</span>
              <span class="text-[10px] text-slate-500 font-bold">تتقاسم بين المتجر والمستثمر بنسبة محددة</span>
            </div>
            <div class="max-h-48 overflow-y-auto divide-y divide-slate-100 text-xs">
              ${expenses.length === 0 ? `
                <div class="p-4 text-center text-slate-400">لا توجد بنود مصروفات أو إيرادات مشتركة مسجلة على هذا المستثمر</div>
              ` : expenses.map(exp => `
                <div class="p-3 flex items-center justify-between hover:bg-slate-50 transition">
                  <div>
                    <div class="font-extrabold text-slate-900 flex items-center gap-2">
                      <span>${exp.title}</span>
                      <span class="text-[10px] px-2 py-0.5 rounded font-bold ${exp.type === 'revenue' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}">
                        ${exp.type === 'revenue' ? '📈 إيراد' : '📉 مصروف'}
                      </span>
                    </div>
                    <div class="text-[10px] text-slate-400 font-mono mt-0.5">
                      التاريخ: ${new Date(exp.date || exp.createdAt).toLocaleDateString('ar-EG')} • الإجمالي: ${(exp.amount || 0).toLocaleString('ar-EG')} ج.م • النسبة: ${exp.investorSharePercent !== undefined ? exp.investorSharePercent : 50}%
                    </div>
                    ${exp.notes ? `<div class="text-[10px] text-slate-500 mt-0.5">${exp.notes}</div>` : ''}
                  </div>
                  <div class="text-left">
                    <div class="text-xs font-black ${exp.type === 'revenue' ? 'text-emerald-700' : 'text-rose-700'}">
                      حصة المستثمر: ${(exp.investorShare || (exp.amount * (exp.investorSharePercent || 50) / 100) || 0).toLocaleString('ar-EG')} ج.م
                    </div>
                  </div>
                </div>
              `).join('')}
            </div>
          </div>

          <!-- Section 2: Products Funded by Investor -->
          <div class="border border-slate-200 rounded-xl overflow-hidden">
            <div class="bg-slate-100 px-3.5 py-2 font-bold text-xs text-slate-800 flex items-center justify-between">
              <span><i class="fa-solid fa-box-open text-blue-600 ml-1"></i> المنتجات الممولة برأس مال المستثمر (${prods.length})</span>
            </div>
            <div class="max-h-48 overflow-y-auto divide-y divide-slate-100 text-xs">
              ${prods.length === 0 ? `
                <div class="p-4 text-center text-slate-400">لا توجد منتجات مربوطة بهذا المستثمر</div>
              ` : prods.map(pr => `
                <div class="p-2.5 flex items-center justify-between hover:bg-slate-50">
                  <div class="flex items-center gap-2">
                    <img src="${pr.image || '/images/no-image.svg'}" class="w-9 h-9 rounded-lg object-cover border border-slate-200" />
                    <div>
                      <div class="font-bold text-slate-900">${pr.title}</div>
                      <div class="text-[10px] text-slate-400">سعر البيع: ${pr.price} ج.م • سعر التكلفة: ${pr.costPrice !== undefined ? pr.costPrice : '—'} ج.م • المخزون: ${pr.stock}</div>
                    </div>
                  </div>
                  <div class="text-left font-black text-emerald-700">
                    <div>${pr.salesCount || 0} مبيعات</div>
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
        </div>
      `;

      App.openModal(`الملف المالي للمستثمر: ${inv.name} (${inv.code})`, body);
    } catch (err) {
      App.showToast(err.message || 'فشل جلب ملف المستثمر', 'error');
    }
  },

  // Modal: Add or Edit Expense/Revenue
  async openExpenseModal(id = null) {
    if (this.isReadOnly) {
      App.showToast('حسابك بصلاحية مشاهدة فقط', 'warning');
      return;
    }
    // The category list comes from the accounting settings (editable in "دفتر الحركات والشهور")
    if (!this.expenseCategories) {
      try { this.expenseCategories = (await API.get('/accounting/expense-categories')).categories; } catch (e) { this.expenseCategories = ['أخرى']; }
    }

    this.editingExpenseId = id;
    const existing = id ? this.expensesReport.find(e => e.id === id) : null;
    const initialPercent = (existing && existing.investorSharePercent !== undefined) ? existing.investorSharePercent : 50;
    const isInvestorTarget = Boolean(existing && (existing.targetType === 'investor' || existing.investorId));

    const modalBody = `
      <form onsubmit="AccountingAdmin.submitExpense(event)" class="text-right space-y-3" dir="rtl">
        <div class="form-group">
          <label class="form-label text-xs font-bold text-slate-700">نوع البند المالي *</label>
          <div class="grid grid-cols-2 gap-2">
            <label class="flex items-center gap-2 p-2 rounded-xl border border-slate-200 cursor-pointer hover:bg-slate-50">
              <input type="radio" name="expense-type" value="expense" ${!existing || existing.type === 'expense' ? 'checked' : ''} class="accent-rose-600" />
              <span class="text-xs font-bold text-rose-700">📉 مصروف (خصم)</span>
            </label>
            <label class="flex items-center gap-2 p-2 rounded-xl border border-slate-200 cursor-pointer hover:bg-slate-50">
              <input type="radio" name="expense-type" value="revenue" ${existing && existing.type === 'revenue' ? 'checked' : ''} class="accent-emerald-600" />
              <span class="text-xs font-bold text-emerald-700">📈 إيراد (إضافة)</span>
            </label>
          </div>
        </div>

        <div class="form-group">
          <label class="form-label text-xs font-bold text-slate-700">عنوان أو وصف البند *</label>
          <input type="text" id="exp-title" class="form-control text-xs font-bold" value="${existing ? existing.title : ''}" placeholder="مثال: فاتورة كراتين شحن وتغليف" required />
        </div>

        <div class="grid grid-cols-2 gap-2">
          <div class="form-group">
            <label class="form-label text-xs font-bold text-slate-700">المبلغ الإجمالي (ج.م) *</label>
            <input 
              type="number" 
              id="exp-amount" 
              oninput="AccountingAdmin.calcInvestorSharePreview()" 
              class="form-control text-xs font-black text-slate-800" 
              value="${existing ? existing.amount : ''}" 
              min="0.1" 
              step="0.5" 
              placeholder="0.00" 
              required 
            />
          </div>
          <div class="form-group">
            <label class="form-label text-xs font-bold text-slate-700">التصنيف *</label>
            <select id="exp-category" class="form-control text-xs font-bold">
              ${(this.expenseCategories || ['أخرى']).filter(c => c !== 'مرتبات' || (existing && existing.category === 'مرتبات')).map(c => `<option value="${String(c).replace(/"/g, '&quot;')}" ${(existing ? existing.category === c : c === 'أخرى') ? 'selected' : ''}>${String(c).replace(/</g, '&lt;')}</option>`).join('')}
            </select>
            <p class="text-[10px] text-slate-400 mt-1">المرتبات بتتسجل لوحدها من صفحة "الموظفين والمرتبات".</p>
          </div>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div class="form-group">
            <label class="form-label text-xs font-bold text-slate-700">تاريخ القيد</label>
            <input type="date" id="exp-date" class="form-control text-xs font-bold" value="${existing && existing.date ? existing.date.split('T')[0] : new Date().toISOString().split('T')[0]}" />
          </div>
          <div class="form-group">
            <label class="form-label text-xs font-bold text-slate-700">ربط البند بتاجر أو مستثمر</label>
            <select id="exp-target" onchange="AccountingAdmin.onExpenseTargetChange(this.value)" class="form-control text-xs font-bold">
              <option value="general" ${(!existing || (!existing.merchantId && !existing.investorId) || existing.targetType === 'general') ? 'selected' : ''}>
                🌐 عام لمتجر سوقي ستور (غير مربوط بأحد)
              </option>
              <optgroup label="💼 التجار المسجلين (${this.merchantsReport.length})">
                ${this.merchantsReport.map(m => `
                  <option 
                    value="merchant:${m.id}" 
                    data-type="merchant" 
                    data-id="${m.id}" 
                    data-name="${m.name || ''}" 
                    data-code="${m.code || ''}" 
                    ${(existing && (existing.merchantId === m.id || (existing.targetType === 'merchant' && existing.merchantId === m.id))) ? 'selected' : ''}>
                    💼 تاجر: ${m.name} (${m.code})
                  </option>
                `).join('')}
              </optgroup>
              <optgroup label="🤝 المستثمرين المسجلين (${this.investorsReport.length})">
                ${this.investorsReport.map(inv => `
                  <option 
                    value="investor:${inv.id}" 
                    data-type="investor" 
                    data-id="${inv.id}" 
                    data-name="${inv.name || ''}" 
                    data-code="${inv.code || ''}"
                    data-share="${inv.profitSharePercent ?? ''}"
                    ${(existing && (existing.investorId === inv.id || (existing.targetType === 'investor' && existing.investorId === inv.id))) ? 'selected' : ''}>
                    🤝 مستثمر: ${inv.name} (${inv.code})
                  </option>
                `).join('')}
              </optgroup>
            </select>
          </div>
        </div>

        <!-- Investor Split Setting (Shown dynamically when an investor is selected) -->
        <div id="investor-share-box" class="${isInvestorTarget ? '' : 'hidden'} bg-blue-50/90 border border-blue-200 p-3 rounded-xl space-y-2">
          <div class="flex items-center justify-between text-xs font-bold text-blue-900">
            <span class="flex items-center gap-1.5">
              <i class="fa-solid fa-calculator text-blue-600"></i>
              <span>نسبة تقاسم المصروف / الإيراد مع المستثمر</span>
            </span>
            <span id="investor-share-preview" class="text-blue-800 font-mono font-black text-xs">
              حصة المستثمر: 0 ج.م
            </span>
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 items-center">
            <div>
              <div class="flex items-center gap-1.5">
                <input 
                  type="number" 
                  id="exp-investor-percent" 
                  oninput="AccountingAdmin.calcInvestorSharePreview()" 
                  min="1" 
                  max="100" 
                  step="1" 
                  value="${initialPercent}"
                  readonly
                  data-locked="${existing && existing.investorSharePercent !== undefined && existing.investorSharePercent !== null ? '1' : ''}"
                  class="form-control text-xs font-black text-blue-900 bg-slate-100 cursor-not-allowed"
                />
                <span class="text-xs font-bold text-blue-700">%</span>
              </div>
              <p class="text-[10px] text-blue-600 mt-1">بتتحدد لوحدها = نسبة المستثمر في الربح (بتتعدل من صفحة المستثمرين)</p>
            </div>
            <div class="text-[11px] text-blue-950 bg-white/80 p-2 rounded-lg border border-blue-200/70 leading-relaxed">
              💡 المصروف يتقاسمه المتجر والمستثمر ويخصم بعد حساب صافي الأرباح في كشف حسابه.
            </div>
          </div>
          <div>
            <label class="text-[11px] font-bold text-blue-900">على أنهي دفعة رأس مال؟ (اختياري)</label>
            <select id="exp-batch" class="form-control text-xs mt-1" data-current="${existing && existing.capitalBatchId ? existing.capitalBatchId : ''}">
              <option value="">مصروف عام على المستثمر (مش دفعة معينة)</option>
            </select>
          </div>
        </div>

        <div class="form-group">
          <label class="form-label text-xs font-bold text-slate-700">ملاحظات أو رقم الإيصال</label>
          <textarea id="exp-notes" class="form-control text-xs" rows="2" placeholder="ملاحظات توضيحية...">${existing ? (existing.notes || '') : ''}</textarea>
        </div>

        <div class="flex items-center justify-end gap-2 pt-2 border-t">
          <button type="button" onclick="App.closeModal()" class="btn btn-secondary text-xs px-4 py-2">إلغاء</button>
          <button type="submit" class="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-5 py-2 rounded-xl transition">
            ${existing ? 'حفظ التعديل' : 'تسجيل البند المالي'}
          </button>
        </div>
      </form>
    `;

    App.openModal(existing ? 'تعديل البند المالي' : 'تسجيل بند مالي جديد', modalBody);
    setTimeout(() => {
      this.calcInvestorSharePreview();
    }, 50);
  },

  onExpenseTargetChange(val) {
    const box = document.getElementById('investor-share-box');
    if (!box) return;
    if (val && val.startsWith('investor:')) {
      box.classList.remove('hidden');
      const input = document.getElementById('exp-investor-percent');
      if (input) input.dataset.locked = ''; // another investor → his own %
      this.calcInvestorSharePreview();
    } else {
      box.classList.add('hidden');
    }
  },

  // Fill the "which capital batch" list for the chosen investor
  fillExpenseBatches() {
    const select = document.getElementById('exp-target');
    const box = document.getElementById('exp-batch');
    if (!select || !box) return;
    const val = select.value || '';
    const inv = val.startsWith('investor:') ? (this.investorsReport || []).find(i => String(i.id) === val.slice(9)) : null;
    const current = box.dataset.current || box.value || '';
    const batches = inv && Array.isArray(inv.capitalBatches) ? inv.capitalBatches : [];
    box.innerHTML = '<option value="">مصروف عام على المستثمر (مش دفعة معينة)</option>' +
      batches.map(b => `<option value="${String(b.id).replace(/"/g, '&quot;')}" ${String(b.id) === String(current) ? 'selected' : ''}>${String(b.label || '').replace(/</g, '&lt;')} — ${(Number(b.amount) || 0).toLocaleString('ar-EG')} ج.م</option>`).join('');
  },

  calcInvestorSharePreview() {
    this.fillExpenseBatches();
    // The split always equals the chosen investor's profit share (an already-saved expense keeps its own %)
    const input = document.getElementById('exp-investor-percent');
    const select = document.getElementById('exp-target');
    const opt = select && select.options ? select.options[select.selectedIndex] : null;
    if (input && !input.dataset.locked && opt && opt.getAttribute('data-type') === 'investor' && opt.getAttribute('data-share') !== '') {
      input.value = opt.getAttribute('data-share');
    }
    const amt = Number(document.getElementById('exp-amount')?.value) || 0;
    const pct = Number(document.getElementById('exp-investor-percent')?.value) || 50;
    const share = Math.round(amt * (pct / 100) * 100) / 100;
    const prev = document.getElementById('investor-share-preview');
    if (prev) {
      prev.innerText = `حصة المستثمر (${pct}%): ${share.toLocaleString('ar-EG')} ج.م`;
    }
  },

  async submitExpense(e) {
    e.preventDefault();
    const type = document.querySelector('input[name="expense-type"]:checked')?.value || 'expense';
    const title = document.getElementById('exp-title')?.value.trim();
    const amount = Number(document.getElementById('exp-amount')?.value);
    const category = document.getElementById('exp-category')?.value;
    const date = document.getElementById('exp-date')?.value;
    const notes = document.getElementById('exp-notes')?.value.trim();

    const targetVal = document.getElementById('exp-target')?.value || 'general';
    let targetType = 'general';
    let merchantId = null;
    let merchantName = null;
    let merchantCode = null;
    let investorId = null;
    let investorName = null;
    let investorCode = null;
    let investorSharePercent = 50;

    if (targetVal.startsWith('merchant:')) {
      targetType = 'merchant';
      const opt = document.querySelector(`#exp-target option[value="${targetVal}"]`);
      merchantId = opt?.getAttribute('data-id') || targetVal.replace('merchant:', '');
      merchantName = opt?.getAttribute('data-name') || null;
      merchantCode = opt?.getAttribute('data-code') || null;
    } else if (targetVal.startsWith('investor:')) {
      targetType = 'investor';
      const opt = document.querySelector(`#exp-target option[value="${targetVal}"]`);
      investorId = opt?.getAttribute('data-id') || targetVal.replace('investor:', '');
      investorName = opt?.getAttribute('data-name') || null;
      investorCode = opt?.getAttribute('data-code') || null;
      investorSharePercent = Number(document.getElementById('exp-investor-percent')?.value) || 50;
    }

    if (!title || isNaN(amount) || amount <= 0) {
      App.showToast('يُرجى إدخال عنوان ومبلغ صحيح أكبر من صفر', 'warning');
      return;
    }

    const payload = {
      title,
      amount,
      type,
      category,
      date,
      targetType,
      merchantId,
      merchantName,
      merchantCode,
      investorId,
      investorName,
      investorCode,
      investorSharePercent,
      ...(targetType === 'investor' ? { capitalBatchId: (document.getElementById('exp-batch') || {}).value || '' } : {}),
      notes
    };

    try {
      let res;
      if (this.editingExpenseId) {
        res = await API.put(`/accounting/expenses/${this.editingExpenseId}`, payload);
      } else {
        res = await API.post('/accounting/expenses', payload);
      }

      if (res.success) {
        App.showToast(res.message || 'تم حفظ البند بنجاح', 'success');
        App.closeModal();
        this.loadAllData();
      } else {
        App.showToast(res.message || 'فشل حفظ البند', 'error');
      }
    } catch (err) {
      App.showToast(err.message || 'حدث خطأ أثناء الحفظ', 'error');
    }
  },

  deleteExpense(id) {
    App.confirm('هل أنت متأكد من حذف هذا البند المالي نهائياً؟', async () => {
      try {
        const res = await API.delete(`/accounting/expenses/${id}`);
        if (res.success) {
          App.showToast(res.message || 'تم حذف البند بنجاح', 'success');
          this.loadAllData();
        } else {
          App.showToast(res.message || 'فشل الحذف', 'error');
        }
      } catch (err) {
        App.showToast(err.message || 'فشل حذف البند', 'error');
      }
    });
  },

  // Open Remittance Modal (Accountant Only)
  openRemitModal(prefillName = '', prefillAmount = 0) {
    if (this.isReadOnly) {
      App.showToast('تسجيل التوريد متاح فقط للمحاسب المالي', 'warning');
      return;
    }

    const decodedName = prefillName ? decodeURIComponent(prefillName) : '';

    const body = `
      <form onsubmit="AccountingAdmin.submitRemittance(event)" class="text-right" dir="rtl">
        <div class="form-group mb-3">
          <label class="form-label text-xs font-bold text-slate-700">اسم الموظف أو مندوب التوصيل *</label>
          <input 
            type="text" 
            id="remit-employee" 
            class="form-control text-xs font-bold" 
            value="${decodedName}" 
            placeholder="مثال: كابتن محمود (شركة الشحن السريع)" 
            required 
          />
        </div>

        <div class="form-group mb-3">
          <label class="form-label text-xs font-bold text-slate-700">المبلغ المورد للخزينة (ج.م) *</label>
          <input 
            type="number" 
            id="remit-amount" 
            class="form-control text-xs font-black text-emerald-700 text-base" 
            value="${prefillAmount > 0 ? prefillAmount : ''}" 
            placeholder="0.00" 
            min="1" 
            step="0.5" 
            required 
          />
          <span class="text-[10px] text-slate-400">سيتم خصم هذا المبلغ من عهدة الموظف وإضافته لمقبوضات الخزينة</span>
        </div>

        <div class="form-group mb-4">
          <label class="form-label text-xs font-bold text-slate-700">ملاحظات التوريد أو رقم الإيصال</label>
          <textarea id="remit-notes" class="form-control text-xs" rows="2" placeholder="رقم إيصال التوريد، تسوية عهدة..."></textarea>
        </div>

        <div class="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
          <button type="button" onclick="App.closeModal()" class="btn btn-secondary text-xs px-4 py-2">
            إلغاء
          </button>
          <button type="submit" class="bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs px-6 py-2.5 rounded-xl shadow transition">
            تأكيد التوريد للخزينة
          </button>
        </div>
      </form>
    `;

    App.openModal('تسجيل توريد نقدية إلى الخزينة', body);
  },

  async submitRemittance(e) {
    e.preventDefault();
    const employeeName = document.getElementById('remit-employee')?.value?.trim();
    const amount = Number(document.getElementById('remit-amount')?.value);
    const notes = document.getElementById('remit-notes')?.value?.trim();

    if (!employeeName || isNaN(amount) || amount <= 0) {
      App.showToast('يُرجى إدخال اسم الموظف ومبلغ صحيح أكبر من صفر', 'warning');
      return;
    }

    try {
      const res = await API.post('/accounting/collections/remit', { employeeName, amount, notes });
      if (res.success) {
        App.showToast(res.message || 'تم تسجيل التوريد للخزينة بنجاح!', 'success');
        App.closeModal();
        this.loadAllData();
      } else {
        App.showToast(res.message || 'فشل تسجيل التوريد', 'error');
      }
    } catch (err) {
      console.error('Submit remittance error:', err);
      App.showToast(err.message || 'حدث خطأ في تسجيل التوريد', 'error');
    }
  },

  async submitCommission(e) {
    e.preventDefault();
    const input = document.getElementById('acc-commission-input');
    const val = Number(input?.value);
    if (isNaN(val) || val < 0 || val > 100) {
      App.showToast('يُرجى إدخال نسبة مئوية صحيحة بين 0 و 100', 'warning');
      return;
    }

    try {
      const res = await API.put('/accounting/settings', { storeCommissionPercent: val });
      if (res.success) {
        App.showToast(res.message || 'تم تحديث نسبة العمولة بنجاح!', 'success');
        this.loadAllData();
      } else {
        App.showToast(res.message || 'فشل تحديث النسبة', 'error');
      }
    } catch (err) {
      App.showToast(err.message || 'حدث خطأ', 'error');
    }
  },

  filterMerchants(val) {
    const q = String(val || '').trim().toLowerCase();
    if (!q) {
      this.filteredMerchantsList = null;
    } else {
      this.filteredMerchantsList = this.merchantsReport.filter(m => 
        (m.name && m.name.toLowerCase().includes(q)) || 
        (m.code && m.code.toLowerCase().includes(q)) ||
        (m.phone && m.phone.includes(q))
      );
    }
    const container = document.getElementById('accounting-print-area');
    if (container && this.currentTab === 'merchants') {
      container.innerHTML = this.renderActiveTabContent();
      const input = document.getElementById('merchant-acc-search');
      if (input) {
        input.value = val;
        input.focus();
      }
    }
  },

  filterCollections(val) {
    const q = String(val || '').trim().toLowerCase();
    if (!q) {
      this.filteredCollectionsList = null;
    } else {
      this.filteredCollectionsList = this.collectionsReport.filter(col => 
        (col.merchantName && col.merchantName.toLowerCase().includes(q)) || 
        (col.merchantCode && col.merchantCode.toLowerCase().includes(q)) ||
        (col.employeeName && col.employeeName.toLowerCase().includes(q))
      );
    }
    const container = document.getElementById('accounting-print-area');
    if (container && this.currentTab === 'collections') {
      container.innerHTML = this.renderActiveTabContent();
      const input = document.getElementById('collection-acc-search');
      if (input) {
        input.value = val;
        input.focus();
      }
    }
  },

  async deleteCollectionMerchant(encodedId, encodedCode, encodedName) {
    if (this.isReadOnly) {
      App.showToast('حذف التجار متاح للإدارة والمحاسب المالي فقط', 'warning');
      return;
    }
    const id = decodeURIComponent(encodedId || '');
    const merchantCode = decodeURIComponent(encodedCode || '');
    const merchantName = decodeURIComponent(encodedName || '');
    const displayName = merchantName || merchantCode || 'هذا التاجر';

    App.confirm(
      `هل أنت متأكد من حذف التاجر "<strong>${displayName}</strong>" نهائياً من قسم المحاسبة المالية وجدول تحصيل التجار؟<br><span class="text-xs text-red-500 mt-2 block font-normal">سيتم استبعاد هذا التاجر فوراً ولن يظهر في كشوفات التحصيل القادمة.</span>`,
      async () => {
        try {
          const res = await API.post('/accounting/collections/delete', {
            id,
            merchantCode,
            merchantName
          });
          if (res.success) {
            App.showToast(res.message || 'تم حذف التاجر من جدول التحصيل بنجاح', 'success');
            await this.loadAllData();
          } else {
            App.showToast(res.message || 'فشل حذف التاجر', 'error');
          }
        } catch (err) {
          console.error('Delete collection merchant error:', err);
          App.showToast(err.message || 'حدث خطأ أثناء محاولة حذف التاجر', 'error');
        }
      }
    );
  },

  async deleteMerchant(merchantId, encodedName, encodedCode) {
    if (this.isReadOnly) {
      App.showToast('حذف التجار متاح للإدارة والمحاسب المالي فقط', 'warning');
      return;
    }
    const name = decodeURIComponent(encodedName || '');
    const code = decodeURIComponent(encodedCode || '');
    const displayName = name ? `${name} (${code})` : (code || 'التاجر');

    App.confirm(
      `هل أنت متأكد من حذف حساب وبيانات التاجر "<strong>${displayName}</strong>" نهائياً؟<br><span class="text-xs text-red-500 mt-2 block font-normal">سيتم حذف التاجر وحسابه وإلغاء ربط منتجاته واستبعاده من كافة سجلات المحاسبة والتحصيل.</span>`,
      async () => {
        try {
          const res = await API.post('/accounting/collections/delete', {
            merchantId,
            merchantCode: code,
            merchantName: name
          });
          if (res.success) {
            App.showToast(res.message || 'تم حذف التاجر وحسابه بنجاح', 'success');
            await this.loadAllData();
          } else {
            App.showToast(res.message || 'فشل حذف التاجر', 'error');
          }
        } catch (err) {
          console.error('Delete merchant error:', err);
          App.showToast(err.message || 'حدث خطأ أثناء محاولة حذف التاجر', 'error');
        }
      }
    );
  },

  openPayoutModal(merchantId) {
    if (this.isReadOnly) {
      App.showToast('صرف مستحقات التجار متاح للمحاسب المالي فقط', 'warning');
      return;
    }
    const m = this.merchantsReport.find(item => item.id === merchantId);
    if (!m) return;

    const body = `
      <form onsubmit="AccountingAdmin.submitPayout(event, '${m.id}')" class="text-right space-y-3" dir="rtl">
        <div class="bg-indigo-50 border border-indigo-200 p-3.5 rounded-xl">
          <div class="flex items-center justify-between mb-1">
            <span class="font-extrabold text-sm text-indigo-950">${m.name}</span>
            <span class="font-mono font-bold bg-white px-2 py-0.5 rounded text-xs text-indigo-700">${m.code}</span>
          </div>
          <div class="grid grid-cols-3 gap-2 text-center text-xs mt-2 pt-2 border-t border-indigo-200">
            <div>
              <div class="text-[10px] text-slate-500">إجمالي المستحقات</div>
              <div class="font-bold text-slate-800">${(m.merchantDues || 0).toLocaleString('ar-EG')} ج.م</div>
            </div>
            <div>
              <div class="text-[10px] text-slate-500">المصروف سابقاً</div>
              <div class="font-bold text-purple-700">${(m.totalPaid || 0).toLocaleString('ar-EG')} ج.م</div>
            </div>
            <div>
              <div class="text-[10px] text-indigo-700 font-bold">الرصيد المتبقي</div>
              <div class="font-black text-emerald-700">${(m.remainingBalance || 0).toLocaleString('ar-EG')} ج.م</div>
            </div>
          </div>
        </div>

        <div class="form-group">
          <label class="form-label text-xs font-bold text-slate-700">المبلغ المراد صرفه نقدياً للتاجر (ج.م) *</label>
          <input 
            type="text" 
            id="payout-amount" 
            class="form-control text-sm font-black text-emerald-700" 
            value="${m.remainingBalance > 0 ? m.remainingBalance : ''}" 
            placeholder="0.00" 
            required 
          />
          <div class="text-[11px] text-slate-400 mt-1">يقبل الأرقام باللغة العربية أو الإنجليزية</div>
        </div>

        <div class="form-group">
          <label class="form-label text-xs font-bold text-slate-700">رقم الإيصال / السند أو المرجع (اختياري)</label>
          <input type="text" id="payout-receipt" class="form-control text-xs font-mono" placeholder="مثال: RCP-99201" />
        </div>

        <div class="form-group">
          <label class="form-label text-xs font-bold text-slate-700">ملاحظات الصرف والبيان</label>
          <textarea id="payout-notes" class="form-control text-xs" rows="2" placeholder="صرف مستحقات مبيعات شهر..."></textarea>
        </div>

        <div class="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
          <button type="button" onclick="App.closeModal()" class="btn btn-secondary text-xs px-4 py-2">
            إلغاء
          </button>
          <button type="submit" class="bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs px-6 py-2.5 rounded-xl shadow transition">
            تأكيد تسجيل صرف الدفعة
          </button>
        </div>
      </form>
    `;
    App.openModal(`صرف دفعة مالية للتاجر: ${m.name}`, body);
  },

  async submitPayout(e, merchantId) {
    e.preventDefault();
    const rawAmount = document.getElementById('payout-amount')?.value;
    const amount = typeof Utils !== 'undefined' ? Utils.parseNumber(rawAmount) : Number(rawAmount);
    const receiptNumber = document.getElementById('payout-receipt')?.value?.trim();
    const notes = document.getElementById('payout-notes')?.value?.trim();

    if (!amount || isNaN(amount) || amount <= 0) {
      App.showToast('يُرجى إدخال مبلغ صحيح للصرف', 'warning');
      return;
    }

    try {
      const res = await API.post(`/accounting/merchants/${merchantId}/payout`, {
        amount,
        receiptNumber,
        notes
      });
      if (res.success) {
        App.showToast(res.message || 'تم تسجيل صرف الدفعة بنجاح!', 'success');
        App.closeModal();
        this.loadAllData();
      } else {
        App.showToast(res.message || 'فشل تسجيل الصرف', 'error');
      }
    } catch (err) {
      App.showToast(err.message || 'حدث خطأ في صرف الدفعة', 'error');
    }
  },

  async openMerchantHistoryModal(merchantId) {
    try {
      App.showToast('جاري جلب السجل الكامل للتاجر...', 'info');
      const res = await API.get(`/accounting/merchants/${merchantId}/history`);
      if (!res.success) throw new Error(res.message || 'فشل الجلب');

      const m = res.merchant;
      const s = res.summary;
      const prods = res.products || [];
      const orders = res.orders || [];
      const payouts = res.payouts || [];
      const returns = res.returns || [];
      const expenses = res.expenses || [];

      const body = `
        <div class="space-y-4 text-right" dir="rtl">
          <!-- Top KPI Cards -->
          <div class="grid grid-cols-2 sm:grid-cols-5 gap-2 text-center text-xs">
            <div class="bg-slate-50 border border-slate-200 p-2.5 rounded-xl">
              <div class="text-[10px] text-slate-500 font-bold">إجمالي المبيعات</div>
              <div class="text-sm font-black text-slate-900">${(s.grossSales || 0).toLocaleString('ar-EG')} ج.م</div>
              <div class="text-[9px] text-slate-400 font-semibold">${s.deliveredOrdersCount || 0} طلب (${s.totalUnitsSold || 0} قطعة)</div>
            </div>
            <div class="bg-emerald-50 border border-emerald-200 p-2.5 rounded-xl">
              <div class="text-[10px] text-emerald-800 font-bold">حق التاجر (التكلفة) / ربح المتجر</div>
              <div class="text-sm font-black text-emerald-700">${(s.costOfSold || 0).toLocaleString('ar-EG')} / ${(s.storeProfit || 0).toLocaleString('ar-EG')} ج.م</div>
            </div>
            <div class="bg-rose-50 border border-rose-200 p-2.5 rounded-xl">
              <div class="text-[10px] text-rose-800 font-bold">المصروفات والخصومات</div>
              <div class="text-sm font-black text-rose-700">${(s.totalExpenses || 0).toLocaleString('ar-EG')} ج.م</div>
              <div class="text-[9px] text-rose-500 font-semibold">${expenses.length} بنود مخصومة</div>
            </div>
            <div class="bg-purple-50 border border-purple-200 p-2.5 rounded-xl">
              <div class="text-[10px] text-purple-800 font-bold">إجمالي المصروف</div>
              <div class="text-sm font-black text-purple-700">${(s.totalPaid || 0).toLocaleString('ar-EG')} ج.م</div>
              <div class="text-[9px] text-purple-500 font-semibold">${payouts.length} دفعات</div>
            </div>
            <div class="bg-indigo-50 border border-indigo-200 p-2.5 rounded-xl">
              <div class="text-[10px] text-indigo-800 font-bold">الرصيد المتبقي</div>
              <div class="text-sm font-black text-indigo-700">${(s.remainingBalance || 0).toLocaleString('ar-EG')} ج.م</div>
            </div>
          </div>

          <!-- Internal Nav Tabs -->
          <div class="border-b border-slate-200 flex gap-2 text-xs font-bold">
            <button type="button" onclick="AccountingAdmin.showDossierTab('orders')" id="dossier-tab-orders" class="dossier-tab active pb-2 border-b-2 border-emerald-600 text-emerald-700 font-black">
              سجل المبيعات والطلبات (${orders.length})
            </button>
            <button type="button" onclick="AccountingAdmin.showDossierTab('products')" id="dossier-tab-products" class="dossier-tab pb-2 text-slate-500 hover:text-slate-800">
              منتجات التاجر (${prods.length})
            </button>
            <button type="button" onclick="AccountingAdmin.showDossierTab('expenses')" id="dossier-tab-expenses" class="dossier-tab pb-2 text-slate-500 hover:text-slate-800">
              المصروفات والخصومات (${expenses.length})
            </button>
            <button type="button" onclick="AccountingAdmin.showDossierTab('payouts')" id="dossier-tab-payouts" class="dossier-tab pb-2 text-slate-500 hover:text-slate-800">
              دفعات الصرف المسجلة (${payouts.length})
            </button>
            <button type="button" onclick="AccountingAdmin.showDossierTab('returns')" id="dossier-tab-returns" class="dossier-tab pb-2 text-slate-500 hover:text-slate-800">
              المرتجعات والضمان (${returns.length})
            </button>
          </div>

          <!-- Tab Content: Orders -->
          <div id="dossier-content-orders" class="dossier-pane max-h-72 overflow-y-auto">
            <table class="w-full text-right text-xs">
              <thead class="bg-slate-50 font-bold text-slate-600 border-b">
                <tr><th>رقم الطلب</th><th>التاريخ</th><th>العميل</th><th>القطع</th><th>الإجمالي</th></tr>
              </thead>
              <tbody class="divide-y divide-slate-100">
                ${orders.length === 0 ? '<tr><td colspan="5" class="text-center py-6 text-slate-400">لا توجد طلبات مسجلة</td></tr>' : orders.map(o => `
                  <tr>
                    <td class="py-2 font-mono font-bold text-emerald-700">#${o.orderNumber}</td>
                    <td class="py-2 font-mono text-slate-500">${new Date(o.date).toLocaleDateString('ar-EG')}</td>
                    <td class="py-2 font-bold text-slate-800">${o.customerName}</td>
                    <td class="py-2 text-slate-600">${o.items.map(it => `${it.title || 'منتج'} (${it.quantity || 1})`).join('، ')}</td>
                    <td class="py-2 font-black text-slate-900">${(o.orderTotal || 0).toLocaleString('ar-EG')} ج.م</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>

          <!-- Tab Content: Expenses & Deductions -->
          <div id="dossier-content-expenses" class="dossier-pane hidden max-h-72 overflow-y-auto">
            <table class="w-full text-right text-xs">
              <thead class="bg-slate-50 font-bold text-slate-600 border-b">
                <tr><th>البند / الوصف</th><th>النوع</th><th>التصنيف</th><th>المبلغ</th><th>التاريخ</th><th>ملاحظات</th></tr>
              </thead>
              <tbody class="divide-y divide-slate-100">
                ${expenses.length === 0 ? '<tr><td colspan="6" class="text-center py-6 text-slate-400">لا توجد مصروفات أو خصومات مسجلة على هذا التاجر</td></tr>' : expenses.map(exp => `
                  <tr>
                    <td class="py-2 font-extrabold text-slate-800">${exp.title}</td>
                    <td class="py-2">
                      <span class="px-2 py-0.5 rounded text-[10px] font-bold ${exp.type === 'revenue' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}">
                        ${exp.type === 'revenue' ? '📈 إيراد (إضافة)' : '📉 مصروف (خصم)'}
                      </span>
                    </td>
                    <td class="py-2 font-bold text-slate-600">${exp.category || 'عام'}</td>
                    <td class="py-2 font-black ${exp.type === 'revenue' ? 'text-emerald-700' : 'text-rose-700'}">${(exp.amount || 0).toLocaleString('ar-EG')} ج.م</td>
                    <td class="py-2 font-mono text-slate-500">${new Date(exp.date || exp.createdAt).toLocaleDateString('ar-EG')}</td>
                    <td class="py-2 text-slate-500 text-[11px]">${exp.notes || '-'}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>

          <!-- Tab Content: Products -->
          <div id="dossier-content-products" class="dossier-pane hidden max-h-72 overflow-y-auto">
            <div class="grid grid-cols-2 sm:grid-cols-3 gap-2">
              ${prods.length === 0 ? '<div class="col-span-3 text-center py-6 text-slate-400">لا توجد منتجات مسجلة لهذا التاجر</div>' : prods.map(p => `
                <div class="flex items-center gap-2 p-2 rounded-xl border border-slate-200 bg-white">
                  <img src="${p.image || '/images/no-image.svg'}" class="w-10 h-10 rounded-lg object-cover border" />
                  <div class="min-w-0 flex-1">
                    <div class="font-bold text-xs text-slate-800 truncate">${p.title}</div>
                    <div class="text-[11px] font-black text-emerald-700">${p.price} ج.م</div>
                    <div class="text-[9px] text-slate-400">مخزون: ${p.stock} | مبيعات: ${p.salesCount}</div>
                  </div>
                </div>
              `).join('')}
            </div>
          </div>

          <!-- Tab Content: Payouts -->
          <div id="dossier-content-payouts" class="dossier-pane hidden max-h-72 overflow-y-auto">
            <table class="w-full text-right text-xs">
              <thead class="bg-slate-50 font-bold text-slate-600 border-b">
                <tr><th>التاريخ</th><th>المبلغ المصروف</th><th>رقم السند/الإيصال</th><th>المسؤول</th><th>ملاحظات</th></tr>
              </thead>
              <tbody class="divide-y divide-slate-100">
                ${payouts.length === 0 ? '<tr><td colspan="5" class="text-center py-6 text-slate-400">لم يتم تسجيل دفعات صرف سابقة</td></tr>' : payouts.map(p => `
                  <tr>
                    <td class="py-2 font-mono text-slate-500">${new Date(p.createdAt).toLocaleDateString('ar-EG')}</td>
                    <td class="py-2 font-black text-purple-700">${(p.amount || 0).toLocaleString('ar-EG')} ج.م</td>
                    <td class="py-2 font-mono text-slate-600">${p.receiptNumber || '-'}</td>
                    <td class="py-2 font-bold text-slate-700">${p.recordedBy || 'المحاسب'}</td>
                    <td class="py-2 text-slate-500 text-[11px]">${p.notes || '-'}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>

          <!-- Tab Content: Returns -->
          <div id="dossier-content-returns" class="dossier-pane hidden max-h-72 overflow-y-auto">
            <table class="w-full text-right text-xs">
              <thead class="bg-slate-50 font-bold text-slate-600 border-b">
                <tr><th>رقم المرتجع</th><th>النوع</th><th>المنتج</th><th>المبلغ المسترد</th><th>فرق السعر</th><th>الحالة</th></tr>
              </thead>
              <tbody class="divide-y divide-slate-100">
                ${returns.length === 0 ? '<tr><td colspan="6" class="text-center py-6 text-slate-400">لا توجد مرتجعات أو استبدالات مسجلة</td></tr>' : returns.map(r => `
                  <tr>
                    <td class="py-2 font-mono font-bold text-slate-700">${r.returnNumber || r.id}</td>
                    <td class="py-2 font-bold">${r.returnType || 'استبدال'}</td>
                    <td class="py-2 text-slate-800 font-medium">${r.productTitle || '-'}</td>
                    <td class="py-2 font-bold text-rose-700">${(r.refundAmount || 0).toLocaleString('ar-EG')} ج.م</td>
                    <td class="py-2 font-bold text-amber-700">${(r.priceDifference || 0).toLocaleString('ar-EG')} ج.م</td>
                    <td class="py-2"><span class="px-1.5 py-0.5 rounded text-[10px] font-bold ${r.status === 'completed' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}">${r.status === 'completed' ? 'مكتمل' : 'متابع'}</span></td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      `;

      App.openModal(`الملف المالي الكامل - التاجر: ${m.name} (${m.code})`, body);
    } catch (err) {
      console.error('Open merchant history error:', err);
      App.showToast(err.message || 'فشل جلب ملف التاجر', 'error');
    }
  },

  showDossierTab(tabName) {
    document.querySelectorAll('.dossier-tab').forEach(b => {
      b.classList.remove('active', 'border-b-2', 'border-emerald-600', 'text-emerald-700', 'font-black');
      b.classList.add('text-slate-500');
    });
    const activeBtn = document.getElementById(`dossier-tab-${tabName}`);
    if (activeBtn) {
      activeBtn.classList.add('active', 'border-b-2', 'border-emerald-600', 'text-emerald-700', 'font-black');
      activeBtn.classList.remove('text-slate-500');
    }

    document.querySelectorAll('.dossier-pane').forEach(p => p.classList.add('hidden'));
    const targetPane = document.getElementById(`dossier-content-${tabName}`);
    if (targetPane) targetPane.classList.remove('hidden');
  }
};

window.AccountingAdmin = AccountingAdmin;
