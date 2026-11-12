/**
 * Store language (Arabic / English).
 * The pages are written in Arabic; when English is on, a small translator swaps every
 * known Arabic text (and placeholders / titles) for its English version as it appears.
 * The dashboard (#/admin) always stays in Arabic.
 * Product / category names come from the database and stay as the owner wrote them.
 * To add a translation: add  'النص العربي': 'English text'  to DICT below.
 */
const I18n = {
  lang: (() => { try { return localStorage.getItem('suki_lang') === 'en' ? 'en' : 'ar'; } catch (e) { return 'ar'; } })(),

  DICT: {
    // ---- header / top bar ----
    'التوصيل إلى:': 'Deliver to:', 'تحديد عنوان التوصيل': 'Set delivery address', 'شحن لكل المحافظات': 'Delivery to all governorates',
    'الدفع عند الاستلام': 'Cash on delivery', 'مركز المساعدة': 'Help center', 'سوقي ستور': 'Souqy Store',
    'سوقك العربي الأول': 'Your first Arab market', 'سوقك العربي المتكامل': 'Your complete Arab market',
    'الإشعارات': 'Notifications', 'تحديد الكل كمقروء': 'Mark all as read', 'المفضلة': 'Wishlist', 'السلة': 'Cart',
    'الوضع الليلي': 'Dark mode', 'الوضع النهاري': 'Light mode', 'حسابي': 'My account', 'حسابي الشخصي': 'My profile',
    'طلباتي': 'My orders', 'طلبات الاستبدال': 'Exchange requests', 'حساباتي ومستحقاتي': 'My balance', 'لوحة المستثمر': 'Investor dashboard',
    'لوحة التاجر': 'Merchant dashboard', 'لوحة التحكم': 'Dashboard', 'تسجيل الخروج': 'Log out', 'دخول': 'Log in',
    'ابحث عن منتج أو ماركة...': 'Search for a product or brand...', 'بحث': 'Search', 'الرئيسية': 'Home',
    'المزيد من الأقسام': 'More categories', 'باقي الأقسام': 'More categories', 'كل الأقسام': 'All categories', 'تواصل معنا': 'Contact us',
    'إغلاق': 'Close', 'تحميل التطبيق': 'Get the app', 'ثبّت تطبيق سوقي ستور على جهازك': 'Install the Souqy Store app',
    'لا توجد إشعارات حالياً': 'No notifications yet', 'ستظهر هنا أحدث التنبيهات والعروض الحصرية': 'Your latest alerts and offers will show here',
    'فشل تحميل الإشعارات': 'Could not load notifications', 'تم تحديد جميع الإشعارات كمقروءة ✅': 'All notifications marked as read ✅',
    'الأقسام': 'Categories', 'تصفح أحدث المنتجات والعروض': 'Browse the latest products and offers', 'الآن': 'now',
    // ---- footer ----
    'منتجات مختارة بعناية، أسعار واضحة، وتوصيل لكل المحافظات مع الدفع عند الاستلام.': 'Carefully chosen products, clear prices and delivery everywhere with cash on delivery.',
    'أقسام المتجر': 'Shop categories', 'روابط مهمة': 'Useful links', 'من نحن': 'About us', 'سياسة الخصوصية': 'Privacy policy',
    'الشروط والأحكام': 'Terms & conditions', 'مركز المساعدة والدعم': 'Help & support', 'تتبع طلبي': 'Track my order',
    'طرق الدفع المدعومة': 'Payment methods', 'فيسبوك': 'Facebook', 'إنستغرام': 'Instagram', 'تيك توك': 'TikTok', 'واتساب': 'WhatsApp',
    'فيزا': 'Visa', 'ماستركارد': 'Mastercard', 'جميع الحقوق محفوظة.': 'All rights reserved.',
    // ---- bottom nav ----
    'المستثمر': 'Investor', 'التاجر': 'Merchant',
    // ---- cart drawer / cart page ----
    'سلتك فارغة حالياً': 'Your cart is empty', 'استكشف آلاف المنتجات والعروض الحصرية وابدأ التسوق!': 'Explore our products and offers and start shopping!',
    'تصفح المنتجات الآن': 'Browse products', 'المجموع الفرعي:': 'Subtotal:', 'عرض السلة': 'View cart', 'إتمام الطلب': 'Checkout', 'حذف': 'Remove',
    'سلتك فارغة تماماً': 'Your cart is empty', 'ابدأ التسوق الآن': 'Start shopping', 'المنتج': 'Product', 'الإجمالي': 'Total',
    'هل لديك كود خصم أو كوبون؟': 'Have a discount code?', 'إلغاء الكود': 'Remove code', 'تطبيق': 'Apply', 'ملخص الطلب': 'Order summary',
    'الإجمالي النهائي:': 'Grand total:', 'متابعة الشراء وإتمام الطلب': 'Proceed to checkout', 'متابعة التسوق': 'Continue shopping',
    'معاملة آمنة ومحمية 100%': '100% secure checkout', 'توصيل سريع لجميع أنحاء مصر': 'Fast delivery all over Egypt', 'مثال: SUKI10': 'e.g. SUKI10',
    'يُرجى كتابة كود الخصم أولاً': 'Please enter a discount code first', 'يُرجى تسجيل الدخول أولاً لتطبيق كود الخصم': 'Please log in to use a discount code',
    'تم إلغاء كود الخصم': 'Discount code removed', 'تم حذف المنتج من السلة': 'Removed from cart', 'شحن مجاني': 'Free shipping',
    'الكمية': 'Quantity', 'السعر': 'Price', 'تغيير 📍': 'Change 📍',
    // ---- chatbot ----
    'تحدث مع بسام 💬': 'Chat with Bassam 💬', 'بسام • المساعد الذكي لسوقي ستور': 'Bassam • Souqy Store assistant',
    'متصل الآن • معاك في التسوق وخدمة العملاء': 'Online • here to help', '🔥 أحدث العروض والخصومات': '🔥 Latest offers',
    '🎁 رصيد نقاطي وكوبوناتي': '🎁 My points & coupons', '🚚 مصاريف الشحن': '🚚 Shipping fees', '📦 تتبع طلبي': '📦 Track my order',
    '👨‍💼 التحدث مع موظف': '👨‍💼 Talk to an agent', 'بسام يكتب': 'Bassam is typing',
    'أدخل اسمك ورقم موبايلك لتحويل المحادثة فوراً لأحد موظفي خدمة العملاء:': 'Enter your name and mobile number to talk to a support agent:',
    'تأكيد والتحويل لموظف الآن': 'Connect me to an agent', 'إلغاء': 'Cancel', 'محول لخدمة العملاء • متابعة مباشرة مع موظف': 'Connected to support • a real agent will reply',
    'تحويل لموظف': 'Talk to an agent', 'بدء محادثة جديدة': 'New conversation', 'اسم حضرتك الكريم': 'Your name',
    'رقم الموبايل / واتساب (اختياري للمتابعة السريعة)': 'Mobile / WhatsApp (optional)', 'اكتب سؤالك أو اسم المنتج لبسام يا فندم...': 'Type your question or a product name...',
    'تم تحويل طلبك لخدمة العملاء بنجاح وسيتم الرد عليك قريباً': 'Your chat was sent to support, an agent will reply soon', 'فشل تحويل المحادثة': 'Could not transfer the chat',
    // ---- push / pwa ----
    'تفعيل إشعارات سوقي ستور 🔔': 'Enable Souqy Store notifications 🔔', 'تفعيل الإشعارات': 'Enable notifications', 'لاحقاً': 'Later',
    'حسناً، فهمت': 'OK, got it', 'تثبيت تطبيق سوقي ستور على شاشتك': 'Add Souqy Store to your home screen',
    // ---- home ----
    'جاري تحميل أحدث العروض والمنتجات...': 'Loading the latest offers...', 'شحن فائق السرعة': 'Super-fast delivery',
    'توصيل لكافة المحافظات خلال 24 - 48 ساعة': 'Delivery to all governorates in 24–48 hours', 'ادفع نقداً عند استلام شحنتك أو بالبطاقة بكل أمان': 'Pay cash on delivery or by card, safely',
    'ضمان 14 يوم لعيب الصناعة': '14-day defect guarantee', 'ضمان استبدال خلال 14 يوم في حالة عيب الصناعة': '14-day exchange for manufacturing defects',
    'دعم فني 24/7': 'Support 24/7', 'فريق جاهز لخدمتكم عبر الواتساب والمحادثة المباشرة': 'Our team is ready on WhatsApp and live chat',
    'تصفح حسب الأقسام': 'Shop by category', 'مختارات تناسب اهتماماتك': 'Picked for you', 'منتجات مقترحة خصيصاً لك بناءً على تفضيلاتك في سوقي ستور': 'Suggestions based on what you like',
    'عرض المزيد': 'Show more', 'الأكثر مبيعاً في سوقي ستور': 'Best sellers', 'المنتجات الأكثر طلباً وإقبالاً من قِبل عملاء متجرنا': 'Our customers\' favourite products',
    'عرض الكل': 'View all', 'منتجات مميزة وعروض كبرى': 'Featured products & big deals', 'مشاهدة الكل': 'View all', 'كوبون خصم إضافي': 'Extra discount coupon',
    'استخدم كود الخصم': 'Use the code', 'تسوق العروض الآن': 'Shop the deals', 'أحدث المنتجات المضافة': 'New arrivals', 'مشاهدة المزيد': 'See more',
    'تسوق الآن': 'Shop now', 'جديد • لا توجد تقييمات بعد': 'New • no reviews yet', 'ج.م': 'EGP', 'اختار المقاس/اللون': 'Choose size/colour',
    'أضف إلى السلة': 'Add to cart', 'السابق': 'Previous', 'التالي': 'Next', 'أضف إلى المفضلة': 'Add to wishlist',
    'حدث خطأ أثناء تحميل محتوى الصفحة الرئيسية. يُرجى تحديث الصفحة.': 'Something went wrong loading the home page. Please refresh.',
    // ---- category / search ----
    'جاري تحميل تشكيلة المنتجات والأقسام...': 'Loading products...', 'نتائج البحث عن:': 'Search results for:', 'جميع الأقسام': 'All categories',
    'قسم رئيسي': 'Main category', 'عرض كل المنتجات': 'View all products', 'كافة الأقسام الفرعية': 'All subcategories', 'تطبيق البحث والفلترة': 'Apply filters',
    'تصفح حسب العلامات التجارية:': 'Shop by brand:', 'الكل': 'All', 'عدد المنتجات:': 'Products:', '(يعرض 40 منتج بكل صفحة)': '(40 per page)',
    'عروض وخصومات فقط 🔥': 'Deals only 🔥', 'ترتيب حسب:': 'Sort by:', 'الأحدث وصولاً': 'Newest', 'السعر: من الأقل للأعلى': 'Price: low to high',
    'السعر: من الأعلى للأقل': 'Price: high to low', 'الأعلى تقييماً': 'Top rated', 'أكبر نسبة خصم': 'Biggest discount',
    'لا توجد منتجات مطابقة لخيارات الفلترة الحالية': 'No products match these filters', 'إعادة ضبط الفلترة بالكامل': 'Reset all filters',
    'الصفحة السابقة': 'Previous page', 'الصفحة التالية': 'Next page', 'حدث خطأ أثناء تحميل منتجات القسم.': 'Could not load this category.',
    // ---- product ----
    'جاري تحميل بيانات المنتج...': 'Loading product...', 'المنتج غير موجود أو تم حذفه': 'This product does not exist or was removed',
    'فشل تحميل تفاصيل المنتج': 'Could not load the product', 'مشاهدة فيديو توضيحي للمنتج': 'Watch the product video', 'العلامة التجارية:': 'Brand:',
    'لا توجد تقييمات بعد': 'No reviews yet', 'الدفع عند الاستلام متاح': 'Cash on delivery available', 'شحن مجاني لكافة المحافظات 🎉': 'Free shipping everywhere 🎉',
    'الكمية المطلوبة:': 'Quantity:', 'شراء الآن': 'Buy now', 'نفدت الكمية من المخزون': 'Out of stock', 'مشاركة المنتج:': 'Share:', 'نسخ الرابط': 'Copy link',
    'ضمان سوقي ستور المعتمد 🛡️': 'Souqy Store guarantee 🛡️', 'ضمان استبدال خلال 14 يوم في حالة عيب الصناعة.': '14-day exchange for manufacturing defects.',
    'وصف ومواصفات المنتج': 'Description & specifications', 'تقييمات وآراء العملاء': 'Customer reviews', 'أضف تقييمك': 'Write a review',
    'عملية شراء مؤكدة': 'Verified purchase', 'رد سوقي ستور:': 'Souqy Store reply:', 'لا توجد تقييمات لهذا المنتج بعد. كن أول من يقيّم المنتج!': 'No reviews yet. Be the first to review!',
    'منتجات مختارة بعناية من نفس الفئة والماركة قد تناسب اهتماماتك': 'Similar products you may like', 'التقييم بالنجوم:': 'Rating:',
    'تعليقك ورأيك في المنتج:': 'Your review:', 'نشر التقييم': 'Post review', 'شاركنا تجربتك مع المنتج، جودته، وسرعة التوصيل...': 'Tell us about the product, its quality and delivery...',
    'عفواً، هذا المنتج غير متوفر في المخزون': 'Sorry, this product is out of stock', 'عفواً، الاختيار ده نفدت كميته من المخزون حالياً': 'Sorry, this option is out of stock',
    'يُرجى تسجيل الدخول أولاً لإضافة تقييمك': 'Please log in to write a review', 'تم نسخ رابط المنتج المباشر بنجاح! 📋': 'Link copied! 📋',
    'تعذر نسخ الرابط تلقائياً': 'Could not copy the link', 'تمت إضافة المنتج إلى قائمة أمنياتك بنجاح ❤️': 'Added to your wishlist ❤️',
    'تمت إزالة المنتج من المفضلة': 'Removed from wishlist', 'منتجات مشابهة': 'Similar products', 'متوفر': 'In stock', 'غير متوفر': 'Out of stock',
    // ---- checkout ----
    'يتطلب إتمام الطلب تسجيل الدخول': 'Please log in to checkout', 'سجل دخولك أو أنشئ حساباً جديداً لحفظ طلبك ومتابعة شحنته بسهولة.': 'Log in or create an account to save your order and track it easily.',
    'تسجيل الدخول': 'Log in', 'إنشاء حساب جديد': 'Create account', 'إتمام الطلب والدفع': 'Checkout & payment', 'تأكيد الطلب': 'Place order',
    'عنوان التوصيل': 'Delivery address', 'شحن سريع لباب بيتك في مصر': 'Fast delivery to your door', 'تحديد موقعك بدقة على الخريطة': 'Pin your location on the map',
    'ضع دبوساً على موقع بيتك ليتم ملء المحافظة، الحي، والشارع تلقائياً': 'Drop a pin on your home to fill governorate, area and street automatically',
    'فتح الخريطة التفاعلية 🗺️': 'Open the map 🗺️', 'اختر من عناوينك المسجلة:': 'Choose a saved address:', 'اسم المستلم بالكامل *': 'Recipient full name *',
    'رقم الهاتف الأساسي للتواصل *': 'Phone number *', 'المحافظة (مصر) *': 'Governorate *', 'المدينة / الحي / المركز *': 'City / area *', 'اسم الشارع': 'Street',
    'رقم العمارة والشقة': 'Building & apartment', 'ملاحظات التوصيل لمندوب الشحن (اختياري)': 'Notes for the courier (optional)', 'طريقة الدفع': 'Payment method',
    'الدفع عند الاستلام (كاش)': 'Cash on delivery', 'ادفع نقداً لمندوب التوصيل عند استلام طلبك': 'Pay the courier in cash when you receive your order',
    'الدفع بالبطاقة البنكية أو المحافظ الإلكترونية': 'Card or mobile wallet', 'غير متاح التوصيل لهذه المحافظة': 'No delivery to this governorate',
    'نقاط الولاء (Suki Points)': 'Loyalty points', 'استبدال النقاط بخصم مباشر في هذا الطلب': 'Use my points as a discount on this order',
    'كود الخصم (الكوبون):': 'Discount code:', 'معطل لاستخدامك نقاط الولاء': 'Disabled while using loyalty points', 'الإجمالي النهائي للدفع:': 'Total to pay:',
    'استبدال خلال 14 يوم لعيوب الصناعة (الشحن علينا)': '14-day exchange for manufacturing defects (free shipping)', 'جاري التحديد...': 'Locating...',
    'تم التحديد بنجاح': 'Location found', 'تحديد موقعي الآن': 'Locate me', 'تحديد عبر الـ GPS': 'Use GPS', 'الاسم ثلاثي': 'Full name',
    'مثال: مدينة نصر / الدقي / سموحة': 'e.g. Nasr City / Dokki', 'مثال: شارع مصطفى النحاس': 'e.g. Mostafa El-Nahas St.', 'مثال: عمارة 12 - الدور 3 - شقة 7': 'e.g. Bldg 12, floor 3, apt 7',
    'أي علامة مميزة بجوار المسكن أو مواعيد مفضلة للاستلام...': 'Any landmark or preferred delivery time...', 'أدخل الكود': 'Enter code',
    'لا يمكن استخدام الكوبون مع نقاط الولاء في نفس الطلب': 'A coupon can\'t be combined with loyalty points', 'يُرجى إكمال بيانات الاسم والهاتف والمدينة': 'Please fill in name, phone and city',
    'الشحن': 'Shipping', 'الخصم': 'Discount', 'رسوم الشحن والتوصيل:': 'Shipping:', 'الإجمالي:': 'Total:', 'المجموع:': 'Subtotal:',
    // ---- auth ----
    'البريد الإلكتروني *': 'Email *', 'ابعتلي الكود': 'Send me the code', 'رجوع لتسجيل الدخول': 'Back to log in', 'كود التحقق (6 أرقام) *': 'Verification code (6 digits) *',
    'كلمة المرور الجديدة *': 'New password *', '8 حروف على الأقل، فيها حرف كبير وحرف صغير ورقم ورمز.': 'At least 8 characters with upper & lower case, a number and a symbol.',
    'غيّر كلمة المرور': 'Change password', 'ابعت كود تاني': 'Send another code', 'البريد الإلكتروني أو رقم الجوال *': 'Email or mobile number *', 'كلمة المرور *': 'Password *',
    'نسيت كلمة المرور؟': 'Forgot password?', 'أو الدخول السريع': 'or continue with', 'المتابعة باستخدام Google': 'Continue with Google', 'ليس لديك حساب بعد؟': 'No account yet?',
    'إنشاء حساب جديد الآن': 'Create one now', 'الاسم الكامل *': 'Full name *', 'إرسال كود التأكيد': 'Send confirmation code',
    'سيتم إرسال رمز تحقق مكون من 6 أرقام إلى هذا البريد للتأكيد': 'We\'ll send a 6-digit code to this email', 'كود التحقق المرسل لبريدك الإلكتروني (6 أرقام) *': 'Code sent to your email (6 digits) *',
    'إعادة الإرسال': 'Resend', 'تفقد صندوق الوارد أو مجلد الرسائل الترويجية/غير المرغوب فيها (Spam)': 'Check your inbox or spam folder', 'رقم الجوال (اختياري)': 'Mobile number (optional)',
    'كلمة المرور (6 خانات على الأقل) *': 'Password *', 'إنشاء الحساب وتأكيده': 'Create account', 'أو': 'or', 'التسجيل السريع بحساب Google': 'Sign up with Google',
    'لديك حساب بالفعل؟': 'Already have an account?', 'تأكيد البريد الإلكتروني بـ OTP': 'Confirm your email', 'تم إرسال كود تحقق مكون من 6 أرقام إلى:': 'A 6-digit code was sent to:',
    'تأكيد وتفعيل الحساب': 'Confirm account', 'إعادة إرسال الرمز': 'Resend code', 'تعديل البيانات': 'Edit details', 'المصادقة الثنائية (2FA)': 'Two-factor authentication',
    'تأكيد ومتابعة الدخول': 'Confirm & continue', 'العودة لتسجيل الدخول': 'Back to log in', 'تصفح المتجر': 'Browse the store', 'مثال: أحمد مصطفى': 'e.g. Ahmed Mostafa',
    'user@example.com أو 01012345678': 'user@example.com or 01012345678', 'جاري تسجيل الدخول بحساب Google...': 'Signing in with Google...',
    'يرجى كتابة بريد إلكتروني صحيح أولاً': 'Please enter a valid email first', 'يرجى ملء كافة الحقول المطلوبة': 'Please fill in all required fields',
    'جاري توجيهك إلى تسجيل الدخول عبر Google...': 'Redirecting to Google...', 'يرجى إدخال رمز التحقق': 'Please enter the code', 'تم تسجيل الخروج بنجاح': 'Logged out',
    'انتهت جلسة تسجيل الدخول، يُرجى تسجيل الدخول مجدداً': 'Your session expired, please log in again',
    // ---- orders ----
    'عرض سجل طلباتك': 'Your order history', 'الرجوع للرئيسية': 'Back to home', 'جاري جلب قائمة طلباتك...': 'Loading your orders...',
    'تتبع مسار شحناتك وتفاصيل كل طلب بسهولة': 'Track your shipments and order details', 'متابعة طلبات الاستبدال': 'Exchange requests', 'تسوق المزيد': 'Shop more',
    'ليس لديك أي طلبات سابقة': 'You have no orders yet', 'ابدأ بالتسوق الآن واستمتع بأقوى العروض الحصرية!': 'Start shopping and enjoy our best offers!', 'تصفح المنتجات': 'Browse products',
    'رقم الطلب:': 'Order no.:', 'طلب استبدال (عيب صناعة)': 'Request an exchange (defect)', 'عرض التفاصيل والتتبع': 'Details & tracking', 'طريقة الدفع:': 'Payment:',
    'سبب الإلغاء (اختياري):': 'Reason (optional):', '— اختار —': '— choose —', 'غيّرت رأيي': 'I changed my mind', 'طلبت بالغلط / عايز أعدّل الطلب': 'Ordered by mistake / want to change it',
    'لقيت سعر أحسن': 'Found a better price', 'التوصيل هيتأخر عليّا': 'Delivery is too late for me', 'سبب تاني': 'Other reason', 'تأكيد إلغاء الطلب': 'Confirm cancellation',
    'جاري جلب تفاصيل الطلب...': 'Loading order...', 'الطلب غير موجود': 'Order not found', 'إلغاء الطلب': 'Cancel order', 'طباعة الفاتورة': 'Print invoice',
    'العودة لطلباتي': 'Back to my orders', 'مسار تتبع الطلب والشحنة': 'Order tracking', 'سجل تحديثات الطلب': 'Order updates', 'عنوان الشحن والاستلام': 'Shipping address',
    'المستلم:': 'Recipient:', 'رقم الجوال:': 'Mobile:', 'المدينة / المحافظة:': 'City / governorate:', 'الشارع والمبنى:': 'Street & building:', 'ملاحظات التوصيل:': 'Delivery notes:',
    'ملخص الفاتورة': 'Invoice summary', 'مدفوع': 'Paid', 'بانتظار التحصيل': 'Awaiting payment',
    'قيد المراجعة': 'Pending', 'تم التأكيد': 'Confirmed', 'جاري التجهيز': 'Processing', 'تم الشحن': 'Shipped', 'تم التوصيل': 'Delivered', 'ملغي': 'Cancelled',
    // ---- profile ----
    'إدارة حسابك الشخصي': 'Manage your account', 'جاري تحميل بيانات الحساب...': 'Loading your account...', 'كلمة المرور': 'Password', 'خروج من كل الأجهزة': 'Log out everywhere',
    'إجمالي الطلبات': 'Total orders', 'طلبات جارية وقيد الشحن': 'Active orders', 'إجمالي المشتريات': 'Total spent', 'إضافة عنوان': 'Add address',
    'لم تقم بحفظ أي عناوين بعد. أضف عنوانك لتسريع إتمام الطلبات.': 'No saved addresses yet. Add one for faster checkout.', 'الافتراضي': 'Default',
    'تعيين كافتراضي': 'Set as default', 'تعديل': 'Edit', 'إعدادات وروابط الحساب': 'Account settings', 'تبديل الحساب': 'Switch account', 'أحدث الطلبات': 'Recent orders',
    'لا توجد أي طلبات مسجلة باسمك بعد.': 'No orders yet.', 'حفظ التغييرات': 'Save changes', 'تسمية العنوان *': 'Address label *', 'اسم المستلم *': 'Recipient name *',
    'رقم الهاتف *': 'Phone *', 'المحافظة *': 'Governorate *', 'المدينة / المركز *': 'City *', 'المبنى والشقة': 'Building & apartment', 'ملاحظات التوصيل': 'Delivery notes',
    'تعيين كعنوان افتراضي للتوصيل': 'Set as my default address', 'إضافة العنوان': 'Add address', 'حفظ التعديلات': 'Save', 'كلمة المرور الحالية *': 'Current password *',
    'تحديث كلمة المرور': 'Update password', 'تعديل صورتك الشخصية': 'Change your photo', 'رقم الهاتف الأساسي': 'Phone number', 'رقم هاتف إضافي (اختياري)': 'Extra phone (optional)',
    'رقم واتساب (اختياري)': 'WhatsApp (optional)', 'فتح الخريطة 🗺️': 'Open map 🗺️',
    // ---- wishlist ----
    'قائمة أمنياتك فارغة': 'Your wishlist is empty', 'تصفح أقسام المتجر واضغط على رمز القلب لحفظ المنتجات في قائمتك المفضلة': 'Tap the heart on any product to save it here',
    'جاري تحميل قائمة الأمنيات...': 'Loading wishlist...', 'قائمة الأمنيات فارغة حالياً': 'Your wishlist is empty', 'نقل إلى السلة': 'Move to cart',
    'إزالة من المفضلة': 'Remove from wishlist', 'تمت إزالة المنتج من قائمة أمنياتك': 'Removed from your wishlist', 'قائمة أمنياتي': 'My wishlist',
    // ---- support ----
    'خدمة العملاء': 'Customer service', 'نحن هنا لمساعدتك دائماً': 'We\'re always here to help', 'واتساب مباشر': 'WhatsApp', 'أسرع وسيلة للتواصل مع خدمة العملاء': 'The fastest way to reach us',
    'الخط الساخن': 'Hotline', 'اتصل بينا مباشرة': 'Call us directly', 'البريد الإلكتروني': 'Email', 'للشكاوى والمقترحات والتعاون التجاري': 'Complaints, suggestions and business',
    'أرسل لنا رسالة مباشرة': 'Send us a message', 'الاسم بالكامل *': 'Full name *', 'رقم الجوال للتواصل *': 'Mobile number *', 'موضوع الرسالة *': 'Subject *',
    'استفسار عن طلب قائم': 'About an existing order', 'استفسار عن مواصفات منتج': 'About a product', 'طلب استبدال': 'Exchange request', 'اقتراح أو شكوى للإدارة': 'Suggestion or complaint',
    'استفسار عام': 'General question', 'نص الرسالة أو الاستفسار *': 'Your message *', 'إرسال الرسالة': 'Send message', 'الأسئلة الأكثر شيوعاً': 'Frequently asked questions',
    'كم يستغرق توصيل الطلب؟': 'How long does delivery take?', 'إزاي أتابع طلبي؟': 'How do I track my order?', 'ما هي سياسة الاستبدال؟': 'What is the exchange policy?',
    'كيف أستخدم كود الخصم (الكوبون)؟': 'How do I use a discount code?', 'رسائلي وردود خدمة العملاء': 'My messages & replies', 'اكتب تفاصيل استفسارك أو رقم الطلب هنا...': 'Write your question or order number here...',
    // ---- returns ----
    'تسجيل الدخول مطلوب': 'Login required', 'يُرجى تسجيل الدخول إلى حسابك لعرض وتتبع طلبات الاستبدال والضمان': 'Please log in to see your exchange requests', 'تسجيل الدخول الآن': 'Log in now',
    'ضمان استبدال 14 يوم (عيب صناعة فقط) — الاستبدال مجاناً': '14-day exchange (manufacturing defects only) — free', 'طلبات الاستبدال وتتبع الضمان': 'Exchange requests',
    'لا توجد طلبات استبدال حالياً': 'No exchange requests', 'الذهاب إلى قائمة طلباتي': 'Go to my orders', 'إرسال طلب الاستبدال الآن 🚀': 'Send exchange request 🚀',
    // ---- location ----
    'محافظات مصر (27 محافظة):': 'Egypt governorates:', 'عناوينك المحفوظة:': 'Your saved addresses:', 'خاصية تحديد الموقع غير مدعومة في متصفحك': 'Your browser doesn\'t support location',
    'يرجى السماح بصلاحية الموقع لكشف محافظتك تلقائياً': 'Please allow location access', 'حدد موقعي تلقائياً': 'Locate me automatically', 'تأكيد الموقع': 'Confirm location',
    'اسحب الخريطة أو الدبوس لضبط مكانك بالظبط': 'Drag the map or the pin to your exact spot', 'عنوان التوصيل على الخريطة': 'Delivery location on the map',
    'المحافظة': 'Governorate', 'المنطقة': 'Area', 'الشارع': 'Street', 'جاري تحديد العنوان...': 'Finding the address...', 'أو اختار المحافظة يدوياً:': 'Or choose your governorate:',
    'حدد مكاني على الخريطة': 'Pin my location on the map', 'اسحب الدبوس أو اضغط على مكانك بالظبط': 'Drag the pin or tap your exact spot',
    'ابحث عن منطقة أو شارع (مثال: المعادي، سموحة...)': 'Search an area or street (e.g. Maadi, Smouha...)', 'جاري التحديد...': 'Locating...',
    'عنوان التوصيل على الخريطة': 'Delivery location on the map', 'مفيش نتايج في مصر بالاسم ده': 'No results in Egypt',
    'مش قادرين نحدد المحافظة من النقطة دي. قرّب الخريطة على مكانك أو اختار المحافظة من القائمة.': 'We couldn\'t read the governorate here. Zoom in on your spot or pick it from the list.',
    'حدد مكانك على الخريطة الأول (المحافظة لسه مش واضحة)': 'Pick your spot on the map first',
    'الموقع تقريبي، اسحب الدبوس لمكانك بالظبط': 'Location is approximate, drag the pin to your exact spot',
    'القاهرة': 'Cairo', 'الجيزة': 'Giza', 'الإسكندرية': 'Alexandria', 'الدقهلية': 'Dakahlia', 'البحر الأحمر': 'Red Sea', 'البحيرة': 'Beheira',
    'الفيوم': 'Faiyum', 'الغربية': 'Gharbia', 'الإسماعيلية': 'Ismailia', 'المنوفية': 'Monufia', 'المنيا': 'Minya', 'القليوبية': 'Qalyubia',
    'الوادي الجديد': 'New Valley', 'السويس': 'Suez', 'أسوان': 'Aswan', 'أسيوط': 'Asyut', 'بني سويف': 'Beni Suef', 'بورسعيد': 'Port Said',
    'دمياط': 'Damietta', 'الشرقية': 'Sharqia', 'جنوب سيناء': 'South Sinai', 'كفر الشيخ': 'Kafr El Sheikh', 'مطروح': 'Matrouh',
    'الأقصر': 'Luxor', 'قنا': 'Qena', 'شمال سيناء': 'North Sinai', 'سوهاج': 'Sohag',
    // ---- showcases ----
    'تسوّق الآن': 'Shop now', 'تسوّق حسب المتجر': 'Shop by store', 'اختار المتجر أو القسم اللي يناسبك': 'Pick the store or category you like',
    'لسه مفيش منتجات هنا': 'No products here yet', 'ارجع قريب، هتلاقي منتجات جديدة.': 'Check back soon for new products.',
    'الصفحة دي مش متاحة دلوقتي': 'This page is not available right now', 'تعذّر تحميل المنتجات': 'Could not load products',
    // ---- maintenance / misc ----
    'الموقع تحت الصيانة مؤقتاً': 'The store is under maintenance', 'تواصل معنا على واتساب': 'Contact us on WhatsApp', 'نعم، تأكيد التنفيذ': 'Yes, confirm',
    'تعذر تحميل الصفحة': 'Could not load the page', 'سوقك العربي الأول في مكان واحد': 'Your first Arab market, all in one place', 'تخطي والبدء': 'Skip', 'حفظ': 'Save', 'رجوع': 'Back', 'نعم': 'Yes', 'لا': 'No',
    'كلمنا من المحادثة المباشرة (زر الشات تحت) أو ابعتلنا رسالة من الفورم.': 'Reach us through live chat (chat button below) or send us a message with the form.'
  },

  // pieces replaced inside longer texts ("1,250 ج.م" → "1,250 EGP")
  PARTS: [[/ج\.م/g, 'EGP'], [/^منذ (\d+) دقيقة$/, '$1 min ago'], [/^منذ (\d+) ساعة$/, '$1 h ago'], [/^منذ (\d+) يوم$/, '$1 d ago'],
    [/^(\d+) جديد$/, '$1 new'], [/^قائمة أمنياتي \((\d+)\)$/, 'My wishlist ($1)']],

  t(text) {
    if (this.lang !== 'en' || text === undefined || text === null) return text;
    const raw = String(text);
    const key = raw.replace(/\s+/g, ' ').trim();
    if (!key || !/[؀-ۿ]/.test(key)) return raw;
    const hit = this.DICT[key];
    if (hit !== undefined) return raw.replace(raw.trim(), hit);
    let out = key;
    for (const [re, rep] of this.PARTS) out = out.replace(re, rep);
    return out === key ? raw : raw.replace(raw.trim(), out);
  },

  isAdminView() { return /^#\/admin/.test(location.hash || ''); },

  translateTree(root) {
    if (this.lang !== 'en' || this.isAdminView() || !root) return;
    const skip = el => el && el.closest && el.closest('[data-no-i18n], script, style, textarea, code, #admin-root, .admin-layout');
    if (root.nodeType === 3) { if (!skip(root.parentElement)) { const v = this.t(root.nodeValue); if (v !== root.nodeValue) root.nodeValue = v; } return; }
    if (root.nodeType !== 1 || skip(root)) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    let n;
    while ((n = walker.nextNode())) {
      if (!/[؀-ۿ]/.test(n.nodeValue) || skip(n.parentElement)) continue;
      const v = this.t(n.nodeValue);
      if (v !== n.nodeValue) n.nodeValue = v;
    }
    const els = root.querySelectorAll ? [root, ...root.querySelectorAll('[placeholder],[title],[aria-label],[alt]')] : [];
    els.forEach(el => {
      if (!el.getAttribute || skip(el)) return;
      ['placeholder', 'title', 'aria-label', 'alt'].forEach(a => {
        const v = el.getAttribute(a);
        if (v && /[؀-ۿ]/.test(v)) { const tv = this.t(v); if (tv !== v) el.setAttribute(a, tv); }
      });
    });
  },

  applyDirection() {
    const en = this.lang === 'en' && !this.isAdminView();
    document.documentElement.lang = en ? 'en' : 'ar';
    document.documentElement.dir = en ? 'ltr' : 'rtl';
  },

  init() {
    this.applyDirection();
    window.addEventListener('hashchange', () => this.applyDirection());
    if (this.lang !== 'en') return;
    const start = () => {
      this.translateTree(document.body);
      new MutationObserver(muts => {
        if (this.isAdminView()) return;
        for (const m of muts) {
          if (m.type === 'characterData') this.translateTree(m.target);
          else m.addedNodes.forEach(node => this.translateTree(node));
        }
      }).observe(document.body, { childList: true, subtree: true, characterData: true });
      // (toasts are added to the page too, so the observer translates them as well)
    };
    if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);
  },

  toggle() {
    try { localStorage.setItem('suki_lang', this.lang === 'en' ? 'ar' : 'en'); } catch (e) { /* private mode */ }
    location.reload();
  }
};

I18n.init();
