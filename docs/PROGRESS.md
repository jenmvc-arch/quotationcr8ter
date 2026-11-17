# Implementation Progress

Baseline: `621e282392c9fa8c4a0d79b9b9031447d36f47c4` on 2026-11-17, Node `v25.8.2`. Work is on `feat/apps-script-internal-system`. Existing uncommitted changes were preserved.

## Phase 0: Baseline and Safety

- [x] Record repository, branch, commit, and runtime; no project `AGENTS.md` found.
- [x] Add npm scripts, Node version file, local demo server, build, tests, doctor, and configuration template.
- [x] Add a visible local demo indicator and disable legacy browser Google/AI requests and browser API-key storage.
- [x] Correct local regressions for member permission saves, company profile overwrite, type conversion links, receipt amounts, collection month totals, and full sync queue handling.
- [ ] Configure a supported Node 22 LTS runtime on another machine and verify `npm ci` there.

## Phase 1: Google Technical Validation

- [x] Add HtmlService staging shell, `google.script.run` access check, manifest, server API envelope, deny-by-default identity checks, and role/scope filtering.
- [x] Add schema declarations, additive setup routine, ScriptLock use, Sheets Advanced Service atomic append helper, and a basic idempotent client-create path.
- [x] Add local mocked coverage for atomic split payments, receipt linkage, amount limits, and idempotent retry.
- [ ] Verify active-user email for deployment owner, two allowed members, a non-member, and unavailable identity in isolated staging. The maintainer-only smoke test passed; the Web App URL currently returns Google's generic `Page not found` page in the Codex browser, so multi-identity verification is blocked on account/deployment routing.
- [ ] Verify private Drive file operations and real PDF rendering in staging.
- [ ] Verify Sheets batch atomicity and idempotency under retries in staging.

The real staging checks are not run. No Google IDs, allowed domain, or test users were supplied. Document writes remain disabled in the GAS staging shell until schema and identity validation.

## Phases 2-4: Shared Workflows and Operations

- [x] Implement protected server contracts for shared records, approval and issue workflow, payments, receipts, master data, users/settings, jobs, migration preview/commit, backup manifests, and private Drive file indexing/upload/download. Real Google execution remains unverified.
- [ ] Replace the local-storage interface with the authorized Apps Script transport.
- [ ] Validate responsive screens, keyboard flow, PDF output, and recovery in a staging environment.

## Phase 5: Migration and Handoff

- [x] Build old-origin export, migration dry-run, reviewed import, and rollback documentation. The current commit path imports clients, items, and terms only; documents and payments remain review-only.
- [x] Add configuration, identity, schema, deployment, recovery, and test evidence documents.
- [ ] Complete staging deployment and two-user acceptance.

## Current staging facts (2026-11-17)

- Apps Script project `Quotation Create API` contains the generated package and has been authorized.
- Existing Spreadsheet and Drive folder are being used as temporary staging resources by explicit user instruction; no legacy business rows were imported or overwritten.
- Script Properties are configured for `APP_ENV=staging`, workspace `quotation-create-staging`, `ALLOWED_DOMAIN=gmail.com`, bootstrap admin `hr.ysydsdnbhd@gmail.com`, schema version `1`, and `AI_ENABLED=false`.
- `initializeWorkspace_` completed successfully and the maintainer smoke test returned the expected Admin identity.
- A staging Web App deployment was created, but both `/exec` and `/dev` return Google's generic “Page not found” page in the current in-app browser. Treat the endpoint as unverified until opened in the deployment owner's normal Chrome session.

No real data was imported, no production Apps Script was edited, and no Drive sharing was changed. Remaining blockers are account/deployment routing, two-user identity tests, real Sheets retry atomicity, private Drive/PDF checks, backup/recovery rehearsal, and switching the full editor UI to the authorized Apps Script transport.
