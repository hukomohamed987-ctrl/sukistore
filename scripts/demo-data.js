/**
 * Demo data so the owner can try the whole store (owner request 2026-11-12).
 *
 *   node scripts/demo-data.js --add      → 200 products + 4 merchants + 2 investors + offer banners
 *                                          + showcase cards + 2 coupons (+ their images)
 *   node scripts/demo-data.js --remove   → deletes everything this script added (marked isDemo: true)
 *
 * Everything is written in ONE all-or-nothing step. Real data (not marked isDemo) is never touched.
 * Login details of the demo merchants / investors are written to docs/demo-accounts.md
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const ROOT = path.join(__dirname, '..');
require('dotenv').config({ path: path.join(ROOT, '.env') });
const bcrypt = require('bcryptjs');
const db = require('../database/db');
const { newCapitalBatch } = require('../utils/financeEngine');

const UPLOADS = path.join(ROOT, 'public', 'uploads');
const ACCOUNTS_FILE = path.join(ROOT, 'docs', 'demo-accounts.md');
const mode = process.argv.includes('--remove') ? 'remove' : process.argv.includes('--add-strips') ? 'strips' : process.argv.includes('--add') ? 'add' : null;
if (!mode) { console.log('Use --add, --add-strips or --remove'); process.exit(1); }

// ---------------- images (simple SVG artwork, no outside downloads) ----------------
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
function productSvg(emoji, c1, c2, seed) {
  const r = n => ((seed * 9301 + 49297 * n) % 233280) / 233280;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800" viewBox="0 0 800 800">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient>
<radialGradient id="l" cx="0.5" cy="0.45" r="0.5"><stop offset="0" stop-color="#fff" stop-opacity="0.55"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient></defs>
<rect width="800" height="800" fill="url(#g)"/>
<circle cx="${120 + r(1) * 560}" cy="${100 + r(2) * 200}" r="${60 + r(3) * 80}" fill="#fff" opacity="0.10"/>
<circle cx="${100 + r(4) * 600}" cy="${560 + r(5) * 180}" r="${80 + r(6) * 90}" fill="#fff" opacity="0.08"/>
<circle cx="400" cy="380" r="260" fill="url(#l)"/>
<ellipse cx="400" cy="640" rx="190" ry="26" fill="#000" opacity="0.12"/>
<text x="400" y="470" font-size="300" text-anchor="middle" font-family="Segoe UI Emoji, Apple Color Emoji, Noto Color Emoji, sans-serif">${emoji}</text>
</svg>`;
}
function bannerSvg(emoji, c1, c2, wide = true) {
  const w = wide ? 1600 : 1200, h = wide ? 500 : 400;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="0.6"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs>
<rect width="${w}" height="${h}" fill="url(#g)"/>
<circle cx="${w * 0.18}" cy="${h * 0.5}" r="${h * 0.62}" fill="#fff" opacity="0.08"/>
<circle cx="${w * 0.08}" cy="${h * 0.15}" r="${h * 0.18}" fill="#fff" opacity="0.10"/>
<circle cx="${w * 0.93}" cy="${h * 0.95}" r="${h * 0.35}" fill="#000" opacity="0.10"/>
<text x="${w * 0.18}" y="${h * 0.66}" font-size="${h * 0.48}" text-anchor="middle" font-family="Segoe UI Emoji, Apple Color Emoji, Noto Color Emoji, sans-serif">${emoji}</text>
</svg>`;
}
function cardSvg(emoji, c1, c2) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="500" height="640" viewBox="0 0 500 640">
<defs><linearGradient id="g" x1="0" y1="0" x2="0.4" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs>
<rect width="500" height="640" fill="url(#g)"/>
<circle cx="380" cy="120" r="150" fill="#fff" opacity="0.10"/><circle cx="80" cy="330" r="90" fill="#fff" opacity="0.07"/>
<text x="250" y="300" font-size="200" text-anchor="middle" font-family="Segoe UI Emoji, Apple Color Emoji, Noto Color Emoji, sans-serif">${emoji}</text>
</svg>`;
}
function logoSvg(letter, c1, c2) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs>
<rect width="200" height="200" rx="44" fill="url(#g)"/>
<text x="100" y="128" font-size="92" font-weight="800" text-anchor="middle" fill="#fff" font-family="Cairo, Tahoma, Arial, sans-serif">${esc(letter)}</text>
</svg>`;
}
const written = [];
function saveImage(name, svg) {
  const file = `demo-${name}.svg`;
  fs.writeFileSync(path.join(UPLOADS, file), svg, 'utf8');
  written.push(file);
  return `/uploads/${file}`;
}

// ---------------- catalogue ----------------
// [name, price, emoji, brand?]  — prices in EGP
const CATALOG = {
  'sub-electronics-1': { colors: ['#6366f1', '#1e1b4b'], items: [
    ['هاتف سامسونج جالاكسي A55 – 256 جيجا', 17999, '📱', 'سامسونج'], ['هاتف سامسونج جالاكسي A15 – 128 جيجا', 8499, '📱', 'سامسونج'],
    ['آيفون 15 – 128 جيجا', 52999, '📱', 'أبل'], ['آيفون 13 – 128 جيجا', 33999, '📱', 'أبل'], ['شاومي ريدمي نوت 13 – 256 جيجا', 10999, '📱', 'شاومي'],
    ['شاومي ريدمي 13C – 128 جيجا', 5999, '📱', 'شاومي'], ['هواوي نوفا 12i – 256 جيجا', 9999, '📱', 'هواوي'], ['ريلمي C67 – 128 جيجا', 7499, '📱', 'ريلمي'],
    ['ريلمي 12 برو – 256 جيجا', 14999, '📱', 'ريلمي'], ['سامسونج جالاكسي S24 – 256 جيجا', 44999, '📱', 'سامسونج'], ['شاومي 14T – 512 جيجا', 27999, '📱', 'شاومي'],
    ['هواوي ميت X – 256 جيجا', 21999, '📱', 'هواوي'], ['آيفون 15 برو ماكس – 256 جيجا', 74999, '📱', 'أبل']] },
  'sub-electronics-2': { colors: ['#0ea5e9', '#0c4a6e'], items: [
    ['سماعة JBL لاسلكية Tune 520BT', 2299, '🎧', 'JBL'], ['سماعة أذن لاسلكية سوني WF-C500', 3499, '🎧', 'سوني'], ['شاحن سريع 25 وات سامسونج', 649, '🔌', 'سامسونج'],
    ['باور بانك شاومي 20000 مللي', 1199, '🔋', 'شاومي'], ['كابل USB-C مضفّر 2 متر', 199, '🔌'], ['ساعة ذكية هواوي باند 9', 2499, '⌚', 'هواوي'],
    ['ساعة أبل SE الجيل الثاني', 13999, '⌚', 'أبل'], ['سماعة بلوتوث JBL Go 4 محمولة', 1999, '🔊', 'JBL'], ['جراب سيليكون مقاوم للصدمات', 249, '📱'],
    ['حامل موبايل للعربية مغناطيسي', 349, '🚗'], ['سماعة أبل إيربودز الجيل الثالث', 9999, '🎧', 'أبل'], ['ماوس لاسلكي ديل صامت', 599, '🖱️', 'ديل'],
    ['كيبورد بلوتوث عربي/إنجليزي', 899, '⌨️']] },
  'sub-electronics-3': { colors: ['#14b8a6', '#134e4a'], items: [
    ['شاشة سامسونج 43 بوصة 4K سمارت', 16999, '📺', 'سامسونج'], ['شاشة شاومي 55 بوصة جوجل TV', 21999, '📺', 'شاومي'], ['شاشة سوني 65 بوصة برافيا', 42999, '📺', 'سوني'],
    ['شاشة كمبيوتر ديل 24 بوصة', 5499, '🖥️', 'ديل'], ['كاميرا مراقبة شاومي 360 درجة', 1499, '📷', 'شاومي'], ['كاميرا سوني ZV-E10 للمحتوى', 32999, '📷', 'سوني'],
    ['شاشة سامسونج 32 بوصة HD', 7999, '📺', 'سامسونج'], ['بروجيكتور منزلي فل HD', 6499, '📽️'], ['كاميرا ويب 1080p بمايك', 899, '📷'],
    ['شاشة جيمنج 27 بوصة 165 هرتز', 9999, '🖥️'], ['كاميرا أكشن مقاومة للمياه 4K', 3299, '📷'], ['حامل شاشة حائط متحرك', 799, '🔧'],
    ['شاشة ديل 27 بوصة QHD', 11499, '🖥️', 'ديل']] },
  'sub-home-appliances-1': { colors: ['#64748b', '#1e293b'], items: [
    ['ثلاجة توشيبا نوفروست 14 قدم', 24999, '🧊'], ['غسالة أوتوماتيك تورنيدو 8 كيلو', 17999, '🧺', 'تورنيدو'], ['ديب فريزر 5 أدراج', 15999, '🧊'],
    ['بوتاجاز 5 شعلة ستانلس', 13999, '🔥'], ['غسالة أطباق بوش 12 فرد', 27999, '🍽️', 'بوش'], ['تكييف تورنيدو 1.5 حصان بارد ساخن', 26999, '❄️', 'تورنيدو'],
    ['ثلاجة سامسونج 18 قدم إنفرتر', 34999, '🧊', 'سامسونج'], ['غسالة بوش 9 كيلو فتحة أمامية', 31999, '🧺', 'بوش'], ['سخان غاز 10 لتر', 4499, '🚿'],
    ['شفاط مطبخ 60 سم', 3999, '💨'], ['ميكروويف سامسونج 32 لتر', 5499, '📦', 'سامسونج'], ['تكييف 2.25 حصان سبليت', 33999, '❄️'],
    ['مبرد مياه 3 حنفيات', 6999, '🚰']] },
  'sub-home-appliances-2': { colors: ['#f97316', '#7c2d12'], items: [
    ['خلاط براون 2 لتر', 1899, '🥤', 'براون'], ['مكواة بخار تيفال', 1599, '👕', 'تيفال'], ['قلاية هوائية تورنيدو 5 لتر', 3499, '🍟', 'تورنيدو'],
    ['كاتل كهربائي 1.7 لتر', 799, '☕'], ['محضّر طعام بوش 800 وات', 3999, '🥗', 'بوش'], ['ماكينة قهوة إسبريسو', 5999, '☕'],
    ['مكنسة كهربائية تورنيدو 2000 وات', 3299, '🧹', 'تورنيدو'], ['مجفف شعر براون', 1299, '💨', 'براون'], ['ماكينة حلاقة براون سيريس 3', 2999, '🪒', 'براون'],
    ['توستر 4 شرائح', 1099, '🍞'], ['مروحة عمود 18 بوصة', 1499, '🌀'], ['خلاط يدوي تيفال', 999, '🥄', 'تيفال'],
    ['مكنسة روبوت شاومي', 9999, '🤖', 'شاومي']] },
  'sub-fashion-1': { colors: ['#334155', '#0f172a'], fashion: 'clothes', items: [
    ['تيشيرت قطن رجالي بيسك', 299, '👕', 'ديفاكتو'], ['قميص كاجوال كاروهات', 549, '👔', 'ديفاكتو'], ['بنطلون جينز سليم فيت', 799, '👖', 'زارا'],
    ['جاكت جلد رجالي', 1899, '🧥', 'زارا'], ['حذاء رياضي نايكي للجري', 3499, '👟', 'نايكي'], ['بولو قطن بيكيه', 449, '👕', 'تاون تيم'],
    ['شورت رياضي نايكي', 899, '🩳', 'نايكي'], ['بدلة رياضية رجالي', 1299, '🏃', 'تاون تيم'], ['حزام جلد طبيعي', 349, '👔'],
    ['حذاء كلاسيك جلد', 1499, '👞'], ['سويت شيرت بكابيشون', 699, '🧥', 'ديفاكتو'], ['شراب قطن 6 أزواج', 199, '🧦'],
    ['كاب رياضي نايكي', 599, '🧢', 'نايكي']] },
  'sub-fashion-2': { colors: ['#db2777', '#500724'], fashion: 'clothes', items: [
    ['فستان صيفي مشجر', 899, '👗', 'زارا'], ['بلوزة شيفون', 499, '👚', 'ديفاكتو'], ['جيبة ميدي بليسيه', 649, '👗', 'زارا'],
    ['شنطة يد جلد', 1299, '👜'], ['حذاء كعب عالي', 999, '👠'], ['عباية سوداء مطرزة', 1499, '🧕'],
    ['كوتشي نايكي حريمي', 3299, '👟', 'نايكي'], ['طرحة شيفون', 149, '🧣'], ['بنطلون واسع قماش', 599, '👖', 'ديفاكتو'],
    ['كارديجان تريكو', 749, '🧥', 'تاون تيم'], ['نظارة شمس حريمي', 449, '🕶️'], ['محفظة حريمي', 349, '👛'],
    ['بيجامة قطن حريمي', 549, '👚', 'تاون تيم']] },
  'sub-fashion-3': { colors: ['#f59e0b', '#78350f'], fashion: 'kids', items: [
    ['طقم أطفال صيفي', 349, '👕', 'تاون تيم'], ['فستان بناتي', 449, '👗', 'ديفاكتو'], ['كوتشي أطفال بإضاءة', 599, '👟'],
    ['بيجامة أطفال قطن', 299, '🧸', 'تاون تيم'], ['جاكت أطفال شتوي', 699, '🧥', 'ديفاكتو'], ['شنطة مدرسة', 499, '🎒'],
    ['شورت جينز أطفال', 249, '🩳'], ['طاقية وشال أطفال', 199, '🧣'], ['صندل أطفال', 279, '🩴'],
    ['تيشيرت أطفال كرتون', 199, '👕', 'ديفاكتو'], ['بدلة رياضية أطفال', 549, '🏃', 'تاون تيم'], ['مريلة مدرسة', 229, '👔'],
    ['شراب أطفال 5 أزواج', 129, '🧦']] },
  'sub-beauty-1': { colors: ['#ec4899', '#831843'], items: [
    ['كريم ترطيب نيڤيا 200 مل', 189, '🧴', 'نيڤيا'], ['غسول وجه لوريال', 249, '🧴', 'لوريال'], ['واقي شمس SPF 50', 399, '☀️', 'نيڤيا'],
    ['سيروم فيتامين سي', 449, '💧', 'لوريال'], ['ماسك طين للوجه', 179, '🧖'], ['كريم عين مضاد للهالات', 329, '👁️', 'لوريال'],
    ['مزيل مكياج ميسيلار', 199, '💧', 'لوريال'], ['مرطب شفايف نيڤيا', 59, '💄', 'نيڤيا'], ['لوشن جسم نيڤيا 400 مل', 229, '🧴', 'نيڤيا'],
    ['تونر ورد طبيعي', 149, '🌹'], ['شامبو لوريال للشعر الجاف', 169, '🧴', 'لوريال'], ['زيت أرجان للشعر', 279, '🌿'],
    ['مقشر جسم بالقهوة', 199, '☕']] },
  'sub-beauty-2': { colors: ['#a855f7', '#3b0764'], items: [
    ['عطر العربية للعود – مسك 100 مل', 1299, '🌸', 'العربية للعود'], ['عطر عود ملكي 50 مل', 1899, '🌸', 'العربية للعود'], ['بخور عود معطر', 349, '🔥', 'العربية للعود'],
    ['عطر رجالي خشبي 100 مل', 899, '🌸'], ['عطر حريمي زهري 75 مل', 999, '🌺'], ['بودي سبلاش فانيلا', 249, '🌼'],
    ['مزيل عرق نيڤيا رجالي', 119, '🧴', 'نيڤيا'], ['عطر مسك الطهارة', 199, '🤍', 'العربية للعود'], ['طقم عطور هدايا 3 قطع', 1599, '🎁'],
    ['دهن عود كمبودي 3 مل', 799, '💧', 'العربية للعود'], ['معطر ملابس بالورد', 149, '🌹'], ['عطر أطفال خفيف', 299, '🧸'],
    ['عطر سفر صغير 30 مل', 399, '🌸']] },
  'sub-home-supplies-1': { colors: ['#22c55e', '#14532d'], items: [
    ['طقم حلل تيفال 7 قطع', 4999, '🍳', 'تيفال'], ['طاسة تيفال 28 سم', 899, '🍳', 'تيفال'], ['طقم سكاكين ستانلس 6 قطع', 699, '🔪', 'زهران'],
    ['حلة ضغط زهران 7 لتر', 1599, '🥘', 'زهران'], ['طقم كاسات زجاج 6 قطع', 299, '🥛'], ['لوح تقطيع خشب', 199, '🪵'],
    ['طقم أطباق صيني 24 قطعة', 1899, '🍽️'], ['ترمس شاي 1 لتر', 349, '🫖'], ['ميزان مطبخ ديجيتال', 299, '⚖️'],
    ['طقم معالق وشوك 24 قطعة', 499, '🍴', 'زهران'], ['صينية فرن جرانيت', 449, '🥧', 'تيفال'], ['براد شاي ستانلس', 399, '🫖', 'زهران'],
    ['مصفاة وأدوات مطبخ سيليكون', 249, '🥄']] },
  'sub-home-supplies-2': { colors: ['#06b6d4', '#164e63'], items: [
    ['علب تخزين بلاستيك 10 قطع', 349, '📦'], ['منظم دولاب قماش', 249, '🧺'], ['سلة غسيل بغطاء', 199, '🧺'],
    ['رف حمام ستانلس', 449, '🛁'], ['شماعات ملابس 20 قطعة', 149, '👕'], ['منظم أحذية 5 أدوار', 599, '👟'],
    ['علب توابل زجاج 12 قطعة', 399, '🧂'], ['صندوق تخزين تحت السرير', 299, '📦'], ['منظم أدراج قابل للتعديل', 179, '🗂️'],
    ['حامل مناشف حائط', 229, '🧻'], ['سبت خوص ديكور', 199, '🧺'], ['منظم مكياج أكريليك', 349, '💄'],
    ['شنط تفريغ هواء للملابس', 279, '🛍️']] },
  'sub-games-1': { colors: ['#eab308', '#713f12'], items: [
    ['مكعبات بناء 500 قطعة', 699, '🧱'], ['عربية ريموت كنترول', 899, '🏎️'], ['عروسة بنات مع إكسسوارات', 499, '🪆'],
    ['دبدوب كبير 80 سم', 599, '🧸'], ['بازل 1000 قطعة', 349, '🧩'], ['مطبخ أطفال لعبة', 1299, '🍳'],
    ['دراجة أطفال 16 بوصة', 2499, '🚲'], ['سكوتر أطفال بإضاءة', 1199, '🛴'], ['لعبة سلم وثعبان', 149, '🎲'],
    ['طقم رسم وتلوين 150 قطعة', 399, '🎨'], ['قطار كهربائي بقضبان', 999, '🚂'], ['كرة قدم مقاس 5', 299, '⚽'],
    ['خيمة أطفال للعب', 799, '⛺']] },
  'sub-games-2': { colors: ['#8b5cf6', '#2e1065'], items: [
    ['بلايستيشن 5 سليم', 34999, '🎮', 'سوني'], ['دراع بلايستيشن 5 دوال سينس', 3999, '🎮', 'سوني'], ['لعبة FC 25 بلايستيشن 5', 2499, '💿', 'سوني'],
    ['سماعة جيمنج بمايك', 1299, '🎧'], ['كرسي جيمنج مريح', 5999, '🪑'], ['ماوس جيمنج RGB', 699, '🖱️'],
    ['كيبورد ميكانيكال RGB', 1499, '⌨️'], ['نينتندو سويتش OLED', 17999, '🕹️'], ['دراع لاسلكي للكمبيوتر', 899, '🎮'],
    ['ماوس باد جيمنج كبير', 299, '🟦'], ['لعبة سباق عربيات', 1899, '💿'], ['شاحن دراعات مزدوج', 599, '🔋', 'سوني'],
    ['نظارة واقع افتراضي', 7999, '🥽']] },
  'sub-office-2': { colors: ['#3b82f6', '#172554'], items: [
    ['كشكول سلك 100 ورقة', 49, '📓'], ['أقلام جاف 12 لون', 69, '🖊️'], ['آلة حاسبة علمية', 399, '🧮'],
    ['دباسة مكتب كبيرة', 129, '📎'], ['منظم مكتب خشب', 249, '🗂️'], ['ورق تصوير A4 500 ورقة', 219, '📄'],
    ['أقلام تلوين خشب 24 لون', 99, '🖍️'], ['شنطة لاب توب 15.6 بوصة', 599, '💼'], ['سبورة بيضاء 60×90', 449, '📋'],
    ['أجندة 2026 جلد', 179, '📒'], ['قلم حبر فاخر', 299, '🖋️'], ['لاصق ملون ملاحظات', 39, '🗒️'],
    ['ماكينة خرم ورق', 149, '📎']] },
  'sub-office-1': { colors: ['#0d9488', '#042f2e'], items: [
    ['رواية عربية – الأكثر مبيعاً', 149, '📕'], ['كتاب تنمية بشرية', 119, '📗'], ['قصص أطفال مصورة 10 أجزاء', 299, '📚'],
    ['كتاب تعلم البرمجة للمبتدئين', 199, '💻'], ['موسوعة علمية للأطفال', 349, '🔬'], ['كتاب طبخ مصري', 179, '🍲'],
    ['رواية مترجمة كلاسيكية', 129, '📘'], ['كتاب تاريخ مصر', 159, '🏛️'], ['قاموس إنجليزي–عربي', 249, '📙'],
    ['كتاب تلوين للكبار', 99, '🎨'], ['دليل ريادة الأعمال', 189, '📈'], ['مجموعة شعر عربي', 109, '✒️'],
    ['كتاب ألغاز وتفكير', 89, '🧠']] }
};
const TOTAL = 200;

const MERCHANTS = [
  { code: 'M-TECH', name: 'تكنو زون للإلكترونيات', username: 'demo_technozone', subs: ['sub-electronics-1', 'sub-electronics-2', 'sub-electronics-3'], emoji: '💻', colors: ['#6366f1', '#1e1b4b'] },
  { code: 'M-FASH', name: 'بيت الموضة', username: 'demo_fashionhouse', subs: ['sub-fashion-1', 'sub-fashion-2', 'sub-fashion-3'], emoji: '👗', colors: ['#db2777', '#500724'] },
  { code: 'M-HOME', name: 'عالم البيت', username: 'demo_homeworld', subs: ['sub-home-supplies-1', 'sub-home-supplies-2', 'sub-home-appliances-2'], emoji: '🏠', colors: ['#22c55e', '#14532d'] },
  { code: 'M-GLOW', name: 'ركن الجمال', username: 'demo_beautycorner', subs: ['sub-beauty-1', 'sub-beauty-2'], emoji: '💄', colors: ['#ec4899', '#831843'] }
];
const INVESTORS = [
  { name: 'مجموعة النيل للاستثمار', username: 'demo_nilegroup', share: 50, capital: 150000, subs: ['sub-games-1', 'sub-games-2', 'sub-home-appliances-1'], emoji: '🎮', colors: ['#8b5cf6', '#2e1065'] },
  { name: 'شركة الأفق التجارية', username: 'demo_horizon', share: 40, capital: 80000, subs: ['sub-office-1', 'sub-office-2'], emoji: '📚', colors: ['#3b82f6', '#172554'] }
];

const FASHION_SIZES = { clothes: ['S', 'M', 'L', 'XL'], kids: ['4 سنين', '6 سنين', '8 سنين', '10 سنين'] };
const SHOE = /حذاء|كوتشي|صندل/;

async function add() {
  const already = await db.products.count(p => p.isDemo);
  if (already) { console.log(`Demo data already there (${already} products). Run --remove first.`); process.exit(1); }
  const cats = await db.categories.getAll();
  const subs = await db.subcategories.getAll();
  const brands = await db.brands.getAll();
  const settings = (await db.settings.getAll())[0] || {};
  const brandId = name => { const b = brands.find(x => x.name === name); return b ? b.id : null; };
  const subById = id => subs.find(s => s.id === id);
  for (const id of Object.keys(CATALOG)) if (!subById(id)) { console.log('Missing subcategory', id); process.exit(1); }
  fs.mkdirSync(UPLOADS, { recursive: true });
  fs.mkdirSync(path.dirname(ACCOUNTS_FILE), { recursive: true });

  // --- merchants / investors with their logins ---
  const accounts = [];
  const pw = () => 'Demo#' + crypto.randomBytes(4).toString('hex') + 'A1';
  const merchants = [];
  for (const m of MERCHANTS) {
    const password = pw();
    const userId = crypto.randomUUID(), merchantId = crypto.randomUUID();
    merchants.push({ ...m, id: merchantId, userId, hash: bcrypt.hashSync(password, 10), logo: saveImage(`logo-${m.code.toLowerCase()}`, logoSvg(m.name.trim()[0], ...m.colors)) });
    accounts.push({ type: 'تاجر', name: m.name, login: `${m.username}@merchant.suki.store`, password });
  }
  const investors = [];
  for (let i = 0; i < INVESTORS.length; i++) {
    const inv = INVESTORS[i];
    const password = pw();
    investors.push({ ...inv, id: crypto.randomUUID(), userId: crypto.randomUUID(), code: `INV-DEMO${i + 1}`, hash: bcrypt.hashSync(password, 10), logo: saveImage(`logo-inv${i + 1}`, logoSvg(inv.name.trim()[0], ...inv.colors)) });
    accounts.push({ type: 'مستثمر', name: inv.name, login: `${inv.username}@investor.suki.store`, password });
  }

  // --- products ---
  const subIds = Object.keys(CATALOG);
  const perSub = Object.fromEntries(subIds.map(id => [id, Math.floor(TOTAL / subIds.length)]));
  for (let i = 0; i < TOTAL % subIds.length; i++) perSub[subIds[i]]++;
  const products = [];
  let n = 0;
  const now = Date.now();
  for (const subId of subIds) {
    const sub = subById(subId);
    const { colors, items, fashion } = CATALOG[subId];
    const merchant = merchants.find(m => m.subs.includes(subId));
    const investor = investors.find(v => v.subs.includes(subId));
    items.slice(0, perSub[subId]).forEach(([title, price, emoji, brand], k) => {
      n++;
      // owner: 2 of every 3 products to the merchant/investor of this section, the rest the store's own
      let owner = { ownerType: 'store', merchantId: null, merchantCode: '', merchantName: '', investorId: null, investorCode: '', investorName: '' };
      if (k % 3 !== 2 && merchant) owner = { ...owner, ownerType: 'merchant', merchantId: merchant.id, merchantCode: merchant.code, merchantName: merchant.name };
      else if (k % 3 !== 2 && investor) owner = { ...owner, ownerType: 'investor', investorId: investor.id, investorCode: investor.code, investorName: investor.name };
      const cost = Math.round(price * (0.62 + ((n * 7) % 15) / 100));
      const discounted = n % 5 === 0 || n % 7 === 0;
      const compareAtPrice = discounted ? Math.round(price * (1.15 + ((n * 3) % 20) / 100) / 10) * 10 - 1 : null;
      let stock = 5 + ((n * 37) % 56);
      if (n % 23 === 0) stock = 0;             // a few sold out
      else if (n % 11 === 0) stock = 3;        // a few low stock
      const big = price >= 12000;
      const free = price >= 3000 || n % 4 === 0;
      let variations = [], variants = [];
      if (fashion) {
        const values = SHOE.test(title) ? ['40', '41', '42', '43', '44'] : FASHION_SIZES[fashion];
        const label = SHOE.test(title) ? 'المقاس' : (fashion === 'kids' ? 'السن' : 'المقاس');
        variations = [{ name: label, values }];
        variants = values.map((v, j) => ({ id: crypto.randomUUID(), options: { [label]: v }, stock: stock === 0 ? 0 : Math.max(1, Math.round(stock / values.length) + (j % 2)), price: null, sku: `D${String(n).padStart(3, '0')}-${j + 1}` }));
        stock = variants.reduce((s, v) => s + v.stock, 0);
      }
      const image = saveImage(`p${String(n).padStart(3, '0')}`, productSvg(emoji, colors[0], colors[1], n));
      const sales = (n * 13) % 40;
      products.push({
        id: crypto.randomUUID(),
        title,
        description: `${title} — منتج أصلي ومضمون من ${owner.ownerType === 'merchant' ? owner.merchantName : owner.ownerType === 'investor' ? 'سوقي ستور' : 'سوقي ستور'}.\nضمان استبدال خلال 14 يوم في حالة عيب الصناعة، والشحن لكل المحافظات.`,
        categoryId: sub.categoryId, subcategoryId: sub.id, subcategory: sub.id,
        brand: brand || '', brandId: brand ? brandId(brand) : null,
        ...owner,
        price, costPrice: cost, basePrice: cost, merchantPrice: cost, commissionRate: 0,
        compareAtPrice, saleUnit: 'قطعة', stock,
        shippingCost: free ? 0 : (big ? 120 : 45), isFreeShipping: free,
        governorateShipping: {}, allowedGovernorates: [], isLargeItem: big, customShippingCost: big && !free ? 120 : null,
        warrantyText: 'ضمان استبدال خلال 14 يوم في حالة عيب الصناعة',
        sku: `DEMO-${String(n).padStart(3, '0')}`, barcode: '', weightKg: big ? 25 : 0.5,
        variants, variations, images: [image], videoUrl: '',
        isFeatured: n % 6 === 0, isBestSeller: sales >= 30, salesCount: sales,
        isActive: true, isDemo: true,
        createdAt: new Date(now - (TOTAL - n) * 3.6e6 * 3).toISOString() // spread over the last ~25 days
      });
    });
  }

  // --- offer banners (home slider) + one banner per category page ---
  const HOME_BANNERS = [
    { title: 'عروض الإلكترونيات', subtitle: 'موبايلات وشاشات وإكسسوارات بخصومات حقيقية', badgeText: 'خصم يصل إلى 30%', linkUrl: '#/category/cat-electronics', emoji: '📱', colors: ['#4f46e5', '#0f172a'], bg: 'linear-gradient(135deg, #4f46e5 0%, #0f172a 100%)' },
    { title: 'موسم الموضة الجديد', subtitle: 'تشكيلة رجالي وحريمي وأطفال', badgeText: 'وصل حديثاً', linkUrl: '#/category/cat-fashion', emoji: '👗', colors: ['#db2777', '#3b0764'], bg: 'linear-gradient(135deg, #db2777 0%, #3b0764 100%)' },
    { title: 'جهّز بيتك', subtitle: 'أجهزة ومستلزمات منزلية بأسعار مميزة', badgeText: 'شحن مجاني فوق 3000 ج.م', linkUrl: '#/category/cat-home-appliances', emoji: '🏠', colors: ['#059669', '#022c22'], bg: 'linear-gradient(135deg, #059669 0%, #022c22 100%)' },
    { title: 'عالم الألعاب', subtitle: 'ألعاب أطفال وفيديو جيمز للكل', badgeText: 'هدايا لكل الأعمار', linkUrl: '#/category/cat-games', emoji: '🎮', colors: ['#7c3aed', '#1e1b4b'], bg: 'linear-gradient(135deg, #7c3aed 0%, #1e1b4b 100%)' }
  ];
  const CAT_EMOJI = { 'cat-office': ['📚', '#2563eb', '#172554'], 'cat-games': ['🎮', '#7c3aed', '#2e1065'], 'cat-home-supplies': ['🍳', '#16a34a', '#14532d'], 'cat-beauty': ['💄', '#db2777', '#500724'], 'cat-fashion': ['👗', '#be185d', '#3b0764'], 'cat-home-appliances': ['🧺', '#ea580c', '#431407'], 'cat-electronics': ['📱', '#4f46e5', '#0f172a'] };
  const banners = [...stripBanners(), ...HOME_BANNERS.map((b, i) => ({
    id: crypto.randomUUID(), title: b.title, subtitle: b.subtitle, badgeText: b.badgeText, linkUrl: b.linkUrl,
    imageUrl: saveImage(`banner-home-${i + 1}`, bannerSvg(b.emoji, ...b.colors)), bgGradient: b.bg, colorName: 'عرض تجريبي',
    orderIndex: 10 + i, isActive: true, placement: 'home', categoryId: null, subcategoryId: null, bannerType: 'image_full_width', isDemo: true
  }))];
  for (const c of cats) {
    const [emoji, c1, c2] = CAT_EMOJI[c.id] || ['🛍️', '#059669', '#022c22'];
    banners.push({
      id: crypto.randomUUID(), title: `عروض ${c.name}`, subtitle: 'أحسن الأسعار على تشكيلة مختارة', badgeText: 'لفترة محدودة', linkUrl: `#/category/${c.id}`,
      imageUrl: saveImage(`banner-${c.id}`, bannerSvg(emoji, c1, c2)), bgGradient: `linear-gradient(135deg, ${c1} 0%, ${c2} 100%)`, colorName: 'عرض تجريبي',
      orderIndex: 0, isActive: true, placement: 'category', categoryId: c.id, subcategoryId: null, bannerType: 'image_full_width', isDemo: true
    });
  }

  // --- showcase cards: merchants, investors, every category, some brands ---
  const showcases = [];
  const sc = (o) => showcases.push({ id: crypto.randomUUID(), subtitle: '', logo: '', banner: '', productIds: [], isActive: true, isDemo: true, orderIndex: showcases.length, ...o });
  for (const m of merchants) sc({ title: m.name, subtitle: 'متجر موثوق على سوقي ستور', linkType: 'merchant', linkValue: m.id, linkLabel: m.name, image: saveImage(`card-${m.code.toLowerCase()}`, cardSvg(m.emoji, ...m.colors)), logo: m.logo, banner: saveImage(`cbanner-${m.code.toLowerCase()}`, bannerSvg(m.emoji, ...m.colors)) });
  for (const v of investors) sc({ title: v.name, subtitle: 'تشكيلة مختارة بعناية', linkType: 'investor', linkValue: v.id, linkLabel: v.name, image: saveImage(`card-${v.code.toLowerCase()}`, cardSvg(v.emoji, ...v.colors)), logo: v.logo, banner: saveImage(`cbanner-${v.code.toLowerCase()}`, bannerSvg(v.emoji, ...v.colors)) });
  for (const c of cats) { const [emoji, c1, c2] = CAT_EMOJI[c.id] || ['🛍️', '#059669', '#022c22']; sc({ title: c.name, subtitle: 'كل منتجات القسم', linkType: 'category', linkValue: c.id, linkLabel: c.name, image: saveImage(`card-${c.id}`, cardSvg(emoji, c1, c2)) }); }
  for (const [name, emoji, c1, c2] of [['سامسونج', '📱', '#1d4ed8', '#0b1a4a'], ['نايكي', '👟', '#f97316', '#431407'], ['تيفال', '🍳', '#dc2626', '#450a0a']]) {
    const b = brands.find(x => x.name === name);
    if (b) sc({ title: name, subtitle: 'منتجات الماركة الأصلية', linkType: 'brand', linkValue: String(b.id), linkLabel: name, image: saveImage(`card-brand-${showcases.length}`, cardSvg(emoji, c1, c2)), logo: saveImage(`logo-brand-${showcases.length}`, logoSvg(name[0], c1, c2)) });
  }

  // --- everything in one step ---
  await db.atomic(t => {
    for (const m of merchants) {
      t.users.insert({ id: m.userId, name: m.name, username: m.username, email: `${m.username}@merchant.suki.store`, phone: '', whatsappPhone: '', whatsapp: '', role: 'merchant', merchantId: m.id, merchantCode: m.code, canEditProducts: true, isActive: true, password: m.hash, permissions: { canViewDashboard: true, canManageProducts: true, canManageOrders: true }, isDemo: true });
      t.merchants.insert({ id: m.id, userId: m.userId, code: m.code, name: m.name, username: m.username, phone: '', whatsapp: '', canEditProducts: true, commissionRate: 0, address: 'القاهرة', notes: 'تاجر تجريبي', isActive: true, totalProductsCount: products.filter(p => p.merchantId === m.id).length, logo: m.logo, isDemo: true });
    }
    for (const v of investors) {
      t.users.insert({ id: v.userId, name: v.name, email: `${v.username}@investor.suki.store`, username: v.username, phone: '', whatsappPhone: '', password: v.hash, role: 'investor', investorId: v.id, investorCode: v.code, isActive: true, canEditProducts: false, isDemo: true });
      t.investors.insert({ id: v.id, userId: v.userId, code: v.code, name: v.name, username: v.username, phone: '', whatsapp: '', capital: v.capital, capitalBatches: [newCapitalBatch(v.capital, 'رأس المال الأول', { name: 'بيانات تجريبية' }, 'إنشاء حساب المستثمر')], profitSharePercent: v.share, notes: 'مستثمر تجريبي', isActive: true, isDemo: true });
    }
    products.forEach(p => t.products.insert(p));
    banners.forEach(b => t.banners.insert(b));
    showcases.forEach(s => t.showcases.insert(s));
    t.coupons.insert({ code: 'WELCOME10', description: 'خصم 10% على أول طلب (تجريبي)', discountType: 'percentage', discountValue: 10, minOrderValue: 300, maxDiscountCap: 200, maxUses: 0, usedCount: 0, isActive: true, isDemo: true });
    t.coupons.insert({ code: 'SAVE50', description: 'خصم 50 ج.م على الطلبات فوق 500 ج.م (تجريبي)', discountType: 'fixed', discountValue: 50, minOrderValue: 500, maxUses: 0, usedCount: 0, isActive: true, isDemo: true });
    const s = t.settings.getAll()[0];
    if (s) t.settings.update(s.id, { demoDataAddedAt: new Date().toISOString(), demoUploads: written });
  });

  fs.writeFileSync(ACCOUNTS_FILE, `# حسابات تجريبية (بيانات التجربة)\n\nاتعملت ${new Date().toISOString().slice(0, 10)} بـ \`node scripts/demo-data.js --add\`، وبتتمسح كلها بـ \`node scripts/demo-data.js --remove\`.\n\n| النوع | الاسم | الدخول | كلمة المرور |\n|---|---|---|---|\n${accounts.map(a => `| ${a.type} | ${a.name} | ${a.login} | ${a.password} |`).join('\n')}\n\nكوبونات التجربة: \`WELCOME10\` (10% فوق 300 ج.م) و \`SAVE50\` (50 ج.م فوق 500 ج.م).\n`, 'utf8');

  const by = t => products.filter(p => p.ownerType === t).length;
  console.log(`✔ Added: ${products.length} products (merchants ${by('merchant')}, investors ${by('investor')}, store ${by('store')}), ${merchants.length} merchants, ${investors.length} investors, ${banners.length} banners, ${showcases.length} showcase cards, 2 coupons, ${written.length} images.`);
  console.log(`  Logins: ${path.relative(ROOT, ACCOUNTS_FILE)}`);
}

// Thin banners under the home slider (placement "strip")
function stripBanners() {
  const STRIPS = [
    { title: 'خصم 10% على أول طلب', subtitle: 'استخدم الكود عند الدفع', badgeText: 'WELCOME10', linkUrl: '#/products', emoji: '🎁', colors: ['#f59e0b', '#7c2d12'] },
    { title: 'عروض الموبايلات', subtitle: 'خصومات لحد 20% على أحدث الأجهزة', badgeText: 'لفترة محدودة', linkUrl: '#/category/cat-electronics', emoji: '📱', colors: ['#4f46e5', '#1e1b4b'] },
    { title: 'عطور أصلية', subtitle: 'تشكيلة عود ومسك وهدايا', badgeText: 'جديد', linkUrl: '#/category/cat-beauty', emoji: '🌸', colors: ['#a855f7', '#3b0764'] },
    { title: 'ألعاب الأطفال', subtitle: 'هدايا لكل الأعمار', badgeText: 'الأكثر طلباً', linkUrl: '#/category/cat-games', emoji: '🧸', colors: ['#eab308', '#713f12'] }
  ];
  return STRIPS.map((b, i) => ({
    id: crypto.randomUUID(), title: b.title, subtitle: b.subtitle, badgeText: b.badgeText, linkUrl: b.linkUrl,
    imageUrl: saveImage(`strip-${i + 1}`, bannerSvg(b.emoji, ...b.colors, false)), bgGradient: `linear-gradient(135deg, ${b.colors[0]} 0%, ${b.colors[1]} 100%)`,
    colorName: 'عرض تجريبي', orderIndex: i, isActive: true, placement: 'strip', categoryId: null, subcategoryId: null, bannerType: 'image_full_width', isDemo: true
  }));
}

// Add only the thin banners (for a store that already has the other demo data)
async function addStrips() {
  if (await db.banners.count(b => b.isDemo && b.placement === 'strip')) { console.log('Thin demo banners are already there.'); return; }
  const list = stripBanners();
  await db.atomic(t => {
    list.forEach(b => t.banners.insert(b));
    const s = t.settings.getAll()[0];
    if (s) t.settings.update(s.id, { demoUploads: [...(s.demoUploads || []), ...written] });
  });
  console.log(`✔ Added ${list.length} thin banners under the home slider.`);
}

async function remove() {
  const settings = (await db.settings.getAll())[0] || {};
  const COLS = ['products', 'merchants', 'investors', 'banners', 'showcases', 'coupons', 'users'];
  const counts = await db.atomic(t => {
    const out = {};
    for (const c of COLS) {
      const rows = t[c].find(r => r.isDemo === true && (c !== 'users' || ['merchant', 'investor'].includes(r.role)));
      rows.forEach(r => t[c].delete(r.id));
      out[c] = rows.length;
    }
    const s = t.settings.getAll()[0];
    if (s) t.settings.update(s.id, { demoDataAddedAt: undefined, demoUploads: undefined });
    return out;
  });
  let files = 0;
  for (const f of settings.demoUploads || []) { if (/^demo-[\w.\-]+\.svg$/.test(f)) { try { fs.unlinkSync(path.join(UPLOADS, f)); files++; } catch (e) { /* already gone */ } } }
  try { fs.unlinkSync(ACCOUNTS_FILE); } catch (e) { /* none */ }
  console.log('✔ Removed demo data:', JSON.stringify(counts), `| images: ${files}`);
  console.log('  Note: orders / reviews you placed while testing are NOT removed by this script.');
}

(mode === 'add' ? add() : mode === 'strips' ? addStrips() : remove()).catch(err => {
  // the database step is all-or-nothing; also delete any images made before the failure
  for (const f of written) { try { fs.unlinkSync(path.join(UPLOADS, f)); } catch (e) { /* none */ } }
  console.error('FAILED — nothing was changed:', err.message);
  process.exit(1);
});
