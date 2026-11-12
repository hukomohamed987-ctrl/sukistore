const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../database/db');
const { v4: uuidv4 } = require('uuid');
const {
  JWT_SECRET,
  generateToken,
  generate2FaTempToken,
  setAuthCookie,
  clearAuthCookie,
  authenticate,
  requireSuperAdmin,
  checkBruteForceLockout,
  recordFailedLoginAttempt,
  clearFailedLoginAttempts,
  resetAllFailedAttempts
} = require('../middleware/auth');
const {
  validatePasswordStrength,
  generateTotpSecret,
  verifyTotpCode,
  recordLoginLog,
  recordAuditLog
} = require('../utils/security');

const { cairoDay } = require('../utils/ledger');

// Used to equalize login timing for unknown accounts
const DUMMY_PASSWORD_HASH = bcrypt.hashSync('suki-dummy-password-for-timing', 12);

// Show OTP codes in API responses ONLY when explicitly enabled for local testing
const OTP_DEBUG_ECHO = process.env.OTP_DEBUG_ECHO === 'true' && process.env.NODE_ENV !== 'production';
const OTP_MAX_ATTEMPTS = 5;

// SECURITY: verify an OTP against the LATEST active code for this email/phone,
// with expiry and a limited number of wrong attempts (stops guessing 6 digits).
async function checkOtpCode({ email, phone, code, reason = null }) {
  const cleanCode = String(code || '').trim();
  const now = new Date();
  const candidates = await db.otps.find(o =>
    !o.verified && !o.burned &&
    (!reason || o.reason === reason) &&
    ((email && o.email && o.email.toLowerCase() === email) || (phone && o.phone === phone))
  );
  // db.insert puts newest first
  const latest = candidates.find(o => new Date(o.expiresAt) >= now);
  if (!latest) {
    return { ok: false, message: 'انتهت صلاحية كود التحقق أو لم يتم طلبه، يُرجى طلب كود جديد' };
  }
  if (!cleanCode || latest.code !== cleanCode) {
    const attempts = (Number(latest.attempts) || 0) + 1;
    await db.otps.update(latest.id, { attempts, burned: attempts >= OTP_MAX_ATTEMPTS });
    return {
      ok: false,
      message: attempts >= OTP_MAX_ATTEMPTS
        ? 'تم تجاوز عدد المحاولات المسموح بها لهذا الكود، يُرجى طلب كود جديد'
        : 'كود التحقق غير صحيح، يُرجى التأكد وإعادة المحاولة'
    };
  }
  const updated = await db.otps.update(latest.id, { verified: true, verifiedAt: now.toISOString() });
  return { ok: true, otp: updated || latest };
}

// Helper to generate unique Customer ID like CUST-10492
async function generateUniqueCustomerId() {
  let customerId = '';
  let exists = true;
  while (exists) {
    const randomNum = Math.floor(10000 + Math.random() * 90000);
    customerId = `CUST-${randomNum}`;
    const found = await db.users.findOne(u => u.customerId === customerId);
    if (!found) exists = false;
  }
  return customerId;
}

// Helper: Send OTP via Resend Email API
async function sendResendOtpEmail(email, code, purpose = 'register') {
  const isReset = purpose === 'reset';
  // SECURITY: the key must come from .env only (never hard-coded in source)
  const apiKey = (process.env.RESEND_API_KEY || '').trim();
  if (!apiKey) {
    console.warn('RESEND_API_KEY is not set; OTP email not sent.');
    return { ok: false, error: 'RESEND_API_KEY missing' };
  }
  const fromAddress = (process.env.RESEND_FROM || 'سوقي ستور <onboarding@resend.dev>').trim();
  const htmlContent = `
    <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 16px; background-color: #ffffff; color: #1e293b;">
      <div style="text-align: center; margin-bottom: 20px;">
        <h1 style="color: #059669; margin: 0; font-size: 26px;">سوقي ستور - Souqi Store</h1>
        <p style="color: #64748b; font-size: 14px; margin-top: 4px;">متجرك الموثوق لكل احتياجاتك</p>
      </div>
      <div style="background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 12px; padding: 20px; text-align: center; margin-bottom: 20px;">
        <p style="font-size: 14px; color: #166534; margin: 0 0 10px 0; font-weight: bold;">${isReset ? 'كود إعادة تعيين كلمة المرور الخاص بك هو:' : 'كود التحقق الخاص بك لتأكيد البريد الإلكتروني هو:'}</p>
        <div style="font-size: 32px; font-weight: 900; letter-spacing: 6px; color: #047857; font-family: monospace;">${code}</div>
        <p style="font-size: 12px; color: #4b5563; margin: 10px 0 0 0;">${isReset ? 'هذا الكود صالح لمدة 10 دقائق فقط لتغيير كلمة المرور.' : 'هذا الكود صالح لمدة 10 دقائق فقط لإتمام التسجيل.'}</p>
      </div>
      <p style="font-size: 13px; color: #475569; line-height: 1.6;">
        ${isReset ? 'إذا لم تطلب تغيير كلمة المرور، تجاهل هذه الرسالة وحسابك هيفضل آمن ومحدش هيقدر يغير الباسورد من غير الكود ده.' : 'إذا لم تكن قد طلبت هذا الكود في سوقي ستور، يمكنك تجاهل هذه الرسالة بأمان.'}
      </p>
      <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
      <div style="text-align: center; font-size: 11px; color: #94a3b8;">
        © ${new Date().getFullYear()} سوقي ستور (souqystore.com). جميع الحقوق محفوظة.
      </div>
    </div>
  `;

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: fromAddress,
        to: [email],
        subject: isReset ? `كود إعادة تعيين كلمة المرور في سوقي ستور: [${code}]` : `رمز التحقق لتسجيل حسابك في سوقي ستور: [${code}]`,
        html: htmlContent
      })
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      console.warn('Resend API response warning:', data);
    } else {
      console.log(`📧 [RESEND EMAIL] OTP sent to ${email}`);
    }
    return { ok: response.ok, data };
  } catch (err) {
    console.error('Resend email error:', err);
    return { ok: false, error: err.message };
  }
}

// ----------------------------------------------------
// 1. SEND EMAIL OTP (RESEND API)
// ----------------------------------------------------
router.post('/send-email-otp', async (req, res) => {
  try {
    const { email } = req.body;
    // "reset" codes are only issued by /forgot-password
    const reason = req.body.reason && req.body.reason !== 'reset' ? String(req.body.reason) : 'register';
    if (!email) {
      return res.status(400).json({ success: false, message: 'البريد الإلكتروني مطلوب لإرسال رمز التحقق' });
    }

    const cleanEmail = String(email).trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(cleanEmail)) {
      return res.status(400).json({ success: false, message: 'صيغة البريد الإلكتروني غير صحيحة' });
    }

    if (reason === 'register') {
      const existing = await db.users.findOne(u => u.email && u.email.toLowerCase() === cleanEmail);
      if (existing) {
        return res.status(400).json({ success: false, message: 'هذا البريد الإلكتروني مسجل بالفعل، يُرجى تسجيل الدخول' });
      }
    }

    // Generate 6-digit cryptographically random code
    const code = require('crypto').randomInt(100000, 1000000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    await db.otps.insert({
      email: cleanEmail,
      code,
      reason,
      verified: false,
      attempts: 0,
      expiresAt,
      createdAt: new Date().toISOString()
    });

    if (OTP_DEBUG_ECHO) console.log(`📧 [EMAIL OTP][DEBUG] code for ${cleanEmail}: [${code}]`);

    // Dispatch email via Resend
    const sent = await sendResendOtpEmail(cleanEmail, code);
    if (!sent.ok && !OTP_DEBUG_ECHO) {
      return res.status(502).json({
        success: false,
        message: 'تعذر إرسال كود التحقق إلى بريدك حالياً. يُرجى المحاولة بعد قليل أو التواصل مع الدعم.'
      });
    }

    const payload = {
      success: true,
      message: `تم إرسال كود التحقق بنجاح إلى البريد الإلكتروني: ${cleanEmail}`,
      email: cleanEmail,
      expiresInSeconds: 600
    };
    if (OTP_DEBUG_ECHO) payload.otp = code; // local testing only (OTP_DEBUG_ECHO=true)
    res.json(payload);
  } catch (err) {
    console.error('Send Email OTP error:', err);
    res.status(500).json({ success: false, message: 'فشل إرسال كود التحقق للبريد' });
  }
});

// ----------------------------------------------------
// 2. VERIFY EMAIL OTP
// ----------------------------------------------------
router.post('/verify-email-otp', async (req, res) => {
  try {
    const { email, code, reason = 'register' } = req.body;
    if (!email || !code) {
      return res.status(400).json({ success: false, message: 'البريد الإلكتروني وكود التحقق مطلوبان' });
    }

    const cleanEmail = String(email).trim().toLowerCase();
    const cleanCode = String(code).trim();

    const check = await checkOtpCode({ email: cleanEmail, code: cleanCode });
    if (!check.ok) {
      return res.status(400).json({ success: false, message: check.message });
    }
    const latestOtp = check.otp;

    res.json({
      success: true,
      message: 'تم تأكيد البريد الإلكتروني بنجاح ✅',
      verificationToken: latestOtp.id
    });
  } catch (err) {
    console.error('Verify Email OTP error:', err);
    res.status(500).json({ success: false, message: 'فشل التحقق من الكود' });
  }
});

// Legacy / General send-otp (smooth fallback)
router.post('/send-otp', async (req, res) => {
  try {
    const { phone, email } = req.body;
    const reason = req.body.reason && req.body.reason !== 'reset' ? String(req.body.reason) : 'register';
    if (email) {
      // Delegate to email otp
      const cleanEmail = String(email).trim().toLowerCase();
      const code = require('crypto').randomInt(100000, 1000000).toString();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
      await db.otps.insert({
        email: cleanEmail,
        code,
        reason,
        verified: false,
        attempts: 0,
        expiresAt,
        createdAt: new Date().toISOString()
      });
      const sent = await sendResendOtpEmail(cleanEmail, code);
      if (!sent.ok && !OTP_DEBUG_ECHO) {
        return res.status(502).json({ success: false, message: 'تعذر إرسال كود التحقق إلى بريدك حالياً، حاول بعد قليل.' });
      }
      const payload = {
        success: true,
        message: `تم إرسال رمز التحقق OTP إلى البريد الإلكتروني: ${cleanEmail}`,
        email: cleanEmail,
        expiresInSeconds: 600
      };
      if (OTP_DEBUG_ECHO) payload.otp = code;
      return res.json(payload);
    }

    // SECURITY: there is no SMS gateway yet, so a phone code could only ever be
    // delivered by echoing it back, which proves nothing. Refuse until SMS exists.
    return res.status(400).json({
      success: false,
      message: 'التحقق برقم الهاتف غير متاح حالياً، يُرجى استخدام البريد الإلكتروني'
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'فشل إرسال كود التحقق' });
  }
});

router.post('/verify-otp', async (req, res) => {
  try {
    const { phone, email, code } = req.body;
    const cleanEmail = email ? String(email).trim().toLowerCase() : null;
    if (!cleanEmail) {
      return res.status(400).json({ success: false, message: 'البريد الإلكتروني وكود التحقق مطلوبان' });
    }

    const check = await checkOtpCode({ email: cleanEmail, code });
    if (!check.ok) {
      return res.status(400).json({ success: false, message: check.message });
    }
    const latestOtp = check.otp;

    res.json({
      success: true,
      message: 'تم تأكيد الرمز بنجاح ✅',
      verificationToken: latestOtp.id
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'فشل التحقق من الكود' });
  }
});

// Register a new customer with mandatory OTP check
// ----------------------------------------------------
// FORGOT PASSWORD (customers): email code → new password
// The answer is the same whether the email exists or not, so nobody can
// use this form to find out which emails have accounts.
// ----------------------------------------------------
router.post('/forgot-password', async (req, res) => {
  const generic = {
    success: true,
    message: 'لو الإيميل ده مسجّل عندنا، هيوصلك كود لتغيير كلمة المرور خلال دقيقة. بص في الـ Inbox والـ Spam.'
  };
  try {
    const cleanEmail = String(req.body.email || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      return res.status(400).json({ success: false, message: 'اكتب البريد الإلكتروني صح' });
    }
    const user = await db.users.findOne(u => u.email && u.email.toLowerCase() === cleanEmail);
    // Staff / admin passwords are reset by the store owner from the dashboard, not by email
    if (!user || user.role !== 'customer' || user.isLocked) return res.json(generic);

    // Max 3 codes per 15 minutes for the same email
    const since = Date.now() - 15 * 60 * 1000;
    const recent = await db.otps.find(o => o.reason === 'reset' && o.email === cleanEmail && new Date(o.createdAt).getTime() > since);
    if (recent.length >= 3) return res.json(generic);

    const code = require('crypto').randomInt(100000, 1000000).toString();
    await db.otps.insert({
      email: cleanEmail, code, reason: 'reset', verified: false, attempts: 0,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      createdAt: new Date().toISOString()
    });
    if (OTP_DEBUG_ECHO) console.log(`📧 [RESET OTP][DEBUG] code for ${cleanEmail}: [${code}]`);
    await sendResendOtpEmail(cleanEmail, code, 'reset');
    const payload = { ...generic };
    if (OTP_DEBUG_ECHO) payload.otp = code; // local testing only
    res.json(payload);
  } catch (err) {
    console.error('Forgot password error:', err);
    res.json(generic);
  }
});

router.post('/reset-password', async (req, res) => {
  try {
    const cleanEmail = String(req.body.email || '').trim().toLowerCase();
    const { code, newPassword } = req.body;
    if (!cleanEmail || !code || !newPassword) {
      return res.status(400).json({ success: false, message: 'الإيميل والكود وكلمة المرور الجديدة مطلوبين' });
    }
    const strength = validatePasswordStrength(String(newPassword));
    if (!strength.isValid) {
      return res.status(400).json({ success: false, message: strength.message, requirements: strength.requirements });
    }
    const check = await checkOtpCode({ email: cleanEmail, code, reason: 'reset' });
    if (!check.ok) return res.status(400).json({ success: false, message: check.message });

    const user = await db.users.findOne(u => u.email && u.email.toLowerCase() === cleanEmail);
    if (!user || user.role !== 'customer') {
      return res.status(400).json({ success: false, message: 'كود التحقق غير صحيح، يُرجى التأكد وإعادة المحاولة' });
    }
    const hashed = await bcrypt.hash(String(newPassword), 12);
    await db.users.update(user.id, { password: hashed, tokenVersion: (user.tokenVersion || 1) + 1 });
    await db.otps.update(check.otp.id, { consumed: true, consumedAt: new Date().toISOString() });
    // Old lockout from wrong guesses should not block the owner after a successful reset
    try { clearFailedLoginAttempts(req, cleanEmail); } catch (e) {}
    recordAuditLog({ req, user, action: 'RESET_PASSWORD', targetModule: 'auth', details: 'تغيير كلمة المرور عن طريق كود البريد (نسيت كلمة المرور)' }).catch(() => {});
    res.json({ success: true, message: 'تم تغيير كلمة المرور. سجّل دخول دلوقتي بالباسورد الجديد.' });
  } catch (err) {
    console.error('Reset password error:', err);
    res.status(500).json({ success: false, message: 'فشل تغيير كلمة المرور' });
  }
});

router.post('/register', async (req, res) => {
  try {
    const { name, email, phone, password, address, secondaryPhone, whatsappPhone, otpCode, verificationToken } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'الاسم الكامل، البريد الإلكتروني، وكلمة المرور مطلوبة'
      });
    }

    const cleanEmail = String(email).trim().toLowerCase();
    const cleanPhone = phone ? String(phone).trim().replace(/[\s-]/g, '') : '';

    // Check if email already exists
    const existingEmail = await db.users.findOne(u => u.email && u.email.toLowerCase() === cleanEmail);
    if (existingEmail) {
      return res.status(400).json({
        success: false,
        message: 'البريد الإلكتروني مسجل بالفعل، يُرجى تسجيل الدخول أو استخدام بريد آخر'
      });
    }

    // MANDATORY EMAIL OTP VERIFICATION
    // SECURITY: the code must have been sent to THIS email, verified recently,
    // and not already used for another registration.
    let isOtpValid = false;
    let usedOtpId = null;
    if (verificationToken) {
      const verifiedRecord = await db.otps.getById(String(verificationToken));
      const verifiedRecently = verifiedRecord && verifiedRecord.verifiedAt &&
        (Date.now() - new Date(verifiedRecord.verifiedAt).getTime()) < 30 * 60 * 1000;
      if (verifiedRecord && verifiedRecord.verified && !verifiedRecord.consumed && verifiedRecently &&
          verifiedRecord.email && verifiedRecord.email.toLowerCase() === cleanEmail) {
        isOtpValid = true;
        usedOtpId = verifiedRecord.id;
      }
    } else if (otpCode) {
      const check = await checkOtpCode({ email: cleanEmail, code: otpCode });
      if (check.ok) {
        isOtpValid = true;
        usedOtpId = check.otp.id;
      }
    }

    if (!isOtpValid) {
      return res.status(400).json({
        success: false,
        message: 'يجب تأكيد البريد الإلكتروني بإدخال كود التحقق (OTP) المرسل إلى بريدك أولاً لإتمام التسجيل',
        requireOtp: true,
        email: cleanEmail
      });
    }

    // Enforce Strong Password Policy
    const pwdStrength = validatePasswordStrength(password);
    if (!pwdStrength.isValid) {
      return res.status(400).json({
        success: false,
        message: pwdStrength.message,
        requirements: pwdStrength.requirements,
        score: pwdStrength.score
      });
    }

    // Hash password with strong salt rounds (12)
    const salt = await bcrypt.genSalt(12);
    const hashedPassword = await bcrypt.hash(password, salt);
    const customerId = await generateUniqueCustomerId();

    const initialAddress = address || {
      governorate: 'القاهرة',
      city: 'القاهرة',
      area: '',
      street: '',
      building: '',
      notes: ''
    };

    const addressRecord = {
      id: uuidv4(),
      label: 'عنوان التوصيل الرئيسي',
      recipientName: name.trim(),
      phone: cleanPhone,
      governorate: initialAddress.governorate || 'القاهرة',
      city: initialAddress.city || 'القاهرة',
      area: initialAddress.area || '',
      street: initialAddress.street || '',
      building: initialAddress.building || '',
      notes: initialAddress.notes || '',
      isDefault: true
    };

    if (usedOtpId) {
      await db.otps.update(usedOtpId, { consumed: true, consumedAt: new Date().toISOString() });
    }

    const newUser = await db.users.insert({
      customerId,
      name: name.trim(),
      email: cleanEmail,
      phone: cleanPhone,
      secondaryPhone: (secondaryPhone || '').trim(),
      whatsappPhone: (whatsappPhone || cleanPhone).trim(),
      password: hashedPassword,
      role: 'customer', // Default role
      isLocked: false,
      tokenVersion: 1,
      twoFactorEnabled: false,
      address: initialAddress,
      addresses: [addressRecord],
      avatar: `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(name.trim())}`
    });

    const token = generateToken(newUser);
    setAuthCookie(res, token, req);

    // Record login/registration log
    recordLoginLog({
      req,
      email: cleanEmail,
      userId: newUser.id,
      role: 'customer',
      status: 'SUCCESS',
      reason: 'ACCOUNT_REGISTRATION'
    }).catch(() => {});

    // Return safe user object (no password)
    const { password: _, ...safeUser } = newUser;

    res.status(201).json({
      success: true,
      message: 'تم إنشاء الحساب بنجاح، مرحباً بك في سوقي ستور!',
      token,
      user: safeUser
    });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ success: false, message: 'حدث خطأ أثناء إنشاء الحساب' });
  }
});

// Login (Customer or Admin/Staff) - Direct, smooth and reliable
router.post('/login', async (req, res) => {
  try {
    const rawIdentifier = req.body.identifier || req.body.email || req.body.phone || req.body.username || req.body.login;
    const { password } = req.body;
    const identifier = rawIdentifier;

    if (!identifier || !password) {
      return res.status(400).json({
        success: false,
        message: 'يُرجى إدخال البريد الإلكتروني أو رقم الجوال أو اسم المستخدم مع كلمة المرور'
      });
    }

    const cleanIdentifier = String(identifier).trim().toLowerCase();

    // SECURITY: brute-force lockout (per identifier + IP)
    const lockState = checkBruteForceLockout(req, cleanIdentifier);
    if (lockState.isLocked) {
      return res.status(429).json({
        success: false,
        message: lockState.message,
        lockoutSeconds: lockState.remainingSeconds
      });
    }
    const GENERIC_LOGIN_ERROR = 'بيانات الدخول غير صحيحة، تأكد من البريد أو رقم الجوال وكلمة المرور';
    const failLogin = (reason) => {
      const r = recordFailedLoginAttempt(req, cleanIdentifier, reason);
      return res.status(r.isLocked ? 429 : 400).json({
        success: false,
        message: r.isLocked
          ? `تم قفل تسجيل الدخول مؤقتاً لمدة ${r.lockoutDurationMinutes} دقيقة بعد عدة محاولات فاشلة.`
          : GENERIC_LOGIN_ERROR,
        remainingAttempts: r.remainingAttempts
      });
    };

    // Find user by email OR by phone OR by customerId OR by username OR by merchantCode OR by investorCode
    const cleanPhone = cleanIdentifier.replace(/[\s-]/g, '');
    const user = await db.users.findOne(u => {
      const matchEmail = u.email && u.email.toLowerCase() === cleanIdentifier;
      const matchPhone = u.phone && u.phone.replace(/[\s-]/g, '') === cleanPhone;
      const matchId = u.customerId && u.customerId.toLowerCase() === cleanIdentifier;
      const matchUsername = u.username && u.username.toLowerCase() === cleanIdentifier;
      const matchMerchantCode = u.merchantCode && u.merchantCode.toLowerCase() === cleanIdentifier;
      const matchInvestorCode = u.investorCode && u.investorCode.toLowerCase() === cleanIdentifier;
      return matchEmail || matchPhone || matchId || matchUsername || matchMerchantCode || matchInvestorCode;
    });

    if (!user) {
      // Spend similar time as a real password check to avoid account enumeration by timing
      await bcrypt.compare(String(password), DUMMY_PASSWORD_HASH).catch(() => {});
      return failLogin('UNKNOWN_ACCOUNT');
    }

    // Verify password BEFORE revealing any account status
    const passwordOk = await bcrypt.compare(String(password), user.password || '');
    if (!passwordOk) {
      return failLogin('INVALID_PASSWORD');
    }

    // Check account status
    if (user.isLocked) {
      return res.status(403).json({
        success: false,
        message: 'تم قفل هذا الحساب من قِبل إدارة المتجر. يُرجى مراجعة الدعم الفني لحل المشكلة.'
      });
    }

    if (user.role === 'staff' && user.isActive === false) {
      return res.status(403).json({
        success: false,
        message: 'تم تعطيل حساب الموظف هذا مؤقتاً، يُرجى مراجعة المدير العام.'
      });
    }

    // 4. Two-Factor Authentication Check (2FA)
    if (user.twoFactorEnabled) {
      const tempToken = generate2FaTempToken(user);
      return res.json({
        success: true,
        requires2FA: true,
        tempToken,
        message: 'تم التحقق من كلمة المرور. يُرجى إدخال رمز التحقق الثنائي (2FA) المكون من 6 أرقام لإكمال تسجيل الدخول.'
      });
    }

    // 5. Successful Login
    clearFailedLoginAttempts(req, cleanIdentifier);
    const token = generateToken(user);
    setAuthCookie(res, token, req);

    recordLoginLog({
      req,
      email: user.email,
      userId: user.id,
      role: user.role,
      status: 'SUCCESS',
      reason: 'LOGIN_SUCCESS'
    }).catch(() => {});

    const { password: _, twoFactorSecret: __, twoFactorBackupCodes: ___, ...safeUser } = user;

    res.json({
      success: true,
      message: `أهلاً بك مجدداً يا ${user.name}!`,
      token,
      user: safeUser
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ success: false, message: 'حدث خطأ أثناء تسجيل الدخول' });
  }
});

// ----------------------------------------------------
// 2FA VERIFICATION & MANAGEMENT
// ----------------------------------------------------

// Verify 2FA code during login
router.post('/2fa/verify', async (req, res) => {
  try {
    const { tempToken, code } = req.body;
    if (!tempToken || !code) {
      return res.status(400).json({ success: false, message: 'رمز التحقق الثنائي ورمز الجلسة المؤقت مطلوبان' });
    }

    let decoded;
    try {
      decoded = jwt.verify(tempToken, JWT_SECRET);
      if (decoded.type !== '2FA_TEMP') {
        return res.status(401).json({ success: false, message: 'رمز الجلسة المؤقت غير صالح' });
      }
    } catch (e) {
      return res.status(401).json({ success: false, message: 'انتهت صلاحية رمز الجلسة المؤقت (5 دقائق)، يُرجى تسجيل الدخول مجدداً' });
    }

    const user = await db.users.getById(decoded.id);
    if (!user || !user.twoFactorEnabled || !user.twoFactorSecret) {
      return res.status(400).json({ success: false, message: 'المصادقة الثنائية غير مفعلة لهذا الحساب' });
    }

    const twoFaLock = checkBruteForceLockout(req, user.email);
    if (twoFaLock.isLocked) {
      return res.status(429).json({ success: false, message: twoFaLock.message });
    }

    const cleanCode = String(code).trim().toUpperCase();

    // Check TOTP code or Backup recovery code
    let isCodeValid = verifyTotpCode(user.twoFactorSecret, cleanCode);
    let usedBackupCode = false;

    if (!isCodeValid && Array.isArray(user.twoFactorBackupCodes)) {
      const backupIndex = user.twoFactorBackupCodes.findIndex(c => c.toUpperCase() === cleanCode);
      if (backupIndex !== -1) {
        isCodeValid = true;
        usedBackupCode = true;
        // Consume the backup code so it can't be reused
        const remainingCodes = [...user.twoFactorBackupCodes];
        remainingCodes.splice(backupIndex, 1);
        await db.users.update(user.id, { twoFactorBackupCodes: remainingCodes });
      }
    }

    if (!isCodeValid) {
      recordFailedLoginAttempt(req, user.email, 'INVALID_2FA_CODE');
      return res.status(400).json({ success: false, message: 'رمز التحقق الثنائي غير صحيح أو منتهي الصلاحية' });
    }

    // Success! Clear any lockout records and issue final token
    clearFailedLoginAttempts(req, user.email);
    const token = generateToken(user);
    setAuthCookie(res, token, req);

    recordLoginLog({
      req,
      email: user.email,
      userId: user.id,
      role: user.role,
      status: 'SUCCESS',
      reason: usedBackupCode ? '2FA_BACKUP_CODE' : '2FA_TOTP'
    }).catch(() => {});

    const { password: _, twoFactorSecret: __, twoFactorBackupCodes: ___, ...safeUser } = user;

    res.json({
      success: true,
      message: 'تم التحقق الثنائي بنجاح! مرحباً بك.',
      token,
      user: safeUser
    });
  } catch (err) {
    console.error('2FA Verify error:', err);
    res.status(500).json({ success: false, message: 'فشل التحقق من رمز 2FA' });
  }
});

// 2FA Setup: Generate secret and recovery codes
router.post('/2fa/setup', authenticate, async (req, res) => {
  try {
    const { secret, backupCodes, otpauthUrl } = generateTotpSecret(req.user.email, 'Suki Store');
    res.json({
      success: true,
      secret,
      backupCodes,
      otpauthUrl,
      message: 'تم إنشاء مفتاح المصادقة الثنائية بنجاح'
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'فشل إعداد المصادقة الثنائية' });
  }
});

// 2FA Enable: Confirm code and activate
router.post('/2fa/enable', authenticate, async (req, res) => {
  try {
    const { secret, code, backupCodes } = req.body;
    if (!secret || !code) {
      return res.status(400).json({ success: false, message: 'المفتاح السري ورمز التحقق مطلوبان لتأكيد التفعيل' });
    }

    const isValid = verifyTotpCode(secret, String(code).trim());
    if (!isValid) {
      return res.status(400).json({ success: false, message: 'رمز التحقق غير صحيح، تأكد من الوقت في تطبيق المصادقة' });
    }

    await db.users.update(req.user.id, {
      twoFactorEnabled: true,
      twoFactorSecret: secret,
      twoFactorBackupCodes: Array.isArray(backupCodes) ? backupCodes : []
    });

    recordAuditLog({
      req,
      user: req.user,
      action: 'ENABLE_2FA',
      targetModule: 'auth',
      details: 'تم تفعيل المصادقة الثنائية (2FA) بنجاح لحساب المستخدم'
    }).catch(() => {});

    res.json({
      success: true,
      message: 'تم تفعيل المصادقة الثنائية (2FA) بنجاح وحفظ رموز الاسترداد بأمان'
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'فشل تفعيل المصادقة الثنائية' });
  }
});

// 2FA Disable: Deactivate with password check
router.post('/2fa/disable', authenticate, async (req, res) => {
  try {
    const { password } = req.body;
    if (!password) {
      return res.status(400).json({ success: false, message: 'كلمة المرور مطلوبة لإلغاء المصادقة الثنائية' });
    }

    const isMatch = await bcrypt.compare(password, req.user.password);
    if (!isMatch) {
      return res.status(400).json({ success: false, message: 'كلمة المرور غير صحيحة' });
    }

    await db.users.update(req.user.id, {
      twoFactorEnabled: false,
      twoFactorSecret: null,
      twoFactorBackupCodes: []
    });

    recordAuditLog({
      req,
      user: req.user,
      action: 'DISABLE_2FA',
      targetModule: 'auth',
      details: 'تم تعطيل المصادقة الثنائية (2FA) للحساب'
    }).catch(() => {});

    res.json({
      success: true,
      message: 'تم تعطيل المصادقة الثنائية بنجاح'
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'فشل تعطيل المصادقة الثنائية' });
  }
});

// Logout (Clear cookie)
router.post('/logout', (req, res) => {
  clearAuthCookie(res);
  res.json({ success: true, message: 'تم تسجيل الخروج بنجاح' });
});

// Logout from all devices (Global session revocation)
router.post('/logout-all', authenticate, async (req, res) => {
  try {
    const nextVersion = (req.user.tokenVersion || 1) + 1;
    await db.users.update(req.user.id, { tokenVersion: nextVersion });
    clearAuthCookie(res);

    recordAuditLog({
      req,
      user: req.user,
      action: 'LOGOUT_ALL_DEVICES',
      targetModule: 'auth',
      details: `تم إلغاء صلاحية كافة الجلسات السابقة (النسخة الجديدة: ${nextVersion})`
    }).catch(() => {});

    res.json({
      success: true,
      message: 'تم تسجيل الخروج بنجاح من كافة الأجهزة والمتصفحات، وأصبحت جميع الجلسات القديمة غير صالحة.'
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'فشل تسجيل الخروج من كافة الأجهزة' });
  }
});

// Reset brute-force lockouts (Safety release endpoint)
router.post('/reset-lockouts', authenticate, requireSuperAdmin, (req, res) => {
  resetAllFailedAttempts();
  res.json({
    success: true,
    message: 'تم فك القفل وإعادة تعيين عدادات تسجيل الدخول بنجاح'
  });
});

// Employee & User Heartbeat: Tracks real-time online status and calculates online hours today & per-day history
router.post('/heartbeat', authenticate, async (req, res) => {
  try {
    const user = await db.users.getById(req.user.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'المستخدم غير موجود' });
    }

    const { inAdmin = false } = req.body;
    const now = new Date();
    // Days are counted in Cairo time (a shift at 1 AM belongs to that Egyptian day)
    const todayStr = cairoDay(now);
    const lastActiveDate = user.lastActiveDate || todayStr;
    const lastHeartbeat = user.lastHeartbeatAt ? new Date(user.lastHeartbeatAt) : null;

    let todayOnlineSeconds = Number(user.todayOnlineSeconds) || 0;
    if (lastActiveDate !== todayStr) {
      todayOnlineSeconds = 0;
    }

    // Only staff time spent ON THE DASHBOARD counts. Real elapsed time between two beats
    // (sent every 30 s) is added only if the previous beat was recent — a new session starts at 0,
    // so a closed laptop or a lost connection never adds fake time.
    const isPrivileged = ['staff', 'accountant', 'super_admin', 'admin'].includes(user.role);
    let secondsToAdd = 0;
    if (inAdmin || !isPrivileged) {
      if (lastHeartbeat && user.isOnline !== false) {
        const elapsedMs = now.getTime() - lastHeartbeat.getTime();
        if (elapsedMs > 0 && elapsedMs <= 90000) secondsToAdd = Math.round(elapsedMs / 1000);
      }
    }

    todayOnlineSeconds += secondsToAdd;

    // Daily hours history map
    const dailyHours = user.dailyHours || {};
    if (!dailyHours[todayStr]) {
      dailyHours[todayStr] = {
        date: todayStr,
        seconds: todayOnlineSeconds,
        firstActiveAt: now.toISOString(),
        lastActiveAt: now.toISOString()
      };
    } else {
      dailyHours[todayStr].seconds = todayOnlineSeconds;
      dailyHours[todayStr].lastActiveAt = now.toISOString();
      if (!dailyHours[todayStr].firstActiveAt) {
        dailyHours[todayStr].firstActiveAt = now.toISOString();
      }
    }

    await db.users.update(user.id, {
      isOnline: inAdmin || !isPrivileged,
      lastHeartbeatAt: now.toISOString(),
      lastActiveDate: todayStr,
      todayOnlineSeconds,
      dailyHours
    });

    res.json({
      success: true,
      isOnline: true,
      todayOnlineSeconds
    });
  } catch (err) {
    console.error('Heartbeat error:', err);
    res.status(500).json({ success: false, message: 'فشل تسجيل النشاط' });
  }
});

// Employee & User Offline Beacon (called immediately on tab close or page exit)
router.post('/offline', authenticate, async (req, res) => {
  try {
    const user = await db.users.getById(req.user.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'المستخدم غير موجود' });
    }

    const now = new Date();
    const todayStr = cairoDay(now);
    const dailyHours = user.dailyHours || {};
    // Count the last stretch up to the moment the tab was closed
    const last = user.lastHeartbeatAt ? new Date(user.lastHeartbeatAt) : null;
    if (last && user.isOnline !== false && user.lastActiveDate === todayStr) {
      const extra = now.getTime() - last.getTime();
      if (extra > 0 && extra <= 90000) user.todayOnlineSeconds = (Number(user.todayOnlineSeconds) || 0) + Math.round(extra / 1000);
    }
    if (dailyHours[todayStr]) {
      dailyHours[todayStr].lastActiveAt = now.toISOString();
      dailyHours[todayStr].seconds = Number(user.todayOnlineSeconds) || 0;
    }

    await db.users.update(user.id, {
      isOnline: false,
      lastOfflineAt: now.toISOString(),
      lastHeartbeatAt: now.toISOString(),
      todayOnlineSeconds: Number(user.todayOnlineSeconds) || 0,
      dailyHours
    });

    res.json({ success: true, isOnline: false, message: 'تم تسجيل الخروج وتوقف العداد بنجاح' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'فشل تسجيل الخروج' });
  }
});

// ----------------------------------------------------
// ----------------------------------------------------
// 3. GOOGLE OAUTH 2.0 LOGIN & CONFIG
// ----------------------------------------------------

async function getGoogleOAuthConfig(req) {
  const settingsList = await db.settings.getAll();
  const settings = settingsList[0] || {};
  const clientId = (process.env.GOOGLE_CLIENT_ID || settings.googleClientId || '').trim();
  const clientSecret = (process.env.GOOGLE_CLIENT_SECRET || settings.googleClientSecret || '').trim();
  let callbackUrl = (process.env.GOOGLE_CALLBACK_URL || '').trim();

  // If request is from localhost or 127.0.0.1, prioritize local callback URL
  if (req) {
    const host = req.get('host') || '';
    if (host.includes('localhost') || host.includes('127.0.0.1')) {
      callbackUrl = `${req.protocol}://${host}/api/auth/google/callback`;
    }
  }
  return { clientId, clientSecret, callbackUrl };
}

// SECURITY: random one-time OAuth state, bound to this browser via an httpOnly cookie
function issueGoogleOAuthState(req, res) {
  const nonce = require('crypto').randomBytes(24).toString('hex');
  res.cookie('g_oauth_state', nonce, {
    httpOnly: true,
    sameSite: 'lax',
    secure: Boolean(req.secure || process.env.NODE_ENV === 'production'),
    maxAge: 10 * 60 * 1000,
    path: '/api/auth/google'
  });
  return nonce;
}

// 3.1 Get Google OAuth Public Config
router.get('/google/config', async (req, res) => {
  try {
    const { clientId, clientSecret, callbackUrl } = await getGoogleOAuthConfig(req);
    const defaultCallback = callbackUrl || `${req.protocol}://${req.get('host')}/api/auth/google/callback`;
    res.json({
      success: true,
      clientId,
      configured: Boolean(clientId && clientSecret),
      callbackUrl: defaultCallback
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'فشل جلب إعدادات Google OAuth' });
  }
});

// 3.2 Get Google OAuth Consent URL
router.get('/google/url', async (req, res) => {
  try {
    const { clientId, clientSecret, callbackUrl } = await getGoogleOAuthConfig(req);
    const defaultCallback = callbackUrl || `${req.protocol}://${req.get('host')}/api/auth/google/callback`;

    if (!clientId) {
      return res.status(400).json({
        success: false,
        message: 'Google Client ID غير مهيأ في ملف .env أو إعدادات لوحة التحكم'
      });
    }

    const state = issueGoogleOAuthState(req, res);

    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` + new URLSearchParams({
      client_id: clientId,
      redirect_uri: defaultCallback,
      response_type: 'code',
      scope: 'openid profile email',
      access_type: 'offline',
      prompt: 'select_account',
      state: state
    }).toString();

    res.json({ success: true, url: authUrl });
  } catch (err) {
    res.status(500).json({ success: false, message: 'فشل توليد رابط المصادقة' });
  }
});

// 3.3 Direct Redirect to Google OAuth
router.get('/google', async (req, res) => {
  try {
    const { clientId, clientSecret, callbackUrl } = await getGoogleOAuthConfig(req);
    const defaultCallback = callbackUrl || `${req.protocol}://${req.get('host')}/api/auth/google/callback`;

    if (!clientId || !clientSecret) {
      return res.redirect('/#/?open_auth=login&google_notice=not_configured');
    }

    const state = issueGoogleOAuthState(req, res);

    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` + new URLSearchParams({
      client_id: clientId,
      redirect_uri: defaultCallback,
      response_type: 'code',
      scope: 'openid profile email',
      access_type: 'offline',
      prompt: 'select_account',
      state: state
    }).toString();

    res.redirect(authUrl);
  } catch (err) {
    console.error('Google OAuth redirect error:', err);
    res.redirect('/#/?open_auth=login&google_error=' + encodeURIComponent('فشل بدء جلسة Google OAuth'));
  }
});

// 3.4 Google OAuth 2.0 Callback (Redirect URI)
router.get('/google/callback', async (req, res) => {
  try {
    const { code, error, state } = req.query;

    // SECURITY: always return to our own site (relative redirect). Never to an
    // origin taken from the request, or the login token could leak to another site.
    const returnOrigin = '';
    const redirectUri = null;

    const expectedState = req.cookies && req.cookies.g_oauth_state;
    res.clearCookie('g_oauth_state', { path: '/api/auth/google' });
    if (!error && (!state || !expectedState || String(state) !== String(expectedState))) {
      return res.redirect(`/#/?open_auth=login&google_error=` + encodeURIComponent('انتهت جلسة تسجيل الدخول بجوجل، حاول مرة أخرى'));
    }

    if (error) {
      console.warn('Google OAuth returned error:', error);
      const msg = error === 'access_denied' ? 'تم إلغاء تسجيل الدخول بحساب Google' : error;
      return res.redirect(`${returnOrigin}/#/?open_auth=login&google_error=` + encodeURIComponent(msg));
    }

    if (!code) {
      return res.redirect(`${returnOrigin}/#/?open_auth=login&google_error=` + encodeURIComponent('رمز المصادقة من جوجل مفقود'));
    }

    const { clientId, clientSecret, callbackUrl } = await getGoogleOAuthConfig(req);
    const defaultCallback = redirectUri || callbackUrl || `${req.protocol}://${req.get('host')}/api/auth/google/callback`;

    if (!clientId || !clientSecret) {
      return res.redirect(`${returnOrigin}/#/?open_auth=login&google_error=` + encodeURIComponent('بيانات Google OAuth غير مهيأة'));
    }

    // Exchange authorization code for tokens using the EXACT matching redirect_uri
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code: String(code),
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: defaultCallback,
        grant_type: 'authorization_code'
      })
    });

    const tokenData = await tokenResponse.json();

    if (!tokenResponse.ok || !tokenData.access_token) {
      console.error('Failed to exchange code for Google token:', tokenData);
      const errMsg = tokenData.error_description || tokenData.error || 'فشل التحقق من رمز جوجل';
      return res.redirect(`${returnOrigin}/#/?open_auth=login&google_error=` + encodeURIComponent(errMsg));
    }

    // Retrieve user profile using access token
    const userinfoResponse = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` }
    });

    const googleProfile = await userinfoResponse.json();

    if (!googleProfile.email || googleProfile.email_verified === false) {
      return res.redirect(`${returnOrigin}/#/?open_auth=login&google_error=` + encodeURIComponent('تعذر الحصول على البريد الإلكتروني من جوجل'));
    }

    const cleanEmail = String(googleProfile.email).trim().toLowerCase();
    let user = await db.users.findOne(u => u.email && u.email.toLowerCase() === cleanEmail);

    if (user) {
      if (user.isLocked) {
        return res.redirect(`${returnOrigin}/#/?open_auth=login&google_error=` + encodeURIComponent('هذا الحساب مقفل من قبل إدارة المتجر'));
      }
      // SECURITY: staff/admin accounts must use password (+2FA), not Google
      if (user.role !== 'customer') {
        return res.redirect(`${returnOrigin}/#/?open_auth=login&google_error=` + encodeURIComponent('حسابات الإدارة والموظفين تسجل الدخول بكلمة المرور فقط'));
      }
      const updates = {};
      if (googleProfile.picture && !user.avatar) updates.avatar = googleProfile.picture;
      if (googleProfile.sub && !user.googleId) updates.googleId = googleProfile.sub;
      if (Object.keys(updates).length > 0) {
        await db.users.update(user.id, updates);
        user = { ...user, ...updates };
      }
    } else {
      const customerId = await generateUniqueCustomerId();
      const randomPassword = await bcrypt.hash(uuidv4(), 10);

      user = await db.users.insert({
        customerId,
        name: (googleProfile.name || 'عميل جوجل').trim(),
        email: cleanEmail,
        phone: '',
        secondaryPhone: '',
        whatsappPhone: '',
        password: randomPassword,
        role: 'customer',
        isLocked: false,
        addresses: [],
        avatar: googleProfile.picture || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(googleProfile.name || cleanEmail)}`,
        googleId: googleProfile.sub || '',
        wishlist: [],
        createdAt: new Date().toISOString()
      });
    }

    // Record login audit log
    recordLoginLog(user, req, 'google_oauth_callback');

    const token = generateToken(user);
    setAuthCookie(res, token, req);

    res.redirect(`${returnOrigin}/#/?google_auth=success&token=${encodeURIComponent(token)}&name=${encodeURIComponent(user.name)}`);
  } catch (err) {
    console.error('Google OAuth callback error:', err);
    res.redirect('/#/?open_auth=login&google_error=' + encodeURIComponent('حدث خطأ أثناء معالجة تسجيل الدخول بجوجل'));
  }
});

// 3.5 Google One-Tap Credential Login or Demo Fallback
router.post('/google', async (req, res) => {
  try {
    // SECURITY: identity comes ONLY from a Google ID token verified with Google.
    // Email / name / googleId sent directly by the browser are never trusted.
    const { credential } = req.body;
    let email, name, avatar, googleId;

    if (!credential || typeof credential !== 'string') {
      return res.status(400).json({ success: false, message: 'يجب تسجيل الدخول عبر نافذة جوجل الرسمية' });
    }

    try {
      const verifyRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`);
      const tokenInfo = await verifyRes.json();
      // SECURITY: the token must be made for OUR Google app (never accept tokens for other apps)
      const expectedAud = (await getGoogleOAuthConfig(null)).clientId;
      const emailVerified = tokenInfo.email_verified === true || tokenInfo.email_verified === 'true';
      const audOk = Boolean(expectedAud) && tokenInfo.aud === expectedAud;
      if (!verifyRes.ok || !tokenInfo.email || !emailVerified || !audOk) {
        return res.status(401).json({ success: false, message: 'رمز التحقق (ID Token) من جوجل غير صالح' });
      }
      email = tokenInfo.email;
      name = tokenInfo.name;
      avatar = tokenInfo.picture;
      googleId = tokenInfo.sub;
    } catch (verifyErr) {
      console.warn('Google tokeninfo verification failed:', verifyErr);
      return res.status(503).json({ success: false, message: 'تعذر التحقق من حساب جوجل حالياً، حاول مرة أخرى' });
    }

    if (!email) {
      return res.status(400).json({ success: false, message: 'البريد الإلكتروني من حساب جوجل مطلوب' });
    }

    const cleanEmail = String(email).trim().toLowerCase();
    let user = await db.users.findOne(u => u.email && u.email.toLowerCase() === cleanEmail);

    if (user) {
      if (user.isLocked) {
        return res.status(403).json({ success: false, message: 'هذا الحساب مقفل من قبل إدارة المتجر' });
      }
      // SECURITY: staff/admin accounts must use password (+2FA), not Google
      if (user.role !== 'customer') {
        return res.status(403).json({ success: false, message: 'حسابات الإدارة والموظفين تسجل الدخول بكلمة المرور فقط' });
      }
      if (avatar && !user.avatar) {
        await db.users.update(user.id, { avatar });
      }
    } else {
      const customerId = await generateUniqueCustomerId();
      const randomPassword = await bcrypt.hash(uuidv4(), 10);

      user = await db.users.insert({
        customerId,
        name: (name || 'مستخدم جوجل').trim(),
        email: cleanEmail,
        phone: '',
        secondaryPhone: '',
        whatsappPhone: '',
        password: randomPassword,
        role: 'customer',
        isLocked: false,
        addresses: [],
        avatar: avatar || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(name || cleanEmail)}`,
        googleId: googleId || '',
        wishlist: [],
        createdAt: new Date().toISOString()
      });
    }

    recordLoginLog(user, req, 'google_oauth_post');

    const token = generateToken(user);
    setAuthCookie(res, token, req);
    const { password: _, ...safeUser } = user;

    res.json({
      success: true,
      message: `تم تسجيل الدخول بنجاح بواسطة جوجل، مرحباً بك يا ${user.name}!`,
      token,
      user: safeUser
    });
  } catch (err) {
    console.error('Google login error:', err);
    res.status(500).json({ success: false, message: 'فشل تسجيل الدخول بحساب جوجل' });
  }
});

// ----------------------------------------------------
// 4. DIRECT PHONE NUMBER UPDATE (NO OTP REQUIRED)
// ----------------------------------------------------
router.post('/change-phone', authenticate, async (req, res) => {
  try {
    const { newPhone } = req.body;

    if (!newPhone) {
      return res.status(400).json({ success: false, message: 'رقم الموبايل الجديد مطلوب' });
    }

    const cleanNewPhone = String(newPhone).trim().replace(/[\s-]/g, '');
    if (cleanNewPhone.length < 10) {
      return res.status(400).json({ success: false, message: 'رقم الموبايل غير صالح' });
    }

    // Check if new phone is used by another user
    const existing = await db.users.findOne(u => u.id !== req.user.id && u.phone && u.phone.replace(/[\s-]/g, '') === cleanNewPhone);
    if (existing) {
      return res.status(400).json({ success: false, message: 'رقم الموبايل الجديد مسجل بالفعل لحساب آخر' });
    }

    const updatedUser = await db.users.update(req.user.id, {
      phone: cleanNewPhone,
      whatsappPhone: req.user.whatsappPhone || cleanNewPhone
    });

    const { password: _, ...safeUser } = updatedUser;

    res.json({
      success: true,
      message: 'تم تحديث رقم الموبايل بنجاح ✅',
      user: safeUser
    });
  } catch (err) {
    console.error('Change phone error:', err);
    res.status(500).json({ success: false, message: 'فشل تغيير رقم الموبايل' });
  }
});

// Get current user profile
router.get('/me', authenticate, async (req, res) => {
  const { password: _, ...safeUser } = req.user;
  res.json({ success: true, user: safeUser });
});

// Update profile
router.put('/profile', authenticate, async (req, res) => {
  try {
    const { name, phone, secondaryPhone, whatsappPhone, address, avatar } = req.body;
    const updates = {};

    if (name) updates.name = name.trim();
    if (avatar !== undefined) updates.avatar = String(avatar).trim();

    if (secondaryPhone !== undefined) updates.secondaryPhone = String(secondaryPhone).trim();
    if (whatsappPhone !== undefined) updates.whatsappPhone = String(whatsappPhone).trim();

    if (phone !== undefined) {
      const cleanPhone = String(phone).trim().replace(/[\s-]/g, '');
      if (cleanPhone) {
        const existingPhone = await db.users.findOne(
          u => u.id !== req.user.id && u.phone && u.phone.replace(/[\s-]/g, '') === cleanPhone
        );
        if (existingPhone) {
          return res.status(400).json({
            success: false,
            message: 'رقم الجوال مسجل بالفعل لحساب آخر'
          });
        }
        updates.phone = cleanPhone;
      } else {
        updates.phone = '';
      }
    }

    if (address) {
      updates.address = {
        ...(req.user.address || {}),
        ...address
      };
    }

    const updatedUser = await db.users.update(req.user.id, updates);
    const { password: _, ...safeUser } = updatedUser;

    res.json({
      success: true,
      message: 'تم تحديث البيانات الشخصية بنجاح',
      user: safeUser
    });
  } catch (err) {
    console.error('Profile update error:', err);
    res.status(500).json({ success: false, message: 'فشل تحديث البيانات' });
  }
});

// ----------------------------------------------------
// MULTI-ADDRESS MANAGEMENT (Customer Profile)
// ----------------------------------------------------

// Get user saved addresses
router.get('/addresses', authenticate, async (req, res) => {
  try {
    const user = await db.users.getById(req.user.id);
    const addresses = Array.isArray(user?.addresses) ? user.addresses : [];
    res.json({ success: true, addresses });
  } catch (err) {
    res.status(500).json({ success: false, message: 'فشل جلب العناوين' });
  }
});

// Add new address
router.post('/addresses', authenticate, async (req, res) => {
  try {
    const { label, recipientName, phone, governorate, city, area, street, building, notes, isDefault, latitude, longitude, formattedAddress } = req.body;

    if (!recipientName || !phone || (!governorate && !city)) {
      return res.status(400).json({
        success: false,
        message: 'اسم المستلم، رقم الهاتف، والمحافظة مطلوبة'
      });
    }

    const user = await db.users.getById(req.user.id);
    let addresses = Array.isArray(user?.addresses) ? [...user.addresses] : [];

    const isFirst = addresses.length === 0;
    const makeDefault = Boolean(isDefault) || isFirst;

    if (makeDefault) {
      addresses = addresses.map(a => ({ ...a, isDefault: false }));
    }

    const newAddr = {
      id: uuidv4(),
      label: (label || 'عنوان جديد').trim(),
      recipientName: recipientName.trim(),
      phone: phone.trim(),
      governorate: (governorate || 'القاهرة').trim(),
      city: (city || governorate || 'القاهرة').trim(),
      area: (area || '').trim(),
      street: (street || '').trim(),
      building: (building || '').trim(),
      notes: (notes || '').trim(),
      latitude: latitude !== undefined ? latitude : null,
      longitude: longitude !== undefined ? longitude : null,
      formattedAddress: formattedAddress ? String(formattedAddress).trim() : null,
      isDefault: makeDefault
    };

    addresses.push(newAddr);

    // Keep user.address in sync if default
    const updates = { addresses };
    if (makeDefault) {
      updates.address = {
        governorate: newAddr.governorate,
        city: newAddr.city,
        area: newAddr.area,
        street: newAddr.street,
        building: newAddr.building,
        notes: newAddr.notes,
        latitude: newAddr.latitude,
        longitude: newAddr.longitude
      };
    }

    await db.users.update(req.user.id, updates);

    res.status(201).json({
      success: true,
      message: 'تم إضافة العنوان بنجاح',
      address: newAddr,
      addresses
    });
  } catch (err) {
    console.error('Add address error:', err);
    res.status(500).json({ success: false, message: 'فشل إضافة العنوان' });
  }
});

// Update address
router.put('/addresses/:addressId', authenticate, async (req, res) => {
  try {
    const { addressId } = req.params;
    const { label, recipientName, phone, governorate, city, area, street, building, notes, isDefault, latitude, longitude, formattedAddress } = req.body;

    const user = await db.users.getById(req.user.id);
    let addresses = Array.isArray(user?.addresses) ? [...user.addresses] : [];

    const index = addresses.findIndex(a => a.id === addressId);
    if (index === -1) {
      return res.status(404).json({ success: false, message: 'العنوان غير موجود' });
    }

    if (isDefault) {
      addresses = addresses.map(a => ({ ...a, isDefault: false }));
    }

    addresses[index] = {
      ...addresses[index],
      label: label !== undefined ? label.trim() : addresses[index].label,
      recipientName: recipientName !== undefined ? recipientName.trim() : addresses[index].recipientName,
      phone: phone !== undefined ? phone.trim() : addresses[index].phone,
      governorate: governorate !== undefined ? governorate.trim() : addresses[index].governorate,
      city: city !== undefined ? city.trim() : addresses[index].city,
      area: area !== undefined ? area.trim() : addresses[index].area,
      street: street !== undefined ? street.trim() : addresses[index].street,
      building: building !== undefined ? building.trim() : addresses[index].building,
      notes: notes !== undefined ? notes.trim() : addresses[index].notes,
      latitude: latitude !== undefined ? latitude : addresses[index].latitude,
      longitude: longitude !== undefined ? longitude : addresses[index].longitude,
      formattedAddress: formattedAddress !== undefined ? formattedAddress : addresses[index].formattedAddress,
      isDefault: isDefault !== undefined ? Boolean(isDefault) : addresses[index].isDefault
    };

    const updates = { addresses };
    if (addresses[index].isDefault) {
      updates.address = {
        governorate: addresses[index].governorate,
        city: addresses[index].city,
        area: addresses[index].area,
        street: addresses[index].street,
        building: addresses[index].building,
        notes: addresses[index].notes,
        latitude: addresses[index].latitude,
        longitude: addresses[index].longitude
      };
    }

    await db.users.update(req.user.id, updates);

    res.json({
      success: true,
      message: 'تم تحديث العنوان بنجاح',
      addresses
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'فشل تحديث العنوان' });
  }
});

// Set address as default
router.put('/addresses/:addressId/default', authenticate, async (req, res) => {
  try {
    const { addressId } = req.params;
    const user = await db.users.getById(req.user.id);
    let addresses = Array.isArray(user?.addresses) ? [...user.addresses] : [];

    const target = addresses.find(a => a.id === addressId);
    if (!target) {
      return res.status(404).json({ success: false, message: 'العنوان غير موجود' });
    }

    addresses = addresses.map(a => ({ ...a, isDefault: a.id === addressId }));

    await db.users.update(req.user.id, {
      addresses,
      address: {
        governorate: target.governorate,
        city: target.city,
        area: target.area,
        street: target.street,
        building: target.building,
        notes: target.notes
      }
    });

    res.json({
      success: true,
      message: 'تم تعيين العنوان كافتراضي بنجاح',
      addresses
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'فشل تعيين العنوان الافتراضي' });
  }
});

// Delete address
router.delete('/addresses/:addressId', authenticate, async (req, res) => {
  try {
    const { addressId } = req.params;
    const user = await db.users.getById(req.user.id);
    let addresses = Array.isArray(user?.addresses) ? [...user.addresses] : [];

    const index = addresses.findIndex(a => a.id === addressId);
    if (index === -1) {
      return res.status(404).json({ success: false, message: 'العنوان غير موجود' });
    }

    const wasDefault = addresses[index].isDefault;
    addresses.splice(index, 1);

    if (wasDefault && addresses.length > 0) {
      addresses[0].isDefault = true;
    }

    await db.users.update(req.user.id, { addresses });

    res.json({
      success: true,
      message: 'تم حذف العنوان بنجاح',
      addresses
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'فشل حذف العنوان' });
  }
});

// Change password
router.put('/password', authenticate, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    // SECURITY: everyone (admins included) must confirm the current password,
    // otherwise a stolen session could silently take over the account.
    const isOwnerOrPartner = false;

    if (!newPassword || !currentPassword) {
      return res.status(400).json({
        success: false,
        message: 'يجب إدخال كلمة المرور الحالية وكلمة المرور الجديدة'
      });
    }

    // Enforce Strong Password Policy (or at least 6 characters)
    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'يجب أن لا تقل كلمة المرور عن 6 أحرف'
      });
    }

    if (!isOwnerOrPartner) {
      const pwdStrength = validatePasswordStrength(newPassword);
      if (!pwdStrength.isValid) {
        return res.status(400).json({
          success: false,
          message: pwdStrength.message,
          requirements: pwdStrength.requirements,
          score: pwdStrength.score
        });
      }

      const isMatch = await bcrypt.compare(currentPassword, req.user.password);
      if (!isMatch) {
        return res.status(400).json({
          success: false,
          message: 'كلمة المرور الحالية غير صحيحة'
        });
      }
    }

    const salt = await bcrypt.genSalt(12);
    const hashedPassword = await bcrypt.hash(newPassword, salt);
    const newVersion = (req.user.tokenVersion || 1) + 1;

    const updatedUser = await db.users.update(req.user.id, {
      password: hashedPassword,
      tokenVersion: newVersion
    });

    // Issue updated token for current session
    const newToken = generateToken(updatedUser);
    setAuthCookie(res, newToken);

    recordAuditLog({
      req,
      user: req.user,
      action: 'CHANGE_PASSWORD',
      targetModule: 'auth',
      details: 'تم تغيير كلمة المرور بنجاح وإلغاء الجلسات الأخرى'
    }).catch(() => {});

    res.json({
      success: true,
      message: 'تم تغيير كلمة المرور بنجاح، وتم تأمين حسابك وإلغاء أي جلسات سابقة.',
      token: newToken
    });
  } catch (err) {
    console.error('Password change error:', err);
    res.status(500).json({ success: false, message: 'فشل تغيير كلمة المرور' });
  }
});

// (Removed: unused mock SMS OTP endpoints that accepted the fixed code 123456)

module.exports = router;
