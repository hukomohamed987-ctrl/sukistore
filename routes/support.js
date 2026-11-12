const express = require('express');
const router = express.Router();
const db = require('../database/db');
const { authenticate, optionalAuth, requirePermission } = require('../middleware/auth');
const { sendEmail, storeEmailHtml } = require('../utils/mailer');

const STATUSES = ['unread', 'in_progress', 'resolved'];

// What the customer is allowed to see of their own message (never the internal notes)
const customerView = m => ({
  id: m.id, subject: m.subject, message: m.message, status: m.status, createdAt: m.createdAt,
  replies: (m.replies || []).map(r => ({ text: r.text, byName: 'فريق سوقي ستور', at: r.at }))
});

// Public: Submit support / contact message (linked to the account when logged in)
router.post('/', optionalAuth, async (req, res) => {
  try {
    const { name, email, phone, subject, message } = req.body;

    if (!name || !message || (!email && !phone)) {
      return res.status(400).json({
        success: false,
        message: 'يُرجى إدخال الاسم، والرسالة، ووسيلة اتصال (بريد إلكتروني أو رقم جوال)'
      });
    }

    const cleanEmail = String(email || '').trim().toLowerCase();
    let userId = req.user ? req.user.id : null;
    if (!userId && cleanEmail) {
      const u = await db.users.findOne(x => x.email && x.email.toLowerCase() === cleanEmail && x.role === 'customer');
      if (u) userId = u.id;
    }

    const newMessage = await db.support.insert({
      userId,
      name: String(name).trim().slice(0, 100),
      email: cleanEmail,
      phone: String(phone || '').trim().slice(0, 30),
      subject: String(subject || 'استفسار عام').trim().slice(0, 150),
      message: String(message).trim().slice(0, 3000),
      status: 'unread', // unread, in_progress, resolved
      replyNotes: '',
      replies: []
    });

    res.status(201).json({
      success: true,
      message: 'تم إرسال رسالتك بنجاح! سيقوم فريق خدمة العملاء بالتواصل معك في أقرب وقت.',
      messageId: newMessage.id
    });
  } catch (err) {
    console.error('Support message error:', err);
    res.status(500).json({ success: false, message: 'فشل إرسال الرسالة' });
  }
});

// Customer: my messages and the store's replies
router.get('/my', authenticate, async (req, res) => {
  try {
    const email = String(req.user.email || '').toLowerCase();
    const mine = await db.support.find(m => String(m.userId) === String(req.user.id) || (email && !m.userId && m.email === email));
    mine.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    res.json({ success: true, messages: mine.map(customerView) });
  } catch (err) {
    res.status(500).json({ success: false, message: 'فشل جلب رسائلك' });
  }
});

// Admin: Get all support messages
router.get('/', authenticate, requirePermission('canManageSupport'), async (req, res) => {
  try {
    const messages = await db.support.getAll();
    messages.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    res.json({ success: true, count: messages.length, messages });
  } catch (err) {
    res.status(500).json({ success: false, message: 'فشل جلب رسائل الدعم' });
  }
});

// Admin: send a reply that REACHES the customer (in-app notification + e-mail when possible)
router.post('/:id/reply', authenticate, requirePermission('canManageSupport'), async (req, res) => {
  try {
    const existing = await db.support.getById(req.params.id);
    if (!existing) return res.status(404).json({ success: false, message: 'الرسالة غير موجودة' });
    const text = String(req.body.text || '').trim().slice(0, 3000);
    if (text.length < 2) return res.status(400).json({ success: false, message: 'اكتب الرد الأول' });

    const reply = { text, by: req.user.id, byName: req.user.name, at: new Date().toISOString(), channels: [] };

    let userId = existing.userId || null;
    if (!userId && existing.email) {
      const u = await db.users.findOne(x => x.email && x.email.toLowerCase() === existing.email && x.role === 'customer');
      if (u) userId = u.id;
    }
    if (userId) {
      await db.notifications.insert({
        userId,
        title: `رد على رسالتك: ${existing.subject || 'استفسار'}`,
        message: text.length > 220 ? text.slice(0, 220) + '…' : text,
        link: '#/support',
        isRead: false
      });
      reply.channels.push('notification');
    }
    if (existing.email) {
      const mail = await sendEmail({
        to: existing.email,
        subject: `رد سوقي ستور على رسالتك: ${existing.subject || 'استفسار'}`,
        html: storeEmailHtml(`أهلاً ${existing.name || ''}، ده رد فريق خدمة العملاء على رسالتك`, `${text}\n\n— رسالتك: ${existing.message}`)
      });
      if (mail.ok) reply.channels.push('email');
    }

    const status = STATUSES.includes(req.body.status) ? req.body.status : 'resolved';
    const updated = await db.support.update(existing.id, {
      userId,
      status,
      replies: [...(existing.replies || []), reply]
    });

    const where = reply.channels.length
      ? reply.channels.map(c => (c === 'email' ? 'الإيميل' : 'إشعار في حسابه')).join(' + ')
      : null;
    res.json({
      success: true,
      message: where ? `تم إرسال الرد للعميل (${where})` : 'تم حفظ الرد، لكن العميل مالوش حساب ولا الإيميل اتبعت. كلّمه على التليفون/واتساب.',
      delivered: reply.channels,
      supportMessage: updated
    });
  } catch (err) {
    console.error('Support reply error:', err);
    res.status(500).json({ success: false, message: 'فشل إرسال الرد' });
  }
});

// Admin: Update status / internal notes
router.put('/:id', authenticate, requirePermission('canManageSupport'), async (req, res) => {
  try {
    const { id } = req.params;
    const { status, replyNotes } = req.body;

    const existing = await db.support.getById(id);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'الرسالة غير موجودة' });
    }

    const updates = {};
    if (status && STATUSES.includes(status)) updates.status = status;
    if (replyNotes !== undefined) updates.replyNotes = String(replyNotes).slice(0, 3000);

    const updated = await db.support.update(id, updates);

    res.json({
      success: true,
      message: 'تم تحديث حالة الرسالة بنجاح',
      supportMessage: updated
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'فشل تحديث الرسالة' });
  }
});

// Admin: Delete support message
router.delete('/:id', authenticate, requirePermission('canManageSupport'), async (req, res) => {
  try {
    const { id } = req.params;
    await db.support.delete(id);
    res.json({ success: true, message: 'تم حذف الرسالة بنجاح' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'فشل حذف الرسالة' });
  }
});

module.exports = router;
