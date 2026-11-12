/**
 * Suki Store Staff & Accountants Management (Super Admin Exclusive)
 * Manages Staff, Accountants (Full / View Only / Limited), Online Status & Hours Tracking, and Permissions Hierarchy
 */

const StaffAdmin = {
  staffList: [],
  editingStaffId: null,
  isCurrentUserHakim: false,

  async render() {
    if (State.user && State.user.role !== 'super_admin') {
      App.showToast('قسم إدارة الموظفين مخصص للمدير العام فقط (Super Admin)', 'error');
      window.location.hash = '#/admin';
      return;
    }

    AdminLayout.render('staff', `
      <div class="py-12 text-center text-slate-400">
        <i class="fa-solid fa-spinner fa-spin text-3xl mb-3 text-emerald-600"></i>
        <div>جاري جلب قائمة الموظفين والمحاسبين والصلاحيات...</div>
      </div>
    `);

    try {
      const res = await API.get('/admin/staff');
      this.staffList = res.staff || [];
      this.isCurrentUserHakim = Boolean(res.isCurrentUserHakim || State.user?.email === 'admin@suki.store' || State.user?.isOwner);
      this.renderTable();
    } catch (err) {
      console.error('Staff admin render error:', err);
      AdminLayout.render('staff', `
        <div class="admin-card p-8 text-center text-red-600">
          <p>فشل جلب بيانات الموظفين والمحاسبين: ${err.message || ''}</p>
          <button onclick="StaffAdmin.render()" class="mt-4 px-4 py-2 bg-emerald-600 text-white rounded-lg text-xs font-bold">إعادة المحاولة</button>
        </div>
      `);
    }
  },

  renderTable() {
    const html = `
      <div>
        <div class="flex items-center justify-between mb-6 flex-wrap gap-4">
          <div>
            <h1 class="text-2xl font-extrabold text-slate-900 flex items-center gap-2">
              <i class="fa-solid fa-users-gear text-emerald-600"></i>
              <span>إدارة حسابات الموظفين والمحاسبين</span>
            </h1>
            <p class="text-xs text-slate-500 mt-1">تحديد الأدوار، حسابات المحاسبين (كامل / مشاهدة فقط / محدودة)، وتتبع ساعات الحضور الفعلي والنشاط اليومي</p>
          </div>
          <button onclick="StaffAdmin.openModal()" class="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-4 py-2.5 rounded-xl text-xs flex items-center gap-2 shadow-md transition">
            <i class="fa-solid fa-user-plus"></i>
            <span>إضافة حساب موظف / محاسب جديد</span>
          </button>
        </div>

        <!-- Summary KPIs -->
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <div class="admin-card p-4 flex items-center gap-3">
            <div class="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center font-bold text-lg">
              <i class="fa-solid fa-user-check"></i>
            </div>
            <div>
              <div class="text-[11px] text-slate-500 font-bold">المتواجدون الآن (أونلاين)</div>
              <div class="text-lg font-black text-emerald-700">${this.staffList.filter(s => s.isOnline).length} متصل</div>
            </div>
          </div>

          <div class="admin-card p-4 flex items-center gap-3">
            <div class="w-10 h-10 rounded-xl bg-purple-100 text-purple-600 flex items-center justify-center font-bold text-lg">
              <i class="fa-solid fa-calculator"></i>
            </div>
            <div>
              <div class="text-[11px] text-slate-500 font-bold">حسابات المحاسبين الماليين</div>
              <div class="text-lg font-black text-purple-700">${this.staffList.filter(s => s.role === 'accountant').length} محاسب</div>
            </div>
          </div>

          <div class="admin-card p-4 flex items-center gap-3">
            <div class="w-10 h-10 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center font-bold text-lg">
              <i class="fa-solid fa-users"></i>
            </div>
            <div>
              <div class="text-[11px] text-slate-500 font-bold">إجمالي فريق العمل</div>
              <div class="text-lg font-black text-slate-800">${this.staffList.length} مستخدم</div>
            </div>
          </div>
        </div>

        <div class="admin-card">
          <div class="admin-table-container">
            <table class="admin-table">
              <thead>
                <tr>
                  <th>الموظف / الاسم</th>
                  <th>الدور والمستوى</th>
                  <th>الاتصال الفعلي</th>
                  <th>ساعات العمل اليوم</th>
                  <th>البريد الإلكتروني</th>
                  <th>الصلاحيات</th>
                  <th>حالة الحساب</th>
                  <th>الإجراءات</th>
                </tr>
              </thead>
              <tbody>
                ${this.staffList.map(s => {
                  const isSuper = s.role === 'super_admin';
                  const isAccountant = s.role === 'accountant';
                  const isOwner = Boolean(s.isOwner || s.email === 'admin@suki.store');
                  const p = s.permissions || {};
                  const isOnline = Boolean(s.isOnline);
                  const onlineText = s.onlineHoursFormatted || '0 دقيقة';

                  let levelBadge = '';
                  if (isAccountant) {
                    const lvl = s.accountingLevel || 'full';
                    if (lvl === 'full') levelBadge = '<span class="bg-purple-100 text-purple-800 text-[10px] px-1.5 py-0.5 rounded font-extrabold mr-1">كامل</span>';
                    else if (lvl === 'view_only') levelBadge = '<span class="bg-amber-100 text-amber-800 text-[10px] px-1.5 py-0.5 rounded font-extrabold mr-1">مشاهدة فقط</span>';
                    else levelBadge = '<span class="bg-blue-100 text-blue-800 text-[10px] px-1.5 py-0.5 rounded font-extrabold mr-1">محدودة</span>';
                  }

                  // Hierarchy Check
                  let canEdit = true;
                  let canDelete = true;

                  if (isOwner) {
                    // Mohamed Hakim cannot be edited or deleted by anyone other than himself
                    if (!this.isCurrentUserHakim || State.user?.id === s.id) {
                      canDelete = false;
                    }
                    if (!this.isCurrentUserHakim) {
                      canEdit = false;
                    }
                  } else if (isSuper) {
                    // Ahmed Gharib or other super admins can be managed by Mohamed Hakim
                    if (!this.isCurrentUserHakim) {
                      canDelete = false;
                      canEdit = false;
                    }
                  }

                  return `
                    <tr class="${isOnline ? 'bg-emerald-50/20' : ''}">
                      <td>
                        <div class="flex items-center gap-2.5">
                          <div class="relative">
                            <img src="${s.avatar || 'https://api.dicebear.com/7.x/initials/svg?seed=' + encodeURIComponent(s.name)}" class="w-9 h-9 rounded-full border border-slate-200 object-cover" />
                            <span class="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border border-white ${isOnline ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'}" title="${isOnline ? 'أونلاين الآن' : 'أوفلاين'}"></span>
                          </div>
                          <div>
                            <div class="font-extrabold text-slate-800 text-xs flex items-center gap-1">
                              <span>${s.name}</span>
                              ${isOwner ? '<i class="fa-solid fa-crown text-amber-500 text-[11px]" title="المدير العام والمالك"></i>' : ''}
                            </div>
                            <div class="text-[10px] text-slate-400 font-mono">${s.phone || 'بدون هاتف'}</div>
                          </div>
                        </div>
                      </td>

                      <td>
                        <div class="flex items-center gap-1 flex-wrap">
                          ${isOwner ? `
                            <span class="bg-amber-100 text-amber-900 border border-amber-300 font-black px-2 py-0.5 rounded text-[11px]">
                              المدير العام والمالك
                            </span>
                          ` : isSuper ? `
                            <span class="bg-blue-100 text-blue-900 border border-blue-200 font-bold px-2 py-0.5 rounded text-[11px]">
                              شريك الإدارة (Super Admin)
                            </span>
                          ` : isAccountant ? `
                            <span class="bg-purple-50 text-purple-700 border border-purple-200 font-bold px-2 py-0.5 rounded text-[11px] flex items-center">
                              <i class="fa-solid fa-calculator ml-1 text-purple-600"></i>
                              محاسب مالي ${levelBadge}
                            </span>
                          ` : `
                            <span class="bg-slate-100 text-slate-700 font-bold px-2 py-0.5 rounded text-[11px]">
                              موظف محدد الصلاحيات
                            </span>
                          `}
                        </div>
                      </td>

                      <td>
                        ${isOnline ? `
                          <span class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800">
                            <span class="w-1.5 h-1.5 rounded-full bg-emerald-600"></span>
                            أونلاين
                          </span>
                        ` : `
                          <span class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-500">
                            <span class="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
                            أوفلاين
                          </span>
                        `}
                      </td>

                      <td>
                        <div class="flex items-center gap-2 flex-wrap">
                          <span class="text-xs font-bold ${isOnline ? 'text-emerald-700 font-black' : 'text-slate-600'}">
                            <i class="fa-regular fa-clock ml-1 text-slate-400"></i>
                            ${onlineText}
                          </span>
                          <button 
                            type="button" 
                            onclick="StaffAdmin.openDailyActivityModal('${s.id}')" 
                            class="text-[10px] font-black bg-slate-100 hover:bg-emerald-50 hover:text-emerald-700 text-slate-700 border border-slate-200 hover:border-emerald-300 px-2 py-0.5 rounded-lg transition flex items-center gap-1 cursor-pointer" 
                            title="تقرير ساعات العمل بالأيام">
                            <i class="fa-solid fa-chart-simple text-[9px] text-emerald-600"></i>
                            <span>تقرير الأيام</span>
                          </button>
                        </div>
                      </td>

                      <td class="text-xs font-mono text-slate-600">${s.email}</td>

                      <td>
                        ${isSuper ? `
                          <span class="text-[11px] font-black text-amber-600 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">كامل الصلاحيات ⚡</span>
                        ` : `
                          <div class="flex flex-wrap gap-1 max-w-xs">
                            ${isAccountant ? '<span class="bg-purple-100 text-purple-800 px-1.5 py-0.5 rounded text-[10px] font-bold">المحاسبة</span>' : ''}
                            ${p.canManageProducts ? '<span class="bg-emerald-50 text-emerald-700 px-1 py-0.5 rounded text-[10px] font-bold">منتجات</span>' : ''}
                            ${p.canManageOrders ? '<span class="bg-blue-50 text-blue-700 px-1 py-0.5 rounded text-[10px] font-bold">طلبات</span>' : ''}
                            ${p.canManageCustomers ? '<span class="bg-indigo-50 text-indigo-700 px-1 py-0.5 rounded text-[10px] font-bold">عملاء</span>' : ''}
                            ${p.canManageMerchants ? '<span class="bg-amber-50 text-amber-700 px-1 py-0.5 rounded text-[10px] font-bold">تجار</span>' : ''}
                            ${p.canManageInvestors ? '<span class="bg-teal-50 text-teal-700 px-1 py-0.5 rounded text-[10px] font-bold">مستثمرون</span>' : ''}
                            ${p.canManageExpenses ? '<span class="bg-rose-50 text-rose-700 px-1 py-0.5 rounded text-[10px] font-bold">مصروفات</span>' : ''}
                            ${p.canManageReturns ? '<span class="bg-pink-50 text-pink-700 px-1 py-0.5 rounded text-[10px] font-bold">مرتجعات</span>' : ''}
                            ${p.canViewReports ? '<span class="bg-cyan-50 text-cyan-700 px-1 py-0.5 rounded text-[10px] font-bold">تقارير</span>' : ''}
                          </div>
                        `}
                      </td>

                      <td>
                        <span class="status-pill ${s.isActive !== false ? 'status-active' : 'status-locked'}">
                          ${s.isActive !== false ? 'نشط' : 'معطل'}
                        </span>
                      </td>

                      <td>
                        <div class="flex items-center gap-1.5">
                          ${canEdit ? `
                            <button onclick="StaffAdmin.editStaff('${s.id}')" class="btn-icon-action" title="تعديل الحساب والصلاحيات">
                              <i class="fa-solid fa-user-gear text-blue-600"></i>
                            </button>
                          ` : ''}

                          ${canDelete ? `
                            <button onclick="StaffAdmin.deleteStaff('${s.id}')" class="btn-icon-action danger" title="حذف الحساب">
                              <i class="fa-solid fa-trash text-red-600"></i>
                            </button>
                          ` : ''}

                          ${!canEdit && !canDelete ? `
                            <span class="text-[11px] font-bold text-slate-400 flex items-center gap-1" title="حساب المالك الرئيسي محمي">
                              <i class="fa-solid fa-shield text-amber-500"></i> محمي
                            </span>
                          ` : ''}
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

    AdminLayout.render('staff', html);
  },

  openModal(staff = null) {
    this.editingStaffId = staff ? staff.id : null;
    const isEdit = Boolean(staff);
    const p = staff ? (staff.permissions || {}) : {};
    const role = staff ? staff.role : 'staff';
    const accLevel = staff?.accountingLevel || 'full';
    const isOwner = Boolean(staff && (staff.isOwner || staff.email === 'admin@suki.store'));

    const modalBody = `
      <form onsubmit="StaffAdmin.submitForm(event)" class="text-right space-y-4">
        <div class="form-group">
          <label class="form-label font-bold text-xs">اسم الموظف أو المحاسب *</label>
          <input type="text" id="staff-name" class="form-control text-xs" value="${staff ? staff.name : ''}" required />
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div class="form-group">
            <label class="form-label font-bold text-xs">البريد الإلكتروني *</label>
            <input type="email" id="staff-email" class="form-control text-xs font-mono" value="${staff ? staff.email : ''}" ${isEdit ? 'disabled' : 'required'} />
          </div>
          <div class="form-group">
            <label class="form-label font-bold text-xs">رقم الجوال</label>
            <input type="tel" id="staff-phone" class="form-control text-xs font-mono" value="${staff ? (staff.phone || '') : ''}" />
          </div>
        </div>

        <!-- Role Selector -->
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div class="form-group">
            <label class="form-label font-bold text-xs">الدور الوظيفي *</label>
            <select id="staff-role" class="form-control text-xs font-bold" onchange="StaffAdmin.toggleRoleFields()" ${isOwner ? 'disabled' : ''}>
              <option value="staff" ${role === 'staff' ? 'selected' : ''}>موظف تشغيل ومتابعة (Staff)</option>
              <option value="accountant" ${role === 'accountant' ? 'selected' : ''}>محاسب مالي (Accountant)</option>
              ${this.isCurrentUserHakim ? `<option value="super_admin" ${role === 'super_admin' ? 'selected' : ''}>شريك إدارة (Super Admin)</option>` : ''}
            </select>
          </div>

          <!-- Accountant Level Selector (Shown when role is accountant) -->
          <div id="accountant-level-group" class="form-group ${role === 'accountant' ? '' : 'hidden'}">
            <label class="form-label font-bold text-xs text-purple-700">مستوى صلاحيات المحاسب *</label>
            <select id="staff-accounting-level" class="form-control text-xs font-bold border-purple-300 bg-purple-50">
              <option value="full" ${accLevel === 'full' ? 'selected' : ''}>كامل (إدارة المصروفات والتجار والتقارير والتعديل)</option>
              <option value="view_only" ${accLevel === 'view_only' ? 'selected' : ''}>مشاهدة فقط (استعراض التقارير دون إمكانية التعديل)</option>
              <option value="limited" ${accLevel === 'limited' ? 'selected' : ''}>محدودة (متابعة التوريدات والتحصيل دون حذف بنود)</option>
            </select>
          </div>
        </div>

        <div class="form-group">
          <label class="form-label font-bold text-xs">${isEdit ? 'كلمة مرور جديدة (اتركها فارغة إن لم ترغب في التغيير)' : 'كلمة المرور *'}</label>
          <input type="password" id="staff-password" class="form-control text-xs font-mono" minlength="6" ${isEdit ? '' : 'required'} />
          <p class="text-[10px] text-slate-400 mt-1">يجب أن تحتوي على 6 أحرف على الأقل</p>
        </div>

        <!-- Permissions Matrix -->
        <div id="permissions-container" class="form-group border rounded-xl p-3 bg-slate-50">
          <div class="flex items-center justify-between pb-2 mb-2 border-b border-slate-200">
            <label class="form-label font-bold text-slate-800 m-0 text-xs">الصلاحيات المخصصة:</label>
            <div class="flex items-center gap-2">
              <button type="button" onclick="StaffAdmin.selectAllPermissions()" class="text-[11px] font-bold text-emerald-700 hover:text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                تحديد الكل
              </button>
              <button type="button" onclick="StaffAdmin.deselectAllPermissions()" class="text-[11px] font-bold text-slate-600 hover:text-slate-700 bg-slate-200 px-2 py-0.5 rounded">
                إلغاء
              </button>
            </div>
          </div>

          <div class="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
            <label class="flex items-center gap-1.5 p-1.5 rounded border border-emerald-200 bg-emerald-50/50 cursor-pointer col-span-2 sm:col-span-3">
              <input type="checkbox" id="perm-dashboard" class="accent-emerald-600 w-4 h-4" ${p.canViewDashboard !== false ? 'checked' : ''} />
              <span class="font-extrabold text-emerald-950">عرض الصفحة الرئيسية (الداشبورد)</span>
            </label>

            <label class="flex items-center gap-1.5 p-1.5 rounded border border-slate-200 bg-white cursor-pointer">
              <input type="checkbox" id="perm-products" class="accent-emerald-600" ${p.canManageProducts ? 'checked' : ''} />
              <span>إدارة المنتجات</span>
            </label>

            <label class="flex items-center gap-1.5 p-1.5 rounded border border-slate-200 bg-white cursor-pointer">
              <input type="checkbox" id="perm-categories" class="accent-emerald-600" ${p.canManageCategories ? 'checked' : ''} />
              <span>إدارة الأقسام</span>
            </label>

            <label class="flex items-center gap-1.5 p-1.5 rounded border border-slate-200 bg-white cursor-pointer">
              <input type="checkbox" id="perm-orders" class="accent-emerald-600" ${p.canManageOrders ? 'checked' : ''} />
              <span>إدارة الطلبات</span>
            </label>

            <label class="flex items-center gap-1.5 p-1.5 rounded border border-slate-200 bg-white cursor-pointer">
              <input type="checkbox" id="perm-customers" class="accent-emerald-600" ${p.canManageCustomers ? 'checked' : ''} />
              <span>إدارة العملاء</span>
            </label>

            <label class="flex items-center gap-1.5 p-1.5 rounded border border-slate-200 bg-white cursor-pointer">
              <input type="checkbox" id="perm-accounting" class="accent-purple-600" ${p.canManageAccounting || role === 'accountant' ? 'checked' : ''} />
              <span class="text-purple-700 font-bold">المحاسبة المالية</span>
            </label>

            <label class="flex items-center gap-1.5 p-1.5 rounded border border-slate-200 bg-white cursor-pointer">
              <input type="checkbox" id="perm-merchants" class="accent-purple-600" ${p.canManageMerchants || role === 'accountant' ? 'checked' : ''} />
              <span class="text-purple-700 font-bold">إدارة التجار</span>
            </label>

            <label class="flex items-center gap-1.5 p-1.5 rounded border border-slate-200 bg-white cursor-pointer">
              <input type="checkbox" id="perm-investors" class="accent-teal-600" ${p.canManageInvestors ? 'checked' : ''} />
              <span class="text-teal-700 font-bold">إدارة المستثمرين</span>
            </label>

            <label class="flex items-center gap-1.5 p-1.5 rounded border border-slate-200 bg-white cursor-pointer">
              <input type="checkbox" id="perm-expenses" class="accent-purple-600" ${p.canManageExpenses || (role === 'accountant' && accLevel === 'full') ? 'checked' : ''} />
              <span class="text-purple-700 font-bold">المصروفات والإيرادات</span>
            </label>

            <label class="flex items-center gap-1.5 p-1.5 rounded border border-slate-200 bg-white cursor-pointer">
              <input type="checkbox" id="perm-returns" class="accent-pink-600" ${p.canManageReturns ? 'checked' : ''} />
              <span>المرتجعات والضمان</span>
            </label>

            <label class="flex items-center gap-1.5 p-1.5 rounded border border-slate-200 bg-white cursor-pointer">
              <input type="checkbox" id="perm-coupons" class="accent-emerald-600" ${p.canManageCoupons ? 'checked' : ''} />
              <span>الكوبونات</span>
            </label>

            <label class="flex items-center gap-1.5 p-1.5 rounded border border-slate-200 bg-white cursor-pointer">
              <input type="checkbox" id="perm-banners" class="accent-emerald-600" ${p.canManageBanners ? 'checked' : ''} />
              <span>البانرات</span>
            </label>

            <label class="flex items-center gap-1.5 p-1.5 rounded border border-slate-200 bg-white cursor-pointer">
              <input type="checkbox" id="perm-support" class="accent-emerald-600" ${p.canManageSupport ? 'checked' : ''} />
              <span>الدعم الفني</span>
            </label>

            <label class="flex items-center gap-1.5 p-1.5 rounded border border-slate-200 bg-white cursor-pointer">
              <input type="checkbox" id="perm-livechat" class="accent-emerald-600" ${p.canManageLiveChat ? 'checked' : ''} />
              <span>الشات المباشر</span>
            </label>

            <label class="flex items-center gap-1.5 p-1.5 rounded border border-slate-200 bg-white cursor-pointer">
              <input type="checkbox" id="perm-push" class="accent-emerald-600" ${p.canManagePush ? 'checked' : ''} />
              <span>إشعارات الويب</span>
            </label>

            <label class="flex items-center gap-1.5 p-1.5 rounded border border-slate-200 bg-white cursor-pointer">
              <input type="checkbox" id="perm-reports" class="accent-emerald-600" ${p.canViewReports || role === 'accountant' ? 'checked' : ''} />
              <span>التقارير المالية</span>
            </label>

            <label class="flex items-center gap-1.5 p-1.5 rounded border border-slate-200 bg-white cursor-pointer">
              <input type="checkbox" id="perm-activity" class="accent-emerald-600" ${p.canViewActivity ? 'checked' : ''} />
              <span>سجل النشاطات</span>
            </label>
          </div>
        </div>

        ${isEdit ? `
          <div class="form-group">
            <label class="flex items-center gap-2 text-xs font-bold cursor-pointer">
              <input type="checkbox" id="staff-active" ${staff.isActive !== false ? 'checked' : ''} class="accent-emerald-600 w-4 h-4" ${isOwner ? 'disabled' : ''} />
              <span>الحساب نشط ويمكنه تسجيل الدخول للوحة التحكم</span>
            </label>
          </div>
        ` : ''}

        <button type="submit" class="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3.5 rounded-xl text-xs shadow-md transition">
          ${isEdit ? 'حفظ تعديلات الحساب والصلاحيات' : 'إنشاء الحساب وتعيين الصلاحيات'}
        </button>
      </form>
    `;

    App.openModal(isEdit ? 'تعديل بيانات وصلاحيات الحساب' : 'إضافة حساب جديد (موظف / محاسب)', modalBody);
  },

  toggleRoleFields() {
    const roleSelect = document.getElementById('staff-role');
    const accGroup = document.getElementById('accountant-level-group');
    if (!roleSelect || !accGroup) return;

    if (roleSelect.value === 'accountant') {
      accGroup.classList.remove('hidden');
      document.getElementById('perm-accounting').checked = true;
      document.getElementById('perm-merchants').checked = true;
      document.getElementById('perm-expenses').checked = true;
      document.getElementById('perm-reports').checked = true;
    } else {
      accGroup.classList.add('hidden');
    }
  },

  selectAllPermissions() {
    const checkboxes = document.querySelectorAll('#permissions-container input[type="checkbox"]');
    checkboxes.forEach(cb => { cb.checked = true; });
  },

  deselectAllPermissions() {
    const checkboxes = document.querySelectorAll('#permissions-container input[type="checkbox"]');
    checkboxes.forEach(cb => { cb.checked = false; });
  },

  editStaff(id) {
    const staff = this.staffList.find(s => s.id === id);
    if (staff) this.openModal(staff);
  },

  deleteStaff(id) {
    const s = this.staffList.find(item => item.id === id);
    const name = s ? s.name : '';
    App.confirm(`هل أنت متأكد من حذف الحساب "${name}" نهائياً من النظام؟`, async () => {
      try {
        const res = await API.delete(`/admin/staff/${id}`);
        if (res.success) {
          App.showToast(res.message || 'تم حذف الحساب بنجاح', 'success');
          this.render();
        }
      } catch (err) {
        App.showToast(err.message, 'error');
      }
    });
  },

  async submitForm(e) {
    e.preventDefault();
    const name = document.getElementById('staff-name').value.trim();
    const phone = document.getElementById('staff-phone').value.trim();
    const password = document.getElementById('staff-password').value;
    const role = document.getElementById('staff-role').value;
    const accountingLevel = (role === 'accountant') ? document.getElementById('staff-accounting-level')?.value : undefined;

    const permissions = {
      canViewDashboard: document.getElementById('perm-dashboard')?.checked ?? true,
      canManageProducts: document.getElementById('perm-products')?.checked || false,
      canManageCategories: document.getElementById('perm-categories')?.checked || false,
      canManageOrders: document.getElementById('perm-orders')?.checked || false,
      canManageCustomers: document.getElementById('perm-customers')?.checked || false,
      canManageCoupons: document.getElementById('perm-coupons')?.checked || false,
      canManageBanners: document.getElementById('perm-banners')?.checked || false,
      canManageSupport: document.getElementById('perm-support')?.checked || false,
      canManageLiveChat: document.getElementById('perm-livechat')?.checked || false,
      canManagePush: document.getElementById('perm-push')?.checked || false,
      canViewReports: document.getElementById('perm-reports')?.checked || false,
      canViewActivity: document.getElementById('perm-activity')?.checked || false,
      canManageAccounting: document.getElementById('perm-accounting')?.checked || false,
      canManageMerchants: document.getElementById('perm-merchants')?.checked || false,
      canManageInvestors: document.getElementById('perm-investors')?.checked || false,
      canManageExpenses: document.getElementById('perm-expenses')?.checked || false,
      canManageReturns: document.getElementById('perm-returns')?.checked || false,
      accountingLevel: accountingLevel || 'full'
    };

    try {
      if (this.editingStaffId) {
        const isActive = document.getElementById('staff-active')?.checked ?? true;
        const res = await API.put(`/admin/staff/${this.editingStaffId}`, {
          name,
          phone,
          isActive,
          role,
          accountingLevel,
          permissions,
          newPassword: password || undefined
        });

        if (res.success) {
          App.closeModal();
          App.showToast(res.message, 'success');
          this.render();
        }
      } else {
        const email = document.getElementById('staff-email').value.trim();
        const res = await API.post('/admin/staff', {
          name,
          email,
          phone,
          password,
          role,
          accountingLevel,
          permissions
        });

        if (res.success) {
          App.closeModal();
          App.showToast(res.message, 'success');
          this.render();
        }
      }
    } catch (err) {
      App.showToast(err.message, 'error');
    }
  },

  async openDailyActivityModal(staffId) {
    try {
      App.showToast('جاري جلب تقرير نشاط وساعات العمل...', 'info');
      const res = await API.get(`/admin/staff/${staffId}/daily-activity`);
      if (!res.success) throw new Error(res.message || 'فشل جلب التقرير');

      const s = res.staff;
      const sum = res.summary;
      const days = res.days || [];

      const modalBody = `
        <div class="space-y-4 text-right" dir="rtl">
          <!-- Top KPI Cards -->
          <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-xs">
            <div class="bg-slate-50 border border-slate-200 p-3 rounded-xl">
              <div class="text-[10px] text-slate-500 font-bold">الحالة اللحظية</div>
              <div class="text-xs font-black mt-1 ${s.isOnline ? 'text-emerald-700' : 'text-slate-500'}">
                ${s.isOnline ? '🟢 أونلاين على الداشبورد' : '⚪ أوفلاين (غير متواجد)'}
              </div>
            </div>
            <div class="bg-emerald-50 border border-emerald-200 p-3 rounded-xl">
              <div class="text-[10px] text-emerald-800 font-bold">نشاط اليوم</div>
              <div class="text-xs font-black text-emerald-700 mt-1">${s.todayFormatted || '0 دقيقة'}</div>
            </div>
            <div class="bg-blue-50 border border-blue-200 p-3 rounded-xl">
              <div class="text-[10px] text-blue-800 font-bold">إجمالي الساعات المسجلة</div>
              <div class="text-xs font-black text-blue-700 mt-1">${sum.totalFormatted || '0 دقيقة'}</div>
            </div>
            <div class="bg-amber-50 border border-amber-200 p-3 rounded-xl">
              <div class="text-[10px] text-amber-800 font-bold">إجمالي أيام العمل</div>
              <div class="text-xs font-black text-amber-700 mt-1">${sum.totalDays} يوم نشط</div>
            </div>
          </div>

          <!-- Notice on Dashboard-Only Tracking -->
          <div class="bg-slate-50 border border-slate-200 text-slate-600 p-2.5 rounded-xl text-[11px] font-bold flex items-center gap-2">
            <i class="fa-solid fa-circle-info text-emerald-600 text-sm"></i>
            <span>يتم احتساب ساعات العمل فقط عندما يكون الموظف فاتحاً لصفحة الداشبورد، ويتوقف العداد فور إغلاق التاب أو مغادرة الصفحة.</span>
          </div>

          <!-- Days Table -->
          <div class="overflow-x-auto rounded-xl border border-slate-200 max-h-72 overflow-y-auto">
            <table class="w-full text-right text-xs">
              <thead class="bg-slate-50 text-slate-700 font-extrabold border-b border-slate-200 sticky top-0 z-10">
                <tr>
                  <th class="py-2.5 px-3">التاريخ واليوم</th>
                  <th class="py-2.5 px-3 text-center">ساعات العمل</th>
                  <th class="py-2.5 px-3">مستوى الإنجاز</th>
                  <th class="py-2.5 px-3 text-center">أول دخول</th>
                  <th class="py-2.5 px-3 text-center">آخر نشاط</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100 bg-white">
                ${days.length === 0 ? `
                  <tr>
                    <td colspan="5" class="py-8 text-center text-slate-400 font-bold">لا يوجد نشاط مسجل بعد لهذا الحساب</td>
                  </tr>
                ` : days.map(d => {
                  const pct = Math.min(100, Math.round(((d.seconds || 0) / (8 * 3600)) * 100));
                  return `
                    <tr class="hover:bg-slate-50 transition">
                      <td class="py-2.5 px-3 font-bold text-slate-800">
                        <div>${new Date(d.date).toLocaleDateString('ar-EG', { weekday: 'long', year: 'numeric', month: 'short', day: 'numeric' })}</div>
                        <div class="font-mono text-[10px] text-slate-400">${d.date}</div>
                      </td>
                      <td class="py-2.5 px-3 text-center font-black text-emerald-700 text-xs">
                        ${d.formatted}
                      </td>
                      <td class="py-2.5 px-3">
                        <div class="w-28 bg-slate-100 rounded-full h-2 overflow-hidden border border-slate-200">
                          <div class="bg-emerald-600 h-full rounded-full" style="width: ${pct}%"></div>
                        </div>
                        <span class="text-[9px] text-slate-400 mt-0.5 block font-mono">${pct}% من وردية 8 ساعات</span>
                      </td>
                      <td class="py-2.5 px-3 text-center font-mono text-[11px] text-slate-600">
                        ${d.firstActiveAt ? new Date(d.firstActiveAt).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }) : '-'}
                      </td>
                      <td class="py-2.5 px-3 text-center font-mono text-[11px] text-slate-600">
                        ${d.lastActiveAt ? new Date(d.lastActiveAt).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }) : '-'}
                      </td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>

          <div class="flex justify-end pt-2 border-t">
            <button type="button" onclick="App.closeModal()" class="px-5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition">
              إغلاق
            </button>
          </div>
        </div>
      `;

      App.openModal(`سجل وساعات عمل الموظف: ${s.name} (${s.email})`, modalBody);
    } catch (err) {
      console.error('Open daily activity error:', err);
      App.showToast(err.message || 'فشل جلب تقرير نشاط الموظف', 'error');
    }
  }
};
