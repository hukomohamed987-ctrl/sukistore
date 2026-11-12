/**
 * Suki Store Admin - Store Settings (إعدادات المتجر)
 * Payments (card on/off, gateway status), investor profit share default, stock alerts.
 */

const SettingsAdmin = {
  settings: null,
  gateway: null,

  escape(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  },

  async render() {
    if (!AdminLayout.hasPermission('canManageSettings')) {
      App.showToast('ليس لديك صلاحية لإدارة إعدادات المتجر', 'error');
      window.location.hash = '#/admin';
      return;
    }

    AdminLayout.render('settings', `
      <div class="py-12 text-center text-slate-400">
        <i class="fa-solid fa-spinner fa-spin text-3xl mb-3 text-emerald-600"></i>
        <div>جاري تحميل إعدادات المتجر...</div>
      </div>
    `);

    try {
      const [res, ci] = await Promise.all([API.get('/admin/settings'), API.get('/pages/meta/contact').catch(() => ({}))]);
      this.settings = res.settings || {};
      const contact = ci.contact || {};
      this.gateway = res.paymentGateway || { connected: false, provider: '' };
      const s = this.settings;
      const cardOn = s.cardPaymentEnabled === true;
      const gwConnected = Boolean(this.gateway.connected);
      const share = s.defaultInvestorProfitSharePercent !== undefined ? s.defaultInvestorProfitSharePercent : 50;

      const html = `
        <div class="max-w-4xl mx-auto" dir="rtl">
          <div class="flex items-center justify-between mb-6 flex-wrap gap-4">
            <div>
              <h1 class="text-2xl font-extrabold text-slate-900 flex items-center gap-2">
                <i class="fa-solid fa-gears text-emerald-600"></i>
                <span>إعدادات المتجر</span>
              </h1>
              <p class="text-xs text-slate-500 mt-1">طرق الدفع، تقسيم أرباح المستثمرين، وتنبيهات المخزون</p>
            </div>
          </div>

          <form onsubmit="SettingsAdmin.saveSettings(event)" class="space-y-6">
            <!-- Payments -->
            <div class="admin-card p-6">
              <h3 class="font-extrabold text-base text-slate-800 pb-3 mb-4 border-b border-slate-100 flex items-center gap-2">
                <i class="fa-solid fa-credit-card text-indigo-600"></i>
                <span>طرق الدفع</span>
              </h3>

              <div class="flex items-center justify-between gap-4 p-4 rounded-xl border border-slate-200 bg-slate-50 mb-3">
                <div>
                  <div class="font-bold text-sm text-slate-800">الدفع عند الاستلام (كاش)</div>
                  <div class="text-[11px] text-slate-500">متاح دائماً لكل العملاء</div>
                </div>
                <span class="text-[11px] font-black text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1 rounded-full">مفعّل</span>
              </div>

              <div class="p-4 rounded-xl border ${cardOn ? 'border-indigo-300 bg-indigo-50/40' : 'border-slate-200'}">
                <label class="flex items-center justify-between gap-4 cursor-pointer">
                  <div>
                    <div class="font-bold text-sm text-slate-800">الدفع بالبطاقة الإلكترونية</div>
                    <div class="text-[11px] text-slate-500">عند الإيقاف يختفي خيار البطاقة من صفحة إتمام الطلب ويرفضه الخادم</div>
                  </div>
                  <input type="checkbox" id="set-card-enabled" ${cardOn ? 'checked' : ''} class="accent-indigo-600 w-5 h-5" />
                </label>

                <div class="mt-3 text-[11px] font-bold rounded-lg p-3 ${gwConnected ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-amber-50 text-amber-800 border border-amber-200'}">
                  ${gwConnected
                    ? `<i class="fa-solid fa-circle-check"></i> بوابة الدفع مربوطة (${this.escape(this.gateway.provider)}): الطلبات بالبطاقة تُسجَّل مدفوعة بعد تأكيد البوابة فقط.`
                    : `<i class="fa-solid fa-triangle-exclamation"></i> لا توجد بوابة دفع مربوطة بعد. لو فعّلت البطاقة الآن، الطلب يتسجل <b>غير مدفوع</b> والعميل يُبلَّغ إن فريقكم هيتواصل معاه لإتمام الدفع. الربط ببوابة (Paymob / Fawry / Kashier ...) يتم لاحقاً من ملف <code>utils/paymentGateway.js</code> و <code>.env</code>.`}
                </div>
              </div>
            </div>

            <!-- Investors -->
            <div class="admin-card p-6">
              <h3 class="font-extrabold text-base text-slate-800 pb-3 mb-4 border-b border-slate-100 flex items-center gap-2">
                <i class="fa-solid fa-handshake text-blue-600"></i>
                <span>تقسيم أرباح المستثمرين</span>
              </h3>
              <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div class="form-group">
                  <label class="form-label font-bold text-xs text-slate-700">نصيب المستثمر الافتراضي من الربح (%)</label>
                  <input type="number" id="set-investor-share" class="form-control text-xs" value="${share}" min="0" max="100" step="1" required />
                  <div class="text-[10px] text-slate-400 mt-1">يُستخدم للمستثمر اللي مالوش نسبة خاصة. الربح = سعر البيع − سعر التكلفة. المستثمر بياخد تكلفته كاملة + نسبته من الربح، والباقي ربحك.</div>
                </div>
                <div class="text-[11px] text-slate-600 bg-slate-50 border border-slate-200 rounded-xl p-3 leading-6">
                  <b>مثال:</b> منتج تكلفته 100 واتباع بـ 150 والنسبة 50%<br/>
                  الربح = 50 → المستثمر: 100 + 25 = <b>125</b> — المتجر: <b>25</b>
                </div>
              </div>
            </div>

            <!-- Operations -->
            <div class="admin-card p-6">
              <h3 class="font-extrabold text-base text-slate-800 pb-3 mb-4 border-b border-slate-100 flex items-center gap-2">
                <i class="fa-solid fa-sliders text-emerald-600"></i>
                <span>تنبيهات المخزون</span>
              </h3>
              <div class="form-group max-w-sm">
                <label class="form-label font-bold text-xs text-slate-700">حد التنبيه بنقص المخزون</label>
                <input type="number" id="set-threshold" class="form-control text-xs" value="${s.lowStockThreshold || 15}" min="1" max="500" required />
              </div>
            </div>

            <div class="flex justify-end pt-2">
              <button type="submit" id="settings-save-btn" class="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-6 py-3 rounded-xl text-xs flex items-center gap-2 shadow-md transition">
                <i class="fa-solid fa-floppy-disk"></i>
                <span>حفظ الإعدادات</span>
              </button>
            </div>
          </form>

          <!-- Store contact info (footer, support page, maintenance page) -->
          <div class="admin-card p-6 mt-6">
            <h3 class="font-extrabold text-base text-slate-800 pb-3 mb-3 border-b border-slate-100 flex items-center gap-2">
              <i class="fa-solid fa-address-book text-emerald-600"></i>
              <span>بيانات التواصل (بتظهر في الفوتر وصفحة الدعم وصفحة الصيانة)</span>
            </h3>
            <p class="text-[11px] text-slate-500 mb-3">أي خانة تسيبها فاضية مش هتظهر للعميل.</p>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
              ${[['whatsapp', 'رقم الواتساب', '01xxxxxxxxx'], ['phone', 'رقم التليفون', '01xxxxxxxxx'], ['email', 'الإيميل', 'support@example.com'], ['address', 'العنوان', 'القاهرة، مصر'], ['facebook', 'رابط فيسبوك', 'https://facebook.com/...'], ['instagram', 'رابط إنستغرام', 'https://instagram.com/...'], ['tiktok', 'رابط تيك توك', 'https://tiktok.com/@...']].map(([k, l, ph]) => `
                <div>
                  <label class="form-label font-bold">${l}</label>
                  <input id="ci-${k}" class="form-control text-xs" ${k === 'address' ? '' : 'dir="ltr"'} placeholder="${ph}" value="${this.escape(contact[k] || '')}" />
                </div>`).join('')}
            </div>
            <div class="flex justify-end mt-3">
              <button type="button" onclick="SettingsAdmin.saveContact()" class="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2 rounded-xl text-xs font-bold">حفظ بيانات التواصل</button>
            </div>
          </div>

          <!-- Editable store pages -->
          <div class="admin-card p-6 mt-6">
            <h3 class="font-extrabold text-base text-slate-800 pb-3 mb-3 border-b border-slate-100 flex items-center gap-2">
              <i class="fa-solid fa-file-lines text-emerald-600"></i>
              <span>صفحات المتجر (من نحن • سياسة الخصوصية • الشروط والأحكام)</span>
            </h3>
            <p class="text-[11px] text-slate-500 mb-3">طريقة الكتابة: سطر يبدأ بـ <code>## </code> = عنوان، سطر يبدأ بـ <code>- </code> = نقطة، <code>**كلام**</code> = خط عريض، وسطر فاضي = فقرة جديدة.</p>
            <div class="flex gap-2 flex-wrap mb-3">
              ${[['about', 'من نحن'], ['privacy', 'سياسة الخصوصية'], ['terms', 'الشروط والأحكام']].map(([k, l]) => `<button type="button" onclick="SettingsAdmin.openPage('${k}')" class="px-4 py-2 rounded-xl text-xs font-bold ${this.pageSlug === k ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-700'}">${l}</button>`).join('')}
            </div>
            <div id="page-editor"></div>
          </div>
        </div>
      `;

      AdminLayout.render('settings', html);
      this.openPage(this.pageSlug || 'about');
    } catch (err) {
      console.error('Settings render error:', err);
      AdminLayout.render('settings', `<div class="p-8 text-center text-rose-600">${this.escape(err.message || 'فشل تحميل الإعدادات')}</div>`);
    }
  },

  pageSlug: 'about',

  async openPage(slug) {
    this.pageSlug = slug;
    document.querySelectorAll('[onclick^="SettingsAdmin.openPage"]').forEach(b => {
      const on = b.getAttribute('onclick').includes(`'${slug}'`);
      b.className = `px-4 py-2 rounded-xl text-xs font-bold ${on ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-700'}`;
    });
    const box = document.getElementById('page-editor');
    if (!box) return;
    box.innerHTML = '<div class="text-center text-slate-400 py-6"><i class="fa-solid fa-spinner fa-spin"></i></div>';
    try {
      const { page } = await API.get(`/pages/${slug}`);
      box.innerHTML = `
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 text-xs">
          <div>
            <label class="form-label font-bold">العنوان (عربي)</label>
            <input id="pg-title" class="form-control text-xs mb-2" value="${this.escape(page.title)}" />
            <label class="form-label font-bold">النص (عربي)</label>
            <textarea id="pg-body" rows="16" class="form-control text-xs leading-6">${this.escape(page.body)}</textarea>
          </div>
          <div dir="ltr" class="text-left">
            <label class="form-label font-bold">Title (English)</label>
            <input id="pg-title-en" class="form-control text-xs mb-2" value="${this.escape(page.title_en || '')}" />
            <label class="form-label font-bold">Text (English)</label>
            <textarea id="pg-body-en" rows="16" class="form-control text-xs leading-6">${this.escape(page.body_en || '')}</textarea>
          </div>
        </div>
        <div class="flex items-center justify-between mt-3 flex-wrap gap-2">
          <span class="text-[10.5px] text-slate-400">${page.updatedAt ? `آخر تعديل: ${new Date(page.updatedAt).toLocaleString('ar-EG')} (${this.escape(page.updatedBy || '')})` : 'النص الافتراضي'}</span>
          <div class="flex gap-2">
            <a href="#/${slug}" target="_blank" class="px-4 py-2 rounded-xl border border-slate-300 text-xs font-bold">معاينة الصفحة</a>
            <button type="button" onclick="SettingsAdmin.savePage()" class="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2 rounded-xl text-xs font-bold">حفظ الصفحة</button>
          </div>
        </div>`;
    } catch (err) {
      box.innerHTML = `<div class="text-rose-600">${this.escape(err.message)}</div>`;
    }
  },

  async saveContact() {
    const body = {};
    ['whatsapp', 'phone', 'email', 'address', 'facebook', 'instagram', 'tiktok'].forEach(k => { body[k] = (document.getElementById('ci-' + k) || {}).value || ''; });
    try {
      const r = await API.put('/pages/meta/contact', body);
      App.contact = r.contact || body;
      App.showToast(r.message, 'success');
    } catch (err) { App.showToast(err.message, 'error'); }
  },

  async savePage() {
    const v = id => (document.getElementById(id) || {}).value || '';
    try {
      const r = await API.put(`/pages/${this.pageSlug}`, { title: v('pg-title'), body: v('pg-body'), title_en: v('pg-title-en'), body_en: v('pg-body-en') });
      App.showToast(r.message, 'success');
      this.openPage(this.pageSlug);
    } catch (err) { App.showToast(err.message, 'error'); }
  },

  async saveSettings(e) {
    e.preventDefault();
    const btn = document.getElementById('settings-save-btn');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> جاري الحفظ...';
    }

    const payload = {
      lowStockThreshold: Number(document.getElementById('set-threshold')?.value) || 15,
      cardPaymentEnabled: Boolean(document.getElementById('set-card-enabled')?.checked),
      defaultInvestorProfitSharePercent: Number(document.getElementById('set-investor-share')?.value)
    };

    try {
      const res = await API.put('/admin/settings', payload);
      if (res.success) {
        App.showToast('تم حفظ إعدادات المتجر بنجاح', 'success');
        this.render();
      }
    } catch (err) {
      App.showToast(err.message || 'فشل حفظ الإعدادات', 'error');
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> حفظ الإعدادات';
      }
    }
  }
};
