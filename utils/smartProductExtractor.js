const fs = require('fs');
const path = require('path');
const pdfParseModule = require('pdf-parse');
const XLSX = require('xlsx');
const mammoth = require('mammoth');
const WordExtractor = require('word-extractor');
const { normalizeNumerals } = require('./normalizeNumerals');

// Store taxonomy for all 7 main categories
const CATEGORY_TAXONOMY = {
  'cat-electronics': {
    name: 'إلكترونيات وأجهزة ذكية',
    aliases: ['إلكترونيات', 'الكترونيات', 'أجهزة إلكترونية', 'أجهزة ذكية', 'اجهزة ذكية', 'electronics', 'smart devices', 'تكنولوجيا', 'أجهزة ذكية وإلكترونيات'],
    primaryKeywords: [
      'هاتف', 'هواتف', 'موبايل', 'موبايلات', 'جوال', 'تليفون', 'سمارت فون', 'ايفون', 'iphone', 'سامسونج', 'samsung', 'شاومي', 'xiaomi', 'ريدمي', 'redmi', 'ريلمي', 'realme', 'انفينكس', 'infinix', 'أوبو', 'oppo',
      'سماعة', 'سماعات', 'ايربودز', 'airpods', 'هيدفون', 'headphone', 'شاحن', 'شواحن', 'كابل', 'كابلات', 'وصلة', 'باور بانك', 'power bank', 'جراب', 'كفر', 'اسكرينة', 'واقي شاشة', 'كيبورد', 'لوحة مفاتيح', 'ماوس', 'فارة', 'فلاشة', 'كارت ميموري', 'ستاند موبايل', 'حامل هاتف', 'ساعة ذكية', 'smart watch', 'ساعات ذكية', 'سوار ذكي', 'محول', 'usb', 'aux', 'ترايبود', 'رينج لايت', 'ساوند بار', 'مكبر صوت', 'ميكروفون', 'بلوتوث',
      'شاشة', 'شاشات', 'تلفزيون', 'تلفزيونات', 'تلفاز', 'كاميرا', 'كاميرات', 'داش كام', 'كاميرا مراقبة', 'رسيفر', 'بروجكتور', 'ستاند شاشة', 'حامل شاشة',
      'لابتوب', 'laptop', 'كمبيوتر', 'راوتر', 'router', 'سويتش', 'ايثرنت', 'تابلت', 'ايباد', 'ipad'
    ]
  },
  'cat-home-appliances': {
    name: 'أجهزة منزلية',
    aliases: ['أجهزة منزلية', 'اجهزة منزلية', 'أجهزة كهربائية', 'اجهزة كهربائية', 'أجهزة المطبخ', 'أجهزة البيت', 'appliances', 'home appliances'],
    primaryKeywords: [
      'غسالة', 'غسالات', 'ثلاجة', 'ثلاجات', 'ديب فريزر', 'فريزر', 'بوتاجاز', 'بوتاجازات', 'سخان', 'سخانات', 'تكييف', 'تكييفات', 'غسالة اطباق', 'غسالة صحون', 'شفاط مطبخ', 'شفاط كبير',
      'خلاط', 'خلاطات', 'كبة', 'مفرمة', 'قلاية هوائية', 'قلاية', 'مقلاة هوائية', 'اير فراير', 'air fryer', 'ميكروويف', 'ميكرويف', 'microwave', 'فرن كهربائي', 'فرن', 'غلاية', 'غلايات', 'كاتل', 'مكواة', 'مكواه', 'مكواة بخار', 'مكنسة', 'مكنسة كهربائية', 'مكنسة روبوت', 'ماكينة قهوة', 'صانعة قهوة', 'اسبريسو', 'عصارة', 'مضرب بيض', 'مضرب كهربائي', 'توستر', 'محمصة', 'صانعة سندوتشات', 'وافل', 'ساندوتش ميكر', 'مروحة', 'مراوح', 'دفاية', 'دفايات', 'موزع مياه', 'كولدير', 'عجان', 'عجانة', 'محضر طعام'
    ]
  },
  'cat-fashion': {
    name: 'أزياء',
    aliases: ['أزياء', 'ازياء', 'ملابس', 'لبس', 'ملبوسات', 'أزياء وملابس', 'fashion', 'clothing', 'clothes', 'موضة'],
    primaryKeywords: [
      'رجالي', 'رجال', 'شبابي', 'قميص', 'قمصان', 'بنطلون', 'بنطلونات', 'تيشرت', 'تي شيرت', 'بدلة', 'بدل', 'جاكيت', 'جاكيتات', 'سويت شيرت', 'هودي', 'شورت', 'كوتشي', 'حذاء', 'جزمة', 'حزام', 'بيجاما', 'كرفته', 'كرفتة', 'كرافتة', 'سديري', 'شروال',
      'حريمي', 'نسائي', 'بناتي', 'فستان', 'فساتين', 'عباية', 'عبايات', 'إسدال', 'اسدال', 'بلوزة', 'بلوزات', 'جيبة', 'جيب', 'جيبات', 'تنورة', 'طرحة', 'طرح', 'شال', 'كارديجان', 'ليجن', 'بادي', 'لانجري', 'شنطة نسائية', 'شنطة حريمي', 'حقيبة يد', 'صندل', 'توب', 'كيمونو', 'بليزر',
      'أطفال', 'اطفال', 'بيبي', 'حديثي الولادة', 'اولادي', 'أولادي', 'سالوبيت', 'كيدز', 'مريلة', 'رضع', 'طفل', 'طفلة',
      'بلوفر', 'سويتر', 'جينز', 'قطن', 'صوف', 'كتان', 'حرير'
    ]
  },
  'cat-beauty': {
    name: 'عناية وتجميل',
    aliases: ['عناية وتجميل', 'عناية بالبشرة', 'تجميل', 'عناية وتجميل ومكياج', 'مكياج', 'beauty', 'cosmetics', 'personal care', 'عناية شخصية'],
    primaryKeywords: [
      'بشرة', 'عناية بالبشرة', 'كريم', 'كريمات', 'سيروم', 'serum', 'لوشن', 'lotion', 'غسول', 'صابون', 'صابونة', 'ماسك', 'مرطب', 'واقي شمس', 'سن بلوك', 'sunblock', 'مقشر', 'تونر', 'toner', 'شامبو', 'shampoo', 'بلسم', 'زيت شعر', 'سيروم شعر', 'حمام كريم', 'مكياج', 'ميك اب', 'makeup', 'روج', 'احمر شفاه', 'كونسيلر', 'فاونديشن', 'كريم اساس', 'مسكرة', 'ماسكارا', 'ايلاينر', 'ايشادو', 'بودرة', 'بلاشر', 'فرش مكياج', 'مبرد', 'طلاء اظافر', 'مانيكير',
      'عطر', 'عطور', 'برفيوم', 'perfume', 'برفان', 'مسك', 'عود', 'بخور', 'مبخرة', 'معطر جسم', 'بودي سبلاش', 'body splash', 'مستكة', 'زيوت عطرية', 'مخلط'
    ]
  },
  'cat-home-supplies': {
    name: 'مستلزمات منزلية',
    aliases: ['مستلزمات منزلية', 'مستلزمات البيت', 'أدوات منزلية', 'ادوات منزلية', 'مستلزمات مطبخ', 'home supplies', 'home essentials', 'مفروشات'],
    primaryKeywords: [
      'حلة', 'حلل', 'طقم حلل', 'جرانيت', 'تيفال', 'سيراميك', 'طاسة', 'سكين', 'سكاكين', 'معالق', 'ملاعق', 'شوك', 'طقم عشاء', 'اطباق', 'صحون', 'كاسات', 'كوبايات', 'مجات', 'مج حراري', 'دورق', 'صينية', 'صواني', 'صينية تيفال', 'صينية بيركس', 'بيركس', 'قالب كيك', 'هراسة', 'فتاحة', 'مصفاة', 'ترمس', 'ملاحة', 'طقم توابل',
      'تنظيم', 'تخزين', 'منظم', 'منظمات', 'ستاند معدن', 'ستاند بلاستيك', 'رف', 'رفوف', 'شماعة', 'شماعات', 'سبت', 'سلة غسيل', 'بوكس', 'بوكس تخزين', 'صندوق حفظ', 'علب ثلاجة', 'علب طعام', 'لانش بوكس', 'حافظة طعام', 'منظم ادراج', 'منظم احذية', 'جزامة', 'مفارش', 'مفرش سفرة', 'ستارة', 'سجادة', 'مشاية', 'خدادية', 'ديكور منزلي', 'فازة', 'اباجورة'
    ]
  },
  'cat-games': {
    name: 'ألعاب وترفيه',
    aliases: ['ألعاب وترفيه', 'العاب وترفيه', 'ألعاب', 'العاب', 'games', 'entertainment', 'toys', 'ألعاب أطفال', 'العاب اطفال', 'ألعاب فيديو', 'العاب فيديو'],
    primaryKeywords: [
      'لعبة اطفال', 'العاب اطفال', 'دمية', 'عروسة', 'سيارة اطفال', 'عربية بريموت', 'سكوتر', 'عجلة اطفال', 'دراجة اطفال', 'باتيناج', 'بازل', 'puzzle', 'مكعبات', 'ليجو', 'lego', 'صلصال', 'مسدس مياه', 'خيمة اطفال', 'عرائس',
      'بلايستيشن', 'بلاي ستيشن', 'playstation', 'ps4', 'ps5', 'اكس بوكس', 'xbox', 'نينتندو', 'nintendo', 'دراع تحكم', 'كنترولر', 'controller', 'شريط العاب', 'اسطوانة العاب', 'كراسي جيمينج', 'ماوس باد جيمينج', 'جيمينج', 'gaming'
    ]
  },
  'cat-office': {
    name: 'أدوات مكتبية',
    aliases: ['أدوات مكتبية', 'ادوات مكتبية', 'قرطاسية', 'أدوات دراسية', 'مكتبية ومدرسية', 'office supplies', 'stationery', 'مكتبية'],
    primaryKeywords: [
      'كتاب', 'كتب', 'رواية', 'روايات', 'قصة', 'قصص', 'مصحف', 'قاموس', 'معجم', 'مجلد', 'موسوعة',
      'قلم', 'اقلام', 'قلم جاف', 'قلم رصاص', 'ألوان', 'الوان خشب', 'كشكول', 'دفتر', 'كشاكيل', 'دفاتر', 'مسطرة', 'براية', 'استيكة', 'ممحاة', 'مقلمة', 'دباسة', 'خرامة', 'دبابيس', 'ورق تصوير', 'ورق a4', 'طابعة ورق', 'حبر طابعة', 'الة حاسبة', 'دوسيه', 'ملف اوراق', 'حافظة اوراق', 'لوحة رسم', 'اسكتش'
    ]
  }
};

// Store taxonomy for all 16 subcategories
const SUBCATEGORY_TAXONOMY = {
  // Fashion
  'sub-fashion-1': {
    name: 'رجالي',
    categoryId: 'cat-fashion',
    keywords: ['رجالي', 'رجال', 'شبابي', 'قميص', 'بنطلون رجالي', 'تيشرت رجالي', 'بدلة', 'جاكيت رجالي', 'سويت شيرت', 'هودي', 'شورت رجالي', 'كوتشي رجالي', 'حزام رجالي', 'بيجاما رجالي', 'كرفته', 'كرفتة', 'كرافتة', 'سديري', 'شروال']
  },
  'sub-fashion-2': {
    name: 'حريمي',
    categoryId: 'cat-fashion',
    keywords: ['حريمي', 'نسائي', 'بناتي كبار', 'فستان', 'فساتين', 'عباية', 'عبايات', 'إسدال', 'اسدال', 'بلوزة', 'جيبة', 'جيب', 'جيبات', 'تنورة', 'طرحة', 'شال', 'كارديجان', 'ليجن', 'بادي', 'لانجري', 'بيجاما حريمي', 'شنطة نسائية', 'شنطة حريمي', 'حقيبة يد', 'كوتشي حريمي', 'شوز حريمي', 'صندل', 'توب', 'كيمونو']
  },
  'sub-fashion-3': {
    name: 'أطفال',
    categoryId: 'cat-fashion',
    keywords: ['أطفال', 'اطفال', 'بيبي', 'حديثي الولادة', 'بناتي', 'أولادي', 'اولادي', 'سالوبيت', 'كيدز', 'مريلة', 'رضع', 'طفل', 'طفلة', 'بيجاما اطفال', 'فستان بناتي']
  },

  // Electronics
  'sub-electronics-1': {
    name: 'هواتف',
    categoryId: 'cat-electronics',
    keywords: ['هاتف', 'هواتف', 'موبايل', 'موبايلات', 'جوال', 'تليفون', 'سمارت فون', 'ايفون', 'iphone', 'سامسونج', 'samsung', 'شاومي', 'xiaomi', 'ريدمي', 'redmi', 'ريلمي', 'realme', 'انفينكس', 'infinix', 'أوبو', 'oppo']
  },
  'sub-electronics-2': {
    name: 'إكسسوارات',
    categoryId: 'cat-electronics',
    keywords: ['سماعة', 'سماعات', 'ايربودز', 'airpods', 'هيدفون', 'headphone', 'شاحن', 'شواحن', 'كابل', 'كابلات', 'وصلة', 'باور بانك', 'power bank', 'جراب', 'كفر', 'اسكرينة', 'واقي شاشة', 'كيبورد', 'لوحة مفاتيح', 'ماوس', 'فلاشة', 'كارت ميموري', 'ستاند موبايل', 'حامل هاتف', 'ساعة ذكية', 'smart watch', 'ساعات ذكية', 'سوار ذكي', 'محول', 'usb', 'aux', 'ترايبود', 'رينج لايت', 'ساوند بار', 'مكبر صوت', 'ميكروفون', 'بلوتوث']
  },
  'sub-electronics-3': {
    name: 'شاشات وكاميرات',
    categoryId: 'cat-electronics',
    keywords: ['شاشة', 'شاشات', 'تلفزيون', 'تلفزيونات', 'تلفاز', 'كاميرا', 'كاميرات', 'داش كام', 'كاميرا مراقبة', 'رسيفر', 'بروجكتور', 'ستاند شاشة', 'حامل شاشة']
  },

  // Home appliances
  'sub-home-appliances-1': {
    name: 'أجهزة كبيرة',
    categoryId: 'cat-home-appliances',
    keywords: ['غسالة', 'غسالات', 'ثلاجة', 'ثلاجات', 'ديب فريزر', 'فريزر', 'بوتاجاز', 'بوتاجازات', 'سخان', 'سخانات', 'تكييف', 'تكييفات', 'غسالة اطباق', 'غسالة صحون', 'شفاط كبير']
  },
  'sub-home-appliances-2': {
    name: 'أجهزة صغيرة',
    categoryId: 'cat-home-appliances',
    keywords: ['خلاط', 'خلاطات', 'كبة', 'مفرمة', 'قلاية هوائية', 'قلاية', 'مقلاة هوائية', 'اير فراير', 'ميكروويف', 'ميكرويف', 'فرن كهربائي', 'فرن', 'غلاية', 'غلايات', 'كاتل', 'مكواة', 'مكواه', 'مكواة بخار', 'مكنسة', 'مكنسة كهربائية', 'ماكينة قهوة', 'اسبريسو', 'عصارة', 'مضرب بيض', 'توستر', 'صانعة سندوتشات', 'وافل', 'مروحة', 'مراوح', 'دفاية', 'موزع مياه', 'عجان']
  },

  // Home supplies
  'sub-home-supplies-1': {
    name: 'أدوات مطبخ',
    categoryId: 'cat-home-supplies',
    keywords: ['حلة', 'حلل', 'طقم حلل', 'جرانيت', 'تيفال', 'سيراميك', 'طاسة', 'سكين', 'سكاكين', 'معالق', 'ملاعق', 'شوك', 'طقم عشاء', 'اطباق', 'صحون', 'كاسات', 'كوبايات', 'مجات', 'دورق', 'صينية', 'صواني', 'قالب كيك', 'هراسة', 'فتاحة', 'مصفاة', 'ترمس', 'طقم توابل']
  },
  'sub-home-supplies-2': {
    name: 'تنظيم وتخزين',
    categoryId: 'cat-home-supplies',
    keywords: ['تنظيم', 'تخزين', 'منظم', 'منظمات', 'ستاند', 'رف', 'رفوف', 'شماعة', 'شماعات', 'سبت', 'سلة غسيل', 'بوكس', 'بوكس تخزين', 'صندوق حفظ', 'علب ثلاجة', 'علب طعام', 'لانش بوكس', 'حافظة طعام', 'منظم ادراج', 'منظم احذية', 'جزامة', 'مفارش', 'ستارة', 'سجادة', 'ديكور']
  },

  // Beauty
  'sub-beauty-1': {
    name: 'عناية بالبشرة',
    categoryId: 'cat-beauty',
    keywords: ['بشرة', 'عناية بالبشرة', 'كريم', 'كريمات', 'سيروم', 'لوشن', 'غسول', 'صابون', 'ماسك', 'مرطب', 'واقي شمس', 'سن بلوك', 'مقشر', 'تونر', 'شامبو', 'بلسم', 'زيت شعر', 'مكياج', 'ميك اب', 'روج', 'كونسيلر', 'فاونديشن', 'مسكرة', 'ايلاينر', 'بودرة']
  },
  'sub-beauty-2': {
    name: 'عطور',
    categoryId: 'cat-beauty',
    keywords: ['عطر', 'عطور', 'برفيوم', 'برفان', 'مسك', 'عود', 'بخور', 'مبخرة', 'معطر جسم', 'بودي سبلاش', 'مستكة', 'زيوت عطرية', 'مخلط']
  },

  // Games
  'sub-games-1': {
    name: 'ألعاب أطفال',
    categoryId: 'cat-games',
    keywords: ['لعبة اطفال', 'العاب اطفال', 'دمية', 'عروسة', 'سيارة اطفال', 'عربية بريموت', 'سكوتر', 'عجلة اطفال', 'دراجة اطفال', 'باتيناج', 'بازل', 'مكعبات', 'ليجو', 'صلصال', 'مسدس مياه', 'عرائس']
  },
  'sub-games-2': {
    name: 'ألعاب فيديو',
    categoryId: 'cat-games',
    keywords: ['بلايستيشن', 'بلاي ستيشن', 'playstation', 'ps4', 'ps5', 'اكس بوكس', 'xbox', 'نينتندو', 'nintendo', 'دراع تحكم', 'كنترولر', 'شريط العاب', 'اسطوانة العاب', 'كراسي جيمينج', 'جيمينج']
  },

  // Office
  'sub-office-1': {
    name: 'كتب',
    categoryId: 'cat-office',
    keywords: ['كتاب', 'كتب', 'رواية', 'روايات', 'قصة', 'قصص', 'مصحف', 'قاموس', 'معجم', 'مجلد']
  },
  'sub-office-2': {
    name: 'أدوات مكتبية',
    categoryId: 'cat-office',
    keywords: ['قلم', 'اقلام', 'قلم جاف', 'قلم رصاص', 'ألوان', 'كشكول', 'دفتر', 'كشاكيل', 'دفاتر', 'مسطرة', 'براية', 'استيكة', 'ممحاة', 'مقلمة', 'دباسة', 'خرامة', 'دبابيس', 'ورق تصوير', 'ورق a4', 'طابعة', 'حبر طابعة', 'الة حاسبة', 'دوسيه']
  }
};

/**
 * Normalizes Unicode presentation forms (U+FB50–U+FDFF, U+FE70–U+FEFF)
 */
function mapPresentationForms(str) {
  if (!str) return '';
  return str.normalize('NFKD')
    .replace(/\u0640/g, '') // Remove tatweel
    .replace(/\u06CC/g, '\u064A') // Farsi yeh to Arabic yeh
    .replace(/\u06A9/g, '\u0643'); // Farsi kaf to Arabic kaf
}

/**
 * Clean common artifacts in reversed visual Arabic from PDF generators
 */
function cleanArabicWord(word) {
  const dict = {
    'بمعلد': 'بمعدل',
    'أنورديد': 'أندرويد',
    'دﯾدروﻧأ': 'أندرويد',
    'كدو': 'كود',
    'التليفنو': 'التليفون',
    'محملو': 'محمول',
    'بور': 'برو',
    'متةروط': 'متطورة',
    'نذٔا': 'أذن',
    'نذأ': 'أذن',
    'قھةو': 'قهوة',
    'قهةو': 'قهوة',
    'ؤاتوماتيكية': 'وأوتوماتيكية',
    'كھربأيي': 'كهربائي',
    'كهربأيي': 'كهربائي',
    'كھربأيية': 'كهربائية',
    'كهربأيية': 'كهربائية',
    'ميكووريف': 'ميكروويف',
    'مارقبة': 'مراقبة',
    'كاميار': 'كاميرا',
    'بنود': 'بدون',
    'الھاوء': 'الهواء',
    'الهاوء': 'الهواء',
    'بالمنلز': 'بالمنزل',
    'ھاؤيية': 'هوائية',
    'هاؤيية': 'هوائية',
    'مقالة': 'قلاية',
    'وارتر': 'راوتر',
    'بارو': 'باور',
    'فنر': 'فرن',
    'وثﺗوﻠﺑ': 'بلوتوث',
    'بلوتثو': 'بلوتوث',
    'ميناز': 'ميزان',
    'واةﻛﻣ': 'مكواة',
    'مكةاو': 'مكواة',
    'وتﺻ': 'صوت',
    'صتو': 'صوت',
    'ومﺎﻘﻣ': 'مقاوم',
    'مقامو': 'مقاوم',
    'ونﯾزﻔﻠﺗﻟا': 'التلفزيون',
    'التلفزينو': 'التلفزيون',
    'وزعﻣ': 'موزع',
    'مدوز': 'مزود',
    'زرﯾﻠﻟﺎﺑ': 'بالليزر',
    'بالليرز': 'بالليزر',
    'ظفﻧﻣ': 'منظف',
    'منفظ': 'منظف',
    'ازإلة': 'إزالة',
    'مجودز': 'مزدوج',
    'عمدوية': 'عمودية',
    'للمالبس': 'للملابس',
    'بمدخالت': 'بمدخلات',
    'وماسو': 'وماوس',
    'لأللعاب': 'للألعاب',
    'ياو': 'واي',
    'هللا': 'الله',
    'إلكتورنيات': 'إلكترونيات',
    'الكتورنيات': 'إلكترونيات',
    'أجهةز': 'أجهزة',
    'سياةر': 'سيارة',
    'شاد': 'داش',
    'قاتارور': 'قارورات'
  };
  return dict[word] || word;
}

/**
 * Decodes visual Arabic text (which appears in PDFs that output RTL text in LTR byte order)
 */
function decodeVisualArabic(text) {
  if (!text) return '';
  const isVisual = /[\uFB50-\uFDFF\uFE70-\uFEFF]/.test(text) || /(?:ودﻛ|رﺟﺎﺗﻟا|ﺞﺗﻧﻣﻟا|زنﺧﻣﻟا|ونﻔﯾﻠﺗﻟا|ﺔﺷﺎﺷ|ﺔﯾﻛذ|ﺔﺻوﺑ|لﺑﻘﺗﺳﻣﻟا)/.test(text);
  if (!isVisual) return text.trim();

  // Normalize punctuation spacing
  const cleanPunct = text.replace(/([،؛:!?])([^\s])/g, '$1 $2');
  const tokens = cleanPunct.trim().split(/\s+/).filter(Boolean);
  const reversedTokens = tokens.reverse();
  const decoded = reversedTokens.map(tok => {
    // Only reverse if token has Arabic letters
    const hasArabicLetters = /[\u0621-\u064A\uFB50-\uFDFF\uFE70-\uFEFF]/.test(tok.replace(/[،؛؟.,:\-!]/g, ''));
    if (hasArabicLetters) {
      let norm = mapPresentationForms(tok);
      let rev = norm.split('').reverse().join('');
      rev = rev.replace(/ھ/g, 'ه').replace(/ٔا/g, 'أ').replace(/ٕا/g, 'إ');
      return cleanArabicWord(rev);
    }
    return tok;
  }).join(' ');

  return cleanArabicWord(decoded.replace(/\s+/g, ' ').trim());
}

/**
 * Robust price parser that preserves decimal dots and handles Arabic (٠-٩) & English digits (0-9)
 */
function parsePrice(str) {
  if (str === undefined || str === null || str === '') return 0;
  if (typeof str === 'number') return Number.isFinite(str) ? Math.max(0, str) : 0;
  let normalized = normalizeNumerals(String(str));
  normalized = normalized
    .replace(/ج\.?\s*م\.?/gi, ' ')
    .replace(/م\.?\s*ج\.?/gi, ' ')
    .replace(/l\.?\s*e\.?/gi, ' ')
    .replace(/\b(?:egp|usd|sar|le|جنيه|ج|جم|ريال)\b/gi, ' ')
    .replace(/,/g, '')
    .trim();
  const m = normalized.match(/(\d+(?:\.\d{1,2})?)/);
  return m ? parseFloat(m[1]) : 0;
}

/**
 * Robust stock/integer parser supporting Arabic (٠-٩) & English numerals
 */
function parseStock(str, fallback = 10) {
  if (str === undefined || str === null || str === '') return fallback;
  if (typeof str === 'number') return Number.isFinite(str) && str >= 0 ? Math.round(str) : fallback;
  const normalized = normalizeNumerals(String(str)).replace(/,/g, '');
  const m = normalized.match(/(\d+)/);
  if (!m) return fallback;
  const val = parseInt(m[1], 10);
  return Number.isFinite(val) ? Math.max(0, val) : fallback;
}

function decodeHtmlEntities(str) {
  if (!str) return '';
  return str
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, num) => String.fromCharCode(parseInt(num, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

function stripRtf(rtf) {
  if (!rtf) return '';
  return rtf
    .replace(/\\par[d]?/gi, '\n')
    .replace(/\\line\b/gi, '\n')
    .replace(/\\row\b/gi, '\n')
    .replace(/\\cell\b/gi, '\t')
    .replace(/\\tab\b/gi, '\t')
    .replace(/\\u(-?\d+)\??/g, (_, code) => {
      const n = parseInt(code, 10);
      return String.fromCharCode(n < 0 ? n + 65536 : n);
    })
    .replace(/\{\\\*\\[^}]+\}/g, '')
    .replace(/\\[a-z]+-?\d*\s?/gi, '')
    .replace(/[{}]/g, '')
    .replace(/\r/g, '')
    .trim();
}

function extractTablesAndTextFromHtml(html) {
  const tables = [];
  if (!html) return { tables, nonTableText: '', fullText: '' };

  const cleanedHtml = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '');

  const tableRegex = /<table\b[^>]*>([\s\S]*?)<\/table>/gi;
  const tableBlocksAsTsv = [];

  const withoutTablesHtml = cleanedHtml.replace(tableRegex, (_, tableInner) => {
    const rows = [];
    const trRegex = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
    let trMatch;
    while ((trMatch = trRegex.exec(tableInner)) !== null) {
      const cells = [];
      const tdRegex = /<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi;
      let tdMatch;
      while ((tdMatch = tdRegex.exec(trMatch[1])) !== null) {
        const cellText = decodeHtmlEntities(
          tdMatch[1]
            .replace(/<(?:br|\/p|\/div|\/li|\/h[1-6])\b[^>]*>/gi, ' ')
            .replace(/<[^>]+>/g, '')
        )
          .replace(/\s+/g, ' ')
          .trim();
        cells.push(cellText);
      }
      if (cells.some(c => c.length > 0)) {
        rows.push(cells);
      }
    }
    if (rows.length > 0) {
      tables.push(rows);
      tableBlocksAsTsv.push(rows.map(r => r.join('\t')).join('\n'));
    }
    return '\n';
  });

  const nonTableText = decodeHtmlEntities(
    withoutTablesHtml
      .replace(/<(?:br|\/p|\/div|\/li|\/h[1-6]|hr)\b[^>]*>/gi, '\n')
      .replace(/<li\b[^>]*>/gi, '\n- ')
      .replace(/<[^>]+>/g, '')
  )
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{2,}/g, '\n')
    .trim();

  const fullText = [nonTableText, ...tableBlocksAsTsv].filter(Boolean).join('\n').trim();
  return { tables, nonTableText, fullText };
}

const EXCEL_EXTENSIONS = new Set(['.xlsx', '.xls', '.xlsm', '.csv', '.ods']);
const WORD_EXTENSIONS = new Set(['.docx', '.doc', '.rtf']);
const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', '.avif', '.jfif', '.heic', '.heif']);

/**
 * Intelligent Unified Document & Sheet Parser (Images, PDF, Excel, Word, Text)
 */
class SmartProductExtractor {
  /**
   * Determine normalized document kind using filename extension, MIME type, and binary signatures
   */
  static detectFileKind({ fileBuffer, filePath, originalName, mimeType = '' }) {
    const ext = path.extname(originalName || filePath || '').toLowerCase();
    const mt = (mimeType || '').toLowerCase();

    if (mt.startsWith('image/') || IMAGE_EXTENSIONS.has(ext)) return 'image';
    if (ext === '.pdf' || mt === 'application/pdf') return 'pdf';

    if (fileBuffer && Buffer.isBuffer(fileBuffer) && fileBuffer.length >= 4) {
      const headAscii = fileBuffer.slice(0, 5).toString('ascii');
      if (headAscii.startsWith('%PDF')) return 'pdf';

      const magic2 = fileBuffer.readUInt16BE(0);
      if (magic2 === 0xd0cf) {
        if (ext === '.xls' || mt.includes('excel') || mt.includes('spreadsheet')) return 'excel';
        return 'word';
      }
      if (magic2 === 0x504b) {
        if (EXCEL_EXTENSIONS.has(ext) || mt.includes('spreadsheet') || mt.includes('excel')) return 'excel';
        if (WORD_EXTENSIONS.has(ext) || mt.includes('wordprocessing') || mt.includes('msword')) return 'word';
        if (fileBuffer.includes(Buffer.from('xl/'))) return 'excel';
        if (fileBuffer.includes(Buffer.from('word/'))) return 'word';
      }
    }

    if (EXCEL_EXTENSIONS.has(ext) || mt.includes('spreadsheet') || mt.includes('excel') || mt.includes('csv')) {
      return 'excel';
    }
    if (WORD_EXTENSIONS.has(ext) || mt.includes('wordprocessing') || mt.includes('msword') || mt.includes('ms-word') || mt.includes('rtf')) {
      return 'word';
    }
    if (['.txt', '.tsv'].includes(ext) || mt.startsWith('text/')) {
      return 'text';
    }
    return 'unknown';
  }

  /**
   * Extract plain text from PDF buffer
   */
  static async extractFromPdf(buf) {
    try {
      if (typeof pdfParseModule === 'function') {
        const pdfData = await pdfParseModule(buf);
        return pdfData.text || '';
      }
      if (pdfParseModule && pdfParseModule.PDFParse) {
        const parser = new pdfParseModule.PDFParse(new Uint8Array(buf));
        await parser.load();
        const res = await parser.getText();
        return typeof res === 'string' ? res : (res?.text || '');
      }
    } catch (err) {
      console.warn('[SmartExtractor] PDF parse warning:', err.message);
    }
    return '';
  }

  /**
   * Extract structured tables and text from Excel (.xlsx, .xls, .xlsm, .csv, .ods)
   */
  static extractFromExcel(buf, ext = '') {
    const tables = [];
    const tsvSections = [];
    try {
      let workbook;
      if (ext === '.csv') {
        const utf8Csv = buf.toString('utf8').replace(/^\uFEFF/, '');
        workbook = XLSX.read(utf8Csv, { type: 'string', raw: false });
      } else {
        workbook = XLSX.read(buf, { type: 'buffer', cellDates: true, raw: false });
      }

      for (const sheetName of workbook.SheetNames || []) {
        const sheet = workbook.Sheets[sheetName];
        if (!sheet) continue;

        const rawRows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', blankrows: false });
        const cleanedRows = rawRows
          .map(row => (Array.isArray(row) ? row : []).map(cell => {
            if (cell === null || cell === undefined) return '';
            if (cell instanceof Date && !isNaN(cell.getTime())) {
              return cell.toISOString().split('T')[0];
            }
            return String(cell).replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
          }))
          .filter(row => row.some(c => c.length > 0));

        if (cleanedRows.length > 0) {
          tables.push(cleanedRows);
          tsvSections.push(cleanedRows.map(r => r.join('\t')).join('\n'));
        }
      }
    } catch (err) {
      console.warn('[SmartExtractor] Excel parse warning:', err.message);
    }

    return {
      tables,
      nonTableText: '',
      fullText: tsvSections.join('\n').trim()
    };
  }

  /**
   * Extract structured tables and text from Word (.docx, .doc, .rtf)
   */
  static async extractFromWord(buf, ext = '') {
    const isBinaryOle = buf.length >= 2 && buf.readUInt16BE(0) === 0xd0cf;
    const isZipOoxml = buf.length >= 2 && buf.readUInt16BE(0) === 0x504b;

    // 1. Check RTF or HTML-disguised .doc files first when not OLE/Zip binary
    if (!isBinaryOle && !isZipOoxml) {
      const sampleUtf8 = buf.toString('utf8', 0, Math.min(buf.length, 4096)).replace(/^\uFEFF/, '').trim();
      if (sampleUtf8.startsWith('{\\rtf')) {
        const stripped = stripRtf(buf.toString('utf8'));
        return { tables: [], nonTableText: stripped, fullText: stripped };
      }
      if (/<(?:html|table|tr|body)\b/i.test(sampleUtf8)) {
        return extractTablesAndTextFromHtml(buf.toString('utf8'));
      }
    }

    // 2. Modern .docx (OOXML) - Mammoth preserves HTML tables cleanly; WordExtractor adds headers/textboxes
    if (isZipOoxml || ext === '.docx') {
      let htmlParsed = { tables: [], nonTableText: '', fullText: '' };
      try {
        const mammothRes = await mammoth.convertToHtml({ buffer: buf });
        if (mammothRes && mammothRes.value) {
          htmlParsed = extractTablesAndTextFromHtml(mammothRes.value);
        }
      } catch (err) {
        console.warn('[SmartExtractor] Mammoth DOCX parse warning:', err.message);
      }

      let extraMetaText = '';
      let fallbackBodyText = '';
      try {
        const extractor = new WordExtractor();
        const doc = await extractor.extract(buf);
        const headerParts = [doc.getHeaders(), doc.getHeaderTextboxes(), doc.getTextboxes()]
          .filter(Boolean)
          .join('\n')
          .trim();
        if (headerParts) extraMetaText = headerParts;
        if (!htmlParsed.fullText) {
          fallbackBodyText = doc.getBody() || '';
        }
      } catch (err) {
        console.warn('[SmartExtractor] WordExtractor DOCX supplemental warning:', err.message);
      }

      const combinedNonTable = [extraMetaText, htmlParsed.nonTableText || fallbackBodyText].filter(Boolean).join('\n').trim();
      const combinedFull = [extraMetaText, htmlParsed.fullText || fallbackBodyText].filter(Boolean).join('\n').trim();
      return {
        tables: htmlParsed.tables,
        nonTableText: combinedNonTable,
        fullText: combinedFull
      };
    }

    // 3. Legacy .doc (OLE2 binary) via WordExtractor
    try {
      const extractor = new WordExtractor();
      const doc = await extractor.extract(buf);
      const parts = [
        doc.getHeaders(),
        doc.getHeaderTextboxes(),
        doc.getTextboxes(),
        doc.getBody(),
        doc.getFootnotes()
      ].filter(Boolean);

      let rawBody = parts.join('\n').trim();
      // In classic OLE .doc files, Word table cells use \x07 (-> \t) and end-of-row adds another \x07 (-> \t\t).
      // Normalize \t\t row boundaries when rows aren't already separated by \n.
      if (rawBody) {
        const hasNewlineAfterDoubleTab = /\t\t\r?\n/.test(rawBody);
        if (hasNewlineAfterDoubleTab) {
          rawBody = rawBody.replace(/\t+(?=\r?\n)/g, '');
        } else if (/\t{2,}[^\t\r\n]/.test(rawBody)) {
          rawBody = rawBody.replace(/\t{2,}/g, '\n');
        }
      }

      return { tables: [], nonTableText: rawBody, fullText: rawBody };
    } catch (docErr) {
      console.warn('[SmartExtractor] WordExtractor DOC parse warning:', docErr.message);
      // Fallback: sometimes a .docx file was renamed with .doc extension
      try {
        const mammothRes = await mammoth.convertToHtml({ buffer: buf });
        if (mammothRes && mammothRes.value) {
          return extractTablesAndTextFromHtml(mammothRes.value);
        }
      } catch (e) {}
    }

    return { tables: [], nonTableText: '', fullText: '' };
  }

  /**
   * Main entry point for Images, PDFs, Excel (.xlsx, .xls, .csv), Word (.docx, .doc), and Raw Text
   */
  static async extract({ fileBuffer, filePath, originalName, mimeType, rawText, presets = {}, categories = [], subcategories = [] }) {
    let buf = fileBuffer || null;
    if (!buf && filePath && fs.existsSync(filePath)) {
      try {
        buf = fs.readFileSync(filePath);
      } catch (e) {
        console.warn('[SmartExtractor] File read warning:', e.message);
      }
    }

    const fileKind = this.detectFileKind({ fileBuffer: buf, filePath, originalName, mimeType });
    const ext = path.extname(originalName || filePath || '').toLowerCase();

    let nonTableText = rawText || '';
    let fullText = rawText || '';
    const structuredTables = [];

    if (buf) {
      if (fileKind === 'pdf') {
        const pdfText = await this.extractFromPdf(buf);
        if (pdfText) {
          nonTableText = (nonTableText + '\n' + pdfText).trim();
          fullText = (fullText + '\n' + pdfText).trim();
        }
      } else if (fileKind === 'excel') {
        const excelRes = this.extractFromExcel(buf, ext);
        structuredTables.push(...excelRes.tables);
        if (excelRes.fullText) {
          fullText = (fullText + '\n' + excelRes.fullText).trim();
        }
      } else if (fileKind === 'word') {
        const wordRes = await this.extractFromWord(buf, ext);
        structuredTables.push(...wordRes.tables);
        if (wordRes.nonTableText) {
          nonTableText = (nonTableText + '\n' + wordRes.nonTableText).trim();
        }
        if (wordRes.fullText) {
          fullText = (fullText + '\n' + wordRes.fullText).trim();
        }
      } else if (fileKind === 'text' || filePath?.match(/\.(txt|csv|tsv|json)$/i)) {
        try {
          const txt = buf.toString('utf8').replace(/^\uFEFF/, '');
          nonTableText = (nonTableText + '\n' + txt).trim();
          fullText = (fullText + '\n' + txt).trim();
        } catch (e) {}
      }
    }

    const geminiKey = process.env.GEMINI_API_KEY;

    // 1. For Images or scanned PDFs (little/no selectable text), try Gemini Multimodal Vision if key is configured
    const isImageOrScannedPdf = fileKind === 'image' || (fileKind === 'pdf' && fullText.replace(/\s+/g, '').length < 40);
    if (geminiKey && buf && isImageOrScannedPdf) {
      try {
        const geminiResult = await this.extractWithGemini({
          fileBuffer: buf,
          mimeType: mimeType || (fileKind === 'pdf' ? 'application/pdf' : 'image/jpeg'),
          textToParse: fullText,
          presets,
          geminiKey,
          categories,
          subcategories,
          sendFileInline: true
        });
        if (geminiResult && Array.isArray(geminiResult.products) && geminiResult.products.length > 0) {
          return this.enrichExtractedData(geminiResult, presets, categories, subcategories);
        }
      } catch (geminiErr) {
        console.warn('[SmartExtractor] Gemini API extraction fallback to unified parser:', geminiErr.message);
      }
    }

    // 2. Unified Deterministic & Semantic Parser (Excel sheets, Word tables/prose, PDF text, CSV, raw text)
    const unifiedResult = this.parseUnified({
      fullText,
      nonTableText,
      structuredTables,
      presets,
      categories,
      subcategories
    });

    if (unifiedResult.success) {
      return unifiedResult;
    }

    // 3. If deterministic parser found no products in unstructured Word/PDF prose and Gemini key exists, use Gemini on extracted text
    if (geminiKey && fullText.trim().length > 10) {
      try {
        const geminiResult = await this.extractWithGemini({
          fileBuffer: buf,
          mimeType,
          textToParse: fullText,
          presets,
          geminiKey,
          categories,
          subcategories,
          sendFileInline: false
        });
        if (geminiResult && Array.isArray(geminiResult.products) && geminiResult.products.length > 0) {
          return this.enrichExtractedData(geminiResult, presets, categories, subcategories);
        }
      } catch (geminiErr) {
        console.warn('[SmartExtractor] Gemini text extraction fallback warning:', geminiErr.message);
      }
    }

    return unifiedResult;
  }

  /**
   * Extract Merchant / Investor metadata from text lines or initial table key-value rows
   */
  static extractMetadata(lines = [], presets = {}) {
    let merchantCode = '';
    let merchantName = '';
    let merchantPhone = presets.targetMerchantPhone || '';
    let ownerType = '';
    let investorCode = '';
    let investorName = '';
    let capital = null;

    for (let i = 0; i < Math.min(20, lines.length); i++) {
      const line = lines[i];
      if (!line) continue;

      if (line.includes('\t')) {
        const parts = line.split('\t').map(p => p.trim());
        for (let pIdx = 0; pIdx < parts.length; pIdx++) {
          const part = parts[pIdx];
          if (!part) continue;
          const decodedPart = decodeVisualArabic(part);
          const partNorm = normalizeNumerals(decodedPart);

          // Investor code
          if (!investorCode) {
            const invCodeMatch = partNorm.match(/\b(INV-[A-Z0-9\-]{2,15})\b/i);
            if (invCodeMatch) {
              investorCode = invCodeMatch[1].toUpperCase();
              ownerType = 'investor';
            } else if (/(?:كود\s*المستثمر|investor\s*code)/i.test(partNorm)) {
              const nextVal = parts.slice(pIdx + 1).find(v => v.trim().length > 0);
              if (nextVal) {
                investorCode = normalizeNumerals(decodeVisualArabic(nextVal)).trim().toUpperCase();
                ownerType = 'investor';
              }
            }
          }

          // Merchant code
          if (!merchantCode) {
            const trMatch = partNorm.match(/\b((?:TR|M|MR)-[A-Z0-9\-]{2,15})\b/i);
            if (trMatch) {
              merchantCode = trMatch[1].toUpperCase();
            } else if (/(?:كود\s*التاجر|merchant\s*code)/i.test(partNorm)) {
              const nextVal = parts.slice(pIdx + 1).find(v => v.trim().length > 0);
              if (nextVal) {
                merchantCode = normalizeNumerals(decodeVisualArabic(nextVal)).trim().toUpperCase();
              }
            }
          }

          // Phone
          if (!merchantPhone) {
            const phoneM = partNorm.match(/01[0125][0-9]{8}/);
            if (phoneM) merchantPhone = phoneM[0];
          }

          // Investor Name
          if (!investorName && /(?:اسم\s*المستثمر|investor\s*name)/i.test(partNorm)) {
            const nextVal = parts.slice(pIdx + 1).find(v => v.trim().length > 0 && !/^(?:INV|TR|M)-/i.test(v));
            if (nextVal && !/كود/i.test(nextVal)) {
              investorName = decodeVisualArabic(nextVal).replace(/هللا/g, 'الله').trim();
              ownerType = 'investor';
            }
          }

          // Capital
          if (capital === null && /(?:رأس\s*المال|راس\s*المال|capital)/i.test(partNorm)) {
            const inlineCap = partNorm.match(/[:=]\s*([\d,\.]+)/);
            if (inlineCap) {
              const val = parsePrice(inlineCap[1]);
              if (val > 0) capital = val;
            } else {
              const nextVal = parts.slice(pIdx + 1).find(v => v.trim().length > 0 && /\d/.test(normalizeNumerals(v)));
              if (nextVal) {
                const val = parsePrice(nextVal);
                if (val > 0) capital = val;
              }
            }
          }

          // Merchant Name
          if (!merchantName && (part.includes('مﺳا') || /اسم\s*التاجر|merchant\s*name|:رﺟﺎﺗﻟا مﺳا/i.test(partNorm))) {
            const nextVal = parts.slice(pIdx + 1).find(v => v.trim().length > 0 && !v.includes('ودﻛ') && !/^(?:TR|M|INV)-/i.test(v));
            if (nextVal) {
              merchantName = decodeVisualArabic(nextVal).replace(/هللا/g, 'الله').trim();
            }
          }
        }
      } else {
        const decoded = decodeVisualArabic(line);
        const norm = normalizeNumerals(decoded);

        if (!investorCode) {
          const ic = norm.match(/(?:كود\s*المستثمر|investor\s*code)[\s:=#\-]+([A-Za-z0-9_\-]+)/i) || norm.match(/\b(INV-[A-Z0-9\-]{2,15})\b/i);
          if (ic) {
            investorCode = ic[1].toUpperCase();
            ownerType = 'investor';
          }
        }
        if (!investorName) {
          const iname = norm.match(/(?:اسم\s*المستثمر|investor\s*name)[\s:=#\-]+([^:=\d\t\r\n]+)/i);
          if (iname && iname[1].trim().length > 1) {
            investorName = iname[1].trim().replace(/هللا/g, 'الله');
            ownerType = 'investor';
          }
        }
        if (capital === null) {
          const capM = norm.match(/(?:رأس\s*المال|راس\s*المال|capital)[\s:=#\-]+([\d,\.]+)/i);
          if (capM) {
            const v = parsePrice(capM[1]);
            if (v > 0) capital = v;
          }
        }
        if (!merchantCode) {
          const c = norm.match(/(?:كود\s*التاجر|merchant\s*code)[\s:=#\-]+([A-Za-z0-9_\-]+)/i) || norm.match(/\b((?:TR|M|MR)-[A-Z0-9\-]{2,15})\b/i);
          if (c) merchantCode = c[1].toUpperCase();
        }
        if (!merchantName) {
          const n = norm.match(/(?:اسم\s*التاجر|merchant\s*name)[\s:=#\-]+([^:=\d\t\r\n]+)/i);
          if (n && n[1].trim().length > 1) merchantName = n[1].trim().replace(/هللا/g, 'الله');
        }
        if (!merchantPhone) {
          const p = norm.match(/01[0125][0-9]{8}/);
          if (p) merchantPhone = p[0].trim();
        }
      }
    }

    if (!ownerType && presets.ownerType === 'investor') {
      ownerType = 'investor';
    } else if (!ownerType && (merchantCode || presets.ownerType === 'merchant' || presets.targetMerchantCode)) {
      ownerType = 'merchant';
    }

    const isInv = ownerType === 'investor';
    const finalInvCode = isInv ? (investorCode || presets.targetInvestorCode || '') : '';
    const finalInvName = isInv ? (investorName || presets.targetInvestorName || '') : '';
    const finalMerchCode = isInv ? '' : (merchantCode || presets.targetMerchantCode || '');
    const finalMerchName = isInv ? '' : (merchantName || presets.targetMerchantName || '');

    return {
      ownerType: ownerType || '',
      investorCode: finalInvCode,
      investorName: finalInvName,
      capital: isInv ? capital : null,
      merchantCode: finalMerchCode,
      merchantName: finalMerchName,
      merchantPhone
    };
  }

  /**
   * Detect exact column mapping for an Excel, Word, PDF, or TSV table header row
   */
  static detectColumnMap(parts = []) {
    const map = {};
    let matchCount = 0;

    parts.forEach((rawCell, colIdx) => {
      const p = decodeVisualArabic(String(rawCell || '')).trim();
      const pLower = normalizeNumerals(p).toLowerCase().replace(/[\r\n]+/g, ' ').trim();
      if (!pLower) return;

      let matched = false;

      if (/^(#|م|مسلسل|رقم|no\.?|id|seq)$/i.test(pLower)) {
        map.seq = colIdx;
        matched = true;
      } else if (/(?:sku|barcode|باركود|كود\s*المنتج|رقم\s*الصنف)/i.test(pLower) && !pLower.includes('تاجر') && !pLower.includes('مستثمر')) {
        map.sku = colIdx;
        matched = true;
      } else if (/(?:فرعي|sub[\s\-_]*cat)/i.test(pLower)) {
        map.subcategory = colIdx;
        matched = true;
      } else if (/(?:قسم|تصنيف|فئة|category|dept|department)/i.test(pLower)) {
        if (map.category === undefined) map.category = colIdx;
        matched = true;
      } else if (/(?:وصف|تفاصيل|مواصفات|description|desc|details)/i.test(pLower)) {
        map.description = colIdx;
        matched = true;
      } else if (
        /(?:اسم\s*(?:ال)?منتج|اسم\s*(?:ال)?صنف|المنتج|الصنف|العنوان|product\s*name|item\s*name|title|product|item)/i.test(pLower) ||
        pLower === 'اسم' || pLower === 'الاسم' || pLower === 'name'
      ) {
        if (!pLower.includes('تاجر') && !pLower.includes('مستثمر') && !pLower.includes('عميل')) {
          map.title = colIdx;
          matched = true;
        }
      } else if (/(?:ماركة|علامة\s*تجارية|براند|brand)/i.test(pLower)) {
        map.brand = colIdx;
        matched = true;
      } else if (/(?:تكلفة|توريد|جملة|شراء|اساسي|أساسي|cost|wholesale|base\s*price|supply)/i.test(pLower)) {
        map.costPrice = colIdx;
        matched = true;
      } else if (/(?:قبل\s*الخصم|قبل|أصلي|اصلي|قديم|مشطوب|compare|before\s*discount|original\s*price|old\s*price|mrp)/i.test(pLower)) {
        map.compareAtPrice = colIdx;
        matched = true;
      } else if (/(?:بعد\s*الخصم|سعر\s*البيع|نهائي|البيع|السعر|سعر|selling\s*price|sale\s*price|final\s*price|price)/i.test(pLower)) {
        map.price = colIdx;
        matched = true;
      } else if (/(?:مخزون|كمية|الكمية|المخزون|الرصيد|عدد\s*القطع|العدد|stock|qty|quantity|count|inventory)/i.test(pLower)) {
        map.stock = colIdx;
        matched = true;
      } else if (/(?:شحن|توصيل|مصاريف\s*الشحن|shipping|delivery)/i.test(pLower)) {
        map.shipping = colIdx;
        matched = true;
      } else if (/(?:وحدة|unit)/i.test(pLower)) {
        map.saleUnit = colIdx;
        matched = true;
      }

      if (matched) matchCount++;
    });

    if (matchCount >= 2 && (map.title !== undefined || map.price !== undefined || map.costPrice !== undefined || map.compareAtPrice !== undefined)) {
      return map;
    }
    return null;
  }

  /**
   * Parse a single row array using an explicit columnMap or smart positional inference
   */
  static parseTableRowCells(parts = [], columnMap = null, presets = {}) {
    const defaultStock = Number(presets.defaultStock) > 0 ? Number(presets.defaultStock) : 10;
    const defaultShipping = Number(presets.defaultShippingPrice) >= 0 ? Number(presets.defaultShippingPrice) : 20;

    const cleanParts = parts.map(p => decodeVisualArabic(String(p || '')).trim());
    const joinedLower = normalizeNumerals(cleanParts.join(' ')).toLowerCase();

    // Skip totals, metadata rows, and pure page headers
    if (!joinedLower || /(?:إجمالي|الاجمالي|المجموع|grand\s*total|subtotal|صفحة|تقرير\s*منتجات)/i.test(cleanParts[0])) {
      return null;
    }
    if (/^(?:كود\s*(?:التاجر|المستثمر)|اسم\s*(?:التاجر|المستثمر)|رقم\s*الهاتف|رأس\s*المال)/i.test(cleanParts[0])) {
      return null;
    }

    let title = '';
    let description = '';
    let cat = '';
    let sub = '';
    let brand = '';
    let sku = '';
    let saleUnit = '';
    let cost = 0;
    let orig = 0;
    let sell = 0;
    let stock = defaultStock;
    let ship = defaultShipping;

    if (columnMap) {
      title = columnMap.title !== undefined ? (cleanParts[columnMap.title] || '') : '';
      description = columnMap.description !== undefined ? (cleanParts[columnMap.description] || '') : '';
      cat = columnMap.category !== undefined ? (cleanParts[columnMap.category] || '') : '';
      sub = columnMap.subcategory !== undefined ? (cleanParts[columnMap.subcategory] || '') : '';
      brand = columnMap.brand !== undefined ? (cleanParts[columnMap.brand] || '') : '';
      sku = columnMap.sku !== undefined ? (cleanParts[columnMap.sku] || '') : '';
      saleUnit = columnMap.saleUnit !== undefined ? (cleanParts[columnMap.saleUnit] || '') : '';

      cost = columnMap.costPrice !== undefined ? parsePrice(cleanParts[columnMap.costPrice]) : 0;
      orig = columnMap.compareAtPrice !== undefined ? parsePrice(cleanParts[columnMap.compareAtPrice]) : 0;
      sell = columnMap.price !== undefined ? parsePrice(cleanParts[columnMap.price]) : 0;

      if (columnMap.stock !== undefined && cleanParts[columnMap.stock] !== '') {
        stock = parseStock(cleanParts[columnMap.stock], defaultStock);
      }

      if (columnMap.shipping !== undefined && cleanParts[columnMap.shipping] !== '') {
        const shipRaw = normalizeNumerals(cleanParts[columnMap.shipping]).toLowerCase();
        if (/(?:مجاني|مجاناً|free|^0(?:\.0+)?$)/i.test(shipRaw)) {
          ship = 0;
        } else {
          const parsedShip = parsePrice(shipRaw);
          if (parsedShip > 0) ship = parsedShip;
        }
      }

      if (!title && description) {
        title = description;
      }
    }

    // Positional fallback if columnMap is missing or didn't find title/prices
    if (!columnMap) {
      const nonEmpty = cleanParts.filter(c => c.length > 0);
      if (nonEmpty.length < 2) return null;

      let startIdx = 0;
      if (/^\d{1,3}$/.test(normalizeNumerals(nonEmpty[0]))) {
        startIdx = 1;
      }
      if (startIdx >= nonEmpty.length) return null;

      title = nonEmpty[startIdx];
      // Reject purely numeric titles
      if (/^[\d\.,\s]+$/.test(normalizeNumerals(title))) return null;

      const remaining = nonEmpty.slice(startIdx + 1);
      const numericIndices = [];
      const textCols = [];
      remaining.forEach((cell, idx) => {
        const normCell = normalizeNumerals(cell);
        const numVal = parsePrice(cell);
        const hasLettersOtherThanUnit = /[\u0621-\u064Aa-zA-Z]{2,}/.test(
          normCell
            .replace(/ج\.?\s*م\.?|م\.?\s*ج\.?|l\.?\s*e\.?|egp|جنيه|قطعة|قطع|pcs|مجاني|free/gi, '')
            .trim()
        );
        if (numVal > 0 && !hasLettersOtherThanUnit) {
          numericIndices.push({ idx, val: numVal, raw: cell });
        } else if (cell.length >= 2) {
          textCols.push(cell);
        }
      });

      if (textCols.length >= 1) cat = textCols[0];
      if (textCols.length >= 2) sub = textCols[1];

      if (numericIndices.length >= 5) {
        cost = numericIndices[0].val;
        orig = numericIndices[1].val;
        sell = numericIndices[2].val;
        stock = Math.max(1, Math.round(numericIndices[3].val));
        ship = numericIndices[4].val;
      } else if (numericIndices.length === 4) {
        if (numericIndices[0].val < numericIndices[1].val && numericIndices[1].val >= numericIndices[2].val) {
          cost = numericIndices[0].val;
          orig = numericIndices[1].val;
          sell = numericIndices[2].val;
          stock = Math.max(1, Math.round(numericIndices[3].val));
        } else {
          orig = numericIndices[0].val;
          sell = numericIndices[1].val;
          stock = Math.max(1, Math.round(numericIndices[2].val));
          ship = numericIndices[3].val;
        }
      } else if (numericIndices.length === 3) {
        const [a, b, c] = numericIndices.map(n => n.val);
        if (a < b && c <= b && c >= a) {
          cost = a;
          orig = b;
          sell = c;
        } else if (a >= b) {
          orig = a;
          sell = b;
          stock = Math.max(1, Math.round(c));
        } else {
          cost = a;
          sell = b;
          stock = Math.max(1, Math.round(c));
        }
      } else if (numericIndices.length === 2) {
        const [a, b] = numericIndices;
        if (/(?:ج\.?\s*م|egp|جنيه|سعر)/i.test(b.raw) && !/(?:قطعة|مخزون|كمية)/i.test(b.raw) && a.val < b.val) {
          cost = a.val;
          sell = b.val;
        } else {
          sell = a.val;
          stock = Math.max(1, Math.round(b.val));
        }
      } else if (numericIndices.length === 1) {
        sell = numericIndices[0].val;
      }
    }

    if (!title || title.length < 2) return null;
    if (sell <= 0 && orig <= 0 && cost <= 0) return null;

    return {
      title,
      description: description || title,
      categoryHint: cat,
      subcategoryHint: sub,
      brand,
      sku,
      saleUnit,
      costPrice: cost,
      compareAtPrice: orig,
      rawPrice: sell > 0 ? sell : (cost > 0 ? cost : orig),
      rawStock: Math.max(1, stock),
      shippingCost: ship
    };
  }

  /**
   * Parse an entire 2D table (from Excel sheet, Word table, or TSV lines)
   */
  static parseTableRows(rows = [], presets = {}) {
    const products = [];
    if (!Array.isArray(rows) || rows.length === 0) return products;

    let columnMap = null;
    let headerRowIndex = -1;

    // Look within first 15 rows for a header row
    for (let i = 0; i < Math.min(15, rows.length); i++) {
      const detected = this.detectColumnMap(rows[i]);
      if (detected) {
        columnMap = detected;
        headerRowIndex = i;
        break;
      }
    }

    const startIdx = headerRowIndex >= 0 ? headerRowIndex + 1 : 0;
    for (let i = startIdx; i < rows.length; i++) {
      const row = rows[i];
      if (!Array.isArray(row) || row.every(c => !String(c || '').trim())) continue;

      // Skip repeated headers (common on multi-page Word/PDF tables)
      if (columnMap && this.detectColumnMap(row)) continue;

      const parsed = this.parseTableRowCells(row, columnMap, presets);
      if (parsed) {
        products.push(parsed);
      }
    }

    return products;
  }

  /**
   * Parse single-line delimited / labeled text (e.g. from Word bullets, demo sheet, TXT)
   */
  static parsePipeOrDelimitedLine(line, presets = {}) {
    const defaultStock = Number(presets.defaultStock) > 0 ? Number(presets.defaultStock) : 10;
    const defaultShipping = Number(presets.defaultShippingPrice) >= 0 ? Number(presets.defaultShippingPrice) : 20;

    const decodedLine = decodeVisualArabic(line);
    const normLine = normalizeNumerals(decodedLine);

    const costMatch = normLine.match(/(?:التكلفة|التوريد|سعر\s*التكلفة|سعر\s*التوريد|الجملة)[\s:=#\-]+(\d+(?:\.\d+)?)/i);
    const compareMatch = normLine.match(/(?:قبل\s*الخصم|السعر\s*قبل\s*الخصم|القديم|الأصلي|السعر\s*الأصلي)[\s:=#\-]+(\d+(?:\.\d+)?)/i);
    const sellMatch = normLine.match(/(?:بعد\s*الخصم|سعر\s*البيع|البيع|السعر\s*النهائي|السعر)[\s:=#\-]+(\d+(?:\.\d+)?)/i);
    const stockMatch = normLine.match(/(?:المخزون|الكمية|العدد)[\s:=#\-]+(\d+)/i);
    const shipMatch = normLine.match(/(?:الشحن|التوصيل)[\s:=#\-]+(\d+)/i);
    const catMatch = normLine.match(/(?:القسم(?:\s*الرئيسي)?|التصنيف)[\s:=#\-]+([^|:\d\n]+)/i);
    const subMatch = normLine.match(/(?:القسم\s*الفرعي|الفرعي)[\s:=#\-]+([^|:\d\n]+)/i);

    let titleCandidate = decodedLine
      .split(/[|]/)[0]
      .replace(/\s*(?:سعر|التكلفة|التوريد|قبل\s*الخصم|بعد\s*الخصم|المخزون|الكمية|القسم)\s*[:=\-].*$/i, '')
      .replace(/^\d+[\.\)\-]\s*/, '')
      .replace(/^[\-•\*]\s*/, '')
      .trim();

    let sellVal = sellMatch ? parseFloat(sellMatch[1]) : 0;
    let costVal = costMatch ? parseFloat(costMatch[1]) : 0;
    let compareVal = compareMatch ? parseFloat(compareMatch[1]) : 0;
    let extraCatHint = catMatch ? catMatch[1].trim() : '';

    // Support pipe segments like "1. ساعة ذكية | 280 ج.م | كمية: 40 | ساعات"
    if (decodedLine.includes('|')) {
      const segments = decodedLine.split('|').map(s => s.trim()).filter(Boolean);
      for (let sIdx = 1; sIdx < segments.length; sIdx++) {
        const seg = segments[sIdx];
        const segNorm = normalizeNumerals(seg);
        if (!sellVal && /(\d+(?:\.\d+)?)\s*(?:ج\.?\s*م|م\.?\s*ج|egp|le|جنيه)/i.test(segNorm)) {
          sellVal = parsePrice(segNorm);
        } else if (!extraCatHint && !/:/.test(segNorm) && !/\d/.test(segNorm) && seg.length >= 2) {
          extraCatHint = seg;
        }
      }
    }

    if (titleCandidate.length >= 2 && (sellVal > 0 || compareVal > 0 || costVal > 0)) {
      return {
        title: titleCandidate,
        description: titleCandidate,
        categoryHint: extraCatHint,
        subcategoryHint: subMatch ? subMatch[1].trim() : '',
        costPrice: costVal,
        compareAtPrice: compareVal,
        rawPrice: sellVal > 0 ? sellVal : (costVal > 0 ? costVal : compareVal),
        rawStock: stockMatch ? parseInt(stockMatch[1], 10) : defaultStock,
        shippingCost: shipMatch ? parseFloat(shipMatch[1]) : defaultShipping
      };
    }
    return null;
  }

  /**
   * Unified combining entry point: consumes pre-extracted structured tables + remaining text
   */
  static parseUnified({ fullText = '', nonTableText = '', structuredTables = [], presets = {}, categories = [], subcategories = [] }) {
    const allLines = (fullText || nonTableText || '')
      .split(/\r?\n/)
      .map(l => l.trim())
      .filter(l => l.length > 0);

    if (allLines.length === 0 && structuredTables.length === 0) {
      return {
        success: false,
        message: 'الملف المرفوع فارغ أو لم يتم العثور على أي نصوص أو جداول بداخله. يُرجى رفع ملف يحتوي على بيانات منتجات واضحة.'
      };
    }

    const meta = this.extractMetadata(allLines, presets);
    const rawProducts = [];

    // 1. Parse all explicit structured tables (Excel sheets, HTML Word tables)
    for (const tableRows of structuredTables) {
      // Check if a 1-column sheet actually holds single-line prose entries
      const maxCols = tableRows.reduce((m, r) => Math.max(m, r.length), 0);
      if (maxCols <= 1) {
        const singleColText = tableRows.map(r => r[0] || '').filter(Boolean).join('\n');
        const subParsed = this.parseHeuristicProductsOnly(singleColText, presets);
        rawProducts.push(...subParsed);
      } else {
        const tableProds = this.parseTableRows(tableRows, presets);
        rawProducts.push(...tableProds);
      }
    }

    // 2. Parse remaining non-table text lines (PDFs, Word paragraphs, legacy .doc tables/lists, CSV/TXT)
    if (nonTableText && nonTableText.trim().length > 0) {
      const textProds = this.parseHeuristicProductsOnly(nonTableText, presets);
      rawProducts.push(...textProds);
    }

    if (rawProducts.length === 0) {
      return {
        success: false,
        message: 'لم يتم العثور على منتجات واضحة في المستند المرفوع. يُرجى التأكد من وضوح الفاتورة أو الجدول واحتوائه على أسماء المنتجات والأسعار.'
      };
    }

    return this.enrichExtractedData({
      ...meta,
      products: rawProducts
    }, presets, categories, subcategories);
  }

  /**
   * Legacy entry point preserved for direct callers using raw text
   */
  static parseHeuristic(text, presets = {}, categories = [], subcategories = []) {
    return this.parseUnified({
      fullText: text,
      nonTableText: text,
      structuredTables: [],
      presets,
      categories,
      subcategories
    });
  }

  /**
   * Core text & semi-structured lines parser (PDFs, legacy .doc, Word paragraphs/bullets, TSV)
   */
  static parseHeuristicProductsOnly(text, presets = {}) {
    const defaultStock = Number(presets.defaultStock) > 0 ? Number(presets.defaultStock) : 10;
    const defaultShipping = Number(presets.defaultShippingPrice) >= 0 ? Number(presets.defaultShippingPrice) : 20;

    const rawLines = (text || '')
      .split(/\r?\n/)
      .map(l => l.replace(/\s+$/, ''))
      .filter(l => l.trim().length > 0);

    if (rawLines.length === 0) return [];

    // 1. Detect table header if tab-separated lines exist
    let columnMap = null;
    let headerLineIdx = -1;
    for (let i = 0; i < Math.min(15, rawLines.length); i++) {
      const line = rawLines[i];
      if (line.includes('\t')) {
        const detected = this.detectColumnMap(line.split('\t'));
        if (detected) {
          columnMap = detected;
          headerLineIdx = i;
          break;
        }
      }
    }

    const rawProducts = [];
    let currentItem = null;

    const flushCurrentItem = () => {
      if (currentItem && currentItem.title && (currentItem.rawPrice > 0 || currentItem.compareAtPrice > 0 || currentItem.costPrice > 0 || currentItem.descriptionLines.length > 0)) {
        // Only save if we actually found at least one price OR avoid emitting stray headers
        if (currentItem.rawPrice > 0 || currentItem.compareAtPrice > 0 || currentItem.costPrice > 0) {
          currentItem.description = currentItem.descriptionLines
            .map(decodeVisualArabic)
            .join(' ')
            .replace(/\s+/g, ' ')
            .trim();
          rawProducts.push(currentItem);
        }
      }
      currentItem = null;
    };

    for (let i = 0; i < rawLines.length; i++) {
      const rawLine = rawLines[i];
      const line = rawLine.trim();

      if (i === headerLineIdx) continue;

      // Ignore page footers, repeated headers, page numbers
      if (line.includes('ﺔﺣﻔﺻ') || /^Page\b/i.test(line) || line.includes('فﺻوﻟوا') || line.includes('رﯾرﻘﺗ') || line.includes(':رﺟﺎﺗﻟا') || line.match(/تقرير\s*منتجات/)) {
        continue;
      }

      // Skip repeated tab header row
      if (line.includes('\t') && this.detectColumnMap(rawLine.split('\t'))) {
        continue;
      }

      // Pattern A (PDF Multi-line Item Block): sequence number line (#) e.g. "1", "2"
      if (/^\d{1,3}$/.test(normalizeNumerals(line))) {
        flushCurrentItem();
        const itemNum = parseInt(normalizeNumerals(line), 10);
        currentItem = {
          itemNum,
          title: '',
          descriptionLines: [],
          categoryHint: '',
          subcategoryHint: '',
          costPrice: 0,
          compareAtPrice: 0,
          rawPrice: 0,
          rawStock: defaultStock,
          shippingCost: defaultShipping
        };
        if (i + 1 < rawLines.length && !rawLines[i + 1].includes('\t') && !/^\d{1,3}$/.test(normalizeNumerals(rawLines[i + 1].trim()))) {
          i++;
          currentItem.title = decodeVisualArabic(rawLines[i].trim());
        }
        continue;
      }

      // Pattern A2: Labeled product title line starting a multi-line Word/text block (e.g. "المنتج: قميص" or "1. ساعة ذكية" with NO price on the title line)
      const normLine = normalizeNumerals(decodeVisualArabic(line));
      const labeledProdMatch = normLine.match(/^(?:المنتج|اسم\s*المنتج|الصنف)[\s:=#\-]+(.+)$/i);
      const numberedTitleMatch = !line.includes('\t') && !line.includes('|') && !/(?:سعر|التكلفة|ج\.?\s*م|egp)/i.test(normLine)
        ? normLine.match(/^(\d{1,3})\s*[\.\)\-]\s*(.{2,})$/)
        : null;

      if (labeledProdMatch || numberedTitleMatch) {
        flushCurrentItem();
        currentItem = {
          title: (labeledProdMatch ? labeledProdMatch[1] : numberedTitleMatch[2]).trim(),
          descriptionLines: [],
          categoryHint: '',
          subcategoryHint: '',
          costPrice: 0,
          compareAtPrice: 0,
          rawPrice: 0,
          rawStock: defaultStock,
          shippingCost: defaultShipping
        };
        continue;
      }

      // Inside an active multi-line block: check if line is a tab metrics row (PDF format)
      if (currentItem && line.includes('\t') && (line.includes('م.ج') || line.includes('ﺔﻌطﻗ') || /\d/.test(normLine))) {
        const parts = rawLine.split('\t').map(p => p.trim());
        if (parts.length >= 6) {
          currentItem.categoryHint = decodeVisualArabic(parts[0]);
          currentItem.costPrice = parsePrice(parts[1]);
          currentItem.compareAtPrice = parsePrice(parts[2]);
          currentItem.rawPrice = parsePrice(parts[3]);
          currentItem.rawStock = parseStock(parts[4], defaultStock);
          currentItem.shippingCost = parts[5] !== '' ? parsePrice(parts[5]) : defaultShipping;
        } else if (parts.length === 5) {
          currentItem.categoryHint = decodeVisualArabic(parts[0]);
          currentItem.compareAtPrice = parsePrice(parts[1]);
          currentItem.rawPrice = parsePrice(parts[2]);
          currentItem.rawStock = parseStock(parts[3], defaultStock);
          currentItem.shippingCost = parts[4] !== '' ? parsePrice(parts[4]) : defaultShipping;
        } else if (parts.length >= 3) {
          currentItem.categoryHint = decodeVisualArabic(parts[0]);
          currentItem.rawPrice = parsePrice(parts[1]);
          currentItem.rawStock = parseStock(parts[2], defaultStock);
          if (parts[3]) currentItem.shippingCost = parsePrice(parts[3]);
        }
        flushCurrentItem();
        continue;
      }

      // Inside an active multi-line block: check if line has labeled attributes (Word / TXT key-value lines)
      if (currentItem && !line.includes('\t')) {
        let matchedAttr = false;
        const costM = normLine.match(/^(?:سعر\s*)?(?:التكلفة|التوريد|الجملة|الشراء)[\s:=#\-]+([\d,\.]+)/i);
        const origM = normLine.match(/^(?:السعر\s*)?(?:قبل\s*الخصم|الأصلي|القديم)[\s:=#\-]+([\d,\.]+)/i);
        const sellM = normLine.match(/^(?:سعر\s*البيع(?:\s*بعد\s*الخصم)?|بعد\s*الخصم|السعر\s*النهائي|السعر)[\s:=#\-]+([\d,\.]+)/i);
        const stockM = normLine.match(/^(?:المخزون|الكمية|العدد)[\s:=#\-]+(\d+)/i);
        const shipM = normLine.match(/^(?:الشحن|التوصيل|سعر\s*الشحن)[\s:=#\-]+([\d,\.]+)/i);
        const catM = normLine.match(/^(?:القسم(?:\s*الرئيسي)?|التصنيف)[\s:=#\-]+(.+)$/i);
        const subM = normLine.match(/^(?:القسم\s*الفرعي|الفرعي)[\s:=#\-]+(.+)$/i);
        const descM = normLine.match(/^(?:الوصف|التفاصيل|المواصفات)[\s:=#\-]+(.+)$/i);

        if (costM) { currentItem.costPrice = parsePrice(costM[1]); matchedAttr = true; }
        else if (origM) { currentItem.compareAtPrice = parsePrice(origM[1]); matchedAttr = true; }
        else if (sellM) { currentItem.rawPrice = parsePrice(sellM[1]); matchedAttr = true; }
        else if (stockM) { currentItem.rawStock = parseStock(stockM[1], defaultStock); matchedAttr = true; }
        else if (shipM) { currentItem.shippingCost = parsePrice(shipM[1]); matchedAttr = true; }
        else if (subM) { currentItem.subcategoryHint = subM[1].trim(); matchedAttr = true; }
        else if (catM) { currentItem.categoryHint = catM[1].trim(); matchedAttr = true; }
        else if (descM) { currentItem.descriptionLines.push(descM[1].trim()); matchedAttr = true; }

        if (matchedAttr) continue;
      }

      // Pattern B: Tab-separated single table row (legacy .doc tables, pasted Excel/CSV)
      if (rawLine.includes('\t')) {
        if (currentItem && currentItem.title && !currentItem.rawPrice) {
          // Was a stray text line before a real table
          currentItem = null;
        } else {
          flushCurrentItem();
        }
        const parts = rawLine.split('\t').map(p => p.trim());
        const parsedRow = this.parseTableRowCells(parts, columnMap, presets);
        if (parsedRow) {
          rawProducts.push(parsedRow);
        }
        continue;
      }

      // Pattern C: Pipe-separated or inline colon/dash delimited lines (e.g. Word paragraphs or TXT lists)
      if (line.includes('|') || /(?:التكلفة|التوريد|قبل\s*الخصم|سعر\s*البيع|السعر)\s*[:=\-]/i.test(normLine)) {
        const inlineProd = this.parsePipeOrDelimitedLine(line, presets);
        if (inlineProd) {
          flushCurrentItem();
          rawProducts.push(inlineProd);
          continue;
        }
      }

      // Otherwise treat line as description inside active multi-line block
      if (currentItem) {
        currentItem.descriptionLines.push(line);
      }
    }

    flushCurrentItem();
    return rawProducts;
  }

  /**
   * Format and enrich extracted products with consistent taxonomy, 3 distinct prices, and metadata
   */
  static enrichExtractedData(result, presets = {}, categories = [], subcategories = []) {
    if (!result || !Array.isArray(result.products)) {
      return result;
    }
    const defaultShipping = Number(presets.defaultShippingPrice) >= 0 ? Number(presets.defaultShippingPrice) : 20;
    const detectedOwnerType = result.ownerType || presets.ownerType || (result.investorCode ? 'investor' : ((result.merchantCode || presets.targetMerchantCode) ? 'merchant' : ''));
    const isInvestor = detectedOwnerType === 'investor';

    const investorCode = isInvestor ? (result.investorCode || presets.targetInvestorCode || '') : '';
    const investorName = isInvestor ? (result.investorName || presets.targetInvestorName || '') : '';
    const merchantCode = isInvestor ? '' : (result.merchantCode || presets.targetMerchantCode || '');
    const merchantName = isInvestor ? '' : (result.merchantName || presets.targetMerchantName || '');

    const products = result.products.map((p, idx) => {
      return SmartProductExtractor.formatProduct(p, idx, {
        ownerType: detectedOwnerType,
        investorCode,
        investorName,
        merchantCode,
        merchantName,
        defaultShipping,
        categories,
        subcategories,
        presets
      });
    });

    return {
      success: true,
      ownerType: detectedOwnerType,
      investorCode,
      investorName,
      capital: result.capital !== undefined && result.capital !== null ? result.capital : null,
      merchantCode,
      merchantName,
      merchantPhone: result.merchantPhone || presets.targetMerchantPhone || '',
      products,
      count: products.length,
      presetsApplied: {
        commissionRate: 0,
        defaultShipping
      }
    };
  }

  /**
   * Match an explicit category label (e.g. from Excel/Word table "القسم" column) without false positives
   */
  static detectExplicitCategory(hint, categories = []) {
    if (!hint) return '';
    const clean = hint.toLowerCase().trim();
    if (!clean) return '';

    for (const [catId, data] of Object.entries(CATEGORY_TAXONOMY)) {
      if (data.name.toLowerCase() === clean || data.aliases.some(a => a.toLowerCase() === clean)) {
        return catId;
      }
    }
    if (Array.isArray(categories)) {
      for (const cat of categories) {
        if (cat.name && cat.name.toLowerCase().trim() === clean) {
          return cat.id;
        }
      }
    }
    return '';
  }

  /**
   * Format a single product ensuring 3 distinct prices and precise taxonomy
   */
  static formatProduct(p, idx, { ownerType = '', investorCode = '', investorName = '', merchantCode = '', merchantName = '', defaultShipping, categories, subcategories, presets }) {
    const defaultCategoryId = presets.defaultCategoryId || 'cat-electronics';
    const isInvestor = ownerType === 'investor';
    const ownerCode = isInvestor ? investorCode : merchantCode;
    const ownerName = isInvestor ? investorName : merchantName;

    // 1. Precise Category Detection (check explicit Excel/Word category column first, then semantic taxonomy)
    let detectedCat = p.categoryId;
    if (!detectedCat || !categories.some(c => c.id === detectedCat)) {
      detectedCat = SmartProductExtractor.detectExplicitCategory(p.categoryHint || p.category, categories);
    }
    if (!detectedCat) {
      const textForCat = (p.title || '') + ' ' + (p.categoryHint || p.category || '');
      detectedCat = SmartProductExtractor.detectCategory(textForCat, categories) || defaultCategoryId;
    }

    // 2. Precise Subcategory Detection
    let detectedSub = p.subcategoryId;
    if (!detectedSub || !subcategories.some(s => s.id === detectedSub && s.categoryId === detectedCat)) {
      const textForSub = (p.subcategoryHint || p.subcategory || '') + ' ' + (p.title || '') + ' ' + (p.description || '');
      detectedSub = SmartProductExtractor.detectSubcategory(textForSub, detectedCat, subcategories);
    }

    // 3. Price 1: Final Selling Price after discount (سعر البيع بعد الخصم)
    const sellPrice = Math.max(1, Math.round(Number(p.rawPrice || p.price) || 100));

    // 4. Price 2: Compare-at Price before discount (السعر قبل الخصم)
    let origPrice = 0;
    if (p.compareAtPrice && Number(p.compareAtPrice) > 0) {
      origPrice = Math.round(Number(p.compareAtPrice));
    } else if (p.originalPrice && Number(p.originalPrice) > 0) {
      origPrice = Math.round(Number(p.originalPrice));
    } else {
      origPrice = Math.round(sellPrice * 1.25);
    }
    if (origPrice < sellPrice) {
      origPrice = Math.round(sellPrice * 1.25);
    }

    // 5. Price 3: Cost Price / Wholesale Price (سعر التكلفة / سعر التوريد)
    let costPrice = 0;
    if (p.costPrice !== undefined && p.costPrice !== null && p.costPrice !== '' && Number(p.costPrice) > 0) {
      costPrice = Math.round(Number(p.costPrice));
    } else if (p.merchantPrice && Number(p.merchantPrice) > 0) {
      costPrice = Math.round(Number(p.merchantPrice));
    } else if (p.basePrice && Number(p.basePrice) > 0 && p.basePrice !== p.price) {
      costPrice = Math.round(Number(p.basePrice));
    } else if (presets.priceMarkupPercent && Number(presets.priceMarkupPercent) > 0) {
      costPrice = Math.max(1, Math.round(sellPrice / (1 + (Number(presets.priceMarkupPercent) / 100))));
    } else {
      costPrice = sellPrice;
    }

    const stock = Math.max(1, Number(p.rawStock !== undefined ? p.rawStock : (p.stock || 10)));
    const ship = p.shippingCost !== undefined ? Number(p.shippingCost) : defaultShipping;
    const skuPrefix = ownerCode || 'PRD';
    const sku = (p.sku && p.sku.trim()) ? p.sku.trim() : `${skuPrefix}-PRD${String(idx + 1).padStart(3, '0')}`;

    const finalDesc = p.description && p.description.length > 5
      ? p.description
      : `${p.title} - جودة ممتازة معتمدة وشحن سريع لكافة المحافظات المصرية.`;

    // STRICT REQUIREMENT: DO NOT ADD ANY IMAGES. LEAVE IMAGES ARRAY EMPTY!
    return {
      id: `bulk_prd_${Date.now()}_${idx}_${Math.random().toString(36).substring(2, 6)}`,
      title: p.title,
      description: finalDesc,
      brand: p.brand || '',
      saleUnit: p.saleUnit || 'قطعة',
      price: sellPrice, // سعر البيع بعد الخصم
      costPrice: costPrice, // سعر التكلفة / التوريد
      basePrice: costPrice,
      merchantPrice: costPrice,
      compareAtPrice: origPrice, // سعر البيع قبل الخصم
      originalPrice: origPrice,
      stock: stock,
      categoryId: detectedCat,
      category: detectedCat,
      subcategoryId: detectedSub || '',
      subcategory: detectedSub || '',
      sku: sku,
      images: [], // EMPTY ARRAY AS EXPLICITLY REQUESTED
      shippingCost: ship,
      shippingPrice: ship,
      isFreeShipping: ship === 0,
      isAvailableAllGovernorates: true,
      availableGovernorates: [],
      ownerType: isInvestor ? 'investor' : (merchantCode ? 'merchant' : ''),
      merchantCode: isInvestor ? '' : merchantCode,
      merchantName: isInvestor ? '' : merchantName,
      investorCode: isInvestor ? investorCode : '',
      investorName: isInvestor ? investorName : '',
      commissionRate: 0,
      rating: 4.8,
      reviewsCount: 0,
      soldCount: 0,
      isActive: true,
      features: [
        'خامات عالية الجودة وتصميم عصري',
        'ضمان استبدال واسترجاع لمدة 14 يوماً',
        'شحن وتوصيل فوري لباب البيت',
        'دفع آمن عند الاستلام'
      ],
      tags: [ownerName, ownerCode, 'جديد', 'عروض'].filter(Boolean)
    };
  }

  /**
   * Semantic Category matcher with name matching, anchor objects, aliases, and keyword scoring
   */
  static detectCategory(text, categories = []) {
    if (!text) return 'cat-electronics';
    const clean = text.toLowerCase().trim();

    // 1. Explicit Category Section Name Check (e.g. from sheet column "القسم")
    const explicitCategoryNames = {
      'cat-electronics': ['إلكترونيات وأجهزة ذكية', 'الكترونيات واجهزة ذكية', 'إلكترونيات', 'الكترونيات', 'أجهزة إلكترونية', 'أجهزة ذكية', 'اجهزة ذكية', 'electronics', 'smart devices'],
      'cat-home-appliances': ['أجهزة منزلية', 'اجهزة منزلية', 'أجهزة كهربائية', 'اجهزة كهربائية', 'أجهزة المطبخ', 'appliances', 'home appliances'],
      'cat-fashion': ['أزياء', 'ازياء', 'أزياء وملابس', 'ملبوسات', 'fashion'],
      'cat-beauty': ['عناية وتجميل', 'عناية بالبشرة', 'تجميل ومكياج', 'مكياج وتجميل', 'عناية شخصية', 'beauty', 'cosmetics'],
      'cat-home-supplies': ['مستلزمات منزلية', 'أدوات منزلية', 'ادوات منزلية', 'مستلزمات البيت', 'مستلزمات مطبخ', 'home supplies'],
      'cat-games': ['ألعاب وترفيه', 'العاب وترفيه', 'ألعاب وفيديو', 'العاب اطفال وترفيه', 'games', 'toys'],
      'cat-office': ['أدوات مكتبية', 'ادوات مكتبية', 'قرطاسية ومكتبية', 'أدوات مدرسية', 'كتب وقرطاسية', 'office supplies', 'stationery']
    };

    for (const [catId, names] of Object.entries(explicitCategoryNames)) {
      for (const name of names) {
        if (clean === name.toLowerCase() || 
            clean.startsWith(name.toLowerCase() + ' ') || 
            clean.endsWith(' ' + name.toLowerCase()) || 
            clean.includes(' ' + name.toLowerCase() + ' ') || 
            clean.includes('قسم ' + name.toLowerCase()) ||
            clean.includes('مسم ' + name.toLowerCase())) {
          return catId;
        }
      }
    }

    // 2. High-Confidence Anchor Product Types (Disambiguates words like "مكواة للملابس" or "غسالة ملابس" or "منظم ثلاجة")
    // Home Supplies Anchor Words (Check organizers before appliances so "منظم ثلاجة" is supplies):
    if (/(?:منظم|طقم\s*حلل|حلل|حلة|طاسة|طاسات|مقلاة|سكين|سكاكين|معالق|ملاعق|شوك|طقم\s*عشاء|صينية|صواني|جزامة|شماعات|سبت\s*غسيل|بوكس\s*تخزين|علب\s*ثلاجة|مفرش|ستارة|سجادة|ترتيب\s*الثلاجة|أدوات\s*مطبخ)/i.test(clean)) {
      return 'cat-home-supplies';
    }

    // Appliance Anchor Words:
    if (/(?:غسالة|مكواة|مكواه|مكنسة|خلاط|كبة|مفرمة|قلاية|ميكروويف|ميكرويف|فرن\s*كهربائي|بوتاجاز|ثلاجة|ديب\s*فريزر|سخان|تكييف|ماكينة\s*قهوة|صانعة\s*قهوة|عصارة|مضرب\s*بيض|توستر|مروحة|دفاية|عجان|محضر\s*طعام)/i.test(clean)) {
      return 'cat-home-appliances';
    }

    // Toys / Games Anchor Words:
    if (/(?:بلايستيشن|بلاي\s*ستيشن|playstation|ps4|ps5|اكس\s*بوكس|xbox|نينتندو|nintendo|دراع\s*تحكم|شريط\s*العاب|سيارة\s*أطفال|سيارة\s*اطفال|عربية\s*بريموت|ريموت\s*كنترول|سكوتر|عجلة\s*أطفال|عجلة\s*اطفال|لعبة(?:\s|$)|ألعاب\s*أطفال|العاب\s*اطفال|دمية|عروسة\s*أطفال|بازل|puzzle|مكعبات|ليجو|صلصال|مسدس\s*مياه)/i.test(clean)) {
      return 'cat-games';
    }

    // Fashion Anchor Words:
    if (/(?:قميص|بنطلون|فستان|عباية|إسدال|اسدال|بلوزة|جيبة|تنورة|تيشرت|تي\s*شيرت|بدلة|جاكيت|سويت\s*شيرت|هودي|شورت|كوتشي|حذاء|بيجاما|سالوبيت|كارديجان|طرحة|ليجن|بادي|لانجري|كرفته|سديري|شروال|ملبوسات|أزياء|ازياء)/i.test(clean)) {
      return 'cat-fashion';
    }

    // Beauty Anchor Words:
    if (/(?:سيروم|غسول|واقي\s*شمس|سن\s*بلوك|روج|كونسيلر|فاونديشن|مسكرة|ايلاينر|بودرة|عطر|عطور|برفيوم|برفان|مسك|بخور|بودي\s*سبلاش|شامبو|بلسم|زيت\s*شعر|كريم\s*تفتيح|كريم\s*مرطب|لوشن|تونر)/i.test(clean)) {
      return 'cat-beauty';
    }

    // Electronics Anchor Words:
    if (/(?:هاتف|هواتف|موبايل|تليفون|سمارت\s*فون|ايفون|iphone|سامسونج|شاومي|ريدمي|ريلمي|أوبو|انفينكس|سماعة|سماعات|ايربودز|هيدفون|باور\s*بانك|شاحن|شاشة|شاشات|تلفزيون|تلفاز|كاميرا|كاميرات|داش\s*كام|ساعة\s*ذكية|smart\s*watch|راوتر|لابتوب|كمبيوتر|فلاشة|كيبورد|ماوس|بلوتوث|سويتش)/i.test(clean)) {
      return 'cat-electronics';
    }

    // Office / Stationery Anchor Words:
    if (/(?:رواية|كتاب|كتب|مصحف|قاموس|كشكول|دفتر|أقلام|اقلام|قلم\s*جاف|قلم\s*رصاص|براية|مسطرة|استيكة|ممحاة|دباسة|خرامة|ورق\s*تصوير|ورق\s*a4|طابعة\s*ورق|حبر\s*طابعة|آلة\s*حاسبة|دوسيه|ملف\s*أوراق)/i.test(clean)) {
      return 'cat-office';
    }

    // 3. Database Category Names Check
    if (Array.isArray(categories)) {
      for (const cat of categories) {
        if (cat.name && clean.includes(cat.name.toLowerCase())) {
          return cat.id;
        }
      }
    }

    // 4. Keyword Scoring Fallback
    const scores = {};
    for (const catId of Object.keys(CATEGORY_TAXONOMY)) {
      scores[catId] = 0;
    }

    for (const [catId, data] of Object.entries(CATEGORY_TAXONOMY)) {
      for (const kw of data.primaryKeywords) {
        const kwLower = kw.toLowerCase();
        if (clean.includes(kwLower)) {
          scores[catId] += (kwLower.length > 5 ? 5 : 3);
        }
      }
    }

    let bestCat = null;
    let maxScore = 0;
    for (const [catId, score] of Object.entries(scores)) {
      if (score > maxScore) {
        maxScore = score;
        bestCat = catId;
      }
    }

    if (bestCat && maxScore > 0) {
      return bestCat;
    }

    // Default to Electronics (most common category in store, NEVER cat-office!)
    return 'cat-electronics';
  }

  /**
   * Semantic Subcategory matcher with name matching, anchor rules, keywords, and category fallback
   */
  static detectSubcategory(text, categoryId, subcategories = []) {
    if (!text || !categoryId) return '';
    const validSubs = subcategories.filter(s => s.categoryId === categoryId);
    if (!validSubs.length) return '';
    const clean = text.toLowerCase().trim();

    // 1. Direct Subcategory Name Check
    for (const sub of validSubs) {
      if (clean.includes(sub.name.toLowerCase())) {
        return sub.id;
      }
    }

    // 2. High-Confidence Subcategory Anchors per Category
    if (categoryId === 'cat-electronics') {
      if (/(?:شاشة|شاشات|تلفزيون|تلفزيونات|تلفاز|كاميرا|كاميرات|داش\s*كام|بروجكتور|رسيفر)/i.test(clean)) {
        return 'sub-electronics-3'; // شاشات وكاميرات
      }
      if (/(?:هاتف|هواتف|موبايل|موبايلات|تليفون|جوال|سمارت\s*فون|ايفون)/i.test(clean)) {
        return 'sub-electronics-1'; // هواتف
      }
      if (/(?:سماعة|سماعات|ايربودز|هيدفون|شاحن|باور\s*بانك|كابل|جراب|ساعة\s*ذكية|smart\s*watch|كيبورد|ماوس|فلاشة|راوتر|بلوتوث|سويتش)/i.test(clean)) {
        return 'sub-electronics-2'; // إكسسوارات
      }
    }

    if (categoryId === 'cat-home-appliances') {
      if (/(?:غسالة|ثلاجة|ديب\s*فريزر|بوتاجاز|سخان|تكييف|غسالة\s*اطباق|غسالة\s*صحون|شفاط\s*كبير)/i.test(clean)) {
        return 'sub-home-appliances-1'; // أجهزة كبيرة
      }
      if (/(?:خلاط|كبة|مفرمة|قلاية|ميكروويف|ميكرويف|فرن|غلاية|مكواة|مكنسة|ماكينة\s*قهوة|عصارة|مضرب|توستر|مروحة|دفاية|عجان|محضر\s*طعام)/i.test(clean)) {
        return 'sub-home-appliances-2'; // أجهزة صغيرة
      }
    }

    if (categoryId === 'cat-fashion') {
      if (/(?:أطفال|اطفال|بيبي|حديثي\s*الولادة|سالوبيت|كيدز|بناتي\s*صغار|اولادي\s*صغار)/i.test(clean)) {
        return 'sub-fashion-3'; // أطفال
      }
      if (/(?:حريمي|نسائي|فستان|عباية|إسدال|اسدال|بلوزة|جيبة|تنورة|طرحة|شال|لانجري|شنطة\s*حريمي)/i.test(clean)) {
        return 'sub-fashion-2'; // حريمي
      }
      if (/(?:رجالي|رجال|شبابي|قميص|بدلة|كرفته|سديري)/i.test(clean)) {
        return 'sub-fashion-1'; // رجالي
      }
    }

    if (categoryId === 'cat-home-supplies') {
      if (/(?:حلة|حلل|طاسة|سكين|سكاكين|معالق|ملاعق|شوك|طقم\s*عشاء|صينية|قالب\s*كيك)/i.test(clean)) {
        return 'sub-home-supplies-1'; // أدوات مطبخ
      }
      if (/(?:منظم|ستاند|رف|رفوف|شماعة|سبت|سلة|بوكس|جزامة|مفرش|ستارة|سجادة)/i.test(clean)) {
        return 'sub-home-supplies-2'; // تنظيم وتخزين
      }
    }

    if (categoryId === 'cat-beauty') {
      if (/(?:عطر|عطور|برفيوم|برفان|مسك|عود|بخور|بودي\s*سبلاش)/i.test(clean)) {
        return 'sub-beauty-2'; // عطور
      }
      if (/(?:سيروم|غسول|كريم|لوشن|صابون|ماسك|واقي\s*شمس|روج|مكياج|شامبو|بلسم)/i.test(clean)) {
        return 'sub-beauty-1'; // عناية بالبشرة
      }
    }

    if (categoryId === 'cat-games') {
      if (/(?:بلايستيشن|playstation|ps4|ps5|اكس\s*بوكس|xbox|نينتندو|دراع\s*تحكم|شريط\s*العاب)/i.test(clean)) {
        return 'sub-games-2'; // ألعاب فيديو
      }
      if (/(?:لعبة|دمية|عروسة|سيارة\s*أطفال|سكوتر|عجلة|بازل|مكعبات|ليجو)/i.test(clean)) {
        return 'sub-games-1'; // ألعاب أطفال
      }
    }

    if (categoryId === 'cat-office') {
      if (/(?:كتاب|كتب|رواية|قصة|مصحف|قاموس)/i.test(clean)) {
        return 'sub-office-1'; // كتب
      }
      if (/(?:قلم|اقلام|كشكول|دفتر|مسطرة|براية|استيكة|دباسة|خرامة|ورق|طابعة)/i.test(clean)) {
        return 'sub-office-2'; // أدوات مكتبية
      }
    }

    // 3. Sensible category default fallback
    const defaults = {
      'cat-fashion': 'sub-fashion-1', // رجالي
      'cat-electronics': 'sub-electronics-2', // إكسسوارات
      'cat-home-appliances': 'sub-home-appliances-2', // أجهزة صغيرة
      'cat-home-supplies': 'sub-home-supplies-1', // أدوات مطبخ
      'cat-beauty': 'sub-beauty-1', // عناية بالبشرة
      'cat-games': 'sub-games-1', // ألعاب أطفال
      'cat-office': 'sub-office-2' // أدوات مكتبية
    };

    const pref = defaults[categoryId];
    if (pref && validSubs.some(s => s.id === pref)) {
      return pref;
    }

    return validSubs[0]?.id || '';
  }

  /**
   * Gemini Vision & Multimodal API integration with exact taxonomy & 3 distinct prices
   */
  static async extractWithGemini({ fileBuffer, mimeType, textToParse = '', presets, geminiKey, categories = [], subcategories = [], sendFileInline = false }) {
    const truncatedText = String(textToParse || '').slice(0, 30000);
    const prompt = `
أنت خبير فحص فواتير ومستندات وشيتات Excel/Word وقوائم منتجات المتاجر الإلكترونية في مصر.
المطلوب استخراج بيانات التاجر/المستثمر وقائمة المنتجات بدقة مع 3 أسعار مختلفة والتصنيف في الأقسام المحددة حصراً بصيغة JSON بدون أي نصوص خارجية:

الأقسام المعتمدة في المتجر (اختر معرف القسم ومعرف القسم الفرعي التابع له حصراً من هذه القائمة):
1. إلكترونيات وأجهزة ذكية (معرف: cat-electronics)
   - هواتف (معرف: sub-electronics-1)
   - إكسسوارات (معرف: sub-electronics-2)
   - شاشات وكاميرات (معرف: sub-electronics-3)
2. أجهزة منزلية (معرف: cat-home-appliances)
   - أجهزة كبيرة (معرف: sub-home-appliances-1)
   - أجهزة صغيرة (معرف: sub-home-appliances-2)
3. أزياء (معرف: cat-fashion)
   - رجالي (معرف: sub-fashion-1)
   - حريمي (معرف: sub-fashion-2)
   - أطفال (معرف: sub-fashion-3)
4. عناية وتجميل (معرف: cat-beauty)
   - عناية بالبشرة (معرف: sub-beauty-1)
   - عطور (معرف: sub-beauty-2)
5. مستلزمات منزلية (معرف: cat-home-supplies)
   - أدوات مطبخ (معرف: sub-home-supplies-1)
   - تنظيم وتخزين (معرف: sub-home-supplies-2)
6. ألعاب وترفيه (معرف: cat-games)
   - ألعاب أطفال (معرف: sub-games-1)
   - ألعاب فيديو (معرف: sub-games-2)
7. أدوات مكتبية (معرف: cat-office)
   - كتب (معرف: sub-office-1)
   - أدوات مكتبية (معرف: sub-office-2)

تعليمات الأسعار الثلاثة (لا تخلط بينها):
1. costPrice: سعر التكلفة أو سعر التوريد (السعر الذي نأخذه من التاجر أو المستثمر).
2. compareAtPrice: سعر البيع قبل الخصم (السعر الأصلي أو المشطوب).
3. price: سعر البيع بعد الخصم (السعر النهائي للعميل).

قواعد صارمة:
- لا تضف أي صور نهائياً، اترك مصفوفة الصور فارغة [].
- لا تخترع منتجات غير موجودة في المستند.

الهيكل المطلوب:
{
  "merchantCode": "كود التاجر إن وجد أو TR-9042",
  "merchantName": "اسم التاجر أو المستثمر",
  "merchantPhone": "رقم الهاتف إن وجد",
  "products": [
    {
      "title": "اسم المنتج بالعربية بدقة",
      "description": "الوصف والمواصفات",
      "costPrice": 0,
      "compareAtPrice": 0,
      "price": 0,
      "stock": 10,
      "shippingCost": 20,
      "categoryId": "معرف القسم الرئيسي بدقة من القائمة بالأعلى",
      "subcategoryId": "معرف القسم الفرعي بدقة من القائمة بالأعلى"
    }
  ]
}

${truncatedText ? `النص المستخرج من الملف:\n${truncatedText}` : 'افحص الملف المرفق واستخرج جدول المنتجات منه بالكامل:'}
`;

    const parts = [];
    if (sendFileInline && fileBuffer && mimeType) {
      parts.push({
        inline_data: {
          mime_type: mimeType,
          data: fileBuffer.toString('base64')
        }
      });
    }
    parts.push({ text: prompt });

    const modelName = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${geminiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts }]
      })
    });

    if (!res.ok) {
      throw new Error(`Gemini API returned status ${res.status}`);
    }

    const data = await res.json();
    const candidateText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const jsonMatch = candidateText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      if (Array.isArray(parsed.products)) {
        parsed.products.forEach(p => { p.images = []; });
      }
      return parsed;
    }
    return null;
  }
}

module.exports = SmartProductExtractor;
