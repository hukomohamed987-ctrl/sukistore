/**
 * Suki Store Footer Component
 * Contact details + social links come from the dashboard (إعدادات المتجر ← بيانات التواصل).
 * Anything left empty there is simply not shown.
 */

const Footer = {
  esc(s) { return String(s || '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch])); },

  // 01012345678 → 201012345678 (wa.me needs the country code)
  waNumber(n) {
    const d = String(n || '').replace(/\D/g, '');
    if (!d) return '';
    if (d.startsWith('20')) return d;
    if (d.startsWith('0')) return '2' + d;
    return d;
  },

  render() {
    const categories = State.categories || [];
    const c = (typeof App !== 'undefined' && App.contact) || {};
    const wa = this.waNumber(c.whatsapp);
    const social = [
      c.facebook && `<a href="${this.esc(c.facebook)}" target="_blank" rel="noopener noreferrer" class="hover:text-emerald-400" title="فيسبوك"><i class="fa-brands fa-facebook"></i></a>`,
      c.instagram && `<a href="${this.esc(c.instagram)}" target="_blank" rel="noopener noreferrer" class="hover:text-emerald-400" title="إنستغرام"><i class="fa-brands fa-instagram"></i></a>`,
      c.tiktok && `<a href="${this.esc(c.tiktok)}" target="_blank" rel="noopener noreferrer" class="hover:text-emerald-400" title="تيك توك"><i class="fa-brands fa-tiktok"></i></a>`,
      wa && `<a href="https://wa.me/${wa}" target="_blank" rel="noopener noreferrer" class="hover:text-emerald-400" title="واتساب"><i class="fa-brands fa-whatsapp"></i></a>`
    ].filter(Boolean).join('');
    const contactRows = [
      c.phone && `<a href="tel:${this.esc(c.phone)}" class="hover:text-emerald-400"><i class="fa-solid fa-phone text-emerald-400 ml-2"></i> <span dir="ltr">${this.esc(c.phone)}</span></a>`,
      wa && `<a href="https://wa.me/${wa}" target="_blank" rel="noopener noreferrer" class="hover:text-emerald-400"><i class="fa-brands fa-whatsapp text-emerald-400 ml-2"></i> <span dir="ltr">${this.esc(c.whatsapp)}</span></a>`,
      c.email && `<a href="mailto:${this.esc(c.email)}" class="hover:text-emerald-400"><i class="fa-solid fa-envelope text-emerald-400 ml-2"></i> <span dir="ltr">${this.esc(c.email)}</span></a>`,
      c.address && `<div><i class="fa-solid fa-location-dot text-emerald-400 ml-2"></i> ${this.esc(c.address)}</div>`
    ].filter(Boolean).join('');

    return `
      <footer class="site-footer">
        <div class="container">
          <div class="footer-grid">
            <div>
              <div class="brand-logo mb-4" style="color: #10b981;">
                <img src="/icons/icon-192.png" alt="سوقي ستور" class="brand-logo-img" />
                <div>
                  <span class="brand-name text-white">سوقي ستور</span>
                  <span class="brand-tagline text-slate-400">سوقك العربي المتكامل</span>
                </div>
              </div>
              <p class="text-sm text-slate-400 leading-relaxed mb-4">منتجات مختارة بعناية، أسعار واضحة، وتوصيل لكل المحافظات مع الدفع عند الاستلام.</p>
              ${social ? `<div class="flex gap-3 text-lg text-slate-300">${social}</div>` : ''}
            </div>

            <div>
              <h4 class="footer-col-title">أقسام المتجر</h4>
              <ul class="footer-links">
                ${categories.slice(0, 5).map(cat => `<li><a href="#/category/${cat.id}">${this.esc(cat.name)}</a></li>`).join('')}
              </ul>
            </div>

            <div>
              <h4 class="footer-col-title">روابط مهمة</h4>
              <ul class="footer-links">
                <li><a href="#/about">من نحن</a></li>
                <li><a href="#/privacy">سياسة الخصوصية</a></li>
                <li><a href="#/terms">الشروط والأحكام</a></li>
                <li><a href="#/support">مركز المساعدة والدعم</a></li>
                <li><a href="#/orders">تتبع طلبي</a></li>
              </ul>
            </div>

            <div>
              <h4 class="footer-col-title">تواصل معنا</h4>
              ${contactRows ? `<div class="text-sm text-slate-400 flex flex-col gap-2 mb-4">${contactRows}</div>` : `<div class="text-sm text-slate-400 mb-4"><a href="#/support" class="hover:text-emerald-400"><i class="fa-solid fa-headset text-emerald-400 ml-2"></i> مركز المساعدة والدعم</a></div>`}
              <h5 class="text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">طرق الدفع المدعومة</h5>
              <div class="flex gap-2 text-2xl text-slate-300">
                <i class="fa-solid fa-money-bill-wave text-emerald-400" title="الدفع عند الاستلام"></i>
                <i class="fa-brands fa-cc-visa text-blue-400" title="فيزا"></i>
                <i class="fa-brands fa-cc-mastercard text-amber-500" title="ماستركارد"></i>
              </div>
            </div>
          </div>

          <div class="footer-bottom">
            <p>© ${new Date().getFullYear()} سوقي ستور. جميع الحقوق محفوظة.</p>
          </div>
        </div>
      </footer>
    `;
  }
};
