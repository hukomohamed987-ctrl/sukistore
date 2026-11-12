require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const cookieParser = require('cookie-parser');
const seedData = require('./database/seed');
const initEnhancements = require('./database/initEnhancements');
const { resetAllFailedAttempts } = require('./utils/security');
const { numeralsMiddleware } = require('./utils/normalizeNumerals');
const helmet = require('helmet');
const compression = require('compression');
const { ensureTailwindBuilt, renderIndexHtml } = require('./utils/assets');
const { authLimiter, apiLimiter, checkoutLimiter, inputSanitizer, csrfProtection } = require('./middleware/security');

const app = express();
const PORT = process.env.PORT || 3000;
app.disable('x-powered-by');

// SECURITY: only trust X-Forwarded-For from known proxies. Default trusts a proxy
// on the same machine / private network (cPanel, Apache, Nginx). Behind Cloudflare
// set TRUST_PROXY=1 (or the number of proxy hops) in .env.
const trustProxyEnv = (process.env.TRUST_PROXY || 'loopback, linklocal, uniquelocal').trim();
app.set('trust proxy', /^\d+$/.test(trustProxyEnv) ? Number(trustProxyEnv) : (trustProxyEnv === 'true' ? true : trustProxyEnv));

// SECURITY headers (CSP left off for now because the storefront loads Tailwind,
// fonts and Google scripts from CDNs; everything else is on)
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' } // Google sign-in popup
}));

// SECURITY: CORS only for our own site(s). Same-origin requests have no Origin
// header issue; list extra frontends in ALLOWED_ORIGINS (comma-separated).
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',').map(s => s.trim().replace(/\/$/, '')).filter(Boolean);
app.use(cors({
  credentials: true,
  origin: (origin, cb) => {
    if (!origin) return cb(null, true); // same-origin, curl, mobile app
    const clean = origin.replace(/\/$/, '');
    const isLocalDev = process.env.NODE_ENV !== 'production' && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(clean);
    if (isLocalDev || allowedOrigins.includes(clean)) return cb(null, true);
    return cb(null, false); // browser blocks the cross-site response
  }
}));

// SPEED: gzip every text response (HTML, JS, CSS, JSON) — about 70-80% smaller on mobile data
app.use(compression({ threshold: 1024 }));

// Body parsers & Cookie parser
app.use(cookieParser());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
// Universal Arabic & English Numeral Normalizer middleware (converts ٠-٩ to 0-9 smoothly)
app.use(numeralsMiddleware);

// SECURITY: rate limits + input cleaning + cross-site request checks for the API
app.use('/api', apiLimiter);
app.use(['/api/auth/login', '/api/auth/register', '/api/auth/send-email-otp', '/api/auth/verify-email-otp',
  '/api/auth/send-otp', '/api/auth/verify-otp', '/api/auth/2fa/verify', '/api/auth/google'], authLimiter);
app.post('/api/orders', checkoutLimiter);
app.use('/api', inputSanitizer);
app.use('/api', csrfProtection);

// Static files & upload directory (dotfiles are never served)
app.use('/uploads', express.static(path.join(__dirname, 'public', 'uploads'), {
  dotfiles: 'ignore',
  maxAge: '7d',
  immutable: true,
  setHeaders: (res) => {
    // SECURITY: uploaded files can never run as a page/script on our domain
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self' data:; media-src 'self'; style-src 'unsafe-inline'; sandbox");
  }
}));
// The raw template must never be served as-is (it has no asset versions)
app.get('/index.html', (req, res) => res.redirect(301, '/'));
app.use(express.static(path.join(__dirname, 'public'), {
  dotfiles: 'ignore',
  index: false, // "/" is served by the SPA handler below (with versioned asset links)
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('service-worker.js')) {
      res.setHeader('Service-Worker-Allowed', '/');
      res.setHeader('Content-Type', 'application/javascript');
      res.setHeader('Cache-Control', 'no-cache');
      return;
    }
    if (filePath.endsWith('manifest.json')) {
      res.setHeader('Content-Type', 'application/manifest+json; charset=utf-8');
    }
    if (/\.(png|jpe?g|gif|svg|webp|ico|woff2?|ttf|eot)$/i.test(filePath)) {
      res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
    } else if (/\.(js|css)$/.test(filePath)) {
      // SPEED: files linked as "?v=<content hash>" never change at that URL → cache for a year.
      // Without a version: the browser re-checks (cheap 304) so updates still show at once.
      const versioned = res.req && res.req.query && res.req.query.v;
      res.setHeader('Cache-Control', versioned ? 'public, max-age=31536000, immutable' : 'no-cache');
    } else if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache');
    }
  }
}));

// PUBLIC DEMO SAFETY: read-only storefront. No login, admin, checkout, uploads, or mutations.
// The demo database is temporary and contains only seeded showcase data.
if (process.env.DEMO_READ_ONLY === 'true') {
  app.use('/api', (req, res, next) => {
    const blockedArea = req.path.startsWith('/auth') || req.path.startsWith('/admin');
    const readMethod = ['GET', 'HEAD', 'OPTIONS'].includes(req.method);
    if (blockedArea || !readMethod) {
      return res.status(403).json({
        success: false,
        message: 'هذه نسخة عرض فقط، والعمليات غير متاحة حالياً.'
      });
    }
    next();
  });
}

// Mount API Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/products', require('./routes/products'));
app.use('/api/categories', require('./routes/categories'));
app.use('/api/cart', require('./routes/cart'));
app.use('/api/orders', require('./routes/orders'));
app.use('/api/coupons', require('./routes/coupons'));
app.use('/api/banners', require('./routes/banners'));
app.use('/api/reviews', require('./routes/reviews'));
app.use('/api/support', require('./routes/support'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/upload', require('./routes/upload'));
app.use('/api/brands', require('./routes/brands'));
app.use('/api/chat', require('./routes/chat'));
app.use('/api/wishlist', require('./routes/wishlist'));
app.use('/api/push', require('./routes/push'));
app.use('/api/returns', require('./routes/returns'));
app.use('/api/merchants', require('./routes/merchants'));
app.use('/api/investors', require('./routes/investors'));
app.use('/api/accounting', require('./routes/accounting'));
app.use('/api/exports', require('./routes/exports'));
app.use('/api/employees', require('./routes/employees'));
app.use('/api/pages', require('./routes/pages'));
app.use('/api/showcases', require('./routes/showcases'));

// Health check endpoint with security summary
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    store: 'سوقي ستور (Suki Store)',
    version: '1.0.0',
    time: new Date().toISOString()
  });
});

// Single Page Application: index.html with every local script / stylesheet stamped "?v=<hash>"
app.use((req, res, next) => {
  if (req.method === 'GET' && !req.path.startsWith('/api/')) {
    const html = renderIndexHtml();
    if (html) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache');
      return res.status(200).send(html);
    }
    return res.status(500).send('Error loading frontend');
  }
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ success: false, message: 'المسار البرمجي غير موجود' });
  }
  next();
});

// Production-ready Error handling middleware (hides stack traces in production)
app.use((err, req, res, next) => {
  console.error('Server Error:', err.message || err);
  const isProd = process.env.NODE_ENV === 'production';
  const statusCode = err.status || (err.message && err.message.includes('CORS') ? 403 : 500);

  res.status(statusCode).json({
    success: false,
    message: isProd && statusCode === 500
      ? 'حدث خطأ في معالجة طلبك، يُرجى المحاولة لاحقاً.'
      : (err.message || 'حدث خطأ غير متوقع في الخادم')
  });
});

// Start server
async function start() {
  try {
    resetAllFailedAttempts();
    // SPEED: rebuild the Tailwind CSS file if any page / script changed since the last build
    ensureTailwindBuilt();
    await seedData();
    await initEnhancements();
    // Month closing on a chosen day (if the owner switched it on in the accounting page)
    const { autoClosePeriods } = require('./routes/accounting');
    autoClosePeriods();
    setInterval(autoClosePeriods, 60 * 60 * 1000).unref();
    // Automatic copies of the SQLite file (only when DB_DRIVER=sqlite)
    require('./utils/sqliteBackup').startAutoBackups();
    app.listen(PORT, () => {
      console.log(`\n======================================================`);
      console.log(`🚀 متجر "سوقي ستور" (Suki Store) يعمل الآن بنجاح مع طبقات الحماية الشاملة!`);
      console.log(`🌐 الرابط المحلي: http://localhost:${PORT}`);
      console.log(`🛡️ لوحة التحكم: http://localhost:${PORT}/#/admin`);
      console.log(`🔒 ميزات الأمان مفعلة: Helmet | RateLimit | BruteForce | 2FA | HttpOnly | Sanitization`);
      console.log(`======================================================\n`);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
  }
}

start();
