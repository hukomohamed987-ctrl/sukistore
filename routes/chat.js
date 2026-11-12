const express = require('express');
const router = express.Router();
const db = require('../database/db');
const { authenticate, optionalAuth, requirePermission } = require('../middleware/auth');
const { generateBotReply, WELCOME_MESSAGE } = require('../utils/chatbotEngine');
const { frontDesk, shorten, isEmptyAnswer } = require('../utils/supportBot');
const { v4: uuidv4 } = require('uuid');

// Shared helper to escalate a conversation cleanly to the human support queue
async function escalateConversation(conv, { customerName, phone, whatsapp, userId } = {}, baseMessages = null) {
  const safeName = (customerName || conv?.customer?.name || 'عميل سوقي ستور').trim();
  const safePhone = (phone || conv?.customer?.phone || '').trim();
  const safeWhatsapp = (whatsapp || conv?.customer?.whatsapp || safePhone || '').trim();

  const systemMsg = {
    id: uuidv4(),
    sender: 'system',
    text: `تم تحويلك إلى خدمة العملاء البشرية بنجاح 👨‍💼. أحد ممثلي الدعم الفني سيقوم بالرد عليك هنا في أقرب وقت.${safeWhatsapp ? ` كما يمكن التواصل معك عبر واتساب: ${safeWhatsapp}` : ''}`,
    timestamp: new Date().toISOString()
  };

  const msgs = Array.isArray(baseMessages)
    ? [...baseMessages, systemMsg]
    : (Array.isArray(conv?.messages) ? [...conv.messages, systemMsg] : [systemMsg]);

  const updated = await db.chats.update(conv.id, {
    status: 'waiting_agent',
    customer: {
      ...(conv.customer || {}),
      userId: userId || conv.customer?.userId || null,
      name: safeName,
      phone: safePhone,
      whatsapp: safeWhatsapp
    },
    escalatedAt: new Date().toISOString(),
    messages: msgs,
    updatedAt: new Date().toISOString()
  });

  await db.notifications.insert({
    role: 'staff',
    title: 'محادثة دعم فني جديدة في الانتظار!',
    message: `طلب العميل "${updated.customer.name}" (هاتف: ${updated.customer.phone || 'غير محدد'}) التحدث مع موظف دعم.`,
    chatId: conv.id,
    isRead: false
  });

  return updated;
}

// ----------------------------------------------------
// PUBLIC: Get Canonical Welcome Greeting
// ----------------------------------------------------
router.get('/welcome', (req, res) => {
  res.json({ success: true, welcomeMessage: WELCOME_MESSAGE });
});

// ----------------------------------------------------
// PUBLIC / AUTH: Send Message to Chatbot
// ----------------------------------------------------
router.post('/message', optionalAuth, async (req, res) => {
  try {
    const { conversationId, message, customerInfo } = req.body;

    if (!message || !message.trim()) {
      return res.status(400).json({ success: false, message: 'نص الرسالة مطلوب' });
    }

    const cleanMsg = message.trim();
    const verifiedInfo = req.user ? {
      userId: req.user.id,
      name: req.user.name || customerInfo?.name || 'عميل سوقي ستور',
      phone: req.user.phone || customerInfo?.phone || '',
      email: req.user.email || '',
      whatsapp: req.user.whatsappPhone || req.user.phone || customerInfo?.whatsapp || ''
    } : null;

    const mergedCustomerInfo = verifiedInfo || (customerInfo ? {
      name: customerInfo.name || 'زائر',
      phone: customerInfo.phone || '',
      email: customerInfo.email || '',
      whatsapp: customerInfo.whatsapp || ''
    } : null);

    let conv = null;
    if (conversationId) {
      conv = await db.chats.getById(conversationId);
    }

    if (!conv) {
      const newId = conversationId || uuidv4();
      conv = await db.chats.insert({
        id: newId,
        status: 'bot', // 'bot', 'waiting_agent', 'in_progress', 'resolved'
        claimedBy: null,
        customer: mergedCustomerInfo || { name: 'زائر', phone: '', email: '', whatsapp: '' },
        messages: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
    } else if (mergedCustomerInfo) {
      const nextCustomer = { ...(conv.customer || {}), ...mergedCustomerInfo };
      await db.chats.update(conv.id, { customer: nextCustomer });
      conv.customer = nextCustomer;
    }

    // Reopen resolved conversation under Bassam if customer writes back
    if (conv.status === 'resolved') {
      await db.chats.update(conv.id, { status: 'bot', claimedBy: null });
      conv.status = 'bot';
      conv.claimedBy = null;
    }

    const userMessageObj = {
      id: uuidv4(),
      sender: 'customer',
      text: cleanMsg,
      timestamp: new Date().toISOString()
    };

    const currentMessages = Array.isArray(conv.messages) ? [...conv.messages, userMessageObj] : [userMessageObj];

    // If conversation is already in staff queue or handled by staff:
    if (conv.status === 'waiting_agent' || conv.status === 'in_progress') {
      await db.chats.update(conv.id, {
        messages: currentMessages,
        updatedAt: new Date().toISOString()
      });

      return res.json({
        success: true,
        conversationId: conv.id,
        status: conv.status,
        claimedBy: conv.claimedBy,
        reply: null // Waiting for staff reply
      });
    }

    // 1) Front desk: short answers to common problems (order status, exchange, shipping, payment...)
    // 2) Otherwise the product engine, made short (max 3 products, no unrelated extras)
    // 3) Two useless answers in a row → offer / start a hand-off to a real staff member
    let botResult = await frontDesk(cleanMsg, conv, req.user || null);
    if (!botResult) {
      botResult = shorten(await generateBotReply(cleanMsg, conv, req.user || null));
      const misses = (Number(conv.botMisses) || 0) + (isEmptyAnswer(botResult) ? 1 : 0);
      conv.botMisses = isEmptyAnswer(botResult) ? misses : 0;
      if (isEmptyAnswer(botResult)) {
        botResult.text = misses >= 2
          ? 'معلش مش قادر أساعدك في ده كويس. هحوّلك لموظف خدمة العملاء يكمل معاك 👨‍💼'
          : 'مش متأكد إني فهمت قصدك 🙏 ممكن توضّح أكتر (اسم المنتج أو المشكلة)؟ أو أحولك لموظف.';
        botResult.suggestions = ['كلّم موظف', 'طلبي فين؟'];
        botResult.canEscalate = true;
        if (misses >= 2) { botResult.autoEscalateRequested = true; botResult.openEscalateBox = true; }
      }
    } else {
      conv.botMisses = 0;
    }
    await db.chats.update(conv.id, { botMisses: conv.botMisses || 0 });
    const botMessageObj = {
      id: uuidv4(),
      sender: 'bot',
      text: botResult.text,
      canEscalate: Boolean(botResult.canEscalate),
      escalationSuggested: Boolean(botResult.escalationSuggested),
      openEscalateBox: Boolean(botResult.openEscalateBox),
      intent: botResult.intent || 'general',
      suggestions: botResult.suggestions || [],
      products: botResult.products || [],
      alternatives: botResult.alternatives || [],
      complementary: botResult.complementary || [],
      timestamp: new Date().toISOString()
    };

    currentMessages.push(botMessageObj);

    const shouldEscalateNow = Boolean(botResult.autoEscalateNow || (botResult.autoEscalateRequested && (verifiedInfo?.phone || conv.customer?.phone)));

    if (shouldEscalateNow) {
      const updated = await escalateConversation(conv, {
        userId: verifiedInfo?.userId,
        customerName: verifiedInfo?.name || conv.customer?.name,
        phone: verifiedInfo?.phone || conv.customer?.phone,
        whatsapp: verifiedInfo?.whatsapp || conv.customer?.whatsapp
      }, currentMessages);

      return res.json({
        success: true,
        conversationId: conv.id,
        status: updated.status,
        escalated: true,
        reply: botMessageObj,
        conversation: updated
      });
    }

    await db.chats.update(conv.id, {
      messages: currentMessages,
      updatedAt: new Date().toISOString()
    });

    res.json({
      success: true,
      conversationId: conv.id,
      status: conv.status,
      escalated: false,
      openEscalateBox: Boolean(botResult.openEscalateBox || (botResult.autoEscalateRequested && !shouldEscalateNow)),
      reply: botMessageObj
    });
  } catch (err) {
    console.error('Chat message error:', err);
    res.status(500).json({ success: false, message: 'فشل إرسال الرسالة' });
  }
});

// ----------------------------------------------------
// PUBLIC / AUTH: Request Human Escalation
// ----------------------------------------------------
router.post('/escalate', optionalAuth, async (req, res) => {
  try {
    const { conversationId, customerName, phone, whatsapp } = req.body;

    const finalName = customerName || req.user?.name || 'عميل سوقي ستور';
    const finalPhone = phone || req.user?.phone || '';
    const finalWhatsapp = whatsapp || req.user?.whatsappPhone || finalPhone;

    let conv = conversationId ? await db.chats.getById(conversationId) : null;
    if (!conv) {
      conv = await db.chats.insert({
        id: conversationId || uuidv4(),
        status: 'waiting_agent',
        claimedBy: null,
        customer: {
          userId: req.user?.id || null,
          name: finalName,
          phone: finalPhone,
          whatsapp: finalWhatsapp
        },
        messages: [],
        createdAt: new Date().toISOString()
      });
    }

    const updated = await escalateConversation(conv, {
      userId: req.user?.id,
      customerName: finalName,
      phone: finalPhone,
      whatsapp: finalWhatsapp
    });

    res.json({
      success: true,
      message: 'تم تحويل المحادثة لفريق الدعم، سيتم الرد عليك في أقرب لحظة',
      conversation: updated
    });
  } catch (err) {
    console.error('Chat escalate error:', err);
    res.status(500).json({ success: false, message: 'فشل تحويل المحادثة' });
  }
});

// ----------------------------------------------------
// PUBLIC / ADMIN: Get single conversation messages
// ----------------------------------------------------
router.get('/conversations/:id', optionalAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const conv = await db.chats.getById(id);
    if (!conv) {
      return res.status(404).json({ success: false, message: 'المحادثة غير موجودة' });
    }
    // SECURITY: a conversation linked to an account is readable only by that account (or staff)
    if (conv.userId) {
      const viewer = req.user;
      const isStaff = viewer && viewer.role !== 'customer';
      if (!viewer || (!isStaff && String(viewer.id) !== String(conv.userId))) {
        return res.status(404).json({ success: false, message: 'المحادثة غير موجودة' });
      }
    }
    res.json({ success: true, conversation: conv });
  } catch (err) {
    res.status(500).json({ success: false, message: 'فشل جلب المحادثة' });
  }
});

// ----------------------------------------------------
// ADMIN / STAFF: List all conversations
// ----------------------------------------------------
router.get('/conversations', authenticate, requirePermission('canManageSupport'), async (req, res) => {
  try {
    const { status } = req.query;
    let chats = await db.chats.getAll();

    if (status && status !== 'all') {
      chats = chats.filter(c => c.status === status);
    }

    chats.sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt));

    res.json({ success: true, count: chats.length, chats });
  } catch (err) {
    res.status(500).json({ success: false, message: 'فشل جلب المحادثات' });
  }
});

// ----------------------------------------------------
// ADMIN / STAFF: Claim conversation (First to reply locks it)
// ----------------------------------------------------
router.post('/conversations/:id/claim', authenticate, requirePermission('canManageSupport'), async (req, res) => {
  try {
    const { id } = req.params;
    const conv = await db.chats.getById(id);
    if (!conv) {
      return res.status(404).json({ success: false, message: 'المحادثة غير موجودة' });
    }

    // Check if already claimed by someone else
    if (conv.claimedBy && conv.claimedBy.id !== req.user.id && conv.status === 'in_progress') {
      return res.status(409).json({
        success: false,
        message: `هذه المحادثة مستلمة بالفعل بواسطة زميلك: ${conv.claimedBy.name}`
      });
    }

    const claimMsg = {
      id: uuidv4(),
      sender: 'staff',
      staffName: req.user.name,
      text: `أهلاً بك يا فندم! معك ${req.user.name} من فريق الدعم الفني في سوقي ستور. كيف يمكنني مساعدتك؟ 😊`,
      timestamp: new Date().toISOString()
    };

    const currentMessages = Array.isArray(conv.messages) ? [...conv.messages, claimMsg] : [claimMsg];

    const updated = await db.chats.update(id, {
      status: 'in_progress',
      claimedBy: {
        id: req.user.id,
        name: req.user.name,
        role: req.user.role
      },
      claimedAt: new Date().toISOString(),
      messages: currentMessages,
      updatedAt: new Date().toISOString()
    });

    res.json({
      success: true,
      message: 'تم استلام المحادثة وتثبيتها باسمك بنجاح',
      conversation: updated
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'فشل استلام المحادثة' });
  }
});

// ----------------------------------------------------
// ADMIN / STAFF: Reply to conversation
// ----------------------------------------------------
router.post('/conversations/:id/reply', authenticate, requirePermission('canManageSupport'), async (req, res) => {
  try {
    const { id } = req.params;
    const { message } = req.body;

    if (!message || !message.trim()) {
      return res.status(400).json({ success: false, message: 'نص الرد مطلوب' });
    }

    const conv = await db.chats.getById(id);
    if (!conv) {
      return res.status(404).json({ success: false, message: 'المحادثة غير موجودة' });
    }

    const staffMsg = {
      id: uuidv4(),
      sender: 'staff',
      staffName: req.user.name,
      text: message.trim(),
      timestamp: new Date().toISOString()
    };

    const currentMessages = Array.isArray(conv.messages) ? [...conv.messages, staffMsg] : [staffMsg];

    const updated = await db.chats.update(id, {
      status: 'in_progress',
      claimedBy: conv.claimedBy || { id: req.user.id, name: req.user.name, role: req.user.role },
      messages: currentMessages,
      updatedAt: new Date().toISOString()
    });

    res.json({
      success: true,
      message: 'تم إرسال الرد بنجاح',
      conversation: updated
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'فشل إرسال الرد' });
  }
});

// ----------------------------------------------------
// ADMIN / STAFF: Resolve / Close conversation
// ----------------------------------------------------
router.put('/conversations/:id/resolve', authenticate, requirePermission('canManageSupport'), async (req, res) => {
  try {
    const { id } = req.params;
    const conv = await db.chats.getById(id);
    if (!conv) {
      return res.status(404).json({ success: false, message: 'المحادثة غير موجودة' });
    }

    const resolveMsg = {
      id: uuidv4(),
      sender: 'system',
      text: 'تم إغلاق المحادثة بنجاح بواسطة فريق الدعم. شكراً لتواصلك مع سوقي ستور ونراك قريباً! ⭐',
      timestamp: new Date().toISOString()
    };

    const currentMessages = Array.isArray(conv.messages) ? [...conv.messages, resolveMsg] : [resolveMsg];

    const updated = await db.chats.update(id, {
      status: 'resolved',
      resolvedAt: new Date().toISOString(),
      resolvedBy: { id: req.user.id, name: req.user.name },
      messages: currentMessages,
      updatedAt: new Date().toISOString()
    });

    res.json({
      success: true,
      message: 'تم إنهاء المحادثة بنجاح',
      conversation: updated
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'فشل إغلاق المحادثة' });
  }
});

module.exports = router;
