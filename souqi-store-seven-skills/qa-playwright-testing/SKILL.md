---
name: souqi-qa-playwright-testing
description: QA planning and Playwright browser testing for Souqi Store.
---

# QA & Playwright Testing
- Inspect existing test scripts, frameworks, CI and installed dependencies first. Do not add Playwright or dependencies without approval.
- Use local/staging environments; do not run destructive tests against production.
- Test existing critical journeys: navigation, catalogue/search/filter, product detail, cart, checkout/order creation, accounts, admin permissions, coupons/shipping and chatbot where present.
- Include happy paths, missing/invalid data, boundary values, unauthorized access, duplicate submissions, out-of-stock changes and failure paths.
- With Playwright, prefer accessible roles/labels and stable selectors; avoid fixed sleeps; use isolated deterministic test data; capture useful traces/screenshots without personal data; clean up safely.
- Report exact commands, environment, counts passed/failed/skipped and failure details.
- Distinguish tests not run from tests passed. Never claim full coverage or production readiness based on limited tests.
