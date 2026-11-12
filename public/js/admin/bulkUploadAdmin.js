/**
 * Suki Store Admin - Bulk Product Upload Linked to Merchants
 * Allows batch product staging with unified merchant code & name,
 * full product creation modal, in-sheet editing, and one-click database publishing.
 */

const BulkUploadAdmin = {
  ownerType: 'merchant', // 'merchant' | 'investor'
  ownerCode: '',
  ownerName: '',
  ownerId: null,
  merchantCode: '',
  merchantName: '',
  investorCode: '',
  investorName: '',
  capital: '',
  merchantsList: [],
  investorsList: [],
  stagedProducts: [],
  editingIndex: -1,
  categories: [],
  subcategories: [],
  brands: [],
  uploadedImages: [],
  variationsList: [],
  governorateShippingMap: {},
  productVideoUrl: '',
  priceMarkupPercent: 20,
  defaultShippingPrice: 45,
  defaultStock: 25,
  defaultCategoryId: '',
  showPresets: false,
  isExtracting: false,

  async render() {
    AdminLayout.render('bulk-upload', `
      <div class="py-12 text-center text-slate-400">
        <i class="fa-solid fa-spinner fa-spin text-3xl mb-3 text-emerald-600"></i>
        <div class="font-bold">جاري تحميل شيت رفع المنتجات الجماعي (تاجر أو مستثمر)...</div>
      </div>
    `);

    try {
      const [cRes, subRes, bRes, mRes, invRes] = await Promise.all([
        API.get('/categories'),
        API.get('/categories/subcategories'),
        API.get('/brands'),
        API.get('/merchants').catch(() => ({ merchants: [] })),
        API.get('/investors').catch(() => ({ investors: [] }))
      ]);

      this.categories = cRes.categories || [];
      this.subcategories = subRes.subcategories || [];
      this.brands = bRes.brands || [];
      this.merchantsList = mRes.merchants || [];
      this.investorsList = invRes.investors || [];

      this.renderSheet();
    } catch (err) {
      console.error('Failed to load bulk upload sheet:', err);
      AdminLayout.render('bulk-upload', `
        <div class="p-8 text-center text-rose-600 bg-rose-50 rounded-xl border border-rose-200">
          <i class="fa-solid fa-circle-exclamation text-3xl mb-2"></i>
          <div>فشل تحميل شيت الرفع الجماعي. يُرجى المحاولة مرة أخرى.</div>
        </div>
      `);
    }
  },

  /**
   * Investor sheet rule (same as the server): every row needs a cost price and a quantity,
   * and the capital of this upload = Σ (cost price × quantity). Returns { total, problems[] }.
   */
  sheetCapital() {
    const problems = [];
    let total = 0;
    this.stagedProducts.forEach((p, i) => {
      const name = p.title || `منتج ${i + 1}`;
      const cost = Number(String(p.costPrice ?? '').trim() === '' ? NaN : p.costPrice);
      const qty = Number(String(p.stock ?? '').trim() === '' ? NaN : p.stock);
      if (!Number.isFinite(cost) || cost <= 0) problems.push(`"${name}": سعر التكلفة ناقص`);
      if (!Number.isInteger(qty) || qty < 1) problems.push(`"${name}": الكمية ناقصة`);
      if (Number.isFinite(cost) && Number.isFinite(qty)) total += cost * qty;
    });
    return { total: Math.round(total * 100) / 100, problems };
  },

  fillCapitalFromSheet() {
    const { total, problems } = this.sheetCapital();
    if (problems.length) return App.showToast(`كمّل الشيت الأول: ${problems.slice(0, 3).join(' • ')}`, 'warning');
    this.capital = total;
    this.renderSheet();
  },

  renderSheet() {
    const sheetCap = this.ownerType === 'investor' ? this.sheetCapital() : { total: 0, problems: [] };
    const stagedTotalCost = sheetCap.total;

    const targetCap = typeof Utils !== 'undefined' ? Utils.parseNumber(this.capital) : (Number(this.capital) || 0);
    const costDiff = Math.round((targetCap - stagedTotalCost) * 100) / 100;
    const isMatched = targetCap > 0 && Math.abs(costDiff) < 1 && sheetCap.problems.length === 0;

    const content = `
      <div class="space-y-6 text-right" dir="rtl">
        <!-- Page Header -->
        <div class="bg-gradient-to-l from-emerald-800 to-teal-900 text-white p-6 rounded-2xl shadow-lg relative overflow-hidden">
          <div class="relative z-10">
            <div class="flex items-center justify-between flex-wrap gap-4">
              <div>
                <h1 class="text-2xl font-black mb-1 flex items-center gap-2.5">
                  <i class="fa-solid fa-file-invoice text-emerald-400"></i>
                  <span>رفع جماعي شيت تاجر أو مستثمر</span>
                </h1>
                <p class="text-emerald-100 text-sm">
                  اختر التاجر أو المستثمر (أو أدخل كود واسم جديد)، وأضف أي عدد من المنتجات إلى الشيت مع إمكانية تعديلها بالكامل قبل النشر
                </p>
              </div>
              <div class="flex items-center gap-2 flex-wrap">
                <a href="#/admin/merchants" class="bg-white/10 hover:bg-white/20 text-white px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 border border-white/20">
                  <i class="fa-solid fa-store"></i>
                  <span>قائمة التجار</span>
                </a>
                <a href="#/admin/investors" class="bg-white/10 hover:bg-white/20 text-white px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 border border-white/20">
                  <i class="fa-solid fa-handshake"></i>
                  <span>قائمة المستثمرين</span>
                </a>
                <a href="#/admin/products" class="bg-white/10 hover:bg-white/20 text-white px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 border border-white/20">
                  <i class="fa-solid fa-boxes-stacked"></i>
                  <span>إدارة المنتجات</span>
                </a>
              </div>
            </div>
          </div>
        </div>

        <!-- 0. AI Smart Upload Section (رفع ذكي من صورة أو PDF أو Excel أو Word) -->
        <div class="bg-gradient-to-br from-slate-900 via-emerald-950 to-teal-950 border border-emerald-500/40 rounded-3xl p-6 text-white shadow-2xl relative overflow-hidden">
          <div class="flex items-center justify-between flex-wrap gap-4 pb-4 border-b border-emerald-500/20">
            <div class="flex items-center gap-3.5">
              <div class="w-12 h-12 rounded-2xl bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center text-white text-2xl shadow-lg shadow-emerald-500/30 flex-shrink-0">
                <i class="fa-solid fa-wand-magic-sparkles"></i>
              </div>
              <div>
                <div class="flex items-center gap-2 flex-wrap">
                  <h2 class="text-lg font-black text-white">الرفع الذكي للمنتجات (صور / PDF / Excel / Word)</h2>
                  <span class="text-[10px] bg-emerald-500/20 border border-emerald-400/40 text-emerald-300 font-extrabold px-2.5 py-0.5 rounded-full">AI Smart Extractor</span>
                </div>
                <p class="text-xs text-emerald-200/80 mt-0.5 leading-relaxed">
                  ارفع صورة أو فاتورة PDF أو ملف Excel (.xlsx, .xls) أو مستند Word (.docx, .doc)، وسيقوم الذكاء الاصطناعي بقراءة الجداول والأسعار وتصنيف الأقسام تلقائياً
                </p>
              </div>
            </div>

            <div class="flex items-center gap-2 flex-wrap">
              <button 
                type="button" 
                onclick="BulkUploadAdmin.togglePresetsModal()" 
                class="bg-emerald-900/80 hover:bg-emerald-800 text-emerald-200 hover:text-white px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 border border-emerald-500/30 cursor-pointer"
              >
                <i class="fa-solid fa-sliders"></i>
                <span>قواعد مسبقة (تسعير وشحن)</span>
                <i class="fa-solid ${this.showPresets ? 'fa-chevron-up' : 'fa-chevron-down'} text-[10px]"></i>
              </button>

              <button 
                type="button" 
                onclick="BulkUploadAdmin.loadDemoInvoice()" 
                class="bg-teal-600 hover:bg-teal-500 text-white px-4 py-2 rounded-xl text-xs font-black transition flex items-center gap-2 shadow-md shadow-teal-900/50 cursor-pointer"
                title="تجربة فورية بورقة نموذجية لمحاكاة استخراج الذكاء الاصطناعي"
              >
                <i class="fa-solid fa-file-circle-check"></i>
                <span>تجربة ورقة تاجر نموذجية</span>
              </button>
            </div>
          </div>

          <!-- Presets Settings Panel (Collapsible) -->
          <div id="smart-presets-panel" class="${this.showPresets ? '' : 'hidden'} mt-4 p-4 rounded-2xl bg-slate-900/90 border border-emerald-500/30">
            <div class="text-xs font-black text-emerald-400 mb-3 flex items-center gap-1.5">
              <i class="fa-solid fa-gear"></i>
              <span>القواعد المسبقة لمعالجة البيانات بالذكاء الاصطناعي (Presets):</span>
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs">
              <div>
                <label class="block font-bold text-slate-300 mb-1">هامش ربح التسعير (% Markup)</label>
                <input 
                  type="number" 
                  id="smart-preset-markup" 
                  class="w-full bg-slate-800 border border-slate-700 rounded-xl p-2.5 text-white font-bold" 
                  value="${this.priceMarkupPercent}" 
                  onchange="BulkUploadAdmin.priceMarkupPercent = Number(this.value);"
                />
                <span class="text-[10px] text-slate-400">تضاف تلقائياً على سعر التوريد</span>
              </div>
              <div>
                <label class="block font-bold text-slate-300 mb-1">تكلفة الشحن الافتراضية (ج.م)</label>
                <input 
                  type="number" 
                  id="smart-preset-shipping" 
                  class="w-full bg-slate-800 border border-slate-700 rounded-xl p-2.5 text-white font-bold" 
                  value="${this.defaultShippingPrice}" 
                  onchange="BulkUploadAdmin.defaultShippingPrice = Number(this.value);"
                />
                <span class="text-[10px] text-slate-400">سعر الشحن الأساسي للمنتجات</span>
              </div>
              <div>
                <label class="block font-bold text-slate-300 mb-1">المخزون الافتراضي للمنتج</label>
                <input 
                  type="number" 
                  id="smart-preset-stock" 
                  class="w-full bg-slate-800 border border-slate-700 rounded-xl p-2.5 text-white font-bold" 
                  value="${this.defaultStock}" 
                  onchange="BulkUploadAdmin.defaultStock = Number(this.value);"
                />
                <span class="text-[10px] text-slate-400">في حال عدم توفر كمية بالورقة</span>
              </div>
              <div>
                <label class="block font-bold text-slate-300 mb-1">القسم الافتراضي (احتياطي)</label>
                <select 
                  id="smart-preset-category" 
                  class="w-full bg-slate-800 border border-slate-700 rounded-xl p-2.5 text-white font-bold"
                  onchange="BulkUploadAdmin.defaultCategoryId = this.value;"
                >
                  <option value="">-- كشف تلقائي ذكي حسب المنتج --</option>
                  ${this.categories.map(c => `<option value="${c.id}" ${this.defaultCategoryId === c.id ? 'selected' : ''}>${c.name}</option>`).join('')}
                </select>
                <span class="text-[10px] text-slate-400">إذا لم يتم التعرف على القسم</span>
              </div>
            </div>
          </div>

          <!-- Drag and Drop & File Upload Box -->
          <div class="mt-4">
            <div 
              id="smart-drop-zone"
              ondrop="BulkUploadAdmin.handleDrop(event)"
              ondragover="BulkUploadAdmin.handleDragOver(event)"
              ondragleave="BulkUploadAdmin.handleDragLeave(event)"
              onclick="document.getElementById('smart-file-input').click()"
              class="border-2 border-dashed border-emerald-500/40 hover:border-emerald-400 hover:bg-emerald-950/20 rounded-2xl p-6 text-center cursor-pointer transition group"
            >
              <input 
                type="file" 
                id="smart-file-input" 
                class="hidden" 
                accept=".pdf,.xlsx,.xls,.xlsm,.csv,.ods,.docx,.doc,.rtf,.png,.jpg,.jpeg,.webp,.gif,.bmp,.txt"
                onchange="BulkUploadAdmin.handleFileInput(this.files[0])"
              />
              <div class="w-14 h-14 rounded-2xl bg-emerald-500/10 text-emerald-400 group-hover:scale-110 flex items-center justify-center text-3xl mx-auto mb-3 transition shadow-inner">
                <i class="fa-solid fa-cloud-arrow-up"></i>
              </div>
              <div class="font-extrabold text-white text-sm mb-2">
                اسحب وأفلت شيت Excel أو Word أو ملف PDF أو صورة الفاتورة هنا، أو اضغط لاختيار ملف من جهازك
              </div>
              <div class="flex items-center justify-center gap-2 flex-wrap mb-2">
                <span class="px-2.5 py-0.5 rounded-lg bg-emerald-500/20 border border-emerald-400/30 text-[11px] font-bold text-emerald-200"><i class="fa-solid fa-file-excel text-emerald-400 ml-1"></i>Excel (.xlsx, .xls, .csv)</span>
                <span class="px-2.5 py-0.5 rounded-lg bg-blue-500/20 border border-blue-400/30 text-[11px] font-bold text-blue-200"><i class="fa-solid fa-file-word text-blue-400 ml-1"></i>Word (.docx, .doc)</span>
                <span class="px-2.5 py-0.5 rounded-lg bg-rose-500/20 border border-rose-400/30 text-[11px] font-bold text-rose-200"><i class="fa-solid fa-file-pdf text-rose-400 ml-1"></i>PDF</span>
                <span class="px-2.5 py-0.5 rounded-lg bg-amber-500/20 border border-amber-400/30 text-[11px] font-bold text-amber-200"><i class="fa-solid fa-image text-amber-400 ml-1"></i>صور (JPG, PNG, WEBP)</span>
              </div>
              <p class="text-xs text-emerald-200/70 max-w-lg mx-auto leading-relaxed">
                الذكاء الاصطناعي يتعامل بشكل موحد مع جميع الصيغ: يقرأ الجداول والأسعار الثلاثة والأقسام ويحولها مباشرة لصفوف في الشيت.
              </p>
            </div>
          </div>

          <!-- Progress & Spinner Bar -->
          <div id="smart-extract-status" class="${this.isExtracting ? '' : 'hidden'} mt-4 p-4 rounded-2xl bg-emerald-950/90 border border-emerald-500/60 shadow-lg">
            <div class="flex items-center gap-3.5">
              <i class="fa-solid fa-spinner fa-spin text-2xl text-emerald-400"></i>
              <div class="flex-1">
                <div class="font-extrabold text-white text-xs">جاري تحليل المستند بالذكاء الاصطناعي وتجهيز الشيت...</div>
                <div class="text-[11px] text-emerald-200 mt-0.5">يتم قراءة كود التاجر واسمه واستخراج الأصناف وتطبيق قواعد التسعير والشحن الذكية</div>
              </div>
            </div>
          </div>
        </div>

        <!-- 1. Owner (Merchant or Investor) Header Section -->
        <div class="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm">
          <div class="flex items-center justify-between pb-3 mb-4 border-b border-slate-100 flex-wrap gap-2">
            <h3 class="font-extrabold text-slate-800 flex items-center gap-2">
              <span class="w-7 h-7 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-xs font-black">1</span>
              <span>بيانات التاجر أو المستثمر صاحب الشيت (تُحدد مرة واحدة للمجموعة كاملة)</span>
            </h3>
            <div class="flex items-center gap-2">
              <span class="text-xs text-slate-400 font-medium">نوع الحساب المحدد:</span>
              <span class="inline-flex items-center px-2.5 py-0.5 rounded-lg text-xs font-bold ${this.ownerType === 'investor' ? 'bg-blue-100 text-blue-800 border border-blue-300' : 'bg-emerald-100 text-emerald-800 border border-emerald-300'}">
                <i class="fa-solid ${this.ownerType === 'investor' ? 'fa-handshake mr-1.5' : 'fa-store mr-1.5'}"></i>
                ${this.ownerType === 'investor' ? '💼 حساب مستثمر (Investor)' : '🏪 حساب تاجر (Merchant)'}
              </span>
            </div>
          </div>

          <!-- Type Toggle & Owner Selection Grid -->
          <div class="space-y-4">
            <!-- Unified Selection Dropdown with Merchant & Investor distinction -->
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div class="form-group md:col-span-2">
                <label class="form-label text-xs font-bold text-slate-700 flex items-center justify-between">
                  <span>اختيار التاجر أو المستثمر من القائمة المسجلة:</span>
                  <span class="text-[11px] text-slate-400 font-normal">تجار ومستثمرون مسجلون بالنظام</span>
                </label>
                <select id="bulk-owner-select" class="form-control text-xs font-bold bg-slate-50 border-emerald-300" onchange="BulkUploadAdmin.onSelectOwner(this.value)">
                  <option value="">-- اختر من القائمة أو اختر نوع الحساب وأدخل بيانات يدوياً --</option>
                  
                  <optgroup label="🏪 قائمة التجار المسجلين (${this.merchantsList.length} تاجر)">
                    ${this.merchantsList.map(m => `
                      <option value="merchant:${m.code}" ${this.ownerType === 'merchant' && (this.ownerCode === m.code || this.merchantCode === m.code) ? 'selected' : ''}>
                        🏪 تاجر: ${m.name} (${m.code})
                      </option>
                    `).join('')}
                  </optgroup>

                  <optgroup label="💼 قائمة المستثمرين المسجلين (${this.investorsList.length} مستثمر)">
                    ${this.investorsList.map(inv => `
                      <option value="investor:${inv.code}" ${this.ownerType === 'investor' && (this.ownerCode === inv.code || this.investorCode === inv.code) ? 'selected' : ''}>
                        💼 مستثمر: ${inv.name} (${inv.code})
                      </option>
                    `).join('')}
                  </optgroup>
                </select>
              </div>

              <!-- Manual Type Toggle -->
              <div class="form-group">
                <label class="form-label text-xs font-bold text-slate-700">نوع الجهة التابع لها الشيت:</label>
                <div class="grid grid-cols-2 gap-2 mt-1">
                  <button 
                    type="button" 
                    onclick="BulkUploadAdmin.setOwnerType('merchant')" 
                    class="py-2 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 border cursor-pointer ${this.ownerType === 'merchant' ? 'bg-emerald-600 text-white border-emerald-700 shadow-sm' : 'bg-slate-50 text-slate-700 hover:bg-slate-100 border-slate-200'}"
                  >
                    <i class="fa-solid fa-store"></i>
                    <span>تاجر</span>
                  </button>
                  <button 
                    type="button" 
                    onclick="BulkUploadAdmin.setOwnerType('investor')" 
                    class="py-2 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 border cursor-pointer ${this.ownerType === 'investor' ? 'bg-blue-600 text-white border-blue-700 shadow-sm' : 'bg-slate-50 text-slate-700 hover:bg-slate-100 border-slate-200'}"
                  >
                    <i class="fa-solid fa-handshake"></i>
                    <span>مستثمر</span>
                  </button>
                </div>
              </div>
            </div>

            <!-- Code & Name & Capital Inputs -->
            <div class="grid grid-cols-1 ${this.ownerType === 'investor' ? 'md:grid-cols-3' : 'md:grid-cols-2'} gap-4 pt-2 border-t border-slate-100">
              <!-- Owner Code -->
              <div class="form-group">
                <label class="form-label text-xs font-bold text-slate-700">
                  كود ${this.ownerType === 'investor' ? 'المستثمر (Investor Code)' : 'التاجر (Merchant Code)'} *
                </label>
                <div class="relative">
                  <input 
                    type="text" 
                    id="bulk-owner-code" 
                    class="form-control text-xs font-mono font-bold uppercase tracking-wider pl-8" 
                    placeholder="${this.ownerType === 'investor' ? 'مثال: INV-101' : 'مثال: M-101 أو TR-50'}"
                    value="${this.ownerCode || (this.ownerType === 'investor' ? this.investorCode : this.merchantCode)}"
                    oninput="BulkUploadAdmin.onOwnerCodeInput(this.value)"
                    required
                  />
                  <span class="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs">
                    <i class="fa-solid ${this.ownerType === 'investor' ? 'fa-id-badge' : 'fa-barcode'}"></i>
                  </span>
                </div>
              </div>

              <!-- Owner Name -->
              <div class="form-group">
                <label class="form-label text-xs font-bold text-slate-700">
                  اسم ${this.ownerType === 'investor' ? 'المستثمر (Investor Name)' : 'التاجر (Merchant Name)'} *
                </label>
                <div class="relative">
                  <input 
                    type="text" 
                    id="bulk-owner-name" 
                    class="form-control text-xs font-bold pl-8" 
                    placeholder="${this.ownerType === 'investor' ? 'اسم المستثمر بالكامل' : 'اسم شركة التاجر أو المحل'}"
                    value="${this.ownerName || (this.ownerType === 'investor' ? this.investorName : this.merchantName)}"
                    oninput="BulkUploadAdmin.onOwnerNameInput(this.value)"
                    required
                  />
                  <span class="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs">
                    <i class="fa-solid ${this.ownerType === 'investor' ? 'fa-user-tie' : 'fa-store'}"></i>
                  </span>
                </div>
              </div>

              <!-- Investor Capital (Mandatory when Investor) -->
              ${this.ownerType === 'investor' ? `
                <div class="form-group">
                  <label class="form-label text-xs font-bold text-slate-700 flex items-center justify-between">
                    <span>رأس المال المدخل (ج.م) *</span>
                    <span class="text-[10px] bg-blue-100 text-blue-800 border border-blue-300 px-2 py-0.5 rounded-full font-black">إجباري للمستثمر</span>
                  </label>
                  <div class="relative">
                    <input 
                      type="number" 
                      id="bulk-investor-capital" 
                      class="form-control text-xs font-mono font-bold text-blue-900 border-blue-300 pl-8 bg-blue-50/30" 
                      placeholder="مثال: 20000"
                      value="${this.capital || ''}"
                      oninput="BulkUploadAdmin.onCapitalInput(this.value)"
                      step="1"
                      min="1"
                      required
                    />
                    <span class="absolute left-2.5 top-1/2 -translate-y-1/2 text-amber-500 text-xs">
                      <i class="fa-solid fa-coins"></i>
                    </span>
                  </div>
                  <span class="text-[10px] text-slate-500 mt-1 block">مبلغ رأس المال الخاص بهذا الشيت فقط — يجب أن يساوي تكلفة بضاعة الشيت (سعر التكلفة × الكمية)</span>
                </div>
                ${this.renderCapitalModeControls()}
              ` : ''}
            </div>

            <!-- Investor Live Capital Matching Indicator -->
            ${this.ownerType === 'investor' ? `
              <div class="mt-4 p-4 rounded-2xl border ${isMatched ? 'bg-emerald-50/90 border-emerald-300 text-emerald-950' : (targetCap > 0 && stagedTotalCost > targetCap ? 'bg-rose-50/90 border-rose-300 text-rose-950' : 'bg-amber-50/90 border-amber-300 text-amber-950')} shadow-sm">
                <div class="flex items-center justify-between flex-wrap gap-3">
                  <div class="flex items-center gap-3">
                    <div class="w-11 h-11 rounded-2xl flex items-center justify-center text-xl flex-shrink-0 shadow-sm ${isMatched ? 'bg-emerald-600 text-white' : (targetCap > 0 && stagedTotalCost > targetCap ? 'bg-rose-600 text-white' : 'bg-amber-500 text-white')}">
                      <i class="fa-solid ${isMatched ? 'fa-circle-check' : (targetCap > 0 && stagedTotalCost > targetCap ? 'fa-circle-xmark' : 'fa-scale-unbalanced')}"></i>
                    </div>
                    <div>
                      <div class="font-extrabold text-xs flex items-center gap-2 flex-wrap">
                        <span>مؤشر توافق رأس المال مع بضاعة الشيت:</span>
                        <span class="px-2.5 py-0.5 rounded-full text-[10px] font-black ${isMatched ? 'bg-emerald-200 text-emerald-900 border border-emerald-300' : (targetCap > 0 && stagedTotalCost > targetCap ? 'bg-rose-200 text-rose-900 border border-rose-300' : 'bg-amber-200 text-amber-900 border border-amber-300')}">
                          ${isMatched ? '✅ متوافق تماماً وموافق لرأس المال (جاهز للنشر)' : (targetCap === 0 ? '⚠️ يرجى إدخال رأس المال المطلوب بالأعلى' : (costDiff > 0 ? `⚠️ متبقي ${costDiff.toLocaleString('en-US')} ج.م لم تُستغل في الشيت` : `❌ تجاوز رأس المال بـ ${Math.abs(costDiff).toLocaleString('en-US')} ج.م`))}
                        </span>
                      </div>
                      <div class="text-[11px] mt-1 text-slate-600 flex items-center gap-3 flex-wrap">
                        <span>رأس المال المحدد: <strong class="text-blue-900 font-mono">${targetCap.toLocaleString('en-US')} ج.م</strong></span>
                        <span>|</span>
                        <span>رأس المال المطلوب (سعر التكلفة × الكمية لكل منتج): <strong class="${isMatched ? 'text-emerald-700' : 'text-slate-800'} font-mono">${stagedTotalCost.toLocaleString('en-US')} ج.م</strong></span>
                        ${stagedTotalCost > 0 && !sheetCap.problems.length && !isMatched ? `<button type="button" onclick="BulkUploadAdmin.fillCapitalFromSheet()" class="bg-blue-600 hover:bg-blue-700 text-white px-2.5 py-1 rounded-lg font-bold">اكتبه تلقائي</button>` : ''}
                      </div>
                      ${sheetCap.problems.length ? `<div class="text-[11px] mt-1 text-rose-700 font-bold"><i class="fa-solid fa-triangle-exclamation"></i> ${sheetCap.problems.slice(0, 4).join(' • ')}${sheetCap.problems.length > 4 ? ` و${sheetCap.problems.length - 4} كمان` : ''}</div>` : ''}
                    </div>
                  </div>
                  ${targetCap > 0 && !isMatched ? `
                    <div class="bg-white/80 px-3.5 py-2 rounded-xl border text-xs font-bold font-mono">
                      الفارق المطلوب: <span class="${costDiff > 0 ? 'text-amber-700' : 'text-rose-700'} font-black">${Math.abs(costDiff).toLocaleString('en-US')} ج.م</span>
                    </div>
                  ` : ''}
                </div>
              </div>
            ` : ''}
          </div>
        </div>

        <!-- 2. Staged Products Sheet Toolbar -->
        <div class="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm">
          <div class="flex items-center justify-between flex-wrap gap-4 mb-4">
            <div class="flex items-center gap-3">
              <h3 class="font-extrabold text-slate-800 flex items-center gap-2">
                <span class="w-7 h-7 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-xs font-black">2</span>
                <span>جدول المنتجات الجاهزة بالشيت</span>
              </h3>
              <span class="inline-flex items-center px-3 py-1 rounded-full text-xs font-black bg-emerald-50 text-emerald-700 border border-emerald-200">
                ${this.stagedProducts.length} منتج في الشيت
              </span>
            </div>

            <div class="flex items-center gap-2 flex-wrap">
              <button 
                type="button" 
                onclick="BulkUploadAdmin.openProductModal()"
                class="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 rounded-xl text-xs font-extrabold shadow-sm transition flex items-center gap-2 cursor-pointer"
              >
                <i class="fa-solid fa-plus-circle text-sm"></i>
                <span>إضافة منتج للشيت</span>
              </button>

              <button 
                type="button" 
                onclick="BulkUploadAdmin.publishBatch()"
                class="bg-teal-600 hover:bg-teal-700 text-white px-5 py-2.5 rounded-xl text-xs font-extrabold shadow-md transition flex items-center gap-2 cursor-pointer ${this.stagedProducts.length === 0 ? 'opacity-50 pointer-events-none' : ''}"
                id="btn-publish-batch"
              >
                <i class="fa-solid fa-cloud-arrow-up text-sm"></i>
                <span>تنزيل ونشر المنتجات (${this.stagedProducts.length})</span>
              </button>

              ${this.stagedProducts.length > 0 ? `
                <button 
                  type="button" 
                  onclick="BulkUploadAdmin.clearSheet()" 
                  class="bg-rose-50 hover:bg-rose-100 text-rose-700 px-3 py-2 rounded-xl text-xs font-bold border border-rose-200 transition"
                  title="مسح محتويات الشيت"
                >
                  <i class="fa-solid fa-trash-can"></i>
                  <span>مسح الشيت</span>
                </button>
              ` : ''}
            </div>
          </div>

          <!-- Staged Products Table -->
          <div class="overflow-x-auto rounded-xl border border-slate-200">
            <table class="w-full text-right text-xs">
              <thead class="bg-slate-50 text-slate-700 font-extrabold border-b border-slate-200">
                <tr>
                  <th class="py-3 px-3 w-12 text-center">#</th>
                  <th class="py-3 px-3 w-16 text-center">الصورة</th>
                  <th class="py-3 px-4">اسم المنتج والوصف</th>
                  <th class="py-3 px-3">القسم (رئيسي وفرعي)</th>
                  <th class="py-3 px-3 text-center">سعر التكلفة (التوريد)</th>
                  <th class="py-3 px-3 text-center">السعر قبل الخصم</th>
                  <th class="py-3 px-3 text-center">سعر البيع بعد الخصم</th>
                  <th class="py-3 px-3 text-center">المخزون</th>
                  <th class="py-3 px-3 text-center">الشحن</th>
                  <th class="py-3 px-4 text-center w-28">إجراءات</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100 bg-white">
                ${this.stagedProducts.length === 0 ? `
                  <tr>
                    <td colspan="10" class="py-12 text-center text-slate-400">
                      <div class="max-w-md mx-auto space-y-3">
                        <div class="w-16 h-16 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto text-2xl">
                          <i class="fa-solid fa-table-list"></i>
                        </div>
                        <div class="font-bold text-slate-600 text-sm">الشيت فارغ حالياً</div>
                        <p class="text-xs text-slate-400 leading-relaxed">
                          قم بإدخال كود واسم التاجر أو المستثمر بالأعلى، أو ارفع ملف Excel أو Word أو PDF أو صورة ليتم قراءة كافة المنتجات والأسعار وتعبئة الشيت تلقائياً.
                        </p>
                      </div>
                    </td>
                  </tr>
                ` : this.stagedProducts.map((p, idx) => {
                  const catObj = this.categories.find(c => c.id === p.categoryId);
                  const subObj = this.subcategories.find(s => s.id === (p.subcategoryId || p.subcategory));
                  const hasImage = Array.isArray(p.images) && p.images.length > 0 && p.images[0];
                  const shipText = p.isFreeShipping ? 'مجاني 🎁' : `${p.shippingCost !== undefined ? p.shippingCost : 20} ج.م`;

                  return `
                    <tr class="hover:bg-slate-50/70 transition">
                      <td class="py-3 px-3 text-center font-bold text-slate-400">${idx + 1}</td>
                      <td class="py-2 px-2 text-center">
                        ${hasImage ? `
                          <img src="${p.images[0]}" alt="${p.title}" class="w-11 h-11 object-cover rounded-lg border border-slate-200 shadow-sm mx-auto" />
                        ` : `
                          <div class="w-11 h-11 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-400 mx-auto" title="بدون صورة (ارفعها لاحقاً)">
                            <i class="fa-regular fa-image text-xs"></i>
                          </div>
                        `}
                      </td>
                      <td class="py-3 px-4 font-bold text-slate-800">
                        <div class="font-extrabold text-slate-900 text-xs mb-0.5" title="${p.title}">${p.title}</div>
                        ${p.description ? `<p class="text-[11px] text-slate-500 font-normal line-clamp-2 leading-relaxed" title="${p.description}">${p.description}</p>` : ''}
                        ${p.brand ? `<span class="inline-block text-[10px] text-slate-400 font-medium mt-0.5">ماركة: ${p.brand}</span>` : ''}
                      </td>
                      <td class="py-3 px-3">
                        <div class="font-bold text-slate-800 text-xs">${catObj ? catObj.name : (p.category || '-')}</div>
                        ${subObj ? `<div class="text-[11px] text-emerald-600 font-semibold mt-0.5">${subObj.name}</div>` : '<div class="text-[10px] text-amber-600 font-medium">بدون فرعي</div>'}
                      </td>
                      <td class="py-3 px-3 text-center">
                        <div class="font-bold text-blue-700 text-xs font-mono" title="سعر التكلفة / سعر التوريد">${(p.costPrice !== undefined && p.costPrice !== null && p.costPrice !== '' ? p.costPrice : (p.basePrice || p.price || '-'))} ج.م</div>
                      </td>
                      <td class="py-3 px-3 text-center text-slate-400 line-through text-xs font-mono" title="سعر البيع قبل الخصم">
                        ${p.compareAtPrice ? p.compareAtPrice + ' ج.م' : '-'}
                      </td>
                      <td class="py-3 px-3 text-center" title="سعر البيع بعد الخصم (النهائي)">
                        <div class="font-black text-emerald-700 text-sm font-mono">${p.price} ج.م</div>
                      </td>
                      <td class="py-3 px-3 text-center font-bold text-slate-700">
                        ${p.stock || 10} ${p.saleUnit || 'قطعة'}
                      </td>
                      <td class="py-3 px-3 text-center">
                        <span class="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold ${p.isFreeShipping ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-700'}">
                          ${shipText}
                        </span>
                      </td>
                      <td class="py-3 px-4 text-center">
                        <div class="inline-flex items-center gap-1.5">
                          <button 
                            type="button" 
                            onclick="BulkUploadAdmin.openProductModal(${idx})" 
                            class="bg-amber-50 hover:bg-amber-100 text-amber-700 p-2 rounded-lg border border-amber-200 transition" 
                            title="تعديل المنتج داخل الشيت"
                          >
                            <i class="fa-solid fa-pen-to-square"></i>
                          </button>
                          <button 
                            type="button" 
                            onclick="BulkUploadAdmin.removeStagedProduct(${idx})" 
                            class="bg-rose-50 hover:bg-rose-100 text-rose-700 p-2 rounded-lg border border-rose-200 transition" 
                            title="حذف المنتج من الشيت"
                          >
                            <i class="fa-solid fa-trash-can"></i>
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

    AdminLayout.render('bulk-upload', content);
  },

  setOwnerType(type) {
    this.ownerType = type === 'investor' ? 'investor' : 'merchant';
    this.ownerId = null;
    if (this.ownerType === 'investor') {
      this.merchantCode = '';
      this.merchantName = '';
      this.ownerCode = this.investorCode || '';
      this.ownerName = this.investorName || '';
      this.stagedProducts = (this.stagedProducts || []).map(p => ({
        ...p,
        ownerType: 'investor',
        merchantCode: '',
        merchantName: '',
        merchantId: null
      }));
    } else {
      this.investorCode = '';
      this.investorName = '';
      this.investorId = null;
      this.capital = '';
      this.ownerCode = this.merchantCode || '';
      this.ownerName = this.merchantName || '';
      this.stagedProducts = (this.stagedProducts || []).map(p => ({
        ...p,
        ownerType: 'merchant',
        investorCode: '',
        investorName: '',
        investorId: null
      }));
    }
    this.renderSheet();
  },

  onSelectOwner(val) {
    if (!val) {
      this.ownerCode = '';
      this.ownerName = '';
      this.ownerId = null;
      this.investorCode = '';
      this.investorName = '';
      this.merchantCode = '';
      this.merchantName = '';
      this.capital = '';
      this.renderSheet();
      return;
    }

    const [type, code] = val.split(':');
    this.ownerType = type;

    if (type === 'investor') {
      const inv = this.investorsList.find(x => x.code === code);
      if (inv) {
        this.ownerCode = inv.code;
        this.ownerName = inv.name;
        this.ownerId = inv.id;
        this.investorCode = inv.code;
        this.investorName = inv.name;
        this.investorId = inv.id;
        // The capital box is the amount for THIS upload (not the investor's total)
        this.capital = '';
        this.capitalMode = 'new';
        this.capitalBatchId = '';
        this.merchantCode = '';
        this.merchantName = '';
      }
    } else {
      const m = this.merchantsList.find(x => x.code === code);
      if (m) {
        this.ownerCode = m.code;
        this.ownerName = m.name;
        this.ownerId = m.id;
        this.merchantCode = m.code;
        this.merchantName = m.name;
        this.investorCode = '';
        this.investorName = '';
        this.investorId = null;
        this.capital = '';
      }
    }

    this.renderSheet();
  },

  onOwnerCodeInput(val) {
    this.ownerCode = (val || '').trim().toUpperCase();
    if (this.ownerType === 'investor') {
      this.investorCode = this.ownerCode;
      this.merchantCode = '';
      this.merchantName = '';
      const matched = this.investorsList.find(x => x.code && x.code.toUpperCase() === this.ownerCode);
      this.ownerId = matched ? matched.id : null;
      this.investorId = this.ownerId;
    } else {
      this.merchantCode = this.ownerCode;
      this.investorCode = '';
      this.investorName = '';
      this.investorId = null;
      const matched = this.merchantsList.find(x => x.code && x.code.toUpperCase() === this.ownerCode);
      this.ownerId = matched ? matched.id : null;
    }
  },

  onOwnerNameInput(val) {
    this.ownerName = val || '';
    if (this.ownerType === 'investor') {
      this.investorName = this.ownerName;
      this.merchantName = '';
    } else {
      this.merchantName = this.ownerName;
      this.investorName = '';
    }
  },

  onCapitalInput(val) {
    this.capital = typeof Utils !== 'undefined' ? Utils.normalizeNumerals(val) : val;
    this.updateOwnerSummaryDisplay();
  },

  // "New separate capital" vs "add to an earlier capital batch" for the selected investor
  renderCapitalModeControls() {
    const inv = (this.investorsList || []).find(x => (this.investorId && x.id === this.investorId) || (this.investorCode && x.code === this.investorCode));
    const batches = inv && Array.isArray(inv.capitalBatches) ? inv.capitalBatches : [];
    const mode = this.capitalMode === 'add' && batches.length ? 'add' : 'new';
    const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const fmt = n => (Number(n) || 0).toLocaleString('ar-EG');
    return `
      <div class="form-group md:col-span-2">
        <label class="form-label text-xs font-bold text-slate-700">طريقة تسجيل رأس المال *</label>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <label class="flex items-start gap-2 p-3 rounded-xl border cursor-pointer ${mode === 'new' ? 'border-blue-400 bg-blue-50/60' : 'border-slate-200 bg-white'}">
            <input type="radio" name="bulk-capital-mode" value="new" ${mode === 'new' ? 'checked' : ''} onchange="BulkUploadAdmin.setCapitalMode('new')" class="mt-0.5 accent-blue-600" />
            <span class="text-[11px]"><b class="text-slate-800 block">رأس مال جديد منفصل</b><span class="text-slate-500">دفعة مستقلة، أرباحها واسترداد تكلفتها يتحسبوا لوحدهم</span></span>
          </label>
          <label class="flex items-start gap-2 p-3 rounded-xl border ${batches.length ? 'cursor-pointer' : 'opacity-50 cursor-not-allowed'} ${mode === 'add' ? 'border-blue-400 bg-blue-50/60' : 'border-slate-200 bg-white'}">
            <input type="radio" name="bulk-capital-mode" value="add" ${mode === 'add' ? 'checked' : ''} ${batches.length ? '' : 'disabled'} onchange="BulkUploadAdmin.setCapitalMode('add')" class="mt-0.5 accent-blue-600" />
            <span class="text-[11px]"><b class="text-slate-800 block">إضافة على رأس مال سابق</b><span class="text-slate-500">${batches.length ? 'يزيد مبلغ دفعة موجودة' : 'لا توجد دفعات سابقة لهذا المستثمر'}</span></span>
          </label>
        </div>
        ${mode === 'new' ? `
          <input type="text" id="bulk-capital-label" class="form-control text-xs mt-2" placeholder="اسم الدفعة (اختياري) مثال: بضاعة شتاء 2026" value="${esc(this.capitalBatchLabel || '')}" oninput="BulkUploadAdmin.capitalBatchLabel = this.value" />
        ` : `
          <select id="bulk-capital-batch" class="form-control text-xs mt-2" onchange="BulkUploadAdmin.capitalBatchId = this.value">
            ${batches.map((b, i) => `<option value="${esc(b.id)}" ${(this.capitalBatchId ? this.capitalBatchId === b.id : i === batches.length - 1) ? 'selected' : ''}>${esc(b.label)} — ${fmt(b.amount)} ج.م</option>`).join('')}
          </select>
        `}
        ${inv && inv.capital !== undefined ? `<div class="text-[10px] text-slate-500 mt-1">إجمالي رأس مال المستثمر الحالي: <b>${fmt(inv.capital)} ج.م</b> في ${batches.length || 0} دفعة</div>` : ''}
      </div>
    `;
  },

  setCapitalMode(mode) {
    this.capitalMode = mode;
    if (mode === 'add' && !this.capitalBatchId) {
      const inv = (this.investorsList || []).find(x => (this.investorId && x.id === this.investorId) || (this.investorCode && x.code === this.investorCode));
      const batches = inv && Array.isArray(inv.capitalBatches) ? inv.capitalBatches : [];
      if (batches.length) this.capitalBatchId = batches[batches.length - 1].id;
    }
    this.renderSheet();
  },

  onSelectExistingMerchant(code) {
    this.onSelectOwner(code ? `merchant:${code}` : '');
  },

  // Open Full Product Modal (Identical to Standard Add/Edit Modal)
  openProductModal(index = -1) {
    this.editingIndex = index;
    const product = index >= 0 ? this.stagedProducts[index] : null;

    this.uploadedImages = product && Array.isArray(product.images) ? [...product.images] : [];
    this.productVideoUrl = product && product.videoUrl ? product.videoUrl : '';
    this.variationsList = product && Array.isArray(product.variations) ? JSON.parse(JSON.stringify(product.variations)) : [];
    this.governorateShippingMap = product && product.governorateShipping ? { ...product.governorateShipping } : {};

    const isFree = product ? (product.isFreeShipping || product.shippingCost === 0) : false;
    const defaultShipping = product ? (product.shippingCost !== undefined ? product.shippingCost : 25) : 25;

    const titleText = product 
      ? `تعديل المنتج #${index + 1} بالشيت: ${product.title}`
      : 'إضافة منتج جديد للشيت الجماعي';

    const modalBody = `
      <form onsubmit="BulkUploadAdmin.saveModalProduct(event)" class="text-right" dir="rtl">
        <!-- Title & Basic Info -->
        <div class="form-group mb-3">
          <label class="form-label font-bold text-xs text-slate-800">عنوان المنتج *</label>
          <input type="text" id="bm-title" class="form-control text-xs font-bold" value="${product ? product.title : ''}" placeholder="اسم المنتج بالكامل..." required />
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 mb-3">
          <div class="form-group">
            <label class="form-label text-xs font-bold text-slate-700">1. القسم الرئيسي *</label>
            <select id="bm-category" class="form-control text-xs font-bold" onchange="BulkUploadAdmin.onCategoryChanged(this.value)" required>
              <option value="">-- اختر القسم الرئيسي --</option>
              ${this.categories.map(c => `
                <option value="${c.id}" ${product && product.categoryId === c.id ? 'selected' : ''}>${c.name}</option>
              `).join('')}
            </select>
          </div>

          <div class="form-group">
            <label class="form-label text-xs font-bold text-slate-700">2. القسم الفرعي التابع له (إجباري) *</label>
            <select id="bm-subcategory" class="form-control text-xs font-bold" required ${product && product.categoryId ? '' : 'disabled'}>
              <option value="">${product && product.categoryId ? '-- اختر القسم الفرعي --' : 'اختر القسم الرئيسي أولاً'}</option>
            </select>
          </div>

          <div class="form-group">
            <label class="form-label text-xs font-bold text-slate-700">العلامة التجارية (Brand)</label>
            <select id="bm-brand-select" class="form-control text-xs" onchange="BulkUploadAdmin.onBrandSelect(this.value)">
              <option value="">اختر الماركة</option>
              ${this.brands.map(b => `
                <option value="${b.name}" ${product && product.brand === b.name ? 'selected' : ''}>${b.name} (${b.nameEn || ''})</option>
              `).join('')}
              <option value="__custom__">+ إدخال ماركة أخرى...</option>
            </select>
            <input type="text" id="bm-brand-custom" class="form-control text-xs mt-1.5 hidden" placeholder="اكتب اسم الماركة..." value="${product ? (product.brand || '') : ''}" />
          </div>

          <div class="form-group">
            <label class="form-label text-xs font-bold text-slate-700">وحدة البيع *</label>
            <select id="bm-sale-unit" class="form-control text-xs font-bold">
              <option value="قطعة" ${product && product.saleUnit === 'قطعة' ? 'selected' : ''}>قطعة</option>
              <option value="كيلو" ${product && product.saleUnit === 'كيلو' ? 'selected' : ''}>كيلو</option>
              <option value="لتر" ${product && product.saleUnit === 'لتر' ? 'selected' : ''}>لتر</option>
              <option value="علبة" ${product && product.saleUnit === 'علبة' ? 'selected' : ''}>علبة</option>
              <option value="كرتونة" ${product && product.saleUnit === 'كرتونة' ? 'selected' : ''}>كرتونة</option>
              <option value="طقم" ${product && product.saleUnit === 'طقم' ? 'selected' : ''}>طقم</option>
              <option value="متر" ${product && product.saleUnit === 'متر' ? 'selected' : ''}>متر</option>
            </select>
          </div>
        </div>

        <!-- Pricing (3 Distinct Prices) & Stock -->
        <div class="bg-emerald-50/50 border border-emerald-200 p-3.5 rounded-xl mb-3">
          <div class="flex items-center justify-between mb-2.5">
            <span class="text-xs font-black text-emerald-950 flex items-center gap-1.5"><i class="fa-solid fa-coins text-emerald-600"></i> الأسعار الثلاثة (التكلفة، قبل الخصم، بعد الخصم)</span>
            <span class="text-[11px] text-emerald-800 font-bold">كل سعر مفصول في مكانه الصحيح تماماً</span>
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
            <div class="form-group">
              <label class="form-label text-xs font-bold text-blue-900 flex items-center gap-1">
                <span>1. سعر التكلفة (التوريد) *</span>
              </label>
              <input type="number" id="bm-base-price" class="form-control text-xs font-bold border-blue-300 text-blue-900 bg-blue-50/20" value="${product ? (product.costPrice !== undefined ? product.costPrice : (product.basePrice || product.price || '')) : ''}" step="0.5" placeholder="مثال: 80" oninput="BulkUploadAdmin.calcFinalPrice()" required />
              <span class="text-[10px] text-slate-500 mt-0.5 block">السعر من التاجر أو المستثمر</span>
            </div>

            <div class="form-group">
              <label class="form-label text-xs font-bold text-slate-600 flex items-center gap-1">
                <span>2. السعر قبل الخصم</span>
              </label>
              <input type="number" id="bm-compare" class="form-control text-xs text-slate-600" value="${product && product.compareAtPrice ? product.compareAtPrice : ''}" step="0.5" placeholder="مثال: 150" />
              <span class="text-[10px] text-slate-400 mt-0.5 block">السعر الأصلي المشطوب</span>
            </div>

            <div class="form-group">
              <label class="form-label text-xs font-black text-emerald-900 flex items-center gap-1">
                <span>3. سعر البيع بعد الخصم *</span>
              </label>
              <input type="number" id="bm-price" class="form-control text-xs font-black text-emerald-700 bg-white border-emerald-400" value="${product ? product.price : ''}" step="0.5" placeholder="مثال: 120" required oninput="BulkUploadAdmin.calcBasePrice()" />
              <span class="text-[10px] text-emerald-600 font-bold mt-0.5 block">السعر النهائي للعميل</span>
            </div>

            <div class="form-group">
              <label class="form-label text-xs font-bold text-slate-700">نسبة الربح / العمولة (%)</label>
              <input type="number" id="bm-commission-rate" class="form-control text-xs font-bold" value="${product && product.commissionRate !== undefined ? product.commissionRate : 0}" min="0" max="100" step="0.1" placeholder="0" oninput="BulkUploadAdmin.calcFinalPrice()" />
              <span class="text-[10px] text-slate-400 mt-0.5 block">احتساب تلقائي للربح</span>
            </div>
          </div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
          <div class="form-group">
            <label class="form-label text-xs font-bold text-slate-700">الكمية بالمخزون *</label>
            <input type="number" id="bm-stock" class="form-control text-xs font-bold" value="${product ? product.stock : 50}" required />
          </div>
        </div>

        <!-- Shipping Settings -->
        <div class="bg-amber-50/60 border border-amber-200 p-3.5 rounded-xl mb-3">
          <div class="flex items-center justify-between mb-2 flex-wrap gap-2">
            <label class="form-label font-extrabold text-amber-900 mb-0 flex items-center gap-1.5 text-xs">
              <i class="fa-solid fa-truck text-emerald-600"></i> إعدادات شحن المنتج
            </label>
            <label class="flex items-center gap-1.5 text-xs font-bold text-emerald-800 cursor-pointer bg-white px-2.5 py-1 rounded-lg border border-emerald-300">
              <input type="checkbox" id="bm-free-shipping" ${isFree ? 'checked' : ''} onchange="BulkUploadAdmin.toggleFreeShipping(this.checked)" class="accent-emerald-600 w-4 h-4" />
              <span>شحن مجاني لهذا المنتج 🎁</span>
            </label>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-3 mb-2">
            <div class="form-group">
              <label class="form-label text-[11px] font-bold text-slate-700">سعر الشحن الأساسي (ج.م) *</label>
              <input type="number" id="bm-shipping-cost" class="form-control text-xs" value="${isFree ? 0 : defaultShipping}" ${isFree ? 'disabled' : ''} required />
            </div>
            <div class="form-group flex flex-col justify-end">
              <button type="button" onclick="BulkUploadAdmin.toggleGovShippingSection()" class="bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold py-2 px-3 rounded-lg border border-slate-300 flex items-center justify-between">
                <span>تخصيص الشحن للمحافظات (27 محافظة)</span>
                <i class="fa-solid fa-chevron-down text-slate-400"></i>
              </button>
            </div>
          </div>

          <!-- Collapsible Governorate Shipping -->
          <div id="bm-gov-shipping-section" class="hidden mt-3 pt-3 border-t border-amber-200/70">
            <div class="text-[11px] font-bold text-slate-600 mb-2 flex items-center justify-between flex-wrap gap-2">
              <span>اختر محافظات الشحن المتاحة وحدد تكلفة الشحن لكل محافظة:</span>
              <div class="flex items-center gap-1.5">
                <button type="button" onclick="BulkUploadAdmin.selectAllGovs()" class="text-xs bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded border border-emerald-200 font-bold hover:bg-emerald-100">
                  تحديد الكل
                </button>
                <button type="button" onclick="BulkUploadAdmin.deselectAllGovs()" class="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded border border-slate-200 font-bold hover:bg-slate-200">
                  إلغاء التحديد
                </button>
              </div>
            </div>
            <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 max-h-48 overflow-y-auto p-1 bg-white rounded-lg border border-slate-200">
              ${EGYPT_GOVS_PRODUCTS.map(gov => {
                const isAllowed = !product || !product.allowedGovernorates || product.allowedGovernorates.length === 0 || product.allowedGovernorates.includes(gov);
                return `
                  <div class="p-1.5 bg-slate-50 rounded border border-slate-100 flex items-center justify-between gap-1">
                    <label class="flex items-center gap-1 cursor-pointer truncate">
                      <input type="checkbox" class="bm-gov-check accent-emerald-600 w-3.5 h-3.5" data-gov="${gov}" ${isAllowed ? 'checked' : ''} />
                      <span class="text-[11px] font-bold text-slate-700 truncate">${gov}</span>
                    </label>
                    <input 
                      type="number" 
                      id="bm-gov-${gov}" 
                      class="form-control text-[11px] p-1 text-center w-14 font-bold" 
                      value="${this.governorateShippingMap[gov] !== undefined ? this.governorateShippingMap[gov] : ''}" 
                      placeholder="افتراضي" 
                    />
                  </div>
                `;
              }).join('')}
            </div>
          </div>
        </div>

        <!-- Product Images (Up to 15 images) -->
        <div class="bg-slate-50 border border-slate-200 p-3.5 rounded-xl mb-3">
          <div class="flex items-center justify-between mb-2">
            <label class="form-label font-extrabold text-slate-800 mb-0 flex items-center gap-1.5 text-xs">
              <i class="fa-solid fa-images text-emerald-600"></i> صور المنتج (حتى 15 صورة)
            </label>
            <span class="text-[11px] text-slate-500 font-bold" id="bm-images-counter">
              ${this.uploadedImages.length} من 15 صورة
            </span>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-2 mb-2">
            <!-- Upload from PC -->
            <label class="bg-white hover:bg-emerald-50 text-emerald-700 border border-emerald-300 border-dashed rounded-lg p-2.5 flex items-center justify-center gap-2 cursor-pointer transition text-xs font-bold">
              <i class="fa-solid fa-cloud-arrow-up"></i>
              <span>رفع صور من جهازك</span>
              <input type="file" accept="image/*" multiple onchange="BulkUploadAdmin.handleFileUpload(event)" class="hidden" />
            </label>

            <!-- Add by URL -->
            <div class="flex items-center gap-1.5">
              <input type="text" dir="ltr" inputmode="url" id="bm-image-url-input" class="form-control text-xs" placeholder="أو الصق رابط صورة..." />
              <button type="button" onclick="BulkUploadAdmin.addImageByUrl()" class="bg-slate-800 hover:bg-slate-900 text-white px-3 py-2 rounded-lg text-xs font-bold shrink-0">
                إضافة
              </button>
            </div>
          </div>

          <!-- Thumbnails Grid -->
          <div id="bm-images-preview-grid" class="flex flex-wrap gap-2 min-h-12 p-1.5 bg-white rounded-lg border border-slate-200">
            ${this.renderImagesPreview()}
          </div>
        </div>

        <!-- Video URL & Variations -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
          <div class="form-group">
            <label class="form-label text-xs font-bold text-slate-700 flex items-center gap-1">
              <i class="fa-brands fa-youtube text-rose-600"></i> رابط فيديو للمنتج (YouTube / Direct)
            </label>
            <input type="text" dir="ltr" inputmode="url" id="bm-video-url" class="form-control text-xs" value="${this.productVideoUrl}" placeholder="https://youtube.com/watch?v=..." />
          </div>

          <div class="form-group">
            <label class="form-label text-xs font-bold text-slate-700 flex items-center gap-1">
              <i class="fa-solid fa-shield-halved text-emerald-600"></i> نص الضمان وسياسة الاسترجاع
            </label>
            <input type="text" id="bm-warranty" class="form-control text-xs" value="${product ? (product.warrantyText || '') : 'ضمان استبدال خلال 14 يوم في حالة عيب الصناعة'}" />
          </div>
        </div>

        <!-- Description -->
        <div class="form-group mb-3">
          <label class="form-label text-xs font-bold text-slate-700">وصف ومميزات المنتج</label>
          <textarea id="bm-desc" class="form-control text-xs" rows="3" placeholder="اكتب تفاصيل ومواصفات المنتج...">${product ? product.description : ''}</textarea>
        </div>

        <!-- Toggles: Featured & Active -->
        <div class="flex items-center gap-4 bg-slate-50 p-2.5 rounded-xl border border-slate-200 mb-4 text-xs font-bold">
          <label class="flex items-center gap-1.5 cursor-pointer text-slate-700">
            <input type="checkbox" id="bm-active" ${product ? (product.isActive !== false ? 'checked' : '') : 'checked'} class="accent-emerald-600 w-4 h-4" />
            <span>منتج نشط ومتاح للبيع بالموقع</span>
          </label>
          <label class="flex items-center gap-1.5 cursor-pointer text-slate-700">
            <input type="checkbox" id="bm-featured" ${product && product.isFeatured ? 'checked' : ''} class="accent-amber-500 w-4 h-4" />
            <span>منتج مميز بالصفحة الرئيسية (Featured) ⭐</span>
          </label>
        </div>

        <!-- Submit Actions -->
        <div class="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
          <button type="button" onclick="App.closeModal()" class="btn btn-secondary text-xs px-4 py-2">
            إلغاء
          </button>
          <button type="submit" class="bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs px-6 py-2.5 rounded-xl shadow-sm transition flex items-center gap-1.5">
            <i class="fa-solid fa-check"></i>
            <span>${product ? 'تحديث المنتج في الشيت' : 'حفظ المنتج في الشيت'}</span>
          </button>
        </div>
      </form>
    `;

    App.openModal(titleText, modalBody);

    // Populate subcategories
    const activeCatId = product ? product.categoryId : (this.categories[0] ? this.categories[0].id : null);
    const activeSubId = product ? (product.subcategoryId || product.subcategory) : null;
    if (activeCatId) {
      const catSelect = document.getElementById('bm-category');
      if (catSelect) catSelect.value = activeCatId;
      this.onCategoryChanged(activeCatId, activeSubId);
    }
  },

  onCategoryChanged(catId, preselectedSubId = null) {
    const subSelect = document.getElementById('bm-subcategory');
    if (!subSelect) return;

    if (!catId) {
      subSelect.disabled = true;
      subSelect.innerHTML = '<option value="">اختر القسم الرئيسي أولاً</option>';
      return;
    }

    subSelect.disabled = false;
    const matchingSubs = this.subcategories.filter(s => String(s.categoryId) === String(catId));
    if (matchingSubs.length === 0) {
      subSelect.innerHTML = '<option value="">لا توجد أقسام فرعية لهذا القسم</option>';
    } else {
      subSelect.innerHTML = `
        <option value="">-- اختر القسم الفرعي (إجباري) * --</option>
        ${matchingSubs.map(s => `
          <option value="${s.id}" ${preselectedSubId && (String(s.id) === String(preselectedSubId) || s.name === preselectedSubId) ? 'selected' : ''}>
            ${s.name} ${s.discountText ? `(${s.discountText})` : ''}
          </option>
        `).join('')}
      `;
    }
  },

  onBrandSelect(val) {
    const customInput = document.getElementById('bm-brand-custom');
    if (!customInput) return;
    if (val === '__custom__') {
      customInput.classList.remove('hidden');
      customInput.focus();
    } else {
      customInput.classList.add('hidden');
      customInput.value = val;
    }
  },

  toggleFreeShipping(isFree) {
    const costInput = document.getElementById('bm-shipping-cost');
    if (costInput) {
      if (isFree) {
        costInput.value = 0;
        costInput.disabled = true;
      } else {
        costInput.disabled = false;
        costInput.value = 25;
      }
    }
  },

  toggleGovShippingSection() {
    const sec = document.getElementById('bm-gov-shipping-section');
    if (sec) sec.classList.toggle('hidden');
  },

  selectAllGovs() {
    const checks = document.querySelectorAll('.bm-gov-check');
    checks.forEach(c => c.checked = true);
  },

  deselectAllGovs() {
    const checks = document.querySelectorAll('.bm-gov-check');
    checks.forEach(c => c.checked = false);
  },

  renderImagesPreview() {
    if (this.uploadedImages.length === 0) {
      return '<span class="text-xs text-slate-400 p-2">لم يتم إضافة صور حتى الآن</span>';
    }
    return this.uploadedImages.map((img, i) => `
      <div class="relative w-12 h-12 rounded-lg border border-slate-200 overflow-hidden group shadow-sm">
        <img src="${img}" class="w-full h-full object-cover" loading="lazy" decoding="async" />
        <button 
          type="button" 
          onclick="BulkUploadAdmin.removeImage(${i})" 
          class="absolute inset-0 bg-rose-600/80 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition text-xs" 
          title="حذف الصورة"
        >
          <i class="fa-solid fa-trash-can"></i>
        </button>
      </div>
    `).join('');
  },

  updateImagesUI() {
    const grid = document.getElementById('bm-images-preview-grid');
    const counter = document.getElementById('bm-images-counter');
    if (grid) grid.innerHTML = this.renderImagesPreview();
    if (counter) counter.innerText = `${this.uploadedImages.length} من 15 صورة`;
  },

  async handleFileUpload(event) {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    for (let i = 0; i < files.length; i++) {
      if (this.uploadedImages.length >= 15) {
        App.showToast('تم بلوغ الحد الأقصى للصور (15 صورة)', 'warning');
        break;
      }
      const file = files[i];
      const formData = new FormData();
      formData.append('image', file);
      try {
        const res = await API.post('/upload', formData);
        if (res.success && res.url) {
          this.uploadedImages.push(res.url);
        }
      } catch (err) {
        App.showToast('فشل رفع إحدى الصور', 'error');
      }
    }
    this.updateImagesUI();
  },

  addImageByUrl() {
    const input = document.getElementById('bm-image-url-input');
    if (!input || !input.value.trim()) return;
    if (this.uploadedImages.length >= 15) {
      App.showToast('الحد الأقصى هو 15 صورة', 'warning');
      return;
    }
    this.uploadedImages.push(input.value.trim());
    input.value = '';
    this.updateImagesUI();
  },

  removeImage(index) {
    this.uploadedImages.splice(index, 1);
    this.updateImagesUI();
  },

  calcFinalPrice() {
    const baseInput = document.getElementById('bm-base-price');
    const commInput = document.getElementById('bm-commission-rate');
    const finalInput = document.getElementById('bm-price');
    if (!baseInput || !commInput || !finalInput) return;
    const base = parseFloat(baseInput.value) || 0;
    const rate = parseFloat(commInput.value) || 0;
    if (base > 0) {
      const finalPrice = Math.round((base * (1 + rate / 100)) * 10) / 10;
      finalInput.value = finalPrice;
    }
  },

  calcBasePrice() {
    const baseInput = document.getElementById('bm-base-price');
    const commInput = document.getElementById('bm-commission-rate');
    const finalInput = document.getElementById('bm-price');
    if (!baseInput || !commInput || !finalInput) return;
    const finalPrice = parseFloat(finalInput.value) || 0;
    const rate = parseFloat(commInput.value) || 0;
    if (finalPrice > 0) {
      const base = Math.round((finalPrice / (1 + rate / 100)) * 10) / 10;
      baseInput.value = base;
    }
  },

  // Save Modal Product into Staged Sheet
  saveModalProduct(event) {
    event.preventDefault();

    const title = (document.getElementById('bm-title')?.value || '').trim();
    const categoryId = document.getElementById('bm-category')?.value;
    const subcategoryId = document.getElementById('bm-subcategory')?.value;
    const price = Number(document.getElementById('bm-price')?.value);
    const basePrice = document.getElementById('bm-base-price')?.value ? Number(document.getElementById('bm-base-price').value) : price;
    const costPrice = basePrice;
    const commissionRate = document.getElementById('bm-commission-rate')?.value ? Number(document.getElementById('bm-commission-rate').value) : 0;
    const compareAtPrice = document.getElementById('bm-compare')?.value ? Number(document.getElementById('bm-compare').value) : null;
    const stock = Number(document.getElementById('bm-stock')?.value) || 50;
    const saleUnit = document.getElementById('bm-sale-unit')?.value || 'قطعة';

    const brandSelect = document.getElementById('bm-brand-select')?.value;
    const brandCustom = document.getElementById('bm-brand-custom')?.value;
    const brand = brandSelect === '__custom__' ? (brandCustom || '').trim() : (brandSelect || '').trim();

    const isFreeShipping = document.getElementById('bm-free-shipping')?.checked || false;
    const shippingCost = isFreeShipping ? 0 : (Number(document.getElementById('bm-shipping-cost')?.value) || 25);

    const videoUrl = (document.getElementById('bm-video-url')?.value || '').trim();
    const warrantyText = (document.getElementById('bm-warranty')?.value || '').trim();
    const description = (document.getElementById('bm-desc')?.value || '').trim();
    const isActive = document.getElementById('bm-active')?.checked ?? true;
    const isFeatured = document.getElementById('bm-featured')?.checked ?? false;

    if (!title || isNaN(price)) {
      App.showToast('عنوان المنتج وسعر البيع مطلوبان', 'warning');
      return;
    }

    if (!categoryId || !subcategoryId) {
      App.showToast('يجب اختيار القسم الرئيسي والقسم الفرعي التابع له قبل حفظ المنتج', 'warning');
      return;
    }

    // Read governorate specific shipping rates and allowed governorates
    const allowedGovChecks = document.querySelectorAll('.bm-gov-check:checked');
    const allowedGovernorates = Array.from(allowedGovChecks).map(c => c.getAttribute('data-gov'));

    const govRates = {};
    EGYPT_GOVS_PRODUCTS.forEach(gov => {
      const el = document.getElementById(`bm-gov-${gov}`);
      if (el && el.value !== '') {
        govRates[gov] = Number(el.value);
      }
    });

    const productPayload = {
      title,
      description,
      categoryId,
      subcategoryId,
      subcategory: subcategoryId,
      brand,
      price,
      costPrice,
      basePrice,
      merchantPrice: costPrice,
      commissionRate,
      compareAtPrice,
      stock,
      saleUnit,
      shippingCost,
      isFreeShipping,
      governorateShipping: govRates,
      allowedGovernorates,
      warrantyText,
      images: this.uploadedImages.length > 0 ? [...this.uploadedImages] : [],
      videoUrl,
      variations: this.variationsList,
      isActive,
      isFeatured
    };

    if (this.editingIndex >= 0) {
      this.stagedProducts[this.editingIndex] = productPayload;
      App.showToast(`تم تحديث بيانات المنتج #${this.editingIndex + 1} بالشيت`, 'success');
    } else {
      this.stagedProducts.push(productPayload);
      App.showToast('تمت إضافة المنتج إلى الشيت بنجاح!', 'success');
    }

    App.closeModal();
    this.renderSheet();
  },

  removeStagedProduct(index) {
    if (confirm(`هل أنت متأكد من حذف المنتج #${index + 1} من الشيت؟`)) {
      this.stagedProducts.splice(index, 1);
      App.showToast('تم حذف المنتج من الشيت', 'info');
      this.renderSheet();
    }
  },

  clearSheet() {
    if (confirm('هل أنت متأكد من مسح جميع المنتجات المدرجة في الشيت حالياً؟')) {
      this.stagedProducts = [];
      App.showToast('تم تفريغ الشيت', 'info');
      this.renderSheet();
    }
  },

  // One-click Publish Staged Batch to Backend DB
  async publishBatch() {
    const isInv = this.ownerType === 'investor';
    const codeInput = document.getElementById('bulk-owner-code');
    const nameInput = document.getElementById('bulk-owner-name');
    const capInput = document.getElementById('bulk-investor-capital');

    const code = (codeInput?.value || this.ownerCode || (isInv ? this.investorCode : this.merchantCode) || '').trim();
    const name = (nameInput?.value || this.ownerName || (isInv ? this.investorName : this.merchantName) || '').trim();
    const cap = isInv ? (typeof Utils !== 'undefined' ? Utils.parseNumber(capInput?.value || this.capital) : Number(capInput?.value || this.capital)) : null;

    if (!code || !name) {
      App.showToast(`يجب تحديد أو إدخال كود واسم ${isInv ? 'المستثمر' : 'التاجر'} بأعلى الشيت قبل النشر`, 'warning');
      if (!code && codeInput) codeInput.focus();
      else if (!name && nameInput) nameInput.focus();
      return;
    }

    if (isInv) {
      if (!cap || isNaN(cap) || cap <= 0) {
        App.showToast('يجب إدخال رأس المال للمستثمر (خانة إجبارية) قبل نشر المنتجات', 'warning');
        if (capInput) capInput.focus();
        return;
      }
      this.capital = cap;

      // Capital must equal Σ (cost price × quantity); every row needs both
      const { total: stagedTotalCost, problems } = this.sheetCapital();
      if (problems.length) {
        App.showToast(`كمّل بيانات الشيت قبل النشر: ${problems.slice(0, 3).join(' • ')}`, 'warning');
        return;
      }
      if (Math.abs(stagedTotalCost - cap) >= 1) {
        const diff = Math.round(Math.abs(cap - stagedTotalCost) * 100) / 100;
        const dir = stagedTotalCost > cap ? 'تجاوز' : 'أقل من';
        App.showToast(`المنتجات في الشيت (${stagedTotalCost.toLocaleString('en-US')} ج.م) لا توافق رأس المال المكتوب (${cap.toLocaleString('en-US')} ج.م). الفارق: ${diff.toLocaleString('en-US')} ج.م (${dir} رأس المال). يجب أن تتطابق تكلفة البضاعة مع رأس المال.`, 'warning');
        return;
      }
    }

    if (this.stagedProducts.length === 0) {
      App.showToast('لا توجد منتجات بالشيت لنشرها. أضف منتجاً أولاً!', 'warning');
      return;
    }

    const btn = document.getElementById('btn-publish-batch');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> جاري تنزيل ونشر المنتجات...';
    }

    const sanitizedProducts = (this.stagedProducts || []).map(item => {
      const clean = { ...item, ownerType: isInv ? 'investor' : 'merchant' };
      if (isInv) {
        clean.investorCode = code;
        clean.investorName = name;
        clean.investorId = this.ownerId || null;
        clean.merchantCode = '';
        clean.merchantName = '';
        clean.merchantId = null;
      } else {
        clean.merchantCode = code;
        clean.merchantName = name;
        clean.merchantId = this.ownerId || null;
        clean.investorCode = '';
        clean.investorName = '';
        clean.investorId = null;
      }
      return clean;
    });

    try {
      const res = await API.post('/products/bulk', {
        ownerType: this.ownerType,
        ownerCode: code,
        ownerName: name,
        ownerId: this.ownerId,
        capital: isInv ? cap : undefined,
        merchantCode: isInv ? '' : code,
        merchantName: isInv ? '' : name,
        investorCode: isInv ? code : '',
        investorName: isInv ? name : '',
        investorId: isInv ? this.ownerId : null,
        capitalMode: isInv ? (this.capitalMode === 'add' ? 'add' : 'new') : undefined,
        capitalBatchId: isInv && this.capitalMode === 'add' ? (document.getElementById('bulk-capital-batch')?.value || this.capitalBatchId || '') : undefined,
        capitalBatchLabel: isInv && this.capitalMode !== 'add' ? (document.getElementById('bulk-capital-label')?.value || this.capitalBatchLabel || '') : undefined,
        products: sanitizedProducts
      });

      if (res.success) {
        const count = res.count || this.stagedProducts.length;
        this.stagedProducts = [];
        const entityLabel = isInv ? 'للمستثمر' : 'للتاجر';
        App.showToast(`🎉 مبروك! تم رفع وتنزيل ${count} منتج بنجاح ${entityLabel} "${name}"!`, 'success');

        // Re-render empty sheet and offer navigation
        this.renderSheet();

        const successNotice = document.createElement('div');
        successNotice.className = isInv 
          ? 'mt-4 p-4 rounded-xl bg-blue-50 border border-blue-300 text-blue-950 text-xs font-bold flex items-center justify-between flex-wrap gap-2 shadow-sm'
          : 'mt-4 p-4 rounded-xl bg-emerald-50 border border-emerald-300 text-emerald-900 text-xs font-bold flex items-center justify-between flex-wrap gap-2 shadow-sm';
        
        const filterLink = isInv 
          ? `#/admin/products?investorCode=${encodeURIComponent(code)}`
          : `#/admin/products?merchantCode=${encodeURIComponent(code)}`;
        
        const btnClass = isInv 
          ? 'bg-blue-700 hover:bg-blue-800 text-white px-3.5 py-2 rounded-lg text-xs font-black shadow-sm'
          : 'bg-emerald-700 hover:bg-emerald-800 text-white px-3.5 py-2 rounded-lg text-xs font-black shadow-sm';

        successNotice.innerHTML = `
          <div class="flex items-center gap-2">
            <i class="fa-solid fa-circle-check text-base ${isInv ? 'text-blue-600' : 'text-emerald-600'}"></i>
            <span>تم ربط ونشر كافة المنتجات بنجاح في قائمة منتجات ${isInv ? 'المستثمر' : 'التاجر'} (${name} - ${code}).</span>
          </div>
          <div class="flex items-center gap-2">
            <a href="${filterLink}" class="${btnClass}">
              عرض منتجات ${isInv ? 'المستثمر' : 'التاجر'} (${code}) الآن &larr;
            </a>
            ${isInv ? `
              <a href="#/admin/investors" class="bg-slate-700 hover:bg-slate-800 text-white px-3 py-2 rounded-lg text-xs font-bold">
                عرض تقرير حساب المستثمر
              </a>
            ` : ''}
          </div>
        `;
        const container = document.querySelector('.space-y-6');
        if (container) container.prepend(successNotice);

        // New investor account created automatically: show its login ONCE (it is not stored readable)
        if (res.newInvestorLogin) {
          const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
          App.openModal('بيانات دخول المستثمر الجديد', `
            <div class="text-right text-xs space-y-3" dir="rtl">
              <div class="bg-amber-50 border border-amber-200 text-amber-900 font-bold rounded-xl p-3">
                احفظ البيانات دي دلوقتي وابعتها للمستثمر. كلمة المرور مش هتظهر تاني (ممكن تغيرها بعدين من صفحة المستثمرين).
              </div>
              <div class="bg-slate-50 border rounded-xl p-3 font-mono">
                <div>اسم المستخدم: <b>${esc(res.newInvestorLogin.username)}</b></div>
                <div>كلمة المرور: <b>${esc(res.newInvestorLogin.password)}</b></div>
              </div>
            </div>
          `);
        }
        this.capitalMode = 'new';
        this.capitalBatchId = '';
        this.capitalBatchLabel = '';
        if (isInv) {
          // refresh investor list so the new batch appears for the next upload
          API.get('/investors').then(r => { if (r && r.investors) this.investorsList = r.investors; }).catch(() => {});
        }
      } else {
        App.showToast(res.message || 'فشل نشر المنتجات', 'error');
        if (btn) {
          btn.disabled = false;
          btn.innerHTML = `<i class="fa-solid fa-cloud-arrow-up text-sm"></i> تنزيل ونشر المنتجات (${this.stagedProducts.length})`;
        }
      }
    } catch (err) {
      console.error('Publish batch error:', err);
      App.showToast(err.message || 'حدث خطأ أثناء رفع المنتجات الجماعي', 'error');
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = `<i class="fa-solid fa-cloud-arrow-up text-sm"></i> تنزيل ونشر المنتجات (${this.stagedProducts.length})`;
      }
    }
  },

  togglePresetsModal() {
    this.showPresets = !this.showPresets;
    const panel = document.getElementById('smart-presets-panel');
    if (panel) {
      panel.classList.toggle('hidden', !this.showPresets);
    }
  },

  handleDragOver(e) {
    e.preventDefault();
    e.stopPropagation();
    const zone = document.getElementById('smart-drop-zone');
    if (zone) zone.classList.add('border-emerald-300', 'bg-emerald-950/40');
  },

  handleDragLeave(e) {
    e.preventDefault();
    e.stopPropagation();
    const zone = document.getElementById('smart-drop-zone');
    if (zone) zone.classList.remove('border-emerald-300', 'bg-emerald-950/40');
  },

  handleDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    const zone = document.getElementById('smart-drop-zone');
    if (zone) zone.classList.remove('border-emerald-300', 'bg-emerald-950/40');
    if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      this.handleFileInput(e.dataTransfer.files[0]);
    }
  },

  async handleFileInput(file) {
    if (!file) return;

    this.isExtracting = true;
    const statusBox = document.getElementById('smart-extract-status');
    if (statusBox) statusBox.classList.remove('hidden');

    const isInvPreset = this.ownerType === 'investor';
    const currentCode = (this.ownerCode || (isInvPreset ? this.investorCode : this.merchantCode) || '').trim();
    const currentName = (this.ownerName || (isInvPreset ? this.investorName : this.merchantName) || '').trim();

    const formData = new FormData();
    formData.append('file', file);
    formData.append('presets', JSON.stringify({
      priceMarkupPercent: this.priceMarkupPercent,
      defaultShippingPrice: this.defaultShippingPrice,
      defaultStock: this.defaultStock,
      defaultCategoryId: this.defaultCategoryId,
      ownerType: this.ownerType,
      targetInvestorCode: isInvPreset ? currentCode : '',
      targetInvestorName: isInvPreset ? currentName : '',
      targetMerchantCode: !isInvPreset ? currentCode : '',
      targetMerchantName: !isInvPreset ? currentName : ''
    }));

    try {
      const res = await API.request('/products/smart-upload-parse', {
        method: 'POST',
        body: formData
      });

      if (res && res.success && Array.isArray(res.products)) {
        const hasPreselectedOwner = Boolean((this.ownerCode || this.ownerName || '').trim());
        const effectiveType = hasPreselectedOwner
          ? this.ownerType
          : (res.ownerType || this.ownerType || 'merchant');

        this.ownerType = effectiveType === 'investor' ? 'investor' : 'merchant';

        if (this.ownerType === 'investor') {
          this.merchantCode = '';
          this.merchantName = '';
          if (!hasPreselectedOwner) {
            const extCode = res.investorCode || '';
            const extName = res.investorName || '';
            if (extCode) {
              this.investorCode = extCode;
              this.ownerCode = extCode;
              const matched = (this.investorsList || []).find(x => x.code && x.code.toUpperCase() === extCode.toUpperCase());
              if (matched) {
                this.ownerId = matched.id;
                this.investorId = matched.id;
              }
            }
            if (extName) {
              this.investorName = extName;
              this.ownerName = extName;
            }
            if (res.capital && Number(res.capital) > 0) this.capital = res.capital;
          }
        } else {
          this.investorCode = '';
          this.investorName = '';
          this.investorId = null;
          this.capital = '';
          if (!hasPreselectedOwner) {
            if (res.merchantCode) {
              this.merchantCode = res.merchantCode;
              this.ownerCode = res.merchantCode;
              const matched = (this.merchantsList || []).find(x => x.code && x.code.toUpperCase() === res.merchantCode.toUpperCase());
              if (matched) this.ownerId = matched.id;
            }
            if (res.merchantName) {
              this.merchantName = res.merchantName;
              this.ownerName = res.merchantName;
            }
          }
        }

        const sanitizedExtracted = res.products.map(p => ({
          ...p,
          ownerType: this.ownerType,
          investorCode: this.ownerType === 'investor' ? (this.ownerCode || this.investorCode || p.investorCode || '') : '',
          investorName: this.ownerType === 'investor' ? (this.ownerName || this.investorName || p.investorName || '') : '',
          investorId: this.ownerType === 'investor' ? (this.ownerId || p.investorId || null) : null,
          merchantCode: this.ownerType === 'merchant' ? (this.ownerCode || this.merchantCode || p.merchantCode || '') : '',
          merchantName: this.ownerType === 'merchant' ? (this.ownerName || this.merchantName || p.merchantName || '') : '',
          merchantId: this.ownerType === 'merchant' ? (this.ownerId || p.merchantId || null) : null
        }));

        // Append to staged products
        this.stagedProducts = [...this.stagedProducts, ...sanitizedExtracted];
        this.isExtracting = false;
        this.renderSheet();

        App.showToast(`✨ تم استخراج ${res.products.length} منتج بنجاح بالذكاء الاصطناعي وجاهزة للمراجعة!`, 'success');
      } else {
        throw new Error(res?.message || 'فشل استخراج المنتجات من الملف');
      }
    } catch (err) {
      console.error('Smart AI file upload error:', err);
      this.isExtracting = false;
      if (statusBox) statusBox.classList.add('hidden');
      App.showToast(err.message || 'فشل قراءة الملف بالذكاء الاصطناعي. يُرجى التحقق من المستند', 'error');
    } finally {
      const fileInp = document.getElementById('smart-file-input');
      if (fileInp) fileInp.value = '';
    }
  },

  async loadDemoInvoice() {
    this.isExtracting = true;
    const statusBox = document.getElementById('smart-extract-status');
    if (statusBox) statusBox.classList.remove('hidden');

    const demoText = `
كود التاجر: TR-500
اسم التاجر: شركة الفيروز للتجارة والتوريدات
رقم الهاتف: 01099887766

قائمة المنتجات والتوريد:
1. ساعة ذكية T900 Ultra شاشة كبيرة وقياس نبضات ومقاومة للماء | 280 ج.م | كمية: 40 | ساعات
2. سماعة بلوتوث لاسلكية P9 صوت ستيريو ومايك عازل للضوضاء | 160 ج.م | كمية: 60 | الكترونيات
3. باور بانك 20000 مللي أمبير شحن سريع مخرجين تايب سي | 420 ج.م | كمية: 30 | موبايلات
4. حذاء سنيكرز رياضي كاجوال مستورد خفيف ومريح | 250 ج.م | كمية: 50 | احذية
5. طقم حلل جرانيت كوري 10 قطع قاعدة حرارية غير لاصقة | 1100 ج.م | كمية: 15 | مطبخ
    `.trim();

    try {
      const res = await API.request('/products/smart-upload-parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rawText: demoText,
          presets: {
            priceMarkupPercent: this.priceMarkupPercent,
            defaultShippingPrice: this.defaultShippingPrice,
            defaultStock: this.defaultStock,
            defaultCategoryId: this.defaultCategoryId
          }
        })
      });

      if (res && res.success && Array.isArray(res.products)) {
        this.ownerType = 'merchant';
        this.ownerId = null;
        this.investorCode = '';
        this.investorName = '';
        this.investorId = null;
        this.capital = '';
        this.merchantCode = res.merchantCode || '';
        this.merchantName = res.merchantName || '';
        this.ownerCode = this.merchantCode;
        this.ownerName = this.merchantName;
        const demoProducts = res.products.map(p => ({
          ...p,
          ownerType: 'merchant',
          investorCode: '',
          investorName: '',
          investorId: null,
          merchantCode: this.merchantCode,
          merchantName: this.merchantName
        }));
        this.stagedProducts = [...this.stagedProducts, ...demoProducts];
        this.isExtracting = false;
        this.renderSheet();
        App.showToast(`✨ تم تجهيز ${res.products.length} منتجات نموذجية بالذكاء الاصطناعي وجاهزة للمراجعة!`, 'success');
      } else {
        throw new Error(res?.message || 'فشل تجهيز الورقة النموذجية');
      }
    } catch (err) {
      console.error('Load demo invoice error:', err);
      this.isExtracting = false;
      if (statusBox) statusBox.classList.add('hidden');
      App.showToast(err.message || 'فشل تشغيل المعالجة بالذكاء الاصطناعي', 'error');
    }
  }
};
