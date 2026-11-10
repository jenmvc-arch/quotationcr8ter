'use strict';

/*
 * Browser-to-Google-Apps-Script bridge.
 *
 * This file does not transmit anything automatically. Configure the Apps Script
 * web-app URL, then call GoogleSync.saveDocument(document) from a Save action.
 * The document is expected to be a Store record (id/no/status/snapshot) or the
 * editor state itself. Failed requests remain in a local retry queue.
 */
const GoogleSync = (() => {
  const CONFIG_KEY = 'ig.googleSync.config.v1';
  const QUEUE_KEY = 'ig.googleSync.queue.v1';
  const DEFAULT_CONFIG = { endpoint: 'https://script.google.com/macros/s/AKfycbyc3y-pUYNlvAaTm-KSQSbjEAer5sEc4tMtHfZ8P2-4ToAU2YfSUgXwbOzeiZ6i3as6/exec', enabled: true, timeoutMs: 20000 };

  const read = (key, fallback) => {
    try {
      const value = JSON.parse(localStorage.getItem(key));
      return value == null ? fallback : value;
    } catch (_) { return fallback; }
  };
  const write = (key, value) => {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; }
    catch (_) { return false; }
  };
  const clean = value => String(value == null ? '' : value).trim();
  const number = value => {
    const n = Number(String(value == null ? '' : value).replace(/,/g, ''));
    return Number.isFinite(n) ? n : 0;
  };
  const round2 = value => Math.round((number(value) + Number.EPSILON) * 100) / 100;

  function config() { return Object.assign({}, DEFAULT_CONFIG, read(CONFIG_KEY, {})); }
  function saveConfig(values) {
    const next = Object.assign({}, DEFAULT_CONFIG, values || {});
    next.endpoint = clean(next.endpoint);
    next.enabled = Boolean(next.enabled && next.endpoint);
    next.timeoutMs = Math.max(5000, Number(next.timeoutMs) || DEFAULT_CONFIG.timeoutMs);
    write(CONFIG_KEY, next);
    return Object.assign({}, next);
  }
  function queue() { return read(QUEUE_KEY, []); }
  function setQueue(items) { return write(QUEUE_KEY, items.slice(0, 100)); }

  function splitDescription(value) {
    const lines = clean(value).split(/\r?\n/).map(clean).filter(Boolean);
    return { description: lines.shift() || '', scopeRemarks: lines.join('\n') };
  }

  function stateFrom(input) {
    if (input && input.snapshot && typeof input.snapshot === 'object') {
      return { state: input.snapshot, record: input };
    }
    return { state: input || {}, record: null };
  }

  function totals(state) {
    if (typeof window.calc === 'function') {
      try { return window.calc(state); } catch (_) {}
    }
    const items = Array.isArray(state.items) ? state.items : [];
    const subtotal = items.reduce((sum, item) => sum + number(item.q || 1) * number(item.p), 0);
    const discount = number(state.doc && state.doc.discountVal);
    const taxRate = number(state.doc && state.doc.taxRate);
    const tax = (subtotal - discount) * taxRate / 100;
    return { sub: round2(subtotal), disc: round2(discount), tax: round2(tax), grand: round2(subtotal - discount + tax) };
  }

  function toPayload(input) {
    const pair = stateFrom(input);
    const state = pair.state || {};
    const record = pair.record || {};
    const doc = state.doc || {};
    const client = state.client || {};
    const company = state.company || {};
    const totalsValue = totals(state);
    const items = (Array.isArray(state.items) ? state.items : []).map((item, index) => {
      const parts = splitDescription(item.d);
      const quantity = number(item.q || 1);
      const unitPrice = number(item.p);
      return {
        itemId: clean(item.id) || `${clean(record.id || state.docId)}-${index + 1}`,
        no: item.no == null ? index + 1 : item.no,
        description: parts.description,
        scopeRemarks: parts.scopeRemarks,
        quantity,
        unit: clean(item.unit) || 'unit',
        unitPrice: round2(unitPrice),
        totalPrice: round2(item.totalPrice == null ? quantity * unitPrice : item.totalPrice)
      };
    });
    return {
      quotationId: clean(record.id || state.docId) || `local-${Date.now().toString(36)}`,
      quotationNo: clean(doc.no),
      type: clean(state.type) || 'quotation',
      project: clean(doc.project || state.project || doc.ref),
      reference: clean(doc.ref),
      company: { name: clean(company.name), registrationNumber: clean(company.reg), address: clean(company.address) },
      client: { name: clean(client.name), attention: clean(client.attn), email: clean(client.email), phone: clean(client.phone), address: clean(client.address) },
      document: { date: clean(doc.date), dueDate: clean(doc.due), currency: clean(doc.currency) || 'MYR', paymentTerms: clean(doc.payTerms), paymentMethod: clean(doc.method), transactionReference: clean(doc.txn) },
      items,
      totals: { subtotal: round2(totalsValue.sub), discount: round2(totalsValue.disc), tax: round2(totalsValue.tax), taxRate: number(doc.taxRate), deposit: round2(totalsValue.paid || doc.deposit), grandTotal: round2(totalsValue.grand) },
      notes: clean(state.notes),
      terms: clean(state.termsText),
      bank: { bank: clean(state.bank && state.bank.bank), accountName: clean(state.bank && state.bank.name), accountNumber: clean(state.bank && state.bank.no) },
      status: clean(record.status) || 'Draft',
      updatedAt: new Date().toISOString()
    };
  }

  async function request(action, data) {
    const cfg = config();
    if (!cfg.endpoint) throw new Error('Apps Script endpoint is not configured.');
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), cfg.timeoutMs) : null;
    try {
      const response = await fetch(cfg.endpoint, {
        method: 'POST',
        // text/plain avoids a CORS preflight for a deployed Apps Script web app.
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action, data }),
        signal: controller ? controller.signal : undefined
      });
      const text = await response.text();
      let result;
      try { result = JSON.parse(text); } catch (_) { throw new Error('Apps Script returned invalid JSON.'); }
      if (!response.ok || result.ok === false) throw new Error(result.error || `Apps Script request failed (${response.status}).`);
      return result;
    } finally { if (timer) clearTimeout(timer); }
  }

  async function saveDocument(input, options) {
    const payload = toPayload(input);
    const opts = options || {};
    if (!config().endpoint || config().enabled === false) {
      return { ok: false, skipped: true, payload, message: 'Google sync is not configured.' };
    }
    try {
      const result = await request('saveQuotation', payload);
      removeQueued(payload.quotationId);
      return Object.assign({ ok: true, synced: true, payload }, result);
    } catch (error) {
      enqueue(payload, error.message);
      if (opts.throwOnError) throw error;
      return { ok: false, synced: false, queued: true, payload, error: error.message };
    }
  }

  function enqueue(payload, error) {
    const items = queue().filter(item => item.payload.quotationId !== payload.quotationId);
    items.push({ payload, error: clean(error), queuedAt: new Date().toISOString() });
    setQueue(items);
  }
  function removeQueued(id) { setQueue(queue().filter(item => item.payload.quotationId !== id)); }
  async function retry() {
    const pending = queue().slice();
    const results = [];
    for (const item of pending) {
      try { results.push(await request('saveQuotation', item.payload)); removeQueued(item.payload.quotationId); }
      catch (error) { results.push({ ok: false, quotationId: item.payload.quotationId, error: error.message }); }
    }
    return results;
  }
  async function health() { return request('health', {}); }

  return { config, saveConfig, toPayload, saveDocument, retry, health, pending: queue };
})();
