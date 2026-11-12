/**
 * ImagePicker — one image field used everywhere in the dashboard.
 * Main way: upload from the device (click or drag & drop) → saved on our server, shown right away.
 * Optional: "use a link instead". The final image address is kept in a hidden <input id="...">,
 * so existing save code that reads document.getElementById(id).value keeps working.
 * (Before: uploads were written into a "web link" field that the browser rejected, which forced a URL.)
 */
const ImagePicker = {
  esc(s) { return String(s === undefined || s === null ? '' : s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;'); },

  /**
   * @param {object} o { id, value, label, hint, wide (banner shape), onChange (global function name as string) }
   */
  html({ id, value = '', label = 'الصورة', hint = '', wide = false, onChange = '' }) {
    const has = Boolean(value);
    return `
      <div class="image-picker" data-ip="${id}" data-onchange="${this.esc(onChange)}">
        <div class="text-xs font-bold text-slate-800 mb-1.5 flex items-center gap-1.5"><i class="fa-solid fa-image text-emerald-600"></i> ${label}${hint ? ` <span class="text-[10.5px] text-slate-400 font-semibold">${hint}</span>` : ''}</div>
        <input type="hidden" id="${id}" value="${this.esc(value)}" />
        <div id="${id}-zone" class="relative flex items-center gap-3 p-3 rounded-xl border-2 border-dashed ${has ? 'border-emerald-300 bg-emerald-50/40' : 'border-slate-300 bg-white'} cursor-pointer hover:border-emerald-400 transition"
             onclick="document.getElementById('${id}-file').click()"
             ondragover="event.preventDefault(); this.classList.add('border-emerald-500')"
             ondragleave="this.classList.remove('border-emerald-500')"
             ondrop="event.preventDefault(); this.classList.remove('border-emerald-500'); ImagePicker.uploadFiles('${id}', event.dataTransfer.files)">
          <img id="${id}-preview" src="${this.esc(value)}" class="${has ? '' : 'hidden'} ${wide ? 'w-32 h-16' : 'w-16 h-16'} rounded-lg object-cover border border-slate-200 bg-slate-50 flex-shrink-0" alt="" />
          <div id="${id}-empty" class="${has ? 'hidden' : ''} ${wide ? 'w-32 h-16' : 'w-16 h-16'} rounded-lg bg-slate-100 text-slate-400 flex items-center justify-center text-xl flex-shrink-0"><i class="fa-solid fa-cloud-arrow-up"></i></div>
          <div class="flex-1 min-w-0">
            <div class="text-xs font-black text-emerald-800" id="${id}-status">${has ? 'الصورة جاهزة — اضغط لتغييرها' : 'اضغط لرفع صورة من جهازك أو اسحبها هنا'}</div>
            <div class="text-[10.5px] text-slate-400">JPG أو PNG أو WEBP — حتى 5 ميجا</div>
          </div>
          <button type="button" onclick="event.stopPropagation(); ImagePicker.clear('${id}')" class="${has ? '' : 'hidden'} text-rose-500 hover:text-rose-700 text-xs font-bold px-2" id="${id}-clear" title="إزالة الصورة"><i class="fa-solid fa-trash"></i></button>
          <input type="file" id="${id}-file" accept="image/*" class="hidden" onchange="ImagePicker.uploadFiles('${id}', this.files)" />
        </div>
        <div class="mt-1.5">
          <button type="button" onclick="document.getElementById('${id}-linkbox').classList.toggle('hidden')" class="text-[11px] text-slate-500 hover:text-emerald-700 font-bold"><i class="fa-solid fa-link"></i> أو استخدم رابط صورة بدل الرفع</button>
          <div id="${id}-linkbox" class="hidden mt-1 flex gap-1.5">
            <input type="text" id="${id}-link" dir="ltr" class="form-control text-xs flex-1" placeholder="https://..." value="${has && /^https?:/i.test(value) ? this.esc(value) : ''}" />
            <button type="button" onclick="ImagePicker.useLink('${id}')" class="bg-slate-800 text-white text-xs font-bold px-3 rounded-lg">استخدام</button>
          </div>
        </div>
      </div>`;
  },

  set(id, url) {
    const input = document.getElementById(id);
    if (!input) return;
    input.value = url || '';
    const has = Boolean(url);
    const prev = document.getElementById(`${id}-preview`);
    if (prev) { prev.src = url || ''; prev.classList.toggle('hidden', !has); }
    const empty = document.getElementById(`${id}-empty`); if (empty) empty.classList.toggle('hidden', has);
    const clear = document.getElementById(`${id}-clear`); if (clear) clear.classList.toggle('hidden', !has);
    const status = document.getElementById(`${id}-status`); if (status) status.textContent = has ? 'الصورة جاهزة — اضغط لتغييرها' : 'اضغط لرفع صورة من جهازك أو اسحبها هنا';
    const zone = document.getElementById(`${id}-zone`);
    if (zone) { zone.classList.toggle('border-emerald-300', has); zone.classList.toggle('bg-emerald-50/40', has); }
    const box = input.closest('.image-picker');
    const cb = box && box.dataset.onchange;
    // e.g. onChange: 'BannersAdmin.onUrlInput' (global objects are declared with const, so call it by name)
    if (cb && /^[A-Za-z_]+\.[A-Za-z_]+$/.test(cb)) { try { new Function('url', `${cb}(url)`)(url || ''); } catch (e) { /* optional hook */ } }
  },

  async uploadFiles(id, files) {
    const file = files && files[0];
    if (!file) return;
    if (!/^image\//.test(file.type) && !/\.(jpe?g|png|webp|gif)$/i.test(file.name)) return App.showToast('اختار ملف صورة (JPG / PNG / WEBP)', 'warning');
    if (file.size > 5 * 1024 * 1024) return App.showToast('الصورة أكبر من 5 ميجا، صغّرها وجرّب تاني', 'warning');
    const status = document.getElementById(`${id}-status`);
    if (status) status.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> جاري رفع الصورة...';
    try {
      const res = await API.upload(file);
      if (!res.success || !res.url) throw new Error(res.message || 'فشل الرفع');
      this.set(id, res.url);
      App.showToast('تم رفع الصورة ✅', 'success');
    } catch (err) {
      this.set(id, document.getElementById(id)?.value || '');
      App.showToast(err.message || 'فشل رفع الصورة', 'error');
    }
  },

  useLink(id) {
    const v = (document.getElementById(`${id}-link`) || {}).value || '';
    const url = v.trim();
    if (url && !/^(https?:\/\/|\/uploads\/|\/images\/|\/icons\/)/i.test(url)) return App.showToast('الرابط لازم يبدأ بـ https://', 'warning');
    this.set(id, url);
    if (url) App.showToast('تم استخدام الرابط', 'success');
  },

  clear(id) { this.set(id, ''); }
};
window.ImagePicker = ImagePicker;
