/**
 * Excel (.xlsx) exports for the dashboard: orders, customers, products, sales & profit.
 * GET /api/exports/:type?from=YYYY-MM-DD&to=YYYY-MM-DD&status=...
 */
const express = require('express');
const router = express.Router();
const XLSX = require('xlsx');
const db = require('../database/db');
const { authenticate, requirePermission, isSuperAdmin } = require('../middleware/auth');
const { orderEconomics, loadContext, deliveredDate, productCost } = require('../utils/financeEngine');
const { logActivity } = require('../utils/activityLogger');
const { cairoDay } = require('../utils/ledger');

const STATUS_AR = { pending: 'تم الاستلام', processing: 'قيد التجهيز', shipped: 'قيد الشحن', delivered: 'تم التسليم', cancelled: 'ملغي' };
const PAY_AR = { cod: 'عند الاستلام', card: 'بطاقة' };
const OWNER_AR = { store: 'المتجر', merchant: 'تاجر', investor: 'مستثمر' };

function noOwnerRoles(req, res, next) {
  if (req.user && (req.user.role === 'merchant' || req.user.role === 'investor')) {
    return res.status(403).json({ success: false, message: 'التصدير متاح لإدارة المتجر فقط' });
  }
  next();
}

// Days counted in Cairo time (same as the accounting section)
function inRange(dateStr, from, to) {
  const d = cairoDay(dateStr);
  if (from && d < String(from).slice(0, 10)) return false;
  if (to && d > String(to).slice(0, 10)) return false;
  return true;
}

const fmtDate = d => (d ? new Date(d).toLocaleString('ar-EG', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '');

// Build a workbook (RTL sheets, sensible column widths) and send it
function sendWorkbook(res, filename, sheets) {
  const wb = XLSX.utils.book_new();
  wb.Workbook = { Views: [{ RTL: true }] };
  for (const { name, rows } of sheets) {
    const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{ 'لا توجد بيانات': '' }]);
    const keys = Object.keys(rows[0] || { 'لا توجد بيانات': '' });
    ws['!cols'] = keys.map(k => ({ wch: Math.min(45, Math.max(10, k.length + 2, ...rows.slice(0, 200).map(r => String(r[k] ?? '').length + 1))) }));
    XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31));
  }
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`);
  res.send(buf);
}

const stamp = () => new Date().toISOString().slice(0, 10);

async function audit(req, what, count) {
  await logActivity({
    userId: req.user.id, userName: req.user.name, userRole: req.user.role,
    action: 'EXPORT_EXCEL', module: 'exports', details: `صدّر ${what} (${count} صف) إلى Excel`
  });
}

router.get('/orders', authenticate, requirePermission('canManageOrders'), noOwnerRoles, async (req, res) => {
  try {
    const { from, to, status } = req.query;
    let orders = (await db.orders.getAll()).filter(o => inRange(o.createdAt, from, to));
    if (status && status !== 'all') orders = orders.filter(o => o.status === status);
    orders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    const rows = orders.map(o => {
      const a = o.shippingAddress || {};
      return {
        'رقم الطلب': o.orderNumber,
        'التاريخ': fmtDate(o.createdAt),
        'العميل': o.customerName || a.fullName || '',
        'التليفون': o.customerPhone || a.phone || '',
        'المحافظة': a.governorate || '',
        'المدينة': a.city || '',
        'العنوان': [a.area, a.street, a.building].filter(Boolean).join(' - '),
        'الحالة': STATUS_AR[o.status] || o.status,
        'الدفع': PAY_AR[o.paymentMethod] || o.paymentMethod || '',
        'عدد القطع': (o.items || []).reduce((s, i) => s + (Number(i.quantity) || 0), 0),
        'المنتجات': (o.items || []).map(i => `${i.title}${i.variantLabel ? ' (' + i.variantLabel + ')' : ''} × ${i.quantity}`).join(' | '),
        'إجمالي المنتجات': Number(o.subtotal) || 0,
        'الشحن': Number(o.shippingFee) || 0,
        'الخصم': (Number(o.discountAmount) || 0) + (Number(o.loyaltyDiscountAmount) || 0),
        'الإجمالي': Number(o.grandTotal) || 0,
        'الكوبون': (o.appliedCoupon && o.appliedCoupon.code) || '',
        'المصدر': o.isManual ? (o.orderSourceLabel || 'يدوي') : 'الموقع',
        'المندوب': o.deliveredBy || '',
        'ملاحظات': a.notes || ''
      };
    });
    const itemRows = [];
    orders.forEach(o => (o.items || []).forEach(i => itemRows.push({
      'رقم الطلب': o.orderNumber,
      'التاريخ': fmtDate(o.createdAt),
      'الحالة': STATUS_AR[o.status] || o.status,
      'المنتج': i.title,
      'الاختيار': i.variantLabel || Object.entries(i.selectedOptions || {}).map(([k, v]) => `${k}: ${v}`).join(' / '),
      'SKU': i.sku || '',
      'الكمية': Number(i.quantity) || 0,
      'سعر القطعة': Number(i.price) || 0,
      'الإجمالي': (Number(i.price) || 0) * (Number(i.quantity) || 0),
      'المالك': OWNER_AR[i.ownerType] || i.ownerType || ''
    })));
    await audit(req, 'الطلبات', rows.length);
    sendWorkbook(res, `orders-${stamp()}.xlsx`, [{ name: 'الطلبات', rows }, { name: 'تفاصيل المنتجات', rows: itemRows }]);
  } catch (err) {
    console.error('Export orders error:', err);
    res.status(500).json({ success: false, message: 'فشل تصدير الطلبات' });
  }
});

router.get('/customers', authenticate, requirePermission('canManageCustomers'), noOwnerRoles, async (req, res) => {
  try {
    const [users, orders] = await Promise.all([db.users.find(u => u.role === 'customer'), db.orders.getAll()]);
    const rows = users.map(u => {
      const mine = orders.filter(o => String(o.userId) === String(u.id));
      const delivered = mine.filter(o => o.status === 'delivered');
      const last = mine.map(o => o.createdAt).sort().pop();
      const addr = (u.addresses || []).find(a => a.isDefault) || (u.addresses || [])[0] || {};
      return {
        'كود العميل': u.customerId || '',
        'الاسم': u.name || '',
        'الإيميل': u.email || '',
        'التليفون': u.phone || '',
        'المحافظة': addr.governorate || '',
        'تاريخ التسجيل': fmtDate(u.createdAt),
        'عدد الطلبات': mine.length,
        'طلبات مسلّمة': delivered.length,
        'إجمالي المشتريات المسلّمة': delivered.reduce((s, o) => s + (Number(o.grandTotal) || 0), 0),
        'آخر طلب': fmtDate(last),
        'نقاط الولاء': Number(u.loyaltyPoints) || 0,
        'الحساب مقفول': u.isLocked ? 'نعم' : 'لا'
      };
    });
    await audit(req, 'العملاء', rows.length);
    sendWorkbook(res, `customers-${stamp()}.xlsx`, [{ name: 'العملاء', rows }]);
  } catch (err) {
    console.error('Export customers error:', err);
    res.status(500).json({ success: false, message: 'فشل تصدير العملاء' });
  }
});

router.get('/products', authenticate, requirePermission('canManageProducts'), noOwnerRoles, async (req, res) => {
  try {
    const showCost = isSuperAdmin(req.user);
    const [products, categories] = await Promise.all([db.products.getAll(), db.categories.getAll()]);
    const catName = id => (categories.find(c => String(c.id) === String(id)) || {}).name || '';
    const rows = products.map(p => ({
      'المنتج': p.title,
      'SKU': p.sku || '',
      'الباركود': p.barcode || '',
      'القسم': catName(p.categoryId),
      'الماركة': p.brand || '',
      'سعر البيع': Number(p.price) || 0,
      ...(showCost ? { 'سعر التكلفة': productCost(p) ?? '' } : {}),
      'السعر قبل الخصم': p.compareAtPrice || '',
      'المخزون': Number(p.stock) || 0,
      'الوزن (كجم)': p.weightKg ?? '',
      'المبيعات': Number(p.salesCount) || 0,
      'المالك': OWNER_AR[p.ownerType] || 'المتجر',
      'التاجر/المستثمر': p.merchantName || p.investorName || '',
      'ظاهر في المتجر': p.isActive === false ? 'لا' : 'نعم'
    }));
    const variantRows = [];
    products.forEach(p => (p.variants || []).forEach(v => variantRows.push({
      'المنتج': p.title,
      'الاختيار': Object.entries(v.options || {}).map(([k, val]) => `${k}: ${val}`).join(' / '),
      'SKU': v.sku || '',
      'السعر': v.price || p.price,
      'المخزون': Number(v.stock) || 0
    })));
    await audit(req, 'المنتجات', rows.length);
    sendWorkbook(res, `products-${stamp()}.xlsx`, [{ name: 'المنتجات', rows }, { name: 'المقاسات والألوان', rows: variantRows }]);
  } catch (err) {
    console.error('Export products error:', err);
    res.status(500).json({ success: false, message: 'فشل تصدير المنتجات' });
  }
});

// Delivered orders with the money split (same numbers as the accounting dashboard)
router.get('/sales', authenticate, requirePermission('canViewReports'), noOwnerRoles, async (req, res) => {
  try {
    const { from, to } = req.query;
    const ctx = await loadContext();
    const orders = (await db.orders.find(o => o.status === 'delivered')).filter(o => inRange(deliveredDate(o), from, to));
    orders.sort((a, b) => new Date(deliveredDate(b)) - new Date(deliveredDate(a)));
    const rows = orders.map(o => {
      const e = orderEconomics(o, ctx);
      return {
        'رقم الطلب': o.orderNumber,
        'تاريخ التسليم': fmtDate(deliveredDate(o)),
        'العميل': o.customerName || '',
        'المبيعات': e.sales,
        'التكلفة': e.cost,
        'مستحقات التجار': e.merchantDues,
        'مستحقات المستثمرين': e.investorDues,
        'ربح المتجر من المنتجات': e.storeItemProfit,
        'الشحن': e.shippingFee,
        'الخصومات': e.discounts,
        'صافي المتجر': e.storeNet,
        'المحصّل': e.collected,
        'الدفع': PAY_AR[e.paymentMethod] || e.paymentMethod,
        'المندوب': o.deliveredBy || ''
      };
    });
    if (rows.length) {
      const total = { 'رقم الطلب': 'الإجمالي' };
      ['المبيعات', 'التكلفة', 'مستحقات التجار', 'مستحقات المستثمرين', 'ربح المتجر من المنتجات', 'الشحن', 'الخصومات', 'صافي المتجر', 'المحصّل']
        .forEach(k => { total[k] = Math.round(rows.reduce((s, r) => s + (Number(r[k]) || 0), 0) * 100) / 100; });
      rows.push(total);
    }
    await audit(req, 'تقرير المبيعات والأرباح', rows.length);
    sendWorkbook(res, `sales-${stamp()}.xlsx`, [{ name: 'المبيعات والأرباح', rows }]);
  } catch (err) {
    console.error('Export sales error:', err);
    res.status(500).json({ success: false, message: 'فشل تصدير التقرير' });
  }
});

module.exports = router;
