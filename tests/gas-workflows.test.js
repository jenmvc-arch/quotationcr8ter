'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function harness() {
  let id = 0;
  const requests = new Map();
  const invoice = {
    workspace_id: 'workspace-1', id: 'invoice-1', type: 'invoice', status: 'Issued', document_no: 'INV-2026-0001',
    owner_id: 'finance-1', version: 1, currency: 'MYR', total_minor: 100000, paid_minor: 0, balance_minor: 100000,
    payment_status: 'Unpaid', date: '2026-11-01', client_id: 'client-1', company_snapshot_json: '{}',
    client_snapshot_json: '{}', bank_snapshot_json: '{}',
  };
  const invoiceRecord = { rowNumber: 2, data: invoice };
  const writes = [];
  const context = {
    console,
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) },
    Utilities: {
      getUuid: () => `uuid-${++id}`,
      DigestAlgorithm: { SHA_256: 'SHA_256' },
      Charset: { UTF_8: 'UTF_8' },
      computeDigest: (_algorithm, value) => Array.from(Buffer.from(String(value).padEnd(32, '0').slice(0, 32))),
    },
    getConfig_: () => ({ WORKSPACE_ID: 'workspace-1' }),
    hasRole_: (actor, role) => actor.roles.includes(role),
    apiError_: (code, message, retryable) => Object.assign(new Error(message), { code, retryable }),
    requestResult_: (workspace, requestId, actor, action, payload) => requests.get(requestId) || null,
    recordById_: (name, recordId) => name === 'Documents' && recordId === invoice.id ? invoiceRecord : null,
    canReadRecord_: (actor, record) => actor.id === record.owner_id,
    requireCurrentVersion_: (record, expected) => {
      if (Number(record.data.version) !== Number(expected)) throw Object.assign(new Error('conflict'), { code: 'VERSION_CONFLICT' });
    },
    validDate_: (value) => value,
    rows_: (name) => name === 'Payments' ? [] : [],
    sheetRecords_: () => [],
    safeJson_: () => ({}),
    objectRow_: (_name, value) => value,
    auditRow_: (...values) => values,
    requestRow_: (_config, requestId, _actor, _action, _payload, result) => [requestId, result],
    atomicWrite_: (batch) => {
      writes.push(batch);
      const rows = batch.Requests.appends;
      for (const [requestId, result] of rows) requests.set(requestId, result);
      Object.assign(invoice, batch.Documents.updates[0].values);
    },
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(require.resolve('../src/gas/Services.gs'), 'utf8'), context);
  context.objectRow_ = (_name, value) => value;
  context.requestRow_ = (_config, requestId, _actor, _action, _payload, result) => [requestId, result];
  return { context, invoice, writes };
}

test('records split invoice payments with linked receipts and an idempotent retry', () => {
  const { context, invoice, writes } = harness();
  const actor = { id: 'finance-1', roles: ['Finance'] };
  const first = { requestId: 'pay-1', action: 'payments.record', expectedVersion: 1 };
  const firstPayload = { invoiceId: invoice.id, amountMinor: 30000, currency: 'MYR', paidDate: '2026-11-10', method: 'Bank transfer', reference: 'A-1' };
  const firstResult = context.recordPayment_(actor, first, firstPayload);
  assert.equal(firstResult.amountMinor, 30000);
  assert.equal(firstResult.paymentStatus, 'PartiallyPaid');
  assert.equal(writes[0].Payments.appends[0][8], 'Active');
  assert.equal(writes[0].Documents.appends[0].type, 'receipt');
  assert.equal(writes[0].DocumentLinks.appends[0][4], 'payment_to_receipt');
  assert.equal(context.recordPayment_(actor, first, firstPayload).id, firstResult.id);
  assert.equal(writes.length, 1);

  const second = { requestId: 'pay-2', action: 'payments.record', expectedVersion: 2 };
  const secondPayload = { invoiceId: invoice.id, amountMinor: 70000, currency: 'MYR', paidDate: '2026-12-02', method: 'Bank transfer', reference: 'A-2' };
  const secondResult = context.recordPayment_(actor, second, secondPayload);
  assert.equal(secondResult.paymentStatus, 'Paid');
  assert.equal(invoice.paid_minor, 100000);
  assert.equal(invoice.balance_minor, 0);
  assert.equal(writes[1].Documents.appends[0].document_no, 'RCPT-2026-0001');
});

test('rejects payment over the invoice balance and missing finance role', () => {
  const { context, invoice, writes } = harness();
  const actor = { id: 'finance-1', roles: ['Finance'] };
  const request = { requestId: 'too-much', action: 'payments.record', expectedVersion: 1 };
  assert.throws(() => context.recordPayment_(actor, request, {
    invoiceId: invoice.id, amountMinor: 100001, currency: 'MYR', paidDate: '2026-11-10', method: 'Cash',
  }), /cannot exceed/);
  assert.throws(() => context.recordPayment_({ id: 'viewer', roles: ['Viewer'] }, request, {}), /Finance access is required/);
  assert.equal(writes.length, 0);
});

test('retains the latest document content snapshot across status-only version bumps', () => {
  const { context } = harness();
  const lineRows = [
    { workspace_id: 'workspace-1', document_id: 'invoice-1', version: 1, position: 1, description: 'Original line' },
    { workspace_id: 'workspace-1', document_id: 'invoice-1', version: 2, position: 1, description: 'Edited line' },
    { workspace_id: 'workspace-1', document_id: 'invoice-1', version: 3, position: 1, description: 'Edited line' },
  ];
  context.rows_ = () => lineRows;
  assert.equal(context.documentLines_('workspace-1', 'invoice-1', 5)[0].description, 'Edited line');
  assert.equal(context.documentLines_('workspace-1', 'invoice-1', 1)[0].description, 'Original line');
});

test('normalizes a draft with its tax rate retained for future revisions', () => {
  const { context } = harness();
  const doc = context.normalizeDocument_({
    type: 'invoice', clientId: 'client-1', date: '2026-11-17', currency: 'MYR',
    discountMinor: 0, taxRateScaled: 6000,
    lines: [{ description: 'Work', quantity: 1, unitPriceMinor: 10000 }],
  });
  assert.equal(doc.tax_rate_scaled, 6000);
  assert.equal(doc.tax_minor, 600);
});

test('previews migrations without accepting client-supplied identity', () => {
  const { context } = harness();
  const result = context.migrationPreview_({ id: 'admin-1', roles: ['Admin'] }, {
    sourceDevice: 'old-laptop',
    records: { clients: [{ id: 'legacy-1', name: 'Client' }], items: [], terms: [] },
    actor: 'attacker@example.com',
  });
  assert.equal(result.totalRecords, 1);
  assert.equal(result.counts.clients.count, 1);
  assert.equal(result.ready, true);
  assert.match(result.sourceHash, /^[a-f0-9]{64}$/);
});

test('denies migration preview to non-admin users', () => {
  const { context } = harness();
  assert.throws(() => context.migrationPreview_({ id: 'sales-1', roles: ['SalesOps'] }, { records: {} }), /Administrator access is required/);
});
