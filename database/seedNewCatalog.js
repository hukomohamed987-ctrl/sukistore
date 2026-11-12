/**
 * Suki Store - Comprehensive Catalog & Roles Seeder
 * Populates:
 * 1. 10 Main Categories
 * 2. 6-8 Sub-Categories per Main Category with square banners, descriptions & discount badges
 * 3. 20-25 realistic products per sub-category
 * 4. Mohamed Hakim (Primary Owner Super Admin) & Ahmed Gharib (Partner Admin)
 * 5. Advanced IP settings & Returns DB table
 */

const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

const DATA_DIR = path.join(__dirname, 'data');

const MAIN_CATEGORIES = [
  {
    id: "cat-electronics",
    name: "إلكترونيات وأجهزة ذكية",
    slug: "electronics",
    description: "أحدث الأجهزة الذكية، الشاشات، أجهزة الكمبيوتر ومستلزمات التقنية",
    image: "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=800",
    icon: "tv",
    orderIndex: 1
  },
  {
    id: "cat-mobiles",
    name: "الجوالات والإكسسوارات",
    slug: "mobiles",
    description: "أحدث الهواتف الذكية وبنوك الطاقة وكابلات الشحن السريع والشواحن اللاسلكية",
    image: "https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=800",
    icon: "mobile-screen",
    orderIndex: 2
  },
  {
    id: "cat-mens-fashion",
    name: "أزياء وملابس رجالية",
    slug: "mens-fashion",
    description: "تشكيلة راقية من الملابس الرجالية العصرية والكاجوال والبدل الرسمية",
    image: "https://images.unsplash.com/photo-1556905055-8f358a7a47b2?w=800",
    icon: "shirt",
    orderIndex: 3
  },
  {
    id: "cat-womens-fashion",
    name: "أزياء وملابس نسائية",
    slug: "womens-fashion",
    description: "فساتين وعبايات وأطقم نسائية راقية بأحدث خطوط الموضة والأناقة",
    image: "https://images.unsplash.com/photo-1483985988355-763728e1935b?w=800",
    icon: "person-dress",
    orderIndex: 4
  },
  {
    id: "cat-home",
    name: "المنزل والمطبخ",
    slug: "home-kitchen",
    description: "أدوات المطبخ العصرية، أجهزة القهوة، المفروشات وديكورات المنزل الفاخرة",
    image: "https://images.unsplash.com/photo-1556911220-e15b29be8c8f?w=800",
    icon: "house",
    orderIndex: 5
  },
  {
    id: "cat-beauty",
    name: "العطور والعناية الشخصية",
    slug: "perfumes-beauty",
    description: "عطور شرقية وفرنسية أصلية ومستحضرات العناية الطبيعية بالبشرة والشعر",
    image: "https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?w=800",
    icon: "wand-magic-sparkles",
    orderIndex: 6
  },
  {
    id: "cat-watches",
    name: "الساعات والنظارات",
    slug: "watches",
    description: "ساعات يد ذكية وكلاسيكية ونظارات شمسية وطبية وإكسسوارات راقية",
    image: "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=800",
    icon: "clock",
    orderIndex: 7
  },
  {
    id: "cat-shoes",
    name: "الأحذية والحقائب",
    slug: "shoes-bags",
    description: "أحذية رياضية وجلدية مريحة وحقائب يد وسفر بأعلى جودة وتصميم",
    image: "https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=800",
    icon: "shoe-prints",
    orderIndex: 8
  },
  {
    id: "cat-sports",
    name: "الرياضة واللياقة البدنية",
    slug: "sports-fitness",
    description: "أجهزة اللياقة البدنية، ملابس الرياضة، ومستلزمات التمارين المنزلية",
    image: "https://images.unsplash.com/photo-1517838277536-f5f99be501cd?w=800",
    icon: "dumbbell",
    orderIndex: 9
  },
  {
    id: "cat-gaming",
    name: "ألعاب الفيديو والجيمنج",
    slug: "gaming",
    description: "أجهزة بلايستيشن، إكس بوكس، كراسي وشاشات الألعاب وإكسسوارات المحترفين",
    image: "https://images.unsplash.com/photo-1612287232230-e37fa5972887?w=800",
    icon: "gamepad",
    orderIndex: 10
  }
];

// Subcategories: 6-7 per main category
const SUBCATEGORIES_CONFIG = [
  // 1. Electronics
  { id: "sub-laptops", categoryId: "cat-electronics", name: "أجهزة لابتوب وكمبيوتر", description: "أقوى أجهزة الكمبيوتر المحمولة للأعمال والدراسة والتصميم", discountText: "خصم حتى 25%", image: "https://images.unsplash.com/photo-1496181133206-80ce9b88a853?w=500" },
  { id: "sub-screens", categoryId: "cat-electronics", name: "شاشات وتلفزيونات ذكية", description: "شاشات 4K و OLED وتلفزيونات سمارت بأحدث التقنيات", discountText: "عروض الموسم", image: "https://images.unsplash.com/photo-1593359677879-a4bb92f829d1?w=500" },
  { id: "sub-audio", categoryId: "cat-electronics", name: "سماعات ومكبرات صوت", description: "سماعات رأس لاسلكية ومكبرات بلوتوث بنقاء صوت فائق", discountText: "خصم 30%", image: "https://images.unsplash.com/photo-1546435770-a3e426bf472b?w=500" },
  { id: "sub-tablets", categoryId: "cat-electronics", name: "أجهزة لوحية وآيباد", description: "أجهزة لوحية للمذاكرة والرسم والترفيه اليومي", discountText: "أحدث الإصدارات", image: "https://images.unsplash.com/photo-1544244015-0df4b3ffc6b0?w=500" },
  { id: "sub-cameras", categoryId: "cat-electronics", name: "كاميرات ومعدات تصوير", description: "كاميرات احترافية وعدسات وإضاءة استوديو متكاملة", discountText: "عروض صناع المحتوى", image: "https://images.unsplash.com/photo-1516035069371-29a1b244cc32?w=500" },
  { id: "sub-printers", categoryId: "cat-electronics", name: "طابعات وماسحات ضوئية", description: "طابعات ليزر وحبر اقتصادي للمنازل والمكاتب", discountText: "توفير حتى 20%", image: "https://images.unsplash.com/photo-1612815154858-60aa4c59eaa6?w=500" },
  { id: "sub-smarthome", categoryId: "cat-electronics", name: "أجهزة المنزل الذكي", description: "كاميرات مراقبة ذكية، أقفال ومقابس تحكم عن بعد", discountText: "أمان متكامل", image: "https://images.unsplash.com/photo-1558002038-1055907df827?w=500" },

  // 2. Mobiles
  { id: "sub-iphones", categoryId: "cat-mobiles", name: "أبل آيفون (Apple)", description: "أحدث إصدارات آيفون بضمان محلي وألوان مميزة", discountText: "ضمان محلي أصلي", image: "https://images.unsplash.com/photo-1592750475338-74b7b21085ab?w=500" },
  { id: "sub-samsung", categoryId: "cat-mobiles", name: "سامسونج جالاكسي", description: "سلسلة هواتف سامسونج الرائدة والمتوسطة مع أقوى شاشات", discountText: "خصم يصل 35%", image: "https://images.unsplash.com/photo-1610945415295-d9bbf067e59c?w=500" },
  { id: "sub-xiaomi", categoryId: "cat-mobiles", name: "شاومي وريدمي", description: "هواتف شاومي وبوكو بأقوى معالجات وقيمة مقابل السعر", discountText: "أفضل قيمة", image: "https://images.unsplash.com/photo-1598327105666-5b89351aff97?w=500" },
  { id: "sub-chargers", categoryId: "cat-mobiles", name: "شواحن وكابلات سريعة", description: "شواحن أصلية بتقنية GaN وكابلات نقل بيانات معتمدة", discountText: "عروض 1+1", image: "https://images.unsplash.com/photo-1583863788434-e58a36330cf0?w=500" },
  { id: "sub-powerbanks", categoryId: "cat-mobiles", name: "بنوك طاقة وبطاريات", description: "شواحن متنقلة بسعات ضخمة ودعم الشحن فائق السرعة", discountText: "طاقة تدوم طويلاً", image: "https://images.unsplash.com/photo-1609091839311-d5365f9ff1c5?w=500" },
  { id: "sub-cases", categoryId: "cat-mobiles", name: "جرابات وحافظات هواتف", description: "جرابات حماية ضد الصدمات مع مسكات أنيقة", discountText: "أشكال عصرية", image: "https://images.unsplash.com/photo-1601593346740-925612772716?w=500" },
  { id: "sub-mobile-accessories", categoryId: "cat-mobiles", name: "حوامل ومثبتات سيارات", description: "حوامل سيارة وشواحن ماج سيف ومثبتات ذكية", discountText: "خصم 20%", image: "https://images.unsplash.com/photo-1580910051074-3eb694886505?w=500" },

  // 3. Men's Fashion
  { id: "sub-mens-shirts", categoryId: "cat-mens-fashion", name: "قمصان وتيشرتات رجالي", description: "تيشرتات قطنية وقمصان كاجوال ورسمية بياقة أنيقة", discountText: "قطن مصري 100%", image: "https://images.unsplash.com/photo-1521572267360-ee0c2909d518?w=500" },
  { id: "sub-mens-pants", categoryId: "cat-mens-fashion", name: "بناطيل جينز وجبردين", description: "بناطيل مريحة بقصات عصرية ملائمة لكل المناسبات", discountText: "خصم حتى 30%", image: "https://images.unsplash.com/photo-1624378439575-d8705ad7ae80?w=500" },
  { id: "sub-mens-jackets", categoryId: "cat-mens-fashion", name: "جواكت وسويتشيرتات", description: "جواكت جلد، بامب، وهوديز بأقمشة شتوية دافئة", discountText: "تخفيضات الشتاء", image: "https://images.unsplash.com/photo-1548883354-7622d03aca27?w=500" },
  { id: "sub-mens-suits", categoryId: "cat-mens-fashion", name: "بدل وبليزرات كلاسيك", description: "بدل رسمية وبليزرات أنيقة لحفلات الزفاف والعمل", discountText: "أناقة بلا حدود", image: "https://images.unsplash.com/photo-1594938298603-c8148c4dae35?w=500" },
  { id: "sub-mens-sportswear", categoryId: "cat-mens-fashion", name: "ملابس رياضية وترنجات", description: "ترنجات رياضية خفيفة ومرنة للجري والتمارين", discountText: "راحة وانتعاش", image: "https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=500" },
  { id: "sub-mens-sleepwear", categoryId: "cat-mens-fashion", name: "بيجامات وملابس منزلية", description: "أطقم منزلية مريحة وناعمة من أصفى الخامات", discountText: "راحة منزلية", image: "https://images.unsplash.com/photo-1582533561751-ef6f6ab93a2e?w=500" },

  // 4. Women's Fashion
  { id: "sub-womens-dresses", categoryId: "cat-womens-fashion", name: "فساتين وسهرة", description: "فساتين سهرة وفساتين كاجوال صيفية بألوان جذابة", discountText: "تشكيلة جديدة", image: "https://images.unsplash.com/photo-1595777457583-95e059d581b8?w=500" },
  { id: "sub-womens-abayas", categoryId: "cat-womens-fashion", name: "عبايات وإسدالات راقية", description: "عبايات خليجية ومصرية مطرزة بتطريزات فاخرة", discountText: "تصاميم محتشمة", image: "https://images.unsplash.com/photo-1583391733956-3750e0ff4e8b?w=500" },
  { id: "sub-womens-tops", categoryId: "cat-womens-fashion", name: "بلوزات وقمصان نسائية", description: "بلوزات شيفون وقطن بطبعات أنيقة وعصرية", discountText: "خصم 25%", image: "https://images.unsplash.com/photo-1564257631407-4deb1f99d992?w=500" },
  { id: "sub-womens-pants", categoryId: "cat-womens-fashion", name: "بناطيل وتنانير", description: "تنانير طويلة وبناطيل وايد ليج وجينز مريح", discountText: "أحدث الموديلات", image: "https://images.unsplash.com/photo-1509631179647-0177331693ae?w=500" },
  { id: "sub-womens-jackets", categoryId: "cat-womens-fashion", name: "جواكت ومعاطف نسائية", description: "كوت شتوي وجواكت صوف وتريكو بأناقة فائقة", discountText: "دفء وفخامة", image: "https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=500" },
  { id: "sub-womens-hijabs", categoryId: "cat-womens-fashion", name: "طرح وإكسسوارات حجاب", description: "طرح حرير وكريب وبندانات قطنية ثابتة", discountText: "باقات توفير", image: "https://images.unsplash.com/photo-1609357605129-26f69add5d6e?w=500" },

  // 5. Home & Kitchen
  { id: "sub-cookware", categoryId: "cat-home", name: "أواني وقدور الطهي", description: "أطقم جرانيت وسيراميك وتيفال غير لاصقة وصحية", discountText: "ضمان 5 سنوات", image: "https://images.unsplash.com/photo-1584990347449-399a9a3f2a89?w=500" },
  { id: "sub-coffee-makers", categoryId: "cat-home", name: "ماكينات القهوة والإسبريسو", description: "ماكينات قهوة أوتوماتيكية ومطاحن بن مخصصة", discountText: "قهوة بمذاق الكافيه", image: "https://images.unsplash.com/photo-1517668808822-9ebd02f2a8ee?w=500" },
  { id: "sub-kitchen-appliances", categoryId: "cat-home", name: "أجهزة مطبخ كهربائية", description: "قلايات هوائية، خلاطات، وعجانات بقدرات عالية", discountText: "قلايات بدون زيت", image: "https://images.unsplash.com/photo-1556911220-e15b29be8c8f?w=500" },
  { id: "sub-bedding", categoryId: "cat-home", name: "مفروشات وملايات سرير", description: "أطقم ملايات قطن مصري ولحافات فايبر ناعمة", discountText: "راحة ونعومة", image: "https://images.unsplash.com/photo-1522771739844-6a9f6d5f14af?w=500" },
  { id: "sub-decor", categoryId: "cat-home", name: "ديكورات وإضاءات حديثة", description: "ساعات حائط، أباجورات ليد، وتابلوهات مودرن", discountText: "لمسات فنية", image: "https://images.unsplash.com/photo-1513519245088-0e12902e5a38?w=500" },
  { id: "sub-cleaning-tools", categoryId: "cat-home", name: "مستلزمات التنظيف والترتيب", description: "مكانس ذكية ومنظمات خزائن ومماسح بخار", discountText: "نظافة ذكية", image: "https://images.unsplash.com/photo-1581578731548-c64695cc6952?w=500" },

  // 6. Perfumes & Beauty
  { id: "sub-mens-perfumes", categoryId: "cat-beauty", name: "عطور رجالية فاخرة", description: "أفخم العطور الشرقية والخشبية بثبات وفوحان ممتاز", discountText: "أصلي 100%", image: "https://images.unsplash.com/photo-1523293182086-7651a899d37f?w=500" },
  { id: "sub-womens-perfumes", categoryId: "cat-beauty", name: "عطور نسائية ساحرة", description: "عطور زهرية وفرنسية تمنحك إطلالة فريدة ومميزة", discountText: "خصم حتى 35%", image: "https://images.unsplash.com/photo-1588405748880-12d1d2a59f75?w=500" },
  { id: "sub-skincare", categoryId: "cat-beauty", name: "العناية بالبشرة والوجه", description: "سيرومات، غسول ومرطبات طبية موثوقة لحيوية البشرة", discountText: "موصى به طبياً", image: "https://images.unsplash.com/photo-1556228720-195a672e8a03?w=500" },
  { id: "sub-haircare", categoryId: "cat-beauty", name: "العناية بالشعر", description: "شامبوهات خالية من السلفات، زيوت طبيعية وماسكات علاجية", discountText: "شعر صحي ولامع", image: "https://images.unsplash.com/photo-1535585209827-a15fcdbc4c2d?w=500" },
  { id: "sub-makeup", categoryId: "cat-beauty", name: "مكياج ومستحضرات تجميل", description: "فاونديشن، أرواج ومجموعات ظل عيون احترافية", discountText: "ماركات عالمية", image: "https://images.unsplash.com/photo-1512496015851-a90fb38ba796?w=500" },
  { id: "sub-personal-care", categoryId: "cat-beauty", name: "أجهزة الحلاقة والعناية", description: "ماكينات حلاقة رجالية وسيشوار ومملسات شعر متطورة", discountText: "أداء احترافي", image: "https://images.unsplash.com/photo-1503951914875-452162b0f3f1?w=500" },

  // 7. Watches & Eyewear
  { id: "sub-smartwatches", categoryId: "cat-watches", name: "ساعات ذكية رياضية", description: "ساعات بمتابعة نبض القلب ونظام GPS وشاشات أموليد", discountText: "أحدث التقنيات", image: "https://images.unsplash.com/photo-1508685096489-7aacd43bd3b1?w=500" },
  { id: "sub-classic-watches", categoryId: "cat-watches", name: "ساعات كلاسيكية فاخرة", description: "ساعات ستانلس ستيل وسيراميك بمكائن كوارتز يابانية وسويسرية", discountText: "فخامة خالدة", image: "https://images.unsplash.com/photo-1524805444758-089113d48a6d?w=500" },
  { id: "sub-sunglasses", categoryId: "cat-watches", name: "نظارات شمسية أصلية", description: "نظارات شمسية بحماية 100% UV بتصاميم كلاسيكية وعصرية", discountText: "حماية كاملة من الشمس", image: "https://images.unsplash.com/photo-1511499767150-a48a237f0083?w=500" },
  { id: "sub-bracelets", categoryId: "cat-watches", name: "أساور ومجوهرات أنيقة", description: "أساور فضية وجلدية وأطقم سلاسل راقية", discountText: "هدية مثالية", image: "https://images.unsplash.com/photo-1535632066927-ab7c9ab60908?w=500" },
  { id: "sub-watch-straps", categoryId: "cat-watches", name: "أحزمة وإكسسوارات الساعات", description: "أحزمة سيليكون وجلد وقواعد شحن للساعات الذكية", discountText: "تجديد فوري", image: "https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?w=500" },
  { id: "sub-reading-glasses", categoryId: "cat-watches", name: "نظارات حماية الشاشات (بلو لايت)", description: "نظارات تصفية الضوء الأزرق لراحة العين أمام الكمبيوتر والجوال", discountText: "راحة لعينيك", image: "https://images.unsplash.com/photo-1574258495973-f010dfbb5371?w=500" },

  // 8. Shoes & Bags
  { id: "sub-sneakers", categoryId: "cat-shoes", name: "سنيكرز وأحذية رياضية", description: "أحذية جري ومشي بنعال طبية تمتص الصدمات بأناقة", discountText: "راحة طوال اليوم", image: "https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=500" },
  { id: "sub-classic-shoes", categoryId: "cat-shoes", name: "أحذية كلاسيك وجلدية", description: "أحذية أوكسفورد وجلد طبيعي للمناسبات والعمل", discountText: "جلد طبيعي ممتاز", image: "https://images.unsplash.com/photo-1614252235316-8c857d38b5f4?w=500" },
  { id: "sub-womens-bags", categoryId: "cat-shoes", name: "حقائب يد نسائية", description: "حقائب كروس وحقائب كتف فاخرة بتشطيبات متقنة", discountText: "أحدث التشكيلات", image: "https://images.unsplash.com/photo-1584917865442-de89df76afd3?w=500" },
  { id: "sub-backpacks", categoryId: "cat-shoes", name: "حقائب ظهر ولابتوب", description: "حقائب ظهر متينة ومضادة للماء مع منافذ شحن USB", discountText: "رفيق السفر والدراسة", image: "https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=500" },
  { id: "sub-travel-luggage", categoryId: "cat-shoes", name: "حقائب سفر وترولي", description: "أطقم شنط سفر خفيفة الوزن ومتينة بعجلات 360 درجة", discountText: "سافر براحة بال", image: "https://images.unsplash.com/photo-1565026057447-bc90a3dceb87?w=500" },
  { id: "sub-sandals", categoryId: "cat-shoes", name: "صنادل وشباشب مريحة", description: "صنادل طبية خفيفة للاستخدام اليومي والمنزلي", discountText: "خفة ومرونة", image: "https://images.unsplash.com/photo-1603808033192-082d6919d3e1?w=500" },

  // 9. Sports & Fitness
  { id: "sub-fitness-machines", categoryId: "cat-sports", name: "أجهزة رياضية منزلية", description: "مشايات كهربائية ودراجات ثابتة وأوربتراك للتخسيس", discountText: "شحن منزلي مخصص", image: "https://images.unsplash.com/photo-1538805060514-97d9cc17730c?w=500" },
  { id: "sub-dumbbells", categoryId: "cat-sports", name: "أثقال ودامبلز ومقاومة", description: "أطقم دامبلز قابلة للتعديل وأحزمة مقاومة للتدريب", discountText: "ابنِ قوتك", image: "https://images.unsplash.com/photo-1584735935682-2f2b69dff9d2?w=500" },
  { id: "sub-sport-apparel", categoryId: "cat-sports", name: "ملابس رياضية وتدريب", description: "تيشرتات وبناطيل دراي فيت للتنفس وامتصاص العرق", discountText: "أداء استثنائي", image: "https://images.unsplash.com/photo-1518611012118-696072aa579a?w=500" },
  { id: "sub-yoga-mats", categoryId: "cat-sports", name: "مفارش يوجا وإكسسوارات", description: "مفارش يوجا مانعة للانزلاق وبكرات تدليك العضلات", discountText: "مرونة واسترخاء", image: "https://images.unsplash.com/photo-1601925260368-ae2f83cf8b7f?w=500" },
  { id: "sub-sport-bottles", categoryId: "cat-sports", name: "زجاجات مياه وشيكرات", description: "زجاجات رياضية معزولة وشيكرات بروتين بخلط مثالي", discountText: "ترطيب دائم", image: "https://images.unsplash.com/photo-1523362628745-0c100150b504?w=500" },
  { id: "sub-outdoor-sports", categoryId: "cat-sports", name: "رياضات الهواء الطلق والتخييم", description: "خيام تخييم، كشافات قوية ومعدات الرحلات البرية", discountText: "انطلق للمغامرة", image: "https://images.unsplash.com/photo-1504280390367-361c6d9f38f4?w=500" },

  // 10. Video Games & Gaming
  { id: "sub-consoles", categoryId: "cat-gaming", name: "منصات ألعاب (بلايستيشن وإكس بوكس)", description: "أجهزة PS5 و Xbox Series X و Nintendo Switch الأصلية", discountText: "ضمان الوكيل", image: "https://images.unsplash.com/photo-1606813907291-d86efa9b94db?w=500" },
  { id: "sub-controllers", categoryId: "cat-gaming", name: "أذرع تحكم وإكسسوارات", description: "أذرع تحكم لاسلكية مع استجابة اهتزاز فائقة الدقة", discountText: "دقة استجابة", image: "https://images.unsplash.com/photo-1592840496694-26d035b52b48?w=500" },
  { id: "sub-gaming-headsets", categoryId: "cat-gaming", name: "سماعات قيمنق محيطية", description: "سماعات ألعاب بصوت محيطي 7.1 ومايكروفون عازل للضوضاء", discountText: "صوت مكاني نقي", image: "https://images.unsplash.com/photo-1618366712010-f4ae9c647dcb?w=500" },
  { id: "sub-gaming-chairs", categoryId: "cat-gaming", name: "كراسي وطاولات قيمنق", description: "كراسي مريحة مخصصة للجلسات الطويلة مع وسائد أسفل الظهر", discountText: "شحن خاص للقطع الكبيرة", image: "https://images.unsplash.com/photo-1598550476439-6847785fcea6?w=500" },
  { id: "sub-keyboards-mice", categoryId: "cat-gaming", name: "كيبورد وماوس ميكانيكي", description: "لوحات مفاتيح ميكانيكية وماوسات قيمنق بإضاءة RGB مذهلة", discountText: "سرعة واحتراف", image: "https://images.unsplash.com/photo-1618384887929-16ec33fab9ef?w=500" },
  { id: "sub-gaming-discs", categoryId: "cat-gaming", name: "أحدث أسطوانات الألعاب", description: "ألعاب بلايستيشن وإكس بوكس أصلية بأسعار منافسة", discountText: "إصدارات جديدة", image: "https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=500" }
];

const EGYPT_GOVERNORATES = [
  "القاهرة", "الجيزة", "الإسكندرية", "الدقهلية", "البحر الأحمر", "البحيرة", "الفيوم",
  "الغربية", "الإسماعيلية", "المنوفية", "المنيا", "القليوبية", "الوادي الجديد", "السويس",
  "أسوان", "أسيوط", "بني سويف", "بورسعيد", "دمياط", "الشرقية", "جنوب سيناء", "كفر الشيخ",
  "مطروح", "الأقصر", "قنا", "شمال سيناء", "سوهـاج"
];

const BRANDS_POOL = {
  "cat-electronics": ["Apple", "Dell", "HP", "Lenovo", "Sony", "LG", "Anker", "Bose", "Canon", "Epson"],
  "cat-mobiles": ["Apple", "Samsung", "Xiaomi", "Realme", "Oppo", "Huawei", "Anker", "Baseus", "Joyroom"],
  "cat-mens-fashion": ["Zara", "Defacto", "LC Waikiki", "Nike", "Adidas", "Tommy Hilfiger", "Polo", "Town Team"],
  "cat-womens-fashion": ["Zara", "Mango", "H&M", "LC Waikiki", "Forever 21", "Stradivarius", "Pull & Bear"],
  "cat-home": ["Tefal", "Black & Decker", "Philips", "Kenwood", "Moulinex", "Delonghi", "Beko", "IKEA"],
  "cat-beauty": ["Dior", "Chanel", "Tom Ford", "L'Oreal", "The Ordinary", "CeraVe", "Braun", "Philips"],
  "cat-watches": ["Casio", "Rolex", "Fossil", "Apple", "Samsung", "Ray-Ban", "Police", "Michael Kors"],
  "cat-shoes": ["Nike", "Adidas", "Puma", "Skechers", "Clarks", "Aldo", "Samsonite", "American Tourister"],
  "cat-sports": ["Nike", "Adidas", "Under Armour", "Reebok", "Decathlon", "Domyos", "Everlast"],
  "cat-gaming": ["Sony PlayStation", "Microsoft Xbox", "Nintendo", "Razer", "Logitech G", "HyperX", "Corsair", "Cougar"]
};

// Generate realistic demo products (22 products per subcategory => ~1400 total)
function generateProducts() {
  const products = [];

  SUBCATEGORIES_CONFIG.forEach((sub, subIdx) => {
    const brands = BRANDS_POOL[sub.categoryId] || ["سوقي براند"];
    const isLarge = sub.id === "sub-gaming-chairs" || sub.id === "sub-fitness-machines" || sub.id === "sub-screens";

    for (let i = 1; i <= 22; i++) {
      const brand = brands[i % brands.length];
      const basePrice = Math.round((180 + (i * 350) + (subIdx * 45)) / 10) * 10;
      const hasDiscount = i % 2 === 0;
      const compareAtPrice = hasDiscount ? Math.round(basePrice * 1.25) : null;
      const stock = 15 + ((i * 7) % 45);

      // Specific allowed governorates for some heavy items
      let allowedGovs = null;
      if (isLarge && i % 3 === 0) {
        allowedGovs = ["القاهرة", "الجيزة", "الإسكندرية", "القليوبية", "الشرقية"];
      }

      const prod = {
        id: `prod-${sub.id}-${i}`,
        title: `${sub.name} - ${brand} موديل ${2025 + (i % 2)} إصدار خاص #${i}`,
        slug: `prod-${sub.id}-${i}`,
        description: `أفضل خيار من ${sub.name} تقدمه علامة ${brand}. يتميز بجودة تصنيع فائقة، أداء موثوق، وتصميم عصري يلائم استخدامك اليومي بكفاءة وراحة تامة. مصحوب بضمان المتجر الرسمي.`,
        categoryId: sub.categoryId,
        subcategoryId: sub.id,
        brand: brand,
        price: basePrice,
        compareAtPrice: compareAtPrice,
        stock: stock,
        salesCount: 10 + (i * 12),
        ratingAverage: Number((4.6 + ((i % 5) * 0.1)).toFixed(1)),
        reviewCount: 8 + (i * 3),
        images: [
          sub.image,
          "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=600"
        ],
        saleUnit: "قطعة",
        isFeatured: i <= 2,
        isActive: true,
        isLargeItem: isLarge,
        customShippingCost: isLarge ? 85 : null,
        allowedGovernorates: allowedGovs,
        warranty: "ضمان استبدال خلال 14 يوم في حالة عيب الصناعة",
        tags: [sub.name, brand, "عروض سوقي ستور", "أصلي"],
        createdAt: new Date(Date.now() - (i * 3600000 * 4)).toISOString(),
        updatedAt: new Date().toISOString()
      };

      products.push(prod);
    }
  });

  return products;
}

async function seed() {
  console.log("🌱 Starting Suki Store Catalog, Subcategories & Roles Seeder...");

  // 1. Categories
  fs.writeFileSync(
    path.join(DATA_DIR, 'categories.json'),
    JSON.stringify(MAIN_CATEGORIES, null, 2),
    'utf8'
  );
  console.log(`✅ Seeded ${MAIN_CATEGORIES.length} Main Categories.`);

  // 2. Sub-categories
  fs.writeFileSync(
    path.join(DATA_DIR, 'subcategories.json'),
    JSON.stringify(SUBCATEGORIES_CONFIG, null, 2),
    'utf8'
  );
  console.log(`✅ Seeded ${SUBCATEGORIES_CONFIG.length} Sub-Categories with square banners.`);

  // 3. Products
  const products = generateProducts();
  fs.writeFileSync(
    path.join(DATA_DIR, 'products.json'),
    JSON.stringify(products, null, 2),
    'utf8'
  );
  console.log(`✅ Seeded ${products.length} Products across all sub-categories (22 products each).`);

  // 4. Users (Mohamed Hakim - Primary Super Admin & Ahmed Gharib - Partner Admin)
  let users = [];
  const usersPath = path.join(DATA_DIR, 'users.json');
  if (fs.existsSync(usersPath)) {
    try {
      users = JSON.parse(fs.readFileSync(usersPath, 'utf8'));
    } catch (e) {
      users = [];
    }
  }

  const hashedPasswordAdmin = await bcrypt.hash('admin123456', 10);

  // Mohamed Hakim (Owner Super Admin)
  let hakimIndex = users.findIndex(u => u.email === 'admin@suki.store' || u.email === 'hakim@suki.store');
  const hakimUser = {
    id: hakimIndex >= 0 ? users[hakimIndex].id : 'user-mohamed-hakim',
    name: "محمد حكيم (المدير العام والمالك)",
    email: "admin@suki.store",
    phone: "01000000001",
    secondaryPhone: "",
    whatsappPhone: "01000000001",
    password: hashedPasswordAdmin,
    role: "super_admin",
    isOwner: true,
    isPartner: false,
    isLocked: false,
    isActive: true,
    avatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200&q=80",
    permissions: {
      canManageProducts: true,
      canManageCategories: true,
      canManageOrders: true,
      canManageCustomers: true,
      canManageCoupons: true,
      canManageBanners: true,
      canManageSupport: true,
      canManageLiveChat: true,
      canManagePush: true,
      canViewReports: true,
      canViewActivity: true,
      canManageSettings: true,
      canManageStaff: true,
      canManageSecurity: true,
      canManageReturns: true
    },
    customerId: "CUST-00001",
    createdAt: "2026-10-10T00:00:00.000Z",
    updatedAt: new Date().toISOString()
  };

  if (hakimIndex >= 0) {
    users[hakimIndex] = { ...users[hakimIndex], ...hakimUser };
  } else {
    users.unshift(hakimUser);
  }

  // Ahmed Gharib (Partner Admin)
  let ahmedIndex = users.findIndex(u => u.email === 'ahmed@suki.store' || u.name?.includes('احمد غريب'));
  const ahmedUser = {
    id: ahmedIndex >= 0 ? users[ahmedIndex].id : 'user-ahmed-gharib',
    name: "أحمد غريب (شريك الإدارة)",
    email: "ahmed@suki.store",
    phone: "01204277756",
    secondaryPhone: "",
    whatsappPhone: "01204277756",
    password: hashedPasswordAdmin,
    role: "super_admin",
    isOwner: false,
    isPartner: true,
    isLocked: false,
    isActive: true,
    avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200&q=80",
    permissions: {
      canManageProducts: true,
      canManageCategories: true,
      canManageOrders: true,
      canManageCustomers: true,
      canManageCoupons: true,
      canManageBanners: true,
      canManageSupport: true,
      canManageLiveChat: true,
      canManagePush: true,
      canViewReports: true,
      canViewActivity: true,
      canManageSettings: true,
      canManageStaff: true,
      canManageSecurity: false, // Advanced security whitelist is exclusive to Mohamed Hakim
      canManageReturns: true
    },
    customerId: "CUST-00002",
    createdAt: "2026-10-12T00:00:00.000Z",
    updatedAt: new Date().toISOString()
  };

  if (ahmedIndex >= 0) {
    users[ahmedIndex] = { ...users[ahmedIndex], ...ahmedUser };
  } else {
    users.splice(1, 0, ahmedUser);
  }

  fs.writeFileSync(usersPath, JSON.stringify(users, null, 2), 'utf8');
  console.log("✅ Seeded/Updated Mohamed Hakim (Owner Super Admin) & Ahmed Gharib (Partner Admin).");

  // 5. Settings (with IP control)
  const settingsPath = path.join(DATA_DIR, 'settings.json');
  const currentSettings = [
    {
      id: "store_settings",
      storeName: "سوقي ستور (Suki Store)",
      lowStockThreshold: 15,
      enableOtpVerification: false,
      enableWebPush: true,
      ipRestrictionEnabled: false, // "تسجيل الدخول بدون قيود ومن أي جهاز"
      allowedIpsHakim: ["127.0.0.1", "::1"],
      allowedIpsAhmed: ["127.0.0.1", "::1"],
      shippingBaseFee: 35,
      shippingAdditionalItemRate: 0.15, // 15% for each additional item
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
  ];
  fs.writeFileSync(settingsPath, JSON.stringify(currentSettings, null, 2), 'utf8');
  console.log("✅ Seeded Store Settings with flexible IP controls & 15% multi-item shipping rate.");

  // 6. Returns collection
  const returnsPath = path.join(DATA_DIR, 'returns.json');
  if (!fs.existsSync(returnsPath)) {
    fs.writeFileSync(returnsPath, JSON.stringify([], null, 2), 'utf8');
  }
  console.log("✅ Initialized returns.json database table.");

  console.log("🎉 Seeding completed successfully!");
}

seed().catch(err => {
  console.error("❌ Seed error:", err);
  process.exit(1);
});
