const db = require('../database/db');

async function logActivity({ userId, userName, userRole, action, module, details, metadata = {} }) {
  try {
    return await db.activity_logs.insert({
      userId: userId || 'system',
      userName: userName || 'النظام',
      userRole: userRole || 'staff',
      action, // e.g. "CREATE_PRODUCT", "UPDATE_ORDER", "LOCK_CUSTOMER"
      module, // "products", "categories", "orders", "customers", "banners", "coupons"
      details,
      metadata,
      createdAt: new Date().toISOString()
    });
  } catch (err) {
    console.error('Failed to log staff activity:', err);
    return null;
  }
}

module.exports = { logActivity };
