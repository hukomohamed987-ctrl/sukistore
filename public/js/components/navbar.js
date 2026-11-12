/**
 * Suki Store Navbar Component
 */

const Navbar = {
  searchDebounceTimer: null,

  esc(s) { return String(s === undefined || s === null ? '' : s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch])); },

  // Avatar: uploaded photo, or the first letter of the name (no outside image service)
  avatar(user, size = 'w-8 h-8 text-sm') {
    const letter = this.esc((String(user.name || '?').trim()[0] || '?').toUpperCase());
    if (user.avatar && !/dicebear\.com/.test(user.avatar)) {
      return `<span class="nav-avatar ${size}"><img src="${this.esc(user.avatar)}" alt="" onerror="this.remove()" /><b>${letter}</b></span>`;
    }
    return `<span class="nav-avatar ${size}"><b>${letter}</b></span>`;
  },

  render() {
    const user = State.user;
    const cartCount = State.getCartCount();
    const wishCount = State.getWishlistCount();
    const categories = State.categories || [];
    const currentGov = State.getDeliveryGovernorate();
    const mainCats = categories.slice(0, 5);
    const moreCats = categories.slice(5);
    const isEn = typeof I18n !== 'undefined' && I18n.lang === 'en';

    const isStaffOrAdmin = user && ['super_admin', 'admin', 'staff', 'accountant'].includes(user.role);

    setTimeout(() => {
      if (typeof PWA !== 'undefined' && !PWA.isStandalone) PWA.showInstallButtons();
      Navbar.fetchNotificationsCount();
    }, 50);

    const dashLink = !user ? '' : user.role === 'investor'
      ? { href: '#/admin', icon: 'fa-briefcase', label: 'لوحة المستثمر' }
      : user.role === 'merchant'
        ? { href: '#/admin/products', icon: 'fa-store', label: 'لوحة التاجر' }
        : isStaffOrAdmin ? { href: '#/admin', icon: 'fa-shield-halved', label: 'لوحة التحكم' } : '';

    return `
      <!-- Top Bar -->
      <div class="top-bar">
        <div class="container top-bar-inner">
          <button onclick="State.openChangeAddressModal()" class="delivery-gov-btn" title="تحديد عنوان التوصيل">
            <i class="fa-solid fa-location-dot text-amber-300"></i>
            <span class="truncate">التوصيل إلى: <strong>${this.esc(State.getDeliveryLabel ? State.getDeliveryLabel() : currentGov)}</strong></span>
            <i class="fa-solid fa-chevron-down text-[9px] opacity-70"></i>
          </button>
          <div class="top-bar-perks">
            <span><i class="fa-solid fa-truck-fast"></i> شحن لكل المحافظات</span>
            <span><i class="fa-solid fa-money-bill-wave"></i> الدفع عند الاستلام</span>
          </div>
          <div class="top-bar-links">
            <button type="button" onclick="I18n.toggle()" class="lang-toggle" title="${isEn ? 'التحويل للعربية' : 'Switch to English'}">
              <i class="fa-solid fa-globe"></i> <span data-no-i18n>${isEn ? 'العربية' : 'English'}</span>
            </button>
            <a href="#/support" class="hidden sm:inline-flex items-center gap-1.5"><i class="fa-solid fa-headset"></i> <span>مركز المساعدة</span></a>
          </div>
        </div>
      </div>

      <!-- Main Sticky Navbar -->
      <nav class="site-navbar">
        <div class="container navbar-main">
          <div class="navbar-top-row">
            <a href="#/" class="brand-logo">
              <img src="/icons/icon-192.png" alt="سوقي ستور" class="brand-logo-img" />
              <div class="brand-text">
                <span class="brand-name">سوقي ستور</span>
                <span class="brand-tagline">سوقك العربي الأول</span>
              </div>
            </a>

            <div class="nav-actions">
              <button id="pwa-install-nav-btn" class="pwa-install-pill hidden" onclick="PWA.install()" title="ثبّت تطبيق سوقي ستور على جهازك">
                <i class="fa-solid fa-mobile-screen-button text-emerald-600 dark:text-emerald-400"></i>
                <span class="pwa-install-label">تحميل التطبيق</span>
              </button>

              ${dashLink ? `
                <a href="${dashLink.href}" class="nav-dash-link" title="${dashLink.label}">
                  <i class="fa-solid ${dashLink.icon}"></i><span>${dashLink.label}</span>
                </a>` : ''}

              <div class="relative" id="navbar-notif-container">
                <button class="action-btn icon-only" onclick="Navbar.toggleNotificationsDropdown(event)" title="الإشعارات" aria-label="الإشعارات">
                  <span class="relative inline-flex"><i class="fa-solid fa-bell text-amber-500"></i><span class="badge-counter hidden" id="navbar-notif-count">0</span></span>
                </button>
                <div id="navbar-notif-dropdown" class="hidden notif-dropdown absolute top-full mt-2 w-80 max-w-[92vw] bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 py-3 z-50 overflow-hidden text-right">
                  <div class="px-4 pb-2.5 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
                    <div class="flex items-center gap-2">
                      <i class="fa-solid fa-bell text-amber-500 text-sm"></i>
                      <h4 class="font-extrabold text-xs text-slate-800 dark:text-white">الإشعارات</h4>
                      <span id="notif-unread-pill" class="hidden text-[10px] font-black bg-emerald-500 text-white px-2 py-0.5 rounded-full"></span>
                    </div>
                    <button type="button" onclick="Navbar.markAllNotificationsRead()" class="text-[11px] text-emerald-600 dark:text-emerald-400 hover:underline font-bold">تحديد الكل كمقروء</button>
                  </div>
                  <div id="navbar-notif-list" class="max-h-80 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-700">
                    <div class="p-6 text-center text-xs text-slate-400"><i class="fa-solid fa-spinner fa-spin text-lg text-emerald-600"></i></div>
                  </div>
                </div>
              </div>

              <a href="#/wishlist" class="action-btn icon-only desktop-only" title="المفضلة" aria-label="المفضلة">
                <span class="relative inline-flex"><i class="fa-solid fa-heart text-rose-500"></i>${wishCount > 0 ? `<span class="badge-counter" id="navbar-wishlist-count">${wishCount}</span>` : ''}</span>
              </a>

              <button class="action-btn icon-only desktop-only" onclick="CartDrawer.toggle()" title="السلة" aria-label="السلة">
                <span class="relative inline-flex"><i class="fa-solid fa-cart-shopping text-emerald-600"></i>${cartCount > 0 ? `<span class="badge-counter" id="navbar-cart-count">${cartCount}</span>` : ''}</span>
              </button>

              <button class="action-btn icon-only theme-toggle-btn" onclick="Theme.toggle()" title="${Theme.isDark() ? 'الوضع النهاري' : 'الوضع الليلي'}" aria-label="الوضع الليلي">
                ${Theme.isDark() ? '<i class="fa-solid fa-sun text-amber-400"></i>' : '<i class="fa-solid fa-moon text-slate-700"></i>'}
              </button>

              ${user ? `
                <div class="relative" id="user-menu-container">
                  <button class="user-chip" onclick="Navbar.toggleUserDropdown()" aria-label="حسابي">
                    ${this.avatar(user)}
                    <span class="user-chip-name">${this.esc(String(user.name || '').split(' ')[0])}</span>
                    <i class="fa-solid fa-chevron-down text-[10px] text-slate-400"></i>
                  </button>
                  <div id="user-dropdown-menu" class="hidden absolute top-full mt-2 w-60 rounded-2xl shadow-2xl py-2 z-50 text-right overflow-hidden">
                    <div class="user-dropdown-header px-4 py-3 flex items-center gap-3">
                      ${this.avatar(user, 'w-10 h-10 text-base')}
                      <div class="min-w-0">
                        <div class="font-extrabold text-sm truncate text-slate-800 dark:text-white">${this.esc(user.name)}</div>
                        <div class="text-[11px] opacity-70 truncate" dir="ltr">${this.esc(user.email || user.phone || '')}</div>
                      </div>
                    </div>
                    <a href="#/profile" class="flex items-center gap-2.5 px-4 py-2.5 text-xs font-bold"><i class="fa-solid fa-user-circle w-5 text-emerald-600 text-sm"></i><span>حسابي الشخصي</span></a>
                    <a href="#/orders" class="flex items-center gap-2.5 px-4 py-2.5 text-xs font-bold"><i class="fa-solid fa-box-archive w-5 text-indigo-500 text-sm"></i><span>طلباتي</span></a>
                    <a href="#/returns" class="flex items-center gap-2.5 px-4 py-2.5 text-xs font-bold"><i class="fa-solid fa-arrow-rotate-left w-5 text-amber-500 text-sm"></i><span>طلبات الاستبدال</span></a>
                    ${user.role === 'merchant' ? `<a href="#/admin/merchant-accounting" class="flex items-center gap-2.5 px-4 py-2.5 text-xs font-bold"><i class="fa-solid fa-receipt w-5 text-sm text-emerald-500"></i><span>حساباتي ومستحقاتي</span></a>` : ''}
                    ${dashLink ? `
                      <div class="border-t border-slate-200 dark:border-slate-700 my-1"></div>
                      <a href="${dashLink.href}" class="admin-portal-link flex items-center gap-2.5 px-4 py-2.5 text-xs font-black"><i class="fa-solid ${dashLink.icon} w-5 text-sm"></i><span>${dashLink.label}</span></a>` : ''}
                    <div class="border-t border-slate-200 dark:border-slate-700 my-1"></div>
                    <button onclick="State.logout()" class="logout-btn w-full text-right flex items-center gap-2.5 px-4 py-2.5 text-xs font-bold cursor-pointer"><i class="fa-solid fa-right-from-bracket w-5 text-sm"></i><span>تسجيل الخروج</span></button>
                  </div>
                </div>
              ` : `
                <button class="login-btn-pill" onclick="AuthModal.open('login')">
                  <i class="fa-regular fa-user"></i>
                  <span>دخول</span>
                </button>
              `}
            </div>
          </div>

          <!-- Search Bar with Live Suggestions -->
          <div class="search-wrapper">
            <form class="search-form" onsubmit="Navbar.handleSearchSubmit(event)">
              <input type="text" id="main-search-input" class="search-input" placeholder="ابحث عن منتج أو ماركة..." autocomplete="off"
                oninput="Navbar.handleSearchInput(event)" onfocus="Navbar.handleSearchFocus(event)" />
              <button type="submit" class="search-submit-btn" title="بحث" aria-label="بحث"><i class="fa-solid fa-magnifying-glass"></i></button>
            </form>
            <div id="search-autocomplete-dropdown" class="autocomplete-dropdown hidden"></div>
          </div>
        </div>

        <!-- Categories Bar -->
        <div class="categories-nav">
          <div class="container">
            <ul class="categories-list">
              <li><a href="#/" class="cat-link active"><i class="fa-solid fa-house"></i> الرئيسية</a></li>
              ${mainCats.map(cat => `
                <li><a href="#/category/${cat.id}" class="cat-link"><i class="fa-solid fa-${this.esc(cat.icon || 'tag')}"></i> ${this.esc(cat.name)}</a></li>
              `).join('')}
              ${moreCats.length > 0 ? `
                <li class="relative more-categories-wrapper">
                  <button type="button" class="cat-link more-cat-btn" id="more-categories-btn" onclick="Navbar.toggleMoreCategories(event)">
                    <i class="fa-solid fa-layer-group text-emerald-600"></i>
                    <span>المزيد من الأقسام</span>
                    <span class="more-cat-count-badge">${moreCats.length}</span>
                    <i class="fa-solid fa-chevron-down text-[10px] more-cat-arrow transition-transform"></i>
                  </button>
                  <div id="more-categories-backdrop" class="hidden more-cat-backdrop" onclick="Navbar.closeMoreCategories()"></div>
                  <div id="more-categories-dropdown" class="hidden more-cat-dropdown-panel">
                    <div class="more-cat-header">
                      <div class="flex items-center gap-2.5">
                        <div class="w-8 h-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center text-sm shadow-sm flex-shrink-0"><i class="fa-solid fa-layer-group"></i></div>
                        <div>
                          <h4 class="font-extrabold text-sm text-slate-800 dark:text-white leading-tight">باقي الأقسام</h4>
                          <p class="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">${moreCats.length} أقسام إضافية</p>
                        </div>
                      </div>
                      <button type="button" class="more-cat-close-btn" onclick="Navbar.closeMoreCategories()" title="إغلاق"><i class="fa-solid fa-xmark"></i></button>
                    </div>
                    <div class="more-cat-body">
                      ${moreCats.map(cat => `
                        <a href="#/category/${cat.id}" class="more-cat-card group" onclick="Navbar.closeMoreCategories()">
                          <div class="more-cat-icon"><i class="fa-solid fa-${this.esc(cat.icon || 'tag')}"></i></div>
                          <div class="more-cat-info">
                            <div class="more-cat-name">${this.esc(cat.name)}</div>
                            <div class="more-cat-desc">${this.esc(cat.description || 'تصفح أحدث المنتجات والعروض')}</div>
                          </div>
                          <div class="more-cat-arrow-icon"><i class="fa-solid fa-chevron-left text-xs"></i></div>
                        </a>
                      `).join('')}
                    </div>
                    <div class="more-cat-footer">
                      <a href="#/category/all" class="more-cat-all-btn" onclick="Navbar.closeMoreCategories()">
                        <i class="fa-solid fa-table-cells-large"></i><span>كل الأقسام</span><i class="fa-solid fa-arrow-left text-xs"></i>
                      </a>
                    </div>
                  </div>
                </li>
              ` : ''}
              <li><a href="#/support" class="cat-link cat-link-contact"><i class="fa-solid fa-headset"></i> تواصل معنا</a></li>
            </ul>
          </div>
        </div>
      </nav>
    `;
  },

  toggleUserDropdown() {
    const dropdown = document.getElementById('user-dropdown-menu');
    if (dropdown) {
      dropdown.classList.toggle('hidden');
    }
  },

  toggleMoreCategories(e) {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    const dropdown = document.getElementById('more-categories-dropdown');
    const backdrop = document.getElementById('more-categories-backdrop');
    const btn = document.getElementById('more-categories-btn');
    if (dropdown) {
      const isHidden = dropdown.classList.contains('hidden');
      if (isHidden) {
        dropdown.classList.remove('hidden');
        if (backdrop) backdrop.classList.remove('hidden');
        if (btn) btn.classList.add('active');
      } else {
        dropdown.classList.add('hidden');
        if (backdrop) backdrop.classList.add('hidden');
        if (btn) btn.classList.remove('active');
      }
    }
  },

  closeMoreCategories() {
    const dropdown = document.getElementById('more-categories-dropdown');
    const backdrop = document.getElementById('more-categories-backdrop');
    const btn = document.getElementById('more-categories-btn');
    if (dropdown) dropdown.classList.add('hidden');
    if (backdrop) backdrop.classList.add('hidden');
    if (btn) btn.classList.remove('active');
  },

  handleSearchInput(event) {
    clearTimeout(this.searchDebounceTimer);
    const query = event.target.value.trim();
    const dropdown = document.getElementById('search-autocomplete-dropdown');

    if (!query || query.length < 1) {
      if (dropdown) dropdown.classList.add('hidden');
      return;
    }

    this.searchDebounceTimer = setTimeout(async () => {
      try {
        const res = await API.get('/products/suggest', { q: query });
        if (res.success && res.suggestions && res.suggestions.length > 0) {
          const itemsHtml = res.suggestions.map(item => `
            <a href="#/product/${item.id}" class="autocomplete-item flex items-center gap-3 p-2.5 hover:bg-emerald-50/60 transition border-b border-slate-100 last:border-b-0" onclick="Navbar.closeSearchDropdown()">
              <img src="${item.image || '/images/no-image.svg'}" class="w-12 h-12 rounded-lg object-cover border border-slate-200 flex-shrink-0" />
              <div class="flex-1 min-w-0">
                ${item.brand ? `<span class="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">${item.brand}</span>` : ''}
                <div class="font-bold text-xs text-slate-800 truncate mt-0.5">${item.title}</div>
                <div class="flex items-center gap-2 mt-0.5">
                  <span class="text-xs text-emerald-600 font-extrabold">${item.price} ج.م</span>
                  ${item.compareAtPrice && item.compareAtPrice > item.price ? `<span class="text-[10px] text-slate-400 line-through">${item.compareAtPrice} ج.م</span>` : ''}
                </div>
              </div>
              <i class="fa-solid fa-angle-left text-slate-400 text-xs"></i>
            </a>
          `).join('');

          dropdown.innerHTML = `
            ${itemsHtml}
            <div class="p-2.5 bg-slate-50 border-t border-slate-100 text-center">
              <a href="#/search?q=${encodeURIComponent(query)}" onclick="Navbar.closeSearchDropdown()" class="text-xs font-bold text-emerald-700 hover:text-emerald-800 flex items-center justify-center gap-1.5">
                <span>عرض جميع نتائج البحث عن "${query}"</span>
                <i class="fa-solid fa-arrow-left text-[10px]"></i>
              </a>
            </div>
          `;
          dropdown.classList.remove('hidden');
        } else {
          dropdown.innerHTML = `
            <div class="p-5 text-center text-xs text-slate-500">
              <div class="text-slate-400 mb-1"><i class="fa-solid fa-magnifying-glass text-lg"></i></div>
              لا توجد منتجات مطابقة لـ "<strong>${query}</strong>"
            </div>
          `;
          dropdown.classList.remove('hidden');
        }
      } catch (err) {
        // ignore
      }
    }, 250);
  },

  handleSearchFocus(event) {
    if (event.target.value.trim().length >= 1) {
      const dropdown = document.getElementById('search-autocomplete-dropdown');
      if (dropdown && dropdown.innerHTML.trim()) {
        dropdown.classList.remove('hidden');
      }
    }
  },

  closeSearchDropdown() {
    const dropdown = document.getElementById('search-autocomplete-dropdown');
    if (dropdown) dropdown.classList.add('hidden');
  },

  async fetchNotificationsCount() {
    try {
      const res = await API.get('/notifications');
      if (res && res.success) {
        const badge = document.getElementById('navbar-notif-count');
        const count = res.unreadCount || 0;
        if (badge) {
          if (count > 0) {
            badge.textContent = count > 99 ? '99+' : count;
            badge.classList.remove('hidden');
          } else {
            badge.classList.add('hidden');
          }
        }
      }
    } catch (e) {
      // Non-blocking
    }
  },

  async toggleNotificationsDropdown(e) {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    const dropdown = document.getElementById('navbar-notif-dropdown');
    if (!dropdown) return;

    const isHidden = dropdown.classList.contains('hidden');
    if (isHidden) {
      // Close other dropdowns
      const userMenu = document.getElementById('user-dropdown-menu');
      if (userMenu) userMenu.classList.add('hidden');
      this.closeMoreCategories();

      dropdown.classList.remove('hidden');
      await this.loadNotifications();
    } else {
      dropdown.classList.add('hidden');
    }
  },

  closeNotificationsDropdown() {
    const dropdown = document.getElementById('navbar-notif-dropdown');
    if (dropdown) dropdown.classList.add('hidden');
  },

  async loadNotifications() {
    const listEl = document.getElementById('navbar-notif-list');
    const unreadPill = document.getElementById('notif-unread-pill');
    if (!listEl) return;

    try {
      const res = await API.get('/notifications');
      if (res && res.success) {
        const notifs = res.notifications || [];
        const unreadCount = res.unreadCount || 0;

        if (unreadPill) {
          if (unreadCount > 0) {
            unreadPill.textContent = `${unreadCount} جديد`;
            unreadPill.classList.remove('hidden');
          } else {
            unreadPill.classList.add('hidden');
          }
        }

        const badge = document.getElementById('navbar-notif-count');
        if (badge) {
          if (unreadCount > 0) {
            badge.textContent = unreadCount > 99 ? '99+' : unreadCount;
            badge.classList.remove('hidden');
          } else {
            badge.classList.add('hidden');
          }
        }

        if (notifs.length === 0) {
          listEl.innerHTML = `
            <div class="p-8 text-center text-slate-400">
              <div class="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-400 flex items-center justify-center text-xl mx-auto mb-2">
                <i class="fa-regular fa-bell-slash"></i>
              </div>
              <div class="text-xs font-bold text-slate-600 dark:text-slate-300">لا توجد إشعارات حالياً</div>
              <p class="text-[11px] text-slate-400 mt-1">ستظهر هنا أحدث التنبيهات والعروض الحصرية</p>
            </div>
          `;
          return;
        }

        listEl.innerHTML = notifs.map(n => {
          const isRead = n.isRead;
          const timeAgo = this.formatTimeAgo(n.createdAt);
          const iconHtml = n.icon && (n.icon.startsWith('http') || n.icon.startsWith('/uploads/') || n.icon.startsWith('/'))
            ? `<img src="${n.icon}" class="w-10 h-10 rounded-xl object-cover border border-slate-200 dark:border-slate-700 flex-shrink-0" onerror="this.src='/favicon.ico'" />`
            : `<div class="w-10 h-10 rounded-xl ${n.type === 'product' ? 'bg-emerald-100 text-emerald-600' : n.type === 'category' || n.type === 'subcategory' ? 'bg-indigo-100 text-indigo-600' : 'bg-amber-100 text-amber-600'} flex items-center justify-center text-base flex-shrink-0 shadow-sm"><i class="fa-solid ${n.icon || 'fa-bell'}"></i></div>`;

          const link = n.link || n.url || '#/';

          return `
            <div onclick="Navbar.handleNotificationClick('${n.id}', '${link}')" class="p-3.5 hover:bg-slate-50 dark:hover:bg-slate-700/60 transition cursor-pointer flex items-start gap-3 ${!isRead ? 'bg-emerald-50/40 dark:bg-emerald-950/20' : ''}">
              ${iconHtml}
              <div class="flex-1 min-w-0">
                <div class="flex items-center justify-between gap-2 mb-0.5">
                  <h5 class="font-extrabold text-xs text-slate-900 dark:text-white truncate">${n.title || 'إشعار من سوقي ستور'}</h5>
                  ${!isRead ? '<span class="w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0"></span>' : ''}
                </div>
                <p class="text-[11px] text-slate-600 dark:text-slate-300 leading-snug line-clamp-2">${n.message || n.body || ''}</p>
                <span class="text-[10px] text-slate-400 mt-1 block font-medium">${timeAgo}</span>
              </div>
            </div>
          `;
        }).join('');
      }
    } catch (err) {
      listEl.innerHTML = `
        <div class="p-4 text-center text-xs text-red-500">فشل تحميل الإشعارات</div>
      `;
    }
  },

  async handleNotificationClick(id, link) {
    this.closeNotificationsDropdown();
    try {
      await API.put(`/notifications/${id}/read`);
      this.fetchNotificationsCount();
    } catch (e) {}
    if (link) {
      const cleanHash = link.startsWith('#') ? link : `#${link.startsWith('/') ? link : '/' + link}`;
      window.location.hash = cleanHash;
    }
  },

  async markAllNotificationsRead() {
    try {
      await API.put('/notifications/mark-all-read');
      App.showToast('تم تحديد جميع الإشعارات كمقروءة ✅', 'success');
      this.loadNotifications();
      this.fetchNotificationsCount();
    } catch (err) {
      App.showToast('حدث خطأ أثناء تحديث الإشعارات', 'error');
    }
  },

  formatTimeAgo(dateStr) {
    if (!dateStr) return '';
    const diff = Math.floor((new Date() - new Date(dateStr)) / 1000);
    if (diff < 60) return 'الآن';
    if (diff < 3600) return `منذ ${Math.floor(diff / 60)} دقيقة`;
    if (diff < 86400) return `منذ ${Math.floor(diff / 3600)} ساعة`;
    return `منذ ${Math.floor(diff / 86400)} يوم`;
  },

  handleSearchSubmit(event) {
    event.preventDefault();
    const input = document.getElementById('main-search-input');
    const q = input ? input.value.trim() : '';
    this.closeSearchDropdown();
    if (q) {
      window.location.hash = `#/search?q=${encodeURIComponent(q)}`;
    }
  }
};

// Close dropdowns on outside click
document.addEventListener('click', (e) => {
  if (!e.target.closest('.search-wrapper')) {
    Navbar.closeSearchDropdown();
  }
  if (!e.target.closest('#user-menu-container')) {
    const dropdown = document.getElementById('user-dropdown-menu');
    if (dropdown) dropdown.classList.add('hidden');
  }
  if (!e.target.closest('#navbar-notif-container')) {
    Navbar.closeNotificationsDropdown();
  }
  if (!e.target.closest('.more-categories-wrapper')) {
    Navbar.closeMoreCategories();
  }
});
