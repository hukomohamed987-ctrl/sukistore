const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const uploadDir = path.join(__dirname, '..', 'public', 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Strict whitelist of safe extensions and corresponding MIME types
const ALLOWED_EXTENSIONS = new Set([
  '.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif', '.jfif', '.pjpeg', '.bmp', '.heic', '.heif',
  '.mp4', '.webm', '.mov', '.mkv', '.avi', '.m4v',
  '.pdf',
  '.xlsx', '.xls', '.xlsm', '.csv', '.ods',
  '.docx', '.doc', '.rtf', '.txt'
]);

const OFFICE_OOXML_EXTENSIONS = new Set(['.xlsx', '.xlsm', '.ods', '.docx']);
const OFFICE_OLE_EXTENSIONS = new Set(['.xls', '.doc']);

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/pjpeg',
  'image/jfif',
  'image/png',
  'image/x-png',
  'image/webp',
  'image/gif',
  'image/avif',
  'image/bmp',
  'image/x-ms-bmp',
  'image/heic',
  'image/heif',
  'application/pdf',
  'application/octet-stream', // Some browsers send octet-stream for webp/avif/jfif/office
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'application/vnd.ms-excel.sheet.macroenabled.12',
  'application/vnd.oasis.opendocument.spreadsheet',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
  'application/vnd.ms-word',
  'application/rtf',
  'text/rtf',
  'text/csv',
  'application/csv',
  'text/tab-separated-values',
  'text/plain',
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'video/x-matroska',
  'video/x-msvideo',
  'video/ogg'
]);

// Forbidden patterns in filenames
const FORBIDDEN_EXTENSIONS = /\.(php|phtml|phar|js|jsp|cgi|pl|py|sh|bash|exe|cmd|bat|html|htm|xml|json|htaccess)$/i;

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    // Generate secure random filename with clean whitelisted extension
    const randomHex = crypto.randomBytes(16).toString('hex');
    let ext = path.extname(file.originalname).toLowerCase();
    if (ext && !ALLOWED_EXTENSIONS.has(ext)) ext = ''; // never keep a non-whitelisted extension
    if (!ext && file.mimetype) {
      const mt = file.mimetype.toLowerCase();
      if (mt.includes('jpeg') || mt.includes('jpg')) ext = '.jpg';
      else if (mt.includes('png')) ext = '.png';
      else if (mt.includes('webp')) ext = '.webp';
      else if (mt === 'application/pdf') ext = '.pdf';
      else if (mt.includes('spreadsheetml')) ext = '.xlsx';
      else if (mt.includes('ms-excel')) ext = '.xls';
      else if (mt.includes('wordprocessingml')) ext = '.docx';
      else if (mt.includes('msword') || mt.includes('ms-word')) ext = '.doc';
      else if (mt.includes('csv')) ext = '.csv';
    }
    cb(null, `suki-${Date.now()}-${randomHex}${ext}`);
  }
});

const fileFilter = (req, file, cb) => {
  const originalName = file.originalname || '';
  const ext = path.extname(originalName).toLowerCase();

  // 1. Check if extension is forbidden
  if (FORBIDDEN_EXTENSIONS.test(originalName)) {
    return cb(new Error('نوع الملف غير آمن ومحظور أمنياً'));
  }

  // 2. Reject multiple dangerous extensions (e.g. evil.php.png)
  const dotCount = (originalName.match(/\./g) || []).length;
  if (dotCount > 1) {
    const parts = originalName.split('.');
    for (let i = 1; i < parts.length - 1; i++) {
      if (['php', 'js', 'exe', 'sh', 'html', 'py'].includes(parts[i].toLowerCase())) {
        return cb(new Error('اسم الملف يحتوي على امتدادات مشبوهة ومحظورة'));
      }
    }
  }

  // 3. Check against strict whitelist
  // SECURITY: the EXTENSION must always be whitelisted. The MIME type is sent by the
  // browser and can be faked, so "image/*" alone must not allow e.g. .svg or .xhtml
  // (those can run scripts on our domain).
  const mimeLower = (file.mimetype || '').toLowerCase();
  const isImageMime = mimeLower.startsWith('image/') && mimeLower !== 'image/svg+xml';
  const isNamelessSafeImage = ext === '' && /^image\/(jpeg|pjpeg|jpg|png|webp|gif)$/.test(mimeLower);
  if (!ALLOWED_EXTENSIONS.has(ext) && !isNamelessSafeImage) {
    return cb(new Error('نوع الملف غير مدعوم، يُسمح بالصور، الفيديوهات، PDF، وملفات Excel و Word (.xlsx, .xls, .docx, .doc)'));
  }

  const isZipMimeForOffice = (mimeLower === 'application/zip' || mimeLower === 'application/x-zip-compressed') && OFFICE_OOXML_EXTENSIONS.has(ext);
  const isCfbMimeForOffice = mimeLower === 'application/x-cfb' && OFFICE_OLE_EXTENSIONS.has(ext);

  if (!ALLOWED_MIME_TYPES.has(mimeLower) && !isImageMime && !isZipMimeForOffice && !isCfbMimeForOffice) {
    return cb(new Error('نوع محتوى الملف (MIME Type) غير مطابق لصيغة مدعومة'));
  }

  cb(null, true);
};

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB max per file (supports high quality product videos)
    files: 20 // Max 20 files per request (supports up to 15 images + videos)
  },
  fileFilter: fileFilter
});

module.exports = upload;
