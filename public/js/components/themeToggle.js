/**
 * Suki Store Theme Manager (Dark / Light Mode)
 * Defaults to the stable, crystal-clear Light Mode for optimal eye comfort and contrast
 */

const Theme = {
  current: 'light',

  init() {
    // Reset cache if user previously got stuck in dark mode to restore crystal-clear light mode
    if (!localStorage.getItem('suki_theme_v2_reset')) {
      localStorage.setItem('suki_theme', 'light');
      localStorage.setItem('suki_theme_v2_reset', 'true');
    }

    const saved = localStorage.getItem('suki_theme');
    // Default strictly to 'light' mode for maximum contrast and eye comfort
    if (saved === 'dark') {
      this.current = 'dark';
    } else {
      this.current = 'light';
      localStorage.setItem('suki_theme', 'light');
    }

    this.apply();
  },

  isDark() {
    return this.current === 'dark';
  },

  toggle() {
    this.current = this.current === 'dark' ? 'light' : 'dark';
    localStorage.setItem('suki_theme', this.current);
    this.apply();

    if (typeof App !== 'undefined' && App.showToast) {
      App.showToast(this.current === 'dark' ? 'تم تفعيل الوضع الليلي 🌙' : 'تم تفعيل الوضع النهاري ☀️', 'info');
    }
  },

  apply() {
    const isDark = this.current === 'dark';
    if (isDark) {
      document.documentElement.classList.add('dark');
      document.body.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
      document.body.classList.remove('dark');
    }

    // Update icons in all theme toggle buttons
    const btns = document.querySelectorAll('.theme-toggle-btn');
    btns.forEach(btn => {
      btn.innerHTML = isDark 
        ? '<i class="fa-solid fa-sun text-amber-400"></i>' 
        : '<i class="fa-solid fa-moon text-slate-700"></i>';
      btn.title = isDark ? 'التبديل إلى الوضع النهاري' : 'التبديل إلى الوضع الليلي';
    });
  }
};

// Immediate initialization
Theme.init();
