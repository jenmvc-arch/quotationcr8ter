# QuotationCr8ter

QuotationCr8ter is a local-first quotation and invoice prototype being migrated to Google Apps Script, Sheets, and private Drive storage. The Vercel-era browser application remains available as a local demo while the Apps Script workspace is being implemented.

## Local demo

Requires Node 22 LTS or newer within the range in `package.json`.

```sh
npm ci
npm run dev
```

Open the printed `http://127.0.0.1:4173` address. The local demo banner is explicit: records stay in that browser's local storage, and there is no shared database. Run `npm test`, `npm run build`, `npm run build:gas`, and `npm run doctor` for checks and generated output.

## Apps Script status

`deploy/gas/` contains a generated HtmlService staging package. It includes protected document, payment, receipt, master-data, administration, jobs, migration, backup-manifest, and private Drive file workflows. It must not be deployed against production data until the isolated staging identity, Sheets atomicity, Drive access, and PDF checks pass.

Read [docs/PROGRESS.md](docs/PROGRESS.md), [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md), [docs/MIGRATION.md](docs/MIGRATION.md), and [docs/IDENTITY_DECISION.md](docs/IDENTITY_DECISION.md) before staging work. No actual Script ID, Spreadsheet ID, Drive folder, allowed domain, or test account is stored in this repository. Never commit `.env`, `.clasp.json`, `.clasprc.json`, credentials, or exported customer data.
