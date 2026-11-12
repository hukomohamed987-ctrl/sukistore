/**
 * Suki Store Customer Returns & Replacement Page
 * Features:
 * - 5-stage visual stepper (تحت المراجعة ➔ مقبول ➔ تم إرسال المندوب ➔ تم الاستلام ➔ تم الاستبدال)
 * - Submission modal for delivered products only (strictly for manufacturing defect - عيب صناعة)
 * - Mandatory phone & whatsapp + defect description + optional photo
 */

const ReturnsPage = {
  returns: [],
  selectedReturn: null,
  uploadedDefectPhoto: '',

  async render(returnId = null) {
    const main = document.getElementById('main-content');
    main.innerHTML = `
      <div class="container py-12 text-center text-slate-400">
        <i class="fa-solid fa-spinner fa-spin text-3xl mb-3 text-emerald-600"></i>
        <div class="font-bold">جاري تحميل طلبات الاستبدال وتتبع الضمان...</div>
      </div>
    `;

    if (!State.user) {
      main.innerHTML = `
        <div class="container py-16 text-center">
          <div class="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4 text-2xl text-amber-600">
            <i class="fa-solid fa-shield-halved"></i>
          </div>
          <h2 class="text-xl font-black text-slate-800 mb-2">تسجيل الدخول مطلوب</h2>
          <p class="text-sm text-slate-500 mb-6">يُرجى تسجيل الدخول إلى حسابك لعرض وتتبع طلبات الاستبدال والضمان</p>
          <button onclick="AuthModal.open('login')" class="bg-emerald-600 text-white font-extrabold px-6 py-2.5 rounded-full text-sm hover:bg-emerald-700 transition">
            تسجيل الدخول الآن
          </button>
        </div>
      `;
      return;
    }

    try {
      const res = await API.get('/returns/my-returns');
      this.returns = res.returns || [];

      // Check if URL has ?id=...
      const urlParams = new URLSearchParams(window.location.hash.split('?')[1] || '');
      const targetId = returnId || urlParams.get('id');

      if (targetId) {
        this.selectedReturn = this.returns.find(r => r.id === targetId || r.returnNumber === targetId) || null;
      } else if (this.returns.length > 0) {
        this.selectedReturn = this.returns[0];
      } else {
        this.selectedReturn = null;
      }

      this.renderView();
    } catch (err) {
      console.error('Fetch returns error:', err);
      main.innerHTML = `
        <div class="container py-12 text-center text-red-600 font-bold">
          حدث خطأ أثناء تحميل طلبات الاستبدال.
        </div>
      `;
    }
  },

  renderView() {
    const main = document.getElementById('main-content');
    const r = this.selectedReturn;

    const stages = [
      { key: 'pending_review', label: 'تحت المراجعة', icon: 'fa-clipboard-check', desc: 'طلبك قيد الفحص الفني من خدمة العملاء' },
      { key: 'accepted', label: 'مقبول', icon: 'fa-thumbs-up', desc: 'تم قبول طلب الاستبدال والموافقة عليه' },
      { key: 'courier_dispatched', label: 'تم إرسال المندوب', icon: 'fa-truck-fast', desc: 'المندوب في طريقه لاستلام المنتج التالف وتسليم البديل' },
      { key: 'received', label: 'تم الاستلام', icon: 'fa-box-open', desc: 'تم استلام المنتج وفحصه في المركز الرئيسي' },
      { key: 'replaced', label: 'تم الاستبدال', icon: 'fa-circle-check', desc: 'تم استبدال المنتج بنجاح وإغلاق الطلب' }
    ];

    const currentStageIndex = r ? stages.findIndex(s => s.key === r.status) : 0;

    main.innerHTML = `
      <div class="container py-6">
        <!-- Breadcrumb -->
        <div class="flex items-center gap-2 text-xs text-slate-500 mb-6 font-semibold">
          <a href="#/" class="hover:text-emerald-600">الرئيسية</a>
          <span>/</span>
          <a href="#/profile" class="hover:text-emerald-600">حسابي</a>
          <span>/</span>
          <a href="#/orders" class="hover:text-emerald-600">طلباتي</a>
          <span>/</span>
          <span class="text-slate-800 font-bold">طلبات الاستبدال والضمان</span>
        </div>

        <!-- Header -->
        <div class="bg-gradient-to-r from-emerald-800 to-slate-900 text-white rounded-2xl p-6 md:p-8 mb-8 flex flex-col md:flex-row items-center justify-between gap-6 shadow-md">
          <div>
            <div class="inline-flex items-center gap-1.5 bg-amber-400 text-slate-950 font-extrabold text-[11px] px-3 py-1 rounded-full mb-3 shadow-sm">
              <i class="fa-solid fa-shield-check"></i>
              <span>ضمان استبدال 14 يوم (عيب صناعة فقط) — الاستبدال مجاناً</span>
            </div>
            <h1 class="text-2xl md:text-3xl font-black mb-2">طلبات الاستبدال وتتبع الضمان</h1>
            <p class="text-emerald-100 text-xs md:text-sm max-w-xl leading-relaxed">
              تابع مراحل فحص واستبدال منتجك خطوة بخطوة مع خدمة عملاء سوقي ستور المعتمدة.
            </p>
          </div>
          <a href="#/orders" class="bg-white text-emerald-900 hover:bg-emerald-50 font-extrabold text-xs px-5 py-3 rounded-xl transition flex items-center gap-2 shadow-md flex-shrink-0">
            <i class="fa-solid fa-boxes-stacked"></i>
            <span>عرض طلباتي لطلب استبدال منتج</span>
          </a>
        </div>

        ${this.returns.length === 0 ? `
          <div class="bg-white rounded-2xl border border-slate-200 p-16 text-center shadow-sm">
            <div class="w-20 h-20 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-4 text-3xl text-emerald-600">
              <i class="fa-solid fa-shield-halved"></i>
            </div>
            <h3 class="text-xl font-black text-slate-800 mb-2">لا توجد طلبات استبدال حالياً</h3>
            <p class="text-xs text-slate-500 max-w-md mx-auto mb-6 leading-relaxed">
              إذا واجهت أي عيب صناعة في منتج استلمته، يمكنك الدخول لصفحة "طلباتي" والضغط على زر "طلب استبدال (عيب صناعة)" على الطلب المستلم.
            </p>
            <a href="#/orders" class="inline-block bg-emerald-600 text-white font-extrabold text-xs px-6 py-3 rounded-full hover:bg-emerald-700 transition shadow-md">
              الذهاب إلى قائمة طلباتي
            </a>
          </div>
        ` : `
          <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <!-- Sidebar: List of returns -->
            <div class="lg:col-span-1 space-y-3">
              <h3 class="text-sm font-black text-slate-800 mb-3 flex items-center justify-between">
                <span>طلباتك السابقة (${this.returns.length})</span>
              </h3>
              ${this.returns.map(item => {
                const isSelected = r && r.id === item.id;
                const stageObj = item.status === 'rejected' ? { label: 'مرفوض' } : (stages.find(s => s.key === item.status) || stages[0]);
                return `
                  <div 
                    onclick="ReturnsPage.selectReturn('${item.id}')"
                    class="p-4 rounded-2xl border-2 transition cursor-pointer shadow-sm ${isSelected ? 'border-emerald-600 bg-emerald-50/40 ring-2 ring-emerald-500/20' : 'border-slate-200 bg-white hover:border-emerald-300'}">
                    <div class="flex items-center justify-between mb-2">
                      <span class="font-black text-xs text-slate-900 font-mono">#${item.returnNumber}</span>
                      <span class="text-[10px] font-extrabold px-2 py-0.5 rounded-full ${item.status === 'replaced' ? 'bg-emerald-100 text-emerald-800' : (item.status === 'rejected' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800')}">
                        ${stageObj.label}
                      </span>
                    </div>
                    <div class="flex items-center gap-3">
                      <img src="${item.productImage || '/images/no-image.svg'}" class="w-12 h-12 rounded-xl object-cover border border-slate-200 flex-shrink-0" />
                      <div class="min-w-0">
                        <div class="font-extrabold text-xs text-slate-800 truncate">${item.productTitle}</div>
                        <div class="text-[11px] text-slate-400 mt-0.5">طلب #${item.orderNumber}</div>
                      </div>
                    </div>
                    <div class="text-[10px] text-slate-400 mt-2 text-left">
                      ${new Date(item.createdAt).toLocaleDateString('ar-EG')}
                    </div>
                  </div>
                `;
              }).join('')}
            </div>

            <!-- Main Panel: Detailed Stepper & Info -->
            <div class="lg:col-span-2">
              ${r ? `
                <div class="bg-white rounded-2xl border border-slate-200 p-6 md:p-8 shadow-sm">
                  <!-- Top Details Banner -->
                  <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-6 border-b border-slate-100">
                    <div>
                      <div class="flex items-center gap-2 mb-1">
                        <span class="text-xs text-slate-400 font-bold">طلب استبدال رقم:</span>
                        <span class="text-base font-black text-emerald-700 font-mono">#${r.returnNumber}</span>
                      </div>
                      <div class="text-xs text-slate-500">
                        تاريخ التقديم: <strong class="text-slate-700">${new Date(r.createdAt).toLocaleString('ar-EG')}</strong>
                      </div>
                    </div>
                    <div class="bg-emerald-50 text-emerald-800 font-extrabold text-xs px-3.5 py-1.5 rounded-xl border border-emerald-200 flex items-center gap-1.5">
                      <i class="fa-solid fa-tag"></i>
                      <span>السبب: عيب صناعة</span>
                    </div>
                  </div>

                  ${r.status === 'rejected' ? `
                  <div class="my-4 p-4 rounded-xl bg-red-50 border border-red-200 text-red-900 text-xs font-bold leading-6">
                    <i class="fa-solid fa-circle-xmark"></i> تم رفض طلب الاستبدال.
                    ${r.rejectionReason ? `<div class="mt-1 font-semibold">السبب: ${String(r.rejectionReason).replace(/[<>&]/g, '')}</div>` : ''}
                    <div class="mt-1 text-red-700 font-semibold">لو عندك استفسار تواصل مع خدمة العملاء.</div>
                  </div>` : ''}
                  <!-- 5-STAGE PROGRESS STEPPER -->
                  <div class="py-8 my-4 border-b border-slate-100">
                    <h3 class="text-sm font-black text-slate-800 mb-6 flex items-center gap-2">
                      <i class="fa-solid fa-bars-progress text-emerald-600"></i>
                      <span>مراحل معالجة طلب الاستبدال:</span>
                    </h3>

                    <!-- Desktop & Tablet Horizontal Stepper -->
                    <div class="hidden md:flex items-center justify-between relative px-4">
                      <!-- Connector line -->
                      <div class="absolute top-5 left-10 right-10 h-1 bg-slate-200 -z-0">
                        <div class="h-full bg-emerald-600 transition-all duration-500" style="width: ${(currentStageIndex / (stages.length - 1)) * 100}%;"></div>
                      </div>

                      ${stages.map((stage, idx) => {
                        const isCompleted = idx <= currentStageIndex;
                        const isCurrent = idx === currentStageIndex;
                        return `
                          <div class="flex flex-col items-center relative z-10 text-center max-w-[100px]">
                            <div class="w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm transition ${isCompleted ? 'bg-emerald-600 text-white shadow-md ring-4 ring-emerald-100' : 'bg-white border-2 border-slate-300 text-slate-400'}">
                              <i class="fa-solid ${stage.icon}"></i>
                            </div>
                            <div class="mt-2.5 font-black text-xs ${isCurrent ? 'text-emerald-700 font-black' : (isCompleted ? 'text-slate-800' : 'text-slate-400')}">
                              ${stage.label}
                            </div>
                            <div class="text-[9px] text-slate-400 leading-tight mt-0.5">
                              ${isCurrent ? 'الحالة الحالية' : ''}
                            </div>
                          </div>
                        `;
                      }).join('')}
                    </div>

                    <!-- Mobile Vertical Stepper -->
                    <div class="md:hidden space-y-4">
                      ${stages.map((stage, idx) => {
                        const isCompleted = idx <= currentStageIndex;
                        const isCurrent = idx === currentStageIndex;
                        return `
                          <div class="flex items-start gap-3">
                            <div class="w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs flex-shrink-0 ${isCompleted ? 'bg-emerald-600 text-white shadow-sm' : 'bg-slate-100 text-slate-400 border border-slate-200'}">
                              <i class="fa-solid ${stage.icon}"></i>
                            </div>
                            <div>
                              <div class="font-extrabold text-xs ${isCurrent ? 'text-emerald-700' : (isCompleted ? 'text-slate-800' : 'text-slate-400')}">
                                ${stage.label} ${isCurrent ? '📍 (الحالة الحالية)' : ''}
                              </div>
                              <div class="text-[11px] text-slate-400 mt-0.5 leading-relaxed">${stage.desc}</div>
                            </div>
                          </div>
                        `;
                      }).join('')}
                    </div>
                  </div>

                  <!-- Product & Defect Details Box -->
                  <div class="bg-slate-50 p-5 rounded-2xl border border-slate-200 mb-6">
                    <h4 class="font-black text-xs text-slate-800 mb-3 flex items-center gap-2">
                      <i class="fa-solid fa-box text-emerald-600"></i>
                      <span>بيانات المنتج والعيب المبلغ عنه:</span>
                    </h4>

                    <div class="flex items-center gap-4 mb-4">
                      <img src="${r.productImage || '/images/no-image.svg'}" class="w-16 h-16 rounded-xl object-cover border border-slate-200 shadow-sm" />
                      <div>
                        <div class="font-black text-sm text-slate-900">${r.productTitle}</div>
                        <div class="text-xs text-emerald-700 font-bold mt-1">السعر: ${r.productPrice} ج.م</div>
                        <div class="text-xs text-slate-400 mt-0.5">رقم الطلب الأصلي: #${r.orderNumber}</div>
                      </div>
                    </div>

                    <div class="bg-white p-3.5 rounded-xl border border-slate-200 mb-3">
                      <div class="text-[11px] font-bold text-slate-500 mb-1">وصف عيب الصناعة من العميل:</div>
                      <div class="text-xs text-slate-800 leading-relaxed font-semibold whitespace-pre-line">${r.description}</div>
                    </div>

                    ${r.imageUrl ? `
                      <div class="mt-3">
                        <div class="text-[11px] font-bold text-slate-500 mb-2">صورة توضيحية للمشكلة مرفقة مع الطلب:</div>
                        <a href="${r.imageUrl}" target="_blank">
                          <img src="${r.imageUrl}" class="w-32 h-32 rounded-xl object-cover border border-slate-300 shadow-sm hover:opacity-90 transition" title="انقر لتكبير الصورة" />
                        </a>
                      </div>
                    ` : ''}
                  </div>

                  <!-- Contact Info & Courier Notes -->
                  <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                    <div class="p-4 bg-slate-50 rounded-xl border border-slate-200">
                      <div class="font-bold text-slate-500 mb-1">بيانات التواصل المسجلة:</div>
                      <div class="font-extrabold text-slate-800 flex items-center gap-1.5 mt-1">
                        <i class="fa-solid fa-phone text-emerald-600"></i>
                        <span>الهاتف: ${r.phone}</span>
                      </div>
                      <div class="font-extrabold text-slate-800 flex items-center gap-1.5 mt-1">
                        <i class="fa-brands fa-whatsapp text-emerald-600"></i>
                        <span>الواتساب: ${r.whatsappPhone}</span>
                      </div>
                    </div>

                    <div class="p-4 bg-slate-50 rounded-xl border border-slate-200">
                      <div class="font-bold text-slate-500 mb-1">ملاحظات خدمة العملاء والمندوب:</div>
                      <div class="text-slate-700 font-semibold mt-1">
                        ${r.adminNotes || r.courierDetails ? `${r.adminNotes} ${r.courierDetails ? '- مندوب التوصيل: ' + r.courierDetails : ''}` : 'طلبك قيد المتابعة مع القسم الفني وشركة الشحن.'}
                      </div>
                    </div>
                  </div>
                </div>
              ` : ''}
            </div>
          </div>
        `}
      </div>
    `;
  },

  selectReturn(id) {
    this.selectedReturn = this.returns.find(r => r.id === id) || null;
    this.renderView();
    window.scrollTo({ top: 120, behavior: 'smooth' });
  },

  // Modal to submit a return for a delivered order
  async openSubmitModal(orderId, preSelectedProductId = null) {
    if (!State.user) {
      AuthModal.open('login');
      return;
    }

    try {
      App.showToast('جاري تحضير نموذج طلب الاستبدال...', 'info');
      const res = await API.get(`/orders/${orderId}`);
      if (!res.success || !res.order) {
        App.showToast('فشل جلب تفاصيل الطلب', 'error');
        return;
      }

      const order = res.order;
      if (order.status !== 'delivered') {
        App.showToast('طلب الاستبدال متاح فقط للطلبات المستلمة بنجاح (المسلمة)', 'warning');
        return;
      }

      const items = order.items || [];
      if (items.length === 0) {
        App.showToast('لا توجد منتجات في هذا الطلب', 'error');
        return;
      }

      this.uploadedDefectPhoto = '';
      const userPhone = State.user.phone || '';
      const userWhatsapp = State.user.whatsappPhone || State.user.phone || '';

      const modalHtml = `
        <form onsubmit="ReturnsPage.submitReturnForm(event, '${order.id}')" class="text-right">
          <div class="p-3 bg-amber-50 border border-amber-200 rounded-xl mb-4 text-xs font-bold text-amber-900 leading-relaxed flex items-center gap-2">
            <i class="fa-solid fa-shield-check text-amber-600 text-lg flex-shrink-0"></i>
            <span>تنبيه هام: سياسة المتجر توفر "ضمان استبدال خلال 14 يوم في حالة عيب الصناعة".</span>
          </div>

          <!-- Select Product -->
          <div class="form-group mb-3">
            <label class="form-label font-bold text-xs">المنتج المراد استبداله *</label>
            <select id="return-product-id" class="form-control text-xs font-bold" required>
              ${items.map(it => `
                <option value="${it.productId}" ${preSelectedProductId === it.productId ? 'selected' : ''}>
                  ${it.title} (${it.price} ج.م)
                </option>
              `).join('')}
            </select>
          </div>

          <!-- Phone (Mandatory) -->
          <div class="form-group mb-3">
            <label class="form-label font-bold text-xs">رقم الهاتف للتواصل * (إجباري)</label>
            <input type="tel" id="return-phone" class="form-control text-xs font-bold" value="${userPhone}" placeholder="مثال: 01012345678" required />
          </div>

          <!-- WhatsApp (Mandatory) -->
          <div class="form-group mb-3">
            <label class="form-label font-bold text-xs flex items-center gap-1.5">
              <i class="fa-brands fa-whatsapp text-emerald-600"></i>
              <span>رقم الواتساب للتواصل وإرسال الصور * (إجباري)</span>
            </label>
            <input type="tel" id="return-whatsapp" class="form-control text-xs font-bold" value="${userWhatsapp}" placeholder="مثال: 01012345678" required />
          </div>

          <!-- Defect Description (Mandatory) -->
          <div class="form-group mb-3">
            <label class="form-label font-bold text-xs">وصف عيب الصناعة بالتفصيل * (إجباري)</label>
            <textarea id="return-description" rows="3" class="form-control text-xs" placeholder="يُرجى توضيح العيب أو الخلل المصنعي الذي ظهر في المنتج بعد الاستلام بالتفصيل..." required></textarea>
          </div>

          <!-- Optional Defect Photo -->
          <div class="form-group mb-4 bg-slate-50 p-3 rounded-xl border border-slate-200">
            <label class="form-label font-bold text-xs text-slate-800 mb-1 flex items-center gap-1.5">
              <i class="fa-solid fa-camera text-emerald-600"></i>
              <span>صورة توضيحية للمشكلة (اختياري - يسرّع الموافقة)</span>
            </label>
            <input type="file" id="return-photo-input" accept="image/*" class="text-xs w-full" onchange="ReturnsPage.uploadDefectPhoto(event)" />
            <div id="return-photo-preview-box" class="hidden mt-2 flex items-center gap-2">
              <img id="return-photo-preview" src="" class="w-14 h-14 rounded-lg object-cover border border-slate-300" />
              <span class="text-[11px] text-emerald-700 font-bold">تم رفع الصورة بنجاح ✅</span>
            </div>
          </div>

          <button type="submit" class="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-black py-3.5 rounded-xl text-sm shadow-md transition">
            إرسال طلب الاستبدال الآن 🚀
          </button>
        </form>
      `;

      App.openModal(`طلب استبدال منتج (طلب #${order.orderNumber}) 🛡️`, modalHtml);
    } catch (err) {
      App.showToast(err.message || 'فشل فتح نموذج الاستبدال', 'error');
    }
  },

  async uploadDefectPhoto(e) {
    const file = e.target.files[0];
    if (!file) return;

    try {
      App.showToast('جاري رفع صورة المشكلة...', 'info');
      const res = await API.upload(file);
      if (res.success && res.url) {
        this.uploadedDefectPhoto = res.url;
        const box = document.getElementById('return-photo-preview-box');
        const img = document.getElementById('return-photo-preview');
        if (box && img) {
          img.src = res.url;
          box.classList.remove('hidden');
        }
        App.showToast('تم رفع صورة العيب بنجاح', 'success');
      }
    } catch (err) {
      App.showToast('فشل رفع الصورة', 'error');
    }
  },

  async submitReturnForm(e, orderId) {
    e.preventDefault();
    const productId = document.getElementById('return-product-id').value;
    const phone = document.getElementById('return-phone').value.trim();
    const whatsappPhone = document.getElementById('return-whatsapp').value.trim();
    const description = document.getElementById('return-description').value.trim();
    const imageUrl = this.uploadedDefectPhoto;

    if (!phone || !whatsappPhone || !description) {
      App.showToast('يُرجى إكمال جميع الحقول الإجبارية (الهاتف، الواتساب، ووصف العيب)', 'error');
      return;
    }

    try {
      App.showToast('جاري إرسال طلب الاستبدال...', 'info');
      const res = await API.post('/returns', {
        orderId,
        productId,
        defectReason: 'عيب صناعة',
        phone,
        whatsappPhone,
        description,
        imageUrl
      });

      if (res.success) {
        App.closeModal();
        App.showToast('تم إرسال طلب الاستبدال بنجاح! سيتم التواصل معك سريعاً 🛡️', 'success');
        window.location.hash = `#/returns?id=${res.returnRequest?.id}`;
        this.render(res.returnRequest?.id);
      }
    } catch (err) {
      App.showToast(err.message || 'فشل إرسال طلب الاستبدال', 'error');
    }
  }
};
