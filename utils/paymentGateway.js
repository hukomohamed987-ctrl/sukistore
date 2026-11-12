/**
 * Payment gateway adapter (placeholder until a real gateway is connected).
 *
 * To connect a gateway later (Paymob, Fawry, Kashier, ...):
 *   1. Put its keys in .env, e.g. PAYMENT_GATEWAY=paymob, PAYMOB_API_KEY=..., PAYMOB_INTEGRATION_ID=...
 *   2. Implement createPayment() to return a checkout URL for the order.
 *   3. Add a webhook route that verifies the gateway signature and then marks the
 *      order paymentStatus = 'paid'. NEVER mark an order paid from the browser.
 */

function getGatewayStatus() {
  const provider = (process.env.PAYMENT_GATEWAY || '').trim().toLowerCase();
  // A provider counts as connected only when its adapter is implemented below.
  const implemented = {}; // e.g. { paymob: true } once createPayment supports it
  return {
    provider,
    connected: Boolean(provider && implemented[provider])
  };
}

// Returns { redirectUrl } when a gateway is connected, or { notConnected: true }.
async function createPayment(order) {
  const status = getGatewayStatus();
  if (!status.connected) return { notConnected: true };
  // Gateway-specific implementation goes here.
  return { notConnected: true };
}

module.exports = { getGatewayStatus, createPayment };
