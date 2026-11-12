'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'assistant.js'), 'utf8');
const parserSource = source.slice(0, source.indexOf('\nlet assistantResult='));
const context = { NL: '\n' };
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
console.log('Assistant parser regression checks passed.');
