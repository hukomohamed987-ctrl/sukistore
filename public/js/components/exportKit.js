/**
 * ExportKit — one reliable way to Print / save PDF / export Excel from any page.
 *
 * Why: window.print() printed the whole app (or a blank page because of the print CSS),
 * and the "save as image" tool broke Arabic letters. ExportKit copies ONLY the report into a
 * clean hidden page (same fonts & styles, RTL, A4) and prints that. "PDF" = the same page with
 * the browser's "Save as PDF" (keeps Arabic text perfect and selectable).
 * Excel: every table inside the report → one sheet each (SheetJS, loaded only when needed).
 */
const ExportKit = {
  SHEETJS: 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',

  resolve(target) {
    if (!target) return null;
    if (typeof target === 'string') return document.querySelector(target) || document.getElementById(target);
    return target;
  },

  styles() {
    return [...document.querySelectorAll('link[rel="stylesheet"]')]
      .map(l => `<link rel="stylesheet" href="${l.href}">`).join('\n');
  },

  // Copy the element, remove buttons / inputs / anything marked no-print
  cleanClone(el) {
    const clone = el.cloneNode(true);
    clone.querySelectorAll('.no-print, button, select, input[type="checkbox"], [data-no-export]').forEach(n => n.remove());
    clone.querySelectorAll('input, textarea').forEach(i => { const s = document.createElement('span'); s.textContent = i.value; i.replaceWith(s); });
    clone.querySelectorAll('.overflow-x-auto, .admin-table-container, .overflow-auto').forEach(n => { n.style.overflow = 'visible'; n.style.maxHeight = 'none'; });
    return clone;
  },

  printHtml(html, title = 'سوقي ستور', { asPdf = false } = {}) {
    const old = document.getElementById('export-kit-frame');
    if (old) old.remove();
    const frame = document.createElement('iframe');
    frame.id = 'export-kit-frame';
    frame.setAttribute('aria-hidden', 'true');
    frame.style.cssText = 'position:fixed;left:-10000px;top:0;width:1100px;height:800px;border:0;visibility:hidden';
    document.body.appendChild(frame);
    const now = new Date().toLocaleString('ar-EG');
    const doc = frame.contentDocument;
    doc.open();
    doc.write(`<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>${String(title).replace(/</g, '')}</title>
      <link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900&display=swap" rel="stylesheet">
      ${this.styles()}
      <style>
        @page { size: A4; margin: 10mm; }
        html, body { background: #fff !important; color: #0f172a; font-family: 'Cairo', Tahoma, sans-serif; overflow: visible !important; height: auto !important; }
        body { padding: 0; margin: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        .ek-head { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #059669; padding-bottom: 8px; margin-bottom: 12px; }
        .ek-head h1 { font-size: 18px; margin: 0; color: #064e3b; font-weight: 900; }
        .ek-head small { color: #64748b; font-size: 11px; }
        table { width: 100% !important; border-collapse: collapse; page-break-inside: auto; }
        tr { page-break-inside: avoid; }
        th, td { border: 1px solid #e2e8f0; padding: 4px 6px !important; font-size: 11px !important; }
        thead { display: table-header-group; }
        .shadow, .shadow-sm, .shadow-md, .shadow-lg, .shadow-xl { box-shadow: none !important; }
        [class*="sticky"] { position: static !important; }
        .hidden { display: none !important; }
      </style></head><body>
      <div class="ek-head"><h1>${String(title).replace(/</g, '&lt;')}</h1><small>سوقي ستور • ${now}</small></div>
      ${html}
      </body></html>`);
    doc.close();
    const go = () => {
      try {
        frame.contentWindow.focus();
        frame.contentWindow.print();
      } catch (e) {
        if (typeof App !== 'undefined') App.showToast('المتصفح منع الطباعة، جرّب تاني', 'error');
      }
    };
    // wait for styles & fonts
    let printed = false;
    const once = () => { if (!printed) { printed = true; setTimeout(go, 250); } };
    frame.onload = once;
    setTimeout(once, 1500);
    if (asPdf && typeof App !== 'undefined') App.showToast('في نافذة الطباعة اختار "حفظ كـ PDF" (Save as PDF) من الطابعة', 'info');
  },

  print(target, title) {
    const el = this.resolve(target);
    if (!el) return App.showToast('مش لاقي محتوى للطباعة', 'warning');
    this.printHtml(this.cleanClone(el).outerHTML, title || document.title);
  },

  pdf(target, title) {
    const el = this.resolve(target);
    if (!el) return App.showToast('مش لاقي محتوى للتصدير', 'warning');
    this.printHtml(this.cleanClone(el).outerHTML, title || document.title, { asPdf: true });
  },

  loadSheetJS() {
    if (window.XLSX) return Promise.resolve(window.XLSX);
    if (this._sheetPromise) return this._sheetPromise;
    this._sheetPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = this.SHEETJS;
      s.onload = () => resolve(window.XLSX);
      s.onerror = () => { this._sheetPromise = null; reject(new Error('تعذر تحميل أداة Excel، تأكد من الإنترنت')); };
      document.head.appendChild(s);
    });
    return this._sheetPromise;
  },

  // Every <table> inside the target → one sheet. Numbers like "1,250 ج.م" become real numbers.
  async excel(target, filename = 'تقرير') {
    const el = this.resolve(target);
    if (!el) return App.showToast('مش لاقي جدول للتصدير', 'warning');
    const tables = [...el.querySelectorAll('table')].filter(t => t.querySelector('tr'));
    if (!tables.length) return App.showToast('الصفحة دي مفيهاش جدول يتصدّر', 'warning');
    try {
      const XLSX = await this.loadSheetJS();
      const wb = XLSX.utils.book_new();
      wb.Workbook = { Views: [{ RTL: true }] };
      const toNumber = (txt) => {
        const t = String(txt).replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/٬/g, ',').replace(/٫/g, '.').trim();
        const m = t.match(/^[−-]?\s*[\d,]+(\.\d+)?\s*(ج\.م|جنيه|%|قطعة|ساعة)?$/);
        if (!m) return null;
        const n = Number(t.replace(/[^\d.\-−]/g, '').replace('−', '-'));
        return Number.isFinite(n) ? n : null;
      };
      tables.forEach((table, i) => {
        const clone = this.cleanClone(table);
        const rows = [...clone.querySelectorAll('tr')].map(tr => [...tr.querySelectorAll('th,td')].map(c => {
          const text = c.innerText.replace(/\s+/g, ' ').trim();
          const n = toNumber(text);
          return n !== null ? n : text;
        }));
        const ws = XLSX.utils.aoa_to_sheet(rows);
        ws['!cols'] = (rows[0] || []).map((_, ci) => ({ wch: Math.min(45, Math.max(8, ...rows.slice(0, 100).map(r => String(r[ci] ?? '').length + 2))) }));
        const name = (table.closest('[data-sheet]')?.dataset.sheet || table.getAttribute('data-sheet') || `جدول ${i + 1}`).slice(0, 31);
        XLSX.utils.book_append_sheet(wb, ws, name);
      });
      const safe = String(filename).replace(/[\\/:*?"<>|]/g, '-');
      XLSX.writeFile(wb, `${safe}-${new Date().toISOString().slice(0, 10)}.xlsx`);
      App.showToast('تم تحميل ملف Excel', 'success');
    } catch (err) {
      App.showToast(err.message || 'فشل التصدير', 'error');
    }
  },

  // Ready-made button group: Print • PDF • Excel
  buttons(target, title, { excel = true, dark = false } = {}) {
    const t = String(target).replace(/'/g, "\\'");
    const ttl = String(title || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');
    const cls = dark
      ? 'bg-white/10 hover:bg-white/20 text-white border border-white/20'
      : 'bg-white hover:bg-slate-50 text-slate-700 border border-slate-300';
    return `
      <span class="inline-flex items-center gap-1.5 no-print">
        <button type="button" onclick="ExportKit.print('${t}', '${ttl}')" class="${cls} font-bold px-3 py-1.5 rounded-xl text-xs flex items-center gap-1.5"><i class="fa-solid fa-print"></i><span>طباعة</span></button>
        <button type="button" onclick="ExportKit.pdf('${t}', '${ttl}')" class="${cls} font-bold px-3 py-1.5 rounded-xl text-xs flex items-center gap-1.5"><i class="fa-solid fa-file-pdf text-rose-500"></i><span>PDF</span></button>
        ${excel ? `<button type="button" onclick="ExportKit.excel('${t}', '${ttl}')" class="${cls} font-bold px-3 py-1.5 rounded-xl text-xs flex items-center gap-1.5"><i class="fa-solid fa-file-excel text-green-600"></i><span>Excel</span></button>` : ''}
      </span>`;
  }
};
window.ExportKit = ExportKit;
