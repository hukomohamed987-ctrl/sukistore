const express = require('express');
const router = express.Router();
const db = require('../database/db');
const { v4: uuidv4 } = require('uuid');
const { optionalAuth, authenticate, requirePermission } = require('../middleware/auth');
const { logActivity } = require('../utils/activityLogger');

// Helper to check if a notification is read by a given user
function isNotificationRead(n, user) {
  if (!user) return false;
  if (n.userId && String(n.userId) === String(user.id)) {
    return Boolean(n.isRead);
  }
  if (Array.isArray(n.readBy) && n.readBy.includes(user.id)) {
    return true;
  }
  return false;
}

// 1. Get notifications (Supports both registered users and guests)
router.get('/', optionalAuth, async (req, res) => {
  try {
    const allNotifs = await db.notifications.getAll();
    const user = req.user;

    let userNotifs = [];

    if (user) {
      userNotifs = allNotifs.filter(n => {
        // Targeted specifically to this user
        if (n.userId && String(n.userId) === String(user.id)) return true;
        // Targeted to all users
        if (n.target === 'all' || n.targetAudience === 'all' || n.userId === 'all') return true;
        // Targeted to registered users
        if (n.target === 'registered' || n.targetAudience === 'registered') return true;
        // Default customer broadcast
        if (!n.userId && (!n.target || n.target === 'customer' || n.role === 'customer')) return true;
        return false;
      });
    } else {
      // Guest: only public broadcast
      userNotifs = allNotifs.filter(n => {
        return n.target === 'all' || n.targetAudience === 'all' || n.userId === 'all';
      });
    }

    userNotifs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    // Older versions stored a new copy of a broadcast every time it was re-sent.
    // Show each broadcast once (the newest copy).
    const seenBroadcasts = new Set();
    userNotifs = userNotifs.filter(n => {
      // Personal notifications (order updates, points ...) are always kept
      if (n.userId && n.userId !== 'all') return true;
      // Same text = same broadcast for the customer, whichever campaign re-sent it
      const key = `t:${n.title}|${n.message}|${n.url || ''}`;
      if (seenBroadcasts.has(key)) return false;
      seenBroadcasts.add(key);
      return true;
    });

    // Limit to latest 50 notifications
    const limited = userNotifs.slice(0, 50).map(n => {
      // SECURITY: never expose which other users read a broadcast
      const { readBy, ...rest } = n;
      return { ...rest, isRead: isNotificationRead(n, user) };
    });

    const unreadCount = user ? limited.filter(n => !n.isRead).length : 0;

    res.json({
      success: true,
      unreadCount,
      notifications: limited
    });
  } catch (err) {
    console.error('Fetch notifications error:', err);
    res.status(500).json({ success: false, message: 'فشل جلب الإشعارات' });
  }
});

// 2. Mark single notification as read
router.put('/:id/read', optionalAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const notif = await db.notifications.getById(id);
    if (!notif) {
      return res.status(404).json({ success: false, message: 'الإشعار غير موجود' });
    }

    const user = req.user;
    if (user) {
      if (notif.userId && String(notif.userId) === String(user.id)) {
        await db.notifications.update(id, { isRead: true });
      } else {
        const readBy = Array.isArray(notif.readBy) ? notif.readBy : [];
        if (!readBy.includes(user.id)) {
          readBy.push(user.id);
          await db.notifications.update(id, { readBy });
        }
      }
    }

    res.json({ success: true, message: 'تم تحديث الإشعار' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'فشل تحديث الإشعار' });
  }
});

// 3. Mark all visible notifications as read
router.put('/mark-all-read', authenticate, async (req, res) => {
  try {
    const user = req.user;
    const allNotifs = await db.notifications.getAll();

    for (const notif of allNotifs) {
      if (notif.userId && String(notif.userId) === String(user.id)) {
        if (!notif.isRead) {
          await db.notifications.update(notif.id, { isRead: true });
        }
      } else if (
        notif.target === 'all' || 
        notif.targetAudience === 'all' || 
        notif.target === 'registered' || 
        notif.targetAudience === 'registered' ||
        notif.userId === 'all'
      ) {
        const readBy = Array.isArray(notif.readBy) ? [...notif.readBy] : [];
        if (!readBy.includes(user.id)) {
          readBy.push(user.id);
          await db.notifications.update(notif.id, { readBy });
        }
      }
    }

    res.json({ success: true, message: 'تم تحديد جميع الإشعارات كمقروءة' });
  } catch (err) {
    console.error('Mark all read error:', err);
    res.status(500).json({ success: false, message: 'فشل التحديث' });
  }
});

// 4. Admin / Staff: Broadcast notification to all or registered users
router.post('/broadcast', authenticate, async (req, res) => {
  try {
    // SECURITY: only super admins or staff with the push permission can broadcast
    const isSuperOrStaff = req.user.role === 'super_admin' ||
      (req.user.role === 'staff' && req.user.isActive !== false && Boolean(req.user.permissions?.canManagePush));
    if (!isSuperOrStaff) {
      return res.status(403).json({ success: false, message: 'غير مصرح بإرسال الإشعارات' });
    }

    const { title, message, url, link, target = 'all', icon, type = 'general' } = req.body;
    if (!title || !message) {
      return res.status(400).json({ success: false, message: 'عنوان الإشعار ونص الرسالة مطلوبان' });
    }

    const targetUrl = link || url || '#/';
    const targetAudience = target === 'registered' ? 'registered' : 'all';

    const notifRecord = await db.notifications.insert({
      id: uuidv4(),
      title: title.trim(),
      message: message.trim(),
      body: message.trim(),
      url: targetUrl,
      link: targetUrl,
      target: targetAudience,
      targetAudience,
      icon: icon || '/favicon.ico',
      type,
      isRead: false,
      readBy: [],
      sentBy: {
        id: req.user.id,
        name: req.user.name,
        role: req.user.role
      },
      createdAt: new Date().toISOString()
    });

    // Also record in push_notifications for Web & PWA push logs
    try {
      const subs = await db.push_subscriptions.getAll();
      await db.push_notifications.insert({
        id: uuidv4(),
        title: title.trim(),
        body: message.trim(),
        message: message.trim(),
        url: targetUrl,
        icon: icon || '/favicon.ico',
        type,
        targetAudience,
        recipientsCount: subs.length,
        sentAt: new Date().toISOString()
      });
    } catch (e) {
      // Non-blocking push history save
    }

    await logActivity({
      userId: req.user.id,
      userName: req.user.name,
      userRole: req.user.role,
      action: 'BROADCAST_NOTIFICATION',
      module: 'notifications',
      details: `قام بإرسال إشعار عام: "${title}" إلى (${targetAudience === 'registered' ? 'المسجلين فقط' : 'جميع المستخدمين والزوار'})`
    });

    res.json({
      success: true,
      message: `تم إرسال الإشعار بنجاح إلى (${targetAudience === 'registered' ? 'المستخدمين المسجلين فقط' : 'جميع المستخدمين والزوار'}) 🚀`,
      notification: notifRecord
    });
  } catch (err) {
    console.error('Broadcast error:', err);
    res.status(500).json({ success: false, message: 'فشل إرسال الإشعار' });
  }
});

module.exports = router;