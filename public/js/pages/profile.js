/**
 * Suki Store Customer Profile Page (with Multi-Address Management, Secondary Phone, WhatsApp, and Unique ID)
 */

const EGYPT_GOVS_LIST = [
  'القاهرة', 'الجيزة', 'الإسكندرية', 'الدقهلية', 'البحر الأحمر', 'البحيرة', 'الفيوم',
  'الغربية', 'الإسماعيلية', 'المنوفية', 'المنيا', 'القليوبية', 'الوادي الجديد',
  'السويس', 'أسوان', 'أسيوط', 'بني سويف', 'بورسعيد', 'دمياط', 'الشرقية',
  'جنوب سيناء', 'كفر الشيخ', 'مطروح', 'الأقصر', 'قنا', 'شمال سيناء', 'سوهاج'
];

const ProfilePage = {
  async render() {
    const main = document.getElementById('main-content');
    const user = State.user;

    if (!user) {
      main.innerHTML = `
        <div class="container py-16 text-center max-w-md mx-auto">
          <div class="bg-white dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700 p-8 shadow-sm">
            <div class="w-16 h-16 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 flex items-center justify-center text-3xl mx-auto mb-4">
              <i class="fa-solid fa-user-shield"></i>
            </div>
            <h2 class="text-xl font-extrabold text-slate-800 dark:text-white mb-2">إدارة حسابك الشخصي</h2>
            <p class="text-xs text-slate-500 dark:text-slate-400 mb-6 leading-relaxed">يُرجى تسجيل الدخول للوصول إلى معلومات حسابك، العناوين المحفوظة، وتفضيلاتك.</p>
            <div class="flex flex-col gap-3">
              <button onclick="AuthModal.open('login', '#/profile')" class="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs transition flex items-center justify-center gap-2">
                <i class="fa-solid fa-right-to-bracket"></i>
                <span>تسجيل الدخول</span>
              </button>
              <a href="#/" class="w-full py-3 px-4 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 font-bold rounded-xl text-xs transition inline-block">
                الرجوع للرئيسية
              </a>
            </div>
          </div>
        </div>
      `;
      return;
    }

    main.innerHTML = `
      <div class="container py-8 text-center text-slate-400">
        <i class="fa-solid fa-spinner fa-spin text-3xl mb-3 text-emerald-600"></i>
        <div>جاري تحميل بيانات الحساب...</div>
      </div>
    `;

    try {
      const [ordersRes, addrsRes] = await Promise.all([
        API.get('/orders/my-orders'),
        API.get('/auth/addresses')
      ]);

      const orders = ordersRes.orders || [];
      const addresses = addrsRes.addresses || user.addresses || [];

      // Keep user.addresses updated
      State.user.addresses = addresses;

      const totalSpent = orders
        .filter(o => o.status !== 'cancelled')
        .reduce((sum, o) => sum + (Number(o.grandTotal) || 0), 0);

      const activeCount = orders.filter(o => o.status === 'pending' || o.status === 'processing' || o.status === 'shipped').length;

      main.innerHTML = `
        <div class="container py-8">
          <!-- Profile Header Card -->
          <div class="bg-gradient-to-r from-emerald-800 to-slate-900 text-white rounded-2xl p-6 md:p-8 mb-8 flex flex-col md:flex-row items-center justify-between gap-6 shadow-md">
            <div class="flex items-center gap-5 flex-wrap">
              <div class="relative group cursor-pointer" onclick="ProfilePage.openAvatarModal()" title="تعديل صورتك الشخصية">
                <img src="${user.avatar || 'https://api.dicebear.com/7.x/initials/svg?seed=' + encodeURIComponent(user.name)}" class="w-20 h-20 md:w-24 md:h-24 rounded-full border-4 border-white/20 object-cover shadow-lg group-hover:opacity-80 transition" />
                <button type="button" class="absolute bottom-0 right-0 bg-emerald-600 text-white w-7 h-7 rounded-full flex items-center justify-center text-xs shadow-md border-2 border-white">
                  <i class="fa-solid fa-camera"></i>
                </button>
              </div>
              <div>
                <div class="flex items-center gap-3 mb-1 flex-wrap">
                  <h1 class="text-2xl font-extrabold">${user.name}</h1>
                  <span class="bg-white/20 text-emerald-200 text-xs px-3 py-1 rounded-full font-mono font-bold tracking-wider">
                    معرف الحساب: ${user.customerId || 'CUST-' + user.id.substring(0, 5)}
                  </span>
                </div>
                <div class="text-emerald-200 text-xs md:text-sm flex flex-wrap items-center gap-4 mt-2">
                  <span><i class="fa-solid fa-envelope ml-1"></i> ${user.email}</span>
                  <span><i class="fa-solid fa-phone ml-1"></i> ${user.phone || 'غير مسجل'}</span>
                  ${user.secondaryPhone ? `<span><i class="fa-solid fa-phone-flip ml-1"></i> إضافي: ${user.secondaryPhone}</span>` : ''}
                  ${user.whatsappPhone ? `<span><i class="fa-brands fa-whatsapp text-emerald-400 ml-1"></i> واتساب: ${user.whatsappPhone}</span>` : ''}
                </div>
              </div>
            </div>

            <div class="flex gap-2 flex-wrap">
              <button onclick="ProfilePage.openEditModal()" class="bg-white/10 hover:bg-white/20 text-white font-bold px-3.5 py-2.5 rounded-xl text-xs md:text-sm backdrop-blur-sm border border-white/20 transition">
                <i class="fa-solid fa-user-pen ml-1"></i> تعديل البيانات
              </button>
              <button onclick="ProfilePage.openPasswordModal()" class="bg-white/10 hover:bg-white/20 text-white font-bold px-3.5 py-2.5 rounded-xl text-xs md:text-sm backdrop-blur-sm border border-white/20 transition">
                <i class="fa-solid fa-key ml-1"></i> كلمة المرور
              </button>
              <button onclick="ProfilePage.logoutAllDevices()" class="bg-red-500/20 hover:bg-red-500/30 text-red-200 hover:text-white font-bold px-3.5 py-2.5 rounded-xl text-xs md:text-sm backdrop-blur-sm border border-red-500/30 transition" title="إلغاء صلاحية كافة الجلسات السابقة">
                <i class="fa-solid fa-power-off ml-1"></i> خروج من كل الأجهزة
              </button>
            </div>
          </div>

          <!-- Quick Stats Cards -->
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
            <div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
              <div>
                <div class="text-xs text-slate-500 font-bold mb-1">إجمالي الطلبات</div>
                <div class="text-2xl font-extrabold text-slate-800">${orders.length}</div>
              </div>
              <div class="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center text-xl">
                <i class="fa-solid fa-box-archive"></i>
              </div>
            </div>

            <div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
              <div>
                <div class="text-xs text-slate-500 font-bold mb-1">طلبات جارية وقيد الشحن</div>
                <div class="text-2xl font-extrabold text-amber-600">${activeCount}</div>
              </div>
              <div class="w-12 h-12 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center text-xl">
                <i class="fa-solid fa-truck-fast"></i>
              </div>
            </div>

            <div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
              <div>
                <div class="text-xs text-slate-500 font-bold mb-1">إجمالي المشتريات</div>
                <div class="text-2xl font-extrabold text-emerald-600">${totalSpent} ج.م</div>
              </div>
              <div class="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center text-xl">
                <i class="fa-solid fa-wallet"></i>
              </div>
            </div>
          </div>

          <!-- Main Grid -->
          <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <!-- Left Column: Multiple Addresses & Account Menu -->
            <div class="lg:col-span-1 flex flex-col gap-6">
              <!-- Saved Addresses Box -->
              <div class="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
                <div class="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
                  <h3 class="font-extrabold text-base text-slate-800 flex items-center gap-2">
                    <i class="fa-solid fa-map-location-dot text-emerald-600"></i>
                    <span>عناوين التوصيل (${addresses.length})</span>
                  </h3>
                  <button onclick="ProfilePage.openAddAddressModal()" class="text-xs font-bold bg-emerald-50 text-emerald-700 hover:bg-emerald-100 px-2.5 py-1.5 rounded-lg flex items-center gap-1 transition">
                    <i class="fa-solid fa-plus"></i> إضافة عنوان
                  </button>
                </div>

                ${addresses.length === 0 ? `
                  <div class="text-center py-6 text-slate-400 text-xs">
                    لم تقم بحفظ أي عناوين بعد. أضف عنوانك لتسريع إتمام الطلبات.
                  </div>
                ` : `
                  <div class="flex flex-col gap-3">
                    ${addresses.map(a => `
                      <div class="p-3.5 rounded-xl border ${a.isDefault ? 'border-emerald-500 bg-emerald-50/30' : 'border-slate-200 bg-slate-50'} flex flex-col gap-1.5">
                        <div class="flex items-center justify-between">
                          <span class="font-bold text-xs text-slate-800">${a.label || 'عنوان'}</span>
                          ${a.isDefault ? '<span class="text-[10px] bg-emerald-600 text-white font-bold px-2 py-0.5 rounded-full">الافتراضي</span>' : `
                            <button onclick="ProfilePage.setDefaultAddress('${a.id}')" class="text-[11px] text-emerald-600 hover:underline font-bold">تعيين كافتراضي</button>
                          `}
                        </div>
                        <div class="text-xs text-slate-600 font-semibold">${a.recipientName} • ${a.phone}</div>
                        <div class="text-xs text-slate-500 leading-relaxed">${a.governorate}، ${a.city} ${a.street ? '، ' + a.street : ''} ${a.building ? '، ' + a.building : ''}</div>
                        ${(a.latitude && a.longitude) ? `
                          <div class="text-[11px] text-emerald-700 font-bold bg-emerald-50 border border-emerald-200/60 rounded-lg px-2 py-1 w-fit flex items-center gap-1.5 mt-1">
                            <i class="fa-solid fa-map-location-dot text-emerald-600"></i>
                            <span>موقع مثبت بالخريطة (${Number(a.latitude).toFixed(4)}, ${Number(a.longitude).toFixed(4)})</span>
                          </div>
                        ` : ''}
                        <div class="flex items-center gap-3 pt-2 mt-1 border-t border-slate-200/60 text-xs">
                          <button onclick="ProfilePage.openEditAddressModal('${a.id}')" class="text-blue-600 hover:underline font-bold flex items-center gap-1">
                            <i class="fa-regular fa-pen-to-square"></i> تعديل
                          </button>
                          <button onclick="ProfilePage.deleteAddress('${a.id}')" class="text-red-500 hover:underline font-bold flex items-center gap-1">
                            <i class="fa-regular fa-trash-can"></i> حذف
                          </button>
                        </div>
                      </div>
                    `).join('')}
                  </div>
                `}
              </div>

              <!-- Quick Account Links -->
              <div class="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
                <h3 class="font-extrabold text-base text-slate-800 mb-4 pb-3 border-b border-slate-100">
                  إعدادات وروابط الحساب
                </h3>

                <div class="flex flex-col gap-2">
                  <a href="#/orders" class="p-3 rounded-xl hover:bg-slate-50 flex items-center justify-between text-sm font-bold text-slate-700">
                    <span class="flex items-center gap-2"><i class="fa-solid fa-list-check text-emerald-600"></i> طلباتي</span>
                    <i class="fa-solid fa-angle-left text-slate-400"></i>
                  </a>

                  <a href="#/returns" class="p-3 rounded-xl hover:bg-slate-50 flex items-center justify-between text-sm font-bold text-slate-700">
                    <span class="flex items-center gap-2"><i class="fa-solid fa-arrow-rotate-left text-amber-500"></i> طلبات الاستبدال والضمان</span>
                    <i class="fa-solid fa-angle-left text-slate-400"></i>
                  </a>

                  <a href="#/privacy" class="p-3 rounded-xl hover:bg-slate-50 flex items-center justify-between text-sm font-semibold text-slate-700">
                    <span class="flex items-center gap-2"><i class="fa-solid fa-shield-halved text-slate-400"></i> سياسة الخصوصية</span>
                    <i class="fa-solid fa-angle-left text-slate-400"></i>
                  </a>

                  <a href="#/terms" class="p-3 rounded-xl hover:bg-slate-50 flex items-center justify-between text-sm font-semibold text-slate-700">
                    <span class="flex items-center gap-2"><i class="fa-solid fa-file-contract text-slate-400"></i> الشروط والأحكام</span>
                    <i class="fa-solid fa-angle-left text-slate-400"></i>
                  </a>

                  <button onclick="ProfilePage.switchAccount()" class="w-full text-right p-3 rounded-xl hover:bg-amber-50 flex items-center justify-between text-sm font-bold text-amber-700">
                    <span class="flex items-center gap-2"><i class="fa-solid fa-arrows-rotate text-amber-600"></i> تبديل الحساب</span>
                    <i class="fa-solid fa-angle-left text-slate-400"></i>
                  </button>

                  <button onclick="State.logout()" class="w-full text-right p-3 rounded-xl hover:bg-red-50 flex items-center justify-between text-sm font-bold text-red-600 mt-2">
                    <span class="flex items-center gap-2"><i class="fa-solid fa-right-from-bracket text-red-500"></i> تسجيل الخروج</span>
                    <i class="fa-solid fa-angle-left text-slate-400"></i>
                  </button>
                </div>
              </div>
            </div>

            <!-- Right Column: Recent Orders Preview -->
            <div class="lg:col-span-2">
              <div class="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
                <div class="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
                  <h3 class="font-extrabold text-base text-slate-800 flex items-center gap-2">
                    <i class="fa-solid fa-receipt text-emerald-600"></i>
                    <span>أحدث الطلبات</span>
                  </h3>
                  <a href="#/orders" class="text-xs font-bold text-emerald-600 hover:underline">عرض كل الطلبات (${orders.length})</a>
                </div>

                ${orders.length === 0 ? `
                  <div class="text-center py-12 text-slate-400 text-sm">
                    لا توجد أي طلبات مسجلة باسمك بعد.
                  </div>
                ` : `
                  <div class="flex flex-col gap-4">
                    ${orders.slice(0, 5).map(o => `
                      <div class="border border-slate-100 p-4 rounded-xl hover:border-emerald-300 transition-colors">
                        <div class="flex items-center justify-between mb-3 flex-wrap gap-2">
                          <div>
                            <span class="font-bold text-slate-800 text-sm">طلب #${o.orderNumber}</span>
                            <span class="text-xs text-slate-400 mr-2">${new Date(o.createdAt).toLocaleDateString('ar-EG')}</span>
                          </div>
                          <span class="status-pill status-${o.status}">${this.formatStatus(o.status)}</span>
                        </div>

                        <div class="text-xs text-slate-500 mb-3">
                          ${o.items.length} منتجات • المحافظة: <strong>${o.shippingAddress?.governorate || o.shippingAddress?.city || 'القاهرة'}</strong> • الإجمالي: <strong class="text-emerald-700">${o.grandTotal} ج.م</strong>
                        </div>

                        <a href="#/order/${o.id}" class="text-xs font-bold text-emerald-600 hover:text-emerald-700 flex items-center gap-1">
                          <span>تفاصيل الطلب وتتبع الشحنة</span>
                          <i class="fa-solid fa-angle-left"></i>
                        </a>
                      </div>
                    `).join('')}
                  </div>
                `}
              </div>
            </div>
          </div>
        </div>
      `;
    } catch (err) {
      console.error('Profile render error:', err);
    }
  },

  formatStatus(status) {
    const map = {
      pending: 'قيد المراجعة',
      processing: 'قيد التجهيز',
      shipped: 'قيد الشحن',
      delivered: 'تم التسليم',
      cancelled: 'ملغي'
    };
    return map[status] || status;
  },

  switchAccount() {
    State.logout();
    AuthModal.open('login');
  },

  openAvatarModal() {
    const user = State.user;
    if (!user) return;

    const modalBody = `
      <div class="text-right space-y-4" dir="rtl">
        <div class="flex items-center gap-4 bg-slate-50 p-3 rounded-2xl border border-slate-200">
          <img id="avatar-modal-preview" src="${user.avatar || 'https://api.dicebear.com/7.x/initials/svg?seed=' + encodeURIComponent(user.name)}" class="w-16 h-16 rounded-full object-cover border-2 border-emerald-500 shadow-sm" />
          <div>
            <div class="font-extrabold text-xs text-slate-800">${user.name}</div>
            <div class="text-[11px] text-slate-400 mt-0.5">اختر صورة من جهازك أو ضع رابط صورة مباشر</div>
          </div>
        </div>

        <!-- Option 1: Upload from device -->
        <div class="p-3 bg-white rounded-xl border border-dashed border-emerald-300">
          <label class="form-label font-bold text-xs text-emerald-800 mb-1 flex items-center gap-1.5">
            <i class="fa-solid fa-cloud-arrow-up"></i>
            <span>خيار 1: رفع صورة من الجهاز (PNG, JPG, WebP)</span>
          </label>
          <input type="file" id="avatar-file-input" accept="image/*" class="text-xs w-full mt-1" onchange="ProfilePage.uploadAvatarFile(event)" />
        </div>

        <!-- Option 2: Image URL -->
        <div class="p-3 bg-white rounded-xl border border-slate-200">
          <label class="form-label font-bold text-xs text-slate-700 mb-1 flex items-center gap-1.5">
            <i class="fa-solid fa-link"></i>
            <span>خيار 2: استخدام رابط صورة مباشر (URL)</span>
          </label>
          <div class="flex gap-2 mt-1">
            <input type="text" dir="ltr" inputmode="url" id="avatar-url-input" class="form-control text-xs font-mono" placeholder="https://..." value="${user.avatar || ''}" />
            <button type="button" onclick="ProfilePage.saveAvatarFromUrl()" class="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-4 py-2 rounded-xl shrink-0 transition">
              حفظ الرابط
            </button>
          </div>
        </div>
      </div>
    `;

    App.openModal('تعديل الصورة الشخصية', modalBody);
  },

  async uploadAvatarFile(e) {
    const file = e.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('avatar', file);
    formData.append('file', file);
    formData.append('image', file);

    try {
      App.showToast('جاري رفع صورتك الشخصية...', 'info');
      const res = await API.post('/upload/avatar', formData);
      if (res.success && res.url) {
        if (State.user) {
          State.user.avatar = res.url;
          localStorage.setItem('suki_user', JSON.stringify(State.user));
        }
        document.querySelectorAll('.user-avatar-img, .admin-avatar').forEach(img => {
          img.src = res.url;
        });
        App.showToast('تم تحديث صورتك الشخصية بنجاح! 📸', 'success');
        App.closeModal();
        this.render();
      } else {
        App.showToast(res.message || 'فشل رفع الصورة', 'error');
      }
    } catch (err) {
      App.showToast(err.message || 'فشل رفع الصورة الشخصية', 'error');
    }
  },

  async saveAvatarFromUrl() {
    const input = document.getElementById('avatar-url-input');
    const url = input?.value?.trim();
    if (!url) {
      App.showToast('يُرجى إدخال رابط صورة صحيح', 'warning');
      return;
    }

    try {
      const res = await API.put('/auth/profile', { avatar: url });
      if (res.success) {
        if (State.user) State.user.avatar = url;
        App.showToast('تم حفظ الصورة الشخصية بنجاح!', 'success');
        App.closeModal();
        this.render();
      } else {
        App.showToast(res.message || 'فشل الحفظ', 'error');
      }
    } catch (err) {
      App.showToast(err.message || 'فشل حفظ الصورة', 'error');
    }
  },

  // Edit Personal Info Modal
  openEditModal() {
    const user = State.user;
    const isOwnerOrPartner = user.role === 'super_admin' || 
      user.isOwner === true || 
      user.isPartner === true || 
      ['admin@suki.store', 'ahmed@suki.store'].includes(user.email);

    App.openModal('تعديل البيانات الشخصية', `
      <form onsubmit="ProfilePage.submitEdit(event)">
        <div class="form-group mb-3">
          <label class="form-label font-bold">الاسم الكامل *</label>
          <input type="text" id="edit-name" class="form-control" value="${user.name}" required />
        </div>
        <div class="form-group mb-3">
          <label class="form-label font-bold text-xs text-slate-700 dark:text-slate-200">رقم الهاتف الأساسي</label>
          <input type="tel" id="edit-phone" class="form-control font-mono font-bold" value="${user.phone || ''}" placeholder="01012345678 (أو اتركه فارغاً للحذف)" />
          <span class="text-[10px] text-slate-400 mt-1 block">تعديل مباشر بدون أي رمز تحقق (OTP)</span>
        </div>
        <div class="grid grid-cols-2 gap-3 mb-4">
          <div class="form-group">
            <label class="form-label font-bold">رقم هاتف إضافي (اختياري)</label>
            <input type="tel" id="edit-secondary-phone" class="form-control" placeholder="010..." value="${user.secondaryPhone || ''}" />
          </div>
          <div class="form-group">
            <label class="form-label font-bold">رقم واتساب (اختياري)</label>
            <input type="tel" id="edit-whatsapp" class="form-control" placeholder="010..." value="${user.whatsappPhone || ''}" />
          </div>
        </div>
        <button type="submit" class="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 rounded-xl text-sm transition cursor-pointer">
          حفظ التغييرات
        </button>
      </form>
    `);
  },

  openChangePhoneModal() {
    const user = State.user;
    App.openModal('تعديل رقم الموبايل', `
      <div id="change-phone-container" class="text-right" dir="rtl">
        <div class="text-center mb-4">
          <div class="w-12 h-12 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-2 text-xl">
            <i class="fa-solid fa-mobile-screen-button"></i>
          </div>
          <h4 class="font-bold text-sm text-slate-800 dark:text-white">تحديث رقم الموبايل</h4>
          <p class="text-xs text-slate-500 dark:text-slate-400">تحديث مباشر وفوري بدون أي رمز تحقق</p>
        </div>

        <form onsubmit="ProfilePage.submitDirectPhoneChange(event)">
          <div class="form-group mb-4">
            <label class="form-label font-bold text-xs text-slate-700 dark:text-slate-200">رقم الموبايل الجديد *</label>
            <input type="tel" id="direct-new-phone-input" class="form-control font-mono font-bold" value="${user?.phone || ''}" placeholder="01012345678" required />
          </div>
          <button type="submit" id="direct-phone-save-btn" class="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 rounded-xl text-sm transition cursor-pointer">
            <i class="fa-solid fa-check ml-1"></i> حفظ وتحديث رقم الموبايل فوراً
          </button>
        </form>
      </div>
    `);
  },

  async submitDirectPhoneChange(e) {
    e.preventDefault();
    const newPhone = document.getElementById('direct-new-phone-input')?.value.trim();
    const btn = document.getElementById('direct-phone-save-btn');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> جاري الحفظ...';
    }

    try {
      const res = await API.post('/auth/change-phone', { newPhone });
      if (res.success && res.user) {
        State.user = { ...State.user, ...res.user };
        App.closeModal();
        App.showToast(res.message || 'تم تحديث رقم الموبايل بنجاح ✅', 'success');
        this.render();
      } else {
        App.showToast(res.message || 'فشل التحديث', 'error');
      }
    } catch (err) {
      App.showToast(err.message || 'حدث خطأ في تحديث رقم الهاتف', 'error');
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-check ml-1"></i> حفظ وتحديث رقم الموبايل فوراً';
      }
    }
  },

  async submitEdit(e) {
    e.preventDefault();
    const name = document.getElementById('edit-name').value.trim();
    const secondaryPhone = document.getElementById('edit-secondary-phone').value.trim();
    const whatsappPhone = document.getElementById('edit-whatsapp').value.trim();
    const phoneInput = document.getElementById('edit-phone');

    try {
      const payload = {
        name,
        secondaryPhone,
        whatsappPhone
      };
      if (phoneInput) {
        payload.phone = phoneInput.value.trim();
      }

      const res = await API.put('/auth/profile', payload);

      if (res.success && res.user) {
        State.user = { ...State.user, ...res.user };
        App.closeModal();
        App.showToast(res.message, 'success');
        this.render();
      }
    } catch (err) {
      App.showToast(err.message, 'error');
    }
  },

  // Pending map coordinates for address modals
  pendingMapCoords: null,

  openMapPickerForProfile(mode = 'new') {
    MapPicker.open({
      initialLat: this.pendingMapCoords?.lat,
      initialLng: this.pendingMapCoords?.lng,
      onConfirm: (addr) => {
        this.pendingMapCoords = { lat: addr.lat, lng: addr.lng, formattedAddress: addr.formattedAddress };
        const prefix = mode === 'new' ? 'new-addr' : 'edit-addr';

        const govEl = document.getElementById(`${prefix}-gov`);
        const cityEl = document.getElementById(`${prefix}-city`);
        const streetEl = document.getElementById(`${prefix}-street`);

        if (govEl && addr.governorate) govEl.value = addr.governorate;
        if (cityEl && addr.city) cityEl.value = addr.city;
        if (streetEl && addr.street) streetEl.value = addr.street;

        const badge = document.getElementById(`${prefix}-map-badge`);
        if (badge) {
          badge.classList.remove('hidden');
          badge.innerHTML = `
            <i class="fa-solid fa-map-location-dot text-emerald-600 text-sm mt-0.5 flex-shrink-0"></i>
            <div class="min-w-0 flex-1">
              <div class="font-bold text-emerald-950">تم تثبيت الموقع بالدبوس على الخريطة 📍</div>
              <div class="text-[10px] text-emerald-800">${addr.formattedAddress} (${addr.lat.toFixed(4)}, ${addr.lng.toFixed(4)})</div>
            </div>
          `;
        }
      }
    });
  },

  // Add Address Modal
  openAddAddressModal() {
    this.pendingMapCoords = null;
    App.openModal('إضافة عنوان جديد', `
      <form onsubmit="ProfilePage.submitAddAddress(event)">
        <!-- Map Picker Shortcut Button -->
        <div class="mb-4 bg-emerald-50/70 border border-emerald-200 rounded-xl p-3 flex flex-col gap-2">
          <div class="flex items-center justify-between flex-wrap gap-2">
            <div class="flex items-center gap-2 text-xs font-black text-slate-800">
              <i class="fa-solid fa-map-location-dot text-emerald-600 text-base"></i>
              <span>تحديد موقعك بدقة على الخريطة التفاعلية</span>
            </div>
            <button 
              type="button" 
              onclick="ProfilePage.openMapPickerForProfile('new')" 
              class="bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs px-3.5 py-1.5 rounded-lg shadow-sm flex items-center gap-1.5 transition cursor-pointer"
            >
              <i class="fa-solid fa-map-pin"></i>
              <span>فتح الخريطة 🗺️</span>
            </button>
          </div>
          <div id="new-addr-map-badge" class="hidden p-2 rounded-lg bg-emerald-100/90 text-xs font-bold text-emerald-900 flex items-start gap-2"></div>
        </div>

        <div class="form-group mb-3">
          <label class="form-label">تسمية العنوان *</label>
          <input type="text" id="new-addr-label" class="form-control" placeholder="مثال: المنزل، العمل، شقة المصيف..." required />
        </div>

        <div class="grid grid-cols-2 gap-3 mb-3">
          <div class="form-group">
            <label class="form-label">اسم المستلم *</label>
            <input type="text" id="new-addr-name" class="form-control" value="${State.user.name}" required />
          </div>
          <div class="form-group">
            <label class="form-label">رقم الهاتف *</label>
            <input type="tel" id="new-addr-phone" class="form-control" value="${State.user.phone}" required />
          </div>
        </div>

        <div class="grid grid-cols-2 gap-3 mb-3">
          <div class="form-group">
            <label class="form-label">المحافظة *</label>
            <select id="new-addr-gov" class="form-control" required>
              ${EGYPT_GOVS_LIST.map(g => `<option value="${g}">${g}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">المدينة / المركز *</label>
            <input type="text" id="new-addr-city" class="form-control" placeholder="مثال: مدينة نصر / المنصورة" required />
          </div>
        </div>

        <div class="grid grid-cols-2 gap-3 mb-3">
          <div class="form-group">
            <label class="form-label">اسم الشارع</label>
            <input type="text" id="new-addr-street" class="form-control" placeholder="الشارع الرئيسي..." />
          </div>
          <div class="form-group">
            <label class="form-label">المبنى والشقة</label>
            <input type="text" id="new-addr-building" class="form-control" placeholder="عمارة رقم..." />
          </div>
        </div>

        <div class="form-group mb-4">
          <label class="form-label">ملاحظات التوصيل</label>
          <input type="text" id="new-addr-notes" class="form-control" placeholder="علامة مميزة..." />
        </div>

        <div class="mb-4">
          <label class="flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer">
            <input type="checkbox" id="new-addr-default" class="accent-emerald-600 w-4 h-4" />
            <span>تعيين كعنوان افتراضي للتوصيل</span>
          </label>
        </div>

        <button type="submit" class="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 rounded-xl text-sm transition">
          إضافة العنوان
        </button>
      </form>
    `);
  },

  async submitAddAddress(e) {
    e.preventDefault();
    const label = document.getElementById('new-addr-label').value.trim();
    const recipientName = document.getElementById('new-addr-name').value.trim();
    const phone = document.getElementById('new-addr-phone').value.trim();
    const governorate = document.getElementById('new-addr-gov').value;
    const city = document.getElementById('new-addr-city').value.trim();
    const street = document.getElementById('new-addr-street').value.trim();
    const building = document.getElementById('new-addr-building').value.trim();
    const notes = document.getElementById('new-addr-notes').value.trim();
    const isDefault = document.getElementById('new-addr-default').checked;

    try {
      const res = await API.post('/auth/addresses', {
        label,
        recipientName,
        phone,
        governorate,
        city,
        street,
        building,
        notes,
        isDefault,
        latitude: this.pendingMapCoords?.lat || null,
        longitude: this.pendingMapCoords?.lng || null,
        formattedAddress: this.pendingMapCoords?.formattedAddress || null
      });

      if (res.success) {
        App.closeModal();
        App.showToast(res.message, 'success');
        this.render();
      }
    } catch (err) {
      App.showToast(err.message, 'error');
    }
  },

  // Edit Address Modal
  openEditAddressModal(addrId) {
    const addresses = State.user.addresses || [];
    const target = addresses.find(a => a.id === addrId);
    if (!target) return;

    this.pendingMapCoords = (target.latitude && target.longitude) 
      ? { lat: Number(target.latitude), lng: Number(target.longitude), formattedAddress: target.formattedAddress || '' } 
      : null;

    App.openModal('تعديل العنوان', `
      <form onsubmit="ProfilePage.submitEditAddress(event, '${addrId}')">
        <!-- Map Picker Shortcut Button -->
        <div class="mb-4 bg-emerald-50/70 border border-emerald-200 rounded-xl p-3 flex flex-col gap-2">
          <div class="flex items-center justify-between flex-wrap gap-2">
            <div class="flex items-center gap-2 text-xs font-black text-slate-800">
              <i class="fa-solid fa-map-location-dot text-emerald-600 text-base"></i>
              <span>تعديل موقع الدبوس على الخريطة التفاعلية</span>
            </div>
            <button 
              type="button" 
              onclick="ProfilePage.openMapPickerForProfile('edit')" 
              class="bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs px-3.5 py-1.5 rounded-lg shadow-sm flex items-center gap-1.5 transition cursor-pointer"
            >
              <i class="fa-solid fa-map-pin"></i>
              <span>فتح الخريطة 🗺️</span>
            </button>
          </div>
          <div id="edit-addr-map-badge" class="${this.pendingMapCoords ? '' : 'hidden'} p-2 rounded-lg bg-emerald-100/90 text-xs font-bold text-emerald-900 flex items-start gap-2">
            ${this.pendingMapCoords ? `
              <i class="fa-solid fa-map-location-dot text-emerald-600 text-sm mt-0.5 flex-shrink-0"></i>
              <div class="min-w-0 flex-1">
                <div class="font-bold text-emerald-950">الموقع مثبت بالخريطة 📍</div>
                <div class="text-[10px] text-emerald-800">${this.pendingMapCoords.formattedAddress || ''} (${this.pendingMapCoords.lat.toFixed(4)}, ${this.pendingMapCoords.lng.toFixed(4)})</div>
              </div>
            ` : ''}
          </div>
        </div>

        <div class="form-group mb-3">
          <label class="form-label">تسمية العنوان *</label>
          <input type="text" id="edit-addr-label" class="form-control" value="${target.label || ''}" required />
        </div>

        <div class="grid grid-cols-2 gap-3 mb-3">
          <div class="form-group">
            <label class="form-label">اسم المستلم *</label>
            <input type="text" id="edit-addr-name" class="form-control" value="${target.recipientName}" required />
          </div>
          <div class="form-group">
            <label class="form-label">رقم الهاتف *</label>
            <input type="tel" id="edit-addr-phone" class="form-control" value="${target.phone}" required />
          </div>
        </div>

        <div class="grid grid-cols-2 gap-3 mb-3">
          <div class="form-group">
            <label class="form-label">المحافظة *</label>
            <select id="edit-addr-gov" class="form-control" required>
              ${EGYPT_GOVS_LIST.map(g => `<option value="${g}" ${target.governorate === g ? 'selected' : ''}>${g}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">المدينة / المركز *</label>
            <input type="text" id="edit-addr-city" class="form-control" value="${target.city}" required />
          </div>
        </div>

        <div class="grid grid-cols-2 gap-3 mb-3">
          <div class="form-group">
            <label class="form-label">اسم الشارع</label>
            <input type="text" id="edit-addr-street" class="form-control" value="${target.street || ''}" />
          </div>
          <div class="form-group">
            <label class="form-label">المبنى والشقة</label>
            <input type="text" id="edit-addr-building" class="form-control" value="${target.building || ''}" />
          </div>
        </div>

        <div class="form-group mb-4">
          <label class="form-label">ملاحظات التوصيل</label>
          <input type="text" id="edit-addr-notes" class="form-control" value="${target.notes || ''}" />
        </div>

        <div class="mb-4">
          <label class="flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer">
            <input type="checkbox" id="edit-addr-default" ${target.isDefault ? 'checked' : ''} class="accent-emerald-600 w-4 h-4" />
            <span>تعيين كعنوان افتراضي للتوصيل</span>
          </label>
        </div>

        <button type="submit" class="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 rounded-xl text-sm transition">
          حفظ التعديلات
        </button>
      </form>
    `);
  },

  async submitEditAddress(e, addrId) {
    e.preventDefault();
    const label = document.getElementById('edit-addr-label').value.trim();
    const recipientName = document.getElementById('edit-addr-name').value.trim();
    const phone = document.getElementById('edit-addr-phone').value.trim();
    const governorate = document.getElementById('edit-addr-gov').value;
    const city = document.getElementById('edit-addr-city').value.trim();
    const street = document.getElementById('edit-addr-street').value.trim();
    const building = document.getElementById('edit-addr-building').value.trim();
    const notes = document.getElementById('edit-addr-notes').value.trim();
    const isDefault = document.getElementById('edit-addr-default').checked;

    try {
      const res = await API.put(`/auth/addresses/${addrId}`, {
        label,
        recipientName,
        phone,
        governorate,
        city,
        street,
        building,
        notes,
        isDefault,
        latitude: this.pendingMapCoords?.lat || null,
        longitude: this.pendingMapCoords?.lng || null,
        formattedAddress: this.pendingMapCoords?.formattedAddress || null
      });

      if (res.success) {
        App.closeModal();
        App.showToast(res.message, 'success');
        this.render();
      }
    } catch (err) {
      App.showToast(err.message, 'error');
    }
  },

  async setDefaultAddress(addrId) {
    try {
      const res = await API.put(`/auth/addresses/${addrId}/default`);
      if (res.success) {
        App.showToast(res.message, 'success');
        this.render();
      }
    } catch (err) {
      App.showToast(err.message, 'error');
    }
  },

  async deleteAddress(addrId) {
    if (!confirm('هل أنت متأكد من حذف هذا العنوان؟')) return;
    try {
      const res = await API.delete(`/auth/addresses/${addrId}`);
      if (res.success) {
        App.showToast(res.message, 'success');
        this.render();
      }
    } catch (err) {
      App.showToast(err.message, 'error');
    }
  },

  openPasswordModal() {
    const user = State.user;
    // Current password is always required (the server enforces it too)
    const isOwnerOrPartner = false;

    App.openModal('تغيير كلمة المرور', `
      <form onsubmit="ProfilePage.submitPassword(event)">
        ${isOwnerOrPartner ? `
          <div class="bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 p-3 rounded-xl text-xs font-bold mb-3 flex items-center gap-2">
            <i class="fa-solid fa-crown text-emerald-600 text-base"></i>
            <span>حساب مالك / شريك إداري: يمكنك تعيين كلمة المرور الجديدة مباشرة بدون الحاجة لكلمة المرور القديمة.</span>
          </div>
        ` : `
          <div class="form-group mb-3">
            <label class="form-label">كلمة المرور الحالية *</label>
            <input type="password" id="pwd-current" class="form-control" required />
          </div>
        `}
        <div class="form-group mb-3">
          <label class="form-label">كلمة المرور الجديدة (6 خانات على الأقل) *</label>
          <input type="password" id="pwd-new" class="form-control" minlength="6" required />
        </div>
        <button type="submit" class="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 rounded-xl text-sm transition">
          تحديث كلمة المرور
        </button>
      </form>
    `);
  },

  async submitPassword(e) {
    e.preventDefault();
    const currentInput = document.getElementById('pwd-current');
    const currentPassword = currentInput ? currentInput.value : '';
    const newPassword = document.getElementById('pwd-new').value;

    try {
      const payload = { newPassword };
      if (currentPassword) {
        payload.currentPassword = currentPassword;
      }
      const res = await API.put('/auth/password', payload);

      if (res.success) {
        App.closeModal();
        App.showToast(res.message, 'success');
        if (res.token) API.setToken(res.token);
      }
    } catch (err) {
      App.showToast(err.message, 'error');
    }
  },

  async logoutAllDevices() {
    if (!confirm('هل تريد بالتأكيد تسجيل الخروج من كافة الأجهزة والمتصفحات؟\nسيؤدي هذا إلى إلغاء صلاحية جميع الجلسات القديمة.')) return;
    try {
      const res = await API.post('/auth/logout-all');
      if (res.success) {
        App.showToast(res.message, 'success');
        State.logout();
      }
    } catch (err) {
      App.showToast(err.message || 'فشل تسجيل الخروج من كافة الأجهزة', 'error');
    }
  }
};
