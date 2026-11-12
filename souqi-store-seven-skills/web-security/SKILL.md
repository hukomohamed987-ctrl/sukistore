---
name: souqi-web-security
description: Defensive application security review for Souqi Store.
---

# Web Security
Review authentication/password handling; authorization and object-level access; input validation and injection risks; XSS/output encoding; CSRF where relevant; session/token/cookie security; CORS and security headers; rate limiting; file uploads/path traversal; secrets/debug endpoints/logging; dependency vulnerabilities.
- Confirm authorized local/staging target. Never conduct destructive tests on production.
- Use synthetic data and non-sensitive test accounts. Never expose credentials, tokens or customer data.
- Do not disable controls to make tests pass.
- For each finding report severity, impact, affected file/endpoint, evidence, confirmed vs suspected status, minimal remediation and regression test.
- Obtain explicit approval before changing authentication, authorization, payments, checkout, deployment or production configuration.
- Do not claim the site is secure after a limited review.
