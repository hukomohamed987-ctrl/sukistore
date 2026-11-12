/**
 * Suki Store (سوقي ستور) - PWA & Install Manager
 * Manages Service Worker registration, Install Prompts, and Launch Splash Screen
 */

const PWA = {
  deferredPrompt: null,
  isInstalled: false,
  isStandalone: false,

  init() {
    this.isStandalone = window.matchMedia('(display-mode: standalone)').matches || 
                        window.navigator.standalone === true ||
                        document.referrer.includes('android-app://');

    if (this.isStandalone) {
      document.body.classList.add('is-pwa-standalone');
      console.log('📱 Suki Store running in Standalone PWA mode');
    }

    // 1. Register Service Worker
    this.registerServiceWorker();

    // 2. Setup Install Prompt Listener
    this.setupInstallPrompt();

    // 3. Show Install Buttons across UI immediately if not in standalone mode
    this.showInstallButtons();

    // 4. Setup Splash Screen (2.5 seconds duration)
    this.initSplashScreen();
  },

  registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('/service-worker.js')
          .then((reg) => {
            console.log('✅ Suki Store Service Worker registered successfully, scope:', reg.scope);
            reg.update().catch(() => {});
          })
          .catch((err) => {
            console.warn('⚠️ Service Worker registration failed:', err);
          });
      });
    }
  },

  setupInstallPrompt() {
    window.addEventListener('beforeinstallprompt', (e) => {
      // Prevent browser default mini-infobar on mobile
      e.preventDefault();
      // Store the event so it can be triggered later
      this.deferredPrompt = e;
      console.log('💡 PWA install prompt is ready');

      // Reveal install buttons in the UI
      this.showInstallButtons();
    });

    window.addEventListener('appinstalled', () => {
      this.isInstalled = true;
      this.deferredPrompt = null;
      this.hideInstallButtons();
      console.log('🎉 Suki Store PWA was installed successfully');
      if (typeof App !== 'undefined' && App.showToast) {
        App.showToast('شكراً لتثبيت تطبيق سوقي ستور! نتمنى لك تجربة تسوق رائعة 🎉', 'success');
      }
    });
  },

  showInstallButtons() {
    // Only show if not already running in standalone mode
    if (this.isStandalone) return;

    // One install button only (desktop navbar), and only when the browser can really install
    const navBtn = document.getElementById('pwa-install-nav-btn');
    if (navBtn && this.deferredPrompt) navBtn.classList.remove('hidden');

    // Less noise: the topbar button stays hidden (the navbar pill already offers install)
    const topbarBtn = document.getElementById('pwa-install-topbar-btn');
    if (topbarBtn) topbarBtn.classList.add('hidden');

    const mobileBtn = document.getElementById('pwa-install-mobile-btn');
    if (mobileBtn) mobileBtn.classList.remove('hidden');

    const bottomNavBtn = document.getElementById('pwa-install-bottom-btn');
    if (bottomNavBtn) bottomNavBtn.classList.remove('hidden');

    const isCurrentAdmin = window.location.hash.includes('admin') ||
                           window.location.pathname.includes('admin') ||
                           (typeof App !== 'undefined' && App.getCurrentRoute && App.getCurrentRoute().path.startsWith('admin'));

    // The big top banner only from the visitor's 3rd visit, and it stays away 14 days after "close"
    const mobileBanner = document.getElementById('pwa-mobile-install-banner');
    if (mobileBanner && !isCurrentAdmin && this.shouldShowBigBanner()) {
      mobileBanner.classList.remove('hidden');
      mobileBanner.style.display = '';
    }
  },

  shouldShowBigBanner() {
    try {
      const dismissedAt = Number(localStorage.getItem('suki_pwa_banner_dismissed_at')) || 0;
      if (dismissedAt && Date.now() - dismissedAt < 14 * 24 * 3600 * 1000) return false;
      if (!sessionStorage.getItem('suki_visit_counted')) {
        sessionStorage.setItem('suki_visit_counted', '1');
        localStorage.setItem('suki_visits', String((Number(localStorage.getItem('suki_visits')) || 0) + 1));
      }
      return (Number(localStorage.getItem('suki_visits')) || 0) >= 3;
    } catch (e) {
      return false;
    }
  },

  hideInstallButtons() {
    const navBtn = document.getElementById('pwa-install-nav-btn');
    if (navBtn) navBtn.classList.add('hidden');

    const topbarBtn = document.getElementById('pwa-install-topbar-btn');
    if (topbarBtn) topbarBtn.classList.add('hidden');

    const mobileBtn = document.getElementById('pwa-install-mobile-btn');
    if (mobileBtn) mobileBtn.classList.add('hidden');

    const bottomNavBtn = document.getElementById('pwa-install-bottom-btn');
    if (bottomNavBtn) bottomNavBtn.classList.add('hidden');

    const mobileBanner = document.getElementById('pwa-mobile-install-banner');
    if (mobileBanner) {
      mobileBanner.classList.add('hidden');
      mobileBanner.style.display = 'none';
    }
  },

  dismissMobileBanner() {
    const mobileBanner = document.getElementById('pwa-mobile-install-banner');
    if (mobileBanner) {
      mobileBanner.style.transition = 'all 0.25s ease';
      mobileBanner.style.maxHeight = mobileBanner.scrollHeight + 'px';
      requestAnimationFrame(() => {
        mobileBanner.style.maxHeight = '0px';
        mobileBanner.style.opacity = '0';
        mobileBanner.style.paddingTop = '0px';
        mobileBanner.style.paddingBottom = '0px';
        mobileBanner.style.overflow = 'hidden';
      });
      setTimeout(() => {
        mobileBanner.classList.add('hidden');
        mobileBanner.style.display = 'none';
      }, 260);
    }
    try { localStorage.setItem('suki_pwa_banner_dismissed_at', String(Date.now())); } catch (e) {}
  },

  async install() {
    if (this.deferredPrompt) {
      // Show native browser install prompt
      this.deferredPrompt.prompt();
      const choiceResult = await this.deferredPrompt.userChoice;
      console.log('User choice:', choiceResult.outcome);

      if (choiceResult.outcome === 'accepted') {
        if (typeof App !== 'undefined' && App.showToast) {
          App.showToast('جاري تثبيت تطبيق سوقي ستور على جهازك...', 'info');
        }
      }

      this.deferredPrompt = null;
      this.hideInstallButtons();
    } else {
      // Fallback for iOS Safari or when prompt is not ready
      this.showIosOrManualModal();
    }
  },

  showIosOrManualModal() {
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;

    if (typeof App !== 'undefined' && App.openModal) {
      if (isIOS) {
        App.openModal('تثبيت التطبيق على آيفون / آيباد', `
          <div class="text-center p-4">
            <img src="/icons/icon-192.png" class="w-16 h-16 mx-auto mb-3 rounded-2xl shadow-md" alt="سوقي ستور" />
            <h3 class="text-base font-bold text-slate-800 dark:text-white mb-2">تثبيت تطبيق سوقي ستور على شاشتك</h3>
            <p class="text-xs text-slate-500 dark:text-slate-400 mb-6 leading-relaxed">
              يمكنك إضافة التطبيق مباشرة لشاشتك الرئيسية في خطوات سهلة:
            </p>
            <div class="bg-slate-50 dark:bg-slate-700/50 p-4 rounded-xl text-right text-xs space-y-3 font-semibold text-slate-700 dark:text-slate-200 mb-6">
              <div class="flex items-center gap-3">
                <span class="w-6 h-6 rounded-full bg-emerald-600 text-white flex items-center justify-center text-xs">1</span>
                <span>اضغط على زر المشاركة <i class="fa-solid fa-arrow-up-from-bracket text-emerald-600 mx-1"></i> في شريط سفاري.</span>
              </div>
              <div class="flex items-center gap-3">
                <span class="w-6 h-6 rounded-full bg-emerald-600 text-white flex items-center justify-center text-xs">2</span>
                <span>اختر <strong>"إضافة إلى الشاشة الرئيسية" (Add to Home Screen)</strong>.</span>
              </div>
              <div class="flex items-center gap-3">
                <span class="w-6 h-6 rounded-full bg-emerald-600 text-white flex items-center justify-center text-xs">3</span>
                <span>اضغط على <strong>"إضافة" (Add)</strong> في أعلى الشاشة.</span>
              </div>
            </div>
            <button onclick="App.closeModal()" class="w-full py-2.5 bg-emerald-600 text-white rounded-xl text-xs font-bold">
              حسناً، فهمت
            </button>
          </div>
        `);
      } else {
        App.openModal('تثبيت تطبيق سوقي ستور', `
          <div class="text-center p-4">
            <img src="/icons/icon-192.png" class="w-16 h-16 mx-auto mb-3 rounded-2xl shadow-md" alt="سوقي ستور" />
            <h3 class="text-base font-bold text-slate-800 dark:text-white mb-2">تطبيق سوقي ستور متوفر</h3>
            <p class="text-xs text-slate-500 dark:text-slate-400 mb-4 leading-relaxed">
              يمكنك تثبيت التطبيق مباشرة من قائمة متصفحك (الضغط على زر القائمة <i class="fa-solid fa-ellipsis-vertical mx-1"></i> ثم اختيار "تثبيت التطبيق" أو "Install App").
            </p>
            <button onclick="App.closeModal()" class="w-full py-2.5 bg-emerald-600 text-white rounded-xl text-xs font-bold">
              إغلاق
            </button>
          </div>
        `);
      }
    }
  },

  initSplashScreen() {
    const splash = document.getElementById('app-splash-screen');
    if (!splash) return;

    // Wait exactly 2.5 seconds (2500ms) as requested
    setTimeout(() => {
      this.dismissSplashScreen();
    }, 2500);
  },

  dismissSplashScreen() {
    const splash = document.getElementById('app-splash-screen');
    if (!splash) return;

    splash.classList.add('splash-fade-out');

    // Remove from DOM once fade transition is complete (500ms)
    setTimeout(() => {
      if (splash && splash.parentNode) {
        splash.parentNode.removeChild(splash);
      }
    }, 550);
  }
};

// Initialize PWA Manager as early as possible
PWA.init();
