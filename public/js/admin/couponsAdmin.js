/**
 * Suki Store Admin Coupons & Loyalty Points Management
 * Full dashboard controls for Coupons, Loyalty Points (50 pts / 1000 EGP), and Milestone VIP Rewards
 */

const CouponsAdmin = {
  coupons: [],
  settings: {
    loyaltyEnabled: true,
    loyaltySpendPerReward: 1000,
    loyaltyPointsPerReward: 50,
    loyaltyPointValueEgp: 1.0,
    loyaltyMinRedemptionThreshold: 500,
    loyaltyMaxRedemptionPercent: 10,
    milestoneCouponsEnabled: true,
    milestoneThresholds: [3000, 5000],
    milestoneDiscountPercent: 10
  },
  editingCouponId: null,

  async render() {
    AdminLayout.render('coupons', `
      <div class="py-12 text-center text-slate-400">
        <i class="fa-solid fa-spinner fa-spin text-3xl mb-3 text-emerald-600"></i>
        <div>جاري جلب قائمة الكوبونات ونظام نقاط الولاء...</div>
      </div>
    `);

    try {
      const [cRes, sRes] = await Promise.all([
        API.get('/coupons'),
        API.get('/coupons/settings/all').catch(() => ({ settings: this.settings }))
      ]);

      this.coupons = cRes.coupons || [];
      if (sRes.settings) {
        this.settings = { ...this.settings, ...sRes.settings };
      }
      this.renderTable();
    } catch (err) {
      console.error('Coupons admin render error:', err);
    }
  },

  renderTable() {
    const s = this.settings;

    const html = `
      <div class="space-y-6 text-right" dir="rtl">
        <!-- Page Header -->
        <div class="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 class="text-2xl font-black text-slate-900 flex items-center gap-2">
              <i class="fa-solid fa-ticket-simple text-amber-500"></i>
              <span>نظام الكوبونات ونقاط الولاء (Loyalty System)</span>
            </h1>
            <p class="text-xs text-slate-500 mt-1">
              التحكم في نقاط ولاء العملاء (المشتريات والاستبدال)، كوبونات إنجاز المشتريات المسلّمة (3000 و 5000 ج.م)، وإنشاء أكواد الخصم الترويجية
            </p>
          </div>
          <button onclick="CouponsAdmin.openModal()" class="bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold px-4 py-2.5 rounded-xl text-xs flex items-center gap-2 shadow-md cursor-pointer transition">
            <i class="fa-solid fa-plus"></i>
            <span>إضافة كوبون خصم يدوي</span>
          </button>
        </div>

        <!-- 1. Loyalty Points Settings Card -->
        <div class="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
          <div class="flex items-center justify-between pb-4 mb-4 border-b border-slate-100 flex-wrap gap-2">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center text-xl font-black">
                <i class="fa-solid fa-coins"></i>
              </div>
              <div>
                <h3 class="font-extrabold text-slate-800 text-sm">إعدادات نظام نقاط الولاء للعملاء</h3>
                <p class="text-[11px] text-slate-400">تكتسب النقاط عند تسليم الطلبات فعلياً ويمكن استبدالها بخصم مباشر</p>
              </div>
            </div>
            <div class="flex items-center gap-2">
              <label class="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" id="loyalty-toggle" class="sr-only peer" ${s.loyaltyEnabled ? 'checked' : ''} onchange="CouponsAdmin.saveLoyaltySettings()" />
                <div class="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
                <span class="ms-3 text-xs font-bold text-slate-700">${s.loyaltyEnabled ? 'النظام مفعّل' : 'النظام متوقف'}</span>
              </label>
            </div>
          </div>

          <form onsubmit="CouponsAdmin.submitLoyaltyForm(event)" oninput="CouponsAdmin.updateLoyaltyPreview()" class="space-y-4">
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 text-xs">
              <div>
                <label class="block font-bold text-slate-700 mb-1.5">كل مشتريات بقيمة</label>
                <div class="relative">
                  <input type="number" id="loyalty-spend" class="form-control font-bold text-xs pl-8" value="${s.loyaltySpendPerReward}" min="1" step="1" required />
                  <span class="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 font-bold">ج.م</span>
                </div>
              </div>

              <div>
                <label class="block font-bold text-slate-700 mb-1.5">العميل ياخد</label>
                <div class="relative">
                  <input type="number" id="loyalty-points-per-1000" class="form-control font-bold text-xs pl-8" value="${s.loyaltyPointsPerReward}" min="0" step="1" required />
                  <span class="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 font-bold">نقطة</span>
                </div>
              </div>

              <div>
                <label class="block font-bold text-slate-700 mb-1.5">قيمة النقطة الواحدة</label>
                <div class="relative">
                  <input type="number" step="0.01" id="loyalty-point-value" class="form-control font-bold text-xs pl-8" value="${s.loyaltyPointValueEgp}" min="0.01" required />
                  <span class="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 font-bold">ج.م</span>
                </div>
              </div>

              <div>
                <label class="block font-bold text-slate-700 mb-1.5">أقل رصيد عشان يستخدمها</label>
                <div class="relative">
                  <input type="number" id="loyalty-min-threshold" class="form-control font-bold text-xs pl-8" value="${s.loyaltyMinRedemptionThreshold}" min="0" step="1" required />
                  <span class="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 font-bold">نقطة</span>
                </div>
              </div>

              <div>
                <label class="block font-bold text-slate-700 mb-1.5">أقصى خصم بالنقاط من الطلب</label>
                <div class="relative">
                  <input type="number" id="loyalty-max-percent" class="form-control font-bold text-xs pl-8" value="${s.loyaltyMaxRedemptionPercent}" min="1" max="99" step="0.5" required />
                  <span class="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 font-bold">%</span>
                </div>
              </div>
            </div>
            <div id="loyalty-preview" class="text-[11px] text-emerald-900 bg-emerald-50 border border-emerald-200 rounded-xl p-3 leading-6 font-bold">${this.loyaltyPreviewText(s)}</div>

            <div class="flex items-center justify-between pt-2">
              <div class="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-xl font-bold flex items-center gap-2">
                <i class="fa-solid fa-triangle-exclamation text-amber-600"></i>
                <span>قاعدة أمان: ممنوع استخدام نقاط الولاء مع كود خصم في نفس الطلب، وممنوع شراء منتج مجاني بالكامل بنسبة 100%.</span>
              </div>
              <button type="submit" class="bg-slate-900 hover:bg-slate-800 text-white px-5 py-2 rounded-xl text-xs font-extrabold shadow-sm cursor-pointer transition">
                حفظ إعدادات النقاط
              </button>
            </div>
          </form>
        </div>

        <!-- 2. Milestone VIP Coupons Settings Card -->
        <div class="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
          <div class="flex items-center justify-between pb-4 mb-4 border-b border-slate-100 flex-wrap gap-2">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center text-xl font-black">
                <i class="fa-solid fa-crown"></i>
              </div>
              <div>
                <h3 class="font-extrabold text-slate-800 text-sm">نظام كوبونات مكافآت الإنجاز (${(s.milestoneThresholds || []).map(n => Number(n).toLocaleString('ar-EG')).join(' و ')} ج.م)</h3>
                <p class="text-[11px] text-slate-400">توليد كوبون خصم ${s.milestoneDiscountPercent}% تلقائياً باسم العميل عند بلوغ مشترياته المسلّمة هذا المبلغ</p>
              </div>
            </div>
            <label class="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" id="milestone-toggle" class="sr-only peer" ${s.milestoneCouponsEnabled ? 'checked' : ''} onchange="CouponsAdmin.saveMilestoneSettings()" />
              <div class="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600"></div>
              <span class="ms-3 text-xs font-bold text-slate-700">${s.milestoneCouponsEnabled ? 'المكافآت مفعّلة' : 'معطلة'}</span>
            </label>
          </div>

          <form onsubmit="CouponsAdmin.submitMilestoneForm(event)" class="space-y-4">
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
              <div>
                <label class="block font-bold text-slate-700 mb-1.5">مستوى الإنجاز الأول (المشتريات المسلمة)</label>
                <div class="relative">
                  <input type="number" id="milestone-1" class="form-control font-bold text-xs pl-8" value="${(s.milestoneThresholds && s.milestoneThresholds[0]) || 3000}" min="100" required />
                  <span class="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 font-bold">ج.م</span>
                </div>
              </div>

              <div>
                <label class="block font-bold text-slate-700 mb-1.5">مستوى الإنجاز الثاني (المشتريات المسلمة)</label>
                <div class="relative">
                  <input type="number" id="milestone-2" class="form-control font-bold text-xs pl-8" value="${(s.milestoneThresholds && s.milestoneThresholds[1]) || 5000}" min="100" required />
                  <span class="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 font-bold">ج.م</span>
                </div>
              </div>

              <div>
                <label class="block font-bold text-slate-700 mb-1.5">نسبة الخصم الممنوحة في الكوبون</label>
                <div class="relative">
                  <input type="number" id="milestone-discount" class="form-control font-bold text-xs pl-8" value="${s.milestoneDiscountPercent || 10}" min="1" max="100" required />
                  <span class="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 font-bold">%</span>
                </div>
              </div>
            </div>

            <div class="flex items-center justify-between pt-2">
              <span class="text-[11px] text-slate-500 font-medium">يستخدم الكوبون في الطلب التالي مرة واحدة فقط باسم العميل ولا يقبل الجمع مع النقاط.</span>
              <button type="submit" class="bg-purple-700 hover:bg-purple-800 text-white px-5 py-2 rounded-xl text-xs font-extrabold shadow-sm cursor-pointer transition">
                حفظ إعدادات المكافآت
              </button>
            </div>
          </form>
        </div>

        <!-- 3. Existing Coupons Table -->
        <div class="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
          <div class="flex items-center justify-between pb-4 mb-4 border-b border-slate-100 flex-wrap gap-2">
            <h3 class="font-extrabold text-slate-800 text-sm flex items-center gap-2">
              <i class="fa-solid fa-list-check text-emerald-600"></i>
              <span>جدول الكوبونات الترويجية ومكافآت العملاء (${this.coupons.length})</span>
            </h3>
            <span class="text-xs text-slate-400">يمكنك تعديل أو تعطيل أي كود في أي وقت</span>
          </div>

          <div class="overflow-x-auto rounded-xl border border-slate-200">
            <table class="w-full text-right text-xs">
              <thead class="bg-slate-50 text-slate-700 font-extrabold border-b border-slate-200">
                <tr>
                  <th class="py-3 px-4">كود الخصم</th>
                  <th class="py-3 px-3">نوع وقيمة الخصم</th>
                  <th class="py-3 px-3">العميل المستفيد</th>
                  <th class="py-3 px-3">الحد الأدنى للطلب</th>
                  <th class="py-3 px-3">الاستخدامات</th>
                  <th class="py-3 px-3">الصلاحية</th>
                  <th class="py-3 px-3">الحالة</th>
                  <th class="py-3 px-4 text-center w-24">الإجراءات</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100 bg-white">
                ${this.coupons.length === 0 ? `
                  <tr><td colspan="8" class="text-center py-10 text-slate-400">لا توجد كوبونات مسجلة حالياً</td></tr>
                ` : this.coupons.map(c => {
                  const isPersonal = Boolean(c.targetUserId || c.targetUserName);
                  return `
                    <tr class="hover:bg-slate-50/70 transition">
                      <td class="py-3 px-4">
                        <div class="flex items-center gap-2">
                          <span class="font-mono font-black text-xs ${isPersonal ? 'bg-purple-50 text-purple-800 border-purple-200' : 'bg-amber-50 text-amber-800 border-amber-200'} border px-2.5 py-1 rounded-lg">
                            ${c.code}
                          </span>
                          ${isPersonal ? '<span class="text-[9px] bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded font-black">شخصي VIP</span>' : ''}
                        </div>
                      </td>
                      <td class="py-3 px-3 font-extrabold text-emerald-700">
                        ${c.discountType === 'percentage' ? `${c.discountValue}%` : `${c.discountValue} ج.م`}
                      </td>
                      <td class="py-3 px-3 text-slate-600">
                        ${c.targetUserName ? `<span class="font-bold text-purple-900">${c.targetUserName}</span>` : '<span class="text-slate-400">عام لكافة العملاء</span>'}
                      </td>
                      <td class="py-3 px-3 text-slate-600">${c.minOrderValue ? `${c.minOrderValue} ج.م` : 'بدون حد أدنى'}</td>
                      <td class="py-3 px-3 text-slate-700">
                        <strong>${c.usedCount || 0}</strong> / ${c.maxUses || 'غير محدود'}
                      </td>
                      <td class="py-3 px-3 text-slate-500">
                        ${c.expiresAt ? new Date(c.expiresAt).toLocaleDateString('ar-EG') : 'دائم'}
                      </td>
                      <td class="py-3 px-3">
                        <span class="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold ${c.isActive ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-slate-100 text-slate-500'}">
                          ${c.isActive ? 'نشط' : 'متوقف'}
                        </span>
                        ${c.showOnHome ? '<span class="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200 mr-1"><i class="fa-solid fa-house ml-1"></i>في الرئيسية</span>' : ''}
                      </td>
                      <td class="py-3 px-4 text-center">
                        <div class="inline-flex items-center gap-1.5">
                          <button onclick="CouponsAdmin.editCoupon('${c.id}')" class="p-1.5 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-lg transition" title="تعديل">
                            <i class="fa-solid fa-pen-to-square"></i>
                          </button>
                          <button onclick="CouponsAdmin.deleteCoupon('${c.id}', '${c.code}')" class="p-1.5 bg-rose-50 text-rose-600 hover:bg-rose-100 rounded-lg transition" title="حذف">
                            <i class="fa-solid fa-trash"></i>
                          </button>
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

    AdminLayout.render('coupons', html);
  },

  async saveLoyaltySettings() {
    const isEnabled = document.getElementById('loyalty-toggle').checked;
    try {
      const res = await API.put('/coupons/settings/all', {
        loyaltyEnabled: isEnabled
      });
      if (res.success) {
        this.settings.loyaltyEnabled = isEnabled;
        App.showToast(isEnabled ? 'تم تفعيل نظام نقاط الولاء' : 'تم إيقاف نظام نقاط الولاء', 'success');
        this.renderTable();
      }
    } catch (err) {
      App.showToast(err.message, 'error');
    }
  },

  // Plain-language example of what the current numbers mean for a customer
  loyaltyPreviewText(s) {
    const spend = Number(s.loyaltySpendPerReward) || 0;
    const pts = Number(s.loyaltyPointsPerReward) || 0;
    const val = Number(s.loyaltyPointValueEgp) || 0;
    const min = Number(s.loyaltyMinRedemptionThreshold) || 0;
    const maxPct = Number(s.loyaltyMaxRedemptionPercent) || 0;
    if (!spend) return 'اكتب مبلغ المشتريات الأول.';
    const exampleOrder = spend * 3;
    const earned = Math.floor(exampleOrder / spend) * pts;
    const cashback = Math.round(pts * val / spend * 10000) / 100;
    return `
      مثال: عميل اشترى بـ ${exampleOrder.toLocaleString('ar-EG')} ج.م واستلم الطلب ← ياخد <b>${earned.toLocaleString('ar-EG')} نقطة</b> = <b>${(earned * val).toLocaleString('ar-EG')} ج.م</b> رصيد.<br>
      يعني كأنك بترجّعله <b>${cashback}%</b> من مشترياته. ويقدر يستخدمها لما رصيده يوصل <b>${min.toLocaleString('ar-EG')} نقطة</b> (= ${(min * val).toLocaleString('ar-EG')} ج.م)،
      وأقصى خصم بالنقاط في الطلب الواحد <b>${maxPct}%</b> من قيمة المنتجات.`;
  },

  readLoyaltyForm() {
    const v = id => (document.getElementById(id) || {}).value;
    return {
      loyaltySpendPerReward: v('loyalty-spend'),
      loyaltyPointsPerReward: v('loyalty-points-per-1000'),
      loyaltyPointValueEgp: v('loyalty-point-value'),
      loyaltyMinRedemptionThreshold: v('loyalty-min-threshold'),
      loyaltyMaxRedemptionPercent: v('loyalty-max-percent')
    };
  },

  updateLoyaltyPreview() {
    const box = document.getElementById('loyalty-preview');
    if (box) box.innerHTML = this.loyaltyPreviewText(this.readLoyaltyForm());
  },

  async submitLoyaltyForm(e) {
    e.preventDefault();
    const payload = this.readLoyaltyForm();
    try {
      const res = await API.put('/coupons/settings/all', payload);
      if (res.success) {
        // Show exactly what the server saved
        this.settings = { ...this.settings, ...res.settings };
        App.showToast(res.message || '✅ تم الحفظ', 'success');
        this.renderTable();
      }
    } catch (err) {
      App.showToast(err.message, 'error');
    }
  },

  async saveMilestoneSettings() {
    const isEnabled = document.getElementById('milestone-toggle').checked;
    try {
      const res = await API.put('/coupons/settings/all', {
        milestoneCouponsEnabled: isEnabled
      });
      if (res.success) {
        this.settings.milestoneCouponsEnabled = isEnabled;
        App.showToast(isEnabled ? 'تم تفعيل كوبونات مكافآت الإنجاز' : 'تم تعطيل كوبونات مكافآت الإنجاز', 'success');
        this.renderTable();
      }
    } catch (err) {
      App.showToast(err.message, 'error');
    }
  },

  async submitMilestoneForm(e) {
    e.preventDefault();
    const m1 = document.getElementById('milestone-1').value;
    const m2 = document.getElementById('milestone-2').value;
    const payload = {
      milestoneThresholds: [m1, m2].filter(v => String(v).trim() !== ''),
      milestoneDiscountPercent: document.getElementById('milestone-discount').value
    };

    try {
      const res = await API.put('/coupons/settings/all', payload);
      if (res.success) {
        this.settings = { ...this.settings, ...res.settings };
        App.showToast(res.message || '✅ تم الحفظ', 'success');
        this.renderTable();
      }
    } catch (err) {
      App.showToast(err.message, 'error');
    }
  },

  openModal(coupon = null) {
    this.editingCouponId = coupon ? coupon.id : null;
    const isEdit = Boolean(coupon);

    const modalBody = `
      <form onsubmit="CouponsAdmin.submitForm(event)" class="text-right" dir="rtl">
        <div class="grid grid-cols-2 gap-3 mb-3">
          <div class="form-group">
            <label class="form-label text-xs font-bold text-slate-700">كود الخصم (حروف وأرقام إنجليزية) *</label>
            <input type="text" id="cp-code" class="form-control uppercase font-mono font-bold text-xs" placeholder="SUKI20" value="${coupon ? coupon.code : ''}" required />
          </div>

          <div class="form-group">
            <label class="form-label text-xs font-bold text-slate-700">نوع الخصم *</label>
            <select id="cp-type" class="form-control font-bold text-xs">
              <option value="percentage" ${coupon && coupon.discountType === 'percentage' ? 'selected' : ''}>نسبة مئوية (%)</option>
              <option value="fixed" ${coupon && coupon.discountType === 'fixed' ? 'selected' : ''}>مبلغ ثابت (ج.م)</option>
            </select>
          </div>
        </div>

        <div class="grid grid-cols-2 gap-3 mb-3">
          <div class="form-group">
            <label class="form-label text-xs font-bold text-slate-700">قيمة الخصم *</label>
            <input type="number" id="cp-value" class="form-control text-xs" placeholder="مثال: 15" value="${coupon ? coupon.discountValue : ''}" required />
          </div>

          <div class="form-group">
            <label class="form-label text-xs font-bold text-slate-700">الحد الأدنى لقيمة الطلب (ج.م)</label>
            <input type="number" id="cp-min" class="form-control text-xs" placeholder="مثال: 200" value="${coupon ? (coupon.minOrderValue || 0) : 0}" />
          </div>
        </div>

        <div class="grid grid-cols-2 gap-3 mb-3">
          <div class="form-group">
            <label class="form-label text-xs font-bold text-slate-700">الحد الأقصى للاستخدام (مرات)</label>
            <input type="number" id="cp-max-uses" class="form-control text-xs" placeholder="اتركه فارغاً لعدد غير محدود" value="${coupon && coupon.maxUses ? coupon.maxUses : ''}" />
          </div>

          <div class="form-group">
            <label class="form-label text-xs font-bold text-slate-700">تاريخ انتهاء الصلاحية</label>
            <input type="date" id="cp-expires" class="form-control text-xs" value="${coupon && coupon.expiresAt ? coupon.expiresAt.split('T')[0] : ''}" />
          </div>
        </div>

        <div class="form-group mb-4">
          <label class="flex items-center gap-2 text-xs font-bold cursor-pointer">
            <input type="checkbox" id="cp-active" ${!coupon || coupon.isActive !== false ? 'checked' : ''} class="accent-emerald-600 w-4 h-4" />
            <span>الكوبون نشط ومتاح للاستخدام الفوري</span>
          </label>
          <label class="flex items-center gap-2 text-xs font-bold cursor-pointer mt-2">
            <input type="checkbox" id="cp-home" ${coupon && coupon.showOnHome ? 'checked' : ''} class="accent-amber-500 w-4 h-4" />
            <span>اعرضه في بانر الصفحة الرئيسية (كوبون واحد بس يظهر في المرة)</span>
          </label>
        </div>

        <button type="submit" class="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3.5 rounded-xl text-sm transition">
          ${isEdit ? 'حفظ تعديلات الكوبون' : 'إنشاء الكوبون'}
        </button>
      </form>
    `;

    App.openModal(isEdit ? 'تعديل الكوبون' : 'إنشاء كوبون خصم جديد', modalBody);
  },

  editCoupon(id) {
    const c = this.coupons.find(item => item.id === id);
    if (c) this.openModal(c);
  },

  deleteCoupon(id, code) {
    App.confirm(`هل أنت متأكد من حذف كود الخصم "${code}"؟`, async () => {
      try {
        const res = await API.delete(`/coupons/${id}`);
        if (res.success) {
          App.showToast('تم حذف الكوبون بنجاح', 'success');
          this.render();
        }
      } catch (err) {
        App.showToast(err.message, 'error');
      }
    });
  },

  async submitForm(e) {
    e.preventDefault();
    const code = document.getElementById('cp-code').value.trim();
    const discountType = document.getElementById('cp-type').value;
    const discountValue = Number(document.getElementById('cp-value').value);
    const minOrderValue = Number(document.getElementById('cp-min').value) || 0;
    const maxUses = document.getElementById('cp-max-uses').value ? Number(document.getElementById('cp-max-uses').value) : null;
    const expiresDate = document.getElementById('cp-expires').value;
    const expiresAt = expiresDate ? `${expiresDate}T23:59:59Z` : null;
    const isActive = document.getElementById('cp-active').checked;

    const showOnHome = Boolean(document.getElementById('cp-home') && document.getElementById('cp-home').checked);
    const payload = { code, discountType, discountValue, minOrderValue, maxUses, expiresAt, isActive, showOnHome };

    try {
      if (this.editingCouponId) {
        const res = await API.put(`/coupons/${this.editingCouponId}`, payload);
        if (res.success) {
          App.closeModal();
          App.showToast('تم تحديث الكوبون بنجاح', 'success');
          this.render();
        }
      } else {
        const res = await API.post('/coupons', payload);
        if (res.success) {
          App.closeModal();
          App.showToast('تم إنشاء الكوبون بنجاح', 'success');
          this.render();
        }
      }
    } catch (err) {
      App.showToast(err.message, 'error');
    }
  }
};
