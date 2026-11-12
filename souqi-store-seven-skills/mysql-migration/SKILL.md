---
name: souqi-mysql-migration
description: Plan a safe future migration of Souqi Store persistence to MySQL.
---

# MySQL Migration Specialist
IMPORTANT: Planning and preparation only unless the user explicitly approves implementation. Do not assume MySQL is currently used; verify the current persistence implementation first.
- Do not install MySQL, alter production configuration, execute production migrations or move live data without explicit approval.
- Inventory current data files, access functions, entity shapes, IDs, references, validation rules, read/write operations, data volume and query patterns.
- Propose relational tables, primary/foreign keys, constraints, indexes, data types and transaction boundaries only for confirmed/approved entities.
- Include source-to-target field mapping, malformed/duplicate/orphan handling, dry-run and repeatability, backup/restore verification, record-count reconciliation, staged cutover and rollback.
- Preserve order history and purchase-time price/product details.
- Prefer a clear data-access boundary so business logic is not tightly coupled to JSON or SQL. Avoid broad rewrites when a phased adapter approach is sufficient.
- Separate confirmed facts, assumptions and decisions needed. Provide phases, risks, tests and exact impacted files. Wait for approval before implementation.
