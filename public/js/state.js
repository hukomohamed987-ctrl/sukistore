/**
 * Suki Store Global Reactive State
 */

const EGYPT_GOVERNORATES = [
  'القاهرة', 'الجيزة', 'الإسكندرية', 'الدقهلية', 'البحر الأحمر', 'البحيرة', 'الفيوم',
  'الغربية', 'الإسماعيلية', 'المنوفية', 'المنيا', 'القليوبية', 'الوادي الجديد',
  'السويس', 'أسوان', 'أسيوط', 'بني سويف', 'بورسعيد', 'دمياط', 'الشرقية',
  'جنوب سيناء', 'كفر الشيخ', 'مطروح', 'الأقصر', 'قنا', 'شمال سيناء', 'سوهاج'
];

const State = {
  user: null,
  cart: [],
  wishlist: [],
  categories: [],
  unreadNotifications: 0,
  deliveryGovernorate: null,
  productsMap: {},
  listeners: new Set(),

  registerProduct(product) {
    if (product && product.id) {
      this.productsMap[product.id] = product;
    }
  },

  async addToCartById(productId, quantity = 1, selectedOptions = {}) {
    let product = this.productsMap[productId];
    if (!product) {
      try {
        const res = await API.get(`/products/${productId}`);
        if (res.success && res.product) {
          product = res.product;
          this.registerProduct(product);
        }
      } catch (e) {}
    }
    if (product) {
      await this.addToCart(product, quantity, selectedOptions);
      if (typeof CartDrawer !== 'undefined' && CartDrawer.open) {
        CartDrawer.open();
      }
    }
  },

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  },

  notify() {
    for (const listener of this.listeners) {
      try {
        listener(this);
      } catch (err) {
        console.error('State listener error:', err);
      }
    }
  },

  async init() {
    // 1. Try restoring user session if token exists
    const token = API.getToken();
    if (token) {
      try {
        const res = await API.get('/auth/me');
        if (res.success && res.user) {
          this.user = res.user;
          // Sync server cart & wishlist
          await this.loadServerCart();
          await this.loadServerWishlist();
          await this.loadNotifications();
        }
      } catch (err) {
        console.warn('Session expired or invalid, clearing token.');
        API.setToken(null);
        this.user = null;
        this.loadLocalCart();
        this.loadLocalWishlist();
      }
    } else {
      this.loadLocalCart();
      this.loadLocalWishlist();
    }

    // 2. Fetch categories
    try {
      const res = await API.get('/categories');
      if (res.success) {
        this.categories = res.categories || [];
      }
    } catch (err) {
      console.error('Failed to load categories:', err);
      // A short network hiccup at start would hide the categories bar until a reload → try again
      this.retryCategories();
    }

    this.notify();
  },

  retryCategories(attempt = 1) {
    if (attempt > 5) return;
    setTimeout(async () => {
      try {
        const res = await API.get('/categories');
        if (res.success && (res.categories || []).length) {
          this.categories = res.categories;
          this.notify();
          return;
        }
      } catch (e) { /* still offline */ }
      this.retryCategories(attempt + 1);
    }, 2000 * attempt);
  },

  loadLocalCart() {
    try {
      const raw = localStorage.getItem('suki_local_cart');
      this.cart = raw ? JSON.parse(raw) : [];
    } catch (e) {
      this.cart = [];
    }
  },

  saveLocalCart() {
    localStorage.setItem('suki_local_cart', JSON.stringify(this.cart));
  },

  async loadServerCart() {
    try {
      const res = await API.get('/cart');
      if (res.success) {
        this.cart = res.items || [];
      }
    } catch (err) {
      this.loadLocalCart();
    }
  },

  async loadNotifications() {
    if (!this.user) return;
    try {
      const res = await API.get('/notifications');
      if (res.success) {
        this.unreadNotifications = res.unreadCount || 0;
      }
    } catch (err) {
      // ignore
    }
  },

  async addToCart(product, quantity = 1, selectedOptions = {}) {
    const qty = Math.max(1, Number(quantity) || 1);
    const availableStock = typeof product.stock === 'number' ? Math.max(0, product.stock) : (parseInt(product.stock, 10) || 0);

    // 1. Check if product is completely out of stock
    if (availableStock <= 0) {
      App.showToast(`عفواً، المنتج "${product.title}" غير متوفر حالياً في المخزون (نفدت الكمية)`, 'warning');
      return false;
    }

    const matchIndex = this.cart.findIndex(i => {
      const sameId = String(i.productId || i.id) === String(product.id);
      const sameOpts = JSON.stringify(i.selectedOptions || {}) === JSON.stringify(selectedOptions || {});
      return sameId && sameOpts;
    });

    const currentQtyInCart = matchIndex > -1 ? (Number(this.cart[matchIndex].quantity) || 0) : 0;

    // 2. Check if customer already has the max available stock in their cart
    if (currentQtyInCart >= availableStock) {
      App.showToast(`عفواً، لقد وصلت للحد الأقصى للكمية المتاحة في المخزون (${availableStock} قطعة فقط) ⚠️`, 'warning');
      return false;
    }

    // 3. Check if adding requested quantity exceeds total available stock
    if (currentQtyInCart + qty > availableStock) {
      const remainingToAdd = Math.max(0, availableStock - currentQtyInCart);
      if (matchIndex > -1) {
        this.cart[matchIndex].quantity = availableStock;
        this.cart[matchIndex].stock = availableStock;
      }
      this.saveLocalCart();
      if (this.user) {
        API.put('/cart', { items: this.cart }).catch(() => {});
      }
      this.notify();
      App.showToast(`تمت إضافة ${remainingToAdd} قطعة فقط لأن أقصى كمية متاحة في المخزون هي ${availableStock} قطعة ⚠️`, 'warning');
      return true;
    }

    // 4. Normal addition within stock boundary
    if (matchIndex > -1) {
      this.cart[matchIndex].quantity += qty;
      this.cart[matchIndex].stock = availableStock;
    } else {
      this.cart.push({
        productId: product.id,
        title: product.title,
        price: product.price,
        compareAtPrice: product.compareAtPrice,
        image: Array.isArray(product.images) && product.images.length > 0 ? product.images[0] : (product.image || ''),
        saleUnit: product.saleUnit || 'قطعة',
        stock: availableStock,
        shippingCost: product.shippingCost || 0,
        quantity: qty,
        selectedOptions
      });
    }

    // Always persist locally first so cart is never blocked or lost
    this.saveLocalCart();

    if (this.user) {
      try {
        await API.put('/cart', { items: this.cart });
      } catch (err) {
        console.warn('Syncing cart to server failed, preserved locally:', err);
      }
    }

    this.notify();
    App.showToast(`تمت إضافة "${product.title}" إلى السلة بنجاح!`, 'success');
    return true;
  },

  async updateCartQuantity(index, newQty) {
    if (!this.cart[index]) return;

    if (newQty <= 0) {
      this.cart.splice(index, 1);
      if (this.user) {
        await API.put('/cart', { items: this.cart }).catch(() => {});
      } else {
        this.saveLocalCart();
      }
      this.notify();
      return;
    }

    const item = this.cart[index];
    let availableStock = typeof item.stock === 'number' ? Math.max(0, item.stock) : (parseInt(item.stock, 10) || 0);

    // Refresh stock from productsMap cache if available
    if (this.productsMap[item.productId] && typeof this.productsMap[item.productId].stock === 'number') {
      availableStock = this.productsMap[item.productId].stock;
      item.stock = availableStock;
    }

    if (newQty > availableStock) {
      this.cart[index].quantity = availableStock;
      App.showToast(`عفواً، الكمية المتاحة في المخزون هي ${availableStock} قطعة فقط (المخزون غير كافٍ) ⚠️`, 'warning');
    } else {
      this.cart[index].quantity = newQty;
    }

    if (this.user) {
      await API.put('/cart', { items: this.cart }).catch(() => {});
    } else {
      this.saveLocalCart();
    }

    this.notify();
  },

  // Validate all cart items against latest database inventory
  async validateCartStock() {
    if (!this.cart || this.cart.length === 0) return;
    let hadAdjustments = false;

    for (const item of this.cart) {
      try {
        const pId = item.productId || item.id;
        const res = await API.get(`/products/${pId}`);
        if (res.success && res.product) {
          const freshStock = typeof res.product.stock === 'number' ? Math.max(0, res.product.stock) : (parseInt(res.product.stock, 10) || 0);
          item.stock = freshStock;
          this.registerProduct(res.product);

          if (item.quantity > freshStock) {
            item.quantity = Math.max(0, freshStock);
            hadAdjustments = true;
          }
        }
      } catch (e) {}
    }

    if (hadAdjustments) {
      // Remove any 0 stock items or notify
      this.saveLocalCart();
      if (this.user) {
        await API.put('/cart', { items: this.cart }).catch(() => {});
      }
      this.notify();
      App.showToast('تم تحديث كميات بعض المنتجات في سلتك تلقائياً وفقاً للمخزون المتاح حالياً ⚠️', 'info');
    }
  },

  async removeFromCart(index) {
    if (this.cart[index]) {
      this.cart.splice(index, 1);
      if (this.user) {
        await API.put('/cart', { items: this.cart }).catch(() => {});
      } else {
        this.saveLocalCart();
      }
      this.notify();
      App.showToast('تم حذف المنتج من السلة', 'warning');
    }
  },

  async clearCart() {
    this.cart = [];
    if (this.user) {
      await API.delete('/cart/clear').catch(() => {});
    } else {
      this.saveLocalCart();
    }
    this.notify();
  },

  getCartCount() {
    return this.cart.reduce((total, item) => total + (Number(item.quantity) || 1), 0);
  },

  loadLocalWishlist() {
    try {
      const raw = localStorage.getItem('suki_local_wishlist');
      this.wishlist = raw ? JSON.parse(raw) : [];
    } catch (e) {
      this.wishlist = [];
    }
  },

  saveLocalWishlist() {
    localStorage.setItem('suki_local_wishlist', JSON.stringify(this.wishlist));
  },

  async loadServerWishlist() {
    if (!this.user) {
      this.loadLocalWishlist();
      return;
    }
    try {
      const res = await API.get('/wishlist');
      if (res.success) {
        this.wishlist = res.wishlistIds || [];
      }
    } catch (err) {
      this.loadLocalWishlist();
    }
  },

  isInWishlist(productId) {
    if (!productId) return false;
    return this.wishlist.some(id => String(id) === String(productId));
  },

  getWishlistCount() {
    return this.wishlist.length;
  },

  updateWishlistElements(productId, isAdded) {
    const hearts = document.querySelectorAll(`[data-wishlist-id="${productId}"]`);
    hearts.forEach(h => {
      if (isAdded) {
        h.classList.add('active');
        const icon = h.querySelector('i');
        if (icon) {
          icon.classList.remove('fa-regular');
          icon.classList.add('fa-solid');
        }
      } else {
        h.classList.remove('active');
        const icon = h.querySelector('i');
        if (icon) {
          icon.classList.remove('fa-solid');
          icon.classList.add('fa-regular');
        }
      }
    });
  },

  async toggleWishlist(productId, e) {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }

    if (!productId) return;

    if (!this.user) {
      const idx = this.wishlist.findIndex(id => String(id) === String(productId));
      const isAdded = idx === -1;
      if (isAdded) {
        this.wishlist.unshift(productId);
        App.showToast('تمت إضافة المنتج إلى قائمة أمنياتك بنجاح ❤️', 'success');
      } else {
        this.wishlist.splice(idx, 1);
        App.showToast('تمت إزالة المنتج من المفضلة', 'info');
      }
      this.saveLocalWishlist();
      this.updateWishlistElements(productId, isAdded);
      this.notify();
      return;
    }

    try {
      const res = await API.post('/wishlist/toggle', { productId });
      if (res.success) {
        this.wishlist = res.wishlistIds || [];
        this.updateWishlistElements(productId, res.isAdded);
        this.notify();
        App.showToast(res.message, res.isAdded ? 'success' : 'info');
      }
    } catch (err) {
      App.showToast(err.message || 'فشل تحديث قائمة الأمنيات', 'error');
    }
  },

  getCartSubtotal() {
    return this.cart.reduce((total, item) => total + ((Number(item.price) || 0) * (Number(item.quantity) || 1)), 0);
  },

  async login(user, token) {
    API.setToken(token);
    this.user = user;

    // Merge local guest cart to backend
    const guestCart = [...this.cart];
    if (guestCart.length > 0) {
      try {
        const res = await API.post('/cart/sync', { localItems: guestCart });
        if (res.success) {
          this.cart = res.items || [];
          localStorage.removeItem('suki_local_cart');
        }
      } catch (e) {
        await this.loadServerCart();
      }
    } else {
      await this.loadServerCart();
    }

    // Merge local guest wishlist to backend
    const guestWishlist = [...this.wishlist];
    if (guestWishlist.length > 0) {
      try {
        const wRes = await API.post('/wishlist/sync', { localIds: guestWishlist });
        if (wRes.success) {
          this.wishlist = wRes.wishlistIds || [];
          localStorage.removeItem('suki_local_wishlist');
        }
      } catch (e) {
        await this.loadServerWishlist();
      }
    } else {
      await this.loadServerWishlist();
    }

    await this.loadNotifications();
    this.notify();
  },

  handleSessionExpired() {
    API.setToken(null);
    this.user = null;
    this.unreadNotifications = 0;
    // Keep user cart intact! Never delete user's cart on expired session!
    this.loadLocalCart();
    this.loadLocalWishlist();
    this.notify();
  },

  logout() {
    API.setToken(null);
    this.user = null;
    this.cart = [];
    this.wishlist = [];
    this.unreadNotifications = 0;
    localStorage.removeItem('suki_local_cart');
    this.notify();
    App.showToast('تم تسجيل الخروج بنجاح', 'info');
    if (window.location.hash) {
      window.location.hash = '#/';
    } else {
      window.history.pushState(null, '', '/');
      if (typeof App !== 'undefined' && App.route) App.route();
    }
  },

  getDeliveryGovernorate() {
    if (this.deliveryGovernorate) return this.deliveryGovernorate;
    if (this.user && Array.isArray(this.user.addresses) && this.user.addresses.length > 0) {
      const def = this.user.addresses.find(a => a.isDefault) || this.user.addresses[0];
      if (def && def.governorate) {
        this.deliveryGovernorate = def.governorate;
        return this.deliveryGovernorate;
      }
    }
    const saved = localStorage.getItem('suki_delivery_governorate');
    if (saved) {
      this.deliveryGovernorate = saved;
      return saved;
    }
    this.deliveryGovernorate = 'القاهرة';
    return this.deliveryGovernorate;
  },

  setDeliveryGovernorate(gov) {
    if (!gov) return;
    this.deliveryGovernorate = gov;
    localStorage.setItem('suki_delivery_governorate', gov);
    this.notify();
    if (typeof CartPage !== 'undefined' && window.location.hash.startsWith('#/cart')) {
      CartPage.render();
    } else if (typeof CheckoutPage !== 'undefined' && window.location.hash.startsWith('#/checkout')) {
      CheckoutPage.selectedGovernorate = gov;
      CheckoutPage.render();
    } else if (typeof ProductPage !== 'undefined' && window.location.hash.startsWith('#/product/')) {
      ProductPage.render(ProductPage.product?.id);
    }
    if (typeof CartDrawer !== 'undefined' && CartDrawer.isOpen) {
      CartDrawer.update();
    }
  },

  // Saved delivery spot from the map: { governorate, area, street, lat, lng }
  getDeliveryLocation() {
    try { return JSON.parse(localStorage.getItem('suki_delivery_location') || 'null'); } catch (e) { return null; }
  },

  // Text for the top bar: "المعادي، القاهرة" (or just the governorate)
  getDeliveryLabel() {
    const gov = this.getDeliveryGovernorate();
    const loc = this.getDeliveryLocation();
    if (loc && loc.governorate === gov && loc.area && loc.area !== gov) return `${loc.area}، ${gov}`;
    return gov;
  },

  saveDeliveryLocation(addr) {
    if (!addr || !addr.governorate) return;
    try {
      localStorage.setItem('suki_delivery_location', JSON.stringify({
        governorate: addr.governorate, area: addr.area || addr.city || '', street: addr.street || '', building: addr.building || '',
        lat: addr.lat, lng: addr.lng, savedAt: Date.now()
      }));
    } catch (e) { /* private mode */ }
    this.setDeliveryGovernorate(addr.governorate);
  },

  // GPS + real address lookup (no map shown). Silent mode = no messages.
  detectGpsLocation(isSilent = false) {
    if (!navigator.geolocation) {
      if (!isSilent) App.showToast('خاصية تحديد الموقع غير مدعومة في متصفحك', 'warning');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const addr = await MapPicker.lookup(pos.coords.latitude, pos.coords.longitude);
          if (!addr.governorate) throw new Error('no governorate');
          this.saveDeliveryLocation(addr);
          if (!isSilent) App.showToast(`التوصيل إلى: ${this.getDeliveryLabel()} 📍`, 'success');
        } catch (e) {
          if (!isSilent) this.openDeliveryMap();
        }
      },
      () => { if (!isSilent) App.showToast('اسمح للموقع بالوصول لمكانك، أو اختار المحافظة من القائمة', 'info'); },
      { timeout: 12000, enableHighAccuracy: true, maximumAge: 60000 }
    );
  },

  // Map that finds the customer automatically; they can drag the pin, then confirm
  openDeliveryMap() {
    const loc = this.getDeliveryLocation();
    MapPicker.open({
      initialLat: loc && loc.lat, initialLng: loc && loc.lng,
      currentGov: this.getDeliveryGovernorate(),
      autoLocate: !loc,
      onConfirm: (addr) => {
        this.saveDeliveryLocation(addr);
        App.showToast(`التوصيل إلى: ${this.getDeliveryLabel()} 📍`, 'success');
      }
    });
  },

  openChangeAddressModal() {
    const currentGov = this.getDeliveryGovernorate();
    const loc = this.getDeliveryLocation();
    const esc = v => String(v === undefined || v === null ? '' : v).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
    const userAddresses = (this.user && Array.isArray(this.user.addresses)) ? this.user.addresses : [];

    const modalContent = `
      <div>
        <button type="button" onclick="App.closeModal(); setTimeout(() => State.openDeliveryMap(), 200);"
          class="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold p-3 rounded-xl flex items-center justify-center gap-2 mb-2 text-sm shadow-sm">
          <i class="fa-solid fa-map-location-dot"></i>
          <span>حدد مكاني على الخريطة</span>
        </button>
        ${loc && loc.governorate ? `<p class="text-[11px] text-slate-500 mb-4 text-center"><i class="fa-solid fa-location-dot text-emerald-600"></i> ${esc([loc.street, loc.area, loc.governorate].filter(Boolean).join('، '))}</p>` : '<div class="mb-4"></div>'}

        ${userAddresses.length > 0 ? `
          <div class="mb-5">
            <h4 class="font-extrabold text-xs text-slate-800 dark:text-slate-100 mb-2"><i class="fa-solid fa-address-book text-emerald-600"></i> <span>عناوينك المحفوظة:</span></h4>
            <div class="grid grid-cols-1 gap-2 max-h-40 overflow-y-auto">
              ${userAddresses.map((addr, i) => `
                <div onclick="State.selectSavedAddress(${i})"
                  class="p-2.5 rounded-xl border cursor-pointer flex items-center justify-between ${currentGov === addr.governorate ? 'border-emerald-500 bg-emerald-50/60' : 'border-slate-200 dark:border-slate-700 hover:border-emerald-300'}">
                  <div class="min-w-0">
                    <div class="font-bold text-xs text-slate-800 dark:text-slate-100">${esc(addr.label || 'عنوان')} <span class="text-[10px] bg-slate-100 dark:bg-slate-700 px-1.5 py-0.5 rounded font-normal">${esc(addr.governorate)}</span></div>
                    <div class="text-[11px] text-slate-500 mt-0.5 truncate">${esc([addr.city, addr.street].filter(Boolean).join(' - '))}</div>
                  </div>
                  ${currentGov === addr.governorate ? '<i class="fa-solid fa-circle-check text-emerald-600"></i>' : ''}
                </div>`).join('')}
            </div>
          </div>` : ''}

        <h4 class="font-extrabold text-xs text-slate-800 dark:text-slate-100 mb-2"><i class="fa-solid fa-city text-emerald-600"></i> <span>أو اختار المحافظة يدوياً:</span></h4>
        <div class="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-60 overflow-y-auto p-1">
          ${EGYPT_GOVERNORATES.map(gov => `
            <button type="button" onclick="State.selectGovernorate('${esc(gov)}')"
              class="py-2 px-2.5 rounded-xl text-xs font-bold flex items-center justify-between border ${gov === currentGov ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-slate-50 dark:bg-slate-800 hover:bg-emerald-50 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700'}">
              <span>${esc(gov)}</span>${gov === currentGov ? '<i class="fa-solid fa-check text-[10px]"></i>' : ''}
            </button>`).join('')}
        </div>
      </div>
    `;

    App.openModal('عنوان التوصيل', modalContent);
  },
  selectGovernorate(gov) {
    try { localStorage.removeItem('suki_delivery_location'); } catch (e) { /* private mode */ }
    this.setDeliveryGovernorate(gov);
    App.closeModal();
    App.showToast(`تم تغيير محافظة التوصيل إلى "${gov}" بنجاح 📍`, 'success');
  },

  selectSavedAddress(index) {
    const addr = ((this.user && this.user.addresses) || [])[index];
    if (!addr) return;
    this.saveDeliveryLocation({ governorate: addr.governorate, area: addr.city, street: addr.street, lat: addr.lat || (addr.coordinates && addr.coordinates.lat), lng: addr.lng || (addr.coordinates && addr.coordinates.lng) });
    App.closeModal();
    App.showToast(`التوصيل إلى: ${this.getDeliveryLabel()} 📍`, 'success');
  },

  // Advanced Shipping Calculation: Base fee for first item + 15% for each additional item
  computeShipping(gov = this.getDeliveryGovernorate()) {
    const cart = this.cart || [];
    if (cart.length === 0) return 0;
    
    let nonFreeItems = [];
    let totalNonFreeUnits = 0;

    for (const item of cart) {
      if (!item.isFreeShipping && item.shippingCost !== 0) {
        let baseFee = 35;
        if (item.isLargeItem && item.customShippingCost) {
          baseFee = Number(item.customShippingCost);
        } else if (item.governorateShipping && item.governorateShipping[gov] !== undefined && item.governorateShipping[gov] !== '') {
          baseFee = Number(item.governorateShipping[gov]);
        } else if (item.shippingCost !== undefined && item.shippingCost !== '') {
          baseFee = Number(item.shippingCost);
        }

        const qty = Number(item.quantity) || 1;
        nonFreeItems.push({ baseFee, quantity: qty });
        totalNonFreeUnits += qty;
      }
    }

    if (nonFreeItems.length === 0) return 0;

    // Highest base shipping fee applies to first item
    const maxBaseFee = Math.max(...nonFreeItems.map(i => i.baseFee));
    const additionalUnits = Math.max(0, totalNonFreeUnits - 1);
    const additionalRate = 0.15; // 15% per additional unit
    return Math.round((maxBaseFee + (additionalUnits * maxBaseFee * additionalRate)) * 100) / 100;
  }
};
