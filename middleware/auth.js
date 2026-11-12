const jwt = require('jsonwebtoken');
const db = require('../database/db');
const {
  checkBruteForceLockout,
  recordFailedLoginAttempt,
  clearFailedLoginAttempts,
  resetAllFailedAttempts
} = require('../utils/security');

// SECURITY: never fall back to a secret that is written in the source code.
let JWT_SECRET = (process.env.JWT_SECRET || '').trim();
if (!JWT_SECRET || JWT_SECRET.length < 32) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET is missing or too short (min 32 chars). Set it in .env before starting in production.');
  }
  JWT_SECRET = require('crypto').randomBytes(48).toString('hex');
  console.warn('⚠️ JWT_SECRET not set: using a random temporary secret (all sessions reset on restart).');
}
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';
const JWT_ADMIN_EXPIRES_IN = process.env.JWT_ADMIN_EXPIRES_IN || '24h';

// Helper to set Cookie (Accepted universally on localhost and remote)
function setAuthCookie(res, token, req = null) {
  const maxAge = 30 * 24 * 60 * 60 * 1000;
  const isHttps = (req && (req.secure || req.headers['x-forwarded-proto'] === 'https')) || process.env.NODE_ENV === 'production';
  res.cookie('token', token, {
    httpOnly: true, // SECURITY: page scripts (and injected XSS) cannot read it
    sameSite: 'lax',
    secure: Boolean(isHttps),
    maxAge,
    path: '/'
  });
}

// Helper to clear Auth Cookie
function clearAuthCookie(res) {
  res.clearCookie('token', {
    httpOnly: true,
    sameSite: 'lax',
    path: '/'
  });
}

// SECURITY: tokens issued before a password change / "logout all devices" are rejected
function isTokenVersionValid(decoded, user) {
  const current = user.tokenVersion || 1;
  return (decoded.tokenVersion || 1) === current;
}

// Generate JWT token with tokenVersion for session revocation support
function generateToken(user) {
  const tokenVersion = user.tokenVersion || 1;
  const isPrivileged = user.role === 'super_admin' || user.role === 'staff' || user.role === 'accountant' || user.role === 'merchant' || user.role === 'investor';
  const expiresIn = isPrivileged ? JWT_ADMIN_EXPIRES_IN : JWT_EXPIRES_IN;

  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role,
      tokenVersion
    },
    JWT_SECRET,
    { expiresIn }
  );
}

// Generate Temporary Token for 2FA Verification (Valid for 5 minutes only)
function generate2FaTempToken(user) {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role,
      type: '2FA_TEMP'
    },
    JWT_SECRET,
    { expiresIn: '5m' }
  );
}

// Authenticate user middleware
async function authenticate(req, res, next) {
  try {
    let token = null;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    } else if (req.cookies && req.cookies.token) {
      token = req.cookies.token;
    }

    if (!token) {
      return res.status(401).json({ success: false, message: 'يجب تسجيل الدخول أولاً' });
    }

    const decoded = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });

    // Block temporary 2FA tokens from accessing protected routes
    if (decoded.type === '2FA_TEMP') {
      return res.status(401).json({ success: false, message: 'يجب إكمال التحقق بخطوتين (2FA) أولاً' });
    }

    const user = await db.users.getById(decoded.id);
    if (!user) {
      return res.status(401).json({ success: false, message: 'المستخدم غير موجود' });
    }

    if (!isTokenVersionValid(decoded, user)) {
      return res.status(401).json({ success: false, message: 'انتهت صلاحية الجلسة، يُرجى تسجيل الدخول مجدداً' });
    }

    if (user.isLocked) {
      return res.status(403).json({
        success: false,
        message: 'تم قفل هذا الحساب من قِبل الإدارة. يُرجى التواصل مع الدعم الفني.'
      });
    }

    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: 'جلسة الدخول غير صالحة أو منتهية' });
  }
}

// Optional authentication (for guests with cart)
async function optionalAuth(req, res, next) {
  try {
    let token = null;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    } else if (req.cookies && req.cookies.token) {
      token = req.cookies.token;
    }

    if (token) {
      const decoded = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
      if (decoded.type !== '2FA_TEMP') {
        const user = await db.users.getById(decoded.id);
        if (user && !user.isLocked && isTokenVersionValid(decoded, user)) {
          req.user = user;
        }
      }
    }
  } catch (err) {
    // Ignore invalid token in optional auth
  }
  next();
}

// Helper to identify Super Admin (Mohamed Hakim & Ahmed Gharib)
// SECURITY: decided ONLY by server-controlled fields. Never by name or email,
// because customers can change their own display name.
function isSuperAdmin(user) {
  if (!user) return false;
  return Boolean(
    user.role === 'super_admin' ||
    (user.isOwner === true && user.role !== 'customer') ||
    (user.isPartner === true && user.role !== 'customer')
  );
}

// The primary owner account (used for owner-only sections such as IP restriction)
function isPrimaryOwner(user) {
  if (!user || user.role !== 'super_admin') return false;
  return user.isOwner === true || user.email === 'admin@suki.store';
}

// Require Super Admin
function requireSuperAdmin(req, res, next) {
  if (!req.user || !isSuperAdmin(req.user)) {
    return res.status(403).json({ success: false, message: 'هذا الإجراء مخصص للمدير العام فقط (محمد حكيم وأحمد غريب)' });
  }
  next();
}

// Require Staff, Accountant, or Super Admin with specific permission
function requirePermission(permissionName) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'يجب تسجيل الدخول أولاً' });
    }

    // Super Admin & Admin have all general permissions
    if (isSuperAdmin(req.user) || req.user.role === 'admin') {
      return next();
    }

    // Accountant has accounting permissions
    if (req.user.role === 'accountant') {
      if (permissionName === 'canManageAccounting' || permissionName === 'canViewReports') {
        return next();
      }
    }

    // Merchant permissions (scoped to their products and orders)
    if (req.user.role === 'merchant') {
      if (req.user.isActive === false) {
        return res.status(403).json({ success: false, message: 'تم إيقاف حساب التاجر مؤقتاً' });
      }
      if (permissionName === 'canManageProducts' || permissionName === 'canManageOrders' || permissionName === 'canViewDashboard') {
        return next();
      }
      return res.status(403).json({
        success: false,
        message: 'غير مصرح للتاجر بالوصول إلى هذا القسم'
      });
    }

    // Investor permissions (scoped to their products & investor dashboard)
    if (req.user.role === 'investor') {
      if (req.user.isActive === false) {
        return res.status(403).json({ success: false, message: 'تم إيقاف حساب المستثمر مؤقتاً' });
      }
      if (permissionName === 'canManageProducts' || permissionName === 'canViewDashboard' || permissionName === 'canViewInvestorDashboard' || permissionName === 'canManageInvestors') {
        return next();
      }
      return res.status(403).json({
        success: false,
        message: 'غير مصرح للمستثمر بالوصول إلى هذا القسم'
      });
    }

    // Check staff permissions
    if (req.user.role === 'staff' || req.user.role === 'accountant') {
      if (!req.user.isActive) {
        return res.status(403).json({ success: false, message: 'حساب الموظف غير نشط' });
      }
      if (req.user.permissions && (
        req.user.permissions[permissionName] || 
        (permissionName === 'canManageMerchants' && req.user.permissions.canManageProducts) ||
        (permissionName === 'canManageInvestors' && (req.user.permissions.canManageInvestors || req.user.permissions.canManageProducts))
      )) {
        return next();
      }
      return res.status(403).json({
        success: false,
        message: `ليس لديك صلاحية للوصول إلى هذا القسم (${permissionName})`
      });
    }

    // Regular customers are blocked completely
    return res.status(403).json({ success: false, message: 'غير مصرح لك بالدخول إلى لوحة التحكم' });
  };
}

// Backward compatible aliases
const checkLoginLockout = checkBruteForceLockout;
const recordFailedLogin = recordFailedLoginAttempt;
const clearFailedLogins = clearFailedLoginAttempts;

module.exports = {
  JWT_SECRET,
  generateToken,
  generate2FaTempToken,
  setAuthCookie,
  clearAuthCookie,
  authenticate,
  optionalAuth,
  isSuperAdmin,
  isPrimaryOwner,
  requireSuperAdmin,
  requirePermission,
  checkBruteForceLockout,
  recordFailedLoginAttempt,
  clearFailedLoginAttempts,
  resetAllFailedAttempts,
  checkLoginLockout,
  recordFailedLogin,
  clearFailedLogins
};
