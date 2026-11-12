/**
 * Suki Store Cart Drawer Component
 */

const CartDrawer = {
  isOpen: false,

  toggle() {
    this.isOpen = !this.isOpen;
    this.update();
  },

  open() {
    this.isOpen = true;
    this.update();
  },

  close() {
    this.isOpen = false;
    this.update();
  },

  update() {
    const drawer = document.getElementById('cart-drawer');
    const overlay = document.getElementById('cart-drawer-overlay');

    if (!drawer || !overlay) return;

    if (this.isOpen) {
      drawer.innerHTML = this.renderContent();
      drawer.classList.add('open');
      overlay.classList.remove('hidden');
      document.body.style.overflow = 'hidden';
    } else {
      drawer.classList.remove('open');
      overlay.classList.add('hidden');
      document.body.style.overflow = '';
    }
  },

  renderContent() {
    const cart = State.cart || [];
    const count = State.getCartCount();
    const subtotal = State.getCartSubtotal();

    // Check if all items in cart are free shipping
    const allFreeShipping = cart.length > 0 && cart.every(item => item.isFreeShipping || item.shippingCost === 0);

    return `
      <div class="drawer-header">
        <div class="flex items-center gap-2">
          <i class="fa-solid fa-cart-shopping text-emerald-600 text-lg"></i>
          <h3 class="font-bold text-lg text-slate-800">سلة التسوق (${count})</h3>
        </div>
        <button onclick="CartDrawer.close()" class="text-slate-400 hover:text-red-500 text-xl font-bold p-1">
          &times;
        </button>
      </div>

      <div class="drawer-body">
        ${cart.length === 0 ? `
          <div class="py-16 text-center">
            <div class="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4 text-3xl text-slate-400">
              <i class="fa-solid fa-basket-shopping"></i>
            </div>
            <h4 class="font-bold text-slate-700 text-lg mb-2">سلتك فارغة حالياً</h4>
            <p class="text-sm text-slate-400 mb-6">استكشف آلاف المنتجات والعروض الحصرية وابدأ التسوق!</p>
            <a href="#/" onclick="CartDrawer.close()" class="inline-block bg-emerald-600 text-white font-bold px-6 py-2.5 rounded-full hover:bg-emerald-700">
              تصفح المنتجات الآن
            </a>
          </div>
        ` : `
          <!-- Shipping notification banner -->
          <div class="bg-emerald-50 border border-emerald-100 p-2.5 rounded-xl mb-4 text-xs text-emerald-800 flex items-center justify-between">
            <div class="flex items-center gap-2 font-bold">
              <i class="fa-solid fa-truck-fast text-emerald-600"></i>
              <span>${allFreeShipping ? 'شحن مجاني لكافة منتجات السلة! 🎉' : `التوصيل إلى: <strong>${State.getDeliveryGovernorate()}</strong>`}</span>
            </div>
            <button onclick="CartDrawer.close(); State.openChangeAddressModal();" class="text-[11px] text-emerald-700 underline font-bold cursor-pointer hover:text-emerald-800">
              تغيير 📍
            </button>
          </div>

          <!-- Items list -->
          <div class="flex flex-col">
            ${cart.map((item, idx) => {
              const maxStock = typeof item.stock === 'number' ? Math.max(0, item.stock) : 99;
              const isAtMax = item.quantity >= maxStock;
              return `
              <div class="cart-item-card">
                <img src="${item.image || '/images/no-image.svg'}" class="cart-item-thumb" loading="lazy" decoding="async" />
                <div class="cart-item-details">
                  <h4 class="cart-item-title">${item.title}</h4>
                  
                  ${item.selectedOptions && Object.keys(item.selectedOptions).length > 0 ? `
                    <div class="cart-item-options">
                      ${Object.entries(item.selectedOptions).map(([k, v]) => `
                        <span>${k}: <strong>${v}</strong></span>
                      `).join(' • ')}
                    </div>
                  ` : ''}

                  ${maxStock <= 5 ? `
                    <div class="text-[10px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded w-fit mb-1">
                      متبقي بالمخزون: ${maxStock} فقط!
                    </div>
                  ` : ''}

                  <div class="cart-item-footer">
                    <div class="quantity-stepper">
                      <button class="stepper-btn" onclick="State.updateCartQuantity(${idx}, ${item.quantity - 1})">-</button>
                      <input type="text" class="stepper-input" value="${item.quantity}" readonly />
                      <button class="stepper-btn ${isAtMax ? 'opacity-40 cursor-not-allowed' : ''}" onclick="${isAtMax ? `App.showToast('عفواً، الكمية المتاحة في المخزون هي ${maxStock} قطعة فقط ⚠️', 'warning')` : `State.updateCartQuantity(${idx}, ${item.quantity + 1})`}">+</button>
                    </div>

                    <div class="text-left">
                      <div class="font-extrabold text-emerald-600 text-sm">${item.price * item.quantity} ج.م</div>
                      <div class="text-[11px] text-slate-400">(${item.price} ج.م / ${item.saleUnit || 'قطعة'})</div>
                    </div>

                    <button onclick="State.removeFromCart(${idx})" class="text-slate-400 hover:text-red-500 text-sm p-1 ml-1" title="حذف">
                      <i class="fa-regular fa-trash-can"></i>
                    </button>
                  </div>
                </div>
              </div>
            `;
            }).join('')}
          </div>
        `}
      </div>

      ${cart.length > 0 ? `
        <div class="drawer-footer">
          <div class="flex justify-between items-center mb-4 text-sm">
            <span class="text-slate-600 font-semibold">المجموع الفرعي:</span>
            <span class="font-extrabold text-lg text-slate-900">${subtotal} ج.م</span>
          </div>

          <div class="flex gap-2">
            <a href="#/cart" onclick="CartDrawer.close()" class="flex-1 text-center bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold py-3 rounded-xl text-sm">
              عرض السلة
            </a>
            <a href="#/checkout" onclick="CartDrawer.close()" class="flex-[1.5] text-center bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 rounded-xl text-sm flex items-center justify-center gap-2">
              <span>إتمام الطلب</span>
              <i class="fa-solid fa-arrow-left"></i>
            </a>
          </div>
        </div>
      ` : ''}
    `;
  }
};

// Listen for overlay click to close
document.addEventListener('click', (e) => {
  if (e.target.id === 'cart-drawer-overlay') {
    CartDrawer.close();
  }
});
