/**
 * Suki Store Admin Push Notifications Management
 * Send instant web push notifications for new products, discounts, and price drops
 */

const PushAdmin = {
  stats: null,
  history: [],

  async render() {
    AdminLayout.render('push', `
      <div class="py-12 text-center text-slate-400">
        <i class="fa-solid fa-spinner fa-spin text-3xl mb-3 text-emerald-600"></i>
        <div>جاري تحميل بيانات نظام إشعارات الويب...</div>
      </div>
    `);

    try {
      const [statsRes, historyRes] = await Promise.all([
        API.get('/push/stats'),
        API.get('/push/history')
      ]);

      this.stats = statsRes.stats || { totalSubscribers: 0, totalSent: 0 };
      this.history = historyRes.history || [];

      const html = `
        <div>
          <!-- Header -->
          <div class="flex items-center justify-between mb-6 flex-wrap gap-4">
            <div>
              <h1 class="text-2xl font-extrabold text-slate-900 flex items-center gap-2">
                <i class="fa-solid fa-tower-broadcast text-emerald-600"></i>
                <span>إشعارات الدفع (Web Push Notifications)</span>
              </h1>
              <p class="text-xs text-slate-500 mt-1">
                إرسال إشعارات فورية إلى متصفحات وأجهزة العملاء حتى وإن كان الموقع مغلقاً
              </p>
            </div>
          </div>

          <!-- Stats KPI -->
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
            <div class="admin-card p-5">
              <div class="flex items-center justify-between">
                <div>
                  <div class="text-xs font-bold text-slate-500 mb-1">المشتركون في الإشعارات</div>
                  <div class="text-2xl font-extrabold text-emerald-600">${this.stats.totalSubscribers} عميل</div>
                  <div class="text-[11px] text-slate-400 mt-1">وافقوا على استلام التنبيهات</div>
                </div>
                <div class="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center text-xl">
                  <i class="fa-solid fa-bell"></i>
                </div>
              </div>
            </div>

            <div class="admin-card p-5">
              <div class="flex items-center justify-between">
                <div>
                  <div class="text-xs font-bold text-slate-500 mb-1">إجمالي الإشعارات المرسلة</div>
                  <div class="text-2xl font-extrabold text-blue-600">${this.stats.totalSent} إشعار</div>
                  <div class="text-[11px] text-slate-400 mt-1">حملات تسويقية وتنبيهات</div>
                </div>
                <div class="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center text-xl">
                  <i class="fa-solid fa-paper-plane"></i>
                </div>
              </div>
            </div>

            <div class="admin-card p-5">
              <div class="flex items-center justify-between">
                <div>
                  <div class="text-xs font-bold text-slate-500 mb-1">حالة الخدمة</div>
                  <div class="text-lg font-extrabold text-emerald-600 flex items-center gap-1.5">
                    <span class="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
                    <span>نشطة وتعمل بنجاح</span>
                  </div>
                  <div class="text-[11px] text-slate-400 mt-1">Web Push Protocol Ready</div>
                </div>
                <div class="w-12 h-12 rounded-xl bg-teal-50 text-teal-600 flex items-center justify-center text-xl">
                  <i class="fa-solid fa-signal"></i>
                </div>
              </div>
            </div>
          </div>

          <!-- Broadcast Composer & History Grid -->
          <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <!-- Composer Form -->
            <div class="lg:col-span-1">
              <div class="admin-card p-6">
                <div class="pb-3 mb-4 border-b border-slate-100">
                  <h3 class="font-extrabold text-base text-slate-800 flex items-center gap-2">
                    <i class="fa-solid fa-bullhorn text-emerald-600"></i>
                    <span>إنشاء وبث إشعار جديد</span>
                  </h3>
                  <p class="text-xs text-slate-400 mt-1">يصل لجميع العملاء المشتركين فوراً</p>
                </div>

                <form onsubmit="PushAdmin.sendBroadcast(event)">
                  <!-- Notification Type -->
                  <div class="form-group mb-3">
                    <label class="form-label font-bold text-xs text-slate-700">نوع الإشعار *</label>
                    <select id="push-type-select" class="form-control text-xs" onchange="PushAdmin.handleTypeChange(this.value)">
                      <option value="discount">🔥 خصومات وعروض حصرية</option>
                      <option value="new_product">✨ وصول منتجات جديدة</option>
                      <option value="price_drop">🏷️ انخفاض أسعار وتخفيضات</option>
                      <option value="general">📢 إشعار عام من إدارة المتجر</option>
                    </select>
                  </div>

                  <!-- Target Audience -->
                  <div class="form-group mb-3">
                    <label class="form-label font-bold text-xs text-slate-700">الفئة المستهدفة *</label>
                    <select id="push-audience-select" class="form-control text-xs">
                      <option value="all">👥 الكل (مسجلين وزوار)</option>
                      <option value="registered">👤 العملاء المسجلون فقط</option>
                      <option value="guests">🌐 الزوار فقط</option>
                    </select>
                  </div>

                  <!-- Recurrence / Repeat Interval -->
                  <div class="form-group mb-3">
                    <label class="form-label font-bold text-xs text-slate-700">تكرار الإرسال *</label>
                    <select id="push-repeat-select" class="form-control text-xs">
                      <option value="0">⚡ إرسال فوري مرة واحدة فقط (بدون تكرار)</option>
                      <option value="2">🔄 تكرار كل ساعتين (كل 2 ساعة)</option>
                      <option value="4">🔄 تكرار كل 4 ساعات</option>
                      <option value="6">🔄 تكرار كل 6 ساعات</option>
                      <option value="12">🔄 تكرار كل 12 ساعة</option>
                      <option value="24">📅 تكرار يومياً (كل 24 ساعة)</option>
                      <option value="48">📅 تكرار كل 48 ساعة</option>
                    </select>
                    <span class="text-[10px] text-slate-400 mt-1 block">يمكنك أيضاً إعادة إرسال أي إشعار يدوياً بضغطة زر في أي وقت</span>
                  </div>

                  <!-- Title -->
                  <div class="form-group mb-3">
                    <label class="form-label font-bold text-xs text-slate-700">عنوان الإشعار *</label>
                    <input type="text" id="push-title-input" class="form-control text-xs" placeholder="مثال: خصم 30% على كافة الشاشات والأجهزة اليوم فقط!" required />
                  </div>

                  <!-- Message -->
                  <div class="form-group mb-3">
                    <label class="form-label font-bold text-xs text-slate-700">نص الرسالة والتفاصيل *</label>
                    <textarea id="push-message-input" rows="3" class="form-control text-xs" placeholder="أدخل تفاصيل العرض أو كود الخصم ورسالة الجذب..." required></textarea>
                  </div>

                  <!-- Target Link -->
                  <div class="form-group mb-4">
                    <label class="form-label font-bold text-xs text-slate-700">الرابط / الصفحة المستهدفة</label>
                    <input type="text" id="push-url-input" class="form-control text-xs font-mono" placeholder="#/products أو #/category/1" value="#/products" />
                    <div class="text-[10px] text-slate-400 mt-1">يتم فتح هذا الرابط عند نقر العميل على الإشعار</div>
                  </div>

                  <button type="submit" id="push-send-btn" class="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 rounded-xl text-xs flex items-center justify-center gap-2 transition shadow-md">
                    <i class="fa-solid fa-paper-plane"></i>
                    <span>إرسال الإشعار للمشتركين</span>
                  </button>
                </form>
              </div>
            </div>

            <!-- Sent History Table -->
            <div class="lg:col-span-2">
              <div class="admin-card p-6">
                <div class="flex items-center justify-between pb-3 mb-4 border-b border-slate-100">
                  <h3 class="font-extrabold text-base text-slate-800 flex items-center gap-2">
                    <i class="fa-solid fa-clock-rotate-left text-blue-600"></i>
                    <span>سجل الإشعارات المرسلة سابقاً (${this.history.length})</span>
                  </h3>
                </div>

                ${this.history.length === 0 ? `
                  <div class="text-center py-12 text-slate-400 text-xs">
                    لم تقم بإرسال أي إشعارات بعد. ابدأ الآن بإرسال أول إشعار ترويجي!
                  </div>
                ` : `
                  <div class="admin-table-container">
                    <table class="admin-table">
                      <thead>
                        <tr>
                          <th>النوع</th>
                          <th>الفئة المستهدفة</th>
                          <th>عنوان الإشعار</th>
                          <th>الرسالة</th>
                          <th>تكرار الإرسال</th>
                          <th>تاريخ الإرسال</th>
                          <th class="text-center">الإجراءات</th>
                        </tr>
                      </thead>
                      <tbody>
                        ${this.history.map(n => `
                          <tr>
                            <td>
                              <span class="text-[11px] font-bold px-2 py-0.5 rounded-full ${this.getTypeBadgeClass(n.type)}">
                                ${this.getTypeLabel(n.type)}
                              </span>
                            </td>
                            <td>
                              <span class="text-[11px] font-bold px-2 py-0.5 rounded-full ${this.getAudienceBadgeClass(n.targetAudience)}">
                                ${this.getAudienceLabel(n.targetAudience)}
                              </span>
                            </td>
                            <td class="font-bold text-xs text-slate-800 max-w-[160px] truncate" title="${n.title}">${n.title}</td>
                            <td class="text-xs text-slate-500 max-w-[200px] truncate" title="${n.message}">${n.message}</td>
                            <td>
                              <span class="text-[11px] font-semibold px-2 py-0.5 rounded-full ${Number(n.repeatHours) > 0 ? 'bg-purple-50 text-purple-700 border border-purple-200' : 'bg-slate-100 text-slate-600'}">
                                ${Number(n.repeatHours) > 0 ? `كل ${n.repeatHours} ساعة` : 'مرة واحدة'}
                              </span>
                              ${n.resendCount > 0 ? `<div class="text-[10px] text-blue-600 font-bold mt-1 flex items-center gap-1"><i class="fa-solid fa-repeat"></i> أعيد إرساله ${n.resendCount}x</div>` : ''}
                            </td>
                            <td class="text-xs text-slate-400 font-mono">${new Date(n.sentAt || n.createdAt).toLocaleString('ar-EG')}</td>
                            <td>
                              <div class="flex items-center justify-center gap-1.5">
                                <button onclick="PushAdmin.resendNotification('${n.id}')" title="إعادة إرسال الإشعار" class="p-1.5 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 transition text-xs">
                                  <i class="fa-solid fa-rotate-right"></i>
                                </button>
                                <button onclick="PushAdmin.openEditModal('${n.id}')" title="تعديل الإشعار" class="p-1.5 rounded-lg bg-amber-50 text-amber-600 hover:bg-amber-100 transition text-xs">
                                  <i class="fa-solid fa-pen-to-square"></i>
                                </button>
                                <button onclick="PushAdmin.deleteNotification('${n.id}')" title="حذف الإشعار" class="p-1.5 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 transition text-xs">
                                  <i class="fa-solid fa-trash"></i>
                                </button>
                              </div>
                            </td>
                          </tr>
                        `).join('')}
                      </tbody>
                    </table>
                  </div>
                `}
              </div>
            </div>
          </div>
        </div>
      `;

      AdminLayout.render('push', html);
    } catch (err) {
      console.error('Push admin render error:', err);
    }
  },

  handleTypeChange(type) {
    const titleInput = document.getElementById('push-title-input');
    const msgInput = document.getElementById('push-message-input');
    if (!titleInput || !msgInput) return;

    if (type === 'discount') {
      titleInput.value = '🔥 تخفيضات هائلة لفترة محدودة على سوقي ستور!';
      msgInput.value = 'وفر حتى 50% على تشكيلة واسعة من المنتجات المختارة. تسوق الآن قبل نفاذ الكمية!';
    } else if (type === 'new_product') {
      titleInput.value = '✨ وصول تشكيلة منتجات جديدة وحصرية!';
      msgInput.value = 'اكتشف أحدث المنتجات المضافة الآن بأسعار مميزة وضمان أصلي 100%.';
    } else if (type === 'price_drop') {
      titleInput.value = '🏷️ انخفاض أسعار منتجاتك المفضلة!';
      msgInput.value = 'تم تخفيض أسعار مجموعة من أشهر المنتجات الأكثر طلباً. تفقد العروض الآن!';
    } else {
      titleInput.value = '';
      msgInput.value = '';
    }
  },

  getTypeLabel(type) {
    const map = {
      discount: 'خصومات وعروض',
      new_product: 'منتجات جديدة',
      price_drop: 'انخفاض أسعار',
      general: 'إشعار عام'
    };
    return map[type] || 'إشعار';
  },

  getTypeBadgeClass(type) {
    const map = {
      discount: 'bg-red-50 text-red-700',
      new_product: 'bg-blue-50 text-blue-700',
      price_drop: 'bg-amber-50 text-amber-700',
      general: 'bg-slate-100 text-slate-700'
    };
    return map[type] || 'bg-slate-100 text-slate-700';
  },

  getAudienceLabel(aud) {
    const map = {
      all: 'الكل',
      registered: 'المسجلون',
      guests: 'الزوار'
    };
    return map[aud] || 'الكل';
  },

  getAudienceBadgeClass(aud) {
    const map = {
      all: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
      registered: 'bg-blue-50 text-blue-700 border border-blue-200',
      guests: 'bg-amber-50 text-amber-700 border border-amber-200'
    };
    return map[aud] || 'bg-emerald-50 text-emerald-700 border border-emerald-200';
  },

  async sendBroadcast(e) {
    e.preventDefault();
    const type = document.getElementById('push-type-select').value;
    const targetAudience = document.getElementById('push-audience-select').value;
    const repeatHours = Number(document.getElementById('push-repeat-select')?.value) || 0;
    const title = document.getElementById('push-title-input').value.trim();
    const message = document.getElementById('push-message-input').value.trim();
    const targetUrl = document.getElementById('push-url-input').value.trim();

    const btn = document.getElementById('push-send-btn');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> جاري بث الإشعار...';
    }

    try {
      const res = await API.post('/push/send', {
        title,
        message,
        type,
        targetAudience,
        targetUrl,
        repeatHours
      });

      if (res.success) {
        App.showToast(`تم إرسال الإشعار بنجاح! 🚀`, 'success');
        this.render();
      }
    } catch (err) {
      App.showToast(err.message, 'error');
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> إرسال الإشعار للمشتركين';
      }
    }
  },

  async resendNotification(id) {
    if (!confirm('هل تريد إعادة إرسال هذا الإشعار الآن؟')) return;
    try {
      const res = await API.post(`/push/resend/${id}`);
      if (res.success) {
        App.showToast(res.message || 'تمت إعادة إرسال الإشعار بنجاح', 'success');
        this.render();
      }
    } catch (err) {
      App.showToast(err.message || 'فشل إعادة إرسال الإشعار', 'error');
    }
  },

  openEditModal(id) {
    const notif = this.history.find(n => n.id === id);
    if (!notif) return;

    const modalHtml = `
      <form onsubmit="PushAdmin.submitEditNotification(event, '${notif.id}')" class="space-y-3.5 text-right">
        <div class="form-group">
          <label class="form-label font-bold text-xs text-slate-700">نوع الإشعار *</label>
          <select id="edit-push-type" class="form-control text-xs">
            <option value="discount" ${notif.type === 'discount' ? 'selected' : ''}>🔥 خصومات وعروض حصرية</option>
            <option value="new_product" ${notif.type === 'new_product' ? 'selected' : ''}>✨ وصول منتجات جديدة</option>
            <option value="price_drop" ${notif.type === 'price_drop' ? 'selected' : ''}>🏷️ انخفاض أسعار وتخفيضات</option>
            <option value="general" ${notif.type === 'general' ? 'selected' : ''}>📢 إشعار عام من إدارة المتجر</option>
          </select>
        </div>

        <div class="form-group">
          <label class="form-label font-bold text-xs text-slate-700">الفئة المستهدفة *</label>
          <select id="edit-push-audience" class="form-control text-xs">
            <option value="all" ${(notif.targetAudience || 'all') === 'all' ? 'selected' : ''}>👥 الكل (مسجلين وزوار)</option>
            <option value="registered" ${notif.targetAudience === 'registered' ? 'selected' : ''}>👤 العملاء المسجلون فقط</option>
            <option value="guests" ${notif.targetAudience === 'guests' ? 'selected' : ''}>🌐 الزوار فقط</option>
          </select>
        </div>

        <div class="form-group">
          <label class="form-label font-bold text-xs text-slate-700">تكرار الإرسال *</label>
          <select id="edit-push-repeat" class="form-control text-xs">
            <option value="0" ${Number(notif.repeatHours || 0) === 0 ? 'selected' : ''}>⚡ إرسال فوري مرة واحدة فقط (بدون تكرار)</option>
            <option value="2" ${Number(notif.repeatHours) === 2 ? 'selected' : ''}>🔄 تكرار كل ساعتين (كل 2 ساعة)</option>
            <option value="4" ${Number(notif.repeatHours) === 4 ? 'selected' : ''}>🔄 تكرار كل 4 ساعات</option>
            <option value="6" ${Number(notif.repeatHours) === 6 ? 'selected' : ''}>🔄 تكرار كل 6 ساعات</option>
            <option value="12" ${Number(notif.repeatHours) === 12 ? 'selected' : ''}>🔄 تكرار كل 12 ساعة</option>
            <option value="24" ${Number(notif.repeatHours) === 24 ? 'selected' : ''}>📅 تكرار يومياً (كل 24 ساعة)</option>
            <option value="48" ${Number(notif.repeatHours) === 48 ? 'selected' : ''}>📅 تكرار كل 48 ساعة</option>
          </select>
        </div>

        <div class="form-group">
          <label class="form-label font-bold text-xs text-slate-700">عنوان الإشعار *</label>
          <input type="text" id="edit-push-title" class="form-control text-xs" value="${notif.title || ''}" required />
        </div>

        <div class="form-group">
          <label class="form-label font-bold text-xs text-slate-700">نص الرسالة *</label>
          <textarea id="edit-push-message" rows="3" class="form-control text-xs" required>${notif.message || notif.body || ''}</textarea>
        </div>

        <div class="form-group">
          <label class="form-label font-bold text-xs text-slate-700">الرابط المستهدف</label>
          <input type="text" id="edit-push-url" class="form-control text-xs font-mono" value="${notif.targetUrl || notif.url || '#/products'}" />
        </div>

        <div class="flex gap-2 pt-2">
          <button type="submit" class="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2 rounded-xl text-xs transition">
            حفظ التعديلات
          </button>
          <button type="button" onclick="App.closeModal()" class="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-4 py-2 rounded-xl text-xs transition">
            إلغاء
          </button>
        </div>
      </form>
    `;

    App.openModal('تعديل الإشعار الترويجي', modalHtml);
  },

  async submitEditNotification(e, id) {
    e.preventDefault();
    const type = document.getElementById('edit-push-type')?.value;
    const targetAudience = document.getElementById('edit-push-audience')?.value;
    const repeatHours = Number(document.getElementById('edit-push-repeat')?.value) || 0;
    const title = document.getElementById('edit-push-title')?.value.trim();
    const message = document.getElementById('edit-push-message')?.value.trim();
    const targetUrl = document.getElementById('edit-push-url')?.value.trim();

    try {
      const res = await API.put(`/push/${id}`, {
        type,
        targetAudience,
        repeatHours,
        title,
        message,
        targetUrl
      });

      if (res.success) {
        App.closeModal();
        App.showToast('تم حفظ التعديلات بنجاح', 'success');
        this.render();
      }
    } catch (err) {
      App.showToast(err.message || 'فشل تعديل الإشعار', 'error');
    }
  },

  async resendNotification(id) {
    const notif = this.history.find(n => n.id === id);
    const title = notif ? notif.title : 'هذا الإشعار';
    if (!confirm(`هل ترغب في إعادة إرسال الإشعار "${title}" إلى المشتركين الآن؟`)) return;

    try {
      App.showToast('جاري إعادة إرسال الإشعار...', 'info');
      const res = await API.post(`/push/resend/${id}`);
      if (res.success) {
        App.showToast(res.message || 'تمت إعادة إرسال الإشعار بنجاح! 🚀', 'success');
        this.render();
      } else {
        App.showToast(res.message || 'فشل إعادة الإرسال', 'error');
      }
    } catch (err) {
      App.showToast(err.message || 'فشل إعادة الإرسال', 'error');
    }
  },

  async deleteNotification(id) {
    if (!confirm('هل أنت متأكد من حذف هذا الإشعار نهائياً من السجل؟')) return;

    try {
      const res = await API.delete(`/push/${id}`);
      if (res.success) {
        App.showToast('تم حذف الإشعار بنجاح', 'success');
        this.render();
      }
    } catch (err) {
      App.showToast(err.message || 'فشل حذف الإشعار', 'error');
    }
  }
};
