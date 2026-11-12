const crypto = require('crypto');
const db = require('../database/db');

// ============================================================================
// 1. PASSWORD STRENGTH VALIDATION
// ============================================================================
const COMMON_WEAK_PASSWORDS = new Set([
  '123456', '12345678', '123456789', 'password', '12345', 'qwerty', '1234567',
  'admin123', 'admin', 'password123', 'root', 'superadmin', '111111', '000000',
  'iloveyou', 'welcome', 'sukistore', 'suki123', 'pass1234', '123123', 'secret'
]);

function validatePasswordStrength(password) {
  if (!password || typeof password !== 'string') {
    return {
      isValid: false,
      message: 'كلمة المرور مطلوبة',
      score: 0
    };
  }

  const trimmed = password.trim();
  if (trimmed.length < 6) {
    return {
      isValid: false,
      message: 'كلمة المرور يجب أن تتكون من 6 أحرف أو أرقام على الأقل',
      score: 1
    };
  }

  return {
    isValid: true,
    message: 'كلمة المرور مقبولة وصالحة ✅',
    score: 3
  };
}

// ============================================================================
// 2. TWO-FACTOR AUTHENTICATION (TOTP - RFC 6238 & BACKUP CODES)
// ============================================================================
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Encode(buffer) {
  let bits = 0;
  let value = 0;
  let output = '';

  for (let i = 0; i < buffer.length; i++) {
    value = (value << 8) | buffer[i];
    bits += 8;

    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }

  return output;
}

function base32Decode(base32) {
  const clean = base32.toUpperCase().replace(/=+$/, '').replace(/\s+/g, '');
  let bits = 0;
  let value = 0;
  const bytes = [];

  for (let i = 0; i < clean.length; i++) {
    const val = BASE32_ALPHABET.indexOf(clean[i]);
    if (val === -1) continue;
    value = (value << 5) | val;
    bits += 5;

    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }

  return Buffer.from(bytes);
}

function generateTotpSecret(accountEmail, issuer = 'Suki Store') {
  // 20 random bytes for secret
  const buffer = crypto.randomBytes(20);
  const secret = base32Encode(buffer);

  // Generate 8 random recovery backup codes
  const backupCodes = [];
  for (let i = 0; i < 8; i++) {
    const code = crypto.randomBytes(4).toString('hex').toUpperCase();
    backupCodes.push(`${code.slice(0, 4)}-${code.slice(4)}`);
  }

  const encodedIssuer = encodeURIComponent(issuer);
  const encodedAccount = encodeURIComponent(accountEmail || 'admin');
  const otpauthUrl = `otpauth://totp/${encodedIssuer}:${encodedAccount}?secret=${secret}&issuer=${encodedIssuer}&algorithm=SHA1&digits=6&period=30`;

  return {
    secret,
    backupCodes,
    otpauthUrl
  };
}

function generateTotpCode(secret, timeStep = Math.floor(Date.now() / 1000 / 30)) {
  const key = base32Decode(secret);
  const timeBuffer = Buffer.alloc(8);
  timeBuffer.writeBigInt64BE(BigInt(timeStep));

  const hmac = crypto.createHmac('sha1', key);
  hmac.update(timeBuffer);
  const digest = hmac.digest();

  const offset = digest[digest.length - 1] & 0x0f;
  const binaryCode =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);

  const otp = binaryCode % 1000000;
  return otp.toString().padStart(6, '0');
}

function verifyTotpCode(secret, code, window = 1) {
  if (!secret || !code) return false;
  const cleanCode = String(code).trim().replace(/\s+/g, '');
  if (cleanCode.length !== 6) return false;

  const currentStep = Math.floor(Date.now() / 1000 / 30);
  for (let step = currentStep - window; step <= currentStep + window; step++) {
    const validOtp = generateTotpCode(secret, step);
    if (crypto.timingSafeEqual(Buffer.from(cleanCode), Buffer.from(validOtp))) {
      return true;
    }
  }
  return false;
}

// ============================================================================
// 3. BRUTE FORCE LOCKOUT TRACKER
// ============================================================================
const failedAttempts = new Map(); // key -> { count, lockedUntil, firstFailedAt }

const MAX_FAILED = parseInt(process.env.LOGIN_MAX_FAILED_ATTEMPTS, 10) || 5;
const LOCKOUT_MS = (parseInt(process.env.LOGIN_LOCKOUT_MINUTES, 10) || 15) * 60 * 1000;

// SECURITY: use Express's req.ip, which only honours X-Forwarded-For from proxies
// listed in the 'trust proxy' setting (see server.js / TRUST_PROXY). Reading the
// header directly would let anyone fake their IP to dodge lockouts and IP rules.
function getClientIp(req) {
  const ip = req.ip || req.socket?.remoteAddress || '127.0.0.1';
  return String(ip).replace(/^::ffff:/, '');
}

function getAttemptKey(identifier, ip) {
  return `${(identifier || 'unknown').toLowerCase().trim()}_${ip}`;
}

function checkBruteForceLockout(req, identifier) {
  const ip = getClientIp(req);
  const key = getAttemptKey(identifier, ip);
  const record = failedAttempts.get(key);

  if (!record) return { isLocked: false, remainingAttempts: MAX_FAILED };

  const now = Date.now();
  if (record.lockedUntil && record.lockedUntil > now) {
    const remainingSeconds = Math.ceil((record.lockedUntil - now) / 1000);
    const remainingMinutes = Math.ceil(remainingSeconds / 60);
    return {
      isLocked: true,
      remainingSeconds,
      remainingMinutes,
      message: `تم قفل الحساب مؤقتاً لحمايتك بعد ${MAX_FAILED} محاولات فاشلة. يُرجى الانتظار لمدة ${remainingMinutes} دقيقة قبل المحاولة مرة أخرى.`
    };
  }

  // If lockout expired, clear record
  if (record.lockedUntil && record.lockedUntil <= now) {
    failedAttempts.delete(key);
    return { isLocked: false, remainingAttempts: MAX_FAILED };
  }

  const remainingAttempts = Math.max(0, MAX_FAILED - record.count);
  return { isLocked: false, remainingAttempts };
}

function recordFailedLoginAttempt(req, identifier, reason = 'INVALID_PASSWORD') {
  const ip = getClientIp(req);
  const key = getAttemptKey(identifier, ip);
  const now = Date.now();
  const record = failedAttempts.get(key) || { count: 0, lockedUntil: null, firstFailedAt: now };

  record.count += 1;
  const isNowLocked = record.count >= MAX_FAILED;

  if (isNowLocked) {
    record.lockedUntil = now + LOCKOUT_MS;
  }
  failedAttempts.set(key, record);

  // Asynchronously record into db.login_logs
  recordLoginLog({
    req,
    email: identifier,
    status: 'FAILED',
    reason: isNowLocked ? 'ACCOUNT_LOCKED_BRUTE_FORCE' : reason
  }).catch(() => {});

  return {
    isLocked: isNowLocked,
    attemptsCount: record.count,
    remainingAttempts: Math.max(0, MAX_FAILED - record.count),
    lockoutDurationMinutes: Math.ceil(LOCKOUT_MS / 60000)
  };
}

function clearFailedLoginAttempts(req, identifier) {
  const cleanId = (identifier || '').toLowerCase().trim();
  if (req) {
    const ip = getClientIp(req);
    failedAttempts.delete(getAttemptKey(cleanId, ip));
  }
  // Clear any IPv4 / IPv6 variations for this identifier
  for (const key of failedAttempts.keys()) {
    if (key.startsWith(`${cleanId}_`)) {
      failedAttempts.delete(key);
    }
  }
}

function resetAllFailedAttempts() {
  failedAttempts.clear();
}

// ============================================================================
// 4. SECURITY LOGGING (LOGIN & AUDIT LOGS)
// ============================================================================
async function recordLoginLog({ req, email, userId = null, role = 'unknown', status = 'SUCCESS', reason = null }) {
  try {
    const ip = req ? getClientIp(req) : 'system';
    const userAgent = req ? (req.headers['user-agent'] || 'unknown') : 'system';

    return await db.login_logs.insert({
      email: (email || '').toLowerCase().trim(),
      userId,
      role,
      status, // 'SUCCESS' | 'FAILED'
      reason, // 'INVALID_PASSWORD', 'LOCKED_BY_ADMIN', 'BRUTE_FORCE', '2FA_FAILED', 'SUCCESSFUL_LOGIN'
      ip,
      userAgent,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error('Failed to write login log:', err);
    return null;
  }
}

async function recordAuditLog({ req, user, action, targetModule, targetId = null, details, oldValues = null, newValues = null }) {
  try {
    const ip = req ? getClientIp(req) : 'system';
    const actorId = user ? user.id : 'system';
    const actorName = user ? user.name : 'النظام';
    const actorRole = user ? user.role : 'system';

    return await db.audit_logs.insert({
      actorId,
      actorName,
      actorRole,
      action, // e.g. 'STAFF_ROLE_CHANGE', 'PRODUCT_PRICE_UPDATE', 'SETTINGS_UPDATE', 'SESSION_REVOKE_ALL'
      targetModule, // 'users', 'products', 'settings', 'auth', 'orders'
      targetId,
      details,
      oldValues,
      newValues,
      ip,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error('Failed to write audit log:', err);
    return null;
  }
}

module.exports = {
  validatePasswordStrength,
  generateTotpSecret,
  verifyTotpCode,
  checkBruteForceLockout,
  recordFailedLoginAttempt,
  clearFailedLoginAttempts,
  resetAllFailedAttempts,
  getClientIp,
  recordLoginLog,
  recordAuditLog
};
