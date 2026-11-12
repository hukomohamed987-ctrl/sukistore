/**
 * Suki Store Order Details & Tracking Stepper Page
 */

const OrderDetailPage = {
  cancelOrder(orderId, orderNumber) {
    App.openModal(`إلغاء الطلب #${orderNumber}`, `
      <div class="text-right text-xs">
        <p class="text-slate-600 mb-3 leading-relaxed">تقدر تلغي الطلب لأنه لسه ما اتجهزش. لو استخدمت كوبون أو نقاط هيرجعولك.</p>
        <label class="form-label font-bold">سبب الإلغاء (اختياري):</label>
        <select id="cancel-reason" class="form-control mb-4">
          <option value="">— اختار —</option>
          <option>غيّرت رأيي</option>
          <option>طلبت بالغلط / عايز أعدّل الطلب</option>
          <option>لقيت سعر أحسن</option>
          <option>التوصيل هيتأخر عليّا</option>
          <option>سبب تاني</option>
        </select>
        <button id="cancel-confirm-btn" onclick="OrderDetailPage.confirmCancel('${orderId}')" class="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-3 rounded-xl text-sm">تأكيد إلغاء الطلب</button>
      </div>
    `);
  },

  async confirmCancel(orderId) {
    const btn = document.getElementById('cancel-confirm-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'جاري الإلغاء...'; }
    try {
      const reason = (document.getElementById('cancel-reason') || {}).value || '';
      const res = await API.put(`/orders/${orderId}/cancel`, { reason });
      App.closeModal();
      App.showToast(res.message || 'تم إلغاء الطلب', 'success');
      this.render(orderId);
    } catch (err) {
      App.showToast(err.message, 'error');
      if (btn) { btn.disabled = false; btn.textContent = 'تأكيد إلغاء الطلب'; }
    }
  },

  async render(orderId) {
    const main = document.getElementById('main-content');
    main.innerHTML = `
      <div class="container py-8 text-center text-slate-400">
        <i class="fa-solid fa-spinner fa-spin text-3xl mb-3 text-emerald-600"></i>
        <div>جاري جلب تفاصيل الطلب...</div>
      </div>
    `;

    try {
      const res = await API.get(`/orders/${orderId}`);
      if (!res.success || !res.order) {
        main.innerHTML = `<div class="container py-16 text-center text-red-500 font-bold">الطلب غير موجود</div>`;
        return;
      }

      const order = res.order;
      const addr = order.shippingAddress || {};

      // Tracking stages
      const stages = [
        { key: 'pending', label: 'استلام الطلب', icon: 'fa-receipt' },
        { key: 'processing', label: 'قيد التجهيز', icon: 'fa-box' },
        { key: 'shipped', label: 'قيد الشحن', icon: 'fa-truck-fast' },
        { key: 'delivered', label: 'تم التسليم', icon: 'fa-house-circle-check' }
      ];

      const stageIndexMap = { pending: 0, processing: 1, shipped: 2, delivered: 3, cancelled: -1 };
      const currentStageIndex = stageIndexMap[order.status] !== undefined ? stageIndexMap[order.status] : 0;

      main.innerHTML = `
        <div class="container py-8">
          <!-- Printable Invoice Container (visible normally & formatted for print) -->
          <div id="printable-invoice">
            <!-- Header bar -->
            <div class="flex items-center justify-between pb-6 mb-6 border-b border-slate-200 flex-wrap gap-4">
              <div>
                <div class="flex items-center gap-3">
                  <h1 class="text-2xl md:text-3xl font-extrabold text-slate-900">
                    طلب #${order.orderNumber}
                  </h1>
                  <span class="status-pill status-${order.status}">${ProfilePage.formatStatus(order.status)}</span>
                </div>
                <div class="text-xs text-slate-500 mt-1">
                  تاريخ الطلب: ${new Date(order.createdAt).toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>

              <div class="flex gap-2 no-print flex-wrap">
                ${order.status === 'pending' && State.user && String(order.userId) === String(State.user.id) ? `
                  <button onclick="OrderDetailPage.cancelOrder('${order.id}', '${order.orderNumber}')" class="bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 font-bold px-4 py-2.5 rounded-xl text-xs flex items-center gap-2">
                    <i class="fa-solid fa-ban"></i>
                    <span>إلغاء الطلب</span>
                  </button>
                ` : ''}
                <button onclick="ExportKit.print('#printable-invoice', 'فاتورة طلب #${order.orderNumber}')" class="bg-slate-800 hover:bg-slate-900 text-white font-bold px-4 py-2.5 rounded-xl text-xs flex items-center gap-2">
                  <i class="fa-solid fa-print"></i>
                  <span>طباعة الفاتورة</span>
                </button>
                <a href="#/orders" class="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-4 py-2.5 rounded-xl text-xs flex items-center gap-1">
                  <span>العودة لطلباتي</span>
                  <i class="fa-solid fa-angle-left"></i>
                </a>
              </div>
            </div>

            <!-- Visual Tracking Stepper (if not cancelled) -->
            ${order.status !== 'cancelled' ? `
              <div class="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm mb-8 no-print">
                <h3 class="font-extrabold text-base text-slate-800 mb-6 flex items-center gap-2">
                  <i class="fa-solid fa-timeline text-emerald-600"></i>
                  <span>مسار تتبع الطلب والشحنة</span>
                </h3>

                <div class="tracking-stepper">
                  ${stages.map((stage, idx) => {
                    const isCompleted = idx <= currentStageIndex;
                    const isActive = idx === currentStageIndex;
                    return `
                      <div class="tracking-step ${isCompleted ? 'completed' : ''} ${isActive ? 'active' : ''}">
                        <div class="step-bubble">
                          <i class="fa-solid ${stage.icon}"></i>
                        </div>
                        <div class="step-label ${isActive ? 'text-emerald-700 font-extrabold' : ''}">${stage.label}</div>
                      </div>
                    `;
                  }).join('')}
                </div>
              </div>
            ` : `
              <div class="bg-red-50 border border-red-200 text-red-700 p-4 rounded-xl mb-6 font-bold flex items-center gap-2">
                <i class="fa-solid fa-circle-xmark text-lg"></i>
                <span>${order.cancelledByCustomer ? 'لقد قمت بإلغاء هذا الطلب.' : 'تم إلغاء هذا الطلب. إذا كان لديك استفسار يرجى التواصل مع الدعم الفني.'}</span>
              </div>
            `}

            <!-- Order Grid: Items & Details -->
            <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <!-- Items Table -->
              <div class="lg:col-span-2">
                <div class="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
                  <h3 class="font-extrabold text-base text-slate-800 mb-4 pb-3 border-b border-slate-100">
                    المنتجات المطلوبة (${order.items.length})
                  </h3>

                  <div class="flex flex-col divide-y divide-slate-100">
                    ${order.items.map(item => `
                      <div class="py-4 flex items-center gap-4">
                        <img src="${item.image || '/images/no-image.svg'}" class="w-16 h-16 rounded-xl object-cover border border-slate-200 flex-shrink-0" />
                        <div class="flex-1 min-w-0">
                          <h4 class="font-bold text-slate-800 text-sm mb-1">${item.title}</h4>
                          ${item.selectedOptions && Object.keys(item.selectedOptions).length > 0 ? `
                            <div class="text-xs text-slate-500 mb-1">
                              ${Object.entries(item.selectedOptions).map(([k, v]) => `${k}: ${v}`).join(' | ')}
                            </div>
                          ` : ''}
                          <div class="text-xs text-slate-400">
                            ${item.quantity} × ${item.price} ج.م (لكل ${item.saleUnit || 'قطعة'})
                          </div>
                        </div>
                        <div class="font-extrabold text-emerald-700 text-base">
                          ${item.price * item.quantity} ج.م
                        </div>
                      </div>
                    `).join('')}
                  </div>
                </div>

                <!-- Status History Timeline -->
                ${Array.isArray(order.statusHistory) && order.statusHistory.length > 0 ? `
                  <div class="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm mt-6 no-print">
                    <h3 class="font-extrabold text-base text-slate-800 mb-4 pb-3 border-b border-slate-100 flex items-center gap-2">
                      <i class="fa-solid fa-clock-rotate-left text-emerald-600"></i>
                      <span>سجل تحديثات الطلب</span>
                    </h3>
                    <div class="flex flex-col gap-3">
                      ${order.statusHistory.map(h => `
                        <div class="flex items-start gap-3 text-xs">
                          <div class="w-2 h-2 rounded-full bg-emerald-600 mt-1.5 flex-shrink-0"></div>
                          <div class="flex-1">
                            <div class="font-bold text-slate-800">${h.label || h.status}</div>
                            <div class="text-slate-500">${h.note || ''}</div>
                            <div class="text-[11px] text-slate-400 mt-0.5">${new Date(h.timestamp).toLocaleDateString('ar-EG', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
                          </div>
                        </div>
                      `).join('')}
                    </div>
                  </div>
                ` : ''}
              </div>

              <!-- Shipping & Payment Column -->
              <div class="lg:col-span-1">
                <!-- Address Details -->
                <div class="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm mb-6">
                  <h3 class="font-extrabold text-base text-slate-800 mb-4 pb-3 border-b border-slate-100 flex items-center gap-2">
                    <i class="fa-solid fa-location-dot text-emerald-600"></i>
                    <span>عنوان الشحن والاستلام</span>
                  </h3>

                  <div class="text-xs text-slate-600 flex flex-col gap-2 leading-relaxed">
                    <div><strong>المستلم:</strong> ${addr.fullName || order.customerName}</div>
                    <div><strong>رقم الجوال:</strong> ${addr.phone || order.customerPhone}</div>
                    <div><strong>المدينة / المحافظة:</strong> ${addr.city} - ${addr.area || ''}</div>
                    ${addr.street ? `<div><strong>الشارع والمبنى:</strong> ${addr.street} ${addr.building ? `, ${addr.building}` : ''}</div>` : ''}
                    ${addr.notes ? `<div><strong>ملاحظات التوصيل:</strong> ${addr.notes}</div>` : ''}
                  </div>
                </div>

                <!-- Payment Summary -->
                <div class="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
                  <h3 class="font-extrabold text-base text-slate-800 mb-4 pb-3 border-b border-slate-100">
                    ملخص الفاتورة
                  </h3>

                  <div class="summary-row">
                    <span class="text-slate-600">المجموع الفرعي:</span>
                    <span class="font-bold text-slate-800">${order.subtotal} ج.م</span>
                  </div>

                  <div class="summary-row">
                    <span class="text-slate-600">رسوم الشحن والتوصيل:</span>
                    <span class="font-bold ${order.shippingFee === 0 ? 'text-emerald-600' : 'text-slate-800'}">
                      ${order.shippingFee === 0 ? 'مجاناً' : `${order.shippingFee} ج.م`}
                    </span>
                  </div>

                  ${order.discountAmount > 0 ? `
                    <div class="summary-row text-emerald-600">
                      <span>خصم الكوبون ${order.appliedCoupon ? `(${order.appliedCoupon.code})` : ''}:</span>
                      <span class="font-bold">-${order.discountAmount} ج.م</span>
                    </div>
                  ` : ''}

                  <div class="summary-row total">
                    <span>الإجمالي:</span>
                    <span>${order.grandTotal} ج.م</span>
                  </div>

                  <div class="mt-4 pt-3 border-t border-slate-100 text-xs text-slate-500">
                    طريقة الدفع: <strong>${order.paymentMethod === 'cod' ? 'الدفع عند الاستلام' : 'بطاقة إلكترونية'}</strong>
                    (${order.paymentStatus === 'paid' ? '<span class="text-emerald-600 font-bold">مدفوع</span>' : '<span class="text-amber-600 font-bold">بانتظار التحصيل</span>'})
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      `;
    } catch (err) {
      console.error('Order detail render error:', err);
    }
  }
};
