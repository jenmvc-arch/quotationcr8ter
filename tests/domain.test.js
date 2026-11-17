'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeDraft, normalizePayment, assertTransition } = require('../src/shared/domain');

function draft(overrides = {}) {
  return normalizeDraft({
    type: 'invoice', clientId: 'client-1', date: '2026-11-17', dueDate: '2026-12-17', currency: 'MYR',
    lines: [{ description: 'Model fabrication', quantity: 1, unitPrice: 1000, unit: 'lot' }],
    discount: 0, taxRate: 0, ...overrides,
  });
}

test('stores money as minor units and recalculates totals', () => {
  const value = draft({ lines: [
    { description: 'A', quantity: 1, unitPrice: 400 },
    { description: 'B', quantity: 1.5, unitPrice: 400 },
  ], discount: 100, taxRate: 6 });
  assert.equal(value.subtotalMinor, 100000);
  assert.equal(value.discountMinor, 10000);
  assert.equal(value.taxMinor, 5400);
  assert.equal(value.totalMinor, 95400);
});

test('rejects negative values, unsupported currencies, invalid dates and overpayments', () => {
  assert.throws(() => draft({ lines: [{ description: 'A', quantity: -1, unitPrice: 1 }] }), /outside the allowed range/);
  assert.throws(() => draft({ lines: [{ description: 'A', quantity: 1, unitPrice: -1 }] }), /outside the allowed range/);
  assert.throws(() => draft({ currency: 'JPY' }), /Currency is not supported/);
  assert.throws(() => draft({ date: '2026-02-30' }), /not a valid date/);
  const invoice = { type: 'invoice', status: 'Issued', currency: 'MYR', totalMinor: 100000, paidMinor: 30000 };
  assert.throws(() => normalizePayment({ amount: 701, currency: 'MYR', paidDate: '2026-11-17', method: 'Transfer' }, invoice), /cannot exceed/);
});

test('keeps quotation issue gated by approval role', () => {
  assert.throws(() => assertTransition('quotation', 'Draft', 'Issued', ['SalesOps']), /approver/);
  assert.equal(assertTransition('quotation', 'Approved', 'Issued', ['Approver']), true);
});

test('rejects unsafe amount intermediates', () => {
  assert.throws(() => draft({ lines: [{ description: 'A', quantity: 900000, unitPrice: 90000000 }] }), /outside the allowed range/);
});
