# Test Report

Environment: Node `v25.8.2` on 2026-11-17. The requested baseline target is Node 22 LTS; verify there before deployment.

Local checks cover assistant parsing, deterministic integer-money calculations, basic input validation, overpayment rejection, quotation issue role gating, a mocked 300 + 700 MYR payment split with two linked receipts, and request retry reuse. The payment harness checks the batch shape but does not validate real Sheets atomicity. Tests do not validate Google identity, Apps Script quotas, Drive permissions, real PDF rendering, or multi-user concurrency.

`npm test` passes 11 tests. `npm run build`, `npm run build:gas`, `npm run doctor`, Apps Script V8 syntax parsing, and `git diff --check` pass. The Apps Script project was authorized and `initializeWorkspace_` plus a maintainer smoke test completed successfully in the editor. `npm run test:integration` remains a deliberate skip because authenticated browser integration is not implemented. The deployed `/exec` and `/dev` URLs returned Google's generic “Page not found” page in the Codex in-app browser; this is recorded as an unresolved deployment/account-routing issue, not a passing endpoint test. No Google multi-user, Drive, PDF, or production checks are reported as passed.
