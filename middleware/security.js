const { getClientIp, recordAuditLog } = require('../utils/security');

// ============================================================================
// 1. RATE LIMITING MIDDLEWARE (SLIDING WINDOW)
// ============================================================================
function createRateLimiter({ windowMs = 60 * 1000, max = 30, message = 'تم تجاوز الحد المسموح من الطلبات. يُرجى الانتظار قليلاً.' }) {
  const requests = new Map();

  // Cleanup old records periodically
  setInterval(() => {
    const now = Date.now();
    for (const [key, record] of requests.entries()) {
      if (now - record.resetTime > windowMs) {
        requests.delete(key);
      }
    }
  }, Math.max(windowMs, 60000));

  return (req, res, next) => {
    const ip = getClientIp(req);
    const now = Date.now();
    const record = requests.get(ip) || { count: 0, resetTime: now + windowMs };

    if (now > record.resetTime) {
      record.count = 1;
      record.resetTime = now + windowMs;
    } else {
      record.count += 1;
    }

    requests.set(ip, record);

    const remaining = Math.max(0, max - record.count);
    const resetSeconds = Math.ceil((record.resetTime - now) / 1000);

    res.setHeader('RateLimit-Limit', max);
    res.setHeader('RateLimit-Remaining', remaining);
    res.setHeader('RateLimit-Reset', resetSeconds);

    if (record.count > max) {
      res.setHeader('Retry-After', resetSeconds);
      return res.status(429).json({
        success: false,
        message,
        retryAfterSeconds: resetSeconds
      });
    }

    next();
  };
}

// Preconfigured Rate Limiters (Balanced for high performance and attack protection)
const isDev = process.env.NODE_ENV !== 'production';

const authLimiter = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  max: isDev ? 300 : 100, // 100 requests per minute on login/register/otp
  message: 'تم تجاوز الحد المسموح لمحاولات تسجيل الدخول والتحقق. يُرجى الانتظار دقيقة واحدة.'
});

const apiLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: isDev ? 6000 : 3000, // 3000 requests per 15 minutes (plenty for store browsing & search)
  message: 'تم تجاوز عدد الطلبات المسموح بها لهذا العنوان. يُرجى الانتظار قليلاً.'
});

const checkoutLimiter = createRateLimiter({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: isDev ? 120 : 60,
  message: 'تم تجاوز الحد الأقصى لإنشاء الطلبات وعمليات الدفع مؤقتاً.'
});

// ============================================================================
// 2. INPUT SANITIZATION (PREVENT XSS & INJECTION)
// ============================================================================
const DANGEROUS_PATTERNS = [
  /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
  /<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi,
  /javascript:[^'"]*/gi,
  /on\w+\s*=\s*["'][^"']*["']/gi,
  /data:text\/html/gi,
  /vbscript:/gi
];

function sanitizeString(str) {
  if (typeof str !== 'string') return str;
  let clean = str;
  for (const pattern of DANGEROUS_PATTERNS) {
    clean = clean.replace(pattern, '');
  }
  // Remove dangerous HTML tags while keeping Arabic & normal text
  clean = clean
    .replace(/<script.*?>.*?<\/script>/gi, '')
    .replace(/<[\/\s]*(applet|embed|object|frameset|frame|iframe|meta|link)[\s\S]*?>/gi, '');

  return clean;
}

function sanitizeObject(obj) {
  if (!obj || typeof obj !== 'object') {
    return typeof obj === 'string' ? sanitizeString(obj) : obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeObject(item));
  }

  const cleanObj = {};
  for (const [key, value] of Object.entries(obj)) {
    // Prevent Prototype Pollution & MongoDB/NoSQL Operator injection
    if (key.startsWith('$') || key === '__proto__' || key === 'constructor' || key === 'prototype') {
      continue;
    }
    cleanObj[key] = sanitizeObject(value);
  }
  return cleanObj;
}

function inputSanitizer(req, res, next) {
  // Express 5: req.query / req.params are read-only getters, so only the body is
  // rewritten here (that is what gets stored in the database).
  if (req.body && typeof req.body === 'object') req.body = sanitizeObject(req.body);
  next();
}

// ============================================================================
// 3. SENSITIVE FILES & PATH TRAVERSAL PROTECTION
// ============================================================================
const BLOCKED_EXTENSIONS = ['.env', '.json', '.git', '.sql', '.tmp', '.log', '.bak', '.pem', '.key', '.md'];
const BLOCKED_PATHS = ['/database/data', '/node_modules', '/package.json', '/package-lock.json'];

function protectSensitiveFiles(req, res, next) {
  const rawUrl = (req.originalUrl || req.url || '').toLowerCase();
  const urlPath = decodeURIComponent(req.path || '').toLowerCase();

  // Directory traversal check
  if (urlPath.includes('..') || rawUrl.includes('..') || urlPath.includes('//') || rawUrl.includes('//')) {
    return res.status(403).json({ success: false, message: 'مسار غير مصرح به (Path Traversal Blocked)' });
  }

  // Block root server script access
  if (urlPath.endsWith('.js') && !urlPath.startsWith('/js/')) {
    return res.status(403).json({ success: false, message: 'الوصول المباشر لملفات الكود محظور أمنياً' });
  }

  // Blocked directories
  for (const blocked of BLOCKED_PATHS) {
    if (urlPath.startsWith(blocked.toLowerCase()) || rawUrl.startsWith(blocked.toLowerCase())) {
      return res.status(403).json({ success: false, message: 'الوصول المباشر لهذا المجلد محظور أمنياً' });
    }
  }

  // Block sensitive extensions in URL (except legit API endpoints)
  if (!urlPath.startsWith('/api/')) {
    for (const ext of BLOCKED_EXTENSIONS) {
      if (urlPath.endsWith(ext) || urlPath.includes(`${ext}/`) || rawUrl.includes(ext)) {
        return res.status(403).json({ success: false, message: 'محاولة الوصول لملف حساس محظورة' });
      }
    }
  }

  next();
}

// ============================================================================
// 4. FORCE HTTPS
// ============================================================================
function forceHttps(req, res, next) {
  const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
  const shouldForce = process.env.FORCE_HTTPS === 'true';

  if (shouldForce && !isHttps && req.headers.host) {
    return res.redirect(301, `https://${req.headers.host}${req.url}`);
  }
  next();
}

// ============================================================================
// 5. SUPER ADMIN IP RESTRICTION
// ============================================================================
function checkSuperAdminIp(req, res, next) {
  const allowedIpsStr = process.env.SUPER_ADMIN_ALLOWED_IPS || '';
  if (!allowedIpsStr.trim()) {
    // If not configured, allow access
    return next();
  }

  const allowedIps = allowedIpsStr
    .split(',')
    .map(ip => ip.trim())
    .filter(Boolean);

  const clientIp = getClientIp(req);
  const isAllowed = allowedIps.some(ip => {
    return ip === clientIp || ip === '*' || (ip === '127.0.0.1' && (clientIp === '::1' || clientIp === '127.0.0.1'));
  });

  if (!isAllowed) {
    recordAuditLog({
      req,
      user: req.user,
      action: 'BLOCKED_SUPER_ADMIN_IP',
      targetModule: 'admin',
      details: `محاولة دخول للوحة الإدارة من IP غير مصرح به: [${clientIp}]`
    }).catch(() => {});

    return res.status(403).json({
      success: false,
      message: `غير مصرح بالدخول للوحة التحكم من هذا العنوان IP (${clientIp}). تم تقييد الإدارة لعناوين محددة.`
    });
  }

  next();
}

// ============================================================================
// 6. CSRF PROTECTION (FOR MUTATING API REQUESTS)
// ============================================================================
function csrfProtection(req, res, next) {
  const mutatingMethods = ['POST', 'PUT', 'DELETE', 'PATCH'];
  if (!mutatingMethods.includes(req.method)) {
    return next();
  }

  // Exempt essential public shopping and authentication routes
  const exemptPrefixes = [
    '/api/auth/login',
    '/api/auth/register',
    '/api/auth/send-otp',
    '/api/auth/2fa/verify',
    '/api/auth/google',
    '/api/auth/logout',
    '/api/cart',
    '/api/orders',
    '/api/wishlist',
    '/api/reviews',
    '/api/chat',
    '/api/support'
  ];

  const currentPath = req.originalUrl || req.url || '';
  if (exemptPrefixes.some(prefix => currentPath.startsWith(prefix))) {
    return next();
  }

  // Requests using Bearer tokens in Authorization header cannot be forged via cross-site forms
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
    return next();
  }

  // Check Origin and Referer for Cross-Site tampering
  const origin = req.headers['origin'];
  const host = req.headers['host'];
  const xForwardedHost = req.headers['x-forwarded-host'];

  if (origin) {
    try {
      const originHost = new URL(origin).host;
      const isLocal = origin.includes('localhost') || 
                      origin.includes('127.0.0.1') || 
                      origin.startsWith('http://192.168.') || 
                      origin.startsWith('http://10.');
      const isAllowedDomain = originHost === 'souqystore.com' || 
                              originHost === 'www.souqystore.com' ||
                              originHost === host ||
                              originHost === xForwardedHost ||
                              (xForwardedHost && xForwardedHost.includes(originHost));

      if (!isAllowedDomain && !isLocal) {
        return res.status(403).json({
          success: false,
          message: 'فشل التحقق من أمان المصدر (CSRF Protection Blocked)'
        });
      }
    } catch (e) {
      // If parsing fails, allow standard application flow
      return next();
    }
  }

  next();
}

module.exports = {
  authLimiter,
  apiLimiter,
  checkoutLimiter,
  inputSanitizer,
  protectSensitiveFiles,
  forceHttps,
  checkSuperAdminIp,
  csrfProtection
};
