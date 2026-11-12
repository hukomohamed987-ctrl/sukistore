/**
 * Store pages (About, Privacy, Terms) — text is edited from the dashboard
 * (إعدادات المتجر ← صفحات المتجر) and loaded from the server.
 */
const StaticPages = {
  esc(s) { return String(s === undefined || s === null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); },

  // "## heading", "- bullet", "**bold**", blank line = paragraph (everything escaped first: safe)
  format(text) {
    const blocks = String(text || '').replace(/\r/g, '').split(/\n{2,}/);
    const inline = s => this.esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    return blocks.map(b => {
      const lines = b.split('\n').filter(l => l.trim() !== '');
      if (!lines.length) return '';
      let html = '';
      let list = [];
      const flush = () => { if (list.length) { html += `<ul class="list-disc pr-6 space-y-1">${list.map(li => `<li>${inline(li)}</li>`).join('')}</ul>`; list = []; } };
      lines.forEach(l => {
        if (/^##\s+/.test(l)) { flush(); html += `<h3 class="text-lg font-bold text-slate-900 dark:text-white pt-3">${inline(l.replace(/^##\s+/, ''))}</h3>`; }
        else if (/^[-•]\s+/.test(l)) list.push(l.replace(/^[-•]\s+/, ''));
        else { flush(); html += `<p>${inline(l)}</p>`; }
      });
      flush();
      return html;
    }).join('');
  },

  async renderPage(slug) {
    const main = document.getElementById('main-content');
    main.innerHTML = `<div class="container py-16 text-center text-slate-400"><i class="fa-solid fa-spinner fa-spin text-2xl"></i></div>`;
    try {
      const { page } = await API.get(`/pages/${slug}`);
      const en = typeof I18n !== 'undefined' && I18n.lang === 'en';
      const title = en ? (page.title_en || page.title) : page.title;
      const body = en ? (page.body_en || page.body) : page.body;
      main.innerHTML = `
        <div class="container py-10 max-w-4xl">
          <div class="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 p-6 md:p-10 shadow-sm">
            <h1 class="text-2xl md:text-3xl font-extrabold text-slate-900 dark:text-white mb-6">${this.esc(title)}</h1>
            <div class="space-y-4 text-slate-700 dark:text-slate-300 leading-relaxed text-sm md:text-base">${this.format(body)}</div>
          </div>
        </div>`;
    } catch (err) {
      main.innerHTML = `<div class="container py-16 text-center text-red-500 font-bold">تعذر تحميل الصفحة</div>`;
    }
  },

  renderAbout() { return this.renderPage('about'); },
  renderPrivacy() { return this.renderPage('privacy'); },
  renderTerms() { return this.renderPage('terms'); }
};
