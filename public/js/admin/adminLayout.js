/**
 * Suki Store Admin Dashboard Layout & Navigation Guard
 */

const AdminLayout = {
  checkAccess() {
    const user = State.user;
    if (!user) {
      this.renderAdminLogin();
      return false;
    }

    if (user.role !== 'super_admin' && user.role !== 'admin' && user.role !== 'staff' && user.role !== 'accountant' && user.role !== 'merchant' && user.role !== 'investor') {
      this.renderUnauthorized();
      return false;
    }

    if ((user.role === 'staff' || user.role === 'accountant' || user.role === 'merchant' || user.role === 'investor') && user.isActive === false) {
      this.renderDisabledStaff();
      return false;
    }

    return true;
  },

  hasPermission(permName) {
    const user = State.user;
    if (!user) return false;
    if (user.role === 'super_admin' || user.role === 'admin') return true;
    if (user.role === 'merchant') {
      // Merchants only use their own view-only portal (see App.handleAdminRoutes)
      return permName === 'canViewDashboard';
    }
    if (user.role === 'investor') {
      return permName === 'canViewDashboard' || permName === 'canManageProducts' || permName === 'canManageInvestors';
    }
    if (permName === 'canViewDashboard') {
      return user.permissions?.canViewDashboard !== false;
    }
    if (user.role === 'accountant') {
      return permName === 'canManageAccounting' || permName === 'canViewReports';
    }
    if (user.role === 'staff') {
      if (permName === 'canManageReturns') {
        return Boolean(user.permissions?.canManageReturns || user.permissions?.canManageOrders);
      }
      if (permName === 'canManageMerchants') {
        return Boolean(user.permissions?.canManageMerchants || user.permissions?.canManageProducts);
      }
      return Boolean(user.permissions && user.permissions[permName]);
    }
    return false;
  },

  toggleSidebar() {
    const sidebar = document.querySelector('.admin-sidebar');
    const backdrop = document.getElementById('admin-sidebar-backdrop');
    if (sidebar) sidebar.classList.toggle('open');
    if (backdrop) backdrop.classList.toggle('hidden');
  },

  closeSidebar() {
    const sidebar = document.querySelector('.admin-sidebar');
    const backdrop = document.getElementById('admin-sidebar-backdrop');
    if (sidebar) sidebar.classList.remove('open');
    if (backdrop) backdrop.classList.add('hidden');
  },

  render(activeSection = 'dashboard', contentHtml = '') {
    if (!this.checkAccess()) return;

    const user = State.user;
    const isSuper = user.role === 'super_admin' || user.role === 'admin';
    const isMerchant = user.role === 'merchant';
    const isInvestor = user.role === 'investor';
    const isAccountant = user.role === 'accountant' || Boolean(user.permissions?.canManageAccounting);
    const canSeeAccounting = !isMerchant && !isInvestor && (isSuper || isAccountant);

    // Guard merchant from accessing unauthorized admin sections
    if (isMerchant && !['merchant-account', 'merchant-products', 'merchant-orders'].includes(activeSection)) {
      App.showToast('هذا القسم مخصص لإدارة المتجر فقط', 'warning');
      window.location.hash = '#/admin';
      return;
    }

    // Guard investor from accessing unauthorized admin sections
    if (isInvestor && activeSection !== 'dashboard' && activeSection !== 'products' && activeSection !== 'investor-accounting') {
      App.showToast('حساب المستثمر مخصص لمتابعة المنتجات وحسابات الأرباح فقط', 'info');
      window.location.hash = '#/admin/investor-accounting';
      return;
    }

    // Hide normal store header, footer, chatbot widget & PWA banner when in admin layout
    const header = document.getElementById('site-header');
    const footer = document.getElementById('site-footer');
    const mobileNav = document.getElementById('mobile-bottom-nav');
    const chatbot = document.getElementById('suki-chatbot-wrapper');
    const pwaBanner = document.getElementById('pwa-mobile-install-banner');

    if (header) header.style.display = 'none';
    if (footer) footer.style.display = 'none';
    if (mobileNav) mobileNav.style.display = 'none';
    if (chatbot) chatbot.style.display = 'none';
    if (pwaBanner) pwaBanner.style.display = 'none';

    const roleBadgeHtml = isSuper
      ? '👑 المدير العام (Super Admin)'
      : (user.role === 'accountant'
          ? '💼 المحاسب المالي (Accountant)'
          : (isMerchant
              ? `🏪 حساب تاجر: ${user.merchantCode || user.name}`
              : (isInvestor
                  ? `💼 حساب مستثمر: ${user.investorCode || user.name}`
                  : '👨‍💼 حساب موظف (Staff)')));

    const main = document.getElementById('main-content');

    main.innerHTML = `
      <div class="admin-layout">
        <!-- Mobile & Tablet Sidebar Backdrop -->
        <div id="admin-sidebar-backdrop" class="admin-sidebar-backdrop hidden" onclick="AdminLayout.closeSidebar()"></div>

        <!-- Sidebar -->
        <aside class="admin-sidebar">
          <div class="admin-sidebar-header">
            <div class="flex items-center gap-2.5 flex-1 min-w-0">
              <img src="/icons/icon-192.png" class="w-9 h-9 rounded-xl object-contain shadow-sm border border-emerald-500/30 flex-shrink-0" alt="سوقي ستور" />
              <div class="min-w-0">
                <div class="admin-sidebar-logo truncate">سوقي ستور</div>
                <span class="admin-role-badge ${isSuper ? 'super' : (isMerchant ? 'merchant' : '')} truncate block">
                  ${roleBadgeHtml}
                </span>
              </div>
            </div>
            <!-- Close button on Mobile/Tablet -->
            <button type="button" onclick="AdminLayout.closeSidebar()" class="admin-sidebar-close-btn" title="إغلاق القائمة">
              <i class="fa-solid fa-xmark"></i>
            </button>
          </div>

          <!-- Dynamic Permissions Nav -->
          <nav class="admin-nav">
            ${isInvestor ? `
              <!-- Dedicated Investor Nav -->
              <a href="#/admin" class="admin-nav-item ${activeSection === 'dashboard' || activeSection === 'investor-accounting' ? 'active' : ''}" onclick="AdminLayout.closeSidebar()">
                <i class="fa-solid fa-chart-pie text-blue-400"></i>
                <span>داشبورد وحسابات المستثمر</span>
              </a>
              <a href="#/admin/products" class="admin-nav-item ${activeSection === 'products' ? 'active' : ''}" onclick="AdminLayout.closeSidebar()">
                <i class="fa-solid fa-boxes-stacked text-teal-400"></i>
                <span>منتجاتي الممولة</span>
                <span class="text-[9px] bg-blue-900/60 text-blue-300 border border-blue-600/40 px-1.5 py-0.5 rounded-full mr-auto">مشاهدة فقط</span>
              </a>
            ` : isMerchant ? `
              <!-- Merchant Specific Nav (everything is view-only) -->
              <a href="#/admin/merchant-accounting" class="admin-nav-item ${activeSection === 'merchant-account' ? 'active' : ''}" onclick="AdminLayout.closeSidebar()">
                <i class="fa-solid fa-file-invoice-dollar text-emerald-400"></i>
                <span>حسابي ومستحقاتي</span>
              </a>
              <a href="#/admin/products" class="admin-nav-item ${activeSection === 'merchant-products' ? 'active' : ''}" onclick="AdminLayout.closeSidebar()">
                <i class="fa-solid fa-box text-teal-400"></i>
                <span>منتجاتي</span>
              </a>
              <a href="#/admin/orders" class="admin-nav-item ${activeSection === 'merchant-orders' ? 'active' : ''}" onclick="AdminLayout.closeSidebar()">
                <i class="fa-solid fa-receipt text-amber-400"></i>
                <span>طلبات منتجاتي</span>
              </a>
              <div class="px-4 py-2 text-[10px] text-slate-400"><i class="fa-solid fa-lock"></i> كل الصفحات للمشاهدة فقط</div>
            ` : `
              <!-- Admin / Staff Nav -->
              <!-- Dashboard -->
              ${this.hasPermission('canViewDashboard') ? `
                <a href="#/admin" class="admin-nav-item ${activeSection === 'dashboard' ? 'active' : ''}" onclick="AdminLayout.closeSidebar()">
                  <i class="fa-solid fa-chart-pie"></i>
                  <span>الداشبورد (الرئيسية)</span>
                </a>
              ` : ''}

              <!-- Products -->
              ${this.hasPermission('canManageProducts') ? `
                <a href="#/admin/products" class="admin-nav-item ${activeSection === 'products' ? 'active' : ''}" onclick="AdminLayout.closeSidebar()">
                  <i class="fa-solid fa-box"></i>
                  <span>إدارة المنتجات</span>
                </a>
                <a href="#/admin/bulk-upload" class="admin-nav-item ${activeSection === 'bulk-upload' ? 'active' : ''}" onclick="AdminLayout.closeSidebar()">
                  <i class="fa-solid fa-file-invoice text-emerald-400"></i>
                  <span>رفع جماعي شيت تاجر أو مستثمر</span>
                </a>
              ` : ''}

              <!-- Merchants (التجار) -->
              ${(isSuper || this.hasPermission('canManageMerchants') || this.hasPermission('canManageProducts')) ? `
                <a href="#/admin/merchants" class="admin-nav-item ${activeSection === 'merchants' ? 'active' : ''}" onclick="AdminLayout.closeSidebar()">
                  <i class="fa-solid fa-store text-teal-400"></i>
                  <span>التجار</span>
                </a>
              ` : ''}

              <!-- Investors (المستثمرين) -->
              ${(isSuper || this.hasPermission('canManageInvestors')) ? `
                <a href="#/admin/investors" class="admin-nav-item ${activeSection === 'investors' ? 'active' : ''}" onclick="AdminLayout.closeSidebar()">
                  <i class="fa-solid fa-user-tie text-blue-400"></i>
                  <span>المستثمرين</span>
                </a>
              ` : ''}
            `}

            <!-- Accounting (Visible ONLY to Accountant and Super Admin Mohamed Hakim & Ahmed Gharib; completely hidden from other staff) -->
            ${canSeeAccounting ? `
              <a href="#/admin/accounting" class="admin-nav-item ${activeSection === 'accounting' ? 'active' : ''}" onclick="AdminLayout.closeSidebar()">
                <i class="fa-solid fa-scale-balanced text-emerald-400"></i>
                <span>المحاسبة المالية</span>
              </a>
              <a href="#/admin/ledger" class="admin-nav-item ${activeSection === 'ledger' ? 'active' : ''}" onclick="AdminLayout.closeSidebar()">
                <i class="fa-solid fa-book text-emerald-400"></i>
                <span>دفتر الحركات وقفل الشهور</span>
              </a>
              <a href="#/admin/employees" class="admin-nav-item ${activeSection === 'employees' ? 'active' : ''}" onclick="AdminLayout.closeSidebar()">
                <i class="fa-solid fa-user-clock text-emerald-400"></i>
                <span>الموظفين والمرتبات</span>
              </a>
            ` : ''}

            <!-- 2. Categories -->
            ${this.hasPermission('canManageCategories') ? `
              <a href="#/admin/categories" class="admin-nav-item ${activeSection === 'categories' ? 'active' : ''}" onclick="AdminLayout.closeSidebar()">
                <i class="fa-solid fa-layer-group"></i>
                <span>إدارة الأقسام</span>
              </a>
            ` : ''}

            <!-- 3. Orders -->
            ${this.hasPermission('canManageOrders') ? `
              <a href="#/admin/orders" class="admin-nav-item ${activeSection === 'orders' ? 'active' : ''}" onclick="AdminLayout.closeSidebar()">
                <i class="fa-solid fa-receipt"></i>
                <span>إدارة الطلبات</span>
              </a>
            ` : ''}

            <!-- 3.5. Returns & Warranty -->
            ${this.hasPermission('canManageReturns') ? `
              <a href="#/admin/returns" class="admin-nav-item ${activeSection === 'returns' ? 'active' : ''}" onclick="AdminLayout.closeSidebar()">
                <i class="fa-solid fa-arrow-rotate-left text-amber-400"></i>
                <span>طلبات الاستبدال والضمان</span>
              </a>
            ` : ''}

            <!-- 4. Customers -->
            ${this.hasPermission('canManageCustomers') ? `
              <a href="#/admin/customers" class="admin-nav-item ${activeSection === 'customers' ? 'active' : ''}" onclick="AdminLayout.closeSidebar()">
                <i class="fa-solid fa-users"></i>
                <span>إدارة العملاء</span>
              </a>
            ` : ''}

            <!-- 5. Coupons -->
            ${this.hasPermission('canManageCoupons') ? `
              <a href="#/admin/coupons" class="admin-nav-item ${activeSection === 'coupons' ? 'active' : ''}" onclick="AdminLayout.closeSidebar()">
                <i class="fa-solid fa-ticket"></i>
                <span>إدارة الكوبونات</span>
              </a>
            ` : ''}

            <!-- 6. Banners -->
            ${this.hasPermission('canManageBanners') ? `
              <a href="#/admin/banners" class="admin-nav-item ${activeSection === 'banners' ? 'active' : ''}" onclick="AdminLayout.closeSidebar()">
                <i class="fa-solid fa-images"></i>
                <span>إدارة البانرات والسلايدر</span>
              </a>
            ` : ''}

            <!-- 6.5 Showcases (moving picture cards on the home page) -->
            ${this.hasPermission('canManageCategories') && !['merchant', 'investor'].includes(State.user?.role) ? `
              <a href="#/admin/showcases" class="admin-nav-item ${activeSection === 'showcases' ? 'active' : ''}" onclick="AdminLayout.closeSidebar()">
                <i class="fa-solid fa-store"></i>
                <span>واجهات العرض</span>
              </a>
            ` : ''}

            <!-- 6.9 Reviews moderation -->
            ${this.hasPermission('canManageProducts') && !['merchant', 'investor'].includes(State.user?.role) ? `
              <a href="#/admin/reviews" class="admin-nav-item ${activeSection === 'reviews' ? 'active' : ''}" onclick="AdminLayout.closeSidebar()">
                <i class="fa-solid fa-star-half-stroke text-amber-400"></i>
                <span>تقييمات العملاء</span>
              </a>
            ` : ''}

            <!-- 7. Support Messages -->
            ${this.hasPermission('canManageSupport') ? `
              <a href="#/admin/support" class="admin-nav-item ${activeSection === 'support' ? 'active' : ''}" onclick="AdminLayout.closeSidebar()">
                <i class="fa-solid fa-envelope-open-text"></i>
                <span>رسائل الدعم الفني</span>
              </a>
            ` : ''}

            <!-- 8. Live Support Chat -->
            ${this.hasPermission('canManageLiveChat') ? `
              <a href="#/admin/live-chat" class="admin-nav-item ${activeSection === 'live-chat' ? 'active' : ''}" onclick="AdminLayout.closeSidebar()">
                <i class="fa-solid fa-headset"></i>
                <span>المحادثات المباشرة (Live Chat)</span>
              </a>
            ` : ''}

            <!-- 9. Web Push Notifications -->
            ${this.hasPermission('canManagePush') ? `
              <a href="#/admin/push" class="admin-nav-item ${activeSection === 'push' ? 'active' : ''}" onclick="AdminLayout.closeSidebar()">
                <i class="fa-solid fa-tower-broadcast text-teal-400"></i>
                <span>إشعارات الدفع (Push)</span>
              </a>
            ` : ''}

            <!-- 10. Reports -->
            ${this.hasPermission('canViewReports') ? `
              <a href="#/admin/reports" class="admin-nav-item ${activeSection === 'reports' ? 'active' : ''}" onclick="AdminLayout.closeSidebar()">
                <i class="fa-solid fa-chart-column text-emerald-400"></i>
                <span>تقارير المبيعات</span>
              </a>
            ` : ''}

            <!-- Activity Audit Trail -->
            ${this.hasPermission('canViewActivity') ? `
              <a href="#/admin/activity" class="admin-nav-item ${activeSection === 'activity' ? 'active' : ''}" onclick="AdminLayout.closeSidebar()">
                <i class="fa-solid fa-clipboard-check"></i>
                <span>سجل النشاطات</span>
              </a>
            ` : ''}

            <!-- Super Admin Exclusive Sections -->
            ${isSuper ? `
              <div class="my-2 border-t border-slate-700/50"></div>
              <a href="javascript:void(0)" onclick="AdminLayout.openMyAccountModal(); AdminLayout.closeSidebar();" class="admin-nav-item">
                <i class="fa-solid fa-id-card-clip text-emerald-400"></i>
                <span>بيانات حسابي (الملف الشخصي)</span>
              </a>
              <a href="#/admin/staff" class="admin-nav-item ${activeSection === 'staff' ? 'active' : ''}" onclick="AdminLayout.closeSidebar()">
                <i class="fa-solid fa-user-shield text-amber-400"></i>
                <span>إدارة الموظفين والصلاحيات</span>
              </a>
              <a href="#/admin/security" class="admin-nav-item ${activeSection === 'security' ? 'active' : ''}" onclick="AdminLayout.closeSidebar()">
                <i class="fa-solid fa-shield-halved text-red-400"></i>
                <span>مركز الأمان وسجلات الدخول</span>
              </a>
              <a href="#/admin/settings" class="admin-nav-item ${activeSection === 'settings' ? 'active' : ''}" onclick="AdminLayout.closeSidebar()">
                <i class="fa-solid fa-gears text-sky-400"></i>
                <span>إعدادات المتجر وطرق الدفع</span>
              </a>
            ` : ''}
          </nav>

          <div class="admin-sidebar-footer">
            <a href="#/" class="text-xs text-slate-400 hover:text-emerald-400 font-bold flex items-center gap-2" onclick="AdminLayout.closeSidebar()">
              <i class="fa-solid fa-arrow-right-from-bracket"></i>
              <span>الرجوع للمتجر</span>
            </a>
            <button onclick="State.logout()" class="text-xs text-red-400 hover:text-red-300 font-bold" title="تسجيل الخروج">
              <i class="fa-solid fa-power-off"></i>
            </button>
          </div>
        </aside>

        <!-- Main Workspace -->
        <div class="admin-main">
          <!-- Topbar -->
          <header class="admin-topbar">
            <div class="flex items-center gap-2 sm:gap-3">
              <!-- Hamburger Toggle for Mobile / Tablet -->
              <button type="button" id="admin-sidebar-toggle" onclick="AdminLayout.toggleSidebar()" class="admin-mobile-toggle-btn" aria-label="تبديل القائمة الجانبية" title="فتح القائمة الجانبية">
                <i class="fa-solid fa-bars"></i>
              </button>
              <h2 class="font-extrabold text-sm sm:text-lg text-slate-800 dark:text-white truncate">لوحة تحكم سوقي ستور</h2>
            </div>

            <div class="admin-user-info">
              <!-- Dark Mode Toggle in Admin -->
              <button onclick="Theme.toggle()" class="w-8 h-8 sm:w-9 sm:h-9 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center justify-center text-slate-600 dark:text-slate-300 transition shadow-sm" title="تبديل الوضع الليلي / النهاري">
                <i class="fa-solid fa-moon dark:hidden text-xs sm:text-sm"></i>
                <i class="fa-solid fa-sun hidden dark:inline text-amber-400 text-xs sm:text-sm"></i>
              </button>

              <a href="#/" class="bg-emerald-50 text-emerald-700 hover:bg-emerald-100 font-bold px-2.5 sm:px-3 py-1.5 rounded-xl text-xs flex items-center gap-1.5 transition-colors">
                <i class="fa-solid fa-store"></i>
                <span class="hidden sm:inline">عرض واجهة المتجر</span>
                <span class="sm:hidden">المتجر</span>
              </a>

              <div class="h-5 sm:h-6 w-px bg-slate-200 dark:bg-slate-700"></div>

              <button type="button" onclick="AdminLayout.openMyAccountModal()" class="flex items-center gap-2 p-1 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition text-right group cursor-pointer" title="تعديل بيانات حسابي الشخصي">
                <img src="${user.avatar || 'https://api.dicebear.com/7.x/initials/svg?seed=' + encodeURIComponent(user.name)}" class="admin-avatar group-hover:ring-2 group-hover:ring-emerald-500 transition" />
                <div class="text-right hidden md:block">
                  <div class="font-bold text-xs text-slate-800 dark:text-slate-200 truncate max-w-[120px] flex items-center gap-1">
                    <span>${user.name}</span>
                    <i class="fa-solid fa-pen text-[10px] text-slate-400 group-hover:text-emerald-500"></i>
                  </div>
                  <div class="text-[10px] text-slate-400 font-medium truncate max-w-[120px]">${user.email}</div>
                </div>
              </button>
            </div>
          </header>

          <!-- Dynamic Page Content -->
          <div class="admin-page-content">
            ${contentHtml}
          </div>
        </div>
      </div>
    `;
  },

  restoreStoreLayout() {
    const header = document.getElementById('site-header');
    const footer = document.getElementById('site-footer');
    const mobileNav = document.getElementById('mobile-bottom-nav');
    const chatbot = document.getElementById('suki-chatbot-wrapper');
    const pwaBanner = document.getElementById('pwa-mobile-install-banner');

    if (header) header.style.display = '';
    if (footer) footer.style.display = '';
    if (mobileNav) mobileNav.style.display = '';
    if (chatbot) chatbot.style.display = '';
    if (pwaBanner && !localStorage.getItem('suki_pwa_banner_dismissed') && typeof PWA !== 'undefined' && !PWA.isStandalone) {
      pwaBanner.style.display = '';
    }
    this.closeSidebar();
  },

  renderAdminLogin() {
    const header = document.getElementById('site-header');
    const footer = document.getElementById('site-footer');
    const mobileNav = document.getElementById('mobile-bottom-nav');
    const chatbot = document.getElementById('suki-chatbot-wrapper');
    const pwaBanner = document.getElementById('pwa-mobile-install-banner');

    if (header) header.style.display = 'none';
    if (footer) footer.style.display = 'none';
    if (mobileNav) mobileNav.style.display = 'none';
    if (chatbot) chatbot.style.display = 'none';
    if (pwaBanner) pwaBanner.style.display = 'none';

    const main = document.getElementById('main-content');
    if (!main) return;

    main.innerHTML = `
      <div class="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <div class="bg-slate-800 border border-slate-700/80 rounded-3xl p-8 max-w-md w-full shadow-2xl text-right">
          <div class="text-center mb-6">
            <img src="/icons/icon-192.png" class="w-16 h-16 rounded-2xl mx-auto mb-3 shadow-lg shadow-emerald-500/20 object-contain border border-emerald-500/30" alt="سوقي ستور" />
            <h2 class="text-2xl font-black text-white mb-1">لوحة تحكم سوقي ستور</h2>
            <p class="text-xs text-slate-400">بوابة الدخول المخصصة للإدارة، التجار، والموظفين</p>
          </div>

          <form id="admin-login-form" onsubmit="AdminLayout.handleAdminLogin(event)" class="space-y-4">
            <div id="admin-login-alert" class="hidden p-3 rounded-xl text-xs font-semibold"></div>

            <div>
              <label class="block text-xs font-bold text-slate-300 mb-1.5">البريد الإلكتروني أو اسم المستخدم أو كود التاجر</label>
              <div class="relative">
                <input 
                  type="text" 
                  id="admin-email" 
                  class="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition pl-10" 
                  placeholder="اسم المستخدم أو البريد أو كود التاجر" 
                  value=""
                  required 
                  autocomplete="username"
                />
                <i class="fa-solid fa-user absolute left-3.5 top-3.5 text-slate-500 text-sm"></i>
              </div>
            </div>

            <div>
              <label class="block text-xs font-bold text-slate-300 mb-1.5">كلمة المرور السرية</label>
              <div class="relative">
                <input 
                  type="password" 
                  id="admin-password" 
                  class="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition pl-10" 
                  placeholder="••••••••" 
                  value=""
                  required 
                  autocomplete="current-password"
                />
                <button type="button" onclick="AdminLayout.togglePasswordVisibility()" class="absolute left-3.5 top-3.5 text-slate-400 hover:text-white" title="إظهار/إخفاء كلمة المرور">
                  <i id="admin-pwd-icon" class="fa-solid fa-eye text-sm"></i>
                </button>
              </div>
            </div>

            <button type="submit" id="admin-login-btn" class="w-full py-3.5 px-4 bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold rounded-xl text-sm transition shadow-lg shadow-emerald-600/30 flex items-center justify-center gap-2">
              <span>تسجيل الدخول إلى لوحة التحكم</span>
              <i class="fa-solid fa-arrow-left"></i>
            </button>

            <div class="pt-2 text-center border-t border-slate-700/60 mt-4">
              <a href="#/" class="text-xs text-slate-400 hover:text-emerald-400 transition font-bold inline-flex items-center gap-1.5">
                <i class="fa-solid fa-arrow-right"></i>
                <span>الرجوع إلى المتجر الرئيسي</span>
              </a>
            </div>
          </form>
        </div>
      </div>
    `;
  },

  async handleAdminLogin(e) {
    e.preventDefault();
    const alertEl = document.getElementById('admin-login-alert');
    const btn = document.getElementById('admin-login-btn');
    const identifier = document.getElementById('admin-email').value.trim();
    const password = document.getElementById('admin-password').value;

    if (alertEl) {
      alertEl.className = 'hidden';
      alertEl.innerText = '';
    }

    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin ml-2"></i> جاري التحقق...';
    }

    try {
      const res = await API.post('/auth/login', { identifier, email: identifier, password });
      const allowedRoles = ['super_admin', 'admin', 'staff', 'accountant', 'merchant'];
      if (res.user && allowedRoles.includes(res.user.role)) {
        await State.login(res.user, res.token);
        App.showToast(`مرحباً بك يا ${res.user.name} في لوحة التحكم`, 'success');
        if (res.user.role === 'merchant') {
          window.location.hash = '#/admin/products';
        } else {
          App.route();
        }
      } else {
        if (alertEl) {
          alertEl.className = 'p-3 rounded-xl text-xs font-semibold bg-red-500/10 border border-red-500/30 text-red-400 block';
          alertEl.innerText = 'هذا الحساب ليس لديه صلاحيات الدخول إلى لوحة التحكم الإدارية';
        }
        if (btn) {
          btn.disabled = false;
          btn.innerHTML = '<span>تسجيل الدخول إلى لوحة التحكم</span><i class="fa-solid fa-arrow-left"></i>';
        }
      }
    } catch (err) {
      if (alertEl) {
        alertEl.className = 'p-3 rounded-xl text-xs font-semibold bg-red-500/10 border border-red-500/30 text-red-400 block';
        alertEl.innerText = err.message || 'فشل تسجيل الدخول. يرجى التحقق من صحة البيانات.';
      }
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<span>تسجيل الدخول إلى لوحة التحكم</span><i class="fa-solid fa-arrow-left"></i>';
      }
    }
  },

  togglePasswordVisibility() {
    const input = document.getElementById('admin-password');
    const icon = document.getElementById('admin-pwd-icon');
    if (!input || !icon) return;
    if (input.type === 'password') {
      input.type = 'text';
      icon.className = 'fa-solid fa-eye-slash text-sm text-emerald-400';
    } else {
      input.type = 'password';
      icon.className = 'fa-solid fa-eye text-sm';
    }
  },

  renderUnauthorized() {
    const header = document.getElementById('site-header');
    const footer = document.getElementById('site-footer');
    const mobileNav = document.getElementById('mobile-bottom-nav');
    const chatbot = document.getElementById('suki-chatbot-wrapper');

    if (header) header.style.display = 'none';
    if (footer) footer.style.display = 'none';
    if (mobileNav) mobileNav.style.display = 'none';
    if (chatbot) chatbot.style.display = 'none';

    const main = document.getElementById('main-content');
    if (!main) return;
    main.innerHTML = `
      <div class="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <div class="bg-slate-800 border border-slate-700/80 rounded-3xl p-8 max-w-md w-full shadow-2xl text-center">
          <div class="w-16 h-16 rounded-2xl bg-amber-500/20 text-amber-400 flex items-center justify-center text-3xl mx-auto mb-4 border border-amber-500/30">
            <i class="fa-solid fa-triangle-exclamation"></i>
          </div>
          <h2 class="text-xl font-bold text-white mb-2">غير مصرح بالدخول</h2>
          <p class="text-xs text-slate-400 mb-6 leading-relaxed">
            حسابك الحالي مسجل كـ (عميل). لوحة التحكم مخصصة للمدير العام والموظفين فقط.
          </p>
          <div class="flex flex-col gap-3">
            <button onclick="State.logout(); AdminLayout.renderAdminLogin();" class="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs transition">
              تسجيل الخروج والدخول بحساب إداري
            </button>
            <a href="#/" class="w-full py-3 px-4 bg-slate-700 hover:bg-slate-600 text-slate-200 font-bold rounded-xl text-xs transition">
              الرجوع للتسوق في المتجر
            </a>
          </div>
        </div>
      </div>
    `;
  },

  renderDisabledStaff() {
    const header = document.getElementById('site-header');
    const footer = document.getElementById('site-footer');
    const mobileNav = document.getElementById('mobile-bottom-nav');
    const chatbot = document.getElementById('suki-chatbot-wrapper');

    if (header) header.style.display = 'none';
    if (footer) footer.style.display = 'none';
    if (mobileNav) mobileNav.style.display = 'none';
    if (chatbot) chatbot.style.display = 'none';

    const main = document.getElementById('main-content');
    if (!main) return;
    main.innerHTML = `
      <div class="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <div class="bg-slate-800 border border-slate-700/80 rounded-3xl p-8 max-w-md w-full shadow-2xl text-center">
          <div class="w-16 h-16 rounded-2xl bg-red-500/20 text-red-400 flex items-center justify-center text-3xl mx-auto mb-4">
            <i class="fa-solid fa-user-lock"></i>
          </div>
          <h2 class="text-xl font-bold text-white mb-2">الحساب معطل</h2>
          <p class="text-xs text-slate-400 mb-6 leading-relaxed">
            حساب الموظف هذا معطل حالياً من قِبل المدير العام. يُرجى مراجعة إدارة المتجر.
          </p>
          <div class="flex flex-col gap-3">
            <button onclick="State.logout(); AdminLayout.renderAdminLogin();" class="w-full py-3 px-4 bg-slate-700 hover:bg-slate-600 text-slate-200 font-bold rounded-xl text-xs transition">
              تسجيل الخروج
            </button>
            <a href="#/" class="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs transition">
              الرجوع للمتجر
            </a>
          </div>
        </div>
      </div>
    `;
  },

  openMyAccountModal() {
    const user = State.user;
    if (!user) return;

    const modalBody = `
      <form onsubmit="AdminLayout.submitMyAccountForm(event)" class="text-right">
        <div class="bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200 p-3.5 rounded-2xl mb-4 flex items-center gap-3">
          <div class="w-12 h-12 rounded-xl bg-emerald-600 text-white flex items-center justify-center text-xl flex-shrink-0 shadow-sm">
            <i class="fa-solid fa-crown"></i>
          </div>
          <div>
            <div class="text-xs font-black text-emerald-950">تعديل بيانات الحساب الإداري المباشر</div>
            <div class="text-[11px] text-emerald-700 font-semibold leading-relaxed">
              بصفتك أحد ملاك وإدارة الموقع (محمد حكيم / أحمد غريب)، يمكنك تعديل الصورة الشخصية، الاسم، كلمة المرور، أو أرقام الهواتف مباشرة.
            </div>
          </div>
        </div>

        <!-- Avatar Section -->
        <div class="bg-slate-50 border border-slate-200 p-3.5 rounded-2xl mb-4 flex flex-col sm:flex-row items-center gap-4">
          <div class="relative w-20 h-20 rounded-full overflow-hidden border-2 border-emerald-500 shadow-sm flex-shrink-0 bg-slate-200">
            <img id="my-account-avatar-preview" src="${user.avatar || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(user.name || 'Admin')}`}" class="w-full h-full object-cover" onerror="this.src='https://api.dicebear.com/7.x/initials/svg?seed=Admin'" />
          </div>
          <div class="flex-1 w-full text-right">
            <label class="block text-xs font-bold text-slate-800 mb-1.5">الصورة الشخصية (Avatar)</label>
            <div class="flex flex-wrap items-center gap-2">
              <label class="cursor-pointer px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition flex items-center gap-1.5 shadow-sm">
                <i class="fa-solid fa-camera"></i>
                <span>رفع صورة من الجهاز</span>
                <input type="file" id="my-account-avatar-file" accept="image/*" class="hidden" onchange="AdminLayout.handleAvatarUpload(event)" />
              </label>
              <input type="text" dir="ltr" inputmode="url" id="my-account-avatar-url" class="form-control text-xs font-mono flex-1 min-w-[160px]" placeholder="أو أدخل رابط صورة مباشرة..." value="${user.avatar && !user.avatar.startsWith('/uploads/') ? user.avatar : ''}" onchange="AdminLayout.handleAvatarUrlChange(this.value)" />
            </div>
            <span class="text-[10px] text-slate-400 mt-1 block">يمكنك رفع صورة من هاتفك أو جهازك أو كتابة رابط خارجي</span>
          </div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
          <div class="form-group">
            <label class="form-label font-bold text-xs text-slate-700">الاسم / اسم المستخدم *</label>
            <input type="text" id="my-account-name" class="form-control text-xs font-bold" value="${user.name || ''}" required />
          </div>

          <div class="form-group">
            <label class="form-label font-bold text-xs text-slate-500">البريد الإلكتروني (معرف الحساب)</label>
            <input type="email" id="my-account-email" class="form-control text-xs bg-slate-100 text-slate-500 cursor-not-allowed font-mono" value="${user.email || ''}" disabled />
          </div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
          <div class="form-group">
            <label class="form-label font-bold text-xs text-slate-700">رقم الهاتف الأساسي</label>
            <input type="tel" id="my-account-phone" class="form-control text-xs font-mono" placeholder="مثال: 01000000001 (أو اتركه فارغاً للحذف)" value="${user.phone || ''}" />
            <span class="text-[10px] text-slate-400 mt-0.5 block">يمكن التعديل أو الحذف المباشر</span>
          </div>

          <div class="form-group">
            <label class="form-label font-bold text-xs text-slate-700">رقم هاتف إضافي (اختياري)</label>
            <input type="tel" id="my-account-sec-phone" class="form-control text-xs font-mono" placeholder="رقم إضافي..." value="${user.secondaryPhone || ''}" />
          </div>

          <div class="form-group">
            <label class="form-label font-bold text-xs text-slate-700">رقم الواتساب (WhatsApp)</label>
            <input type="tel" id="my-account-whatsapp" class="form-control text-xs font-mono" placeholder="رقم الواتساب..." value="${user.whatsappPhone || ''}" />
          </div>
        </div>

        <div class="form-group mb-4 bg-slate-50 p-3.5 rounded-xl border border-slate-200">
          <label class="form-label font-bold text-xs text-slate-800 flex items-center justify-between mb-1.5">
            <span class="flex items-center gap-1.5">
              <i class="fa-solid fa-lock text-emerald-600"></i>
              <span>تعيين كلمة مرور جديدة للحساب</span>
            </span>
            <span class="text-[10px] text-slate-400 font-normal">اترك الحقل فارغاً إذا كنت لا ترغب بتغييرها</span>
          </label>
          <div class="relative">
            <input 
              type="password" 
              id="my-account-password" 
              class="form-control text-xs pl-10" 
              placeholder="اكتب كلمة المرور الجديدة (6 خانات على الأقل)..." 
              minlength="6"
            />
            <button type="button" onclick="AdminLayout.toggleMyAccountPwd()" class="absolute left-3 top-2.5 text-slate-400 hover:text-slate-600" title="إظهار/إخفاء">
              <i id="my-acc-pwd-icon" class="fa-solid fa-eye text-xs"></i>
            </button>
          </div>
          <input
            type="password"
            id="my-account-current-password"
            class="form-control text-xs mt-2"
            placeholder="كلمة المرور الحالية (مطلوبة فقط عند تغيير كلمة المرور)"
            autocomplete="current-password"
          />
        </div>

        <div class="flex gap-2">
          <button type="submit" id="my-account-submit-btn" class="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-black rounded-xl text-xs shadow-md transition flex items-center justify-center gap-2">
            <i class="fa-solid fa-check"></i>
            <span>حفظ وتحديث بيانات الحساب فوراً</span>
          </button>
          <button type="button" onclick="App.closeModal()" class="w-1/3 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition">
            إلغاء
          </button>
        </div>
      </form>
    `;

    App.openModal(`بيانات حسابي - ${user.name}`, modalBody);
  },

  handleAvatarUrlChange(val) {
    const url = String(val || '').trim();
    const img = document.getElementById('my-account-avatar-preview');
    if (img && url) {
      img.src = url;
    }
  },

  async handleAvatarUpload(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('avatar', file);
    formData.append('file', file);
    formData.append('image', file);

    try {
      App.showToast('جاري رفع الصورة...', 'info');
      const res = await API.post('/upload/avatar', formData);
      if (res.success && res.url) {
        if (State.user) {
          State.user.avatar = res.url;
          localStorage.setItem('suki_user', JSON.stringify(State.user));
        }
        const img = document.getElementById('my-account-avatar-preview');
        if (img) img.src = res.url;
        const input = document.getElementById('my-account-avatar-url');
        if (input) input.value = '';

        // Also update navbar and sidebar avatars
        document.querySelectorAll('.admin-avatar, .user-avatar-img').forEach(el => {
          el.src = res.url;
        });

        App.showToast('تم رفع وتحديث صورتك الشخصية بنجاح! 📸', 'success');
      } else {
        App.showToast(res.message || 'فشل رفع الصورة', 'error');
      }
    } catch (err) {
      App.showToast(err.message || 'حدث خطأ أثناء رفع الصورة', 'error');
    }
  },

  toggleMyAccountPwd() {
    const input = document.getElementById('my-account-password');
    const icon = document.getElementById('my-acc-pwd-icon');
    if (!input || !icon) return;
    if (input.type === 'password') {
      input.type = 'text';
      icon.className = 'fa-solid fa-eye-slash text-xs text-emerald-600';
    } else {
      input.type = 'password';
      icon.className = 'fa-solid fa-eye text-xs';
    }
  },

  async submitMyAccountForm(e) {
    e.preventDefault();
    const btn = document.getElementById('my-account-submit-btn');
    const name = document.getElementById('my-account-name').value.trim();
    const phone = document.getElementById('my-account-phone').value.trim();
    const secondaryPhone = document.getElementById('my-account-sec-phone').value.trim();
    const whatsappPhone = document.getElementById('my-account-whatsapp').value.trim();
    const password = document.getElementById('my-account-password').value.trim();
    const avatar = document.getElementById('my-account-avatar-url')?.value?.trim();

    if (!name) {
      App.showToast('اسم المستخدم مطلوب', 'warning');
      return;
    }

    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin ml-2"></i> جاري الحفظ...';
    }

    try {
      const payload = {
        name,
        phone,
        secondaryPhone,
        whatsappPhone
      };
      if (avatar) {
        payload.avatar = avatar;
      }
      if (password) {
        const currentPassword = document.getElementById('my-account-current-password')?.value || '';
        if (!currentPassword) {
          App.showToast('اكتب كلمة المرور الحالية لتأكيد تغيير كلمة المرور', 'warning');
          if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fa-solid fa-check"></i><span>حفظ وتحديث بيانات الحساب فوراً</span>';
          }
          return;
        }
        payload.password = password;
        payload.currentPassword = currentPassword;
      }

      const res = await API.put('/admin/my-account', payload);
      if (res.success) {
        if (res.user) {
          State.user = { ...State.user, ...res.user };
        }
        if (res.token) {
          API.setToken(res.token);
        }
        App.closeModal();
        App.showToast(res.message || 'تم تحديث بيانات حسابك بنجاح ✅', 'success');
        
        // Refresh admin layout to reflect updated name/phone
        if (typeof AdminLayout !== 'undefined') {
          AdminLayout.render(window.location.hash.replace('#/admin/', '').replace('#/admin', '') || 'dashboard', document.querySelector('.admin-page-content')?.innerHTML || '');
        }
      }
    } catch (err) {
      App.showToast(err.message || 'فشل تحديث بيانات الحساب', 'error');
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-check"></i><span>حفظ وتحديث بيانات الحساب فوراً</span>';
      }
    }
  }
};
