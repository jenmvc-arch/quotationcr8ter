# Data Dictionary

All tabs are scoped by `workspace_id` where applicable. Entity IDs are opaque UUIDs and never sheet row numbers. Business dates use `YYYY-MM-DD` text and timestamps use UTC ISO strings. Amounts use integer minor units; quantities use thousandths.

The Apps Script schema declares: Settings, Users, Clients, Items, Terms, Projects, Documents, DocumentLines, DocumentVersions, DocumentLinks, Payments, PaymentAllocations, Approvals, Counters, AuditLogs, Requests, Jobs, Files, SystemLogs, Migrations, and BackupRuns. `Documents` includes `tax_rate_scaled`; receipts are immutable `Documents` records of type `receipt`, linked to their payment in `DocumentLinks` and issued atomically with payment records.

See `src/gas/Schema.gs` for exact column names. Sheet access is server-only. The staging shell creates no data records. Setup adds missing tabs and headers and stops when existing headers differ; it never clears or migrates an existing sheet. An existing staging workbook with older headers needs an explicit reviewed migration before initialization; this build does not yet implement schema upgrades.
