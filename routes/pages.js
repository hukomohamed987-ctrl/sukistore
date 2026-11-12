/**
 * Editable store pages: About us, Privacy policy, Terms & conditions (Arabic + English).
 * Text format (simple, safe): "## " = heading, "- " = bullet, empty line = new paragraph.
 */
const express = require('express');
const router = express.Router();
const db = require('../database/db');
const { authenticate, isSuperAdmin } = require('../middleware/auth');
const { logActivity } = require('../utils/activityLogger');

const DEFAULTS = {
  about: {
    title: 'من نحن',
    body: `**سوقي ستور** وجهتك للتسوق الإلكتروني في مصر: منتجات مختارة بعناية، أسعار واضحة، وتوصيل لكل المحافظات.

## رسالتنا
نخلّي التسوق سهل ومريح: تختار المنتج بوضوح، تدفع بالطريقة اللي تناسبك، وطلبك يوصلك لحد باب البيت.

## ليه سوقي ستور؟
- منتجات أصلية ومضمونة
- شحن سريع لكل المحافظات، ومنتجات كتير شحنها مجاني
- الدفع عند الاستلام
- استبدال خلال 14 يوم لعيوب الصناعة، والشحن علينا
- خدمة عملاء بترد عليك بسرعة`,
    title_en: 'About us',
    body_en: `**Souqy Store** is your online shopping destination in Egypt: carefully chosen products, clear prices and delivery to every governorate.

## Our mission
Make shopping easy: pick your product clearly, pay the way you like, and get it delivered to your door.

## Why Souqy Store?
- Genuine, guaranteed products
- Fast delivery everywhere, many products with free shipping
- Cash on delivery
- 14-day exchange for manufacturing defects, shipping on us
- Responsive customer support`
  },
  privacy: {
    title: 'سياسة الخصوصية',
    body: `في سوقي ستور بنعتبر بياناتك أمانة. الصفحة دي بتوضح بنجمع إيه وبنستخدمه إزاي.

## البيانات اللي بنطلبها
الاسم، رقم التليفون، عنوان التوصيل، والبريد الإلكتروني — عشان نوصّل طلبك ونتواصل معاك بس.

## حماية بياناتك
بياناتك محفوظة بشكل آمن، ومش بنبيعها ولا بنشاركها مع أي جهة لأغراض إعلانية. بنشارك مع شركة الشحن البيانات اللازمة للتوصيل فقط.

## الدفع
لو الدفع بالبطاقة متاح، بيتم عن طريق بوابة دفع مؤمّنة، ومش بنحتفظ ببيانات بطاقتك.

## حقوقك
تقدر تعدّل بياناتك وعناوينك من حسابك، أو تطلب حذف حسابك من خدمة العملاء في أي وقت.`,
    title_en: 'Privacy policy',
    body_en: `At Souqy Store your data is a trust. This page explains what we collect and how we use it.

## What we ask for
Your name, phone number, delivery address and email — only to deliver your order and contact you.

## Protecting your data
Your data is stored securely. We never sell it or share it for advertising. The delivery company only receives what it needs to deliver.

## Payments
If card payment is available, it goes through a secure payment gateway and we never store your card details.

## Your rights
You can edit your details and addresses from your account, or ask customer support to delete your account at any time.`
  },
  terms: {
    title: 'الشروط والأحكام',
    body: `## الطلب
بعد ما تأكد طلبك بيوصلك إشعار بتفاصيله. من فضلك اتأكد من رقم التليفون والعنوان.

## الشحن والتوصيل
مصاريف الشحن بتتحسب حسب المحافظة وبتظهر قبل تأكيد الطلب، وفيه منتجات شحنها مجاني. التوصيل عادةً 24 ساعة للقاهرة والجيزة و48 ساعة لباقي المحافظات.

## الإلغاء
تقدر تلغي الطلب من "طلباتي" طول ما هو لسه ما اتجهزش.

## الاستبدال
استبدال خلال 14 يوم من الاستلام لو فيه عيب صناعة أو المنتج مش مطابق، بشرط إنه يكون بحالته وعبوته الأصلية، ومصاريف شحن الاستبدال علينا.

## الدفع
الدفع نقداً عند الاستلام، أو بالبطاقة لو متاحة.`,
    title_en: 'Terms & conditions',
    body_en: `## Orders
After you confirm an order you get a notification with its details. Please make sure your phone number and address are correct.

## Shipping
Shipping fees depend on your governorate and are shown before you confirm. Many products ship free. Delivery is usually 24 hours in Cairo & Giza and 48 hours elsewhere.

## Cancellation
You can cancel from "My orders" while the order hasn't been prepared yet.

## Exchange
Exchange within 14 days of delivery for manufacturing defects or a wrong item, in its original condition and packaging. Exchange shipping is on us.

## Payment
Cash on delivery, or card when available.`
  }
};
const SLUGS = Object.keys(DEFAULTS);

async function getPages() {
  const s = (await db.settings.getAll())[0] || {};
  const saved = s.sitePages || {};
  const out = {};
  SLUGS.forEach(k => { out[k] = { ...DEFAULTS[k], ...(saved[k] || {}) }; });
  return out;
}

// ---- Store contact info (shown on support, footer, maintenance page) ----
async function getContact() {
  const s = (await db.settings.getAll())[0] || {};
  return { whatsapp: '', phone: '', email: '', address: '', facebook: '', instagram: '', tiktok: '', ...(s.contactInfo || {}) };
}
router.get('/meta/contact', async (req, res) => {
  res.json({ success: true, contact: await getContact() });
});
router.put('/meta/contact', authenticate, async (req, res) => {
  const u = req.user;
  if (!(isSuperAdmin(u) || u.role === 'admin' || (u.permissions && u.permissions.canManageSettings))) {
    return res.status(403).json({ success: false, message: 'للمدير أو صلاحية الإعدادات' });
  }
  const pick = k => String(req.body[k] || '').trim().slice(0, 200);
  const contactInfo = { whatsapp: pick('whatsapp'), phone: pick('phone'), email: pick('email'), address: pick('address'), facebook: pick('facebook'), instagram: pick('instagram'), tiktok: pick('tiktok') };
  if (contactInfo.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactInfo.email)) return res.status(400).json({ success: false, message: 'الإيميل مش صحيح' });
  for (const k of ['facebook', 'instagram', 'tiktok']) if (contactInfo[k] && !/^https?:\/\//i.test(contactInfo[k])) return res.status(400).json({ success: false, message: 'روابط السوشيال لازم تبدأ بـ https://' });
  const s = (await db.settings.getAll())[0];
  if (s) await db.settings.update(s.id, { contactInfo }); else await db.settings.insert({ id: 'store_settings', contactInfo });
  res.json({ success: true, message: 'تم حفظ بيانات التواصل', contact: contactInfo });
});

router.get('/', async (req, res) => {
  res.json({ success: true, pages: await getPages() });
});

router.get('/:slug', async (req, res) => {
  const pages = await getPages();
  const p = pages[req.params.slug];
  if (!p) return res.status(404).json({ success: false, message: 'الصفحة غير موجودة' });
  res.json({ success: true, page: { slug: req.params.slug, ...p } });
});

router.put('/:slug', authenticate, async (req, res) => {
  try {
    const u = req.user;
    const allowed = isSuperAdmin(u) || u.role === 'admin' || Boolean(u.permissions && u.permissions.canManageSettings);
    if (!allowed) return res.status(403).json({ success: false, message: 'تعديل صفحات المتجر للمدير أو صلاحية الإعدادات' });
    const slug = req.params.slug;
    if (!SLUGS.includes(slug)) return res.status(404).json({ success: false, message: 'الصفحة غير موجودة' });
    const clean = (v, max) => String(v === undefined || v === null ? '' : v).slice(0, max);
    const page = {
      title: clean(req.body.title, 120).trim() || DEFAULTS[slug].title,
      body: clean(req.body.body, 20000),
      title_en: clean(req.body.title_en, 120).trim() || DEFAULTS[slug].title_en,
      body_en: clean(req.body.body_en, 20000),
      updatedAt: new Date().toISOString(),
      updatedBy: u.name
    };
    const s = (await db.settings.getAll())[0];
    const sitePages = { ...((s && s.sitePages) || {}), [slug]: page };
    if (s) await db.settings.update(s.id, { sitePages }); else await db.settings.insert({ id: 'store_settings', sitePages });
    await logActivity({ userId: u.id, userName: u.name, userRole: u.role, action: 'UPDATE_PAGE', module: 'settings', details: `عدّل صفحة "${page.title}"` });
    res.json({ success: true, message: 'تم حفظ الصفحة', page: { slug, ...page } });
  } catch (err) {
    res.status(500).json({ success: false, message: 'فشل حفظ الصفحة' });
  }
});

router.post('/:slug/reset', authenticate, async (req, res) => {
  if (!isSuperAdmin(req.user)) return res.status(403).json({ success: false, message: 'للمدير العام بس' });
  const s = (await db.settings.getAll())[0];
  if (s && s.sitePages) { const sp = { ...s.sitePages }; delete sp[req.params.slug]; await db.settings.update(s.id, { sitePages: sp }); }
  res.json({ success: true, message: 'رجعت للنص الافتراضي' });
});

module.exports = router;
