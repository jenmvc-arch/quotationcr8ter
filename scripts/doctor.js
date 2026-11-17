'use strict';

const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const checks = [
  ['Node runtime', Number(process.versions.node.split('.')[0]) >= 22],
  ['Local demo entry', fs.existsSync(path.join(root, 'index.html'))],
  ['Apps Script manifest template', fs.existsSync(path.join(root, 'src/gas/appsscript.json'))],
  ['Configuration template', fs.existsSync(path.join(root, '.env.example'))],
];
checks.forEach(([name, ok]) => process.stdout.write(`${ok ? 'OK' : 'MISSING'} ${name}\n`));
process.exit(checks.every(([, ok]) => ok) ? 0 : 1);
