/**
 * Suki Store Admin Support Inbox Management
 */

const SupportAdmin = {
  messages: [],

  async render() {
    AdminLayout.render('support', `
      <div class="py-12 text-center text-slate-400">
        <i class="fa-solid fa-spinner fa-spin text-3xl mb-3 text-emerald-600"></i>
        <div>جاري جلب رسائل الدعم الفني...</div>
      </div>
    `);

    try {
      const res = await API.get('/support');
      this.messages = res.messages || [];
      this.renderTable();
    } catch (err) {
      console.error('Support admin render error:', err);
    }
  },

  renderTable() {
    const html = `
      <div>
        <div class="flex items-center justify-between mb-6 flex-wrap gap-4">
          <div>
            <h1 class="text-2xl font-extrabold text-slate-900">رسائل الدعم الفني واستفسارات العملاء</h1>
            <p class="text-xs text-slate-500 mt-1">متابعة رسائل نموذج "تواصل معنا"، الرد عليها، وتحديث حالات المعالجة</p>
          </div>
          <span class="bg-blue-50 text-blue-700 font-bold px-3 py-1.5 rounded-xl text-xs">
            إجمالي الرسائل: ${this.messages.length}
          </span>
        </div>

        <div class="admin-card">
          <div class="admin-table-container">
            <table class="admin-table">
              <thead>
                <tr>
                  <th>المرسل</th>
                  <th>الموضوع</th>
                  <th>بيانات الاتصال</th>
                  <th>تاريخ الإرسال</th>
                  <th>حالة المعالجة</th>
                  <th>الإجراءات</th>
                </tr>
              </thead>
              <tbody>
                ${this.messages.length === 0 ? `
                  <tr><td colspan="6" class="text-center py-8 text-slate-400">صندوق الوارد فارغ، لا توجد رسائل جديدة</td></tr>
                ` : this.messages.map(m => {
                  const statusMap = {
                    unread: { label: 'جديدة 📩', cls: 'status-pending' },
                    in_progress: { label: 'قيد المتابعة ⏳', cls: 'status-processing' },
                    resolved: { label: 'تم الرد والحل ✅', cls: 'status-delivered' }
                  };
                  const st = statusMap[m.status] || { label: m.status, cls: 'status-pending' };
                  return `
                    <tr>
                      <td>
                        <div class="font-bold text-slate-800 text-xs">${this.esc(m.name)}</div>
                        ${(m.replies || []).length ? `<div class="text-[10px] text-emerald-600 font-bold">اتبعت ${m.replies.length} رد</div>` : ''}
                      </td>
                      <td>
                        <div class="font-bold text-slate-800 text-xs">${this.esc(m.subject || 'استفسار عام')}</div>
                        <div class="text-[10px] text-slate-400 max-w-xs truncate">${this.esc(m.message)}</div>
                      </td>
                      <td class="text-xs font-mono">
                        <div>${this.esc(m.phone || '-')}</div>
                        <div class="text-slate-400">${this.esc(m.email || '')}</div>
                      </td>
                      <td class="text-xs text-slate-500">
                        ${new Date(m.createdAt).toLocaleDateString('ar-EG', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td>
                        <span class="status-pill ${st.cls}">${st.label}</span>
                      </td>
                      <td>
                        <button onclick="SupportAdmin.viewMessage('${m.id}')" class="btn-icon-action" title="قراءة والرد">
                          <i class="fa-solid fa-envelope-open-text text-blue-600"></i>
                        </button>
                        <button onclick="SupportAdmin.deleteMessage('${m.id}')" class="btn-icon-action danger" title="حذف الرسالة">
                          <i class="fa-solid fa-trash text-red-600"></i>
                        </button>
                      </td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;

    AdminLayout.render('support', html);
  },

  esc(s) {
    return String(s === undefined || s === null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  },

  // Egyptian mobile → international format for a wa.me link
  waNumber(phone) {
    let d = String(phone || '').replace(/\D/g, '');
    if (d.startsWith('00')) d = d.slice(2);
    if (d.startsWith('0')) d = '20' + d.slice(1);
    return d.length >= 10 ? d : '';
  },

  openWhatsapp(id) {
    const m = this.messages.find(item => item.id === id);
    const box = document.getElementById('support-reply-input');
    const num = m ? this.waNumber(m.phone) : '';
    if (!num) return App.showToast('مفيش رقم تليفون صالح للعميل ده', 'warning');
    const text = (box && box.value.trim()) || `أهلاً ${m.name}، بخصوص رسالتك لسوقي ستور (${m.subject || 'استفسار'}):`;
    window.open(`https://wa.me/${num}?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
  },

  async sendReply(id) {
    const box = document.getElementById('support-reply-input');
    const text = box ? box.value.trim() : '';
    if (text.length < 2) return App.showToast('اكتب الرد الأول', 'warning');
    const btn = document.getElementById('support-reply-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'جاري الإرسال...'; }
    try {
      const res = await API.post(`/support/${id}/reply`, { text, status: 'resolved' });
      App.closeModal();
      App.showToast(res.message, res.delivered && res.delivered.length ? 'success' : 'warning');
      this.render();
    } catch (err) {
      App.showToast(err.message, 'error');
      if (btn) { btn.disabled = false; btn.textContent = 'إرسال الرد للعميل'; }
    }
  },

  viewMessage(id) {
    const m = this.messages.find(item => item.id === id);
    if (!m) return;
    const e = s => this.esc(s);
    const replies = Array.isArray(m.replies) ? m.replies : [];
    const channelLabel = c => (c === 'email' ? 'إيميل' : c === 'notification' ? 'إشعار' : c);

    App.openModal(`رسالة من: ${e(m.name)}`, `
      <div class="text-right text-xs">
        <div class="bg-slate-50 p-4 rounded-xl border border-slate-200 mb-4 flex justify-between items-center">
          <div>
            <div class="font-bold text-sm text-slate-800">${e(m.subject)}</div>
            <div class="text-slate-500 mt-1">المرسل: ${e(m.name)} • ${e(m.phone || '')} • ${e(m.email || '')} ${m.userId ? '• <span class="text-emerald-600 font-bold">عنده حساب</span>' : ''}</div>
          </div>
          <div class="text-[11px] text-slate-400">${new Date(m.createdAt).toLocaleString('ar-EG')}</div>
        </div>

        <div class="mb-4">
          <label class="font-bold text-slate-700 block mb-1">نص الرسالة:</label>
          <div class="bg-white p-3 rounded-xl border border-slate-200 text-slate-700 leading-relaxed text-sm whitespace-pre-line">${e(m.message)}</div>
        </div>

        ${replies.length ? `
          <div class="mb-4">
            <label class="font-bold text-slate-700 block mb-1">الردود اللي اتبعتت:</label>
            ${replies.map(r => `
              <div class="bg-emerald-50 border border-emerald-100 rounded-xl p-3 mb-2">
                <div class="whitespace-pre-line text-slate-800">${e(r.text)}</div>
                <div class="text-[10px] text-slate-500 mt-1">${e(r.byName || '')} • ${new Date(r.at).toLocaleString('ar-EG')} • وصل: ${(r.channels || []).length ? r.channels.map(channelLabel).join(' + ') : 'محفوظ بس (مفيش وسيلة توصيل)'}</div>
              </div>
            `).join('')}
          </div>
        ` : ''}

        <div class="mb-5 p-3 rounded-xl border-2 border-emerald-200 bg-white">
          <label class="font-bold text-emerald-800 block mb-1"><i class="fa-solid fa-reply"></i> رد للعميل (هيوصله):</label>
          <textarea id="support-reply-input" rows="4" class="form-control mb-2" placeholder="اكتب ردك للعميل هنا..."></textarea>
          <div class="text-[10.5px] text-slate-500 mb-2">بيوصل كإشعار في حسابه${m.email ? ' + إيميل على ' + e(m.email) : ''}. وتقدر كمان تبعته واتساب.</div>
          <div class="flex gap-2 flex-wrap">
            <button type="button" id="support-reply-btn" onclick="SupportAdmin.sendReply('${m.id}')" class="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 rounded-xl text-xs">إرسال الرد للعميل</button>
            ${this.waNumber(m.phone) ? `<button type="button" onclick="SupportAdmin.openWhatsapp('${m.id}')" class="bg-green-500 hover:bg-green-600 text-white font-bold py-2.5 px-4 rounded-xl text-xs"><i class="fa-brands fa-whatsapp"></i> واتساب</button>` : ''}
          </div>
        </div>

        <form onsubmit="SupportAdmin.submitStatus(event, '${m.id}')">
          <div class="form-group mb-3">
            <label class="form-label font-bold">تحديث حالة الرسالة:</label>
            <select id="support-status-select" class="form-control font-bold">
              <option value="unread" ${m.status === 'unread' ? 'selected' : ''}>جديدة (لم تتم المتابعة)</option>
              <option value="in_progress" ${m.status === 'in_progress' ? 'selected' : ''}>قيد المتابعة والتواصل</option>
              <option value="resolved" ${m.status === 'resolved' ? 'selected' : ''}>تم الرد والحل بنجاح</option>
            </select>
          </div>

          <div class="form-group mb-4">
            <label class="form-label font-bold">ملاحظات داخلية (العميل مش بيشوفها):</label>
            <textarea id="support-notes-input" rows="2" class="form-control" placeholder="ملاحظة للفريق...">${e(m.replyNotes || '')}</textarea>
          </div>

          <button type="submit" class="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 rounded-xl text-sm">
            حفظ تحديث الرسالة
          </button>
        </form>
      </div>
    `);
  },

  async submitStatus(e, id) {
    e.preventDefault();
    const status = document.getElementById('support-status-select').value;
    const replyNotes = document.getElementById('support-notes-input').value.trim();

    try {
      const res = await API.put(`/support/${id}`, { status, replyNotes });
      if (res.success) {
        App.closeModal();
        App.showToast(res.message, 'success');
        this.render();
      }
    } catch (err) {
      App.showToast(err.message, 'error');
    }
  },

  deleteMessage(id) {
    App.confirm('هل أنت متأكد من حذف هذه الرسالة؟', async () => {
      try {
        const res = await API.delete(`/support/${id}`);
        if (res.success) {
          App.showToast('تم حذف الرسالة بنجاح', 'success');
          this.render();
        }
      } catch (err) {
        App.showToast(err.message, 'error');
      }
    });
  }
};
