/**
 * The page a showcase card opens: big banner + logo + the products of that merchant /
 * investor / category / brand (or the products picked by hand), with sorting and "show more".
 */
const ShowcasePage = {
  card: null,
  page: 1,
  sort: 'newest',
  loading: false,
  LIMIT: 24,

  esc(v) { return String(v === undefined || v === null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); },

  async render(id) {
    const main = document.getElementById('main-content');
    main.innerHTML = `<div class="container py-16 text-center text-slate-400"><i class="fa-solid fa-spinner fa-spin text-3xl text-emerald-600"></i></div>`;
    this.page = 1;
    this.sort = 'newest';
    try {
      const { showcase } = await API.get(`/showcases/${encodeURIComponent(id)}`);
      this.card = showcase;
      const c = showcase;
      main.innerHTML = `
        <div class="container py-6">
          <nav class="text-xs text-slate-500 mb-3"><a href="#/" class="hover:text-emerald-600">الرئيسية</a> <span class="mx-1">/</span> <span class="text-slate-700 dark:text-slate-300 font-bold">${this.esc(c.title)}</span></nav>
          <div class="sc-hero">
            <img class="sc-hero-img" src="${this.esc(c.banner || c.image)}" alt="${this.esc(c.title)}" />
            <div class="sc-hero-shade"></div>
            <div class="sc-hero-body">
              ${c.logo ? `<img class="sc-hero-logo" src="${this.esc(c.logo)}" alt="" />` : ''}
              <div>
                <h1 class="sc-hero-title">${this.esc(c.title)}</h1>
                ${c.subtitle ? `<p class="sc-hero-sub">${this.esc(c.subtitle)}</p>` : ''}
              </div>
            </div>
          </div>

          <div class="flex items-center justify-between flex-wrap gap-3 my-5">
            <div class="text-sm font-bold text-slate-700 dark:text-slate-200" id="sc-count"></div>
            ${c.linkType === 'products' ? '' : `
              <label class="text-xs font-bold text-slate-600 dark:text-slate-300 flex items-center gap-2 whitespace-nowrap">ترتيب حسب:
                <select id="sc-sort" class="form-control text-xs py-1.5 w-auto" onchange="ShowcasePage.changeSort(this.value)">
                  <option value="newest">الأحدث وصولاً</option>
                  <option value="price_asc">السعر: من الأقل للأعلى</option>
                  <option value="price_desc">السعر: من الأعلى للأقل</option>
                  <option value="rating">الأعلى تقييماً</option>
                  <option value="discount">أكبر نسبة خصم</option>
                </select>
              </label>`}
          </div>
          <div class="products-grid" id="sc-products"></div>
          <div class="text-center my-8" id="sc-more"></div>
        </div>`;
      document.title = `${c.title} | سوقي ستور`;
      await this.loadProducts(true);
    } catch (err) {
      main.innerHTML = `
        <div class="container py-16 text-center">
          <i class="fa-regular fa-face-frown text-4xl text-slate-300 mb-3"></i>
          <div class="font-bold text-slate-600 dark:text-slate-300">الصفحة دي مش متاحة دلوقتي</div>
          <a href="#/" class="inline-block mt-4 bg-emerald-600 text-white font-bold px-5 py-2 rounded-xl text-sm">الرجوع للرئيسية</a>
        </div>`;
    }
  },

  changeSort(v) { this.sort = v; this.page = 1; this.loadProducts(true); },

  async loadProducts(reset) {
    if (this.loading) return;
    this.loading = true;
    const grid = document.getElementById('sc-products');
    const more = document.getElementById('sc-more');
    const count = document.getElementById('sc-count');
    if (!grid) { this.loading = false; return; }
    const card = this.getCard();
    try {
      let products = [];
      let total = 0;
      let hasMore = false;
      if (card.linkType === 'products') {
        products = card.products || [];
        total = products.length;
      } else if (card.productQuery) {
        const r = await API.get('/products', { ...card.productQuery, sort: this.sort, page: this.page, limit: this.LIMIT });
        products = r.products || [];
        total = r.count !== undefined ? r.count : products.length;
        hasMore = Boolean(r.hasMore);
      }
      const html = products.map(p => HomePage.renderProductCard(p)).join('');
      if (reset) grid.innerHTML = html; else grid.insertAdjacentHTML('beforeend', html);
      if (count) count.textContent = total ? `${total} منتج` : '';
      if (reset && !products.length) {
        grid.innerHTML = `<div class="col-span-full text-center py-12 text-slate-400"><i class="fa-solid fa-box-open text-4xl mb-3"></i><div class="font-bold text-slate-600 dark:text-slate-300">لسه مفيش منتجات هنا</div><div class="text-xs mt-1">ارجع قريب، هتلاقي منتجات جديدة.</div></div>`;
      }
      if (more) more.innerHTML = hasMore ? `<button onclick="ShowcasePage.more()" class="bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 hover:border-emerald-500 font-bold px-6 py-2.5 rounded-xl text-sm">عرض المزيد</button>` : '';
    } catch (err) {
      if (reset) grid.innerHTML = `<div class="col-span-full text-center py-10 text-red-500 font-bold">تعذّر تحميل المنتجات</div>`;
    } finally {
      this.loading = false;
    }
  },

  getCard() { return this.card || {}; },

  more() { this.page += 1; this.loadProducts(false); }
};
