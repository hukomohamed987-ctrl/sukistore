/**
 * Suki Store Support & Contact Page
 */

const SupportPage = {
  contactCards() {
    const c = (typeof App !== 'undefined' && App.contact) || {};
    const esc = v => String(v || '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
    const wa = typeof Footer !== 'undefined' ? Footer.waNumber(c.whatsapp) : '';
    const tone = { emerald: ['bg-emerald-50 text-emerald-600', 'text-emerald-600'], blue: ['bg-blue-50 text-blue-600', 'text-blue-600'], amber: ['bg-amber-50 text-amber-600', 'text-amber-600'] };
    const card = (icon, color, title, sub, href, text) => `
            <div class="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm flex items-start gap-4">
              <div class="w-12 h-12 rounded-xl ${tone[color][0]} flex items-center justify-center text-xl flex-shrink-0"><i class="${icon}"></i></div>
              <div class="min-w-0">
                <h4 class="font-bold text-slate-800 dark:text-slate-100 text-sm mb-1">${title}</h4>
                <p class="text-xs text-slate-500 mb-2">${sub}</p>
                <a href="${href}" target="_blank" rel="noopener" class="${tone[color][1]} font-extrabold text-sm hover:underline break-all" dir="ltr">${esc(text)}</a>
              </div>
            </div>`;
    const cards = [
      wa && card('fa-brands fa-whatsapp', 'emerald', 'واتساب مباشر', 'أسرع وسيلة للتواصل مع خدمة العملاء', `https://wa.me/${wa}`, c.whatsapp),
      c.phone && card('fa-solid fa-phone', 'blue', 'الخط الساخن', 'اتصل بينا مباشرة', `tel:${esc(c.phone)}`, c.phone),
      c.email && card('fa-solid fa-envelope', 'amber', 'البريد الإلكتروني', 'للشكاوى والمقترحات والتعاون التجاري', `mailto:${esc(c.email)}`, c.email)
    ].filter(Boolean).join('');
    return cards || `
            <div class="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm text-sm text-slate-600 dark:text-slate-300">
              <i class="fa-solid fa-comments text-emerald-600 ml-1"></i> كلمنا من المحادثة المباشرة (زر الشات تحت) أو ابعتلنا رسالة من الفورم.
            </div>`;
  },

  render() {
    const main = document.getElementById('main-content');
    const user = State.user || {};

    main.innerHTML = `
      <div class="container py-8">
        <!-- Header -->
        <div class="text-center max-w-2xl mx-auto mb-10">
          <span class="bg-emerald-100 text-emerald-800 text-xs font-extrabold px-3 py-1 rounded-full uppercase">خدمة العملاء</span>
          <h1 class="text-3xl font-extrabold text-slate-900 mt-2 mb-3">نحن هنا لمساعدتك دائماً</h1>
          <p class="text-sm text-slate-500 leading-relaxed">
            يسعدنا تواصلك معنا في أي وقت. فريق دعم "سوقي ستور" جاهز للإجابة عن استفساراتك ومساعدتك على مدار الساعة.
          </p>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-12">
          <!-- Contact Info Cards (from dashboard: إعدادات المتجر ← بيانات التواصل) -->
          <div class="lg:col-span-1 flex flex-col gap-4">${this.contactCards()}</div>
          <!-- Contact Form -->
          <div class="lg:col-span-2">
            <div class="bg-white p-6 md:p-8 rounded-2xl border border-slate-200 shadow-sm">
              <h3 class="text-xl font-extrabold text-slate-800 mb-6 flex items-center gap-2">
                <i class="fa-solid fa-paper-plane text-emerald-600"></i>
                <span>أرسل لنا رسالة مباشرة</span>
              </h3>

              <form onsubmit="SupportPage.submitMessage(event)">
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  <div class="form-group">
                    <label class="form-label">الاسم بالكامل *</label>
                    <input type="text" id="contact-name" class="form-control" value="${user.name || ''}" placeholder="أحمد علي" required />
                  </div>
                  <div class="form-group">
                    <label class="form-label">رقم الجوال للتواصل *</label>
                    <input type="tel" id="contact-phone" class="form-control" value="${user.phone || ''}" placeholder="01012345678" required />
                  </div>
                </div>

                <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  <div class="form-group">
                    <label class="form-label">البريد الإلكتروني</label>
                    <input type="email" id="contact-email" class="form-control" value="${user.email || ''}" placeholder="name@example.com" />
                  </div>
                  <div class="form-group">
                    <label class="form-label">موضوع الرسالة *</label>
                    <select id="contact-subject" class="form-control">
                      <option value="استفسار عن طلب">استفسار عن طلب قائم</option>
                      <option value="استفسار عن منتج">استفسار عن مواصفات منتج</option>
                      <option value="طلب استبدال">طلب استبدال</option>
                      <option value="اقتراح أو شكوى">اقتراح أو شكوى للإدارة</option>
                      <option value="أخرى">استفسار عام</option>
                    </select>
                  </div>
                </div>

                <div class="form-group mb-6">
                  <label class="form-label">نص الرسالة أو الاستفسار *</label>
                  <textarea id="contact-message" rows="5" class="form-control" placeholder="اكتب تفاصيل استفسارك أو رقم الطلب هنا..." required></textarea>
                </div>

                <button type="submit" id="contact-submit-btn" class="bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3.5 px-8 rounded-xl text-sm shadow-md flex items-center gap-2">
                  <i class="fa-solid fa-paper-plane"></i>
                  <span>إرسال الرسالة</span>
                </button>
              </form>
            </div>
          </div>
        </div>

        ${State.user ? `<div id="my-support-messages" class="mb-12"></div>` : ''}

        <!-- FAQ Section -->
        <div class="bg-white p-6 md:p-8 rounded-2xl border border-slate-200 shadow-sm">
          <h3 class="text-xl font-extrabold text-slate-800 mb-6 text-center">الأسئلة الأكثر شيوعاً</h3>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">
            <div class="bg-slate-50 p-4 rounded-xl border border-slate-100">
              <h4 class="font-bold text-slate-800 mb-2 flex items-center gap-2">
                <i class="fa-solid fa-circle-question text-emerald-600"></i>
                كم يستغرق توصيل الطلب؟
              </h4>
              <p class="text-slate-600 text-xs leading-relaxed">
                يتم التوصيل داخل القاهرة والجيزة خلال 24 ساعة، ولباقي المحافظات خلال 48 ساعة كحد أقصى.
              </p>
            </div>

            <div class="bg-slate-50 p-4 rounded-xl border border-slate-100">
              <h4 class="font-bold text-slate-800 mb-2 flex items-center gap-2">
                <i class="fa-solid fa-circle-question text-emerald-600"></i>
                إزاي أتابع طلبي؟
              </h4>
              <p class="text-slate-600 text-xs leading-relaxed">
                من صفحة "طلباتي" هتلاقي حالة كل طلب أول بأول، وبيوصلك إشعار مع كل تحديث.
              </p>
            </div>

            <div class="bg-slate-50 p-4 rounded-xl border border-slate-100">
              <h4 class="font-bold text-slate-800 mb-2 flex items-center gap-2">
                <i class="fa-solid fa-circle-question text-emerald-600"></i>
                ما هي سياسة الاستبدال؟
              </h4>
              <p class="text-slate-600 text-xs leading-relaxed">
                يحق للعميل استبدال المنتج خلال 14 يوماً من تاريخ الاستلام في حالة عيب الصناعة، والمتجر بيتحمل مصاريف شحن الاستبدال بالكامل.
              </p>
            </div>

            <div class="bg-slate-50 p-4 rounded-xl border border-slate-100">
              <h4 class="font-bold text-slate-800 mb-2 flex items-center gap-2">
                <i class="fa-solid fa-circle-question text-emerald-600"></i>
                كيف أستخدم كود الخصم (الكوبون)؟
              </h4>
              <p class="text-slate-600 text-xs leading-relaxed">
                أدخل كود الخصم في خانة "كوبون الخصم" في صفحة السلة أو صفحة إتمام الطلب واضغط على "تطبيق" ليتم خصم القيمة فورياً.
              </p>
            </div>
          </div>
        </div>
      </div>
    `;
    if (State.user) this.loadMyMessages();
  },

  async loadMyMessages() {
    const box = document.getElementById('my-support-messages');
    if (!box) return;
    const esc = s => String(s === undefined || s === null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    try {
      const res = await API.get('/support/my');
      const list = res.messages || [];
      if (!list.length) { box.innerHTML = ''; return; }
      const st = { unread: ['اتبعتت', 'bg-slate-100 text-slate-600'], in_progress: ['بنتابعها', 'bg-amber-50 text-amber-700'], resolved: ['اتردّ عليها', 'bg-emerald-50 text-emerald-700'] };
      box.innerHTML = `
        <div class="bg-white p-6 md:p-8 rounded-2xl border border-slate-200 shadow-sm">
          <h3 class="text-xl font-extrabold text-slate-800 mb-4 flex items-center gap-2"><i class="fa-solid fa-inbox text-emerald-600"></i> رسائلي وردود خدمة العملاء</h3>
          <div class="flex flex-col gap-3">
            ${list.map(m => {
              const s = st[m.status] || st.unread;
              return `
                <div class="border border-slate-200 rounded-xl p-4">
                  <div class="flex items-center justify-between gap-2 mb-2">
                    <div class="font-bold text-sm text-slate-800">${esc(m.subject)}</div>
                    <span class="text-[11px] font-bold px-2 py-0.5 rounded-full ${s[1]}">${s[0]}</span>
                  </div>
                  <div class="text-xs text-slate-600 whitespace-pre-line">${esc(m.message)}</div>
                  <div class="text-[10px] text-slate-400 mt-1">${new Date(m.createdAt).toLocaleString('ar-EG')}</div>
                  ${(m.replies || []).map(r => `
                    <div class="mt-3 bg-emerald-50 border border-emerald-100 rounded-lg p-3">
                      <div class="text-[11px] font-black text-emerald-800 mb-1"><i class="fa-solid fa-headset"></i> ${esc(r.byName)}</div>
                      <div class="text-xs text-slate-800 whitespace-pre-line">${esc(r.text)}</div>
                      <div class="text-[10px] text-slate-400 mt-1">${new Date(r.at).toLocaleString('ar-EG')}</div>
                    </div>
                  `).join('')}
                </div>`;
            }).join('')}
          </div>
        </div>`;
    } catch (err) {
      box.innerHTML = '';
    }
  },

  async submitMessage(e) {
    e.preventDefault();
    const btn = document.getElementById('contact-submit-btn');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> جاري الإرسال...';
    }

    const name = document.getElementById('contact-name').value.trim();
    const phone = document.getElementById('contact-phone').value.trim();
    const email = document.getElementById('contact-email').value.trim();
    const subject = document.getElementById('contact-subject').value;
    const message = document.getElementById('contact-message').value.trim();

    try {
      const res = await API.post('/support', { name, phone, email, subject, message });
      if (res.success) {
        App.showToast(res.message, 'success');
        document.getElementById('contact-message').value = '';
        if (State.user) this.loadMyMessages();
      }
    } catch (err) {
      App.showToast(err.message, 'error');
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> إرسال الرسالة';
      }
    }
  }
};
