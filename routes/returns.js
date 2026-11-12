const express = require('express');
const router = express.Router();
const db = require('../database/db');
const { authenticate, requirePermission } = require('../middleware/auth');
const { logActivity } = require('../utils/activityLogger');
const { investorSharePercent } = require('../utils/financeEngine');
const { isInvestorOwned } = require('../utils/ownershipHelper');

const RETURN_STAGES = [
  { key: 'pending_review', label: 'تحت المراجعة', order: 1 },
  { key: 'accepted', label: 'مقبول', order: 2 },
  { key: 'courier_dispatched', label: 'تم إرسال المندوب', order: 3 },
  { key: 'received', label: 'تم الاستلام', order: 4 },
  { key: 'replaced', label: 'تم الاستبدال', order: 5 },
  { key: 'rejected', label: 'مرفوض', order: 6 }
];
const FINAL_RETURN_STATES = ['replaced', 'rejected'];

// The exchange is free for the customer: the store pays the courier's exchange trip.
// That cost is recorded once as a store expense (and kept in sync if edited later).
async function syncExchangeShippingExpense(returnReq, cost, user) {
  const amount = Math.round((Number(cost) || 0) * 100) / 100;
  const existing = returnReq.exchangeShippingExpenseId ? await db.expenses.getById(returnReq.exchangeShippingExpenseId) : null;
  if (amount <= 0) {
    if (existing) await db.expenses.delete(existing.id);
    return null;
  }
  // Exchange on an INVESTOR's product: a shared expense split by his profit share %.
  // Store / merchant products: the store pays it.
  const target = await exchangeExpenseTarget(returnReq);
  const fields = {
    title: `شحن استبدال #${returnReq.returnNumber} (طلب #${returnReq.orderNumber})`,
    amount,
    type: 'expense',
    category: 'شحن استبدال',
    targetType: target ? 'investor' : 'general',
    merchantId: null, merchantCode: null, merchantName: null,
    investorId: target ? target.investorId : null,
    investorCode: target ? target.investorCode : null,
    investorName: target ? target.investorName : null,
    investorSharePercent: target ? target.investorSharePercent : null,
    returnId: returnReq.id,
    date: new Date().toISOString(),
    notes: target
      ? `مصاريف رحلة المندوب للاستبدال (منتج مستثمر): بتتقسم بنسبة ${target.investorSharePercent}% على المستثمر والباقي على المتجر. العميل لا يدفع شيئاً.`
      : 'مصاريف رحلة المندوب للاستبدال على حساب المتجر (العميل لا يدفع شيئاً)',
    recordedBy: user ? user.name : 'النظام'
  };
  if (existing) {
    // Only the amount / title change on edits; the split recorded the first time is kept
    await db.expenses.update(existing.id, { amount, title: fields.title });
    return existing.id;
  }
  const created = await db.expenses.insert(fields);
  return created.id;
}

// Investor to charge (with his % snapshot) when the exchanged product is investor-owned, else null
async function exchangeExpenseTarget(returnReq) {
  const order = returnReq.orderId ? await db.orders.getById(returnReq.orderId) : null;
  const item = order ? (order.items || []).find(i => String(i.productId) === String(returnReq.productId)) : null;
  const product = await db.products.getById(returnReq.productId);
  const isInv = item ? (item.ownerType === 'investor' || (!item.ownerType && isInvestorOwned(item))) : isInvestorOwned(product || {});
  if (!isInv) return null;
  const invId = (item && item.investorId) || (product && product.investorId) || null;
  const invCode = (item && item.investorCode) || (product && product.investorCode) || '';
  const inv = invId ? await db.investors.getById(invId)
    : (invCode ? await db.investors.findOne(i => i.code && i.code.toUpperCase() === String(invCode).toUpperCase()) : null);
  if (!inv) return null;
  const settings = (await db.settings.getAll())[0] || {};
  return {
    investorId: inv.id, investorCode: inv.code, investorName: inv.name,
    // same % the investor had on that sale, else his current %
    investorSharePercent: investorSharePercent(item || {}, inv, settings)
  };
}

// Helper: generate replacement tracking number
function generateReturnNumber() {
  const rand = Math.floor(10000 + Math.random() * 90000);
  return `RET-${rand}`;
}

// 1. Submit Return/Replacement request (Customer only)
router.post('/', authenticate, async (req, res) => {
  try {
    const {
      orderId,
      productId,
      defectReason = 'عيب صناعة',
      phone,
      whatsappPhone,
      description,
      imageUrl
    } = req.body;

    if (!orderId || !productId) {
      return res.status(400).json({ success: false, message: 'معرف الطلب ومعرف المنتج مطلوبان' });
    }

    if (!phone || !phone.trim() || !whatsappPhone || !whatsappPhone.trim()) {
      return res.status(400).json({ success: false, message: 'رقم الهاتف ورقم الواتساب مطلوبان بشكل إجباري' });
    }

    if (!description || !description.trim()) {
      return res.status(400).json({ success: false, message: 'يُرجى كتابة وصف تفصيلي لعيب الصناعة في المنتج' });
    }

    // Verify order exists, belongs to user, and is 'delivered'
    const order = await db.orders.getById(orderId);
    if (!order) {
      return res.status(404).json({ success: false, message: 'الطلب غير موجود' });
    }

    if (String(order.userId) !== String(req.user.id) && req.user.role !== 'super_admin') {
      return res.status(403).json({ success: false, message: 'لا يمكنك تقديم طلب استبدال لطلب لا يخصك' });
    }

    if (order.status !== 'delivered') {
      return res.status(400).json({
        success: false,
        message: 'يمكن طلب الاستبدال فقط للطلبات المستلمة بنجاح (بحالة تم التسليم)'
      });
    }

    // Verify product is in order items
    const orderItem = (order.items || []).find(item => String(item.productId) === String(productId));
    if (!orderItem) {
      return res.status(400).json({ success: false, message: 'هذا المنتج غير موجود ضمن عناصر الطلب المذكور' });
    }

    // One open request per product per order (a finished replacement can't be re-claimed either)
    const existingReturn = await db.returns.findOne(r =>
      String(r.orderId) === String(order.id) && String(r.productId) === String(orderItem.productId)
    );
    if (existingReturn) {
      return res.status(400).json({
        success: false,
        message: `يوجد بالفعل طلب استبدال لهذا المنتج برقم #${existingReturn.returnNumber}. يمكنك متابعته من صفحة طلبات الاستبدال.`
      });
    }

    // 14-day warranty window from delivery (as shown to customers on the site)
    const deliveredAt = order.deliveredAt || (Array.isArray(order.statusHistory)
      ? (order.statusHistory.filter(h => h.status === 'delivered').pop() || {}).timestamp
      : null);
    if (deliveredAt && (Date.now() - new Date(deliveredAt).getTime()) > 14 * 24 * 60 * 60 * 1000) {
      return res.status(400).json({
        success: false,
        message: 'انتهت مدة الاستبدال (14 يوماً من تاريخ التسليم) لهذا الطلب'
      });
    }

    const returnNumber = generateReturnNumber();

    const returnRecord = await db.returns.insert({
      returnNumber,
      orderId: order.id,
      orderNumber: order.orderNumber,
      userId: req.user.id,
      userName: req.user.name,
      userEmail: req.user.email,
      productId: orderItem.productId,
      productTitle: orderItem.title,
      productPrice: orderItem.price,
      productImage: orderItem.image || '',
      defectReason: 'عيب صناعة', // strictly manufacturing defect
      description: description.trim(),
      phone: phone.trim(),
      whatsappPhone: whatsappPhone.trim(),
      imageUrl: imageUrl || '',
      status: 'pending_review',
      statusHistory: [
        {
          status: 'pending_review',
          label: 'تحت المراجعة',
          timestamp: new Date().toISOString(),
          note: 'تم تقديم طلب الاستبدال بنجاح وقيد المراجعة الفنية'
        }
      ],
      adminNotes: '',
      courierDetails: ''
    });

    // Notify user
    await db.notifications.insert({
      userId: req.user.id,
      title: 'تم استلام طلب الاستبدال',
      message: `تم استلام طلب استبدال المنتج "${orderItem.title}" برقم #${returnNumber}. طلبك قيد المراجعة الفنية.`,
      link: `#/returns?id=${returnRecord.id}`,
      type: 'return',
      isRead: false
    });

    // Activity log
    await logActivity({
      userId: req.user.id,
      userName: req.user.name,
      userRole: req.user.role,
      action: 'CREATE_RETURN_REQUEST',
      module: 'returns',
      details: `قام العميل بطلب استبدال منتج "${orderItem.title}" لعيب صناعة (طلب رقم #${order.orderNumber})`,
      metadata: { returnId: returnRecord.id, returnNumber }
    });

    res.status(201).json({
      success: true,
      message: 'تم إرسال طلب الاستبدال بنجاح. سيتم مراجعته والتواصل معك سريعاً.',
      returnRequest: returnRecord
    });
  } catch (err) {
    console.error('Submit return request error:', err);
    res.status(500).json({ success: false, message: 'حدث خطأ أثناء تقديم طلب الاستبدال' });
  }
});

// 2. Get customer's own return requests
router.get('/my-returns', authenticate, async (req, res) => {
  try {
    const list = await db.returns.find(r => String(r.userId) === String(req.user.id));
    list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    res.json({ success: true, returns: list });
  } catch (err) {
    res.status(500).json({ success: false, message: 'فشل جلب طلبات الاستبدال' });
  }
});

// 3. Get single return request details
router.get('/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const item = await db.returns.findOne(r => String(r.id) === String(id) || r.returnNumber === id);
    if (!item) {
      return res.status(404).json({ success: false, message: 'طلب الاستبدال غير موجود' });
    }

    if (String(item.userId) !== String(req.user.id) && req.user.role !== 'super_admin' && req.user.role !== 'staff') {
      return res.status(403).json({ success: false, message: 'غير مصرح بعرض هذا الطلب' });
    }

    res.json({ success: true, returnRequest: item });
  } catch (err) {
    res.status(500).json({ success: false, message: 'فشل جلب تفاصيل الطلب' });
  }
});

// ==========================================
// ADMIN ENDPOINTS FOR RETURNS
// ==========================================

// 4. Admin: Get all returns with filters
router.get('/admin/all', authenticate, requirePermission('canManageReturns'), async (req, res) => {
  try {
    const { status, q } = req.query;
    let list = await db.returns.getAll();

    if (status && status !== 'all') {
      list = list.filter(r => r.status === status);
    }

    if (q && q.trim()) {
      const term = q.trim().toLowerCase();
      list = list.filter(r => 
        (r.returnNumber || '').toLowerCase().includes(term) ||
        (r.orderNumber || '').toLowerCase().includes(term) ||
        (r.userName || '').toLowerCase().includes(term) ||
        (r.phone || '').includes(term) ||
        (r.productTitle || '').toLowerCase().includes(term)
      );
    }

    list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    res.json({ success: true, count: list.length, returns: list });
  } catch (err) {
    console.error('Fetch admin returns error:', err);
    res.status(500).json({ success: false, message: 'فشل جلب طلبات الاستبدال للإدارة' });
  }
});

// 5. Admin: Update Return Status (1-click transition)
router.put('/admin/:id/status', authenticate, requirePermission('canManageReturns'), async (req, res) => {
  try {
    const { id } = req.params;
    const { status, note, adminNotes, courierDetails, rejectionReason, exchangeShippingCost } = req.body;

    const returnReq = await db.returns.getById(id);
    if (!returnReq) {
      return res.status(404).json({ success: false, message: 'طلب الاستبدال غير موجود' });
    }

    const stage = RETURN_STAGES.find(s => s.key === status);
    if (!stage) {
      return res.status(400).json({ success: false, message: 'حالة غير صالحة' });
    }
    const statusChanged = status !== returnReq.status;

    // Replaced / rejected are final; only the super admin can reopen them
    if (statusChanged && FINAL_RETURN_STATES.includes(returnReq.status) && req.user.role !== 'super_admin') {
      return res.status(400).json({ success: false, message: 'طلب الاستبدال مغلق (تم الاستبدال أو مرفوض). إعادة فتحه متاحة للمدير العام فقط.' });
    }
    const cleanReason = String(rejectionReason || note || '').trim();
    if (statusChanged && status === 'rejected' && cleanReason.length < 3) {
      return res.status(400).json({ success: false, message: 'اكتب سبب رفض طلب الاستبدال ليظهر للعميل' });
    }
    let shipCost;
    if (exchangeShippingCost !== undefined && exchangeShippingCost !== '' && exchangeShippingCost !== null) {
      shipCost = Number(exchangeShippingCost);
      if (!Number.isFinite(shipCost) || shipCost < 0) {
        return res.status(400).json({ success: false, message: 'تكلفة شحن الاستبدال يجب أن تكون رقماً (صفر أو أكثر)' });
      }
    }

    const updates = {};
    if (statusChanged) {
      updates.status = status;
      updates.statusHistory = [...(returnReq.statusHistory || []), {
        status,
        label: stage.label,
        timestamp: new Date().toISOString(),
        note: status === 'rejected' ? `سبب الرفض: ${cleanReason}` : (note || `تم تحديث الحالة إلى: ${stage.label}`),
        by: req.user.name
      }];
      if (status === 'rejected') updates.rejectionReason = cleanReason;
    }
    if (adminNotes !== undefined) updates.adminNotes = adminNotes;
    if (courierDetails !== undefined) updates.courierDetails = courierDetails;
    if (shipCost !== undefined) updates.exchangeShippingCost = shipCost;

    // Store-paid exchange trip → expense in accounting once the exchange is done
    const finalStatus = updates.status || returnReq.status;
    const finalCost = shipCost !== undefined ? shipCost : Number(returnReq.exchangeShippingCost) || 0;
    if (finalStatus === 'replaced') {
      updates.exchangeShippingExpenseId = await syncExchangeShippingExpense(returnReq, finalCost, req.user);
    } else if (returnReq.exchangeShippingExpenseId) {
      // reopened / rejected after being replaced: remove the expense
      updates.exchangeShippingExpenseId = await syncExchangeShippingExpense(returnReq, 0, req.user);
    }

    const updated = await db.returns.update(id, updates);

    // Notify the customer only when the status actually changes
    if (statusChanged) {
      await db.notifications.insert({
        userId: returnReq.userId,
        title: `تحديث طلب الاستبدال #${returnReq.returnNumber}`,
        message: status === 'rejected'
          ? `نأسف، تم رفض طلب استبدال "${returnReq.productTitle}". السبب: ${cleanReason}`
          : `تم تحديث حالة طلب الاستبدال لمنتج "${returnReq.productTitle}" إلى "${stage.label}".`,
        link: `#/returns?id=${returnReq.id}`,
        type: 'return',
        isRead: false
      });
    }

    await logActivity({
      userId: req.user.id,
      userName: req.user.name,
      userRole: req.user.role,
      action: 'UPDATE_RETURN_STATUS',
      module: 'returns',
      details: `قام بتحديث حالة طلب الاستبدال #${returnReq.returnNumber} إلى "${stage.label}"`,
      metadata: { returnId: id, newStatus: status }
    });

    res.json({
      success: true,
      message: `تم تحديث حالة طلب الاستبدال إلى "${stage.label}" وإشعار العميل بنجاح`,
      returnRequest: updated
    });
  } catch (err) {
    console.error('Update return status error:', err);
    res.status(500).json({ success: false, message: 'فشل تحديث حالة طلب الاستبدال' });
  }
});

module.exports = router;
