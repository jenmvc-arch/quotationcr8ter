# Migration Runbook

Migration is intentionally two-step: export from each old browser origin, then preview and commit in an isolated Apps Script staging workspace.

## Export from an old computer

Run this in the old application's exact origin. It exports only the approved business keys and never exports passwords, auth/session state, API keys, or the sync queue.

```js
(() => {
  const keys = ['docs', 'clients', 'items', 'terms', 'profile'];
  const result = Object.fromEntries(keys.map((key) => {
    try { return [key, JSON.parse(localStorage.getItem(key) || 'null')]; }
    catch (_) { return [key, null]; }
  }));
  const envelope = {
    sourceDevice: `${navigator.platform}-${new Date().toISOString()}`,
    exportedAt: new Date().toISOString(),
    records: result,
  };
  const blob = new Blob([JSON.stringify(envelope, null, 2)], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `quotationcr8ter-export-${Date.now()}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
})();
```

Review the JSON manually. Legacy deposits without a verified payment date must remain historical notes; do not import them as paid payments.

## Staging review

1. Keep one export file per old computer and preserve the original files unchanged.
2. Call `migration.preview` with `{sourceDevice, records}` as an Admin.
3. Review the returned SHA-256, counts, and duplicate warnings.
4. Commit only after the preview is approved. Production commits are rejected by the server until an explicit production migration policy is added.
5. Repeating the same source hash is idempotent and returns the existing migration record.

The current commit path imports clients, items, and terms only. Documents, payments, and receipts require a reviewed mapping because the old browser store may not contain authoritative payment dates or approval history.
