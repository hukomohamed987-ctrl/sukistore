const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const db = require('./db');

async function seedData() {
  console.log('🌱 Seeding Suki Store initial database...');

  const usersCount = await db.users.count();
  if (usersCount > 0) {
    console.log('Data already seeded. Skipping initial seed.');
    return;
  }

  const salt = await bcrypt.genSalt(10);
  const adminPassword = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), salt);
  const staffPassword = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), salt);
  const customerPassword = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), salt);

  // 1. Super Admin
  const superAdmin = await db.users.insert({
    name: 'المدير العام (Super Admin)',
    email: 'admin@suki.store',
    phone: '01000000001',
    password: adminPassword,
    role: 'super_admin',
    isLocked: false,
    isActive: true,
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200&q=80'
  });

  // 2. Staff Member 1 (Products & Banners)
  const staff1 = await db.users.insert({
    name: 'أحمد سامي (إدارة المنتجات)',
    email: 'ahmed@suki.store',
    phone: '01000000002',
    password: staffPassword,
    role: 'staff',
    isActive: true,
    isLocked: false,
    permissions: {
      canManageProducts: true,
      canManageCategories: true,
      canManageBanners: true,
      canManageCoupons: true,
      canManageOrders: false,
      canManageCustomers: false,
      canManageSupport: false
    },
    avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200&q=80'
  });

  // 3. Staff Member 2 (Orders & Customer Support)
  const staff2 = await db.users.insert({
    name: 'سارة كمال (خدمة العملاء والطلبات)',
    email: 'sara@suki.store',
    phone: '01000000003',
    password: staffPassword,
    role: 'staff',
    isActive: true,
    isLocked: false,
    permissions: {
      canManageProducts: false,
      canManageCategories: false,
      canManageBanners: false,
      canManageCoupons: false,
      canManageOrders: true,
      canManageCustomers: true,
      canManageSupport: true
    },
    avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200&q=80'
  });

  // 4. Demo Customer
  const customer = await db.users.insert({
    name: 'محمد عبدالله',
    email: 'customer@suki.store',
    phone: '01012345678',
    password: customerPassword,
    role: 'customer',
    isLocked: false,
    address: {
      fullName: 'محمد عبدالله',
      phone: '01012345678',
      city: 'القاهرة',
      area: 'مدينة نصر',
      street: 'شارع عباس العقاد',
      building: 'عمارة 14 - الدور الرابع',
      notes: 'يرجى الاتصال قبل الوصول'
    },
    avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=200&q=80'
  });

  // 5. Categories
  const catElectronics = await db.categories.insert({
    name: 'إلكترونيات وأجهزة ذكية',
    slug: 'electronics',
    description: 'أحدث الأجهزة الذكية، الشاشات، السماعات ومستلزمات التقنية بضمان معتمد',
    image: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=600&q=80',
    icon: 'tv',
    orderIndex: 1
  });

  const catMobiles = await db.categories.insert({
    name: 'الجوالات والإكسسوارات',
    slug: 'mobiles',
    description: 'أحدث الهواتف الذكية والأجهزة اللوحية وبنوك الطاقة وكابلات الشحن السريع',
    image: 'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=600&q=80',
    icon: 'smartphone',
    orderIndex: 2
  });

  const catFashion = await db.categories.insert({
    name: 'الأزياء والملابس',
    slug: 'fashion',
    description: 'تشكيلة متجددة من أرقى الملابس الرجالية والنسائية العصرية بخامات قطنية نقية',
    image: 'https://images.unsplash.com/photo-1489987707025-afc232f7ea0f?w=600&q=80',
    icon: 'shirt',
    orderIndex: 3
  });



  const catHome = await db.categories.insert({
    name: 'المنزل والمطبخ',
    slug: 'home-kitchen',
    description: 'أدوات المطبخ العصرية، أجهزة القهوة، وأحدث ديكورات المنزل المريحة',
    image: 'https://images.unsplash.com/photo-1556911220-e15b29be8c8f?w=600&q=80',
    icon: 'home',
    orderIndex: 5
  });

  const catBeauty = await db.categories.insert({
    name: 'العطور والعناية الشخصية',
    slug: 'perfumes-beauty',
    description: 'عطور شرقية وفرنسية أصلية، ومستحضرات العناية الطبيعية بالبشرة',
    image: 'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?w=600&q=80',
    icon: 'sparkles',
    orderIndex: 6
  });

  // 6. Products with Variations & Sale Units
  const p1 = await db.products.insert({
    title: 'سماعات بلوتوث لاسلكية عازلة للضوضاء برو 5.3',
    description: 'سماعات أذن متطورة مع تقنية العزل الصوتي الفائق ANC، بطارية تدوم حتى 36 ساعة، شحن سريع Type-C، ومقاومة لرذاذ الماء مع صوت نقي محيطي ثلاثي الأبعاد.',
    categoryId: catElectronics.id,
    price: 890,
    compareAtPrice: 1250,
    saleUnit: 'قطعة',
    stock: 45,
    shippingCost: 0,
    images: [
      'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=800&q=80',
      'https://images.unsplash.com/photo-1583394838336-acd977736f90?w=800&q=80',
      'https://images.unsplash.com/photo-1484704849700-f032a568e944?w=800&q=80'
    ],
    videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    variations: [
      { name: 'اللون', values: ['أسود ملكي فاخر', 'أبيض لؤلؤي', 'أزرق كحلي'] }
    ],
    isFeatured: true,
    isActive: true,
    tags: ['سماعات', 'إلكترونيات', 'بلوتوث', 'عازل للضوضاء'],
    salesCount: 128
  });

  const p2 = await db.products.insert({
    title: 'هاتف ذكي ألترا برو ماكس 5G - شاشة AMOLED 120Hz',
    description: 'معالج قوي ثماني النواة للألعاب والتطبيقات الثقيلة، كاميرا احترافية بدقة 108 ميجابكسل، بطارية ضخمة 5000 مللي أمبير مع شاحن توربو 67 واط في العلبة.',
    categoryId: catMobiles.id,
    price: 9400,
    compareAtPrice: 10900,
    saleUnit: 'قطعة',
    stock: 20,
    shippingCost: 0,
    images: [
      'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=800&q=80',
      'https://images.unsplash.com/photo-1598327105666-5b89351aff97?w=800&q=80'
    ],
    videoUrl: '',
    variations: [
      { name: 'السعة التخزينية', values: ['128 جيجابايت', '256 جيجابايت', '512 جيجابايت'] },
      { name: 'اللون', values: ['تيتانيوم رمادي', 'أزرق داكن', 'أخضر زمردي'] }
    ],
    isFeatured: true,
    isActive: true,
    tags: ['جوالات', 'موبايل', '5G', 'شاومي', 'سامسونج'],
    salesCount: 64
  });



  const p5 = await db.products.insert({
    title: 'هودي رجالي قطن مصري 100% أوفر سايز شتوي',
    description: 'تصميم كاجوال عصري ومريح، بطانة داخلية صوفية ناعمة توفر الدفء الفائق، جيوب أمامية كانغرو، وثبات عالي للألوان بعد الغسيل المتكرر.',
    categoryId: catFashion.id,
    price: 490,
    compareAtPrice: 650,
    saleUnit: 'قطعة',
    stock: 70,
    shippingCost: 35,
    images: [
      'https://images.unsplash.com/photo-1556905055-8f358a7a47b2?w=800&q=80',
      'https://images.unsplash.com/photo-1509967419530-da38b4704bc6?w=800&q=80'
    ],
    videoUrl: '',
    variations: [
      { name: 'المقاس', values: ['M (متوسط)', 'L (كبير)', 'XL (كبير جداً)', 'XXL (جامبو)'] },
      { name: 'اللون', values: ['أسود داكن', 'رمادي ميلانج', 'أخضر زيتي', 'بيج صحراوي'] }
    ],
    isFeatured: true,
    isActive: true,
    tags: ['هودي', 'ملابس', 'شتوي', 'قطن', 'أزياء'],
    salesCount: 215
  });

  const p6 = await db.products.insert({
    title: 'ماكينة تحضير قهوة إسبريسو وكابتشينو منزلية بمضخة إيطالية 15 بار',
    description: 'استمتع بمذاق القهوة الفاخرة كالمقاهي الاحترافية! خزان مياه سعة 1.5 لتر قابل للفك، عصا تبخير حليب استانلس ستيل لصنع رغوة الحليب الغنية لللاتيه والكابتشينو.',
    categoryId: catHome.id,
    price: 2650,
    compareAtPrice: 3400,
    saleUnit: 'قطعة',
    stock: 35,
    shippingCost: 0,
    images: [
      'https://images.unsplash.com/photo-1517668808822-9ebb02f2a0e6?w=800&q=80',
      'https://images.unsplash.com/photo-1587080413959-06b859fb107d?w=800&q=80'
    ],
    videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    variations: [
      { name: 'اللون والتشطيب', values: ['فضي كروم استانلس ستيل', 'أسود غير لامع Matte Black'] }
    ],
    isFeatured: true,
    isActive: true,
    tags: ['ماكينة قهوة', 'إسبريسو', 'مطبخ', 'أجهزة منزلية'],
    salesCount: 88
  });



  await db.banners.insert({
    title: 'شتاء دافئ وأناقة عصرية بأجود الخامات',
    subtitle: 'تشكيلة الهوديز والملابس الشتوية من القطن الخالص بأسعار لا تُنافس',
    badgeText: 'تشكيلة جديدة ✨',
    imageUrl: 'https://images.unsplash.com/photo-1489987707025-afc232f7ea0f?w=1200&q=80',
    linkUrl: '#/category/fashion',
    bgGradient: 'linear-gradient(135deg, #d97706 0%, #b45309 50%, #78350f 100%)',
    orderIndex: 3,
    isActive: true
  });

  // 8. Coupons
  await db.coupons.insert({
    code: 'SUKI10',
    discountType: 'percentage',
    discountValue: 10,
    minOrderValue: 200,
    maxDiscountCap: 100,
    maxUses: 1000,
    usedCount: 42,
    expiresAt: '2027-12-31T23:59:59Z',
    isActive: true
  });

  await db.coupons.insert({
    code: 'WELCOME50',
    discountType: 'fixed',
    discountValue: 50,
    minOrderValue: 350,
    maxDiscountCap: null,
    maxUses: 500,
    usedCount: 18,
    expiresAt: '2027-12-31T23:59:59Z',
    isActive: true
  });

  await db.coupons.insert({
    code: 'RAMADAN25',
    discountType: 'percentage',
    discountValue: 25,
    minOrderValue: 500,
    maxDiscountCap: 150,
    maxUses: 200,
    usedCount: 5,
    expiresAt: '2027-12-31T23:59:59Z',
    isActive: true
  });

  // 9. Product Reviews
  await db.reviews.insert({
    productId: p1.id,
    userId: customer.id,
    userName: 'محمد عبدالله',
    userAvatar: customer.avatar,
    rating: 5,
    comment: 'ما شاء الله السماعة صوتها ممتاز جداً ونقي، والعزل شغال بجدارة، والشحن قعد معايا 3 أيام!',
    isVerifiedPurchase: true
  });

  await db.reviews.insert({
    productId: p1.id,
    userId: 'mock-user-1',
    userName: 'طارق حسام',
    userAvatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=200&q=80',
    rating: 5,
    comment: 'توصيل سريع خلال 24 ساعة والتغليف ممتاز، منتج أصلي 100% أنصح بيه جداً.',
    isVerifiedPurchase: true
  });

  await db.reviews.insert({
    productId: p6.id,
    userId: customer.id,
    userName: 'محمد عبدالله',
    userAvatar: customer.avatar,
    rating: 5,
    comment: 'القهوة رائحتها تملأ البيت، تحميص طازج وقوام كريمي ممتاز للإسبريسو.',
    isVerifiedPurchase: true
  });

  // 10. Demo Orders
  const order1 = await db.orders.insert({
    orderNumber: 'SUKI-88219',
    userId: customer.id,
    customerName: 'محمد عبدالله',
    customerEmail: 'customer@suki.store',
    customerPhone: '01012345678',
    shippingAddress: {
      fullName: 'محمد عبدالله',
      phone: '01012345678',
      city: 'القاهرة',
      area: 'مدينة نصر',
      street: 'شارع عباس العقاد',
      building: 'عمارة 14 - الدور الرابع',
      notes: 'يرجى الاتصال قبل الوصول'
    },
    paymentMethod: 'cod',
    paymentStatus: 'paid',
    items: [
      {
        productId: p1.id,
        title: p1.title,
        price: p1.price,
        quantity: 1,
        image: p1.images[0],
        saleUnit: 'قطعة',
        selectedOptions: { 'اللون': 'أسود ملكي فاخر' },
        lineTotal: p1.price
      },
      {
        productId: p6.id,
        title: p6.title,
        price: p6.price,
        quantity: 1,
        image: p6.images[0],
        saleUnit: 'كيلو',
        selectedOptions: { 'درجة الطحن': 'طحن ناعم للإسبريسو' },
        lineTotal: p6.price
      }
    ],
    subtotal: 1210,
    shippingFee: 0,
    discountAmount: 100,
    appliedCoupon: { code: 'SUKI10', discountAmount: 100 },
    grandTotal: 1110,
    status: 'delivered',
    statusHistory: [
      { status: 'pending', label: 'تم استلام الطلب', note: 'تم إنشاء الطلب بنجاح', timestamp: '2026-10-08T10:00:00Z' },
      { status: 'processing', label: 'قيد التجهيز', note: 'تم تغليف المنتجات', timestamp: '2026-10-08T14:30:00Z' },
      { status: 'shipped', label: 'قيد الشحن', note: 'الشحنة مع مندوب التوصيل أحمد', timestamp: '2026-10-09T09:15:00Z' },
      { status: 'delivered', label: 'تم التسليم بنجاح', note: 'تم تسليم الشحنة للعميل واستلام المبلغ', timestamp: '2026-10-09T16:45:00Z' }
    ]
  });

  const order2 = await db.orders.insert({
    orderNumber: 'SUKI-92041',
    userId: customer.id,
    customerName: 'محمد عبدالله',
    customerEmail: 'customer@suki.store',
    customerPhone: '01012345678',
    shippingAddress: {
      fullName: 'محمد عبدالله',
      phone: '01012345678',
      city: 'القاهرة',
      area: 'مدينة نصر',
      street: 'شارع عباس العقاد',
      building: 'عمارة 14 - الدور الرابع',
      notes: ''
    },
    paymentMethod: 'cod',
    paymentStatus: 'pending',
    items: [
      {
        productId: p5.id,
        title: p5.title,
        price: p5.price,
        quantity: 2,
        image: p5.images[0],
        saleUnit: 'قطعة',
        selectedOptions: { 'المقاس': 'L (كبير)', 'اللون': 'أسود داكن' },
        lineTotal: p5.price * 2
      }
    ],
    subtotal: 980,
    shippingFee: 0,
    discountAmount: 50,
    appliedCoupon: { code: 'WELCOME50', discountAmount: 50 },
    grandTotal: 930,
    status: 'shipped',
    statusHistory: [
      { status: 'pending', label: 'تم استلام الطلب', note: 'تم إنشاء الطلب', timestamp: '2026-10-10T11:00:00Z' },
      { status: 'processing', label: 'قيد التجهيز', note: 'يتم تجهيز المنتجات', timestamp: '2026-10-10T15:00:00Z' },
      { status: 'shipped', label: 'قيد الشحن', note: 'الطلب في طريقه إليك اليوم', timestamp: '2026-10-11T08:00:00Z' }
    ]
  });

  // 11. Initial Notifications for Customer
  await db.notifications.insert({
    userId: customer.id,
    orderId: order2.id,
    title: 'طلبك خرج للشحن! 🚚',
    message: 'طلبك رقم #SUKI-92041 أصبح الآن قيد الشحن وسيتصل بك المندوب قريباً.',
    isRead: false
  });

  await db.notifications.insert({
    userId: customer.id,
    orderId: order1.id,
    title: 'تم تسليم طلبك بنجاح ✅',
    message: 'تم تسليم طلبك رقم #SUKI-88219. نتمنى أن تنال المنتجات إعجابك!',
    isRead: true
  });

  // 12. Support message
  await db.support.insert({
    name: 'كريم محمود',
    email: 'karim@gmail.com',
    phone: '01122334455',
    subject: 'استفسار عن الشحن لمحافظة الإسكندرية',
    message: 'السلام عليكم، هل متاح الشحن والتوصيل خلال 24 ساعة للإسكندرية وما هي التكلفة؟ شكراً لكم.',
    status: 'unread',
    replyNotes: ''
  });

  console.log('✅ Suki Store initial database seeded successfully!');
}

module.exports = seedData;

if (require.main === module) {
  seedData().then(() => process.exit(0)).catch(err => {
    console.error(err);
    process.exit(1);
  });
}
