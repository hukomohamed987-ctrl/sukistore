/**
 * Bassam "front desk": short, useful answers to what customers actually ask, before the product
 * search engine. Answers are 1-3 short lines. If the bot can't help (twice) or the customer asks
 * for a person, the conversation goes to a real staff member.
 */
const db = require('../database/db');
const { loyaltySettings } = require('./loyalty');

const norm = s => String(s || '').toLowerCase()
  .replace(/[ً-ٰٟـ]/g, '')
  .replace(/[أإآٱ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي')
  .replace(/[؟?!.,،]/g, ' ').replace(/\s+/g, ' ').trim();
const has = (t, words) => words.some(w => t.includes(w));

const STATUS_AR = { pending: 'اتسجل وبيتراجع', processing: 'بيتجهز', shipped: 'مع المندوب في الطريق ليك', delivered: 'اتسلّم', cancelled: 'اتلغى' };
const QUICK = ['طلبي فين؟', 'عايز أستبدل منتج', 'مواعيد ومصاريف الشحن', 'كلّم موظف'];

const reply = (text, extra = {}) => ({ text, suggestions: extra.suggestions || [], products: [], alternatives: [], complementary: [], intent: extra.intent || 'support', canEscalate: true, ...extra });

async function myOrders(user) {
  if (!user) return [];
  const orders = await db.orders.find(o => String(o.userId) === String(user.id));
  return orders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

/** Returns a bot result, or null to let the product engine answer. */
async function frontDesk(message, conv, user) {
  const t = norm(message);
  if (!t) return null;
  const words = t.split(' ');

  // 1. Wants a person
  if (has(t, ['موظف', 'خدمه العملاء', 'خدمة العملاء', 'حد يكلمني', 'حد يرد', 'كلم حد', 'بشري', 'agent', 'human', 'customer service', 'support team', 'مدير', 'شكوي', 'اشتكي'])) {
    return reply('حاضر، هحوّلك لموظف خدمة العملاء دلوقتي 👨‍💼', { intent: 'human', autoEscalateRequested: true, openEscalateBox: true });
  }

  // 2. Greeting only
  const greetingOnly = words.length <= 3 && has(t, ['السلام', 'سلام', 'اهلا', 'هاي', 'هلو', 'مرحبا', 'صباح', 'مساء', 'hi', 'hello', 'ازيك']);
  if (greetingOnly) {
    return reply(`أهلاً بيك${user && user.name ? ' يا ' + String(user.name).split(' ')[0] : ''} 👋 أنا بسام. أقدر أساعدك في إيه؟`, { intent: 'greeting', suggestions: QUICK });
  }

  // 3. Order status
  const orderNo = (message.match(/suki-?\d{4,6}/i) || [])[0];
  if (orderNo || has(t, ['طلبي', 'اوردر', 'الاوردر', 'الطلب بتاعي', 'طلباتي', 'شحنتي', 'الشحنه فين', 'وصل امتي', 'هيوصل امتي', 'track', 'my order', 'order status'])) {
    if (!user) {
      return reply('عشان أشوفلك حالة طلبك، سجّل دخول الأول وبعدين اسألني تاني، أو افتح "طلباتي". لو محتاج حد يساعدك أحولك لموظف.', { intent: 'order_status', suggestions: ['كلّم موظف'] });
    }
    const orders = await myOrders(user);
    let list = orders;
    if (orderNo) list = orders.filter(o => String(o.orderNumber).toUpperCase() === orderNo.toUpperCase().replace(/^SUKI(\d)/, 'SUKI-$1'));
    if (!list.length) {
      return reply(orderNo ? `مش لاقي الطلب ${orderNo.toUpperCase()} على حسابك. اتأكد من الرقم أو كلّم موظف.` : 'مفيش طلبات على حسابك لسه.', { intent: 'order_status', suggestions: ['كلّم موظف'] });
    }
    const lines = list.slice(0, 3).map(o => `• طلب #${o.orderNumber}: ${STATUS_AR[o.status] || o.status} (${Number(o.grandTotal) || 0} ج.م)`);
    return reply(`${lines.join('\n')}\nالتفاصيل كاملة في صفحة "طلباتي".`, { intent: 'order_status', suggestions: ['عايز ألغي طلب', 'كلّم موظف'] });
  }

  // 4. Cancel an order
  if (has(t, ['الغي', 'الغاء', 'كنسل', 'cancel'])) {
    if (user) {
      const pending = (await myOrders(user)).find(o => o.status === 'pending');
      if (pending) return reply(`طلب #${pending.orderNumber} لسه ما اتجهزش، تقدر تلغيه بنفسك: افتح "طلباتي" ← الطلب ← "إلغاء الطلب".`, { intent: 'cancel' });
    }
    return reply('تقدر تلغي الطلب من "طلباتي" طول ما هو لسه "اتسجل". لو بدأ يتجهز أو اتشحن، كلّم موظف وهو يساعدك.', { intent: 'cancel', suggestions: ['كلّم موظف'] });
  }

  // 5. Exchange / defect / return
  if (has(t, ['استبدال', 'استبدل', 'ابدل', 'تبديل', 'مرتجع', 'استرجاع', 'ارجع', 'عيب', 'بايظ', 'مكسور', 'مش شغال', 'ضمان', 'return', 'exchange', 'refund', 'broken', 'defect'])) {
    return reply('عندنا استبدال خلال 14 يوم لو فيه عيب صناعة، ومصاريف شحن الاستبدال علينا. اطلبه من "طلباتي" ← الطلب ← "طلب استبدال".', { intent: 'exchange', suggestions: ['كلّم موظف'] });
  }

  // 6. Shipping time / cost
  if (has(t, ['شحن', 'توصيل', 'هيوصل', 'يوصل', 'مندوب', 'delivery', 'shipping'])) {
    return reply('التوصيل 24 ساعة في القاهرة والجيزة، و48 ساعة لباقي المحافظات. مصاريف الشحن بتظهر في صفحة الدفع حسب محافظتك، وفيه منتجات شحنها مجاني.', { intent: 'shipping' });
  }

  // 7. Payment
  if (has(t, ['دفع', 'ادفع', 'فيزا', 'كاش', 'بطاقه', 'كريدت', 'انستاباي', 'فودافون كاش', 'payment', 'pay', 'card'])) {
    const settings = (await db.settings.getAll())[0] || {};
    return reply(settings.cardPaymentEnabled ? 'تقدر تدفع كاش عند الاستلام أو بالبطاقة.' : 'الدفع حالياً كاش عند الاستلام.', { intent: 'payment' });
  }

  // 8. Points / coupons
  if (has(t, ['نقاط', 'نقطه', 'كوبون', 'كود خصم', 'خصم', 'points', 'coupon'])) {
    const ls = loyaltySettings((await db.settings.getAll())[0] || {});
    const pts = user ? Number(user.loyaltyPoints) || 0 : null;
    const base = `كل ${ls.loyaltySpendPerReward} ج.م مشتريات = ${ls.loyaltyPointsPerReward} نقطة (النقطة بـ ${ls.loyaltyPointValueEgp} ج.م). تقدر تستخدمها من ${ls.loyaltyMinRedemptionThreshold} نقطة.`;
    return reply(pts !== null ? `رصيدك ${pts} نقطة. ${base}` : base, { intent: 'loyalty' });
  }

  // 9. Account / password
  if (has(t, ['باسورد', 'كلمه المرور', 'نسيت', 'حسابي', 'تسجيل الدخول', 'password', 'login'])) {
    return reply('لو نسيت كلمة المرور: اضغط "تسجيل الدخول" ← "نسيت كلمة المرور؟" وهيوصلك كود على الإيميل.', { intent: 'account' });
  }

  return null;
}

/** Make the product engine's answer short and on-topic. */
function shorten(result) {
  const r = { ...result };
  const products = Array.isArray(r.products) ? r.products : [];
  let text = String(r.text || '').replace(/\*\*/g, '');
  // keep the first 3 meaningful lines, and drop the long product lists written inside the text
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean).filter(l => !/^[•\-]/.test(l) || !products.length);
  text = lines.slice(0, products.length ? 1 : 3).join('\n');
  if (text.length > 280) text = text.slice(0, 277).replace(/\s+\S*$/, '') + '…';
  r.text = text || (products.length ? 'دي أنسب حاجات لقيتها ليك:' : '');
  r.products = products.slice(0, 3);
  // "alternatives / add-ons" only when nothing direct was found, and at most 2
  r.alternatives = products.length ? [] : (r.alternatives || []).slice(0, 2);
  r.complementary = [];
  r.suggestions = (r.suggestions || []).slice(0, 3);
  // Not in stock / not sold here: say it plainly and offer a person
  if (['product_not_found', 'category_empty', 'brand_unavailable_alternatives', 'product_out_of_stock'].includes(r.intent) && !r.products.length) {
    r.text = r.alternatives.length ? 'المنتج ده مش متوفر عندنا دلوقتي، بس دي حاجات قريبة منه:' : 'المنتج ده مش متوفر عندنا دلوقتي 🙏 لو عايز نبلغك أول ما يتوفر أو تسأل عن حاجة تانية، أحولك لموظف.';
    r.suggestions = ['كلّم موظف'];
    r.canEscalate = true;
  }
  return r;
}

/** True when the engine gave nothing useful (no products and no specific intent). */
function isEmptyAnswer(result) {
  return !(result.products && result.products.length) && !(result.alternatives && result.alternatives.length) &&
    (!result.intent || ['general', 'fallback', 'unknown', 'no_match', 'vague', 'unmatched', 'clarification_needed', 'needs_discovery', 'unclear_product_match', 'complex_issue'].includes(result.intent));
}

module.exports = { frontDesk, shorten, isEmptyAnswer, QUICK };
