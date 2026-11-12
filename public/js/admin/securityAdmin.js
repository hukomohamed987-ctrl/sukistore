/**
 * Suki Store Admin - Security Center & Audit Trail
 * Implements:
 * - Real-time Login Attempts Monitoring (Failed vs Successful, Lockouts, IP, User)
 * - Privileged Operations Audit Log (Super Admin actions, staff modifications, sensitive settings)
 * - Security Health Dashboard & Metrics (Lockouts, 2FA adoption, HTTPS readiness, Cookie security)
 * - Session Management (Immediate global logout revocation)
 */

const SecurityAdmin = {
  activeTab: 'logins', // 'logins' | 'audit' | 'sessions'
  stats: null,
  loginLogs: [],
  auditLogs: [],
  loginFilter: 'all', // 'all' | 'SUCCESS' | 'FAILED'
  auditTimeRange: 'all', // 'all' | '1d' | '7d' | '30d'

  async render() {
    AdminLayout.render('security', `
      <div class="py-12 text-center text-slate-400">
        <i class="fa-solid fa-spinner fa-spin text-3xl mb-3 text-emerald-600"></i>
        <div>جاري جلب بيانات مركز الأمان وسجلات التدقيق...</div>
      </div>
    `);

    try {
      const [statsRes, loginRes, auditRes] = await Promise.all([
        API.get('/admin/security/stats').catch(() => ({ stats: {} })),
        API.get('/admin/security/login-logs', { status: this.loginFilter === 'all' ? undefined : this.loginFilter }).catch(() => ({ logs: [] })),
        API.get('/admin/audit-logs', { timeRange: this.auditTimeRange }).catch(() => ({ logs: [] }))
      ]);

      this.stats = statsRes.stats || {};
      this.loginLogs = loginRes.logs || [];
      this.auditLogs = auditRes.logs || [];

      // Check if logged in user is Mohamed Hakim (Super Admin Owner)
      const user = State.user;
      this.isHakim = Boolean(user && (user.isOwner === true || user.email === 'admin@suki.store' || (user.name && user.name.includes('حكيم'))));
      this.isSuperOrAhmed = Boolean(user && (
        user.role === 'super_admin' || 
        user.isOwner === true || 
        user.email === 'admin@suki.store' || 
        user.email === 'ahmed@suki.store' || 
        (user.name && user.name.includes('أحمد غريب'))
      ));

      this.maintenanceMode = false;
      if (this.isSuperOrAhmed) {
        try {
          const mRes = await API.get('/admin/maintenance-status');
          this.maintenanceMode = Boolean(mRes.maintenanceMode);
        } catch (e) {}
      }

      this.ipSettings = null;
      if (this.isHakim) {
        try {
          const ipRes = await API.get('/admin/security/ip-whitelist');
          this.ipSettings = ipRes;
        } catch (e) {
          console.warn('Could not fetch IP whitelist settings:', e);
        }
      }

      this.renderContent();
    } catch (err) {
      console.error('Security admin render error:', err);
      AdminLayout.render('security', `
        <div class="py-12 text-center text-red-500">
          <i class="fa-solid fa-triangle-exclamation text-3xl mb-2"></i>
          <div>فشل تحميل مركز الأمان: ${err.message || ''}</div>
        </div>
      `);
    }
  },

  renderContent() {
    const s = this.stats || {};

    const html = `
      <div>
        <!-- Title Header -->
        <div class="flex items-center justify-between mb-6 flex-wrap gap-4">
          <div>
            <h1 class="text-2xl font-extrabold text-slate-900 flex items-center gap-2.5">
              <span class="w-9 h-9 rounded-xl bg-red-100 text-red-700 flex items-center justify-center text-base shadow-sm">
                <i class="fa-solid fa-shield-halved"></i>
              </span>
              <span>مركز الأمان وسجلات التدقيق (Security & Audit Trail)</span>
            </h1>
            <p class="text-xs text-slate-500 mt-1">مراقبة محاولات تسجيل الدخول، رصد هجمات التخمين (Brute Force)، وسجل التدقيق للعمليات الحساسة</p>
          </div>
          <div class="flex items-center gap-2">
            <button onclick="SecurityAdmin.render()" class="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-3.5 py-2 rounded-xl text-xs flex items-center gap-1.5 transition-all">
              <i class="fa-solid fa-rotate-right"></i>
              <span>تحديث السجلات</span>
            </button>
            <button onclick="SecurityAdmin.promptLogoutAll()" class="bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 font-bold px-3.5 py-2 rounded-xl text-xs flex items-center gap-1.5 transition-all">
              <i class="fa-solid fa-arrow-right-from-bracket"></i>
              <span>إلغاء كل الجلسات النشطة</span>
            </button>
          </div>
        </div>

        ${this.isSuperOrAhmed ? `
          <!-- Maintenance Mode Card (Visible ONLY to Super Admin and Ahmed Gharib) -->
          <div class="mb-6 rounded-2xl p-5 border ${this.maintenanceMode ? 'bg-gradient-to-r from-red-950 via-slate-900 to-slate-900 text-white border-red-500/50 shadow-xl' : 'bg-white text-slate-800 border-slate-200 shadow-sm'} transition-all">
            <div class="flex items-center justify-between flex-wrap gap-4">
              <div class="flex items-center gap-3.5">
                <div class="w-12 h-12 rounded-xl flex items-center justify-center text-xl shadow-md ${this.maintenanceMode ? 'bg-red-600 text-white animate-pulse' : 'bg-slate-100 text-slate-600'}">
                  <i class="fa-solid fa-wrench"></i>
                </div>
                <div>
                  <div class="flex items-center gap-2">
                    <h3 class="text-base font-black ${this.maintenanceMode ? 'text-white' : 'text-slate-900'}">وضع الصيانة (Maintenance Mode)</h3>
                    <span class="px-2.5 py-0.5 rounded-full text-[10px] font-black ${this.maintenanceMode ? 'bg-red-500/30 text-red-300 border border-red-400/40 animate-pulse' : 'bg-emerald-100 text-emerald-800 border border-emerald-200'}">
                      ${this.maintenanceMode ? '🚨 مفعل حالياً (الموقع مغلق للزوار)' : '✅ متوقف (الموقع يعمل بكفاءة للجميع)'}
                    </span>
                  </div>
                  <p class="text-xs ${this.maintenanceMode ? 'text-slate-300' : 'text-slate-500'} mt-1 max-w-2xl leading-relaxed">
                    خيار خاص بالسوبر أدمن وأحمد غريب فقط. عند التفعيل، يظهر للزوار والعملاء صفحة "الموقع تحت الصيانة" مؤقتاً، بينما يستمر الموقع والداشبورد في العمل لحسابات الإدارة.
                  </p>
                </div>
              </div>

              <div>
                <button 
                  onclick="SecurityAdmin.toggleMaintenanceMode()" 
                  class="px-5 py-2.5 rounded-xl font-black text-xs transition flex items-center gap-2 shadow-md cursor-pointer ${this.maintenanceMode ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : 'bg-red-600 hover:bg-red-700 text-white'}"
                >
                  <i class="fa-solid ${this.maintenanceMode ? 'fa-play' : 'fa-power-off'}"></i>
                  <span>${this.maintenanceMode ? 'إيقاف وضع الصيانة وإعادة فتح الموقع للزوار' : 'تفعيل وضع الصيانة وإغلاق الموقع مؤقتاً'}</span>
                </button>
              </div>
            </div>
          </div>
        ` : ''}

        <!-- Security Metric Cards -->
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <!-- Failed Logins 24h -->
          <div class="admin-card p-4 border-r-4 ${s.failedLogins24h > 0 ? 'border-r-red-500 bg-red-50/30' : 'border-r-slate-300'}">
            <div class="flex items-center justify-between">
              <div>
                <div class="text-xs font-bold text-slate-500">محاولات فاشلة (آخر 24 س)</div>
                <div class="text-2xl font-black ${s.failedLogins24h > 0 ? 'text-red-600' : 'text-slate-800'} mt-1">${s.failedLogins24h || 0}</div>
              </div>
              <div class="w-10 h-10 rounded-xl ${s.failedLogins24h > 0 ? 'bg-red-100 text-red-600' : 'bg-slate-100 text-slate-500'} flex items-center justify-center text-lg">
                <i class="fa-solid fa-triangle-exclamation"></i>
              </div>
            </div>
            <div class="text-[11px] text-slate-400 mt-2 font-medium">مراقبة هجمات التخمين Brute Force</div>
          </div>

          <!-- Successful Logins 24h -->
          <div class="admin-card p-4 border-r-4 border-r-emerald-500">
            <div class="flex items-center justify-between">
              <div>
                <div class="text-xs font-bold text-slate-500">دخول ناجح (آخر 24 س)</div>
                <div class="text-2xl font-black text-emerald-600 mt-1">${s.successfulLogins24h || 0}</div>
              </div>
              <div class="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center text-lg">
                <i class="fa-solid fa-circle-check"></i>
              </div>
            </div>
            <div class="text-[11px] text-slate-400 mt-2 font-medium">عمليات مصادقة معتمدة وناجحة</div>
          </div>

          <!-- 2FA Adoption -->
          <div class="admin-card p-4 border-r-4 border-r-purple-500">
            <div class="flex items-center justify-between">
              <div>
                <div class="text-xs font-bold text-slate-500">حسابات مفعلة لـ 2FA</div>
                <div class="text-2xl font-black text-purple-600 mt-1">${s.twoFactorCount || 0}</div>
              </div>
              <div class="w-10 h-10 rounded-xl bg-purple-100 text-purple-600 flex items-center justify-center text-lg">
                <i class="fa-solid fa-mobile-screen-button"></i>
              </div>
            </div>
            <div class="text-[11px] text-slate-400 mt-2 font-medium">المصادقة الثنائية (TOTP RFC 6238)</div>
          </div>

          <!-- Security Protection Status -->
          <div class="admin-card p-4 border-r-4 border-r-blue-500">
            <div class="flex items-center justify-between">
              <div>
                <div class="text-xs font-bold text-slate-500">حالة التشفير والحماية</div>
                <div class="text-sm font-extrabold text-blue-700 mt-1.5 flex items-center gap-1.5">
                  <i class="fa-solid fa-lock text-xs"></i>
                  <span>HttpOnly + Helmet</span>
                </div>
              </div>
              <div class="w-10 h-10 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center text-lg">
                <i class="fa-solid fa-fingerprint"></i>
              </div>
            </div>
            <div class="text-[11px] text-slate-400 mt-2 font-medium">JWT Expiry: ${s.adminJwtExpiry || '24h'} للإدارة</div>
          </div>
        </div>

        <!-- Navigation Tabs -->
        <div class="flex items-center gap-2 border-b border-slate-200 mb-6 pb-2">
          <button onclick="SecurityAdmin.switchTab('logins')" class="px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 ${this.activeTab === 'logins' ? 'bg-slate-900 text-white shadow-sm' : 'bg-slate-100 hover:bg-slate-200 text-slate-600'}">
            <i class="fa-solid fa-clock-rotate-left"></i>
            <span>سجل محاولات الدخول (${this.loginLogs.length})</span>
          </button>
          <button onclick="SecurityAdmin.switchTab('audit')" class="px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 ${this.activeTab === 'audit' ? 'bg-slate-900 text-white shadow-sm' : 'bg-slate-100 hover:bg-slate-200 text-slate-600'}">
            <i class="fa-solid fa-list-check"></i>
            <span>سجل التدقيق الأمني (Audit Logs - ${this.auditLogs.length})</span>
          </button>
          <button onclick="SecurityAdmin.switchTab('sessions')" class="px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 ${this.activeTab === 'sessions' ? 'bg-slate-900 text-white shadow-sm' : 'bg-slate-100 hover:bg-slate-200 text-slate-600'}">
            <i class="fa-solid fa-user-lock"></i>
            <span>إعدادات وسياسات الحماية</span>
          </button>
        </div>

        <!-- Tab Content -->
        ${this.activeTab === 'logins' ? this.renderLoginsTab() : ''}
        ${this.activeTab === 'audit' ? this.renderAuditTab() : ''}
        ${this.activeTab === 'sessions' ? this.renderSessionsTab() : ''}
      </div>
    `;

    AdminLayout.render('security', html);
  },

  renderLoginsTab() {
    return `
      <div class="admin-card overflow-hidden">
        <div class="p-4 border-b border-slate-100 flex items-center justify-between flex-wrap gap-3 bg-slate-50/50">
          <div class="font-extrabold text-xs text-slate-700 flex items-center gap-2">
            <i class="fa-solid fa-list text-slate-400"></i>
            <span>محاولات تسجيل الدخول الأخيرة (الناجحة والفاشلة)</span>
          </div>
          <div class="flex items-center gap-2">
            <label class="text-xs text-slate-500 font-bold">الحالة:</label>
            <select onchange="SecurityAdmin.changeLoginFilter(this.value)" class="form-control text-xs py-1.5 px-3 rounded-lg">
              <option value="all" ${this.loginFilter === 'all' ? 'selected' : ''}>الكل</option>
              <option value="SUCCESS" ${this.loginFilter === 'SUCCESS' ? 'selected' : ''}>ناجحة فقط</option>
              <option value="FAILED" ${this.loginFilter === 'FAILED' ? 'selected' : ''}>فاشلة فقط</option>
            </select>
          </div>
        </div>

        <div class="overflow-x-auto">
          <table class="w-full text-right text-xs">
            <thead class="bg-slate-100/70 text-slate-600 font-bold border-b border-slate-200">
              <tr>
                <th class="p-3.5">التوقيت والتاريخ</th>
                <th class="p-3.5">البريد أو الحساب</th>
                <th class="p-3.5">الدور</th>
                <th class="p-3.5">عنوان IP</th>
                <th class="p-3.5">النتيجة</th>
                <th class="p-3.5">التفاصيل والسبب</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              ${this.loginLogs.length === 0 ? `
                <tr>
                  <td colspan="6" class="p-8 text-center text-slate-400 font-medium">
                    <i class="fa-solid fa-shield-check text-2xl mb-2 text-emerald-500 block"></i>
                    لا توجد سجلات مطابقة في الوقت الحالي
                  </td>
                </tr>
              ` : this.loginLogs.map(log => {
                const isSuccess = log.status === 'SUCCESS';
                const dateStr = log.timestamp ? new Date(log.timestamp).toLocaleString('ar-EG', {
                  month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit'
                }) : '-';

                return `
                  <tr class="hover:bg-slate-50 transition">
                    <td class="p-3.5 font-mono text-[11px] text-slate-500 whitespace-nowrap">${dateStr}</td>
                    <td class="p-3.5 font-bold text-slate-800">${log.email || 'غير معروف'}</td>
                    <td class="p-3.5">
                      <span class="text-[10px] font-bold px-2 py-0.5 rounded-full ${log.role === 'super_admin' ? 'bg-purple-100 text-purple-800' : log.role === 'staff' ? 'bg-blue-100 text-blue-800' : 'bg-slate-100 text-slate-700'}">
                        ${log.role || 'عميل / زائر'}
                      </span>
                    </td>
                    <td class="p-3.5 font-mono text-[11px] text-slate-600">${log.ip || '-'}</td>
                    <td class="p-3.5">
                      <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-extrabold ${isSuccess ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}">
                        <i class="fa-solid ${isSuccess ? 'fa-check' : 'fa-xmark'}"></i>
                        <span>${isSuccess ? 'ناجحة' : 'فاشلة'}</span>
                      </span>
                    </td>
                    <td class="p-3.5 text-slate-500 font-medium">${this.translateReason(log.reason)}</td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  },

  renderAuditTab() {
    return `
      <div class="admin-card overflow-hidden">
        <div class="p-4 border-b border-slate-100 flex items-center justify-between flex-wrap gap-3 bg-slate-50/50">
          <div class="font-extrabold text-xs text-slate-700 flex items-center gap-2">
            <i class="fa-solid fa-shield-halved text-purple-600"></i>
            <span>سجل العمليات الحساسة التي تمت بصلاحيات عالية (Audit Trail)</span>
          </div>
          <div class="flex items-center gap-2">
            <label class="text-xs text-slate-500 font-bold">الفترة الزمنية:</label>
            <select onchange="SecurityAdmin.changeAuditTimeRange(this.value)" class="form-control text-xs py-1.5 px-3 rounded-lg">
              <option value="all" ${this.auditTimeRange === 'all' ? 'selected' : ''}>كافة السجلات</option>
              <option value="1d" ${this.auditTimeRange === '1d' ? 'selected' : ''}>آخر 24 ساعة</option>
              <option value="7d" ${this.auditTimeRange === '7d' ? 'selected' : ''}>آخر 7 أيام</option>
              <option value="30d" ${this.auditTimeRange === '30d' ? 'selected' : ''}>آخر شهر</option>
            </select>
          </div>
        </div>

        <div class="overflow-x-auto">
          <table class="w-full text-right text-xs">
            <thead class="bg-slate-100/70 text-slate-600 font-bold border-b border-slate-200">
              <tr>
                <th class="p-3.5">التوقيت والتاريخ</th>
                <th class="p-3.5">المستخدم والمنفذ</th>
                <th class="p-3.5">نوع العملية</th>
                <th class="p-3.5">الوحدة (Module)</th>
                <th class="p-3.5">تفاصيل الإجراء</th>
                <th class="p-3.5">عنوان IP</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              ${this.auditLogs.length === 0 ? `
                <tr>
                  <td colspan="6" class="p-8 text-center text-slate-400 font-medium">
                    <i class="fa-solid fa-clipboard-check text-2xl mb-2 text-slate-300 block"></i>
                    لا توجد سجلات تدقيق في هذه الفترة
                  </td>
                </tr>
              ` : this.auditLogs.map(log => {
                const dateStr = log.timestamp ? new Date(log.timestamp).toLocaleString('ar-EG', {
                  month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit'
                }) : '-';

                return `
                  <tr class="hover:bg-slate-50 transition">
                    <td class="p-3.5 font-mono text-[11px] text-slate-500 whitespace-nowrap">${dateStr}</td>
                    <td class="p-3.5">
                      <div class="font-bold text-slate-800">${log.userName || log.userEmail || 'نظام الأمان'}</div>
                      <div class="text-[10px] text-slate-400">${log.userRole === 'super_admin' ? '👑 مدير عام' : 'موظف مسؤول'}</div>
                    </td>
                    <td class="p-3.5 font-mono text-[11px] font-bold text-purple-700">${log.action}</td>
                    <td class="p-3.5">
                      <span class="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-mono">
                        ${log.targetModule || 'system'}
                      </span>
                    </td>
                    <td class="p-3.5 text-slate-700 font-medium max-w-xs truncate" title="${log.details || ''}">
                      ${log.details || '-'}
                    </td>
                    <td class="p-3.5 font-mono text-[11px] text-slate-600">${log.ip || '-'}</td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  },

  renderSessionsTab() {
    const s = this.stats || {};
    return `
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <!-- Session Revocation Card -->
        <div class="admin-card p-5">
          <div class="flex items-center gap-3 mb-4">
            <div class="w-10 h-10 rounded-xl bg-red-100 text-red-600 flex items-center justify-center text-lg">
              <i class="fa-solid fa-power-off"></i>
            </div>
            <div>
              <h3 class="font-extrabold text-sm text-slate-800">إلغاء الجلسات النشطة (Revocation)</h3>
              <p class="text-xs text-slate-400">إلغاء فوري لصلاحية كافة التوكنات المسجلة لأي حساب</p>
            </div>
          </div>

          <p class="text-xs text-slate-600 mb-4 leading-relaxed">
            عند الضغط على الزر، سيتم زيادة عداد إصدار التوكن (<code class="bg-slate-100 px-1 py-0.5 rounded text-red-600 font-mono">tokenVersion</code>) لحسابك، مما يؤدي فوراً إلى إبطال مفعول أي جلسات مسجلة على أجهزة أخرى، وإلزام تسجيل الدخول مجدداً.
          </p>

          <button onclick="SecurityAdmin.promptLogoutAll()" class="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-3 rounded-xl text-xs flex items-center justify-center gap-2 transition shadow-sm">
            <i class="fa-solid fa-arrow-right-from-bracket"></i>
            <span>تسجيل الخروج من كافة الأجهزة الآن</span>
          </button>
        </div>

        <!-- Super Admin IP Whitelist & Unrestricted Access -->
        ${this.isHakim ? `
          <div class="admin-card p-5 border-2 border-purple-200">
            <div class="flex items-center justify-between mb-4 flex-wrap gap-2">
              <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center text-lg">
                  <i class="fa-solid fa-network-wired"></i>
                </div>
                <div>
                  <div class="flex items-center gap-2">
                    <h3 class="font-extrabold text-sm text-slate-800">تقييد عناوين الـ IP وأمان الدخول</h3>
                    <span class="bg-purple-100 text-purple-800 text-[10px] font-black px-2 py-0.5 rounded-full">حصري للمالك (محمد حكيم) 👑</span>
                  </div>
                  <p class="text-xs text-slate-400">التحكم في خيار الدخول بدون قيود ومن أي جهاز أو تقييد الدخول لـ IPs محددة</p>
                </div>
              </div>
              ${this.ipSettings ? `
                <span class="status-pill ${this.ipSettings.ipRestrictionEnabled ? 'status-processing' : 'status-delivered'} text-xs">
                  ${this.ipSettings.ipRestrictionEnabled ? 'التقييد مفعل 🔒' : 'دخول متاح من أي جهاز ✅'}
                </span>
              ` : ''}
            </div>

            <form onsubmit="SecurityAdmin.saveIpWhitelist(event)">
              <!-- Toggle Restriction Option -->
              <div class="bg-slate-50 p-4 rounded-xl border border-slate-200 mb-4">
                <label class="flex items-center gap-3 cursor-pointer">
                  <input 
                    type="checkbox" 
                    id="sec-ip-restriction-toggle" 
                    class="w-5 h-5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                    ${this.ipSettings && this.ipSettings.ipRestrictionEnabled ? 'checked' : ''}
                    onchange="SecurityAdmin.toggleIpInputs(this.checked)"
                  />
                  <div>
                    <span class="font-extrabold text-xs text-slate-800 block">تفعيل تقييد الدخول بحسب عناوين IP محددة</span>
                    <span class="text-[11px] text-slate-500 block">عند إلغاء التحديد، يُسمح بتسجيل الدخول بدون قيود ومن أي جهاز بحرية تامة</span>
                  </div>
                </label>
              </div>

              <!-- Current Detected IP -->
              <div class="flex items-center justify-between bg-emerald-50/60 p-3 rounded-xl border border-emerald-200 mb-4 text-xs">
                <div class="flex items-center gap-2 text-emerald-900 font-bold">
                  <i class="fa-solid fa-laptop text-emerald-600"></i>
                  <span>عنوان IP الحالي لجهازك:</span>
                  <code class="bg-white px-2 py-0.5 rounded border border-emerald-300 font-mono text-emerald-700">${this.ipSettings?.clientIp || '127.0.0.1'}</code>
                </div>
                <button type="button" onclick="SecurityAdmin.addCurrentIpToHakim('${this.ipSettings?.clientIp || '127.0.0.1'}')" class="text-[11px] bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-2.5 py-1 rounded-lg transition">
                  + إضافة لقائمتي
                </button>
              </div>

              <!-- Inputs for Hakim and Ahmed IPs -->
              <div id="sec-ip-inputs-container" class="${this.ipSettings && this.ipSettings.ipRestrictionEnabled ? '' : 'opacity-50'}">
                <div class="form-group mb-3">
                  <label class="form-label text-xs font-bold text-slate-700 flex items-center justify-between">
                    <span>عناوين IP المسموح بها للمالك (محمد حكيم) - مفصولة بفاصلة</span>
                    <span class="text-[10px] text-slate-400">admin@suki.store</span>
                  </label>
                  <textarea 
                    id="sec-ips-hakim" 
                    class="form-control text-xs font-mono" 
                    rows="2" 
                    placeholder="127.0.0.1, 192.168.1.5, ::1">${(this.ipSettings?.allowedIpsHakim || ['127.0.0.1', '::1']).join(', ')}</textarea>
                </div>

                <div class="form-group mb-4">
                  <label class="form-label text-xs font-bold text-slate-700 flex items-center justify-between">
                    <span>عناوين IP المسموح بها للشريك (أحمد غريب) - مفصولة بفاصلة</span>
                    <span class="text-[10px] text-slate-400">ahmed@suki.store</span>
                  </label>
                  <textarea 
                    id="sec-ips-ahmed" 
                    class="form-control text-xs font-mono" 
                    rows="2" 
                    placeholder="127.0.0.1, 192.168.1.6, ::1">${(this.ipSettings?.allowedIpsAhmed || ['127.0.0.1', '::1']).join(', ')}</textarea>
                </div>
              </div>

              <button type="submit" class="w-full bg-purple-700 hover:bg-purple-800 text-white font-bold py-2.5 rounded-xl text-xs flex items-center justify-center gap-2 transition shadow-sm">
                <i class="fa-solid fa-floppy-disk"></i>
                <span>حفظ إعدادات قيود الـ IP وعناوين الأمان</span>
              </button>
            </form>
          </div>
        ` : `
          <!-- Partner Admin (Ahmed Gharib) View -->
          <div class="admin-card p-5 border-2 border-slate-200 bg-slate-50/70">
            <div class="flex items-center gap-3 mb-4">
              <div class="w-10 h-10 rounded-xl bg-slate-200 text-slate-700 flex items-center justify-center text-lg">
                <i class="fa-solid fa-user-shield"></i>
              </div>
              <div>
                <div class="flex items-center gap-2">
                  <h3 class="font-extrabold text-sm text-slate-800">تقييد عناوين الـ IP وعناوين الأمان</h3>
                  <span class="bg-amber-100 text-amber-800 text-[10px] font-black px-2 py-0.5 rounded-full">محمي للمالك الرئيسي 🔒</span>
                </div>
                <p class="text-xs text-slate-500">حماية فائقة تحت الإدارة الحصرية للمالك محمد حكيم</p>
              </div>
            </div>

            <div class="p-4 rounded-xl bg-white border border-slate-200 text-xs text-slate-700 leading-relaxed space-y-2">
              <div class="font-bold flex items-center gap-2 text-slate-800">
                <i class="fa-solid fa-circle-check text-emerald-600"></i>
                <span>حسابك: شريك ومدير في لوحة التحكم (Ahmed Gharib)</span>
              </div>
              <p class="text-slate-500">
                بصفتك شريكاً ومديراً، تتمتع بكافة الصلاحيات التشغيلية والإدارية الكاملة للمتجر (إدارة المنتجات، الطلبات، الكوبونات، الموظفين، البانرات، التقارير المالية والإحصائيات)، بينما يقتصر قسم تقييد الـ IP على المالك الرئيسي (محمد حكيم).
              </p>
            </div>
          </div>
        `}

        <!-- Security Best Practices Checklist -->
        <div class="admin-card p-5 lg:col-span-2">
          <h3 class="font-extrabold text-sm text-slate-800 mb-3 flex items-center gap-2">
            <i class="fa-solid fa-shield-check text-emerald-600"></i>
            <span>قائمة التدقيق الأمني الفعالة في سوقي ستور</span>
          </h3>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
            <div class="flex items-start gap-2.5 p-3 rounded-xl bg-emerald-50/60 border border-emerald-100 text-emerald-900">
              <i class="fa-solid fa-circle-check text-emerald-600 mt-0.5"></i>
              <div>
                <strong class="block">حماية Brute Force Lockout:</strong>
                قفل فوري مؤقت لمدة 15 دقيقة بعد 5 محاولات كلمة مرور خاطئة.
              </div>
            </div>

            <div class="flex items-start gap-2.5 p-3 rounded-xl bg-emerald-50/60 border border-emerald-100 text-emerald-900">
              <i class="fa-solid fa-circle-check text-emerald-600 mt-0.5"></i>
              <div>
                <strong class="block">المصادقة الثنائية (2FA TOTP):</strong>
                دعم قياسي لتطبيقات Google Authenticator & Authy مع 8 أكواد استرداد.
              </div>
            </div>

            <div class="flex items-start gap-2.5 p-3 rounded-xl bg-emerald-50/60 border border-emerald-100 text-emerald-900">
              <i class="fa-solid fa-circle-check text-emerald-600 mt-0.5"></i>
              <div>
                <strong class="block">تشفير كلمات المرور (bcrypt salt 12):</strong>
                مع فحص قوة كلمة المرور وحظر الكلمات الشائعة وقواميس التخمين.
              </div>
            </div>

            <div class="flex items-start gap-2.5 p-3 rounded-xl bg-emerald-50/60 border border-emerald-100 text-emerald-900">
              <i class="fa-solid fa-circle-check text-emerald-600 mt-0.5"></i>
              <div>
                <strong class="block">تأمين الجلسات (HttpOnly + Secure Cookies):</strong>
                حماية التوكن من سرقة JavaScript عبر ثغرات XSS.
              </div>
            </div>

            <div class="flex items-start gap-2.5 p-3 rounded-xl bg-emerald-50/60 border border-emerald-100 text-emerald-900">
              <i class="fa-solid fa-circle-check text-emerald-600 mt-0.5"></i>
              <div>
                <strong class="block">حماية الـ Headers عبر Helmet:</strong>
                تفعيل CSP وسياسات X-Frame-Options و XSS-Protection و HSTS.
              </div>
            </div>

            <div class="flex items-start gap-2.5 p-3 rounded-xl bg-emerald-50/60 border border-emerald-100 text-emerald-900">
              <i class="fa-solid fa-circle-check text-emerald-600 mt-0.5"></i>
              <div>
                <strong class="block">حماية الملفات ومجلد الرفع (Uploads):</strong>
                منع الوصول لملفات .env و .json وتوليد أسماء عشوائية للملفات المرفوعة.
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  },

  translateReason(reason) {
    const map = {
      'LOGIN_SUCCESS': 'تسجيل دخول ناجح بكلمة المرور',
      '2FA_TOTP': 'تسجيل دخول ناجح برمز 2FA Authenticator',
      '2FA_BACKUP_CODE': 'تسجيل دخول ناجح بكود الاسترداد الاحتياطي',
      'INVALID_PASSWORD': 'كلمة مرور غير صحيحة',
      'USER_NOT_FOUND': 'حساب غير موجود',
      'ACCOUNT_LOCKED': 'حساب مقفل مؤقتاً لتكرار الفشل',
      'INVALID_2FA_CODE': 'رمز 2FA غير صحيح',
      'ACCOUNT_REGISTRATION': 'إنشاء حساب جديد وتأكيده بـ OTP'
    };
    return map[reason] || reason || '-';
  },

  switchTab(tab) {
    this.activeTab = tab;
    this.renderContent();
  },

  async changeLoginFilter(status) {
    this.loginFilter = status;
    try {
      const res = await API.get('/admin/security/login-logs', {
        status: this.loginFilter === 'all' ? undefined : this.loginFilter
      });
      this.loginLogs = res.logs || [];
      this.renderContent();
    } catch (err) {
      App.showToast('فشل تحديث سجلات الدخول', 'error');
    }
  },

  async changeAuditTimeRange(timeRange) {
    this.auditTimeRange = timeRange;
    try {
      const res = await API.get('/admin/audit-logs', { timeRange: this.auditTimeRange });
      this.auditLogs = res.logs || [];
      this.renderContent();
    } catch (err) {
      App.showToast('فشل تحديث سجل التدقيق', 'error');
    }
  },

  promptLogoutAll() {
    App.openModal('تأكيد إلغاء كافة الجلسات النشطة', `
      <div class="text-center p-2">
        <div class="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-3 text-2xl">
          <i class="fa-solid fa-triangle-exclamation"></i>
        </div>
        <h4 class="font-extrabold text-base text-slate-800 mb-2">هل أنت متأكد من تسجيل الخروج من كل الأجهزة؟</h4>
        <p class="text-xs text-slate-500 mb-5 leading-relaxed">
          سيتم فوراً إبطال مفعول كافة الرموز (Tokens) المسجلة لجهازك وأي أجهزة أخرى قمت بالدخول منها، وسيتعين عليك تسجيل الدخول مجدداً.
        </p>

        <div class="flex items-center gap-3">
          <button onclick="SecurityAdmin.executeLogoutAll()" class="flex-1 bg-red-600 hover:bg-red-700 text-white font-bold py-3 rounded-xl text-xs transition">
            نعم، إلغاء كافة الجلسات
          </button>
          <button onclick="App.closeModal()" class="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-3 rounded-xl text-xs transition">
            إلغاء
          </button>
        </div>
      </div>
    `);
  },

  async executeLogoutAll() {
    try {
      const res = await API.post('/auth/logout-all');
      App.closeModal();
      App.showToast(res.message || 'تم إبطال جميع الجلسات بنجاح', 'success');
      setTimeout(() => {
        State.logout();
        window.location.hash = '#/';
      }, 1000);
    } catch (err) {
      App.showToast(err.message, 'error');
    }
  },

  toggleIpInputs(checked) {
    const container = document.getElementById('sec-ip-inputs-container');
    if (container) {
      if (checked) {
        container.classList.remove('opacity-50');
      } else {
        container.classList.add('opacity-50');
      }
    }
  },

  addCurrentIpToHakim(ip) {
    const textarea = document.getElementById('sec-ips-hakim');
    if (!textarea || !ip) return;
    const currentList = textarea.value.split(',').map(s => s.trim()).filter(Boolean);
    if (!currentList.includes(ip)) {
      currentList.push(ip);
      textarea.value = currentList.join(', ');
      App.showToast(`تمت إضافة IP (${ip}) إلى قائمتك`, 'success');
    } else {
      App.showToast(`العنوان (${ip}) موجود بالفعل في قائمتك`, 'info');
    }
  },

  async saveIpWhitelist(e) {
    if (e && e.preventDefault) e.preventDefault();
    const toggle = document.getElementById('sec-ip-restriction-toggle');
    const hakimText = document.getElementById('sec-ips-hakim')?.value || '';
    const ahmedText = document.getElementById('sec-ips-ahmed')?.value || '';

    const ipRestrictionEnabled = toggle ? toggle.checked : false;
    const allowedIpsHakim = hakimText.split(',').map(s => s.trim()).filter(Boolean);
    const allowedIpsAhmed = ahmedText.split(',').map(s => s.trim()).filter(Boolean);

    try {
      const res = await API.put('/admin/security/ip-whitelist', {
        ipRestrictionEnabled,
        allowedIpsHakim,
        allowedIpsAhmed
      });

      if (res.success) {
        App.showToast(res.message, 'success');
        this.render();
      }
    } catch (err) {
      App.showToast(err.message || 'فشل تحديث إعدادات الأمان', 'error');
    }
  },

  async toggleMaintenanceMode() {
    try {
      const res = await API.post('/admin/maintenance/toggle');
      if (res.success) {
        this.maintenanceMode = Boolean(res.maintenanceMode);
        App.showToast(res.message, res.maintenanceMode ? 'warning' : 'success');
        this.render();
      } else {
        App.showToast(res.message || 'فشل تغيير حالة وضع الصيانة', 'error');
      }
    } catch (err) {
      console.error('Toggle maintenance error:', err);
      App.showToast(err.message || 'حدث خطأ أثناء تغيير وضع الصيانة', 'error');
    }
  }
};
