/**
 * Suki Store Full Cart Page
 */

const CartPage = {
  appliedCoupon: null,

  render() {
    const main = document.getElementById('main-content');
    const cart = State.cart || [];
    const count = State.getCartCount();
    const subtotal = State.getCartSubtotal();

    const currentGov = State.getDeliveryGovernorate();
    const shippingFee = State.computeShipping(currentGov);
    
    let discountAmount = 0;
    if (this.appliedCoupon) {
      discountAmount = this.appliedCoupon.discountAmount || 0;
    }
    const grandTotal = Math.max(0, subtotal + shippingFee - discountAmount);

    if (cart.length === 0) {
      main.innerHTML = `
        <div class="container py-16 text-center">
          <div class="bg-white rounded-2xl border border-slate-200 p-12 max-w-lg mx-auto shadow-sm">
            <div class="w-20 h-20 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-4 text-3xl">
              <i class="fa-solid fa-cart-arrow-down"></i>
            </div>
            <h2 class="text-2xl font-extrabold text-slate-800 mb-2">سلتك فارغة تماماً</h2>
            <p class="text-sm text-slate-500 mb-6 leading-relaxed">لم تقم بإضافة أي منتجات إلى السلة بعد. تصفح تشكيلتنا المميزة وأضف ما يعجبك!</p>
            <a href="#/" class="inline-block bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-8 py-3 rounded-full text-sm">
              ابدأ التسوق الآن
            </a>
          </div>
        </div>
      `;
      return;
    }

    main.innerHTML = `
      <div class="container py-8">
        <h1 class="text-2xl md:text-3xl font-extrabold text-slate-800 mb-6 flex items-center gap-3">
          <i class="fa-solid fa-bag-shopping text-emerald-600"></i>
          <span>سلة التسوق (${count} منتجات)</span>
        </h1>

        <div class="checkout-grid">
          <!-- Items List Column -->
          <div class="flex flex-col gap-4">
            <div class="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
              <div class="flex items-center justify-between pb-4 border-b border-slate-100 mb-4">
                <span class="font-bold text-slate-700 text-sm">المنتج</span>
                <span class="font-bold text-slate-700 text-sm">الإجمالي</span>
              </div>

              ${cart.map((item, idx) => {
                const maxStock = typeof item.stock === 'number' ? Math.max(0, item.stock) : 99;
                const isAtMax = item.quantity >= maxStock;
                return `
                <div class="cart-item-card flex flex-col sm:flex-row gap-4 p-4 sm:p-0 rounded-2xl bg-slate-50/50 sm:bg-transparent border sm:border-0 border-slate-100">
                  <img src="${item.image || '/images/no-image.svg'}" class="w-20 h-20 rounded-xl object-cover border border-slate-200 flex-shrink-0" loading="lazy" decoding="async" />
                  
                  <div class="flex-1 min-w-0">
                    <h3 class="font-bold text-slate-800 text-sm sm:text-base mb-1">${item.title}</h3>
                    
                    ${item.selectedOptions && Object.keys(item.selectedOptions).length > 0 ? `
                      <div class="text-xs text-slate-500 mb-2 flex flex-wrap gap-2">
                        ${Object.entries(item.selectedOptions).map(([k, v]) => `
                          <span class="bg-slate-100 px-2 py-0.5 rounded">${k}: <strong>${v}</strong></span>
                        `).join('')}
                      </div>
                    ` : ''}

                    <div class="text-xs text-slate-500 mb-2">
                      ${item.isFreeShipping || item.shippingCost === 0 ? '<span class="text-emerald-600 font-bold"><i class="fa-solid fa-truck-fast"></i> شحن مجاني</span>' : (item.governorateShipping && item.governorateShipping[currentGov] !== undefined ? `<span><i class="fa-solid fa-truck"></i> الشحن إلى ${currentGov}: ${item.governorateShipping[currentGov]} ج.م</span>` : `<span><i class="fa-solid fa-truck"></i> مصاريف الشحن: ${item.shippingCost ? item.shippingCost + ' ج.م' : 'تُحسب بالطلب'}</span>`)}
                    </div>

                    ${maxStock <= 5 ? `
                      <div class="text-[10px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded w-fit mb-2">
                        المتبقي بالمخزون: ${maxStock} قطعة فقط!
                      </div>
                    ` : ''}

                    <div class="flex items-center justify-between flex-wrap gap-3 pt-2 border-t border-slate-100 sm:border-0">
                      <div class="quantity-stepper">
                        <button class="stepper-btn" onclick="CartPage.changeQuantity(${idx}, ${item.quantity - 1})">-</button>
                        <input type="text" class="stepper-input" value="${item.quantity}" readonly />
                        <button class="stepper-btn ${isAtMax ? 'opacity-40 cursor-not-allowed' : ''}" onclick="${isAtMax ? `App.showToast('عفواً، الكمية المتاحة في المخزون هي ${maxStock} قطعة فقط ⚠️', 'warning')` : `CartPage.changeQuantity(${idx}, ${item.quantity + 1})`}">+</button>
                      </div>

                      <div class="text-left font-extrabold text-emerald-600 text-base sm:text-lg">
                        ${item.price * item.quantity} ج.م
                      </div>

                      <button onclick="CartPage.removeItem(${idx})" class="text-red-500 hover:text-red-700 text-xs sm:text-sm font-semibold flex items-center gap-1">
                        <i class="fa-regular fa-trash-can"></i> حذف
                      </button>
                    </div>
                  </div>
                </div>
              `;
              }).join('')}
            </div>

            <!-- Coupon Input Box -->
            <div class="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
              <h4 class="font-bold text-slate-800 text-sm mb-3 flex items-center gap-2">
                <i class="fa-solid fa-ticket text-amber-500"></i> هل لديك كود خصم أو كوبون؟
              </h4>
              <div class="flex gap-2">
                <input 
                  type="text" 
                  id="coupon-code-input" 
                  class="form-control text-sm uppercase font-mono font-bold" 
                  placeholder="مثال: SUKI10"
                  value="${this.appliedCoupon ? this.appliedCoupon.code : ''}"
                  ${this.appliedCoupon ? 'disabled' : ''}
                />
                ${this.appliedCoupon ? `
                  <button onclick="CartPage.removeCoupon()" class="bg-red-50 text-red-600 px-4 rounded-xl text-sm font-bold hover:bg-red-100">
                    إلغاء الكود
                  </button>
                ` : `
                  <button onclick="CartPage.applyCoupon()" class="bg-emerald-600 hover:bg-emerald-700 text-white px-6 rounded-xl text-sm font-bold">
                    تطبيق
                  </button>
                `}
              </div>
              ${this.appliedCoupon ? `
                <div class="text-xs font-bold text-emerald-600 mt-2 flex items-center gap-1">
                  <i class="fa-solid fa-circle-check"></i> تم تطبيق الكوبون "${this.appliedCoupon.code}" وخصم ${this.appliedCoupon.discountAmount} ج.م!
                </div>
              ` : ''}
            </div>
          </div>

          <!-- Order Summary Column -->
          <div>
            <div class="summary-card">
              <h3 class="font-extrabold text-lg text-slate-800 mb-4 pb-3 border-b border-slate-100">ملخص الطلب</h3>

              <div class="summary-row">
                <span class="text-slate-600">المجموع الفرعي:</span>
                <span class="font-bold text-slate-800">${subtotal} ج.م</span>
              </div>

              <div class="summary-row bg-slate-50 p-2.5 rounded-xl border border-slate-100 mb-2">
                <div class="flex items-center gap-1.5 text-xs font-bold text-slate-700">
                  <i class="fa-solid fa-location-dot text-amber-500"></i>
                  <span>التوصيل إلى: <strong class="text-emerald-700">${currentGov}</strong></span>
                </div>
                <button type="button" onclick="State.openChangeAddressModal()" class="text-xs text-emerald-600 font-bold underline hover:text-emerald-800">
                  تغيير 📍
                </button>
              </div>

              <div class="summary-row">
                <span class="text-slate-600">رسوم الشحن (${currentGov}):</span>
                <span class="font-bold ${shippingFee === 0 ? 'text-emerald-600' : 'text-slate-800'}">
                  ${shippingFee === 0 ? 'مجاناً 🎉' : `${shippingFee} ج.م`}
                </span>
              </div>

              ${discountAmount > 0 ? `
                <div class="summary-row text-emerald-600">
                  <span>خصم الكوبون (${this.appliedCoupon.code}):</span>
                  <span class="font-bold">-${discountAmount} ج.م</span>
                </div>
              ` : ''}

              <div class="summary-row total">
                <span>الإجمالي النهائي:</span>
                <span>${grandTotal} ج.م</span>
              </div>

              <div class="mt-6 flex flex-col gap-3">
                <a href="#/checkout" class="w-full text-center bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold py-3.5 rounded-xl shadow-md flex items-center justify-center gap-2">
                  <span>متابعة الشراء وإتمام الطلب</span>
                  <i class="fa-solid fa-arrow-left"></i>
                </a>

                <a href="#/" class="w-full text-center bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-3 rounded-xl text-sm">
                  متابعة التسوق
                </a>
              </div>

              <div class="mt-6 pt-4 border-t border-slate-100 text-xs text-slate-500 flex flex-col gap-2">
                <div><i class="fa-solid fa-lock text-emerald-600 ml-1"></i> معاملة آمنة ومحمية 100%</div>
                <div><i class="fa-solid fa-truck text-emerald-600 ml-1"></i> توصيل سريع لجميع أنحاء مصر</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  },

  changeQuantity(index, newQty) {
    State.updateCartQuantity(index, newQty);
    this.render();
  },

  removeItem(index) {
    State.removeFromCart(index);
    this.render();
  },

  async applyCoupon() {
    const input = document.getElementById('coupon-code-input');
    const code = input ? input.value.trim() : '';
    if (!code) {
      App.showToast('يُرجى كتابة كود الخصم أولاً', 'error');
      return;
    }

    if (!State.user) {
      AuthModal.open('login');
      App.showToast('يُرجى تسجيل الدخول أولاً لتطبيق كود الخصم', 'info');
      return;
    }

    try {
      const res = await API.post('/coupons/validate', {
        code,
        cartSubtotal: State.getCartSubtotal()
      });

      if (res.success && res.coupon) {
        this.appliedCoupon = res.coupon;
        App.showToast(res.message, 'success');
        this.render();
      }
    } catch (err) {
      App.showToast(err.message, 'error');
    }
  },

  removeCoupon() {
    this.appliedCoupon = null;
    App.showToast('تم إلغاء كود الخصم', 'info');
    this.render();
  }
};
