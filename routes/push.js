const express = require('express');
const router = express.Router();
const db = require('../database/db');
const { v4: uuidv4 } = require('uuid');
const { authenticate, requirePermission, isSuperAdmin } = require('../middleware/auth');

// Keep ONE in-app copy per push campaign. Re-sending (manually or on a repeat
// schedule) moves that copy back to the top as unread instead of adding another.
async function upsertBroadcastNotification(push) {
  const message = push.body || push.message || '';
  const url = push.url || push.targetUrl || '#/products';
  const nowIso = new Date().toISOString();
  const existing = await db.notifications.findOne(n =>
    n.type === 'push_broadcast' && (
      (n.pushId && String(n.pushId) === String(push.id)) ||
      (!n.pushId && n.title === push.title && n.message === message && (n.url || '') === url)
    )
  );
  if (existing) {
    return db.notifications.update(existing.id, {
      pushId: push.id,
      createdAt: nowIso,
      readBy: [],
      isRead: false
    });
  }
  return db.notifications.insert({
    pushId: push.id,
    role: 'customer',
    title: push.title,
    message,
    url,
    type: 'push_broadcast',
    targetAudience: push.targetAudience || 'all',
    isRead: false,
    createdAt: nowIso
  });
}

// SECURITY: only super admins and staff with the "push" permission manage notifications
function canManagePush(user) {
  if (!user) return false;
  if (isSuperAdmin(user)) return true;
  return user.role === 'staff' && user.isActive !== false && Boolean(user.permissions?.canManagePush);
}
const { logActivity } = require('../utils/activityLogger');

// ----------------------------------------------------
// 1. CLIENT: SUBSCRIBE TO WEB PUSH NOTIFICATIONS
// ----------------------------------------------------
router.post('/subscribe', async (req, res) => {
  try {
    const { endpoint, token: customToken, keys, userAgent } = req.body;
    const token = customToken || endpoint || uuidv4();

    const existing = await db.push_subscriptions.findOne(s => s.endpoint === token || (s.token && s.token === token));
    if (existing) {
      return res.json({ success: true, message: 'مشترك بالفعل في الإشعارات', subscription: existing });
    }

    const sub = await db.push_subscriptions.insert({
      id: uuidv4(),
      endpoint: token,
      token,
      keys: keys || {},
      userAgent: userAgent || req.headers['user-agent'] || '',
      ip: req.ip,
      isActive: true,
      createdAt: new Date().toISOString()
    });

    res.status(200).json({
      success: true,
      message: 'تم تفعيل إشعارات المتجر بنجاح! ستصلك أحدث العروض والخصومات 🔔',
      subscription: sub
    });
  } catch (err) {
    console.error('Push subscribe error:', err);
    res.status(500).json({ success: false, message: 'فشل الاشتراك في الإشعارات' });
  }
});

// ----------------------------------------------------
// 2. CLIENT: UNSUBSCRIBE
// ----------------------------------------------------
router.post('/unsubscribe', async (req, res) => {
  try {
    const { endpoint } = req.body;
    if (endpoint) {
      const sub = await db.push_subscriptions.findOne(s => s.endpoint === endpoint || s.token === endpoint);
      if (sub) {
        await db.push_subscriptions.delete(sub.id);
      }
    }
    res.json({ success: true, message: 'تم إلغاء الاشتراك في الإشعارات' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'فشل إلغاء الاشتراك' });
  }
});

// ----------------------------------------------------
// 3. ADMIN: GET SUBSCRIBERS COUNT & STATS
// ----------------------------------------------------
router.get('/stats', authenticate, async (req, res) => {
  try {
    if (!canManagePush(req.user)) {
      return res.status(403).json({ success: false, message: 'غير مصرح بالدخول' });
    }

    const subs = await db.push_subscriptions.getAll();
    const history = await db.push_notifications.getAll();

    res.json({
      success: true,
      activeSubscribers: subs.length,
      totalBroadcastsSent: history.length,
      stats: {
        totalSubscribers: subs.length,
        totalSent: history.length
      },
      recentHistory: history.slice(0, 10)
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'فشل جلب إحصائيات الإشعارات' });
  }
});

// ----------------------------------------------------
// 4. ADMIN: SEND PUSH NOTIFICATION (BROADCAST)
// ----------------------------------------------------
router.post('/send', authenticate, async (req, res) => {
  try {
    if (!canManagePush(req.user)) {
      return res.status(403).json({ success: false, message: 'غير مصرح بإرسال الإشعارات' });
    }

    const title = (req.body.title || '').trim();
    const bodyText = (req.body.body || req.body.message || '').trim();
    const targetUrl = (req.body.url || req.body.targetUrl || '#/products').trim();
    const icon = req.body.icon || req.body.iconUrl || '/favicon.ico';
    const type = req.body.type || 'discount';
    const targetAudience = req.body.targetAudience || 'all'; // 'all' | 'registered' | 'guests'
    const repeatHours = Number(req.body.repeatHours) || 0; // 0 = one-time, 2, 4, 6, 12, 24, etc.

    if (!title || !bodyText) {
      return res.status(400).json({ success: false, message: 'عنوان الإشعار ونص الرسالة مطلوبان' });
    }

    const subs = await db.push_subscriptions.getAll();
    const nowIso = new Date().toISOString();
    const notificationRecord = await db.push_notifications.insert({
      id: uuidv4(),
      title,
      body: bodyText,
      message: bodyText,
      url: targetUrl,
      targetUrl,
      icon,
      iconUrl: icon,
      type, // 'new_product' | 'discount' | 'price_drop' | 'general'
      targetAudience, // 'all' | 'registered' | 'guests'
      repeatHours,
      resendCount: 0,
      sentBy: {
        id: req.user.id,
        name: req.user.name,
        role: req.user.role
      },
      recipientsCount: subs.length,
      sentAt: nowIso,
      lastResentAt: nowIso
    });

    // Also insert into customer in-app notifications
    await upsertBroadcastNotification(notificationRecord);

    await logActivity({
      userId: req.user.id,
      userName: req.user.name,
      userRole: req.user.role,
      action: 'SEND_PUSH_NOTIFICATION',
      module: 'push',
      details: `قام بإرسال إشعار فوري: "${title}" إلى ${subs.length} مشترك (الفئة: ${targetAudience})`,
      metadata: { notificationId: notificationRecord.id, type, targetAudience }
    });

    res.status(200).json({
      success: true,
      recipientsCount: subs.length,
      message: `تم إرسال الإشعار الفوري بنجاح إلى ${subs.length} عميل مشترك 🚀`,
      notification: notificationRecord
    });
  } catch (err) {
    console.error('Send push error:', err);
    res.status(500).json({ success: false, message: 'فشل إرسال الإشعار' });
  }
});

// ----------------------------------------------------
// 5. ADMIN: UPDATE PUSH NOTIFICATION
// ----------------------------------------------------
router.put('/:id', authenticate, async (req, res) => {
  try {
    if (!canManagePush(req.user)) {
      return res.status(403).json({ success: false, message: 'غير مصرح بتعديل الإشعارات' });
    }
    const { id } = req.params;
    const notif = await db.push_notifications.getById(id);
    if (!notif) {
      return res.status(404).json({ success: false, message: 'الإشعار غير موجود' });
    }

    const title = (req.body.title || notif.title || '').trim();
    const bodyText = (req.body.body || req.body.message || notif.message || '').trim();
    const targetUrl = (req.body.url || req.body.targetUrl || notif.targetUrl || '#/products').trim();
    const targetAudience = req.body.targetAudience || notif.targetAudience || 'all';
    const type = req.body.type || notif.type || 'general';
    const repeatHours = req.body.repeatHours !== undefined ? Number(req.body.repeatHours) : (notif.repeatHours || 0);

    const updated = await db.push_notifications.update(id, {
      title,
      body: bodyText,
      message: bodyText,
      url: targetUrl,
      targetUrl,
      targetAudience,
      repeatHours,
      type,
      updatedAt: new Date().toISOString()
    });

    await logActivity({
      userId: req.user.id,
      userName: req.user.name,
      userRole: req.user.role,
      action: 'UPDATE_PUSH_NOTIFICATION',
      module: 'push',
      details: `قام بتعديل الإشعار: "${title}"`,
      metadata: { notificationId: id }
    });

    res.json({ success: true, message: 'تم تعديل الإشعار بنجاح', notification: updated });
  } catch (err) {
    console.error('Update push error:', err);
    res.status(500).json({ success: false, message: 'فشل تعديل الإشعار' });
  }
});

// ----------------------------------------------------
// 6. ADMIN: DELETE PUSH NOTIFICATION
// ----------------------------------------------------
router.delete('/:id', authenticate, async (req, res) => {
  try {
    if (!canManagePush(req.user)) {
      return res.status(403).json({ success: false, message: 'غير مصرح بحذف الإشعارات' });
    }
    const { id } = req.params;
    const notif = await db.push_notifications.getById(id);
    if (!notif) {
      return res.status(404).json({ success: false, message: 'الإشعار غير موجود' });
    }

    await db.push_notifications.delete(id);

    await logActivity({
      userId: req.user.id,
      userName: req.user.name,
      userRole: req.user.role,
      action: 'DELETE_PUSH_NOTIFICATION',
      module: 'push',
      details: `قام بحذف الإشعار: "${notif.title}"`,
      metadata: { notificationId: id }
    });

    res.json({ success: true, message: 'تم حذف الإشعار بنجاح' });
  } catch (err) {
    console.error('Delete push error:', err);
    res.status(500).json({ success: false, message: 'فشل حذف الإشعار' });
  }
});

// ----------------------------------------------------
// 7. ADMIN: RESEND PUSH NOTIFICATION
// ----------------------------------------------------
router.post('/resend/:id', authenticate, async (req, res) => {
  try {
    if (!canManagePush(req.user)) {
      return res.status(403).json({ success: false, message: 'غير مصرح بإعادة إرسال الإشعارات' });
    }
    const { id } = req.params;
    const notif = await db.push_notifications.getById(id);
    if (!notif) {
      return res.status(404).json({ success: false, message: 'الإشعار غير موجود' });
    }

    const subs = await db.push_subscriptions.getAll();
    const updated = await db.push_notifications.update(id, {
      resendCount: (notif.resendCount || 0) + 1,
      lastResentAt: new Date().toISOString(),
      recipientsCount: subs.length
    });

    // Refresh the single in-app copy for customers (no duplicates)
    await upsertBroadcastNotification(notif);

    await logActivity({
      userId: req.user.id,
      userName: req.user.name,
      userRole: req.user.role,
      action: 'RESEND_PUSH_NOTIFICATION',
      module: 'push',
      details: `قام بإعادة إرسال الإشعار: "${notif.title}" إلى ${subs.length} مشترك`,
      metadata: { notificationId: id }
    });

    res.json({
      success: true,
      message: `تمت إعادة إرسال الإشعار بنجاح إلى ${subs.length} مشترك 🚀`,
      notification: updated
    });
  } catch (err) {
    console.error('Resend push error:', err);
    res.status(500).json({ success: false, message: 'فشل إعادة إرسال الإشعار' });
  }
});

// Background Recurring Push Notifications Processor (Checks every 60 seconds)
setInterval(async () => {
  try {
    const allNotifications = await db.push_notifications.getAll();
    const repeating = allNotifications.filter(n => Number(n.repeatHours) > 0);
    const now = Date.now();

    for (const notif of repeating) {
      const intervalMs = Number(notif.repeatHours) * 60 * 60 * 1000;
      const lastSentTime = new Date(notif.lastResentAt || notif.sentAt || 0).getTime();

      if (now - lastSentTime >= intervalMs) {
        const subs = await db.push_subscriptions.getAll();
        const newResendCount = (Number(notif.resendCount) || 0) + 1;
        const nowIso = new Date().toISOString();

        await db.push_notifications.update(notif.id, {
          lastResentAt: nowIso,
          resendCount: newResendCount,
          recipientsCount: subs.length
        });

        await upsertBroadcastNotification(notif);

        console.log(`🔔 [RECURRING PUSH] Auto-resent notification "${notif.title}" (Repeat: every ${notif.repeatHours}h, Count: #${newResendCount})`);
      }
    }
  } catch (err) {
    // Silent catch for background job
  }
}, 60000);

// ----------------------------------------------------
// 8. GET RECENT SENT PUSH NOTIFICATIONS HISTORY
// ----------------------------------------------------
router.get('/history', authenticate, async (req, res) => {
  try {
    if (!canManagePush(req.user)) {
      return res.status(403).json({ success: false, message: 'غير مصرح بالدخول' });
    }
    const history = await db.push_notifications.getAll();
    history.sort((a, b) => new Date(b.sentAt || b.createdAt) - new Date(a.sentAt || a.createdAt));
    res.json({ success: true, count: history.length, history });
  } catch (err) {
    res.status(500).json({ success: false, message: 'فشل جلب سجل الإشعارات' });
  }
});

// ----------------------------------------------------
// 9. CLIENT: GET LATEST UNREAD PUSH FOR ACTIVE TAB
// ----------------------------------------------------
router.get('/latest', async (req, res) => {
  try {
    const history = await db.push_notifications.getAll();
    history.sort((a, b) => new Date(b.sentAt || b.createdAt) - new Date(a.sentAt || a.createdAt));
    const latest = history.length > 0 ? history[0] : null;
    res.json({ success: true, latest, notification: latest });
  } catch (err) {
    res.status(500).json({ success: false, message: 'فشل جلب الإشعار' });
  }
});

module.exports = router;
