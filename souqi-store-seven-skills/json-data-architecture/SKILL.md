---
name: souqi-json-data-architecture
description: Safe JSON-file persistence, validation, backups and data integrity for Souqi Store.
---

# JSON Data Architecture
- Verify the actual storage implementation by inspecting data-access code and data files. Do not assume JSON is still in use.
- Reuse the existing data-access layer; do not create a competing persistence system.
- Identify schemas, IDs, references, readers, writers and mutation paths.
- Validate structure and required fields; detect malformed files, duplicate IDs, missing references and inconsistent records.
- Protect against partial writes, concurrent writes and lost updates. Use atomic-write patterns where appropriate.
- Preserve IDs, field names, relationships and backward compatibility unless an approved migration requires change.
- Before bulk transformations, create and verify a timestamped backup; record counts and representative samples before/after.
- Provide dry-run and rollback plans. Never bulk-edit production data without explicit approval.
- Keep customer data and secrets out of logs. Report inspected files, confirmed issues, tests, backup status and uncertainty.
