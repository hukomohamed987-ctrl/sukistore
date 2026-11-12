/**
 * Suki Store Authentication Modal & Flows
 * Features:
 * - Email OTP Verification (Resend API)
 * - Official Google OAuth 2.0 Direct Login (No Demo)
 * - 2FA Security Support
 */

const AuthModal = {
  currentTab: 'login', // 'login' | 'register' | 'otp' | '2fa'
  redirectHash: null,
  lockoutTimer: null,
  remainingLockout: 0,
  pendingRegisterData: null,
  pending2FaTempToken: null,
  lastDemoOtp: null,
  otpCountdownTimer: null,
  otpCountdownSeconds: 0,
  isEmailOtpSent: false,

  open(tab = 'login', redirectHash = null) {
    this.currentTab = tab;
    this.redirectHash = redirectHash;
    this.updateModal();
    setTimeout(() => {
      this.initGoogleServices();
    }, 100);
  },

  initGoogleServices() {
    if (typeof google !== 'undefined' && google.accounts && google.accounts.id) {
      try {
        google.accounts.id.initialize({
          client_id: '279394875589-gn29a5ufvsbjteckvqa0mif6mkq9ko8p.apps.googleusercontent.com',
          callback: async (response) => {
            if (response && response.credential) {
              App.showToast('جاري تسجيل الدخول بحساب Google...', 'info');
              try {
                const res = await API.post('/auth/google', { credential: response.credential });
                if (res.success && res.token && res.user) {
                  await State.login(res.user, res.token);
                  App.closeModal();
                  App.showToast(`أهلاً بك يا ${res.user.name}! تم تسجيل الدخول بنجاح 🎉`, 'success');
                  if (this.redirectHash) {
                    window.location.hash = this.redirectHash;
                  }
                }
              } catch (e) {
                App.showToast(e.message || 'فشل تسجيل الدخول عبر Google', 'error');
              }
            }
          }
        });
      } catch (err) {}
    }
  },

  updateModal() {
    let title = 'تسجيل الدخول';
    if (this.currentTab === 'register') title = 'إنشاء حساب جديد';
    if (this.currentTab === 'otp') title = 'تأكيد البريد الإلكتروني (OTP)';
    if (this.currentTab === '2fa') title = 'المصادقة الثنائية (2FA)';
    if (this.currentTab === 'forgot') title = 'نسيت كلمة المرور';
    App.openModal(title, this.renderContent());
  },

  forgotEmail: '',
  forgotCodeSent: false,

  renderForgotView() {
    const esc = s => String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    if (!this.forgotCodeSent) {
      return `
        <div class="text-right" dir="rtl">
          <p class="text-xs text-slate-500 mb-4 leading-relaxed">اكتب الإيميل اللي سجلت بيه، وهنبعتلك كود من 6 أرقام تغيّر بيه كلمة المرور.</p>
          <form onsubmit="AuthModal.submitForgot(event)">
            <div class="form-group mb-4">
              <label class="form-label font-bold text-xs">البريد الإلكتروني *</label>
              <input type="email" id="forgot-email" class="form-control text-xs font-bold" value="${esc(this.forgotEmail)}" placeholder="user@example.com" required autocomplete="email" />
            </div>
            <button type="submit" id="forgot-submit-btn" class="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold py-3.5 rounded-xl text-xs mb-3 transition">ابعتلي الكود</button>
          </form>
          <button onclick="AuthModal.switchTab('login')" class="w-full text-xs text-slate-500 font-bold hover:underline">رجوع لتسجيل الدخول</button>
        </div>`;
    }
    return `
      <div class="text-right" dir="rtl">
        <p class="text-xs text-slate-500 mb-4 leading-relaxed">لو <strong>${esc(this.forgotEmail)}</strong> مسجّل عندنا، الكود وصله. اكتبه هنا واختار كلمة مرور جديدة.</p>
        <form onsubmit="AuthModal.submitReset(event)">
          <div class="form-group mb-3">
            <label class="form-label font-bold text-xs">كود التحقق (6 أرقام) *</label>
            <input type="text" id="reset-code" inputmode="numeric" maxlength="6" class="form-control text-center text-lg font-black tracking-[0.4em]" required autocomplete="one-time-code" />
          </div>
          <div class="form-group mb-4">
            <label class="form-label font-bold text-xs">كلمة المرور الجديدة *</label>
            <input type="password" id="reset-password" class="form-control text-xs" minlength="8" required autocomplete="new-password" />
            <p class="text-[10.5px] text-slate-400 mt-1">8 حروف على الأقل، فيها حرف كبير وحرف صغير ورقم ورمز.</p>
          </div>
          <button type="submit" id="reset-submit-btn" class="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold py-3.5 rounded-xl text-xs mb-3 transition">غيّر كلمة المرور</button>
        </form>
        <div class="flex justify-between text-xs">
          <button onclick="AuthModal.forgotCodeSent=false; AuthModal.updateModal()" class="text-emerald-600 font-bold hover:underline">ابعت كود تاني</button>
          <button onclick="AuthModal.switchTab('login')" class="text-slate-500 font-bold hover:underline">رجوع لتسجيل الدخول</button>
        </div>
      </div>`;
  },

  async submitForgot(e) {
    e.preventDefault();
    const btn = document.getElementById('forgot-submit-btn');
    this.forgotEmail = document.getElementById('forgot-email').value.trim();
    if (btn) { btn.disabled = true; btn.textContent = 'جاري الإرسال...'; }
    try {
      const res = await API.post('/auth/forgot-password', { email: this.forgotEmail });
      this.forgotCodeSent = true;
      App.showToast(res.message, 'success');
      this.updateModal();
    } catch (err) {
      App.showToast(err.message, 'error');
      if (btn) { btn.disabled = false; btn.textContent = 'ابعتلي الكود'; }
    }
  },

  async submitReset(e) {
    e.preventDefault();
    const btn = document.getElementById('reset-submit-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'جاري الحفظ...'; }
    try {
      const res = await API.post('/auth/reset-password', {
        email: this.forgotEmail,
        code: document.getElementById('reset-code').value.trim(),
        newPassword: document.getElementById('reset-password').value
      });
      App.showToast(res.message, 'success');
      this.forgotCodeSent = false;
      this.switchTab('login');
      setTimeout(() => { const id = document.getElementById('auth-identifier'); if (id) id.value = this.forgotEmail; }, 50);
    } catch (err) {
      App.showToast(err.message, 'error');
      if (btn) { btn.disabled = false; btn.textContent = 'غيّر كلمة المرور'; }
    }
  },

  renderContent() {
    if (this.currentTab === 'forgot') {
      return this.renderForgotView();
    }
    if (this.currentTab === '2fa') {
      return this.render2FaView();
    }
    if (this.currentTab === 'otp') {
      return this.renderOtpView();
    }
    if (this.currentTab === 'register') {
      return this.renderRegisterView();
    }
    return this.renderLoginView();
  },

  renderLoginView() {
    return `
      <div class="text-right" dir="rtl">
        <form onsubmit="AuthModal.submitLogin(event)">
          <div class="form-group mb-3">
            <label class="form-label font-bold text-slate-700 dark:text-slate-200 text-xs">البريد الإلكتروني أو رقم الجوال *</label>
            <input type="text" id="auth-identifier" class="form-control text-xs font-bold" placeholder="user@example.com أو 01012345678" required autocomplete="username" />
          </div>

          <div class="form-group mb-4">
            <div class="flex items-center justify-between mb-1">
              <label class="form-label font-bold text-slate-700 dark:text-slate-200 text-xs">كلمة المرور *</label>
              <button type="button" onclick="AuthModal.switchTab('forgot')" class="text-[11px] text-emerald-600 font-bold hover:underline cursor-pointer">نسيت كلمة المرور؟</button>
            </div>
            <input type="password" id="auth-password" class="form-control text-xs" placeholder="••••••••" required autocomplete="current-password" />
          </div>

          <button type="submit" id="login-submit-btn" class="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold py-3.5 rounded-xl text-xs mb-3 shadow-sm transition cursor-pointer flex items-center justify-center gap-2">
            <i class="fa-solid fa-right-to-bracket"></i>
            <span>تسجيل الدخول</span>
          </button>
        </form>

        <div class="relative my-4 text-center">
          <div class="absolute inset-0 flex items-center"><div class="w-full border-t border-slate-200 dark:border-slate-700"></div></div>
          <span class="relative bg-white dark:bg-slate-800 px-3 text-[11px] text-slate-500 font-bold">أو الدخول السريع</span>
        </div>

        <!-- Google OAuth 2.0 Button -->
        <button type="button" onclick="AuthModal.loginWithGoogle()" class="w-full border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold py-3 rounded-xl text-xs flex items-center justify-center gap-2.5 transition shadow-sm mb-4 cursor-pointer">
          <svg class="w-4 h-4" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
          </svg>
          <span>المتابعة باستخدام Google</span>
        </button>

        <div class="text-center text-xs text-slate-500 pt-3 border-t border-slate-100 dark:border-slate-700">
          ليس لديك حساب بعد؟ 
          <button onclick="AuthModal.switchTab('register')" class="text-emerald-600 font-extrabold hover:underline cursor-pointer">
            إنشاء حساب جديد الآن
          </button>
        </div>
      </div>
    `;
  },

  renderRegisterView() {
    return `
      <div class="text-right" dir="rtl">
        <form onsubmit="AuthModal.submitRegisterWithOtp(event)">
          <div class="form-group mb-3">
            <label class="form-label font-bold text-slate-700 dark:text-slate-200 text-xs">الاسم الكامل *</label>
            <input type="text" id="reg-name" class="form-control text-xs font-bold" placeholder="مثال: أحمد مصطفى" required />
          </div>

          <div class="form-group mb-3">
            <label class="form-label font-bold text-slate-700 dark:text-slate-200 text-xs">البريد الإلكتروني *</label>
            <div class="flex gap-2">
              <input type="email" id="reg-email" class="form-control text-xs font-bold flex-1" placeholder="name@example.com" required autocomplete="email" oninput="AuthModal.onEmailInput(this.value)" />
              <button type="button" id="reg-send-code-btn" onclick="AuthModal.sendRegisterEmailOtp()" class="bg-emerald-600 hover:bg-emerald-700 text-white font-black px-3.5 py-2 rounded-xl text-xs shrink-0 transition flex items-center gap-1.5 shadow-sm cursor-pointer">
                <i class="fa-solid fa-paper-plane"></i>
                <span>إرسال كود التأكيد</span>
              </button>
            </div>
            <div id="reg-email-status" class="text-[11px] text-slate-400 mt-1">
              سيتم إرسال رمز تحقق مكون من 6 أرقام إلى هذا البريد للتأكيد
            </div>
          </div>

          <!-- Email OTP Code Box -->
          <div id="reg-otp-group" class="form-group mb-3 bg-emerald-50/70 dark:bg-emerald-950/40 p-3.5 rounded-xl border border-emerald-300 dark:border-emerald-700 ${this.isEmailOtpSent ? '' : 'hidden'}">
            <div class="flex items-center justify-between mb-1.5">
              <label class="form-label font-black text-emerald-950 dark:text-emerald-200 mb-0 text-xs flex items-center gap-1">
                <i class="fa-solid fa-envelope-circle-check text-emerald-600"></i>
                <span>كود التحقق المرسل لبريدك الإلكتروني (6 أرقام) *</span>
              </label>
              <button type="button" id="reg-resend-link" onclick="AuthModal.sendRegisterEmailOtp()" class="text-[11px] text-emerald-700 font-bold hover:underline cursor-pointer">
                إعادة الإرسال
              </button>
            </div>
            <input type="text" id="reg-otp-code" class="form-control text-center text-2xl tracking-widest font-mono font-black text-emerald-700 bg-white dark:bg-slate-900" maxlength="6" placeholder="______" autocomplete="one-time-code" />
            <div class="text-[11px] text-emerald-700 dark:text-emerald-300 mt-1 font-medium" id="reg-otp-hint">
              تفقد صندوق الوارد أو مجلد الرسائل الترويجية/غير المرغوب فيها (Spam)
            </div>
          </div>

          <div class="form-group mb-3">
            <label class="form-label font-bold text-slate-700 dark:text-slate-200 text-xs">رقم الجوال (اختياري)</label>
            <input type="tel" id="reg-phone" class="form-control text-xs font-mono" placeholder="01012345678" autocomplete="tel" />
          </div>

          <div class="form-group mb-4">
            <label class="form-label font-bold text-slate-700 dark:text-slate-200 text-xs">كلمة المرور (6 خانات على الأقل) *</label>
            <input type="password" id="reg-password" class="form-control text-xs" minlength="6" placeholder="••••••••" required autocomplete="new-password" />
          </div>

          <button type="submit" id="reg-submit-btn" class="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold py-3.5 rounded-xl text-xs mb-3 shadow-md transition flex items-center justify-center gap-2 cursor-pointer">
            <i class="fa-solid fa-user-check"></i>
            <span>إنشاء الحساب وتأكيده</span>
          </button>
        </form>

        <div class="relative my-4 text-center">
          <div class="absolute inset-0 flex items-center"><div class="w-full border-t border-slate-200 dark:border-slate-700"></div></div>
          <span class="relative bg-white dark:bg-slate-800 px-3 text-[11px] text-slate-500 font-bold">أو</span>
        </div>

        <!-- Google OAuth 2.0 Register -->
        <button type="button" onclick="AuthModal.loginWithGoogle()" class="w-full border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold py-3 rounded-xl text-xs flex items-center justify-center gap-2.5 transition shadow-sm mb-4 cursor-pointer">
          <svg class="w-4 h-4" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
          </svg>
          <span>التسجيل السريع بحساب Google</span>
        </button>

        <div class="text-center text-xs text-slate-500 pt-3 border-t border-slate-100 dark:border-slate-700">
          لديك حساب بالفعل؟ 
          <button onclick="AuthModal.switchTab('login')" class="text-emerald-600 font-extrabold hover:underline cursor-pointer">
            تسجيل الدخول
          </button>
        </div>
      </div>
    `;
  },

  onEmailInput(val) {
    const trimmed = (val || '').trim();
    if (trimmed.includes('@') && trimmed.includes('.')) {
      const otpGroup = document.getElementById('reg-otp-group');
      if (otpGroup && !this.isEmailOtpSent) {
        otpGroup.classList.remove('hidden');
      }
    }
  },

  async sendRegisterEmailOtp() {
    const email = document.getElementById('reg-email')?.value.trim();
    if (!email || !email.includes('@') || !email.includes('.')) {
      App.showToast('يرجى كتابة بريد إلكتروني صحيح أولاً', 'warning');
      document.getElementById('reg-email')?.focus();
      return;
    }

    const btn = document.getElementById('reg-send-code-btn');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> جاري الإرسال...';
    }

    try {
      const res = await API.post('/auth/send-email-otp', { email });
      if (res.success) {
        this.isEmailOtpSent = true;
        App.showToast(res.message || 'تم إرسال كود التحقق بنجاح إلى بريدك الإلكتروني! 📧', 'success');

        const otpGroup = document.getElementById('reg-otp-group');
        if (otpGroup) {
          otpGroup.classList.remove('hidden');
          const otpInput = document.getElementById('reg-otp-code');
          if (otpInput) {
            otpInput.focus();
            if (res.otp) otpInput.value = res.otp;
          }
        }

        if (btn) {
          btn.innerHTML = '<i class="fa-solid fa-check"></i> تم الإرسال';
          btn.classList.replace('bg-emerald-600', 'bg-slate-700');
          setTimeout(() => {
            btn.disabled = false;
            btn.innerHTML = '<i class="fa-solid fa-rotate-right"></i> إعادة الإرسال';
          }, 20000);
        }
      } else {
        App.showToast(res.message || 'فشل إرسال كود التحقق', 'error');
        if (btn) {
          btn.disabled = false;
          btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> إرسال كود التأكيد';
        }
      }
    } catch (err) {
      App.showToast(err.message || 'فشل إرسال كود التحقق', 'error');
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> إرسال كود التأكيد';
      }
    }
  },

  async submitRegisterWithOtp(e) {
    e.preventDefault();
    const name = document.getElementById('reg-name')?.value.trim();
    const email = document.getElementById('reg-email')?.value.trim();
    const phone = document.getElementById('reg-phone')?.value.trim() || '';
    const password = document.getElementById('reg-password')?.value;
    const otpCode = document.getElementById('reg-otp-code')?.value.trim();

    if (!name || !email || !password) {
      App.showToast('يرجى ملء كافة الحقول المطلوبة', 'warning');
      return;
    }

    const otpGroup = document.getElementById('reg-otp-group');
    if (!otpCode) {
      if (otpGroup && otpGroup.classList.contains('hidden')) {
        await this.sendRegisterEmailOtp();
        App.showToast('تم إرسال كود التحقق إلى بريدك الإلكتروني، يرجى كتابته لتأكيد الحساب', 'info');
        return;
      }
      App.showToast('يرجى إدخال كود التحقق المكون من 6 أرقام المرسل إلى بريدك الإلكتروني', 'warning');
      document.getElementById('reg-otp-code')?.focus();
      return;
    }

    const submitBtn = document.getElementById('reg-submit-btn');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> جاري تأكيد الحساب...';
    }

    try {
      const res = await API.post('/auth/register', {
        name,
        email,
        phone,
        password,
        otpCode
      });

      if (res.success && res.user && res.token) {
        await State.login(res.user, res.token);
        App.closeModal();
        App.showToast('🎉 مرحباً بك في سوقي ستور! تم إنشاء حسابك وتأكيده بنجاح', 'success');
        if (this.redirectHash) {
          window.location.hash = this.redirectHash;
        }
      } else {
        App.showToast(res.message || 'فشل إنشاء الحساب', 'error');
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = '<i class="fa-solid fa-user-check"></i> <span>إنشاء الحساب وتأكيده</span>';
        }
      }
    } catch (err) {
      App.showToast(err.message || 'فشل إنشاء الحساب', 'error');
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="fa-solid fa-user-check"></i> <span>إنشاء الحساب وتأكيده</span>';
      }
    }
  },

  renderOtpView() {
    const email = this.pendingRegisterData ? this.pendingRegisterData.email : '';
    return `
      <div class="text-center text-right" dir="rtl">
        <div class="w-16 h-16 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-3 text-2xl">
          <i class="fa-solid fa-envelope-circle-check"></i>
        </div>
        <h4 class="font-extrabold text-base text-slate-800 dark:text-white mb-1 text-center">تأكيد البريد الإلكتروني بـ OTP</h4>
        <p class="text-xs text-slate-500 dark:text-slate-400 mb-4 text-center">
          تم إرسال كود تحقق مكون من 6 أرقام إلى: <strong class="text-emerald-600 font-mono">${email}</strong>
        </p>

        <form onsubmit="AuthModal.submitOtp(event)">
          <div class="form-group mb-4 max-w-xs mx-auto">
            <input type="text" id="otp-code-input" class="form-control text-center text-3xl tracking-widest font-mono font-extrabold text-emerald-600" maxlength="6" placeholder="______" required autofocus autocomplete="one-time-code" />
          </div>

          <button type="submit" id="otp-verify-btn" class="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3.5 rounded-xl text-sm mb-3 shadow-sm transition cursor-pointer">
            <i class="fa-solid fa-check-circle ml-2"></i> تأكيد وتفعيل الحساب
          </button>
        </form>

        <div class="flex items-center justify-between text-xs text-slate-500 pt-3 border-t border-slate-100 dark:border-slate-700">
          <button type="button" onclick="AuthModal.resendOtp()" id="otp-resend-btn" class="text-emerald-600 font-bold hover:underline cursor-pointer">
            إعادة إرسال الرمز
          </button>
          <button type="button" onclick="AuthModal.switchTab('register')" class="text-slate-400 hover:text-slate-600 font-medium cursor-pointer">
            تعديل البيانات
          </button>
        </div>
      </div>
    `;
  },

  render2FaView() {
    return `
      <div class="text-center text-right" dir="rtl">
        <div class="w-16 h-16 bg-purple-50 dark:bg-purple-950/40 text-purple-600 rounded-full flex items-center justify-center mx-auto mb-3 text-2xl shadow-sm">
          <i class="fa-solid fa-shield-halved"></i>
        </div>
        <h4 class="font-extrabold text-base text-slate-800 dark:text-white mb-1 text-center">المصادقة الثنائية (2FA)</h4>
        <p class="text-xs text-slate-500 dark:text-slate-400 mb-4 leading-relaxed text-center">
          حسابك محمي بخاصية التحقق بخطوتين. يرجى إدخال الرمز المكون من 6 أرقام من تطبيق Authenticator، أو إدخال أحد رموز الاسترداد الاحتياطية.
        </p>

        <form onsubmit="AuthModal.submit2FaCode(event)">
          <div class="form-group mb-4 max-w-xs mx-auto">
            <input type="text" id="auth-2fa-code" class="form-control text-center text-2xl tracking-widest font-mono font-extrabold text-purple-600 uppercase" maxlength="10" placeholder="000000" required autofocus autocomplete="one-time-code" />
          </div>

          <button type="submit" id="auth-2fa-submit-btn" class="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-3.5 rounded-xl text-sm mb-3 shadow-sm transition cursor-pointer">
            <i class="fa-solid fa-check-circle ml-2"></i> تأكيد ومتابعة الدخول
          </button>
        </form>

        <div class="text-center text-xs text-slate-500 pt-3 border-t border-slate-100 dark:border-slate-700">
          <button type="button" onclick="AuthModal.switchTab('login')" class="text-slate-400 hover:text-slate-600 font-medium cursor-pointer">
            <i class="fa-solid fa-arrow-right ml-1"></i> العودة لتسجيل الدخول
          </button>
        </div>
      </div>
    `;
  },

  switchTab(tab) {
    this.currentTab = tab;
    this.updateModal();
  },

  async resendOtp() {
    if (!this.pendingRegisterData || !this.pendingRegisterData.email) return;
    try {
      const res = await API.post('/auth/send-email-otp', { email: this.pendingRegisterData.email });
      App.showToast('تمت إعادة إرسال رمز التحقق بنجاح إلى بريدك الإلكتروني!', 'success');
      this.startOtpCountdown(60);
    } catch (err) {
      App.showToast(err.message, 'error');
    }
  },

  startOtpCountdown(seconds) {
    this.otpCountdownSeconds = seconds;
    const btn = document.getElementById('otp-resend-btn');
    if (btn) {
      btn.disabled = true;
      btn.innerText = `إعادة الإرسال بعد (${this.otpCountdownSeconds} ث)`;
    }

    clearInterval(this.otpCountdownTimer);
    this.otpCountdownTimer = setInterval(() => {
      this.otpCountdownSeconds--;
      const b = document.getElementById('otp-resend-btn');
      if (this.otpCountdownSeconds <= 0) {
        clearInterval(this.otpCountdownTimer);
        if (b) {
          b.disabled = false;
          b.innerText = 'إعادة إرسال الرمز';
        }
      } else if (b) {
        b.innerText = `إعادة الإرسال بعد (${this.otpCountdownSeconds} ث)`;
      }
    }, 1000);
  },

  async submitOtp(e) {
    e.preventDefault();
    const code = document.getElementById('otp-code-input').value.trim();
    if (!code || code.length !== 6) {
      App.showToast('يرجى إدخال رمز التحقق المكون من 6 أرقام بشكل صحيح', 'warning');
      return;
    }

    const btn = document.getElementById('otp-verify-btn');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin ml-2"></i> جاري تأكيد الحساب...';
    }

    try {
      const registerPayload = {
        ...this.pendingRegisterData,
        otpCode: code
      };

      const res = await API.post('/auth/register', registerPayload);
      if (res.success && res.user && res.token) {
        await State.login(res.user, res.token);
        App.closeModal();
        App.showToast('🎉 مرحباً بك في سوقي ستور! تم إنشاء حسابك وتأكيده بنجاح', 'success');

        if (this.redirectHash) {
          window.location.hash = this.redirectHash;
        }
      } else {
        App.showToast(res.message || 'فشل تأكيد الحساب', 'error');
        if (btn) {
          btn.disabled = false;
          btn.innerHTML = '<i class="fa-solid fa-check-circle ml-2"></i> تأكيد وتفعيل الحساب';
        }
      }
    } catch (err) {
      App.showToast(err.message, 'error');
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-check-circle ml-2"></i> تأكيد وتفعيل الحساب';
      }
    }
  },

  // Official Google OAuth 2.0 direct login (No demo simulation)
  async loginWithGoogle() {
    try {
      App.showToast('جاري توجيهك إلى تسجيل الدخول عبر Google...', 'info');
      const res = await API.get('/auth/google/url');
      if (res && res.success && res.url) {
        window.location.href = res.url;
      } else {
        window.location.href = '/api/auth/google';
      }
    } catch (err) {
      window.location.href = '/api/auth/google';
    }
  },

  async submitLogin(e) {
    e.preventDefault();
    const identifier = document.getElementById('auth-identifier').value.trim();
    const password = document.getElementById('auth-password').value;
    const btn = document.getElementById('login-submit-btn');

    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin ml-2"></i> جاري تسجيل الدخول...';
    }

    try {
      const res = await API.post('/auth/login', { identifier, password });

      if (res.requires2FA) {
        this.pending2FaTempToken = res.tempToken;
        this.currentTab = '2fa';
        this.updateModal();
        App.showToast(res.message || 'يرجى إدخال رمز التحقق بخطوتين', 'info');
        return;
      }

      if (res.success && res.user && res.token) {
        await State.login(res.user, res.token);
        App.showToast(res.message, 'success');

        if (res.user.role === 'investor' || res.user.role === 'merchant') {
          this.showPostLoginShortcut(res.user);
          return;
        }

        App.closeModal();

        if (this.redirectHash) {
          window.location.hash = this.redirectHash;
        } else if (res.user.role === 'super_admin' || res.user.role === 'staff' || res.user.role === 'accountant') {
          window.location.hash = '#/admin';
        }
      }
    } catch (err) {
      App.showToast(err.message || 'فشل تسجيل الدخول، تأكد من صحة البيانات', 'error');

      if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-right-to-bracket ml-2"></i> تسجيل الدخول';
      }
    }
  },

  async submit2FaCode(e) {
    e.preventDefault();
    const code = document.getElementById('auth-2fa-code').value.trim();
    if (!code) {
      App.showToast('يرجى إدخال رمز التحقق', 'warning');
      return;
    }

    const btn = document.getElementById('auth-2fa-submit-btn');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin ml-2"></i> جاري التحقق...';
    }

    try {
      const res = await API.post('/auth/2fa/verify', {
        tempToken: this.pending2FaTempToken,
        code
      });

      if (res.success && res.user && res.token) {
        await State.login(res.user, res.token);
        App.showToast(res.message || 'تم تسجيل الدخول بنجاح!', 'success');

        if (res.user.role === 'investor' || res.user.role === 'merchant') {
          this.showPostLoginShortcut(res.user);
          return;
        }

        App.closeModal();

        if (this.redirectHash) {
          window.location.hash = this.redirectHash;
        } else if (res.user.role === 'super_admin' || res.user.role === 'staff' || res.user.role === 'accountant') {
          window.location.hash = '#/admin';
        }
      }
    } catch (err) {
      App.showToast(err.message, 'error');
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-check-circle ml-2"></i> تأكيد ومتابعة الدخول';
      }
    }
  },

  // Instant Post-Login Gateway / Shortcut Modal for Investors & Merchants
  showPostLoginShortcut(user) {
    const isInvestor = user.role === 'investor';
    const isMerchant = user.role === 'merchant';
    const title = isInvestor ? '💼 مرحباً بك - حساب مستثمر معتمد' : '🏪 مرحباً بك - حساب تاجر معتمد';

    const body = `
      <div class="text-right p-2 space-y-4" dir="rtl">
        <div class="text-center">
          <div class="w-16 h-16 ${isInvestor ? 'bg-blue-100 text-blue-600' : 'bg-emerald-100 text-emerald-600'} rounded-2xl flex items-center justify-center mx-auto mb-3 text-3xl shadow-sm animate-bounce">
            <i class="fa-solid ${isInvestor ? 'fa-briefcase' : 'fa-store'}"></i>
          </div>
          <h3 class="text-lg font-black text-slate-900 mb-1">أهلاً بك يا ${user.name} 🎉</h3>
          <p class="text-xs text-slate-500">
            تم تسجيل دخولك بنجاح بصفة <strong class="${isInvestor ? 'text-blue-700' : 'text-emerald-700'}">${isInvestor ? 'مستثمر شريك' : 'تاجر ومورّد معتمد'}</strong>
            (كود: <span class="font-mono font-bold">${user.investorCode || user.merchantCode || user.code || '—'}</span>)
          </p>
        </div>

        <div class="bg-gradient-to-br ${isInvestor ? 'from-blue-50 to-indigo-50 border-blue-200' : 'from-emerald-50 to-teal-50 border-emerald-200'} border p-4 rounded-2xl shadow-sm text-center">
          <div class="text-xs font-bold ${isInvestor ? 'text-blue-900' : 'text-emerald-900'} mb-3">
            اضغط على الاختصار التالي للانتقال المباشر إلى لوحتك:
          </div>

          ${isInvestor ? `
            <a 
              href="#/admin" 
              onclick="App.closeModal()" 
              class="w-full bg-gradient-to-r from-blue-600 to-indigo-700 hover:from-blue-700 hover:to-indigo-800 text-white font-black py-4 px-4 rounded-xl text-sm flex items-center justify-center gap-2.5 shadow-lg hover:shadow-xl transition transform active:scale-95 cursor-pointer"
            >
              <i class="fa-solid fa-chart-pie text-lg"></i>
              <span>💼 الانتقال إلى داشبورد المستثمر وحساباتي &larr;</span>
            </a>
            
            <div class="grid grid-cols-2 gap-2 mt-3">
              <a href="#/admin/products" onclick="App.closeModal()" class="bg-white hover:bg-slate-50 text-blue-800 border border-blue-200 font-bold py-2.5 px-3 rounded-xl text-xs flex items-center justify-center gap-1.5 transition">
                <i class="fa-solid fa-boxes-stacked"></i>
                <span>منتجاتي المسجلة</span>
              </a>
              <button type="button" onclick="App.closeModal(); window.location.hash='#/';" class="bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 font-bold py-2.5 px-3 rounded-xl text-xs flex items-center justify-center gap-1.5 transition cursor-pointer">
                <i class="fa-solid fa-cart-shopping"></i>
                <span>تصفح المتجر</span>
              </button>
            </div>
          ` : `
            <a 
              href="#/admin/products" 
              onclick="App.closeModal()" 
              class="w-full bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-700 hover:to-teal-800 text-white font-black py-4 px-4 rounded-xl text-sm flex items-center justify-center gap-2.5 shadow-lg hover:shadow-xl transition transform active:scale-95 cursor-pointer"
            >
              <i class="fa-solid fa-boxes-packing text-lg"></i>
              <span>🏪 الانتقال إلى لوحة التاجر ومنتجاتي &larr;</span>
            </a>

            <div class="grid grid-cols-2 gap-2 mt-3">
              <a href="#/admin/merchant-accounting" onclick="App.closeModal()" class="bg-white hover:bg-slate-50 text-emerald-800 border border-emerald-200 font-bold py-2.5 px-3 rounded-xl text-xs flex items-center justify-center gap-1.5 transition">
                <i class="fa-solid fa-receipt"></i>
                <span>حساباتي ومستحقاتي</span>
              </a>
              <button type="button" onclick="App.closeModal(); window.location.hash='#/';" class="bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 font-bold py-2.5 px-3 rounded-xl text-xs flex items-center justify-center gap-1.5 transition cursor-pointer">
                <i class="fa-solid fa-cart-shopping"></i>
                <span>تصفح المتجر</span>
              </button>
            </div>
          `}
        </div>

        <div class="text-center text-[11px] text-slate-400">
          يمكنك دائماً الوصول للوحة في أي وقت من الزر السريع بأعلى الموقع
        </div>
      </div>
    `;

    App.openModal(title, body);
  }
};