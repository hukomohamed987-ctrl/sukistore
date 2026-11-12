/**
 * Shared Strict Single-Owner Isolation Helpers
 * Ensures a product or order item belongs exclusively to either a Merchant, an Investor, or Store direct — NEVER both.
 */

function isInvestorOwned(entity) {
  if (!entity) return false;
  if (entity.ownerType === 'investor') return true;
  if (entity.ownerType === 'merchant') return false;
  return Boolean(entity.investorId || (entity.investorCode && String(entity.investorCode).trim()));
}

function isMerchantOwned(entity) {
  if (!entity) return false;
  if (isInvestorOwned(entity)) return false;
  if (entity.ownerType === 'merchant') return true;
  return Boolean(entity.merchantId || (entity.merchantCode && String(entity.merchantCode).trim()));
}

function getInvestorProducts(allProducts = [], investor) {
  if (!investor) return [];
  const invIdStr = investor.id ? String(investor.id) : '';
  const invCodeUpper = investor.code ? investor.code.trim().toUpperCase() : '';

  return allProducts.filter(p => {
    if (!isInvestorOwned(p)) return false;
    if (p.investorId) {
      return invIdStr && String(p.investorId) === invIdStr;
    }
    return Boolean(invCodeUpper && p.investorCode && p.investorCode.trim().toUpperCase() === invCodeUpper);
  });
}

function getMerchantProducts(allProducts = [], merchant) {
  if (!merchant) return [];
  const mIdStr = merchant.id ? String(merchant.id) : '';
  const mCodeLower = merchant.code ? merchant.code.trim().toLowerCase() : '';
  const mNameLower = merchant.name ? merchant.name.trim().toLowerCase() : '';

  return allProducts.filter(p => {
    if (isInvestorOwned(p)) return false;
    if (p.merchantId) {
      return mIdStr && String(p.merchantId) === mIdStr;
    }
    if (mCodeLower && p.merchantCode && p.merchantCode.trim().toLowerCase() === mCodeLower) return true;
    if (!p.merchantCode && mNameLower && p.merchantName && p.merchantName.trim().toLowerCase() === mNameLower) return true;
    return false;
  });
}

function matchOrderItemToInvestor(item, investor, invProductMap, allProductMap) {
  if (!item || !investor) return null;
  const prodId = String(item.productId || item.id || '');

  if (prodId && invProductMap && invProductMap.has(prodId)) {
    return invProductMap.get(prodId);
  }
  // If product exists in DB under a merchant or another investor, never match
  if (prodId && allProductMap && allProductMap.has(prodId)) {
    return null;
  }
  // Deleted/archived product: credit ONLY if item carries the exact same investorId
  if (item.investorId && investor.id && String(item.investorId) === String(investor.id)) {
    return {
      price: Number(item.price) || 0,
      costPrice: item.costPrice !== undefined ? Number(item.costPrice) : (Number(item.price) || 0)
    };
  }
  return null;
}

function matchOrderItemToMerchant(item, merchant, merchantProductMap, allProductMap) {
  if (!item || !merchant) return null;
  const prodId = String(item.productId || item.id || '');

  if (prodId && merchantProductMap && merchantProductMap.has(prodId)) {
    return merchantProductMap.get(prodId);
  }
  // If product exists in DB under an investor or another owner, never match
  if (prodId && allProductMap && allProductMap.has(prodId)) {
    return null;
  }
  // Archived product: exclude investor items strictly
  if (isInvestorOwned(item)) return null;

  if (item.merchantId && merchant.id) {
    return String(item.merchantId) === String(merchant.id) ? item : null;
  }
  if (item.merchantCode && merchant.code && item.merchantCode.trim().toLowerCase() === merchant.code.trim().toLowerCase()) {
    return item;
  }
  return null;
}

module.exports = {
  isInvestorOwned,
  isMerchantOwned,
  getInvestorProducts,
  getMerchantProducts,
  matchOrderItemToInvestor,
  matchOrderItemToMerchant
};
