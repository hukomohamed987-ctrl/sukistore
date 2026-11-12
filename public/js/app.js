/**
 * Suki Store (سوقي ستور)
 * Main Application Client-Side Router & Orchestrator
 */

// Universal Arabic & English Numeral Utilities
const Utils = {
  normalizeNumerals(val) {
    if (val === null || val === undefined) return '';
    const arabicEastern = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
    const persian = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
    let str = String(val);
    for (let i = 0; i < 10; i++) {
      str = str.replaceAll(arabicEastern[i], String(i)).replaceAll(persian[i], String(i));
    }
    // Replace Arabic decimal mark '٫' and Arabic comma '،' with standard period '.'
    return str.replace(/[٫،]/g, '.');
  },

  parseNumber(val, defaultVal = 0) {
    if (val === null || val === undefined || val === '') return defaultVal;
    const norm = this.normalizeNumerals(val).trim();
    const num = Number(norm);
    return isNaN(num) ? defaultVal : num;
  }
};
window.Utils = Utils;

// Global input interceptor: allows typing both Arabic (٠-٩) and English (0-9) numerals smoothly
document.addEventListener('input', (e) => {
  const el = e.target;
  if (!el || !(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) return;
  if (el.type === 'password' || el.type === 'file') return;
  const val = el.value;
  if (val && /[\u0660-\u0669\u06F0-\u06F9\u066B]/.test(val)) {
    const start = el.selectionStart;
    const end = el.selectionEnd;
    el.value = Utils.normalizeNumerals(val);
    if (start !== null && end !== null) {
      try { el.setSelectionRange(start, end); } catch (err) {}
    }
  }
}, true);

// Global beforeinput interceptor for <input type="number"> to prevent browser from rejecting Arabic digits
document.addEventListener('beforeinput', (e) => {
  const el = e.target;
  if (!el || !(el instanceof HTMLInputElement)) return;
  if (el.type === 'number' && e.data && /[\u0660-\u0669\u06F0-\u06F9\u066B\u060C]/.test(e.data)) {
    e.preventDefault();
    const normalized = Utils.normalizeNumerals(e.data);
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? el.value.length;
    const oldVal = el.value || '';
    const newVal = oldVal.substring(0, start) + normalized + oldVal.substring(end);
    el.value = newVal;
    try { el.setSelectionRange(start + normalized.length, start + normalized.length); } catch (err) {}
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }
}, true);

const App = {
  confirmCallback: null,
  isMaintenanceMode: false,
  adminScriptsPromise: null,

  // SPEED: dashboard code is downloaded only when the dashboard is opened (shoppers never load it)
  loadAdminScripts() {
    if (typeof AdminLayout !== 'undefined') return Promise.resolve();
    if (this.adminScriptsPromise) return this.adminScriptsPromise;
    const list = Array.isArray(window.ADMIN_SCRIPTS) ? window.ADMIN_SCRIPTS : [];
    this.adminScriptsPromise = new Promise((resolve, reject) => {
      let left = list.length;
      if (!left) return resolve();
      list.forEach(src => {
        const s = document.createElement('script');
        s.src = src;
        s.async = false; // keep the listed order (adminLayout first)
        s.onload = () => { if (--left === 0) resolve(); };
        s.onerror = () => { this.adminScriptsPromise = null; reject(new Error('تعذر تحميل ملفات لوحة التحكم: ' + src)); };
        document.body.appendChild(s);
      });
    });
    return this.adminScriptsPromise;
  },

  async checkMaintenanceStatus() {
    try {
      const [res, c] = await Promise.all([API.get('/admin/maintenance-status'), API.get('/pages/meta/contact').catch(() => ({}))]);
      this.isMaintenanceMode = Boolean(res.maintenanceMode);
      this.contact = c.contact || {};
    } catch (e) {
      this.isMaintenanceMode = false;
    }
  },

  renderMaintenancePage() {
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
      <div class="min-h-screen bg-gradient-to-b from-slate-900 via-emerald-950 to-slate-900 flex items-center justify-center p-6 text-center text-white" dir="rtl">
        <div class="max-w-xl mx-auto space-y-6">
          <div class="relative inline-block">
            <img src="/icons/icon-192.png" alt="سوقي ستور" class="w-24 h-24 rounded-3xl shadow-2xl mx-auto border-2 border-emerald-500/40 p-2 bg-slate-900/80 backdrop-blur" />
            <span class="absolute -bottom-2 -right-2 bg-amber-500 text-slate-900 w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm shadow-lg animate-bounce">
              <i class="fa-solid fa-wrench"></i>
            </span>
          </div>

          <div class="space-y-2">
            <span class="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-black bg-amber-500/20 text-amber-300 border border-amber-500/30">
              <i class="fa-solid fa-triangle-exclamation"></i>
              <span>وضع الصيانة والتحديث الدوري</span>
            </span>
            <h1 class="text-3xl sm:text-4xl font-black text-white">الموقع تحت الصيانة مؤقتاً</h1>
            <p class="text-slate-300 text-sm sm:text-base leading-relaxed max-w-md mx-auto pt-2">
              نعمل حالياً على تطوير وتحديث سوقي ستور وإضافة تحسينات جديدة لمنحكم تجربة تسوق استثنائية. سنعود للعمل قريباً جداً بإذن الله!
            </p>
          </div>

          ${this.contact && this.contact.whatsapp ? `
          <div class="pt-4 flex items-center justify-center max-w-sm mx-auto">
            <a href="https://wa.me/${String(this.contact.whatsapp).replace(/\D/g, '').replace(/^0/, '20')}" target="_blank" rel="noopener" class="bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-bold py-3 px-6 rounded-xl text-xs flex items-center justify-center gap-2 transition">
              <i class="fa-brands fa-whatsapp text-emerald-400"></i>
              <span>تواصل معنا على واتساب</span>
            </a>
          </div>` : ''}

          <div class="text-[11px] text-slate-500 pt-6">
            سوقي ستور (Souqy Store) &copy; ${new Date().getFullYear()} - جميع الحقوق محفوظة
          </div>
        </div>
      </div>
    `;
  },

  async init() {
    console.log('🚀 Suki Store frontend initialized');

    // 1. Initialize Theme (Dark / Light mode)
    if (typeof Theme !== 'undefined') {
      Theme.init();
    }

    // 1.05 Check if returning from Google OAuth Redirect
    const urlParams = new URLSearchParams(window.location.search);
    const hashParts = window.location.hash.split('?');
    const hashParams = new URLSearchParams(hashParts[1] || '');

    const googleAuth = urlParams.get('google_auth') || hashParams.get('google_auth');
    const googleToken = urlParams.get('token') || hashParams.get('token');
    const googleName = urlParams.get('name') || hashParams.get('name');
    const googleError = urlParams.get('google_error') || hashParams.get('google_error');
    const googleNotice = urlParams.get('google_notice') || hashParams.get('google_notice');
    const openAuth = urlParams.get('open_auth') || hashParams.get('open_auth');

    if (googleAuth === 'success' && googleToken) {
      API.setToken(googleToken);
      window.history.replaceState({}, document.title, window.location.pathname + (hashParts[0] || '#/'));
      await State.init();
      if (typeof Navbar !== 'undefined' && Navbar.render) {
        Navbar.render();
      }
      setTimeout(() => {
        this.showToast(`مرحباً بك يا ${State.user?.name || googleName || 'عزيزي العميل'}! تم تسجيل الدخول بحساب Google بنجاح 🎉`, 'success');
      }, 300);
    } else if (googleError) {
      window.history.replaceState({}, document.title, window.location.pathname + (hashParts[0] || '#/'));
      setTimeout(() => {
        this.showToast(`تنبيه Google OAuth: ${googleError}`, 'warning');
      }, 300);
    } else if (googleNotice === 'not_configured' || openAuth === 'login') {
      window.history.replaceState({}, document.title, window.location.pathname + (hashParts[0] || '#/'));
      setTimeout(() => {
        if (typeof AuthModal !== 'undefined' && AuthModal.open) {
          AuthModal.open('login');
        }
      }, 300);
    }

    // 1.1 Initialize State (loads token, profile, cart, categories, wishlist)
    await State.init();

    // 1.15 Check Maintenance Mode
    await this.checkMaintenanceStatus();

    // 1.2 Initialize Web Push Notification Manager
    if (typeof PushManager !== 'undefined') {
      PushManager.init();
    }

    // 2. Setup state change listener to re-render header & mobile nav
    State.subscribe(() => {
      this.renderHeaderAndFooter();
      this.renderMobileNav();
      CartDrawer.update();
    });

    // 2.1 Initialize Smart Egyptian Chatbot & Support Widget
    if (typeof Chatbot !== 'undefined') {
      Chatbot.init();
    }

    // 2.2 Initialize Employee & User Heartbeat (Tracks online status & hours)
    this.initHeartbeat();

    // 3. Close modal handlers
    const closeBtn = document.getElementById('modal-close-btn');
    if (closeBtn) closeBtn.onclick = () => this.closeModal();

    const overlay = document.getElementById('modal-container');
    if (overlay) {
      overlay.onclick = (e) => {
        if (e.target.id === 'modal-container') this.closeModal();
      };
    }

    // 4. Handle expired token (preserves local cart and does not kick user to #/)
    window.addEventListener('auth:expired', () => {
      State.handleSessionExpired();
      this.showToast('انتهت جلسة تسجيل الدخول، يُرجى تسجيل الدخول مجدداً', 'warning');
    });

    // 5. Router handlers (supports both hash routing and HTML5 history popstate)
    // A hash change fires BOTH popstate and hashchange, which rendered every page
    // (and fetched its data) twice. Coalesce them into a single route() call.
    const scheduleRoute = () => {
      if (this._routeQueued) return;
      this._routeQueued = true;
      setTimeout(() => {
        this._routeQueued = false;
        this.route();
      }, 0);
    };
    window.addEventListener('hashchange', scheduleRoute);
    window.addEventListener('popstate', scheduleRoute);

    // 5.1 Universal internal link click interceptor
    document.addEventListener('click', (e) => {
      const link = e.target.closest('a');
      if (!link) return;
      const href = link.getAttribute('href');
      if (!href) return;

      // Ignore external or protocol links
      if (href.startsWith('http://') || href.startsWith('https://') || 
          href.startsWith('javascript:') || href.startsWith('tel:') || 
          href.startsWith('mailto:') || link.getAttribute('target') === '_blank') {
        return;
      }

      // If dummy hash like '#' or '#!', prevent jump
      if (href === '#' || href === '#!') {
        e.preventDefault();
        return;
      }

      // If it's a hash route like '#/cart', hashchange will naturally fire!
      if (href.startsWith('#')) {
        return;
      }

      // If it's an internal clean path like '/cart' or '/admin'
      if (href.startsWith('/')) {
        e.preventDefault();
        window.history.pushState(null, '', href);
        this.route();
      }
    });

    // 6. First route execution
    this.route();

    // 7. Global image optimization & observer
    this.initImageObserver();
  },

  initHeartbeat() {
    let wasInAdmin = false;

    // (Bug fixed: this used to check State.token, which never existed, so no time was ever counted)
    const loggedIn = () => typeof State !== 'undefined' && Boolean(State.user);
    const sendBeat = () => {
      if (loggedIn() && document.visibilityState === 'visible') {
        const isAdmin = window.location.hash.startsWith('#/admin');
        wasInAdmin = isAdmin;
        const userRole = State.user ? State.user.role : '';
        const isPrivileged = ['staff', 'accountant', 'super_admin', 'admin'].includes(userRole);

        if (isPrivileged) {
          // Employee appears online and counts hours ONLY when actively on dashboard
          if (isAdmin) {
            API.post('/auth/heartbeat', { inAdmin: true }).catch(() => {});
          }
        } else {
          API.post('/auth/heartbeat', { inAdmin: false }).catch(() => {});
        }
      }
    };

    const sendOffline = () => {
      if (loggedIn() && wasInAdmin) {
        try {
          const token = API.getToken();
          fetch('/api/auth/offline', {
            method: 'POST',
            credentials: 'include',
            headers: {
              'Content-Type': 'application/json',
              ...(token ? { 'Authorization': 'Bearer ' + token } : {})
            },
            keepalive: true
          }).catch(() => {});
        } catch (e) {}
      }
    };

    sendBeat();
    setInterval(sendBeat, 30000);

    // Stop timer and set offline when tab is hidden or closed
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        sendBeat();
      } else {
        sendOffline();
      }
    });

    // Handle tab closing or browser exiting
    window.addEventListener('beforeunload', () => sendOffline());
    window.addEventListener('pagehide', () => sendOffline());

    // Handle hash navigation
    window.addEventListener('hashchange', () => {
      const nowInAdmin = window.location.hash.startsWith('#/admin');
      if (nowInAdmin) {
        sendBeat();
      } else if (wasInAdmin && !nowInAdmin) {
        sendOffline();
      }
      wasInAdmin = nowInAdmin;
    });
  },

  getCurrentRoute() {
    const hash = window.location.hash;
    const pathname = window.location.pathname;
    const search = window.location.search;

    let rawPath = '';
    let queryString = '';

    // 1. If hash exists and has content beyond '#'
    if (hash && hash.length > 1) {
      const cleanHash = hash.replace(/^#\/?/, '');
      const [hPath, hQuery] = cleanHash.split('?');
      rawPath = hPath || '';
      queryString = hQuery || '';
    } 
    // 2. Otherwise use pathname if it's not root '/' or '/index.html'
    else if (pathname && pathname !== '/' && pathname !== '/index.html') {
      rawPath = pathname.replace(/^\/+/, '');
      queryString = search ? search.replace(/^\?/, '') : '';
    }

    // Clean up trailing slashes and lowercase
    const path = rawPath.replace(/\/+$/, '').toLowerCase();

    const queryParams = {};
    if (queryString) {
      const sp = new URLSearchParams(queryString);
      for (const [k, v] of sp.entries()) {
        queryParams[k] = v;
      }
    }

    return { path, queryParams };
  },

  navigate(target) {
    if (!target) target = '/';
    if (target.startsWith('#')) {
      window.location.hash = target;
    } else {
      if (window.location.hash) {
        window.location.hash = target.startsWith('/') ? '#' + target : '#/' + target;
      } else {
        window.history.pushState(null, '', target.startsWith('/') ? target : '/' + target);
        this.route();
      }
    }
  },

  renderHeaderAndFooter() {
    const header = document.getElementById('site-header');
    const footer = document.getElementById('site-footer');
    if (header) header.innerHTML = Navbar.render();
    if (footer) footer.innerHTML = Footer.render();
  },

  renderMobileNav() {
    const nav = document.getElementById('mobile-bottom-nav');
    if (!nav) return;

    const { path } = this.getCurrentRoute();

    // Hide mobile bottom navigation bar on checkout page to avoid blocking order submission
    if (path === 'checkout') {
      nav.style.display = 'none';
      return;
    } else {
      nav.style.display = '';
    }

    const count = State.getCartCount();
    const user = State.user;
    const profileLink = user ? '#/profile' : 'javascript:AuthModal.open("login")';

    nav.innerHTML = `
      <a href="#/" class="mobile-nav-item ${path === '' ? 'active' : ''}">
        <i class="fa-solid fa-house"></i>
        <span>الرئيسية</span>
      </a>
      ${user && user.role === 'investor' ? `
        <a href="#/admin" class="mobile-nav-item ${path.startsWith('admin') ? 'active' : ''} text-blue-600 font-extrabold">
          <i class="fa-solid fa-briefcase"></i>
          <span>المستثمر</span>
        </a>
      ` : (user && user.role === 'merchant' ? `
        <a href="#/admin/products" class="mobile-nav-item ${path.startsWith('admin') ? 'active' : ''} text-emerald-600 font-extrabold">
          <i class="fa-solid fa-store"></i>
          <span>التاجر</span>
        </a>
      ` : `
        <a href="#/category/all" class="mobile-nav-item ${path.startsWith('category') ? 'active' : ''}">
          <i class="fa-solid fa-layer-group"></i>
          <span>الأقسام</span>
        </a>
      `)}
      <button onclick="CartDrawer.toggle()" class="mobile-nav-item ${path === 'cart' ? 'active' : ''}">
        <div class="relative">
          <i class="fa-solid fa-cart-shopping"></i>
          ${count > 0 ? `<span class="badge-counter" style="top:-8px; right:-10px;">${count}</span>` : ''}
        </div>
        <span>السلة</span>
      </button>
      <a href="#/wishlist" class="mobile-nav-item ${path === 'wishlist' ? 'active' : ''}">
        <div class="relative">
          <i class="fa-solid fa-heart"></i>
          ${State.getWishlistCount() > 0 ? `<span class="badge-counter" style="top:-8px; right:-10px;">${State.getWishlistCount()}</span>` : ''}
        </div>
        <span>المفضلة</span>
      </a>
      <a href="${profileLink}" class="mobile-nav-item ${path === 'profile' ? 'active' : ''}">
        <i class="fa-solid fa-user"></i>
        <span>حسابي</span>
      </a>
    `;

    if (typeof PWA !== 'undefined' && !PWA.isStandalone) {
      PWA.showInstallButtons();
    }
  },

  route() {
    const { path, queryParams } = this.getCurrentRoute();

    // Scroll to top
    window.scrollTo({ top: 0, behavior: 'instant' });

    // Check if navigating to admin (download the dashboard code first if needed)
    if (path.startsWith('admin')) {
      if (typeof AdminLayout === 'undefined') {
        const main = document.getElementById('main-content');
        if (main) main.innerHTML = '<div class="container py-16 text-center text-slate-400"><i class="fa-solid fa-spinner fa-spin text-3xl mb-3 text-emerald-600"></i><div>جاري فتح لوحة التحكم...</div></div>';
        this.loadAdminScripts()
          .then(() => { if (this.getCurrentRoute().path.startsWith('admin')) this.route(); })
          .catch(err => this.showToast(err.message, 'error'));
        return;
      }
      this.handleAdminRoutes(path, queryParams);
      return;
    }

    // Otherwise, ensure public layout (header/footer/mobile/chatbot) are visible
    if (typeof AdminLayout !== 'undefined') AdminLayout.restoreStoreLayout();
    this.renderHeaderAndFooter();
    this.renderMobileNav();

    // Check Maintenance Mode
    const user = State.user;
    const isStaffPrivileged = user && (
      user.role === 'super_admin' || 
      user.role === 'admin' || 
      user.email === 'admin@suki.store' || 
      user.email === 'ahmed@suki.store' || 
      (user.name && user.name.includes('أحمد غريب'))
    );

    if (this.isMaintenanceMode && !isStaffPrivileged) {
      this.renderMaintenancePage();
      return;
    }

    // Public Store Routes
    if (path === '' || path === '/') {
      HomePage.render();
    } else if (path.startsWith('category/')) {
      const catId = path.split('/')[1];
      CategoryPage.render(catId, queryParams);
    } else if (path === 'products' || path === 'search' || path === 'categories') {
      CategoryPage.render('all', queryParams);
    } else if (path.startsWith('product/')) {
      const prodId = path.split('/')[1];
      ProductPage.render(prodId);
    } else if (path === 'cart') {
      CartPage.render();
    } else if (path === 'checkout') {
      CheckoutPage.render();
    } else if (path === 'wishlist') {
      WishlistPage.render();
    } else if (path === 'profile') {
      ProfilePage.render();
    } else if (path === 'orders') {
      OrdersPage.render();
    } else if (path.startsWith('order/')) {
      const orderId = path.split('/')[1];
      OrderDetailPage.render(orderId);
    } else if (path === 'returns') {
      ReturnsPage.render(queryParams.id);
    } else if (path === 'support' || path === 'contact') {
      SupportPage.render();
    } else if (path.startsWith('showcase/')) {
      ShowcasePage.render(path.split('/')[1]);
    } else if (path === 'about') {
      StaticPages.renderAbout();
    } else if (path === 'privacy') {
      StaticPages.renderPrivacy();
    } else if (path === 'terms') {
      StaticPages.renderTerms();
    } else if (path === 'login') {
      HomePage.render();
      AuthModal.open('login');
    } else if (path === 'register') {
      HomePage.render();
      AuthModal.open('register');
    } else {
      HomePage.render();
    }
  },

  handleAdminRoutes(path, queryParams) {
    if (!AdminLayout.checkAccess()) return;

    // Dedicated automatic routing for Investor role
    if (State.user && State.user.role === 'investor') {
      if (path === 'admin/products') {
        ProductsAdmin.render(queryParams);
        return;
      }
      InvestorsAdmin.renderInvestorPortal();
      return;
    }

    // Merchants have ONE view-only portal (account / products at wholesale cost / orders)
    if (State.user && State.user.role === 'merchant') {
      const tabByPath = { 'admin/products': 'products', 'admin/orders': 'orders' };
      MerchantAccountingAdmin.render(queryParams.tab || tabByPath[path] || 'account');
      return;
    }

    if (path === 'admin' || path === 'admin/dashboard') {
      // Accountants have no access to the general store dashboard: open their accounting home
      if (State.user && State.user.role === 'accountant') {
        window.location.hash = '#/admin/accounting';
        return;
      }
      AdminDashboard.render(queryParams.timeRange || null);
    } else if (path === 'admin/reports') {
      if (!AdminLayout.hasPermission('canViewReports')) {
        this.showToast('ليس لديك صلاحية لعرض تقارير المبيعات', 'error');
        window.location.hash = '#/admin';
        return;
      }
      ReportsAdmin.render(queryParams.timeRange || null);
    } else if (path === 'admin/push') {
      if (!AdminLayout.hasPermission('canManagePush')) {
        this.showToast('ليس لديك صلاحية لإدارة إشعارات الدفع', 'error');
        window.location.hash = '#/admin';
        return;
      }
      PushAdmin.render();
    } else if (path === 'admin/products') {
      if (!AdminLayout.hasPermission('canManageProducts')) {
        this.showToast('ليس لديك صلاحية لإدارة المنتجات', 'error');
        window.location.hash = '#/admin';
        return;
      }
      ProductsAdmin.render(queryParams);
    } else if (path === 'admin/bulk-upload') {
      if (!AdminLayout.hasPermission('canManageProducts')) {
        this.showToast('ليس لديك صلاحية لإدارة المنتجات', 'error');
        window.location.hash = '#/admin';
        return;
      }
      BulkUploadAdmin.render();
    } else if (path === 'admin/merchants') {
      if (!AdminLayout.hasPermission('canManageMerchants') && !AdminLayout.hasPermission('canManageProducts') && !AdminLayout.hasPermission('canViewReports') && State.user?.role !== 'super_admin' && State.user?.role !== 'admin') {
        this.showToast('ليس لديك صلاحية لعرض قائمة التجار', 'error');
        window.location.hash = '#/admin';
        return;
      }
      MerchantsAdmin.render();
    } else if (path === 'admin/investors') {
      if (!AdminLayout.hasPermission('canManageInvestors') && State.user?.role !== 'super_admin' && State.user?.role !== 'admin' && State.user?.role !== 'investor') {
        this.showToast('ليس لديك صلاحية لعرض قسم المستثمرين', 'error');
        window.location.hash = '#/admin';
        return;
      }
      InvestorsAdmin.render();
    } else if (path === 'admin/investor-accounting') {
      if (typeof InvestorsAdmin !== 'undefined') {
        InvestorsAdmin.renderInvestorPortal();
      }
    } else if (path.startsWith('admin/investor/')) {
      const invId = path.split('/')[2];
      if (typeof InvestorsAdmin !== 'undefined') {
        InvestorsAdmin.openStatement(invId, queryParams.month || 'all');
      }
    } else if (path === 'admin/merchant-accounting') {
      if (typeof MerchantAccountingAdmin !== 'undefined') {
        MerchantAccountingAdmin.render();
      } else {
        this.showToast('جاري تحميل وحدة حسابات التجار...', 'info');
      }
    } else if (path === 'admin/accounting') {
      const isSuper = State.user && (State.user.role === 'super_admin' || State.user.role === 'admin');
      const isAccountant = State.user && (State.user.role === 'accountant' || Boolean(State.user.permissions?.canManageAccounting));
      if (!isSuper && !isAccountant) {
        this.showToast('غير مصرح لك بالدخول إلى قسم المحاسبة', 'error');
        window.location.hash = '#/admin';
        return;
      }
      if (typeof AccountingAdmin !== 'undefined' && AccountingAdmin.render) {
        AccountingAdmin.render();
      } else {
        console.error('AccountingAdmin is not loaded yet');
      }
    } else if (path === 'admin/categories') {
      if (!AdminLayout.hasPermission('canManageCategories')) {
        this.showToast('ليس لديك صلاحية لإدارة الأقسام', 'error');
        window.location.hash = '#/admin';
        return;
      }
      CategoriesAdmin.render();
    } else if (path === 'admin/orders') {
      if (!AdminLayout.hasPermission('canManageOrders')) {
        this.showToast('ليس لديك صلاحية لإدارة الطلبات', 'error');
        window.location.hash = '#/admin';
        return;
      }
      OrdersAdmin.render();
    } else if (path === 'admin/returns') {
      if (!AdminLayout.hasPermission('canManageReturns')) {
        this.showToast('ليس لديك صلاحية لإدارة طلبات الاستبدال', 'error');
        window.location.hash = '#/admin';
        return;
      }
      ReturnsAdmin.render(queryParams);
    } else if (path === 'admin/customers') {
      if (!AdminLayout.hasPermission('canManageCustomers')) {
        this.showToast('ليس لديك صلاحية لإدارة العملاء', 'error');
        window.location.hash = '#/admin';
        return;
      }
      CustomersAdmin.render();
    } else if (path === 'admin/staff') {
      if (State.user && State.user.role !== 'super_admin') {
        this.showToast('قسم إدارة الموظفين مخصص للمدير العام فقط', 'error');
        window.location.hash = '#/admin';
        return;
      }
      StaffAdmin.render();
    } else if (path === 'admin/coupons') {
      if (!AdminLayout.hasPermission('canManageCoupons')) {
        this.showToast('ليس لديك صلاحية لإدارة الكوبونات', 'error');
        window.location.hash = '#/admin';
        return;
      }
      CouponsAdmin.render();
    } else if (path === 'admin/banners') {
      if (!AdminLayout.hasPermission('canManageBanners')) {
        this.showToast('ليس لديك صلاحية لإدارة البانرات', 'error');
        window.location.hash = '#/admin';
        return;
      }
      BannersAdmin.render();
    } else if (path === 'admin/showcases') {
      ShowcasesAdmin.render();
    } else if (path === 'admin/activity') {
      if (!AdminLayout.hasPermission('canViewActivity')) {
        this.showToast('ليس لديك صلاحية لعرض سجل النشاطات', 'error');
        window.location.hash = '#/admin';
        return;
      }
      ActivityAdmin.render();
    } else if (path === 'admin/security') {
      if (State.user && State.user.role !== 'super_admin') {
        this.showToast('قسم الأمان مخصص للمدير العام فقط', 'error');
        window.location.hash = '#/admin';
        return;
      }
      SecurityAdmin.render();
    } else if (path === 'admin/live-chat') {
      if (!AdminLayout.hasPermission('canManageLiveChat')) {
        this.showToast('ليس لديك صلاحية للمحادثات المباشرة', 'error');
        window.location.hash = '#/admin';
        return;
      }
      LiveChatAdmin.render();
    } else if (path === 'admin/support') {
      if (!AdminLayout.hasPermission('canManageSupport')) {
        this.showToast('ليس لديك صلاحية لرسائل الدعم', 'error');
        window.location.hash = '#/admin';
        return;
      }
      SupportAdmin.render();
    } else if (path === 'admin/ledger' || path === 'admin/employees') {
      const u = State.user || {};
      const ok = u.role === 'super_admin' || u.role === 'admin' || u.role === 'accountant' || Boolean(u.permissions?.canManageAccounting);
      if (!ok) {
        this.showToast('القسم ده للمدير العام والمحاسب بس', 'error');
        window.location.hash = '#/admin';
        return;
      }
      if (path === 'admin/ledger') LedgerAdmin.render(queryParams.tab || null);
      else EmployeesAdmin.render(queryParams.tab || null);
    } else if (path === 'admin/reviews') {
      const role = State.user?.role;
      if (typeof ReviewsAdmin === 'undefined' || !AdminLayout.hasPermission('canManageProducts') || role === 'merchant' || role === 'investor') {
        this.showToast('ليس لديك صلاحية لإدارة التقييمات', 'error');
        window.location.hash = '#/admin';
        return;
      }
      ReviewsAdmin.render();
    } else if (path === 'admin/settings') {
      if (typeof SettingsAdmin === 'undefined' || !AdminLayout.hasPermission('canManageSettings')) {
        this.showToast('ليس لديك صلاحية لإعدادات المتجر', 'error');
        window.location.hash = '#/admin';
        return;
      }
      SettingsAdmin.render();
    } else {
      if (!AdminLayout.hasPermission('canViewDashboard')) {
        if (State.user?.role === 'accountant' || AdminLayout.hasPermission('canManageAccounting')) {
          window.location.hash = '#/admin/accounting';
          return;
        } else if (AdminLayout.hasPermission('canManageOrders')) {
          window.location.hash = '#/admin/orders';
          return;
        } else if (AdminLayout.hasPermission('canManageProducts')) {
          window.location.hash = '#/admin/products';
          return;
        }
      }
      AdminDashboard.render();
    }
  },

  // Modal Dialog Helpers
  openModal(title, html) {
    const container = document.getElementById('modal-container');
    const titleEl = document.getElementById('modal-title');
    const bodyEl = document.getElementById('modal-body');
    if (titleEl) titleEl.innerText = title;
    if (bodyEl) bodyEl.innerHTML = html;
    if (container) {
      container.classList.remove('hidden');
      document.body.style.overflow = 'hidden';
    }
  },

  closeModal() {
    const container = document.getElementById('modal-container');
    if (container) {
      container.classList.add('hidden');
      document.body.style.overflow = '';
    }
    this.confirmCallback = null;
  },

  confirm(message, onConfirm) {
    this.confirmCallback = onConfirm;
    this.openModal('تأكيد الإجراء', `
      <div class="text-right py-2">
        <p class="text-slate-700 text-sm font-semibold mb-6 leading-relaxed">${message}</p>
        <div class="flex gap-3 justify-end">
          <button onclick="App.closeModal()" class="px-5 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs">
            إلغاء
          </button>
          <button onclick="App.executeConfirm()" class="px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-xs">
            نعم، تأكيد التنفيذ
          </button>
        </div>
      </div>
    `);
  },

  executeConfirm() {
    if (typeof this.confirmCallback === 'function') {
      const cb = this.confirmCallback;
      this.closeModal();
      cb();
    } else {
      this.closeModal();
    }
  },

  // Toast Notification System
  showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const iconMap = {
      success: 'fa-circle-check text-emerald-600',
      error: 'fa-circle-xmark text-red-600',
      warning: 'fa-triangle-exclamation text-amber-500',
      info: 'fa-circle-info text-blue-500'
    };

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
      <i class="fa-solid ${iconMap[type] || iconMap.info} text-lg"></i>
      <span class="flex-1">${message}</span>
    `;

    container.appendChild(toast);

    setTimeout(() => {
      toast.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(-100%)';
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  },

  // Performance Optimization: Global image enhancer & graceful error fallback
  optimizeImages(root = document) {
    if (!root || !root.querySelectorAll) return;
    const images = root.querySelectorAll('img');
    const svgFallback = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 200' width='100%25' height='100%25'%3E%3Crect width='200' height='200' fill='%23f1f5f9'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' fill='%2394a3b8' font-family='sans-serif' font-weight='bold' font-size='14'%3E%D8%B3%D9%88%D9%82%D9%8A%20%D8%B3%D8%AA%D9%88%D8%B1%3C/text%3E%3C/svg%3E";

    images.forEach(img => {
      if (!img.getAttribute('loading')) {
        img.setAttribute('loading', 'lazy');
      }
      if (!img.getAttribute('decoding')) {
        img.setAttribute('decoding', 'async');
      }
      if (!img.hasAttribute('data-fallback-bound')) {
        img.setAttribute('data-fallback-bound', 'true');
        img.addEventListener('error', function() {
          if (!this.src.startsWith('data:image/svg+xml')) {
            this.src = svgFallback;
          }
        }, { once: true });
      }
    });
  },

  initImageObserver() {
    this.optimizeImages(document);
    if (window.MutationObserver) {
      let debounceTimer = null;
      const observer = new MutationObserver((mutations) => {
        let hasAdded = false;
        for (const m of mutations) {
          if (m.addedNodes && m.addedNodes.length > 0) {
            hasAdded = true;
            break;
          }
        }
        if (hasAdded) {
          if (debounceTimer) clearTimeout(debounceTimer);
          debounceTimer = setTimeout(() => {
            this.optimizeImages(document.getElementById('main-content') || document);
          }, 60);
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });
    }
  }
};

// Auto start when DOM is ready
window.addEventListener('DOMContentLoaded', () => {
  App.init();
});
