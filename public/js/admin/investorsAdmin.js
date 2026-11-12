/**
 * Suki Store Investors Management & Accounting System (نظام المستثمرين والأرباح)
 * Supports:
 * - Dedicated Investors section in Dashboard
 * - Adding investors with capital, username, password, contact details
 * - Super Admin exclusive detailed investor statement with monthly filter, cost & selling prices, units sold, and profits
 * - Investor Portal view (read-only with sales count, cost and selling prices, profits, and report export)
 * - Staff view (clean list without capital or cost price)
 */

const InvestorsAdmin = {
  investors: [],
  currentSearch: '',
  selectedMonth: 'all',
  activeInvestorId: null,
  activeInvestorData: null,

  isSuperAdminUser() {
    const u = State.user;
    if (!u) return false;
    if (u.isOwner === true) return true;
    if (u.role === 'super_admin') return true;
    const email = (u.email || '').trim().toLowerCase();
    const username = (u.username || '').trim().toLowerCase();
    if (email === 'admin@suki.store' || email === 'ahmed@suki.store') return true;
    if (username === 'admin' || username === 'ahmed') return true;
    return false;
  },

  // ----------------------------------------------------------------
  // 1. MAIN INVESTORS LIST VIEW (ADMIN & STAFF)
  // ----------------------------------------------------------------
  async render() {
    // If the logged in user is an investor, redirect to their own portal
    if (State.user && State.user.role === 'investor') {
      return this.renderInvestorPortal();
    }

    AdminLayout.render('investors', `
      <div class="py-12 text-center text-slate-400">
        <i class="fa-solid fa-spinner fa-spin text-3xl mb-3 text-emerald-600"></i>
        <div class="font-bold">جاري جلب قائمة المستثمرين...</div>
      </div>
    `);

    try {
      const res = await API.get('/investors');
      this.investors = res.investors || [];
      this.renderTable();
    } catch (err) {
      console.error('Fetch investors error:', err);
      AdminLayout.render('investors', `
        <div class="admin-card p-8 text-center text-red-600">
          <p>فشل جلب قائمة المستثمرين: ${err.message || ''}</p>
          <button onclick="InvestorsAdmin.render()" class="mt-4 px-4 py-2 bg-emerald-600 text-white rounded-lg text-xs font-bold">إعادة المحاولة</button>
        </div>
      `);
    }
  },

  renderTable() {
    const isSuper = this.isSuperAdminUser();
    let filtered = this.investors;

    if (this.currentSearch && this.currentSearch.trim()) {
      const q = this.currentSearch.trim().toLowerCase();
      filtered = filtered.filter(i => 
        (i.name && i.name.toLowerCase().includes(q)) ||
        (i.code && i.code.toLowerCase().includes(q)) ||
        (i.username && i.username.toLowerCase().includes(q)) ||
        (i.phone && i.phone.includes(q))
      );
    }

    // Calculations
    const totalInvestors = this.investors.length;
    const totalProducts = this.investors.reduce((acc, i) => acc + (Number(i.productsCount) || 0), 0);
    const totalUnitsSold = this.investors.reduce((acc, i) => acc + (Number(i.totalUnitsSold) || 0), 0);
    const totalSales = this.investors.reduce((acc, i) => acc + (Number(i.totalSales) || 0), 0);
    const totalCapital = isSuper ? this.investors.reduce((acc, i) => acc + (Number(i.capital) || 0), 0) : 0;
    const totalNetProfit = isSuper ? this.investors.reduce((acc, i) => acc + (Number(i.netProfit) || 0), 0) : 0;

    const html = `
      <div>
        <!-- Page Header -->
        <div class="flex items-center justify-between mb-6 flex-wrap gap-4">
          <div>
            <h1 class="text-2xl font-extrabold text-slate-900 flex items-center gap-2">
              <i class="fa-solid fa-user-tie text-blue-600"></i>
              <span>إدارة المستثمرين</span>
            </h1>
            <p class="text-xs text-slate-500 mt-1">
              ${isSuper 
                ? 'متابعة رؤوس الأموال المستثمرة، المنتجات الممولة، والمبيعات والأرباح التفصيلية' 
                : 'قائمة المستثمرين المسجلين والمنتجات المرتبطة بهم'}
            </p>
          </div>

          <div class="flex items-center gap-2 flex-wrap">
            <button onclick="InvestorsAdmin.openModal()" class="bg-blue-600 hover:bg-blue-700 text-white font-bold px-4 py-2.5 rounded-xl text-xs flex items-center gap-2 shadow-md transition">
              <i class="fa-solid fa-user-plus"></i>
              <span>إضافة مستثمر جديد</span>
            </button>
          </div>
        </div>

        <!-- Summary KPIs Cards -->
        <div class="grid grid-cols-1 sm:grid-cols-2 ${isSuper ? 'lg:grid-cols-4' : 'lg:grid-cols-3'} gap-4 mb-6">
          <div class="admin-card p-4 flex items-center gap-3">
            <div class="w-11 h-11 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center font-bold text-lg">
              <i class="fa-solid fa-users-line"></i>
            </div>
            <div>
              <div class="text-[11px] text-slate-500 font-bold">إجمالي المستثمرين</div>
              <div class="text-xl font-black text-slate-900">${totalInvestors} مستثمر</div>
            </div>
          </div>

          <div class="admin-card p-4 flex items-center gap-3">
            <div class="w-11 h-11 rounded-xl bg-teal-100 text-teal-600 flex items-center justify-center font-bold text-lg">
              <i class="fa-solid fa-boxes-stacked"></i>
            </div>
            <div>
              <div class="text-[11px] text-slate-500 font-bold">المنتجات الممولة</div>
              <div class="text-xl font-black text-teal-800">${totalProducts} منتج</div>
            </div>
          </div>

          <div class="admin-card p-4 flex items-center gap-3">
            <div class="w-11 h-11 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center font-bold text-lg">
              <i class="fa-solid fa-cart-shopping"></i>
            </div>
            <div>
              <div class="text-[11px] text-slate-500 font-bold">إجمالي المبيعات المسلمة</div>
              <div class="text-xl font-black text-emerald-700">${totalSales.toLocaleString('en-US')} ج.م</div>
              <div class="text-[10px] text-slate-400 font-bold">(${totalUnitsSold} قطعة مباعة)</div>
            </div>
          </div>

          ${isSuper ? `
            <div class="admin-card p-4 flex items-center gap-3 bg-gradient-to-br from-amber-50 to-orange-50 border-amber-200">
              <div class="w-11 h-11 rounded-xl bg-amber-500 text-white flex items-center justify-center font-bold text-lg shadow-sm">
                <i class="fa-solid fa-vault"></i>
              </div>
              <div>
                <div class="text-[11px] text-amber-900 font-bold">إجمالي رأس المال والأرباح</div>
                <div class="text-base font-black text-amber-950">رأس المال: ${totalCapital.toLocaleString('en-US')} ج.م</div>
                <div class="text-xs font-black text-emerald-700 mt-0.5">صافي الأرباح: ${totalNetProfit.toLocaleString('en-US')} ج.م</div>
              </div>
            </div>
          ` : ''}
        </div>

        <!-- Investors Table Card -->
        <div class="admin-card">
          <div class="admin-card-header flex flex-wrap items-center justify-between gap-3">
            <div class="flex items-center gap-3 flex-1 max-w-md">
              <input 
                type="text" 
                class="form-control text-xs" 
                placeholder="ابحث باسم المستثمر أو الكود أو رقم الهاتف..." 
                value="${this.currentSearch}" 
                oninput="InvestorsAdmin.handleSearch(this.value)"
              />
            </div>
            <div class="text-xs font-bold text-slate-500">
              عرض <span class="text-slate-900 font-black">${filtered.length}</span> من أصل ${this.investors.length} مستثمر
            </div>
          </div>

          <div class="admin-table-container">
            <table class="admin-table">
              <thead>
                <tr>
                  <th>كود المستثمر</th>
                  <th>الاسم والبيانات</th>
                  <th>بيانات الدخول</th>
                  <th>المنتجات الممولة</th>
                  <th>المبيعات المسلمة</th>
                  ${isSuper ? `
                    <th>رأس المال المستثمر</th>
                    <th>صافي الأرباح</th>
                    <th>نسبة الاسترداد</th>
                  ` : ''}
                  <th>الحالة</th>
                  <th>الإجراءات</th>
                </tr>
              </thead>
              <tbody>
                ${filtered.length === 0 ? `
                  <tr>
                    <td colspan="${isSuper ? 10 : 7}" class="text-center py-8 text-slate-400">
                      لا يوجد مستثمرون مطابقون لخيارات البحث
                    </td>
                  </tr>
                ` : filtered.map(inv => {
                  return `
                    <tr>
                      <td>
                        <span class="inline-flex items-center gap-1 font-mono font-black text-xs bg-blue-50 text-blue-800 border border-blue-200 px-2 py-0.5 rounded-lg">
                          <i class="fa-solid fa-id-badge text-[10px]"></i>
                          <span>${inv.code}</span>
                        </span>
                      </td>

                      <td>
                        <div class="font-bold text-slate-900 text-xs">${inv.name}</div>
                        <div class="text-[10px] text-slate-500 font-mono mt-0.5 flex items-center gap-2">
                          <span><i class="fa-solid fa-phone text-slate-400 ml-0.5"></i>${inv.phone || '—'}</span>
                          ${inv.whatsapp ? `<a href="https://wa.me/2${inv.whatsapp}" target="_blank" class="text-emerald-600 font-bold hover:underline"><i class="fa-brands fa-whatsapp"></i> واتساب</a>` : ''}
                        </div>
                      </td>

                      <td>
                        <div class="text-xs font-mono font-bold text-slate-700 bg-slate-50 px-2 py-0.5 rounded border border-slate-200 inline-block">
                          ${inv.username || '—'}
                        </div>
                      </td>

                      <td>
                        <a href="#/admin/products" onclick="ProductsAdmin.currentInvestorFilter='${inv.code}'; ProductsAdmin.render();" class="inline-flex items-center gap-1 text-xs font-bold text-teal-700 bg-teal-50 hover:bg-teal-100 border border-teal-200 px-2.5 py-1 rounded-lg transition" title="عرض كافة منتجات المستثمر">
                          <i class="fa-solid fa-box-open text-[10px]"></i>
                          <span>${inv.productsCount || 0} منتج</span>
                        </a>
                      </td>

                      <td>
                        <div class="font-extrabold text-xs text-slate-800">${(inv.totalSales || 0).toLocaleString('en-US')} ج.م</div>
                        <div class="text-[10px] text-slate-400 font-semibold">${inv.totalUnitsSold || 0} قطعة مباعة</div>
                      </td>

                      ${isSuper ? `
                        <td>
                          <div class="font-black text-xs text-amber-900 bg-amber-50 px-2 py-0.5 rounded border border-amber-200 inline-block">
                            ${(inv.capital || 0).toLocaleString('en-US')} ج.م
                          </div>
                        </td>

                        <td>
                          <div class="font-black text-xs ${(inv.netProfit || 0) >= 0 ? 'text-emerald-700' : 'text-red-600'}">
                            ${(inv.netProfit || 0).toLocaleString('en-US')} ج.م
                          </div>
                        </td>

                        <td>
                          <div class="flex items-center gap-1.5">
                            <div class="w-16 bg-slate-100 rounded-full h-2 overflow-hidden border border-slate-200">
                              <div class="bg-emerald-600 h-full rounded-full" style="width: ${Math.min(100, inv.capitalRecoveryPercent || 0)}%;"></div>
                            </div>
                            <span class="text-[10px] font-bold text-slate-600 font-mono">${inv.capitalRecoveryPercent || 0}%</span>
                          </div>
                        </td>
                      ` : ''}

                      <td>
                        <span class="status-pill ${inv.isActive !== false ? 'status-active' : 'status-locked'}">
                          ${inv.isActive !== false ? 'نشط' : 'معطل'}
                        </span>
                      </td>

                      <td>
                        <div class="flex items-center gap-1.5">
                          ${isSuper ? `
                            <!-- Super Admin Exclusive Detailed Statement Button -->
                            <button 
                              type="button" 
                              onclick="InvestorsAdmin.openStatement('${inv.id}')" 
                              class="bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 font-bold px-2.5 py-1 rounded-lg text-xs flex items-center gap-1 transition"
                              title="كشف حساب تفصيلي مفصل بالأرباح والمبيعات والفترة">
                              <i class="fa-solid fa-file-invoice-dollar text-[11px]"></i>
                              <span>كشف الحساب</span>
                            </button>
                            <button type="button" onclick="InvestorsAdmin.openCapitalModal('${inv.id}')" class="bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 font-bold px-2.5 py-1 rounded-lg text-xs flex items-center gap-1 transition" title="إضافة رأس مال: دفعة جديدة أو زيادة دفعة">
                              <i class="fa-solid fa-vault text-[11px]"></i>
                              <span>رأس المال</span>
                            </button>
                            <button onclick="InvestorsAdmin.editInvestor('${inv.id}')" class="btn-icon-action" title="تعديل بيانات المستثمر">
                              <i class="fa-solid fa-pen-to-square text-blue-600"></i>
                            </button>
                            <button onclick="InvestorsAdmin.deleteInvestor('${inv.id}')" class="btn-icon-action danger" title="حذف المستثمر">
                              <i class="fa-solid fa-trash text-red-600"></i>
                            </button>
                          ` : `
                            <!-- Staff View: Quick link to products -->
                            <button 
                              type="button" 
                              onclick="ProductsAdmin.currentInvestorFilter='${inv.code}'; window.location.hash='#/admin/products';" 
                              class="bg-slate-100 hover:bg-slate-200 text-slate-700 px-2 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1">
                              <i class="fa-solid fa-eye text-slate-500"></i>
                              <span>المنتجات</span>
                            </button>
                          `}
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

    AdminLayout.render('investors', html);
  },

  handleSearch(val) {
    this.currentSearch = val;
    this.renderTable();
  },

  // ----------------------------------------------------------------
  // 2. ADD / EDIT INVESTOR MODAL
  // ----------------------------------------------------------------
  openModal(investor = null) {
    const isSuper = this.isSuperAdminUser();
    const isEdit = Boolean(investor);

    const modalBody = `
      <form onsubmit="InvestorsAdmin.submitForm(event)" class="text-right">
        <input type="hidden" id="inv-id" value="${investor ? investor.id : ''}" />

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
          <div class="form-group">
            <label class="form-label text-xs font-bold text-slate-700">كود المستثمر *</label>
            <input 
              type="text" 
              id="inv-code" 
              class="form-control text-xs font-mono font-bold uppercase" 
              value="${investor ? investor.code : ''}" 
              placeholder="يُنشأ تلقائياً (مثل INV-101) إذا ترك فارغاً" 
            />
          </div>

          <div class="form-group">
            <label class="form-label text-xs font-bold text-slate-700">اسم المستثمر بالكامل *</label>
            <input 
              type="text" 
              id="inv-name" 
              class="form-control text-xs font-bold" 
              value="${investor ? investor.name : ''}" 
              placeholder="الاسم الثلاثي أو اسم الجهة..." 
              required 
            />
          </div>
        </div>

        <!-- Capital & profit share (Super Admin only) -->
        ${isSuper ? `
          <div class="bg-amber-50/70 border border-amber-200 p-3 rounded-xl mb-3 space-y-3">
            ${isEdit && Array.isArray(investor.capitalBatches) && investor.capitalBatches.length ? `
              <div>
                <div class="text-xs font-black text-amber-950 flex items-center gap-1.5"><i class="fa-solid fa-vault text-amber-600"></i> رأس المال: ${(investor.capital || 0).toLocaleString('en-US')} ج.م في ${investor.capitalBatches.length} دفعة</div>
                <div class="text-[10px] text-amber-800 mt-1">لزيادة رأس المال أو إضافة دفعة جديدة استخدم زر <b>"رأس المال"</b> في جدول المستثمرين (رأس المال القديم لا يُمسح أبداً).</div>
              </div>
            ` : `
              <div class="form-group mb-0">
                <label class="form-label text-xs font-black text-amber-950 flex items-center gap-1.5">
                  <i class="fa-solid fa-vault text-amber-600"></i>
                  <span>${isEdit ? 'رأس المال (ج.م)' : 'رأس المال الأول (ج.م)'} — سوبر أدمن فقط</span>
                </label>
                <input type="number" id="inv-capital" class="form-control text-xs font-black text-amber-900 bg-white"
                  value="${investor && investor.capital !== undefined ? investor.capital : 0}" min="0" step="1" placeholder="مثال: 20000" />
                <span class="text-[10px] text-amber-800 font-semibold mt-1 block">بعد كده أي رأس مال جديد يتسجل كدفعة منفصلة أو زيادة على دفعة.</span>
              </div>
            `}
            <div class="form-group mb-0">
              <label class="form-label text-xs font-black text-amber-950">نسبة المستثمر من الربح (%)</label>
              <input type="number" id="inv-share" class="form-control text-xs font-black bg-white" min="0" max="100" step="1"
                value="${investor && investor.profitSharePercent !== undefined && investor.profitSharePercent !== null ? investor.profitSharePercent : ''}"
                placeholder="فارغ = النسبة الافتراضية من إعدادات المتجر" />
              <span class="text-[10px] text-amber-800 font-semibold mt-1 block">المستثمر بياخد سعر التكلفة + النسبة دي من (سعر البيع − التكلفة). الباقي ربحك.</span>
            </div>
          </div>
        ` : ''}
        <!-- Credentials for Login -->
        <div class="bg-slate-50 border border-slate-200 p-3 rounded-xl mb-3">
          <label class="form-label text-xs font-extrabold text-slate-800 mb-2 flex items-center gap-1.5">
            <i class="fa-solid fa-key text-blue-600"></i>
            <span>بيانات تسجيل دخول المستثمر لحسابه</span>
          </label>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div class="form-group">
              <label class="form-label text-xs font-bold text-slate-600">اسم المستخدم (Username) *</label>
              <input 
                type="text" 
                id="inv-username" 
                class="form-control text-xs font-mono font-bold" 
                value="${investor ? (investor.username || '') : ''}" 
                placeholder="مثال: investor_ahmed" 
                required 
              />
            </div>
            <div class="form-group">
              <label class="form-label text-xs font-bold text-slate-600">كلمة المرور ${isEdit ? '(اتركها فارغة للإبقاء على الحالية)' : '*'}</label>
              <input 
                type="password" 
                id="inv-password" 
                class="form-control text-xs font-mono" 
                placeholder="8 أحرف على الأقل" 
                minlength="8"
                ${isEdit ? '' : 'required'} 
              />
            </div>
          </div>
        </div>

        <!-- Contact Info -->
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
          <div class="form-group">
            <label class="form-label text-xs font-bold text-slate-700">رقم الهاتف *</label>
            <input 
              type="text" 
              id="inv-phone" 
              class="form-control text-xs font-mono" 
              value="${investor ? (investor.phone || '') : ''}" 
              placeholder="010XXXXXXXX" 
              required 
            />
          </div>
          <div class="form-group">
            <label class="form-label text-xs font-bold text-slate-700">رقم الواتساب</label>
            <input 
              type="text" 
              id="inv-whatsapp" 
              class="form-control text-xs font-mono" 
              value="${investor ? (investor.whatsapp || '') : ''}" 
              placeholder="010XXXXXXXX" 
            />
          </div>
        </div>

        <div class="form-group mb-3">
          <label class="form-label text-xs font-bold text-slate-700">ملاحظات سرية حول الاتفاق ونسبة الأرباح</label>
          <textarea id="inv-notes" rows="2" class="form-control text-xs" placeholder="أي تفاصيل أو ملاحظات خاصة بالاتفاق...">${investor ? (investor.notes || '') : ''}</textarea>
        </div>

        <div class="form-group mb-4">
          <label class="flex items-center gap-2 text-xs font-bold cursor-pointer">
            <input type="checkbox" id="inv-active" ${!investor || investor.isActive !== false ? 'checked' : ''} class="accent-blue-600 w-4 h-4" />
            <span>حساب المستثمر مفعّل ونشط ✅</span>
          </label>
        </div>

        <button type="submit" class="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3.5 rounded-xl text-xs shadow-md transition">
          ${isEdit ? 'حفظ تعديلات المستثمر' : 'تسجيل المستثمر وإنشاء الحساب'}
        </button>
      </form>
    `;

    App.openModal(isEdit ? 'تعديل بيانات المستثمر' : 'إضافة مستثمر جديد ورأس المال', modalBody);
  },

  async submitForm(e) {
    e.preventDefault();
    const id = document.getElementById('inv-id')?.value;
    const code = document.getElementById('inv-code')?.value.trim();
    const name = document.getElementById('inv-name')?.value.trim();
    const capitalInput = document.getElementById('inv-capital');
    const capital = capitalInput ? (typeof Utils !== 'undefined' ? Utils.parseNumber(capitalInput.value, 0) : Number(capitalInput.value || 0)) : undefined;
    const username = document.getElementById('inv-username')?.value.trim();
    const password = document.getElementById('inv-password')?.value;
    const phone = document.getElementById('inv-phone')?.value.trim();
    const whatsapp = document.getElementById('inv-whatsapp')?.value.trim();
    const notes = document.getElementById('inv-notes')?.value.trim();
    const isActive = document.getElementById('inv-active')?.checked ?? true;

    if (!name || !username || !phone) {
      App.showToast('يُرجى ملء كافة الحقول الإجبارية', 'warning');
      return;
    }

    const shareInput = document.getElementById('inv-share');
    const payload = {
      code,
      customCode: code || undefined,
      name,
      username,
      password: password || undefined,
      phone,
      whatsapp,
      notes,
      isActive
    };
    if (capital !== undefined) {
      payload.capital = capital;
    }
    if (shareInput) {
      payload.profitSharePercent = shareInput.value === '' ? '' : Number(shareInput.value);
    }
    if (password && password.length < 8) {
      App.showToast('كلمة المرور يجب أن تكون 8 أحرف على الأقل', 'warning');
      return;
    }

    try {
      if (id) {
        const res = await API.put(`/investors/${id}`, payload);
        if (res.success) {
          App.closeModal();
          App.showToast('تم تحديث بيانات المستثمر بنجاح ✅', 'success');
          this.render();
        }
      } else {
        const res = await API.post('/investors', payload);
        if (res.success) {
          App.closeModal();
          App.showToast(`تم تسجيل المستثمر "${name}" بنجاح وتوليد الكود ${res.investor.code} 🎉`, 'success');
          this.render();
        }
      }
    } catch (err) {
      App.showToast(err.message || 'فشل حفظ بيانات المستثمر', 'error');
    }
  },

  editInvestor(id) {
    const inv = this.investors.find(x => x.id === id);
    if (inv) this.openModal(inv);
  },

  // Capital: new separate batch, or add to an existing batch (old capital is never overwritten)
  openCapitalModal(id) {
    const inv = this.investors.find(x => x.id === id);
    if (!inv) return;
    const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const batches = Array.isArray(inv.capitalBatches) ? inv.capitalBatches : [];
    App.openModal(`رأس مال المستثمر: ${esc(inv.name)}`, `
      <form onsubmit="InvestorsAdmin.submitCapital(event, '${inv.id}')" class="text-right text-xs space-y-3" dir="rtl">
        <div class="bg-slate-50 border border-slate-200 rounded-xl overflow-hidden">
          <div class="px-3 py-2 font-extrabold text-slate-800">الإجمالي الحالي: ${(inv.capital || 0).toLocaleString('en-US')} ج.م</div>
          ${batches.length ? `<table class="w-full text-[11px]"><thead class="text-slate-500"><tr><th class="p-2 text-right">الدفعة</th><th class="p-2">المبلغ</th><th class="p-2">مسترد</th></tr></thead><tbody class="divide-y divide-slate-100">
            ${batches.map(b => `<tr><td class="p-2 font-bold">${esc(b.label)}</td><td class="p-2 text-center">${(b.amount || 0).toLocaleString('en-US')}</td><td class="p-2 text-center">${b.recoveryPercent || 0}%</td></tr>`).join('')}
          </tbody></table>` : '<div class="px-3 pb-2 text-slate-500">لا توجد دفعات بعد</div>'}
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <label class="flex items-start gap-2 p-3 rounded-xl border border-slate-200 cursor-pointer">
            <input type="radio" name="cap-mode" value="new" checked onchange="document.getElementById('cap-batch-row').classList.add('hidden'); document.getElementById('cap-label-row').classList.remove('hidden');" class="mt-0.5 accent-blue-600" />
            <span><b class="block text-slate-800">رأس مال جديد منفصل</b><span class="text-slate-500">دفعة مستقلة تتحسب لوحدها</span></span>
          </label>
          <label class="flex items-start gap-2 p-3 rounded-xl border border-slate-200 ${batches.length ? 'cursor-pointer' : 'opacity-50'}">
            <input type="radio" name="cap-mode" value="add" ${batches.length ? '' : 'disabled'} onchange="document.getElementById('cap-batch-row').classList.remove('hidden'); document.getElementById('cap-label-row').classList.add('hidden');" class="mt-0.5 accent-blue-600" />
            <span><b class="block text-slate-800">إضافة على دفعة سابقة</b><span class="text-slate-500">مبلغ سالب = تصحيح بالنقص</span></span>
          </label>
        </div>
        <div id="cap-label-row" class="form-group mb-0">
          <label class="form-label">اسم الدفعة الجديدة (اختياري)</label>
          <input type="text" id="cap-label" class="form-control text-xs" placeholder="مثال: بضاعة رمضان" />
        </div>
        <div id="cap-batch-row" class="form-group mb-0 hidden">
          <label class="form-label">الدفعة</label>
          <select id="cap-batch" class="form-control text-xs">${batches.map((b, i) => `<option value="${esc(b.id)}" ${i === batches.length - 1 ? 'selected' : ''}>${esc(b.label)} — ${(b.amount || 0).toLocaleString('en-US')} ج.م</option>`).join('')}</select>
        </div>
        <div class="form-group mb-0">
          <label class="form-label">المبلغ (ج.م) *</label>
          <input type="number" id="cap-amount" class="form-control text-xs font-black" step="1" required />
        </div>
        <div class="form-group mb-0">
          <label class="form-label">ملاحظة</label>
          <input type="text" id="cap-note" class="form-control text-xs" placeholder="سبب الإضافة أو التصحيح" />
        </div>
        <button type="submit" class="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl">حفظ رأس المال</button>
      </form>
    `);
  },

  async submitCapital(e, id) {
    e.preventDefault();
    const mode = document.querySelector('input[name="cap-mode"]:checked')?.value || 'new';
    const payload = {
      mode,
      amount: Number(document.getElementById('cap-amount')?.value),
      label: document.getElementById('cap-label')?.value || '',
      batchId: mode === 'add' ? document.getElementById('cap-batch')?.value : undefined,
      note: document.getElementById('cap-note')?.value || ''
    };
    try {
      const res = await API.post(`/investors/${id}/capital`, payload);
      if (res.success) {
        App.closeModal();
        App.showToast(res.message, 'success');
        this.render();
      }
    } catch (err) {
      App.showToast(err.message || 'فشل حفظ رأس المال', 'error');
    }
  },

  deleteInvestor(id) {
    const inv = this.investors.find(x => x.id === id);
    const name = inv ? inv.name : '';
    App.confirm(`هل أنت متأكد من حذف المستثمر "${name}" نهائياً؟ سيتم إلغاء ربط منتجاته ولكن لن تُحذف المنتجات.`, async () => {
      try {
        const res = await API.delete(`/investors/${id}`);
        if (res.success) {
          App.showToast('تم حذف المستثمر بنجاح', 'success');
          this.render();
        }
      } catch (err) {
        App.showToast(err.message, 'error');
      }
    });
  },

  // ----------------------------------------------------------------
  // 3. SUPER ADMIN EXCLUSIVE DETAILED STATEMENT PAGE
  // ----------------------------------------------------------------
  async openStatement(investorId, month = 'all') {
    if (!this.isSuperAdminUser()) {
      App.showToast('صفحة كشف حساب المستثمر التفصيلي مقتصرة على السوبر أدمن فقط (محمد حكيم وأحمد غريب)', 'error');
      return;
    }

    this.activeInvestorId = investorId;
    this.selectedMonth = month;

    AdminLayout.render('investors', `
      <div class="py-12 text-center text-slate-400">
        <i class="fa-solid fa-spinner fa-spin text-3xl mb-3 text-blue-600"></i>
        <div class="font-bold">جاري تحميل كشف الحساب المالي التفصيلي للمستثمر...</div>
      </div>
    `);

    try {
      const query = month && month !== 'all' ? `?month=${month}` : '';
      const res = await API.get(`/investors/${investorId}${query}`);
      this.activeInvestorData = res;
      this.renderStatementView();
    } catch (err) {
      App.showToast(err.message || 'فشل تحميل كشف الحساب', 'error');
      this.render();
    }
  },

  renderStatementView() {
    const data = this.activeInvestorData;
    if (!data || !data.investor) return;

    const inv = data.investor;
    const stats = data.stats || {};
    const products = data.products || [];
    const expenses = data.expenses || [];

    // Monthly dropdown options (current year and previous year months)
    const currentYear = new Date().getFullYear();
    const months = [];
    for (let m = 12; m >= 1; m--) {
      const mm = m < 10 ? `0${m}` : `${m}`;
      months.push(`${currentYear}-${mm}`);
    }

    const html = `
      <div class="investor-statement-container">
        <!-- Breadcrumb & Back -->
        <div class="flex items-center justify-between mb-4 flex-wrap gap-2">
          <div class="flex items-center gap-2 text-xs font-bold text-slate-500">
            <a href="#/admin/investors" onclick="InvestorsAdmin.render()" class="hover:text-blue-600 flex items-center gap-1">
              <i class="fa-solid fa-arrow-right"></i>
              <span>العودة لقائمة المستثمرين</span>
            </a>
            <span>/</span>
            <span class="text-slate-800">كشف حساب المستثمر: ${inv.name} (${inv.code})</span>
          </div>

          <div class="flex items-center gap-2">
            <!-- Print Report Button -->
            ${ExportKit.buttons('.investor-statement-container', `كشف حساب المستثمر ${inv.name || ''}`, { excel: true })}
            <button onclick="ExportKit.print('.investor-statement-container', 'كشف حساب المستثمر')" class="hidden">
              <i class="fa-solid fa-print text-slate-500"></i>
              <span>طباعة كشف الحساب</span>
            </button>
            <a href="#/admin/products" onclick="ProductsAdmin.currentInvestorFilter='${inv.code}'; ProductsAdmin.render();" class="bg-teal-50 hover:bg-teal-100 text-teal-800 border border-teal-200 px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5">
              <i class="fa-solid fa-box-open"></i>
              <span>عرض المنتجات في المتجر</span>
            </a>
          </div>
        </div>

        <!-- Investor Profile Banner -->
        <div class="bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 text-white p-6 rounded-2xl mb-6 shadow-lg border border-blue-900/50">
          <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div class="flex items-center gap-4">
              <div class="w-14 h-14 rounded-2xl bg-blue-600/30 border border-blue-400/40 flex items-center justify-center text-2xl font-black text-blue-300 shadow-inner">
                <i class="fa-solid fa-user-tie"></i>
              </div>
              <div>
                <div class="flex items-center gap-2 flex-wrap">
                  <h1 class="text-xl font-black text-white">${inv.name}</h1>
                  <span class="bg-blue-500/30 text-blue-200 border border-blue-400/30 font-mono font-bold text-xs px-2 py-0.5 rounded-lg">${inv.code}</span>
                  <span class="bg-amber-500/20 text-amber-300 border border-amber-400/30 text-[10px] font-bold px-2 py-0.5 rounded-full">سوبر أدمن حصري 🔒</span>
                </div>
                <div class="text-xs text-blue-200/80 mt-1 flex items-center gap-4 flex-wrap font-mono">
                  <span><i class="fa-solid fa-user ml-1 text-blue-400"></i>${inv.username || 'بدون مستخدم'}</span>
                  <span><i class="fa-solid fa-phone ml-1 text-blue-400"></i>${inv.phone || 'بدون هاتف'}</span>
                  <span><i class="fa-regular fa-calendar ml-1 text-blue-400"></i>تاريخ الانضمام: ${(inv.createdAt || '').slice(0, 10)}</span>
                </div>
              </div>
            </div>

            <!-- Month Filter Dropdown -->
            <div class="bg-white/10 backdrop-blur-sm p-3 rounded-xl border border-white/10 flex items-center gap-2">
              <label class="text-xs font-bold text-blue-200 whitespace-nowrap">
                <i class="fa-solid fa-filter text-amber-400 ml-1"></i>الفلترة بالشهر:
              </label>
              <select 
                class="form-control text-xs font-bold bg-slate-800 text-white border-blue-400/30" 
                onchange="InvestorsAdmin.openStatement('${inv.id}', this.value)">
                <option value="all" ${this.selectedMonth === 'all' ? 'selected' : ''}>كل الفترات (الإجمالي التراكمي)</option>
                ${months.map(m => `
                  <option value="${m}" ${this.selectedMonth === m ? 'selected' : ''}>شهر ${m}</option>
                `).join('')}
              </select>
            </div>
          </div>
        </div>

        <!-- Financial Statement Accounting Cards -->
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 mb-6">
          <!-- Capital -->
          <div class="admin-card p-4 bg-gradient-to-br from-amber-500 to-amber-600 text-white shadow-md">
            <div class="text-[11px] font-bold text-amber-100 flex items-center justify-between">
              <span>رأس المال المدخل</span>
              <i class="fa-solid fa-vault text-amber-200"></i>
            </div>
            <div class="text-2xl font-black mt-1">${(stats.capital || 0).toLocaleString('en-US')} ج.م</div>
            <div class="text-[10px] text-amber-100 mt-1">المبلغ المخصص لشراء البضاعة</div>
          </div>

          <!-- Total Sales -->
          <div class="admin-card p-4 bg-gradient-to-br from-blue-600 to-indigo-700 text-white shadow-md">
            <div class="text-[11px] font-bold text-blue-100 flex items-center justify-between">
              <span>إجمالي المبيعات</span>
              <i class="fa-solid fa-cart-shopping text-blue-200"></i>
            </div>
            <div class="text-2xl font-black mt-1">${(stats.totalSales || 0).toLocaleString('en-US')} ج.م</div>
            <div class="text-[10px] text-blue-100 mt-1">إجمالي ما بيع من منتجاته</div>
          </div>

          <!-- Total Cost of Sold -->
          <div class="admin-card p-4 bg-gradient-to-br from-slate-700 to-slate-800 text-white shadow-md">
            <div class="text-[11px] font-bold text-slate-300 flex items-center justify-between">
              <span>تكلفة القطع المباعة</span>
              <i class="fa-solid fa-tags text-slate-400"></i>
            </div>
            <div class="text-2xl font-black mt-1">${(stats.totalCostOfSold || 0).toLocaleString('en-US')} ج.م</div>
            <div class="text-[10px] text-slate-300 mt-1">سعر التكلفة للكميات المباعة</div>
          </div>

          <!-- Shared Expenses -->
          <div class="admin-card p-4 bg-gradient-to-br from-rose-600 to-rose-700 text-white shadow-md">
            <div class="text-[11px] font-bold text-rose-100 flex items-center justify-between">
              <span>حصة المصروفات المشتركة</span>
              <i class="fa-solid fa-receipt text-rose-200"></i>
            </div>
            <div class="text-2xl font-black mt-1">${(stats.totalExpenses || 0).toLocaleString('en-US')} ج.م</div>
            <div class="text-[10px] text-rose-100 mt-1">${expenses.length} بنود مقتطعة بعد الربح</div>
          </div>

          <!-- Net Profit -->
          <div class="admin-card p-4 bg-gradient-to-br ${(stats.netProfit || 0) >= 0 ? 'from-emerald-600 to-teal-700' : 'from-red-600 to-rose-700'} text-white shadow-md">
            <div class="text-[11px] font-bold text-white/90 flex items-center justify-between">
              <span>صافي الأرباح</span>
              <i class="fa-solid fa-chart-line text-white"></i>
            </div>
            <div class="text-2xl font-black mt-1">${(stats.netProfit || 0).toLocaleString('en-US')} ج.م</div>
            <div class="text-[10px] text-white/80 mt-1">المبيعات - التكلفة - المصروفات</div>
          </div>

          <!-- Capital Recovery % -->
          <div class="admin-card p-4 bg-white border border-slate-200 shadow-sm flex flex-col justify-between">
            <div class="text-[11px] font-bold text-slate-500 flex items-center justify-between">
              <span>نسبة استرداد رأس المال</span>
              <i class="fa-solid fa-percent text-blue-600"></i>
            </div>
            <div class="text-2xl font-black text-slate-900 mt-1">${stats.capitalRecoveryPercent || 0}%</div>
            <div class="w-full bg-slate-100 rounded-full h-2 mt-1.5 overflow-hidden border border-slate-200">
              <div class="bg-blue-600 h-full rounded-full" style="width: ${Math.min(100, stats.capitalRecoveryPercent || 0)}%;"></div>
            </div>
          </div>
        </div>

          ${this.renderInvestorAccountBlocks(data)}

        <!-- Products Accounting Breakdown Table -->
        <div class="admin-card">
          <div class="admin-card-header flex items-center justify-between flex-wrap gap-2">
            <div>
              <h3 class="font-extrabold text-slate-900 text-sm flex items-center gap-2">
                <i class="fa-solid fa-table-list text-blue-600"></i>
                <span>تفاصيل حسابات كل منتج مموّل (${products.length} منتج)</span>
              </h3>
              <p class="text-[11px] text-slate-400 mt-0.5">
                الفترة المحددة: <span class="font-bold text-blue-700">${this.selectedMonth === 'all' ? 'كافة الفترات' : 'شهر ' + this.selectedMonth}</span>
              </p>
            </div>
            <div class="text-xs font-bold text-slate-600 bg-slate-50 px-3 py-1 rounded-lg border border-slate-200">
              إجمالي القطع المباعة: <span class="text-emerald-700 font-black">${stats.totalUnitsSold || 0} قطعة</span>
            </div>
          </div>

          <div class="admin-table-container">
            <table class="admin-table">
              <thead>
                <tr>
                  <th>صورة المنتج</th>
                  <th>اسم المنتج</th>
                  <th>المخزون المتبقي</th>
                  <th>سعر التكلفة (الشراء)</th>
                  <th>سعر البيع للعميل</th>
                  <th>عدد مرات البيع (الكمية المباعة)</th>
                  <th>إجمالي المبيعات</th>
                  <th>إجمالي التكلفة</th>
                  <th>صافي الربح</th>
                  <th>هامش الربح</th>
                </tr>
              </thead>
              <tbody>
                ${products.length === 0 ? `
                  <tr>
                    <td colspan="10" class="text-center py-8 text-slate-400">لا توجد منتجات مسجلة باسم هذا المستثمر حتى الآن</td>
                  </tr>
                ` : products.map(p => {
                  return `
                    <tr>
                      <td>
                        <img src="${p.image || '/images/no-image.svg'}" class="w-10 h-10 rounded-lg object-cover border border-slate-200" />
                      </td>

                      <td>
                        <div class="font-bold text-slate-800 text-xs max-w-xs truncate">${p.title}</div>
                        <div class="text-[10px] text-slate-400 font-mono mt-0.5">كود المنتج: ${p.id.slice(0, 8)}</div>
                      </td>

                      <td>
                        <span class="font-bold text-xs text-slate-700 bg-slate-50 px-2 py-0.5 rounded border border-slate-200">${p.stock} قطعة</span>
                      </td>

                      <td>
                        <span class="font-bold text-xs text-amber-800 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                          ${p.costPrice} ج.م
                        </span>
                      </td>

                      <td>
                        <span class="font-black text-xs text-emerald-700">
                          ${p.price} ج.م
                        </span>
                        ${p.compareAtPrice ? `<span class="text-[10px] text-slate-400 line-through block">${p.compareAtPrice} ج.م</span>` : ''}
                      </td>

                      <td>
                        <span class="font-black text-xs text-blue-700 bg-blue-50 px-2.5 py-1 rounded-lg border border-blue-200">
                          ${p.unitsSold} مرة
                        </span>
                      </td>

                      <td>
                        <span class="font-bold text-xs text-slate-900">${(p.totalSales || 0).toLocaleString('en-US')} ج.م</span>
                      </td>

                      <td>
                        <span class="font-bold text-xs text-slate-600">${(p.totalCost || 0).toLocaleString('en-US')} ج.م</span>
                      </td>

                      <td>
                        <span class="font-black text-xs ${(p.profit || 0) >= 0 ? 'text-emerald-700' : 'text-red-600'}">
                          ${(p.profit || 0).toLocaleString('en-US')} ج.م
                        </span>
                      </td>

                      <td>
                        <span class="font-mono text-xs font-bold text-purple-700 bg-purple-50 px-2 py-0.5 rounded border border-purple-200">
                          ${p.marginPercent || 0}%
                        </span>
                      </td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>

          <!-- Bottom Financial Summary Note -->
          <div class="p-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
            <div class="text-slate-600">
              <span class="font-bold text-slate-800">ملاحظة الحساب:</span>
              يتم احتساب الأرباح والمبيعات فور تسليم الطلب للعميل (Delivered Orders).
            </div>
            <div class="flex items-center gap-3 font-mono font-bold">
              <span>إجمالي المبيعات: <strong class="text-blue-800">${(stats.totalSales || 0).toLocaleString('en-US')} ج.م</strong></span>
              <span>—</span>
              <span>صافي الأرباح: <strong class="text-emerald-700">${(stats.netProfit || 0).toLocaleString('en-US')} ج.م</strong></span>
            </div>
          </div>
        </div>

        <!-- Shared Expenses & Deductions Breakdown Table -->
        <div class="admin-card mt-6">
          <div class="admin-card-header flex items-center justify-between flex-wrap gap-2">
            <div>
              <h3 class="font-extrabold text-slate-900 text-sm flex items-center gap-2">
                <i class="fa-solid fa-receipt text-rose-600"></i>
                <span>سجل المصروفات والإيرادات المشتركة للمستثمر (${expenses.length} بند)</span>
              </h3>
              <p class="text-[11px] text-slate-400 mt-0.5">تتقاسم هذه البنود بين المتجر والمستثمر بنسبة محددة وتخصم بعد حساب الربح الإجمالي</p>
            </div>
            <div class="text-xs font-bold text-rose-700 bg-rose-50 px-3 py-1 rounded-lg border border-rose-200">
              إجمالي حصة المستثمر من المصروفات: <span class="font-black">${(stats.totalExpenses || 0).toLocaleString('en-US')} ج.م</span>
            </div>
          </div>

          <div class="admin-table-container">
            <table class="admin-table">
              <thead>
                <tr>
                  <th>البند / الوصف</th>
                  <th>النوع</th>
                  <th>التصنيف</th>
                  <th>إجمالي المبلغ</th>
                  <th>نسبة المستثمر (%)</th>
                  <th>حصة المستثمر</th>
                  <th>تاريخ القيد</th>
                  <th>ملاحظات</th>
                </tr>
              </thead>
              <tbody>
                ${expenses.length === 0 ? `
                  <tr>
                    <td colspan="8" class="text-center py-8 text-slate-400">لا توجد بنود مصروفات أو إيرادات مشتركة مسجلة على هذا المستثمر</td>
                  </tr>
                ` : expenses.map(exp => `
                  <tr>
                    <td>
                      <div class="font-extrabold text-slate-800 text-xs">${exp.title}</div>
                    </td>
                    <td>
                      <span class="font-bold text-xs px-2 py-0.5 rounded ${exp.type === 'revenue' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'}">
                        ${exp.type === 'revenue' ? '📈 إيراد (إضافة)' : '📉 مصروف (خصم)'}
                      </span>
                    </td>
                    <td><span class="font-bold text-xs text-slate-600">${exp.category || 'عام'}</span></td>
                    <td><span class="font-bold text-xs text-slate-800">${(exp.amount || 0).toLocaleString('en-US')} ج.م</span></td>
                    <td><span class="font-mono text-xs font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">${exp.sharePercent !== undefined ? exp.sharePercent : 50}%</span></td>
                    <td><span class="font-black text-xs ${exp.type === 'revenue' ? 'text-emerald-700' : 'text-rose-700'}">${(exp.investorShare || 0).toLocaleString('en-US')} ج.م</span></td>
                    <td><span class="font-mono text-xs text-slate-500">${new Date(exp.date).toLocaleDateString('ar-EG')}</span></td>
                    <td><span class="text-xs text-slate-500">${exp.notes || '-'}</span></td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;

    AdminLayout.render('investors', html);
  },

  // ----------------------------------------------------------------
  // 4. INVESTOR PORTAL VIEW (WHEN INVESTOR LOGS IN)
  // ----------------------------------------------------------------
  // Profit breakdown, paid / remaining, his orders and payouts (investor portal + admin statement)
  renderInvestorAccountBlocks(data) {
    const s = data.stats || {};
    const acc = data.account;
    if (!acc) return '';
    const esc = v => String(v === undefined || v === null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const m = n => `${(Number(n) || 0).toLocaleString('en-US')} ج.م`;
    const orders = data.orders || [];
    const payouts = data.payouts || [];
    const remaining = Number(acc.remaining) || 0;
    const statusCls = { pending: 'bg-slate-100 text-slate-700', processing: 'bg-blue-50 text-blue-700', shipped: 'bg-amber-50 text-amber-700', delivered: 'bg-emerald-50 text-emerald-700', cancelled: 'bg-rose-50 text-rose-700' };
    return `
      <div class="admin-card p-4 mb-6">
        <h3 class="font-extrabold text-slate-900 text-sm mb-3"><i class="fa-solid fa-calculator text-blue-600"></i> حساب أرباحك بالتفصيل (نسبتك ${s.profitSharePercent ?? '-'}%)</h3>
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-2 text-xs font-bold">
          <div class="bg-blue-50 rounded-xl p-3"><div class="text-blue-700">نصيبك من الربح قبل الخصومات</div><div class="text-base font-black text-blue-800">${m(s.investorProfitBeforeDiscounts)}</div><div class="text-[10px] text-blue-600 font-semibold">(البيع − التكلفة) × ${s.profitSharePercent ?? '-'}%</div></div>
          <div class="bg-amber-50 rounded-xl p-3"><div class="text-amber-700">− حصتك من الخصومات</div><div class="text-base font-black text-amber-800">${m(s.discountShare)}</div><div class="text-[10px] text-amber-700 font-semibold">كوبونات ${m(s.couponShare)} • نقاط ولاء ${m(s.loyaltyShare)}</div></div>
          <div class="bg-rose-50 rounded-xl p-3"><div class="text-rose-700">− حصتك من المصروفات</div><div class="text-base font-black text-rose-800">${m(s.totalExpenses)}</div>${s.totalRevenues ? `<div class="text-[10px] text-emerald-700 font-semibold">+ إيرادات ${m(s.totalRevenues)}</div>` : ''}</div>
          <div class="bg-emerald-50 rounded-xl p-3"><div class="text-emerald-700">= صافي ربحك</div><div class="text-base font-black text-emerald-800">${m(s.netProfit)}</div></div>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs font-bold mt-3">
          <div class="border border-slate-200 rounded-xl p-3"><div class="text-slate-500">إجمالي مستحقاتك (التكلفة + صافي ربحك)</div><div class="text-base font-black text-slate-800">${m(acc.lifetimeDues)}</div></div>
          <div class="border border-slate-200 rounded-xl p-3"><div class="text-slate-500">اتورّدلك</div><div class="text-base font-black text-teal-700">${m(acc.totalPaid)}</div></div>
          ${remaining >= 0
            ? `<div class="border border-amber-200 bg-amber-50/40 rounded-xl p-3"><div class="text-amber-700">لسه ليك</div><div class="text-base font-black text-amber-800">${m(remaining)}</div></div>`
            : `<div class="border border-rose-200 bg-rose-50/40 rounded-xl p-3"><div class="text-rose-700">اتورّدلك زيادة</div><div class="text-base font-black text-rose-800">${m(-remaining)}</div><div class="text-[10px] text-rose-600 font-semibold">هتتخصم من مستحقاتك الجاية</div></div>`}
        </div>
        <p class="text-[10.5px] text-slate-400 mt-2">المستحقات واللي اتورّد إجمالي من أول يوم (مش متأثرين بفلتر الشهر). الطلبات القديمة قبل 11/11/2026 كانت الخصومات فيها على المتجر بالكامل.</p>
      </div>

      ${(data.capitalBatches || []).length ? `
      <div class="admin-card mb-6">
        <div class="admin-card-header"><h3 class="font-extrabold text-slate-900 text-sm"><i class="fa-solid fa-vault text-amber-500"></i> دفعات رأس المال — كل دفعة ليها حسابها (${data.capitalBatches.length})</h3></div>
        <div class="admin-table-container">
          <table class="admin-table">
            <thead><tr><th>الدفعة</th><th>رأس المال</th><th>قطع اتباعت</th><th>رجع من رأس المال</th><th>لسه في البضاعة</th><th>الربح قبل الخصومات</th><th>− الخصومات</th><th>− المصروفات</th><th>صافي الربح</th><th>مستحقات الدفعة</th></tr></thead>
            <tbody>
              ${data.capitalBatches.map(b => `
                <tr>
                  <td class="text-xs"><div class="font-bold">${esc(b.label)}</div><div class="text-[10px] text-slate-400">${b.createdAt ? new Date(b.createdAt).toLocaleDateString('ar-EG') : ''}</div></td>
                  <td class="text-xs font-black text-amber-700">${m(b.amount)}</td>
                  <td class="text-xs font-bold">${b.unitsSold}</td>
                  <td class="text-xs"><b>${m(b.costRecovered)}</b><div class="w-20 bg-slate-100 rounded-full h-1.5 mt-1"><div class="bg-blue-600 h-full rounded-full" style="width:${Math.min(100, b.recoveryPercent || 0)}%"></div></div><span class="text-[10px] text-slate-400">${b.recoveryPercent || 0}%</span></td>
                  <td class="text-xs">${m(b.capitalStillInGoods)}</td>
                  <td class="text-xs text-blue-700 font-bold">${m(b.investorProfitBeforeDiscounts)}</td>
                  <td class="text-xs text-amber-700">${b.discountShare ? m(b.discountShare) : '—'}</td>
                  <td class="text-xs text-rose-700">${b.expenseShare ? m(b.expenseShare) : '—'}</td>
                  <td class="text-xs font-black ${(b.netProfit || 0) >= 0 ? 'text-emerald-700' : 'text-rose-700'}">${m(b.netProfit)}</td>
                  <td class="text-xs font-black">${m(b.dues)}</td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
        ${data.generalExpenseShare ? `<div class="p-3 text-[11px] text-slate-500 border-t border-slate-100">+ مصروفات عامة عليك مش مربوطة بدفعة معينة: <b>${m(data.generalExpenseShare)}</b> (محسوبة في الإجمالي فوق)</div>` : ''}
      </div>` : ''}

      <div class="admin-card mb-6">
        <div class="admin-card-header"><h3 class="font-extrabold text-slate-900 text-sm"><i class="fa-solid fa-receipt text-amber-500"></i> طلبات منتجاتك (${orders.length}) <span class="text-[10px] text-slate-400 font-bold">مشاهدة فقط</span></h3></div>
        <div class="admin-table-container">
          <table class="admin-table">
            <thead><tr><th>رقم الطلب</th><th>التاريخ</th><th>القطع</th><th>المبيعات</th><th>حصتك من الخصم</th><th>نصيبك من الربح</th><th>الحالة</th></tr></thead>
            <tbody>
              ${orders.length === 0 ? '<tr><td colspan="7" class="text-center py-6 text-slate-400">مفيش طلبات على منتجاتك لسه</td></tr>' : orders.map(o => `
                <tr>
                  <td class="font-mono font-bold text-xs">#${esc(o.orderNumber)}</td>
                  <td class="text-xs text-slate-500">${new Date(o.date).toLocaleDateString('ar-EG')}</td>
                  <td class="text-xs">${o.items.map(i => `<div>${esc(i.title)}${i.variantLabel ? ` <span class="text-slate-400">(${esc(i.variantLabel)})</span>` : ''} × ${i.quantity} <span class="text-slate-400">— بيع ${i.unitPrice} / تكلفة ${i.unitCost}</span></div>`).join('')}</td>
                  <td class="text-xs font-bold">${m(o.sales)}</td>
                  <td class="text-xs font-bold text-amber-700">${o.discountShare ? m(o.discountShare) : '—'}</td>
                  <td class="text-xs font-black ${o.countsInAccount ? 'text-emerald-700' : 'text-slate-400'}">${m(o.investorProfit)}${o.countsInAccount ? '' : '<div class="text-[10px] font-semibold">مش محسوب لسه</div>'}</td>
                  <td><span class="px-2 py-1 rounded-lg text-[11px] font-bold ${statusCls[o.status] || statusCls.pending}">${esc(o.statusLabel)}</span></td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>

      <div class="admin-card mb-6">
        <div class="admin-card-header"><h3 class="font-extrabold text-slate-900 text-sm"><i class="fa-solid fa-money-bill-transfer text-teal-600"></i> الدفعات اللي اتورّدتلك (${payouts.length})</h3></div>
        <div class="admin-table-container">
          <table class="admin-table">
            <thead><tr><th>المبلغ</th><th>التاريخ</th><th>طريقة التحويل</th><th>المرجع</th><th>ملاحظات</th></tr></thead>
            <tbody>
              ${payouts.length === 0 ? '<tr><td colspan="5" class="text-center py-6 text-slate-400">لسه مفيش دفعات</td></tr>' : payouts.map(p => `
                <tr><td class="font-black text-teal-700 text-xs">${m(p.amount)}</td><td class="text-xs">${new Date(p.date).toLocaleDateString('ar-EG')}</td>
                <td class="text-xs">${esc(p.paymentMethod)}</td><td class="text-xs font-mono">${esc(p.reference)}</td><td class="text-xs text-slate-500">${esc(p.notes || '-')}</td></tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>`;
  },

  async renderInvestorPortal(month = 'all') {
    this.selectedMonth = month;

    AdminLayout.render('investor-accounting', `
      <div class="py-12 text-center text-slate-400">
        <i class="fa-solid fa-spinner fa-spin text-3xl mb-3 text-blue-600"></i>
        <div class="font-bold">جاري تحميل كشف الحساب والأرباح الخاصة بك...</div>
      </div>
    `);

    try {
      const invId = State.user.investorId || State.user.id;
      const query = month && month !== 'all' ? `?month=${month}` : '';
      const res = await API.get(`/investors/${invId}${query}`);
      this.activeInvestorData = res;
      this.renderInvestorPortalView();
    } catch (err) {
      console.error('Investor portal error:', err);
      AdminLayout.render('investor-accounting', `
        <div class="admin-card p-8 text-center text-red-600">
          <p>فشل جلب بيانات كشف الحساب: ${err.message || ''}</p>
        </div>
      `);
    }
  },

  renderInvestorPortalView() {
    const data = this.activeInvestorData;
    if (!data || !data.investor) return;

    const inv = data.investor;
    const stats = data.stats || {};
    const products = data.products || [];
    const expenses = data.expenses || [];

    const currentYear = new Date().getFullYear();
    const months = [];
    for (let m = 12; m >= 1; m--) {
      const mm = m < 10 ? `0${m}` : `${m}`;
      months.push(`${currentYear}-${mm}`);
    }

    const html = `
      <div class="investor-portal-container">
        <!-- Welcome Banner -->
        <div class="bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 text-white p-6 rounded-2xl mb-6 shadow-xl border border-blue-800/40">
          <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div class="flex items-center gap-4">
              <div class="w-14 h-14 rounded-2xl bg-white/10 flex items-center justify-center text-3xl text-blue-300">
                <i class="fa-solid fa-handshake"></i>
              </div>
              <div>
                <div class="flex items-center gap-2 flex-wrap">
                  <h1 class="text-xl font-black text-white">مرحباً بك، ${inv.name}</h1>
                  <span class="bg-blue-500/30 text-blue-200 border border-blue-400/30 font-mono font-bold text-xs px-2.5 py-0.5 rounded-lg">كود المستثمر: ${inv.code}</span>
                  <span class="bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 text-[10px] font-bold px-2 py-0.5 rounded-full">مشاهدة فقط 👁️</span>
                </div>
                <div class="text-xs text-blue-200 mt-1">كشف الحساب المالي، أسعار التكلفة وسعر البيع، والمبيعات والأرباح المحققة على منتجاتك الممولة.</div>
              </div>
            </div>

            <div class="flex items-center gap-2 flex-wrap">
              <!-- Month Filter -->
              <div class="bg-white/10 p-2.5 rounded-xl border border-white/15 flex items-center gap-2">
                <label class="text-xs font-bold text-blue-200 whitespace-nowrap">الفلترة بالشهر:</label>
                <select 
                  class="form-control text-xs font-bold bg-slate-800 text-white border-blue-400/30" 
                  onchange="InvestorsAdmin.renderInvestorPortal(this.value)">
                  <option value="all" ${this.selectedMonth === 'all' ? 'selected' : ''}>كافة الفترات (الإجمالي)</option>
                  ${months.map(m => `
                    <option value="${m}" ${this.selectedMonth === m ? 'selected' : ''}>شهر ${m}</option>
                  `).join('')}
                </select>
              </div>

              <!-- Print / Download Button -->
              ${ExportKit.buttons('.investor-portal-container', 'كشف حسابي — سوقي ستور', { dark: true })}
              <button onclick="ExportKit.print('.investor-portal-container', 'كشف حسابي')" class="hidden">
                <i class="fa-solid fa-download text-blue-600"></i>
                <span>تنزيل / طباعة التقرير</span>
              </button>
            </div>
          </div>
        </div>

        <!-- Financial KPI Cards -->
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
          <div class="admin-card p-4 bg-gradient-to-br from-amber-500 to-amber-600 text-white shadow-md">
            <div class="text-[11px] font-bold text-amber-100 flex items-center justify-between">
              <span>رأس المال المدخل</span>
              <i class="fa-solid fa-vault"></i>
            </div>
            <div class="text-2xl font-black mt-1">${(stats.capital || 0).toLocaleString('en-US')} ج.م</div>
            <div class="text-[10px] text-amber-100 mt-1">رأس المال المستثمر في البضاعة</div>
          </div>

          <div class="admin-card p-4 bg-gradient-to-br from-blue-600 to-indigo-700 text-white shadow-md">
            <div class="text-[11px] font-bold text-blue-100 flex items-center justify-between">
              <span>إجمالي المبيعات</span>
              <i class="fa-solid fa-cart-shopping"></i>
            </div>
            <div class="text-2xl font-black mt-1">${(stats.totalSales || 0).toLocaleString('en-US')} ج.م</div>
            <div class="text-[10px] text-blue-100 mt-1">${stats.totalUnitsSold || 0} قطعة مباعة</div>
          </div>

          <div class="admin-card p-4 bg-gradient-to-br from-slate-700 to-slate-800 text-white shadow-md">
            <div class="text-[11px] font-bold text-slate-300 flex items-center justify-between">
              <span>تكلفة المنتجات المباعة</span>
              <i class="fa-solid fa-tags"></i>
            </div>
            <div class="text-2xl font-black mt-1">${(stats.totalCostOfSold || 0).toLocaleString('en-US')} ج.م</div>
            <div class="text-[10px] text-slate-300 mt-1">سعر التكلفة للقطع المسلمة</div>
          </div>

          <div class="admin-card p-4 bg-gradient-to-br from-rose-600 to-rose-700 text-white shadow-md">
            <div class="text-[11px] font-bold text-rose-100 flex items-center justify-between">
              <span>المصروفات المشتركة (حصتك)</span>
              <i class="fa-solid fa-receipt"></i>
            </div>
            <div class="text-2xl font-black mt-1">${(stats.totalExpenses || 0).toLocaleString('en-US')} ج.م</div>
            <div class="text-[10px] text-rose-100 mt-1">${expenses.length} بنود مقتطعة من الأرباح</div>
          </div>

          <div class="admin-card p-4 bg-gradient-to-br from-emerald-600 to-teal-700 text-white shadow-md">
            <div class="text-[11px] font-bold text-emerald-100 flex items-center justify-between">
              <span>صافي أرباحك</span>
              <i class="fa-solid fa-hand-holding-dollar"></i>
            </div>
            <div class="text-2xl font-black mt-1">${(stats.netProfit || 0).toLocaleString('en-US')} ج.م</div>
            <div class="text-[10px] text-emerald-100 mt-1">نصيبك من الربح − الخصومات − المصروفات</div>
          </div>
        </div>

        ${this.renderInvestorAccountBlocks(data)}

        <!-- Products Accounting Table -->
        <div class="admin-card">
          <div class="admin-card-header flex items-center justify-between flex-wrap gap-2">
            <div>
              <h3 class="font-extrabold text-slate-900 text-sm flex items-center gap-2">
                <i class="fa-solid fa-boxes-stacked text-blue-600"></i>
                <span>قائمة المنتجات الممولة وحسابات مبيعاتها (${products.length} منتج)</span>
              </h3>
              <p class="text-[11px] text-slate-400 mt-0.5">مشاهدة فقط - لا يمكن تعديل بيانات المنتجات</p>
            </div>
            <span class="text-xs font-bold text-slate-600 bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-200">
              إجمالي القطع المباعة: <strong class="text-emerald-700">${stats.totalUnitsSold || 0}</strong>
            </span>
          </div>

          <div class="admin-table-container">
            <table class="admin-table">
              <thead>
                <tr>
                  <th>صورة المنتج</th>
                  <th>اسم المنتج</th>
                  <th>سعر التكلفة</th>
                  <th>السعر قبل الخصم</th>
                  <th>سعر البيع</th>
                  <th>متوسط اللي اتدفع فعلاً (بعد الكوبونات)</th>
                  <th>المخزون الحالي</th>
                  <th>كم مرة اتباع (القطع المباعة)</th>
                  <th>إجمالي المبيعات</th>
                  <th>إجمالي التكلفة</th>
                  <th>نصيبك من الربح</th>
                </tr>
              </thead>
              <tbody>
                ${products.length === 0 ? `
                  <tr>
                    <td colspan="11" class="text-center py-8 text-slate-400">لا توجد منتجات مسجلة في هذا الشهر أو الفترة</td>
                  </tr>
                ` : products.map(p => `
                  <tr>
                    <td>
                      <img src="${p.image || '/images/no-image.svg'}" class="w-10 h-10 rounded-lg object-cover border border-slate-200" />
                    </td>

                    <td>
                      <div class="font-bold text-slate-800 text-xs max-w-xs truncate">${p.title}</div>
                      <div class="text-[10px] text-slate-400 font-mono mt-0.5">كود: ${p.id.slice(0, 8)}</div>
                    </td>

                    <td>
                      <span class="font-bold text-xs text-blue-800 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                        ${p.costPrice} ج.م
                      </span>
                    </td>

                    <td>
                      <span class="text-xs text-slate-400 ${p.compareAtPrice ? 'line-through' : ''}">${p.compareAtPrice ? p.compareAtPrice + ' ج.م' : '—'}</span>
                    </td>

                    <td>
                      <span class="font-black text-xs text-emerald-700">
                        ${p.price} ج.م
                      </span>
                    </td>

                    <td>
                      <span class="font-bold text-xs text-indigo-700">${p.avgSoldPriceAfterDiscounts !== null && p.avgSoldPriceAfterDiscounts !== undefined ? p.avgSoldPriceAfterDiscounts + ' ج.م' : '—'}</span>
                    </td>

                    <td>
                      <span class="font-bold text-xs text-slate-700 bg-slate-50 px-2 py-0.5 rounded border border-slate-200">${p.stock} قطعة</span>
                    </td>

                    <td>
                      <span class="font-black text-xs text-blue-700 bg-blue-50 px-2.5 py-1 rounded-lg border border-blue-200">
                        ${p.unitsSold} مرة
                      </span>
                    </td>

                    <td>
                      <span class="font-bold text-xs text-slate-900">${(p.totalSales || 0).toLocaleString('en-US')} ج.م</span>
                    </td>

                    <td>
                      <span class="font-bold text-xs text-slate-600">${(p.totalCost || 0).toLocaleString('en-US')} ج.م</span>
                    </td>

                    <td>
                      <span class="font-black text-xs ${(p.profit || 0) >= 0 ? 'text-emerald-700' : 'text-red-600'}">
                        ${(p.profit || 0).toLocaleString('en-US')} ج.م
                      </span>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>

          <div class="p-4 bg-slate-50 border-t border-slate-200 text-xs text-slate-500 font-bold flex flex-col sm:flex-row items-center justify-between gap-2">
            <div>حسابك بصلاحية "مشاهدة فقط". لتحميل أو استخراج كشف الحساب اضغط على زر "تنزيل / طباعة التقرير".</div>
            <div class="font-mono font-bold text-slate-800">
              إجمالي الأرباح المستحقة: <span class="text-emerald-700 font-black">${(stats.netProfit || 0).toLocaleString('en-US')} ج.م</span>
            </div>
          </div>
        </div>

        <!-- Shared Expenses & Revenues Breakdown Table for Investor -->
        <div class="admin-card mt-6">
          <div class="admin-card-header flex items-center justify-between flex-wrap gap-2">
            <div>
              <h3 class="font-extrabold text-slate-900 text-sm flex items-center gap-2">
                <i class="fa-solid fa-receipt text-rose-600"></i>
                <span>سجل المصروفات والإيرادات المشتركة الخاصة بك (${expenses.length} بند)</span>
              </h3>
              <p class="text-[11px] text-slate-400 mt-0.5">تتقاسم هذه التكاليف بنسبة متفق عليها مع إدارة المتجر وتخصم بعد حساب الربح الإجمالي</p>
            </div>
            <div class="text-xs font-bold text-rose-700 bg-rose-50 px-3 py-1 rounded-lg border border-rose-200">
              إجمالي حصتك المقتطعة: <span class="font-black">${(stats.totalExpenses || 0).toLocaleString('en-US')} ج.م</span>
            </div>
          </div>

          <div class="admin-table-container">
            <table class="admin-table">
              <thead>
                <tr>
                  <th>البند / الوصف</th>
                  <th>النوع</th>
                  <th>التصنيف</th>
                  <th>إجمالي المبلغ</th>
                  <th>نسبتك المتفق عليها</th>
                  <th>حصتك المقتطعة</th>
                  <th>التاريخ</th>
                  <th>ملاحظات</th>
                </tr>
              </thead>
              <tbody>
                ${expenses.length === 0 ? `
                  <tr>
                    <td colspan="8" class="text-center py-8 text-slate-400">لا توجد بنود مصروفات أو إيرادات مشتركة مسجلة عليك</td>
                  </tr>
                ` : expenses.map(exp => `
                  <tr>
                    <td>
                      <div class="font-extrabold text-slate-800 text-xs">${exp.title}</div>
                    </td>
                    <td>
                      <span class="font-bold text-xs px-2 py-0.5 rounded ${exp.type === 'revenue' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'}">
                        ${exp.type === 'revenue' ? '📈 إيراد (إضافة)' : '📉 مصروف (خصم)'}
                      </span>
                    </td>
                    <td><span class="font-bold text-xs text-slate-600">${exp.category || 'عام'}</span></td>
                    <td><span class="font-bold text-xs text-slate-800">${(exp.amount || 0).toLocaleString('en-US')} ج.م</span></td>
                    <td><span class="font-mono text-xs font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">${exp.sharePercent !== undefined ? exp.sharePercent : 50}%</span></td>
                    <td><span class="font-black text-xs ${exp.type === 'revenue' ? 'text-emerald-700' : 'text-rose-700'}">${(exp.investorShare || 0).toLocaleString('en-US')} ج.م</span></td>
                    <td><span class="font-mono text-xs text-slate-500">${new Date(exp.date).toLocaleDateString('ar-EG')}</span></td>
                    <td><span class="text-xs text-slate-500">${exp.notes || '-'}</span></td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;

    AdminLayout.render('investor-accounting', html);
  }
};
