'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'assistant.js'), 'utf8');
const parserSource = source.slice(0, source.indexOf('\nlet assistantResult='));
const defaultProfile = {
  company: { name: 'Default Company', reg: 'Default Reg', address: 'Default Address' },
  bank: { bank: 'Default Bank', name: 'Default Account', no: '123456' },
  logo: 'default-logo.png',
};
function merge(target, source) {
  Object.keys(source || {}).forEach(key => {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key]) &&
        target[key] && typeof target[key] === 'object' && !Array.isArray(target[key])) {
      merge(target[key], source[key]);
    } else {
      target[key] = source[key];
    }
  });
  return target;
}
const context = {
  NL: '\n',
  TYPES: { invoice: { dueDays: 30 } },
  defaultState: () => ({
    company: { name: 'Built-in Company' },
    bank: { bank: 'Built-in Bank' },
    logo: '',
    doc: {},
    items: [],
    notes: '',
    termsText: '',
  }),
  companySavedProfile: () => ({ company: { ...defaultProfile.company }, bank: { ...defaultProfile.bank }, logo: defaultProfile.logo }),
  merge,
  today: () => '2026-11-13',
  addDays: date => date,
  freeNo: () => 'INV-2026-0001',
};
vm.runInNewContext(parserSource + '\nglobalThis.parser = Assistant;', context);

const result = context.parser.parse([
  'Quotation No.: SRWK-QT-2026-001',
  'Date: 6 November 2026',
  'Prepared For: Sarawak Museum Department',
  'No.\tDescription\tQty\tAmount (RM)',
  '1\tCustom 1:25 Temuai Boat Replica\t1 unit\t1,200.00',
  '2\tCustom Miniature Human Figures\t4 units\t1,600.00',
  '3\tLarge & Small Timber Planks\t6 pcs\t300.00',
  '4\tCustom Diorama Base\t1 set\t700.00',
  '5\tFinal Assembly\t1 lot\t400.00',
  'TOTAL QUOTATION\t\tRM4,200.00',
  'SCOPE OF WORK',
  '1. Custom 1:25 Temuai Boat Replica',
  '• Hand-finished miniature.',
].join('\n'));

assert.equal(result.client.name, 'Sarawak Museum Department');
assert.equal(result.items.length, 5);
assert.deepEqual(Array.from(result.items, item => item.q), [1, 4, 6, 1, 1]);
assert.deepEqual(Array.from(result.items, item => item.p), [1200, 400, 50, 700, 400]);
assert.deepEqual(Array.from(result.items, item => item.total), [1200, 1600, 300, 700, 400]);
assert.equal(result.meta.total, 4200);
assert.match(result.items[0].d, /Custom 1:25 Temuai Boat Replica\n- Hand-finished miniature\./);

const explicitPrice = context.parser.parse('QUOTATION DETAILS\n1 | Replica | 4 units | RM 400.00 | RM 1,600.00');
assert.equal(explicitPrice.items[0].p, 400);
assert.equal(explicitPrice.items[0].total, 1600);

const imported = context.parser.toState({
  type: 'invoice',
  company: { name: 'Imported Company', reg: 'Imported Reg', address: 'Imported Address' },
  bank: { bank: 'Imported Bank', name: 'Imported Account', no: '999999' },
  logo: 'imported-logo.png',
  doc: {},
  items: [{ d: 'Imported item', q: 1, p: 100 }],
});
assert.deepEqual(JSON.parse(JSON.stringify(imported.company)), defaultProfile.company);
assert.deepEqual(JSON.parse(JSON.stringify(imported.bank)), defaultProfile.bank);
assert.equal(imported.logo, defaultProfile.logo);
console.log('Assistant parser regression checks passed.');
