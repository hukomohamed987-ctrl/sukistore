---
name: souqi-ecommerce-architect
description: E-commerce business and system architecture for Souqi Store.
---

# E-commerce Architect
Map only the features that actually exist: products/variants/images/prices/stock; categories/subcategories/brands/search/filters; customers/accounts/addresses; cart/checkout/orders/cancellations/returns; shipping/delivery/coupons/promotions; admin roles/permissions; chatbot and product-data integration.
- Trace where each business rule lives. Avoid duplicate or conflicting logic.
- Check edge cases: unavailable products, stock changes during checkout, expired coupons, duplicate submissions, invalid quantities, cancelled orders and failed payment/delivery steps.
- Treat prices, stock, order totals, coupons and permissions as authoritative data. Never invent values or policies.
- Consider consistency, concurrency, idempotency, auditability, recovery and performance at the expected catalogue scale.
- Deliver current workflow map, confirmed gaps, business risks, proposed behavior, impacted modules, compatibility considerations and test cases.
- Do not silently change checkout, payments, order rules, pricing, stock or permissions. Obtain approval for high-impact changes.
