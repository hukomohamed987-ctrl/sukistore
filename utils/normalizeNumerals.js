/**
 * Suki Store - Universal Arabic & English Numeral Normalizer
 * Seamlessly handles Arabic-Indic digits (٠-٩), Persian digits (۰-۹),
 * Arabic decimal points (٫), and Arabic commas (،).
 */

function normalizeNumerals(val) {
  if (val === null || val === undefined) return '';
  const arabicEastern = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
  const persian = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
  let str = String(val);
  for (let i = 0; i < 10; i++) {
    str = str.replaceAll(arabicEastern[i], String(i)).replaceAll(persian[i], String(i));
  }
  // Replace Arabic decimal mark '٫' (U+066B) and Arabic comma '،' (U+060C) with standard period '.'
  return str.replace(/[٫،]/g, '.');
}

function parseNormalizedNumber(val, defaultVal = 0) {
  if (val === null || val === undefined || val === '') return defaultVal;
  const normalized = normalizeNumerals(val).trim();
  const num = Number(normalized);
  return isNaN(num) ? defaultVal : num;
}

function recursivelyNormalizeNumerals(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  for (const key of Object.keys(obj)) {
    const val = obj[key];
    if (typeof val === 'string') {
      // Check if string contains any Arabic-Indic, Persian digits, or decimal marks
      if (/[\u0660-\u0669\u06F0-\u06F9\u066B]/.test(val)) {
        obj[key] = normalizeNumerals(val);
      }
    } else if (typeof val === 'object' && val !== null) {
      recursivelyNormalizeNumerals(val);
    }
  }
  return obj;
}

function numeralsMiddleware(req, res, next) {
  if (req.body && typeof req.body === 'object') {
    recursivelyNormalizeNumerals(req.body);
  }
  if (req.query && typeof req.query === 'object') {
    recursivelyNormalizeNumerals(req.query);
  }
  if (req.params && typeof req.params === 'object') {
    recursivelyNormalizeNumerals(req.params);
  }
  next();
}

module.exports = {
  normalizeNumerals,
  parseNormalizedNumber,
  recursivelyNormalizeNumerals,
  numeralsMiddleware
};
