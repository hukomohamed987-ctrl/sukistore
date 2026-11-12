/**
 * Per-option stock / price ("variants").
 *
 * A product may carry   variants: [{ id, options: { "المقاس": "L", "اللون": "أحمر" }, stock, price?, sku? }]
 * When a product has variants, its own `stock` is always the SUM of the variants' stock,
 * and the price of an order line is the variant price (or the product price when empty).
 */
const { v4: uuidv4 } = require('uuid');

const norm = v => String(v === undefined || v === null ? '' : v).trim();

function hasVariants(product) {
  return Boolean(product && Array.isArray(product.variants) && product.variants.length > 0);
}

// Find the variant whose options all match the customer's selection
function findVariant(product, selectedOptions = {}) {
  if (!hasVariants(product)) return null;
  const sel = selectedOptions && typeof selectedOptions === 'object' ? selectedOptions : {};
  return product.variants.find(v => {
    const opts = v.options || {};
    const keys = Object.keys(opts);
    return keys.length > 0 && keys.every(k => norm(sel[k]) === norm(opts[k]));
  }) || null;
}

function variantLabel(variant) {
  if (!variant || !variant.options) return '';
  return Object.entries(variant.options).map(([k, v]) => `${k}: ${v}`).join(' / ');
}

function sumVariantStock(variants) {
  return (variants || []).reduce((s, v) => s + Math.max(0, Number(v.stock) || 0), 0);
}

/**
 * Clean variants coming from the dashboard. Returns { variants, error }.
 * Rows without options are dropped; numbers are validated.
 */
function sanitizeVariants(input) {
  if (input === undefined) return { variants: undefined, error: null };
  if (!Array.isArray(input)) return { variants: [], error: null };
  const out = [];
  const seen = new Set();
  for (const raw of input) {
    if (!raw || typeof raw !== 'object') continue;
    const options = {};
    Object.entries(raw.options || {}).forEach(([k, v]) => {
      const key = norm(k), val = norm(v);
      if (key && val) options[key] = val;
    });
    if (!Object.keys(options).length) continue;
    const signature = JSON.stringify(Object.keys(options).sort().map(k => [k, options[k]]));
    if (seen.has(signature)) return { variants: null, error: `الاختيار (${variantLabel({ options })}) متكرر` };
    seen.add(signature);
    const stock = Number(raw.stock);
    if (!Number.isFinite(stock) || stock < 0) return { variants: null, error: `مخزون (${variantLabel({ options })}) لازم يكون صفر أو أكثر` };
    let price = null;
    if (raw.price !== undefined && raw.price !== null && String(raw.price).trim() !== '') {
      price = Number(raw.price);
      if (!Number.isFinite(price) || price <= 0) return { variants: null, error: `سعر (${variantLabel({ options })}) لازم يكون أكبر من صفر` };
    }
    out.push({
      id: raw.id || uuidv4(),
      options,
      stock: Math.floor(stock),
      price,
      sku: norm(raw.sku).slice(0, 64)
    });
  }
  return { variants: out, error: null };
}

/** Build product updates that change stock of one variant (or of the product) by `delta`. */
function stockChange(product, variantId, delta) {
  if (hasVariants(product) && variantId) {
    const variants = product.variants.map(v => v.id === variantId
      ? { ...v, stock: Math.max(0, (Number(v.stock) || 0) + delta) }
      : v);
    return { variants, stock: sumVariantStock(variants) };
  }
  return { stock: Math.max(0, (Number(product.stock) || 0) + delta) };
}

function availableStock(product, variantId) {
  if (hasVariants(product) && variantId) {
    const v = product.variants.find(x => x.id === variantId);
    return v ? Math.max(0, Number(v.stock) || 0) : 0;
  }
  return typeof product.stock === 'number' ? product.stock : (parseInt(product.stock, 10) || 0);
}

module.exports = { hasVariants, findVariant, variantLabel, sumVariantStock, sanitizeVariants, stockChange, availableStock };
