/**
 * Suki Store Wishlist Page (قائمة أمنياتي)
 * Features:
 * - Displays all saved favorite products
 * - One-click move to cart
 * - Instant removal from wishlist
 */

const WishlistPage = {
  items: [],
  isLoading: false,

  async render() {
    const main = document.getElementById('main-content');
    if (!main) return;

    if (!State.user && (!State.wishlist || State.wishlist.length === 0)) {
      main.innerHTML = `
        <div class="container mx-auto px-4 py-16 text-center max-w-md">
          <div class="w-20 h-20 bg-rose-50 rounded-full flex items-center justify-center mx-auto mb-4 text-rose-500 text-3xl">
            <i class="fa-solid fa-heart"></i>
          </div>
          <h2 class="text-xl font-extrabold text-slate-800 mb-2">قائمة أمنياتك فارغة</h2>
          <p class="text-xs text-slate-500 mb-6">تصفح أقسام المتجر واضغط على رمز القلب لحفظ المنتجات في قائمتك المفضلة</p>
          <div class="flex gap-3 justify-center">
            <a href="#/products" class="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-6 py-2.5 rounded-xl text-sm shadow-md transition-all">
              تصفح المنتجات
            </a>
            <button onclick="AuthModal.open('login', '#/wishlist')" class="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-6 py-2.5 rounded-xl text-sm transition-all">
              تسجيل الدخول
            </button>
          </div>
        </div>
      `;
      return;
    }

    main.innerHTML = `
      <div class="container mx-auto px-4 py-8">
        <div class="py-12 text-center text-slate-400">
          <i class="fa-solid fa-spinner fa-spin text-3xl mb-3 text-emerald-600"></i>
          <div>جاري تحميل قائمة الأمنيات...</div>
        </div>
      </div>
    `;

    try {
      this.isLoading = true;
      let res;
      if (State.user) {
        res = await API.get('/wishlist');
      } else {
        res = await API.get('/wishlist', { ids: State.wishlist.join(',') });
      }
      this.items = res.items || [];
      this.renderContent();
    } catch (err) {
      console.error('Wishlist error:', err);
      main.innerHTML = `
        <div class="container mx-auto px-4 py-12 text-center text-red-500">
          <i class="fa-solid fa-triangle-exclamation text-3xl mb-2"></i>
          <div>فشل تحميل قائمة الأمنيات، يرجى المحاولة لاحقاً</div>
        </div>
      `;
    } finally {
      this.isLoading = false;
    }
  },

  renderContent() {
    const main = document.getElementById('main-content');
    if (!main) return;

    if (this.items.length === 0) {
      main.innerHTML = `
        <div class="container mx-auto px-4 py-16 text-center max-w-md">
          <div class="w-24 h-24 bg-rose-50 text-rose-400 rounded-full flex items-center justify-center mx-auto mb-4 text-4xl shadow-inner">
            <i class="fa-regular fa-heart"></i>
          </div>
          <h2 class="text-2xl font-extrabold text-slate-800 mb-2">قائمة الأمنيات فارغة حالياً</h2>
          <p class="text-xs text-slate-500 mb-6 leading-relaxed">
            لم تقم بإضافة أي منتجات إلى مفضلتك بعد. تصفح أقسام المتجر واضغط على رمز القلب لحفظ المنتجات التي تعجبك!
          </p>
          <a href="#/products" class="inline-block bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-8 py-3.5 rounded-xl text-sm shadow-md transition-all">
            ابدأ التسوق الآن
          </a>
        </div>
      `;
      return;
    }

    main.innerHTML = `
      <div class="container mx-auto px-4 py-8">
        <!-- Header -->
        <div class="flex items-center justify-between mb-8 flex-wrap gap-4 pb-4 border-b border-slate-200">
          <div>
            <h1 class="text-2xl font-extrabold text-slate-900 flex items-center gap-2.5">
              <i class="fa-solid fa-heart text-rose-500"></i>
              <span>قائمة أمنياتي المفضلة</span>
            </h1>
            <p class="text-xs text-slate-500 mt-1">المنتجات المحفوظة في حسابك (${this.items.length} منتجات)</p>
          </div>
          <a href="#/products" class="text-xs font-bold text-emerald-700 hover:text-emerald-800 flex items-center gap-1.5">
            <span>متابعة التسوق</span>
            <i class="fa-solid fa-arrow-left"></i>
          </a>
        </div>

        <!-- Wishlist Grid -->
        <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          ${this.items.map(p => {
            const hasDiscount = p.compareAtPrice && p.compareAtPrice > p.price;
            const discountPercent = hasDiscount ? Math.round(((p.compareAtPrice - p.price) / p.compareAtPrice) * 100) : 0;

            return `
              <div class="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs hover:shadow-md transition-all flex flex-col justify-between group">
                <div class="relative">
                  <!-- Product Image Link -->
                  <a href="#/product/${p.id}" class="block aspect-square overflow-hidden bg-slate-50">
                    <img src="${p.image || '/images/no-image.svg'}" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" loading="lazy" decoding="async" />
                  </a>

                  <!-- Remove from Wishlist Button -->
                  <button onclick="WishlistPage.remove('${p.id}')" class="absolute top-2.5 right-2.5 bg-white/90 hover:bg-white text-rose-500 w-8 h-8 rounded-full flex items-center justify-center shadow-md transition-all" title="إزالة من المفضلة">
                    <i class="fa-solid fa-trash-can text-xs"></i>
                  </button>

                  <!-- Discount badge -->
                  ${hasDiscount ? `
                    <span class="absolute top-2.5 left-2.5 bg-rose-600 text-white font-extrabold text-[10px] px-2 py-0.5 rounded-full shadow-sm">
                      خصم ${discountPercent}%
                    </span>
                  ` : ''}
                </div>

                <div class="p-3.5 flex flex-col flex-1 justify-between">
                  <div>
                    ${p.brand ? `<span class="text-[10px] font-bold text-slate-400 block mb-0.5">${p.brand}</span>` : ''}
                    <a href="#/product/${p.id}" class="font-bold text-xs text-slate-800 line-clamp-2 hover:text-emerald-700 transition-colors mb-2">
                      ${p.title}
                    </a>
                  </div>

                  <div>
                    <!-- Price -->
                    <div class="flex items-baseline gap-1.5 mb-3">
                      <span class="text-sm font-extrabold text-slate-900">${p.price} ج.م</span>
                      ${hasDiscount ? `<span class="text-[11px] text-slate-400 line-through">${p.compareAtPrice} ج.م</span>` : ''}
                    </div>

                    <!-- Move to Cart Button -->
                    <button onclick="WishlistPage.moveToCart('${p.id}')" class="w-full bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-bold py-2 px-3 rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-xs transition-all">
                      <i class="fa-solid fa-cart-shopping text-[11px]"></i>
                      <span>نقل إلى السلة</span>
                    </button>
                  </div>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  },

  async remove(productId) {
    if (!State.user) {
      State.toggleWishlist(productId);
      this.items = this.items.filter(it => it.id !== productId);
      this.renderContent();
      return;
    }
    try {
      const res = await API.delete(`/wishlist/${productId}`);
      if (res.success) {
        State.wishlist = res.wishlistIds || [];
        State.notify();
        this.items = this.items.filter(it => it.id !== productId);
        this.renderContent();
        App.showToast('تمت إزالة المنتج من قائمة أمنياتك', 'info');
      }
    } catch (err) {
      App.showToast(err.message || 'فشل حذف المنتج', 'error');
    }
  },

  async moveToCart(productId) {
    if (!State.user) {
      const p = this.items.find(it => it.id === productId);
      if (p) {
        State.addToCart(p, 1);
        State.toggleWishlist(productId);
        this.items = this.items.filter(it => it.id !== productId);
        this.renderContent();
      }
      return;
    }
    try {
      const res = await API.post('/wishlist/move-to-cart', { productId });
      if (res.success) {
        State.wishlist = res.wishlistIds || [];
        await State.loadServerCart();
        State.notify();
        this.items = this.items.filter(it => it.id !== productId);
        this.renderContent();
        App.showToast(res.message, 'success');
      }
    } catch (err) {
      App.showToast(err.message || 'فشل نقل المنتج إلى السلة', 'error');
    }
  }
};
