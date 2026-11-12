/**
 * Suki Store Admin: customer reviews moderation (approve / hide / reply / delete)
 */
const ReviewsAdmin = {
  status: 'pending',
  search: '',
  data: { reviews: [], counts: {}, requireApproval: true },

  esc(s) {
    return String(s === undefined || s === null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  },

  async render() {
    AdminLayout.render('reviews', `<div class="py-12 text-center text-slate-400"><i class="fa-solid fa-spinner fa-spin text-3xl mb-3 text-emerald-600"></i><div>جاري تحميل التقييمات...</div></div>`);
    try {
      const res = await API.get('/reviews/admin/all', { status: this.status, q: this.search });
      this.data = res;
      this.renderPage();
    } catch (err) {
      AdminLayout.render('reviews', `<div class="p-8 text-center text-rose-600">${this.esc(err.message)}</div>`);
    }
  },

  renderPage() {
    const { reviews = [], counts = {}, requireApproval } = this.data;
    const tabs = [
      ['pending', 'مستنية مراجعة', 'amber'],
      ['approved', 'ظاهرة', 'emerald'],
      ['rejected', 'مخفية', 'slate'],
      ['all', 'الكل', 'blue']
    ];
    const stars = n => Array.from({ length: 5 }).map((_, i) => `<i class="fa-${i < n ? 'solid' : 'regular'} fa-star"></i>`).join('');
    const html = `
      <div>
        <div class="flex items-center justify-between mb-6 flex-wrap gap-4">
          <div>
            <h1 class="text-2xl font-extrabold text-slate-900">تقييمات العملاء</h1>
            <p class="text-xs text-slate-500 mt-1">راجع التقييمات قبل ما تظهر، ورد عليها، أو امسح أي تقييم مسيء</p>
          </div>
          <label class="flex items-center gap-2 text-xs font-bold bg-white border border-slate-200 rounded-xl px-3 py-2 cursor-pointer">
            <input type="checkbox" ${requireApproval ? 'checked' : ''} onchange="ReviewsAdmin.toggleApproval(this.checked)" class="accent-emerald-600 w-4 h-4" />
            <span>التقييم الجديد مايظهرش غير بعد موافقتي</span>
          </label>
        </div>

        <div class="admin-card">
          <div class="admin-card-header flex-wrap gap-2">
            <div class="flex gap-2 flex-wrap">
              ${tabs.map(([k, label]) => `
                <button onclick="ReviewsAdmin.setStatus('${k}')" class="px-3 py-1.5 rounded-lg text-xs font-bold ${this.status === k ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}">
                  ${label} (${counts[k] || 0})
                </button>`).join('')}
            </div>
            <input class="form-control text-xs max-w-xs" placeholder="ابحث باسم العميل أو المنتج أو الكلام..." value="${this.esc(this.search)}" onchange="ReviewsAdmin.search=this.value; ReviewsAdmin.render()" />
          </div>

          <div class="p-4 flex flex-col gap-3">
            ${reviews.length === 0 ? '<div class="text-center py-10 text-slate-400 text-sm">مفيش تقييمات هنا</div>' : reviews.map(r => `
              <div class="border border-slate-200 rounded-xl p-4 ${r.status === 'pending' ? 'bg-amber-50/40' : r.status === 'rejected' ? 'bg-slate-50 opacity-80' : 'bg-white'}">
                <div class="flex items-start justify-between gap-3 flex-wrap">
                  <div class="min-w-0">
                    <div class="text-xs text-slate-500 mb-1"><i class="fa-solid fa-box"></i> <a href="#/product/${this.esc(r.productId)}" target="_blank" class="font-bold text-emerald-700 hover:underline">${this.esc(r.productTitle || 'منتج محذوف')}</a></div>
                    <div class="font-bold text-sm text-slate-800">${this.esc(r.userName)} ${r.isVerifiedPurchase ? '<span class="text-[10px] text-emerald-600 font-bold"><i class="fa-solid fa-circle-check"></i> اشترى المنتج</span>' : '<span class="text-[10px] text-slate-400">ما اشتراش المنتج ده</span>'}</div>
                    <div class="text-amber-500 text-xs mt-0.5">${stars(Number(r.rating) || 0)}</div>
                  </div>
                  <div class="text-[11px] text-slate-400">${new Date(r.createdAt).toLocaleString('ar-EG')}</div>
                </div>
                <p class="text-sm text-slate-700 mt-2 whitespace-pre-line">${this.esc(r.comment) || '<span class="text-slate-400">(من غير تعليق)</span>'}</p>
                ${r.adminReply ? `<div class="mt-2 text-xs bg-emerald-50 border border-emerald-100 rounded-lg p-2"><b>ردك:</b> ${this.esc(r.adminReply)}</div>` : ''}
                <div class="flex gap-2 flex-wrap mt-3">
                  ${r.status !== 'approved' ? `<button onclick="ReviewsAdmin.setReviewStatus('${r.id}', 'approved')" class="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg"><i class="fa-solid fa-check"></i> إظهار</button>` : ''}
                  ${r.status !== 'rejected' ? `<button onclick="ReviewsAdmin.setReviewStatus('${r.id}', 'rejected')" class="bg-slate-200 hover:bg-slate-300 text-slate-800 text-xs font-bold px-3 py-1.5 rounded-lg"><i class="fa-solid fa-eye-slash"></i> إخفاء</button>` : ''}
                  <button onclick="ReviewsAdmin.openReply('${r.id}')" class="bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-bold px-3 py-1.5 rounded-lg"><i class="fa-solid fa-reply"></i> ${r.adminReply ? 'تعديل الرد' : 'رد'}</button>
                  <button onclick="ReviewsAdmin.deleteReview('${r.id}')" class="bg-red-50 hover:bg-red-100 text-red-700 text-xs font-bold px-3 py-1.5 rounded-lg"><i class="fa-solid fa-trash"></i> مسح</button>
                </div>
              </div>`).join('')}
          </div>
        </div>
      </div>`;
    AdminLayout.render('reviews', html);
  },

  setStatus(s) { this.status = s; this.render(); },

  async toggleApproval(on) {
    try {
      await API.put('/reviews/admin-settings/approval', { requireApproval: on });
      App.showToast(on ? 'التقييمات الجديدة هتستنى موافقتك' : 'التقييمات الجديدة هتظهر على طول', 'success');
    } catch (err) { App.showToast(err.message, 'error'); }
  },

  async setReviewStatus(id, status) {
    try {
      await API.put(`/reviews/admin/${id}`, { status });
      App.showToast(status === 'approved' ? 'التقييم ظاهر دلوقتي' : 'التقييم اتخفى', 'success');
      this.render();
    } catch (err) { App.showToast(err.message, 'error'); }
  },

  openReply(id) {
    const r = (this.data.reviews || []).find(x => x.id === id);
    if (!r) return;
    App.openModal('رد المتجر على التقييم', `
      <div class="text-right text-xs">
        <div class="bg-slate-50 border border-slate-200 rounded-xl p-3 mb-3">${this.esc(r.comment)}</div>
        <textarea id="review-reply-input" rows="4" class="form-control mb-3" placeholder="الرد هيظهر تحت التقييم في صفحة المنتج">${this.esc(r.adminReply || '')}</textarea>
        <button onclick="ReviewsAdmin.saveReply('${id}')" class="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 rounded-xl text-sm">حفظ الرد</button>
      </div>`);
  },

  async saveReply(id) {
    try {
      await API.put(`/reviews/admin/${id}`, { adminReply: document.getElementById('review-reply-input').value });
      App.closeModal();
      App.showToast('تم حفظ الرد', 'success');
      this.render();
    } catch (err) { App.showToast(err.message, 'error'); }
  },

  deleteReview(id) {
    App.confirm('مسح التقييم ده نهائياً؟', async () => {
      try {
        await API.delete(`/reviews/admin/${id}`);
        App.showToast('تم مسح التقييم', 'success');
        this.render();
      } catch (err) { App.showToast(err.message, 'error'); }
    });
  }
};
