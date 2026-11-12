/**
 * Loyalty points & milestone coupons — one place for the settings and their defaults.
 * Every screen and calculation reads the settings through loyaltySettings(), so a value saved in the
 * dashboard (including 0 where allowed) is used everywhere the same way.
 */
const LOYALTY_FIELDS = {
  loyaltySpendPerReward:         { label: 'مبلغ المشتريات اللي بيدّي نقاط', def: 1000, min: 1, max: 1000000 },
  loyaltyPointsPerReward:        { label: 'عدد النقاط لكل مبلغ', def: 50, min: 0, max: 100000, integer: true },
  loyaltyPointValueEgp:          { label: 'قيمة النقطة بالجنيه', def: 1, min: 0.01, max: 1000 },
  loyaltyMinRedemptionThreshold: { label: 'أقل رصيد نقاط للاستخدام', def: 500, min: 0, max: 10000000, integer: true },
  loyaltyMaxRedemptionPercent:   { label: 'أقصى نسبة خصم بالنقاط من الطلب', def: 10, min: 1, max: 99 },
  milestoneDiscountPercent:      { label: 'نسبة خصم كوبون المكافأة', def: 10, min: 1, max: 100 }
};

const num = (v, def) => {
  if (v === undefined || v === null || v === '') return def;
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
};

function loyaltySettings(settings = {}) {
  const s = settings || {};
  const out = {
    loyaltyEnabled: s.loyaltyEnabled !== false,
    milestoneCouponsEnabled: s.milestoneCouponsEnabled !== false,
    milestoneThresholds: Array.isArray(s.milestoneThresholds) && s.milestoneThresholds.length ? s.milestoneThresholds.map(Number) : [3000, 5000]
  };
  for (const [key, def] of Object.entries(LOYALTY_FIELDS)) {
    const v = num(s[key], def.def);
    out[key] = v < def.min || v > def.max ? def.def : v;
  }
  return out;
}

/** Points a delivered order earns: floor(items subtotal / spend) × points */
function pointsForSubtotal(subtotal, settings) {
  const s = loyaltySettings(settings);
  if (!s.loyaltyEnabled) return 0;
  return Math.floor((Number(subtotal) || 0) / s.loyaltySpendPerReward) * s.loyaltyPointsPerReward;
}

module.exports = { LOYALTY_FIELDS, loyaltySettings, pointsForSubtotal };
