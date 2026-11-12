const express = require('express');
const router = express.Router();
const upload = require('../middleware/upload');
const { authenticate } = require('../middleware/auth');
const db = require('../database/db');
const multer = require('multer');

// Generic upload endpoint POST /api/upload
router.post('/', authenticate, (req, res) => {
  upload.fields([
    { name: 'file', maxCount: 1 },
    { name: 'image', maxCount: 1 },
    { name: 'avatar', maxCount: 1 }
  ])(req, res, (err) => {
    if (err) {
      return res.status(400).json({ success: false, message: err.message || 'فشل رفع الملف' });
    }
    const uploadedFile = req.files?.file?.[0] || req.files?.image?.[0] || req.files?.avatar?.[0] || req.file;
    if (!uploadedFile) {
      return res.status(400).json({ success: false, message: 'لم يتم تحديد أي ملف للرفع' });
    }
    const url = `/uploads/${uploadedFile.filename}`;
    res.json({ success: true, url, filename: uploadedFile.filename });
  });
});

// Single image/media upload
router.post('/single', authenticate, (req, res) => {
  upload.fields([
    { name: 'file', maxCount: 1 },
    { name: 'image', maxCount: 1 },
    { name: 'avatar', maxCount: 1 }
  ])(req, res, (err) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({ success: false, message: 'حجم الملف يتجاوز الحد الأقصى المسموح (100 ميجابايت)' });
        }
        return res.status(400).json({ success: false, message: `خطأ في رفع الملف: ${err.message}` });
      }
      return res.status(400).json({ success: false, message: err.message || 'فشل رفع الملف' });
    }

    const uploadedFile = req.files?.file?.[0] || req.files?.image?.[0] || req.files?.avatar?.[0] || req.file;
    if (!uploadedFile) {
      return res.status(400).json({ success: false, message: 'لم يتم تحديد أي ملف للرفع' });
    }

    const url = `/uploads/${uploadedFile.filename}`;
    res.json({ success: true, url, filename: uploadedFile.filename });
  });
});

// Multiple images upload (up to 20 files at once)
router.post('/multiple', authenticate, (req, res) => {
  upload.array('files', 20)(req, res, (err) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({ success: false, message: 'أحد الملفات يتجاوز الحد الأقصى (100 ميجابايت)' });
        }
        if (err.code === 'LIMIT_FILE_COUNT') {
          return res.status(400).json({ success: false, message: 'لا يمكن رفع أكثر من 20 ملف دفعة واحدة' });
        }
        return res.status(400).json({ success: false, message: `خطأ في رفع الملفات: ${err.message}` });
      }
      return res.status(400).json({ success: false, message: err.message || 'فشل رفع الملفات' });
    }

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ success: false, message: 'لم يتم تحديد أي ملفات للرفع' });
    }

    const urls = req.files.map(f => `/uploads/${f.filename}`);
    res.json({ success: true, urls, count: urls.length });
  });
});

// Dedicated product video upload
router.post('/video', authenticate, (req, res) => {
  upload.single('video')(req, res, (err) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({ success: false, message: 'حجم الفيديو يتجاوز 100 ميجابايت' });
        }
        return res.status(400).json({ success: false, message: `خطأ في رفع الفيديو: ${err.message}` });
      }
      return res.status(400).json({ success: false, message: err.message || 'فشل رفع الفيديو' });
    }

    if (!req.file) {
      return res.status(400).json({ success: false, message: 'لم يتم تحديد أي ملف فيديو للرفع' });
    }

    const url = `/uploads/${req.file.filename}`;
    res.json({ success: true, url, filename: req.file.filename });
  });
});

// Profile Avatar upload (supports 'avatar', 'file', 'image', 'photo')
router.post(['/avatar', '/profile-photo'], authenticate, (req, res) => {
  upload.fields([
    { name: 'avatar', maxCount: 1 },
    { name: 'file', maxCount: 1 },
    { name: 'image', maxCount: 1 },
    { name: 'photo', maxCount: 1 }
  ])(req, res, async (err) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({ success: false, message: 'حجم الصورة يتجاوز الحد الأقصى' });
        }
        return res.status(400).json({ success: false, message: `خطأ في رفع الصورة: ${err.message}` });
      }
      return res.status(400).json({ success: false, message: err.message || 'فشل رفع الصورة' });
    }

    const uploadedFile = req.files?.avatar?.[0] || req.files?.file?.[0] || req.files?.image?.[0] || req.files?.photo?.[0] || req.file;

    if (!uploadedFile) {
      return res.status(400).json({ success: false, message: 'لم يتم تحديد أي صورة شخصية للرفع' });
    }

    const isPrivileged = req.user && (req.user.role === 'super_admin' || req.user.role === 'staff' || req.user.role === 'admin' || req.user.role === 'accountant');
    const MAX_CUSTOMER_AVATAR = 10 * 1024 * 1024; // 10MB limit

    if (!isPrivileged && uploadedFile.size > MAX_CUSTOMER_AVATAR) {
      const fs = require('fs');
      try {
        fs.unlinkSync(uploadedFile.path);
      } catch (e) {}

      return res.status(400).json({
        success: false,
        message: 'حجم الصورة الشخصية يجب ألا يتجاوز 10 ميجابايت. يُرجى اختيار صورة أصغر.'
      });
    }

    const url = `/uploads/${uploadedFile.filename}`;

    // Auto-update user profile with the new avatar in DB
    if (req.user && req.user.id) {
      try {
        await db.users.update(req.user.id, { avatar: url });
      } catch (err) {
        console.error('Failed to auto-update user avatar:', err);
      }
    }

    res.json({
      success: true,
      message: 'تم رفع وتحديث صورتك الشخصية بنجاح 📸',
      url,
      avatar: url,
      size: uploadedFile.size,
      isPrivileged
    });
  });
});

module.exports = router;
