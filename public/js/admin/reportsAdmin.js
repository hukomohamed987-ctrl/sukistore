/**
 * Suki Store Advanced Sales Reports Admin Page
 * Sales by Governorate, Category, Staff, and Best Selling Peak Times (Hours & Days) with Time Filtering
 * Includes Print, Download as PNG Image, and full responsive layout
 */

const ReportsAdmin = {
  currentTimeRange: '30d',

  async render(timeRange = null) {
    if (timeRange) {
      this.currentTimeRange = timeRange;
    }

    AdminLayout.render('reports', `
      <div id="reports-loading-state" class="py-16 text-center text-slate-400">
        <i class="fa-solid fa-spinner fa-spin text-4xl mb-4 text-emerald-600"></i>
        <div class="text-base font-bold text-slate-700">جاري إنشاء وتحليل تقارير المبيعات المتقدمة...</div>
        <p class="text-xs text-slate-400 mt-1">يتم معالجة بيانات المبيعات والأقسام والمحافظات الآن</p>
      </div>
    `);

    try {
      const res = await API.get('/admin/reports/sales', { timeRange: this.currentTimeRange });
      if (!res || !res.success) throw new Error(res?.message || 'تعذر تحميل بيانات التقارير');

      const {
        totalSales = 0,
        totalOrders = 0,
        averageOrderValue = 0,
        byGovernorate = [],
        byCategory = [],
        byStaff = [],
        bestTimes = {}
      } = res;

      const timeRanges = [
        { key: '1d', label: 'اليوم' },
        { key: '7d', label: 'آخر أسبوع' },
        { key: '30d', label: 'آخر 30 يوماً' },
        { key: '60d', label: 'آخر شهرين' },
        { key: '365d', label: 'خلال سنة' },
        { key: 'all', label: 'كافة الفترات' }
      ];

      const dailyTimes = Array.isArray(bestTimes.daily) ? bestTimes.daily : [];
      const hourlyTimes = Array.isArray(bestTimes.hourly) ? bestTimes.hourly : [];
      const maxDailyRev = Math.max(...dailyTimes.map(d => d.revenue || 0), 1);
      const maxHourlyRev = Math.max(...hourlyTimes.map(h => h.revenue || 0), 1);

      const html = `
        <div id="reports-export-container" class="space-y-6">
          <!-- Header & Controls -->
          <div class="flex items-center justify-between flex-wrap gap-4 no-print pb-2 border-b border-slate-200">
            <div>
              <h1 class="text-2xl font-extrabold text-slate-900 flex items-center gap-2">
                <i class="fa-solid fa-chart-pie text-emerald-600"></i>
                <span>تقارير المبيعات المتقدمة</span>
              </h1>
              <p class="text-xs text-slate-500 mt-1">
                تحليل دقيق للمبيعات حسب المحافظة، القسم، الموظف، وأوقات الذروة (أيام وساعات)
              </p>
            </div>

            <!-- Actions: Time Filters, Print, Image Export -->
            <div class="flex items-center gap-2 flex-wrap">
              <!-- Time Range Selector -->
              <div class="bg-white p-1 rounded-xl border border-slate-200 shadow-sm flex items-center gap-1 overflow-x-auto max-w-full">
                <span class="text-xs text-slate-400 font-bold px-2">الفترة:</span>
                ${timeRanges.map(tr => `
                  <button 
                    onclick="ReportsAdmin.setTimeRange('${tr.key}')"
                    class="px-2.5 py-1 rounded-lg text-xs font-bold transition flex-shrink-0 ${this.currentTimeRange === tr.key ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'}">
                    ${tr.label}
                  </button>
                `).join('')}
              </div>

              <!-- Export / Print Buttons -->
              <button 
                onclick="ReportsAdmin.printReport()" 
                class="px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold flex items-center gap-1.5 shadow-sm transition">
                <i class="fa-solid fa-print text-slate-500"></i>
                <span>طباعة</span>
              </button>

              <button 
                onclick="ReportsAdmin.downloadAsImage()" 
                id="btn-export-reports-img"
                class="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm transition">
                <i class="fa-solid fa-file-pdf"></i>
                <span>PDF</span>
              </button>
              <button type="button" onclick="ReportsAdmin.exportExcel()" class="px-3.5 py-1.5 rounded-xl bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-bold flex items-center gap-1.5 shadow-sm transition">
                <i class="fa-solid fa-file-excel text-green-600"></i>
                <span>Excel</span>
              </button>
            </div>
          </div>

          <!-- Printable Header (Visible Only on Print) -->
          <div class="hidden print:block text-center border-b pb-4 mb-4">
            <h2 class="text-xl font-bold">سوقي ستور - تقرير المبيعات المتقدم</h2>
            <p class="text-xs text-gray-500">الفترة: ${timeRanges.find(r => r.key === this.currentTimeRange)?.label || this.currentTimeRange} | تاريخ الاستخراج: ${new Date().toLocaleDateString('ar-EG')}</p>
          </div>

          <!-- KPI Summary Banner -->
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div class="admin-card p-5 border-r-4 border-r-emerald-500">
              <div class="text-xs font-bold text-slate-500 mb-1">إجمالي الإيرادات</div>
              <div class="text-2xl font-extrabold text-emerald-600">${Number(totalSales || 0).toLocaleString('ar-EG')} ج.م</div>
              <div class="text-[11px] text-slate-400 mt-1">خلال الفترة المحددة</div>
            </div>

            <div class="admin-card p-5 border-r-4 border-r-blue-500">
              <div class="text-xs font-bold text-slate-500 mb-1">الطلبات المكتملة</div>
              <div class="text-2xl font-extrabold text-blue-600">${totalOrders}</div>
              <div class="text-[11px] text-slate-400 mt-1">متوسط الطلب: ${Number(averageOrderValue || 0).toLocaleString('ar-EG')} ج.م</div>
            </div>

            <div class="admin-card p-5 border-r-4 border-r-amber-500">
              <div class="text-xs font-bold text-slate-500 mb-1">أفضل أيام البيع</div>
              <div class="text-xl font-extrabold text-amber-600 flex items-center gap-1.5">
                <i class="fa-solid fa-crown text-amber-500 text-sm"></i>
                <span>${bestTimes.peakDay?.dayName || 'لا توجد بيانات'}</span>
              </div>
              <div class="text-[11px] text-slate-400 mt-1">مبيعات: ${Number(bestTimes.peakDay?.revenue || 0).toLocaleString('ar-EG')} ج.م</div>
            </div>

            <div class="admin-card p-5 border-r-4 border-r-purple-500">
              <div class="text-xs font-bold text-slate-500 mb-1">ساعة الذروة اليومية</div>
              <div class="text-xl font-extrabold text-purple-600 flex items-center gap-1.5">
                <i class="fa-solid fa-clock text-purple-500 text-sm"></i>
                <span>${bestTimes.peakHour?.hourLabel || bestTimes.peakHour?.label || 'لا توجد بيانات'}</span>
              </div>
              <div class="text-[11px] text-slate-400 mt-1">عدد الطلبات: ${bestTimes.peakHour?.ordersCount || bestTimes.peakHour?.orders || 0} طلب</div>
            </div>
          </div>

          <!-- Section 1 & 2: By Governorate and By Category -->
          <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <!-- 1. By Governorate -->
            <div class="admin-card p-6">
              <div class="flex items-center justify-between pb-3 mb-4 border-b border-slate-100">
                <h3 class="font-extrabold text-base text-slate-800 flex items-center gap-2">
                  <i class="fa-solid fa-map-location-dot text-emerald-600"></i>
                  <span>المبيعات حسب المحافظة (${byGovernorate.length})</span>
                </h3>
                <span class="text-xs text-slate-400 font-bold">الترتيب حسب الأعلى دخلاً</span>
              </div>

              ${byGovernorate.length === 0 ? `
                <div class="text-center py-8 text-slate-400 text-xs">لا توجد مبيعات في هذه الفترة</div>
              ` : `
                <div class="flex flex-col gap-3.5 max-h-96 overflow-y-auto pl-1">
                  ${byGovernorate.map(g => {
                    const count = g.ordersCount !== undefined ? g.ordersCount : (g.count || 0);
                    const rev = Number(g.revenue || 0);
                    const pct = g.percentage || 0;
                    return `
                      <div>
                        <div class="flex items-center justify-between text-xs font-bold mb-1">
                          <span class="text-slate-800">${g.governorate} <span class="text-slate-400 font-normal">(${count} طلب)</span></span>
                          <span class="text-emerald-700 font-extrabold">${rev.toLocaleString('ar-EG')} ج.م <span class="text-slate-400 font-normal text-[10px]">(${pct}%)</span></span>
                        </div>
                        <div class="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
                          <div class="bg-emerald-600 h-2.5 rounded-full transition-all duration-500" style="width: ${Math.max(pct, 3)}%"></div>
                        </div>
                      </div>
                    `;
                  }).join('')}
                </div>
              `}
            </div>

            <!-- 2. By Category -->
            <div class="admin-card p-6">
              <div class="flex items-center justify-between pb-3 mb-4 border-b border-slate-100">
                <h3 class="font-extrabold text-base text-slate-800 flex items-center gap-2">
                  <i class="fa-solid fa-layer-group text-blue-600"></i>
                  <span>المبيعات حسب القسم (${byCategory.length})</span>
                </h3>
                <span class="text-xs text-slate-400 font-bold">حسب حجم المبيعات</span>
              </div>

              ${byCategory.length === 0 ? `
                <div class="text-center py-8 text-slate-400 text-xs">لا توجد مبيعات في هذه الفترة</div>
              ` : `
                <div class="flex flex-col gap-3.5 max-h-96 overflow-y-auto pl-1">
                  ${byCategory.map(c => {
                    const name = c.categoryName || c.name || 'قسم غير محدد';
                    const count = c.itemsCount !== undefined ? c.itemsCount : (c.itemsSold || 0);
                    const rev = Number(c.revenue || 0);
                    const pct = c.percentage || 0;
                    return `
                      <div>
                        <div class="flex items-center justify-between text-xs font-bold mb-1">
                          <span class="text-slate-800">${name} <span class="text-slate-400 font-normal">(${count} قطعة)</span></span>
                          <span class="text-blue-700 font-extrabold">${rev.toLocaleString('ar-EG')} ج.م <span class="text-slate-400 font-normal text-[10px]">(${pct}%)</span></span>
                        </div>
                        <div class="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
                          <div class="bg-blue-600 h-2.5 rounded-full transition-all duration-500" style="width: ${Math.max(pct, 3)}%"></div>
                        </div>
                      </div>
                    `;
                  }).join('')}
                </div>
              `}
            </div>
          </div>

          <!-- Section 3: By Staff Member -->
          <div class="admin-card p-6">
            <div class="flex items-center justify-between pb-3 mb-4 border-b border-slate-100">
              <h3 class="font-extrabold text-base text-slate-800 flex items-center gap-2">
                <i class="fa-solid fa-user-tie text-purple-600"></i>
                <span>المبيعات وأداء الموظفين (${byStaff.length})</span>
              </h3>
              <span class="text-xs text-slate-400 font-bold">الطلبات المعالجة وإجمالي قيمتها</span>
            </div>

            ${byStaff.length === 0 ? `
              <div class="text-center py-8 text-slate-400 text-xs">لا توجد بيانات موظفين مسجلة</div>
            ` : `
              <div class="admin-table-container">
                <table class="admin-table">
                  <thead>
                    <tr>
                      <th>اسم الموظف</th>
                      <th>الدور / المنصب</th>
                      <th>الطلبات المدارة</th>
                      <th>إجمالي القيمة</th>
                      <th>النسبة من الإجمالي</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${byStaff.map(s => {
                      const name = s.staffName || s.name || 'موظف';
                      const processed = s.ordersProcessed !== undefined ? s.ordersProcessed : (s.processedOrders || 0);
                      const rev = Number(s.revenueHandled || 0);
                      const pct = s.percentage || 0;
                      const roleLabel = s.role === 'super_admin' ? 'المدير العام' : (s.role === 'accountant' ? 'محاسب مالي' : 'موظف / مشرف');
                      return `
                        <tr>
                          <td class="font-bold text-slate-800 text-xs">
                            <i class="fa-solid fa-circle-user text-purple-500 ml-1"></i>
                            ${name}
                          </td>
                          <td>
                            <span class="bg-purple-50 text-purple-700 text-[11px] font-bold px-2 py-0.5 rounded-full">
                              ${roleLabel}
                            </span>
                          </td>
                          <td class="font-bold text-xs text-slate-700">${processed} طلب</td>
                          <td class="font-extrabold text-xs text-emerald-700">${rev.toLocaleString('ar-EG')} ج.م</td>
                          <td>
                            <div class="flex items-center gap-2">
                              <div class="w-24 bg-slate-100 rounded-full h-2 overflow-hidden">
                                <div class="bg-purple-600 h-2 rounded-full" style="width: ${pct}%"></div>
                              </div>
                              <span class="text-xs text-slate-500 font-bold">${pct}%</span>
                            </div>
                          </td>
                        </tr>
                      `;
                    }).join('')}
                  </tbody>
                </table>
              </div>
            `}
          </div>

          <!-- Section 4: Best Times (Peak Days & Peak Hours) -->
          <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <!-- Best Days of Week -->
            <div class="admin-card p-6">
              <div class="flex items-center justify-between pb-3 mb-4 border-b border-slate-100">
                <h3 class="font-extrabold text-base text-slate-800 flex items-center gap-2">
                  <i class="fa-solid fa-calendar-week text-amber-600"></i>
                  <span>أفضل أيام البيع في الأسبوع</span>
                </h3>
                <span class="text-xs text-amber-600 font-bold bg-amber-50 px-2 py-0.5 rounded-lg">
                  الذروة: ${bestTimes.peakDay?.dayName || '—'}
                </span>
              </div>

              <div class="flex flex-col gap-3">
                ${dailyTimes.map(d => {
                  const rev = Number(d.revenue || 0);
                  const orders = d.ordersCount !== undefined ? d.ordersCount : (d.orders || 0);
                  const isPeak = bestTimes.peakDay && bestTimes.peakDay.dayName === d.dayName && rev > 0;
                  const percent = Math.round((rev / maxDailyRev) * 100);
                  return `
                    <div>
                      <div class="flex items-center justify-between text-xs font-bold mb-1">
                        <span class="${isPeak ? 'text-amber-700 font-extrabold' : 'text-slate-700'}">
                          ${d.dayName} ${isPeak ? '⭐ (الأعلى مبيعاً)' : ''}
                        </span>
                        <span class="text-slate-600">${rev.toLocaleString('ar-EG')} ج.م (${orders} طلب)</span>
                      </div>
                      <div class="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
                        <div class="${isPeak ? 'bg-amber-500' : 'bg-slate-400'} h-2.5 rounded-full transition-all duration-500" style="width: ${Math.max(percent, 2)}%"></div>
                      </div>
                    </div>
                  `;
                }).join('')}
              </div>
            </div>

            <!-- Best Hours of Day -->
            <div class="admin-card p-6">
              <div class="flex items-center justify-between pb-3 mb-4 border-b border-slate-100">
                <h3 class="font-extrabold text-base text-slate-800 flex items-center gap-2">
                  <i class="fa-solid fa-clock-rotate-left text-teal-600"></i>
                  <span>أفضل ساعات البيع خلال اليوم</span>
                </h3>
                <span class="text-xs text-teal-700 font-bold bg-teal-50 px-2 py-0.5 rounded-lg">
                  ساعة الذروة: ${bestTimes.peakHour?.hourLabel || bestTimes.peakHour?.label || '—'}
                </span>
              </div>

              <!-- Hourly Mini Bar Graph (00 to 23) -->
              <div class="pt-4">
                <div class="grid grid-cols-12 gap-1 items-end h-32 mb-2 px-1">
                  ${hourlyTimes.slice(8, 24).concat(hourlyTimes.slice(0, 8)).map(h => {
                    const rev = Number(h.revenue || 0);
                    const orders = h.ordersCount !== undefined ? h.ordersCount : (h.orders || 0);
                    const heightPercent = maxHourlyRev > 0 ? Math.round((rev / maxHourlyRev) * 100) : 0;
                    const isPeak = bestTimes.peakHour && (bestTimes.peakHour.hour === h.hour) && rev > 0;
                    const label = h.hourLabel || h.label || `${h.hour}:00`;
                    return `
                      <div class="flex flex-col items-center group relative h-full justify-end">
                        <div 
                          class="w-full rounded-t transition-all ${isPeak ? 'bg-teal-600' : heightPercent > 0 ? 'bg-teal-300 hover:bg-teal-400' : 'bg-slate-100'}" 
                          style="height: ${Math.max(heightPercent, 4)}%"
                          title="${label}: ${orders} طلب (${rev} ج.م)">
                        </div>
                        <span class="text-[9px] text-slate-400 font-mono mt-1">${h.hour}</span>
                      </div>
                    `;
                  }).join('')}
                </div>
                <div class="text-center text-[11px] text-slate-400 font-bold mt-2">
                  ساعات اليوم (من 0 صباحاً حتى 23 مساءً) • الارتفاع يوضح حجم المبيعات
                </div>
              </div>
            </div>
          </div>
        </div>
      `;

      AdminLayout.render('reports', html);
    } catch (err) {
      console.error('Reports render error:', err);
      AdminLayout.render('reports', `
        <div class="admin-card p-12 text-center max-w-lg mx-auto my-12">
          <div class="w-16 h-16 rounded-full bg-red-100 text-red-600 flex items-center justify-center mx-auto mb-4 text-2xl">
            <i class="fa-solid fa-triangle-exclamation"></i>
          </div>
          <h2 class="text-lg font-bold text-slate-800 mb-2">تعذر إنشاء تقرير المبيعات</h2>
          <p class="text-sm text-slate-500 mb-6">${err.message || 'حدث خطأ أثناء الاتصال بالخادم'}</p>
          <button 
            onclick="ReportsAdmin.render()" 
            class="px-5 py-2.5 rounded-xl bg-emerald-600 text-white font-bold text-sm hover:bg-emerald-700 transition">
            <i class="fa-solid fa-rotate-right ml-1"></i>
            إعادة المحاولة
          </button>
        </div>
      `);
    }
  },

  setTimeRange(range) {
    this.currentTimeRange = range;
    this.render(range);
  },

  reportElement() {
    return document.getElementById('reports-export-container') || document.getElementById('admin-content');
  },

  printReport() {
    ExportKit.print(this.reportElement(), `تقرير المبيعات (${this.currentTimeRange || 'الكل'})`);
  },

  exportExcel() {
    ExportKit.excel(this.reportElement(), `تقرير المبيعات ${this.currentTimeRange || ''}`);
  },

  // (was "save as image" — it crashed on Toast.show and broke Arabic letters) → real PDF
  async downloadAsImage() {
    ExportKit.pdf(this.reportElement(), `تقرير المبيعات (${this.currentTimeRange || 'الكل'})`);
  },

  loadHtml2Canvas() {
    return new Promise((resolve, reject) => {
      if (window.html2canvas) return resolve(window.html2canvas);
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
      script.onload = () => resolve(window.html2canvas);
      script.onerror = () => reject(new Error('فشل تحميل مكتبة التقاط الصور html2canvas'));
      document.head.appendChild(script);
    });
  }
};
