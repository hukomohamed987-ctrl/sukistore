/**
 * Suki Store Customer Orders List Page
 */

const OrdersPage = {
  async render() {
    const main = document.getElementById('main-content');
    const user = State.user;

    if (!user) {
      main.innerHTML = `
        <div class="container py-16 text-center max-w-md mx-auto">
          <div class="bg-white dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700 p-8 shadow-sm">
            <div class="w-16 h-16 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 flex items-center justify-center text-3xl mx-auto mb-4">
              <i class="fa-solid fa-box-open"></i>
            </div>
            <h2 class="text-xl font-extrabold text-slate-800 dark:text-white mb-2">عرض سجل طلباتك</h2>
            <p class="text-xs text-slate-500 dark:text-slate-400 mb-6 leading-relaxed">يُرجى تسجيل الدخول لمشاهدة جميع طلباتك ومتابعة مسار الشحنات وحالة التوصيل.</p>
            <div class="flex flex-col gap-3">
              <button onclick="AuthModal.open('login', '#/orders')" class="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs transition flex items-center justify-center gap-2">
                <i class="fa-solid fa-right-to-bracket"></i>
                <span>تسجيل الدخول</span>
              </button>
              <a href="#/" class="w-full py-3 px-4 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 font-bold rounded-xl text-xs transition inline-block">
                الرجوع للرئيسية
              </a>
            </div>
          </div>
        </div>
      `;
      return;
    }

    main.innerHTML = `
      <div class="container py-8 text-center text-slate-400">
        <i class="fa-solid fa-spinner fa-spin text-3xl mb-3 text-emerald-600"></i>
        <div>جاري جلب قائمة طلباتك...</div>
      </div>
    `;

    try {
      const res = await API.get('/orders/my-orders');
      const orders = res.orders || [];

      main.innerHTML = `
        <div class="container py-8">
          <div class="flex items-center justify-between mb-6 flex-wrap gap-4">
            <div>
              <h1 class="text-2xl md:text-3xl font-extrabold text-slate-800 flex items-center gap-3">
                <i class="fa-solid fa-box-open text-emerald-600"></i>
                <span>قائمة طلباتي (${orders.length})</span>
              </h1>
              <p class="text-xs text-slate-500 mt-1">تتبع مسار شحناتك وتفاصيل كل طلب بسهولة</p>
            </div>
            <div class="flex items-center gap-2">
              <a href="#/returns" class="bg-amber-50 text-amber-900 border border-amber-300 hover:bg-amber-100 font-extrabold px-4 py-2 rounded-xl text-xs flex items-center gap-1.5 transition shadow-sm">
                <i class="fa-solid fa-shield-check text-amber-600"></i>
                <span>متابعة طلبات الاستبدال</span>
              </a>
              <a href="#/category/all" class="bg-emerald-50 text-emerald-700 font-bold px-4 py-2 rounded-xl text-xs hover:bg-emerald-100">
                <i class="fa-solid fa-cart-plus ml-1"></i> تسوق المزيد
              </a>
            </div>
          </div>

          ${orders.length === 0 ? `
            <div class="bg-white rounded-2xl border border-slate-200 p-16 text-center shadow-sm">
              <div class="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4 text-3xl text-slate-400">
                <i class="fa-solid fa-box-archive"></i>
              </div>
              <h3 class="text-lg font-bold text-slate-800 mb-2">ليس لديك أي طلبات سابقة</h3>
              <p class="text-sm text-slate-500 mb-6">ابدأ بالتسوق الآن واستمتع بأقوى العروض الحصرية!</p>
              <a href="#/category/all" class="inline-block bg-emerald-600 text-white font-bold px-8 py-3 rounded-full text-sm hover:bg-emerald-700">
                تصفح المنتجات
              </a>
            </div>
          ` : `
            <div class="flex flex-col gap-4">
              ${orders.map(order => `
                <div class="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm hover:border-emerald-300 transition-colors">
                  <div class="flex items-center justify-between pb-4 border-b border-slate-100 mb-4 flex-wrap gap-3">
                    <div>
                      <div class="font-extrabold text-slate-900 text-base">
                        رقم الطلب: <span class="text-emerald-700">#${order.orderNumber}</span>
                      </div>
                      <div class="text-xs text-slate-400 mt-0.5">
                        بتاريخ: ${new Date(order.createdAt).toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>

                    <div class="flex items-center gap-2 flex-wrap">
                      <span class="status-pill status-${order.status}">${ProfilePage.formatStatus(order.status)}</span>
                      ${order.status === 'delivered' ? `
                        <button type="button" onclick="ReturnsPage.openSubmitModal('${order.id}')" class="bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 font-extrabold px-3 py-1.5 rounded-xl text-xs transition flex items-center gap-1.5 shadow-sm">
                          <i class="fa-solid fa-arrow-rotate-left text-amber-600"></i>
                          <span>طلب استبدال (عيب صناعة)</span>
                        </button>
                      ` : ''}
                      <a href="#/order/${order.id}" class="bg-slate-100 hover:bg-emerald-50 hover:text-emerald-700 text-slate-700 font-bold px-4 py-2 rounded-xl text-xs transition-colors flex items-center gap-1">
                        <span>عرض التفاصيل والتتبع</span>
                        <i class="fa-solid fa-angle-left"></i>
                      </a>
                    </div>
                  </div>

                  <!-- Items Preview -->
                  <div class="flex items-center gap-4 overflow-x-auto pb-2 mb-3">
                    ${order.items.map(item => `
                      <div class="flex items-center gap-2 flex-shrink-0 bg-slate-50 p-2 rounded-xl border border-slate-100">
                        <img src="${item.image || '/images/no-image.svg'}" class="w-10 h-10 rounded-lg object-cover" />
                        <div class="text-xs">
                          <div class="font-bold text-slate-800 truncate max-w-[140px]">${item.title}</div>
                          <div class="text-slate-400">${item.quantity} × ${item.price} ج.م</div>
                        </div>
                      </div>
                    `).join('')}
                  </div>

                  <div class="flex items-center justify-between pt-3 border-t border-slate-100 text-xs text-slate-600">
                    <div>
                      طريقة الدفع: <strong>${order.paymentMethod === 'cod' ? 'الدفع عند الاستلام' : 'بطاقة إلكترونية'}</strong>
                    </div>
                    <div class="font-extrabold text-base text-emerald-700">
                      الإجمالي: ${order.grandTotal} ج.م
                    </div>
                  </div>
                </div>
              `).join('')}
            </div>
          `}
        </div>
      `;
    } catch (err) {
      console.error('Orders render error:', err);
    }
  }
};
