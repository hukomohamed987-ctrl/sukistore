/**
 * Suki Store map picker (Leaflet + OpenStreetMap + Nominatim address lookup).
 * - Opens on the customer's real location automatically (GPS, high accuracy) and lets them
 *   drag the map / pin to the exact spot.
 * - Reads governorate, area and street from the map point.
 * - MapPicker.lookup(lat, lng) gives the address without opening the map (used by the top bar).
 * Shape returned to callers: { lat, lng, governorate, city, area, street, building, formattedAddress }
 */

const MapPicker = {
  map: null,
  marker: null,
  currentLat: 30.0444, // Cairo
  currentLng: 31.2357,
  currentAddress: null,
  currentGov: '',
  onConfirmCallback: null,
  searchTimeout: null,
  searchResults: [],
  lookupSeq: 0,

  FALLBACK_GOVS: ['القاهرة', 'الجيزة', 'الإسكندرية', 'الدقهلية', 'البحر الأحمر', 'البحيرة', 'الفيوم', 'الغربية', 'الإسماعيلية',
    'المنوفية', 'المنيا', 'القليوبية', 'الوادي الجديد', 'السويس', 'أسوان', 'أسيوط', 'بني سويف', 'بورسعيد', 'دمياط', 'الشرقية',
    'جنوب سيناء', 'كفر الشيخ', 'مطروح', 'الأقصر', 'قنا', 'شمال سيناء', 'سوهاج'],

  // Same names the shipping prices use
  govList() { return (typeof EGYPT_GOVERNORATES !== 'undefined' && EGYPT_GOVERNORATES.length) ? EGYPT_GOVERNORATES : this.FALLBACK_GOVS; },

  esc(s) { return String(s === undefined || s === null ? '' : s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch])); },

  // "محافظة الاسكندريه" and "الإسكندرية" are the same place
  norm(s) {
    return String(s || '').replace(/محافظة|محافظه|governorate/gi, '').replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي')
      .replace(/[ًٌٍَُِّْـ]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
  },

  EN_NAMES: {
    cairo: 'القاهرة', giza: 'الجيزة', alexandria: 'الإسكندرية', dakahlia: 'الدقهلية', 'red sea': 'البحر الأحمر', beheira: 'البحيرة',
    faiyum: 'الفيوم', fayoum: 'الفيوم', gharbia: 'الغربية', ismailia: 'الإسماعيلية', monufia: 'المنوفية', menofia: 'المنوفية', minya: 'المنيا',
    qalyubia: 'القليوبية', 'new valley': 'الوادي الجديد', suez: 'السويس', aswan: 'أسوان', asyut: 'أسيوط', assiut: 'أسيوط',
    'beni suef': 'بني سويف', 'port said': 'بورسعيد', damietta: 'دمياط', sharqia: 'الشرقية', 'south sinai': 'جنوب سيناء',
    'kafr el sheikh': 'كفر الشيخ', matrouh: 'مطروح', luxor: 'الأقصر', qena: 'قنا', 'north sinai': 'شمال سيناء', sohag: 'سوهاج'
  },

  // Returns the governorate name exactly as in the shipping list, or '' when unknown (never guesses Cairo)
  matchGovernorate(...texts) {
    const list = this.govList();
    for (const text of texts) {
      if (!text) continue;
      const n = this.norm(text);
      if (!n) continue;
      const exact = list.find(g => this.norm(g) === n);
      if (exact) return exact;
      const part = list.find(g => n.includes(this.norm(g)));
      if (part) return part;
      for (const [en, ar] of Object.entries(this.EN_NAMES)) {
        if (n.includes(en)) return list.find(g => this.norm(g) === this.norm(ar)) || ar;
      }
    }
    return '';
  },

  // Address for a point (no map needed)
  async lookup(lat, lng) {
    const lang = (typeof I18n !== 'undefined' && I18n.lang === 'en') ? 'en,ar' : 'ar';
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1&accept-language=${lang}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('lookup failed');
    const data = await res.json();
    const a = data.address || {};
    const governorate = this.matchGovernorate(a.state, a.province, a.region, a.state_district, a.city, a.county);
    const area = a.suburb || a.city_district || a.quarter || a.neighbourhood || a.town || a.village || a.municipality || a.city || '';
    const city = a.city || a.town || a.village || a.county || area || governorate;
    const street = a.road || a.pedestrian || a.street || a.residential || '';
    const building = a.house_number || '';
    const parts = [street && `${street}${building ? ' ' + building : ''}`, area !== governorate ? area : '', governorate].filter(Boolean);
    return {
      lat, lng, governorate,
      city: area || city,
      area, street, building,
      formattedAddress: parts.join('، ') || data.display_name || '',
      rawDisplayName: data.display_name || ''
    };
  },

  open({ initialLat, initialLng, currentGov, onConfirm, autoLocate } = {}) {
    this.onConfirmCallback = onConfirm;
    this.currentGov = currentGov || '';
    this.currentAddress = null;
    const hasStart = initialLat && initialLng && !isNaN(initialLat) && !isNaN(initialLng);
    this.currentLat = hasStart ? Number(initialLat) : 30.0444;
    this.currentLng = hasStart ? Number(initialLng) : 31.2357;

    const modalHtml = `
      <div class="map-picker-modal">
        <div class="flex flex-col sm:flex-row gap-2 mb-3">
          <div class="relative flex-1">
            <input type="text" id="map-picker-search-input" class="form-control text-sm" autocomplete="off"
              placeholder="ابحث عن منطقة أو شارع (مثال: المعادي، سموحة...)" oninput="MapPicker.handleSearchInput(event)" />
            <div id="map-picker-search-results" class="hidden absolute top-full right-0 left-0 mt-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg z-50 max-h-52 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-700 text-xs"></div>
          </div>
          <button type="button" id="map-picker-gps-btn" onclick="MapPicker.locateUserGps()"
            class="bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold px-4 py-2.5 rounded-xl flex items-center justify-center gap-2 text-xs flex-shrink-0">
            <i class="fa-solid fa-location-crosshairs"></i><span>حدد موقعي تلقائياً</span>
          </button>
        </div>

        <div class="relative rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-700">
          <div id="map-picker-canvas" style="height: min(48vh, 360px); width: 100%; z-index: 10;" class="bg-slate-100"></div>
          <div class="absolute bottom-2 right-2 left-2 sm:left-auto bg-white/90 dark:bg-slate-900/90 text-slate-700 dark:text-slate-200 text-[11px] font-bold py-1.5 px-3 rounded-lg shadow-sm z-20 pointer-events-none text-center">
            <i class="fa-solid fa-hand-pointer text-emerald-600"></i> اسحب الدبوس أو اضغط على مكانك بالظبط
          </div>
          <div id="map-picker-loading" class="hidden absolute top-2 right-2 bg-white dark:bg-slate-800 px-3 py-1.5 rounded-lg shadow text-[11px] font-bold text-slate-700 dark:text-slate-200 z-30">
            <i class="fa-solid fa-spinner fa-spin text-emerald-600"></i> <span>جاري تحديد العنوان...</span>
          </div>
        </div>

        <div class="mt-3 grid grid-cols-3 gap-2 text-center" id="map-picker-address">
          ${['المحافظة', 'المنطقة', 'الشارع'].map((l, i) => `
            <div class="p-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 min-w-0">
              <div class="text-[10px] text-slate-400 font-bold">${l}</div>
              <div id="map-picker-f${i}" class="text-xs font-extrabold text-slate-800 dark:text-slate-100 truncate">—</div>
            </div>`).join('')}
        </div>
        <div id="map-picker-warning" class="hidden mt-2 text-[11px] font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2"></div>

        <div class="mt-4 flex items-center justify-end gap-2.5">
          <button type="button" onclick="App.closeModal()" class="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-bold text-xs">إلغاء</button>
          <button type="button" id="map-picker-confirm-btn" onclick="MapPicker.confirmSelection()"
            class="bg-emerald-600 hover:bg-emerald-700 text-white font-black px-6 py-2.5 rounded-xl text-sm flex items-center gap-2 shadow-md">
            <i class="fa-solid fa-check"></i><span>تأكيد الموقع</span>
          </button>
        </div>
      </div>
    `;

    App.openModal('عنوان التوصيل على الخريطة', modalHtml);
    setTimeout(() => {
      this.initMap();
      if (autoLocate || !hasStart) this.locateUserGps(true);
    }, 150);
  },

  initMap() {
    const container = document.getElementById('map-picker-canvas');
    if (!container || typeof L === 'undefined') return;
    if (this.map) { try { this.map.remove(); } catch (e) { /* already gone */ } this.map = null; }

    this.map = L.map('map-picker-canvas', { center: [this.currentLat, this.currentLng], zoom: 15, zoomControl: true });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    }).addTo(this.map);

    const pinIcon = L.divIcon({
      className: 'custom-leaflet-marker',
      html: `<div style="width:36px;height:36px;display:flex;align-items:center;justify-content:center;filter:drop-shadow(0 4px 6px rgba(0,0,0,.35));">
        <div style="background:#059669;color:#fff;width:34px;height:34px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);display:flex;align-items:center;justify-content:center;border:2.5px solid #fff;">
        <i class="fa-solid fa-house" style="transform:rotate(45deg);font-size:13px;"></i></div></div>`,
      iconSize: [36, 36], iconAnchor: [18, 34]
    });
    this.marker = L.marker([this.currentLat, this.currentLng], { icon: pinIcon, draggable: true, autoPan: true }).addTo(this.map);
    this.marker.on('dragend', e => { const p = e.target.getLatLng(); this.updatePosition(p.lat, p.lng); });
    this.map.on('click', e => { this.marker.setLatLng(e.latlng); this.updatePosition(e.latlng.lat, e.latlng.lng); });
    setTimeout(() => { if (this.map) this.map.invalidateSize(); }, 200);
    this.updatePosition(this.currentLat, this.currentLng);
  },

  moveTo(lat, lng, zoom = 17) {
    if (!this.map || !this.marker) return;
    this.map.setView([lat, lng], zoom);
    this.marker.setLatLng([lat, lng]);
    this.updatePosition(lat, lng);
  },

  updatePosition(lat, lng) {
    this.currentLat = lat;
    this.currentLng = lng;
    clearTimeout(this._geoTimer);
    this._geoTimer = setTimeout(() => this.reverseGeocode(lat, lng), 350); // Nominatim: max 1 request / second
  },

  showAddress(addr) {
    const f = [addr.governorate || '—', addr.area || addr.city || '—', [addr.street, addr.building].filter(Boolean).join(' ') || '—'];
    f.forEach((v, i) => { const el = document.getElementById(`map-picker-f${i}`); if (el) { el.textContent = v; el.title = v; } });
    const warn = document.getElementById('map-picker-warning');
    if (warn) {
      if (!addr.governorate) {
        warn.textContent = 'مش قادرين نحدد المحافظة من النقطة دي. قرّب الخريطة على مكانك أو اختار المحافظة من القائمة.';
        warn.classList.remove('hidden');
      } else warn.classList.add('hidden');
    }
  },

  async reverseGeocode(lat, lng) {
    const seq = ++this.lookupSeq;
    const loadingEl = document.getElementById('map-picker-loading');
    if (loadingEl) loadingEl.classList.remove('hidden');
    try {
      const addr = await this.lookup(lat, lng);
      if (seq !== this.lookupSeq) return; // a newer point was chosen meanwhile
      this.currentAddress = addr;
      this.showAddress(addr);
    } catch (err) {
      if (seq !== this.lookupSeq) return;
      this.currentAddress = { lat, lng, governorate: this.currentGov || '', city: '', area: '', street: '', building: '', formattedAddress: '' };
      this.showAddress(this.currentAddress);
    } finally {
      if (loadingEl && seq === this.lookupSeq) loadingEl.classList.add('hidden');
    }
  },

  handleSearchInput(e) {
    const query = e.target.value.trim();
    const box = document.getElementById('map-picker-search-results');
    if (!box) return;
    clearTimeout(this.searchTimeout);
    if (query.length < 2) { box.classList.add('hidden'); box.innerHTML = ''; return; }
    this.searchTimeout = setTimeout(async () => {
      try {
        const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&q=${encodeURIComponent(query)}&countrycodes=eg&limit=6&accept-language=ar`;
        const res = await fetch(url);
        if (!res.ok) return;
        this.searchResults = await res.json();
        box.innerHTML = this.searchResults.length
          ? this.searchResults.map((item, i) => `
              <div class="p-2.5 hover:bg-emerald-50 dark:hover:bg-slate-700 cursor-pointer flex items-center gap-2" onclick="MapPicker.selectSearchResult(${i})">
                <i class="fa-solid fa-location-dot text-emerald-600 flex-shrink-0"></i>
                <span class="truncate font-medium text-slate-800 dark:text-slate-100">${this.esc(item.display_name)}</span>
              </div>`).join('')
          : `<div class="p-2.5 text-center text-slate-400">مفيش نتايج في مصر بالاسم ده</div>`;
        box.classList.remove('hidden');
      } catch (err) { /* offline: ignore */ }
    }, 400);
  },

  selectSearchResult(i) {
    const item = this.searchResults[i];
    if (!item) return;
    const box = document.getElementById('map-picker-search-results');
    if (box) box.classList.add('hidden');
    const input = document.getElementById('map-picker-search-input');
    if (input) input.value = item.display_name;
    this.moveTo(parseFloat(item.lat), parseFloat(item.lon), 17);
  },

  locateUserGps(silent = false) {
    if (!navigator.geolocation) {
      if (!silent) App.showToast('خاصية تحديد الموقع غير مدعومة في متصفحك', 'warning');
      return;
    }
    const btn = document.getElementById('map-picker-gps-btn');
    const label = '<i class="fa-solid fa-location-crosshairs"></i><span>حدد موقعي تلقائياً</span>';
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i><span>جاري التحديد...</span>'; }
    navigator.geolocation.getCurrentPosition(
      pos => {
        if (btn) { btn.disabled = false; btn.innerHTML = label; }
        const { latitude, longitude, accuracy } = pos.coords;
        this.moveTo(latitude, longitude, accuracy && accuracy > 500 ? 15 : 18);
        if (accuracy && accuracy > 500) App.showToast('الموقع تقريبي، اسحب الدبوس لمكانك بالظبط', 'info');
      },
      () => {
        if (btn) { btn.disabled = false; btn.innerHTML = label; }
        if (!silent) App.showToast('اسمح للموقع بالوصول لمكانك من إعدادات المتصفح، أو حرّك الخريطة لمكانك', 'info');
      },
      { timeout: 12000, enableHighAccuracy: true, maximumAge: 60000 }
    );
  },

  confirmSelection() {
    const addr = this.currentAddress || { lat: this.currentLat, lng: this.currentLng, governorate: this.currentGov || '', city: '', area: '', street: '', building: '', formattedAddress: '' };
    if (!addr.governorate) {
      App.showToast('حدد مكانك على الخريطة الأول (المحافظة لسه مش واضحة)', 'warning');
      return;
    }
    if (typeof this.onConfirmCallback === 'function') this.onConfirmCallback(addr);
    App.closeModal();
  }
};
