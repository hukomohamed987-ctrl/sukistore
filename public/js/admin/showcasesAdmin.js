/**
 * Dashboard — "واجهات العرض": picture cards that slide on the home page.
 * Each card opens its own page with the products of a merchant / investor / category / brand,
 * or products picked by hand.
 */
const ShowcasesAdmin = {
  cards: [],
  section: {},
  options: { merchants: [], investors: [], categories: [], brands: [] },
  editing: null,      // card being edited (null = new)
  picked: [],         // [{id, title, image}] for "products"
  searchTimer: null,

  TYPES: {
    merchant: { label: 'تاجر', icon: 'fa-store' },
    investor: { label: 'مستثمر', icon: 'fa-briefcase' },
    category: { label: 'قسم', icon: 'fa-layer-group' },
    brand: { label: 'ماركة', icon: 'fa-tag' },
    products: { label: 'منتجات أختارها بنفسي', icon: 'fa-hand-pointer' }
  },

  esc(v) { return String(v === undefined || v === null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); },

  async render() {
    if (!AdminLayout.hasPermission('canManageCategories')) {
      App.showToast('ليس لديك صلاحية لإدارة واجهات العرض', 'error');
      window.location.hash = '#/admin';
      return;
    }
    AdminLayout.render('showcases', `<div class="py-12 text-center text-slate-400"><i class="fa-solid fa-spinner fa-spin text-3xl text-emerald-600"></i></div>`);
    try {
      const res = await API.get('/showcases/admin/all');
      this.cards = res.showcases || [];
      this.section = res.section || {};
      this.options = res.options || this.options;
      this.renderPage();
    } catch (err) {
      AdminLayout.render('showcases', `<div class="p-8 text-center text-rose-600">${this.esc(err.message)}</div>`);
    }
  },

  renderPage() {
    const s = this.section;
    const html = `
      <div>
        <div class="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div>
            <h1 class="text-2xl font-extrabold text-slate-900">واجهات العرض</h1>
            <p class="text-xs text-slate-500 mt-1">كروت بصور بتتحرك في الصفحة الرئيسية. كل كارت بيفتح صفحة فيها منتجات التاجر أو المستثمر أو القسم أو الماركة.</p>
          </div>
          <button onclick="ShowcasesAdmin.openEditor()" class="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-4 py-2.5 rounded-xl text-sm flex items-center gap-2">
            <i class="fa-solid fa-plus"></i> إضافة واجهة
          </button>
        </div>

        <!-- Section settings -->
        <div class="admin-card p-5 mb-6">
          <h3 class="font-extrabold text-sm text-slate-800 mb-3 flex items-center gap-2"><i class="fa-solid fa-sliders text-emerald-600"></i> إعدادات القسم في الصفحة الرئيسية</h3>
          <div class="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs items-end">
            <div><label class="form-label font-bold">عنوان القسم</label><input id="sc-sec-title" class="form-control text-xs" value="${this.esc(s.title)}" /></div>
            <div><label class="form-label font-bold">جملة تحت العنوان</label><input id="sc-sec-sub" class="form-control text-xs" value="${this.esc(s.subtitle)}" /></div>
            <div><label class="form-label font-bold">سرعة الحركة</label>
              <select id="sc-sec-speed" class="form-control text-xs">
                ${[['slow', 'هادية'], ['normal', 'متوسطة'], ['fast', 'سريعة']].map(([v, l]) => `<option value="${v}" ${s.speed === v ? 'selected' : ''}>${l}</option>`).join('')}
              </select>
            </div>
            <div class="flex items-center gap-3">
              <label class="flex items-center gap-2 font-bold cursor-pointer"><input type="checkbox" id="sc-sec-enabled" class="w-4 h-4 accent-emerald-600" ${s.enabled !== false ? 'checked' : ''}/> يظهر في الرئيسية</label>
              <button onclick="ShowcasesAdmin.saveSection()" class="bg-slate-800 hover:bg-slate-900 text-white font-bold px-4 py-2 rounded-lg">حفظ</button>
            </div>
          </div>
        </div>

        <!-- Cards -->
        <div class="admin-card p-5">
          <div class="flex items-center justify-between mb-3">
            <h3 class="font-extrabold text-sm text-slate-800">الواجهات (${this.cards.length})</h3>
            <span class="text-[11px] text-slate-400">رتّبها بالأسهم — نفس الترتيب بيظهر في الموقع</span>
          </div>
          ${this.cards.length ? `
            <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
              ${this.cards.map((c, i) => this.cardHtml(c, i)).join('')}
            </div>` : `
            <div class="text-center py-12 text-slate-400">
              <i class="fa-regular fa-images text-4xl mb-3"></i>
              <div class="font-bold text-slate-600">لسه مفيش واجهات</div>
              <div class="text-xs mt-1">اضغط "إضافة واجهة" وارفع صورة التاجر أو القسم.</div>
            </div>`}
        </div>
      </div>`;
    AdminLayout.render('showcases', html);
  },

  cardHtml(c, i) {
    const t = this.TYPES[c.linkType] || {};
    const target = c.linkType === 'products' ? `${(c.productIds || []).length} منتج` : (c.linkLabel || '');
    return `
      <div class="rounded-2xl border border-slate-200 overflow-hidden bg-white ${c.isActive === false ? 'opacity-60' : ''}">
        <div class="relative h-32 bg-slate-100">
          <img src="${this.esc(c.image)}" class="w-full h-full object-cover" alt="" onerror="this.style.display='none'" />
          ${c.logo ? `<img src="${this.esc(c.logo)}" class="absolute bottom-2 right-2 w-12 h-12 rounded-xl border-2 border-white object-cover bg-white shadow" alt="" />` : ''}
          ${c.isActive === false ? '<span class="absolute top-2 left-2 bg-slate-800 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">مخفية</span>' : ''}
        </div>
        <div class="p-3">
          <div class="font-extrabold text-sm text-slate-800 truncate">${this.esc(c.title)}</div>
          <div class="text-[11px] text-slate-500 truncate">${this.esc(c.subtitle || '')}</div>
          <div class="text-[11px] text-emerald-700 font-bold mt-1"><i class="fa-solid ${t.icon || 'fa-link'}"></i> ${t.label || ''}${target ? ': ' + this.esc(target) : ''}</div>
          <div class="flex items-center justify-between mt-3">
            <div class="flex gap-1">
              <button onclick="ShowcasesAdmin.move(${i}, -1)" ${i === 0 ? 'disabled' : ''} class="btn-icon-action" title="لقدّام"><i class="fa-solid fa-arrow-right"></i></button>
              <button onclick="ShowcasesAdmin.move(${i}, 1)" ${i === this.cards.length - 1 ? 'disabled' : ''} class="btn-icon-action" title="لورا"><i class="fa-solid fa-arrow-left"></i></button>
            </div>
            <div class="flex gap-1">
              <a href="#/showcase/${this.esc(c.id)}" target="_blank" class="btn-icon-action" title="فتح صفحة الواجهة"><i class="fa-solid fa-up-right-from-square text-blue-600"></i></a>
              <button onclick="ShowcasesAdmin.toggle('${this.esc(c.id)}')" class="btn-icon-action" title="${c.isActive === false ? 'إظهار' : 'إخفاء'}"><i class="fa-solid ${c.isActive === false ? 'fa-eye' : 'fa-eye-slash'} text-slate-600"></i></button>
              <button onclick="ShowcasesAdmin.openEditor('${this.esc(c.id)}')" class="btn-icon-action" title="تعديل"><i class="fa-solid fa-pen text-amber-600"></i></button>
              <button onclick="ShowcasesAdmin.remove('${this.esc(c.id)}')" class="btn-icon-action danger" title="حذف"><i class="fa-solid fa-trash text-red-600"></i></button>
            </div>
          </div>
        </div>
      </div>`;
  },

  async saveSection() {
    try {
      const r = await API.put('/showcases/admin/section', {
        title: document.getElementById('sc-sec-title').value,
        subtitle: document.getElementById('sc-sec-sub').value,
        speed: document.getElementById('sc-sec-speed').value,
        enabled: document.getElementById('sc-sec-enabled').checked
      });
      this.section = r.section;
      App.showToast(r.message, 'success');
    } catch (err) { App.showToast(err.message, 'error'); }
  },

  async move(i, dir) {
    const j = i + dir;
    if (j < 0 || j >= this.cards.length) return;
    [this.cards[i], this.cards[j]] = [this.cards[j], this.cards[i]];
    this.renderPage();
    try { await API.put('/showcases/admin/order', { ids: this.cards.map(c => c.id) }); }
    catch (err) { App.showToast(err.message, 'error'); this.render(); }
  },

  async toggle(id) {
    const c = this.cards.find(x => x.id === id);
    if (!c) return;
    try {
      await API.put(`/showcases/${id}`, { isActive: c.isActive === false });
      App.showToast(c.isActive === false ? 'الواجهة ظاهرة في الموقع' : 'الواجهة اتخفت من الموقع', 'success');
      this.render();
    } catch (err) { App.showToast(err.message, 'error'); }
  },

  remove(id) {
    const c = this.cards.find(x => x.id === id);
    if (!c) return;
    App.confirm(`حذف الواجهة "${c.title}"؟ المنتجات نفسها مش هتتمسح.`, async () => {
      try { await API.delete(`/showcases/${id}`); App.showToast('تم حذف الواجهة', 'success'); this.render(); }
      catch (err) { App.showToast(err.message, 'error'); }
    });
  },

  // ---------- editor ----------
  openEditor(id = null) {
    const c = id ? this.cards.find(x => x.id === id) : null;
    this.editing = c;
    this.picked = [];
    const type = c ? c.linkType : 'merchant';
    const body = `
      <div class="text-right text-xs">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
          <div><label class="form-label font-bold">اسم الواجهة *</label><input id="sc-title" maxlength="80" class="form-control text-sm" value="${this.esc(c ? c.title : '')}" placeholder="مثال: متجر الإلكترونيات" oninput="ShowcasesAdmin.preview()" /></div>
          <div><label class="form-label font-bold">جملة قصيرة</label><input id="sc-subtitle" maxlength="160" class="form-control text-sm" value="${this.esc(c ? c.subtitle : '')}" placeholder="مثال: أحدث الموبايلات والإكسسوارات" oninput="ShowcasesAdmin.preview()" /></div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
          ${ImagePicker.html({ id: 'sc-image', value: c ? c.image : '', label: 'صورة الكارت *', hint: '(مقاس عرضي مثلاً 800×600)', onChange: 'ShowcasesAdmin.preview' })}
          ${ImagePicker.html({ id: 'sc-logo', value: c ? c.logo : '', label: 'اللوجو', hint: '(اختياري، مربع)', onChange: 'ShowcasesAdmin.preview' })}
        </div>
        <div class="mb-3">${ImagePicker.html({ id: 'sc-banner', value: c ? c.banner : '', label: 'بانر صفحة الواجهة', hint: '(اختياري، عريض مثلاً 1600×400 — لو فاضي بتتعرض صورة الكارت)', wide: true })}</div>

        <div class="mb-3">
          <label class="form-label font-bold">الواجهة دي بتعرض منتجات مين؟ *</label>
          <div class="flex flex-wrap gap-2 mb-2" id="sc-types">
            ${Object.entries(this.TYPES).map(([k, t]) => `
              <button type="button" data-type="${k}" onclick="ShowcasesAdmin.setType('${k}')" class="sc-type px-3 py-2 rounded-xl border text-xs font-bold ${k === type ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-slate-700 border-slate-200'}">
                <i class="fa-solid ${t.icon}"></i> ${t.label}
              </button>`).join('')}
          </div>
          <input type="hidden" id="sc-type" value="${type}" />
          <div id="sc-target"></div>
        </div>

        <label class="flex items-center gap-2 font-bold cursor-pointer mb-4"><input type="checkbox" id="sc-active" class="w-4 h-4 accent-emerald-600" ${!c || c.isActive !== false ? 'checked' : ''}/> تظهر في الموقع</label>

        <div class="mb-4">
          <div class="form-label font-bold mb-1">شكلها في الموقع:</div>
          <div class="flex justify-center bg-slate-50 rounded-xl p-4"><div id="sc-preview" class="w-60"></div></div>
        </div>

        <button type="button" onclick="ShowcasesAdmin.save()" id="sc-save-btn" class="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 rounded-xl text-sm">${c ? 'حفظ التعديلات' : 'إضافة الواجهة'}</button>
      </div>`;
    App.openModal(c ? 'تعديل واجهة عرض' : 'إضافة واجهة عرض', body);
    this.renderTarget(type, c);
    if (c && c.linkType === 'products') this.loadPicked(c.productIds || []);
    this.preview();
  },

  setType(type) {
    document.getElementById('sc-type').value = type;
    document.querySelectorAll('.sc-type').forEach(b => {
      const on = b.dataset.type === type;
      b.className = `sc-type px-3 py-2 rounded-xl border text-xs font-bold ${on ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-slate-700 border-slate-200'}`;
    });
    this.renderTarget(type, this.editing && this.editing.linkType === type ? this.editing : null);
  },

  renderTarget(type, c) {
    const box = document.getElementById('sc-target');
    if (!box) return;
    const current = c ? c.linkValue : '';
    const list = { merchant: this.options.merchants, investor: this.options.investors, category: this.options.categories, brand: this.options.brands }[type];
    if (type === 'products') {
      box.innerHTML = `
        <input id="sc-psearch" class="form-control text-xs mb-2" placeholder="ابحث باسم المنتج وضيفه..." oninput="ShowcasesAdmin.searchProducts(this.value)" autocomplete="off" />
        <div id="sc-presults" class="max-h-40 overflow-y-auto divide-y divide-slate-100 border border-slate-100 rounded-lg mb-2 hidden"></div>
        <div id="sc-picked" class="flex flex-wrap gap-1.5"></div>`;
      this.renderPicked();
      return;
    }
    const names = { merchant: 'التاجر', investor: 'المستثمر', category: 'القسم', brand: 'الماركة' };
    if (!list || !list.length) {
      box.innerHTML = `<div class="text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2 font-bold">مفيش ${names[type]} مسجل لسه. ضيفه الأول من صفحته في لوحة التحكم.</div>`;
      return;
    }
    box.innerHTML = `
      <select id="sc-value" class="form-control text-sm">
        <option value="">— اختار ${names[type]} —</option>
        ${list.map(o => `<option value="${this.esc(o.id)}" ${String(o.id) === String(current) ? 'selected' : ''}>${this.esc(o.name)}${o.code ? ' (' + this.esc(o.code) + ')' : ''}</option>`).join('')}
      </select>`;
  },

  searchProducts(q) {
    clearTimeout(this.searchTimer);
    const box = document.getElementById('sc-presults');
    if (!q || q.trim().length < 1) { box.classList.add('hidden'); return; }
    this.searchTimer = setTimeout(async () => {
      try {
        const r = await API.get('/products', { q: q.trim(), limit: 10 });
        const items = (r.products || []).filter(p => !this.picked.some(x => x.id === p.id));
        this.searchResults = items.map(p => ({ id: p.id, title: p.title, image: (p.images || [])[0] || '' }));
        box.innerHTML = items.length ? items.map((p, i) => `
          <button type="button" class="w-full flex items-center gap-2 p-2 hover:bg-emerald-50 text-right" onclick="ShowcasesAdmin.addPicked(ShowcasesAdmin.searchResults[${i}])">
            <img src="${this.esc((p.images || [])[0] || '/images/no-image.svg')}" class="w-8 h-8 rounded object-cover" alt="" />
            <span class="truncate font-bold">${this.esc(p.title)}</span>
            <i class="fa-solid fa-plus text-emerald-600 mr-auto"></i>
          </button>`).join('') : '<div class="p-2 text-slate-400 text-center">مفيش نتايج</div>';
        box.classList.remove('hidden');
      } catch (err) { /* ignore */ }
    }, 250);
  },

  async loadPicked(ids) {
    const out = [];
    for (const id of ids) {
      try { const r = await API.get(`/products/${id}`); const p = r.product || r; if (p && p.id) out.push({ id: p.id, title: p.title, image: (p.images || [])[0] || '' }); } catch (e) { /* removed product */ }
    }
    this.picked = out;
    this.renderPicked();
  },

  addPicked(p) {
    if (this.picked.length >= 60) return App.showToast('أقصى حاجة 60 منتج في الواجهة', 'warning');
    if (!this.picked.some(x => x.id === p.id)) this.picked.push(p);
    const s = document.getElementById('sc-psearch'); if (s) s.value = '';
    document.getElementById('sc-presults').classList.add('hidden');
    this.renderPicked();
  },

  removePicked(id) { this.picked = this.picked.filter(x => x.id !== id); this.renderPicked(); },

  renderPicked() {
    const box = document.getElementById('sc-picked');
    if (!box) return;
    box.innerHTML = this.picked.length ? this.picked.map(p => `
      <span class="inline-flex items-center gap-1.5 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-full pl-2 pr-1 py-0.5 font-bold">
        <img src="${this.esc(p.image || '/images/no-image.svg')}" class="w-5 h-5 rounded-full object-cover" alt="" />
        <span class="max-w-[140px] truncate">${this.esc(p.title)}</span>
        <button type="button" onclick="ShowcasesAdmin.removePicked('${this.esc(p.id)}')" class="text-rose-500"><i class="fa-solid fa-xmark"></i></button>
      </span>`).join('') : '<span class="text-slate-400">لسه ما اخترتش منتجات</span>';
  },

  preview() {
    const box = document.getElementById('sc-preview');
    if (!box) return;
    const v = id => (document.getElementById(id) || {}).value || '';
    box.innerHTML = Showcases.cardHtml({ title: v('sc-title') || 'اسم الواجهة', subtitle: v('sc-subtitle'), image: v('sc-image'), logo: v('sc-logo') }, true);
  },

  async save() {
    const v = id => (document.getElementById(id) || {}).value || '';
    const type = v('sc-type');
    const body = {
      title: v('sc-title'), subtitle: v('sc-subtitle'),
      image: v('sc-image'), logo: v('sc-logo'), banner: v('sc-banner'),
      linkType: type,
      linkValue: type === 'products' ? '' : v('sc-value'),
      productIds: type === 'products' ? this.picked.map(p => p.id) : [],
      isActive: document.getElementById('sc-active').checked
    };
    const btn = document.getElementById('sc-save-btn');
    if (btn) btn.disabled = true;
    try {
      const r = this.editing ? await API.put(`/showcases/${this.editing.id}`, body) : await API.post('/showcases', body);
      App.closeModal();
      App.showToast(r.message, 'success');
      this.render();
    } catch (err) {
      App.showToast(err.message, 'error');
      if (btn) btn.disabled = false;
    }
  }
};
