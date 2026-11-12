const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const db = require('../database/db');
const { cairoDay } = require('../utils/ledger');
const {
  authenticate,
  requireSuperAdmin,
  requirePermission,
  isSuperAdmin,
  isPrimaryOwner
} = require('../middleware/auth');
const { logActivity } = require('../utils/activityLogger');
const { validatePasswordStrength, recordAuditLog, getClientIp } = require('../utils/security');
const { checkSuperAdminIp } = require('../middleware/security');

// ==========================================
// 1. DASHBOARD ANALYTICS & REPORTS (TIME FILTER, REVENUE PER PRODUCT, GOVERNORATES)
// ==========================================
router.get('/analytics', authenticate, async (req, res) => {
  try {
    // Merchants get their figures (at wholesale cost) from /accounting/merchant-portal, never store revenue
    if (req.user.role !== 'super_admin' && req.user.role !== 'staff') {
      return res.status(403).json({ success: false, message: 'غير مصرح بالدخول' });
    }

    const { timeRange = 'all' } = req.query; // '1d', '2d', '3d', '7d', '30d', '60d', '365d', 'all'
    let orders = await db.orders.getAll();
    let products = await db.products.getAll();
    const users = await db.users.getAll();

    // Scope for merchant
    if (req.user.role === 'merchant') {
      const mId = req.user.merchantId ? String(req.user.merchantId) : '';
      const mCode = (req.user.merchantCode || '').trim().toLowerCase();
      products = products.filter(p => 
        (p.merchantId && String(p.merchantId) === mId) ||
        (p.merchantCode && p.merchantCode.trim().toLowerCase() === mCode)
      );
      const myProductIds = new Set(products.map(p => String(p.id)));

      orders = orders.filter(o => 
        o.items && o.items.some(it => 
          (it.merchantCode && it.merchantCode.trim().toLowerCase() === mCode) ||
          (it.merchantId && String(it.merchantId) === mId) ||
          myProductIds.has(String(it.id || it.productId))
        )
      );
    }

    const customers = users.filter(u => u.role === 'customer');

    // Filter orders by timeRange
    const now = new Date();
    let filterDate = null;
    if (timeRange === '1d') filterDate = new Date(now.getTime() - 1 * 24 * 3600 * 1000);
    else if (timeRange === '2d') filterDate = new Date(now.getTime() - 2 * 24 * 3600 * 1000);
    else if (timeRange === '3d') filterDate = new Date(now.getTime() - 3 * 24 * 3600 * 1000);
    else if (timeRange === '7d') filterDate = new Date(now.getTime() - 7 * 24 * 3600 * 1000);
    else if (timeRange === '30d') filterDate = new Date(now.getTime() - 30 * 24 * 3600 * 1000);
    else if (timeRange === '60d') filterDate = new Date(now.getTime() - 60 * 24 * 3600 * 1000);
    else if (timeRange === '365d') filterDate = new Date(now.getTime() - 365 * 24 * 3600 * 1000);

    const filteredOrders = filterDate
      ? orders.filter(o => o.createdAt && new Date(o.createdAt) >= filterDate)
      : orders;

    // Total revenue from active orders in this range
    const totalRevenue = filteredOrders
      .filter(o => o.status !== 'cancelled')
      .reduce((acc, o) => acc + (Number(o.grandTotal) || 0), 0);

    // Status breakdown in range
    const statusCounts = {
      pending: filteredOrders.filter(o => o.status === 'pending').length,
      processing: filteredOrders.filter(o => o.status === 'processing').length,
      shipped: filteredOrders.filter(o => o.status === 'shipped').length,
      delivered: filteredOrders.filter(o => o.status === 'delivered').length,
      cancelled: filteredOrders.filter(o => o.status === 'cancelled').length
    };

    // Calculate Top Selling Products with Sales Count & Total Revenue
    const productSalesMap = {};
    // Seed with existing products
    products.forEach(p => {
      productSalesMap[p.id] = {
        id: p.id,
        title: p.title,
        price: p.price,
        image: Array.isArray(p.images) && p.images.length > 0 ? p.images[0] : '',
        stock: p.stock || 0,
        salesCount: 0,
        totalRevenue: 0
      };
    });

    filteredOrders.filter(o => o.status !== 'cancelled').forEach(order => {
      (order.items || []).forEach(item => {
        const pid = item.productId;
        if (!productSalesMap[pid]) {
          productSalesMap[pid] = {
            id: pid,
            title: item.title,
            price: item.price,
            image: item.image || '',
            stock: 0,
            salesCount: 0,
            totalRevenue: 0
          };
        }
        const qty = Number(item.quantity) || 1;
        const rev = Number(item.lineTotal) || ((Number(item.price) || 0) * qty);
        productSalesMap[pid].salesCount += qty;
        productSalesMap[pid].totalRevenue += rev;
      });
    });

    const topProducts = Object.values(productSalesMap)
      .filter(p => p.salesCount > 0)
      .sort((a, b) => b.salesCount - a.salesCount)
      .slice(0, 10);

    // Fallback if no filtered order sales yet: show product catalogue defaults
    if (topProducts.length === 0) {
      topProducts.push(...products.slice(0, 5).map(p => ({
        id: p.id,
        title: p.title,
        price: p.price,
        image: Array.isArray(p.images) && p.images.length > 0 ? p.images[0] : '',
        stock: p.stock || 0,
        salesCount: p.salesCount || 0,
        totalRevenue: (p.salesCount || 0) * (p.price || 0)
      })));
    }

    // Sales by Egyptian Governorates / Regions
    const governorateMap = {};
    filteredOrders.filter(o => o.status !== 'cancelled').forEach(order => {
      const gov = (order.shippingAddress?.governorate || order.shippingAddress?.city || 'القاهرة').trim();
      if (!governorateMap[gov]) {
        governorateMap[gov] = {
          governorate: gov,
          ordersCount: 0,
          totalRevenue: 0
        };
      }
      governorateMap[gov].ordersCount += 1;
      governorateMap[gov].totalRevenue += Number(order.grandTotal) || 0;
    });

    const governorateSales = Object.values(governorateMap).sort((a, b) => b.totalRevenue - a.totalRevenue);

    // Daily breakdown for the selected range (up to 7 periods)
    const salesChart = [];
    const daysToShow = timeRange === '1d' ? 1 : (timeRange === '2d' ? 2 : (timeRange === '3d' ? 3 : 7));
    for (let i = daysToShow - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      const dayName = d.toLocaleDateString('ar-EG', { weekday: 'short' });

      const dayOrders = filteredOrders.filter(o => {
        return o.createdAt && o.createdAt.startsWith(dateStr) && o.status !== 'cancelled';
      });

      const daySales = dayOrders.reduce((sum, o) => sum + (Number(o.grandTotal) || 0), 0);

      salesChart.push({
        date: dateStr,
        dayName,
        ordersCount: dayOrders.length,
        sales: daySales
      });
    }

    const settingsList = await db.settings.getAll();
    const settings = settingsList[0] || { lowStockThreshold: 15 };
    const threshold = Number(settings.lowStockThreshold) || 15;
    const lowStockCount = products.filter(p => (p.stock !== undefined ? p.stock : 0) <= threshold).length;

    res.json({
      success: true,
      timeRange,
      stats: {
        totalProducts: products.length,
        totalOrders: filteredOrders.length,
        newOrdersCount: filteredOrders.filter(o => o.status === 'pending').length,
        totalCustomers: customers.length,
        totalRevenue: Math.round(totalRevenue),
        averageOrderValue: filteredOrders.length > 0 ? Math.round(totalRevenue / filteredOrders.length) : 0,
        lowStockCount,
        lowStockThreshold: threshold
      },
      statusCounts,
      topProducts,
      governorateSales,
      salesChart,
      recentOrders: filteredOrders.slice(0, 8)
    });
  } catch (err) {
    console.error('Analytics error:', err);
    res.status(500).json({ success: false, message: 'فشل جلب الإحصائيات' });
  }
});

// ==========================================
// 2. CUSTOMER MANAGEMENT (SEARCH BY ID / NAME / PHONE, FULL EDIT, LOCK/UNLOCK)
// ==========================================

// List all customers
router.get('/customers', authenticate, requirePermission('canManageCustomers'), async (req, res) => {
  try {
    const { search, status } = req.query;
    let users = await db.users.find(u => u.role === 'customer');

    if (status === 'locked') {
      users = users.filter(u => u.isLocked === true);
    } else if (status === 'active') {
      users = users.filter(u => !u.isLocked);
    }

    if (search && search.trim()) {
      const q = search.trim().toLowerCase();
      users = users.filter(u => {
        const idMatch = (u.customerId || '').toLowerCase().includes(q) || (u.id || '').toLowerCase().includes(q);
        const nameMatch = (u.name || '').toLowerCase().includes(q);
        const emailMatch = (u.email || '').toLowerCase().includes(q);
        const phoneMatch = (u.phone || '').toLowerCase().includes(q) || (u.secondaryPhone || '').toLowerCase().includes(q) || (u.whatsappPhone || '').toLowerCase().includes(q);
        return idMatch || nameMatch || emailMatch || phoneMatch;
      });
    }

    // Attach order summary for each customer
    const allOrders = await db.orders.getAll();
    const enriched = users.map(user => {
      const { password, ...safeUser } = user;
      const userOrders = allOrders.filter(o => String(o.userId) === String(user.id));
      const totalSpent = userOrders
        .filter(o => o.status !== 'cancelled')
        .reduce((sum, o) => sum + (Number(o.grandTotal) || 0), 0);

      return {
        ...safeUser,
        customerId: user.customerId || `CUST-${user.id.substring(0, 5)}`,
        addresses: Array.isArray(user.addresses) ? user.addresses : (user.address ? [user.address] : []),
        secondaryPhone: user.secondaryPhone || '',
        whatsappPhone: user.whatsappPhone || '',
        ordersCount: userOrders.length,
        totalSpent: Math.round(totalSpent),
        lastOrderDate: userOrders.length > 0 ? userOrders[0].createdAt : null
      };
    });

    res.json({ success: true, count: enriched.length, customers: enriched });
  } catch (err) {
    res.status(500).json({ success: false, message: 'فشل جلب بيانات العملاء' });
  }
});

// Get single customer details with full address and order history
router.get('/customers/:id', authenticate, requirePermission('canManageCustomers'), async (req, res) => {
  try {
    const { id } = req.params;
    const user = await db.users.findOne(u => String(u.id) === String(id) || u.customerId === id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'العميل غير موجود' });
    }

    const { password, ...safeUser } = user;
    const orders = await db.orders.find(o => String(o.userId) === String(user.id));
    orders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    res.json({
      success: true,
      customer: {
        ...safeUser,
        customerId: user.customerId || `CUST-${user.id.substring(0, 5)}`,
        addresses: Array.isArray(user.addresses) ? user.addresses : []
      },
      orders
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'فشل جلب تفاصيل العميل' });
  }
});

// Update Customer Details (Email, Password, Phone, Name, isLocked, Addresses)
router.put('/customers/:id', authenticate, requirePermission('canManageCustomers'), async (req, res) => {
  try {
    const { id } = req.params;
    const user = await db.users.findOne(u => String(u.id) === String(id) || u.customerId === id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'العميل غير موجود' });
    }

    if (user.role === 'super_admin' && req.user.role !== 'super_admin') {
      return res.status(403).json({ success: false, message: 'غير مصرح بتعديل حساب المدير العام' });
    }

    const { name, email, phone, password, isLocked, secondaryPhone, whatsappPhone, addresses } = req.body;
    const updates = {};

    if (name) updates.name = name.trim();

    if (email) {
      const cleanEmail = email.trim().toLowerCase();
      const existing = await db.users.findOne(u => u.id !== user.id && u.email && u.email.toLowerCase() === cleanEmail);
      if (existing) {
        return res.status(400).json({ success: false, message: 'هذا البريد الإلكتروني مسجل لحساب آخر' });
      }
      updates.email = cleanEmail;
    }

    if (phone) {
      const cleanPhone = phone.trim().replace(/[\s-]/g, '');
      const existing = await db.users.findOne(u => u.id !== user.id && u.phone && u.phone.replace(/[\s-]/g, '') === cleanPhone);
      if (existing) {
        return res.status(400).json({ success: false, message: 'رقم الهاتف مسجل لحساب آخر' });
      }
      updates.phone = cleanPhone;
    }

    if (secondaryPhone !== undefined) updates.secondaryPhone = secondaryPhone.trim();
    if (whatsappPhone !== undefined) updates.whatsappPhone = whatsappPhone.trim();

    if (password && password.trim().length >= 6) {
      const salt = await bcrypt.genSalt(10);
      updates.password = await bcrypt.hash(password.trim(), salt);
    }

    if (isLocked !== undefined) {
      updates.isLocked = Boolean(isLocked);
    }

    if (Array.isArray(addresses)) {
      updates.addresses = addresses;
    }

    const updated = await db.users.update(user.id, updates);
    const { password: _, ...safeUser } = updated;

    await logActivity({
      userId: req.user.id,
      userName: req.user.name,
      userRole: req.user.role,
      action: 'UPDATE_CUSTOMER',
      module: 'customers',
      details: `قام بتحديث بيانات العميل: "${user.name}" (${user.customerId || user.email})`,
      metadata: { targetUserId: user.id }
    });

    res.json({
      success: true,
      message: 'تم تحديث بيانات العميل بنجاح',
      customer: safeUser
    });
  } catch (err) {
    console.error('Update customer error:', err);
    res.status(500).json({ success: false, message: 'فشل تحديث بيانات العميل' });
  }
});

// Toggle Customer Lock/Unlock
router.put('/customers/:id/toggle-lock', authenticate, requirePermission('canManageCustomers'), async (req, res) => {
  try {
    const { id } = req.params;
    const user = await db.users.findOne(u => String(u.id) === String(id) || u.customerId === id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'العميل غير موجود' });
    }

    if (user.role === 'super_admin') {
      return res.status(403).json({ success: false, message: 'لا يمكن قفل حساب المدير العام' });
    }

    const newLockState = !user.isLocked;
    const updated = await db.users.update(user.id, { isLocked: newLockState });
    const { password, ...safeUser } = updated;

    await logActivity({
      userId: req.user.id,
      userName: req.user.name,
      userRole: req.user.role,
      action: newLockState ? 'LOCK_CUSTOMER' : 'UNLOCK_CUSTOMER',
      module: 'customers',
      details: `قام بـ ${newLockState ? 'قفل/تعليق' : 'تفعيل/فتح'} حساب العميل: "${user.name}"`,
      metadata: { targetUserId: user.id, isLocked: newLockState }
    });

    res.json({
      success: true,
      message: newLockState ? 'تم قفل/تعليق الحساب بنجاح' : 'تم تفعيل وفتح الحساب بنجاح',
      customer: safeUser
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'فشل تعديل حالة الحساب' });
  }
});

// ==========================================
// 3. STAFF ACTIVITY AUDIT LOGS & PRODUCTIVITY METRICS
// ==========================================

// Get activity logs with filters
router.get('/activity-logs', authenticate, async (req, res) => {
  try {
    if (req.user.role !== 'super_admin' && !req.user.permissions?.canManageSupport && !req.user.permissions?.canManageCustomers) {
      return res.status(403).json({ success: false, message: 'غير مصرح بالدخول' });
    }

    const { staffId, module, action, dateRange = 'all' } = req.query;
    let logs = await db.activity_logs.getAll();

    if (staffId && staffId !== 'all') {
      logs = logs.filter(l => String(l.userId) === String(staffId));
    }

    if (module && module !== 'all') {
      logs = logs.filter(l => l.module === module);
    }

    if (action && action !== 'all') {
      logs = logs.filter(l => l.action === action);
    }

    // Filter by dateRange
    const now = new Date();
    let filterDate = null;
    if (dateRange === 'today') filterDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    else if (dateRange === 'week') filterDate = new Date(now.getTime() - 7 * 24 * 3600 * 1000);
    else if (dateRange === 'month') filterDate = new Date(now.getTime() - 30 * 24 * 3600 * 1000);

    if (filterDate) {
      logs = logs.filter(l => new Date(l.createdAt) >= filterDate);
    }

    logs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    res.json({ success: true, count: logs.length, logs });
  } catch (err) {
    console.error('Fetch activity logs error:', err);
    res.status(500).json({ success: false, message: 'فشل جلب سجل النشاطات' });
  }
});

// Get staff productivity statistics (Daily, Weekly, Monthly)
router.get('/activity-stats', authenticate, async (req, res) => {
  try {
    if (req.user.role !== 'super_admin' && req.user.role !== 'staff') {
      return res.status(403).json({ success: false, message: 'غير مصرح بالدخول' });
    }

    const staffMembers = await db.users.find(u => u.role === 'staff' || u.role === 'super_admin');
    const logs = await db.activity_logs.getAll();

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(now.getTime() - 7 * 24 * 3600 * 1000);
    const monthStart = new Date(now.getTime() - 30 * 24 * 3600 * 1000);

    const statsPerStaff = staffMembers.map(member => {
      const userLogs = logs.filter(l => String(l.userId) === String(member.id));
      const todayCount = userLogs.filter(l => new Date(l.createdAt) >= todayStart).length;
      const weekCount = userLogs.filter(l => new Date(l.createdAt) >= weekStart).length;
      const monthCount = userLogs.filter(l => new Date(l.createdAt) >= monthStart).length;

      // Group by action type
      const actionBreakdown = {};
      userLogs.forEach(l => {
        actionBreakdown[l.action] = (actionBreakdown[l.action] || 0) + 1;
      });

      return {
        id: member.id,
        name: member.name,
        email: member.email,
        role: member.role,
        avatar: member.avatar,
        todayCount,
        weekCount,
        monthCount,
        totalCount: userLogs.length,
        actionBreakdown,
        lastActivity: userLogs.length > 0 ? userLogs[0].createdAt : null
      };
    });

    statsPerStaff.sort((a, b) => b.monthCount - a.monthCount);

    res.json({
      success: true,
      stats: statsPerStaff,
      totalLoggedActions: logs.length
    });
  } catch (err) {
    console.error('Activity stats error:', err);
    res.status(500).json({ success: false, message: 'فشل جلب إحصائيات الموظفين' });
  }
});

// ==========================================
// 4. STAFF & ACCOUNTANTS MANAGEMENT (HIERARCHY, PERMISSIONS & ONLINE HOURS TRACKING)
// ==========================================

function formatOnlineTime(seconds) {
  if (!seconds || seconds < 60) return 'أقل من دقيقة';
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (hrs > 0 && mins > 0) return `${hrs} ساعة و ${mins} دقيقة`;
  if (hrs > 0) return `${hrs} ساعة`;
  return `${mins} دقيقة`;
}

// List all staff and accountant members with online status and hours
router.get('/staff', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const staffMembers = await db.users.find(u => u.role === 'staff' || u.role === 'super_admin' || u.role === 'accountant');
    const now = new Date();
    const todayStr = cairoDay(now);
    const nowMs = now.getTime();
    const isCurrentUserHakim = req.user.email === 'admin@suki.store' || Boolean(req.user.isOwner);

    const safeStaff = staffMembers.map(s => {
      const { password, ...safe } = s;
      const isOnline = Boolean(s.isOnline !== false && s.lastHeartbeatAt && (nowMs - new Date(s.lastHeartbeatAt).getTime() < 75000));
      const todaySec = (s.lastActiveDate === todayStr) ? (Number(s.todayOnlineSeconds) || 0) : 0;
      const isOwner = Boolean(s.isOwner || s.email === 'admin@suki.store');

      return {
        ...safe,
        isOnline,
        statusLabel: isOnline ? 'أونلاين 🟢' : 'أوفلاين ⚪',
        todayOnlineSeconds: todaySec,
        onlineHoursFormatted: formatOnlineTime(todaySec),
        isOwner,
        isProtected: isOwner,
        canBeManagedByMe: isCurrentUserHakim ? (s.id !== req.user.id) : !isOwner,
        accountingLevel: s.accountingLevel || (s.role === 'accountant' ? 'full' : undefined)
      };
    });

    res.json({ 
      success: true, 
      staff: safeStaff,
      isCurrentUserHakim
    });
  } catch (err) {
    console.error('List staff error:', err);
    res.status(500).json({ success: false, message: 'فشل جلب قائمة الموظفين والمحاسبين' });
  }
});

// Get detailed daily work activity and hours breakdown for any staff member
router.get('/staff/:id/daily-activity', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const user = await db.users.getById(id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'الموظف غير موجود' });
    }

    const now = new Date();
    const todayStr = cairoDay(now);
    const nowMs = now.getTime();
    const isOnline = Boolean(user.isOnline !== false && user.lastHeartbeatAt && (nowMs - new Date(user.lastHeartbeatAt).getTime() < 75000));

    const rawDaily = user.dailyHours || {};
    // Ensure today is represented
    if (!rawDaily[todayStr] && user.todayOnlineSeconds) {
      rawDaily[todayStr] = {
        date: todayStr,
        seconds: user.todayOnlineSeconds,
        firstActiveAt: user.lastHeartbeatAt || now.toISOString(),
        lastActiveAt: user.lastHeartbeatAt || now.toISOString()
      };
    }

    const daysList = Object.values(rawDaily).map(d => ({
      date: d.date,
      seconds: Number(d.seconds) || 0,
      formatted: formatOnlineTime(Number(d.seconds) || 0),
      hoursFloat: Math.round(((Number(d.seconds) || 0) / 3600) * 10) / 10,
      firstActiveAt: d.firstActiveAt || null,
      lastActiveAt: d.lastActiveAt || null
    }));

    daysList.sort((a, b) => b.date.localeCompare(a.date));

    const totalSeconds = daysList.reduce((sum, d) => sum + d.seconds, 0);

    res.json({
      success: true,
      staff: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        isOnline,
        todayOnlineSeconds: user.lastActiveDate === todayStr ? (Number(user.todayOnlineSeconds) || 0) : 0,
        todayFormatted: formatOnlineTime(user.lastActiveDate === todayStr ? (Number(user.todayOnlineSeconds) || 0) : 0)
      },
      summary: {
        totalDays: daysList.length,
        totalSeconds,
        totalFormatted: formatOnlineTime(totalSeconds),
        averageHoursPerDay: daysList.length > 0 ? Math.round((totalSeconds / daysList.length / 3600) * 10) / 10 : 0
      },
      days: daysList
    });
  } catch (err) {
    console.error('Get daily activity error:', err);
    res.status(500).json({ success: false, message: 'فشل جلب تقرير نشاط الموظف' });
  }
});

// Add new staff or accountant member
router.post('/staff', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const { name, email, phone, password, role = 'staff', accountingLevel = 'full', permissions } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'الاسم، البريد الإلكتروني، وكلمة المرور مطلوبة'
      });
    }

    const assignedRole = (role === 'accountant') ? 'accountant' : 'staff';

    // Enforce Strong Password Policy for staff
    const pwdStrength = validatePasswordStrength(password);
    if (!pwdStrength.isValid) {
      return res.status(400).json({
        success: false,
        message: pwdStrength.message,
        requirements: pwdStrength.requirements,
        score: pwdStrength.score
      });
    }

    const cleanEmail = email.trim().toLowerCase();
    const existing = await db.users.findOne(u => u.email && u.email.toLowerCase() === cleanEmail);
    if (existing) {
      return res.status(400).json({ success: false, message: 'البريد الإلكتروني مسجل بالفعل' });
    }

    const salt = await bcrypt.genSalt(12);
    const hashedPassword = await bcrypt.hash(password, salt);

    const validLevels = ['full', 'view_only', 'limited'];
    const chosenAccountingLevel = validLevels.includes(accountingLevel) ? accountingLevel : 'full';

    const defaultPermissions = {
      canManageProducts: Boolean(permissions?.canManageProducts),
      canManageCategories: Boolean(permissions?.canManageCategories),
      canManageOrders: Boolean(permissions?.canManageOrders),
      canManageCustomers: Boolean(permissions?.canManageCustomers),
      canManageCoupons: Boolean(permissions?.canManageCoupons),
      canManageBanners: Boolean(permissions?.canManageBanners),
      canManageSupport: Boolean(permissions?.canManageSupport),
      canManageLiveChat: Boolean(permissions?.canManageLiveChat),
      canManagePush: Boolean(permissions?.canManagePush),
      canViewReports: Boolean(permissions?.canViewReports) || assignedRole === 'accountant',
      canViewActivity: Boolean(permissions?.canViewActivity),
      canManageSettings: Boolean(permissions?.canManageSettings),
      canManageAccounting: Boolean(permissions?.canManageAccounting) || assignedRole === 'accountant',
      canManageMerchants: Boolean(permissions?.canManageMerchants) || assignedRole === 'accountant',
      canManageInvestors: Boolean(permissions?.canManageInvestors),
      canManageExpenses: Boolean(permissions?.canManageExpenses) || (assignedRole === 'accountant' && chosenAccountingLevel === 'full'),
      canManageReturns: Boolean(permissions?.canManageReturns),
      accountingLevel: chosenAccountingLevel
    };

    const newStaff = await db.users.insert({
      name: name.trim(),
      email: cleanEmail,
      phone: (phone || '').trim(),
      password: hashedPassword,
      role: assignedRole,
      accountingLevel: assignedRole === 'accountant' ? chosenAccountingLevel : undefined,
      isActive: true,
      isLocked: false,
      permissions: defaultPermissions,
      todayOnlineSeconds: 0,
      avatar: `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(name.trim())}`
    });

    await logActivity({
      userId: req.user.id,
      userName: req.user.name,
      userRole: req.user.role,
      action: 'CREATE_STAFF',
      module: 'staff',
      details: `قام بإضافة ${assignedRole === 'accountant' ? 'محاسب مالي' : 'موظف'} جديد: "${newStaff.name}" (${newStaff.email}) - مستوى: ${chosenAccountingLevel}`,
      metadata: { newStaffId: newStaff.id, role: assignedRole }
    });

    const { password: _, ...safe } = newStaff;
    res.status(201).json({
      success: true,
      message: `تم إضافة ${assignedRole === 'accountant' ? 'المحاسب المالي' : 'الموظف'} بنجاح وتعيين الصلاحيات`,
      staff: safe
    });
  } catch (err) {
    console.error('Add staff error:', err);
    res.status(500).json({ success: false, message: 'فشل إضافة الموظف أو المحاسب' });
  }
});

// Update staff or accountant member permissions & status
router.put('/staff/:id', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, phone, isActive, permissions, newPassword, role, accountingLevel } = req.body;

    const staffMember = await db.users.getById(id);
    if (!staffMember) {
      return res.status(404).json({ success: false, message: 'الحساب غير موجود' });
    }

    const isTargetMohamedHakim = staffMember.email === 'admin@suki.store' || Boolean(staffMember.isOwner);
    const isCallerMohamedHakim = req.user.email === 'admin@suki.store' || Boolean(req.user.isOwner);

    // Hierarchy Guard: Mohamed Hakim cannot be edited or modified by any other admin
    if (isTargetMohamedHakim && !isCallerMohamedHakim) {
      return res.status(403).json({
        success: false,
        message: 'غير مصرح لك بتعديل بيانات أو صلاحيات المدير العام والمالك محمد حكيم'
      });
    }

    const updates = {};
    if (name) updates.name = name.trim();
    if (phone !== undefined) updates.phone = phone.trim();
    if (isActive !== undefined) {
      if (isTargetMohamedHakim && !isActive) {
        return res.status(403).json({ success: false, message: 'لا يمكن تعطيل حساب المدير العام الرئيسي' });
      }
      updates.isActive = Boolean(isActive);
    }

    if (role && ['staff', 'accountant', 'super_admin'].includes(role)) {
      if (!isTargetMohamedHakim) {
        updates.role = role;
      }
    }

    if (accountingLevel && ['full', 'view_only', 'limited'].includes(accountingLevel)) {
      updates.accountingLevel = accountingLevel;
    }

    if (permissions) {
      updates.permissions = {
        canManageProducts: Boolean(permissions.canManageProducts),
        canManageCategories: Boolean(permissions.canManageCategories),
        canManageOrders: Boolean(permissions.canManageOrders),
        canManageCustomers: Boolean(permissions.canManageCustomers),
        canManageCoupons: Boolean(permissions.canManageCoupons),
        canManageBanners: Boolean(permissions.canManageBanners),
        canManageSupport: Boolean(permissions.canManageSupport),
        canManageLiveChat: Boolean(permissions.canManageLiveChat),
        canManagePush: Boolean(permissions.canManagePush),
        canViewReports: Boolean(permissions.canViewReports),
        canViewActivity: Boolean(permissions.canViewActivity),
        canManageSettings: Boolean(permissions.canManageSettings),
        canManageAccounting: Boolean(permissions.canManageAccounting),
        canManageMerchants: Boolean(permissions.canManageMerchants),
        canManageInvestors: Boolean(permissions.canManageInvestors),
        canManageExpenses: Boolean(permissions.canManageExpenses),
        canManageReturns: Boolean(permissions.canManageReturns),
        accountingLevel: accountingLevel || permissions.accountingLevel || staffMember.accountingLevel || 'full'
      };
    }

    if (newPassword) {
      const pwdStrength = validatePasswordStrength(newPassword);
      if (!pwdStrength.isValid) {
        return res.status(400).json({
          success: false,
          message: pwdStrength.message,
          requirements: pwdStrength.requirements,
          score: pwdStrength.score
        });
      }
      const salt = await bcrypt.genSalt(12);
      updates.password = await bcrypt.hash(newPassword, salt);
      updates.tokenVersion = (staffMember.tokenVersion || 1) + 1; // Invalidate previous sessions
    }

    const updated = await db.users.update(id, updates);

    await logActivity({
      userId: req.user.id,
      userName: req.user.name,
      userRole: req.user.role,
      action: 'UPDATE_STAFF',
      module: 'staff',
      details: `قام بتحديث صلاحيات وبيانات: "${updated.name}"`,
      metadata: { targetStaffId: id }
    });

    const { password, ...safe } = updated;

    res.json({
      success: true,
      message: 'تم تحديث البيانات والصلاحيات بنجاح',
      staff: safe
    });
  } catch (err) {
    console.error('Update staff error:', err);
    res.status(500).json({ success: false, message: 'فشل تحديث البيانات' });
  }
});

// Delete staff or accountant member
router.delete('/staff/:id', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const staffMember = await db.users.getById(id);
    if (!staffMember) {
      return res.status(404).json({ success: false, message: 'الحساب غير موجود' });
    }

    const isTargetMohamedHakim = staffMember.email === 'admin@suki.store' || Boolean(staffMember.isOwner);
    const isCallerMohamedHakim = req.user.email === 'admin@suki.store' || Boolean(req.user.isOwner);

    // Mohamed Hakim can NEVER be deleted
    if (isTargetMohamedHakim) {
      return res.status(403).json({ success: false, message: 'لا يمكن حذف حساب المدير العام والمالك محمد حكيم نهائياً' });
    }

    // If target is another super_admin (e.g. Ahmed Gharib), only Mohamed Hakim can delete them
    if (staffMember.role === 'super_admin' && !isCallerMohamedHakim) {
      return res.status(403).json({ success: false, message: 'لا يمكن حذف حساب المدير العام إلا بواسطة المالك الرئيسي محمد حكيم' });
    }

    await db.users.delete(id);

    await logActivity({
      userId: req.user.id,
      userName: req.user.name,
      userRole: req.user.role,
      action: 'DELETE_STAFF',
      module: 'staff',
      details: `قام بحذف حساب: "${staffMember.name}" (${staffMember.email})`,
      metadata: { deletedStaffId: id }
    });

    res.json({ success: true, message: 'تم حذف الحساب بنجاح' });
  } catch (err) {
    console.error('Delete staff error:', err);
    res.status(500).json({ success: false, message: 'فشل حذف الحساب' });
  }
});

// ==========================================
// 5. LOW STOCK PRODUCTS REPORT & THRESHOLD
// ==========================================
router.get('/low-stock', authenticate, async (req, res) => {
  try {
    if (req.user.role !== 'super_admin' && req.user.role !== 'staff') {
      return res.status(403).json({ success: false, message: 'غير مصرح بالدخول' });
    }

    const settingsList = await db.settings.getAll();
    const settings = settingsList[0] || { lowStockThreshold: 15 };
    const threshold = req.query.threshold ? Number(req.query.threshold) : (Number(settings.lowStockThreshold) || 15);

    const products = await db.products.getAll();
    const lowStockProducts = products.filter(p => (p.stock !== undefined ? p.stock : 0) <= threshold);

    lowStockProducts.sort((a, b) => (a.stock || 0) - (b.stock || 0));

    res.json({
      success: true,
      threshold,
      count: lowStockProducts.length,
      products: lowStockProducts
    });
  } catch (err) {
    console.error('Low stock error:', err);
    res.status(500).json({ success: false, message: 'فشل جلب المنتجات قاربت على النفاذ' });
  }
});

// ==========================================
// MAINTENANCE MODE (SUPER ADMIN & AHMED GHARIB ONLY)
// ==========================================
router.get('/maintenance-status', async (req, res) => {
  try {
    const settingsList = await db.settings.getAll();
    const settings = settingsList[0] || {};
    res.json({
      success: true,
      maintenanceMode: Boolean(settings.maintenanceMode),
      message: settings.maintenanceMessage || 'الموقع تحت الصيانة مؤقتاً للتطوير والتحديث'
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'فشل فحص حالة الصيانة' });
  }
});

router.post('/maintenance/toggle', authenticate, async (req, res) => {
  try {
    const isSuperOrAhmed = isSuperAdmin(req.user);

    if (!isSuperOrAhmed) {
      return res.status(403).json({
        success: false,
        message: 'عفواً، التحكم في وضع الصيانة متاح فقط لحساب السوبر أدمن وحساب أحمد غريب.'
      });
    }

    const settingsList = await db.settings.getAll();
    let current = settingsList[0];
    const newStatus = !(current && current.maintenanceMode);

    let saved = null;
    if (current) {
      saved = await db.settings.update(current.id, { maintenanceMode: newStatus });
    } else {
      saved = await db.settings.insert({ id: 'store_settings', maintenanceMode: newStatus });
    }

    await logActivity({
      userId: req.user.id,
      userName: req.user.name,
      userRole: req.user.role,
      action: newStatus ? 'ENABLE_MAINTENANCE' : 'DISABLE_MAINTENANCE',
      module: 'security',
      details: newStatus ? 'قام بتفعيل وضع الصيانة للمتجر' : 'قام بإلغاء وضع الصيانة وإعادة تشغيل المتجر للزوار',
      metadata: { maintenanceMode: newStatus }
    });

    res.json({
      success: true,
      maintenanceMode: newStatus,
      message: newStatus ? 'تم تفعيل وضع الصيانة بنجاح. يظهر الآن للزوار صفحة الموقع تحت الصيانة.' : 'تم إيقاف وضع الصيانة وعاد المتجر للعمل بشكل طبيعي للزوار.'
    });
  } catch (err) {
    console.error('Toggle maintenance mode error:', err);
    res.status(500).json({ success: false, message: 'فشل تغيير حالة وضع الصيانة' });
  }
});

// Store Settings (Threshold, Google OAuth, OTP)
router.get('/settings', authenticate, async (req, res) => {
  try {
    // SECURITY: store settings are for the dashboard, never for customers
    if (req.user.role === 'customer') {
      return res.status(403).json({ success: false, message: 'غير مصرح بالدخول' });
    }
    const settingsList = await db.settings.getAll();
    const settings = { ...(settingsList[0] || {
      id: 'store_settings',
      lowStockThreshold: 15,
      googleClientId: '',
      googleClientSecret: '',
      enableOtpVerification: true,
      enableWebPush: true
    }) };
    // Secrets and IP allow-lists are visible to super admins only (and the secret only as "is set")
    if (settings.googleClientSecret) settings.googleClientSecretSet = true;
    delete settings.googleClientSecret;
    if (!isSuperAdmin(req.user)) {
      delete settings.allowedIpsHakim;
      delete settings.allowedIpsAhmed;
      delete settings.ipRestrictionEnabled;
    }
    const { getGatewayStatus } = require('../utils/paymentGateway');
    res.json({ success: true, settings, paymentGateway: getGatewayStatus() });
  } catch (err) {
    res.status(500).json({ success: false, message: 'فشل جلب الإعدادات' });
  }
});

router.put('/settings', authenticate, async (req, res) => {
  try {
    if (req.user.role !== 'super_admin' && !(req.user.role === 'staff' && req.user.permissions?.canManageSettings)) {
      return res.status(403).json({ success: false, message: 'غير مصرح بتعديل إعدادات المتجر' });
    }
    const settingsList = await db.settings.getAll();
    let current = settingsList[0];
    const { lowStockThreshold, googleClientId, googleClientSecret, enableOtpVerification, enableWebPush } = req.body;

    const updates = {};
    if (lowStockThreshold !== undefined) updates.lowStockThreshold = Number(lowStockThreshold);
    if (googleClientId !== undefined) updates.googleClientId = String(googleClientId).trim();
    // The secret is never sent to the browser, so an empty field means "keep current"
    if (googleClientSecret !== undefined && String(googleClientSecret).trim()) updates.googleClientSecret = String(googleClientSecret).trim();
    if (enableOtpVerification !== undefined) updates.enableOtpVerification = Boolean(enableOtpVerification);
    if (enableWebPush !== undefined) updates.enableWebPush = Boolean(enableWebPush);

    // Payment methods and investor profit split: super admin only (they move money)
    const { cardPaymentEnabled, defaultInvestorProfitSharePercent } = req.body;
    if (cardPaymentEnabled !== undefined || defaultInvestorProfitSharePercent !== undefined) {
      if (!isSuperAdmin(req.user)) {
        return res.status(403).json({ success: false, message: 'إعدادات الدفع وتقسيم الأرباح متاحة للمدير العام فقط' });
      }
      if (cardPaymentEnabled !== undefined) updates.cardPaymentEnabled = Boolean(cardPaymentEnabled);
      if (defaultInvestorProfitSharePercent !== undefined) {
        const pct = Number(defaultInvestorProfitSharePercent);
        if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
          return res.status(400).json({ success: false, message: 'نسبة المستثمر من الربح يجب أن تكون بين 0 و 100' });
        }
        updates.defaultInvestorProfitSharePercent = pct;
      }
    }

    let saved = null;
    if (current) {
      saved = await db.settings.update(current.id, updates);
    } else {
      saved = await db.settings.insert({ id: 'store_settings', ...updates });
    }

    await logActivity({
      userId: req.user.id,
      userName: req.user.name,
      userRole: req.user.role,
      action: 'UPDATE_SETTINGS',
      module: 'settings',
      details: `قام بتحديث إعدادات المتجر (حد التنبيه للمخزون: ${saved.lowStockThreshold || 15} قطعة)`,
      metadata: updates
    });

    res.json({ success: true, message: 'تم حفظ إعدادات المتجر بنجاح', settings: saved });
  } catch (err) {
    console.error('Update settings error:', err);
    res.status(500).json({ success: false, message: 'فشل حفظ الإعدادات' });
  }
});

// ==========================================
// 6. ADVANCED SALES REPORTS (GOVERNORATE, CATEGORY, STAFF, BEST HOURS & DAYS)
// ==========================================
router.get('/reports/sales', authenticate, async (req, res) => {
  try {
    if (req.user.role !== 'super_admin' && req.user.role !== 'staff' && req.user.role !== 'accountant') {
      return res.status(403).json({ success: false, message: 'غير مصرح بالدخول' });
    }

    const { timeRange = '30d' } = req.query;
    const orders = await db.orders.getAll();
    const categories = await db.categories.getAll();
    const staffMembers = await db.users.find(u => u.role === 'staff' || u.role === 'super_admin' || u.role === 'accountant');
    const activityLogs = await db.activity_logs.getAll();

    const now = new Date();
    let filterDate = null;
    if (timeRange === 'today' || timeRange === '1d') filterDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    else if (timeRange === '7d') filterDate = new Date(now.getTime() - 7 * 24 * 3600 * 1000);
    else if (timeRange === '30d') filterDate = new Date(now.getTime() - 30 * 24 * 3600 * 1000);
    else if (timeRange === '60d') filterDate = new Date(now.getTime() - 60 * 24 * 3600 * 1000);
    else if (timeRange === '90d') filterDate = new Date(now.getTime() - 90 * 24 * 3600 * 1000);
    else if (timeRange === 'year' || timeRange === '365d') filterDate = new Date(now.getTime() - 365 * 24 * 3600 * 1000);

    const filtered = filterDate
      ? orders.filter(o => o.createdAt && new Date(o.createdAt) >= filterDate && o.status !== 'cancelled')
      : orders.filter(o => o.status !== 'cancelled');

    const totalRevenue = filtered.reduce((sum, o) => sum + (Number(o.grandTotal) || 0), 0);

    // 1. Sales by Governorate
    const govMap = {};
    filtered.forEach(o => {
      const gov = o.shippingAddress?.governorate || 'القاهرة';
      if (!govMap[gov]) govMap[gov] = { governorate: gov, count: 0, revenue: 0 };
      govMap[gov].count++;
      govMap[gov].revenue += Number(o.grandTotal) || 0;
    });
    const salesByGovernorate = Object.values(govMap)
      .map(g => ({
        governorate: g.governorate,
        count: g.count,
        ordersCount: g.count,
        revenue: g.revenue,
        percentage: totalRevenue > 0 ? Math.round((g.revenue / totalRevenue) * 100) : 0
      }))
      .sort((a, b) => b.revenue - a.revenue);

    // 2. Sales by Category
    const catMap = {};
    categories.forEach(c => {
      catMap[c.id] = { id: c.id, name: c.name, count: 0, revenue: 0, itemsSold: 0 };
    });
    filtered.forEach(o => {
      if (Array.isArray(o.items)) {
        o.items.forEach(item => {
          const catId = item.categoryId;
          if (catId && catMap[catId]) {
            catMap[catId].itemsSold += (Number(item.quantity) || 1);
            catMap[catId].revenue += (Number(item.price) || 0) * (Number(item.quantity) || 1);
            catMap[catId].count++;
          }
        });
      }
    });
    const salesByCategory = Object.values(catMap)
      .map(c => ({
        id: c.id,
        name: c.name,
        categoryName: c.name,
        count: c.count,
        itemsCount: c.itemsSold,
        itemsSold: c.itemsSold,
        revenue: c.revenue,
        percentage: totalRevenue > 0 ? Math.round((c.revenue / totalRevenue) * 100) : 0
      }))
      .sort((a, b) => b.revenue - a.revenue);

    // 3. Sales by Staff Member
    const staffMap = {};
    staffMembers.forEach(s => {
      staffMap[s.id] = { 
        id: s.id, 
        name: s.name, 
        staffName: s.name, 
        role: s.role, 
        avatar: s.avatar, 
        processedOrders: 0, 
        ordersProcessed: 0, 
        actionsCount: 0,
        revenueHandled: 0,
        percentage: 0
      };
    });
    activityLogs.forEach(l => {
      if (l.userId && staffMap[l.userId]) {
        staffMap[l.userId].actionsCount++;
        if (l.action === 'UPDATE_ORDER_STATUS') {
          staffMap[l.userId].processedOrders++;
          staffMap[l.userId].ordersProcessed++;
        }
      }
    });

    filtered.forEach(o => {
      if (o.processedBy && staffMap[o.processedBy]) {
        staffMap[o.processedBy].revenueHandled += (Number(o.grandTotal) || 0);
      }
    });

    const totalStaffHandled = Object.values(staffMap).reduce((acc, s) => acc + s.revenueHandled, 0);
    if (totalStaffHandled === 0 && totalRevenue > 0 && staffMembers.length > 0) {
      const perStaff = Math.round(totalRevenue / staffMembers.length);
      staffMembers.forEach(s => {
        if (staffMap[s.id]) {
          staffMap[s.id].revenueHandled = perStaff;
          staffMap[s.id].ordersProcessed = Math.max(staffMap[s.id].ordersProcessed, Math.round(filtered.length / staffMembers.length));
          staffMap[s.id].processedOrders = staffMap[s.id].ordersProcessed;
        }
      });
    }

    const salesByStaff = Object.values(staffMap).map(s => ({
      ...s,
      percentage: totalRevenue > 0 ? Math.round((s.revenueHandled / totalRevenue) * 100) : 0
    })).sort((a, b) => b.revenueHandled - a.revenueHandled);

    // 4. Best Sales Times: Hourly (0 - 23)
    const hourlyArr = Array.from({ length: 24 }, (_, h) => ({
      hour: h,
      label: `${h}:00`,
      hourLabel: `${h}:00`,
      orders: 0,
      ordersCount: 0,
      revenue: 0
    }));
    filtered.forEach(o => {
      if (o.createdAt) {
        const d = new Date(o.createdAt);
        const h = d.getHours();
        if (hourlyArr[h]) {
          hourlyArr[h].orders++;
          hourlyArr[h].ordersCount++;
          hourlyArr[h].revenue += Number(o.grandTotal) || 0;
        }
      }
    });

    // 5. Best Sales Days: Days of Week (0: Sun to 6: Sat)
    const arabicDays = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
    const dailyArr = arabicDays.map((name, idx) => ({
      dayIndex: idx,
      dayName: name,
      orders: 0,
      ordersCount: 0,
      revenue: 0
    }));
    filtered.forEach(o => {
      if (o.createdAt) {
        const d = new Date(o.createdAt);
        const dayIdx = d.getDay();
        if (dailyArr[dayIdx]) {
          dailyArr[dayIdx].orders++;
          dailyArr[dayIdx].ordersCount++;
          dailyArr[dayIdx].revenue += Number(o.grandTotal) || 0;
        }
      }
    });

    // Find peaks
    const peakHour = [...hourlyArr].sort((a, b) => b.revenue - a.revenue)[0] || hourlyArr[0];
    const peakDay = [...dailyArr].sort((a, b) => b.revenue - a.revenue)[0] || dailyArr[0];

    const avgOrderVal = filtered.length > 0 ? Math.round(totalRevenue / filtered.length) : 0;

    const summaryData = {
      totalOrders: filtered.length,
      totalRevenue: Math.round(totalRevenue),
      totalSales: Math.round(totalRevenue),
      averageOrderValue: avgOrderVal
    };

    res.json({
      success: true,
      timeRange,
      totalOrders: filtered.length,
      totalRevenue: Math.round(totalRevenue),
      totalSales: Math.round(totalRevenue),
      averageOrderValue: avgOrderVal,
      summary: summaryData,
      byGovernorate: salesByGovernorate,
      salesByGovernorate,
      byCategory: salesByCategory,
      salesByCategory,
      byStaff: salesByStaff,
      salesByStaff,
      bestTimes: {
        hourly: hourlyArr,
        daily: dailyArr,
        peakHour,
        peakDay
      },
      hourlySales: hourlyArr,
      dailySales: dailyArr
    });
  } catch (err) {
    console.error('Sales reports error:', err);
    res.status(500).json({ success: false, message: 'فشل جلب تقارير المبيعات' });
  }
});

// ==========================================
// 8. SECURITY AUDIT LOGS & LOGIN ATTEMPTS MONITORING
// ==========================================

// Get Audit Logs (Super Admin only)
router.get('/audit-logs', authenticate, requireSuperAdmin, checkSuperAdminIp, async (req, res) => {
  try {
    const { timeRange = 'all', action } = req.query;
    const allLogs = await db.audit_logs.getAll();

    const now = new Date();
    let filterDate = null;
    if (timeRange === '1d') filterDate = new Date(now.getTime() - 1 * 24 * 3600 * 1000);
    else if (timeRange === '7d') filterDate = new Date(now.getTime() - 7 * 24 * 3600 * 1000);
    else if (timeRange === '30d') filterDate = new Date(now.getTime() - 30 * 24 * 3600 * 1000);

    let filtered = allLogs;
    if (filterDate) {
      filtered = filtered.filter(l => l.timestamp && new Date(l.timestamp) >= filterDate);
    }
    if (action) {
      filtered = filtered.filter(l => l.action === action);
    }

    filtered.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    res.json({
      success: true,
      count: filtered.length,
      logs: filtered.slice(0, 200)
    });
  } catch (err) {
    console.error('Audit logs error:', err);
    res.status(500).json({ success: false, message: 'فشل جلب سجلات التدقيق' });
  }
});

// Get Login Logs (Failed and Successful login attempts)
router.get('/security/login-logs', authenticate, requireSuperAdmin, checkSuperAdminIp, async (req, res) => {
  try {
    const { status, timeRange = 'all' } = req.query; // status: 'SUCCESS' | 'FAILED'
    const allLogs = await db.login_logs.getAll();

    const now = new Date();
    let filterDate = null;
    if (timeRange === '1d') filterDate = new Date(now.getTime() - 1 * 24 * 3600 * 1000);
    else if (timeRange === '7d') filterDate = new Date(now.getTime() - 7 * 24 * 3600 * 1000);
    else if (timeRange === '30d') filterDate = new Date(now.getTime() - 30 * 24 * 3600 * 1000);

    let filtered = allLogs;
    if (filterDate) {
      filtered = filtered.filter(l => l.timestamp && new Date(l.timestamp) >= filterDate);
    }
    if (status) {
      filtered = filtered.filter(l => l.status === status);
    }

    filtered.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    res.json({
      success: true,
      count: filtered.length,
      logs: filtered.slice(0, 200)
    });
  } catch (err) {
    console.error('Login logs error:', err);
    res.status(500).json({ success: false, message: 'فشل جلب سجلات تسجيل الدخول' });
  }
});

// Get Security Overview Stats
router.get('/security/stats', authenticate, requireSuperAdmin, checkSuperAdminIp, async (req, res) => {
  try {
    const users = await db.users.getAll();
    const loginLogs = await db.login_logs.getAll();
    const auditLogs = await db.audit_logs.getAll();

    const oneDayAgo = new Date(Date.now() - 24 * 3600 * 1000);
    const failedLogins24h = loginLogs.filter(l => l.status === 'FAILED' && new Date(l.timestamp) >= oneDayAgo).length;
    const successfulLogins24h = loginLogs.filter(l => l.status === 'SUCCESS' && new Date(l.timestamp) >= oneDayAgo).length;

    const lockedAccounts = users.filter(u => u.isLocked).length;
    const twoFactorCount = users.filter(u => u.twoFactorEnabled).length;
    const staffCount = users.filter(u => u.role === 'staff' || u.role === 'super_admin').length;

    res.json({
      success: true,
      stats: {
        failedLogins24h,
        successfulLogins24h,
        lockedAccounts,
        twoFactorCount,
        staffCount,
        totalAuditEvents: auditLogs.length,
        superAdminAllowedIps: process.env.SUPER_ADMIN_ALLOWED_IPS || 'مسموح من كافة العناوين',
        isHttpsEnforced: process.env.FORCE_HTTPS === 'true',
        jwtExpiry: process.env.JWT_EXPIRES_IN || '7d',
        adminJwtExpiry: process.env.JWT_ADMIN_EXPIRES_IN || '24h'
      }
    });
  } catch (err) {
    console.error('Security stats error:', err);
    res.status(500).json({ success: false, message: 'فشل جلب إحصائيات الأمان' });
  }
});

// ==========================================
// 9. BULK ACTIONS & PRODUCT/CUSTOMER MANAGEMENT
// ==========================================

// Bulk Delete Products
router.post('/products/bulk-delete', authenticate, requirePermission('canManageProducts'), async (req, res) => {
  try {
    const ids = req.body.ids || req.body.productIds;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ success: false, message: 'لم يتم تحديد أي منتجات للحذف' });
    }

    // SECURITY: same ownership rules as single delete
    if (req.user.role === 'investor') {
      return res.status(403).json({ success: false, message: 'حساب المستثمر مخصص للمشاهدة والتقارير فقط وغير مصرح له بحذف المنتجات.' });
    }
    if (req.user.role === 'merchant') {
      return res.status(403).json({ success: false, message: 'حساب التاجر للمشاهدة فقط. حذف المنتجات بيتم من إدارة المتجر.' });
    }

    let deletedCount = 0;
    let skippedCount = 0;
    for (const id of ids) {
      if (req.user.role === 'merchant') {
        const existing = await db.products.getById(id);
        const isOwner = existing && (
          (existing.merchantId && String(existing.merchantId) === String(req.user.merchantId)) ||
          (existing.merchantCode && existing.merchantCode.trim().toLowerCase() === (req.user.merchantCode || '').trim().toLowerCase())
        );
        if (!isOwner) { skippedCount++; continue; }
      }
      const resDel = await db.products.delete(id);
      if (resDel) deletedCount++;
    }

    await logActivity({
      userId: req.user.id,
      userName: req.user.name,
      userRole: req.user.role,
      action: 'BULK_DELETE_PRODUCTS',
      module: 'products',
      details: `قام بحذف جماعي لـ (${deletedCount}) منتج`,
      metadata: { deletedCount, productIds: ids }
    });

    res.json({
      success: true,
      message: `تم حذف ${deletedCount} منتج بنجاح`,
      deletedCount
    });
  } catch (err) {
    console.error('Bulk delete products error:', err);
    res.status(500).json({ success: false, message: 'فشل حذف المنتجات المحددة' });
  }
});

// Delete All Products (Requires Admin Password Confirmation)
router.post('/products/delete-all', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const { password } = req.body;
    if (!password) {
      return res.status(400).json({ success: false, message: 'يُرجى كتابة كلمة مرور المدير لتأكيد حذف جميع المنتجات' });
    }

    const adminUser = await db.users.getById(req.user.id);
    if (!adminUser) {
      return res.status(404).json({ success: false, message: 'المستخدم غير موجود' });
    }

    const isMatch = await bcrypt.compare(password, adminUser.password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'كلمة المرور غير صحيحة، تم إلغاء عملية حذف الكل للأمان' });
    }

    const allProducts = await db.products.getAll();
    const count = allProducts.length;

    for (const p of allProducts) {
      await db.products.delete(p.id);
    }

    await logActivity({
      userId: req.user.id,
      userName: req.user.name,
      userRole: req.user.role,
      action: 'DELETE_ALL_PRODUCTS',
      module: 'products',
      details: `⚠️ تحذير: قام بحذف جميع المنتجات من المتجر بالكامل (${count} منتج) بعد تأكيد كلمة المرور`,
      metadata: { deletedCount: count }
    });

    res.json({
      success: true,
      message: `تم حذف كافة المنتجات (${count} منتج) من المتجر بنجاح`,
      deletedCount: count
    });
  } catch (err) {
    console.error('Delete all products error:', err);
    res.status(500).json({ success: false, message: 'فشل عملية حذف جميع المنتجات' });
  }
});

// Bulk Delete Customers
router.post('/customers/bulk-delete', authenticate, requirePermission('canManageCustomers'), async (req, res) => {
  try {
    // the customers page sends "customerIds" (older code sent "ids")
    const ids = req.body.customerIds || req.body.ids;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ success: false, message: 'لم يتم تحديد أي عملاء للحذف' });
    }

    let deletedCount = 0;
    for (const id of ids) {
      const u = await db.users.getById(id);
      if (u && (u.role === 'customer' || !u.role)) {
        await db.users.delete(id);
        deletedCount++;
      }
    }

    await logActivity({
      userId: req.user.id,
      userName: req.user.name,
      userRole: req.user.role,
      action: 'BULK_DELETE_CUSTOMERS',
      module: 'customers',
      details: `قام بحذف جماعي لـ (${deletedCount}) حساب عميل`,
      metadata: { deletedCount, customerIds: ids }
    });

    res.json({
      success: true,
      message: `تم حذف ${deletedCount} عميل بنجاح`,
      deletedCount
    });
  } catch (err) {
    console.error('Bulk delete customers error:', err);
    res.status(500).json({ success: false, message: 'فشل حذف العملاء المحددين' });
  }
});

// ==========================================
// 10. MOHAMED HAKIM EXCLUSIVE IP WHITELIST CONTROL
// ==========================================

// Helper to check if requester is Mohamed Hakim
function isMohamedHakim(user) {
  // SECURITY: never trust the display name (users can edit it)
  return isPrimaryOwner(user);
}

// Get IP Whitelist Settings (Exclusive to Mohamed Hakim)
router.get('/security/ip-whitelist', authenticate, async (req, res) => {
  try {
    if (!isMohamedHakim(req.user)) {
      return res.status(403).json({
        success: false,
        message: 'قسم إعدادات تقييد IP مخصص حصرياً للمالك الرئيسي (محمد حكيم) فقط'
      });
    }

    const settingsList = await db.settings.getAll();
    const storeSettings = settingsList[0] || {};
    const clientIp = getClientIp(req);

    res.json({
      success: true,
      isOwner: true,
      clientIp,
      ipRestrictionEnabled: Boolean(storeSettings.ipRestrictionEnabled),
      allowedIpsHakim: storeSettings.allowedIpsHakim || ['127.0.0.1', '::1'],
      allowedIpsAhmed: storeSettings.allowedIpsAhmed || ['127.0.0.1', '::1']
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'فشل جلب إعدادات الأمان' });
  }
});

// Update IP Whitelist Settings (Exclusive to Mohamed Hakim)
router.put('/security/ip-whitelist', authenticate, async (req, res) => {
  try {
    if (!isMohamedHakim(req.user)) {
      return res.status(403).json({
        success: false,
        message: 'قسم إعدادات تقييد IP مخصص حصرياً للمالك الرئيسي (محمد حكيم) فقط'
      });
    }

    const { ipRestrictionEnabled, allowedIpsHakim, allowedIpsAhmed } = req.body;
    const settingsList = await db.settings.getAll();
    const currentId = settingsList[0]?.id || 'store_settings';

    const cleanIpsHakim = Array.isArray(allowedIpsHakim) 
      ? allowedIpsHakim.map(ip => String(ip).trim()).filter(Boolean)
      : ['127.0.0.1', '::1'];

    const cleanIpsAhmed = Array.isArray(allowedIpsAhmed) 
      ? allowedIpsAhmed.map(ip => String(ip).trim()).filter(Boolean)
      : ['127.0.0.1', '::1'];

    const isEnabled = Boolean(ipRestrictionEnabled);

    const updated = await db.settings.update(currentId, {
      ipRestrictionEnabled: isEnabled,
      allowedIpsHakim: cleanIpsHakim,
      allowedIpsAhmed: cleanIpsAhmed
    });

    // Sync process.env for middleware
    if (isEnabled) {
      process.env.SUPER_ADMIN_ALLOWED_IPS = [...cleanIpsHakim, ...cleanIpsAhmed].join(',');
    } else {
      process.env.SUPER_ADMIN_ALLOWED_IPS = '';
    }

    await logActivity({
      userId: req.user.id,
      userName: req.user.name,
      userRole: req.user.role,
      action: 'UPDATE_IP_RESTRICTIONS',
      module: 'security',
      details: `قام محمد حكيم بتحديث قيود عناوين IP: ${isEnabled ? 'تفعيل القيود' : 'السماح بتسجيل الدخول بدون قيود من أي جهاز'}`,
      metadata: { ipRestrictionEnabled: isEnabled, cleanIpsHakim, cleanIpsAhmed }
    });

    res.json({
      success: true,
      message: isEnabled 
        ? 'تم تفعيل تقييد IP وتحديث العناوين المسموح بها بنجاح' 
        : 'تم تفعيل خيار تسجيل الدخول بدون قيود ومن أي جهاز بنجاح',
      settings: updated
    });
  } catch (err) {
    console.error('Update IP whitelist error:', err);
    res.status(500).json({ success: false, message: 'فشل تحديث إعدادات تقييد IP' });
  }
});

// ==========================================
// 11. RETURNS MANAGEMENT ALIAS FOR ADMIN
// ==========================================
router.get('/returns', authenticate, requirePermission('canManageReturns'), async (req, res) => {
  try {
    const list = await db.returns.getAll();
    list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    res.json({ success: true, count: list.length, returns: list });
  } catch (err) {
    res.status(500).json({ success: false, message: 'فشل جلب طلبات الاستبدال' });
  }
});

router.put('/returns/:id/status', authenticate, requirePermission('canManageReturns'), async (req, res) => {
  // Retired duplicate: it accepted any status and skipped the rejection / shipping-cost rules.
  // The dashboard uses PUT /api/returns/admin/:id/status.
  return res.status(410).json({ success: false, message: 'استخدم /api/returns/admin/:id/status لتحديث طلبات الاستبدال' });
  // eslint-disable-next-line no-unreachable
  try {
    const { id } = req.params;
    const { status, note, adminNotes, courierDetails } = req.body;
    const returnReq = await db.returns.getById(id);
    if (!returnReq) {
      return res.status(404).json({ success: false, message: 'طلب الاستبدال غير موجود' });
    }

    const labels = {
      pending_review: 'تحت المراجعة',
      accepted: 'مقبول',
      courier_dispatched: 'تم إرسال المندوب',
      received: 'تم الاستلام',
      replaced: 'تم الاستبدال'
    };

    const newLabel = labels[status] || status;
    const history = returnReq.statusHistory || [];
    history.push({
      status,
      label: newLabel,
      timestamp: new Date().toISOString(),
      note: note || `تم تحديث الحالة إلى: ${newLabel}`,
      by: req.user.name
    });

    const updates = { status, statusHistory: history };
    if (adminNotes !== undefined) updates.adminNotes = adminNotes;
    if (courierDetails !== undefined) updates.courierDetails = courierDetails;

    const updated = await db.returns.update(id, updates);

    // Instant customer notification
    await db.notifications.insert({
      userId: returnReq.userId,
      title: `تحديث طلب الاستبدال #${returnReq.returnNumber}`,
      message: `تم تحديث حالة طلب الاستبدال لمنتج "${returnReq.productTitle}" إلى "${newLabel}".`,
      link: `#/returns?id=${returnReq.id}`,
      type: 'return',
      isRead: false
    });

    res.json({
      success: true,
      message: `تم تحديث حالة طلب الاستبدال إلى "${newLabel}" بنجاح`,
      returnRequest: updated
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'فشل تحديث حالة الاستبدال' });
  }
});

// ==========================================
// 12. DIRECT ACCOUNT PROFILE MANAGEMENT (Available to any authenticated user/staff/accountant/super_admin)
// ==========================================
router.put('/my-account', authenticate, async (req, res) => {
  try {
    const { name, password, phone, secondaryPhone, whatsappPhone, avatar } = req.body;
    const updates = {};

    if (name && name.trim()) {
      updates.name = name.trim();
    }

    if (avatar !== undefined) {
      updates.avatar = String(avatar).trim();
    }

    if (phone !== undefined) {
      const cleanPhone = String(phone).trim().replace(/[\s-]/g, '');
      if (cleanPhone) {
        // Ensure phone is not registered to another user
        const existing = await db.users.findOne(u => u.id !== req.user.id && u.phone && u.phone.replace(/[\s-]/g, '') === cleanPhone);
        if (existing) {
          return res.status(400).json({
            success: false,
            message: 'رقم الهاتف مسجل بالفعل لحساب آخر'
          });
        }
        updates.phone = cleanPhone;
      } else {
        updates.phone = '';
      }
    }

    if (secondaryPhone !== undefined) {
      updates.secondaryPhone = String(secondaryPhone).trim();
    }

    if (whatsappPhone !== undefined) {
      updates.whatsappPhone = String(whatsappPhone).trim();
    }

    let newToken = null;
    if (password && password.trim()) {
      const pwd = password.trim();
      if (pwd.length < 6) {
        return res.status(400).json({
          success: false,
          message: 'يجب أن لا تقل كلمة المرور عن 6 أحرف'
        });
      }
      // SECURITY: confirm the current password before changing it
      const currentPassword = req.body.currentPassword;
      const currentOk = currentPassword && req.user.password
        ? await bcrypt.compare(String(currentPassword), req.user.password)
        : false;
      if (!currentOk) {
        return res.status(400).json({
          success: false,
          message: 'كلمة المرور الحالية غير صحيحة أو غير مدخلة'
        });
      }
      const salt = await bcrypt.genSalt(12);
      updates.password = await bcrypt.hash(pwd, salt);
      updates.tokenVersion = (req.user.tokenVersion || 1) + 1;
    }

    const updatedUser = await db.users.update(req.user.id, updates);

    // If password was changed, issue updated token
    const { generateToken, setAuthCookie } = require('../middleware/auth');
    if (updates.password) {
      newToken = generateToken(updatedUser);
      setAuthCookie(res, newToken, req);
    }

    await logActivity({
      userId: req.user.id,
      userName: updatedUser.name,
      userRole: updatedUser.role,
      action: 'UPDATE_ADMIN_PROFILE',
      module: 'admin',
      details: `قام ${updatedUser.name} بتحديث بيانات حسابه الإداري مباشرة (الاسم/الهاتف/كلمة المرور)`
    });

    const { password: _, ...safeUser } = updatedUser;

    res.json({
      success: true,
      message: 'تم تحديث بيانات حسابك بنجاح ✅',
      user: safeUser,
      token: newToken
    });
  } catch (err) {
    console.error('Update my-account error:', err);
    res.status(500).json({ success: false, message: 'فشل تحديث بيانات الحساب' });
  }
});

module.exports = router;
