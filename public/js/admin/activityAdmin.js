/**
 * Suki Store Admin - Staff Activity Tracking & Audit Trail
 * Implements:
 * - Full audit logs of staff and admin actions (Order approvals, product updates, categories, customers, etc.)
 * - Daily, weekly, and monthly productivity stats per staff member
 * - Filter by staff, module, and date range
 * - Detailed table: Date/Time, Staff Name, Role, Module, Action, and Details
 */

const ActivityAdmin = {
  logs: [],
  stats: [],
  staffList: [],
  selectedStaff: 'all',
  selectedModule: 'all',
  selectedDateRange: 'all',

  async render() {
    AdminLayout.render('activity', `
      <div class="py-12 text-center text-slate-400">
        <i class="fa-solid fa-spinner fa-spin text-3xl mb-3 text-emerald-600"></i>
        <div>جاري جلب سجل النشاطات وتحركات الموظفين...</div>
      </div>
    `);

    try {
      // Fetch stats & logs concurrently
      const [statsRes, logsRes] = await Promise.all([
        API.get('/admin/activity-stats'),
        API.get('/admin/activity-logs', {
          staffId: this.selectedStaff,
          module: this.selectedModule,
          dateRange: this.selectedDateRange
        })
      ]);

      this.stats = statsRes.stats || [];
      this.logs = logsRes.logs || [];
      this.staffList = this.stats;

      this.renderContent();
    } catch (err) {
      console.error('Activity render error:', err);
      AdminLayout.render('activity', `
        <div class="py-12 text-center text-red-500">
          <i class="fa-solid fa-triangle-exclamation text-3xl mb-2"></i>
          <div>فشل تحميل سجل النشاطات: ${err.message || ''}</div>
        </div>
      `);
    }
  },

  renderContent() {
    const html = `
      <div>
        <!-- Title Header -->
        <div class="flex items-center justify-between mb-6 flex-wrap gap-4">
          <div>
            <h1 class="text-2xl font-extrabold text-slate-900 flex items-center gap-2">
              <i class="fa-solid fa-clipboard-check text-emerald-600"></i>
              <span>تتبع نشاط الموظفين والمشرفين (Audit Trail)</span>
            </h1>
            <p class="text-xs text-slate-500 mt-1">سجل محاسبة مفصل لجميع تحركات الموظفين: من اعتمد الطلبات، من عدل المنتجات، ومعدلات الأداء اليومية والأسبوعية</p>
          </div>
          <button onclick="ActivityAdmin.render()" class="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-3.5 py-2 rounded-xl text-xs flex items-center gap-1.5 transition-all">
            <i class="fa-solid fa-rotate-right"></i>
            <span>تحديث السجل</span>
          </button>
        </div>

        <!-- Staff Productivity KPI Cards -->
        <div class="mb-6">
          <h2 class="text-sm font-extrabold text-slate-800 mb-3 flex items-center gap-2">
            <i class="fa-solid fa-chart-line text-blue-600"></i>
            <span>معدل إنجاز كل موظف (تقييم الأداء)</span>
          </h2>
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            ${this.stats.map(staff => `
              <div class="admin-card p-4 hover:shadow-md transition-shadow border-r-4 ${staff.role === 'super_admin' ? 'border-r-purple-600' : 'border-r-emerald-600'}">
                <div class="flex items-center gap-3 mb-3">
                  <img src="${staff.avatar || 'https://api.dicebear.com/7.x/initials/svg?seed=' + encodeURIComponent(staff.name)}" class="w-10 h-10 rounded-full border border-slate-200" />
                  <div class="overflow-hidden">
                    <div class="font-bold text-slate-800 text-xs truncate">${staff.name}</div>
                    <span class="text-[10px] font-bold px-2 py-0.5 rounded-full ${staff.role === 'super_admin' ? 'bg-purple-100 text-purple-800' : 'bg-emerald-100 text-emerald-800'}">
                      ${staff.role === 'super_admin' ? 'مدير عام (Super Admin)' : 'موظف مسؤول (Staff)'}
                    </span>
                  </div>
                </div>

                <!-- KPI counts -->
                <div class="grid grid-cols-3 gap-2 bg-slate-50 p-2.5 rounded-xl text-center border border-slate-100">
                  <div>
                    <div class="text-[10px] text-slate-400 font-medium">اليوم</div>
                    <div class="text-xs font-extrabold text-emerald-700 mt-0.5">${staff.todayCount}</div>
                  </div>
                  <div class="border-x border-slate-200">
                    <div class="text-[10px] text-slate-400 font-medium">هذا الأسبوع</div>
                    <div class="text-xs font-extrabold text-blue-700 mt-0.5">${staff.weekCount}</div>
                  </div>
                  <div>
                    <div class="text-[10px] text-slate-400 font-medium">هذا الشهر</div>
                    <div class="text-xs font-extrabold text-purple-700 mt-0.5">${staff.monthCount}</div>
                  </div>
                </div>

                <div class="mt-2.5 flex items-center justify-between text-[11px] text-slate-500">
                  <span>إجمالي الإجراءات:</span>
                  <span class="font-extrabold text-slate-800">${staff.totalCount} حركة</span>
                </div>
              </div>
            `).join('')}
          </div>
        </div>

        <!-- Filter Bar -->
        <div class="admin-card mb-4 p-4">
          <div class="flex items-center justify-between mb-3 flex-wrap gap-2">
            <span class="text-xs font-extrabold text-slate-700 flex items-center gap-1.5">
              <i class="fa-solid fa-filter text-emerald-600"></i>
              <span>تصفية سجل النشاطات:</span>
            </span>
            <span class="text-xs font-bold text-slate-500">عدد الإجراءات المطابقة: ${this.logs.length}</span>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <!-- Staff Filter -->
            <div>
              <label class="form-label text-[11px] mb-1">الموظف / المشرف:</label>
              <select class="form-control text-xs" onchange="ActivityAdmin.changeStaffFilter(this.value)">
                <option value="all" ${this.selectedStaff === 'all' ? 'selected' : ''}>جميع الموظفين</option>
                ${this.staffList.map(s => `
                  <option value="${s.id}" ${this.selectedStaff === String(s.id) ? 'selected' : ''}>${s.name} (${s.role === 'super_admin' ? 'مدير' : 'موظف'})</option>
                `).join('')}
              </select>
            </div>

            <!-- Module Filter -->
            <div>
              <label class="form-label text-[11px] mb-1">القسم / الوحدة:</label>
              <select class="form-control text-xs" onchange="ActivityAdmin.changeModuleFilter(this.value)">
                <option value="all" ${this.selectedModule === 'all' ? 'selected' : ''}>كل الأقسام</option>
                <option value="orders" ${this.selectedModule === 'orders' ? 'selected' : ''}>الطلبات (Orders)</option>
                <option value="products" ${this.selectedModule === 'products' ? 'selected' : ''}>المنتجات (Products)</option>
                <option value="categories" ${this.selectedModule === 'categories' ? 'selected' : ''}>أقسام المتجر (Categories)</option>
                <option value="banners" ${this.selectedModule === 'banners' ? 'selected' : ''}>البانرات (Banners)</option>
                <option value="customers" ${this.selectedModule === 'customers' ? 'selected' : ''}>العملاء (Customers)</option>
                <option value="support" ${this.selectedModule === 'support' ? 'selected' : ''}>الدعم الفني والدردشة (Support)</option>
                <option value="staff" ${this.selectedModule === 'staff' ? 'selected' : ''}>الموظفين والصلاحيات (Staff)</option>
              </select>
            </div>

            <!-- Date Range Filter -->
            <div>
              <label class="form-label text-[11px] mb-1">الفترة الزمنية:</label>
              <select class="form-control text-xs" onchange="ActivityAdmin.changeDateRangeFilter(this.value)">
                <option value="all" ${this.selectedDateRange === 'all' ? 'selected' : ''}>كل الفترات</option>
                <option value="today" ${this.selectedDateRange === 'today' ? 'selected' : ''}>اليوم فقط</option>
                <option value="week" ${this.selectedDateRange === 'week' ? 'selected' : ''}>آخر 7 أيام</option>
                <option value="month" ${this.selectedDateRange === 'month' ? 'selected' : ''}>آخر 30 يوم</option>
              </select>
            </div>
          </div>
        </div>

        <!-- Audit Trail Table -->
        <div class="admin-card">
          <div class="admin-table-container">
            <table class="admin-table">
              <thead>
                <tr>
                  <th>التاريخ والوقت</th>
                  <th>اسم الموظف</th>
                  <th>القسم / الوحدة</th>
                  <th>الإجراء</th>
                  <th>تفاصيل العملية</th>
                </tr>
              </thead>
              <tbody>
                ${this.logs.length === 0 ? `
                  <tr>
                    <td colspan="5" class="text-center py-10 text-slate-400">
                      <i class="fa-solid fa-file-circle-xmark text-2xl mb-2 block"></i>
                      لا توجد تحركات مسجلة تطابق التصفية المحددة
                    </td>
                  </tr>
                ` : this.logs.map(log => {
                  const dateStr = new Date(log.createdAt).toLocaleString('ar-EG', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  });

                  return `
                    <tr>
                      <td class="font-mono text-xs text-slate-500 whitespace-nowrap">
                        ${dateStr}
                      </td>
                      <td>
                        <div class="flex items-center gap-2">
                          <div class="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center font-bold text-xs text-slate-700">
                            ${(log.userName || 'م')[0]}
                          </div>
                          <div>
                            <div class="font-bold text-slate-800 text-xs">${log.userName || 'غير معروف'}</div>
                            <span class="text-[9px] font-semibold text-slate-400">${log.userRole === 'super_admin' ? 'مدير عام' : 'موظف'}</span>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span class="bg-slate-100 text-slate-700 font-bold px-2.5 py-0.5 rounded text-[11px] inline-flex items-center gap-1">
                          ${ActivityAdmin.getModuleIcon(log.module)}
                          <span>${ActivityAdmin.formatModule(log.module)}</span>
                        </span>
                      </td>
                      <td>
                        <span class="font-bold text-xs ${ActivityAdmin.getActionColor(log.action)}">
                          ${ActivityAdmin.formatAction(log.action)}
                        </span>
                      </td>
                      <td class="text-xs text-slate-700 max-w-md">
                        <div class="font-medium">${log.details || '-'}</div>
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

    AdminLayout.render('activity', html);
  },

  async changeStaffFilter(val) {
    this.selectedStaff = val;
    await this.render();
  },

  async changeModuleFilter(val) {
    this.selectedModule = val;
    await this.render();
  },

  async changeDateRangeFilter(val) {
    this.selectedDateRange = val;
    await this.render();
  },

  getModuleIcon(mod) {
    switch (mod) {
      case 'orders': return '<i class="fa-solid fa-box text-blue-500"></i>';
      case 'products': return '<i class="fa-solid fa-bag-shopping text-emerald-500"></i>';
      case 'categories': return '<i class="fa-solid fa-tags text-amber-500"></i>';
      case 'banners': return '<i class="fa-solid fa-panorama text-purple-500"></i>';
      case 'customers': return '<i class="fa-solid fa-users text-indigo-500"></i>';
      case 'support': return '<i class="fa-solid fa-headset text-rose-500"></i>';
      case 'staff': return '<i class="fa-solid fa-user-shield text-slate-600"></i>';
      default: return '<i class="fa-solid fa-circle-dot text-slate-400"></i>';
    }
  },

  formatModule(mod) {
    const map = {
      orders: 'الطلبات',
      products: 'المنتجات',
      categories: 'الأقسام',
      banners: 'البانرات',
      customers: 'العملاء',
      support: 'الدعم الفني',
      staff: 'الموظفين'
    };
    return map[mod] || mod || 'عام';
  },

  formatAction(act) {
    const map = {
      UPDATE_ORDER_STATUS: 'تحديث حالة طلب',
      CREATE_PRODUCT: 'إضافة منتج جديد',
      UPDATE_PRODUCT: 'تعديل بيانات منتج',
      DELETE_PRODUCT: 'حذف منتج',
      CREATE_CATEGORY: 'إضافة قسم جديد',
      UPDATE_CATEGORY: 'تعديل قسم',
      DELETE_CATEGORY: 'حذف قسم',
      CREATE_BANNER: 'إضافة بانر',
      UPDATE_BANNER: 'تعديل بانر',
      DELETE_BANNER: 'حذف بانر',
      UPDATE_CUSTOMER: 'تعديل حساب عميل',
      LOCK_CUSTOMER: 'قفل حساب عميل',
      UNLOCK_CUSTOMER: 'فتح حساب عميل',
      CREATE_STAFF: 'إضافة موظف',
      UPDATE_STAFF: 'تعديل موظف وصلاحياته',
      DELETE_STAFF: 'حذف موظف',
      CLAIM_CHAT: 'استلام محادثة دعم',
      REPLY_CHAT: 'رد على استفسار عميل'
    };
    return map[act] || act;
  },

  getActionColor(act) {
    if (act.includes('DELETE') || act.includes('LOCK')) return 'text-red-600';
    if (act.includes('CREATE')) return 'text-emerald-700';
    if (act.includes('ORDER')) return 'text-blue-700';
    return 'text-slate-800';
  }
};
