/**
 * Employees, working hours and payroll (monthly + hourly staff).
 */
const EmployeesAdmin = {
  tab: 'list',
  period: '',
  day: '',
  employees: [],
  canWrite: false,

  esc(s) { return String(s === undefined || s === null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); },
  m(n) { return `${(Number(n) || 0).toLocaleString('ar-EG')} ج.م`; },
  today() { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo' }).format(new Date()); },

  async render(tab) {
    if (tab) this.tab = tab;
    if (!this.period) this.period = this.today().slice(0, 7);
    if (!this.day) this.day = this.today();
    AdminLayout.render('employees', `<div class="py-12 text-center text-slate-400"><i class="fa-solid fa-spinner fa-spin text-3xl mb-3 text-emerald-600"></i><div>جاري التحميل...</div></div>`);
    try {
      const res = await API.get('/employees', { period: this.period });
      this.employees = res.employees || [];
      this.canWrite = res.canWrite;
      let extra = {};
      if (this.tab === 'attendance') extra = await API.get('/employees/attendance/list', { date: this.day });
      if (this.tab === 'adjustments') extra = await API.get('/employees/adjustments/list', { period: this.period });
      if (this.tab === 'payroll') extra = { preview: await API.get('/employees/payroll/preview', { period: this.period }), runs: (await API.get('/employees/payroll/runs')).runs };
      if (this.tab === 'activity') extra = await API.get('/employees/staff-activity', { period: this.period });
      this.extra = extra;
      this.renderView();
    } catch (err) {
      AdminLayout.render('employees', `<div class="p-8 text-center text-rose-600">${this.esc(err.message)}</div>`);
    }
  },

  renderView() {
    const tabs = [['list', 'الموظفين', 'fa-users'], ['activity', 'نشاط الموظفين (ساعات وحركات)', 'fa-chart-line'], ['attendance', 'الحضور والساعات', 'fa-clock'], ['adjustments', 'مكافآت وخصومات وسلف', 'fa-hand-holding-dollar'], ['payroll', 'صرف المرتبات', 'fa-money-check-dollar']];
    const body = { list: () => this.renderList(), activity: () => this.renderActivity(), attendance: () => this.renderAttendance(), adjustments: () => this.renderAdjustments(), payroll: () => this.renderPayroll() }[this.tab]();
    AdminLayout.render('employees', `
      <div class="space-y-4 text-right" dir="rtl">
        <div class="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 class="text-2xl font-black text-slate-900"><i class="fa-solid fa-user-clock text-emerald-600"></i> الموظفين والمرتبات</h1>
            <p class="text-xs text-slate-500 mt-1">موظفين بمرتب شهري أو بالساعة، تسجيل الحضور، المكافآت والسلف، وصرف المرتبات كمصروف على المتجر</p>
          </div>
          <div class="flex items-center gap-2 text-xs font-bold flex-wrap">
            ${ExportKit.buttons('#employees-body', `الموظفين والمرتبات ${this.period}`)}
            <span>الشهر:</span>
            <input type="month" value="${this.period}" class="form-control text-xs w-auto" onchange="EmployeesAdmin.period=this.value; EmployeesAdmin.render()" />
          </div>
        </div>
        <div class="flex gap-2 flex-wrap">
          ${tabs.map(([k, l, i]) => `<button onclick="EmployeesAdmin.render('${k}')" class="px-4 py-2 rounded-xl text-xs font-bold ${this.tab === k ? 'bg-emerald-600 text-white' : 'bg-white border border-slate-200 text-slate-700'}"><i class="fa-solid ${i}"></i> ${l}</button>`).join('')}
        </div>
        <div id="employees-body">${body}</div>
      </div>`);
  },

  // ---------------- list ----------------
  renderList() {
    return `
      <div class="admin-card">
        <div class="admin-card-header flex justify-between items-center">
          <h3 class="font-extrabold text-sm">الموظفين (${this.employees.length})</h3>
          ${this.canWrite ? `<button onclick="EmployeesAdmin.openForm()" class="bg-emerald-600 text-white px-4 py-2 rounded-xl text-xs font-bold"><i class="fa-solid fa-plus"></i> موظف جديد</button>` : ''}
        </div>
        <div class="admin-table-container">
          <table class="admin-table">
            <thead><tr><th>الموظف</th><th>نوع المرتب</th><th>المرتب / سعر الساعة</th><th>ساعات الشهر</th><th>مستحق الشهر (لحد دلوقتي)</th><th>الحالة</th><th></th></tr></thead>
            <tbody>
              ${this.employees.length === 0 ? '<tr><td colspan="7" class="text-center py-8 text-slate-400">لسه مفيش موظفين</td></tr>' : this.employees.map(e => `
                <tr>
                  <td><div class="font-bold text-xs">${this.esc(e.name)} ${e.needsSetup ? '<span class="text-[10px] bg-amber-100 text-amber-800 rounded px-1.5">حدّد المرتب</span>' : ''}</div><div class="text-[10px] text-slate-400">${this.esc(e.code)} • ${this.esc(e.jobTitle || '')} ${e.phone ? '• ' + this.esc(e.phone) : ''}${e.linkedAccount ? ` • <i class="fa-solid fa-link"></i> ${this.esc(e.linkedAccount.email)}` : ''}</div></td>
                  <td class="text-xs"><span class="px-2 py-0.5 rounded font-bold ${e.payType === 'hourly' ? 'bg-blue-50 text-blue-700' : 'bg-emerald-50 text-emerald-700'}">${this.esc(e.payTypeLabel)}</span></td>
                  <td class="text-xs font-bold">${e.payType === 'hourly' ? `${this.m(e.hourlyRate)} / ساعة` : `${this.m(e.monthlySalary)} / شهر`}</td>
                  <td class="text-xs">${e.month.hours} ساعة (${e.month.daysWorked} يوم)</td>
                  <td class="text-xs font-black">${this.m(e.month.net)}${e.month.advances ? `<div class="text-[10px] text-amber-700 font-semibold">بعد سلف ${this.m(e.month.advances)}</div>` : ''}${e.month.proration ? `<div class="text-[10px] text-slate-400">${this.esc(e.month.proration)}</div>` : ''}</td>
                  <td class="text-xs">${e.isActive !== false ? '<span class="text-emerald-700 font-bold">شغال</span>' : '<span class="text-slate-400 font-bold">مش شغال</span>'}</td>
                  <td class="text-xs whitespace-nowrap">
                    <button onclick="EmployeesAdmin.statement('${e.id}')" class="text-blue-700 font-bold hover:underline">كشف حساب</button>
                    ${this.canWrite ? ` • <button onclick="EmployeesAdmin.openForm('${e.id}')" class="text-slate-700 font-bold hover:underline">تعديل</button>` : ''}
                  </td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>`;
  },

  // ---------------- staff activity (accountant view) ----------------
  hrs(h) {
    const v = Number(h) || 0;
    const H = Math.floor(v), M = Math.round((v - H) * 60);
    return v === 0 ? '0' : `${H ? H + ' س' : ''}${H && M ? ' و ' : ''}${M ? M + ' د' : ''}`;
  },

  renderActivity() {
    const rows = (this.extra && this.extra.staff) || [];
    const MOD = { orders: 'الطلبات', products: 'المنتجات', accounting: 'المحاسبة', employees: 'الموظفين', coupons: 'الكوبونات', reviews: 'التقييمات', customers: 'العملاء', exports: 'التصدير', auth: 'الدخول', categories: 'الأقسام', banners: 'البانرات' };
    return `
      <div class="admin-card">
        <div class="admin-card-header"><h3 class="font-extrabold text-sm">كل حسابات لوحة التحكم — بتظهر هنا لوحدها أول ما تضيف موظف وتديله صلاحيات</h3></div>
        <div class="admin-table-container">
          <table class="admin-table">
            <thead><tr><th>الموظف</th><th>الحالة</th><th>ساعات فعلية النهارده</th><th>آخر 7 أيام</th><th>الشهر</th><th>حركات النهارده</th><th>الأسبوع</th><th>الشهر</th><th>المرتب</th><th></th></tr></thead>
            <tbody>
              ${rows.length === 0 ? '<tr><td colspan="10" class="text-center py-8 text-slate-400">مفيش حسابات موظفين</td></tr>' : rows.map(s => `
                <tr>
                  <td><div class="font-bold text-xs">${this.esc(s.name)}</div><div class="text-[10px] text-slate-400">${this.esc(s.roleLabel)} • ${this.esc(s.email)}</div></td>
                  <td class="text-xs">${s.online ? '<span class="text-emerald-700 font-bold">🟢 أونلاين دلوقتي</span>' : `<span class="text-slate-400">⚪ ${s.lastSeen ? 'آخر ظهور ' + new Date(s.lastSeen).toLocaleString('ar-EG') : 'لسه ما دخلش'}</span>`}${s.isActive ? '' : '<div class="text-rose-600 text-[10px] font-bold">الحساب موقوف</div>'}</td>
                  <td class="text-xs font-black">${this.hrs(s.hours.today)}</td>
                  <td class="text-xs">${this.hrs(s.hours.week)}</td>
                  <td class="text-xs font-bold">${this.hrs(s.hours.month)}</td>
                  <td class="text-xs font-black">${s.actions.today}</td>
                  <td class="text-xs">${s.actions.week}</td>
                  <td class="text-xs font-bold">${s.actions.month}</td>
                  <td class="text-xs">${s.employee ? (s.employee.needsSetup ? `<button onclick="EmployeesAdmin.openForm('${s.employee.id}')" class="text-amber-700 font-bold hover:underline">حدّد المرتب</button>` : '<span class="text-emerald-700">متسجل</span>') : '—'}</td>
                  <td class="text-xs"><button onclick="EmployeesAdmin.activityDetails('${s.userId}')" class="text-blue-700 font-bold hover:underline">التفاصيل</button></td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
        <p class="p-3 text-[10.5px] text-slate-400">الساعات = الوقت اللي الموظف كان فاتح فيه لوحة التحكم فعلاً (العداد بيقف لما يقفل الصفحة أو يسيبها في الخلفية). الحركات = أي إضافة أو تعديل أو حذف أو تغيير حالة عمله.</p>
      </div>`;
  },

  activityDetails(userId) {
    const s = ((this.extra && this.extra.staff) || []).find(x => x.userId === userId);
    if (!s) return;
    const MOD = { orders: 'الطلبات', products: 'المنتجات', accounting: 'المحاسبة', employees: 'الموظفين', coupons: 'الكوبونات', reviews: 'التقييمات', customers: 'العملاء', exports: 'التصدير', auth: 'الدخول', categories: 'الأقسام', banners: 'البانرات' };
    App.openModal(`نشاط ${s.name}`, `
      <div class="text-right text-xs space-y-3">
        <div class="grid grid-cols-3 gap-2 font-bold">
          <div class="bg-slate-50 rounded-xl p-2">ساعات الشهر<div class="text-base font-black">${this.hrs(s.hours.month)}</div></div>
          <div class="bg-slate-50 rounded-xl p-2">حركات الشهر<div class="text-base font-black">${s.actions.month}</div></div>
          <div class="bg-slate-50 rounded-xl p-2">الصلاحيات<div class="text-[10px] font-semibold">${s.permissions.length ? s.permissions.length + ' صلاحية' : (s.role === 'super_admin' ? 'كل الصلاحيات' : '—')}</div></div>
        </div>
        <div><b>الحركات حسب القسم (الشهر):</b> ${Object.entries(s.actions.byModule).map(([m, n]) => `<span class="inline-block bg-slate-100 rounded px-2 py-0.5 m-0.5">${this.esc(MOD[m] || m)}: ${n}</span>`).join('') || '—'}</div>
        <div><b>آخر الحركات:</b>${s.recent.map(r => `<div class="border-b py-1"><span class="text-slate-400">${new Date(r.at).toLocaleString('ar-EG')}</span> — ${this.esc(r.details)}</div>`).join('') || '<div class="text-slate-400">مفيش حركات</div>'}</div>
      </div>`);
  },

  async onlineToAttendance(empId) {
    try { const r = await API.post('/employees/attendance/from-online', { employeeId: empId, date: this.day }); App.showToast(r.message, 'success'); this.render('attendance'); }
    catch (err) { App.showToast(err.message, 'error'); }
  },

  openForm(id) {
    const e = id ? this.employees.find(x => x.id === id) : { payType: 'monthly', startDate: this.today() };
    App.openModal(id ? `تعديل ${e.name}` : 'موظف جديد', `
      <form onsubmit="EmployeesAdmin.saveForm(event, '${id || ''}')" class="text-right text-xs space-y-2">
        <div class="grid grid-cols-2 gap-2">
          <div><label class="form-label font-bold">الاسم *</label><input id="emp-name" class="form-control text-xs" value="${this.esc(e.name || '')}" required /></div>
          <div><label class="form-label font-bold">الوظيفة</label><input id="emp-job" class="form-control text-xs" value="${this.esc(e.jobTitle || '')}" placeholder="مثال: تغليف، خدمة عملاء" /></div>
          <div><label class="form-label font-bold">التليفون</label><input id="emp-phone" class="form-control text-xs" value="${this.esc(e.phone || '')}" /></div>
          <div><label class="form-label font-bold">نوع المرتب *</label>
            <select id="emp-type" class="form-control text-xs" onchange="document.getElementById('emp-monthly-box').classList.toggle('hidden', this.value!=='monthly'); document.getElementById('emp-hourly-box').classList.toggle('hidden', this.value!=='hourly')">
              <option value="monthly" ${e.payType === 'monthly' ? 'selected' : ''}>شهري ثابت</option>
              <option value="hourly" ${e.payType === 'hourly' ? 'selected' : ''}>بالساعة</option>
            </select></div>
          <div id="emp-monthly-box" class="${e.payType === 'monthly' ? '' : 'hidden'}"><label class="form-label font-bold">المرتب الشهري</label><input id="emp-salary" type="number" min="0" step="0.01" class="form-control text-xs" value="${e.monthlySalary ?? ''}" /></div>
          <div id="emp-hourly-box" class="${e.payType === 'hourly' ? '' : 'hidden'}"><label class="form-label font-bold">سعر الساعة</label><input id="emp-rate" type="number" min="0" step="0.01" class="form-control text-xs" value="${e.hourlyRate ?? ''}" /></div>
          <div><label class="form-label font-bold">تاريخ التعيين</label><input id="emp-start" type="date" class="form-control text-xs" value="${e.startDate || ''}" /></div>
          <div><label class="form-label font-bold">آخر يوم شغل (لو ساب)</label><input id="emp-end" type="date" class="form-control text-xs" value="${e.endDate || ''}" /></div>
        </div>
        <div><label class="form-label font-bold">ملاحظات</label><input id="emp-notes" class="form-control text-xs" value="${this.esc(e.notes || '')}" /></div>
        ${id ? `<label class="flex items-center gap-2 font-bold"><input id="emp-active" type="checkbox" ${e.isActive !== false ? 'checked' : ''} class="w-4 h-4 accent-emerald-600" /> شغال حالياً</label>` : ''}
        <p class="text-[10.5px] text-slate-400">المرتب الشهري بيتحسب بالأيام لو اتعيّن أو ساب في نص الشهر. اللي بالساعة بيتحسب من الحضور المسجّل.</p>
        <button class="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 rounded-xl">حفظ</button>
      </form>`);
  },

  async saveForm(ev, id) {
    ev.preventDefault();
    const v = k => (document.getElementById(k) || {}).value;
    const body = { name: v('emp-name'), jobTitle: v('emp-job'), phone: v('emp-phone'), payType: v('emp-type'), startDate: v('emp-start') || null, endDate: v('emp-end') || null, notes: v('emp-notes') };
    if (body.payType === 'monthly') body.monthlySalary = v('emp-salary'); else body.hourlyRate = v('emp-rate');
    const active = document.getElementById('emp-active');
    if (active) body.isActive = active.checked;
    try {
      const r = id ? await API.put(`/employees/${id}`, body) : await API.post('/employees', body);
      App.closeModal(); App.showToast(r.message, 'success'); this.render('list');
    } catch (err) { App.showToast(err.message, 'error'); }
  },

  async statement(id) {
    try {
      const r = await API.get(`/employees/${id}/statement`);
      const e = r.employee;
      App.openModal(`كشف حساب: ${e.name}`, `
        <div class="text-right text-xs space-y-3">
          <div class="bg-slate-50 rounded-xl p-3">${this.esc(e.code)} • ${this.esc(e.payTypeLabel)} • ${e.payType === 'hourly' ? this.m(e.hourlyRate) + ' / ساعة' : this.m(e.monthlySalary) + ' / شهر'} • من ${this.esc(e.startDate || '—')}</div>
          <table class="w-full text-xs"><thead><tr class="text-slate-500"><th class="text-right p-1">الشهر</th><th class="p-1">ساعات</th><th class="p-1">الأساسي</th><th class="p-1">+ مكافآت</th><th class="p-1">− خصومات</th><th class="p-1">− سلف</th><th class="p-1">الصافي</th><th class="p-1">الحالة</th></tr></thead>
            <tbody>${r.months.map(mo => `<tr class="border-t"><td class="p-1 font-mono">${mo.period}</td><td class="p-1 text-center">${mo.line.hours}</td><td class="p-1 text-center">${this.m(mo.line.base)}</td><td class="p-1 text-center">${this.m(mo.line.bonuses)}</td><td class="p-1 text-center">${this.m(mo.line.deductions)}</td><td class="p-1 text-center">${this.m(mo.line.advances)}</td><td class="p-1 text-center font-black">${this.m(mo.line.net)}</td><td class="p-1 text-center">${mo.paid ? '<span class="text-emerald-700 font-bold">اتصرف</span>' : '<span class="text-slate-400">لسه</span>'}</td></tr>`).join('')}</tbody></table>
          ${r.adjustments.length ? `<div><b>المكافآت والخصومات والسلف:</b>${r.adjustments.slice(0, 20).map(a => `<div class="border-b py-1">${this.esc(a.date)} • ${this.esc(a.typeLabel)} ${this.m(a.amount)} (مرتب ${this.esc(a.period)}) ${this.esc(a.note || '')}</div>`).join('')}</div>` : ''}
        </div>`);
    } catch (err) { App.showToast(err.message, 'error'); }
  },

  // ---------------- attendance ----------------
  renderAttendance() {
    const rows = (this.extra && this.extra.attendance) || [];
    const active = this.employees.filter(e => e.isActive !== false);
    return `
      <div class="admin-card p-4">
        <div class="flex items-center gap-2 flex-wrap mb-3 text-xs font-bold">
          <span>اليوم:</span>
          <input type="date" value="${this.day}" max="${this.today()}" class="form-control text-xs w-auto" onchange="EmployeesAdmin.day=this.value; EmployeesAdmin.render('attendance')" />
          <span class="text-slate-400 font-normal">سجّل حضور وانصراف كل موظف (أو عدد الساعات بس). الوردية بعد نص الليل بتتحسب صح.</span>
        </div>
        <div class="admin-table-container">
          <table class="admin-table">
            <thead><tr><th>الموظف</th><th>حضور</th><th>انصراف</th><th>أو ساعات</th><th>ملاحظة</th><th>المسجّل</th><th></th></tr></thead>
            <tbody>
              ${active.length === 0 ? '<tr><td colspan="7" class="text-center py-8 text-slate-400">ضيف موظفين الأول</td></tr>' : active.map(e => {
                const a = rows.find(x => x.employeeId === e.id) || {};
                return `
                <tr>
                  <td class="text-xs font-bold">${this.esc(e.name)}<div class="text-[10px] text-slate-400">${this.esc(e.payTypeLabel)}</div></td>
                  <td><input id="in-${e.id}" type="time" class="form-control text-xs w-28" value="${a.checkIn || ''}" ${this.canWrite ? '' : 'disabled'} /></td>
                  <td><input id="out-${e.id}" type="time" class="form-control text-xs w-28" value="${a.checkOut || ''}" ${this.canWrite ? '' : 'disabled'} /></td>
                  <td><input id="hrs-${e.id}" type="number" min="0" max="24" step="0.25" class="form-control text-xs w-20" value="${a.checkIn ? '' : (a.hours ?? '')}" placeholder="${a.hours ?? ''}" ${this.canWrite ? '' : 'disabled'} /></td>
                  <td><input id="note-${e.id}" class="form-control text-xs" value="${this.esc(a.note || '')}" ${this.canWrite ? '' : 'disabled'} /></td>
                  <td class="text-xs">${a.hours !== undefined ? `<b>${a.hours} ساعة</b>` : '<span class="text-slate-300">—</span>'}${e.onlineByDay && e.onlineByDay[this.day] ? `<div class="text-[10px] text-blue-700">أونلاين فعلي: ${e.onlineByDay[this.day]} س</div>` : ''}</td>
                  <td class="text-xs whitespace-nowrap">${this.canWrite ? `<button onclick="EmployeesAdmin.saveDay('${e.id}')" class="bg-emerald-600 text-white px-3 py-1 rounded-lg font-bold">حفظ</button>${e.onlineByDay && e.onlineByDay[this.day] ? ` <button onclick="EmployeesAdmin.onlineToAttendance('${e.id}')" class="text-blue-700 font-bold" title="سجّل ساعات الاتصال الفعلي كحضور">اعتماد الأونلاين</button>` : ''}${a.id ? ` <button onclick="EmployeesAdmin.deleteDay('${a.id}')" class="text-rose-600 font-bold">مسح</button>` : ''}` : ''}</td>
                </tr>`; }).join('')}
            </tbody>
          </table>
        </div>
      </div>`;
  },

  async saveDay(empId) {
    const v = k => (document.getElementById(`${k}-${empId}`) || {}).value;
    const body = { employeeId: empId, date: this.day, note: v('note') };
    if (v('in') || v('out')) { body.checkIn = v('in'); body.checkOut = v('out'); } else body.hours = v('hrs');
    try { const r = await API.put('/employees/attendance', body); App.showToast(r.message, 'success'); this.render('attendance'); }
    catch (err) { App.showToast(err.message, 'error'); }
  },

  async deleteDay(id) {
    try { const r = await API.delete(`/employees/attendance/${id}`); App.showToast(r.message, 'success'); this.render('attendance'); }
    catch (err) { App.showToast(err.message, 'error'); }
  },

  // ---------------- adjustments ----------------
  renderAdjustments() {
    const rows = (this.extra && this.extra.adjustments) || [];
    const active = this.employees.filter(e => e.isActive !== false);
    return `
      <div class="admin-card p-4">
        ${this.canWrite ? `
        <div class="grid grid-cols-2 lg:grid-cols-6 gap-2 items-end mb-4 text-xs">
          <div class="col-span-2"><label class="form-label font-bold">الموظف</label><select id="adj-emp" class="form-control text-xs">${active.map(e => `<option value="${e.id}">${this.esc(e.name)}</option>`).join('')}</select></div>
          <div><label class="form-label font-bold">النوع</label><select id="adj-type" class="form-control text-xs"><option value="bonus">مكافأة (+)</option><option value="deduction">خصم (−)</option><option value="advance">سلفة (بتتخصم من المرتب)</option></select></div>
          <div><label class="form-label font-bold">المبلغ</label><input id="adj-amount" type="number" min="0" step="0.01" class="form-control text-xs" /></div>
          <div><label class="form-label font-bold">على مرتب شهر</label><input id="adj-period" type="month" value="${this.period}" class="form-control text-xs" /></div>
          <div><label class="form-label font-bold">ملاحظة</label><input id="adj-note" class="form-control text-xs" /></div>
          <div class="col-span-2 lg:col-span-6"><button onclick="EmployeesAdmin.addAdjustment()" class="bg-emerald-600 text-white px-5 py-2 rounded-xl font-bold">تسجيل</button></div>
        </div>` : ''}
        <div class="admin-table-container">
          <table class="admin-table">
            <thead><tr><th>التاريخ</th><th>الموظف</th><th>النوع</th><th>المبلغ</th><th>على مرتب</th><th>ملاحظة</th><th>الحالة</th><th></th></tr></thead>
            <tbody>
              ${rows.length === 0 ? `<tr><td colspan="8" class="text-center py-6 text-slate-400">مفيش حاجة متسجلة على مرتبات ${this.period}</td></tr>` : rows.map(a => `
                <tr><td class="text-xs">${this.esc(a.date)}</td><td class="text-xs font-bold">${this.esc(a.employeeName)}</td>
                <td class="text-xs"><span class="font-bold ${a.type === 'bonus' ? 'text-emerald-700' : a.type === 'deduction' ? 'text-rose-700' : 'text-amber-700'}">${this.esc(a.typeLabel)}</span></td>
                <td class="text-xs font-black">${this.m(a.amount)}</td><td class="text-xs font-mono">${this.esc(a.period)}</td><td class="text-xs text-slate-500">${this.esc(a.note || '')}</td>
                <td class="text-xs">${a.payrollRunId ? '<span class="text-emerald-700">اتحسب في المرتب</span>' : '<span class="text-slate-400">لسه</span>'}</td>
                <td class="text-xs">${this.canWrite && !a.payrollRunId ? `<button onclick="EmployeesAdmin.deleteAdjustment('${a.id}')" class="text-rose-600 font-bold">مسح</button>` : ''}</td></tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>`;
  },

  async addAdjustment() {
    const v = k => (document.getElementById(k) || {}).value;
    try {
      const r = await API.post('/employees/adjustments', { employeeId: v('adj-emp'), type: v('adj-type'), amount: v('adj-amount'), period: v('adj-period'), note: v('adj-note') });
      App.showToast(r.message, 'success'); this.render('adjustments');
    } catch (err) { App.showToast(err.message, 'error'); }
  },

  async deleteAdjustment(id) {
    try { const r = await API.delete(`/employees/adjustments/${id}`); App.showToast(r.message, 'success'); this.render('adjustments'); }
    catch (err) { App.showToast(err.message, 'error'); }
  },

  // ---------------- payroll ----------------
  renderPayroll() {
    const p = this.extra.preview || {};
    const posted = p.alreadyPosted;
    const lines = posted ? posted.lines : (p.lines || []);
    const t = posted ? posted.totals : (p.totals || {});
    return `
      <div class="admin-card p-4">
        <div class="flex items-center justify-between flex-wrap gap-2 mb-3">
          <div class="text-sm font-black">${posted ? `<span class="text-emerald-700"><i class="fa-solid fa-circle-check"></i> مرتبات ${this.esc(p.period)} اتصرفت</span> <span class="text-[11px] text-slate-400 font-bold">(${this.esc(posted.createdBy)} • ${new Date(posted.createdAt).toLocaleDateString('ar-EG')})</span>` : `معاينة مرتبات ${this.esc(p.period)} (لسه ما اتصرفتش)`}</div>
          ${this.canWrite ? (posted
            ? `<button onclick="EmployeesAdmin.cancelRun('${posted.id}')" class="bg-white border border-rose-300 text-rose-700 px-4 py-2 rounded-xl text-xs font-bold">إلغاء الصرف</button>`
            : `<button onclick="EmployeesAdmin.runPayroll()" ${lines.length ? '' : 'disabled'} class="bg-emerald-600 text-white px-4 py-2 rounded-xl text-xs font-bold ${lines.length ? '' : 'opacity-50'}"><i class="fa-solid fa-money-check-dollar"></i> صرف المرتبات وتسجيلها</button>`) : ''}
        </div>
        <div class="admin-table-container">
          <table class="admin-table">
            <thead><tr><th>الموظف</th><th>النوع</th><th>الساعات</th><th>الأساسي</th><th>+ مكافآت</th><th>− خصومات</th><th>= الإجمالي (مصروف)</th><th>− سلف</th><th>= يقبض</th></tr></thead>
            <tbody>
              ${lines.length === 0 ? '<tr><td colspan="9" class="text-center py-8 text-slate-400">مفيش مرتبات للشهر ده</td></tr>' : lines.map(l => `
                <tr><td class="text-xs font-bold">${this.esc(l.name)}${l.proration ? `<div class="text-[10px] text-slate-400">${this.esc(l.proration)}</div>` : ''}</td>
                <td class="text-xs">${this.esc(l.payTypeLabel)}</td><td class="text-xs">${l.payType === 'hourly' ? `${l.hours} × ${l.rate}` : `${l.daysWorked} يوم حضور`}</td>
                <td class="text-xs">${this.m(l.base)}</td><td class="text-xs text-emerald-700">${this.m(l.bonuses)}</td><td class="text-xs text-rose-700">${this.m(l.deductions)}</td>
                <td class="text-xs font-black">${this.m(l.gross)}</td><td class="text-xs text-amber-700">${this.m(l.advances)}</td><td class="text-xs font-black text-emerald-800">${this.m(l.net)}</td></tr>`).join('')}
              ${lines.length ? `<tr class="bg-slate-50 font-black"><td class="text-xs" colspan="3">الإجمالي</td><td class="text-xs">${this.m(t.base)}</td><td class="text-xs">${this.m(t.bonuses)}</td><td class="text-xs">${this.m(t.deductions)}</td><td class="text-xs">${this.m(t.gross)}</td><td class="text-xs">${this.m(t.advances)}</td><td class="text-xs">${this.m(t.net)}</td></tr>` : ''}
            </tbody>
          </table>
        </div>
        <p class="text-[10.5px] text-slate-400 mt-2">الصرف بيسجل "الإجمالي" مصروف على المتجر (تصنيف مرتبات) باسم كل موظف، فبيظهر في المحاسبة ودفتر الحركات وصافي الربح. السلفة بتتسجل لما تتدفع، وبتتخصم من اللي الموظف يقبضه. الإلغاء ممكن طول ما الشهر مفتوح.</p>
      </div>
      ${(this.extra.runs || []).length ? `
        <div class="admin-card p-4"><h3 class="font-extrabold text-sm mb-2">سجل الصرف</h3>
          ${this.extra.runs.map(r => `<div class="text-xs border-b py-1.5">${this.esc(r.period)} • ${r.status === 'posted' ? '<span class="text-emerald-700 font-bold">اتصرف</span>' : `<span class="text-slate-400">اتلغى (${this.esc(r.cancelReason || '')})</span>`} • إجمالي ${this.m(r.totals && r.totals.gross)} • ${this.esc(r.createdBy)}</div>`).join('')}
        </div>` : ''}`;
  },

  runPayroll() {
    App.confirm(`صرف مرتبات ${this.period}؟ هتتسجل مصروفات على المتجر باسم كل موظف.`, async () => {
      try { const r = await API.post('/employees/payroll/run', { period: this.period }); App.showToast(r.message, 'success'); this.render('payroll'); }
      catch (err) { App.showToast(err.message, 'error'); }
    });
  },

  cancelRun(id) {
    App.openModal('إلغاء صرف المرتبات', `
      <div class="text-right text-xs">
        <p class="mb-2 text-slate-600">هيتمسح المصروف بتاع كل موظف في الشهر ده، وتقدر تعدّل وتصرف تاني. السبب:</p>
        <input id="cancel-run-reason" class="form-control text-xs mb-3" />
        <button onclick="EmployeesAdmin.confirmCancel('${id}')" class="w-full bg-rose-600 text-white font-bold py-2.5 rounded-xl">إلغاء الصرف</button>
      </div>`);
  },

  async confirmCancel(id) {
    try { const r = await API.post(`/employees/payroll/${id}/cancel`, { reason: document.getElementById('cancel-run-reason').value }); App.closeModal(); App.showToast(r.message, 'success'); this.render('payroll'); }
    catch (err) { App.showToast(err.message, 'error'); }
  }
};
