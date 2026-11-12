/**
 * Home page "واجهات العرض": picture cards that glide by on their own.
 * - Moves slowly and continuously, stops while the customer points at it / touches it.
 * - Swipe with a finger on phones, arrows on computers.
 * - No movement when there are only a few cards (they just sit centred) or when the
 *   visitor's device asks for reduced motion.
 */
const Showcases = {
  SPEED: { slow: 22, normal: 38, fast: 60 }, // pixels per SECOND (same on 60 Hz and 120 Hz screens)
  raf: null,

  esc(v) { return String(v === undefined || v === null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); },

  cardHtml(c, preview = false) {
    const inner = `
      <div class="sc-card-media">
        ${c.image ? `<img src="${this.esc(c.image)}" alt="${this.esc(c.title)}" loading="lazy" draggable="false" />` : '<div class="sc-card-placeholder"><i class="fa-regular fa-image"></i></div>'}
        <div class="sc-card-shade"></div>
      </div>
      <div class="sc-card-body">
        ${c.logo ? `<img class="sc-card-logo" src="${this.esc(c.logo)}" alt="" loading="lazy" draggable="false" />` : ''}
        <div class="sc-card-title">${this.esc(c.title)}</div>
        ${c.subtitle ? `<div class="sc-card-sub">${this.esc(c.subtitle)}</div>` : ''}
        <span class="sc-card-cta">تسوّق الآن <i class="fa-solid fa-arrow-left"></i></span>
      </div>`;
    return preview
      ? `<div class="sc-card">${inner}</div>`
      : `<a class="sc-card" href="#/showcase/${this.esc(c.id)}" draggable="false">${inner}</a>`;
  },

  sectionHtml(data) {
    const cards = (data && data.showcases) || [];
    const s = (data && data.section) || {};
    if (!cards.length || s.enabled === false) return '';
    return `
      <section class="sc-section my-10" data-speed="${this.esc(s.speed || 'normal')}">
        <div class="section-header">
          <div>
            <h2 class="section-title"><i class="fa-solid fa-store"></i> ${this.esc(s.title || 'تسوّق حسب المتجر')}</h2>
            ${s.subtitle ? `<p class="text-xs text-slate-500 dark:text-slate-400 mt-1">${this.esc(s.subtitle)}</p>` : ''}
          </div>
          <div class="sc-arrows">
            <button type="button" class="sc-arrow" data-dir="prev" aria-label="السابق"><i class="fa-solid fa-chevron-right"></i></button>
            <button type="button" class="sc-arrow" data-dir="next" aria-label="التالي"><i class="fa-solid fa-chevron-left"></i></button>
          </div>
        </div>
        <div class="sc-viewport" dir="ltr">
          <div class="sc-track">${cards.map(c => this.cardHtml(c)).join('')}</div>
        </div>
      </section>`;
  },

  // Start the movement (call after the section is on the page)
  init() {
    cancelAnimationFrame(this.raf);
    const section = document.querySelector('.sc-section');
    if (!section) return;
    const viewport = section.querySelector('.sc-viewport');
    const track = section.querySelector('.sc-track');
    const original = [...track.children];
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Few cards → no movement, just centred
    if (track.scrollWidth <= viewport.clientWidth + 8) {
      section.classList.add('sc-static');
      return;
    }
    // Endless loop: a second copy of the cards right after the first
    original.forEach(n => { const c = n.cloneNode(true); c.setAttribute('aria-hidden', 'true'); c.tabIndex = -1; track.appendChild(c); });
    const loopWidth = () => track.scrollWidth / 2;

    const speed = this.SPEED[section.dataset.speed] || this.SPEED.normal;
    let paused = reduce;
    let resumeTimer = null;
    let pos = viewport.scrollLeft;
    const pause = () => { paused = true; clearTimeout(resumeTimer); };
    const resumeLater = (ms = 2500) => { clearTimeout(resumeTimer); if (!reduce) resumeTimer = setTimeout(() => { pos = viewport.scrollLeft; paused = false; }, ms); };

    viewport.addEventListener('mouseenter', pause);
    viewport.addEventListener('mouseleave', () => resumeLater(400));
    viewport.addEventListener('touchstart', pause, { passive: true });
    viewport.addEventListener('touchend', () => resumeLater(), { passive: true });
    viewport.addEventListener('focusin', pause);
    viewport.addEventListener('focusout', () => resumeLater());
    viewport.addEventListener('scroll', () => {
      // keep the loop endless when the customer swipes / scrolls by hand
      const w = loopWidth();
      if (viewport.scrollLeft >= w) viewport.scrollLeft -= w;
      else if (viewport.scrollLeft <= 0 && paused) viewport.scrollLeft += w;
    }, { passive: true });

    section.querySelectorAll('.sc-arrow').forEach(btn => btn.addEventListener('click', () => {
      pause();
      const card = track.querySelector('.sc-card');
      const step = card ? card.getBoundingClientRect().width + 16 : 260;
      // "next" moves the strip the same way the automatic movement does
      const goForward = btn.dataset.dir === 'next';
      if (!goForward && viewport.scrollLeft < step) viewport.scrollLeft += loopWidth();
      viewport.scrollBy({ left: goForward ? step : -step, behavior: 'smooth' });
      resumeLater(4000);
    }));

    // Don't open a card when the customer was dragging
    let downX = 0;
    viewport.addEventListener('pointerdown', e => { downX = e.clientX; });
    viewport.addEventListener('click', e => { if (Math.abs(e.clientX - downX) > 8) { e.preventDefault(); e.stopPropagation(); } }, true);

    let last = performance.now();
    const tick = now => {
      if (!document.body.contains(viewport)) return; // left the page
      const dt = Math.min(100, Math.max(0, now - last)) / 1000; // seconds since last frame (no jump after a tab switch)
      last = now;
      if (!paused && !document.hidden) {
        pos += speed * dt;
        const w = loopWidth();
        if (pos >= w) pos -= w;
        viewport.scrollLeft = pos;
      }
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }
};
