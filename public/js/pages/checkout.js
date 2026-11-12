/**
 * Suki Store Responsive Checkout Page
 * Supports GPS Location with Manual Fallback, Governorates Restrictions,
 * Loyalty Points Redemption (max 10%, min 500 pts), and Mutual Exclusion with Coupons.
 */

const EGYPT_GOVS = [
  'القاهرة', 'الجيزة', 'الإسكندرية', 'الدقهلية', 'البحر الأحمر', 'البحيرة', 'الفيوم',
  'الغربية', 'الإسماعيلية', 'المنوفية', 'المنيا', 'القليوبية', 'الوادي الجديد',
  'السويس', 'أسوان', 'أسيوط', 'بني سويف', 'بورسعيد', 'دمياط', 'الشرقية',
  'جنوب سيناء', 'كفر الشيخ', 'مطروح', 'الأقصر', 'قنا', 'شمال سيناء', 'سوهاج'
];

const CheckoutPage = {
  paymentMethod: 'cod',
  appliedCoupon: null,
  useLoyaltyPoints: false,
  loyaltySummary: null,
  selectedGovernorate: null,
  selectedAddressId: null,
  latitude: null,
  longitude: null,
  isDetectingGps: false,

  computeShipping(governorate = (this.selectedGovernorate || State.getDeliveryGovernorate())) {
    return State.computeShipping(governorate);
  },

  async render() {
    const main = document.getElementById('main-content');
    if (!main) return;

    const user = State.user;
    if (!user) {
      main.innerHTML = `
        <div class="container py-16 text-center" dir="rtl">
          <div class="bg-white rounded-2xl border border-slate-200 p-12 max-w-md mx-auto shadow-sm">
            <div class="w-16 h-16 bg-amber-50 text-amber-500 rounded-full flex items-center justify-center mx-auto mb-4 text-2xl">
              <i class="fa-solid fa-lock"></i>
            </div>
            <h2 class="text-xl font-bold text-slate-800 mb-2">يتطلب إتمام الطلب تسجيل الدخول</h2>
            <p class="text-sm text-slate-500 mb-6">سجل دخولك أو أنشئ حساباً جديداً لحفظ طلبك ومتابعة شحنته بسهولة.</p>
            <div class="flex flex-col gap-3">
              <button onclick="AuthModal.open('login', '#/checkout')" class="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 rounded-xl text-sm transition cursor-pointer">
                تسجيل الدخول
              </button>
              <button onclick="AuthModal.open('register', '#/checkout')" class="w-full bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold py-3 rounded-xl text-sm transition cursor-pointer">
                إنشاء حساب جديد
              </button>
            </div>
          </div>
        </div>
      `;
      return;
    }

    const cart = State.cart || [];
    if (cart.length === 0) {
      window.location.hash = '#/cart';
      return;
    }

    // Which payment methods are switched on (checked on every visit to the page)
    if (!this.paymentOptions || !this._paymentOptionsFresh) {
      try {
        const po = await API.get('/orders/payment-options');
        this.paymentOptions = po;
      } catch (e) {
        this.paymentOptions = { cod: true, card: { enabled: false, gatewayConnected: false } };
      }
      this._paymentOptionsFresh = true;
      setTimeout(() => { this._paymentOptionsFresh = false; }, 30000);
    }
    const cardOption = (this.paymentOptions && this.paymentOptions.card) || { enabled: false };
    if (!cardOption.enabled && this.paymentMethod !== 'cod') this.paymentMethod = 'cod';

    // Always fetch fresh loyalty values (the store may have changed them in the dashboard)
    try {
      const lRes = await API.get('/coupons/loyalty/summary');
      if (lRes.success && lRes.loyalty) {
        this.loyaltySummary = lRes.loyalty;
      }
    } catch (e) {
      // If it can't be loaded, don't offer points at all (never guess the values)
      this.loyaltySummary = { points: user.loyaltyPoints || 0, loyaltyEnabled: false, minThreshold: 0, maxPercent: 0, pointValueEgp: 0 };
    }

    const subtotal = State.getCartSubtotal();
    const savedAddresses = Array.isArray(user.addresses) ? user.addresses : [];
    
    // Pick default address if not set
    if (!this.selectedAddressId && savedAddresses.length > 0) {
      const def = savedAddresses.find(a => a.isDefault) || savedAddresses[0];
      this.selectedAddressId = def.id;
      this.selectedGovernorate = def.governorate || def.city || 'القاهرة';
    }

    const currentGov = (this.selectedGovernorate || 'القاهرة').trim();

    // Check if any product in cart is restricted for the current governorate
    const disallowedItems = cart.filter(item => {
      const allowed = item.allowedGovernorates || item.availableGovernorates;
      if (Array.isArray(allowed) && allowed.length > 0) {
        return !allowed.some(g => g.trim() === currentGov || currentGov.includes(g.trim()) || g.trim().includes(currentGov));
      }
      return false;
    });

    const hasDisallowed = disallowedItems.length > 0;
    const shippingFee = this.computeShipping(this.selectedGovernorate);

    // Carry over coupon if any from cart page
    if (!this.appliedCoupon && CartPage.appliedCoupon && !this.useLoyaltyPoints) {
      this.appliedCoupon = CartPage.appliedCoupon;
    }

    // Calculate coupon discount
    let couponDiscountAmount = (this.appliedCoupon && !this.useLoyaltyPoints) 
      ? (this.appliedCoupon.discountAmount || 0) 
      : 0;

    // Calculate loyalty points discount (max 10% of subtotal, only if points >= 500 and no coupon)
    let loyaltyDiscountAmount = 0;
    let loyaltyPointsRedeemable = 0;
    const lData = this.loyaltySummary || {};
    const userPoints = Number(lData.points) || 0;
    const pointVal = Number(lData.pointValueEgp) || 1.0;
    const minThreshold = Number(lData.minThreshold) || 500;
    const maxPercent = Number(lData.maxPercent) || 10;
    const canRedeemPoints = userPoints >= minThreshold && lData.loyaltyEnabled !== false;

    if (this.useLoyaltyPoints && canRedeemPoints && !this.appliedCoupon) {
      const maxDiscount = Math.floor(subtotal * (maxPercent / 100));
      const maxPoints = Math.floor(maxDiscount / pointVal);
      loyaltyPointsRedeemable = Math.min(userPoints, maxPoints);
      loyaltyDiscountAmount = Math.min(Math.round(loyaltyPointsRedeemable * pointVal * 100) / 100, Math.max(0, subtotal - 1));
    }

    const totalDiscount = couponDiscountAmount + loyaltyDiscountAmount;
    const grandTotal = Math.max(1, subtotal + shippingFee - totalDiscount);
    const activeAddr = savedAddresses.find(a => a.id === this.selectedAddressId) || user.address || {};

    main.innerHTML = `
      <div class="checkout-page bg-slate-50 min-h-screen py-8 pb-28 md:pb-12" dir="rtl">
        <div class="container max-w-6xl mx-auto px-4">
          <!-- Step Indicator -->
          <div class="flex items-center justify-center gap-2 mb-8 text-xs font-bold text-slate-500">
            <a href="#/cart" class="text-emerald-600 hover:underline">السلة</a>
            <i class="fa-solid fa-chevron-left text-[10px]"></i>
            <span class="text-slate-800 bg-emerald-100 text-emerald-800 px-3 py-1 rounded-full">إتمام الطلب والدفع</span>
            <i class="fa-solid fa-chevron-left text-[10px]"></i>
            <span>تأكيد الطلب</span>
          </div>

          <div class="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            <!-- Left Column: Shipping Address & Payment Form -->
            <div class="lg:col-span-7 space-y-6">
              <!-- 1. Address Card -->
              <div class="form-card bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                <div class="flex items-center justify-between pb-4 mb-4 border-b border-slate-100 flex-wrap gap-2">
                  <h3 class="form-title text-base font-extrabold text-slate-800 flex items-center gap-2">
                    <i class="fa-solid fa-location-dot text-emerald-600"></i>
                    <span>عنوان التوصيل</span>
                  </h3>
                  <div class="text-xs text-slate-400 font-medium">شحن سريع لباب بيتك في مصر</div>
                </div>

                <!-- Interactive Real Map & GPS Address Picker -->
                <div class="mb-5 bg-gradient-to-r from-emerald-50 via-teal-50 to-emerald-50 border border-emerald-200 rounded-2xl p-4 shadow-sm">
                  <div class="flex items-center justify-between flex-wrap gap-3 mb-3">
                    <div class="flex items-center gap-3 min-w-0">
                      <div class="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center text-lg shadow-sm flex-shrink-0">
                        <i class="fa-solid fa-map-location-dot"></i>
                      </div>
                      <div class="min-w-0">
                        <div class="text-xs sm:text-sm font-black text-slate-800">تحديد موقعك بدقة على الخريطة</div>
                        <div class="text-[11px] text-emerald-700 font-medium">ضع دبوساً على موقع بيتك ليتم ملء المحافظة، الحي، والشارع تلقائياً</div>
                      </div>
                    </div>

                    <div class="flex items-center gap-2 flex-wrap">
                      <button 
                        type="button" 
                        onclick="CheckoutPage.openMapPicker()" 
                        class="bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs px-4 py-2.5 rounded-xl transition flex items-center gap-1.5 shadow-md shadow-emerald-600/20 cursor-pointer"
                      >
                        <i class="fa-solid fa-map-pin"></i>
                        <span>فتح الخريطة التفاعلية 🗺️</span>
                      </button>

                      <button 
                        type="button" 
                        id="btn-detect-gps"
                        onclick="CheckoutPage.detectLocationGps()" 
                        class="bg-white hover:bg-emerald-50 text-emerald-800 font-extrabold text-xs px-3.5 py-2.5 rounded-xl border border-emerald-300 transition flex items-center gap-1.5 shadow-sm cursor-pointer"
                        title="تحديد عبر الـ GPS"
                      >
                        <i class="fa-solid ${this.isDetectingGps ? 'fa-spinner fa-spin' : 'fa-crosshairs text-emerald-600'}"></i>
                        <span>${this.isDetectingGps ? 'جاري التحديد...' : 'GPS سريع'}</span>
                      </button>
                    </div>
                  </div>

                  <div id="gps-status-badge" class="${this.latitude ? '' : 'hidden'} p-3 rounded-xl bg-emerald-100/80 border border-emerald-300 text-emerald-950 text-xs font-bold flex items-start gap-2.5">
                    <i class="fa-solid fa-circle-check text-emerald-600 text-base mt-0.5 flex-shrink-0"></i>
                    <div class="min-w-0 flex-1">
                      <div>تم تثبيت موقعك بالدبوس على الخريطة بنجاح (${this.latitude?.toFixed(4)}, ${this.longitude?.toFixed(4)})</div>
                      <div class="text-[11px] text-emerald-800 font-normal mt-0.5">تمت تعبئة بيانات العنوان بالأسفل، ويمكنك مراجعة وتعديل أي خانة يدوياً.</div>
                    </div>
                  </div>
                </div>

                <!-- Saved Addresses Shortcut (if customer has multiple saved) -->
                ${savedAddresses.length > 0 ? `
                  <div class="mb-4">
                    <label class="block text-xs font-bold text-slate-700 mb-2">اختر من عناوينك المسجلة:</label>
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      ${savedAddresses.map(a => `
                        <div 
                          class="p-3 rounded-xl border text-xs cursor-pointer transition flex items-start gap-2.5 ${this.selectedAddressId === a.id ? 'border-emerald-500 bg-emerald-50/50 text-emerald-900 font-bold' : 'border-slate-200 bg-slate-50 text-slate-700'}"
                          onclick="CheckoutPage.chooseAddress('${a.id}')"
                        >
                          <input type="radio" name="savedAddress" ${this.selectedAddressId === a.id ? 'checked' : ''} class="mt-0.5 accent-emerald-600" />
                          <div class="flex-1 min-w-0">
                            <div class="truncate">${a.label || 'عنوان'} - ${a.governorate || a.city}</div>
                            <div class="text-[10px] text-slate-500 font-normal truncate">${a.street || ''} ${a.building || ''}</div>
                          </div>
                        </div>
                      `).join('')}
                    </div>
                  </div>
                ` : ''}

                <!-- Manual Address Inputs (Editable) -->
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                  <div class="form-group">
                    <label class="form-label text-xs font-bold text-slate-700 mb-1.5 block">اسم المستلم بالكامل *</label>
                    <input type="text" id="ship-name" class="form-control text-xs" value="${activeAddr.recipientName || activeAddr.fullName || user.name || ''}" placeholder="الاسم ثلاثي" required />
                  </div>

                  <div class="form-group">
                    <label class="form-label text-xs font-bold text-slate-700 mb-1.5 block">رقم الهاتف الأساسي للتواصل *</label>
                    <input type="tel" id="ship-phone" class="form-control text-xs" value="${activeAddr.phone || user.phone || ''}" placeholder="01xxxxxxxxx" required />
                  </div>
                </div>

                <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                  <div class="form-group">
                    <label class="form-label text-xs font-bold text-slate-700 mb-1.5 block">المحافظة (مصر) *</label>
                    <select id="ship-governorate" class="form-control text-xs font-bold" onchange="CheckoutPage.changeGovernorate(this.value)" required>
                      ${EGYPT_GOVS.map(gov => `
                        <option value="${gov}" ${this.selectedGovernorate === gov ? 'selected' : ''}>${gov}</option>
                      `).join('')}
                    </select>
                  </div>

                  <div class="form-group">
                    <label class="form-label text-xs font-bold text-slate-700 mb-1.5 block">المدينة / الحي / المركز *</label>
                    <input type="text" id="ship-city" class="form-control text-xs" placeholder="مثال: مدينة نصر / الدقي / سموحة" value="${activeAddr.city || ''}" required />
                  </div>
                </div>

                <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                  <div class="form-group">
                    <label class="form-label text-xs font-bold text-slate-700 mb-1.5 block">اسم الشارع</label>
                    <input type="text" id="ship-street" class="form-control text-xs" placeholder="مثال: شارع مصطفى النحاس" value="${activeAddr.street || ''}" />
                  </div>

                  <div class="form-group">
                    <label class="form-label text-xs font-bold text-slate-700 mb-1.5 block">رقم العمارة والشقة</label>
                    <input type="text" id="ship-building" class="form-control text-xs" placeholder="مثال: عمارة 12 - الدور 3 - شقة 7" value="${activeAddr.building || ''}" />
                  </div>
                </div>

                <div class="form-group">
                  <label class="form-label text-xs font-bold text-slate-700 mb-1.5 block">ملاحظات التوصيل لمندوب الشحن (اختياري)</label>
                  <textarea id="ship-notes" rows="2" class="form-control text-xs" placeholder="أي علامة مميزة بجوار المسكن أو مواعيد مفضلة للاستلام...">${activeAddr.notes || ''}</textarea>
                </div>
              </div>

              <!-- 2. Payment Method Card -->
              <div class="form-card bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                <h3 class="form-title text-base font-extrabold text-slate-800 flex items-center gap-2 mb-4">
                  <i class="fa-solid fa-wallet text-emerald-600"></i>
                  <span>طريقة الدفع</span>
                </h3>

                <div class="space-y-3">
                  <div class="payment-method-card p-4 rounded-xl border cursor-pointer transition flex items-center gap-3 ${this.paymentMethod === 'cod' ? 'border-emerald-500 bg-emerald-50/40 shadow-sm' : 'border-slate-200 bg-white'}" onclick="CheckoutPage.selectPayment('cod')">
                    <input type="radio" name="paymentMethod" value="cod" ${this.paymentMethod === 'cod' ? 'checked' : ''} class="accent-emerald-600 w-4 h-4" />
                    <div class="flex-1 min-w-0">
                      <div class="font-extrabold text-slate-800 text-xs sm:text-sm">الدفع عند الاستلام (كاش)</div>
                      <div class="text-[11px] text-slate-500">ادفع نقداً لمندوب التوصيل عند استلام طلبك</div>
                    </div>
                    <i class="fa-solid fa-money-bill-wave text-xl text-emerald-600"></i>
                  </div>

                  ${cardOption.enabled ? `
                  <div class="payment-method-card p-4 rounded-xl border cursor-pointer transition flex items-center gap-3 ${this.paymentMethod === 'card' ? 'border-emerald-500 bg-emerald-50/40 shadow-sm' : 'border-slate-200 bg-white'}" onclick="CheckoutPage.selectPayment('card')">
                    <input type="radio" name="paymentMethod" value="card" ${this.paymentMethod === 'card' ? 'checked' : ''} class="accent-emerald-600 w-4 h-4" />
                    <div class="flex-1 min-w-0">
                      <div class="font-extrabold text-slate-800 text-xs sm:text-sm">الدفع بالبطاقة البنكية أو المحافظ الإلكترونية</div>
                      <div class="text-[11px] text-slate-500">${cardOption.gatewayConnected
                        ? 'دفع آمن عبر بوابة الدفع (فيزا / ماستركارد / ميزة)'
                        : 'سيتواصل معك فريقنا بعد تأكيد الطلب لإتمام الدفع بالبطاقة'}</div>
                    </div>
                    <div class="flex gap-1.5 text-lg text-slate-400">
                      <i class="fa-brands fa-cc-visa text-blue-500"></i>
                      <i class="fa-brands fa-cc-mastercard text-amber-500"></i>
                    </div>
                  </div>` : ''}
                </div>
              </div>

              <!-- Submit Button or Disallowed Region Warning -->
              ${hasDisallowed ? `
                <div class="bg-rose-50 border border-rose-300 text-rose-800 p-4 rounded-2xl text-xs font-bold flex items-center gap-3 shadow-sm">
                  <i class="fa-solid fa-triangle-exclamation text-rose-600 text-xl flex-shrink-0"></i>
                  <div>
                    <div class="font-black text-sm">غير متاح التوصيل لهذه المحافظة</div>
                    <div class="text-[11px] text-rose-700 mt-0.5">
                      المنتج (${disallowedItems.map(i => i.title).join('، ')}) غير متاح للشحن إلى محافظة "${currentGov}". يُرجى تغيير المحافظة أو حذف المنتج للمتابعة.
                    </div>
                  </div>
                </div>
              ` : `
                <button 
                  type="button" 
                  id="confirm-order-btn" 
                  onclick="CheckoutPage.submitOrder(event)" 
                  class="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-black py-4 rounded-2xl text-sm transition shadow-lg shadow-emerald-600/20 flex items-center justify-center gap-2 cursor-pointer"
                >
                  <i class="fa-solid fa-circle-check text-lg"></i>
                  <span>تأكيد الطلب وشحن المنتجات (${grandTotal} ج.م)</span>
                </button>
              `}
            </div>

            <!-- Right Column: Order Summary, Loyalty Points & Coupon -->
            <div class="lg:col-span-5 space-y-4">
              <div class="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
                <h3 class="font-black text-slate-800 text-sm pb-3 mb-4 border-b border-slate-100 flex items-center justify-between">
                  <span>ملخص الطلب</span>
                  <span class="text-xs text-slate-400 font-normal">${cart.length} منتج</span>
                </h3>

                <!-- Cart Items List -->
                <div class="divide-y divide-slate-100 max-h-60 overflow-y-auto mb-4">
                  ${cart.map(item => `
                    <div class="py-2.5 flex items-center gap-3 text-xs">
                      <img src="${item.images?.[0] || item.image || '/icons/icon-192.png'}" alt="${item.title}" class="w-12 h-12 object-cover rounded-xl border border-slate-100 flex-shrink-0" />
                      <div class="flex-1 min-w-0">
                        <div class="font-bold text-slate-800 truncate">${item.title}</div>
                        <div class="text-slate-400 text-[11px]">الكمية: ${item.quantity} × ${item.price} ج.م</div>
                      </div>
                      <div class="font-extrabold text-slate-800">${item.price * item.quantity} ج.م</div>
                    </div>
                  `).join('')}
                </div>

                <!-- 1. Loyalty Points Redemption Card -->
                <div class="bg-amber-50/60 border border-amber-200/80 rounded-2xl p-4 mb-4 text-xs">
                  <div class="flex items-center justify-between mb-2">
                    <div class="font-black text-amber-900 flex items-center gap-2">
                      <i class="fa-solid fa-coins text-amber-600"></i>
                      <span>نقاط الولاء (Suki Points)</span>
                    </div>
                    <span class="font-black text-amber-800 bg-amber-100 px-2 py-0.5 rounded-lg text-[11px]">
                      رصيدك: ${userPoints} نقطة (${userPoints * pointVal} ج.م)
                    </span>
                  </div>

                  ${canRedeemPoints ? `
                    <div class="pt-1">
                      <label class="flex items-start gap-2.5 cursor-pointer ${this.appliedCoupon ? 'opacity-50 pointer-events-none' : ''}">
                        <input 
                          type="checkbox" 
                          id="chk-use-loyalty" 
                          ${this.useLoyaltyPoints ? 'checked' : ''} 
                          ${this.appliedCoupon ? 'disabled' : ''}
                          onchange="CheckoutPage.toggleLoyaltyPoints(this.checked)" 
                          class="mt-1 accent-amber-600 w-4 h-4 cursor-pointer" 
                        />
                        <div>
                          <div class="font-bold text-amber-950">استبدال النقاط بخصم مباشر في هذا الطلب</div>
                          <div class="text-[10px] text-amber-800 mt-0.5">
                            خصم 10% كحد أقصى (${Math.min(userPoints * pointVal, Math.floor(subtotal * (maxPercent / 100)))} ج.م)
                          </div>
                        </div>
                      </label>
                      ${this.appliedCoupon ? `
                        <div class="text-[10px] text-rose-700 font-bold mt-2">
                          <i class="fa-solid fa-circle-info"></i> تم تطبيق كود خصم؛ لا يمكن الجمع بين الكوبون ونقاط الولاء في نفس الطلب.
                        </div>
                      ` : ''}
                    </div>
                  ` : `
                    <div class="text-[11px] text-amber-800 mt-1 leading-relaxed">
                      ${userPoints < minThreshold ? `
                        تحتاج إلى تجميع <strong>${minThreshold} نقطة</strong> كحد أدنى لبدء الاستبدال (متبقي لديك ${minThreshold - userPoints} نقطة).
                      ` : 'نظام نقاط الولاء غير متاح حالياً.'}
                    </div>
                  `}
                </div>

                <!-- 2. Coupon Card -->
                <div class="bg-slate-50 p-3.5 rounded-2xl border border-slate-200 mb-4 text-xs ${this.useLoyaltyPoints ? 'opacity-60' : ''}">
                  <div class="font-bold text-slate-700 mb-2 flex items-center justify-between">
                    <span>كود الخصم (الكوبون):</span>
                    ${this.useLoyaltyPoints ? '<span class="text-[10px] text-amber-700 font-bold">معطل لاستخدامك نقاط الولاء</span>' : ''}
                  </div>
                  <div class="flex gap-2">
                    <input 
                      type="text" 
                      id="checkout-coupon-input" 
                      class="form-control text-xs uppercase font-mono font-bold" 
                      placeholder="أدخل الكود" 
                      value="${this.appliedCoupon ? this.appliedCoupon.code : ''}" 
                      ${this.appliedCoupon || this.useLoyaltyPoints ? 'disabled' : ''} 
                    />
                    ${this.appliedCoupon ? `
                      <button type="button" onclick="CheckoutPage.removeCoupon()" class="bg-red-50 hover:bg-red-100 text-red-600 px-3 py-2 rounded-xl text-xs font-bold transition cursor-pointer">
                        إلغاء
                      </button>
                    ` : `
                      <button type="button" onclick="CheckoutPage.applyCoupon()" ${this.useLoyaltyPoints ? 'disabled' : ''} class="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl text-xs font-extrabold transition cursor-pointer ${this.useLoyaltyPoints ? 'opacity-50 pointer-events-none' : ''}">
                        تطبيق
                      </button>
                    `}
                  </div>
                  ${this.appliedCoupon ? `
                    <div class="text-[11px] font-bold text-emerald-700 mt-2 flex items-center gap-1.5">
                      <i class="fa-solid fa-tag"></i>
                      <span>وفرت ${couponDiscountAmount} ج.م بالكوبون "${this.appliedCoupon.code}"</span>
                    </div>
                  ` : ''}
                </div>

                <!-- 3. Totals Breakdown -->
                <div class="space-y-2 text-xs pt-2 border-t border-slate-100">
                  <div class="flex items-center justify-between text-slate-600">
                    <span>المجموع الفرعي:</span>
                    <span class="font-bold text-slate-800">${subtotal} ج.م</span>
                  </div>

                  <div class="flex items-center justify-between text-slate-600">
                    <span>رسوم الشحن (${this.selectedGovernorate}):</span>
                    <span class="font-bold ${shippingFee === 0 ? 'text-emerald-600' : 'text-slate-800'}">
                      ${shippingFee === 0 ? 'مجاناً 🎁' : `${shippingFee} ج.م`}
                    </span>
                  </div>

                  ${couponDiscountAmount > 0 ? `
                    <div class="flex items-center justify-between text-emerald-600 font-bold">
                      <span>خصم الكوبون (${this.appliedCoupon?.code}):</span>
                      <span>-${couponDiscountAmount} ج.م</span>
                    </div>
                  ` : ''}

                  ${loyaltyDiscountAmount > 0 ? `
                    <div class="flex items-center justify-between text-amber-700 font-bold">
                      <span>خصم نقاط الولاء (${loyaltyPointsRedeemable} نقطة):</span>
                      <span>-${loyaltyDiscountAmount} ج.م</span>
                    </div>
                  ` : ''}

                  <div class="flex items-center justify-between text-sm font-black text-slate-900 pt-3 border-t border-slate-200">
                    <span>الإجمالي النهائي للدفع:</span>
                    <span class="text-emerald-700 text-base">${grandTotal} ج.م</span>
                  </div>
                </div>

                <div class="mt-4 pt-3 border-t border-slate-100 text-[11px] text-slate-500 space-y-1.5">
                  <div><i class="fa-solid fa-truck-fast text-emerald-600 ml-1.5"></i> توصيل سريع لمحافظة ${this.selectedGovernorate}</div>
                  <div><i class="fa-solid fa-shield-check text-emerald-600 ml-1.5"></i> استبدال خلال 14 يوم لعيوب الصناعة (الشحن علينا)</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  },

  // Interactive Map Picker Trigger
  openMapPicker() {
    MapPicker.open({
      initialLat: this.latitude,
      initialLng: this.longitude,
      currentGov: this.selectedGovernorate,
      onConfirm: (addr) => {
        this.latitude = addr.lat;
        this.longitude = addr.lng;
        this.selectedGovernorate = addr.governorate;
        State.setDeliveryGovernorate(addr.governorate);

        const govSelect = document.getElementById('ship-governorate');
        const cityInput = document.getElementById('ship-city');
        const streetInput = document.getElementById('ship-street');

        if (govSelect && addr.governorate) {
          govSelect.value = addr.governorate;
        }
        if (cityInput && addr.city) {
          cityInput.value = addr.city;
        }
        if (streetInput && addr.street) {
          streetInput.value = addr.street;
        }

        const badge = document.getElementById('gps-status-badge');
        if (badge) {
          badge.classList.remove('hidden');
          badge.innerHTML = `
            <i class="fa-solid fa-circle-check text-emerald-600 text-base mt-0.5 flex-shrink-0"></i>
            <div class="min-w-0 flex-1">
              <div class="font-bold">تم تحديد وتثبيت موقعك بالدبوس على الخريطة بنجاح (${addr.lat.toFixed(4)}, ${addr.lng.toFixed(4)}) 📍</div>
              <div class="text-[11px] text-emerald-800 font-normal mt-0.5">${addr.formattedAddress}</div>
            </div>
          `;
        }

        this.render();
      }
    });
  },

  // GPS Auto Detection
  detectLocationGps() {
    if (!navigator.geolocation) {
      App.showToast('نظام تحديد المواقع GPS غير مدعوم في متصفحك. يُرجى إدخال العنوان يدوياً', 'warning');
      return;
    }

    this.isDetectingGps = true;
    const btn = document.getElementById('btn-detect-gps');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> <span>جاري التحديد...</span>';
    }

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        this.latitude = pos.coords.latitude;
        this.longitude = pos.coords.longitude;
        this.isDetectingGps = false;

        try {
          // Reverse geocoding via OpenStreetMap Nominatim
          const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${this.latitude}&lon=${this.longitude}&accept-language=ar`);
          if (res.ok) {
            const data = await res.json();
            const addr = data.address || {};

            // Map governorate
            const state = addr.state || addr.province || addr.city || '';
            const matchedGov = EGYPT_GOVS.find(g => state.includes(g) || g.includes(state)) || 'القاهرة';

            const city = addr.city || addr.town || addr.suburb || addr.neighbourhood || addr.village || '';
            const street = addr.road || addr.street || '';

            const cityInput = document.getElementById('ship-city');
            const streetInput = document.getElementById('ship-street');
            const govSelect = document.getElementById('ship-governorate');

            if (cityInput && city) cityInput.value = city;
            if (streetInput && street) streetInput.value = street;
            if (govSelect && matchedGov) {
              govSelect.value = matchedGov;
              this.selectedGovernorate = matchedGov;
              State.setDeliveryGovernorate(matchedGov);
            }

            const badge = document.getElementById('gps-status-badge');
            if (badge) badge.classList.remove('hidden');

            App.showToast('📍 تم التقاط موقعك الجغرافي بنجاح! يمكنك تعديل أي خانة يدوياً بحرية', 'success');
          }
        } catch (e) {
          console.warn('Reverse geocoding error:', e);
          App.showToast('📍 تم التقاط إحداثياتك بالـ GPS بنجاح! أكمل كتابة اسم الشارع والعمارة', 'info');
        }

        if (btn) {
          btn.disabled = false;
          btn.innerHTML = '<i class="fa-solid fa-circle-check"></i> <span>تم التحديد بنجاح</span>';
        }
      },
      (err) => {
        console.warn('GPS error:', err);
        this.isDetectingGps = false;
        if (btn) {
          btn.disabled = false;
          btn.innerHTML = '<i class="fa-solid fa-crosshairs"></i> <span>تحديد موقعي الآن</span>';
        }
        App.showToast('تعذر الوصول إلى الـ GPS. يُرجى التأكد من تفعيل إذن الموقع أو كتابة العنوان يدوياً', 'info');
      },
      { timeout: 10000, enableHighAccuracy: true }
    );
  },

  toggleLoyaltyPoints(usePoints) {
    this.useLoyaltyPoints = usePoints;
    if (usePoints) {
      // Mutual exclusion: Clear coupon if loyalty points are activated
      this.appliedCoupon = null;
      CartPage.appliedCoupon = null;
    }
    this.render();
  },

  chooseAddress(addrId) {
    this.selectedAddressId = addrId;
    const user = State.user;
    const saved = (user?.addresses || []).find(a => a.id === addrId);
    if (saved) {
      this.selectedGovernorate = saved.governorate || saved.city || 'القاهرة';
      State.setDeliveryGovernorate(this.selectedGovernorate);
    }
    this.render();
  },

  changeGovernorate(gov) {
    this.selectedGovernorate = gov;
    State.setDeliveryGovernorate(gov);
    this.render();
  },

  selectPayment(method) {
    this.paymentMethod = method;
    this.render();
  },

  async applyCoupon() {
    const input = document.getElementById('checkout-coupon-input');
    const code = input ? input.value.trim() : '';
    if (!code) return;

    if (this.useLoyaltyPoints) {
      App.showToast('لا يمكن استخدام الكوبون مع نقاط الولاء في نفس الطلب', 'warning');
      return;
    }

    try {
      const res = await API.post('/coupons/validate', {
        code,
        cartSubtotal: State.getCartSubtotal()
      });

      if (res.success && res.coupon) {
        this.appliedCoupon = res.coupon;
        CartPage.appliedCoupon = res.coupon;
        this.useLoyaltyPoints = false;
        App.showToast(res.message, 'success');
        this.render();
      }
    } catch (err) {
      App.showToast(err.message, 'error');
    }
  },

  removeCoupon() {
    this.appliedCoupon = null;
    CartPage.appliedCoupon = null;
    this.render();
  },

  async submitOrder(e) {
    if (e && e.preventDefault) e.preventDefault();

    const currentGov = (this.selectedGovernorate || State.getDeliveryGovernorate() || 'القاهرة').trim();
    const disallowed = State.cart.some(item => {
      const allowed = item.allowedGovernorates || item.availableGovernorates;
      return Array.isArray(allowed) && allowed.length > 0 && !allowed.some(g => g.trim() === currentGov || currentGov.includes(g.trim()) || g.trim().includes(currentGov));
    });

    if (disallowed) {
      App.showToast('غير متاح التوصيل لهذه المنطقة. يُرجى تغيير المحافظة أو تعديل السلة', 'error');
      return;
    }

    // Strict stock limit validation before submitting
    for (const item of State.cart) {
      const maxStock = typeof item.stock === 'number' ? item.stock : 999;
      if (item.quantity > maxStock) {
        App.showToast(`عفواً، الكمية المطلوبة للمنتج "${item.title}" (${item.quantity}) تتجاوز المخزون المتاح (${maxStock} قطعة). يُرجى تعديل السلة`, 'error');
        return;
      }
    }

    const btn = document.getElementById('confirm-order-btn');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> جاري تأكيد الطلب وتجهيزه...';
    }

    const nameEl = document.getElementById('ship-name');
    const phoneEl = document.getElementById('ship-phone');
    const cityEl = document.getElementById('ship-city');
    const streetEl = document.getElementById('ship-street');
    const buildingEl = document.getElementById('ship-building');
    const notesEl = document.getElementById('ship-notes');

    const shippingAddress = {
      fullName: (nameEl?.value || State.user?.name || '').trim(),
      phone: (phoneEl?.value || State.user?.phone || '').trim(),
      governorate: this.selectedGovernorate || State.getDeliveryGovernorate(),
      city: (cityEl?.value || '').trim(),
      street: (streetEl?.value || '').trim(),
      building: (buildingEl?.value || '').trim(),
      notes: (notesEl?.value || '').trim(),
      latitude: this.latitude,
      longitude: this.longitude
    };

    if (!shippingAddress.fullName || !shippingAddress.phone || !shippingAddress.city) {
      App.showToast('يُرجى إكمال بيانات الاسم والهاتف والمدينة', 'warning');
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-circle-check"></i> تأكيد الطلب الآن';
      }
      return;
    }

    try {
      const res = await API.post('/orders', {
        items: State.cart,
        shippingAddress,
        paymentMethod: this.paymentMethod,
        couponCode: (!this.useLoyaltyPoints && this.appliedCoupon) ? this.appliedCoupon.code : null,
        useLoyaltyPoints: Boolean(this.useLoyaltyPoints),
        notes: shippingAddress.notes
      });

      if (res.success && res.order) {
        State.clearCart();
        this.appliedCoupon = null;
        this.useLoyaltyPoints = false;
        CartPage.appliedCoupon = null;
        App.showToast(res.message, 'success');
        window.location.hash = `#/order/${res.order.id}`;
      }
    } catch (err) {
      App.showToast(err.message, 'error');
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-circle-check"></i> تأكيد الطلب الآن';
      }
    }
  }
};
