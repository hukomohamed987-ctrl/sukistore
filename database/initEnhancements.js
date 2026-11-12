const db = require('./db');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');

// Demo data (sample merchants, fake logs, fake accounting, demo accountant...) is ONLY created when
// SEED_DEMO_DATA=true is set in .env — never on a real store.
const DEMO = process.env.SEED_DEMO_DATA === 'true';

async function initEnhancements() {
  console.log('⚡ Running database migrations and enhancements...');

  // 1. Migrate Users
  const users = await db.users.getAll();
  for (let i = 0; i < users.length; i++) {
    const u = users[i];
    let needsUpdate = false;
    const updates = {};

    if (!u.customerId) {
      updates.customerId = `CUST-${10000 + i + 1}`;
      needsUpdate = true;
    }

    if (!Array.isArray(u.addresses) || u.addresses.length === 0) {
      const defaultAddr = u.address || {};
      updates.addresses = [
        {
          id: uuidv4(),
          label: 'عنوان التوصيل الرئيسي',
          recipientName: u.name || 'العميل',
          phone: u.phone || '',
          governorate: defaultAddr.city || defaultAddr.governorate || 'القاهرة',
          city: defaultAddr.city || 'القاهرة',
          area: defaultAddr.area || 'المنطقة الأولى',
          street: defaultAddr.street || 'الشارع الرئيسي',
          building: defaultAddr.building || 'عمارة 1',
          notes: defaultAddr.notes || '',
          isDefault: true
        }
      ];
      needsUpdate = true;
    }

    if (u.secondaryPhone === undefined) {
      updates.secondaryPhone = '';
      needsUpdate = true;
    }

    if (u.whatsappPhone === undefined) {
      updates.whatsappPhone = u.phone || '';
      needsUpdate = true;
    }

    if (needsUpdate) {
      await db.users.update(u.id, updates);
    }
  }

  // 2. Seed Brands if empty
  const brandsCount = await db.brands.count();
  if (brandsCount === 0) {
    console.log('🏷️ Seeding category brands...');
    const categories = await db.categories.getAll();
    const catMap = {};
    categories.forEach(c => {
      catMap[c.slug] = c.id;
    });

    const defaultBrands = [
      // Electronics
      { name: 'سامسونج', nameEn: 'Samsung', catSlugs: ['electronics', 'mobiles'], logo: 'https://images.unsplash.com/photo-1610945415295-d9bbf067e59c?w=200&q=80', description: 'رائدة التكنولوجيا والأجهزة الذكية' },
      { name: 'أبل', nameEn: 'Apple', catSlugs: ['electronics', 'mobiles'], logo: 'https://images.unsplash.com/photo-1611186871348-b1ce696e52c9?w=200&q=80', description: 'ابتكارات استثنائية وأداء لا مثيل له' },
      { name: 'شاومي', nameEn: 'Xiaomi', catSlugs: ['electronics', 'mobiles'], logo: 'https://images.unsplash.com/photo-1598327105666-5b89351aff97?w=200&q=80', description: 'أقوى مواصفات بأفضل قيمة اقتصادية' },
      { name: 'سوني', nameEn: 'Sony', catSlugs: ['electronics'], logo: 'https://images.unsplash.com/photo-1546868871-7041f2a55e12?w=200&q=80', description: 'الصوتيات والترفيه المنزلي فائق النقاء' },
      { name: 'JBL', nameEn: 'JBL', catSlugs: ['electronics'], logo: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=200&q=80', description: 'سماعات احترافية وصوت بيز جبار' },
      { name: 'ديل', nameEn: 'Dell', catSlugs: ['electronics'], logo: 'https://images.unsplash.com/photo-1588872657578-7efd1f1555ed?w=200&q=80', description: 'أجهزة كمبيوتر ولابتوب للاستخدام الشاق' },
      { name: 'ريلمي', nameEn: 'Realme', catSlugs: ['mobiles'], logo: 'https://images.unsplash.com/photo-1567581935884-3349723552ca?w=200&q=80', description: 'هواتف شبابية وشحن فائق السرعة' },
      { name: 'هواوي', nameEn: 'Huawei', catSlugs: ['mobiles', 'electronics'], logo: 'https://images.unsplash.com/photo-1546868871-7041f2a55e12?w=200&q=80', description: 'تقنيات اتصال وبطاريات تدوم طويلاً' },
      // Fashion
      { name: 'زارا', nameEn: 'Zara', catSlugs: ['fashion'], logo: 'https://images.unsplash.com/photo-1445205170230-053b83016050?w=200&q=80', description: 'أحدث خطوط الموضة والأناقة العالمية' },
      { name: 'تاون تيم', nameEn: 'Town Team', catSlugs: ['fashion'], logo: 'https://images.unsplash.com/photo-1489987707025-afc232f7ea0f?w=200&q=80', description: 'أزياء رجالية كاجوال ورسمية قطن 100%' },
      { name: 'ديفاكتو', nameEn: 'Defacto', catSlugs: ['fashion'], logo: 'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=200&q=80', description: 'ملابس عصرية مريحة لكافة أفراد العائلة' },
      { name: 'نايكي', nameEn: 'Nike', catSlugs: ['fashion'], logo: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=200&q=80', description: 'أحذية وملابس رياضية رائدة عالمياً' },
      // Supermarket
      { name: 'جهينة', nameEn: 'Juhayna', catSlugs: ['supermarket'], logo: 'https://images.unsplash.com/photo-1550583724-b2692b85b150?w=200&q=80', description: 'ألبان وعصائر طازجة وطبيعية' },
      { name: 'عبور لاند', nameEn: 'Obour Land', catSlugs: ['supermarket'], logo: 'https://images.unsplash.com/photo-1528735602780-2552fd46c7af?w=200&q=80', description: 'أجبان طبيعية فاخرة بمذاق أصيل' },
      { name: 'فيتا', nameEn: 'Vita', catSlugs: ['supermarket'], logo: 'https://images.unsplash.com/photo-1628088062854-d1870b4553da?w=200&q=80', description: 'منتجات استهلاكية وغذائية عالية الجودة' },
      { name: 'روابي', nameEn: 'Rawabi', catSlugs: ['supermarket'], logo: 'https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?w=200&q=80', description: 'سمن نباتي نقي بطعم ورائحة الزبدة الفلاحي' },
      { name: 'كادبوري', nameEn: 'Cadbury', catSlugs: ['supermarket'], logo: 'https://images.unsplash.com/photo-1549007994-cb92caebd54b?w=200&q=80', description: 'شوكولاتة الحليب الفاخرة بطعم يذوب في الفم' },
      // Home & Kitchen
      { name: 'تيفال', nameEn: 'Tefal', catSlugs: ['home-kitchen'], logo: 'https://images.unsplash.com/photo-1556911220-e15b29be8c8f?w=200&q=80', description: 'أواني وأدوات طهي غير قابلة للالتصاق' },
      { name: 'تورنيدو', nameEn: 'Tornado', catSlugs: ['home-kitchen'], logo: 'https://images.unsplash.com/photo-1584269600464-37b1b58a9fe7?w=200&q=80', description: 'أجهزة منزلية وكهربائية متينة بضمان العربي' },
      { name: 'براون', nameEn: 'Braun', catSlugs: ['home-kitchen'], logo: 'https://images.unsplash.com/photo-1570222094114-d054a817e56b?w=200&q=80', description: 'خلاطات ومحضرات طعام ألمانية فائقة القوة' },
      { name: 'زهران', nameEn: 'Zahran', catSlugs: ['home-kitchen'], logo: 'https://images.unsplash.com/photo-1544816155-12df9643f363?w=200&q=80', description: 'أواني ستانلس ستيل صحية تدوم مدى الحياة' },
      // Perfumes & Beauty
      { name: 'العربية للعود', nameEn: 'Arabian Oud', catSlugs: ['perfumes-beauty'], logo: 'https://images.unsplash.com/photo-1523293182086-7651a899d37f?w=200&q=80', description: 'عطور شرقية ملكية وبخور فاخر' },
      { name: 'لوريال', nameEn: "L'Oreal", catSlugs: ['perfumes-beauty'], logo: 'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?w=200&q=80', description: 'عناية متقدمة بالبشرة والشعر' },
      { name: 'نيڤيا', nameEn: 'Nivea', catSlugs: ['perfumes-beauty'], logo: 'https://images.unsplash.com/photo-1556228720-195a672e8a03?w=200&q=80', description: 'ترطيب طبيعي وحماية متكاملة للبشرة' },
      // Tools
      { name: 'بوش', nameEn: 'Bosch', catSlugs: ['tool'], logo: 'https://images.unsplash.com/photo-1581092160607-ee22621dd758?w=200&q=80', description: 'عدد وأدوات هندسية ومثاقب احترافية' },
      { name: 'إنجكو', nameEn: 'Ingco', catSlugs: ['tool'], logo: 'https://images.unsplash.com/photo-1504917599217-d4dc5ebe6122?w=200&q=80', description: 'أدوات يدوية ومعدات ورش صناعية عالية الكفاءة' }
    ];

    for (const b of defaultBrands) {
      const categoryIds = b.catSlugs.map(slug => catMap[slug]).filter(Boolean);
      await db.brands.insert({
        name: b.name,
        nameEn: b.nameEn,
        logo: b.logo,
        categoryIds,
        description: b.description
      });
    }
  }

  // 3. Migrate Products (Ensure default shipping 25, free shipping flag, and linked brands)
  const products = await db.products.getAll();
  const allBrands = await db.brands.getAll();

  let anyProductUpdated = false;
  for (const p of products) {
    let pUpdates = {};
    let shouldUpdate = false;

    if (p.shippingCost === undefined) {
      pUpdates.shippingCost = 25;
      shouldUpdate = true;
    }

    if (p.isFreeShipping === undefined) {
      pUpdates.isFreeShipping = p.shippingCost === 0;
      shouldUpdate = true;
    }

    // NOTE: no automatic per-governorate prices any more (it silently added +5 EGP for Alexandria),
    // and no guessed brands for real products — only in demo mode.
    if (!p.brand && DEMO) {
      // Find matching brand by tags or title
      const matchingBrand = allBrands.find(b => {
        const titleMatch = (p.title || '').includes(b.name) || (p.title || '').toLowerCase().includes(b.nameEn.toLowerCase());
        const tagMatch = Array.isArray(p.tags) && p.tags.some(t => t.includes(b.name));
        return titleMatch || tagMatch;
      });

      if (matchingBrand) {
        pUpdates.brand = matchingBrand.name;
        pUpdates.brandId = matchingBrand.id;
        shouldUpdate = true;
      } else {
        // Assign first brand in same category if exists
        const catBrand = allBrands.find(b => Array.isArray(b.categoryIds) && b.categoryIds.includes(p.categoryId));
        if (catBrand) {
          pUpdates.brand = catBrand.name;
          pUpdates.brandId = catBrand.id;
          shouldUpdate = true;
        }
      }
    }

    if (shouldUpdate) {
      Object.assign(p, pUpdates);
      anyProductUpdated = true;
    }
  }

  if (anyProductUpdated) {
    for (const product of products) await db.products.update(product.id, product);
  }

  // 4. Demo activity logs (demo mode only — a real store must never get invented history)
  const logCount = await db.activity_logs.count();
  if (logCount === 0 && DEMO) {
    console.log('📋 Seeding staff activity logs...');
    const staffMembers = await db.users.find(u => u.role === 'staff' || u.role === 'super_admin');
    const admin = staffMembers.find(u => u.role === 'super_admin') || { id: 'admin-1', name: 'المدير العام', role: 'super_admin' };
    const staffAhmed = staffMembers.find(u => u.email === 'ahmed@suki.store') || { id: 'staff-1', name: 'أحمد سامي', role: 'staff' };
    const staffSara = staffMembers.find(u => u.email === 'sara@suki.store') || { id: 'staff-2', name: 'سارة كمال', role: 'staff' };

    const initialLogs = [
      {
        userId: admin.id,
        userName: admin.name,
        userRole: admin.role,
        action: 'UPDATE_STORE_SETTINGS',
        module: 'settings',
        details: 'قام بتحديث إعدادات الشحن وتحديد الشحن الافتراضي 25 ج.م وتفعيل نظام العلامات التجارية',
        createdAt: new Date(Date.now() - 3600 * 1000 * 2).toISOString()
      },
      {
        userId: staffAhmed.id,
        userName: staffAhmed.name,
        userRole: staffAhmed.role,
        action: 'UPDATE_PRODUCT',
        module: 'products',
        details: 'قام بربط المنتجات بالعلامات التجارية (سامسونج، شاومي، أبل، JBL) وتحديث أسعار الشحن',
        createdAt: new Date(Date.now() - 3600 * 1000 * 5).toISOString()
      },
      {
        userId: staffSara.id,
        userName: staffSara.name,
        userRole: staffSara.role,
        action: 'UPDATE_ORDER_STATUS',
        module: 'orders',
        details: 'قامت بمراجعة وتأكيد طلبات الشحن الجديدة ونقلها لحالة "قيد التجهيز"',
        createdAt: new Date(Date.now() - 3600 * 1000 * 8).toISOString()
      },
      {
        userId: staffAhmed.id,
        userName: staffAhmed.name,
        userRole: staffAhmed.role,
        action: 'CREATE_CATEGORY',
        module: 'categories',
        details: 'قام بإضافة أقسام جديدة وتحديث صور البانرات الترويجية',
        createdAt: new Date(Date.now() - 3600 * 1000 * 24).toISOString()
      },
      {
        userId: staffSara.id,
        userName: staffSara.name,
        userRole: staffSara.role,
        action: 'REPLY_SUPPORT',
        module: 'support',
        details: 'قامت بالرد على استفسارات العملاء بخصوص مواعيد التوصيل لمحافظتي الإسكندرية والمنصورة',
        createdAt: new Date(Date.now() - 3600 * 1000 * 30).toISOString()
      }
    ];

    for (const log of initialLogs) {
      await db.activity_logs.insert(log);
    }
  }

  // 4. Initialize Store Settings if not set
  // 4. Initialize Store Settings if not set
  const settingsList = await db.settings.getAll();
  if (settingsList.length === 0) {
    console.log('⚙️ Initializing store default settings...');
    await db.settings.insert({
      id: 'store_settings',
      lowStockThreshold: 15,
      storeCommissionPercent: 2.5,
      googleClientId: '',
      googleClientSecret: '',
      enableOtpVerification: true,
      enableWebPush: true
    });
  } else if (settingsList[0].storeCommissionPercent === undefined) {
    await db.settings.update(settingsList[0].id, { storeCommissionPercent: 2.5 });
  }

  // 5. Ensure users have wishlist array
  for (const u of users) {
    if (!Array.isArray(u.wishlist)) {
      await db.users.update(u.id, { wishlist: [] });
    }
  }

  // 6. Ensure at least 1-2 products have low stock for demonstrating Low Stock Alert
  const allProductsList = await db.products.getAll();
  const lowStockProducts = allProductsList.filter(p => p.stock !== undefined && p.stock <= 15);
  // (demo mode only: this used to change REAL product stock to 6 and 12 on every restart)
  if (DEMO && lowStockProducts.length === 0 && allProductsList.length > 0) {
    console.log('📦 Setting demo low-stock items for alert demonstration...');
    if (allProductsList[0]) await db.products.update(allProductsList[0].id, { stock: 6 });
    if (allProductsList[1]) await db.products.update(allProductsList[1].id, { stock: 12 });
  }

  // 7. Demo accountant — SECURITY: only for a brand-new demo install, never on a real store.
  // (Before, a deleted accountant came back on every restart with a known password.)
  const existingAccountant = await db.users.findOne(u => u.email === 'accountant@suki.store');
  const seedSettings = (await db.settings.getAll())[0] || {};
  if (!existingAccountant && DEMO && !seedSettings.demoAccountantSeeded) {
    if (seedSettings.id) await db.settings.update(seedSettings.id, { demoAccountantSeeded: true });
    console.log('💼 Seeding dedicated Accountant user (accountant@suki.store)...');
    const salt = await bcrypt.genSalt(10);
    const accountantPassword = await bcrypt.hash('accountant123456', salt);
    await db.users.insert({
      name: 'المحاسب المالي (حسابات المتجر)',
      email: 'accountant@suki.store',
      phone: '01099998888',
      password: accountantPassword,
      role: 'accountant',
      isActive: true,
      isLocked: false,
      permissions: {
        canManageAccounting: true,
        canViewReports: true,
        canManageOrders: false,
        canManageProducts: false
      },
      avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200&q=80'
    });
  }

  // 8. Ensure Initial Merchants exist
  const merchantsCount = await db.merchants.count();
  const currentSettings = (await db.settings.getAll())[0] || {};
  if (DEMO && merchantsCount === 0 && !currentSettings.merchantsSeeded) {
    console.log('🏪 Seeding initial merchants catalogue...');
    const defaultMerchants = [
      {
        code: 'M-101',
        name: 'شركة النصر للأجهزة الكهربائية والإلكترونيات',
        phone: '01011223344',
        commissionRate: 2.5,
        address: 'شارع عبد العزيز - العتبة - القاهرة',
        notes: 'وكيل معتمد للأجهزة والإلكترونيات',
        isActive: true,
        totalProductsCount: 0
      },
      {
        code: 'M-102',
        name: 'الفارس للأزياء والعطور الفاخرة',
        phone: '01022334455',
        commissionRate: 3.0,
        address: 'روكسي - مصر الجديدة - القاهرة',
        notes: 'مورد أزياء قطنية وعطور شرقية وغربية',
        isActive: true,
        totalProductsCount: 0
      },
      {
        code: 'M-103',
        name: 'البيت العصري للأدوات المنزلية والمطبخ',
        phone: '01033445566',
        commissionRate: 2.0,
        address: 'شارع الهرم - الجيزة',
        notes: 'أواني طهي وأجهزة منزلية عالية الجودة',
        isActive: true,
        totalProductsCount: 0
      }
    ];

    for (const m of defaultMerchants) {
      await db.merchants.insert(m);
    }
    if (currentSettings.id) {
      await db.settings.update(currentSettings.id, { merchantsSeeded: true });
    }
  }

  // 9. Enforce strict single-owner exclusivity & backfill ONLY unowned seed catalog products once
  const merchants = await db.merchants.getAll();
  const refreshedProducts = await db.products.getAll();

  let sanitizedCount = 0;
  for (const p of refreshedProducts) {
    const isInvestorOwned = p.ownerType === 'investor' || Boolean(p.investorId) || Boolean(p.investorCode);
    const isMerchantOwned = !isInvestorOwned && (p.ownerType === 'merchant' || Boolean(p.merchantId) || Boolean(p.merchantCode));

    if (isInvestorOwned) {
      if (p.merchantCode || p.merchantName || p.merchantId || p.ownerType !== 'investor') {
        await db.products.update(p.id, {
          ownerType: 'investor',
          merchantCode: '',
          merchantName: '',
          merchantId: null
        });
        sanitizedCount++;
      }
    } else if (isMerchantOwned) {
      if (p.investorCode || p.investorName || p.investorId || p.ownerType !== 'merchant') {
        await db.products.update(p.id, {
          ownerType: 'merchant',
          investorCode: '',
          investorName: '',
          investorId: null
        });
        sanitizedCount++;
      }
    }
  }
  if (sanitizedCount > 0) {
    console.log(`🛡️ Cleaned mixed merchant/investor ownership on ${sanitizedCount} products.`);
  }

  // Only backfill initial seed catalog products (never admin/bulk uploaded or investor products)
  if (merchants.length > 0 && !currentSettings.catalogMerchantsBackfilled) {
    let pUpdated = 0;
    const latestProds = await db.products.getAll();
    for (let i = 0; i < latestProds.length; i++) {
      const p = latestProds[i];
      if (String(p.id).startsWith('prod-') && !p.merchantCode && !p.merchantId && !p.investorCode && !p.investorId && p.ownerType !== 'investor') {
        const assignedMerchant = merchants[i % merchants.length];
        await db.products.update(p.id, {
          ownerType: 'merchant',
          merchantCode: assignedMerchant.code,
          merchantName: assignedMerchant.name,
          merchantId: assignedMerchant.id
        });
        pUpdated++;
      }
    }
    if (currentSettings.id) {
      await db.settings.update(currentSettings.id, { catalogMerchantsBackfilled: true });
    }
    if (pUpdated > 0) {
      console.log(`📦 Backfilled merchant metadata into ${pUpdated} seed catalog products.`);
    }
  }

  // Sanitize any existing order items that inherited mixed merchant+investor tags from corrupted products
  const productMapAfterSanitize = new Map((await db.products.getAll()).map(p => [String(p.id), p]));
  const allOrdersToCheck = await db.orders.getAll();
  let ordersCleaned = 0;
  for (const ord of allOrdersToCheck) {
    if (!Array.isArray(ord.items)) continue;
    let changed = false;
    const cleanItems = ord.items.map(it => {
      const dbProd = productMapAfterSanitize.get(String(it.productId || it.id));
      const isInvItem = (dbProd && (dbProd.ownerType === 'investor' || dbProd.investorId || dbProd.investorCode)) ||
                        (!dbProd && (it.investorId || it.investorCode));
      if (isInvItem && (it.merchantCode || it.merchantName || it.merchantId)) {
        changed = true;
        return {
          ...it,
          ownerType: 'investor',
          merchantCode: '',
          merchantName: '',
          merchantId: null
        };
      }
      return it;
    });
    if (changed) {
      await db.orders.update(ord.id, { items: cleanItems });
      ordersCleaned++;
    }
  }
  if (ordersCleaned > 0) {
    console.log(`🧹 Cleaned mixed ownership on ${ordersCleaned} order(s).`);
  }

  // 9b. Ensure each merchant has a user account linked to the merchant portal.
  // SECURITY: never a known default password (was '123456'). The account gets a random secret nobody
  // knows; the store sets the real password from the merchants page before giving it to the merchant.
  const defaultMerchantPwdHash = await bcrypt.hash(require('crypto').randomBytes(24).toString('hex'), 10);
  for (const m of merchants) {
    const cleanCode = (m.code || '').trim().toUpperCase();
    if (!cleanCode) continue;
    const cleanUsername = m.username ? m.username.trim().toLowerCase() : cleanCode.toLowerCase().replace(/[^a-z0-9_-]/g, '');
    let existingUser = await db.users.findOne(u => 
      (u.username && u.username.toLowerCase() === cleanUsername) ||
      (u.merchantCode && u.merchantCode.toUpperCase() === cleanCode) ||
      (m.userId && u.id === m.userId)
    );
    if (!existingUser) {
      const userId = uuidv4();
      await db.users.insert({
        id: userId,
        name: m.name || cleanCode,
        username: cleanUsername,
        email: `${cleanUsername}@merchant.suki.store`,
        phone: m.phone || '',
        whatsappPhone: m.whatsapp || '',
        role: 'merchant',
        merchantId: m.id,
        merchantCode: cleanCode,
        canEditProducts: m.canEditProducts !== false,
        isActive: true,
        password: defaultMerchantPwdHash,
        permissions: {
          canViewDashboard: true,
          canManageProducts: true,
          canManageOrders: true
        },
        createdAt: new Date().toISOString()
      });
      await db.merchants.update(m.id, { userId, username: cleanUsername });
    } else {
      if (!existingUser.merchantCode || !existingUser.merchantId || existingUser.role !== 'merchant') {
        await db.users.update(existingUser.id, {
          merchantCode: cleanCode,
          merchantId: m.id,
          role: 'merchant'
        });
      }
      if (!m.userId || !m.username) {
        await db.merchants.update(m.id, { userId: existingUser.id, username: existingUser.username || cleanUsername });
      }
    }
  }

  // 10. Ensure initial Accounting and Employee Collections records for delivered orders
  const orders = await db.orders.getAll();
  const delivered = orders.filter(o => o.status === 'delivered');
  const accountingCount = await db.accounting.count();
  // (demo mode only: this invented accounting entries with the OLD 2.5% commission and fake couriers)
  if (DEMO && accountingCount === 0 && delivered.length > 0) {
    console.log('📊 Seeding initial accounting ledger and employee collections from delivered orders...');
    const commRate = 2.5;
    for (const o of delivered) {
      const grandTotal = Number(o.grandTotal) || 0;
      const commAmount = Math.round((grandTotal * commRate / 100) * 100) / 100;
      const merchantDues = Math.round((grandTotal - commAmount) * 100) / 100;
      const courierName = o.deliveredBy || 'كابتن محمود (شركة الشحن السريع)';

      await db.accounting.insert({
        orderId: o.id,
        orderNumber: o.orderNumber,
        customerName: o.customerName || 'عميل المتجر',
        customerPhone: o.customerPhone || '01000000000',
        deliveredBy: courierName,
        collectedAmount: grandTotal,
        paymentMethod: o.paymentMethod || 'cod',
        deliveryDate: o.deliveredAt || o.createdAt || new Date().toISOString(),
        storeCommissionPercent: commRate,
        storeCommissionAmount: commAmount,
        merchantDues,
        merchantCode: (o.items && o.items[0]?.merchantCode) || 'M-101',
        merchantName: (o.items && o.items[0]?.merchantName) || 'شركة النصر للأجهزة الكهربائية',
        status: 'completed',
        isRemittedToTreasury: o.paymentMethod === 'card'
      });
    }

    // Seed employee collection entries
    const empNames = ['كابتن محمود (شركة الشحن السريع)', 'كابتن طارق (مندوب القاهرة والجيزة)'];
    for (let i = 0; i < empNames.length; i++) {
      const name = empNames[i];
      const existing = await db.employee_collections.findOne(e => e.employeeName === name);
      if (!existing) {
        await db.employee_collections.insert({
          employeeName: name,
          ordersCount: (i + 1) * 3,
          cashToCollect: (i + 1) * 2450,
          remittedAmount: (i + 1) * 1500,
          difference: ((i + 1) * 2450) - ((i + 1) * 1500),
          lastDeliveryAt: new Date().toISOString()
        });
      }
    }
  }

  // 10. Replace any legacy "منور سوقي ستور / يا باشا" bot greeting in stored chats with Bassam's new greeting
  const chatsList = await db.chats.getAll();
  const { WELCOME_MESSAGE } = require('../utils/chatbotEngine');
  let chatsCleaned = 0;
  for (const chat of chatsList) {
    if (!Array.isArray(chat.messages)) continue;
    let chatModified = false;
    const cleanedMsgs = chat.messages.map(m => {
      if (m.sender === 'bot' && typeof m.text === 'string' && (m.text.includes('يا باشا') || m.text.includes('منور سوقي ستور'))) {
        chatModified = true;
        return { ...m, text: WELCOME_MESSAGE };
      }
      return m;
    });
    if (chatModified) {
      await db.chats.update(chat.id, { messages: cleanedMsgs });
      chatsCleaned++;
    }
  }
  if (chatsCleaned > 0) {
    console.log(`💬 Updated legacy chatbot greeting in ${chatsCleaned} conversation(s).`);
  }

  console.log('✅ Database enhancements and migrations completed successfully!');
}

module.exports = initEnhancements;
