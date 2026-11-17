'use strict';

const CURRENCIES = new Set(['MYR', 'SGD', 'USD', 'EUR', 'GBP', 'CNY']);
const DOCUMENT_TYPES = new Set(['quotation', 'proforma', 'invoice', 'receipt']);
const LIMITS = Object.freeze({ lines: 100, description: 2000, text: 10000, quantityScaled: 999999999, moneyMinor: 999999999999 });
const STATES = Object.freeze({
  quotation: new Set(['Draft', 'PendingApproval', 'Approved', 'Issued', 'Void', 'Archived']),
  proforma: new Set(['Draft', 'Issued', 'Void', 'Archived']),
  invoice: new Set(['Draft', 'Issued', 'Void', 'Archived']),
  receipt: new Set(['Issued', 'Void', 'Archived']),
});

function fail(message, code = 'VALIDATION_ERROR') {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function safeText(value, name, max = LIMITS.text, required = false) {
  if (typeof value !== 'string') fail(`${name} must be text.`);
  const clean = value.trim();
  if (required && !clean) fail(`${name} is required.`);
  if (clean.length > max) fail(`${name} is too long.`);
  return clean;
}

function decimalScaled(value, scale, name, minimum, maximum) {
  const text = String(value == null ? '' : value).trim();
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(text);
  if (!match) fail(`${name} must be a finite decimal number.`);
  const scaleDigits = String(scale).length - 1;
  const fraction = match[3] || '';
  if (fraction.length > scaleDigits) fail(`${name} has too many decimal places.`);
  const magnitude = BigInt(match[2] + fraction.padEnd(scaleDigits, '0'));
  const signed = match[1] ? -magnitude : magnitude;
  const scaled = Number(signed);
  if (!Number.isSafeInteger(scaled) || scaled < minimum || scaled > maximum) fail(`${name} is outside the allowed range.`);
  return scaled;
}

function parseDate(value, name) {
  const text = safeText(value, name, 10, true);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) fail(`${name} must use YYYY-MM-DD.`);
  const date = new Date(`${text}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== text) fail(`${name} is not a valid date.`);
  return text;
}

function moneyMinor(value, name, required = false) {
  return decimalScaled(value == null && !required ? 0 : value, 100, name, 0, LIMITS.moneyMinor);
}

function normalizeLine(line, index, currency) {
  if (!line || typeof line !== 'object' || Array.isArray(line)) fail(`Line ${index + 1} is invalid.`);
  const quantityScaled = decimalScaled(line.quantity, 1000, `Line ${index + 1} quantity`, 1, LIMITS.quantityScaled);
  const unitPriceMinor = moneyMinor(line.unitPrice, `Line ${index + 1} unit price`, true);
  const rawLineMinor = quantityScaled * unitPriceMinor;
  if (!Number.isSafeInteger(rawLineMinor)) fail(`Line ${index + 1} total is outside the allowed range.`);
  const lineMinor = Math.floor((rawLineMinor + 500) / 1000);
  if (!Number.isSafeInteger(lineMinor) || lineMinor > LIMITS.moneyMinor) fail(`Line ${index + 1} total is outside the allowed range.`);
  return {
    id: safeText(line.id || '', `Line ${index + 1} ID`, 80),
    position: index + 1,
    description: safeText(line.description, `Line ${index + 1} description`, LIMITS.description, true),
    quantityScaled,
    quantityScale: 1000,
    unit: safeText(line.unit || 'unit', `Line ${index + 1} unit`, 40, true),
    unitPriceMinor,
    lineTotalMinor: lineMinor,
    currency,
  };
}

function normalizeDraft(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail('Document payload is invalid.');
  const type = safeText(input.type, 'Document type', 20, true);
  if (!DOCUMENT_TYPES.has(type)) fail('Document type is not supported.');
  const currency = safeText(input.currency || 'MYR', 'Currency', 3, true).toUpperCase();
  if (!CURRENCIES.has(currency)) fail('Currency is not supported.');
  if (!Array.isArray(input.lines) || input.lines.length < 1 || input.lines.length > LIMITS.lines) fail(`A document must have 1 to ${LIMITS.lines} lines.`);
  const lines = input.lines.map((line, index) => normalizeLine(line, index, currency));
  const subtotalMinor = lines.reduce((total, line) => total + line.lineTotalMinor, 0);
  if (!Number.isSafeInteger(subtotalMinor) || subtotalMinor > LIMITS.moneyMinor) fail('Subtotal is outside the allowed range.');
  const discountMinor = moneyMinor(input.discount, 'Discount');
  if (discountMinor > subtotalMinor) fail('Discount cannot exceed subtotal.');
  const taxRateScaled = decimalScaled(input.taxRate == null ? 0 : input.taxRate, 1000, 'Tax rate', 0, 100000);
  const taxableMinor = subtotalMinor - discountMinor;
  const rawTaxMinor = taxableMinor * taxRateScaled;
  if (!Number.isSafeInteger(rawTaxMinor)) fail('Tax calculation is outside the allowed range.');
  const taxMinor = Math.floor((rawTaxMinor + 50000) / 100000);
  const totalMinor = taxableMinor + taxMinor;
  return {
    id: safeText(input.id || '', 'Document ID', 80),
    type,
    status: 'Draft',
    clientId: safeText(input.clientId, 'Client', 80, true),
    projectId: safeText(input.projectId || '', 'Project', 80),
    ownerId: safeText(input.ownerId || '', 'Owner', 80),
    date: parseDate(input.date, 'Document date'),
    dueDate: input.dueDate ? parseDate(input.dueDate, 'Due date') : '',
    currency,
    lines,
    subtotalMinor,
    discountMinor,
    taxRateScaled,
    taxMinor,
    totalMinor,
    paidMinor: 0,
    balanceMinor: totalMinor,
    notes: safeText(input.notes || '', 'Notes'),
    terms: safeText(input.terms || '', 'Terms'),
  };
}

function normalizePayment(input, invoice) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail('Payment payload is invalid.');
  if (!invoice || invoice.type !== 'invoice' || invoice.status !== 'Issued') fail('Payments require an issued invoice.');
  const amountMinor = moneyMinor(input.amount, 'Payment amount', true);
  if (amountMinor < 1) fail('Payment amount must be greater than zero.');
  if (input.currency !== invoice.currency) fail('Payment currency must match the invoice.');
  const remaining = invoice.totalMinor - invoice.paidMinor;
  if (amountMinor > remaining) fail('Payment cannot exceed the remaining invoice balance.');
  return {
    amountMinor,
    currency: invoice.currency,
    paidDate: parseDate(input.paidDate, 'Payment date'),
    method: safeText(input.method, 'Payment method', 80, true),
    reference: safeText(input.reference || '', 'Payment reference', 200),
  };
}

function assertTransition(type, from, to, actorRoles) {
  const valid = STATES[type];
  if (!valid || !valid.has(from) || !valid.has(to)) fail('Document state is invalid.');
  const transitions = {
    Draft: ['PendingApproval', 'Issued'],
    PendingApproval: ['Approved', 'Draft'],
    Approved: ['Issued', 'Draft'],
    Issued: ['Void', 'Archived'],
    Void: ['Archived'],
    Archived: [],
  };
  if (!transitions[from].includes(to)) fail(`Cannot move ${type} from ${from} to ${to}.`, 'INVALID_TRANSITION');
  if (type === 'quotation' && to === 'Issued' && !(actorRoles || []).includes('Admin') && !(actorRoles || []).includes('Approver')) fail('Only an approver can issue an approved quotation.', 'FORBIDDEN');
  return true;
}

module.exports = { CURRENCIES, DOCUMENT_TYPES, LIMITS, normalizeDraft, normalizePayment, assertTransition, decimalScaled, moneyMinor };
