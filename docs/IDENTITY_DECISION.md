# Identity Decision

The intended production model is a single Google Workspace domain. A Web App runs as the maintainer, while each request is authorized from `Session.getActiveUser().getEmail()` and an active `Users` row. The server ignores browser-supplied email, user ID, and role values. `getEffectiveUser()` is not used as the caller identity.

The actual Workspace domain and account types have not been confirmed. Staging currently uses `gmail.com` only because the available maintainer is `hr.ysydsdnbhd@gmail.com`; this is a temporary test setting, not a production identity policy. Apps Script may return an empty active-user email depending on deployment and account policy. Production must remain blocked until the owner plus two non-owner members, a non-member, and the empty-email case have been tested. Empty or unrecognized identity is denied.

The maintainer-only editor smoke test passed. The deployed `/exec` and `/dev` URLs returned Google's generic “Page not found” page in the Codex in-app browser, so the active-user behavior has not yet been observed through the Web App. The next check must use the deployment owner's normal Chrome session and record the exact execution identity and access setting.

If the business uses personal Gmail accounts or multiple domains, stop before production setup. Decide on a separately reviewed identity gateway that verifies Google credentials server-side; decoding an unverified token is not authentication. The data store remains Sheets and Drive unless the user makes a separate architecture decision.
