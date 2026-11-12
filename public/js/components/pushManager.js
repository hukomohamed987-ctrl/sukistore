/**
 * Suki Store Web Push Notification Manager (Client-side)
 * Manages browser push notification permissions, subscriptions, and real push alerts
 */

const PushManager = {
  isSupported: 'Notification' in window,
  permission: 'Notification' in window ? Notification.permission : 'denied',
  pollInterval: null,

  async init() {
    if (!this.isSupported) return;

    this.permission = Notification.permission;

    if (this.permission === 'granted') {
      this.subscribeClient();
    } else if (this.permission === 'default') {
      // Ask politely and late: only after the visitor has browsed for a while,
      // never on the admin pages, and at most once a week if they said "later".
      // (The browser's own permission popup opens only when they press "تفعيل".)
      setTimeout(() => {
        if (this.canShowBanner()) this.showPermissionBanner();
      }, 45000);
    }

    // Start push receiver for live broadcasts & recurring push notifications
    this.startPolling();
  },

  showPermissionBanner() {
    if (document.getElementById('push-permission-banner')) return;

    const banner = document.createElement('div');
    banner.id = 'push-permission-banner';
    banner.className = 'fixed bottom-20 md:bottom-6 left-4 right-4 md:left-6 md:right-auto md:max-w-md bg-white dark:bg-slate-800 border-2 border-emerald-500 rounded-2xl shadow-2xl p-4 z-50 flex items-start gap-3 transition-all animate-bounce-once';
    banner.innerHTML = `
      <div class="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 flex items-center justify-center text-lg flex-shrink-0">
        <i class="fa-solid fa-bell"></i>
      </div>
      <div class="flex-1">
        <h4 class="font-extrabold text-sm text-slate-900 dark:text-white mb-1">تفعيل إشعارات سوقي ستور 🔔</h4>
        <p class="text-xs text-slate-500 dark:text-slate-400 mb-3 leading-relaxed">
          هل تود استلام إشعارات فورية على جهازك بأحدث العروض، الخصومات الحصرية، وانخفاض أسعار المنتجات؟
        </p>
        <div class="flex items-center gap-2">
          <button onclick="PushManager.requestPermission()" class="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-4 py-2 rounded-xl transition shadow-sm">
            تفعيل الإشعارات
          </button>
          <button onclick="PushManager.dismissBanner()" class="bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 text-slate-600 dark:text-slate-300 font-bold text-xs px-3 py-2 rounded-xl transition">
            لاحقاً
          </button>
        </div>
      </div>
      <button onclick="PushManager.dismissBanner()" class="text-slate-400 hover:text-slate-600 text-sm">
        <i class="fa-solid fa-xmark"></i>
      </button>
    `;

    document.body.appendChild(banner);
  },

  canShowBanner() {
    if (Notification.permission !== 'default') return false;
    if (window.location.hash.includes('admin')) return false;
    try {
      const last = Number(localStorage.getItem('suki_push_banner_dismissed_at')) || 0;
      return !last || Date.now() - last > 7 * 24 * 3600 * 1000;
    } catch (e) {
      return false;
    }
  },

  dismissBanner() {
    const banner = document.getElementById('push-permission-banner');
    if (banner) banner.remove();
    try { localStorage.setItem('suki_push_banner_dismissed_at', String(Date.now())); } catch (e) {}
  },

  async requestPermission() {
    if (!this.isSupported) return;

    try {
      const permission = await Notification.requestPermission();
      this.permission = permission;
      this.dismissBanner();

      if (permission === 'granted') {
        App.showToast('تم تفعيل إشعارات سوقي ستور بنجاح! 🎉', 'success');
        await this.subscribeClient();

        // Send a local confirmation notification
        this.displayLocalNotification('مرحباً بك في إشعارات سوقي ستور!', {
          body: 'ستصلك الآن تنبيهات حصرية بأقوى الخصومات والعروض قبل الجميع.',
          icon: '/icons/icon-192.png'
        });
      } else {
        App.showToast('تم رفض إذن الإشعارات', 'warning');
      }
    } catch (err) {
      console.error('Request permission error:', err);
    }
  },

  async subscribeClient() {
    try {
      const clientToken = localStorage.getItem('suki_push_token') || 'sub_' + Math.random().toString(36).substring(2, 12);
      localStorage.setItem('suki_push_token', clientToken);

      await API.post('/push/subscribe', {
        token: clientToken,
        endpoint: window.location.origin,
        userAgent: navigator.userAgent
      });
    } catch (err) {
      console.error('Push subscribe error:', err);
    }
  },

  async displayLocalNotification(title, options = {}) {
    if (this.permission !== 'granted') return;

    try {
      // If service worker is active, use it for genuine PWA background push notification
      if ('serviceWorker' in navigator) {
        const reg = await navigator.serviceWorker.ready.catch(() => null);
        if (reg && reg.showNotification) {
          reg.showNotification(title, {
            body: options.body || '',
            icon: options.icon || '/icons/icon-192.png',
            badge: '/favicon.png',
            dir: 'rtl',
            lang: 'ar',
            vibrate: [200, 100, 200],
            data: options.data || { url: '/' }
          });
          return;
        }
      }

      // Native browser desktop/mobile notification fallback
      const notif = new Notification(title, {
        icon: options.icon || '/icons/icon-192.png',
        badge: '/favicon.png',
        dir: 'rtl',
        lang: 'ar',
        body: options.body || '',
        data: options.data || {}
      });

      notif.onclick = () => {
        window.focus();
        if (options.data && options.data.url) {
          window.location.hash = options.data.url;
        }
        notif.close();
      };
    } catch (err) {
      console.warn('Native notification error:', err);
    }
  },

  startPolling() {
    if (this.pollInterval) clearInterval(this.pollInterval);

    const checkLatest = async () => {
      try {
        const res = await API.get('/push/latest');
        if (!res || !res.latest) return;
        const notif = res.latest;

        // Verify target audience matches current client
        const isUserLoggedIn = !!(typeof State !== 'undefined' && State.user);
        if (notif.targetAudience === 'registered' && !isUserLoggedIn) return;
        if (notif.targetAudience === 'guests' && isUserLoggedIn) return;

        const sentTime = new Date(notif.lastResentAt || notif.sentAt || notif.createdAt || 0).getTime();
        const dedupeKey = `push_${notif.id}_${sentTime}_${notif.resendCount || 0}`;
        const lastSeenKey = localStorage.getItem('suki_last_received_push_key');

        if (lastSeenKey === dedupeKey) return;

        // Only alert if recent (< 2 hours) or if subsequent broadcasts
        const isRecent = (Date.now() - sentTime) < 2 * 60 * 60 * 1000;
        localStorage.setItem('suki_last_received_push_key', dedupeKey);

        if (isRecent || lastSeenKey) {
          // Trigger REAL browser Push Notification
          this.displayLocalNotification(notif.title, {
            body: notif.message || notif.body,
            icon: notif.icon || '/icons/icon-192.png',
            data: { url: notif.targetUrl || notif.url || '#/products' }
          });

          // Show friendly in-app notification toast
          if (typeof App !== 'undefined' && App.showToast) {
            App.showToast(`🔔 ${notif.title}: ${notif.message || notif.body}`, 'info');
          }
        }
      } catch (err) {
        // Silent catch for background polling
      }
    };

    setTimeout(checkLatest, 1500);
    this.pollInterval = setInterval(checkLatest, 12000);
  }
};
