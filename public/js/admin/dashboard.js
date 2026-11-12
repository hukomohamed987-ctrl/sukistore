/**
 * Suki Store Admin Dashboard Page (Analytics, Time Range Filter, Revenue per Product & Governorates Breakdown)
 */

const AdminDashboard = {
  currentTimeRange: 'all', // '1d', '2d', '3d', '7d', '30d', '60d', '365d', 'all'

  async render(timeRange = null) {
    if (State.user && State.user.role === 'investor') {
      return InvestorsAdmin.renderInvestorPortal();
    }

    if (timeRange) {
      this.currentTimeRange = timeRange;
    }

    AdminLayout.render('dashboard', `
      <div class="py-12 text-center text-slate-400">
        <i class="fa-solid fa-spinner fa-spin text-3xl mb-3 text-emerald-600"></i>
        <div>جاري إعداد تقارير وإحصائيات المتجر...</div>
      </div>
    `);

    try {
      const res = await API.get('/admin/analytics', { timeRange: this.currentTimeRange });
      if (!res.success) throw new Error(res.message);

      const { stats, statusCounts, topProducts, governorateSales = [], salesChart = [], recentOrders = [] } = res;
      const isMerchant = State.user && State.user.role === 'merchant';

      // Max sales value for SVG chart scaling
      const maxSale = Math.max(...salesChart.map(s => s.sales), 100);

      const timeRanges = [
        { key: '1d', label: 'آخر يوم (اليوم)' },
        { key: '2d', label: 'آخر يومين' },
        { key: '3d', label: 'آخر 3 أيام' },
        { key: '7d', label: 'آخر أسبوع' },
        { key: '30d', label: 'آخر شهر' },
        { key: '60d', label: 'آخر شهرين' },
        { key: '365d', label: 'آخر سنة' },
        { key: 'all', label: 'كافة الفترات (الكل)' }
      ];

      const html = `
        <div>
          <!-- Page Header & Time Range Filter -->
          <div class="flex items-center justify-between mb-6 flex-wrap gap-4">
            <div>
              <h1 class="text-2xl font-extrabold text-slate-900 flex items-center gap-2">
                <i class="fa-solid fa-${isMerchant ? 'store' : 'chart-line'} text-emerald-600"></i>
                <span>${isMerchant ? `لوحة إحصائيات التاجر: ${State.user.name} (${State.user.merchantCode || ''})` : 'لوحة الإحصائيات وتقارير المبيعات'}</span>
              </h1>
              <p class="text-xs text-slate-500 mt-1">${isMerchant ? 'متابعة أداء مبيعات منتجاتك، الطلبات الواردة، وتنبيهات المخزون' : 'تقارير المبيعات والأماكن وأداء المنتجات لفترة الفلترة المحددة'}</p>
            </div>

            <!-- Time Filter Bar -->
            <div class="bg-white p-1.5 rounded-xl border border-slate-200 shadow-sm flex items-center gap-1 overflow-x-auto max-w-full">
              <span class="text-xs text-slate-400 font-bold px-2 flex items-center gap-1">
                <i class="fa-solid fa-calendar-days text-emerald-600"></i> الفلتر:
              </span>
              ${timeRanges.map(tr => `
                <button 
                  onclick="AdminDashboard.setTimeRange('${tr.key}')"
                  class="px-3 py-1.5 rounded-lg text-xs font-bold transition flex-shrink-0 ${this.currentTimeRange === tr.key ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'}">
                  ${tr.label}
                </button>
              `).join('')}
            </div>
          </div>

          <!-- Low Stock Alert Banner (Requirement 6) -->
          ${stats.lowStockCount > 0 ? `
            <div class="bg-red-50 dark:bg-red-950/40 border-2 border-red-300 dark:border-red-800 text-red-800 dark:text-red-300 p-4 rounded-2xl mb-6 flex items-center justify-between flex-wrap gap-4 shadow-sm">
              <div class="flex items-center gap-3">
                <div class="w-11 h-11 bg-red-600 text-white rounded-xl flex items-center justify-center text-xl flex-shrink-0 shadow-md">
                  <i class="fa-solid fa-triangle-exclamation"></i>
                </div>
                <div>
                  <h4 class="font-extrabold text-sm md:text-base flex items-center gap-2">
                    <span>تنبيه المخزون المنخفض:</span>
                    <span class="bg-red-600 text-white text-xs px-2 py-0.5 rounded-full font-mono">${stats.lowStockCount} منتج قارب على النفاذ</span>
                  </h4>
                  <p class="text-xs text-red-600 dark:text-red-400 mt-1">
                    المخزون الحالي لهذه المنتجات أقل من أو يساوي <strong>${stats.lowStockThreshold || 15} قطعة</strong> (قابل للتعديل).
                  </p>
                </div>
              </div>
              <div class="flex items-center gap-2">
                <a href="#/admin/products?filter=low-stock" class="bg-red-600 hover:bg-red-700 text-white text-xs font-bold px-4 py-2.5 rounded-xl transition flex items-center gap-1.5 shadow-sm">
                  <i class="fa-solid fa-boxes-stacked"></i>
                  <span>عرض منتجات قاربت على النفاذ</span>
                </a>
                ${!isMerchant ? `
                <button onclick="AdminDashboard.openThresholdSettingsModal(${stats.lowStockThreshold || 15})" class="bg-white dark:bg-slate-800 border border-red-300 dark:border-red-700 hover:bg-red-100 text-red-700 dark:text-red-300 text-xs font-bold px-3 py-2.5 rounded-xl transition">
                  <i class="fa-solid fa-sliders"></i> تعديل الحد
                </button>
                ` : ''}
              </div>
            </div>
          ` : ''}

          <!-- KPI Cards Grid -->
          <div class="kpi-grid mb-8">
            <div class="kpi-card">
              <div>
                <div class="kpi-title">${isMerchant ? 'إجمالي مبيعات منتجاتي' : 'إجمالي المبيعات (الفترة)'}</div>
                <div class="kpi-value text-emerald-600">${stats.totalRevenue.toLocaleString('ar-EG')} ج.م</div>
                <div class="text-[11px] text-slate-500 font-bold mt-1">
                  متوسط الطلب: ${stats.averageOrderValue.toLocaleString('ar-EG')} ج.م
                </div>
                <div class="text-[10px] text-slate-400 font-bold mt-0.5">
                  كل الطلبات غير الملغاة (يشمل غير المسلّمة) — المحصّل الفعلي في قسم المحاسبة
                </div>
              </div>
              <div class="kpi-icon-box kpi-icon-primary">
                <i class="fa-solid fa-sack-dollar"></i>
              </div>
            </div>

            <div class="kpi-card">
              <div>
                <div class="kpi-title">${isMerchant ? 'طلبات منتجاتي' : 'إجمالي الطلبات (الفترة)'}</div>
                <div class="kpi-value text-blue-600">${stats.totalOrders}</div>
                <div class="text-[11px] text-amber-600 font-bold mt-1">
                  ${stats.newOrdersCount} بانتظار التأكيد
                </div>
              </div>
              <div class="kpi-icon-box kpi-icon-info">
                <i class="fa-solid fa-receipt"></i>
              </div>
            </div>

            <div class="kpi-card">
              <div>
                <div class="kpi-title">${isMerchant ? 'منتجاتي المسجلة' : 'العملاء المسجلين'}</div>
                <div class="kpi-value text-purple-600">${isMerchant ? stats.totalProducts : stats.totalCustomers}</div>
                <div class="text-[11px] text-slate-400 font-medium mt-1">${isMerchant ? 'منتجات مرتبطة بحسابك' : 'حسابات نشطة في المنصة'}</div>
              </div>
              <div class="kpi-icon-box" style="background:#faf5ff; color:#9333ea;">
                <i class="fa-solid fa-${isMerchant ? 'boxes-stacked' : 'users'}"></i>
              </div>
            </div>

            <div class="kpi-card">
              <div>
                <div class="kpi-title">${isMerchant ? 'منخفضة المخزون' : 'إجمالي المنتجات'}</div>
                <div class="kpi-value text-amber-600">${isMerchant ? stats.lowStockCount : stats.totalProducts}</div>
                <div class="text-[11px] text-slate-400 font-medium mt-1">${isMerchant ? 'منتجات بحاجة لإعادة الشحن' : 'بالمخازن والأقسام'}</div>
              </div>
              <div class="kpi-icon-box kpi-icon-warning">
                <i class="fa-solid fa-box-open"></i>
              </div>
            </div>
          </div>
          </div>

          <!-- Top Selling Products with Sales Count & Revenue -->
          <div class="admin-card p-6 mb-8">
            <div class="flex items-center justify-between mb-4 pb-3 border-b border-slate-100 flex-wrap gap-2">
              <h3 class="font-extrabold text-base text-slate-800 flex items-center gap-2">
                <i class="fa-solid fa-fire text-amber-500"></i>
                <span>أكثر المنتجات مبيعاً وإيراداً</span>
              </h3>
              <span class="text-xs text-slate-400 font-medium">مرتبة حسب عدد القطع المباعة وإجمالي الدخل</span>
            </div>

            ${topProducts.length === 0 ? `
              <div class="text-center py-8 text-slate-400 text-sm">لا توجد مبيعات مسجلة في هذه الفترة المحددة</div>
            ` : `
              <div class="overflow-x-auto">
                <table class="admin-table w-full text-right text-xs md:text-sm">
                  <thead>
                    <tr>
                      <th>المنتج</th>
                      <th>سعر الوحدة</th>
                      <th>عدد المبيعات</th>
                      <th>إجمالي الإيرادات</th>
                      <th>المخزون الحالي</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${topProducts.map((p, idx) => `
                      <tr>
                        <td>
                          <div class="flex items-center gap-3">
                            <span class="w-6 h-6 rounded-full bg-slate-100 text-slate-700 font-extrabold flex items-center justify-center text-xs flex-shrink-0">${idx + 1}</span>
                            <img src="${p.image || '/images/no-image.svg'}" class="w-10 h-10 rounded-lg object-cover border border-slate-200 flex-shrink-0" />
                            <span class="font-bold text-slate-800 line-clamp-1 max-w-xs">${p.title}</span>
                          </div>
                        </td>
                        <td class="font-bold text-slate-700">${p.price} ج.م</td>
                        <td>
                          <span class="bg-amber-100 text-amber-800 font-extrabold px-3 py-1 rounded-full text-xs">
                            ${p.salesCount} مبيعة
                          </span>
                        </td>
                        <td class="font-extrabold text-emerald-700 text-sm">
                          ${(p.totalRevenue || (p.salesCount * p.price)).toLocaleString('ar-EG')} ج.م
                        </td>
                        <td>
                          <span class="font-bold ${p.stock > 0 ? 'text-slate-600' : 'text-red-500'}">
                            ${p.stock} قطعة
                          </span>
                        </td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              </div>
            `}
          </div>

          <!-- Sales By Governorates & Regions Breakdown -->
          <div class="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
            <!-- Governorate Sales Breakdown -->
            <div class="admin-card p-6">
              <div class="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
                <h3 class="font-extrabold text-base text-slate-800 flex items-center gap-2">
                  <i class="fa-solid fa-map-location-dot text-emerald-600"></i>
                  <span>المبيعات حسب المحافظات والأماكن</span>
                </h3>
                <span class="text-xs text-slate-400 font-medium">توزيع جغرافي</span>
              </div>

              ${governorateSales.length === 0 ? `
                <div class="text-center py-8 text-slate-400 text-sm">لا توجد بيانات شحن للمحافظات في هذه الفترة</div>
              ` : `
                <div class="flex flex-col gap-3">
                  ${governorateSales.map(gov => {
                    const percent = stats.totalRevenue > 0 ? Math.round((gov.totalRevenue / stats.totalRevenue) * 100) : 0;
                    return `
                      <div class="p-3.5 rounded-xl bg-slate-50 border border-slate-100 flex flex-col gap-1.5">
                        <div class="flex items-center justify-between">
                          <span class="font-extrabold text-xs text-slate-800 flex items-center gap-1.5">
                            <i class="fa-solid fa-city text-emerald-600"></i> ${gov.governorate}
                          </span>
                          <span class="font-extrabold text-emerald-700 text-xs">${gov.totalRevenue.toLocaleString('ar-EG')} ج.م</span>
                        </div>
                        <div class="flex items-center justify-between text-[11px] text-slate-500">
                          <span>${gov.ordersCount} طلبات شحن</span>
                          <span class="font-bold text-slate-600">${percent}% من المبيعات</span>
                        </div>
                        <div class="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden mt-1">
                          <div class="bg-emerald-600 h-full rounded-full" style="width: ${percent}%;"></div>
                        </div>
                      </div>
                    `;
                  }).join('')}
                </div>
              `}
            </div>

            <!-- Order Statuses & Activity Quick Summary -->
            <div class="admin-card p-6">
              <h3 class="font-extrabold text-base text-slate-800 mb-4 pb-3 border-b border-slate-100 flex items-center gap-2">
                <i class="fa-solid fa-clock-rotate-left text-emerald-600"></i>
                <span>توزيع حالات الطلبات للفترة المحددة</span>
              </h3>

              <div class="flex flex-col gap-3">
                <div class="flex items-center justify-between p-3.5 rounded-xl bg-amber-50 text-xs font-bold text-amber-900">
                  <span class="flex items-center gap-2"><i class="fa-solid fa-hourglass-start text-amber-600"></i> قيد المراجعة:</span>
                  <span>${statusCounts.pending} طلبات</span>
                </div>

                <div class="flex items-center justify-between p-3.5 rounded-xl bg-blue-50 text-xs font-bold text-blue-900">
                  <span class="flex items-center gap-2"><i class="fa-solid fa-box text-blue-600"></i> قيد التجهيز:</span>
                  <span>${statusCounts.processing} طلبات</span>
                </div>

                <div class="flex items-center justify-between p-3.5 rounded-xl bg-purple-50 text-xs font-bold text-purple-900">
                  <span class="flex items-center gap-2"><i class="fa-solid fa-truck text-purple-600"></i> قيد الشحن والتوصيل:</span>
                  <span>${statusCounts.shipped} طلبات</span>
                </div>

                <div class="flex items-center justify-between p-3.5 rounded-xl bg-emerald-50 text-xs font-bold text-emerald-900">
                  <span class="flex items-center gap-2"><i class="fa-solid fa-circle-check text-emerald-600"></i> تم التسليم بنجاح:</span>
                  <span>${statusCounts.delivered} طلبات</span>
                </div>

                <div class="flex items-center justify-between p-3.5 rounded-xl bg-red-50 text-xs font-bold text-red-900">
                  <span class="flex items-center gap-2"><i class="fa-solid fa-circle-xmark text-red-600"></i> طلبات ملغية:</span>
                  <span>${statusCounts.cancelled} طلبات</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      `;

      AdminLayout.render('dashboard', html);
    } catch (err) {
      console.error('Dashboard render error:', err);
    }
  },

  setTimeRange(range) {
    this.currentTimeRange = range;
    this.render(range);
  },

  openThresholdSettingsModal(currentThreshold = 15) {
    App.openModal('تعديل حد تنبيه المخزون المنخفض', `
      <form onsubmit="AdminDashboard.saveThresholdSettings(event)">
        <div class="text-center mb-4">
          <div class="w-12 h-12 bg-red-50 text-red-600 rounded-full flex items-center justify-center mx-auto mb-2 text-xl">
            <i class="fa-solid fa-triangle-exclamation"></i>
          </div>
          <p class="text-xs text-slate-500">
            حدد الحد الأدنى للكمية المتبقية في المخزن التي يظهر عندها التنبيه للمنتج
          </p>
        </div>

        <div class="form-group mb-4">
          <label class="form-label font-bold text-slate-700 dark:text-slate-200">حد التنبيه (عدد القطع) *</label>
          <input type="number" id="threshold-input" min="1" max="1000" class="form-control text-center text-xl font-bold font-mono" value="${currentThreshold}" required />
          <div class="text-[11px] text-slate-400 mt-1">القيمة الافتراضية الشائعة هي 15 أو 20 قطعة</div>
        </div>

        <div class="flex items-center gap-2 mb-4">
          <button type="button" onclick="document.getElementById('threshold-input').value = 15" class="flex-1 py-1.5 rounded-lg border border-slate-200 text-xs font-bold hover:bg-slate-50">15 قطعة</button>
          <button type="button" onclick="document.getElementById('threshold-input').value = 20" class="flex-1 py-1.5 rounded-lg border border-slate-200 text-xs font-bold hover:bg-slate-50">20 قطعة</button>
          <button type="button" onclick="document.getElementById('threshold-input').value = 30" class="flex-1 py-1.5 rounded-lg border border-slate-200 text-xs font-bold hover:bg-slate-50">30 قطعة</button>
        </div>

        <button type="submit" id="save-threshold-btn" class="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 rounded-xl text-sm transition shadow-sm">
          حفظ وتطبيق الحد
        </button>
      </form>
    `);
  },

  async saveThresholdSettings(e) {
    e.preventDefault();
    const val = Number(document.getElementById('threshold-input').value);
    const btn = document.getElementById('save-threshold-btn');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> جاري الحفظ...';
    }

    try {
      const res = await API.put('/admin/settings', { lowStockThreshold: val });
      App.closeModal();
      App.showToast(res.message || 'تم تحديث حد التنبيه بنجاح', 'success');
      this.render();
    } catch (err) {
      App.showToast(err.message, 'error');
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = 'حفظ وتطبيق الحد';
      }
    }
  }
};
