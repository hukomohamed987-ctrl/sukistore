const db = require('../database/db');
const { normalizeNumerals } = require('./normalizeNumerals');

const WELCOME_MESSAGE = 'أهلاً بحضرتك يا فندم، أنا بسام المساعد الذكي لمتجر سوقي ستور. إزاي أقدر أساعد حضرتك؟';

const BASSAM_SYSTEM_PROMPT = `
أنت "بسام"، موظف المبيعات وخدمة العملاء الذكي لمتجر SOUQI STORE (سوقي ستور).

1. مهمتك وشخصيتك:
- مساعدة العملاء للوصول إلى ما يريدونه وتقديم تجربة تسوق مريحة وودودة.
- فهم احتياج العميل حتى لو لم يشرحه بدقة، ومساعدته على اتخاذ قرار الشراء باحترافية دون ضغط أو إلحاح.
- التعامل مع الاعتراضات والاستفسارات (مثل السعر أو الجودة أو التردد) بهدوء واحترافية للحفاظ على ثقة العميل ورضاه.

2. أسلوب الكلام واللغة:
- تحدث كموظف حقيقي محترف وليس برنامجاً آلياً.
- استخدم اللهجة المصرية البسيطة والمهذبة في المحادثات المعتادة، والفصحى اللطيفة إذا تحدث العميل بالفصحى، والإنجليزية الودودة إذا تحدث العميل بالإنجليزية.
- استخدم إيموجي بسيطة عند ملاءمتها (مثل ❤️ و 😊).
- تجنب الردود الآلية المتكررة، المقدمات الطويلة، تكرار نفس السؤال، الإلحاح على الشراء، الأسلوب الرسمي الجامد، أو طرح أسئلة كثيرة متتالية.

3. فهم العميل والذاكرة السياقية:
- افهم القصد والاحتياج من سياق المحادثة ولا تتعامل مع الكلام كأوامر حرفية فقط.
- إذا كان الكلام غامضاً، اطلب توضيحاً بسيطاً ولطيفاً بسؤال واحد مختصر.
- إذا كان المعنى واضحاً رغم الأخطاء الإملائية، افهمه فوراً دون تصحيح للعميل أو إزعاجه.
- احتفظ بسياق المحادثة (المنتج، الفئة، الميزانية، اللغة) ولا تجعل العميل يكرر ما ذكره سابقاً.

4. أسلوب البيع الاحترافي:
- تصرف كمستشار مبيعات هدفه مساعدة العميل وليس الضغط عليه.
- إذا كان العميل متردداً، افهم سبب التردد بلطف وطمئنه بمعلومات حقيقية.
- إذا كان السعر هو المشكلة، اقترح بدائل اقتصادية بسعر أقل أو العروض المتاحة فعلياً بدون اختلاق.
- إذا كان العميل يبحث عن الجودة، ركز على المواصفات والمميزات الحقيقية الموجودة في بيانات المنتج والضمان الفعلي.

5. حدود الشخصية الصارمة:
- لا تخترع معلومات عن المنتجات أو الأسعار أو العروض أبداً.
- لا تدّعِ تنفيذ أي عملية لم تنفذها الأنظمة الفعلية (مثل تأكيد دفع أو إلغاء أو تعديل طلب).
- لا تطلب أبداً كلمات المرور أو أكواد التحقق (OTP) أو بيانات البطاقات البنكية.
- لا تتظاهر بأنك موظف بشري؛ وإذا سألك العميل هل أنت مساعد ذكي أو روبوت، أجب بوضوح ولباقة، واعرض التحويل لموظف بشري إذا رغب.
- لا تدخل في معلومات الإدارة أو لوحة التحكم أو البيانات الداخلية للمتجر (مثل التكلفة والتجار والمستثمرين والأرباح).
`.trim();

const EGYPT_GOVS = [
  'القاهرة', 'الجيزة', 'الإسكندرية', 'الدقهلية', 'البحر الأحمر', 'البحيرة', 'الفيوم',
  'الغربية', 'الإسماعيلية', 'المنوفية', 'المنيا', 'القليوبية', 'الوادي الجديد',
  'السويس', 'أسوان', 'أسيوط', 'بني سويف', 'بورسعيد', 'دمياط', 'الشرقية',
  'جنوب سيناء', 'كفر الشيخ', 'مطروح', 'الأقصر', 'قنا', 'شمال سيناء', 'سوهاج'
];

const SYNONYM_GROUPS = [
  ['سماعة', 'سماعات', 'سماعه', 'سمعه', 'سمعات', 'هيدفون', 'هيد فون', 'هيدست', 'headphone', 'headphones', 'headset', 'earphone', 'earphones'],
  ['ايربودز', 'إيربودز', 'إيربزدو', 'earbuds', 'earbud'],
  ['سبيكر', 'مكبر صوت', 'مكبرات صوت', 'speaker', 'speakers'],
  ['مستقبل بلوتوث', 'محول بلوتوث', 'مستقبل ومحلو بلوتوث', 'bluetooth receiver', 'aux adapter'],
  ['موبايل', 'تليفون', 'هاتف', 'جوال', 'موبايلات', 'فون', 'smartphone', 'phone', 'mobile'],
  ['حامل هاتف', 'حامل موبايل', 'ستاند', 'stand', 'car holder', 'phone holder'],
  ['ساعة ذكية', 'سمارت واتش', 'smartwatch', 'smart watch'],
  ['تابلت', 'لوحي', 'ايباد', 'tablet', 'ipad'],
  ['شاشة', 'تلفزيون', 'تليفزيون', 'شاشات', 'مونيتور', 'tv', 'screen', 'monitor', 'smart tv', 'display'],
  ['ماوس', 'فأرة', 'فاره', 'فاهر', 'فأةر', 'mouse', 'mice'],
  ['كيبورد', 'لوحة مفاتيح', 'keyboard', 'keyboards'],
  ['لابتوب', 'كمبيوتر', 'بي سي', 'البتبو', 'laptop', 'pc', 'computer'],
  ['حامل تبريد', 'مبرد لابتوب', 'cooling pad', 'cooling stand', 'laptop cooler'],
  ['موزع', 'هب', 'محلو معزو هب', 'hub', 'usb hub'],
  ['شاحن', 'شواحن', 'جداري', 'جيراد', 'محطة شحن', 'charger', 'chargers', 'wall charger', 'charging station'],
  ['باور بانك', 'باوربانك', 'شاحن متنقل', 'بنك طاقة', 'powerbank', 'power bank', 'portable charger'],
  ['كابل', 'كابلات', 'كيبل', 'وصلة', 'cable', 'cables', 'cord'],
  ['محول', 'محلو', 'adapter', 'converter'],
  ['فلاشة', 'فلاش', 'فالش', 'flash', 'flash drive', 'usb drive'],
  ['ميموري', 'ميميرو', 'كارت ميموري', 'بطاقة ذاكرة', 'بطاقة اذكةر', 'قارئ بطاقات', 'memory card', 'microsd', 'sd', 'card reader'],
  ['هارد', 'قرص صلب', 'قصر صلب', 'هارد خارجي', 'ssd', 'hdd', 'hard drive', 'external drive'],
  ['راوتر', 'روتر', 'موسع واي فاي', 'مقوي شبكة', 'مقيو', 'router', 'wifi extender', 'repeater'],
  ['سويتش', 'سويتش شبكات', 'ايثرنت', 'network switch', 'ethernet'],
  ['ميكروفون', 'مايك', 'ميكرفون', 'ميكورفنو', 'بودكاست', 'بدوكاست', 'mic', 'microphone', 'podcast mic'],
  ['كاميرا ويب', 'webcam', 'web camera'],
  ['داش كام', 'داشكام', 'كاميرا مراقبة سيارة', 'dashcam', 'dash cam'],
  ['كاميرا', 'كاميرات', 'camera', 'cameras'],
  ['عربية', 'سيارة', 'سياةر', 'car', 'auto', 'vehicle'],
  ['مصباح', 'لمبة', 'اضاءة', 'إضاءة', 'lamp', 'light', 'desk lamp'],
  ['بروجكتور', 'بورجكترو', 'بروجكتر', 'بروجيكتور', 'projector'],
  ['دراع', 'ذراع تحكم', 'عارذ تحكم', 'يد العاب', 'controller', 'gamepad'],
  ['قلم الكتروني', 'قلم إلكتورني', 'قلم ذكي', 'stylus', 'smart pen'],
  ['ملابس', 'ازياء', 'أزياء', 'هدوم', 'لبس', 'fashion', 'clothes'],
  ['تيشيرت', 'قميص', 'shirt', 't-shirt'],
  ['بنطلون', 'pants', 'jeans'],
  ['حذاء', 'كوتشي', 'shoes', 'sneakers'],
  ['مطبخ', 'ادوات منزلية', 'اجهزة منزلية', 'home appliances', 'kitchen'],
  ['عناية', 'تجميل', 'بشرة', 'beauty', 'skincare'],
  ['عطور', 'برفان', 'عطر', 'perfume'],
  ['كتب', 'كتاب', 'مكتبية', 'مذاكرة', 'books', 'office']
];

const BRAND_ALIASES = [
  { canonical: 'سامسونج', aliases: ['سامسونج', 'سمسونج', 'سامسونغ', 'samsung'] },
  { canonical: 'أبل', aliases: ['ابل', 'أبل', 'ايفون', 'أيفون', 'apple', 'iphone', 'ipad'] },
  { canonical: 'شاومي', aliases: ['شاومي', 'شيومي', 'شومي', 'xiaomi', 'redmi'] },
  { canonical: 'هواوي', aliases: ['هواوي', 'هواوى', 'huawei'] },
  { canonical: 'ريلمي', aliases: ['ريلمي', 'ريلمى', 'realme'] },
  { canonical: 'سوني', aliases: ['سوني', 'سونى', 'sony'] },
  { canonical: 'JBL', aliases: ['jbl', 'جي بي ال', 'جى بى ال'] },
  { canonical: 'ديل', aliases: ['ديل', 'dell'] },
  { canonical: 'نايكي', aliases: ['نايكي', 'نايك', 'nike'] },
  { canonical: 'زارا', aliases: ['زارا', 'zara'] },
  { canonical: 'ديفاكتو', aliases: ['ديفاكتو', 'ديفكتو', 'defacto'] },
  { canonical: 'تاون تيم', aliases: ['تاون تيم', 'townteam', 'town team'] },
  { canonical: 'نيڤيا', aliases: ['نيفيا', 'نيڤيا', 'nivea'] },
  { canonical: 'لوريال', aliases: ['لوريال', 'loreal', 'l oreal'] },
  { canonical: 'تورنادو', aliases: ['تورنيدو', 'تورنادو', 'tornado'] },
  { canonical: 'تيفال', aliases: ['تيفال', 'tefal'] },
  { canonical: 'براون', aliases: ['براون', 'braun'] },
  { canonical: 'بوش', aliases: ['بوش', 'bosch'] },
  { canonical: 'إنجكو', aliases: ['انجكو', 'إنجكو', 'ingco'] },
  { canonical: 'زهران', aliases: ['زهران', 'zahran'] },
  { canonical: 'العربية للعود', aliases: ['العربيه للعود', 'arabian oud'] }
];

const AMBIGUOUS_GENERIC_TERMS = new Set([
  'جهاز', 'اجهزه', 'اداه', 'ادوات', 'قطعه', 'قطع', 'نوع', 'انواع', 'موديل', 'موديلات',
  'شغل', 'للشغل', 'عمل', 'للعمل', 'بيت', 'للبيت', 'غرض', 'اغراض', 'مساعده', 'اختيار',
  'device', 'devices', 'item', 'items', 'thing', 'things', 'stuff', 'something', 'work', 'home', 'help'
]);

const STOP_WORDS = new Set([
  'في', 'من', 'علي', 'عن', 'الي', 'هل', 'ما', 'ماذا', 'كيف', 'كم', 'كام', 'بكام', 'ايه', 'لي', 'ليا', 'لييا', 'عندي',
  'عايز', 'عوز', 'محتاج', 'ابغي', 'اريد', 'ارغب', 'لو', 'سمحت', 'ممكن', 'عندكم', 'عندك', 'يوجد', 'يتوفر', 'تتوفر',
  'فيه', 'فيها', 'فيهم', 'هذا', 'هذه', 'ده', 'دي', 'دول', 'يا', 'فندم', 'بسام', 'سوقي', 'ستور', 'نوع', 'موديل',
  'بسعر', 'سعر', 'سعره', 'سعرها', 'اسعار', 'تمن', 'تمنه', 'ثمن', 'منتج', 'منتجات', 'حاجه', 'حاجات', 'شيء', 'شئ', 'جنيه', 'جم', 'ج',
  'موجود', 'متاح', 'متاحه', 'متوفر', 'متوفره', 'عليه', 'عليها', 'خصم', 'خصومات', 'تحت', 'فوق', 'اقل', 'اكثر', 'اكتر', 'الافضل', 'الاحسن',
  'من فضلك', 'لو سمحت', 'تقدر', 'تجيبلي', 'وريني', 'اعرف', 'قولي', 'عنكم', 'ابحث', 'هات', 'جبلي',
  'الاول', 'الثاني', 'التاني', 'الثالث', 'التالت', 'غيره', 'غيرها', 'تاني', 'تانيه', 'ثانيه', 'تانيين',
  'لون', 'الوان', 'بلون', 'مقاس', 'مقاسات', 'حجم', 'احجام', 'خيار', 'خيارات',
  'بديل', 'بدائل', 'مشابه', 'مكمل', 'مكمله', 'مكملات', 'ملحق', 'ملحقات', 'اكسسوار', 'اكسسوارات', 'توافق', 'متوافق', 'يتوافق', 'يناسب', 'يناسبه', 'يمشي', 'يشتغل', 'معاه', 'معاها',
  'تفاصيل', 'تفاصيله', 'تفاصيلها', 'مواصفات', 'مواصفاته', 'مواصفاتها', 'وصف', 'وصفه',
  'قبل', 'بعده', 'بعدها', 'نسبه', 'كميه', 'الكميه', 'مخزون', 'مخزونه', 'المخزون', 'باقي', 'متبقي',
  'صور', 'صوره', 'الصور', 'قارن', 'مقارنه', 'الفرق', 'بين', 'انهي', 'ايهما', 'ولا', 'او', 'مع', 'ضد',
  'ارخص', 'اوفر', 'اغلي', 'اقوي', 'احسن', 'افضل', 'اعلي', 'اكبر', 'اسرع',
  'بحدود', 'حدود', 'لحد', 'ميزانيه', 'ميزانيتي', 'بحد', 'اقصي', 'يزيد', 'قسم', 'فئه', 'ماركه', 'الماركه', 'براند', 'شركه',
  'حلو', 'حلوه', 'جيد', 'جيده', 'جميل', 'جميله', 'كويس', 'كويسه', 'مناسب', 'مناسبه', 'شراء', 'اشتري', 'اختيار', 'اختار',
  'محدد', 'معين', 'ممتاز', 'غالي', 'مكلف', 'مرتفع', 'متردد', 'جوده', 'عاليه', 'هديه', 'هدايا', 'ضمان', 'ضمانه',
  'sweet', 'nice', 'good', 'looking', 'for', 'need', 'want', 'show', 'me', 'have', 'you', 'the', 'and', 'with', 'any',
  'under', 'below', 'above', 'over', 'price', 'cost', 'product', 'products', 'buy', 'something', 'egp', 'please', 'hi', 'hello',
  'give', 'cheapest', 'stronger', 'better', 'higher', 'other', 'another', 'color', 'colors', 'size', 'sizes', 'options', 'variants',
  'brand', 'category', 'section', 'specs', 'specifications', 'details', 'description', 'quantity', 'stock', 'available', 'availability',
  'images', 'image', 'photo', 'photos', 'compare', 'difference', 'between', 'vs', 'versus', 'before', 'after', 'discount', 'percent',
  'compatible', 'compatibility', 'complementary', 'accessory', 'accessories', 'addon', 'addons', 'alternative', 'alternatives', 'goes', 'works'
]);

function normalizeArabic(text) {
  if (!text) return '';
  return normalizeNumerals(String(text))
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/ڤ/g, 'ف')
    .replace(/پ/g, 'ب')
    .replace(/[؟?!.,،؛:()\[\]{}"'«»\/\\_-]+/g, ' ')
    .replace(/\bباور\s*بانك\b/g, 'باوربانك')
    .replace(/باور\s+بانك/g, 'باوربانك')
    .replace(/بور\s*بانك/g, 'باوربانك')
    .replace(/واي\s+فاي/g, 'وايفاي')
    .replace(/تايب\s+سي/g, 'تايبسي')
    .replace(/تيب\s+سي/g, 'تايبسي')
    .replace(/داش\s+كام/g, 'داشكام')
    .replace(/power\s+bank/g, 'powerbank')
    .replace(/\s+/g, ' ')
    .trim();
}

function boundedLevenshtein(a, b, maxDist = 2) {
  const s = normalizeArabic(a).replace(/\s+/g, '');
  const t = normalizeArabic(b).replace(/\s+/g, '');
  if (s === t) return 0;
  if (Math.abs(s.length - t.length) > maxDist) return maxDist + 1;
  const rows = s.length + 1;
  const cols = t.length + 1;
  const dp = Array.from({ length: rows }, () => new Array(cols).fill(0));
  for (let i = 0; i < rows; i++) dp[i][0] = i;
  for (let j = 0; j < cols; j++) dp[0][j] = j;
  for (let i = 1; i < rows; i++) {
    let rowMin = maxDist + 1;
    for (let j = 1; j < cols; j++) {
      const cost = s[i - 1] === t[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
      // Optimal string alignment: adjacent character transposition costs 1 instead of 2
      if (i > 1 && j > 1 && s[i - 1] === t[j - 2] && s[i - 2] === t[j - 1]) {
        dp[i][j] = Math.min(dp[i][j], dp[i - 2][j - 2] + cost);
      }
      if (dp[i][j] < rowMin) rowMin = dp[i][j];
    }
    if (rowMin > maxDist) return maxDist + 1;
  }
  return dp[s.length][t.length];
}

function stemToken(token) {
  let t = normalizeArabic(token);
  if (t.length <= 3) return t;
  const prefixes = ['وال', 'بال', 'كال', 'فال', 'لل', 'ال'];
  for (const p of prefixes) {
    if (t.startsWith(p) && t.length - p.length >= 3) {
      t = t.slice(p.length);
      break;
    }
  }
  if (t.length >= 4 && /^[وبلكف]/.test(t) && !['باور', 'باوربانك', 'بلوتوث', 'واي', 'وايفاي', 'ويب', 'فلاش', 'فاره', 'كابل', 'كاميرا', 'كيبورد', 'لابتوب'].includes(t)) {
    const candidate = t.slice(1);
    if (candidate.length >= 4) return candidate;
  }
  return t;
}

function getBigrams(str) {
  const s = str.replace(/\s+/g, '');
  const set = [];
  for (let i = 0; i < s.length - 1; i++) {
    set.push(s.slice(i, i + 2));
  }
  return set;
}

function diceSimilarity(a, b) {
  const na = normalizeArabic(a).replace(/\s+/g, '');
  const nb = normalizeArabic(b).replace(/\s+/g, '');
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  if (na.length < 2 || nb.length < 2) return 0;
  const bgA = getBigrams(na);
  const bgB = getBigrams(nb);
  const pool = [...bgB];
  let matches = 0;
  for (const gram of bgA) {
    const idx = pool.indexOf(gram);
    if (idx !== -1) {
      matches++;
      pool.splice(idx, 1);
    }
  }
  return (2 * matches) / (bgA.length + bgB.length);
}

function fuzzyTokenMatch(tok, target) {
  const a = normalizeArabic(tok);
  const b = normalizeArabic(target);
  if (!a || !b) return 0;
  if (a === b) return 1;
  const sa = stemToken(a);
  const sb = stemToken(b);
  if (sa === sb && sa.length >= 3) return 0.96;

  const minLen = Math.min(a.length, b.length);
  const dice = Math.max(diceSimilarity(a, b), diceSimilarity(sa, sb));
  if (minLen <= 3) return 0;

  if (minLen === 4) {
    const dist = Math.min(boundedLevenshtein(a, b, 1), boundedLevenshtein(sa, sb, 1));
    if (dist <= 1) return 0.85;
    return dice >= 0.72 ? dice : 0;
  }

  const dist = Math.min(boundedLevenshtein(a, b, 2), boundedLevenshtein(sa, sb, 2));
  if (dist === 1) return 0.9;
  if (dist === 2 && Math.max(a.length, b.length) >= 6) return 0.78;
  return dice >= 0.62 ? dice : 0;
}

function expandSearchTerms(tokens, normQuery = '') {
  const expanded = new Set();
  for (const tok of tokens) {
    const norm = normalizeArabic(tok);
    const stem = stemToken(norm);
    if (norm && !STOP_WORDS.has(norm)) expanded.add(norm);
    if (stem && !STOP_WORDS.has(stem)) expanded.add(stem);

    for (const group of SYNONYM_GROUPS) {
      const hit = group.some(term => {
        const nt = normalizeArabic(term);
        if (!nt) return false;
        if (nt.includes(' ')) {
          return Boolean(normQuery && normQuery.includes(nt));
        }
        return (
          nt === norm ||
          nt === stem ||
          fuzzyTokenMatch(norm, nt) >= 0.78
        );
      });
      if (hit) {
        group.forEach(term => expanded.add(normalizeArabic(term)));
      }
    }
  }
  return Array.from(expanded).filter(t => t.length >= 2);
}

function sanitizePublicProduct(p, categoryName = '', subcategoryName = '', resolvedBrandName = '') {
  const price = Number(p.price) || 0;
  const compareAtPrice = p.compareAtPrice && Number(p.compareAtPrice) > price ? Number(p.compareAtPrice) : null;
  const savingsAmount = compareAtPrice ? Math.round((compareAtPrice - price) * 100) / 100 : 0;
  const recordedPct = Number(p.discountPercent) || 0;
  const discountPercent = compareAtPrice
    ? Math.round(((compareAtPrice - price) / compareAtPrice) * 100)
    : (recordedPct > 0 ? recordedPct : 0);
  const rawStock = Number(p.stock);
  const stock = Number.isFinite(rawStock) ? Math.max(0, Math.floor(rawStock)) : 0;

  const ownerTokens = [p.merchantName, p.investorName]
    .map(v => normalizeArabic(v || ''))
    .filter(Boolean);

  const publicTags = Array.isArray(p.tags)
    ? p.tags.filter(t => {
        const s = String(t || '').trim();
        if (!s || /^TR-\d+$/i.test(s)) return false;
        const normT = normalizeArabic(s);
        return !ownerTokens.includes(normT);
      })
    : [];

  const images = Array.isArray(p.images)
    ? p.images.map(u => String(u || '').trim()).filter(Boolean)
    : [];
  if (images.length === 0 && p.image && String(p.image).trim()) {
    images.push(String(p.image).trim());
  }

  return {
    id: p.id,
    title: p.title || '',
    description: String(p.description || '').trim(),
    price,
    compareAtPrice,
    savingsAmount,
    discountPercent,
    stock,
    inStock: stock > 0,
    isFreeShipping: Boolean(p.isFreeShipping || Number(p.shippingCost) === 0),
    shippingCost: Number(p.shippingCost) || 0,
    categoryId: p.categoryId || '',
    categoryName: String(categoryName || '').trim(),
    subcategoryId: p.subcategoryId || '',
    subcategoryName: String(subcategoryName || '').trim(),
    brand: String(p.brand || resolvedBrandName || '').trim(),
    variations: Array.isArray(p.variations) ? p.variations : [],
    tags: publicTags,
    images,
    image: images[0] || '',
    warrantyText: String(p.warrantyText || '').trim(),
    saleUnit: String(p.saleUnit || '').trim(),
    isFeatured: Boolean(p.isFeatured),
    salesCount: Number(p.salesCount) || 0
  };
}

function toProductCard(p) {
  const images = Array.isArray(p.images)
    ? p.images.filter(Boolean)
    : (p.image ? [p.image] : []);
  return {
    id: p.id,
    title: p.title,
    description: p.description || '',
    price: p.price,
    compareAtPrice: p.compareAtPrice,
    discountPercent: p.discountPercent,
    savingsAmount: p.savingsAmount,
    stock: p.stock,
    inStock: p.stock > 0,
    isFreeShipping: p.isFreeShipping,
    shippingCost: Number(p.shippingCost) || 0,
    image: images[0] || '',
    images,
    categoryName: p.categoryName || '',
    subcategoryName: p.subcategoryName || '',
    brand: p.brand || '',
    variations: Array.isArray(p.variations) ? p.variations : [],
    warrantyText: p.warrantyText || '',
    saleUnit: p.saleUnit || ''
  };
}

function formatVariationSummary(p, lang = 'eg') {
  const vars = Array.isArray(p.variations)
    ? p.variations.filter(v => v && Array.isArray(v.values) && v.values.length > 0)
    : [];
  if (vars.length === 0) {
    return lang === 'en'
      ? 'No additional colors, sizes, or variants are registered for this product.'
      : 'غير مسجل ألوان أو مقاسات أو خيارات إضافية في بيانات المنتج حالياً.';
  }
  return vars.map(v => `${v.name}: ${v.values.join('، ')}`).join(' | ');
}

function formatProductLine(p, lang = 'eg') {
  const unit = p.saleUnit || (lang === 'en' ? 'pcs' : 'قطعة');
  if (lang === 'en') {
    const disc = p.compareAtPrice
      ? ` (was ${p.compareAtPrice} EGP — ${p.discountPercent}% off, save ${p.savingsAmount} EGP)`
      : '';
    const ship = p.isFreeShipping ? ' • Free shipping' : '';
    const stockTxt = p.stock > 0 ? ` • In stock: ${p.stock} ${unit}` : ' • Out of stock (0 available)';
    return `• ${p.title}: ${p.price} EGP${disc}${ship}${stockTxt}`;
  }
  const discTxt = p.compareAtPrice
    ? (lang === 'msa'
        ? ` (بدلاً من ${p.compareAtPrice} ج.م — خصم ${p.discountPercent}%، توفير ${p.savingsAmount} ج.م)`
        : ` (بدلاً من ${p.compareAtPrice} ج.م — خصم ${p.discountPercent}%، توفير ${p.savingsAmount} ج.م)`)
    : '';
  const shipTxt = p.isFreeShipping ? ' • شحن مجاني' : '';
  const stockTxt = p.stock > 0
    ? ` • متوفر (${p.stock} ${unit})`
    : ' • غير متوفر حالياً بالمخزون (0)';
  return `• ${p.title}: ${p.price} ج.م${discTxt}${shipTxt}${stockTxt}`;
}

function formatProductDetailsBlock(p, lang = 'eg') {
  const unit = p.saleUnit || (lang === 'en' ? 'pcs' : 'قطعة');
  const sectionTxt = [p.categoryName, p.subcategoryName].filter(Boolean).join(' / ') || (lang === 'en' ? 'Not specified' : 'غير مسجل');
  const brandTxt = p.brand || (lang === 'en' ? 'Not registered' : 'غير مسجلة');
  const descTxt = p.description || (lang === 'en' ? 'No description registered.' : 'لا يوجد وصف مسجل في بيانات المنتج.');
  const varsTxt = formatVariationSummary(p, lang);
  const imgsCount = Array.isArray(p.images) ? p.images.length : (p.image ? 1 : 0);
  const imgsTxt = imgsCount > 0
    ? (lang === 'en' ? `${imgsCount} registered image(s)` : `${imgsCount} صورة مسجلة`)
    : (lang === 'en' ? 'No product images uploaded yet' : 'لا توجد صور مسجلة لهذا المنتج حالياً');

  if (lang === 'en') {
    const priceTxt = p.compareAtPrice
      ? `**${p.price} EGP** (Before discount: ${p.compareAtPrice} EGP • Discount: ${p.discountPercent}% • Save ${p.savingsAmount} EGP)`
      : `**${p.price} EGP** (No discount currently listed)`;
    const stockTxt = p.stock > 0 ? `In stock (${p.stock} ${unit})` : 'Currently out of stock (0 available)';
    const shipTxt = p.isFreeShipping ? 'Free shipping' : `Recorded shipping: ${p.shippingCost} EGP`;
    const warTxt = p.warrantyText || 'Standard 14-day return/exchange for manufacturing defects';
    return [
      `📌 **${p.title}**`,
      `• **Category:** ${sectionTxt} | **Brand:** ${brandTxt}`,
      `• **Price:** ${priceTxt}`,
      `• **Availability & Quantity:** ${stockTxt}`,
      `• **Description & Specs:** ${descTxt}`,
      `• **Colors / Sizes / Options:** ${varsTxt}`,
      `• **Images:** ${imgsTxt}`,
      `• **Shipping & Warranty:** ${shipTxt} | ${warTxt}`
    ].join('\n');
  }

  const priceTxt = p.compareAtPrice
    ? `**${p.price} ج.م** (السعر قبل الخصم: ${p.compareAtPrice} ج.م • نسبة الخصم: ${p.discountPercent}% • توفير ${p.savingsAmount} ج.م)`
    : `**${p.price} ج.م** (لا يوجد خصم مسجل حالياً)`;
  const stockTxt = p.stock > 0 ? `متوفر (${p.stock} ${unit})` : 'غير متوفر حالياً بالمخزون (الكمية: 0)';
  const shipTxt = p.isFreeShipping ? 'شحن مجاني' : `رسوم الشحن المسجلة: ${p.shippingCost} ج.م`;
  const warTxt = p.warrantyText || 'ضمان المتجر الرسمي 14 يوماً ضد عيوب الصناعة';

  return [
    `📌 **${p.title}**`,
    `• **القسم:** ${sectionTxt} | **الماركة:** ${brandTxt}`,
    `• **السعر:** ${priceTxt}`,
    `• **الحالة والكمية بالمخزون:** ${stockTxt}`,
    `• **الوصف والمواصفات:** ${descTxt}`,
    `• **الألوان والمقاسات والخيارات:** ${varsTxt}`,
    `• **الصور:** ${imgsTxt}`,
    `• **الشحن والضمان:** ${shipTxt} | ${warTxt}`
  ].join('\n');
}

/**
 * Picks response language/register: 'en' (English), 'msa' (Modern Standard Arabic), or 'eg' (Polite Egyptian Arabic).
 */
function detectReplyStyle(rawText, conversation = null) {
  const txt = String(rawText || '').trim();
  const arabicChars = (txt.match(/[\u0600-\u06FF]/g) || []).length;
  const latinChars = (txt.match(/[A-Za-z]/g) || []).length;
  const norm = normalizeArabic(txt);

  // Common tech acronyms in Arabic chat don't mean English conversation
  const techExceptions = /\b(usb|hdmi|led|tv|ssd|hdd|wifi|tws|anc|gan|rgb|suki|otp|cvv)\b/gi;
  const strippedLatin = txt.replace(techExceptions, '').replace(/[^A-Za-z]/g, '').length;

  if (arabicChars === 0 && strippedLatin >= 2) {
    return 'en';
  }
  if (strippedLatin > arabicChars * 1.5 && strippedLatin >= 6) {
    return 'en';
  }

  const msaCues = /(اريد|ارغب|اود|هل يمكن|هل يوجد|هل يتوفر|هل تتوفر|كيف يمكنني|كيف حال|كيف جود|ما هي|ما هو|ما تكلفه|ما سعر|كم سعر|ابحث عن|مرتفع|حسنا|بالتاكيد|شكرا جزيلا|جدا|من فضلك|لماذا|اليس كذلك|احتاج الي|انني|انكم|توصيل الطلب|تفضل|بكل سرور|معذره|لا باس|يسعدني|هذا المنتج|هذه المنتجات|اعتقد ان|متوفر لديكم|ماذا عن)/;
  const egCues = /(عايز|عوز|ازيك|ازي حضرتك|ازاي|بكام|عشان|علشان|دلوقتي|حاجه|مفيش|ايه|كده|شويه|مش|بتاع|عيوني|ولا يهمك|هناخد|محتاج حاجه)/;

  if (msaCues.test(norm) && !egCues.test(norm)) {
    return 'msa';
  }
  if (egCues.test(norm)) {
    return 'eg';
  }

  // Ambiguous/neutral turns ("نعم", "لا", "500", "ok"): inherit recent style from conversation
  if (txt.length <= 45 && conversation && Array.isArray(conversation.messages)) {
    for (let i = conversation.messages.length - 1; i >= 0; i--) {
      const m = conversation.messages[i];
      if (m.sender === 'bot' && m.lang) {
        return m.lang;
      }
      if (m.sender === 'customer' && m.text && m.text !== rawText) {
        const prevAr = (m.text.match(/[\u0600-\u06FF]/g) || []).length;
        const prevLat = m.text.replace(techExceptions, '').replace(/[^A-Za-z]/g, '').length;
        if (prevAr === 0 && prevLat >= 3) return 'en';
        if (msaCues.test(normalizeArabic(m.text)) && !egCues.test(normalizeArabic(m.text))) return 'msa';
        break;
      }
    }
  }

  return 'eg';
}

function localizeText(lang, variants) {
  return variants[lang] || variants.eg;
}

async function loadStoreContext(user = null) {
  const [rawProducts, categories, subcategories, brands, banners, allCoupons, settingsList] = await Promise.all([
    db.products.find(p => p.isActive !== false),
    db.categories.getAll(),
    db.subcategories.getAll(),
    db.brands.getAll(),
    db.banners.find(b => b.isActive !== false),
    db.coupons.find(c => c.isActive !== false),
    db.settings.getAll()
  ]);

  const settings = settingsList[0] || {};
  const catMap = {};
  categories.forEach(c => {
    catMap[c.id] = c.name;
  });

  const subMap = {};
  subcategories.forEach(s => {
    subMap[s.id] = s.name;
  });

  const brandMap = {};
  brands.forEach(b => {
    brandMap[b.id] = b.name;
  });

  const products = rawProducts.map(p => sanitizePublicProduct(p, catMap[p.categoryId] || '', subMap[p.subcategoryId] || '', brandMap[p.brandId] || ''));
  const now = new Date();

  const validCoupons = allCoupons.filter(c => {
    if (c.expiresAt && new Date(c.expiresAt) < now) return false;
    if (c.maxUses && (Number(c.usedCount) || 0) >= Number(c.maxUses)) return false;
    return true;
  });

  const publicCoupons = validCoupons.filter(c => !c.targetUserId);
  let personalCoupons = [];
  let loyaltySummary = null;
  let customerOrders = [];
  let customerUser = null;

  if (user && user.id) {
    customerUser = await db.users.getById(user.id);
    if (customerUser) {
      personalCoupons = validCoupons.filter(c => c.targetUserId && String(c.targetUserId) === String(customerUser.id));

      const points = Number(customerUser.loyaltyPoints) || 0;
      const pointValueEgp = Number(settings.loyaltyPointValueEgp) || 1.0;
      const minThreshold = Number(settings.loyaltyMinRedemptionThreshold) || 500;
      const maxPercent = Number(settings.loyaltyMaxRedemptionPercent) || 10;
      const loyaltyEnabled = settings.loyaltyEnabled !== false;

      loyaltySummary = {
        userName: customerUser.name || user.name || '',
        points,
        pointsValueEgp: Math.round(points * pointValueEgp * 100) / 100,
        pointValueEgp,
        minThreshold,
        maxPercent,
        loyaltyEnabled,
        canRedeem: points >= minThreshold && loyaltyEnabled,
        pointsNeededToRedeem: Math.max(0, minThreshold - points)
      };

      const orders = await db.orders.find(o => String(o.userId) === String(customerUser.id));
      orders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      customerOrders = orders.slice(0, 5);
    }
  }

  return {
    products,
    categories,
    subcategories,
    brands,
    catMap,
    subMap,
    banners,
    settings,
    publicCoupons,
    personalCoupons,
    loyaltySummary,
    customerOrders,
    customerUser
  };
}

function extractPriceFilter(normText) {
  let maxPrice = null;
  let minPrice = null;
  let sortMode = null;

  const rangeMatch = normText.match(/(?:من|بين|from|between)\s*(\d+)\s*(?:الي|ل|لحد|و|-|to|and)\s*(\d+)/);
  if (rangeMatch) {
    const a = Number(rangeMatch[1]);
    const b = Number(rangeMatch[2]);
    if (!isNaN(a) && !isNaN(b)) {
      minPrice = Math.min(a, b);
      maxPrice = Math.max(a, b);
    }
  } else {
    const maxMatch = normText.match(/(?:اقل من|تحت|بحدود|في حدود|بحد اقصي|حد اقصي|مش اكتر من|مايزيدش عن|لا يتعدي|لا يزيد عن|ميزانيتي|ميزانيه|تحت سعر|under|below|max|maximum|within|up to|budget)\s*(?:حوالي|تقريبا|من)?\s*(\d+)/);
    if (maxMatch) maxPrice = Number(maxMatch[1]);

    const minMatch = normText.match(/(?:فوق|اكتر من|اكثر من|اعلي من|من اول|above|over|min|minimum)\s*(\d+)/);
    if (minMatch) minPrice = Number(minMatch[1]);

    // Bare budget reply like "400" or "400 جنيه" when answering budget question
    if (maxPrice === null && minPrice === null) {
      const bareMatch = normText.match(/^(\d{2,6})(?:\s*(?:جنيه|جم|ج|egp))?$/);
      if (bareMatch) maxPrice = Number(bareMatch[1]);
    }
  }

  if (/(?:^|\s)(ارخص|اوفر|رخيص|اقل سعر|سعر اقل|اقتصادي|اقتصاديه|cheapest|cheaper|affordable|budget)(?=\s|$)/.test(normText)) sortMode = 'cheapest';
  else if (/(?:^|\s)(اغلي|افضل|فخم|اعلي سعر|عالي الجوده|premium|best quality)(?=\s|$)/.test(normText)) sortMode = 'expensive';
  else if (/(?:^|\s)(اكبر خصم|اعلي خصم|عروض|تخفيض|discount|sale|deals?)(?=\s|$)/.test(normText)) sortMode = 'discount';

  return { maxPrice, minPrice, sortMode };
}

function detectBrandMention(rawTokens, ctx) {
  const catalogBrands = (ctx.brands || []).map(b => ({
    canonical: b.name,
    aliases: [b.name]
  }));
  const allDefs = [];
  const seenCanon = new Set();

  for (const b of BRAND_ALIASES) {
    allDefs.push(b);
    seenCanon.add(normalizeArabic(b.canonical));
  }
  for (const b of catalogBrands) {
    if (!seenCanon.has(normalizeArabic(b.canonical))) {
      allDefs.push(b);
    }
  }

  for (let i = 0; i < rawTokens.length; i++) {
    const tok = rawTokens[i];
    const stem = stemToken(tok);
    for (const def of allDefs) {
      const hit = def.aliases.some(al => {
        const nal = normalizeArabic(al);
        return nal === tok || nal === stem || fuzzyTokenMatch(tok, nal) >= 0.78;
      });
      if (hit) {
        return {
          canonical: def.canonical,
          brand: def.canonical,
          aliases: def.aliases.map(normalizeArabic),
          tokenIndex: i,
          remainingTokens: rawTokens.filter((_, idx) => idx !== i)
        };
      }
    }
  }
  return null;
}

function detectCategoryOrSubcategoryMention(rawTokens, ctx) {
  if (!rawTokens || rawTokens.length === 0) return null;

  for (const sub of (ctx.subcategories || [])) {
    const subWords = normalizeArabic(sub.name).split(' ').filter(w => w.length >= 3);
    for (let i = 0; i < rawTokens.length; i++) {
      const tok = rawTokens[i];
      if (subWords.some(sw => sw === tok || stemToken(sw) === stemToken(tok) || fuzzyTokenMatch(tok, sw) >= 0.76)) {
        return {
          categoryId: sub.categoryId,
          categoryName: ctx.catMap[sub.categoryId] || sub.name,
          subcategoryId: sub.id,
          subcategoryName: sub.name,
          remainingTokens: rawTokens.filter((_, idx) => idx !== i)
        };
      }
    }
  }

  for (const cat of (ctx.categories || [])) {
    const catWords = normalizeArabic(cat.name).split(' ').filter(w => w.length >= 3);
    const slugWords = normalizeArabic(cat.slug || '').split(' ').filter(w => w.length >= 3);
    const words = [...catWords, ...slugWords];
    for (let i = 0; i < rawTokens.length; i++) {
      const tok = rawTokens[i];
      if (words.some(cw => cw === tok || stemToken(cw) === stemToken(tok) || fuzzyTokenMatch(tok, cw) >= 0.76)) {
        return {
          categoryId: cat.id,
          categoryName: cat.name,
          subcategoryId: null,
          subcategoryName: null,
          remainingTokens: rawTokens.filter((_, idx) => idx !== i)
        };
      }
      // Match synonyms only to distinct vertical categories like ملابس -> أزياء, عطور -> عناية وتجميل
      if (!['cat-games', 'cat-electronics'].includes(cat.id)) {
        const expanded = expandSearchTerms([tok]);
        if (catWords.some(cw => expanded.some(ex => cw === ex || stemToken(cw) === stemToken(ex)))) {
          return {
            categoryId: cat.id,
            categoryName: cat.name,
            subcategoryId: null,
            subcategoryName: null,
            remainingTokens: rawTokens.filter((_, idx) => idx !== i)
          };
        }
      }
    }
  }
  return null;
}

function extractPowerMetric(p) {
  const txt = normalizeArabic(`${p.title || ''} ${p.description || ''}`);
  let score = 0;
  const mahMatch = txt.match(/(\d+)\s*mah/);
  if (mahMatch) score += Number(mahMatch[1]);

  const wattMatch = txt.match(/(\d+(?:\.\d+)?)\s*w(?:\s|$)/);
  if (wattMatch) score += Number(wattMatch[1]) * 100;

  const tbMatch = txt.match(/(\d+(?:\.\d+)?)\s*tb/);
  if (tbMatch) score += Number(tbMatch[1]) * 102400;

  const gbMatch = txt.match(/(\d+)\s*gb/);
  if (gbMatch) score += Number(gbMatch[1]) * 100;

  const dpiMatch = txt.match(/(\d+)\s*dpi/);
  if (dpiMatch) score += Number(dpiMatch[1]);

  const mbpsMatch = txt.match(/(\d+)\s*mbps/);
  if (mbpsMatch) score += Number(mbpsMatch[1]);

  const inchMatch = txt.match(/(\d+(?:\.\d+)?)\s*(?:بوصه|inch)/);
  if (inchMatch) score += Number(inchMatch[1]) * 50;

  if (txt.includes('4k')) score += 2160;
  else if (txt.includes('1080p') || txt.includes('fhd')) score += 1080;

  return score;
}

function findStrongerAlternatives(recentShownProducts, rememberedTopic, ctx) {
  const ref = recentShownProducts[0] || null;
  if (!ref && !rememberedTopic) return { ref: null, matches: [], isAlreadyTop: false };

  const topicSearch = rememberedTopic
    ? findMatchingProducts(rememberedTopic, ctx, { preferCategoryId: ref?.categoryId || null, limit: 12 }).matches
    : ctx.products.filter(p => !ref || (p.subcategoryId && p.subcategoryId === ref.subcategoryId) || p.categoryId === ref.categoryId);

  const refMetric = ref ? extractPowerMetric(ref) : 0;
  const shownIds = new Set(recentShownProducts.map(r => String(r.id)));
  const pool = topicSearch.length > 0 ? topicSearch : (ref ? ctx.products.filter(p => p.categoryId === ref.categoryId) : []);

  const candidates = pool
    .filter(p => p.stock > 0 && (!ref || String(p.id) !== String(ref.id)))
    .map(p => {
      const m = extractPowerMetric(p);
      const isStrongerByMetric = refMetric > 0 && m > refMetric;
      const isHigherTier = ref ? p.price > ref.price : true;
      return { product: p, metric: m, isStrongerByMetric, isHigherTier, notYetShown: !shownIds.has(String(p.id)) };
    })
    .filter(c => !ref || c.isStrongerByMetric || c.isHigherTier);

  candidates.sort((a, b) => {
    if (a.isStrongerByMetric !== b.isStrongerByMetric) return a.isStrongerByMetric ? -1 : 1;
    if (b.metric !== a.metric) return b.metric - a.metric;
    if (a.notYetShown !== b.notYetShown) return a.notYetShown ? -1 : 1;
    return a.product.price - b.product.price;
  });

  if (candidates.length === 0 && ref) {
    return { ref, matches: [], isAlreadyTop: true };
  }
  return { ref, matches: candidates.slice(0, 3).map(c => c.product), isAlreadyTop: false };
}

function classifyProductPrimaryType(p) {
  const titleNorm = normalizeArabic(p?.title || '');
  const types = new Set();
  if (!titleNorm) return types;

  if (/(?:مستقبل|محول|محلو).*(?:بلوتوث|صوتي)|bluetooth\s*receiver|aux\s*adapter/.test(titleNorm)) {
    types.add('bluetooth_receiver');
  }
  if (/(?:دراع|ذراع|عارذ|يد\s*العاب|gamepad|controller)/.test(titleNorm)) {
    types.add('controller');
  }
  if (/(?:مصباح|لمبه|lamp|desk\s*light)/.test(titleNorm)) {
    types.add('lamp');
  }
  if (/(?:قلم\s*الكتروني|قلم\s*الك|قلم\s*ذكي|stylus|smart\s*pen)/.test(titleNorm)) {
    types.add('stylus');
  }
  if (/(?:بروجكتور|بورجكترو|بروجكتر|بروجيكتور|projector)/.test(titleNorm)) {
    types.add('projector');
  }
  if (/(?:سماعه|سماعات|سمعه|سمعات|هيدفون|هيدست|headphone|headphones|headset|earphone|earphones)/.test(titleNorm)) {
    types.add('headphones');
  }
  if (/(?:ايربودز|ايربزدو|earbuds?|\btws\b)/.test(titleNorm)) {
    types.add('headphones');
    types.add('earbuds');
  }
  if (/(?:مكبر\s*صوت|مكبرات\s*صوت|سبيكر|speakers?)/.test(titleNorm)) {
    types.add('speaker');
  }
  if (/(?:كاميرا\s*ويب|webcam)/.test(titleNorm)) {
    types.add('webcam');
  }
  if (/(?:داشكام|كاميرا\s*مراقبه\s*سياره|dash\s*cam|dashcam)/.test(titleNorm)) {
    types.add('dashcam');
  }
  if (/(?:^|\s)(?:ميكروفون|ميكرفون|ميكورفنو|microphones?)(?=\s|$)/.test(titleNorm) && !types.has('headphones') && !types.has('webcam')) {
    types.add('microphone');
  }
  if (/(?:حامل\s*تبريد|مبرد\s*لابتوب|cooling\s*pad|cooling\s*stand)/.test(titleNorm)) {
    types.add('cooling_stand');
  }
  if (/(?:حامل\s*(?:هاتف|موبايل|سيا)|ستاند|phone\s*holder|car\s*holder)/.test(titleNorm)) {
    types.add('phone_holder');
  }
  if (/(?:كابل|كابلات|كيبل|وصله|cables?)/.test(titleNorm)) {
    types.add('cable');
  }
  if (/(?:باوربانك|شاحن\s*متنقل|بنك\s*طاقه|powerbanks?|portable\s*charger)/.test(titleNorm)) {
    types.add('powerbank');
  }
  if (!types.has('cable') && !types.has('powerbank') && /(?:شاحن|شواحن|محطه\s*شحن|chargers?|charging\s*station)/.test(titleNorm)) {
    types.add('charger');
  }
  if (/(?:موزع|هب|\bhub\b)/.test(titleNorm)) {
    types.add('usb_hub');
  }
  if (/(?:كيبورد|لوحه\s*مفاتيح|keyboards?)/.test(titleNorm)) {
    types.add('keyboard');
  }
  if (/(?:ماوس|فاره|فاهر|mouse|mice)/.test(titleNorm)) {
    types.add('mouse');
  }
  if (/(?:راوتر|روتر|موسع\s*نطاق|مقيو\s*اشاره|مقوي|routers?|extender|repeater)/.test(titleNorm)) {
    types.add('router');
  }
  if (/(?:سويتش|network\s*switch)/.test(titleNorm)) {
    types.add('switch');
  }
  if (/(?:قصر\s*صلب|قرص\s*صلب|هارد|\bssd\b|\bhdd\b|hard\s*drive|external\s*drive)/.test(titleNorm)) {
    types.add('storage');
  }
  if (/(?:فلاش|فالش|فلاشه|بطاق(?:ه|ات)\s*(?:اذك\S*|ذاكره)|قارئ\s*بطاقات|قاير\s*بطاقات|ميموري|ميميرو|ميكور\s*sd|flash\s*drive|memory\s*card|card\s*reader|\bmicrosd\b|\bmicro\s*sd\b)/.test(titleNorm)) {
    types.add('flash_memory');
  }
  if (!types.has('phone_holder') && !types.has('controller') && !types.has('charger') && /(?:هاتف\s*ذكي|موبايل|تليفون|جوال|smartphones?)/.test(titleNorm)) {
    types.add('phone');
  }
  if (!types.has('stylus') && /(?:تابلت|ايباد|tablet|ipad)/.test(titleNorm)) {
    types.add('tablet');
  }
  if (!types.has('lamp') && !types.has('stylus') && !types.has('phone') && /(?:شاشه\s*ذكيه|شاشات|تلفزيون|تليفزيون|مونيتور|monitor|smart\s*tv|\btv\b)/.test(titleNorm)) {
    types.add('monitor');
  }
  if (/(?:ساعه\s*ذكيه|سمارت\s*واتش|smartwatch|smart\s*watch)/.test(titleNorm)) {
    types.add('smartwatch');
  }
  return types;
}

function isTypeCompatible(requestedTypes, productTypes) {
  if (!requestedTypes || requestedTypes.length === 0) return true;
  if (!productTypes || productTypes.size === 0) return true;
  for (const req of requestedTypes) {
    if (productTypes.has(req)) return true;
    if (req === 'camera' && (productTypes.has('webcam') || productTypes.has('dashcam') || productTypes.has('camera'))) {
      return true;
    }
  }
  return false;
}

function analyzeProductConnection(p) {
  const titleNorm = normalizeArabic(p?.title || '');
  const descNorm = normalizeArabic(p?.description || '');
  const tagsNorm = normalizeArabic((p?.tags || []).join(' '));
  const full = `${titleNorm} ${tagsNorm} ${descNorm}`.trim();
  if (!full) return 'unknown';

  const hasExplicitWiredWord =
    /(?:^|\s)(?:ال)?سلكي(?:ه)?(?=\s|$)/.test(full) ||
    /(?:^|\s)(?:wired|corded)(?=\s|$)/.test(full);

  const hasPhysicalWireCue =
    /(?:^|\s)(?:سلك\s*مضفر|بسلك|بكابل|توصيل\s*سلكي|كابل\s*توصيل|سلك\s*بطول)(?=\s|$)/.test(full) ||
    /كابل\s*(?:type\s*c|تايبسي|usb)\s*(?:قابل\s*للفصل|مرفق|للتوصيل)/.test(full);

  const hasAuxWiredCue =
    /(?:^|\s)(?:سماعه|سماعات|سمعه|هيدفون|هيدست|ماوس|كيبورد|headphone|headphones|headset)/.test(titleNorm) &&
    /(?:3\.5\s*mm|\baux\b|توصيل\s*usb)/.test(full);

  const hasWiredCue = hasExplicitWiredWord || hasPhysicalWireCue || hasAuxWiredCue;

  const hasExplicitWirelessWord =
    /(?:^|\s)(?:ال)?لاسلكي(?:ه)?(?=\s|$)/.test(full) ||
    /لا\s*سلكي(?:ه)?(?=\s|$)/.test(full) ||
    /(?:^|\s)(?:بلوتوث|بلوتثو|بلتوث|بولوتوث|وايرلس|wireless|bluetooth|cordless|tws)(?=\s|$)/.test(full);

  const hasWirelessFeatureCue =
    /علبه\s*شحن|charging\s*case|مستقبل\s*نانو|nano\s*receiver|حتي\s*10\s*امتار|شحن\s*لاسلكي/.test(full) ||
    (/(?:^|\s)(?:سماعه|سماعات|هيدفون|headphone|headset)/.test(titleNorm) && /بطاريه\s*(?:تدوم|تمود)/.test(full));

  const hasWirelessCue = hasExplicitWirelessWord || hasWirelessFeatureCue;

  if (hasWiredCue && hasWirelessCue) return 'ambiguous_conflict';
  if (hasWirelessCue) return 'wireless';
  if (hasWiredCue) return 'wired';
  return 'unknown';
}

function detectQueryConstraints(normQuery) {
  const nq = normalizeArabic(normQuery);
  const hasNegatedWired = /(?:^|\s)(?:بدون|مش|غير)\s*(?:ال)?سلكي(?:ه)?(?=\s|$)|بدون\s*سلك(?=\s|$)/.test(nq);
  const hasNegatedWireless = /(?:^|\s)(?:بدون|مش|غير)\s*(?:ال)?لاسلكي(?:ه)?(?=\s|$)/.test(nq);

  const wantsWireless =
    hasNegatedWired ||
    /(?:^|\s)(?:ال)?لاسلكي(?:ه)?(?=\s|$)/.test(nq) ||
    /لا\s*سلكي(?:ه)?(?=\s|$)/.test(nq) ||
    /(?:^|\s)(?:بلوتوث|بلتوث|بولوتوث|بلوثوث|بلوتثو|وايرلس|wireless|bluetooth|cordless|tws)(?=\s|$)/.test(nq) ||
    nq.split(' ').some(t =>
      t.length >= 5 &&
      !t.startsWith('سلك') &&
      !t.startsWith('السلك') &&
      !t.startsWith('wired') &&
      (
        ((t.startsWith('لاسلك') || t.startsWith('اللاسلك')) && ['لاسلكيه', 'اللاسلكيه'].some(kw => fuzzyTokenMatch(t, kw) >= 0.85)) ||
        ['wireless', 'bluetooth', 'بلوتوث', 'بلتوث'].some(kw => fuzzyTokenMatch(t, kw) >= 0.80)
      )
    );

  const wantsWired =
    hasNegatedWireless ||
    (/(?:^|\s)(?:ال)?سلكي(?:ه)?(?=\s|$)/.test(nq) && !hasNegatedWired) ||
    /(?:^|\s)(?:بسلك|بكابل|بكيبل|wired|corded|\baux\b|3\.5\s*mm)(?=\s|$)/.test(nq) ||
    /(?:سماعه|سماعات|ماوس|كيبورد|ميكروفون|دراع)\s+سلك(?=\s|$)/.test(nq) ||
    nq.split(' ').some(t =>
      !hasNegatedWired &&
      t.length >= 5 &&
      !t.startsWith('لاسلك') &&
      !t.startsWith('اللاسلك') &&
      !t.startsWith('wireless') &&
      ['wired', 'corded'].some(kw => fuzzyTokenMatch(t, kw) >= 0.82)
    );

  let requestedConnection = null;
  if (wantsWireless && wantsWired) requestedConnection = 'either';
  else if (wantsWireless) requestedConnection = 'wireless';
  else if (wantsWired) requestedConnection = 'wired';

  const typeSet = new Set();
  if (/(?:مستقبل|محول).*(?:بلوتوث|صوتي)|bluetooth\s*receiver|aux\s*adapter/.test(nq)) typeSet.add('bluetooth_receiver');
  if (/(?:^|\s)(?:سبيكر|مكبر\s*صوت|مكبرات\s*صوت|speakers?)(?=\s|$)/.test(nq)) typeSet.add('speaker');
  if (/(?:^|\s)(?:ايربودز|ايربزدو|earbuds?)(?=\s|$)/.test(nq)) typeSet.add('earbuds');
  if (/(?:^|\s)(?:سماعه|سماعات|سماعه|سمعه|سمعات|هيدفون|هيد\s*فون|هيدست|headphones?|headsets?|earphones?)(?=\s|$)/.test(nq)) typeSet.add('headphones');
  if (!typeSet.has('headphones') && /(?:^|\s)(?:مايك|ميكروفون|ميكرفون|ميكورفنو|microphones?|mics?|podcast\s*mic)(?=\s|$)/.test(nq)) typeSet.add('microphone');
  if (/(?:^|\s)(?:ماوس|فاره|فاهر|mouse|mice)(?=\s|$)/.test(nq)) typeSet.add('mouse');
  if (/(?:^|\s)(?:كيبورد|لوحه\s*مفاتيح|keyboards?)(?=\s|$)/.test(nq)) typeSet.add('keyboard');
  if (/(?:^|\s)(?:بروجكتور|بورجكترو|بروجكتر|بروجيكتور|projectors?)(?=\s|$)/.test(nq)) typeSet.add('projector');
  if (/(?:^|\s)(?:دراع|ذراع\s*تحكم|عارذ\s*تحكم|يد\s*العاب|controller|gamepad)(?=\s|$)/.test(nq)) typeSet.add('controller');
  if (/(?:^|\s)(?:باوربانك|شاحن\s*متنقل|بنك\s*طاقه|powerbanks?|portable\s*charger|magsafe)(?=\s|$)/.test(nq)) typeSet.add('powerbank');
  if (!typeSet.has('powerbank') && /(?:^|\s)(?:شاحن|شواحن|جداري|جيراد|محطه\s*شحن|chargers?|wall\s*charger|charging\s*station)(?=\s|$)/.test(nq) && !/(?:كابل|كيبل|حامل)/.test(nq)) typeSet.add('charger');
  if (/(?:^|\s)(?:كابل|كابلات|كيبل|وصله|cables?|hdmi)(?=\s|$)/.test(nq)) typeSet.add('cable');
  if (/(?:^|\s)(?:راوتر|روتر|موسع.*وايفاي|مقوي|مقيو|routers?|extender|repeater)(?=\s|$)/.test(nq)) typeSet.add('router');
  if (/(?:^|\s)(?:سويتش|ethernet|network\s*switch)(?=\s|$)/.test(nq)) typeSet.add('switch');
  if (/(?:^|\s)(?:هارد|قرص\s*صلب|قصر\s*صلب|\bssd\b|\bhdd\b|hard\s*drive)(?=\s|$)/.test(nq)) typeSet.add('storage');
  if (/(?:^|\s)(?:فلاشه|فلاش|فالش|ميموري|ميميرو|كارت\s*ميموري|بطاقه\s*ذاكره|قارئ\s*بطاقات|flash\s*drive|memory\s*card|\bmicrosd\b|\bsd\b)(?=\s|$)/.test(nq)) typeSet.add('flash_memory');
  if (/حامل\s*(?:هاتف|موبايل|سيا)|ستاند|phone\s*holder|car\s*holder/.test(nq)) typeSet.add('phone_holder');
  if (!typeSet.has('phone_holder') && /(?:^|\s)(?:موبايل|تليفون|هاتف|جوال|موبايلات|smartphones?|phones?|mobiles?)(?=\s|$)/.test(nq)) typeSet.add('phone');
  if (/(?:^|\s)(?:ساعه\s*ذكيه|سمارت\s*واتش|ساعه|ساعات|smartwatch|smart\s*watch)(?=\s|$)/.test(nq)) typeSet.add('smartwatch');
  if (/كاميرا\s*ويب|webcam/.test(nq)) typeSet.add('webcam');
  if (/داشكام|كاميرا\s*مراقبه\s*سياره|dashcam/.test(nq)) typeSet.add('dashcam');
  if (!typeSet.has('webcam') && !typeSet.has('dashcam') && /(?:^|\s)(?:كاميرا|كاميرات|cameras?)(?=\s|$)/.test(nq)) typeSet.add('camera');
  if (/(?:قلم\s*الكتروني|قلم\s*ذكي|stylus)/.test(nq)) typeSet.add('stylus');
  if (!typeSet.has('stylus') && /(?:^|\s)(?:تابلت|ايباد|tablet|ipad)(?=\s|$)/.test(nq)) typeSet.add('tablet');
  if (!typeSet.has('phone') && !typeSet.has('stylus') && /(?:^|\s)(?:شاشه|شاشات|تلفزيون|تليفزيون|مونيتور|monitor|monitors|smart\s*tv|\btv\b)(?=\s|$)/.test(nq)) typeSet.add('monitor');

  if (typeSet.size === 0 && nq) {
    const fuzzyTypeMap = [
      ['سماعه', 'headphones'], ['headphones', 'headphones'], ['headphone', 'headphones'], ['هيدفون', 'headphones'],
      ['ايربودز', 'earbuds'], ['earbuds', 'earbuds'],
      ['سبيكر', 'speaker'], ['speaker', 'speaker'],
      ['بروجكتر', 'projector'], ['projector', 'projector'],
      ['كيبورد', 'keyboard'], ['keyboard', 'keyboard'],
      ['ماوس', 'mouse'], ['فاره', 'mouse'],
      ['فلاشه', 'flash_memory'], ['باوربانك', 'powerbank'],
      ['شاحن', 'charger'], ['راوتر', 'router'], ['ميكروفون', 'microphone']
    ];
    for (const tok of nq.split(' ')) {
      if (tok.length < 4 || STOP_WORDS.has(tok)) continue;
      for (const [kw, tp] of fuzzyTypeMap) {
        if (fuzzyTokenMatch(tok, kw) >= 0.78) typeSet.add(tp);
      }
    }
  }

  return {
    requestedConnection,
    requestedTypes: Array.from(typeSet)
  };
}

function evaluateProductMatch(p, ctx, rawTokens, expandedTerms, opts) {
  const { normQuery, brandMention, catMention, preferCategoryId, maxPrice, minPrice, sortMode, allowCategoryOnly, constraints } = opts;
  if (maxPrice !== null && p.price > maxPrice) return { status: 'rejected', score: -1, reason: 'price' };
  if (minPrice !== null && p.price < minPrice) return { status: 'rejected', score: -1, reason: 'price' };

  const pTypes = classifyProductPrimaryType(p);
  const pConn = analyzeProductConnection(p);
  const reqTypes = constraints?.requestedTypes || [];
  const reqConn = constraints?.requestedConnection || null;

  if (reqTypes.length > 0 && !isTypeCompatible(reqTypes, pTypes)) {
    return { status: 'rejected', score: -1, reason: 'type_mismatch' };
  }
  // The customer asked for a specific kind of product (e.g. smartwatch): a product whose
  // kind we cannot recognise at all (clothes, home items...) must never be offered instead.
  if (reqTypes.length > 0 && pTypes.size === 0) {
    return { status: 'rejected', score: -1, reason: 'type_unknown' };
  }

  if (reqConn === 'wireless' || reqConn === 'wired') {
    const oppositeConn = reqConn === 'wireless' ? 'wired' : 'wireless';
    if (pConn === oppositeConn) {
      return { status: 'rejected', score: -1, reason: 'connection_contradiction' };
    }
  }

  const titleNorm = normalizeArabic(p.title);
  const descNorm = normalizeArabic(p.description);
  const catNorm = normalizeArabic(p.categoryName);
  const subNorm = normalizeArabic(p.subcategoryName || ctx.subMap[p.subcategoryId] || '');
  const tagsNorm = normalizeArabic((p.tags || []).join(' '));
  const brandNorm = normalizeArabic(p.brand);
  const fullText = `${titleNorm} ${brandNorm} ${catNorm} ${subNorm} ${tagsNorm} ${descNorm}`.trim();
  const titleWords = titleNorm.split(' ').filter(w => w.length >= 2);

  let score = 0;
  let matchedRawCount = 0;

  if (normQuery.length >= 3 && !STOP_WORDS.has(normQuery) && rawTokens.length > 0 && titleNorm.includes(normQuery)) {
    score += 48;
  }

  const connectionTokens = new Set(['سلكي', 'سلكيه', 'السلكي', 'السلكيه', 'لاسلكي', 'لاسلكيه', 'اللاسلكي', 'اللاسلكيه', 'بلوتوث', 'بلتوث', 'وايرلس', 'wired', 'wireless', 'bluetooth', 'cordless']);
  const isConnectionToken = (t) =>
    connectionTokens.has(t) ||
    (t.length >= 5 && ['wireless', 'bluetooth', 'wired', 'لاسلكيه', 'بلوتوث', 'سلكيه'].some(kw => fuzzyTokenMatch(t, kw) >= 0.78));

  for (const tok of rawTokens) {
    if (reqConn && isConnectionToken(tok)) continue;
    const stem = stemToken(tok);
    let tokMatched = false;

    if (titleNorm.includes(tok) || (stem.length >= 3 && titleNorm.includes(stem))) {
      score += 24;
      tokMatched = true;
    } else if (fullText.includes(tok) || (stem.length >= 3 && fullText.includes(stem))) {
      score += 13;
      tokMatched = true;
    } else {
      let bestTitleFuzzy = 0;
      for (const tw of titleWords) {
        const f = fuzzyTokenMatch(tok, tw);
        if (f > bestTitleFuzzy) bestTitleFuzzy = f;
      }
      if (bestTitleFuzzy > 0) {
        score += Math.round(bestTitleFuzzy * 22);
        tokMatched = true;
      }
    }

    if (tokMatched) matchedRawCount++;
  }

  if (matchedRawCount > 1) {
    score += matchedRawCount * 14;
  }

  if (brandMention) {
    const brandMatched = brandMention.aliases.some(al =>
      brandNorm.includes(al) || titleNorm.includes(al) || descNorm.includes(al)
    );
    if (brandMatched) score += 32;
  }

  if (catMention) {
    if (catMention.subcategoryId && p.subcategoryId === catMention.subcategoryId) score += 18;
    else if (catMention.categoryId && p.categoryId === catMention.categoryId) score += 12;
  }

  for (const term of expandedTerms) {
    if (term.length < 2) continue;
    if (reqConn && connectionTokens.has(term)) continue;
    if (titleNorm.startsWith(term)) score += 28;
    else if (titleNorm.includes(term)) score += 9;
    else if (catNorm.includes(term) || subNorm.includes(term) || tagsNorm.includes(term)) score += 5;
    else if (descNorm.includes(term)) score += 3;
  }

  if (reqConn === 'wireless' || reqConn === 'wired') {
    if (pConn === reqConn) {
      if (reqTypes.length === 0 || score > 0) score += 22;
    } else if (pConn === 'ambiguous_conflict' || pConn === 'unknown') {
      const hasTopicRelevance = score > 0 || (reqTypes.length > 0 && isTypeCompatible(reqTypes, pTypes));
      if (!hasTopicRelevance) return { status: 'rejected', score: -1, reason: 'no_match' };
      return { status: 'unclear', score: score + (p.stock > 0 ? 6 : -10), reason: pConn };
    }
  } else if (reqConn === 'either') {
    if (pConn === 'ambiguous_conflict' || pConn === 'unknown') {
      const hasTopicRelevance = score > 0 || (reqTypes.length > 0 && isTypeCompatible(reqTypes, pTypes));
      if (!hasTopicRelevance) return { status: 'rejected', score: -1, reason: 'no_match' };
      return { status: 'unclear', score: score + (p.stock > 0 ? 6 : -10), reason: pConn };
    }
    if (score > 0) score += 10;
  } else if (pConn === 'ambiguous_conflict' && (pTypes.has('headphones') || pTypes.has('earbuds'))) {
    if (score > 0 || (reqTypes.length > 0 && isTypeCompatible(reqTypes, pTypes))) {
      return { status: 'unclear', score: score + (p.stock > 0 ? 6 : -10), reason: 'ambiguous_conflict' };
    }
  }

  const hasBudgetIntent = maxPrice !== null || minPrice !== null || sortMode !== null;
  const allowCatMatch = allowCategoryOnly && preferCategoryId && p.categoryId === preferCategoryId;
  if (score <= 0 && !(hasBudgetIntent && rawTokens.length === 0) && !allowCatMatch) {
    return { status: 'rejected', score: -1, reason: 'no_match' };
  }

  if (preferCategoryId && p.categoryId === preferCategoryId) {
    score += 10;
  }
  if (p.stock > 0) score += 8;
  else score -= 12;
  if (p.discountPercent > 0) score += 2;
  if (p.isFeatured) score += 1;

  return { status: 'confirmed', score, reason: 'confirmed' };
}

function scoreProductAgainstTokens(p, ctx, rawTokens, expandedTerms, opts) {
  const res = evaluateProductMatch(p, ctx, rawTokens, expandedTerms, opts);
  return res.status === 'confirmed' ? res.score : -1;
}

function sortScoredProducts(scored, sortMode) {
  return [...scored].sort((a, b) => {
    if ((b.product.stock > 0) !== (a.product.stock > 0) && sortMode !== 'discount') {
      return b.product.stock > 0 ? 1 : -1;
    }
    if (sortMode === 'cheapest') {
      return a.product.price - b.product.price || b.score - a.score;
    }
    if (sortMode === 'expensive') {
      return b.product.price - a.product.price || b.score - a.score;
    }
    if (sortMode === 'discount') {
      return b.product.discountPercent - a.product.discountPercent || b.score - a.score;
    }
    if (b.score !== a.score) return b.score - a.score;
    return b.product.discountPercent - a.product.discountPercent;
  });
}

function findMatchingProducts(queryText, ctx, options = {}) {
  const { excludeIds = new Set(), preferCategoryId = null, overrideMaxPrice = null, overrideSortMode = null, allowCategoryOnly = false, limit = 4 } = options;
  const normQuery = normalizeArabic(queryText);
  const priceFilter = extractPriceFilter(normQuery);
  const maxPrice = priceFilter.maxPrice !== null ? priceFilter.maxPrice : overrideMaxPrice;
  const sortMode = priceFilter.sortMode || overrideSortMode;
  const constraints = detectQueryConstraints(normQuery);

  const rawTokens = normQuery
    .split(' ')
    .filter(w => w.length >= 2 && !/^\d+$/.test(w) && !STOP_WORDS.has(w) && !STOP_WORDS.has(stemToken(w)));

  const brandMention = detectBrandMention(rawTokens, ctx);
  const catMention = detectCategoryOrSubcategoryMention(rawTokens, ctx);

  const concreteTokens = rawTokens.filter(t => !AMBIGUOUS_GENERIC_TERMS.has(t) && !AMBIGUOUS_GENERIC_TERMS.has(stemToken(t)));
  const hasBudgetIntent = maxPrice !== null || priceFilter.minPrice !== null || sortMode !== null;

  if (rawTokens.length > 0 && concreteTokens.length === 0 && !brandMention && !catMention && !hasBudgetIntent) {
    return {
      matches: [],
      unclearMatches: [],
      contradictedCount: 0,
      constraints,
      concreteTokens: [],
      topScore: 0,
      priceFilter: { ...priceFilter, maxPrice, sortMode },
      hasKeywords: true,
      isAmbiguous: true,
      brandMention: null,
      catMention: null,
      brandProductCount: 0
    };
  }

  const effectiveTokens = brandMention ? brandMention.remainingTokens : concreteTokens;
  const expandedTerms = expandSearchTerms(effectiveTokens, normQuery);
  const brandProductCount = brandMention
    ? ctx.products.filter(p => brandMention.aliases.some(al =>
        normalizeArabic(`${p.brand} ${p.title} ${p.description}`).includes(al)
      )).length
    : 0;

  const searchTokens = (brandMention && brandProductCount > 0) ? rawTokens : effectiveTokens;
  const scored = [];
  const unclearScored = [];
  let contradictedCount = 0;

  for (const p of ctx.products) {
    if (excludeIds.has(String(p.id))) continue;
    const evaluation = evaluateProductMatch(p, ctx, searchTokens, expandedTerms, {
      normQuery,
      brandMention: brandProductCount > 0 ? brandMention : null,
      catMention,
      preferCategoryId,
      maxPrice,
      minPrice: priceFilter.minPrice,
      sortMode,
      allowCategoryOnly,
      constraints
    });
    if (evaluation.status === 'confirmed' && evaluation.score >= 0) {
      scored.push({ product: p, score: evaluation.score });
    } else if (evaluation.status === 'unclear') {
      unclearScored.push({ product: p, score: evaluation.score });
    } else if (evaluation.reason === 'connection_contradiction') {
      contradictedCount++;
    }
  }

  const maxRawScore = scored.reduce((m, s) => Math.max(m, s.score), 0);
  const filteredScored = (maxRawScore >= 38 && searchTokens.length > 0)
    ? scored.filter(s => s.score >= Math.max(24, Math.floor(maxRawScore * 0.45)))
    : scored;

  const sorted = sortScoredProducts(filteredScored, sortMode);
  const sortedUnclear = sortScoredProducts(unclearScored, sortMode);

  return {
    matches: sorted.slice(0, limit).map(s => s.product),
    unclearMatches: sortedUnclear.slice(0, limit).map(s => s.product),
    contradictedCount,
    constraints,
    concreteTokens,
    topScore: sorted.length > 0 ? sorted[0].score : 0,
    priceFilter: { ...priceFilter, maxPrice, sortMode },
    hasKeywords: concreteTokens.length > 0 || Boolean(brandMention) || Boolean(catMention),
    isAmbiguous: false,
    brandMention,
    catMention,
    brandProductCount
  };
}

function getBestOffers(ctx, limit = 4, maxPrice = null) {
  return [...ctx.products]
    .filter(p => p.stock > 0 && (p.compareAtPrice || p.isFeatured) && (maxPrice === null || p.price <= maxPrice))
    .sort((a, b) => b.discountPercent - a.discountPercent || b.savingsAmount - a.savingsAmount)
    .slice(0, limit);
}

function detectSensitiveCredentialAttempt(normText) {
  const credPatterns = [
    /(كلمه المرور|كلمه السر|الباسورد|الرقم السري|كود التحقق|كود التفعيل|رمز التحقق|otp|pin|cvv)/,
    /(رقم الفيزا|رقم البطاقه|بيانات البطاقه|بيانات الفيزا|كارت البنك|البطاقه البنكيه|credit card|card number|password|secret code)/
  ];
  return credPatterns.some(rx => rx.test(normText));
}

function detectAdminOrForbiddenIntent(normText) {
  const directDashboardTerms = [
    'لوحه التحكم', 'الداشبورد', 'داشبورد', 'dashboard', 'admin panel', 'ادمن', 'الادمن',
    'صلاحيات', 'قاعده البيانات', 'داتابيز', 'database', 'التقارير الماليه', 'المحاسبه الماليه',
    'حسابات التجار', 'حسابات المستثمرين', 'راس المال', 'سعر التكلفه', 'سعر الجمله',
    'ارباح المتجر', 'بيانات الموظفين', 'اداره الموقع', 'backend', 'api', 'cost price', 'merchant profit', 'investor capital'
  ];
  if (directDashboardTerms.some(t => normText.includes(normalizeArabic(t)))) {
    return true;
  }

  const mutationPatterns = [
    /(غير|عدل|حدث|ارفع|نقص|ازود|اضف|ضيف|احذف|امسح)\s+(السعر|اسعار|سعر المنتج|المنتجات|المخزون|الكوبون|كوبون|حاله الطلب|الاعدادات|الصلاحيات|بيانات)/,
    /(اعمل|انشئ|اصدر|ولد)\s+(كوبون|حساب موظف|تاجر|مستثمر)/,
    /(ادخل|افتح|وريني)\s+(النظام|الاداره|صفحه الادمن|حساب عميل تاني)/,
    /(change|update|modify|delete|edit)\s+(product price|stock|coupon|order status|settings|database)/
  ];
  return mutationPatterns.some(rx => rx.test(normText));
}

function detectUnperformedActionRequest(normText) {
  const actionRequests = [
    /(ادفعلي|اسحب من الفيزا|اكدلي الدفع|سجل الطلب دلوقتي|اطلبلي|حطلي في السله|خصملي دلوقتي علي السعر)/,
    /(charge my card|place the order for me|complete my payment|give me a special discount code)/
  ];
  return actionRequests.some(rx => rx.test(normText));
}

function extractGreetingPrefix(rawText) {
  const norm = normalizeArabic(rawText);
  const greetingDefs = [
    { rx: /^(وعليكم )?السلام عليكم( ورحمه الله( وبركاته)?)?/, key: 'salam' },
    { rx: /^صباح (الخير|الفل|النور|الورد)/, key: 'morning' },
    { rx: /^مساء (الخير|الفل|النور|الورد)/, key: 'evening' },
    { rx: /^(good evening|good afternoon)/, key: 'en_evening' },
    { rx: /^(good morning)/, key: 'en_morning' },
    { rx: /^(اهلا وسهلا|اهلا بيك|اهلا بحضرتك|اهلا|مرحبا|مرحبا بك|يا هلا|هلا|هاي|هالو)(?=\s|$)/, key: 'hello' },
    { rx: /^(hello|hi|hey)(?=\s|$)/, key: 'en_hello' },
    { rx: /^(ازيك|ازي حضرتك|عامل ايه|اخبارك ايه|اخبارك|كيف حالك|طمني عليك|how are you)(?=\s|$)/, key: 'wellbeing' }
  ];

  for (const def of greetingDefs) {
    const m = norm.match(def.rx);
    if (m) {
      const rest = norm
        .slice(m[0].length)
        .trim()
        .replace(/^((?:يا بسام|بسام|bassam|يا فندم|حضرتك|لو سمحت|من فضلك|ممكن|قولي|و|please)(?=\s|$)\s*)+/g, '')
        .trim();
      return {
        matchedGreeting: true,
        greetingKey: def.key,
        isGreetingOnly: rest.length < 3,
        restText: rest
      };
    }
  }
  return { matchedGreeting: false, greetingKey: null, isGreetingOnly: false, restText: norm };
}

function formatGreetingPrefix(greetingKey, lang) {
  if (lang === 'en') {
    if (greetingKey === 'en_morning' || greetingKey === 'morning') return 'Good morning!';
    if (greetingKey === 'en_evening' || greetingKey === 'evening') return 'Good evening!';
    return 'Hello!';
  }
  if (greetingKey === 'salam') return 'وعليكم السلام ورحمة الله وبركاته يا فندم،';
  if (greetingKey === 'morning') return 'صباح النور يا فندم،';
  if (greetingKey === 'evening') return 'مساء النور يا فندم،';
  if (greetingKey === 'wellbeing') {
    return lang === 'msa' ? 'الحمد لله، أنا بخير ويسعدني خدمتك!' : 'الحمد لله يا فندم، بخير وتسلم على سؤالك!';
  }
  return lang === 'msa' ? 'أهلاً بك يا فندم،' : 'أهلاً بحضرتك يا فندم،';
}

function getConversationContext(conversation, ctx) {
  const msgs = Array.isArray(conversation?.messages) ? conversation.messages : [];
  const botMsgs = msgs.filter(m => m.sender === 'bot');
  const custMsgs = msgs.filter(m => m.sender === 'customer');
  const lastBotMsg = botMsgs.length > 0 ? botMsgs[botMsgs.length - 1] : null;
  const prodMap = new Map(ctx.products.map(p => [String(p.id), p]));

  const recentShownProducts = [];
  const seenIds = new Set();
  for (let i = botMsgs.length - 1; i >= 0 && recentShownProducts.length < 6; i--) {
    const list = botMsgs[i].products;
    if (Array.isArray(list)) {
      for (const item of list) {
        const sid = String(item.id || '');
        if (sid && !seenIds.has(sid) && prodMap.has(sid)) {
          seenIds.add(sid);
          recentShownProducts.push(prodMap.get(sid));
        }
      }
    }
  }

  // Remember customer's budget, interested category, and query topic across turns
  let rememberedBudget = null;
  let rememberedTopic = '';
  for (let i = custMsgs.length - 1; i >= 0; i--) {
    const cmNorm = normalizeArabic(custMsgs[i].text);
    const pf = extractPriceFilter(cmNorm);
    if (rememberedBudget === null && pf.maxPrice !== null) {
      rememberedBudget = pf.maxPrice;
    }
    if (!rememberedTopic) {
      const tokens = cmNorm.split(' ').filter(w =>
        w.length >= 2 &&
        !/^\d+$/.test(w) &&
        !STOP_WORDS.has(w) &&
        !STOP_WORDS.has(stemToken(w))
      );
      if (tokens.length > 0 && !/(غالي|مرتفع|متردد|الارخص|اقوي|لون|الوان|expensive|hesitat|cheapest|stronger|color)/.test(cmNorm)) {
        rememberedTopic = custMsgs[i].text;
      }
    }
  }

  let rememberedCategoryId = recentShownProducts[0]?.categoryId || null;

  let unmatchedStreak = 0;
  for (let i = botMsgs.length - 1; i >= 0; i--) {
    if (botMsgs[i].intent === 'unmatched') unmatchedStreak++;
    else break;
  }

  return {
    msgs,
    botMsgs,
    custMsgs,
    lastBotMsg,
    recentShownProducts,
    seenIds,
    rememberedBudget,
    rememberedTopic,
    rememberedCategoryId,
    botWasOfferingEscalation: Boolean(lastBotMsg && lastBotMsg.escalationSuggested),
    botWasAskingDiscovery: Boolean(lastBotMsg && (lastBotMsg.intent === 'needs_discovery' || lastBotMsg.intent === 'hesitation')),
    unmatchedStreak
  };
}

function buildSuggestions(ctx, lang = 'eg', extra = []) {
  const base = [];
  extra.forEach(s => { if (s && !base.includes(s)) base.push(s); });

  if (lang === 'en') {
    ['Latest offers & discounts', 'Shipping cost', 'Track my order', 'Talk to an agent'].forEach(s => {
      if (!base.includes(s) && base.length < 4) base.push(s);
    });
    return base.slice(0, 4);
  }
  if (lang === 'msa') {
    if (ctx.loyaltySummary && !base.includes('رصيد نقاطي وكوبوناتي')) base.push('رصيد نقاطي وكوبوناتي');
    ['أحدث العروض والخصومات', 'تكلفة الشحن', 'تتبع طلبي', 'التحدث مع موظف'].forEach(s => {
      if (!base.includes(s) && base.length < 4) base.push(s);
    });
    return base.slice(0, 4);
  }

  if (ctx.loyaltySummary && !base.includes('رصيد نقاطي وكوبوناتي')) {
    base.push('رصيد نقاطي وكوبوناتي');
  }
  ['أحدث العروض والخصومات', 'مصاريف الشحن', 'تتبع طلبي', 'التحدث مع موظف'].forEach(s => {
    if (!base.includes(s) && base.length < 4) base.push(s);
  });
  return base.slice(0, 4);
}

async function tryGeminiReply(userMessage, conversation, ctx, suggestedMatches, lang) {
  const apiKey = (process.env.GEMINI_API_KEY || '').trim();
  if (!apiKey || typeof fetch !== 'function') return null;

  try {
    const modelName = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
    const recentMsgs = (conversation?.messages || [])
      .slice(-8)
      .map(m => `${m.sender === 'customer' ? 'Customer' : (m.sender === 'bot' ? 'Bassam' : 'System')}: ${m.text}`)
      .join('\n');

    const catalogSnippet = (suggestedMatches.length > 0 ? suggestedMatches : getBestOffers(ctx, 6))
      .map(p => {
        const beforeStr = p.compareAtPrice ? `, beforeDiscount=${p.compareAtPrice} EGP, discount=${p.discountPercent}%` : '';
        const varsStr = (p.variations && p.variations.length > 0) ? p.variations.map(v => `${v.name}:[${(v.values || []).join(',')}]`).join('; ') : 'none listed';
        return `id=${p.id} | title=${p.title} | category=${p.categoryName || 'N/A'} | brand=${p.brand || 'not listed'} | price=${p.price} EGP${beforeStr} | stock=${p.stock} (${p.stock > 0 ? 'available' : 'OUT OF STOCK'}) | imagesCount=${(p.images || []).length} | variants=${varsStr} | freeShipping=${p.isFreeShipping ? 'yes' : 'no'} | desc=${p.description || 'none'}`;
      })
      .join('\n');

    const categoriesText = ctx.categories.map(c => c.name).join('، ');
    const couponsList = [...ctx.personalCoupons, ...ctx.publicCoupons]
      .slice(0, 6)
      .map(c => `${c.code} (${c.discountType === 'percentage' ? c.discountValue + '%' : c.discountValue + ' EGP'}${c.targetUserId ? ' - personal VIP' : ' - general'})`)
      .join(' | ');

    const userContextText = ctx.loyaltySummary
      ? `Logged-in customer: name=${ctx.loyaltySummary.userName}, points=${ctx.loyaltySummary.points} (=${ctx.loyaltySummary.pointsValueEgp} EGP), minThreshold=${ctx.loyaltySummary.minThreshold}, coupons=${couponsList || 'none'}`
      : `Guest customer (not signed in). Public coupons=${couponsList || 'none currently'}`;

    const langInstruction =
      lang === 'en'
        ? 'Reply naturally in warm, polite English.'
        : (lang === 'msa'
            ? 'أجب بلغة عربية فصحى سلسة وودودة ومختصرة دون جمود.'
            : 'أجب بالعامية المصرية البسيطة والمهذبة ("يا فندم"، "حضرتك") بطريقة طبيعية وودودة بدون مقدمات طويلة.');

    const fullPrompt = `
${BASSAM_SYSTEM_PROMPT}

Live Store Context:
- Categories: ${categoriesText}
- ${userContextText}
- Matched / Top In-Stock Products:
${catalogSnippet || 'No direct matches'}

Recent Conversation Context:
${recentMsgs || '(Start of conversation)'}

Current Customer Message: "${userMessage}"

Instruction: ${langInstruction}
- Strict Grounding Rules:
  • State ONLY exact product names, prices, compare-at prices, discounts, stock counts, brands, categories, variants, and descriptions from Live Store Context above. NEVER invent, guess, or extrapolate any spec, price, color, size, brand, or image URL.
  • If stock is 0 (OUT OF STOCK), explicitly state that the item is currently out of stock (0 available) and NOT available to order right now.
  • If any requested field (such as brand, colors, sizes, or images) is "not listed" / "none" / 0, explicitly say it is not recorded in product data.
- End with [SHOW_PRODUCTS] only if returning matching product cards helps the customer.
- End with [ESCALATE_NOW] if customer requested a human agent.
- End with [OFFER_ESCALATION] if the issue is complex or needs human follow-up.
`.trim();

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: fullPrompt }] }],
        generationConfig: { temperature: 0.65, maxOutputTokens: 420 }
      })
    });
    clearTimeout(timeoutId);

    if (!res.ok) return null;
    const data = await res.json();
    let rawReply = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    if (!rawReply.trim()) return null;

    const escalateNow = rawReply.includes('[ESCALATE_NOW]');
    const offerEsc = rawReply.includes('[OFFER_ESCALATION]');
    const showProds = rawReply.includes('[SHOW_PRODUCTS]');
    rawReply = rawReply
      .replace(/\[(ESCALATE_NOW|OFFER_ESCALATION|SHOW_PRODUCTS)\]/g, '')
      .trim();

    return {
      text: rawReply,
      products: showProds && suggestedMatches.length > 0 ? suggestedMatches.slice(0, 4).map(toProductCard) : [],
      autoEscalateRequested: escalateNow,
      escalationSuggested: offerEsc || escalateNow,
      canEscalate: true,
      lang,
      intent: escalateNow ? 'escalation' : 'gemini_ai',
      suggestions: buildSuggestions(ctx, lang)
    };
  } catch {
    return null;
  }
}

function resolveQueryTargets(preSearch, convState, queryNorm) {
  if (preSearch.matches.length > 0) {
    return preSearch.matches.slice(0, 2);
  }
  const mentionedNewSubject =
    (preSearch.concreteTokens && preSearch.concreteTokens.length > 0) ||
    Boolean(preSearch.brandMention) ||
    Boolean(preSearch.catMention);

  if (mentionedNewSubject || convState.recentShownProducts.length === 0) {
    return [];
  }

  if (/(الاول|first one)/.test(queryNorm)) {
    return [convState.recentShownProducts[0]];
  }
  if (/(التاني|الثاني|second one)/.test(queryNorm) && convState.recentShownProducts[1]) {
    return [convState.recentShownProducts[1]];
  }
  if (/(التالت|الثالث|third one)/.test(queryNorm) && convState.recentShownProducts[2]) {
    return [convState.recentShownProducts[2]];
  }
  return convState.recentShownProducts.slice(0, 2);
}

function resolveComparisonTargets(rawText, queryNorm, preSearch, convState, ctx) {
  const isContextualTwo =
    /(بينهم|بينهما|الاثنين|الاتنين|الاول والتاني|الاول والثاني|compare them|both|these two|first and second)/.test(queryNorm);
  if (isContextualTwo && convState.recentShownProducts.length >= 2) {
    return convState.recentShownProducts.slice(0, 2);
  }

  let body = queryNorm
    .replace(/^(?:ممكن\s*)?(?:تقارن|قارن|مقارنه|اعمل مقارنه|ايه الفرق|ما الفرق|الفرق|compare|comparison|what is the difference|difference)(?:\s*(?:لي|لنا|بين|ما بين|between))?\s*/i, '')
    .trim();

  const splitMatch = body.match(/^(.*?)(?:\s+vs\.?\s+|\s+versus\s+|\s+ولا\s+|\s+ضد\s+|\s+ام\s+|\s+او\s+|\s+و\s+|\s+و(?=[ا-يa-z0-9]{2,}))(.*)$/i);
  if (splitMatch && splitMatch[1] && splitMatch[2]) {
    const leftText = splitMatch[1].trim();
    const rawRight = splitMatch[2].trim();
    const res1 = findMatchingProducts(leftText, ctx, { limit: 4 });
    const m1 = res1.matches[0] || null;

    const ex = m1 ? new Set([String(m1.id)]) : new Set();
    let res2 = findMatchingProducts(rawRight, ctx, { excludeIds: ex, limit: 4 });
    if (res2.matches.length === 0) {
      const res2WithWaw = findMatchingProducts('و' + rawRight, ctx, { excludeIds: ex, limit: 4 });
      if (res2WithWaw.matches.length > 0) res2 = res2WithWaw;
    }
    // If right side only mentions a modifier like "اللاسلكية" or "500gb", borrow context from left side type
    if (res2.matches.length === 0 && m1 && rawRight.split(' ').length <= 2) {
      const m1FirstWords = normalizeArabic(m1.title).split(' ').slice(0, 2).join(' ');
      res2 = findMatchingProducts(`${m1FirstWords} ${rawRight}`, ctx, { excludeIds: ex, limit: 4 });
    }

    const m2 = res2.matches[0] || null;
    if (m1 && m2 && String(m1.id) !== String(m2.id)) {
      return [m1, m2];
    }
    if (m1 && !m2) {
      // Check if customer explicitly mentioned a real second product that doesn't exist
      const rightSearchNoEx = findMatchingProducts(rawRight, ctx, { limit: 2 });
      if (rightSearchNoEx.hasKeywords && rightSearchNoEx.matches.length === 0) {
        return [m1];
      }
    }
  }

  if (preSearch.matches.length >= 2) {
    return preSearch.matches.slice(0, 2);
  }
  if (!preSearch.hasKeywords && convState.recentShownProducts.length >= 2) {
    return convState.recentShownProducts.slice(0, 2);
  }
  return preSearch.matches.slice(0, 1);
}

function formatComparisonReply(pair, lang) {
  const [a, b] = pair;
  const blockA = formatProductDetailsBlock(a, lang);
  const blockB = formatProductDetailsBlock(b, lang);

  const priceDiff = Math.abs(Number(a.price) - Number(b.price));
  const cheaper = a.price < b.price ? a : (b.price < a.price ? b : null);
  const metricA = extractPowerMetric(a);
  const metricB = extractPowerMetric(b);
  const stronger = (metricA > 0 && metricB > 0 && metricA !== metricB)
    ? (metricA > metricB ? a : b)
    : null;

  const summaryLines = [];
  if (lang === 'en') {
    if (cheaper) summaryLines.push(`• **Price difference:** **${cheaper.title}** is cheaper by **${priceDiff} EGP** (${cheaper.price} vs ${cheaper === a ? b.price : a.price} EGP).`);
    else summaryLines.push(`• **Price:** Both items are priced identically at **${a.price} EGP**.`);
    summaryLines.push(`• **Stock status:** ${a.title} (${a.stock > 0 ? `${a.stock} in stock` : 'Out of stock'}) vs ${b.title} (${b.stock > 0 ? `${b.stock} in stock` : 'Out of stock'}).`);
    if (stronger) summaryLines.push(`• **Recorded capacity/rating:** **${stronger.title}** has a higher recorded spec rating.`);
    else summaryLines.push('• **Other specs:** Only the specifications recorded above are listed in store data.');

    return `Here is an accurate comparison based strictly on real product data in SOUQI STORE 📊:\n\n${blockA}\n\n${blockB}\n\n📋 **Quick Comparison Summary:**\n${summaryLines.join('\n')}`;
  }

  if (cheaper) summaryLines.push(`• **فرق السعر:** منتج **${cheaper.title}** أقل سعراً بفارق **${priceDiff} ج.م** (${cheaper.price} ج.م مقابل ${cheaper === a ? b.price : a.price} ج.م).`);
  else summaryLines.push(`• **السعر:** المنتجان بنفس السعر الحالي (**${a.price} ج.م**).`);

  const stA = a.stock > 0 ? `متوفر (${a.stock})` : 'غير متوفر (0)';
  const stB = b.stock > 0 ? `متوفر (${b.stock})` : 'غير متوفر (0)';
  summaryLines.push(`• **التوفر بالمخزون:** **${a.title}** (${stA}) مقابل **${b.title}** (${stB}).`);

  if (stronger) {
    summaryLines.push(`• **السعة / القدرة المسجلة:** **${stronger.title}** أعلى في المواصفة الرقمية المسجلة بالمتجر.`);
  }

  const header = lang === 'msa'
    ? 'إليك مقارنة دقيقة بين المنتجين استناداً إلى بياناتهما الفعلية في المتجر 📊:'
    : 'دي مقارنة دقيقة بين المنتجين من بياناتهم الحقيقية المسجلة في المتجر 📊:';
  const footerTitle = lang === 'msa' ? '📋 **ملخص الفروقات المسجلة:**' : '📋 **ملخص المقارنة الفعلي:**';

  return `${header}\n\n${blockA}\n\n${blockB}\n\n${footerTitle}\n${summaryLines.join('\n')}`;
}

function verifyProvenComplement(baseProduct, candProduct, lang = 'eg') {
  if (!baseProduct || !candProduct || String(baseProduct.id) === String(candProduct.id)) {
    return { compatible: false, reason: '' };
  }

  const bTypes = classifyProductPrimaryType(baseProduct);
  const cTypes = classifyProductPrimaryType(candProduct);
  const bFull = normalizeArabic(`${baseProduct.title || ''} ${baseProduct.description || ''}`);
  const cFull = normalizeArabic(`${candProduct.title || ''} ${candProduct.description || ''}`);
  const localizeReason = (eg, msa, en) => localizeText(lang, { eg, msa, en });

  // 1. Smart TV / Monitor with explicit HDMI ports <-> 4K HDMI Cable
  if (bTypes.has('monitor') && cTypes.has('cable')) {
    if (bFull.includes('hdmi') && cFull.includes('hdmi')) {
      return {
        compatible: true,
        reason: localizeReason(
          'الشاشة فيها منافذ HDMI مدمجة والكابل مخصص لنقل إشارة HDMI 4K بدون تقطيع.',
          'تدعم الشاشة منافذ HDMI مدمجة، والكابل مخصص لنقل إشارة HDMI 4K للشاشات بوضوح.',
          'The display has built-in HDMI ports and this cable is built for 4K HDMI signal transfer.'
        )
      };
    }
    return { compatible: false, reason: '' };
  }

  // 2. Dashcam / Recording Camera <-> High-speed MicroSD U3 Memory Card
  if ((bTypes.has('dashcam') || bTypes.has('camera')) && !bTypes.has('webcam') && cTypes.has('flash_memory')) {
    const isCard = /sd|microsd|ميكور\s*sd|بطاق(?:ه|ات)/.test(cFull);
    const mentionsCamRecording = /(كاميرا|كاميتار|فيديو|4k)/.test(cFull);
    if (isCard && mentionsCamRecording) {
      return {
        compatible: true,
        reason: localizeReason(
          'بطاقة الذاكرة فئة U3 مخصصة في بياناتها لتسجيل فيديو 4K في الكاميرات.',
          'بطاقة الذاكرة فئة U3 مخصصة وفقاً لوصفها لتسجيل مقاطع الفيديو في الكاميرات.',
          'Rated U3 in product specs specifically for 4K video recording in cameras.'
        )
      };
    }
    return { compatible: false, reason: '' };
  }

  // 3. Tablet <-> Smart Stylus for touch tablet screens
  if (bTypes.has('tablet') && cTypes.has('stylus')) {
    if (/(شاشات\s*لوحيه|اللوحيه\s*اللمسيه|stylus|tablet)/.test(cFull)) {
      return {
        compatible: true,
        reason: localizeReason(
          'القلم الإلكتروني مصمم للشاشات اللوحية اللمسية للكتابة والرسم، ويتناسب مع التابلت.',
          'القلم الإلكتروني مصمم للشاشات اللوحية اللمسية ويتوافق مع استخدام التابلت للتعليم والكتابة.',
          'Smart stylus designed specifically for touch tablet screens for writing and drawing.'
        )
      };
    }
    return { compatible: false, reason: '' };
  }

  // 4. Smartphone <-> Non-MagSafe Powerbank or explicitly Phone-compatible accessories
  if (bTypes.has('phone')) {
    if (cTypes.has('powerbank')) {
      const requiresMagSafe = /(magsafe|مغناطيس|الداعمه\s*للمغناطيس|الادعمه\s*للمغناطيس)/.test(cFull);
      const phoneSupportsMagSafe = /(magsafe|مغناطيس|شحن\s*لاسلكي)/.test(bFull);
      if (requiresMagSafe && !phoneSupportsMagSafe) {
        return { compatible: false, reason: '' };
      }
      if (/(الهاتف|هاوتف|phone)/.test(cFull)) {
        return {
          compatible: true,
          reason: localizeReason(
            'مخصص لشحن الهواتف في بياناته (20000mAh، يشحن الهاتف حتى 4 مرات بأمان).',
            'مخصص وفقاً لمواصفاته لشحن الهواتف بأمان (سعة 20000mAh، يشحن الهاتف حتى 4 مرات).',
            'Explicitly rated for safe phone charging in store specs (20000mAh, up to 4 charges).'
          )
        };
      }
    }
    if (cTypes.has('phone_holder')) {
      return {
        compatible: true,
        reason: localizeReason(
          'حامل مخصص لتثبيت الهواتف الذكية في السيارة (ملاحظة: الشحن اللاسلكي المدمج يتطلب دعماً له في الهاتف).',
          'مخصص لتثبيت الهواتف الذكية في السيارة (مع ملاحظة أن الشحن اللاسلكي يتطلب دعم الهاتف له).',
          'Built to hold smartphones securely in cars (note: wireless charging requires phone support).'
        )
      };
    }
    return { compatible: false, reason: '' };
  }

  // 5. Type-C Charger / Type-C Powerbank / Type-C Hub <-> Type-C Cable
  if ((bTypes.has('charger') || bTypes.has('powerbank') || bTypes.has('usb_hub')) && cTypes.has('cable')) {
    const baseHasTypeC = /(type\s*c|usb\s*c|تايبسي)/.test(bFull);
    const cableIsTypeC = /(type\s*c|usb\s*c|تايبسي)/.test(cFull);
    if (baseHasTypeC && cableIsTypeC) {
      return {
        compatible: true,
        reason: localizeReason(
          'المنتج يدعم منافذ Type-C في بياناته، والكابل من نوع Type-C إلى Type-C بقدرة شحن سريع.',
          'يدعم المنتج الأساسي منفذ Type-C في بياناته، والكابل مطابق من نوع Type-C إلى Type-C.',
          'Both the device specs and cable explicitly share Type-C connectivity.'
        )
      };
    }
    return { compatible: false, reason: '' };
  }

  // 6. Multi-port Type-C Hub (with HDMI 4K + SD/TF Reader) <-> HDMI Cable or SD/MicroSD Card
  if (bTypes.has('usb_hub')) {
    if (cTypes.has('cable') && bFull.includes('hdmi') && cFull.includes('hdmi')) {
      return {
        compatible: true,
        reason: localizeReason(
          'الهب يحتوي على مخرج HDMI 4K في بياناته، والكابل ينقل إشارة HDMI 4K مباشرة.',
          'يحتوي الموزع على مخرج HDMI 4K في بياناته والكابل متوافق معه لنقل العرض.',
          'The hub includes an HDMI 4K output matching this 4K HDMI cable.'
        )
      };
    }
    if (cTypes.has('flash_memory') && /(sd|tf|قارئ|قاير)/.test(bFull) && /(sd|microsd)/.test(cFull)) {
      return {
        compatible: true,
        reason: localizeReason(
          'الهب مزود بقارئ كروت SD/TF ويتكامل مباشرة مع بطاقة الذاكرة Micro SD.',
          'يضم الموزع قارئ بطاقات SD/TF في بياناته مما يثبت توافقه مع بطاقة Micro SD.',
          'The hub includes an SD/TF card reader matching this MicroSD card.'
        )
      };
    }
  }

  // 7. USB-C SD/MicroSD Card Reader <-> MicroSD Card
  if (bTypes.has('flash_memory') && /(قارئ|قاير|reader)/.test(bFull) && cTypes.has('flash_memory') && !/(قارئ|قاير|reader|flash)/.test(cFull) && /(sd|microsd)/.test(cFull)) {
    return {
      compatible: true,
      reason: localizeReason(
        'قارئ البطاقات يدعم صراحةً كروت SD/MicroSD ويتوافق مباشرة مع بطاقة Micro SD 128GB.',
        'يدعم قارئ البطاقات معيار SD/MicroSD مباشرةً في بياناته، مما يثبت التوافق.',
        'The card reader explicitly supports SD/MicroSD matching this MicroSD card.'
      )
    };
  }

  // 8. Gigabit Wi-Fi Router <-> Wi-Fi Extender / Gigabit Ethernet Switch
  if (bTypes.has('router')) {
    if (cTypes.has('router') && /(موسع|مقوي|مقيو|وايفاي|extender|repeater)/.test(cFull)) {
      return {
        compatible: true,
        reason: localizeReason(
          'يعمل مع شبكات الواي فاي لتقوية الإشارة وتوسيع تغطية الراوتر في الغرف البعيدة.',
          'متوافق مع شبكات الواي فاي لتقوية وتوسيع تغطية الراوتر في المناطق البعيدة.',
          'Extends Wi-Fi router coverage cleanly into weak-signal rooms.'
        )
      };
    }
    if (cTypes.has('switch') && /(جيجابت|gigabit|1000mbps)/.test(bFull) && /(1000mbps|جيجابت)/.test(cFull)) {
      return {
        compatible: true,
        reason: localizeReason(
          'كلاهما يدعم سرعة جيجابت (1000Mbps) لتوزيع توصيلات الشبكة السلكية من منافذ الراوتر.',
          'يدعم الطرفان سرعة جيجابت لتوزيع منافذ الإنترنت السلكية بكفاءة.',
          'Both router ports and Ethernet switch operate at matching Gigabit (1000Mbps) speeds.'
        )
      };
    }
  }

  // 9. Gaming RGB Keyboard <-> Gaming RGB Mouse (do not duplicate if combo set already includes mouse)
  if (bTypes.has('keyboard') && !bTypes.has('mouse') && cTypes.has('mouse')) {
    if (/(rgb|العاب|gaming)/.test(bFull) && /(rgb|العاب|gaming)/.test(cFull)) {
      return {
        compatible: true,
        reason: localizeReason(
          'فأرة ألعاب بصرية بإضاءة RGB تكمل لوحة المفاتيح الميكانيكية RGB لتجهيز ألعاب متناسق.',
          'فأرة ألعاب RGB تكمل لوحة المفاتيح الميكانيكية RGB في إعدادات الكمبيوتر والألعاب.',
          'RGB gaming mouse pairs naturally with the RGB mechanical keyboard setup.'
        )
      };
    }
  }
  if (bTypes.has('mouse') && !bTypes.has('keyboard') && cTypes.has('keyboard') && !cTypes.has('mouse')) {
    if (/(rgb|العاب|gaming)/.test(bFull) && /(rgb|العاب|gaming)/.test(cFull)) {
      return {
        compatible: true,
        reason: localizeReason(
          'لوحة مفاتيح ميكانيكية للألعاب RGB تكمل فأرة الألعاب RGB في بياناتهما.',
          'لوحة مفاتيح ميكانيكية للألعاب بإضاءة RGB تكمل فأرة الألعاب المحددة.',
          'RGB mechanical gaming keyboard complements the RGB gaming mouse setup.'
        )
      };
    }
  }

  return { compatible: false, reason: '' };
}

function findComplementaryProducts(baseProducts, ctx, options = {}) {
  const { maxPrice = null, excludeIds = new Set(), limit = 2, lang = 'eg' } = options;
  const bases = Array.isArray(baseProducts) ? baseProducts.filter(Boolean) : [baseProducts].filter(Boolean);
  if (bases.length === 0) return [];

  const seen = new Set(Array.from(excludeIds).map(String));
  bases.forEach(b => seen.add(String(b.id)));

  const results = [];
  for (const base of bases) {
    for (const cand of ctx.products) {
      if (results.length >= limit) break;
      const cid = String(cand.id);
      if (seen.has(cid)) continue;
      if (cand.stock <= 0) continue;
      if (maxPrice !== null && cand.price > maxPrice) continue;

      const check = verifyProvenComplement(base, cand, lang);
      if (check.compatible) {
        seen.add(cid);
        results.push({ product: cand, reason: check.reason, baseId: base.id });
      }
    }
    if (results.length >= limit) break;
  }
  return results;
}

function checkCompatibilityBetween(p1, p2, lang = 'eg') {
  if (!p1 || !p2) return { compatible: false, explanation: '' };
  const forward = verifyProvenComplement(p1, p2, lang);
  if (forward.compatible) {
    return { compatible: true, explanation: forward.reason };
  }
  const reverse = verifyProvenComplement(p2, p1, lang);
  if (reverse.compatible) {
    return { compatible: true, explanation: reverse.reason };
  }

  const f1 = normalizeArabic(`${p1.title || ''} ${p1.description || ''}`);
  const f2 = normalizeArabic(`${p2.title || ''} ${p2.description || ''}`);

  const p1MagSafeReq = /(magsafe|الداعمه\s*للمغناطيس|الادعمه\s*للمغناطيس)/.test(f1) && !/(magsafe|مغناطيس|شحن\s*لاسلكي)/.test(f2);
  const p2MagSafeReq = /(magsafe|الداعمه\s*للمغناطيس|الادعمه\s*للمغناطيس)/.test(f2) && !/(magsafe|مغناطيس|شحن\s*لاسلكي)/.test(f1);

  if (p1MagSafeReq || p2MagSafeReq) {
    return {
      compatible: false,
      explanation: localizeText(lang, {
        eg: `بيانات الشاحن/الباور بانك MagSafe تشترط هاتفاً داعماً للشحن المغناطيسي (MagSafe)، ودي ميزة غير مسجلة في بيانات **${p1MagSafeReq ? p2.title : p1.title}** بالمتجر، فما نقدرش نأكد توافق التثبيت المغناطيسي بينهما.`,
        msa: `يشترط الباور بانك MagSafe دعماً للشحن المغناطيسي في الهاتف، وهذه المواصفة غير مسجلة في بيانات **${p1MagSafeReq ? p2.title : p1.title}**، لذلك لا يوجد دليل توافق مؤكد بينهما.`,
        en: `The MagSafe power bank requires magnetic charging support, which is not recorded in **${p1MagSafeReq ? p2.title : p1.title}** specs—so compatibility cannot be confirmed from store data.`
      })
    };
  }

  return {
    compatible: false,
    explanation: localizeText(lang, {
      eg: `بناءً على المواصفات المسجلة لكل من **${p1.title}** و**${p2.title}**، مفيش في بيانات المتجر دليل واضح يثبت توافقهما مع بعض للعمل معاً (زي تطابق المنفذ أو الدعم التقني المذكور في الوصف).`,
      msa: `استناداً إلى المواصفات المسجلة لـ **${p1.title}** و**${p2.title}**، لا يتوفر دليل تقني في بيانات المتجر يثبت التوافق المباشر بينهما.`,
      en: `Based strictly on the recorded descriptions of **${p1.title}** and **${p2.title}**, store data does not contain verified evidence confirming their direct compatibility.`
    })
  };
}

function findSmartAlternatives(queryText, ctx, options = {}) {
  const {
    maxPrice = null,
    excludeIds = new Set(),
    preferCategoryId = null,
    limit = 3,
    lang = 'eg'
  } = options;

  const normQ = normalizeArabic(queryText || '');
  const constraints = detectQueryConstraints(normQ);
  const reqTypes = constraints.requestedTypes || [];
  const reqConn = constraints.requestedConnection || null;
  const seen = new Set(Array.from(excludeIds).map(String));

  const isEligibleAlt = (p, enforceConn = true) => {
    if (!p || p.stock <= 0) return false;
    if (seen.has(String(p.id))) return false;
    if (maxPrice !== null && p.price > maxPrice) return false;
    const pConn = analyzeProductConnection(p);
    if (enforceConn && (reqConn === 'wireless' || reqConn === 'wired')) {
      if (pConn !== reqConn) return false;
    } else if (pConn === 'ambiguous_conflict' && (reqTypes.includes('headphones') || reqTypes.includes('earbuds'))) {
      return false;
    }
    return true;
  };

  // Tier 1: Same primary product type (true direct alternatives in stock & budget)
  const sameTypeAlts = [];
  if (reqTypes.length > 0) {
    const candidates = ctx.products.filter(p => {
      if (!isEligibleAlt(p, true)) return false;
      const pt = classifyProductPrimaryType(p);
      // Products of an unknown kind are not "the same type" as what was asked for
      return pt.size > 0 && isTypeCompatible(reqTypes, pt);
    });
    candidates.sort((a, b) => (maxPrice !== null ? a.price - b.price : b.discountPercent - a.discountPercent || a.price - b.price));
    for (const p of candidates) {
      if (sameTypeAlts.length >= limit) break;
      seen.add(String(p.id));
      const reason = maxPrice !== null
        ? localizeText(lang, {
            eg: `بديل من نفس النوع متوفر بالمخزون (${p.stock} قطعة) ومناسب لميزانيتك (${p.price} ج.م)`,
            msa: `بديل من النوع نفسه متوفر بالمخزون (${p.stock} قطعة) وضمن الميزانية (${p.price} ج.م)`,
            en: `Same-type alternative currently in stock (${p.stock} pcs) within your budget (${p.price} EGP)`
          })
        : localizeText(lang, {
            eg: `بديل متوفر بالمخزون حالياً (${p.stock} قطعة) من نفس الفئة بسعر ${p.price} ج.م`,
            msa: `بديل متوفر بالمخزون حالياً (${p.stock} قطعة) من نفس النوع بسعر ${p.price} ج.م`,
            en: `In-stock same-type alternative (${p.stock} available) at ${p.price} EGP`
          });
      sameTypeAlts.push({ product: p, reason });
    }
  }

  // Tier 2: Functional same-need alternatives (only verified logical functional equivalents!)
  const functionalAlts = [];
  if (sameTypeAlts.length === 0 && reqTypes.length > 0) {
    const functionalMap = {
      storage: [
        {
          matchTypes: ['flash_memory'],
          filterFn: (p) => !/(قارئ|قاير|reader)/.test(normalizeArabic(p.title)),
          reason: {
            eg: 'وحدة تخزين محمولة متاحة بالمخزون بسعة أقل تناسب الميزانية الحالية',
            msa: 'وسيلة تخزين محمولة متوفرة بالمخزون بسعة أقل تناسب الميزانية المحددة',
            en: 'Portable storage option currently in stock at a lower capacity fitting this budget'
          }
        }
      ],
      router: [
        {
          matchTypes: ['router', 'switch'],
          filterFn: (p) => !/(راوتر|روتر)/.test(normalizeArabic(p.title)),
          reason: {
            eg: 'بديل شبكة متوفر لتوسيع الواي فاي أو توزيع منافذ الإنترنت السلكية',
            msa: 'جهاز شبكات متوفر لتقوية تغطية الواي فاي أو توزيع منافذ الإيثرنت',
            en: 'In-stock networking option for extending Wi-Fi range or expanding Ethernet ports'
          }
        }
      ],
      mouse: [
        {
          matchTypes: ['keyboard'],
          filterFn: (p) => classifyProductPrimaryType(p).has('mouse') && reqConn === null,
          reason: {
            eg: 'طقم لوحة مفاتيح وماوس معاً متوفر بالمخزون بسعر إجمالي أوفر',
            msa: 'طقم لوحة مفاتيح وماوس معاً متوفر بالمخزون حالياً',
            en: 'In-stock keyboard and mouse bundle offering an available mouse option'
          }
        }
      ],
      headphones: reqConn === null ? [
        {
          matchTypes: ['speaker'],
          filterFn: () => false, // Speakers are a different device; do not mislabel speaker as headphone alternative
          reason: { eg: '', msa: '', en: '' }
        }
      ] : [],
      earbuds: reqConn === null ? [
        {
          matchTypes: ['headphones'],
          filterFn: (p) => analyzeProductConnection(p) !== 'ambiguous_conflict',
          reason: {
            eg: 'سماعة رأس متوفرة بالمخزون وبمواصفات توصيل واضحة',
            msa: 'سماعة متوفرة بالمخزون ببيانات توصيل واضحة ومؤكدة',
            en: 'In-stock headphone with clearly confirmed connection specifications'
          }
        }
      ] : []
    };

    for (const rType of reqTypes) {
      const defs = functionalMap[rType] || [];
      for (const def of defs) {
        for (const p of ctx.products) {
          if (sameTypeAlts.length + functionalAlts.length >= limit) break;
          if (!isEligibleAlt(p, true)) continue;
          const pt = classifyProductPrimaryType(p);
          if (!def.matchTypes.some(mt => pt.has(mt))) continue;
          if (def.filterFn && !def.filterFn(p)) continue;
          seen.add(String(p.id));
          functionalAlts.push({ product: p, reason: localizeText(lang, def.reason) });
        }
      }
    }
  }

  // Tier 3: Category fallback ONLY when no conflicting hardware type was demanded (e.g. generic category/brand miss on phone/budget)
  const categoryAlts = [];
  if (sameTypeAlts.length === 0 && functionalAlts.length === 0 && reqTypes.length === 0 && preferCategoryId) {
    const catCands = ctx.products
      .filter(p => isEligibleAlt(p, false) && p.categoryId === preferCategoryId)
      .sort((a, b) => b.discountPercent - a.discountPercent || a.price - b.price);
    for (const p of catCands) {
      if (categoryAlts.length >= limit) break;
      seen.add(String(p.id));
      categoryAlts.push({
        product: p,
        reason: localizeText(lang, {
          eg: `منتج متوفر في نفس القسم (${p.categoryName || 'المتجر'}) بمخزون ${p.stock} قطعة`,
          msa: `خيار متوفر ضمن القسم نفسه (${p.categoryName || 'المتجر'}) بمخزون ${p.stock} قطعة`,
          en: `Available option in the same section (${p.categoryName || 'Store'}) with ${p.stock} in stock`
        })
      });
    }
  }

  const allAlts = [...sameTypeAlts, ...functionalAlts, ...categoryAlts].slice(0, limit);
  return {
    alternatives: allAlts,
    sameTypeCount: sameTypeAlts.length,
    functionalCount: functionalAlts.length,
    noSuitableAlt: allAlts.length === 0
  };
}

function toRecommendationCard(item) {
  return {
    ...toProductCard(item.product),
    recommendationReason: item.reason
  };
}

function formatAddonsSection(complementaryItems, lang = 'eg') {
  if (!Array.isArray(complementaryItems) || complementaryItems.length === 0) return '';
  const heading = localizeText(lang, {
    eg: '💡 **منتجات مكملة متوافقة متوفرة بالمخزون:**',
    msa: '💡 **منتجات مكملة متوافقة متوفرة حالياً بالمخزون:**',
    en: '💡 **Compatible add-on products currently in stock:**'
  });
  const rows = complementaryItems.map(({ product: p, reason }) => {
    const unit = p.saleUnit || (lang === 'en' ? 'pcs' : 'قطعة');
    const stockTxt = lang === 'en' ? `${p.stock} in stock` : `متوفر: ${p.stock} ${unit}`;
    return `• **${p.title}** — **${p.price} ${lang === 'en' ? 'EGP' : 'ج.م'}** (${stockTxt})\n  ↳ ${reason}`;
  }).join('\n');
  return `\n\n${heading}\n${rows}`;
}

function formatAlternativesSection(altItems, lang = 'eg', headingOverride = null) {
  if (!Array.isArray(altItems) || altItems.length === 0) return '';
  const heading = headingOverride || localizeText(lang, {
    eg: '🔄 **بدائل متاحة بالمخزون قد تناسبك:**',
    msa: '🔄 **بدائل متوفرة بالمخزون قد تناسب طلبك:**',
    en: '🔄 **Available in-stock alternatives that may suit you:**'
  });
  const rows = altItems.map(({ product: p, reason }) => {
    return `${formatProductLine(p, lang)}\n  ↳ *${localizeText(lang, { eg: 'سبب الاقتراح', msa: 'سبب الترشيح', en: 'Why suggested' })}:* ${reason}`;
  }).join('\n');
  return `\n\n${heading}\n${rows}`;
}

async function generateBotReply(userMessage, conversation = null, reqUser = null) {
  const rawText = normalizeNumerals(userMessage || '').trim();
  const norm = normalizeArabic(rawText);
  const lang = detectReplyStyle(rawText, conversation);
  const ctx = await loadStoreContext(reqUser);
  const convState = getConversationContext(conversation, ctx);

  // 1. Strict Privacy Guard — NEVER ask for or accept passwords, OTP codes, or card credentials
  if (detectSensitiveCredentialAttempt(norm)) {
    return {
      text: localizeText(lang, {
        eg: 'لحماية حساب حضرتك وأمانك، ما ينفعش أبداً تبعت كلمة المرور أو أكواد التحقق (OTP) أو بيانات البطاقة البنكية هنا في الشات 🛡️.\nالدفع بالبطاقة بيتم مباشرة بأمان تام من صفحة إتمام الطلب، ومش بنطلب منك أي بيانات سرية.',
        msa: 'حفاظاً على أمان حسابك، يُرجى عدم مشاركة كلمة المرور أو رموز التحقق (OTP) أو بيانات البطاقات البنكية داخل المحادثة 🛡️. تتم عمليات الدفع الآمنة مباشرة من صفحة إتمام الطلب فقط.',
        en: 'For your account safety, please never share passwords, OTP verification codes, or bank card details in chat 🛡️. All payments are processed securely only on the checkout page.'
      }),
      suggestions: buildSuggestions(ctx, lang),
      canEscalate: true,
      lang,
      intent: 'security_refused'
    };
  }

  // 2. Strict Dashboard / Admin / Cost Restriction
  if (detectAdminOrForbiddenIntent(norm)) {
    return {
      text: localizeText(lang, {
        eg: 'عذراً يا فندم، أنا بسام المساعد الذكي للتسوق وخدمة العملاء فقط، ومليش أي علاقة أو صلاحية على لوحة التحكم أو الداشبورد أو البيانات الإدارية والداخلية.\n\nأقدر أساعد حضرتك هنا في المنتجات والأسعار والعروض أو متابعة طلبك.',
        msa: 'عذراً يا فندم، أنا المساعد الذكي للتسوق وخدمة العملاء في متجر سوقي ستور فقط، ولا أملك أي وصول أو صلاحية على لوحة التحكم أو البيانات الإدارية والداخلية للمتجر.\n\nيسعدني مساعدتك في اختيار المنتجات أو معرفة العروض ومتابعة طلباتك.',
        en: 'I’m sorry, I’m SOUQI STORE’s smart shopping and customer support assistant—I don’t have access to the admin dashboard, internal financials, or permission to change store data.\n\nI’d be happy to help you find products, check offers, or track your order!'
      }),
      suggestions: buildSuggestions(ctx, lang),
      canEscalate: true,
      lang,
      intent: 'admin_refused'
    };
  }

  // 3. Explicit Action-Execution Guard — never claim an action was executed when it wasn't
  if (detectUnperformedActionRequest(norm)) {
    return {
      text: localizeText(lang, {
        eg: 'أنا أقدر أرشحلك المنتجات وأوضّحلك الأسعار والعروض يا فندم، بس ما أقدرش أنفذ عمليات الدفع أو تأكيد/تعديل الطلب بنفسي من الشات.\nتقدر تكمل الخطوة دي بأمان من السلة وصفحة إتمام الطلب، أو تحب أحولك لموظف خدمة عملاء يساعدك؟',
        msa: 'يمكنني مساعدتك في اختيار المنتجات ومعرفة الأسعار، ولكن لا يمكنني تنفيذ عمليات الشراء أو الدفع أو تعديل الأسعار مباشرة عبر المحادثة. يمكنك إتمام الطلب بأمان عبر السلة، أو التحويل لموظف خدمة العملاء للمساعدة.',
        en: 'I can guide you to the right products and offers, though I cannot process payments, place orders, or modify store prices directly from chat. You can complete checkout securely in your cart, or I can connect you with a human agent if you need assistance.'
      }),
      escalationSuggested: true,
      canEscalate: true,
      lang,
      suggestions: buildSuggestions(ctx, lang),
      intent: 'action_refused'
    };
  }

  // 4. Honest AI Transparency Check (Never claim to be human!)
  if (/(انت بوت|انت روبوت|انت انسان|انت موظف|هل انت موظف|هل انت انسان|موظف حقيقي ولا|بني ادم|ذكاء اصطناعي|مساعد ذكي|are you a bot|are you human|are you an ai|human or ai)/.test(norm)) {
    return {
      text: localizeText(lang, {
        eg: 'أنا بسام، المساعد الذكي بالذكاء الاصطناعي لمتجر سوقي ستور 😊.\nموجود هنا علشان أساعدك تلاقي المنتج المناسب ليك وأوضحلك الأسعار والعروض والسياسات، ولو تحب تتكلم مع موظف بشري من خدمة العملاء في أي وقت أقدر أحولك فوراً!',
        msa: 'أنا بسام، المساعد الذكي المعتمد على الذكاء الاصطناعي لمتجر سوقي ستور 😊.\nأساعدك في الوصول للمنتجات المناسبة ومعرفة الأسعار والعروض وتفاصيل الشحن والطلبات، ويمكنني تحويلك إلى موظف خدمة عملاء بشري متى أردت.',
        en: 'I’m Bassam, the AI-powered smart assistant for SOUQI STORE 😊.\nI’m here to help you find the right products, check real prices, offers, and store policies—and if you’d like to speak with a human representative at any time, I can transfer you right away!'
      }),
      suggestions: buildSuggestions(ctx, lang),
      canEscalate: true,
      lang,
      intent: 'ai_identity'
    };
  }

  // 5. Explicit Human Agent Request or Confirming Previous Escalation Offer
  const explicitEscalationPhrases = [
    'موظف', 'خدمه العملاء', 'خدمه عملاء', 'بشري', 'حد حقيقي', 'حد يكلمني',
    'كلمني مع', 'اتكلم مع حد', 'اكلم حد', 'حد يرد', 'حولني', 'وصلني ب', 'مدير',
    'talk to a human', 'human agent', 'customer service', 'representative', 'live agent', 'talk to an agent', 'real person'
  ];
  const isConfirmingEscalation =
    convState.botWasOfferingEscalation &&
    /^(اه|ايوه|ايوة|تمام|ماشي|موافق|نعم|يا ريت|ياريت|اتفضل|اوك|بالتاكيد|اكيد|ok|yes|sure|please|connect me|حولني)/.test(norm);
  const isDecliningEscalation =
    convState.botWasOfferingEscalation &&
    /^(لا|لا شكرا|مش دلوقتي|مش عايز|خليك انت|كمل معاك|no|no thanks|not now)/.test(norm);

  if (explicitEscalationPhrases.some(kw => norm.includes(normalizeArabic(kw))) || isConfirmingEscalation) {
    const hasContact = Boolean((ctx.customerUser && (ctx.customerUser.phone || ctx.customerUser.whatsappPhone)) || conversation?.customer?.phone);
    if (hasContact) {
      return {
        text: localizeText(lang, {
          eg: 'تحت أمرك يا فندم! تم تحويل المحادثة فوراً لأحد ممثلي خدمة العملاء في سوقي ستور 👨‍💼. أحد زملائنا هيستلم الشات ويرد عليك في أسرع وقت.',
          msa: 'بكل سرور يا فندم! تم تحويل المحادثة الآن إلى أحد ممثلي خدمة العملاء في سوقي ستور 👨‍💼، وسيتواصل معك أحد الزملاء في أقرب وقت.',
          en: 'Of course! I’ve transferred your conversation to a human support agent at SOUQI STORE 👨‍💼. Someone from our team will reply shortly.'
        }),
        autoEscalateNow: true,
        canEscalate: true,
        lang,
        intent: 'escalation',
        suggestions: []
      };
    }
    return {
      text: localizeText(lang, {
        eg: 'أكيد يا فندم، يسعدني أحولك فوراً لموظف خدمة العملاء 👨‍💼. من فضلك اكتب اسمك (ورقم موبايلك لو تحب متابعة سريعة) في الخانة اللي ظهرت تحت عشان يتواصل معاك فوراً.',
        msa: 'بكل سرور! يسعدني تحويلك فوراً إلى أحد موظفي خدمة العملاء 👨‍💼. يرجى إدخال اسمك (ورقم هاتفك للمتابعة السريعة إن رغبت) في الخانة الظاهرة بالأسفل.',
        en: 'Certainly! I’d be happy to connect you with a human support agent 👨‍💼. Please enter your name (and optional phone/WhatsApp for faster follow-up) in the box below.'
      }),
      openEscalateBox: true,
      canEscalate: true,
      escalationSuggested: true,
      lang,
      intent: 'escalation_prompt',
      suggestions: []
    };
  }

  if (isDecliningEscalation) {
    return {
      text: localizeText(lang, {
        eg: 'تحت أمرك يا فندم! أنا مكمل معاك هنا بكل سرور 😊 قولي تحب أدورلك على إيه دلوقتي؟',
        msa: 'على الرحب والسعة! أنا مستمر معك هنا للمساعدة 😊 ما الذي تود البحث عنه الآن؟',
        en: 'No problem at all! I’m right here to keep helping 😊 What would you like to look for next?'
      }),
      suggestions: buildSuggestions(ctx, lang),
      canEscalate: true,
      lang,
      intent: 'chitchat'
    };
  }

  // 6. Extract optional greeting prefix so combined "مساء الخير عايز سماعة" handles both naturally
  const greetInfo = extractGreetingPrefix(rawText);
  const queryNorm = greetInfo.matchedGreeting && !greetInfo.isGreetingOnly ? greetInfo.restText : norm;
  const prefixBanner = greetInfo.matchedGreeting && !greetInfo.isGreetingOnly ? `${formatGreetingPrefix(greetInfo.greetingKey, lang)} ` : '';

  // 7. Pure Greetings & Everyday Chitchat
  if (greetInfo.isGreetingOnly) {
    if (greetInfo.greetingKey === 'evening') {
      return {
        text: 'مساء النور يا فندم ❤️ أهلاً بحضرتك في سوقي ستور، أقدر أساعدك إزاي؟',
        suggestions: buildSuggestions(ctx, lang),
        canEscalate: true,
        lang,
        intent: 'greeting'
      };
    }
    if (greetInfo.greetingKey === 'morning') {
      return {
        text: 'صباح النور يا فندم ❤️ أهلاً بحضرتك في سوقي ستور، أقدر أساعدك إزاي؟',
        suggestions: buildSuggestions(ctx, lang),
        canEscalate: true,
        lang,
        intent: 'greeting'
      };
    }
    if (greetInfo.greetingKey === 'salam') {
      return {
        text: 'وعليكم السلام ورحمة الله وبركاته يا فندم ❤️ أهلاً بحضرتك في سوقي ستور، أقدر أساعدك إزاي؟',
        suggestions: buildSuggestions(ctx, lang),
        canEscalate: true,
        lang,
        intent: 'greeting'
      };
    }
    if (greetInfo.greetingKey === 'en_evening') {
      return {
        text: 'Good evening! ❤️ Welcome to SOUQI STORE, how can I help you today?',
        suggestions: buildSuggestions(ctx, 'en'),
        canEscalate: true,
        lang: 'en',
        intent: 'greeting'
      };
    }
    if (greetInfo.greetingKey === 'en_morning') {
      return {
        text: 'Good morning! ❤️ Welcome to SOUQI STORE, how can I help you today?',
        suggestions: buildSuggestions(ctx, 'en'),
        canEscalate: true,
        lang: 'en',
        intent: 'greeting'
      };
    }
    if (greetInfo.greetingKey === 'en_hello') {
      return {
        text: 'Hello! ❤️ Welcome to SOUQI STORE! How can I help you find what you need today?',
        suggestions: buildSuggestions(ctx, 'en'),
        canEscalate: true,
        lang: 'en',
        intent: 'greeting'
      };
    }
    if (greetInfo.greetingKey === 'wellbeing') {
      return {
        text: localizeText(lang, {
          eg: 'الحمد لله يا فندم، بخير وتسلم على سؤالك! ❤️ أقدر أساعد حضرتك إزاي النهاردة؟',
          msa: 'الحمد لله، أنا بخير ويسعدني حديثك! ❤️ كيف يمكنني مساعدتك اليوم؟',
          en: 'I’m doing great, thank you for asking! ❤️ How can I help you shop today?'
        }),
        suggestions: buildSuggestions(ctx, lang),
        canEscalate: true,
        lang,
        intent: 'chitchat'
      };
    }
    return {
      text: WELCOME_MESSAGE,
      suggestions: buildSuggestions(ctx, lang),
      canEscalate: true,
      lang,
      intent: 'greeting'
    };
  }

  if (/^(عامل ايه|اخبارك ايه|اخبارك|ازيك|ازي الحال|كيف حالك|كله تمام|how are you)(\s+(يا بسام|بسام|يا فندم))?$/.test(queryNorm)) {
    return {
      text: localizeText(lang, {
        eg: 'الحمد لله يا فندم، بخير ومبسوط إني بخدمتك! ❤️ أقدر أساعد حضرتك إزاي؟',
        msa: 'الحمد لله، أنا بخير ويسعدني خدمتك! ❤️ كيف يمكنني مساعدتك اليوم؟',
        en: 'I’m doing great, thanks! ❤️ How can I assist you today?'
      }),
      suggestions: buildSuggestions(ctx, lang),
      canEscalate: true,
      lang,
      intent: 'chitchat'
    };
  }

  if (/^(اسمك ايه|مين معايا|انت مين|who are you|what is your name)/.test(queryNorm)) {
    return {
      text: localizeText(lang, {
        eg: 'أنا بسام، المساعد الذكي للمبيعات وخدمة العملاء في سوقي ستور 😊 قولي بتدور على إيه وأنا هساعدك توصل للأنسب ليك.',
        msa: 'أنا بسام، المساعد الذكي للمبيعات وخدمة العملاء في متجر سوقي ستور 😊 أخبرني بما تبحث عنه وسأساعدك في اختيار الأنسب لك.',
        en: 'I’m Bassam, the smart sales & customer support assistant at SOUQI STORE 😊 Tell me what you’re looking for and I’ll help you find the best match.'
      }),
      suggestions: buildSuggestions(ctx, lang),
      canEscalate: true,
      lang,
      intent: 'identity'
    };
  }

  if (/^(شكرا|شكرا جدا|شكرا جزيلا|الف شكر|متشكر|تسلم|تسلملي|يعطيك العافيه|جزاك الله خير|كتر خيرك|باي|مع السلامه|سلام|thanks|thank you|bye|goodbye)(\s+(يا بسام|يا فندم|bassam))?$/.test(queryNorm)) {
    return {
      text: localizeText(lang, {
        eg: 'العفو يا فندم، تحت أمرك في أي وقت! ❤️ شرفت سوقي ستور ولو احتجت أي مساعدة تانية أنا موجود.',
        msa: 'على الرحب والسعة يا فندم! ❤️ تشرفنا بتواصلك مع سوقي ستور، وأنا هنا دائماً متى احتجت لأي مساعدة.',
        en: 'You’re very welcome! ❤️ Thank you for visiting SOUQI STORE—feel free to reach out anytime you need a hand.'
      }),
      suggestions: buildSuggestions(ctx, lang),
      canEscalate: true,
      lang,
      intent: 'farewell'
    };
  }

  // Optional Gemini LLM path when GEMINI_API_KEY is configured
  const preSearch = findMatchingProducts(queryNorm, ctx, {
    preferCategoryId: convState.rememberedCategoryId,
    overrideMaxPrice: null,
    limit: 4
  });
  if (process.env.GEMINI_API_KEY) {
    const geminiResult = await tryGeminiReply(rawText, conversation, ctx, preSearch.matches, lang);
    if (geminiResult) return geminiResult;
  }

  // 8. Loyalty Points & Coupons
  const asksPoints = /(نقاطي|رصيدي|رصيد النقاط|نقاط الولاء|كام نقطه|عندي كام نقطه|نقط|الولاء|loyalty|points)/.test(queryNorm);
  const asksCoupons = /(كوبون|كوبوناتي|كود خصم|اكواد خصم|برومو|مكافا|عندي خصم|coupon|coupons|voucher|promo code)/.test(queryNorm);

  if (asksPoints && asksCoupons) {
    let reply = '';
    if (ctx.loyaltySummary) {
      const l = ctx.loyaltySummary;
      const allMyCoupons = [...ctx.personalCoupons, ...ctx.publicCoupons];
      if (lang === 'en') {
        reply = `Here is your rewards summary, ${l.userName}:\n\n🪙 Loyalty Points: **${l.points} points** (worth **${l.pointsValueEgp} EGP**). `;
        reply += l.canRedeem
          ? `You can redeem them now at checkout for up to ${l.maxPercent}% off.\n`
          : `You need ${l.pointsNeededToRedeem} more points to reach the ${l.minThreshold}-point redemption threshold.\n`;
        reply += allMyCoupons.length > 0
          ? `\n🎟️ Available coupons:\n${allMyCoupons.map(c => `• **${c.code}** (${c.discountType === 'percentage' ? c.discountValue + '% off' : c.discountValue + ' EGP off'})`).join('\n')}`
          : '\n🎟️ No unused coupons right now—milestone VIP 10% coupons unlock automatically when delivered orders reach 3,000 or 5,000 EGP!';
      } else {
        reply += `حاضر يا فندم! ده ملخص حساب المكافآت الخاص بحضرتك (${l.userName}):\n\n`;
        reply += `🪙 **نقاط الولاء:** عندك حالياً **${l.points} نقطة** (قيمتها **${l.pointsValueEgp} ج.م**).\n`;
        reply += l.canRedeem
          ? `✅ تقدر تستبدلها دلوقتي في السلة بخصم لحد ${l.maxPercent}% من قيمة الطلب.\n`
          : `• فاضلك **${l.pointsNeededToRedeem} نقطة** بس للوصول لحد الاستبدال (${l.minThreshold} نقطة).\n`;
        reply += '\n🎟️ **الكوبونات المتاحة لحضرتك:**\n';
        if (allMyCoupons.length > 0) {
          allMyCoupons.forEach(c => {
            const valTxt = c.discountType === 'percentage' ? `خصم ${c.discountValue}%` : `خصم ${c.discountValue} ج.م`;
            reply += `• كود **${c.code}** — ${valTxt}${c.targetUserId ? ' (VIP خاص بك)' : ' (عام)'}\n`;
          });
        } else {
          reply += '• مفيش كوبونات متاحة حالياً، وبتنزل كوبونات VIP بخصم 10% تلقائياً لما مشترياتك توصل لـ 3,000 أو 5,000 ج.م.';
        }
      }
    } else {
      reply = localizeText(lang, {
        eg: `في سوقي ستور بتجمع 50 نقطة عن كل 1,000 ج.م مشتريات مسلّمة (النقطة = 1 ج.م) وتقدر تستبدل من 500 نقطة بخصم حتى 10%.${ctx.publicCoupons.length > 0 ? '\n\nالكوبونات العامة المتاحة:\n' + ctx.publicCoupons.map(c => `• **${c.code}** — خصم ${c.discountValue}${c.discountType === 'percentage' ? '%' : ' ج.م'}`).join('\n') : ''}\n\nسجل دخول بحسابك واسألني تاني عشان أقولك رصيد نقاطك وكوبوناتك الخاصة بالضبط!`,
        msa: `في متجر سوقي ستور تحصل على 50 نقطة لكل 1,000 ج.م مشتريات مُسلّمة (كل نقطة = 1 ج.م)، ويمكن استبدالها بدءاً من 500 نقطة بخصم يصل إلى 10%. قم بتسجيل الدخول لأتمكن من عرض رصيدك وكوبوناتك الشخصية بدقة.`,
        en: `At SOUQI STORE you earn 50 points per 1,000 EGP in delivered orders (1 point = 1 EGP), redeemable starting at 500 points for up to 10% off. Please sign in so I can check your exact points balance and personal VIP coupons!`
      });
    }
    return {
      text: prefixBanner + reply.trim(),
      suggestions: buildSuggestions(ctx, lang),
      canEscalate: true,
      lang,
      intent: 'loyalty_and_coupons'
    };
  }

  if (asksPoints) {
    let reply = '';
    if (ctx.loyaltySummary) {
      const l = ctx.loyaltySummary;
      reply = localizeText(lang, {
        eg: `رصيد نقاطك الحالي يا ${l.userName || 'فندم'} هو **${l.points} نقطة** (بقيمة **${l.pointsValueEgp} ج.م**) 🪙.\n${l.canRedeem ? `✅ رصيدك جاهز للاستبدال دلوقتي بخصم يوصل لـ ${l.maxPercent}%!` : `فاضلك **${l.pointsNeededToRedeem} نقطة** بس عشان توصل للحد الأدنى للاستبدال (${l.minThreshold} نقطة).`}`,
        msa: `رصيدك الحالي يا ${l.userName || 'فندم'} هو **${l.points} نقطة** (بقيمة **${l.pointsValueEgp} ج.م**) 🪙.\n${l.canRedeem ? `يمكنك استبدال نقاطك الآن بخصم يصل إلى ${l.maxPercent}%.` : `يتبقى لك **${l.pointsNeededToRedeem} نقطة** للوصول إلى الحد الأدنى للاستبدال (${l.minThreshold} نقطة).`}`,
        en: `Your current balance, ${l.userName || 'dear customer'}, is **${l.points} points** (worth **${l.pointsValueEgp} EGP**) 🪙.\n${l.canRedeem ? `You’re eligible to redeem them right now for up to ${l.maxPercent}% off!` : `You only need **${l.pointsNeededToRedeem} more points** to reach the ${l.minThreshold}-point redemption minimum.`}`
      });
    } else {
      reply = localizeText(lang, {
        eg: 'علشان أقولك رصيد نقاطك بالضبط، سجل دخول على حسابك في المتجر الأول يا فندم 😊. وبشكل عام كل 1,000 ج.م مشتريات مسلّمة بتديك 50 نقطة (النقطة = 1 ج.م).',
        msa: 'لعرض رصيد نقاطك الفعلي، يرجى تسجيل الدخول إلى حسابك أولاً 😊. يمنحك المتجر 50 نقطة لكل 1,000 ج.م من المشتريات المُسلّمة.',
        en: 'Please sign in to your account so I can check your exact points balance 😊. In general, you earn 50 points for every 1,000 EGP in delivered orders (1 point = 1 EGP).'
      });
    }
    return { text: prefixBanner + reply, suggestions: buildSuggestions(ctx, lang), canEscalate: true, lang, intent: 'points' };
  }

  if (asksCoupons) {
    const couponsToShow = ctx.customerUser ? [...ctx.personalCoupons, ...ctx.publicCoupons] : ctx.publicCoupons;
    let reply = '';
    if (couponsToShow.length > 0) {
      reply = localizeText(lang, {
        eg: `دي الكوبونات المتاحة دلوقتي يا فندم 🎟️:\n\n${couponsToShow.map(c => `• الكود **${c.code}** — خصم ${c.discountValue}${c.discountType === 'percentage' ? '%' : ' ج.م'}${c.targetUserId ? ' (VIP خاص بك)' : ''}`).join('\n')}\n\nاكتب الكود في صفحة إتمام الطلب (ملحوظة: لا يُجمع الكوبون مع استبدال النقاط في نفس الطلب).`,
        msa: `إليك الكوبونات المتاحة حالياً 🎟️:\n\n${couponsToShow.map(c => `• الكود **${c.code}** — خصم ${c.discountValue}${c.discountType === 'percentage' ? '%' : ' ج.م'}`).join('\n')}`,
        en: `Here are the coupons available right now 🎟️:\n\n${couponsToShow.map(c => `• **${c.code}** — ${c.discountValue}${c.discountType === 'percentage' ? '% off' : ' EGP off'}${c.targetUserId ? ' (Personal VIP)' : ''}`).join('\n')}\n\nApply the code at checkout (note: coupons cannot be combined with points in the same order).`
      });
    } else {
      reply = localizeText(lang, {
        eg: 'مفيش كوبونات متاحة حالياً، لكن السيستم بينزلك كوبون VIP بخصم 10% أوتوماتيك لما مشترياتك توصل لـ 3,000 أو 5,000 ج.م 🎟️، وكمان تقدر تشوف العروض والخصومات المباشرة على المنتجات دلوقتي.',
        msa: 'لا توجد كوبونات فعالة حالياً، ولكن يتم إصدار كوبون VIP بخصم 10% تلقائياً عند بلوغ مشترياتك 3,000 أو 5,000 ج.م 🎟️، ويمكنك أيضاً الاستفادة من الخصومات المباشرة الحالية.',
        en: 'There are no unused coupons available at the moment—however, personal 10% VIP coupons unlock automatically once your delivered orders reach 3,000 or 5,000 EGP 🎟️, and we also have direct product discounts available!'
      });
    }
    return { text: prefixBanner + reply, suggestions: buildSuggestions(ctx, lang), canEscalate: true, lang, intent: 'coupons' };
  }

  // 9. Price Objection Handling ("السعر غالي" / "too expensive") — Smart Alternatives with Real Reasons
  const isPriceObjection = /(السعر غالي|غالي|مكلف|سعره عالي|مرتفع|باهظ|مبالغ فيه|فوق ميزانيتي|الميزانيه قليله|مش معايا المبلغ|تخفيض شويه|مفيش ارخص|بدائل ارخص|عايز حاجه ارخص|too expensive|expensive|overpriced|over budget|high price|cheaper alternative|lower price|bit pricey)/.test(queryNorm);
  if (isPriceObjection) {
    const refProd = convState.recentShownProducts[0];
    const priceCap = refProd ? Math.max(50, refProd.price - 1) : (convState.rememberedBudget || null);
    const excludeSet = refProd ? new Set([String(refProd.id)]) : new Set();

    const altResult = findSmartAlternatives(convState.rememberedTopic || (refProd ? refProd.title : ''), ctx, {
      maxPrice: priceCap,
      excludeIds: excludeSet,
      preferCategoryId: convState.rememberedCategoryId,
      limit: 3,
      lang
    });

    let altItems = altResult.alternatives;
    let genericFallbackUsed = false;
    if (altItems.length === 0 && (convState.recentShownProducts.length > 0 || convState.rememberedTopic)) {
      let offersFallback = getBestOffers(ctx, 3, priceCap).filter(p => !excludeSet.has(String(p.id)));
      if (offersFallback.length === 0) {
        offersFallback = getBestOffers(ctx, 3).filter(p => !excludeSet.has(String(p.id)));
      }
      if (offersFallback.length > 0) {
        genericFallbackUsed = true;
        altItems = offersFallback.map(p => ({
          product: p,
          reason: localizeText(lang, {
            eg: `مفيش بديل مطابق تماماً بسعر أقل، وده عرض متاح بالمخزون (${p.stock} قطعة) بسعر أقل (${p.price} ج.م)`,
            msa: `لا يتوفر بديل مطابق تماماً بسعر أقل، وهذا خيار مخفض متاح بالمخزون (${p.stock} قطعة) بسعر ${p.price} ج.م`,
            en: `No exact same-type alternative at a lower price; this is a discounted in-stock option (${p.stock} left) at ${p.price} EGP`
          })
        }));
      }
    }

    const comfortOpen = localizeText(lang, {
      eg: 'ولا يهمك، خلينا نشوف اختيار يناسب ميزانيتك. ممكن نبحث عن بدائل بسعر أقل أو نشوف العروض المتاحة.',
      msa: 'لا بأس إطلاقاً، دعنا نجد خياراً يناسب ميزانيتك. يمكننا البحث عن بدائل بسعر أقل أو الاطلاع على العروض المتاحة.',
      en: 'No worries at all—let’s find a great option that fits your budget! We can look at more affordable alternatives or check our current discounted deals.'
    });

    if (altItems.length > 0 && (convState.recentShownProducts.length > 0 || convState.rememberedTopic)) {
      const listTxt = altItems.map(({ product: p, reason }) => `${formatProductLine(p, lang)}\n  ↳ ${reason}`).join('\n');
      const altHeader = genericFallbackUsed
        ? localizeText(lang, {
            eg: '\n\nدي اختيارات متوفرة حالياً بأسعار أقل أو عليها عروض:',
            msa: '\n\nإليك بعض الخيارات المتاحة بأسعار أقل أو ضمن العروض:',
            en: '\n\nHere are some lower-priced or discounted options available right now:'
          })
        : localizeText(lang, {
            eg: '\n\nدي بدائل حقيقية متوفرة بالمخزون بأسعار أقل:',
            msa: '\n\nإليك بدائل فعلية متوفرة بالمخزون بأسعار أقل:',
            en: '\n\nHere are verified in-stock alternatives at lower prices:'
          });
      const askBudget = localizeText(lang, {
        eg: '\n\nلو في ميزانية معينة في بالك قولي عليها وأنا أرشحلك الأنسب ❤️',
        msa: '\n\nإذا كانت لديك ميزانية محددة فأخبرني لأرشح لك الأنسب ❤️',
        en: '\n\nFeel free to tell me your preferred budget and I’ll narrow it down ❤️'
      });

      return {
        text: prefixBanner + comfortOpen + `${altHeader}\n${listTxt}` + askBudget,
        products: altItems.map(item => toProductCard(item.product)),
        alternatives: altItems.map(toRecommendationCard),
        suggestions: buildSuggestions(ctx, lang),
        canEscalate: true,
        lang,
        intent: 'price_objection'
      };
    }

    return {
      text: prefixBanner + comfortOpen,
      suggestions: buildSuggestions(ctx, lang),
      canEscalate: true,
      lang,
      intent: 'price_objection'
    };
  }

  // 10. Customer Hesitation / Indecision ("متردد" / "هفكر" / "not sure") — Empathetic, Zero Pressure
  const isHesitating = /(متردد|مش متاكد|هفكر|بفكر|لسه محتار|خايف|قلقان|ممكن بعدين|مش قادر اقرر|hesitat|not sure|think about it|undecided|worried)/.test(queryNorm);
  if (isHesitating) {
    return {
      text: prefixBanner + localizeText(lang, {
        eg: 'خد وقتك براحتك خالص يا فندم، مفيش أي استعجال ❤️.\nلو فيه نقطة محيراك—زي السعر أو المواصفات أو موضوع الشحن وضمان الـ 14 يوم—قولي عليها وأنا أوضحهالك بكل صراحة عشان تاخد قرارك وأنت مطمن.',
        msa: 'خذ وقتك كاملاً يا فندم ولا داعي للاستعجال ❤️.\nإذا كان هناك أمر يشغلك بخصوص السعر أو المواصفات أو ضمان الاستبدال خلال 14 يوماً، فأخبرني به لأوضحه لك بكل شفافية حتى تختار وأنت مطمئن.',
        en: 'Take all the time you need—there’s zero rush ❤️.\nIf anything is making you hesitate—whether it’s the price, specs, shipping, or our 14-day manufacturing defect guarantee—just let me know and I’ll clarify honestly so you can decide comfortably.'
      }),
      suggestions: buildSuggestions(ctx, lang),
      canEscalate: true,
      lang,
      intent: 'hesitation'
    };
  }

  const noAvailableBrandConflict = !(preSearch.brandMention && preSearch.brandProductCount === 0);

  // 10b. Real Product Comparison ("قارن بين X و Y" / "الفرق بين ..." / "compare X vs Y")
  const isComparisonQuery = /(قارن|مقارنه|الفرق بين|ايه الفرق|ما الفرق|ايهما افضل|انهي احسن|vs\.?|versus|compare|difference between)/.test(queryNorm);
  if (isComparisonQuery && noAvailableBrandConflict) {
    const comparePair = resolveComparisonTargets(rawText, queryNorm, preSearch, convState, ctx);
    if (comparePair.length >= 2) {
      return {
        text: prefixBanner + formatComparisonReply(comparePair, lang),
        products: comparePair.map(toProductCard),
        suggestions: buildSuggestions(ctx, lang),
        canEscalate: true,
        lang,
        intent: 'product_comparison'
      };
    }
    if (comparePair.length === 1) {
      const single = comparePair[0];
      return {
        text: prefixBanner + localizeText(lang, {
          eg: `لقيت منتج واحد مطابق للمقارنة وهو:\n\n${formatProductDetailsBlock(single, lang)}\n\nوالمنتج التاني مش ظاهر في بيانات المتجر أو محتاج توضحلي اسمه علشان أقارنلك بينهم بدقة 😊`,
          msa: `توفر لدي منتج واحد مطابق للمقارنة وهو:\n\n${formatProductDetailsBlock(single, lang)}\n\nأما المنتج الثاني فلم أجد له تطابقاً مؤكداً في بيانات المتجر؛ يرجى تحديد اسمه لإتمام المقارنة بدقة 😊`,
          en: `I found one matching product for comparison:\n\n${formatProductDetailsBlock(single, lang)}\n\nI couldn’t find the second item in our store catalog—please share its exact name to compare them accurately 😊`
        }),
        products: [toProductCard(single)],
        suggestions: buildSuggestions(ctx, lang),
        canEscalate: true,
        lang,
        intent: 'product_comparison'
      };
    }
  }

  // 10c. Direct Compatibility Check ("هل X متوافق مع Y؟" / "يركب مع ...؟")
  const isCompatCheckQuery = /(متوافق|يتوافق|ينفع مع|يركب مع|يركب علي|يشتغل مع|يمشي مع|يشحن.*مع|compatible with|work with|works with|fit with)/.test(queryNorm);
  if (isCompatCheckQuery && noAvailableBrandConflict) {
    let pair = resolveComparisonTargets(rawText, queryNorm, preSearch, convState, ctx);
    if (pair.length === 1 && convState.recentShownProducts.length > 0 && String(pair[0].id) !== String(convState.recentShownProducts[0].id)) {
      pair = [convState.recentShownProducts[0], pair[0]];
    }
    if (pair.length >= 2) {
      const check = checkCompatibilityBetween(pair[0], pair[1], lang);
      const statusLead = check.compatible
        ? localizeText(lang, {
            eg: `أيوه يا فندم، يثبت من بيانات المتجر أن **${pair[0].title}** و**${pair[1].title}** متوافقان ✅:`,
            msa: `نعم، يثبت من المواصفات المسجلة في المتجر توافق **${pair[0].title}** مع **${pair[1].title}** ✅:`,
            en: `Yes, store specs confirm compatibility between **${pair[0].title}** and **${pair[1].title}** ✅:`
          })
        : localizeText(lang, {
            eg: `خليني أكون صريح معاك يا فندم: لا يمكن تأكيد التوافق بين **${pair[0].title}** و**${pair[1].title}** ⚠️:`,
            msa: `بكل شفافية: لا يوجد ما يثبت التوافق المؤكد بين **${pair[0].title}** و**${pair[1].title}** ⚠️:`,
            en: `To be completely transparent: compatibility cannot be confirmed between **${pair[0].title}** and **${pair[1].title}** ⚠️:`
          });
      return {
        text: prefixBanner + `${statusLead}\n\n${check.explanation}`,
        products: pair.slice(0, 2).map(toProductCard),
        suggestions: buildSuggestions(ctx, lang),
        canEscalate: true,
        lang,
        intent: 'compatibility_check'
      };
    }
  }

  // 10d. Direct Complementary Add-ons Inquiry ("إيه المنتجات المكملة لـ X؟" / "محتاج حاجة مع ...")
  const asksComplementary = /((?:ال)?منتج(?:ات)?\s*(?:ال)?مكمل(?:ه|ات)?|(?:ال)?مكملات|مكمل\s*ل|(?:ال)?ملحق(?:ات)?|(?:ال)?اكسسوارات|حاجه معاه|يمشي معاه|يناسب معاه|complementary|add-?ons?|accessories for|goes with)/.test(queryNorm);
  if (asksComplementary && !preSearch.isAmbiguous && noAvailableBrandConflict) {
    const addonTargets = resolveQueryTargets(preSearch, convState, queryNorm);
    if (addonTargets.length > 0) {
      const base = addonTargets[0];
      const addons = findComplementaryProducts(base, ctx, {
        maxPrice: convState.rememberedBudget,
        excludeIds: new Set([String(base.id)]),
        limit: 2,
        lang
      });
      if (addons.length > 0) {
        return {
          text: prefixBanner + localizeText(lang, {
            eg: `بالنسبة لـ **${base.title}** (${base.price} ج.م)، دي المنتجات المكملة اللي بياناتها بتثبت توافقها معاه ومتوفرة بالمخزون:`,
            msa: `بالنسبة لمنتج **${base.title}** (${base.price} ج.م)، إليك المنتجات المكملة التي تثبت بياناتها توافقها معه وتتوفر بالمخزون:`,
            en: `For **${base.title}** (${base.price} EGP), here are verified compatible add-ons currently in stock:`
          }) + formatAddonsSection(addons, lang),
          products: [toProductCard(base)],
          complementary: addons.map(toRecommendationCard),
          suggestions: buildSuggestions(ctx, lang),
          canEscalate: true,
          lang,
          intent: 'complementary_inquiry'
        };
      }
      return {
        text: prefixBanner + localizeText(lang, {
          eg: `بالنسبة لـ **${base.title}** (${base.price} ج.م)، بحثت في المخزون المتاح ومفيش حالياً منتج مكمل مثبت التوافق مع مواصفاته أقدر أرشحهلك بأمان.`,
          msa: `بالنسبة لمنتج **${base.title}** (${base.price} ج.م)، لا تتوفر حالياً منتجات مكملة تثبت بيانات المتجر توافقها معه في المخزون المتاح.`,
          en: `For **${base.title}** (${base.price} EGP), there are currently no in-stock add-on products with verified compatibility in store specs.`
        }),
        products: [toProductCard(base)],
        complementary: [],
        suggestions: buildSuggestions(ctx, lang),
        canEscalate: true,
        lang,
        intent: 'complementary_inquiry'
      };
    }
  }

  // 11. Quality & Specs Inquiry (supports direct product mention or context, with full truthful details & warranty + proven complementary add-ons)
  const asksQualityOrSpecs = /(الجوده|جوده عاليه|جوده|ممتاز|عملي|خامه|خامته|مواصفاته|المواصفات|مواصفات|وصفه|وصف|اصلي|كويس ولا|يستاهل|صور|صوره|الصور|ماركه|الماركه|quality|specs|specifications|description|durable|reliable|images?|photos?)/.test(queryNorm);
  const specTargets = asksQualityOrSpecs ? resolveQueryTargets(preSearch, convState, queryNorm) : [];
  if (asksQualityOrSpecs && specTargets.length > 0 && !preSearch.isAmbiguous && noAvailableBrandConflict) {
    const shownTargets = specTargets.slice(0, 2);
    const details = shownTargets.map(p => formatProductDetailsBlock(p, lang)).join('\n\n');
    const inStockShown = shownTargets.filter(p => p.stock > 0);
    const addons = inStockShown.length === 1
      ? findComplementaryProducts(inStockShown[0], ctx, {
          maxPrice: convState.rememberedBudget,
          excludeIds: new Set(shownTargets.map(p => String(p.id))),
          limit: 2,
          lang
        })
      : [];

    return {
      text: prefixBanner + localizeText(lang, {
        eg: `بالنسبة للمواصفات والتفاصيل الفعلية المسجلة عندنا يا فندم:\n\n${details}\n\nوكمان معاك **ضمان استبدال 14 يوم** في حالة أي عيب صناعة، ولو تحب تسأل عن تفصيلة تانية قولي 😊`,
        msa: `إليك المواصفات الفعلية المسجلة لهذه المنتجات بكل شفافية:\n\n${details}\n\nكما يشمل الطلب ضمان استبدال خلال 14 يوماً في حالة عيب الصناعة 😊`,
        en: `Here are the actual recorded specifications and details in our store:\n\n${details}\n\nEvery purchase is also backed by our **14-day return/exchange warranty for manufacturing defects** 😊`
      }) + formatAddonsSection(addons, lang),
      products: shownTargets.map(toProductCard),
      complementary: addons.map(toRecommendationCard),
      suggestions: buildSuggestions(ctx, lang),
      canEscalate: true,
      lang,
      intent: 'quality_specs'
    };
  }

  // 12. Vague / General Needs Exploration ("عايز حاجة حلوة" / "want something nice")
  const isVagueDesire = /(عايز حاجه حلوه|حاجه حلوه|محتاج حاجه كويسه|مش عارف اختار|رشحلي حاجه|عايز اشتري|ارغب في اختيار|ارغب في شراء|شيء جميل|شيء مناسب|منتج جيد|منتج مناسب|هديه حلوه|something nice|something good|help me choose|not sure what to buy)/.test(queryNorm);
  if (isVagueDesire && preSearch.topScore < 14) {
    // Remember context! Do NOT repeat the exact same question if budget/category already given
    if (convState.rememberedBudget && !convState.botWasAskingDiscovery) {
      const picks = findMatchingProducts(convState.rememberedTopic || '', ctx, {
        preferCategoryId: convState.rememberedCategoryId,
        overrideMaxPrice: convState.rememberedBudget,
        limit: 3
      }).matches;
      if (picks.length > 0) {
        const listTxt = picks.map(p => formatProductLine(p, lang)).join('\n');
        return {
          text: prefixBanner + localizeText(lang, {
            eg: `على حسب الميزانية اللي ذكرتها (لحد ${convState.rememberedBudget} ج.م)، دي ترشيحات حلوة ومناسبة دلوقتي ❤️:\n\n${listTxt}`,
            msa: `بناءً على الميزانية التي ذكرتها (حتى ${convState.rememberedBudget} ج.م)، إليك ترشيحات مناسبة ❤️:\n\n${listTxt}`,
            en: `Based on the budget you mentioned (up to ${convState.rememberedBudget} EGP), here are some nice options ❤️:\n\n${listTxt}`
          }),
          products: picks.map(toProductCard),
          suggestions: buildSuggestions(ctx, lang),
          canEscalate: true,
          lang,
          intent: 'budget_recommendations'
        };
      }
    }

    return {
      text: prefixBanner + localizeText(lang, {
        eg: 'من عيوني! ❤️ تحب تدور على منتج معين ولا تحب أساعدك تختار حاجة مناسبة لاحتياجك وميزانيتك؟',
        msa: 'بكل سرور! ❤️ هل تبحث عن منتج محدد أم تفضل أن أساعدك في اختيار ما يناسب احتياجك وميزانيتك؟',
        en: 'With pleasure! ❤️ Are you looking for a specific product, or would you like me to help you choose something suited to your needs and budget?'
      }),
      suggestions: buildSuggestions(ctx, lang),
      canEscalate: true,
      lang,
      intent: 'needs_discovery'
    };
  }

  // 13. Complex Order Issues / Cancellations / Damaged Items -> Gentle Empathy + Escalation Offer
  const complexOrderIssue = /(الغي|الغاء|الطلب اتاخر|ماتسلمش|ماوصلش|مكسور|بايظ|مش شغال|غلط في الطلب|سحب مرتين|خصم مرتين|تعديل العنوان|مشكله في الطلب|مشكله في الدفع|شكوي|damaged|broken|not delivered|late order|cancel my order|wrong item|refund)/.test(queryNorm);
  if (complexOrderIssue) {
    return {
      text: prefixBanner + localizeText(lang, {
        eg: 'آسف جداً إنك واجهت الموقف ده يا فندم 🙏. علشان نراجع تفاصيل الطلب صح ونساعدك فوراً (بدون أي تعطيل)، الأفضل أحولك دلوقتي لموظف من خدمة العملاء يتابع معاك شخصياً.\n\nتحب أحولك لموظف دلوقتي؟',
        msa: 'أعتذر لك جداً عن هذه التجربة 🙏. لضمان مراجعة حالة الطلب والتصرف بسرعة ودقة، يفضل أن أحولك مباشرة إلى أحد موظفي خدمة العملاء لمتابعة الأمر معك.\n\nهل تود أن أحولك لموظف الآن؟',
        en: 'I’m really sorry you ran into that 🙏. To get this sorted out accurately and quickly for you, the best step is connecting you directly with one of our human support agents.\n\nWould you like me to transfer you now?'
      }),
      escalationSuggested: true,
      canEscalate: true,
      lang,
      suggestions: [lang === 'en' ? 'Yes, connect me to an agent' : 'نعم، حولني لموظف الآن'],
      intent: 'complex_issue'
    };
  }

  // 14. Rich Contextual Follow-ups: Color Variants, Cheapest, Stronger Specs, Next Alternatives & Details
  const hasPreviousProducts = convState.recentShownProducts.length > 0;

  // 14a. Color, Size & Variants Inquiry (supports direct product name or conversation context)
  const asksColorsOrSizes = /(لون|الوان|لون تاني|الوان تانيه|متاح لون|في الوان|هل يوجد لون|لون اخر|الوان اخري|مقاس|مقاسات|احجام|حجم|خيارات|other color|other colors|another color|available colors|what colors|size|sizes|variants|options)/.test(queryNorm);
  if (asksColorsOrSizes && noAvailableBrandConflict) {
    const varTargets = resolveQueryTargets(preSearch, convState, queryNorm);
    const mentionedMissing = preSearch.matches.length === 0 && (preSearch.hasKeywords || Boolean(preSearch.brandMention));

    if (!mentionedMissing && varTargets.length === 0) {
      return {
        text: prefixBanner + localizeText(lang, {
          eg: 'حاضر يا فندم 😊 تقصد الألوان والمقاسات المتاحة لأي منتج بالظبط؟ قولي اسمه وأنا أشوفلك بياناته المسجلة فوراً.',
          msa: 'بكل سرور 😊 ما اسم المنتج الذي تود معرفة الألوان أو المقاسات المتاحة له؟',
          en: 'Happy to check 😊 Which product are you asking about? Share its name and I’ll check its recorded colors and sizes right away.'
        }),
        suggestions: buildSuggestions(ctx, lang),
        canEscalate: true,
        lang,
        intent: 'clarification_needed'
      };
    }

    if (varTargets.length > 0) {
      const ref = varTargets[0];
      const validVars = (ref.variations || []).filter(v => v && Array.isArray(v.values) && v.values.length > 0);
      if (validVars.length > 0) {
        const varText = validVars.map(v => `• **${v.name}:** ${v.values.join('، ')}`).join('\n');
        const hasColorVar = validVars.some(v => /(لون|الوان|color)/i.test(v.name || ''));
        const hasSizeVar = validVars.some(v => /(مقاس|حجم|size)/i.test(v.name || ''));
        const missingNote = (!hasColorVar || !hasSizeVar)
          ? localizeText(lang, {
              eg: `\n(${!hasColorVar ? 'الألوان غير مسجلة منفصلة' : ''}${!hasColorVar && !hasSizeVar ? '، ' : ''}${!hasSizeVar ? 'لا توجد مقاسات مسجلة لهذا المنتج' : ''})`,
              msa: `\n(ملاحظة: ${!hasColorVar ? 'لا توجد ألوان منفصلة مسجلة' : ''}${!hasColorVar && !hasSizeVar ? '، ' : ''}${!hasSizeVar ? 'لا توجد مقاسات مسجلة' : ''})`,
              en: `\n(Note: ${!hasColorVar ? 'no separate color options listed' : ''}${!hasColorVar && !hasSizeVar ? ', ' : ''}${!hasSizeVar ? 'no size options listed' : ''})`
            })
          : '';
        return {
          text: prefixBanner + localizeText(lang, {
            eg: `بالنسبة لـ **${ref.title}**، دي الخيارات المسجلة حالياً في صفحة المنتج 🎨:\n\n${varText}${missingNote}`,
            msa: `الخيارات المسجلة لـ **${ref.title}** حالياً هي 🎨:\n\n${varText}${missingNote}`,
            en: `For **${ref.title}**, the currently listed options are 🎨:\n\n${varText}${missingNote}`
          }),
          products: [toProductCard(ref)],
          suggestions: buildSuggestions(ctx, lang),
          canEscalate: true,
          lang,
          intent: 'color_inquiry'
        };
      }

      const isPureColorQuestion = /(لون|الوان|color)/i.test(queryNorm) && !/(مقاس|مقاسات|احجام|size)/i.test(queryNorm);
      const altSearch = (convState.rememberedTopic || ref.categoryId)
        ? findMatchingProducts(convState.rememberedTopic || '', ctx, {
            excludeIds: new Set([String(ref.id)]),
            preferCategoryId: ref.categoryId,
            allowCategoryOnly: !convState.rememberedTopic,
            limit: 2
          }).matches.filter(p => p.stock > 0)
        : [];

      const altLine = isPureColorQuestion && altSearch.length > 0
        ? `\n\n${localizeText(lang, {
            eg: 'ودي موديلات تانية قريبة ممكن تعجبك لو تحب تشوفها:',
            msa: 'وهذه خيارات بديلة قريبة قد تناسبك:',
            en: 'Here are other similar models you might like:'
          })}\n${altSearch.map(p => formatProductLine(p, lang)).join('\n')}`
        : '';

      return {
        text: prefixBanner + localizeText(lang, {
          eg: `المنتج **${ref.title}** معروض في المتجر بالإصدار ده فقط حالياً ومفيش ألوان تانية أو مقاسات إضافية مسجلة في صفحته.${altLine}\n\nلو تحب أتأكدلك من خدمة العملاء لو في خيارات أخرى متاحة، تحب أحولك لموظف؟`,
          msa: `المنتج **${ref.title}** متاح في المتجر بالإصدار المعروض فقط ولا توجد ألوان إضافية أو مقاسات مسجلة في بياناته حالياً.${altLine}`,
          en: `**${ref.title}** is currently listed in this standard edition only, with no color or size variants recorded in store data.${altLine}`
        }),
        products: isPureColorQuestion && altSearch.length > 0 ? altSearch.map(toProductCard) : [toProductCard(ref)],
        escalationSuggested: altSearch.length === 0 || !isPureColorQuestion,
        canEscalate: true,
        lang,
        suggestions: buildSuggestions(ctx, lang),
        intent: 'color_inquiry'
      };
    }
  }

  // 14b. Cheapest in Context ("هات الأرخص" / "cheapest one")
  const asksCheapestContext = /(هات الارخص|الارخص|ارخص واحد|ارخص حاجه|اريد الارخص|اختر لي الارخص|اقلهم سعرا|give me the cheapest|cheapest one|lowest price|most affordable)/.test(queryNorm);
  if (asksCheapestContext && (!preSearch.hasKeywords || preSearch.topScore < 20)) {
    const cheapResult = (convState.rememberedTopic || convState.rememberedCategoryId)
      ? findMatchingProducts(convState.rememberedTopic || '', ctx, {
          preferCategoryId: convState.rememberedCategoryId,
          allowCategoryOnly: !convState.rememberedTopic,
          overrideSortMode: 'cheapest',
          limit: 3
        }).matches
      : findMatchingProducts('', ctx, { overrideSortMode: 'cheapest', limit: 3 }).matches;

    if (cheapResult.length > 0) {
      const listTxt = cheapResult.map(p => formatProductLine(p, lang)).join('\n');
      return {
        text: prefixBanner + localizeText(lang, {
          eg: `دي أرخص الاختيارات المتوفرة عندنا حالياً ومرتبة من الأقل سعراً ❤️:\n\n${listTxt}`,
          msa: `إليك أقل الخيارات سعراً والمتوفرة حالياً لدينا ❤️:\n\n${listTxt}`,
          en: `Here are our lowest-priced available options right now, sorted from lowest first ❤️:\n\n${listTxt}`
        }),
        products: cheapResult.map(toProductCard),
        suggestions: buildSuggestions(ctx, lang),
        canEscalate: true,
        lang,
        intent: 'cheapest_followup'
      };
    }
  }

  // 14c. Stronger / Higher-Spec in Context ("عايز حاجة أقوى" / "something stronger")
  const asksStrongerContext = /(عايز حاجه اقوي|حاجه اقوي|في اقوي|اقوي شويه|اعلي شويه|مواصفات اعلي|مواصفات اقوي|نسخه اقوي|موديل اعلي|اقوي منه|احسن منه|اريد خيارا اقوي|اقوي فيهم|stronger|more powerful|higher spec|better specs|more capacity)/.test(queryNorm);
  if (asksStrongerContext && (!preSearch.hasKeywords || preSearch.topScore < 20)) {
    const upgrade = findStrongerAlternatives(convState.recentShownProducts, convState.rememberedTopic, ctx);
    if (!upgrade.ref && !convState.rememberedTopic) {
      return {
        text: prefixBanner + localizeText(lang, {
          eg: 'حاضر يا فندم 😊 تقصد حاجة أقوى في أي نوع من المنتجات (زي الباور بانك، الشواحن، السماعات، ولا الهاردات)؟',
          msa: 'بكل سرور 😊 في أي فئة من المنتجات تبحث عن خيار أقوى (مثل: الباور بانك، الشواحن، أو السماعات)؟',
          en: 'Happy to help 😊 Which product category are you looking to upgrade in (e.g., power banks, chargers, headphones, or storage)?'
        }),
        suggestions: buildSuggestions(ctx, lang),
        canEscalate: true,
        lang,
        intent: 'clarification_needed'
      };
    }

    if (upgrade.matches.length > 0) {
      const listTxt = upgrade.matches.map(p => formatProductLine(p, lang)).join('\n');
      return {
        text: prefixBanner + localizeText(lang, {
          eg: `لو بتدور على مواصفات أو قدرة أعلى، دي أقوى الاختيارات المتوفرة عندنا دلوقتي 💪:\n\n${listTxt}`,
          msa: `إذا كنت تبحث عن مواصفات أو قدرة أعلى، فإليك أقوى الخيارات المتاحة حالياً 💪:\n\n${listTxt}`,
          en: `If you want higher specs or power, here are stronger options currently in stock 💪:\n\n${listTxt}`
        }),
        products: upgrade.matches.map(toProductCard),
        suggestions: buildSuggestions(ctx, lang),
        canEscalate: true,
        lang,
        intent: 'stronger_followup'
      };
    }

    if (upgrade.isAlreadyTop && upgrade.ref) {
      return {
        text: prefixBanner + localizeText(lang, {
          eg: `بالنسبة للفئة دي، المنتج **${upgrade.ref.title}** (${upgrade.ref.price} ج.م) هو بالفعل أعلى قدرة/مواصفة متوفرة عندنا حالياً.`,
          msa: `في هذه الفئة تحديداً، يُعد **${upgrade.ref.title}** (${upgrade.ref.price} ج.م) أعلى خيار متوفر لدينا حالياً.`,
          en: `In this specific category, **${upgrade.ref.title}** (${upgrade.ref.price} EGP) is already our highest-spec model currently in stock.`
        }),
        products: [toProductCard(upgrade.ref)],
        suggestions: buildSuggestions(ctx, lang),
        canEscalate: true,
        lang,
        intent: 'stronger_followup'
      };
    }
  }

  // 14d. Direct or Contextual Stock/Quantity & Price/Discount Detail Inquiries
  const asksStockOrQty = /(كام قطعه|كم قطعه|كام حته|الكميه|كميه|المخزون|مخزون|متاح كام|متوفر كام|باقي كام|متبقي كام|حاله التوفر|متاح ولا|متوفر ولا|هل متاح|هل متوفر|in stock|stock level|how many|quantity|availability)/.test(queryNorm);
  const asksDiscountBreakdown = /(قبل الخصم|بعد الخصم|نسبه الخصم|الخصم كام|كام خصم|مقدار الخصم|توفر كام|بتوفر كام|السعر الاصلي|قبل وبعد|before discount|after discount|discount percent|original price|how much off)/.test(queryNorm);
  const asksDirectPriceOnly =
    !preSearch.priceFilter.maxPrice &&
    !preSearch.priceFilter.minPrice &&
    !preSearch.priceFilter.sortMode &&
    /(?:^|\s)(?:كم\s+سعر|كام\s+سعر|ما\s+سعر|سعره|سعرها|بكام|سعر|تمن|تمنه|price|how much|cost)(?=\s|$)/.test(queryNorm);

  if ((asksStockOrQty || asksDiscountBreakdown || asksDirectPriceOnly) && !preSearch.isAmbiguous && noAvailableBrandConflict) {
    const detailTargets = resolveQueryTargets(preSearch, convState, queryNorm);
    if (detailTargets.length > 0) {
      if (asksStockOrQty && !asksDiscountBreakdown && !asksDirectPriceOnly) {
        const stockLines = detailTargets.map(p => {
          const unit = p.saleUnit || (lang === 'en' ? 'pcs' : 'قطعة');
          if (p.stock > 0) {
            return lang === 'en'
              ? `• **${p.title}**: Currently in stock — **${p.stock} ${unit}** available (${p.price} EGP)`
              : `• **${p.title}**: متوفر حالياً بالمخزون — الكمية المتاحة: **${p.stock} ${unit}** (السعر: ${p.price} ج.م)`;
          }
          return lang === 'en'
            ? `• **${p.title}**: Currently **out of stock** (Recorded quantity: **0**) and cannot be ordered right now (Listed price: ${p.price} EGP)`
            : `• **${p.title}**: **غير متوفر حالياً بالمخزون** (الكمية المسجلة: **0 ${unit}**) ولا يُعتبر متاحاً للطلب الآن (السعر المسجل: ${p.price} ج.م)`;
        }).join('\n');

        const allZero = detailTargets.every(p => p.stock <= 0);
        const firstRef = detailTargets[0];
        const inStockAlts = allZero
          ? ctx.products.filter(p => p.stock > 0 && p.categoryId === firstRef.categoryId && !detailTargets.some(d => String(d.id) === String(p.id))).slice(0, 2)
          : [];
        const altBlock = inStockAlts.length > 0
          ? `\n\n${localizeText(lang, {
              eg: 'دي بدائل متوفرة حالياً في نفس القسم:',
              msa: 'وهذه بدائل متوفرة حالياً في القسم نفسه:',
              en: 'Here are currently in-stock alternatives in the same category:'
            })}\n${inStockAlts.map(p => formatProductLine(p, lang)).join('\n')}`
          : '';

        return {
          text: prefixBanner + stockLines + altBlock,
          products: detailTargets.map(toProductCard),
          escalationSuggested: allZero,
          suggestions: buildSuggestions(ctx, lang),
          canEscalate: true,
          lang,
          intent: allZero ? 'product_out_of_stock' : 'stock_inquiry'
        };
      }

      const priceLines = detailTargets.map(p => {
        const unit = p.saleUnit || (lang === 'en' ? 'pcs' : 'قطعة');
        const stockNote = p.stock > 0
          ? (lang === 'en' ? `In stock: ${p.stock} ${unit}` : `متوفر بالمخزون (${p.stock} ${unit})`)
          : (lang === 'en' ? 'Out of stock (0 available)' : 'غير متوفر حالياً بالمخزون (0)');
        if (lang === 'en') {
          const discInfo = p.compareAtPrice
            ? `Current price: **${p.price} EGP** | Before discount: **${p.compareAtPrice} EGP** | Discount: **${p.discountPercent}%** (Save **${p.savingsAmount} EGP**)`
            : `Current price: **${p.price} EGP** (No discount is currently recorded for this product)`;
          return `• **${p.title}**\n  ${discInfo}\n  Availability: ${stockNote}`;
        }
        const discInfo = p.compareAtPrice
          ? `السعر الحالي: **${p.price} ج.م** | السعر قبل الخصم: **${p.compareAtPrice} ج.م** | نسبة الخصم: **${p.discountPercent}%** (توفر **${p.savingsAmount} ج.م**)`
          : `السعر الحالي: **${p.price} ج.م** (لا يوجد خصم مسجل حالياً في بيانات هذا المنتج)`;
        return `• **${p.title}**\n  ${discInfo}\n  التوفر والكمية: ${stockNote}`;
      }).join('\n\n');

      return {
        text: prefixBanner + localizeText(lang, {
          eg: `دي بيانات السعر والخصم الفعلية المسجلة في المتجر:\n\n${priceLines}`,
          msa: `إليك تفاصيل السعر والخصم الفعلية المسجلة بالمتجر:\n\n${priceLines}`,
          en: `Here are the exact recorded price and discount details:\n\n${priceLines}`
        }),
        products: detailTargets.map(toProductCard),
        suggestions: buildSuggestions(ctx, lang),
        canEscalate: true,
        lang,
        intent: 'price_discount_inquiry'
      };
    }
  }

  const isProductFollowUp =
    hasPreviousProducts &&
    preSearch.topScore < 15 &&
    !(preSearch.concreteTokens && preSearch.concreteTokens.length > 0) &&
    /(الاول|التاني|الثاني|التالت|الثالث|سعره|بكام|عليه خصم|خصم كام|متاح|شحن مجاني|تفاصيل اكتر|غيره|تاني|حاجات تانيه|بديل|مشابه|اقل سعر|اوفر|first one|second one|another|other options|more details|discount|in stock)/.test(queryNorm);

  if (isProductFollowUp) {
    if (/(غيره|تاني|حاجات تانيه|بديل|مشابه|another|other options)/.test(queryNorm)) {
      const altRes = findSmartAlternatives(convState.rememberedTopic || (convState.recentShownProducts[0]?.title || ''), ctx, {
        maxPrice: convState.rememberedBudget,
        excludeIds: convState.seenIds,
        preferCategoryId: convState.rememberedCategoryId,
        limit: 3,
        lang
      });
      if (altRes.alternatives.length > 0) {
        return {
          text: prefixBanner + localizeText(lang, {
            eg: 'حاضر يا فندم، دي بدائل متوفرة حالياً بالمخزون مع سبب ترشيح كل منها:',
            msa: 'بكل سرور، إليك بدائل أخرى متوفرة حالياً بالمخزون مع سبب اختيار كل بديل:',
            en: 'Sure! Here are verified in-stock alternatives with why each fits:'
          }) + formatAlternativesSection(altRes.alternatives, lang),
          products: altRes.alternatives.map(a => toProductCard(a.product)),
          alternatives: altRes.alternatives.map(toRecommendationCard),
          suggestions: buildSuggestions(ctx, lang),
          canEscalate: true,
          lang,
          intent: 'product_alternatives'
        };
      }
      return {
        text: prefixBanner + localizeText(lang, {
          eg: 'بحثت في المخزون المتاح حالياً ومفيش بديل مناسب مختلف عن اللي اتعرض لحضرتك في نفس الفئة/الميزانية دلوقتي 😔 تحب أوصلك بموظف خدمة العملاء؟',
          msa: 'بحثت في المخزون المتاح حالياً ولا يتوفر بديل مناسب آخر ضمن الفئة أو الميزانية نفسها في الوقت الحالي 😔 هل تود التحدث مع موظف خدمة العملاء؟',
          en: 'I checked our current in-stock inventory and don’t see another suitable same-type alternative matching your criteria right now 😔 Would you like to speak with an agent?'
        }),
        products: [],
        alternatives: [],
        escalationSuggested: true,
        suggestions: buildSuggestions(ctx, lang),
        canEscalate: true,
        lang,
        intent: 'product_alternatives'
      };
    }

    let targetProducts = convState.recentShownProducts.slice(0, 3);
    if (/(الاول|first one)/.test(queryNorm)) targetProducts = [convState.recentShownProducts[0]];
    else if (/(التاني|الثاني|second one)/.test(queryNorm) && convState.recentShownProducts[1]) targetProducts = [convState.recentShownProducts[1]];
    else if (/(التالت|الثالث)/.test(queryNorm) && convState.recentShownProducts[2]) targetProducts = [convState.recentShownProducts[2]];

    const details = targetProducts.map(p => formatProductDetailsBlock(p, lang)).join('\n\n');
    const inStockFocus = targetProducts.filter(p => p.stock > 0);
    const addons = inStockFocus.length === 1
      ? findComplementaryProducts(inStockFocus[0], ctx, {
          maxPrice: convState.rememberedBudget,
          excludeIds: new Set(targetProducts.map(p => String(p.id))),
          limit: 2,
          lang
        })
      : [];

    return {
      text: prefixBanner + localizeText(lang, {
        eg: `طبعاً يا فندم! دي البيانات والتفاصيل الفعلية المسجلة:\n\n${details}`,
        msa: `بكل تأكيد! إليك البيانات والأسعار الفعلية المسجلة:\n\n${details}`,
        en: `Of course! Here are the exact recorded details and prices:\n\n${details}`
      }) + formatAddonsSection(addons, lang),
      products: targetProducts.map(toProductCard),
      complementary: addons.map(toRecommendationCard),
      suggestions: buildSuggestions(ctx, lang),
      canEscalate: true,
      lang,
      intent: 'product_followup'
    };
  }

  // 15. Current Offers & Sales Banners
  const asksOffers = /(عروض|عرض|خصومات|تخفيضات|سيل|عروض اليوم|افضل سعر|sale|offer|offers|deal|deals|discounts)/.test(queryNorm);
  if (asksOffers && preSearch.topScore < 20) {
    const offers = getBestOffers(ctx, 4, convState.rememberedBudget);
    const activeBanner = ctx.banners[0];
    if (offers.length > 0) {
      const headerTxt = activeBanner && lang !== 'en'
        ? `🔥 **${activeBanner.title}** — ${activeBanner.badgeText || activeBanner.subtitle || ''}\n\n`
        : localizeText(lang, {
            eg: 'أقوى العروض والخصومات الموجودة دلوقتي في سوقي ستور 🔥:\n\n',
            msa: 'أبرز العروض والخصومات المتاحة حالياً في سوقي ستور 🔥:\n\n',
            en: 'Here are our top discounted offers right now at SOUQI STORE 🔥:\n\n'
          });
      const listTxt = offers.map(p => formatProductLine(p, lang)).join('\n');
      return {
        text: prefixBanner + headerTxt + listTxt,
        products: offers.map(toProductCard),
        suggestions: buildSuggestions(ctx, lang),
        canEscalate: true,
        lang,
        intent: 'offers'
      };
    }
  }

  // 16. Order Status / Tracking
  const orderCodeMatch = rawText.match(/suki-\d+/i);
  const asksOrderStatus = Boolean(orderCodeMatch) || /(طلبي|طلباتي|اوردري|اوردر|تتبع|وصل فين|حاله الطلب|order|track)/.test(queryNorm);
  if (asksOrderStatus) {
    if (orderCodeMatch) {
      const codeUpper = orderCodeMatch[0].toUpperCase();
      const order = await db.orders.findOne(o => (o.orderNumber || '').toUpperCase() === codeUpper);
      if (order) {
        const lastStatus = order.statusHistory?.[order.statusHistory.length - 1]?.label || order.status;
        return {
          text: prefixBanner + localizeText(lang, {
            eg: `لقيت طلب حضرتك رقم **#${order.orderNumber}** 📦\n• الحالة الحالية: **${lastStatus}**\n• الإجمالي: **${order.grandTotal} ج.م**\n• الوجهة: ${order.shippingAddress?.governorate || ''} ${order.shippingAddress?.city ? '- ' + order.shippingAddress.city : ''}\n\nلو محتاج أي مساعدة إضافية فيه تحب أحولك لموظف؟`,
            msa: `وجدت طلبك رقم **#${order.orderNumber}** 📦\n• الحالة الحالية: **${lastStatus}**\n• الإجمالي: **${order.grandTotal} ج.م**\n\nهل تود التحدث مع موظف للمتابعة؟`,
            en: `I found your order **#${order.orderNumber}** 📦\n• Current status: **${lastStatus}**\n• Total: **${order.grandTotal} EGP**\n• Destination: ${order.shippingAddress?.governorate || ''}\n\nWould you like me to connect you with a support agent for any follow-up?`
          }),
          suggestions: buildSuggestions(ctx, lang),
          escalationSuggested: true,
          canEscalate: true,
          lang,
          intent: 'order_tracking'
        };
      }
      return {
        text: prefixBanner + localizeText(lang, {
          eg: `بحثت عن الطلب رقم **${codeUpper}** بس مش ظاهر عندي في السجلات يا فندم. تأكد من الرقم أو تحب أحولك لموظف يراجعلك؟`,
          msa: `بحثت عن الطلب رقم **${codeUpper}** ولم أجده في السجلات. يرجى التحقق من الرقم أو أستطيع تحويلك لموظف خدمة العملاء.`,
          en: `I checked for order **${codeUpper}**, but couldn’t find it in our records. Please double-check the number, or I can connect you with a support agent.`
        }),
        escalationSuggested: true,
        canEscalate: true,
        lang,
        suggestions: buildSuggestions(ctx, lang),
        intent: 'order_not_found'
      };
    }

    if (ctx.customerUser && ctx.customerOrders.length > 0) {
      const ordLines = ctx.customerOrders.slice(0, 3).map(o => {
        const st = o.statusHistory?.[o.statusHistory.length - 1]?.label || o.status;
        return `• **#${o.orderNumber}** — ${st} (${o.grandTotal} ${lang === 'en' ? 'EGP' : 'ج.م'})`;
      }).join('\n');
      return {
        text: prefixBanner + localizeText(lang, {
          eg: `دي أحدث طلبات حضرتك المسجلة على حسابك 📦:\n\n${ordLines}`,
          msa: `هذه أحدث طلباتك المسجلة على حسابك 📦:\n\n${ordLines}`,
          en: `Here are your most recent orders 📦:\n\n${ordLines}`
        }),
        suggestions: buildSuggestions(ctx, lang),
        canEscalate: true,
        lang,
        intent: 'order_list'
      };
    }

    return {
      text: prefixBanner + localizeText(lang, {
        eg: 'تقدر تتابع كل طلباتك بسهولة من صفحة "طلباتي" بعد تسجيل الدخول، أو ابعتلي رقم الطلب (زي SUKI-12345) وأجيبلك حالته فوراً 😊',
        msa: 'يمكنك متابعة طلباتك من صفحة "طلباتي" بعد تسجيل الدخول، أو تزويدي برقم الطلب (مثل SUKI-12345) لأعرض لك حالته فوراً 😊',
        en: 'You can track your orders anytime from "My Orders" after signing in, or share your order number here (e.g., SUKI-12345) and I’ll check it for you 😊'
      }),
      suggestions: buildSuggestions(ctx, lang),
      canEscalate: true,
      lang,
      intent: 'order_prompt'
    };
  }

  // 17. Shipping & Payment & Returns
  const matchedGov = EGYPT_GOVS.find(g => norm.includes(normalizeArabic(g)));
  if (matchedGov || /(شحن|توصيل|مصاريف الشحن|تكلفه الشحن|هيوصل امتي|shipping|delivery)/.test(queryNorm)) {
    const baseFee = Number(ctx.settings.shippingBaseFee) || 25;
    const freeCount = ctx.products.filter(p => p.isFreeShipping && p.stock > 0).length;
    return {
      text: prefixBanner + localizeText(lang, {
        eg: `${matchedGov ? `أكيد بنوصل لمحافظة **${matchedGov}** ولكل` : 'بنوصل لجميع'} محافظات مصر الـ 27 خلال 2 إلى 4 أيام عمل 🚚.\nمصاريف الشحن الأساسية تبدأ من **${baseFee} ج.م** وبتظهر بدقة في السلة حسب المحافظة${freeCount > 0 ? `، وكمان عندنا ${freeCount} منتج بشحن مجاني` : ''}.`,
        msa: `${matchedGov ? `نعم، نوصل إلى محافظة **${matchedGov}** وجميع` : 'نوصل إلى جميع'} محافظات مصر الـ 27 خلال 2 إلى 4 أيام عمل 🚚.\nتبدأ تكلفة الشحن الأساسية من **${baseFee} ج.م** وتظهر بدقة في السلة قبل التأكيد.`,
        en: `${matchedGov ? `Yes, we deliver to **${matchedGov}** and all` : 'We deliver across all'} 27 governorates in Egypt within 2–4 business days 🚚.\nBase shipping starts at **${baseFee} EGP** and adjusts accurately in your cart at checkout${freeCount > 0 ? `, plus ${freeCount} items currently include free shipping` : ''}.`
      }),
      suggestions: buildSuggestions(ctx, lang),
      canEscalate: true,
      lang,
      intent: 'shipping'
    };
  }

  if (/(دفع|كاش|فيزا|طرق الدفع|ادفع ازاي|payment|cod|cash on delivery|visa)/.test(queryNorm)) {
    return {
      text: prefixBanner + localizeText(lang, {
        eg: 'متاح طريقتين للدفع بكل أمان يا فندم 💳:\n1. كاش عند الاستلام.\n2. بالبطاقة البنكية أونلاين داخل صفحة إتمام الطلب.',
        msa: 'تتوفر طريقتان للدفع الآمن 💳:\n1. الدفع نقداً عند الاستلام.\n2. الدفع بالبطاقة البنكية عبر الإنترنت في صفحة إتمام الطلب.',
        en: 'We offer two secure payment options 💳:\n1. Cash on Delivery.\n2. Online Card Payment directly on the checkout page.'
      }),
      suggestions: buildSuggestions(ctx, lang),
      canEscalate: true,
      lang,
      intent: 'payment'
    };
  }

  if (/(استرجاع|استبدال|ارجاع|ضمان|عيب صناعه|return|warranty|exchange)/.test(queryNorm)) {
    return {
      text: prefixBanner + localizeText(lang, {
        eg: 'ضماننا الرسمي في سوقي ستور هو **استبدال خلال 14 يوم في حالة عيب الصناعة** 🛡️، وتقدر تقدم الطلب من صفحة طلباتك لو لا قدر الله ظهر أي عيب.',
        msa: 'سياستنا الرسمية هي **ضمان استبدال خلال 14 يوماً في حالة عيب الصناعة** 🛡️، ويمكنك رفع الطلب من صفحة طلباتك مباشرة.',
        en: 'Our official store policy provides a **14-day return or exchange guarantee for manufacturing defects only** 🛡️, which you can submit directly from your Orders page.'
      }),
      suggestions: buildSuggestions(ctx, lang),
      canEscalate: true,
      lang,
      intent: 'warranty'
    };
  }

  // 18. Ambiguity Guard -> Ask ONE Clarifying Question Instead of Dumping Random Results
  if (preSearch.isAmbiguous) {
    const availCats = [...new Set(ctx.products.filter(p => p.stock > 0).map(p => p.categoryName).filter(Boolean))];
    return {
      text: prefixBanner + localizeText(lang, {
        eg: `تحت أمرك يا فندم 😊 تحب تدور على منتج معين في قسم إيه بالظبط (مثلاً: سماعات، شواحن وباور بانك، مستلزمات كمبيوتر، أو شاشات)؟`,
        msa: `بكل سرور 😊 ما الفئة أو نوع المنتج الذي تبحث عنه تحديداً لكي أرشح لك الأنسب؟`,
        en: `Happy to help 😊 Could you share a bit more about what type of product you’re looking for (e.g., headphones, chargers, computer accessories, or screens)?`
      }),
      products: [],
      suggestions: availCats.length > 0 ? availCats.slice(0, 2).concat(buildSuggestions(ctx, lang)).slice(0, 4) : buildSuggestions(ctx, lang),
      canEscalate: true,
      lang,
      intent: 'clarification_needed'
    };
  }

  // 19. Specific Brand Requested with 0 Brand Items -> Honest Disclosure + True Same-Type In-Stock Alternatives
  if (preSearch.brandMention && preSearch.brandProductCount === 0) {
    const bName = preSearch.brandMention.canonical || preSearch.brandMention.brand;
    const brandRemTopic = (preSearch.brandMention.remainingTokens || []).join(' ');
    const smartBrandAlts = findSmartAlternatives(brandRemTopic || queryNorm, ctx, {
      maxPrice: preSearch.priceFilter.maxPrice || convState.rememberedBudget,
      limit: 3,
      lang
    });
    const sameTypeInStock = preSearch.matches.filter(p => p.stock > 0).map(p => ({
      product: p,
      reason: localizeText(lang, {
        eg: `نفس نوع المنتج المطلوب (${bName} غير مسجلة لدينا) ومتوفر حالياً بالمخزون (${p.stock} قطعة)`,
        msa: `من النوع نفسه المطلوب (علامة ${bName} غير متوفرة) ومتاح بالمخزون (${p.stock} قطعة)`,
        en: `Same product type (${bName} not carried) and currently in stock (${p.stock} left)`
      })
    }));

    const finalBrandAlts = sameTypeInStock.length > 0 ? sameTypeInStock : smartBrandAlts.alternatives;
    const altSection = finalBrandAlts.length > 0
      ? formatAlternativesSection(finalBrandAlts, lang, localizeText(lang, {
          eg: 'بس دي بدائل متوفرة فعلياً بالمخزون في نفس النوع المطلوب:',
          msa: 'وإليك بدائل متوفرة فعلياً بالمخزون من النوع نفسه:',
          en: 'However, here are matching-type in-stock alternatives:'
        }))
      : `\n\n${localizeText(lang, {
          eg: 'ولا يتوفر حالياً بديل مناسب من نفس النوع ده في المخزون.',
          msa: 'ولا يتوفر حالياً بديل مناسب من النوع نفسه في المخزون.',
          en: 'There are also no suitable same-type alternatives in stock right now.'
        })}`;

    return {
      text: prefixBanner + localizeText(lang, {
        eg: `حالياً مفيش منتجات مسجلة بماركة **${bName}** في المتجر يا فندم 😔.${altSection}`,
        msa: `لا تتوفر حالياً منتجات مسجلة لعلامة **${bName}** التجارية في المتجر 😔.${altSection}`,
        en: `We don’t currently have items listed under **${bName}** in our catalog 😔.${altSection}`
      }),
      products: finalBrandAlts.map(a => toProductCard(a.product)),
      alternatives: finalBrandAlts.map(toRecommendationCard),
      suggestions: buildSuggestions(ctx, lang),
      canEscalate: true,
      lang,
      intent: 'brand_unavailable_alternatives'
    };
  }

  // 20. Empty Category / Subcategory Requested -> Honest Status + Active Picks Notice
  if (preSearch.catMention) {
    const catCount = ctx.products.filter(p =>
      preSearch.catMention.subcategoryId
        ? p.subcategoryId === preSearch.catMention.subcategoryId
        : p.categoryId === preSearch.catMention.categoryId
    ).length;
    const remainingMeaningful = (preSearch.catMention.remainingTokens || []).filter(t => !AMBIGUOUS_GENERIC_TERMS.has(t));
    const explicitlyAskedSection = /(?:^|\s)(?:قسم|فئه|section|category)(?=\s|$)/.test(queryNorm);
    const onlyAskedCategory = remainingMeaningful.length === 0 || explicitlyAskedSection;
    if (catCount === 0 && onlyAskedCategory) {
      const secName = preSearch.catMention.subcategoryName || preSearch.catMention.categoryName;
      const activeCats = [...new Set(ctx.products.filter(p => p.stock > 0).map(p => p.categoryName).filter(Boolean))];
      return {
        text: prefixBanner + localizeText(lang, {
          eg: `قسم **${secName}** مفيش فيه منتجات مسجلة أو متوفرة حالياً في المخزون 😔، وما نقدرش نقترحلك منتج من قسم مختلف باعتباره بديل لنفس الغرض.${activeCats.length > 0 ? `\nالأقسام النشطة حالياً في المتجر هي: **${activeCats.join('، ')}**.` : ''}`,
          msa: `قسم **${secName}** لا يحتوي على منتجات مسجلة أو متاحة حالياً في المخزون 😔، ولا تتوفر بدائل مناسبة من الفئة نفسها حالياً.${activeCats.length > 0 ? `\nالأقسام النشطة حالياً هي: **${activeCats.join('، ')}**.` : ''}`,
          en: `Our **${secName}** section doesn’t currently have items registered or in stock 😔, so there are no matching alternatives from that category right now.${activeCats.length > 0 ? `\nCurrently active sections: **${activeCats.join(', ')}**.` : ''}`
        }),
        products: [],
        alternatives: [],
        escalationSuggested: true,
        suggestions: buildSuggestions(ctx, lang),
        canEscalate: true,
        lang,
        intent: 'category_empty'
      };
    }
  }

  // 21. Budget-only reply remembering previous topic/category + Stock-Aware Search Results + Cross-Selling!
  const isBudgetFollowUp = preSearch.topScore === 0 && preSearch.priceFilter.maxPrice !== null && Boolean(convState.rememberedTopic) && !(preSearch.concreteTokens && preSearch.concreteTokens.length > 0);
  const effectiveSearch = isBudgetFollowUp
    ? findMatchingProducts(convState.rememberedTopic, ctx, {
        preferCategoryId: convState.rememberedCategoryId,
        overrideMaxPrice: preSearch.priceFilter.maxPrice,
        limit: 4
      })
    : preSearch;

  if (effectiveSearch.matches.length > 0) {
    const isStrongMatch = effectiveSearch.topScore >= 14 || effectiveSearch.priceFilter.maxPrice !== null || effectiveSearch.priceFilter.minPrice !== null;
    if (isStrongMatch) {
      const inStockMatches = effectiveSearch.matches.filter(p => p.stock > 0);
      const outOfStockMatches = effectiveSearch.matches.filter(p => p.stock <= 0);
      const ordered = [...inStockMatches, ...outOfStockMatches];
      const listTxt = ordered.map(p => formatProductLine(p, lang)).join('\n');

      if (inStockMatches.length === 0 && outOfStockMatches.length > 0) {
        const oosAlts = findSmartAlternatives(isBudgetFollowUp ? convState.rememberedTopic : queryNorm, ctx, {
          maxPrice: effectiveSearch.priceFilter.maxPrice,
          excludeIds: new Set(ordered.map(p => String(p.id))),
          preferCategoryId: outOfStockMatches[0].categoryId,
          limit: 2,
          lang
        });

        const altTxt = oosAlts.alternatives.length > 0
          ? formatAlternativesSection(oosAlts.alternatives, lang)
          : `\n\n${localizeText(lang, {
              eg: 'وحالياً لا يوجد بديل مناسب متاح بالمخزون من نفس النوع.',
              msa: 'ولا يتوفر حالياً بديل مناسب من النوع نفسه في المخزون.',
              en: 'There are currently no suitable same-type alternatives in stock.'
            })}`;

        return {
          text: prefixBanner + localizeText(lang, {
            eg: `المنتج ده مسجل عندنا في المتجر، لكنه **غير متوفر حالياً بالمخزون (الكمية المتاحة: 0)** ولا يُعتبر متاحاً للطلب دلوقتي 😔:\n\n${listTxt}${altTxt}\n\nتحب أحولك لموظف خدمة العملاء لو حابب تتأكد من موعد توفره؟`,
            msa: `هذا المنتج مسجل في المتجر، لكنه **غير متوفر حالياً بالمخزون (الكمية المتاحة: 0)** ولا يمكن اعتباره متاحاً للطلب الآن 😔:\n\n${listTxt}${altTxt}`,
            en: `This item is listed in our catalog, but it is **currently out of stock (Quantity: 0)** and unavailable to order right now 😔:\n\n${listTxt}${altTxt}`
          }),
          products: ordered.map(toProductCard),
          alternatives: oosAlts.alternatives.map(toRecommendationCard),
          escalationSuggested: true,
          suggestions: buildSuggestions(ctx, lang),
          canEscalate: true,
          lang,
          intent: 'product_out_of_stock'
        };
      }

      const shouldSuggestComplementary =
        inStockMatches.length > 0 &&
        inStockMatches.length <= 2 &&
        effectiveSearch.priceFilter.maxPrice === null &&
        !effectiveSearch.priceFilter.sortMode;

      const addons = shouldSuggestComplementary
        ? findComplementaryProducts(inStockMatches, ctx, {
            excludeIds: new Set(ordered.map(p => String(p.id))),
            limit: 2,
            lang
          })
        : [];

      if (outOfStockMatches.length > 0) {
        return {
          text: prefixBanner + localizeText(lang, {
            eg: `لقيت لحضرتك الاختيارات دي (المتوفرة في المخزون معروضة أولاً، وأمام غير المتوفر موضح إن مخزونه 0) ✨:\n\n${listTxt}`,
            msa: `إليك الخيارات المطابقة (المنتجات المتوفرة معروضة أولاً، والمخزون الصفري موضح بغير متوفر) ✨:\n\n${listTxt}`,
            en: `Here are the matching items (in-stock items are shown first; items at 0 stock are marked out of stock) ✨:\n\n${listTxt}`
          }) + formatAddonsSection(addons, lang),
          products: ordered.map(toProductCard),
          complementary: addons.map(toRecommendationCard),
          suggestions: buildSuggestions(ctx, lang),
          canEscalate: true,
          lang,
          intent: 'product_search'
        };
      }

      return {
        text: prefixBanner + localizeText(lang, {
          eg: `لقيت لحضرتك الاختيارات دي ومتاحة عندنا دلوقتي ✨:\n\n${listTxt}\n\nتقدر تضغط على أي منتج تحت لتفاصيله، ولو حابب تسأل عن المواصفات أو المقارنة أو ميزانية محددة قولي ❤️`,
          msa: `إليك أبرز الخيارات المطابقة المتوفرة لدينا حالياً ✨:\n\n${listTxt}\n\nيمكنك الضغط على أي منتج لعرض المواصفات والصور وإضافته للسلة ❤️`,
          en: `Here are the best matching products we currently have ✨:\n\n${listTxt}\n\nClick any card below to inspect specs, or ask me for details, comparisons, or a different budget ❤️`
        }) + formatAddonsSection(addons, lang),
        products: ordered.map(toProductCard),
        complementary: addons.map(toRecommendationCard),
        suggestions: buildSuggestions(ctx, lang),
        canEscalate: true,
        lang,
        intent: 'product_search'
      };
    }
  }

  const isDirectBudgetMiss =
    !isBudgetFollowUp &&
    effectiveSearch.matches.length === 0 &&
    effectiveSearch.priceFilter.maxPrice !== null &&
    preSearch.hasKeywords &&
    noAvailableBrandConflict;

  if ((isBudgetFollowUp || isDirectBudgetMiss) && effectiveSearch.matches.length === 0) {
    const budgetCap = effectiveSearch.priceFilter.maxPrice;
    const topicText = isBudgetFollowUp ? convState.rememberedTopic : queryNorm;
    let lowestAvailableMsg = '';
    const cleanedTopic = String(topicText || '').replace(/\d+/g, ' ').trim();
    const unconstrained = findMatchingProducts(cleanedTopic, ctx, { overrideMaxPrice: null, overrideSortMode: 'cheapest', limit: 2 });
    const cheapestAbove = unconstrained.matches.find(p => p.stock > 0 && p.price > budgetCap);
    if (cheapestAbove) {
      lowestAvailableMsg = localizeText(lang, {
        eg: ` (أقل سعر متوفر لهذا النوع هو **${cheapestAbove.price} ج.م** لـ **${cheapestAbove.title}**)`,
        msa: ` (أقل سعر متوفر لهذا النوع يبدأ من **${cheapestAbove.price} ج.م** لمنتج **${cheapestAbove.title}**)`,
        en: ` (our lowest-priced available option of that type starts at **${cheapestAbove.price} EGP** for **${cheapestAbove.title}**)`
      });
    }

    const smartBudgetAlts = findSmartAlternatives(cleanedTopic, ctx, {
      maxPrice: budgetCap,
      preferCategoryId: convState.rememberedCategoryId,
      limit: 3,
      lang
    });

    let altItems = smartBudgetAlts.alternatives;
    let isGenericBudgetOffers = false;

    if (altItems.length === 0 && isBudgetFollowUp) {
      let budgetOffers = getBestOffers(ctx, 3, budgetCap);
      if (budgetOffers.length === 0) {
        budgetOffers = findMatchingProducts('', ctx, { overrideMaxPrice: budgetCap, overrideSortMode: 'cheapest', limit: 3 }).matches.filter(p => p.stock > 0);
      }
      if (budgetOffers.length > 0) {
        isGenericBudgetOffers = true;
        altItems = budgetOffers.map(p => ({
          product: p,
          reason: localizeText(lang, {
            eg: `منتج متاح فعلياً في المتجر ضمن ميزانية ${budgetCap} ج.م (${p.price} ج.م، مخزون: ${p.stock}) — وليس من نفس النوع السابق`,
            msa: `خيار متاح بالمتجر ضمن ميزانية ${budgetCap} ج.م (${p.price} ج.م، المخزون: ${p.stock}) وليس من النوع السابق نفسه`,
            en: `Currently in stock within ${budgetCap} EGP (${p.price} EGP, stock: ${p.stock}) — note: different product type`
          })
        }));
      }
    }

    if (altItems.length > 0) {
      const heading = isGenericBudgetOffers
        ? localizeText(lang, {
            eg: `دي منتجات متوفرة في المتجر ضمن حدود ${budgetCap} ج.م:`,
            msa: `إليك منتجات متوفرة حالياً ضمن حدود ${budgetCap} ج.م:`,
            en: `Here are in-stock store items currently under ${budgetCap} EGP:`
          })
        : localizeText(lang, {
            eg: `دي بدائل قريبة ومناسبة متوفرة في المخزون ضمن حدود ${budgetCap} ج.م:`,
            msa: `إليك بدائل مناسبة متوفرة بالمخزون ضمن حدود ${budgetCap} ج.م:`,
            en: `Here are suitable in-stock alternatives under ${budgetCap} EGP:`
          });

      return {
        text: prefixBanner + localizeText(lang, {
          eg: `بحثت لحضرتك في حدود ميزانية ${budgetCap} ج.م ومفيش منتج مطابق لطلبك بالسعر ده حالياً${lowestAvailableMsg}.`,
          msa: `بحثت ضمن ميزانية ${budgetCap} ج.م ولا يتوفر نفس المنتج المطلوب بهذا السعر حالياً${lowestAvailableMsg}.`,
          en: `I checked within your ${budgetCap} EGP budget and don’t see an exact match at that price${lowestAvailableMsg}.`
        }) + formatAlternativesSection(altItems, lang, heading),
        products: altItems.map(a => toProductCard(a.product)),
        alternatives: altItems.map(toRecommendationCard),
        suggestions: buildSuggestions(ctx, lang),
        canEscalate: true,
        lang,
        intent: 'budget_recommendations'
      };
    }

    return {
      text: prefixBanner + localizeText(lang, {
        eg: `بحثت لحضرتك في حدود ميزانية ${budgetCap} ج.م ومفيش حالياً منتج مطابق ولا بديل متوافق متاح بالمخزون بالسعر ده${lowestAvailableMsg} 😔 لو تحب نتأكد مع موظف أو تجرب ميزانية أعلى قولي.`,
        msa: `بحثت ضمن ميزانية ${budgetCap} ج.م ولا يتوفر حالياً منتج مطابق أو بديل متوافق متاح بالمخزون بهذا السعر${lowestAvailableMsg} 😔.`,
        en: `I checked within your ${budgetCap} EGP budget and there is currently no matching product or compatible in-stock alternative under that limit${lowestAvailableMsg} 😔.`
      }),
      products: [],
      alternatives: [],
      escalationSuggested: true,
      suggestions: buildSuggestions(ctx, lang),
      canEscalate: true,
      lang,
      intent: 'budget_recommendations'
    };
  }

  // 21b. Unclear / Conflicting Product Data Guard -> Never classify unclear items as confirmed matches
  if (effectiveSearch.matches.length === 0 && effectiveSearch.unclearMatches && effectiveSearch.unclearMatches.length > 0) {
    const unclearNames = effectiveSearch.unclearMatches.map(p => `• **${p.title}** (${p.price} ج.م)`).join('\n');
    const clearSameTypeAlts = findSmartAlternatives(isBudgetFollowUp ? convState.rememberedTopic : queryNorm, ctx, {
      maxPrice: effectiveSearch.priceFilter.maxPrice,
      excludeIds: new Set(effectiveSearch.unclearMatches.map(p => String(p.id))),
      limit: 2,
      lang
    });
    const altNote = clearSameTypeAlts.alternatives.length > 0
      ? formatAlternativesSection(clearSameTypeAlts.alternatives, lang)
      : '';

    return {
      text: prefixBanner + localizeText(lang, {
        eg: `في منتج قريب في الاسم بس للأسف بيانات طريقة التوصيل في المتجر غير واضحة أو متعارضة (سلكي ولا لاسلكي)، فمش هينفع أأكدلك إنه مطابق لطلبك قبل التأكيد:\n\n${unclearNames}${altNote}\n\nتحب أحولك لموظف خدمة العملاء يراجع المواصفة الفعلية ويتأكدلك فوراً؟`,
        msa: `يتوفر منتج مشابه في المسمى لكن بيانات طريقة التوصيل المسجلة له غير واضحة أو متعارضة، ولذلك لا يمكن تصنيفه كخيار مطابق بشكل مؤكد قبل المراجعة:\n\n${unclearNames}${altNote}\n\nهل تود أن أحولك لموظف خدمة العملاء للتحقق من المواصفة الفعلية؟`,
        en: `We do have a similarly named listing, but its stored connection specs are unclear or conflicting (wired vs wireless), so I cannot confirm it as an exact match for your request:\n\n${unclearNames}${altNote}\n\nWould you like me to connect you with a support agent to verify the exact specification?`
      }),
      products: [],
      alternatives: clearSameTypeAlts.alternatives.map(toRecommendationCard),
      escalationSuggested: true,
      canEscalate: true,
      lang,
      suggestions: buildSuggestions(ctx, lang),
      intent: 'unclear_product_match'
    };
  }

  // 22. Unavailable Specific Item -> Honest Answer + Verified Same-Type Alternatives Only (No Random Irrelevant Cross-Selling!)
  const hasSpecificTypeOrSpecMiss =
    preSearch.hasKeywords &&
    preSearch.topScore < 14 &&
    (preSearch.contradictedCount > 0 || (preSearch.constraints && preSearch.constraints.requestedTypes.length > 0));
  const asksProductPropertyOrPresence =
    /(عندكم|فيه|موجود|بدور علي|عايز|محتاج|سعر|بكام|ثمن|تمن|مواصفات|تفاصيل|كميه|مخزون|متوفر|متاح|خصم|الوان|مقاسات|بديل|ارغب|ابحث عن|do you have|looking for|need a|price of|specs|stock|available|alternative)/.test(queryNorm);
  const likelyAskingUnavailable =
    hasSpecificTypeOrSpecMiss ||
    (asksProductPropertyOrPresence && preSearch.hasKeywords && preSearch.topScore < 14);

  if (likelyAskingUnavailable) {
    const unavailableAlts = findSmartAlternatives(queryNorm, ctx, {
      maxPrice: preSearch.priceFilter.maxPrice || convState.rememberedBudget,
      limit: 3,
      lang
    });

    if (unavailableAlts.alternatives.length > 0) {
      return {
        text: prefixBanner + localizeText(lang, {
          eg: 'دورت لحضرتك في المتجر ومش لاقي نفس الطلب ده بعينه حالياً 😔.' + formatAlternativesSection(unavailableAlts.alternatives, lang),
          msa: 'بحثت في المتجر ولا يتوفر حالياً المنتج المطلوب بعينه 😔.' + formatAlternativesSection(unavailableAlts.alternatives, lang),
          en: 'I checked our catalog and don’t see an exact match for that specific item right now 😔.' + formatAlternativesSection(unavailableAlts.alternatives, lang)
        }),
        products: unavailableAlts.alternatives.map(a => toProductCard(a.product)),
        alternatives: unavailableAlts.alternatives.map(toRecommendationCard),
        escalationSuggested: true,
        canEscalate: true,
        lang,
        suggestions: buildSuggestions(ctx, lang),
        intent: 'product_not_found'
      };
    }

    return {
      text: prefixBanner + localizeText(lang, {
        eg: 'دورت لحضرتك في المتجر ومش لاقي المنتج ده ولا بديل متوافق ومناسب ليه متاح في المخزون حالياً 😔.\nلو تحب نتأكد مع فريقنا أو نساعدك تدور على حاجة تانية، تحب أحولك لموظف خدمة عملاء؟',
        msa: 'بحثت في المتجر ولا يتوفر حالياً هذا المنتج ولا بديل مناسب ومتوافق معه في المخزون حالياً 😔.\nهل تود أن أحولك لموظف خدمة العملاء للمساعدة بشكل أدق؟',
        en: 'I checked our catalog and don’t see this product or a verified compatible alternative currently in stock 😔.\nWould you like me to connect you with a human support agent?'
      }),
      products: [],
      alternatives: [],
      escalationSuggested: true,
      canEscalate: true,
      lang,
      suggestions: buildSuggestions(ctx, lang),
      intent: 'product_not_found'
    };
  }

  // 23. Repeated unclear messages -> gentle human escalation offer
  if (convState.unmatchedStreak >= 1 || rawText.length > 90) {
    return {
      text: prefixBanner + localizeText(lang, {
        eg: 'علشان أضمن إنك تاخد أدق مساعدة بأسرع شكل يا فندم، تحب أحولك لموظف من خدمة العملاء يكمل معاك شخصياً؟ 👨‍💼',
        msa: 'لضمان تقديم أدق مساعدة لك بشكل سريع، هل تفضل أن أحولك إلى أحد موظفي خدمة العملاء؟ 👨‍💼',
        en: 'To make sure you get the exact help you need quickly, would you like me to connect you with a human support agent? 👨‍💼'
      }),
      escalationSuggested: true,
      canEscalate: true,
      lang,
      suggestions: [lang === 'en' ? 'Yes, connect me to an agent' : 'نعم، حولني لموظف الآن'],
      intent: 'unmatched'
    };
  }

  // 24. Polite Single Clarification Question (Never displays random products)
  return {
    text: prefixBanner + localizeText(lang, {
      eg: 'من عيوني يا فندم 😊 ممكن توضحلي أكتر بتدور على منتج إيه أو تحب أساعدك في إيه بالظبط؟',
      msa: 'بكل سرور يا فندم 😊 هل يمكنك توضيح المنتج أو الخدمة التي تبحث عنها لكي أساعدك بشكل أدق؟',
      en: 'I’d love to help! 😊 Could you share a little more about what product or help you’re looking for?'
    }),
    products: [],
    suggestions: buildSuggestions(ctx, lang),
    canEscalate: true,
    lang,
    intent: 'unmatched'
  };
}

module.exports = {
  WELCOME_MESSAGE,
  BASSAM_SYSTEM_PROMPT,
  SYNONYM_GROUPS,
  generateBotReply,
  loadStoreContext,
  findMatchingProducts,
  findComplementaryProducts,
  findSmartAlternatives,
  checkCompatibilityBetween,
  detectQueryConstraints,
  analyzeProductConnection,
  classifyProductPrimaryType,
  sanitizePublicProduct,
  detectReplyStyle
};
