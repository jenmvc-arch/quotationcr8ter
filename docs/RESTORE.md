# Restore and Recovery

There is no production data in this implementation and no backup job has been validated in Google. The server now creates a restricted backup manifest in `BACKUP_ROOT_ID`, but a real restore drill is still required. Do not use the staging setup against an existing business Spreadsheet.

Future backups must be written to a separately restricted backup root and include schema version, row counts, currency-separated totals, file IDs, content hashes, and a completed status. Restore must target a new Spreadsheet and Drive location, verify counts and hashes, and require a maintainer to switch configuration manually. Never restore over production in place. A code rollback does not undo payments or other business records.

Recovery objectives are not set. No recovery point or recovery time guarantee is made until a real staging drill is measured and recorded.
